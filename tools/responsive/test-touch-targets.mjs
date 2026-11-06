// Responsive P1 互動測試：觸控可撳範圍（✕ ::after、下巴球轉交）＋ <12px 字清單。Rule 88。用法：node tools/responsive/test-touch-targets.mjs <outDir>
// 前置：本地 server http://localhost:8080（.claude/launch.json static）；headless Chrome + CDP；非觸控尺寸要排先（Rule 80）。
// 用法：node tools/responsive/test-touch-targets.mjs <outDir>
import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os"; import { join } from "node:path";
const OUT = process.argv[2]; mkdirSync(OUT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const PORT = 9265;
const chrome = spawn("C:/Program Files/Google/Chrome/Application/chrome.exe",
  ["--headless=new", "--disable-gpu", "--mute-audio", "--hide-scrollbars", `--remote-debugging-port=${PORT}`, `--user-data-dir=${join(tmpdir(), "pe-t10-" + Date.now())}`, "about:blank"], { stdio: "ignore" });
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
  await send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile: touch && Math.min(w, h) < 700 });
  await send("Emulation.setTouchEmulationEnabled", { enabled: touch, maxTouchPoints: touch ? 5 : 0 });
  await sleep(500);
};
const boot = async (w, h, touch) => {
  await size(w, h, touch);
  await send("Page.navigate", { url: "http://localhost:8080/_seedtest.html" }); await sleep(3800);
  await ev("document.getElementById('btn-entry-yes')?.click()"); await sleep(1300);
  await ev("document.querySelectorAll('.modal-backdrop').forEach(m=>m.remove())"); await sleep(200);
};
const key = async (k, code, vk) => {
  await send("Input.dispatchKeyEvent", { type: "keyDown", key: k, code, windowsVirtualKeyCode: vk });
  await send("Input.dispatchKeyEvent", { type: "keyUp", key: k, code, windowsVirtualKeyCode: vk });
};
const TAB = () => key("Tab", "Tab", 9), ESC = () => key("Escape", "Escape", 27);
const rows = []; let pass = 0, fail = 0;
const ok = (label, cond, info) => { cond ? pass++ : fail++; rows.push(`${cond ? "PASS" : "FAIL"}  ${label}${info !== undefined ? "  " + JSON.stringify(info) : ""}`); };
const views = () => ev("return [...document.querySelectorAll('.view.active')].map(v=>v.id).filter(x=>x!=='view-home')");
const openSheets = () => ev("return [...document.querySelectorAll('#view-home .ph-sheet.ph-open')].map(s=>s.id+(s.dataset.wideDefault?'*':''))");

/* ===== Touch targets ===== */
const TT = `const sels=['.pd-bezel .pd-stat','.ph-bd','#btn-start-quiz','.pd-chin .pd-home-ball','#sheet-setting .ph-sheet-x'];
  const out={}; for(const s of sels){ const els=[...document.querySelectorAll(s)].filter(e=>e.offsetParent); out[s]=els.map(e=>{const b=e.getBoundingClientRect(); return Math.round(Math.min(b.width,b.height));}); } return out;`;
for (const [k, w, h, min] of [["S1", 375, 667, 44], ["S3", 820, 1180, 48]]) {
  await boot(w, h, true);
  await ev("document.getElementById('btn-bd-setting').click()"); await sleep(700);
  const t = await ev(TT);
  /* 實際可撳範圍：喺邊緣外 (min-外觀)/2 嘅位置做 hit-test */
  const hit = await ev(`const r={};
    const x=document.querySelector('#sheet-setting .ph-sheet-x'); const xb=x.getBoundingClientRect(); const dx=(${min}-xb.width)/2-0.5;
    r.closeHit=[document.elementFromPoint(xb.left-dx, xb.top+xb.height/2), document.elementFromPoint(xb.right+dx-1, xb.top+xb.height/2), document.elementFromPoint(xb.left+xb.width/2, xb.top-dx), document.elementFromPoint(xb.left+xb.width/2, xb.bottom+dx-1)].every(e=>e===x);
    const ball=document.getElementById('btn-pd-home'); const bb=ball.getBoundingClientRect(); const chin=document.querySelector('.pd-chin'); const cb=chin.getBoundingClientRect();
    r.chinH=Math.round(cb.height); r.ballSpan=48;
    return r;`);
  /* 真滑鼠 click 喺球邊外 3px：應該返主頁（由 settings sheet 開住開始） */
  const bb = await ev("const b=document.getElementById('btn-pd-home').getBoundingClientRect(); return [b.left-3, b.top+b.height/2]");
  await ev("document.getElementById('btn-start-quiz').click()"); await sleep(900);
  for (const type of ["mousePressed","mouseReleased"]) await send("Input.dispatchMouseEvent",{type,x:bb[0],y:bb[1],button:"left",clickCount:1});
  await sleep(900);
  const v = await views();
  const others = [t[".pd-bezel .pd-stat"], t[".ph-bd"], t["#btn-start-quiz"]].flat();
  ok(`${k} touch targets >= ${min}px (stat/dock/CTA box; ✕ hit area; chin ball hit area)`, Math.min(...others) >= min && hit.closeHit && hit.chinH >= min - 2 && v.length === 0, { boxes: t, hit, afterChinClickViews: v });
  /* font inventory (home + settings sheet) */
  const small = await ev(`const res={}; document.querySelectorAll('#view-home *').forEach(e=>{ if(!e.offsetParent) return;
    const t=[...e.childNodes].filter(n=>n.nodeType===3&&n.textContent.trim()).map(n=>n.textContent.trim()).join(' '); if(!t) return;
    const fs=parseFloat(getComputedStyle(e).fontSize); if(fs<12){ const k=(e.className||e.tagName).toString().split(' ')[0]+'@'+fs; res[k]=(res[k]||'')||t.slice(0,24);} }); return res;`);
  rows.push(`      ${k} text < 12px: ${JSON.stringify(small)}`);
}
console.log(rows.join("\n")); console.log(`\n${pass} pass / ${fail} fail; page errors: ${JSON.stringify(errs)}`);
chrome.kill(); process.exit(0);
