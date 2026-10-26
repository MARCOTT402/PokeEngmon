-- ============================================================
-- v133 fix: leaderboard filter 改為 "有 entry 就 show"
-- （舊 entries 可能冇 owned_species 或 owned_species = NULL，
--   之前 where total_owned > 0 會擋走所有舊 data）
-- 跑法：Supabase Dashboard → SQL Editor → Run
-- ============================================================

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
    where e.account_id = ua.id
    order by e.obtained_at desc nulls last
    limit 1
  ) pe on true
  left join lateral (
    select sum(coalesce(array_length(e2.owned_species, 1), 0)) as total_owned
    from user_entries e2
    where e2.account_id = ua.id
  ) tc on true
  -- 有任何 entry 就 show（唔再靠 owned_species）
  where pe.chain_key is not null
  order by coalesce(tc.total_owned, 0) desc, pe.level desc, ua.trainer_name asc
  limit 50;
end;
$$;
