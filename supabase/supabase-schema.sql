-- ============================================================
-- PokeEngmon Supabase Schema + RPC + RLS
-- 跑法：Supabase Dashboard → SQL Editor → New Query → Run
-- ============================================================

-- -------------------- 1. Account --------------------
create table if not exists user_account (
  id uuid primary key default gen_random_uuid(),
  device_id text unique,
  trainer_name text default 'The PokéEngmon Trainer',
  diamonds int default 0,
  normal_pulls int default 0,
  total_sets int default 0,
  total_correct int default 0,
  total_questions int default 0,
  last_sync_at bigint,
  created_at bigint default (extract(epoch from now()) * 1000)::bigint,
  updated_at bigint default (extract(epoch from now()) * 1000)::bigint
);

-- -------------------- 2. Pokemon Entries --------------------
create table if not exists user_entries (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references user_account(id) on delete cascade,
  chain_key text not null,
  stage int default 1,
  exp numeric default 0,
  level int default 1,
  ivs jsonb default '{}',
  evs jsonb default '{}',
  ev_points int default 0,
  candies int default 0,
  dupes int default 0,
  stars int default 1,
  active boolean default false,
  owned_species text[] default '{}',
  obtained_at bigint default (extract(epoch from now()) * 1000)::bigint,
  updated_at bigint default (extract(epoch from now()) * 1000)::bigint
);
create index if not exists idx_entries_account on user_entries(account_id);

-- -------------------- 3. SM-2 Cards --------------------
create table if not exists user_cards (
  account_id uuid not null references user_account(id) on delete cascade,
  card_id text not null,
  card_type text not null,
  next_review_at bigint not null,
  interval_days numeric(6,2) not null,
  ease_factor numeric(4,2) not null default 2.50,
  repetition int not null default 0,
  lapse_count int not null default 0,
  is_mastered boolean not null default false,
  last_review_at bigint not null default 0,
  updated_at bigint not null,
  primary key (account_id, card_id)
);
create index if not exists idx_cards_account_next on user_cards(account_id, next_review_at);

-- -------------------- 4. SM-2 History --------------------
create table if not exists user_history (
  id bigserial primary key,
  account_id uuid not null references user_account(id) on delete cascade,
  card_id text not null,
  ts bigint not null,
  q_score numeric(3,1) not null,
  response_ms bigint not null,
  levenshtein_distance int not null default 0,
  is_typo boolean not null default false
);
create index if not exists idx_history_account_ts on user_history(account_id, ts);

-- -------------------- 5. Capture Log --------------------
create table if not exists user_captures (
  id bigserial primary key,
  account_id uuid not null references user_account(id) on delete cascade,
  dex_id int not null,
  success boolean not null,
  ts bigint not null,
  new_pokemon boolean not null default false
);
create index if not exists idx_captures_account on user_captures(account_id);

-- ============================================================
-- RPC Functions（防金手指核心 — security definer）
-- ============================================================

-- 1. 加 diamonds：server 根據 score 計算，前端唔可以硬寫
create or replace function award_round_diamonds(account_uuid uuid, score int, total int)
returns int
language plpgsql
security definer
as $$
declare
  bonus int;
begin
  if score = total then bonus := 3;
  elsif score >= total - 2 then bonus := 2;
  elsif score >= total - 3 then bonus := 1;
  else bonus := 0;
  end if;

  insert into user_account(id, diamonds, total_sets, total_correct, total_questions, updated_at)
  values (account_uuid, bonus, 1, score, total, extract(epoch from now()) * 1000)
  on conflict (id) do update set
    diamonds = user_account.diamonds + excluded.diamonds,
    total_sets = user_account.total_sets + excluded.total_sets,
    total_correct = user_account.total_correct + excluded.total_correct,
    total_questions = user_account.total_questions + excluded.total_questions,
    updated_at = excluded.updated_at;

  return bonus;
end;
$$;

-- 2. 捕捉結算：server 決定成功／失敗
create or replace function settle_capture(account_uuid uuid, dex_id int, attempts int)
returns jsonb
language plpgsql
security definer
as $$
declare
  caught boolean;
  rand_val numeric;
  is_new boolean default false;
begin
  rand_val := random();
  caught := rand_val < least(0.95, 0.80 + attempts * 0.05);

  if caught then
    select exists(select 1 from user_entries
      where account_id = account_uuid and chain_key = 'dex_' || dex_id::text) into is_new;

    if not is_new then
      insert into user_entries(account_id, chain_key, stage, exp, level, owned_species,
        obtained_at, updated_at)
      values (account_uuid, 'dex_' || dex_id::text, 1, 0, 1, ARRAY[dex_id],
        extract(epoch from now()) * 1000, extract(epoch from now()) * 1000);
    else
      update user_entries set ev_points = ev_points + 1, dupes = dupes + 1,
        updated_at = extract(epoch from now()) * 1000
      where account_id = account_uuid and chain_key = 'dex_' || dex_id::text;
    end if;
  end if;

  insert into user_captures(account_id, dex_id, success, ts, new_pokemon)
  values (account_uuid, dex_id, caught, extract(epoch from now()) * 1000, is_new and caught);

  return jsonb_build_object('caught', caught, 'is_new', is_new and caught);
end;
$$;

-- 3. Migrate：匿名 device_id 資料搬到 auth 帳戶
--    回傳 true = 新帳戶（本地要 push 上去）；false = 已有帳戶（本地要 pull 落嚟）
drop function if exists migrate_anonymous_to_auth(uuid, text);
create or replace function migrate_anonymous_to_auth(new_auth_uuid uuid, old_device_id text)
returns boolean
language plpgsql
security definer
as $$
declare
  existing_uuid uuid;
  old_account_uuid uuid;
begin
  /* 1. 先用 auth uid 檢查帳戶係咪已存在（跨裝置 / sign out 再 sign in 嘅情況） */
  select id into existing_uuid from user_account where id = new_auth_uuid;

  if existing_uuid is not null then
    -- 帳戶已存在 → 唔係新帳戶，雲端為準（pull）
    return false;
  end if;

  /* 2. 帳戶唔存在 → 睇下有冇匿名數據要搬 */
  select id into old_account_uuid from user_account where device_id = old_device_id;

  if old_account_uuid is null then
    -- 從未登入過，亦冇匿名數據 → 建立新 account（本地要 push 上嚟）
    insert into user_account(id, device_id, trainer_name, updated_at)
    values (new_auth_uuid, null, 'The PokéEngmon Trainer', extract(epoch from now()) * 1000);
    return true;
  end if;

  -- 有匿名數據 → 搬所有資料到新 auth id
  update user_entries   set account_id = new_auth_uuid where account_id = old_account_uuid;
  update user_cards    set account_id = new_auth_uuid where account_id = old_account_uuid;
  update user_history  set account_id = new_auth_uuid where account_id = old_account_uuid;
  update user_captures set account_id = new_auth_uuid where account_id = old_account_uuid;
  update user_account  set id = new_auth_uuid, device_id = null, updated_at = extract(epoch from now()) * 1000
    where id = old_account_uuid;
  return false;
end;
$$;

-- ============================================================
-- RLS（Row Level Security）
-- anon 用戶 → device_id 綁定；auth 用戶 → auth.uid() 綁定
-- ============================================================

alter table user_account  enable row level security;
alter table user_entries  enable row level security;
alter table user_cards    enable row level security;
alter table user_history  enable row level security;
alter table user_captures enable row level security;

-- 清理舊 policy（如果重跑）
drop policy if exists "account_anon_all" on user_account;
drop policy if exists "account_auth_self" on user_account;
drop policy if exists "entries_all_temp" on user_entries;
drop policy if exists "cards_all_temp" on user_cards;
drop policy if exists "history_all_temp" on user_history;
drop policy if exists "captures_all_temp" on user_captures;

-- user_account：匿名按 device_id、auth 按 uid
create policy "account_anon_rw" on user_account
  for all to anon using (device_id = current_setting('app.device_id', true))
  with check (device_id = current_setting('app.device_id', true));
create policy "account_auth_rw" on user_account
  for all to authenticated using (id = auth.uid())
  with check (id = auth.uid());

-- user_entries / cards / history / captures：同 account_id 綁定
create policy "entries_anon_rw" on user_entries
  for all to anon using (account_id in (
    select id from user_account where device_id = current_setting('app.device_id', true)
  )) with check (account_id in (
    select id from user_account where device_id = current_setting('app.device_id', true)
  ));
create policy "entries_auth_rw" on user_entries
  for all to authenticated using (account_id = auth.uid())
  with check (account_id = auth.uid());

create policy "cards_anon_rw" on user_cards
  for all to anon using (account_id in (
    select id from user_account where device_id = current_setting('app.device_id', true)
  )) with check (account_id in (
    select id from user_account where device_id = current_setting('app.device_id', true)
  ));
create policy "cards_auth_rw" on user_cards
  for all to authenticated using (account_id = auth.uid())
  with check (account_id = auth.uid());

create policy "history_anon_rw" on user_history
  for all to anon using (account_id in (
    select id from user_account where device_id = current_setting('app.device_id', true)
  )) with check (account_id in (
    select id from user_account where device_id = current_setting('app.device_id', true)
  ));
create policy "history_auth_rw" on user_history
  for all to authenticated using (account_id = auth.uid())
  with check (account_id = auth.uid());

create policy "captures_anon_rw" on user_captures
  for all to anon using (account_id in (
    select id from user_account where device_id = current_setting('app.device_id', true)
  )) with check (account_id in (
    select id from user_account where device_id = current_setting('app.device_id', true)
  ));
create policy "captures_auth_rw" on user_captures
  for all to authenticated using (account_id = auth.uid())
  with check (account_id = auth.uid());

-- 容許 anon 建立新 account entry（首次使用）
create policy "account_anon_insert_any" on user_account
  for insert to anon with check (device_id is not null);
