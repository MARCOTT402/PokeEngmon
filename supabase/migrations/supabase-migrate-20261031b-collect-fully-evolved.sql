-- ============================================================
-- Migration 20261031b：完全進化後可再收集同鏈寵（集齊伊貝分支）
--
-- 規則：同一條鏈嘅所有 entry 都完全進化（is_final = true）之後，
-- 再捕捉／抽中同一條鏈 → 開一個全新 stage 1 entry，而唔係 dupe EV+1。
-- 仲有未完全進化嘅 entry → 維持舊行為（dupe 落最早嗰隻）。
--
-- is_final 由 client 喺進化完成時 PATCH 上雲（derive replay 同官方
-- 條件一致），server 唔使自己估 stage。
--
-- 基於：20261026-gen-expansion（gacha_pull(numeric,int) + gen 驗證）、
--       20261026g（obtain_capture p_ 參數名修正）
--
-- 用法：Supabase Dashboard → SQL Editor → New Query → 全段 Run
-- ============================================================

-- -------------------- 1. user_entries.is_final --------------------
alter table user_entries add column if not exists is_final boolean not null default false;

-- client 進化完成時要直寫呢一欄（cosmetic/self-harm only，同 branch 同級）
grant update (is_final) on user_entries to authenticated;

-- -------------------- 2. gacha_pull：dupe 目標改為「未完全進化」row --------------------
create or replace function gacha_pull(init_exp numeric default 0, p_gen int default 1)
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
  if p_gen is null or p_gen < 1 or p_gen > 5 then raise exception 'invalid gen'; end if;
  /* server 端解鎖驗證：唔准抽未解鎖世代（防前端改 unlockedGen） */
  if p_gen > max_unlocked_gen(uid) then raise exception 'gen locked'; end if;

  /* 原子扣 3 鑽（唔夠 → 冇 row → raise） */
  update user_account set diamonds = diamonds - 3,
    updated_at = (extract(epoch from now()) * 1000)::bigint
  where id = uid and diamonds >= 3
  returning diamonds into bal;
  if not found then raise exception 'insufficient diamonds'; end if;

  /* server 自己 roll rarity（對齊 PULL_ODDS.rare：0.80 / 0.15 / 0.05） */
  roll := random();
  if roll < 0.80 then v_rarity := 'rare';
  elsif roll < 0.95 then v_rarity := 'epic';
  else v_rarity := 'legend'; end if;

  select cr.chain_key, cr.stage1_dex into ck from chain_rarity cr
    where cr.rarity = v_rarity and cr.gen = p_gen order by random() limit 1;
  if ck is null then raise exception 'no chain for rarity % gen %', v_rarity, p_gen; end if;

  select count(*) into entry_count from user_entries where account_id = uid;

  /* dupe 目標：同鏈第一隻「未完全進化」嘅 entry（最早獲得優先）。
     全部完全進化 → 跌入下面 insert 開新 row */
  select * into ent from user_entries
    where account_id = uid and chain_key = ck.chain_key and is_final = false
    order by obtained_at asc limit 1;
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
revoke execute on function gacha_pull(numeric, int) from public, anon;
grant execute on function gacha_pull(numeric, int) to authenticated;

-- -------------------- 3. obtain_capture：同上（保留 p_ 參數名 + gen 驗證） --------------------
drop function if exists obtain_capture(text, int);

create or replace function obtain_capture(p_chain_key text, p_dex_id int)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_ck record;
  v_ent user_entries%rowtype;
  v_is_dupe boolean := false;
  v_entry_count int;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if p_dex_id is null or p_dex_id < 1 or p_dex_id > 649 then
    raise exception 'invalid dex_id';
  end if;

  select cr.chain_key, cr.stage1_dex, cr.gen into v_ck
  from chain_rarity cr
  where cr.chain_key = p_chain_key and cr.rarity = 'normal';

  if v_ck is null or v_ck.stage1_dex <> p_dex_id then
    raise exception 'chain not capturable';
  end if;

  if v_ck.gen > max_unlocked_gen(v_uid) then
    raise exception 'gen locked';
  end if;

  select count(*) into v_entry_count
  from user_entries e
  where e.account_id = v_uid;

  /* dupe 目標：同鏈第一隻「未完全進化」嘅 entry（最早獲得優先） */
  select * into v_ent
  from user_entries e
  where e.account_id = v_uid and e.chain_key = v_ck.chain_key and e.is_final = false
  order by e.obtained_at asc limit 1;

  if found then
    v_is_dupe := true;
    update user_entries e set
      ev_points = e.ev_points + 1,
      dupes = e.dupes + 1,
      stars = least(5, 1 + (e.dupes + 1) / 5),
      updated_at = (extract(epoch from now()) * 1000)::bigint
    where e.id = v_ent.id
    returning * into v_ent;
  else
    insert into user_entries(
      account_id, chain_key, stage, exp, level, ivs, evs,
      ev_points, candies, dupes, stars, active, owned_species,
      obtained_at, updated_at
    ) values (
      v_uid, v_ck.chain_key, 1, 0, 1,
      jsonb_build_object(
        'hp', floor(random()*32)::int, 'atk', floor(random()*32)::int,
        'def', floor(random()*32)::int, 'spa', floor(random()*32)::int,
        'spd', floor(random()*32)::int, 'spe', floor(random()*32)::int
      ),
      jsonb_build_object('hp',0,'atk',0,'def',0,'spa',0,'spd',0,'spe',0),
      0, 0, 0, 1, v_entry_count = 0, ARRAY[v_ck.stage1_dex::text],
      (extract(epoch from now()) * 1000)::bigint,
      (extract(epoch from now()) * 1000)::bigint
    )
    returning * into v_ent;
  end if;

  return jsonb_build_object('entry', to_jsonb(v_ent), 'is_dupe', v_is_dupe);
end;
$$;

revoke all on function obtain_capture(text, int) from public;
revoke all on function obtain_capture(text, int) from anon;
grant execute on function obtain_capture(text, int) to authenticated;

-- -------------------- 4. 叫 PostgREST 重載 schema --------------------
notify pgrst, 'reload schema';
