/* ============================================================
   PokeEngmon - 資料檔
   Pokemon 圖鑑資料（1-151 全世代）+ 題庫 + CSV 匯入工具
   ============================================================ */

/* ---------- 遊戲配置 ---------- */
const GAME_CONFIG = {
  SET_SIZE: 10,                 // 每組題數
  EXP_BASE: 12,                 // 完成一組基礎經驗
  EXP_PERFECT_BONUS: 5,         // 全對額外經驗
  EVO_EXP: [50, 120],           // 累積經驗門檻：第1次進化 / 第2次進化
  RARE_PULL_COST: 3,            // 稀有抽所需鑽石
  PERFECT_DIAMOND: 2,           // 全對鑽石
  GOOD_DIAMOND: 1,              // 高正確率鑽石
  GOOD_THRESHOLD: 8,            // 高正確率門檻（>=8/10）
  DUPE_EXP: 20,                 // 抽到重複 → 轉為該隻經驗值
  /* 普通抽只會出 normal；稀有抽（鑽石）只會出 rare / epic / legend */
  PULL_ODDS: {
    normal: { normal: 1.0 },
    rare:   { rare: 0.80, epic: 0.15, legend: 0.05 }
  }
};

/* ---------- 稀有度 ---------- */
const RARITY = {
  normal: { label: "普通",     ballClass: "ball-red",    color: "#ef5350", bg: "#ffebee" },
  rare:   { label: "稀有",     ballClass: "ball-blue",   color: "#42a5f5", bg: "#e3f2fd" },
  epic:   { label: "較高稀有", ballClass: "ball-yellow", color: "#b8860b", bg: "#fff8e1" },
  legend: { label: "傳說",     ballClass: "ball-purple", color: "#ab47bc", bg: "#f3e5f5" }
};

/* ---------- 圖片來源（PokeAPI 免費素材） ---------- */
const SPRITE_BASE = "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon";
function spriteURL(id)  { return `${SPRITE_BASE}/${id}.png`; }
function artworkURL(id) { return `${SPRITE_BASE}/other/official-artwork/${id}.png`; }

/* ---------- 進化鏈（1-151 全圖鑑）----------
   stages: [圖鑑號, 英文名, 中文名]（直線進化）
   branches: 分支進化（伊貝專用）：由最後一個線性階段隨機揀一個分支
   baseRarity:
     normal = 普通抽（🎫）先抽到
     rare / epic / legend = 淨係鑽石抽（💎）先抽得到
   只有 stage 1（初始形態）可以被抽中；2、3 階必須靠進化獲得 */
const EVOLUTION_CHAINS = [
  /* --- 普通池（normal pull）--- */
  { key: "bulbasaur",  baseRarity: "normal", stages: [[1, "Bulbasaur", "妙蛙種子"], [2, "Ivysaur", "妙蛙草"], [3, "Venusaur", "妙蛙花"]] },
  { key: "charmander", baseRarity: "normal", stages: [[4, "Charmander", "小火龍"], [5, "Charmeleon", "火恐龍"], [6, "Charizard", "噴火龍"]] },
  { key: "squirtle",   baseRarity: "normal", stages: [[7, "Squirtle", "傑尼龜"], [8, "Wartortle", "卡咪龜"], [9, "Blastoise", "水箭龜"]] },
  { key: "caterpie",   baseRarity: "normal", stages: [[10, "Caterpie", "綠毛蟲"], [11, "Metapod", "鐵甲蛹"], [12, "Butterfree", "巴大蝶"]] },
  { key: "weedle",     baseRarity: "normal", stages: [[13, "Weedle", "獨角蟲"], [14, "Kakuna", "鐵殼蛹"], [15, "Beedrill", "大針蜂"]] },
  { key: "pidgey",     baseRarity: "normal", stages: [[16, "Pidgey", "波波"], [17, "Pidgeotto", "比比鳥"], [18, "Pidgeot", "大比鳥"]] },
  { key: "rattata",    baseRarity: "normal", stages: [[19, "Rattata", "小拉達"], [20, "Raticate", "拉達"]] },
  { key: "spearow",    baseRarity: "normal", stages: [[21, "Spearow", "烈雀"], [22, "Fearow", "大嘴雀"]] },
  { key: "ekans",      baseRarity: "normal", stages: [[23, "Ekans", "阿柏蛇"], [24, "Arbok", "阿柏怪"]] },
  { key: "sandshrew",  baseRarity: "normal", stages: [[27, "Sandshrew", "穿山鼠"], [28, "Sandslash", "穿山王"]] },
  { key: "nidoranf",   baseRarity: "normal", stages: [[29, "Nidoran♀", "尼多蘭"], [30, "Nidorina", "尼多娜"], [31, "Nidoqueen", "尼多后"]] },
  { key: "nidoranm",   baseRarity: "normal", stages: [[32, "Nidoran♂", "尼多朗"], [33, "Nidorino", "尼多力諾"], [34, "Nidoking", "尼多王"]] },
  { key: "jigglypuff", baseRarity: "normal", stages: [[39, "Jigglypuff", "胖丁"], [40, "Wigglytuff", "胖可丁"]] },
  { key: "zubat",      baseRarity: "normal", stages: [[41, "Zubat", "超音蝠"], [42, "Golbat", "大嘴蝠"]] },
  { key: "oddish",     baseRarity: "normal", stages: [[43, "Oddish", "走路草"], [44, "Gloom", "臭臭花"], [45, "Vileplume", "霸王花"]] },
  { key: "paras",      baseRarity: "normal", stages: [[46, "Paras", "派拉斯"], [47, "Parasect", "派拉斯特"]] },
  { key: "venonat",    baseRarity: "normal", stages: [[48, "Venonat", "毛球"], [49, "Venomoth", "摩魯蛾"]] },
  { key: "diglett",    baseRarity: "normal", stages: [[50, "Diglett", "地鼠"], [51, "Dugtrio", "三地鼠"]] },
  { key: "meowth",     baseRarity: "normal", stages: [[52, "Meowth", "喵喵"], [53, "Persian", "貓老大"]] },
  { key: "psyduck",    baseRarity: "normal", stages: [[54, "Psyduck", "可達鴨"], [55, "Golduck", "哥達鴨"]] },
  { key: "mankey",     baseRarity: "normal", stages: [[56, "Mankey", "猴怪"], [57, "Primeape", "火爆猴"]] },
  { key: "poliwag",    baseRarity: "normal", stages: [[60, "Poliwag", "蚊香蝌蚪"], [61, "Poliwhirl", "蚊香君"], [62, "Poliwrath", "蚊香泳士"]] },
  { key: "machop",     baseRarity: "normal", stages: [[66, "Machop", "腕力"], [67, "Machoke", "豪力"], [68, "Machamp", "怪力"]] },
  { key: "bellsprout", baseRarity: "normal", stages: [[69, "Bellsprout", "喇叭芽"], [70, "Weepinbell", "口呆花"], [71, "Victreebel", "大食花"]] },
  { key: "tentacool",  baseRarity: "normal", stages: [[72, "Tentacool", "瑪瑙水母"], [73, "Tentacruel", "毒刺水母"]] },
  { key: "geodude",    baseRarity: "normal", stages: [[74, "Geodude", "小拳石"], [75, "Graveler", "隆隆石"], [76, "Golem", "隆隆岩"]] },
  { key: "slowpoke",   baseRarity: "normal", stages: [[79, "Slowpoke", "呆呆獸"], [80, "Slowbro", "呆殼獸"]] },
  { key: "magnemite",  baseRarity: "normal", stages: [[81, "Magnemite", "小磁怪"], [82, "Magneton", "三合一磁怪"]] },
  { key: "doduo",      baseRarity: "normal", stages: [[84, "Doduo", "嘟嘟"], [85, "Dodrio", "嘟嘟利"]] },
  { key: "seel",       baseRarity: "normal", stages: [[86, "Seel", "小海獅"], [87, "Dewgong", "白海獅"]] },
  { key: "grimer",     baseRarity: "normal", stages: [[88, "Grimer", "臭泥"], [89, "Muk", "臭臭泥"]] },
  { key: "shellder",   baseRarity: "normal", stages: [[90, "Shellder", "大舌貝"], [91, "Cloyster", "刺甲貝"]] },
  { key: "drowzee",    baseRarity: "normal", stages: [[96, "Drowzee", "催眠貘"], [97, "Hypno", "引夢貘人"]] },
  { key: "krabby",     baseRarity: "normal", stages: [[98, "Krabby", "大鉗蟹"], [99, "Kingler", "巨鉗蟹"]] },
  { key: "voltorb",    baseRarity: "normal", stages: [[100, "Voltorb", "霹靂電球"], [101, "Electrode", "頑皮雷彈"]] },
  { key: "exeggcute",  baseRarity: "normal", stages: [[102, "Exeggcute", "蛋蛋"], [103, "Exeggutor", "椰蛋樹"]] },
  { key: "cubone",     baseRarity: "normal", stages: [[104, "Cubone", "卡拉卡拉"], [105, "Marowak", "嘎啦嘎啦"]] },
  { key: "koffing",    baseRarity: "normal", stages: [[109, "Koffing", "瓦斯彈"], [110, "Weezing", "雙彈瓦斯"]] },
  { key: "horsea",     baseRarity: "normal", stages: [[116, "Horsea", "墨海馬"], [117, "Seadra", "海刺龍"]] },
  { key: "goldeen",    baseRarity: "normal", stages: [[118, "Goldeen", "角金魚"], [119, "Seaking", "金魚王"]] },
  { key: "staryu",     baseRarity: "normal", stages: [[120, "Staryu", "海星星"], [121, "Starmie", "寶石海星"]] },
  { key: "magikarp",   baseRarity: "normal", stages: [[129, "Magikarp", "鯉魚王"], [130, "Gyarados", "暴鯉龍"]] },

  /* --- 稀有池（💎 鑽石抽先抽到）--- */
  { key: "pikachu",    baseRarity: "rare", stages: [[25, "Pikachu", "皮卡丘"], [26, "Raichu", "雷丘"]] },
  { key: "clefairy",   baseRarity: "rare", stages: [[35, "Clefairy", "皮皮"], [36, "Clefable", "皮可西"]] },
  { key: "vulpix",     baseRarity: "rare", stages: [[37, "Vulpix", "六尾"], [38, "Ninetales", "九尾"]] },
  { key: "growlithe",  baseRarity: "rare", stages: [[58, "Growlithe", "卡蒂狗"], [59, "Arcanine", "風速狗"]] },
  { key: "abra",       baseRarity: "rare", stages: [[63, "Abra", "凱西"], [64, "Kadabra", "勇基拉"], [65, "Alakazam", "胡地"]] },
  { key: "ponyta",     baseRarity: "rare", stages: [[77, "Ponyta", "小火馬"], [78, "Rapidash", "烈焰馬"]] },
  { key: "farfetchd",  baseRarity: "rare", stages: [[83, "Farfetch'd", "大蔥鴨"]] },
  { key: "gastly",     baseRarity: "rare", stages: [[92, "Gastly", "鬼斯"], [93, "Haunter", "鬼斯通"], [94, "Gengar", "耿鬼"]] },
  { key: "onix",       baseRarity: "rare", stages: [[95, "Onix", "大岩蛇"]] },
  { key: "hitmonlee",  baseRarity: "rare", stages: [[106, "Hitmonlee", "飛腿郎"]] },
  { key: "hitmonchan", baseRarity: "rare", stages: [[107, "Hitmonchan", "快拳郎"]] },
  { key: "lickitung",  baseRarity: "rare", stages: [[108, "Lickitung", "大舌頭"]] },
  { key: "rhyhorn",    baseRarity: "rare", stages: [[111, "Rhyhorn", "獨角犀牛"], [112, "Rhydon", "鑽角犀獸"]] },
  { key: "chansey",    baseRarity: "rare", stages: [[113, "Chansey", "吉利蛋"]] },
  { key: "tangela",    baseRarity: "rare", stages: [[114, "Tangela", "蔓藤怪"]] },
  { key: "kangaskhan", baseRarity: "rare", stages: [[115, "Kangaskhan", "袋獸"]] },
  { key: "mrmime",     baseRarity: "rare", stages: [[122, "Mr. Mime", "魔牆人偶"]] },
  { key: "scyther",    baseRarity: "rare", stages: [[123, "Scyther", "飛天螳螂"]] },
  { key: "jynx",       baseRarity: "rare", stages: [[124, "Jynx", "迷唇姐"]] },
  { key: "electabuzz", baseRarity: "rare", stages: [[125, "Electabuzz", "電擊獸"]] },
  { key: "magmar",     baseRarity: "rare", stages: [[126, "Magmar", "鴨嘴火獸"]] },
  { key: "pinsir",     baseRarity: "rare", stages: [[127, "Pinsir", "凱羅斯"]] },
  { key: "tauros",     baseRarity: "rare", stages: [[128, "Tauros", "肯泰羅"]] },
  { key: "ditto",      baseRarity: "rare", stages: [[132, "Ditto", "百變怪"]] },
  { key: "eevee",      baseRarity: "rare", stages: [[133, "Eevee", "伊貝"]],
    branches: [[[134, "Vaporeon", "水伊貝"], [135, "Jolteon", "雷伊貝"], [136, "Flareon", "火伊貝"]]] },
  { key: "porygon",    baseRarity: "rare", stages: [[137, "Porygon", "多邊獸"]] },

  /* --- 較高稀有（💎 鑽石抽先抽到）--- */
  { key: "omanyte",    baseRarity: "epic", stages: [[138, "Omanyte", "菊石獸"], [139, "Omastar", "多刺菊石獸"]] },
  { key: "kabuto",     baseRarity: "epic", stages: [[140, "Kabuto", "化石盔"], [141, "Kabutops", "鐮刀盔"]] },
  { key: "aerodactyl", baseRarity: "epic", stages: [[142, "Aerodactyl", "化石翼龍"]] },
  { key: "lapras",     baseRarity: "epic", stages: [[131, "Lapras", "拉普拉斯"]] },
  { key: "snorlax",    baseRarity: "epic", stages: [[143, "Snorlax", "卡比獸"]] },
  { key: "dratini",    baseRarity: "epic", stages: [[147, "Dratini", "迷你龍"], [148, "Dragonair", "哈克龍"], [149, "Dragonite", "快龍"]] },

  /* --- 傳說（💎 鑽石抽先抽到）--- */
  { key: "articuno",   baseRarity: "legend", stages: [[144, "Articuno", "急凍鳥"]] },
  { key: "zapdos",     baseRarity: "legend", stages: [[145, "Zapdos", "閃電鳥"]] },
  { key: "moltres",    baseRarity: "legend", stages: [[146, "Moltres", "火焰鳥"]] },
  { key: "mewtwo",     baseRarity: "legend", stages: [[150, "Mewtwo", "超夢"]] },
  { key: "mew",        baseRarity: "legend", stages: [[151, "Mew", "夢幻"]] }
];

/* ---------- 展開所有物種（圖鑑用） ---------- */
const SPECIES = {};          // dexId -> { dexId, name, zh, chainKey, stageIndex, stage, rarity, branch }
const PULLABLE = {};         // rarity -> [chainKey,...]  只有 stage 1 會被抽中

EVOLUTION_CHAINS.forEach(chain => {
  chain.stages.forEach((st, i) => {
    SPECIES[st[0]] = {
      dexId: st[0], name: st[1], zh: st[2],
      chainKey: chain.key, stageIndex: i, stage: i + 1,
      rarity: chain.baseRarity, branch: false
    };
  });
  (chain.branches || []).forEach((opts, bi) => {
    opts.forEach(st => {
      SPECIES[st[0]] = {
        dexId: st[0], name: st[1], zh: st[2],
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
  if (entry.stage <= chain.stages.length) return chain.stages[entry.stage - 1];
  const bi = entry.stage - chain.stages.length - 1;
  return chain.branches[bi][entry.branch || 0];
}

/* ---------- 題庫（鍵盤輸入形式）----------
   sentence 內 "___" 為空白位
   answer  = 正確答案（比對時不分大小寫、會 trim）
   accept  = 額外可接受答案（可省略）
   explain.keyword = 黃色底關鍵詞（必須出現在 sentence 內）
   explain.hint    = 極短解釋（避免文法術語） */
const QUESTION_BANK = [
  /* --- There is / There are (8) --- */
  { id: "q01", topic: "There is / There are", sentence: "There ___ some dogs in the park.", answer: "are", explain: { keyword: "some dogs", hint: "有 some（多過一隻）→ 用 are" } },
  { id: "q02", topic: "There is / There are", sentence: "There ___ a big tree in the garden.", answer: "is", explain: { keyword: "a big tree", hint: "得一樣嘢 → 用 is" } },
  { id: "q03", topic: "There is / There are", sentence: "There ___ three cats on the wall.", answer: "are", explain: { keyword: "three cats", hint: "三隻＝多過一隻 → 用 are" } },
  { id: "q04", topic: "There is / There are", sentence: "There ___ some milk in the cup.", answer: "is", explain: { keyword: "milk", hint: "milk 倒出嚟冇得數，當一樣嘢 → is" } },
  { id: "q05", topic: "There is / There are", sentence: "There ___ many stars in the sky.", answer: "are", explain: { keyword: "many stars", hint: "many ＝好多粒 → 用 are" } },
  { id: "q06", topic: "There is / There are", sentence: "There ___ a bird in the tree.", answer: "is", explain: { keyword: "a bird", hint: "a ＝一隻 → 用 is" } },
  { id: "q07", topic: "There is / There are", sentence: "There ___ two apples on the table.", answer: "are", explain: { keyword: "two apples", hint: "two ＝兩個 → 用 are" } },
  { id: "q08", topic: "There is / There are", sentence: "___ there any water in the bottle?", answer: "Is", accept: ["is"], explain: { keyword: "water", hint: "water 當一樣嘢 → 用 Is" } },

  /* --- a / an (5) --- */
  { id: "q09", topic: "a / an", sentence: "I eat ___ apple every day.", answer: "an", explain: { keyword: "apple", hint: "a・e・i・o・u 開頭 → 用 an" } },
  { id: "q10", topic: "a / an", sentence: "She has ___ red bag.", answer: "a", explain: { keyword: "red", hint: "red 係 r 開頭 → 用 a" } },
  { id: "q11", topic: "a / an", sentence: "It is ___ old clock.", answer: "an", explain: { keyword: "old", hint: "o 開頭 → 用 an" } },
  { id: "q12", topic: "a / an", sentence: "My dad drives ___ bus.", answer: "a", explain: { keyword: "bus", hint: "b 開頭 → 用 a" } },
  { id: "q13", topic: "a / an", sentence: "I see ___ elephant at the zoo.", answer: "an", explain: { keyword: "elephant", hint: "e 開頭 → 用 an" } },

  /* --- am / is / are (6) --- */
  { id: "q14", topic: "am / is / are", sentence: "I ___ a happy boy.", answer: "am", explain: { keyword: "I", hint: "I 永遠配 am" } },
  { id: "q15", topic: "am / is / are", sentence: "She ___ my sister.", answer: "is", explain: { keyword: "She", hint: "一個人（he / she / it）→ is" } },
  { id: "q16", topic: "am / is / are", sentence: "They ___ my friends.", answer: "are", explain: { keyword: "They", hint: "多過一個人 → are" } },
  { id: "q17", topic: "am / is / are", sentence: "We ___ in the classroom.", answer: "are", explain: { keyword: "We", hint: "We ＝我哋（多人）→ are" } },
  { id: "q18", topic: "am / is / are", sentence: "The dogs ___ hungry.", answer: "are", explain: { keyword: "The dogs", hint: "dogs 係多隻 → are" } },
  { id: "q19", topic: "am / is / are", sentence: "Tom ___ my best friend.", answer: "is", explain: { keyword: "Tom", hint: "一個名字 → is" } },

  /* --- have / has (4) --- */
  { id: "q20", topic: "have / has", sentence: "I ___ two pencils.", answer: "have", explain: { keyword: "I", hint: "I 配 have" } },
  { id: "q21", topic: "have / has", sentence: "He ___ a red car.", answer: "has", explain: { keyword: "He", hint: "一個人 → has" } },
  { id: "q22", topic: "have / has", sentence: "The cats ___ long tails.", answer: "have", explain: { keyword: "The cats", hint: "多隻貓 → have" } },
  { id: "q23", topic: "have / has", sentence: "My mum ___ a new phone.", answer: "has", explain: { keyword: "My mum", hint: "一個人 → has" } },

  /* --- 單數 / 眾數 (4) --- */
  { id: "q24", topic: "加 s", sentence: "Two ___ are running fast.", answer: "dogs", explain: { keyword: "Two", hint: "two 之後隻字要加 s" } },
  { id: "q25", topic: "加 s", sentence: "I see five ___ on the farm.", answer: "cows", explain: { keyword: "five", hint: "five 之後隻字要加 s" } },
  { id: "q26", topic: "加 s", sentence: "Look! The ___ are flying in the sky.", answer: "birds", explain: { keyword: "are flying", hint: "多隻雀 → birds 要加 s" } },
  { id: "q27", topic: "加 s", sentence: "One ___ is sleeping on the sofa.", answer: "cat", explain: { keyword: "One", hint: "one ＝一隻 → 唔使加 s" } },

  /* --- 位置字 (5) --- */
  { id: "q28", topic: "位置字", sentence: "The ball is ___ the box. It is inside.", answer: "in", explain: { keyword: "inside", hint: "inside ＝入面 → 用 in" } },
  { id: "q29", topic: "位置字", sentence: "The book is ___ the table. It is on top.", answer: "on", explain: { keyword: "on top", hint: "on top ＝上面 → 用 on" } },
  { id: "q30", topic: "位置字", sentence: "The cat is ___ the chair. You cannot see it.", answer: "under", explain: { keyword: "cannot see it", hint: "睇唔到 ＝喺下面 → under" } },
  { id: "q31", topic: "位置字", sentence: "We fly kites ___ the sky.", answer: "in", explain: { keyword: "the sky", hint: "喺天空入面 → in the sky" } },
  { id: "q32", topic: "位置字", sentence: "School starts ___ eight o'clock.", answer: "at", explain: { keyword: "eight o'clock", hint: "講時間幾點 → 用 at" } },

  /* --- This / That / These / Those (4) --- */
  { id: "q33", topic: "This / That", sentence: "___ is my ball. It is here.", answer: "This", accept: ["this"], explain: { keyword: "here", hint: "一件嘢＋喺手邊 → This" } },
  { id: "q34", topic: "This / That", sentence: "___ are my shoes over there.", answer: "Those", accept: ["those"], explain: { keyword: "over there", hint: "遠遠哋＋多件 → Those" } },
  { id: "q35", topic: "This / That", sentence: "___ is my teacher over there.", answer: "That", accept: ["that"], explain: { keyword: "over there", hint: "遠遠哋＋一個 → That" } },
  { id: "q36", topic: "This / That", sentence: "___ are my hands.", answer: "These", accept: ["these"], explain: { keyword: "are", hint: "有 are ＝多件嘢 → These" } },

  /* --- 疑問詞 (4) --- */
  { id: "q37", topic: "疑問詞", sentence: "___ is your name? My name is Isaac.", answer: "What", accept: ["what"], explain: { keyword: "name", hint: "問名（嘜嘢名）→ What" } },
  { id: "q38", topic: "疑問詞", sentence: "___ is my school bag? It is under the chair.", answer: "Where", accept: ["where"], explain: { keyword: "under the chair", hint: "問地方（喺邊度）→ Where" } },
  { id: "q39", topic: "疑問詞", sentence: "___ is that boy? He is my brother.", answer: "Who", accept: ["who"], explain: { keyword: "He is my brother", hint: "問人（邊個）→ Who" } },
  { id: "q40", topic: "疑問詞", sentence: "___ do you get up? At seven o'clock.", answer: "When", accept: ["when"], explain: { keyword: "seven o'clock", hint: "問時間（幾點）→ When" } }
];

/* ---------- 題目 helpers ---------- */

/* 網站題目（根目錄 questions.csv，開網站時自動載入） */
let SITE_QUESTIONS = [];

/* 內建題庫冇課題／難度欄，用題型對應返 */
const TOPIC_DEFAULTS = {
  "There is / There are": { course: "基本句型", level: 1 },
  "am / is / are":        { course: "基本句型", level: 1 },
  "This / That":          { course: "基本句型", level: 2 },
  "a / an":               { course: "冠詞與名詞", level: 1 },
  "加 s":                  { course: "冠詞與名詞", level: 2 },
  "have / has":           { course: "動詞與擁有", level: 1 },
  "位置字":                { course: "位置與時間", level: 1 },
  "疑問詞":                { course: "疑問詞", level: 2 }
};

/* 題型選擇鍵：同名題型可以出現在唔同課題，所以用「課題＋題型」做 key */
function topicKey(course, topic) {
  return `${course}\u0001${topic}`;
}
function questionTopicKey(q) {
  return topicKey(q.course, q.topic);
}

/* 題目唯一鍵：同題型＋同句子＋同答案＝同一題 */
function questionKey(q) {
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
  if (!q.course) q.course = d.course || "未分類";
  if (!q.level) q.level = d.level || 1;
  /* 內建題目用自己嘅 q01…q40 做圖片編號（可加 image_file/q01.png） */
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

/* 全部題目＝內建題庫 + 網站題庫 + 家長匯入嘅自訂題目（自動去重） */
function getAllQuestions() {
  const st = typeof loadState === "function" ? loadState() : { customQuestions: [] };
  const seen = new Set();
  const out = [];
  [QUESTION_BANK, SITE_QUESTIONS, st.customQuestions || []].forEach(list => {
    list.forEach(q => {
      q = normalizeQuestion(q);
      const k = questionKey(q);
      if (!seen.has(k)) { seen.add(k); out.push(q); }
    });
  });
  return out;
}

/* 用 qid 搵題目（錯題回顧 / 日曆用） */
function findQuestion(qid) {
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

/* 可作答題目：已揀題型，而且記憶曲線夠鐘（未做過＝即時可答） */
function availableQuestions(keys) {
  let pool = getAllQuestions();
  if (keys && keys.length > 0) {
    const allow = new Set(keys);
    pool = pool.filter(q => allow.has(questionTopicKey(q)));
  }
  const now = Date.now();
  return pool.filter(q => srsDue(q, now));
}

/* 抽一組題目：記憶曲線 stage 越高越優先
   （30 → 14 → 7 → 2 → 1 → 0.5 → 0），同 stage 內隨機；未夠鐘嘅題目唔會抽 */
function drawQuestionSet(size, keys) {
  const pool = availableQuestions(keys);
  const byStage = new Map();
  pool.forEach(q => {
    const s = srsStage(q);
    if (!byStage.has(s)) byStage.set(s, []);
    byStage.get(s).push(q);
  });

  const ordered = [];
  [...byStage.keys()].sort((a, b) => b - a).forEach(s => {
    const arr = byStage.get(s);
    for (let i = arr.length - 1; i > 0; i--) {   // Fisher-Yates 洗牌
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    ordered.push(...arr);
  });

  return ordered.slice(0, size);
}

/* ---------- CSV 匯入 ----------
   新格式（7 欄）：課題,題型,難度,句子,答案,關鍵詞,提示
   舊格式（5 欄）：題型,句子,答案,關鍵詞,提示（課題＝未分類、難度＝1）
   - 課題：大分類（例如「過去式」）；同一個課題下面可以有多個題型
   - 題型：課題入面嘅小分類；同名歸入同一題型
   - 難度：1、2、3、4…（答題時顯示同等數量嘅星星）
   - 句子：必須有 ___ （三個底線）做空位
   - 答案：正確答案；多個可接受答案用 | 或 / 分隔（例：were not / weren't）
   - 關鍵詞（可留空）：句子內要 highlight 嘅詞語，多個用 / 分隔
   - 提示（可留空）：答錯時顯示嘅短解釋
   第一行如果係標題（第一格係「課題」或「題型」）會自動略過 */

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

/* 題目圖片：image_file/00001.png（亦支援 jpg / jpeg / webp / gif）
   唔可以列出資料夾，所以逐個副檔名試載入；結果記住，唔會重複試 */
const IMAGE_DIR = "image_file";
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
     8 欄（第一格「編號」）＝ 有題目編號，可對應 image_file/<編號>.png
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
      course = "未分類";
      levelRaw = "1";
    }

    if (!course || !topic || !sentence || !answerRaw || !sentence.includes("___")) { skipped++; return; }

    const answers = answerRaw.split(/[|/]/).map(s => s.trim()).filter(Boolean);
    if (answers.length === 0) { skipped++; return; }

    const level = Math.min(9, Math.max(1, parseInt(levelRaw, 10) || 1));

    questions.push({
      id: `c${stamp}-${questions.length}`,
      no: normalizeNo(no),
      course,
      topic,
      level,
      sentence,
      answer: answers[0],
      accept: answers.slice(1),
      custom: true,
      explain: { keyword: keyword || "", hint: hint || "" }
    });
  });

  return { questions, skipped };
}
