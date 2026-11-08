/* ============================================================
   Incubator prototype v4（植入真 app；由 build.mjs 插入 tools/prototype/incubator-app.html；唔部署）
   方案：.trae/specs/20261107-gacha-redesign.md §10「孵化器 v4」
   規則：
   - Lucky Draw「Claim an egg」💎3；孵化器機率 Common 30%／Rare 40%／Epic 20%／Legendary 10%
   - 題數由稀有度決定：Common 30／Rare 80／Epic 140／Legendary 200（Claim 時數字拉霸揭曉 = 抽獎時刻；孵化先揭係邊隻）
   - 2 個 slot：Slot 1 永遠開；Slot 2 連續答題 17 日解鎖；streak 斷咗而入面有蛋 → 封住（進度唔跌），重新連續答題 3 日就解封
     （未用過 Slot 2：第一次解鎖要連續 7 日；之後 streak 斷咗再解只要 3 日）
   - 1 條答啱嘅題同時計落所有開住、未滿嘅蛋；只計內置題庫（家長 CSV／App 內自訂題 customQuestions 唔計）
   - 答題中唔顯示任何嘢；結算頁夠數先彈孵蛋小視窗（多隻就逐隻）→ 真 #gacha-inspect 結果卡
   - 可以丟棄蛋（確認窗，進度清零、唔退石；Slot 2 streak 未到 17 日會鎖返）
   入口：首頁 Battle 捲頁「Incubator」、Lucky Draw display window「Claim an egg」行
   ============================================================ */
(function () {
  "use strict";
  if (!window.App || !window.__INCUBATOR_PROTO__) return;

  /* ---------------- 規則 ---------------- */
  const LS_KEY = "pe_incubator_proto_v4", LS_STREAK = "pe_incubator_proto_streak", LS_S2 = "pe_incubator_proto_s2";
  const INCU_ODDS = [["normal", .30], ["rare", .40], ["epic", .20], ["legend", .10]];
  const NEED = { normal: 30, rare: 80, epic: 140, legend: 200 };
  const CLAIM_COST = (window.GAME_CONFIG && GAME_CONFIG.RARE_PULL_COST) || 3;
  const STREAK_SLOT2_FIRST = 7, STREAK_SLOT2 = 3, STREAK_THAW = 3;   /* 第一次 7 日；之後再解 = 解凍 = 3 日 */
  const TIER = { normal: "plain", rare: "great", epic: "ultra", legend: "master" };
  const TIER_COL = { plain: "#c9a26b", great: "#4aa8ff", ultra: "#ffc93c", master: "#c77dff" };
  const RAR_NAME = { normal: "COMMON", rare: "RARE", epic: "EPIC", legend: "LEGENDARY" };
  const EGG_NAME = { normal: "PLAIN EGG", rare: "SPOTTED EGG", epic: "GOLDEN EGG", legend: "RAINBOW EGG" };
  const HATCH_LV = { normal: 0, rare: 2, epic: 3, legend: 4 };   /* 孵蛋演出級別 */
  const STAGES = [
    { icon: "😴", name: "Sleeping", say: "Zzz… it's fast asleep." },
    { icon: "🌡️", name: "Warming up", say: "It feels a little warm." },
    { icon: "🔥", name: "Getting hot", say: "Something moved inside!" },
    { icon: "💥", name: "Cracking!", say: "It's about to hatch!!" },
    { icon: "🐣", name: "Ready!", say: "Tap HATCH NOW!" }
  ];
  const stageOf = (p, n) => { const r = p / n; return r >= 1 ? 4 : r >= .75 ? 3 : r >= .5 ? 2 : r >= .25 ? 1 : 0; };
  const pickW = pairs => { let r = Math.random(); for (const [v, p] of pairs) { if (r < p) return v; r -= p; } return pairs[pairs.length - 1][0]; };
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const $ = id => document.getElementById(id);

  /* ---------------- 狀態 ---------------- */
  let eggs = [null, null], sel = 0;
  try { const s = JSON.parse(localStorage.getItem(LS_KEY) || "null"); if (s && Array.isArray(s.eggs)) eggs = s.eggs; } catch (e) { /* ignore */ }
  const save = () => { try { localStorage.setItem(LS_KEY, JSON.stringify({ eggs })); } catch (e) { /* ignore */ } };
  function streak() {
    const o = localStorage.getItem(LS_STREAK);
    if (o != null && o !== "") return +o;                      /* prototype 控制面板可以覆寫 */
    try { return calcStreak(); } catch (e) { return 0; }
  }
  /* slot 狀態：open／locked（未解鎖、冇蛋）／frozen（streak 斷咗、入面有蛋）
     Slot 2：streak ≥ 17 開；有蛋時 streak 斷咗就凍結，重新連續 3 日解凍；冇蛋而 streak < 17 就鎖返 */
  function slotState(i) {
    if (i === 0) return "open";
    if (syncSlot2()) return "open";
    if (eggs[1]) return streak() >= STREAK_THAW ? "open" : "frozen";
    return "locked";
  }
  /* Slot 2 解鎖狀態（要記住）：{ ever: 曾經解鎖過, on: 而家解鎖緊, last: 上次見到嘅 streak }
     - 未解鎖：streak ≥ 門檻（第一次 7 日、之後 3 日）→ 解鎖
     - 解鎖緊：streak 冇斷就一直開；streak 變細 = 斷咗 → 取消解鎖（有蛋就凍結，3 日解凍） */
  let s2 = { ever: false, on: false, last: 0 };
  try { const v = JSON.parse(localStorage.getItem(LS_S2) || "null"); if (v) s2 = v; } catch (e) { /* ignore */ }
  function slot2Need() { return s2.ever ? STREAK_SLOT2 : STREAK_SLOT2_FIRST; }
  function syncSlot2() {
    const s = streak(), before = JSON.stringify(s2);
    if (s2.on && s < s2.last) s2.on = false;
    if (!s2.on && s >= slot2Need()) { s2.on = true; s2.ever = true; }
    s2.last = s;
    if (JSON.stringify(s2) !== before) try { localStorage.setItem(LS_S2, JSON.stringify(s2)); } catch (e) { /* ignore */ }
    return s2.on;
  }
  const freeSlot = () => [0, 1].find(i => !eggs[i] && slotState(i) === "open");
  const isReady = e => e && e.progress >= e.need;
  function makeEgg(rarity) { return { rarity, need: NEED[rarity], progress: 0, seen: 0, fresh: true }; }

  /* ---------------- 蛋圖（一幅 SVG，可切三塊殼） ---------------- */
  const EGG_D = "M0 -60 C30 -60 48 -12 48 16 C48 45 27 62 0 62 C-27 62 -48 45 -48 16 C-48 -12 -30 -60 0 -60Z";
  function eggArt(type) {
    let fill = "#f6efd8", deco = "";
    if (type === "plain") { fill = "#f1e6cf"; deco = '<g fill="#b48a5a" opacity=".55"><circle cx="-20" cy="-30" r="2.5"/><circle cx="14" cy="-40" r="2"/><circle cx="22" cy="-6" r="3"/><circle cx="-26" cy="10" r="2"/><circle cx="-8" cy="30" r="2.5"/><circle cx="20" cy="34" r="2"/><circle cx="2" cy="-14" r="1.6"/></g>'; }
    if (type === "great") deco = '<g fill="#62c06c"><ellipse cx="-22" cy="-26" rx="11" ry="9"/><ellipse cx="18" cy="-8" rx="14" ry="11"/><ellipse cx="-16" cy="24" rx="13" ry="10"/><ellipse cx="26" cy="36" rx="8" ry="6"/><ellipse cx="4" cy="-48" rx="7" ry="5"/><ellipse cx="-40" cy="2" rx="6" ry="8"/></g>';
    if (type === "ultra") { fill = "url(#incu-egold)"; deco = '<path d="M-60 -6 L-44 -16 L-30 -6 L-16 -16 L-2 -6 L12 -16 L26 -6 L40 -16 L56 -6 L56 4 L40 -6 L26 4 L12 -6 L-2 4 L-16 -6 L-30 4 L-44 -6 L-60 4Z" fill="#d99a1c"/><g fill="#fff8da"><circle cx="-20" cy="-36" r="3"/><circle cx="14" cy="-44" r="2"/><circle cx="22" cy="24" r="3"/><circle cx="-18" cy="34" r="2.5"/></g>'; }
    if (type === "master") { fill = "url(#incu-eprism)"; deco = '<g fill="#fff"><path d="M-18 -30 l3 8 8 3 -8 3 -3 8 -3 -8 -8 -3 8 -3z"/><path d="M20 18 l2.5 6 6 2.5 -6 2.5 -2.5 6 -2.5 -6 -6 -2.5 6 -2.5z"/><path d="M14 -40 l1.5 4 4 1.5 -4 1.5 -1.5 4 -1.5 -4 -4 -1.5 4 -1.5z"/></g>'; }
    return `<path d="${EGG_D}" fill="${fill}"/><g clip-path="url(#incu-eggclip)">${deco}</g>
      <path d="${EGG_D}" fill="url(#incu-shade)"/><path d="${EGG_D}" fill="none" stroke="#3b3326" stroke-width="3"/>
      <g fill="none" stroke="var(--rc)" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" filter="url(#incu-crkglow)">
        <path class="crk c1" d="M-4 -60 L2 -46 L-8 -36 L0 -26"/>
        <path class="crk c2" d="M-52 6 L-36 -2 L-24 8 L-12 -2"/>
        <path class="crk c3" d="M-12 -2 L0 8 L12 -4 L24 6 L36 -4 L52 4"/>
        <path class="crk c4" d="M22 -42 L30 -30 L22 -20 M-30 30 L-20 40 L-28 50"/>
      </g>`;
  }
  const eggSVG = t => `<svg viewBox="-52 -64 104 128" aria-hidden="true">${eggArt(t)}</svg>`;
  const showCracks = (root, n) => { for (let i = 1; i <= 4; i++) root.querySelectorAll(".c" + i).forEach(el => { el.style.opacity = i <= n ? 1 : 0; }); };
  const DEFS = `<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>
    <radialGradient id="incu-shade" cx="34%" cy="26%" r="80%"><stop offset="0" stop-color="#fff" stop-opacity=".6"/><stop offset=".35" stop-color="#fff" stop-opacity="0"/><stop offset=".8" stop-color="#000" stop-opacity=".18"/><stop offset="1" stop-color="#000" stop-opacity=".45"/></radialGradient>
    <filter id="incu-crkglow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="2.2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    <clipPath id="incu-eggclip"><path d="${EGG_D}"/></clipPath>
    <linearGradient id="incu-egold" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff6d6"/><stop offset=".5" stop-color="#ffe08a"/><stop offset="1" stop-color="#e9b43c"/></linearGradient>
    <linearGradient id="incu-eprism" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffb3e6"/><stop offset=".25" stop-color="#b3e0ff"/><stop offset=".5" stop-color="#d9ffb3"/><stop offset=".75" stop-color="#fff2b3"/><stop offset="1" stop-color="#e0b3ff"/></linearGradient>
  </defs></svg>`;

  /* ---------------- 音效 ---------------- */
  const Snd = {
    ctx: null, out: null, nb: null,
    init() {
      if (this.ctx) { if (this.ctx.state === "suspended") this.ctx.resume(); return; }
      const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
      const c = this.ctx = new AC(); this.out = c.createGain(); this.out.gain.value = .55; this.out.connect(c.destination);
      const n = c.sampleRate * 2; this.nb = c.createBuffer(1, n, c.sampleRate); const d = this.nb.getChannelData(0); for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    },
    tone({ f = 440, to = null, t = 0, d = .3, type = "sine", g = .2, a = .006 }) {
      if (!this.ctx) return; const c = this.ctx, t0 = c.currentTime + t, o = c.createOscillator(), v = c.createGain();
      o.type = type; o.frequency.setValueAtTime(f, t0); if (to) o.frequency.exponentialRampToValueAtTime(to, t0 + d);
      v.gain.setValueAtTime(.0001, t0); v.gain.exponentialRampToValueAtTime(g, t0 + a); v.gain.exponentialRampToValueAtTime(.0001, t0 + d);
      o.connect(v); v.connect(this.out); o.start(t0); o.stop(t0 + d + .05);
    },
    noise({ t = 0, d = .3, g = .2, ft = "lowpass", f = 1000, fto = null, q = 1, swell = false }) {
      if (!this.ctx) return; const c = this.ctx, t0 = c.currentTime + t, s = c.createBufferSource(), fl = c.createBiquadFilter(), v = c.createGain();
      s.buffer = this.nb; s.loop = true; fl.type = ft; fl.Q.value = q; fl.frequency.setValueAtTime(f, t0); if (fto) fl.frequency.exponentialRampToValueAtTime(fto, t0 + d);
      v.gain.setValueAtTime(.0001, t0);
      if (swell) { v.gain.exponentialRampToValueAtTime(g, t0 + d * .95); v.gain.linearRampToValueAtTime(.0001, t0 + d); }
      else { v.gain.exponentialRampToValueAtTime(g, t0 + .005); v.gain.exponentialRampToValueAtTime(.0001, t0 + d); }
      s.connect(fl); fl.connect(v); v.connect(this.out); s.start(t0); s.stop(t0 + d + .05);
    },
    tick(i) { this.tone({ f: 660 * Math.pow(1.045, Math.min(i, 30)), d: .09, type: "triangle", g: .12 }); },
    crack(i) { const f = 1100 * Math.pow(1.26, i); this.tone({ f, d: .2, type: "triangle", g: .2 }); this.noise({ d: .035, g: .22, ft: "highpass", f: 3500 }); },
    wobble() { this.noise({ d: .12, g: .12, ft: "bandpass", f: 900, fto: 400, q: 2 }); },
    chime() { [784, 988, 1175, 1568].forEach((f, i) => this.tone({ f, t: i * .07, d: .5, type: "triangle", g: .1 })); },
    ice() { [1568, 2093, 2637].forEach((f, i) => this.tone({ f, t: i * .06, d: .35, type: "sine", g: .06 })); },
    heartbeat() { this.tone({ f: 70, to: 42, d: .16, g: .5 }); this.tone({ t: .22, f: 66, to: 40, d: .2, g: .4 }); },
    riser(d) { this.noise({ d, g: .28, ft: "bandpass", f: 180, fto: 5200, q: 1.5, swell: true }); this.tone({ f: 110, to: 880, d, type: "sawtooth", g: .04, a: d * .9 }); },
    burst(lv) { this.noise({ d: 1 + lv * .15, g: .4 + lv * .06, f: 7000, fto: 200 }); [1, 1.5, 2, 2.52].forEach(m => this.tone({ f: (lv >= 3 ? 196 : 261.6) * m, d: 1.4, type: "triangle", g: .07, a: .02 })); if (lv >= 2) this.tone({ f: 55, to: 40, d: 1.2, g: .45 }); },
    fanfare(lv) {
      const seq = [[523, 659, 784], [523, 659, 784, 1046], [523, 659, 784, 988, 1046], [523, 587, 659, 784, 988, 1046], [523, 587, 659, 784, 880, 1046, 1318]][lv];
      seq.forEach((f, i) => this.tone({ f, t: i * .085, d: .28, type: "square", g: .05 }));
      const t = seq.length * .085; [523, 659, 784, 1046].forEach(f => this.tone({ f, t, d: .9 + lv * .3, type: "triangle", g: .07, a: .02 }));
    },
    stageUp() { this.tone({ f: 523, to: 1046, d: .3, type: "triangle", g: .14 }); this.chime(); }
  };
  document.addEventListener("pointerdown", () => Snd.init(), { capture: true });

  /* ---------------- 粒子 ---------------- */
  function makeFX(cv) {
    const o = { cv, ps: [], w: 0, h: 0, c: null };
    o.resize = () => { const r = cv.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1); o.w = r.width; o.h = r.height; cv.width = Math.max(1, r.width * dpr); cv.height = Math.max(1, r.height * dpr); o.c = cv.getContext("2d"); o.c.setTransform(dpr, 0, 0, dpr, 0, 0); };
    o.add = p => { if (o.ps.length < 400) o.ps.push(Object.assign({ life: 0, g: 0, drag: .98, size: 3, kind: "spark", rot: 0, vr: 0 }, p)); };
    o.burst = (x, y, n, cols, sp, opt = {}) => { for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, v = sp * (.35 + Math.random());
      o.add({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - (opt.up || 0), g: opt.g ?? .1, max: (opt.life || 50) * (.6 + Math.random() * .7), size: (opt.size || 3) * (.5 + Math.random()), color: cols[i % cols.length], kind: opt.kind || "spark", rot: Math.random() * 6, vr: (Math.random() - .5) * .4, drag: opt.drag ?? .965 }); } };
    o.step = () => {
      const c = o.c; if (!c) return; c.clearRect(0, 0, o.w, o.h);
      for (let i = o.ps.length - 1; i >= 0; i--) {
        const p = o.ps[i]; p.life++; p.vx *= p.drag; p.vy = p.vy * p.drag + p.g; p.x += p.vx; p.y += p.vy; p.rot += p.vr;
        const k = 1 - p.life / p.max; if (k <= 0) { o.ps.splice(i, 1); continue; }
        if (p.kind === "txt") { c.globalCompositeOperation = "source-over"; c.globalAlpha = Math.min(1, k * 1.5); c.fillStyle = p.color; c.font = `900 ${p.size}px system-ui`; c.fillText(p.ch, p.x, p.y); }
        else if (p.kind === "confetti") { c.globalCompositeOperation = "source-over"; c.globalAlpha = Math.min(1, k * 2); c.fillStyle = p.color; c.save(); c.translate(p.x, p.y); c.rotate(p.rot); c.fillRect(-p.size, -p.size * .4, p.size * 2, p.size * .8); c.restore(); }
        else if (p.kind === "star") { c.globalCompositeOperation = "lighter"; c.globalAlpha = k; c.fillStyle = p.color; c.save(); c.translate(p.x, p.y); c.rotate(p.rot); const s = p.size * 1.6; c.beginPath();
          for (let j = 0; j < 8; j++) { const rr = j % 2 ? s * .35 : s, aa = j * Math.PI / 4; c.lineTo(Math.cos(aa) * rr, Math.sin(aa) * rr); } c.closePath(); c.fill(); c.restore(); }
        else { c.globalCompositeOperation = "lighter"; c.globalAlpha = k; const r = p.size * (.4 + k * .6), gr = c.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 2.4);
          gr.addColorStop(0, "#fff"); gr.addColorStop(.3, p.color); gr.addColorStop(1, "rgba(0,0,0,0)"); c.fillStyle = gr; c.beginPath(); c.arc(p.x, p.y, r * 2.4, 0, 7); c.fill(); }
      }
      c.globalAlpha = 1; c.globalCompositeOperation = "source-over";
    };
    return o;
  }

  /* ---------------- DOM 植入 ---------------- */
  let sheet, scene, fxPage, fxPop, loopOn = false, lastSpawn = 0;
  function inject() {
    document.body.insertAdjacentHTML("afterbegin", DEFS);

    /* 1) 首頁 Battle 捲頁 */
    const bag = $("btn-home-bag");
    if (bag) {
      bag.insertAdjacentHTML("afterend", `<button class="ph-sitem" id="btn-home-incubator" type="button">
        <span class="incu-ico" id="incu-sitem-ico"></span>
        <span class="ph-sitem-t">Incubator <small class="ph-sitem-sub" id="incu-sitem-sub"></small></span>
        <span class="ph-s-arrow">›</span></button>`);
      $("btn-home-incubator").onclick = () => { App._closeSheet("sheet-battle"); setTimeout(() => openIncubator(), 240); };
    }

    /* 2) Lucky Draw display window：Claim an egg（💎3） */
    const info = document.querySelector("#view-gacha .gacha-info");
    if (info) {
      info.insertAdjacentHTML("beforeend", `<button class="gacha-incu-row" id="gacha-incu-row" type="button">
        <span class="incu-ico" id="gacha-incu-ico"></span>
        <span class="g"><span id="gacha-incu-t"></span><small id="gacha-incu-s"></small></span>
        <span class="gacha-incu-cost" id="gacha-incu-cost"></span></button>
        <button class="gacha-incu-view" id="gacha-incu-view" type="button">View Incubator ›</button>`);
      $("gacha-incu-row").onclick = claimEgg;
      $("gacha-incu-view").onclick = () => { closeGacha(); setTimeout(() => openIncubator(), 260); };
    }

    /* 3) 孵化器頁 */
    $("sheet-gacha").insertAdjacentHTML("afterend", `<div class="ph-sheet ph-sheet-down" id="sheet-incubator" hidden aria-label="Incubator">
      <div class="ph-sheet-head"><span class="ph-sheet-t"><span>🥚 Incubator</span></span><button class="ph-sheet-x" type="button" aria-label="Close">✕</button></div>
      <section class="incu-view">
        <div class="incu-slots" id="incu-slots"></div>
        <div class="incu-scene" id="incu-scene" data-stage="0">
          <div class="incu-stars" id="incu-stars"></div>
          <div class="incu-rays"></div>
          <div class="incu-ice"></div>
          <canvas class="incu-fx" id="incu-fx"></canvas>
          <div class="incu-chip" id="incu-chip"></div>
          <div class="incu-tier" id="incu-tier"></div>
          <div class="incu-banner" id="incu-banner"></div>
          <div class="incu-stagebox">
            <svg class="incu-ring" id="incu-ring" viewBox="0 0 200 200"></svg>
            <div class="incu-glow"></div>
            <div class="incu-nest-back"></div>
            <div class="incu-egg" id="incu-egg"><div class="leak"></div></div>
            <div class="incu-nest-front"></div>
            <div class="incu-bubble" id="incu-bubble"></div>
          </div>
          <div class="incu-count"><b id="incu-left">0</b><span id="incu-left-t"></span><small id="incu-sub"></small></div>
          <div class="incu-track" id="incu-track"></div>
          <div class="incu-empty" id="incu-empty" hidden></div>
          <div class="incu-need" id="incu-need"><small>THIS EGG NEEDS</small><b id="incu-need-n">?</b><em id="incu-need-r"></em><small>CORRECT ANSWERS</small><p id="incu-need-cap"></p></div>
        </div>
        <div class="incu-bottom">
          <div class="incu-hint" id="incu-hint"></div>
          <button class="btn-big btn-primary" id="incu-go" type="button"></button>
          <button class="incu-discard" id="incu-discard" type="button" hidden>Discard this egg</button>
        </div>
      </section></div>`);
    sheet = $("sheet-incubator"); scene = $("incu-scene");
    sheet.querySelector(".ph-sheet-x").onclick = () => App._closeSheet("sheet-incubator");
    $("incu-go").onclick = onGo;
    $("incu-discard").onclick = askDiscard;
    $("incu-egg").onclick = tapEgg;
    const stars = $("incu-stars");
    for (let i = 0; i < 40; i++) { const s = document.createElement("i"); s.style.left = Math.random() * 100 + "%"; s.style.top = Math.random() * 100 + "%"; s.style.animationDelay = -Math.random() * 3 + "s"; s.style.opacity = .3 + Math.random() * .7; stars.appendChild(s); }
    $("incu-track").innerHTML = `<div class="line"></div><div class="fill" id="incu-track-fill"></div>` +
      STAGES.map((s, i) => `<div class="st" data-i="${i}" style="left:calc(14px + (100% - 28px) * ${i / 4})">${s.icon}<small>${s.name}</small></div>`).join("");
    fxPage = makeFX($("incu-fx"));

    /* 4) 孵蛋小視窗 */
    document.body.insertAdjacentHTML("beforeend", `<div id="incu-hatch" aria-live="polite"><div class="ih-win" id="ih-win">
      <div class="ih-rays"></div><div class="ih-halo"></div>
      <div class="ih-title" id="ih-title"></div>
      <div class="ih-nest-back"></div><div class="ih-egg" id="ih-egg"></div><div class="ih-nest-front"></div>
      <img class="ih-mon" id="ih-mon" alt=""><div class="ih-name" id="ih-name"></div>
      <canvas class="ih-fx" id="ih-fx"></canvas><div class="ih-dim"></div><div class="ih-flash"></div></div></div>`);
    fxPop = makeFX($("ih-fx"));

    /* 5) prototype 控制 */
    document.body.insertAdjacentHTML("beforeend", `<button id="incu-dev-btn" type="button" aria-label="Prototype controls">🧪</button>
      <div id="incu-dev" hidden><h4>🧪 INCUBATOR PROTOTYPE</h4>
        <label>▶ Preview hatch effect</label>
        <div class="row"><button data-hatch="normal">30</button><button data-hatch="rare">80</button><button data-hatch="epic">140</button><button data-hatch="legend">200</button></div>
        <label>Claim an egg (free, forced rarity)</label>
        <div class="row"><button data-claim="normal">Common</button><button data-claim="rare">Rare</button><button data-claim="epic">Epic</button><button data-claim="legend">Legend</button></div>
        <label>Selected slot progress</label>
        <div class="row"><button data-prog="-3">3 to go</button><button data-prog="+10">+10</button><button data-prog="stage">Next stage</button></div>
        <label>Streak (prototype override: <b id="incu-dev-streak"></b>)</label>
        <div class="row"><button data-streak="0">Break</button><button data-streak="2">2</button><button data-streak="3">3</button><button data-streak="7">7</button><button data-streak="12">12</button><button data-streak="17">17</button><button data-streak="">Real</button></div>
        <label>Finish a quiz round (real settlement)</label>
        <div class="row"><button data-round="10">10/10</button><button data-round="7">7/10</button><button data-round="mix">10/10 (4 custom)</button></div>
        <div class="row"><button data-reset="1">Reset prototype save</button></div></div>`);
    $("incu-dev-btn").onclick = () => { $("incu-dev").hidden = !$("incu-dev").hidden; updateDev(); };
    $("incu-dev").addEventListener("click", devClick);

    hookSettlement();
    refreshEntries();
    addEventListener("resize", () => { if (isOpen()) { fxPage.resize(); render(); } });
  }
  const closeGacha = () => { if (App.closeGachaSheet) App.closeGachaSheet(); else App._closeSheet("sheet-gacha"); };
  function updateDev() { const el = $("incu-dev-streak"); if (el) el.textContent = `${streak()} days${localStorage.getItem(LS_STREAK) ? "" : " (real)"}`; }

  /* ---------------- 入口狀態 ---------------- */
  function refreshEntries() {
    const live = [0, 1].map(i => eggs[i] && { e: eggs[i], st: slotState(i) }).filter(Boolean);
    const ready = live.some(x => isReady(x.e));
    const next = live.filter(x => x.st === "open" && !isReady(x.e)).map(x => x.e.need - x.e.progress).sort((a, b) => a - b)[0];
    const icoTier = live.length ? TIER[live[0].e.rarity] : "plain";
    ["incu-sitem-ico", "gacha-incu-ico"].forEach(id => { const el = $(id); if (el) { el.innerHTML = eggSVG(icoTier); el.style.opacity = live.length ? 1 : .45; el.style.setProperty("--rc", TIER_COL[icoTier]); } });
    const sub = $("incu-sitem-sub");
    if (sub) {
      sub.textContent = !live.length ? "empty" : ready ? "READY TO HATCH!" : next != null ? `${live.length} egg${live.length > 1 ? "s" : ""} · next hatch in ${next}` : "❄️ frozen";
      sub.classList.toggle("incu-ready", ready);
    }
    const bd = $("btn-bd-battle"); if (bd) bd.classList.toggle("incu-dot", ready);
    const t = $("gacha-incu-t"), s = $("gacha-incu-s"), c = $("gacha-incu-cost");
    if (t) {
      const free = freeSlot(), gems = loadState().diamonds;
      const used = eggs.filter(Boolean).length, cap = slotState(1) === "open" ? 2 : 1;
      t.textContent = "🥚 Claim an egg into the Incubator";
      s.textContent = free == null ? `Incubator full (${used}/${cap})` : `30–200 answers · ★ Legendary 10% · ${used}/${cap} slots used`;
      c.innerHTML = `💎×${CLAIM_COST}`;
      $("gacha-incu-row").classList.toggle("disabled", free == null || gems < CLAIM_COST);
    }
  }

  /* ---------------- Claim（Lucky Draw，💎3） ---------------- */
  function claimEgg() {
    const free = freeSlot();
    if (free == null) { App.toast(slotState(1) === "open" ? "🥚 Incubator is full — hatch an egg first." : `🥚 Incubator is full. Slot 2 unlocks at a ${slot2Need()}-day streak.`); return; }
    const st = loadState();
    if (st.diamonds < CLAIM_COST) { App.toast(`Need 💎${CLAIM_COST} — answer quizzes to earn more!`); return; }
    st.diamonds -= CLAIM_COST; saveState();
    const top = $("topbar-diamonds"); if (top) top.textContent = st.diamonds;
    eggs[free] = makeEgg(pickW(INCU_ODDS)); save(); refreshEntries();
    closeGacha();
    setTimeout(() => openIncubator(free), 280);
  }

  /* ---------------- 孵化器頁 ---------------- */
  const isOpen = () => sheet && !sheet.hidden && sheet.classList.contains("ph-open");
  function openIncubator(slot) {
    if (slot == null) { const r = [0, 1].find(i => isReady(eggs[i]) && slotState(i) === "open"); slot = r != null ? r : (eggs[sel] || slotState(sel) !== "locked" ? sel : 0); }
    sel = slot;
    App._openSheet("sheet-incubator");
    setTimeout(async () => {
      fxPage.resize(); render(); startLoop();
      const e = eggs[sel];
      if (e && e.fresh) { delete e.fresh; save(); await needReveal(e); render(); }
      await animateProgress();
    }, 60);
  }
  function arc(cx, cy, r, a0, a1) {
    const p = a => [cx + r * Math.cos((a - 90) * Math.PI / 180), cy + r * Math.sin((a - 90) * Math.PI / 180)];
    const [x0, y0] = p(a0), [x1, y1] = p(a1);
    return `M${x0.toFixed(2)} ${y0.toFixed(2)} A${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
  }
  /* 分段環：30 格以內 1 格 = 1 題；多過 30 題 1 格 = 5 題（200 題 = 40 格），咁每格都睇得清 */
  const perSeg = need => need <= 30 ? 1 : 5;
  function drawRing(e, shown) {
    const ring = $("incu-ring"); if (!e) { ring.innerHTML = ""; return; }
    const k = perSeg(e.need), N = Math.ceil(e.need / k), gap = Math.min(4, 120 / N), seg = 360 / N, filled = Math.floor(shown / k);
    let h = "";
    for (let i = 0; i < N; i++) h += `<path data-i="${i}" class="${i < filled ? "on" : "off"}" d="${arc(100, 100, 92, i * seg + gap / 2, (i + 1) * seg - gap / 2)}"/>`;
    ring.innerHTML = h;
  }
  function renderSlots() {
    $("incu-slots").innerHTML = [0, 1].map(i => {
      const e = eggs[i], st = slotState(i);
      const status = st === "locked" ? `🔒 ${slot2Need()}-day streak` : st === "frozen" ? "❄️ Frozen" : !e ? "Empty" : isReady(e) ? "🐣 Ready!" : `${e.need - e.progress} to go`;
      return `<button class="incu-slot-btn ${i === sel ? "on" : ""} ${st}" data-slot="${i}" type="button">
        <span class="incu-ico" style="--rc:${e ? TIER_COL[TIER[e.rarity]] : "#999"};opacity:${e ? 1 : .35}">${eggSVG(e ? TIER[e.rarity] : "plain")}</span>
        <span class="t"><b>Slot ${i + 1}</b><small>${status}</small></span></button>`;
    }).join("");
    $("incu-slots").querySelectorAll("button").forEach(b => { b.onclick = async () => { sel = +b.dataset.slot; Snd.tick(2); render(); await animateProgress(); }; });
  }
  function setStageUI(e, shown) {
    const st = stageOf(shown, e.need);
    scene.dataset.stage = st;
    $("incu-chip").textContent = `${STAGES[st].icon} ${STAGES[st].name}`;
    const left = Math.max(0, e.need - shown);
    $("incu-left").textContent = left;
    $("incu-left-t").textContent = left ? (left === 1 ? "MORE ANSWER TO HATCH" : "MORE ANSWERS TO HATCH") : "READY TO HATCH!";
    $("incu-sub").textContent = `${shown} / ${e.need} correct answers`;
    showCracks($("incu-egg"), [0, 1, 2, 4, 4][st]);
    $("incu-egg").querySelector(".leak").style.opacity = [0, .1, .3, .7, 1][st];
    $("incu-track-fill").style.width = `calc((100% - 28px) * ${Math.min(1, shown / e.need)})`;
    $("incu-track").querySelectorAll(".st").forEach((el, i) => { el.classList.toggle("done", i < st); el.classList.toggle("cur", i === st); });
    return st;
  }
  function render() {
    renderSlots();
    const e = eggs[sel], st = slotState(sel), go = $("incu-go"), empty = $("incu-empty");
    scene.dataset.frozen = st === "frozen" ? "1" : "0";
    gsap.set("#incu-need", { opacity: 0 });
    const show = !!e;
    ["incu-chip", "incu-tier", "incu-track"].forEach(id => { $(id).style.visibility = show ? "visible" : "hidden"; });
    sheet.querySelector(".incu-stagebox").style.visibility = show ? "visible" : "hidden";
    sheet.querySelector(".incu-count").style.visibility = show ? "visible" : "hidden";
    go.classList.remove("ready"); go.disabled = false;
    $("incu-discard").hidden = !e || isReady(e);
    if (!e) {
      scene.dataset.stage = 0;
      empty.hidden = false;
      if (st === "locked") {
        const s = streak();
        const need = slot2Need();
        empty.innerHTML = `<div class="lock">🔒</div><p><b>Slot 2</b> unlocks at a <b>${need}-day</b> answer streak${s2.ever ? "" : ` <small>(first time only — after that, ${STREAK_SLOT2} days)</small>`}.</p>
          <div class="incu-streak"><i style="width:${Math.min(100, s / need * 100)}%"></i></div><p class="sm">Your streak: <b>${s}</b> / ${need} days</p>`;
        $("incu-hint").innerHTML = "With 2 eggs, <b>every correct answer warms both</b>.";
        go.textContent = "▶ Answer questions"; go.dataset.act = "quiz";
      } else {
        empty.innerHTML = `<div class="ghost"></div><p>This slot is empty.<br>Claim an egg in <b>Lucky Draw</b> for 💎${CLAIM_COST}.</p>`;
        $("incu-hint").innerHTML = "Common 30 · Rare 80 · Epic 140 · <b>Legendary 200</b> answers";
        go.textContent = `💎 Claim an egg (×${CLAIM_COST})`; go.dataset.act = "draw";
      }
      return;
    }
    empty.hidden = true;
    const tier = TIER[e.rarity], eg = $("incu-egg");
    eg.dataset.type = tier; eg.style.setProperty("--rc", TIER_COL[tier]);
    eg.querySelectorAll("svg").forEach(s => s.remove()); eg.insertAdjacentHTML("afterbegin", eggSVG(tier));
    $("incu-tier").textContent = `${EGG_NAME[e.rarity]} · ${RAR_NAME[e.rarity]}`; $("incu-tier").style.setProperty("--rc", TIER_COL[tier]);
    scene.style.setProperty("--rc", TIER_COL[tier]);
    drawRing(e, e.seen); setStageUI(e, e.seen);
    if (st === "frozen") {
      $("incu-chip").textContent = "❄️ Frozen";
      $("incu-left-t").textContent = "PAUSED — PROGRESS IS SAFE";
      $("incu-hint").innerHTML = `Your streak broke. Answer <b>${STREAK_THAW} days in a row</b> to thaw this egg (${Math.min(streak(), STREAK_THAW)}/${STREAK_THAW}).`;
      go.textContent = "▶ Answer questions"; go.dataset.act = "quiz";
      return;
    }
    const both = [0, 1].filter(i => eggs[i] && slotState(i) === "open" && !isReady(eggs[i])).length > 1;
    $("incu-hint").innerHTML = isReady(e) ? `A <b>${RAR_NAME[e.rarity]}</b> Pokémon is inside — which one?` :
      `A <b>${RAR_NAME[e.rarity]}</b> Pokémon is inside!${both ? " · Each answer warms <b>both eggs</b>" : ""}<br><small class="incu-note">Only built-in questions count — your own imported questions don't.</small>`;
    if (isReady(e)) { go.classList.add("ready"); go.textContent = "🐣 HATCH NOW!"; go.dataset.act = "hatch"; }
    else { go.textContent = "▶ Answer questions"; go.dataset.act = "quiz"; }
  }
  function banner(txt) { const b = $("incu-banner"); b.textContent = txt; gsap.timeline().fromTo(b, { opacity: 0, y: -10 }, { opacity: 1, y: 0, duration: .3 }).to(b, { opacity: 0, duration: .4, delay: 1.8 }); }
  function centerIn(el, cv) { const r = el.getBoundingClientRect(), c = cv.getBoundingClientRect(); return { x: r.left - c.left + r.width / 2, y: r.top - c.top + r.height * .5, w: r.width, h: r.height }; }

  /* 打開頁面：上次之後新答啱嘅格逐格亮起 */
  async function animateProgress() {
    const e = eggs[sel]; if (!e || slotState(sel) === "frozen") { if (e && slotState(sel) === "frozen") Snd.ice(); return; }
    const from = e.seen, to = Math.min(e.need, e.progress), k = perSeg(e.need), mySel = sel;
    if (to > from) {
      await sleep(400);
      let st = stageOf(from, e.need);
      const steps = to - from, stepBy = Math.max(1, Math.ceil(steps / 40));   /* 一次過多題就加快 */
      for (let p = from + stepBy; ; p += stepBy) {
        const v = Math.min(p, to);
        if (!isOpen() || sel !== mySel) return;
        if (v % k === 0 || v === to) {
          const seg = $("incu-ring").querySelector(`path[data-i="${Math.floor(v / k) - 1}"]`);
          if (seg && seg.classList.contains("off")) { seg.classList.remove("off"); seg.classList.add("on", "pop"); }
        }
        Snd.tick(Math.floor((v - from) / stepBy));
        const ns = setStageUI(e, v);
        if (ns > st) {
          st = ns; Snd.stageUp(); banner(`${STAGES[ns].icon} ${STAGES[ns].name}${ns === 4 ? " — tap HATCH NOW!" : ""}`);
          const ec = centerIn($("incu-egg"), $("incu-fx")); fxPage.burst(ec.x, ec.y, 30, ["#fff", "#ffd93c"], 6, { kind: "star", size: 3, life: 50, g: 0 });
          gsap.fromTo("#incu-egg", { scale: 1.15 }, { scale: 1, duration: .5, ease: "elastic.out(1.3,.35)" }); await sleep(500);
        }
        if (v >= to) break;
        await sleep(Math.max(45, 200 - (v - from) / stepBy * 10));
      }
      drawRing(e, to);
    }
    e.seen = to; save(); refreshEntries(); renderSlots();
    if (stageOf(to, e.need) === 3) Snd.heartbeat();
    if (isReady(e)) render();
  }

  /* 新蛋：題數拉霸（30 → 80 → 140 → 200 輪住閃，越轉越慢，停喺呢隻蛋嘅數） */
  async function needReveal(e) {
    const box = $("incu-need"), nEl = $("incu-need-n"), rEl = $("incu-need-r"), cap = $("incu-need-cap");
    const seq = ["normal", "rare", "epic", "legend"];
    box.className = "incu-need"; cap.textContent = ""; nEl.textContent = "?"; rEl.textContent = "";
    await gsap.to(box, { opacity: 1, duration: .3 });
    Snd.riser(1.6);
    const target = seq.indexOf(e.rarity), total = 12 + target;   /* 轉 3 圈左右先停 */
    for (let k = 0; k <= total; k++) {
      const r = seq[k % 4];
      nEl.textContent = NEED[r]; rEl.textContent = RAR_NAME[r]; box.dataset.r = r;
      Snd.tick(k);
      gsap.fromTo(nEl, { scale: 1.25 }, { scale: 1, duration: .2, ease: "back.out(3)" });
      await sleep(70 + Math.pow(k / total, 3) * 520);
    }
    const lv = HATCH_LV[e.rarity];
    box.classList.add("n-" + e.rarity);
    cap.textContent = { normal: "A quick one — hatches today!", rare: "✨ A RARE egg!", epic: "🔥 AN EPIC EGG!!", legend: "🌈 200!!! A LEGENDARY EGG!!!" }[e.rarity];
    Snd.fanfare(lv);
    const c = centerIn(nEl, $("incu-fx"));
    fxPage.burst(c.x, c.y, 20 + lv * 25, lv >= 4 ? ["#ff6b6b", "#ffd93c", "#6bff9b", "#6bc5ff", "#c77dff"] : [TIER_COL[TIER[e.rarity]], "#fff"], 7, { kind: lv >= 3 ? "confetti" : "star", size: 3.5, life: 90, g: lv >= 3 ? .08 : 0, up: 2 });
    if (lv >= 3) gsap.fromTo(".incu-view", { x: -(lv * 3) }, { x: 0, duration: .6, ease: "elastic.out(1.3,.25)" });
    await gsap.fromTo(nEl, { scale: 1.8 }, { scale: 1, duration: .6, ease: "elastic.out(1.2,.35)" });
    await sleep(1500);
    await gsap.to(box, { opacity: 0, duration: .3 });
  }

  /* ---------------- 丟棄蛋（真 app confirm-box） ---------------- */
  function askDiscard() {
    const e = eggs[sel]; if (!e || isReady(e) || hatching) return;
    const relock = sel === 1 && !syncSlot2();
    App.showModal(`
      <div class="confirm-box">
        <p>Discard this <b>${RAR_NAME[e.rarity]}</b> egg?</p>
        <p class="settings-note">Progress <b>${e.progress} / ${e.need}</b> will be lost. The 💎${CLAIM_COST} is not refunded.${relock ? `<br>Slot 2 will lock again until a ${slot2Need()}-day streak.` : ""}</p>
        <div class="confirm-row">
          <button id="incu-discard-yes" class="btn-big btn-danger">DISCARD</button>
          <button id="incu-discard-no" class="btn-big btn-plain">KEEP</button>
        </div>
      </div>`, true);
    $("incu-discard-no").onclick = () => App.closeModal();
    $("incu-discard-yes").onclick = async () => {
      App.closeModal();
      const eg = $("incu-egg"), slot = sel;
      Snd.tone({ f: 330, to: 160, d: .5, type: "triangle", g: .14 });
      await gsap.timeline()
        .to(eg, { rotate: -8, duration: .08, yoyo: true, repeat: 3 })
        .to(eg, { y: "40%", opacity: 0, scale: .7, duration: .55, ease: "power2.in" });
      const c = centerIn(eg, $("incu-fx"));
      fxPage.burst(c.x, c.y + c.h * .4, 18, ["rgba(200,190,170,.7)", "rgba(160,150,140,.6)"], 3, { kind: "spark", size: 4, life: 40, g: -.02 });
      gsap.set(eg, { clearProps: "transform,opacity" });
      eggs[slot] = null; save(); refreshEntries(); render();
      App.toast("🥚 Egg discarded — the slot is free.");
    };
  }

  function tapEgg() {
    const e = eggs[sel]; if (!e) return;
    const eg = $("incu-egg"), frozen = slotState(sel) === "frozen", st = +scene.dataset.stage;
    eg.classList.remove("tap"); void eg.offsetWidth; eg.classList.add("tap");
    setTimeout(() => eg.classList.remove("tap"), 520);
    if (frozen) Snd.ice(); else if (st >= 2) Snd.crack(st - 2); else Snd.wobble();
    const b = $("incu-bubble"); b.textContent = frozen ? "Brrr… it's frozen solid." : STAGES[st].say;
    gsap.killTweensOf(b); gsap.timeline().fromTo(b, { opacity: 0, y: 6 }, { opacity: 1, y: 0, duration: .2 }).to(b, { opacity: 0, duration: .3, delay: 1.3 });
    const c = centerIn(eg, $("incu-fx")); fxPage.burst(c.x, c.y - c.h * .2, 6 + st * 6, frozen ? ["#d8f1ff", "#fff"] : [TIER_COL[TIER[e.rarity]], "#fff"], 2 + st, { kind: "star", size: 2.5, life: 34, g: 0 });
    if (!frozen && isReady(e)) setTimeout(() => hatchSlot(sel, "page"), 250);
  }
  function onGo() {
    const act = $("incu-go").dataset.act;
    if (act === "hatch") { hatchSlot(sel, "page"); return; }
    App._closeSheet("sheet-incubator");
    if (act === "draw") { setTimeout(() => Gacha.open("rare"), 260); return; }
    setTimeout(() => { const b = $("btn-start-quiz"); if (b) b.click(); }, 260);
  }

  /* 階段粒子：越近孵化越多越熱；凍結 = 雪花 */
  function spawnStage(now) {
    const e = eggs[sel]; if (!e || !isOpen()) return;
    const frozen = slotState(sel) === "frozen", st = +scene.dataset.stage, rate = frozen ? 3 : [1.1, 4, 9, 18, 26][st];
    if (now - lastSpawn < 1000 / rate) return; lastSpawn = now;
    const c = centerIn($("incu-egg"), $("incu-fx"));
    if (frozen) { fxPage.add({ x: Math.random() * fxPage.w, y: -10, vx: (Math.random() - .5) * .4, vy: .5 + Math.random() * .6, g: 0, max: 400, size: 10 + Math.random() * 8, kind: "txt", ch: "❄", color: "rgba(220,240,255,.8)", drag: 1 }); return; }
    if (st === 0) { fxPage.add({ x: c.x + c.w * .25, y: c.y - c.h * .45, vx: .35 + Math.random() * .2, vy: -.45, g: 0, max: 110, size: 12 + Math.random() * 8, kind: "txt", ch: "z", color: "rgba(200,215,255,.85)", drag: 1 }); return; }
    const hot = ["#ffb13b", "#ff7a3c", "#ff5a3c", "#ffe27a"][st - 1];
    fxPage.add({ x: c.x + (Math.random() - .5) * c.w * 1.4, y: c.y + c.h * .45, vx: (Math.random() - .5) * .4, vy: -.6 - Math.random() * (st * .5), g: -.004, max: 70 + Math.random() * 50, size: 1.6 + Math.random() * 2 + st * .3, color: hot, drag: .995 });
    if (st >= 3 && Math.random() < .5) fxPage.add({ x: c.x + (Math.random() - .5) * c.w * .5, y: c.y - c.h * .1, vx: (Math.random() - .5) * 1.5, vy: -1 - Math.random() * 1.5, g: .02, max: 40, size: 2.5, kind: "star", color: TIER_COL[TIER[e.rarity]], rot: Math.random() * 6, vr: .2 });
    if (st === 4 && Math.random() < .08) fxPage.burst(c.x, c.y, 12, ["#fff", "#ffd93c"], 4, { kind: "star", size: 2.5, life: 34, g: 0 });
  }
  function startLoop() {
    if (loopOn) return; loopOn = true;
    const tick = now => {
      spawnStage(now); fxPage.step(); fxPop.step();
      if (isOpen() || $("incu-hatch").classList.contains("show") || fxPage.ps.length || fxPop.ps.length) requestAnimationFrame(tick);
      else { loopOn = false; fxPage.ps.length = 0; }
    };
    requestAnimationFrame(tick);
  }

  /* ---------------- 孵蛋（結算小視窗／孵化器頁／預覽） ---------------- */
  let hatching = false;
  async function hatchSlot(i, src) {
    const e = eggs[i];
    if (!e || hatching || !isReady(e)) return;
    eggs[i] = null; save(); refreshEntries();
    await playHatch(e, src);
  }
  async function playHatch(e, src) {
    hatching = true;
    const rar = e.rarity, tier = TIER[rar], col = TIER_COL[tier], lv = HATCH_LV[rar];
    if (src === "page") { App._closeSheet("sheet-incubator"); await sleep(260); }
    const st = loadState(), gen = st.unlockedGen || 1;
    let pool = pullablePool(gen, rar) || [];
    if (!pool.length) pool = pullablePool(1, rar) || [];
    const chainKey = pool[Math.floor(Math.random() * pool.length)];
    const got = obtainPokemon(chainKey, "rare");
    const cur = entryCurrentSpecies(got.entry), dex = cur[0];

    const pop = $("incu-hatch"), win = $("ih-win"), eg = $("ih-egg"), mon = $("ih-mon"), name = $("ih-name");
    win.style.setProperty("--rc", col);
    win.style.setProperty("--ray", ["#ffffff", "#7fb8ff", "#7fb8ff", "#ffc93c", "#ffffff"][lv]);
    win.classList.toggle("rainbow", lv >= 4);
    $("ih-title").innerHTML = `Your egg is hatching!<small>${e.need}-ANSWER ${EGG_NAME[rar]}</small>`;
    const sv = eggSVG(tier);
    eg.dataset.type = tier; eg.style.setProperty("--rc", col);
    eg.innerHTML = `<div class="ep p-top">${sv}</div><div class="ep p-bl">${sv}</div><div class="ep p-br">${sv}</div><div class="leak"></div>`;
    gsap.set(eg.querySelectorAll(".ep"), { x: 0, y: 0, rotate: 0, opacity: 1 }); gsap.set(eg, { rotate: 0, scale: 1, opacity: 1 });
    gsap.set([".ih-rays", ".ih-halo", ".ih-dim", ".ih-flash", "#ih-name"], { opacity: 0 }); gsap.set(".ih-nest-back, .ih-nest-front", { opacity: 1 });
    mon.className = "ih-mon"; gsap.set(mon, { opacity: 0, scale: .3 });
    mon.onerror = () => { mon.onerror = null; mon.src = spriteURL(dex); }; mon.src = artworkURL(dex);
    name.textContent = cur[1];
    pop.classList.add("show"); fxPop.resize(); startLoop();
    await gsap.fromTo(win, { scale: .6, opacity: 0 }, { scale: 1, opacity: 1, duration: .45, ease: "back.out(1.7)" });

    const wob = 2 + lv;
    for (let k = 0; k < wob; k++) {
      Snd.wobble(); Snd.crack(Math.min(3, k));
      showCracks(eg, Math.min(4, k + 1));
      gsap.to(eg.querySelector(".leak"), { opacity: (k + 1) / wob, duration: .2 });
      await gsap.to(eg, { rotate: (k % 2 ? -1 : 1) * (8 + lv * 2), duration: .09, yoyo: true, repeat: 3, ease: "sine.inOut" });
      gsap.set(eg, { rotate: 0 });
      const c = centerIn(eg, $("ih-fx")); fxPop.burst(c.x, c.y, 6 + k * 3, [col, "#fff"], 3 + k, { life: 26, g: 0 });
      await sleep(Math.max(120, 380 - lv * 50));
    }
    if (lv >= 2) {
      const d = .8 + lv * .25; Snd.riser(d);
      if (lv >= 3) Snd.heartbeat();
      await Promise.all([
        gsap.to(".ih-dim", { opacity: .35 + lv * .12, duration: d, ease: "power2.in" }),
        gsap.to(eg, { rotate: 5, duration: .05, yoyo: true, repeat: Math.round(d / .05), ease: "none" }),
        gsap.to(".ih-halo", { opacity: .5, scale: 1.2, duration: d })
      ]);
      gsap.set(eg, { rotate: 0 });
    }
    await sleep(150 + lv * 90);
    Snd.burst(lv);
    const c = centerIn(eg, $("ih-fx"));
    gsap.fromTo(".ih-flash", { opacity: 1 }, { opacity: 0, duration: .5 + lv * .15 });
    if (lv >= 2) gsap.fromTo(win, { x: -(lv * 4) }, { x: 0, duration: .6, ease: "elastic.out(1.3,.25)" });
    const [pt, pl, pr] = eg.querySelectorAll(".ep"), sz = eg.offsetWidth;
    gsap.to(pt, { y: -sz * 1.2, x: sz * .1, rotate: -50, opacity: 0, duration: .8, ease: "power2.out" });
    gsap.to(pl, { y: sz * .4, x: -sz * .8, rotate: -35, opacity: 0, duration: .8, ease: "power2.out" });
    gsap.to(pr, { y: sz * .45, x: sz * .8, rotate: 40, opacity: 0, duration: .8, ease: "power2.out" });
    gsap.to(eg.querySelector(".leak"), { opacity: 0, duration: .3 });
    gsap.to(".ih-dim", { opacity: .25, duration: .6 });
    gsap.to(".ih-nest-back, .ih-nest-front", { opacity: .2, duration: .5 });
    gsap.fromTo(".ih-rays", { opacity: 0, scale: .3 }, { opacity: [.35, .45, .55, .65, .8][lv], scale: 1, duration: .8 });
    gsap.fromTo(".ih-halo", { opacity: 0, scale: .3 }, { opacity: .9, scale: 1, duration: .5 });
    fxPop.burst(c.x, c.y, 30 + lv * 35, [col, "#fff", "#ffd93c"], 6 + lv * 1.5, { life: 60, g: .04 });
    fxPop.burst(c.x, c.y, 26, ["#fff6d6", "#f6efd8", "#e0d4b0"], 6, { kind: "confetti", size: 3.5, life: 60, g: .14, up: 3 });
    if (lv >= 3) fxPop.burst(c.x, c.y - 30, 40 + lv * 20, ["#ff6b6b", "#ffd93c", "#6bff9b", "#6bc5ff", "#c77dff"], 7, { kind: "confetti", size: 3.5, life: 110, g: .08, up: 3, drag: .985 });
    await gsap.fromTo(mon, { opacity: 0, scale: .3, y: 20 }, { opacity: 1, scale: 1, y: 0, duration: .5 + lv * .1, ease: "back.out(1.6)" });
    if (lv >= 4) { Snd.heartbeat(); await sleep(450); }
    await sleep(350 + lv * 150);
    gsap.fromTo(".ih-flash", { opacity: .9 }, { opacity: 0, duration: .5 });
    mon.classList.add("color");
    try { Pokedex.playCry(dex); } catch (err) { /* audio unavailable */ }
    Snd.fanfare(lv);
    gsap.fromTo(mon, { scale: 1.2 }, { scale: 1, duration: .6, ease: "elastic.out(1.2,.4)" });
    fxPop.burst(c.x, c.y, 30 + lv * 10, [col, "#fff"], 6, { kind: "star", size: 3, life: 60, g: 0 });
    await gsap.fromTo(name, { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: .35 });
    await sleep(1300);
    pop.classList.remove("show");
    await sleep(320);
    await showResultCard(got, rar, e.need);
    hatching = false;
    App.renderHome();
  }

  /* 真 app 抽獎檢視卡（#gacha-inspect），掣改 Done；撳 Done 先 resolve（多隻蛋逐隻） */
  function showResultCard(got, rarity, need) {
    return new Promise(resolve => {
      const insp = Gacha._ensureInspect(), cfg = GACHA_BALL[rarity] || { ray: "#cfd8dc", label: "COMMON" };
      const entry = got.entry, cur = entryCurrentSpecies(entry), dex = cur[0];
      insp.dataset.rarity = rarity;
      insp.querySelector(".gi-rays").style.setProperty("--ray", cfg.ray);
      const rb = insp.querySelector(".gi-rarity"); rb.textContent = cfg.label; rb.style.background = rarity === "normal" ? "#8d9aa5" : "";
      const art = insp.querySelector(".gi-art"); art.onerror = () => { art.onerror = null; art.src = spriteURL(dex); }; art.src = artworkURL(dex); art.alt = cur[1];
      insp.querySelector(".gi-name").textContent = cur[1];
      const stars = rarity === "legend" ? "★★★" : rarity === "epic" ? "★★" : rarity === "rare" ? "★" : "☆";
      insp.querySelector(".gi-meta").innerHTML = `No.${String(dex).padStart(3, "0")} ・ Lv.${entry.level} ・ ${stars}<div class="gi-hatched">🥚 Hatched from a ${need}-answer egg</div>`;
      const de = dexOf(dex), types = (de && de.types) || [];
      insp.querySelector(".gi-types").innerHTML = types.map(t => `<span class="gi-type" style="background:${typeColor(t)}"><img src="${typeIconURL(t)}" alt="" onerror="this.remove()">${typeLabel(t).toUpperCase()}</span>`).join("");
      const stats = statsForEntry(entry);
      insp.querySelector(".gi-stats").innerHTML = stats ? STAT_KEYS.map(k => `<div class="gi-stat"><b>${stats[k]}</b><span>${STAT_LABELS[k]}</span></div>`).join("") : "";
      const note = insp.querySelector(".gi-note");
      if (got.isDupe) { note.className = "gi-note"; note.textContent = `Already have it! ⚡ EV point +1${got.candyGain ? " ・ 🍬 Candy +1" : ""}`; }
      else { note.className = "gi-note new"; note.textContent = "NEW! Registered to your Pokédex."; }
      const again = insp.querySelector(".gi-again"); again.hidden = true;
      const done = document.createElement("button"); done.className = "btn-big btn-primary gi-incu-done"; done.textContent = "Done";
      insp.querySelector(".gi-actions").appendChild(done);
      done.onclick = () => {
        insp.classList.remove("show");
        setTimeout(() => { insp.classList.add("hidden"); done.remove(); again.hidden = false; rb.style.background = ""; resolve(); }, 450);
        if (got.newlyUnlockedGen) { App._pendingGenUnlock = got.newlyUnlockedGen; App.maybeShowGenUnlock(); }
      };
      insp.classList.remove("hidden");
      requestAnimationFrame(() => insp.classList.add("show"));
    });
  }

  /* 只計內置題：答啱（clean）而且 qid 唔係家長自訂題（customQuestions，id 係 c…／cw…） */
  function builtInCorrect(data) {
    const res = Array.isArray(data.results) ? data.results : [];
    if (!res.length) return Number(data.score) || 0;
    const custom = new Set((loadState().customQuestions || []).map(q => q && q.id));
    return res.filter(r => r.correct && !custom.has(r.qid)).length;
  }

  /* ---------------- 結算：1 條答啱嘅題同時計落所有開住嘅蛋；夠數就逐隻彈孵蛋小視窗 ---------------- */
  function hookSettlement() {
    const orig = App._renderSettlement;
    App._renderSettlement = function (data, rewards) {
      orig.call(this, data, rewards);
      const add = builtInCorrect(data), done = [];
      [0, 1].forEach(i => {
        const e = eggs[i];
        if (!e || isReady(e) || slotState(i) !== "open") return;   /* 凍結嘅 slot 唔計 */
        e.progress = Math.min(e.need, e.progress + add);
        if (isReady(e)) done.push(i);
      });
      save(); refreshEntries();
      if (done.length) setTimeout(async () => {
        for (const i of done) {
          if (!$("view-settlement").classList.contains("active")) break;
          await hatchSlot(i, "settle");
        }
      }, 2400);
    };
  }

  /* ---------------- prototype 控制 ---------------- */
  function devClick(ev) {
    const b = ev.target.closest("button"); if (!b) return;
    if (b.dataset.hatch) {
      if (hatching) return;
      Snd.init(); $("incu-dev").hidden = true;
      if (App._closeAllSheets) App._closeAllSheets();
      const e = makeEgg(b.dataset.hatch); e.progress = e.need;
      setTimeout(() => playHatch(e, "preview"), 300);
      return;
    }
    if (b.dataset.claim) {
      const free = freeSlot();
      if (free == null) { App.toast("Incubator full (prototype): hatch or reset first."); return; }
      eggs[free] = makeEgg(b.dataset.claim); save(); refreshEntries(); $("incu-dev").hidden = true;
      if (App._closeAllSheets) App._closeAllSheets();
      setTimeout(() => openIncubator(free), 280);
      return;
    }
    if (b.dataset.prog) {
      const e = eggs[sel]; if (!e) { App.toast("Selected slot is empty."); return; }
      const v = b.dataset.prog;
      if (v === "-3") e.progress = Math.max(0, e.need - 3);
      else if (v === "+10") e.progress = Math.min(e.need, e.progress + 10);
      else e.progress = Math.min(e.need, Math.ceil(e.need * [.25, .5, .75, 1, 1][stageOf(e.progress, e.need)]));
      save(); refreshEntries();
      if (isOpen()) animateProgress();
      return;
    }
    if (b.dataset.streak != null) {
      if (b.dataset.streak === "") localStorage.removeItem(LS_STREAK); else localStorage.setItem(LS_STREAK, b.dataset.streak);
      if (slotState(sel) === "locked") sel = 0;
      updateDev(); refreshEntries(); if (isOpen()) render();
      App.toast(`Streak = ${streak()} days → Slot 2 ${slotState(1)}${s2.ever ? ` (re-unlock: ${STREAK_SLOT2} days)` : ""}`);
      return;
    }
    if (b.dataset.round) {
      $("incu-dev").hidden = true;
      const mix = b.dataset.round === "mix", score = mix ? 10 : +b.dataset.round;
      /* 用真題目 id 砌 results：內置題由 SITE_QUESTIONS 攞；「4 custom」用 App 真嘅新增自訂題 API 整 4 條 */
      let ids = SITE_QUESTIONS.slice().sort(() => Math.random() - .5).slice(0, 10).map(q => q.id);
      if (mix) {
        const made = [];
        for (let k = 0; made.length < 4 && k < 20; k++) {
          const r = addCustomSentenceQuestion({ sentence: `Proto custom ${Date.now()}-${k}: I ___ a test.`, answer: "am", topic: "Proto custom" });
          if (r.ok) made.push(r.question.id);
        }
        ids = ids.slice(0, 10 - made.length).concat(made);
      }
      const results = ids.map((qid, k) => ({ qid, chosen: "", correct: k < score, hint: false, memory: false, topic: "" }));
      App.lastCapture = null;
      App.onSetComplete({ score, total: 10, duration: 84, results, bestCombo: score, wrongTries: 10 - score, mode: "normal" });
      return;
    }
    if (b.dataset.reset) { [LS_KEY, LS_STREAK, LS_S2, "pe_incubator_proto", "pokeengmon_state_v1"].forEach(k => localStorage.removeItem(k)); location.reload(); }
  }

  /* ---------------- 開機：示範存檔、跳過登入閘、植入 ---------------- */
  try {
    const st = loadState();
    if (!st.entries || !st.entries.length) {
      obtainPokemon("pikachu", "rare");
      const s2 = loadState(); s2.diamonds = Math.max(s2.diamonds || 0, 300); s2.playerName = "Ash"; s2.nameCustomized = true; saveState();
    }
  } catch (err) { console.warn("[incubator-proto] seed failed", err); }
  const origLogin = App.openLoginHub;
  App.openLoginHub = function (gate) { if (gate === true) return; return origLogin.apply(this, arguments); };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => setTimeout(inject, 0));
  else inject();
  window.IncubatorProto = { get eggs() { return eggs; }, get sel() { return sel; }, slotState, streak, openIncubator, hatchSlot };
})();
