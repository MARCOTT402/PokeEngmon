-- ============================================================
-- 20261102b：每日任務板 Daily Quests ＋ 能量經濟改版
--
-- 新規則（v1.25.0）：
--   · 唯一能量來源 = 每日任務「努力學習」：每 10 題完成 1 次
--   · 每日最多完成 8 次；手動 CLAIM 先入帳
--   · 能量可累積、冇持有上限；取消每日登入 +1
--   · 取消每日消耗上限（每場對戰仍然扣 1 EP）
--   · 未領取嘅任務跨日保留（carried）
--
-- ledger（user_account.energy）欄位：
--   day / points / quests（今日已完成次數）/ claimed（今日已領次數）
--   carried（跨日帶落嚟嘅未領次數）/ spent（今日消耗）
--
-- 依賴：supabase-migrate-20261101f-battle-energy.sql、
--       supabase-migrate-20261101g-battle-progress.sql 已執行
-- 套用方法：Supabase Dashboard → SQL Editor 貼上執行
-- ============================================================

-- ------------------------------------------------------------
-- 1) 共用：刷新能量 ledger（跨日 roll、任務完成次數）
--    只做計算同寫入，回傳最新 ledger
-- ------------------------------------------------------------
create or replace function battle_energy_refresh(p_questions_today int default 0)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_today text := battle_energy_today();
  v_e jsonb;
  v_points int; v_quests int; v_claimed int; v_carried int; v_spent int;
  v_q int; v_blocks int;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;

  select coalesce(ua.energy, '{}'::jsonb) into v_e from user_account ua where ua.id = v_uid;
  if not found then raise exception 'account not found'; end if;

  if (v_e ->> 'day') is distinct from v_today then
    -- 跨日：保留點數；未領取（quests - claimed）帶入 carried
    v_quests := greatest(0, coalesce((v_e ->> 'quests')::int, 0));
    -- 舊 schema 冇 claimed：當時 quests 已自動派過，當成已領，避免重複派
    v_claimed := greatest(0, least(v_quests, coalesce((v_e ->> 'claimed')::int, v_quests)));
    v_carried := greatest(0, coalesce((v_e ->> 'carried')::int, 0)) + (v_quests - v_claimed);
    v_points := greatest(0, coalesce((v_e ->> 'points')::int, 0));
    v_quests := 0; v_claimed := 0; v_spent := 0;
  else
    v_points := greatest(0, coalesce((v_e ->> 'points')::int, 0));
    v_quests := greatest(0, coalesce((v_e ->> 'quests')::int, 0));
    v_claimed := greatest(0, least(v_quests, coalesce((v_e ->> 'claimed')::int, v_quests)));
    v_carried := greatest(0, coalesce((v_e ->> 'carried')::int, 0));
    v_spent := greatest(0, coalesce((v_e ->> 'spent')::int, 0));
  end if;

  -- 答題任務：每 10 題 = 完成 1 次，每日最多 8 次（唔自動派獎）
  v_q := greatest(0, least(coalesce(p_questions_today, 0), 100000));
  v_blocks := least(8, v_q / 10);
  if v_blocks > v_quests then v_quests := v_blocks; end if;

  v_e := jsonb_build_object(
    'day', v_today, 'points', v_points, 'quests', v_quests,
    'claimed', v_claimed, 'carried', v_carried, 'spent', v_spent
  );

  update user_account ua set energy = v_e, updated_at = (extract(epoch from now()) * 1000)::bigint
  where ua.id = v_uid;

  return v_e;
end;
$$;

-- ------------------------------------------------------------
-- 2) 任務板狀態（每日任務板 / battle_progress 都用呢個）
-- ------------------------------------------------------------
create or replace function battle_quest_status(p_questions_today int default 0)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_e jsonb;
  v_q int;
begin
  v_e := battle_energy_refresh(p_questions_today);
  v_q := greatest(0, coalesce(p_questions_today, 0));
  return jsonb_build_object(
    'points', (v_e ->> 'points')::int,
    'quests', (v_e ->> 'quests')::int,
    'claimed', (v_e ->> 'claimed')::int,
    'carried', (v_e ->> 'carried')::int,
    'claimable', ((v_e ->> 'quests')::int - (v_e ->> 'claimed')::int)
                 + (v_e ->> 'carried')::int,
    'daily_max', 8,
    'step', 10,
    'done', ((v_e ->> 'quests')::int >= 8),
    'need_questions', case
      when (v_e ->> 'quests')::int >= 8 then 0
      else 10 - (v_q % 10) end,
    'questions_today', v_q,
    'allowed', ((v_e ->> 'points')::int >= 1),
    'no_points', ((v_e ->> 'points')::int < 1),
    'spent_today', (v_e ->> 'spent')::int,
    'day', v_e ->> 'day',
    'energy', v_e
  );
end;
$$;

-- 舊呼叫（battle.js / 其他頁面）保持向後兼容
create or replace function battle_energy_status(p_questions_today int default 0)
returns jsonb
language plpgsql security definer set search_path = public
as $$
begin
  return battle_quest_status(coalesce(p_questions_today, 0))
    || jsonb_build_object('max', 8, 'earned_today', 0, 'spend_cap', null);
end;
$$;

-- ------------------------------------------------------------
-- 3) 手動領取（server 會 clamp 到未領取數量）
-- ------------------------------------------------------------
create or replace function claim_battle_quests(p_count int default 1, p_questions_today int default 0)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_e jsonb;
  v_quests int; v_claimed int; v_carried int; v_spent int; v_points int;
  v_claimable int; v_take int; v_from_carried int;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;

  v_e := battle_energy_refresh(p_questions_today);

  v_quests := (v_e ->> 'quests')::int;
  v_claimed := (v_e ->> 'claimed')::int;
  v_carried := (v_e ->> 'carried')::int;
  v_spent := (v_e ->> 'spent')::int;
  v_points := (v_e ->> 'points')::int;
  v_claimable := v_carried + (v_quests - v_claimed);

  v_take := greatest(0, least(greatest(1, coalesce(p_count, 1)), v_claimable));
  if v_take = 0 then
    return jsonb_build_object('claimed', 0, 'claimable', 0, 'energy', v_e);
  end if;

  -- 先領跨日帶落嚟嘅，再領今日嘅
  v_from_carried := least(v_take, v_carried);

  v_e := jsonb_build_object(
    'day', v_e ->> 'day',
    'points', v_points + v_take,
    'quests', v_quests,
    'claimed', v_claimed + (v_take - v_from_carried),
    'carried', v_carried - v_from_carried,
    'spent', v_spent
  );

  update user_account ua set energy = v_e, updated_at = (extract(epoch from now()) * 1000)::bigint
  where ua.id = v_uid;

  return jsonb_build_object(
    'claimed', v_take,
    'claimable', v_claimable - v_take,
    'energy', v_e
  );
end;
$$;

-- ------------------------------------------------------------
-- 4) 對戰結算 v2：保留（每場扣 1 EP / 首通鑽石），取消每日消耗上限
-- ------------------------------------------------------------
create or replace function settle_battle_v2(
  p_kind text,
  p_result text,
  p_trainer_id text default null,
  p_tier text default null,
  p_questions_today int default 0,
  p_flawless boolean default false,
  p_is_friend boolean default false
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_today text := battle_energy_today();
  v_e jsonb;
  v_points int; v_spent int;
  v_bonus int := 0;
  v_first boolean := false;
  v_bal int;
  v_wins int; v_losses int;
  v_ai int; v_pvp int;
  v_days jsonb; v_day jsonb; v_used int;
  v_mastery jsonb; v_t jsonb; v_cnt int; v_beaten text[];
  v_ai_trainers text[] := array[
    'youngster','bugcatcher','lass','hiker','gentleman','swimmer','ace',
    'jasmine','psychic','cynthia','alder','drake','anabel','red'
  ];
  v_tiers text[] := array['easy','normal','hard','inferno'];
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if p_kind not in ('ai','pvp') or p_result not in ('win','lose') then
    raise exception 'invalid kind/result';
  end if;
  if p_kind = 'ai' and (p_trainer_id is null or not (p_trainer_id = any(v_ai_trainers))) then
    raise exception 'invalid trainer';
  end if;
  if p_tier is not null and not (p_tier = any(v_tiers)) then raise exception 'invalid tier'; end if;

  -- 1) 刷新 ledger（跨日／任務完成次數）
  v_e := battle_energy_refresh(p_questions_today);
  v_points := (v_e ->> 'points')::int;
  v_spent := (v_e ->> 'spent')::int;

  select ua.diamonds, ua.pvp_wins, ua.pvp_losses, ua.ai_trainers_beaten,
         ua.battle_ai_total, ua.battle_pvp_total,
         coalesce(ua.battle_days,'{}'::jsonb), coalesce(ua.trainer_mastery,'{}'::jsonb)
    into v_bal, v_wins, v_losses, v_beaten, v_ai, v_pvp, v_days, v_mastery
    from user_account ua where ua.id = v_uid;
  if not found then raise exception 'account not found'; end if;

  -- 2) 扣 1 EP（好友局唔扣）；v1.25.0 起冇每日消耗上限
  if not p_is_friend then
    if v_points < 1 then
      return jsonb_build_object(
        'allowed', false, 'bonus', 0, 'balance', v_bal, 'first_clear', false,
        'wins', v_wins, 'losses', v_losses, 'energy', v_e,
        'no_points', true, 'spend_capped', false
      );
    end if;
    v_points := v_points - 1;
    v_spent := v_spent + 1;
    v_e := jsonb_set(jsonb_set(v_e, '{points}', to_jsonb(v_points)), '{spent}', to_jsonb(v_spent));
    update user_account ua set energy = v_e where ua.id = v_uid;
  end if;

  -- 3) 鑽石
  if p_kind = 'pvp' then
    v_bonus := case
      when p_is_friend then (case when p_result = 'win' then 1 else 0 end)
      when p_result = 'win' then 3 else 1 end;
  elsif p_result = 'win' and p_tier is not null then
    -- 每 (訓練家, 難度) 首通一次性 10💎
    v_t := coalesce(v_mastery -> p_trainer_id, '{}'::jsonb);
    v_cnt := coalesce((v_t ->> p_tier)::int, 0);
    if v_cnt = 0 then v_bonus := 10; v_first := true; end if;
    v_t := jsonb_set(v_t, array[p_tier], to_jsonb(v_cnt + 1));
    if p_flawless and not (coalesce(v_t -> 'flawless', '[]'::jsonb) @> to_jsonb(array[p_tier])) then
      v_t := jsonb_set(v_t, '{flawless}',
        coalesce(v_t -> 'flawless', '[]'::jsonb) || to_jsonb(array[p_tier]));
    end if;
    v_mastery := jsonb_set(v_mastery, array[p_trainer_id], v_t);
  end if;

  -- 4) 配額統計（保留舊 battle_days 形狀俾其他頁面）
  v_used := coalesce((v_days -> v_today ->> 'used')::int, 0) + (case when p_is_friend then 0 else 1 end);
  v_day := coalesce(v_days -> v_today, '{}'::jsonb);
  v_day := jsonb_set(v_day, '{used}', to_jsonb(v_used));
  if p_kind = 'ai' then
    v_day := jsonb_set(v_day, '{ai}', to_jsonb(coalesce((v_day ->> 'ai')::int, 0) + 1));
  elsif not p_is_friend then
    v_day := jsonb_set(v_day, '{pvp}', to_jsonb(coalesce((v_day ->> 'pvp')::int, 0) + 1));
  end if;

  update user_account ua set
    battle_days = jsonb_set(coalesce(ua.battle_days,'{}'::jsonb), array[v_today], v_day),
    battle_ai_total = ua.battle_ai_total + (case when p_kind = 'ai' then 1 else 0 end),
    battle_pvp_total = ua.battle_pvp_total + (case when p_kind = 'pvp' and not p_is_friend then 1 else 0 end),
    pvp_wins = ua.pvp_wins + (case when p_kind = 'pvp' and not p_is_friend and p_result = 'win' then 1 else 0 end),
    pvp_losses = ua.pvp_losses + (case when p_kind = 'pvp' and not p_is_friend and p_result = 'lose' then 1 else 0 end),
    ai_trainers_beaten = case
      when p_kind = 'ai' and p_result = 'win'
           and not (p_trainer_id = any(ua.ai_trainers_beaten))
        then array_append(ua.ai_trainers_beaten, p_trainer_id)
      else ua.ai_trainers_beaten end,
    trainer_mastery = v_mastery,
    diamonds = ua.diamonds + v_bonus,
    updated_at = (extract(epoch from now()) * 1000)::bigint
  where ua.id = v_uid
  returning ua.diamonds, ua.pvp_wins, ua.pvp_losses, ua.battle_ai_total, ua.battle_pvp_total
    into v_bal, v_wins, v_losses, v_ai, v_pvp;

  return jsonb_build_object(
    'allowed', true, 'bonus', v_bonus, 'balance', v_bal, 'first_clear', v_first,
    'wins', v_wins, 'losses', v_losses, 'energy', v_e,
    'used', v_used, 'ai_total', v_ai, 'pvp_total', v_pvp,
    'mastery', case when p_trainer_id is null then null else v_mastery -> p_trainer_id end
  );
end;
$$;

-- ------------------------------------------------------------
-- 權限
-- ------------------------------------------------------------
revoke execute on function settle_battle_v2(text, text, text, text, int, boolean, boolean) from public, anon;
grant execute on function settle_battle_v2(text, text, text, text, int, boolean, boolean) to authenticated;

revoke execute on function battle_quest_status(int) from public, anon;
grant execute on function battle_quest_status(int) to authenticated;

revoke execute on function battle_energy_status(int) from public, anon;
grant execute on function battle_energy_status(int) to authenticated;

revoke execute on function claim_battle_quests(int, int) from public, anon;
grant execute on function claim_battle_quests(int, int) to authenticated;

revoke execute on function battle_energy_refresh(int) from public, anon, authenticated;

notify pgrst, 'reload schema';
