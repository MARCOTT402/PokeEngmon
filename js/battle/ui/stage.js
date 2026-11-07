/* ============================================================
   PokeEngmon Battle - 對白打字機、擲波、HP 框滑入滑出、招式動畫、開場
   由 js/battle/battle.js 拆出（總計劃 P2.5；Rule 117）。
   - 共用狀態：S = BattleUI._.S（原本閉包嘅 let）
   - 其他檔嘅函數／數據：B.xxx（B = BattleUI._）；同一個檔入面照直接 call
   載入次序：js/battle/battle.js 之後（index.html）。
   ============================================================ */

(() => {
  const B = BattleUI._, S = B.S;

  /* ---------- 打字機文字（FRLG 逐字彈出 + tick 聲；打字中撳一下即時補完） ---------- */
  function typewrite(msg, done) {
    const box = document.getElementById("battle-text");
    if (S._typeTimer) { clearInterval(S._typeTimer); S._typeTimer = null; }
    S._typeFull = msg || "";
    S._typeDone = done || null;
    box.textContent = "";
    if (!S._typeFull) { const d = S._typeDone; S._typeDone = null; if (d) d(); return; }
    let i = 0;
    S._typeTimer = setInterval(() => {
      i++;
      box.textContent = S._typeFull.slice(0, i);
      if (i >= S._typeFull.length) _finishType();
    }, 20 / S.battleSpeed);   /* PokeRogue MessageUiHandler 預設 delay = 20ms／字 */
  }
  /* 即時補完打字；回傳 true = 啱啱補完咗（上層用嚟做「第一撳補字、第二撳先推進」） */
  function _finishType() {
    if (!S._typeTimer) return false;
    clearInterval(S._typeTimer); S._typeTimer = null;
    document.getElementById("battle-text").textContent = S._typeFull;
    const d = S._typeDone; S._typeDone = null;
    if (d) d();
    return true;
  }

  function introText(msg) {
    B.narrate(msg);   /* 同一般訊息一樣：音效 + 打字機 + 打完出 prompt */
  }
  function showCaret() {
    if (document.getElementById("battle-caret")) return;
    const c = document.createElement("div");
    c.className = "battle-caret"; c.id = "battle-caret";
    document.getElementById("battle-text").appendChild(c);
  }
  function hideCaret() { document.getElementById("battle-caret")?.remove(); }
  function waitTap() {
    return new Promise(res => {
      const zone = document.querySelector(".battle-bottom");
      const done = () => { zone.removeEventListener("click", h); document.removeEventListener("keydown", k); res(); };
      const h = () => {
        if (_finishType()) return;   /* 打字中：第一撳只補完文字，唔推進 */
        done();
      };
      /* 鍵盤（Rule 97）：Enter／Space 等同撳對話框；焦點喺某粒掣上就讓畀嗰粒掣，有 modal 就唔理 */
      const k = (e) => {
        if (e.key !== "Enter" && e.key !== " ") return;
        if (e.repeat || e.altKey || e.ctrlKey || e.metaKey) return;
        if (!document.querySelector("#view-battle.active") || document.querySelector("#modal-root .modal-backdrop")) return;
        const t = e.target;
        if (t && t.closest && t.closest("button, input, textarea, select, [role=button]")) return;
        e.preventDefault();
        h();
      };
      zone.addEventListener("click", h);
      document.addEventListener("keydown", k);
    });
  }

  /* 一句對話：打完字等玩家 click 先跳下一句（唔會自動計時跳） */
  async function say(msg) {
    B.narrate(msg);
    await waitTap();
  }

  function renderBallCounter(elId, teamSize) {
    const el = document.getElementById(elId);
    let html = "";
    for (let i = 0; i < 6; i++) {
      html += i < teamSize
        ? `<img src="assets/battle/ui/poke-ball-big.png" alt="">`
        : `<img src="assets/battle/ui/poke-ball-big.png" alt="" class="ball-empty">`;
    }
    el.innerHTML = html;
  }

  /* 我方訓練家 5 格拋球動畫（red_back.png sprite sheet） */
  function animateMyThrow() {
    const el = document.getElementById("intro-my-trainer");
    const frameH = el.clientHeight || 148;   /* 1 格高度（已縮放） */
    let f = 0;
    const timer = setInterval(() => {
      f++;
      if (f > 4) { clearInterval(timer); return; }
      el.style.backgroundPosition = `0 ${-frameH * f}px`;
    }, 85);
  }

  /* 對戰中途重用 intro 層（球/閃光）：收埋訓練家同球計數，唔擋點擊 */
  function introLayerOn() {
    const intro = document.getElementById("battle-intro");
    intro.classList.add("mid-only");
    intro.style.display = "block";
  }
  function introLayerOff() {
    const intro = document.getElementById("battle-intro");
    intro.classList.remove("mid-only");
    intro.style.display = "none";
  }

  /* 拋球（抄 PokeRogue SummonPhase 節奏）：
     650ms 水平飛 → 150ms 微微落下（Cubic.easeOut）→ 500ms 自轉 1440° 跌落（Cubic.easeIn）
     → 開球（閃光 + 音效）→ 精靈 scale 0.5→1（250ms Sine.easeIn）+ 球色 tint 淡出 */
  function throwBall(side, mid) {
    return new Promise(res => {
      if (mid) introLayerOn();
      const stage = document.querySelector(".battle-stage");
      /* 舞台座標用 offset（未縮放／未旋轉）：tablet／wide 成個戰鬥 scale、手機直向轉 90°，getBoundingClientRect 會錯（Rule 90） */
      const rect = { width: stage.offsetWidth, height: stage.offsetHeight };
      const ball = document.getElementById("intro-ball");
      const flash = document.getElementById("intro-flash");
      /* 起點（訓練家手）→ 終點（精靈企位中央） */
      const foeSideThrow = side === "foe";
      const from = foeSideThrow
        ? { x: rect.width * 0.72, y: rect.height * 0.22 }
        : { x: rect.width * 0.24, y: rect.height * 0.72 };
      const to = foeSideThrow
        ? { x: rect.width - 28 - 55, y: 28 + 60 }            /* = .battle-foe-sprite 中央 */
        : { x: 30 + 65, y: rect.height - 30 - 60 };          /* = .battle-my-sprite 中央 */
      const P1 = 650, P2 = 150, P3 = 500;
      const total = P1 + P2 + P3;
      const rise = 14;                        /* 球起飛時微微升高 */
      const ballOpenAudio = () => B.sfx("pb_rel", .9);   /* PokeRogue pb_rel.wav：球開 */
      ball.style.display = "block";
      try { B.sfx("pb_throw", .85); } catch (e) {}   /* PokeRogue pb_throw.wav：拋球 */
      const t0 = performance.now();
      (function fly(now) {
        const t = Math.min(total, now - t0);
        let x, y, rot;
        if (t <= P1) {                        /* 1. 水平飛去目標上方 */
          const k = t / P1;
          x = from.x + (to.x - from.x) * k;
          y = from.y + (to.y - from.y - rise) * k;
          rot = 0;
        } else if (t <= P1 + P2) {            /* 2. 輕輕落定 */
          const k = (t - P1) / P2;
          const e = 1 - Math.pow(1 - k, 3);   /* Cubic.easeOut */
          x = to.x;
          y = (to.y - rise) + (rise * 0.55) * e;
          rot = 0;
        } else {                              /* 3. 自轉跌落 */
          const k = (t - P1 - P2) / P3;
          const e = Math.pow(k, 3);           /* Cubic.easeIn */
          x = to.x;
          y = (to.y - rise * 0.45) + (rise * 0.45) * e;
          rot = 1440 * e;
        }
        ball.style.left = x + "px";
        ball.style.top = y + "px";
        ball.style.transform = `translate(-50%,-50%) rotate(${rot}deg)`;
        if (t < total) { requestAnimationFrame(fly); return; }
        /* 落地：閃光 + 開球聲 + 精靈 scale 0.5→1 彈出 */
        ball.style.display = "none";
        flash.style.display = "block";
        flash.style.left = to.x + "px";
        flash.style.top = to.y + "px";
        flash.style.animation = "none"; void flash.offsetWidth; flash.style.animation = "";
        ballOpenAudio();
        setTimeout(() => { flash.style.display = "none"; if (mid) introLayerOff(); }, 400);
        const sprite = document.getElementById(foeSideThrow ? "foe-sprite" : "my-sprite");
        sprite.classList.remove("intro-pop");
        void sprite.offsetWidth;
        sprite.classList.add("intro-pop");
        setTimeout(res, 420);
      })(t0);
    });
  }

  /* ---------- HP 資訊框滑入／滑走（PokeRogue showInfo / hideInfo） ---------- */
  function hpBoxEl(side) {
    return document.querySelector(side === "mine" ? ".battle-hpbox-mine" : ".battle-hpbox-foe");
  }
  function hpSlideIn(side, instant) {
    const b = hpBoxEl(side);
    if (!b) return;
    b.style.setProperty("--hp-slide", instant ? "0ms" : (1000 / S.battleSpeed) + "ms");
    b.style.setProperty("--hp-ease", "cubic-bezier(.33,1,.68,1)");   /* Cubic.easeOut */
    b.style.transform = "translateX(0)";
  }
  function hpSlideOut(side) {
    const b = hpBoxEl(side);
    if (!b) return;
    b.style.setProperty("--hp-slide", (500 / S.battleSpeed) + "ms");
    b.style.setProperty("--hp-ease", "cubic-bezier(.32,0,.67,0)");     /* Cubic.easeIn */
    b.style.transform = side === "mine" ? "translateX(112%)" : "translateX(-112%)";
  }

  /* ---------- 招式特效（FRLG 原裝 Attack Effects sheet 裁圖） ---------- */
  /* 屬性 → 預設特效；個別招式再按名 override（例如 Growl 用眼睛、Smokescreen 用煙） */
  const FX_BY_TYPE = {
    normal: "fx-normal", fire: "fx-fire", water: "fx-water", electric: "fx-electric",
    grass: "fx-grass", ice: "fx-ice", fighting: "fx-fighting", poison: "fx-poison",
    ground: "fx-rock2", flying: "fx-flying", psychic: "fx-psychic", bug: "fx-bug",
    rock: "fx-rock", ghost: "fx-ghost", dragon: "fx-dragon", dark: "fx-dark",
    steel: "fx-steel", fairy: "fx-fairy", "???": "fx-normal"
  };
  const FX_BY_NAME = {
    growl: "fx-eyes", leer: "fx-eyes", "tail-whip": "fx-eyes",
    "sand-attack": "fx-smoke", smokescreen: "fx-smoke",
    "string-shot": "fx-bug", absorb: "fx-grass", growth: "fx-grass",
    confusion: "fx-psychic", psybeam: "fx-psychic", "calm-mind": "fx-psychic",
    disable: "fx-ghost", "shadow-ball": "fx-ghost",
    "fire-punch": "fx-fire", "thunder-punch": "fx-electric", "ice-punch": "fx-ice",
    crunch: "fx-dark", scratch: "fx-normal", slash: "fx-normal",
    "quick-attack": "fx-normal", ember: "fx-fire", tackle: "fx-normal"
  };
  /* 每個屬性嘅粒子走向 / 大小（度身訂造，跟原版感覺：火向上、水向下、雷橫閃…） */
  const FX_MOTION = {
    "fx-fire": { w: 46, dx: 0, dy: -30, rot: -12 },
    "fx-fire-ring": { w: 46, dx: 0, dy: -6, rot: 0 },
    "fx-electric": { w: 62, dx: 6, dy: -4, rot: 8 },
    "fx-ice": { w: 42, dx: -10, dy: 16, rot: 20 },
    "fx-ice2": { w: 40, dx: 12, dy: 18, rot: -18 },
    "fx-water": { w: 44, dx: 0, dy: 22, rot: 0 },
    "fx-water2": { w: 40, dx: -12, dy: 18, rot: 16 },
    "fx-grass": { w: 54, dx: -18, dy: -10, rot: -24 },
    "fx-bug": { w: 50, dx: 0, dy: -16, rot: 0 },
    "fx-normal": { w: 44, dx: 0, dy: -8, rot: 10 },
    "fx-rock": { w: 46, dx: 10, dy: 14, rot: -30 },
    "fx-rock2": { w: 44, dx: -10, dy: 12, rot: 24 },
    "fx-steel": { w: 40, dx: 8, dy: -18, rot: -12 },
    "fx-fighting": { w: 42, dx: 14, dy: -6, rot: 8 },
    "fx-dark": { w: 46, dx: 0, dy: 0, rot: -20 },
    "fx-poison": { w: 46, dx: 0, dy: -14, rot: 0 },
    "fx-ghost": { w: 44, dx: 0, dy: -12, rot: 0 },
    "fx-fairy": { w: 48, dx: 0, dy: -20, rot: 0 },
    "fx-psychic": { w: 44, dx: 0, dy: -18, rot: 0 },
    "fx-flying": { w: 46, dx: 0, dy: -14, rot: 0 },
    "fx-dragon": { w: 44, dx: 0, dy: 0, rot: -10 },
    "fx-smoke": { w: 52, dx: 0, dy: -22, rot: 0 },
    "fx-eyes": { w: 44, dx: 0, dy: -10, rot: 0 },
    "fx-wave": { w: 56, dx: 0, dy: 16, rot: 0 }
  };

  function fxSpriteFor(type, slug) {
    return FX_BY_NAME[slug] || FX_BY_TYPE[type] || "fx-normal";
  }

  /* 喺目標身上播屬性特效（跟原版：火、水、雷等都係打喺對方身上） */
  function playMoveFx(type, slug, targetEl) {
    return new Promise(res => {
      const layer = document.getElementById("move-fx");
      /* 舞台座標（Rule 90）：精靈係 .battle-stage 直屬子元素，用 offset 唔受 scale／rotate 影響 */
      const cx = targetEl.offsetLeft + targetEl.offsetWidth / 2;
      const cy = targetEl.offsetTop + targetEl.offsetHeight / 2;
      const key = fxSpriteFor(type, slug);
      const motion = FX_MOTION[key] || FX_MOTION["fx-normal"];
      const w = motion.w;
      layer.innerHTML = "";
      for (let i = 0; i < 3; i++) {
        const img = document.createElement("img");
        img.src = `assets/battle/fx/${key}.png`;
        img.alt = "";
        const spread = i === 0 ? 0 : 16;
        const ang = i === 0 ? 0 : (i === 1 ? -1 : 1);
        img.style.width = (i === 0 ? w : w * 0.7) * 2 + "px";
        img.style.left = (cx + ang * spread) + "px";
        img.style.top = (cy + (i === 0 ? 0 : ang * 9)) + "px";
        img.style.setProperty("--fx-x", motion.dx + "px");
        img.style.setProperty("--fx-y", motion.dy + "px");
        img.style.setProperty("--fx-r", (motion.rot + ang * 10) + "deg");
        img.style.setProperty("--fx-s", (i === 0 ? 1.15 : 0.9) + "");
        img.style.animationDelay = (i * 40) + "ms";
        layer.appendChild(img);
      }
      setTimeout(() => { layer.innerHTML = ""; res(); }, 640);
    });
  }

  /* 招式動畫：攻方衝前（lunge）→ 播原裝逐招動畫（MoveAnim）+ 震動 + 命中音效
     冇該招資源（index.json 冇 / 載入失敗）先 fallback 去屬性特效 */
  function moveAnim(attackerIsPlayer, damaging, type, slug, eff) {
    return (async () => {
      const atkEl = document.getElementById(attackerIsPlayer ? "my-sprite" : "foe-sprite");
      const defEl = document.getElementById(attackerIsPlayer ? "foe-sprite" : "my-sprite");
      const lungeCls = attackerIsPlayer ? "anim-lunge-mine" : "anim-lunge-foe";
      atkEl.classList.remove(lungeCls); void atkEl.offsetWidth;
      atkEl.classList.add(lungeCls);
      await B.sleep(180);
      if (damaging) {
        defEl.classList.remove("anim-hit"); void defEl.offsetWidth;
        defEl.classList.add("anim-hit");
      }
      /* PokeRogue se/：命中音效按相剋強弱分 hit_strong / hit / hit_weak */
      if (damaging) B.sfx(eff > 1 ? "hit_strong" : eff < 1 && eff > 0 ? "hit_weak" : "hit", .9);
      let dur = 0;
      if (typeof MoveAnim !== "undefined") {
        try {
          dur = await MoveAnim.play(slug, {
            layer: document.getElementById("move-fx"),
            stageEl: document.querySelector(".battle-stage"),
            attackerEl: atkEl,
            defenderEl: defEl,
            frameMs: S.battleSpeed > 1 ? 8 : undefined   /* FAST：逐幀動畫加速 */
          });
        } catch (e) { dur = 0; }
      }
      if (!dur) await playMoveFx(type, slug, defEl);
      atkEl.classList.remove(lungeCls);
      if (damaging) setTimeout(() => defEl.classList.remove("anim-hit"), 250);
      await B.sleep(60);
    })();
  }

  /* 換寵（PokeRogue 做法）：舊寵即刻消失 + HP 框滑走 → 拋出新球召出 + HP 框滑入 */
  function animatedSwitch(side, idx) {
    return (async () => {
      const spriteId = side === S.mySide ? "my-sprite" : "foe-sprite";
      const sprite = document.getElementById(spriteId);
      const who = side === S.mySide ? "mine" : "foe";   /* hpBoxEl 只認 mine / foe，唔可以傳 p1 / p2 */
      const out = B.active(S.state, side);
      /* 1. 離場：PokeRogue leaveField 直接隱藏精靈，再 hideInfo 滑走（500ms） */
      if (out.hp > 0) {
        const tap1 = waitTap();
        B.narrate(side === S.mySide ? `${out.name}, come back!` : `${B.foeTrainerName()} withdrew ${out.name.toUpperCase()}!`);
        sprite.classList.remove("anim-faint", "intro-pop", "anim-recall");
        sprite.style.visibility = "hidden";
        PokeSprite.hide(sprite);
        hpSlideOut(who);
        await B.sleep(500);
        await tap1;
      }
      sprite.classList.remove("anim-faint", "intro-pop");
      sprite.style.visibility = "hidden";
      /* 2. 換入 + 拋球召出 + HP 框滑入 */
      BattleState.switchTo(S.state, side, idx);
      B.render();
      const inn = B.active(S.state, side);
      const tap2 = waitTap();
      B.narrate(side === S.mySide ? `Go! ${inn.name.toUpperCase()}!` : `${B.foeTrainerName()} sent out\n${inn.name.toUpperCase()}!`);
      await throwBall(side === S.mySide ? "mine" : "foe", true);
      sprite.style.visibility = "";
      hpSlideIn(who);
      await tap2;
      /* 入場釘子（spikes / stealth-rock）：先食傷害，之後先輪到上場特性（Gen 順序） */
      for (const m of BattleState.applyEntryHazards(S.state, side)) {
        B.render();
        await say(m);
      }
      if (inn.hp <= 0) {
        sprite.classList.add("anim-faint");
        await B.sleep(600);
        return;   /* 釘死：由外層 faint 流程接力（強制換／AI 換） */
      }
      /* 上場特性（Intimidate）：逐句出訊息等玩家 click */
      for (const m of BattleState.onSwitchIn(S.state, side)) await say(m);
    })();
  }

  function playIntro() {
    const view = document.getElementById("view-battle");
    view.classList.add("intro-on");
    const intro = document.getElementById("battle-intro");
    intro.style.display = "block";

    renderBallCounter("intro-balls-mine", B.me().team.length);
    renderBallCounter("intro-balls-foe", B.foe().team.length);

    const foeImg = document.getElementById("intro-foe-trainer");
    const myT = document.getElementById("intro-my-trainer");
    foeImg.src = B.foeTrainerSprite();
    myT.style.backgroundPosition = "0 0";
    foeImg.classList.add("off-right");
    myT.classList.add("off-left");

    introText(`${B.foeTrainerName()}\nwould like to battle!`);
    /* 雙方滑入：我方由左、對手由右 */
    requestAnimationFrame(() => requestAnimationFrame(() => {
      foeImg.classList.remove("off-right");
      myT.classList.remove("off-left");
    }));

    (async () => {
      await B.sleep(650);
      await waitTap();
      /* 對手拋球 → 精靈彈出 → 對手退場 */
      hideCaret();
      await throwBall("foe");
      foeImg.classList.add("off-right");
      introText(`${B.foeTrainerName()} sent out\n${B.foeActive().name.toUpperCase()}!`);
      await waitTap();
      /* 我方拋球（5 格動畫）→ 精靈彈出 → 我方退場 */
      hideCaret();
      animateMyThrow();
      await throwBall("mine");
      myT.classList.add("off-left");
      introText(`Go! ${B.myActive().name.toUpperCase()}!`);
      await waitTap();
      /* 開場上場特性（Intimidate）：按出場次序觸發（對手先、我方後） */
      for (const m of BattleState.onSwitchIn(S.state, S.foeSide)) await say(m);
      for (const m of BattleState.onSwitchIn(S.state, S.mySide)) await say(m);
      /* 完場：還原正常對戰 UI */
      hideCaret();
      intro.style.display = "none";
      view.classList.remove("intro-on");
      B.render();
      B.narrate(`What will ${B.myActive().name.toUpperCase()} do?`);
      B.showMainMenu();
      S.acting = false;
    })();
  }

  Object.assign(B, {
    typewrite, _finishType, introText, showCaret, hideCaret, waitTap, say, renderBallCounter, animateMyThrow,
    introLayerOn, introLayerOff, throwBall, hpBoxEl, hpSlideIn, hpSlideOut, FX_BY_TYPE, FX_BY_NAME, FX_MOTION,
    fxSpriteFor, playMoveFx, moveAnim, animatedSwitch, playIntro
  });
})();
