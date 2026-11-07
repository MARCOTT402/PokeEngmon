/* ============================================================
   PokeEngmon - 扭蛋抽獎系統（v102 快龍拉手版）
   流程：拉動快龍隻手 ≥72%（即扣 3 寶石）→ 肚仔艙門打開
     → 跌出精靈球（稀有度決定球種）→ 金色背景 A 滾入
     → 搖 2 下懸念 → 按稀有度爆發 → 開球光柱 → 全屏檢視卡
   經濟結算沿用 v99/v101 server 權威（gacha_pull RPC），
   演出層完全解耦：中途離開只跳過動畫，獎勵照樣落地。
   ============================================================ */

/* 稀有度 → 球種 / 漏光 / 檢視卡光線色 */
const GACHA_BALL = {
  rare:   { cls: "ball-great",  glow: "leak-blue",    ray: "#7fb8ff", label: "RARE" },
  epic:   { cls: "ball-ultra",  glow: "leak-gold",    ray: "#c984ff", label: "EPIC" },
  legend: { cls: "ball-master", glow: "leak-rainbow", ray: "#ffc93c", label: "LEGENDARY" }
};
const GACHA_MAX_PULL = 150;     // 手臂最大下拉距離（px）
const GACHA_THRESHOLD = 0.72;   // 拉過 72% 即觸發，唔使放手
const GACHA_CHARGE_MS = 3000;      // 按住手杆幾耐先充滿 10 連
const GACHA_MULTI_THRESHOLD = 0.35; // 充滿後只需拉 35% 即發動
/* status bar 同款藍寶石 icon（dynamic 注入用，例如檢視卡按鈕） */
const GACHA_GEM_SVG = `<svg class="gem-ico" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10.5" fill="none" stroke="#062036" stroke-width="1.6"/><circle cx="12" cy="12" r="10" fill="url(#gem-blue-gt)"/><ellipse cx="8" cy="7.5" rx="4" ry="2.5" fill="#ffffff" opacity="0.55"/><ellipse cx="15" cy="5.5" rx="1.8" ry="1" fill="#ffffff" opacity="0.45"/><ellipse cx="12" cy="18" rx="6" ry="1.5" fill="#000000" opacity="0.2"/></svg>`;

const Gacha = {
  mode: "rare",        // 淨返稀有抽（normal pull 已移除）
  busy: false,
  phase: "idle",       // idle | hand | opening | drop | sceneB | inspect
  _flowId: 0,          // 流程 token：離開頁面後作廢所有 pending timeout
  _flow: null,         // 當前流程（結算狀態綁喺 flow object，避免中斷污染其他流程）
  _timers: [],
  _bound: false,
  /* 拖拽狀態 */
  _dragging: false, _startY: 0, _curP: 0, _triggered: false, _lastCreak: 0,
  _sceneB: null,       // lazy 金色背景 A overlay（掛 body）
  _inspect: null,      // lazy 檢視卡 overlay（掛 body）
  _pendingEvolve: null,
  _pendingEvolves: [],  // 10 連可能一次過進化多隻
  _townStopped: false,
  /* 10 連充能狀態 */
  _charging: false, _charged: false, _chargeTimer: null, _chargeStart: 0,
  _holdStart: 0, _holdMs: 0, _suppressClick: false,
  /* 10 連結算 overlay */
  _multi: null, _multiResults: null, _multiMeta: null,
};
