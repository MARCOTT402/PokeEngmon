// Responsive P1 互動測試：由 Friends／Leaderboard／Battle Menu 撳 bezel／dock：只可以有一個 sheet 開住。Rule 85
// 前置：本地 server http://localhost:8080（.claude/launch.json static）；headless Chrome + CDP；非觸控尺寸要排先（Rule 80）。
// 用法：node tools/responsive/test-overlay-switch.mjs
import { spawn } from "node:child_process";
import { tmpdir } from "node:os"; import { join } from "node:path";
const sleep = ms => new Promise(r => setTimeout(r, ms));
const PORT = 9262;
const chrome = spawn("C:/Program Files/Google/Chrome/Application/chrome.exe",
  ["--headless=new", "--disable-gpu", "--mute-audio", `--remote-debugging-port=${PORT}`, `--user-data-dir=${join(tmpdir(), "pe-t6-" + Date.now())}`, "about:blank"], { stdio: "ignore" });
let ws, seq = 0; const pend = new Map(); const errs = [];
const send = (m, p = {}) => new Promise(r => { const id = ++seq; pend.set(id, r); ws.send(JSON.stringify({ id, method: m, params: p })); });
const ev = async e => {
  const r = await send("Runtime.evaluate", { expression: `(async()=>{${e}})()`, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) return "EXC " + JSON.stringify(r.exceptionDetails).slice(0, 300);
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
        if (m.method === "Runtime.exceptionThrown") errs.push((m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text || "").slice(0, 200));
      };
      break;
    }
  } catch {}
  await sleep(300);
}
await send("Runtime.enable");
const size = async (w, h) => { await send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile: false }); await sleep(500); };
/* 真滑鼠 click（會經 hit-test，inert／pointer-events 先會生效） */
const realClick = async (sel) => {
  const c = await ev(`const e=document.querySelector('${sel}'); if(!e) return null; const b=e.getBoundingClientRect(); return [b.left+b.width/2, b.top+b.height/2];`);
  if (!c) return false;
  for (const type of ["mousePressed", "mouseReleased"]) await send("Input.dispatchMouseEvent", { type, x: c[0], y: c[1], button: "left", clickCount: 1 });
  return true;
};
const STATE = `const all=[...document.querySelectorAll('#view-home .ph-sheet.ph-open')];
  return JSON.stringify({open: all.map(s=>s.id+(s.dataset.wideDefault?'*':'')),
    views:[...document.querySelectorAll('.view.active')].map(v=>v.id).filter(x=>x!=='view-home'),
    settleLocked: document.getElementById('pd-shell').classList.contains('settle-locked'),
    frameLocked: document.getElementById('pd-shell').classList.contains('frame-locked'),
    inertLeft: [...document.querySelectorAll('#view-home .pd-screen2 > :not(.ph-sheets)')].filter(e=>e.hasAttribute('inert')).length,
    dexDisabled: document.getElementById('btn-bezel-dex').disabled, homeDisabled: document.getElementById('btn-pd-home').disabled});`;
const results = []; let pass = 0, fail = 0;
const st = async () => JSON.parse(await ev(STATE));
const check = async (label, fn, wait, expectFn) => {
  if (fn) await fn();
  await sleep(wait);
  const s = await st(); const ok = expectFn(s); ok ? pass++ : fail++;
  results.push(`${ok ? "PASS" : "FAIL"}  ${label}  ${JSON.stringify(s)}`);
};
const hideGate = () => ev("document.querySelectorAll('.modal-backdrop').forEach(m=>m.style.display='none')");
const boot = async (w, h) => {
  await size(w, h);
  await send("Page.navigate", { url: "http://localhost:8080/_seedtest.html" }); await sleep(3800);
  await ev("document.getElementById('btn-entry-yes').click()"); await sleep(1500); await hideGate();
};

await boot(1440, 900);
await check("X1 friends overlay (direct)", () => ev("App.showView('view-friends')"), 500, s => s.views.includes("view-friends"));
await check("X2 CTA while Friends -> setup", () => realClick("#btn-start-quiz"), 1300, s => s.views.includes("view-quiz-setup") && !s.views.includes("view-friends"));
await check("X3 dock Settings while setup -> sheet", () => realClick("#btn-bd-setting"), 900, s => s.open.length === 1 && s.open[0] === "sheet-setting" && !s.views.length);
await check("X4 battle-menu overlay (direct)", () => ev("App.showView('view-battle-menu')"), 500, s => s.views.includes("view-battle-menu"));
await check("X5 bezel streak while battle-menu -> sheet", () => realClick("#btn-bezel-streak"), 1400, s => s.open.length === 1 && s.open[0].startsWith("sheet-calendar") && !s.views.length);
await check("X6 friends again then dock friends toggles home", () => ev("App.showView('view-friends')"), 500, s => s.views.includes("view-friends"));
await check("X6b", () => ev("document.getElementById('btn-bd-friends').click()"), 1200, s => !s.views.length);
await ev("App.showView('view-leaderboard')"); await sleep(600);
results.push("      rect leaderboard vs right pane: " + await ev("const a=document.getElementById('view-leaderboard').getBoundingClientRect(), b=document.querySelector('.ph-sheets').getBoundingClientRect(); return [a.left-b.left,a.top-b.top,a.right-b.right,a.bottom-b.bottom].map(Math.round).join(',')"));
await check("X7 close streak -> default only", () => ev("document.querySelector('#sheet-calendar .ph-sheet-x').click()"), 900, s => s.open.length === 1 && s.open[0] === "sheet-quests*");
await ev("App.showView('view-leaderboard')"); await sleep(500);
await check("X8 bezel dex while leaderboard -> one sheet", () => realClick("#btn-bezel-dex"), 1400, s => s.open.length === 1 && s.open[0] === "sheet-pokedex" && !s.views.length);
await ev("App.showView('view-friends')"); await sleep(500);
await check("X9 dock settings while friends -> one sheet", () => realClick("#btn-bd-setting"), 1400, s => s.open.length === 1 && s.open[0] === "sheet-setting" && !s.views.length);
console.log(results.join("\n"));
console.log(`\n${pass} pass / ${fail} fail; page errors: ${JSON.stringify(errs)}`);
chrome.kill(); process.exit(0);
