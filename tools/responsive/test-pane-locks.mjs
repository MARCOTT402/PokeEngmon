// Responsive P1 互動測試：wide 左欄鎖（捕捉／Gym 結算 inert）、overlay 開住撳左欄、Quests 倒數。Rule 85。W2／W4 識分 guest（guest 斷言登入提示，W4 撳 Maybe later 後再測 CTA）
// 前置：本地 server http://localhost:8080（.claude/launch.json static）；headless Chrome + CDP；非觸控尺寸要排先（Rule 80）。
// 用法：node tools/responsive/test-pane-locks.mjs
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

/* ===== WIDE ===== */
await boot(1440, 900);
await check("W1 quiz-setup via CTA", () => realClick("#btn-start-quiz"), 900, s => s.views.includes("view-quiz-setup"));
/* guest-aware：_seedtest 預設係 guest。Friends 要登入（toast＋登入框），Leaderboard 第一次開會出 guest 登入提示（#lb-login-modal 蓋住成個畫面）。
   登入時照測原本行為；guest 時斷言登入提示，W4 先撳「Maybe later」再測 CTA，保留「overlay 開住撳左欄」嘅覆蓋。 */
const guest = !(await ev("return !!(window.SupabaseAuth && SupabaseAuth.isLoggedIn && SupabaseAuth.isLoggedIn())"));
const promptState = async () => JSON.parse(await ev(`return JSON.stringify({
  toast: document.getElementById('toast')?.classList.contains('show') ? document.getElementById('toast').textContent.trim() : '',
  authOpen: !!document.querySelector('#modal-root .au-title'),
  lbPrompt: !!document.getElementById('lb-login-modal')})`));
const checkWith = async (label, fn, wait, expectFn) => {
  if (fn) await fn();
  await sleep(wait);
  const s = await st(); const p = await promptState(); const ok = expectFn(s, p); ok ? pass++ : fail++;
  results.push(`${ok ? "PASS" : "FAIL"}  ${label}  ${JSON.stringify({ ...s, ...p })}`);
};
if (guest) {
  await checkWith("W2 (guest) left dock Friends while setup open -> login prompt, setup stays", () => realClick("#btn-bd-friends"), 1200,
    (s, p) => s.views.includes("view-quiz-setup") && !s.views.includes("view-friends") && /log in/i.test(p.toast) && p.authOpen);
} else {
  await check("W2 left dock Friends while setup open", () => realClick("#btn-bd-friends"), 1200, s => s.views.includes("view-friends") && !s.views.includes("view-quiz-setup"));
}
await hideGate();
await check(`W3 left dock Leaderboard while ${guest ? "setup" : "Friends"} open`, () => realClick("#btn-bd-leaderboard"), 1600, s => s.views.includes("view-leaderboard") && !s.views.includes("view-friends") && !s.views.includes("view-quiz-setup"));
await hideGate();
if (guest) {
  await checkWith("W4a (guest) leaderboard login prompt shown, dismiss via Maybe later", null, 0, (s, p) => s.views.includes("view-leaderboard") && p.lbPrompt);
  await checkWith("W4b (guest) Maybe later closes prompt, leaderboard stays", () => realClick("#lb-login-cancel"), 500, (s, p) => s.views.includes("view-leaderboard") && !p.lbPrompt);
}
await check("W4 CTA while Leaderboard open -> setup", () => realClick("#btn-start-quiz"), 1300, s => s.views.includes("view-quiz-setup") && !s.views.includes("view-leaderboard"));
await check("W5 normal settlement: left pane free", () => ev("App._gymSettleData=null; App.showView('view-settlement')"), 500, s => s.views.includes("view-settlement") && !s.settleLocked && s.inertLeft === 0 && !s.dexDisabled);
await check("W6 bezel dex from settlement -> sheet", () => realClick("#btn-bezel-dex"), 900, s => s.open[0] && s.open[0].startsWith("sheet-pokedex") && !s.views.length);
await check("W7 gym settlement locks bezel+left, chin free", () => ev("App._gymSettleData={fake:true}; App.showView('view-settlement')"), 500, s => s.settleLocked && s.inertLeft > 0 && s.dexDisabled && !s.homeDisabled);
await check("W8 real click on dock battle ignored", () => realClick("#btn-bd-battle"), 900, s => s.views.includes("view-settlement") && !s.open.some(o => o.startsWith("sheet-battle")));
await check("W9 real click on bezel dex ignored", () => realClick("#btn-bezel-dex"), 900, s => s.views.includes("view-settlement") && !s.open.some(o => o.startsWith("sheet-pokedex")));
await check("W10 leaving settlement unlocks", () => ev("App._gymSettleData=null; App.showView('view-home')"), 700, s => !s.settleLocked && s.inertLeft === 0 && !s.dexDisabled);
await check("W11 frame lock (capture/quiz) -> left inert", () => ev("App._setFrameLock(true)"), 200, s => s.frameLocked && s.inertLeft > 0 && s.homeDisabled);
await check("W12 frame unlock", () => ev("App._setFrameLock(false)"), 200, s => !s.frameLocked && s.inertLeft === 0);
/* Quests countdown keeps ticking in right pane, also after overlay round-trip */
const t0 = await ev("return document.getElementById('quests-reset')?.textContent"); await sleep(2200);
const t1 = await ev("return document.getElementById('quests-reset')?.textContent");
{ const ok = t0 && t1 && t0 !== t1; ok ? pass++ : fail++; results.push(`${ok ? "PASS" : "FAIL"}  W13 quests countdown ticks  ${t0} -> ${t1}`); }
await realClick("#btn-start-quiz"); await sleep(900); await realClick("#btn-pd-home"); await sleep(1200);
const t2 = await ev("return document.getElementById('quests-reset')?.textContent"); await sleep(2200);
const t3 = await ev("return document.getElementById('quests-reset')?.textContent");
{ const ok = t2 && t3 && t2 !== t3; ok ? pass++ : fail++; results.push(`${ok ? "PASS" : "FAIL"}  W14 countdown resumes after overlay  ${t2} -> ${t3}`); }

/* ===== PHONE ===== */
await boot(440, 956);
await check("P1 gym settlement locks bezel, chin free", () => ev("App._gymSettleData={fake:true}; App.showView('view-settlement')"), 500, s => s.settleLocked && s.dexDisabled && !s.homeDisabled);
await check("P2 real click bezel dex ignored", () => realClick("#btn-bezel-dex"), 900, s => s.views.includes("view-settlement") && !s.open.length);
await check("P3 unlock on leave", () => ev("App._gymSettleData=null; App.showView('view-home')"), 700, s => !s.settleLocked && !s.dexDisabled && s.inertLeft === 0);
await check("P4 quests sheet expand", () => ev("document.getElementById('btn-bezel-energy').click()").then(() => sleep(700)).then(() => ev("document.getElementById('btn-quests-expand').click()")), 900, s => s.open[0] === "sheet-quests");
const p0 = await ev("return document.getElementById('quests-reset')?.textContent"); await sleep(2200);
const p1 = await ev("return document.getElementById('quests-reset')?.textContent");
{ const ok = p0 && p1 && p0 !== p1; ok ? pass++ : fail++; results.push(`${ok ? "PASS" : "FAIL"}  P5 phone quests sheet countdown ticks  ${p0} -> ${p1}`); }

console.log(results.join("\n"));
console.log(`\n${pass} pass / ${fail} fail; page errors: ${JSON.stringify(errs)}`);
chrome.kill(); process.exit(0);
