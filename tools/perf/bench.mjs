// 效能基線（stability-performance plan §5.7）：headless Chrome + CDP，CPU 降速模擬手機。
// 量：首屏、Quiz.start（全部課題）同步阻塞、每答一題（upsertCard + appendHistory）、sheet 切換到新內容可見。
// 前置：本地 server http://localhost:8080（.claude/launch.json static）。
// 用法：node tools/perf/bench.mjs [--cpu 4] [--runs 3] [--out result.json]
import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os"; import { join } from "node:path";

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const CPU = Number(arg("--cpu", 4));
const RUNS = Number(arg("--runs", 3));
const OUT = arg("--out", null);
const BASE = arg("--base", "http://localhost:8080/");
const sleep = ms => new Promise(r => setTimeout(r, ms));
const PORT = 9271;
const chrome = spawn("C:/Program Files/Google/Chrome/Application/chrome.exe",
  ["--headless=new", "--disable-gpu", "--mute-audio", "--autoplay-policy=no-user-gesture-required",
   `--remote-debugging-port=${PORT}`, `--user-data-dir=${join(tmpdir(), "pe-bench-" + Date.now())}`, "about:blank"],
  { stdio: "ignore" });

let ws, seq = 0; const pend = new Map(); const errs = [];
const send = (m, p = {}) => new Promise(r => { const id = ++seq; pend.set(id, r); ws.send(JSON.stringify({ id, method: m, params: p })); });
const ev = async e => {
  const r = await send("Runtime.evaluate", { expression: `(async()=>{${e}})()`, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) return { exc: JSON.stringify(r.exceptionDetails).slice(0, 300) };
  return r.result?.value;
};
for (let i = 0; i < 50; i++) {
  try {
    const l = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
    const p = l.find(t => t.type === "page");
    if (p) {
      ws = new WebSocket(p.webSocketDebuggerUrl); await new Promise(r => ws.onopen = r);
      ws.onmessage = e => {
        const m = JSON.parse(e.data);
        if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result); pend.delete(m.id); }
        if (m.method === "Runtime.exceptionThrown") errs.push((m.params.exceptionDetails.exception?.description || "").slice(0, 160));
      };
      break;
    }
  } catch {}
  await sleep(300);
}
await send("Runtime.enable");
await send("Page.enable");
await send("Network.enable");
await send("Network.setCacheDisabled", { cacheDisabled: false });
await send("Emulation.setDeviceMetricsOverride", { width: 440, height: 956, deviceScaleFactor: 1, mobile: true });

const waitReady = async () => {
  for (let i = 0; i < 80; i++) {
    const ok = await ev("return !!(window.App && typeof Quiz!=='undefined' && typeof getAllQuestions==='function' && getAllQuestions().length>0 && !document.getElementById('loading-screen'))");
    if (ok === true) return true;
    await sleep(250);
  }
  return false;
};

/* 量一次「全新用戶」同「已有卡」嘅 Quiz.start，同埋答題寫入、sheet 切換 */
const SCENARIO = `
  const med = a => a.slice().sort((x,y)=>x-y)[Math.floor(a.length/2)];
  const nav = performance.getEntriesByType('navigation')[0];
  const res = performance.getEntriesByType('resource');
  const out = {
    dcl: Math.round(nav.domContentLoadedEventEnd),
    load: Math.round(nav.loadEventEnd),
    resources: res.length,
    decodedKB: Math.round(res.reduce((s,r)=>s+(r.decodedBodySize||0),0)/1024),
    questions: getAllQuestions().length
  };
  document.querySelectorAll('.modal-backdrop').forEach(m=>m.style.display='none');
  const eg = document.getElementById('entry-gate'); if (eg) eg.classList.add('hidden');
  App.openSetup();
  let t0 = performance.now(); Quiz.start([]); out.quizStartMs = Math.round(performance.now()-t0);
  out.cardsKB = Math.round((localStorage.getItem('pokeengmon_sm2_cards_v2')||'').length/1024);
  /* 每答一題寫入：模擬 SM-2 apply + upsert + history */
  const w = [];
  for (let i = 0; i < 5; i++) {
    const q = Quiz.queue[i] ? Quiz.queue[i].q : getAllQuestions()[i];
    t0 = performance.now();
    let c = SM2.getOrCreateCard(q); c = SM2.applyClean(c, Date.now()); SM2.upsertCard(c);
    SM2.appendHistory({ card_id: c.card_id || c._key, ts: Date.now(), q_score: 5, response_ms: 1000 });
    w.push(performance.now()-t0);
  }
  out.answerWriteMs = +med(w).toFixed(1);
  if (SM2.flush) SM2.flush();
  App.showView('view-home');
  return out;`;

const SHEET = `
  /* sheet 切換：由 Pokédex sheet 撳 Calendar（串行 close→open）到新 sheet 開始出現 */
  await new Promise(r=>setTimeout(r,600));
  const a = document.getElementById('btn-bezel-dex'), b = document.getElementById('btn-bezel-streak');
  if (!a || !b) return { sheetSwitchMs: null };
  a.click(); await new Promise(r=>setTimeout(r,900));
  const t0 = performance.now(); b.click();
  return await new Promise(res => {
    const target = document.getElementById('sheet-calendar');
    const tick = () => {
      if (target && target.classList.contains('ph-open')) {
        /* sheetVisibleMs：新 sheet 開始出現（ph-open 之後下一幀已 paint）；sheetSwitchMs：滑入完成（transitionend） */
        let visibleMs = null;
        requestAnimationFrame(() => requestAnimationFrame(() => { visibleMs = Math.round(performance.now()-t0); }));
        const done = () => res({ sheetSwitchMs: Math.round(performance.now()-t0), sheetVisibleMs: visibleMs });
        /* 加埋 transition 時間：等 transitionend 或 600ms */
        let fired = false;
        target.addEventListener('transitionend', () => { if (!fired) { fired = true; done(); } }, { once: true });
        setTimeout(() => { if (!fired) { fired = true; done(); } }, 1200);
        return;
      }
      if (performance.now()-t0 > 3000) return res({ sheetSwitchMs: -1 });
      setTimeout(tick, 5);
    };
    tick();
  });`;

const results = [];
for (let run = 0; run < RUNS; run++) {
  /* 每輪清晒 storage → 第一次 load＝全新用戶 */
  await send("Emulation.setCPUThrottlingRate", { rate: 1 });
  await send("Page.navigate", { url: BASE });
  await waitReady();
  await ev("localStorage.clear(); indexedDB.databases && (await indexedDB.databases()).forEach(d=>indexedDB.deleteDatabase(d.name)); return 1");
  await send("Emulation.setCPUThrottlingRate", { rate: CPU });
  await send("Page.navigate", { url: BASE });
  if (!(await waitReady())) { results.push({ run, error: "app not ready" }); continue; }
  const fresh = await ev(SCENARIO);
  await send("Page.navigate", { url: BASE });
  await waitReady();
  const warm = await ev(SCENARIO);
  const sheet = await ev(SHEET);
  results.push({ run, fresh, warm, sheet });
}
const pick = (path) => {
  const v = results.map(r => path.split(".").reduce((o, k) => o && o[k], r)).filter(x => typeof x === "number");
  v.sort((a, b) => a - b); return v.length ? v[Math.floor(v.length / 2)] : null;
};
const summary = {
  cpuThrottle: CPU, runs: RUNS,
  freshQuizStartMs: pick("fresh.quizStartMs"),
  warmQuizStartMs: pick("warm.quizStartMs"),
  answerWriteMs: pick("warm.answerWriteMs"),
  sheetSwitchMs: pick("sheet.sheetSwitchMs"),
  sheetVisibleMs: pick("sheet.sheetVisibleMs"),
  firstLoadDecodedKB: pick("fresh.decodedKB"),
  dclMs: pick("warm.dcl"),
  cardsKB: pick("warm.cardsKB"),
  questions: pick("warm.questions"),
  pageErrors: [...new Set(errs)]
};
console.log(JSON.stringify(summary, null, 2));
if (OUT) writeFileSync(OUT, JSON.stringify({ summary, results }, null, 2));
chrome.kill(); process.exit(0);
