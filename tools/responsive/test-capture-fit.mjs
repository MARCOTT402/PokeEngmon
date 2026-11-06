// Responsive 測試：捕捉場景 #view-capture 填滿白螢幕區／大屏右欄（唔露後面 sheet），canvas 跟 host 大小。Rule 89。
// 前置：本地 server http://localhost:8080（.claude/launch.json static）；headless Chrome + CDP；非觸控尺寸要排先（Rule 80）。
// 用法：node tools/responsive/test-capture-fit.mjs <outDir>
import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os"; import { join } from "node:path";
const OUT = process.argv[2]; mkdirSync(OUT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const PORT = 9266;
const chrome = spawn("C:/Program Files/Google/Chrome/Application/chrome.exe",
  ["--headless=new", "--disable-gpu", "--mute-audio", "--hide-scrollbars", `--remote-debugging-port=${PORT}`, `--user-data-dir=${join(tmpdir(), "pe-cap-" + Date.now())}`, "about:blank"], { stdio: "ignore" });
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
const STATE = `const v=document.getElementById('view-capture'); const r=v.getBoundingClientRect();
  const wide=document.documentElement.dataset.layout==='wide';
  const t=(wide?document.querySelector('.ph-sheets'):document.querySelector('.pd-screen2')).getBoundingClientRect();
  const c=v.querySelector('canvas'); const cr=c?c.getBoundingClientRect():null;
  return JSON.stringify({layout:document.documentElement.dataset.layout, active:v.classList.contains('active'),
    cap:[r.left,r.top,r.width,r.height].map(Math.round), target:[t.left,t.top,t.width,t.height].map(Math.round),
    canvas: cr?[cr.width,cr.height].map(Math.round):null,
    dL:Math.round(r.left-t.left), dR:Math.round(t.right-r.right)});`;
const rows = []; let pass = 0, fail = 0;
const check = async (label, action, wait, fn, shot) => {
  if (action) await ev(action);
  await sleep(wait);
  const s = JSON.parse(await ev(STATE)); const ok = fn(s); ok ? pass++ : fail++;
  rows.push(`${ok ? "PASS" : "FAIL"}  ${label}  ${JSON.stringify(s)}`);
  if (shot) { const r = await send("Page.captureScreenshot", { format: "png" }); writeFileSync(join(OUT, shot + ".png"), Buffer.from(r.data, "base64")); }
};
const OPEN = "App.showView('view-capture'); try{ CaptureScene.play({dexId:4,name:'Charmander',onCaught(){},onEscape(){}}); }catch(e){}";
/* wide：蓋滿右欄（左右差 ≤ 3px，含邊框）；其他：蓋滿白螢幕區 */
const fits = s => s.active && Math.abs(s.dL) <= 3 && Math.abs(s.dR) <= 3 && (!s.canvas || Math.abs(s.canvas[0] - (s.cap[2] - 5)) <= 2);
const SIZES = [["S6", 1440, 900, false], ["S7", 1920, 1080, false], ["S5", 1366, 640, false], ["S4", 1180, 820, false],
  ["S3", 820, 1180, true], ["S2", 440, 956, true], ["S1", 375, 667, true]];
for (const [id, w, h, touch] of SIZES) {
  await boot(w, h, touch);
  await check(`${id} ${w}x${h} capture fills screen area`, OPEN, 2500, fits, `capture-${id}`);
  await check(`${id} 3D scene (after WARNING) still fills`, null, 6000, fits, `capture-scene-${id}`);
}
console.log(rows.join("\n")); console.log(`\n${pass} pass / ${fail} fail; page errors: ${JSON.stringify(errs)}`);
chrome.kill(); process.exit(0);
