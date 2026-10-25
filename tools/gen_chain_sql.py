#!/usr/bin/env python3
"""由 js/gens-data.js 生成 supabase-migrate-20261026-gen-expansion.sql。

內容：
1. chain_rarity 加 gen 欄（舊 Gen 1 rows default 1）
2. Gen 2-5 共 299 條鏈 insert
3. max_unlocked_gen(uid) helper
4. gacha_pull 加 p_gen 參數（drop 舊簽名避免 overload 撞 default）
5. obtain_capture 放寬 dex 上限 151 -> 649 + gen 解鎖驗證
"""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
GENS_JS = ROOT / "js" / "gens-data.js"
OUT = ROOT / "supabase-migrate-20261026-gen-expansion.sql"

text = GENS_JS.read_text(encoding="utf-8")
m = re.search(r"const EVOLUTION_CHAINS_G25 = (\[.*\]);\s*$", text, re.S)
if not m:
    raise SystemExit("EVOLUTION_CHAINS_G25 not found")
chains = json.loads(m.group(1))

rows = []
for c in chains:
    key = c["key"]
    gen = c["gen"]
    rarity = c["baseRarity"]
    stage1_dex = c["stages"][0][0]
    rows.append(f"  ('{key}','{rarity}',{stage1_dex},{gen})")

insert_block = ",\n".join(rows)

sql = f"""-- ============================================================
-- Migration 20261026：Gen 2-5 世代擴充（v127）
--
-- 1. chain_rarity 加 gen 欄（舊 Gen 1 rows default 1）
-- 2. 插入 Gen 2-5 共 {len(rows)} 條鏈（由 tools/gen_chain_sql.py 生成）
-- 3. max_unlocked_gen(uid) helper：逐代檢查該代全鏈齊先開下代
-- 4. gacha_pull 加 p_gen：池 filter gen + server 端解鎖驗證
--    （舊簽名 gacha_pull(numeric) 必須 drop，否則 default 參數
--      會同新簽名撞 overload → PostgREST 300 ambiguous）
-- 5. obtain_capture 放寬 dex 上限 151 → 649 + gen 解鎖驗證
-- ============================================================

alter table chain_rarity add column if not exists gen int not null default 1;

insert into chain_rarity (chain_key, rarity, stage1_dex, gen) values
{insert_block}
on conflict (chain_key) do nothing;

-- ---------- max_unlocked_gen：該用戶最高已解鎖世代 ----------
create or replace function max_unlocked_gen(p_uid uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_gen int := 1;
  v_missing int;
begin
  while v_gen < 5 loop
    select count(*) into v_missing
      from chain_rarity cr
      where cr.gen = v_gen
        and not exists (
          select 1 from user_entries ue
          where ue.account_id = p_uid and ue.chain_key = cr.chain_key
        );
    exit when v_missing > 0;
    v_gen := v_gen + 1;
  end loop;
  return v_gen;
end;
$$;
revoke execute on function max_unlocked_gen(uuid) from public, anon;
grant execute on function max_unlocked_gen(uuid) to authenticated;

-- ---------- gacha_pull：舊簽名要 drop（default 參數撞 overload） ----------
drop function if exists gacha_pull(numeric);

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
revoke execute on function gacha_pull(numeric, int) from public, anon;
grant execute on function gacha_pull(numeric, int) to authenticated;

-- ---------- obtain_capture：放寬 dex 上限 + gen 解鎖驗證 ----------
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
  if dex_id is null or dex_id < 1 or dex_id > 649 then raise exception 'invalid dex_id'; end if;

  select cr.chain_key, cr.stage1_dex, cr.gen into ck from chain_rarity cr
    where cr.chain_key = obtain_capture.chain_key and cr.rarity = 'normal';
  if ck is null or ck.stage1_dex <> dex_id then
    raise exception 'chain not capturable';
  end if;
  /* 捕捉池同樣受世代解鎖限制（防前端繞過 pullablePool 直call） */
  if ck.gen > max_unlocked_gen(uid) then raise exception 'gen locked'; end if;

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
"""

OUT.write_text(sql, encoding="utf-8")
print(f"wrote {OUT.name}: {len(rows)} chain rows")
