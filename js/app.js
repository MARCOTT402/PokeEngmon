/* ============================================================
   PokeEngmon - 主流程
   路由 / 主畫面 / 題型選擇 + CSV 匯入 / 結算獎勵 / 錯題回顧 / 進化 / Modal
   ============================================================ */

const App = {
  lastRecord: null,   // 今次做完嘅一組（結算 / 錯題回顧用）
  pendingEvolve: null,
  selectedTopics: new Set(),   // 題型選擇

  /* ---------- 路由 ---------- */
  showView(id) {
    document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
    document.getElementById(id).classList.add("active");
    window.scrollTo(0, 0);
  },

  /* ---------- 主畫面 ---------- */
  renderHome() {
    const st = loadState();
    document.getElementById("topbar-name").textContent = st.playerName;
    document.getElementById("topbar-diamonds").textContent = st.diamonds;
    document.getElementById("topbar-pulls").textContent = st.normalPulls;

    /* 拍檔卡 */
    const entry = getActiveEntry();
    const sprite = document.getElementById("hero-sprite");
    const labelEl = document.getElementById("hero-label");
    const nameEl = document.getElementById("hero-name");
    const stageEl = document.getElementById("hero-stage");
    const bar = document.getElementById("hero-expbar");
    const expText = document.getElementById("hero-exp-text");

    if (entry) {
      const chain = EVOLUTION_CHAINS.find(c => c.key === entry.chainKey);
      const cur = entryCurrentSpecies(entry);
      const maxStage = chainMaxStage(chain);
      const rz = RARITY[chain.baseRarity];
      sprite.src = spriteURL(cur[0]);
      sprite.style.visibility = "visible";
      nameEl.textContent = `${cur[1]}（${cur[2]}）`;
      stageEl.innerHTML = `<span class="rarity-chip" style="background:${rz.bg};color:${rz.color}">${rz.label}</span> 第 ${entry.stage} 階`;
      if (entry.stage < maxStage) {
        const threshold = GAME_CONFIG.EVO_EXP[entry.stage - 1];
        const prev = entry.stage >= 2 ? GAME_CONFIG.EVO_EXP[entry.stage - 2] : 0;
        const pct = Math.min(100, ((entry.exp - prev) / (threshold - prev)) * 100);
        bar.style.width = pct + "%";
        expText.textContent = `EXP ${entry.exp} / ${threshold}（下次進化）`;
      } else if (maxStage === 1) {
        bar.style.width = "100%";
        expText.textContent = `EXP ${entry.exp} ・ 呢隻唔會進化`;
      } else {
        bar.style.width = "100%";
        expText.textContent = `EXP ${entry.exp} ・ 已完成進化 🎉`;
      }
    } else {
      sprite.style.visibility = "hidden";
      nameEl.textContent = "未有 Pokemon";
      stageEl.textContent = "";
      bar.style.width = "0%";
      expText.textContent = "完成題目 → 抽 Pokemon！";
    }

    /* 點圖片換拍檔（只可換已抽到嘅） */
    const nOwned = st.entries.length;
    sprite.classList.toggle("clickable", nOwned >= 2);
    labelEl.textContent = nOwned >= 2 ? "我嘅拍檔（點圖片可換）" : "我嘅拍檔";
    sprite.onclick = () => {
      if (nOwned >= 2) this.openPartnerPicker();
      else if (nOwned === 1) this.toast("暫時只有一隻拍檔，抽到第二隻先可以換！");
    };

    /* 統計 */
    const acc = st.totalQuestions > 0 ? Math.round((st.totalCorrect / st.totalQuestions) * 100) : 0;
    document.getElementById("home-stats").innerHTML = `
      <span>完成 <b>${st.totalSets}</b> 組</span>
      <span>正確率 <b>${acc}%</b></span>
      <span>連續練習 <b>${calcStreak()}</b> 日</span>
      <button id="btn-reset" class="reset-link">歸零重來</button>`;
    document.getElementById("btn-reset").onclick = () => this._confirmReset();
  },

  _confirmReset() {
    this.showModal(`
      <div class="confirm-box">
        <p>確定要將所有紀錄同圖鑑<b>歸零</b>？<br><small>（匯入嘅自訂題目都會一齊刪除）</small></p>
        <div class="confirm-row">
          <button id="cf-yes" class="btn-big btn-primary">確定歸零</button>
          <button id="cf-no" class="btn-big btn-plain">取消</button>
        </div>
      </div>`, true);
    document.getElementById("cf-yes").onclick = () => {
      resetState();
      this.closeModal();
      this.renderHome();
      this.toast("已歸零，重新開始！");
    };
    document.getElementById("cf-no").onclick = () => this.closeModal();
  },

  /* ---------- 換拍檔（只限已抽到嘅） ---------- */
  openPartnerPicker() {
    const st = loadState();
    const rows = st.entries.map(entry => {
      const chain = EVOLUTION_CHAINS.find(c => c.key === entry.chainKey);
      const cur = entryCurrentSpecies(entry);
      const rz = RARITY[chain.baseRarity];
      const active = entry.uid === st.activeUid;
      return `
        <button class="dex-cell owned ${active ? "current" : ""}" data-uid="${entry.uid}">
          <img src="${spriteURL(cur[0])}" alt="${cur[1]}">
          <span class="dex-name">${cur[1]}（${cur[2]}）</span>
          <span class="dex-rarity" style="background:${rz.bg};color:${rz.color}">${rz.label}</span>
          <span class="p-stage">第 ${entry.stage} 階${active ? " ・ 現用" : ""}</span>
        </button>`;
    }).join("");

    this.showModal(`
      <div class="partner-box">
        <h3 class="partner-title">🔄 換拍檔</h3>
        <p class="partner-sub">點選一隻已抽到嘅 Pokemon 做拍檔</p>
        <div class="partner-list">${rows}</div>
      </div>`, true);

    document.querySelectorAll("#modal-root .partner-list .dex-cell").forEach(btn => {
      btn.onclick = () => {
        const uid = btn.dataset.uid;
        const target = st.entries.find(e => e.uid === uid);
        if (!target) { this.closeModal(); return; }
        if (uid === st.activeUid) { this.closeModal(); return; }
        st.activeUid = uid;
        saveState();
        this.closeModal();
        this.renderHome();
        const cur = entryCurrentSpecies(target);
        this.toast(`拍檔已換成 ${cur[1]}！`);
      };
    });
  },

  /* ---------- 題型選擇（做題前）：先揀課題，再展開揀個別題型 ---------- */
  openSetup() {
    this.selectedTopics = new Set(getCourses().flatMap(c => c.topics.map(t => t.key)));
    this._expanded = new Set();
    this.renderSetup();
    this.showView("view-quiz-setup");
  },

  _allTopicKeys() {
    return getCourses().flatMap(c => c.topics.map(t => t.key));
  },

  renderSetup() {
    const courses = getCourses();
    const list = document.getElementById("topic-list");
    list.innerHTML = "";
    if (!this._expanded) this._expanded = new Set();

    courses.forEach(({ course, topics, count }) => {
      const keys = topics.map(t => t.key);
      const sel = keys.filter(k => this.selectedTopics.has(k)).length;
      const all = sel === keys.length;
      const open = this._expanded.has(course);

      const card = document.createElement("div");
      card.className = "course-card" + (all ? " course-all" : "") + (open ? " open" : "");

      /* 課題列：☑ 一次過全選／取消成個課題；撳名或箭咀展開題型 */
      const head = document.createElement("div");
      head.className = "course-head";
      head.innerHTML = `
        <span class="course-check" role="checkbox" aria-checked="${all}">${all ? "☑" : sel > 0 ? "◩" : "☐"}</span>
        <span class="course-name">${escapeHTML(course)}</span>
        <span class="course-count">${sel}/${keys.length} 題型 · ${count} 題</span>
        <span class="course-arrow">${open ? "▾" : "▸"}</span>`;
      head.querySelector(".course-check").onclick = (e) => {
        e.stopPropagation();
        if (all) keys.forEach(k => this.selectedTopics.delete(k));
        else keys.forEach(k => this.selectedTopics.add(k));
        this.renderSetup();
      };
      head.onclick = () => {
        if (open) this._expanded.delete(course);
        else this._expanded.add(course);
        this.renderSetup();
      };
      card.appendChild(head);

      /* 展開後：課題入面嘅個別題型 */
      if (open) {
        const box = document.createElement("div");
        box.className = "course-topics";

        const mini = document.createElement("div");
        mini.className = "setup-mini-row course-mini-row";
        const bAll = document.createElement("button");
        bAll.className = "btn-mini";
        bAll.textContent = "全選此課題";
        bAll.onclick = () => { keys.forEach(k => this.selectedTopics.add(k)); this.renderSetup(); };
        const bNone = document.createElement("button");
        bNone.className = "btn-mini";
        bNone.textContent = "全唔選";
        bNone.onclick = () => { keys.forEach(k => this.selectedTopics.delete(k)); this.renderSetup(); };
        mini.appendChild(bAll);
        mini.appendChild(bNone);
        box.appendChild(mini);

        topics.forEach(({ topic, count: n, key }) => {
          const on = this.selectedTopics.has(key);
          const b = document.createElement("button");
          b.className = "topic-chip" + (on ? " on" : "");
          b.innerHTML = `<span class="topic-name">${escapeHTML(topic)}</span><span class="topic-count">${n} 題</span>`;
          b.onclick = () => {
            if (on) this.selectedTopics.delete(key);
            else this.selectedTopics.add(key);
            this.renderSetup();
          };
          box.appendChild(b);
        });
        card.appendChild(box);
      }

      list.appendChild(card);
    });

    const selCount = this.selectedTopics.size;
    const qCount = getAllQuestions().filter(q => this.selectedTopics.has(questionTopicKey(q))).length;
    const startBtn = document.getElementById("btn-setup-start");
    startBtn.disabled = selCount === 0;
    startBtn.textContent = selCount === 0
      ? "請最少揀一個題型"
      : `▶ 開始做題（${Math.min(GAME_CONFIG.SET_SIZE, qCount)} 題）`;

    /* 題目來源數量 */
    const st = loadState();
    const siteN = SITE_QUESTIONS.length;
    const customN = (st.customQuestions || []).length;
    const parts = [];
    if (siteN > 0) parts.push(`網站題庫 ${siteN} 題`);
    if (customN > 0) parts.push(`額外匯入 ${customN} 題`);
    document.getElementById("custom-q-count").textContent = parts.join(" ・ ");
  },

  /* ---------- CSV 匯入（含指引） ---------- */
  openImport() {
    this.showModal(`
      <div class="import-box">
        <h3>📥 匯入 CSV 題目</h3>
        <details class="csv-guide">
          <summary>📖 CSV 格式指引（撳開睇）</summary>
          <div class="csv-guide-body">
            <p><b>每行一題，7 欄，用逗號分隔：</b></p>
            <pre>課題,題型,難度,句子,答案,關鍵詞,提示</pre>
            <ul>
              <li><b>課題</b>：大分類（例如 <code>過去式</code>）；同一課題下面可以有多個題型</li>
              <li><b>題型</b>：課題入面嘅小分類（例如 <code>動詞過去式</code>）；同名會歸入同一題型</li>
              <li><b>難度</b>：數字 <code>1</code>、<code>2</code>、<code>3</code>、<code>4</code>…（答題時顯示同等數量嘅 ★）</li>
              <li><b>句子</b>：必須有 <code>___</code>（三個底線）做空位</li>
              <li><b>答案</b>：正確答案；多個可接受答案用 <code>|</code> 或 <code>/</code> 分隔（如 <code>were not / weren't</code>）</li>
              <li><b>關鍵詞</b>（可留空）：句子內要著色嘅詞語，多個用 <code>/</code> 分隔（箭咀會由每個詞指去空位）</li>
              <li><b>提示</b>（可留空）：答錯時顯示嘅短解釋</li>
            </ul>
            <p><b>例子：</b></p>
            <pre>課題,題型,難度,句子,答案,關鍵詞,提示
過去式,動詞過去式,1,Yesterday I ___(go) to the park.,went,Yesterday,go 嘅過去式係 went
基本句型,am / is / are,1,She ___ my sister.,is,She,一個人 → is</pre>
            <p class="csv-note">⚠ 第一行如果係標題行（第一格寫「課題」）會自動略過。內容有逗號請用雙引號包住。<br>舊版 5 欄格式（題型,句子,答案,關鍵詞,提示）都仍然匯入得，會當成「未分類」、難度 1。</p>
          </div>
        </details>

        <label class="import-label">方法一：揀 CSV 檔案</label>
        <input type="file" id="csv-file" accept=".csv,text/csv,text/plain" class="import-file">

        <label class="import-label">方法二：直接貼上內容</label>
        <textarea id="csv-paste" class="import-paste" rows="5" placeholder="課題,題型,難度,句子,答案,關鍵詞,提示&#10;過去式,動詞過去式,1,Yesterday I ___(go) to the park.,went,Yesterday,go 嘅過去式係 went"></textarea>

        <div class="confirm-row">
          <button id="btn-do-import" class="btn-big btn-primary">匯入</button>
          <button id="btn-clear-custom" class="btn-big btn-plain">🗑 清除全部自訂題目</button>
          <button id="btn-import-cancel" class="btn-big btn-plain">取消</button>
        </div>
      </div>`, true);

    document.getElementById("btn-do-import").onclick = () => this._doImport();
    document.getElementById("btn-import-cancel").onclick = () => this.closeModal();
    document.getElementById("btn-clear-custom").onclick = () => {
      const st = loadState();
      st.customQuestions = [];
      saveState();
      this.closeModal();
      this.renderSetup();
      this.toast("已清除額外匯入嘅題目（網站題庫唔受影響）");
    };
  },

  _doImport() {
    const file = document.getElementById("csv-file").files[0];
    const pasted = document.getElementById("csv-paste").value;

    if (file) {
      const reader = new FileReader();
      reader.onload = () => this._importText(reader.result);
      reader.onerror = () => this.toast("讀檔失敗，請再試一次");
      reader.readAsText(file, "UTF-8");
    } else if (pasted.trim()) {
      this._importText(pasted);
    } else {
      this.toast("請揀檔案或貼上 CSV 內容");
    }
  },

  _importText(text) {
    const { questions, skipped } = questionsFromCSV(text);
    if (questions.length === 0) {
      this.toast(skipped > 0 ? `冇有效題目（${skipped} 行格式唔啱）` : "冇有效題目");
      return;
    }
    const st = loadState();
    /* 防重複：對照全部題目（內建＋網站＋已匯入），同題型＋同句子＋同答案就跳過 */
    const seen = new Set(getAllQuestions().map(questionKey));
    let added = 0;
    questions.forEach(q => {
      const key = `${q.topic}\u0001${q.sentence}\u0001${q.answer}`;
      if (seen.has(key)) return;
      seen.add(key);
      (st.customQuestions = st.customQuestions || []).push(q);
      added++;
    });
    saveState();
    this.closeModal();
    this.selectedTopics = new Set(this._allTopicKeys());   // 新題型自動選上
    this.renderSetup();
    if (added === 0) {
      this.toast("啲題目之前已經匯入咗，冇重複加入");
    } else {
      const dup = questions.length - added;
      this.toast(`成功匯入 ${added} 題${dup > 0 ? `（${dup} 題重複略過）` : ""}${skipped > 0 ? `，${skipped} 行格式唔啱略過` : ""}！`);
    }
  },

  /* ---------- 完成一組 → 結算 ---------- */
  onSetComplete(data) {
    const st = loadState();

    /* 獎勵計算 */
    const rewards = { ticket: 1, diamonds: 0, exp: GAME_CONFIG.EXP_BASE };
    if (data.score === data.total) {
      rewards.diamonds = GAME_CONFIG.PERFECT_DIAMOND;
      rewards.exp += GAME_CONFIG.EXP_PERFECT_BONUS;
    } else if (data.score >= GAME_CONFIG.GOOD_THRESHOLD) {
      rewards.diamonds = GAME_CONFIG.GOOD_DIAMOND;
    }

    st.normalPulls += rewards.ticket;
    st.diamonds += rewards.diamonds;
    addPracticeRecord(data);
    this.lastRecord = data;

    /* 經驗值入帳：有拍檔 → 直接加；冇 → 儲起等第一抽 */
    let evolvedTo = null;
    const entry = getActiveEntry();
    if (entry) {
      const res = addEntryExp(entry, rewards.exp);
      evolvedTo = res.evolvedTo;
    } else {
      st.pendingExp = (st.pendingExp || 0) + rewards.exp;
    }
    saveState();

    this._renderSettlement(data, rewards);
    this.showView("view-settlement");
    if (evolvedTo) setTimeout(() => this.showEvolveModal(evolvedTo), 600);
  },

  _renderSettlement(data, rewards) {
    const perfect = data.score === data.total;
    document.getElementById("settle-title").textContent =
      perfect ? "Perfect！全對呀！🎉" : "做完喇！";

    const mm = Math.floor(data.duration / 60), ss = data.duration % 60;
    document.getElementById("settle-score").innerHTML = `
      <div class="settle-score-big ${perfect ? "perfect" : ""}">${data.score}<small>/${data.total}</small></div>
      <div class="settle-time">⏱ 用咗 ${mm}:${String(ss).padStart(2, "0")}</div>`;

    document.getElementById("settle-rewards").innerHTML = `
      <div class="reward-chip">🎫 普通抽 +${rewards.ticket}</div>
      ${rewards.diamonds > 0 ? `<div class="reward-chip">💎 鑽石 +${rewards.diamonds}</div>` : ""}
      <div class="reward-chip">⭐ EXP +${rewards.exp}</div>`;

    const st = loadState();
    const rareBtn = document.getElementById("btn-pull-rare");
    rareBtn.style.display = st.diamonds >= GAME_CONFIG.RARE_PULL_COST ? "" : "none";
    rareBtn.textContent = `💎 用 ${GAME_CONFIG.RARE_PULL_COST} 鑽石抽稀有（有 ${st.diamonds}）`;
  },

  /* ---------- 錯題回顧 ---------- */
  showReview() {
    const list = document.getElementById("review-list");
    list.innerHTML = "";
    const results = this.lastRecord ? this.lastRecord.results : [];
    const wrongs = results.filter(r => !r.correct);

    if (results.length > 0 && wrongs.length === 0) {
      list.innerHTML = `<div class="review-none">今次全對，冇錯題！🌟</div>`;
    } else {
      wrongs.forEach(w => {
        const q = findQuestion(w.qid);
        if (q) Explain.render(list, q, w.chosen);
      });
    }
    this.showView("view-review");
  },

  /* ---------- 進化 Modal（簡單淡入切換） ---------- */
  showEvolveModal(species) {
    const chain = EVOLUTION_CHAINS.find(c => c.key === species.chainKey);
    const entry = loadState().entries.find(e => e.chainKey === species.chainKey);
    const stage = [species.dexId, species.name, species.zh];
    const prevStage = species.stage > 1 && entry
      ? (species.stage - 1 <= chain.stages.length ? chain.stages[species.stage - 2] : chain.stages[chain.stages.length - 1])
      : null;
    this.showModal(`
      <div class="evolve-box">
        <div class="evolve-title">✨ 進化了！✨</div>
        ${prevStage ? `<div class="evolve-from">${prevStage[1]} →</div>` : ""}
        <img class="evolve-art" src="${artworkURL(stage[0])}" alt="${stage[1]}"
             onerror="this.onerror=null;this.src='${spriteURL(stage[0])}'">
        <div class="evolve-name">${stage[1]}（${stage[2]}）</div>
        <button id="evolve-ok" class="btn-big btn-primary">好嘢！</button>
      </div>`, true);
    document.getElementById("evolve-ok").onclick = () => {
      this.closeModal();
      this.renderHome();
    };
  },

  /* ---------- Modal / Toast ---------- */
  showModal(html, noClose) {
    const root = document.getElementById("modal-root");
    root.innerHTML = `<div class="modal-backdrop"><div class="modal-card">${html}</div></div>`;
    if (!noClose) {
      root.querySelector(".modal-backdrop").onclick = (e) => {
        if (e.target === e.currentTarget) this.closeModal();
      };
    }
  },

  closeModal() {
    document.getElementById("modal-root").innerHTML = "";
  },

  toast(msg) {
    const t = document.getElementById("toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => t.classList.remove("show"), 2200);
  },

  /* ---------- 初始化 ---------- */
  async init() {
    /* 按鈕 */
    document.getElementById("btn-start-quiz").onclick = () => this.openSetup();
    document.getElementById("btn-home-pokedex").onclick = () => Pokedex.open();
    document.getElementById("btn-home-calendar").onclick = () => Calendar.open();
    document.getElementById("btn-pull-normal").onclick = () => Gacha.open("normal");
    document.getElementById("btn-pull-rare").onclick = () => Gacha.open("rare");
    document.getElementById("btn-review").onclick = () => this.showReview();
    document.getElementById("btn-settle-home").onclick = () => { this.renderHome(); this.showView("view-home"); };
    document.getElementById("btn-do-pull").onclick = () => Gacha.pull();
    document.getElementById("btn-gacha-home").onclick = () => { this.renderHome(); this.showView("view-home"); };
    document.getElementById("btn-dex-back").onclick = () => { this.renderHome(); this.showView("view-home"); };
    document.getElementById("btn-cal-back").onclick = () => { this.renderHome(); this.showView("view-home"); };
    document.getElementById("btn-review-back").onclick = () => {
      /* 由結算入嚟 → 返結算；由日曆入嚟 → 返主頁 */
      if (this._reviewFrom === "calendar") { this.showView("view-home"); }
      else this.showView("view-settlement");
      this._reviewFrom = null;
    };

    /* 題型選擇畫面 */
    document.getElementById("btn-setup-start").onclick = () => Quiz.start([...this.selectedTopics]);
    document.getElementById("btn-topic-all").onclick = () => {
      this.selectedTopics = new Set(this._allTopicKeys());
      this.renderSetup();
    };
    document.getElementById("btn-topic-none").onclick = () => {
      this.selectedTopics = new Set();
      this.renderSetup();
    };
    document.getElementById("btn-import-csv").onclick = () => this.openImport();
    document.getElementById("btn-setup-back").onclick = () => { this.renderHome(); this.showView("view-home"); };

    /* 做題：鍵盤輸入提交 */
    document.getElementById("btn-quiz-submit").onclick = () => Quiz.submit();
    document.getElementById("quiz-answer").addEventListener("keydown", (e) => {
      if (e.key === "Enter") Quiz.submit();
    });

    /* 日曆 */
    document.getElementById("btn-cal-prev").onclick = () => Calendar.prev();
    document.getElementById("btn-cal-next").onclick = () => Calendar.next();

    /* 原本 showReview 需要知道來源 */
    const _origShowReview = this.showReview.bind(this);
    this.showReview = (from) => { this._reviewFrom = from || null; _origShowReview(); };

    /* 載入網站題庫（questions.csv）後先畫主畫面 */
    await loadSiteQuestions();

    this.renderHome();
    this.showView("view-home");

    /* Service Worker（PWA 離線） */
    if (location.protocol.startsWith("http") && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("sw.js").catch(() => {});
    }
  }
};

document.addEventListener("DOMContentLoaded", () => App.init());
