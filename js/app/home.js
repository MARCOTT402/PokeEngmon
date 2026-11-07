/* ============================================================
   PokeEngmon - App：主畫面同拍檔（renderHome、拍檔揀選、照顧、HP／狀態）
   由 js/app.js 拆出（總計劃 P2.2；Rule 116）。同 app.js 共用同一個 App 物件：
   Object.assign 只係將方法掛返上去，this／App.xxx 用法完全唔變。
   載入次序：js/app.js 之後（index.html），App.init() 喺 DOMContentLoaded 先跑。
   ============================================================ */

Object.assign(App, {
  /* 已解鎖物種數：ownership 聯集（唔以 entry 數計，避免進化形態灌水） */
  _unlockedSpeciesCount(st) {
    if (typeof collectedCount === "function") return collectedCount();
    const set = new Set();
    (st.entries || []).forEach(e => {
      if (typeof ensureEntryPokemonData === "function" && !Array.isArray(e.ownedSpecies)) ensureEntryPokemonData(e);
      (e.ownedSpecies || []).forEach(id => set.add(id));
    });
    return set.size;
  },

  /* 計算累加到 unlockedGen 嘅物種總數（Gen1=151, Gen1+2=251 …） */
  _unlockedGenTotal(gen) {
    if (typeof GENS === "undefined") return 151;
    let total = 0;
    for (let i = 0; i < gen && i < GENS.length; i++) {
      const range = GENS[i].range;
      total += range[1] - range[0] + 1;
    }
    return total || 151;
  },

  /* ---------- 主畫面 ---------- */
  renderHome() {
    const st = loadState();
    /* 右上角鑽石數字 pill */
    const topDiamonds = document.getElementById("topbar-diamonds");
    if (topDiamonds) topDiamonds.textContent = st.diamonds;

    /* Settings sheet「Name」行：所有改名路徑（rename／註冊暱稱／雲端 pull）之後都會 renderHome（Rule 91） */
    const settingName = document.getElementById("setting-name");
    if (settingName) {
      settingName.textContent = st.playerName || "The PokéEngmon Trainer";
      settingName.title = settingName.textContent;
    }

    /* 連續天數 x1 格式 */
    const streakEl = document.getElementById("home-streak-label");
    if (streakEl) streakEl.textContent = "x" + calcStreak();

    /* Pokédex：分子 = 已解鎖物種數（ownedSpecies 聯集，唔重複計進化形態）；
       分母 = 累加到 unlockedGen 嘅物種總數 */
    const dexProgEl = document.getElementById("home-dex-progress");
    if (dexProgEl) {
      const unlocked = App._unlockedSpeciesCount(st);
      const denominator = App._unlockedGenTotal(st.unlockedGen || 1);
      dexProgEl.textContent = unlocked + "/" + denominator;
    }

    /* Energy：單一數值（戰鬥可用能量 points）— 必須先 Energy.ensure() normalize */
    const energyEl = document.getElementById("td-energy-val");
    if (energyEl) {
      let points = 0;
      if (typeof Energy !== "undefined" && Energy.ensure) {
        const e = Energy.ensure(st);
        points = Number(e?.points) || 0;
      } else {
        /* fallback：直接讀 st.energy（正常情況唔會行到） */
        const e = st.energy;
        points = (e && typeof e === "object") ? (Number(e.points) || 0) : (typeof e === "number" ? e : 0);
      }
      energyEl.textContent = points;
    }

    /* 登入 chip 狀態：任何情況下都同步返真實登入狀態（包括 localStorage restore） */
    if (window.SupabaseAuth && SupabaseAuth.isLoggedIn()) this._markLoggedIn();

    /* 拍檔卡（Signature） */
    const entry = getActiveEntry();
    const sprite = document.getElementById("hero-sprite");
    const nameEl = document.getElementById("hero-name");
    const rarityEl = document.getElementById("hero-rarity");
    const lvEl = document.getElementById("hero-lv");
    const fullVal = document.getElementById("hero-full-val");

    /* Hero HP/EXP bar 位置已遷到 Signature 卡；舊 label/stage 元素由新 ID 取代 */
    if (entry) {
      ensureEntryPokemonData(entry);
      const chain = EVOLUTION_CHAINS.find(c => c.key === entry.chainKey);
      const cur = entryCurrentSpecies(entry);
      const rz = RARITY[chain?.baseRarity] || RARITY.normal; /* v141：冇 "common" key，舊 fallback 會 undefined → rz.bg throw */
      const level = entry.level || 1;
      /* Animated pixel GIF from local assets; falls back to the static sprite */
      sprite.onerror = () => { sprite.onerror = null; sprite.src = spriteURL(cur[0]); };
      sprite.src = animatedURL(cur[0]);
      sprite.style.visibility = "visible";
      sprite.style.display = "";
      nameEl.textContent = cur[1];
      rarityEl.textContent = rz.label;
      rarityEl.style.background = rz.bg;
      rarityEl.style.color = rz.color;
      if (lvEl) lvEl.textContent = "Lv." + level;

      /* 電子寵物狀態：只跟當前拍檔，其他寶可夢唔受影響 */
      const petSt = window.Pet ? Pet.status(entry) : null;

      /* HP：上限 = 戰鬥引擎 stats.hp；現值 = hp_permille（狀態系統第一期） */
      this._renderHeroBattleHp(entry, cur[0], level, petSt);
      const hpBar = document.getElementById("hero-hpbar");
      const hpNote = document.getElementById("hero-pet-note");
      if (hpBar && hpNote) {
        if (petSt) {
          hpBar.style.width = Math.max(0, petSt.health) + "%";
          if (fullVal) fullVal.textContent = `${Math.max(0, petSt.health)}/100`;
          const wrap = hpBar.parentElement;
          wrap.classList.toggle("mid", petSt.health > 25 && petSt.health <= 50);
          wrap.classList.toggle("low", petSt.health <= 25);
          sprite.classList.toggle("fainted", petSt.faint);
          if (petSt.frozen) {
            hpNote.textContent = "Time check needed — reconnect to sync";
          } else if (petSt.faint) {
            hpNote.textContent = "Fainted";   /* spec：Faint 唔顯示復活提示 */
          } else if (petSt.health >= 100) {
            hpNote.textContent = "Full";
          } else {
            hpNote.textContent = "Hungry — tap to feed";
          }
        } else {
          hpBar.style.width = "0%";
          hpNote.textContent = "";
        }
      }
    } else {
      sprite.style.visibility = "hidden";
      sprite.style.display = "none";
      sprite.classList.remove("fainted");
      nameEl.textContent = "No Pokémon yet";
      rarityEl.textContent = "—";
      rarityEl.style.background = ""; rarityEl.style.color = "";
      if (lvEl) lvEl.textContent = "";
      if (fullVal) fullVal.textContent = "—";
      /* 冇拍檔時清空健康條 */
      this._renderHeroBattleHp(null);
      const hpBar0 = document.getElementById("hero-hpbar");
      const hpNote0 = document.getElementById("hero-pet-note");
      if (hpBar0) {
        hpBar0.style.width = "0%";
        hpBar0.parentElement.classList.remove("mid", "low");
      }
      if (hpNote0) hpNote0.textContent = "Answer questions → pull a Pokémon!";
    }

    /* 點拍檔 → Partner Care（育成 / 餵食 / 換拍檔都可以喺彈窗做） */
    sprite.classList.toggle("clickable", !!entry);
    sprite.onclick = () => { if (entry) this.openPartnerPicker(); };

    /* 版本號移入 setting sheet */
    const verEl = document.getElementById("app-version");
    if (verEl) verEl.textContent = APP_VERSION;
    if (typeof Gym !== "undefined" && Gym.refreshHomeUI) Gym.refreshHomeUI();
    /* 外部條件進化（例如未來 likes 達 20）→ 主頁／登入時自動播出進化場景 */
    if (typeof EvolveScene !== "undefined") this._checkPendingEvolutions();
  },

  /* ---------- 主頁／登入時檢查條件已達成嘅進化（trade likes 等） ---------- */
  _checkPendingEvolutions() {
    if (this._evoChecking) return;
    const root = document.getElementById("modal-root");
    if (root && root.innerHTML) return;   /* 有彈窗進行中，唔打斷 */
    const st = loadState();
    const pending = [];
    (st.entries || []).forEach(e => {
      const info = entryNextEvolution(e);
      if (!info || !info.target || !canEvolveNow(e, info)) return;
      const fromDex = entryCurrentSpecies(e)[0];
      const res = addEntryExp(e, 0);
      if (!res || !res.evolvedTo) return;
      pending.push({ fromDex, toDex: res.evolvedTo.dexId });
      if (window.Sync && Sync.isEnabled && Sync.isEnabled()) {
        if (e.branch != null) Sync.patchEntry(e.uid, { branch: e.branch });
        /* stone_used 只經 use_stone RPC 寫（migration 20261106） */
      }
    });
    if (!pending.length) return;
    saveState();
    this._evoChecking = true;
    this.renderHome();
    const next = () => {
      const p = pending.shift();
      if (!p) {
        this._evoChecking = false;
        this.renderHome();
        return;
      }
      EvolveScene.open({ fromDex: p.fromDex, toDex: p.toDex, onDone: next });
    };
    setTimeout(next, 400);
  },

  /* ---------- 重設進度（Settings 內，要輸入訓練員名先撳得） ---------- */
  _confirmReset() {
    const st = loadState();
    const playerName = st.playerName || "The PokéEngmon Trainer";
    const safeName = escapeHTML(playerName);
    this.showModal(`
      <div class="confirm-box">
        <p>Reset <b>all progress</b> and the Pokédex?<br><small>(Imported custom questions will also be deleted)</small></p>
        <p class="reset-type-hint">Type your trainer name <b>${safeName}</b> to confirm:</p>
        <input id="reset-name-input" class="quiz-answer-input" type="text"
               autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false"
               placeholder="${safeName}">
        <div class="confirm-row">
          <button id="cf-yes" class="btn-big btn-primary btn-danger" disabled>Delete everything</button>
          <button id="cf-no" class="btn-big btn-plain">Cancel</button>
        </div>
      </div>`, true);
    const input = document.getElementById("reset-name-input");
    const yesBtn = document.getElementById("cf-yes");
    input.oninput = () => {
      yesBtn.disabled = input.value.trim().toLowerCase() !== playerName.trim().toLowerCase();
    };
    input.onkeydown = (e) => { if (e.key === "Enter" && !yesBtn.disabled) yesBtn.click(); };
    setTimeout(() => input.focus(), 50);
    yesBtn.onclick = Guard.asyncClick(async () => {
      /* 先丟棄未發送嘅同步 queue，再清雲端，最後清本機（避免 reset 後又被寫返上去） */
      if (window.Sync) Sync.clearQueue();
      if (window.SupabaseAuth && SupabaseAuth.isLoggedIn()) {
        const cloud = await SupabaseAuth.resetProgress();
        if (!cloud) this.toast("Cloud reset failed — this device was cleared only");
      }
      resetState();
      this.closeModal();
      this.renderHome();
      this.toast("All reset — starting fresh!");
    }, "reset-progress");
    document.getElementById("cf-no").onclick = () => this.closeModal();
  },

  /* ---------- 換拍檔（只限已抽到嘅） ---------- */
  openPartnerPicker() {
    const st = loadState();
    if (!st.entries.length) { this.toast("No Pokémon yet — finish a set to pull one!"); return; }
    const entry = getActiveEntry();
    if (!entry) return;
    Pet.ensure(entry);
    this._pcSel = null;

    this.showModal(`
      <div class="petcare">
        <div class="pc-head">
          <h3>Partner Care</h3>
          <button class="pc-close" type="button" aria-label="Close">✕</button>
        </div>

        <div class="pc-stage" id="pc-stage">
          <div class="pc-ground"></div>
          <div class="pc-walker"><img id="pc-sprite" alt="partner"></div>
          <div class="pc-pills">
            <button type="button" class="pc-pill status" id="pc-status" hidden></button>
            <span class="pc-pill streak" id="pc-streak" title="Practice streak"><svg class="pc-bolt" viewBox="0 0 24 24" aria-hidden="true"><path d="M13 2 L7.5 11.5 L11 12 L8 22 L16.5 10.5 L12 10.8 L14.5 2 Z" fill="#ffd54f" stroke="#3d1f00" stroke-width="1.4" stroke-linejoin="round"/></svg><b>0</b></span>
          </div>
          <div class="pc-hpwrap">
            <div class="pc-hprow"><span class="pc-hpk">HP</span><div class="pc-hpbar pc-battlehp" id="pc-battlehp"><i id="pc-battlehpfill"></i></div><span class="pc-hpv" id="pc-battlehptext">—</span></div>
            <div class="pc-hprow"><span class="pc-hpk">Fullness</span><div class="pc-hpbar" id="pc-hpbar"><i id="pc-hpfill"></i></div><span class="pc-hpv" id="pc-hptext">100/100</span></div>
          </div>
          <div class="pc-decay">Fullness −4% per hour</div>
          <div class="pc-floatwrap" id="pc-float"></div>
        </div>
        <div class="pc-state" id="pc-state"></div>

        <div class="pc-items">
          ${(() => {
            /* 樹果（第 3b 段）取代 food／premium；舊庫存仲有先顯示 */
            const legacy = ["food", "premium"].filter(k => Pet.countOf(k) > 0).map(k => `
          <div class="pc-item" data-kind="${k}">
            <img src="assets/items/${k}.png" alt=""><span>${k === "food" ? "Food +25" : "Premium +50"}</span>
            <b class="pc-count" data-count="${k}">0</b>
          </div>`).join("");
            const berries = Care.ownedBerries().map(k => { const b = Care.BERRIES[k]; return `
          <div class="pc-item berry ${b.tier}" data-kind="${k}" title="${b.name} — fullness +${b.fullness}%">
            <img src="${Care.ITEM_SPRITE(b.sprite)}" alt=""><span>${b.name.replace(" Berry", "")} +${b.fullness}</span>
            <b class="pc-count" data-count="${k}">0</b>
          </div>`; }).join("");
            return (legacy + berries) || `<div class="pc-berry-empty">No berries yet — answer quiz questions to collect them.</div>`;
          })()}
        </div>
        <div class="pc-evo-note" id="pc-evo-note"></div>
        <div class="pc-tip">Drag food onto your partner — or tap it, then tap the stage.</div>
        <div class="pc-bag-note">Medicine, Revival and evolution stones are in the <b>Bag</b>. <button type="button" class="pc-open-bag" id="pc-open-bag">Open Bag ›</button></div>

        <div class="pc-rosterhead"><span>Your Pokémon</span><span>Tap to bring it to the stage</span></div>
        <div class="pc-sortbar">
          <select id="pc-sort" class="dex-sort" aria-label="Sort your Pokémon"></select>
          <button id="pc-sort-dir" class="dex-dir" type="button" aria-label="Toggle sort direction">↑</button>
        </div>
        <div class="partner-list" id="pc-roster"></div>
      </div>`);

    const modal = document.getElementById("modal-root");
    modal.querySelector(".pc-close").onclick = () => this.closeModal();
    const openBag = modal.querySelector("#pc-open-bag");
    if (openBag) openBag.onclick = () => { this.closeModal(); if (typeof BagUI !== "undefined") BagUI.open({ from: "home" }); };

    /* 精靈列表排序（同圖鑑共用 DEXSORT 定義） */
    DEXSORT.bindControls(
      modal.querySelector("#pc-sort"),
      modal.querySelector("#pc-sort-dir"),
      "pokeengmon_care_sort_v1",
      () => this._syncPetCare()
    );

    /* 道具：點擊選取（手機）＋ 桌面拖放 */
    modal.querySelectorAll(".pc-item").forEach(tile => {
      const kind = tile.dataset.kind;
      tile.addEventListener("click", () => {
        if (!Pet.canUse(kind, getActiveEntry())) {
          const res = Pet.useItem(kind, getActiveEntry());   /* 借用佢嘅錯誤訊息 */
          if (res && !res.ok) this._pcToast(res.msg);
          return;
        }
        this._pcSel = this._pcSel === kind ? null : kind;
        this._syncPetCare();
      });
      tile.addEventListener("dragstart", e => {
        this._pcSel = kind;
        try { e.dataTransfer.setData("text/plain", kind); } catch (err) {}
        this._syncPetCare();
      });
      tile.addEventListener("dragend", () => {
        this._pcSel = null;
        const stage = document.getElementById("pc-stage");
        if (stage) stage.classList.remove("drop-hint");
        this._syncPetCare();
      });
    });

    const stage = document.getElementById("pc-stage");
    stage.addEventListener("dragover", e => {
      if (!this._pcSel) return;
      e.preventDefault();
      stage.classList.add("drop-hint");
    });
    stage.addEventListener("dragleave", () => stage.classList.remove("drop-hint"));
    stage.addEventListener("drop", e => {
      e.preventDefault();
      stage.classList.remove("drop-hint");
      const kind = this._pcSel || (e.dataTransfer && e.dataTransfer.getData("text/plain"));
      if (kind) this._pcUse(kind);
    });
    stage.addEventListener("click", () => {
      if (this._pcSel) this._pcUse(this._pcSel);
    });

    this._syncPetCare();

    /* 開啟時即時結算（登入：server care_settle；guest：本地） */
    Pet.runDailyCheck();
    this._syncPetCare();
    this.renderHome();
    if (window.Care) Care.settle().then(() => { this._syncPetCare(); this.renderHome(); }).catch(() => {});
  },

  _pcFloat(text, cls) {
    const box = document.getElementById("pc-float");
    if (!box) return;
    box.innerHTML = `<div class="pc-float ${cls || ""}">${escapeHTML(text)}</div>`;
    setTimeout(() => { box.innerHTML = ""; }, 1200);
  },

  async _pcUse(kind) {
    const entry = getActiveEntry();
    this._pcSel = null;
    if (window.Care && !STONE_KINDS.includes(kind) && (Care.online() || (Care.isBerry && Care.isBerry(kind)))) {
      if (this._pcBusy) return;
      this._pcBusy = true;
      const name = entryCurrentSpecies(entry)[1];
      const out = (kind === "food" || kind === "premium" || Care.isBerry(kind)) ? await Care.feed(entry, kind) : await Care.use(entry, kind);
      this._pcBusy = false;
      const label = Care.MED_INFO[kind] ? Care.MED_INFO[kind].name : (Care.BERRIES && Care.BERRIES[kind]) ? Care.BERRIES[kind].name : (kind === "premium" ? "Premium Food" : (kind === "revive" ? "Revival" : "Food"));
      if (out && out.ok) this._pcFloat(Care.eventText(out.event, name, label), /^(vomit|faint|od_)/.test(out.event) ? "bad" : "good");
      else this._pcToast(Care.REASON_TEXT[out && out.reason] || "Can't use that now");
      this._syncPetCare();
      this.renderHome();
      return;
    }
    /* 進化石：經 Care.useStone（登入 = use_stone RPC 扣石 + 記 stone_used／branch） */
    const isStone = STONE_KINDS.includes(kind) && window.Care && Care.useStone;
    if (isStone) { if (this._pcBusy) return; this._pcBusy = true; }
    const res = isStone ? await Care.useStone(entry, kind) : Pet.useItem(kind, entry);
    if (isStone) this._pcBusy = false;
    if (res.ok) {
      this._pcFloat(res.msg, /^(vomit|faint|od_)/.test(res.event || "") ? "bad" : "good");
      this.renderHome();
      this._syncPetCloud();
      if (res.evolvedTo) {
        /* 先留住舊形態喺舞台發光（光團），完左先彈進化 hub；
           hub 關閉後重開 Partner Care 先見到新形態 */
        this._pcKeepSprite = true;
        this._syncPetCare();
        const sp = document.getElementById("pc-sprite");
        /* 動畫倍速：進化前發光同等待時間一齊縮短 */
        const evoSpd = window.AnimSpeed ? AnimSpeed.get() : 1;
        if (sp) { sp.style.animationDuration = (1.5 / evoSpd) + "s"; sp.classList.add("glow-evo"); }
        setTimeout(() => {
          this.showEvolveModal(res.evolvedTo, () => {
            this._pcKeepSprite = false;
            this.openPartnerPicker();
          }, res.evolvedFrom);
        }, 1500 / evoSpd);
        return;
      }
      this._syncPetCare();
    } else {
      this._pcToast(res.msg);
    }
  },

  /* 寵物狀態 + 背包 → 雲端備份（只對已登入用戶；失敗靜默，下次操作再試） */
  _syncPetCloud() {
    if (!window.Sync || !Sync.isEnabled || !Sync.isEnabled()) return;
    if (!Sync.pushPet) return;
    const entry = getActiveEntry();
    if (entry && entry.pet) Sync.pushPet(entry.uid, entry.pet);
    /* 背包數量唔再由 client 推（migration 20261106b：items_* 只經 RPC 寫） */
  },

  _pcToast(msg) {
    const box = document.getElementById("pc-float");
    if (!box) return;
    box.innerHTML = `<div class="pc-float bad">${escapeHTML(msg)}</div>`;
    setTimeout(() => { box.innerHTML = ""; }, 1200);
  },

  /* 主頁 HP 條：顯示實數 cur/max；>50% 綠、20–50% 黃、<20% 紅、Faint 灰 */
  _renderHeroBattleHp(entry, dexId, level, petSt) {
    const fill = document.getElementById("hero-battlehp");
    const val = document.getElementById("hero-battlehp-val");
    if (!fill || !val) return;
    const wrap = fill.parentElement;
    if (!entry) {
      fill.style.width = "0%";
      val.textContent = "—";
      wrap.classList.remove("mid", "low", "faint");
      return;
    }
    const hp = window.Care ? Care.hpOf(entry) : { cur: 0, max: 0, pct: 0, faint: false };
    const faint = hp.faint;
    const pct = hp.max > 0 ? hp.pct : 0;
    fill.style.width = pct + "%";
    val.textContent = hp.max > 0 ? `${hp.cur}/${hp.max}` : "—";
    wrap.classList.toggle("faint", faint);
    wrap.classList.toggle("mid", !faint && pct >= 20 && pct <= 50);
    wrap.classList.toggle("low", !faint && pct < 20);
    /* 狀態 icon：撳落去 → 睡眠／冰凍顯示倒數，其他顯示「持續中，需用藥解除」 */
    const stBtn = document.getElementById("hero-status");
    if (stBtn) {
      const key = window.Care && entry.pet ? Care.statusKey(entry.pet) : null;
      stBtn.hidden = !key || faint;
      if (key) {
        stBtn.querySelector("img").src = `assets/battle/ui/status-${Care.STATUS_INFO[key].icon}.png`;
        stBtn.onclick = (ev) => { ev.stopPropagation(); this.toast(this._statusInfoText(entry)); };
      }
    }
  },

  /* 狀態說明（主頁 icon／Partner Care 共用） */
  _statusInfoText(entry) {
    const p = entry && entry.pet; if (!p || !window.Care) return "";
    const key = Care.statusKey(p); if (!key) return "";
    const info = Care.STATUS_INFO[key];
    if (key === "slp" || key === "frz") {
      const left = Math.ceil(Care.sleepLeftMs(p) / 60000);
      return `${info.label} — ${key === "slp" ? "wakes up" : "thaws"} in ${left} min. ${key === "slp" ? "Awakening" : "Ice Heal"} fixes it now.`;
    }
    return `${info.label} — lasts until cured. ${info.note}`;
  },

  /* 同步育成彈窗三層內容（唔重建 DOM，避免動畫閃） */
  _syncPetCare() {
    const st = loadState();
    const entry = getActiveEntry();
    if (!entry) return;
    const p = Pet.ensure(entry);
    const cur = entryCurrentSpecies(entry);

    const sprite = document.getElementById("pc-sprite");
    if (sprite && !this._pcKeepSprite) {
      const want = animatedURL(cur[0]);
      if (sprite.dataset.src !== want) {
        sprite.dataset.src = want;
        sprite.onerror = () => { sprite.onerror = null; sprite.src = spriteURL(cur[0]); };
        sprite.src = want;
      }
    }
    const faint = Pet.isFaint(entry);
    const stage = document.getElementById("pc-stage");
    if (stage) stage.classList.toggle("faint", faint);

    /* 飽肚值條 */
    const bar = document.getElementById("pc-hpbar");
    if (bar) {
      bar.classList.toggle("mid", p.health > 25 && p.health <= 50);
      bar.classList.toggle("low", p.health <= 25);
    }
    const fill = document.getElementById("pc-hpfill");
    if (fill) fill.style.width = Math.max(0, p.health) + "%";
    const hpText = document.getElementById("pc-hptext");
    if (hpText) hpText.textContent = `${Math.max(0, p.health)}/100`;

    /* HP 條：>50% 綠、20–50% 黃、<20% 紅、Faint 灰 */
    const hp = Care.hpOf(entry);
    const hbar = document.getElementById("pc-battlehp");
    if (hbar) {
      hbar.classList.toggle("faint", hp.faint);
      hbar.classList.toggle("mid", !hp.faint && hp.pct >= 20 && hp.pct <= 50);
      hbar.classList.toggle("low", !hp.faint && hp.pct < 20);
    }
    const hfill = document.getElementById("pc-battlehpfill");
    if (hfill) hfill.style.width = hp.pct + "%";
    const htext = document.getElementById("pc-battlehptext");
    if (htext) htext.textContent = hp.max ? `${hp.cur}/${hp.max}` : "—";

    /* 狀態 pill（撳落去睇說明／倒數） */
    const key = Care.statusKey(p);
    const stPill = document.getElementById("pc-status");
    if (stPill) {
      stPill.hidden = !key || faint;
      if (key) {
        stPill.innerHTML = `<img src="assets/battle/ui/status-${Care.STATUS_INFO[key].icon}.png" alt=""> ${Care.STATUS_INFO[key].label}`;
        stPill.onclick = () => this._pcToast(this._statusInfoText(entry));
      }
    }
    /* 連續答題日數（餵食 streak 已取消） */
    const streak = document.querySelector("#pc-streak b");
    if (streak) streak.textContent = typeof calcStreak === "function" ? calcStreak() : 0;

    /* 狀態文案 */
    const state = document.getElementById("pc-state");
    if (state) {
      state.className = "pc-state";
      if (faint) {
        state.classList.add("faint");
        state.textContent = `${cur[1]} has fainted — answers still count but earn 0 EXP, and it can't battle.`;
      } else if (key) {
        state.classList.add("hungry");
        state.textContent = this._statusInfoText(entry);
      } else if (p.health >= 100) {
        state.classList.add("full");
        state.textContent = "Full! Feeding more now will make it throw up.";
      } else {
        state.classList.add("hungry");
        state.textContent = `${cur[1]} is hungry — fullness drops 4% per hour.`;
      }
    }

    /* 道具數量 + 可用狀態 */
    document.querySelectorAll("#modal-root .pc-item").forEach(tile => {
      const kind = tile.dataset.kind;
      const n = Pet.countOf(kind);
      const badge = tile.querySelector(".pc-count");
      if (badge) badge.textContent = n;
      const usable = Pet.canUse(kind, entry);
      tile.classList.toggle("disabled", !usable);
      tile.classList.toggle("selected", this._pcSel === kind && usable);
      tile.draggable = usable;
    });

    /* 進化石提示：下一階段需要咩條件 */
    const evoNote = document.getElementById("pc-evo-note");
    if (evoNote) {
      const info = entryNextEvolution(entry);
      let txt = "";
      if (!info) {
        txt = "Fully evolved — no further evolution.";
      } else if (info.trade) {
        const likes = loadState().trainerLikes || 0;
        txt = `Needs ${TRADE_LIKES_REQUIRED} likes to evolve (${likes}/${TRADE_LIKES_REQUIRED})`;
      } else if (info.target && info.stone) {
        txt = `Use a ${STONE_LABELS[info.stone]} in the Bag to evolve.`;
      } else if (info.target) {
        txt = (entry.level || 1) >= (info.needLevel || 0)
          ? "Ready to evolve!"
          : `Evolves at Lv.${info.needLevel} (now Lv.${entry.level || 1}).`;
      } else if (info.options && info.options.length) {
        const kinds = info.options.filter(o => o.stone).map(o => STONE_LABELS[o.stone]);
        txt = kinds.length ? `Evolves with ${kinds.join(" / ")}.` : "";
      }
      evoNote.textContent = txt;
    }

    /* 全部寶可夢：沿用原本 Switch Partner 的 dex-cell 外觀 */
    const roster = document.getElementById("pc-roster");
    if (roster) {
      const prefs = DEXSORT.load("pokeengmon_care_sort_v1");
      DEXSORT.syncControls(
        document.getElementById("pc-sort"),
        document.getElementById("pc-sort-dir"),
        prefs
      );
      const list = st.entries.slice();
      DEXSORT.sortList(list, prefs.sort, prefs.dir, e => {
        const c = entryCurrentSpecies(e);
        return { dexId: c[0], level: e.level || 1 };
      });
      roster.innerHTML = list.map(e => {
        ensureEntryPokemonData(e);
        const chain = EVOLUTION_CHAINS.find(c => c.key === e.chainKey);
        const c = entryCurrentSpecies(e);
        const rz = RARITY[chain?.baseRarity] || RARITY.normal;
        const faint = Pet.isFaint(e);
        const active = e.uid === st.activeUid;
        const metric = DEXSORT.metric(prefs.sort, c[0], e.level || 1);
        return `<button class="dex-cell owned ${active ? "current" : ""} ${faint ? "pc-faint" : ""}" data-uid="${e.uid}">
          <img src="${spriteURL(c[0])}" alt="${c[1]}">
          <span class="dex-name">${c[1]}</span>
          <span class="dex-rarity" style="background:${rz.bg};color:${rz.color}">${rz.label}</span>
          <span class="p-stage">${metric} ・ ${"★".repeat(e.stars || 1)}${active ? " ・ Active" : ""}</span>
        </button>`;
      }).join("");
      roster.querySelectorAll(".dex-cell").forEach(cell => {
        cell.onclick = () => {
          const st2 = loadState();
          const uid = cell.dataset.uid;
          if (!uid || uid === st2.activeUid) return;
          const prevUid = st2.activeUid;
          st2.activeUid = uid;
          /* 換入嘅寶可夢由今日起計：唔追討盒子期間嘅自然消耗（唔會一換入就 −50） */
          const nextEntry = st2.entries.find(x => x.uid === uid);
          if (nextEntry && window.Pet) Pet.adoptActive(nextEntry);
          saveState();
          if (window.Sync && Sync.isEnabled()) {
            /* 先用舊拍檔結算到而家，再換 active（新拍檔由而家起計） */
            const settle = (window.Care && Care.online()) ? Care.settle() : Promise.resolve();
            settle.catch(() => {}).then(() => Sync.pushActive(uid));
          }
          /* 換走嘅拍檔：佢嘅 pet 狀態要保持上雲（否則首次 backfill 會漏） */
          const prevEntry = st2.entries.find(x => x.uid === prevUid);
          if (prevEntry && prevEntry.pet && window.Sync && Sync.pushPet) {
            Sync.pushPet(prevUid, prevEntry.pet);
          }
          this._pcSel = null;
          this._syncPetCare();
          this.renderHome();
          this._syncPetCloud();
        };
      });
    }
  }
});
