-- ============================================================
-- Practice days + streak + gym badges
-- Run in Supabase Dashboard → SQL Editor
-- ============================================================

alter table user_account add column if not exists best_streak int not null default 0;
alter table user_account add column if not exists gym_badges int[] not null default '{}';

create table if not exists user_practice_days (
  account_id uuid not null references user_account(id) on delete cascade,
  day date not null,
  sets int not null default 0,
  updated_at bigint not null default (extract(epoch from now()) * 1000)::bigint,
  primary key (account_id, day)
);

alter table user_practice_days enable row level security;

drop policy if exists "practice_days_own" on user_practice_days;
create policy "practice_days_own" on user_practice_days
  for all to authenticated
  using (account_id = auth.uid())
  with check (account_id = auth.uid());

revoke all on user_practice_days from public, anon;
grant select, insert, update on user_practice_days to authenticated;

-- Upsert one practice set for a calendar day (p_ day = 'YYYY-MM-DD')
create or replace function upsert_practice_day(p_day text, p_sets_delta int default 1)
returns user_practice_days
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_day date;
  v_delta int := greatest(coalesce(p_sets_delta, 1), 1);
  v_row user_practice_days;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;
  begin
    v_day := p_day::date;
  exception when others then
    raise exception 'invalid day';
  end;
  insert into user_practice_days(account_id, day, sets, updated_at)
  values (uid, v_day, v_delta, (extract(epoch from now()) * 1000)::bigint)
  on conflict (account_id, day) do update
    set sets = user_practice_days.sets + excluded.sets,
        updated_at = excluded.updated_at
  returning * into v_row;
  return v_row;
end;
$$;

revoke all on function upsert_practice_day(text, int) from public, anon;
grant execute on function upsert_practice_day(text, int) to authenticated;

-- Claim a gym milestone badge (10, 20, 30, …); idempotent if already owned
create or replace function claim_gym_badge(p_milestone int)
returns int[]
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_badges int[];
  v_m int := coalesce(p_milestone, 0);
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;
  if v_m < 10 or (v_m % 10) <> 0 then
    raise exception 'invalid milestone';
  end if;
  select gym_badges into v_badges from user_account where id = uid for update;
  if v_badges is null then
    raise exception 'account missing';
  end if;
  if not (v_m = any (v_badges)) then
    v_badges := array_append(v_badges, v_m);
    update user_account
      set gym_badges = v_badges,
          updated_at = (extract(epoch from now()) * 1000)::bigint
      where id = uid;
  end if;
  return v_badges;
end;
$$;

revoke all on function claim_gym_badge(int) from public, anon;
grant execute on function claim_gym_badge(int) to authenticated;

-- Optional: bump best_streak from client after local calc
create or replace function report_best_streak(p_streak int)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_best int;
  v_s int := greatest(coalesce(p_streak, 0), 0);
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;
  select best_streak into v_best from user_account where id = uid for update;
  if v_best is null then
    raise exception 'account missing';
  end if;
  if v_s > v_best then
    update user_account
      set best_streak = v_s,
          updated_at = (extract(epoch from now()) * 1000)::bigint
      where id = uid;
    return v_s;
  end if;
  return v_best;
end;
$$;

revoke all on function report_best_streak(int) from public, anon;
grant execute on function report_best_streak(int) to authenticated;

-- Leaderboard: include gym_badges
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
  gym_badges         int[]
)
language plpgsql
security definer
set search_path = public
as $$
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
    coalesce(ua.gym_badges, '{}'::int[])                                 as gym_badges
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
