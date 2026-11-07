﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿/* ============================================================
   PokeEngmon - 主流程
   路由 / 主畫面 / 題型選擇 + CSV 匯入 / 結算獎勵 / 錯題回顧 / 進化 / Modal
   ============================================================ */

const APP_VERSION = "1.71.2";

const App = {
  lastRecord: null,   // 今次做完嘅一組（結算 / 錯題回顧用）
  pendingEvolve: null,
  selectedTopics: new Set(),   // 題型選擇
  _sheetSwitching: false,       /* 上框 sheet 切換中（close→open timer 期間 block 重複 click） */

  /* ---------- 響應式版面（spec .trae/specs/20261106-responsive-layout.md） ----------
   * 斷點同 css/style.css 頂部「LAYOUT BREAKPOINTS」註解一致，改一邊就要改另一邊：
   *   phone-land : landscape 且 height < 500 且 pointer: coarse（桌面矮視窗唔算）
   *   wide       : width ≥ 900 且 height ≥ 560
   *   tablet     : width ≥ 700
   *   phone      : 其餘
   * 只按可用闊／高度同輸入能力決定，唔睇 UA／裝置型號。 */
  _layoutMQ: null,

  /* 轉場時間（Rule 100）：sheet 捲入／出 = CSS .ph-sheet transform 時長；改一邊要同步另一邊。
     舊做法係「收完 400ms → 等 410ms → 先開」，用戶要等約 0.8 秒先見到新內容 */
  SHEET_MS: 220,
  SHEET_SWAP_MS: 60,        /* 切換 sheet：舊 sheet 開始收之後幾耐開新 sheet（同時進行嘅錯開） */
  OVERLAY_EXIT_MS: 200,     /* Friends／Leaderboard／Battle Menu exit 動畫；CSS 同步 */
};

/* 首屏 Loading overlay：載入完成後淡出移除。
   失敗或超時都一定要收走，唔可以永遠轉精靈球。 */
let _loadingDone = false;
function dismissLoading() {
  if (_loadingDone) return;
  _loadingDone = true;
  const el = document.getElementById("loading-screen");
  if (!el) return;
  el.classList.add("ld-out");
  setTimeout(() => el.remove(), 420);
}
function armLoadingWatchdog() {
  /* 12 秒：提示可以撳重試（慢網第一次開可能真係要咁耐，唔好即刻判死） */
  setTimeout(() => {
    if (_loadingDone) return;
    const sub = document.getElementById("loading-sub");
    if (sub) sub.textContent = "Still loading… tap here to retry";
    const el = document.getElementById("loading-screen");
    if (el) el.addEventListener("click", () => location.reload(), { once: true });
  }, 12000);
  /* 30 秒仲未好 → 兜底畫面（Retry／Repair app），唔可以永遠轉精靈球（Rule 94） */
  setTimeout(() => {
    if (_loadingDone) return;
    if (window.Guard) Guard.fatal("boot-timeout", new Error("Boot did not finish in 30s"));
  }, 30000);
}

document.addEventListener("DOMContentLoaded", () => {
  try { App._initLayout(); } /* 最早標記 data-layout，init 期間嘅 render 已經可以讀 */
  catch (e) { if (window.Guard) Guard.report(e, { where: "initLayout", silent: true }); }
  armLoadingWatchdog();
  App.init().then(dismissLoading).catch((err) => {
    console.error("[boot] init failed", err);
    _loadingDone = true;
    /* init 中途失敗＝好多掣未綁，留低半殘主頁等於白屏 → 兜底畫面（Rule 94） */
    if (window.Guard) Guard.fatal("boot", err);
    else dismissLoading();
  });
});

/* 其他模組（friends.js / quests.js）用 window.App 判斷，補返個全域引用 */
window.App = App;
