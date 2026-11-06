// Responsive P1 互動測試：轉機提示：phone-land 提示、tablet 直向背包／戰鬥唔轉、桌面矮窗唔彈。Rule 87。用法：node tools/responsive/test-rotate.mjs <outDir>
// 前置：本地 server http://localhost:8080（.claude/launch.json static）；headless Chrome + CDP；非觸控尺寸要排先（Rule 80）。
// 用法：node tools/responsive/test-rotate.mjs <outDir>
import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os"; import { join } from "node:path";
const OUT = process.argv[2]; mkdirSync(OUT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const PORT = 9264;
const chrome = spawn("C:/Program Files/Google/Chrome/Application/chrome.exe",
  ["--headless=new", "--disable-gpu", "--mute-audio", "--hide-scrollbars", `--remote-debugging-port=${PORT}`, `--user-data-dir=${join(tmpdir(), "pe-t9-" + Date.now())}`, "about:blank"], { stdio: "ignore" });
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
        if (m.method === "Runtime.exceptionThrown") errs.push((m.params.exceptionDetails.exception?.description || "").slice(0, 160));
      };
      break;
    }
  } catch {}
  await sleep(300);
}
await send("Runtime.enable");
const size = async (w, h, touch) => {
  await send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile: touch && Math.min(w, h) < 700,
    screenOrientation: w > h ? { type: "landscapePrimary", angle: 90 } : { type: "portraitPrimary", angle: 0 } });
  await send("Emulation.setTouchEmulationEnabled", { enabled: touch, maxTouchPoints: touch ? 5 : 0 });
  await sleep(600);
};
const boot = async (w, h, touch) => {
  await size(w, h, touch);
  await send("Page.navigate", { url: "http://localhost:8080/_seedtest.html" }); await sleep(3800);
  await ev("document.getElementById('btn-entry-yes')?.click()"); await sleep(1300);
  await ev("document.querySelectorAll('.modal-backdrop').forEach(m=>m.style.display='none')");
};
const STATE = `const hint=document.getElementById('rotate-portrait'); const bagRot=document.querySelector('.bag-rotate:not(#rotate-portrait)');
  const stage=document.getElementById('bag-stage'); const fr=document.querySelector('.battle-land .bl-frame');
  return JSON.stringify({layout:document.documentElement.dataset.layout, hint: !!(hint && hint.classList.contains('show')),
    bagRotate: !!(bagRot && bagRot.classList.contains('show')), bagOpen: document.body.classList.contains('bag-open'),
    stageTf: stage ? stage.style.transform : null,
    frame: fr && document.body.classList.contains('battle-landscape') ? [fr.style.width, fr.style.height, fr.style.transform] : null,
    views:[...document.querySelectorAll('.view.active')].map(v=>v.id).filter(x=>x!=='view-home')});`;
const rows = []; let pass = 0, fail = 0;
const check = async (label, action, wait, fn, shot) => {
  if (action) await ev(action);
  await sleep(wait);
  const s = JSON.parse(await ev(STATE)); const ok = fn(s); ok ? pass++ : fail++;
  rows.push(`${ok ? "PASS" : "FAIL"}  ${label}  ${JSON.stringify(s)}`);
  if (shot) { const r = await send("Page.captureScreenshot", { format: "png" }); writeFileSync(join(OUT, shot + ".png"), Buffer.from(r.data, "base64")); }
};

/* 非觸控：矮桌面窗唔應該當手機橫向 */
await boot(1200, 480, false);
await check("D1 desktop 1200x480 no hint", null, 0, s => s.layout !== "phone-land" && !s.hint);
await check("D2 desktop bag no rotate prompt", "BagUI.open({from:'home'})", 700, s => s.bagOpen && !s.bagRotate && !String(s.stageTf).includes("rotate"));
await check("D3 desktop bag close no prompt", "document.getElementById('bag-home').click()", 900, s => !s.bagOpen && !s.hint && !s.bagRotate);

/* 手機橫向 */
await boot(956, 440, true);
await check("L1 phone-land home shows hint", null, 300, s => s.layout === "phone-land" && s.hint, "land-home-S8");
await check("L2 Continue anyway hides", "document.querySelector('#rotate-portrait .bag-rot-btn').click()", 400, s => !s.hint);
await size(440, 956, true); await sleep(300);
await check("L3 back to portrait: no hint", null, 0, s => s.layout === "phone" && !s.hint);
await size(956, 440, true); await sleep(300);
await check("L4 landscape again: hint re-shows", null, 0, s => s.hint);
await check("L5 bag in phone-land: hint hidden, no rotate", "BagUI.open({from:'home'})", 800, s => s.bagOpen && !s.hint && !s.bagRotate, "land-bag-S8");
await check("L6 close bag: hint back", "document.getElementById('bag-home').click()", 900, s => !s.bagOpen && s.hint);
await check("L7 battle frame in phone-land: hint hidden", "BattleLand.enter()", 700, s => !s.hint && s.frame && s.frame[2] === "none");
await check("L8 battle exit: hint back", "App.showView('view-home')", 900, s => s.hint);
await check("L9 quiz under hint keeps view", "document.getElementById('btn-start-quiz').click(); await new Promise(r=>setTimeout(r,800)); document.getElementById('btn-setup-start').click()", 1500, s => s.hint && s.views.includes("view-quiz"));
await size(440, 956, true); await sleep(500);
await check("L10 rotate to portrait mid-quiz: quiz continues", null, 0, s => !s.hint && s.views.includes("view-quiz"));

/* iPad 直向 */
await boot(820, 1180, true);
await check("T1 tablet bag: no rotate prompt, no 90deg", "BagUI.open({from:'home'})", 800, s => s.bagOpen && !s.bagRotate && !String(s.stageTf).includes("rotate"), "tablet-bag-S3");
await ev("document.getElementById('bag-home').click()"); await sleep(800);
await check("T2 tablet battle frame unrotated, h≈w*0.62", "BattleLand.enter()", 700, s => s.frame && s.frame[2] === "none" && s.frame[0] === "820px" && s.frame[1] === "508px", "tablet-battle-S3");
await ev("App.showView('view-home')"); await sleep(600);

/* 手機直向（舊行為保持） */
await boot(440, 956, true);
await check("P1 phone bag: rotate prompt + 90deg", "BagUI.open({from:'home'})", 800, s => s.bagOpen && s.bagRotate && String(s.stageTf).includes("rotate(90deg)"));
await ev("document.querySelector('.bag-rotate.show .bag-rot-btn')?.click()"); await sleep(300);
await ev("document.getElementById('bag-home').click()"); await sleep(800);
await check("P2 phone battle frame rotated", "BattleLand.enter()", 700, s => s.frame && s.frame[2] === "rotate(90deg)");
await ev("document.querySelector('.bag-rotate.show .bag-rot-btn')?.click(); App.showView('view-home')"); await sleep(600);
await check("P3 phone home no hint", null, 0, s => !s.hint && s.layout === "phone");

console.log(rows.join("\n")); console.log(`\n${pass} pass / ${fail} fail; page errors: ${JSON.stringify(errs)}`);
chrome.kill(); process.exit(0);
