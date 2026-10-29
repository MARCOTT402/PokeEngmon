-- ============================================================
-- PokeEngmon — SM-2 v3: add last_review_at to user_cards
-- 2026-10-30
--
-- 用途：quiz chip 顯示「實際經過時間」（Last practised 16 days ago）。
-- 前端會將 last_review_at 連同其他卡片欄位一齊 upsert；
-- 未執行此 migration 會令 /user_cards upsert 回 400（unknown column）。
-- 舊卡沒有 last_review_at 時，前端會用
--   next_review_at − interval_days × 86400000
-- 推算，並由 SM2.migrateV3() 一次性回填本機卡片。
-- ============================================================

alter table user_cards
  add column if not exists last_review_at bigint not null default 0;

-- 舊卡回填：用 next_review_at − interval_days 推算最後複習時間
-- （同前端 SM2.lastReviewedMs / migrateV3 嘅 fallback 一致）
update user_cards
set last_review_at = greatest(0, next_review_at - (interval_days * 86400000)::bigint)
where last_review_at = 0
  and interval_days > 0
  and next_review_at > 0;
