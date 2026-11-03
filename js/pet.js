/* ============================================================
   Pet — 電子寵物養成（只服務「當前拍檔」）
   ------------------------------------------------------------
   規則摘要：
   - 每隻 entry 帶 pet 狀態 { health 0-100, streak, lastFedDay, settledDay, updatedAt }
   - 只有當前拍檔會隨時間結算；其他 entry 嘅 health 完全凍結
   - 結算時區固定 UTC+8（HKT），唔受裝置時區影響
   - 任何時間都可以餵；血滿 100 唔可以再餵；血未滿可無限次餵
   - 自然消耗連續線性：每 25 小時 −100（每 15 分鐘 −1，整數扣、餘數累積，
     以 updatedAt 做錨點，離線再開會一次過補扣）
   - 該日冇餵過 → 日子完結後 streak 歸 0（唔再額外扣血）
   - health 0 → Faint：唔再扣血（只更新結算標記）
   - 道具：food +25、premium +50、revive（Faint 專用，回滿血）
   - 掉落：10/10 → 復活藥 1 + 高級食物 1，另有 10% 額外復活藥
            1–9   → 普通食物 1，另有 10% 復活藥
   ============================================================ */
const Pet = (() => {
  const DECAY_HP = 100;           // 連續自然消耗：每 25 小時 −100
  const DECAY_HOURS = 25;
  const MS_PER_HP = (DECAY_HOURS * 3600 * 1000) / DECAY_HP;  // 每 1 HP 所需毫秒（15 分鐘）
  const DEFAULT_HEALTH = 100;
  const MAX_SETTLE_DAYS = 60;     // 防止離線超久時無限補扣
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

  /* updatedAt 同時係連續消耗嘅時間錨點，統一用校正後時鐘 */
  function touch(p) { p.updatedAt = new Date(nowTs()).toISOString(); }

  function _anchorMs(p) {
    const t = p.updatedAt ? Date.parse(p.updatedAt) : 0;
    return (t && isFinite(t)) ? t : nowTs();
  }

  /* 由錨點起計連續消耗：整數 HP 扣減，唔夠 1 HP 嘅零頭留返下次。
     Faint（health ≤ 0）唔再扣，只推錨點。回傳有冇實際變更。 */
  function _applyDecay(p, nowMs) {
    const anchor = _anchorMs(p);
    let elapsed = nowMs - anchor;
    if (elapsed <= 0) return false;
    const cap = MAX_SETTLE_DAYS * 24 * 3600 * 1000;
    if (elapsed > cap) elapsed = cap;
    if (p.health <= 0) {
      p.updatedAt = new Date(nowMs).toISOString();
      return true;
    }
    const loss = Math.floor(elapsed / MS_PER_HP);
    if (loss <= 0) return false;
    p.health = Math.max(0, p.health - loss);
    p.decayDay = dayKey(nowMs);              // 向後兼容（雲端舊欄位照寫）
    p.updatedAt = p.health <= 0
      ? new Date(nowMs).toISOString()        // 歸零即停扣，錨點推到而家
      : new Date(anchor + loss * MS_PER_HP).toISOString();
    return true;
  }

  /* 補齊/遷移 pet 狀態（舊存檔默認滿血，唔會追溯扣血） */
  function ensure(entry) {
    if (!entry) return null;
    if (!entry.pet || typeof entry.pet !== "object") entry.pet = {};
    const p = entry.pet;
    if (typeof p.health !== "number" || !isFinite(p.health)) p.health = DEFAULT_HEALTH;
    if (typeof p.streak !== "number") p.streak = 0;
    if (typeof p.lastFedDay !== "string") p.lastFedDay = "";
    if (typeof p.settledDay !== "string" || !p.settledDay) p.settledDay = dayKey();
    if (typeof p.decayDay !== "string" || !p.decayDay) p.decayDay = dayKey();
    /* 消耗錨點：舊存檔冇 updatedAt 就由而家起計，唔追溯補扣 */
    if (typeof p.updatedAt !== "string" || !p.updatedAt) touch(p);
    return p;
  }

  /* 換入成為拍檔：錨點由而家起計，唔追討放喺盒子期間嘅自然消耗 */
  function adoptActive(entry) {
    const p = ensure(entry);
    if (!p) return null;
    p.settledDay = dayKey();
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
      hungry: p.health < 100,
      streak: p.streak,
      frozen
    };
  }

  /* ---------- 每日結算（只針對當前拍檔） ----------
     - 自然消耗連續線性 −100/25h，由 updatedAt 錨點起計，離線再開一次過補扣
     - 已完結嘅日子冇餵過 → streak 歸 0（唔再扣血）
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
    let changed = false;

    /* 逐日補算已完結嘅日子（離線／多日冇開 App）：只負責 streak */
    let key = shiftDay(p.settledDay, 1);
    for (let i = 0; i < MAX_SETTLE_DAYS && key < today; i++) {
      if (p.lastFedDay !== key) {                        // 該日冇餵 → 斷 streak
        p.streak = 0;
      }
      p.settledDay = key;
      changed = true;
      key = shiftDay(key, 1);
    }

    /* 連續自然消耗（整數扣、餘數累積） */
    const nowMs = (now !== undefined) ? _tsOf(now) : nowTs();
    if (_applyDecay(p, nowMs)) changed = true;

    if (changed || fresh) saveState();
    return changed;
  }

  /* 距離下一次 −1 HP 仲有幾多毫秒（排程用，唔需要輪詢） */
  function msUntilNextDecay() {
    const entry = getActiveEntry();
    const p = entry ? ensure(entry) : null;
    if (!p || p.health <= 0) return MS_PER_HP;
    const waited = nowTs() - _anchorMs(p);
    return MS_PER_HP - (waited % MS_PER_HP);
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
    /* 餵前先結算錨點起計嘅消耗，避免餵食動作重置錨點而蝕扣 */
    _applyDecay(p, (now !== undefined) ? _tsOf(now) : nowTs());
    if (p.health <= 0) return { ok: false, msg: "Food cannot wake a fainted Pokémon" };
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
    ensure, adoptActive, healthOf, isFaint, fedToday, status,
    runDailyCheck, msUntilNextDecay, items, addItem, countOf, canUse, useItem, rollDrops,
    dayKey, minuteOfDay,
    setClockOffset, clockOffset, clockSuspicious,
    ITEM_KINDS,
    LIMITS: { DECAY_HP, DECAY_HOURS, MS_PER_HP, DEFAULT_HEALTH, HKT_MS }
  };
})();

window.Pet = Pet;
