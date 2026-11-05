-- ============================================================
-- Migration 20261105f：背包第 3b 段（67 款樹果取代 food／premium）
--
-- 1. user_account.items_berries jsonb {slug: n}（只經 RPC 寫）；berry_award jsonb（每日掉落上限）
-- 2. 舊庫存一換一：items_food → oran-berry、items_premium → sitrus-berry，之後 food／premium 歸 0
-- 3. care_feed：接受樹果 slug（Super +50／Normal +25）；Pomeg 等 6 款同時 EV −10（唔退 unit）
--    舊 'food'／'premium' 照收（相容未更新嘅 client）
-- 4. award_berry(p_perfect)：10/10 → Super 樹果、1–9 題 → Normal 樹果；同級按權重（常用 3、其餘 1）；每日 60 次
-- 5. _care_state 回傳 berries + evs；settle_battle_team 識扣樹果
-- 分級／權重同 js/care.js BERRY_ROWS 一致（spec bag-system-spec §6.2）
-- 慣例（Rule 9）：v_／p_ 前綴、column 加 alias；回傳 jsonb
-- ============================================================

alter table public.user_account
  add column if not exists items_berries jsonb,
  add column if not exists berry_award   jsonb;
grant select (items_berries, berry_award) on public.user_account to authenticated;

-- 舊 food／premium 一換一（只做一次：items_berries 仲係 null 先換）
update public.user_account ua set
  items_berries = (case when coalesce(ua.items_food, 0) > 0 then jsonb_build_object('oran-berry', ua.items_food) else '{}'::jsonb end)
               || (case when coalesce(ua.items_premium, 0) > 0 then jsonb_build_object('sitrus-berry', ua.items_premium) else '{}'::jsonb end),
  items_food = 0, items_premium = 0
where ua.items_berries is null;

-- 樹果資料（分級 + 權重 + 扣 EV）
create or replace function _berry_info(p_slug text) returns jsonb
language sql immutable set search_path = public
as $$
  select case
    when p_slug in ('sitrus-berry','lum-berry') then '{"tier":"super","w":3}'::jsonb
    when p_slug in ('figy-berry','wiki-berry','mago-berry','aguav-berry','iapapa-berry','liechi-berry','ganlon-berry','salac-berry',
                    'petaya-berry','apicot-berry','lansat-berry','starf-berry','micle-berry','custap-berry','enigma-berry',
                    'jaboca-berry','rowap-berry','kee-berry','maranga-berry') then '{"tier":"super","w":1}'::jsonb
    when p_slug in ('cheri-berry','chesto-berry','pecha-berry','rawst-berry','aspear-berry','persim-berry','oran-berry','leppa-berry')
      then '{"tier":"normal","w":3}'::jsonb
    when p_slug = 'pomeg-berry' then '{"tier":"normal","w":1,"ev":"hp"}'::jsonb
    when p_slug = 'kelpsy-berry' then '{"tier":"normal","w":1,"ev":"atk"}'::jsonb
    when p_slug = 'qualot-berry' then '{"tier":"normal","w":1,"ev":"def"}'::jsonb
    when p_slug = 'hondew-berry' then '{"tier":"normal","w":1,"ev":"spa"}'::jsonb
    when p_slug = 'grepa-berry' then '{"tier":"normal","w":1,"ev":"spd"}'::jsonb
    when p_slug = 'tamato-berry' then '{"tier":"normal","w":1,"ev":"spe"}'::jsonb
    when p_slug in ('occa-berry','passho-berry','wacan-berry','rindo-berry','yache-berry','chople-berry','kebia-berry','shuca-berry',
                    'coba-berry','payapa-berry','tanga-berry','charti-berry','kasib-berry','haban-berry','colbur-berry','babiri-berry',
                    'roseli-berry','chilan-berry','razz-berry','bluk-berry','nanab-berry','wepear-berry','pinap-berry','cornn-berry',
                    'magost-berry','rabuta-berry','nomel-berry','spelon-berry','pamtre-berry','watmel-berry','durin-berry','belue-berry')
      then '{"tier":"normal","w":1}'::jsonb
    else null end;
$$;

create or replace function _care_state(p_uid uuid) returns jsonb
language sql security definer set search_path = public
as $$
  select jsonb_build_object(
    'now', (extract(epoch from now()) * 1000)::bigint,
    'entries', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', ue.id, 'fullness', ue.pet_health, 'hp', ue.hp_permille, 'status', ue.status,
        'poison', coalesce(ue.poison_level, 0), 'status_since', ue.status_since,
        'vomit', coalesce(ue.vomit_count, 0), 'od', coalesce(ue.od_count, 0),
        'fullness_at', ue.pet_updated_at, 'care_at', ue.care_at, 'active', ue.active))
        from user_entries ue where ue.account_id = p_uid), '[]'::jsonb),
    'evs', (select coalesce(jsonb_object_agg(ue.id, coalesce(ue.evs, '{}'::jsonb)), '{}'::jsonb) from user_entries ue where ue.account_id = p_uid),
    'items', (select jsonb_build_object(
        'meds', coalesce(ua.items_meds, '{}'::jsonb),
        'berries', coalesce(ua.items_berries, '{}'::jsonb),
        'food', coalesce(ua.items_food, 0), 'premium', coalesce(ua.items_premium, 0),
        'revive', coalesce(ua.items_revive, 0))
      from user_account ua where ua.id = p_uid)
  );
$$;
revoke execute on function _care_state(uuid) from public, anon, authenticated;

-- 餵食：樹果 slug（或舊 food／premium）
create or replace function care_feed(p_entry uuid, p_kind text) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  e record;
  v_info jsonb; v_have int; v_full int; v_hp int; v_vomit int; v_add int; v_event text := 'fed';
  v_berries jsonb; v_evstat text; v_evs jsonb; v_cut int := 0;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  v_info := _berry_info(p_kind);
  if p_kind not in ('food', 'premium') and v_info is null then return jsonb_build_object('ok', false, 'reason', 'bad_kind'); end if;
  perform _care_settle_user(v_uid);

  select ue.id, ue.pet_health, ue.hp_permille, ue.status, ue.vomit_count, ue.evs into e
    from user_entries ue where ue.id = p_entry and ue.account_id = v_uid for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;

  v_hp := coalesce(e.hp_permille, 1000);
  if v_hp <= 0 then return jsonb_build_object('ok', false, 'reason', 'fainted'); end if;
  if e.status in ('par', 'slp', 'frz') then return jsonb_build_object('ok', false, 'reason', 'status_' || e.status); end if;

  select coalesce(ua.items_berries, '{}'::jsonb),
         case when p_kind = 'food' then coalesce(ua.items_food, 0) when p_kind = 'premium' then coalesce(ua.items_premium, 0) else 0 end
    into v_berries, v_have from user_account ua where ua.id = v_uid for update;
  if v_info is not null then v_have := coalesce((v_berries ->> p_kind)::int, 0); end if;
  if coalesce(v_have, 0) <= 0 then return jsonb_build_object('ok', false, 'reason', 'no_item'); end if;

  v_add := case when v_info is not null then (case when v_info ->> 'tier' = 'super' then 50 else 25 end)
                when p_kind = 'premium' then 50 else 25 end;
  v_full := coalesce(e.pet_health, 100);
  v_vomit := coalesce(e.vomit_count, 0);
  if v_full >= 100 then
    v_vomit := v_vomit + 1;
    if v_vomit >= 3 or v_hp <= 250 then v_hp := 0; v_event := 'faint'; v_vomit := 0;
    else v_hp := v_hp - 250; v_event := case when v_vomit = 1 then 'vomit' else 'vomit_severe' end; end if;
  else
    v_full := least(100, v_full + v_add);
    v_vomit := 0;
  end if;

  -- Pomeg 等：食咗即該項 EV −10（唔退 unit）
  v_evs := coalesce(e.evs, '{}'::jsonb);
  v_evstat := v_info ->> 'ev';
  if v_evstat is not null then
    v_cut := least(10, coalesce((v_evs ->> v_evstat)::int, 0));
    v_evs := jsonb_set(v_evs, array[v_evstat], to_jsonb(coalesce((v_evs ->> v_evstat)::int, 0) - v_cut));
  end if;

  update user_entries ue set
    pet_health = v_full, hp_permille = v_hp, vomit_count = v_vomit, evs = v_evs,
    status = case when v_hp <= 0 then null else ue.status end,
    poison_level = case when v_hp <= 0 then 0 else ue.poison_level end,
    status_since = case when v_hp <= 0 then null else ue.status_since end
  where ue.id = e.id;

  if v_info is not null then
    update user_account ua set items_berries = case when v_have - 1 <= 0 then v_berries - p_kind
      else jsonb_set(v_berries, array[p_kind], to_jsonb(v_have - 1)) end where ua.id = v_uid;
  elsif p_kind = 'food' then
    update user_account ua set items_food = ua.items_food - 1 where ua.id = v_uid;
  else
    update user_account ua set items_premium = ua.items_premium - 1 where ua.id = v_uid;
  end if;

  return jsonb_build_object('ok', true, 'event', v_event, 'ev_cut', v_cut, 'state', _care_state(v_uid));
end;
$$;

-- 答題掉樹果
create or replace function award_berry(p_perfect boolean) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_day text := to_char(now() at time zone 'Asia/Hong_Kong', 'YYYY-MM-DD');
  v_award jsonb; v_n int; v_slug text; v_pool text[];
  v_super3 text[] := array['sitrus-berry','lum-berry'];
  v_super1 text[] := array['figy-berry','wiki-berry','mago-berry','aguav-berry','iapapa-berry','liechi-berry','ganlon-berry','salac-berry',
                           'petaya-berry','apicot-berry','lansat-berry','starf-berry','micle-berry','custap-berry','enigma-berry',
                           'jaboca-berry','rowap-berry','kee-berry','maranga-berry'];
  v_norm3 text[] := array['cheri-berry','chesto-berry','pecha-berry','rawst-berry','aspear-berry','persim-berry','oran-berry','leppa-berry'];
  v_norm1 text[] := array['occa-berry','passho-berry','wacan-berry','rindo-berry','yache-berry','chople-berry','kebia-berry','shuca-berry',
                          'coba-berry','payapa-berry','tanga-berry','charti-berry','kasib-berry','haban-berry','colbur-berry','babiri-berry',
                          'roseli-berry','chilan-berry','pomeg-berry','kelpsy-berry','qualot-berry','hondew-berry','grepa-berry','tamato-berry',
                          'razz-berry','bluk-berry','nanab-berry','wepear-berry','pinap-berry','cornn-berry','magost-berry','rabuta-berry',
                          'nomel-berry','spelon-berry','pamtre-berry','watmel-berry','durin-berry','belue-berry'];
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  select coalesce(ua.berry_award, '{}'::jsonb) into v_award from user_account ua where ua.id = v_uid for update;
  v_n := case when v_award ->> 'day' = v_day then coalesce((v_award ->> 'n')::int, 0) else 0 end;
  if v_n >= 60 then return jsonb_build_object('ok', true, 'slug', null, 'capped', true); end if;
  -- 權重 3 = 放 3 次入池
  v_pool := case when coalesce(p_perfect, false)
    then v_super3 || v_super3 || v_super3 || v_super1
    else v_norm3 || v_norm3 || v_norm3 || v_norm1 end;
  v_slug := v_pool[1 + floor(random() * array_length(v_pool, 1))::int];
  update user_account ua set
    items_berries = jsonb_set(coalesce(ua.items_berries, '{}'::jsonb), array[v_slug],
                      to_jsonb(coalesce((ua.items_berries ->> v_slug)::int, 0) + 1)),
    berry_award = jsonb_build_object('day', v_day, 'n', v_n + 1)
  where ua.id = v_uid;
  return jsonb_build_object('ok', true, 'slug', v_slug,
    'berries', (select ua.items_berries from user_account ua where ua.id = v_uid));
end;
$$;

-- 戰鬥完結：多咗扣樹果
create or replace function settle_battle_team(p_team jsonb, p_used jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  t jsonb; v_id uuid; v_hp int; v_st text; v_pl int; k text; v_n int; v_have int;
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

revoke execute on function award_berry(boolean) from public, anon;
grant execute on function award_berry(boolean) to authenticated;
revoke execute on function care_feed(uuid, text) from public, anon;
grant execute on function care_feed(uuid, text) to authenticated;
revoke execute on function settle_battle_team(jsonb, jsonb) from public, anon;
grant execute on function settle_battle_team(jsonb, jsonb) to authenticated;

notify pgrst, 'reload schema';
