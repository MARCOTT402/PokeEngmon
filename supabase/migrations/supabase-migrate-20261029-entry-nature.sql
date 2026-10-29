-- ============================================================
-- Entry nature（寶可夢性格）同步
-- 之前 nature 只存在本機，換裝置／換帳戶後性格會重設，
-- Pokédex 顯示嘅數值（nature 加減成）會唔同。
-- Run in Supabase Dashboard → SQL Editor
-- ============================================================

alter table user_entries add column if not exists nature text;

-- v99 起 authenticated 只有 column-level update（active / updated_at / branch）。
-- nature 屬非經濟數值，開放直寫；exp / candies / evs 等敏感欄維持唔可直寫。
grant update (nature) on user_entries to authenticated;
