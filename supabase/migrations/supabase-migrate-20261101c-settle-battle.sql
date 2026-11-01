-- ============================================================
-- 20261101c：對戰結算鑽石 RPC（settle_battle）＋ PvP 戰績
--
-- 問題：對戰獎勵（battle.js applyRewards）之前係純本地 st.diamonds +=，
--   登入用戶唔會上雲，下次 pull() 被雲端舊數冚咗 → 對戰鑽石形同虛設。
-- 做法：同 award_round_diamonds 一樣，公式擺 server（server-authoritative），
--   回傳 {bonus, balance, first_clear, wins, losses}，前端用權威 balance 覆寫本地。
-- 公式（同前端本地 fallback 對齊）：
--   PvP 贏 = 3💎；PvP 輸 = 1💎（投降當輸 = 1💎）
--   AI 訓練家 = 首次擊敗一次性 10💎，重複擊敗 0💎
--   （server 用 user_account.ai_trainers_beaten 記錄，防重複攞 + 跨機刷）
-- PvP 戰績：user_account.pvp_wins / pvp_losses，settle_battle pvp call 時 +1，
--   俾 leaderboard / friends system 用（前端喺對戰主選單顯示 W–L）。
-- ============================================================

-- 舊版簽名（p_trainer_level int）已廢棄，先 drop 咗先
drop function if exists settle_battle(text, text, int);

alter table user_account add column if not exists ai_trainers_beaten text[] not null default '{}';
alter table user_account add column if not exists pvp_wins int not null default 0;
alter table user_account add column if not exists pvp_losses int not null default 0;

create or replace function settle_battle(p_kind text, p_result text, p_trainer_id text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_bonus int := 0;
  v_bal int;
  v_first boolean := false;
  v_beaten text[];
  v_wins int;
  v_losses int;
  /* 同 js/battle/battle.js AI_TRAINERS 嘅 10 個 id 對齊；白名單外嘅 id 直接當 0 鑽 */
  v_trainers text[] := array[
    'youngster', 'bugcatcher', 'lass', 'gentleman', 'ace',
    'rival_ethan', 'jasmine', 'steven', 'cynthia', 'alder'
  ];
begin
  if uid is null then raise exception 'not authenticated'; end if;
  if p_kind not in ('ai', 'pvp') or p_result not in ('win', 'lose') then
    raise exception 'invalid kind/result';
  end if;

  if p_kind = 'pvp' then
    v_bonus := case when p_result = 'win' then 3 else 1 end;
    /* PvP 戰績（順便攞返更新後嘅數回傳） */
    update user_account ua set
      pvp_wins = ua.pvp_wins + (case when p_result = 'win' then 1 else 0 end),
      pvp_losses = ua.pvp_losses + (case when p_result = 'lose' then 1 else 0 end)
    where ua.id = uid
    returning ua.pvp_wins, ua.pvp_losses into v_wins, v_losses;
  elsif p_result = 'win' and p_trainer_id is not null and p_trainer_id = any(v_trainers) then
    select ua.ai_trainers_beaten into v_beaten from user_account ua where ua.id = uid;
    if not found then raise exception 'account not found'; end if;
    if not (p_trainer_id = any(v_beaten)) then
      v_bonus := 10;
      v_first := true;
      update user_account ua set
        ai_trainers_beaten = array_append(ua.ai_trainers_beaten, p_trainer_id)
      where ua.id = uid;
    end if;
  end if;

  if v_bonus > 0 then
    update user_account ua set
      diamonds = ua.diamonds + v_bonus,
      updated_at = (extract(epoch from now()) * 1000)::bigint
    where ua.id = uid
    returning diamonds into v_bal;
  else
    select ua.diamonds into v_bal from user_account ua where ua.id = uid;
    if not found then raise exception 'account not found'; end if;
  end if;

  if v_wins is null then
    select ua.pvp_wins, ua.pvp_losses into v_wins, v_losses from user_account ua where ua.id = uid;
  end if;

  return jsonb_build_object(
    'bonus', v_bonus, 'balance', v_bal, 'first_clear', v_first,
    'wins', v_wins, 'losses', v_losses
  );
end;
$$;

revoke execute on function settle_battle(text, text, text) from public, anon;
grant execute on function settle_battle(text, text, text) to authenticated;

notify pgrst, 'reload schema';
