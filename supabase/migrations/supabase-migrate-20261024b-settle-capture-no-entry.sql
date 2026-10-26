-- ============================================================
-- Migration 20261024b：settle_capture 唔好直接寫 user_entries
--
-- 問題：settle_capture 用 'dex_' || dex_id 做 chain_key 建立 entry，
-- 但前端 pushState 會用正確 chain key 再建立一個 entry → 重複。
--
-- 修復：settle_capture 只負責記錄捕捉結果（user_captures），
-- user_entries 交由前端 pushState 同步。
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
begin
  rand_val := random();
  caught := rand_val < least(0.95, 0.80 + attempts * 0.05);

  /* 只記錄捕捉結果，唔直接寫 user_entries（由前端 pushState 處理） */
  insert into user_captures(account_id, dex_id, success, ts, new_pokemon)
  values (account_uuid, dex_id, caught, extract(epoch from now()) * 1000, false);

  return jsonb_build_object('caught', caught, 'is_new', false);
end;
$$;
