/* ============================================================
   PokeEngmon - 儲存層（LocalStorage）
   ============================================================ */

const STORAGE_KEY = "pokeengmon_state_v1";

/* 預設狀態 */
function defaultState() {
  return {
    playerName: "Isaac",
    diamonds: 0,
    normalPulls: 0,          // 普通抽次數
    totalSets: 0,            // 累積完成組數
    totalCorrect: 0,
    totalQuestions: 0,
    bestStreak: 0,           // 連續練習日數
    entries: [],             // 擁有嘅 Pokemon { uid, chainKey, stage, exp, branch?, ownedSpecies:[dexId], obtainedAt }
    activeUid: null,         // 最近獲得（練經驗目標）
    records: {},             // "YYYY-MM-DD" -> [ {ts, duration, score, total, results:[{qid, chosen, correct}]} ]
    customQuestions: [],      // 家長用 CSV 匯入嘅自訂題目
    srs: {}                   // 記憶曲線（隱藏）：題目 key → { stage, lastAt, dueAt }
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

/* 新獲得 Pokemon（抽獎結果）。重複 → 轉為糖果＋EV，回傳 {entry, isDupe} */
function obtainPokemon(chainKey) {
  const st = loadState();
  const chain = EVOLUTION_CHAINS.find(c => c.key === chainKey);
  const existing = st.entries.find(e => e.chainKey === chainKey);
  if (existing) {
    ensureEntryPokemonData(existing);
    existing.dupes = (existing.dupes || 0) + 1;
    existing.candies = (existing.candies || 0) + 1;
    existing.stars = Math.min(5, 1 + Math.floor(existing.dupes / 5));
    /* 重複抽到 → 每項能力 +1 EV（受 252／總和 510 上限） */
    STAT_KEYS.forEach(k => {
      if ((existing.evs[k] || 0) < MAX_EV && evTotal(existing.evs) < MAX_EV_TOTAL) {
        existing.evs[k] = (existing.evs[k] || 0) + 1;
      }
    });
    st.activeUid = existing.uid;
    saveState();
    return { entry: existing, isDupe: true };
  }
  const dexId = chain.stages[0][0];
  const entry = {
    uid: uidGen(),
    chainKey: chainKey,
    stage: 1,
    exp: 0,
    level: 1,
    ivs: emptyIvs(),
    evs: emptyEvs(),
    nature: randomNature(),
    moves: initialMoves(dexId),
    candies: 0,
    dupes: 0,
    stars: 1,
    ownedSpecies: [dexId],
    obtainedAt: Date.now()
  };
  st.entries.push(entry);
  st.activeUid = entry.uid;
  saveState();
  return { entry, isDupe: false };
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
  return st.entries.find(e => e.uid === st.activeUid) || null;
}

/* 已收集物種數（所有 entry 嘅 ownedSpecies 聯集） */
function collectedCount() {
  const st = loadState();
  const set = new Set();
  st.entries.forEach(e => e.ownedSpecies.forEach(id => set.add(id)));
  return set.size;
}

/* ---------- 記憶曲線（間隔重複，隱藏功能） ----------
   stage 0 → 0.5 → 1 → 2 → 7 → 14 → 30
   答對升一級，答錯一律返 stage 0；stage 30 答對維持 30
   各階段最少要相隔指定分鐘先可以再答 */
const SRS_STAGES = [0, 0.5, 1, 2, 7, 14, 30];
const SRS_INTERVAL_MIN = { 0: 0, 0.5: 20, 1: 1440, 2: 2880, 7: 10080, 14: 20160, 30: 43200 };

function srsRecord(q) {
  return loadState().srs[questionKey(q)] || null;
}

function srsStage(q) {
  const r = srsRecord(q);
  return r && typeof r.stage === "number" ? r.stage : 0;
}

/* 夠鐘未？未做過 = 即時可以答 */
function srsDue(q, now) {
  const r = srsRecord(q);
  return !r || r.dueAt <= (now || Date.now());
}

/* 答題後更新階段 */
function updateSrs(q, correct, now) {
  const st = loadState();
  const key = questionKey(q);
  const rec = st.srs[key] || { stage: 0 };
  const t = now || Date.now();
  let next = 0;
  if (correct) {
    const i = SRS_STAGES.indexOf(rec.stage);
    next = SRS_STAGES[Math.min(i + 1, SRS_STAGES.length - 1)];
  }
  st.srs[key] = {
    stage: next,
    lastAt: t,
    dueAt: t + (SRS_INTERVAL_MIN[next] || 0) * 60000
  };
  saveState();
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
