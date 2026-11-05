-- ============================================================
-- Migration 20261105：PvP 戰前投票（隨機配對 + 好友局共用）
--
-- 新增：
--   battles.p1_vote / p2_vote（jsonb，nullable）
--     { size: 1|3|6, cap: <自己可出戰數>, items: bool, switch: bool }
--   雙方各自寫自己嗰欄；兩邊客戶端用同一條規則（battle seed 決定分歧）
--   各自計出最終規則，p1 再將最終人數寫返 team_size 做紀錄。
--
-- RLS：沿用 battles_update_self（只可改自己有參與嘅 row）
-- Rule 54：新可寫 column 同一份 migration 加 column-level grant
--
-- 用法：Supabase Dashboard → SQL Editor → New Query → 全段 Run
-- ============================================================

alter table battles add column if not exists p1_vote jsonb;
alter table battles add column if not exists p2_vote jsonb;

grant select, update (p1_vote, p2_vote, team_size) on public.battles to authenticated;

/* 核實：應該見到 2 rows */
select column_name, data_type, is_nullable
  from information_schema.columns
 where table_schema = 'public'
   and table_name = 'battles'
   and column_name in ('p1_vote', 'p2_vote');

notify pgrst, 'reload schema';
