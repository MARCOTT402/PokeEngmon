-- ============================================================
-- PokeEngmon — 10 連抽保底 RPC（gacha_pull_lucky）
-- 2026-11-04
--
-- 用途：Lucky Draw 10 連嘅第 10 抽（前 9 抽照用 gacha_pull）。
--   1) 原子扣 3 鑽（同 gacha_pull 一致）
--   2) 50/50 決定 legend / epic
--   3) 優先抽「未持有」嘅鏈（user_entries 冇同 chain_key）
--   4) 該稀有度全部已持有 → 轉另一個稀有度 → 任何稀有度未持有
--      → 最後全部持有先用 dupe 隨機
--
-- Rule 9：參數 p_ 前綴、變數 v_ 前綴、欄位用表別名限定。
-- ============================================================

create or replace function gacha_pull_lucky(p_gen int default 1)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_bal int;
  v_kind text;
  v_other text;
  v_rarity text;
  ck record;
  ent user_entries%rowtype;
  v_is_dupe boolean := false;
  v_entry_count int;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if p_gen is null or p_gen < 1 or p_gen > 5 then raise exception 'invalid gen'; end if;
  if p_gen > max_unlocked_gen(v_uid) then raise exception 'gen locked'; end if;

  /* 原子扣 3 鑽（唔夠 → 冇 row → raise） */
  update user_account set diamonds = diamonds - 3,
    updated_at = (extract(epoch from now()) * 1000)::bigint
  where id = v_uid and diamonds >= 3
  returning diamonds into v_bal;
  if not found then raise exception 'insufficient diamonds'; end if;

  /* 保底 50/50：legend / epic */
  v_kind := case when random() < 0.5 then 'legend' else 'epic' end;
  v_other := case when v_kind = 'legend' then 'epic' else 'legend' end;

  /* 1) 指定稀有度 + 未持有 */
  select cr.chain_key, cr.stage1_dex, cr.rarity into ck
    from chain_rarity cr
    where cr.gen = p_gen and cr.rarity = v_kind
      and not exists (
        select 1 from user_entries ue
        where ue.account_id = v_uid and ue.chain_key = cr.chain_key
      )
    order by random() limit 1;

  /* 2) 另一個稀有度 + 未持有 */
  if ck is null then
    select cr.chain_key, cr.stage1_dex, cr.rarity into ck
      from chain_rarity cr
      where cr.gen = p_gen and cr.rarity = v_other
        and not exists (
          select 1 from user_entries ue
          where ue.account_id = v_uid and ue.chain_key = cr.chain_key
        )
      order by random() limit 1;
  end if;

  /* 3) 任何抽獎稀有度 + 未持有（rare 包底，保證係新寵）
     注意：chain_rarity 仲有 'normal' 列（普通抽用），唔可以納入呢度
     —— client GACHA_BALL 只識 rare/epic/legend。 */
  if ck is null then
    select cr.chain_key, cr.stage1_dex, cr.rarity into ck
      from chain_rarity cr
      where cr.gen = p_gen and cr.rarity in ('rare', 'epic', 'legend')
        and not exists (
          select 1 from user_entries ue
          where ue.account_id = v_uid and ue.chain_key = cr.chain_key
        )
      order by random() limit 1;
  end if;

  /* 4) 圖鑑已滿 → 指定稀有度隨機（當 dupe） */
  if ck is null then
    select cr.chain_key, cr.stage1_dex, cr.rarity into ck
      from chain_rarity cr
      where cr.gen = p_gen and cr.rarity = v_kind
      order by random() limit 1;
  end if;

  if ck is null then raise exception 'no chain for gen %', p_gen; end if;
  v_rarity := ck.rarity;

  select count(*) into v_entry_count from user_entries where account_id = v_uid;

  select * into ent from user_entries
    where account_id = v_uid and chain_key = ck.chain_key;
  if found then
    /* 重複：EV+1、糖果+1、dupes+1、stars 重計 */
    v_is_dupe := true;
    update user_entries set
      ev_points = ev_points + 1,
      dupes = dupes + 1,
      candies = candies + 1,
      stars = least(5, 1 + (dupes + 1) / 5),
      updated_at = (extract(epoch from now()) * 1000)::bigint
    where id = ent.id
    returning * into ent;
  else
    insert into user_entries(account_id, chain_key, stage, exp, level, ivs, evs,
      ev_points, candies, dupes, stars, active, owned_species, obtained_at, updated_at)
    values (v_uid, ck.chain_key, 1, 0, 1,
      jsonb_build_object('hp', floor(random()*32)::int, 'atk', floor(random()*32)::int,
        'def', floor(random()*32)::int, 'spa', floor(random()*32)::int,
        'spd', floor(random()*32)::int, 'spe', floor(random()*32)::int),
      jsonb_build_object('hp',0,'atk',0,'def',0,'spa',0,'spd',0,'spe',0),
      0, 0, 0, 1, v_entry_count = 0, ARRAY[ck.stage1_dex::text],
      (extract(epoch from now()) * 1000)::bigint, (extract(epoch from now()) * 1000)::bigint)
    returning * into ent;
  end if;

  return jsonb_build_object('entry', to_jsonb(ent), 'rarity', v_rarity,
    'is_dupe', v_is_dupe, 'balance', v_bal);
end;
$$;

revoke execute on function gacha_pull_lucky(int) from public, anon;
grant execute on function gacha_pull_lucky(int) to authenticated;
