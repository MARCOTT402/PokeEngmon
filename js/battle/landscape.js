/* ============================================================
   BattleLand — 戰鬥畫面轉橫（背包第 4a 段）
   ------------------------------------------------------------
   - 開戰時將 #view-battle 搬入一個全畫面橫向紅框（同背包同款：裝飾列 → 左、
     數據列 → 左側直排（鎖定）、Home → 右），離開戰鬥就搬返原位
   - 打直開戰 → 轉手機提示（BagUI.showRotate）；「Play like this anyway」→ 成個畫面轉 90°
   - 舞台闊度由屏幕高度反推（舞台 240:112 + 底部文字／選單），寫入 --bl-w
   - body 級 overlay：z 2400（低過背包 2500，戰鬥中開背包會蓋喺上面；Rule 46）
   ============================================================ */
const BattleLand = (() => {
  let root = null, screen = null, frame = null, holder = null, patched = false, active = false;

  function build() {
    root = document.createElement("div");
    root.className = "battle-land";
    root.innerHTML = `
      <div class="bl-frame bag-frame">
        <div class="bag-deco" aria-hidden="true">
          <svg class="bag-deco-seam" viewBox="0 0 44 100" preserveAspectRatio="none"><path d="M24 100 V89 L34 85 V0" fill="none" stroke="#8a1712" stroke-width="2.5" vector-effect="non-scaling-stroke" stroke-linejoin="round"/></svg>
          <span class="bag-ball bag-deco-ball"></span>
          <span class="bag-deco-brand">POKÉDEX OF ANOMALIES</span>
          <span class="bag-deco-lens"></span>
        </div>
        <div class="bag-bezel" title="Locked during battle">
          <div class="bag-bezel-group">
            <div class="bag-stat"><svg viewBox="0 0 24 24"><rect x="2" y="7" width="18" height="10" rx="2" fill="#fff" stroke="#1a1a1a" stroke-width="1.6"/><rect x="20.5" y="9.5" width="2" height="5" rx="1" fill="#1a1a1a"/><rect x="3.5" y="8.5" width="12" height="7" rx="1" fill="#ffe259"/></svg></div>
            <div class="bag-stat"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10.5" fill="#7a1eaa" stroke="#1a1a1a" stroke-width="1.6"/><rect x="1.5" y="11.3" width="21" height="1.4" fill="#1a1a1a"/><path d="M1.6 12.7h20.8A10.5 10.5 0 0 1 1.6 12.7Z" fill="#d8d8d8"/><circle cx="12" cy="12" r="2.4" fill="#fff" stroke="#1a1a1a" stroke-width="1.2"/></svg></div>
          </div>
          <div class="bag-bezel-group">
            <div class="bag-stat"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#1e7fbf" stroke="#062036" stroke-width="1.6"/><ellipse cx="8" cy="7.5" rx="4" ry="2.5" fill="#fff" opacity=".55"/></svg></div>
            <div class="bag-stat"><svg viewBox="0 0 24 24"><path d="M13 2 L7.5 11.5 L11 12 L8 22 L16.5 10.5 L12 10.8 L14.5 2 Z" fill="#ffd54f" stroke="#3d1f00" stroke-width="1.4" stroke-linejoin="round"/></svg></div>
          </div>
        </div>
        <div class="bl-screen" id="bl-screen"></div>
        <div class="bag-chin"><span class="bag-ball bag-home bl-home" aria-hidden="true"></span><span class="bag-home-lbl">BATTLE</span></div>
      </div>`;
    document.body.appendChild(root);
    /* Rule 60：截停冒泡，免得 sheet 外部點擊 handler 誤關 */
    ["pointerdown", "pointerup", "click", "touchstart"].forEach(t => root.addEventListener(t, e => e.stopPropagation()));
    screen = root.querySelector("#bl-screen");
    frame = root.querySelector(".bl-frame");
    window.addEventListener("resize", fit);
  }

  /* 橫向：紅框 = 視窗大小；直向（Play anyway）：紅框轉 90° 填滿 */
  function fit() {
    if (!active) return;
    const W = window.innerWidth, H = window.innerHeight;
    /* 只有手機直向先轉 90°；iPad 直向（tablet）唔轉，紅框用全闊、高度 ≈ 闊 × 0.62 置中（Responsive P1 Task 9） */
    const phone = !(window.App && App.layout) || App.layout() === "phone";
    const portrait = H > W && phone;
    const tallTablet = H > W && !phone;
    frame.style.width = (portrait ? H : W) + "px";
    frame.style.height = (portrait ? W : (tallTablet ? Math.min(H, Math.round(W * 0.62)) : H)) + "px";
    frame.style.transform = portrait ? "rotate(90deg)" : "none";
    requestAnimationFrame(() => {
      const sw = screen.clientWidth, sh = screen.clientHeight;
      /* 舞台 240:112 + 底部選單（FIGHT 打開時最高約 106px）要一齊塞得落 */
      const w = Math.max(240, Math.min(sw - 8, (sh - 112) * 240 / 112));
      screen.style.setProperty("--bl-w", Math.floor(w) + "px");
    });
  }

  function enter() {
    if (!root) build();
    patchShowView();
    const v = document.getElementById("view-battle");
    if (!v) return;
    if (v.parentElement !== screen) {
      holder = document.createComment("view-battle-home");
      v.before(holder);
      screen.appendChild(v);
    }
    active = true;
    root.classList.add("show");
    document.body.classList.add("battle-landscape");
    fit();
    const phone = !(window.App && App.layout) || App.layout() === "phone";
    if (phone && window.innerHeight > window.innerWidth && typeof BagUI !== "undefined" && BagUI.showRotate) BagUI.showRotate("landscape");
    if (window.App && App._syncRotateHint) App._syncRotateHint(); /* 戰鬥豁免「請轉返直向」 */
  }

  function exit() {
    if (!active) return;
    active = false;
    const v = document.getElementById("view-battle");
    if (v && holder && holder.parentNode) { holder.replaceWith(v); holder = null; }
    root.classList.remove("show");
    document.body.classList.remove("battle-landscape");
    /* 返直向頁面：手機仲係打橫 → 全域「請轉返直向」（條件 = phone-land；舊做法 innerWidth <= 1000 會誤中桌面窄窗） */
    if (window.App && App._syncRotateHint) App._syncRotateHint();
  }

  /* 任何切去戰鬥以外嘅 view → 搬返原位（戰鬥完 → Battle Menu／訓練家列表／主頁） */
  function patchShowView() {
    if (patched || typeof App === "undefined" || !App.showView) return;
    patched = true;
    const orig = App.showView.bind(App);
    App.showView = (id, ...rest) => {
      if (id !== "view-battle") exit();
      return orig(id, ...rest);
    };
  }

  return { enter, exit, isActive: () => active };
})();

window.BattleLand = BattleLand;
