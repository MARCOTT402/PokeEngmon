/* ============================================================
   PokeEngmon - 全域音效引擎（Rule 103）
   由 js/capture.js 拆出：BGM（主頁 Flat Water、戰鬥）、SFX、單字錄音。
   呢個係 classic script，開機就載；three.js 捕捉場景（js/capture.js，~1.3 MB 連 three）
   改為第一次需要先 import()。window.CaptureScene 係 facade：
   - .audio／primeAudio／bgmPrime／startBGM… 即刻用得
   - .play() 會先 load() 真場景再轉交；.load() 可以提早預載（答題開始、idle）
   ============================================================ */
/* ------------------------------------------------------------
   Synthesised audio (no extra files): rustle, taps, charge,
   throw, impact, absorbs, wobbles, gotcha click and jingle.
   ------------------------------------------------------------ */
class CaptureAudio {
  constructor() {
    this.ctx = null;
    this.master = null;   /* alias → sfxBus（合成音效） */
    this.sfxBus = null;
    this.bgmBus = null;
    this.wordBus = null;  /* 圖片單字題語音：跟 Settings Voice 音量（wordBus） */
    this._noise = null;
    const prefs = (typeof loadAudioPrefs === "function") ? loadAudioPrefs() : { bgm: 1, sfx: 1, voice: 1 };
    this._bgmScale = prefs.bgm;
    this._sfxScale = prefs.sfx;
    this._voiceScale = (prefs.voice == null) ? 1 : prefs.voice;
  }

  ensure() {
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      if (!this.ctx) {
        this.ctx = new AC();
        this.sfxBus = this.ctx.createGain();
        this.bgmBus = this.ctx.createGain();
        this.wordBus = this.ctx.createGain();
        this.sfxBus.gain.value = this._sfxScale;
        this.bgmBus.gain.value = this._bgmScale;
        this.wordBus.gain.value = this._voiceScale;
        this.sfxBus.connect(this.ctx.destination);
        this.bgmBus.connect(this.ctx.destination);
        this.wordBus.connect(this.ctx.destination);
        this.master = this.sfxBus;   /* 舊 _tone／noise 路徑繼續連 master */
      }
      if (this.ctx.state === "suspended") this.ctx.resume();
      if (!this._noise) this._noise = this._makeNoise(2.2);
    } catch (e) { /* audio unavailable */ }
  }

  /* Settings slider：0–1 倍率，乘喺設計基數之上（town 0.1／battle 0.15 等） */
  setBgmScale(s) {
    this._bgmScale = Math.max(0, Math.min(1, Number(s) || 0));
    if (this.bgmBus) this.bgmBus.gain.value = this._bgmScale;
    if (this.bgm) {
      try {
        /* element fallback：保持設計基數 × 用戶倍率 */
        const base = (this._elDesignedVol != null) ? this._elDesignedVol : 0.15;
        this.bgm.volume = Math.max(0, Math.min(1, base * this._bgmScale));
      } catch (e) {}
    }
  }
  setSfxScale(s) {
    this._sfxScale = Math.max(0, Math.min(1, Number(s) || 0));
    if (this.sfxBus) this.sfxBus.gain.value = this._sfxScale;
  }
  setVoiceScale(s) {
    this._voiceScale = Math.max(0, Math.min(1, Number(s) || 0));
    if (this.wordBus) this.wordBus.gain.value = this._voiceScale;
  }

  _makeNoise(seconds) {
    const ctx = this.ctx;
    const len = Math.max(1, Math.floor(ctx.sampleRate * seconds));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  _tone(freq, { type = "sine", dur = 0.2, gain = 0.12, at = 0, slideTo = 0, delay = 0 } = {}) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + at + delay;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(20, freq), t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  _noiseHit({ freq = 1200, q = 0.8, gain = 0.18, dur = 0.35, at = 0, type = "bandpass", delay = 0 } = {}) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    if (!this._noise) this._noise = this._makeNoise(2.2);
    const t = ctx.currentTime + at + delay;
    const src = ctx.createBufferSource();
    src.buffer = this._noise;
    const filt = ctx.createBiquadFilter();
    filt.type = type;
    filt.frequency.setValueAtTime(freq, t);
    filt.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filt).connect(g).connect(this.master);
    src.start(t);
    src.stop(t + dur + 0.05);
  }

  _noiseSweep(from, to, dur, gain) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    if (!this._noise) this._noise = this._makeNoise(2.2);
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this._noise;
    const filt = ctx.createBiquadFilter();
    filt.type = "bandpass";
    filt.Q.value = 0.9;
    filt.frequency.setValueAtTime(from, t);
    filt.frequency.exponentialRampToValueAtTime(to, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.06);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filt).connect(g).connect(this.master);
    src.start(t);
    src.stop(t + dur + 0.05);
  }

  rustle(strength = 1) {
    this.ensure();
    if (!this.ctx) return;
    const n = 2 + Math.floor(strength * 2);
    for (let i = 0; i < n; i++) {
      this._noiseHit({
        freq: 650 + Math.random() * 900,
        q: 0.7,
        gain: (0.05 + Math.random() * 0.05) * strength,
        dur: 0.16 + Math.random() * 0.22,
        at: Math.random() * 0.3,
        type: "bandpass"
      });
      this._noiseHit({
        freq: 2600 + Math.random() * 1200,
        q: 1.2,
        gain: 0.02 * strength,
        dur: 0.1,
        at: Math.random() * 0.3,
        type: "highpass"
      });
    }
  }

  ready() {
    this.ensure();
    this._tone(660, { type: "triangle", dur: 0.13, gain: 0.1 });
    this._tone(990, { type: "triangle", dur: 0.2, gain: 0.08, at: 0.09 });
  }

  tap(step) {
    this.ensure();
    if (!this.ctx) return;
    const base = 760 * Math.pow(1.18, step - 1);
    this._tone(base, { type: "triangle", dur: 0.18, gain: 0.16 });
    this._tone(base * 1.5, { type: "sine", dur: 0.24, gain: 0.1, at: 0.01 });
    this._noiseHit({ freq: 4200, q: 2, gain: 0.05, dur: 0.05, type: "highpass" });
  }

  /* 答錯提交：播 assets/audio/wrong-answer.mp3（經 sfxBus，iOS 都食得到音量） */
  wrong() {
    try {
      this.ensure();
      if (this.ctx) {
        this.playOnce("assets/audio/wrong-answer.mp3", 0.7);
        return;
      }
      /* Web Audio 不可用時先用 <audio> 頂住 */
      if (!this._wrongEl) {
        this._wrongEl = new Audio("./assets/audio/wrong-answer.mp3");
        this._wrongEl.preload = "auto";
      }
      const scale = (this._sfxScale == null) ? 1 : Number(this._sfxScale) || 0;
      this._wrongEl.volume = Math.max(0, Math.min(1, 0.7 * scale));
      try { this._wrongEl.pause(); this._wrongEl.currentTime = 0; } catch (e) {}
      const p = this._wrongEl.play();
      if (p && p.catch) p.catch(() => {});
    } catch (e) { /* audio unavailable */ }
  }

  /* Heavy metal ball landing */
  ballLand() {
    this.ensure();
    if (!this.ctx) return;
    this._tone(180, { type: "sine", dur: 0.22, gain: 0.2, slideTo: 60 });
    this._tone(2400, { type: "sine", dur: 0.12, gain: 0.06, at: 0.01 });
    this._noiseHit({ freq: 700, q: 0.7, gain: 0.12, dur: 0.14, type: "lowpass" });
  }

  /* 蛋縫漏光嘅張力低鳴 — 每搖一下頻率升高，愈嚟愈逼近爆點 */
  leakHum(i) {
    this.ensure();
    if (!this.ctx) return;
    const base = 110 + i * 40;
    this._tone(base, { type: "sine", dur: 0.5, gain: 0.12, slideTo: 220 + i * 60 });
    this._tone(base * 2, { type: "sine", dur: 0.4, gain: 0.06, at: 0.03, slideTo: (220 + i * 60) * 2 });
    this._noiseHit({ freq: 900 + i * 400, q: 2, gain: 0.06, dur: 0.15, type: "bandpass" });
  }

  /* 確定演出升級嘅上升 chime — 金/彩虹爆點專用 */
  upgradeSting(step) {
    this.ensure();
    if (!this.ctx) return;
    const base = 880 + step * 220;
    this._tone(base, { type: "triangle", dur: 0.14, gain: 0.12 });
    this._tone(base * 1.5, { type: "triangle", dur: 0.14, gain: 0.11, at: 0.06 });
    this._tone(base * 2, { type: "triangle", dur: 0.22, gain: 0.12, at: 0.12 });
    this._tone(base * 2.5, { type: "sine", dur: 0.3, gain: 0.07, at: 0.15 });
    this._noiseHit({ freq: 7200, q: 3, gain: 0.08, dur: 0.06, type: "highpass" });
  }

  charge() {
    this.ensure();
    if (!this.ctx) return;
    this._tone(180, { type: "sawtooth", dur: 0.55, gain: 0.12, slideTo: 1150 });
    this._tone(360, { type: "sine", dur: 0.55, gain: 0.08, slideTo: 2300, at: 0.03 });
    this._noiseSweep(500, 3200, 0.5, 0.12);
  }

  throwBall() {
    this.ensure();
    this._noiseSweep(380, 2400, 0.45, 0.2);
    this._tone(240, { type: "sine", dur: 0.4, gain: 0.08, slideTo: 90 });
  }

  impact() {
    this.ensure();
    if (!this.ctx) return;
    this._tone(140, { type: "sine", dur: 0.3, gain: 0.24, slideTo: 42 });
    this._noiseHit({ freq: 900, q: 0.6, gain: 0.2, dur: 0.28, type: "lowpass" });
    this.rustle(1.2);
  }

  absorb() {
    this.ensure();
    this._tone(320, { type: "sine", dur: 0.5, gain: 0.11, slideTo: 1800 });
    this._noiseSweep(700, 4200, 0.5, 0.09);
  }

  wobble(step) {
    this.ensure();
    if (!this.ctx) return;
    this._tone(190 - step * 16, { type: "sine", dur: 0.22, gain: 0.2, slideTo: 70 });
    this._noiseHit({ freq: 2200, q: 1.4, gain: 0.06, dur: 0.08, type: "bandpass" });
  }

  gotcha() {
    this.ensure();
    if (!this.ctx) return;
    this._noiseHit({ freq: 5200, q: 1.6, gain: 0.28, dur: 0.05, type: "highpass" });
    this._tone(1850, { type: "square", dur: 0.07, gain: 0.14 });
    this._tone(2750, { type: "square", dur: 0.065, gain: 0.1, at: 0.012 });
    this._tone(620, { type: "sine", dur: 0.16, gain: 0.16, at: 0.01 });
    this._tone(930, { type: "sine", dur: 0.3, gain: 0.1, at: 0.07 });
  }

  /* ---------- v102 快龍拉手抽獎專用 ---------- */

  /* 拉手時嘅機械吱呀聲 — 音高跟拉動進度 p (0..1) 上升 */
  pullCreak(p) {
    this.ensure();
    if (!this.ctx) return;
    this._tone(95 + p * 130, { type: "sawtooth", dur: 0.07, gain: 0.05 });
    this._noiseHit({ freq: 300 + p * 500, q: 3, gain: 0.03, dur: 0.05, type: "bandpass" });
  }

  /* 10 連充能：每次 tick 一短音，音高隨進度上升 */
  chargeTick(p) {
    this.ensure();
    if (!this.ctx) return;
    this._tone(380 + p * 520, { type: "triangle", dur: 0.06, gain: 0.055 });
  }

  /* 充能完成：三連升調，提示可以拉落 */
  chargeReady() {
    this.ensure();
    if (!this.ctx) return;
    this._tone(660, { type: "triangle", dur: 0.1, gain: 0.1 });
    this._tone(880, { type: "triangle", dur: 0.1, gain: 0.1, at: 0.1 });
    this._tone(1320, { type: "triangle", dur: 0.16, gain: 0.12, at: 0.2 });
  }

  /* 放手回彈 / 觸發瞬間嘅彈簧聲 */
  pullSnap() {
    this.ensure();
    if (!this.ctx) return;
    this._tone(160, { type: "sine", dur: 0.14, gain: 0.3, slideTo: 60 });
    this._noiseHit({ freq: 2400, q: 1.2, gain: 0.1, dur: 0.05, type: "highpass" });
  }

  /* 快龍肚仔艙門打開：低頻開閂 + 上升金屬聲 */
  bellyOpen() {
    this.ensure();
    if (!this.ctx) return;
    this._tone(220, { type: "square", dur: 0.22, gain: 0.13, slideTo: 90 });
    this._tone(520, { type: "triangle", dur: 0.16, gain: 0.11, at: 0.09, slideTo: 980 });
    this._noiseHit({ freq: 900, q: 1, gain: 0.08, dur: 0.2, at: 0.06, type: "bandpass" });
  }

  /* 波球滾動聲 */
  ballRoll() {
    this.ensure();
    if (!this.ctx) return;
    this._noiseHit({ freq: 300, q: 0.8, gain: 0.09, dur: 0.65, type: "bandpass" });
    this._noiseSweep(300, 700, 0.6, 0.05);
  }

  /* 開球光柱沖天嘅 whoosh */
  beamWhoosh() {
    this.ensure();
    if (!this.ctx) return;
    this._noiseSweep(500, 6500, 0.55, 0.18);
    this._tone(300, { type: "sawtooth", dur: 0.5, gain: 0.1, slideTo: 1400 });
  }

  breakFree() {
    this.ensure();
    if (!this.ctx) return;
    /* angry roar-ish burst */
    this._noiseHit({ freq: 600, q: 2.2, gain: 0.22, dur: 0.22, type: "bandpass" });
    this._tone(320, { type: "sawtooth", dur: 0.28, gain: 0.18, slideTo: 180 });
    this._tone(160, { type: "square", dur: 0.35, gain: 0.12, slideTo: 90, at: 0.08 });
    /* ball crack after short delay */
    setTimeout(() => {
      this._noiseSweep(1400, 300, 0.25, 0.08);
      this._tone(520, { type: "triangle", dur: 0.15, gain: 0.1 });
    }, window.AnimSpeed ? AnimSpeed.ms(250) : 250);
  }

  /* ---------- BGM: Battle! (Wild Pokémon) — Gen 1 original ----------
     iOS Safari/Chrome IGNORE <audio>.volume (read-only), so the BGM is
     played through Web Audio (BufferSource → GainNode → destination)
     where gain ramps work everywhere. <audio> element kept as fallback. */
  _loadBGMBuffer() {
    this.ensure();
    if (!this.ctx || this._bgmBuf || this._bgmBufLoading) return;
    this._bgmBufLoading = true;
    fetch("assets/bgm/wild-battle.mp3")
      .then(r => r.arrayBuffer())
      .then(ab => this.ctx.decodeAudioData(ab))
      .then(buf => { this._bgmBuf = buf; })
      .catch(() => { /* will fall back to <audio> element */ })
      .finally(() => { this._bgmBufLoading = false; });
  }
  startBGM() {
    this.ensure();
    this.stopTownBGM(400);  /* battle takes over the soundscape */
    if (this._bgmSrc) return;  /* already playing */
    if (this.ctx && this._bgmBuf) {
      try {
        const g = this.ctx.createGain();
        g.gain.value = 0.15;   /* 設計基數；用戶倍率喺 bgmBus */
        g.connect(this.bgmBus || this.ctx.destination);
        const src = this.ctx.createBufferSource();
        src.buffer = this._bgmBuf;
        src.loop = true;
        src.connect(g);
        src.start(0);
        this._bgmGain = g;
        this._bgmSrc = src;
      } catch (e) { /* ignore */ }
      return;
    }
    if (this.ctx && !this._bgmBuf) {
      /* buffer still decoding — retry once shortly */
      this._loadBGMBuffer();
      if (!this._bgmRetry) {
        this._bgmRetry = true;
        setTimeout(() => { this._bgmRetry = false; if (!this._bgmSrc) this.startBGM(); }, 900);
      }
      return;
    }
    this._elStart();
  }
  /* Smoothly ramp BGM volume to `target` over `ms`.
     iOS WebKit chokes on LONG automation ramps — a 6s linearRamp on a GainNode
     corrupts the context's scheduling timeline and silences ALL later SFX.
     So: short ramps (<=1.5s) stay native; long fades use JS steps instead. */
  duckBGM(target, ms = 600) {
    if (this._bgmGain && this.ctx) {
      if (this._bgmFadeTimer) { clearInterval(this._bgmFadeTimer); this._bgmFadeTimer = null; }
      const g = this._bgmGain.gain;
      if (ms <= 1500) {
        const t = this.ctx.currentTime;
        g.cancelScheduledValues(t);
        g.setValueAtTime(g.value, t);
        g.linearRampToValueAtTime(Math.max(0, target), t + ms / 1000);
        return;
      }
      const from = g.value;
      const steps = Math.max(1, Math.round(ms / 100));
      let i = 0;
      this._bgmFadeTimer = setInterval(() => {
        i++;
        if (!this._bgmGain) { clearInterval(this._bgmFadeTimer); this._bgmFadeTimer = null; return; }
        const k = Math.min(1, i / steps);
        try { g.value = Math.max(0, from + (target - from) * k); } catch (e) {}
        if (k >= 1) { clearInterval(this._bgmFadeTimer); this._bgmFadeTimer = null; }
      }, 100);
      return;
    }
    this._elDuck(target, ms);
  }
  /* Fade BGM out over `fadeMs` then stop + rewind. */
  stopBGM(fadeMs = 550) {
    if (this._bgmFadeTimer) { clearInterval(this._bgmFadeTimer); this._bgmFadeTimer = null; }
    if (this._bgmSrc && this.ctx) {
      const src = this._bgmSrc;
      const g = this._bgmGain;
      this._bgmSrc = null;
      this._bgmGain = null;
      const t = this.ctx.currentTime;
      g.gain.cancelScheduledValues(t);
      g.gain.setValueAtTime(g.gain.value, t);
      g.gain.linearRampToValueAtTime(0, t + fadeMs / 1000);
      setTimeout(() => {
        try { src.stop(); } catch (e) {}
        try { src.disconnect(); g.disconnect(); } catch (e) {}
      }, fadeMs + 100);
      return;
    }
    this._elStop(fadeMs);
  }
  bgmPrime() {
    /* Called inside the quiz-submit user gesture: unlock AudioContext + start decode */
    this.ensure();
    this._loadBGMBuffer();
    /* Element fallback unlock — only needed if Web Audio unavailable */
    if (this.ctx) return;
    this._elPrime();
  }

  /* ----- <audio> element fallback (only when Web Audio unavailable) ----- */
  _ensureEl() {
    if (this.bgm) return;
    try {
      this.bgm = new Audio("assets/bgm/wild-battle.mp3");
      this.bgm.loop = true;
      this._elDesignedVol = 0.15;
      this.bgm.volume = Math.max(0, Math.min(1, 0.15 * this._bgmScale));
      this.bgm.preload = "auto";
    } catch (e) { this.bgm = null; }
  }
  _elStart() {
    this._ensureEl();
    if (!this.bgm || !this.bgm.paused) return;
    try {
      this._elDesignedVol = 0.15;
      this.bgm.volume = Math.max(0, Math.min(1, 0.15 * this._bgmScale));
      this.bgm.currentTime = 0;
      this.bgm.play().catch(() => {});
    } catch (e) {}
  }
  _elDuck(target, ms) {
    if (!this.bgm) return;
    if (this._bgmFadeTimer) { clearInterval(this._bgmFadeTimer); this._bgmFadeTimer = null; }
    const from = this.bgm.volume;
    const to = Math.max(0, Math.min(1, target * this._bgmScale));
    this._elDesignedVol = target;
    const steps = Math.max(1, Math.round(ms / 50));
    let i = 0;
    this._bgmFadeTimer = setInterval(() => {
      i++;
      if (!this.bgm) { clearInterval(this._bgmFadeTimer); this._bgmFadeTimer = null; return; }
      const k = Math.min(1, i / steps);
      try { this.bgm.volume = from + (to - from) * k; } catch (e) {}
      if (k >= 1) { clearInterval(this._bgmFadeTimer); this._bgmFadeTimer = null; }
    }, 50);
  }
  _elStop(fadeMs) {
    if (!this.bgm || this._bgmFading) return;
    this._bgmFading = true;
    if (this._bgmFadeTimer) { clearInterval(this._bgmFadeTimer); this._bgmFadeTimer = null; }
    const vol = this.bgm.volume;
    const steps = Math.max(1, Math.round(fadeMs / 55));
    let i = 0;
    const step = () => {
      i++;
      if (!this.bgm) { this._bgmFading = false; return; }
      try { this.bgm.volume = vol * Math.max(0, 1 - i / steps); } catch (e) {}
      if (i < steps) setTimeout(step, 55);
      else {
        try {
          this.bgm.pause();
          this.bgm.currentTime = 0;
          this._elDesignedVol = 0.15;
          this.bgm.volume = Math.max(0, Math.min(1, 0.15 * this._bgmScale));
        } catch (e) {}
        this._bgmFading = false;
      }
    };
    step();
  }
  _elPrime() {
    this._ensureEl();
    if (!this.bgm || this._bgmPrimed) return;
    this._bgmPrimed = true;
    try {
      this.bgm.muted = true;
      const p = this.bgm.play();
      if (p && p.then) {
        p.then(() => {
          try { this.bgm.pause(); this.bgm.currentTime = 0; this.bgm.muted = false; } catch (e) {}
        }).catch(() => { try { this.bgm.muted = false; } catch (e) {} });
      } else {
        try { this.bgm.pause(); this.bgm.currentTime = 0; this.bgm.muted = false; } catch (e) {}
      }
    } catch (e) { try { this.bgm.muted = false; } catch (e2) {} }
  }

  /* ---------- UI button tap（短 click，跟 sfxBus） ---------- */
  uiTap() {
    this.ensure();
    if (!this.ctx) return;
    this._tone(880, { type: "triangle", dur: 0.05, gain: 0.1 });
  }

  /* ---------- Quiz answer SFX ---------- */
  correct() {
    this.ensure();
    if (!this.ctx) return;
    this._tone(880, { type: "triangle", dur: 0.14, gain: 0.2 });
    this._tone(1318, { type: "sine", dur: 0.22, gain: 0.16, at: 0.07 });
  }

  /* ---------- Town BGM (BGM channel) — global background loop ----------
     用戶喺 Setting → Music track 揀（BGM_TRACKS，js/storage.js）；預設 Flat Water。
     每首 buffer 按 url 快取，切歌唔使重新 decode 返舊嗰首。 */
  _townUrl() {
    const id = (typeof getBgmTrack === "function") ? getBgmTrack() : "flat-water";
    const t = (typeof BGM_TRACKS !== "undefined" && BGM_TRACKS[id]) || null;
    return t ? t.url : "assets/bgm/flat-water.mp3";
  }
  _loadTownBuffer(url) {
    this.ensure();
    if (!this.ctx) return;
    if (!this._townBufs) this._townBufs = {};
    if (!this._townLoading) this._townLoading = {};
    if (this._townBufs[url] || this._townLoading[url]) return;
    this._townLoading[url] = true;
    fetch(url)
      .then(r => r.arrayBuffer())
      .then(ab => this.ctx.decodeAudioData(ab))
      .then(buf => {
        this._townBufs[url] = buf;
        /* 等緊嘅係呢首先播：中途切咗歌就等新嗰首自己 load 完 */
        if (this._townPending && this._townUrl() === url) { this._townPending = false; this.startTownBGM(); }
      })
      .catch(() => {})
      .finally(() => { this._townLoading[url] = false; });
  }
  startTownBGM() {
    this.ensure();
    if (!this.ctx || this._townSrc) return;
    const url = this._townUrl();
    const buf = this._townBufs && this._townBufs[url];
    if (!buf) { this._townPending = true; this._loadTownBuffer(url); return; }
    try {
      const g = this.ctx.createGain();
      g.gain.value = 0.1;   /* 設計基數；用戶倍率喺 bgmBus（新曲已 loudness-match 到約 -15 LUFS） */
      g.connect(this.bgmBus || this.ctx.destination);
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      src.connect(g);
      src.start(0);
      this._townGain = g;
      this._townSrc = src;
      this._townSrcUrl = url;
    } catch (e) {}
  }
  /* Setting 切歌：town BGM 播緊就淡出換新曲；對戰／扭蛋期間只記低，完場 startTownBGM 自然播新嗰首 */
  switchTownTrack() {
    const url = this._townUrl();
    if (this._townSrc) {
      if (this._townSrcUrl === url) return;
      this.stopTownBGM(350);
      this.startTownBGM();
    } else if (this._townPending) {
      this._loadTownBuffer(url);
    }
  }
  stopTownBGM(fadeMs = 400) {
    this._townPending = false;   /* 未 load 完就叫停：唔好 load 完先自己播（會疊落對戰／扭蛋度） */
    if (!this._townSrc || !this.ctx) return;
    const src = this._townSrc;
    const g = this._townGain;
    this._townSrc = null;
    this._townGain = null;
    try {
      const t = this.ctx.currentTime;
      g.gain.cancelScheduledValues(t);
      g.gain.setValueAtTime(g.gain.value, t);
      g.gain.linearRampToValueAtTime(0, t + fadeMs / 1000);
    } catch (e) {}
    setTimeout(() => {
      try { src.stop(); } catch (e) {}
      try { src.disconnect(); g.disconnect(); } catch (e) {}
    }, fadeMs + 100);
  }

  /* One-shot MP3 player (e.g. "Obtained a Pokémon!" jingle on settlement).
     Web Audio path so volume control works on iOS. Buffer cached per url. */
  playOnce(url, volume = 1.0) {
    this.ensure();
    if (!this.ctx) return;
    if (!this._oneShotBufs) this._oneShotBufs = {};
    const cached = this._oneShotBufs[url];
    const start = (buf) => {
      try {
        const g = this.ctx.createGain();
        g.gain.value = volume;
        g.connect(this.sfxBus || this.master || this.ctx.destination);
        const src = this.ctx.createBufferSource();
        src.buffer = buf;
        src.connect(g);
        src.start(0);
        src.onended = () => { try { src.disconnect(); g.disconnect(); } catch (e) {} };
      } catch (e) {}
    };
    if (cached && cached.buf) { start(cached.buf); return; }
    if (cached && cached.loading) { cached.waiters.push(start); return; }
    const rec = { buf: null, loading: true, waiters: [start] };
    this._oneShotBufs[url] = rec;
    fetch(url)
      .then(r => r.arrayBuffer())
      .then(ab => this.ctx.decodeAudioData(ab))
      .then(buf => { rec.buf = buf; rec.loading = false; rec.waiters.forEach(fn => { try { fn(buf); } catch (e) {} }); rec.waiters = []; })
      .catch(() => { rec.loading = false; rec.waiters = []; });
  }

  /* Music one-shot through bgmBus (evolution scene): stoppable + optional auto-stop */
  playMusicOnce(url, volume = 0.7, maxSeconds = 0) {
    this.ensure();
    const handle = {
      cancelled: false,
      stop: () => { handle.cancelled = true; }
    };
    if (!this.ctx) return handle;
    if (!this._oneShotBufs) this._oneShotBufs = {};
    const start = (buf) => {
      if (handle.cancelled) return;
      try {
        const g = this.ctx.createGain();
        g.gain.value = volume;
        g.connect(this.bgmBus || this.ctx.destination);
        const src = this.ctx.createBufferSource();
        src.buffer = buf;
        src.connect(g);
        src.start(0);
        let stopped = false;
        let timer = null;
        const stop = () => {
          if (stopped) return;
          stopped = true;
          if (timer) clearTimeout(timer);
          try { src.stop(); } catch (e) {}
          try { src.disconnect(); g.disconnect(); } catch (e) {}
        };
        handle.stop = () => { handle.cancelled = true; stop(); };
        src.onended = () => {
          try { src.disconnect(); g.disconnect(); } catch (e) {}
        };
        /* 自動 cut 前 0.3s 淡出，避免「咔」一聲（倍速下 cut 得早更明顯） */
        if (maxSeconds > 0) {
          const FADE = 0.3;
          timer = setTimeout(() => {
            try { g.gain.setTargetAtTime(0, this.ctx.currentTime, FADE / 4); } catch (e) {}
            timer = setTimeout(stop, FADE * 1000);
          }, Math.max(0, maxSeconds - FADE) * 1000);
        }
      } catch (e) {}
    };
    const cached = this._oneShotBufs[url];
    if (cached && cached.buf) { start(cached.buf); return handle; }
    if (cached && cached.loading) { cached.waiters.push(start); return handle; }
    const rec = { buf: null, loading: true, waiters: [start] };
    this._oneShotBufs[url] = rec;
    fetch(url)
      .then(r => r.arrayBuffer())
      .then(ab => this.ctx.decodeAudioData(ab))
      .then(buf => { rec.buf = buf; rec.loading = false; rec.waiters.forEach(fn => { try { fn(buf); } catch (e) {} }); rec.waiters = []; })
      .catch(() => { rec.loading = false; rec.waiters = []; });
    return handle;
  }

  /* Settings SFX slider preview：停上一段再播，避免拖動疊聲；經 sfxBus 跟用戶倍率 */
  previewSfx(url, volume = 0.4) {
    this.ensure();
    if (!this.ctx) return;
    if (this._previewSrc) {
      try { this._previewSrc.stop(); } catch (e) {}
      try { this._previewSrc.disconnect(); } catch (e) {}
      this._previewSrc = null;
    }
    if (this._previewGain) {
      try { this._previewGain.disconnect(); } catch (e) {}
      this._previewGain = null;
    }
    if (!this._oneShotBufs) this._oneShotBufs = {};
    const start = (buf) => {
      try {
        if (this._previewSrc) {
          try { this._previewSrc.stop(); } catch (e) {}
          try { this._previewSrc.disconnect(); } catch (e) {}
        }
        const g = this.ctx.createGain();
        g.gain.value = volume;
        g.connect(this.sfxBus || this.master || this.ctx.destination);
        const src = this.ctx.createBufferSource();
        src.buffer = buf;
        src.connect(g);
        src.start(0);
        this._previewSrc = src;
        this._previewGain = g;
        src.onended = () => {
          try { src.disconnect(); g.disconnect(); } catch (e) {}
          if (this._previewSrc === src) { this._previewSrc = null; this._previewGain = null; }
        };
      } catch (e) {}
    };
    const cached = this._oneShotBufs[url];
    if (cached && cached.buf) { start(cached.buf); return; }
    if (cached && cached.loading) { cached.waiters.push(start); return; }
    const rec = { buf: null, loading: true, waiters: [start] };
    this._oneShotBufs[url] = rec;
    fetch(url)
      .then(r => r.arrayBuffer())
      .then(ab => this.ctx.decodeAudioData(ab))
      .then(buf => { rec.buf = buf; rec.loading = false; rec.waiters.forEach(fn => { try { fn(buf); } catch (e) {} }); rec.waiters = []; })
      .catch(() => { rec.loading = false; rec.waiters = []; });
  }
  stopPreviewSfx() {
    if (this._previewSrc) {
      try { this._previewSrc.stop(); } catch (e) {}
      try { this._previewSrc.disconnect(); } catch (e) {}
      this._previewSrc = null;
    }
    if (this._previewGain) {
      try { this._previewGain.disconnect(); } catch (e) {}
      this._previewGain = null;
    }
  }

  /* 圖片單字題：無限重播，重播會先停上一段（避免疊聲）。
     onFail 會喺檔案載入／解碼失敗時叫（例如語音檔仲未生成）。
     檔案缺失時先用 speechSynthesis 頂住（fallback，好過靜音），
     之後生成咗正式 TTS 就會自動用返錄音。 */
  /* opts（可選）：{ onEnd }＝播完 callback（圖片題 🔊 掣播放狀態用） */
  playWord(url, onFail, opts) {
    this.ensure();
    const onEnd = (opts && typeof opts.onEnd === "function") ? opts.onEnd : null;
    const fallback = () => {
      if (onEnd) setTimeout(onEnd, 1200);
      const word = decodeURIComponent(String(url).split("/").pop() || "")
        .replace(/\.mp3$/i, "").replace(/_/g, " ");
      if (word && this._speakFallback(word)) {
        if (onFail) onFail(true);   /* true = 已用系統聲頂住 */
      } else if (onFail) {
        onFail(false);
      }
    };
    if (!this.ctx) { fallback(); return; }
    if (!this._oneShotBufs) this._oneShotBufs = {};
    const start = (buf) => {
      try {
        if (this._wordSrc) { try { this._wordSrc.stop(); } catch (e) {} this._wordSrc = null; }
        const g = this.ctx.createGain();
        g.gain.value = 1.0;
        g.connect(this.wordBus || this.ctx.destination);
        const src = this.ctx.createBufferSource();
        src.buffer = buf;
        src.connect(g);
        src.start(0);
        this._wordSrc = src;
        src.onended = () => {
          try { src.disconnect(); g.disconnect(); } catch (e) {}
          if (this._wordSrc === src) this._wordSrc = null;
          if (onEnd) onEnd();
        };
      } catch (e) { fallback(); }
    };
    const cached = this._oneShotBufs[url];
    if (cached && cached.buf) { start(cached.buf); return; }
    /* 預載緊（preloadWord）或者上一次撳緊：排隊等同一個 decode */
    if (cached && cached.loading) { cached.waiters.push(start); cached.failers.push(fallback); return; }
    const rec = { buf: null, loading: true, waiters: [start], failers: [fallback] };
    this._oneShotBufs[url] = rec;
    this._loadOneShot(url, rec);
  }

  /* 預載下一題錄音（Rule 102）：只 fetch＋decode 入 _oneShotBufs，唔播；之後 playWord 即刻有聲。
     冇 AudioContext（未撳入場）就唔做；失敗唔快取，playWord 會自己再試＋fallback */
  preloadWord(url) {
    if (!url || !this.ctx) return;
    if (!this._oneShotBufs) this._oneShotBufs = {};
    if (this._oneShotBufs[url]) return;
    const rec = { buf: null, loading: true, waiters: [], failers: [] };
    this._oneShotBufs[url] = rec;
    this._loadOneShot(url, rec);
  }

  _loadOneShot(url, rec) {
    fetch(url)
      .then(r => { if (!r.ok) throw new Error("missing"); return r.arrayBuffer(); })
      .then(ab => this.ctx.decodeAudioData(ab))
      .then(buf => {
        rec.buf = buf; rec.loading = false;
        rec.waiters.forEach(fn => { try { fn(buf); } catch (e) {} });
        rec.waiters = []; rec.failers = [];
      })
      .catch(() => {
        const failers = rec.failers;
        rec.loading = false; rec.waiters = []; rec.failers = [];
        if (this._oneShotBufs[url] === rec) delete this._oneShotBufs[url];   // 下次再試，唔好快取失敗結果
        failers.forEach(fn => { try { fn(); } catch (e) {} });
      });
  }

  /* 系統語音 fallback（正式錄音嘅代打，目標係一定唔會靜音）。
     強化版：等 voices 載入、優先揀 en-US 語音、講之前 cancel 清隊列。
     回傳 true = 已排程講嘢（可能要等一陣 voices 先載入）；false = 完全唔得。 */
  _speakFallback(word) {
    try {
      if (!("speechSynthesis" in window)) return false;
      const synth = window.speechSynthesis;

      const speak = () => {
        try {
          const voices = synth.getVoices() || [];
          const u = new SpeechSynthesisUtterance(word);
          const enVoice = voices.find(v => /^en[-_]/i.test(v.lang)) || voices[0];
          if (enVoice) u.voice = enVoice;
          u.lang = (enVoice && enVoice.lang) || "en-US";
          u.rate = 0.85;
          u.pitch = 1;
          u.volume = (this._voiceScale == null) ? 1 : Math.max(0, Math.min(1, this._voiceScale));
          synth.cancel();
          synth.speak(u);
        } catch (e) { /* 講嘢失敗就靜默，由 caller 決定點提示 */ }
      };

      if ((synth.getVoices() || []).length === 0) {
        /* Safari / 首次使用：voices 仲未載入，等 onvoiceschanged 先講 */
        const onLoaded = () => { synth.onvoiceschanged = null; speak(); };
        synth.onvoiceschanged = onLoaded;
        /* 保底：1.5 秒仲未 load 到都照講一次（可能 getVoices 突然有嘢） */
        setTimeout(() => {
          if (synth.onvoiceschanged === onLoaded) { synth.onvoiceschanged = null; speak(); }
        }, 1500);
      } else {
        speak();
      }
      return true;
    } catch (e) { return false; }
  }

  jingle() {
    this.ensure();
    if (!this.ctx) return;
    const notes = [784, 988, 1175, 1568, 1319, 1568];
    notes.forEach((f, i) => {
      this._tone(f, { type: "triangle", dur: 0.32, gain: 0.1, at: i * 0.11 });
      this._tone(f * 2, { type: "sine", dur: 0.2, gain: 0.04, at: i * 0.11 });
    });
    this._tone(392, { type: "sine", dur: 0.9, gain: 0.06, at: 0.66 });
  }
}

/* ---------- CaptureScene facade ---------- */
(function () {
  const self = document.currentScript;
  const query = (self && self.src && self.src.indexOf("?") >= 0) ? self.src.slice(self.src.indexOf("?")) : "";
  const moduleURL = new URL("capture.js" + query, (self && self.src) || location.href).href;
  const audio = new CaptureAudio();
  const facade = {
    audio,
    _real: null,
    _loading: null,
    _preloadAt: 0,
    _preloadTimer: 0,
    isSupported() {
      try {
        const c = document.createElement("canvas");
        return !!(window.WebGLRenderingContext && (c.getContext("webgl2") || c.getContext("webgl")));
      } catch (e) { return false; }
    },
    primeAudio() { audio.ensure(); },
    _ensureBGM() { audio._ensureEl(); },
    startBGM() { audio.ensure(); audio.startBGM(); },
    stopBGM(fadeMs) { audio.stopBGM(fadeMs); },
    duckBGM(v, fadeMs) { audio.duckBGM(v, fadeMs); },
    bgmPrime() { audio.ensure(); audio.bgmPrime(); },
    _resize() { if (this._real) this._real._resize(); },
    _attach(real) { this._real = real; },
    /* 載入 three.js 場景；失敗會 reject，下次再試（唔快取失敗） */
    load() {
      if (this._real) return Promise.resolve(this._real);
      if (!this._loading) {
        this._loading = import(moduleURL)
          .then(() => {
            if (!this._real) throw new Error("Capture scene did not attach");
            return this._real;
          })
          .catch(e => {
            this._loading = null;
            try { if (window.Guard) Guard.report(e, { where: "capture-load", silent: true }); } catch (x) {}
            throw e;
          });
      }
      return this._loading;
    },
    /* idle 預載：唔阻開機，網絡閒先載 */
    /* 已經排咗（例如開機 20 秒）但今次要求更早（答題開始 1.5 秒）→ 改用早嗰個 */
    preload(delayMs) {
      if (this._real || this._loading || !this.isSupported()) return;
      const at = Date.now() + (delayMs || 0);
      if (this._preloadAt && this._preloadAt <= at) return;
      clearTimeout(this._preloadTimer);
      this._preloadAt = at;
      this._preloadTimer = setTimeout(() => {
        const run = () => { this._preloadAt = 0; this.load().catch(() => {}); };
        if (window.requestIdleCallback) requestIdleCallback(run, { timeout: 3000 }); else run();
      }, delayMs || 0);
    },
    async play(opts) {
      const real = await this.load();
      return real.play(opts);
    }
  };
  window.CaptureAudio = CaptureAudio;
  /* facade 冇定義嘅屬性（state、resultEl、tap…）載咗真場景之後轉交佢，舊 code／測試／console 照用得 */
  window.CaptureScene = new Proxy(facade, {
    get(t, k) {
      if (k in t) return t[k];
      const real = t._real;
      if (!real) return undefined;
      const v = real[k];
      return typeof v === "function" ? v.bind(real) : v;
    },
    set(t, k, v) {
      if (k in t || !t._real) t[k] = v; else t._real[k] = v;
      return true;
    },
    has(t, k) { return k in t || !!(t._real && k in t._real); }
  });
})();
