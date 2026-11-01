-- ============================================================
-- 20261101f：能量點（EP）＋ 每訓練家每難度首通鑽石（server-authoritative）
--
-- 背景：Battle System 2.0 前端已經用 EP（每日賺 4／池上限 8／每日花 4）同
--   trainer × tier 精通（Easy/Normal/Hard/Inferno 各首通 10💎）。
--   v1.19.x 之前 EP 係純本機，登入用戶可以改 localStorage 刷場；
--   settle_battle 亦只認訓練家、唔認難度，所以「Easy 首通」之後打 Normal 唔會再派 10💎。
--
-- 呢個 migration：
--   1) user_account 加 energy（每日 ledger）同 trainer_mastery（trainer -> tier 次數 + flawless）
--   2) battle_energy_status(p_questions_today) → 跨日 roll／每日登入 +1／每 10 題 +1（上限 3 次）／池上限 8
--   3) settle_battle_v2(..., p_tier, ..., p_flawless, p_is_friend)
--      → 結算先扣 1 EP（好友局唔扣）、按 (trainer, tier) 首通派 10💎、順便寫 battle_days 統計
--
-- 舊 settle_battle(product 4 參數版) 保留，等舊客／其他呼叫唔會爆。
-- ============================================================

alter table user_account add column if not exists energy jsonb not null default '{}'::jsonb;
alter table user_account add column if not exists trainer_mastery jsonb not null default '{}'::jsonb;

-- 香港時間嘅日期 key（同前端 dateKey() 一致：YYYY-MM-DD）
create or replace function battle_energy_today() returns text
language sql stable as $$
  select to_char((now() at time zone 'Asia/Shanghai')::date, 'YYYY-MM-DD')
$$;

-- ------------------------------------------------------------
-- 共用：刷新能量點 ledger（跨日 reset、每日登入 +1、答題任務 +1）
-- 只做計算同寫入，回傳最新 ledger
-- ------------------------------------------------------------
create or replace function battle_energy_refresh(p_questions_today int default 0)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_today text := battle_energy_today();
  v_e jsonb;
  v_points int; v_earned int; v_spent int; v_quests int; v_login boolean;
  v_q int; v_blocks int; v_gain int; v_before text;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;

  select coalesce(ua.energy, '{}'::jsonb) into v_e from user_account ua where ua.id = v_uid;
  if not found then raise exception 'account not found'; end if;

  v_before := v_e ->> 'day';

  -- 跨日：保留點數（上限 8），歸零當日計數
  if v_before is distinct from v_today then
    v_points := least(coalesce((v_e ->> 'points')::int, 5), 8);
    v_earned := 0; v_spent := 0; v_quests := 0;
    -- 全新帳戶：新玩家 5 點已經包咗當日登入獎勵，唔再 +1
    v_login := ((v_e ->> 'points') is null);
  else
    v_points := coalesce((v_e ->> 'points')::int, 5);
    v_earned := coalesce((v_e ->> 'earned')::int, 0);
    v_spent := coalesce((v_e ->> 'spent')::int, 0);
    v_quests := coalesce((v_e ->> 'quests')::int, 0);
    v_login := coalesce((v_e ->> 'login')::boolean, false);
  end if;

  -- 每日登入 +1（每日只得一次）
  if not v_login then
    if v_earned < 4 then
      v_gain := least(1, 8 - v_points);
      if v_gain > 0 then v_points := v_points + v_gain; v_earned := v_earned + v_gain; end if;
    end if;
    v_login := true;
  end if;

  -- 答題任務：每 10 題 = 1 EP，每日最多 3 次（quests 記已完成次數）
  v_q := greatest(0, least(coalesce(p_questions_today, 0), 100000));
  v_blocks := least(3, v_q / 10);
  if v_blocks > v_quests then
    for i in 1 .. (v_blocks - v_quests) loop
      if v_earned < 4 then
        v_gain := least(1, 8 - v_points);
        if v_gain > 0 then v_points := v_points + v_gain; v_earned := v_earned + v_gain; end if;
      end if;
    end loop;
    v_quests := v_blocks;
  end if;

  v_e := jsonb_build_object(
    'day', v_today, 'points', v_points, 'earned', v_earned,
    'spent', v_spent, 'quests', v_quests, 'login', v_login
  );

  update user_account ua set energy = v_e, updated_at = (extract(epoch from now()) * 1000)::bigint
  where ua.id = v_uid;

  return v_e;
end;
$$;

-- 前端查／同步用（答完一組題都可以 call 一次）
create or replace function battle_energy_status(p_questions_today int default 0)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare v_e jsonb;
begin
  v_e := battle_energy_refresh(p_questions_today);
  return jsonb_build_object(
    'points', (v_e ->> 'points')::int,
    'max', 8,
    'spent_today', (v_e ->> 'spent')::int,
    'earned_today', (v_e ->> 'earned')::int,
    'quests', (v_e ->> 'quests')::int,
    'spend_cap', 4,
    'allowed', ((v_e ->> 'points')::int >= 1 and (v_e ->> 'spent')::int < 4),
    'no_points', ((v_e ->> 'points')::int < 1),
    'spend_capped', ((v_e ->> 'spent')::int >= 4),
    'need_questions', case
      when least(3, coalesce(p_questions_today, 0) / 10) >= 3 then 0
      else 10 - (coalesce(p_questions_today, 0) % 10) end,
    'day', v_e ->> 'day'
  );
end;
$$;

-- ------------------------------------------------------------
-- 對戰結算 v2（EP + trainer × tier 首通）
-- p_kind : 'ai' | 'pvp'
-- p_result : 'win' | 'lose'
-- p_tier : 'easy' | 'normal' | 'hard' | 'inferno'（PvP 可以 null）
-- p_flawless : 全隊無倒（只影響 trainer_mastery 記錄，唔影響鑽石）
-- p_is_friend : 好友局（唔扣 EP、贏 1💎、每日上限由 settle_friend_battle 自己管）
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

  -- 1) 刷新 EP ledger（跨日／登入／答題任務）
  v_e := battle_energy_refresh(p_questions_today);
  v_points := (v_e ->> 'points')::int;
  v_spent := (v_e ->> 'spent')::int;

  select ua.diamonds, ua.pvp_wins, ua.pvp_losses, ua.ai_trainers_beaten,
         ua.battle_ai_total, ua.battle_pvp_total,
         coalesce(ua.battle_days,'{}'::jsonb), coalesce(ua.trainer_mastery,'{}'::jsonb)
    into v_bal, v_wins, v_losses, v_beaten, v_ai, v_pvp, v_days, v_mastery
    from user_account ua where ua.id = v_uid;
  if not found then raise exception 'account not found'; end if;

  -- 2) 扣 1 EP（好友局唔扣）
  if not p_is_friend then
    if v_points < 1 then
      return jsonb_build_object(
        'allowed', false, 'bonus', 0, 'balance', v_bal, 'first_clear', false,
        'wins', v_wins, 'losses', v_losses, 'energy', v_e,
        'no_points', true, 'spend_capped', false
      );
    end if;
    if v_spent >= 4 then
      return jsonb_build_object(
        'allowed', false, 'bonus', 0, 'balance', v_bal, 'first_clear', false,
        'wins', v_wins, 'losses', v_losses, 'energy', v_e,
        'no_points', false, 'spend_capped', true
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

revoke execute on function settle_battle_v2(text, text, text, text, int, boolean, boolean) from public, anon;
grant execute on function settle_battle_v2(text, text, text, text, int, boolean, boolean) to authenticated;

revoke execute on function battle_energy_status(int) from public, anon;
grant execute on function battle_energy_status(int) to authenticated;

revoke execute on function battle_energy_refresh(int) from public, anon, authenticated;

notify pgrst, 'reload schema';
