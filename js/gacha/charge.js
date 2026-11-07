/* ============================================================
   PokeEngmon - Gacha：按住手杆充能 10 連
   由 js/gacha.js 拆出（總計劃 P2.5；Rule 116）。同 js/gacha.js 共用同一個 Gacha 物件：
   Object.assign 只係將方法掛返上去，this／Gacha.xxx 用法完全唔變。
   載入次序：js/gacha.js 之後（index.html）。
   ============================================================ */

Object.assign(Gacha, {
  /* ============================================================
     10 連抽：按住手杆 3 秒充能 → 拉落 → 10 連
     ============================================================ */

  _setCostChip(multi) {
    const el = document.getElementById("gacha-cost");
    if (!el) return;
    el.classList.toggle("multi", !!multi);
    const cost = multi ? GAME_CONFIG.MULTI_PULL_COST : GAME_CONFIG.RARE_PULL_COST;
    el.innerHTML = `Cost: ${GACHA_GEM_SVG} ×${cost}` +
      (multi ? `<span class="gc-10x">10×</span>` : "");
  },

  _startCharge() {
    if (this.phase !== "idle" || this._charging || this._charged) return;
    this._charging = true;
    this._chargeStart = performance.now();
    const m = this._machine();
    if (m) m.classList.add("charging");
    this._setCostChip(true);
    this._prompt("CHARGING 10×… 0%");
    Pokedex.unlockAudio();
    const audio = this._audio();
    if (audio) audio.ensure();
    this._chargeTimer = this._setT(() => this._chargeComplete(), GACHA_CHARGE_MS);
    this._chargeTicker();
  },

  _chargeTicker() {
    if (!this._charging) return;
    const p = Math.min(1, (performance.now() - this._chargeStart) / GACHA_CHARGE_MS);
    const audio = this._audio();
    if (audio && p < 1) audio.chargeTick(p);
    if (this.phase === "idle" && this._charging) {
      this._prompt(`CHARGING 10×… ${Math.round(p * 100)}%`);
    }
    if (this._charging) this._setT(() => this._chargeTicker(), 260);
  },

  _chargeComplete() {
    this._chargeTimer = null;
    if (!this._charging) return;
    if (!this._canMultiPull()) {
      /* 唔夠 30 鑽：唔會進入 charged，等玩家知要儲幾多 */
      this._cancelCharge();
      this._prompt(`Need ${GAME_CONFIG.MULTI_PULL_COST} gems for 10×`);
      this._haptic(40);
      return;
    }
    this._charging = false;
    this._charged = true;
    const m = this._machine();
    if (m) {
      m.classList.remove("charging");
      m.classList.add("charged");
    }
    this._setCostChip(true);
    this._refreshControls();
    this._prompt("READY! PULL DOWN FOR 10×");
    const pr = document.getElementById("gacha-prompt");
    if (pr) pr.classList.add("almost");
    const audio = this._audio();
    if (audio) audio.chargeReady();
    this._haptic([20, 30, 20]);
  },

  _cancelCharge() {
    if (this._chargeTimer) {
      clearTimeout(this._chargeTimer);
      this._chargeTimer = null;
    }
    const was = this._charging || this._charged;
    this._charging = false;
    this._charged = false;
    const m = this._machine();
    if (m) m.classList.remove("charging", "charged");
    if (was) {
      this._setCostChip(false);
      this._prompt("");
    }
  }
});
