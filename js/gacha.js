/* ============================================================
   PokeEngmon - 扭蛋抽獎系統（v2「快龍空投」；spec .trae/specs/20261107-gacha-redesign.md §4）
   單抽流程：撳 1× 大掣（即扣 3 寶石）→ 快龍由遠飛近 → 懸停擲波 → 落地 → 升級／tease
     → 撳 3 下開 → riser＋靜默 → 爆發 → 剪影 → 上色 → 檢視卡（js/gacha/scene.js）
   10 連暫時沿用舊演出（js/gacha/multi.js；新 10 連另開計劃）
   經濟結算沿用 v99/v101 server 權威（gacha_pull RPC），
   演出層完全解耦：中途離開只跳過動畫，獎勵照樣落地。
   ============================================================ */

/* 稀有度 → 球種 / 漏光 / 檢視卡光線色 */
const GACHA_BALL = {
  rare:   { cls: "ball-great",  glow: "leak-blue",    ray: "#7fb8ff", label: "RARE" },
  epic:   { cls: "ball-ultra",  glow: "leak-gold",    ray: "#ffc93c", label: "EPIC" },        /* spec §3 統一色：Epic 金 */
  legend: { cls: "ball-master", glow: "leak-rainbow", ray: "#c77dff", label: "LEGENDARY" }    /* Legend 紫 */
};
/* status bar 同款藍寶石 icon（dynamic 注入用，例如檢視卡按鈕） */
const GACHA_GEM_SVG = `<svg class="gem-ico" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10.5" fill="none" stroke="#062036" stroke-width="1.6"/><circle cx="12" cy="12" r="10" fill="url(#gem-blue-gt)"/><ellipse cx="8" cy="7.5" rx="4" ry="2.5" fill="#ffffff" opacity="0.55"/><ellipse cx="15" cy="5.5" rx="1.8" ry="1" fill="#ffffff" opacity="0.45"/><ellipse cx="12" cy="18" rx="6" ry="1.5" fill="#000000" opacity="0.2"/></svg>`;

const Gacha = {
  mode: "rare",        // 淨返稀有抽（normal pull 已移除）
  busy: false,
  phase: "idle",       // idle | opening | drop | sceneB | stage | inspect
  _flowId: 0,          // 流程 token：離開頁面後作廢所有 pending timeout
  _flow: null,         // 當前流程（結算狀態綁喺 flow object，避免中斷污染其他流程）
  _timers: [],
  _bound: false,
  _sceneB: null,       // lazy 金色背景 A overlay（10 連用；掛 body）
  _stage: null,        // lazy 快龍空投單抽 overlay（display window；掛 body）
  _stageRig: null,     // 演出用快龍 rig
  _lobbyRig: null,     // 大堂快龍 rig（idle）
  _s2seq: 0,           // 單抽演出 token：SKIP／abort 作廢進行中嘅時間線
  _s2tls: [],          // 單抽演出進行中嘅 GSAP timeline（清場一次過 kill）
  _stageFx: null,      // 單抽演出粒子（GachaFX.makeParticles）
  _tapCleanup: null,   // 撳 3 下 listener 清除
  _lobbyBound: false,
  _inspect: null,      // lazy 檢視卡 overlay（掛 body）
  _pendingEvolve: null,
  _pendingEvolves: [],  // 10 連可能一次過進化多隻
  _townStopped: false,
  /* 10 連結算 overlay */
  _multi: null, _multiResults: null, _multiMeta: null,
};

/* ES module 過渡期（總計劃 P2.3；Rule 119）：index.html 用 type="module" 載入，頂層名唔會自動變全域 → 明確掛上 globalThis，classic script 照用 */
Object.assign(globalThis, { Gacha, GACHA_BALL, GACHA_GEM_SVG });
