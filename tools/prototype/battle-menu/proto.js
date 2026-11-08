/* ============================================================
   Battle menu「我嘅訓練員卡」prototype — 喺真 app 上面植入（build.mjs 插喺 </body> 前）
   - 位置：#view-battle-menu 嘅 .bm-hero 同 .battle-mode-grid 中間
   - 人物：直接用已設定嘅頭像（Avatars.mine()），企喺戰鬥場景草地台上；撳人物 → 真 Avatars.openPicker
   - 勝率：st.pvpWins / st.pvpLosses（同 PvP tile 同一個來源）
   - 隊伍：BagUI.getTeam()（背包「My Team」），只顯示；改隊 → BagUI.open()
   - 打 Trainer：略過揀隊頁，直接用 My Team 頭 N 隻（N = playerSlots），Tier 卡顯示會出邊幾隻
   ============================================================ */
(() => {
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const B = () => BattleUI._;
  const PROTO = { pvp: "record", bar: "level" };   /* pvp: record | none | guest；bar: level | rank | off（方案比較） */
  /* 方案示範數據（正式版由 server 計，見 plan） */
  const PROTO_LEVEL = { lv: 12, exp: 340, need: 500 };
  const PROTO_RANK = { tier: "GREAT", cls: "great", rp: 1240, from: 800, to: 1500, next: "ULTRA" };

  /* ---------- 資料（全部用真 app 嘅函數） ---------- */
  const entryOf = uid => loadState().entries.find(e => e.uid === uid);
  const isFaint = e => !!(window.Pet && Pet.isFaint(e));
  function teamInfo() {
    return BagUI.getTeam().map(uid => {
      const e = entryOf(uid); if (!e) return null;
      const [dex, name] = entryCurrentSpecies(e);
      const h = window.Care ? Care.hpOf(e) : { pct: 100, faint: false };
      const sk = window.Care ? Care.statusKey(e.pet) : null;
      return { uid, e, dex, name, lv: e.level || 1, pct: h.pct, faint: h.faint, status: sk };
    }).filter(Boolean);
  }
  /* 出戰：My Team 次序，跳過 Faint，取頭 n 隻 */
  const lineup = n => teamInfo().filter(p => !p.faint).slice(0, n);
  function record() {
    const st = loadState();
    if (PROTO.pvp === "guest") return { guest: true };
    const w = Number(st.pvpWins) || 0, l = Number(st.pvpLosses) || 0;
    return { w, l, total: w + l, pct: w + l ? Math.round(w / (w + l) * 100) : null };
  }

  /* ---------- 卡 ---------- */
  function cardHTML() {
    const st = loadState();
    const av = Avatars.mine();
    const name = st.playerName || "Trainer";
    const r = record();
    const team = teamInfo();
    const hpCls = p => p.faint ? "faint" : p.pct < 20 ? "low" : p.pct <= 50 ? "mid" : "";

    /* 資料牌：名（st.playerName，同 Friends 頁／Settings 一樣）＋ PvP 勝率同一行 ＋ 方案條（見 .trae/documents/20261108-trainer-level-plan.md） */
    const rate = r.guest || !r.total
      ? `<span class="tc-wr-big none">—</span>`
      : `<span class="tc-wr-big">${r.pct}<small>%</small></span>`;
    const wl = r.guest ? `Log in to battle online`
      : !r.total ? `No PvP battles yet`
      : `<b class="w">${r.w}W</b> <b class="l">${r.l}L</b> <span>· ${r.total} battles</span>`;
    const P = PROTO_LEVEL;
    let lvTag = "", bar = "";
    if (PROTO.bar === "level") {
      lvTag = `<span class="tc-lvtag"><i>Lv</i>${P.lv}</span>`;
      bar = `<div class="tc-xp"><span class="lbl">EXP</span><span class="track"><i style="width:${Math.round(P.exp / P.need * 100)}%"></i></span></div>
        <div class="tc-xp-note">${P.exp} / ${P.need} EXP to Lv${P.lv + 1}</div>`;
    } else if (PROTO.bar === "rank") {
      const R = PROTO_RANK;
      lvTag = `<span class="tc-ranktag ${R.cls}">${R.tier}</span>`;
      bar = `<div class="tc-xp rank"><span class="lbl">RP</span><span class="track"><i style="width:${Math.round((R.rp - R.from) / (R.to - R.from) * 100)}%"></i></span></div>
        <div class="tc-xp-note">${R.rp} RP · ${R.to - R.rp} to ${R.next}</div>`;
    }
    const win = `
      <div class="tc-row1"><span class="tc-name">${esc(name)}</span>${lvTag}</div>
      <div class="tc-row2"><span class="tc-wr-lbl">PvP WIN RATE</span>${rate}</div>
      <div class="tc-wr-wl">${wl}</div>
      ${bar}`;

    let slots = "";
    const leadIdx = team.findIndex(p => !p.faint);   /* 暈咗嘅會跳過，第一隻未暈先係真正出場 */
    for (let i = 0; i < 6; i++) {
      const p = team[i];
      if (!p) { slots += `<button type="button" class="tc-slot empty" data-bag aria-label="Empty slot — set team in Bag"><span class="tc-ball" aria-hidden="true"></span></button>`; continue; }
      slots += `<button type="button" class="tc-slot ${i === leadIdx ? "lead" : ""} ${p.faint ? "fnt" : ""}" data-bag
          aria-label="${esc(p.name)}, level ${p.lv}${p.faint ? ", fainted" : ""}" title="${esc(p.name)}">
        <span class="tc-no">${i + 1}</span>
        ${p.status && !p.faint ? `<img class="tc-st" src="assets/battle/ui/status-${Care.STATUS_INFO[p.status].icon}.png" alt="${Care.STATUS_INFO[p.status].label}">` : ""}
        ${p.faint ? `<img class="tc-st" src="assets/battle/ui/status-fnt.png" alt="Fainted">` : ""}
        <img class="tc-spr" src="${animatedURL(p.dex)}" alt="" draggable="false">
        <span class="tc-pname">${esc(p.name)}</span>
        <span class="tc-lv">Lv${p.lv}</span>
        <span class="bag-minihp ${hpCls(p)}"><i style="width:${p.faint ? 0 : p.pct}%"></i></span>
      </button>`;
    }
    const healthy = team.filter(p => !p.faint).length;
    const hint = !team.length
      ? `Your team is empty — add Pokémon in the <b>Bag</b> to battle.`
      : !healthy
        ? `Everyone has fainted — heal them in the <b>Bag</b> first.`
        : healthy < team.length
          ? `Fainted Pokémon are skipped — <b>${esc(team[leadIdx].name)}</b> goes out first.`
          : `Trainer battles send out your team <b>in this order</b>.`;

    return `
      <div class="tc-field">
        <button type="button" class="tc-trainer" id="tc-trainer" aria-label="Change trainer avatar (${esc(Avatars.label(av))})">
          <img src="${Avatars.url(av)}" alt="" draggable="false">
        </button>
        <div class="tc-win">${win}</div>
      </div>
      <div class="tc-team">
        <div class="tc-team-head">
          <span class="tc-team-title"><img src="assets/battle/ui/poke-ball-big.png" alt="">MY TEAM <em>${team.length}/6</em></span>
          <button type="button" class="tc-bag-btn" data-bag>Edit in Bag<span aria-hidden="true">›</span></button>
        </div>
        <div class="tc-slots">${slots}</div>
        <div class="tc-hint ${team.length && healthy ? "" : "warn"}">${hint}</div>
      </div>`;
  }

  function render() {
    const view = $("view-battle-menu"); if (!view) return;
    let card = $("bm-trainer-card");
    if (!card) {
      card = document.createElement("section");
      card.id = "bm-trainer-card"; card.className = "bm-tcard";
      card.setAttribute("aria-label", "Your trainer and team");
      /* 頂部 hero 拎走；PvP／Friends 兩粒掣搬上最頂，改成戰鬥指令框（保留原 id，真 app 嘅 click／文案照用） */
      const inner = view.querySelector(".battle-menu-inner");
      const hero = view.querySelector(".bm-hero");
      if (hero) hero.hidden = true;
      const modes = view.querySelector(".battle-mode-grid");
      buildModes(modes);
      inner.insertBefore(modes, inner.firstChild);
      modes.insertAdjacentElement("afterend", card);
      card.addEventListener("click", e => {
        if (e.target.closest("#tc-trainer")) { Avatars.openPicker(() => render()); return; }
        if (e.target.closest("[data-bag]")) openBag();
      });
    }
    card.innerHTML = cardHTML();
  }

  /* PvP／Friends 指令框：emoji icon 換成遊戲素材；fire-band 裝飾收埋 */
  function buildModes(grid) {
    if (!grid || grid.classList.contains("tc-modes")) return;
    grid.classList.add("tc-modes");
    const pvp = $("battle-menu-pvp"), fr = $("battle-menu-friends");
    const icon = (btn, html) => { const el = btn.querySelector(".bmc-icon"); if (el) el.outerHTML = `<span class="tcm-icon" aria-hidden="true">${html}</span>`; };
    icon(pvp, `<img src="assets/battle/ui/poke-ball-big.png" alt=""><img class="vs" src="assets/battle/ui/poke-ball-big.png" alt="">`);
    icon(fr, `<img src="${Avatars.url("blue")}" alt=""><img src="${Avatars.url("leaf")}" alt="">`);
    [pvp, fr].forEach(b => { const t = b.querySelector(".bmc-title"); if (t && t.firstChild && t.firstChild.nodeType === 3) t.firstChild.textContent = t.firstChild.textContent.trim().toUpperCase() + " "; });
  }

  function openBag() {
    BagUI.open({ from: "battle-menu" });
  }

  /* ---------- 打 Trainer：唔再開揀隊頁 ---------- */
  function patchTeamSelect() {
    const b = B();
    const orig = b.openTeamSelect;
    b.openTeamSelect = function (cb, fixedSize) {
      const S = b.S;
      if (S.mode !== "ai" || fixedSize) return orig.apply(this, arguments);   /* PvP 照舊 */
      if (window.Pet) Pet.runDailyCheck();
      const n = b.playerSlots(S.foeTeamEntries.length, S.aiTier);
      const go = lineup(n);
      if (!go.length) {
        b.toast(teamInfo().length ? "Your team has all fainted — heal them in the Bag first." : "Set up your team in the Bag first.");
        b.openMenu(); setTimeout(openBag, 300); return;
      }
      S.teamEntries = go.map(p => p.e);
      cb();
    };
  }

  /* Tier 卡：「You bring N」下面顯示實際會出嘅幾隻（跟 My Team 次序） */
  function decorateTiers() {
    const body = document.querySelector("#tier-select-modal");
    if (!body) return;
    body.querySelectorAll(".tier-card:not(.locked)").forEach(card => {
      if (card.querySelector(".tc-bring")) return;
      const m = /You bring (\d+)/.exec(card.textContent);
      if (!m) return;
      const n = +m[1], go = lineup(n);
      const short = go.length < n;
      const icons = go.map(p => `<img src="${animatedURL(p.dex)}" alt="${esc(p.name)}" title="${esc(p.name)}">`).join("");
      const html = `<span class="tc-bring ${short ? "short" : ""}">${icons || ""}<small>${!go.length ? "No healthy Pokémon in your team" : short ? `Only ${go.length} ready` : "from My Team"}</small></span>`;
      card.querySelector(".tc-stats").insertAdjacentHTML("afterend", html);
    });
  }

  /* ---------- prototype 控制（唔係產品 UI） ---------- */
  const DEMO_TEAM = ["charmander", "gastly", "pikachu", "squirtle", "dratini", "snorlax"];
  function setTeamSize(n) {
    const st = loadState();
    st.myTeam = DEMO_TEAM.map(k => (st.entries.find(e => e.chainKey === k) || {}).uid).filter(Boolean).slice(0, n);
    saveState();
  }
  function setLeadFaint(on) {
    const st = loadState();
    const e = st.entries.find(x => x.chainKey === "charmander");
    if (e) { e.pet = e.pet || {}; e.pet.hp = on ? 0 : 1000; e.pet.health = on ? 0 : 100; }
    saveState();
  }
  function devPanel() {
    document.body.insertAdjacentHTML("beforeend", `<button id="bmp-dev-btn" type="button" aria-label="Prototype controls">🧪</button>
      <div id="bmp-dev" hidden><h4>🧪 BATTLE MENU PROTOTYPE</h4>
        <label>My Team</label><div class="row"><button data-team="6">6</button><button data-team="3">3</button><button data-team="1">1</button><button data-team="0">Empty</button></div>
        <label>Lead (Charizard)</label><div class="row"><button data-faint="0">Healthy</button><button data-faint="1">Fainted</button></div>
        <label>PvP record</label><div class="row"><button data-pvp="record">23W 14L</button><button data-pvp="none">0 battles</button><button data-pvp="guest">Not logged in</button></div>
        <label>Bar（方案比較）</label><div class="row"><button data-bar="level">A Trainer Lv</button><button data-bar="rank">B PvP Rank</button><button data-bar="off">Off</button></div>
        <label>Trainer name（st.playerName）</label><div class="row"><input id="bmp-name" type="text" maxlength="24" style="flex:1;min-width:0;padding:5px 6px;border:1.5px solid #1b1b22;border-radius:8px;font:inherit"></div>
        <label>Jump to</label><div class="row"><button data-go="menu">Battle menu</button><button data-go="bag">Bag</button></div>
      </div>`);
    $("bmp-dev-btn").onclick = () => { $("bmp-dev").hidden = !$("bmp-dev").hidden; $("bmp-name").value = loadState().playerName || ""; };
    $("bmp-name").addEventListener("input", e => { const st = loadState(); st.playerName = e.target.value || "The PokéEngmon Trainer"; saveState(); render(); });
    $("bmp-dev").addEventListener("click", e => {
      const b = e.target.closest("button"); if (!b) return;
      if (b.dataset.team != null) setTeamSize(+b.dataset.team);
      if (b.dataset.bar) PROTO.bar = b.dataset.bar;
      if (b.dataset.faint != null) setLeadFaint(b.dataset.faint === "1");
      if (b.dataset.pvp) {
        PROTO.pvp = b.dataset.pvp;
        const st = loadState();
        if (PROTO.pvp === "record") { st.pvpWins = 23; st.pvpLosses = 14; } else { st.pvpWins = 0; st.pvpLosses = 0; }
        saveState();
      }
      if (b.dataset.go === "menu") { if (BagUI.isOpen()) BagUI.close(); BattleUI.openMenu(); }
      if (b.dataset.go === "bag") { $("bmp-dev").hidden = true; openBag(); return; }
      render();
    });
  }

  /* ---------- 示範存檔 ---------- */
  const SEED_V = 4;   /* 改咗示範存檔就 +1，舊 prototype 存檔會重置 */
  function seed() {
    const st0 = loadState();
    if (st0.protoSeedV === SEED_V && st0.entries && st0.entries.length) return;
    st0.entries = []; st0.myTeam = []; saveState();
    const plan = [
      ["charmander", 3, 41], ["gastly", 3, 40], ["pikachu", 2, 34], ["squirtle", 3, 38],
      ["dratini", 3, 45], ["snorlax", 1, 33], ["bulbasaur", 3, 36], ["eevee", 1, 22]
    ];
    plan.forEach(([k]) => obtainPokemon(k, "rare"));
    const st = loadState();
    plan.forEach(([k, stage, lv]) => {
      const e = st.entries.find(x => x.chainKey === k); if (!e) return;
      e.stage = stage; e.level = lv;
      e.pet = Object.assign(e.pet || {}, { hp: 1000 });
      if (k === "pikachu") Object.assign(e.pet, { status: "par" });
      if (k === "squirtle") e.pet.hp = 420;
      if (k === "snorlax") e.pet.hp = 160;
      if (typeof ensureEntryPokemonData === "function") ensureEntryPokemonData(e);
    });
    st.myTeam = DEMO_TEAM.map(k => (st.entries.find(e => e.chainKey === k) || {}).uid).filter(Boolean);
    /* 名同頭像：用本機真 app 存檔（有嘅話），冇就用 app 預設 */
    let real = null;
    try { real = JSON.parse((window.__protoRawGet && window.__protoRawGet(STORAGE_KEY)) || "null"); } catch (e) { real = null; }
    st.playerName = (real && real.playerName) || "The PokéEngmon Trainer";
    st.nameCustomized = !!(real && real.nameCustomized);
    st.trainerAvatar = (real && Avatars.valid(real.trainerAvatar)) ? real.trainerAvatar : "red";
    st.pvpWins = 23; st.pvpLosses = 14;
    st.diamonds = Math.max(st.diamonds || 0, 120);
    st.protoSeedV = SEED_V;
    saveState();
  }

  /* 示範：能量唔夠就補（開機時 App.init 會重算 ledger，所以喺開機後先補） */
  function topUpEnergy() {
    const st = loadState();
    if (!window.Energy) return;
    Energy.status(st);
    if (st.energy.points < 5) { st.energy.points = 50; saveState(); }
  }

  /* ---------- 開機 ---------- */
  function inject() {
    seed();
    patchTeamSelect();
    /* battle menu 每次 render 都刷新張卡 */
    const b = B(), origRender = b.renderMenu;
    b.renderMenu = function () { const r = origRender.apply(this, arguments); render(); return r; };
    /* 背包關咗（改完隊）→ 刷新 */
    const origClose = BagUI.close;
    BagUI.close = function () { const r = origClose.apply(this, arguments); setTimeout(render, 0); return r; };
    document.addEventListener("trainer-avatar-changed", render);
    new MutationObserver(decorateTiers).observe($("tier-select-modal"), { childList: true, subtree: true, attributes: true, attributeFilter: ["style"] });
    devPanel();
    render();
    setTimeout(() => { topUpEnergy(); BattleUI.openMenu(); }, 400);
  }
  try {
    const origLogin = App.openLoginHub;
    App.openLoginHub = function (gate) { if (gate === true) return; return origLogin.apply(this, arguments); };   /* prototype：唔彈登入閘 */
  } catch (e) { /* ignore */ }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => setTimeout(inject, 0));
  else inject();
  window.BattleMenuProto = { render, lineup, teamInfo };
})();
