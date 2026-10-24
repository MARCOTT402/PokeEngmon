-- ============================================================
-- PokeEngmon v105 — reset_progress RPC
-- 用途：登入用戶在遊戲內按 Reset Progress 時，同步清空雲端進度，
--       否則下次 Sync.pull 會把舊進度倒灌回本機。
-- 跑法：Supabase Dashboard → SQL Editor → New Query → Run（只需跑一次）
-- ============================================================

create or replace function reset_progress()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;

  -- 只可刪自己 account_id 嘅資料；auth.uid() 由 JWT 決定，前端冇得偽造
  delete from user_captures where account_id = uid;
  delete from user_history  where account_id = uid;
  delete from user_cards    where account_id = uid;
  delete from user_entries  where account_id = uid;

  update user_account
     set diamonds        = 0,
         normal_pulls    = 0,
         total_sets      = 0,
         total_correct   = 0,
         total_questions = 0,
         trainer_name    = 'The PokéEngmon Trainer',
         updated_at      = (extract(epoch from now()) * 1000)::bigint
   where id = uid;

  return jsonb_build_object('ok', true);
end;
$$;

revoke execute on function reset_progress() from public, anon;
grant execute on function reset_progress() to authenticated;
