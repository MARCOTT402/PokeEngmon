-- ============================================================
-- Practice records（每組練習明細）
-- 目的：換裝置／換帳戶後，Practice Calendar 可以還原完整紀錄
--       （以前只存 user_practice_days 的「每日組數」，明細只在本機）
-- Run in Supabase Dashboard → SQL Editor
-- ============================================================

create table if not exists user_practice_records (
  account_id uuid not null references user_account(id) on delete cascade,
  ts         bigint not null,                     -- 該組完成時間（client Date.now()）
  day        date   not null,                     -- 本地時區日期 'YYYY-MM-DD'
  duration   int    not null default 0,           -- 秒
  score      int    not null default 0,
  total      int    not null default 0,
  results    jsonb  not null default '[]'::jsonb, -- [{qid, chosen, correct}]
  created_at bigint not null default (extract(epoch from now()) * 1000)::bigint,
  primary key (account_id, ts)
);

create index if not exists user_practice_records_day_idx
  on user_practice_records (account_id, day);

alter table user_practice_records enable row level security;

drop policy if exists "practice_records_own" on user_practice_records;
create policy "practice_records_own" on user_practice_records
  for all to authenticated
  using (account_id = auth.uid())
  with check (account_id = auth.uid());

revoke all on user_practice_records from public, anon;
grant select, insert, update on user_practice_records to authenticated;

-- 上傳一組練習明細（重複 ts 直接忽略，唔會重複累加）
create or replace function save_practice_record(
  p_ts bigint,
  p_day text,
  p_duration int default 0,
  p_score int default 0,
  p_total int default 0,
  p_results jsonb default '[]'::jsonb
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_day   date;
  v_score int := greatest(coalesce(p_score, 0), 0);
  v_total int := greatest(coalesce(p_total, 0), 0);
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;
  begin
    v_day := p_day::date;
  exception when others then
    raise exception 'invalid day';
  end;
  -- 基本合理性檢查，避免亂寫超大數值
  if v_score > v_total or v_total > 50 then
    raise exception 'invalid score';
  end if;

  insert into user_practice_records(account_id, ts, day, duration, score, total, results)
  values (v_uid, p_ts, v_day, greatest(coalesce(p_duration, 0), 0), v_score, v_total,
          coalesce(p_results, '[]'::jsonb))
  on conflict (account_id, ts) do nothing;

  return true;
end;
$$;

revoke all on function save_practice_record(bigint, text, int, int, int, jsonb) from public, anon;
grant execute on function save_practice_record(bigint, text, int, int, int, jsonb) to authenticated;
