/* ============================================================
   AnimSpeed — 捕捉／扭蛋／進化動畫倍速（Settings → Animation speed）
   - 只存本機 localStorage（pe_anim_speed），唔上雲；只接受 1／2／3。
   - 場景開始等待動畫時 begin(tag)：GSAP globalTimeline.timeScale + <html> --anim-spd；
     完結／中斷一定要 end(tag) 還原，否則全 app GSAP／CSS 動畫都會快咗。
   - ms(ms)：場景內 setTimeout 用（begin 之後用嗰次 begin 嘅倍速，中途改設定唔影響）。
   ============================================================ */
(function () {
  const KEY = "pe_anim_speed";
  const ALLOWED = [1, 2, 3];
  const active = new Map();   /* tag → spd */

  function get() {
    try {
      const v = Number(localStorage.getItem(KEY));
      return ALLOWED.includes(v) ? v : 1;
    } catch (e) {
      return 1;
    }
  }

  function set(v) {
    const n = ALLOWED.includes(Number(v)) ? Number(v) : 1;
    try { localStorage.setItem(KEY, String(n)); } catch (e) { /* private mode */ }
    return n;
  }

  /* 目前生效嘅倍速：有場景 begin 緊就用最後一個，否則 1 */
  function current() {
    let s = 1;
    active.forEach(v => { s = v; });
    return s;
  }

  function _apply() {
    const s = current();
    const g = window.gsap;
    try { if (g && g.globalTimeline) g.globalTimeline.timeScale(s); } catch (e) { /* ignore */ }
    try { document.documentElement.style.setProperty("--anim-spd", String(s)); } catch (e) { /* ignore */ }
  }

  function begin(tag) {
    const s = get();
    active.set(String(tag || "anon"), s);
    _apply();
    return s;
  }

  function end(tag) {
    active.delete(String(tag || "anon"));
    _apply();
  }

  /* 場景內計時：ms / 當前倍速 */
  function ms(v) {
    return Math.max(0, Number(v) || 0) / current();
  }

  /* 場景右上角「2×」細字：spd ≠ 1 先出；host 要係 positioned 元素 */
  function badge(host, spd) {
    if (!host) return;
    const s = spd == null ? current() : spd;
    let b = host.querySelector(":scope > .anim-spd-badge");
    if (s === 1) { if (b) b.remove(); return; }
    if (!b) {
      b = document.createElement("div");
      b.className = "anim-spd-badge";
      b.setAttribute("aria-hidden", "true");
      host.appendChild(b);
    }
    b.textContent = s + "×";
  }

  function endAll() {
    active.clear();
    _apply();
  }

  /* 場景中途出錯 → Guard 恢復卡「Back to Home」唔會行場景嘅 end()，喺度兜底還原 */
  document.addEventListener("click", (e) => {
    const t = e.target;
    if (active.size && t && t.closest && t.closest("#guard-recover-home")) endAll();
  }, true);

  window.AnimSpeed = { KEY, ALLOWED, get, set, begin, end, endAll, ms, current, badge };
})();
