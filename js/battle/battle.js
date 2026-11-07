/* ============================================================
   PokeEngmon Battle - UI 控制器（火紅版排版）
   依賴全域：Battle, BattleState, App, loadState, getActiveEntry,
             entryCurrentSpecies, spriteURL, animatedURL,
             typeLabel, moveInfo, RARITY
   ============================================================ */

const BattleUI = (() => {
  /* P2.5（Rule 117）：原本閉包入面嘅 let 狀態全部搬入 B.S；js/battle/ui/*.js 用 BattleUI._.S 讀寫同一份 */
  const B = { S: {
    state: null,        /* BattleState */
    mode: "ai",         /* 'ai' | 'pvp' */
    mySide: "p1",       /* 玩家係 p1 */
    foeSide: "p2",
    aiTrainer: null,
    teamEntries: [],    /* 玩家揀嘅 entries（原始 entry，唔係 battle pokemon） */
    foeTeamEntries: [],
    acting: false,      /* 防止重複點擊 */
    forfeited: false,   /* 玩家撳 RUN 投降 */
    battleSpeed: 1,      /* 1 = NORMAL、2 = FAST（只限 AI 對戰） */
    pvpTeamSize: 3,       /* 抽中嘅場制 */
    pvpBattle: null,      /* 真 PvP：battles row（含 seed） */
    pvpSide: "p1",        /* 我喺 row 入面係 p1 定 p2 */
    pvpCancel: null,      /* 配對輪詢取消 fn */
    pvpFoeUid: null,      /* 對手 uid（隨機 PvP 用嚟加好友） */
    pvpFoeName: null,     /* 對手名（好友局由邀請帶入） */
    pvpIsFriend: false,   /* 好友局（is_friend = true，獎勵唔同） */
    pvpRules: null,       /* 戰前投票結果 { size, items, switch, votes } */
    pvpVoteTimer: null,   /* 投票倒數 interval */
    pvpVoteWait: null,    /* 等對手票嘅 waitRow（帶 cancel） */
    aiTier: "normal",       /* 目前挑戰嘅難度 */
    levelSyncLevel: null,   /* Inferno：玩家隊伍臨時同步等級 */
    aiPotions: 0,           /* 狀態系統第一期：Inferno AI Potion 已拎走，恆為 0 */
    megaArmed: false,       /* FIGHT 頁 MEGA 掣（第 4c 段）：揀招時一齊交 mega:true */
    battleUsed: {},         /* 今場用咗嘅背包道具 { potion: n, ... }，戰鬥完一次過扣 */
    teamSortBound: false,
    teamPickerRebuild: null,
    _typeTimer: null,
    _typeFull: "",
    _typeDone: null,
    partySel: -1,        /* 揀中咗嘅 team index（options 開緊） */
    partyForced: false,  /* 強制換寵（暈咗）：冇 CANCEL */
    shiftPick: null,
    pvpReport: null,
  } };
  const S = B.S;

  const PVP_VOTE_SECONDS = 30;
  const toast = (m) => App.toast(m);

  /* ---------- 入口 ---------- */
  function openMenu() {
    S.levelSyncLevel = null;
    App.showView("view-battle-menu");
    B.renderMenu();
  }

  /* ---------- 能量點 EP（結算先扣，開戰唔扣） ---------- */
  const BAG_ITEMS = ["potion", "super_potion", "antidote", "burn_heal", "paralyze_heal", "awakening", "ice_heal", "revive"];

  function sleep(ms) { return new Promise(r => setTimeout(r, ms / S.battleSpeed)); }

  /* AI 對戰速度掣（PvP 隱藏）；記住玩家選擇 */
  function syncSpeedButton() {
    const btn = document.getElementById("btn-battle-speed");
    if (!btn) return;
    btn.hidden = S.mode !== "ai";
    btn.textContent = S.battleSpeed > 1 ? "FAST 2×" : "NORMAL 1×";
    btn.classList.toggle("fast", S.battleSpeed > 1);
  }

  /* ---------- 綁定（app init 時 call） ---------- */
  function bind() {
    document.getElementById("btn-battle-speed").onclick = () => {
      S.battleSpeed = S.battleSpeed > 1 ? 1 : 2;
      try { localStorage.setItem("pokeengmon_battle_speed", String(S.battleSpeed)); } catch (e) {}
      syncSpeedButton();
    };
    document.getElementById("br-continue").onclick = () => {
      document.getElementById("battle-result").style.display = "none";
      /* 清走上一場嘅對手資料（加好友掣都收埋） */
      const addFoe = document.getElementById("br-add-foe");
      if (addFoe) { addFoe.style.display = "none"; addFoe.onclick = null; }
      S.pvpBattle = null; S.pvpFoeUid = null; S.pvpFoeName = null; S.pvpIsFriend = false; S.pvpRules = null;
      /* AI 對戰返訓練家梯隊（重建列表 → 顯示新解鎖／✓）；PvP 返對戰主選單 */
      if (S.mode === "ai") B.openAITrainers(); else openMenu();
    };
    document.getElementById("btn-battle-fight").onclick = B.showMoveMenu;
    document.getElementById("btn-battle-bag").onclick = () => {
      if (S.mode === "pvp" && !(S.pvpRules && S.pvpRules.items)) { toast("Medicine is off for this battle."); return; }
      if (!B.bagIds().some(id => B.bagLeft(id) > 0)) { toast("Your bag is empty."); return; }
      B.openBattleBag("bag", false);
    };
    document.getElementById("btn-battle-pokemon").onclick = () => {
      /* 戰前投票唔准自願換：只可以喺暈咗時強制換（showSwitchMenu(true) 另一條路） */
      if (S.mode === "pvp" && S.pvpRules && !S.pvpRules.switch) { toast("Switching is off for this battle."); return; }
      B.openBattleBag("switch", false);
    };
    /* RUN：撳一下彈確認窗（modal 唔可以撳外面關），再撳 RUN 先算投降認輸 */
    document.getElementById("btn-battle-run").onclick = () => {
      if (S.acting || !S.state) return;
      B.sfx("select", .9);
      App.showModal(`
        <div class="confirm-box">
          <p>Run away and <b>forfeit</b> this battle?</p>
          <p class="settings-note">A forfeit counts as a loss — no EXP or 💎.</p>
          <div class="confirm-row">
            <button id="run-confirm-yes" class="btn-big btn-danger">RUN</button>
            <button id="run-confirm-no" class="btn-big btn-plain">CANCEL</button>
          </div>
        </div>`, true);
      document.getElementById("run-confirm-no").onclick = () => App.closeModal();
      document.getElementById("run-confirm-yes").onclick = () => {
        App.closeModal();
        B.forfeitBattle();
      };
    };
    /* 難度選擇彈窗：關閉／撳背景＝取消（唔會亂開戰） */
    const tierClose = document.getElementById("tier-select-close");
    if (tierClose) tierClose.onclick = B.closeTierPicker;
    const tierModal = document.getElementById("tier-select-modal");
    if (tierModal) {
      tierModal.onclick = (ev) => { if (ev.target === tierModal) B.closeTierPicker(); };
    }
    document.getElementById("team-select-cancel").onclick = () => {
      document.getElementById("team-select-modal").style.display = "none";
      S.levelSyncLevel = null;
      openMenu();
    };
    document.getElementById("pvp-match-cancel").onclick = B.cancelMatch;
    document.getElementById("pvp-format-confirm").onclick = B.confirmFormat;
    /* PokeRogue 換精靈頁：options（SEND OUT / CANCEL）+ 右下 CANCEL 掣 */
    document.getElementById("party-opt-send").onclick = () => {
      if (S.partySel < 0) return;
      B.chooseSwitch(S.partySel);
    };
    document.getElementById("party-opt-cancel").onclick = () => {
      B.sfx("select", .9);
      B.closePartyOptions();
      B.selectPartySlot(-1);
      B.partyMsg("Choose a Pokémon.");
    };
    document.getElementById("party-cancel").onclick = () => {
      if (S.partyForced) return;   /* 強制換寵冇得走 */
      B.sfx("select", .9);
      if (S.shiftPick) { B.endShift(null); return; }
      B.closeParty();
      B.showMainMenu();
      B.narrate(`What will ${B.myActive().name.toUpperCase()} do?`);
    };
  }

  /* 內部函數全部經 BattleUI._（= B）互通（js/battle/ui/*.js 喺之後載入，所以對外 API 用 wrapper 延遲讀 B）；對外 API 唔變 */
  Object.assign(B, {
    PVP_VOTE_SECONDS, toast, openMenu, BAG_ITEMS, sleep, syncSpeedButton, bind
  });
  return { _: B, openMenu, bind, renderMenu: (...a) => B.renderMenu(...a), openAITrainers: (...a) => B.openAITrainers(...a), openFriendMatch: (...a) => B.openFriendMatch(...a) };
})();
