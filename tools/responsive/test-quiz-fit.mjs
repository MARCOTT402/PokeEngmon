// Responsive P1 互動測試：答題圖片題／文字題喺 7 個尺寸量 overflow、輸入格 vs 鍵盤（Rule 72）。用法：node tools/responsive/test-quiz-fit.mjs <outDir>
// 前置：本地 server http://localhost:8080（.claude/launch.json static）；headless Chrome + CDP；非觸控尺寸要排先（Rule 80）。
// 用法：node tools/responsive/test-quiz-fit.mjs <outDir>
import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os"; import { join } from "node:path";
const OUT = process.argv[2]; mkdirSync(OUT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const PORT = 9263;
const chrome = spawn("C:/Program Files/Google/Chrome/Application/chrome.exe",
  ["--headless=new", "--disable-gpu", "--mute-audio", "--hide-scrollbars", `--remote-debugging-port=${PORT}`, `--user-data-dir=${join(tmpdir(), "pe-t8-" + Date.now())}`, "about:blank"], { stdio: "ignore" });
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
/* 非觸控先，觸控後（Rule 80） */
const SIZES = [
  ["S5", 1366, 640, false], ["S6", 1440, 900, false], ["S9", 1000, 500, false],
  ["S1", 375, 667, true], ["S2", 440, 956, true], ["S3", 820, 1180, true], ["S4", 1180, 820, true]
];
const MEASURE = `const sc=document.getElementById('quiz-scroll'), kb=document.getElementById('quiz-keyboard');
  const inp=document.querySelector('#view-quiz .quiz-card input, #view-quiz input.cell-input, #view-quiz input');
  const kbVisible = kb && !kb.hidden && kb.getBoundingClientRect().height > 0;
  const ib = inp ? inp.getBoundingClientRect() : null, kbr = kbVisible ? kb.getBoundingClientRect() : null;
  const img = document.querySelector('#view-quiz .word-image, #view-quiz .word-card img');
  return {isWord: document.getElementById('view-quiz').classList.contains('is-word'),
    overflow: sc ? sc.scrollHeight - sc.clientHeight : null,
    kbVisible, inputBottom: ib && Math.round(ib.bottom), kbTop: kbr && Math.round(kbr.top),
    inputVisible: ib ? (ib.bottom <= innerHeight && ib.top >= 0) : null,
    imgH: img ? Math.round(img.getBoundingClientRect().height) : null,
    hScroll: document.documentElement.scrollWidth > innerWidth};`;
const rows = [];
for (const [key, w, h, touch] of SIZES) {
  await send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile: touch && Math.min(w, h) < 700 });
  await send("Emulation.setTouchEmulationEnabled", { enabled: touch, maxTouchPoints: touch ? 5 : 0 });
  await send("Page.navigate", { url: "http://localhost:8080/_seedtest.html" }); await sleep(3800);
  await ev("document.getElementById('btn-entry-yes').click()"); await sleep(1300);
  await ev("document.querySelectorAll('.modal-backdrop').forEach(m=>m.style.display='none')");
  await ev("document.getElementById('btn-start-quiz').click()"); await sleep(900);
  await ev("document.getElementById('btn-setup-start').click()"); await sleep(1500);
  for (const want of ["word", "text"]) {
    const ok = await ev(`const i = Quiz.queue.findIndex(x => ${want === "word" ? "x.q.type === 'word'" : "x.q.type !== 'word'"});
      if (i < 0) return false; const [it] = Quiz.queue.splice(i, 1); Quiz.queue.unshift(it); Quiz._renderQuestion(); return true;`);
    await sleep(1200);
    const m = ok === true ? await ev(MEASURE) : { missing: true };
    const pass = m.missing ? "SKIP" : (m.overflow <= 4 && !m.hScroll && m.inputVisible && (!m.kbVisible || m.inputBottom < m.kbTop)) ? "PASS" : "FAIL";
    rows.push(`${pass}  ${key} ${w}x${h}${touch ? " touch" : ""} ${want.padEnd(4)} ${JSON.stringify(m)}`);
    const s = await send("Page.captureScreenshot", { format: "png" });
    writeFileSync(join(OUT, `quiz-${want}-${key}.png`), Buffer.from(s.data, "base64"));
  }
}
console.log(rows.join("\n")); console.log("page errors:", JSON.stringify(errs));
chrome.kill(); process.exit(0);
