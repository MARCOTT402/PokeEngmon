/* ============================================================
   PokeEngmon - 練習日曆
   顏色分級：灰(0組) 黃(1-2) 綠(3-4) 藍(5+)，點擊看當日詳情
   ============================================================ */

const Calendar = {
  year: new Date().getFullYear(),
  month: new Date().getMonth(),   // 0-11

  open() {
    App.showView("view-calendar");
    this.render();
  },

  render() {
    const MONTHS = ["January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December"];
    document.getElementById("cal-month-label").textContent =
      `${MONTHS[this.month]} ${this.year}`;

    /* Weekday header */
    document.getElementById("cal-weekdays").innerHTML =
      ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(d => `<span>${d}</span>`).join("");

    /* 日期格 */
    const grid = document.getElementById("cal-grid");
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
      cell.innerHTML = `<span class="cal-day">${d}</span>` +
        (level > 0 ? `<span class="cal-count">${loadState().records[key].length} sets</span>` : "");
      if (level > 0) cell.onclick = () => this.showDay(key);
      grid.appendChild(cell);
    }

    /* 圖例 */
    document.getElementById("cal-legend").innerHTML = `
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

    const totalScore = sets.reduce((s, r) => s + r.score, 0);
    const totalQ = sets.reduce((s, r) => s + r.total, 0);

    const setBlocks = sets.map((r, idx) => {
      const time = new Date(r.ts).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
      const mm = Math.floor(r.duration / 60), ss = r.duration % 60;
      const wrongs = r.results.filter(x => !x.correct);
      const wrongHTML = wrongs.length === 0
        ? `<div class="day-allright">All correct — nice! 🌟</div>`
        : `<div class="day-wrongs" id="day-wrongs-${idx}"></div>`;
      return `
        <div class="day-set">
          <div class="day-set-head">
            <b>Set ${idx + 1}</b>
            <span>${time}</span>
            <span class="${r.score === r.total ? "score-perfect" : ""}">${r.score}/${r.total}</span>
            <span>⏱ ${mm}:${String(ss).padStart(2, "0")}</span>
          </div>
          ${wrongHTML}
        </div>`;
    }).join("");

    App.showModal(`
      <div class="day-detail">
        <h3>${key.replace(/-/g, "/")} Practice record</h3>
        <div class="day-summary">${sets.length} sets done ・ Total score ${totalScore}/${totalQ}</div>
        ${setBlocks}
      </div>
    `);

    /* 錯題解釋（需要 DOM 排好版先畫箭咀） */
    sets.forEach((r, idx) => {
      const box = document.getElementById(`day-wrongs-${idx}`);
      if (!box) return;
      r.results.filter(x => !x.correct).forEach(w => {
        const q = findQuestion(w.qid);
        if (q) Explain.render(box, q, w.chosen);
      });
    });
  }
};
