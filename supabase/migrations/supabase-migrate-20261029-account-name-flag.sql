-- ============================================================
-- Trainer name flag 同步（name_customized）
-- 之前每次 pull 只用 trainer_name != 預設名 推斷，換裝置／
-- 用家把名改返預設時會判斷錯。明確記住「改過名」狀態。
-- Run in Supabase Dashboard → SQL Editor
-- ============================================================

alter table user_account
  add column if not exists name_customized boolean not null default false;

-- v99 起 authenticated 只有 column-level update（trainer_name / updated_at）
grant update (name_customized) on user_account to authenticated;

-- 核對 DB 真實狀態（應該要見到 user_account.name_customized）
select table_name, column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name in ('user_account', 'user_entries')
  and column_name in ('name_customized', 'nature')
order by table_name;

-- 強制 PostgREST 重新讀 schema；否則新欄位可能仍報 42703 column does not exist
notify pgrst, 'reload schema';
