/* ============================================================
   PokeEngmon - 練習日曆
   顏色分級：灰(0組) 黃(1-2) 綠(3-4) 藍(5+)，點擊看當日詳情
   ============================================================ */

const Calendar = {
  year: new Date().getFullYear(),
  month: new Date().getMonth(),   // 0-11

  open() {
    App.showView("view-calendar");
    this.render("view-calendar");
  },

  /* render 到指定 container。options.disableClick=true 時唔彈 showDay modal（Streak sheet 預覽用）*/
  render(containerId, options = {}) {
    const root = containerId ? document.querySelector(containerId) : document.getElementById("view-calendar");
    if (!root) return;
    const disableClick = !!options.disableClick;

    const MONTHS = ["January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December"];

    /* 如果 root 內冇 cal-grid 等元素 → 先注入結構（Streak sheet 用） */
    if (!root.querySelector(".cal-month-label")) {
      root.innerHTML = `
        <div style="padding:10px 4px;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
            <button class="cal-nav" type="button" aria-label="Previous month">‹</button>
            <span class="cal-month-label" style="font-size:14px; font-weight:900;"></span>
            <button class="cal-nav" type="button" aria-label="Next month">›</button>
          </div>
          <div class="cal-weekdays"></div>
          <div class="cal-grid"></div>
          <div class="cal-legend"></div>
        </div>`;
      /* 綁 nav */
      root.querySelector(".cal-nav:first-child").onclick = () => { this.month--; if (this.month<0){this.month=11;this.year--;} this.render(containerId); };
      root.querySelector(".cal-nav:last-child").onclick = () => { this.month++; if (this.month>11){this.month=0;this.year++;} this.render(containerId); };
    }

    root.querySelector(".cal-month-label").textContent =
      `${MONTHS[this.month]} ${this.year}`;

    /* Weekday header */
    root.querySelector(".cal-weekdays").innerHTML =
      ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(d => `<span>${d}</span>`).join("");

    /* 日期格 */
    const grid = root.querySelector(".cal-grid");
    grid.innerHTML = "";
    const firstDay = new Date(this.year, this.month, 1).getDay();
    const daysInMonth = new Date(this.year, this.month + 1, 0).getDate();
    const todayKey = dateKey(Date.now());

    for (let i = 0; i < firstDay; i++) grid.appendChild(document.createElement("span"));

    for (let d = 1; d <= daysInMonth; d++) {
      const key = `${this.year}-${String(this.month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      const level = dayLevel(key);
      const cell = document.createElement("button");
      cell.className = `cal-cell lv${level}` + (key === todayKey ? " today" : "");
      const st = loadState();
      const recs = (st.records && st.records[key]) || [];
      const setsN = Math.max(recs.length, (st.practiceDays && st.practiceDays[key]) || 0);
      cell.innerHTML = `<span class="cal-day">${d}</span>` +
        (level > 0 ? `<span class="cal-count">${setsN}</span>` : "");
      if (level > 0 && !disableClick) cell.onclick = () => this.showDay(key);
      grid.appendChild(cell);
    }

    /* 圖例 */
    root.querySelector(".cal-legend").innerHTML = `
      <span><i class="lv-dot lv0"></i>No practice</span>
      <span><i class="lv-dot lv1"></i>1–2 sets</span>
      <span><i class="lv-dot lv2"></i>3–4 sets</span>
      <span><i class="lv-dot lv3"></i>5+ sets</span>`;
  },

  prev() {
    this.month--;
    if (this.month < 0) { this.month = 11; this.year--; }
    this.render();
  },

  next() {
    this.month++;
    if (this.month > 11) { this.month = 0; this.year++; }
    this.render();
  },

  /* 當日詳細記錄 Modal：各組成績 + 錯題解釋 */
  showDay(key) {
    const st = loadState();
    const sets = st.records[key] || [];
    if (sets.length === 0) return;

    const detailed = sets.filter(r => Array.isArray(r.results) && r.results.length);
    const totalScore = detailed.reduce((s, r) => s + r.score, 0);
    const totalQ = detailed.reduce((s, r) => s + r.total, 0);
    const summary = detailed.length
      ? `${sets.length} sets done ・ Total score ${totalScore}/${totalQ}`
      : `${sets.length} sets done ・ detailed answers were not saved for these sets`;

    const setBlocks = sets.map((r, idx) => {
      const results = Array.isArray(r.results) ? r.results : [];
      const noDetail = results.length === 0;
      const time = new Date(r.ts).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
      const mm = Math.floor((r.duration || 0) / 60), ss = (r.duration || 0) % 60;
      const wrongs = results.filter(x => !x.correct);
      const wrongHTML = noDetail
        ? `<div class="day-allright">Answers not synced to this device</div>`
        : (wrongs.length === 0
            ? `<div class="day-allright">All correct — nice! 🌟</div>`
            : `<div class="day-wrongs" id="day-wrongs-${idx}"></div>`);
      return `
        <div class="day-set">
          <div class="day-set-head">
            <b>Set ${idx + 1}</b>
            <span>${time}</span>
            <span class="${!noDetail && r.score === r.total ? "score-perfect" : ""}">${noDetail ? "—" : `${r.score}/${r.total}`}</span>
            <span>⏱ ${mm}:${String(ss).padStart(2, "0")}</span>
          </div>
          ${wrongHTML}
        </div>`;
    }).join("");

    App.showModal(`
      <div class="day-detail">
        <h3>${key.replace(/-/g, "/")} Practice record</h3>
        <div class="day-summary">${summary}</div>
        ${setBlocks}
      </div>
    `);

    /* 錯題解釋（需要 DOM 排好版先畫箭咀） */
    sets.forEach((r, idx) => {
      const box = document.getElementById(`day-wrongs-${idx}`);
      if (!box) return;
      (Array.isArray(r.results) ? r.results : []).filter(x => !x.correct).forEach(w => {
        const q = findQuestion(w.qid);
        if (q) Explain.render(box, q, w.chosen);
      });
    });
  }
};
