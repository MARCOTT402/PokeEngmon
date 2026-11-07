/* ============================================================
   PokeEngmon - Quiz：答題狀態列（進度段、連擊、動作掣、確認掣狀態）
   由 js/quiz.js 拆出（總計劃 P2.5；Rule 116）。同 js/quiz.js 共用同一個 Quiz 物件：
   Object.assign 只係將方法掛返上去，this／Quiz.xxx 用法完全唔變。
   載入次序：js/quiz.js 之後（index.html）。
   ============================================================ */

Object.assign(Quiz, {
  /* ---------- 進度 ---------- */
  _updateProgress() {
    const shown = this.seenQids.size;
    document.getElementById("quiz-progress").textContent = `${shown} / ${this.total}`;
    this._renderSegs();
  },

  /* ---------- 分段進度條：每題一格；用咗提示嘅題重排 → 尾加一格虛線 ---------- */
  _renderSegs() {
    const host = document.getElementById("quiz-segs");
    if (!host) return;
    const runner = document.getElementById("quiz-bar-runner");
    const segs = this.segs || [];
    let els = host.querySelectorAll(".qs-seg");
    /* 格數唔同（新一組）→ 重建；只係多咗重排格 → 追加並播入場動畫 */
    if (els.length > segs.length) { els.forEach(e => e.remove()); els = []; }
    for (let i = els.length; i < segs.length; i++) {
      const el = document.createElement("span");
      el.className = "qs-seg" + (els.length && segs[i].re ? " new" : "");
      host.insertBefore(el, runner || null);
    }
    els = host.querySelectorAll(".qs-seg");
    const curIdx = segs.findIndex(s => !s.state);
    segs.forEach((s, i) => {
      const el = els[i];
      el.classList.toggle("re", !!s.re);
      el.classList.toggle("done", !!s.state);
      el.classList.toggle("hinted", s.state === "hint");
      el.classList.toggle("cur", i === curIdx && !this.answered);
    });
    const done = segs.filter(s => s.state).length;
    host.setAttribute("aria-valuemax", String(segs.length));
    host.setAttribute("aria-valuenow", String(done));
    if (runner) {
      const pct = segs.length ? (done / segs.length) * 100 : 0;
      runner.style.left = `${pct}%`;
    }
  },

  _popSeg(idx) {
    const els = document.querySelectorAll("#quiz-segs .qs-seg");
    const el = els[idx];
    if (!el) return;
    el.classList.remove("pop");
    void el.offsetWidth;
    el.classList.add("pop");
  },

  /* ---------- Combo（純視覺，唔影響獎勵）：連續無提示、無答錯答啱 ≥2 先顯示 ---------- */
  _setCombo(n, bump) {
    this.combo = n;
    if (n > (this.bestCombo || 0)) this.bestCombo = n;
    const el = document.getElementById("quiz-combo");
    if (!el) return;
    document.getElementById("quiz-combo-n").textContent = String(n);
    el.classList.toggle("on", n >= 2);
    if (bump && n >= 2) { el.classList.remove("bump"); void el.offsetWidth; el.classList.add("bump"); }
  },

  /* ---------- 底部行動區狀態："" | ok | bad | hinted ---------- */
  _setAction(kind, icon, title, sub) {
    const a = document.getElementById("quiz-action");
    if (!a) return;
    a.classList.remove("ok", "bad", "hinted", "show-fb");
    if (kind) a.classList.add(kind, "show-fb");
    document.getElementById("quiz-fb-icon").textContent = icon || "";
    const fb = document.getElementById("quiz-feedback");
    fb.textContent = title || "";
    fb.className = "quiz-feedback" + (kind === "ok" || kind === "hinted" ? " good" : kind === "bad" ? " bad" : "");
    document.getElementById("quiz-fb-sub").textContent = sub || "";
  },

  /* Check 掣：未輸入就灰（空答案格除外，因為正確答案就係留空） */
  _syncCheckBtn() {
    const btn = document.getElementById("btn-quiz-check");
    if (!btn) return;
    const c = this.cells[this.currentCell];
    btn.disabled = !this.answered && !!c && !c.empty && !c.green && !(c.value || "").trim();
    /* App 鍵盤：右下 ✓ Submit（答完變 Next →）；左上提示鍵跟內容區提示掣狀態 */
    const go = document.getElementById("qk-go");
    if (go) {
      go.disabled = btn.disabled;
      go.classList.toggle("is-next", !!this.answered);
      go.querySelector(".qk-go-ic").textContent = this.answered ? "→" : "✓";
      go.querySelector(".qk-go-lb").textContent = this.answered ? "Next" : "Submit";
    }
    const hb = document.getElementById("btn-quiz-hint");
    const kh = document.getElementById("qk-hint");
    if (hb && kh) kh.disabled = hb.disabled || !!this.answered;
    const hc = document.getElementById("quiz-hint-count");
    const khc = document.getElementById("qk-hint-count");
    if (hc && khc) { khc.hidden = hc.hidden; khc.textContent = hc.textContent; }
  },

  _clearBadState() {
    const a = document.getElementById("quiz-action");
    if (a && a.classList.contains("bad")) this._setAction("");
    this.cells.forEach(c => { if (c.cellEl) c.cellEl.classList.remove("badc"); });
  }
});
