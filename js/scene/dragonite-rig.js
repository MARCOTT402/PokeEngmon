// @ts-check
/* ============================================================
   PokeEngmon - 快龍分層 rig（扭蛋「快龍空投」；spec .trae/specs/20261107-gacha-redesign.md §4「快龍 rig」）
   assets/gacha/dnite-{wing,tail,body,arm}.png：同一 640×829 座標系，疊返同原圖一樣，各自繞關節轉。
   - 拍翼：上拍（翼 −36°、身沉）0.26s → 下拍（翼 +26°、身升）0.18s；下拍尾段 call rig.onDown（拍翼聲／吹塵）
   - 尾擺 −5° ↔ +7°；faceTo 用 scaleX 翻面；hold 將任何 node 掛喺手（波／蛋）
   - 排版同關節用 inline style，唔靠 style.css（rig 可以喺任何容器用）
   需要全域 gsap（vendor/gsap）；make() 只喺瀏覽器 call。
   ============================================================ */

/** @typedef {{ x: number, y: number }} Pt */

const DragoniteRig = {
  PIVOT: { wing: "53.9% 35%", tail: "71% 72.4%", arm: "22.7% 39.8%" },
  HAND: { left: "7%", top: "33%" },
  ART: "assets/gacha/dnite-",

  /** cubic bezier @param {Pt[]} P 4 個控制點 @param {number} t 0–1 @returns {Pt} */
  bez(P, t) {
    const u = 1 - t, a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
    return { x: a * P[0].x + b * P[1].x + c * P[2].x + d * P[3].x, y: a * P[0].y + b * P[1].y + c * P[2].y + d * P[3].y };
  },

  /** 空氣透視：k = 0（遠）→ 1（近） @param {number} k */
  depthFilter(k) {
    return `blur(${((1 - k) * 1.8).toFixed(2)}px) brightness(${(0.5 + 0.5 * k).toFixed(2)}) saturate(${(0.55 + 0.45 * k).toFixed(2)}) ` +
      `drop-shadow(0 ${(4 + 12 * k).toFixed(0)}px ${(6 + 12 * k).toFixed(0)}px rgba(0,0,0,.45))`;
  },

  /**
   * 喺 el 入面砌 rig（el 要有闊度；高度由 aspect-ratio 640/829 決定）。
   * @param {HTMLElement} el
   */
  make(el) {
    const layer = "position:absolute;inset:0;width:100%;height:100%;display:block;";
    const img = (/** @type {string} */ n) => `<img class="rl rl-${n}" src="${this.ART}${n}.png" alt="" draggable="false" style="${layer}transform-origin:${n === "wing" ? this.PIVOT.wing : this.PIVOT.tail}">`;
    el.style.aspectRatio = "640 / 829";
    el.innerHTML = `<div class="rig-face" style="position:absolute;inset:0"><div class="rig-bob" style="position:absolute;inset:0">
      ${img("wing")}${img("tail")}
      <img class="rl rl-body" src="${this.ART}body.png" alt="" draggable="false" style="${layer}">
      <div class="rl rl-arm" style="${layer}transform-origin:${this.PIVOT.arm}"><img src="${this.ART}arm.png" alt="" draggable="false" style="${layer}">
        <div class="rig-hand" style="position:absolute;left:${this.HAND.left};top:${this.HAND.top};width:0;height:0"></div></div>
    </div></div>`;
    const q = (/** @type {string} */ s) => /** @type {HTMLElement} */ (el.querySelector(s));
    const g = /** @type {any} */ (globalThis).gsap;
    const rig = {
      el, wing: q(".rl-wing"), tail: q(".rl-tail"), bob: q(".rig-bob"), arm: q(".rl-arm"), face: q(".rig-face"), hand: q(".rig-hand"),
      dir: 1, pos: { x: 0, y: 0, s: 1 },
      /** @type {(() => void) | null} */ onDown: null,
      flapTl: /** @type {any} */ (null), tailTl: /** @type {any} */ (null),
      /** 拍翼速度（1 = 一下 0.44s） @param {number} k */
      speed(k) { if (rig.flapTl) rig.flapTl.timeScale(k); },
      /** @param {1|-1} d 1 = 原圖方向（面向左） */
      faceTo(d) { if (d === rig.dir) return; rig.dir = d; g.to(rig.face, { scaleX: d, duration: 0.3, ease: "power2.inOut" }); },
      /** 將 node 掛喺手（中心對準手） @param {HTMLElement} node */
      hold(node) {
        rig.hand.innerHTML = "";
        rig.hand.appendChild(node);
        g.set(node, { position: "absolute", left: 0, top: 0, xPercent: -50, yPercent: -50 });
        return node;
      },
      /** @param {number} x @param {number} y @param {number} s @param {number} rot @param {number} k 透視 0–1 */
      place(x, y, s, rot, k) {
        rig.pos = { x, y, s };
        g.set(el, { left: x, top: y, scale: s, rotate: rot, filter: DragoniteRig.depthFilter(k) });
      },
      kill() {
        if (rig.flapTl) rig.flapTl.kill();
        if (rig.tailTl) rig.tailTl.kill();
        g.killTweensOf([el, rig.face, rig.bob, rig.arm, rig.wing, rig.tail]);
        rig.onDown = null;
      }
    };
    rig.flapTl = g.timeline({ repeat: -1 })
      .to(rig.wing, { rotate: -36, scaleY: 0.9, duration: 0.26, ease: "sine.inOut" }, 0)
      .to(rig.bob, { yPercent: 1.4, duration: 0.26, ease: "sine.inOut" }, 0)
      .to(rig.wing, { rotate: 26, scaleY: 1.05, duration: 0.18, ease: "power2.in" }, 0.26)
      .to(rig.bob, { yPercent: -1.8, duration: 0.18, ease: "power1.out" }, 0.26)
      .call(() => { if (rig.onDown) rig.onDown(); }, null, 0.42);
    g.set(rig.tail, { rotate: -5 });
    rig.tailTl = g.to(rig.tail, { rotate: 7, duration: 0.95, ease: "sine.inOut", yoyo: true, repeat: -1 });
    return rig;
  }
};

Object.assign(globalThis, { DragoniteRig });
