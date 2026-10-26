-- ============================================================
-- Migration 20261024：fix settle_capture chain_key issue
--
-- 問題：settle_capture 用 'dex_' || dex_id 做 chain_key，
-- 但前端 EVOLUTION_CHAINS 用嘅 key 係物種名（如 'nidoran'）。
-- 導致 pull 落嚟嘅 entry chainKey 搵唔到 chain → crash。
--
-- 修復：
-- 1. 用 owned_species @> ARRAY[dex_id] 搵現有 entry（唔再靠 chain_key）
-- 2. 避免 chain_key 格式不一致導致重複 entry
--
-- 用法：Supabase Dashboard → SQL Editor → New Query → Run
-- ============================================================

create or replace function settle_capture(account_uuid uuid, dex_id int, attempts int)
returns jsonb
language plpgsql
security definer
as $$
declare
  caught boolean;
  rand_val numeric;
  already_have boolean default false;
begin
  rand_val := random();
  caught := rand_val < least(0.95, 0.80 + attempts * 0.05);

  if caught then
    /* 用 owned_species 搵現有 entry（唔靠 chain_key，因為格式可能唔一致） */
    select exists(select 1 from user_entries
      where account_id = account_uuid and owned_species @> ARRAY[dex_id]) into already_have;

    if not already_have then
      /* 新品種：建立新 entry，chain_key 用 dex_<id>（pull 時前端會轉成正確 chain key） */
      insert into user_entries(account_id, chain_key, stage, exp, level, owned_species,
        obtained_at, updated_at)
      values (account_uuid, 'dex_' || dex_id::text, 1, 0, 1, ARRAY[dex_id],
        extract(epoch from now()) * 1000, extract(epoch from now()) * 1000);
    else
      /* 重複：更新現有 entry（用 owned_species 搵） */
      update user_entries set ev_points = ev_points + 1, dupes = dupes + 1,
        updated_at = extract(epoch from now()) * 1000
      where account_id = account_uuid and owned_species @> ARRAY[dex_id];
    end if;
  end if;

  insert into user_captures(account_id, dex_id, success, ts, new_pokemon)
  values (account_uuid, dex_id, caught, (not already_have) and caught, extract(epoch from now()) * 1000);

  return jsonb_build_object('caught', caught, 'is_new', (not already_have) and caught);
end;
$$;
