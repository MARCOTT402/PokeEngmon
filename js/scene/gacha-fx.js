// @ts-check
/* ============================================================
   PokeEngmon - 扭蛋演出素材（快龍空投；prototype tools/prototype/gacha-v2-prototype.html）
   - 精靈球：同一幅 SVG 用兩個 viewBox 切成上下兩半，開球時兩半分開飛；三條裂紋（撳 3 下開）
   - 粒子：canvas 火花／星／彩紙／塵（演出 overlay 用）
   純素材，唔掂經濟；由 js/gacha/scene.js 調用。
   ============================================================ */

/** @typedef {"great"|"ultra"|"master"} BallType */

const GachaFX = {
  CAP: { great: "#2f7fe0", ultra: "#22252e", master: "#7b3fb0" },

  /** 共用 SVG defs（陰影、裂紋發光）；只注入一次 */
  ensureDefs() {
    if (typeof document === "undefined" || document.getElementById("gfx-defs")) return;
    document.body.insertAdjacentHTML("afterbegin", `<svg id="gfx-defs" width="0" height="0" style="position:absolute" aria-hidden="true"><defs>
      <radialGradient id="gfx-shade" cx="34%" cy="26%" r="80%"><stop offset="0" stop-color="#fff" stop-opacity=".6"/><stop offset=".35" stop-color="#fff" stop-opacity="0"/><stop offset=".8" stop-color="#000" stop-opacity=".18"/><stop offset="1" stop-color="#000" stop-opacity=".45"/></radialGradient>
      <filter id="gfx-crkglow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="2.2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    </defs></svg>`);
  },

  /** @param {BallType} type */
  ballArt(type) {
    let deco = "";
    if (type === "great") deco = `<path d="M-45 -21 Q-40 -34 -28 -42 L-19 -33 Q-29 -27 -34 -15Z" fill="#e8413a"/><path d="M45 -21 Q40 -34 28 -42 L19 -33 Q29 -27 34 -15Z" fill="#e8413a"/>`;
    if (type === "ultra") deco = `<path d="M-50 0 A50 50 0 0 1 -30 -40 L-21 -28 A35 35 0 0 0 -35 0Z" fill="#f6c933"/><path d="M50 0 A50 50 0 0 0 30 -40 L21 -28 A35 35 0 0 1 35 0Z" fill="#f6c933"/>`;
    if (type === "master") deco = `<circle cx="-27" cy="-24" r="9" fill="#ec5fa4"/><circle cx="27" cy="-24" r="9" fill="#ec5fa4"/><path d="M-11 -14 L-11 -34 L0 -22 L11 -34 L11 -14" fill="none" stroke="#fff" stroke-width="5" stroke-linejoin="round"/>`;
    return `<path d="M-50 0 A50 50 0 0 1 50 0Z" fill="${this.CAP[type]}"/>${deco}
      <path d="M-50 0 A50 50 0 0 0 50 0Z" fill="#f3f4f8"/>
      <circle r="50" fill="url(#gfx-shade)"/>
      <rect x="-50" y="-4.5" width="100" height="9" fill="#14151b"/>
      <circle r="50" fill="none" stroke="#111" stroke-width="3.5"/>
      <circle r="15" fill="#14151b"/><circle r="10" fill="#fafafa"/><circle r="6.5" fill="none" stroke="#d6d8e0" stroke-width="1.5"/>
      <g fill="none" stroke="var(--rc)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" filter="url(#gfx-crkglow)">
        <path class="crk c1" d="M-6 -49 L0 -36 L-10 -26 L-3 -14 L-8 -5"/>
        <path class="crk c2" d="M33 -37 L24 -27 L34 -18 L26 -5"/>
        <path class="crk c3" d="M-38 -31 L-28 -22 L-36 -13 L-26 -5 M-30 6 L-22 16 L-32 26"/>
      </g>`;
  },

  /** @param {BallType} type @param {"top"|"bot"} half */
  ballSVG(type, half) {
    return `<svg viewBox="${half === "top" ? "-55 -55 110 55" : "-55 0 110 55"}" aria-hidden="true">${this.ballArt(type)}</svg>`;
  },

  /** 精靈球 DOM（`.gfx-ball`；樣式喺 css/style.css「快龍空投」段） @param {BallType} type @param {number} size px */
  makeBall(type, size) {
    this.ensureDefs();
    const d = document.createElement("div");
    d.className = "gfx-ball";
    d.dataset.type = type;
    d.style.width = d.style.height = size + "px";
    d.innerHTML = `<div class="gfx-shadow"></div><div class="gfx-aura"></div><div class="gfx-hw top">${this.ballSVG(type, "top")}</div><div class="gfx-hw bot">${this.ballSVG(type, "bot")}</div><div class="gfx-leak"></div>`;
    return d;
  },

  /** @param {HTMLElement} d @param {BallType} type */
  setBallType(d, type) {
    d.dataset.type = type;
    const top = d.querySelector(".gfx-hw.top"), bot = d.querySelector(".gfx-hw.bot");
    if (top) top.innerHTML = this.ballSVG(type, "top");
    if (bot) bot.innerHTML = this.ballSVG(type, "bot");
  },

  /**
   * canvas 粒子系統（只喺有粒子時跑 rAF）。
   * @param {HTMLCanvasElement} cv
   */
  makeParticles(cv) {
    /** @type {any[]} */
    const ps = [];
    const o = {
      w: 0, h: 0, raf: 0, reduced: false,
      /** @type {CanvasRenderingContext2D|null} */ c: null,
      resize() {
        const r = cv.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
        o.w = r.width; o.h = r.height;
        cv.width = Math.max(1, r.width * dpr); cv.height = Math.max(1, r.height * dpr);
        o.c = cv.getContext("2d"); if (o.c) o.c.setTransform(dpr, 0, 0, dpr, 0, 0);
      },
      clear() { ps.length = 0; },
      /** @param {any} p */
      add(p) {
        if (o.reduced && Math.random() < 0.8) return;
        if (ps.length > 500) return;
        ps.push(Object.assign({ life: 0, g: 0, drag: 0.97, size: 3, kind: "spark", rot: 0, vr: 0 }, p));
        if (!o.raf) o.raf = requestAnimationFrame(o.tick);
      },
      /** @param {number} x @param {number} y @param {number} n @param {string[]} cols @param {number} sp @param {any} [opt] */
      burst(x, y, n, cols, sp, opt = {}) {
        for (let i = 0; i < n; i++) {
          const a = Math.random() * Math.PI * 2, v = sp * (0.35 + Math.random());
          o.add({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - (opt.up || 0), g: opt.g ?? 0.12, max: (opt.life || 50) * (0.6 + Math.random() * 0.7),
            size: (opt.size || 3) * (0.5 + Math.random()), color: cols[i % cols.length], kind: opt.kind || "spark", rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4, drag: opt.drag ?? 0.965 });
        }
      },
      /** @param {number} x @param {number} y @param {number} [n] */
      dust(x, y, n = 18) {
        for (let i = 0; i < n; i++) {
          const dir = Math.random() < 0.5 ? -1 : 1;
          o.add({ x: x + dir * Math.random() * 10, y, vx: dir * (1.5 + Math.random() * 4), vy: -Math.random() * 1.6, g: 0.02, max: 40 + Math.random() * 30, size: 8 + Math.random() * 12, color: "rgba(200,190,255,.35)", kind: "dust", drag: 0.94 });
        }
      },
      /** @param {number} x @param {number} y @param {string} color */
      trail(x, y, color) {
        o.add({ x: x + (Math.random() - 0.5) * 10, y: y + (Math.random() - 0.5) * 10, vx: (Math.random() - 0.5) * 0.8, vy: -0.3 - Math.random() * 0.6, max: 26 + Math.random() * 16, size: 3 + Math.random() * 4, color, drag: 0.98 });
      },
      tick() {
        const c = o.c;
        if (!c) { o.raf = 0; return; }
        c.clearRect(0, 0, o.w, o.h);
        for (let i = ps.length - 1; i >= 0; i--) {
          const p = ps[i];
          p.life++; p.vx *= p.drag; p.vy = p.vy * p.drag + p.g; p.x += p.vx; p.y += p.vy; p.rot += p.vr;
          const k = 1 - p.life / p.max;
          if (k <= 0) { ps.splice(i, 1); continue; }
          if (p.kind === "dust") {
            c.globalCompositeOperation = "source-over"; c.globalAlpha = k * 0.8; c.fillStyle = p.color;
            c.beginPath(); c.arc(p.x, p.y, p.size * (1.6 - k * 0.6), 0, 7); c.fill();
          } else if (p.kind === "confetti") {
            c.globalCompositeOperation = "source-over"; c.globalAlpha = Math.min(1, k * 2); c.fillStyle = p.color;
            c.save(); c.translate(p.x, p.y); c.rotate(p.rot); c.fillRect(-p.size, -p.size * 0.4, p.size * 2, p.size * 0.8); c.restore();
          } else if (p.kind === "star") {
            c.globalCompositeOperation = "lighter"; c.globalAlpha = k; c.fillStyle = p.color;
            c.save(); c.translate(p.x, p.y); c.rotate(p.rot); const s = p.size * 1.6; c.beginPath();
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
        o.raf = ps.length ? requestAnimationFrame(o.tick) : 0;
      }
    };
    return o;
  }
};

Object.assign(globalThis, { GachaFX });
