-- =====================================================================
-- 2026-11-05j：狀態系統第二期 — PvP 雙方結算核對（防竄改）
--   兩邊客戶端用同一 seed 模擬，完場時各自交「結果報告」（勝方 + 兩隊 HP 千分比）。
--   好友對戰結算改由 server 對報告：
--     · 兩份勝方一致        → 照報告計勝負 + 鑽石
--     · 兩份勝方唔一致      → 呢場唔計（冇勝負、冇鑽石）
--     · HP 快照唔一致只回 hp_match=false 作記錄（投降／斷線時可能差一個回合，唔當作弊）
--     · 只有自己一份、認輸  → 即刻計輸
--     · 只有自己一份、話贏  → 等對手；p_force 先計贏但唔派鑽石（對手斷線個案）
--   報告放獨立表 battle_reports（battles 有 table-level update，唔可以放喺嗰度）；
--   client 冇任何權限，只可以經 RPC 寫。
--   舊 settle_friend_battle(p_result) 收回 execute（唔再信 client 講嘅勝負）。
-- =====================================================================

create table if not exists public.battle_reports (
  battle_id  uuid   not null references public.battles(id) on delete cascade,
  side       text   not null check (side in ('p1', 'p2')),
  uid        uuid   not null,
  report     jsonb  not null,
  settled    boolean not null default false,
  created_at bigint not null default (extract(epoch from now()) * 1000)::bigint,
  primary key (battle_id, side)
);
alter table public.battle_reports enable row level security;
revoke all on public.battle_reports from anon, authenticated;

-- 交報告：p_report = { winner: 'p1'|'p2', hp: { p1: [0..1000,…], p2: [...] } }；每邊只可以交一次
create or replace function public.report_battle_result(p_battle uuid, p_report jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_b battles%rowtype;
  v_side text;
  v_w text := p_report ->> 'winner';
  v_hp jsonb := p_report -> 'hp';
  v_mine jsonb;
  v_theirs jsonb;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if v_w is null or v_w not in ('p1', 'p2') then raise exception 'bad winner'; end if;
  if jsonb_typeof(v_hp) <> 'object'
     or jsonb_typeof(v_hp -> 'p1') <> 'array' or jsonb_typeof(v_hp -> 'p2') <> 'array'
     or jsonb_array_length(v_hp -> 'p1') > 6 or jsonb_array_length(v_hp -> 'p2') > 6 then
    raise exception 'bad hp';
  end if;

  select * into v_b from battles b where b.id = p_battle and b.mode = 'pvp' for update;
  if not found then raise exception 'battle not found'; end if;
  v_side := case when v_b.p1_uid = v_uid then 'p1' when v_b.p2_uid = v_uid then 'p2' end;
  if v_side is null then raise exception 'not your battle'; end if;

  insert into battle_reports (battle_id, side, uid, report)
  values (p_battle, v_side, v_uid, jsonb_build_object('winner', v_w, 'hp', v_hp))
  on conflict (battle_id, side) do nothing;

  select r.report into v_mine from battle_reports r where r.battle_id = p_battle and r.side = v_side;
  select r.report into v_theirs from battle_reports r where r.battle_id = p_battle and r.side <> v_side;
  return jsonb_build_object(
    'side', v_side,
    'verdict', case when v_theirs is null then 'pending'
                    when v_theirs ->> 'winner' = v_mine ->> 'winner' then 'agreed' else 'disputed' end,
    'hp_match', case when v_theirs is null then null else (v_theirs -> 'hp') = (v_mine -> 'hp') end);
end;
$$;

-- 好友對戰結算 v2：勝負由 server 對報告決定
create or replace function public.settle_friend_battle_v2(p_battle uuid, p_force boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public
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
  v_bal int; v_wins int; v_losses int; v_days jsonb; v_day jsonb; v_paid int;
  q_today text := to_char((now() at time zone 'Asia/Shanghai')::date, 'YYYY-MM-DD');
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  select * into v_b from battles b where b.id = p_battle and b.mode = 'pvp' and b.is_friend for update;
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
    v_result := 'lose'; v_confirmed := true;   -- 自己認輸，唔使等
  elsif not p_force then
    return jsonb_build_object('pending', true, 'reason', 'waiting_opponent');
  else
    v_result := 'win';   -- 對手冇交報告（斷線）：計贏但唔派鑽石
  end if;

  update battle_reports r set settled = true where r.battle_id = p_battle and r.side = v_side;

  select ua.friend_daily, ua.diamonds, ua.pvp_wins, ua.pvp_losses into v_days, v_bal, v_wins, v_losses
    from user_account ua where ua.id = v_uid;
  if v_result is null then
    return jsonb_build_object('disputed', true, 'bonus', 0, 'balance', v_bal, 'wins', v_wins, 'losses', v_losses);
  end if;

  v_paid := coalesce((v_days -> q_today ->> 'paid')::int, 0);
  if v_result = 'win' and v_confirmed and v_paid < 5 then v_bonus := 1; end if;
  v_day := jsonb_set(coalesce(v_days -> q_today, '{}'::jsonb), '{paid}', to_jsonb(v_paid + 1));

  update user_account ua set
    friend_daily = jsonb_set(coalesce(ua.friend_daily, '{}'::jsonb), array[q_today], v_day),
    pvp_wins   = ua.pvp_wins   + (case when v_result = 'win'  then 1 else 0 end),
    pvp_losses = ua.pvp_losses + (case when v_result = 'lose' then 1 else 0 end),
    diamonds   = ua.diamonds + v_bonus,
    updated_at = (extract(epoch from now()) * 1000)::bigint
  where ua.id = v_uid
  returning ua.diamonds, ua.pvp_wins, ua.pvp_losses into v_bal, v_wins, v_losses;

  return jsonb_build_object(
    'result', v_result, 'confirmed', v_confirmed,
    'bonus', v_bonus, 'balance', v_bal, 'wins', v_wins, 'losses', v_losses,
    'paid_today', v_paid + 1, 'cap', 5);
end;
$$;

revoke all on function public.report_battle_result(uuid, jsonb) from public, anon;
grant execute on function public.report_battle_result(uuid, jsonb) to authenticated;
revoke all on function public.settle_friend_battle_v2(uuid, boolean) from public, anon;
grant execute on function public.settle_friend_battle_v2(uuid, boolean) to authenticated;
-- 舊版信 client 勝負：收回
revoke execute on function public.settle_friend_battle(text) from public, anon, authenticated;
