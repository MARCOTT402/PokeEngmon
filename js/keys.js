/* ============================================================
   Keys — 全鍵盤操作基本層（plan .trae/documents/20261106-keyboard-and-capture-speed.md A 第一期）
   - ↑↓←→ 空間導航：喺「當前情境」入面揀嗰個方向最近嘅可撳元素
   - Enter／Space：撳焦點（原生 button 由瀏覽器處理；div／label 呢類由呢度 click()）
   - Esc：其他 handler 冇處理先至由呢度關 overlay／返回
   - 情境變咗（開 modal／sheet／換 view）而用戶用緊鍵盤 → 自動將焦點放喺主要掣
   - overlay 情境 Tab 困喺入面；? 開快捷鍵一覽
   - 監聽掛 window（bubble 最尾）：document 上舊有嘅 Enter／Esc／Ctrl+P／Ctrl+H 先行，
     佢哋 preventDefault 咗就唔再處理（Rule 97）
   ============================================================ */
(function () {
  "use strict";

  /* ---------- 可見度／可撳判斷 ---------- */
  const NATIVE = "button, a[href], input:not([type=hidden]), select, textarea, summary, [tabindex], [role=button], [role=radio], [role=tab], [role=link], [contenteditable=true]";
  const SKIP_TAGS = new Set(["svg", "path", "g", "circle", "rect", "line", "polyline", "polygon", "use", "defs", "img", "canvas", "video", "br", "b", "i", "small", "strong", "em"]);
  const OVERLAYS = [
    "#fatal-screen", "#guard-recover",
    "#modal-root .modal-backdrop",
    "#lb-login-modal", "#team-select-modal", "#tier-select-modal", "#pvp-match-panel",
    ".update-modal:not(.hidden)",
    "#gacha-multi", "#gacha-inspect", "#gacha-scene-b",
    ".bag-root",
    "[role=dialog][aria-modal=true]", "[role=alertdialog][aria-modal=true]"
  ];
  const CLOSE_SEL = "[data-kbd-close], [aria-label='Close'], [aria-label='Back'], [aria-label='Back home'], [data-act='close'], [data-act='cancel'], [id$='-cancel']";
  const CLOSE_TEXT = /^(✕|×|cancel|close|back|‹\s*back|◀\s*back|maybe later|not now|later)$/i;
  const PRIMARY_SEL = [
    "[data-kbd-primary]", "[autofocus]",
    "#guard-recover-continue", "#btn-settle-continue", ".capture-continue",
    ".ph-cta", ".btn-primary", ".btn-big"
  ];

  let kbdMode = false;      /* 最近一次操作係鍵盤 */
  let lastCtxKey = "";

  function isVisible(el) {
    if (!el || !el.isConnected) return false;
    if (el.closest("[hidden], [inert]")) return false;
    /* home sheet 開咗都仲係 aria-hidden="true"（app 冇切換；真正隱藏靠 hidden），所以 sheet 唔計 */
    const ah = el.closest("[aria-hidden='true']");
    if (ah && !ah.classList.contains("ph-sheet")) return false;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return false;
    const cs = getComputedStyle(el);
    if (cs.visibility === "hidden" || cs.display === "none" || cs.pointerEvents === "none") return false;
    /* 透明 radio 疊喺 label 上（倍速掣）：睇 label 嘅可見度 */
    const target = (el.matches("input") && el.closest("label")) || el;
    /* 祖先 opacity 0（例如背包入面收埋嘅排序／Oak 面板）都當睇唔到，否則 Esc 會撳中隱形嘅 Cancel */
    if (target.checkVisibility) {
      if (!target.checkVisibility({ checkOpacity: true, opacityProperty: true, checkVisibilityCSS: true, visibilityProperty: true })) return false;
    } else if (Number(getComputedStyle(target).opacity) === 0) {
      return false;
    }
    /* 收埋嘅摺疊區（max-height:0＋overflow:hidden，例如背包 banner）：掣自己有 rect 但被剪走 */
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const o = getComputedStyle(p);
      if (o.overflowX === "visible" && o.overflowY === "visible") continue;
      const pr = p.getBoundingClientRect();
      if (pr.width < 2 || pr.height < 2) return false;
    }
    return true;
  }

  function isDisabled(el) {
    return !!(el.disabled || el.getAttribute("aria-disabled") === "true");
  }

  /* 原生可聚焦（tabindex=-1 都算，因為可以 focus()） */
  function isNativeFocusable(el) {
    if (!el.matches(NATIVE)) return false;
    if (el.matches("input[type=radio], input[type=checkbox]") && getComputedStyle(el).display === "none") return false;
    /* 淨係靠 tabindex=-1 嘅容器（捲動區、modal 卡）唔係掣；我哋自己補嘅 data-kbd-auto 例外 */
    if (el.tabIndex < 0 && !el.hasAttribute("data-kbd-auto") &&
        !el.matches("button, a[href], input, select, textarea, summary, [role=button], [role=radio], [role=tab], [role=link]")) return false;
    return true;
  }

  /* 冇 tabindex 嘅 div／label 等，靠 cursor:pointer 認出係「掣」：
     只取 pointer 區域嘅最頂一層、唔喺原生掣入面、入面冇原生掣 */
  function isPointerLeaf(el) {
    if (SKIP_TAGS.has(el.tagName.toLowerCase())) return false;
    if (getComputedStyle(el).cursor !== "pointer") return false;
    const p = el.parentElement;
    if (p && getComputedStyle(p).cursor === "pointer") return false;
    if (el.closest(NATIVE.replace(", [tabindex]", ""))) return false;
    if (el.querySelector(NATIVE)) {
      /* label 包住 display:none 嘅 radio（遺忘曲線卡）：入面嘅 input 唔可聚焦，label 自己就係掣 */
      const inner = [...el.querySelectorAll(NATIVE)].filter(isNativeFocusable);
      if (inner.length) return false;
    }
    if (/backdrop/.test(el.className && el.className.baseVal == null ? el.className : "")) return false;
    return true;
  }

  /* 最近嘅捲動容器 */
  function scrollerOf(el) {
    let sc = el.parentElement;
    while (sc && sc !== document.body && sc !== document.documentElement) {
      const o = getComputedStyle(sc);
      if (/(auto|scroll)/.test(o.overflowY + o.overflowX) &&
          (sc.scrollHeight > sc.clientHeight + 1 || sc.scrollWidth > sc.clientWidth + 1)) return sc;
      sc = sc.parentElement;
    }
    return null;
  }

  /* 中心點喺捲動容器可見範圍外 → 回傳嗰個容器（「捲咗出去」），否則 null */
  function clippedBy(el, r) {
    const sc = scrollerOf(el);
    if (!sc) return null;
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const sr = sc.getBoundingClientRect();
    return (cx < sr.left || cx > sr.right || cy < sr.top || cy > sr.bottom) ? sc : null;
  }

  /* 被其他層蓋住？捲咗出去／出咗視窗嘅唔檢查（照計，等方向鍵可以捲落去） */
  function isOccluded(el, r, clip) {
    if (clip) return false;
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    if (cx < 0 || cy < 0 || cx > innerWidth || cy > innerHeight) return false;
    const hit = document.elementFromPoint(cx, cy);
    if (!hit) return false;
    if (el === hit || el.contains(hit)) return false;
    const lab = hit.closest("label");
    if (lab && lab.contains(el)) return false;
    return true;
  }

  /* ---------- 情境：overlay > phone/tablet sheet > view ---------- */
  function zOf(el) {
    let z = 0, n = el;
    while (n && n !== document.body) {
      const v = parseInt(getComputedStyle(n).zIndex, 10);
      if (!isNaN(v)) z = Math.max(z, v);
      n = n.parentElement;
    }
    return z;
  }

  function layout() {
    try { return (window.App && App.layout) ? App.layout() : "phone"; } catch (e) { return "phone"; }
  }

  /* 未列明嘅全屏層（例如 #entry-gate）：body／#app 嘅直屬子元素，fixed／absolute、
     蓋住大半個視窗、入面有掣。細嘅 banner／toast 唔算（唔係 modal） */
  function genericOverlays() {
    const app = document.getElementById("app");
    const kids = [...document.body.children, ...(app ? app.children : [])];
    const area = innerWidth * innerHeight;
    return kids.filter(el => {
      if (el.matches(".view, #modal-root, script, style, link, #toast")) return false;
      const pos = getComputedStyle(el).position;
      if (pos !== "fixed" && pos !== "absolute") return false;
      if (!isVisible(el)) return false;
      const r = el.getBoundingClientRect();
      if (r.width * r.height < area * 0.4) return false;
      return !!el.querySelector("button, [role=button], a[href]");
    });
  }

  function context() {
    /* 1) overlay：揀最高 z-index 嘅可見嗰個 */
    let best = null, bestZ = -Infinity;
    const consider = el => {
      if (!isVisible(el)) return;
      const z = zOf(el);
      if (z >= bestZ) { best = el; bestZ = z; }
    };
    for (const sel of OVERLAYS) document.querySelectorAll(sel).forEach(consider);
    genericOverlays().forEach(consider);
    if (best) return { kind: "overlay", roots: [best], key: "o:" + (best.id || best.className) };

    /* 2) phone／tablet：開住嘅 home sheet（wide 嘅右欄 sheet 係常駐面板，唔當 modal，Rule 84） */
    if (layout() !== "wide") {
      const sheet = [...document.querySelectorAll("#view-home .ph-sheet.ph-open")].find(s => !s.dataset.wideDefault && isVisible(s));
      if (sheet) return { kind: "sheet", roots: [sheet], key: "s:" + sheet.id };
    }

    /* 3) view：非 home 嘅 active view 優先（wide overlay 頁），連埋可見嘅 bezel／下巴 */
    const views = [...document.querySelectorAll(".view.active")];
    const top = views.find(v => v.id !== "view-home") || views[0];
    if (!top) return { kind: "none", roots: [document.body], key: "none" };
    const roots = [top];
    if (top.id !== "view-home") {
      document.querySelectorAll("#view-home .pd-bezel, #view-home .pd-chin").forEach(el => { if (isVisible(el)) roots.push(el); });
    }
    /* wide：右欄新開咗嘅 sheet（唔計預設 Daily Quests）→ 焦點應該跳入去 */
    let focusRoot = null;
    if (top.id === "view-home" && layout() === "wide") {
      focusRoot = [...document.querySelectorAll("#view-home .ph-sheet.ph-open")].find(s => !s.dataset.wideDefault && isVisible(s)) || null;
    }
    return { kind: "view", roots, focusRoot, key: "v:" + top.id + (focusRoot ? "|" + focusRoot.id : "") };
  }

  function candidates(ctx) {
    const out = [];
    const seen = new Set();
    for (const root of ctx.roots) {
      root.querySelectorAll("*").forEach(el => {
        if (seen.has(el)) return;
        const nat = isNativeFocusable(el);
        if (!nat && !isPointerLeaf(el)) return;
        if (isDisabled(el) || !isVisible(el)) return;
        const r = el.getBoundingClientRect();
        const clip = clippedBy(el, r);
        if (isOccluded(el, r, clip)) return;
        seen.add(el);
        out.push({ el, r, nat, clip });
      });
    }
    return out;
  }

  function inCtx(ctx, el) {
    return !!el && ctx.roots.some(r => r.contains(el));
  }

  function primary(ctx, list) {
    list = list.filter(c => !c.clip);
    for (const sel of PRIMARY_SEL) {
      const hit = list.find(c => c.el.matches(sel));
      if (hit) return hit.el;
    }
    /* 冇明確主要掣：揀最上、最左嗰個（✕／Back 留到最後先揀） */
    const isClose = el => el.matches(CLOSE_SEL) || CLOSE_TEXT.test((el.textContent || "").trim());
    const sorted = list.slice().sort((a, b) =>
      (isClose(a.el) - isClose(b.el)) || (a.r.top - b.r.top) || (a.r.left - b.r.left));
    return sorted[0] ? sorted[0].el : null;
  }

  function focusEl(el) {
    if (!el) return;
    if (!isNativeFocusable(el) && !el.hasAttribute("tabindex")) {
      el.setAttribute("tabindex", "-1");
      el.setAttribute("data-kbd-auto", "");
    }
    try { el.focus({ preventScroll: true }); } catch (e) { el.focus(); }
    try { el.scrollIntoView({ block: "nearest", inline: "nearest" }); } catch (e) { /* old engines */ }
  }

  /* ---------- 空間導航 ---------- */
  function move(dir) {
    const ctx = context();
    const list = candidates(ctx);
    if (!list.length) return false;
    const cur = document.activeElement;
    const curItem = list.find(c => c.el === cur || (cur && c.el.contains(cur)));
    if (!curItem) {
      focusEl(primary(ctx, list));
      return true;
    }
    const best = pick(list, curItem, dir);
    if (!best) return false;   /* 嗰個方向冇嘢：唔攔，俾原生捲動 */
    focusEl(best.el);
    return true;
  }

  /* 揀方向上最近嘅一個：
     - 中心點要真係喺嗰個方向（> 2px）
     - 60° 錐形：橫向偏移（邊對邊距離）唔可以大過主方向中心距離 ×2，避免跳去另一欄好遠嘅掣
     - 分數 = 主方向邊距 + 橫向邊距 ×2（重疊即 0）
     - 先喺「目前所在嘅捲動區」入面揀（例如 sheet 清單逐格捲落去），冇先至行出去 */
  function pick(list, curItem, dir) {
    const a = curItem.r;
    const acx = a.left + a.width / 2, acy = a.top + a.height / 2;
    const horiz = dir === "left" || dir === "right";
    const score = (c) => {
      const b = c.r;
      const bcx = b.left + b.width / 2, bcy = b.top + b.height / 2;
      let mainC, mainE, gap;
      if (horiz) {
        mainC = dir === "right" ? bcx - acx : acx - bcx;
        mainE = dir === "right" ? b.left - a.right : a.left - b.right;
        gap = Math.max(0, Math.max(a.top, b.top) - Math.min(a.bottom, b.bottom));
      } else {
        mainC = dir === "down" ? bcy - acy : acy - bcy;
        mainE = dir === "down" ? b.top - a.bottom : a.top - b.bottom;
        gap = Math.max(0, Math.max(a.left, b.left) - Math.min(a.right, b.right));
      }
      if (mainC <= 2) return Infinity;
      if (gap > mainC * 2) return Infinity;
      return Math.max(0, mainE) + gap * 2 + mainC * 0.01;
    };
    const best = (pool) => {
      let bst = null, bs = Infinity;
      for (const c of pool) {
        if (c === curItem) continue;
        /* 捲咗出去嘅項目：只可以由同一個捲動區入面行過去，唔好由外面飛入去 */
        if (c.clip && !c.clip.contains(curItem.el)) continue;
        const s = score(c);
        if (s < bs) { bs = s; bst = c; }
      }
      return bst;
    };
    const sc = scrollerOf(curItem.el);
    if (sc) {
      const inside = best(list.filter(c => sc.contains(c.el)));
      if (inside) return inside;
    }
    return best(list);
  }

  /* ---------- Esc：關 overlay／返回 ---------- */
  function findClose(root) {
    const btns = [...root.querySelectorAll("button, [role=button], " + CLOSE_SEL)];
    return btns.find(b => isVisible(b) && !isDisabled(b) &&
      (b.matches(CLOSE_SEL) || CLOSE_TEXT.test((b.textContent || "").trim())));
  }

  function escape() {
    const ctx = context();
    if (ctx.kind === "overlay") {
      const root = ctx.roots[0];
      const btn = findClose(root);
      if (btn) { btn.click(); return true; }
      /* 扭蛋單抽結果卡冇關閉掣：關成個扭蛋 sheet（行 Gacha.abort，BGM／進化揭示照補） */
      if (root.id === "gacha-inspect" && window.App && App.closeGachaSheet) { App.closeGachaSheet(); return true; }
      /* App.showModal 可關嘅 modal：backdrop 有 onclick（gate／進化未完就冇） */
      if (root.matches(".modal-backdrop") && typeof root.onclick === "function") {
        root.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        return true;
      }
      return false;
    }
    if (ctx.kind === "view") {
      const v = ctx.roots[0];
      /* 答題／捕捉／結算／戰鬥：Esc 唔可以當「離開」（各自有自己嘅 Esc 或者冇） */
      if (/^view-(home|quiz|capture|settlement|battle)$/.test(v.id)) return false;
      const btn = findClose(v);
      if (btn) { btn.click(); return true; }
      /* 頁內冇 Back（例如 phone 嘅 Leaderboard）→ 經下巴 Home 掣返主頁（同 wide 嘅 Esc 一致，Rule 44 判定照行） */
      const home = document.getElementById("btn-pd-home");
      if (home && isVisible(home) && !home.disabled) { home.click(); return true; }
    }
    return false;
  }

  /* ---------- Tab 困喺 overlay／phone sheet ---------- */
  function trapTab(back) {
    const ctx = context();
    if (ctx.kind === "view" || ctx.kind === "none") return false;
    const list = candidates(ctx).filter(c => c.nat && c.el.tabIndex >= 0);
    if (!list.length) return false;
    const els = list.map(c => c.el);   /* querySelectorAll 已係 DOM 次序 */
    const i = els.indexOf(document.activeElement);
    if (i === -1) { focusEl(back ? els[els.length - 1] : els[0]); return true; }
    if (!back && i === els.length - 1) { focusEl(els[0]); return true; }
    if (back && i === 0) { focusEl(els[els.length - 1]); return true; }
    return false;
  }

  /* ---------- 捷徑層（第二期）：字母／數字鍵，唔記得都可以用方向鍵 ---------- */
  const isHome = c => (c.kind === "view" && c.roots[0].id === "view-home") || c.kind === "sheet";
  const isPage = c => c.kind === "view" && !/^view-(home|quiz|capture|settlement|battle)$/.test(c.roots[0].id);
  const isSetup = c => c.kind === "view" && c.roots[0].id === "view-quiz-setup";
  /* hidden:true = 目標喺收埋嘅 sheet 入面，照撳（onclick 照行），但唔出 badge */
  const SHORTCUTS = [
    { k: "s", sel: "#btn-start-quiz", when: isHome, label: "Start quiz" },
    { k: "1", sel: "#btn-bd-battle", when: isHome, label: "Battle" },
    { k: "2", sel: "#btn-bd-leaderboard", when: isHome, label: "Leaderboard" },
    { k: "3", sel: "#btn-bd-friends", when: isHome, label: "Friends" },
    { k: "4", sel: "#btn-bd-setting", when: isHome, label: "Settings" },
    { k: "d", sel: "#btn-bezel-dex", when: isHome, label: "Pokédex" },
    { k: "g", sel: "#btn-bezel-diamond", when: isHome, label: "Dragonite Draw" },
    { k: "c", sel: "#btn-bezel-streak", when: isHome, label: "Practice calendar" },
    { k: "q", sel: "#btn-bezel-energy", when: isHome, label: "Daily quests" },
    { k: "b", sel: "#btn-home-bag", when: isHome, label: "Bag", hidden: true },
    { k: "s", sel: "#btn-setup-start", when: isSetup, label: "Start the quiz" },
    { k: "h", sel: "#btn-pd-home", when: isPage, label: "Back to Home" }
  ];

  function shortcutFor(ctx, key) {
    const k = String(key).toLowerCase();
    for (const sc of SHORTCUTS) {
      if (sc.k !== k || !sc.when(ctx)) continue;
      const el = document.querySelector(sc.sel);
      if (!el || isDisabled(el)) continue;
      if (!sc.hidden && !isVisible(el)) continue;
      return el;
    }
    return null;
  }

  /* 鍵盤模式先出嘅按鍵 badge：獨立 fixed 層，用目標 rect 定位（唔改掣本身 CSS，避免影響入面 absolute 子元素） */
  const FINE = window.matchMedia ? window.matchMedia("(hover: hover) and (pointer: fine)") : { matches: true };
  let badgeLayer = null, badgeRaf = 0;
  function renderBadges() {
    badgeRaf = 0;
    if (!badgeLayer) {
      badgeLayer = document.createElement("div");
      badgeLayer.className = "kbd-badges";
      badgeLayer.setAttribute("aria-hidden", "true");
      document.body.appendChild(badgeLayer);
    }
    if (!kbdMode || !FINE.matches) { badgeLayer.innerHTML = ""; return; }
    const ctx = context();
    let html = "";
    const done = new Set();
    for (const sc of SHORTCUTS) {
      if (sc.hidden || done.has(sc.sel) || !sc.when(ctx)) continue;
      const el = document.querySelector(sc.sel);
      if (!el || isDisabled(el) || !isVisible(el)) continue;
      const r = el.getBoundingClientRect();
      if (isOccluded(el, r, null)) continue;
      done.add(sc.sel);
      const x = Math.min(innerWidth - 22, Math.max(2, r.right - 12));
      const y = Math.max(2, r.top - 8);
      html += `<span class="kbd-badge" style="left:${Math.round(x)}px;top:${Math.round(y)}px">${sc.k.toUpperCase()}</span>`;
    }
    badgeLayer.innerHTML = html;
  }
  function scheduleBadges() {
    if (!badgeRaf) badgeRaf = requestAnimationFrame(renderBadges);
  }
  function setKbdMode(on) {
    if (kbdMode === on) return;
    kbdMode = on;
    document.documentElement.classList.toggle("kbd-mode", on);
    scheduleBadges();
  }

  /* ---------- ? 快捷鍵一覽 ---------- */
  function helpHTML(ctx) {
    const row = (k, d) => `<tr><td>${k}</td><td>${d}</td></tr>`;
    const seen = new Set();
    const here = SHORTCUTS.filter(sc => {
      if (!sc.when(ctx) || seen.has(sc.k)) return false;
      seen.add(sc.k);
      return true;
    });
    const kbd = s => `<kbd>${s}</kbd>`;
    return `
      <div class="kbd-help">
        <h3 class="kbd-help-t">⌨️ Keyboard</h3>
        <table class="kbd-help-tb">
          ${row(kbd("↑") + kbd("↓") + kbd("←") + kbd("→"), "Move between buttons")}
          ${row(kbd("Enter"), "Press the highlighted button")}
          ${row(kbd("Esc"), "Close / go back")}
          ${row(kbd("Tab"), "Next button (Shift+Tab: previous)")}
          ${row(kbd("Space"), "Press button · tap the Poké Ball when catching")}
          ${row(kbd("?"), "Show this list")}
        </table>
        ${here.length ? `<p class="kbd-help-s">On this screen</p><table class="kbd-help-tb">${here.map(sc => row(kbd(sc.k.toUpperCase()), sc.label)).join("")}</table>` : ""}
        <p class="kbd-help-s">Catching</p>
        <table class="kbd-help-tb">
          ${row(kbd("Space") + kbd("Enter"), "Tap the Poké Ball (3× to throw) · Continue")}
        </table>
        <p class="kbd-help-s">In a quiz</p>
        <table class="kbd-help-tb">
          ${row(kbd("Enter"), "Submit / next question")}
          ${row(kbd("Esc"), "Quiz settings")}
          ${row(kbd("Ctrl") + "+" + kbd("H"), "Show hint")}
          ${row(kbd("Ctrl") + "+" + kbd("P"), "Play the word")}
        </table>
        <button type="button" class="btn-big btn-primary" data-kbd-primary data-kbd-close id="kbd-help-close">Got it</button>
      </div>`;
  }

  function showHelp() {
    if (!window.App || !App.showModal) return;
    if (document.querySelector("#modal-root .modal-backdrop")) return;  /* 唔好蓋走其他 modal */
    App.showModal(helpHTML(context()));
    const b = document.getElementById("kbd-help-close");
    if (b) b.onclick = () => App.closeModal();
    if (kbdMode) setTimeout(() => focusEl(b), 30);
  }

  /* ---------- 情境變咗 → 自動起點 ---------- */
  let ctxTimer = 0, ctxTimer2 = 0;
  const openers = [];   /* [{ key, el }]：開 sheet／modal 前嘅焦點，關咗之後還返 */
  function scheduleCtxCheck() {
    /* 淡入中嘅 overlay（opacity 0）未算可見，而 opacity 動畫唔會觸發 MutationObserver → 450ms 再睇多次 */
    if (!ctxTimer2) ctxTimer2 = setTimeout(() => { ctxTimer2 = 0; ctxCheck(); }, 450);
    if (ctxTimer) return;
    ctxTimer = setTimeout(() => { ctxTimer = 0; ctxCheck(); }, 120);
  }
  function ctxCheck() {
    scheduleBadges();
    {
      const ctx = context();
      const act = document.activeElement;
      const lost = !act || act === document.body || !isVisible(act);
      if (ctx.key === lastCtxKey) {
        /* 同一情境但焦點冇咗（掣被 re-render／收埋），或者焦點仲喺情境外面
           （overlay 出現嗰陣主掣仲被淡出緊嘅層蓋住，嗰次揀唔到）→ 放返主要掣 */
        if (kbdMode && (lost || (ctx.kind !== "none" && !inCtx(ctx, act)))) {
          const l = candidates(ctx); const p = primary(ctx, l); if (p) focusEl(p);
        }
        return;
      }
      const prevKey = lastCtxKey;
      lastCtxKey = ctx.key;
      /* 返到之前嘅情境：還焦點畀當初開佢嗰粒掣 */
      const back = openers.length && openers[openers.length - 1].key === ctx.key ? openers.pop() : null;
      if (!back && !lost && !inCtx(ctx, act)) openers.push({ key: prevKey, el: act });
      else if (!back && ctx.focusRoot && act && !ctx.focusRoot.contains(act)) openers.push({ key: prevKey, el: act });
      if (openers.length > 10) openers.shift();
      if (!kbdMode) return;
      if (back && back.el && isVisible(back.el) && inCtx(ctx, back.el)) { focusEl(back.el); return; }
      let list = candidates(ctx);
      if (ctx.focusRoot) {
        if (ctx.focusRoot.contains(act)) return;
        list = list.filter(c => ctx.focusRoot.contains(c.el));
      } else if (inCtx(ctx, act) && act !== document.body && isVisible(act)) {
        return;
      }
      const p = primary(ctx, list);
      if (p) focusEl(p);
    }
  }

  /* ---------- 事件 ---------- */
  function isTyping(t) {
    if (!t || !t.matches) return false;
    if (t.isContentEditable) return true;
    if (t.matches("textarea, select")) return true;
    if (t.matches("input")) {
      const ty = (t.type || "text").toLowerCase();
      return !["button", "submit", "reset", "checkbox", "radio", "range", "color", "file", "image"].includes(ty);
    }
    return false;
  }

  /* 呢啲情況方向鍵留畀原生（打字移游標、slider 調值、select 揀項） */
  function arrowIsNative(t, key) {
    if (!t || !t.matches) return false;
    if (t.isContentEditable || t.matches("textarea, select")) return true;
    const horiz = key === "ArrowLeft" || key === "ArrowRight";
    if (t.matches("input[type=range]")) return horiz;
    if (isTyping(t)) return horiz;   /* 單行輸入格：左右移游標，上下照導航 */
    return false;
  }

  const DIRS = { ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right" };

  window.addEventListener("keydown", (e) => {
    const k = e.key;
    if (DIRS[k] || k === "Tab" || k === "Enter" || k === "Escape" || k === " ") setKbdMode(true);
    if (e.defaultPrevented || e.isComposing) return;
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const t = e.target;

    if (DIRS[k]) {
      if (arrowIsNative(t, k)) return;
      if (move(DIRS[k])) e.preventDefault();
      return;
    }
    if (k === "Enter" || k === " ") {
      if (isTyping(t)) return;
      /* 原生 button／a／summary 由瀏覽器自己 click；radio 用 Enter 都揀 */
      if (t && t.matches && (t.matches("[role=button], [role=radio], [role=tab], [data-kbd-auto], label") ||
          (k === "Enter" && t.matches("input[type=radio], input[type=checkbox]")))) {
        if (e.repeat) return;
        e.preventDefault();
        t.click();
      }
      return;
    }
    if (k === "Escape") {
      if (escape()) e.preventDefault();
      return;
    }
    if (k === "Tab") {
      if (trapTab(e.shiftKey)) e.preventDefault();
      return;
    }
    if (k === "?" && !isTyping(t)) {
      e.preventDefault();
      showHelp();
      return;
    }
    if (k.length === 1 && !e.repeat && !isTyping(t)) {
      const el = shortcutFor(context(), k);
      if (el) {
        setKbdMode(true);
        e.preventDefault();
        el.click();
      }
    }
  });

  window.addEventListener("resize", scheduleBadges, { passive: true });
  window.addEventListener("scroll", scheduleBadges, { passive: true, capture: true });

  /* 撳滑鼠／觸控 → 離開鍵盤模式（唔好自動搶焦點） */
  ["pointerdown", "mousedown", "touchstart"].forEach(ev =>
    window.addEventListener(ev, () => { setKbdMode(false); }, { capture: true, passive: true }));

  /* 監察 DOM 變化，情境變咗先做嘢（只睇 class／hidden／style 同子節點，計算本身好輕） */
  function startObserver() {
    const mo = new MutationObserver(scheduleCtxCheck);
    mo.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["class", "hidden", "style", "inert"] });
    /* 淡入／滑入做完先真正「見到」：opacity／transform 動畫完結都再檢查一次（MutationObserver 睇唔到 CSS 過渡） */
    document.addEventListener("transitionend", (e) => {
      if (/^(opacity|visibility|transform)$/.test(e.propertyName)) scheduleCtxCheck();
    }, true);
    document.addEventListener("animationend", scheduleCtxCheck, true);
    lastCtxKey = context().key;
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", startObserver);
  else startObserver();

  window.Keys = { context, candidates: () => candidates(context()), move, escape, showHelp, shortcuts: SHORTCUTS, focusPrimary: () => { const c = context(); focusEl(primary(c, candidates(c))); }, isKbd: () => kbdMode };
})();
