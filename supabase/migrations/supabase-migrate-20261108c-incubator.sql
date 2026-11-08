-- ============================================================
-- 孵化器 server（plan .trae/documents/20261108-gacha-dragonite-incubator-plan.md Part 2；spec §10 v4）
-- 規則同 client js/incubator/rules.js（IncubatorRules）一致：
--   Claim 💎3；機率 normal 30%／rare 40%／epic 20%／legend 10%；題數 30／80／140／200。
--   Slot 0 永遠開；Slot 1（Slot 2）從未解鎖過 → 連續 7 日；之後 streak 斷咗 → 再連續 3 日。
--   有蛋而未解鎖 = 凍結（唔加題、進度唔跌）。丟棄：進度清零、鑽唔退；夠數嘅蛋唔准丟。
-- 表：client 只有 select；寫入一律經 RPC（所以唔使 Rule 54 column grant）。
-- 前置：supabase-migrate-20261108b-gacha-obtain-helper.sql（_obtain_gacha_entry）、
--       supabase-migrate-20261108-trainer-level.sql（_grant_trainer_dex）。
-- 冇 DROP（Supabase MCP 會擋破壞性語句）：表同 policy 只可以建一次；function 用 create or replace 可以重跑。
-- ============================================================

-- ---------- 1. 表 ----------
create table if not exists public.user_eggs (
  account_id uuid not null references public.user_account(id) on delete cascade,
  slot smallint not null check (slot in (0, 1)),
  rarity text not null check (rarity in ('normal', 'rare', 'epic', 'legend')),
  need int not null check (need > 0),
  progress int not null default 0 check (progress >= 0),
  created_at timestamptz not null default now(),
  primary key (account_id, slot)
);

create table if not exists public.user_incubator (
  account_id uuid primary key references public.user_account(id) on delete cascade,
  slot2_ever boolean not null default false,
  slot2_on boolean not null default false,
  slot2_last int not null default 0,
  last_add_at timestamptz
);

alter table public.user_eggs enable row level security;
alter table public.user_incubator enable row level security;

create policy "user_eggs select own" on public.user_eggs
  for select to authenticated using (account_id = auth.uid());
create policy "user_incubator select own" on public.user_incubator
  for select to authenticated using (account_id = auth.uid());

revoke all on public.user_eggs, public.user_incubator from public, anon, authenticated;
grant select on public.user_eggs, public.user_incubator to authenticated;

-- ---------- 2. 內部 helper ----------
-- 連續練習日數（同 client calcStreak：今日未練就由昨日數起）。
-- client 用裝置本地日期寫 user_practice_days.day；用戶喺香港，所以「今日」用 Asia/Hong_Kong。
create or replace function public._incubator_streak(p_uid uuid)
returns int
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_today date := (now() at time zone 'Asia/Hong_Kong')::date;
  v_d date;
  v_n int := 0;
begin
  if p_uid is null then return 0; end if;
  v_d := v_today;
  if not exists (select 1 from user_practice_days where account_id = p_uid and day = v_d and sets > 0) then
    v_d := v_d - 1;
  end if;
  while exists (select 1 from user_practice_days where account_id = p_uid and day = v_d and sets > 0) loop
    v_n := v_n + 1;
    v_d := v_d - 1;
  end loop;
  return v_n;
end;
$$;

-- Slot 2 同步（同 IncubatorRules.syncSlot2）：回傳 slot2_on。會建立 user_incubator row。
create or replace function public._incubator_sync(p_uid uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_streak int := _incubator_streak(p_uid);
  inc user_incubator%rowtype;
  v_on boolean;
  v_ever boolean;
begin
  insert into user_incubator(account_id) values (p_uid) on conflict (account_id) do nothing;
  select * into inc from user_incubator where account_id = p_uid for update;
  v_on := inc.slot2_on;
  v_ever := inc.slot2_ever;
  if v_on and v_streak < inc.slot2_last then v_on := false; end if;
  if not v_on and v_streak >= (case when v_ever then 3 else 7 end) then
    v_on := true;
    v_ever := true;
  end if;
  update user_incubator set slot2_on = v_on, slot2_ever = v_ever, slot2_last = v_streak
    where account_id = p_uid;
  return v_on;
end;
$$;

-- 現狀 jsonb：{ eggs: [egg|null, egg|null], slot2: {ever,on,last}, streak }
create or replace function public._incubator_view(p_uid uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'eggs', jsonb_build_array(
      (select jsonb_build_object('slot', e.slot, 'rarity', e.rarity, 'need', e.need, 'progress', e.progress)
         from user_eggs e where e.account_id = p_uid and e.slot = 0),
      (select jsonb_build_object('slot', e.slot, 'rarity', e.rarity, 'need', e.need, 'progress', e.progress)
         from user_eggs e where e.account_id = p_uid and e.slot = 1)),
    'slot2', (select jsonb_build_object('ever', i.slot2_ever, 'on', i.slot2_on, 'last', i.slot2_last)
                from user_incubator i where i.account_id = p_uid),
    'streak', _incubator_streak(p_uid));
$$;

revoke execute on function public._incubator_streak(uuid) from public, anon, authenticated;
revoke execute on function public._incubator_sync(uuid) from public, anon, authenticated;
revoke execute on function public._incubator_view(uuid) from public, anon, authenticated;

-- ---------- 3. RPC ----------
create or replace function public.get_incubator()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  perform _incubator_sync(v_uid);
  return _incubator_view(v_uid);
end;
$$;

-- 原子：鎖 user_account → 揀空位 → 扣 3 鑽 → server 擲稀有度
create or replace function public.claim_egg()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_bal int;
  v_on boolean;
  v_slot smallint;
  v_roll numeric;
  v_rarity text;
  v_need int;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  select diamonds into v_bal from user_account where id = v_uid for update;
  if not found then raise exception 'no account'; end if;
  v_on := _incubator_sync(v_uid);
  if not exists (select 1 from user_eggs where account_id = v_uid and slot = 0) then
    v_slot := 0;
  elsif v_on and not exists (select 1 from user_eggs where account_id = v_uid and slot = 1) then
    v_slot := 1;
  else
    raise exception using errcode = 'P0001', message = 'incubator_full';
  end if;
  if v_bal < 3 then
    raise exception using errcode = 'P0001', message = 'not_enough_diamonds';
  end if;
  update user_account set diamonds = diamonds - 3,
    updated_at = (extract(epoch from now()) * 1000)::bigint
  where id = v_uid
  returning diamonds into v_bal;

  v_roll := random();
  if v_roll < 0.30 then v_rarity := 'normal';
  elsif v_roll < 0.70 then v_rarity := 'rare';
  elsif v_roll < 0.90 then v_rarity := 'epic';
  else v_rarity := 'legend'; end if;
  v_need := case v_rarity when 'normal' then 30 when 'rare' then 80 when 'epic' then 140 else 200 end;

  insert into user_eggs(account_id, slot, rarity, need, progress) values (v_uid, v_slot, v_rarity, v_need, 0);
  return jsonb_build_object('slot', v_slot, 'rarity', v_rarity, 'need', v_need, 'balance', v_bal);
end;
$$;

-- 一回合答啱 p_count 條內置題：加落所有開住、未滿嘅蛋。20 秒內重複 call → 只回現狀（防 spam）。
create or replace function public.incubator_add(p_count int)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_n int := least(greatest(coalesce(p_count, 0), 0), 20);
  v_on boolean;
  v_last timestamptz;
  v_ready int[] := '{}';
  e record;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  v_on := _incubator_sync(v_uid);
  select last_add_at into v_last from user_incubator where account_id = v_uid for update;
  if v_n > 0 and (v_last is null or v_last < now() - interval '20 seconds') then
    for e in select * from user_eggs
      where account_id = v_uid and progress < need and (slot = 0 or v_on)
      for update
    loop
      update user_eggs set progress = least(need, progress + v_n)
        where account_id = v_uid and slot = e.slot;
      if e.progress + v_n >= e.need then v_ready := array_append(v_ready, e.slot::int); end if;
    end loop;
    update user_incubator set last_add_at = now() where account_id = v_uid;
  end if;
  return _incubator_view(v_uid) || jsonb_build_object('ready', to_jsonb(v_ready));
end;
$$;

-- 孵蛋：要夠數；揀同稀有度、p_gen 世代嘅鏈（冇就 gen 1）；派寵同 gacha_pull 一樣；刪蛋。
create or replace function public.hatch_egg(p_slot int, p_gen int default 1)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  egg user_eggs%rowtype;
  v_gen int := coalesce(p_gen, 1);
  ck record;
  v_count int;
  v_got jsonb;
  v_tx jsonb;
  v_bal int;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if p_slot is null or p_slot not in (0, 1) then raise exception 'invalid slot'; end if;
  if v_gen < 1 or v_gen > 5 or v_gen > max_unlocked_gen(v_uid) then v_gen := 1; end if;
  select * into egg from user_eggs where account_id = v_uid and slot = p_slot for update;
  if not found then raise exception using errcode = 'P0001', message = 'no_egg'; end if;
  if egg.progress < egg.need then raise exception using errcode = 'P0001', message = 'egg_not_ready'; end if;

  select cr.chain_key, cr.stage1_dex into ck from chain_rarity cr
    where cr.rarity = egg.rarity and cr.gen = v_gen order by random() limit 1;
  if ck is null then
    select cr.chain_key, cr.stage1_dex into ck from chain_rarity cr
      where cr.rarity = egg.rarity and cr.gen = 1 order by random() limit 1;
  end if;
  if ck is null then raise exception 'no chain for rarity %', egg.rarity; end if;

  select count(*) into v_count from user_entries where account_id = v_uid;
  v_got := _obtain_gacha_entry(v_uid, ck.chain_key, ck.stage1_dex, v_count);
  delete from user_eggs where account_id = v_uid and slot = p_slot;
  v_tx := _grant_trainer_dex(v_uid, ck.stage1_dex);
  select diamonds into v_bal from user_account where id = v_uid;
  return jsonb_build_object('entry', v_got -> 'entry', 'rarity', egg.rarity,
    'is_dupe', (v_got ->> 'is_dupe')::boolean, 'chain_key', ck.chain_key,
    'trainer', v_tx, 'balance', coalesce((v_tx ->> 'balance')::int, v_bal));
end;
$$;

create or replace function public.discard_egg(p_slot int)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  egg user_eggs%rowtype;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  select * into egg from user_eggs where account_id = v_uid and slot = p_slot for update;
  if not found then return jsonb_build_object('ok', true); end if;
  if egg.progress >= egg.need then raise exception using errcode = 'P0001', message = 'egg_ready'; end if;
  delete from user_eggs where account_id = v_uid and slot = p_slot;
  return jsonb_build_object('ok', true);
end;
$$;

revoke execute on function public.get_incubator() from public, anon;
revoke execute on function public.claim_egg() from public, anon;
revoke execute on function public.incubator_add(int) from public, anon;
revoke execute on function public.hatch_egg(int, int) from public, anon;
revoke execute on function public.discard_egg(int) from public, anon;
grant execute on function public.get_incubator() to authenticated;
grant execute on function public.claim_egg() to authenticated;
grant execute on function public.incubator_add(int) to authenticated;
grant execute on function public.hatch_egg(int, int) to authenticated;
grant execute on function public.discard_egg(int) to authenticated;

-- ---------- 4. 驗證（read-only） ----------
-- select grantee, privilege_type from information_schema.role_table_grants
--   where table_name in ('user_eggs','user_incubator') and grantee in ('anon','authenticated');  -- 只有 authenticated SELECT
-- select has_function_privilege('anon', 'public.claim_egg()', 'execute');                      -- false
-- select has_function_privilege('authenticated', 'public._incubator_sync(uuid)', 'execute');   -- false
