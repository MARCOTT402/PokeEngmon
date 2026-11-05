-- ============================================================
-- Migration 20261105e：背包第 3a 段（攜帶道具／送回大木博士）
--
-- 1. user_entries.held_item text：攜帶道具 slug（第 3a 段 = 進化石 thunder／moon／fire／leaf／water）
--    進化石數量本身係 B 方案（items_stones 由 client 寫），所以 held_item 一樣開放直寫（Rule 54）
-- 2. user_account.dex_caught jsonb：曾經捕捉過嘅圖鑑號（送走之後圖鑑照樣保留「已捕捉」）
--    只經 release_to_oak 寫，唔開 client update
-- 3. release_to_oak(p_entry)：送 Pokémon 返大木博士
--    - 拍檔、最後一隻唔可以送
--    - 退還：佢身上用咗嘅 EV（= 已加 EV 總數）+ 額外 1 個 EV Point Unit → 加落拍檔嘅 ev_points（共用池）
--    - 佢身上未用嘅 ev_points 屬於共用池 → 一齊搬過去（唔會因為刪 row 而消失）
--    - 攜帶嘅進化石退返 items_stones
--    - 佢嘅 owned_species 寫入 dex_caught
-- 慣例（Rule 9）：v_／p_ 前綴、column 加 alias；回傳 jsonb
-- ============================================================

alter table public.user_entries add column if not exists held_item text;
alter table public.user_account add column if not exists dex_caught jsonb;

grant select, update (held_item) on public.user_entries to authenticated;
grant select (dex_caught) on public.user_account to authenticated;

create or replace function release_to_oak(p_entry uuid) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  e record;
  v_count int; v_ev int; v_refund int; v_keep int; v_partner uuid; v_stones jsonb; v_dex jsonb;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;

  select ue.id, ue.active, ue.evs, ue.ev_points, ue.held_item, ue.owned_species into e
    from user_entries ue where ue.id = p_entry and ue.account_id = v_uid for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  if coalesce(e.active, false) then return jsonb_build_object('ok', false, 'reason', 'partner'); end if;

  select count(*) into v_count from user_entries ue where ue.account_id = v_uid;
  if v_count <= 1 then return jsonb_build_object('ok', false, 'reason', 'last'); end if;

  select ue.id into v_partner from user_entries ue
   where ue.account_id = v_uid and ue.active and ue.id <> p_entry limit 1;
  if v_partner is null then
    select ue.id into v_partner from user_entries ue
     where ue.account_id = v_uid and ue.id <> p_entry order by ue.obtained_at limit 1;
  end if;

  v_ev := (select coalesce(sum(x.value::int), 0) from jsonb_each_text(coalesce(e.evs, '{}'::jsonb)) x);
  v_refund := v_ev + 1;
  -- 佢身上未用嘅點本身屬於共用池 → 一齊搬去收件 entry，唔可以跟住刪走
  v_keep := greatest(coalesce(e.ev_points, 0), 0);
  update user_entries ue set ev_points = coalesce(ue.ev_points, 0) + v_refund + v_keep where ue.id = v_partner;

  -- 攜帶嘅進化石退返背包
  if e.held_item in ('thunder', 'moon', 'fire', 'leaf', 'water') then
    select coalesce(ua.items_stones, '{}'::jsonb) into v_stones from user_account ua where ua.id = v_uid for update;
    update user_account ua set items_stones = jsonb_set(v_stones, array[e.held_item],
      to_jsonb(coalesce((v_stones ->> e.held_item)::int, 0) + 1)) where ua.id = v_uid;
  end if;

  -- 圖鑑保留「已捕捉」
  select coalesce(ua.dex_caught, '[]'::jsonb) into v_dex from user_account ua where ua.id = v_uid for update;
  select coalesce(jsonb_agg(distinct x.v), '[]'::jsonb) into v_dex
    from (select value as v from jsonb_array_elements(v_dex)
          union select to_jsonb(s) from unnest(coalesce(e.owned_species, '{}'::text[])) s) x;
  update user_account ua set dex_caught = v_dex where ua.id = v_uid;

  delete from user_entries ue where ue.id = p_entry;

  return jsonb_build_object('ok', true, 'refund', v_refund, 'kept', v_keep, 'recipient', v_partner,
    'held', e.held_item, 'dex_caught', v_dex);
end;
$$;
revoke execute on function release_to_oak(uuid) from public, anon;
grant execute on function release_to_oak(uuid) to authenticated;

notify pgrst, 'reload schema';
