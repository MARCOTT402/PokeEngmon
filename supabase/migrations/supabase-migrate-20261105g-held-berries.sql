-- ============================================================
-- Migration 20261105g：背包第 4b 段（攜帶樹果）
--
-- 1. hold_berry(p_entry, p_berry)：俾 Pokémon 攜帶一粒樹果（背包 −1）；p_berry = null → 拆返落背包
--    原本攜帶緊嘅道具自動退返背包（樹果 → items_berries；進化石 → items_stones）
-- 2. settle_battle_team：team 每隻可以帶 held_used（戰鬥中食咗嘅攜帶樹果 slug）→ 清 held_item（只清同一粒）
-- 3. release_to_oak：攜帶樹果都退返背包（之前只退進化石）
-- 慣例（Rule 9）：v_／p_ 前綴、column 加 alias；回傳 jsonb
-- held_item 本身已有 column grant（20261105e），今次冇新 column
-- ============================================================

create or replace function hold_berry(p_entry uuid, p_berry text default null) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_prev text; v_have int; v_berries jsonb; v_stones jsonb;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if p_berry is not null and _berry_info(p_berry) is null then
    return jsonb_build_object('ok', false, 'reason', 'bad_item');
  end if;

  select ue.held_item into v_prev from user_entries ue
   where ue.id = p_entry and ue.account_id = v_uid for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  if v_prev is not distinct from p_berry then
    return jsonb_build_object('ok', true, 'prev', v_prev, 'state', _care_state(v_uid));
  end if;

  select coalesce(ua.items_berries, '{}'::jsonb), coalesce(ua.items_stones, '{}'::jsonb) into v_berries, v_stones
    from user_account ua where ua.id = v_uid for update;

  if p_berry is not null then
    v_have := coalesce((v_berries ->> p_berry)::int, 0);
    if v_have <= 0 then return jsonb_build_object('ok', false, 'reason', 'none'); end if;
    v_berries := case when v_have - 1 <= 0 then v_berries - p_berry else jsonb_set(v_berries, array[p_berry], to_jsonb(v_have - 1)) end;
  end if;

  -- 原本攜帶嘅道具退返背包
  if v_prev is not null and _berry_info(v_prev) is not null then
    v_berries := jsonb_set(v_berries, array[v_prev], to_jsonb(coalesce((v_berries ->> v_prev)::int, 0) + 1));
  elsif v_prev in ('thunder', 'moon', 'fire', 'leaf', 'water') then
    v_stones := jsonb_set(v_stones, array[v_prev], to_jsonb(coalesce((v_stones ->> v_prev)::int, 0) + 1));
  end if;

  update user_account ua set items_berries = v_berries, items_stones = v_stones where ua.id = v_uid;
  update user_entries ue set held_item = p_berry where ue.id = p_entry;

  return jsonb_build_object('ok', true, 'prev', v_prev, 'state', _care_state(v_uid));
end;
$$;

revoke execute on function hold_berry(uuid, text) from public, anon;
grant execute on function hold_berry(uuid, text) to authenticated;

-- settle_battle_team：加 held_used（其餘同 20261105f）
create or replace function settle_battle_team(p_team jsonb, p_used jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  t jsonb; v_id uuid; v_hp int; v_st text; v_pl int; k text; v_n int; v_have int; v_held text;
  v_ok text[] := array['brn','par','slp','frz','psn'];
  v_items text[] := array['potion','super_potion','antidote','burn_heal','paralyze_heal','awakening','ice_heal','revive'];
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if jsonb_typeof(p_team) <> 'array' or jsonb_array_length(p_team) > 6 then
    return jsonb_build_object('ok', false, 'reason', 'bad_team');
  end if;
  perform _care_settle_user(v_uid);

  for t in select value from jsonb_array_elements(p_team) loop
    begin v_id := (t ->> 'id')::uuid; exception when others then continue; end;
    v_hp := greatest(0, least(1000, coalesce((t ->> 'hp')::int, 1000)));
    v_st := t ->> 'status';
    if v_st is not null and not (v_st = any(v_ok)) then v_st := null; end if;
    v_pl := case when v_st = 'psn' then greatest(1, least(2, coalesce((t ->> 'poison')::int, 1))) else 0 end;
    if v_hp <= 0 then v_st := null; v_pl := 0; end if;
    update user_entries ue set
      hp_permille = v_hp, status = v_st, poison_level = v_pl,
      status_since = case when v_st in ('slp', 'frz') then now() else null end,
      care_at = now(), od_count = 0, med_log = '[]'::jsonb
    where ue.id = v_id and ue.account_id = v_uid;
    -- 攜帶樹果食咗：只清同一粒（防止亂清其他道具）
    v_held := t ->> 'held_used';
    if v_held is not null and _berry_info(v_held) is not null then
      update user_entries ue set held_item = null
       where ue.id = v_id and ue.account_id = v_uid and ue.held_item = v_held;
    end if;
  end loop;

  if jsonb_typeof(p_used) = 'object' then
    for k in select jsonb_object_keys(p_used) loop
      v_n := greatest(0, least(99, coalesce((p_used ->> k)::int, 0)));
      if v_n = 0 then continue; end if;
      if k = 'revive' then
        update user_account ua set items_revive = greatest(0, coalesce(ua.items_revive, 0) - v_n) where ua.id = v_uid;
      elsif k = any(v_items) then
        update user_account ua set items_meds = jsonb_set(coalesce(ua.items_meds, '{}'::jsonb), array[k],
          to_jsonb(greatest(0, coalesce((ua.items_meds ->> k)::int, 0) - v_n))) where ua.id = v_uid;
      elsif _berry_info(k) is not null then
        select coalesce((ua.items_berries ->> k)::int, 0) into v_have from user_account ua where ua.id = v_uid;
        update user_account ua set items_berries = case when v_have - v_n <= 0 then coalesce(ua.items_berries, '{}'::jsonb) - k
          else jsonb_set(coalesce(ua.items_berries, '{}'::jsonb), array[k], to_jsonb(v_have - v_n)) end where ua.id = v_uid;
      end if;
    end loop;
  end if;

  return jsonb_build_object('ok', true, 'state', _care_state(v_uid));
end;
$$;

revoke execute on function settle_battle_team(jsonb, jsonb) from public, anon;
grant execute on function settle_battle_team(jsonb, jsonb) to authenticated;

-- release_to_oak：攜帶樹果都退返（其餘同 20261105e）
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
  v_keep := greatest(coalesce(e.ev_points, 0), 0);
  update user_entries ue set ev_points = coalesce(ue.ev_points, 0) + v_refund + v_keep where ue.id = v_partner;

  -- 攜帶道具退返背包：進化石 → items_stones；樹果 → items_berries
  if e.held_item in ('thunder', 'moon', 'fire', 'leaf', 'water') then
    select coalesce(ua.items_stones, '{}'::jsonb) into v_stones from user_account ua where ua.id = v_uid for update;
    update user_account ua set items_stones = jsonb_set(v_stones, array[e.held_item],
      to_jsonb(coalesce((v_stones ->> e.held_item)::int, 0) + 1)) where ua.id = v_uid;
  elsif e.held_item is not null and _berry_info(e.held_item) is not null then
    update user_account ua set items_berries = jsonb_set(coalesce(ua.items_berries, '{}'::jsonb), array[e.held_item],
      to_jsonb(coalesce((ua.items_berries ->> e.held_item)::int, 0) + 1)) where ua.id = v_uid;
  end if;

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
