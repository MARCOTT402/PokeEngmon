/* ============================================================
   BagUI — 背包（第 1 段：橫向紅框 + 三欄外殼 + 轉手機提示）
   ------------------------------------------------------------
   Spec：.trae/documents/bag-system-spec-20261105.md
   Prototype：tools/prototype-bag.html（已批）
   - 掛喺 body 嘅全畫面 overlay（z 2500：高過 team-select／pvp 等，低過 toast 3000）
   - 紅框轉橫（逆時針）：裝飾列 → 左、數據列 → 左側直排（背包開住時鎖定）、Home → 右
   - 設計尺寸 956×440（iPhone 17 Pro Max 橫向，Rule 30），按視窗等比縮放
   - 直向開 → 轉手機提示（可以「Play like this anyway」）；離開時橫向 → 提示轉返直
   - 第 1 段：Pokémon／Items／Held items 三個 tab 只讀；我的隊伍、拖放、換招、EV、
     送回大木博士等喺第 2、3 段加
   ============================================================ */
const BagUI = (() => {
  const W = 956, H = 440;
  const TABS = ["pokemon", "items", "held"];
  const S = { open: false, tab: "pokemon", sort: null, dir: 1, sel: null, from: "home", evPick: false, target: null, targetMode: null, itemFilter: "all", battle: null };
  let root = null, rotateEl = null;
  const $ = sel => root.querySelector(sel);
  /* 用時先讀 escapeHTML：core/dom.js 係 ES module（Rule 119），會喺全部 classic script 之後先執行 */
  const esc = (s) => escapeHTML(s);

  /* 第 1 段只讀顯示現有庫存（食物同藥）；樹果取代食物喺第 3 段 */
  function itemList() {
    const out = [];
    const count = k => (window.Pet ? Pet.countOf(k) : 0) || 0;
    (window.Care ? Care.MED_KINDS : []).forEach(k => {
      const m = Care.MED_INFO[k];
      out.push({ id: k, cat: "medicine", name: m.name, icon: Care.ITEM_SPRITE(m.sprite), n: count(k), desc: m.effect });
    });
    out.push({ id: "revive", cat: "medicine", name: "Revival", icon: "assets/items/revive.png", n: count("revive"), desc: "Revives a fainted Pokémon with full HP and full fullness, and clears every status." });
    if (count("food") > 0) out.push({ id: "food", cat: "food", name: "Food", icon: "assets/items/food.png", n: count("food"), desc: "Fullness +25%." });
    if (count("premium") > 0) out.push({ id: "premium", cat: "food", name: "Premium Food", icon: "assets/items/premium.png", n: count("premium"), desc: "Fullness +50%." });
    /* 樹果（第 3b 段）：只顯示持有嘅 */
    if (window.Care && Care.ownedBerries) Care.ownedBerries().forEach(k => {
      const b = Care.BERRIES[k];
      out.push({ id: k, cat: "berries", name: b.name, icon: Care.ITEM_SPRITE(b.sprite), n: Care.berryCount(k), tier: b.tier, berry: b,
        desc: `${b.tier === "super" ? "Super" : "Normal"} food — fullness +${b.fullness}%.` });
    });
    return out;
  }
  function heldList() {
    const count = k => (window.Pet ? Pet.countOf(k) : 0) || 0;
    const out = (typeof STONE_KINDS !== "undefined" ? STONE_KINDS : []).map(k => ({
      id: k, cat: "stones", name: STONE_LABELS[k], icon: (window.Care ? Care.ITEM_SPRITE(k + "-stone") : null), emoji: STONE_ICONS[k], n: count(k),
      desc: "Use it on a Pokémon that evolves with this stone — it evolves right away and the stone is used up. Like the original games, stones can't be held."
    }));
    /* Mega 石（第 4c 段）：只顯示持有嘅 */
    if (window.Care && Care.ownedMegas) Care.ownedMegas().forEach(k => {
      const m = MEGA_STONES[k];
      out.push({ id: k, cat: "mega", name: m.stoneName, icon: Care.ITEM_SPRITE(k), n: Care.megaCount(k), mega: m,
        desc: `Give it to ${speciesName(m.dexId)}. In battle, tap MEGA on the move screen to Mega Evolve into ${m.formName} — once per battle. It changes back after the battle.` });
    });
    return out;
  }
  const speciesName = d => { const p = (typeof dexOf === "function") ? dexOf(d) : null; return (p && p.name) || ("#" + d); };

  /* ---------- 骨架 ---------- */
  function build() {
    root = document.createElement("div");
    root.id = "bag-root";
    root.className = "bag-root";
    root.innerHTML = `
      <div class="bag-stage" id="bag-stage">
        <div class="bag-frame">
          <div class="bag-deco" aria-hidden="true">
            <svg class="bag-deco-seam" viewBox="0 0 44 100" preserveAspectRatio="none"><path d="M24 100 V89 L34 85 V0" fill="none" stroke="#8a1712" stroke-width="2.5" vector-effect="non-scaling-stroke" stroke-linejoin="round"/></svg>
            <span class="bag-ball bag-deco-ball"></span>
            <span class="bag-deco-brand">POKÉDEX OF ANOMALIES</span>
            <span class="bag-deco-lens"></span>
          </div>
          <div class="bag-bezel" id="bag-bezel" title="Locked while the Bag is open">
            <div class="bag-bezel-group">
              <div class="bag-stat"><svg viewBox="0 0 24 24"><rect x="2" y="7" width="18" height="10" rx="2" fill="#fff" stroke="#1a1a1a" stroke-width="1.6"/><rect x="20.5" y="9.5" width="2" height="5" rx="1" fill="#1a1a1a"/><rect x="3.5" y="8.5" width="12" height="7" rx="1" fill="#ffe259"/></svg><span class="bag-num" data-stat="energy">0</span></div>
              <div class="bag-stat"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10.5" fill="#7a1eaa" stroke="#1a1a1a" stroke-width="1.6"/><rect x="1.5" y="11.3" width="21" height="1.4" fill="#1a1a1a"/><path d="M1.6 12.7h20.8A10.5 10.5 0 0 1 1.6 12.7Z" fill="#d8d8d8"/><circle cx="12" cy="12" r="2.4" fill="#fff" stroke="#1a1a1a" stroke-width="1.2"/></svg><span class="bag-num" data-stat="dex">0</span></div>
            </div>
            <div class="bag-bezel-group">
              <div class="bag-stat"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#1e7fbf" stroke="#062036" stroke-width="1.6"/><ellipse cx="8" cy="7.5" rx="4" ry="2.5" fill="#fff" opacity=".55"/></svg><span class="bag-num" data-stat="diamonds">0</span></div>
              <div class="bag-stat"><svg viewBox="0 0 24 24"><path d="M13 2 L7.5 11.5 L11 12 L8 22 L16.5 10.5 L12 10.8 L14.5 2 Z" fill="#ffd54f" stroke="#3d1f00" stroke-width="1.4" stroke-linejoin="round"/></svg><span class="bag-num" data-stat="streak">x0</span></div>
            </div>
          </div>
          <div class="bag-screen" id="bag-screen">
            <aside class="bag-team">
              <div class="bag-colhead"><span id="bag-team-title">My Team</span><small id="bag-team-hint">hold &amp; drag</small></div>
              <div class="bag-slots" id="bag-slots"></div>
            </aside>
            <section class="bag-mid">
              <div class="bag-tabs" id="bag-tabs">
                <span class="bag-tab-ind" id="bag-tab-ind"></span>
                <button type="button" class="bag-tab" data-tab="pokemon">Pokémon</button>
                <button type="button" class="bag-tab" data-tab="items">Items</button>
                <button type="button" class="bag-tab" data-tab="held">Held items</button>
              </div>
              <div class="bag-chips" id="bag-chips"></div>
              <div class="bag-banner" id="bag-banner"><span id="bag-banner-t"></span><button type="button" id="bag-banner-x">Cancel</button></div>
              <div class="bag-gridwrap" id="bag-gridwrap"><div class="bag-grid" id="bag-grid"></div></div>
              <div class="bag-dropzone" id="bag-dropzone">Drop here to remove from team</div>
              <div class="bag-lockov" id="bag-lockov">🔒 Locked while switching<small>Pick a Pokémon on the left to send out</small></div>
            </section>
            <aside class="bag-detail" id="bag-detail"></aside>
            <div class="bag-me" id="bag-me"></div>
            <div class="bag-sortov" id="bag-sortov"></div>
            <div class="bag-sortov" id="bag-oakov"></div>
          </div>
          <div class="bag-chin"><button type="button" class="bag-ball bag-home" id="bag-home" aria-label="Back"></button><span class="bag-home-lbl" id="bag-home-lbl">HOME</span></div>
        </div>
      </div>`;
    document.body.appendChild(root);
    /* Rule 60：body 級 overlay 要截停冒泡，免得 sheet 外部點擊 handler 誤關 */
    ["pointerdown", "pointerup", "click", "touchstart"].forEach(t => root.addEventListener(t, e => e.stopPropagation()));

    rotateEl = document.createElement("div");
    rotateEl.className = "bag-rotate";
    rotateEl.innerHTML = `
      <div class="bag-rot-art" aria-hidden="true">
        <svg class="bag-rot-arrow" viewBox="0 0 80 44"><path d="M8 38 C 14 10, 50 4, 66 22" fill="none" stroke="#111" stroke-width="10" stroke-linecap="round"/><path d="M8 38 C 14 10, 50 4, 66 22" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round"/><path d="M56 14 L72 28 L74 10 Z" fill="#fff" stroke="#111" stroke-width="3" stroke-linejoin="round"/></svg>
        <div class="bag-rot-phone"></div>
      </div>
      <h2 class="bag-rot-title"></h2>
      <p class="bag-rot-msg"></p>
      <button type="button" class="bag-rot-btn">Play like this anyway</button>`;
    document.body.appendChild(rotateEl);
    ["pointerdown", "pointerup", "click", "touchstart"].forEach(t => rotateEl.addEventListener(t, e => e.stopPropagation()));

    root.querySelectorAll(".bag-tab").forEach(b => b.addEventListener("click", () => switchTab(b.dataset.tab)));
    $("#bag-home").addEventListener("click", close);
    $("#bag-bezel").addEventListener("click", () => App.toast("Locked while the Bag is open"));
    bindSwipe();
    bindChipScroll();
    $("#bag-banner-x").addEventListener("click", cancelTarget);
    window.addEventListener("resize", fit);
    const mq = window.matchMedia("(orientation: landscape)");
    (mq.addEventListener ? mq.addEventListener.bind(mq, "change") : mq.addListener.bind(mq))(() => { fit(); autoHideRotate(); });
  }

  /* ---------- 縮放：956×440 等比塞入視窗 ---------- */
  let _fitRetry = 0;
  function fit() {
    if (!root) return;
    /* 數值兜底（Rule 99）：iOS 轉機瞬間 innerWidth／innerHeight 可能係 0 → scale(0) 背包消失；
       尺寸未 ready 就 100ms 後再試（最多 10 次），唔寫入無效 transform */
    if (!(window.innerWidth > 0 && window.innerHeight > 0)) {
      if (_fitRetry++ < 10) setTimeout(fit, 100);
      return;
    }
    _fitRetry = 0;
    /* 直向「Play like this anyway」：成個橫向畫面轉 90° 填滿屏幕（玩家逆時針轉手機就變正）。
       只限手機（layout = phone）；iPad 直向等 tablet 夠闊，直接等比縮放唔轉（Responsive P1 Task 9） */
    const portrait = window.innerHeight > window.innerWidth && isPhone();
    let s = portrait
      ? Math.min(window.innerWidth / H, window.innerHeight / W)
      : Math.min(window.innerWidth / W, window.innerHeight / H);
    if (!Number.isFinite(s) || s <= 0) s = 1;
    s = Math.min(4, Math.max(0.2, s));
    $("#bag-stage").style.transform = portrait ? `rotate(90deg) scale(${s})` : `scale(${s})`;
    renderTabInd();
  }

  /* ---------- 轉手機提示 ---------- */
  const isPortrait = () => window.matchMedia("(orientation: portrait)").matches;
  /* 「要轉機」只係手機嘅事：tablet／wide 唔叫用戶轉（App.layout 未有時當手機，保持舊行為） */
  const isPhone = () => !(window.App && App.layout) || App.layout() === "phone";
  const isLandscape = () => window.matchMedia("(orientation: landscape)").matches;
  let rotateMode = null, rotateDone = null;
  /* msg：自訂第二行（例如戰鬥用 "Battles work in landscape"）；冇就用背包預設 */
  function showRotate(mode, done, msg) {
    rotateMode = mode; rotateDone = done || null;
    rotateEl.classList.toggle("back", mode === "portrait");
    rotateEl.querySelector(".bag-rot-title").textContent = mode === "portrait" ? "Turn your phone upright" : "Please rotate your device";
    rotateEl.querySelector(".bag-rot-msg").textContent = msg || (mode === "portrait" ? "Home works in portrait" : "The Bag works in landscape");
    rotateEl.classList.add("show");
    rotateEl.querySelector(".bag-rot-btn").onclick = hideRotate;
  }
  function hideRotate() {
    if (!rotateEl.classList.contains("show")) return;
    rotateEl.classList.remove("show");
    const cb = rotateDone; rotateMode = null; rotateDone = null;
    if (cb) cb();
  }
  /* 轉咗去要求嘅方向 → 自動收起提示 */
  function autoHideRotate() {
    if (rotateMode === "landscape" && isLandscape()) hideRotate();
    if (rotateMode === "portrait" && isPortrait()) hideRotate();
  }

  /* ---------- 開／關 ---------- */
  function open(opts) {
    if (!root) build();
    S.from = (opts && opts.from) || "home";
    S.tab = "pokemon"; S.sel = null; S.evPick = false; S.battle = null;
    root.classList.remove("in-battle", "switching");
    $("#bag-team-title").textContent = "My Team";
    if (window.Pet) Pet.runDailyCheck();
    returnHeldStones();
    S.open = true;
    root.classList.add("show");
    document.body.classList.add("bag-open");
    $("#bag-home-lbl").textContent = S.from === "battle" ? "BATTLE" : "HOME";
    fillBezel();
    fit();
    renderAll("in-f");
    if (isPortrait() && isPhone()) showRotate("landscape");
    if (window.App && App._syncRotateHint) App._syncRotateHint(); /* 背包豁免「請轉返直向」 */
  }
  function close() {
    Drag.cancelCarry();
    if (S.battle) {
      if (S.battle.forced) { toast("Choose a Pokémon to send out"); return; }
      const ctx = S.battle; hideBattleBag(); if (ctx.onClose) ctx.onClose();
      return;
    }
    flushEv(); cancelTarget();
    if (ME.uid) { $("#bag-me").classList.remove("show"); ME.uid = null; }
    const finish = () => {
      root.classList.remove("show");
      document.body.classList.remove("bag-open");
      S.open = false;
      if (S.from === "battle" && typeof BattleUI !== "undefined") BattleUI.openMenu();
      else if (window.App) App.renderHome();
    };
    finish();
    /* 返直向頁面：手機仲係打橫 → 全域「請轉返直向」提示（App._syncRotateHint，條件 = phone-land）。
       舊做法用 innerWidth <= 1000 判斷，桌面窄橫窗都會彈。 */
    if (window.App && App._syncRotateHint) App._syncRotateHint();
  }

  /* 紅框數據列（顯示用，鎖定唔可以撳） */
  function fillBezel() {
    const st = loadState();
    const set = (k, v) => { const el = root.querySelector(`[data-stat="${k}"]`); if (el) el.textContent = v; };
    set("diamonds", st.diamonds || 0);
    set("streak", "x" + (typeof calcStreak === "function" ? calcStreak() : 0));
    const dex = document.getElementById("home-dex-progress");
    set("dex", dex ? dex.textContent : "");
    const en = document.getElementById("td-energy-val");
    set("energy", en ? en.textContent : "0");
  }

  /* ---------- tabs ---------- */
  function renderTabInd() {
    const tabs = $("#bag-tabs"); if (!tabs) return;
    const w = (tabs.clientWidth - 6 - 8) / 3;
    const ind = $("#bag-tab-ind");
    ind.style.width = w + "px";
    ind.style.transform = `translateX(${TABS.indexOf(S.tab) * (w + 4)}px)`;
    root.querySelectorAll(".bag-tab").forEach(b => { b.classList.toggle("on", b.dataset.tab === S.tab); b.classList.toggle("locked", tabLocked(b.dataset.tab)); });
  }
  function tabLocked(t) { return !!S.battle && (S.battle.mode === "switch" || t !== "items"); }
  function switchTab(t) {
    if (t === S.tab) return;
    if (tabLocked(t)) { toast(S.battle.mode === "switch" ? "Pick a Pokémon on the left" : "Only items can be used in battle"); return; }
    const dir = TABS.indexOf(t) > TABS.indexOf(S.tab) ? "in-l" : "in-r";
    flushEv(); S.evPick = false;
    if (t !== "items") S.itemFilter = "all";
    S.tab = t; S.sel = null;
    renderTabInd(); renderChips(); renderGrid(dir); renderDetail();
    $("#bag-grid").scrollTop = 0;
  }
  /* 左右 swipe（touch／pen）＋ trackpad 兩指橫掃換 tab */
  function bindSwipe() {
    const g = $("#bag-gridwrap");
    let sw = null, lock = 0;
    g.addEventListener("pointerdown", e => { if (e.pointerType !== "mouse") sw = { x: e.clientX, y: e.clientY, t: Date.now() }; });
    g.addEventListener("pointerup", e => {
      if (!sw) return;
      const dx = e.clientX - sw.x, dy = e.clientY - sw.y, dt = Date.now() - sw.t; sw = null;
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.6 && dt < 700) step(dx < 0 ? 1 : -1);
    });
    g.addEventListener("pointercancel", () => { sw = null; });
    g.addEventListener("wheel", e => {
      if (Math.abs(e.deltaX) < 30 || Math.abs(e.deltaX) < Math.abs(e.deltaY) * 1.5 || Date.now() < lock) return;
      lock = Date.now() + 600; step(e.deltaX > 0 ? 1 : -1);
    }, { passive: true });
    const step = d => {
      const i = TABS.indexOf(S.tab) + d;
      if (i < 0 || i >= TABS.length) { $("#bag-grid").animate([{ transform: "none" }, { transform: `translateX(${-d * 14}px)` }, { transform: "none" }], { duration: 260 }); return; }
      switchTab(TABS[i]);
    };
  }

  /* =====================================================================
     第 2 段：我的隊伍・排序／心心・拖放・換招・EV（共用 EV Point Unit）
     ===================================================================== */
  const POKE_SORTS_DEFAULT = [["no", "No."], ["level", "Level"], ["fav", "Favorites"], ["type", "Type"],
    ["full", "Fullness"], ["hploss", "HP loss"], ["faint", "Faint"], ["status", "Status"]];
  const STATUS_NAME = { brn: "Burned", par: "Paralyzed", slp: "Asleep", frz: "Frozen", psn: "Poisoned", tox: "Badly poisoned" };
  const HEART = `<svg viewBox="0 0 24 24"><path d="M12 20.5s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.6a4.3 4.3 0 0 1 7.5 2.7c0 5.6-7.5 10.2-7.5 10.2Z"/></svg>`;
  const STAT_FULL = { hp: "HP", atk: "Attack", def: "Defense", spa: "Sp. Atk", spd: "Sp. Def", spe: "Speed" };
  const buzz = () => haptic(12);
  const toast = m => window.App && App.toast(m);
  const online = () => !!(window.SupabaseAuth && SupabaseAuth.isLoggedIn && SupabaseAuth.isLoggedIn());

  /* ---------- 資料 ---------- */
  const entryOf = uid => loadState().entries.find(e => e.uid === uid);
  function getTeam() {
    const st = loadState();
    const ids = new Set(st.entries.map(e => e.uid));
    const team = (Array.isArray(st.myTeam) ? st.myTeam : []).map(String).filter((u, i, a) => ids.has(u) && a.indexOf(u) === i).slice(0, 6);
    if (team.length !== (st.myTeam || []).length) { st.myTeam = team; saveState(); }
    return team;
  }
  function saveTeam(team) {
    const st = loadState();
    st.myTeam = team.slice(0, 6);
    saveState();
    if (window.Sync && Sync.patchAccount) Sync.patchAccount({ my_team: st.myTeam });
  }
  function sortOrder() {
    const saved = (loadState().bagPrefs || {}).sortOrder;
    if (!Array.isArray(saved)) return POKE_SORTS_DEFAULT.slice();
    const map = Object.fromEntries(POKE_SORTS_DEFAULT.map(s => [s[0], s]));
    const out = saved.filter(k => map[k]).map(k => map[k]);
    POKE_SORTS_DEFAULT.forEach(s => { if (!out.includes(s)) out.push(s); });
    return out;
  }
  function saveSortOrder(order) {
    const st = loadState();
    st.bagPrefs = Object.assign({}, st.bagPrefs, { sortOrder: order.map(s => s[0]) });
    saveState();
    if (window.Sync && Sync.patchAccount) Sync.patchAccount({ bag_prefs: st.bagPrefs });
  }
  const evPool = () => loadState().entries.reduce((a, e) => a + Math.max(0, e.evPoints || 0), 0);
  const careP = e => (window.Pet ? Pet.ensure(e) : (e.pet || {}));
  const hpPct = e => (window.Care ? Care.hpOf(e).pct : 100);
  const faintOf = e => !!(window.Pet && Pet.isFaint(e));
  const statusOf = e => (window.Care ? Care.statusKey(careP(e)) : null);
  const typesOf = dexId => (typeof Battle !== "undefined" && Battle.speciesTypes) ? Battle.speciesTypes(dexId) : [];

  /* ---------- chips：排序（再撳＝反轉）＋ ✎ 自訂次序；可以左右捲 ---------- */
  function renderChips() {
    const c = $("#bag-chips");
    if (S.battle) { c.innerHTML = ""; return; }
    if (S.tab === "items") {
      const opts = [["all", "All"], ["medicine", "Medicine"], ["berries", "Berries"]];
      c.innerHTML = opts.map(([v, l]) => `<button type="button" class="bag-chip ${S.itemFilter === v ? "on" : ""}" data-f="${v}">${l}</button>`).join("");
      c.querySelectorAll("[data-f]").forEach(b => b.addEventListener("click", () => { S.itemFilter = b.dataset.f; renderChips(); renderGrid("in-f"); }));
      return;
    }
    if (S.tab !== "pokemon") { c.innerHTML = ""; return; }
    if (!sortOrder().some(s => s[0] === S.sort)) S.sort = "no";
    c.innerHTML = `<span class="bag-chip-k">Sort</span>` + sortOrder().map(([v, l]) =>
      `<button type="button" class="bag-chip ${S.sort === v ? "on" : ""}" data-v="${v}">${l}${S.sort === v ? `<span class="dir">${S.dir > 0 ? "▲" : "▼"}</span>` : ""}</button>`).join("") +
      `<button type="button" class="bag-chip edit" id="bag-chip-edit">✎ Order</button>`;
    c.querySelectorAll("[data-v]").forEach(b => b.addEventListener("click", () => {
      if (S.sort === b.dataset.v) S.dir *= -1; else { S.sort = b.dataset.v; S.dir = 1; }
      renderChips(); renderGrid("in-f");
    }));
    $("#bag-chip-edit").addEventListener("click", openSortEditor);
    requestAnimationFrame(chipFades);
  }
  function chipFades() {
    const c = $("#bag-chips");
    c.classList.toggle("fade-l", c.scrollLeft > 4);
    c.classList.toggle("fade-r", c.scrollLeft + c.clientWidth < c.scrollWidth - 4);
  }
  function bindChipScroll() {
    const c = $("#bag-chips");
    c.addEventListener("scroll", chipFades, { passive: true });
    let m = null, moved = false;
    c.addEventListener("pointerdown", e => { if (e.pointerType === "mouse") { m = { x: e.clientX, sl: c.scrollLeft }; moved = false; } });
    window.addEventListener("pointermove", e => {
      if (!m) return;
      const dx = e.clientX - m.x;
      if (Math.abs(dx) > 4) { moved = true; c.scrollLeft = m.sl - dx / scale(); }
    }, true);
    window.addEventListener("pointerup", () => { m = null; }, true);
    c.addEventListener("click", e => { if (moved) { e.stopPropagation(); e.preventDefault(); moved = false; } }, true);
    c.addEventListener("wheel", e => { if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) { c.scrollLeft += e.deltaY; e.preventDefault(); } }, { passive: false });
  }
  const scale = () => ($("#bag-stage").getBoundingClientRect().width / W) || 1;

  /* ---------- Pokémon 排序同格仔字幕（名一定顯示，第二行跟排序） ---------- */
  function owned() {
    const st = loadState();
    const no = e => entryCurrentSpecies(e)[0];
    const byNo = (a, b) => no(a) - no(b) || (a.obtainedAt || 0) - (b.obtainedAt || 0);
    const f = {
      no: byNo,
      level: (a, b) => (b.level || 1) - (a.level || 1) || byNo(a, b),
      fav: (a, b) => (!!b.favorite - !!a.favorite) || byNo(a, b),
      type: (a, b) => String(typesOf(no(a))[0] || "").localeCompare(String(typesOf(no(b))[0] || "")) || byNo(a, b),
      full: (a, b) => (careP(a).health || 0) - (careP(b).health || 0) || byNo(a, b),
      hploss: (a, b) => hpPct(a) - hpPct(b) || byNo(a, b),
      faint: (a, b) => (faintOf(b) - faintOf(a)) || hpPct(a) - hpPct(b) || byNo(a, b),
      status: (a, b) => (!!statusOf(b) - !!statusOf(a)) || String(statusOf(a) || "").localeCompare(String(statusOf(b) || "")) || byNo(a, b)
    }[S.sort] || byNo;
    const list = st.entries.filter(e => Array.isArray(e.ownedSpecies) && e.ownedSpecies.length).sort(f);
    return S.dir > 0 ? list : list.reverse();
  }
  function caption(e) {
    const c = entryCurrentSpecies(e);
    let v;
    switch (S.sort) {
      case "level": v = `Lv.${e.level || 1}`; break;
      case "fav": v = e.favorite ? `<span class="warn-h">♥ Favorite</span>` : "—"; break;
      case "type": v = typesOf(c[0]).map(t => `<img src="${typeIconURL(t)}" alt="${t}">`).join(""); break;
      case "full": v = `<span class="${careP(e).health < 30 ? "warn" : ""}">${careP(e).health}% full</span>`; break;
      case "hploss": { const h = window.Care ? Care.hpOf(e) : null; v = h ? `<span class="${h.pct < 50 ? "warn" : ""}">HP ${h.cur}/${h.max}</span>` : "—"; break; }
      case "faint": v = faintOf(e) ? `<span class="warn">Fainted</span>` : `HP ${Math.round(hpPct(e))}%`; break;
      case "status": { const k = statusOf(e); v = k ? `<span class="warn">${STATUS_NAME[k]}</span>` : faintOf(e) ? "Fainted" : "OK"; break; }
      default: v = `No.${String(c[0]).padStart(3, "0")}`;
    }
    return `<b>${esc(c[1])}</b><i>${v}</i>`;
  }

  /* ---------- 格仔 ---------- */
  function keepSprites(box) {
    const old = {};
    box.querySelectorAll("img.bag-spr").forEach(i => { old[i.getAttribute("src")] = i; });
    return () => box.querySelectorAll("img.bag-spr").forEach(i => { const o = old[i.getAttribute("src")]; if (o && o !== i) i.replaceWith(o); });
  }
  function renderGrid(anim) {
    const g = $("#bag-grid");
    const restore = keepSprites(g);
    const st = loadState();
    if (S.tab === "pokemon") {
      const team = getTeam();
      const list = owned();
      g.innerHTML = list.length ? list.map(e => {
        const c = entryCurrentSpecies(e);
        const faint = faintOf(e);
        const key = statusOf(e);
        const ti = team.indexOf(e.uid);
        return `<div class="bag-cell ${faint ? "fnt" : ""} ${S.sel && S.sel.uid === e.uid ? "sel" : ""}" data-uid="${esc(e.uid)}" role="button" tabindex="0">
          <span class="bag-pic"><img class="bag-spr" src="${animatedURL(c[0])}" alt="" loading="lazy" draggable="false">
            ${ti >= 0 ? `<span class="bag-teamno">${ti + 1}</span>` : e.uid === st.activeUid ? `<span class="bag-tag">PARTNER</span>` : ""}
            ${key ? `<img class="bag-st" src="assets/battle/ui/status-${Care.STATUS_INFO[key].icon}.png" alt="">` : faint ? `<img class="bag-st" src="assets/battle/ui/status-fnt.png" alt="">` : ""}
            ${e.heldItem ? `<img class="bag-held" src="${heldSprite(e.heldItem)}" alt="">` : ""}
            <button type="button" class="bag-heart ${e.favorite ? "on" : ""}" data-fav="1" aria-label="Favorite">${HEART}</button></span>
          <span class="bag-cap">${caption(e)}</span>
        </div>`;
      }).join("") : `<div class="bag-empty">No Pokémon yet — finish a quiz to pull one!</div>`;
      g.querySelectorAll("[data-uid]").forEach(el => {
        const uid = el.dataset.uid;
        el.addEventListener("click", ev => {
          if (Drag.justDropped) return;
          if (ev.target.closest("[data-fav]")) { toggleFav(uid, el); return; }
          if (S.target) { applyItem(S.target, uid); return; }
          const now = Date.now();
          if (lastTap.uid === uid && now - lastTap.t < 320) { toggleFav(uid, el, true); lastTap.uid = null; return; }
          lastTap.uid = uid; lastTap.t = now;
          select({ kind: "pokemon", uid });
        });
        Drag.bind(el, () => ({ kind: "pokemon", uid, img: animatedURL(entryCurrentSpecies(entryOf(uid))[0]) }));
      });
    } else {
      const list = S.battle ? S.battle.items() : S.tab === "items" ? itemList().filter(it => S.itemFilter === "all" || it.cat === S.itemFilter || (S.itemFilter === "berries" && it.cat === "food")) : heldList();
      g.innerHTML = (list.length ? "" : `<div class="bag-empty">${S.itemFilter === "berries" ? "No berries yet — answer quiz questions to collect them." : "Nothing here yet."}</div>`) + list.map(it => `
        <button type="button" class="bag-cell ${it.n <= 0 || it.usable === false ? "dim" : ""} ${S.sel && S.sel.id === it.id ? "sel" : ""}" data-id="${it.id}">
          <span class="bag-pic">${it.tier ? `<span class="bag-tier ${it.tier}">${it.tier === "super" ? "SUPER" : "FOOD"}</span>` : ""}${it.icon ? `<img class="bag-spr" src="${it.icon}" alt="" draggable="false">` : `<span class="bag-emoji">${it.emoji}</span>`}<span class="bag-cnt">×${it.n}</span></span>
          <span class="bag-cap"><b>${esc(it.name)}</b></span>
        </button>`).join("") + (S.tab === "held" ? `<div class="bag-empty small">Mega stones and other held items will appear here later.</div>` : "");
      g.querySelectorAll("[data-id]").forEach(el => {
        el.addEventListener("click", () => {
          if (Drag.justDropped) return;
          const it = itemInfo(el.dataset.id);
          if (S.battle && it && it.usable === false) { toast("Can't use this in battle"); return; }
          cancelTarget(); select({ kind: S.tab, id: el.dataset.id });
        });
        Drag.bind(el, () => { const it = itemInfo(el.dataset.id); return it && it.n > 0 && it.usable !== false ? { kind: "item", id: it.id, img: it.icon || "" , label: it.icon ? null : it.name } : null; });
      });
    }
    restore();
    if (anim) { g.classList.remove("in-l", "in-r", "in-f"); void g.offsetWidth; g.classList.add(anim); }
  }
  const lastTap = { uid: null, t: 0 };

  function toggleFav(uid, el, big) {
    const st = loadState();
    const e = st.entries.find(x => x.uid === uid); if (!e) return;
    e.favorite = !e.favorite;
    saveState(); buzz();
    if (window.Sync && Sync.patchEntry) Sync.patchEntry(uid, { favorite: e.favorite });
    const h = el && el.querySelector(".bag-heart");
    if (h) { h.classList.toggle("on", e.favorite); h.classList.remove("pop"); void h.offsetWidth; h.classList.add("pop"); }
    if (big && e.favorite && el) {
      const b = document.createElement("div"); b.className = "bag-bigheart"; b.innerHTML = HEART;
      el.querySelector(".bag-pic").appendChild(b); setTimeout(() => b.remove(), 750);
    }
    if (S.sort === "fav") setTimeout(() => renderGrid("in-f"), 380);
    if (S.sel && S.sel.uid === uid) renderDetail();
  }

  /* ---------- 左欄：我的隊伍 ---------- */
  const B_ICON = { burn: "brn", paralyze: "par", sleep: "slp", freeze: "frz", poison: "psn", toxic: "tox" };
  function renderBattleTeam() {
    const box = $("#bag-slots");
    const restore = keepSprites(box);
    box.innerHTML = S.battle.team().map(p => {
      const pct = p.maxHp ? Math.max(0, p.hp) / p.maxHp * 100 : 0;
      const cls = p.fainted ? "faint" : pct < 20 ? "low" : pct <= 50 ? "mid" : "";
      const ic = p.fainted ? "fnt" : (p.status === "poison" && p.severe) ? "tox" : B_ICON[p.status];
      return `<div class="bag-slot fill ${p.fainted ? "fnt" : ""} ${S.sel && S.sel.bidx === p.idx ? "sel" : ""}" data-uid="bt-${p.idx}" data-slot="${p.idx}" data-drop="slot">
        <img class="bag-spr" src="${animatedURL(p.dexId)}" alt="" draggable="false">
        <div class="bag-slot-info"><div class="nm">${esc(p.name)}</div>
          <div class="lv">Lv.${p.level} ${ic ? `<img src="assets/battle/ui/status-${ic}.png" alt="">` : ""}</div>
          <div class="bag-minihp ${cls}"><i style="width:${pct}%"></i></div></div>
        <span class="ord">${p.idx + 1}</span>
        ${p.held ? `<img class="bag-held slot" src="${heldSprite(p.held)}" alt="">` : ""}
        ${p.active ? `<span class="bag-inbattle">IN BATTLE</span>` : ""}
      </div>`;
    }).join("");
    restore();
    box.querySelectorAll(".bag-slot[data-uid]").forEach(el => el.addEventListener("click", () => {
      if (Drag.justDropped) return;
      if (S.target) { applyItem(S.target, el.dataset.uid); return; }
      select({ kind: "bpoke", bidx: Number(el.dataset.slot) });
    }));
  }
  function renderTeam() {
    if (S.battle) { renderBattleTeam(); return; }
    const box = $("#bag-slots");
    const restore = keepSprites(box);
    const team = getTeam();
    let html = team.map((uid, i) => {
      const e = entryOf(uid); const c = entryCurrentSpecies(e);
      const h = window.Care ? Care.hpOf(e) : { pct: 100, faint: false };
      const key = statusOf(e);
      const cls = h.faint ? "faint" : h.pct < 20 ? "low" : h.pct <= 50 ? "mid" : "";
      return `<div class="bag-slot fill ${h.faint ? "fnt" : ""} ${S.sel && S.sel.uid === uid ? "sel" : ""}" data-uid="${esc(uid)}" data-slot="${i}" data-drop="slot">
        <img class="bag-spr" src="${animatedURL(c[0])}" alt="" draggable="false">
        ${e.heldItem ? `<img class="bag-held slot" src="${heldSprite(e.heldItem)}" alt="">` : ""}
        <div class="bag-slot-info"><div class="nm">${esc(c[1])}</div>
          <div class="lv">Lv.${e.level || 1} ${key ? `<img src="assets/battle/ui/status-${Care.STATUS_INFO[key].icon}.png" alt="">` : ""}</div>
          <div class="bag-minihp ${cls}"><i style="width:${h.pct}%"></i></div></div>
        <span class="ord">${i + 1}</span>
      </div>`;
    }).join("");
    for (let i = team.length; i < 6; i++) html += `<div class="bag-slot empty" data-slot="${i}" data-drop="slot">Drag a Pokémon here</div>`;
    box.innerHTML = html;
    restore();
    box.querySelectorAll(".bag-slot[data-uid]").forEach(el => {
      el.addEventListener("click", () => { if (Drag.justDropped) return; if (S.target) { applyItem(S.target, el.dataset.uid); return; } select({ kind: "pokemon", uid: el.dataset.uid }); });
      Drag.bind(el, () => ({ kind: "teamslot", uid: el.dataset.uid, img: animatedURL(entryCurrentSpecies(entryOf(el.dataset.uid))[0]) }));
    });
  }

  /* ---------- 拖放：滑鼠撳住移動；touch 長撳 0.3 秒先拎起（唔阻上下捲） ---------- */
  const Drag = (() => {
    let press = null, ghost = null, over = null;
    const api = { justDropped: false };
    api.bind = (el, payloadFn) => {
      /* 鍵盤：可拖嘅格仔要 Tab／方向鍵去到；Space 拎起（見下面 kbd carry） */
      el._dragPayload = payloadFn;
      if (!el.hasAttribute("tabindex")) el.tabIndex = 0;
      if (!el.hasAttribute("role") && el.tagName !== "BUTTON") el.setAttribute("role", "button");
      bindPointer(el, payloadFn);
    };
    const bindPointer = (el, payloadFn) => el.addEventListener("pointerdown", e => {
      if (e.button > 0 || e.target.closest("[data-fav]")) return;
      const payload = payloadFn(); if (!payload) return;
      press = { el, payload, x: e.clientX, y: e.clientY, id: e.pointerId, type: e.pointerType, started: false, timer: null };
      if (e.pointerType !== "mouse") press.timer = setTimeout(() => { if (press && !press.started) begin(press.x, press.y); }, 300);
    });
    function begin(x, y) {
      press.started = true; buzz();
      root.classList.add("dragging");
      press.el.classList.add("lifted");
      ghost = document.createElement("div"); ghost.className = "bag-ghost";
      ghost.innerHTML = press.payload.label ? `<span>${esc(press.payload.label)}</span>` : `<img src="${press.payload.img}" alt="">`;
      document.body.appendChild(ghost);
      mark(true); move(x, y);
    }
    function mark(on) {
      const k = press && press.payload.kind;
      root.querySelectorAll("[data-drop]").forEach(s => s.classList.remove("drop-ok", "drop-hot"));
      root.classList.toggle("removing", on && k === "teamslot");
      if (!on) return;
      const sel = k === "move" ? "[data-drop=mslot]" : k === "item" ? "[data-drop=slot][data-uid]" : "[data-drop=slot]";
      root.querySelectorAll(sel).forEach(s => s.classList.add("drop-ok"));
    }
    function targetAt(x, y) {
      const el = document.elementFromPoint(x, y); if (!el) return null;
      const k = press.payload.kind;
      if (k === "move") return el.closest("[data-drop=mslot]");
      if (k === "teamslot" && el.closest(".bag-mid")) return $("#bag-dropzone");
      if (k === "item") return el.closest("[data-drop=slot][data-uid]");
      return el.closest("[data-drop=slot]");
    }
    function move(x, y) {
      ghost.style.left = x + "px"; ghost.style.top = y + "px";
      const t = targetAt(x, y);
      if (t !== over) {
        if (over) over.classList.remove("drop-hot");
        over = t; if (over) over.classList.add("drop-hot");
        ghost.classList.toggle("over", !!over);
      }
    }
    function end(drop) {
      const p = press; press = null; if (!p) return;
      clearTimeout(p.timer);
      if (!p.started) return;
      api.justDropped = true; setTimeout(() => { api.justDropped = false; }, 60);
      const t = drop ? over : null;
      root.classList.remove("dragging");
      p.el.classList.remove("lifted");
      if (over) over.classList.remove("drop-hot"); over = null;
      press = p; mark(false); press = null;
      if (ghost) { ghost.remove(); ghost = null; }
      if (t) onDrop(p.payload, t);
    }
    /* 用 window capture：bag-root 為咗 Rule 60 截停 pointerup 冒泡，document 收唔到 */
    window.addEventListener("pointermove", e => {
      if (!press || e.pointerId !== press.id) return;
      if (!press.started) {
        if (Math.hypot(e.clientX - press.x, e.clientY - press.y) > 6) {
          if (press.type === "mouse") begin(e.clientX, e.clientY);
          else { clearTimeout(press.timer); press = null; }
        }
        return;
      }
      move(e.clientX, e.clientY);
    }, true);
    window.addEventListener("pointerup", e => { if (press && e.pointerId === press.id) end(true); }, true);
    window.addEventListener("pointercancel", e => { if (press && e.pointerId === press.id) end(false); }, true);
    document.addEventListener("touchmove", e => { if (press && press.started) e.preventDefault(); }, { passive: false });
    document.addEventListener("contextmenu", e => { if (press) e.preventDefault(); });
    /* ---------- 鍵盤版拖放（Rule 97）：Space 拎起 → 方向鍵揀目標 → Space／Enter 放低；
       隊伍成員拎起後 Delete 移出隊伍；Esc 取消（唔好關成個背包）。放低行同一個 onDrop ---------- */
    let carry = null;   /* { el, payload } */
    const dropSel = k => k === "move" ? "[data-drop=mslot]" : k === "item" ? "[data-drop=slot][data-uid]" : "[data-drop=slot]";
    function carryMark(on) {
      root.querySelectorAll("[data-kbd-drop]").forEach(t => {
        t.classList.remove("drop-ok");
        t.removeAttribute("data-kbd-drop");
        if (t.dataset.kbdTi === "1") { t.removeAttribute("tabindex"); delete t.dataset.kbdTi; }
      });
      root.classList.toggle("kbd-carry", on);
      root.classList.toggle("removing", on && carry && carry.payload.kind === "teamslot");
      if (!on) return;
      root.querySelectorAll(dropSel(carry.payload.kind)).forEach(t => {
        t.classList.add("drop-ok");
        t.setAttribute("data-kbd-drop", "");
        /* 空格仔本身唔可以聚焦：拎住嘢期間暫時俾方向鍵去到 */
        if (!t.hasAttribute("tabindex")) { t.tabIndex = -1; t.setAttribute("data-kbd-auto", ""); t.dataset.kbdTi = "1"; }
      });
    }
    function carryEnd() {
      if (!carry) return;
      carry.el.classList.remove("lifted");
      carryMark(false);
      carry = null;
    }
    api.carrying = () => !!carry;
    api.cancelCarry = carryEnd;
    document.addEventListener("keydown", e => {
      if (!root || !root.isConnected || getComputedStyle(root).display === "none") return;
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      const t = document.activeElement;
      if (!t || !root.contains(t) || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
      const k = e.key;
      if (carry) {
        if (k === "Escape") { e.preventDefault(); e.stopPropagation(); const el = carry.el; carryEnd(); toast("Cancelled"); if (el.isConnected) el.focus(); return; }
        if ((k === "Delete" || k === "Backspace") && carry.payload.kind === "teamslot") {
          e.preventDefault(); const p = carry.payload; carryEnd(); onDrop(p, $("#bag-dropzone")); return;
        }
        if (k === " " || k === "Enter") {
          e.preventDefault(); e.stopPropagation();
          if (e.repeat) return;
          const target = t.closest(dropSel(carry.payload.kind));
          if (!target || target === carry.el) { toast("Can't drop here — pick a highlighted slot (Esc to cancel)"); return; }
          const p = carry.payload; carryEnd();
          onDrop(p, target);
          return;
        }
        return;
      }
      if (k === " " && !e.repeat) {
        const src = t._dragPayload ? t : null;
        if (!src) return;
        const payload = src._dragPayload();
        if (!payload) return;
        e.preventDefault(); e.stopPropagation();
        carry = { el: src, payload };
        src.classList.add("lifted");
        carryMark(true);
        const what = payload.kind === "teamslot" ? "Move to another slot, or Delete to remove from team"
          : payload.kind === "move" ? "Move to a move slot" : payload.kind === "item" ? "Move to a Pokémon" : "Move to a team slot";
        toast(`Picked up — ${what}, then Space`);
      }
    }, true);

    function onDrop(pl, t) {
      if (pl.kind === "move") { ME.slot = Number(t.dataset.ms); learnMove(pl.name, ME.slot); return; }
      if (pl.kind === "item") { applyItem(pl.id, t.dataset.uid); return; }
      const team = getTeam();
      const name = uid => entryCurrentSpecies(entryOf(uid))[1];
      if (pl.kind === "pokemon") {
        const slot = Number(t.dataset.slot), cur = team.indexOf(pl.uid);
        if (cur >= 0) { const j = Math.min(slot, team.length - 1); [team[cur], team[j]] = [team[j], team[cur]]; toast(`${name(pl.uid)} moved to slot ${j + 1}`); }
        else if (slot < team.length) { const out = team[slot]; team[slot] = pl.uid; toast(`${name(pl.uid)} replaced ${name(out)}`); }
        else { team.push(pl.uid); toast(`${name(pl.uid)} joined your team`); }
      } else if (pl.kind === "teamslot") {
        const cur = team.indexOf(pl.uid);
        if (t.id === "bag-dropzone") { team.splice(cur, 1); toast(`${name(pl.uid)} left your team`); }
        else { const j = Math.min(Number(t.dataset.slot), team.length - 1); if (j !== cur) { [team[cur], team[j]] = [team[j], team[cur]]; } }
      }
      buzz(); saveTeam(team); renderTeam(); renderGrid(); if (S.sel) renderDetail();
    }
    return api;
  })();

  /* ---------- 選擇（只切 class，唔重建格仔） ---------- */
  function select(sel) {
    S.sel = sel; S.evPick = false; evPending.length = 0;
    root.querySelectorAll("#bag-grid .bag-cell, #bag-slots .bag-slot[data-uid]").forEach(c =>
      c.classList.toggle("sel", (!!sel.uid && c.dataset.uid === sel.uid) || (!!sel.id && c.dataset.id === sel.id) || (sel.bidx != null && c.dataset.uid === "bt-" + sel.bidx)));
    if (ME.uid && sel.kind === "pokemon") openMoveEditor(sel.uid);
    else if (ME.uid) closeMoveEditor();
    renderDetail(true);
  }

  /* ---------- 右欄 ---------- */
  function renderDetail(anim) {
    const d = $("#bag-detail");
    d.classList.remove("fade"); if (anim) { void d.offsetWidth; d.classList.add("fade"); }
    if (!S.sel) {
      d.innerHTML = S.battle
        ? `<div class="bag-note">${S.battle.mode === "switch" ? "Tap a Pokémon on the left, then Send out." : "Tap an item, then a Pokémon on the left — or drag the item onto it. Using an item ends your turn."}</div>`
        : `<div class="bag-note">Tap a Pokémon or an item to see details.<br><br>Hold and drag a Pokémon onto a team slot to build My Team. Double-tap a Pokémon to ♥ it.</div>`;
      return;
    }
    if (S.sel.kind === "bpoke") { renderBattleDetail(d); return; }
    if (S.sel.kind !== "pokemon") {
      const it = S.battle ? itemInfo(S.sel.id) : (S.sel.kind === "items" ? itemList() : heldList()).find(x => x.id === S.sel.id);
      if (!it) { d.innerHTML = ""; return; }
      d.innerHTML = `
        <div class="bag-item-big"><span class="bag-ib">${it.icon ? `<img src="${it.icon}" alt="">` : `<span class="bag-emoji big">${it.emoji}</span>`}</span>
          <div><div class="bag-dname">${esc(it.name)}</div><div class="bag-dsub">×${it.n} in bag</div></div></div>
        <div class="bag-desc">${esc(it.desc)}</div>
        ${it.berry ? `<div class="bag-kv"><span>Partner Care</span><b>+${it.berry.fullness}% fullness${it.berry.ev ? ` · ${STAT_FULL[it.berry.ev]} EV −10` : ""}</b></div>
          <div class="bag-kv"><span>Held in battle</span><b class="wrap">${esc(it.berry.held.replace(/^Held: /, ""))}</b></div>
          <div class="bag-kv"><span>Use in battle</span><b>${it.berry.battle ? "Yes — from the Bag" : "—"}</b></div>
          ${S.battle ? "" : `<div class="bag-kv"><span>Held by</span><b>${esc(loadState().entries.filter(x => x.heldItem === it.id).map(x => entryCurrentSpecies(x)[1]).join(", ") || "—")}</b></div>`}
          <div class="bag-note">Paralyzed, asleep or frozen Pokémon can't eat. Feeding when already full makes it throw up.</div>` : ""}
        ${it.cat === "medicine" ? `<div class="bag-note">Every medicine counts toward overdose — 3 within 1 minute poisons your Pokémon. Revival doesn't count.</div>` : ""}
        ${it.cat === "mega" ? `<div class="bag-kv"><span>Mega Evolves</span><b>${esc(speciesName(it.mega.dexId))} → ${esc(it.mega.formName)}</b></div>
          <div class="bag-kv"><span>Mega type</span><b>${it.mega.types.map(t => `<img src="${typeIconURL(t)}" alt="${t}" style="height:12px">`).join(" ")}</b></div>
          <div class="bag-kv"><span>Held by</span><b>${esc(loadState().entries.filter(x => x.heldItem === it.id).map(x => entryCurrentSpecies(x)[1]).join(", ") || "—")}</b></div>` : ""}
        ${it.cat === "stones" ? `<div class="bag-kv"><span>Can be held</span><b>No — use it to evolve</b></div>` : ""}
        <div class="bag-note">${S.battle ? "Tip: drag it onto a Pokémon on the left, or tap Use then tap a Pokémon. Using an item ends your turn." : `Tip: drag it onto a Pokémon in My Team, or tap ${verbOf(it)} then tap a Pokémon.`}</div>
        <div class="bag-actions">${it.berry && !S.battle ? `<button type="button" class="bag-btn alt" id="bag-btn-hold" ${it.n <= 0 ? "disabled" : ""}>Hold</button>` : ""}<button type="button" class="bag-btn" id="bag-btn-use" ${it.n <= 0 || it.usable === false ? "disabled" : ""}>${S.battle ? "Use" : verbOf(it)}</button></div>`;
      $("#bag-btn-use").addEventListener("click", () => startTarget(it.id));
      const hb = $("#bag-btn-hold"); if (hb) hb.addEventListener("click", () => startTarget(it.id, "hold"));
      return;
    }
    const e = entryOf(S.sel.uid);
    if (!e) { d.innerHTML = ""; return; }
    const c = entryCurrentSpecies(e);
    const p = careP(e);
    const hp = window.Care ? Care.hpOf(e) : { cur: 0, max: 0, pct: 0, faint: false };
    const key = statusOf(e);
    const stats = calcStats(c[0], e.level || 1, e.ivs, e.evs, e.nature) || {};
    const nat = natureInfo(e.nature);
    const evs = e.evs || {};
    const evTotal = STAT_KEYS.reduce((a, k) => a + (evs[k] || 0), 0);
    const team = getTeam(), inTeam = team.includes(e.uid);
    const pool = evPool();
    const hpCls = hp.faint ? "faint" : hp.pct < 20 ? "low" : hp.pct <= 50 ? "mid" : "";
    d.innerHTML = `
      <div class="bag-dhead">
        <img class="bag-dspr" src="${animatedURL(c[0])}" alt="" style="${hp.faint ? "filter:grayscale(1) opacity(.6)" : ""}">
        <div class="bag-dtitle">
          <div class="bag-dname">${esc(c[1])} <button type="button" class="bag-heart big ${e.favorite ? "on" : ""}" id="bag-dheart" aria-label="Favorite">${HEART}</button></div>
          <div class="bag-lvrow"><span class="bag-lv">Lv.<b>${e.level || 1}</b></span><span class="bag-dsub">No.${String(c[0]).padStart(3, "0")}${e.uid === loadState().activeUid ? " · Partner" : ""}</span></div>
          <div class="bag-types">${typesOf(c[0]).map(t => `<img src="${typeIconURL(t)}" alt="${t}">`).join("")}${key ? `<img class="bag-stimg" src="assets/battle/ui/status-${Care.STATUS_INFO[key].icon}.png" alt="">` : ""}</div>
        </div>
      </div>
      <div class="bag-bars">
        <div class="bag-bar-row"><span>HP</span><div class="bag-bar hp ${hpCls}"><i style="width:${hp.pct}%"></i></div><span class="v">${hp.max ? `${hp.cur}/${hp.max}` : "—"}</span></div>
        <div class="bag-bar-row"><span>FULLNESS</span><div class="bag-bar full"><i style="width:${Math.max(0, p.health || 0)}%"></i></div><span class="v">${Math.max(0, p.health || 0)}/100</span></div>
      </div>
      ${S.evPick ? evPanelHTML(e, evTotal, pool) : `
      <div class="bag-sec"><span>Stats</span><span>EV ${evTotal}/510</span></div>
      <div class="bag-stats">${STAT_KEYS.map(k => `
        <div class="bag-srow ${nat.plus === k ? "plus" : nat.minus === k ? "minus" : ""}">
          <span class="k">${STAT_LABELS[k]}${nat.plus === k ? " ▲" : nat.minus === k ? " ▼" : ""}</span><span class="val">${stats[k] || "-"}</span>
          <span class="sb"><i style="width:${Math.min(100, (stats[k] || 0) / 2)}%"></i></span><span class="ev">${evs[k] || 0}</span>
        </div>`).join("")}</div>`}
      <div class="bag-sec"><span>Moves</span><span class="bag-catleg">${["physical", "special", "status"].map(k => { const ci = damageClassInfo(k); return `<i style="color:${ci.color}">${ci.icon}</i>${ci.label}`; }).join("")}</span></div>
      <div class="bag-moves">${(e.moves || []).map(slug => moveRowHTML(slug)).join("") || `<div class="bag-note">No moves yet</div>`}</div>
      <div class="bag-kv"><span>Nature</span><b>${esc(e.nature || "—")}</b></div>
      <div class="bag-kv"><span>Ability</span><b>${esc(typeof abilityName === "function" && e.ability ? abilityName(e.ability) : "—")}</b></div>
      <div class="bag-kv"><span>Held item</span>${e.heldItem ? `<b class="bag-heldrow"><img src="${heldSprite(e.heldItem)}" alt="">${esc(heldName(e.heldItem))} <button type="button" id="bag-unheld">Remove</button></b>` : "<b>None</b>"}</div>
      <div class="bag-actions">
        <button type="button" class="bag-btn alt" id="bag-btn-moves">Moves</button>
        <button type="button" class="bag-btn alt ${S.evPick ? "on" : ""}" id="bag-btn-ev" ${pool <= 0 && !S.evPick ? "disabled" : ""}>${S.evPick ? "Done" : `EV ×${pool}`}</button>
        <button type="button" class="bag-btn" id="bag-btn-team">${inTeam ? "Leave team" : "Join team"}</button>
        <button type="button" class="bag-btn alt bag-oakbtn" id="bag-btn-oak" title="Send to Prof. Oak" aria-label="Send to Prof. Oak">⇪</button>
      </div>`;
    const unh = $("#bag-unheld"); if (unh) unh.addEventListener("click", () => takeHeld(e.uid));
    $("#bag-btn-oak").addEventListener("click", () => openOak(e.uid));
    $("#bag-dheart").addEventListener("click", () => toggleFav(e.uid, root.querySelector(`#bag-grid [data-uid="${e.uid}"]`)));
    $("#bag-btn-moves").addEventListener("click", () => { flushEv(); S.evPick = false; openMoveEditor(e.uid); });
    $("#bag-btn-ev").addEventListener("click", () => { if (S.evPick) flushEv(); S.evPick = !S.evPick; evPending.length = 0; renderDetail(); });
    $("#bag-btn-team").addEventListener("click", () => {
      const t = getTeam();
      if (inTeam) { t.splice(t.indexOf(e.uid), 1); toast(`${c[1]} left your team`); }
      else if (t.length >= 6) { toast("Your team is full — drag onto a slot to replace"); return; }
      else { t.push(e.uid); toast(faintOf(e) ? `${c[1]} joined — it can't battle until revived` : `${c[1]} joined your team`); }
      saveTeam(t); renderTeam(); renderGrid(); renderDetail();
    });
    if (S.evPick) bindEvPanel(e);
  }
  function renderBattleDetail(d) {
    const p = S.battle.team().find(x => x.idx === S.sel.bidx); if (!p) { d.innerHTML = ""; return; }
    const pct = p.maxHp ? Math.max(0, p.hp) / p.maxHp * 100 : 0;
    const cls = p.fainted ? "faint" : pct < 20 ? "low" : pct <= 50 ? "mid" : "";
    const ic = p.fainted ? "fnt" : (p.status === "poison" && p.severe) ? "tox" : B_ICON[p.status];
    const canSwitch = S.battle.mode === "switch" && !p.active && !p.fainted;
    d.innerHTML = `
      <div class="bag-dhead"><img class="bag-dspr" src="${animatedURL(p.dexId)}" alt="" style="${p.fainted ? "filter:grayscale(1) opacity(.6)" : ""}">
        <div class="bag-dtitle"><div class="bag-dname">${esc(p.name)}</div>
          <div class="bag-lvrow"><span class="bag-lv">Lv.<b>${p.level}</b></span>${p.active ? `<span class="bag-dsub">In battle</span>` : ""}</div>
          <div class="bag-types">${typesOf(p.dexId).map(t => `<img src="${typeIconURL(t)}" alt="${t}">`).join("")}${ic ? `<img class="bag-stimg" src="assets/battle/ui/status-${ic}.png" alt="">` : ""}</div></div></div>
      <div class="bag-bars"><div class="bag-bar-row"><span>HP</span><div class="bag-bar hp ${cls}"><i style="width:${pct}%"></i></div><span class="v">${Math.max(0, p.hp)}/${p.maxHp}</span></div></div>
      <div class="bag-sec"><span>Moves</span><span>PP</span></div>
      <div class="bag-moves">${(p.moves || []).map(m => { const mi = moveInfo(m.slug); const ci = damageClassInfo(mi.damage_class);
        return `<div class="bag-move" style="--tc:${typeColor(mi.type)}"><span class="mcat" style="background:${ci.color}">${ci.icon}</span><span class="mname">${esc(m.name)}</span><span class="mpow">${mi.power == null ? "—" : mi.power}</span><span class="pp">${m.pp}/${m.maxPp}</span></div>`; }).join("")}</div>
      ${S.battle.mode === "switch" ? `<div class="bag-actions"><button type="button" class="bag-btn" id="bag-btn-switch" ${canSwitch ? "" : "disabled"}>${p.active ? "Already in battle" : p.fainted ? "Fainted — can't battle" : `Send out ${esc(p.name)}`}</button></div>` : ""}`;
    const sw = $("#bag-btn-switch");
    if (sw) sw.addEventListener("click", () => { const ctx = S.battle; hideBattleBag(); ctx.onSwitch(p.idx); });
  }

  /* ---------- 戰鬥中開背包／換 Pokémon（背包第 4a 段） ---------- */
  function openBattle(ctx) {
    if (!root) build();
    S.battle = ctx; S.from = "battle"; S.sel = null; S.evPick = false; S.target = null;
    S.tab = ctx.mode === "switch" ? "pokemon" : "items";
    root.classList.add("show", "in-battle");
    root.classList.toggle("switching", ctx.mode === "switch");
    $("#bag-home-lbl").textContent = "BATTLE";
    $("#bag-team-title").textContent = "Battle team";
    $("#bag-team-hint").textContent = ctx.mode === "switch" ? "tap to pick" : "drop items here";
    $("#bag-banner").classList.remove("show");
    fillBezel(); fit();
    renderTabInd(); renderChips(); renderGrid("in-f"); renderBattleTeam();
    const act = ctx.team().find(x => x.active);
    if (ctx.mode === "switch" && act) select({ kind: "bpoke", bidx: act.idx });
    else renderDetail();
  }
  function hideBattleBag() {
    cancelTarget();
    root.classList.remove("show", "in-battle", "switching");
    S.battle = null; S.sel = null;
  }

  function moveRowHTML(slug) {
    const m = moveInfo(slug); const ci = damageClassInfo(m.damage_class);
    return `<div class="bag-move" style="--tc:${typeColor(m.type)}" title="${esc(m.type)} · ${ci.label}"><span class="mcat" style="background:${ci.color}">${ci.icon}</span><span class="mname">${esc(m.name)}</span><span class="mpow">${m.power == null ? "—" : m.power}</span><span class="pp">${m.pp == null ? "—" : m.pp}</span></div>`;
  }

  /* ---------- EV 加點：6 個大格；撳 +1、撳住連加；Undo（只限未上雲嘅） ---------- */
  const evPending = [];   /* 未送出嘅 +1：[stat]，Done／停手 1.2 秒先送 server */
  let evFlushTimer = null;
  function evPanelHTML(e, evTotal, pool) {
    const evs = e.evs || {};
    return `<div class="bag-sec"><span>Add EV</span><span class="bag-evhead">Units ×${pool} · EV ${evTotal}/510</span></div>
      <div class="bag-evgrid">${STAT_KEYS.map(k => `
        <button type="button" class="bag-evtile" data-ev="${k}" ${pool > 0 && (evs[k] || 0) < 252 && evTotal < 510 ? "" : "disabled"}>
          <span class="k">${STAT_FULL[k]}</span><span class="v">${evs[k] || 0}<small>/252</small></span>
          <span class="bar"><i style="width:${(evs[k] || 0) / 252 * 100}%"></i></span><span class="plus">+1</span>
        </button>`).join("")}</div>
      <div class="bag-evtools"><span>Tap = +1 · Hold = keep adding</span><button type="button" id="bag-ev-undo" ${evPending.length ? "" : "disabled"}>Undo</button></div>`;
  }
  /* 本地：由目標自己先扣，唔夠再由點數多嘅 entry 扣（同 alloc_ev_shared 一致） */
  function takeUnits(st, targetUid, n) {
    const order = st.entries.filter(x => (x.evPoints || 0) > 0).sort((a, b) => (b.uid === targetUid) - (a.uid === targetUid) || (b.evPoints || 0) - (a.evPoints || 0));
    let left = n;
    for (const x of order) { if (left <= 0) break; const t = Math.min(x.evPoints, left); x.evPoints -= t; left -= t; }
    return n - left;
  }
  function giveUnits(st, targetUid, n) { const e = st.entries.find(x => x.uid === targetUid); if (e) e.evPoints = (e.evPoints || 0) + n; }
  function bindEvPanel(e) {
    const d = $("#bag-detail");
    const add = k => {
      const st = loadState(); const x = st.entries.find(y => y.uid === e.uid); if (!x) return false;
      x.evs = x.evs || {};
      const total = STAT_KEYS.reduce((a, s) => a + (x.evs[s] || 0), 0);
      if ((x.evs[k] || 0) >= 252 || total >= 510 || evPool() <= 0) return false;
      if (takeUnits(st, x.uid, 1) < 1) return false;
      x.evs[k] = (x.evs[k] || 0) + 1;
      saveState(); evPending.push(k); scheduleFlush(e.uid);
      return true;
    };
    const refresh = k => {
      const x = entryOf(e.uid); const evs = x.evs || {};
      const total = STAT_KEYS.reduce((a, s) => a + (evs[s] || 0), 0); const pool = evPool();
      d.querySelectorAll(".bag-evtile").forEach(t => {
        const s = t.dataset.ev;
        t.querySelector(".v").innerHTML = `${evs[s] || 0}<small>/252</small>`;
        t.querySelector(".bar i").style.width = ((evs[s] || 0) / 252 * 100) + "%";
        t.disabled = !(pool > 0 && (evs[s] || 0) < 252 && total < 510);
      });
      const h = d.querySelector(".bag-evhead"); if (h) h.textContent = `Units ×${pool} · EV ${total}/510`;
      const u = $("#bag-ev-undo"); if (u) u.disabled = !evPending.length;
      const b = $("#bag-btn-ev"); if (b) b.textContent = "Done";
      const t = d.querySelector(`.bag-evtile[data-ev="${k}"]`); if (t) { t.classList.remove("bump"); void t.offsetWidth; t.classList.add("bump"); }
    };
    d.querySelectorAll(".bag-evtile").forEach(btn => {
      const k = btn.dataset.ev; let hold = null, rep = null, fired = false;
      const stop = () => { clearTimeout(hold); clearInterval(rep); hold = rep = null; };
      btn.addEventListener("pointerdown", () => {
        if (btn.disabled) return; fired = false;
        hold = setTimeout(() => { fired = true; rep = setInterval(() => { if (!add(k)) { stop(); } refresh(k); buzz(); }, 90); }, 380);
      });
      ["pointerup", "pointerleave", "pointercancel"].forEach(t => btn.addEventListener(t, stop));
      btn.addEventListener("click", () => { if (fired) return; if (add(k)) { buzz(); refresh(k); } });
    });
    const u = $("#bag-ev-undo");
    if (u) u.addEventListener("click", () => {
      const k = evPending.pop(); if (!k) return;
      const st = loadState(); const x = st.entries.find(y => y.uid === e.uid);
      x.evs[k] = Math.max(0, (x.evs[k] || 0) - 1); giveUnits(st, x.uid, 1); saveState(); refresh(k);
    });
  }
  function scheduleFlush(uid) { clearTimeout(evFlushTimer); evFlushTimer = setTimeout(() => flushEv(uid), 1200); }
  /* 送 server：按能力值合併成一次 alloc_ev_shared(n)；送出後就唔可以 Undo */
  async function flushEv(uidArg) {
    clearTimeout(evFlushTimer);
    const uid = uidArg || (S.sel && S.sel.uid);
    if (!evPending.length || !uid) { evPending.length = 0; return; }
    const counts = {}; evPending.forEach(k => { counts[k] = (counts[k] || 0) + 1; });
    evPending.length = 0;
    const u = root && root.querySelector("#bag-ev-undo"); if (u) u.disabled = true;
    if (!online() || !SupabaseAuth.allocEvShared) return;
    for (const k of Object.keys(counts)) {
      const res = await SupabaseAuth.allocEvShared(uid, k, counts[k]);
      if (res && res.ok) {
        const st = loadState(); const x = st.entries.find(y => y.uid === uid);
        if (x && res.evs) x.evs = res.evs;
        if (res.points) st.entries.forEach(y => { if (res.points[y.uid] != null) y.evPoints = Number(res.points[y.uid]) || 0; });
        saveState();
      } else console.warn("[Bag] alloc_ev_shared failed", res);
    }
  }

  /* ---------- 換招頁：蓋住中欄 + 右欄；揀格 → 揀新招 → Learn；或者拖去格仔 ---------- */
  const ME = { uid: null, slot: 0, pick: null, cat: "all" };
  function openMoveEditor(uid) {
    const e = entryOf(uid); if (!e) return;
    ME.uid = uid; ME.slot = 0; ME.pick = null; ME.cat = "all";
    const c = entryCurrentSpecies(e);
    const ov = $("#bag-me");
    ov.innerHTML = `
      <div class="me-head">
        <button type="button" class="me-back" id="me-back" aria-label="Back">‹</button>
        <img src="${animatedURL(c[0])}" alt="">
        <div class="me-title"><b>${esc(c[1])}</b> <span class="bag-lv">Lv.<b>${e.level || 1}</b></span>
          <div class="bag-types">${typesOf(c[0]).map(t => `<img src="${typeIconURL(t)}" alt="${t}">`).join("")}</div></div>
        <div class="me-steps"><span id="me-st2">① Pick a slot · ② Pick a new move</span><span id="me-st3">③ Learn</span></div>
        <button type="button" class="bag-btn" id="me-done">Done</button>
      </div>
      <div class="me-body">
        <section class="me-col"><div class="bag-sec"><span>Current moves</span><span>${(e.moves || []).length}/4</span></div>
          <div class="me-slots" id="me-slots"></div>
          <div class="bag-note">Tip: drag a move from the right onto a slot to swap it in.</div></section>
        <section class="me-col"><div class="bag-sec"><span>Can learn</span><span class="me-cats" id="me-cats"></span></div>
          <div class="me-list" id="me-list"></div>
          <div class="me-compare" id="me-compare"></div></section>
      </div>`;
    ov.classList.add("show");
    $("#me-back").addEventListener("click", closeMoveEditor);
    $("#me-done").addEventListener("click", closeMoveEditor);
    meSlots(); meCats(); meList(); meCompare(); meSteps();
  }
  function closeMoveEditor() { if (!root) return; $("#bag-me").classList.remove("show"); ME.uid = null; renderDetail(true); }
  function moveCard(slug, opts) {
    const m = moveInfo(slug); const ci = damageClassInfo(m.damage_class);
    return `<div class="me-card ${opts.cls || ""}" ${opts.attr || ""} style="--tc:${typeColor(m.type)}">
      <div class="top"><span class="mcat" style="background:${ci.color}" title="${ci.label}">${ci.icon}</span><b>${esc(m.name)}</b><img src="${typeIconURL(m.type)}" alt="${esc(m.type)}"></div>
      <div class="st"><span>${ci.label}</span><span>Pow <b>${m.power == null ? "—" : m.power}</b></span><span>Acc <b>${m.accuracy == null ? "—" : m.accuracy}</b></span><span>PP <b>${m.pp == null ? "—" : m.pp}</b></span>${m.priority ? `<span>Pri <b>${m.priority > 0 ? "+" : ""}${m.priority}</b></span>` : ""}</div>
      ${opts.desc && m.desc ? `<div class="ds">${esc(m.desc)}</div>` : ""}
    </div>`;
  }
  function meSlots() {
    const e = entryOf(ME.uid);
    $("#me-slots").innerHTML = (e.moves || []).map((s, i) => moveCard(s, { cls: `slot ${ME.slot === i ? "picked" : ""}`, attr: `data-ms="${i}" data-drop="mslot"`, desc: true })).join("");
    $("#me-slots").querySelectorAll("[data-ms]").forEach(el => el.addEventListener("click", () => {
      ME.slot = Number(el.dataset.ms);
      $("#me-slots").querySelectorAll("[data-ms]").forEach(x => x.classList.toggle("picked", x === el));
      meCompare();
    }));
  }
  function meCats() {
    const opts = [["all", "All"], ["physical", "Physical"], ["special", "Special"], ["status", "Status"]];
    $("#me-cats").innerHTML = opts.map(([v, l]) => `<button type="button" class="bag-chip mini ${ME.cat === v ? "on" : ""}" data-cat="${v}">${l}</button>`).join("");
    $("#me-cats").querySelectorAll("[data-cat]").forEach(b => b.addEventListener("click", () => { ME.cat = b.dataset.cat; meCats(); meList(); }));
  }
  function meList() {
    const e = entryOf(ME.uid);
    const pool = (Array.isArray(e.knownMoves) && e.knownMoves.length) ? e.knownMoves : (e.moves || []);
    const learn = pool.filter(s => !(e.moves || []).includes(s) && (ME.cat === "all" || moveInfo(s).damage_class === ME.cat));
    const box = $("#me-list");
    box.innerHTML = learn.length ? learn.map(s => moveCard(s, { cls: `learn ${ME.pick === s ? "picked" : ""}`, attr: `data-learn="${esc(s)}"` })).join("")
      : `<div class="bag-note">No other moves yet — level up to learn more.</div>`;
    box.querySelectorAll("[data-learn]").forEach(el => {
      el.addEventListener("click", () => {
        if (Drag.justDropped) return;
        ME.pick = el.dataset.learn;
        box.querySelectorAll("[data-learn]").forEach(x => x.classList.toggle("picked", x === el));
        meCompare(); meSteps();
      });
      Drag.bind(el, () => ({ kind: "move", name: el.dataset.learn, label: moveInfo(el.dataset.learn).name }));
    });
  }
  function meCompare() {
    const e = entryOf(ME.uid); const box = $("#me-compare");
    const oldS = (e.moves || [])[ME.slot];
    if (!ME.pick || !oldS) { box.innerHTML = `<div class="me-cmp-empty">Tap a move above to compare it with <b>${esc(oldS ? moveInfo(oldS).name : "—")}</b>.</div>`; return; }
    const a = moveInfo(oldS), b = moveInfo(ME.pick);
    const diff = (x, y) => (x == null || y == null) ? "" : (y - x) === 0 ? `<em class="same">±0</em>` : `<em class="${y > x ? "up" : "down"}">${y > x ? "+" : ""}${y - x}</em>`;
    box.innerHTML = `
      <div class="me-cmp-desc"><b>${esc(b.name)}</b> — ${esc(b.desc || "")}</div>
      <div class="me-cmp-grid"><span></span><span>Pow</span><span>Acc</span><span>PP</span>
        <span class="old">${esc(a.name)}</span><span>${a.power ?? "—"}</span><span>${a.accuracy ?? "—"}</span><span>${a.pp ?? "—"}</span>
        <span class="new">${esc(b.name)}</span><span>${b.power ?? "—"} ${diff(a.power, b.power)}</span><span>${b.accuracy ?? "—"} ${diff(a.accuracy, b.accuracy)}</span><span>${b.pp ?? "—"} ${diff(a.pp, b.pp)}</span></div>
      <button type="button" class="bag-btn" id="me-learn">Learn ${esc(b.name)} — replace ${esc(a.name)}</button>`;
    $("#me-learn").addEventListener("click", () => learnMove(ME.pick, ME.slot));
  }
  function learnMove(slug, i) {
    const e = entryOf(ME.uid); if (!e) return;
    const moves = (e.moves || []).slice(); const old = moves[i];
    if (!old) return;
    moves[i] = slug;
    const res = setEntryMoves(e, moves);   /* 本地 + move_loadout 上雲 */
    if (!res || !res.ok) { toast((res && res.msg) || "Couldn't change moves"); return; }
    ME.pick = null; buzz();
    toast(`${entryCurrentSpecies(e)[1]} forgot ${moveInfo(old).name} and learned ${moveInfo(slug).name}!`);
    meSlots(); meList(); meCompare(); meSteps();
    const card = $("#me-slots").querySelector(`[data-ms="${i}"]`); if (card) card.classList.add("swapped");
  }
  function meSteps() {
    const a = $("#me-st2"), b = $("#me-st3"); if (!a) return;
    a.classList.toggle("on", !ME.pick); b.classList.toggle("on", !!ME.pick);
  }

  /* =====================================================================
     第 3a 段：用道具・攜帶進化石・送回大木博士
     ===================================================================== */
  const isBerryId = k => !!(window.Care && Care.isBerry && Care.isBerry(k));
  const isMegaId = k => !!(window.Care && Care.isMega && Care.isMega(k));
  /* 樹果／Mega 石：經 hold_item RPC（server 管數量）；進化石：client 直寫 */
  const isRpcHeld = k => isBerryId(k) || isMegaId(k);
  const heldSprite = k => (window.Care ? Care.ITEM_SPRITE(isBerryId(k) ? Care.BERRIES[k].sprite : (typeof STONE_KINDS !== "undefined" && STONE_KINDS.includes(k)) ? k + "-stone" : k) : "");
  const heldName = k => (isBerryId(k) ? Care.BERRIES[k].name : null) || (isMegaId(k) ? MEGA_STONES[k].stoneName : null) || (typeof STONE_LABELS !== "undefined" && STONE_LABELS[k]) || k;
  const itemInfo = id => (S.battle ? S.battle.items() : itemList().concat(heldList())).find(x => x.id === id);
  function verbOf(it) { return it.cat === "mega" ? "Give" : it.cat === "stones" ? "Use" : (it.cat === "food" || it.cat === "berries") ? "Feed" : "Use"; }

  /* 用道具模式：撳 Use → 跳去 Pokémon tab → 撳目標（或者撳左欄隊伍） */
  function startTarget(id, mode) {
    const it = itemInfo(id); if (!it || it.n <= 0) return;
    S.target = id; S.targetMode = mode || null;
    if (!S.battle && S.tab !== "pokemon") { S.tab = "pokemon"; renderTabInd(); renderChips(); renderGrid("in-r"); }
    $("#bag-banner-t").textContent = S.battle ? `${it.name}: tap a Pokémon on the left` : `${mode === "hold" ? "Hold" : verbOf(it)} ${it.name}: tap a Pokémon`;
    $("#bag-banner").classList.add("show");
    root.classList.add("targeting");
  }
  function cancelTarget() {
    S.target = null; S.targetMode = null;
    if (!root) return;
    $("#bag-banner").classList.remove("show");
    root.classList.remove("targeting");
  }
  function refreshAll() { renderTeam(); renderGrid(); renderDetail(true); if (window.App && App.renderHome) App.renderHome(); }

  async function applyItem(id, uid) {
    const hold = S.targetMode === "hold";
    cancelTarget();
    if (S.battle) {
      const idx = Number(String(uid).replace("bt-", ""));
      const why = S.battle.canUse(id, idx);
      if (why !== true) { toast(why || "It won't have any effect."); return; }
      const ctx = S.battle; hideBattleBag(); ctx.onUseItem(id, idx);
      return;
    }
    const e = entryOf(uid); if (!e) return;
    if (typeof STONE_KINDS !== "undefined" && STONE_KINDS.includes(id)) { giveStone(id, uid); return; }
    if (hold || isMegaId(id)) { holdBerry(id, uid); return; }
    if (applyItem.busy) return;
    applyItem.busy = true;
    const name = entryCurrentSpecies(e)[1];
    const it = itemInfo(id) || { name: id };
    const feeding = id === "food" || id === "premium" || (Care.isBerry && Care.isBerry(id));
    const out = feeding ? await Care.feed(e, id) : await Care.use(e, id);
    applyItem.busy = false;
    const cut = out && (out.ev_cut || out.evCut);
    if (out && out.ok) toast(Care.eventText(out.event, name, it.name) + (cut ? ` (${STAT_FULL[Care.BERRIES[id].ev]} EV −${cut})` : ""));
    else toast(Care.REASON_TEXT[out && out.reason] || "Can't use that now");
    buzz();
    S.sel = { kind: "pokemon", uid };
    refreshAll();
  }

  /* 攜帶樹果（第 4b 段）：戰鬥中自動觸發、食完消失；原本攜帶嘅道具退返背包 */
  async function holdBerry(id, uid) {
    const e = entryOf(uid); if (!e || holdBerry.busy) return;
    holdBerry.busy = true;
    const res = await Care.holdItem(e, id);
    holdBerry.busy = false;
    if (!res || !res.ok) { toast({ none: "No berry left", not_found: "Pokémon not found", bad_item: "That can't be held" }[res && res.reason] || "Couldn't hold it — try again"); return; }
    buzz();
    toast(`${entryCurrentSpecies(e)[1]} is now holding the ${heldName(id)}${res.prev ? ` (${heldName(res.prev)} went back to the bag)` : ""}`);
    S.sel = { kind: "pokemon", uid };
    refreshAll();
  }

  /* 進化石（第 5 項，跟原作）：啱條件即刻進化（石用完）；唔啱 = 冇效果，石唔會被攜帶。攜帶道具唔受影響 */
  async function giveStone(stone, uid) {
    const e = entryOf(uid); if (!e) return;
    const chk = canStoneEvolve(e, stone);
    if (!chk.ok) { toast("It won't have any effect."); return; }
    if (giveStone.busy) return;
    giveStone.busy = true;
    /* 登入：use_stone RPC 扣石 + 記 stone_used／branch（migration 20261106）；未登入本地扣 */
    const res = await Care.useStone(e, stone);
    giveStone.busy = false;
    if (!res.ok) { toast(res.msg); return; }
    /* 進化動畫：暫時收埋背包，播完再開返 */
    root.classList.remove("show");
    const reopen = () => { root.classList.add("show"); S.sel = { kind: "pokemon", uid: e.uid }; refreshAll(); };
    if (window.App && App.showEvolveModal) App.showEvolveModal(res.evolvedTo, reopen, res.evolvedFrom);
    else reopen();
  }
  /* 舊存檔（未登入）：攜帶緊進化石（B 方案）→ 退返背包。登入用戶由 migration 20261105k 喺 server 退，
     唔好喺本地再加一次（會重複） */
  function returnHeldStones() {
    if (typeof STONE_KINDS === "undefined" || !window.Pet) return;
    if (online()) return;   /* Sync.isEnabled() 未登入都係 true，要用登入狀態 */
    const st = loadState(); let n = 0;
    (st.entries || []).forEach(x => {
      if (x.heldItem && STONE_KINDS.includes(x.heldItem)) { Pet.addItem(x.heldItem, 1); x.heldItem = null; n++; }
    });
    if (n) saveState();
  }
  async function takeHeld(uid) {
    const st = loadState(); const x = st.entries.find(y => y.uid === uid);
    if (!x || !x.heldItem) return;
    if (isRpcHeld(x.heldItem)) {
      const k = x.heldItem;
      const r = await Care.holdItem(x, null);
      if (!r || !r.ok) { toast("Couldn't take it back — try again"); return; }
      toast(`Took the ${heldName(k)} back`);
      refreshAll();
      return;
    }
    /* 舊版攜帶進化石：登入用戶 server 已經退咗（migration 20261105k），本地只清走；未登入先加返背包 */
    const k = x.heldItem; x.heldItem = null; saveState();
    if (!online()) Pet.addItem(k, 1);
    toast(`Took the ${heldName(k)} back`);
    refreshAll();
  }

  /* 送回大木博士：退還佢身上用咗嘅 EV + 額外 1 個 EV Point Unit；攜帶道具退返；圖鑑保留。撳住 1 秒確認 */
  function openOak(uid) {
    const e = entryOf(uid); if (!e) return;
    const c = entryCurrentSpecies(e); const st = loadState();
    const evUsed = STAT_KEYS.reduce((a, k) => a + ((e.evs || {})[k] || 0), 0);
    const block = st.activeUid === uid ? "This is your Partner — pick another Partner in Partner Care first."
      : st.entries.length <= 1 ? "You can't send away your last Pokémon." : "";
    const ov = $("#bag-oakov");
    ov.innerHTML = `<div class="bag-modal">
      <div class="bag-oakhead"><img src="${animatedURL(c[0])}" alt=""><div><b>Send ${esc(c[1])} to Prof. Oak?</b>
        <div class="bag-dsub">Lv.${e.level || 1} · No.${String(c[0]).padStart(3, "0")}${getTeam().includes(uid) ? " · leaves your team" : ""}</div></div></div>
      <div class="bag-kv"><span>EV Point Units used on it</span><b>${evUsed}</b></div>
      <div class="bag-kv"><span>Thank-you bonus</span><b>+1</b></div>
      <div class="bag-kv total"><span>You get back</span><b>${evUsed + 1} EV Point Units</b></div>
      ${e.heldItem ? `<div class="bag-kv"><span>Held item returns to the bag</span><b>${esc(heldName(e.heldItem))}</b></div>` : ""}
      <div class="bag-kv"><span>Pokédex</span><b>Stays caught</b></div>
      ${block ? `<div class="bag-note warn">${block}</div>` : `<div class="bag-note">This can't be undone.</div>`}
      <div class="bag-modal-a"><button type="button" class="bag-btn alt" id="bag-oak-cancel">Cancel</button>
        <button type="button" class="bag-btn hold" id="bag-oak-go" ${block ? "disabled" : ""}><span class="fill"></span><span class="t">Hold to send</span></button></div></div>`;
    ov.classList.add("show");
    ov.onclick = ev => { if (ev.target === ov) ov.classList.remove("show"); };
    $("#bag-oak-cancel").addEventListener("click", () => ov.classList.remove("show"));
    if (block) return;
    const go = $("#bag-oak-go"); let t = null;
    const stop = () => { go.classList.remove("holding"); clearTimeout(t); };
    go.addEventListener("pointerdown", () => { go.classList.add("holding"); t = setTimeout(() => { stop(); sendToOak(uid); }, 1000); });
    ["pointerup", "pointerleave", "pointercancel"].forEach(x => go.addEventListener(x, stop));
  }
  async function sendToOak(uid) {
    $("#bag-oakov").classList.remove("show");
    const e = entryOf(uid); if (!e) return;
    const name = entryCurrentSpecies(e)[1];
    const evUsed = STAT_KEYS.reduce((a, k) => a + ((e.evs || {})[k] || 0), 0);
    let res = null;
    if (online() && SupabaseAuth.releaseToOak) {
      res = await SupabaseAuth.releaseToOak(uid);
      if (!res || !res.ok) {
        toast({ partner: "You can't send away your Partner", last: "You can't send away your last Pokémon", not_found: "Pokémon not found" }[res && res.reason] || "Couldn't reach Prof. Oak — try again");
        return;
      }
    }
    const st = loadState();
    const idx = st.entries.findIndex(x => x.uid === uid); if (idx < 0) return;
    const ent = st.entries[idx];
    const others = st.entries.filter(x => x.uid !== uid);
    const recipient = (res && res.recipient) || (st.activeUid && st.activeUid !== uid ? st.activeUid : others[0].uid);
    const refund = res ? Number(res.refund) : evUsed + 1;
    /* 佢身上未用嘅點屬於共用池 → 一齊搬去收件 entry（同 release_to_oak 一致） */
    const kept = Math.max(0, ent.evPoints || 0);
    const rec = st.entries.find(x => x.uid === recipient); if (rec) rec.evPoints = (rec.evPoints || 0) + refund + kept;
    const held = ent.heldItem;
    const caught = new Set((st.dexCaught || []).map(Number));
    (res && Array.isArray(res.dex_caught) ? res.dex_caught : (ent.ownedSpecies || [])).forEach(id => caught.add(Number(id)));
    st.dexCaught = [...caught];
    st.entries.splice(idx, 1);
    st.myTeam = (st.myTeam || []).filter(u => u !== uid);
    if (st.moveLoadouts) delete st.moveLoadouts[uid];
    saveState();
    /* server 已退道具；本地跟住加（樹果 → 樹果袋；進化石 → items） */
    if (held) { if (isBerryId(held)) Care.addBerry(held, 1); else if (isMegaId(held)) Care.addMega(held, 1); else Pet.addItem(held, 1); }
    if (window.Sync && Sync.patchAccount && online()) Sync.patchAccount({ my_team: st.myTeam });
    buzz();
    const cell = root.querySelector(`#bag-grid [data-uid="${uid}"]`);
    const done = () => { S.sel = null; refreshAll(); toast(`${name} went to Prof. Oak — you got ${refund} EV Point Unit${refund > 1 ? "s" : ""}`); };
    if (cell) { cell.classList.add("bye"); setTimeout(done, 420); } else done();
  }

  /* ---------- 自訂排序 chip 次序 ---------- */
  function openSortEditor() {
    const ov = $("#bag-sortov");
    let order = sortOrder();
    const draw = () => {
      ov.innerHTML = `<div class="bag-modal">
        <div class="bag-modal-h"><b>Sort order</b><span class="bag-dsub">Use ▲▼ — the first one is your default</span></div>
        <div class="bag-sortlist">${order.map(([v, l], i) => `
          <div class="bag-sortrow"><span class="lb">${l}</span>${i === 0 ? `<span class="pill">Default</span>` : ""}
            <button type="button" data-up="${i}" ${i === 0 ? "disabled" : ""}>▲</button><button type="button" data-dn="${i}" ${i === order.length - 1 ? "disabled" : ""}>▼</button></div>`).join("")}</div>
        <div class="bag-modal-a"><button type="button" class="bag-btn alt" id="bag-sort-reset">Reset</button><button type="button" class="bag-btn" id="bag-sort-done">Done</button></div></div>`;
      const mv = (i, j) => { const [x] = order.splice(i, 1); order.splice(j, 0, x); draw(); };
      ov.querySelectorAll("[data-up]").forEach(b => b.addEventListener("click", () => mv(+b.dataset.up, +b.dataset.up - 1)));
      ov.querySelectorAll("[data-dn]").forEach(b => b.addEventListener("click", () => mv(+b.dataset.dn, +b.dataset.dn + 1)));
      $("#bag-sort-reset").addEventListener("click", () => { order = POKE_SORTS_DEFAULT.slice(); draw(); });
      $("#bag-sort-done").addEventListener("click", () => { saveSortOrder(order); S.sort = order[0][0]; S.dir = 1; ov.classList.remove("show"); renderChips(); renderGrid("in-f"); });
    };
    draw();
    ov.classList.add("show");
    ov.onclick = ev => { if (ev.target === ov) ov.classList.remove("show"); };
  }

  function renderAll(anim) {
    if (!S.sort) { S.sort = sortOrder()[0][0]; S.dir = 1; }
    renderTabInd(); renderChips(); renderGrid(anim); renderTeam(); renderDetail();
  }

  return { open, close, isOpen: () => S.open, getTeam, openBattle,
    showRotate: (mode, done, msg) => { if (!root) build(); showRotate(mode, done, msg); } };
})();

window.BagUI = BagUI;
