-- ============================================================
-- v135 fix: obtain_capture 42702 — column reference "chain_key" is ambiguous
-- 根因：參數名 chain_key 同 user_entries.chain_key 撞名（plpgsql.variable_conflict）
-- 證據：slowpoke/79 stage1 正確仍 400；bulbasaur/2 進化 dex 則係 chain not capturable
-- 跑法：Supabase Dashboard → SQL Editor → Run
-- ============================================================

drop function if exists obtain_capture(text, int);

create or replace function obtain_capture(p_chain_key text, p_dex_id int)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_ck record;
  v_ent user_entries%rowtype;
  v_is_dupe boolean := false;
  v_entry_count int;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if p_dex_id is null or p_dex_id < 1 or p_dex_id > 649 then
    raise exception 'invalid dex_id';
  end if;

  select cr.chain_key, cr.stage1_dex, cr.gen into v_ck
  from chain_rarity cr
  where cr.chain_key = p_chain_key and cr.rarity = 'normal';

  if v_ck is null or v_ck.stage1_dex <> p_dex_id then
    raise exception 'chain not capturable';
  end if;

  if v_ck.gen > max_unlocked_gen(v_uid) then
    raise exception 'gen locked';
  end if;

  select count(*) into v_entry_count
  from user_entries e
  where e.account_id = v_uid;

  select * into v_ent
  from user_entries e
  where e.account_id = v_uid and e.chain_key = v_ck.chain_key;

  if found then
    v_is_dupe := true;
    update user_entries e set
      ev_points = e.ev_points + 1,
      dupes = e.dupes + 1,
      stars = least(5, 1 + (e.dupes + 1) / 5),
      updated_at = (extract(epoch from now()) * 1000)::bigint
    where e.id = v_ent.id
    returning * into v_ent;
  else
    insert into user_entries(
      account_id, chain_key, stage, exp, level, ivs, evs,
      ev_points, candies, dupes, stars, active, owned_species,
      obtained_at, updated_at
    ) values (
      v_uid, v_ck.chain_key, 1, 0, 1,
      jsonb_build_object(
        'hp', floor(random()*32)::int, 'atk', floor(random()*32)::int,
        'def', floor(random()*32)::int, 'spa', floor(random()*32)::int,
        'spd', floor(random()*32)::int, 'spe', floor(random()*32)::int
      ),
      jsonb_build_object('hp',0,'atk',0,'def',0,'spa',0,'spd',0,'spe',0),
      0, 0, 0, 1, v_entry_count = 0, ARRAY[v_ck.stage1_dex::text],
      (extract(epoch from now()) * 1000)::bigint,
      (extract(epoch from now()) * 1000)::bigint
    )
    returning * into v_ent;
  end if;

  return jsonb_build_object('entry', to_jsonb(v_ent), 'is_dupe', v_is_dupe);
end;
$$;

revoke all on function obtain_capture(text, int) from public;
revoke all on function obtain_capture(text, int) from anon;
grant execute on function obtain_capture(text, int) to authenticated;
