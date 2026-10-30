-- ============================================================
-- Migration 20261031c：對戰系統 schema（PvP + AI Trainers）
--
-- 新增：
--   1. battles        — 對戰狀態（雙方隊伍、回合、actions、勝負）
--   2. battle_log     — 回合敘述 log
--   3. matchmaking    — PvP 配對池
--
-- RLS：
--   - battles：player 只可 read/update 自己有參與嘅 row（p1_uid 或 p2_uid）
--   - matchmaking：任何人可 read（搵對手），只可 insert/delete 自己
--
-- realtime：battles 啟用（雙方 subscribe 自己 battle row 嘅變化）
--
-- 用法：Supabase Dashboard → SQL Editor → New Query → 全段 Run
-- ============================================================

-- -------------------- 1. battles --------------------
create table if not exists battles (
  id uuid primary key default gen_random_uuid(),
  mode text not null check (mode in ('pvp','ai')),
  p1_uid uuid not null references user_account(id) on delete cascade,
  p2_uid uuid references user_account(id) on delete cascade,   /* AI 戰 null */
  ai_trainer_id text,                                           /* AI 戰 trainer id */
  team_size int not null default 3,
  p1_team jsonb not null default '[]'::jsonb,                  /* [{entry_uid, dexId, level}] */
  p2_team jsonb not null default '[]'::jsonb,
  state text not null default 'active' check (state in ('active','finished')),
  turn int not null default 0,
  p1_action jsonb,
  p2_action jsonb,
  p1_team_state jsonb,                                          /* 戰鬥中 HP/PP/status */
  p2_team_state jsonb,
  winner text check (winner in ('p1','p2',null)),
  created_at bigint not null default (extract(epoch from now())*1000)::bigint,
  updated_at bigint not null default (extract(epoch from now())*1000)::bigint
);

alter table battles enable row level security;

-- read：有參與先睇到
create policy "battles_select_self" on battles
  for select to authenticated
  using (p1_uid = auth.uid() or p2_uid = auth.uid());

-- insert：自己做 p1（p2 由配對時填）
create policy "battles_insert_self" on battles
  for insert to authenticated
  with check (p1_uid = auth.uid());

-- update：有參與先改到
create policy "battles_update_self" on battles
  for update to authenticated
  using (p1_uid = auth.uid() or p2_uid = auth.uid())
  with check (p1_uid = auth.uid() or p2_uid = auth.uid());

-- -------------------- 2. battle_log --------------------
create table if not exists battle_log (
  id bigserial primary key,
  battle_id uuid not null references battles(id) on delete cascade,
  turn int not null,
  actor text,
  action text,
  payload jsonb,
  created_at bigint not null default (extract(epoch from now())*1000)::bigint
);

alter table battle_log enable row level security;
create policy "battle_log_self" on battle_log
  for select to authenticated
  using (exists (
    select 1 from battles b
    where b.id = battle_id and (b.p1_uid = auth.uid() or b.p2_uid = auth.uid())
  ));

-- -------------------- 3. matchmaking --------------------
create table if not exists matchmaking (
  id uuid primary key default gen_random_uuid(),
  uid uuid not null references user_account(id) on delete cascade,
  team_size int not null default 3,
  created_at bigint not null default (extract(epoch from now())*1000)::bigint
);

alter table matchmaking enable row level security;
create policy "matchmaking_read_all" on matchmaking
  for select to authenticated using (true);
create policy "matchmaking_insert_self" on matchmaking
  for insert to authenticated with check (uid = auth.uid());
create policy "matchmaking_delete_self" on matchmaking
  for delete to authenticated using (uid = auth.uid());

-- -------------------- 4. realtime --------------------
alter publication supabase_realtime add table battles;

-- -------------------- 5. reload schema --------------------
notify pgrst, 'reload schema';
