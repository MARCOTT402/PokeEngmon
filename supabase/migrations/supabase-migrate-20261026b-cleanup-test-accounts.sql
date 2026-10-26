-- ============================================================
-- v133 Cleanup: delete test accounts from leaderboard
-- 跑法：Supabase Dashboard → SQL Editor → New Query
--
-- Step 1 先跑 check query 確認要刪邊幾個
-- Step 2 根據要刪嘅 account_id 跑 delete（on delete cascade 會
--         自動清走 user_entries / user_captures / user_cards /
--         user_imports）
-- Step 3 （可選）Dashboard → Authentication → Users 手動刪
--         對應嘅 auth user（SQL 冇權限刪 auth.users）
-- ============================================================

-- --- Step 1: 睇晒所有帳戶，揀邊啲係假嘅 ---
select
  id,
  trainer_name,
  diamonds,
  created_at,
  updated_at
from user_account
order by created_at;

--- Step 2a: 如果你想一次過清晒所有（極端情況）---
-- delete from user_account;

--- Step 2b: 只刪特定 account_id（最安全，貼 Step 1 查出嚟嘅 id）---
-- delete from user_account where id in (
--   '00000000-0000-0000-0000-000000000000',  -- 替換成真實 uuid
--   '11111111-1111-1111-1111-111111111111'
-- );

--- Step 3 之後可以再跑一次確認 ---
-- select count(*) from user_account;
