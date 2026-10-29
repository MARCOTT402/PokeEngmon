/* ============================================================
   PokeEngmon - 儲存層（LocalStorage）
   ============================================================ */

const STORAGE_KEY = "pokeengmon_state_v1";
/* 音量偏好獨立 key：refresh／關網再開都 keep；清進度／sign out 唔抹 */
const AUDIO_PREFS_KEY = "pokeengmon_audio_v1";

function defaultAudioPrefs() {
  return { bgm: 1, sfx: 1 };   /* 1 = 100% of designed volumes */
}

function _clamp01(n) {
  n = Number(n);
  if (!isFinite(n)) return 1;
  return Math.max(0, Math.min(1, n));
}

function loadAudioPrefs() {
  try {
    const raw = localStorage.getItem(AUDIO_PREFS_KEY);
    if (!raw) return defaultAudioPrefs();
    const o = JSON.parse(raw) || {};
    return { bgm: _clamp01(o.bgm == null ? 1 : o.bgm), sfx: _clamp01(o.sfx == null ? 1 : o.sfx) };
  } catch (e) {
    return defaultAudioPrefs();
  }
}

function saveAudioPrefs(prefs) {
  const p = {
    bgm: _clamp01(prefs && prefs.bgm),
    sfx: _clamp01(prefs && prefs.sfx)
  };
  try { localStorage.setItem(AUDIO_PREFS_KEY, JSON.stringify(p)); } catch (e) {}
  return p;
}

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
    practiceDays: {},        // "YYYY-MM-DD" -> sets count（雲端 user_practice_days）
    entries: [],             // 擁有嘅 Pokemon { uid, chainKey, stage, exp, branch?, ownedSpecies:[dexId], obtainedAt }
    activeUid: null,         // 目前拍檔（練經驗目標）
    records: {},             // "YYYY-MM-DD" -> [ {ts, duration, score, total, results:[{qid, chosen, correct}]} ]
    customQuestions: [],     // 家長用 CSV 匯入嘅自訂題目
    unlockedGen: 1,          // 世代解鎖進度：1-5；擁有該代全部鏈（連傳說）自動開下一代
    gymBadges: []            // 已領取 Gym milestone（10,20,30…）；上雲 user_account.gym_badges
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
  /* Migration: 舊 entries 嘅 uid 唔係 valid UUID，要換成 UUID 先 push 到 Supabase */
  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  let needSave = false;
  if (Array.isArray(_state.entries)) {
    _state.entries.forEach(e => {
      if (e.uid && !uuidRe.test(e.uid)) {
        const oldUid = e.uid;
        e.uid = uidGen();
        if (_state.activeUid === oldUid) _state.activeUid = e.uid;
        needSave = true;
      }
    });
  }
  if (needSave) saveState();
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
  /* Reset 必須連 SM-2 卡片與歷史一併清除，否則新開局會被舊到期卡影響 */
  try { localStorage.removeItem("pokeengmon_sm2_cards_v2"); } catch (e) {}
  try { localStorage.removeItem("pokeengmon_sm2_history_v2"); } catch (e) {}
  /* 自訂圖片題 blob 亦清（同 customQuestions 一齊冇咗） */
  if (typeof QImgDB !== "undefined" && QImgDB.clear) {
    try { QImgDB.clear(); } catch (e) {}
  }
}

/* Sign out 時清除遊戲進度，但保留 device_id（匿名追蹤用）同 customQuestions（家長匯入） */
function clearGameProgress() {
  const st = loadState();
  const keepDeviceId = st.device_id;
  const keepCustomQuestions = st.customQuestions || [];
  _state = defaultState();
  _state.device_id = keepDeviceId;
  _state.customQuestions = keepCustomQuestions;
  saveState();
  /* 清除 SM-2 卡片同歷史 */
  try { localStorage.removeItem("pokeengmon_sm2_cards_v2"); } catch (e) {}
  try { localStorage.removeItem("pokeengmon_sm2_history_v2"); } catch (e) {}
}

/* ---------- 日期 key（本地時區） ---------- */
function dateKey(ts) {
  const d = ts ? new Date(ts) : new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/* ---------- 世代解鎖 ----------
   規則：擁有該世代全部進化鏈（每條鏈至少一個 entry，連傳說）→ 開下一代。
   捕捉／抽獎池只包最高已解鎖世代。 */
const MAX_GEN = 5;

function isGenComplete(n) {
  const st = loadState();
  const owned = new Set(st.entries.map(e => e.chainKey));
  return chainsOfGen(n).every(c => owned.has(c.key));
}

/* 逐代向上檢查，回傳新解鎖嘅世代數字（冇新解鎖 → null）。
   silent=true 時唔會觸發下載/慶祝（啟動時用）。 */
function recomputeUnlockedGen() {
  const st = loadState();
  let g = st.unlockedGen || 1;
  let newly = null;
  while (g < MAX_GEN && isGenComplete(g)) {
    g += 1;
    newly = g;
  }
  if (g !== st.unlockedGen) {
    st.unlockedGen = g;
    saveState();
  }
  return newly;
}

/* ---------- Pokemon 擁有記錄 ---------- */
function uidGen() {
  /* 用 crypto.randomUUID() 產生 valid UUID v4，符合 Supabase uuid column */
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  /* Fallback for old browsers */
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === "x" ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

/* 新獲得 Pokemon（抽獎結果）。
   重複 → 得到 1 點自由分配 EV；稀有抽先會額外送 1 粒糖果。
   回傳 {entry, isDupe, evGain, candyGain} */
function obtainPokemon(chainKey, mode) {
  const st = loadState();
  const chain = EVOLUTION_CHAINS.find(c => c.key === chainKey);
  if (!chain) { console.warn("[storage] obtainPokemon: chain not found", chainKey); return null; }
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
  /* 世代解鎖檢查（新寵落地後）：新開代會回傳世代數字俾上層彈慶祝窗 + 落資料包 */
  const newlyUnlockedGen = recomputeUnlockedGen();
  return { entry, isDupe: false, newlyUnlockedGen };
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

/* 由 (chainKey, exp, dupes, branch) 重推 derived 欄位（level/stage/ownedSpecies/moves/stars）。
   純函數：唔 mutate 入參、唔 saveState。
   用途：Sync.pull() 由雲端還原 entry —— server 只對 exp/candies/ev_points/evs/dupes/ivs/branch
   權威，level/stage/moves/ownedSpecies/stars 全部係 deterministic 重推（v99 起 DB 敏感欄
   唔再俾 client 直寫，靠 RPC 改 exp 等基礎欄位）。 */
function deriveEntryFields(entry) {
  const chain = EVOLUTION_CHAINS.find(c => c.key === entry.chainKey);
  if (!chain) return entry;
  const out = { ...entry };
  const maxStage = chainMaxStage(chain);

  /* 進化 replay：同 addEntryExp 嘅 while loop 對齊
     （branch 未記錄時用 0 佔位 —— 真正 branch 喺進化發生時由 client PATCH 上雲） */
  out.stage = 1;
  out.ownedSpecies = [chain.stages[0][0]];
  while (out.stage < maxStage) {
    const curDex = entryCurrentSpecies(out)[0];
    const lv = Math.min(MAX_LEVEL, levelFromExp(curDex, Number(out.exp) || 0));
    let nextStageArr;
    if (out.stage < chain.stages.length) {
      nextStageArr = chain.stages[out.stage];            // 線性進化
    } else {
      const opts = chain.branches[out.stage - chain.stages.length];
      nextStageArr = opts[out.branch ?? 0] || opts[0];   // 分支進化（伊貝）
    }
    const evo = ((dexOf(curDex) || {}).evolvesTo || []).find(x => x.id === nextStageArr[0]);
    const needLevel = (evo && evo.minLevel) || 30;
    if (lv < needLevel) break;
    out.stage += 1;
    if (!out.ownedSpecies.includes(nextStageArr[0])) out.ownedSpecies.push(nextStageArr[0]);
  }

  /* level 用最終形態嘅 growth table 反推 */
  const finalDex = entryCurrentSpecies(out)[0];
  out.level = Math.min(MAX_LEVEL, levelFromExp(finalDex, Number(out.exp) || 0));

  /* moves：初始招 + 最終形態喺現等級內學到嘅招（近似 replay，display 用） */
  const known = initialMoves(chain.stages[0][0]);
  const learned = movesBetween(finalDex, 1, out.level, known).map(m => m.move);
  out.moves = [...new Set([...known, ...learned])];

  /* stars 由 dupes 推（同 obtainPokemon 公式對齊） */
  out.stars = Math.min(5, 1 + Math.floor((out.dupes || 0) / 5));
  return out;
}

/* server 行 → 本地 entry 形狀（v99：gacha_pull / obtain_capture 回傳嘅 row 用） */
function localEntryFromServer(e) {
  return deriveEntryFields({
    uid: e.id,
    chainKey: e.chain_key,
    exp: Number(e.exp ?? 0),
    ivs: e.ivs || {},
    evs: e.evs || {},
    evPoints: e.ev_points ?? 0,
    candies: e.candies ?? 0,
    dupes: e.dupes ?? 0,
    branch: (e.branch === 0 || e.branch) ? e.branch : null,
    obtainedAt: e.obtained_at
  });
}

/* 採用 server entry：按 chainKey 搵本地 entry，存在就以 server 值覆蓋（uid 都換 —
   server id 先係 RPC 認嘅），唔存在就新加。activeUid 指向舊 uid 會一併修正。 */
function adoptServerEntry(serverRow) {
  const st = loadState();
  const mapped = localEntryFromServer(serverRow);
  const idx = st.entries.findIndex(e => e.chainKey === mapped.chainKey);
  if (idx >= 0) {
    const old = st.entries[idx];
    mapped.nature = old.nature;   // nature 唔上雲，保留本地
    if (st.activeUid === old.uid) st.activeUid = mapped.uid;
    st.entries[idx] = mapped;
  } else {
    st.entries.push(mapped);
    if (!st.entries.some(e => e.uid === st.activeUid)) st.activeUid = mapped.uid;
  }
  saveState();
  /* server 派寵（gacha_pull / obtain_capture RPC）落地後都要檢查世代解鎖 */
  recomputeUnlockedGen();
  return mapped;
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
    /* v113：修復舊存檔（Sync.pull 喺 POKEMON_DEX 就緒前跑過，moves 被寫成 []）。
       migrateEntries 喺 loadPokemonDex 之後先跑（app.js:1105），所以呢度可以安全重推。
       用 deriveEntryFields 而非 initialMoves，先至包含升級學到嘅招（lv>1 啱）。 */
    if ((!e.moves || e.moves.length === 0) && typeof POKEMON_DEX !== "undefined" && POKEMON_DEX) {
      e.moves = deriveEntryFields(e).moves;
      changed = true;
    }
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
  st.entries.forEach(e => {
    if (!Array.isArray(e.ownedSpecies)) ensureEntryPokemonData(e);
    (e.ownedSpecies || []).forEach(id => set.add(id));
  });
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
  /* 日曆色階：確保當日至少有一筆「有練習」標記（雲端合併用） */
  if (!st.practiceDays) st.practiceDays = {};
  st.practiceDays[key] = (st.practiceDays[key] || 0) + 1;
  const streak = calcStreak();
  if (streak > (st.bestStreak || 0)) st.bestStreak = streak;
  saveState();
  if (window.SupabaseAuth && SupabaseAuth.isLoggedIn()) {
    if (SupabaseAuth.upsertPracticeDay) {
      SupabaseAuth.upsertPracticeDay(key, 1).catch(e => console.warn("[practice] upsert day:", e));
    }
    /* 上傳整組明細，換裝置／換帳戶後日曆可以完整還原 */
    if (SupabaseAuth.savePracticeRecord) {
      SupabaseAuth.savePracticeRecord({
        ts: record.ts,
        day: key,
        duration: record.duration || 0,
        score: record.score || 0,
        total: record.total || 0,
        results: record.results || []
      }).catch(e => console.warn("[practice] save record:", e));
    }
    if (SupabaseAuth.reportBestStreak) {
      SupabaseAuth.reportBestStreak(st.bestStreak || streak).catch(() => {});
    }
  }
}

/* 計算連續練習日數（今日未練則由昨日起計，streak 仍存活） */
function calcStreak() {
  const st = loadState();
  const hasDay = (key) => {
    if (st.records[key] && st.records[key].length > 0) return true;
    if (st.practiceDays && st.practiceDays[key] > 0) return true;
    return false;
  };
  let streak = 0;
  const d = new Date();
  if (!hasDay(dateKey(d.getTime()))) d.setDate(d.getDate() - 1);
  for (;;) {
    const key = dateKey(d.getTime());
    if (hasDay(key)) {
      streak++;
      d.setDate(d.getDate() - 1);
    } else break;
  }
  return streak;
}

/* 合併雲端 practice days（只補「有練習」日，唔覆寫本地 set 詳情） */
function mergePracticeDaysFromCloud(rows) {
  if (!Array.isArray(rows) || !rows.length) return;
  const st = loadState();
  if (!st.practiceDays) st.practiceDays = {};
  rows.forEach(r => {
    const day = r.day || r.Day;
    const sets = Number(r.sets || r.Sets || 0);
    if (!day || sets <= 0) return;
    const key = String(day).slice(0, 10);
    st.practiceDays[key] = Math.max(st.practiceDays[key] || 0, sets);
    if (!st.records[key]) st.records[key] = [];
    /* 日曆 dayLevel 靠 records.length；若本地無 set 詳情，塞 placeholder 令色階非灰 */
    if (st.records[key].length === 0) {
      for (let i = 0; i < Math.min(sets, 5); i++) {
        st.records[key].push({ ts: Date.parse(key + "T12:00:00Z") || Date.now(), duration: 0, score: 0, total: 0, results: [], _cloud: true });
      }
    }
  });
  const streak = calcStreak();
  if (streak > (st.bestStreak || 0)) st.bestStreak = streak;
  saveState();
}

/* 合併雲端練習明細（user_practice_records）：換裝置／換帳戶後還原日曆詳情。
   以 ts 去重；同日有真明細時，舊嘅 _cloud placeholder 會被移除避免重複。 */
function mergeRecordsFromCloud(rows) {
  if (!Array.isArray(rows) || !rows.length) return 0;
  const st = loadState();
  if (!st.records) st.records = {};
  let added = 0;
  rows.forEach(r => {
    const ts = Number(r.ts);
    if (!ts || !isFinite(ts)) return;
    const key = r.day ? String(r.day).slice(0, 10) : dateKey(ts);
    if (!Array.isArray(st.records[key])) st.records[key] = [];
    if (st.records[key].some(x => Number(x.ts) === ts)) return;
    st.records[key].push({
      ts,
      duration: Number(r.duration || 0),
      score: Number(r.score || 0),
      total: Number(r.total || 0),
      results: Array.isArray(r.results) ? r.results : [],
      _cloud: true
    });
    added++;
  });
  if (!added) return 0;
  Object.keys(st.records).forEach(key => {
    const list = st.records[key];
    if (!Array.isArray(list) || !list.length) return;
    const hasReal = list.some(x => !x._cloud || x.total > 0 || (x.results && x.results.length));
    if (hasReal) {
      st.records[key] = list.filter(x =>
        !(x._cloud && x.total === 0 && (!x.results || !x.results.length)));
      st.records[key].sort((a, b) => Number(a.ts) - Number(b.ts));
    }
    if (!st.practiceDays) st.practiceDays = {};
    st.practiceDays[key] = Math.max(st.practiceDays[key] || 0, st.records[key].length);
  });
  saveState();
  return added;
}

/* 某日組數 → 日曆顏色等級 0灰 1黃 2綠 3藍 */
function dayLevel(key) {
  const st = loadState();
  const nRec = st.records[key] ? st.records[key].length : 0;
  const nDay = (st.practiceDays && st.practiceDays[key]) || 0;
  const n = Math.max(nRec, nDay);
  if (n <= 0) return 0;
  if (n <= 2) return 1;
  if (n <= 4) return 2;
  return 3;
}
