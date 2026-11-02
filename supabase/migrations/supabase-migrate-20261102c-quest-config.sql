-- ============================================================
-- 20261102c：任務系統 Phase 2 —— 可配置任務（每日／每週／活動／成就）
--
-- 概念：
--   · quest_defs        任務定義（後台直接改 Supabase Table Editor，不用另開 admin 頁）
--   · user_quest_claims 每人每期嘅領取記錄（PK = 帳戶 + 任務 + 期號 → 天然 idempotent）
--   · quest_board()     一次過回傳能量 ledger + 鑽石 + 所有任務進度（server 計，防改 localStorage）
--   · quest_claim()     逐個任務領取（server 再驗進度；重複呼叫會回 already）
--
-- 期號（period_key）：
--   daily       → 'YYYY-MM-DD'（香港時間今日）
--   weekly      → 'W:YYYY-MM-DD'（香港時間本週一）
--   event       → 'E:<quest id>'（活動期內只可領一次）
--   achievement → 'A'（永久只可領一次）
--
-- 進度來源（全部 server 端資料）：
--   questions      user_practice_records.total
--   battles        user_account.battle_days（每日／每週）／battle_ai_total + battle_pvp_total（全期）
--   captures       user_captures（success）
--   pulls          user_entries.obtained_at（抽卡獲得）
--   entries_total  user_entries 數量
--   gym_badges     user_account.gym_badges
--   streak         user_account.best_streak
--   ai_trainers    user_account.ai_trainers_beaten
--
-- 依賴：20261101f-battle-energy.sql、20261102b-daily-quests.sql
--       （battle_energy_today / battle_energy_refresh 已存在）
-- 用法：Supabase Dashboard → SQL Editor → New Query → 全段 Run
-- ============================================================

-- ------------------------------------------------------------
-- 1) 任務定義表（後台配置）
-- ------------------------------------------------------------
create table if not exists quest_defs (
  id            text primary key,
  kind          text not null check (kind in ('daily','weekly','event','achievement')),
  title         text not null,
  subtitle      text not null default '',
  metric        text not null check (metric in (
                  'questions','battles','captures','pulls',
                  'entries_total','gym_badges','streak','ai_trainers')),
  target        int  not null check (target > 0),
  reward_type   text not null check (reward_type in ('energy','diamonds')),
  reward_amount int  not null default 1 check (reward_amount > 0),
  starts_at     bigint,          -- 活動用（毫秒）；null = 不限
  ends_at       bigint,          -- 活動用（毫秒）；null = 不限
  active        boolean not null default true,
  sort          int not null default 0,
  created_at    bigint not null default (extract(epoch from now()) * 1000)::bigint
);

alter table quest_defs enable row level security;

drop policy if exists "quest_defs_read" on quest_defs;
create policy "quest_defs_read" on quest_defs
  for select to anon, authenticated using (true);

revoke all on quest_defs from anon, authenticated;
grant select on quest_defs to anon, authenticated;
-- 寫入只經 Dashboard／service role（前端冇 admin 面）

-- ------------------------------------------------------------
-- 2) 領取記錄（每人每期一次）
-- ------------------------------------------------------------
create table if not exists user_quest_claims (
  account_id uuid not null references user_account(id) on delete cascade,
  quest_id   text not null,
  period_key text not null,
  progress   int  not null default 0,
  claimed_at bigint not null,
  primary key (account_id, quest_id, period_key)
);

create index if not exists user_quest_claims_account_idx
  on user_quest_claims (account_id, claimed_at);

alter table user_quest_claims enable row level security;

drop policy if exists "quest_claims_own" on user_quest_claims;
create policy "quest_claims_own" on user_quest_claims
  for select to authenticated using (account_id = auth.uid());

revoke all on user_quest_claims from anon, authenticated;
grant select on user_quest_claims to authenticated;

-- ------------------------------------------------------------
-- 3) 進度計算（內部用）
--    p_start_ts  <= 0 → 全期；p_start_day null → 全期
-- ------------------------------------------------------------
create or replace function quest_metric_value(
  p_uid uuid,
  p_metric text,
  p_start_ts bigint,
  p_start_day text
) returns int
language plpgsql security definer set search_path = public
as $$
declare
  v_n int := 0;
begin
  if p_metric = 'questions' then
    select coalesce(sum(rec.total), 0)::int into v_n
      from user_practice_records rec
     where rec.account_id = p_uid
       and (p_start_ts is null or p_start_ts <= 0 or rec.ts >= p_start_ts);

  elsif p_metric = 'battles' then
    if p_start_day is null then
      -- 全期：用累計場次
      select coalesce(ua.battle_ai_total, 0) + coalesce(ua.battle_pvp_total, 0)
        into v_n
        from user_account ua
       where ua.id = p_uid;
    else
      -- 每日／每週：battle_days jsonb 以 'YYYY-MM-DD' 做 key
      select coalesce((sum(coalesce((bd.value ->> 'used')::int, 0)))::int, 0)
        into v_n
        from user_account ua
        cross join lateral jsonb_each(coalesce(ua.battle_days, '{}'::jsonb)) bd
       where ua.id = p_uid
         and bd.key >= p_start_day;
    end if;

  elsif p_metric = 'captures' then
    select count(*)::int into v_n
      from user_captures uc
     where uc.account_id = p_uid
       and uc.success
       and (p_start_ts is null or p_start_ts <= 0 or uc.ts >= p_start_ts);

  elsif p_metric = 'pulls' then
    select count(*)::int into v_n
      from user_entries ue
     where ue.account_id = p_uid
       and (p_start_ts is null or p_start_ts <= 0 or ue.obtained_at >= p_start_ts);

  elsif p_metric = 'entries_total' then
    select count(*)::int into v_n
      from user_entries ue
     where ue.account_id = p_uid;

  elsif p_metric = 'gym_badges' then
    select coalesce(array_length(ua.gym_badges, 1), 0) into v_n
      from user_account ua where ua.id = p_uid;

  elsif p_metric = 'streak' then
    select coalesce(ua.best_streak, 0) into v_n
      from user_account ua where ua.id = p_uid;

  elsif p_metric = 'ai_trainers' then
    select coalesce(array_length(ua.ai_trainers_beaten, 1), 0) into v_n
      from user_account ua where ua.id = p_uid;
  end if;

  return greatest(0, coalesce(v_n, 0));
end;
$$;

revoke all on function quest_metric_value(uuid, text, bigint, text) from public, anon, authenticated;

-- ------------------------------------------------------------
-- 4) 期號 + 起始時間
-- ------------------------------------------------------------
create or replace function quest_period(
  p_kind text,
  p_def_id text,
  p_starts_at bigint
) returns jsonb
language plpgsql stable set search_path = public
as $$
declare
  v_day text := battle_energy_today();
  v_monday date;
  v_key text;
  v_start bigint;
  v_start_day text;
begin
  if p_kind = 'daily' then
    v_key := v_day;
    v_start_day := v_day;
    v_start := (extract(epoch from (v_day::timestamp at time zone 'Asia/Shanghai')) * 1000)::bigint;
  elsif p_kind = 'weekly' then
    v_monday := (v_day::date - (extract(isodow from v_day::date)::int - 1))::date;
    v_key := 'W:' || to_char(v_monday, 'YYYY-MM-DD');
    v_start_day := to_char(v_monday, 'YYYY-MM-DD');
    v_start := (extract(epoch from (v_monday::timestamp at time zone 'Asia/Shanghai')) * 1000)::bigint;
  elsif p_kind = 'event' then
    v_key := 'E:' || p_def_id;
    v_start := coalesce(p_starts_at, 0);
    v_start_day := null;
  else
    v_key := 'A';
    v_start := 0;
    v_start_day := null;
  end if;

  return jsonb_build_object('key', v_key, 'start_ts', v_start, 'start_day', v_start_day);
end;
$$;

revoke all on function quest_period(text, text, bigint) from public, anon, authenticated;

-- ------------------------------------------------------------
-- 5) 任務板：能量 ledger + 鑽石 + 全部任務進度
-- ------------------------------------------------------------
create or replace function quest_board(p_questions_today int default 0)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_now bigint := (extract(epoch from now()) * 1000)::bigint;
  v_e jsonb;
  v_bal int;
  v_q int := greatest(0, least(coalesce(p_questions_today, 0), 100000));
  v_row record;
  v_p jsonb;
  v_key text;
  v_start bigint;
  v_start_day text;
  v_prog int;
  v_claimed boolean;
  v_out jsonb := '[]'::jsonb;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;

  v_e := battle_energy_refresh(v_q);

  select coalesce(ua.diamonds, 0) into v_bal from user_account ua where ua.id = v_uid;

  for v_row in
    select qd.id, qd.kind, qd.title, qd.subtitle, qd.metric, qd.target,
           qd.reward_type, qd.reward_amount, qd.starts_at, qd.ends_at, qd.sort
      from quest_defs qd
     where qd.active
       and (qd.kind <> 'event'
            or ((qd.starts_at is null or qd.starts_at <= v_now)
                and (qd.ends_at is null or qd.ends_at >= v_now)))
     order by case qd.kind
                when 'daily' then 0 when 'weekly' then 1
                when 'event' then 2 else 3 end,
              qd.sort, qd.id
  loop
    v_p := quest_period(v_row.kind, v_row.id, v_row.starts_at);
    v_key := v_p ->> 'key';
    v_start := (v_p ->> 'start_ts')::bigint;
    v_start_day := v_p ->> 'start_day';

    v_prog := quest_metric_value(v_uid, v_row.metric, v_start, v_start_day);
    if v_row.metric = 'questions' and v_row.kind = 'daily' then
      v_prog := greatest(v_prog, v_q);
    end if;
    v_prog := least(v_prog, v_row.target);

    select exists (
      select 1 from user_quest_claims uqc
       where uqc.account_id = v_uid
         and uqc.quest_id = v_row.id
         and uqc.period_key = v_key
    ) into v_claimed;

    v_out := v_out || jsonb_build_object(
      'id', v_row.id,
      'kind', v_row.kind,
      'title', v_row.title,
      'subtitle', coalesce(v_row.subtitle, ''),
      'metric', v_row.metric,
      'target', v_row.target,
      'progress', v_prog,
      'reward_type', v_row.reward_type,
      'reward_amount', v_row.reward_amount,
      'claimed', v_claimed,
      'claimable', (not v_claimed) and v_prog >= v_row.target,
      'ends_at', v_row.ends_at
    );
  end loop;

  return jsonb_build_object(
    'day', battle_energy_today(),
    'energy', v_e,
    'diamonds', coalesce(v_bal, 0),
    'quests', v_out,
    'claimable', (
      select count(*)::int from jsonb_array_elements(v_out) q
       where (q ->> 'claimable')::boolean
    )
  );
end;
$$;

revoke all on function quest_board(int) from public, anon;
grant execute on function quest_board(int) to authenticated;

-- ------------------------------------------------------------
-- 6) 逐個任務領取（server 驗進度；idempotent）
-- ------------------------------------------------------------
create or replace function quest_claim(p_quest_id text)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_now bigint := (extract(epoch from now()) * 1000)::bigint;
  v_def quest_defs%rowtype;
  v_p jsonb;
  v_key text;
  v_start bigint;
  v_start_day text;
  v_prog int;
  v_n int := 0;
  v_e jsonb;
  v_bal int;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;

  select * into v_def from quest_defs qd
   where qd.id = p_quest_id and qd.active;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;

  if v_def.kind = 'event'
     and ((v_def.starts_at is not null and v_def.starts_at > v_now)
       or (v_def.ends_at is not null and v_def.ends_at < v_now)) then
    return jsonb_build_object('status', 'not_active');
  end if;

  v_p := quest_period(v_def.kind, v_def.id, v_def.starts_at);
  v_key := v_p ->> 'key';
  v_start := (v_p ->> 'start_ts')::bigint;
  v_start_day := v_p ->> 'start_day';

  v_prog := quest_metric_value(v_uid, v_def.metric, v_start, v_start_day);

  if v_prog < v_def.target then
    return jsonb_build_object(
      'status', 'not_ready', 'progress', v_prog, 'target', v_def.target
    );
  end if;

  insert into user_quest_claims (account_id, quest_id, period_key, progress, claimed_at)
  values (v_uid, v_def.id, v_key, least(v_prog, v_def.target), v_now)
  on conflict (account_id, quest_id, period_key) do nothing;
  get diagnostics v_n = row_count;

  if v_n = 0 then
    return jsonb_build_object('status', 'already');
  end if;

  if v_def.reward_type = 'energy' then
    v_e := battle_energy_refresh(0);
    v_e := jsonb_set(
      v_e, '{points}',
      to_jsonb(greatest(0, coalesce((v_e ->> 'points')::int, 0)) + v_def.reward_amount)
    );
    update user_account ua
       set energy = v_e, updated_at = v_now
     where ua.id = v_uid;
  else
    update user_account ua
       set diamonds = coalesce(ua.diamonds, 0) + v_def.reward_amount,
           updated_at = v_now
     where ua.id = v_uid;
  end if;

  select coalesce(ua.diamonds, 0), coalesce(ua.energy, '{}'::jsonb)
    into v_bal, v_e
    from user_account ua where ua.id = v_uid;

  return jsonb_build_object(
    'status', 'claimed',
    'quest_id', v_def.id,
    'reward_type', v_def.reward_type,
    'reward_amount', v_def.reward_amount,
    'diamonds', coalesce(v_bal, 0),
    'energy', v_e
  );
end;
$$;

revoke all on function quest_claim(text) from public, anon;
grant execute on function quest_claim(text) to authenticated;

-- ------------------------------------------------------------
-- 7) 種子任務（後台可直接改／加；on conflict 唔會覆蓋你改過嘅）
-- ------------------------------------------------------------
insert into quest_defs (id, kind, title, subtitle, metric, target, reward_type, reward_amount, sort, active)
values
  ('daily_battle_1',  'daily',  'Fight 1 battle',        'Any battle counts — AI or PvP.',            'battles',        1,  'energy',   1, 10, true),
  ('daily_catch_1',   'daily',  'Catch 1 Pokémon',      'Throw a ball and keep one.',                'captures',       1,  'diamonds', 3, 20, true),
  ('daily_quiz_30',   'daily',  'Answer 30 questions',  'Daily practice keeps the streak alive.',    'questions',     30,  'diamonds', 3, 30, true),
  ('weekly_quiz_150', 'weekly', 'Answer 150 questions', 'Weekly grind reward.',                      'questions',    150,  'diamonds', 5, 10, true),
  ('weekly_battle_10','weekly', 'Fight 10 battles',     'AI and PvP both count.',                     'battles',       10, 'energy',   2, 20, true),
  ('weekly_catch_5',  'weekly', 'Catch 5 Pokémon',      'Build the collection.',                      'captures',       5, 'energy',   3, 30, true),
  ('event_battle_5',  'event',  'Event: 5 battles',     'Limited-time event quest.',                  'battles',        5, 'diamonds', 5, 10, true),
  ('ach_catch_10',    'achievement', 'Collect 10 Pokémon', 'One-time achievement.',                  'entries_total', 10, 'diamonds',10, 10, true),
  ('ach_badges_3',    'achievement', 'Earn 3 gym badges',  'One-time achievement.',                  'gym_badges',     3, 'diamonds',10, 20, true),
  ('ach_streak_7',    'achievement', 'Practise 7 days in a row', 'One-time achievement.',            'streak',         7, 'energy',   5, 30, true),
  ('ach_ai_5',        'achievement', 'Beat 5 AI trainers',     'One-time achievement.',               'ai_trainers',    5, 'energy',   5, 40, true)
on conflict (id) do nothing;

notify pgrst, 'reload schema';
