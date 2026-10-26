-- ============================================================
-- PokeEngmon — 修復 gacha_pull 400（v108）
-- 日期：2026-10-24
--
-- 根因：v99 gacha_pull 入面 `where rarity = rarity` 撞名——
-- plpgsql 變數 `rarity` 同 chain_rarity 欄位 `rarity` 同名，
-- Postgres 預設 plpgsql.variable_conflict = error，
-- 每次呼叫都抛 42702「column reference "rarity" is ambiguous」
-- → PostgREST 回 400 → 前端行本地 fallback（所以抽獎睇落正常
-- 但 Supabase 永遠冇 update）。
--
-- 修法：變數改名 v_rarity，欄位用 cr. 前綴限定（同
-- obtain_capture 嘅 `cr.rarity = 'normal'` 寫法對齊）。
-- 其餘邏輯（扣鑽、稀有度、dupe 處理、init_exp clamp）一字不改。
-- ============================================================

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
  v_rarity text;
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

  /* server 自己 roll rarity（對齊 PULL_ODDS.rare：0.80 / 0.15 / 0.05）
     注意：變數改名 v_rarity，避免同 chain_rarity.rarity 撞名（42702） */
  roll := random();
  if roll < 0.80 then v_rarity := 'rare';
  elsif roll < 0.95 then v_rarity := 'epic';
  else v_rarity := 'legend'; end if;

  select cr.chain_key, cr.stage1_dex into ck from chain_rarity cr
    where cr.rarity = v_rarity order by random() limit 1;
  if ck is null then raise exception 'no chain for rarity %', v_rarity; end if;

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

  return jsonb_build_object('entry', to_jsonb(ent), 'rarity', v_rarity,
    'is_dupe', is_dupe, 'balance', bal);
end;
$$;
revoke execute on function gacha_pull(numeric) from public, anon;
grant execute on function gacha_pull(numeric) to authenticated;
