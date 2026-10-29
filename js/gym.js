/* ============================================================
   Gym Challenge + streak helpers + badge sprites (PokéAPI items)
   ============================================================ */

const GYM_BADGE_ITEMS = [
  "boulder-badge", "cascade-badge", "thunder-badge", "rainbow-badge",
  "soul-badge", "marsh-badge", "volcano-badge", "earth-badge",
  "zephyr-badge", "hive-badge", "plain-badge", "fog-badge",
  "storm-badge", "mineral-badge", "glacier-badge", "rising-badge"
];

function gymBadgeItemForMilestone(milestone) {
  const idx = Math.max(0, Math.floor(milestone / 10) - 1);
  return GYM_BADGE_ITEMS[idx % GYM_BADGE_ITEMS.length];
}

/* 徽章圖改用本地 assets/badges/<n>.png
   （原本 https://raw.githubusercontent.com/.../sprites/items/boulder-badge.png 係 404，
     而且 raw.githubusercontent 在部分地區被封，會變成空白框） */
function gymBadgeSpriteURL(milestone) {
  const idx = Math.max(0, Math.floor(milestone / 10) - 1) % GYM_BADGE_ITEMS.length;
  return `assets/badges/${idx + 1}.png`;
}

const Gym = {
  /* Next unclaimed 10-multiple that streak qualifies for, or 0 */
  nextAvailableMilestone(streak, badges) {
    const s = Math.max(0, streak | 0);
    const owned = new Set((badges || []).map(Number));
    for (let m = 10; m <= s; m += 10) {
      if (!owned.has(m)) return m;
    }
    return 0;
  },

  getBadges() {
    const st = loadState();
    return Array.isArray(st.gymBadges) ? st.gymBadges.slice() : [];
  },

  setBadges(arr) {
    const st = loadState();
    st.gymBadges = Array.isArray(arr) ? arr.map(Number).filter(n => n >= 10 && n % 10 === 0) : [];
    saveState();
  },

  refreshHomeUI() {
    const streak = typeof calcStreak === "function" ? calcStreak() : 0;
    const wrap = document.getElementById("home-streak-wrap");
    const label = document.getElementById("home-streak-label");
    const canvas = document.getElementById("home-streak-bolt");
    if (wrap && label) {
      if (streak >= 1) {
        wrap.hidden = false;
        label.textContent = `x${streak} days`;
        this._startBolt(canvas);
      } else {
        wrap.hidden = true;
        this._stopBolt();
      }
    }
    const btn = document.getElementById("btn-gym-challenge");
    if (btn) {
      const m = this.nextAvailableMilestone(streak, this.getBadges());
      btn.hidden = !m;
      btn.dataset.milestone = m ? String(m) : "";
      if (m) btn.textContent = `⚔ GYM CHALLENGE ×${m}`;
    }
    const row = document.getElementById("home-gym-badges");
    if (row) {
      const badges = this.getBadges().slice().sort((a, b) => a - b);
      row.hidden = badges.length === 0;
      row.innerHTML = badges.map(m =>
        `<img class="gym-badge-icon" src="${gymBadgeSpriteURL(m)}" alt="Badge x${m}" title="Gym ×${m}"
              loading="lazy" onerror="this.style.opacity=.35">`
      ).join("");
    }
  },

  startChallenge() {
    const streak = calcStreak();
    const m = this.nextAvailableMilestone(streak, this.getBadges());
    if (!m) { App.toast("No Gym Challenge available yet."); return; }
    this._activeMilestone = m;
    Quiz.startGym(m);
  },

  /* After quiz+powerup+capture settle path finishes for gym mode */
  conclude(data) {
    const milestone = this._activeMilestone || (data && data.gymMilestone) || 0;
    this._activeMilestone = 0;
    const results = (data && data.results) || [];
    const usedHint = results.some(r => r.hint);
    const allCorrect = results.length > 0 && results.every(r => r.correct);
    if (!allCorrect || usedHint) {
      App.showModal(`
        <div class="confirm-box">
          <p><b>Sorry</b>, you need to defeat the enemy with all questions passed without using hints. Try again!</p>
          <button id="gym-fail-ok" class="btn-big btn-primary">Back to Home</button>
        </div>`, true);
      document.getElementById("gym-fail-ok").onclick = () => {
        App.closeModal();
        App.renderHome();
        App.showView("view-home");
      };
      return;
    }
    if (!milestone) {
      App.renderHome();
      App.showView("view-home");
      return;
    }
    const item = gymBadgeItemForMilestone(milestone);
    App.showModal(`
      <div class="confirm-box gym-claim">
        <p class="gym-claim-title">Gym Challenge Cleared!</p>
        <img class="gym-claim-art" src="${gymBadgeSpriteURL(milestone)}" alt=""
             onerror="this.style.display='none'">
        <p>Claim your <b>×${milestone}</b> badge<br><small>(${item.replace(/-/g, " ")})</small></p>
        <button id="gym-claim-btn" class="btn-big btn-primary">Claim Badge</button>
      </div>`, true);
    document.getElementById("gym-claim-btn").onclick = async () => {
      const btn = document.getElementById("gym-claim-btn");
      if (btn) btn.disabled = true;
      let badges = this.getBadges();
      if (!badges.includes(milestone)) badges.push(milestone);
      this.setBadges(badges);
      if (window.SupabaseAuth && SupabaseAuth.isLoggedIn() && SupabaseAuth.claimGymBadge) {
        try {
          const remote = await SupabaseAuth.claimGymBadge(milestone);
          if (Array.isArray(remote)) this.setBadges(remote);
        } catch (e) { console.warn("[Gym] claim RPC failed:", e); }
      }
      App.closeModal();
      App.renderHome();
      App.showView("view-home");
      App.toast(`Badge ×${milestone} claimed!`);
    };
  },

  _boltRaf: 0,
  _startBolt(canvas) {
    if (!canvas || typeof canvas.getContext !== "function") return;
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      this._stopBolt();
      const ctx = canvas.getContext("2d");
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      this._drawBolt(ctx, canvas.width, canvas.height, 1);
      return;
    }
    if (this._boltRaf) return;
    const ctx = canvas.getContext("2d");
    const w = canvas.width, h = canvas.height;
    let t0 = performance.now();
    const tick = (now) => {
      const k = 0.5 + 0.5 * Math.sin((now - t0) / 180);
      ctx.clearRect(0, 0, w, h);
      this._drawBolt(ctx, w, h, 0.65 + 0.35 * k);
      this._boltRaf = requestAnimationFrame(tick);
    };
    this._boltRaf = requestAnimationFrame(tick);
  },
  _stopBolt() {
    if (this._boltRaf) { cancelAnimationFrame(this._boltRaf); this._boltRaf = 0; }
  },
  _drawBolt(ctx, w, h, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = "#f5d76e";
    ctx.fillStyle = "#ffe566";
    ctx.lineWidth = 2;
    ctx.shadowColor = "#ffea00";
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.moveTo(w * 0.55, h * 0.08);
    ctx.lineTo(w * 0.32, h * 0.48);
    ctx.lineTo(w * 0.52, h * 0.48);
    ctx.lineTo(w * 0.38, h * 0.92);
    ctx.lineTo(w * 0.72, h * 0.42);
    ctx.lineTo(w * 0.50, h * 0.42);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
};
