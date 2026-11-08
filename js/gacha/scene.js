/* ============================================================
   PokeEngmon - Gacha：單抽演出（跌波、Scene B 時間線、檢視卡、再抽、清場）
   由 js/gacha.js 拆出（總計劃 P2.5；Rule 116）。同 js/gacha.js 共用同一個 Gacha 物件：
   Object.assign 只係將方法掛返上去，this／Gacha.xxx 用法完全唔變。
   載入次序：js/gacha.js 之後（index.html）。
   ============================================================ */

Object.assign(Gacha, {
  _ballHTML() {
    return `<span class="pb-top"></span><span class="pb-bottom"></span><span class="pb-mid"></span><span class="pb-btn"></span><span class="pb-shine"></span>`;
  },

  /* 背景 A overlay（lazy 建立，fixed 掛 body 避免 containing block 問題） */
  _ensureSceneB() {
    if (this._sceneB) return this._sceneB;
    const el = document.createElement("div");
    el.id = "gacha-scene-b";
    el.className = "hidden";
    el.innerHTML = `
      <div class="gsb-bg">
        <i class="gsb-wave w1"></i><i class="gsb-wave w2"></i><i class="gsb-wave w3"></i>
        <i class="gsb-horizon"></i>
        <div class="gsb-particles"></div>
      </div>
      <div class="gsb-spot"></div>
      <div class="gsb-stage">
        <div class="gsb-ball-wrap"></div>
        <div class="gsb-rings"></div>
        <div class="gsb-magic hidden"></div>
        <div class="gsb-beam"></div>
      </div>
      <div class="gsb-flash"></div>
      <div class="gsb-prompt"></div>`;
    document.body.appendChild(el);
    this._sceneB = el;
    return el;
  },

  /* ============================================================
     v2「快龍空投」單抽（spec §4；prototype tools/prototype/gacha-v2-prototype.html）
     大掣 → _beginPull（扣 3 寶石＋server RPC 背景跑）→ 快龍飛近（遮住 RPC 延遲）→ 擲波 → 落地
     → 升級／tease → 撳 3 下 → riser＋靜默 → 爆發 → 剪影 → 上色 → _revealInspect
     經濟結算同演出解耦：任何時候 abort()／SKIP 都唔影響已扣鑽／派寵。
     ============================================================ */

  /* 大堂：1×／10× 大掣（只綁一次）＋idle 快龍 rig（拍翼、手攬住一粒 Great Ball） */
  _bindLobby() {
    if (!this._lobbyBound) {
      this._lobbyBound = true;
      const b1 = document.getElementById("btn-gacha-1");
      const b10 = document.getElementById("btn-gacha-10");
      if (b1) b1.onclick = () => this.pullOne();
      if (b10) b10.onclick = () => this.pullTen();
    }
    const host = document.getElementById("gacha-lobby-rig");
    if (!host || !window.DragoniteRig || !window.GachaFX) return;
    if (!this._lobbyRig) {
      this._lobbyRig = DragoniteRig.make(host);
      this._lobbyRig.speed(.6);
    } else if (this._lobbyRig.flapTl) {
      this._lobbyRig.flapTl.resume();
    }
    requestAnimationFrame(() => {
      if (!this._lobbyRig) return;
      this._lobbyRig.hold(GachaFX.makeBall("great", Math.max(10, host.offsetWidth * .17)));
    });
  },

  /* 大掣：唔夠鑽 → 掣震一下＋提示（唔扣鑽） */
  pullOne() {
    if (this.busy) return;
    if (!this._canPull()) { this._poorButton("btn-gacha-1"); return; }
    this._triggerPull();
  },
  pullTen() {
    if (this.busy) return;
    if (!this._canMultiPull()) { this._poorButton("btn-gacha-10"); return; }
    this._triggerMultiPull();
  },
  _poorButton(id) {
    const b = document.getElementById(id);
    if (b) { b.classList.remove("shake"); void b.offsetWidth; b.classList.add("shake"); }
    this._haptic(40);
    this._prompt("Not enough gems — earn more in quizzes!");
  },

  /* 單抽主時間線 */
  async _triggerPull() {
    if (this.busy) return;
    if (!this._beginPull()) { this._refreshControls(); return; }
    const flow = this._flow;
    const fid = flow.id, seq = ++this._s2seq;
    const live = () => fid === this._flowId && seq === this._s2seq;
    this.phase = "stage";
    document.getElementById("view-gacha").classList.add("playing");
    this._prompt("");
    const audio = this._audio();
    if (audio) audio.pullSnap();
    this._haptic(20);
    this._spdBegin();
    if (this._lobbyRig && this._lobbyRig.flapTl) this._lobbyRig.flapTl.pause();

    /* 經濟結算同步開始：快龍飛近嗰 ~2.5 秒就係 RPC 嘅時間 */
    const settling = this._settleResult(flow).catch((err) => { console.error("[Gacha] settlement failed", err); return null; });

    const st = this._ensureStage();
    this._stageOpen();
    const held = await this._flyIn(live);
    const s = await settling;
    if (!live()) return;
    if (!s) {
      /* 結算失敗：收場、解鎖，唔可以卡死 */
      this._stageClose(true);
      this.busy = false;
      this._flow = null;
      this._resetStage();
      this._refreshControls();
      this._prompt("Something went wrong — try again.");
      return;
    }
    const rarity = this._visualRarity(s);
    const plan = GachaTells.plan(rarity);
    GachaFX.setBallType(held, plan.start);

    await this._windAndThrow(live);
    if (!live()) return;
    const size = Math.round(st.clientWidth * .3);
    const ball = this._releaseHeld(held, plan.start, size);
    this._track(this._exitRig());
    await this._arcTo(ball, plan.trail, live);
    if (!live()) return;
    await this._landBall(ball, live);
    if (!live()) return;
    await this._upgradeBall(ball, plan, live);
    if (!live()) return;
    await this._tapPhase(ball, rarity, live);
    if (!live()) return;
    await this._burstReveal(ball, s, rarity, live);
    if (!live()) return;
    this._revealInspect(flow, s);
  },

  /* SKIP：作廢時間線，等結算（通常已完成）就直接出檢視卡 */
  async _skipStage() {
    const flow = this._flow;
    if (!flow || flow.multi) return;
    this._s2seq++;
    this._stageClear();
    const s = await this._settleResult(flow).catch(() => null);
    if (flow !== this._flow) return;
    if (!s) { this.abort(); return; }
    this._revealInspect(flow, s);
  },

  /* ---------- 演出 overlay（display window；lazy 掛 body） ---------- */
  _ensureStage() {
    if (this._stage) return this._stage;
    const el = document.createElement("div");
    el.id = "gacha-stage2";
    el.className = "hidden";
    el.innerHTML = `
      <div class="gs2-night"><div class="gs2-twinkle"></div></div>
      <div class="gs2-ground"></div>
      <div class="gs2-ring"></div>
      <div class="gs2-gshadow"></div>
      <div class="gs2-dim"></div>
      <div class="gs2-rays"></div>
      <div class="gs2-rig"></div>
      <div class="gs2-balls"></div>
      <div class="gs2-reveal">
        <div class="gs2-halo"></div><div class="gs2-pillar"></div>
        <div class="gs2-monwrap"><img class="gs2-mon" alt=""></div>
        <div class="gs2-stars"></div>
        <div class="gs2-name"><span class="gs2-rlabel"></span><b class="gs2-rname"></b></div>
        <div class="gs2-stamp"></div>
      </div>
      <canvas class="gs2-fx"></canvas>
      <div class="gs2-flash"></div>
      <div class="gs2-callout"></div>
      <div class="gs2-hint"></div>
      <button class="gs2-skip" type="button">SKIP ⏭</button>`;
    document.body.appendChild(el);
    const tw = el.querySelector(".gs2-twinkle");
    for (let i = 0; i < 50; i++) {
      const s = document.createElement("i");
      s.style.left = (Math.random() * 100) + "%";
      s.style.top = (Math.random() * 100) + "%";
      s.style.animationDelay = (-Math.random() * 3) + "s";
      tw.appendChild(s);
    }
    el.querySelector(".gs2-skip").addEventListener("click", (e) => { e.stopPropagation(); this._skipStage(); });
    this._stage = el;
    this._stageRig = DragoniteRig.make(el.querySelector(".gs2-rig"));
    this._stageRig.flapTl.pause();
    this._stageFx = GachaFX.makeParticles(el.querySelector(".gs2-fx"));
    GachaFX.ensureDefs();
    return el;
  },
  _q(sel) { return this._stage.querySelector(sel); },
  _W() { return this._stage.clientWidth; },
  _H() { return this._stage.clientHeight; },
  _center(node) {
    const r = node.getBoundingClientRect(), s = this._stage.getBoundingClientRect();
    return { x: r.left - s.left + r.width / 2, y: r.top - s.top + r.height / 2, w: r.width, h: r.height };
  },
  /* 進行中嘅 GSAP timeline：清場時一次過 kill */
  _track(tl) { (this._s2tls = this._s2tls || []).push(tl); return tl; },
  _play(tl) { this._track(tl); return new Promise((res) => tl.eventCallback("onComplete", res)); },
  _wait(ms) { return new Promise((res) => this._setT(res, ms * (this._rm() ? .25 : 1))); },
  _hint(txt) {
    const h = this._q(".gs2-hint");
    h.textContent = txt || "";
    h.classList.toggle("on", !!txt);
  },
  _callout(txt, color) {
    const c = this._q(".gs2-callout");
    c.textContent = txt;
    c.style.setProperty("--rc", color);
    this._track(gsap.timeline()
      .fromTo(c, { opacity: 0, scale: 2.2, rotate: -8 }, { opacity: 1, scale: 1, rotate: -4, duration: .28, ease: "back.out(2.5)" })
      .to(c, { opacity: 0, y: -20, duration: .3, delay: .45 }).set(c, { y: 0 }));
  },
  _shake(px, dur = .5) {
    if (this._rm() || px <= 0) return;
    this._track(gsap.fromTo(this._stage, { x: px * (Math.random() < .5 ? -1 : 1), y: px * .6 },
      { x: 0, y: 0, duration: dur, ease: "elastic.out(1.3,.25)", clearProps: "x,y" }));
  },
  _flashOn(peak = .9, dur = .5) {
    this._track(gsap.fromTo(this._q(".gs2-flash"), { opacity: peak }, { opacity: 0, duration: dur, ease: "power2.out" }));
  },

  _stageOpen() {
    const st = this._ensureStage();
    this._stageClear();
    st.classList.remove("hidden");
    this._stageFx.reduced = this._rm();
    requestAnimationFrame(() => { st.classList.add("show"); this._stageFx.resize(); });
    if (window.AnimSpeed) AnimSpeed.badge(st, this._spd || 1);
    this._stageRig.flapTl.resume();
  },
  /* 清場：kill timeline、tap listener、粒子、球、reveal 狀態（唔隱藏 overlay） */
  _stageClear() {
    (this._s2tls || []).forEach((t) => { try { t.kill(); } catch (e) { /* ignore */ } });
    this._s2tls = [];
    if (this._tapCleanup) { this._tapCleanup(); this._tapCleanup = null; }
    if (!this._stage) return;
    this._stageFx.clear();
    this._q(".gs2-balls").innerHTML = "";
    this._q(".gs2-stars").innerHTML = "";
    this._hint("");
    gsap.set([".gs2-dim", ".gs2-rays", ".gs2-halo", ".gs2-pillar", ".gs2-mon", ".gs2-name", ".gs2-stamp", ".gs2-flash", ".gs2-callout", ".gs2-gshadow", ".gs2-ring"]
      .map((s) => this._q(s)), { clearProps: "all" });
    this._q(".gs2-mon").className = "gs2-mon";
    this._q(".gs2-rays").classList.remove("rainbow");
    const rig = this._stageRig;
    gsap.killTweensOf([rig.el, rig.face, rig.arm, rig.bob]);
    gsap.set(rig.el, { opacity: 0, xPercent: -50, yPercent: -50, rotate: 0, scale: 1, filter: "none" });
    gsap.set([rig.arm, rig.bob], { rotate: 0, scaleX: 1, scaleY: 1 });
    gsap.set(rig.face, { scaleX: 1 }); rig.dir = 1;
    rig.hand.innerHTML = "";
    rig.onDown = null;
    this._stage.style.transform = "";
  },
  _stageClose(instant) {
    const st = this._stage;
    if (!st) return;
    this._stageClear();
    this._stageRig.flapTl.pause();
    st.classList.remove("show");
    if (instant) st.classList.add("hidden");
    else this._setT(() => { if (!st.classList.contains("show")) st.classList.add("hidden"); }, 450);
  },

  /* 幕 2a：快龍由天邊飛近（bezier、轉身、傾側、空氣透視、拍翼聲、飛掠聲）→ 懸停 → 吼 */
  async _flyIn(live) {
    const rig = this._stageRig, el = rig.el, w = this._W(), h = this._H(), audio = this._audio();
    gsap.set(el, { xPercent: -50, yPercent: -50, opacity: 1 });
    const held = rig.hold(GachaFX.makeBall("great", Math.max(10, el.offsetWidth * .17)));
    rig.speed(1.6);
    rig.onDown = () => { if (audio) audio.gachaFlap(Math.min(1, rig.pos.s)); };
    const P = [{ x: w * .78, y: h * .1 }, { x: w * 1.25, y: h * .34 }, { x: -w * .3, y: h * .46 }, { x: w * .5, y: h * .3 }];
    const o = { t: 0 }, sh = this._q(".gs2-gshadow");
    let px = P[0].x, lean = 0, passed = false;
    rig.place(P[0].x, P[0].y, .1, 0, 0);
    await this._play(gsap.timeline().to(o, { t: 1, duration: 2, ease: "sine.inOut", onUpdate: () => {
      const p = DragoniteRig.bez(P, o.t), vx = p.x - px; px = p.x;
      const k = Math.pow(o.t, 1.4), s = .1 + .92 * k;
      lean += (Math.max(-22, Math.min(22, vx * 1.2)) - lean) * .18;
      if (Math.abs(vx) > 1.2) rig.faceTo(vx < 0 ? 1 : -1);
      rig.place(p.x, p.y, s, lean, k);
      gsap.set(sh, { left: p.x, scale: Math.max(.1, s), opacity: Math.min(.85, k * .9) });
      if (!passed && o.t > .5) { passed = true; if (audio) audio.gachaFlyby(); this._shake(3, .4); this._haptic(15); }
    } }));
    if (!live()) return held;
    rig.faceTo(1);
    rig.speed(.8);
    const sx = rig.pos.x;
    rig.onDown = () => { if (audio) audio.gachaFlap(1); this._stageFx.dust(sx, h * .645, 5); };
    try { Pokedex.playCry(149); } catch (e) { /* audio unavailable */ }
    this._haptic(20);
    await this._play(gsap.timeline()
      .to(el, { rotate: 0, filter: DragoniteRig.depthFilter(1), duration: .35, ease: "power2.out" }, 0)
      .fromTo(rig.bob, { scaleY: 1.07, scaleX: .95 }, { scaleY: 1, scaleX: 1, duration: .55, ease: "elastic.out(1.2,.4)" }, 0));
    await this._wait(380);
    return held;
  },

  /* 幕 2b：舉手儲力 → 擲（身體反扭） */
  async _windAndThrow(live) {
    const rig = this._stageRig, audio = this._audio();
    await this._play(gsap.timeline().to(rig.arm, { rotate: 42, duration: .3, ease: "power2.out" }, 0).to(rig.bob, { rotate: 5, duration: .3, ease: "power2.out" }, 0));
    if (!live()) return;
    await this._wait(110);
    if (audio) audio.throwBall();
    this._haptic(15);
    await this._play(gsap.timeline().to(rig.arm, { rotate: -38, duration: .13, ease: "power3.in" }, 0).to(rig.bob, { rotate: -6, duration: .13, ease: "power3.in" }, 0));
    this._track(gsap.timeline().to([rig.arm, rig.bob], { rotate: 0, duration: .6, ease: "elastic.out(1,.45)" }, .05));
  },
  /* 手中波 → 同位置開一粒正式波 */
  _releaseHeld(held, type, size) {
    const c = this._center(held), s0 = held.getBoundingClientRect().width / size;
    held.remove();
    const b = GachaFX.makeBall(type, size);
    this._q(".gs2-balls").appendChild(b);
    gsap.set(b, { xPercent: -50, yPercent: -50, left: c.x, top: c.y, scale: s0 });
    b._from = c;
    return b;
  },
  /* 幕 2c：轉身斜上飛走 */
  _exitRig() {
    const rig = this._stageRig, el = rig.el, w = this._W(), h = this._H(), audio = this._audio();
    const o = { x: rig.pos.x, y: rig.pos.y, s: rig.pos.s, r: 0 }, sh = this._q(".gs2-gshadow");
    return gsap.timeline()
      .call(() => { rig.speed(2); rig.faceTo(-1); rig.onDown = () => { if (audio) audio.gachaFlap(.45); }; }, null, .1)
      .to(o, { x: w * 1.25, y: -h * .22, s: .45, r: -18, duration: 1.15, ease: "power2.in", onUpdate: () => {
        rig.pos = { x: o.x, y: o.y, s: o.s };
        gsap.set(el, { left: o.x, top: o.y, scale: o.s, rotate: o.r });
        gsap.set(sh, { left: o.x, scale: o.s });
      } }, .2)
      .call(() => { if (audio) audio.gachaFlyby(.6); }, null, .35)
      .to(sh, { opacity: 0, duration: .5 }, .25)
      .set(el, { opacity: 0 })
      .call(() => { rig.onDown = null; rig.speed(1); });
  },
  /* 拋物線落地點（地面中間）＋拖光 */
  _arcTo(ball, trail, live) {
    const w = this._W(), h = this._H(), from = ball._from, gx = w / 2, gy = h * .62, d = .9;
    const peak = Math.min(from.y, gy) - h * .09, fx = this._stageFx;
    let t0 = 0;
    return this._play(gsap.timeline()
      .to(ball, { left: gx, duration: d, ease: "none" }, 0)
      .to(ball, { top: peak, duration: d * .38, ease: "power2.out" }, 0)
      .to(ball, { top: gy, duration: d * .62, ease: "power2.in" }, d * .38)
      .to(ball, { scale: 1, rotate: 720, duration: d, ease: "power1.in", onUpdate: () => {   /* 轉兩圈：落地一定正面（540° 會倒轉） */
        if (!live()) return;
        const c = this._center(ball);
        fx.trail(c.x, c.y, trail === "rainbow" ? `hsl(${(t0++ * 15) % 360} 100% 65%)` : trail);
      } }, 0));
  },
  /* 幕 3：落地（hit-stop＋震 overlay＋塵） */
  async _landBall(ball, live) {
    const audio = this._audio(), size = ball.offsetWidth, c = this._center(ball);
    if (audio) audio.impact();
    this._haptic(35);
    this._shake(10, .55);
    this._stageFx.dust(c.x, c.y + size * .45, 22);
    await this._play(gsap.timeline()
      .to(ball, { scaleY: .72, scaleX: 1.22, duration: .07 })
      .to({}, { duration: .08 })
      .to(ball, { scaleY: 1, scaleX: 1, duration: .5, ease: "elastic.out(1.2,.35)" })
      .fromTo(this._q(".gs2-ring"), { opacity: 1, scale: .4 }, { opacity: 0, scale: 1.8, duration: .6, ease: "power2.out" }, 0));
    if (live()) await this._wait(350);
  },
  /* 幕 4：升級（每級一次 sting）／tease */
  async _upgradeBall(ball, plan, live) {
    const audio = this._audio(), size = ball.offsetWidth;
    for (let i = 0; i < plan.ups.length; i++) {
      this._hint(i === 0 ? "…!?" : "AGAIN…!?");
      if (audio) audio.wobble(i + 1);
      this._haptic([15, 30, 15]);
      await this._play(gsap.timeline().to(ball, { rotate: 14, duration: .07, yoyo: true, repeat: 5, ease: "sine.inOut" }).to(ball, { rotate: 0, duration: .05 }));
      if (!live()) return;
      await this._wait(140);
      const type = plan.ups[i], col = GachaTells.BALL_COL[type];
      GachaFX.setBallType(ball, type);
      if (audio) audio.upgradeSting(i + 1);
      this._haptic(40);
      this._flashOn(.85, .45);
      this._shake(6 + i * 3);
      const c = this._center(ball);
      this._stageFx.burst(c.x, c.y, 40 + i * 30, [col, "#ffffff"], 7 + i * 2, { kind: "star", size: 3, life: 55 });
      this._callout(type === "master" ? "MASTER BALL!!" : "UPGRADE!", col);
      await this._play(gsap.timeline()
        .fromTo(ball, { scale: 1.35 }, { scale: 1, duration: .55, ease: "elastic.out(1.3,.35)" })
        .fromTo(ball.querySelector(".gfx-aura"), { opacity: 1, scale: .6 }, { opacity: .45, scale: 1.1, duration: .6 }, 0));
      this._hint("");
      if (!live()) return;
      await this._wait(380);
    }
    if (plan.tease) {
      this._hint("…!?");
      if (audio) audio.wobble(1);
      await this._play(gsap.timeline().to(ball, { rotate: 12, duration: .08, yoyo: true, repeat: 3 }).to(ball, { rotate: 0, duration: .05 }));
      if (audio) audio.gachaFizz();
      const c = this._center(ball);
      this._stageFx.burst(c.x, c.y - size * .3, 12, ["rgba(200,200,220,.6)"], 2, { kind: "dust", g: -.02, life: 40, size: 6 });
      this._hint("…");
      await this._wait(500);
      this._hint("");
    }
  },
  /* 幕 5：撳 3 下開（球附近 1.1× 半徑都算；3 秒冇撳提示；用戶互動手感唔跟倍速） */
  _tapPhase(ball, rarity, live) {
    return new Promise((resolve) => {
      if (!live()) return resolve();
      const st = this._stage, audio = this._audio(), size = ball.offsetWidth, col = GACHA_BALL[rarity].ray;
      ball.classList.add("idle-pulse");
      const flo = gsap.to(ball, { y: -size * .12, duration: 1.1, ease: "sine.inOut", yoyo: true, repeat: -1 });
      this._hint("TAP THE BALL ×3");
      let n = 0, idle = 0;
      const nudge = () => { clearTimeout(idle); idle = setTimeout(() => { if (n < 3) this._hint("TAP! TAP! TAP!"); }, 3000); };
      const cleanup = () => { clearTimeout(idle); st.removeEventListener("pointerdown", onDown); window.removeEventListener("keydown", onKey, true); flo.kill(); gsap.set(ball, { y: 0 }); ball.classList.remove("idle-pulse"); this._hint(""); };
      const onDown = (e) => {
        if (e.target.closest(".gs2-skip")) return;
        const c = this._center(ball), r = st.getBoundingClientRect();
        if (Math.hypot(e.clientX - r.left - c.x, e.clientY - r.top - c.y) > size * 1.1) return;
        tap();
      };
      /* 鍵盤（同捕捉一樣）：Space／Enter = 撳一下；焦點喺 SKIP 時 Enter 先係 SKIP */
      const onKey = (e) => {
        if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
        if (e.key !== " " && e.key !== "Enter") return;
        if (e.key === "Enter" && e.target && e.target.closest && e.target.closest(".gs2-skip")) return;
        e.preventDefault();
        e.stopPropagation();
        tap();
      };
      const tap = () => {
        if (n >= 3) return;
        const c = this._center(ball);
        n++;
        if (audio) audio.gachaCrack(n - 1);
        this._haptic(18 + n * 10);
        ball.querySelectorAll(".c" + n).forEach((p) => { p.style.opacity = "1"; });
        gsap.to(ball.querySelector(".gfx-leak"), { opacity: n / 3, duration: .2 });
        gsap.to(ball.querySelector(".gfx-aura"), { opacity: .4 + n * .2, duration: .2 });
        gsap.fromTo(ball.querySelectorAll(".gfx-hw"), { scaleY: .82, scaleX: 1.12 }, { scaleY: 1, scaleX: 1, duration: .35, ease: "elastic.out(1.5,.3)" });
        this._shake(2 + n * 2, .3);
        this._stageFx.burst(c.x, c.y, 10 + n * 8, [col, "#ffffff"], 3 + n, { life: 30 });
        nudge();
        if (n === 3) { this._tapCleanup = null; cleanup(); setTimeout(resolve, 120); }
      };
      this._tapCleanup = cleanup;   /* SKIP／abort 清場時移除 listener */
      st.addEventListener("pointerdown", onDown);
      window.addEventListener("keydown", onKey, true);
      nudge();
    });
  },
  /* 幕 6–8：riser（球越震越勁）→ 靜默 → 爆發 → 剪影 → 上色 → 星 → 名 → NEW／重複 */
  async _burstReveal(ball, s, rarity, live) {
    const audio = this._audio(), cfg = GACHA_BALL[rarity], col = cfg.ray;
    const legend = rarity === "legend", epic = rarity === "epic", size = ball.offsetWidth, h = this._H();
    const reveal = this._q(".gs2-reveal"), rays = this._q(".gs2-rays");
    reveal.style.setProperty("--rc", col);
    rays.style.setProperty("--rc", col);
    const riseD = legend ? 1.3 : epic ? 1 : .7;
    if (audio) audio.gachaRiser(riseD);
    this._haptic([10, 40, 10, 40, 10]);
    await this._play(gsap.timeline()
      .to(ball, { rotate: 6, duration: .05, yoyo: true, repeat: Math.round(riseD / .05), ease: "none" }, 0)
      .to(ball.querySelector(".gfx-aura"), { opacity: 1, scale: 1.6, duration: riseD }, 0)
      .to(ball.querySelector(".gfx-leak"), { opacity: 1, scaleX: 1.4, scaleY: 2.5, duration: riseD }, 0)
      .to(this._q(".gs2-dim"), { opacity: legend ? .85 : .6, duration: riseD, ease: "power2.in" }, 0));
    if (!live()) return;
    await this._wait(legend ? 420 : 240);   /* 靜默 beat */
    if (!live()) return;

    if (audio) audio.gachaBurst(rarity);
    this._haptic(legend ? [60, 40, 120] : 60);
    this._flashOn(1, legend ? 1.1 : .6);
    this._shake(legend ? 18 : epic ? 12 : 7, legend ? .9 : .6);
    const c = this._center(ball), fx = this._stageFx;
    fx.burst(c.x, c.y, legend ? 140 : epic ? 90 : 50, [col, "#ffffff", legend ? "#ffd93c" : col], legend ? 13 : 10, { life: 70, g: .05 });
    fx.burst(c.x, c.y, legend ? 60 : 24, [col, "#ffffff"], 8, { kind: "star", size: 4, life: 80, g: .02 });
    if (legend || epic) fx.burst(c.x, c.y - 40, legend ? 90 : 40, ["#ff6b6b", "#ffd93c", "#6bff9b", "#6bc5ff", "#c77dff"], 9, { kind: "confetti", size: 4, life: 120, g: .09, up: 4, drag: .985 });
    if (legend) rays.classList.add("rainbow");
    this._track(gsap.timeline()
      .to(ball.querySelector(".gfx-hw.top"), { y: -size * 1.1, x: -size * .4, rotate: -40, opacity: 0, duration: .7, ease: "power2.out" }, 0)
      .to(ball.querySelector(".gfx-hw.bot"), { y: size * .5, x: size * .35, rotate: 25, opacity: 0, duration: .7, ease: "power2.out" }, 0)
      .to(ball.querySelectorAll(".gfx-aura,.gfx-leak,.gfx-shadow"), { opacity: 0, duration: .3 }, 0)
      .to(this._q(".gs2-dim"), { opacity: .35, duration: .6 }, 0)
      .fromTo(rays, { opacity: 0, scale: .3 }, { opacity: legend ? .75 : .5, scale: 1, duration: .8, ease: "power2.out" }, 0)
      .fromTo(this._q(".gs2-halo"), { opacity: 0, scale: .2 }, { opacity: .9, scale: 1, duration: .5, ease: "power2.out" }, 0)
      .fromTo(this._q(".gs2-pillar"), { opacity: 0, height: 0 }, { opacity: .9, height: "80%", duration: .45, ease: "power3.out" }, 0)
      .to(this._q(".gs2-pillar"), { opacity: 0, duration: .8 }, .5));

    /* 剪影 */
    const cur = entryCurrentSpecies(s.entry), dex = cur[0], mon = this._q(".gs2-mon");
    mon.onerror = () => { mon.onerror = null; mon.src = spriteURL(dex); };
    mon.src = artworkURL(dex);
    mon.className = "gs2-mon sil";
    await this._play(gsap.timeline().fromTo(mon, { opacity: 0, scale: .2, y: h * .07 }, { opacity: 1, scale: 1, y: 0, duration: legend ? .9 : .6, ease: "back.out(1.6)" }));
    if (!live()) return;
    if (audio) audio.gachaHeartbeat();
    this._haptic([30, 120, 30]);
    if (legend) { await this._wait(500); if (audio) audio.gachaHeartbeat(); }
    await this._wait(legend ? 700 : epic ? 500 : 300);
    if (!live()) return;

    /* 上色 */
    this._flashOn(.95, .5);
    try { Pokedex.playCry(dex); } catch (e) { /* audio unavailable */ }
    if (audio) audio.gachaFanfare(rarity);
    mon.className = "gs2-mon";
    this._track(gsap.fromTo(mon, { scale: 1.25 }, { scale: 1, duration: .6, ease: "elastic.out(1.2,.4)" }));
    const mc = this._center(mon);
    fx.burst(mc.x, mc.y, 40, [col, "#ffffff"], 6, { kind: "star", size: 3, life: 60 });

    /* 星（同檢視卡一樣：rare ★／epic ★★／legend ★★★） */
    const n = legend ? 3 : epic ? 2 : 1, starsEl = this._q(".gs2-stars");
    starsEl.innerHTML = Array.from({ length: n }, () => "<span>★</span>").join("");
    const spans = starsEl.querySelectorAll("span");
    for (let i = 0; i < spans.length; i++) {
      if (audio) audio.gachaStar(i);
      this._haptic(12);
      this._track(gsap.fromTo(spans[i], { opacity: 0, scale: 3, rotate: -90 }, { opacity: 1, scale: 1, rotate: 0, duration: .35, ease: "back.out(2)" }));
      await this._wait(legend ? 190 : 140);
      if (!live()) return;
    }
    this._q(".gs2-rlabel").textContent = cfg.label;
    this._q(".gs2-rname").textContent = cur[1];
    await this._play(gsap.fromTo(this._q(".gs2-name"), { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: .35, ease: "power2.out" }));
    if (!live()) return;

    /* NEW 印章／重複 */
    const stamp = this._q(".gs2-stamp");
    stamp.className = "gs2-stamp" + (s.isDupe ? " dupe" : "");
    stamp.textContent = s.isDupe ? "DUPLICATE → 🍬+1" : "NEW!";
    if (audio) audio.impact();
    this._haptic(30);
    await this._play(gsap.fromTo(stamp, { opacity: 0, scale: 3, rotate: -30 }, { opacity: 1, scale: 1, rotate: -14, duration: .3, ease: "power4.in" }));
    this._shake(4, .3);
    await this._wait(800);
  },

  /* 檢視卡 overlay（lazy 建立，fixed 掛 body） */
  _ensureInspect() {
    if (this._inspect) return this._inspect;
    const el = document.createElement("div");
    el.id = "gacha-inspect";
    el.className = "hidden";
    el.innerHTML = `
      <div class="gi-rays"></div>
      <div class="gi-card">
        <span class="gi-rarity"></span>
        <img class="gi-art" alt="">
        <div class="gi-name"></div>
        <div class="gi-meta"></div>
        <div class="gi-types"></div>
        <div class="gi-stats"></div>
        <div class="gi-note"></div>
        <div class="gi-actions">
          <button class="btn-big btn-primary gi-again"></button>
        </div>
      </div>`;
    document.body.appendChild(el);
    el.querySelector(".gi-again").addEventListener("click", () => this._pullAgain());
    this._inspect = el;
    return el;
  },

  _refreshAgainButton() {
    if (!this._inspect) return;
    const btn = this._inspect.querySelector(".gi-again");
    const st = loadState();
    const cost = GAME_CONFIG.RARE_PULL_COST;
    if (st.diamonds >= cost) {
      btn.disabled = false;
      btn.innerHTML = `${GACHA_GEM_SVG} ×${cost} TO GO!`;
    } else {
      btn.disabled = true;
      btn.innerHTML = `Need ${GACHA_GEM_SVG} ×${cost} (you have ${st.diamonds})`;
    }
  },

  _revealInspect(flow, s) {
    this.phase = "inspect";
    this._flow = null;
    this._spdEnd();
    const rarity = this._visualRarity(s);
    const cfg = GACHA_BALL[rarity];
    const entry = s.entry;
    const cur = entryCurrentSpecies(entry);
    const dex = cur[0];
    const insp = this._ensureInspect();

    insp.dataset.rarity = rarity;
    insp.querySelector(".gi-rays").style.setProperty("--ray", cfg.ray);
    insp.querySelector(".gi-rarity").textContent = cfg.label;
    const art = insp.querySelector(".gi-art");
    art.onerror = () => { art.onerror = null; art.src = spriteURL(dex); };
    art.src = artworkURL(dex);
    art.alt = cur[1];
    insp.querySelector(".gi-name").textContent = cur[1];
    /* 星級跟稀有度：legend ★★★ / epic ★★ / rare ★ */
    const stars = rarity === "legend" ? "★★★" : rarity === "epic" ? "★★" : "★";
    insp.querySelector(".gi-meta").textContent =
      `No.${String(dex).padStart(3, "0")} ・ Lv.${entry.level} ・ ${stars}`;
    const dexEntry = dexOf(dex);
    const types = (dexEntry && dexEntry.types) || [];
    insp.querySelector(".gi-types").innerHTML = types.map(t =>
      `<span class="gi-type" style="background:${typeColor(t)}"><img src="${typeIconURL(t)}" alt="" onerror="this.remove()">${typeLabel(t).toUpperCase()}</span>`
    ).join("");
    const stats = statsForEntry(entry);
    insp.querySelector(".gi-stats").innerHTML = stats
      ? STAT_KEYS.map(k2 => `<div class="gi-stat"><b>${stats[k2]}</b><span>${STAT_LABELS[k2]}</span></div>`).join("")
      : "";
    const note = insp.querySelector(".gi-note");
    if (s.isDupe) {
      note.className = "gi-note";
      note.textContent = `Already have it! ⚡ EV point +1${s.candyGain ? " ・ 🍬 Candy +1" : ""}`;
    } else {
      note.className = "gi-note new";
      note.textContent = "NEW! Registered to your Pokédex.";
    }
    this._refreshAgainButton();
    this._pendingEvolve = s.firstExpEvolve || null;
    /* 世代解鎖 stash 落 App，等用戶離開檢視卡時先彈慶祝窗（避免遮擋抽獎卡） */
    if (s.newlyUnlockedGen) App._pendingGenUnlock = s.newlyUnlockedGen;

    /* 演出 overlay（單抽：快龍空投；10 連：背景 A）退場 → 檢視卡登場 */
    const sc = this._sceneB;
    if (sc) sc.classList.remove("show");
    this._stageClose(false);
    this._setT(() => {
      if (sc) sc.classList.add("hidden");
      insp.classList.remove("hidden");
      requestAnimationFrame(() => insp.classList.add("show"));
    }, 450);

    /* 每次出卡都播叫聲（v102 起：唔再只限新寵） */
    this._setT(() => { try { Pokedex.playCry(dex); } catch (e) { /* audio unavailable */ } }, 350);

    this.busy = false;
    this._refreshControls();
    App.renderHome();
  },

  /* 檢視卡「×3 TO GO!」：執場後即刻再抽（同樣扣 3 寶石） */
  _pullAgain() {
    if (this.busy || !this._canPull()) return;
    this._cleanupScene();
    const evo = this._pendingEvolve;
    this._pendingEvolve = null;
    if (evo) App.showEvolveModal(evo);
    App.maybeShowGenUnlock();
    this._triggerPull();
  },

  /* 執場：overlay／檢視卡／10 連格全部還原（Prototype 教訓：旗標唔重置會卡死再抽） */
  _cleanupScene() {
    this._spdEnd();
    const g = this._gsap();
    const sc = this._sceneB;
    if (sc) {
      if (g) {
        g.killTweensOf(sc);
        g.killTweensOf(sc.querySelector(".gsb-stage"));
        g.killTweensOf(sc.querySelector(".gsb-ball-wrap"));
      }
      sc.classList.remove("show");
      sc.classList.add("hidden");
      sc.style.transform = "";
      sc.querySelector(".gsb-rings").innerHTML = "";
      const wrap = sc.querySelector(".gsb-ball-wrap");
      wrap.innerHTML = "";
      wrap.style.transform = "";
      sc.querySelector(".gsb-stage").style.transform = "";
      sc.querySelector(".gsb-magic").classList.add("hidden");
      sc.querySelector(".gsb-beam").classList.remove("rise");
      sc.querySelector(".gsb-prompt").textContent = "";
    }
    this._stageClose(true);
    if (this._inspect) {
      this._inspect.classList.remove("show");
      this._inspect.classList.add("hidden");
    }
    const dz = document.getElementById("gacha-dropzone");
    if (dz) dz.innerHTML = "";
    const view = document.getElementById("view-gacha");
    if (view) view.classList.remove("playing");
    if (this._multi) {
      this._multi.classList.remove("show");
      this._multi.classList.add("hidden");
    }
  },

  _resetStage() {
    this._cleanupScene();
    this._prompt("");
    this.phase = "idle";
  }
});
