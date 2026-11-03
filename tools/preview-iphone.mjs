// 本地真機尺寸預覽：用 CDP 把 Chrome 視口鎖成指定手機尺寸（含 safe-area 模擬）
//
//   node tools/preview-iphone.mjs                     # iPhone 17 Pro Max 440x956
//   node tools/preview-iphone.mjs --device iphone-15
//   node tools/preview-iphone.mjs --url http://localhost:8080/index.html
//   node tools/preview-iphone.mjs --headless --shot out.png   # 自動截圖後結束
//
// 需要 Node 18+（原生 fetch / WebSocket）。

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

const DEVICES = {
  "iphone-17-pro-max": { label: "iPhone 17 Pro Max", w: 440, h: 956, dpr: 3, top: 62, bottom: 34 },
  "iphone-16-pro":     { label: "iPhone 16 Pro",     w: 402, h: 874, dpr: 3, top: 62, bottom: 34 },
  "iphone-15":         { label: "iPhone 15",         w: 393, h: 852, dpr: 3, top: 59, bottom: 34 },
  "iphone-se":         { label: "iPhone SE",         w: 375, h: 667, dpr: 2, top: 0,  bottom: 0  }
};

const deviceKey = arg("device", "iphone-17-pro-max");
const dev = DEVICES[deviceKey];
if (!dev) {
  console.error(`Unknown device "${deviceKey}". Choose: ${Object.keys(DEVICES).join(", ")}`);
  process.exit(1);
}
const URL = arg("url", "http://localhost:8080/index.html");
const SHOT = arg("shot", "");

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
  console.error("Chrome not found. Install Chrome or edit CHROME_CANDIDATES in this script.");
  process.exit(1);
}

const PORT = Number(arg("port", 9230));
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const chrome = spawn(chromePath, [
  flag("headless") ? "--headless=new" : "--new-window",
  "--disable-gpu", "--hide-scrollbars",
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${join(tmpdir(), "pe-preview-" + Date.now())}`,
  `--window-size=${dev.w + 80},${dev.h + 80}`,
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
  await send("Emulation.setDeviceMetricsOverride", {
    width: dev.w, height: dev.h, deviceScaleFactor: dev.dpr, mobile: true,
    screenWidth: dev.w, screenHeight: dev.h
  });
  /* 模擬 iPhone 安全區（notch / Dynamic Island + home indicator） */
  try {
    await send("Emulation.setSafeAreaInsetsOverride", {
      insets: { top: dev.top, bottom: dev.bottom, left: 0, right: 0 }
    });
  } catch {
    console.warn("[preview] 此 Chrome 版本唔支援 safe-area 模擬（env() 會係 0）");
  }
  await send("Page.navigate", { url: URL });
  await sleep(2200);

  const preClick = arg("click", "");
  if (preClick) {
    await send("Runtime.evaluate", {
      expression: `(() => { const el = document.querySelector(${JSON.stringify(preClick)}) || document.getElementById(${JSON.stringify(preClick.replace(/^#/, ""))}); if (el) el.click(); })()`
    });
    await sleep(900);
  }

  console.log(`[preview] ${dev.label} ${dev.w}x${dev.h}@${dev.dpr}x  safe: ${dev.top}/${dev.bottom}`);
  console.log(`[preview] ${URL}`);

  if (SHOT) {
    const s = await send("Page.captureScreenshot", { format: "png" });
    writeFileSync(SHOT, Buffer.from(s.data, "base64"));
    console.log(`[preview] screenshot → ${SHOT}`);
    chrome.kill();
    process.exit(0);
  }

  console.log("[preview] 改完檔案按 Ctrl+R（或叫我在頁面按 F5）即可重載；關窗即結束。");
  chrome.on("exit", () => process.exit(0));
}

main().catch(err => { console.error(err); chrome.kill(); process.exit(1); });
