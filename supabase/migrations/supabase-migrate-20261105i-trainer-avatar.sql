-- =====================================================================
-- 2026-11-05i：Trainer Avatar（第 14 項）＋ 好友對戰 pre-battle 卡（第 13 項）＋ 刪舊 pet_* 欄位
--   1. user_account.trainer_avatar：原作角色全身像 id（client 直寫，column grant + check 限字元）
--   2. get_trainer_cards(p_uids)：名、頭像、PvP 戰績、同我嘅對戰紀錄；回 { cards: [...] }
--      （client _rpc 遇到 array 只拎第一個，所以包一層 object）
--      只回自己、已接受好友、或者 24 小時內同我打過 PvP 嘅對手
--   3. 刪狀態系統第一期 spec 講明唔再用嘅 pet_streak／pet_last_fed_day／pet_settled_day／pet_decay_day
--      （pet_health = 飽肚值、pet_updated_at = 錨點，仲用緊，唔刪）
-- =====================================================================

alter table public.user_account add column if not exists trainer_avatar text;
alter table public.user_account drop constraint if exists user_account_trainer_avatar_chk;
alter table public.user_account add constraint user_account_trainer_avatar_chk
  check (trainer_avatar is null or trainer_avatar ~ '^[a-z0-9-]{1,32}$');
grant select (trainer_avatar) on public.user_account to authenticated;
grant update (trainer_avatar) on public.user_account to authenticated;

create or replace function public.get_trainer_cards(p_uids uuid[])
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_day bigint := (extract(epoch from now()) * 1000)::bigint - 86400000;
  v_out jsonb;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if coalesce(array_length(p_uids, 1), 0) > 60 then raise exception 'too many trainers'; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'uid',    ua.id,
           'name',   coalesce(ua.trainer_name, 'Trainer'),
           'avatar', ua.trainer_avatar,
           'wins',   coalesce(ua.pvp_wins, 0),
           'losses', coalesce(ua.pvp_losses, 0),
           'h2h_w',  (select count(*) from battles b
                       where b.mode = 'pvp' and b.state = 'finished'
                         and ((b.p1_uid = v_uid and b.p2_uid = ua.id and b.winner = 'p1')
                           or (b.p2_uid = v_uid and b.p1_uid = ua.id and b.winner = 'p2'))),
           'h2h_l',  (select count(*) from battles b
                       where b.mode = 'pvp' and b.state = 'finished'
                         and ((b.p1_uid = v_uid and b.p2_uid = ua.id and b.winner = 'p2')
                           or (b.p2_uid = v_uid and b.p1_uid = ua.id and b.winner = 'p1')))
         )), '[]'::jsonb)
    into v_out
    from user_account ua
   where ua.id = any(p_uids)
     and (ua.id = v_uid
       or exists (select 1 from friendships f
                   where f.status = 'accepted'
                     and ((f.requester = v_uid and f.addressee = ua.id)
                       or (f.addressee = v_uid and f.requester = ua.id)))
       or exists (select 1 from battles b
                   where b.mode = 'pvp' and b.created_at >= v_day
                     and ((b.p1_uid = v_uid and b.p2_uid = ua.id)
                       or (b.p2_uid = v_uid and b.p1_uid = ua.id))));
  return jsonb_build_object('cards', v_out);
end;
$$;

revoke all on function public.get_trainer_cards(uuid[]) from public, anon;
grant execute on function public.get_trainer_cards(uuid[]) to authenticated;

alter table public.user_entries drop column if exists pet_streak;
alter table public.user_entries drop column if exists pet_last_fed_day;
alter table public.user_entries drop column if exists pet_settled_day;
alter table public.user_entries drop column if exists pet_decay_day;
