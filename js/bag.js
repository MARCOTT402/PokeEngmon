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
  const S = { open: false, tab: "pokemon", sort: null, dir: 1, sel: null, from: "home", evPick: false };
  let root = null, rotateEl = null;
  const $ = sel => root.querySelector(sel);
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  const MED_LABEL = () => (window.Care ? Care.MED_INFO : {});
  /* 第 1 段只讀顯示現有庫存（食物同藥）；樹果取代食物喺第 3 段 */
  function itemList() {
    const out = [];
    const count = k => (window.Pet ? Pet.countOf(k) : 0) || 0;
    (window.Care ? Care.MED_KINDS : []).forEach(k => {
      const m = Care.MED_INFO[k];
      out.push({ id: k, cat: "medicine", name: m.name, icon: Care.ITEM_SPRITE(m.sprite), n: count(k), desc: m.effect });
    });
    out.push({ id: "revive", cat: "medicine", name: "Revival", icon: "assets/items/revive.png", n: count("revive"), desc: "Revives a fainted Pokémon with full HP and full fullness, and clears every status." });
    out.push({ id: "food", cat: "food", name: "Food", icon: "assets/items/food.png", n: count("food"), desc: "Fullness +25%. Will become berries in a later update." });
    out.push({ id: "premium", cat: "food", name: "Premium Food", icon: "assets/items/premium.png", n: count("premium"), desc: "Fullness +50%. Will become berries in a later update." });
    return out;
  }
  function heldList() {
    const count = k => (window.Pet ? Pet.countOf(k) : 0) || 0;
    return (typeof STONE_KINDS !== "undefined" ? STONE_KINDS : []).map(k => ({
      id: k, cat: "stones", name: STONE_LABELS[k], emoji: STONE_ICONS[k], n: count(k),
      desc: "Evolves a matching Pokémon (the stone is used up)."
    }));
  }

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
              <div class="bag-colhead"><span>My Team</span><small>hold &amp; drag</small></div>
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
              <div class="bag-gridwrap" id="bag-gridwrap"><div class="bag-grid" id="bag-grid"></div></div>
              <div class="bag-dropzone" id="bag-dropzone">Drop here to remove from team</div>
            </section>
            <aside class="bag-detail" id="bag-detail"></aside>
            <div class="bag-me" id="bag-me"></div>
            <div class="bag-sortov" id="bag-sortov"></div>
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
    window.addEventListener("resize", fit);
    const mq = window.matchMedia("(orientation: landscape)");
    (mq.addEventListener ? mq.addEventListener.bind(mq, "change") : mq.addListener.bind(mq))(() => { fit(); autoHideRotate(); });
  }

  /* ---------- 縮放：956×440 等比塞入視窗 ---------- */
  function fit() {
    if (!root) return;
    /* 直向「Play like this anyway」：成個橫向畫面轉 90° 填滿屏幕（玩家逆時針轉手機就變正） */
    const portrait = window.innerHeight > window.innerWidth;
    const s = portrait
      ? Math.min(window.innerWidth / H, window.innerHeight / W)
      : Math.min(window.innerWidth / W, window.innerHeight / H);
    $("#bag-stage").style.transform = portrait ? `rotate(90deg) scale(${s})` : `scale(${s})`;
    renderTabInd();
  }

  /* ---------- 轉手機提示 ---------- */
  const isPortrait = () => window.matchMedia("(orientation: portrait)").matches;
  const isLandscape = () => window.matchMedia("(orientation: landscape)").matches;
  let rotateMode = null, rotateDone = null;
  function showRotate(mode, done) {
    rotateMode = mode; rotateDone = done || null;
    rotateEl.classList.toggle("back", mode === "portrait");
    rotateEl.querySelector(".bag-rot-title").textContent = mode === "portrait" ? "Turn your phone upright" : "Please rotate your device";
    rotateEl.querySelector(".bag-rot-msg").textContent = mode === "portrait" ? "Home works in portrait" : "The Bag works in landscape";
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
    S.tab = "pokemon"; S.sel = null; S.evPick = false;
    if (window.Pet) Pet.runDailyCheck();
    S.open = true;
    root.classList.add("show");
    document.body.classList.add("bag-open");
    $("#bag-home-lbl").textContent = S.from === "battle" ? "BATTLE" : "HOME";
    fillBezel();
    fit();
    renderAll("in-f");
    if (isPortrait()) showRotate("landscape");
  }
  function close() {
    flushEv();
    if (ME.uid) { $("#bag-me").classList.remove("show"); ME.uid = null; }
    const finish = () => {
      root.classList.remove("show");
      document.body.classList.remove("bag-open");
      S.open = false;
      if (S.from === "battle" && typeof BattleUI !== "undefined") BattleUI.openMenu();
      else if (window.App) App.renderHome();
    };
    /* 返直向頁面前：仲係打橫就提示轉返直（已直向唔提示） */
    if (isLandscape() && window.innerWidth <= 1000) showRotate("portrait", finish);
    else finish();
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
    root.querySelectorAll(".bag-tab").forEach(b => b.classList.toggle("on", b.dataset.tab === S.tab));
  }
  function switchTab(t) {
    if (t === S.tab) return;
    const dir = TABS.indexOf(t) > TABS.indexOf(S.tab) ? "in-l" : "in-r";
    flushEv(); S.evPick = false;
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
  const buzz = () => { try { navigator.vibrate && navigator.vibrate(12); } catch (e) {} };
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
            <button type="button" class="bag-heart ${e.favorite ? "on" : ""}" data-fav="1" aria-label="Favorite">${HEART}</button></span>
          <span class="bag-cap">${caption(e)}</span>
        </div>`;
      }).join("") : `<div class="bag-empty">No Pokémon yet — finish a quiz to pull one!</div>`;
      g.querySelectorAll("[data-uid]").forEach(el => {
        const uid = el.dataset.uid;
        el.addEventListener("click", ev => {
          if (Drag.justDropped) return;
          if (ev.target.closest("[data-fav]")) { toggleFav(uid, el); return; }
          const now = Date.now();
          if (lastTap.uid === uid && now - lastTap.t < 320) { toggleFav(uid, el, true); lastTap.uid = null; return; }
          lastTap.uid = uid; lastTap.t = now;
          select({ kind: "pokemon", uid });
        });
        Drag.bind(el, () => ({ kind: "pokemon", uid, img: animatedURL(entryCurrentSpecies(entryOf(uid))[0]) }));
      });
    } else {
      const list = S.tab === "items" ? itemList() : heldList();
      g.innerHTML = list.map(it => `
        <button type="button" class="bag-cell ${it.n <= 0 ? "dim" : ""} ${S.sel && S.sel.id === it.id ? "sel" : ""}" data-id="${it.id}">
          <span class="bag-pic">${it.icon ? `<img class="bag-spr" src="${it.icon}" alt="" draggable="false">` : `<span class="bag-emoji">${it.emoji}</span>`}<span class="bag-cnt">×${it.n}</span></span>
          <span class="bag-cap"><b>${esc(it.name)}</b></span>
        </button>`).join("") + (S.tab === "held" ? `<div class="bag-empty small">Mega stones and other held items will appear here later.</div>` : "");
      g.querySelectorAll("[data-id]").forEach(el => el.addEventListener("click", () => select({ kind: S.tab, id: el.dataset.id })));
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
  function renderTeam() {
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
      el.addEventListener("click", () => { if (!Drag.justDropped) select({ kind: "pokemon", uid: el.dataset.uid }); });
      Drag.bind(el, () => ({ kind: "teamslot", uid: el.dataset.uid, img: animatedURL(entryCurrentSpecies(entryOf(el.dataset.uid))[0]) }));
    });
  }

  /* ---------- 拖放：滑鼠撳住移動；touch 長撳 0.3 秒先拎起（唔阻上下捲） ---------- */
  const Drag = (() => {
    let press = null, ghost = null, over = null;
    const api = { justDropped: false };
    api.bind = (el, payloadFn) => el.addEventListener("pointerdown", e => {
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
      const sel = k === "move" ? "[data-drop=mslot]" : "[data-drop=slot]";
      root.querySelectorAll(sel).forEach(s => s.classList.add("drop-ok"));
    }
    function targetAt(x, y) {
      const el = document.elementFromPoint(x, y); if (!el) return null;
      const k = press.payload.kind;
      if (k === "move") return el.closest("[data-drop=mslot]");
      if (k === "teamslot" && el.closest(".bag-mid")) return $("#bag-dropzone");
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
    function onDrop(pl, t) {
      if (pl.kind === "move") { ME.slot = Number(t.dataset.ms); learnMove(pl.name, ME.slot); return; }
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
      c.classList.toggle("sel", (!!sel.uid && c.dataset.uid === sel.uid) || (!!sel.id && c.dataset.id === sel.id)));
    if (ME.uid && sel.kind === "pokemon") openMoveEditor(sel.uid);
    else if (ME.uid) closeMoveEditor();
    renderDetail(true);
  }

  /* ---------- 右欄 ---------- */
  function renderDetail(anim) {
    const d = $("#bag-detail");
    d.classList.remove("fade"); if (anim) { void d.offsetWidth; d.classList.add("fade"); }
    if (!S.sel) { d.innerHTML = `<div class="bag-note">Tap a Pokémon or an item to see details.<br><br>Hold and drag a Pokémon onto a team slot to build My Team. Double-tap a Pokémon to ♥ it.</div>`; return; }
    if (S.sel.kind !== "pokemon") {
      const it = (S.sel.kind === "items" ? itemList() : heldList()).find(x => x.id === S.sel.id);
      if (!it) { d.innerHTML = ""; return; }
      d.innerHTML = `
        <div class="bag-item-big"><span class="bag-ib">${it.icon ? `<img src="${it.icon}" alt="">` : `<span class="bag-emoji big">${it.emoji}</span>`}</span>
          <div><div class="bag-dname">${esc(it.name)}</div><div class="bag-dsub">×${it.n} in bag</div></div></div>
        <div class="bag-desc">${esc(it.desc)}</div>
        <div class="bag-note">Using items from the Bag arrives in the next update — for now use Partner Care.</div>`;
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
      <div class="bag-actions">
        <button type="button" class="bag-btn alt" id="bag-btn-moves">Moves</button>
        <button type="button" class="bag-btn alt ${S.evPick ? "on" : ""}" id="bag-btn-ev" ${pool <= 0 && !S.evPick ? "disabled" : ""}>${S.evPick ? "Done" : `EV ×${pool}`}</button>
        <button type="button" class="bag-btn" id="bag-btn-team">${inTeam ? "Leave team" : "Join team"}</button>
      </div>`;
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

  return { open, close, isOpen: () => S.open, getTeam };
})();

window.BagUI = BagUI;
