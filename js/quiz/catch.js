/* ============================================================
   PokeEngmon - Quiz：捕捉模式（拋精靈球揀字、物理、命中判定）
   由 js/quiz.js 拆出（總計劃 P2.5；Rule 116）。同 js/quiz.js 共用同一個 Quiz 物件：
   Object.assign 只係將方法掛返上去，this／Quiz.xxx 用法完全唔變。
   載入次序：js/quiz.js 之後（index.html）。
   ============================================================ */

Object.assign(Quiz, {
  _isCatchMode() {
    if (!this._isJunior()) return false;
    const ef = Number(this._curCard && this._curCard.ease_factor);
    return ef > 0 && ef < this._catchThreshold;
  },

  _setupCatchMode(q) {
    const area = document.getElementById("quiz-catch-area");
    const ballsHost = document.getElementById("catch-balls");
    if (!area || !ballsHost) return;

    /* 停止舊物理循環、清空 */
    this._stopPhysics();
    ballsHost.innerHTML = "";
    this._physBalls = [];
    this._grabbed = null;

    /* 預設隱藏捕捉區，恢復輸入 */
    area.classList.add("hidden");
    this.cells.forEach(c => {
      if (c.cellEl) c.cellEl.classList.remove("catch-target");
      if (c.input) c.input.disabled = false;
    });
    document.getElementById("quiz-toolbar-before").classList.remove("hidden");
    const voiceBtn = document.getElementById("btn-quiz-voice");
    if (voiceBtn) voiceBtn.classList.remove("hidden");
    document.getElementById("btn-quiz-check").classList.remove("hidden");
    const view = document.getElementById("view-quiz");
    if (view) view.classList.toggle("catch-on", this._isCatchMode());

    if (!this._isCatchMode()) return;

    /* 進入捕捉模式：隱藏鍵盤輸入，顯示精靈球（提示按鈕保留）*/
    area.classList.remove("hidden");
    this.cells.forEach(c => {
      if (c.cellEl) c.cellEl.classList.add("catch-target");
      if (c.input) c.input.disabled = true;
    });
    if (voiceBtn) voiceBtn.classList.add("hidden");
    document.getElementById("btn-quiz-check").classList.add("hidden");

    /* 每個空格各自一組精靈球（post office → post 一組、office 一組）*/
    this._spawnCatchBalls();
  },

  /* 生成當前空格嘅精靈球（1 正確 + 3 干擾項）*/
  _spawnCatchBalls() {
    const ballsHost = document.getElementById("catch-balls");
    const item = this.queue[0];
    if (!ballsHost || !item) return;
    const c = this.cells[this.currentCell];
    if (!c) return;

    /* 停止舊物理循環、清空 */
    this._stopPhysics();
    ballsHost.innerHTML = "";
    this._physBalls = [];
    this._grabbed = null;

    const correctAns = this._norm(c.primary);
    const distractors = this._pickDistractors(item.q, correctAns, 3);
    const options = [correctAns, ...distractors].sort(() => Math.random() - 0.5);

    const rect = ballsHost.getBoundingClientRect();
    const W = rect.width || 380;
    const H = rect.height || 260;
    const R = 34;

    this._physHost = ballsHost;
    this._physW = W;
    this._physH = H;
    this._physR = R;
    this._computePlayfield();

    const P = this._play;
    options.forEach(ans => {
      const ball = this._makeCatchBall(ans, ans === correctAns);
      ballsHost.appendChild(ball);
      /* label 獨立放喺 arena，唔跟球旋轉 */
      const label = document.createElement("span");
      label.className = "catch-ball-label";
      label.textContent = ans;
      ballsHost.appendChild(label);
      const spanX = Math.max(1, (P.right - P.left) - 2 * R - 12);
      const spanY = Math.max(1, (H - 2 * R - 12));
      const x = P.left + R + 6 + Math.random() * spanX;
      const y = R + 6 + Math.random() * spanY;
      const vx = (Math.random() - 0.5) * 9;
      const vy = -(2 + Math.random() * 5);
      this._physBalls.push({ el: ball, label, x, y, vx, vy, rx: Math.random() * 360, grabbed: false, flying: false, flyFrames: 0, answer: ans, correct: ans === correctAns });
      this._applyBallPos(this._physBalls[this._physBalls.length - 1]);
    });

    /* 標示當前要打中嘅空格 */
    this.cells.forEach(cc => {
      if (cc.cellEl) cc.cellEl.classList.remove("catch-target");
    });
    if (c.cellEl) c.cellEl.classList.add("catch-target");

    this._physicsRAF = requestAnimationFrame(() => this._physicsTick());
  },

  /* 可活動範圍＝題目框 + 精靈球框 + 進度條（host 相對座標），波撞邊反彈 */
  _computePlayfield() {
    const hostRect = this._physHost.getBoundingClientRect();
    const targets = ["quiz-card", "quiz-catch-area"]
      .map(id => document.getElementById(id))
      .filter(Boolean);
    const topBar = document.querySelector(".quiz-top");
    if (topBar) targets.push(topBar);
    if (!targets.length) {
      this._play = { left: 0, right: this._physW, top: 0, bottom: this._physH };
      return;
    }
    const rs = targets.map(el => el.getBoundingClientRect());
    this._play = {
      left: Math.min(...rs.map(r => r.left)) - hostRect.left,
      right: Math.max(...rs.map(r => r.right)) - hostRect.left,
      top: Math.min(...rs.map(r => r.top)) - hostRect.top,
      bottom: Math.max(...rs.map(r => r.bottom)) - hostRect.top
    };
  },

  /* 多空格題：答啱一格後，用下一格答案刷新精靈球 */
  _refreshCatchBalls() {
    this._spawnCatchBalls();
  },

  /* 從同課題其他題目抽 3 個唔同嘅錯誤答案做干擾項（以單字為單位）*/
  _pickDistractors(q, correct, n) {
    const all = (typeof getAllQuestions === "function") ? getAllQuestions() : [];
    const pool = [];
    const pushQuestion = (x) => {
      const raw = x.type === "word" ? String(x.word || "") : String(x.answer || "");
      raw.trim().split(/\s+/).forEach(tok => {
        const t = this._norm(tok);
        if (t && t !== correct && pool.indexOf(t) < 0) pool.push(t);
      });
    };
    all.filter(x => x && x.topic === q.topic && x !== q).forEach(pushQuestion);
    /* 唔夠就從全題庫補 */
    if (pool.length < n) all.forEach(x => { if (x && x !== q) pushQuestion(x); });
    /* Fisher-Yates 抽 n 個 */
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    return pool.slice(0, n);
  },

  _makeCatchBall(answer, isCorrect) {
    const ball = document.createElement("div");
    ball.className = "catch-ball";
    ball.dataset.answer = answer;
    ball.dataset.correct = isCorrect ? "1" : "0";

    ball.addEventListener("pointerdown", (e) => this._onBallDown(e, ball));
    return ball;
  },

  _applyBallPos(b) {
    b.el.style.left = (b.x - this._physR) + "px";
    b.el.style.top = (b.y - this._physR) + "px";
    /* 球體旋轉 */
    b.el.style.transform = `rotate(${b.rx}deg)`;
    /* label 獨立定位：永遠喺球底正中，唔跟旋轉 */
    if (b.label) {
      b.label.style.left = b.x + "px";
      b.label.style.top = (b.y + this._physR + 6) + "px";
    }
  },

  _stopPhysics() {
    this._physGen++;
    if (this._physicsRAF) {
      cancelAnimationFrame(this._physicsRAF);
      this._physicsRAF = null;
    }
  },

  _physicsTick() {
    if (!this._physBalls) return;
    const gen = this._physGen;
    const R = this._physR;
    const G = this._physGravity;
    const rest = this._physRestitution;
    const P = this._play || { left: 0, right: this._physW, top: 0, bottom: this._physH };

    for (const b of this._physBalls) {
      if (b.grabbed || b.removed) continue;
      if (this._physGen !== gen) return; /* 已重新生成球組，停止舊循環 */

      /* 重力 + 空氣阻力 */
      b.vy += G;
      b.vx *= this._physAirFriction;
      b.vy *= this._physAirFriction;

      /* 生命力：靜止球隨機獲得彈跳力，全區亂彈 */
      if (!b.flying && Math.random() < 0.03) {
        b.vx += (Math.random() - 0.5) * 9;
        b.vy -= 3.5 + Math.random() * 5;
      }
      /* 非飛行球限速，避免越彈越快 */
      if (!b.flying) {
        const MAX = 11;
        if (b.vx > MAX) b.vx = MAX; else if (b.vx < -MAX) b.vx = -MAX;
        if (b.vy > MAX) b.vy = MAX; else if (b.vy < -MAX) b.vy = -MAX;
      }

      b.x += b.vx;
      b.y += b.vy;
      b.rx += b.vx * (b.flying ? 2 : 1.2);
      /* 數值兜底（Rule 99）：NaN 同任何數比較都係 false，邊界反彈夾唔返 → 球永遠消失。
         變咗 NaN／Infinity 就放返精靈球框中間、速度歸零 */
      if (!Number.isFinite(b.x) || !Number.isFinite(b.y) || !Number.isFinite(b.vx) || !Number.isFinite(b.vy)) {
        b.x = (this._physW || 380) / 2; b.y = (this._physH || 260) / 2;
        b.vx = 0; b.vy = 0; b.rx = 0; b.flying = false;
      }
      if (!Number.isFinite(b.rx)) b.rx = 0;

      /* 邊界反彈：
         自由彈跳 → 只限精靈球框內（唔會彈高過框頂）
         拋出飛行 → 整個活動範圍（題目框 + 精靈球框 + 進度條）*/
      const box = b.flying
        ? P
        : { left: 0, right: this._physW, top: 0, bottom: this._physH };
      if (b.x < box.left + R) { b.x = box.left + R; b.vx = Math.abs(b.vx) * rest; }
      if (b.x > box.right - R) { b.x = box.right - R; b.vx = -Math.abs(b.vx) * rest; }
      if (b.y < box.top + R) { b.y = box.top + R; b.vy = Math.abs(b.vy) * rest; }
      if (b.y > box.bottom - R) {
        b.y = box.bottom - R;
        b.vy = -Math.abs(b.vy) * rest;
        if (Math.abs(b.vy) < 1.2) b.vy = -3.2; /* 永遠保持彈跳力 */
      }

      if (b.flying) {
        this._checkCatchHit(b);
        b.flyFrames = (b.flyFrames || 0) + 1;
        /* 抛完落返精靈球框內（或超時）就回復自由彈跳 */
        if ((b.flyFrames > 40 && b.y >= R) || b.flyFrames > 240 || (!b.el.classList.contains("flying"))) {
          b.flying = false;
          b.flyFrames = 0;
          b.el.classList.remove("flying");
        }
      }

      this._applyBallPos(b);
    }

    /* 球球之間碰撞 */
    this._ballBallCollision();

    if (this._physGen !== gen) return; /* 舊循環不再排程，避免雙重 RAF */
    this._physicsRAF = requestAnimationFrame(() => this._physicsTick());
  },

  _ballBallCollision() {
    const R = this._physR;
    const balls = this._physBalls;
    for (let i = 0; i < balls.length; i++) {
      for (let j = i + 1; j < balls.length; j++) {
        const a = balls[i], b = balls[j];
        if (a.grabbed || b.grabbed || a.removed || b.removed) continue;
        const dx = b.x - a.x, dy = b.y - a.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const min = R * 2;
        if (dist > 0 && dist < min) {
          const overlap = (min - dist) / 2;
          const nx = dx / dist, ny = dy / dist;
          a.x -= nx * overlap; a.y -= ny * overlap;
          b.x += nx * overlap; b.y += ny * overlap;
          /* 速度交換（簡化）*/
          const dvx = b.vx - a.vx, dvy = b.vy - a.vy;
          const dot = dvx * nx + dvy * ny;
          if (dot < 0) {
            const imp = dot * this._physRestitution;
            a.vx += imp * nx; a.vy += imp * ny;
            b.vx -= imp * nx; b.vy -= imp * ny;
          }
        }
      }
    }
  },

  _onBallDown(e, ball) {
    if (this.answered) return;
    e.preventDefault();
    e.stopPropagation();

    const b = this._physBalls.find(x => x.el === ball);
    if (!b) return;

    b.grabbed = true;
    b.flying = false;
    b.vx = 0; b.vy = 0;
    ball.classList.add("grabbed");
    ball.classList.remove("flying");

    const hostRect = this._physHost.getBoundingClientRect();
    this._grabOffsetX = e.clientX - (hostRect.left + b.x);
    this._grabOffsetY = e.clientY - (hostRect.top + b.y);
    this._lastMoveX = e.clientX;
    this._lastMoveY = e.clientY;
    this._moveVx = 0;
    this._moveVy = 0;
    /* 旋轉力累積：追蹤角速度（圈得越快，spin 越大）*/
    this._spinAccum = 0;
    this._grabCenterX = e.clientX;
    this._grabCenterY = e.clientY;
    this._lastAngle = null;

    const onMove = (ev) => {
      this._moveVx = ev.clientX - this._lastMoveX;
      this._moveVy = ev.clientY - this._lastMoveY;
      this._lastMoveX = ev.clientX;
      this._lastMoveY = ev.clientY;
      b.x = (ev.clientX - this._grabOffsetX) - hostRect.left;
      b.y = (ev.clientY - this._grabOffsetY) - hostRect.top;

      /* 計算角速度（繞 grab 中心打圈）*/
      const dx = ev.clientX - this._grabCenterX;
      const dy = ev.clientY - this._grabCenterY;
      const ang = Math.atan2(dy, dx);
      let da = 0;
      if (this._lastAngle !== null) {
        da = ang - this._lastAngle;
        if (da > Math.PI) da -= Math.PI * 2;
        if (da < -Math.PI) da += Math.PI * 2;
        this._spinAccum += da;
      }
      this._lastAngle = ang;

      /* 視覺旋轉：跟水平拖動 + 打圈角速度（圈得越快轉得越快）*/
      b.rx += this._moveVx * 2 + da * 40;

      this._applyBallPos(b);
    };
    const onUp = (ev) => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      ball.classList.remove("grabbed");
      this._onBallUp(ev, b);
    };
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
  },

  _onBallUp(e, b) {
    b.grabbed = false;
    /* 投擲初速 = 拖動速度 */
    b.vx = this._moveVx * this._physThrowScale * 6;
    b.vy = this._moveVy * this._physThrowScale * 6;

    /* 旋轉力加成：打圈嘅角速度轉換成切線方向嘅額外速度（已調弱）*/
    const spin = this._spinAccum || 0;
    if (Math.abs(spin) > 0.25) {
      const hostRect = this._physHost.getBoundingClientRect();
      const cx = this._grabCenterX - hostRect.left;
      const cy = this._grabCenterY - hostRect.top;
      const dx = b.x - cx, dy = b.y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const tx = -dy / dist, ty = dx / dist;
      const spinForce = Math.min(Math.abs(spin) * 3, 7);
      const sign = spin > 0 ? 1 : -1;
      b.vx += tx * spinForce * sign;
      b.vy += ty * spinForce * sign;
      b.rx += spin * 30;
    }

    /* 限制最大速度 */
    const maxV = 26;
    const sp = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
    if (sp > maxV) { b.vx = b.vx / sp * maxV; b.vy = b.vy / sp * maxV; }
    b.flying = true;
    b.flyFrames = 0;
    b.el.classList.add("flying");
  },

  /* 飛行中檢查是否打中目標空格 */
  _checkCatchHit(b) {
    const target = this.cells[this.currentCell];
    if (!target || !target.cellEl) return;
    const tr = target.cellEl.getBoundingClientRect();
    const hostRect = this._physHost.getBoundingClientRect();
    const cx = hostRect.left + b.x;
    const cy = hostRect.top + b.y;
    const pad = 12; /* 目標判定稍為放寬，易啲打中 */
    if (cx >= tr.left - pad && cx <= tr.right + pad && cy >= tr.top - pad && cy <= tr.bottom + pad) {
      b.flying = false;
      b.el.classList.remove("flying");
      this._catchSubmit(b.answer, b.correct);
    }
  },

  /* 捕捉模式提交：打中就當 Submit 處理 */
  _catchSubmit(answer, isCorrect) {
    const item = this.queue[0];
    if (!item || this.answered) return;
    const q = item.q;
    const a = this._answerFor(q);

    if (isCorrect) {
      /* 答啱：填入答案 → green → 如有下一格就刷新精靈球 */
      const c = this.cells[this.currentCell];
      if (c) {
        c.value = answer;
        if (c.input) c.input.value = answer;
        if (c.textEl) c.textEl.textContent = answer;
      }
      const prevCell = this.currentCell;
      this._greenCell(this.currentCell);
      /* 仲有下一格 → 用下一格答案重新生成精靈球 */
      if (this.currentCell !== prevCell && !this.answered) {
        this._refreshCatchBalls();
      }
    } else {
      /* 答錯：沿用 junior attempt 邏輯，所有錯都閃紅 */
      a.attemptCount++;
      this._flashWrong();
      this._vibrate(50);
      if (a.attemptCount >= 4 || a.hintCount >= 1) {
        /* 第 4 次或以後錯（或用過 L1）→ L2：正確球變大師球 */
        a.hintCount = 2;
        this._catchL2();
      } else if (a.attemptCount >= 2) {
        /* 第 2 次錯（或之後未到 L2）→ L1：拿走一個錯誤選項球 */
        a.hintCount = 1;
        this._catchL1();
      }
      /* 第 1 次錯：閃紅，畀再試 */
    }
  },

  /* L1 提示：隨機拿走一個錯誤選項嘅精靈球 */
  _catchL1() {
    const wrong = (this._physBalls || []).filter(b => !b.correct && !b.removed && b.el.parentNode);
    if (!wrong.length) return;
    const target = wrong[Math.floor(Math.random() * wrong.length)];
    target.removed = true;
    target.el.classList.add("removing");
    if (target.label) target.label.classList.add("removing");
    const el = target.el, lbl = target.label;
    setTimeout(() => {
      el.remove();
      if (lbl) lbl.remove();
      this._physBalls = (this._physBalls || []).filter(x => x !== target);
    }, 320);
  },

  /* L2 提示：正確答案嘅精靈球變成大師球 */
  _catchL2() {
    (this._physBalls || []).forEach(b => {
      if (b.correct) b.el.classList.add("master");
    });
  }
});
