// @ts-check
/* ============================================================
   PokeEngmon - 孵化器純規則（spec .trae/specs/20261107-gacha-redesign.md §10 孵化器 v4）
   冇 DOM、冇存檔：由 js/incubator/incubator.js（狀態／同步）同 UI 調用；server RPC 用同一套規則。
   - Claim 💎3；機率 Common 30%／Rare 40%／Epic 20%／Legendary 10%；題數 30／80／140／200。
   - Slot 1 永遠開；Slot 2 未解鎖過 → 連續 7 日解鎖；之後 streak 斷咗 → 再連續 3 日解鎖。
     有蛋而未解鎖 = 凍結（唔計題、進度唔跌）。
   - 一條答啱（clean）嘅內置題同時計落所有開住、未滿嘅蛋；customQuestions 唔計。
   ============================================================ */

/** @typedef {"normal"|"rare"|"epic"|"legend"} EggRarity */
/** @typedef {{ rarity: EggRarity, need: number, progress: number, seen: number }} Egg */
/** @typedef {{ ever: boolean, on: boolean, last: number }} Slot2 */

const IncubatorRules = {
  NEED: { normal: 30, rare: 80, epic: 140, legend: 200 },
  /** @type {[EggRarity, number][]} */
  ODDS: [["normal", 0.30], ["rare", 0.40], ["epic", 0.20], ["legend", 0.10]],
  CLAIM_COST: 3,
  SLOT2_FIRST: 7,
  SLOT2_AGAIN: 3,
  /** 孵蛋演出級別（結算小視窗） */
  HATCH_LV: { normal: 0, rare: 2, epic: 3, legend: 4 },

  /** @param {() => number} [rand] @returns {EggRarity} */
  rollRarity(rand = Math.random) {
    let r = rand();
    for (const [rarity, p] of this.ODDS) {
      if (r < p) return rarity;
      r -= p;
    }
    return "legend";
  },

  /** @param {EggRarity} rarity @returns {Egg} */
  makeEgg(rarity) {
    return { rarity, need: this.NEED[rarity], progress: 0, seen: 0 };
  },

  /**
   * Slot 2 解鎖狀態：解鎖後 streak 冇斷就一直開；streak 變細 = 斷咗。回傳新物件。
   * @param {Slot2} s2 @param {number} streak @returns {Slot2}
   */
  syncSlot2(s2, streak) {
    const next = { ever: !!s2.ever, on: !!s2.on, last: streak };
    if (next.on && streak < s2.last) next.on = false;
    if (!next.on && streak >= (next.ever ? this.SLOT2_AGAIN : this.SLOT2_FIRST)) {
      next.on = true;
      next.ever = true;
    }
    return next;
  },

  /**
   * @param {0|1} i @param {(Egg|null)[]} eggs @param {Slot2} s2（已經 sync 過）
   * @returns {"open"|"frozen"|"locked"}
   */
  slotState(i, eggs, s2) {
    if (i === 0 || s2.on) return "open";
    return eggs[1] ? "frozen" : "locked";
  },

  /** @param {(Egg|null)[]} eggs @param {Slot2} s2 @returns {0|1|null} */
  freeSlot(eggs, s2) {
    if (!eggs[0]) return 0;
    if (!eggs[1] && this.slotState(1, eggs, s2) === "open") return 1;
    return null;
  },

  /**
   * @param {{ qid: string, correct: boolean }[] | undefined} results
   * @param {Set<string>} customIds
   */
  builtInCorrect(results, customIds) {
    if (!Array.isArray(results)) return 0;
    return results.filter((r) => r && r.correct && !customIds.has(r.qid)).length;
  },

  /**
   * 一回合答啱 add 題：加落所有開住、未滿嘅蛋。唔刪蛋、唔改 input。
   * @param {(Egg|null)[]} eggs @param {Slot2} s2 @param {number} add
   * @returns {{ eggs: (Egg|null)[], ready: number[] }} ready = 呢回合先夠數嘅 slot
   */
  applyRound(eggs, s2, add) {
    /** @type {number[]} */
    const ready = [];
    const out = eggs.map((e, i) => {
      if (!e) return null;
      const egg = { ...e };
      if (egg.progress < egg.need && this.slotState(/** @type {0|1} */ (i), eggs, s2) === "open") {
        egg.progress = Math.min(egg.need, egg.progress + Math.max(0, add));
        if (egg.progress >= egg.need) ready.push(i);
      }
      return egg;
    });
    return { eggs: out, ready };
  },

  /** 熱度階段 0–4 @param {number} progress @param {number} need */
  stageOf(progress, need) {
    const r = progress / need;
    return r >= 1 ? 4 : r >= 0.75 ? 3 : r >= 0.5 ? 2 : r >= 0.25 ? 1 : 0;
  },

  /** 分段環：30 題以內 1 格 = 1 題，之後 1 格 = 5 題 @param {number} need */
  perSeg(need) {
    return need <= 30 ? 1 : 5;
  }
};

Object.assign(globalThis, { IncubatorRules });
