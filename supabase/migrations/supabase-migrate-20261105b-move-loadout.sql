-- ============================================================
-- Migration 20261105b：玩家自訂配招上雲
--
-- 問題：自訂配招只存 localStorage（st.moveLoadouts），
--       log out／換機／清 cache 之後全部變返預設招式。
-- 新增：user_entries.move_loadout jsonb（nullable）
--       = 持有招式 slug 陣列（1–4 個）；null = 從未自訂（用預設）。
-- 合法性：前端 applyMoveLoadout 會檢查每招都喺招式池入面先套用，
--       唔合法就保留預設（非經濟數值，同 nature／ability 一樣開放直寫）。
-- Rule 54：新可寫 column 同一份 migration 加 column-level grant
-- ============================================================

alter table public.user_entries add column if not exists move_loadout jsonb;

grant select, update (move_loadout) on public.user_entries to authenticated;

/* 核實：應該見到 1 row */
select column_name, data_type, is_nullable
  from information_schema.columns
 where table_schema = 'public' and table_name = 'user_entries' and column_name = 'move_loadout';

notify pgrst, 'reload schema';
