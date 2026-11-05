-- ============================================================
-- Migration 20261105c：飽肚值・HP・狀態・用藥（狀態系統第一期，server 權威）
--
-- Spec：.trae/documents/status-hp-system-spec-20261105.md
-- 計劃：.trae/documents/plan-status-phase1-20261105.md
--
-- 1. user_entries 新欄位（HP／狀態／過量／嘔吐），只經 RPC 寫
-- 2. user_account.items_meds（7 種藥）+ meds_award（每日掉藥上限）
-- 3. 收回 pet_* 嘅 client 直寫權（飽肚值改由 RPC 結算）
-- 4. RPC：care_settle / care_feed / care_use_item / award_meds / settle_battle_team
-- 5. 遷移：HP 設滿（飽肚值 0 → Faint）、送測試藥包
--
-- 慣例（Rule 9）：變數 v_ 前綴、參數 p_ 前綴、column 一律加 alias；回傳 jsonb，唔用 returns table
-- 用法：Supabase Dashboard → SQL Editor → New Query → 全段 Run
-- ============================================================

-- -------------------- 1. 欄位 --------------------
alter table public.user_entries
  add column if not exists hp_permille  smallint,
  add column if not exists status       text,
  add column if not exists poison_level smallint,
  add column if not exists status_since timestamptz,
  add column if not exists care_at      timestamptz,
  add column if not exists med_log      jsonb,
  add column if not exists od_count     smallint,
  add column if not exists vomit_count  smallint;

alter table public.user_account
  add column if not exists items_meds  jsonb,
  add column if not exists meds_award  jsonb;

-- 只開 select（寫入一律經 security definer RPC）
grant select (hp_permille, status, poison_level, status_since, care_at, med_log, od_count, vomit_count)
  on public.user_entries to authenticated;
grant select (items_meds, meds_award) on public.user_account to authenticated;

-- 飽肚值改 server 結算：收回 client 直寫（pet_health 仍然 = 飽肚值）
revoke update (pet_health, pet_streak, pet_last_fed_day, pet_settled_day, pet_decay_day, pet_updated_at)
  on public.user_entries from authenticated;

-- -------------------- 2. 遷移（只補 null，可重複執行） --------------------
update public.user_entries ue
   set hp_permille = case when coalesce(ue.pet_health, 100) <= 0 then 0 else 1000 end
 where ue.hp_permille is null;

update public.user_account ua
   set items_meds = '{"potion":3,"super_potion":1,"antidote":1,"burn_heal":1,"paralyze_heal":1,"awakening":1,"ice_heal":1}'::jsonb
 where ua.items_meds is null;

-- -------------------- 3. 內部：結算一個用戶全部 entry --------------------
-- 拍檔（active）：飽肚值下降（燒傷 ×1.5）、燒傷 −0.5%／中毒 −1%／嚴重中毒 −2% 每分鐘
-- 非拍檔：飽肚值／HP 凍結，錨點推到而家；睡眠／冰凍 30 分鐘照計
create or replace function _care_settle_user(p_uid uuid) returns void
language plpgsql security definer set search_path = public
as $$
declare
  r record;
  v_now timestamptz := now();
  v_full int; v_hp int; v_st text; v_pl int; v_vomit int;
  v_fa timestamptz; v_ca timestamptz; v_since timestamptz;
  v_per_sec numeric; v_loss int; v_rate int; v_min int;
  v_cap interval := interval '60 days';
begin
  for r in
    select ue.id, ue.active, ue.pet_health, ue.hp_permille, ue.status, ue.poison_level,
           ue.status_since, ue.care_at, ue.pet_updated_at, ue.vomit_count
      from user_entries ue
     where ue.account_id = p_uid
     for update
  loop
    v_full := coalesce(r.pet_health, 100);
    v_hp := coalesce(r.hp_permille, 1000);
    v_st := r.status;
    v_pl := coalesce(r.poison_level, 0);
    v_vomit := coalesce(r.vomit_count, 0);
    v_fa := greatest(coalesce(r.pet_updated_at, v_now), v_now - v_cap);
    v_ca := greatest(coalesce(r.care_at, v_now), v_now - v_cap);
    v_since := r.status_since;

    if coalesce(r.active, false) and v_hp > 0 then
      -- 飽肚值：每 15 分鐘 −1（燒傷每 10 分鐘 −1），整數扣、餘數留落次
      v_per_sec := case when v_st = 'brn' then 600 else 900 end;
      v_loss := floor(extract(epoch from (v_now - v_fa)) / v_per_sec)::int;
      if v_loss > 0 and v_full > 0 then
        v_full := greatest(0, v_full - v_loss);
        v_fa := v_fa + make_interval(secs => v_loss * v_per_sec);
      end if;
      -- HP 流失（千分比／分鐘）
      v_rate := case when v_st = 'brn' then 5
                     when v_st = 'psn' and v_pl >= 2 then 20
                     when v_st = 'psn' then 10 else 0 end;
      v_min := floor(extract(epoch from (v_now - v_ca)) / 60)::int;
      if v_rate > 0 and v_min > 0 then
        v_hp := greatest(0, v_hp - v_rate * v_min);
        v_ca := v_ca + make_interval(mins => v_min);
      elsif v_rate = 0 then
        v_ca := v_now;
      end if;
    else
      v_fa := v_now;
      v_ca := v_now;
    end if;

    -- 睡眠／冰凍：由寫入嗰刻起 30 分鐘自然解除（拍檔同非拍檔都計）
    if v_st in ('slp', 'frz') and v_since is not null and v_since + interval '30 minutes' <= v_now then
      v_st := null;
    end if;

    -- 飽肚值 0 = Faint（HP 同時 0）；Faint 清走所有狀態
    if v_full <= 0 then v_full := 0; v_hp := 0; end if;
    if v_hp <= 0 then v_hp := 0; v_st := null; end if;
    if v_st is distinct from 'psn' then v_pl := 0; end if;
    if v_st not in ('slp', 'frz') or v_st is null then v_since := null; end if;
    if v_full < 100 then v_vomit := 0; end if;

    update user_entries ue set
      pet_health = v_full, hp_permille = v_hp, status = v_st, poison_level = v_pl,
      status_since = v_since, pet_updated_at = v_fa, care_at = v_ca, vomit_count = v_vomit
    where ue.id = r.id;
  end loop;
end;
$$;
revoke execute on function _care_settle_user(uuid) from public, anon, authenticated;

-- 內部：回傳用戶全部 entry 嘅 care 狀態 + 背包數量
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
    'items', (select jsonb_build_object(
        'meds', coalesce(ua.items_meds, '{}'::jsonb),
        'food', coalesce(ua.items_food, 0), 'premium', coalesce(ua.items_premium, 0),
        'revive', coalesce(ua.items_revive, 0))
      from user_account ua where ua.id = p_uid)
  );
$$;
revoke execute on function _care_state(uuid) from public, anon, authenticated;

-- -------------------- 4. RPC --------------------

-- 開 app／換拍檔前／每隔一陣：結算經過時間
create or replace function care_settle() returns jsonb
language plpgsql security definer set search_path = public
as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  perform _care_settle_user(v_uid);
  return _care_state(v_uid);
end;
$$;

-- 餵食：food（+25）／premium（+50）；麻痹／睡眠／冰凍／Faint 唔准；飽肚值已 100 → 嘔吐階梯
create or replace function care_feed(p_entry uuid, p_kind text) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  e record;
  v_have int; v_full int; v_hp int; v_vomit int; v_event text := 'fed';
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if p_kind not in ('food', 'premium') then return jsonb_build_object('ok', false, 'reason', 'bad_kind'); end if;
  perform _care_settle_user(v_uid);

  select ue.id, ue.pet_health, ue.hp_permille, ue.status, ue.vomit_count into e
    from user_entries ue where ue.id = p_entry and ue.account_id = v_uid for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;

  v_hp := coalesce(e.hp_permille, 1000);
  if v_hp <= 0 then return jsonb_build_object('ok', false, 'reason', 'fainted'); end if;
  if e.status in ('par', 'slp', 'frz') then return jsonb_build_object('ok', false, 'reason', 'status_' || e.status); end if;

  select case when p_kind = 'food' then coalesce(ua.items_food, 0) else coalesce(ua.items_premium, 0) end
    into v_have from user_account ua where ua.id = v_uid for update;
  if coalesce(v_have, 0) <= 0 then return jsonb_build_object('ok', false, 'reason', 'no_item'); end if;

  v_full := coalesce(e.pet_health, 100);
  v_vomit := coalesce(e.vomit_count, 0);
  if v_full >= 100 then
    -- 嘔吐 → 嚴重嘔吐 → Faint；每次 −25% maxHP，唔夠 25% 直接 Faint
    v_vomit := v_vomit + 1;
    if v_vomit >= 3 or v_hp <= 250 then
      v_hp := 0; v_event := 'faint'; v_vomit := 0;
    else
      v_hp := v_hp - 250; v_event := case when v_vomit = 1 then 'vomit' else 'vomit_severe' end;
    end if;
  else
    v_full := least(100, v_full + case when p_kind = 'premium' then 50 else 25 end);
    v_vomit := 0;
  end if;

  update user_entries ue set
    pet_health = v_full, hp_permille = v_hp, vomit_count = v_vomit,
    status = case when v_hp <= 0 then null else ue.status end,
    poison_level = case when v_hp <= 0 then 0 else ue.poison_level end,
    status_since = case when v_hp <= 0 then null else ue.status_since end
  where ue.id = e.id;

  if p_kind = 'food' then
    update user_account ua set items_food = ua.items_food - 1 where ua.id = v_uid;
  else
    update user_account ua set items_premium = ua.items_premium - 1 where ua.id = v_uid;
  end if;

  return jsonb_build_object('ok', true, 'event', v_event, 'state', _care_state(v_uid));
end;
$$;

-- 用藥（育成）：7 種藥 + revive
-- 過量：1 分鐘內 3 次 → 中毒；中毒期間再 3 次 → 嚴重中毒；嚴重中毒期間再 3 次 → Faint
-- 育成過量會覆蓋燒傷／麻痹／睡眠／冰凍；revive 唔計過量
create or replace function care_use_item(p_entry uuid, p_item text) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  e record;
  v_meds jsonb; v_have int;
  v_hp int; v_st text; v_pl int; v_od int; v_log jsonb; v_since timestamptz;
  v_now_ms bigint := (extract(epoch from clock_timestamp()) * 1000)::bigint;
  v_recent int; v_event text := 'used';
  v_items text[] := array['potion','super_potion','antidote','burn_heal','paralyze_heal','awakening','ice_heal','revive'];
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if not (p_item = any(v_items)) then return jsonb_build_object('ok', false, 'reason', 'bad_item'); end if;
  perform _care_settle_user(v_uid);

  select ue.id, ue.hp_permille, ue.status, ue.poison_level, ue.od_count, ue.med_log, ue.status_since into e
    from user_entries ue where ue.id = p_entry and ue.account_id = v_uid for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;

  select coalesce(ua.items_meds, '{}'::jsonb), coalesce(ua.items_revive, 0) into v_meds, v_have
    from user_account ua where ua.id = v_uid for update;
  if p_item <> 'revive' then v_have := coalesce((v_meds ->> p_item)::int, 0); end if;
  if v_have <= 0 then return jsonb_build_object('ok', false, 'reason', 'no_item'); end if;

  v_hp := coalesce(e.hp_permille, 1000);
  v_st := e.status; v_pl := coalesce(e.poison_level, 0); v_od := coalesce(e.od_count, 0);
  v_log := coalesce(e.med_log, '[]'::jsonb); v_since := e.status_since;

  if p_item = 'revive' then
    if v_hp > 0 then return jsonb_build_object('ok', false, 'reason', 'not_fainted'); end if;
    update user_entries ue set
      hp_permille = 1000, pet_health = 100, status = null, poison_level = 0, status_since = null,
      od_count = 0, med_log = '[]'::jsonb, vomit_count = 0, care_at = now(), pet_updated_at = now()
    where ue.id = e.id;
    update user_account ua set items_revive = ua.items_revive - 1 where ua.id = v_uid;
    return jsonb_build_object('ok', true, 'event', 'revived', 'state', _care_state(v_uid));
  end if;

  if v_hp <= 0 then return jsonb_build_object('ok', false, 'reason', 'fainted'); end if;

  -- 1) 藥效（回復藥只回 HP，唔解狀態）
  if p_item = 'potion' then v_hp := least(1000, v_hp + 250);
  elsif p_item = 'super_potion' then v_hp := least(1000, v_hp + 500);
  elsif p_item = 'antidote' and v_st = 'psn' then v_st := null; v_pl := 0; v_od := 0;
  elsif p_item = 'burn_heal' and v_st = 'brn' then v_st := null;
  elsif p_item = 'paralyze_heal' and v_st = 'par' then v_st := null;
  elsif p_item = 'awakening' and v_st = 'slp' then v_st := null;
  elsif p_item = 'ice_heal' and v_st = 'frz' then v_st := null;
  end if;

  -- 2) 過量（所有藥都計，revive 除外）：先記錄時間戳，保留 60 秒內最近 3 個
  select coalesce(jsonb_agg(x.t order by x.t), '[]'::jsonb) into v_log
    from (select value::bigint as t from jsonb_array_elements_text(v_log || to_jsonb(v_now_ms))) x
   where x.t > v_now_ms - 60000;
  if jsonb_array_length(v_log) > 3 then
    select jsonb_agg(y.t order by y.t) into v_log
      from (select value::bigint as t from jsonb_array_elements_text(v_log) order by value::bigint desc limit 3) y;
  end if;
  v_recent := jsonb_array_length(v_log);

  if v_st = 'psn' then
    v_od := v_od + 1;
    if v_od >= 3 then
      if v_pl >= 2 then v_hp := 0; v_event := 'od_faint';
      else v_pl := 2; v_od := 0; v_event := 'od_severe'; end if;
    end if;
  elsif v_recent >= 3 then
    v_st := 'psn'; v_pl := 1; v_od := 0; v_log := '[]'::jsonb; v_event := 'od_poison';
  end if;

  if v_hp <= 0 then v_hp := 0; v_st := null; v_pl := 0; v_od := 0; end if;
  if v_st not in ('slp', 'frz') or v_st is null then v_since := null; end if;

  update user_entries ue set
    hp_permille = v_hp, status = v_st, poison_level = v_pl, od_count = v_od, med_log = v_log,
    status_since = v_since,
    care_at = case when v_st in ('psn', 'brn') and ue.status is distinct from v_st then now() else ue.care_at end
  where ue.id = e.id;
  update user_account ua
     set items_meds = jsonb_set(coalesce(ua.items_meds, '{}'::jsonb), array[p_item], to_jsonb(v_have - 1))
   where ua.id = v_uid;

  return jsonb_build_object('ok', true, 'event', v_event, 'state', _care_state(v_uid));
end;
$$;

-- 答題掉藥：全對穩掉 1 隻、1–9 題 10%；7 種平均；每日最多 40 次（防重複 call）
create or replace function award_meds(p_perfect boolean) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_day text := to_char(now() at time zone 'Asia/Hong_Kong', 'YYYY-MM-DD');
  v_award jsonb; v_n int; v_slug text;
  v_kinds text[] := array['potion','super_potion','antidote','burn_heal','paralyze_heal','awakening','ice_heal'];
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  select coalesce(ua.meds_award, '{}'::jsonb) into v_award from user_account ua where ua.id = v_uid for update;
  v_n := case when v_award ->> 'day' = v_day then coalesce((v_award ->> 'n')::int, 0) else 0 end;
  if v_n >= 40 then return jsonb_build_object('ok', true, 'slug', null, 'capped', true); end if;
  if not coalesce(p_perfect, false) and random() >= 0.10 then
    return jsonb_build_object('ok', true, 'slug', null);
  end if;
  v_slug := v_kinds[1 + floor(random() * array_length(v_kinds, 1))::int];
  update user_account ua set
    items_meds = jsonb_set(coalesce(ua.items_meds, '{}'::jsonb), array[v_slug],
                   to_jsonb(coalesce((ua.items_meds ->> v_slug)::int, 0) + 1)),
    meds_award = jsonb_build_object('day', v_day, 'n', v_n + 1)
  where ua.id = v_uid;
  return jsonb_build_object('ok', true, 'slug', v_slug,
    'meds', (select ua.items_meds from user_account ua where ua.id = v_uid));
end;
$$;

-- 戰鬥正常完結：一次過寫出戰隊伍嘅 HP／狀態，扣用咗嘅藥（中途斷線唔會 call）
-- p_team：[{ "id": uuid, "hp": 0–1000, "status": null|brn|par|slp|frz|psn, "poison": 1|2 }]
-- p_used：{ "potion": n, ..., "revive": n }
create or replace function settle_battle_team(p_team jsonb, p_used jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  t jsonb; v_id uuid; v_hp int; v_st text; v_pl int; k text; v_n int;
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
      status_since = case when v_st in ('slp', 'frz') then now() else null end,   -- 30 分鐘由戰鬥結束寫入嗰刻起計
      care_at = now(), od_count = 0, med_log = '[]'::jsonb
    where ue.id = v_id and ue.account_id = v_uid;
  end loop;

  if jsonb_typeof(p_used) = 'object' then
    for k in select jsonb_object_keys(p_used) loop
      if not (k = any(v_items)) then continue; end if;
      v_n := greatest(0, least(99, coalesce((p_used ->> k)::int, 0)));
      if v_n = 0 then continue; end if;
      if k = 'revive' then
        update user_account ua set items_revive = greatest(0, coalesce(ua.items_revive, 0) - v_n) where ua.id = v_uid;
      else
        update user_account ua set items_meds = jsonb_set(coalesce(ua.items_meds, '{}'::jsonb), array[k],
          to_jsonb(greatest(0, coalesce((ua.items_meds ->> k)::int, 0) - v_n))) where ua.id = v_uid;
      end if;
    end loop;
  end if;

  return jsonb_build_object('ok', true, 'state', _care_state(v_uid));
end;
$$;

revoke execute on function care_settle() from public, anon;
grant execute on function care_settle() to authenticated;
revoke execute on function care_feed(uuid, text) from public, anon;
grant execute on function care_feed(uuid, text) to authenticated;
revoke execute on function care_use_item(uuid, text) from public, anon;
grant execute on function care_use_item(uuid, text) to authenticated;
revoke execute on function award_meds(boolean) from public, anon;
grant execute on function award_meds(boolean) to authenticated;
revoke execute on function settle_battle_team(jsonb, jsonb) from public, anon;
grant execute on function settle_battle_team(jsonb, jsonb) to authenticated;

notify pgrst, 'reload schema';
