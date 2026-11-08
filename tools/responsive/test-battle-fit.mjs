// Responsive 測試：戰鬥畫面喺 tablet／wide 用固定設計畫布等比例放大（HP 框／字／精靈同舞台比例 = 手機橫向），phone／phone-land 數值不變。Rule 90。
// 前置：本地 server http://localhost:8080（.claude/launch.json static）；headless Chrome + CDP；非觸控尺寸要排先（Rule 80）。
// 用法：node tools/responsive/test-battle-fit.mjs <outDir>
import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os"; import { join } from "node:path";
const OUT = process.argv[2]; mkdirSync(OUT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const PORT = 9268;
const chrome = spawn("C:/Program Files/Google/Chrome/Application/chrome.exe",
  ["--headless=new", "--disable-gpu", "--mute-audio", "--hide-scrollbars", `--remote-debugging-port=${PORT}`, `--user-data-dir=${join(tmpdir(), "pe-btfit-" + Date.now())}`, "about:blank"], { stdio: "ignore" });
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
const shot = async name => { const r = await send("Page.captureScreenshot", { format: "png" }); writeFileSync(join(OUT, name + ".png"), Buffer.from(r.data, "base64")); };
const M = `const q=s=>document.querySelector(s); const R=e=>{const b=e.getBoundingClientRect(); return [b.left,b.top,b.width,b.height].map(Math.round);};
 const scr=q('#bl-screen').getBoundingClientRect(), st=q('.battle-stage'), bt=q('.battle-bottom').getBoundingClientRect();
 return JSON.stringify({layout:document.documentElement.dataset.layout, scaled:q('.battle-land').classList.contains('bl-scaled'),
  stage:R(st), stageLayoutW:st.offsetWidth, foeBox:R(q('.battle-hpbox-foe')), foe:R(q('#foe-sprite')), introMy:R(q('#intro-my-trainer')),
  inside: bt.bottom <= scr.bottom + 1 && bt.top >= scr.top - 1 && st.getBoundingClientRect().left >= scr.left - 1 && st.getBoundingClientRect().right <= scr.right + 1,
  hScroll: document.documentElement.scrollWidth > innerWidth});`;
const startBattle = async () => {
  /* 本地測試頁先補能量（Rule 62：只限 localhost） */
  await ev("if(location.hostname!=='localhost') throw 1; const st=loadState(); Energy.status(st); st.energy.points=50; saveState(st);");
  /* 打 AI 唔再開揀隊頁，用背包 My Team（spec 20261108-trainer-level §5）：測試存檔 My Team 空就填返健康嘅頭 6 隻 */
  await ev("const st=loadState(); if(!(st.myTeam||[]).length){ st.myTeam=st.entries.filter(e=>Array.isArray(e.ownedSpecies)&&e.ownedSpecies.length&&!(window.Pet&&Pet.isFaint(e))).slice(0,6).map(e=>e.uid); saveState({now:true}); }");
  await ev("BattleUI.openMenu()"); await sleep(900);
  await ev("document.querySelector('.ai-trainer-card').click()"); await sleep(600);
  await ev("document.querySelector('.tier-card:not([disabled])').click()"); await sleep(1500);
  await ev("const c=document.getElementById('team-select-confirm'), m=document.getElementById('team-select-modal'); const open=()=>m.style.display!=='none'; for(const s of document.querySelectorAll('.team-slot')){ c.click(); if(!open()) break; s.click(); } if (open()) c.click();");  /* 開咗局就唔好再撳 confirm（會開多一場） */ await sleep(1800);
  await ev("document.querySelector('.bag-rotate.show .bag-rot-btn')?.click()"); await sleep(2600);
};
const rows = []; let pass = 0, fail = 0;
const check = (label, s, ok) => { ok ? pass++ : fail++; rows.push(`${ok ? "PASS" : "FAIL"}  ${label}  ${JSON.stringify(s)}`); };
/* 手機基準（改動前量度）：phone 直向轉 90°、phone-land 原生 */
const BASE = { S8: { stage: [170, 26, 664, 310], foeBox: [183, 35, 240, 74] }, S2: { stage: [98, 170, 310, 664], foeBox: [324, 183, 74, 240] } };
const SIZES = [["S6",1440,900,false],["S5",1366,640,false],["S7",1920,1080,false],["S4",1180,820,false],["S3",820,1180,true],["S8",956,440,true],["S2",440,956,true]];
for (const [id, w, h, t] of SIZES) {
  await boot(w, h, t); await startBattle();
  const s = JSON.parse(await ev(M)); await shot(`battle-${id}`);
  if (BASE[id]) {
    check(`${id} ${w}x${h} phone unchanged`, s, !s.scaled && JSON.stringify(s.stage) === JSON.stringify(BASE[id].stage) && JSON.stringify(s.foeBox) === JSON.stringify(BASE[id].foeBox));
  } else {
    const k = s.stage[2] / 664;
    const near = (a, b) => Math.abs(a - b) <= Math.max(2, b * 0.02);
    check(`${id} ${w}x${h} scaled canvas, proportions = phone-land`, s,
      s.scaled && s.stageLayoutW === 664 && near(s.foeBox[2], 240 * k) && near(s.foe[2], 143 * k) && near(s.introMy[2], 148 * k) && s.inside && !s.hScroll);
  }
}
console.log(rows.join("\n")); console.log(`\n${pass} pass / ${fail} fail; page errors: ${JSON.stringify(errs)}`);
chrome.kill(); process.exit(0);
