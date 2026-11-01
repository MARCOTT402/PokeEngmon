/* ============================================================
   PokeEngmon Battle - 可播種亂數（PvP 同步地基，Task 9）
   mulberry32 PRNG：同一個 seed 逐 call 順序攞數，兩邊客戶端
   會得出完全一樣嘅序列 → 雙方各自模擬結果一致。
   AI 戰：開局用真隨機整一個 seed 落去，行為同以前一樣。
   ============================================================ */

const BattleRng = (() => {
  let s = 1;   /* 內部狀態（32-bit）；同一場戰鬥共用一條 stream */
  function seed(n) { s = (n >>> 0) || 1; }
  /* 回傳 [0, 1) float，取代 Math.random() */
  function next() {
    s |= 0; s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  return {
    seed, next,
    state: () => s >>> 0   /* 除錯 / 同步校驗用 */
  };
})();

if (typeof module !== "undefined" && module.exports) module.exports = BattleRng;
