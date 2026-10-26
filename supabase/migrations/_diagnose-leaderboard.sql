-- 直接測 RPC 本身回傳幾多條（喺 SQL Editor 跑）
-- 如果呢條回傳 3 條 → 問題喺 JS 邊
-- 如果只回傳 1 條 → 問題喺 SQL filter 邊
select * from get_leaderboard();

-- 順便睇三個帳戶 entries 嘅 chain_key 狀態
select 
  ua.id,
  ua.trainer_name,
  count(e.id) as total_entries,
  count(e.chain_key) as has_ck,
  count(*) filter (where e.owned_species is not null) as has_os,
  string_agg(distinct e.chain_key, ', ') as chain_keys_preview
from user_account ua
left join user_entries e on e.account_id = ua.id
group by ua.id, ua.trainer_name
order by total_entries desc;
