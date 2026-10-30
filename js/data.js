/* ============================================================
   PokeEngmon - 資料檔
   Pokemon 圖鑑資料（1-151 全世代）+ 題庫 + CSV 匯入工具
   ============================================================ */

/* ---------- 遊戲配置 ---------- */
const GAME_CONFIG = {
  SET_SIZE: 10,                 // 每組題數
  EXP_BASE: 12,                 // 未有拍檔時嘅基礎經驗
  RARE_PULL_COST: 3,            // 稀有抽所需鑽石
  PERFECT_DIAMOND: 3,           // 全對（10/10）鑽石
  GREAT_DIAMOND: 2,             // 8–9 題對鑽石
  GOOD_DIAMOND: 1,              // 7 題對鑽石
  GREAT_THRESHOLD: 8,           // >=8/10
  GOOD_THRESHOLD: 7,            // >=7/10
  /* 普通抽只會出 normal；稀有抽（鑽石）只會出 rare / epic / legend */
  PULL_ODDS: {
    normal: { normal: 1.0 },
    rare:   { rare: 0.80, epic: 0.15, legend: 0.05 }
  }
};

/* ---------- 稀有度 ---------- */
const RARITY = {
  normal: { label: "Common",    ballClass: "ball-red",    color: "#ef5350", bg: "#ffebee" },
  rare:   { label: "Rare",      ballClass: "ball-blue",   color: "#42a5f5", bg: "#e3f2fd" },
  epic:   { label: "Epic",      ballClass: "ball-yellow", color: "#b8860b", bg: "#fff8e1" },
  legend: { label: "Legendary", ballClass: "ball-purple", color: "#ab47bc", bg: "#f3e5f5" }
};

/* ---------- 圖片來源（PokeAPI 免費素材 + 本地動態 GIF） ---------- */
const SPRITE_BASE = "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon";
function spriteURL(id)  { return `${SPRITE_BASE}/${id}.png`; }
function artworkURL(id) { return `${SPRITE_BASE}/other/official-artwork/${id}.png`; }
/* 1-151 嘅動態像素 GIF 已經預先下載到 assets/animated/ */
function animatedURL(id) { return `assets/animated/${id}.gif`; }

/* ---------- 進化鏈（1-151 全圖鑑）----------
   stages: [圖鑑號, 英文名, 中文名]（直線進化）
   branches: 分支進化（伊貝專用）：由最後一個線性階段隨機揀一個分支
   baseRarity:
     normal = 普通抽（🎫）先抽到
     rare / epic / legend = 淨係鑽石抽（💎）先抽得到
   只有 stage 1（初始形態）可以被抽中；2、3 階必須靠進化獲得 */
const EVOLUTION_CHAINS = [
  /* --- 普通池（normal pull）--- */
  { key: "bulbasaur",  baseRarity: "normal", stages: [[1, "Bulbasaur"], [2, "Ivysaur"], [3, "Venusaur"]] },
  { key: "charmander", baseRarity: "normal", stages: [[4, "Charmander"], [5, "Charmeleon"], [6, "Charizard"]] },
  { key: "squirtle",   baseRarity: "normal", stages: [[7, "Squirtle"], [8, "Wartortle"], [9, "Blastoise"]] },
  { key: "caterpie",   baseRarity: "normal", stages: [[10, "Caterpie"], [11, "Metapod"], [12, "Butterfree"]] },
  { key: "weedle",     baseRarity: "normal", stages: [[13, "Weedle"], [14, "Kakuna"], [15, "Beedrill"]] },
  { key: "pidgey",     baseRarity: "normal", stages: [[16, "Pidgey"], [17, "Pidgeotto"], [18, "Pidgeot"]] },
  { key: "rattata",    baseRarity: "normal", stages: [[19, "Rattata"], [20, "Raticate"]] },
  { key: "spearow",    baseRarity: "normal", stages: [[21, "Spearow"], [22, "Fearow"]] },
  { key: "ekans",      baseRarity: "normal", stages: [[23, "Ekans"], [24, "Arbok"]] },
  { key: "sandshrew",  baseRarity: "normal", stages: [[27, "Sandshrew"], [28, "Sandslash"]] },
  { key: "nidoranf",   baseRarity: "normal", stages: [[29, "Nidoran♀"], [30, "Nidorina"], [31, "Nidoqueen"]] },
  { key: "nidoranm",   baseRarity: "normal", stages: [[32, "Nidoran♂"], [33, "Nidorino"], [34, "Nidoking"]] },
  { key: "jigglypuff", baseRarity: "normal", stages: [[39, "Jigglypuff"], [40, "Wigglytuff"]] },
  { key: "zubat",      baseRarity: "normal", stages: [[41, "Zubat"], [42, "Golbat"]] },
  { key: "oddish",     baseRarity: "normal", stages: [[43, "Oddish"], [44, "Gloom"], [45, "Vileplume"]] },
  { key: "paras",      baseRarity: "normal", stages: [[46, "Paras"], [47, "Parasect"]] },
  { key: "venonat",    baseRarity: "normal", stages: [[48, "Venonat"], [49, "Venomoth"]] },
  { key: "diglett",    baseRarity: "normal", stages: [[50, "Diglett"], [51, "Dugtrio"]] },
  { key: "meowth",     baseRarity: "normal", stages: [[52, "Meowth"], [53, "Persian"]] },
  { key: "psyduck",    baseRarity: "normal", stages: [[54, "Psyduck"], [55, "Golduck"]] },
  { key: "mankey",     baseRarity: "normal", stages: [[56, "Mankey"], [57, "Primeape"]] },
  { key: "poliwag",    baseRarity: "normal", stages: [[60, "Poliwag"], [61, "Poliwhirl"], [62, "Poliwrath"]] },
  { key: "machop",     baseRarity: "normal", stages: [[66, "Machop"], [67, "Machoke"], [68, "Machamp"]] },
  { key: "bellsprout", baseRarity: "normal", stages: [[69, "Bellsprout"], [70, "Weepinbell"], [71, "Victreebel"]] },
  { key: "tentacool",  baseRarity: "normal", stages: [[72, "Tentacool"], [73, "Tentacruel"]] },
  { key: "geodude",    baseRarity: "normal", stages: [[74, "Geodude"], [75, "Graveler"], [76, "Golem"]] },
  { key: "slowpoke",   baseRarity: "normal", stages: [[79, "Slowpoke"], [80, "Slowbro"]] },
  { key: "magnemite",  baseRarity: "normal", stages: [[81, "Magnemite"], [82, "Magneton"]] },
  { key: "doduo",      baseRarity: "normal", stages: [[84, "Doduo"], [85, "Dodrio"]] },
  { key: "seel",       baseRarity: "normal", stages: [[86, "Seel"], [87, "Dewgong"]] },
  { key: "grimer",     baseRarity: "normal", stages: [[88, "Grimer"], [89, "Muk"]] },
  { key: "shellder",   baseRarity: "normal", stages: [[90, "Shellder"], [91, "Cloyster"]] },
  { key: "drowzee",    baseRarity: "normal", stages: [[96, "Drowzee"], [97, "Hypno"]] },
  { key: "krabby",     baseRarity: "normal", stages: [[98, "Krabby"], [99, "Kingler"]] },
  { key: "voltorb",    baseRarity: "normal", stages: [[100, "Voltorb"], [101, "Electrode"]] },
  { key: "exeggcute",  baseRarity: "normal", stages: [[102, "Exeggcute"], [103, "Exeggutor"]] },
  { key: "cubone",     baseRarity: "normal", stages: [[104, "Cubone"], [105, "Marowak"]] },
  { key: "koffing",    baseRarity: "normal", stages: [[109, "Koffing"], [110, "Weezing"]] },
  { key: "horsea",     baseRarity: "normal", stages: [[116, "Horsea"], [117, "Seadra"]] },
  { key: "goldeen",    baseRarity: "normal", stages: [[118, "Goldeen"], [119, "Seaking"]] },
  { key: "staryu",     baseRarity: "normal", stages: [[120, "Staryu"], [121, "Starmie"]] },
  { key: "magikarp",   baseRarity: "normal", stages: [[129, "Magikarp"], [130, "Gyarados"]] },

  /* --- 稀有池（💎 鑽石抽先抽到）--- */
  { key: "pikachu",    baseRarity: "rare", stages: [[25, "Pikachu"], [26, "Raichu"]] },
  { key: "clefairy",   baseRarity: "rare", stages: [[35, "Clefairy"], [36, "Clefable"]] },
  { key: "vulpix",     baseRarity: "rare", stages: [[37, "Vulpix"], [38, "Ninetales"]] },
  { key: "growlithe",  baseRarity: "rare", stages: [[58, "Growlithe"], [59, "Arcanine"]] },
  { key: "abra",       baseRarity: "rare", stages: [[63, "Abra"], [64, "Kadabra"], [65, "Alakazam"]] },
  { key: "ponyta",     baseRarity: "rare", stages: [[77, "Ponyta"], [78, "Rapidash"]] },
  { key: "farfetchd",  baseRarity: "rare", stages: [[83, "Farfetch'd"]] },
  { key: "gastly",     baseRarity: "rare", stages: [[92, "Gastly"], [93, "Haunter"], [94, "Gengar"]] },
  { key: "onix",       baseRarity: "rare", stages: [[95, "Onix"]] },
  { key: "hitmonlee",  baseRarity: "rare", stages: [[106, "Hitmonlee"]] },
  { key: "hitmonchan", baseRarity: "rare", stages: [[107, "Hitmonchan"]] },
  { key: "lickitung",  baseRarity: "rare", stages: [[108, "Lickitung"]] },
  { key: "rhyhorn",    baseRarity: "rare", stages: [[111, "Rhyhorn"], [112, "Rhydon"]] },
  { key: "chansey",    baseRarity: "rare", stages: [[113, "Chansey"]] },
  { key: "tangela",    baseRarity: "rare", stages: [[114, "Tangela"]] },
  { key: "kangaskhan", baseRarity: "rare", stages: [[115, "Kangaskhan"]] },
  { key: "mrmime",     baseRarity: "rare", stages: [[122, "Mr. Mime"]] },
  { key: "scyther",    baseRarity: "rare", stages: [[123, "Scyther"]] },
  { key: "jynx",       baseRarity: "rare", stages: [[124, "Jynx"]] },
  { key: "electabuzz", baseRarity: "rare", stages: [[125, "Electabuzz"]] },
  { key: "magmar",     baseRarity: "rare", stages: [[126, "Magmar"]] },
  { key: "pinsir",     baseRarity: "rare", stages: [[127, "Pinsir"]] },
  { key: "tauros",     baseRarity: "rare", stages: [[128, "Tauros"]] },
  { key: "ditto",      baseRarity: "rare", stages: [[132, "Ditto"]] },
  { key: "eevee",      baseRarity: "rare", stages: [[133, "Eevee"]],
    branches: [[[134, "Vaporeon"], [135, "Jolteon"], [136, "Flareon"]]] },
  { key: "porygon",    baseRarity: "rare", stages: [[137, "Porygon"]] },

  /* --- 較高稀有（💎 鑽石抽先抽到）--- */
  { key: "omanyte",    baseRarity: "epic", stages: [[138, "Omanyte"], [139, "Omastar"]] },
  { key: "kabuto",     baseRarity: "epic", stages: [[140, "Kabuto"], [141, "Kabutops"]] },
  { key: "aerodactyl", baseRarity: "epic", stages: [[142, "Aerodactyl"]] },
  { key: "lapras",     baseRarity: "epic", stages: [[131, "Lapras"]] },
  { key: "snorlax",    baseRarity: "epic", stages: [[143, "Snorlax"]] },
  { key: "dratini",    baseRarity: "epic", stages: [[147, "Dratini"], [148, "Dragonair"], [149, "Dragonite"]] },

  /* --- 傳說（💎 鑽石抽先抽到）--- */
  { key: "articuno",   baseRarity: "legend", stages: [[144, "Articuno"]] },
  { key: "zapdos",     baseRarity: "legend", stages: [[145, "Zapdos"]] },
  { key: "moltres",    baseRarity: "legend", stages: [[146, "Moltres"]] },
  { key: "mewtwo",     baseRarity: "legend", stages: [[150, "Mewtwo"]] },
  { key: "mew",        baseRarity: "legend", stages: [[151, "Mew"]] }
];

/* ---------- Gen 2-5 擴充（js/gens-data.js，自動生成）----------
   跨代進化鏈按世代截斷：Gen 1 鏈完全維持現狀（唔會有 crobat 等），
   跨代後段（crobat、espeon 等）喺自己世代做獨立鏈 stage 1。
   每条 Gen 2-5 鏈自帶 gen 欄位；Gen 1 鏈喺下面補 gen:1。 */
if (typeof EVOLUTION_CHAINS_G25 !== "undefined" && Array.isArray(EVOLUTION_CHAINS_G25)) {
  EVOLUTION_CHAINS.forEach(c => { if (!c.gen) c.gen = 1; });
  EVOLUTION_CHAINS.push(...EVOLUTION_CHAINS_G25);
} else {
  EVOLUTION_CHAINS.forEach(c => { if (!c.gen) c.gen = 1; });
}

/* ---------- 展開所有物種（圖鑑用） ---------- */
const SPECIES = {};          // dexId -> { dexId, name, zh, chainKey, stageIndex, stage, rarity, branch, gen }
const PULLABLE = {};         // rarity -> [chainKey,...]  只有 stage 1 會被抽中

EVOLUTION_CHAINS.forEach(chain => {
  chain.stages.forEach((st, i) => {
    SPECIES[st[0]] = {
      dexId: st[0], name: st[1],
      chainKey: chain.key, stageIndex: i, stage: i + 1,
      rarity: chain.baseRarity, branch: false, gen: chain.gen || 1
    };
  });
  (chain.branches || []).forEach((opts, bi) => {
    opts.forEach(st => {
      SPECIES[st[0]] = {
        dexId: st[0], name: st[1],
        chainKey: chain.key, stageIndex: chain.stages.length + bi, stage: chain.stages.length + bi + 1,
        rarity: chain.baseRarity, branch: true, gen: chain.gen || 1
      };
    });
  });
  if (!PULLABLE[chain.baseRarity]) PULLABLE[chain.baseRarity] = [];
  PULLABLE[chain.baseRarity].push(chain.key);
});

const TOTAL_SPECIES = Object.keys(SPECIES).length;   // 圖鑑總數（649，Gen 1-5）

/* ---------- 世代 helpers ---------- */
function genOfChain(chainKey) {
  const c = EVOLUTION_CHAINS.find(x => x.key === chainKey);
  return c ? (c.gen || 1) : 1;
}
function chainsOfGen(n) {
  return EVOLUTION_CHAINS.filter(c => (c.gen || 1) === n);
}
/* 抽獎／捕捉池：只限指定世代 + 稀有度（世代解鎖制：淨係最高已解鎖世代） */
function pullablePool(gen, rarity) {
  return EVOLUTION_CHAINS.filter(c => (c.gen || 1) === gen && c.baseRarity === rarity).map(c => c.key);
}
/* 該世代圖鑑編號範圍（GENS 未定義時 fallback Gen 1） */
function genRange(n) {
  if (typeof GENS !== "undefined") {
    const g = GENS.find(x => x.gen === n);
    if (g) return g.range;
  }
  return [1, 151];
}

/* 進化鏈最高階數（線性 stages + 分支步數） */
function chainMaxStage(chain) {
  return chain.stages.length + (chain.branches ? chain.branches.length : 0);
}

/* entry 而家嗰隻物種 [dexId, 英文名, 中文名]（考慮伊貝分支） */
function entryCurrentSpecies(entry) {
  const chain = EVOLUTION_CHAINS.find(c => c.key === entry.chainKey);
  if (!chain) {
    console.warn("[data] entryCurrentSpecies: chain not found for", entry.chainKey);
    return [1, "Bulbasaur"]; /* fallback */
  }
  if (entry.stage <= chain.stages.length) return chain.stages[entry.stage - 1];
  const bi = entry.stage - chain.stages.length - 1;
  if (chain.branches && chain.branches[bi]) return chain.branches[bi][entry.branch || 0];
  return chain.stages[chain.stages.length - 1]; /* fallback to last stage */
}

/* ---------- 題目 helpers ---------- */

/* 網站題目（Q_folder/grammar/grammar.csv，開網站時自動載入） */
let SITE_QUESTIONS = [];

/* 圖片單字題（Q_folder/vocab/vocab.csv）：點圖聽聲 → 默寫單字 */
let PICTURE_WORDS = [];

/* ---------- 題目分類（三層）----------
   大類 Category → 單元 Unit → 題型 Topic
   - 大類：固定次序，見 CATEGORY_ORDER（未有題目嘅會顯示 Coming Soon）
   - 單元：大類入面嘅主題（例如 Grammar 下面嘅 Articles、Past Tense）
   - 題型：單元入面嘅小分類（例如 Articles: Basics）
   ⚠️ SRS card_id 只用 q.topic（見 sm2.js）——改 q.topic 會令舊進度失效 */
const CATEGORY_ORDER = [
  "Phonetics",
  "Grammar",
  "Vocab",
  "Phrases",
  "Listening",
  "Reading",
  "Proof-reading",
  "Rewriting",
  "Talking with AI",
  "Reading Aloud",
  "Punctuation"
];

/* 題型選擇鍵：同名題型可以出現在唔同單元，所以用「大類＋單元＋題型」做 key */
function topicKey(category, unit, topic) {
  return `${category}\u0001${unit}\u0001${topic}`;
}
function questionTopicKey(q) {
  const cat = q.category || "Grammar";
  const unit = q.unit || q.course || "Uncategorized";
  return topicKey(cat, unit, q.topic);
}

/* 題目唯一鍵：同題型＋同句子＋同答案＝同一題
   圖片單字題用獨立前綴 w: 做 SRS key，唔會同句子題撞 */
function questionKey(q) {
  if (q && q.type === "word") return `w\u0001${String(q.word).toLowerCase()}`;
  return `${q.topic}\u0001${q.sentence}\u0001${q.answer}`;
}

/* 短字串 hash：令網站題目每次載入都有同一個 id（舊紀錄先對得返） */
function hashString(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h * 33) ^ str.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

/* 補齊大類／單元／難度（CSV 或舊資料已有嘅話唔會覆蓋） */
function normalizeQuestion(q) {
  if (!q.category) q.category = q.type === "word" ? "Vocab" : "Grammar";
  if (!q.unit) q.unit = q.course || (q.type === "word" ? "Dictation" : "Uncategorized");
  if (!q.level) q.level = 1;
  if (!q.no) q.no = "";
  return q;
}

/* 載入網站題庫。失敗（例如用 file:// 開）就靜靜略過 */
async function loadSiteQuestions() {
  try {
    const res = await fetch("Q_folder/grammar/grammar.csv", { cache: "no-cache" });
    if (!res.ok) return 0;
    const { questions } = questionsFromCSV(await res.text());
    questions.forEach(q => {
      normalizeQuestion(q);
      q.id = "s" + hashString(questionKey(q));
      q.custom = false;
    });
    SITE_QUESTIONS = questions;
    return questions.length;
  } catch (e) {
    return 0;
  }
}

/* 圖片單字題語音路徑：Q_folder/vocab/vocab_audio/<word>.mp3
   命名同 tools/gen_word_tts.py 嘅 safe_name() 保持一致（細楷、空格→_、只留 a-z0-9_-'） */
const WORD_AUDIO_DIR = "Q_folder/vocab/vocab_audio";
function wordAudioURL(word) {
  const key = String(word || "").trim().toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_\-']/g, "");
  return `${WORD_AUDIO_DIR}/${key}.mp3`;
}

/* 載入圖片單字題庫（Q_folder/vocab/vocab.csv）
   欄位：Word,Level,Course,Type,Category,Image,Accept,Source
   - Word     : 正確串法（亦係語音檔名：Q_folder/vocab/vocab_audio/<word>.mp3）
   - Level    : 1／2／3（難度，答題時顯示同等數量星星）
   - Course   : 單元（例如 Dictation）→ 對應 q.unit
   - Type     : 題型（例如 Noun）→ 對應 q.topic
   - Category : 主題分組（例如 Animals / Food）→ 存 q.theme，用於錯題回顧顯示
   - Image    : 圖片相對路徑（例如 Q_folder/vocab/vocab_images/elephant.webp）
   - Accept   : 其他可接受串法，用 / 分隔（例如 color/colour）
   - Source   : 圖片來源，供版權聲明列明（可留空） */
function wordsFromCSV(text) {
  const rows = parseCSV(text);
  const words = [];
  let skipped = 0;
  rows.forEach((cols, idx) => {
    const c = cols.map(s => s.trim());
    if (idx === 0 && /^(word|單字|单词)$/i.test(c[0] || "")) return;   // 略過標題行
    const [wordRaw, levelRaw, courseRaw, typeRaw, catRaw, imageRaw, acceptRaw, sourceRaw] = c;
    const word = String(wordRaw || "").trim();
    if (!word || !/^[A-Za-z'\- ]+$/.test(word)) { skipped++; return; }
    words.push({
      type: "word",
      id: "w" + hashString(word.toLowerCase()),
      word,
      course: courseRaw || "Dictation",
      unit: courseRaw || "Dictation",
      category: "Vocab",
      topic: typeRaw || "Dictation",
      theme: catRaw || "",
      level: Math.min(9, Math.max(1, parseInt(levelRaw, 10) || 1)),
      sentence: "___",                              // 令舊有解釋／Power Up 渲染器可直接重用
      answer: word,
      accept: String(acceptRaw || "").split(/[|/]/).map(s => s.trim()).filter(Boolean),
      image: imageRaw || `Q_folder/vocab/vocab_images/${word.toLowerCase().replace(/\s+/g, "_")}.webp`,
      source: sourceRaw || "",
      custom: false,
      explain: { keyword: "", hint: "" }
    });
  });
  return { words, skipped };
}

async function loadPictureWords() {
  try {
    const res = await fetch("Q_folder/vocab/vocab.csv", { cache: "no-cache" });
    if (!res.ok) return 0;
    const { words } = wordsFromCSV(await res.text());
    PICTURE_WORDS = words;
    return words.length;
  } catch (e) {
    return 0;
  }
}

/* Resolve custom picture imageId → blob URL (runtime only; never persist image) */
function withResolvedImage(q) {
  if (!q || !q.imageId || typeof QImgDB === "undefined") return q;
  const url = QImgDB.urlSync(q.imageId);
  if (!url) return q;
  return Object.assign({}, q, { image: url });
}

/* 全部題目＝網站題庫 + 家長匯入／App 內新增嘅自訂題目 + 圖片單字題（自動去重） */
function getAllQuestions() {
  const st = typeof loadState === "function" ? loadState() : { customQuestions: [] };
  const seen = new Set();
  const out = [];
  const custom = (st.customQuestions || []).map(withResolvedImage);
  [SITE_QUESTIONS, custom, PICTURE_WORDS].forEach(list => {
    list.forEach(q => {
      q = normalizeQuestion(q);
      const k = questionKey(q);
      if (!seen.has(k)) { seen.add(k); out.push(q); }
    });
  });
  return out;
}

/* App 內新增句子填空題 → customQuestions */
function addCustomSentenceQuestion({ sentence, answer, category, unit, topic, level, keyword, hint } = {}) {
  const sent = String(sentence || "").trim();
  if (!sent || !sent.includes("___")) return { ok: false, error: "Sentence must include ___ (blank)" };
  const answers = String(answer ?? "").split(/[|/]/).map(s => s.trim()).filter(Boolean);
  const stamp = Date.now().toString(36);
  const q = {
    id: `c${stamp}-0`,
    no: "",
    category: String(category || "Grammar").trim() || "Grammar",
    unit: String(unit || "Custom").trim() || "Custom",
    course: String(unit || "Custom").trim() || "Custom",
    topic: String(topic || "Custom Sentences").trim() || "Custom Sentences",
    level: Math.min(9, Math.max(1, parseInt(level, 10) || 1)),
    sentence: sent,
    answer: answers[0] || "",
    accept: answers.slice(1),
    custom: true,
    explain: { keyword: String(keyword || "").trim(), hint: String(hint || "").trim() }
  };
  const st = loadState();
  const seen = new Set(getAllQuestions().map(questionKey));
  if (seen.has(questionKey(q))) return { ok: false, error: "That question already exists" };
  (st.customQuestions = st.customQuestions || []).push(q);
  saveState();
  return { ok: true, question: q };
}

/* App 內新增圖片單字題：blob → IndexedDB；metadata → customQuestions */
async function addCustomPictureQuestion({ word, file, category, unit, topic, level } = {}) {
  const w = String(word || "").trim();
  if (!w || !/^[A-Za-z'\- ]+$/.test(w)) {
    return { ok: false, error: "Answer must be English letters (spaces / ' / - OK)" };
  }
  if (!file || !/^image\/(jpeg|png|webp)$/i.test(file.type)) {
    return { ok: false, error: "Upload a JPG, PNG, or WebP image" };
  }
  if (file.size > 2 * 1024 * 1024) {
    return { ok: false, error: "Image must be under 2 MB" };
  }
  if (typeof QImgDB === "undefined") return { ok: false, error: "Image storage unavailable" };

  const stamp = Date.now().toString(36);
  const imageId = `cimg-${stamp}`;
  const q = {
    type: "word",
    id: `cw${stamp}`,
    word: w,
    category: String(category || "Vocab").trim() || "Vocab",
    unit: String(unit || "Dictation").trim() || "Dictation",
    course: String(unit || "Dictation").trim() || "Dictation",
    topic: String(topic || "Custom Pictures").trim() || "Custom Pictures",
    level: Math.min(9, Math.max(1, parseInt(level, 10) || 1)),
    sentence: "___",
    answer: w,
    accept: [],
    imageId,
    source: "custom",
    custom: true,
    explain: { keyword: "", hint: "" }
  };
  const seen = new Set(getAllQuestions().map(questionKey));
  if (seen.has(questionKey(q))) return { ok: false, error: "That word already exists in the bank" };

  try {
    await QImgDB.put(imageId, file);
  } catch (e) {
    console.warn(e);
    return { ok: false, error: "Could not save the image" };
  }
  const st = loadState();
  (st.customQuestions = st.customQuestions || []).push(q);
  saveState();
  return { ok: true, question: q };
}

async function clearCustomQuestionsAndImages() {
  const st = loadState();
  st.customQuestions = [];
  saveState();
  if (typeof QImgDB !== "undefined") {
    try { await QImgDB.clear(); } catch (e) { console.warn(e); }
  }
}

/* 更新一條自訂題（去重排除自身） */
async function updateCustomQuestion(id, patch = {}) {
  const st = loadState();
  const list = st.customQuestions || [];
  const idx = list.findIndex(q => q && q.id === id);
  if (idx < 0) return { ok: false, error: "Question not found" };
  const cur = list[idx];
  const isWord = cur.type === "word";

  if (isWord) {
    const w = String(patch.word != null ? patch.word : cur.word || "").trim();
    if (!w || !/^[A-Za-z'\- ]+$/.test(w)) {
      return { ok: false, error: "Answer must be English letters (spaces / ' / - OK)" };
    }
    const next = Object.assign({}, cur, {
      word: w,
      answer: w,
      category: String(patch.category != null ? patch.category : cur.category || "Vocab").trim() || "Vocab",
      unit: String(patch.unit != null ? patch.unit : cur.unit || cur.course || "Dictation").trim() || "Dictation",
      course: String(patch.unit != null ? patch.unit : cur.unit || cur.course || "Dictation").trim() || "Dictation",
      topic: String(patch.topic != null ? patch.topic : cur.topic || "Custom Pictures").trim() || "Custom Pictures",
      level: Math.min(9, Math.max(1, parseInt(patch.level != null ? patch.level : cur.level, 10) || 1))
    });
    const seen = new Set(
      getAllQuestions().filter(q => q.id !== id).map(questionKey)
    );
    if (seen.has(questionKey(next))) return { ok: false, error: "That word already exists in the bank" };

    if (patch.file) {
      const file = patch.file;
      if (!/^image\/(jpeg|png|webp)$/i.test(file.type)) {
        return { ok: false, error: "Upload a JPG, PNG, or WebP image" };
      }
      if (file.size > 2 * 1024 * 1024) {
        return { ok: false, error: "Image must be under 2 MB" };
      }
      if (typeof QImgDB === "undefined") return { ok: false, error: "Image storage unavailable" };
      const imageId = cur.imageId || `cimg-${Date.now().toString(36)}`;
      try {
        await QImgDB.put(imageId, file);
      } catch (e) {
        console.warn(e);
        return { ok: false, error: "Could not save the image" };
      }
      next.imageId = imageId;
    }
    list[idx] = next;
    saveState();
    return { ok: true, question: next };
  }

  const sent = String(patch.sentence != null ? patch.sentence : cur.sentence || "").trim();
  if (!sent || !sent.includes("___")) return { ok: false, error: "Sentence must include ___ (blank)" };
  const answerRaw = patch.answer != null ? patch.answer : [cur.answer].concat(cur.accept || []).join(" / ");
  const answers = String(answerRaw ?? "").split(/[|/]/).map(s => s.trim()).filter(Boolean);
  const expl = cur.explain || {};
  const next = Object.assign({}, cur, {
    sentence: sent,
    answer: answers[0] || "",
    accept: answers.slice(1),
    category: String(patch.category != null ? patch.category : cur.category || "Grammar").trim() || "Grammar",
    unit: String(patch.unit != null ? patch.unit : cur.unit || cur.course || "Custom").trim() || "Custom",
    course: String(patch.unit != null ? patch.unit : cur.unit || cur.course || "Custom").trim() || "Custom",
    topic: String(patch.topic != null ? patch.topic : cur.topic || "Custom Sentences").trim() || "Custom Sentences",
    level: Math.min(9, Math.max(1, parseInt(patch.level != null ? patch.level : cur.level, 10) || 1)),
    explain: {
      keyword: String(patch.keyword != null ? patch.keyword : expl.keyword || "").trim(),
      hint: String(patch.hint != null ? patch.hint : expl.hint || "").trim()
    }
  });
  const seen = new Set(
    getAllQuestions().filter(q => q.id !== id).map(questionKey)
  );
  if (seen.has(questionKey(next))) return { ok: false, error: "That question already exists" };
  list[idx] = next;
  saveState();
  return { ok: true, question: next };
}

async function deleteCustomQuestion(id) {
  const st = loadState();
  const list = st.customQuestions || [];
  const idx = list.findIndex(q => q && q.id === id);
  if (idx < 0) return { ok: false, error: "Question not found" };
  const [removed] = list.splice(idx, 1);
  saveState();
  if (removed && removed.imageId && typeof QImgDB !== "undefined" && QImgDB.remove) {
    try { await QImgDB.remove(removed.imageId); } catch (e) { console.warn(e); }
  }
  return { ok: true };
}

/* 用 qid 搵題目（錯題回顧 / Power Up Zone / 日曆用） */
function findQuestion(qid) {
  const w = PICTURE_WORDS.find(x => x.id === qid);
  if (w) return w;
  const q = getAllQuestions().find(x => x.id === qid) || null;
  return q ? withResolvedImage(q) : null;
}

/* 題庫一覽（三層）：[{ category, count, comingSoon, units: [{ unit, count, topics: [{ key, topic, count }] }] }]
   大類按 CATEGORY_ORDER 排，未有題目嘅大類都會列出（comingSoon＝true） */
function getCategories() {
  const map = new Map();   // category -> Map(unit -> Map(topic -> count))
  getAllQuestions().forEach(q => {
    const cat = q.category || "Grammar";
    const unit = q.unit || q.course || "Uncategorized";
    if (!map.has(cat)) map.set(cat, new Map());
    const um = map.get(cat);
    if (!um.has(unit)) um.set(unit, new Map());
    const tm = um.get(unit);
    tm.set(q.topic, (tm.get(q.topic) || 0) + 1);
  });
  const extra = [...map.keys()].filter(c => !CATEGORY_ORDER.includes(c));
  return [...CATEGORY_ORDER, ...extra].map(category => {
    const um = map.get(category);
    const units = um ? [...um].map(([unit, tm]) => {
      const topics = [...tm].map(([topic, count]) => ({
        key: topicKey(category, unit, topic), topic, count
      }));
      return { unit, topics, count: topics.reduce((s, t) => s + t.count, 0) };
    }) : [];
    return {
      category,
      units,
      count: units.reduce((s, u) => s + u.count, 0),
      comingSoon: units.length === 0
    };
  });
}

/* （舊 stage-ladder SRS 函數已移除：availableQuestions / availablePictureWords /
   _orderedByStage / drawQuestionSet / drawMixedSet。
   Session pool 組裝改由 SM2.buildSession 執行，見 js/sm2.js。）*/

/* 抽 10 題 Session — 薄 wrapper，內部由 SM2.buildSession 做完整 Due 優先 + Fisher-Yates 隨機 */
function drawMixedSet(size, keys) {
  const topicSet = keys && keys.length > 0 ? new Set(keys) : null;
  return SM2.buildSession(getAllQuestions(), topicSet, size);
}

/* ---------- CSV 匯入 ----------
   新格式（9 欄）：編號,大類,單元,題型,難度,句子,答案,關鍵詞,提示
   舊格式（8 欄）：編號,課題,題型,難度,句子,答案,關鍵詞,提示（大類＝Grammar、單元＝課題）
   舊格式（7 欄）：課題,題型,難度,句子,答案,關鍵詞,提示
   舊格式（5 欄）：題型,句子,答案,關鍵詞,提示（單元＝Uncategorized、難度＝1）
   - 大類：Phonetics / Grammar / Vocab / Phrases / Listening / …（見 CATEGORY_ORDER）
   - 單元：大類入面嘅主題（例如 Grammar 下面嘅 Articles）
   - 題型：單元入面嘅小分類；同名歸入同一題型
   - 難度：1、2、3、4…（答題時顯示同等數量嘅星星）
   - 句子：必須有 ___ （三個底線）做空位
   - 答案：正確答案；多個可接受答案用 | 或 / 分隔（例：were not / weren't）
     留空＝零冠詞（答題時要留空提交）
   - 關鍵詞（可留空）：句子內要 highlight 嘅詞語，多個用 / 分隔
   - 提示（可留空）：答錯時顯示嘅短解釋
   第一行如果係標題（第一格係「編號」「大類」「單元」「課題」或「題型」）會自動略過 */

function parseCSV(text) {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);   // 去除 UTF-8 BOM
  const rows = [];
  let row = [], field = "", inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQ = false;
      } else field += c;
    } else if (c === '"') {
      inQ = true;
    } else if (c === ",") {
      row.push(field); field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some(f => f.trim() !== "")) rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    if (row.some(f => f.trim() !== "")) rows.push(row);
  }
  return rows;
}

/* 題目圖片：Q_folder/grammar/grammar_images/00001.png（亦支援 jpg / jpeg / webp / gif）
   唔可以列出資料夾，所以逐個副檔名試載入；結果記住，唔會重複試 */
const IMAGE_DIR = "Q_folder/grammar/grammar_images";
const IMAGE_EXTS = ["png", "jpg", "jpeg", "webp", "gif"];
const _imageCache = new Map();   // 編號 → 圖片路徑（搵唔到＝null）

function probeImage(url) {
  return new Promise(resolve => {
    const im = new Image();
    im.onload = () => resolve(url);
    im.onerror = () => resolve(null);
    im.src = url;
  });
}

/* 回傳圖片路徑；冇圖片回傳 null */
function findQuestionImage(no) {
  if (!no) return Promise.resolve(null);
  if (_imageCache.has(no)) return Promise.resolve(_imageCache.get(no));
  let chain = Promise.resolve(null);
  IMAGE_EXTS.forEach(ext => {
    chain = chain.then(found => found || probeImage(`${IMAGE_DIR}/${no}.${ext}`));
  });
  return chain.then(url => {
    _imageCache.set(no, url);
    return url;
  });
}

/* 編號統一補零成 5 位（1 → 00001） */
function normalizeNo(raw) {
  const s = String(raw || "").trim();
  if (/^\d+$/.test(s)) return s.padStart(5, "0");
  return s;
}

/* 將 CSV 文字轉為題目物件。回傳 { questions, skipped } */
function questionsFromCSV(text) {
  const rows = parseCSV(text);
  const questions = [];
  let skipped = 0;
  const stamp = Date.now().toString(36);
  if (rows.length === 0) return { questions, skipped };

  /* 判斷格式：
     9 欄（第一格「編號」、第二格「大類」）＝ 三層分類
     8 欄（第一格「編號」）＝ 舊格式，冇大類（大類＝Grammar，單元＝課題）
     7 欄（第一格「課題」）＝ 冇編號
     5 欄 ＝ 最舊格式（題型,句子,答案,關鍵詞,提示） */
  const firstRow = rows[0].map(s => s.trim());
  const hasNo = firstRow.length >= 8 || /^(編號|id|no)$/i.test(firstRow[0] || "");
  const hasCat = hasNo && firstRow.length >= 9;
  const isNew = hasNo || firstRow.length >= 7 || /^(課題|課程|course)$/i.test(firstRow[0] || "");

  rows.forEach((cols, idx) => {
    const c = cols.map(s => s.trim());
    /* 略過標題行（第一格啱啱好係「編號」「課題」「大類」或「題型」先當標題） */
    if (idx === 0 && /^(編號|id|no|課題|課程|大類|單元|題型|course|category|unit|topic)$/i.test(c[0] || "")) return;

    let no = "", category, unit, topic, levelRaw, sentence, answerRaw, keyword, hint;
    if (hasCat) {
      [no, category, unit, topic, levelRaw, sentence, answerRaw, keyword, hint] = c;
    } else if (hasNo) {
      [no, unit, topic, levelRaw, sentence, answerRaw, keyword, hint] = c;
      category = "Grammar";
    } else if (isNew) {
      [unit, topic, levelRaw, sentence, answerRaw, keyword, hint] = c;
      category = "Grammar";
    } else {
      [topic, sentence, answerRaw, keyword, hint] = c;
      category = "Grammar";
      unit = "Uncategorized";
      levelRaw = "1";
    }

    if (!category || !unit || !topic || !sentence || !sentence.includes("___")) { skipped++; return; }

    /* 「X」代表零冠詞，同留空答案等價 */
    if (hasNo && /^x$/i.test(String(answerRaw || "").trim())) answerRaw = "";

    /* 8 欄格式准許答案留空（例如零冠詞題：正確做法係唔填） */
    const answers = String(answerRaw || "").split(/[|/]/).map(s => s.trim()).filter(Boolean);
    if (answers.length === 0 && !hasNo) { skipped++; return; }

    const level = Math.min(9, Math.max(1, parseInt(levelRaw, 10) || 1));

    questions.push({
      id: `c${stamp}-${questions.length}`,
      no: normalizeNo(no),
      category,
      unit,
      course: unit,      /* 向後兼容：舊程式／舊自訂題仍然讀 q.course */
      topic,
      level,
      sentence,
      answer: answers[0] || "",
      accept: answers.slice(1),
      custom: true,
      explain: { keyword: keyword || "", hint: hint || "" }
    });
  });

  return { questions, skipped };
}
