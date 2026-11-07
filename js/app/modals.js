/* ============================================================
   PokeEngmon - App：彈窗同提示（showModal、closeModal、toast）
   由 js/app.js 拆出（總計劃 P2.2；Rule 116）。同 app.js 共用同一個 App 物件：
   Object.assign 只係將方法掛返上去，this／App.xxx 用法完全唔變。
   載入次序：js/app.js 之後（index.html），App.init() 喺 DOMContentLoaded 先跑。
   ============================================================ */

Object.assign(App, {
  /* ---------- Modal / Toast ---------- */
  showModal(html, noClose) {
    const root = document.getElementById("modal-root");
    root.innerHTML = `<div class="modal-backdrop"><div class="modal-card">${html}</div></div>`;
    if (!noClose) {
      root.querySelector(".modal-backdrop").onclick = (e) => {
        if (e.target === e.currentTarget) this.closeModal();
      };
    }
  },

  closeModal() {
    if (this._sfxPreviewTimer) { clearTimeout(this._sfxPreviewTimer); this._sfxPreviewTimer = null; }
    if (window.CaptureScene && CaptureScene.audio && CaptureScene.audio.stopPreviewSfx) {
      CaptureScene.audio.stopPreviewSfx();
    }
    document.getElementById("modal-root").innerHTML = "";
    if (typeof Pokedex !== "undefined" && Pokedex._setDexBackMode) Pokedex._setDexBackMode("grid");
  },

  toast(msg) {
    const t = document.getElementById("toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => t.classList.remove("show"), 2200);
  }
});
