// @ts-check
/* ============================================================
   PokeEngmon - 共用「排序／篩選」工具
   圖鑑、選擇對戰隊伍、Partner Care 三處都用同一套排序定義，
   令「No. / Level / Atk / …」嘅意思同顯示完全一致。
   ============================================================ */

const DEXSORT = {
  SORT_OPTIONS: [
    { id: "no", label: "No." },
    { id: "name", label: "Name" },
    { id: "level", label: "Level" },
    { id: "hp", label: "HP" },
    { id: "atk", label: "Atk" },
    { id: "def", label: "Def" },
    { id: "spa", label: "Sp. Atk" },
    { id: "spd", label: "Sp. Def" },
    { id: "spe", label: "Speed" }
  ],

  isValidSort(id) {
    return this.SORT_OPTIONS.some(o => o.id === id);
  },

  /* 文字類（No. / Name）預設升序，數值類預設由大到小 */
  defaultDir(sort) {
    return (sort === "no" || sort === "name") ? "asc" : "desc";
  },

  fillSelect(sel) {
    if (!sel || sel.options.length) return;
    this.SORT_OPTIONS.forEach(o => {
      const op = document.createElement("option");
      op.value = o.id;
      op.textContent = o.label;
      sel.appendChild(op);
    });
  },

  /* 各畫面各自用一個 localStorage key 記住自己嘅排序 */
  load(key) {
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem(key) || "{}") || {}; } catch (e) { saved = {}; }
    const sort = this.isValidSort(saved.sort) ? saved.sort : "no";
    return {
      sort: sort,
      dir: (saved.dir === "asc" || saved.dir === "desc") ? saved.dir : this.defaultDir(sort)
    };
  },

  save(key, p) {
    try { localStorage.setItem(key, JSON.stringify({ sort: p.sort, dir: p.dir })); } catch (e) {}
  },

  typesOf(dexId) {
    return (dexOf(dexId) || {}).types || [];
  },

  /* 屬性 icon（assets/types/*.png，同對戰／招式卡一致） */
  typeIcons(types, cls) {
    return (types || []).map(t =>
      `<img class="${cls || "type-icon"}" src="${typeIconURL(t)}" alt="${typeLabel(t)}" title="${typeLabel(t)}">`
    ).join("");
  },

  /* 排序後喺名字下面顯示嘅當前數值 */
  metric(sort, dexId, level) {
    const d = dexOf(dexId) || {};
    if (sort === "level") return level ? `Lv.${level}` : `No.${dexId}`;
    if (sort === "no" || sort === "name") return `No.${dexId}`;
    const label = { hp: "HP", atk: "Atk", def: "Def", spa: "SpA", spd: "SpD", spe: "Spe" }[sort];
    return `${label || sort} ${((d.baseStats || {})[sort] || 0)}`;
  },

  _value(sort, dexId, level) {
    if (sort === "no") return dexId;
    if (sort === "name") return String((SPECIES[dexId] && SPECIES[dexId].name) || "");
    if (sort === "level") return level || 0;
    const d = dexOf(dexId) || {};
    return ((d.baseStats || {})[sort] || 0);
  },

  /* items: 任何物件；get(item) -> { dexId, level } */
  sortList(items, sort, dir, get) {
    const sign = dir === "desc" ? -1 : 1;
    const val = (it) => { const k = get(it); return this._value(sort, k.dexId, k.level); };
    items.sort((a, b) => {
      const va = val(a), vb = val(b);
      const ka = get(a).dexId, kb = get(b).dexId;
      if (typeof va === "string" || typeof vb === "string") {
        const c = String(va).localeCompare(String(vb));
        return c === 0 ? ka - kb : sign * c;
      }
      if (va === vb) return ka - kb;
      return sign * (va - vb);
    });
    return items;
  },

  /* 同步 sort select + 方向掣顯示 */
  syncControls(sel, dirBtn, p) {
    if (sel) { this.fillSelect(sel); sel.value = p.sort; }
    if (dirBtn) {
      dirBtn.textContent = p.dir === "desc" ? "↓" : "↑";
      dirBtn.setAttribute("aria-label",
        p.dir === "desc" ? "Sorted descending — tap for ascending" : "Sorted ascending — tap for descending");
    }
  },

  /* 綁定一次：換排序 / 轉方向 → 存偏好 + 回呼重畫 */
  bindControls(sel, dirBtn, key, onChange) {
    if (sel && !sel.dataset.bound) {
      sel.dataset.bound = "1";
      sel.addEventListener("change", () => {
        const p = this.load(key);
        p.sort = sel.value;
        p.dir = this.defaultDir(p.sort);
        this.save(key, p);
        onChange(p);
      });
    }
    if (dirBtn && !dirBtn.dataset.bound) {
      dirBtn.dataset.bound = "1";
      dirBtn.addEventListener("click", () => {
        const p = this.load(key);
        p.dir = p.dir === "desc" ? "asc" : "desc";
        this.save(key, p);
        onChange(p);
      });
    }
  }
};

/* ES module 過渡期（總計劃 P2.3；Rule 119）：index.html 用 type="module" 載入，頂層名唔會自動變全域 → 明確掛上 globalThis，classic script 照用 */
Object.assign(globalThis, { DEXSORT });
