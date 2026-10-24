-- ============================================================
-- PokeEngmon — import_state 收緊（v106）
-- 日期：2026-10-24
--
-- 背景：篡改 export save → 本地 import → 連接新 Google 帳戶 →
-- import_state 上傳本地進度。v99 已 clamp（diamonds ≤200、
-- entries ≤200、exp ≤1.3M），但貨幣仍可過信任邊界，且無
-- rate limit / audit log，可換新 Google 帳戶無限重複。
--
-- 收緊原則：貨幣（diamonds）永遠唔接受 client 輸入；
-- 學習進度（entries/exp/SM-2）保住但貼住合法上限；
-- 每帳戶一生只 import 一次（imported_at 鎖）+ audit 表。
--
-- 執行順序注意：ALTER TABLE 加欄位必須喺引用佢嘅函數之前，
-- 否則 42703（v99 教訓）。
-- ============================================================

-- ---------- 1. user_account 加 imported_at（一次性 import 鎖） ----------
alter table user_account add column if not exists imported_at bigint;

-- ---------- 2. audit 表 user_imports（記錄每次 import 供追查濫用） ----------
create table if not exists user_imports (
  id bigint generated always as identity primary key,
  account_id uuid not null references auth.users(id) on delete cascade,
  imported_at bigint not null,
  entry_count int not null,
  diamonds_granted int not null
);

alter table user_imports enable row level security;

-- 用戶只可以讀自己嘅 import 記錄（debug 用）；寫入只經 SECURITY DEFINER 嘅 import_state
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'user_imports'
      and policyname = 'user_imports_select_own'
  ) then
    create policy user_imports_select_own on user_imports
      for select to authenticated
      using (auth.uid() = account_id);
  end if;
end $$;

-- ---------- 3. import_state 收緊版 ----------
create or replace function import_state(payload jsonb)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  acct user_account%rowtype;
  ent jsonb;
  cnt int;
  ins_count int := 0;
  e_exp numeric;
  e_ck text;
  e_iv jsonb;
  e_ev jsonb;
  stat_key text;
  e_dex int;
  c_bonus constant int := 20;          -- 固定 welcome bonus，忽略 client 傳入嘅 diamonds
begin
  if uid is null then raise exception 'not authenticated'; end if;

  select * into acct from user_account where id = uid;
  if not found then raise exception 'account not found'; end if;

  /* 一次性鎖：即使進度計數將來被歸零，import 都係每帳戶一生一次 */
  if acct.imported_at is not null then
    raise exception 'import already used';
  end if;

  select count(*) into cnt from user_entries where account_id = uid;
  if cnt > 0 or acct.total_sets > 0 or acct.diamonds > 0 then
    raise exception 'import not allowed: account already has progress';
  end if;

  /* account：diamonds 固定 20（貨幣唔過信任邊界）、totals clamp ≥ 0、
     trainer_name 長度 cap、寫入 imported_at 一次性鎖 */
  update user_account set
    diamonds = c_bonus,
    total_sets = greatest(coalesce((payload ->> 'total_sets')::int, 0), 0),
    total_correct = greatest(coalesce((payload ->> 'total_correct')::int, 0), 0),
    total_questions = greatest(coalesce((payload ->> 'total_questions')::int, 0), 0),
    trainer_name = left(coalesce(payload ->> 'trainer_name', trainer_name), 40),
    imported_at = (extract(epoch from now()) * 1000)::bigint,
    updated_at = (extract(epoch from now()) * 1000)::bigint
  where id = uid;

  /* entries：≤ 151 條（每物種一隻已係合法天花板）、exp ≤ 1,250,000
     （99 級最慢曲線 ≈1,212,874，杜絕超額 headroom）、chain 要合法、
     IV clamp 0-31、EV clamp 252/510、candies ≤ 99、dupes ≤ 100 */
  if payload ? 'entries' then
    if jsonb_array_length(payload -> 'entries') > 151 then
      raise exception 'too many entries';
    end if;
    for ent in select * from jsonb_array_elements(payload -> 'entries')
    loop
      e_ck := ent ->> 'chain_key';
      select stage1_dex into e_dex from chain_rarity where chain_key = e_ck;
      if e_dex is null then continue; end if;   -- 非法 chain 跳過

      e_exp := least(greatest(coalesce((ent ->> 'exp')::numeric, 0), 0), 1250000);

      /* IVs / EVs：逐項 clamp（IV 0-31、EV 單項 0-252），缺項補 0 */
      e_iv := '{}'::jsonb;
      e_ev := '{}'::jsonb;
      foreach stat_key in array array['hp','atk','def','spa','spd','spe']
      loop
        e_iv := jsonb_set(e_iv, array[stat_key],
          to_jsonb(least(greatest(coalesce((ent -> 'ivs' ->> stat_key)::int, 0), 0), 31)));
        e_ev := jsonb_set(e_ev, array[stat_key],
          to_jsonb(least(greatest(coalesce((ent -> 'evs' ->> stat_key)::int, 0), 0), 252)));
      end loop;

      insert into user_entries(id, account_id, chain_key, stage, exp, level, ivs, evs,
        ev_points, candies, dupes, stars, active, owned_species, branch, obtained_at, updated_at)
      values (
        coalesce((ent ->> 'id')::uuid, gen_random_uuid()),
        uid, e_ck, 1, e_exp, 1, e_iv, e_ev,
        least(greatest(coalesce((ent ->> 'ev_points')::int, 0), 0), 510),
        least(greatest(coalesce((ent ->> 'candies')::int, 0), 0), 99),
        least(greatest(coalesce((ent ->> 'dupes')::int, 0), 0), 100),
        1, coalesce((ent ->> 'active')::boolean, false), ARRAY[e_dex::text],
        (ent ->> 'branch')::smallint,
        coalesce((ent ->> 'obtained_at')::bigint, (extract(epoch from now()) * 1000)::bigint),
        (extract(epoch from now()) * 1000)::bigint
      )
      on conflict (id) do nothing;

      if found then ins_count := ins_count + 1; end if;
    end loop;
  end if;

  /* audit log：記低今次 import 供日後追查濫用 */
  insert into user_imports(account_id, imported_at, entry_count, diamonds_granted)
  values (uid, (extract(epoch from now()) * 1000)::bigint, ins_count, c_bonus);

  return true;
end;
$$;

-- 權限收尾：只有已登入用戶可以執行（v99 規則）
revoke execute on function import_state(jsonb) from public, anon;
grant execute on function import_state(jsonb) to authenticated;
