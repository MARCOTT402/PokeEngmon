/* ============================================================
   PokeEngmon - Gacha：快龍手臂拉動同舞台縮放（拖拉、自動拉、fit stage）
   由 js/gacha.js 拆出（總計劃 P2.5；Rule 116）。同 js/gacha.js 共用同一個 Gacha 物件：
   Object.assign 只係將方法掛返上去，this／Gacha.xxx 用法完全唔變。
   載入次序：js/gacha.js 之後（index.html）。
   ============================================================ */

Object.assign(Gacha, {
  /* ============================================================
     v102 演出層：拉手杆（即扣 3 寶石）→ 肚開 → 跌球 → 背景 A → 檢視卡
     ============================================================ */

  /* 快龍 window 自適應：等 stage 填滿淨低空間後，按比例縮放機器，顯示全隻快龍 */
  _bindStageFit() {
    if (this._fitBound) return;
    this._fitBound = true;
    const stage = document.getElementById("gacha-stage");
    if (!stage) return;
    if (window.ResizeObserver) {
      this._ro = new ResizeObserver(() => this._fitStage());
      this._ro.observe(stage);
    } else {
      window.addEventListener("resize", () => this._fitStage());
    }
    const img = stage.querySelector(".dm-art");
    if (img && !img.complete) img.addEventListener("load", () => this._fitStage());
  },

  _fitStage() {
    const stage = document.getElementById("gacha-stage");
    const m = this._machine();
    if (!stage || !m) return;
    const img = m.querySelector(".dm-art");
    const ar = (img && img.naturalWidth && img.naturalHeight)
      ? img.naturalWidth / img.naturalHeight : (640 / 829);
    const prompt = document.getElementById("gacha-prompt");
    const cs = getComputedStyle(stage);
    const availH = stage.clientHeight - (prompt ? prompt.offsetHeight : 0)
      - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
    /* 右側預留 ~30px 俾伸出機身嘅機械手臂 */
    const availW = stage.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - 30;
    if (availH < 120 || availW < 120) return;   // sheet 未開好／太細：保持 CSS 預設
    m.style.width = Math.round(Math.min(availW, availH * ar)) + "px";
  },

  /* 手臂拖拽監聽（open() 綁一次，handler 內檢查 phase） */
  _bindArm() {
    if (this._bound) return;
    this._bound = true;
    const arm = this._arm();
    if (!arm) return;
    arm.addEventListener("pointerdown", e => this._onArmDown(e));
    arm.addEventListener("pointermove", e => this._onArmMove(e));
    arm.addEventListener("pointerup", e => this._onArmUp(e));
    arm.addEventListener("pointercancel", e => this._onArmUp(e));
    arm.addEventListener("keydown", e => {
      if (this.phase !== "idle") return;
      if (e.key !== "Enter" && e.key !== " ") return;
      e.preventDefault();
      if (e.repeat || this._dragging) return;
      /* 鍵盤長按 3 秒 = 10 連；短按放手 = 單抽 */
      this._dragging = true;
      this._triggered = false;
      this._holdStart = performance.now();
      this._suppressClick = false;
      Pokedex.unlockAudio();
      const audio = this._audio();
      if (audio) audio.ensure();
      this._startCharge();
    });
    arm.addEventListener("keyup", e => {
      if (e.key !== "Enter" && e.key !== " ") return;
      if (this.phase !== "idle") return;
      e.preventDefault();
      const holdMs = performance.now() - (this._holdStart || 0);
      this._dragging = false;
      if (this._charged) {
        this._triggerMultiPull();
      } else {
        this._cancelCharge();
        if (holdMs < 600 && !this.busy) this._tryAutoPull();
        else this._refreshControls();
      }
    });
    arm.addEventListener("click", () => {
      /* 長按放手會產生 click：吞咗佢，避免變成單抽 */
      if (this._suppressClick) { this._suppressClick = false; return; }
      if (this.phase !== "idle" || this._dragging || this._triggered || this._curP >= 0.05) return;
      this._tryAutoPull();
    });
  },

  _setPull(p) {
    this._curP = p;
    const m = this._machine();
    if (!m) return;
    m.style.setProperty("--pull", Math.round(p * GACHA_MAX_PULL) + "px");
    m.style.setProperty("--pullp", p.toFixed(3));
    const arm = this._arm();
    if (arm) arm.setAttribute("aria-valuenow", Math.round(p * 100));
    const pr = document.getElementById("gacha-prompt");
    if (pr && this.phase === "idle") pr.classList.toggle("almost", p > 0.5);
  },

  _onArmDown(e) {
    if (this.phase !== "idle" || this._dragging || this.busy) return;
    if (!this._canPull() && !this._canMultiPull()) {
      this._prompt("Not enough gems — earn more in quizzes!");
      this._haptic(30);
      return;
    }
    this._dragging = true;
    this._triggered = false;
    this._startY = e.clientY;
    this._suppressClick = false;
    this._holdStart = performance.now();
    try { this._arm().setPointerCapture(e.pointerId); } catch (_) { /* unsupported */ }
    this._machine().classList.add("dragging");
    this._prompt("");
    Pokedex.unlockAudio();   // 抓住手杆嗰刻解鎖音效
    const audio = this._audio();
    if (audio) audio.ensure();
    /* 按住即開始充能；3 秒內拉落 = 單抽，3 秒後拉落 = 10 連 */
    this._startCharge();
    e.preventDefault();
  },

  _onArmMove(e) {
    if (!this._dragging || this._triggered) return;
    const dy = Math.min(Math.max(e.clientY - this._startY, 0), GACHA_MAX_PULL);
    const p = dy / GACHA_MAX_PULL;
    /* 未充滿就真拖拽 = 單抽：即刻取消充能 */
    if (!this._charged && p > 0.10) this._cancelCharge();
    this._setPull(p);
    const now = performance.now();
    const audio = this._audio();
    if (audio && now - this._lastCreak > 80 && p > 0.05) {
      this._lastCreak = now;
      audio.pullCreak(p);
    }
    if (this._charged) {
      if (p >= GACHA_MULTI_THRESHOLD && this._canMultiPull()) this._triggerMultiPull();
      return;
    }
    if (p >= GACHA_THRESHOLD && this._canPull()) this._triggerPull();
  },

  _onArmUp() {
    if (!this._dragging) return;
    this._dragging = false;
    this._holdMs = performance.now() - (this._holdStart || 0);
    this._suppressClick = this._holdMs > 600;
    this._machine().classList.remove("dragging");
    if (this._triggered) return;
    /* 未拉落就放手 → 取消充能 + 未有 10 連 */
    this._cancelCharge();
    /* 未達標放手 → 彈簧回彈（未扣鑽），並還原待機提示 */
    const audio = this._audio();
    if (audio) audio.pullSnap();
    const g = this._gsap();
    if (g && !this._rm()) {
      const proxy = { p: this._curP };
      g.to(proxy, { p: 0, duration: .7, ease: "elastic.out(1,.45)", onUpdate: () => this._setPull(proxy.p) });
    } else {
      this._setPull(0);
    }
    this._refreshControls();
  },

  /* 單擊 / 鍵盤：檢查鑽石後自動拉到底（同拉手杆一樣會扣 3 寶石） */
  _tryAutoPull() {
    if (this.busy || this._charging || this._charged) return;
    if (!this._canPull()) {
      this._prompt("Not enough gems — earn more in quizzes!");
      this._haptic(30);
      return;
    }
    this._prompt("");
    this._autoPull();
  },

  /* 無障礙 / 單擊：自動拉到底觸發 */
  _autoPull() {
    const g = this._gsap();
    if (g && !this._rm()) {
      const proxy = { p: this._curP };
      g.to(proxy, { p: 1, duration: .45, ease: "power2.in",
        onUpdate: () => this._setPull(proxy.p),
        onComplete: () => this._triggerPull() });
    } else {
      this._setPull(1);
      this._triggerPull();
    }
  }
});
