-- ============================================================
-- v132 Leaderboard RPC — get_leaderboard()
-- Top 50 trainers ranked by total Pokémon owned
--
-- 跑法：Supabase Dashboard → SQL Editor → New Query → Paste → Run
-- （唔使跑其他 migration，獨立執行就夠）
-- ============================================================

drop function if exists get_leaderboard();

create or replace function get_leaderboard()
returns table (
  trainer_name       text,
  partner_chain_key  text,
  partner_level      int,
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
    coalesce(tc.total_owned, 0)::int                                     as total_owned,
    ua.id                                                                as account_uuid
  from user_account ua
  left join lateral (
    select e.chain_key, e.level
    from user_entries e
    where e.account_id = ua.id and e.active = true
    limit 1
  ) pe on true
  left join lateral (
    select sum(coalesce(array_length(e2.owned_species, 1), 0)) as total_owned
    from user_entries e2
    where e2.account_id = ua.id
  ) tc on true
  where coalesce(tc.total_owned, 0) > 0
  order by coalesce(tc.total_owned, 0) desc, pe.level desc, ua.trainer_name asc
  limit 50;
end;
$$;

-- RLS 擋 cross-user SELECT，但 SECURITY DEFINER function 繞過 RLS。
-- 必須收緊 execute 權限：public/anon 唔准 call，只有 authenticated 可以。
revoke all on function get_leaderboard() from public;
revoke all on function get_leaderboard() from anon;
grant execute on function get_leaderboard() to authenticated;
