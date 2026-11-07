/* ============================================================
   PokeEngmon - App：答題結算（捕捉、獎勵、結算畫面、錯題回顧、學招、解鎖新世代、進化）
   由 js/app.js 拆出（總計劃 P2.2；Rule 116）。同 app.js 共用同一個 App 物件：
   Object.assign 只係將方法掛返上去，this／App.xxx 用法完全唔變。
   載入次序：js/app.js 之後（index.html），App.init() 喺 DOMContentLoaded 先跑。
   ============================================================ */

Object.assign(App, {
  /* ---------- 完成一組 → 捕捉場景 → 結算 ---------- */
  async onQuizFinished(data) {
    this.lastCapture = null;
    /* 唔可以 fade 走 quiz：quiz 係 display-window overlay，淡出期間會露出後面主頁 */
    await this._captureThenSettle(data);
  },

  /* 捕捉場景（WARNING）→ 結算 */
  async _captureThenSettle(data) {
    const scene = window.CaptureScene;
    if (scene && scene.isSupported()) {
      let chainKey = null;
      try {
        const rarity = Gacha.rollRarity("normal");
        chainKey = Gacha.pickChain(rarity);
      } catch (e) { chainKey = null; }

      if (chainKey) {
        const chain = EVOLUTION_CHAINS.find(c => c.key === chainKey);
        const [dexId, name] = chain.stages[0];
        this.showView("view-capture");
        scene.primeAudio();
        let capResult = null;
        try {
          capResult = await scene.play({
            dexId,
            name,
            onCaught: () => {
              const res = obtainPokemon(chainKey, "normal");
              const cur = entryCurrentSpecies(res.entry);
              /* obtain_capture 要求 dex_id === chain_rarity.stage1_dex；
                 dupe 已進化 entry 時 cur[0] 係最終形態 → 必須傳 scene 嘅 stage1 dexId */
              const stage1Dex = dexId;
              this.lastCapture = { dexId: cur[0], name: cur[1], isDupe: res.isDupe, caught: true };
              /* 世代解鎖：儲起喺結算後彈慶祝窗 + 背景下載新代資料包 */
              if (res.newlyUnlockedGen) this._pendingGenUnlock = res.newlyUnlockedGen;
              /* 防金手指：server 記錄捕捉 + server 權威派寵（fire-and-forget，唔阻動畫）
                 obtain_capture 回傳後用 server 行覆蓋本地 entry（IV/dupes/candies 以 server 為準） */
              if (window.SupabaseAuth && SupabaseAuth.isLoggedIn()) {
                SupabaseAuth.settleCapture(stage1Dex);
                SupabaseAuth.obtainCapture(chainKey, stage1Dex).then(r => {
                  if (r && r.entry) {
                    const before = loadState().unlockedGen || 1;
                    adoptServerEntry(r.entry);
                    const after = loadState().unlockedGen || 1;
                    if (after > before) this._pendingGenUnlock = after;
                  }
                });
              }
              this.renderHome();
              return { isDupe: res.isDupe, dexId: cur[0], name: cur[1] };
            }
          });
        } catch (e) {
          console.warn("[capture] scene failed — skipping to settlement:", e);
        }
        /* Escape path: scene resolved with caught:false, onCaught never fired */
        if (capResult && capResult.caught === false) {
          this.lastCapture = { caught: false, dexId, name };
        }
      }
    }

    this.onSetComplete(data);
  },

  /* ---------- 完成一組 → 結算 ---------- */
  async onSetComplete(data) {
    const st = loadState();

    /* 獎勵計算：經驗值按 PokéAPI 該等級所需經驗比例發放
       v3 單一維度：只計「無提示清題數」→ 換算到 /10 刻度 → span 百分比；
       Lv.1–10 新手期保底 50% span（分級高過 50% 照攞高嗰個） */
    const entry = getActiveEntry();
    let expGain = GAME_CONFIG.EXP_BASE;
    if (entry) {
      ensureEntryPokemonData(entry);
      const dexId = entryCurrentSpecies(entry)[0];
      const level = entry.level || 1;
      const span = levelSpan(dexId, level);
      const totalQ = Math.max(1, data.total || 1);
      const s = Math.round((data.score / totalQ) * 10);
      let pct;
      if (s >= 10)      pct = 1.00;
      else if (s === 9)  pct = 0.90;
      else if (s === 8)  pct = 0.80;
      else if (s >= 5)   pct = 0.50;
      else if (s >= 1)   pct = 0.30;
      else               pct = 0.10;
      if (level <= 10) pct = Math.max(0.50, pct);
      expGain = Math.max(10, Math.round(span * pct));
    }
    const rewards = { ticket: 0, diamonds: 0, exp: expGain };
    /* 電子寵物：拍檔 Faint → 本回合 EXP 0（提示留喺結算畫面） */
    if (entry && window.Pet && Pet.isFaint(entry)) {
      rewards.exp = 0;
      rewards.fainted = true;
    }
    /* Revival：10/10 → 1 粒（另有 10% 多 1 粒）；1–9 題 → 10% 1 粒（登入由 server 抽，migration 20261106b） */
    rewards.drops = [];
    try {
      rewards.drops = (window.Care && Care.awardRevive) ? await Care.awardRevive(data.score === data.total)
        : (window.Pet ? Pet.rollDrops(data.score === data.total) : []);
    } catch (e) {}
    /* 背包第 3b 段：答題掉樹果（全對 → Super、1–9 題 → Normal；登入由 server 抽） */
    if (window.Care && Care.awardBerry) {
      try {
        const berry = await Care.awardBerry(data.score === data.total);
        if (berry && Care.BERRIES[berry]) rewards.drops.unshift({ kind: berry, label: `🫐 ${Care.BERRIES[berry].name} +1` });
      } catch (e) {}
    }
    /* 進化石：每回合 10%（登入由 server 抽，migration 20261106） */
    if (window.Care && Care.awardStone) {
      try {
        const stone = await Care.awardStone();
        if (stone && typeof STONE_LABELS !== "undefined") rewards.drops.push({ kind: stone, label: `${STONE_ICONS[stone]} ${STONE_LABELS[stone]} +1` });
      } catch (e) {}
    }
    /* 背包第 4c 段：全對 → 3% 掉 Mega 石（只會係你擁有物種嘅石；登入由 server 抽） */
    if (window.Care && Care.awardMega && data.score === data.total) {
      try {
        const mega = await Care.awardMega(true);
        if (mega && typeof MEGA_STONES !== "undefined" && MEGA_STONES[mega]) rewards.drops.unshift({ kind: mega, label: `🔮 ${MEGA_STONES[mega].stoneName} +1` });
      } catch (e) {}
    }
    /* 狀態系統：答題掉藥（全對穩掉 1 隻、1–9 題 10%；登入由 server 抽） */
    if (window.Care) {
      try {
        const med = await Care.awardMeds(data.score === data.total);
        if (med && Care.MED_INFO[med]) rewards.drops.push({ kind: med, label: `💊 ${Care.MED_INFO[med].name} +1` });
      } catch (e) {}
    }
    /* 掉落全部由 server RPC 派（登入），唔使再 pushItems（migration 20261106b 已收回 items_* 直寫） */
    /* Diamonds：防金手指走 RPC（登入時由 server 計算 + 權威 balance）
       RPC 失敗（null）→ fallback 本地計算，離線都唔會變 0 粒 */
    let serverRes = null;
    if (window.SupabaseAuth && SupabaseAuth.isLoggedIn()) {
      serverRes = await SupabaseAuth.awardRoundDiamonds(data.score, data.total);
    }
    /* v139：本地 fallback 跟 award_round_diamonds 相對門檻（score==total→3, >=total-2→2, >=total-3→1）
       舊絕對門檻（>=8/>=7）令短 set 例如 4/5 變 0💎 */
    const localDiamondBonus = (() => {
      const sc = data.score, tot = data.total;
      if (sc === tot) return GAME_CONFIG.PERFECT_DIAMOND;
      if (sc >= tot - 2) return GAME_CONFIG.GREAT_DIAMOND;
      if (sc >= tot - 3) return GAME_CONFIG.GOOD_DIAMOND;
      return 0;
    })();
    if (serverRes && typeof serverRes.bonus === "number") {
      rewards.diamonds = serverRes.bonus;
      st.diamonds = serverRes.balance;   // server 權威，唔係本地 +=
    } else if (!(window.SupabaseAuth && SupabaseAuth.isLoggedIn())) {
      /* 匿名／離線：本地計鑽 */
      rewards.diamonds = localDiamondBonus;
      st.diamonds += rewards.diamonds;
    } else {
      /* v140：已登入但 RPC 失敗 → 唔本地加鑽（避免同雲端脫節後 pull 打回） */
      rewards.diamonds = 0;
      this.toast("Cloud sync hiccup — diamond reward will retry next round");
    }

    addPracticeRecord(data);
    this.lastRecord = data;

    /* 經驗值入帳：有拍檔 → 直接加；冇 → 儲起等第一抽 */
    let levelRes = null;
    if (entry) {
      levelRes = addEntryExp(entry, rewards.exp);
      /* 登入時 EXP 走 RPC（server 權威累加）；失敗唔緊要，下次 pull 以 server 為準。
         伊貝進化分支一經決定要 PATCH 上雲（branch 係重推進化嘅必要輸入） */
      if (window.SupabaseAuth && SupabaseAuth.isLoggedIn()) {
        SupabaseAuth.addEntryExp(entry.uid, rewards.exp);
        if (levelRes && levelRes.evolvedTo && entry.branch != null && window.Sync && Sync.isEnabled()) {
          Sync.patchEntry(entry.uid, { branch: entry.branch });
        }
      }
    } else {
      st.pendingExp = (st.pendingExp || 0) + rewards.exp;
    }
    saveState();

    /* v99：diamonds/EXP/entries 已各自經 RPC 上雲；SM-2 cards/history 由 queueUpsert/
       queueHistory 批量 flush —— 唔再需要 pushState 全量推（會重複 insert history） */

    rewards.evolving = !!(levelRes && levelRes.evolvedTo);
    this._renderSettlement(data, rewards);
    this.showView("view-settlement");
    if (levelRes) {
      if (levelRes.levelsGained > 0) {
        const whose = entryCurrentSpecies(entry)[1];
        this.toast(`${whose} reached Lv.${entry.level}!`);
      }
      if (levelRes.evolvedTo) {
        /* 進化場景播完先處理學招／世代解鎖 */
        setTimeout(() => this.showEvolveModal(levelRes.evolvedTo, () => {
          if (levelRes.learned.length) setTimeout(() => this.queueMoveLearn(entry, levelRes.learned), 400);
          setTimeout(() => this.maybeShowGenUnlock(), 400);
        }), 600);
      } else {
        if (levelRes.learned.length) {
          setTimeout(() => this.queueMoveLearn(entry, levelRes.learned), 600);
        }
        setTimeout(() => this.maybeShowGenUnlock(), 900);
      }
    } else {
      setTimeout(() => this.maybeShowGenUnlock(), 900);
    }

    /* Gym：結算畫面之後返主頁先判 badge（Hint／錯題已計入 results） */
    if (Quiz.mode === "gym" || data.mode === "gym") {
      this._gymSettleData = data;
      if (typeof Gym !== "undefined" && data.gymMilestone) Gym._activeMilestone = data.gymMilestone;
    } else {
      this._gymSettleData = null;
    }
    /* showView("view-settlement") 早過呢度 set _gymSettleData，所以要喺度補鎖（Rule 44） */
    this._setSettleLock(document.getElementById("view-settlement").classList.contains("active") && !!this._gymSettleData);
  },

  _renderSettlement(data, rewards) {
    const perfect = data.score === data.total;
    const great = data.score >= data.total - 2;
    document.getElementById("settle-title").textContent =
      perfect ? "Perfect lesson! 🎉" : great ? "Great work!" : "Set complete!";
    const toPolish = data.total - data.score;
    document.getElementById("settle-sub").textContent = perfect
      ? "No mistakes, no hints. Legendary trainer!"
      : `${toPolish} to polish — they'll come back for review.`;

    /* 分數圈：clean 題數 / 總數，動畫填色 */
    const R = 66, C = 2 * Math.PI * R;
    document.getElementById("settle-score").innerHTML = `
      <div class="settle-ring ${perfect ? "perfect" : ""}" role="img" aria-label="${data.score} of ${data.total} correct without hints">
        <svg viewBox="0 0 160 160" aria-hidden="true"><circle class="bg" cx="80" cy="80" r="${R}"/>
          <circle class="fg" id="settle-ring-fg" cx="80" cy="80" r="${R}" style="stroke-dasharray:${C};stroke-dashoffset:${C}"/></svg>
        <div class="num"><div><b id="settle-ring-n">0</b><small>/ ${data.total} clean</small></div></div>
      </div>`;
    const fg = document.getElementById("settle-ring-fg");
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (fg) fg.style.strokeDashoffset = String(C * (1 - (data.total ? data.score / data.total : 0)));
    }));
    this._countUp(document.getElementById("settle-ring-n"), data.score, 900);

    /* 三格 stat：準確度（答啱提交 ÷ 全部提交）／用時／最高 combo */
    const mm = Math.floor(data.duration / 60), ss = data.duration % 60;
    const submits = data.total + (Number(data.wrongTries) || 0);
    const acc = submits ? Math.round((data.total / submits) * 100) : 100;
    document.getElementById("settle-stats").innerHTML = `
      <div class="settle-stat s-acc"><h4>Accuracy</h4><p id="settle-acc">0%</p></div>
      <div class="settle-stat s-time"><h4>Time</h4><p>${mm}:${String(ss).padStart(2, "0")}</p></div>
      <div class="settle-stat s-combo"><h4>Best combo</h4><p>🔥 ${Number(data.bestCombo) || 0}</p></div>`;
    const statEls = document.querySelectorAll("#settle-stats .settle-stat");
    statEls.forEach((el, i) => setTimeout(() => {
      el.classList.add("in");
      if (i === 0) this._countUp(document.getElementById("settle-acc"), acc, 600, "%");
    }, 500 + i * 140));

    const cap = this.lastCapture;
    let capHTML = "";
    if (cap) {
      if (cap.caught === false) {
        capHTML = `
      <div class="settle-capture is-escape">
        <img src="${animatedURL(cap.dexId)}" alt="${cap.name}"
             onerror="this.onerror=null;this.src='${artworkURL(cap.dexId)}'">
        <div>
          <b>${cap.name}</b>
          <span>It broke free! Better luck next time.</span>
        </div>
      </div>`;
      } else {
        capHTML = `
      <div class="settle-capture">
        <img src="${animatedURL(cap.dexId)}" alt="${cap.name}"
             onerror="this.onerror=null;this.src='${artworkURL(cap.dexId)}'">
        <div>
          <b>${cap.name}</b>
          <span>${cap.isDupe ? "Duplicate capture — EV +1" : "New capture — added to your Pokédex"}</span>
        </div>
      </div>`;
      }
    }

    const dropRows = (rewards.drops || [])
      .map(d => `<div class="settle-rw drop"><span class="ic">🎁</span><span class="lb">${d.label}</span></div>`).join("");

    /* 獎勵逐行彈入 + 數字 count-up（數值本身唔變，只係動畫） */
    document.getElementById("settle-rewards").innerHTML = capHTML + `
      ${rewards.diamonds > 0 ? `<div class="settle-rw"><span class="ic">💎</span><span class="lb">Diamonds</span><span class="val">+<span data-count="${rewards.diamonds}">0</span></span></div>` : ""}
      <div class="settle-rw"><span class="ic">⭐</span><span class="lb">Partner EXP</span><span class="val">+<span data-count="${rewards.exp}">0</span></span></div>
      ${rewards.fainted ? `<div class="settle-rw warn"><span class="ic">💤</span><span class="lb">Your partner has fainted — no EXP this round. Feed it a Revival in Partner Care.</span></div>` : ""}
      ${dropRows}`;
    document.querySelectorAll("#settle-rewards .settle-rw").forEach((el, i) => setTimeout(() => {
      el.classList.add("in");
      const n = el.querySelector("[data-count]");
      if (n) this._countUp(n, Number(n.dataset.count) || 0, 500);
    }, 950 + i * 160));

    /* 錯題預覽（最多 3 條）→「See all」入現有錯題回顧 */
    const mist = document.getElementById("settle-mist");
    const misses = (data.results || []).filter(r => !r.correct)
      .map(r => ({ r, q: (typeof findQuestion === "function") ? findQuestion(r.qid) : null })).filter(x => x.q);
    const esc = escapeHTML;
    if (misses.length) {
      mist.innerHTML = `<h3>To review <button type="button" id="settle-see-all">See all ›</button></h3><ul>${misses.slice(0, 3).map(({ r, q }) => {
        const ans = q.type === "word" ? q.word : q.answer;
        const line = (q.type === "word" || !q.sentence)
          ? `🔊 <b>${esc(ans)}</b>`
          : esc(q.sentence).replace(/_{3,}/, `<b>${esc(ans)}</b>`);
        return `<li>${line}<small>${r.hint ? "💡 Hint used" : "✕ Needed another try"}${q.topic ? " · " + esc(q.topic) : ""}</small></li>`;
      }).join("")}</ul>`;
      document.getElementById("settle-see-all").onclick = () => document.getElementById("btn-review").click();
    } else {
      mist.innerHTML = "";
    }

    if (data.score >= data.total - 2) this._settleConfetti();

    /* Capture jingle on settlement: success → "Obtained a Pokémon!", escape → "Obtained a Berry!".
       Both live in assets/bgm, so they follow the Music slider (not SFX). */
    if (cap && window.CaptureScene && CaptureScene.audio) {
      const jingleUrl = cap.caught ? "assets/bgm/obtained-pokemon.mp3" : "assets/bgm/obtained-berry.mp3";
      CaptureScene.audio.playMusicOnce(jingleUrl, 0.4);
    }
    /* 捕捉完結：jingle 播完後恢復全域 BGM（有進化場景就交返俾場景完結時恢復） */
    if (!rewards.evolving && window.CaptureScene && CaptureScene.audio) {
      setTimeout(() => CaptureScene.audio.startTownBGM(), 3200);
    }

    const st = loadState();
    const rareBtn = document.getElementById("btn-pull-rare");
    /* 永遠顯示：唔夠鑽石就 disabled + 顯示差額（目標可見，唔會版面跳動）
       圖案用 status bar 同款寶石（#gem-blue gradient 喺 topbar SVG defs，成個 document 引用到） */
    const gemSvg = `<svg class="gem-ico" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10.5" fill="none" stroke="#062036" stroke-width="1.6"/><circle cx="12" cy="12" r="10" fill="url(#gem-blue)"/><ellipse cx="8" cy="7.5" rx="4" ry="2.5" fill="#ffffff" opacity="0.55"/><ellipse cx="15" cy="5.5" rx="1.8" ry="1" fill="#ffffff" opacity="0.45"/><ellipse cx="12" cy="18" rx="6" ry="1.5" fill="#000000" opacity="0.2"/></svg>`;
    const enough = st.diamonds >= GAME_CONFIG.RARE_PULL_COST;
    rareBtn.disabled = !enough;
    rareBtn.innerHTML = enough
      ? `${gemSvg} Lucky Draw ×${GAME_CONFIG.RARE_PULL_COST}`
      : `${gemSvg} Lucky Draw <small class="settle-btn-gap">need ${GAME_CONFIG.RARE_PULL_COST - st.diamonds} more</small>`;
  },

  /* 數字由 0 數上去（ease-out） */
  _countUp(el, to, ms, suffix) {
    if (!el) return;
    const reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce || !to) { el.textContent = to + (suffix || ""); return; }
    const t0 = performance.now();
    const step = (t) => {
      const p = Math.min(1, (t - t0) / ms);
      el.textContent = Math.round(to * (1 - Math.pow(1 - p, 3))) + (suffix || "");
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  },

  _settleConfetti() {
    const box = document.getElementById("settle-confetti");
    if (!box) return;
    if (window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    box.innerHTML = "";
    const cols = ["#ffcb05", "#3b5ca8", "#ee4035", "#1fa34a", "#ff7a1a", "#ab47bc"];
    for (let i = 0; i < 60; i++) {
      const p = document.createElement("i");
      p.style.left = (Math.random() * 100) + "%";
      p.style.background = cols[i % cols.length];
      p.style.setProperty("--dx", (Math.random() * 160 - 80) + "px");
      p.style.setProperty("--rot", (Math.random() * 900 - 450) + "deg");
      p.style.animationDuration = (1.8 + Math.random() * 1.6) + "s";
      p.style.animationDelay = (Math.random() * .5) + "s";
      box.appendChild(p);
    }
    clearTimeout(this._confettiTimer);
    this._confettiTimer = setTimeout(() => { box.innerHTML = ""; }, 4200);
  },

  /* ---------- 錯題回顧 ---------- */
  showReview() {
    const list = document.getElementById("review-list");
    list.innerHTML = "";
    const results = this.lastRecord ? this.lastRecord.results : [];
    const wrongs = results.filter(r => !r.correct);

    if (results.length > 0 && wrongs.length === 0) {
      list.innerHTML = `<div class="review-none">All correct this time — no mistakes! 🌟</div>`;
    } else {
      wrongs.forEach(w => {
        const q = findQuestion(w.qid);
        if (q) Explain.render(list, q, w.chosen);
      });
    }
    this.showView("view-review");
  },

  /* ---------- 升級學招式（最多 4 招） ---------- */
  queueMoveLearn(entry, moves) {
    this._moveEntry = entry;
    this._moveQueue = (moves || []).filter(m => !(entry.moves || []).includes(m.move));
    this._showNextMoveLearn();
  },

  _showNextMoveLearn() {
    const q = (this._moveQueue || []).shift();
    if (!q) {
      this._moveQueue = [];
      this._moveEntry = null;
      this.closeModal();
      this.renderHome();
      return;
    }
    const entry = this._moveEntry;
    if (!entry || !POKEMON_DEX) { this._moveQueue = []; return; }
    const cur = entryCurrentSpecies(entry);
    const label = moveLabel(q.move);
    const known = entry.moves || [];
    if (known.includes(q.move)) { this._showNextMoveLearn(); return; }

    const full = known.length >= 4;
    const options = full
      ? known.map((m, i) => `<button class="btn-big btn-plain move-choice" data-i="${i}">Replace ${moveLabel(m)}</button>`).join("")
      : `<button id="move-learn-yes" class="btn-big btn-primary">Learn ${label}</button>`;

    this.showModal(`
      <div class="move-box">
        <div class="move-title">✨ New move!</div>
        ${moveCardHTML(q.move)}
        <div class="move-sub">${cur[1]} Lv.${q.level}${full ? " ・ 4 moves already — pick one to replace" : ""}</div>
        <div class="move-list">${options}</div>
        <button id="move-learn-no" class="btn-big btn-plain">Not this time</button>
      </div>`, true);

    const next = () => { this.closeModal(); this._showNextMoveLearn(); };
    document.getElementById("move-learn-no").onclick = next;
    const yes = document.getElementById("move-learn-yes");
    if (yes) yes.onclick = () => {
      entry.moves.push(q.move);
      saveState();
      next();
    };
    document.querySelectorAll("#modal-root .move-choice").forEach(btn => {
      btn.onclick = () => {
        entry.moves[Number(btn.dataset.i)] = q.move;
        saveState();
        next();
      };
    });
  },

  /* ---------- 世代解鎖慶祝 + 資料包下載 ----------
     onCaught / gacha 結算發現 newlyUnlockedGen 時 stash 落 _pendingGenUnlock，
     結算頁出現後由 maybeShowGenUnlock() 彈窗（避免同進化/結算彈窗撞車）。 */
  maybeShowGenUnlock() {
    const gen = this._pendingGenUnlock;
    if (!gen) return;
    this._pendingGenUnlock = null;
    this.showGenUnlock(gen);
  },

  showGenUnlock(gen) {
    if (typeof GENS === "undefined") return;
    const g = GENS.find(x => x.gen === gen);
    if (!g) return;
    /* 即刻載入新世代圖鑑資料（之後捕捉/抽獎要用 learnset） */
    ensureGenDataLoaded(gen);
    const roman = ["I","II","III","IV","V"][gen - 1] || String(gen);
    /* 即場開下資料包（背景）；modal 顯示進度 */
    this.showModal(`
      <div class="gen-unlock-card">
        <img src="assets/gen-icons/${gen}.png" alt="${g.name}"
             onerror="this.onerror=null;this.src='${artworkURL(g.iconDex)}'">
        <h2>🎉 Gen ${roman} Unlocked!</h2>
        <div class="gu-region">${g.name} Region</div>
        <div class="gu-desc">New Pokémon now appear in tall grass and Rare Pulls!<br>
          Downloading the ${g.name} pack for offline play…</div>
        <div class="gen-unlock-bar"><i id="gu-bar"></i></div>
        <div class="gu-progress-text" id="gu-text">Preparing…</div>
        <button id="gu-ok" class="btn-big btn-primary">Let's go!</button>
      </div>`, true);
    document.getElementById("gu-ok").onclick = () => {
      this.closeModal();
      /* 用戶撳完 OK 都未下完 → 背景繼續（GenPack 內部有續傳） */
    };
    GenPack.download(gen, ({ done, total, failed }) => {
      const bar = document.getElementById("gu-bar");
      const txt = document.getElementById("gu-text");
      if (!bar || !txt) return;   // 用戶已關彈窗，背景下載繼續
      const pct = total ? Math.round(done / total * 100) : 0;
      bar.style.width = pct + "%";
      txt.textContent = failed > 0
        ? `${done}/${total} files (${failed} failed — will retry next launch)`
        : `${done}/${total} files`;
    }).then(ok => {
      const txt = document.getElementById("gu-text");
      if (txt) txt.textContent = ok ? "Pack ready — playable offline! ✅" : "Pack partly downloaded — will resume next launch.";
    });
  },

  /* ---------- 進化 Scene（EvolveScene 播完整段動畫） ---------- */
  showEvolveModal(species, onDone, fromDex) {
    if (!species) return;
    let from = fromDex;
    if (!from) {
      const chain = EVOLUTION_CHAINS.find(c => c.key === species.chainKey);
      if (chain) {
        const idx = species.branch ? chain.stages.length - 1 : (species.stageIndex || 0) - 1;
        const prev = chain.stages[idx];
        if (prev) from = prev[0];
      }
    }
    if (!from) from = species.dexId;
    const done = () => {
      this.renderHome();
      if (onDone) onDone();
    };
    if (typeof EvolveScene === "undefined") { done(); return; }
    EvolveScene.open({ fromDex: from, toDex: species.dexId, onDone: done });
  }
});
