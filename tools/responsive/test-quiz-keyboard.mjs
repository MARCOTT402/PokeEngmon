// App 答題鍵盤快打測試（Rule 107，js/quiz.js _buildKeyboard）：用真 CDP 觸控（Input.dispatchTouchEvent）模擬手機／平板快打。
// 重點：兩隻手指重疊（A 未放 B 已撳）、同一粒鍵連撳（double-tap）、極短間隔 —— 每下都要入到字，唔可以靠 click（非 primary pointer 冇 click）。
// 前置：本地 server http://localhost:8080（.claude/launch.json static）；headless Chrome + CDP。
// 用法：node tools/responsive/test-quiz-keyboard.mjs
import { spawn } from "node:child_process";
import { tmpdir } from "node:os"; import { join } from "node:path";

const sleep = ms => new Promise(r => setTimeout(r, ms));
/* 每個尺寸開一個新 Chrome：同一個 browser 轉 viewport／mobile 之後，CDP 觸控模擬會失效（第二個尺寸點都冇反應，唔關 app 事） */
let chrome, ws, seq = 0; const pend = new Map(); const errs = [];
const send = (m, p = {}) => new Promise(r => { const id = ++seq; pend.set(id, r); ws.send(JSON.stringify({ id, method: m, params: p })); });
const ev = async e => {
  const r = await send("Runtime.evaluate", { expression: `(async()=>{${e}})()`, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) return { exc: JSON.stringify(r.exceptionDetails).slice(0, 300) };
  return r.result?.value;
};
async function launch(port) {
  chrome = spawn("C:/Program Files/Google/Chrome/Application/chrome.exe",
    ["--headless=new", "--disable-gpu", "--mute-audio", "--hide-scrollbars", `--remote-debugging-port=${port}`,
     `--user-data-dir=${join(tmpdir(), "pe-qkb-" + port + "-" + Date.now())}`, "about:blank"], { stdio: "ignore" });
  for (let i = 0; i < 50; i++) {
    try {
      const l = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
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
}

let pass = 0, fail = 0;
const check = (label, ok, info) => {
  ok ? pass++ : fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${info !== undefined ? "  " + JSON.stringify(info) : ""}`);
};

/* 觸控：CDP 會同上一個 event 比較 touchPoints 逐點 diff（新 id = 撳落）。
   注意：Chrome 模擬中途「淨放一隻」唔生效（全部留到 touchEnd 先一齊放），所以重疊快打用「多指同時撳住」表達：
   第二隻開始就係非 primary pointer —— 瀏覽器唔會幫佢發 click，正正係用戶遇到嘅食字情況。 */
const T = (type, list) => send("Input.dispatchTouchEvent", { type, touchPoints: list.map(([x, y, id]) => ({ x, y, id, radiusX: 4, radiusY: 4, force: 1 })) });
async function tap(xy) { await T("touchStart", [[...xy, 1]]); await sleep(20); await T("touchEnd", []); }
async function chord(list) {   /* list：依次撳落（唔放），最後全部放手 */
  const held = [];
  for (let i = 0; i < list.length; i++) { held.push([...list[i], i + 1]); await T(i ? "touchMove" : "touchStart", held); await sleep(25); }
  await T("touchEnd", []);
}
const keyXY = ch => ev(`const k=[...document.querySelectorAll('#quiz-keyboard .qk-key')].find(b=>b.dataset.ch===${JSON.stringify(ch)});
  if(!k) return null; const r=k.getBoundingClientRect(); return [Math.round(r.left+r.width/2), Math.round(r.top+r.height/2)];`);
const backXY = () => ev(`const r=document.querySelector('#quiz-keyboard [data-kb="back"]').getBoundingClientRect(); return [Math.round(r.left+r.width/2), Math.round(r.top+r.height/2)];`);
const value = () => ev("const c=Quiz.cells[Quiz.currentCell]; return c && c.input ? c.input.value : null");
const state = () => ev(`const c=Quiz.cells[Quiz.currentCell]; const kb=document.getElementById('quiz-keyboard').getBoundingClientRect();
  const hit=document.elementFromPoint(innerWidth/2, kb.top+60);
  return JSON.stringify({cur:Quiz.currentCell, dis:!!(c&&c.input.disabled), ans:Quiz.answered, catchMode:Quiz._isCatchMode(), view:(document.querySelector('.view.active')||{}).id, kbTop:Math.round(kb.top), hit:hit&&(hit.id||hit.className)})`);
const clear = async () => { await ev("const c=Quiz.cells[Quiz.currentCell]; c.input.value=''; c.input.dispatchEvent(new Event('input',{bubbles:true})); return 1"); await sleep(80); };

let port = 9297;
for (const [key, w, h, mobile] of [["phone", 440, 956, true], ["tablet", 820, 1180, false]]) {
  if (chrome) { try { ws.close(); } catch {} chrome.kill(); await sleep(500); }
  await launch(port++);
  await send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile });
  await send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
  await send("Page.navigate", { url: "http://localhost:8080/_seedtest.html" }); await sleep(3800);
  await ev("document.getElementById('btn-entry-yes').click()"); await sleep(1300);
  await ev("document.querySelectorAll('.modal-backdrop').forEach(m=>m.style.display='none')");
  await ev("document.getElementById('btn-start-quiz').click()"); await sleep(900);
  await ev("document.getElementById('btn-setup-start').click()"); await sleep(1500);
  /* 用文字題（非捕捉模式）；確保 App 鍵盤顯示 */
  await ev(`const i = Quiz.queue.findIndex(x => x.q.type !== 'word'); if (i > 0) { const [it] = Quiz.queue.splice(i, 1); Quiz.queue.unshift(it); Quiz._renderQuestion(); } return 1`);
  await sleep(1000);
  const kbOn = await ev("const kb=document.getElementById('quiz-keyboard'); return !!kb && !kb.hidden && kb.getBoundingClientRect().height>0");
  check(`${key}: App 鍵盤顯示`, kbOn === true, kbOn);
  if (kbOn !== true) { console.log("  state", await state()); continue; }

  const P = {}; for (const ch of "helowrd") P[ch] = await keyXY(ch);

  /* 1) 單指正常打 */
  await clear();
  for (const ch of "hello") { await tap(P[ch]); await sleep(40); }
  await sleep(150);
  check(`${key}: 單指逐粒打 hello`, (await value()) === "hello", await value());

  /* 2) 多指重疊快打：前一隻未放，下一隻已撳 */
  await clear();
  await chord([..."world"].map(ch => P[ch]));
  await sleep(150);
  check(`${key}: 多指重疊快打 world`, (await value()) === "world", await value());

  /* 3) 同一粒鍵極快連撳（ll），間隔 < double-tap 門檻 */
  await clear();
  for (const ch of "hello") { await tap(P[ch]); await sleep(10); }
  await sleep(150);
  check(`${key}: 極快連撳 hello（含 ll）`, (await value()) === "hello", await value());

  /* 4) ⌫ 重疊都要刪到：h、e、⌫ → "h" */
  await clear();
  await chord([P.h, P.e, await backXY()]);
  await sleep(150);
  check(`${key}: 重疊 h e ⌫ → h`, (await value()) === "h", await value());

  /* 5) 撳落後滑出鍵外放手：字母喺撳落時已入，只入一次 */
  await clear();
  await T("touchStart", [[...P.d, 1]]); await sleep(30);
  await T("touchMove", [[P.d[0], P.d[1] - 200, 1]]); await sleep(30);
  await T("touchEnd", []); await sleep(150);
  check(`${key}: 撳一下只入一個字（無重複）`, (await value()) === "d", await value());

  /* 6) Submit 放手先算：撳住滑走唔會交卷；正常 tap 會交卷（spy Quiz.check，因為 check 有多條路） */
  await ev("window._chk = 0; Quiz._origCheck = Quiz.check; Quiz.check = function () { window._chk++; }; return 1");
  const G = await ev(`const r=document.getElementById('qk-go').getBoundingClientRect(); return [Math.round(r.left+r.width/2), Math.round(r.top+r.height/2)]`);
  await T("touchStart", [[...G, 1]]); await sleep(30);
  await T("touchMove", [[G[0], G[1] - 250, 1]]); await sleep(30);
  await T("touchEnd", []); await sleep(300);
  check(`${key}: Submit 撳住滑走唔交卷`, (await ev("return window._chk")) === 0, await ev("return window._chk"));
  await tap(G); await sleep(300);
  check(`${key}: Submit tap 交卷（只一次）`, (await ev("return window._chk")) === 1, await ev("return window._chk"));
  await ev("Quiz.check = Quiz._origCheck; return 1");
}
check("冇 page error", errs.length === 0, errs);
console.log(`\n${pass} pass, ${fail} fail`);
chrome.kill(); process.exit(fail ? 1 : 0);
