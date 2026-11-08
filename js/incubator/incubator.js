// @ts-check
/* ============================================================
   PokeEngmon - 孵化器狀態同同步（plan .trae/documents/20261108-gacha-dragonite-incubator-plan.md Task 3.2）
   規則：js/incubator/rules.js（IncubatorRules）；server：migration 20261108c（get_incubator／claim_egg／
   incubator_add／hatch_egg／discard_egg）。
   - 本地存檔 st.incubator = { eggs: [Egg|null, Egg|null], s2: { ever, on, last }, streak }。
   - 登入：一律等 RPC，成功先寫本地（server 回傳覆蓋）；RPC 失敗 → 本地完全唔改（Review Focus 1）。
   - 匿名／離線：本地扣鑽／擲／孵（同扭蛋本地 fallback）。
   - 只 reward、唔 punish（Rule 123）：除咗用戶自己 Claim 嘅 💎3，任何流程唔扣嘢。
   載入次序：storage.js、store.js、incubator/rules.js、gacha/pull.js 之後（classic script）。
   ============================================================ */

const Incubator = {
  /** @returns {{ eggs: (any|null)[], s2: { ever: boolean, on: boolean, last: number }, streak?: number }} */
  _inc() {
    const st = loadState();
    const cur = st.incubator;
    if (!cur || !Array.isArray(cur.eggs) || !cur.s2) {
      st.incubator = { eggs: [null, null], s2: { ever: false, on: false, last: 0 } };
    }
    return st.incubator;
  },

  _authed() {
    const A = /** @type {any} */ (globalThis).SupabaseAuth;
    return !!(A && A.isLoggedIn && A.isLoggedIn());
  },

  _auth() { return /** @type {any} */ (globalThis).SupabaseAuth; },

  /** server get_incubator／incubator_add 回傳 → 本地（保留 seen：同一隻蛋先保留） */
  /** @param {any} view */
  _adopt(view) {
    if (!view || !Array.isArray(view.eggs)) return;
    const inc = this._inc();
    inc.eggs = [0, 1].map((i) => {
      const e = view.eggs[i];
      if (!e) return null;
      const old = inc.eggs[i];
      const same = old && old.rarity === e.rarity && old.need === e.need && (old.progress || 0) <= e.progress;
      return { rarity: e.rarity, need: e.need, progress: e.progress, seen: same ? Math.min(old.seen || 0, e.progress) : 0 };
    });
    if (view.slot2) inc.s2 = { ever: !!view.slot2.ever, on: !!view.slot2.on, last: view.slot2.last | 0 };
    if (typeof view.streak === "number") inc.streak = view.streak;
    saveState();
  },

  /** 現狀（匿名先用本地 streak sync Slot 2；登入用 server 上次回傳） */
  state() {
    const inc = this._inc();
    if (!this._authed()) {
      const streak = typeof calcStreak === "function" ? calcStreak() : 0;
      const next = IncubatorRules.syncSlot2(inc.s2, streak);
      if (next.on !== inc.s2.on || next.ever !== inc.s2.ever || next.last !== inc.s2.last) {
        inc.s2 = next;
        saveState();
      }
      inc.streak = streak;
    }
    return { eggs: inc.eggs, s2: inc.s2, streak: inc.streak || 0 };
  },

  /** 登入：拉 server 狀態（開孵化器頁／sync pull 時）。失敗唔改本地 */
  async refresh() {
    if (this._authed()) {
      let r = null;
      try { r = await this._auth().getIncubator(); } catch (e) { r = null; }
      if (r && !r.error) this._adopt(r);
    }
    return this.state();
  },

  /** 3 💎 擲一隻蛋入空位 */
  /** @returns {Promise<{ slot: number, rarity: string, need: number } | { error: "incubator_full"|"not_enough_diamonds"|"network" }>} */
  async claim() {
    if (this._authed()) {
      let r = null;
      try { r = await this._auth().claimEgg(); } catch (e) { r = null; }
      if (!r) return { error: "network" };
      if (r.error) return { error: r.error };
      const st = loadState();
      const inc = this._inc();
      if (typeof r.balance === "number") st.diamonds = r.balance;
      inc.eggs[r.slot] = { rarity: r.rarity, need: r.need, progress: 0, seen: 0 };
      saveState();
      return { slot: r.slot, rarity: r.rarity, need: r.need };
    }
    const st = loadState();
    const { eggs, s2 } = this.state();
    const slot = IncubatorRules.freeSlot(eggs, s2);
    if (slot === null) return { error: "incubator_full" };
    if ((st.diamonds || 0) < IncubatorRules.CLAIM_COST) return { error: "not_enough_diamonds" };
    st.diamonds -= IncubatorRules.CLAIM_COST;
    const egg = IncubatorRules.makeEgg(IncubatorRules.rollRarity());
    this._inc().eggs[slot] = egg;
    saveState();
    return { slot, rarity: egg.rarity, need: egg.need };
  },

  /** 自訂題 id 集合（只計內置題） */
  _customIds() {
    const list = loadState().customQuestions || [];
    return new Set(list.filter(Boolean).map((/** @type {any} */ q) => String(q.id)));
  },

  /** 一回合結算：答啱嘅內置題加落所有開住、未滿嘅蛋。回傳呢回合先夠數嘅 slot */
  /** @param {{ results?: { qid: string, correct: boolean }[] }} data @returns {Promise<number[]>} */
  async addRound(data) {
    const add = Math.min(20, IncubatorRules.builtInCorrect(data && data.results, this._customIds()));
    if (add <= 0) return [];
    if (this._authed()) {
      const inc = this._inc();
      if (!inc.eggs[0] && !inc.eggs[1]) return [];   /* 冇蛋唔使 call */
      let r = null;
      try { r = await this._auth().incubatorAdd(add); } catch (e) { r = null; }
      if (!r || r.error) return [];
      this._adopt(r);
      return Array.isArray(r.ready) ? r.ready.map(Number) : [];
    }
    const { eggs, s2 } = this.state();
    const out = IncubatorRules.applyRound(eggs, s2, add);
    this._inc().eggs = out.eggs;
    saveState();
    return out.ready;
  },

  /** 夠數先孵；回傳同扭蛋 settlement 一樣嘅形狀（俾 #gacha-inspect 結果卡用） */
  /** @param {number} slot */
  async hatch(slot) {
    const inc = this._inc();
    const egg = inc.eggs[slot];
    if (!egg || egg.progress < egg.need) return null;
    /* Gacha 係 classic script 嘅頂層 const：唔喺 globalThis，要直接用名（Rule 119） */
    const G = typeof Gacha !== "undefined" ? Gacha : null;
    if (!G) return null;
    const st = loadState();
    const gen = st.unlockedGen || 1;
    if (this._authed()) {
      let r = null;
      try { r = await this._auth().hatchEgg(slot, gen); } catch (e) { r = null; }
      if (!r || r.error || !r.entry) return null;
      const got = G._applyServerPull(r, true);
      this._inc().eggs[slot] = null;
      saveState();
      return got;
    }
    let pool = pullablePool(gen, egg.rarity) || [];
    if (!pool.length) pool = pullablePool(1, egg.rarity) || [];
    if (!pool.length) return null;
    const key = pool[Math.floor(Math.random() * pool.length)];
    const got = G._applyLocalPull(key, egg.rarity, true);
    if (!got) return null;
    this._inc().eggs[slot] = null;
    saveState();
    return got;
  },

  /** 丟棄：進度清零、鑽唔退；夠數嘅蛋唔准丟 */
  /** @param {number} slot @returns {Promise<boolean>} */
  async discard(slot) {
    const egg = this._inc().eggs[slot];
    if (!egg) return true;
    if (egg.progress >= egg.need) return false;
    if (this._authed()) {
      let r = null;
      try { r = await this._auth().discardEgg(slot); } catch (e) { r = null; }
      if (!r || r.error) return false;
    }
    this._inc().eggs[slot] = null;
    saveState();
    return true;
  },

  /** 孵化器頁「逐格亮起」用：記低用戶睇過嘅進度 */
  /** @param {number} slot @param {number} progress */
  markSeen(slot, progress) {
    const egg = this._inc().eggs[slot];
    if (!egg) return;
    egg.seen = Math.min(egg.need, Math.max(0, progress | 0));
    saveState();
  },

  /** 夠數未孵嘅 slot（結算離開咗、或者之前未撳 Done 嘅蛋） */
  readySlots() {
    return this._inc().eggs.map((e, i) => (e && e.progress >= e.need ? i : -1)).filter((i) => i >= 0);
  }
};

Object.assign(globalThis, { Incubator });
