/* ============================================================
   PokeEngmon - 儲存層（LocalStorage）
   ============================================================ */

const STORAGE_KEY = "pokeengmon_state_v1";

/* 預設狀態 */
function defaultState() {
  return {
    device_id: "",           // 匿名裝置 ID（首次啟動生成 UUID，供 Supabase 同步用）
    playerName: "The PokéEngmon Trainer",
    nameCustomized: false,   // 用戶自己改過名就唔會被預設名覆蓋
    diamonds: 0,
    normalPulls: 0,          // 普通抽次數
    totalSets: 0,            // 累積完成組數
    totalCorrect: 0,
    totalQuestions: 0,
    bestStreak: 0,           // 連續練習日數
    entries: [],             // 擁有嘅 Pokemon { uid, chainKey, stage, exp, branch?, ownedSpecies:[dexId], obtainedAt }
    activeUid: null,         // 目前拍檔（練經驗目標）
    records: {},             // "YYYY-MM-DD" -> [ {ts, duration, score, total, results:[{qid, chosen, correct}]} ]
    customQuestions: []      // 家長用 CSV 匯入嘅自訂題目
    /* SM-2 SRS 狀態已遷移至 js/sm2.js 使用 LocalStorage (pokeengmon_sm2_cards_v2) */
  };
}

let _state = null;

function loadState() {
  if (_state) return _state;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    _state = raw ? Object.assign(defaultState(), JSON.parse(raw)) : defaultState();
  } catch (e) {
    _state = defaultState();
  }
  return _state;
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(_state));
  } catch (e) { console.warn("save failed", e); }
}

function resetState() {
  _state = defaultState();
  saveState();
}

/* 由備份 JSON 還原（覆蓋目前進度） */
function importState(data) {
  _state = Object.assign(defaultState(), data);
  saveState();
  return _state;
}

/* ---------- 日期 key（本地時區） ---------- */
function dateKey(ts) {
  const d = ts ? new Date(ts) : new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/* ---------- Pokemon 擁有記錄 ---------- */
function uidGen() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

/* 新獲得 Pokemon（抽獎結果）。
   重複 → 得到 1 點自由分配 EV；稀有抽先會額外送 1 粒糖果。
   回傳 {entry, isDupe, evGain, candyGain} */
function obtainPokemon(chainKey, mode) {
  const st = loadState();
  const chain = EVOLUTION_CHAINS.find(c => c.key === chainKey);
  const existing = st.entries.find(e => e.chainKey === chainKey);
  if (existing) {
    ensureEntryPokemonData(existing);
    existing.dupes = (existing.dupes || 0) + 1;
    existing.evPoints = (existing.evPoints || 0) + 1;
    const candyGain = mode === "rare" ? 1 : 0;
    existing.candies = (existing.candies || 0) + candyGain;
    existing.stars = Math.min(5, 1 + Math.floor(existing.dupes / 5));
    /* 唔再自動切換拍檔；只係冇拍檔時先指派 */
    if (!st.entries.some(e => e.uid === st.activeUid)) st.activeUid = existing.uid;
    saveState();
    return { entry: existing, isDupe: true, evGain: 1, candyGain };
  }
  const dexId = chain.stages[0][0];
  const entry = {
    uid: uidGen(),
    chainKey: chainKey,
    stage: 1,
    exp: 0,
    level: 1,
    ivs: randomIvs(),
    evs: emptyEvs(),
    evPoints: 0,
    nature: randomNature(),
    moves: initialMoves(dexId),
    candies: 0,
    dupes: 0,
    stars: 1,
    ownedSpecies: [dexId],
    obtainedAt: Date.now()
  };
  st.entries.push(entry);
  /* 唔再自動切換拍檔；只係冇拍檔時先指派（例如第一隻） */
  if (!st.entries.some(e => e.uid === st.activeUid)) st.activeUid = entry.uid;
  saveState();
  return { entry, isDupe: false };
}

/* 用 1 點自由 EV 加落某項能力（每項上限 252、總和上限 510） */
function addEvPoint(entry, statKey) {
  ensureEntryPokemonData(entry);
  if (!STAT_KEYS.includes(statKey)) return false;
  if ((entry.evPoints || 0) <= 0) return false;
  if ((entry.evs[statKey] || 0) >= MAX_EV) return false;
  if (evTotal(entry.evs) >= MAX_EV_TOTAL) return false;
  entry.evs[statKey] = (entry.evs[statKey] || 0) + 1;
  entry.evPoints -= 1;
  saveState();
  return true;
}

/* 加 EXP（照 PokéAPI 經驗表升級）→ 可能學招式／進化
   回傳 {levelsGained, learned:[{level,move}], evolvedTo, entry} */
function addEntryExp(entry, amount) {
  const st = loadState();
  ensureEntryPokemonData(entry);
  const chain = EVOLUTION_CHAINS.find(c => c.key === entry.chainKey);
  const maxStage = chainMaxStage(chain);
  const dexId = entryCurrentSpecies(entry)[0];
  const oldLevel = entry.level;

  entry.exp = (entry.exp || 0) + amount;
  let lv = levelFromExp(dexId, entry.exp);
  if (lv > MAX_LEVEL) lv = MAX_LEVEL;
  entry.level = Math.max(entry.level, lv);

  const learned = entry.level > oldLevel
    ? movesBetween(dexId, oldLevel, entry.level, entry.moves)
    : [];

  let evolvedTo = null;
  while (entry.stage < maxStage) {
    let nextStageArr;
    if (entry.stage < chain.stages.length) {
      nextStageArr = chain.stages[entry.stage];              // 線性進化
    } else {
      const bi = entry.stage - chain.stages.length;          // 分支進化（伊貝）
      const opts = chain.branches[bi];
      if (entry.branch == null) entry.branch = Math.floor(Math.random() * opts.length);
      nextStageArr = opts[entry.branch];
    }
    const fromDex = entryCurrentSpecies(entry)[0];
    const evo = ((dexOf(fromDex) || {}).evolvesTo || []).find(x => x.id === nextStageArr[0]);
    const needLevel = (evo && evo.minLevel) || 30;           // 道具／親密度進化 → 30 級
    if (entry.level < needLevel) break;

    entry.stage += 1;
    const newDex = nextStageArr[0];
    if (!entry.ownedSpecies.includes(newDex)) entry.ownedSpecies.push(newDex);
    evolvedTo = SPECIES[newDex];
  }
  saveState();
  return { levelsGained: entry.level - oldLevel, learned, evolvedTo, entry };
}

/* 餵糖果：每粒糖加「升一級所需經驗」，最多餵到 Lv.99
   回傳同 addEntryExp 一樣 */
function useEntryCandy(entry, count) {
  ensureEntryPokemonData(entry);
  let used = 0;
  let result = { levelsGained: 0, learned: [], evolvedTo: null, entry };
  const n = Math.min(count || 1, entry.candies || 0);
  for (let i = 0; i < n && entry.level < MAX_LEVEL; i++) {
    const dexId = entryCurrentSpecies(entry)[0];
    const res = addEntryExp(entry, levelSpan(dexId, entry.level));
    entry.candies -= 1;
    used += 1;
    result.levelsGained += res.levelsGained;
    result.learned.push(...res.learned);
    if (res.evolvedTo) result.evolvedTo = res.evolvedTo;
  }
  saveState();
  result.used = used;
  return result;
}

/* 舊存檔升級：補齊等級／IV／EV／性格／招式／糖果 */
function migrateEntries() {
  const st = loadState();
  let changed = false;
  /* 舊存檔嘅預設名「Isaac」→ 新預設名（用戶自訂過就唔動） */
  if (!st.nameCustomized && st.playerName === "Isaac") {
    st.playerName = "The PokéEngmon Trainer";
    changed = true;
  }
  st.entries.forEach(e => {
    if (ensureEntryPokemonData(e)) changed = true;
  });
  if (changed) saveState();
}

function getEntry(uid) {
  return loadState().entries.find(e => e.uid === uid) || null;
}

function getActiveEntry() {
  const st = loadState();
  /* 拍檔優先；activeUid 失效就退返第一隻，保證有嘢練 */
  return st.entries.find(e => e.uid === st.activeUid) || st.entries[0] || null;
}

/* 已收集物種數（所有 entry 嘅 ownedSpecies 聯集） */
function collectedCount() {
  const st = loadState();
  const set = new Set();
  st.entries.forEach(e => e.ownedSpecies.forEach(id => set.add(id)));
  return set.size;
}

/* ---------- 舊 SRS（已遷移至 js/sm2.js）----------
   舊 stage-ladder 邏輯（SRS_STAGES / SRS_INTERVAL_MIN / srsRecord / srsStage /
   srsDue / updateSrs / questionKey）已完全被 SM-2 取代。
   呼叫方請改用 SM2.computeQ / SM2.upsertCard / SM2.buildSession。
*/

/* ---------- device_id 生成（首次啟動）---------- */
function ensureDeviceId() {
  const st = loadState();
  if (!st.device_id) {
    st.device_id = (
      (typeof crypto !== "undefined" && crypto.randomUUID)
        ? crypto.randomUUID()
        : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => {
            const r = (Math.random() * 16) | 0;
            return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
          })
    );
    saveState();
  }
  return st.device_id;
}

/* ---------- 練習記錄 ---------- */
function addPracticeRecord(record) {
  const st = loadState();
  const key = dateKey(record.ts);
  if (!st.records[key]) st.records[key] = [];
  st.records[key].push(record);
  st.totalSets += 1;
  st.totalCorrect += record.score;
  st.totalQuestions += record.total;
  saveState();
}

/* 計算連續練習日數 */
function calcStreak() {
  const st = loadState();
  let streak = 0;
  const d = new Date();
  for (;;) {
    const key = dateKey(d.getTime());
    if (st.records[key] && st.records[key].length > 0) {
      streak++;
      d.setDate(d.getDate() - 1);
    } else break;
  }
  return streak;
}

/* 某日組數 → 日曆顏色等級 0灰 1黃 2綠 3藍 */
function dayLevel(key) {
  const st = loadState();
  const n = st.records[key] ? st.records[key].length : 0;
  if (n <= 0) return 0;
  if (n <= 2) return 1;
  if (n <= 4) return 2;
  return 3;
}
