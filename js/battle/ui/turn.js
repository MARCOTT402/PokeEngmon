/* ============================================================
   PokeEngmon Battle - 回合結算（AI／PvP）、AI 揀招
   由 js/battle/battle.js 拆出（總計劃 P2.5；Rule 117）。
   - 共用狀態：S = BattleUI._.S（原本閉包嘅 let）
   - 其他檔嘅函數／數據：B.xxx（B = BattleUI._）；同一個檔入面照直接 call
   載入次序：js/battle/battle.js 之後（index.html）。
   ============================================================ */

(() => {
  const B = BattleUI._, S = B.S;

  /* ---------- 回合 resolve ---------- */
  function resolveTurn(playerAction) {
    S.state.turn += 1;
    if (S.mode === "pvp") { resolvePvpTurn(playerAction); return; }
    runTurnResolution(playerAction, pickAIAction());
  }

  /* PvP：交 action → 等對手同一 turn 嘅 action → 雙方各自模擬（seed 一致） */
  async function resolvePvpTurn(playerAction) {
    const turnNo = S.state.turn;
    B.narrate("Waiting for opponent…");
    /* 延遲量測：由交 action 到收到對手 row（timeout 分支唔計） */
    const tLat = (window.performance && performance.now) ? performance.now() : Date.now();
    try {
      await PvpNet.submitAction(S.pvpBattle.id, S.pvpSide, turnNo, playerAction);
      const foeCol = S.pvpSide === "p1" ? "p2_action" : "p1_action";
      const w = PvpNet.waitForOpponentAction(S.pvpBattle.id, foeCol, turnNo);
      const b = await B.raceTimeout(w, PvpNet.ACTION_TIMEOUT_MS);
      w.cancel && w.cancel();
      if (!b) {
        /* 對手斷線（45s 冇郁）：判我贏並寫低結果 */
        await PvpNet.finishBattleRow(S.pvpBattle.id, S.pvpSide);
        S.state.winner = S.mySide; S.state.finished = true;
        await B.say("Opponent disconnected. You win!");
        B.finishBattle();
        return;
      }
      /* 成功收到 row：記一次回合延遲（只留最近 20 次） */
      const nowT = (window.performance && performance.now) ? performance.now() : Date.now();
      const ms = Math.round(nowT - tLat);
      window.__pvpLatency = (window.__pvpLatency || []).concat(ms).slice(-20);
      console.debug("[PvP] turn latency", ms + "ms");
      if (b.state === "finished") {
        /* 對手投降／完場：用 row 嘅 winner */
        S.state.finished = true;
        S.state.winner = b.winner === "p1" ? "p1" : b.winner === "p2" ? "p2" : S.mySide;
        await B.say(S.state.winner === S.mySide ? "Opponent forfeited. You win!" : "The battle has ended.");
        B.finishBattle();
        return;
      }
      const raw = b[foeCol] || {};
      const foeAction = raw.kind === "switch" ? { kind: "switch", idx: raw.idx }
        /* 補位回合：冇暈嗰邊交 pass（Rule 92） */
        : raw.kind === "pass" ? { kind: "pass" }
        /* 用藥：只限戰前投票准用藥，而且係引擎認得嘅道具；否則當冇效 → 出第一招 */
        : (raw.kind === "item" && S.pvpRules && S.pvpRules.items && BattleState.ITEMS[raw.itemId])
          ? { kind: "item", itemId: raw.itemId, target: raw.target }
          : { kind: "move", moveIdx: raw.moveIdx || 0, mega: !!raw.mega };
      runTurnResolution(playerAction, foeAction);
    } catch (e) {
      console.warn("[PvP] turn error:", e);
      B.toast("Network error: " + (e && e.message ? e.message.slice(0, 60) : ""));
      S.acting = false;
      B.showMainMenu();
    }
  }

  function runTurnResolution(playerAction, foeAction) {
    /* PvP 補位回合（Rule 92）：回合開始時任何一邊 active 已經暈 → 呢回合只做換寵，
       唔出招、唔 Mega、唔計回合尾殘餘傷害。兩邊客戶端睇同一個 state，判斷一致（Rule 22 嘅 seed 同步唔受影響） */
    const replacement = S.mode === "pvp" && (B.myActive().hp <= 0 || B.foeActive().hp <= 0);
    if (replacement) {
      if (playerAction.kind !== "switch") playerAction = { kind: "pass" };
      if (foeAction.kind !== "switch") foeAction = { kind: "pass" };
    }
    const myMove = playerAction.kind === "move" ? moveInfo(B.myActive().moves[playerAction.moveIdx].slug) : null;
    const foeMove = foeAction.kind === "move" ? moveInfo(B.foeActive().moves[foeAction.moveIdx].slug) : null;
    /* Mega 進化（第 4c 段）：回合開始、出招之前；p1 先 p2 後，PvP 兩邊一致；之後速度用 Mega 數值 */
    const megaLog = S.state.log.length;
    const megaSides = [];
    ["p1", "p2"].forEach(s => {
      const act = s === S.mySide ? playerAction : foeAction;
      if (act.kind === "move" && act.mega && BattleState.megaEvolve &&
          BattleState.megaEvolve(S.state, s, s === S.mySide ? "your" : `${B.foeTrainerName()}'s`)) megaSides.push(s);
    });
    const megaMsgs = S.state.log.slice(megaLog).map(l => l.msg);
    /* Custap（攜帶樹果）：揀咗出招 + HP ≤ 25% → 同優先度先出手；p1 先 p2 後判斷，PvP 兩邊一致 */
    const custLog = S.state.log.length;
    const custap = {};
    ["p1", "p2"].forEach(s => {
      const act = s === S.mySide ? playerAction : foeAction;
      if (act.kind === "move" && BattleState.custapCheck) custap[s] = BattleState.custapCheck(S.state, s);
    });
    const custMsgs = S.state.log.slice(custLog).map(l => l.msg);
    /* 速度用 Mega 之後嘅天氣（Mega Charizard Y 嘅 Drought 會即刻生效）；優先度計 Prankster */
    const wNow = S.state.weather && S.state.weather.name;
    const prio = (side, mv) => BattleState.priorityOf ? BattleState.priorityOf(S.state, side, mv) : mv.priority;
    const myAct = { kind: playerAction.kind, priority: myMove ? prio(S.mySide, myMove) + (custap[S.mySide] ? 0.5 : 0) : 6, speed: Battle.effectiveStat(B.myActive(), "spe", false, wNow), player: true, action: playerAction };
    const foeAct = { kind: foeAction.kind, priority: foeMove ? prio(S.foeSide, foeMove) + (custap[S.foeSide] ? 0.5 : 0) : 6, speed: Battle.effectiveStat(B.foeActive(), "spe", false, wNow), player: false, action: foeAction };
    /* PvP 同步關鍵：turnOrder 同速 tiebreak 食 RNG，
       兩邊客戶端必須用同一次序傳參（p1 行先），否則同一個 random 會出相反結果 */
    const firstAct = S.mySide === "p1" ? myAct : foeAct;
    const secondAct = S.mySide === "p1" ? foeAct : myAct;
    const order = Battle.turnOrder(firstAct, secondAct);

    B.narrate("");
    (async () => {
      /* Mega：第一句（石頭起反應）→ 閃光 + 換精靈圖 → 其餘句子 */
      if (megaMsgs.length) {
        await B.say(megaMsgs[0]);
        megaSides.forEach(s => {
          const el = document.getElementById(s === S.mySide ? "my-sprite" : "foe-sprite");
          if (el) { el.classList.remove("anim-mega"); void el.offsetWidth; el.classList.add("anim-mega"); setTimeout(() => el.classList.remove("anim-mega"), 900); }
        });
        await B.sleep(450);
        B.render();
        for (const m of megaMsgs.slice(1)) await B.say(m);
      }
      for (const m of custMsgs) await B.say(m);
      for (const act of order) {
        if (S.state.finished) break;
        const side = act.player ? S.mySide : S.foeSide;
        /* 已經倒下：冇得再出招（後攻者被先攻招打死就唔應該反擊）；
           但換寵例外 —— 暈咗之後嘅強制換寵一定要照做，唔係會卡死喺換寵頁 */
        if ((act.action.kind === "move" || act.action.kind === "item") && B.active(S.state, side).hp <= 0) continue;
        if (act.action.kind === "pass") continue;
        if (act.action.kind === "switch") {
          /* FRLG 原版：收回舊寵 → 拋新球召出（animatedSwitch 自己 narrate） */
          await B.animatedSwitch(side, act.action.idx);
        } else if (act.action.kind === "item") {
          const logStart = S.state.log.length;
          const who = side === S.mySide ? "You" : (S.aiTrainer ? S.aiTrainer.name : (S.pvpFoeName || "The foe"));
          BattleState.useItem(S.state, side, act.action.itemId, who, act.action.target);
          B.render();
          for (const l of S.state.log.slice(logStart)) await B.say(l.msg);
          await B.sleep(320);
        } else {
          const moveObj = B.active(S.state, side).moves[act.action.moveIdx];
          /* 全招冇 PP → 引擎會出 Struggle，動畫都用 Struggle 嘅無屬性特效 */
          const struggling = B.active(S.state, side).moves.every(m => m.pp <= 0);
          const info = struggling ? { type: "???", power: 50 } : (moveObj ? moveInfo(moveObj.slug) : null);
          const animSlug = struggling ? "struggle" : (moveObj ? moveObj.slug : "");
          const damaging = !!(info && (info.power || 0) > 0);
          const logStart = S.state.log.length;
          BattleState.executeMove(S.state, side, act.action.moveIdx);
          const newLogs = S.state.log.slice(logStart);
          /* 第一句（used X! / is fast asleep. 等）同動畫一齊出，之後等玩家 click */
          const tapFirst = B.waitTap();
          B.narrate(newLogs[0]?.msg || "");
          const didAttack = newLogs.some(l => l.msg.includes("used "));
          const missed = newLogs.some(l => l.msg.includes("missed"));
          const critHit = newLogs.some(l => l.msg === "A critical hit!");
          const eff = newLogs.some(l => l.msg.includes("super effective")) ? 1.5
            : newLogs.some(l => l.msg.includes("not very effective")) ? 0.5 : 1;
          if (didAttack) await B.moveAnim(act.player, damaging && !missed, info ? info.type : "normal", animSlug, eff);
          else await B.sleep(450);
          B.render();   /* HP 條跟住跌（CSS transition） */
          /* 暴擊：成個舞台震一震，玩家一睇就知點解特別痛 */
          if (critHit) {
            const stage = document.querySelector(".battle-stage");
            stage.classList.remove("anim-crit"); void stage.offsetWidth;
            stage.classList.add("anim-crit");
            setTimeout(() => stage.classList.remove("anim-crit"), 420);
          }
          /* 倒下動畫 */
          for (const s of [S.mySide, S.foeSide]) {
            if (B.active(S.state, s).hp <= 0)
              document.getElementById(s === S.mySide ? "my-sprite" : "foe-sprite").classList.add("anim-faint");
          }
          await tapFirst;
          for (let i = 1; i < newLogs.length; i++) {
            await B.say(newLogs[i].msg);
          }
        }
        if (BattleState.checkFinished(S.state)) break;
      }
      if (!S.state.finished && !replacement) {
        const resStart = S.state.log.length;
        BattleState.endTurnResidual(S.state, S.mySide);
        BattleState.endTurnResidual(S.state, S.foeSide);
        BattleState.endTurnField(S.state);
        B.render();
        /* residual（燒傷/毒）打死都要播倒下 */
        let residualFaint = false;
        for (const s of [S.mySide, S.foeSide]) {
          if (B.active(S.state, s).hp <= 0) {
            document.getElementById(s === S.mySide ? "my-sprite" : "foe-sprite").classList.add("anim-faint");
            residualFaint = true;
          }
        }
        if (residualFaint) await B.sleep(600);
        /* 殘餘傷害訊息都要玩家 click 先跳 */
        for (const l of S.state.log.slice(resStart)) await B.say(l.msg);
      }
      if (S.state.finished) { B.finishBattle(); return; }
      /* 我方暈咗要強制換 */
      if (B.myActive().hp <= 0 && BattleState.hasUsable(B.me().team)) {
        await B.say(`${B.myActive().name} fainted! Choose your next Pokémon.`);
        B.openBattleBag("switch", true);
        S.acting = false;
        return;
      }
      /* 對手暈咗：AI 自動換（收回 → 拋球召出）；
         PvP 唔可以代揀 —— 對手客戶端會自己彈強制換寵，
         佢嘅 switch 會做下一個 turn 嘅 action 傳返嚟 */
      if (S.mode !== "pvp" && B.foeActive().hp <= 0 && BattleState.hasUsable(B.foe().team)) {
        const nextIdx = B.foe().team.findIndex(p => p.hp > 0);
        /* 第 16 項：原作 Shift — 對手出下一隻之前問玩家要唔要換（AI 戰冇 seed 同步，換寵唔使回合） */
        if (B.myActive().hp > 0 && B.hasBench()) {
          const pick = await B.offerShift(B.foe().team[nextIdx].name.toUpperCase());
          if (pick != null && pick !== B.me().active) await B.animatedSwitch(S.mySide, pick);
        }
        await B.animatedSwitch(S.foeSide, nextIdx);
      }
      /* PvP 對手暈咗：下一回合係補位回合（Rule 92）——我唔使出招，自動交 pass；
         想 Shift 就揀換寵（同樣免費）。對手客戶端會交佢嘅強制換寵 */
      if (S.mode === "pvp" && B.foeActive().hp <= 0 && BattleState.hasUsable(B.foe().team) && B.myActive().hp > 0) {
        if (B.hasBench() && await B.askYesNo(`${B.foeTrainerName()} is sending in a new Pokémon. Switch Pokémon?`)) {
          S.acting = false;
          B.openBattleBag("switch", true);
          return;
        }
        resolveTurn({ kind: "pass" });
        return;
      }
      B.showMainMenu();
      S.acting = false;
    })();
  }

  function pickAIAction() {
    /* AI：相剋／STAB／高威力優先；冇血會治療；唔會對已中狀態嘅對手再放狀態招
       IQ 分級：T0 亂打、T1 有少少隨機、T2 最佳解、T3 85% 最佳解 + 15% 亂打 */
    const foe = B.foeActive();
    const target = B.myActive();
    const usable = foe.moves.filter(m => m.pp > 0);
    if (!usable.length) return { kind: "move", moveIdx: 0 };   /* 引擎會自動變 Struggle */
    const iq = (B.DIFFICULTY_PRESETS[S.aiTier] || B.DIFFICULTY_PRESETS.normal).iq;
    const randomMove = () => usable[Math.floor(Math.random() * usable.length)];
    /* Inferno 專屬：血量低就用唯一一支 Potion（AI 一回合只能揀一件事） */
    if (S.aiPotions > 0 && foe.hp <= foe.maxHp * 0.4) {
      S.aiPotions -= 1;
      return { kind: "item", itemId: "potion" };
    }
    if (iq <= 0) return { kind: "move", moveIdx: foe.moves.indexOf(randomMove()) };
    if (iq >= 3 && Math.random() < 0.15) return { kind: "move", moveIdx: foe.moves.indexOf(randomMove()) };

    let best = usable[0], bestScore = -Infinity;
    for (const m of usable) {
      const info = moveInfo(m.slug) || {};
      let score;
      if (info.damage_class === "status") {
        if (info.meta && info.meta.healing) score = foe.hp < foe.maxHp * 0.5 ? 260 : 20;
        else if (info.meta && info.meta.ailment && info.meta.ailment !== "none" && target.status) score = 20;
        else score = 45;
      } else {
        score = (info.power || 0);
        score *= (typeof typeMultiplier === "function") ? typeMultiplier(info.type, target.types) : 1;
        if (foe.types.includes(info.type)) score *= 1.5; /* STAB */
      }
      if (iq <= 1) score *= 0.85 + Math.random() * 0.3;   /* 少少隨機，唔會每次都同一招 */
      if (score > bestScore) { bestScore = score; best = m; }
    }
    return { kind: "move", moveIdx: foe.moves.indexOf(best) };
  }

  Object.assign(B, {
    resolveTurn, resolvePvpTurn, runTurnResolution, pickAIAction
  });
})();
