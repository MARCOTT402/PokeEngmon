-- ============================================================
-- Migration 20261102：Friends Phase 2
--
-- 1. user_account.last_seen_at —— 好友上線狀態（presence）
--    · 由 get_battle_invites() 每次輪詢順手更新（免加多一個 RPC）
-- 2. get_my_friends() 加 partner（chain / level / exp / branch）＋ last_seen_at
--    （return type 改咗，一定要 drop 再 create，再補 grant）
-- 3. get_outgoing_friend_requests() —— 顯示「已送出、等對方回應」
-- 4. cancel_friend_request(p_target) —— 取消自己送出嘅好友請求
-- 5. get_leaderboard() 加 relation（friend / pending_out / pending_in / self / none）
--    （return type 改咗，同樣 drop 再 create）
--
-- 規則（SKILL.md Rule 9）：變數 v_、參數 p_、欄位一定帶 table alias。
-- 用法：Supabase Dashboard → SQL Editor → New Query → 全段 Run
-- ============================================================

-- -------------------- 1. presence --------------------
alter table user_account add column if not exists last_seen_at bigint;

-- -------------------- 2. get_my_friends + partner + presence --------------------
drop function if exists get_my_friends();

create or replace function get_my_friends()
returns table (
  account_uuid uuid,
  trainer_name text,
  pvp_wins int,
  pvp_losses int,
  since bigint,
  partner_chain_key text,
  partner_level int,
  partner_exp numeric,
  partner_branch smallint,
  last_seen_at bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not authenticated'; end if;

  return query
  select
    ua.id                                     as account_uuid,
    coalesce(ua.trainer_name, 'Trainer')      as trainer_name,
    coalesce(ua.pvp_wins, 0)                  as pvp_wins,
    coalesce(ua.pvp_losses, 0)                as pvp_losses,
    coalesce(f.responded_at, f.created_at)    as since,
    pe.chain_key                              as partner_chain_key,
    pe.level                                  as partner_level,
    pe.exp                                    as partner_exp,
    pe.branch                                 as partner_branch,
    ua.last_seen_at                           as last_seen_at
  from friendships f
  join user_account ua
    on ua.id = case when f.requester = v_uid then f.addressee else f.requester end
  left join lateral (
    select e.chain_key, e.level, e.exp, e.branch
    from user_entries e
    where e.account_id = ua.id
    order by e.active desc nulls last, e.obtained_at desc nulls last
    limit 1
  ) pe on true
  where f.status = 'accepted'
    and (f.requester = v_uid or f.addressee = v_uid)
  order by ua.trainer_name asc
  limit 50;
end;
$$;

revoke all on function get_my_friends() from public;
revoke all on function get_my_friends() from anon;
grant execute on function get_my_friends() to authenticated;

-- -------------------- 3. outgoing friend requests --------------------
create or replace function get_outgoing_friend_requests()
returns table (account_uuid uuid, trainer_name text, created_at bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not authenticated'; end if;

  return query
  select
    ua.id                                as account_uuid,
    coalesce(ua.trainer_name, 'Trainer') as trainer_name,
    f.created_at                         as created_at
  from friendships f
  join user_account ua on ua.id = f.addressee
  where f.requester = v_uid and f.status = 'pending'
  order by f.created_at desc
  limit 50;
end;
$$;

revoke all on function get_outgoing_friend_requests() from public;
revoke all on function get_outgoing_friend_requests() from anon;
grant execute on function get_outgoing_friend_requests() to authenticated;

-- -------------------- 4. cancel outgoing friend request --------------------
create or replace function cancel_friend_request(p_target uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_n   int := 0;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;

  delete from friendships f
   where f.requester = v_uid
     and f.addressee = p_target
     and f.status = 'pending';
  get diagnostics v_n = row_count;

  return jsonb_build_object('status', case when v_n > 0 then 'cancelled' else 'not_found' end);
end;
$$;

revoke all on function cancel_friend_request(uuid) from public;
revoke all on function cancel_friend_request(uuid) from anon;
grant execute on function cancel_friend_request(uuid) to authenticated;

-- -------------------- 5. presence heartbeat --------------------
-- get_battle_invites 本身已經會 update 過期邀請，順手更新 last_seen_at
create or replace function get_battle_invites()
returns table (
  invite_id uuid,
  direction text,
  account_uuid uuid,
  trainer_name text,
  team_size int,
  status text,
  created_at bigint,
  battle_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_now bigint := (extract(epoch from now()) * 1000)::bigint;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;

  update battle_invites bi
     set status = 'expired', responded_at = v_now
   where bi.status = 'pending'
     and bi.created_at < v_now - 600000
     and (bi.from_uid = v_uid or bi.to_uid = v_uid);

  update user_account ua
     set last_seen_at = v_now
   where ua.id = v_uid;

  return query
  select
    bi.id                                as invite_id,
    case when bi.to_uid = v_uid then 'in' else 'out' end as direction,
    ua.id                                as account_uuid,
    coalesce(ua.trainer_name, 'Trainer') as trainer_name,
    bi.team_size                         as team_size,
    bi.status                            as status,
    bi.created_at                        as created_at,
    bi.battle_id                         as battle_id
  from battle_invites bi
  join user_account ua
    on ua.id = case when bi.to_uid = v_uid then bi.from_uid else bi.to_uid end
  where (bi.from_uid = v_uid or bi.to_uid = v_uid)
    and bi.created_at >= v_now - 600000
    and bi.status in ('pending', 'accepted')
  order by bi.created_at desc
  limit 20;
end;
$$;

revoke all on function get_battle_invites() from public;
revoke all on function get_battle_invites() from anon;
grant execute on function get_battle_invites() to authenticated;

-- -------------------- 6. leaderboard + relation --------------------
drop function if exists get_leaderboard();

create or replace function get_leaderboard()
returns table (
  trainer_name       text,
  partner_chain_key  text,
  partner_level      int,
  partner_exp        numeric,
  partner_branch     smallint,
  total_owned        int,
  account_uuid       uuid,
  gym_badges         int[],
  relation           text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  return query
  select
    ua.trainer_name,
    pe.chain_key                                                         as partner_chain_key,
    pe.level                                                             as partner_level,
    pe.exp                                                               as partner_exp,
    pe.branch                                                            as partner_branch,
    coalesce(tc.total_owned, 0)::int                                     as total_owned,
    ua.id                                                                as account_uuid,
    coalesce(ua.gym_badges, '{}'::int[])                                 as gym_badges,
    case
      when v_uid is null then null
      when ua.id = v_uid then 'self'
      when exists (
        select 1 from friendships f
        where f.status = 'accepted'
          and ((f.requester = v_uid and f.addressee = ua.id)
            or (f.addressee = v_uid and f.requester = ua.id))
      ) then 'friend'
      when exists (
        select 1 from friendships f
        where f.status = 'pending' and f.requester = v_uid and f.addressee = ua.id
      ) then 'pending_out'
      when exists (
        select 1 from friendships f
        where f.status = 'pending' and f.requester = ua.id and f.addressee = v_uid
      ) then 'pending_in'
      else 'none'
    end                                                                  as relation
  from user_account ua
  left join lateral (
    select e.chain_key, e.level, e.exp, e.branch
    from user_entries e
    where e.account_id = ua.id
    order by e.active desc nulls last, e.obtained_at desc nulls last
    limit 1
  ) pe on true
  left join lateral (
    select sum(greatest(coalesce(array_length(e2.owned_species, 1), 0), 1)) as total_owned
    from user_entries e2
    where e2.account_id = ua.id
  ) tc on true
  where pe.chain_key is not null
  order by coalesce(tc.total_owned, 0) desc, pe.level desc, ua.trainer_name asc
  limit 50;
end;
$$;

revoke all on function get_leaderboard() from public;
grant execute on function get_leaderboard() to anon;
grant execute on function get_leaderboard() to authenticated;

notify pgrst, 'reload schema';
