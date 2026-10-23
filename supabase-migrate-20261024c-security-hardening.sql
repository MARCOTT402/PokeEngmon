-- ============================================================
-- Migration 20261024c：安全硬化（v99）
--
-- 修復 4 個 HIGH 漏洞：
-- 1. user_account FOR ALL → 登入用戶可直接 PATCH diamonds
-- 2. user_entries exp/level/candies 可直接寫
-- 3. 三個 SECURITY DEFINER RPC 唔驗證 auth.uid()、冇 REVOKE EXECUTE
-- 4. account_anon_insert_any + migrate rekey → 匿名假數據洗入真帳號
--
-- 方向：diamonds / entries 敏感欄收歸 RPC 權威（auth.uid() + clamp），
-- 匿名角色完全斷網（前端匿名本來就唔 sync）。
--
-- 用法：Supabase Dashboard → SQL Editor → New Query → 全段 Run
-- ============================================================

-- -------------------- 0. 殺舊 function（舊 signature 必須逐個 drop） --------------------
drop function if exists award_round_diamonds(uuid, int, int);
drop function if exists settle_capture(uuid, int, int);
drop function if exists migrate_anonymous_to_auth(uuid, text);

-- -------------------- 1. 殺晒 anon policy（保留 5 個 *_auth_rw FOR ALL） --------------------
drop policy if exists "account_anon_rw" on user_account;
drop policy if exists "account_anon_insert_any" on user_account;
drop policy if exists "entries_anon_rw" on user_entries;
drop policy if exists "cards_anon_rw" on user_cards;
drop policy if exists "history_anon_rw" on user_history;
drop policy if exists "captures_anon_rw" on user_captures;

-- -------------------- 2. Table privileges --------------------
-- RLS 管 row、privilege 管 column/verb，兩層疊加
revoke all on user_account, user_entries, user_cards, user_history, user_captures from anon;

revoke all on user_account from authenticated;
grant select on user_account to authenticated;
grant update (trainer_name, updated_at) on user_account to authenticated;

revoke all on user_entries from authenticated;
grant select on user_entries to authenticated;
-- active = 拍檔切換；branch = 伊貝分支一經進化隨機決定後要落 DB（否則 pull 重推唔返）；
-- 兩者都係 cosmetic/self-harm only，可以直寫
grant update (active, updated_at, branch) on user_entries to authenticated;

revoke all on user_cards from authenticated;
grant select, insert, update on user_cards to authenticated;   -- SM-2 upsert 照舊（學習數據，非貨幣）

revoke all on user_history from authenticated;
grant select, insert on user_history to authenticated;

revoke all on user_captures from authenticated;
grant select on user_captures to authenticated;                -- insert 只經 settle_capture RPC

alter table user_entries add column if not exists branch smallint;

-- -------------------- 3. chain_rarity 靜態表（同 js/data.js EVOLUTION_CHAINS 對齊） --------------------
create table if not exists chain_rarity (
  chain_key text primary key,
  rarity text not null,
  stage1_dex int not null
);

insert into chain_rarity (chain_key, rarity, stage1_dex) values
  -- normal（捕捉池）
  ('bulbasaur','normal',1), ('charmander','normal',4), ('squirtle','normal',7),
  ('caterpie','normal',10), ('weedle','normal',13), ('pidgey','normal',16),
  ('rattata','normal',19), ('spearow','normal',21), ('ekans','normal',23),
  ('sandshrew','normal',27), ('nidoranf','normal',29), ('nidoranm','normal',32),
  ('jigglypuff','normal',39), ('zubat','normal',41), ('oddish','normal',43),
  ('paras','normal',46), ('venonat','normal',48), ('diglett','normal',50),
  ('meowth','normal',52), ('psyduck','normal',54), ('mankey','normal',56),
  ('poliwag','normal',60), ('machop','normal',66), ('bellsprout','normal',69),
  ('tentacool','normal',72), ('geodude','normal',74), ('slowpoke','normal',79),
  ('magnemite','normal',81), ('doduo','normal',84), ('seel','normal',86),
  ('grimer','normal',88), ('shellder','normal',90), ('drowzee','normal',96),
  ('krabby','normal',98), ('voltorb','normal',100), ('exeggcute','normal',102),
  ('cubone','normal',104), ('koffing','normal',109), ('horsea','normal',116),
  ('goldeen','normal',118), ('staryu','normal',120), ('magikarp','normal',129),
  -- rare
  ('pikachu','rare',25), ('clefairy','rare',35), ('vulpix','rare',37),
  ('growlithe','rare',58), ('abra','rare',63), ('ponyta','rare',77),
  ('farfetchd','rare',83), ('gastly','rare',92), ('onix','rare',95),
  ('hitmonlee','rare',106), ('hitmonchan','rare',107), ('lickitung','rare',108),
  ('rhyhorn','rare',111), ('chansey','rare',113), ('tangela','rare',114),
  ('kangaskhan','rare',115), ('mrmime','rare',122), ('scyther','rare',123),
  ('jynx','rare',124), ('electabuzz','rare',125), ('magmar','rare',126),
  ('pinsir','rare',127), ('tauros','rare',128), ('ditto','rare',132),
  ('eevee','rare',133), ('porygon','rare',137),
  -- epic
  ('omanyte','epic',138), ('kabuto','epic',140), ('aerodactyl','epic',142),
  ('lapras','epic',131), ('snorlax','epic',143), ('dratini','epic',147),
  -- legend
  ('articuno','legend',144), ('zapdos','legend',145), ('moltres','legend',146),
  ('mewtwo','legend',150), ('mew','legend',151)
on conflict (chain_key) do nothing;

revoke all on chain_rarity from anon, authenticated;

-- ============================================================
-- 4. 硬化 RPC（全部 security definer + auth.uid() + clamp + revoke/grant execute）
-- ============================================================

-- ---------- 4.1 回合結算鑽石：server 計 bonus，balance 做前端權威 ----------
create or replace function award_round_diamonds(score int, total int)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  bonus int;
  bal int;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  if total is null or score is null or total < 1 or total > 50 or score < 0 or score > total then
    raise exception 'invalid score/total';
  end if;

  if score = total then bonus := 3;
  elsif score >= total - 2 then bonus := 2;
  elsif score >= total - 3 then bonus := 1;
  else bonus := 0;
  end if;

  update user_account set
    diamonds = diamonds + bonus,
    total_sets = total_sets + 1,
    total_correct = total_correct + score,
    total_questions = total_questions + total,
    updated_at = (extract(epoch from now()) * 1000)::bigint
  where id = uid
  returning diamonds into bal;

  if not found then raise exception 'account not found'; end if;
  return jsonb_build_object('bonus', bonus, 'balance', bal);
end;
$$;
revoke execute on function award_round_diamonds(int, int) from public, anon;
grant execute on function award_round_diamonds(int, int) to authenticated;

-- ---------- 4.2 稀有抽：server 原子扣鑽 + roll rarity + 派寵 ----------
create or replace function gacha_pull(init_exp numeric default 0)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  bal int;
  roll numeric;
  rarity text;
  ck record;
  ent user_entries%rowtype;
  is_dupe boolean := false;
  entry_count int;
  start_exp numeric := 0;
begin
  if uid is null then raise exception 'not authenticated'; end if;

  /* 原子扣 3 鑽（唔夠 → 冇 row → raise） */
  update user_account set diamonds = diamonds - 3,
    updated_at = (extract(epoch from now()) * 1000)::bigint
  where id = uid and diamonds >= 3
  returning diamonds into bal;
  if not found then raise exception 'insufficient diamonds'; end if;

  /* server 自己 roll rarity（對齊 PULL_ODDS.rare：0.80 / 0.15 / 0.05） */
  roll := random();
  if roll < 0.80 then rarity := 'rare';
  elsif roll < 0.95 then rarity := 'epic';
  else rarity := 'legend'; end if;

  select chain_key, stage1_dex into ck from chain_rarity
    where rarity = rarity order by random() limit 1;
  if ck is null then raise exception 'no chain for rarity %', rarity; end if;

  select count(*) into entry_count from user_entries where account_id = uid;

  select * into ent from user_entries where account_id = uid and chain_key = ck.chain_key;
  if found then
    /* 重複：EV+1、糖果+1、dupes+1、stars 重計 */
    is_dupe := true;
    update user_entries set
      ev_points = ev_points + 1,
      dupes = dupes + 1,
      candies = candies + 1,
      stars = least(5, 1 + (dupes + 1) / 5),
      updated_at = (extract(epoch from now()) * 1000)::bigint
    where id = ent.id
    returning * into ent;
  else
    /* init_exp 只限帳號第一隻（對應 pendingExp），clamp ≤ 5000 */
    if entry_count = 0 and init_exp is not null then
      start_exp := least(greatest(init_exp, 0), 5000);
    end if;
    insert into user_entries(account_id, chain_key, stage, exp, level, ivs, evs,
      ev_points, candies, dupes, stars, active, owned_species, obtained_at, updated_at)
    values (uid, ck.chain_key, 1, start_exp, 1,
      jsonb_build_object('hp', floor(random()*32)::int, 'atk', floor(random()*32)::int,
        'def', floor(random()*32)::int, 'spa', floor(random()*32)::int,
        'spd', floor(random()*32)::int, 'spe', floor(random()*32)::int),
      jsonb_build_object('hp',0,'atk',0,'def',0,'spa',0,'spd',0,'spe',0),
      0, 0, 0, 1, entry_count = 0, ARRAY[ck.stage1_dex::text],
      (extract(epoch from now()) * 1000)::bigint, (extract(epoch from now()) * 1000)::bigint)
    returning * into ent;
  end if;

  return jsonb_build_object('entry', to_jsonb(ent), 'rarity', rarity,
    'is_dupe', is_dupe, 'balance', bal);
end;
$$;
revoke execute on function gacha_pull(numeric) from public, anon;
grant execute on function gacha_pull(numeric) to authenticated;

-- ---------- 4.3 捕捉獲得：只限 normal 稀有度 ----------
create or replace function obtain_capture(chain_key text, dex_id int)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  ck record;
  ent user_entries%rowtype;
  is_dupe boolean := false;
  entry_count int;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  if dex_id is null or dex_id < 1 or dex_id > 151 then raise exception 'invalid dex_id'; end if;

  select cr.chain_key, cr.stage1_dex into ck from chain_rarity cr
    where cr.chain_key = obtain_capture.chain_key and cr.rarity = 'normal';
  if ck is null or ck.stage1_dex <> dex_id then
    raise exception 'chain not capturable';
  end if;

  select count(*) into entry_count from user_entries where account_id = uid;

  select * into ent from user_entries where account_id = uid and chain_key = ck.chain_key;
  if found then
    is_dupe := true;
    update user_entries set
      ev_points = ev_points + 1,
      dupes = dupes + 1,
      stars = least(5, 1 + (dupes + 1) / 5),
      updated_at = (extract(epoch from now()) * 1000)::bigint
    where id = ent.id
    returning * into ent;
  else
    insert into user_entries(account_id, chain_key, stage, exp, level, ivs, evs,
      ev_points, candies, dupes, stars, active, owned_species, obtained_at, updated_at)
    values (uid, ck.chain_key, 1, 0, 1,
      jsonb_build_object('hp', floor(random()*32)::int, 'atk', floor(random()*32)::int,
        'def', floor(random()*32)::int, 'spa', floor(random()*32)::int,
        'spd', floor(random()*32)::int, 'spe', floor(random()*32)::int),
      jsonb_build_object('hp',0,'atk',0,'def',0,'spa',0,'spd',0,'spe',0),
      0, 0, 0, 1, entry_count = 0, ARRAY[ck.stage1_dex::text],
      (extract(epoch from now()) * 1000)::bigint, (extract(epoch from now()) * 1000)::bigint)
    returning * into ent;
  end if;

  return jsonb_build_object('entry', to_jsonb(ent), 'is_dupe', is_dupe);
end;
$$;
revoke execute on function obtain_capture(text, int) from public, anon;
grant execute on function obtain_capture(text, int) to authenticated;

-- ---------- 4.4 加 EXP（quiz 回合 / powerup batch / 餵糖以外） ----------
create or replace function add_entry_exp(entry_id uuid, delta numeric)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  new_exp numeric;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  if delta is null or delta <= 0 or delta > 10000 then raise exception 'invalid delta'; end if;

  update user_entries set exp = exp + delta,
    updated_at = (extract(epoch from now()) * 1000)::bigint
  where id = entry_id and account_id = uid
  returning exp into new_exp;
  if not found then raise exception 'entry not found'; end if;
  return new_exp;
end;
$$;
revoke execute on function add_entry_exp(uuid, numeric) from public, anon;
grant execute on function add_entry_exp(uuid, numeric) to authenticated;

-- ---------- 4.5 餵糖：扣糖 + 加 EXP（exp_delta 由前端按 levelSpan 計，clamp 40k/粒） ----------
create or replace function use_entry_candy(entry_id uuid, count int, exp_delta numeric)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  ent user_entries%rowtype;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  if count is null or count < 1 or count > 50 then raise exception 'invalid count'; end if;
  if exp_delta is null or exp_delta <= 0 or exp_delta > 40000 * count then
    raise exception 'invalid exp_delta';
  end if;

  update user_entries set
    candies = candies - count,
    exp = exp + exp_delta,
    updated_at = (extract(epoch from now()) * 1000)::bigint
  where id = entry_id and account_id = uid and candies >= count
  returning * into ent;
  if not found then raise exception 'not enough candies or entry not found'; end if;
  return jsonb_build_object('candies', ent.candies, 'exp', ent.exp);
end;
$$;
revoke execute on function use_entry_candy(uuid, int, numeric) from public, anon;
grant execute on function use_entry_candy(uuid, int, numeric) to authenticated;

-- ---------- 4.6 分配 EV 點 ----------
create or replace function alloc_ev(entry_id uuid, stat text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  ent user_entries%rowtype;
  cur int;
  total int;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  if stat not in ('hp','atk','def','spa','spd','spe') then raise exception 'invalid stat'; end if;

  select * into ent from user_entries where id = entry_id and account_id = uid;
  if not found then raise exception 'entry not found'; end if;
  if ent.ev_points <= 0 then raise exception 'no ev points'; end if;

  cur := coalesce((ent.evs ->> stat)::int, 0);
  total := (select coalesce(sum((value)::int), 0) from jsonb_each_text(ent.evs));
  if cur >= 252 or total >= 510 then raise exception 'ev cap reached'; end if;

  update user_entries set
    evs = jsonb_set(evs, array[stat], to_jsonb(cur + 1)),
    ev_points = ev_points - 1,
    updated_at = (extract(epoch from now()) * 1000)::bigint
  where id = ent.id
  returning * into ent;
  return jsonb_build_object('evs', ent.evs, 'ev_points', ent.ev_points);
end;
$$;
revoke execute on function alloc_ev(uuid, text) from public, anon;
grant execute on function alloc_ev(uuid, text) to authenticated;

-- ---------- 4.7 首次 connect 一次性 bootstrap（guard：全新帳號先用得） ----------
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
  e_exp numeric;
  e_ck text;
  e_iv jsonb;
  e_ev jsonb;
  stat_key text;
  e_dex int;
begin
  if uid is null then raise exception 'not authenticated'; end if;

  select * into acct from user_account where id = uid;
  if not found then raise exception 'account not found'; end if;

  select count(*) into cnt from user_entries where account_id = uid;
  if cnt > 0 or acct.total_sets > 0 or acct.diamonds > 0 then
    raise exception 'import not allowed: account already has progress';
  end if;

  /* account：diamonds cap 200、totals clamp ≥ 0、trainer_name 長度 cap */
  update user_account set
    diamonds = least(greatest(coalesce((payload ->> 'diamonds')::int, 0), 0), 200),
    total_sets = greatest(coalesce((payload ->> 'total_sets')::int, 0), 0),
    total_correct = greatest(coalesce((payload ->> 'total_correct')::int, 0), 0),
    total_questions = greatest(coalesce((payload ->> 'total_questions')::int, 0), 0),
    trainer_name = left(coalesce(payload ->> 'trainer_name', trainer_name), 40),
    updated_at = (extract(epoch from now()) * 1000)::bigint
  where id = uid;

  /* entries：≤ 200 條、exp ≤ 1,300,000、chain 要合法、IV clamp 0-31、EV clamp 252/510 */
  if payload ? 'entries' then
    if jsonb_array_length(payload -> 'entries') > 200 then
      raise exception 'too many entries';
    end if;
    for ent in select * from jsonb_array_elements(payload -> 'entries')
    loop
      e_ck := ent ->> 'chain_key';
      select stage1_dex into e_dex from chain_rarity where chain_key = e_ck;
      if e_dex is null then continue; end if;   -- 非法 chain 跳過

      e_exp := least(greatest(coalesce((ent ->> 'exp')::numeric, 0), 0), 1300000);

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
        least(greatest(coalesce((ent ->> 'candies')::int, 0), 0), 999),
        least(greatest(coalesce((ent ->> 'dupes')::int, 0), 0), 999),
        1, coalesce((ent ->> 'active')::boolean, false), ARRAY[e_dex::text],
        (ent ->> 'branch')::smallint,
        coalesce((ent ->> 'obtained_at')::bigint, (extract(epoch from now()) * 1000)::bigint),
        (extract(epoch from now()) * 1000)::bigint
      )
      on conflict (id) do nothing;
    end loop;
  end if;
  return true;
end;
$$;
revoke execute on function import_state(jsonb) from public, anon;
grant execute on function import_state(jsonb) to authenticated;

-- ---------- 4.8 捕捉日誌（log-only，維持現有語義） ----------
drop function if exists settle_capture(uuid, int, int);   -- 雙保險
create or replace function settle_capture(dex_id int)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not authenticated'; end if;
  if dex_id is null or dex_id < 1 or dex_id > 151 then raise exception 'invalid dex_id'; end if;

  insert into user_captures(account_id, dex_id, success, ts, new_pokemon)
  values (uid, dex_id, true, (extract(epoch from now()) * 1000)::bigint, false);
  return jsonb_build_object('logged', true);
end;
$$;
revoke execute on function settle_capture(int) from public, anon;
grant execute on function settle_capture(int) to authenticated;

-- ---------- 4.9 Migrate：auth.uid() 自取，刪 rekey 分支 ----------
create or replace function migrate_anonymous_to_auth(old_device_id text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  existing uuid;
begin
  if uid is null then raise exception 'not authenticated'; end if;

  select id into existing from user_account where id = uid;
  if existing is not null then
    return false;   -- 舊帳戶：雲端為準（前端 pull）
  end if;

  /* 新帳戶：開空 row（diamonds 0），本地進度由 import_state 一次性上傳。
     唔再認領 device_id 匿名數據 —— 嗰條路係洗鑽入口，而且匿名本來就唔 sync。 */
  insert into user_account(id, device_id, trainer_name, updated_at)
  values (uid, null, 'The PokéEngmon Trainer', (extract(epoch from now()) * 1000)::bigint);
  return true;
end;
$$;
revoke execute on function migrate_anonymous_to_auth(text) from public, anon;
grant execute on function migrate_anonymous_to_auth(text) to authenticated;

-- -------------------- 5. 逼 PostgREST reload schema cache --------------------
select pg_notify('pgrst', 'reload schema');
