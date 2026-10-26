-- ============================================================
-- v133 fix: leaderboard partner 取最新 entry，唔再依賴 active 旗標
-- （active 旗標容易因為跨裝置同步、舊資料等原因唔一致）
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
  -- partner：取最新一隻（唔再限 active = true，更穩陣）
  left join lateral (
    select e.chain_key, e.level
    from user_entries e
    where e.account_id = ua.id
    order by e.obtained_at desc nulls last, e.created_at desc nulls last
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
