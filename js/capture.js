/* ============================================================
   PokeEngmon - First-person capture scene
   Three.js scene + GSAP timeline + finite state machine.

   Phases:
     encounter -> charge (3 taps) -> throw -> impact/absorb
     -> 3 shakes -> suspense -> gotcha -> done
   ============================================================ */

import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { BokehPass } from "three/addons/postprocessing/BokehPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";

const gsap = window.gsap;

const BUSH_POS = new THREE.Vector3(0, 0.55, -7.4);
const CAM_START = new THREE.Vector3(0, 1.55, 6.4);
const CAM_THROW = new THREE.Vector3(0, 1.5, 4.2);
const CAM_CLOSE = new THREE.Vector3(0, 1.3, -5.35);
const LOOK_START = new THREE.Vector3(0, 1.15, -6.8);
const LOOK_THROW = new THREE.Vector3(0, 1.2, -6.9);
const LOOK_CLOSE = new THREE.Vector3(0, 0.66, -7.4);

/* Smooth 1D value noise for the handheld camera breathing */
function hash1(n) {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453123;
  return s - Math.floor(s);
}
function noise1(x) {
  const i = Math.floor(x);
  const f = x - i;
  const u = f * f * (3 - 2 * f);
  return (hash1(i) * (1 - u) + hash1(i + 1) * u) * 2 - 1;
}

const STATE = {
  IDLE: "idle",
  ENCOUNTER: "encounter",
  CHARGING: "charging",
  THROWING: "throwing",
  IMPACT: "impact",
  SHAKING: "shaking",
  SUSPENSE: "suspense",
  GOTCHA: "gotcha",
  ESCAPE: "escape",
  DONE: "done"
};

/* Quiz-finish capture success rate (20% escape chance) */
let CAUGHT_RATE = 0.8;
/* Dev helper — guarded behind localhost so it never leaks to production */
const _DEV_HOSTS = new Set(["localhost", "127.0.0.1"]);
const _IS_DEV = _DEV_HOSTS.has(location.hostname);
if (_IS_DEV) {
  window.__setCatchRate = (v) => { CAUGHT_RATE = Math.max(0, Math.min(1, v)); console.log("[capture] CAUGHT_RATE =", CAUGHT_RATE); };
}

/* ------------------------------------------------------------
   Synthesised audio (no extra files): rustle, taps, charge,
   throw, impact, absorbs, wobbles, gotcha click and jingle.
   ------------------------------------------------------------ */
class CaptureAudio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this._noise = null;
  }

  ensure() {
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      if (!this.ctx) {
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.gain.value = 1;
        this.master.connect(this.ctx.destination);
      }
      if (this.ctx.state === "suspended") this.ctx.resume();
      if (!this._noise) this._noise = this._makeNoise(2.2);
    } catch (e) { /* audio unavailable */ }
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

  /* Metallic coin ping — pitch climbs per tap (gacha coin insert) */
  coin(step) {
    this.ensure();
    if (!this.ctx) return;
    const base = 1320 * Math.pow(1.22, step - 1);
    this._tone(base, { type: "square", dur: 0.09, gain: 0.055 });
    this._tone(base * 2.01, { type: "sine", dur: 0.34, gain: 0.13, at: 0.005 });
    this._tone(base * 2.98, { type: "sine", dur: 0.22, gain: 0.07, at: 0.01 });
    this._noiseHit({ freq: 6800, q: 3, gain: 0.05, dur: 0.05, type: "highpass" });
  }

  /* Coin swallowed by the slot: low thunk + metallic tick */
  coinInsert() {
    this.ensure();
    if (!this.ctx) return;
    this._tone(220, { type: "sine", dur: 0.16, gain: 0.2, slideTo: 70 });
    this._tone(1560, { type: "sine", dur: 0.3, gain: 0.1, at: 0.03 });
    this._noiseHit({ freq: 3200, q: 1.6, gain: 0.1, dur: 0.08, at: 0.02 });
  }

  /* Machine rumble loop (one shot, ~1s of low juddering) */
  rumble() {
    this.ensure();
    if (!this.ctx) return;
    for (let i = 0; i < 6; i++) {
      this._tone(70 + Math.random() * 30, { type: "sine", dur: 0.14, gain: 0.15, at: i * 0.16, slideTo: 45 });
      this._noiseHit({ freq: 300, q: 0.8, gain: 0.09, dur: 0.12, at: i * 0.16, type: "lowpass" });
    }
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
    }, 250);
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
        g.gain.value = 0.55;
        g.connect(this.ctx.destination);  /* bypass master — gain values match old element volumes */
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
      this.bgm.volume = 0.55;
      this.bgm.preload = "auto";
    } catch (e) { this.bgm = null; }
  }
  _elStart() {
    this._ensureEl();
    if (!this.bgm || !this.bgm.paused) return;
    try { this.bgm.currentTime = 0; this.bgm.play().catch(() => {}); } catch (e) {}
  }
  _elDuck(target, ms) {
    if (!this.bgm) return;
    if (this._bgmFadeTimer) { clearInterval(this._bgmFadeTimer); this._bgmFadeTimer = null; }
    const from = this.bgm.volume;
    const steps = Math.max(1, Math.round(ms / 50));
    let i = 0;
    this._bgmFadeTimer = setInterval(() => {
      i++;
      if (!this.bgm) { clearInterval(this._bgmFadeTimer); this._bgmFadeTimer = null; return; }
      const k = Math.min(1, i / steps);
      try { this.bgm.volume = from + (target - from) * k; } catch (e) {}
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
        try { this.bgm.pause(); this.bgm.currentTime = 0; this.bgm.volume = 0.55; } catch (e) {}
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

  /* ---------- Quiz answer SFX ---------- */
  correct() {
    this.ensure();
    if (!this.ctx) return;
    this._tone(880, { type: "triangle", dur: 0.14, gain: 0.2 });
    this._tone(1318, { type: "sine", dur: 0.22, gain: 0.16, at: 0.07 });
  }
  wrong() {
    this.ensure();
    if (!this.ctx) return;
    this._tone(160, { type: "sawtooth", dur: 0.32, gain: 0.16, slideTo: 90 });
    this._tone(110, { type: "square", dur: 0.3, gain: 0.08, at: 0.02 });
  }

  /* ---------- Town BGM: Nuvema Town — global background loop ---------- */
  _loadTownBuffer() {
    this.ensure();
    if (!this.ctx || this._townBuf || this._townBufLoading) return;
    this._townBufLoading = true;
    fetch("assets/bgm/nuvema-town.mp3")
      .then(r => r.arrayBuffer())
      .then(ab => this.ctx.decodeAudioData(ab))
      .then(buf => { this._townBuf = buf; if (this._townPending) { this._townPending = false; this.startTownBGM(); } })
      .catch(() => {})
      .finally(() => { this._townBufLoading = false; });
  }
  startTownBGM() {
    this.ensure();
    if (!this.ctx || this._townSrc) return;
    if (!this._townBuf) { this._townPending = true; this._loadTownBuffer(); return; }
    try {
      const g = this.ctx.createGain();
      g.gain.value = 0.4;
      g.connect(this.ctx.destination);
      const src = this.ctx.createBufferSource();
      src.buffer = this._townBuf;
      src.loop = true;
      src.connect(g);
      src.start(0);
      this._townGain = g;
      this._townSrc = src;
    } catch (e) {}
  }
  stopTownBGM(fadeMs = 400) {
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
        g.connect(this.ctx.destination);
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

  /* 圖片單字題：無限重播，重播會先停上一段（避免疊聲）。
     onFail 會喺檔案載入／解碼失敗時叫（例如語音檔仲未生成）。
     檔案缺失時先用 speechSynthesis 頂住（fallback，好過靜音），
     之後生成咗正式 TTS 就會自動用返錄音。 */
  playWord(url, onFail) {
    this.ensure();
    const fallback = () => {
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
        g.connect(this.ctx.destination);
        const src = this.ctx.createBufferSource();
        src.buffer = buf;
        src.connect(g);
        src.start(0);
        this._wordSrc = src;
        src.onended = () => {
          try { src.disconnect(); g.disconnect(); } catch (e) {}
          if (this._wordSrc === src) this._wordSrc = null;
        };
      } catch (e) { fallback(); }
    };
    const cached = this._oneShotBufs[url];
    if (cached && cached.buf) { start(cached.buf); return; }
    if (cached && cached.loading) { cached.waiters.push(start); return; }
    const rec = { buf: null, loading: true, waiters: [start] };
    this._oneShotBufs[url] = rec;
    fetch(url)
      .then(r => { if (!r.ok) throw new Error("missing"); return r.arrayBuffer(); })
      .then(ab => this.ctx.decodeAudioData(ab))
      .then(buf => {
        rec.buf = buf; rec.loading = false;
        rec.waiters.forEach(fn => { try { fn(buf); } catch (e) {} });
        rec.waiters = [];
      })
      .catch(() => {
        rec.loading = false; rec.waiters = [];
        delete this._oneShotBufs[url];       // 下次再試，唔好快取失敗結果
        fallback();
      });
  }

  /* 系統語音 fallback（正式錄音嘅代打，唔會靜音） */
  _speakFallback(word) {
    try {
      if (!("speechSynthesis" in window)) return false;
      const u = new SpeechSynthesisUtterance(word);
      u.lang = "en-US";
      u.rate = 0.85;
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(u);
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

/* ------------------------------------------------------------
   Scene controller
   ------------------------------------------------------------ */
class PokemonCaptureScene {
  constructor() {
    this.viewId = "view-capture";
    this.view = document.getElementById(this.viewId);
    this.host = document.getElementById("capture-host");
    this.promptEl = document.getElementById("capture-prompt");
    this.tapsEl = document.getElementById("capture-taps");
    this.monEl = document.getElementById("capture-mon");
    this.flashEl = document.getElementById("capture-flash");
    this.resultEl = document.getElementById("capture-result");
    this.resultImg = document.getElementById("capture-result-img");
    this.resultTitle = document.querySelector("#capture-result .capture-result-title");
    this.resultName = document.getElementById("capture-result-name");
    this.resultSub = document.getElementById("capture-result-sub");
    this.continueBtn = document.getElementById("capture-continue");
    this.warningEl = document.getElementById("capture-warning");
    this.warpEl = document.getElementById("capture-warp");

    this.audio = new CaptureAudio();
    this.state = STATE.IDLE;
    this.taps = 0;
    this.running = false;
    this.ready = false;
    this.width = 1;
    this.height = 1;

    /* BGM player */
    this.bgm = null;
    this._bgmFading = false;

    this.lookTarget = LOOK_START.clone();
    this.monFx = { scale: 1, opacity: 0 };
    this.bursts = [];
    this.trail = null;
    this.trailPoints = [];
    this.tl = null;
    this.shakeTl = null;
    this.finishTimer = null;
    this._finished = false;

    this._onTap = (e) => {
      if (e.target && e.target.closest("button")) return;
      this.tap();
    };
    this.view.addEventListener("pointerdown", this._onTap);
    this.continueBtn.addEventListener("click", () => this._finish());
  }

  isSupported() {
    try {
      const c = document.createElement("canvas");
      return !!(window.WebGLRenderingContext && (c.getContext("webgl2") || c.getContext("webgl")));
    } catch (e) {
      return false;
    }
  }

  primeAudio() {
    this.audio.ensure();
  }

  /* ---------- BGM: Battle! (Wild Pokémon) — Gen 1 original MP3 ---------- */
  _ensureBGM() { this.audio._ensureEl(); }
  startBGM() { this.audio.ensure(); this.audio.startBGM(); }
  stopBGM(fadeMs) { this.audio.stopBGM(fadeMs); }
  duckBGM(v, fadeMs) { this.audio.duckBGM(v, fadeMs); }
  bgmPrime() { this.audio.ensure(); this.audio.bgmPrime(); }

  /* ---------- WARNING / Warp overlays ---------- */
  _showWarning(dexId, name) {
    if (!this.warningEl) return;
    this.warningEl.classList.remove("hide");
    this.warningEl.classList.add("show");
  }
  _hideWarning() {
    if (!this.warningEl) return new Promise(r => r());
    return new Promise(resolve => {
      this.warningEl.classList.remove("show");
      this.warningEl.classList.add("hide");
      setTimeout(() => {
        this.warningEl.classList.remove("hide");
        resolve();
      }, 560);
    });
  }
  _startWarp() {
    if (!this.warpEl) return;
    this.warpEl.classList.add("go");
    setTimeout(() => {
      this.warpEl.classList.remove("go");
    }, 950);
  }

  /* ---------- public: play one encounter ---------- */
  play({ dexId, name, onCaught, onComplete }) {
    try { this.audio.ensure(); } catch (e) { /* audio never kills the scene */ }
    this.dexId = dexId;
    this.monName = name;
    this.onCaught = onCaught;
    this.onComplete = onComplete;
    this._finished = false;
    this._resultInfo = null;
    this._resetScene();

    /* Show WARNING overlay before any 3D work — keeps it crisp on mobile */
    try { this._showWarning(dexId, name); } catch (e) { /* ignore */ }

    /* Kick off BGM as early as possible — failure must not abort the encounter */
    try { this.startBGM(); } catch (e) { console.warn("[capture] BGM failed:", e); }

    /* Prepare the Pokémon image */
    this.monEl.onerror = () => {
      this.monEl.onerror = null;
      const fallback = window.spriteURL ? window.spriteURL(dexId) : `assets/animated/${dexId}.gif`;
      this.monEl.src = fallback;
    };
    this.monEl.src = window.animatedURL ? window.animatedURL(dexId) : `assets/animated/${dexId}.gif`;

    /* Start 3D loop in parallel (it's heavy, we want it running during the warning) */
    this._ensureThree();
    this._startLoop();

    this._donePromise = new Promise(resolve => { this._resolve = resolve; });

    /* Schedule warning → warp → encounter */
    setTimeout(async () => {
      try {
        await this._hideWarning();
        this._startWarp();
      } catch (e) { /* ignore */ }
      /* Now run the real encounter timeline */
      this._runEncounter();
    }, 2600);

    return this._donePromise;
  }

  _runEncounter() {
    this._setState(STATE.ENCOUNTER);
    this._prompt("Something is rustling in the grass…");

    this.tl = gsap.timeline();
    this.tl
      .call(() => this.audio.rustle(1), null, 0.25)
      .to(this.bushGroup.rotation, { z: 0.1, duration: 0.16, yoyo: true, repeat: 3, ease: "sine.inOut" }, 0.25)
      .call(() => this._leafBurst(18), null, 0.35)
      .call(() => this.audio.rustle(1.15), null, 1.0)
      .to(this.bushGroup.rotation, { z: -0.12, duration: 0.2, yoyo: true, repeat: 3, ease: "sine.inOut" }, 1.0)
      .to(this.bushGroup.scale, { x: 1.08, y: 1.12, z: 1.08, duration: 0.26, yoyo: true, repeat: 1, ease: "sine.inOut" }, 1.05)
      .call(() => this._leafBurst(26), null, 1.15)
      .call(() => this._prompt("A wild Pokémon is hiding in the grass!"), null, 2.1)
      .to(this.ball.scale, { x: 1, y: 1, z: 1, duration: 1.0, ease: "back.out(1.7)" }, 2.4)
      .to(this.ball.position, { y: 1.45, duration: 1.0, ease: "back.out(1.4)" }, 2.4)
      .to(this.ball.rotation, { y: Math.PI * 2, duration: 1.3, ease: "power1.inOut" }, 2.4)
      .call(() => {
        this._setState(STATE.IDLE);
        this._prompt("Tap the Poké Ball 3× to charge!");
        this._showTaps(true);
        this.audio.ready();
      }, null, 3.6);

    return this._donePromise;
  }

  /* ---------- reset ---------- */
  _resetScene() {
    if (this.tl) { this.tl.kill(); this.tl = null; }
    if (this.shakeTl) { this.shakeTl.kill(); this.shakeTl = null; }
    if (this.finishTimer) { clearTimeout(this.finishTimer); this.finishTimer = null; }
    if (this._escapeTimers) { this._escapeTimers.forEach(t => clearTimeout(t)); this._escapeTimers = null; }
    if (this.ready && gsap) {
      gsap.killTweensOf([
        this.ball.position, this.ball.rotation, this.ball.scale,
        this.cameraRig.position, this.lookTarget,
        this.bokeh.uniforms.focus, this.bloom, this.monFx
      ]);
    }
    this.taps = 0;
    this._showTaps(false);
    this._updateDots();
    this.resultEl.classList.remove("show", "is-escape");
    this.flashEl.classList.remove("on");
    this.monEl.style.opacity = "0";
    this.monEl.classList.remove("is-red", "is-visible", "is-angry");
    if (this.resultTitle) this.resultTitle.textContent = "Gotcha!";
    this.monFx.scale = 1;
    this.monFx.opacity = 0;
    this._resultInfo = null;
    this._captureResult = null;

    if (!this.ready) return;

    this.ball.position.set(0, -1.15, 2.2);
    this.ball.scale.setScalar(0.55);
    this.ball.rotation.set(0, 0, 0);
    this.ball.visible = true;
    if (this.monAnchor) this.monAnchor.position.set(0, 1.25, -7.85);

    this.cameraRig.position.copy(CAM_START);
    this.camera.fov = 55;
    this.camera.aspect = this.width / this.height;
    this.camera.updateProjectionMatrix();
    this.lookTarget.copy(LOOK_START);
    this.bokeh.uniforms.focus.value = 12;
    this.bokeh.uniforms.aperture.value = 0.0018;
    this.bokeh.uniforms.maxblur.value = 0.008;
    this.bloom.strength = 0.48;

    this.buttonMat.emissiveIntensity = 0;
    this.glowSprite.material.opacity = 0;
    this.ballLight.intensity = 0;
    this.wind.value = 0;
    this._clearBursts();
    this._clearTrail();
  }

  /* ---------- Three.js setup ---------- */
  _ensureThree() {
    if (this.ready) return;
    const host = this.host;

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    const isNarrow = window.matchMedia("(max-width: 560px)").matches;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isNarrow ? 1.5 : 1.8));
    this.renderer.setSize(host.clientWidth || window.innerWidth, host.clientHeight || window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    host.appendChild(this.renderer.domElement);
    this.renderer.domElement.setAttribute("aria-hidden", "true");

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x0a1a13, 0.032);

    this.camera = new THREE.PerspectiveCamera(55, 1, 0.1, 220);
    this.cameraRig = new THREE.Group();
    this.cameraRig.position.copy(CAM_START);
    this.cameraRig.add(this.camera);
    this.scene.add(this.cameraRig);

    this._buildSky();
    this._buildLights();
    this._buildGround();
    this._buildForest();
    this._buildGrass();
    this._buildBush();
    this._buildBall();
    this._buildParticles();

    this.width = host.clientWidth || window.innerWidth;
    this.height = host.clientHeight || window.innerHeight;
    this.camera.aspect = this.width / this.height;
    this.camera.updateProjectionMatrix();

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bokeh = new BokehPass(this.scene, this.camera, {
      focus: 12,
      aperture: 0.0018,
      maxblur: 0.008
    });
    this.composer.addPass(this.bokeh);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(this.width, this.height), 0.48, 0.55, 0.82);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    this._resize();
    window.addEventListener("resize", () => this._resize());
    this.clock = new THREE.Clock();
    this.ready = true;
  }

  _buildSky() {
    const geo = new THREE.SphereGeometry(120, 32, 20);
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {},
      vertexShader: `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec3 vDir;
        void main() {
          float h = clamp(vDir.y * 0.5 + 0.5, 0.0, 1.0);
          vec3 low  = vec3(0.55, 0.36, 0.18);
          vec3 mid  = vec3(0.10, 0.27, 0.28);
          vec3 high = vec3(0.015, 0.06, 0.11);
          vec3 col = mix(low, mid, smoothstep(0.0, 0.32, h));
          col = mix(col, high, smoothstep(0.32, 0.92, h));
          vec3 sunDir = normalize(vec3(-0.45, 0.3, -0.85));
          float sun = pow(max(dot(vDir, sunDir), 0.0), 26.0);
          col += vec3(1.0, 0.68, 0.32) * sun * 0.55;
          gl_FragColor = vec4(col, 1.0);
        }
      `
    });
    const sky = new THREE.Mesh(geo, mat);
    sky.position.set(0, 0, -8);
    this.scene.add(sky);
  }

  _buildLights() {
    const hemi = new THREE.HemisphereLight(0xb8dcff, 0x1b2a12, 1.05);
    this.scene.add(hemi);

    const sun = new THREE.DirectionalLight(0xffd9a0, 2.4);
    sun.position.set(-7, 11, 5);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -12;
    sun.shadow.camera.right = 12;
    sun.shadow.camera.top = 12;
    sun.shadow.camera.bottom = -12;
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 34;
    sun.shadow.bias = -0.0012;
    this.scene.add(sun);

    const rim = new THREE.DirectionalLight(0x5ba8ff, 0.9);
    rim.position.set(6, 4, -10);
    this.scene.add(rim);

    const fill = new THREE.PointLight(0xffd2a0, 4.0, 16, 2);
    fill.position.set(0, 2.2, 4.5);
    this.scene.add(fill);
  }

  _buildGround() {
    const geo = new THREE.PlaneGeometry(120, 120, 48, 48);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i);
      const h = Math.sin(x * 0.32) * Math.cos(y * 0.28) * 0.09
        + Math.sin(x * 0.9 + y * 0.6) * 0.03;
      pos.setZ(i, h);
    }
    geo.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({
      color: 0x16251a,
      roughness: 0.97,
      metalness: 0.0
    });
    const ground = new THREE.Mesh(geo, mat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.02;
    ground.receiveShadow = true;
    this.scene.add(ground);

    const dirt = new THREE.Mesh(
      new THREE.CircleGeometry(2.6, 32),
      new THREE.MeshStandardMaterial({ color: 0x3a2d1c, roughness: 1 })
    );
    dirt.rotation.x = -Math.PI / 2;
    dirt.position.set(0, 0.005, -7.4);
    dirt.scale.set(1, 1.35, 1);
    dirt.receiveShadow = true;
    this.scene.add(dirt);
  }

  _buildForest() {
    /* Dark ring wall so the sky never shows through gaps at the horizon */
    const wall = new THREE.Mesh(
      new THREE.CylinderGeometry(34, 34, 44, 64, 1, true),
      new THREE.MeshStandardMaterial({ color: 0x0a1a12, roughness: 1, side: THREE.BackSide })
    );
    wall.position.set(0, 20, -8);
    this.scene.add(wall);

    const canopyMat = new THREE.MeshStandardMaterial({ color: 0x183823, roughness: 0.95, flatShading: true });
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x241a12, roughness: 1 });
    const group = new THREE.Group();
    for (let i = 0; i < 40; i++) {
      const angle = (i / 40) * Math.PI * 2 + Math.random() * 0.12;
      const radius = 14 + Math.random() * 8;
      const x = Math.cos(angle) * radius;
      const z = -8 + Math.sin(angle) * radius * 0.7;
      if (z > 1.5) continue;
      const scale = 1.1 + Math.random() * 1.1;
      const tree = new THREE.Group();
      const trunk = new THREE.Mesh(
        new THREE.CylinderGeometry(0.14 * scale, 0.22 * scale, 1.3 * scale, 5),
        trunkMat
      );
      trunk.position.y = 0.65 * scale;
      tree.add(trunk);
      for (let k = 0; k < 3; k++) {
        const cone = new THREE.Mesh(
          new THREE.ConeGeometry((1.05 - k * 0.16) * scale, 1.5 * scale, 7),
          canopyMat
        );
        cone.position.y = (1.35 + k * 0.72) * scale;
        cone.rotation.y = Math.random() * Math.PI;
        tree.add(cone);
      }
      tree.position.set(x, -0.1, z);
      group.add(tree);
    }
    this.scene.add(group);
  }

  _windMaterial(uniforms) {
    const mat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.78,
      metalness: 0.0,
      side: THREE.DoubleSide
    });
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = uniforms.time;
      shader.uniforms.uWind = uniforms.wind;
      shader.vertexShader = `
        uniform float uTime;
        uniform float uWind;
      ` + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace(
        "#include <begin_vertex>",
        `
        #include <begin_vertex>
        vec3 iOrigin = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
        float hN = clamp(position.y * 1.15, 0.0, 1.0);
        float phase = uTime * (1.15 + uWind * 1.8) + iOrigin.x * 0.55 + iOrigin.z * 0.8;
        float sway = sin(phase) * 0.16 + sin(phase * 2.4 + 1.3) * 0.05;
        transformed.x += sway * hN * hN * (0.75 + uWind);
        transformed.z += cos(phase * 0.7 + 0.6) * 0.075 * hN * hN;
        `
      );
    };
    return mat;
  }

  _buildGrass() {
    const uniforms = {
      time: { value: 0 },
      wind: { value: 0 }
    };
    this.grassUniforms = uniforms;
    this.wind = uniforms.wind;

    const blade = new THREE.PlaneGeometry(0.075, 0.82, 1, 4);
    blade.translate(0, 0.41, 0);
    const p = blade.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i);
      p.setX(i, p.getX(i) * (1 - (y / 0.82) * 0.88));
    }
    blade.computeVertexNormals();

    const count = 7200;
    const mat = this._windMaterial(uniforms);
    const mesh = new THREE.InstancedMesh(blade, mat, count);
    mesh.frustumCulled = false;
    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    let placed = 0;
    let guard = 0;
    while (placed < count && guard < count * 6) {
      guard++;
      const x = (Math.random() - 0.5) * 24;
      const z = 3.5 - Math.random() * 17;
      const distToBush = Math.hypot(x - BUSH_POS.x, z - BUSH_POS.z);
      /* Keep a clear pocket around the encounter bush for the close-up */
      if (distToBush < 2.9) continue;
      dummy.position.set(x, 0, z);
      dummy.rotation.set(0, Math.random() * Math.PI * 2, (Math.random() - 0.5) * 0.22);
      const s = distToBush < 4.8
        ? 0.28 + Math.random() * 0.32
        : 0.55 + Math.random() * 1.1;
      dummy.scale.set(1, s, 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(placed, dummy.matrix);
      color.setHSL(0.26 + Math.random() * 0.07, 0.42 + Math.random() * 0.22, 0.14 + Math.random() * 0.15);
      mesh.setColorAt(placed, color);
      placed++;
    }
    mesh.count = placed;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    this.scene.add(mesh);
  }

  _buildBush() {
    const group = new THREE.Group();
    group.position.set(0, 0, -7.4);
    this.bushGroup = group;
    this.scene.add(group);

    const uniforms = { time: this.grassUniforms.time, wind: this.grassUniforms.wind };
    const blade = new THREE.PlaneGeometry(0.12, 1.95, 1, 5);
    blade.translate(0, 0.975, 0);
    const p = blade.attributes.position;
    for (let i = 0; i < p.count; i++) {
      p.setX(i, p.getX(i) * (1 - (p.getY(i) / 1.95) * 0.9));
    }
    blade.computeVertexNormals();

    const count = 920;
    const mesh = new THREE.InstancedMesh(blade, this._windMaterial(uniforms), count);
    mesh.frustumCulled = false;
    mesh.castShadow = true;
    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * 1.95;
      const px = Math.cos(a) * r;
      const pz = Math.sin(a) * r * 0.9;
      const frontWindow = pz > 0.2 && Math.abs(px) < 1.4;
      dummy.position.set(px, 0, pz);
      dummy.rotation.set(0, Math.random() * Math.PI * 2, (Math.random() - 0.5) * 0.3);
      dummy.scale.set(
        0.8 + Math.random() * 0.5,
        frontWindow ? 0.1 + Math.random() * 0.08 : 0.7 + Math.random() * 0.55,
        1
      );
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      color.setHSL(0.28 + Math.random() * 0.05, 0.5 + Math.random() * 0.2, 0.13 + Math.random() * 0.1);
      mesh.setColorAt(i, color);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    group.add(mesh);

    /* Tall stalks at the back give the encounter bush a clear silhouette */
    const stalkMat = new THREE.MeshStandardMaterial({ color: 0x2c5a2c, roughness: 0.8 });
    const headMat = new THREE.MeshStandardMaterial({ color: 0x7a6a34, roughness: 0.9 });
    for (let i = 0; i < 20; i++) {
      const a = Math.PI * (0.55 + Math.random() * 0.9);
      const r = 0.5 + Math.random() * 1.2;
      const h = 1.7 + Math.random() * 1.1;
      const x = Math.cos(a) * r;
      const z = -0.2 - Math.random() * 1.2;
      const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.022, h, 4), stalkMat);
      stalk.position.set(x, h / 2, z);
      stalk.rotation.z = (Math.random() - 0.5) * 0.16;
      group.add(stalk);
      const head = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.22, 5), headMat);
      head.position.set(x, h + 0.02, z);
      group.add(head);
    }

    /* A few broad leaves to break up the silhouette */
    const leafMat = new THREE.MeshStandardMaterial({
      color: 0x1f4a25,
      roughness: 0.7,
      side: THREE.DoubleSide
    });
    for (let i = 0; i < 9; i++) {
      const leaf = new THREE.Mesh(new THREE.CircleGeometry(0.55, 7), leafMat);
      const a = (i / 9) * Math.PI * 2 + Math.random() * 0.4;
      leaf.position.set(Math.cos(a) * 1.2, 0.5 + Math.random() * 0.6, Math.sin(a) * 0.9);
      leaf.rotation.set(-1.1 + Math.random() * 0.5, a, Math.random() * 0.8 - 0.4);
      leaf.scale.set(1.3, 0.7, 1);
      group.add(leaf);
    }
  }

  _buildBall() {
    const ball = new THREE.Group();
    this.ball = ball;
    this.scene.add(ball);

    this.shellRedMat = new THREE.MeshPhysicalMaterial({
      color: 0xd61f2a,
      roughness: 0.24,
      metalness: 0.08,
      clearcoat: 1,
      clearcoatRoughness: 0.08,
      envMapIntensity: 0.8
    });
    this.shellWhiteMat = new THREE.MeshPhysicalMaterial({
      color: 0xf4f3ee,
      roughness: 0.26,
      metalness: 0.05,
      clearcoat: 0.9,
      clearcoatRoughness: 0.1
    });
    this.bandMat = new THREE.MeshPhysicalMaterial({
      color: 0x151517,
      roughness: 0.3,
      metalness: 0.35,
      clearcoat: 0.7
    });
    this.buttonMat = new THREE.MeshStandardMaterial({
      color: 0xf7f7f2,
      roughness: 0.25,
      metalness: 0.05,
      emissive: 0xff2f2a,
      emissiveIntensity: 0
    });

    const top = new THREE.Mesh(
      new THREE.SphereGeometry(0.5, 56, 32, 0, Math.PI * 2, 0, Math.PI / 2),
      this.shellRedMat
    );
    top.castShadow = true;
    ball.add(top);

    const bottom = new THREE.Mesh(
      new THREE.SphereGeometry(0.5, 56, 32, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2),
      this.shellWhiteMat
    );
    bottom.castShadow = true;
    ball.add(bottom);

    const band = new THREE.Mesh(
      new THREE.CylinderGeometry(0.507, 0.507, 0.055, 56, 1, true),
      this.bandMat
    );
    ball.add(band);

    const ring = new THREE.Mesh(
      new THREE.CylinderGeometry(0.155, 0.155, 0.05, 36),
      this.bandMat
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.z = 0.485;
    ball.add(ring);

    const ringGlow = new THREE.Mesh(
      new THREE.TorusGeometry(0.152, 0.013, 12, 36),
      new THREE.MeshBasicMaterial({ color: 0xff3b2f, transparent: true, opacity: 0.0, blending: THREE.AdditiveBlending })
    );
    ringGlow.position.z = 0.515;
    this.ringGlow = ringGlow;
    ball.add(ringGlow);

    const button = new THREE.Mesh(
      new THREE.CylinderGeometry(0.105, 0.105, 0.03, 32),
      this.buttonMat
    );
    button.rotation.x = Math.PI / 2;
    button.position.z = 0.51;
    ball.add(button);

    /* Soft glow behind the ball */
    this.glowSprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: this._radialTexture(),
      color: 0xff7a4a,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    }));
    this.glowSprite.scale.set(2.4, 2.4, 1);
    ball.add(this.glowSprite);

    this.ballLight = new THREE.PointLight(0xff4a35, 0, 7, 2);
    ball.add(this.ballLight);

    ball.position.set(0, -1.15, 2.2);
    ball.scale.setScalar(0.55);
  }

  _buildParticles() {
    /* Floating dust motes / fireflies */
    const count = 120;
    const positions = new Float32Array(count * 3);
    const seeds = [];
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 16;
      positions[i * 3 + 1] = Math.random() * 4.5;
      positions[i * 3 + 2] = 2 - Math.random() * 14;
      seeds.push({ x: positions[i * 3], y: positions[i * 3 + 1], z: positions[i * 3 + 2], p: Math.random() * 6.283 });
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      color: 0xffd6a0,
      size: 0.045,
      transparent: true,
      opacity: 0.65,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true
    });
    this.motes = new THREE.Points(geo, mat);
    this.motes.frustumCulled = false;
    this.motes.userData.seeds = seeds;
    this.scene.add(this.motes);
  }

  _radialTexture() {
    if (this._radial) return this._radial;
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const g = c.getContext("2d");
    const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0, "rgba(255,255,255,1)");
    grad.addColorStop(0.35, "rgba(255,210,160,.65)");
    grad.addColorStop(1, "rgba(255,140,80,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    this._radial = tex;
    return tex;
  }

  _resize() {
    if (!this.ready) return;
    const w = this.host.clientWidth || window.innerWidth;
    const h = this.host.clientHeight || window.innerHeight;
    if (w === this.width && h === this.height) return;
    this.width = w;
    this.height = h;
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /* ---------- loop ---------- */
  _startLoop() {
    if (this.running) return;
    this.running = true;
    this.clock.start();
    const tick = () => {
      if (!this.running) return;
      this._frame = requestAnimationFrame(tick);
      const dt = Math.min(this.clock.getDelta(), 0.05);
      this._update(dt);
      this.composer.render();
    };
    this._frame = requestAnimationFrame(tick);
  }

  _stopLoop() {
    this.running = false;
    if (this._frame) cancelAnimationFrame(this._frame);
  }

  _update(dt) {
    this._time = (this._time || 0) + dt;

    this.grassUniforms.time.value = this._time;
    this.wind.value = Math.max(0, this.wind.value - dt * 0.9);

    /* handheld camera breathing from smooth value noise */
    const t = this._time;
    const nx = (noise1(t * 0.5) * 0.7 + noise1(t * 1.9 + 5.1) * 0.3) * 0.03;
    const ny = (noise1(t * 0.31 + 17.3) * 0.7 + noise1(t * 1.37 + 9.4) * 0.3) * 0.022;
    this.camera.position.set(nx, ny, noise1(t * 0.2 + 3.3) * 0.008);
    this.camera.lookAt(this.lookTarget);

    /* motes */
    if (this.motes) {
      const arr = this.motes.geometry.attributes.position.array;
      const seeds = this.motes.userData.seeds;
      for (let i = 0; i < seeds.length; i++) {
        const s = seeds[i];
        arr[i * 3] = s.x + Math.sin(t * 0.5 + s.p) * 0.5;
        arr[i * 3 + 1] = s.y + Math.sin(t * 0.8 + s.p * 2) * 0.25;
        arr[i * 3 + 2] = s.z + Math.cos(t * 0.4 + s.p) * 0.4;
      }
      this.motes.geometry.attributes.position.needsUpdate = true;
    }

    this._updateBursts(dt);
    this._updateTrail();
    this._syncMon();
  }

  /* ---------- mon overlay projection ---------- */
  _syncMon() {
    const img = this.monEl;
    if (!img || !this.ready) return;
    if (this.monFx.opacity <= 0.01) {
      img.style.opacity = "0";
      return;
    }
    const p = this.monAnchor.getWorldPosition(new THREE.Vector3());
    const dist = p.distanceTo(this.camera.getWorldPosition(new THREE.Vector3()));
    const v = p.clone().project(this.camera);
    const x = (v.x * 0.5 + 0.5) * this.width;
    const y = (-v.y * 0.5 + 0.5) * this.height;
    const hPx = (2.4 * this.height) / (2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2) * Math.max(0.5, dist));
    img.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%) scale(${this.monFx.scale})`;
    img.style.height = `${hPx}px`;
    img.style.opacity = String(this.monFx.opacity);
  }

  /* ---------- bursts / trail ---------- */
  _spawnBurst(color, count, origin, spread, size, gravity = -3.2, ttl = 1.2, additive = true) {
    if (!this.ready) return;
    const positions = new Float32Array(count * 3);
    const vels = [];
    for (let i = 0; i < count; i++) {
      positions[i * 3] = origin.x;
      positions[i * 3 + 1] = origin.y;
      positions[i * 3 + 2] = origin.z;
      const dir = new THREE.Vector3(
        (Math.random() - 0.5) * 2,
        Math.random() * 1.1,
        (Math.random() - 0.5) * 2
      ).normalize().multiplyScalar(spread * (0.35 + Math.random() * 0.9));
      vels.push(dir);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      color,
      size,
      map: this._radialTexture(),
      alphaTest: 0.02,
      transparent: true,
      opacity: 1,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      sizeAttenuation: true
    });
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    this.scene.add(pts);
    this.bursts.push({ pts, vels, life: 0, ttl, gravity, baseOpacity: 1 });
  }

  _updateBursts(dt) {
    for (let i = this.bursts.length - 1; i >= 0; i--) {
      const b = this.bursts[i];
      b.life += dt;
      const arr = b.pts.geometry.attributes.position.array;
      for (let j = 0; j < b.vels.length; j++) {
        const v = b.vels[j];
        v.y += b.gravity * dt;
        arr[j * 3] += v.x * dt;
        arr[j * 3 + 1] += v.y * dt;
        arr[j * 3 + 2] += v.z * dt;
        if (arr[j * 3 + 1] < 0.02) {
          arr[j * 3 + 1] = 0.02;
          v.y *= -0.25;
          v.x *= 0.7;
          v.z *= 0.7;
        }
      }
      b.pts.geometry.attributes.position.needsUpdate = true;
      b.pts.material.opacity = Math.max(0, 1 - b.life / b.ttl);
      if (b.life >= b.ttl) {
        this.scene.remove(b.pts);
        b.pts.geometry.dispose();
        b.pts.material.dispose();
        this.bursts.splice(i, 1);
      }
    }
  }

  _clearBursts() {
    this.bursts.forEach(b => {
      this.scene.remove(b.pts);
      b.pts.geometry.dispose();
      b.pts.material.dispose();
    });
    this.bursts = [];
  }

  _leafBurst(count) {
    if (!this.bushGroup) return;
    const origin = new THREE.Vector3(
      this.bushGroup.position.x + (Math.random() - 0.5) * 2.2,
      0.9,
      this.bushGroup.position.z + (Math.random() - 0.5) * 1.4
    );
    this._spawnBurst(0x5d8a3a, count, origin, 1.9, 0.05, -1.8, 1.4, false);
  }

  _clearTrail() {
    if (this.trail) {
      this.scene.remove(this.trail);
      this.trail.geometry.dispose();
      this.trail.material.dispose();
      this.trail = null;
    }
    this.trailPoints = [];
  }

  _updateTrail() {
    if (!this.trail) return;
    const arr = this.trail.geometry.attributes.position.array;
    for (let i = 0; i < this.trailPoints.length; i++) {
      const p = this.trailPoints[i];
      arr[i * 3] = p.x;
      arr[i * 3 + 1] = p.y;
      arr[i * 3 + 2] = p.z;
    }
    this.trail.geometry.setDrawRange(0, this.trailPoints.length);
    this.trail.geometry.attributes.position.needsUpdate = true;
  }

  /* ---------- UI helpers ---------- */
  _prompt(text) {
    this.promptEl.textContent = text || "";
    this.promptEl.classList.toggle("show", !!text);
  }

  _showTaps(show) {
    this.tapsEl.classList.toggle("show", !!show);
  }

  _updateDots() {
    [...this.tapsEl.children].forEach((dot, i) => {
      dot.classList.toggle("on", i < this.taps);
    });
  }

  _setState(state) {
    this.state = state;
    this.view.dataset.state = state;
  }

  _flash(strength = 1) {
    this.flashEl.style.setProperty("--flash", String(strength));
    this.flashEl.classList.remove("on");
    void this.flashEl.offsetWidth;
    this.flashEl.classList.add("on");
  }

  _haptic(pattern) {
    try { if (navigator.vibrate) navigator.vibrate(pattern); } catch (e) { /* ignore */ }
  }

  _glow(level) {
    this.glowSprite.material.opacity = Math.min(1, level);
    this.ballLight.intensity = level * 14;
    this.buttonMat.emissiveIntensity = level * 3.2;
    this.ringGlow.material.opacity = Math.min(1, level * 0.9);
    this.bloom.strength = 0.48 + level * 0.8;
  }

  /* ---------- interaction ---------- */
  tap() {
    if (this.state !== STATE.IDLE) return;
    this.audio.ensure();
    if (this.taps === 0) {
      /* If autoplay was blocked, start BGM now (user gesture unlocks it) */
      this.startBGM();
      /* Duck BGM on the very first tap so charge SFX take focus —
         0.32 keeps it clearly audible so the throw-time fadeout is perceptible */
      this.duckBGM(0.32, 400);
    }
    this.taps += 1;
    this.audio.tap(this.taps);
    this._haptic(10 + this.taps * 8);
    this._updateDots();

    gsap.fromTo(this.ball.scale,
      { x: 1, y: 1, z: 1 },
      { x: 1.2, y: 0.86, z: 1.2, duration: 0.11, yoyo: true, repeat: 1, ease: "power2.out", overwrite: true }
    );
    gsap.to(this.ball.rotation, {
      y: this.ball.rotation.y + 0.7 + this.taps * 0.25,
      duration: 0.38,
      ease: "power2.out",
      overwrite: true
    });
    this._glow(0.18 + this.taps * 0.16);

    if (this.taps === 1) this._prompt("Nice! Tap again…");
    if (this.taps === 2) this._prompt("One more tap!");
    if (this.taps >= 3) {
      this._setState(STATE.CHARGING);
      this._beginThrow();
    }
  }

  _beginThrow() {
    this._showTaps(false);
    this._prompt("Throw!");
    this.audio.charge();
    this._haptic([25, 45, 25]);
    this._glow(1);
    this._flash(0.55);
    /* From the throw, BGM fades LINEARLY to silence — reaching 0 exactly at the 3rd shake (~6.2s) */
    this.duckBGM(0, 6200);

    /* Short hit-stop before the throw */
    setTimeout(() => {
      if (this.state !== STATE.CHARGING) return;
      this._setState(STATE.THROWING);
      this.audio.throwBall();

      const start = this.ball.position.clone();
      const end = BUSH_POS.clone();
      const control = new THREE.Vector3(0, 5.4, -0.4);
      const curve = new THREE.QuadraticBezierCurve3(start, control, end);
      const proxy = { t: 0 };

      /* motion trail */
      this._clearTrail();
      const posArr = new Float32Array(28 * 3);
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(posArr, 3));
      geo.setDrawRange(0, 0);
      const mat = new THREE.PointsMaterial({
        color: 0xffb066,
        size: 0.11,
        transparent: true,
        opacity: 0.8,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      });
      this.trail = new THREE.Points(geo, mat);
      this.trail.frustumCulled = false;
      this.scene.add(this.trail);

      gsap.to(proxy, {
        t: 1,
        duration: 0.82,
        ease: "power1.in",
        onUpdate: () => {
          const p = curve.getPoint(proxy.t);
          this.ball.position.copy(p);
          this.ball.rotation.x += 0.28;
          this.ball.rotation.z += 0.11;
          if (this.trailPoints.length >= 28) this.trailPoints.shift();
          this.trailPoints.push(p.clone());
          this.wind.value = 0.7 + proxy.t * 1.4;
        },
        onComplete: () => {
          this.ball.rotation.set(0, 0, 0);
          this._impact();
        }
      });

      gsap.to(this.cameraRig.position, { ...CAM_THROW, duration: 0.82, ease: "power1.in" });
      gsap.to(this.lookTarget, { ...LOOK_THROW, duration: 0.82, ease: "power1.in" });
      gsap.to(this.bokeh.uniforms.focus, { value: 8.5, duration: 0.82 });
      this._glow(0.35);
    }, 170);
  }

  _impact() {
    this._setState(STATE.IMPACT);
    this.ball.position.copy(BUSH_POS);
    this.ball.scale.setScalar(1);
    this.wind.value = 3;
    this.audio.impact();
    this._haptic(45);
    this._flash(0.35);
    this._spawnBurst(0xc9b185, 42, BUSH_POS, 2.4, 0.07, -2.6, 1.1, false);
    this._leafBurst(30);
    if (this.trail) {
      gsap.to(this.trail.material, { opacity: 0, duration: 0.45, onComplete: () => this._clearTrail() });
    }

    /* camera dolly-in close-up */
    gsap.to(this.cameraRig.position, { ...CAM_CLOSE, duration: 0.95, ease: "power3.inOut" });
    gsap.to(this.lookTarget, { ...LOOK_CLOSE, duration: 0.95, ease: "power3.inOut" });
    gsap.to(this.camera, {
      fov: this.camera.aspect < 0.9 ? 66 : 40,
      duration: 0.95,
      ease: "power3.inOut",
      onUpdate: () => this.camera.updateProjectionMatrix()
    });
    gsap.to(this.bokeh.uniforms.focus, { value: 2.2, duration: 0.95, ease: "power2.inOut" });
    gsap.to(this.bokeh.uniforms.aperture, { value: 0.0032, duration: 0.95 });
    gsap.to(this.bloom, { strength: 0.95, duration: 0.5 });

    /* ball settles into the grass with a small bounce */
    gsap.fromTo(this.ball.position,
      { y: BUSH_POS.y + 0.5 },
      { y: BUSH_POS.y, duration: 0.55, ease: "bounce.out" }
    );

    /* red silhouette + absorption beam */
    setTimeout(() => this._absorbPokemon(), 180);
    setTimeout(() => this._startShakes(), 1250);
  }

  _absorbPokemon() {
    this.audio.absorb();
    this.monAnchor = this.monAnchor || (() => {
      const a = new THREE.Object3D();
      a.position.set(0, 1.25, -7.85);
      this.scene.add(a);
      return a;
    })();

    this.monEl.classList.add("is-red", "is-visible");
    this.monFx.scale = 0.95;
    this.monFx.opacity = 1;
    this._syncMon();

    gsap.fromTo(this.monFx,
      { scale: 0.55, opacity: 0.15 },
      {
        scale: 1,
        opacity: 1,
        duration: 0.2,
        ease: "power2.out",
        onUpdate: () => this._syncMon()
      }
    );
    gsap.to(this.monFx, {
      scale: 0.04,
      opacity: 0,
      duration: 0.5,
      delay: 0.24,
      ease: "power3.in",
      onUpdate: () => this._syncMon()
    });

    /* red energy line from the Pokémon into the ball */
    const from = this.monAnchor.getWorldPosition(new THREE.Vector3());
    const geo = new THREE.BufferGeometry().setFromPoints([from, BUSH_POS.clone()]);
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({
      color: 0xff3b2f,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    }));
    this.scene.add(line);
    gsap.to(line.material, {
      opacity: 0,
      duration: 0.55,
      delay: 0.25,
      onComplete: () => {
        this.scene.remove(line);
        geo.dispose();
        line.material.dispose();
      }
    });
    this._spawnBurst(0xff4535, 36, BUSH_POS, 1.6, 0.08, -1.2, 0.9, true);
    this._glow(0.75);
  }

  _startShakes() {
    this._setState(STATE.SHAKING);
    this._prompt("");
    this.ball.rotation.set(0, 0, 0);

    this.shakeTl = gsap.timeline();
    this.shakeTl
      .call(() => { this.audio.wobble(1); this._haptic(18); }, null, 0.02)
      .to(this.ball.rotation, { z: 0.35, duration: 0.18, ease: "power2.out" }, 0)
      .to(this.ball.rotation, { z: 0, duration: 0.32, ease: "elastic.out(1, 0.45)" }, 0.2)
      .to({}, { duration: 0.5 }, 0.55)
      .call(() => { this.audio.wobble(2); this._haptic(26); }, null, 1.02)
      .to(this.ball.rotation, { z: -0.52, duration: 0.24, ease: "power2.out" }, 1.0)
      .to(this.ball.rotation, { z: 0, duration: 0.55, ease: "elastic.out(1, 0.4)" }, 1.28)
      .to({}, { duration: 0.5 }, 1.85)
      .call(() => { this.audio.wobble(3); this._haptic(34); }, null, 2.38)
      .to(this.ball.rotation, { z: 0.6, duration: 0.42, ease: "power2.inOut" }, 2.36)
      .to(this.ball.rotation, { z: 0, duration: 0.92, ease: "sine.inOut" }, 2.85)
      .call(() => {
        this._setState(STATE.SUSPENSE);
        this._prompt("…");
        this._glow(0);
        this.bloom.strength = 0.38;
        this.stopBGM(200);  /* volume already ~0 here — just pause + rewind */
      }, null, 3.95)
      .to({}, { duration: 0.75 }, 4.0)
      .call(() => {
        if (Math.random() < CAUGHT_RATE) this._gotcha();
        else this._escape();
      }, null, 4.75);
  }

  _gotcha() {
    this._setState(STATE.GOTCHA);
    this.audio.gotcha();
    this.audio.jingle();
    this._haptic([30, 55, 30, 55, 45]);
    this._flash(0.9);
    this._glow(1.6);
    setTimeout(() => {
      this._glow(0);
      this.buttonMat.emissiveIntensity = 0;
      this.ringGlow.material.opacity = 0;
    }, 120);
    gsap.to(this.bloom, { strength: 1.5, duration: 0.12, yoyo: true, repeat: 1 });

    const ballPos = this.ball.position.clone();
    this._spawnBurst(0xfff3b0, 70, ballPos, 2.6, 0.1, -1.6, 1.35, true);
    this._spawnBurst(0xffffff, 40, ballPos, 2.0, 0.07, -1.2, 1.1, true);

    let info = null;
    try {
      info = this.onCaught ? this.onCaught({ dexId: this.dexId, name: this.monName }) : null;
    } catch (e) { /* keep going even if the save layer fails */ }
    this._resultInfo = info || {};

    const isDupe = !!(info && info.isDupe);
    const resultDex = (info && info.dexId) || this.dexId;
    const resultName = (info && info.name) || this.monName;
    this._captureResult = { caught: true, dexId: resultDex, name: resultName };
    this.resultImg.onerror = () => {
      this.resultImg.onerror = null;
      this.resultImg.src = window.spriteURL ? window.spriteURL(resultDex) : this.monEl.src;
    };
    this.resultImg.src = window.animatedURL ? window.animatedURL(resultDex) : this.monEl.src;
    this.resultName.textContent = resultName;
    this.resultSub.textContent = isDupe
      ? "Already in your Pokédex — EV +1"
      : "NEW! Added to your Pokédex";
    this.resultEl.classList.add("show");
    this._prompt("Gotcha!");

    if (!isDupe) {
      setTimeout(() => {
        try {
          if (typeof Pokedex !== "undefined") Pokedex.playCry(this.dexId);
        } catch (e) { /* ignore */ }
      }, 420);
    }

    this.finishTimer = setTimeout(() => this._finish(), 3000);
  }

  _escape() {
    this._setState(STATE.ESCAPE);
    this.audio.breakFree();
    this._haptic([50, 40, 60, 40]);
    this._flash(0.55);
    this._prompt("Oh no! It broke free!");

    /* Ball shakes harder, then bursts open */
    const burst = gsap.timeline();
    burst
      .to(this.ball.rotation, { z: -0.9, duration: 0.12, ease: "power2.inOut" }, 0)
      .to(this.ball.rotation, { z: 0.9, duration: 0.12, ease: "power2.inOut" }, 0.14)
      .to(this.ball.rotation, { z: -1.2, duration: 0.1, ease: "power2.inOut" }, 0.28)
      .to(this.ball.scale, { x: 1.8, y: 1.8, z: 1.8, duration: 0.18, ease: "power2.out" }, 0.28)
      .to(this.ball.scale, { x: 0.01, y: 0.01, z: 0.01, duration: 0.1, ease: "power2.in" }, 0.44)
      .call(() => { this.ball.visible = false; }, null, 0.54);

    this._escapeTimers = [];
    const _setET = (fn, ms) => this._escapeTimers.push(setTimeout(fn, ms));

    /* Particles from broken ball */
    _setET(() => {
      this._spawnBurst(0xff3b2f, 38, this.ball.position.clone(), 2.2, 0.09, -1.8, 1.2, true);
      this._spawnBurst(0xffffff, 22, this.ball.position.clone(), 1.6, 0.06, -1.4, 0.9, true);
      this._glow(1.2);
    }, 450);

    /* Pokémon bursts out angry, then runs off */
    _setET(() => {
      this.monEl.classList.add("is-red", "is-visible");
      this.monEl.classList.add("is-angry");
      this.monFx.scale = 0.3;
      this.monFx.opacity = 0;
      this._syncMon();

      gsap.to(this.monFx, {
        scale: 1.35,
        opacity: 1,
        duration: 0.25,
        ease: "back.out(2.2)",
        onUpdate: () => this._syncMon()
      });
      gsap.to(this.monFx, {
        scale: 1.0,
        duration: 0.3,
        delay: 0.28,
        ease: "power2.out",
        onUpdate: () => this._syncMon()
      });
      /* angry hop */
      gsap.to(this.monAnchor.position, {
        y: 1.55,
        duration: 0.18,
        delay: 0.3,
        ease: "power2.out",
        yoyo: true,
        repeat: 1,
        onUpdate: () => this._syncMon()
      });
    }, 500);

    /* Run off to the right */
    _setET(() => {
      gsap.to(this.monAnchor.position, {
        x: 5.5,
        y: 1.25,
        z: -6.0,
        duration: 0.9,
        ease: "power3.in",
        onUpdate: () => this._syncMon(),
        onComplete: () => {
          this.monFx.opacity = 0;
          this._syncMon();
          this.monEl.classList.remove("is-visible", "is-red", "is-angry");
        }
      });
      /* running bounce */
      const runBounce = gsap.timeline({ repeat: 3, repeatDelay: 0.02 });
      runBounce
        .to(this.monAnchor.position, { y: 1.45, duration: 0.1, ease: "power2.out", onUpdate: () => this._syncMon() }, 0)
        .to(this.monAnchor.position, { y: 1.15, duration: 0.1, ease: "power2.in", onUpdate: () => this._syncMon() }, 0.1);
    }, 1000);

    /* Show result card */
    this._captureResult = { caught: false, dexId: this.dexId, name: this.monName };
    this._resultInfo = {};

    _setET(() => {
      if (this.resultTitle) this.resultTitle.textContent = "Oh no!";
      this.resultImg.onerror = () => {
        this.resultImg.onerror = null;
        this.resultImg.src = window.spriteURL ? window.spriteURL(this.dexId) : this.monEl.src;
      };
      this.resultImg.src = window.animatedURL ? window.animatedURL(this.dexId) : this.monEl.src;
      this.resultName.textContent = this.monName;
      this.resultSub.textContent = "It broke free! Try again next time.";
      this.resultEl.classList.add("show", "is-escape");
      this._prompt("Better luck next time!");
      this.finishTimer = setTimeout(() => this._finish(), 3500);
    }, 2300);
  }

  _finish() {
    if (this._finished) return;
    this._finished = true;
    if (this.finishTimer) { clearTimeout(this.finishTimer); this.finishTimer = null; }
    this._setState(STATE.DONE);
    this._stopLoop();
    const cap = this._captureResult || { caught: true, dexId: this.dexId, name: this.monName };
    const result = {
      caught: !!cap.caught,
      ...cap,
      ...(this._resultInfo || {})
    };
    if (typeof this.onComplete === "function") {
      try { this.onComplete(result); } catch (e) { /* ignore */ }
    }
    if (this._resolve) this._resolve(result);
  }
}

/* Expose to the classic scripts */
window.PokemonCaptureScene = PokemonCaptureScene;
window.CaptureScene = new PokemonCaptureScene();

/* ------ dev shortcut: type __testCapture() in console to skip straight to capture ------ */
if (_IS_DEV) {
  window.__testCapture = function(opts = {}) {
    const scene = window.CaptureScene;
    if (!scene || !scene.isSupported()) {
      console.warn("WebGL not supported — can't run capture scene.");
      return;
    }
    const force = opts.force;          // 0 = always escape, 1 = always catch, undefined = normal 80%
    let chainKey = null;
    try { chainKey = Gacha.pickChain(Gacha.rollRarity("normal")); } catch (e) { /* ignore */ }
    const chains = (typeof EVOLUTION_CHAINS !== "undefined") ? EVOLUTION_CHAINS : [];
    let chain = chains.find(c => c.key === chainKey);
    if (!chain) chain = chains[0];
    if (!chain) { console.warn("EVOLUTION_CHAINS not loaded."); return; }
    const [dexId, name] = chain.stages[0];

    if (typeof window.__setCatchRate === "function" && (force === 0 || force === 1)) {
      window.__setCatchRate(force);
    }

    App && App.showView && App.showView("view-capture");
    scene.primeAudio();
    scene.play({
      dexId, name,
      onCaught: () => {
        let isDupe = false;
        try { if (typeof obtainPokemon === "function") isDupe = obtainPokemon(chainKey, "normal").isDupe; } catch (e) {}
        return { isDupe, dexId, name };
      }
    }).then(r => {
      if (typeof window.__setCatchRate === "function" && (force === 0 || force === 1)) window.__setCatchRate(0.8);
      console.log("[testCapture] result:", r);
    });
  };
}
