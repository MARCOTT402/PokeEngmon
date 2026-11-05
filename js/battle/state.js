/* ============================================================
   PokeEngmon Battle - 狀態模型 + 招式執行
   依賴全域：Battle (engine.js) / moveInfo
   ============================================================ */

const BattleState = (() => {
  /* 場地邊狀態（每邊獨立）：釘子層數 0-3、隱形岩、光牆/反射壁回合數 */
  function freshSide() {
    return { spikes: 0, stealthRock: false, reflect: 0, lightScreen: 0 };
  }
  /* ---------- 擊倒經驗（v1.15.24，原莊 per-enemy 制） ---------- */
  /* baseExp 由 data/pokemon-*.json 嘅 baseExp 欄（tools/fetch_base_exp.py 抽自 PokéAPI CSV，649 隻全齊）；
     讀唔到先用 64 做後備 */
  function baseExpOf(dexId) {
    const p = (typeof dexOf === "function") ? dexOf(dexId) : null;
    return (p && p.baseExp) || 64;
  }
  /* 擊倒一隻敵寵 → side 嗰邊派 EXP：yield = baseExp × 敵LV / 7；
     凡係面對過呢隻敵寵嘅我寵均分（無條件進位保 1）；
     以弱勝強加成：收 EXP 嗰隻低過敵寵 → ×(1 + 等級差/50)，cap ×3 */
  function grantKOExp(state, side, victim) {
    const bucket = state[side];
    if (!bucket || !victim) return;
    const yield_ = Math.max(1, Math.ceil((baseExpOf(victim.dexId) * victim.level) / 7));
    /* 只有「出過場而家未暈」嘅隊友先分到 EXP（Gen 5 規則：fainted 唔派 EXP） */
    const parts = bucket.team.filter(p => p.participated && p.hp > 0);
    if (!parts.length) return;
    parts.forEach(earner => {
      /*以弱勝強：earner 等級用 expLevel（sync 前真實等級），避免 Inferno Level Sync 壓低後被當成「弱隊友」額外加成 */
      const realLv = earner.expLevel != null ? earner.expLevel : earner.level;
      const mult = Math.min(3, 1 + Math.max(0, victim.level - realLv) / 50);
      bucket.pendingExp.push({ uid: earner.uid, gain: Math.max(1, Math.ceil((yield_ / parts.length) * mult)) });
    });
  }

  function create(p1Team, p2Team, opts) {
    /* 播種：PvP 由 battles row 攞共同 seed；AI 戰由 UI 層整個隨機 seed 传入。
       冇俾就用時間做種（node 測試／獨立用嘅後備） */
    const sd = (opts && typeof opts.seed === "number") ? opts.seed : ((Date.now() ^ (Math.random() * 0xFFFFFFFF)) >>> 0);
    BattleRng.seed(sd);
    const st = {
      p1: { team: p1Team.map(Battle.makeBattlePokemon), active: 0, side: freshSide(), pendingExp: [] },
      p2: { team: p2Team.map(Battle.makeBattlePokemon), active: 0, side: freshSide(), pendingExp: [] },
      seed: sd,
      /* 天氣：{ name: "sun"|"rain"|"sandstorm"|"hail", turns }；null = 無天氣 */
      weather: null,
      turn: 0,
      log: [],
      finished: false,
      winner: null
    };
    /* 正選自動計參與（面對對方正選） */
    if (st.p1.team[0]) st.p1.team[0].participated = true;
    if (st.p2.team[0]) st.p2.team[0].participated = true;
    return st;
  }

  function active(state, side) { return state[side].team[state[side].active]; }
  function otherSide(side) { return side === "p1" ? "p2" : "p1"; }

  function log(state, msg) { state.log.push({ turn: state.turn, msg }); }

  /* ---------- status 賦予 ---------- */
  /* PokeAPI 嘅 ailment 名稱 → 引擎內部 status key
     （moves.json 用 "paralysis"，引擎同 UI 用 "paralyze"） */
  const AILMENT_ALIAS = { paralysis: "paralyze", "bad-poison": "toxic" };
  /* PokeAPI stat 名 → statStages key（之前冇 map，Growl/Swords Dance 全部寫咗入
     statStages["attack"] 而 effectiveStat 讀 "atk" → stat 招形同虛設） */
  const STAT_ALIAS = {
    attack: "atk", defense: "def", "special-attack": "spa",
    "special-defense": "spd", speed: "spe", accuracy: "acc", evasion: "eva"
  };
  /* 特性擋異常：ability slug → 免疫嘅 status list */
  const STATUS_IMMUNE = {
    insomnia: ["sleep"], "vital-spirit": ["sleep"],
    limber: ["paralyze"], immunity: ["poison", "toxic"],
    "own-tempo": ["confusion"]
  };
  /* 特性擋招（屬性免疫）：absorb 類回復 1/4 HP；flash-fire 儲起强化火招；
     lightning-rod 吸收並 SpA+1；levitate 純免疫 */
  const ABIL_IMMUNE_TYPE = {
    levitate: "ground", "volt-absorb": "electric", "water-absorb": "water",
    "flash-fire": "fire", "lightning-rod": "electric"
  };
  function abilityLabel(a) {
    return (a || "").split("-").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
  }
  function applyStatus(defender, ailment) {
    if (!ailment || ailment === "none") return false;
    ailment = AILMENT_ALIAS[ailment] || ailment;
    /* 特性免疫（Insomnia/Limber/Immunity 等） */
    if ((STATUS_IMMUNE[defender.ability] || []).includes(ailment)) return false;
    /* 混亂 = 臨時效果（2–5 回合，換走／戰鬥完就消失），唔佔主要狀態 */
    if (ailment === "confusion") {
      if (defender.volatile.confusion > 0) return false;
      defender.volatile.confusion = 2 + Math.floor(BattleRng.next() * 4);
      return true;
    }
    /* 已有 status 唔再覆蓋（除咗 toxic 覆蓋 poison） */
    if (defender.status) {
      if (ailment === "toxic" && defender.status === "poison") { defender.status = "toxic"; defender.statusTimer = 0; return true; }
      return false;
    }
    defender.status = ailment;
    defender.statusTimer = 0;
    if (ailment === "sleep") defender.statusTimer = 1 + Math.floor(BattleRng.next() * 3);
    return true;
  }

  /* ---------- 場地招式效果表（status 類，喺 executeMove 度攔截） ---------- */
  /* 天氣招：互斥，新蓋舊，重設 5 回合（Gen 5 無天氣石加成） */
  const WEATHER_LOG = {
    sun: "The sunlight turned harsh!",
    rain: "It started to rain!",
    sandstorm: "A sandstorm brewed!",
    hail: "It started to hail!"
  };
  function setWeather(state, name) {
    /* 同一個天氣再出 = 失敗（Gen 5 規則：同天氣覆蓋失敗） */
    if (state.weather && state.weather.name === name) {
      log(state, "But it failed!");
      return;
    }
    state.weather = { name, turns: 5 };
    log(state, WEATHER_LOG[name]);
  }
  const FIELD_MOVES = {
    "sunny-day": (st) => setWeather(st, "sun"),
    "rain-dance": (st) => setWeather(st, "rain"),
    "sandstorm": (st) => setWeather(st, "sandstorm"),
    "hail": (st) => setWeather(st, "hail"),
    "snowscape": (st) => setWeather(st, "hail"),
    /* 釘子：撒喺對面嗰邊，最多 3 層 */
    "spikes": (st, side, foeSide, actor, target) => {
      const fs = st[foeSide].side;
      if (fs.spikes >= 3) { log(st, "But it failed!"); return; }
      fs.spikes += 1;
      log(st, `Spikes were scattered all around ${target.name}'s team!`);
    },
    "stealth-rock": (st, side, foeSide, actor, target) => {
      const fs = st[foeSide].side;
      if (fs.stealthRock) { log(st, "But it failed!"); return; }
      fs.stealthRock = true;
      log(st, `Pointed stones float in the air around ${target.name}'s team!`);
    },
    /* 壁：開喺自己嗰邊，5 回合 */
    "reflect": (st, side) => {
      const ms = st[side].side;
      if (ms.reflect > 0) { log(st, "But it failed!"); return; }
      ms.reflect = 5;
      log(st, "Reflect raised your team's Defense!" );
    },
    "light-screen": (st, side) => {
      const ms = st[side].side;
      if (ms.lightScreen > 0) { log(st, "But it failed!"); return; }
      ms.lightScreen = 5;
      log(st, "Light Screen raised your team's Sp. Def!");
    }
  };

  /* ---------- 入場釘子傷害（spikes / stealth-rock） ---------- */
  /* 回傳訊息 list（俾 UI 逐句 narrate）；會直接扣血 */
  function applyEntryHazards(state, side) {
    const msgs = [];
    const p = active(state, side);
    const sd = state[side].side;
    if (!p || p.hp <= 0) return msgs;
    /* Spikes：飛行屬性同 Levitate 免疫（Gen 5） */
    if (sd.spikes > 0) {
      const grounded = !p.types.includes("flying") && p.ability !== "levitate";
      if (grounded) {
        const frac = [0, 1 / 8, 1 / 6, 1 / 4][sd.spikes];
        const dmg = Math.max(1, Math.floor(p.maxHp * frac));
        p.hp = Math.max(0, p.hp - dmg);
        msgs.push(`${p.name} is hurt by spikes!`);
      }
    }
    /* Stealth Rock：岩屬性對入場寵嘅相性 × 1/8 max HP */
    if (sd.stealthRock && p.hp > 0) {
      const mult = (typeof typeMultiplier === "function") ? typeMultiplier("rock", p.types) : 1;
      if (mult > 0) {
        const dmg = Math.max(1, Math.floor(p.maxHp * mult / 8));
        p.hp = Math.max(0, p.hp - dmg);
        msgs.push(`Pointed stones dug into ${p.name}!`);
      }
    }
    if (p.hp > 0) checkHeld(state, p, msgs);
    if (p.hp <= 0) msgs.push(`${p.name} fainted!`);
    return msgs;
  }

  /* ---------- 攜帶樹果（背包第 4b 段；效果跟原作 Gen 7+，自動觸發、食完消失） ----------
     雙方客戶端各自模擬（PvP seed 一致），觸發位要喺兩邊一樣：出招後（目標先、出招者後）、
     回合末、上場、用藥後；抗性／Enigma／Jaboca／Kee 類喺中招嗰下即時判斷 */
  const ALL_CURES = ["burn", "paralyze", "sleep", "poison", "toxic", "freeze", "confusion"];
  const PINCH = 0.25, HALF = 0.5;
  const HELD = {
    "sitrus-berry": { at: HALF, healPct: 25 },
    "oran-berry": { at: HALF, heal: 10 },
    "figy-berry": { at: PINCH, healFrac: 3, dislike: "atk" },
    "wiki-berry": { at: PINCH, healFrac: 3, dislike: "spa" },
    "mago-berry": { at: PINCH, healFrac: 3, dislike: "spe" },
    "aguav-berry": { at: PINCH, healFrac: 3, dislike: "spd" },
    "iapapa-berry": { at: PINCH, healFrac: 3, dislike: "def" },
    "liechi-berry": { at: PINCH, boost: "atk" },
    "ganlon-berry": { at: PINCH, boost: "def" },
    "salac-berry": { at: PINCH, boost: "spe" },
    "petaya-berry": { at: PINCH, boost: "spa" },
    "apicot-berry": { at: PINCH, boost: "spd" },
    "lansat-berry": { at: PINCH, focus: true },
    "starf-berry": { at: PINCH, starf: true },
    "micle-berry": { at: PINCH, micle: true },
    "custap-berry": { custap: true },
    "lum-berry": { cures: ALL_CURES },
    "cheri-berry": { cures: ["paralyze"] },
    "chesto-berry": { cures: ["sleep"] },
    "pecha-berry": { cures: ["poison", "toxic"] },
    "rawst-berry": { cures: ["burn"] },
    "aspear-berry": { cures: ["freeze"] },
    "persim-berry": { cures: ["confusion"] },
    "leppa-berry": { leppa: 10 },
    "enigma-berry": { enigma: true },
    "jaboca-berry": { hurt: "physical" },
    "rowap-berry": { hurt: "special" },
    "kee-berry": { hitBoost: "physical", stat: "def" },
    "maranga-berry": { hitBoost: "special", stat: "spd" },
    "chilan-berry": { resist: "normal", any: true }
  };
  [["occa", "fire"], ["passho", "water"], ["wacan", "electric"], ["rindo", "grass"], ["yache", "ice"], ["chople", "fighting"],
   ["kebia", "poison"], ["shuca", "ground"], ["coba", "flying"], ["payapa", "psychic"], ["tanga", "bug"], ["charti", "rock"],
   ["kasib", "ghost"], ["haban", "dragon"], ["colbur", "dark"], ["babiri", "steel"], ["roseli", "fairy"]]
    .forEach(([k, t]) => { HELD[k + "-berry"] = { resist: t }; });
  const BOOST_NAME = { atk: "Attack", def: "Defense", spa: "Sp. Atk", spd: "Sp. Def", spe: "Speed" };
  const berryLabel = slug => String(slug).replace(/-berry$/, "").replace(/^./, c => c.toUpperCase()) + " Berry";
  function emit(state, out, msg) { if (out) out.push(msg); else log(state, msg); }
  function heldOf(p) { return (p && p.hp > 0 && p.held) ? (HELD[p.held] || null) : null; }
  function eatBerry(state, p, out) {
    const slug = p.held;
    p.held = null; p.heldUsed = slug;
    emit(state, out, `${p.name} ate its ${berryLabel(slug)}!`);
  }
  function healBy(state, p, amount, out) {
    const before = p.hp;
    p.hp = Math.min(p.maxHp, p.hp + amount);
    if (p.hp > before) emit(state, out, `${p.name} recovered ${p.hp - before} HP!`);
  }
  function raiseStat(state, p, key, n, out) {
    p.statStages[key] = Math.min(6, (p.statStages[key] || 0) + n);
    emit(state, out, `${p.name}'s ${BOOST_NAME[key]} ${n >= 2 ? "rose sharply" : "rose"}!`);
  }
  /* 通用觸發：主要狀態／混亂、PP 用完、HP 門檻（≤ 50% 或 ≤ 25%）。out = 訊息 list（冇就寫 log） */
  function checkHeld(state, p, out) {
    const h = heldOf(p);
    if (!h) return false;
    if (h.cures) {
      const st = h.cures.includes(p.status) ? p.status : null;
      const conf = h.cures.includes("confusion") && p.volatile && p.volatile.confusion > 0;
      if (!st && !conf) return false;
      eatBerry(state, p, out);
      if (st) { p.status = null; p.statusTimer = 0; p.severePoison = false; p.odCount = 0; emit(state, out, CURE_LOG[st](p.name)); }
      if (conf) { p.volatile.confusion = 0; emit(state, out, `${p.name} snapped out of its confusion!`); }
      return true;
    }
    if (h.leppa) {
      const mv = (p.moves || []).find(m => m.pp <= 0 && m.maxPp > 0);
      if (!mv) return false;
      eatBerry(state, p, out);
      mv.pp = Math.min(mv.maxPp, h.leppa);
      emit(state, out, `${p.name} restored PP to ${mv.name}!`);
      return true;
    }
    if (!h.at || p.hp > Math.floor(p.maxHp * h.at)) return false;
    /* 原作：升唔到（+6）就唔食 */
    if (h.boost && (p.statStages[h.boost] || 0) >= 6) return false;
    const starfKeys = ["atk", "def", "spa", "spd", "spe"].filter(k => (p.statStages[k] || 0) < 6);
    if (h.starf && !starfKeys.length) return false;
    if ((h.healPct || h.heal || h.healFrac) && p.hp >= p.maxHp) return false;
    eatBerry(state, p, out);
    if (h.healPct || h.heal || h.healFrac) {
      healBy(state, p, h.healPct ? Math.max(1, Math.floor(p.maxHp * h.healPct / 100)) : (h.heal || Math.max(1, Math.floor(p.maxHp / h.healFrac))), out);
      /* Figy 類：性格降嗰項能力 = 唔鍾意嗰種味 → 混亂 */
      const nat = (h.dislike && typeof natureInfo === "function") ? natureInfo(p.nature) : null;
      if (nat && nat.minus === h.dislike && !(p.volatile.confusion > 0) && !(STATUS_IMMUNE[p.ability] || []).includes("confusion")) {
        p.volatile.confusion = 2 + Math.floor(BattleRng.next() * 4);
        emit(state, out, `${p.name} became confused!`);
      }
    } else if (h.boost) raiseStat(state, p, h.boost, 1, out);
    else if (h.focus) { p.volatile.critBoost = (p.volatile.critBoost || 0) + 2; emit(state, out, `${p.name} is getting pumped!`); }
    else if (h.starf) raiseStat(state, p, starfKeys[Math.floor(BattleRng.next() * starfKeys.length)], 2, out);
    else if (h.micle) { p.volatile.micle = true; emit(state, out, `${p.name} boosted the accuracy of its next move!`); }
    return true;
  }
  /* Custap：揀咗出招 + HP ≤ 25% → 回合開始食，同優先度入面先出手（UI 層 call，p1 先 p2 後保持 PvP 一致） */
  function custapCheck(state, side) {
    const p = active(state, side);
    const h = heldOf(p);
    if (!h || !h.custap || p.hp > Math.floor(p.maxHp * PINCH)) return false;
    eatBerry(state, p);
    log(state, `${p.name} can act faster than normal, thanks to its Custap Berry!`);
    return true;
  }
  /* 中招即時判斷：抗性樹果（傷害減半，喺扣血前）；回傳調整後傷害 */
  function resistBerry(state, target, move, damage, effectiveness) {
    const h = heldOf(target);
    if (!h || !h.resist || h.resist !== move.type || !(h.any || effectiveness > 1)) return damage;
    eatBerry(state, target);
    log(state, `The ${berryLabel(target.heldUsed)} weakened the damage to ${target.name}!`);
    return Math.max(1, Math.floor(damage / 2));
  }
  /* 中招後：Jaboca／Rowap（目標暈咗都會觸發）、Enigma、Kee／Maranga */
  function afterHitBerry(state, actor, target, move, effectiveness) {
    const h = target.held ? HELD[target.held] : null;
    if (!h) return;
    if (h.hurt && h.hurt === move.damage_class && actor.hp > 0) {
      eatBerry(state, target);
      actor.hp = Math.max(0, actor.hp - Math.max(1, Math.floor(actor.maxHp / 8)));
      log(state, `${actor.name} was hurt by ${target.name}'s ${berryLabel(target.heldUsed)}!`);
      if (actor.hp <= 0) log(state, `${actor.name} fainted!`);
      return;
    }
    if (target.hp <= 0) return;
    if (h.enigma && effectiveness > 1 && target.hp < target.maxHp) {
      eatBerry(state, target);
      healBy(state, target, Math.max(1, Math.floor(target.maxHp / 4)));
      return;
    }
    if (h.hitBoost && h.hitBoost === move.damage_class && (target.statStages[h.stat] || 0) < 6) {
      eatBerry(state, target);
      raiseStat(state, target, h.stat, 1);
    }
  }

  /* ---------- 單招執行（含多段） ---------- */
  /* 冇晒 PP 時嘅 Struggle：50 威力、無屬性、反動 1/4 傷害（原版行為） */
  const STRUGGLE = {
    slug: "struggle", name: "Struggle", type: "???", power: 50, accuracy: null, pp: null,
    priority: 0, damage_class: "physical", target: "selected-pokemon", effect_chance: null,
    stat_changes: [],
    meta: {
      ailment: "none", ailment_chance: 0, crit_rate: 0, drain: -25,
      flinch_chance: 0, healing: 0, stat_chance: 0, min_hits: null, max_hits: null
    }
  };
  /* 出招 + 出招後攜帶樹果判斷（目標先，出招者後：混亂打自己、反動、PP 用完） */
  function executeMove(state, side, moveIdx) {
    executeMoveCore(state, side, moveIdx);
    checkHeld(state, active(state, otherSide(side)));
    checkHeld(state, active(state, side));
  }
  function executeMoveCore(state, side, moveIdx) {
    const actor = active(state, side);
    const target = active(state, otherSide(side));
    /* 目標已暈（例如被入場釘子打死）：招落空，唔重複計傷 */
    if (actor.hp <= 0 || target.hp <= 0) return;
    let moveObj = actor.moves[moveIdx];
    /* 呢隻 4 招全部冇 PP → 自動出 Struggle，唔會白食回合 */
    const anyPp = actor.moves.some(m => m.pp > 0);
    if ((!moveObj || moveObj.pp <= 0) && !anyPp) moveObj = STRUGGLE;
    if (!moveObj) { log(state, `${actor.name} has no PP left!`); return; }
    if (moveObj !== STRUGGLE) moveObj.pp -= 1;
    const move = moveObj === STRUGGLE ? STRUGGLE : ((typeof moveInfo === "function") ? moveInfo(moveObj.slug) : { name: moveObj.name, type: "normal", power: 0, damage_class: "physical", accuracy: null, priority: 0, meta: {}, stat_changes: [] });

    /* status 阻礙 */
    if (actor.status === "sleep") {
      actor.statusTimer -= 1;
      if (actor.statusTimer <= 0) { actor.status = null; log(state, `${actor.name} woke up!`); }
      else { log(state, `${actor.name} is fast asleep.`); return; }
    }
    if (actor.status === "freeze") {
      if (BattleRng.next() < 0.2) { actor.status = null; log(state, `${actor.name} thawed out!`); }
      else { log(state, `${actor.name} is frozen solid!`); return; }
    }
    if (actor.status === "paralyze" && BattleRng.next() < 0.25) {
      log(state, `${actor.name} is paralyzed! It can't move!`); return;
    }

    /* confusion: 50% 打自己 */
    if (actor.volatile.confusion > 0) {
      actor.volatile.confusion -= 1;
      if (BattleRng.next() < 0.5) {
        const selfDmg = Math.floor(actor.maxHp * 0.125);
        actor.hp = Math.max(0, actor.hp - selfDmg);
        log(state, `${actor.name} is confused! It hurt itself in its confusion!`);
        return;
      }
    }

    /* flinch */
    if (actor.volatile.flinch) { actor.volatile.flinch = false; log(state, `${actor.name} flinched!`); return; }

    log(state, `${actor.name} used ${move.name}!`);
    /* Micle：今招命中 ×1.2（用一次就冇） */
    const micle = !!actor.volatile.micle;
    actor.volatile.micle = false;

    /* ---------- 場地招式（天氣／釘子／壁） ---------- */
    const foeSideKey = otherSide(side);
    if (move.damage_class === "status" && FIELD_MOVES[moveObj.slug]) {
      FIELD_MOVES[moveObj.slug](state, side, foeSideKey, actor, target);
      return;
    }
    /* Weather Ball：有場地天氣時轉屬性＋威力 50→100（Gen 5） */
    let effMove = move;
    if (moveObj.slug === "weather-ball" && state.weather) {
      const wType = { sun: "fire", rain: "water", sandstorm: "rock", hail: "ice" }[state.weather.name];
      if (wType) effMove = Object.assign({}, move, { type: wType, power: 100 });
    }

    /* 特性免疫（Levitate / Volt Absorb / Water Absorb / Flash Fire / Lightning Rod）：
       成招無效，唔進 hit loop */
    if (effMove.power && effMove.damage_class !== "status") {
      const abType = ABIL_IMMUNE_TYPE[target.ability];
      if (abType && abType === effMove.type) {
        if (target.ability === "volt-absorb" || target.ability === "water-absorb") {
          target.hp = Math.min(target.maxHp, target.hp + Math.floor(target.maxHp / 4));
          log(state, `${target.name} absorbed the attack with ${abilityLabel(target.ability)}!`);
        } else if (target.ability === "flash-fire") {
          target.volatile.flashFire = true;
          log(state, `${target.name}'s Flash Fire powered up its Fire-type moves!`);
        } else if (target.ability === "lightning-rod") {
          target.statStages.spa = Math.min(6, (target.statStages.spa || 0) + 1);
          log(state, `${target.name}'s Lightning Rod raised its Sp. Atk!`);
        } else {
          log(state, `It doesn't affect ${target.name}...`);
        }
        return;
      }
    }

    /* status 類招式（damage_class = status）：無傷害，只出效果 */
    const hitCount = (effMove.damage_class === "status") ? 1 : Battle.rollHitCount(effMove.meta && effMove.meta.min_hits, effMove.meta && effMove.meta.max_hits);

    /* 天氣必中（Gen 5）：Blizzard 雹天必中、Thunder 雨天必中 */
    const wName = state.weather && state.weather.name;
    const neverMiss = (moveObj.slug === "blizzard" && wName === "hail") || (moveObj.slug === "thunder" && wName === "rain");

    for (let hit = 0; hit < hitCount; hit++) {
      const accMove = (micle && effMove.accuracy != null) ? Object.assign({}, effMove, { accuracy: effMove.accuracy * 1.2 }) : effMove;
      if (!neverMiss && !hitCheckFor(state, accMove, actor, target)) {
        log(state, `${actor.name}'s attack missed!`);
        continue;
      }
      /* crit：Battle Armor 一律免疫（RNG 照樣消耗，PvP 兩邊序列先一致） */
      /* Lansat：會心等級 +2 */
      let crit = BattleRng.next() < Battle.critChance(((effMove.meta && effMove.meta.crit_rate) || 0) + (actor.volatile.critBoost || 0));
      if (target.ability === "battle-armor") crit = false;
      if (effMove.power && effMove.damage_class !== "status") {
        /* 受壁嗰邊：reflect 擋物理、lightScreen 擋特殊（crit 會喺 engine 無視） */
        const defSide = state[foeSideKey].side;
        let { damage, effectiveness } = Battle.computeDamage(actor, target, effMove, {
          crit,
          weather: wName,
          slug: moveObj.slug,
          reflect: defSide.reflect > 0,
          lightScreen: defSide.lightScreen > 0
        });
        /* 屬性免疫（0 倍）：成招落空，後續效果一律唔出 */
        if (effectiveness === 0) { log(state, `It doesn't affect ${target.name}...`); break; }
        /* 抗性樹果：扣血前減半 */
        damage = resistBerry(state, target, effMove, damage, effectiveness);
        /* Sturdy：滿 HP 食致命傷留 1 HP（Gen 5 規則） */
        if (target.ability === "sturdy" && target.hp === target.maxHp && damage >= target.hp) {
          target.hp = 1;
          log(state, `${target.name} hung on using its Sturdy!`);
        } else {
          target.hp = Math.max(0, target.hp - damage);
        }
        if (crit) log(state, "A critical hit!");
        log(state, `${target.name} took ${damage} damage!` + (effectiveness > 1 ? " It's super effective!" : effectiveness < 1 && effectiveness > 0 ? " It's not very effective..." : ""));
        /* drain（正數吸血／負數反動，Struggle 用 -25） */
        if (move.meta && move.meta.drain) {
          const delta = Math.floor(damage * (move.meta.drain / 100));
          if (delta > 0) {
            actor.hp = Math.min(actor.maxHp, actor.hp + delta);
            log(state, `${actor.name} drained ${delta} HP!`);
          } else if (delta < 0) {
            actor.hp = Math.max(0, actor.hp + delta);
            log(state, `${actor.name} is hit with recoil!`);
            if (actor.hp <= 0) { log(state, `${actor.name} fainted!`); break; }
          }
        }
        afterHitBerry(state, actor, target, effMove, effectiveness);
        if (actor.hp <= 0 && target.hp > 0) break;
      }
      /* healing */
      if (move.meta && move.meta.healing) {
        const heal = Math.floor(actor.maxHp * (move.meta.healing / 100));
        actor.hp = Math.min(actor.maxHp, actor.hp + heal);
        if (heal > 0) log(state, `${actor.name} recovered ${heal} HP!`);
      }
      /* ailment（特性免疫：Insomnia/Limber/Immunity 等）
         PokeAPI 慣例：status 類招式 ailment_chance 記 0 = 必中附加（Spore/Thunder Wave 等），
         直接當 100% 處理；傷害招先至用 chance（thunderbolt 10% 等，全部 >0，已驗證） */
      if (move.meta && move.meta.ailment && move.meta.ailment !== "none") {
        const chance = (move.meta.ailment_chance == null || move.meta.ailment_chance === 0) ? 100 : move.meta.ailment_chance;
        if (BattleRng.next() * 100 < chance) {
          const ail = AILMENT_ALIAS[move.meta.ailment] || move.meta.ailment;
          if ((STATUS_IMMUNE[target.ability] || []).includes(ail)) {
            log(state, `${target.name} is unaffected due to its ${abilityLabel(target.ability)}!`);
          } else if (applyStatus(target, move.meta.ailment)) {
            log(state, `${target.name} is ${statusLabel(move.meta.ailment)}!`);
          }
        }
      }
      /* stat changes（PokeAPI stat 名 → 引擎 key；Hyper Cutter 擋攻擊下降） */
      (move.stat_changes || []).forEach(sc => {
        const tgt = sc.change < 0 ? target : actor;
        const key = STAT_ALIAS[sc.stat] || sc.stat;
        if (sc.change < 0 && key === "atk" && tgt.ability === "hyper-cutter") {
          log(state, `${tgt.name}'s Hyper Cutter prevents Attack loss!`);
          return;
        }
        /* Keen Eye：唔可以被降命中 */
        if (sc.change < 0 && key === "acc" && tgt.ability === "keen-eye") {
          log(state, `${tgt.name}'s Keen Eye prevents accuracy loss!`);
          return;
        }
        tgt.statStages[key] = Math.max(-6, Math.min(6, (tgt.statStages[key] || 0) + sc.change));
        log(state, `${tgt.name}'s ${statLabel(sc.stat)} ${sc.change > 0 ? "rose" : "fell"}!`);
      });
      /* flinch */
      if (move.meta && move.meta.flinch_chance && BattleRng.next() * 100 < move.meta.flinch_chance) {
        target.volatile.flinch = true;
      }
      if (target.hp <= 0) {
        log(state, `${target.name} fainted!`);
        /* 擊倒 → 攻方邊派 EXP（面對過呢隻敵寵嘅寵均分） */
        grantKOExp(state, side, target);
        /* Moxie：擊倒對手後攻擊 +1 */
        if (actor.ability === "moxie" && (actor.statStages.atk || 0) < 6) {
          actor.statStages.atk = (actor.statStages.atk || 0) + 1;
          log(state, `${actor.name}'s Moxie raised its Attack!`);
        }
        break;
      }
    }
  }

  function hitCheckFor(state, move, attacker, defender) {
    return Battle.hitCheck(move, attacker, defender, state.weather && state.weather.name);
  }

  /* ---------- 回合殘留狀態傷害 ---------- */
  function endTurnResidual(state, side) {
    const p = active(state, side);
    if (p.hp <= 0) return;
    const wName = state.weather && state.weather.name;
    /* Hydration：雨天回合結束自動解狀態（所以唔會再食燒傷／毒傷） */
    if (p.ability === "hydration" && wName === "rain" && p.status) {
      p.status = null;
      log(state, `${p.name}'s Hydration cured its status!`);
    }
    if (p.status === "burn") {
      const dmg = Math.floor(p.maxHp / 16);
      p.hp = Math.max(0, p.hp - dmg);
      log(state, `${p.name} is hurt by its burn!`);
    } else if (p.status === "poison") {
      /* 嚴重中毒（用藥過量）：現有中毒數值 ×2 */
      const dmg = Math.floor(p.maxHp / 8) * (p.severePoison ? 2 : 1);
      p.hp = Math.max(0, p.hp - dmg);
      log(state, `${p.name} is hurt by poison!`);
    } else if (p.status === "toxic") {
      p.statusTimer = (p.statusTimer || 0) + 1;
      const dmg = Math.floor(p.maxHp * Math.min(15, p.statusTimer) / 16);
      p.hp = Math.max(0, p.hp - dmg);
      log(state, `${p.name} is hurt by poison!`);
    }
    /* Speed Boost：每回合完速度 +1（頂 +6） */
    if (p.hp > 0 && p.ability === "speed-boost" && (p.statStages.spe || 0) < 6) {
      p.statStages.spe += 1;
      log(state, `${p.name}'s Speed Boost raised its Speed!`);
    }
    /* 天氣 chip damage（Gen 5）：沙暴 1/16（岩/地/鋼免疫）；雹 1/16（冰免疫） */
    if (p.hp > 0 && state.weather) {
      const w = state.weather.name;
      const immune = (w === "sandstorm") ? p.types.some(t => t === "rock" || t === "ground" || t === "steel")
        : (w === "hail") ? p.types.includes("ice") : true;
      if (!immune) {
        p.hp = Math.max(0, p.hp - Math.max(1, Math.floor(p.maxHp / 16)));
        log(state, `${p.name} is buffeted by the ${w === "sandstorm" ? "sandstorm" : "hail"}!`);
      }
    }
    /* 天氣回復／代價（Gen 5）：Rain Dish 雨 +1/16、Ice Body 雹 +1/16、
       Solar Power 晴 -1/8 */
    if (p.hp > 0 && wName) {
      const healAb = wName === "rain" ? "rain-dish" : wName === "hail" ? "ice-body" : null;
      if (healAb && p.ability === healAb) {
        const heal = Math.max(1, Math.floor(p.maxHp / 16));
        p.hp = Math.min(p.maxHp, p.hp + heal);
        log(state, `${p.name} restored a little HP with ${abilityLabel(p.ability)}!`);
      }
      if (wName === "sun" && p.ability === "solar-power") {
        const chip = Math.max(1, Math.floor(p.maxHp / 8));
        p.hp = Math.max(0, p.hp - chip);
        log(state, `${p.name} is hurt by its Solar Power!`);
      }
    }
    /* 攜帶樹果：燒傷／毒／天氣扣到門檻都會食 */
    if (p.hp > 0) checkHeld(state, p);
    /* 壁倒數（每邊各自計） */
    const sd = state[side].side;
    if (sd.reflect > 0 && --sd.reflect === 0) log(state, `Reflect on ${side === "p1" ? "your" : "the foe's"} side wore off!`);
    if (sd.lightScreen > 0 && --sd.lightScreen === 0) log(state, `Light Screen on ${side === "p1" ? "your" : "the foe's"} side wore off!`);
    if (p.hp <= 0) log(state, `${p.name} fainted!`);
  }

  /* ---------- 全場回合末處理（每回合一次）：天氣倒數 ---------- */
  const WEATHER_END_LOG = {
    sun: "The sunlight faded.",
    rain: "The rain stopped.",
    sandstorm: "The sandstorm subsided.",
    hail: "The hail stopped."
  };
  function endTurnField(state) {
    if (!state.weather) return;
    if (--state.weather.turns <= 0) {
      log(state, WEATHER_END_LOG[state.weather.name]);
      state.weather = null;
    }
  }

  /* ---------- 換 Pokémon ---------- */
  function switchTo(state, side, idx) {
    const team = state[side].team;
    if (idx < 0 || idx >= team.length || team[idx].hp <= 0) return false;
    /* 離場方清 volatile（Flash Fire 等換走即消失）+ 離場特性 */
    const out = team[state[side].active];
    if (out) {
      /* Regenerator：換走時回復 1/3 最大 HP */
      if (out.ability === "regenerator" && out.hp > 0 && out.hp < out.maxHp) {
        const heal = Math.floor(out.maxHp / 3);
        out.hp = Math.min(out.maxHp, out.hp + heal);
        log(state, `${out.name} restored HP with Regenerator!`);
      }
      /* Natural Cure：換走時清除所有狀態 */
      if (out.ability === "natural-cure" && out.status) {
        out.status = null;
        log(state, `${out.name} was cured of its status by Natural Cure!`);
      }
      if (out.volatile) { out.volatile.flashFire = false; out.volatile.critBoost = 0; out.volatile.micle = false; }
    }
    state[side].active = idx;
    const p = team[idx];
    /* 換人重置 volatile，但保留 status */
    p.volatile.flinch = false;
    /* 我新上場嗰隻計參與（面對緊對面而家嗰隻） */
    p.participated = true;
    /* 我換咗人 = 對面面對新一隻敵寵 → 對面全隊參與度重設，對面正選自動計 */
    const foeTeam = state[otherSide(side)].team;
    foeTeam.forEach(x => { x.participated = false; });
    const foeActive = foeTeam[state[otherSide(side)].active];
    if (foeActive) foeActive.participated = true;
    log(state, `Go! ${p.name}!`);
    return true;
  }

  /* ---------- 上場特性（Intimidate）：回傳訊息俾 UI 逐句 narrate ---------- */
  function onSwitchIn(state, side) {
    const msgs = [];
    const p = active(state, side);
    const foeP = active(state, otherSide(side));
    /* 帶住育成狀態上場：攜帶解狀態樹果即刻食（跟原作） */
    if (p && p.hp > 0) checkHeld(state, p, msgs);
    if (!p || p.hp <= 0 || !foeP || foeP.hp <= 0) return msgs;
    if (p.ability === "intimidate") {
      if (foeP.ability === "hyper-cutter") {
        msgs.push(`${foeP.name}'s Hyper Cutter prevents Attack loss!`);
      } else if ((foeP.statStages.atk || 0) > -6) {
        foeP.statStages.atk = (foeP.statStages.atk || 0) - 1;
        msgs.push(`${p.name}'s Intimidate cut ${foeP.name}'s Attack!`);
      }
    }
    return msgs;
  }

  /* ---------- Mega 進化（背包第 4c 段；跟原作） ----------
     攜帶對應 Mega 石 + 每場每位訓練家一次；回合開始、出招之前進化（之後速度用 Mega 數值排先後）。
     改屬性、特性、HP 以外嘅能力值同精靈圖；HP 唔變；換走都保持 Mega；戰鬥完自動變返（戰鬥用嘅係副本） */
  function megaOf(p) {
    if (!p || !p.held || typeof MEGA_STONES === "undefined") return null;
    const m = MEGA_STONES[p.held];
    return (m && m.dexId === p.dexId) ? m : null;
  }
  function canMega(state, side) {
    const p = active(state, side);
    return !!(p && p.hp > 0 && !p.mega && !state[side].megaUsed && megaOf(p));
  }
  function megaStats(base, p) {
    const nat = (typeof natureInfo === "function") ? natureInfo(p.nature) : { plus: null, minus: null };
    const maxIv = (typeof MAX_IV !== "undefined") ? MAX_IV : 31;
    const out = {};
    ["atk", "def", "spa", "spd", "spe"].forEach(k => {
      const iv = Number((p.ivs && p.ivs[k]) != null ? p.ivs[k] : maxIv);
      const ev = Number((p.evs && p.evs[k]) || 0);
      const core = Math.floor(((2 * (base[k] || 0) + iv + Math.floor(ev / 4)) * p.level) / 100);
      out[k] = Math.floor((core + 5) * (nat.plus === k ? 1.1 : nat.minus === k ? 0.9 : 1));
    });
    return out;
  }
  /* trainer：「your」／「Ash's」（只係文字，唔影響 RNG） */
  function megaEvolve(state, side, trainer) {
    if (!canMega(state, side)) return false;
    const p = active(state, side);
    const m = megaOf(p);
    log(state, `${p.name}'s ${m.stoneName} is reacting to ${trainer || "its trainer's"} Key Stone!`);
    Object.assign(p.stats, megaStats(m.baseStats, p));
    p.types = m.types.slice();
    p.ability = m.ability;
    p.mega = m.stone;
    p.megaSprite = m.spriteKey;
    p.megaName = m.formName;
    state[side].megaUsed = true;
    log(state, `${p.name} has Mega Evolved into ${m.formName}!`);
    /* 新特性嘅上場效果（例如 Mega Manectric 嘅 Intimidate） */
    onSwitchIn(state, side).forEach(msg => log(state, msg));
    return true;
  }

  /* ---------- 檢查勝負 ---------- */
  function hasUsable(team) { return team.some(p => p.hp > 0); }

  function checkFinished(state) {
    const p1Alive = hasUsable(state.p1.team);
    const p2Alive = hasUsable(state.p2.team);
    if (!p1Alive) { state.finished = true; state.winner = "p2"; }
    else if (!p2Alive) { state.finished = true; state.winner = "p1"; }
    return state.finished;
  }

  function statusLabel(s) {
    return { burn: "burned", paralyze: "paralyzed", paralysis: "paralyzed", poison: "poisoned", toxic: "badly poisoned", sleep: "asleep", freeze: "frozen", confusion: "confused" }[s] || s;
  }

  function statLabel(stat) {
    return {
      hp: "HP", attack: "Attack", defense: "Defense",
      "special-attack": "Sp. Atk", "special-defense": "Sp. Def", speed: "Speed",
      accuracy: "accuracy", evasion: "evasiveness"
    }[stat] || stat;
  }

  /* ---------- 道具（狀態系統第一期：玩家背包 7 種藥 + Revival） ----------
     效果同育成一樣；一回合一件（佔回合）；回復藥只回 HP 唔解狀態；HP 滿照用照扣。
     雙方客戶端各自模擬，所以呢度寫嘅 log 對手畫面都會見到（PvP）。 */
  const ITEMS = {
    potion:        { label: "Potion",        healPct: 25, med: true },
    super_potion:  { label: "Super Potion",  healPct: 50, med: true },
    antidote:      { label: "Antidote",      cures: ["poison", "toxic"], med: true },
    burn_heal:     { label: "Burn Heal",     cures: ["burn"], med: true },
    paralyze_heal: { label: "Paralyze Heal", cures: ["paralyze"], med: true },
    awakening:     { label: "Awakening",     cures: ["sleep"], med: true },
    ice_heal:      { label: "Ice Heal",      cures: ["freeze"], med: true },
    revive:        { label: "Revival",       revive: true }
  };
  const CURE_LOG = {
    poison: n => `${n} was cured of its poisoning!`, toxic: n => `${n} was cured of its poisoning!`,
    burn: n => `${n}'s burn was healed!`, paralyze: n => `${n} was cured of paralysis!`,
    sleep: n => `${n} woke up!`, freeze: n => `${n} thawed out!`
  };
  const aOrAn = w => /^[AEIOU]/i.test(w) ? "an" : "a";

  /* targetIdx：用喺邊隻隊員（跟原作：藥可以用喺後備；Revival 只救 Faint 嘅）；冇傳就用出場中嗰隻 */
  function useItem(state, side, itemId, actorName, targetIdx) {
    const it = ITEMS[itemId];
    if (!it) return false;
    const team = state[side].team;
    const p = (targetIdx != null && team[targetIdx]) ? team[targetIdx] : (it.revive ? null : active(state, side));
    if (!p) return false;
    if (it.revive ? p.hp > 0 : p.hp <= 0) return false;
    /* 先講邊個用咗咩道具，再講效果 */
    if (actorName) log(state, `${actorName} used ${aOrAn(it.label)} ${it.label}!`);
    if (it.revive) {
      Object.assign(p, { hp: p.maxHp, status: null, statusTimer: 0, severePoison: false, odTurns: [], odCount: 0, odHits: 0 });
      log(state, `${p.name} was revived!`);
      return true;
    }
    let effect = false;
    /* 回血：百分比（藥／Sitrus）、定額（Oran +10）、1/3（Figy 等） */
    const heal = it.healPct ? Math.max(1, Math.round(p.maxHp * it.healPct / 100))
      : it.heal ? it.heal : it.healFrac ? Math.max(1, Math.floor(p.maxHp / it.healFrac)) : 0;
    if (heal) {
      const before = p.hp;
      p.hp = Math.min(p.maxHp, p.hp + heal);
      if (p.hp > before) { log(state, `${p.name} recovered ${p.hp - before} HP!`); effect = true; }
    }
    if (it.cures && it.cures.includes(p.status)) {
      const old = p.status;
      p.status = null; p.statusTimer = 0; p.severePoison = false; p.odCount = 0;
      log(state, CURE_LOG[old](p.name));
      effect = true;
    }
    /* 混亂（臨時效果）：Persim／Lum */
    if (it.cures && it.cures.includes("confusion") && p.volatile && p.volatile.confusion > 0) {
      p.volatile.confusion = 0;
      log(state, `${p.name} snapped out of its confusion!`);
      effect = true;
    }
    /* Leppa：PP 最少嗰招回 10 PP */
    if (it.pp) {
      const mv = (p.moves || []).filter(m => m.pp < m.maxPp).sort((a, b) => a.pp - b.pp)[0];
      if (mv) { mv.pp = Math.min(mv.maxPp, mv.pp + it.pp); log(state, `${p.name} restored PP to ${mv.name}!`); effect = true; }
    }
    if (!effect) log(state, "But it had no effect...");
    if (it.med) overdose(state, p);
    /* 用藥過量中毒 → 攜帶 Pecha／Lum 即刻食 */
    if (p.hp > 0) checkHeld(state, p);
    return true;
  }

  /* 戰鬥內用藥過量：5 回合內 3 次 →
     冇主要狀態：中毒 → 中毒期間再 3 次：嚴重中毒 → 再 3 次：Faint
     已有燒傷／麻痹／睡眠／冰凍：唔覆蓋，改為一次性扣血（−25% → −25% → Faint） */
  function overdose(state, p) {
    const t = state.turn;
    p.odTurns = (p.odTurns || []).concat(t).filter(x => x > t - 5).slice(-3);
    const poisoned = p.status === "poison" || p.status === "toxic";
    if (poisoned) {
      p.odCount = (p.odCount || 0) + 1;
      if (p.odCount < 3) return;
      p.odCount = 0; p.odTurns = [];
      if (p.severePoison) { p.hp = 0; log(state, `${p.name} took too much medicine and fainted!`); }
      else { p.status = "poison"; p.statusTimer = 0; p.severePoison = true; log(state, `${p.name} is badly poisoned from too much medicine!`); }
      return;
    }
    if (p.odTurns.length < 3) return;
    p.odTurns = [];
    if (p.status) {
      p.odHits = (p.odHits || 0) + 1;
      if (p.odHits >= 3) { p.hp = 0; log(state, `${p.name} took too much medicine and fainted!`); return; }
      p.hp = Math.max(0, p.hp - Math.floor(p.maxHp / 4));
      log(state, `${p.name} was hurt by too much medicine!`);
      if (p.hp <= 0) log(state, `${p.name} fainted!`);
    } else {
      p.status = "poison"; p.statusTimer = 0; p.severePoison = false; p.odCount = 0;
      log(state, `${p.name} was poisoned by too much medicine!`);
    }
  }

  return {
    create, active, otherSide, log,
    executeMove, endTurnResidual, endTurnField, switchTo, onSwitchIn,
    applyEntryHazards, hasUsable, checkFinished, statusLabel, useItem, ITEMS,
    HELD, checkHeld, custapCheck, berryLabel,
    megaOf, canMega, megaEvolve
  };
})();

if (typeof module !== "undefined" && module.exports) module.exports = BattleState;
