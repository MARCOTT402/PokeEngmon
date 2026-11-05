-- ============================================================
-- Migration 20261105d：背包第 2 段（我的隊伍／最愛／背包設定／共用 EV Point Unit）
--
-- 1. user_account.my_team   jsonb：我的隊伍（entry id 陣列，最多 6；AI／PvP／好友戰共用）
-- 2. user_account.bag_prefs jsonb：背包設定（排序 chip 次序等）
-- 3. user_entries.favorite  boolean：我的最愛（心心）
--    以上三個都係非經濟數值 → column-level grant 開放直寫（Rule 54）
-- 4. alloc_ev_shared(p_entry, p_stat, p_n)：EV Point Unit 改做共用一格
--    共用池 = 全部 entry 嘅 ev_points 加總（唔使改 gacha／capture 等派點 RPC，亦唔使搬數）；
--    分配時先扣目標自己嘅點，唔夠再由其他 entry 扣。每項 252、總和 510 上限照舊。
-- 慣例（Rule 9）：v_／p_ 前綴、column 加 alias
-- ============================================================

alter table public.user_account
  add column if not exists my_team   jsonb,
  add column if not exists bag_prefs jsonb;
alter table public.user_entries
  add column if not exists favorite boolean;

grant select, update (my_team, bag_prefs) on public.user_account to authenticated;
grant select, update (favorite) on public.user_entries to authenticated;

create or replace function alloc_ev_shared(p_entry uuid, p_stat text, p_n int default 1) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_evs jsonb; v_cur int; v_total int; v_pool int; v_n int; v_left int; v_take int;
  r record;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if p_stat not in ('hp','atk','def','spa','spd','spe') then return jsonb_build_object('ok', false, 'reason', 'bad_stat'); end if;

  select coalesce(ue.evs, '{}'::jsonb) into v_evs
    from user_entries ue where ue.id = p_entry and ue.account_id = v_uid for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;

  v_cur := coalesce((v_evs ->> p_stat)::int, 0);
  v_total := (select coalesce(sum(x.value::int), 0) from jsonb_each_text(v_evs) x);
  select coalesce(sum(greatest(ue.ev_points, 0)), 0) into v_pool from user_entries ue where ue.account_id = v_uid;
  v_n := least(greatest(coalesce(p_n, 1), 1), 252, v_pool, 252 - v_cur, 510 - v_total);
  if v_n <= 0 then
    return jsonb_build_object('ok', false, 'reason', case when v_pool <= 0 then 'no_units' else 'cap' end, 'pool', v_pool);
  end if;

  -- 扣點：目標自己先，之後點數多嘅先
  v_left := v_n;
  for r in
    select ue.id, ue.ev_points from user_entries ue
     where ue.account_id = v_uid and ue.ev_points > 0
     order by (ue.id = p_entry) desc, ue.ev_points desc
     for update
  loop
    exit when v_left <= 0;
    v_take := least(r.ev_points, v_left);
    update user_entries ue set ev_points = ue.ev_points - v_take where ue.id = r.id;
    v_left := v_left - v_take;
  end loop;

  update user_entries ue set
    evs = jsonb_set(coalesce(ue.evs, '{}'::jsonb), array[p_stat], to_jsonb(v_cur + v_n)),
    updated_at = (extract(epoch from now()) * 1000)::bigint
  where ue.id = p_entry;

  return jsonb_build_object('ok', true, 'added', v_n,
    'evs', (select ue.evs from user_entries ue where ue.id = p_entry),
    'points', (select jsonb_object_agg(ue.id, ue.ev_points) from user_entries ue where ue.account_id = v_uid),
    'pool', v_pool - v_n);
end;
$$;
revoke execute on function alloc_ev_shared(uuid, text, int) from public, anon;
grant execute on function alloc_ev_shared(uuid, text, int) to authenticated;

notify pgrst, 'reload schema';
