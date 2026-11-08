// @ts-check
/* ============================================================
   PokeEngmon - 每日任務板 Daily Quests（v1.25.0）
   - 每 10 題 = 完成 1 次任務，手動 CLAIM 1⚡
   - 每日最多 8 次；能量可累積、冇上限；未領取會跨日保留
   - 未登入：本機 ledger；登入：server 權威（battle_quest_status / claim_battle_quests）
   ============================================================ */

const Quests = (() => {
  const STEP = 10;
  const DAILY_MAX = 8;

  const KIND_ORDER = ["daily", "weekly", "event", "achievement"];
  const KIND_LABELS = {
    daily: "Daily",
    weekly: "Weekly",
    event: "Event",
    achievement: "Achievements"
  };

  let bound = false;
  let timer = null;
  let claiming = false;
  let claimingDef = null;

  /* Phase 2：server 配置任務（每日／每週／活動／成就） */
  let defQuests = [];
  let defState = "idle";   /* idle | ok | offline | unsupported */

  function el(id) { return document.getElementById(id); }
  function toast(msg) { if (window.App && App.toast) App.toast(msg); }

  function esc(s) {
    return escapeHTML(s);
  }

  function defClaimable() {
    return defQuests.filter(q => q.claimable).length;
  }

  function rewardLabel(q) {
    return q.reward_type === "diamonds"
      ? `+${q.reward_amount}💎`
      : `+${q.reward_amount}⚡`;
  }

  /* 鑽石係 server 權威：直接覆寫本地再同步三個顯示位 */
  function adoptDiamonds(balance) {
    if (typeof balance !== "number") return;
    const st = loadState();
    st.diamonds = Math.max(0, balance);
    if (typeof saveState === "function") saveState();
    ["topbar-diamonds", "topbar-diamonds-bm"].forEach(id => {
      const node = el(id);
      if (node) node.textContent = String(st.diamonds);
    });
  }
  function loggedIn() {
    return !!(window.SupabaseAuth && SupabaseAuth.isEnabled && SupabaseAuth.isEnabled()
      && SupabaseAuth.isLoggedIn && SupabaseAuth.isLoggedIn());
  }
  function activeView() {
    const v = document.querySelector(".view.active");
    return v ? v.id : null;
  }
  /* 任務板「開住」= 獨立 view，或者已經搬入 home sheet（phone full 模式／wide 右欄預設）。
     之前只認 view-quests，sheet 入面嘅倒數第一下 tick 就停、領獎後唔 re-render。 */
  function boardOpen() {
    return activeView() === "view-quests" || !!document.querySelector("#sheet-quests.ph-open .sheet-view-host");
  }
  function questions() {
    try {
      if (typeof questionsToday === "function" && typeof dateKey === "function") {
        return questionsToday(loadState(), dateKey(Date.now()));
      }
    } catch (e) { /* ignore */ }
    return 0;
  }
  function status() { return Energy.status(loadState()); }

  async function call(name, ...args) {
    const fn = window.SupabaseAuth && SupabaseAuth[name];
    if (typeof fn !== "function") return null;
    try { return await fn.apply(SupabaseAuth, args); }
    catch (e) {
      console.warn("[Quests] " + name + " failed:", e && e.message);
      return null;
    }
  }

  /* ---------- 倒數（香港時間午夜） ---------- */
  function msToReset() {
    const OFFSET = 8 * 3600 * 1000;
    const now = Date.now();
    const local = new Date(now + OFFSET);
    const next = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + 1) - OFFSET;
    return Math.max(0, next - now);
  }

  function fmtReset(ms) {
    const total = Math.floor(ms / 1000);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }

  function tick() {
    if (!boardOpen()) { stopTimer(); return; }
    const chip = el("quests-reset");
    if (chip) chip.textContent = "resets " + fmtReset(msToReset());
    if (msToReset() <= 0) { render(); syncFromServer(); }   /* 啱啱跨日：每日任務／每週任務一齊刷新 */
  }

  function startTimer() {
    stopTimer();
    tick();
    timer = setInterval(tick, 1000);
  }

  function stopTimer() {
    if (timer) { clearInterval(timer); timer = null; }
  }

  /* ---------- Render ---------- */
  function render() {
    const g = status();
    const num = el("quests-energy");
    if (num) num.textContent = String(g.points);
    const sub = el("quests-sub");
    if (sub) {
      if (g.claimable > 0) {
        sub.textContent = `${g.claimable} reward${g.claimable === 1 ? "" : "s"} ready to claim`;
      } else if (g.done) {
        sub.textContent = "All 8 quests completed today — back tomorrow";
      } else if (g.quests > 0) {
        sub.textContent = `Today ${g.quests}/${DAILY_MAX} · ${g.needQuestions} more question${g.needQuestions === 1 ? "" : "s"} for the next`;
      } else {
        sub.textContent = `Answer ${g.needQuestions || STEP} questions to complete your first quest`;
      }
    }
    const done = el("quests-done-count");
    if (done) done.textContent = `${g.claimed} / ${DAILY_MAX}`;

    const track = el("quests-track");
    if (track) {
      let html = "";
      for (let i = 0; i < DAILY_MAX; i++) {
        const target = (i + 1) * STEP;
        let cls = "quest-todo";
        let tag = "";
        let label = `Quest ${i + 1}: ${target} questions, not completed`;
        if (i < g.claimed) {
          cls = "quest-done"; tag = "✓";
          label = `Quest ${i + 1}: ${target} questions, claimed`;
        } else if (i < g.quests) {
          cls = "quest-ready"; tag = "CLAIM";
          label = `Quest ${i + 1}: ${target} questions, claim 1 Energy`;
        } else if (i === g.quests) {
          cls = "quest-next";
          label = `Quest ${i + 1}: ${target} questions, in progress`;
        }
        html += `<button type="button" class="quest-check ${cls}" role="listitem"`
          + ` data-idx="${i}" aria-label="${label}">`
          + `<span class="quest-check-num">${target}</span>`
          + `<span class="quest-check-tag">${tag}</span>`
          + `<span class="quest-check-reward">+1⚡</span>`
          + "</button>";
      }
      track.innerHTML = html;
    }

    const all = el("quests-claim-all");
    if (all) {
      all.hidden = g.claimable <= 0;
      all.textContent = g.claimable > 1 ? `CLAIM ALL (${g.claimable})` : "CLAIM 1⚡";
      /** @type {HTMLButtonElement} */ (all).disabled = claiming;
    }
    refreshBadge();
  }

  function refresh() {
    if (boardOpen()) render();
    refreshBadge();
  }

  function refreshBadge() {
    let g;
    try { g = status(); } catch (e) { return; }
    const claimable = (g.claimable || 0) + defClaimable();
    const top = el("top-quests-badge");
    if (top) {
      top.textContent = String(claimable);
      top.hidden = claimable <= 0;
    }
    const home = el("home-quests-badge");
    if (home) {
      home.textContent = claimable > 0 ? String(claimable) : `${g.quests}/${DAILY_MAX}`;
      home.hidden = claimable <= 0 && g.quests <= 0;
      home.classList.toggle("is-claimable", claimable > 0);
    }
  }

  /* ---------- 載入 server 狀態（Phase 2：quest_board 一次過） ---------- */
  async function syncFromServer() {
    if (!loggedIn()) {
      defState = "offline";
      defQuests = [];
      renderDefs();
      refreshBadge();
      return;
    }
    const res = await call("questBoard", questions());
    if (res && res.energy && typeof res.energy.points === "number") {
      const st = loadState();
      Energy.adopt(st, res.energy);
      adoptDiamonds(res.diamonds);
      defQuests = Array.isArray(res.quests) ? res.quests : [];
      defState = "ok";
      renderDefs();
      if (boardOpen()) render();
      refreshBadge();
      return;
    }
    /* migration 20261102c 未跑／暫時失敗：退回舊 RPC，config 任務區顯示提示 */
    defState = "unsupported";
    defQuests = [];
    renderDefs();
    const legacy = await call("battleQuestStatus", questions());
    if (!legacy) { refreshBadge(); return; }
    const st = loadState();
    const e = legacy.energy || legacy;
    if (e && typeof e.points === "number" && Energy.adopt) Energy.adopt(st, e);
    if (boardOpen()) render();
    refreshBadge();
  }

  /* ---------- Phase 2：配置任務列表 ---------- */
  function renderDefs() {
    const box = el("quests-defs");
    const countEl = el("quests-defs-count");
    if (!box) return;

    if (countEl) {
      const n = defClaimable();
      countEl.textContent = String(n);
      countEl.hidden = n <= 0;
    }

    if (!loggedIn()) {
      box.innerHTML = '<div class="quests-defs-empty">Log in to unlock weekly, event and achievement quests.</div>';
      return;
    }
    if (defState === "idle") {
      box.innerHTML = '<div class="quests-defs-empty">Loading quests…</div>';
      return;
    }
    if (defState === "unsupported") {
      box.innerHTML = '<div class="quests-defs-empty">Quest board is unavailable right now — try again later.</div>';
      return;
    }
    if (!defQuests.length) {
      box.innerHTML = '<div class="quests-defs-empty">No quests available — check back soon.</div>';
      return;
    }

    let html = "";
    KIND_ORDER.forEach(kind => {
      const rows = defQuests.filter(q => q.kind === kind);
      if (!rows.length) return;
      html += '<div class="qd-group"><div class="qd-group-head">' + KIND_LABELS[kind] + "</div>"
        + rows.map(questDefRow).join("")
        + "</div>";
    });
    box.innerHTML = html;
  }

  function questDefRow(q) {
    const target = Math.max(1, Number(q.target) || 1);
    const progress = Math.min(target, Math.max(0, Number(q.progress) || 0));
    const pct = Math.round((progress / target) * 100);
    const done = !!q.claimed;
    const ready = !done && !!q.claimable;
    let btn;
    if (done) {
      btn = '<button class="qd-claim qd-claim-done" type="button" disabled>✓</button>';
    } else if (ready) {
      btn = '<button class="qd-claim qd-claim-ready" type="button" data-quest="'
        + esc(q.id) + '">CLAIM</button>';
    } else {
      btn = '<button class="qd-claim" type="button" disabled>' + progress + "/" + target + "</button>";
    }
    const cls = "quest-def" + (done ? " qd-done" : ready ? " qd-ready" : "");
    return '<div class="' + cls + '">'
      + '<div class="qd-main">'
      + '<div class="qd-title">' + esc(q.title) + "</div>"
      + (q.subtitle ? '<div class="qd-sub">' + esc(q.subtitle) + "</div>" : "")
      + '<div class="qd-bar"><span style="width:' + pct + '%"></span></div>'
      + "</div>"
      + '<div class="qd-side">'
      + '<div class="qd-reward">' + rewardLabel(q) + "</div>"
      + btn
      + "</div></div>";
  }

  async function claimDef(id, anchor) {
    if (claimingDef) return;
    const q = defQuests.find(x => x.id === id);
    if (!q || !q.claimable) return;
    if (!loggedIn()) { toast("Log in to claim"); return; }

    claimingDef = id;
    renderDefs();
    const res = await call("questClaim", id);
    claimingDef = null;

    const status = res && res.status;
    if (status === "claimed") {
      if (res.energy && typeof res.energy.points === "number") Energy.adopt(loadState(), res.energy);
      adoptDiamonds(res.diamonds);
      const gain = res.reward_type === "diamonds"
        ? `💎 +${res.reward_amount}`
        : `⚡ +${res.reward_amount}`;
      flyReward(anchor, gain, res.reward_type === "diamonds");
      playClaimSfx();
      toast(`${gain} · ${q.title}`);
      await syncFromServer();
      return;
    }

    renderDefs();
    if (status === "already") toast("Already claimed");
    else if (status === "not_ready") toast("Not finished yet");
    else toast("Could not claim — try again");
  }

  /* 領取時由個掣位置飄出獎勵字 */
  function flyReward(anchor, text, diamond) {
    if (!anchor) return;
    try {
      const r = anchor.getBoundingClientRect();
      const node = document.createElement("span");
      node.className = "qd-fly" + (diamond ? " qd-fly-diamond" : "");
      node.textContent = text;
      node.style.left = (r.left + r.width / 2) + "px";
      node.style.top = (r.top + r.height / 2) + "px";
      document.body.appendChild(node);
      setTimeout(() => node.remove(), 1000);
    } catch (e) { /* 動畫失敗唔影響領取 */ }
  }

  /* 領獎 jingle 放喺 assets/bgm，所以行 bgmBus（跟 Music 音量） */
  let claimJingle = null;
  function playClaimSfx() {
    try {
      const audio = window.CaptureScene && CaptureScene.audio;
      if (audio && audio.playMusicOnce) {
        if (claimJingle && claimJingle.stop) claimJingle.stop();
        claimJingle = audio.playMusicOnce("assets/bgm/obtained-pokemon.mp3", 0.35);
      }
    } catch (e) { /* 冇音效都可以照領 */ }
  }

  /* ---------- CLAIM ---------- */
  async function claim(n) {
    if (claiming) return;
    const st = loadState();
    const g = status();
    if (g.claimable <= 0) { toast("Nothing to claim yet"); return; }

    claiming = true;
    if (boardOpen()) render();

    let got = 0;
    if (loggedIn()) {
      const res = await call("claimBattleQuests", n, questions());
      if (!res) {
        claiming = false;
        if (boardOpen()) render();
        toast("Could not claim — try again");
        return;
      }
      const e = res.energy || res;
      if (e && typeof e.points === "number") Energy.adopt(st, e);
      got = Number(res.claimed) || 0;
    } else {
      got = Energy.claim(st, n);
    }

    claiming = false;
    if (!got) {
      toast("Nothing to claim yet");
    } else {
      toast(`⚡ +${got} Energy · ${Energy.status(loadState()).points} total`);
    }
    render();
  }

  function claimAll() {
    const g = status();
    claim(g.claimable || 1);
  }

  /* ---------- Bind / open ---------- */
  function bind() {
    if (bound) return;
    const back = el("quests-back");
    if (back) back.onclick = () => App.showView("view-home");
    const backBottom = el("quests-back-bottom");
    if (backBottom) backBottom.onclick = () => App.showView("view-home");
    const all = el("quests-claim-all");
    if (all) all.onclick = claimAll;
    const track = el("quests-track");
    if (track) {
      track.onclick = (ev) => {
        const btn = /** @type {Element} */ (ev.target).closest(".quest-check");
        if (!btn || !btn.classList.contains("quest-ready")) return;
        claim(1);
      };
    }
    const defs = el("quests-defs");
    if (defs) {
      defs.onclick = (ev) => {
        const btn = /** @type {HTMLElement | null} */ (/** @type {Element} */ (ev.target).closest(".qd-claim[data-quest]"));
        if (!btn) return;
        claimDef(btn.dataset.quest, btn);
      };
    }
    bound = true;
  }

  function open() {
    bind();
    render();
    renderDefs();
    if (window.App && App.showView) App.showView("view-quests");
    startTimer();
    syncFromServer();
  }

  /* 由 home sheet 展開時用：唔跳 view，只 render 已經搬入 sheet 嘅 DOM */
  function mount() {
    bind();
    render();
    renderDefs();
    startTimer();
    syncFromServer();
  }

  /* wide 右欄：overlay 離開後恢復已 mount 嘅任務板（唔再 sync server，避免每次切頁都 call） */
  function resume() {
    render();
    renderDefs();
    startTimer();
  }

  return { open, mount, resume, refresh, refreshBadge, claim, claimAll, render, stopTimer };
})();

/* ES module 過渡期（總計劃 P2.3；Rule 119）：index.html 用 type="module" 載入，頂層名唔會自動變全域 → 明確掛上 globalThis，classic script 照用 */
Object.assign(globalThis, { Quests });
