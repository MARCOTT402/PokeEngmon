-- ============================================================
-- user_reports（錯誤回報）
-- 目的：收集 Report a problem 內容（匿名及登入用戶均可提交）
-- Run in Supabase Dashboard → SQL Editor
-- ============================================================

create table if not exists user_reports (
  id            uuid primary key default gen_random_uuid(),
  account_id    uuid null references user_account(id) on delete set null,
  device_id     text null,
  qid           text not null,
  question_type text null,
  topic         text null,
  question      text null,
  answer        text null,
  reasons       text[] not null default '{}',
  detail        text null,
  client_ts     timestamptz null,
  created_at    timestamptz not null default now()
);

create index if not exists user_reports_created_idx on user_reports (created_at desc);
create index if not exists user_reports_account_idx on user_reports (account_id);

alter table user_reports enable row level security;

-- 已登入用戶可以睇返自己提交嘅回報
drop policy if exists "user_reports_select_own" on user_reports;
create policy "user_reports_select_own" on user_reports
  for select to authenticated
  using (account_id = auth.uid());

-- 前端一律經 RPC 寫入；直接 insert/update/delete 全部收回
revoke all on user_reports from public, anon, authenticated;
grant select on user_reports to authenticated;

-- 提交回報（匿名 + 登入均可用；長度截斷防濫用）
create or replace function submit_report(
  p_device_id     text,
  p_qid           text,
  p_question_type text default null,
  p_topic         text default null,
  p_question      text default null,
  p_answer        text default null,
  p_reasons       text[] default '{}',
  p_detail        text default null,
  p_client_ts     timestamptz default now()
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id      uuid;
  v_reasons text[] := coalesce(p_reasons, '{}');
  v_uid     uuid := auth.uid();
begin
  if p_qid is null or btrim(p_qid) = '' then
    raise exception 'qid required';
  end if;
  if array_length(v_reasons, 1) is null or array_length(v_reasons, 1) > 5 then
    raise exception 'invalid reasons';
  end if;

  insert into user_reports (
    account_id, device_id, qid, question_type, topic,
    question, answer, reasons, detail, client_ts
  ) values (
    v_uid,
    nullif(left(coalesce(p_device_id, ''), 64), ''),
    left(p_qid, 200),
    left(coalesce(p_question_type, ''), 30),
    left(coalesce(p_topic, ''), 120),
    left(coalesce(p_question, ''), 500),
    left(coalesce(p_answer, ''), 500),
    v_reasons,
    left(coalesce(p_detail, ''), 1000),
    coalesce(p_client_ts, now())
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function submit_report(text, text, text, text, text, text, text[], text, timestamptz) from public;
grant execute on function submit_report(text, text, text, text, text, text, text[], text, timestamptz) to anon, authenticated;

notify pgrst, 'reload schema';
