/* ============================================================
   PokeEngmon - 孵化器 UI（plan .trae/documents/20261108-gacha-dragonite-incubator-plan.md Task 3.3／3.4）
   由 tools/prototype/incubator/incubator.js 搬入；狀態／經濟全部經 Incubator（js/incubator/incubator.js）。
   - 入口：首頁 Battle 捲頁 #btn-home-incubator、Lucky Draw #gacha-incu-row（Claim 💎3）／#gacha-incu-view。
   - #sheet-incubator：2 個 slot、分段環、5 階段、熱度軌、逐格亮起、題數拉霸、凍結／鎖住、撳蛋對白、丟棄確認。
   - 結算：App.onSetComplete → IncubatorUI.afterRound(readyPromise)；夠數先逐隻彈 #incu-hatch 小視窗 →
     真 #gacha-inspect 結果卡（掣改 Done）。離開結算頁就停，未孵嘅蛋留喺孵化器。
   - 動畫倍速：題數拉霸、逐格亮起、孵蛋演出經 AnimSpeed.begin/end（Rule 95）。
   - 音效：用 CaptureAudio（Gacha._audio()）嘅 _tone／_noiseHit／_noiseSweep（跟 SFX 音量）。
   載入：type="module"（index.html，incubator.js、egg-art.js 之後）。
   ============================================================ */

const IncubatorUI = (() => {
  const $ = (id) => document.getElementById(id);
  const STAGES = [
    { icon: "😴", name: "Sleeping", say: "Zzz… it's fast asleep." },
    { icon: "🌡️", name: "Warming up", say: "It feels a little warm." },
    { icon: "🔥", name: "Getting hot", say: "Something moved inside!" },
    { icon: "💥", name: "Cracking!", say: "It's about to hatch!!" },
    { icon: "🐣", name: "Ready!", say: "Tap HATCH NOW!" }
  ];
  const R = () => IncubatorRules;
  const Art = () => IncubatorArt;
  const spdMs = (ms) => (window.AnimSpeed ? AnimSpeed.ms(ms) : ms);
  const sleep = (ms) => new Promise((r) => setTimeout(r, spdMs(ms)));
  const spdBegin = () => { if (window.AnimSpeed) AnimSpeed.begin("incubator"); };
  const spdEnd = () => { if (window.AnimSpeed) AnimSpeed.end("incubator"); };

  /* ---------------- 音效（CaptureAudio primitives） ---------------- */
  /* Gacha／Pokedex 係 classic script 頂層 const，唔喺 window：用 typeof 判斷 */
  const A = () => (typeof Gacha !== "undefined" && Gacha._audio ? Gacha._audio() : null);
  const tone = (f, o) => { const a = A(); if (a && a._tone) a._tone(f, o); };
  const hit = (o) => { const a = A(); if (a && a._noiseHit) a._noiseHit(o); };
  const Snd = {
    init() { const a = A(); if (a && a.ensure) a.ensure(); },
    tick(i) { tone(660 * Math.pow(1.045, Math.min(i, 30)), { type: "triangle", dur: 0.09, gain: 0.12 }); },
    crack(i) { tone(1100 * Math.pow(1.26, i), { type: "triangle", dur: 0.2, gain: 0.2 }); hit({ freq: 3500, type: "highpass", dur: 0.035, gain: 0.22 }); },
    wobble() { hit({ freq: 900, q: 2, dur: 0.12, gain: 0.12 }); },
    chime() { [784, 988, 1175, 1568].forEach((f, i) => tone(f, { at: i * 0.07, dur: 0.5, type: "triangle", gain: 0.1 })); },
    ice() { [1568, 2093, 2637].forEach((f, i) => tone(f, { at: i * 0.06, dur: 0.35, gain: 0.06 })); },
    heartbeat() { tone(70, { slideTo: 42, dur: 0.16, gain: 0.5 }); tone(66, { at: 0.22, slideTo: 40, dur: 0.2, gain: 0.4 }); },
    riser(d) { const a = A(); if (a && a._noiseSweep) a._noiseSweep(180, 5200, d, 0.28); tone(110, { type: "sawtooth", dur: d, gain: 0.04, slideTo: 880 }); },
    burst(lv) {
      hit({ freq: 7000, type: "lowpass", dur: 1 + lv * 0.15, gain: 0.4 + lv * 0.06 });
      [1, 1.5, 2, 2.52].forEach((m) => tone((lv >= 3 ? 196 : 261.6) * m, { dur: 1.4, type: "triangle", gain: 0.07 }));
      if (lv >= 2) tone(55, { slideTo: 40, dur: 1.2, gain: 0.45 });
    },
    fanfare(lv) {
      const seq = [[523, 659, 784], [523, 659, 784, 1046], [523, 659, 784, 988, 1046], [523, 587, 659, 784, 988, 1046], [523, 587, 659, 784, 880, 1046, 1318]][lv];
      seq.forEach((f, i) => tone(f, { at: i * 0.085, dur: 0.28, type: "square", gain: 0.05 }));
      const t = seq.length * 0.085;
      [523, 659, 784, 1046].forEach((f) => tone(f, { at: t, dur: 0.9 + lv * 0.3, type: "triangle", gain: 0.07 }));
    },
    stageUp() { tone(523, { slideTo: 1046, dur: 0.3, type: "triangle", gain: 0.14 }); this.chime(); },
    sad() { tone(330, { slideTo: 160, dur: 0.5, type: "triangle", gain: 0.14 }); }
  };

  /* ---------------- 粒子 ---------------- */
  function makeFX(cv) {
    const o = { cv, ps: [], w: 0, h: 0, c: null };
    o.resize = () => {
      const r = cv.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1);
      o.w = r.width; o.h = r.height; cv.width = Math.max(1, r.width * dpr); cv.height = Math.max(1, r.height * dpr);
      o.c = cv.getContext("2d"); if (o.c) o.c.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    o.add = (p) => { if (o.ps.length < 400) o.ps.push(Object.assign({ life: 0, g: 0, drag: 0.98, size: 3, kind: "spark", rot: 0, vr: 0 }, p)); };
    o.burst = (x, y, n, cols, sp, opt = {}) => {
      if (window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches) n = Math.ceil(n / 3);
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2, v = sp * (0.35 + Math.random());
        o.add({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - (opt.up || 0), g: opt.g ?? 0.1, max: (opt.life || 50) * (0.6 + Math.random() * 0.7),
          size: (opt.size || 3) * (0.5 + Math.random()), color: cols[i % cols.length], kind: opt.kind || "spark", rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4, drag: opt.drag ?? 0.965 });
      }
    };
    o.step = () => {
      const c = o.c; if (!c) return;
      c.clearRect(0, 0, o.w, o.h);
      for (let i = o.ps.length - 1; i >= 0; i--) {
        const p = o.ps[i];
        p.life++; p.vx *= p.drag; p.vy = p.vy * p.drag + p.g; p.x += p.vx; p.y += p.vy; p.rot += p.vr;
        const k = 1 - p.life / p.max;
        if (k <= 0) { o.ps.splice(i, 1); continue; }
        if (p.kind === "txt") {
          c.globalCompositeOperation = "source-over"; c.globalAlpha = Math.min(1, k * 1.5); c.fillStyle = p.color; c.font = `900 ${p.size}px system-ui`; c.fillText(p.ch, p.x, p.y);
        } else if (p.kind === "confetti") {
          c.globalCompositeOperation = "source-over"; c.globalAlpha = Math.min(1, k * 2); c.fillStyle = p.color;
          c.save(); c.translate(p.x, p.y); c.rotate(p.rot); c.fillRect(-p.size, -p.size * 0.4, p.size * 2, p.size * 0.8); c.restore();
        } else if (p.kind === "star") {
          c.globalCompositeOperation = "lighter"; c.globalAlpha = k; c.fillStyle = p.color;
          c.save(); c.translate(p.x, p.y); c.rotate(p.rot);
          const s = p.size * 1.6; c.beginPath();
          for (let j = 0; j < 8; j++) { const rr = j % 2 ? s * 0.35 : s, aa = j * Math.PI / 4; c.lineTo(Math.cos(aa) * rr, Math.sin(aa) * rr); }
          c.closePath(); c.fill(); c.restore();
        } else {
          c.globalCompositeOperation = "lighter"; c.globalAlpha = k;
          const r = p.size * (0.4 + k * 0.6), gr = c.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 2.4);
          gr.addColorStop(0, "#fff"); gr.addColorStop(0.3, p.color); gr.addColorStop(1, "rgba(0,0,0,0)");
          c.fillStyle = gr; c.beginPath(); c.arc(p.x, p.y, r * 2.4, 0, 7); c.fill();
        }
      }
      c.globalAlpha = 1; c.globalCompositeOperation = "source-over";
    };
    return o;
  }

  /* ---------------- 狀態 helpers ---------------- */
  let sel = 0, hatching = false, claiming = false, bound = false, freshSlot = null;
  let sheet = null, scene = null, fxPage = null, fxPop = null, loopOn = false, lastSpawn = 0;
  const S = () => Incubator.state();
  const slotState = (i) => { const s = S(); return R().slotState(i, s.eggs, s.s2); };
  const slot2Need = () => (S().s2.ever ? R().SLOT2_AGAIN : R().SLOT2_FIRST);
  const isReady = (e) => !!(e && e.progress >= e.need);
  const tierOf = (rarity) => Art().TIER[rarity] || "plain";
  const colOf = (rarity) => Art().color(rarity);
  const isOpen = () => !!(sheet && !sheet.hidden && sheet.classList.contains("ph-open"));
  const closeGacha = () => { if (App.closeGachaSheet) App.closeGachaSheet(); else App._closeSheet("sheet-gacha"); };
  const toast = (m) => { if (App.toast) App.toast(m); };
  function centerIn(el, cv) {
    const r = el.getBoundingClientRect(), c = cv.getBoundingClientRect();
    return { x: r.left - c.left + r.width / 2, y: r.top - c.top + r.height * 0.5, w: r.width, h: r.height };
  }

  /* ---------------- 綁定（module 載入時 DOM 已 parse） ---------------- */
  function bind() {
    if (bound || !$("sheet-incubator")) return;
    bound = true;
    Art().ensureDefs();
    sheet = $("sheet-incubator");
    scene = $("incu-scene");
    $("incu-close").addEventListener("click", () => App._closeSheet("sheet-incubator"));
    const home = $("btn-home-incubator");
    if (home) home.addEventListener("click", () => { Snd.init(); App._closeSheet("sheet-battle"); setTimeout(() => open(), 240); });
    const row = $("gacha-incu-row");
    if (row) row.addEventListener("click", () => { Snd.init(); claimEgg(); });
    const view = $("gacha-incu-view");
    if (view) view.addEventListener("click", () => { closeGacha(); setTimeout(() => open(), 260); });
    $("incu-go").addEventListener("click", onGo);
    $("incu-discard").addEventListener("click", askDiscard);
    const egg = $("incu-egg");
    egg.addEventListener("click", tapEgg);
    egg.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); tapEgg(); } });
    const stars = $("incu-stars");
    for (let i = 0; i < 40; i++) {
      const s = document.createElement("i");
      s.style.left = Math.random() * 100 + "%"; s.style.top = Math.random() * 100 + "%";
      s.style.animationDelay = -Math.random() * 3 + "s"; s.style.opacity = String(0.3 + Math.random() * 0.7);
      stars.appendChild(s);
    }
    $("incu-track").innerHTML = `<div class="line"></div><div class="fill" id="incu-track-fill"></div>` +
      STAGES.map((s, i) => `<div class="st" data-i="${i}" style="left:calc(14px + (100% - 28px) * ${i / 4})">${s.icon}<small>${s.name}</small></div>`).join("");
    fxPage = makeFX($("incu-fx"));
    document.body.insertAdjacentHTML("beforeend", `<div id="incu-hatch" aria-live="polite"><div class="ih-win" id="ih-win">
      <div class="ih-rays"></div><div class="ih-halo"></div>
      <div class="ih-title" id="ih-title"></div>
      <div class="ih-nest-back"></div><div class="ih-egg" id="ih-egg"></div><div class="ih-nest-front"></div>
      <img class="ih-mon" id="ih-mon" alt=""><div class="ih-name" id="ih-name"></div>
      <canvas class="ih-fx" id="ih-fx"></canvas><div class="ih-dim"></div><div class="ih-flash"></div></div></div>`);
    fxPop = makeFX($("ih-fx"));
    addEventListener("resize", () => { if (isOpen()) { fxPage.resize(); render(); } });
    if (window.Store && Store.subscribe) Store.subscribe("diamonds", () => refreshEntries());
    refreshEntries();
  }

  /* ---------------- 入口狀態 ---------------- */
  function refreshEntries() {
    if (!bound) return;
    const { eggs } = S();
    const live = [0, 1].map((i) => eggs[i] && { e: eggs[i], st: slotState(i) }).filter(Boolean);
    const ready = live.some((x) => isReady(x.e) && x.st === "open");
    const next = live.filter((x) => x.st === "open" && !isReady(x.e)).map((x) => x.e.need - x.e.progress).sort((a, b) => a - b)[0];
    const icoRar = live.length ? live[0].e.rarity : "normal";
    ["incu-sitem-ico", "gacha-incu-ico"].forEach((id) => {
      const el = $(id);
      if (!el) return;
      el.innerHTML = Art().eggSVG(tierOf(icoRar));
      el.style.opacity = live.length ? "1" : ".45";
      el.style.setProperty("--rc", colOf(icoRar));
    });
    const sub = $("incu-sitem-sub");
    if (sub) {
      sub.textContent = !live.length ? "empty" : ready ? "READY TO HATCH!" : next != null ? `${live.length} egg${live.length > 1 ? "s" : ""} · next hatch in ${next}` : "❄️ frozen";
      sub.classList.toggle("incu-ready", ready);
    }
    const bd = $("btn-bd-battle");
    if (bd) bd.classList.toggle("incu-dot", ready);
    const s = $("gacha-incu-s"), rowEl = $("gacha-incu-row");
    if (s && rowEl) {
      const s0 = S();
      const free = R().freeSlot(s0.eggs, s0.s2), gems = loadState().diamonds || 0;
      const used = s0.eggs.filter(Boolean).length, cap = slotState(1) === "open" ? 2 : 1;
      s.textContent = free == null ? `Incubator full (${used}/${cap})` : `30–200 answers · ★ Legendary 10% · ${used}/${cap} slots used`;
      $("gacha-incu-cost").textContent = `💎×${R().CLAIM_COST}`;
      rowEl.classList.toggle("disabled", free == null || gems < R().CLAIM_COST);
    }
  }

  /* ---------------- Claim（Lucky Draw，💎3） ---------------- */
  async function claimEgg() {
    if (claiming) return;
    const s0 = S();
    if (R().freeSlot(s0.eggs, s0.s2) == null && !Incubator._authed()) {
      toast(slotState(1) === "open" ? "🥚 Incubator is full — hatch an egg first." : `🥚 Incubator is full. Slot 2 unlocks at a ${slot2Need()}-day streak.`);
      return;
    }
    claiming = true;
    const rowEl = $("gacha-incu-row");
    if (rowEl) rowEl.classList.add("busy");
    let r;
    try { r = await Incubator.claim(); } finally { claiming = false; if (rowEl) rowEl.classList.remove("busy"); }
    if (r.error === "incubator_full") { toast(slotState(1) === "open" ? "🥚 Incubator is full — hatch an egg first." : `🥚 Incubator is full. Slot 2 unlocks at a ${slot2Need()}-day streak.`); return; }
    if (r.error === "not_enough_diamonds") { toast(`Need 💎${R().CLAIM_COST} — answer quizzes to earn more!`); return; }
    if (r.error) { toast("Couldn't reach the server — no gems were used. Try again."); return; }
    if (typeof Gacha !== "undefined" && Gacha._updateDiamondDisplay) Gacha._updateDiamondDisplay();
    refreshEntries();
    freshSlot = r.slot;
    closeGacha();
    setTimeout(() => open(r.slot), 280);
  }

  /* ---------------- 孵化器頁 ---------------- */
  function open(slot) {
    bind();
    const { eggs } = S();
    if (slot == null) {
      const rdy = [0, 1].find((i) => isReady(eggs[i]) && slotState(i) === "open");
      slot = rdy != null ? rdy : (eggs[sel] || slotState(sel) !== "locked" ? sel : 0);
    }
    sel = slot;
    App._openSheet("sheet-incubator");
    setTimeout(async () => {
      fxPage.resize(); render(); startLoop();
      const e = S().eggs[sel];
      if (e && freshSlot === sel) { freshSlot = null; await needReveal(e); render(); }
      await animateProgress();
    }, 60);
    /* 登入：背景拉 server 最新狀態（例如另一部機答咗題） */
    Incubator.refresh().then(() => { if (isOpen() && !hatching) { render(); refreshEntries(); } }).catch(() => {});
  }

  function arc(cx, cy, r, a0, a1) {
    const p = (a) => [cx + r * Math.cos((a - 90) * Math.PI / 180), cy + r * Math.sin((a - 90) * Math.PI / 180)];
    const [x0, y0] = p(a0), [x1, y1] = p(a1);
    return `M${x0.toFixed(2)} ${y0.toFixed(2)} A${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
  }
  /* 分段環：30 題以內 1 格 = 1 題；多過 30 題 1 格 = 5 題 */
  function drawRing(e, shown) {
    const ring = $("incu-ring");
    if (!e) { ring.innerHTML = ""; return; }
    const k = R().perSeg(e.need), N = Math.ceil(e.need / k), gap = Math.min(4, 120 / N), seg = 360 / N, filled = Math.floor(shown / k);
    let h = "";
    for (let i = 0; i < N; i++) h += `<path data-i="${i}" class="${i < filled ? "on" : "off"}" d="${arc(100, 100, 92, i * seg + gap / 2, (i + 1) * seg - gap / 2)}"/>`;
    ring.innerHTML = h;
  }
  function renderSlots() {
    const { eggs } = S();
    $("incu-slots").innerHTML = [0, 1].map((i) => {
      const e = eggs[i], st = slotState(i);
      const status = st === "locked" ? `🔒 ${slot2Need()}-day streak` : st === "frozen" ? "❄️ Frozen" : !e ? "Empty" : isReady(e) ? "🐣 Ready!" : `${e.need - e.progress} to go`;
      return `<button class="incu-slot-btn ${i === sel ? "on" : ""} ${st}" data-slot="${i}" type="button">
        <span class="incu-ico" style="--rc:${e ? colOf(e.rarity) : "#999"};opacity:${e ? 1 : 0.35}">${Art().eggSVG(e ? tierOf(e.rarity) : "plain")}</span>
        <span class="t"><b>Slot ${i + 1}</b><small>${status}</small></span></button>`;
    }).join("");
    $("incu-slots").querySelectorAll("button").forEach((b) => {
      b.addEventListener("click", async () => { if (hatching) return; sel = +b.dataset.slot; Snd.tick(2); render(); await animateProgress(); });
    });
  }
  function setStageUI(e, shown) {
    const st = R().stageOf(shown, e.need);
    scene.dataset.stage = String(st);
    $("incu-chip").textContent = `${STAGES[st].icon} ${STAGES[st].name}`;
    const left = Math.max(0, e.need - shown);
    $("incu-left").textContent = String(left);
    $("incu-left-t").textContent = left ? (left === 1 ? "MORE ANSWER TO HATCH" : "MORE ANSWERS TO HATCH") : "READY TO HATCH!";
    $("incu-sub").textContent = `${shown} / ${e.need} correct answers`;
    Art().showCracks($("incu-egg"), [0, 1, 2, 4, 4][st]);
    $("incu-egg").querySelector(".leak").style.opacity = String([0, 0.1, 0.3, 0.7, 1][st]);
    $("incu-track-fill").style.width = `calc((100% - 28px) * ${Math.min(1, shown / e.need)})`;
    $("incu-track").querySelectorAll(".st").forEach((el, i) => { el.classList.toggle("done", i < st); el.classList.toggle("cur", i === st); });
    return st;
  }
  function render() {
    if (!bound) return;
    renderSlots();
    const s0 = S(), e = s0.eggs[sel], st = slotState(sel), go = $("incu-go"), empty = $("incu-empty");
    scene.dataset.frozen = st === "frozen" ? "1" : "0";
    if (window.gsap) gsap.set("#incu-need", { opacity: 0 });
    const show = !!e;
    ["incu-chip", "incu-tier", "incu-track"].forEach((id) => { $(id).style.visibility = show ? "visible" : "hidden"; });
    sheet.querySelector(".incu-stagebox").style.visibility = show ? "visible" : "hidden";
    sheet.querySelector(".incu-count").style.visibility = show ? "visible" : "hidden";
    go.classList.remove("ready"); go.disabled = false;
    $("incu-discard").hidden = !e || isReady(e);
    if (!e) {
      scene.dataset.stage = "0";
      empty.hidden = false;
      if (st === "locked") {
        const streak = s0.streak || 0, need = slot2Need();
        empty.innerHTML = `<div class="lock">🔒</div><p><b>Slot 2</b> unlocks at a <b>${need}-day</b> answer streak${s0.s2.ever ? "" : ` <small>(first time only — after that, ${R().SLOT2_AGAIN} days)</small>`}.</p>
          <div class="incu-streak"><i style="width:${Math.min(100, streak / need * 100)}%"></i></div><p class="sm">Your streak: <b>${streak}</b> / ${need} days</p>`;
        $("incu-hint").innerHTML = "With 2 eggs, <b>every correct answer warms both</b>.";
        go.textContent = "▶ Answer questions"; go.dataset.act = "quiz";
      } else {
        empty.innerHTML = `<div class="ghost"></div><p>This slot is empty.<br>Claim an egg in <b>Lucky Draw</b> for 💎${R().CLAIM_COST}.</p>`;
        $("incu-hint").innerHTML = "Common 30 · Rare 80 · Epic 140 · <b>Legendary 200</b> answers";
        go.textContent = `💎 Claim an egg (×${R().CLAIM_COST})`; go.dataset.act = "draw";
      }
      return;
    }
    empty.hidden = true;
    const tier = tierOf(e.rarity), col = colOf(e.rarity), eg = $("incu-egg");
    eg.dataset.type = tier; eg.style.setProperty("--rc", col);
    eg.querySelectorAll("svg").forEach((s) => s.remove());
    eg.insertAdjacentHTML("afterbegin", Art().eggSVG(tier));
    $("incu-tier").textContent = `${Art().EGG_NAME[e.rarity]} · ${Art().RAR_NAME[e.rarity]}`;
    $("incu-tier").style.setProperty("--rc", col);
    scene.style.setProperty("--rc", col);
    const seen = Math.min(e.seen || 0, e.progress);
    drawRing(e, seen); setStageUI(e, seen);
    if (st === "frozen") {
      $("incu-chip").textContent = "❄️ Frozen";
      $("incu-left-t").textContent = "PAUSED — PROGRESS IS SAFE";
      $("incu-hint").innerHTML = `Your streak broke. Answer <b>${R().SLOT2_AGAIN} days in a row</b> to thaw this egg (${Math.min(s0.streak || 0, R().SLOT2_AGAIN)}/${R().SLOT2_AGAIN}).`;
      go.textContent = "▶ Answer questions"; go.dataset.act = "quiz";
      return;
    }
    const both = [0, 1].filter((i) => s0.eggs[i] && slotState(i) === "open" && !isReady(s0.eggs[i])).length > 1;
    const rn = Art().RAR_NAME[e.rarity];
    $("incu-hint").innerHTML = isReady(e) ? `A <b>${rn}</b> Pokémon is inside — which one?` :
      `A <b>${rn}</b> Pokémon is inside!${both ? " · Each answer warms <b>both eggs</b>" : ""}<br><small class="incu-note">Only built-in questions count — your own imported questions don't.</small>`;
    if (isReady(e)) { go.classList.add("ready"); go.textContent = "🐣 HATCH NOW!"; go.dataset.act = "hatch"; }
    else { go.textContent = "▶ Answer questions"; go.dataset.act = "quiz"; }
  }
  function banner(txt) {
    const b = $("incu-banner"); b.textContent = txt;
    gsap.timeline().fromTo(b, { opacity: 0, y: -10 }, { opacity: 1, y: 0, duration: 0.3 }).to(b, { opacity: 0, duration: 0.4, delay: 1.8 });
  }

  /* 打開頁面：上次之後新答啱嘅格逐格亮起 */
  async function animateProgress() {
    const e = S().eggs[sel];
    if (!e) return;
    if (slotState(sel) === "frozen") { Snd.ice(); return; }
    const from = Math.min(e.seen || 0, e.progress), to = Math.min(e.need, e.progress), k = R().perSeg(e.need), mySel = sel;
    if (to > from) {
      spdBegin();
      try {
        await sleep(400);
        let st = R().stageOf(from, e.need);
        const steps = to - from, stepBy = Math.max(1, Math.ceil(steps / 40));
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
            const ec = centerIn($("incu-egg"), $("incu-fx"));
            fxPage.burst(ec.x, ec.y, 30, ["#fff", "#ffd93c"], 6, { kind: "star", size: 3, life: 50, g: 0 });
            gsap.fromTo("#incu-egg", { scale: 1.15 }, { scale: 1, duration: 0.5, ease: "elastic.out(1.3,.35)" });
            await sleep(500);
          }
          if (v >= to) break;
          await sleep(Math.max(45, 200 - (v - from) / stepBy * 10));
        }
        drawRing(e, to);
      } finally { spdEnd(); }
    }
    Incubator.markSeen(sel, to);
    refreshEntries(); renderSlots();
    if (R().stageOf(to, e.need) === 3) Snd.heartbeat();
    if (isReady(e)) render();
  }

  /* 新蛋：題數拉霸（30 → 80 → 140 → 200 輪住閃，越轉越慢，停喺呢隻蛋嘅數） */
  async function needReveal(e) {
    const box = $("incu-need"), nEl = $("incu-need-n"), rEl = $("incu-need-r"), cap = $("incu-need-cap");
    const seq = ["normal", "rare", "epic", "legend"], NEED = R().NEED, RN = Art().RAR_NAME;
    box.className = "incu-need"; cap.textContent = ""; nEl.textContent = "?"; rEl.textContent = "";
    spdBegin();
    try {
      await gsap.to(box, { opacity: 1, duration: 0.3 });
      Snd.riser(1.6);
      const target = seq.indexOf(e.rarity), total = 12 + target;
      for (let k = 0; k <= total; k++) {
        if (!isOpen()) return;
        const r = seq[k % 4];
        nEl.textContent = String(NEED[r]); rEl.textContent = RN[r]; box.dataset.r = r;
        Snd.tick(k);
        gsap.fromTo(nEl, { scale: 1.25 }, { scale: 1, duration: 0.2, ease: "back.out(3)" });
        await sleep(70 + Math.pow(k / total, 3) * 520);
      }
      const lv = R().HATCH_LV[e.rarity];
      box.classList.add("n-" + e.rarity);
      cap.textContent = { normal: "A quick one — hatches today!", rare: "✨ A RARE egg!", epic: "🔥 AN EPIC EGG!!", legend: "🌈 200!!! A LEGENDARY EGG!!!" }[e.rarity];
      Snd.fanfare(lv);
      const c = centerIn(nEl, $("incu-fx"));
      fxPage.burst(c.x, c.y, 20 + lv * 25, lv >= 4 ? ["#ff6b6b", "#ffd93c", "#6bff9b", "#6bc5ff", "#c77dff"] : [colOf(e.rarity), "#fff"], 7,
        { kind: lv >= 3 ? "confetti" : "star", size: 3.5, life: 90, g: lv >= 3 ? 0.08 : 0, up: 2 });
      if (lv >= 3) gsap.fromTo(".incu-view", { x: -(lv * 3) }, { x: 0, duration: 0.6, ease: "elastic.out(1.3,.25)" });
      await gsap.fromTo(nEl, { scale: 1.8 }, { scale: 1, duration: 0.6, ease: "elastic.out(1.2,.35)" });
      await sleep(1500);
      await gsap.to(box, { opacity: 0, duration: 0.3 });
    } finally { spdEnd(); }
  }

  /* ---------------- 丟棄蛋（confirm-box） ---------------- */
  function askDiscard() {
    const e = S().eggs[sel];
    if (!e || isReady(e) || hatching) return;
    const relock = sel === 1 && slotState(1) !== "open";
    const rn = Art().RAR_NAME[e.rarity];
    App.showModal(`
      <div class="confirm-box">
        <p>Discard this <b>${rn}</b> egg?</p>
        <p class="settings-note">Progress <b>${e.progress} / ${e.need}</b> will be lost. The 💎${R().CLAIM_COST} is not refunded.${relock ? `<br>Slot 2 stays locked until a ${slot2Need()}-day streak.` : ""}</p>
        <div class="confirm-row">
          <button id="incu-discard-yes" class="btn-big btn-danger">DISCARD</button>
          <button id="incu-discard-no" class="btn-big btn-plain">KEEP</button>
        </div>
      </div>`, true);
    $("incu-discard-no").onclick = () => App.closeModal();
    $("incu-discard-yes").onclick = async () => {
      App.closeModal();
      const slot = sel, eg = $("incu-egg");
      const ok = await Incubator.discard(slot);
      if (!ok) { toast("Couldn't discard the egg — check your connection and try again."); return; }
      Snd.sad();
      await gsap.timeline()
        .to(eg, { rotate: -8, duration: 0.08, yoyo: true, repeat: 3 })
        .to(eg, { y: "40%", opacity: 0, scale: 0.7, duration: 0.55, ease: "power2.in" });
      const c = centerIn(eg, $("incu-fx"));
      fxPage.burst(c.x, c.y + c.h * 0.4, 18, ["rgba(200,190,170,.7)", "rgba(160,150,140,.6)"], 3, { kind: "spark", size: 4, life: 40, g: -0.02 });
      gsap.set(eg, { clearProps: "transform,opacity" });
      refreshEntries(); render();
      toast("🥚 Egg discarded — the slot is free.");
    };
  }

  function tapEgg() {
    const e = S().eggs[sel];
    if (!e || hatching) return;
    const eg = $("incu-egg"), frozen = slotState(sel) === "frozen", st = +scene.dataset.stage;
    eg.classList.remove("tap"); void eg.offsetWidth; eg.classList.add("tap");
    setTimeout(() => eg.classList.remove("tap"), 520);
    if (frozen) Snd.ice(); else if (st >= 2) Snd.crack(st - 2); else Snd.wobble();
    const b = $("incu-bubble");
    b.textContent = frozen ? "Brrr… it's frozen solid." : STAGES[st].say;
    gsap.killTweensOf(b);
    gsap.timeline().fromTo(b, { opacity: 0, y: 6 }, { opacity: 1, y: 0, duration: 0.2 }).to(b, { opacity: 0, duration: 0.3, delay: 1.3 });
    const c = centerIn(eg, $("incu-fx"));
    fxPage.burst(c.x, c.y - c.h * 0.2, 6 + st * 6, frozen ? ["#d8f1ff", "#fff"] : [colOf(e.rarity), "#fff"], 2 + st, { kind: "star", size: 2.5, life: 34, g: 0 });
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
    const e = S().eggs[sel];
    if (!e || !isOpen()) return;
    const frozen = slotState(sel) === "frozen", st = +scene.dataset.stage, rate = frozen ? 3 : [1.1, 4, 9, 18, 26][st];
    if (now - lastSpawn < 1000 / rate) return;
    lastSpawn = now;
    const c = centerIn($("incu-egg"), $("incu-fx"));
    if (frozen) { fxPage.add({ x: Math.random() * fxPage.w, y: -10, vx: (Math.random() - 0.5) * 0.4, vy: 0.5 + Math.random() * 0.6, g: 0, max: 400, size: 10 + Math.random() * 8, kind: "txt", ch: "❄", color: "rgba(220,240,255,.8)", drag: 1 }); return; }
    if (st === 0) { fxPage.add({ x: c.x + c.w * 0.25, y: c.y - c.h * 0.45, vx: 0.35 + Math.random() * 0.2, vy: -0.45, g: 0, max: 110, size: 12 + Math.random() * 8, kind: "txt", ch: "z", color: "rgba(200,215,255,.85)", drag: 1 }); return; }
    const hot = ["#ffb13b", "#ff7a3c", "#ff5a3c", "#ffe27a"][st - 1];
    fxPage.add({ x: c.x + (Math.random() - 0.5) * c.w * 1.4, y: c.y + c.h * 0.45, vx: (Math.random() - 0.5) * 0.4, vy: -0.6 - Math.random() * (st * 0.5), g: -0.004, max: 70 + Math.random() * 50, size: 1.6 + Math.random() * 2 + st * 0.3, color: hot, drag: 0.995 });
    if (st >= 3 && Math.random() < 0.5) fxPage.add({ x: c.x + (Math.random() - 0.5) * c.w * 0.5, y: c.y - c.h * 0.1, vx: (Math.random() - 0.5) * 1.5, vy: -1 - Math.random() * 1.5, g: 0.02, max: 40, size: 2.5, kind: "star", color: colOf(e.rarity), rot: Math.random() * 6, vr: 0.2 });
    if (st === 4 && Math.random() < 0.08) fxPage.burst(c.x, c.y, 12, ["#fff", "#ffd93c"], 4, { kind: "star", size: 2.5, life: 34, g: 0 });
  }
  /* 粒子 loop 只喺 sheet／小視窗開住（或者仲有粒子）時跑 */
  function startLoop() {
    if (loopOn) return;
    loopOn = true;
    const tick = (now) => {
      spawnStage(now); fxPage.step(); fxPop.step();
      if (isOpen() || $("incu-hatch").classList.contains("show") || fxPage.ps.length || fxPop.ps.length) requestAnimationFrame(tick);
      else { loopOn = false; fxPage.ps.length = 0; }
    };
    requestAnimationFrame(tick);
  }

  /* ---------------- 孵蛋（結算小視窗／孵化器頁） ---------------- */
  async function hatchSlot(i, src) {
    bind();
    const e = S().eggs[i];
    if (!e || hatching || !isReady(e)) return;
    hatching = true;
    try {
      const egg = { ...e };
      const got = await Incubator.hatch(i).catch((err) => { console.warn("[Incubator] hatch failed:", err); return null; });
      if (!got) { toast("Couldn't hatch right now — your egg is safe. Try again."); return; }
      refreshEntries();
      if (src === "page") { App._closeSheet("sheet-incubator"); await sleep(260); }
      await playHatch(egg, got);
      await showResultCard(got, egg.rarity, egg.need);
    } finally {
      hatching = false;
      spdEnd();
      const pop = $("incu-hatch");
      if (pop) pop.classList.remove("show");
      refreshEntries();
      if (App.renderHome) App.renderHome();
    }
  }
  async function playHatch(e, got) {
    const rar = e.rarity, tier = tierOf(rar), col = colOf(rar), lv = R().HATCH_LV[rar];
    const cur = entryCurrentSpecies(got.entry), dex = cur[0];
    const pop = $("incu-hatch"), win = $("ih-win"), eg = $("ih-egg"), mon = $("ih-mon"), name = $("ih-name");
    spdBegin();
    if (window.AnimSpeed && AnimSpeed.badge) AnimSpeed.badge(win);
    win.style.setProperty("--rc", col);
    win.style.setProperty("--ray", ["#ffffff", "#7fb8ff", "#7fb8ff", "#ffc93c", "#ffffff"][lv]);
    win.classList.toggle("rainbow", lv >= 4);
    $("ih-title").innerHTML = `Your egg is hatching!<small>${e.need}-ANSWER ${Art().EGG_NAME[rar]}</small>`;
    const sv = Art().eggSVG(tier);
    eg.dataset.type = tier; eg.style.setProperty("--rc", col);
    eg.innerHTML = `<div class="ep p-top">${sv}</div><div class="ep p-bl">${sv}</div><div class="ep p-br">${sv}</div><div class="leak"></div>`;
    gsap.set(eg.querySelectorAll(".ep"), { x: 0, y: 0, rotate: 0, opacity: 1 });
    gsap.set(eg, { rotate: 0, scale: 1, opacity: 1 });
    gsap.set([".ih-rays", ".ih-halo", ".ih-dim", ".ih-flash", "#ih-name"], { opacity: 0 });
    gsap.set(".ih-nest-back, .ih-nest-front", { opacity: 1 });
    mon.className = "ih-mon"; gsap.set(mon, { opacity: 0, scale: 0.3 });
    mon.onerror = () => { mon.onerror = null; mon.src = spriteURL(dex); };
    mon.src = artworkURL(dex);
    name.textContent = cur[1];
    try { if (typeof Pokedex !== "undefined" && Pokedex.prepareCry) Pokedex.prepareCry(dex); } catch (err) { /* audio unavailable */ }
    pop.classList.add("show"); fxPop.resize(); startLoop();
    await gsap.fromTo(win, { scale: 0.6, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.45, ease: "back.out(1.7)" });

    const wob = 2 + lv;
    for (let k = 0; k < wob; k++) {
      Snd.wobble(); Snd.crack(Math.min(3, k));
      Art().showCracks(eg, Math.min(4, k + 1));
      gsap.to(eg.querySelector(".leak"), { opacity: (k + 1) / wob, duration: 0.2 });
      await gsap.to(eg, { rotate: (k % 2 ? -1 : 1) * (8 + lv * 2), duration: 0.09, yoyo: true, repeat: 3, ease: "sine.inOut" });
      gsap.set(eg, { rotate: 0 });
      const c = centerIn(eg, $("ih-fx"));
      fxPop.burst(c.x, c.y, 6 + k * 3, [col, "#fff"], 3 + k, { life: 26, g: 0 });
      await sleep(Math.max(120, 380 - lv * 50));
    }
    if (lv >= 2) {
      const d = 0.8 + lv * 0.25;
      Snd.riser(d);
      if (lv >= 3) Snd.heartbeat();
      await Promise.all([
        gsap.to(".ih-dim", { opacity: 0.35 + lv * 0.12, duration: d, ease: "power2.in" }),
        gsap.to(eg, { rotate: 5, duration: 0.05, yoyo: true, repeat: Math.round(d / 0.05), ease: "none" }),
        gsap.to(".ih-halo", { opacity: 0.5, scale: 1.2, duration: d })
      ]);
      gsap.set(eg, { rotate: 0 });
    }
    await sleep(150 + lv * 90);
    Snd.burst(lv);
    const c = centerIn(eg, $("ih-fx"));
    gsap.fromTo(".ih-flash", { opacity: 1 }, { opacity: 0, duration: 0.5 + lv * 0.15 });
    if (lv >= 2) gsap.fromTo(win, { x: -(lv * 4) }, { x: 0, duration: 0.6, ease: "elastic.out(1.3,.25)" });
    const [pt, pl, pr] = eg.querySelectorAll(".ep"), sz = eg.offsetWidth;
    gsap.to(pt, { y: -sz * 1.2, x: sz * 0.1, rotate: -50, opacity: 0, duration: 0.8, ease: "power2.out" });
    gsap.to(pl, { y: sz * 0.4, x: -sz * 0.8, rotate: -35, opacity: 0, duration: 0.8, ease: "power2.out" });
    gsap.to(pr, { y: sz * 0.45, x: sz * 0.8, rotate: 40, opacity: 0, duration: 0.8, ease: "power2.out" });
    gsap.to(eg.querySelector(".leak"), { opacity: 0, duration: 0.3 });
    gsap.to(".ih-dim", { opacity: 0.25, duration: 0.6 });
    gsap.to(".ih-nest-back, .ih-nest-front", { opacity: 0.2, duration: 0.5 });
    gsap.fromTo(".ih-rays", { opacity: 0, scale: 0.3 }, { opacity: [0.35, 0.45, 0.55, 0.65, 0.8][lv], scale: 1, duration: 0.8 });
    gsap.fromTo(".ih-halo", { opacity: 0, scale: 0.3 }, { opacity: 0.9, scale: 1, duration: 0.5 });
    fxPop.burst(c.x, c.y, 30 + lv * 35, [col, "#fff", "#ffd93c"], 6 + lv * 1.5, { life: 60, g: 0.04 });
    fxPop.burst(c.x, c.y, 26, ["#fff6d6", "#f6efd8", "#e0d4b0"], 6, { kind: "confetti", size: 3.5, life: 60, g: 0.14, up: 3 });
    if (lv >= 3) fxPop.burst(c.x, c.y - 30, 40 + lv * 20, ["#ff6b6b", "#ffd93c", "#6bff9b", "#6bc5ff", "#c77dff"], 7, { kind: "confetti", size: 3.5, life: 110, g: 0.08, up: 3, drag: 0.985 });
    await gsap.fromTo(mon, { opacity: 0, scale: 0.3, y: 20 }, { opacity: 1, scale: 1, y: 0, duration: 0.5 + lv * 0.1, ease: "back.out(1.6)" });
    if (lv >= 4) { Snd.heartbeat(); await sleep(450); }
    await sleep(350 + lv * 150);
    gsap.fromTo(".ih-flash", { opacity: 0.9 }, { opacity: 0, duration: 0.5 });
    mon.classList.add("color");
    try { Pokedex.playCry(dex); } catch (err) { /* audio unavailable */ }
    Snd.fanfare(lv);
    gsap.fromTo(mon, { scale: 1.2 }, { scale: 1, duration: 0.6, ease: "elastic.out(1.2,.4)" });
    fxPop.burst(c.x, c.y, 30 + lv * 10, [col, "#fff"], 6, { kind: "star", size: 3, life: 60, g: 0 });
    await gsap.fromTo(name, { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.35 });
    await sleep(1300);
    spdEnd();
    pop.classList.remove("show");
    await sleep(320);
  }

  /* 真 #gacha-inspect 結果卡，掣改 Done；Done（或者 Esc／其他路徑收埋張卡）先 resolve */
  function showResultCard(got, rarity, need) {
    return new Promise((resolve) => {
      const insp = Gacha._ensureInspect(), cfg = GACHA_BALL[rarity] || { ray: "#cfd8dc", label: "COMMON" };
      const entry = got.entry, cur = entryCurrentSpecies(entry), dex = cur[0];
      insp.dataset.rarity = rarity;
      insp.querySelector(".gi-rays").style.setProperty("--ray", cfg.ray);
      const rb = insp.querySelector(".gi-rarity");
      rb.textContent = cfg.label; rb.style.background = rarity === "normal" ? "#8d9aa5" : "";
      const art = insp.querySelector(".gi-art");
      art.onerror = () => { art.onerror = null; art.src = spriteURL(dex); };
      art.src = artworkURL(dex); art.alt = cur[1];
      insp.querySelector(".gi-name").textContent = cur[1];
      const stars = rarity === "legend" ? "★★★" : rarity === "epic" ? "★★" : rarity === "rare" ? "★" : "☆";
      insp.querySelector(".gi-meta").innerHTML = `No.${String(dex).padStart(3, "0")} ・ Lv.${entry.level} ・ ${stars}<div class="gi-hatched">🥚 Hatched from a ${need}-answer egg</div>`;
      const de = dexOf(dex), types = (de && de.types) || [];
      insp.querySelector(".gi-types").innerHTML = types.map((t) => `<span class="gi-type" style="background:${typeColor(t)}"><img src="${typeIconURL(t)}" alt="" onerror="this.remove()">${typeLabel(t).toUpperCase()}</span>`).join("");
      const stats = statsForEntry(entry);
      insp.querySelector(".gi-stats").innerHTML = stats ? STAT_KEYS.map((k) => `<div class="gi-stat"><b>${stats[k]}</b><span>${STAT_LABELS[k]}</span></div>`).join("") : "";
      const note = insp.querySelector(".gi-note");
      if (got.isDupe) { note.className = "gi-note"; note.textContent = `Already have it! ⚡ EV point +1${got.candyGain ? " ・ 🍬 Candy +1" : ""}`; }
      else { note.className = "gi-note new"; note.textContent = "NEW! Registered to your Pokédex."; }
      const again = insp.querySelector(".gi-again");
      again.hidden = true;
      const done = document.createElement("button");
      done.className = "btn-big btn-primary gi-incu-done"; done.type = "button"; done.textContent = "Done";
      insp.querySelector(".gi-actions").appendChild(done);
      let finished = false;
      const finish = () => {
        if (finished) return;
        finished = true;
        mo.disconnect();
        done.remove(); again.hidden = false; rb.style.background = "";
        if (got.newlyUnlockedGen) { App._pendingGenUnlock = got.newlyUnlockedGen; App.maybeShowGenUnlock(); }
        if (got.firstExpEvolve && App.showEvolveModal) App.showEvolveModal(got.firstExpEvolve);
        resolve();
      };
      /* Esc（Keys → App.closeGachaSheet → Gacha.abort）會收埋張卡：一樣當 Done */
      const mo = new MutationObserver(() => { if (insp.classList.contains("hidden")) finish(); });
      done.addEventListener("click", () => {
        insp.classList.remove("show");
        setTimeout(() => { insp.classList.add("hidden"); finish(); }, 450);
      });
      insp.classList.remove("hidden");
      requestAnimationFrame(() => { insp.classList.add("show"); mo.observe(insp, { attributes: true, attributeFilter: ["class"] }); try { done.focus(); } catch (e) { /* ignore */ } });
      setTimeout(() => { try { Pokedex.playCry(dex); } catch (e) { /* audio unavailable */ } }, 350);
    });
  }

  /* ---------------- 結算：addRound 結果返嚟 → 2.4 秒後逐隻彈孵蛋小視窗（離開結算頁就停） ---------------- */
  function afterRound(readyPromise) {
    Promise.resolve(readyPromise).then((ready) => {
      refreshEntries();
      if (!ready || !ready.length) return;
      setTimeout(async () => {
        for (const i of ready) {
          const v = $("view-settlement");
          if (!v || !v.classList.contains("active")) break;
          await hatchSlot(i, "settle");
        }
      }, 2400);
    }).catch(() => {});
  }

  bind();
  return { open, refreshEntries, hatchSlot, afterRound, isHatching: () => hatching };
})();

Object.assign(globalThis, { IncubatorUI });
