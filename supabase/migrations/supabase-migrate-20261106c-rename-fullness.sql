-- =====================================================================
-- 2026-11-06c：user_entries.pet_health → fullness、pet_updated_at → fullness_at
--   狀態系統第一期起 pet_health 嘅意思已經係「飽肚值」，HP 另存 hp_permille；舊名容易誤會。
--   · column 改名（column grant 會自動跟住新名）
--   · 用到舊名嘅 4 個 function（_care_settle_user／_care_state／care_feed／care_use_item）
--     用 pg_get_functiondef + replace 重建，之後檢查冇殘留舊名，否則成段 rollback
--   · RPC 回傳 key 本身已經係 'fullness'／'fullness_at'，client 唔受影響
--   · 舊 client pull 讀 pet_health 會攞到 undefined → 暫時當飽肚值 100，之後 care_settle 會覆蓋
--
-- 用法：全段一次過 Run（同一個 transaction）；可重複執行（已改名就 skip）
-- =====================================================================

do $m$
declare
  v_fn text; v_def text;
begin
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'user_entries' and column_name = 'pet_health') then
    alter table public.user_entries rename column pet_health to fullness;
  end if;
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'user_entries' and column_name = 'pet_updated_at') then
    alter table public.user_entries rename column pet_updated_at to fullness_at;
  end if;

  for v_fn in
    select p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prokind = 'f'
       and (pg_get_functiondef(p.oid) like '%pet_health%' or pg_get_functiondef(p.oid) like '%pet_updated_at%')
  loop
    v_def := pg_get_functiondef(v_fn::regprocedure);
    v_def := replace(replace(v_def, 'pet_health', 'fullness'), 'pet_updated_at', 'fullness_at');
    execute v_def;
  end loop;

  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and p.prokind = 'f'
                and (pg_get_functiondef(p.oid) like '%pet_health%' or pg_get_functiondef(p.oid) like '%pet_updated_at%')) then
    raise exception 'functions still reference pet_health / pet_updated_at';
  end if;
end
$m$;

notify pgrst, 'reload schema';
