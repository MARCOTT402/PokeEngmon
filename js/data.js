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

/* ---------- 展開所有物種（圖鑑用） ---------- */
const SPECIES = {};          // dexId -> { dexId, name, zh, chainKey, stageIndex, stage, rarity, branch }
const PULLABLE = {};         // rarity -> [chainKey,...]  只有 stage 1 會被抽中

EVOLUTION_CHAINS.forEach(chain => {
  chain.stages.forEach((st, i) => {
    SPECIES[st[0]] = {
      dexId: st[0], name: st[1],
      chainKey: chain.key, stageIndex: i, stage: i + 1,
      rarity: chain.baseRarity, branch: false
    };
  });
  (chain.branches || []).forEach((opts, bi) => {
    opts.forEach(st => {
      SPECIES[st[0]] = {
        dexId: st[0], name: st[1],
        chainKey: chain.key, stageIndex: chain.stages.length + bi, stage: chain.stages.length + bi + 1,
        rarity: chain.baseRarity, branch: true
      };
    });
  });
  if (!PULLABLE[chain.baseRarity]) PULLABLE[chain.baseRarity] = [];
  PULLABLE[chain.baseRarity].push(chain.key);
});

const TOTAL_SPECIES = Object.keys(SPECIES).length;   // 圖鑑總數（151）

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

/* ---------- 題庫（鍵盤輸入形式）----------
   sentence 內 "___" 為空白位
   answer  = 正確答案（比對時不分大小寫、會 trim）
   accept  = 額外可接受答案（可省略）
   explain.keyword = 黃色底關鍵詞（必須出現在 sentence 內）
   explain.hint    = 極短解釋（避免文法術語） */
const QUESTION_BANK = [
  /* --- There is / There are (8) --- */
  { id: "q01", topic: "There is / There are", sentence: "There ___ some dogs in the park.", answer: "are", explain: { keyword: "some dogs", hint: "some = more than one → are" } },
  { id: "q02", topic: "There is / There are", sentence: "There ___ a big tree in the garden.", answer: "is", explain: { keyword: "a big tree", hint: "Only one thing → is" } },
  { id: "q03", topic: "There is / There are", sentence: "There ___ three cats on the wall.", answer: "are", explain: { keyword: "three cats", hint: "Three = more than one → are" } },
  { id: "q04", topic: "There is / There are", sentence: "There ___ some milk in the cup.", answer: "is", explain: { keyword: "milk", hint: "Milk is uncountable → is" } },
  { id: "q05", topic: "There is / There are", sentence: "There ___ many stars in the sky.", answer: "are", explain: { keyword: "many stars", hint: "many = a lot → are" } },
  { id: "q06", topic: "There is / There are", sentence: "There ___ a bird in the tree.", answer: "is", explain: { keyword: "a bird", hint: "a = one → is" } },
  { id: "q07", topic: "There is / There are", sentence: "There ___ two apples on the table.", answer: "are", explain: { keyword: "two apples", hint: "two = two → are" } },
  { id: "q08", topic: "There is / There are", sentence: "___ there any water in the bottle?", answer: "Is", accept: ["is"], explain: { keyword: "water", hint: "water is uncountable → Is" } },

  /* --- a / an (5) --- */
  { id: "q09", topic: "a / an", sentence: "I eat ___ apple every day.", answer: "an", explain: { keyword: "apple", hint: "Starts with a, e, i, o, u → an" } },
  { id: "q10", topic: "a / an", sentence: "She has ___ red bag.", answer: "a", explain: { keyword: "red", hint: "red starts with r → a" } },
  { id: "q11", topic: "a / an", sentence: "It is ___ old clock.", answer: "an", explain: { keyword: "old", hint: "Starts with o → an" } },
  { id: "q12", topic: "a / an", sentence: "My dad drives ___ bus.", answer: "a", explain: { keyword: "bus", hint: "Starts with b → a" } },
  { id: "q13", topic: "a / an", sentence: "I see ___ elephant at the zoo.", answer: "an", explain: { keyword: "elephant", hint: "Starts with e → an" } },

  /* --- am / is / are (6) --- */
  { id: "q14", topic: "am / is / are", sentence: "I ___ a happy boy.", answer: "am", explain: { keyword: "I", hint: "I always takes am" } },
  { id: "q15", topic: "am / is / are", sentence: "She ___ my sister.", answer: "is", explain: { keyword: "She", hint: "One person (he / she / it) → is" } },
  { id: "q16", topic: "am / is / are", sentence: "They ___ my friends.", answer: "are", explain: { keyword: "They", hint: "More than one person → are" } },
  { id: "q17", topic: "am / is / are", sentence: "We ___ in the classroom.", answer: "are", explain: { keyword: "We", hint: "We = more than one → are" } },
  { id: "q18", topic: "am / is / are", sentence: "The dogs ___ hungry.", answer: "are", explain: { keyword: "The dogs", hint: "dogs = plural → are" } },
  { id: "q19", topic: "am / is / are", sentence: "Tom ___ my best friend.", answer: "is", explain: { keyword: "Tom", hint: "One person's name → is" } },

  /* --- have / has (4) --- */
  { id: "q20", topic: "have / has", sentence: "I ___ two pencils.", answer: "have", explain: { keyword: "I", hint: "I takes have" } },
  { id: "q21", topic: "have / has", sentence: "He ___ a red car.", answer: "has", explain: { keyword: "He", hint: "One person → has" } },
  { id: "q22", topic: "have / has", sentence: "The cats ___ long tails.", answer: "have", explain: { keyword: "The cats", hint: "Plural cats → have" } },
  { id: "q23", topic: "have / has", sentence: "My mum ___ a new phone.", answer: "has", explain: { keyword: "My mum", hint: "One person → has" } },

  /* --- 單數 / 眾數 (4) --- */
  { id: "q24", topic: "Plural -s", sentence: "Two ___ are running fast.", answer: "dogs", explain: { keyword: "Two", hint: "After two, add -s" } },
  { id: "q25", topic: "Plural -s", sentence: "I see five ___ on the farm.", answer: "cows", explain: { keyword: "five", hint: "After five, add -s" } },
  { id: "q26", topic: "Plural -s", sentence: "Look! The ___ are flying in the sky.", answer: "birds", explain: { keyword: "are flying", hint: "More than one bird → birds" } },
  { id: "q27", topic: "Plural -s", sentence: "One ___ is sleeping on the sofa.", answer: "cat", explain: { keyword: "One", hint: "one = singular → no -s" } },

  /* --- 位置字 (5) --- */
  { id: "q28", topic: "Prepositions", sentence: "The ball is ___ the box. It is inside.", answer: "in", explain: { keyword: "inside", hint: "inside = in" } },
  { id: "q29", topic: "Prepositions", sentence: "The book is ___ the table. It is on top.", answer: "on", explain: { keyword: "on top", hint: "on top = on" } },
  { id: "q30", topic: "Prepositions", sentence: "The cat is ___ the chair. You cannot see it.", answer: "under", explain: { keyword: "cannot see it", hint: "You cannot see it → under" } },
  { id: "q31", topic: "Prepositions", sentence: "We fly kites ___ the sky.", answer: "in", explain: { keyword: "the sky", hint: "In the sky → in" } },
  { id: "q32", topic: "Prepositions", sentence: "School starts ___ eight o'clock.", answer: "at", explain: { keyword: "eight o'clock", hint: "Clock time → at" } },

  /* --- This / That / These / Those (4) --- */
  { id: "q33", topic: "This / That", sentence: "___ is my ball. It is here.", answer: "This", accept: ["this"], explain: { keyword: "here", hint: "One thing nearby → This" } },
  { id: "q34", topic: "This / That", sentence: "___ are my shoes over there.", answer: "Those", accept: ["those"], explain: { keyword: "over there", hint: "Far away + plural → Those" } },
  { id: "q35", topic: "This / That", sentence: "___ is my teacher over there.", answer: "That", accept: ["that"], explain: { keyword: "over there", hint: "Far away + one → That" } },
  { id: "q36", topic: "This / That", sentence: "___ are my hands.", answer: "These", accept: ["these"], explain: { keyword: "are", hint: "are = plural → These" } },

  /* --- 疑問詞 (4) --- */
  { id: "q37", topic: "Wh- Questions", sentence: "___ is your name? My name is Sam.", answer: "What", accept: ["what"], explain: { keyword: "name", hint: "Asking a name → What" } },
  { id: "q38", topic: "Wh- Questions", sentence: "___ is my school bag? It is under the chair.", answer: "Where", accept: ["where"], explain: { keyword: "under the chair", hint: "Asking a place → Where" } },
  { id: "q39", topic: "Wh- Questions", sentence: "___ is that boy? He is my brother.", answer: "Who", accept: ["who"], explain: { keyword: "He is my brother", hint: "Asking about a person → Who" } },
  { id: "q40", topic: "Wh- Questions", sentence: "___ do you get up? At seven o'clock.", answer: "When", accept: ["when"], explain: { keyword: "seven o'clock", hint: "Asking a time → When" } }
];

/* ---------- 題目 helpers ---------- */

/* 網站題目（根目錄 questions.csv，開網站時自動載入） */
let SITE_QUESTIONS = [];

/* 圖片單字題（根目錄 picture_words.csv）：點圖聽聲 → 默寫單字 */
let PICTURE_WORDS = [];

/* 內建題庫冇課題／難度欄，用題型對應返 */
const TOPIC_DEFAULTS = {
  "There is / There are": { course: "Basic Sentences", level: 1 },
  "am / is / are":        { course: "Basic Sentences", level: 1 },
  "This / That":          { course: "Basic Sentences", level: 2 },
  "a / an":               { course: "Articles & Nouns", level: 1 },
  "Plural -s":            { course: "Articles & Nouns", level: 2 },
  "have / has":           { course: "Verbs & Possession", level: 1 },
  "Prepositions":         { course: "Place & Time", level: 1 },
  "Wh- Questions":        { course: "Question Words", level: 2 }
};

/* 題型選擇鍵：同名題型可以出現在唔同課題，所以用「課題＋題型」做 key */
function topicKey(course, topic) {
  return `${course}\u0001${topic}`;
}
function questionTopicKey(q) {
  return topicKey(q.course, q.topic);
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

/* 補齊課題／難度／編號（舊資料或內建題庫） */
function normalizeQuestion(q) {
  const d = TOPIC_DEFAULTS[q.topic] || {};
  if (!q.course) q.course = d.course || "Uncategorized";
  if (!q.level) q.level = d.level || 1;
  /* 內建題目用自己嘅 q01…q40 做圖片編號（可加 questions_images/q01.png） */
  if (!q.no) q.no = /^q\d+$/.test(q.id) ? q.id : "";
  return q;
}

/* 載入網站題庫。失敗（例如用 file:// 開）就靜靜用返內建題庫 */
async function loadSiteQuestions() {
  try {
    const res = await fetch("questions.csv", { cache: "no-cache" });
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

/* 載入圖片單字題庫（picture_words.csv）
   欄位：Word,Level,Course,Type,Category,Image,Accept,Source
   - Word     : 正確串法（亦係語音檔名：assets/tts/w/<word>.mp3）
   - Course   : 課題（例如 Dictation）
   - Type     : 題型（例如 Noun）
   - Category : 主題分組（例如 Animals / Food），用於錯題回顧顯示
   - Image    : 圖片相對路徑（例如 picture_words_images/elephant.webp）
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
      topic: typeRaw || "Dictation",
      category: catRaw || "",
      level: Math.min(9, Math.max(1, parseInt(levelRaw, 10) || 1)),
      sentence: "___",                              // 令舊有解釋／Power Up 渲染器可直接重用
      answer: word,
      accept: String(acceptRaw || "").split(/[|/]/).map(s => s.trim()).filter(Boolean),
      image: imageRaw || `picture_words_images/${word.toLowerCase().replace(/\s+/g, "_")}.webp`,
      source: sourceRaw || "",
      custom: false,
      explain: { keyword: "", hint: "" }
    });
  });
  return { words, skipped };
}

async function loadPictureWords() {
  try {
    const res = await fetch("picture_words.csv", { cache: "no-cache" });
    if (!res.ok) return 0;
    const { words } = wordsFromCSV(await res.text());
    PICTURE_WORDS = words;
    return words.length;
  } catch (e) {
    return 0;
  }
}

/* 全部題目＝內建題庫 + 網站題庫 + 家長匯入嘅自訂題目 + 圖片單字題（自動去重） */
function getAllQuestions() {
  const st = typeof loadState === "function" ? loadState() : { customQuestions: [] };
  const seen = new Set();
  const out = [];
  [QUESTION_BANK, SITE_QUESTIONS, st.customQuestions || [], PICTURE_WORDS].forEach(list => {
    list.forEach(q => {
      q = normalizeQuestion(q);
      const k = questionKey(q);
      if (!seen.has(k)) { seen.add(k); out.push(q); }
    });
  });
  return out;
}

/* 用 qid 搵題目（錯題回顧 / Power Up Zone / 日曆用） */
function findQuestion(qid) {
  const w = PICTURE_WORDS.find(x => x.id === qid);
  if (w) return w;
  return getAllQuestions().find(q => q.id === qid) || null;
}

/* 課題一覽：[{ course, count, topics: [{ key, topic, count }] }]，按題庫出現次序 */
function getCourses() {
  const map = new Map();
  getAllQuestions().forEach(q => {
    if (!map.has(q.course)) map.set(q.course, new Map());
    const tm = map.get(q.course);
    tm.set(q.topic, (tm.get(q.topic) || 0) + 1);
  });
  return [...map].map(([course, tm]) => {
    const topics = [...tm].map(([topic, count]) => ({ key: topicKey(course, topic), topic, count }));
    return { course, topics, count: topics.reduce((s, t) => s + t.count, 0) };
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
   新格式（8 欄）：編號,課題,題型,難度,句子,答案,關鍵詞,提示
   舊格式（7 欄）：課題,題型,難度,句子,答案,關鍵詞,提示
   舊格式（5 欄）：題型,句子,答案,關鍵詞,提示（課題＝Uncategorized、難度＝1）
   - 課題：大分類；同一個課題下面可以有多個題型
   - 題型：課題入面嘅小分類；同名歸入同一題型
   - 難度：1、2、3、4…（答題時顯示同等數量嘅星星）
   - 句子：必須有 ___ （三個底線）做空位
   - 答案：正確答案；多個可接受答案用 | 或 / 分隔（例：were not / weren't）
     留空＝零冠詞（答題時要留空提交）
   - 關鍵詞（可留空）：句子內要 highlight 嘅詞語，多個用 / 分隔
   - 提示（可留空）：答錯時顯示嘅短解釋
   第一行如果係標題（第一格係「編號」「課題」或「題型」）會自動略過 */

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

/* 題目圖片：questions_images/00001.png（亦支援 jpg / jpeg / webp / gif）
   唔可以列出資料夾，所以逐個副檔名試載入；結果記住，唔會重複試 */
const IMAGE_DIR = "questions_images";
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
     8 欄（第一格「編號」）＝ 有題目編號，可對應 questions_images/<編號>.png
     7 欄（第一格「課題」）＝ 冇編號
     5 欄 ＝ 舊格式（題型,句子,答案,關鍵詞,提示） */
  const firstRow = rows[0].map(s => s.trim());
  const hasNo = firstRow.length >= 8 || /^(編號|id|no)$/i.test(firstRow[0] || "");
  const isNew = hasNo || firstRow.length >= 7 || /^(課題|課程|course)$/i.test(firstRow[0] || "");

  rows.forEach((cols, idx) => {
    const c = cols.map(s => s.trim());
    /* 略過標題行（第一格啱啱好係「編號」「課題」或「題型」先當標題） */
    if (idx === 0 && /^(編號|id|no|課題|課程|題型|course|topic)$/i.test(c[0] || "")) return;

    let no = "", course, topic, levelRaw, sentence, answerRaw, keyword, hint;
    if (hasNo) {
      [no, course, topic, levelRaw, sentence, answerRaw, keyword, hint] = c;
    } else if (isNew) {
      [course, topic, levelRaw, sentence, answerRaw, keyword, hint] = c;
    } else {
      [topic, sentence, answerRaw, keyword, hint] = c;
      course = "Uncategorized";
      levelRaw = "1";
    }

    if (!course || !topic || !sentence || !sentence.includes("___")) { skipped++; return; }

    /* 「X」代表零冠詞，同留空答案等價 */
    if (hasNo && /^x$/i.test(String(answerRaw || "").trim())) answerRaw = "";

    /* 8 欄格式准許答案留空（例如零冠詞題：正確做法係唔填） */
    const answers = String(answerRaw || "").split(/[|/]/).map(s => s.trim()).filter(Boolean);
    if (answers.length === 0 && !hasNo) { skipped++; return; }

    const level = Math.min(9, Math.max(1, parseInt(levelRaw, 10) || 1));

    questions.push({
      id: `c${stamp}-${questions.length}`,
      no: normalizeNo(no),
      course,
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
