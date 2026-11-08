-- ============================================================
-- 扭蛋重做 Part 0（plan .trae/documents/20261108-gacha-dragonite-incubator-plan.md Task 0.1）
-- 1) 共用派寵 helper _obtain_gacha_entry：同 gacha_pull（20261031b）一樣嘅重複規則
--    —— 只當「未完全進化（is_final = false）」嘅 entry 係重複（最早獲得優先）；全部完全進化 → 開新 entry。
--    孵化器 hatch_egg（Part 2）用。
-- 2) gacha_pull_lucky（10 連保底槽）漏咗 is_final 條件：抽中已完全進化嘅鏈會當重複送糖、唔開新 entry；
--    有多個 entry 時揀邊個亦唔固定。用 Rule 78 做法（pg_get_functiondef + replace）只改嗰一句，
--    保留 20261108-trainer-level 插入嘅 _grant_trainer_dex／'trainer' 欄。
-- 前置：supabase-migrate-20261108-trainer-level.sql 已套用。重跑安全（helper create or replace；patch 有 marker）。
-- ============================================================

-- ---------- 1. 共用派寵 helper ----------
create or replace function public._obtain_gacha_entry(p_uid uuid, p_chain_key text, p_stage1 int, p_entry_count int)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  ent user_entries%rowtype;
  v_is_dupe boolean := false;
begin
  select * into ent from user_entries
    where account_id = p_uid and chain_key = p_chain_key and is_final = false
    order by obtained_at asc limit 1;
  if found then
    /* 重複：EV+1、糖果+1、dupes+1、stars 重計（同 gacha_pull） */
    v_is_dupe := true;
    update user_entries set
      ev_points = ev_points + 1,
      dupes = dupes + 1,
      candies = candies + 1,
      stars = least(5, 1 + (dupes + 1) / 5),
      updated_at = (extract(epoch from now()) * 1000)::bigint
    where id = ent.id
    returning * into ent;
  else
    insert into user_entries(account_id, chain_key, stage, exp, level, ivs, evs,
      ev_points, candies, dupes, stars, active, owned_species, obtained_at, updated_at)
    values (p_uid, p_chain_key, 1, 0, 1,
      jsonb_build_object('hp', floor(random()*32)::int, 'atk', floor(random()*32)::int,
        'def', floor(random()*32)::int, 'spa', floor(random()*32)::int,
        'spd', floor(random()*32)::int, 'spe', floor(random()*32)::int),
      jsonb_build_object('hp',0,'atk',0,'def',0,'spa',0,'spd',0,'spe',0),
      0, 0, 0, 1, p_entry_count = 0, ARRAY[p_stage1::text],
      (extract(epoch from now()) * 1000)::bigint, (extract(epoch from now()) * 1000)::bigint)
    returning * into ent;
  end if;
  return jsonb_build_object('entry', to_jsonb(ent), 'is_dupe', v_is_dupe);
end;
$$;

-- 只俾其他 security definer RPC 用（client 唔可以直接 call）
revoke execute on function public._obtain_gacha_entry(uuid, text, int, int) from public, anon, authenticated;

-- ---------- 2. gacha_pull_lucky：重複判斷加 is_final = false（只改一句） ----------
-- 要同 _patch_fn 喺同一個 session 執行（pg_temp）
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

select pg_temp._patch_fn('public.gacha_pull_lucky(integer)', 'is_final = false', array[
  'where account_id = v_uid and chain_key = ck.chain_key;',
  'where account_id = v_uid and chain_key = ck.chain_key and is_final = false' || chr(10) ||
  '    order by obtained_at asc limit 1;'
]);

-- ---------- 3. 驗證（read-only） ----------
-- select position('is_final = false' in pg_get_functiondef('public.gacha_pull_lucky(integer)'::regprocedure)) > 0;  -- true
-- select position('_grant_trainer_dex' in pg_get_functiondef('public.gacha_pull_lucky(integer)'::regprocedure)) > 0; -- true（Trainer Lv 冇被洗走）
-- select has_function_privilege('authenticated', 'public._obtain_gacha_entry(uuid,text,int,int)', 'execute');      -- false
