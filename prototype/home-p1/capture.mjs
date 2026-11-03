// P1 prototype capture: exact-viewport screenshots + HUD JSON via raw CDP (no deps, Node >=22).
// Usage: node capture.mjs
import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const HTML = "file:///" + join(HERE, "..", "home-p1.html").replace(/\\/g, "/");
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = 9223;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const chrome = spawn(CHROME, [
  "--headless=new", "--disable-gpu", "--hide-scrollbars",
  `--remote-debugging-port=${PORT}`, "--user-data-dir=" + join(HERE, ".chrome-tmp"),
  "about:blank",
], { stdio: "ignore" });

let ws, seq = 0;
const pending = new Map();
const waiters = [];

function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++seq;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
}
function waitEvent(method, timeout = 8000) {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(null), timeout);
    waitEvent.once = waitEvent.once || {};
    waitEvent.once[method] = () => { clearTimeout(t); resolve(true); };
  });
}

async function connect() {
  for (let i = 0; i < 30; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
      const page = list.find((t) => t.type === "page");
      if (page) {
        ws = new WebSocket(page.webSocketDebuggerUrl);
        await new Promise((r) => (ws.onopen = r));
        ws.onmessage = (ev) => {
          const m = JSON.parse(ev.data);
          if (m.id && pending.has(m.id)) { pending.get(m.id).resolve(m.result); pending.delete(m.id); }
          else if (m.method && waitEvent.once?.[m.method]) { const f = waitEvent.once[m.method]; delete waitEvent.once[m.method]; f(); }
        };
        return;
      }
    } catch {}
    await sleep(300);
  }
  throw new Error("cannot connect to chrome");
}

async function shoot(name, url, { w = 375, h = 667, interact = false, json = null } = {}) {
  await send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 2, mobile: true });
  const loaded = waitEvent("Page.loadEventFired");
  await send("Page.navigate", { url });
  await loaded; await sleep(900);

  if (interact) {
    // 1) tap CTA (records firstStartClickMs)
    const r = await send("Runtime.evaluate", { expression:
      "JSON.stringify(document.getElementById('cta').getBoundingClientRect())", returnByValue: true });
    const b = JSON.parse(r.result.value);
    const cx = b.left + b.width / 2, cy = b.left >= 0 ? b.top + b.height / 2 : 0;
    await send("Input.dispatchMouseEvent", { type: "mousePressed", x: cx, y: cy, button: "left", clickCount: 1 });
    await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: cx, y: cy, button: "left", clickCount: 1 });
    await sleep(150);
    // 2) mis-tap on dead zone (left edge of screen padding area)
    await send("Input.dispatchMouseEvent", { type: "mousePressed", x: 16, y: Math.min(h - 40, 430), button: "left", clickCount: 1 });
    await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: 16, y: Math.min(h - 40, 430), button: "left", clickCount: 1 });
    await sleep(150);
    // 3) pull-down drag from top (PTR guard test)
    await send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: 187, y: 120 }] });
    for (let y = 120; y <= 300; y += 30)
      await send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: 187, y }] });
    await send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await sleep(400);
  }

  const shot = await send("Page.captureScreenshot", { format: "png" });
  writeFileSync(join(HERE, name + ".png"), Buffer.from(shot.data, "base64"));

  if (json) {
    await sleep(600);
    const j = await send("Runtime.evaluate", { expression:
      "document.getElementById('hudjson') ? document.getElementById('hudjson').textContent : 'null'", returnByValue: true });
    writeFileSync(join(HERE, json + ".json"), j.result.value);
    console.log(json, j.result.value.slice(0, 200));
  }
  console.log("shot", name);
}

const run = async () => {
  await connect();
  await send("Page.enable");
  await send("Runtime.enable");

  const variants = [["a", "console"], ["a", "hero"], ["b", "console"], ["b", "hero"]];
  for (const [f, ia] of variants) {
    const V = `${f.toUpperCase()}-${ia}`;
    const u = (x) => `${HTML}?frame=${f}&ia=${ia}${x}`;
    await shoot(`${V}_1-default`,  u(""));
    await shoot(`${V}_2-hud`,      u("&hud=1"));
    await shoot(`${V}_3-empty`,    u("&sim=empty"));
    await shoot(`${V}_4-loading`,  u("&sim=loading"));
    await shoot(`${V}_5-offline`,  u("&sim=offline"));
    await shoot(`${V}_6-kb`,       u("&sim=kb"));
    await shoot(`${V}_7-wide430`,  u(""), { w: 430, h: 932 });
  }
  // HUD JSON x3 (with real interactions on first two)
  await shoot("hud_A-console", `${HTML}?frame=a&ia=console&json=1`, { json: "hud_A-console_375x667", interact: true });
  await shoot("hud_B-hero",    `${HTML}?frame=b&ia=hero&json=1`,    { json: "hud_B-hero_375x667",    interact: true });
  await shoot("hud_A-kb",      `${HTML}?frame=a&ia=console&sim=kb&json=1`, { json: "hud_A-console_kb" });

  chrome.kill();
  process.exit(0);
};
run().catch((e) => { console.error(e); chrome.kill(); process.exit(1); });
