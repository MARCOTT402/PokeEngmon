// @ts-check
/* ============================================================
   PokeEngmon - 扭蛋「預兆路線」（快龍空投單抽；spec .trae/specs/20261107-gacha-redesign.md §4）
   只係演出：起始球種 + 升級次數 + tease + 拖光。最終球種一定等於 server 結算嘅稀有度：
   rare → great、epic → ultra、legend → master。
   機率：rare tease 25%；epic 55% great→ultra；legend 40% great→ultra→master、40% ultra→master、
   20% 直接 master＋彩虹拖光。
   ============================================================ */

const GachaTells = {
  /** 稀有度色（spec §3）：Great 藍、Ultra 金、Master 紫 */
  BALL_COL: { great: "#4aa8ff", ultra: "#ffc93c", master: "#c77dff" },

  /**
   * @param {"rare"|"epic"|"legend"} rarity
   * @param {() => number} [rand]
   * @returns {{ start: "great"|"ultra"|"master", ups: ("ultra"|"master")[], tease: boolean, trail: "#ffffff"|"#ffc93c"|"rainbow" }}
   */
  plan(rarity, rand = Math.random) {
    const r = rand();
    if (rarity === "epic") {
      return r < 0.55
        ? { start: "great", ups: ["ultra"], tease: false, trail: rand() < 0.5 ? "#ffc93c" : "#ffffff" }
        : { start: "ultra", ups: [], tease: false, trail: "#ffc93c" };
    }
    if (rarity === "legend") {
      if (r < 0.4) return { start: "great", ups: ["ultra", "master"], tease: false, trail: "#ffc93c" };
      if (r < 0.8) return { start: "ultra", ups: ["master"], tease: false, trail: "#ffc93c" };
      return { start: "master", ups: [], tease: false, trail: "rainbow" };
    }
    return { start: "great", ups: [], tease: r < 0.25, trail: "#ffffff" };
  }
};

Object.assign(globalThis, { GachaTells });
