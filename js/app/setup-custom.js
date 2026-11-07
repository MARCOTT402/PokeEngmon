/* ============================================================
   PokeEngmon - App：選題同自訂題（題目設定、加句／加圖、我的題目、CSV 匯入、家長指引）
   由 js/app.js 拆出（總計劃 P2.2；Rule 116）。同 app.js 共用同一個 App 物件：
   Object.assign 只係將方法掛返上去，this／App.xxx 用法完全唔變。
   載入次序：js/app.js 之後（index.html），App.init() 喺 DOMContentLoaded 先跑。
   ============================================================ */

Object.assign(App, {
  /* ---------- 題型選擇（做題前）：大類 → 單元 → 題型 三層 ---------- */
  openSetup() {
    this.selectedTopics = new Set(getCategories().flatMap(c => c.units.flatMap(u => u.topics.map(t => t.key))));
    this._expanded = new Set();
    const first = getCategories().find(c => !c.comingSoon);
    if (first) this._expanded.add("c:" + first.category);
    this.renderSetup();
    this.showView("view-quiz-setup");
  },

  _allTopicKeys() {
    return getCategories().flatMap(c => c.units.flatMap(u => u.topics.map(t => t.key)));
  },

  renderSetup() {
    const cats = getCategories();
    const list = document.getElementById("topic-list");
    list.innerHTML = "";
    if (!this._expanded) this._expanded = new Set();

    cats.forEach(({ category, units, count, comingSoon }) => {
      const keys = units.flatMap(u => u.topics.map(t => t.key));
      const sel = keys.filter(k => this.selectedTopics.has(k)).length;
      const all = keys.length > 0 && sel === keys.length;
      const catKey = "c:" + category;
      const open = !comingSoon && this._expanded.has(catKey);

      const card = document.createElement("div");
      card.className = "course-card" + (all ? " course-all" : "") + (open ? " open" : "")
        + (comingSoon ? " course-soon" : "");

      /* 大類列：☑ 一次過全選／取消成個大類；撳名或箭咀展開入面嘅單元 */
      const head = document.createElement("div");
      head.className = "course-head";
      head.innerHTML = `
        <span class="course-check" role="checkbox" aria-checked="${all}">${all ? "☑" : sel > 0 ? "◩" : "☐"}</span>
        <span class="course-name">${escapeHTML(category)}</span>
        <span class="course-count">${comingSoon ? "Coming Soon" : `${sel}/${keys.length} topics · ${count} questions`}</span>
        <span class="course-arrow">${comingSoon ? "" : open ? "▾" : "▸"}</span>`;
      if (!comingSoon) {
        head.querySelector(".course-check").onclick = (e) => {
          e.stopPropagation();
          if (all) keys.forEach(k => this.selectedTopics.delete(k));
          else keys.forEach(k => this.selectedTopics.add(k));
          this.renderSetup();
        };
        head.onclick = () => {
          if (open) this._expanded.delete(catKey);
          else this._expanded.add(catKey);
          this.renderSetup();
        };
      }
      card.appendChild(head);

      /* 展開後：大類入面嘅單元 */
      if (open) {
        const box = document.createElement("div");
        box.className = "course-topics";

        const mini = document.createElement("div");
        mini.className = "setup-mini-row course-mini-row";
        const bAll = document.createElement("button");
        bAll.className = "btn-mini";
        bAll.textContent = "Select all in this category";
        bAll.onclick = () => { keys.forEach(k => this.selectedTopics.add(k)); this.renderSetup(); };
        const bNone = document.createElement("button");
        bNone.className = "btn-mini";
        bNone.textContent = "Clear all";
        bNone.onclick = () => { keys.forEach(k => this.selectedTopics.delete(k)); this.renderSetup(); };
        mini.appendChild(bAll);
        mini.appendChild(bNone);
        box.appendChild(mini);

        units.forEach(({ unit, topics, count: unitCount }) => {
          const uKeys = topics.map(t => t.key);
          const uSel = uKeys.filter(k => this.selectedTopics.has(k)).length;
          const uAll = uSel === uKeys.length;
          const unitKey = "u:" + category + "\u0001" + unit;
          const uOpen = this._expanded.has(unitKey);

          const row = document.createElement("div");
          row.className = "unit-card" + (uOpen ? " open" : "") + (uAll ? " unit-all" : "");

          /* 單元列：☑ 全選／取消整個單元；撳名或箭咀展開題型 */
          const uHead = document.createElement("div");
          uHead.className = "unit-head";
          uHead.innerHTML = `
            <span class="course-check" role="checkbox" aria-checked="${uAll}">${uAll ? "☑" : uSel > 0 ? "◩" : "☐"}</span>
            <span class="unit-name">${escapeHTML(unit)}</span>
            <span class="course-count">${uSel}/${uKeys.length} · ${unitCount} questions</span>
            <span class="course-arrow">${uOpen ? "▾" : "▸"}</span>`;
          uHead.querySelector(".course-check").onclick = (e) => {
            e.stopPropagation();
            if (uAll) uKeys.forEach(k => this.selectedTopics.delete(k));
            else uKeys.forEach(k => this.selectedTopics.add(k));
            this.renderSetup();
          };
          uHead.onclick = () => {
            if (uOpen) this._expanded.delete(unitKey);
            else this._expanded.add(unitKey);
            this.renderSetup();
          };
          row.appendChild(uHead);

          /* 展開後：單元入面嘅個別題型 */
          if (uOpen) {
            const tbox = document.createElement("div");
            tbox.className = "unit-topics";
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
              tbox.appendChild(b);
            });
            row.appendChild(tbox);
          }

          box.appendChild(row);
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
        : "▶ Start";

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
        <label class="import-label">Category (optional)</label>
        <input id="add-sent-category" class="import-file" type="text" value="Grammar" placeholder="Grammar">
        <label class="import-label">Unit (optional)</label>
        <input id="add-sent-unit" class="import-file" type="text" value="Custom" placeholder="Custom">
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
        category: document.getElementById("add-sent-category").value,
        unit: document.getElementById("add-sent-unit").value,
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
        <label class="import-label">Category (optional)</label>
        <input id="add-pic-category" class="import-file" type="text" value="Vocab" placeholder="Vocab">
        <label class="import-label">Unit (optional)</label>
        <input id="add-pic-unit" class="import-file" type="text" value="Dictation" placeholder="Dictation">
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
    document.getElementById("btn-add-pic-save").onclick = Guard.asyncClick(async () => {
      const file = fileEl.files && fileEl.files[0];
      const r = await addCustomPictureQuestion({
        word: document.getElementById("add-pic-word").value,
        file,
        category: document.getElementById("add-pic-category").value,
        unit: document.getElementById("add-pic-unit").value,
        topic: document.getElementById("add-pic-topic").value
      });
      if (!r.ok) { this.toast(r.error); return; }
      if (previewUrl) { try { URL.revokeObjectURL(previewUrl); } catch (e) {} }
      this.closeModal();
      this.selectedTopics = new Set(this._allTopicKeys());
      this.renderSetup();
      this.toast("Picture question added");
    }, "add-pic-save");
  },

  /* ---------- 瀏覽／編輯／刪除自訂題 ---------- */
  openMyQuestions() {
    const list = (loadState().customQuestions || []).slice();
    const esc = escapeHTML;
    const rows = list.length === 0
      ? `<p class="my-q-empty">No custom questions yet.</p>`
      : `<div class="my-q-list">${list.map((q, i) => {
          const isWord = q.type === "word";
          const thumb = isWord && q.imageId && typeof QImgDB !== "undefined"
            ? (QImgDB.urlSync(q.imageId) || "")
            : "";
          const meta = `${q.category || (isWord ? "Vocab" : "Grammar")} / ${q.unit || q.course || "Custom"} / ${q.topic || ""}`;
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
      clearBtn.onclick = Guard.asyncClick(async () => {
        if (!confirm("Delete ALL custom questions? This cannot be undone.")) return;
        await clearCustomQuestionsAndImages();
        this.renderSetup();
        this.toast("Custom questions deleted (site questions are kept)");
        this.openMyQuestions();
      }, "clear-custom");
    }
    document.querySelectorAll("#modal-root .my-q-edit").forEach(btn => {
      btn.onclick = () => {
        const q = list[+btn.dataset.i];
        if (q) this.openEditCustomQuestion(q.id);
      };
    });
    document.querySelectorAll("#modal-root .my-q-del").forEach(btn => {
      btn.onclick = Guard.asyncClick(async () => {
        const q = list[+btn.dataset.i];
        if (!q) return;
        if (!confirm("Delete this question?")) return;
        const r = await deleteCustomQuestion(q.id);
        if (!r.ok) { this.toast(r.error || "Delete failed"); return; }
        this.renderSetup();
        this.toast("Question deleted");
        this.openMyQuestions();
      }, "delete-custom");
    });
  },

  openEditCustomQuestion(id) {
    const q = (loadState().customQuestions || []).find(x => x && x.id === id);
    if (!q) { this.toast("Question not found"); this.openMyQuestions(); return; }
    const escAttr = escapeHTML;
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
          <label class="import-label">Category</label>
          <input id="edit-pic-category" class="import-file" type="text" value="${escAttr(q.category || "Vocab")}">
          <label class="import-label">Unit</label>
          <input id="edit-pic-unit" class="import-file" type="text" value="${escAttr(q.unit || q.course || "Dictation")}">
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
      document.getElementById("btn-edit-save").onclick = Guard.asyncClick(async () => {
        const file = fileEl.files && fileEl.files[0];
        const r = await updateCustomQuestion(id, {
          word: document.getElementById("edit-pic-word").value,
          category: document.getElementById("edit-pic-category").value,
          unit: document.getElementById("edit-pic-unit").value,
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
      }, "edit-pic-save");
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
        <label class="import-label">Category</label>
        <input id="edit-sent-category" class="import-file" type="text" value="${escAttr(q.category || "Grammar")}">
        <label class="import-label">Unit</label>
        <input id="edit-sent-unit" class="import-file" type="text" value="${escAttr(q.unit || q.course || "Custom")}">
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
    document.getElementById("btn-edit-save").onclick = Guard.asyncClick(async () => {
      const r = await updateCustomQuestion(id, {
        sentence: document.getElementById("edit-sent-sentence").value,
        answer: document.getElementById("edit-sent-answer").value,
        category: document.getElementById("edit-sent-category").value,
        unit: document.getElementById("edit-sent-unit").value,
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
    }, "edit-sent-save");
  },

  /* ---------- CSV 匯入（含指引） ---------- */
  openImport() {
    this.showModal(`
      <div class="import-box">
        <h3>📥 Import CSV Questions</h3>
        <details class="csv-guide">
          <summary>📖 CSV format guide (tap to open)</summary>
          <div class="csv-guide-body">
            <p><b>One question per line, 9 columns, comma separated:</b></p>
            <pre>No,Category,Unit,Topic,Level,Sentence,Answer,Keywords,Hint</pre>
            <ul>
              <li><b>No</b> (optional): five digits, e.g. <code>00001</code>; also matches <code>Q_folder/grammar/grammar_images/00001.png</code> as the question image</li>
              <li><b>Category</b>: the big group — <code>Phonetics</code>, <code>Grammar</code>, <code>Vocab</code>, <code>Phrases</code>, <code>Listening</code>, <code>Reading</code>, <code>Proof-reading</code>, <code>Rewriting</code>, <code>Talking with AI</code>, <code>Reading Aloud</code>, <code>Punctuation</code></li>
              <li><b>Unit</b>: the group inside the category (e.g. <code>Articles</code>, <code>Past Tense</code> under Grammar)</li>
              <li><b>Topic</b>: the small group inside the unit (e.g. <code>Articles: Basics</code>); same name = same topic</li>
              <li><b>Level</b>: number <code>1</code>, <code>2</code>, <code>3</code>, <code>4</code>… (shows that many ★ when answering)</li>
              <li><b>Sentence</b>: must contain <code>___</code> (three underscores) as the blank</li>
              <li><b>Answer</b>: the correct answer; several accepted answers can be separated with <code>|</code> or <code>/</code> (e.g. <code>were not / weren't</code>); <b>may be blank</b> (zero article)</li>
              <li><b>Keywords</b> (optional): words to highlight in the sentence, separated with <code>/</code> (one arrow from each word to the blank)</li>
              <li><b>Hint</b> (optional): short explanation shown after a wrong answer</li>
            </ul>
            <p><b>Example:</b></p>
            <pre>No,Category,Unit,Topic,Level,Sentence,Answer,Keywords,Hint
00001,Grammar,Articles,Articles: Basics,1,This is ___ apple. It is sweet and red.,an,apple,Vowel sound (apple)
00002,Grammar,Articles,Articles: Advanced,3,He went to ___ school by bus.,,school,Zero article: go to school</pre>
            <p class="csv-note">⚠ A header row (first cell "No" or "Category") is skipped automatically. Old 8-column files (No,Course,Topic,…) still work — they are treated as <code>Grammar</code>. Wrap any value containing commas in double quotes.<br>Question images live in <code>Q_folder/grammar/grammar_images/</code> named after the number (<code>00001.png</code>; jpg/jpeg/webp/gif also accepted). No image = nothing shown.</p>
          </div>
        </details>

        <label class="import-label">Option 1: choose a CSV file</label>
        <input type="file" id="csv-file" accept=".csv,text/csv,text/plain" class="import-file">

        <label class="import-label">Option 2: paste the content</label>
        <textarea id="csv-paste" class="import-paste" rows="5" placeholder="No,Category,Unit,Topic,Level,Sentence,Answer,Keywords,Hint&#10;00001,Grammar,Past Tense,Past Tense Verbs,1,Yesterday I ___(go) to the park.,went,Yesterday,go becomes went"></textarea>

        <div class="confirm-row">
          <button id="btn-do-import" class="btn-big btn-primary">Import</button>
          <button id="btn-clear-custom" class="btn-big btn-plain">🗑 Delete all imported questions</button>
          <button id="btn-import-cancel" class="btn-big btn-plain">Cancel</button>
        </div>
      </div>`, true);

    document.getElementById("btn-do-import").onclick = () => this._doImport();
    document.getElementById("btn-import-cancel").onclick = () => this.closeModal();
    document.getElementById("btn-clear-custom").onclick = Guard.asyncClick(async () => {
      await clearCustomQuestionsAndImages();
      this.closeModal();
      this.renderSetup();
      this.toast("Custom questions deleted (site questions are kept)");
    }, "clear-custom-2");
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
            <li>Paste it to ChatGPT / Claude / Gemini, and add what you want, e.g.<br><i>"Generate 30 P.3 questions on Past Tense, category Grammar, 2 units, 2–3 topics each, level 1–4."</i></li>
            <li>The AI will return CSV text. Copy it.</li>
            <li>Back here → <b>Settings → 📥 Import CSV Questions → Option 2: paste the content</b> → Import.</li>
          </ol>
        </div>

        <div class="guide-section">
          <h4>Method 2 — Write or edit the CSV yourself</h4>
          <p>One question per line, 9 columns, comma separated:</p>
          <pre class="guide-pre">No,Category,Unit,Topic,Level,Sentence,Answer,Keywords,Hint</pre>
          <ul>
            <li><b>No</b> (optional): five digits, e.g. <code>00001</code> — also used as the question image filename</li>
            <li><b>Category</b>: the big group, e.g. <code>Grammar</code>, <code>Vocab</code>, <code>Reading</code></li>
            <li><b>Unit</b>: the group inside the category, e.g. <code>Articles</code></li>
            <li><b>Topic</b>: the small group inside the unit, e.g. <code>Articles: Basics</code></li>
            <li><b>Level</b>: <code>1</code>–<code>5</code> (1 = easiest; shows that many ★)</li>
            <li><b>Sentence</b>: must contain <code>___</code> (three underscores) as the blank</li>
            <li><b>Answer</b>: the correct answer; separate multiple accepted answers with <code>/</code> (e.g. <code>were not / weren't</code>); <b>leave completely empty for zero-article questions</b></li>
            <li><b>Keywords</b> (optional): words to highlight in the sentence, separated with <code>/</code>; each must appear verbatim in the sentence</li>
            <li><b>Hint</b> (optional): short English explanation shown after a wrong answer</li>
          </ul>
          <p class="guide-tip">⚠ Category, Unit, Topic and Hint must be in <b>English</b>. Wrap any value containing a comma in double quotes.</p>
        </div>

        <div class="guide-section">
          <h4>Example (copy-paste ready)</h4>
          <pre class="guide-pre">No,Category,Unit,Topic,Level,Sentence,Answer,Keywords,Hint
00001,Grammar,Articles,Articles: Basics,1,This is ___ apple. It is sweet and red.,an,apple,Vowel sound (apple)
00002,Grammar,Articles,Articles: Advanced,3,He went to ___ school by bus.,,school,Zero article: go to school
00003,Grammar,Past Tense,Past Tense Verbs,2,Yesterday I ___(go) to the park.,went,Yesterday,Past tense of go is went.</pre>
        </div>

        <div class="guide-section">
          <h4>Question images (optional)</h4>
          <p>If you want a picture for a question, put the image in <code>Q_folder/grammar/grammar_images/</code> and name it after the question number, e.g. <code>00001.png</code> (<code>.jpg</code> / <code>.jpeg</code> / <code>.webp</code> / <code>.gif</code> also work). No image = the question just shows text.</p>
        </div>

        <div class="guide-section">
          <h4>Where do imported questions live?</h4>
          <p>Custom questions (CSV import + in-app add) are saved in this browser (<code>customQuestions</code>; picture blobs in IndexedDB) and merged with the built-in bank. They are kept after sign-out, and show under their Course/Topic in the picker. Open <b>Settings → 📋 View my questions</b> to edit or delete individual items, or delete all there / via <b>🗑 Delete all imported questions</b> in the Import window.</p>
        </div>

        <button id="guide-close" class="btn-big btn-primary">Got it!</button>
      </div>`, true);
    document.getElementById("guide-close").onclick = () => this.closeModal();
  }
});
