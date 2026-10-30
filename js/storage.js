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
    gymBadges: [],           // 已領取 Gym milestone（10,20,30…）；上雲 user_account.gym_badges
    items: {
      food: 0, premium: 0, revive: 0,
      thunder: 0, moon: 0, fire: 0, leaf: 0, water: 0
    },   // 電子寵物背包（目前只存本機，未上雲）
    trainerLikes: 0,        // 未來 leaderboard likes；≥20 = trade 進化條件
    moveLoadouts: {},       // uid -> [招式 slug ×≤4]：玩家自訂持有招式（pull 重推後還原用）
    curveMode: "standard"   // 遺忘曲線模式：standard / junior / teen / adult
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
  /* 套用遺忘曲線模式到 SM-2 */
  try { if (window.SM2 && SM2.setMode) SM2.setMode(_state.curveMode || "standard"); } catch (e) {}
  return _state;
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(_state));
    if (window.SM2 && SM2.setMode) SM2.setMode(_state.curveMode || "standard");
  } catch (e) {}
}

function getCurveMode() {
  return (loadState().curveMode) || "standard";
}

function setCurveMode(mode) {
  const st = loadState();
  st.curveMode = mode;
  saveState();
  try { if (window.SM2 && SM2.setMode) SM2.setMode(mode); } catch (e) {}
  return mode;
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
  /* dupe 目標：同鏈第一隻「未完全進化」嘅 entry。
     全部完全進化咗（例如 Eevee → Flareon 後再捉 Eevee）→ 開新 entry，
     等玩家可以集齊分支進化（Vaporeon / Jolteon / Flareon） */
  const existing = st.entries.find(e => e.chainKey === chainKey && !isEntryFullyEvolved(e));
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
    knownMoves: initialMoves(dexId),   // 招式池：等級夠學嘅全部招（配招嘅來源）
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

/* ---------- 進化石 / 官方進化條件 ---------- */
const STONE_KINDS = ["thunder", "moon", "fire", "leaf", "water"];
const STONE_LABELS = {
  thunder: "Thunder Stone", moon: "Moon Stone", fire: "Fire Stone",
  leaf: "Leaf Stone", water: "Water Stone"
};
const STONE_ICONS = { thunder: "⚡", moon: "🌙", fire: "🔥", leaf: "🍃", water: "💧" };
/* PokéAPI item slug → 本作道具 key */
const STONE_ITEM_MAP = {
  "thunder-stone": "thunder", "moon-stone": "moon", "fire-stone": "fire",
  "leaf-stone": "leaf", "water-stone": "water"
};
const TRADE_LIKES_REQUIRED = 20;

function stoneKindOfItem(item) {
  return STONE_ITEM_MAP[item] || null;
}

/* 某隻物種進化到 target 的官方條件（evolvesTo 一筆） */
function evolutionDetail(fromDex, target, branchIndex) {
  const evo = ((dexOf(fromDex) || {}).evolvesTo || []).find(x => x.id === target[0]) || null;
  const trigger = (evo && evo.trigger) || "level-up";
  const stone = trigger === "use-item" ? stoneKindOfItem(evo && evo.item) : null;
  let needLevel = 0;
  if (trigger === "level-up") needLevel = (evo && evo.minLevel) || 30;
  else if (trigger !== "trade" && !stone) needLevel = (evo && evo.minLevel) || 30;  // 其他道具／特殊進化：維持近似
  return {
    target,
    branchIndex: branchIndex == null ? null : branchIndex,
    needLevel,
    stone,
    trade: trigger === "trade"
  };
}

/* 下一個進化（官方條件）。伊貝未揀分支時 target = null、options 列出所有石選項。 */
function entryNextEvolution(entry) {
  const chain = EVOLUTION_CHAINS.find(c => c.key === entry.chainKey);
  if (!chain) return null;
  const maxStage = chainMaxStage(chain);
  const stage = Math.max(1, Number(entry.stage) || 1);
  if (stage >= maxStage) return null;
  const fromDex = entryCurrentSpecies(entry)[0];

  if (stage < chain.stages.length) {
    const target = chain.stages[stage];
    return Object.assign({ fromDex, options: [] }, evolutionDetail(fromDex, target, null));
  }

  const bi = stage - chain.stages.length;
  const opts = (chain.branches && chain.branches[bi]) || [];
  if (!opts.length) return null;
  const options = opts.map((target, idx) => evolutionDetail(fromDex, target, idx));
  let chosen = null;
  if (entry.branch != null && options[entry.branch]) {
    chosen = options[entry.branch];
  } else if (entry.stone) {
    chosen = options.find(o => o.stone && o.stone === entry.stone) || null;
  }
  if (chosen) return Object.assign({ fromDex, options }, chosen);
  return { fromDex, target: null, branchIndex: null, needLevel: 0, stone: null, trade: false, options };
}

/* 條件是否全部達成（等級／石／likes） */
function canEvolveNow(entry, info) {
  if (!info || !info.target) return false;
  if (info.trade) return (loadState().trainerLikes || 0) >= TRADE_LIKES_REQUIRED;
  if (info.stone) {
    /* 舊存檔：branch 已記錄但未有 stone_used → 當已用石 */
    if (info.branchIndex != null && entry.branch != null) return true;
    return entry.stone === info.stone;
  }
  return (entry.level || 1) >= (info.needLevel || 0);
}

/* 用某粒石能否令呢隻進化（Partner Care 道具 tile 用） */
function canStoneEvolve(entry, kind) {
  if (!entry) return { ok: false, msg: "No partner" };
  const info = entryNextEvolution(entry);
  if (!info) return { ok: false, msg: "Already fully evolved" };
  const name = (SPECIES[info.fromDex] || {}).name || "This Pokémon";
  const candidates = info.target ? [info] : (info.options || []);

  const match = candidates.find(o => o.target && o.stone === kind);
  if (match) {
    return { ok: true, msg: "Ready to evolve!", target: match.target, branchIndex: match.branchIndex };
  }
  const needed = candidates.find(o => o.target && o.stone);
  if (needed) return { ok: false, msg: `${name} needs a ${STONE_LABELS[needed.stone]}` };
  if (candidates.some(o => o.target && o.trade)) {
    return { ok: false, msg: `${name} needs ${TRADE_LIKES_REQUIRED} likes to evolve` };
  }
  if (info.target && !info.stone) {
    return { ok: false, msg: `${name} evolves by level, not with a stone` };
  }
  return { ok: false, msg: `That stone has no effect on ${name}` };
}

/* 加 EXP（照 PokéAPI 經驗表升級）→ 可能學招式／進化
   回傳 {levelsGained, learned, evolvedFrom, evolvedTo, entry} */
/* 完全進化？（stage 到達鏈上限）。呢個旗幟決定「再抽到同一條鏈」係 dupe 定開新 entry */
function isEntryFullyEvolved(entry) {
  const chain = EVOLUTION_CHAINS.find(c => c.key === entry.chainKey);
  if (!chain) return true;
  return (Number(entry.stage) || 1) >= chainMaxStage(chain);
}

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

  /* 「學過」以招式池 + 持有為準：pool 有嘅招唔會再當新學（否則換出嘅招升級時會重複彈學招） */
  const knownSet = [...new Set([...(entry.knownMoves || []), ...(entry.moves || [])])];
  const learned = entry.level > oldLevel
    ? movesBetween(dexId, oldLevel, entry.level, knownSet)
    : [];
  /* 招式池即時更新：等級夠學嘅招即時入池（持有 4 招唔變，由玩家喺圖鑑配） */
  if (learned.length) {
    if (!Array.isArray(entry.knownMoves)) entry.knownMoves = (entry.moves || []).slice();
    const pool = new Set(entry.knownMoves);
    learned.forEach(m => { if (!pool.has(m.move)) { pool.add(m.move); entry.knownMoves.push(m.move); } });
  }

  let evolvedFrom = null;
  let evolvedTo = null;
  while (entry.stage < maxStage) {
    const info = entryNextEvolution(entry);
    if (!info || !info.target) break;
    if (!canEvolveNow(entry, info)) break;

    const fromDex = entryCurrentSpecies(entry)[0];
    if (info.branchIndex != null && entry.branch == null) entry.branch = info.branchIndex;
    entry.stage += 1;
    const newDex = info.target[0];
    if (!entry.ownedSpecies.includes(newDex)) entry.ownedSpecies.push(newDex);
    if (evolvedFrom == null) evolvedFrom = fromDex;
    evolvedTo = SPECIES[newDex];
  }
  entry.isFinal = isEntryFullyEvolved(entry);
  saveState();
  /* 完全進化 → 標記上雲：server RPC（gacha_pull / obtain_capture）靠 is_final
     決定下一隻同鏈寵係 dupe 定開新 row */
  if (evolvedTo && entry.isFinal && window.Sync && Sync.isEnabled && Sync.isEnabled()) {
    try { Sync.patchEntry(entry.uid, { is_final: true }); } catch (e) {}
  }
  return { levelsGained: entry.level - oldLevel, learned, evolvedFrom, evolvedTo, entry };
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
     （branch／stone_used 由 server 權威提供；未記錄時唔會自動揀分支） */
  out.stage = 1;
  out.ownedSpecies = [chain.stages[0][0]];
  while (out.stage < maxStage) {
    const info = entryNextEvolution(out);
    if (!info || !info.target) break;
    const curDex = entryCurrentSpecies(out)[0];
    const lv = Math.min(MAX_LEVEL, levelFromExp(curDex, Number(out.exp) || 0));
    const met = info.trade
      ? ((out.trainerLikes != null ? out.trainerLikes : loadState().trainerLikes) || 0) >= TRADE_LIKES_REQUIRED
      : info.stone
        ? (out.stone === info.stone || (info.branchIndex != null && out.branch != null))
        : lv >= (info.needLevel || 0);
    if (!met) break;
    if (info.branchIndex != null && out.branch == null) out.branch = info.branchIndex;
    out.stage += 1;
    if (!out.ownedSpecies.includes(info.target[0])) out.ownedSpecies.push(info.target[0]);
  }

  /* level 用最終形態嘅 growth table 反推 */
  const finalDex = entryCurrentSpecies(out)[0];
  out.level = Math.min(MAX_LEVEL, levelFromExp(finalDex, Number(out.exp) || 0));

  /* 招式池 replay：所有擁有過嘅形態（stage1→而家）喺現等級內學到嘅招。
     官方規則：進化前學嘅招會保留，所以唔可以淨係用最終形態嘅 learnset。
     knownMoves = 全部學過（配招池）；moves = 持有 4 招（預設最先學嘅 4 招，
     玩家自訂配招由 applyMoveLoadout 喺 pull 後還原） */
  const poolSet = new Set(initialMoves(chain.stages[0][0]));
  (out.ownedSpecies || []).forEach(dex => {
    learnsetOf(dex).forEach(l => { if (l.level <= out.level) poolSet.add(l.move); });
  });
  out.knownMoves = [...poolSet];
  out.moves = out.knownMoves.slice(0, 4);

  /* stars 由 dupes 推（同 obtainPokemon 公式對齊） */
  out.stars = Math.min(5, 1 + Math.floor((out.dupes || 0) / 5));
  out.isFinal = isEntryFullyEvolved(out);
  return out;
}

/* server 行 → 本地 entry 形狀（v99：gacha_pull / obtain_capture 回傳嘅 row 用） */
function localEntryFromServer(e) {
  const out = deriveEntryFields({
    uid: e.id,
    chainKey: e.chain_key,
    exp: Number(e.exp ?? 0),
    ivs: e.ivs || {},
    evs: e.evs || {},
    evPoints: e.ev_points ?? 0,
    candies: e.candies ?? 0,
    dupes: e.dupes ?? 0,
    branch: (e.branch === 0 || e.branch) ? e.branch : null,
    stone: e.stone_used || null,
    nature: e.nature || null,
    obtainedAt: e.obtained_at
  });
  /* 寵物狀態（v1.7.x 上雲）：雲端 null = 未上過雲，唔可以當 0 */
  out.pet = (e.pet_health == null) ? null : {
    health: Number(e.pet_health) || 0,
    streak: Number(e.pet_streak) || 0,
    lastFedDay: e.pet_last_fed_day || "",
    settledDay: e.pet_settled_day || "",
    decayDay: e.pet_decay_day || "",
    updatedAt: e.pet_updated_at || null
  };
  return out;
}

/* 合併 pet：較新 updatedAt 為準；decayDay 只可前進（防倒撥重扣） */
function mergePet(localPet, serverPet) {
  if (!serverPet) return localPet || null;
  if (!localPet) return serverPet;
  const lt = localPet.updatedAt ? Date.parse(localPet.updatedAt) : 0;
  const st = serverPet.updatedAt ? Date.parse(serverPet.updatedAt) : 0;
  const base = (lt && lt > st) ? localPet : serverPet;
  const day = (localPet.decayDay && serverPet.decayDay && localPet.decayDay > serverPet.decayDay)
    ? localPet.decayDay
    : serverPet.decayDay;
  return Object.assign({}, base, { decayDay: day || base.decayDay });
}

/* ---------- 配招（持有 4 招） ----------
   entry.moves = 持有（≤4）；entry.knownMoves = 招式池（等級夠學嘅全部）。
   玩家自訂配招存 st.moveLoadouts[uid]，因為 pull 重推 moves 會還原預設，
   要喺重推後 apply 返。 */

/* pull / adopt 重推後還原玩家配招（配招唔合法 → 保留預設） */
function applyMoveLoadout(entry) {
  const st = loadState();
  const pref = st.moveLoadouts && st.moveLoadouts[entry.uid];
  const pool = new Set(entry.knownMoves || entry.moves || []);
  if (Array.isArray(pref) && pref.length && pref.every(m => pool.has(m))) {
    entry.moves = pref.slice(0, 4);
  }
  return entry;
}

/* 圖鑑配招：只准用招式池入面嘅招、最多 4 招、至少 1 招 */
function setEntryMoves(entry, slugs) {
  const pool = new Set(entry.knownMoves || []);
  const clean = [...new Set(slugs)].filter(m => pool.has(m)).slice(0, 4);
  if (!clean.length) return { ok: false, msg: "No valid moves" };
  entry.moves = clean;
  const st = loadState();
  st.moveLoadouts = st.moveLoadouts || {};
  st.moveLoadouts[entry.uid] = clean;
  saveState();
  return { ok: true };
}

/* 採用 server entry：按 chainKey 搵本地 entry，存在就以 server 值覆蓋（uid 都換 —
   server id 先係 RPC 認嘅），唔存在就新加。activeUid 指向舊 uid 會一併修正。 */
function adoptServerEntry(serverRow) {
  const st = loadState();
  const mapped = applyMoveLoadout(localEntryFromServer(serverRow));
  /* 一條鏈可以有多個 entry（完全進化後可再收集）：
     先用 uid 精準對；對唔到先喺同鏈入面揀最近獲得嗰隻（即啱啱 obtain 嗰個） */
  let idx = st.entries.findIndex(e => e.uid === mapped.uid);
  if (idx < 0) {
    const cands = st.entries
      .map((e, i) => ({ e, i }))
      .filter(x => x.e.chainKey === mapped.chainKey);
    if (cands.length) {
      cands.sort((a, b) => (b.e.obtainedAt || 0) - (a.e.obtainedAt || 0));
      idx = cands[0].i;
    }
  }
  if (idx >= 0) {
    const old = st.entries[idx];
    /* nature 已上雲（v1.4.1）：以 server 為準；server 未有（舊資料）才沿用本地性格 */
    if (!mapped.nature) mapped.nature = old.nature;
    /* pet 已上雲：較新 updatedAt 為準；雲端未上過（null）就保留本機，避免清空進度 */
    mapped.pet = mergePet(old.pet, mapped.pet);
    if (st.activeUid === old.uid) st.activeUid = mapped.uid;
    st.entries[idx] = mapped;
  } else {
    st.entries.push(mapped);
    if (!st.entries.some(e => e.uid === st.activeUid)) st.activeUid = mapped.uid;
  }
  saveState();
  /* server 未有 nature（舊存檔 / 新捕捉）→ 用本地性格補寫，之後換裝置都保持一致 */
  if (!serverRow.nature && mapped.nature && window.Sync && Sync.isEnabled && Sync.isEnabled()) {
    try { Sync.patchEntry(mapped.uid, { nature: mapped.nature }); } catch (e) {}
  }
  /* server 派寵（gacha_pull / obtain_capture RPC）落地後都要檢查世代解鎖 */
  recomputeUnlockedGen();
  return mapped;
}

/* 餵糖果：每粒糖加「升一級所需經驗」，最多餵到 Lv.99
   回傳同 addEntryExp 一樣 */
function useEntryCandy(entry, count) {
  ensureEntryPokemonData(entry);
  let used = 0;
  let result = { levelsGained: 0, learned: [], evolvedFrom: null, evolvedTo: null, entry };
  const n = Math.min(count || 1, entry.candies || 0);
  for (let i = 0; i < n && entry.level < MAX_LEVEL; i++) {
    const dexId = entryCurrentSpecies(entry)[0];
    const res = addEntryExp(entry, levelSpan(dexId, entry.level));
    entry.candies -= 1;
    used += 1;
    result.levelsGained += res.levelsGained;
    result.learned.push(...res.learned);
    if (res.evolvedFrom && result.evolvedFrom == null) result.evolvedFrom = res.evolvedFrom;
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
    /* 招式池一律喺 dex 就緒後強制重推：pre-dex 寫過嘅殘缺池（[] 或「得持有招」）
       靠 ensureEntryPokemonData 嘅非空判斷補唔返，要喺度對住 learnset 校準 */
    if (typeof POKEMON_DEX !== "undefined" && POKEMON_DEX) {
      const owned = (Array.isArray(e.ownedSpecies) && e.ownedSpecies.length) ? e.ownedSpecies : [entryCurrentSpecies(e)[0]];
      const poolSet = new Set(e.moves || []);
      owned.forEach(dex => {
        learnsetOf(dex).forEach(l => { if (l.level <= (e.level || 1)) poolSet.add(l.move); });
      });
      const pool = [...poolSet];
      const same = Array.isArray(e.knownMoves) && e.knownMoves.length === pool.length
        && pool.every(m => e.knownMoves.includes(m));
      if (!same) { e.knownMoves = pool; changed = true; }
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
