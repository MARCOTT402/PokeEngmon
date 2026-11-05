/* ============================================================
   PokeEngmon - Pokedex
   Owned -> full art & data; not owned -> grey silhouette
   ============================================================ */

/* Local cries: mp3 downloaded for 1-151 (assets/cries/{dexId}.mp3) */
const CRY_LOCAL = "assets/cries";
function cryURL(dexId) { return `${CRY_LOCAL}/${dexId}.mp3`; }

function capitalizeWord(slug) {
  const s = String(slug || "");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const Pokedex = {
  curGen: 1,
  _hubBound: false,

  open() {
    const st = loadState();
    /* 預設顯示最高已解鎖世代 */
    this.curGen = Math.min(st.unlockedGen || 1, MAX_GEN);
    App.showView("view-pokedex");
    this.render();
    this._bindHubScroll();
    this._setDexBackMode("grid");
  },

  /* 由 home sheet 展開時用：唔跳 view，只 render 已經搬入 sheet 嘅 DOM */
  mount(resetGen) {
    const st = loadState();
    const unlocked = st.unlockedGen || 1;
    /* 每次開 sheet 預設顯示最高已解鎖世代；展開／收起之間就保留用戶揀咗嘅世代 */
    if (resetGen || !this.curGen || this.curGen > unlocked) {
      this.curGen = Math.min(unlocked, MAX_GEN);
    }
    this._bindHubScroll();
    this._skipHubScroll = true; /* sheet 開啟時由第一格開始顯示，唔好自動捲去 active */
    this.render();
    this._skipHubScroll = false;
    const hub = document.getElementById("gen-hub");
    if (hub) hub.scrollLeft = 0;
  },

  /* detail：底欄「Back to Pokédex」關 modal；grid：返主頁 */
  _setDexBackMode(mode) {
    const btn = document.getElementById("btn-dex-back");
    if (!btn) return;
    if (mode === "detail") {
      btn.textContent = "Back to Pokédex";
      btn.onclick = () => App.closeModal();
    } else {
      btn.textContent = "Back to Home";
      btn.onclick = () => { App.renderHome(); App.showView("view-home"); };
    }
  },

  _genRoman(n) {
    return ["I", "II", "III", "IV", "V"][n - 1] || String(n);
  },

  /* ---------- 浮動世代 hub ---------- */
  renderHub() {
    const hub = document.getElementById("gen-hub");
    if (!hub || typeof GENS === "undefined") return;
    const st = loadState();
    const unlocked = st.unlockedGen || 1;
    hub.innerHTML = "";
    GENS.forEach(g => {
      const locked = g.gen > unlocked;
      const btn = document.createElement("button");
      btn.className = "gen-chip" + (g.gen === this.curGen ? " active" : "") + (locked ? " locked" : "");
      btn.innerHTML = `
        ${locked ? '<span class="gc-lock">🔒</span>' : ""}
        <img src="assets/gen-icons/${g.gen}.png" alt="${g.name}" loading="lazy"
             onerror="this.onerror=null;this.src='${artworkURL(g.iconDex)}'">
        <span class="gc-gen">GEN ${this._genRoman(g.gen)}</span>
        <span class="gc-name">${g.name}</span>`;
      btn.onclick = () => {
        this.curGen = g.gen;
        /* 換世代就清屬性篩選（新世代未必有嗰個屬性） */
        const f = this._prefs();
        if (f.types.length) { f.types = []; this._savePrefs(); }
        this.render();
      };
      hub.appendChild(btn);
    });
    /* 撳完自動捲去 active chip（手機橫向列表） */
    const active = hub.querySelector(".gen-chip.active");
    if (!this._skipHubScroll && active && active.scrollIntoView) {
      active.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
    }
  },

  /* 捲落收 hub、捲上放 hub */
  _bindHubScroll() {
    if (this._hubBound) return;
    this._hubBound = true;
    let lastY = 0;
    window.addEventListener("scroll", () => {
      const hub = document.getElementById("gen-hub");
      if (!hub || !document.getElementById("view-pokedex").classList.contains("active")) return;
      const y = window.scrollY;
      if (y > lastY && y > 70) hub.classList.add("hide");
      else hub.classList.remove("hide");
      lastY = y;
    }, { passive: true });
  },

  /* ---------- 排序／篩選 ---------- */
  _prefsKey: "pokeengmon_dex_prefs_v1",

  _prefs() {
    if (this._prefsCache) return this._prefsCache;
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem(this._prefsKey) || "{}") || {}; } catch (e) { saved = {}; }
    const sort = DEXSORT.isValidSort(saved.sort) ? saved.sort : "no";
    this._prefsCache = {
      q: typeof saved.q === "string" ? saved.q : "",
      owned: (saved.owned === "owned" || saved.owned === "unowned") ? saved.owned : "all",
      types: Array.isArray(saved.types) ? saved.types.filter(t => typeof t === "string") : [],
      sort: sort,
      dir: (saved.dir === "asc" || saved.dir === "desc") ? saved.dir : DEXSORT.defaultDir(sort),
      filtersOpen: saved.filtersOpen === true
    };
    return this._prefsCache;
  },

  _savePrefs() {
    try { localStorage.setItem(this._prefsKey, JSON.stringify(this._prefsCache)); } catch (e) { /* ignore */ }
  },

  /* 擁有集合 + 每個物種最高等級（排序用） */
  _ownedInfo(st) {
    const owned = new Set();
    const levels = new Map();
    st.entries.forEach(e => {
      if (!Array.isArray(e.ownedSpecies)) ensureEntryPokemonData(e);
      (e.ownedSpecies || []).forEach(id => owned.add(id));
      const cur = entryCurrentSpecies(e);
      const id = cur ? cur[0] : null;
      if (id == null) return;
      const lv = e.level || 1;
      if (!levels.has(id) || lv > levels.get(id)) levels.set(id, lv);
    });
    return { owned, levels };
  },

  _matches(sp, isOwned, f) {
    if (f.owned === "owned" && !isOwned) return false;
    if (f.owned === "unowned" && isOwned) return false;
    if (f.types.length) {
      /* SPECIES（js/data.js）冇屬性；屬性／能力值喺 POKEMON_DEX（data/pokemon-*.json） */
      const ts = DEXSORT.typesOf(sp.dexId);
      if (!f.types.some(t => ts.indexOf(t) >= 0)) return false;
    }
    const q = (f.q || "").trim().toLowerCase();
    if (!q) return true;
    const num = q.replace(/^#/, "");
    if (num && /^\d+$/.test(num) && String(sp.dexId).indexOf(num) === 0) return true;
    return String(sp.name || "").toLowerCase().indexOf(q) >= 0;
  },

  _activeFilterCount(f) {
    return (f.owned === "all" ? 0 : 1) + f.types.length;
  },

  /* 工具列（搜尋／排序／篩選）；只喺未鎖世代先出 */
  _renderTools(gen, lo, hi, f) {
    DEXSORT.syncControls(
      document.getElementById("dex-sort"),
      document.getElementById("dex-sort-dir"),
      f
    );

    const search = document.getElementById("dex-search");
    if (search && search.value !== f.q) search.value = f.q;

    /* 篩選預設收起（省位），撳「Filters」先展開 */
    const body = document.getElementById("dex-filter-body");
    const toggle = document.getElementById("dex-filter-toggle");
    if (body) body.hidden = !f.filtersOpen;
    if (toggle) {
      toggle.setAttribute("aria-expanded", f.filtersOpen ? "true" : "false");
      toggle.classList.toggle("open", f.filtersOpen);
    }
    const count = document.getElementById("dex-filter-count");
    if (count) {
      const n = this._activeFilterCount(f);
      count.hidden = n === 0;
      count.textContent = String(n);
    }

    document.querySelectorAll("#dex-own-chips .dex-chip").forEach(b => {
      b.classList.toggle("active", b.getAttribute("data-own") === f.owned);
    });

    /* 屬性 chips：只列本世代出現過嘅屬性 */
    const typeRow = document.getElementById("dex-type-chips");
    if (typeRow && typeRow.dataset.gen !== String(gen)) {
      const seen = [];
      for (let id = lo; id <= hi; id++) {
        DEXSORT.typesOf(id).forEach(t => { if (seen.indexOf(t) < 0) seen.push(t); });
      }
      typeRow.innerHTML = seen.map(t =>
        `<button class="dex-type-chip" type="button" data-type="${t}">
           <img src="${typeIconURL(t)}" alt="${typeLabel(t)}">${typeLabel(t)}</button>`).join("");
      typeRow.dataset.gen = String(gen);
    }
    if (typeRow) {
      typeRow.querySelectorAll(".dex-type-chip").forEach(b => {
        b.classList.toggle("active", f.types.indexOf(b.getAttribute("data-type")) >= 0);
      });
    }
  },

  _bindTools() {
    if (this._toolsBound) return;
    this._toolsBound = true;
    const search = document.getElementById("dex-search");
    if (search) {
      let timer = null;
      search.addEventListener("input", () => {
        this._prefs().q = search.value;
        clearTimeout(timer);
        timer = setTimeout(() => { this._savePrefs(); this.render(); }, 140);
      });
    }
    DEXSORT.bindControls(
      document.getElementById("dex-sort"),
      document.getElementById("dex-sort-dir"),
      this._prefsKey,
      () => { this._prefsCache = null; this.render(); }
    );
    const toggle = document.getElementById("dex-filter-toggle");
    if (toggle) toggle.addEventListener("click", () => {
      const f = this._prefs();
      f.filtersOpen = !f.filtersOpen;
      this._savePrefs();
      this.render();
    });
    const ownRow = document.getElementById("dex-own-chips");
    if (ownRow) ownRow.addEventListener("click", (e) => {
      const b = e.target.closest(".dex-chip");
      if (!b) return;
      this._prefs().owned = b.getAttribute("data-own");
      this._savePrefs();
      this.render();
    });
    const typeRow = document.getElementById("dex-type-chips");
    if (typeRow) typeRow.addEventListener("click", (e) => {
      const b = e.target.closest(".dex-type-chip");
      if (!b) return;
      const f = this._prefs();
      const t = b.getAttribute("data-type");
      const i = f.types.indexOf(t);
      if (i >= 0) f.types.splice(i, 1); else f.types.push(t);
      this._savePrefs();
      this.render();
    });
  },

  render() {
    const st = loadState();
    const unlocked = st.unlockedGen || 1;
    const gen = this.curGen;
    const locked = gen > unlocked;
    const [lo, hi] = genRange(gen);

    const { owned, levels } = this._ownedInfo(st);

    /* 標題列：Gen II · Johto · 45/100 owned */
    let ownedInGen = 0;
    for (let id = lo; id <= hi; id++) if (owned.has(id)) ownedInGen++;
    const total = hi - lo + 1;
    const gMeta = (typeof GENS !== "undefined") ? GENS.find(g => g.gen === gen) : null;
    const region = gMeta ? gMeta.name : "";
    document.getElementById("dex-progress").innerHTML =
      `Gen ${this._genRoman(gen)}${region ? " · " + region : ""} — Unlocked <b>${locked ? 0 : ownedInGen}</b> / ${total}`;

    /* 主頁進度：已解鎖物種數 / 已開放地區物種總數（同 status bar 定義一致） */
    const [hlo, hhi] = genRange(unlocked);
    let ownedHome = 0;
    for (let id = 1; id <= hhi; id++) if (owned.has(id)) ownedHome++;
    const totalHome = (typeof App !== "undefined" && App._unlockedGenTotal)
      ? App._unlockedGenTotal(unlocked)
      : (hhi - hlo + 1);
    document.getElementById("home-dex-progress").textContent = `${ownedHome}/${totalHome}`;

    /* 鎖定橫幅 */
    const banner = document.getElementById("gen-lock-banner");
    if (banner) {
      banner.hidden = !locked;
      if (locked && gMeta) {
        const prev = (typeof GENS !== "undefined") ? GENS.find(g => g.gen === gen - 1) : null;
        document.getElementById("gen-lock-title").textContent =
          `Gen ${this._genRoman(gen)} · ${region} is locked`;
        document.getElementById("gen-lock-desc").textContent =
          `Complete Gen ${this._genRoman(gen - 1)}${prev ? " · " + prev.name : ""} (own every Pokémon line) to unlock!`;
      }
    }

    const tools = document.getElementById("dex-tools");
    if (tools) tools.hidden = locked;
    this._bindTools();

    const grid = document.getElementById("pokedex-grid");
    grid.innerHTML = "";

    if (locked) {
      /* 未解鎖世代：純「?」placeholder cell，零圖片請求 */
      for (let id = lo; id <= hi; id++) {
        const cell = document.createElement("button");
        cell.className = "dex-cell dex-cell-locked";
        cell.innerHTML = `
          <span class="dex-qmark">?</span>
          <span class="dex-name">#${String(id).padStart(3, "0")}</span>`;
        cell.disabled = true;
        grid.appendChild(cell);
      }
      this.renderHub();
      return;
    }

    const f = this._prefs();
    this._renderTools(gen, lo, hi, f);

    /* 篩選 + 排序 */
    const items = [];
    for (let id = lo; id <= hi; id++) {
      const sp = SPECIES[id];
      if (!sp) continue;   // 理論上唔會（腳本已保證全覆蓋）
      const isOwned = owned.has(id);
      if (!this._matches(sp, isOwned, f)) continue;
      items.push({ sp: sp, isOwned: isOwned, level: levels.get(id) || 0 });
    }
    DEXSORT.sortList(items, f.sort, f.dir, it => ({ dexId: it.sp.dexId, level: it.level }));

    const res = document.getElementById("dex-result");
    if (res) {
      const surface = (f.owned === "owned") ? " owned" : "";
      res.innerHTML = `Showing <b>${items.length}</b> / ${total}${surface}` +
        (f.types.length ? ` · ${f.types.map(t => typeLabel(t)).join(" + ")}` : "");
    }

    if (!items.length) {
      grid.innerHTML = `<div class="dex-empty-state">No Pokémon match these filters.<br>Try clearing the search or type filters.</div>`;
    }

    items.forEach(it => {
      const sp = it.sp;
      const isOwned = it.isOwned;
      const cell = document.createElement("button");
      cell.className = "dex-cell" + (isOwned ? " owned" : "");
      /* 名字下面顯示「而家用緊邊個排序」嘅數值：No. / Lv. / Sp. Atk 24 … */
      const metric = DEXSORT.metric(f.sort, sp.dexId, it.level);
      const icons = DEXSORT.typeIcons(DEXSORT.typesOf(sp.dexId), "type-icon");
      cell.innerHTML = `
        <span class="dex-thumb">
          <img src="${spriteURL(sp.dexId)}" alt="${isOwned ? sp.name : "??"}" loading="lazy">
        </span>
        <span class="dex-name">${isOwned ? sp.name : "???"}</span>
        ${isOwned
          ? `<span class="dex-meta">
               <span class="dex-metric${f.sort === "level" && it.level ? " dex-lv" : ""}">${metric}</span>
               <span class="dex-types">${icons}</span>
             </span>`
          : ""}
      `;
      if (isOwned) {
        cell.onclick = () => this.showDetail(sp.dexId);
        /* Tap the sprite for its cry; tap elsewhere for details */
        const img = cell.querySelector("img");
        img.title = "Tap to hear its cry";
        img.onclick = (e) => { e.stopPropagation(); this.playCry(sp.dexId); };
      }
      grid.appendChild(cell);
    });

    this.renderHub();
  },

  /* Owned -> big art + data modal */
  showDetail(dexId, keepScroll) {
    const sp = SPECIES[dexId];
    const st = loadState();
    const chain = EVOLUTION_CHAINS.find(c => c.key === sp.chainKey);
    /* 一條鏈可以多個 entry（完全進化後可再收集）。
       能力值只跟「而家真係呢隻物種」嘅 entry —— Eevee 進化成 Flareon 後，
       Eevee 頁只保留 collected 記錄（進化鏈圖亮燈），唔再顯示能力值，
       直至玩家再抽／捉到新 Eevee（stage 1 個體）先復活數值。
       進化鏈圖用全鏈聯集（曾經擁有過嘅都亮燈）。 */
    const chainEntries = st.entries.filter(e => e.chainKey === sp.chainKey);
    const entry = chainEntries.find(e => entryCurrentSpecies(e)[0] === dexId) || null;
    const ownedSet = new Set();
    chainEntries.forEach(e => (e.ownedSpecies || []).forEach(id => ownedSet.add(id)));
    const rz = RARITY[sp.rarity] || RARITY.normal;

    /* Evolution chain (linear + Eevee branches) */
    const nodes = [];
    chain.stages.forEach((s) => {
      const got = ownedSet.has(s[0]);
      nodes.push(`<div class="evo-node ${got ? "got" : ""}">
                <img src="${spriteURL(s[0])}" alt="${s[1]}">
                <span>${got ? s[1] : "???"}</span>
              </div>`);
    });
    (chain.branches || []).forEach(opts => {
      const sub = opts.map(s => {
        const got = ownedSet.has(s[0]);
        return `<div class="evo-node ${got ? "got" : ""}">
                  <img src="${spriteURL(s[0])}" alt="${s[1]}">
                  <span>${got ? s[1] : "???"}</span>
                </div>`;
      }).join("");
      nodes.push(`<div class="evo-branch">${sub}</div>`);
    });
    const stageDots = nodes.join(`<span class="evo-arrow">→</span>`);

    /* Level / stats / moves / EV / candy */
    let extraHTML = "";
    /* 曾經擁有但已進化走：保留 collected 記錄，提示要再捉先見到數值 */
    if (!entry && ownedSet.has(dexId)) {
      extraHTML = `<div class="dex-empty" style="margin-top:10px">Previously owned — it evolved. Catch or pull another ${sp.name} to raise one again.</div>`;
    }
    if (entry) {
      ensureEntryPokemonData(entry);
      const level = entry.level || 1;
      const base = expAtLevel(dexId, level);
      const span = levelSpan(dexId, level);
      const into = Math.max(0, entry.exp - base);
      const pct = level >= MAX_LEVEL ? 100 : Math.min(100, (into / span) * 100);
      const stats = calcStats(dexId, level, entry.ivs, entry.evs, entry.nature);
      const statCells = STAT_KEYS.map(k =>
        `<div class="dex-stat">${STAT_LABELS[k]}<b>${stats ? stats[k] : "-"}</b></div>`).join("");
      /* 持有 4 招 + 招式池（Other Moves）：玩家可以喺度配招，日後對戰用 */
      const held = entry.moves || [];
      const poolAll = (Array.isArray(entry.knownMoves) && entry.knownMoves.length) ? entry.knownMoves : held;
      const others = poolAll.filter(m => !held.includes(m));
      const cards = held.length
        ? held.map(m => `<div class="mv-wrap mv-held" data-slug="${escapeHTML(m)}">${moveCardHTML(m)}</div>`).join("")
        : `<div class="dex-empty">No moves yet</div>`;
      const otherCards = others.length
        ? others.map(m => `<div class="mv-wrap mv-other" data-slug="${escapeHTML(m)}">${moveCardHTML(m)}</div>`).join("")
        : `<div class="dex-empty">Level up to learn more moves</div>`;
      const canAddEv = (k) => (entry.evPoints || 0) > 0
        && (entry.evs[k] || 0) < MAX_EV
        && evTotal(entry.evs) < MAX_EV_TOTAL;
      const evButtons = STAT_KEYS.map(k => `
        <button class="ev-btn" data-stat="${k}" ${canAddEv(k) ? "" : "disabled"}>
          <span>${STAT_LABELS[k]}</span><b>${entry.evs[k] || 0}</b><i>+1</i>
        </button>`).join("");
      /* 特性：只顯示白名單（已實作效果）嘅，唔會俾玩家見到「有名冇效果」嘅特性 */
      const abSlug = (typeof entry.ability === "string" && entry.ability) ? entry.ability
        : (typeof abilityOf === "function" ? abilityOf(dexId) : null);
      const abLine = (abSlug && typeof IMPLEMENTED_ABILITIES !== "undefined" && IMPLEMENTED_ABILITIES.includes(abSlug))
        ? `<div class="dex-sub">Ability: <b>${abilityName(abSlug)}</b></div>` : "";

      extraHTML = `
        <div class="dex-level-line">Lv.<span class="dex-level">${level}</span> / ${MAX_LEVEL}
          ・ <span class="dex-stars">${"★".repeat(entry.stars || 1)}</span></div>
        <div class="expbar"><i style="width:${pct}%"></i></div>
        <div class="hero-exp-text">${level >= MAX_LEVEL ? "Lv.MAX" : `EXP ${into} / ${span} to next Lv.`}</div>
        <div class="dex-sub">Nature: <b>${capitalizeWord(entry.nature)}</b> ・ IV ${ivTotal(entry.ivs)} / ${MAX_IV * 6} ・ EV ${evTotal(entry.evs)} / ${MAX_EV_TOTAL}</div>
        ${abLine}
        <div class="dex-stats">${statCells}</div>

        <div class="dex-moves">
          <div class="dex-moves-title">Moves (${(entry.moves || []).length}/4)</div>
          ${cards}
          <div class="dex-moves-tip">Change moves and add EVs in the Bag (Battle → Bag).</div>
        </div>

        <div class="dex-candy">
          🍬 Candy × <b>${entry.candies}</b> ・ Duplicates: <b>${entry.dupes}</b>
          <div class="dex-candy-tip">Candy comes from rare 💎 pulls only.</div>
          <button id="btn-feed-candy" ${entry.candies > 0 && level < MAX_LEVEL ? "" : "disabled"}>
            Feed 1 candy → +1 level
          </button>
        </div>`;
    }

    const scrollTop = keepScroll ? (document.querySelector(".modal-card") || {}).scrollTop : 0;
    App.showModal(`
      <div class="dex-detail">
        <span class="rarity-chip" style="background:${rz.bg};color:${rz.color}">${rz.label}</span>
        <img class="dex-art" id="dex-art" src="${artworkURL(dexId)}" alt="${sp.name}" title="Tap to hear its cry"
             onerror="this.onerror=null;this.src='${spriteURL(dexId)}';this.classList.add('pixel')">
        <div class="dex-detail-name">${sp.name}</div>
        <div class="dex-no">No.${String(dexId).padStart(3, "0")}</div>
        <div class="dex-stage-label">Evolution stage ${sp.stage}</div>
        <div class="evo-chain">${stageDots}</div>
        ${extraHTML}
      </div>
    `);
    this._setDexBackMode("detail");
    if (keepScroll) document.querySelector(".modal-card").scrollTop = scrollTop;

    const art = document.getElementById("dex-art");
    if (art) art.onclick = () => this.playCry(dexId);
    const feed = document.getElementById("btn-feed-candy");
    if (feed) feed.onclick = () => this.feedCandy(entry);
    document.querySelectorAll("#modal-root .ev-btn").forEach(btn => {
      btn.onclick = () => {
        if (!addEvPoint(entry, btn.dataset.stat)) return;
        /* v99：server 權威扣 EV point（背景同步，失敗下次 pull 還原） */
        if (window.SupabaseAuth && SupabaseAuth.isEnabled() && SupabaseAuth.currentUser()) {
          SupabaseAuth.allocEv(entry.uid, btn.dataset.stat);
        }
        this.showDetail(dexId, true);
        App.renderHome();
      };
    });

    /* 配招互動：撳 Other Move 揀招 → 撳持有招換入（再撳同一招取消） */
    if (entry) {
      const otherWraps = document.querySelectorAll("#modal-root .mv-other");
      const heldWraps = document.querySelectorAll("#modal-root .mv-held");
      let swapSlug = null;
      const clearSwap = () => {
        swapSlug = null;
        otherWraps.forEach(w => w.classList.remove("swap-pick"));
        heldWraps.forEach(w => w.classList.remove("swap-target"));
      };
      otherWraps.forEach(w => {
        w.onclick = () => {
          const slug = w.dataset.slug;
          if (swapSlug === slug) { clearSwap(); return; }
          clearSwap();
          swapSlug = slug;
          w.classList.add("swap-pick");
          heldWraps.forEach(h => h.classList.add("swap-target"));
        };
      });
      heldWraps.forEach(w => {
        w.onclick = () => {
          if (!swapSlug) return;
          const heldNow = (entry.moves || []).slice();
          const idx = heldNow.indexOf(w.dataset.slug);
          if (idx < 0) { clearSwap(); return; }
          const name = moveInfo(swapSlug).name;
          heldNow[idx] = swapSlug;
          const res = setEntryMoves(entry, heldNow);
          clearSwap();
          if (res.ok) {
            App.toast(`Moved ${name} into the set`);
            this.showDetail(dexId, true);
          }
        };
      });
    }
  },

  /* Feed candy -> +1 level (may learn a move / evolve) */
  feedCandy(entry) {
    if (!entry || entry.candies <= 0) return;
    const expBefore = entry.exp || 0;
    const res = useEntryCandy(entry, 1);
    /* v99：server 權威扣糖果 + 入 EXP（背景同步，失敗下次 pull 還原） */
    if (res.used > 0 && window.SupabaseAuth && SupabaseAuth.isEnabled() && SupabaseAuth.currentUser()) {
      SupabaseAuth.useEntryCandy(entry.uid, res.used, (entry.exp || 0) - expBefore);
      if (res.evolvedTo && entry.branch != null && window.Sync && Sync.isEnabled()) {
        Sync.patchEntry(entry.uid, { branch: entry.branch });
      }
    }
    App.closeModal();
    this.render();
    App.renderHome();
    if (res.levelsGained === 0) { App.toast("Already Lv.MAX!"); return; }
    App.toast(`Level up! Now Lv.${entry.level} ・ Candy left ${entry.candies}`);
    if (res.evolvedTo) {
      /* 進化場景播完先學招 */
      setTimeout(() => App.showEvolveModal(res.evolvedTo, () => {
        if (res.learned.length) setTimeout(() => App.queueMoveLearn(entry, res.learned), 400);
      }, res.evolvedFrom), 300);
    } else if (res.learned.length) {
      setTimeout(() => App.queueMoveLearn(entry, res.learned), 400);
    }
  },

  /* 喺用戶點擊時解鎖 Web Audio（手機自動播放限制），
     令幾秒後開球時仍然可以播放叫聲 */
  unlockAudio() {
    try {
      /* 優先共用 CaptureAudio 嘅 AudioContext，叫聲就可以行 sfxBus，
         同其他音效一齊即時跟 Settings 音量 */
      const cap = window.CaptureScene && CaptureScene.audio;
      if (cap && cap.ensure) cap.ensure();
      if (cap && cap.ctx) {
        if (this._ctx && this._ctx !== cap.ctx) {
          /* 換 ctx 後舊 buffer 唔可以重用 */
          this._cryCache = {};
          this._cryPending = {};
        }
        this._ctx = cap.ctx;
      } else {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (AC && !this._ctx) this._ctx = new AC();
      }
      if (!this._ctx) return;
      if (this._ctx.state === "suspended") this._ctx.resume();
      /* 喺手勢內播一個無聲 buffer，確保 iOS 真正啟動 AudioContext */
      if (!this._ctxStarted) {
        const b = this._ctx.createBuffer(1, 1, 22050);
        const s = this._ctx.createBufferSource();
        s.buffer = b;
        s.connect(this._ctx.destination);
        s.start(0);
        this._ctxStarted = true;
      }
    } catch (e) { /* ignore */ }
  },

  /* 預先下載＋解碼（抽獎動畫期間做，開球時即叫） */
  prepareCry(dexId) {
    const key = String(dexId);
    if (this._cryCache[key]) return Promise.resolve(this._cryCache[key]);
    if (this._cryPending[key]) return this._cryPending[key];
    const ctx = this._ctx;
    if (!ctx) return Promise.resolve(null);
    const job = fetch(cryURL(dexId))
      .then(res => (res.ok ? res.arrayBuffer() : null))
      .then(buf => {
        if (!buf) return null;
        return new Promise((resolve) => {
          const done = data => resolve(data || null);
          try {
            const p = ctx.decodeAudioData(buf, done, () => resolve(null));
            if (p && p.then) p.then(done, () => resolve(null));
          } catch (e) { resolve(null); }
        });
      })
      .then(audio => {
        if (audio) this._cryCache[key] = audio;
        delete this._cryPending[key];
        return audio;
      })
      .catch(() => {
        delete this._cryPending[key];
        return null;
      });
    this._cryPending[key] = job;
    return job;
  },

  /* 播叫聲：Web Audio（已解鎖）優先，失敗先用 HTMLAudio */
  playCry(dexId) {
    if (!SPECIES[dexId]) return;
    if (!this._ctx) this.unlockAudio();
    const key = String(dexId);
    if (this._ctx) {
      if (this._ctx.state === "suspended") this._ctx.resume();
      if (this._cryCache[key]) { this._playBuffer(this._cryCache[key]); return; }
      this.prepareCry(dexId).then(buf => {
        if (buf) this._playBuffer(buf);
        else this._playHTML(dexId);
      });
      return;
    }
    this._playHTML(dexId);
  },

  _playBuffer(buffer) {
    try {
      const src = this._ctx.createBufferSource();
      const gain = this._ctx.createGain();
      const cap = window.CaptureScene && CaptureScene.audio;
      const bus = (cap && cap.ctx === this._ctx && cap.sfxBus) ? cap.sfxBus : null;
      const sfx = (typeof loadAudioPrefs === "function") ? loadAudioPrefs().sfx : 1;
      gain.gain.value = bus ? 0.8 : 0.8 * sfx;
      src.buffer = buffer;
      src.connect(gain);
      gain.connect(bus || this._ctx.destination);
      src.start(0);
    } catch (e) { /* ignore */ }
  },

  _playHTML(dexId) {
    const a = this._audio || (this._audio = new Audio());
    const sfx = (typeof loadAudioPrefs === "function") ? loadAudioPrefs().sfx : 1;
    a.volume = Math.max(0, Math.min(1, 0.75 * sfx));
    a.src = cryURL(dexId);
    a.play().catch(() => {});
  }
};

Pokedex._cryCache = {};
Pokedex._cryPending = {};
