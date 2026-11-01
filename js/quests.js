/* ============================================================
   PokeEngmon - 每日任務板 Daily Quests（v1.25.0）
   - 每 10 題 = 完成 1 次任務，手動 CLAIM 1⚡
   - 每日最多 8 次；能量可累積、冇上限；未領取會跨日保留
   - 未登入：本機 ledger；登入：server 權威（battle_quest_status / claim_battle_quests）
   ============================================================ */

const Quests = (() => {
  const STEP = 10;
  const DAILY_MAX = 8;

  let bound = false;
  let timer = null;
  let claiming = false;

  function el(id) { return document.getElementById(id); }
  function toast(msg) { if (window.App && App.toast) App.toast(msg); }
  function loggedIn() {
    return !!(window.SupabaseAuth && SupabaseAuth.isEnabled && SupabaseAuth.isEnabled()
      && SupabaseAuth.isLoggedIn && SupabaseAuth.isLoggedIn());
  }
  function activeView() {
    const v = document.querySelector(".view.active");
    return v ? v.id : null;
  }
  function boardOpen() { return activeView() === "view-quests"; }
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
    if (msToReset() <= 0) render();   /* 啱啱跨日 */
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
      all.disabled = claiming;
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
    const claimable = g.claimable || 0;
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

  /* ---------- 載入 server 狀態 ---------- */
  async function syncFromServer() {
    if (!loggedIn()) return;
    const res = await call("battleQuestStatus", questions());
    if (!res) return;
    const st = loadState();
    const e = res.energy || res;
    if (e && typeof e.points === "number" && Energy.adopt) Energy.adopt(st, e);
    if (boardOpen()) render();
    refreshBadge();
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
        const btn = ev.target.closest(".quest-check");
        if (!btn || !btn.classList.contains("quest-ready")) return;
        claim(1);
      };
    }
    bound = true;
  }

  function open() {
    bind();
    render();
    if (window.App && App.showView) App.showView("view-quests");
    startTimer();
    syncFromServer();
  }

  return { open, refresh, refreshBadge, claim, claimAll, render, stopTimer };
})();
