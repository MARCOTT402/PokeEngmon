-- =====================================================================
-- 2026-11-05k：第 5 項 — 攜帶道具跟原作，鎖死 held_item
--   原作：進化石係「使用」（啱條件即刻進化），唔係攜帶；攜帶只限樹果同 Mega 石。
--   1. 攜帶緊進化石（或者其他唔認得嘅道具）嘅 entry：進化石退返 items_stones，held_item 清空
--   2. held_item 只准 null／樹果／Mega 石（check constraint 用 _berry_info／_mega_dex 唔得，
--      所以用 trigger 檢查）
--   3. 收回 authenticated 對 held_item 嘅 column update（之前為進化石 B 方案開）；
--      之後只可以經 hold_item RPC（扣背包數量）／settle_battle_team（食咗樹果清走）寫
-- =====================================================================

-- 1. 退還攜帶緊嘅進化石
do $m$
declare r record;
begin
  for r in
    select ue.id, ue.account_id, ue.held_item from user_entries ue
     where ue.held_item is not null
       and _berry_info(ue.held_item) is null
       and _mega_dex(ue.held_item) is null
  loop
    if r.held_item in ('thunder', 'moon', 'fire', 'leaf', 'water') then
      update user_account ua
         set items_stones = jsonb_set(coalesce(ua.items_stones, '{}'::jsonb), array[r.held_item],
                                      to_jsonb(coalesce((ua.items_stones ->> r.held_item)::int, 0) + 1))
       where ua.id = r.account_id;
    end if;
    update user_entries ue set held_item = null where ue.id = r.id;
  end loop;
end
$m$;

-- 2. 只准樹果／Mega 石
create or replace function public._held_item_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.held_item is not null and _berry_info(new.held_item) is null and _mega_dex(new.held_item) is null then
    raise exception 'held_item must be a berry or a Mega Stone';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_held_item_guard on public.user_entries;
create trigger trg_held_item_guard
  before insert or update of held_item on public.user_entries
  for each row execute function public._held_item_guard();

-- 3. client 唔可以再直寫
revoke update (held_item) on public.user_entries from authenticated;
revoke insert (held_item) on public.user_entries from authenticated;
