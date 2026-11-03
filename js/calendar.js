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

  /* render 到指定 container（預設 view-calendar）；
     點擊有紀錄的日子會喺日曆下方內嵌顯示當日詳情（唔彈 modal） */
  render(containerId) {
    const root = containerId ? document.querySelector(containerId) : document.getElementById("view-calendar");
    if (!root) return;

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
    }

    /* 綁 nav：每次 render 都重綁，確保注入新結構後仍然可切月 */
    const stepMonth = (delta) => {
      this.month += delta;
      if (this.month < 0) { this.month = 11; this.year--; }
      if (this.month > 11) { this.month = 0; this.year++; }
      this.render(containerId);
    };
    root.querySelector(".cal-nav:first-child").onclick = () => stepMonth(-1);
    root.querySelector(".cal-nav:last-child").onclick = () => stepMonth(1);

    root.querySelector(".cal-month-label").textContent =
      `${MONTHS[this.month]} ${this.year}`;

    /* Weekday header */
    root.querySelector(".cal-weekdays").innerHTML =
      ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(d => `<span>${d}</span>`).join("");

    /* 內嵌詳情容器：每次 render（開 sheet／切月）都清空，避免殘留上一頁紀錄 */
    let detail = root.querySelector(".cal-day-inline");
    if (!detail) {
      detail = document.createElement("div");
      detail.className = "cal-day-inline";
      const legend = root.querySelector(".cal-legend");
      if (legend) legend.insertAdjacentElement("afterend", detail);
      else root.appendChild(detail);
    }
    detail.hidden = true;
    detail.innerHTML = "";
    delete detail.dataset.key;

    const showInline = (key) => {
      const html = this.dayDetailHTML(key);
      /* 點冇紀錄的日子 → 收起目前展開嘅詳情 */
      if (!html) {
        detail.hidden = true;
        detail.innerHTML = "";
        delete detail.dataset.key;
        return;
      }
      /* 再點同一日 → 收起 */
      if (detail.dataset.key === key) {
        detail.hidden = true;
        detail.innerHTML = "";
        delete detail.dataset.key;
        return;
      }
      detail.dataset.key = key;
      detail.innerHTML = html;
      detail.hidden = false;
      this._renderExplains(key, detail);
      detail.scrollIntoView({ block: "nearest", behavior: "smooth" });
    };

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
      cell.onclick = () => showInline(key);
      grid.appendChild(cell);
    }

    /* 左右掃切換月份（帶磁吸回彈） */
    this._bindSwipe(grid, containerId);

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

  /* 左右掃轉月份：跟手指拖動，放手後磁吸到上一／下一月或回彈原位 */
  _bindSwipe(grid, containerId) {
    if (grid._swipeAC) grid._swipeAC.abort();
    const ac = new AbortController();
    grid._swipeAC = ac;

    const rootOf = () => (containerId ? document.querySelector(containerId) : document.getElementById("view-calendar"));
    const width = () => Math.max(grid.getBoundingClientRect().width, 1);

    let activeId = null, startX = 0, startY = 0, dx = 0;
    let locked = false, horizontal = false;
    let lastX = 0, lastT = 0, velocity = 0;
    let suppressClick = !!grid._swipeSuppress; /* 跨 re-render 保留，避免掃完誤觸日期 */

    const snapBack = () => {
      grid.style.transition = "transform .34s cubic-bezier(.22,1,.36,1)";
      grid.style.transform = "translateX(0)";
    };

    const changeMonth = (delta) => {
      const W = width();
      grid.style.transition = "transform .2s cubic-bezier(.4,0,1,1)";
      grid.style.transform = `translateX(${delta > 0 ? -W : W}px)`;
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        grid.removeEventListener("transitionend", finish);
        this.month += delta;
        if (this.month < 0) { this.month = 11; this.year--; }
        if (this.month > 11) { this.month = 0; this.year++; }
        this.render(containerId);
        const nextGrid = rootOf()?.querySelector(".cal-grid");
        if (!nextGrid) return;
        /* 新月份由反方向滑入，形成磁吸接合 */
        nextGrid.style.transition = "none";
        nextGrid.style.transform = `translateX(${delta > 0 ? W : -W}px)`;
        void nextGrid.offsetWidth;
        requestAnimationFrame(() => {
          nextGrid.style.transition = "transform .34s cubic-bezier(.22,1,.36,1)";
          nextGrid.style.transform = "translateX(0)";
        });
      };
      grid.addEventListener("transitionend", finish);
      setTimeout(finish, 260);
    };

    grid.addEventListener("pointerdown", (e) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      activeId = e.pointerId;
      startX = lastX = e.clientX;
      startY = e.clientY;
      dx = 0;
      locked = false;
      horizontal = false;
      velocity = 0;
      lastT = performance.now();
      grid.style.transition = "none";
    }, { signal: ac.signal });

    grid.addEventListener("pointermove", (e) => {
      if (e.pointerId !== activeId) return;
      const mx = e.clientX - startX;
      const my = e.clientY - startY;
      if (!locked) {
        if (Math.abs(mx) < 6 && Math.abs(my) < 6) return;
        locked = true;
        horizontal = Math.abs(mx) > Math.abs(my);
        if (!horizontal) { activeId = null; return; } /* 垂直手勢交返俾 sheet 捲動 */
        grid.setPointerCapture(e.pointerId);
      }
      const now = performance.now();
      if (now > lastT) velocity = (e.clientX - lastX) / (now - lastT);
      lastX = e.clientX;
      lastT = now;
      dx = mx;
      grid.style.transform = `translateX(${dx}px)`;
      if (e.cancelable) e.preventDefault();
    }, { signal: ac.signal, passive: false });

    const end = (e) => {
      if (e.pointerId !== activeId) return;
      activeId = null;
      const wasDrag = locked && horizontal && Math.abs(dx) > 10;
      if (!wasDrag) { grid.style.transition = ""; grid.style.transform = ""; return; }

      suppressClick = true;
      grid._swipeSuppress = true;
      setTimeout(() => { suppressClick = false; grid._swipeSuppress = false; }, 350);

      const W = width();
      const threshold = Math.min(W * 0.18, 56);
      const flung = Math.abs(velocity) > 0.45 && Math.abs(dx) > 20 && velocity * dx > 0;
      if (Math.abs(dx) > threshold || flung) changeMonth(dx < 0 ? 1 : -1);
      else snapBack();
    };
    grid.addEventListener("pointerup", end, { signal: ac.signal });
    grid.addEventListener("pointercancel", end, { signal: ac.signal });

    /* 掃完唔好誤觸日期格 */
    grid.addEventListener("click", (e) => {
      if (!suppressClick) return;
      suppressClick = false;
      grid._swipeSuppress = false;
      e.stopPropagation();
      e.preventDefault();
    }, { signal: ac.signal, capture: true });
  },

  /* 當日詳細記錄 HTML：各組成績 + 錯題位置；冇紀錄回傳 "" */
  dayDetailHTML(key) {
    const st = loadState();
    const sets = st.records[key] || [];
    if (sets.length === 0) return "";

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
            : `<div class="day-wrongs" data-wrongs="${idx}"></div>`);
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

    return `
      <div class="day-detail">
        <h3>${key.replace(/-/g, "/")} Practice record</h3>
        <div class="day-summary">${summary}</div>
        ${setBlocks}
      </div>`;
  },

  /* 錯題解釋（需要詳情 DOM 已插入先畫箭咀） */
  _renderExplains(key, root) {
    const sets = loadState().records[key] || [];
    sets.forEach((r, idx) => {
      const box = root.querySelector(`[data-wrongs="${idx}"]`);
      if (!box) return;
      (Array.isArray(r.results) ? r.results : []).filter(x => !x.correct).forEach(w => {
        const q = findQuestion(w.qid);
        if (q) Explain.render(box, q, w.chosen);
      });
    });
  }
};
