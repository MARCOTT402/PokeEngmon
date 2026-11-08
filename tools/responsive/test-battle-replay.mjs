// 戰鬥重播測試（總計劃 P2.5 拆 battle.js 嘅安全網；Rule 117）：固定 seed 自動打 AI 戰，逐句記錄對白＋雙方 HP 框＋結果，
// 同 tests/fixtures/battle-replay.json 逐格比對。戰鬥代碼（js/battle/battle.js、js/battle/ui/*.js）call 嘅 Math.random
// 換成 mulberry32 固定數列（call stack 有戰鬥代碼就算，例如 natureFor → randomNature）；非同步嘅動畫／粒子照用真隨機。
// 自動玩法：招式按回合輪流揀有 PP 嘅、換隻揀第一隻仲打得嘅（行 battle.js 後備 #battle-party，唔經 BagUI）、Yes/No 一律答 No、對白打完就撳。
// 前置：本地 server http://localhost:8080（.claude/launch.json static）；headless Chrome + CDP。
// 用法：node tools/responsive/test-battle-replay.mjs [outDir]          比對
//       node tools/responsive/test-battle-replay.mjs [outDir] --update 重錄基準（只可以喺未改戰鬥邏輯嘅版本錄）
import { spawn } from "node:child_process";
import { writeFileSync, readFileSync, mkdirSync, existsSync } from "node:fs";
import { tmpdir } from "node:os"; import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const FIXTURE = join(ROOT, "tests/fixtures/battle-replay.json");
const UPDATE = process.argv.includes("--update");
const OUT = process.argv[2] && !process.argv[2].startsWith("--") ? process.argv[2] : join(tmpdir(), "pe-replay");
mkdirSync(OUT, { recursive: true });
/* server 冇開就即刻停（否則 headless 會載到錯誤頁，扮成 timeout） */
try { const r = await fetch("http://localhost:8080/_seedtest.html", { signal: AbortSignal.timeout(3000) }); if (!r.ok) throw new Error("HTTP " + r.status); }
catch (e) { console.log("FAIL local server http://localhost:8080 not reachable (" + e.message + ")"); process.exit(1); }
const sleep = ms => new Promise(r => setTimeout(r, ms));
const PORT = 9271;
/* 3 個場景：唔同 seed＋訓練員＋難度（覆蓋多隻換隻、異常狀態、Hard AI、Inferno 等級同步） */
const SCENARIOS = [
  { seed: 1, trainer: "bugcatcher", tier: "normal" },
  { seed: 2, trainer: "hiker", tier: "hard" },
  { seed: 3, trainer: "lass", tier: "inferno" },
].filter((sc) => !process.env.REPLAY_SEEDS || process.env.REPLAY_SEEDS.split(",").map(Number).includes(sc.seed));
const SEEDS = SCENARIOS.map((sc) => sc.seed);
const chrome = spawn("C:/Program Files/Google/Chrome/Application/chrome.exe",
  ["--headless=new", "--disable-gpu", "--mute-audio", "--hide-scrollbars", `--remote-debugging-port=${PORT}`, `--user-data-dir=${join(tmpdir(), "pe-replay-" + Date.now())}`, "about:blank"], { stdio: "ignore" });
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
        if (m.method === "Runtime.exceptionThrown") errs.push((m.params.exceptionDetails.exception?.description || "").slice(0, 200));
      };
      break;
    }
  } catch {}
  await sleep(300);
}
await send("Runtime.enable"); await send("Page.enable");
await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });

/* 戰鬥代碼專用固定隨機數：睇 call stack 第一個 caller 係咪 js/battle/battle.js 或 js/battle/ui/ */
const rngScript = (seed) => `(() => {
  let s = ${seed} >>> 0; const real = Math.random.bind(Math);
  const next = () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  window.__replayRngCalls = 0;
  /* 撳難度之前重新播種：之前畫面 render 次數（受載入快慢影響）用咗幾多個隨機數都唔再影響結果 */
  window.__replayReseed = () => { s = ${seed} >>> 0; window.__replayRngCalls = 0; };
  Math.random = function () {
    /* 只要 call stack 入面有戰鬥代碼（例如 natureFor → pokemon.js randomNature）就用固定數列 */
    const lim = Error.stackTraceLimit; Error.stackTraceLimit = 60; const stack = new Error().stack || ""; Error.stackTraceLimit = lim;
    const frames = stack.split("\\n").slice(2).join("\\n");
    if (/\\/js\\/battle\\/(battle\\.js|ui\\/)/.test(frames)) { window.__replayRngCalls++; return next(); }
    return real();
  };
})();`;

/* 自動玩家：每 30ms 睇一次畫面，做一個動作；對白打完（出咗 caret）先記錄＋撳 */
const DRIVER = `
  window.__rec = window.__init ? [{ init: window.__init }] : []; window.__done = false; window.__turn = 0; let partyPtr = 0;
  /* REPLAY_TRACE：記錄邊個 call BattleRng.next（查非決定性用） */
  window.__rngTrace = [];
  if (window.__traceRng && typeof BattleRng !== "undefined") { const n0 = BattleRng.next; BattleRng.next = function () { window.__rngTrace.push(((new Error().stack || "").split("\\n").slice(2, 4).map(l => l.trim().replace(/https?:\\/\\/[^/]+\\//, "").replace(/\\?v=[^:]+/, "")).join(" < "))); return n0(); }; }
  /* 換隻改行 battle.js 自己嘅 #battle-party 後備介面（BagUI 嘅拖拉介面難自動操作；戰鬥邏輯一樣） */
  if (typeof BagUI !== "undefined") BagUI.openBattle = undefined;
  const q = s => document.querySelector(s);
  const shown = el => el && getComputedStyle(el).display !== "none" && getComputedStyle(el).visibility !== "hidden";
  const hp = () => [...document.querySelectorAll(".battle-hpbox")].map(b => b.innerText.replace(/\\s+/g, " ").trim());
  window.__drv = setInterval(() => {
    if (window.__done) return;
    const res = q("#battle-result");
    if (shown(res)) { window.__rec.push({ result: res.innerText.replace(/\\s+/g, " ").trim() }); window.__done = true; clearInterval(window.__drv); return; }
    const party = q("#battle-party");
    if (shown(party)) {
      if (shown(q("#party-options"))) { q("#party-opt-send").click(); partyPtr = 0; return; }
      const slots = [...document.querySelectorAll(".party-slot")];
      if (slots.length) { slots[partyPtr % slots.length].click(); partyPtr++; }
      return;
    }
    partyPtr = 0;
    const yn = q("#battle-yesno");
    if (shown(yn)) { if (!q("#battle-caret")) return; /* 等問題打完字先記錄同答 */ window.__rec.push({ ask: q("#battle-text").textContent, answer: "NO" }); yn.querySelector('[data-yn="0"]').click(); return; }
    if (shown(q("#battle-move-menu"))) {
      const en = [...document.querySelectorAll(".bmp-move-btn")].filter(x => !x.disabled);
      const b = en.length ? en[(window.__turn++) % en.length] : null;
      if (b) { window.__rec.push({ move: b.textContent }); b.click(); }
      return;
    }
    if (shown(q("#battle-action-menu")) && q(".battle-bottom").classList.contains("menu-open")) { q("#btn-battle-fight").click(); return; }
    /* 對白打完出 caret：記錄一次；之後只要 caret 仲喺度就一直撳（開場會先出 caret、等 650ms 先開始 waitTap，太早撳會被食咗） */
    const caret = q("#battle-caret");
    if (caret) {
      if (!caret.dataset.rec) { caret.dataset.rec = "1"; window.__rec.push({ say: q("#battle-text").textContent, hp: hp() }); }
      q(".battle-bottom").click();
    }
  }, 30);
`;

async function runSeed(seed) {
  const sc = SCENARIOS.find((x) => x.seed === seed);
  const { identifier } = await send("Page.addScriptToEvaluateOnNewDocument", { source: rngScript(seed) });
  await send("Page.navigate", { url: "http://localhost:8080/_seedtest.html" }); await sleep(3800);
  await ev("document.getElementById('btn-entry-yes')?.click()"); await sleep(1300);
  await ev("document.querySelectorAll('.modal-backdrop').forEach(m=>m.style.display='none')");
  await ev("if(location.hostname!=='localhost') throw 1; const st=loadState(); Energy.status(st); st.energy.points=50; saveState(st); localStorage.setItem('pokeengmon_battle_speed','2');");
  /* 解鎖全部訓練員同 Hard／Inferno（本地測試存檔） */
  await ev("const st=loadState(); st.trainerProgress={}; for (const c of ['youngster','bugcatcher','lass','hiker','gentleman','swimmer','ace','jasmine','psychic','cynthia','alder','drake','anabel','red']) st.trainerProgress[c]={easy:1,normal:1,hard:1,inferno:0,flawless:[]}; saveState(st);");
  /* 等寶可夢／招式資料載完（冷啟動會慢；未載完嘅話傷害、AI 評分會唔同） */
  for (let i = 0; i < 60 && !(await ev("return typeof POKEMON_DEX !== 'undefined' && !!POKEMON_DEX && typeof moveInfo === 'function' && moveInfo('tackle').power != null")); i++) await sleep(250);
  /* 打 AI 唔再開揀隊頁（spec 20261108-trainer-level §5），改用 My Team 頭 N 隻。舊揀隊頁 My Team 空嗰陣係揀「排序後頭 N 隻」：
     My Team 空就照呢個次序填返，令開戰隊伍同舊 fixture 一樣，重播先比較得到戰鬥邏輯 */
  await ev("const st=loadState(); if(!(st.myTeam||[]).length){ const pool=st.entries.filter(e=>Array.isArray(e.ownedSpecies)&&e.ownedSpecies.length&&!(window.Pet&&Pet.isFaint(e))); const p=DEXSORT.load(BattleUI._.TEAM_SORT_KEY); DEXSORT.sortList(pool,p.sort,p.dir,e=>{const c=entryCurrentSpecies(e); return {dexId:c[0], level:e.level||1};}); st.myTeam=pool.slice(0,6).map(e=>e.uid); saveState({now:true}); }");
  await ev("BattleUI.openMenu()"); await sleep(900);
  await ev(`document.querySelector('.ai-trainer-card[data-id="${sc.trainer}"]').click()`); await sleep(600);
  /* 撳 tier 即刻開戰（唔再經揀隊頁），所以記錄鈎要喺撳 tier 之前裝 */
  /* 開戰一刻記錄雙方隊伍（等級、能力值、特性、道具、招式），做第一條記錄 */
  await ev(`window.__init = null; const c0 = BattleState.create; BattleState.create = function (...a) { const st = c0.apply(this, a);
    const pick = (p) => ({ name: p.name, level: p.level, hp: p.hp, maxHp: p.maxHp, stats: p.stats, ability: p.ability || null, held: p.held || null, status: p.status || null, moves: (p.moves || []).map(m => m.slug) });
    window.__init = { p1: st.p1.team.map(pick), p2: st.p2.team.map(pick) }; return st; };`);
  await ev(`window.__replayReseed(); document.querySelector('.tier-card[data-tier="${sc.tier}"]').click()`); await sleep(1500);
  await ev("const c=document.getElementById('team-select-confirm'), m=document.getElementById('team-select-modal'); const open=()=>m.style.display!=='none'; for(const s of document.querySelectorAll('.team-slot')){ c.click(); if(!open()) break; s.click(); } if (open()) c.click();");
  await sleep(300);
  if (process.env.REPLAY_DEBUG) console.log("after team:", await ev("return JSON.stringify({ path: location.pathname, title: document.title, ready: document.readyState, bodyLen: document.body?.innerHTML.length, hasApp: typeof App, hasBattle: typeof BattleUI, views: [...document.querySelectorAll('.view')].filter(v=>getComputedStyle(v).display!=='none').map(v=>v.id), text: document.getElementById('battle-text')?.textContent, team: document.getElementById('team-select-modal')?.style.display, cards: document.querySelectorAll('.ai-trainer-card').length, tiers: document.querySelectorAll('.tier-card').length, rng: window.__replayRngCalls })"));
  if (process.env.REPLAY_TRACE) await ev("window.__traceRng = true");
  const dr = await ev(DRIVER); if (dr) console.log("driver:", dr);
  if (process.env.REPLAY_DEBUG) console.log("errs so far:", JSON.stringify(errs));
  const t0 = Date.now();
  while (Date.now() - t0 < (process.env.REPLAY_DEBUG ? 15000 : 300000)) { if (await ev("return window.__done")) break; await sleep(500); }
  const out = await ev("return { done: window.__done, rngCalls: window.__replayRngCalls, rec: window.__rec }");
  if (process.env.REPLAY_TRACE) writeFileSync(join(OUT, `rng-trace-${seed}-${Date.now()}.json`), JSON.stringify(await ev("return window.__rngTrace"), null, 0));
  await send("Page.removeScriptToEvaluateOnNewDocument", { identifier });
  return out;
}

const got = {};
for (const seed of SEEDS) {
  const t = Date.now();
  got[seed] = await runSeed(seed);
  console.log(`seed ${seed} (${SCENARIOS.find((x) => x.seed === seed).trainer}/${SCENARIOS.find((x) => x.seed === seed).tier}): ${got[seed].done ? "finished" : "TIMEOUT"} — ${got[seed].rec.length} records, ${got[seed].rngCalls} rng calls, ${Math.round((Date.now() - t) / 1000)}s`);
}
writeFileSync(join(OUT, "battle-replay.got.json"), JSON.stringify(got, null, 1));
let fail = 0;
if (errs.length) { console.log("page errors:", JSON.stringify(errs)); fail++; }
for (const seed of SEEDS) if (!got[seed].done) { console.log(`FAIL seed ${seed} did not finish`); fail++; }
if (UPDATE) {
  if (fail) { console.log("NOT updating fixture (failures above)"); }
  else { writeFileSync(FIXTURE, JSON.stringify(got, null, 1) + "\n"); console.log("wrote", FIXTURE); }
} else if (!existsSync(FIXTURE)) { console.log("FAIL no fixture; run with --update on the pre-change code"); fail++; }
else {
  const want = JSON.parse(readFileSync(FIXTURE, "utf8"));
  for (const seed of SEEDS) {
    const a = want[seed].rec, b = got[seed].rec;
    const n = Math.max(a.length, b.length);
    let i = 0; while (i < n && JSON.stringify(a[i]) === JSON.stringify(b[i])) i++;
    const sameRng = want[seed].rngCalls === got[seed].rngCalls;
    if (i === n && sameRng) console.log(`PASS seed ${seed}: ${n} records identical, rng calls ${got[seed].rngCalls}`);
    else { fail++; console.log(`FAIL seed ${seed}: first diff at record ${i}/${n}; rng ${want[seed].rngCalls}→${got[seed].rngCalls}\n  want ${JSON.stringify(a[i])}\n  got  ${JSON.stringify(b[i])}`); }
  }
}
console.log(`\n${fail ? "FAIL" : "OK"}  (got: ${join(OUT, "battle-replay.got.json")})`);
chrome.kill(); process.exit(fail ? 1 : 0);
