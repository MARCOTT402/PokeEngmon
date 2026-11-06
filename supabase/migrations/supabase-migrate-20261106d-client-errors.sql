-- =====================================================================
-- 2026-11-06d：前端錯誤上報（stability-performance plan §2.1／§9 Q1；Rule 94）
--   js/core/guard.js 收集 window error／unhandledrejection／開機失敗，
--   經 log_client_errors(p_device_id, p_rows) 批量 insert（每批最多 10 筆）。
--
--   私隱：只收技術資料（版本、畫面 id、錯誤訊息、stack 頭幾行、裝置類型＋視窗尺寸）；
--         唔收名、email、題目答案。account_id 只喺登入時由 auth.uid() 帶入（client 傳唔到）。
--   限流（server 權威）：同一 rate key（登入＝uid；guest＝device id）每分鐘最多 10 筆、每日 200 筆；
--         超出就靜靜丟棄（回傳 accepted 數），唔 raise —— 上報失敗唔可以反過嚟煩用戶。
--   權限：table 冇任何 client 直接權限；只可以 execute RPC（anon＋authenticated，guest 都要報到）。
--   保留：30 日（清理 SQL 見檔尾，由用戶自行排程或手動執行）。
--
-- 慣例（Rule 9）：變數 v_ 前綴、參數 p_ 前綴、column 加 alias
-- 用法：可重複執行（Rule 24）
-- =====================================================================

create table if not exists public.client_errors (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  account_id  uuid,
  device_id   text,
  rate_key    text not null,
  client_ts   timestamptz,
  app_version text,
  view        text,
  kind        text,
  "where"     text,
  message     text,
  stack       text,
  ua          text
);

create index if not exists client_errors_rate_idx on public.client_errors (rate_key, created_at desc);
create index if not exists client_errors_created_idx on public.client_errors (created_at desc);

alter table public.client_errors enable row level security;
revoke all on table public.client_errors from public, anon, authenticated;

create or replace function public.log_client_errors(p_device_id text, p_rows jsonb)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_key text;
  v_min int; v_day int; v_room int;
  v_row jsonb;
  v_ts timestamptz;
  v_ok int := 0;
begin
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    return jsonb_build_object('ok', false, 'accepted', 0);
  end if;

  v_key := coalesce(v_uid::text, 'd:' || left(nullif(trim(coalesce(p_device_id, '')), ''), 64));
  if v_key is null then
    return jsonb_build_object('ok', false, 'accepted', 0);
  end if;

  select count(*) filter (where ce.created_at > now() - interval '1 minute'),
         count(*)
    into v_min, v_day
    from client_errors ce
   where ce.rate_key = v_key and ce.created_at > now() - interval '1 day';

  v_room := least(10 - v_min, 200 - v_day, 10);
  if v_room <= 0 then
    return jsonb_build_object('ok', true, 'accepted', 0, 'limited', true);
  end if;

  for v_row in select value from jsonb_array_elements(p_rows) limit v_room loop
    if jsonb_typeof(v_row) <> 'object' then
      continue;
    end if;
    v_ts := null;
    begin
      if (v_row ->> 't') ~ '^[0-9]{10,14}$' then
        v_ts := to_timestamp((v_row ->> 't')::bigint / 1000.0);
      end if;
    exception when others then
      v_ts := null;
    end;
    insert into client_errors (account_id, device_id, rate_key, client_ts, app_version, view, kind, "where", message, stack, ua)
    values (
      v_uid,
      left(nullif(trim(coalesce(p_device_id, '')), ''), 64),
      v_key,
      v_ts,
      left(v_row ->> 'v', 32),
      left(v_row ->> 'view', 48),
      left(v_row ->> 'kind', 16),
      left(v_row ->> 'where', 60),
      left(v_row ->> 'msg', 300),
      left(v_row ->> 'stack', 1000),
      left(v_row ->> 'ua', 120)
    );
    v_ok := v_ok + 1;
  end loop;

  return jsonb_build_object('ok', true, 'accepted', v_ok);
end;
$$;

revoke all on function public.log_client_errors(text, jsonb) from public;
grant execute on function public.log_client_errors(text, jsonb) to anon, authenticated;

notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------
-- 清理（保留 30 日）：用戶自行執行或用 pg_cron 排程
--   delete from public.client_errors where created_at < now() - interval '30 days';
-- 睇最近錯誤：
--   select created_at, app_version, view, kind, "where", message from public.client_errors
--    order by created_at desc limit 50;
-- ---------------------------------------------------------------------
