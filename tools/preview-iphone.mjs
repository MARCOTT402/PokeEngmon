// 本地手機模擬器：喺電腦開一個「iPhone 外框」，入面係真嘅 app（可點擊操作）
//
//   node tools/preview-iphone.mjs                       # iPhone 17 Pro Max 440x956
//   node tools/preview-iphone.mjs --device iphone-15
//   node tools/preview-iphone.mjs --headless --click "#btn-entry-yes" --shot out.png
//
// 唔用 CDP 做縮放：外框頁 (tools/device-preview.html) 自己按窗口大小整體縮放，
// 安全區由外框注入 --sim-safe-top/bottom，數值同真機一致。

import { spawn } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = argv.indexOf("--" + name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};
const flag = (name) => argv.includes("--" + name);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const device = arg("device", "iphone-17-pro-max");
const URL = arg("url", `http://localhost:8080/tools/device-preview.html?device=${device}`);
const SHOT = arg("shot", "");
const CLICK = arg("click", "");
const JS = arg("js", "");           // click 之後喺 iframe 內執行嘅自訂 JS（doc = iframe document）
const JSWAIT = Number(arg("jswait", "1400"));
const PORT = Number(arg("port", 9230));

const CHROME_CANDIDATES = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  join(process.env.LOCALAPPDATA || "", "Google\\Chrome\\Application\\chrome.exe"),
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium"
];
const chromePath = CHROME_CANDIDATES.find(p => p && existsSync(p));
if (!chromePath) {
  console.error("Chrome not found.");
  process.exit(1);
}

const userDataDir = `--user-data-dir=${join(tmpdir(), "pe-preview-" + Date.now())}`;
const headless = flag("headless");

/* 一般用法：直接開一個無分頁嘅 app 窗，外框頁自己縮放 */
if (!headless && !SHOT && !CLICK) {
  const child = spawn(chromePath, [
    `--app=${URL}`,
    userDataDir,
    "--window-size=620,1180",
    "--window-position=40,20"
  ], { stdio: "ignore", detached: true });
  child.unref();
  console.log(`[preview] 已開啟手機模擬器：${URL}`);
  console.log(`[preview] 外框 = ${device}；視窗大小隨你拖動自動縮放，按 Ctrl+R 重載。`);
  process.exit(0);
}

/* 截圖 / 自動點擊 / headless：用 CDP */
const chrome = spawn(chromePath, [
  headless ? "--headless=new" : "--new-window",
  "--disable-gpu", "--hide-scrollbars",
  `--remote-debugging-port=${PORT}`,
  userDataDir,
  "--window-size=620,1180",
  "about:blank"
], { stdio: "ignore" });

let ws, seq = 0;
const pending = new Map();
const send = (method, params = {}) => new Promise(resolve => {
  const id = ++seq;
  pending.set(id, resolve);
  ws.send(JSON.stringify({ id, method, params }));
});

async function connect() {
  for (let i = 0; i < 50; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
      const page = list.find(t => t.type === "page");
      if (page) {
        ws = new WebSocket(page.webSocketDebuggerUrl);
        await new Promise(r => (ws.onopen = r));
        ws.onmessage = (ev) => {
          const m = JSON.parse(ev.data);
          if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); }
        };
        return;
      }
    } catch {}
    await sleep(300);
  }
  throw new Error("Cannot connect to Chrome via CDP");
}

async function main() {
  await connect();
  await send("Page.enable");
  await send("Page.navigate", { url: URL });
  await sleep(2600);

  if (CLICK) {
    await send("Runtime.evaluate", {
      expression: `(() => {
        const doc = document.getElementById('app')?.contentDocument;
        if (!doc) return 'no-iframe';
        const el = doc.querySelector(${JSON.stringify(CLICK)}) || doc.getElementById(${JSON.stringify(CLICK.replace(/^#/, ""))});
        if (!el) return 'not-found';
        el.click();
        return 'clicked';
      })()`,
      returnByValue: true
    });
    await sleep(1200);
  }

  if (JS) {
    const r = await send("Runtime.evaluate", {
      expression: `(() => {
        const doc = document.getElementById('app')?.contentDocument;
        if (!doc) return 'no-iframe';
        return (function(doc){ ${JS} })(doc);
      })()`,
      returnByValue: true
    });
    if (r && r.exceptionDetails) {
      console.log("[preview] js EXCEPTION →", JSON.stringify(r.exceptionDetails).slice(0, 500));
    } else {
      console.log("[preview] js →", JSON.stringify(r && r.result ? r.result.value : r));
    }
    await sleep(JSWAIT);
  }

  if (SHOT) {
    const s = await send("Page.captureScreenshot", { format: "png" });
    writeFileSync(SHOT, Buffer.from(s.data, "base64"));
    console.log(`[preview] screenshot → ${SHOT}`);
  }

  chrome.kill();
  process.exit(0);
}

main().catch(err => { console.error(err); chrome.kill(); process.exit(1); });
