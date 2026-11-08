// 全鍵盤操作測試（Rule 97，js/keys.js）：用真 CDP 按鍵（Input.dispatchKeyEvent）淨用 ↑↓←→／Enter／Esc／捷徑鍵行主要流程。
// 前置：本地 server http://localhost:8080（.claude/launch.json static）；headless Chrome + CDP。
// 用法：node tools/responsive/test-keys.mjs [--base http://localhost:8080/]
// 注意：會寫 localStorage（_seedtest.html 種子、扭蛋鑽石、能量）——只准喺 localhost 跑（Rule 62）。
import { spawn } from "node:child_process";
import { tmpdir } from "node:os"; import { join } from "node:path";

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const BASE = arg("--base", "http://localhost:8080/").replace(/\/?$/, "/");
const ONLY = arg("--only", "");   /* --only battle：淨跑戰鬥段（除錯用） */
const sleep = ms => new Promise(r => setTimeout(r, ms));
const PORT = 9293;
const chrome = spawn("C:/Program Files/Google/Chrome/Application/chrome.exe",
  ["--headless=new", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--mute-audio", "--hide-scrollbars",
   `--remote-debugging-port=${PORT}`, `--user-data-dir=${join(tmpdir(), "pe-keys-" + Date.now())}`, "about:blank"], { stdio: "ignore" });

let ws, seq = 0; const pend = new Map(); const errs = [];
const send = (m, p = {}) => new Promise(r => { const id = ++seq; pend.set(id, r); ws.send(JSON.stringify({ id, method: m, params: p })); });
const ev = async e => {
  const r = await send("Runtime.evaluate", { expression: `(async()=>{${e}})()`, returnByValue: true, awaitPromise: true });
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

const KEYS = {
  ArrowUp: [38, "ArrowUp"], ArrowDown: [40, "ArrowDown"], ArrowLeft: [37, "ArrowLeft"], ArrowRight: [39, "ArrowRight"],
  Enter: [13, "Enter", "\r"], Escape: [27, "Escape"], Tab: [9, "Tab"], "?": [191, "Slash", "?"], " ": [32, "Space", " "],
  "[": [219, "BracketLeft", "["], "]": [221, "BracketRight", "]"], Delete: [46, "Delete"]
};
for (const ch of "abcdefghijklmnopqrstuvwxyz") KEYS[ch] = [ch.toUpperCase().charCodeAt(0), "Key" + ch.toUpperCase(), ch];
for (const d of "0123456789") KEYS[d] = [48 + Number(d), "Digit" + d, d];
async function press(k, mods = 0) {
  const [code, codeName, text] = KEYS[k];
  const base = { key: k, code: codeName, windowsVirtualKeyCode: code, nativeVirtualKeyCode: code, modifiers: mods };
  await send("Input.dispatchKeyEvent", { type: text ? "keyDown" : "rawKeyDown", ...base, ...(text ? { text, unmodifiedText: text } : {}) });
  await send("Input.dispatchKeyEvent", { type: "keyUp", ...base });
  await sleep(200);
}
const SHIFT = 8;
const focusId = () => ev(`const a=document.activeElement; return a && a !== document.body ? (a.id || a.className || a.tagName) : 'body'`);
const inside = sel => ev(`return !!document.activeElement.closest(${JSON.stringify(sel)})`);
const ctxKey = () => ev("return Keys.context().key");
const views = () => ev("return [...document.querySelectorAll('.view.active')].map(v=>v.id).join(',')");
const openSheets = () => ev("return [...document.querySelectorAll('.ph-sheet.ph-open')].filter(s=>!s.dataset.wideDefault).map(s=>s.id).join(',')");
const waitFor = async (expr, ms = 15000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await ev("return !!(" + expr + ")") === true) return true; await sleep(150); } return false; };

const rows = []; let pass = 0, fail = 0;
const check = (label, ok, info) => {
  ok ? pass++ : fail++;
  const line = `${ok ? "PASS" : "FAIL"}  ${label}${info !== undefined ? "  " + JSON.stringify(info) : ""}`;
  rows.push(line); console.error(line);   /* 即時輸出：卡住都知去到邊 */
};

async function boot(w, h) {
  await send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url: BASE + "_seedtest.html" });
  await waitFor("window.App && window.Keys && document.getElementById('btn-entry-yes')", 20000);
  await sleep(1200);
  await ev("App.closeModal(); return 1");
  await sleep(300);
}
async function home() {
  await ev("App.closeModal(); if (document.querySelector('.view.active:not(#view-home)')) App.showView('view-home'); App._closeAllSheets && App._closeAllSheets(); return 1");
  await sleep(700);
}

/* ================= wide 1280×800 ================= */
if (ONLY !== "battle") {
await boot(1280, 800);
check("W1 entry gate: ↓ focuses YES", (await press("ArrowDown"), (await focusId()) === "btn-entry-yes"), await focusId());
await press("Enter"); await sleep(1200);
await press("ArrowDown");
check("W2 home: arrows land on a home button", /btn-|ph-cta/.test(await focusId()), await focusId());
await ev("document.getElementById('btn-bd-setting').focus(); return 1");
await press("Enter"); await sleep(800);
check("W3 Enter on Settings opens sheet, focus jumps in", (await openSheets()) === "sheet-setting" && await inside("#sheet-setting"), { sheets: await openSheets(), focus: await focusId() });
await press("ArrowDown");
check("W4 ↓ stays inside the sheet", await inside("#sheet-setting"), await focusId());
await press("Escape"); await sleep(800);
check("W5 Esc closes sheet, focus back on Settings", (await openSheets()) === "" && (await focusId()) === "btn-bd-setting", { sheets: await openSheets(), focus: await focusId() });
await press("?"); await sleep(400);
check("W6 ? opens shortcut list", await ev("return !!document.getElementById('kbd-help-close')"));
await press("Enter"); await sleep(400);
check("W7 Enter closes it", await ev("return !document.getElementById('kbd-help-close')"));
await press("ArrowDown");
const badges = await ev("return [...document.querySelectorAll('.kbd-badge')].map(b=>b.textContent).join('')");
check("W8 key badges in keyboard mode", /S/.test(badges) && /D/.test(badges), badges);
await send("Input.dispatchMouseEvent", { type: "mousePressed", x: 3, y: 3, button: "left", clickCount: 1 });
await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: 3, y: 3, button: "left", clickCount: 1 });
await sleep(250);
check("W9 badges hide after mouse", (await ev("return document.querySelectorAll('.kbd-badge').length")) === 0);
for (const [k, id] of [["d", "sheet-pokedex"], ["g", "sheet-gacha"], ["c", "sheet-calendar"], ["1", "sheet-battle"], ["4", "sheet-setting"]]) {
  await press(k); await sleep(800);
  const s = await openSheets();
  await press("Escape"); await sleep(800);
  check(`W10 '${k}' opens ${id}, Esc closes`, s === id && (await openSheets()) === "", s);
}
/* 捷徑開關 */
await ev("Keys.setShortcutsOn(false); return 1");
await press("d"); await sleep(700);
check("W11 shortcuts off: 'd' does nothing", (await openSheets()) === "");
await ev("Keys.setShortcutsOn(true); return 1");

/* 背包：B 開；鍵盤拎起放低；Esc 先取消再關 */
await press("b"); await sleep(1500);
const bagOpen = () => ev("const b=document.querySelector('.bag-root'); return !!b && getComputedStyle(b).display !== 'none'");
check("W12 'b' opens the bag", await bagOpen());
const teamBefore = await ev("return JSON.stringify(loadState().myTeam || [])");
await ev("const c=document.querySelector('.bag-root #bag-grid .bag-cell[data-uid]'); c && c.focus(); return !!c");
await press(" "); await sleep(300);
check("W13 Space lifts a Pokémon (targets highlighted)", await ev("return document.querySelector('.bag-root').classList.contains('kbd-carry') && document.querySelectorAll('.bag-root [data-kbd-drop]').length > 0"));
await press("Escape"); await sleep(300);
check("W14 Esc cancels the carry, bag stays open", (await ev("return !document.querySelector('.bag-root').classList.contains('kbd-carry')")) && await bagOpen());
await ev("const c=document.querySelector('.bag-root #bag-grid .bag-cell[data-uid]'); c && c.focus(); return 1");
await press(" "); await sleep(200);
await ev("const t=[...document.querySelectorAll('.bag-root [data-kbd-drop]')].pop(); t && t.focus(); return !!t");
await press(" "); await sleep(600);
const teamAfter = await ev("return JSON.stringify(loadState().myTeam || [])");
check("W15 Space on a team slot drops it (team changed)", teamAfter !== teamBefore, { teamBefore, teamAfter });
await press("Escape"); await sleep(900);
check("W16 Esc closes the bag", !(await bagOpen()));
await home();

/* 圖鑑詳情 Shift+←／→ */
await ev("Pokedex.open(); return 1"); await sleep(1200);
await ev("const c=document.querySelector('#pokedex-grid .dex-cell.owned'); c && c.focus(); return !!c");
await press("Enter"); await sleep(700);
const d0 = await ev("return Pokedex._detailDex");
await press("ArrowRight", SHIFT); await sleep(600);
const d1 = await ev("return Pokedex._detailDex");
await press("]"); await sleep(600);
const d2 = await ev("return Pokedex._detailDex");
await press("[", 0); await sleep(600);
const d3 = await ev("return Pokedex._detailDex");
check("W17 dex detail: Shift+→ / ] / [ step through owned", d0 && d1 !== d0 && d2 !== d1 && d3 === d1, { d0, d1, d2, d3 });
await press("Escape"); await sleep(500);
check("W18 Esc closes dex detail", await ev("return !document.querySelector('#modal-root .dex-detail')"));
await home();

/* 選題 S → 答題 S；打字唔觸發捷徑 */
await press("s"); await sleep(900);
check("W19 's' opens quiz setup", /view-quiz-setup/.test(await views()), await views());
await press("s"); await sleep(1500);
check("W20 's' starts the quiz", /view-quiz(,|$)/.test(await views()), await views());
await press("d"); await sleep(200);
check("W21 typing 'd' in the answer box types it", (await ev("return document.activeElement.value || ''")).includes("d"));
await press("Escape"); await sleep(500);
check("W22 Esc opens quiz settings", await ev("return !!document.getElementById('quiz-settings-close')"));
await ev("document.getElementById('quiz-settings-close').focus(); return 1");
await press("Enter"); await sleep(400);
check("W23 Enter on Keep going keeps the quiz", (await ev("return !document.getElementById('quiz-settings-close')")) && /view-quiz/.test(await views()));
await ev("Quiz.quit ? Quiz.quit() : 0; return 1"); await home();

/* 扭蛋：Enter 拉 → 結果卡焦點 → Esc 關 */
await ev("if(location.hostname!=='localhost') throw 1; const st=loadState(); st.diamonds=99; saveState(st); App.renderHome(); return 1");
await press("g"); await sleep(900);
check("W24 gacha sheet focuses the single-pull button", (await focusId()) === "btn-gacha-1", await focusId());
await press("Enter");
/* 撳 3 下階段：Space ×3（同捕捉一樣） */
await waitFor("!!Gacha._tapCleanup || Gacha.phase === 'inspect'", 20000);
for (let i = 0; i < 3; i++) { await press(" "); await sleep(250); }
await waitFor("Gacha.phase === 'inspect'", 20000); await sleep(1200);
check("W25 result card: focus on Pull again", await inside("#gacha-inspect"), await focusId());
await press("Escape"); await sleep(900);
check("W26 Esc closes the gacha", (await openSheets()) === "" && (await ctxKey()).startsWith("v:view-home"), await ctxKey());
await home();

/* 捕捉：Space ×3 → Enter Continue */
const cap = await ev("if (!CaptureScene.isSupported()) return 'nowebgl'; App.showView('view-capture'); window.__capDone = null; CaptureScene.play({ dexId: 25, name: 'Pikachu', onCaught: () => ({ isDupe: true, dexId: 25, name: 'Pikachu' }) }).then(r => { window.__capDone = r; }); return 'ok'");
if (cap === "ok") {
  await waitFor("CaptureScene.state === 'idle'", 30000);
  await press(" "); await press(" "); await press(" ");
  check("W27 capture: Space ×3 throws", (await ev("return CaptureScene.state")) !== "idle", await ev("return CaptureScene.state"));
  const shown = await waitFor("CaptureScene.resultEl.classList.contains('show')", 120000);
  await press("Enter"); await sleep(300);
  check("W28 capture: Enter on result continues", await ev("return !!window.__capDone"), { shown, state: await ev("return CaptureScene.state") });
} else rows.push("SKIP  W27/W28 capture (no WebGL)");
await home();

}
/* 戰鬥：F → 招式 1 可用；Esc 返主選單；Y／N 唔會出錯（重新開機，免得前面流程殘留） */
await boot(1280, 800); await press("ArrowDown"); await press("Enter"); await sleep(1200);
await ev("if(location.hostname!=='localhost') throw 1; const st=loadState(); Energy.status(st); st.energy.points=50; saveState(st); return 1");
/* 打 AI 唔再開揀隊頁，用背包 My Team（spec 20261108-trainer-level §5）：My Team 空就填返健康嘅頭 6 隻 */
await ev("const st=loadState(); if(!(st.myTeam||[]).length){ st.myTeam=st.entries.filter(e=>Array.isArray(e.ownedSpecies)&&e.ownedSpecies.length&&!(window.Pet&&Pet.isFaint(e))).slice(0,6).map(e=>e.uid); saveState({now:true}); } return 1");
await ev("BattleUI.openMenu(); return 1"); await sleep(900);
await ev("document.querySelector('.ai-trainer-card').click(); return 1"); await sleep(600);
await ev("document.querySelector('.tier-card:not([disabled])').click(); return 1"); await sleep(1500);
/* 揀隊：開咗局就停；尾段 confirm 只喺揀隊窗仲開住先撳（之前無條件再撳 → 開多一場戰鬥，背景 intro 嘅 waitTap 會截走 FIGHT 嘅 click） */
await ev("const c=document.getElementById('team-select-confirm'), m=document.getElementById('team-select-modal'); const open=()=>m.style.display!=='none'; for(const s of document.querySelectorAll('.team-slot')){ c.click(); if(!open()) break; s.click(); } if (open()) c.click(); return 1"); await sleep(1800);
await ev("document.querySelector('.bag-rotate.show .bag-rot-btn')?.click(); return 1");
/* 開場對話：淨用 Enter 推進（之前只可以撳畫面，鍵盤會卡死） */
for (let i = 0; i < 12; i++) {
  if (await ev("return getComputedStyle(document.getElementById('battle-action-menu')).display !== 'none' && document.getElementById('btn-battle-fight').getBoundingClientRect().width > 0")) break;
  await sleep(1500); await ev("document.activeElement && document.activeElement.blur && document.activeElement !== document.body && document.activeElement.blur(); return 1"); await press("Enter");
}
const inBattle = await waitFor("document.querySelector('#view-battle.active') && getComputedStyle(document.getElementById('battle-action-menu')).display !== 'none' && document.getElementById('btn-battle-fight').getBoundingClientRect().width > 0", 60000);
if (!inBattle) rows.push("      battle diag: " + JSON.stringify(await ev("return { views: [...document.querySelectorAll('.view.active')].map(v=>v.id), team: !!document.querySelector('#team-select-modal'), teamDisp: (document.getElementById('team-select-modal')||{}).style?.display, menu: (document.getElementById('battle-action-menu')||{}).style?.display, ai: !!document.querySelector('.ai-trainer-card'), modal: !!document.querySelector('#modal-root .modal-backdrop'), text: (document.getElementById('battle-text')||{}).textContent }")));
if (inBattle) {
  await sleep(800);
  const bstate = () => ev("const d=id=>{const e=document.getElementById(id); return e ? getComputedStyle(e).display : 'none'}; return { act: d('battle-action-menu'), mv: d('battle-move-menu'), yn: d('battle-yesno'), fightW: Math.round(document.getElementById('btn-battle-fight').getBoundingClientRect().width), focus: document.activeElement.id || document.activeElement.className, ctx: Keys.context().key, text: (document.getElementById('battle-text')||{}).textContent }");
  const before = await bstate();
  await press("f"); await sleep(600);
  if (!(await ev("return getComputedStyle(document.getElementById('battle-move-menu')).display !== 'none'"))) {
    rows.push("      B1 before 'f': " + JSON.stringify(before) + "  after: " + JSON.stringify(await bstate()));
  }
  check("B1 'f' opens the move menu", await ev("return getComputedStyle(document.getElementById('battle-move-menu')).display !== 'none'"));
  const moveOpen = await ev("return getComputedStyle(document.getElementById('battle-move-menu')).display !== 'none'");
  await press("Escape"); await sleep(600);
  check("B2 Esc goes back to the main battle menu (still in battle)", moveOpen && (await ev("return getComputedStyle(document.getElementById('battle-move-menu')).display === 'none'")) && /view-battle/.test(await views()), await views());
  await press("f"); await sleep(600);
  await press("1"); await sleep(1200);
  check("B3 '1' uses move 1 (turn starts)", await ev("return getComputedStyle(document.getElementById('battle-move-menu')).display === 'none'"));
  await press("Escape"); await sleep(300);
  check("B4 Esc never leaves the battle", /view-battle/.test(await views()), await views());
} else rows.push("SKIP  B1–B4 battle (could not start AI battle)");

/* ================= phone 440×956 ================= */
if (ONLY !== "battle") {
await boot(440, 956);
await press("ArrowDown"); await press("Enter"); await sleep(1200);
await ev("document.getElementById('btn-bd-setting').focus(); return 1");
await press("Enter"); await sleep(800);
check("P1 phone: Settings sheet is the context", (await ctxKey()) === "s:sheet-setting", await ctxKey());
let stayed = 0;
for (let i = 0; i < 25; i++) { await press("Tab"); if (await inside("#sheet-setting")) stayed++; }
check("P2 phone: Tab ×25 stays in the sheet", stayed === 25, stayed);
await press("Escape"); await sleep(800);
check("P3 phone: Esc closes, focus back on Settings", (await focusId()) === "btn-bd-setting", await focusId());
check("P4 Settings sheet no longer aria-hidden when open", await ev("document.getElementById('btn-bd-setting').click(); await new Promise(r=>setTimeout(r,700)); const s=document.getElementById('sheet-setting'); return !s.hidden && s.getAttribute('aria-hidden') !== 'true'"));

}
console.log(rows.join("\n"));
console.log(`\n${pass} pass / ${fail} fail; page errors: ${JSON.stringify(errs)}`);
ws.close(); chrome.kill(); process.exit(fail ? 1 : 0);
