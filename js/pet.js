/* ============================================================
   Pet — 電子寵物養成（只服務「當前拍檔」）
   ------------------------------------------------------------
   規則摘要：
   - 每隻 entry 帶 pet 狀態 { health 0-100, streak, lastFedDay, settledDay, decayDay }
   - 只有當前拍檔會隨時間結算；其他 entry 嘅 health 完全凍結
   - 結算時區固定 UTC+8（HKT），唔受裝置時區影響
   - 進食時段 15:00–20:59（HKT）；血滿 100 唔可以再餵；血未滿可無限次餵
   - 每日 15:00（HKT）自然消耗 −50（每日一次，離線多日逐日補扣）
   - 該日冇餵過 → streak 歸 0（唔再額外扣血）
   - health 0 → Faint：唔再扣血（只更新結算標記）
   - 道具：food +25、premium +50、revive（Faint 專用，回滿血）
   - 掉落：10/10 → 復活藥 1 + 高級食物 1，另有 10% 額外復活藥
            1–9   → 普通食物 1，另有 10% 復活藥
   ============================================================ */
const Pet = (() => {
  const FEED_START = 15 * 60;     // 15:00 HKT 開放餵食（同時係每日自然消耗時刻）
  const FEED_END = 21 * 60;       // 21:00 HKT 關閉
  const DECAY_START = 15 * 60;    // 15:00 HKT 每日自然消耗
  const DECAY_AMOUNT = 50;        // 自然消耗 = 最大血量 50%
  const DEFAULT_HEALTH = 100;
  const MAX_SETTLE_DAYS = 60;     // 防止離線超久時無限 loop
  const ITEM_KINDS = ["food", "premium", "revive", ...STONE_KINDS];

  /* 結算時區：固定 UTC+8。HKT 無夏令時間，所以恆定 +8h。 */
  const HKT_MS = 8 * 3600 * 1000;
  const CLOCK_KEY = "pokeengmon_clock_v1";
  const ROLLBACK_TOLERANCE = 60 * 1000;   // 本地時間倒退超過 60 秒 → 判定可疑

  function pad(n) { return String(n).padStart(2, "0"); }

  /* ---------- 時鐘校正（伺服器時間 offset） ---------- */
  let _clock = null;

  function _loadClock() {
    if (_clock) return _clock;
    try {
      const raw = localStorage.getItem(CLOCK_KEY);
      const o = raw ? JSON.parse(raw) : null;
      _clock = (o && typeof o.offset === "number")
        ? { offset: o.offset, lastLocalTs: Number(o.lastLocalTs) || 0 }
        : { offset: 0, lastLocalTs: 0 };
    } catch (e) {
      _clock = { offset: 0, lastLocalTs: 0 };
    }
    return _clock;
  }

  function _saveClock() {
    try { localStorage.setItem(CLOCK_KEY, JSON.stringify(_clock)); } catch (e) {}
  }

  /* 以伺服器時間校正：offset = serverTime − clientTime */
  function setClockOffset(serverTs, clientTs) {
    const c = _loadClock();
    const clientNow = Number(clientTs) || Date.now();
    const server = Number(serverTs);
    if (!isFinite(server) || server <= 0) return c.offset;
    c.offset = server - clientNow;
    c.lastLocalTs = clientNow;
    _saveClock();
    return c.offset;
  }

  function clockOffset() { return _loadClock().offset; }

  /* 本地時鐘被倒撥 → 唔可信（只偵測倒退：向前跳會令用戶多扣，唔屬作弊動機） */
  function clockSuspicious() {
    const c = _loadClock();
    if (!c.lastLocalTs) return false;   // 未同步過：冇基準可比
    return Date.now() < c.lastLocalTs - ROLLBACK_TOLERANCE;
  }

  /* 可信的「現在」（校正後毫秒） */
  function nowTs() { return Date.now() + _loadClock().offset; }

  function _tsOf(d) {
    if (d instanceof Date) return d.getTime();
    if (typeof d === "number" && isFinite(d)) return d;
    return nowTs();
  }

  /* 固定 UTC+8 的 "YYYY-MM-DD"（唔受裝置時區影響） */
  function dayKey(d) {
    const t = new Date(_tsOf(d) + HKT_MS);
    return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
  }

  /* 當日 HKT 分鐘數（15:00 → 900） */
  function minuteOfDay(d) {
    const t = new Date(_tsOf(d) + HKT_MS);
    return t.getUTCHours() * 60 + t.getUTCMinutes();
  }

  /* 日期加減：用 UTC 做日期運算，避免任何時區偏移 */
  function shiftDay(key, delta) {
    const [y, m, d] = key.split("-").map(Number);
    const t = new Date(Date.UTC(y, m - 1, d + delta));
    return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
  }

  function touch(p) { p.updatedAt = new Date().toISOString(); }

  /* 補齊/遷移 pet 狀態（舊存檔默認滿血，唔會追溯扣血）
     首次建立嘅日子當日「唔追討」：新捉返嚟唔應該即刻 −50 */
  function ensure(entry) {
    if (!entry) return null;
    if (!entry.pet || typeof entry.pet !== "object") entry.pet = {};
    const p = entry.pet;
    if (typeof p.health !== "number" || !isFinite(p.health)) p.health = DEFAULT_HEALTH;
    if (typeof p.streak !== "number") p.streak = 0;
    if (typeof p.lastFedDay !== "string") p.lastFedDay = "";
    if (typeof p.settledDay !== "string" || !p.settledDay) p.settledDay = dayKey();
    if (typeof p.decayDay !== "string" || !p.decayDay) {
      /* 今日已過 15:00 → 當今日已結算；未過 → 當昨日已結算，等下一個 15:00 再扣 */
      p.decayDay = minuteOfDay() >= DECAY_START ? dayKey() : shiftDay(dayKey(), -1);
    }
    return p;
  }

  /* 換入成為拍檔：由今日起計，唔追討放喺盒子期間嘅自然消耗 */
  function adoptActive(entry) {
    const p = ensure(entry);
    if (!p) return null;
    const today = dayKey();
    const yesterday = shiftDay(today, -1);
    p.settledDay = today;
    if (minuteOfDay() >= DECAY_START) {
      if (p.decayDay < today) p.decayDay = today;   // 今日扣血點已過 → 唔追討
    } else if (p.decayDay < yesterday) {
      p.decayDay = yesterday;                        // 今日未到 15:00 → 只補到昨日
    }
    touch(p);
    saveState();
    return p;
  }

  function healthOf(entry) {
    const p = ensure(entry);
    return p ? p.health : DEFAULT_HEALTH;
  }

  function isFaint(entry) {
    return healthOf(entry) <= 0;
  }

  function inWindow(now) {
    const mins = minuteOfDay(now);
    return mins >= FEED_START && mins < FEED_END;
  }

  /* 今日第一次餵食就會累積 Streak */
  function fedToday(entry) {
    const p = ensure(entry);
    return !!p && p.lastFedDay === dayKey();
  }

  /* 主畫面提示用 */
  function status(entry) {
    const p = ensure(entry);
    const frozen = clockSuspicious();
    if (!p) return { health: DEFAULT_HEALTH, faint: false, hungry: false, fed: false, streak: 0, frozen };
    return {
      health: p.health,
      faint: p.health <= 0,
      fed: p.lastFedDay === dayKey(),
      hungry: !inWindow() ? false : (p.health < 100 && p.lastFedDay !== dayKey()),
      streak: p.streak,
      windowOpen: inWindow(),
      frozen
    };
  }

  /* ---------- 每日結算（只針對當前拍檔） ----------
     - 每日 15:00 HKT 自然消耗 −50（每日一次，離線多日會逐日補扣）
     - 該日冇餵過 → streak 歸 0（唔再扣血）
     - 時鐘被倒撥 → 凍結，唔扣血（避免改鐘避罰／誤扣） */
  function runDailyCheck(now) {
    const st = loadState();
    const entry = getActiveEntry();
    if (!entry) return false;
    const fresh = !entry.pet || typeof entry.pet.settledDay !== "string" || !entry.pet.settledDay;
    /* 冇明確傳時間（即正式運行）才做時鐘守衛；測試可注入時間繞過 */
    if (now === undefined && clockSuspicious()) {
      if (fresh) { ensure(entry); saveState(); }
      return false;
    }
    const p = ensure(entry);
    const today = dayKey(now);
    const mine = minuteOfDay(now);
    let changed = false;

    const applyDecay = key => {
      if (p.decayDay >= key) return;          // 單調：唔可以倒退重扣
      if (p.health > 0) p.health = Math.max(0, p.health - DECAY_AMOUNT);
      p.decayDay = key;
      touch(p);
      changed = true;
    };

    /* 逐日補算已完結嘅日子（離線／多日冇開 App），由舊到新順序處理 */
    let key = shiftDay(p.settledDay, 1);
    for (let i = 0; i < MAX_SETTLE_DAYS && key <= today; i++) {
      const elapsed = key < today || mine >= FEED_START;   // 該日已完全過去，或今日已過 15:00
      if (!elapsed) break;

      applyDecay(key);                                   // 該日 15:00 消耗
      if (p.lastFedDay !== key) {                        // 該日冇餵 → 斷 streak
        p.streak = 0;
      }
      p.settledDay = key;
      changed = true;
      if (key === today) break;
      key = shiftDay(key, 1);
    }

    /* 今日 15:00 自然消耗（最後做，避免同上面 loop 重複扣） */
    if (mine >= DECAY_START) applyDecay(today);

    if (changed || fresh) saveState();
    return changed;
  }

  /* 距離下一個 15:00 HKT 仲有幾多毫秒（排程用，唔需要輪詢） */
  function msUntilNextDecay() {
    const t = new Date(nowTs() + HKT_MS);
    const mins = t.getUTCHours() * 60 + t.getUTCMinutes();
    const ms = (FEED_START - mins) * 60 * 1000 - t.getUTCSeconds() * 1000 - t.getUTCMilliseconds();
    return ms > 0 ? ms : ms + 24 * 3600 * 1000;
  }

  /* ---------- 背包 ---------- */
  function items() {
    const st = loadState();
    if (!st.items || typeof st.items !== "object") st.items = {};
    ITEM_KINDS.forEach(k => {
      if (typeof st.items[k] !== "number" || !isFinite(st.items[k])) st.items[k] = 0;
    });
    return st.items;
  }

  function addItem(kind, n = 1) {
    if (!ITEM_KINDS.includes(kind)) return;
    const bag = items();
    bag[kind] = Math.max(0, bag[kind] + n);
    saveState();
  }

  function countOf(kind) {
    return items()[kind] || 0;
  }

  /* ---------- 使用道具 ---------- */
  function canUse(kind, entry, now) {
    const p = ensure(entry);
    if (!p || countOf(kind) <= 0) return false;
    if (STONE_KINDS.includes(kind)) return canStoneEvolve(entry, kind).ok;
    if (kind === "revive") return p.health <= 0;
    if (p.health <= 0) return false;           // 食物救唔到 Faint
    if (!inWindow(now)) return false;          // 只限 15:00–20:59 HKT
    return p.health < 100;                     // 血滿停餵
  }

  /* 回傳 { ok, msg, heal }；進化石成功時另有 evolvedFrom / evolvedTo / branch / stone */
  function useItem(kind, entry, now) {
    const p = ensure(entry);
    if (!p) return { ok: false, msg: "No partner" };
    if (countOf(kind) <= 0) return { ok: false, msg: "No item left" };
    if (STONE_KINDS.includes(kind)) {
      const check = canStoneEvolve(entry, kind);
      if (!check.ok) return check;
      addItem(kind, -1);
      entry.stone = kind;
      saveState();
      const evo = addEntryExp(entry, 0);
      if (!evo.evolvedTo) return { ok: false, msg: "Evolution could not start" };
      return {
        ok: true,
        msg: `${evo.evolvedTo.name} is here!`,
        evolvedFrom: evo.evolvedFrom,
        evolvedTo: evo.evolvedTo,
        branch: entry.branch,
        stone: kind
      };
    }
    if (kind === "revive") {
      if (p.health > 0) return { ok: false, msg: "Revival only works when fainted" };
      addItem("revive", -1);
      p.health = DEFAULT_HEALTH;
      if (p.lastFedDay !== dayKey()) { p.lastFedDay = dayKey(); p.streak++; }
      touch(p);
      saveState();
      return { ok: true, msg: "Revived!", heal: DEFAULT_HEALTH };
    }
    if (p.health <= 0) return { ok: false, msg: "Food cannot wake a fainted Pokémon" };
    if (!inWindow(now)) return { ok: false, msg: "Feeding window is 15:00–20:59 (HKT)" };
    if (p.health >= 100) return { ok: false, msg: "Health is full — no need to feed" };

    const heal = kind === "premium" ? 50 : 25;
    addItem(kind, -1);
    p.health = Math.min(100, p.health + heal);
    if (p.lastFedDay !== dayKey()) { p.lastFedDay = dayKey(); p.streak++; }
    touch(p);
    saveState();
    return { ok: true, msg: `+${heal} HP`, heal };
  }

  /* ---------- 回合掉落 ---------- */
  function rollDrops(perfect) {
    const drops = [];
    if (perfect) {
      addItem("revive", 1);
      drops.push({ kind: "revive", label: "💊 Revival +1" });
      addItem("premium", 1);
      drops.push({ kind: "premium", label: "🍱 Premium Food +1" });
      if (Math.random() < 0.10) {
        addItem("revive", 1);
        drops.push({ kind: "revive", label: "💊 Revival +1 (bonus)" });
      }
    } else {
      addItem("food", 1);
      drops.push({ kind: "food", label: "🥣 Food +1" });
      if (Math.random() < 0.10) {
        addItem("revive", 1);
        drops.push({ kind: "revive", label: "💊 Revival +1" });
      }
    }
    /* 進化石：每回合獨立 10%，掉落時 5 種各 20% */
    if (Math.random() < 0.10) {
      const stone = STONE_KINDS[Math.floor(Math.random() * STONE_KINDS.length)];
      addItem(stone, 1);
      drops.push({ kind: stone, label: `${STONE_ICONS[stone]} ${STONE_LABELS[stone]} +1` });
    }
    return drops;
  }

  return {
    ensure, adoptActive, healthOf, isFaint, inWindow, fedToday, status,
    runDailyCheck, msUntilNextDecay, items, addItem, countOf, canUse, useItem, rollDrops,
    dayKey, minuteOfDay,
    setClockOffset, clockOffset, clockSuspicious,
    ITEM_KINDS,
    LIMITS: { FEED_START, FEED_END, DECAY_START, DECAY_AMOUNT, DEFAULT_HEALTH, HKT_MS }
  };
})();

window.Pet = Pet;
