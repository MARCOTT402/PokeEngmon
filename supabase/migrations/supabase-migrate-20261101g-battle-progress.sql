-- ============================================================
-- PokeEngmon · Battle 2.0 · migration g
-- battle_progress()：一次過拎 EP ledger + 訓練家精通（換機同步用）
-- 依賴：supabase-migrate-20261101f-battle-energy.sql 已執行
-- 套用方法：Supabase Dashboard → SQL Editor 貼上執行
-- ============================================================

-- 前端開 Battle 大廳時 call：順便刷新 EP（跨日／登入 +1／答題 +1），
-- 同時回傳雲端 trainer_mastery，令換機或清 cache 之後唔會倒退。
create or replace function battle_progress(p_questions_today int default 0)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_mastery jsonb := '{}'::jsonb;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;

  select coalesce(ua.trainer_mastery, '{}'::jsonb)
    into v_mastery
    from user_account ua
   where ua.id = v_uid;

  if v_mastery is null then v_mastery := '{}'::jsonb; end if;

  return jsonb_build_object(
    'energy', battle_energy_status(coalesce(p_questions_today, 0)),
    'mastery', v_mastery
  );
end;
$$;

revoke execute on function battle_progress(int) from public, anon;
grant execute on function battle_progress(int) to authenticated;

notify pgrst, 'reload schema';
