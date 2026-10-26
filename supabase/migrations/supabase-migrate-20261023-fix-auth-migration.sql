-- ============================================================================
-- Migration: 修正 migrate_anonymous_to_auth 判斷邏輯
-- Date: 2026-10-23
--
-- 問題：
--   原本只用 device_id 判斷係咪新帳戶，導致跨裝置 / sign out 再 sign in 時
--   被誤判為新帳戶 → pushState() 用空本地數據覆蓋雲端進度。
--
-- 修正：
--   先用 auth_uid (id = new_auth_uuid) 檢查帳戶係咪已存在。
--   - 已存在 → return false（舊帳戶，pull 雲端）
--   - 唔存在 → 先係真正新帳戶（push 本地上去）
--
-- 使用方法：複製下面全部內容到 Supabase SQL Editor 執行
-- ============================================================================

drop function if exists migrate_anonymous_to_auth(uuid, text);

create or replace function migrate_anonymous_to_auth(new_auth_uuid uuid, old_device_id text)
returns boolean
language plpgsql
security definer
as $$
declare
  existing_uuid uuid;
  old_account_uuid uuid;
begin
  /* 1. 先用 auth uid 檢查帳戶係咪已存在（跨裝置 / sign out 再 sign in 嘅情況） */
  select id into existing_uuid from user_account where id = new_auth_uuid;

  if existing_uuid is not null then
    -- 帳戶已存在 → 唔係新帳戶，雲端為準（pull）
    return false;
  end if;

  /* 2. 帳戶唔存在 → 睇下有冇匿名數據要搬 */
  select id into old_account_uuid from user_account where device_id = old_device_id;

  if old_account_uuid is null then
    -- 從未登入過，亦冇匿名數據 → 建立新 account（本地要 push 上嚟）
    insert into user_account(id, device_id, trainer_name, updated_at)
    values (new_auth_uuid, null, 'The PokéEngmon Trainer', extract(epoch from now()) * 1000);
    return true;
  end if;

  -- 有匿名數據 → 搬所有資料到新 auth id
  update user_entries   set account_id = new_auth_uuid where account_id = old_account_uuid;
  update user_cards    set account_id = new_auth_uuid where account_id = old_account_uuid;
  update user_history  set account_id = new_auth_uuid where account_id = old_account_uuid;
  update user_captures set account_id = new_auth_uuid where account_id = old_account_uuid;
  update user_account  set id = new_auth_uuid, device_id = null, updated_at = extract(epoch from now()) * 1000
    where id = old_account_uuid;
  return false;
end;
$$;
