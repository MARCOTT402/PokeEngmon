-- ============================================================
-- Entry ability（寶可夢特性 slot 1 / slot 2）同步
-- 之前特性純粹由 dexId derive（永遠 slot 1），換裝置／重新登入
-- 會令 roll 出嚟嘅特性被清走。ability 屬非經濟數值，開放 client 直寫。
-- Run in Supabase Dashboard → SQL Editor
-- ============================================================

alter table user_entries add column if not exists ability text;

-- v99 起 authenticated 只有 column-level update（active / updated_at / branch / nature…）。
-- ability 同 nature 一樣係非經濟數值，開放直寫；exp / candies / evs 等敏感欄維持唔可直寫。
grant update (ability) on user_entries to authenticated;

notify pgrst, 'reload schema';
