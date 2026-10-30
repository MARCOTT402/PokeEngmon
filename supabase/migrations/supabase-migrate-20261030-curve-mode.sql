-- ============================================================
-- 遺忘曲線模式（curve_mode）
-- Run in Supabase Dashboard → SQL Editor
-- ============================================================

alter table user_account
  add column if not exists curve_mode text not null default 'standard';

alter table user_account
  drop constraint if exists user_account_curve_mode_check;

alter table user_account
  add constraint user_account_curve_mode_check
  check (curve_mode in ('standard', 'junior', 'teen', 'adult'));

notify pgrst, 'reload schema';
