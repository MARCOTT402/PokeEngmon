-- ============================================================
-- Migration 20261101e：好友系統（MVP）＋ 好友邀請制 PvP
--
-- 新增：
--   1. user_account.friend_code（8 位，lazy 生成，全表唯一）
--   2. user_account.friend_daily（好友對戰每日計鑽計數）
--   3. friendships        — 好友關係（pending / accepted）
--   4. battle_invites     — 好友對戰邀請（10 分鐘有效）
--   5. battles.is_friend  — 好友局標記（隨機配對一定要過濾走）
--   6. RPC（security definer，前端零直接讀寫）
--      ensure_friend_code / resolve_friend_code / search_trainers
--      send_friend_request / respond_friend_request / remove_friend
--      get_my_friends / get_friend_requests
--      send_battle_invite / get_battle_invites / respond_battle_invite / cancel_battle_invite
--      settle_friend_battle（贏 1💎／輸 0💎，每日最多 5 場計鑽）
--
-- 注意：好友結算用獨立 RPC，刻意唔改 settle_battle（每日對戰配額版本
--       20261101d 已經用 settle_battle(text,text,text,int)，唔好再撞 overload）。
--       好友局係邀請制，唔受每日答題配額限制。
--
-- 規則（見 .trae/skills/pokeengmon-preop-checklist/SKILL.md Rule 9）：
--   plpgsql 變數一律 v_、參數一律 p_、欄位一定帶 table alias。
--
-- 用法：Supabase Dashboard → SQL Editor → New Query → 全段 Run
-- ============================================================

-- -------------------- 1. friend_code / friend_daily --------------------
alter table user_account add column if not exists friend_code text;
create unique index if not exists user_account_friend_code_uniq
  on user_account (friend_code) where friend_code is not null;

alter table user_account add column if not exists friend_daily jsonb not null default '{}'::jsonb;

-- -------------------- 2. friendships --------------------
create table if not exists friendships (
  id uuid primary key default gen_random_uuid(),
  requester uuid not null references user_account(id) on delete cascade,
  addressee uuid not null references user_account(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at bigint not null default (extract(epoch from now()) * 1000)::bigint,
  responded_at bigint,
  constraint friendships_no_self check (requester <> addressee)
);

/* 一對帳戶只可以有一條關係（pending 或 accepted），兩個方向都算同一 pair */
create unique index if not exists friendships_pair_uniq
  on friendships (least(requester, addressee), greatest(requester, addressee));
create index if not exists friendships_requester_idx on friendships (requester, status);
create index if not exists friendships_addressee_idx on friendships (addressee, status);

alter table friendships enable row level security;
revoke all on friendships from anon, authenticated;   -- 只准經 RPC

-- -------------------- 3. battle_invites --------------------
create table if not exists battle_invites (
  id uuid primary key default gen_random_uuid(),
  from_uid uuid not null references user_account(id) on delete cascade,
  to_uid uuid not null references user_account(id) on delete cascade,
  team_size int not null check (team_size in (1, 3, 6)),
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'declined', 'expired')),
  battle_id uuid references battles(id) on delete set null,
  created_at bigint not null default (extract(epoch from now()) * 1000)::bigint,
  responded_at bigint,
  constraint battle_invites_no_self check (from_uid <> to_uid)
);
create index if not exists battle_invites_to_idx on battle_invites (to_uid, status);
create index if not exists battle_invites_from_idx on battle_invites (from_uid, status);

alter table battle_invites enable row level security;
revoke all on battle_invites from anon, authenticated;   -- 只准經 RPC

-- -------------------- 4. battles.is_friend --------------------
alter table battles add column if not exists is_friend boolean not null default false;
create index if not exists battles_is_friend_idx on battles (is_friend, state);

-- -------------------- 5. RPC：friend code --------------------
create or replace function ensure_friend_code()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_code  text;
  v_chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_i     int;
  v_try   int := 0;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;

  select ua.friend_code into v_code from user_account ua where ua.id = v_uid;
  if not found then raise exception 'account not found'; end if;
  if v_code is not null and length(v_code) = 8 then return v_code; end if;

  loop
    v_try := v_try + 1;
    if v_try > 50 then raise exception 'could not allocate friend code'; end if;
    v_code := '';
    for v_i in 1..8 loop
      v_code := v_code || substr(v_chars, (floor(random() * 32) + 1)::int, 1);
    end loop;
    exit when not exists (select 1 from user_account ua2 where ua2.friend_code = v_code);
  end loop;

  update user_account ua
     set friend_code = v_code,
         updated_at = (extract(epoch from now()) * 1000)::bigint
   where ua.id = v_uid;

  return v_code;
end;
$$;

create or replace function resolve_friend_code(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid    uuid := auth.uid();
  v_code   text := upper(trim(coalesce(p_code, '')));
  v_target uuid;
  v_name   text;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if length(v_code) <> 8 then return null; end if;

  select ua.id, ua.trainer_name into v_target, v_name
    from user_account ua
   where ua.friend_code = v_code;

  if v_target is null then return null; end if;
  if v_target = v_uid then return jsonb_build_object('self', true); end if;

  return jsonb_build_object(
    'account_uuid', v_target,
    'trainer_name', coalesce(v_name, 'Trainer')
  );
end;
$$;

-- -------------------- 6. RPC：search --------------------
create or replace function search_trainers(p_query text)
returns table (account_uuid uuid, trainer_name text, relation text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_q   text := trim(coalesce(p_query, ''));
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if length(v_q) < 2 then return; end if;

  return query
  select
    ua.id                                                as account_uuid,
    coalesce(ua.trainer_name, 'Trainer')                 as trainer_name,
    case
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
    end                                                  as relation
  from user_account ua
  where ua.id <> v_uid
    and coalesce(ua.trainer_name, '') ilike '%' || v_q || '%'
  order by ua.trainer_name asc
  limit 20;
end;
$$;

-- -------------------- 7. RPC：friend requests --------------------
create or replace function send_friend_request(p_target uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid       uuid := auth.uid();
  v_id        uuid;
  v_status    text;
  v_requester uuid;
  v_count     int;
  v_now       bigint := (extract(epoch from now()) * 1000)::bigint;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if p_target is null then return jsonb_build_object('status', 'not_found'); end if;
  if p_target = v_uid then return jsonb_build_object('status', 'self'); end if;
  if not exists (select 1 from user_account ua where ua.id = p_target) then
    return jsonb_build_object('status', 'not_found');
  end if;

  select f.id, f.status, f.requester into v_id, v_status, v_requester
    from friendships f
   where (f.requester = v_uid and f.addressee = p_target)
      or (f.requester = p_target and f.addressee = v_uid)
   limit 1;

  if v_id is not null then
    if v_status = 'accepted' then return jsonb_build_object('status', 'already_friends'); end if;
    if v_requester = v_uid then return jsonb_build_object('status', 'pending'); end if;
    /* 對方已經向我請求 → 直接互相接受 */
    update friendships f
       set status = 'accepted', responded_at = v_now
     where f.id = v_id;
    return jsonb_build_object('status', 'auto_accepted');
  end if;

  select count(*) into v_count
    from friendships f
   where f.status = 'accepted' and (f.requester = v_uid or f.addressee = v_uid);
  if v_count >= 50 then return jsonb_build_object('status', 'friend_limit'); end if;

  select count(*) into v_count
    from friendships f
   where f.status = 'pending' and f.requester = v_uid;
  if v_count >= 20 then return jsonb_build_object('status', 'pending_limit'); end if;

  insert into friendships (requester, addressee)
  values (v_uid, p_target)
  returning friendships.id into v_id;

  return jsonb_build_object('status', 'sent', 'friendship_id', v_id);
end;
$$;

create or replace function respond_friend_request(p_requester uuid, p_accept boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_id    uuid;
  v_count int;
  v_now   bigint := (extract(epoch from now()) * 1000)::bigint;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;

  select f.id into v_id
    from friendships f
   where f.requester = p_requester and f.addressee = v_uid and f.status = 'pending'
   limit 1;
  if v_id is null then return jsonb_build_object('status', 'not_found'); end if;

  if not p_accept then
    delete from friendships f where f.id = v_id;
    return jsonb_build_object('status', 'declined');
  end if;

  select count(*) into v_count
    from friendships f
   where f.status = 'accepted' and (f.requester = v_uid or f.addressee = v_uid);
  if v_count >= 50 then return jsonb_build_object('status', 'friend_limit'); end if;

  update friendships f
     set status = 'accepted', responded_at = v_now
   where f.id = v_id;

  return jsonb_build_object('status', 'accepted');
end;
$$;

create or replace function remove_friend(p_friend uuid)
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
   where (f.requester = v_uid and f.addressee = p_friend)
      or (f.requester = p_friend and f.addressee = v_uid);
  get diagnostics v_n = row_count;

  return jsonb_build_object('removed', v_n > 0);
end;
$$;

create or replace function get_my_friends()
returns table (
  account_uuid uuid,
  trainer_name text,
  pvp_wins int,
  pvp_losses int,
  since bigint
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
    coalesce(f.responded_at, f.created_at)    as since
  from friendships f
  join user_account ua
    on ua.id = case when f.requester = v_uid then f.addressee else f.requester end
  where f.status = 'accepted'
    and (f.requester = v_uid or f.addressee = v_uid)
  order by ua.trainer_name asc
  limit 50;
end;
$$;

create or replace function get_friend_requests()
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
  join user_account ua on ua.id = f.requester
  where f.addressee = v_uid and f.status = 'pending'
  order by f.created_at desc
  limit 50;
end;
$$;

-- -------------------- 8. RPC：battle invites --------------------
create or replace function send_battle_invite(p_friend uuid, p_team_size int)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid     uuid := auth.uid();
  v_id      uuid;
  v_pending uuid;
  v_now     bigint := (extract(epoch from now()) * 1000)::bigint;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if p_team_size not in (1, 3, 6) then return jsonb_build_object('status', 'bad_size'); end if;
  if p_friend is null or p_friend = v_uid then return jsonb_build_object('status', 'not_friend'); end if;

  if not exists (
    select 1 from friendships f
    where f.status = 'accepted'
      and ((f.requester = v_uid and f.addressee = p_friend)
        or (f.requester = p_friend and f.addressee = v_uid))
  ) then
    return jsonb_build_object('status', 'not_friend');
  end if;

  /* 同 pair 過期嘅 pending 先清走 */
  update battle_invites bi
     set status = 'expired', responded_at = v_now
   where bi.status = 'pending'
     and bi.created_at < v_now - 600000
     and ((bi.from_uid = v_uid and bi.to_uid = p_friend)
       or (bi.from_uid = p_friend and bi.to_uid = v_uid));

  select bi.id into v_pending
    from battle_invites bi
   where bi.status = 'pending'
     and bi.created_at >= v_now - 600000
     and ((bi.from_uid = v_uid and bi.to_uid = p_friend)
       or (bi.from_uid = p_friend and bi.to_uid = v_uid))
   limit 1;
  if v_pending is not null then
    return jsonb_build_object('status', 'pending_exists', 'invite_id', v_pending);
  end if;

  insert into battle_invites (from_uid, to_uid, team_size)
  values (v_uid, p_friend, p_team_size)
  returning battle_invites.id into v_id;

  return jsonb_build_object('status', 'sent', 'invite_id', v_id, 'to_uid', p_friend, 'team_size', p_team_size);
end;
$$;

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

create or replace function respond_battle_invite(p_invite uuid, p_accept boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid      uuid := auth.uid();
  v_inv      battle_invites;
  v_now      bigint := (extract(epoch from now()) * 1000)::bigint;
  v_battle   uuid;
  v_seed     bigint;
  v_foe_name text;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;

  select bi.* into v_inv
    from battle_invites bi
   where bi.id = p_invite and bi.to_uid = v_uid
   limit 1;
  if not found then return jsonb_build_object('status', 'not_found'); end if;
  if v_inv.status <> 'pending' then return jsonb_build_object('status', v_inv.status); end if;

  if v_inv.created_at < v_now - 600000 then
    update battle_invites bi
       set status = 'expired', responded_at = v_now
     where bi.id = p_invite;
    return jsonb_build_object('status', 'expired');
  end if;

  if not p_accept then
    update battle_invites bi
       set status = 'declined', responded_at = v_now
     where bi.id = p_invite;
    return jsonb_build_object('status', 'declined');
  end if;

  if not exists (
    select 1 from friendships f
    where f.status = 'accepted'
      and ((f.requester = v_uid and f.addressee = v_inv.from_uid)
        or (f.requester = v_inv.from_uid and f.addressee = v_uid))
  ) then
    return jsonb_build_object('status', 'not_friend');
  end if;

  /* 開局由 server 擲 seed，雙方客戶端只用同一個 seed 模擬 */
  v_seed := floor(random() * 4294967296)::bigint;

  insert into battles (mode, p1_uid, p2_uid, team_size, seed, is_friend)
  values ('pvp', v_inv.from_uid, v_inv.to_uid, v_inv.team_size, v_seed, true)
  returning battles.id into v_battle;

  update battle_invites bi
     set status = 'accepted', battle_id = v_battle, responded_at = v_now
   where bi.id = p_invite;

  select ua.trainer_name into v_foe_name from user_account ua where ua.id = v_inv.from_uid;

  return jsonb_build_object(
    'status', 'accepted',
    'battle_id', v_battle,
    'side', 'p2',
    'team_size', v_inv.team_size,
    'seed', v_seed,
    'foe_uid', v_inv.from_uid,
    'foe_name', coalesce(v_foe_name, 'Trainer')
  );
end;
$$;

create or replace function cancel_battle_invite(p_invite uuid)
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

  delete from battle_invites bi
   where bi.id = p_invite and bi.from_uid = v_uid and bi.status = 'pending';
  get diagnostics v_n = row_count;

  return jsonb_build_object('status', case when v_n > 0 then 'cancelled' else 'not_found' end);
end;
$$;

-- -------------------- 9. settle_friend_battle（好友局結算） --------------------
/* 獨立 RPC：唔改 settle_battle（每日配額版本已佔用），避免 overload 衝突。
   好友局獎勵：贏 1💎、輸 0💎；每日最多 5 場計鑽（輸都計一場）。 */
create or replace function settle_friend_battle(p_result text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_bonus int := 0;
  v_bal   int;
  v_wins  int;
  v_losses int;
  v_days  jsonb;
  v_day   jsonb;
  v_paid  int;
  q_today text := to_char((now() at time zone 'Asia/Shanghai')::date, 'YYYY-MM-DD');
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if p_result not in ('win', 'lose') then raise exception 'invalid result'; end if;

  select ua.friend_daily, ua.diamonds into v_days, v_bal
    from user_account ua where ua.id = v_uid;
  if not found then raise exception 'account not found'; end if;

  v_paid := coalesce((v_days -> q_today ->> 'paid')::int, 0);

  if p_result = 'win' and v_paid < 5 then v_bonus := 1; end if;

  v_day := jsonb_set(coalesce(v_days -> q_today, '{}'::jsonb), '{paid}', to_jsonb(v_paid + 1));

  update user_account ua set
    friend_daily = jsonb_set(coalesce(ua.friend_daily, '{}'::jsonb), array[q_today], v_day),
    pvp_wins = ua.pvp_wins + (case when p_result = 'win' then 1 else 0 end),
    pvp_losses = ua.pvp_losses + (case when p_result = 'lose' then 1 else 0 end),
    diamonds = ua.diamonds + v_bonus,
    updated_at = (extract(epoch from now()) * 1000)::bigint
  where ua.id = v_uid
  returning ua.diamonds, ua.pvp_wins, ua.pvp_losses into v_bal, v_wins, v_losses;

  return jsonb_build_object(
    'bonus', v_bonus, 'balance', v_bal,
    'wins', v_wins, 'losses', v_losses,
    'paid_today', v_paid + 1, 'cap', 5
  );
end;
$$;

-- -------------------- 10. 權限 --------------------
revoke all on function ensure_friend_code() from public;
revoke all on function ensure_friend_code() from anon;
grant execute on function ensure_friend_code() to authenticated;

revoke all on function resolve_friend_code(text) from public;
revoke all on function resolve_friend_code(text) from anon;
grant execute on function resolve_friend_code(text) to authenticated;

revoke all on function search_trainers(text) from public;
revoke all on function search_trainers(text) from anon;
grant execute on function search_trainers(text) to authenticated;

revoke all on function send_friend_request(uuid) from public;
revoke all on function send_friend_request(uuid) from anon;
grant execute on function send_friend_request(uuid) to authenticated;

revoke all on function respond_friend_request(uuid, boolean) from public;
revoke all on function respond_friend_request(uuid, boolean) from anon;
grant execute on function respond_friend_request(uuid, boolean) to authenticated;

revoke all on function remove_friend(uuid) from public;
revoke all on function remove_friend(uuid) from anon;
grant execute on function remove_friend(uuid) to authenticated;

revoke all on function get_my_friends() from public;
revoke all on function get_my_friends() from anon;
grant execute on function get_my_friends() to authenticated;

revoke all on function get_friend_requests() from public;
revoke all on function get_friend_requests() from anon;
grant execute on function get_friend_requests() to authenticated;

revoke all on function send_battle_invite(uuid, int) from public;
revoke all on function send_battle_invite(uuid, int) from anon;
grant execute on function send_battle_invite(uuid, int) to authenticated;

revoke all on function get_battle_invites() from public;
revoke all on function get_battle_invites() from anon;
grant execute on function get_battle_invites() to authenticated;

revoke all on function respond_battle_invite(uuid, boolean) from public;
revoke all on function respond_battle_invite(uuid, boolean) from anon;
grant execute on function respond_battle_invite(uuid, boolean) to authenticated;

revoke all on function cancel_battle_invite(uuid) from public;
revoke all on function cancel_battle_invite(uuid) from anon;
grant execute on function cancel_battle_invite(uuid) to authenticated;

revoke all on function settle_friend_battle(text) from public;
revoke all on function settle_friend_battle(text) from anon;
grant execute on function settle_friend_battle(text) to authenticated;

notify pgrst, 'reload schema';
