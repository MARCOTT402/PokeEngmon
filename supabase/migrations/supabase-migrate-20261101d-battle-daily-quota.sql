-- 20261101d：每日對戰配額（每 50 題解鎖 4 場；junior/standard 每日上限 8；結算先扣）
drop function if exists settle_battle(text, text, text);

alter table user_account add column if not exists battle_days jsonb not null default '{}'::jsonb;
alter table user_account add column if not exists battle_ai_total int not null default 0;
alter table user_account add column if not exists battle_pvp_total int not null default 0;

create or replace function settle_battle(
  p_kind text, p_result text, p_trainer_id text default null, p_questions_today int default 0
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_bonus int := 0; v_bal int; v_first boolean := false;
  v_beaten text[]; v_wins int; v_losses int; v_mode text;
  v_today text := to_char((now() at time zone 'Asia/Shanghai')::date, 'YYYY-MM-DD');
  v_q int; v_cap int; v_used int; v_new int;
  v_days jsonb; v_day jsonb; v_ai int; v_pvp int;
  v_trainers text[] := array['youngster','bugcatcher','lass','gentleman','ace',
                             'rival_ethan','jasmine','steven','cynthia','alder'];
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if p_kind not in ('ai','pvp') or p_result not in ('win','lose') then
    raise exception 'invalid kind/result';
  end if;

  select ua.curve_mode, coalesce(ua.battle_days,'{}'::jsonb), ua.diamonds,
         ua.pvp_wins, ua.pvp_losses, ua.ai_trainers_beaten,
         ua.battle_ai_total, ua.battle_pvp_total
    into v_mode, v_days, v_bal, v_wins, v_losses, v_beaten, v_ai, v_pvp
    from user_account ua where ua.id = v_uid;
  if not found then raise exception 'account not found'; end if;

  v_q := greatest(0, least(coalesce(p_questions_today,0), 100000));
  v_cap := case when v_mode in ('junior','standard') then least(8, (v_q / 50) * 4) end;
  v_used := coalesce((v_days -> v_today ->> 'used')::int, 0);

  if v_cap is not null and v_used >= v_cap then
    return jsonb_build_object('bonus',0,'balance',v_bal,'first_clear',false,
      'wins',v_wins,'losses',v_losses,'used',v_used,'cap',v_cap,'allowed',false,
      'ai_total',v_ai,'pvp_total',v_pvp);
  end if;

  if p_kind = 'pvp' then
    v_bonus := case when p_result = 'win' then 3 else 1 end;
  elsif p_result = 'win' and p_trainer_id is not null and p_trainer_id = any(v_trainers)
        and not (p_trainer_id = any(v_beaten)) then
    v_bonus := 10; v_first := true;
  end if;

  v_new := v_used + 1;
  v_day := coalesce(v_days -> v_today, '{}'::jsonb);
  v_day := jsonb_set(v_day, '{used}', to_jsonb(v_new));
  v_day := jsonb_set(v_day, array[p_kind], to_jsonb(coalesce((v_day ->> p_kind)::int,0) + 1));

  update user_account ua set
    battle_days = jsonb_set(coalesce(ua.battle_days,'{}'::jsonb), array[v_today], v_day),
    battle_ai_total = ua.battle_ai_total + (case when p_kind = 'ai' then 1 else 0 end),
    battle_pvp_total = ua.battle_pvp_total + (case when p_kind = 'pvp' then 1 else 0 end),
    pvp_wins = ua.pvp_wins + (case when p_kind = 'pvp' and p_result = 'win' then 1 else 0 end),
    pvp_losses = ua.pvp_losses + (case when p_kind = 'pvp' and p_result = 'lose' then 1 else 0 end),
    ai_trainers_beaten = case when v_first
      then array_append(ua.ai_trainers_beaten, p_trainer_id)
      else ua.ai_trainers_beaten end,
    diamonds = ua.diamonds + v_bonus,
    updated_at = (extract(epoch from now()) * 1000)::bigint
  where ua.id = v_uid
  returning ua.diamonds, ua.pvp_wins, ua.pvp_losses, ua.battle_ai_total, ua.battle_pvp_total
    into v_bal, v_wins, v_losses, v_ai, v_pvp;

  return jsonb_build_object('bonus',v_bonus,'balance',v_bal,'first_clear',v_first,
    'wins',v_wins,'losses',v_losses,'used',v_new,'cap',v_cap,'allowed',true,
    'ai_total',v_ai,'pvp_total',v_pvp);
end;
$$;

revoke execute on function settle_battle(text, text, text, int) from public, anon;
grant execute on function settle_battle(text, text, text, int) to authenticated;
notify pgrst, 'reload schema';
