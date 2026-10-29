-- ============================================================
-- PokeEngmon 1.7.x — 電子寵物狀態 + 背包上雲（B 方案：前端結算，雲端備份）
-- ------------------------------------------------------------
-- 設計原則：
--   * 全部欄位 nullable、無 default
--   * null = 從未上過雲 → 前端保留本機值（首次 backfill，唔會清空進度）
--   * 前端結算後經 PATCH 備份（B 方案），不設 RPC 裁決
-- ============================================================

/* ---------- 1. 每隻寶可夢的寵物狀態 ---------- */
alter table public.user_entries
  add column if not exists pet_health       smallint,
  add column if not exists pet_streak       integer,
  add column if not exists pet_last_fed_day date,
  add column if not exists pet_settled_day  date,
  add column if not exists pet_decay_day    date,
  add column if not exists pet_updated_at   timestamptz;

/* ---------- 2. 背包（道具數量）---------- */
alter table public.user_account
  add column if not exists items_food    integer,
  add column if not exists items_premium integer,
  add column if not exists items_revive  integer;

/* ---------- 3. Column-level grant（讀 + 寫，前端備份需要）---------- */
grant select, update (pet_health, pet_streak, pet_last_fed_day, pet_settled_day, pet_decay_day, pet_updated_at)
  on public.user_entries to authenticated;

grant select, update (items_food, items_premium, items_revive)
  on public.user_account to authenticated;

/* ---------- 4. 核實（Supabase SQL Editor 應全部顯示 true / 3 rows）---------- */
select column_name, data_type, is_nullable
  from information_schema.columns
 where table_schema = 'public'
   and table_name = 'user_entries'
   and column_name like 'pet_%'
 order by column_name;

select column_name, data_type, is_nullable
  from information_schema.columns
 where table_schema = 'public'
   and table_name = 'user_account'
   and column_name like 'items_%'
 order by column_name;

/* ---------- 5. 重載 PostgREST schema cache（唔做會 42703 / PGRST204）---------- */
notify pgrst, 'reload schema';
