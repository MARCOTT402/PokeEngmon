/* ============================================================
   PokeEngmon - App：響應式斷點同轉機提示（App.layout、pe:layout、phone-land 轉直提示）
   由 js/app.js 拆出（總計劃 P2.2；Rule 116）。同 app.js 共用同一個 App 物件：
   Object.assign 只係將方法掛返上去，this／App.xxx 用法完全唔變。
   載入次序：js/app.js 之後（index.html），App.init() 喺 DOMContentLoaded 先跑。
   ============================================================ */

Object.assign(App, {
  layout() {
    if (!this._layoutMQ) {
      const mq = (q) => window.matchMedia(q);
      this._layoutMQ = {
        phoneLand: mq("(orientation: landscape) and (max-height: 499px) and (pointer: coarse)"),
        wide: mq("(min-width: 900px) and (min-height: 560px)"),
        tablet: mq("(min-width: 700px)")
      };
    }
    const m = this._layoutMQ;
    if (m.phoneLand.matches) return "phone-land";
    if (m.wide.matches) return "wide";
    if (m.tablet.matches) return "tablet";
    return "phone";
  },
  /* 寫入 <html data-layout>；layout 改變時 dispatch document 事件 "pe:layout"（detail: {from, to}） */
  _initLayout() {
    if (this._layoutBound) return;
    this._layoutBound = true;
    const apply = () => {
      const to = this.layout();
      const root = document.documentElement;
      const from = root.dataset.layout || null;
      if (from === to) return;
      root.dataset.layout = to;
      if (from) document.dispatchEvent(new CustomEvent("pe:layout", { detail: { from, to } }));
    };
    apply();
    /* matchMedia change 只喺 render frame 先派發（背景分頁／部分模擬器唔會 fire），
       所以同時聽 resize／orientationchange；apply() 冇變就即刻 return，好平。 */
    Object.values(this._layoutMQ).forEach(q => {
      if (q.addEventListener) q.addEventListener("change", apply);
      else q.addListener(apply);
    });
    window.addEventListener("resize", apply, { passive: true });
    window.addEventListener("orientationchange", apply);
  },
  /* layout 改變：入 wide 補預設／full；離開 wide 收起預設 sheet */
  _onLayoutChange(from, to) {
    if (to === "wide") {
      const open = document.querySelector("#view-home .ph-sheet.ph-open");
      if (open) this._wideFull(open.id); else this._showWideDefault();
    } else if (from === "wide") {
      const def = document.querySelector("#view-home .ph-sheet[data-wide-default]");
      if (def) this._closeSheet(def.id);
    }
    this._syncRotateHint();
  },

  /* ---------- 手機橫向「請轉返直向」（Responsive P1 Task 9） ----------
   * layout = phone-land（手機打橫）時，除咗戰鬥／背包／捕捉，其他畫面蓋一層提示。
   * 唔中斷任何 state（答題中轉橫，轉返直就繼續）；「Continue anyway」可以收起，直到離開 phone-land。
   * 視覺沿用 .bag-rotate.back；z-index 2600 < toast 3000（Rule 46）；掛 body 要 stopPropagation（Rule 60）。 */
  _syncRotateHint() {
    const land = this.layout() === "phone-land";
    if (!land) this._rotateDismissed = false;
    const body = document.body;
    const exempt = body.classList.contains("bag-open") || body.classList.contains("battle-landscape") ||
      !!document.querySelector("#view-capture.active");
    const show = land && !exempt && !this._rotateDismissed;
    let el = document.getElementById("rotate-portrait");
    if (!el) {
      if (!show) return;
      el = document.createElement("div");
      el.id = "rotate-portrait";
      el.className = "bag-rotate back";
      el.setAttribute("role", "dialog");
      el.setAttribute("aria-modal", "true");
      el.setAttribute("aria-labelledby", "rotate-portrait-title");
      el.innerHTML = `
        <div class="bag-rot-art" aria-hidden="true">
          <svg class="bag-rot-arrow" viewBox="0 0 80 44"><path d="M8 38 C 14 10, 50 4, 66 22" fill="none" stroke="#111" stroke-width="10" stroke-linecap="round"/><path d="M8 38 C 14 10, 50 4, 66 22" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round"/><path d="M56 14 L72 28 L74 10 Z" fill="#fff" stroke="#111" stroke-width="3" stroke-linejoin="round"/></svg>
          <div class="bag-rot-phone"></div>
        </div>
        <h2 class="bag-rot-title" id="rotate-portrait-title">Turn your phone upright</h2>
        <p class="bag-rot-msg">PokeEngmon works best in portrait</p>
        <button type="button" class="bag-rot-btn">Continue anyway</button>`;
      ["pointerdown", "pointerup", "click", "touchstart"].forEach(t => el.addEventListener(t, e => e.stopPropagation()));
      el.querySelector(".bag-rot-btn").onclick = () => { this._rotateDismissed = true; this._syncRotateHint(); };
      document.body.appendChild(el);
    }
    el.classList.toggle("show", show);
  }
});
