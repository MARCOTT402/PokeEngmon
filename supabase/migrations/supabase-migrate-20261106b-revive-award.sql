-- =====================================================================
-- 2026-11-06b：Revival（復活藥）掉落改由 server 抽，收回 items_food／items_premium／items_revive 直寫
--   之前：答題後 client Pet.rollDrops() 自己加 revive，再經 pushItems PATCH 上雲 → 改 localStorage 就可以刷。
--   使用早已經 server 扣（care_use_item／settle_battle_team）；今次封「派」嗰邊。
--   food／premium 已經由樹果取代（20261105f），client 唔再有任何派發；一併收權，
--   否則仍然可以 PATCH items_food 再經 care_feed('food') 食。
--
--   award_revive(p_perfect)：規則同舊 client 一樣
--     · 全對：穩掉 1 粒，另有 10% 多 1 粒
--     · 1–9 題：10% 掉 1 粒
--     · 每日最多 40 次 call（同 award_meds／award_stone 一樣防重複 call）
--
-- 慣例（Rule 9）：變數 v_ 前綴、參數 p_ 前綴、column 加 alias；回傳 jsonb
-- 用法：可重複執行
-- =====================================================================

alter table public.user_account add column if not exists revive_award jsonb;
grant select (revive_award) on public.user_account to authenticated;

revoke update (items_food, items_premium, items_revive) on public.user_account from authenticated;

create or replace function public.award_revive(p_perfect boolean)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_day text := to_char(now() at time zone 'Asia/Hong_Kong', 'YYYY-MM-DD');
  v_award jsonb; v_n int; v_gain int := 0; v_total int;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  select coalesce(ua.revive_award, '{}'::jsonb) into v_award from user_account ua where ua.id = v_uid for update;
  if not found then raise exception 'account not found'; end if;
  v_n := case when v_award ->> 'day' = v_day then coalesce((v_award ->> 'n')::int, 0) else 0 end;
  if v_n >= 40 then
    return jsonb_build_object('ok', true, 'gain', 0, 'capped', true,
      'revive', (select coalesce(ua.items_revive, 0) from user_account ua where ua.id = v_uid));
  end if;

  if coalesce(p_perfect, false) then
    v_gain := 1 + (case when random() < 0.10 then 1 else 0 end);
  elsif random() < 0.10 then
    v_gain := 1;
  end if;

  update user_account ua set
    revive_award = jsonb_build_object('day', v_day, 'n', v_n + 1),
    items_revive = coalesce(ua.items_revive, 0) + v_gain
  where ua.id = v_uid
  returning ua.items_revive into v_total;

  return jsonb_build_object('ok', true, 'gain', v_gain, 'revive', v_total);
end;
$$;

revoke all on function public.award_revive(boolean) from public, anon;
grant execute on function public.award_revive(boolean) to authenticated;

notify pgrst, 'reload schema';
