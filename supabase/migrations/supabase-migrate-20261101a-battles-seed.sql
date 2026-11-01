-- ============================================================
-- Migration 20261101a：battles 加 seed 欄（PvP 種子同步制）
--
-- 種子同步：雙方客戶端攞同一個 seed 各自模擬，結果一致，
-- 每回合只需交換 action，唔使傳成個 state。
-- 由開局嗰方（p1）喺 insert 時生成 32-bit unsigned int。
--
-- 用法：Supabase Dashboard → SQL Editor → New Query → 全段 Run
-- ============================================================

alter table battles add column if not exists seed bigint not null default 0;

notify pgrst, 'reload schema';
