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
  const S = { open: false, tab: "pokemon", sort: "no", sel: null, from: "home" };
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
              <div class="bag-colhead"><span>My Team</span><small>coming next</small></div>
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
            </section>
            <aside class="bag-detail" id="bag-detail"></aside>
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
    S.tab = "pokemon"; S.sel = null;
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

  /* ---------- chips（第 1 段：Pokémon 排序 No.／Level） ---------- */
  function renderChips() {
    const c = $("#bag-chips");
    if (S.tab !== "pokemon") { c.innerHTML = ""; return; }
    const opts = [["no", "No."], ["level", "Level"]];
    c.innerHTML = `<span class="bag-chip-k">Sort</span>` + opts.map(([v, l]) => `<button type="button" class="bag-chip ${S.sort === v ? "on" : ""}" data-v="${v}">${l}</button>`).join("");
    c.querySelectorAll("[data-v]").forEach(b => b.addEventListener("click", () => { S.sort = b.dataset.v; renderChips(); renderGrid("in-f"); }));
  }

  /* ---------- 格仔 ---------- */
  function owned() {
    const st = loadState();
    const list = st.entries.filter(e => Array.isArray(e.ownedSpecies) && e.ownedSpecies.length);
    const no = e => entryCurrentSpecies(e)[0];
    return list.sort(S.sort === "level" ? (a, b) => (b.level || 1) - (a.level || 1) || no(a) - no(b) : (a, b) => no(a) - no(b));
  }
  function renderGrid(anim) {
    const g = $("#bag-grid");
    const st = loadState();
    if (S.tab === "pokemon") {
      const list = owned();
      g.innerHTML = list.length ? list.map(e => {
        const c = entryCurrentSpecies(e);
        const faint = window.Pet && Pet.isFaint(e);
        const key = window.Care && e.pet ? Care.statusKey(e.pet) : null;
        const cap = S.sort === "level" ? `Lv.${e.level || 1}` : `No.${String(c[0]).padStart(3, "0")}`;
        return `<button type="button" class="bag-cell ${faint ? "fnt" : ""} ${S.sel && S.sel.uid === e.uid ? "sel" : ""}" data-uid="${esc(e.uid)}">
          <span class="bag-pic"><img class="bag-spr" src="${animatedURL(c[0])}" alt="" loading="lazy" draggable="false">
            ${e.uid === st.activeUid ? `<span class="bag-tag">PARTNER</span>` : ""}
            ${key ? `<img class="bag-st" src="assets/battle/ui/status-${Care.STATUS_INFO[key].icon}.png" alt="">` : faint ? `<img class="bag-st" src="assets/battle/ui/status-fnt.png" alt="">` : ""}</span>
          <span class="bag-cap"><b>${esc(c[1])}</b><i>${cap}</i></span>
        </button>`;
      }).join("") : `<div class="bag-empty">No Pokémon yet — finish a quiz to pull one!</div>`;
      g.querySelectorAll("[data-uid]").forEach(el => el.addEventListener("click", () => select({ kind: "pokemon", uid: el.dataset.uid })));
    } else {
      const list = S.tab === "items" ? itemList() : heldList();
      g.innerHTML = list.map(it => `
        <button type="button" class="bag-cell ${it.n <= 0 ? "dim" : ""} ${S.sel && S.sel.id === it.id ? "sel" : ""}" data-id="${it.id}">
          <span class="bag-pic">${it.icon ? `<img class="bag-spr" src="${it.icon}" alt="" draggable="false">` : `<span class="bag-emoji">${it.emoji}</span>`}<span class="bag-cnt">×${it.n}</span></span>
          <span class="bag-cap"><b>${esc(it.name)}</b></span>
        </button>`).join("") + (S.tab === "held" ? `<div class="bag-empty small">Mega stones and other held items will appear here later.</div>` : "");
      g.querySelectorAll("[data-id]").forEach(el => el.addEventListener("click", () => select({ kind: S.tab, id: el.dataset.id })));
    }
    if (anim) { g.classList.remove("in-l", "in-r", "in-f"); void g.offsetWidth; g.classList.add(anim); }
  }
  function select(sel) {
    S.sel = sel;
    $("#bag-grid").querySelectorAll(".bag-cell").forEach(c => c.classList.toggle("sel", (sel.uid && c.dataset.uid === sel.uid) || (sel.id && c.dataset.id === sel.id)));
    renderDetail(true);
  }

  /* ---------- 右欄 ---------- */
  function renderDetail(anim) {
    const d = $("#bag-detail");
    d.classList.remove("fade"); if (anim) { void d.offsetWidth; d.classList.add("fade"); }
    if (!S.sel) { d.innerHTML = `<div class="bag-note">Tap a Pokémon or an item to see details.</div>`; return; }
    if (S.sel.kind !== "pokemon") {
      const it = (S.sel.kind === "items" ? itemList() : heldList()).find(x => x.id === S.sel.id);
      if (!it) { d.innerHTML = ""; return; }
      d.innerHTML = `
        <div class="bag-item-big"><span class="bag-ib">${it.icon ? `<img src="${it.icon}" alt="">` : `<span class="bag-emoji big">${it.emoji}</span>`}</span>
          <div><div class="bag-dname">${esc(it.name)}</div><div class="bag-dsub">×${it.n} in bag</div></div></div>
        <div class="bag-desc">${esc(it.desc)}</div>
        <div class="bag-note">Using items from the Bag arrives in a later update — for now use Partner Care.</div>`;
      return;
    }
    const e = loadState().entries.find(x => x.uid === S.sel.uid);
    if (!e) { d.innerHTML = ""; return; }
    const c = entryCurrentSpecies(e);
    const p = window.Pet ? Pet.ensure(e) : e.pet || {};
    const hp = window.Care ? Care.hpOf(e) : { cur: 0, max: 0, pct: 0, faint: false };
    const key = window.Care ? Care.statusKey(p) : null;
    const stats = calcStats(c[0], e.level || 1, e.ivs, e.evs, e.nature) || {};
    const nat = natureInfo(e.nature);
    const types = (typeof Battle !== "undefined" && Battle.speciesTypes) ? Battle.speciesTypes(c[0]) : [];
    const evTotal = STAT_KEYS.reduce((a, k) => a + ((e.evs || {})[k] || 0), 0);
    const hpCls = hp.faint ? "faint" : hp.pct < 20 ? "low" : hp.pct <= 50 ? "mid" : "";
    d.innerHTML = `
      <div class="bag-dhead">
        <img class="bag-dspr" src="${animatedURL(c[0])}" alt="" style="${hp.faint ? "filter:grayscale(1) opacity(.6)" : ""}">
        <div class="bag-dtitle">
          <div class="bag-dname">${esc(c[1])}</div>
          <div class="bag-lvrow"><span class="bag-lv">Lv.<b>${e.level || 1}</b></span><span class="bag-dsub">No.${String(c[0]).padStart(3, "0")}</span></div>
          <div class="bag-types">${types.map(t => `<img src="${typeIconURL(t)}" alt="${t}">`).join("")}${key ? `<img class="bag-stimg" src="assets/battle/ui/status-${Care.STATUS_INFO[key].icon}.png" alt="">` : ""}</div>
        </div>
      </div>
      <div class="bag-bars">
        <div class="bag-bar-row"><span>HP</span><div class="bag-bar hp ${hpCls}"><i style="width:${hp.pct}%"></i></div><span class="v">${hp.max ? `${hp.cur}/${hp.max}` : "—"}</span></div>
        <div class="bag-bar-row"><span>FULLNESS</span><div class="bag-bar full"><i style="width:${Math.max(0, p.health || 0)}%"></i></div><span class="v">${Math.max(0, p.health || 0)}/100</span></div>
      </div>
      <div class="bag-sec"><span>Stats</span><span>EV ${evTotal}/510</span></div>
      <div class="bag-stats">${STAT_KEYS.map(k => `
        <div class="bag-srow ${nat.plus === k ? "plus" : nat.minus === k ? "minus" : ""}">
          <span class="k">${STAT_LABELS[k]}${nat.plus === k ? " ▲" : nat.minus === k ? " ▼" : ""}</span><span class="val">${stats[k] || "-"}</span>
          <span class="sb"><i style="width:${Math.min(100, (stats[k] || 0) / 2)}%"></i></span><span class="ev">${(e.evs || {})[k] || 0}</span>
        </div>`).join("")}</div>
      <div class="bag-sec"><span>Moves</span><span>PP</span></div>
      <div class="bag-moves">${(e.moves || []).map(slug => {
        const m = moveInfo(slug); const cls = damageClassInfo(m.damage_class);
        return `<div class="bag-move" style="--tc:${typeColor(m.type)}"><span class="mcat" style="background:${cls.color}" title="${cls.label}">${cls.icon}</span><span class="mname">${esc(m.name)}</span><span class="mpow">${m.power == null ? "—" : m.power}</span><span class="pp">${m.pp == null ? "—" : m.pp}</span></div>`;
      }).join("") || `<div class="bag-note">No moves yet</div>`}</div>
      <div class="bag-kv"><span>Nature</span><b>${esc(e.nature || "—")}</b></div>
      <div class="bag-kv"><span>Ability</span><b>${esc(typeof abilityName === "function" && e.ability ? abilityName(e.ability) : "—")}</b></div>
      <div class="bag-note">Changing moves and EVs moves into the Bag in the next update.</div>`;
  }

  function renderAll(anim) {
    renderTabInd(); renderChips(); renderGrid(anim); renderDetail();
    /* 我的隊伍：第 2 段先做，第 1 段顯示 6 個空位 */
    $("#bag-slots").innerHTML = Array.from({ length: 6 }, (_, i) => `<div class="bag-slot empty">Slot ${i + 1}</div>`).join("");
  }

  return { open, close, isOpen: () => S.open };
})();

window.BagUI = BagUI;
