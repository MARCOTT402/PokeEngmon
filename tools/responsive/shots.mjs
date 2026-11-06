// 響應式版面截圖 + rect 記錄（Responsive P1 Task 0 / Task 11）
//
//   node tools/responsive/shots.mjs --out <dir>                 # 全部尺寸 × 全部畫面
//   node tools/responsive/shots.mjs --out <dir> --sizes S1,S2   # 只跑指定尺寸
//   node tools/responsive/shots.mjs --out <dir> --scenes home,quiz
//   node tools/responsive/shots.mjs --compare <baselineDir> <newDir>   # 比較 rects.json
//
// 用 headless Chrome + CDP Emulation.setDeviceMetricsOverride（Rule 26：--window-size 出唔到細視口）。
// 每個畫面都重新載入 index.html，避免 sheet 狀態互相影響。首次會經 _seedtest.html 種本地資料。
// 需要本地 server：http://localhost:8080（.claude/launch.json 嘅 static）。

import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = argv.indexOf("--" + name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/* ---------- 驗收矩陣（同 plan 一致） ---------- */
const SIZES = {
  S1: { w: 375, h: 667, touch: true, expect: "phone" },
  S2: { w: 440, h: 956, touch: true, expect: "phone" },
  S3: { w: 820, h: 1180, touch: true, expect: "tablet" },
  S4: { w: 1180, h: 820, touch: true, expect: "wide" },
  S5: { w: 1366, h: 640, touch: false, expect: "wide" },
  S6: { w: 1440, h: 900, touch: false, expect: "wide" },
  S7: { w: 1920, h: 1080, touch: false, expect: "wide" },
  S8: { w: 956, h: 440, touch: true, expect: "phone-land" },
  S9: { w: 1000, h: 500, touch: false, expect: "tablet" }
};

/* 每個畫面：喺頁面 global scope 執行（可以直接用 const App / Quiz，Rule 38） */
const SCENES = {
  home: "",
  "sheet-calendar": `document.getElementById('btn-bezel-streak').click()`,
  "sheet-pokedex": `document.getElementById('btn-bezel-dex').click()`,
  "sheet-quests": `document.getElementById('btn-bezel-energy').click()`,
  "sheet-setting": `document.getElementById('btn-bd-setting').click()`,
  "sheet-battle": `document.getElementById('btn-bd-battle').click()`,
  "sheet-gacha": `document.getElementById('btn-bezel-diamond').click()`,
  "quiz-setup": `document.getElementById('btn-start-quiz').click()`,
  friends: `document.getElementById('btn-bd-friends').click()`,
  leaderboard: `document.getElementById('btn-bd-leaderboard').click()`,
  quiz: `document.getElementById('btn-start-quiz').click(); await new Promise(r => setTimeout(r, 900)); document.getElementById('btn-setup-start').click()`,
  settlement: `App.showView('view-settlement')`,
  /* 有內容嘅結算：借真題 qid 砌假成績，只 render（唔寫 state） */
  "settlement-full": `document.getElementById('btn-start-quiz').click(); await new Promise(r => setTimeout(r, 800));
    document.getElementById('btn-setup-start').click(); await new Promise(r => setTimeout(r, 1200));
    const qs = Quiz.set.slice(0, 10);
    const results = qs.map((q, i) => ({ qid: q.qid || q.id, correct: i % 3 !== 0, hint: i === 3 }));
    const data = { score: results.filter(r => r.correct).length, total: qs.length, duration: 185000, wrongTries: 4, bestCombo: 5, results };
    App.showView('view-settlement');
    App._renderSettlement(data, { diamonds: 3, exp: 120, drops: [], fainted: false });`,
  /* modal-* scene 唔會喺動作後再隱藏 .modal-backdrop（要影 modal 本身） */
  "modal-login": `App.openLoginHub()`,
  "modal-rename": `App.openRename()`,
  "modal-toast": `document.getElementById('btn-start-quiz').click(); await new Promise(r => setTimeout(r, 700)); App.toast('Toast position check')`
};

/* 要記錄位置嘅元素 */
const RECT_SELECTORS = [
  ".pd-shell", ".pd-deco", ".pd-bezel", ".pd-screen2", ".pd-chin",
  ".ph-sign", ".ph-cta", ".ph-bottomdock", ".ph-sheets",
  "#view-home .ph-sheet.ph-open", ".view.active:not(#view-home)",
  "#quiz-keyboard", "#quiz-scroll", ".toast", ".modal-card"
];

/* ---------- compare 模式 ---------- */
if (argv[0] === "--compare") {
  const a = JSON.parse(readFileSync(join(argv[1], "rects.json"), "utf8"));
  const b = JSON.parse(readFileSync(join(argv[2], "rects.json"), "utf8"));
  let diffs = 0;
  for (const key of Object.keys(a)) {
    if (!b[key]) { console.log(`MISSING  ${key}`); diffs++; continue; }
    for (const sel of Object.keys(a[key].rects)) {
      const ra = JSON.stringify(a[key].rects[sel]);
      const rb = JSON.stringify(b[key].rects[sel]);
      if (ra !== rb) { console.log(`DIFF     ${key}  ${sel}\n   before ${ra}\n   after  ${rb}`); diffs++; }
    }
  }
  console.log(diffs ? `\n${diffs} difference(s)` : "No differences.");
  process.exit(diffs ? 1 : 0);
}

const OUT = arg("out", "");
if (!OUT) { console.error("--out <dir> required"); process.exit(1); }
mkdirSync(OUT, { recursive: true });
const BASE = arg("base", "http://localhost:8080");
const PORT = Number(arg("port", 9241));
/* headless Chrome 一旦開過 touch emulation，`(pointer: coarse)` 就停喺 true（關返都冇用），
   所以非觸控尺寸一定要排先跑，否則桌面尺寸會誤當觸控（例如答題顯示 App 鍵盤）。 */
const sizeKeys = arg("sizes", Object.keys(SIZES).join(",")).split(",")
  .sort((a, b) => Number(!!(SIZES[a] || {}).touch) - Number(!!(SIZES[b] || {}).touch));
const sceneKeys = arg("scenes", Object.keys(SCENES).join(",")).split(",");

const CHROME_CANDIDATES = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  join(process.env.LOCALAPPDATA || "", "Google\\Chrome\\Application\\chrome.exe"),
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome"
];
const chromePath = CHROME_CANDIDATES.find(p => p && existsSync(p));
if (!chromePath) { console.error("Chrome not found."); process.exit(1); }

const chrome = spawn(chromePath, [
  "--headless=new", "--disable-gpu", "--hide-scrollbars", "--mute-audio",
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${join(tmpdir(), "pe-shots-" + Date.now())}`,
  "about:blank"
], { stdio: "ignore" });

let ws, seq = 0;
const pending = new Map();
const send = (method, params = {}) => new Promise(resolve => {
  const id = ++seq;
  pending.set(id, resolve);
  ws.send(JSON.stringify({ id, method, params }));
});
const evaluate = async (expression) => {
  const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (r && r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 400));
  return r && r.result ? r.result.value : undefined;
};

async function connect() {
  for (let i = 0; i < 50; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
      const page = list.find(t => t.type === "page");
      if (page) {
        ws = new WebSocket(page.webSocketDebuggerUrl);
        await new Promise(r => (ws.onopen = r));
        ws.onmessage = (ev) => {
          const m = JSON.parse(ev.data);
          if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); }
        };
        return;
      }
    } catch {}
    await sleep(300);
  }
  throw new Error("Cannot connect to Chrome via CDP");
}

async function load(url, wait) {
  await send("Page.navigate", { url });
  await sleep(wait);
}

/* Login Gate 會喺載入後 500ms 彈出：隱藏佢（只改 inline style，唔改 state） */
const HIDE_GATE = `document.querySelectorAll('.modal-backdrop').forEach(m => { m.style.display = 'none'; })`;

const COLLECT = `(() => {
  const r = (el) => { if (!el) return null; const b = el.getBoundingClientRect();
    if (!b.width && !b.height) return null;
    return [Math.round(b.left), Math.round(b.top), Math.round(b.width), Math.round(b.height)]; };
  const rects = {};
  for (const s of ${JSON.stringify(RECT_SELECTORS)}) rects[s] = r(document.querySelector(s));
  return {
    layout: document.documentElement.dataset.layout || null,
    innerWidth, innerHeight,
    scrollWidth: document.documentElement.scrollWidth,
    activeViews: [...document.querySelectorAll('.view.active')].map(v => v.id),
    rects
  };
})()`;

async function main() {
  await connect();
  await send("Page.enable");
  await send("Runtime.enable");
  const errors = [];
  ws.addEventListener("message", (ev) => {
    const m = JSON.parse(ev.data);
    if (m.method === "Runtime.exceptionThrown") errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
  });

  /* 種本地資料（只做一次，localStorage 喺同一個 profile 保留） */
  await send("Emulation.setDeviceMetricsOverride", { width: 440, height: 956, deviceScaleFactor: 1, mobile: true });
  await load(`${BASE}/_seedtest.html`, 2500);

  const results = {};
  for (const sk of sizeKeys) {
    const sz = SIZES[sk];
    if (!sz) { console.log(`skip unknown size ${sk}`); continue; }
    await send("Emulation.setDeviceMetricsOverride", {
      width: sz.w, height: sz.h, deviceScaleFactor: 1, mobile: sz.touch && Math.min(sz.w, sz.h) < 700,
      screenOrientation: sz.w > sz.h ? { type: "landscapePrimary", angle: 90 } : { type: "portraitPrimary", angle: 0 }
    });
    await send("Emulation.setTouchEmulationEnabled", { enabled: sz.touch, maxTouchPoints: sz.touch ? 5 : 0 });
    for (const sc of sceneKeys) {
      if (!(sc in SCENES)) { console.log(`skip unknown scene ${sc}`); continue; }
      errors.length = 0;
      await load(`${BASE}/index.html`, 3200);
      /* 「Are you ready…」entry gate：撳 YES 入 app（同 preview-iphone 一樣） */
      await evaluate(`document.getElementById('btn-entry-yes')?.click()`);
      await sleep(1200);
      await evaluate(HIDE_GATE);
      let sceneErr = null;
      if (SCENES[sc]) {
        try { await evaluate(`(async () => { ${SCENES[sc]} })()`); } catch (e) { sceneErr = String(e.message || e); }
        await sleep(1300);
        if (!sc.startsWith("modal-")) await evaluate(HIDE_GATE);
      }
      const data = await evaluate(COLLECT);
      data.expect = sz.expect;
      data.errors = [...errors];
      if (sceneErr) data.sceneError = sceneErr;
      const key = `${sc}@${sk}`;
      results[key] = data;
      const shot = await send("Page.captureScreenshot", { format: "png" });
      writeFileSync(join(OUT, `${sc}-${sk}.png`), Buffer.from(shot.data, "base64"));
      const flags = [
        data.scrollWidth > data.innerWidth ? "H-SCROLL" : "",
        data.errors.length ? `ERR×${data.errors.length}` : "",
        sceneErr ? "SCENE-ERR" : ""
      ].filter(Boolean).join(" ");
      console.log(`${key.padEnd(24)} layout=${String(data.layout).padEnd(10)} views=${data.activeViews.join("+")} ${flags}`);
    }
  }
  writeFileSync(join(OUT, "rects.json"), JSON.stringify(results, null, 1));
  console.log(`\nSaved ${Object.keys(results).length} shots + rects.json → ${OUT}`);
  chrome.kill();
  process.exit(0);
}

main().catch(err => { console.error(err); chrome.kill(); process.exit(1); });
