-- ============================================================
-- v134: leaderboard partner 回傳 exp + branch，前端先至 derive 到正確進化形態
-- partner 優先 active=true，否則最新 obtained_at
-- total_owned：owned_species 為 NULL 時每條 entry 最少計 1
-- 跑法：Supabase Dashboard → SQL Editor → Run
-- ============================================================

drop function if exists get_leaderboard();

create or replace function get_leaderboard()
returns table (
  trainer_name       text,
  partner_chain_key  text,
  partner_level      int,
  partner_exp        numeric,
  partner_branch     smallint,
  total_owned        int,
  account_uuid       uuid
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
    ua.id                                                                as account_uuid
  from user_account ua
  left join lateral (
    select e.chain_key, e.level, e.exp, e.branch
    from user_entries e
    where e.account_id = ua.id
    order by e.active desc nulls last, e.obtained_at desc nulls last
    limit 1
  ) pe on true
  left join lateral (
    /* owned_species NULL 嘅舊 entry 最少計 1（唔會令舊玩家 total=0） */
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
