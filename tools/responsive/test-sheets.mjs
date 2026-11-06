// Responsive P1 互動測試：wide 右欄 sheet＋phone sheet 回歸（開／toggle／✕／點外面／Esc／連撳／chin Home／overlay 上開 sheet／layout 互轉）。Rule 84
// 前置：本地 server http://localhost:8080（.claude/launch.json static）；headless Chrome + CDP；非觸控尺寸要排先（Rule 80）。
// 用法：node tools/responsive/test-sheets.mjs
import { spawn } from "node:child_process";
import { tmpdir } from "node:os"; import { join } from "node:path";
const sleep = ms => new Promise(r => setTimeout(r, ms));
const PORT = 9261;
const chrome = spawn("C:/Program Files/Google/Chrome/Application/chrome.exe",
  ["--headless=new", "--disable-gpu", "--mute-audio", `--remote-debugging-port=${PORT}`, `--user-data-dir=${join(tmpdir(), "pe-t5-" + Date.now())}`, "about:blank"], { stdio: "ignore" });
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
const STATE = `const all=[...document.querySelectorAll('#view-home .ph-sheet.ph-open')];
  const open=all.map(s=>s.id+(s.dataset.wideDefault?'*':'')+(s.classList.contains('ph-sheet-full')?'(full)':''));
  const bad=all.filter(s=>s.hidden).map(s=>s.id);
  const views=[...document.querySelectorAll('.view.active')].map(v=>v.id).filter(x=>x!=='view-home');
  return JSON.stringify({open, views, badHiddenOpen:bad, layout:document.documentElement.dataset.layout});`;
const click = id => `document.getElementById('${id}').click();`;
const pause = ms => `await new Promise(r=>setTimeout(r,${ms}));`;
const results = []; let pass = 0, fail = 0;
const check = async (label, action, wait, expectFn) => {
  if (action) await ev(action);
  await sleep(wait);
  const s = JSON.parse(await ev(STATE));
  const ok = expectFn(s); ok ? pass++ : fail++;
  results.push(`${ok ? "PASS" : "FAIL"}  ${label}  ${JSON.stringify(s)}`);
};
const note = async (label, expr) => results.push(`      ${label}: ${JSON.stringify(await ev(expr))}`);
const boot = async (w, h) => {
  await size(w, h);
  await send("Page.navigate", { url: "http://localhost:8080/_seedtest.html" }); await sleep(3800);
  await ev(click("btn-entry-yes")); await sleep(1500);
  await ev("document.querySelectorAll('.modal-backdrop').forEach(m=>m.style.display='none')");
};
const only = id => s => s.open.length === 1 && s.open[0].startsWith(id) && !s.badHiddenOpen.length;
const isDefault = s => s.open.length === 1 && s.open[0].startsWith("sheet-quests*") && !s.badHiddenOpen.length;

/* ===== WIDE 1440×900 ===== */
await boot(1440, 900);
await check("W1 default quests on load (full)", null, 300, s => isDefault(s) && s.open[0].includes("(full)"));
await note("quests board mounted", "return !!document.querySelector('#sheet-quests .sheet-view-host')");
await check("W2 settings opens instantly", click("btn-bd-setting"), 250, only("sheet-setting"));
await check("W3 click left card keeps settings", "document.querySelector('.ph-sign').click()", 600, only("sheet-setting"));
await check("W4 settings again -> default", click("btn-bd-setting"), 900, isDefault);
await check("W5 dex opens full", click("btn-bezel-dex"), 500, s => only("sheet-pokedex")(s) && s.open[0].includes("(full)"));
await note("dex host children", "const h=document.querySelector('#sheet-pokedex .sheet-view-host'); return h ? h.children.length : 0");
await check("W6 streak swaps instantly (full)", click("btn-bezel-streak"), 300, s => only("sheet-calendar")(s) && s.open[0].includes("(full)"));
await note("cal-wrap present / dex view children back", "return [!!document.querySelector('#sheet-calendar .cal-wrap'), document.querySelectorAll('#view-pokedex > *').length]");
await check("W7 X closes -> default", "document.querySelector('#sheet-calendar .ph-sheet-x').click()", 900, isDefault);
await check("W8 rapid 5 clicks -> battle", click("btn-bezel-diamond") + click("btn-bezel-dex") + click("btn-bezel-streak") + click("btn-bd-setting") + click("btn-bd-battle"), 1000, only("sheet-battle"));
await check("W9 gacha open", click("btn-bezel-diamond"), 1200, only("sheet-gacha"));
await check("W10 chin home -> default", click("btn-pd-home"), 1200, s => isDefault(s) && !s.views.length);
await check("W11 quiz-setup over default", click("btn-start-quiz"), 900, s => s.views.includes("view-quiz-setup") && s.open.some(o => o.startsWith("sheet-quests*")));
await check("W12 settings from setup closes setup", click("btn-bd-setting"), 900, s => only("sheet-setting")(s) && !s.views.length);
await check("W13 leaderboard opens", click("btn-bd-leaderboard"), 1200, s => s.views.includes("view-leaderboard"));
await ev("document.querySelectorAll('.modal-backdrop').forEach(m=>m.style.display='none')");
await check("W14 leaderboard again -> home + one sheet", click("btn-bd-leaderboard"), 1400, s => !s.views.length && s.open.length === 1);
await check("W15 start quiz", click("btn-start-quiz") + pause(900) + click("btn-setup-start"), 1500, s => s.views.includes("view-quiz"));
await ev("document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))"); await sleep(500);
{ const ok = await ev("return !!document.getElementById('quiz-settings-close')"); ok ? pass++ : fail++; results.push(`${ok ? "PASS" : "FAIL"}  W16 Esc in quiz opens quiz settings`); }
await ev("document.getElementById('quiz-settings-close')?.click()"); await sleep(300);
await check("W17 default still under quiz", null, 0, s => s.open.some(o => o.startsWith("sheet-quests*")));

/* layout switching */
await boot(1440, 900);
await size(440, 956); await sleep(900);
await check("W18 wide->phone closes default", null, 0, s => s.layout === "phone" && s.open.length === 0);
await size(1440, 900); await sleep(400);
await check("W19 phone->wide shows default", null, 0, s => s.layout === "wide" && isDefault(s));

/* ===== PHONE 440×956 regression ===== */
await boot(440, 956);
await check("P1 nothing open on load", null, 300, s => s.open.length === 0);
await check("P2 settings opens", click("btn-bd-setting"), 700, only("sheet-setting"));
await check("P3 click outside closes", "document.querySelector('.ph-sign').click()", 900, s => s.open.length === 0);
await check("P4 dex opens compact", click("btn-bezel-dex"), 700, s => only("sheet-pokedex")(s) && !s.open[0].includes("(full)"));
await check("P5 dex toggle closes", click("btn-bezel-dex"), 900, s => s.open.length === 0);
await check("P6 streak then energy switches", click("btn-bezel-streak") + pause(700) + click("btn-bezel-energy"), 1200, only("sheet-quests"));
await ev("document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))");
await check("P7 Esc closes", null, 900, s => s.open.length === 0);
await check("P8 clicks 150ms apart settle", click("btn-bezel-dex") + pause(150) + click("btn-bezel-streak") + pause(150) + click("btn-bd-setting"), 1600, s => s.open.length <= 1 && !s.badHiddenOpen.length);

await check("P9 same-tick clicks (pre-existing, info)", click("btn-pd-home"), 900, s => true);
await check("P9b same-tick 3 clicks", click("btn-bezel-dex") + click("btn-bezel-streak") + click("btn-bd-setting"), 1600, s => s.open.length <= 1);
console.log(results.join("\n"));
console.log(`\n${pass} pass / ${fail} fail; page errors: ${JSON.stringify(errs)}`);
chrome.kill(); process.exit(0);
