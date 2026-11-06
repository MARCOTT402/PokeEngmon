/* ============================================================
   PokeEngmon Battle - 核心引擎（Gen 5 規則）
   獨立檔案，唔依賴 DOM，可 node 測試。
   依賴全域：calcStats / moveInfo / typeMultiplier / dexOf / STAT_KEYS
   ============================================================ */

const Battle = (() => {
  /* ---------- stat stage 倍率表 ---------- */
  const STAGE_MULT = [0.25, 0.29, 0.33, 0.4, 0.5, 0.67, 1, 1.5, 2, 2.5, 3, 3.5, 4];
  /* index: stage+6, range 0..12 for -6..+6 */
  function stageMult(stage) {
    const s = Math.max(-6, Math.min(6, stage));
    return STAGE_MULT[s + 6];
  }
  const ACC_EVA_MULT = [0.33, 0.38, 0.43, 0.5, 0.6, 0.75, 1, 1.33, 1.67, 2, 2.33, 2.67, 3];
  function accMult(stage) { const s = Math.max(-6, Math.min(6, stage)); return ACC_EVA_MULT[s + 6]; }

  /* crit rate table (Gen 5): crit_rate in move.meta maps to stage */
  const CRIT_CHANCE = [1 / 16, 1 / 8, 1 / 4, 1 / 3, 1 / 2];
  function critChance(critRate) {
    const idx = Math.max(0, Math.min(4, Math.floor(critRate || 0)));
    return CRIT_CHANCE[idx];
  }

  /* multi-hit distribution: 2-5 hits (Gen 5) */
  const HIT_ROLLS = [2, 2, 2, 3, 3, 3, 4, 5];  /* 3/8 two, 3/8 three, 1/8 four, 1/8 five */
  function rollHitCount(minHits, maxHits) {
    /* 一般招式嘅 meta.min_hits / max_hits 係 null → 單發；
       只有真正連擊招（fury-attack 等 20 招）先會有多段 */
    if (!minHits && !maxHits) return 1;
    minHits = minHits || 2; maxHits = maxHits || 5;
    if (minHits === maxHits) return minHits;
    const r = HIT_ROLLS[Math.floor(BattleRng.next() * HIT_ROLLS.length)];
    return Math.max(minHits, Math.min(maxHits, r));
  }

  /* ---------- 輔助：pokemon 嘅有效數值（含 stage + status + 特性） ---------- */
  /* ignoreStages：Unaware 專用 —— 只忽略 stat stage，burn/特性倍率照計 */
  function effectiveStat(pkmn, key, ignoreStages, weather) {
    const base = pkmn.stats[key] || 0;
    let mult = ignoreStages ? 1 : stageMult(pkmn.statStages[key] || 0);
    if (key === "atk") {
      /* Huge Power / Pure Power：攻擊 ×2 */
      if (pkmn.ability === "huge-power" || pkmn.ability === "pure-power") mult *= 2;
      /* Guts：異常狀態時攻擊 ×1.5，而且 burn 唔再扣攻 */
      if (pkmn.ability === "guts" && pkmn.status) mult *= 1.5;
      /* burn 嘅減傷喺 computeDamage 統一處理（Gen 3+ 規則：physical 傷害 ×0.5，
         唔好喺度再 ×0.5，否則 burn 會 double-dip 變 ×0.25） */
    }
    /* Solar Power：晴天下特攻 ×1.5（扣血喺 endTurnResidual） */
    if (key === "spa" && pkmn.ability === "solar-power" && weather === "sun") mult *= 1.5;
    if (key === "spe") {
      /* paralyze: speed 減半 */
      if (pkmn.status === "paralyze") mult *= 0.5;
      /* 天氣速度特性 ×2（Gen 5） */
      const wSpeed = { sun: "chlorophyll", rain: "swift-swim", sandstorm: "sand-rush" }[weather];
      if (wSpeed && pkmn.ability === wSpeed) mult *= 2;
    }
    return Math.max(1, Math.floor(base * mult));
  }

  function speciesTypes(dexId) {
    const p = (typeof dexOf === "function") ? dexOf(dexId) : null;
    return p ? (p.types || []) : [];
  }

  /* ---------- 命中判定 ---------- */
  function hitCheck(move, attacker, defender, weather) {
    /* 必中招 */
    if (move.accuracy == null) return true;  /* 例如 Swift, 必定命中 */
    const accStage = (attacker.statStages.acc || 0) - (defender.statStages.eva || 0);
    let acc = move.accuracy * accMult(accStage);
    /* Sand Veil / Snow Cloak：對應天氣下迴避 ×1.25（即攻方命中 ×0.8） */
    if (defender.ability === "sand-veil" && weather === "sandstorm") acc *= 0.8;
    if (defender.ability === "snow-cloak" && weather === "hail") acc *= 0.8;
    /* 最低 33%、最高 100% */
    acc = Math.max(0.33, Math.min(1, acc / 100));
    return BattleRng.next() < acc;
  }

  /* ---------- 招式分類（Mega 特性用；資料冇 flag，跟原作手列） ---------- */
  const BITE_MOVES = new Set(["bite", "crunch", "fire-fang", "ice-fang", "thunder-fang", "poison-fang", "hyper-fang",
    "psychic-fangs", "jaw-lock", "fishious-rend"]);
  const PULSE_MOVES = new Set(["water-pulse", "aura-sphere", "dark-pulse", "dragon-pulse", "origin-pulse", "terrain-pulse"]);
  const SLICE_MOVES = new Set(["cut", "slash", "night-slash", "leaf-blade", "psycho-cut", "x-scissor", "air-slash", "air-cutter",
    "razor-leaf", "sacred-sword", "secret-sword", "fury-cutter", "cross-poison", "aerial-ace", "razor-shell", "solar-blade",
    "behemoth-blade", "stone-axe", "ceaseless-edge", "kowtow-cleave", "bitter-blade", "aqua-cutter", "psyblade", "tachyon-cutter",
    "mighty-cleave", "population-bomb"]);
  /* 物理招預設係接觸招；以下係唔接觸嘅物理招 */
  const NONCONTACT_PHYSICAL = new Set(["earthquake", "magnitude", "bulldoze", "rock-slide", "rock-throw", "stone-edge", "rock-blast",
    "rock-tomb", "smack-down", "bullet-seed", "icicle-spear", "icicle-crash", "pin-missile", "seed-bomb", "bone-club", "bonemerang",
    "bone-rush", "egg-bomb", "explosion", "self-destruct", "poison-sting", "razor-leaf", "twineedle", "spike-cannon", "barrage",
    "sand-tomb", "fling", "gunk-shot", "psycho-cut", "ice-shard", "sky-attack", "sacred-fire", "fusion-bolt", "freeze-shock",
    "stone-axe", "rock-wrecker", "drum-beating", "scale-shot", "pay-day", "beat-up", "present", "magnet-bomb", "spikes", "struggle"]);
  function isContact(move, slug) {
    return move.damage_class === "physical" && !NONCONTACT_PHYSICAL.has(slug || move.slug || "");
  }
  /* 攻方特性嘅威力倍率（Mega 特性：Tough Claws／Strong Jaw／Mega Launcher／Sharpness／Sand Force…） */
  function abilityPowerMult(attacker, move, slug, weather, opts) {
    const a = attacker.ability;
    let m = 1;
    if (a === "tough-claws" && isContact(move, slug)) m *= 1.3;
    if (a === "strong-jaw" && BITE_MOVES.has(slug)) m *= 1.5;
    if (a === "mega-launcher" && PULSE_MOVES.has(slug)) m *= 1.5;
    if (a === "sharpness" && SLICE_MOVES.has(slug)) m *= 1.5;
    if (a === "sand-force" && weather === "sandstorm" && ["rock", "ground", "steel"].includes(move.type)) m *= 1.3;
    if (opts.sheerForce) m *= 1.3;
    if (opts.ate) m *= 1.2;   /* Aerilate／Pixilate／Refrigerate／Dragonize（Gen 7+ ×1.2） */
    if (opts.terrainBoost) m *= 1.3;   /* Electric Terrain：着地嘅電招 ×1.3 */
    return m;
  }

  /* 夾擊系特性（Overgrow/Blaze/Torrent/Swarm）：HP ≤ 1/3 時對應屬性招 ×1.5 */
  const PINCH_ABILITY = { overgrow: "grass", blaze: "fire", torrent: "water", swarm: "bug" };

  /* 數值兜底（Rule 99）：任何一個 stat／level／power 係 undefined／NaN，傷害就變 NaN，
     HP 變 NaN 之後 `hp <= 0` 永遠唔成立 → 戰鬥卡死。只修正輸入值，唔改 BattleRng 抽數次序（PvP 兩邊要算到一樣） */
  const _fin = (v, d) => { const n = typeof v === "number" ? v : Number(v); return Number.isFinite(n) ? n : d; };
  function _numReport(where, detail) {
    try { if (typeof window !== "undefined" && window.Guard) Guard.report(new Error("Battle NaN guard: " + where + " " + detail), { where: "battle/" + where, silent: true }); } catch (e) {}
  }

  /* ---------- 傷害公式（Gen 5） ---------- */
  function computeDamage(attacker, defender, move, opts) {
    opts = opts || {};
    const level = Math.min(100, Math.max(1, _fin(attacker.level, 1)));
    const isPhysical = move.damage_class === "physical";
    const atkKey = isPhysical ? "atk" : "spa";
    const defKey = isPhysical ? "def" : "spd";
    /* Unaware：攻方無視防方 stage；防方無視攻方 stage（其餘倍率照計） */
    const atk = Math.max(1, _fin(effectiveStat(attacker, atkKey, defender.ability === "unaware"), 1));
    const def = Math.max(1, _fin(effectiveStat(defender, defKey, attacker.ability === "unaware"), 1));
    /* Solar Beam：雨／沙暴／雹 下威力減半（Gen 5） */
    const weather = opts.weather || null;
    let power = Math.max(0, _fin(move.power, 0));
    if ((opts.slug === "solar-beam" || move.slug === "solar-beam") &&
        (weather === "rain" || weather === "sandstorm" || weather === "hail")) {
      power = Math.floor(power / 2);
    }
    /* Technician：威力 ≤ 60 嘅招 ×1.5（Gen 5 計喺基礎威力） */
    if (attacker.ability === "technician" && power > 0 && power <= 60) {
      power = Math.floor(power * 1.5);
    }
    /* Mega 特性威力倍率 */
    const pm = power > 0 ? abilityPowerMult(attacker, move, opts.slug || move.slug, weather, opts) : 1;
    if (pm !== 1) power = Math.floor(power * pm);

    let base = Math.floor(((2 * level / 5 + 2) * power * atk / def) / 50) + 2;

    /* STAB（Adaptability 由 1.5 → 2.0） */
    /* 用戰鬥中嘅屬性（Mega 進化會變屬性）；冇就用物種屬性 */
    const atkTypes = (attacker.types && attacker.types.length) ? attacker.types : speciesTypes(attacker.dexId);
    if (atkTypes.includes(move.type)) base = Math.floor(base * (attacker.ability === "adaptability" ? 2 : 1.5));

    /* 相剋（0 = 免疫，直接零傷，唔可以俾 min-1 clamp 夾返 1） */
    let defTypes = (defender.types && defender.types.length) ? defender.types : speciesTypes(defender.dexId);
    /* Scrappy：一般／格鬥招打得中幽靈 */
    if (attacker.ability === "scrappy" && (move.type === "normal" || move.type === "fighting")) defTypes = defTypes.filter(t => t !== "ghost");
    const mult = (typeof typeMultiplier === "function") ? typeMultiplier(move.type, defTypes) : 1;
    if (mult === 0) return { damage: 0, effectiveness: 0 };
    base = Math.floor(base * mult);

    /* 夾擊系特性：HP ≤ 1/3 觸發 */
    const pinchType = PINCH_ABILITY[attacker.ability];
    if (pinchType === move.type && attacker.hp <= Math.floor((attacker.maxHp || 1) / 3)) {
      base = Math.floor(base * 1.5);
    }
    /* Flash Fire：吸收火招後，自己火招 ×1.5（換走即消失） */
    if (attacker.volatile && attacker.volatile.flashFire && move.type === "fire") {
      base = Math.floor(base * 1.5);
    }
    /* Thick Fat：火／冰傷害減半 */
    if (defender.ability === "thick-fat" && (move.type === "fire" || move.type === "ice")) {
      base = Math.floor(base * 0.5);
    }
    /* Multiscale：滿 HP 受傷減半；Filter：效果絕佳嘅傷害 ×0.75 */
    if (defender.ability === "multiscale" && defender.hp >= defender.maxHp) base = Math.floor(base * 0.5);
    if (defender.ability === "filter" && mult > 1) base = Math.floor(base * 0.75);
    /* Aura Guard（Mega Lucario Z，Pokémon Champions）：受接觸類招式傷害減半 */
    if (defender.ability === "aura-guard" && isContact(move, opts.slug || move.slug)) base = Math.floor(base * 0.5);

    /* 天氣倍率（Gen 5）：日照火×1.5／水×0.5；下雨水×1.5／火×0.5 */
    if (weather === "sun") {
      if (move.type === "fire") base = Math.floor(base * 1.5);
      else if (move.type === "water") base = Math.floor(base * 0.5);
    } else if (weather === "rain") {
      if (move.type === "water") base = Math.floor(base * 1.5);
      else if (move.type === "fire") base = Math.floor(base * 0.5);
    }

    /* 光牆／反射壁：受壁嗰邊受到嘅物理（Reflect）／特殊（Light Screen）傷害減半；
       crit 會無視壁（Gen 5 規則），所以喺 crit 倍率之前、且 crit 時唔乘 */
    if (!opts.crit) {
      if (isPhysical && opts.reflect) base = Math.floor(base * 0.5);
      if (!isPhysical && opts.lightScreen) base = Math.floor(base * 0.5);
    }

    /* crit: 傷害 ×1.5 (Gen 5), 忽略對方防禦 buff 同我方攻擊 debuff；Sniper 再 ×1.5 */
    if (opts.crit) base = Math.floor(base * (attacker.ability === "sniper" ? 2.25 : 1.5));

    /* burn: physical 招式威力 ×0.5（除非用 Facade 類，暫略；Guts 喺 effectiveStat 已免疫） */
    if (isPhysical && attacker.status === "burn" && attacker.ability !== "guts" && !opts.crit) base = Math.floor(base * 0.5);

    /* 隨機 0.85 - 1.0 */
    const rand = 0.85 + BattleRng.next() * 0.15;
    base = Math.max(1, Math.floor(base * rand));
    /* Math.max(1, NaN) 都係 NaN：最後一道防線（例如 typeMultiplier 回 undefined） */
    if (!Number.isFinite(base)) {
      _numReport("computeDamage", (attacker.name || "?") + "→" + (defender.name || "?") + " " + (opts.slug || move.slug || ""));
      base = 1;
    }

    return { damage: base, effectiveness: Number.isFinite(mult) ? mult : 1 };
  }

  /* ---------- 行動順序 ---------- */
  /* action: { kind: "move"|"switch", priority, speed, tiebreak } */
  function turnOrder(a, b) {
    /* switch 永遠最高優先 */
    const ap = a.kind === "switch" ? 6 : (a.priority || 0);
    const bp = b.kind === "switch" ? 6 : (b.priority || 0);
    if (ap !== bp) return ap > bp ? [a, b] : [b, a];
    /* 同優先：速度高先出 */
    const as = a.speed || 0, bs = b.speed || 0;
    if (as !== bs) return as > bs ? [a, b] : [b, a];
    /* 同速：隨機 */
    return BattleRng.next() < 0.5 ? [a, b] : [b, a];
  }

  /* ---------- 用 entry 建立戰鬥用 pokemon ---------- */
  function makeBattlePokemon(entry) {
    let dexId, name = "";
    if (entry.chainKey) {
      const cur = (typeof entryCurrentSpecies === "function") ? entryCurrentSpecies(entry) : [entry.dexId, ""];
      dexId = cur[0]; name = cur[1] || "";
    } else {
      dexId = entry.dexId;
      const p = (typeof dexOf === "function") ? dexOf(dexId) : null;
      name = p ? (p.name || "") : ("#" + dexId);
    }
    const stats = (typeof calcStats === "function")
      ? calcStats(dexId, entry.level, entry.ivs, entry.evs, entry.nature)
      : entry.stats;
    const moves = (entry.moves || []).filter(Boolean).map(slug => {
      const m = (typeof moveInfo === "function") ? moveInfo(slug) : { name: slug, pp: 10 };
      return { slug, name: m.name, pp: m.pp || 1, maxPp: m.pp || 1 };
    });
    return {
      uid: entry.uid,
      dexId,
      name,
      level: entry.level,
      expLevel: entry.expLevel != null ? entry.expLevel : entry.level,   /* Inferno Level Sync 後，戰鬥用 level 但 EXP 計算用 sync 前真實等級 */
      types: speciesTypes(dexId),
      stats,
      maxHp: stats.hp,
      /* 狀態系統第一期：玩家隊伍帶住育成嘅 HP（千分比）同主要狀態入場；AI 隊伍冇呢啲欄位 = 滿血 */
      hp: careHp(entry, stats.hp),
      moves,
      status: careStatus(entry),   /* burn/paralyze/poison/toxic/sleep/freeze */
      statusTimer: careSleepTurns(entry),   /* sleep 剩餘回合（帶睡眠入場重新抽 1–3）/ toxic 計數 */
      severePoison: entry.battleStatus === "psn" && Number(entry.battlePoison) >= 2,   /* 嚴重中毒：毒傷 ×2 */
      odTurns: [], odCount: 0, odHits: 0,   /* 戰鬥內用藥過量追蹤 */
      statStages: { atk: 0, def: 0, spa: 0, spd: 0, spe: 0, acc: 0, eva: 0 },
      volatile: { flinch: false, confusion: 0, substitute: 0, flashFire: false, critBoost: 0, micle: false },
      /* 背包第 4b 段：攜帶樹果（自動觸發、食完消失）；性格俾 Figy 類樹果判斷「唔鍾意嘅味」 */
      nature: entry.nature || "hardy",
      /* 攜帶樹果或者 Mega 石（第 4c 段）；進化石戰鬥冇效果唔帶 */
      held: (typeof entry.heldItem === "string" && (/-berry$/.test(entry.heldItem) || (typeof MEGA_STONES !== "undefined" && MEGA_STONES[entry.heldItem]))) ? entry.heldItem : null,
      heldUsed: null,
      /* Mega 進化要用嚟重計能力值 */
      ivs: entry.ivs || {}, evs: entry.evs || {},
      /* 特性：entry 已經 roll 咗嘅就用嗰個；未 roll（舊存檔／新捕捉）先用 slot 1 */
      ability: (typeof entry.ability === "string" && entry.ability)
        ? entry.ability
        : ((typeof abilityOf === "function") ? abilityOf(dexId) : null)
    };
  }

  /* 育成狀態 → 戰鬥：HP 千分比換實數（未 Faint 最少 1） */
  function careHp(entry, maxHp) {
    if (entry.battleHp == null) return maxHp;
    const pm = Math.max(0, Math.min(1000, Number(entry.battleHp)));
    if (pm <= 0) return 0;
    return Math.max(1, Math.round(maxHp * pm / 1000));
  }
  function careStatus(entry) {
    return { brn: "burn", par: "paralyze", slp: "sleep", frz: "freeze", psn: "poison" }[entry.battleStatus] || null;
  }
  /* 帶睡眠入場：1–3 回合。唔用 BattleRng（PvP 兩邊建隊次序唔同會亂 RNG），用 entry 資料決定，兩邊一致 */
  function careSleepTurns(entry) {
    if (entry.battleStatus !== "slp") return 0;
    return 1 + ((Number(entry.dexId) || 0) + (Number(entry.level) || 0)) % 3;
  }

  return {
    stageMult, accMult, critChance, rollHitCount,
    effectiveStat, speciesTypes, isContact,
    hitCheck, computeDamage, turnOrder, makeBattlePokemon
  };
})();

if (typeof module !== "undefined" && module.exports) module.exports = Battle;
