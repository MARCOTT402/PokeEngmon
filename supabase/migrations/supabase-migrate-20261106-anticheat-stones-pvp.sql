-- =====================================================================
-- 2026-11-06：防作弊三件事
--   1. 進化石：數量（items_stones）同「用咗邊粒」（stone_used）收回 client 直寫
--        · award_stone(p_round)  —— 答題每回合 10% 掉 1 粒（5 種平均），每日最多 40 次
--        · use_stone(p_entry, p_stone, p_branch) —— 扣 1 粒、記 stone_used（＋分支）
--      ※ server 冇物種進化表，唔會核對「呢隻啱唔啱用呢粒石」；呢個仍由 client 判斷。
--        今次封嘅係「憑空變石」同「用石唔扣」。
--   2. 隨機 PvP 結算：唔再信 client 講嘅勝負
--        · settle_pvp_battle(p_battle, p_force, p_questions_today) —— 同好友局一樣對兩邊
--          battle_reports：一致先計；唔一致唔計；自己認輸即刻計輸；對手冇交報告 + p_force
--          → 計贏，但只派 1💎（同輸一樣），防「斷對手線」刷贏
--        · settle_battle_v2 唔再接受 p_kind = 'pvp'；舊 settle_battle（v1）收回 execute
--   3. battles 表：收回 table-level UPDATE/DELETE，只開必要 column；trigger 限制
--        p1 只可以寫 p1_*、p2 只可以寫 p2_*；team_size 只限 p1；完場後唔可以再改 state/winner
--
-- 慣例（Rule 9）：變數 v_ 前綴、參數 p_ 前綴、column 加 alias；回傳 jsonb
-- 用法：Supabase Dashboard → SQL Editor → New Query → 全段 Run（可重複執行）
-- =====================================================================

-- ==================== 1. 進化石 ====================
alter table public.user_account add column if not exists stones_award jsonb;
grant select (stones_award) on public.user_account to authenticated;

revoke update (items_stones) on public.user_account from authenticated;
revoke update (stone_used) on public.user_entries from authenticated;

-- 答題掉石：每回合獨立 10%；每日最多 40 次 call（同 award_meds 一樣防重複 call）
create or replace function public.award_stone()
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_day text := to_char(now() at time zone 'Asia/Hong_Kong', 'YYYY-MM-DD');
  v_award jsonb; v_n int; v_slug text;
  v_kinds text[] := array['thunder','moon','fire','leaf','water'];
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  select coalesce(ua.stones_award, '{}'::jsonb) into v_award from user_account ua where ua.id = v_uid for update;
  if not found then raise exception 'account not found'; end if;
  v_n := case when v_award ->> 'day' = v_day then coalesce((v_award ->> 'n')::int, 0) else 0 end;
  if v_n >= 40 then return jsonb_build_object('ok', true, 'slug', null, 'capped', true); end if;
  update user_account ua set stones_award = jsonb_build_object('day', v_day, 'n', v_n + 1) where ua.id = v_uid;
  if random() >= 0.10 then
    return jsonb_build_object('ok', true, 'slug', null);
  end if;
  v_slug := v_kinds[1 + floor(random() * array_length(v_kinds, 1))::int];
  update user_account ua set
    items_stones = jsonb_set(coalesce(ua.items_stones, '{}'::jsonb), array[v_slug],
                     to_jsonb(coalesce((ua.items_stones ->> v_slug)::int, 0) + 1))
  where ua.id = v_uid;
  return jsonb_build_object('ok', true, 'slug', v_slug,
    'stones', (select ua.items_stones from user_account ua where ua.id = v_uid));
end;
$$;

-- 用石進化：扣 1 粒 + 記 stone_used（每隻只可以用一次石）；p_branch = 分支 index（可 null）
create or replace function public.use_stone(p_entry uuid, p_stone text, p_branch int default null)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_used text;
  v_have int;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if p_stone is null or not (p_stone = any(array['thunder','moon','fire','leaf','water'])) then
    return jsonb_build_object('ok', false, 'reason', 'bad_item');
  end if;
  if p_branch is not null and (p_branch < 0 or p_branch > 20) then
    return jsonb_build_object('ok', false, 'reason', 'bad_branch');
  end if;

  select ue.stone_used into v_used from user_entries ue
   where ue.id = p_entry and ue.account_id = v_uid for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  if v_used is not null then return jsonb_build_object('ok', false, 'reason', 'already'); end if;

  select coalesce((ua.items_stones ->> p_stone)::int, 0) into v_have
    from user_account ua where ua.id = v_uid for update;
  if coalesce(v_have, 0) <= 0 then return jsonb_build_object('ok', false, 'reason', 'none'); end if;

  update user_account ua set
    items_stones = jsonb_set(coalesce(ua.items_stones, '{}'::jsonb), array[p_stone], to_jsonb(v_have - 1))
  where ua.id = v_uid;
  update user_entries ue set
    stone_used = p_stone,
    branch = coalesce(p_branch::smallint, ue.branch),
    updated_at = (extract(epoch from now()) * 1000)::bigint
  where ue.id = p_entry;

  return jsonb_build_object('ok', true,
    'stones', (select ua.items_stones from user_account ua where ua.id = v_uid));
end;
$$;

revoke all on function public.award_stone() from public, anon;
grant execute on function public.award_stone() to authenticated;
revoke all on function public.use_stone(uuid, text, int) from public, anon;
grant execute on function public.use_stone(uuid, text, int) to authenticated;

-- ==================== 2. 隨機 PvP 結算 ====================
create or replace function public.settle_pvp_battle(
  p_battle uuid,
  p_force boolean default false,
  p_questions_today int default 0
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_b battles%rowtype;
  v_side text;
  v_mine record;
  v_theirs jsonb;
  v_result text;
  v_confirmed boolean := false;
  v_bonus int := 0;
  v_e jsonb; v_points int; v_spent int;
  v_today text := battle_energy_today();
  v_days jsonb; v_day jsonb; v_used int;
  v_bal int; v_wins int; v_losses int; v_pvp int;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  select * into v_b from battles b where b.id = p_battle and b.mode = 'pvp' and not coalesce(b.is_friend, false) for update;
  if not found then raise exception 'battle not found'; end if;
  v_side := case when v_b.p1_uid = v_uid then 'p1' when v_b.p2_uid = v_uid then 'p2' end;
  if v_side is null then raise exception 'not your battle'; end if;

  select r.report, r.settled into v_mine from battle_reports r
   where r.battle_id = p_battle and r.side = v_side for update;
  if not found then return jsonb_build_object('pending', true, 'reason', 'no_report'); end if;
  if v_mine.settled then return jsonb_build_object('already', true); end if;
  select r.report into v_theirs from battle_reports r where r.battle_id = p_battle and r.side <> v_side;

  if v_theirs is not null then
    if v_theirs ->> 'winner' = v_mine.report ->> 'winner' then
      v_result := case when v_mine.report ->> 'winner' = v_side then 'win' else 'lose' end;
      v_confirmed := true;
    else
      v_result := null;   -- 唔一致：呢場唔計
    end if;
  elsif v_mine.report ->> 'winner' <> v_side then
    v_result := 'lose'; v_confirmed := true;   -- 自己認輸
  elsif not p_force then
    return jsonb_build_object('pending', true, 'reason', 'waiting_opponent');
  else
    v_result := 'win';   -- 對手冇交報告（斷線）：計贏但只派 1💎
  end if;

  update battle_reports r set settled = true where r.battle_id = p_battle and r.side = v_side;

  select ua.diamonds, ua.pvp_wins, ua.pvp_losses, ua.battle_pvp_total, coalesce(ua.battle_days, '{}'::jsonb)
    into v_bal, v_wins, v_losses, v_pvp, v_days
    from user_account ua where ua.id = v_uid;
  if not found then raise exception 'account not found'; end if;

  if v_result is null then
    return jsonb_build_object('allowed', true, 'disputed', true, 'bonus', 0, 'balance', v_bal,
      'wins', v_wins, 'losses', v_losses, 'pvp_total', v_pvp);
  end if;

  -- 扣 1 EP（同 settle_battle_v2）
  v_e := battle_energy_refresh(p_questions_today);
  v_points := (v_e ->> 'points')::int;
  v_spent := (v_e ->> 'spent')::int;
  if v_points < 1 then
    return jsonb_build_object('allowed', false, 'no_points', true, 'bonus', 0, 'balance', v_bal,
      'wins', v_wins, 'losses', v_losses, 'energy', v_e, 'result', v_result, 'confirmed', v_confirmed);
  end if;
  v_e := jsonb_set(jsonb_set(v_e, '{points}', to_jsonb(v_points - 1)), '{spent}', to_jsonb(v_spent + 1));
  update user_account ua set energy = v_e where ua.id = v_uid;

  v_bonus := case when v_result = 'win' and v_confirmed then 3 else 1 end;

  v_used := coalesce((v_days -> v_today ->> 'used')::int, 0) + 1;
  v_day := coalesce(v_days -> v_today, '{}'::jsonb);
  v_day := jsonb_set(v_day, '{used}', to_jsonb(v_used));
  v_day := jsonb_set(v_day, '{pvp}', to_jsonb(coalesce((v_day ->> 'pvp')::int, 0) + 1));

  update user_account ua set
    battle_days = jsonb_set(coalesce(ua.battle_days, '{}'::jsonb), array[v_today], v_day),
    battle_pvp_total = ua.battle_pvp_total + 1,
    pvp_wins   = ua.pvp_wins   + (case when v_result = 'win'  then 1 else 0 end),
    pvp_losses = ua.pvp_losses + (case when v_result = 'lose' then 1 else 0 end),
    diamonds   = ua.diamonds + v_bonus,
    updated_at = (extract(epoch from now()) * 1000)::bigint
  where ua.id = v_uid
  returning ua.diamonds, ua.pvp_wins, ua.pvp_losses, ua.battle_pvp_total into v_bal, v_wins, v_losses, v_pvp;

  return jsonb_build_object(
    'allowed', true, 'result', v_result, 'confirmed', v_confirmed,
    'bonus', v_bonus, 'balance', v_bal, 'wins', v_wins, 'losses', v_losses,
    'energy', v_e, 'used', v_used, 'pvp_total', v_pvp);
end;
$$;

revoke all on function public.settle_pvp_battle(uuid, boolean, int) from public, anon;
grant execute on function public.settle_pvp_battle(uuid, boolean, int) to authenticated;

-- settle_battle_v2：只准 AI 局（PvP 一律經報告核對）。用 pg_get_functiondef 插 guard，唔使成段重抄
do $m$
declare v_def text;
begin
  v_def := pg_get_functiondef('public.settle_battle_v2(text,text,text,text,int,boolean,boolean)'::regprocedure);
  if position('use settle_pvp_battle' in v_def) = 0 then
    v_def := replace(v_def,
      'if p_kind not in (''ai'',''pvp'')',
      'if p_kind = ''pvp'' then raise exception ''pvp results must use settle_pvp_battle / settle_friend_battle_v2''; end if;' || chr(10) || '  if p_kind not in (''ai'',''pvp'')');
    if position('use settle_pvp_battle' in v_def) = 0 then
      raise exception 'settle_battle_v2 guard anchor not found — check function body';
    end if;
    execute v_def;
  end if;
end
$m$;

-- 舊 v1 結算（信 client 勝負，冇 EP）收回
revoke execute on function public.settle_battle(text, text, text, int) from public, anon, authenticated;

-- ==================== 3. battles 表權限 ====================
revoke all on public.battles from anon;
revoke update, delete, truncate, references, trigger on public.battles from authenticated;
grant select, insert on public.battles to authenticated;
grant update (p1_team, p2_team, p1_vote, p2_vote, p1_action, p2_action, team_size, state, winner, updated_at)
  on public.battles to authenticated;

-- 每邊只可以寫自己嗰欄；完場後鎖死
create or replace function public._battles_guard()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_side text;
begin
  -- 只限制 client（authenticated）；security definer RPC／後台照行
  if current_user <> 'authenticated' then return new; end if;

  if tg_op = 'INSERT' then
    new.state := 'active';
    new.winner := null;
    new.p2_team := null; new.p2_vote := null; new.p2_action := null;
    return new;
  end if;

  v_side := case when old.p1_uid = v_uid then 'p1' when old.p2_uid = v_uid then 'p2' end;
  if v_side is null then raise exception 'not your battle'; end if;

  if v_side = 'p1' and (new.p2_team is distinct from old.p2_team
       or new.p2_vote is distinct from old.p2_vote or new.p2_action is distinct from old.p2_action) then
    raise exception 'p1 cannot write p2 columns';
  end if;
  if v_side = 'p2' and (new.p1_team is distinct from old.p1_team
       or new.p1_vote is distinct from old.p1_vote or new.p1_action is distinct from old.p1_action
       or new.team_size is distinct from old.team_size) then
    raise exception 'p2 cannot write p1 columns';
  end if;
  -- 隊伍交咗就唔准換
  if jsonb_typeof(old.p1_team) = 'array' and jsonb_array_length(old.p1_team) > 0 and new.p1_team is distinct from old.p1_team then
    raise exception 'team already submitted';
  end if;
  if jsonb_typeof(old.p2_team) = 'array' and jsonb_array_length(old.p2_team) > 0 and new.p2_team is distinct from old.p2_team then
    raise exception 'team already submitted';
  end if;

  if old.state = 'finished' then
    if new.state is distinct from old.state or new.winner is distinct from old.winner then
      raise exception 'battle already finished';
    end if;
  else
    if new.state not in ('active', 'finished') then raise exception 'bad state'; end if;
    if new.winner is not null and new.winner not in ('p1', 'p2') then raise exception 'bad winner'; end if;
    if new.winner is not null and new.state <> 'finished' then raise exception 'winner needs finished'; end if;
  end if;
  return new;
end;
$$;

-- PG14+：create or replace trigger（可重複執行）
create or replace trigger trg_battles_guard
  before insert or update on public.battles
  for each row execute function public._battles_guard();

notify pgrst, 'reload schema';

-- 驗證（跑完睇結果）：
-- select table_name, string_agg(column_name, ',') from information_schema.role_column_grants
--  where grantee = 'authenticated' and privilege_type = 'UPDATE' and table_name in ('battles','user_account','user_entries')
--  group by 1;
-- select privilege_type from information_schema.table_privileges where grantee = 'authenticated' and table_name = 'battles';
