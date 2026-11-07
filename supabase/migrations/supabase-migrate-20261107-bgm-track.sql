-- ============================================================
-- 背景音樂選擇（bgm_track）：Setting → Music track
-- null = 用戶未揀過（client 會用本機值 backfill）；有值就跨機跟雲端
-- Run in Supabase Dashboard → SQL Editor（idempotent，可重跑）
-- ============================================================

alter table user_account
  add column if not exists bgm_track text;

alter table user_account
  drop constraint if exists user_account_bgm_track_check;

alter table user_account
  add constraint user_account_bgm_track_check
  check (bgm_track is null or bgm_track in ('flat-water', 'brown-noise', 'isochronic'));

/* Rule 54：client 直寫嘅新欄要 column-level grant，否則 PATCH permission denied */
grant update (bgm_track) on public.user_account to authenticated;

notify pgrst, 'reload schema';
