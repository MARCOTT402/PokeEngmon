-- ============================================================
-- Migration 20261105h：背包第 4c 段（Mega 進化）
--
-- 1. user_account.items_mega jsonb {slug: n}（只經 RPC 寫）；mega_award jsonb（每日掉落次數上限）
-- 2. _mega_dex(slug)：Mega 石 → 對應物種圖鑑號（Gen 1–5，70 粒，同 js/mega-data.js 一致）
-- 3. award_mega(p_perfect)：答題全對 → 3% 掉 1 粒 Mega 石；只會掉玩家擁有物種（任何 entry 嘅 owned_species）嘅石；每日最多抽 30 次
-- 4. hold_item(p_entry, p_item)：攜帶樹果／Mega 石（null = 拆返）；原本攜帶嘅道具自動退返背包（樹果／Mega 石／進化石）
--    hold_berry 改為 wrapper（舊 client 相容，唔會食咗 Mega 石）
-- 5. release_to_oak：攜帶嘅 Mega 石都退返背包
-- 慣例（Rule 9）：v_／p_ 前綴、column 加 alias；回傳 jsonb
-- ============================================================

alter table public.user_account
  add column if not exists items_mega jsonb,
  add column if not exists mega_award jsonb;
grant select (items_mega, mega_award) on public.user_account to authenticated;

create or replace function _mega_dex(p_slug text) returns int
language sql immutable set search_path = public
as $$
  select m.dex from (values
    ('venusaurite', 3),
    ('charizardite-x', 6),
    ('charizardite-y', 6),
    ('blastoisinite', 9),
    ('beedrillite', 15),
    ('pidgeotite', 18),
    ('raichunite-x', 26),
    ('raichunite-y', 26),
    ('clefablite', 36),
    ('alakazite', 65),
    ('victreebelite', 71),
    ('slowbronite', 80),
    ('gengarite', 94),
    ('kangaskhanite', 115),
    ('starminite', 121),
    ('pinsirite', 127),
    ('gyaradosite', 130),
    ('aerodactylite', 142),
    ('dragoninite', 149),
    ('mewtwonite-x', 150),
    ('mewtwonite-y', 150),
    ('meganiumite', 154),
    ('feraligite', 160),
    ('ampharosite', 181),
    ('steelixite', 208),
    ('scizorite', 212),
    ('heracronite', 214),
    ('skarmorite', 227),
    ('houndoominite', 229),
    ('tyranitarite', 248),
    ('sceptilite', 254),
    ('blazikenite', 257),
    ('swampertite', 260),
    ('gardevoirite', 282),
    ('sablenite', 302),
    ('mawilite', 303),
    ('aggronite', 306),
    ('medichamite', 308),
    ('manectite', 310),
    ('sharpedonite', 319),
    ('cameruptite', 323),
    ('altarianite', 334),
    ('banettite', 354),
    ('chimechite', 358),
    ('absolite', 359),
    ('absolite-z', 359),
    ('glalitite', 362),
    ('salamencite', 373),
    ('metagrossite', 376),
    ('latiasite', 380),
    ('latiosite', 381),
    ('staraptite', 398),
    ('lopunnite', 428),
    ('garchompite', 445),
    ('garchompite-z', 445),
    ('lucarionite', 448),
    ('lucarionite-z', 448),
    ('abomasite', 460),
    ('galladite', 475),
    ('froslassite', 478),
    ('heatranite', 485),
    ('darkranite', 491),
    ('emboarite', 500),
    ('excadrite', 530),
    ('audinite', 531),
    ('scolipite', 545),
    ('scraftinite', 560),
    ('eelektrossite', 604),
    ('chandelurite', 609),
    ('golurkite', 623)
  ) as m(slug, dex) where m.slug = p_slug;
$$;
revoke execute on function _mega_dex(text) from public, anon, authenticated;

create or replace function award_mega(p_perfect boolean) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_day text := to_char(now() at time zone 'Asia/Hong_Kong', 'YYYY-MM-DD');
  v_award jsonb; v_n int; v_slug text;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if not coalesce(p_perfect, false) then return jsonb_build_object('ok', true, 'slug', null); end if;
  select coalesce(ua.mega_award, '{}'::jsonb) into v_award from user_account ua where ua.id = v_uid for update;
  v_n := case when v_award ->> 'day' = v_day then coalesce((v_award ->> 'n')::int, 0) else 0 end;
  if v_n >= 30 then return jsonb_build_object('ok', true, 'slug', null, 'capped', true); end if;
  update user_account ua set mega_award = jsonb_build_object('day', v_day, 'n', v_n + 1) where ua.id = v_uid;
  if random() >= 0.03 then return jsonb_build_object('ok', true, 'slug', null); end if;
  -- 只掉玩家擁有物種嘅 Mega 石（同一物種有 X／Y 就隨機一粒）
  select m.slug into v_slug from (values
    ('venusaurite', 3),
    ('charizardite-x', 6),
    ('charizardite-y', 6),
    ('blastoisinite', 9),
    ('beedrillite', 15),
    ('pidgeotite', 18),
    ('raichunite-x', 26),
    ('raichunite-y', 26),
    ('clefablite', 36),
    ('alakazite', 65),
    ('victreebelite', 71),
    ('slowbronite', 80),
    ('gengarite', 94),
    ('kangaskhanite', 115),
    ('starminite', 121),
    ('pinsirite', 127),
    ('gyaradosite', 130),
    ('aerodactylite', 142),
    ('dragoninite', 149),
    ('mewtwonite-x', 150),
    ('mewtwonite-y', 150),
    ('meganiumite', 154),
    ('feraligite', 160),
    ('ampharosite', 181),
    ('steelixite', 208),
    ('scizorite', 212),
    ('heracronite', 214),
    ('skarmorite', 227),
    ('houndoominite', 229),
    ('tyranitarite', 248),
    ('sceptilite', 254),
    ('blazikenite', 257),
    ('swampertite', 260),
    ('gardevoirite', 282),
    ('sablenite', 302),
    ('mawilite', 303),
    ('aggronite', 306),
    ('medichamite', 308),
    ('manectite', 310),
    ('sharpedonite', 319),
    ('cameruptite', 323),
    ('altarianite', 334),
    ('banettite', 354),
    ('chimechite', 358),
    ('absolite', 359),
    ('absolite-z', 359),
    ('glalitite', 362),
    ('salamencite', 373),
    ('metagrossite', 376),
    ('latiasite', 380),
    ('latiosite', 381),
    ('staraptite', 398),
    ('lopunnite', 428),
    ('garchompite', 445),
    ('garchompite-z', 445),
    ('lucarionite', 448),
    ('lucarionite-z', 448),
    ('abomasite', 460),
    ('galladite', 475),
    ('froslassite', 478),
    ('heatranite', 485),
    ('darkranite', 491),
    ('emboarite', 500),
    ('excadrite', 530),
    ('audinite', 531),
    ('scolipite', 545),
    ('scraftinite', 560),
    ('eelektrossite', 604),
    ('chandelurite', 609),
    ('golurkite', 623)
  ) as m(slug, dex)
  where exists (select 1 from user_entries ue where ue.account_id = v_uid and m.dex::text = any(coalesce(ue.owned_species, '{}'::text[])))
  order by random() limit 1;
  if v_slug is null then return jsonb_build_object('ok', true, 'slug', null, 'none_owned', true); end if;
  update user_account ua set items_mega = jsonb_set(coalesce(ua.items_mega, '{}'::jsonb), array[v_slug],
      to_jsonb(coalesce((ua.items_mega ->> v_slug)::int, 0) + 1))
  where ua.id = v_uid;
  return jsonb_build_object('ok', true, 'slug', v_slug, 'mega', (select ua.items_mega from user_account ua where ua.id = v_uid));
end;
$$;
revoke execute on function award_mega(boolean) from public, anon;
grant execute on function award_mega(boolean) to authenticated;

create or replace function hold_item(p_entry uuid, p_item text default null) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_prev text; v_have int; v_berries jsonb; v_mega jsonb; v_stones jsonb; v_kind text;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  v_kind := case when p_item is null then null when _berry_info(p_item) is not null then 'berry'
                 when _mega_dex(p_item) is not null then 'mega' else 'bad' end;
  if v_kind = 'bad' then return jsonb_build_object('ok', false, 'reason', 'bad_item'); end if;

  select ue.held_item into v_prev from user_entries ue
   where ue.id = p_entry and ue.account_id = v_uid for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  if v_prev is not distinct from p_item then
    return jsonb_build_object('ok', true, 'prev', v_prev, 'state', _care_state(v_uid),
      'mega', (select ua.items_mega from user_account ua where ua.id = v_uid));
  end if;

  select coalesce(ua.items_berries, '{}'::jsonb), coalesce(ua.items_mega, '{}'::jsonb), coalesce(ua.items_stones, '{}'::jsonb)
    into v_berries, v_mega, v_stones from user_account ua where ua.id = v_uid for update;

  if v_kind = 'berry' then
    v_have := coalesce((v_berries ->> p_item)::int, 0);
    if v_have <= 0 then return jsonb_build_object('ok', false, 'reason', 'none'); end if;
    v_berries := case when v_have - 1 <= 0 then v_berries - p_item else jsonb_set(v_berries, array[p_item], to_jsonb(v_have - 1)) end;
  elsif v_kind = 'mega' then
    v_have := coalesce((v_mega ->> p_item)::int, 0);
    if v_have <= 0 then return jsonb_build_object('ok', false, 'reason', 'none'); end if;
    v_mega := case when v_have - 1 <= 0 then v_mega - p_item else jsonb_set(v_mega, array[p_item], to_jsonb(v_have - 1)) end;
  end if;

  -- 原本攜帶嘅道具退返背包
  if v_prev is not null and _berry_info(v_prev) is not null then
    v_berries := jsonb_set(v_berries, array[v_prev], to_jsonb(coalesce((v_berries ->> v_prev)::int, 0) + 1));
  elsif v_prev is not null and _mega_dex(v_prev) is not null then
    v_mega := jsonb_set(v_mega, array[v_prev], to_jsonb(coalesce((v_mega ->> v_prev)::int, 0) + 1));
  elsif v_prev in ('thunder', 'moon', 'fire', 'leaf', 'water') then
    v_stones := jsonb_set(v_stones, array[v_prev], to_jsonb(coalesce((v_stones ->> v_prev)::int, 0) + 1));
  end if;

  update user_account ua set items_berries = v_berries, items_mega = v_mega, items_stones = v_stones where ua.id = v_uid;
  update user_entries ue set held_item = p_item where ue.id = p_entry;

  return jsonb_build_object('ok', true, 'prev', v_prev, 'state', _care_state(v_uid), 'mega', v_mega);
end;
$$;
revoke execute on function hold_item(uuid, text) from public, anon;
grant execute on function hold_item(uuid, text) to authenticated;

-- 舊 client 相容：hold_berry 只收樹果，其餘交 hold_item（原本攜帶 Mega 石都會正確退返）
create or replace function hold_berry(p_entry uuid, p_berry text default null) returns jsonb
language plpgsql security definer set search_path = public
as $$
begin
  if p_berry is not null and _berry_info(p_berry) is null then
    return jsonb_build_object('ok', false, 'reason', 'bad_item');
  end if;
  return hold_item(p_entry, p_berry);
end;
$$;
revoke execute on function hold_berry(uuid, text) from public, anon;
grant execute on function hold_berry(uuid, text) to authenticated;

-- release_to_oak：攜帶 Mega 石都退返（其餘同 20261105g）
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
  elsif e.held_item is not null and _mega_dex(e.held_item) is not null then
    update user_account ua set items_mega = jsonb_set(coalesce(ua.items_mega, '{}'::jsonb), array[e.held_item],
      to_jsonb(coalesce((ua.items_mega ->> e.held_item)::int, 0) + 1)) where ua.id = v_uid;
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
