/* ============================================================
   Pet — 電子寵物養成（只服務「當前拍檔」）
   ------------------------------------------------------------
   規則摘要：
   - 每隻 entry 帶 pet 狀態 { health 0-100, streak, lastFedDay, settledDay }
   - 只有當前拍檔會隨時間結算；其他 entry 嘅 health 完全凍結
   - 進食時段 15:00–20:59；血滿 100 唔可以再餵；血未滿可無限次餵
   - 21:00 結算：該日冇餵過 → health −50、streak 歸 0
   - health 0 → Faint：灰白、答題 EXP = 0、必須用復活藥
   - 道具：food +25、premium +50、revive（Faint 專用，回滿血）
   - 掉落：10/10 → 復活藥 1 + 高級食物 1，另有 10% 額外復活藥
            1–9   → 普通食物 1，另有 10% 復活藥
   ============================================================ */
const Pet = (() => {
  const FEED_START = 15 * 60;     // 15:00
  const FEED_END = 21 * 60;       // 21:00
  const MISS_PENALTY = 50;
  const DEFAULT_HEALTH = 100;
  const MAX_SETTLE_DAYS = 60;     // 防止離線超久時無限 loop
  const ITEM_KINDS = ["food", "premium", "revive"];

  function pad(n) { return String(n).padStart(2, "0"); }

  /* 本機時區的 "YYYY-MM-DD" */
  function dayKey(d = new Date()) {
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  function shiftDay(key, delta) {
    const [y, m, d] = key.split("-").map(Number);
    const dt = new Date(y, m - 1, d + delta);
    return dayKey(dt);
  }

  /* 補齊/遷移 pet 狀態（舊存檔默認滿血，唔會追溯扣血） */
  function ensure(entry) {
    if (!entry) return null;
    if (!entry.pet || typeof entry.pet !== "object") entry.pet = {};
    const p = entry.pet;
    if (typeof p.health !== "number" || !isFinite(p.health)) p.health = DEFAULT_HEALTH;
    if (typeof p.streak !== "number") p.streak = 0;
    if (typeof p.lastFedDay !== "string") p.lastFedDay = "";
    if (typeof p.settledDay !== "string" || !p.settledDay) p.settledDay = shiftDay(dayKey(), -1);
    return p;
  }

  function healthOf(entry) {
    const p = ensure(entry);
    return p ? p.health : DEFAULT_HEALTH;
  }

  function isFaint(entry) {
    return healthOf(entry) <= 0;
  }

  function inWindow(now = new Date()) {
    const mins = now.getHours() * 60 + now.getMinutes();
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
    if (!p) return { health: DEFAULT_HEALTH, faint: false, hungry: false, fed: false, streak: 0 };
    return {
      health: p.health,
      faint: p.health <= 0,
      fed: p.lastFedDay === dayKey(),
      hungry: !inWindow() ? false : (p.health < 100 && p.lastFedDay !== dayKey()),
      streak: p.streak,
      windowOpen: inWindow()
    };
  }

  /* ---------- 每日結算（只針對當前拍檔） ---------- */
  function runDailyCheck(now = new Date()) {
    const st = loadState();
    const entry = getActiveEntry();
    if (!entry) return false;
    const fresh = !entry.pet || typeof entry.pet.settledDay !== "string" || !entry.pet.settledDay;
    const p = ensure(entry);
    const today = dayKey(now);
    const mine = now.getHours() * 60 + now.getMinutes();
    let changed = false;

    let key = shiftDay(p.settledDay, 1);
    for (let i = 0; i < MAX_SETTLE_DAYS && key <= today; i++) {
      const isToday = key === today;
      const closedToday = isToday && mine >= FEED_END;
      const isPast = key < today;
      if (!isPast && !closedToday) break;      // 今日未到 21:00，未需要結算

      if (p.lastFedDay !== key && p.health < DEFAULT_HEALTH) {
        /* 血滿（100）代表「冇嘢需要餵」，唔當作漏餐；
           只有血未滿而當日冇餵過才扣 50 並斷 streak */
        p.health = Math.max(0, p.health - MISS_PENALTY);
        p.streak = 0;
        changed = true;
      }
      p.settledDay = key;
      changed = true;
      if (isToday) break;
      key = shiftDay(key, 1);
    }
    if (changed || fresh) saveState();
    return changed;
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
  function canUse(kind, entry, now = new Date()) {
    const p = ensure(entry);
    if (!p || countOf(kind) <= 0) return false;
    if (kind === "revive") return p.health <= 0;
    if (p.health <= 0) return false;           // 食物救唔到 Faint
    if (!inWindow(now)) return false;          // 只限 15:00–20:59
    return p.health < 100;                     // 血滿停餵
  }

  /* 回傳 { ok, msg, heal } */
  function useItem(kind, entry, now = new Date()) {
    const p = ensure(entry);
    if (!p) return { ok: false, msg: "No partner" };
    if (countOf(kind) <= 0) return { ok: false, msg: "No item left" };
    if (kind === "revive") {
      if (p.health > 0) return { ok: false, msg: "Revival only works when fainted" };
      addItem("revive", -1);
      p.health = DEFAULT_HEALTH;
      if (p.lastFedDay !== dayKey()) { p.lastFedDay = dayKey(); p.streak++; }
      saveState();
      return { ok: true, msg: "Revived!", heal: DEFAULT_HEALTH };
    }
    if (p.health <= 0) return { ok: false, msg: "Food cannot wake a fainted Pokémon" };
    if (!inWindow(now)) return { ok: false, msg: "Feeding window is 15:00–20:59" };
    if (p.health >= 100) return { ok: false, msg: "Health is full — no need to feed" };

    const heal = kind === "premium" ? 50 : 25;
    addItem(kind, -1);
    p.health = Math.min(100, p.health + heal);
    if (p.lastFedDay !== dayKey()) { p.lastFedDay = dayKey(); p.streak++; }
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
    return drops;
  }

  return {
    ensure, healthOf, isFaint, inWindow, fedToday, status,
    runDailyCheck, items, addItem, countOf, canUse, useItem, rollDrops,
    dayKey, ITEM_KINDS,
    LIMITS: { FEED_START, FEED_END, DEFAULT_HEALTH }
  };
})();

window.Pet = Pet;
