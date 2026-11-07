// 動畫倍速測試（Rule 95，js/anim-speed.js）：扭蛋、進化喺 1× 同 3× 嘅時間；每次完結／中途關閉後 GSAP timeScale 同 --anim-spd 要還原做 1。
// 捕捉只做「有冇加速＋有冇還原」：headless 冇 GPU，3D 得幾 fps，計時唔準（用真瀏覽器睇）。
// 前置：本地 server http://localhost:8080（.claude/launch.json static）；headless Chrome + CDP。
// 用法：node tools/responsive/test-anim-speed.mjs [--base http://localhost:8080/]
// 注意：會寫 localStorage（倍速設定、扭蛋鑽石）——只准喺 localhost 跑（Rule 62）。
import { spawn } from "node:child_process";
import { tmpdir } from "node:os"; import { join } from "node:path";

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const BASE = arg("--base", "http://localhost:8080/").replace(/\/?$/, "/");
const sleep = ms => new Promise(r => setTimeout(r, ms));
const PORT = 9294;
const chrome = spawn("C:/Program Files/Google/Chrome/Application/chrome.exe",
  ["--headless=new", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--mute-audio",
   "--autoplay-policy=no-user-gesture-required",
   `--remote-debugging-port=${PORT}`, `--user-data-dir=${join(tmpdir(), "pe-anim-" + Date.now())}`, "about:blank"], { stdio: "ignore" });

let ws, seq = 0; const pend = new Map(); const errs = [];
const send = (m, p = {}) => new Promise(r => { const id = ++seq; pend.set(id, r); ws.send(JSON.stringify({ id, method: m, params: p })); });
const ev = async e => {
  const r = await send("Runtime.evaluate", { expression: `(async()=>{${e}})()`, returnByValue: true, awaitPromise: true, timeout: 400000 });
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
await send("Runtime.enable"); await send("Page.enable");
await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
await send("Page.navigate", { url: BASE });
for (let i = 0; i < 120; i++) {
  if (await ev("return !!(window.App && window.AnimSpeed && window.CaptureScene && window.gsap && !document.getElementById('loading-screen'))") === true) break;
  await sleep(250);
}
await ev("if (location.hostname !== 'localhost') throw new Error('localhost only'); App.closeModal(); return 1");

const rows = []; let pass = 0, fail = 0;
const check = (label, ok, info) => { ok ? pass++ : fail++; const l = `${ok ? "PASS" : "FAIL"}  ${label}${info !== undefined ? "  " + JSON.stringify(info) : ""}`; rows.push(l); console.error(l); };
const PRE = `const sleep = ms => new Promise(r => setTimeout(r, ms));
  const snap = () => ({ ts: gsap.globalTimeline.timeScale(), v: document.documentElement.style.getPropertyValue('--anim-spd') || '1' });`;
const reset = s => s && s.ts === 1 && String(s.v).trim() === "1";

/* 進化 */
const evo = {};
for (const spd of [1, 3]) {
  evo[spd] = await ev(`${PRE}
    AnimSpeed.set(${spd});
    const t0 = performance.now();
    EvolveScene.open({ fromDex: 1, toDex: 2, onDone: () => {} });
    const during = snap();
    while ((document.getElementById('evo-hint') || {}).textContent !== 'Tap outside to continue') { await sleep(10); if (performance.now() - t0 > 30000) return { timeout: true }; }
    const ms = performance.now() - t0; const afterArm = snap();
    EvolveScene.close();
    return { ms: Math.round(ms), during, afterArm, afterClose: snap() };`);
}
check("A1 evolution 3× ≈ 1/3 of 1×", evo[1].ms && evo[3].ms && Math.abs(evo[1].ms / evo[3].ms - 3) < 0.4, { x1: evo[1].ms, x3: evo[3].ms });
check("A2 evolution speeds GSAP while playing", evo[3].during && evo[3].during.ts === 3, evo[3].during);
check("A3 evolution resets speed when the animation ends and on close", reset(evo[3].afterArm) && reset(evo[3].afterClose), evo[3]);

/* 扭蛋 */
const gacha = {};
for (const spd of [1, 3]) {
  gacha[spd] = await ev(`${PRE}
    const st = loadState(); st.diamonds = 999; saveState(st);
    AnimSpeed.set(${spd});
    Gacha.open('rare'); await sleep(800);
    Gacha._setPull(1);
    const t0 = performance.now();
    Gacha._triggerPull(); await sleep(50);
    const during = snap();
    while (Gacha.phase !== 'inspect') { await sleep(10); if (performance.now() - t0 > 60000) return { timeout: true, phase: Gacha.phase }; }
    const ms = performance.now() - t0; const atReveal = snap();
    App.closeGachaSheet(); await sleep(400);
    return { ms: Math.round(ms), during, atReveal, afterClose: snap() };`);
}
check("A4 gacha 3× ≈ 1/3 of 1×", gacha[1].ms && gacha[3].ms && Math.abs(gacha[1].ms / gacha[3].ms - 3) < 0.5, { x1: gacha[1].ms, x3: gacha[3].ms });
check("A5 gacha resets speed at the result card and on close", reset(gacha[3].atReveal) && reset(gacha[3].afterClose), gacha[3]);

/* 扭蛋中途離開 */
const abort = await ev(`${PRE}
  AnimSpeed.set(3); Gacha.open('rare'); await sleep(800); Gacha._setPull(1); Gacha._triggerPull(); await sleep(400);
  const during = snap(); App.closeGachaSheet(); await sleep(300);
  return { during, after: snap() };`);
check("A6 gacha aborted mid-animation resets speed", abort.during.ts === 3 && reset(abort.after), abort);

/* 捕捉：只驗加速同還原 */
const cap = await ev(`${PRE}
  if (!CaptureScene.isSupported()) return { skip: true };
  AnimSpeed.set(2); if (window.__setCatchRate) __setCatchRate(1);
  App.showView('view-capture');
  /* CaptureScene 係 lazy facade：play() 先 import 3D 場景，所以要等真場景起咗先量 */
  const p = CaptureScene.play({ dexId: 25, name: 'Pikachu', onCaught: () => ({ isDupe: true, dexId: 25, name: 'Pikachu' }) });
  let done = false; p.then(() => { done = true; }, () => { done = 'error'; });
  const t0 = performance.now();
  while (!CaptureScene._real && performance.now() - t0 < 60000) await sleep(50);
  await sleep(200);
  const during = snap();
  const badge = (document.querySelector('#view-capture .anim-spd-badge') || {}).textContent || null;
  while (CaptureScene.state !== 'idle' && performance.now() - t0 < 180000) await sleep(50);
  const stateAtTap = CaptureScene.state;
  CaptureScene.tap(); CaptureScene.tap(); CaptureScene.tap();
  const t1 = performance.now();
  while (!done && performance.now() - t1 < 300000) await sleep(100);
  if (window.__setCatchRate) __setCatchRate(0.8);
  return { loaded: !!CaptureScene._real, stateAtTap, during, badge, done, after: snap() };`);
if (!cap || cap.exc) rows.push("FAIL  A7/A8 capture eval failed  " + JSON.stringify(cap)), fail++;
else if (cap.skip) rows.push("SKIP  A7/A8 capture (no WebGL)");
else {
  check("A7 capture speeds GSAP and shows the 2× badge", cap.during.ts === 2 && cap.badge === "2×", cap);
  check("A8 capture resets speed when finished", cap.done && reset(cap.after), { done: cap.done, after: cap.after });
}
await ev("AnimSpeed.set(1); return 1");

console.log(rows.join("\n"));
console.log(`\n${pass} pass / ${fail} fail; page errors: ${JSON.stringify(errs)}`);
ws.close(); chrome.kill(); process.exit(fail ? 1 : 0);
