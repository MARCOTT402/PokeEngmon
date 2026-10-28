/* ============================================================
   PokeEngmon - 主流程
   路由 / 主畫面 / 題型選擇 + CSV 匯入 / 結算獎勵 / 錯題回顧 / 進化 / Modal
   ============================================================ */

const APP_VERSION = "1.2.0";

const App = {
  lastRecord: null,   // 今次做完嘅一組（結算 / 錯題回顧用）
  pendingEvolve: null,
  selectedTopics: new Set(),   // 題型選擇

  /* ---------- 路由 ---------- */
  showView(id) {
    /* 離開抽獎頁：中斷流程（已結算嘅獎勵唔會漏，只係跳過動畫） */
    const cur = document.querySelector(".view.active");
    if (cur && cur.id === "view-gacha" && id !== "view-gacha" && typeof Gacha !== "undefined") {
      Gacha.abort();
    }
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
    /* btn-top-pull (normal pulls) hidden since v48 — skip binding */

    /* 登入 chip 狀態：任何情況下都同步返真實登入狀態（包括 localStorage restore） */
    if (window.SupabaseAuth && SupabaseAuth.isLoggedIn()) this._markLoggedIn();

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
      const rz = RARITY[chain?.baseRarity] || RARITY.normal; /* v141：冇 "common" key，舊 fallback 會 undefined → rz.bg throw */
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
    const verEl = document.getElementById("app-version");
    if (verEl) verEl.textContent = APP_VERSION;
    if (typeof Gym !== "undefined" && Gym.refreshHomeUI) Gym.refreshHomeUI();
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
    yesBtn.onclick = async () => {
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
      const rz = RARITY[chain?.baseRarity] || RARITY.normal;
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
        /* 雲端同步拍檔切換（active 係 column grant 開放嘅非敏感欄位） */
        if (window.Sync && Sync.isEnabled()) Sync.pushActive(uid);
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
    if (customN > 0) parts.push(`Custom: ${customN}`);
    document.getElementById("custom-q-count").textContent = parts.join(" ・ ");
  },

  /* ---------- App 內新增句子題 ---------- */
  openAddSentence() {
    this.showModal(`
      <div class="import-box">
        <h3>✏️ Add sentence question</h3>
        <p class="settings-sub" style="text-align:left;margin:0">Put <code>___</code> where the blank should be.</p>
        <label class="import-label">Sentence</label>
        <textarea id="add-sent-sentence" class="import-paste" rows="3" placeholder="Excuse me, what ___ your name?"></textarea>
        <label class="import-label">Answer</label>
        <input id="add-sent-answer" class="import-file" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="your">
        <label class="import-label">Course (optional)</label>
        <input id="add-sent-course" class="import-file" type="text" value="Custom" placeholder="Custom">
        <label class="import-label">Topic (optional)</label>
        <input id="add-sent-topic" class="import-file" type="text" value="Custom Sentences" placeholder="Custom Sentences">
        <label class="import-label">Level 1–9 (optional)</label>
        <input id="add-sent-level" class="import-file" type="number" min="1" max="9" value="1">
        <div class="confirm-row">
          <button id="btn-add-sent-save" class="btn-big btn-primary">Save</button>
          <button id="btn-add-sent-cancel" class="btn-big btn-plain">Cancel</button>
        </div>
      </div>`, true);
    document.getElementById("btn-add-sent-cancel").onclick = () => this.closeModal();
    document.getElementById("btn-add-sent-save").onclick = () => {
      const r = addCustomSentenceQuestion({
        sentence: document.getElementById("add-sent-sentence").value,
        answer: document.getElementById("add-sent-answer").value,
        course: document.getElementById("add-sent-course").value,
        topic: document.getElementById("add-sent-topic").value,
        level: document.getElementById("add-sent-level").value
      });
      if (!r.ok) { this.toast(r.error); return; }
      this.closeModal();
      this.selectedTopics = new Set(this._allTopicKeys());
      this.renderSetup();
      this.toast("Sentence question added");
    };
  },

  /* ---------- App 內新增圖片單字題 ---------- */
  openAddPicture() {
    this.showModal(`
      <div class="import-box">
        <h3>🖼️ Add picture question</h3>
        <label class="import-label">Picture (WebP / JPG / PNG)</label>
        <input type="file" id="add-pic-file" accept="image/webp,image/jpeg,image/png" class="import-file">
        <div id="add-pic-preview-wrap" class="add-pic-preview hidden">
          <img id="add-pic-preview" alt="Preview">
        </div>
        <label class="import-label">Answer (the word)</label>
        <input id="add-pic-word" class="import-file" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Chemistry">
        <label class="import-label">Course (optional)</label>
        <input id="add-pic-course" class="import-file" type="text" value="Custom" placeholder="Custom">
        <label class="import-label">Topic (optional)</label>
        <input id="add-pic-topic" class="import-file" type="text" value="Custom Pictures" placeholder="Custom Pictures">
        <div class="confirm-row">
          <button id="btn-add-pic-save" class="btn-big btn-primary">Save</button>
          <button id="btn-add-pic-cancel" class="btn-big btn-plain">Cancel</button>
        </div>
      </div>`, true);
    const fileEl = document.getElementById("add-pic-file");
    const wrap = document.getElementById("add-pic-preview-wrap");
    const img = document.getElementById("add-pic-preview");
    let previewUrl = "";
    fileEl.onchange = () => {
      if (previewUrl) { try { URL.revokeObjectURL(previewUrl); } catch (e) {} previewUrl = ""; }
      const f = fileEl.files && fileEl.files[0];
      if (!f) { wrap.classList.add("hidden"); img.removeAttribute("src"); return; }
      previewUrl = URL.createObjectURL(f);
      img.src = previewUrl;
      wrap.classList.remove("hidden");
    };
    document.getElementById("btn-add-pic-cancel").onclick = () => {
      if (previewUrl) { try { URL.revokeObjectURL(previewUrl); } catch (e) {} }
      this.closeModal();
    };
    document.getElementById("btn-add-pic-save").onclick = async () => {
      const file = fileEl.files && fileEl.files[0];
      const r = await addCustomPictureQuestion({
        word: document.getElementById("add-pic-word").value,
        file,
        course: document.getElementById("add-pic-course").value,
        topic: document.getElementById("add-pic-topic").value
      });
      if (!r.ok) { this.toast(r.error); return; }
      if (previewUrl) { try { URL.revokeObjectURL(previewUrl); } catch (e) {} }
      this.closeModal();
      this.selectedTopics = new Set(this._allTopicKeys());
      this.renderSetup();
      this.toast("Picture question added");
    };
  },

  /* ---------- 瀏覽／編輯／刪除自訂題 ---------- */
  openMyQuestions() {
    const list = (loadState().customQuestions || []).slice();
    const esc = (s) => escapeHTML(String(s ?? ""));
    const rows = list.length === 0
      ? `<p class="my-q-empty">No custom questions yet.</p>`
      : `<div class="my-q-list">${list.map((q, i) => {
          const isWord = q.type === "word";
          const thumb = isWord && q.imageId && typeof QImgDB !== "undefined"
            ? (QImgDB.urlSync(q.imageId) || "")
            : "";
          const meta = `${q.course || "Custom"} / ${q.topic || ""}`;
          const main = isWord ? (q.word || q.answer || "") : (q.sentence || "");
          const ans = isWord ? "" : (q.answer || "(empty)");
          return `<div class="my-q-row">
            ${thumb ? `<img class="my-q-thumb" src="${esc(thumb)}" alt="">` : (isWord ? `<div class="my-q-thumb my-q-thumb-empty"></div>` : "")}
            <div class="my-q-body">
              <div class="my-q-meta">${esc(meta)}</div>
              <div class="my-q-main">${esc(main)}</div>
              ${ans !== "" ? `<div class="my-q-ans">→ ${esc(ans)}</div>` : ""}
            </div>
            <div class="my-q-actions">
              <button type="button" class="btn-small btn-secondary my-q-edit" data-i="${i}">Edit</button>
              <button type="button" class="btn-small btn-plain my-q-del" data-i="${i}">Delete</button>
            </div>
          </div>`;
        }).join("")}</div>`;

    this.showModal(`
      <div class="import-box my-q-box">
        <h3>📋 My questions (${list.length})</h3>
        ${rows}
        <div class="confirm-row">
          ${list.length ? `<button id="btn-myq-clear" class="btn-big btn-plain">🗑 Delete all</button>` : ""}
          <button id="btn-myq-close" class="btn-big btn-primary">Close</button>
        </div>
      </div>`, true);

    document.getElementById("btn-myq-close").onclick = () => this.closeModal();
    const clearBtn = document.getElementById("btn-myq-clear");
    if (clearBtn) {
      clearBtn.onclick = async () => {
        if (!confirm("Delete ALL custom questions? This cannot be undone.")) return;
        await clearCustomQuestionsAndImages();
        this.renderSetup();
        this.toast("Custom questions deleted (site questions are kept)");
        this.openMyQuestions();
      };
    }
    document.querySelectorAll("#modal-root .my-q-edit").forEach(btn => {
      btn.onclick = () => {
        const q = list[+btn.dataset.i];
        if (q) this.openEditCustomQuestion(q.id);
      };
    });
    document.querySelectorAll("#modal-root .my-q-del").forEach(btn => {
      btn.onclick = async () => {
        const q = list[+btn.dataset.i];
        if (!q) return;
        if (!confirm("Delete this question?")) return;
        const r = await deleteCustomQuestion(q.id);
        if (!r.ok) { this.toast(r.error || "Delete failed"); return; }
        this.renderSetup();
        this.toast("Question deleted");
        this.openMyQuestions();
      };
    });
  },

  openEditCustomQuestion(id) {
    const q = (loadState().customQuestions || []).find(x => x && x.id === id);
    if (!q) { this.toast("Question not found"); this.openMyQuestions(); return; }
    const escAttr = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/"/g, "&quot;");
    const isWord = q.type === "word";

    if (isWord) {
      const thumb = q.imageId && typeof QImgDB !== "undefined" ? (QImgDB.urlSync(q.imageId) || "") : "";
      this.showModal(`
        <div class="import-box">
          <h3>✏️ Edit picture question</h3>
          <div id="edit-pic-preview-wrap" class="add-pic-preview${thumb ? "" : " hidden"}">
            <img id="edit-pic-preview" alt="Preview"${thumb ? ` src="${escAttr(thumb)}"` : ""}>
          </div>
          <label class="import-label">Replace picture (optional)</label>
          <input type="file" id="edit-pic-file" accept="image/webp,image/jpeg,image/png" class="import-file">
          <label class="import-label">Answer (the word)</label>
          <input id="edit-pic-word" class="import-file" type="text" value="${escAttr(q.word || q.answer || "")}" autocomplete="off" autocapitalize="off" spellcheck="false">
          <label class="import-label">Course</label>
          <input id="edit-pic-course" class="import-file" type="text" value="${escAttr(q.course || "Custom")}">
          <label class="import-label">Topic</label>
          <input id="edit-pic-topic" class="import-file" type="text" value="${escAttr(q.topic || "Custom Pictures")}">
          <label class="import-label">Level 1–9</label>
          <input id="edit-pic-level" class="import-file" type="number" min="1" max="9" value="${escAttr(q.level || 1)}">
          <div class="confirm-row">
            <button id="btn-edit-save" class="btn-big btn-primary">Save</button>
            <button id="btn-edit-back" class="btn-big btn-plain">Back</button>
          </div>
        </div>`, true);
      const fileEl = document.getElementById("edit-pic-file");
      const wrap = document.getElementById("edit-pic-preview-wrap");
      const img = document.getElementById("edit-pic-preview");
      let previewUrl = "";
      fileEl.onchange = () => {
        if (previewUrl) { try { URL.revokeObjectURL(previewUrl); } catch (e) {} previewUrl = ""; }
        const f = fileEl.files && fileEl.files[0];
        if (!f) return;
        previewUrl = URL.createObjectURL(f);
        img.src = previewUrl;
        wrap.classList.remove("hidden");
      };
      document.getElementById("btn-edit-back").onclick = () => {
        if (previewUrl) { try { URL.revokeObjectURL(previewUrl); } catch (e) {} }
        this.openMyQuestions();
      };
      document.getElementById("btn-edit-save").onclick = async () => {
        const file = fileEl.files && fileEl.files[0];
        const r = await updateCustomQuestion(id, {
          word: document.getElementById("edit-pic-word").value,
          course: document.getElementById("edit-pic-course").value,
          topic: document.getElementById("edit-pic-topic").value,
          level: document.getElementById("edit-pic-level").value,
          file: file || undefined
        });
        if (!r.ok) { this.toast(r.error); return; }
        if (previewUrl) { try { URL.revokeObjectURL(previewUrl); } catch (e) {} }
        this.selectedTopics = new Set(this._allTopicKeys());
        this.renderSetup();
        this.toast("Question updated");
        this.openMyQuestions();
      };
      return;
    }

    const expl = q.explain || {};
    const answerVal = [q.answer].concat(q.accept || [])
      .filter((a, i) => i === 0 || (a != null && String(a).length))
      .map(a => (a == null ? "" : String(a)))
      .join(" / ");
    this.showModal(`
      <div class="import-box">
        <h3>✏️ Edit sentence question</h3>
        <p class="settings-sub" style="text-align:left;margin:0">Put <code>___</code> where the blank should be.</p>
        <label class="import-label">Sentence</label>
        <textarea id="edit-sent-sentence" class="import-paste" rows="3"></textarea>
        <label class="import-label">Answer</label>
        <input id="edit-sent-answer" class="import-file" type="text" value="${escAttr(answerVal)}" autocomplete="off" autocapitalize="off" spellcheck="false">
        <label class="import-label">Course</label>
        <input id="edit-sent-course" class="import-file" type="text" value="${escAttr(q.course || "Custom")}">
        <label class="import-label">Topic</label>
        <input id="edit-sent-topic" class="import-file" type="text" value="${escAttr(q.topic || "Custom Sentences")}">
        <label class="import-label">Level 1–9</label>
        <input id="edit-sent-level" class="import-file" type="number" min="1" max="9" value="${escAttr(q.level || 1)}">
        <label class="import-label">Keywords (optional)</label>
        <input id="edit-sent-keyword" class="import-file" type="text" value="${escAttr(expl.keyword || "")}">
        <label class="import-label">Hint (optional)</label>
        <input id="edit-sent-hint" class="import-file" type="text" value="${escAttr(expl.hint || "")}">
        <div class="confirm-row">
          <button id="btn-edit-save" class="btn-big btn-primary">Save</button>
          <button id="btn-edit-back" class="btn-big btn-plain">Back</button>
        </div>
      </div>`, true);
    document.getElementById("edit-sent-sentence").value = q.sentence || "";
    document.getElementById("btn-edit-back").onclick = () => this.openMyQuestions();
    document.getElementById("btn-edit-save").onclick = async () => {
      const r = await updateCustomQuestion(id, {
        sentence: document.getElementById("edit-sent-sentence").value,
        answer: document.getElementById("edit-sent-answer").value,
        course: document.getElementById("edit-sent-course").value,
        topic: document.getElementById("edit-sent-topic").value,
        level: document.getElementById("edit-sent-level").value,
        keyword: document.getElementById("edit-sent-keyword").value,
        hint: document.getElementById("edit-sent-hint").value
      });
      if (!r.ok) { this.toast(r.error); return; }
      this.selectedTopics = new Set(this._allTopicKeys());
      this.renderSetup();
      this.toast("Question updated");
      this.openMyQuestions();
    };
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
              <li><b>No</b> (optional): five digits, e.g. <code>00001</code>; also matches <code>Q_folder/questions/questions_images/00001.png</code> as the question image</li>
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
            <p class="csv-note">⚠ A header row (first cell "No" or "Course") is skipped automatically. Wrap any value containing commas in double quotes.<br>Question images live in <code>Q_folder/questions/questions_images/</code> named after the number (<code>00001.png</code>; jpg/jpeg/webp/gif also accepted). No image = nothing shown.</p>
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
    document.getElementById("btn-clear-custom").onclick = async () => {
      await clearCustomQuestionsAndImages();
      this.closeModal();
      this.renderSetup();
      this.toast("Custom questions deleted (site questions are kept)");
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

  /* ---------- 家長自訂題教學（由 Settings → How to create your own questions 開啟） ---------- */
  openParentGuide() {
    this.showModal(`
      <div class="guide-box">
        <h3>📖 How to Create Your Own Questions</h3>
        <p class="guide-lead">You can add your own English questions for your child — no coding needed.</p>

        <div class="guide-section">
          <h4>In the app (quickest for one question)</h4>
          <ol>
            <li><b>Settings → ✏️ Add sentence question</b> — type a sentence with <code>___</code> and the answer.</li>
            <li><b>Settings → 🖼️ Add picture question</b> — upload a WebP/JPG/PNG and type the word.</li>
            <li>Custom questions stay in this browser. Edit or delete them via <b>Settings → 📋 View my questions</b> (or delete all there / in Import CSV).</li>
          </ol>
        </div>

        <div class="guide-section">
          <h4>Method A — Ask AI to generate questions (easiest for many)</h4>
          <ol>
            <li>Copy the full prompt from <a href="Q_folder/AI%E5%87%BA%E9%A1%8C%E6%8C%87%E5%BC%95.md" target="_blank" rel="noopener">📄 AI出題指引.md</a> (opens in a new tab).</li>
            <li>Paste it to ChatGPT / Claude / Gemini, and add what you want, e.g.<br><i>"Generate 30 P.3 questions on Past Tense, split into 2 courses, 2–3 topics each, level 1–4."</i></li>
            <li>The AI will return CSV text. Copy it.</li>
            <li>Back here → <b>Settings → 📥 Import CSV Questions → Option 2: paste the content</b> → Import.</li>
          </ol>
        </div>

        <div class="guide-section">
          <h4>Method 2 — Write or edit the CSV yourself</h4>
          <p>One question per line, 8 columns, comma separated:</p>
          <pre class="guide-pre">No,Course,Topic,Level,Sentence,Answer,Keywords,Hint</pre>
          <ul>
            <li><b>No</b> (optional): five digits, e.g. <code>00001</code> — also used as the question image filename</li>
            <li><b>Course</b>: the big group, e.g. <code>Articles</code></li>
            <li><b>Topic</b>: the small group inside the course, e.g. <code>Articles: Basics</code></li>
            <li><b>Level</b>: <code>1</code>–<code>5</code> (1 = easiest; shows that many ★)</li>
            <li><b>Sentence</b>: must contain <code>___</code> (three underscores) as the blank</li>
            <li><b>Answer</b>: the correct answer; separate multiple accepted answers with <code>/</code> (e.g. <code>were not / weren't</code>); <b>leave completely empty for zero-article questions</b></li>
            <li><b>Keywords</b> (optional): words to highlight in the sentence, separated with <code>/</code>; each must appear verbatim in the sentence</li>
            <li><b>Hint</b> (optional): short English explanation shown after a wrong answer</li>
          </ul>
          <p class="guide-tip">⚠ Course, Topic and Hint must be in <b>English</b>. Wrap any value containing a comma in double quotes.</p>
        </div>

        <div class="guide-section">
          <h4>Example (copy-paste ready)</h4>
          <pre class="guide-pre">No,Course,Topic,Level,Sentence,Answer,Keywords,Hint
00001,Articles,Articles: Basics,1,This is ___ apple. It is sweet and red.,an,apple,Vowel sound (apple)
00002,Articles,Articles: Advanced,3,He went to ___ school by bus.,,school,Zero article: go to school
00003,Past Tense,Past Tense Verbs,2,Yesterday I ___(go) to the park.,went,Yesterday,Past tense of go is went.</pre>
        </div>

        <div class="guide-section">
          <h4>Question images (optional)</h4>
          <p>If you want a picture for a question, put the image in <code>Q_folder/questions/questions_images/</code> and name it after the question number, e.g. <code>00001.png</code> (<code>.jpg</code> / <code>.jpeg</code> / <code>.webp</code> / <code>.gif</code> also work). No image = the question just shows text.</p>
        </div>

        <div class="guide-section">
          <h4>Where do imported questions live?</h4>
          <p>Custom questions (CSV import + in-app add) are saved in this browser (<code>customQuestions</code>; picture blobs in IndexedDB) and merged with the built-in bank. They are kept after sign-out, and show under their Course/Topic in the picker. Open <b>Settings → 📋 View my questions</b> to edit or delete individual items, or delete all there / via <b>🗑 Delete all imported questions</b> in the Import window.</p>
        </div>

        <button id="guide-close" class="btn-big btn-primary">Got it!</button>
      </div>`, true);
    document.getElementById("guide-close").onclick = () => this.closeModal();
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
       v130 分級制：分數 × 有無用 hint 決定 span 百分比；
       Lv.1–10 新手期保底 50% span（分級高過 50% 照攞高嗰個） */
    const entry = getActiveEntry();
    const perfect = data.score === data.total;
    let expGain = GAME_CONFIG.EXP_BASE;
    if (entry) {
      ensureEntryPokemonData(entry);
      const dexId = entryCurrentSpecies(entry)[0];
      const level = entry.level || 1;
      const span = levelSpan(dexId, level);
      const usedHint = data.results.some(r => r.hint);
      /* v136：正規化到 /10 刻度（5/5→10、8/8→10），短 set 先至同 PRD 表對齊 */
      const totalQ = Math.max(1, data.total || 1);
      const s = Math.round((data.score / totalQ) * 10);
      let pct;
      if (s >= 10)      pct = usedHint ? 0.50 : 1.00;
      else if (s === 9) pct = usedHint ? 0.40 : 0.90;
      else if (s === 8) pct = usedHint ? 0.30 : 0.80;
      else if (s >= 5)  pct = usedHint ? 0.25 : 0.50;
      else if (s >= 1)  pct = usedHint ? 0.15 : 0.30;
      else              pct = 0.10;
      if (level <= 10) pct = Math.max(0.50, pct);
      expGain = Math.max(10, Math.round(span * pct));
    }
    /* 記憶光芒 Bonus XP：答對「抗忘記題目」（記憶曲線到期題）該題 EXP ×1.5
       即每題基本份額之外，再多半份 */
    const memoryCorrect = data.results.filter(r => r.correct && r.memory).length;
    const memoryBonus = memoryCorrect > 0
      ? Math.round((expGain / data.total) * 0.5 * memoryCorrect)
      : 0;
    const rewards = { ticket: 0, diamonds: 0, exp: expGain + memoryBonus, memoryBonus };
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
    /* 世代解鎖慶祝：等進化/結算動畫行完先彈（levelRes 有進化就再遲啲） */
    const unlockDelay = levelRes && levelRes.evolvedTo ? 2200 : 900;
    setTimeout(() => this.maybeShowGenUnlock(), unlockDelay);

    /* Gym：結算畫面之後返主頁先判 badge（Hint／錯題已計入 results） */
    if (Quiz.mode === "gym" || data.mode === "gym") {
      this._gymSettleData = data;
      if (typeof Gym !== "undefined" && data.gymMilestone) Gym._activeMilestone = data.gymMilestone;
    } else {
      this._gymSettleData = null;
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
      CaptureScene.audio.playOnce(jingleUrl, 0.4);
    }
    /* 捕捉完結：jingle 播完後恢復全域 BGM */
    if (window.CaptureScene && CaptureScene.audio) {
      setTimeout(() => CaptureScene.audio.startTownBGM(), 3200);
    }

    const st = loadState();
    const rareBtn = document.getElementById("btn-pull-rare");
    /* 永遠顯示：唔夠鑽石就 disabled + 顯示差額（目標可見，唔會版面跳動） */
    const enough = st.diamonds >= GAME_CONFIG.RARE_PULL_COST;
    rareBtn.disabled = !enough;
    rareBtn.innerHTML = enough
      ? `💎 Rare Pull — ${GAME_CONFIG.RARE_PULL_COST}💎 <small class="settle-btn-gap">you have ${st.diamonds}</small>`
      : `💎 Rare Pull <small class="settle-btn-gap">need ${GAME_CONFIG.RARE_PULL_COST - st.diamonds} more</small>`;
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

  /* ---------- 設定 ---------- */
  openSettings() {
    /* 文案按登入狀態切換（有雲端同步就唔好嚇用戶話「只存本機」） */
    const loggedIn = !!(window.SupabaseAuth && SupabaseAuth.isLoggedIn());
    const saveNote = loggedIn
      ? `<p class="settings-sub">✅ Cloud sync is on — your progress follows your account.</p>`
      : `<p class="settings-sub">Your progress is saved in this browser only. Sign in (🔐) to back up to the cloud.</p>`;
    const prefs = (typeof loadAudioPrefs === "function") ? loadAudioPrefs() : { bgm: 1, sfx: 1 };
    const bgmPct = Math.round(prefs.bgm * 100);
    const sfxPct = Math.round(prefs.sfx * 100);
    this.showModal(`
      <div class="settings-box">
        <h3 class="settings-title">⚙️ Settings</h3>
        ${saveNote}
        <div class="settings-audio">
          <label class="settings-vol">
            <span class="settings-vol-label">Music <b id="set-bgm-pct">${bgmPct}%</b></span>
            <input id="set-bgm" type="range" min="0" max="100" step="1" value="${bgmPct}" aria-label="Music volume">
          </label>
          <label class="settings-vol">
            <span class="settings-vol-label">Sound Effects <b id="set-sfx-pct">${sfxPct}%</b></span>
            <input id="set-sfx" type="range" min="0" max="100" step="1" value="${sfxPct}" aria-label="Sound effects volume">
          </label>
        </div>
        <button id="btn-add-sentence" class="btn-big btn-secondary">✏️ Add sentence question</button>
        <button id="btn-add-picture" class="btn-big btn-secondary">🖼️ Add picture question</button>
        <button id="btn-import-csv2" class="btn-big btn-secondary">📥 Import CSV Questions</button>
        <button id="btn-view-my-q" class="btn-big btn-secondary">📋 View my questions</button>
        <button id="btn-parent-guide" class="guide-link">📖 How to create your own questions</button>
        <button id="btn-reset-progress" class="reset-link danger">🗑 Reset Progress</button>
        <small class="settings-note">App version: ${APP_VERSION} (auto-updates)</small>
      </div>`);
    if (this._sfxPreviewTimer) { clearTimeout(this._sfxPreviewTimer); this._sfxPreviewTimer = null; }
    const applyAudio = (which, pct) => {
      const v = Math.max(0, Math.min(100, pct | 0)) / 100;
      const cur = (typeof loadAudioPrefs === "function") ? loadAudioPrefs() : { bgm: 1, sfx: 1 };
      if (which === "bgm") cur.bgm = v; else cur.sfx = v;
      if (typeof saveAudioPrefs === "function") saveAudioPrefs(cur);
      const audio = window.CaptureScene && CaptureScene.audio;
      if (audio) {
        if (which === "bgm") audio.setBgmScale(v);
        else audio.setSfxScale(v);
      }
      const pctEl = document.getElementById(which === "bgm" ? "set-bgm-pct" : "set-sfx-pct");
      if (pctEl) pctEl.textContent = `${Math.round(v * 100)}%`;
    };
    const bgmEl = document.getElementById("set-bgm");
    const sfxEl = document.getElementById("set-sfx");
    bgmEl.oninput = () => applyAudio("bgm", +bgmEl.value);
    sfxEl.oninput = () => {
      applyAudio("sfx", +sfxEl.value);
      /* debounce：停拖 ~180ms 先播 obtained-pokemon 作 reference */
      if (this._sfxPreviewTimer) clearTimeout(this._sfxPreviewTimer);
      this._sfxPreviewTimer = setTimeout(() => {
        this._sfxPreviewTimer = null;
        const audio = window.CaptureScene && CaptureScene.audio;
        if (audio && audio.previewSfx) audio.previewSfx("assets/bgm/obtained-pokemon.mp3", 0.4);
      }, 180);
    };
    document.getElementById("btn-add-sentence").onclick = () => this.openAddSentence();
    document.getElementById("btn-add-picture").onclick = () => this.openAddPicture();
    document.getElementById("btn-import-csv2").onclick = () => this.openImport();
    document.getElementById("btn-view-my-q").onclick = () => this.openMyQuestions();
    document.getElementById("btn-parent-guide").onclick = () => this.openParentGuide();
    document.getElementById("btn-reset-progress").onclick = () => this._confirmReset();
  },

  /* ---------- Login Hub（Poké Ball 風格） ---------- */
  _markLoggedIn() {
    const btn = document.getElementById("btn-login");
    if (!btn) return;
    btn.textContent = "✅";
    btn.title = "Connected — tap to manage";
  },

  /* 檢查本地係咪有遊玩進度（用嚟決定 connect 舊帳戶時使唔使彈 overwrite 警告） */
  _localHasProgress() {
    const st = loadState();
    const cardCount = (typeof SM2 !== "undefined" && SM2.listAll) ? SM2.listAll().length : 0;
    return (st.diamonds || 0) > 0
      || (st.entries && Object.keys(st.entries).length > 0)
      || cardCount > 0
      || (st.totalSets || 0) > 0;
  },

  /* 彈出「覆蓋本地進度」確認視窗，回傳 Promise<boolean> */
  _confirmOverwrite() {
    return new Promise((resolve) => {
      const existing = document.getElementById("overwrite-modal");
      if (existing) existing.remove();
      const backdrop = document.createElement("div");
      backdrop.className = "modal-backdrop";
      backdrop.id = "overwrite-modal";
      backdrop.innerHTML = `
        <div class="modal-card">
          <div class="modal-icon">⚠️</div>
          <h3>Overwrite local progress?</h3>
          <p style="font-size:.85rem;line-height:1.5;margin:6px 0;color:#6b7280;">
            This Google account already has saved progress in the cloud.<br>
            Connecting will <strong>overwrite your current local progress</strong> with the cloud data.
          </p>
          <p style="font-size:.78rem;color:#ef4444;font-weight:700;margin:8px 0 14px;">
            Your local diamonds, Pokémon and study records will be replaced.
          </p>
          <div style="display:flex;gap:10px;">
            <button class="btn-secondary" style="flex:1;" data-act="cancel">Cancel</button>
            <button class="btn-primary" style="flex:1;background:#ef4444;" data-act="confirm">Overwrite &amp; Connect</button>
          </div>
        </div>`;
      backdrop.addEventListener("click", (e) => {
        if (e.target === backdrop || e.target.closest("[data-act=cancel]")) {
          backdrop.remove();
          resolve(false);
        } else if (e.target.closest("[data-act=confirm]")) {
          backdrop.remove();
          resolve(true);
        }
      });
      document.body.appendChild(backdrop);
    });
  },

  openLoginHub() {
    const st = loadState();
    const user = window.SupabaseAuth ? SupabaseAuth.currentUser() : null;
    const deviceId = ensureDeviceId();

    if (user) {
      /* 已登入狀態：同步係全自動，唔需要 Sync Now 按鈕 */
      this.showModal(`
        <div class="login-hub logged-in">
          <div class="lh-ball" aria-hidden="true"></div>
          <h3>✅ Connected Trainer</h3>
          <p class="lh-email">${escapeHTML(user.email || user.user_metadata?.name || "Trainer")}</p>
          <p class="lh-sub">Your progress is safely synced to the cloud.</p>
          <div class="lh-actions">
            <button id="lh-signout" class="btn-big btn-plain">Sign out</button>
          </div>
          <p class="lh-note">Wrong account? Sign out, then use “Continue with Google” and pick a different account.</p>
        </div>`, false);

      document.getElementById("lh-signout").onclick = async () => {
        try {
          await SupabaseAuth.signOut();
          /* 登出後清除本地遊戲進度，防止再登入另一個帳戶時將舊進度複製過去（cheat） */
          clearGameProgress();
          /* clearGameProgress 會建立新 state 物件，要重新 load */
          const fresh = loadState();
          fresh._googleMigrated = false;
          saveState();
          /* 登出後清除 auth 狀態 */
          try { await Sync.pull(); } catch (e) {}
          const btn = document.getElementById("btn-login");
          if (btn) { btn.textContent = "🔐"; btn.title = "Sign in"; }
          this.closeModal();
          this.renderHome();
          this.toast("Signed out — local progress cleared");
        } catch (e) {
          console.error("[SignOut] failed:", e);
          this.toast("Sign out failed: " + e.message);
        }
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

          <p class="lh-note">Playing without login is fine — your progress stays on this device. Sign in anytime to cloud-sync: your Pokémon & learning progress carry over, and diamonds become a fresh 20💎 welcome bonus.</p>
        </div>`, false);

      document.getElementById("lh-google").onclick = async () => {
        this.closeModal();
        try { await SupabaseAuth.signInWithGoogle(); }
        catch (e) { console.warn("Google sign-in failed:", e); }
      };
    }
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
      /* trainer_name 係唯一仲直寫嘅 account 欄位 */
      if (window.Sync && Sync.isEnabled()) Sync.pushState();
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
        <p>Background music: <i>Flat Water</i> by BGM channel (official music video). All rights belong to their respective owners.</p>
        <p>Battle/jingle tracks (<i>Battle! (Wild Pokémon)</i>, <i>Obtained a Pokémon!</i>, <i>Obtained a Berry!</i>, from Pokémon Red/Green/Blue/Yellow) are from the original Pokémon game soundtracks, composed by Junichi Masuda, Gō Ichinose, Morikazu Aoki, Shota Kageyama and others. © Nintendo / Creatures Inc. / GAME FREAK inc.</p>
        <p>Pokémon soundtrack resources referenced from <a href="https://downloads.khinsider.com" target="_blank" rel="noopener">KHInsider Video Game Music</a> (unofficial fan archive).</p>

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
    if (this._sfxPreviewTimer) { clearTimeout(this._sfxPreviewTimer); this._sfxPreviewTimer = null; }
    if (window.CaptureScene && CaptureScene.audio && CaptureScene.audio.stopPreviewSfx) {
      CaptureScene.audio.stopPreviewSfx();
    }
    document.getElementById("modal-root").innerHTML = "";
    if (typeof Pokedex !== "undefined" && Pokedex._setDexBackMode) Pokedex._setDexBackMode("grid");
  },

  /* 同步狀態 banner：唔會靜靜消失，要俾用戶自己 dismiss */
  showSyncBanner(msg, isError) {
    const el = document.getElementById("sync-banner");
    if (!el) return;
    el.className = "sync-banner" + (isError ? " sync-error" : "");
    el.innerHTML = `<span>${escapeHTML(msg)}</span><button id="sync-banner-x">OK</button>`;
    document.getElementById("sync-banner-x").onclick = () => el.classList.add("hidden");
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
    const st = loadState();
    ensureDeviceId();   /* 確保匿名裝置 ID 存在（供 SM-2 history + Supabase 用）*/

    /* Supabase pull（背景 async，唔阻塞主流程）*/
    if (window.Sync && Sync.isEnabled()) {
      /* 非阻塞拉雲端進度；有新卡拉返嚟就刷新主畫面 */
      Sync.pull()
        .then(() => this.renderHome())
        .catch(() => {});
    }

    /* 按鈕 */
    document.getElementById("btn-start-quiz").onclick = () => this.openSetup();
    document.getElementById("btn-home-pokedex").onclick = () => Pokedex.open();
    document.getElementById("btn-top-leaderboard").onclick = () => Leaderboard.open();
    document.getElementById("btn-home-calendar").onclick = () => Calendar.open();
    const gymBtn = document.getElementById("btn-gym-challenge");
    if (gymBtn) gymBtn.onclick = () => { if (typeof Gym !== "undefined") Gym.startChallenge(); };
    document.getElementById("btn-disclaimer").onclick = () => this.openDisclaimer();
    document.getElementById("topbar-name").onclick = () => this.openRename();
    document.getElementById("btn-settings").onclick = () => this.openSettings();
    document.getElementById("btn-login").onclick = () => this.openLoginHub();

    /* OAuth 登入完成：Supabase redirect 返嚟時 SupabaseAuth.init() 已經 parse hash → save session */
    /* 呢度 detect 到 isLoggedIn() 就做 migrate + refresh */
    if (window.SupabaseAuth && SupabaseAuth.isLoggedIn()) {
      this._markLoggedIn();
      try {
        await SupabaseAuth.ensureFreshSession();
        if (!st._googleMigrated) {
          const deviceId = ensureDeviceId();
          const isNewAccount = await SupabaseAuth.migrateAnonymous(deviceId);
          console.log("[OAuth] migrate result — isNewAccount:", isNewAccount);
          if (isNewAccount === true) {
            /* 新帳戶：本地進度經 import_state 一次性上傳（v106 server 收緊：
               diamonds 唔過界——固定派 20 粒 welcome bonus；entries ≤151、
               exp ≤1.25M、candies ≤99、dupes ≤100；每帳戶一生一次
               imported_at 鎖 + user_imports audit log），之後 pull 正規化
               （server 行先係權威） */
            const payload = {
              diamonds: st.diamonds || 0,
              total_sets: st.totalSets || 0,
              total_correct: st.totalCorrect || 0,
              total_questions: st.totalQuestions || 0,
              trainer_name: st.playerName || "The PokéEngmon Trainer",
              entries: (st.entries || []).map(e => ({
                id: e.uid,
                chain_key: e.chainKey,
                exp: Number(e.exp ?? 0),
                ivs: e.ivs || {},
                evs: e.evs || {},
                ev_points: e.evPoints ?? 0,
                candies: e.candies ?? 0,
                dupes: e.dupes ?? 0,
                branch: (e.branch === 0 || e.branch) ? e.branch : null,
                active: e.uid === st.activeUid,
                obtained_at: e.obtainedAt || Date.now()
              }))
            };
            const imported = await SupabaseAuth.importState(payload);
            console.log("[OAuth] importState result:", imported);
            /* SM-2 cards/history 維持直推（非敏感學習數據） */
            await Sync.pushState();
            await Sync.pull();
            console.log("[OAuth] ✅ Local progress imported to new Google account");
            st._googleMigrated = true;
            saveState();
          } else if (isNewAccount === false) {
            /* 舊帳戶：從雲端拉下來 */
            /* 但如果本地有進度，要先警告用戶會覆蓋 */
            const hasLocalProgress = this._localHasProgress();
            if (hasLocalProgress) {
              const confirmed = await this._confirmOverwrite();
              if (!confirmed) {
                /* 用戶拒絕 → sign out，保留本地進度 */
                await SupabaseAuth.signOut();
                st._googleMigrated = false;
                saveState();
                this.renderHome();
                this.toast("Sign-in cancelled — your local progress is kept.");
                return;
              }
            }
            await Sync.pull();
            console.log("[OAuth] ✅ Existing account data pulled from cloud");
            st._googleMigrated = true;
            saveState();
          } else {
            /* migrate 失敗 / 未知狀態：保守起見 pull（雲端有就用雲端） */
            try { await Sync.pull(); } catch (e) {}
            st._googleMigrated = true;
            saveState();
          }
        } else {
          /* 已 migrate 過（之前登入過）：拉雲端最新數據 */
          try { await Sync.pull(); } catch (e) {}
        }
        this.renderHome();
        /* 顯示實際登入嘅 email，萬一 Google 選錯帳戶用戶可以即刻發現 */
        const signedEmail = SupabaseAuth.currentUser()?.email;
        this.toast(signedEmail
          ? `✅ Signed in as ${signedEmail}`
          : "✅ Signed in! Your progress is cloud-synced.");
      } catch (e) { console.warn("[OAuth] post-login failed:", e.message); }
    } else if (window.__oauthError) {
      /* OAuth 失敗 → 明確話俾用戶知，唔好靜靜地乜都冇發生 */
      console.warn("[OAuth] ❌", window.__oauthError);
      this.toast("❌ Google sign-in failed: " + window.__oauthError);
      window.__oauthError = null;
    }
    /* 主頁鑽石 chip → 稀有抽頁面（永遠開放，pull 按鈕自己會 disabled） */
    document.getElementById("btn-top-diamond").onclick = () => Gacha.open("rare");
    /* btn-top-pull hidden since v48 — skip binding */
    document.getElementById("btn-pull-rare").onclick = () => Gacha.open("rare");
    document.getElementById("btn-review").onclick = () => this.showReview();
    document.getElementById("btn-settle-home").onclick = () => {
      if (this._gymSettleData && typeof Gym !== "undefined") {
        const d = this._gymSettleData;
        this._gymSettleData = null;
        Quiz.mode = null;
        Gym.conclude(d);
        return;
      }
      this.renderHome();
      this.showView("view-home");
    };
    document.getElementById("btn-do-pull").onclick = () => Gacha.pull();
    /* 先切 view（會中斷抽獎流程並結算），再 render 主頁，避免顯示舊鑽石/舊拍檔 */
    document.getElementById("btn-gacha-home").onclick = () => { this.showView("view-home"); this.renderHome(); };
    if (typeof Pokedex !== "undefined" && Pokedex._setDexBackMode) Pokedex._setDexBackMode("grid");
    else {
      document.getElementById("btn-dex-back").onclick = () => { this.renderHome(); this.showView("view-home"); };
    }
    document.getElementById("btn-lb-back").onclick = () => { this.renderHome(); this.showView("view-home"); };
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
      if (e.key !== "Enter") return;
      if (window.CaptureScene) { window.CaptureScene.primeAudio(); window.CaptureScene.bgmPrime(); }
      if (Quiz.locked && Quiz._onContinue) Quiz._continue();  /* 答錯後 Enter = Continue */
      else if (!Quiz.locked) Quiz.submit();
    });
    /* 答錯／Skip 後輸入框會被 disable（收唔到 keydown），
       用 document 層接住 Enter 繼續，兌現「Enter 亦可 Continue」 */
    document.addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      const quizView = document.getElementById("view-quiz");
      if (!quizView || !quizView.classList.contains("active")) return;
      if (Quiz.locked && Quiz._onContinue) {
        e.preventDefault();
        Quiz._continue();
      }
    });
    /* 退出 / Hint / Skip / Continue */
    document.getElementById("btn-quiz-exit").onclick = () => Quiz.quit();
    document.getElementById("btn-quiz-hint").onclick = () => Quiz.hint();
    document.getElementById("btn-quiz-skip").onclick = () => Quiz.skip();
    document.getElementById("btn-quiz-continue").onclick = () => Quiz._continue();
    /* 圖片單字題：點圖聽聲（可無限重播） */
    document.getElementById("quiz-word-image-btn").onclick = () => {
      if (window.CaptureScene) { window.CaptureScene.primeAudio(); window.CaptureScene.bgmPrime(); }
      Quiz.playWordAudio();
    };

    /* Power Up Zone：回合尾改錯提交 */
    document.getElementById("btn-powerup-submit").onclick = () => PowerUp.submit();
    document.getElementById("btn-powerup-exit").onclick = () => PowerUp.quit();
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
    /* 自訂圖片題：從 IndexedDB hydrate blob URL 入 memory cache */
    if (typeof QImgDB !== "undefined") {
      try { await QImgDB.hydrateFromState(loadState().customQuestions); } catch (e) { console.warn(e); }
    }

    /* 世代系統（v127+）：
       1) 舊玩家可能已儲齊 Gen 1 → 啟動時重算 unlockedGen（靜默，唔彈慶祝窗）
       2) 已擁有嘅 Gen 2-5 entry 需要對應世代資料先好 derive 招式 */
    recomputeUnlockedGen();
    {
      const st = loadState();
      const gensOwned = new Set(st.entries.map(e => genOfChain(e.chainKey)));
      for (const g of gensOwned) {
        if (g > 1) await ensureGenDataLoaded(g);
      }
    }
    migrateEntries();
    /* 背景補下未完嘅世代資料包（斷點續傳） */
    if (window.GenPack) GenPack.resumePending(loadState().unlockedGen || 1);

    this.renderHome();
    this.showView("view-home");

    /* 全部 UI 掣短 click SFX（委派一次；跟 Settings SFX %） */
    if (!this._uiTapBound) {
      this._uiTapBound = true;
      document.addEventListener("click", (e) => {
        const btn = e.target.closest(
          "button, [role=button], .chip-btn, .pd-menu-btn, .icon-btn, .entry-gate-btn, .footer-link, .guide-link, .reset-link, .move-choice"
        );
        if (!btn || btn.disabled || btn.getAttribute("aria-disabled") === "true") return;
        if (window.CaptureScene && CaptureScene.audio && CaptureScene.audio.uiTap) {
          CaptureScene.audio.uiTap();
        }
      }, true);
    }

    /* 全域 BGM（Flat Water）+ Entry Gate：
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
      /* 新 SW 接管時自動 reload → 用戶永遠玩最新版，唔需要手動確認 */
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (!hadController || reloading) return;
        reloading = true;
        location.reload();
      });

      navigator.serviceWorker.register("sw.js", { updateViaCache: "none" })
        .then(reg => {
          /* 每次載入同返回頁面都檢查更新 */
          reg.update().catch(() => {});
          document.addEventListener("visibilitychange", () => {
            if (document.visibilityState === "visible") reg.update().catch(() => {});
          });
        })
        .catch(() => {});
    }
  },
};

document.addEventListener("DOMContentLoaded", () => App.init());
