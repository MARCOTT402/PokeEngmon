// @ts-check
/* ============================================================
   PokeEngmon - 孵化器蛋圖（plan Task 3.3；由 tools/prototype/incubator/incubator.js eggArt 搬入）
   一幅 SVG（viewBox -52 -64 104 128），裂紋 .crk.c1–c4 由 showCracks 逐級顯示；
   孵蛋小視窗用同一幅 SVG clip 成三塊殼（css/incubator.css .ih-egg .p-*）。
   tier：plain（Common）／great（Rare）／ultra（Epic）／master（Legendary）。
   ============================================================ */

const IncubatorArt = (() => {
  const EGG_D = "M0 -60 C30 -60 48 -12 48 16 C48 45 27 62 0 62 C-27 62 -48 45 -48 16 C-48 -12 -30 -60 0 -60Z";
  /** @type {Record<string, string>} */
  const TIER = { normal: "plain", rare: "great", epic: "ultra", legend: "master" };
  /** @type {Record<string, string>} */
  const COL = { plain: "#c9a26b", great: "#4aa8ff", ultra: "#ffc93c", master: "#c77dff" };
  /** @type {Record<string, string>} */
  const RAR_NAME = { normal: "COMMON", rare: "RARE", epic: "EPIC", legend: "LEGENDARY" };
  /** @type {Record<string, string>} */
  const EGG_NAME = { normal: "PLAIN EGG", rare: "SPOTTED EGG", epic: "GOLDEN EGG", legend: "RAINBOW EGG" };

  /** @param {string} type */
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

  const DEFS = `<svg width="0" height="0" style="position:absolute" aria-hidden="true" id="incu-defs"><defs>
    <radialGradient id="incu-shade" cx="34%" cy="26%" r="80%"><stop offset="0" stop-color="#fff" stop-opacity=".6"/><stop offset=".35" stop-color="#fff" stop-opacity="0"/><stop offset=".8" stop-color="#000" stop-opacity=".18"/><stop offset="1" stop-color="#000" stop-opacity=".45"/></radialGradient>
    <filter id="incu-crkglow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="2.2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    <clipPath id="incu-eggclip"><path d="${EGG_D}"/></clipPath>
    <linearGradient id="incu-egold" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff6d6"/><stop offset=".5" stop-color="#ffe08a"/><stop offset="1" stop-color="#e9b43c"/></linearGradient>
    <linearGradient id="incu-eprism" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffb3e6"/><stop offset=".25" stop-color="#b3e0ff"/><stop offset=".5" stop-color="#d9ffb3"/><stop offset=".75" stop-color="#fff2b3"/><stop offset="1" stop-color="#e0b3ff"/></linearGradient>
  </defs></svg>`;

  return {
    TIER, COL, RAR_NAME, EGG_NAME,
    /** 稀有度 → 殼色 @param {string} rarity */
    color(rarity) { return COL[TIER[rarity] || "plain"]; },
    /** @param {string} tier */
    eggSVG(tier) { return `<svg viewBox="-52 -64 104 128" aria-hidden="true">${eggArt(tier)}</svg>`; },
    /** 共用 gradient／filter（插入一次） */
    ensureDefs() {
      if (typeof document === "undefined" || document.getElementById("incu-defs")) return;
      document.body.insertAdjacentHTML("afterbegin", DEFS);
    },
    /** 顯示頭 n 級裂紋 @param {ParentNode} root @param {number} n */
    showCracks(root, n) {
      for (let i = 1; i <= 4; i++) {
        root.querySelectorAll(".c" + i).forEach((el) => { /** @type {SVGElement} */ (el).style.opacity = i <= n ? "1" : "0"; });
      }
    }
  };
})();

Object.assign(globalThis, { IncubatorArt });
