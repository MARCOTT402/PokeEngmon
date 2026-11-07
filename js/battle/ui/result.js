/* ============================================================
   PokeEngmon Battle - PvP 結果回報、結算、結果畫面、投降、獎勵
   由 js/battle/battle.js 拆出（總計劃 P2.5；Rule 117）。
   - 共用狀態：S = BattleUI._.S（原本閉包嘅 let）
   - 其他檔嘅函數／數據：B.xxx（B = BattleUI._）；同一個檔入面照直接 call
   載入次序：js/battle/battle.js 之後（index.html）。
   ============================================================ */

(() => {
  const B = BattleUI._, S = B.S;

  /* ---------- 狀態系統第二期：PvP 結果報告（server 對兩邊報告先計勝負） ---------- */
  function reportPvpResult(battleId, winner) {
    if (!window.SupabaseAuth || !SupabaseAuth.currentUser || !SupabaseAuth.currentUser()) return Promise.resolve(null);
    const hp = side => S.state[side].team.map(p => Math.max(0, Math.min(1000, Math.round(p.hp / Math.max(1, p.maxHp) * 1000))));
    return SupabaseAuth._rpc("report_battle_result", { p_battle: battleId, p_report: { winner, hp: { p1: hp("p1"), p2: hp("p2") } } })
      .catch(() => null);
  }
  /* 好友局結算 v2：等對手報告（最多 ~12 秒），等唔到就 force（計贏唔派鑽）；未跑 migration → 舊 RPC */
  async function settleFriendV2(battleId) {
    if (!battleId || !SupabaseAuth._rpc) return undefined;
    if (S.pvpReport) await S.pvpReport;
    let res;
    for (let i = 0; i < 8; i++) {
      /* _rpc 出錯會回 null（唔 throw）：第一次就 null ＝ 未跑 migration／RPC 唔得 → 交返舊 RPC */
      res = await SupabaseAuth._rpc("settle_friend_battle_v2", { p_battle: battleId, p_force: false });
      if (res == null) return i === 0 ? undefined : null;
      if (!res.pending) return res;
      await new Promise(r => setTimeout(r, 1500));
    }
    return SupabaseAuth._rpc("settle_friend_battle_v2", { p_battle: battleId, p_force: true });
  }
  /* 隨機 PvP 結算（migration 20261106）：同好友局一樣等對手報告；等唔到就 force（計贏但只派 1💎）。
     _rpc 出錯回 null（Rule 75），唔 throw */
  async function settleRandomPvp(battleId, questionsTodayN) {
    if (!battleId || !SupabaseAuth._rpc) return null;
    if (S.pvpReport) await S.pvpReport;
    const args = force => ({ p_battle: battleId, p_force: force, p_questions_today: questionsTodayN });
    let res;
    for (let i = 0; i < 8; i++) {
      res = await SupabaseAuth._rpc("settle_pvp_battle", args(false));
      if (res == null) return null;
      if (!res.pending) return res;
      await new Promise(r => setTimeout(r, 1500));
    }
    return SupabaseAuth._rpc("settle_pvp_battle", args(true));
  }

  /* ---------- 完結 ---------- */
  function finishBattle() {
    /* PvP：兩邊客戶端都會行到呢度（seed 同步），寫 winner 落 row。
       兩邊寫嘅值一樣，idempotent；冇 winner（斷線個案）就 skip */
    if (S.mode === "pvp" && S.pvpBattle && S.state.winner) {
      const w = S.state.winner;   /* state 視角 = row 視角（create 時已對齊 p1/p2） */
      PvpNet.finishBattleRow(S.pvpBattle.id, w);
      S.pvpReport = reportPvpResult(S.pvpBattle.id, w);
    }
    const won = S.state.winner === S.mySide;
    B.saveTeamCare();   /* 正常完結（包括投降）先寫；中途斷線／關 app 唔會行到呢度 */
    (async () => {
      await B.say(S.forfeited ? "You gave up and ran away..." : won ? "You won the battle!" : "You lost...");
      /* 對戰完：淡出 battle BGM，恢復全域 town BGM */
      try { if (window.CaptureScene) { CaptureScene.audio.stopBGM(400); CaptureScene.audio.startTownBGM(); } } catch (e) {}
      /* 投降都行結算（當輸；配額都照扣 —— 係打完先扣，唔係開戰扣） */
      const reward = await applyRewards(won && !S.forfeited);
      showResult(won && !S.forfeited, S.forfeited, reward);
    })();
  }

  /* 結算畫面（PokeRogue：WIN／LOSE ＋ EXP／💎／升級明細）；撳 CONTINUE 先返列表 */
  function showResult(win, wasForfeit, reward) {
    document.getElementById("br-title").textContent = wasForfeit ? "FORFEIT" : win ? "WIN" : "LOSE";
    document.getElementById("br-title").className = "br-title " + (win ? "br-win" : "br-lose");
    document.getElementById("br-sub").textContent = wasForfeit
      ? "You ran away from the battle."
      : win ? `${B.foeTrainerName()} was defeated!` : "You lost the battle...";
    const rows = [];
    const gains = (reward && reward.expGains) || [];
    if (gains.length) {
      /* EXP 逐隻唔同（按等級比例派）：全部一樣先合併顯示，否則逐隻列 */
      const same = gains.every(g => g.gain === gains[0].gain);
      if (same) rows.push(`<div class="br-row"><span>EXP ×${gains.length}</span><b>+${gains[0].gain}</b></div>`);
      else gains.forEach(g => rows.push(`<div class="br-row"><span>${g.name}</span><b>+${g.gain} EXP</b></div>`));
    }
    if (reward && reward.diamonds > 0) {
      const tag = reward.firstClear ? " · FIRST CLEAR" : "";
      rows.push(`<div class="br-row"><span>DIAMONDS${tag}</span><b>+${reward.diamonds} 💎</b></div>`);
    }
    if (reward) reward.levelUps.forEach(lu =>
      rows.push(`<div class="br-row br-lvup"><span>${lu.name}</span><b>Lv.${lu.from} → ${lu.to}</b></div>`));
    if (!rows.length) rows.push(`<div class="br-row"><span>REWARD</span><b>None</b></div>`);
    /* 能量點（打完先扣，顯示返剩幾多） */
    if (reward && reward.energy) {
      const e = reward.energy;
      rows.push(`<div class="br-row"><span>⚡ ENERGY</span><b>${e.points} / ${e.max}</b></div>`);
    }
    document.getElementById("br-rows").innerHTML = rows.join("");
    /* 隨機 PvP 完場：可加對手做朋友（好友局已經係朋友，照 spec 只睇 foeUid） */
    const addBtn = document.getElementById("br-add-foe");
    if (addBtn) {
      if (S.mode === "pvp" && S.pvpFoeUid) {
        addBtn.style.display = "";
        addBtn.textContent = S.pvpFoeName ? "＋ " + S.pvpFoeName.toUpperCase() : "＋ ADD FRIEND";
        addBtn.onclick = () => {
          if (window.Friends && Friends.addByUid) Friends.addByUid(S.pvpFoeUid, S.pvpFoeName);
          addBtn.style.display = "none";
        };
      } else {
        addBtn.style.display = "none";
        addBtn.onclick = null;
      }
    }
    document.getElementById("battle-result").style.display = "flex";
    S.acting = false;
  }

  /* 撳 RUN 確認 = 投降認輸（唔派獎勵，直接當輸） */
  function forfeitBattle() {
    if (!S.state || S.acting) return;
    S.acting = true;
    S.forfeited = true;
    S.state.winner = S.foeSide;
    /* PvP：寫低完場等對手知道（唔使等佢嘅 action 先到） */
    if (S.mode === "pvp" && S.pvpBattle) {
      PvpNet.finishBattleRow(S.pvpBattle.id, S.pvpSide === "p1" ? "p2" : "p1");
    }
    B.hideActionMenus();
    finishBattle();
  }

  /* 結算獎勵：贏先派 EXP；鑽石 PvP 贏 3／輸 1（投降唔入嚟），
     AI 訓練家 = 每隻難度（Easy/Normal/Hard/Inferno）首通一次性 10💎、重複 0💎。
     EXP 派法（v1.15.24 起，原莊 per-enemy 制）：每擊倒一隻敵寵，凡面對過佢嘅我寵
     均分 baseExp × 敵LV / 7，以弱勝強 ×(1+等級差/50) cap ×3 —— 輸／投降都照攞（一隻一隻計）；
     AI 對戰再乘難度倍率（Easy ×0.7、Normal ×1、Hard ×1.6、Inferno ×2.5）。
     PvP 贏額外固定 30／隻（唔按敵寵計，防互讓刷 EXP）。
     登入時鑽石經 settle_battle RPC（server 計公式 + 記低邊個打過 + 權威 balance），
     EXP 經 add_entry_exp RPC；RPC 失敗唔本地加（避免同雲端脫節後 pull 打回，同 quiz 一樣）。 */
  async function applyRewards(won) {
    const st = loadState();
    const isPvp = S.mode === "pvp";
    const isFriend = isPvp && S.pvpIsFriend;   /* 好友局：賺 1／輸 0，受 server 每日 5 場上限 */
    const loggedIn = window.SupabaseAuth && SupabaseAuth.isLoggedIn();
    const tier = isPvp ? null : S.aiTier;
    const tpBefore = S.aiTrainer ? B.trainerProgress(st, S.aiTrainer.id) : null;
    const firstClear = !!(won && S.aiTrainer && tier && tpBefore[tier] === 0);
    const expMult = (!isPvp && tier && B.TIER_META[tier]) ? B.TIER_META[tier].mult : 1;
    let diamonds = isFriend ? (won ? 1 : 0)
      : isPvp ? (won ? 3 : 1)
      : (firstClear ? 10 : 0);
    const levelUps = [];
    const expGains = [];   /* {name, gain} 逐隻記錄，結算畫面用 */
    /* 引擎喺每隻敵寵 faint 嗰陣已記落 state[mySide].pendingExp；呢度一次過派。
       贏／輸／投降都照派（EXP 係逐隻敵寵計，唔係勝利獎勵） */
    const pending = (S.state && S.state[S.mySide] && S.state[S.mySide].pendingExp) || [];
    const gainByUid = {};
    pending.forEach(g => { gainByUid[g.uid] = (gainByUid[g.uid] || 0) + g.gain; });
    S.teamEntries.forEach(entry => {
      const e = st.entries.find(x => x.uid === entry.uid);
      if (!e) return;
      let gain = gainByUid[e.uid] || 0;
      if (isPvp && won) gain += 30;   /* PvP 贏嘅固定 30（唔按敵寵計） */
      if (gain > 0 && expMult > 1) gain = Math.round(gain * expMult);
      if (gain <= 0) return;
      const lvBefore = e.level || 1;
      const dexId = entryCurrentSpecies(e)[0];
      addEntryExp(e, gain);
      const p = (typeof dexOf === "function") ? dexOf(dexId) : null;
      const name = (p && p.name) || "Pokémon";
      expGains.push({ name, gain });
      if (e.level > lvBefore) levelUps.push({ name, from: lvBefore, to: e.level });
      if (loggedIn) SupabaseAuth.addEntryExp(e.uid, gain);
    });
    /* ---- 能量點：打完先扣 1 EP（開戰唔扣，中途斷線唔會白扣）；好友局唔扣 ---- */
    const day = dateKey(Date.now());
    const kind = isPvp ? "pvp" : "ai";
    const questionsTodayN = questionsToday(st, day);
    /* server RPC 會寫返 battleDays[day].used，所以要保證個格存在 */
    if (!st.battleDays[day]) st.battleDays[day] = { used: 0, ai: 0, pvp: 0 };
    let energySpent = false;
    if (!isFriend) energySpent = Energy.spend(st, 1);
    /* 全員無倒 = Flawless（輸／投降唔算） */
    const mineTeam = (S.state && S.state[S.mySide] && S.state[S.mySide].team) || [];
    const flawless = !!won && mineTeam.every(p => p.hp > 0);

    /* 登入：一律 call RPC（server 計鑽石 + 記配額 + 記累積場數）；
       匿名：本地加鑽石。AI 首通由 server 判斷（本地記錄可能跨機唔齊） */
    if (loggedIn && isFriend) {
      /* 好友局：server 專用結算（每日 5 場計鑽、唔扣答題配額） */
      let res = await settleFriendV2(S.pvpBattle && S.pvpBattle.id);
      if (res === undefined) res = (window.SupabaseAuth && SupabaseAuth.settleFriendBattle)
        ? await SupabaseAuth.settleFriendBattle(won ? "win" : "lose")
        : null;
      if (res && res.disputed && window.App && App.toast) App.toast("Results didn't match — this battle won't count");
      else if (res && res.result === "win" && res.confirmed === false && window.App && App.toast) App.toast("Opponent didn't confirm — win recorded without diamonds");
      if (res && typeof res.balance === "number") {
        diamonds = typeof res.bonus === "number" ? res.bonus : diamonds;
        st.diamonds = res.balance;
        if (res.wins != null) { st.pvpWins = res.wins; st.pvpLosses = res.losses; }
        if (typeof res.paid_today === "number") st.friendDiamondsToday = res.paid_today;
      } else {
        diamonds = 0;
        if (window.App && App.toast) App.toast("Cloud sync hiccup — battle rewards not saved");
      }
    } else if (loggedIn) {
      /* 隨機 PvP：server 對兩邊報告先計勝負（settle_pvp_battle）；
         AI：settle_battle_v2 認 (訓練家, 難度) 首通 + 扣 EP。舊 settle_battle v1 已收回（migration 20261106） */
      let res = null;
      if (isPvp) {
        res = await settleRandomPvp(S.pvpBattle && S.pvpBattle.id, questionsTodayN);
        if (res && res.disputed && window.App && App.toast) App.toast("Results didn't match — this battle won't count");
        else if (res && res.result === "win" && res.confirmed === false && window.App && App.toast) App.toast("Opponent didn't confirm — win recorded with 1 💎");
      } else if (SupabaseAuth.settleBattleV2) {
        try {
          res = await SupabaseAuth.settleBattleV2(
            kind, won ? "win" : "lose", S.aiTrainer ? S.aiTrainer.id : null,
            tier, questionsTodayN, flawless, false);
        } catch (e) { console.warn("[Battle] settle_battle_v2 failed:", e.message); }
      }
      if (res && typeof res.balance === "number") {
        diamonds = res.allowed === false ? 0 : res.bonus;
        if (res.allowed === false) {
          if (window.App && App.toast) App.toast("No energy left — this battle won't count");
        }
        st.diamonds = res.balance;   /* server 權威，唔係本地 += */
        if (res.wins != null) { st.pvpWins = res.wins; st.pvpLosses = res.losses; }
        if (typeof res.used === "number") st.battleDays[day].used = res.used;
        if (typeof res.ai_total === "number") st.battleAiTotal = res.ai_total;
        if (typeof res.pvp_total === "number") st.battlePvpTotal = res.pvp_total;
        /* EP ledger 用 server 做準（防止改 localStorage 刷場） */
        if (res.energy && Energy.adopt) Energy.adopt(st, res.energy);
      } else {
        diamonds = 0;
        if (window.App && App.toast) App.toast("Cloud sync hiccup — battle rewards not saved");
      }
    } else {
      st.diamonds = (st.diamonds || 0) + diamonds;
    }
    /* ---- 精通記錄：每個難度分開計；全員無倒下次再贏就標 Flawless ---- */
    let unlockedInferno = false;
    if (won && S.aiTrainer && tier) {
      const tp = B.trainerProgress(st, S.aiTrainer.id);
      st.trainerProgress = st.trainerProgress || {};
      if (tier === "hard" && tp.hard === 0) unlockedInferno = true;
      st.trainerProgress[S.aiTrainer.id] = {
        easy: tp.easy + (tier === "easy" ? 1 : 0),
        normal: tp.normal + (tier === "normal" ? 1 : 0),
        hard: tp.hard + (tier === "hard" ? 1 : 0),
        inferno: tp.inferno + (tier === "inferno" ? 1 : 0),
        flawless: tp.flawless.slice()
      };
      /* 冇任何一隻我方寶可夢倒下 = Flawless（投降／輸唔會入嚟） */
      if (flawless && !tp.flawless.includes(tier)) {
        st.trainerProgress[S.aiTrainer.id].flawless.push(tier);
      }
      /* 舊欄位保持向後兼容（其他頁面仍會睇） */
      st.aiTrainersBeaten = st.aiTrainersBeaten || [];
      if (!st.aiTrainersBeaten.includes(S.aiTrainer.id)) st.aiTrainersBeaten.push(S.aiTrainer.id);
    }
    saveState();
    if (unlockedInferno) B.playInfernoUnlock(S.aiTrainer);
    /* 好友局唔扣 EP，所以唔顯示能量點那行 */
    return {
      expGains, diamonds, levelUps, firstClear,
      energy: (!isFriend && energySpent) ? Energy.status(st) : null
    };
  }

  Object.assign(B, {
    reportPvpResult, settleFriendV2, settleRandomPvp, finishBattle, showResult, forfeitBattle, applyRewards
  });
})();
