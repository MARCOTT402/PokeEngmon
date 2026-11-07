/* ============================================================
   PokeEngmon Battle - PvP 配對、好友戰、戰前規則投票
   由 js/battle/battle.js 拆出（總計劃 P2.5；Rule 117）。
   - 共用狀態：S = BattleUI._.S（原本閉包嘅 let）
   - 其他檔嘅函數／數據：B.xxx（B = BattleUI._）；同一個檔入面照直接 call
   載入次序：js/battle/battle.js 之後（index.html）。
   ============================================================ */

(() => {
  const B = BattleUI._, S = B.S;

  /* ---------- 開始對戰 ---------- */
  function startAI(trainer, tier) {
    if (!trainer) return;
    if (B.blockedByQuota()) return;
    S.mode = "ai";
    S.aiTrainer = trainer;
    S.aiTier = B.TIERS.includes(tier) ? tier : "normal";
    if (!B.tierUnlocked(loadState(), trainer, S.aiTier)) {
      B.toast(`Clear ${S.aiTier === "inferno" ? "Hard" : "Normal"} first to unlock this tier.`);
      return;
    }
    S.levelSyncLevel = S.aiTier === "inferno" ? B.infernoSyncLevel(trainer) : null;
    S.aiPotions = 0;
    S.foeTeamEntries = B.buildFoeTeam(trainer, S.aiTier);
    /* Gen 2-5 訓練家：先確保對應世代圖鑑資料載入（failed 就照開，唔好卡死揀隊） */
    const gens = B.gensForTeam(S.foeTeamEntries);
    const ready = (typeof ensureGenDataLoaded === "function")
      ? Promise.all(gens.map(g => ensureGenDataLoaded(g)))
      : Promise.resolve();
    ready.catch(() => {}).then(() => B.openTeamSelect(() => B.launchBattle()));
  }

  /* ---------- PvP 流程：配對 → 抽場制 → confirm → 揀隊 → 開戰 ---------- */
  function startPvP() {
    if (B.blockedByQuota()) return;
    S.mode = "pvp";
    S.aiTrainer = null;
    S.aiTier = "normal";
    S.levelSyncLevel = null;
    showMatchPanel();
  }

  function showMatchPanel() {
    /* 未登入冇得玩 PvP（auth.uid() 係 RLS 必須） */
    if (!(window.SupabaseAuth && SupabaseAuth.isLoggedIn())) {
      B.toast("Log in first to battle other players!");
      return;
    }
    document.getElementById("pvp-match-panel").style.display = "flex";
    document.getElementById("pvp-matching").style.display = "flex";
    document.getElementById("pvp-matched").style.display = "none";
    /* 好友局會改過標題，隨機配對要還原 */
    const foundTitle = document.querySelector(".pvp-found-title");
    if (foundTitle) foundTitle.textContent = "Opponent found!";
    /* 場制改由配對後嘅戰前投票決定；配對池／battle row 先填 3 做 placeholder */
    S.pvpTeamSize = 3;
    S.pvpRules = null;
    S.pvpCancel = PvpNet.matchmake(3, {
      onMatched, onTimeout: onMatchTimeout, onError: onMatchError
    });
  }

  function cancelMatch() {
    if (S.pvpCancel) { S.pvpCancel(); S.pvpCancel = null; }
    document.getElementById("pvp-match-panel").style.display = "none";
  }

  function onMatchTimeout() {
    S.pvpCancel = null;
    document.getElementById("pvp-match-panel").style.display = "none";
    B.toast("No opponent found. Try again later!");
  }

  function onMatchError(e) {
    console.warn("[PvP] match error:", e);
    S.pvpCancel = null;
    document.getElementById("pvp-match-panel").style.display = "none";
    B.toast("Matchmaking failed: " + (e && e.message ? e.message.slice(0, 60) : "network error"));
  }

  function onMatched(battle, side, foeUid) {
    S.pvpCancel = null;
    S.pvpBattle = battle;
    S.pvpSide = side;
    S.pvpTeamSize = battle.team_size;
    /* 隨機 PvP：記低對手，完場可以加好友 */
    S.pvpFoeUid = foeUid || null;
    S.pvpFoeName = null;
    S.pvpIsFriend = !!battle.is_friend;
    document.getElementById("pvp-matching").style.display = "none";
    document.getElementById("pvp-matched").style.display = "flex";
    startPvpVote(3);
  }

  /* 好友局：server 已開好 row，唔使配對，亦唔檢查每日答題配額 */
  function openFriendMatch(battle, foeName) {
    if (!battle) return;
    S.mode = "pvp";
    S.aiTrainer = null;
    S.aiTier = "normal";
    S.levelSyncLevel = null;
    S.pvpCancel = null;
    const me = (window.SupabaseAuth && SupabaseAuth.currentUser) ? SupabaseAuth.currentUser() : null;
    const myId = me ? me.id : null;
    S.pvpBattle = battle;
    S.pvpSide = battle.p1_uid === myId ? "p1" : "p2";
    S.pvpTeamSize = battle.team_size;
    S.pvpIsFriend = true;
    S.pvpFoeName = foeName || null;
    S.pvpFoeUid = battle.p1_uid === myId ? battle.p2_uid : battle.p1_uid;
    /* 借用隨機配對面板顯示場制；之後等玩家撳 #pvp-format-confirm */
    const panel = document.getElementById("pvp-match-panel");
    if (panel) panel.style.display = "flex";
    const matching = document.getElementById("pvp-matching");
    if (matching) matching.style.display = "none";
    const matched = document.getElementById("pvp-matched");
    if (matched) matched.style.display = "flex";
    const title = document.querySelector(".pvp-found-title");
    if (title) title.textContent = "Friend challenge!";
    /* 邀請只係叫人入場；規則同隨機 PvP 一樣由雙方投票 */
    startPvpVote(3);
  }

  /* ---------- PvP 戰前投票：出戰數量／准唔准用藥／准唔准自願換 ---------- */
  /* 可出戰數：狀態系統落地後要排除 Faint */
  function pvpUsableCount() {
    const st = loadState();
    return st.entries.filter(e => Array.isArray(e.ownedSpecies) && e.ownedSpecies.length && !(window.Pet && Pet.isFaint(e))).length;
  }

  /* 人數 1–6，唔超過自己可出戰數 */
  function pvpFitSize(size, cap) {
    return Math.max(1, Math.min(size, cap));
  }

  function stopPvpVote() {
    if (S.pvpVoteTimer) { clearInterval(S.pvpVoteTimer); S.pvpVoteTimer = null; }
    if (S.pvpVoteWait && S.pvpVoteWait.cancel) S.pvpVoteWait.cancel();
    S.pvpVoteWait = null;
  }

  function startPvpVote(defaultSize) {
    stopPvpVote();
    S.pvpRules = null;
    const cap = Math.max(1, Math.min(6, pvpUsableCount()));
    const n = Math.round(Number(defaultSize));
    const base = (n >= 1 && n <= 6) ? n : 3;
    const vote = { size: pvpFitSize(base, cap), cap, items: true, switch: true };

    const voteBox = document.getElementById("pvp-vote");
    voteBox.style.display = "flex";
    document.getElementById("pvp-vote-wait").style.display = "none";
    document.getElementById("pvp-vote-result").style.display = "none";

    const syncSeg = () => {
      voteBox.querySelectorAll(".pvp-seg").forEach(seg => {
        const key = seg.dataset.key;
        seg.querySelectorAll("button").forEach(btn => {
          const v = Number(btn.dataset.v);
          if (key === "size") {
            btn.disabled = v > cap;
            btn.classList.toggle("on", v === vote.size);
          } else {
            btn.disabled = false;
            btn.classList.toggle("on", (v === 1) === vote[key]);
          }
        });
      });
    };
    voteBox.querySelectorAll(".pvp-seg").forEach(seg => {
      seg.querySelectorAll("button").forEach(btn => {
        btn.onclick = (ev) => {
          ev.stopPropagation();
          if (btn.disabled) return;
          const v = Number(btn.dataset.v);
          if (seg.dataset.key === "size") vote.size = v; else vote[seg.dataset.key] = v === 1;
          B.sfx("select", .9);
          syncSeg();
        };
      });
    });
    syncSeg();

    let left = B.PVP_VOTE_SECONDS;
    const timerEl = document.getElementById("pvp-vote-timer");
    const paint = () => {
      timerEl.textContent = left + "s";
      timerEl.classList.toggle("urgent", left <= 5);
    };
    paint();
    let submitted = false;
    const submit = (auto) => {
      if (submitted) return;
      submitted = true;
      /* 夠鐘未投 → 預設：3 隻（唔夠就用最多可出戰數）、准用藥、准換 */
      const finalVote = auto
        ? { size: pvpFitSize(3, cap), cap, items: true, switch: true }
        : Object.assign({}, vote);
      submitPvpVote(finalVote);
    };
    S.pvpVoteTimer = setInterval(() => {
      left -= 1;
      paint();
      if (left <= 0) submit(true);
    }, 1000);
    document.getElementById("pvp-vote-submit").onclick = (ev) => { ev.stopPropagation(); submit(false); };
  }

  async function submitPvpVote(vote) {
    if (S.pvpVoteTimer) { clearInterval(S.pvpVoteTimer); S.pvpVoteTimer = null; }
    const battle = S.pvpBattle;
    if (!battle) return;
    document.getElementById("pvp-vote").style.display = "none";
    document.getElementById("pvp-vote-wait").style.display = "flex";
    try {
      await PvpNet.submitVote(battle.id, S.pvpSide, vote);
      S.pvpVoteWait = PvpNet.waitForVotes(battle.id);
      /* 對手自己有 30s 倒數會自動交票；再等多 45s 都冇就當走咗 */
      const b = await B.raceTimeout(S.pvpVoteWait, PvpNet.ACTION_TIMEOUT_MS + B.PVP_VOTE_SECONDS * 1000);
      if (S.pvpVoteWait && S.pvpVoteWait.cancel) S.pvpVoteWait.cancel();
      S.pvpVoteWait = null;
      if (S.pvpBattle !== battle) return;   /* 期間已經離開／換咗局 */
      if (!b || b.state === "finished" || !b.p1_vote || !b.p2_vote) {
        if (!b) await PvpNet.finishBattleRow(battle.id, S.pvpSide);
        abortPvpVote("Opponent left. Battle cancelled.");
        return;
      }
      const seed = (b.seed != null) ? b.seed : battle.seed;
      S.pvpRules = PvpNet.resolveRules(seed, b.p1_vote, b.p2_vote);
      S.pvpTeamSize = S.pvpRules.size;
      if (S.pvpSide === "p1") PvpNet.recordTeamSize(battle.id, S.pvpRules.size);
      showPvpVoteResult();
    } catch (e) {
      console.warn("[PvP] vote failed:", e);
      abortPvpVote("Network error: " + (e && e.message ? e.message.slice(0, 60) : ""));
    }
  }

  function abortPvpVote(msg) {
    stopPvpVote();
    S.pvpBattle = null;
    S.pvpRules = null;
    document.getElementById("pvp-match-panel").style.display = "none";
    B.toast(msg);
    B.openMenu();
  }

  function showPvpVoteResult() {
    const r = S.pvpRules;
    const mine = r.votes[S.pvpSide];
    const foe = r.votes[S.pvpSide === "p1" ? "p2" : "p1"];
    const yn = b => (b ? "Allowed" : "Off");
    const rows = [
      ["Team size", mine.size + "v" + mine.size, foe.size + "v" + foe.size, r.size + "v" + r.size, mine.size !== foe.size],
      ["Medicine", yn(mine.items), yn(foe.items), yn(r.items), mine.items !== foe.items],
      ["Switching", yn(mine.switch), yn(foe.switch), yn(r.switch), mine.switch !== foe.switch]
    ];
    document.getElementById("pvp-vote-table").innerHTML =
      "<tr><th></th><th>You</th><th>Foe</th><th>Rule</th></tr>" +
      rows.map(([k, a, b, f, rnd]) =>
        `<tr><td>${k}</td><td>${a}</td><td>${b}</td><td class="final">${rnd ? "🎲 " : ""}${f}</td></tr>`).join("");
    document.getElementById("pvp-format-value").textContent = r.size + "v" + r.size;
    document.getElementById("pvp-vote-wait").style.display = "none";
    document.getElementById("pvp-vote-result").style.display = "flex";
  }

  function confirmFormat() {
    if (!S.pvpRules) return;
    document.getElementById("pvp-match-panel").style.display = "none";
    B.openTeamSelect(() => B.launchBattle(), S.pvpTeamSize);
  }

  Object.assign(B, {
    startAI, startPvP, showMatchPanel, cancelMatch, onMatchTimeout, onMatchError, onMatched, openFriendMatch,
    pvpUsableCount, pvpFitSize, stopPvpVote, startPvpVote, submitPvpVote, abortPvpVote, showPvpVoteResult,
    confirmFormat
  });
})();
