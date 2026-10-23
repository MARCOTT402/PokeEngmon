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
    document.body.classList.toggle("capture-mode", id === "view-capture");
    window.scrollTo(0, 0);
  },

  /* ---------- 主畫面 ---------- */
  renderHome() {
    const st = loadState();
    document.getElementById("topbar-name").innerHTML = `${escapeHTML(st.playerName)} <span class="name-edit">✎</span>`;
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
      ensureEntryPokemonData(entry);
      const chain = EVOLUTION_CHAINS.find(c => c.key === entry.chainKey);
      const cur = entryCurrentSpecies(entry);
      const rz = RARITY[chain.baseRarity];
      const level = entry.level || 1;
      const stars = "★".repeat(entry.stars || 1);
      /* Animated pixel GIF from local assets; falls back to the static sprite */
      sprite.onerror = () => { sprite.onerror = null; sprite.src = spriteURL(cur[0]); };
      sprite.src = animatedURL(cur[0]);
      sprite.style.visibility = "visible";
      nameEl.textContent = cur[1];
      stageEl.innerHTML = `<span class="rarity-chip" style="background:${rz.bg};color:${rz.color}">${rz.label}</span> Lv.${level} <span class="hero-stars">${stars}</span>`;
      if (level >= MAX_LEVEL) {
        bar.style.width = "100%";
        expText.textContent = `Lv.MAX ・ Fully evolved 🎉`;
      } else {
        const base = expAtLevel(cur[0], level);
        const span = levelSpan(cur[0], level);
        const into = Math.max(0, entry.exp - base);
        bar.style.width = Math.min(100, (into / span) * 100) + "%";
        expText.textContent = `Lv. ${level} ・ EXP ${into} / ${span} to next Lv.`;
      }
    } else {
      sprite.style.visibility = "hidden";
      nameEl.textContent = "No Pokémon yet";
      stageEl.textContent = "";
      bar.style.width = "0%";
      expText.textContent = "Answer questions → pull a Pokémon!";
    }

    /* 點圖片換拍檔（只可換已抽到嘅） */
    const nOwned = st.entries.length;
    sprite.classList.toggle("clickable", nOwned >= 2);
    labelEl.textContent = nOwned >= 2 ? "My Partner (tap to switch)" : "My Partner";
    sprite.onclick = () => {
      if (nOwned >= 2) this.openPartnerPicker();
      else if (nOwned === 1) this.toast("Only one partner so far — pull a second one to switch!");
    };

    /* Stats */
    const acc = st.totalQuestions > 0 ? Math.round((st.totalCorrect / st.totalQuestions) * 100) : 0;
    document.getElementById("home-stats").innerHTML = `
      <span>Sets done <b>${st.totalSets}</b></span>
      <span>Accuracy <b>${acc}%</b></span>
      <span>Day streak <b>${calcStreak()}</b></span>`;
  },

  /* ---------- 重設進度（Settings 內，要輸入訓練員名先撳得） ---------- */
  _confirmReset() {
    const st = loadState();
    const playerName = st.playerName || "The PokéEngmon Trainer";
    this.showModal(`
      <div class="confirm-box">
        <p>Reset <b>all progress</b> and the Pokédex?<br><small>(Imported custom questions will also be deleted)</small></p>
        <p class="reset-type-hint">Type your trainer name <b>${playerName}</b> to confirm:</p>
        <input id="reset-name-input" class="quiz-answer-input" type="text"
               autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false"
               placeholder="${playerName}">
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
    yesBtn.onclick = () => {
      resetState();
      this.closeModal();
      this.renderHome();
      this.toast("All reset — starting fresh!");
    };
    document.getElementById("cf-no").onclick = () => this.closeModal();
  },

  /* ---------- 換拍檔（只限已抽到嘅） ---------- */
  openPartnerPicker() {
    const st = loadState();
    const rows = st.entries.map(entry => {
      ensureEntryPokemonData(entry);
      const chain = EVOLUTION_CHAINS.find(c => c.key === entry.chainKey);
      const cur = entryCurrentSpecies(entry);
      const rz = RARITY[chain.baseRarity];
      const active = entry.uid === st.activeUid;
      return `
        <button class="dex-cell owned ${active ? "current" : ""}" data-uid="${entry.uid}">
          <img src="${spriteURL(cur[0])}" alt="${cur[1]}">
          <span class="dex-name">${cur[1]}</span>
          <span class="dex-rarity" style="background:${rz.bg};color:${rz.color}">${rz.label}</span>
          <span class="p-stage">Lv.${entry.level} ・ ${"★".repeat(entry.stars || 1)}${active ? " ・ Active" : ""}</span>
        </button>`;
    }).join("");

    this.showModal(`
      <div class="partner-box">
        <h3 class="partner-title">🔄 Switch Partner</h3>
        <p class="partner-sub">Tap a Pokémon you own to make it your partner</p>
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
        this.toast(`Partner changed to ${cur[1]}!`);
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
        <span class="course-count">${sel}/${keys.length} topics · ${count} questions</span>
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
        bAll.textContent = "Select all in this course";
        bAll.onclick = () => { keys.forEach(k => this.selectedTopics.add(k)); this.renderSetup(); };
        const bNone = document.createElement("button");
        bNone.className = "btn-mini";
        bNone.textContent = "Clear all";
        bNone.onclick = () => { keys.forEach(k => this.selectedTopics.delete(k)); this.renderSetup(); };
        mini.appendChild(bAll);
        mini.appendChild(bNone);
        box.appendChild(mini);

        topics.forEach(({ topic, count: n, key }) => {
          const on = this.selectedTopics.has(key);
          const b = document.createElement("button");
          b.className = "topic-chip" + (on ? " on" : "");
          b.innerHTML = `<span class="topic-name">${escapeHTML(topic)}</span><span class="topic-count">${n} questions</span>`;
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
    /* 計算已揀題型嘅總題數（SM-2 Session Pool 會自動分配 Due / New）*/
    const allQ = getAllQuestions();
    const totalCount = allQ.filter(q => this.selectedTopics.has(questionTopicKey(q))).length;
    const startBtn = document.getElementById("btn-setup-start");
    startBtn.disabled = selCount === 0 || totalCount === 0;
    startBtn.textContent = selCount === 0
      ? "Pick at least one topic"
      : totalCount === 0
        ? "No questions match — pick another topic"
        : `▶ Start (${totalCount} questions)`;

    /* Question source counts */
    const st = loadState();
    const siteN = SITE_QUESTIONS.length;
    const customN = (st.customQuestions || []).length;
    const parts = [];
    if (siteN > 0) parts.push(`Site questions: ${siteN}`);
    if (customN > 0) parts.push(`Imported: ${customN}`);
    document.getElementById("custom-q-count").textContent = parts.join(" ・ ");
  },

  /* ---------- CSV 匯入（含指引） ---------- */
  openImport() {
    this.showModal(`
      <div class="import-box">
        <h3>📥 Import CSV Questions</h3>
        <details class="csv-guide">
          <summary>📖 CSV format guide (tap to open)</summary>
          <div class="csv-guide-body">
            <p><b>One question per line, 8 columns, comma separated:</b></p>
            <pre>No,Course,Topic,Level,Sentence,Answer,Keywords,Hint</pre>
            <ul>
              <li><b>No</b> (optional): five digits, e.g. <code>00001</code>; also matches <code>image_file/00001.png</code> as the question image</li>
              <li><b>Course</b>: the big group (e.g. <code>Articles</code>); a course can hold many topics</li>
              <li><b>Topic</b>: the small group inside the course (e.g. <code>Articles: Basics</code>); same name = same topic</li>
              <li><b>Level</b>: number <code>1</code>, <code>2</code>, <code>3</code>, <code>4</code>… (shows that many ★ when answering)</li>
              <li><b>Sentence</b>: must contain <code>___</code> (three underscores) as the blank</li>
              <li><b>Answer</b>: the correct answer; several accepted answers can be separated with <code>|</code> or <code>/</code> (e.g. <code>were not / weren't</code>); <b>may be blank</b> (zero article)</li>
              <li><b>Keywords</b> (optional): words to highlight in the sentence, separated with <code>/</code> (one arrow from each word to the blank)</li>
              <li><b>Hint</b> (optional): short explanation shown after a wrong answer</li>
            </ul>
            <p><b>Example:</b></p>
            <pre>No,Course,Topic,Level,Sentence,Answer,Keywords,Hint
00001,Articles,Articles: Basics,1,This is ___ apple. It is sweet and red.,an,apple,Vowel sound (apple)
00002,Articles,Articles: Advanced,3,He went to ___ school by bus.,,school,Zero article: go to school</pre>
            <p class="csv-note">⚠ A header row (first cell "No" or "Course") is skipped automatically. Wrap any value containing commas in double quotes.<br>Question images live in <code>image_file/</code> named after the number (<code>00001.png</code>; jpg/jpeg/webp/gif also accepted). No image = nothing shown.</p>
          </div>
        </details>

        <label class="import-label">Option 1: choose a CSV file</label>
        <input type="file" id="csv-file" accept=".csv,text/csv,text/plain" class="import-file">

        <label class="import-label">Option 2: paste the content</label>
        <textarea id="csv-paste" class="import-paste" rows="5" placeholder="No,Course,Topic,Level,Sentence,Answer,Keywords,Hint&#10;00001,Past Tense,Verb Past,1,Yesterday I ___(go) to the park.,went,Yesterday,go becomes went"></textarea>

        <div class="confirm-row">
          <button id="btn-do-import" class="btn-big btn-primary">Import</button>
          <button id="btn-clear-custom" class="btn-big btn-plain">🗑 Delete all imported questions</button>
          <button id="btn-import-cancel" class="btn-big btn-plain">Cancel</button>
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
      this.toast("Imported questions deleted (site questions are kept)");
    };
  },

  _doImport() {
    const file = document.getElementById("csv-file").files[0];
    const pasted = document.getElementById("csv-paste").value;

    if (file) {
      const reader = new FileReader();
      reader.onload = () => this._importText(reader.result);
      reader.onerror = () => this.toast("Could not read the file — please try again");
      reader.readAsText(file, "UTF-8");
    } else if (pasted.trim()) {
      this._importText(pasted);
    } else {
      this.toast("Choose a file or paste CSV content");
    }
  },

  _importText(text) {
    const { questions, skipped } = questionsFromCSV(text);
    if (questions.length === 0) {
      this.toast(skipped > 0 ? `No valid questions (${skipped} bad rows)` : "No valid questions");
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
      this.toast("Those questions were already imported — nothing added");
    } else {
      const dup = questions.length - added;
      this.toast(`Imported ${added} questions${dup > 0 ? ` (${dup} duplicates skipped)` : ""}${skipped > 0 ? `, ${skipped} bad rows skipped` : ""}!`);
    }
  },

  /* ---------- 完成一組 → （有錯題先入 Power Up Zone）→ 捕捉場景 → 結算 ---------- */
  async onQuizFinished(data) {
    this.lastCapture = null;

    const quizView = document.getElementById("view-quiz");
    quizView.classList.add("is-fading");
    await new Promise(r => setTimeout(r, 320));
    quizView.classList.remove("is-fading");

    /* 回合尾錯題清算：有錯題 → 先入 ⚡ Power Up Zone 重做至全對，
       全部改啱後先清零錯題 SRS stage，再跳入 WARNING 捕捉頁 */
    const wrongs = data.results
      .filter(r => !r.correct)
      .map(r => ({ q: findQuestion(r.qid), chosen: r.chosen }))
      .filter(x => x.q);
    if (wrongs.length > 0) {
      PowerUp.start(wrongs, () => this._captureThenSettle(data));
      return;
    }
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
              this.lastCapture = { dexId: cur[0], name: cur[1], isDupe: res.isDupe, caught: true };
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

    /* 獎勵計算：經驗值按 PokéAPI 該等級所需經驗比例發放 */
    const entry = getActiveEntry();
    const perfect = data.score === data.total;
    let expGain = GAME_CONFIG.EXP_BASE;
    if (entry) {
      ensureEntryPokemonData(entry);
      const dexId = entryCurrentSpecies(entry)[0];
      const span = levelSpan(dexId, entry.level || 1);
      expGain = Math.max(10, Math.round(span * (perfect ? 0.12 : 0.09)));
    }
    /* 記憶光芒 Bonus XP：答對「抗忘記題目」（記憶曲線到期題）該題 EXP ×1.5
       即每題基本份額之外，再多半份 */
    const memoryCorrect = data.results.filter(r => r.correct && r.memory).length;
    const memoryBonus = memoryCorrect > 0
      ? Math.round((expGain / data.total) * 0.5 * memoryCorrect)
      : 0;
    const rewards = { ticket: 0, diamonds: 0, exp: expGain + memoryBonus, memoryBonus };
    /* Diamonds：防金手指走 RPC（登入時由 server 計算），未登入保留本地計算 */
    let serverBonus = null;
    if (window.SupabaseAuth && SupabaseAuth.isLoggedIn()) {
      serverBonus = await SupabaseAuth.awardRoundDiamonds(data.score, data.total);
    }
    if (serverBonus !== null && serverBonus !== undefined) {
      rewards.diamonds = serverBonus;
    } else {
      if (perfect) rewards.diamonds = GAME_CONFIG.PERFECT_DIAMOND;
      else if (data.score >= GAME_CONFIG.GREAT_THRESHOLD) rewards.diamonds = GAME_CONFIG.GREAT_DIAMOND;
      else if (data.score >= GAME_CONFIG.GOOD_THRESHOLD) rewards.diamonds = GAME_CONFIG.GOOD_DIAMOND;
    }

    st.diamonds += rewards.diamonds;
    addPracticeRecord(data);
    this.lastRecord = data;

    /* 經驗值入帳：有拍檔 → 直接加；冇 → 儲起等第一抽 */
    let levelRes = null;
    if (entry) {
      levelRes = addEntryExp(entry, rewards.exp);
    } else {
      st.pendingExp = (st.pendingExp || 0) + rewards.exp;
    }
    saveState();

    this._renderSettlement(data, rewards);
    this.showView("view-settlement");
    if (levelRes) {
      if (levelRes.levelsGained > 0) {
        const whose = entryCurrentSpecies(entry)[1];
        this.toast(`${whose} reached Lv.${entry.level}!`);
      }
      if (levelRes.evolvedTo) setTimeout(() => this.showEvolveModal(levelRes.evolvedTo), 600);
      if (levelRes.learned.length) {
        setTimeout(() => this.queueMoveLearn(entry, levelRes.learned), levelRes.evolvedTo ? 1500 : 600);
      }
    }
  },

  _renderSettlement(data, rewards) {
    const perfect = data.score === data.total;
    document.getElementById("settle-title").textContent =
      perfect ? "Perfect! All correct! 🎉" : "Set complete!";

    const mm = Math.floor(data.duration / 60), ss = data.duration % 60;
    document.getElementById("settle-score").innerHTML = `
      <div class="settle-score-big ${perfect ? "perfect" : ""}">${data.score}<small>/${data.total}</small></div>
      <div class="settle-time">⏱ Took ${mm}:${String(ss).padStart(2, "0")}</div>`;

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

    document.getElementById("settle-rewards").innerHTML = capHTML + `
      ${rewards.diamonds > 0 ? `<div class="reward-chip">💎 Diamonds +${rewards.diamonds}</div>` : ""}
      <div class="reward-chip">⭐ EXP +${rewards.exp}${rewards.memoryBonus > 0 ? ` <small>(+${rewards.memoryBonus} memory bonus ✨)</small>` : ""}</div>`;

    /* Capture jingle on settlement: success → "Obtained a Pokémon!", escape → "Obtained a Berry!" */
    if (cap && window.CaptureScene && CaptureScene.audio) {
      const jingleUrl = cap.caught ? "assets/bgm/obtained-pokemon.mp3" : "assets/bgm/obtained-berry.mp3";
      CaptureScene.audio.playOnce(jingleUrl, 0.6);
    }
    /* 捕捉完結：jingle 播完後恢復全域 BGM */
    if (window.CaptureScene && CaptureScene.audio) {
      setTimeout(() => CaptureScene.audio.startTownBGM(), 3200);
    }

    const st = loadState();
    const rareBtn = document.getElementById("btn-pull-rare");
    rareBtn.style.display = st.diamonds >= GAME_CONFIG.RARE_PULL_COST ? "" : "none";
    rareBtn.textContent = `💎 Rare pull — ${GAME_CONFIG.RARE_PULL_COST} diamonds (you have ${st.diamonds})`;
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

  /* ---------- 進化 Modal（簡單淡入切換） ---------- */
  showEvolveModal(species) {
    const chain = EVOLUTION_CHAINS.find(c => c.key === species.chainKey);
    const entry = loadState().entries.find(e => e.chainKey === species.chainKey);
    const stage = [species.dexId, species.name];
    const prevStage = species.stage > 1 && entry
      ? (species.stage - 1 <= chain.stages.length ? chain.stages[species.stage - 2] : chain.stages[chain.stages.length - 1])
      : null;
    this.showModal(`
      <div class="evolve-box">
        <div class="evolve-title">✨ It evolved! ✨</div>
        ${prevStage ? `<div class="evolve-from">${prevStage[1]} →</div>` : ""}
        <img class="evolve-art" src="${artworkURL(stage[0])}" alt="${stage[1]}"
             onerror="this.onerror=null;this.src='${spriteURL(stage[0])}'">
        <div class="evolve-name">${stage[1]}</div>
        <button id="evolve-ok" class="btn-big btn-primary">Awesome!</button>
      </div>`, true);
    document.getElementById("evolve-ok").onclick = () => {
      this.closeModal();
      this.renderHome();
    };
  },

  /* ---------- 設定：匯出／匯入存檔 ---------- */
  openSettings() {
    this.showModal(`
      <div class="settings-box">
        <h3 class="settings-title">⚙️ Settings</h3>
        <p class="settings-sub">Your progress is saved in this browser only. Export a backup regularly, or import one to restore.</p>
        <button id="btn-export-save" class="btn-big btn-secondary">⬇️ Export Save</button>
        <button id="btn-import-save" class="btn-big btn-secondary">⬆️ Import Save</button>
        <input id="import-file" type="file" accept=".json,application/json" hidden>
        <small class="settings-note">Backup file: pokeengmon-save-YYYY-MM-DD.json</small>
        <button id="btn-import-csv2" class="btn-big btn-secondary">📥 Import CSV Questions</button>
        <button id="btn-reset-progress" class="btn-big btn-danger">🗑 Reset Progress</button>
        <button id="btn-settings-close" class="btn-big btn-plain">Close</button>
      </div>`);
    const fileInput = document.getElementById("import-file");
    document.getElementById("btn-export-save").onclick = () => this.exportSave();
    document.getElementById("btn-import-save").onclick = () => fileInput.click();
    fileInput.onchange = () => this.handleImportFile(fileInput.files[0]);
    document.getElementById("btn-import-csv2").onclick = () => this.openImport();
    document.getElementById("btn-reset-progress").onclick = () => this._confirmReset();
    document.getElementById("btn-settings-close").onclick = () => this.closeModal();
  },

  /* ---------- Login Hub（Poké Ball 風格） ---------- */
  openLoginHub() {
    const user = window.SupabaseAuth ? SupabaseAuth.currentUser() : null;
    const deviceId = ensureDeviceId();

    if (user) {
      /* 已登入狀態 */
      this.showModal(`
        <div class="login-hub logged-in">
          <div class="lh-ball" aria-hidden="true"></div>
          <h3>✅ Connected Trainer</h3>
          <p class="lh-email">${escapeHTML(user.email || user.user_metadata?.name || "Trainer")}</p>
          <p class="lh-sub">Your progress is safely synced to the cloud.</p>
          <div class="lh-actions">
            <button id="lh-sync" class="btn-big btn-primary">🔄 Sync Now</button>
            <button id="lh-signout" class="btn-big btn-plain">Sign out</button>
          </div>
        </div>`, true);

      document.getElementById("lh-sync").onclick = async () => {
        try { await Sync.pull(); this.toast("Sync complete!"); this.closeModal(); }
        catch (e) { this.toast("Sync failed — check internet"); }
      };
      document.getElementById("lh-signout").onclick = async () => {
        await SupabaseAuth.signOut();
        /* 登出後清除 auth 狀態 + refresh LocalStorage 拉匿名資料 */
        try { await Sync.pull(); } catch (e) {}
        this.closeModal();
        this.renderHome();
        this.toast("Signed out");
      };
    } else {
      /* 未登入狀態 */
      this.showModal(`
        <div class="login-hub">
          <div class="lh-ball" aria-hidden="true"></div>
          <h3>🔐 Save Your Progress</h3>
          <p class="lh-sub">Sign in to sync across devices &amp; never lose your trainer data.</p>

          <div class="lh-actions">
            <button id="lh-google" class="btn-big btn-google">
              <svg width="18" height="18" viewBox="0 0 48 48"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.4 29.2 35.5 24 35.5c-6.4 0-11.5-5.1-11.5-11.5S17.6 12.5 24 12.5c3 0 5.8 1.1 7.9 3l5.7-5.7C33.8 6.4 29.1 4.5 24 4.5 13.2 4.5 4.5 13.2 4.5 24S13.2 43.5 24 43.5 43.5 34.8 43.5 24c0-1.2-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.1l6.6 4.8C14.7 15 19 12.5 24 12.5c3 0 5.8 1.1 7.9 3l5.7-5.7C33.8 6.4 29.1 4.5 24 4.5 16.3 4.5 9.6 8.8 6.3 14.1z"/><path fill="#4CAF50" d="M24 43.5c5 0 9.6-1.9 13-5l-6-4.8c-2.1 1.4-4.8 2.3-7.9 2.3-5.2 0-9.7-3.1-11.3-7.4l-6.5 5C9.3 39.2 16.1 43.5 24 43.5z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4 5.5l6 4.8C42 33.9 43.5 29.2 43.5 24c0-1.2-.1-2.4-.4-3.5z"/></svg>
              Continue with Google
            </button>
          </div>

          <div class="lh-divider"><span>Device saved anonymously</span></div>
          <p class="lh-device">Local ID: <code>${escapeHTML(deviceId.slice(0, 8))}</code></p>

          <p class="lh-note">Playing without login is fine — your progress stays on this device. Sign in anytime to cloud-sync.</p>
        </div>`, true);

      document.getElementById("lh-google").onclick = async () => {
        this.closeModal();
        try { await SupabaseAuth.signInWithGoogle(); }
        catch (e) { console.warn("Google sign-in failed:", e); }
      };
    }
  },

  async _handleOAuthCallback() {
    const url = new URL(window.location.href);
    const token = url.searchParams.get("access_token");
    const refresh = url.searchParams.get("refresh_token");
    const expires = parseInt(url.searchParams.get("expires_in") || "3600");

    if (!token) return;

    /* Supabase 係 URL fragment 而唔係 query string redirect（popup 模式），
       但我哋用 window.open → 手動解析 popup URL */
    /* 呢度處理 redirect 模式返嚟嘅 query string */
    const session = {
      access_token: token,
      refresh_token: refresh,
      expires_at: Math.floor(Date.now() / 1000) + expires,
      user: { id: url.searchParams.get("user_id") || uuidGen(), email: url.searchParams.get("email") }
    };
    SupabaseAuth.saveSession(session);

    /* 匿名資料 migrate 到 auth uid */
    const deviceId = ensureDeviceId();
    if (session.user && session.user.id && deviceId) {
      await SupabaseAuth.migrateAnonymous(deviceId);
    }

    /* Clean URL + refresh */
    window.history.replaceState({}, "", window.location.pathname);
    try { await Sync.pull(); } catch (e) {}
    this.renderHome();
    this.toast("Signed in! Your progress is synced.");
  },

  async signOut() {
    if (window.SupabaseAuth) await SupabaseAuth.signOut();
    try { await Sync.pull(); } catch (e) {}
    this.renderHome();
    this.toast("Signed out");
  },

  exportSave() {
    const blob = new Blob([JSON.stringify(loadState(), null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `pokeengmon-save-${dateKey()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    this.toast("Save file exported!");
  },

  async handleImportFile(file) {
    if (!file) return;
    let parsed;
    try {
      parsed = JSON.parse(await file.text());
      if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.entries)) {
        throw new Error("invalid");
      }
    } catch (e) {
      this.toast("That is not a valid PokeEngmon save file");
      return;
    }
    const count = parsed.entries.length;
    const name = parsed.playerName || "Trainer";
    this.showModal(`
      <div class="confirm-box">
        <p>Import this save for <b>${escapeHTML(name)}</b>?<br>
          <small>${count} Pokémon · your current progress will be replaced.</small></p>
        <div class="confirm-row">
          <button id="import-yes" class="btn-big btn-primary">Import</button>
          <button id="import-no" class="btn-big btn-plain">Cancel</button>
        </div>
      </div>`, true);
    document.getElementById("import-yes").onclick = () => {
      importState(parsed);
      migrateEntries();
      this.closeModal();
      this.renderHome();
      this.toast(`Save imported: ${name}`);
    };
    document.getElementById("import-no").onclick = () => this.openSettings();
  },

  /* ---------- 改訓練員名 ---------- */
  openRename() {
    const st = loadState();
    this.showModal(`
      <div class="rename-box">
        <h3 class="rename-title">Trainer Name</h3>
        <p class="rename-sub">Type a name for your trainer.</p>
        <input id="rename-input" class="rename-input" type="text" maxlength="24"
               autocomplete="off" autocapitalize="words" spellcheck="false"
               value="${escapeHTML(st.playerName)}">
        <div class="confirm-row">
          <button id="rename-save" class="btn-big btn-primary">Save</button>
          <button id="rename-cancel" class="btn-big btn-plain">Cancel</button>
        </div>
      </div>`);
    const input = document.getElementById("rename-input");
    input.focus();
    input.select();
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") document.getElementById("rename-save").click();
    });
    document.getElementById("rename-save").onclick = () => {
      const name = input.value.trim().slice(0, 24) || "The PokéEngmon Trainer";
      st.playerName = name;
      st.nameCustomized = true;
      saveState();
      this.closeModal();
      this.renderHome();
      this.toast(`Trainer name saved: ${name}`);
    };
    document.getElementById("rename-cancel").onclick = () => this.closeModal();
  },

  /* ---------- 版權 / 免責聲明 ---------- */
  openDisclaimer() {
    this.showModal(`
      <div class="disclaimer-box">
        <h3>Copyright &amp; Disclaimer</h3>
        <p>This website is an unofficial, non-commercial educational and reward tool. It is <b>NOT</b> affiliated with, endorsed, sponsored, or approved by Nintendo, Game Freak, Creatures Inc., or The Pokémon Company.</p>
        <p>Pokémon and Pokémon character names, images, sprites, cries, music, and related game assets are trademarks of © Nintendo, Creatures Inc., and GAME FREAK inc. All rights belong to their respective owners.</p>
        <p>All assets are used only for non-commercial educational, learning-reward, and motivational purposes.</p>

        <h4>Data &amp; Image Credits</h4>
        <p>Pokémon base stats, moves, evolution data, sprites, and type icons are provided by <a href="https://pokeapi.co" target="_blank" rel="noopener">PokéAPI</a>.</p>
        <p>Pokémon cries are provided by the Pokémon Showdown community.</p>

        <h4>Music &amp; Sound Credits</h4>
        <p>Background music (<i>Nuvema Town</i>, from Pokémon Black/White) and battle/jingle tracks (<i>Battle! (Wild Pokémon)</i>, <i>Obtained a Pokémon!</i>, <i>Obtained a Berry!</i>, from Pokémon Red/Green/Blue/Yellow) are from the original Pokémon game soundtracks, composed by Junichi Masuda, Gō Ichinose, Morikazu Aoki, Shota Kageyama and others. © Nintendo / Creatures Inc. / GAME FREAK inc.</p>
        <p>Soundtrack resources referenced from <a href="https://downloads.khinsider.com" target="_blank" rel="noopener">KHInsider Video Game Music</a> (unofficial fan archive).</p>

        <h4>In-Game Items</h4>
        <p>All diamonds, pull tickets, candies, cards, and Pokémon in this app are virtual learning rewards. They have no real-world value and cannot be exchanged for money or physical goods. There is no real-money trading.</p>

        <button id="btn-disclaimer-close" class="btn-big btn-primary">Close</button>
      </div>`);
    document.getElementById("btn-disclaimer-close").onclick = () => this.closeModal();
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
    ensureDeviceId();   /* 確保匿名裝置 ID 存在（供 SM-2 history + Supabase 用）*/

    /* Supabase pull（背景 async，唔阻塞主流程）*/
    if (window.Sync && Sync.isEnabled()) {
      Sync.pull().catch(() => {});
    }

    /* 按鈕 */
    document.getElementById("btn-start-quiz").onclick = () => this.openSetup();
    document.getElementById("btn-home-pokedex").onclick = () => Pokedex.open();
    document.getElementById("btn-home-calendar").onclick = () => Calendar.open();
    document.getElementById("btn-disclaimer").onclick = () => this.openDisclaimer();
    document.getElementById("topbar-name").onclick = () => this.openRename();
    document.getElementById("btn-settings").onclick = () => this.openSettings();
    document.getElementById("btn-login").onclick = () => this.openLoginHub();

    /* OAuth callback：Supabase redirect 返嚟時自動處理 */
    if (window.location.search.includes("access_token=")) {
      this._handleOAuthCallback();
    }
    /* 主頁資源：鑽石 → 稀有抽；普通抽券 → 普通抽（資源足夠先入得） */
    document.getElementById("btn-top-diamond").onclick = () => {
      const st = loadState();
      if (st.diamonds < GAME_CONFIG.RARE_PULL_COST) {
        this.toast(`Not enough diamonds — need 💎${GAME_CONFIG.RARE_PULL_COST}`);
        return;
      }
      Gacha.open("rare");
    };
    document.getElementById("btn-top-pull").onclick = () => {
      const st = loadState();
      if (st.normalPulls < 1) {
        this.toast("No normal pulls left — earn some by practising!");
        return;
      }
      Gacha.open("normal");
    };
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
    document.getElementById("btn-setup-back").onclick = () => { this.renderHome(); this.showView("view-home"); };

    /* 做題：鍵盤輸入提交 */
    document.getElementById("btn-quiz-submit").onclick = () => {
      if (window.CaptureScene) { window.CaptureScene.primeAudio(); window.CaptureScene.bgmPrime(); }
      Quiz.submit();
    };
    document.getElementById("quiz-answer").addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        if (window.CaptureScene) { window.CaptureScene.primeAudio(); window.CaptureScene.bgmPrime(); }
        Quiz.submit();
      }
    });
    /* 圖片單字題：點圖聽聲（可無限重播） */
    document.getElementById("quiz-word-image-btn").onclick = () => {
      if (window.CaptureScene) { window.CaptureScene.primeAudio(); window.CaptureScene.bgmPrime(); }
      Quiz.playWordAudio();
    };

    /* Power Up Zone：回合尾改錯提交 */
    document.getElementById("btn-powerup-submit").onclick = () => PowerUp.submit();
    document.getElementById("powerup-answer").addEventListener("keydown", (e) => {
      if (e.key === "Enter") PowerUp.submit();
    });

    /* 日曆 */
    document.getElementById("btn-cal-prev").onclick = () => Calendar.prev();
    document.getElementById("btn-cal-next").onclick = () => Calendar.next();

    /* 原本 showReview 需要知道來源 */
    const _origShowReview = this.showReview.bind(this);
    this.showReview = (from) => { this._reviewFrom = from || null; _origShowReview(); };

    /* 載入網站題庫（questions.csv）＋本地 PokéAPI 資料，先畫主畫面 */
    await Promise.all([loadSiteQuestions(), loadPictureWords(), loadPokemonDex()]);
    migrateEntries();

    this.renderHome();
    this.showView("view-home");

    /* 全域 BGM（Nuvema Town）+ Entry Gate：
       1) 開頁即試播 —— PWA / 高互動用戶可直接出聲，唔彈窗
       2) Autoplay 被擋 → 彈 entry gate，撳 YES!（合法手勢）解鎖 + 播 BGM */
    const entryGate = document.getElementById("entry-gate");
    const unlockAudio = () => {
      if (window.CaptureScene && CaptureScene.audio) {
        CaptureScene.audio.ensure();
        CaptureScene.audio.bgmPrime();       /* 預先解鎖 + decode 戰鬥 BGM */
        CaptureScene.audio.startTownBGM();
      }
    };
    unlockAudio();  /* 開頁即試（可能被 suspend） */
    const audioCtx = window.CaptureScene && CaptureScene.audio ? CaptureScene.audio.ctx : null;
    if (audioCtx && audioCtx.state === "running") {
      entryGate.classList.add("hidden");     /* 已獲授權，唔使彈窗 */
    } else {
      entryGate.classList.remove("hidden");
      const closeGate = () => {
        unlockAudio();
        entryGate.classList.add("closing");
        setTimeout(() => entryGate.classList.add("hidden"), 320);
      };
      document.getElementById("btn-entry-yes").addEventListener("click", closeGate);
      /* 掂卡片外都當 YES */
      entryGate.addEventListener("click", (e) => { if (e.target === entryGate) closeGate(); });
    }

    /* Service Worker（PWA 離線）＋新版本自動套用 */
    if (location.protocol.startsWith("http") && "serviceWorker" in navigator) {
      const hadController = !!navigator.serviceWorker.controller;
      let reloading = false;
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (!hadController || reloading) return;
        reloading = true;
        location.reload();
      });
      navigator.serviceWorker.register("sw.js", { updateViaCache: "none" })
        .then(reg => reg.update().catch(() => {}))
        .catch(() => {});
    }
  }
};

document.addEventListener("DOMContentLoaded", () => App.init());
