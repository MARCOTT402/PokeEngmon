-- ============================================================
-- PokeEngmon 1.12.x — 進化石 / trade likes
-- ------------------------------------------------------------
-- 設計原則（同 20261029-pet-cloud 一致）：
--   * 全部欄位 nullable、無 default
--   * null = 從未上過雲 → 前端保留本機值
--   * stone_used 係進化 replay 嘅必要輸入（deriveEntryFields 靠佢重推 stage）
--   * trainer_likes 由 leaderboard 功能寫入；≥20 = trade 進化條件
-- ============================================================

/* ---------- 1. 用咗邊粒進化石（thunder / moon / fire / leaf / water） ---------- */
alter table public.user_entries
  add column if not exists stone_used text;

/* ---------- 2. 背包：5 種進化石（jsonb 一次過存） + 訓練員 likes ---------- */
alter table public.user_account
  add column if not exists items_stones  jsonb,
  add column if not exists trainer_likes integer;

/* ---------- 3. Column-level grant（讀 + 寫，前端備份需要） ---------- */
grant select, update (stone_used)
  on public.user_entries to authenticated;

grant select, update (items_stones, trainer_likes)
  on public.user_account to authenticated;

/* ---------- 4. 核實（Supabase SQL Editor 應顯示 nullable = YES） ---------- */
select column_name, data_type, is_nullable
  from information_schema.columns
 where table_schema = 'public'
   and table_name = 'user_entries'
   and column_name = 'stone_used';

select column_name, data_type, is_nullable
  from information_schema.columns
 where table_schema = 'public'
   and table_name = 'user_account'
   and column_name in ('items_stones', 'trainer_likes');

/* ---------- 5. 重載 PostgREST schema cache ---------- */
notify pgrst, 'reload schema';
