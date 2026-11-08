// @ts-check
/* ============================================================
   PokeEngmon — Trainer Lv（訓練員等級）
   Spec：.trae/specs/20261108-trainer-level.md
   - EXP 全部由 server 計（_grant_trainer_exp），client 只讀：
     結算 RPC 回應有 `trainer` 欄 → SupabaseAuth._rpc 會 call TrainerLevel.adopt()
   - 升級曲線同 server `_trainer_lv()` 一樣：Lv N → N+1 要 100 + 20 × (N − 1)；Lv100 封頂
   - 只 reward 唔 punish（Rule 123）：呢度冇任何扣 EXP 邏輯
   ============================================================ */

const TrainerLevel = (() => {
  const MAX_LV = 100;

  /** @param {number} lv */
  function expToNext(lv) {
    return lv >= MAX_LV ? 0 : 100 + 20 * (lv - 1);
  }

  /** 非有限／負數當 0（Rule 99） @param {any} exp */
  function clean(exp) {
    const n = Number(exp);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  }

  /** @param {any} exp @returns {{ lv: number, into: number, need: number, total: number }} */
  function levelFromExp(exp) {
    const total = clean(exp);
    let lv = 1, rest = total;
    while (lv < MAX_LV && rest >= expToNext(lv)) { rest -= expToNext(lv); lv++; }
    return { lv, into: lv >= MAX_LV ? 0 : rest, need: expToNext(lv), total };
  }

  const loggedIn = () => !!(typeof SupabaseAuth !== "undefined" && SupabaseAuth.isLoggedIn && SupabaseAuth.isLoggedIn());

  /** 自己嘅等級；未登入（server 唔計）回 null */
  function mine() {
    if (!loggedIn()) return null;
    return levelFromExp(loadState().trainerExp);
  }

  /** 收 server 回應嘅 trainer 欄 @param {any} t */
  function adopt(t) {
    if (!t || typeof t !== "object") return;
    const exp = Number(t.exp);
    if (!Number.isFinite(exp) || exp < 0) return;
    const st = loadState();
    const before = levelFromExp(st.trainerExp).lv;
    st.trainerExp = Math.floor(exp);
    const award = Number(t.diamonds_awarded) || 0;
    const bal = Number(t.balance);
    if (award > 0 && Number.isFinite(bal)) st.diamonds = bal;
    saveState();
    const after = levelFromExp(st.trainerExp).lv;
    if (after > before) {
      try {
        const msg = `Trainer Lv ${after}!` + (award > 0 ? ` 💎+${award}` : "");
        if (typeof window !== "undefined" && window.App && App.toast) App.toast(msg);
      } catch (e) { /* toast 唔可以阻結算 */ }
    }
    try { document.dispatchEvent(new CustomEvent("trainer-exp-changed", { detail: { exp: st.trainerExp, lv: after, lvUp: after > before } })); } catch (e) { /* 測試環境冇 CustomEvent */ }
  }

  /* 其他訓練員嘅 Lv（Friends 名單、排行榜）：RPC get_trainer_levels，未登入都得（_rpcTable 用 anon key）
     @param {Array<string|null|undefined>} uids @returns {Promise<Map<string, number>>}（key = 細楷 uid） */
  async function fetchLevels(uids) {
    const ids = [...new Set((uids || []).filter(Boolean).map(String))].slice(0, 60);
    /** @type {Map<string, number>} */
    const out = new Map();
    if (!ids.length || typeof SupabaseAuth === "undefined" || !SupabaseAuth._rpcTable) return out;
    const res = await SupabaseAuth._rpcTable("get_trainer_levels", { p_uids: ids });
    const obj = Array.isArray(res) ? res[0] : res;
    const list = obj && Array.isArray(obj.levels) ? obj.levels : [];
    for (const r of list) if (r && r.uid) out.set(String(r.uid).toLowerCase(), levelFromExp(r.exp).lv);
    return out;
  }

  /** 細牌（PokeRogueEmerald）；冇 lv 回空字串 @param {number|null|undefined} lv */
  function badgeHTML(lv) {
    return lv ? `<span class="tl-badge"><i>Lv</i>${lv}</span>` : "";
  }

  /** 將 Lv 填入 root 入面所有 [data-lvuid] 空位（畫完列表先攞 Lv，唔使重畫／重綁掣）
      @param {ParentNode|null} root @param {Map<string, number>} map */
  function fillBadges(root, map) {
    if (!root || !map || !map.size) return;
    root.querySelectorAll("[data-lvuid]").forEach(el => {
      const lv = map.get(String(/** @type {HTMLElement} */ (el).dataset.lvuid || "").toLowerCase());
      if (lv) el.innerHTML = badgeHTML(lv);
    });
  }

  return { MAX_LV, expToNext, levelFromExp, mine, adopt, fetchLevels, badgeHTML, fillBadges };
})();

/* ES module 過渡期（Rule 119）：index.html 用 type="module" 載入 → 明確掛上 globalThis */
Object.assign(globalThis, { TrainerLevel });
