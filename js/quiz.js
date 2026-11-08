/* ============================================================
   PokeEngmon - 做題流程（v2：句子內逐詞空格）
   10 題一組 · 逐格自動轉綠 · L1/L2 提示 · 同回合重排 · SM-2 v3
   ============================================================ */

const Quiz = {
  set: [],            // 初始題目（固定分母）
  queue: [],          // 工作佇列：{ q, requeued, dueAt }
  total: 0,
  seenQids: new Set(),
  answers: new Map(), // key → { hintCount, hintEver, clean, chosen }
  cells: [],
  currentCell: 0,
  answered: false,
  mode: null,             /* null | "gym" */
  gymMilestone: 0,
  startTime: 0,
  _curCard: null,
  _curQuestionStart: 0,
  _wordToken: 0,
  _imgToken: 0,

  /* ============ 小學生低 EF 精靈球捕捉模式 ============ */
  _catchThreshold: 1.8,

  /* ---------- 物理引擎 ---------- */
  _physGravity: 0.16,
  _physRestitution: 0.9,
  _physAirFriction: 0.999,
  _physThrowScale: 0.22,
  _physGen: 0,
};

/* ES module 過渡期（總計劃 P2.3；Rule 119）：index.html 用 type="module" 載入，頂層名唔會自動變全域 → 明確掛上 globalThis，classic script 照用 */
Object.assign(globalThis, { Quiz });
