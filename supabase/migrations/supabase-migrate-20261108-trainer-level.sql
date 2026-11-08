-- =====================================================================
-- Trainer Lv（訓練員等級）— spec .trae/specs/20261108-trainer-level.md
-- plan .trae/documents/20261108-trainer-level-impl.md
--
-- EXP 規則（全部 server 計；只 reward 唔 punish，Rule 123）：
--   答啱 +1（每日上限 200）、完成一組 +5、AI 贏 round(10×難度倍率)、AI 首通 +20、
--   隨機 PvP 確認贏 +20／其他 +5、好友戰 0、第一次攞到某 stage1 dex +15
-- 升級：Lv N→N+1 要 100 + 20×(N−1)；Lv100 封頂；每到 5 嘅倍數派 💎10（每級一次）
-- 新欄位 server-only：唔加 column grant（user_account 對 authenticated 只有 SELECT＋白名單 UPDATE）
-- 舊玩家由 0 開始，唔補。
-- 插入現有 RPC 用 Rule 78 做法（pg_get_functiondef + replace，anchor 唔中／唔唯一就 raise）。
-- 可以重跑：已插入嘅 function 會 skip。
-- =====================================================================

-- ---------- 1. 欄位 ----------
alter table public.user_account
  add column if not exists trainer_exp            int     not null default 0,
  add column if not exists trainer_exp_quiz_day   text,
  add column if not exists trainer_exp_quiz_today int     not null default 0,
  add column if not exists trainer_lv_rewarded    int     not null default 0,
  add column if not exists trainer_exp_dex        int[]   not null default '{}';

-- ---------- 2. 等級公式（同 js/trainer-level.js 一樣） ----------
create or replace function public._trainer_lv(p_exp int)
returns int
language plpgsql immutable
set search_path = public
as $$
declare
  v_lv int := 1;
  v_rest int := greatest(coalesce(p_exp, 0), 0);
begin
  while v_lv < 100 and v_rest >= 100 + 20 * (v_lv - 1) loop
    v_rest := v_rest - (100 + 20 * (v_lv - 1));
    v_lv := v_lv + 1;
  end loop;
  return v_lv;
end;
$$;

-- ---------- 3. 加 EXP（internal；client 唔可以直接 call） ----------
-- p_amount：唔受上限；p_quiz：答題 EXP，套每日 200 上限
create or replace function public._grant_trainer_exp(p_uid uuid, p_amount int, p_quiz int default 0)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_today text := battle_energy_today();
  v_row record;
  v_amt int := greatest(coalesce(p_amount, 0), 0);
  v_quiz int := greatest(coalesce(p_quiz, 0), 0);
  v_qtoday int;
  v_gain int;
  v_old_lv int;
  v_new_lv int;
  v_exp int;
  v_reward_to int;
  v_award int := 0;
  v_bal int;
begin
  if p_uid is null then return null; end if;
  select ua.trainer_exp, ua.trainer_exp_quiz_day, ua.trainer_exp_quiz_today, ua.trainer_lv_rewarded
    into v_row
    from user_account ua where ua.id = p_uid for update;
  if not found then return null; end if;

  v_qtoday := case when v_row.trainer_exp_quiz_day = v_today then v_row.trainer_exp_quiz_today else 0 end;
  v_quiz := least(v_quiz, greatest(200 - v_qtoday, 0));
  v_gain := v_amt + v_quiz;
  v_old_lv := _trainer_lv(v_row.trainer_exp);
  v_exp := v_row.trainer_exp + v_gain;
  v_new_lv := _trainer_lv(v_exp);

  -- 每到 5 嘅倍數 💎10；一次跨幾級要派晒（例如 Lv4→Lv11 = Lv5、Lv10 兩份）
  v_reward_to := (v_new_lv / 5) * 5;
  if v_reward_to > v_row.trainer_lv_rewarded then
    v_award := 10 * (v_reward_to / 5 - v_row.trainer_lv_rewarded / 5);
  end if;

  update user_account ua set
    trainer_exp            = v_exp,
    trainer_exp_quiz_day   = v_today,
    trainer_exp_quiz_today = v_qtoday + v_quiz,
    trainer_lv_rewarded    = greatest(ua.trainer_lv_rewarded, v_reward_to),
    diamonds               = ua.diamonds + v_award,
    updated_at             = (extract(epoch from now()) * 1000)::bigint
  where ua.id = p_uid
  returning ua.diamonds into v_bal;

  return jsonb_build_object(
    'exp', v_exp, 'gained', v_gain, 'lv', v_new_lv, 'lv_up', v_new_lv > v_old_lv,
    'diamonds_awarded', v_award, 'balance', v_bal);
end;
$$;

-- 第一次攞到某 stage1 dex → +15（server 自己記，唔信 client 嘅 dex_caught）
create or replace function public._grant_trainer_dex(p_uid uuid, p_dex int)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_has boolean;
begin
  if p_uid is null or p_dex is null then return null; end if;
  select p_dex = any(ua.trainer_exp_dex) into v_has
    from user_account ua where ua.id = p_uid for update;
  if not found then return null; end if;
  if v_has then return _grant_trainer_exp(p_uid, 0); end if;
  update user_account ua set trainer_exp_dex = array_append(ua.trainer_exp_dex, p_dex) where ua.id = p_uid;
  return _grant_trainer_exp(p_uid, 15);
end;
$$;

revoke execute on function public._trainer_lv(int) from public, anon, authenticated;
revoke execute on function public._grant_trainer_exp(uuid, int, int) from public, anon, authenticated;
revoke execute on function public._grant_trainer_dex(uuid, int) from public, anon, authenticated;

-- ---------- 4. 顯示用：一次攞多個訓練員嘅 EXP（Friends 名單、排行榜；排行榜未登入都睇得） ----------
create or replace function public.get_trainer_levels(p_uids uuid[])
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_out jsonb;
begin
  if coalesce(array_length(p_uids, 1), 0) > 60 then raise exception 'too many trainers'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('uid', ua.id, 'exp', coalesce(ua.trainer_exp, 0))), '[]'::jsonb)
    into v_out
    from user_account ua where ua.id = any(p_uids);
  return jsonb_build_object('levels', v_out);
end;
$$;
revoke execute on function public.get_trainer_levels(uuid[]) from public;
grant execute on function public.get_trainer_levels(uuid[]) to anon, authenticated;

-- ---------- 5. 插入現有 RPC ----------
-- p_pairs = [anchor1, replacement1, anchor2, replacement2, …]；每個 anchor 要啱啱出現一次
create or replace function pg_temp._patch_fn(p_fn regprocedure, p_marker text, p_pairs text[])
returns text
language plpgsql
as $$
declare
  v_def text := pg_get_functiondef(p_fn);
  v_new text;
  v_n int;
  i int;
begin
  if position(p_marker in v_def) > 0 then return 'skip (already patched): ' || p_fn::text; end if;
  v_new := v_def;
  for i in 1 .. array_length(p_pairs, 1) by 2 loop
    v_n := (length(v_new) - length(replace(v_new, p_pairs[i], ''))) / greatest(length(p_pairs[i]), 1);
    if v_n <> 1 then
      raise exception 'anchor found % times in %: %', v_n, p_fn, p_pairs[i];
    end if;
    v_new := replace(v_new, p_pairs[i], p_pairs[i + 1]);
  end loop;
  execute v_new;
  return 'patched: ' || p_fn::text;
end;
$$;

-- 5a. 答題：完成一組 +5、答啱 +score（每日上限）；喺扣數 update 之前加，所以回傳 balance 已包升級鑽石
select pg_temp._patch_fn('public.award_round_diamonds(integer,integer)', '_grant_trainer_', array[
  '  bal int;',
  '  bal int;' || chr(10) || '  v_tx jsonb;',
  '  update user_account set',
  '  v_tx := _grant_trainer_exp(uid, 5, score);' || chr(10) || '  update user_account set',
  'return jsonb_build_object(''bonus'', bonus, ''balance'', bal);',
  'return jsonb_build_object(''bonus'', bonus, ''balance'', bal, ''trainer'', v_tx);'
]);

-- 5b. AI 戰：贏先加 round(10×倍率)，首通 +20
select pg_temp._patch_fn('public.settle_battle_v2(text,text,text,text,integer,boolean,boolean)', '_grant_trainer_', array[
  'v_bal int;',
  'v_bal int;' || chr(10) || '  v_tx jsonb;',
  '  -- 4) 配額統計',
  '  if p_kind = ''ai'' and p_result = ''win'' then' || chr(10) ||
  '    v_tx := _grant_trainer_exp(v_uid, round(10 * (case p_tier when ''easy'' then 0.7 when ''hard'' then 1.6 when ''inferno'' then 2.5 else 1.0 end))::int' || chr(10) ||
  '      + (case when v_first then 20 else 0 end));' || chr(10) ||
  '  end if;' || chr(10) || '  -- 4) 配額統計',
  '''allowed'', true, ''bonus'', v_bonus, ''balance'', v_bal, ''first_clear'', v_first,',
  '''allowed'', true, ''trainer'', v_tx, ''bonus'', v_bonus, ''balance'', v_bal, ''first_clear'', v_first,'
]);

-- 5c. 隨機 PvP：確認贏 +20、其他 +5（disputed／冇能量 early return 唔加；已結算 early return 唔會重複加）
select pg_temp._patch_fn('public.settle_pvp_battle(uuid,boolean,integer)', '_grant_trainer_', array[
  'v_bal int; v_wins int; v_losses int; v_pvp int;',
  'v_bal int; v_wins int; v_losses int; v_pvp int;' || chr(10) || '  v_tx jsonb;',
  '  v_used := coalesce((v_days -> v_today ->> ''used'')::int, 0) + 1;',
  '  v_tx := _grant_trainer_exp(v_uid, case when v_result = ''win'' and v_confirmed then 20 else 5 end);' || chr(10) ||
  '  v_used := coalesce((v_days -> v_today ->> ''used'')::int, 0) + 1;',
  '''allowed'', true, ''result'', v_result, ''confirmed'', v_confirmed,',
  '''allowed'', true, ''trainer'', v_tx, ''result'', v_result, ''confirmed'', v_confirmed,'
]);

-- 5d. 捕捉：第一次攞到呢個 stage1 dex +15
select pg_temp._patch_fn('public.obtain_capture(text,integer)', '_grant_trainer_', array[
  'v_entry_count int;',
  'v_entry_count int;' || chr(10) || '  v_tx jsonb;',
  'return jsonb_build_object(''entry'', to_jsonb(v_ent), ''is_dupe'', v_is_dupe);',
  'v_tx := _grant_trainer_dex(v_uid, v_ck.stage1_dex);' || chr(10) ||
  '  return jsonb_build_object(''entry'', to_jsonb(v_ent), ''is_dupe'', v_is_dupe, ''trainer'', v_tx);'
]);

-- 5e. 扭蛋（單抽／第 10 抽）：同上；balance 用加完獎勵之後嘅數
select pg_temp._patch_fn('public.gacha_pull(numeric,integer)', '_grant_trainer_', array[
  'start_exp numeric := 0;',
  'start_exp numeric := 0;' || chr(10) || '  v_tx jsonb;',
  'return jsonb_build_object(''entry'', to_jsonb(ent), ''rarity'', v_rarity,',
  'v_tx := _grant_trainer_dex(uid, ck.stage1_dex);' || chr(10) ||
  '  return jsonb_build_object(''entry'', to_jsonb(ent), ''rarity'', v_rarity,',
  '''is_dupe'', is_dupe, ''balance'', bal);',
  '''is_dupe'', is_dupe, ''trainer'', v_tx, ''balance'', coalesce((v_tx ->> ''balance'')::int, bal));'
]);

select pg_temp._patch_fn('public.gacha_pull_lucky(integer)', '_grant_trainer_', array[
  'v_entry_count int;',
  'v_entry_count int;' || chr(10) || '  v_tx jsonb;',
  'return jsonb_build_object(''entry'', to_jsonb(ent), ''rarity'', v_rarity,',
  'v_tx := _grant_trainer_dex(v_uid, ck.stage1_dex);' || chr(10) ||
  '  return jsonb_build_object(''entry'', to_jsonb(ent), ''rarity'', v_rarity,',
  '''is_dupe'', v_is_dupe, ''balance'', v_bal);',
  '''is_dupe'', v_is_dupe, ''trainer'', v_tx, ''balance'', coalesce((v_tx ->> ''balance'')::int, v_bal));'
]);

-- 5f. 訓練員卡（Friends／PvP 戰前頁）加 exp
select pg_temp._patch_fn('public.get_trainer_cards(uuid[])', 'trainer_exp', array[
  '''avatar'', ua.trainer_avatar,',
  '''avatar'', ua.trainer_avatar, ''exp'', coalesce(ua.trainer_exp, 0),'
]);

-- ---------- 6. 驗證（read-only） ----------
-- select p.oid::regprocedure, position('_grant_trainer_' in pg_get_functiondef(p.oid)) > 0 as patched
--   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--  where n.nspname = 'public' and p.proname in ('award_round_diamonds','settle_battle_v2','settle_pvp_battle','obtain_capture','gacha_pull','gacha_pull_lucky');
-- select has_function_privilege('authenticated', 'public._grant_trainer_exp(uuid,int,int)', 'execute');  -- 要 false
-- select column_name from information_schema.role_column_grants
--  where table_name = 'user_account' and privilege_type = 'UPDATE' and grantee = 'authenticated';      -- 唔可以有 trainer_*
