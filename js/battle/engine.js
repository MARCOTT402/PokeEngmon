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
    const r = HIT_ROLLS[Math.floor(Math.random() * HIT_ROLLS.length)];
    return Math.max(minHits, Math.min(maxHits, r));
  }

  /* ---------- 輔助：pokemon 嘅有效數值（含 stage + status + 特性） ---------- */
  /* ignoreStages：Unaware 專用 —— 只忽略 stat stage，burn/特性倍率照計 */
  function effectiveStat(pkmn, key, ignoreStages) {
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
    /* paralyze: speed 減半 */
    if (key === "spe" && pkmn.status === "paralyze") mult *= 0.5;
    return Math.max(1, Math.floor(base * mult));
  }

  function speciesTypes(dexId) {
    const p = (typeof dexOf === "function") ? dexOf(dexId) : null;
    return p ? (p.types || []) : [];
  }

  /* ---------- 命中判定 ---------- */
  function hitCheck(move, attacker, defender) {
    /* 必中招 */
    if (move.accuracy == null) return true;  /* 例如 Swift, 必定命中 */
    const accStage = (attacker.statStages.acc || 0) - (defender.statStages.eva || 0);
    let acc = move.accuracy * accMult(accStage);
    /* 最低 33%、最高 100% */
    acc = Math.max(0.33, Math.min(1, acc / 100));
    return Math.random() < acc;
  }

  /* 夾擊系特性（Overgrow/Blaze/Torrent/Swarm）：HP ≤ 1/3 時對應屬性招 ×1.5 */
  const PINCH_ABILITY = { overgrow: "grass", blaze: "fire", torrent: "water", swarm: "bug" };

  /* ---------- 傷害公式（Gen 5） ---------- */
  function computeDamage(attacker, defender, move, opts) {
    opts = opts || {};
    const level = attacker.level;
    const isPhysical = move.damage_class === "physical";
    const atkKey = isPhysical ? "atk" : "spa";
    const defKey = isPhysical ? "def" : "spd";
    /* Unaware：攻方無視防方 stage；防方無視攻方 stage（其餘倍率照計） */
    const atk = effectiveStat(attacker, atkKey, defender.ability === "unaware");
    const def = Math.max(1, effectiveStat(defender, defKey, attacker.ability === "unaware"));
    /* Solar Beam：雨／沙暴／雹 下威力減半（Gen 5） */
    const weather = opts.weather || null;
    let power = move.power || 0;
    if ((opts.slug === "solar-beam" || move.slug === "solar-beam") &&
        (weather === "rain" || weather === "sandstorm" || weather === "hail")) {
      power = Math.floor(power / 2);
    }

    let base = Math.floor(((2 * level / 5 + 2) * power * atk / def) / 50) + 2;

    /* STAB */
    const atkTypes = speciesTypes(attacker.dexId);
    if (atkTypes.includes(move.type)) base = Math.floor(base * 1.5);

    /* 相剋（0 = 免疫，直接零傷，唔可以俾 min-1 clamp 夾返 1） */
    const defTypes = speciesTypes(defender.dexId);
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

    /* crit: 傷害 ×1.5 (Gen 5), 忽略對方防禦 buff 同我方攻擊 debuff */
    if (opts.crit) base = Math.floor(base * 1.5);

    /* burn: physical 招式威力 ×0.5（除非用 Facade 類，暫略；Guts 喺 effectiveStat 已免疫） */
    if (isPhysical && attacker.status === "burn" && attacker.ability !== "guts" && !opts.crit) base = Math.floor(base * 0.5);

    /* 隨機 0.85 - 1.0 */
    const rand = 0.85 + Math.random() * 0.15;
    base = Math.max(1, Math.floor(base * rand));

    return { damage: base, effectiveness: mult };
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
    return Math.random() < 0.5 ? [a, b] : [b, a];
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
      dexId,
      name,
      level: entry.level,
      types: speciesTypes(dexId),
      stats,
      maxHp: stats.hp,
      hp: stats.hp,
      moves,
      status: null,          /* burn/paralyze/poison/toxic/sleep/freeze/confusion */
      statusTimer: 0,        /* sleep/freeze/toxic 計數 */
      statStages: { atk: 0, def: 0, spa: 0, spd: 0, spe: 0, acc: 0, eva: 0 },
      volatile: { flinch: false, confusion: 0, substitute: 0, flashFire: false },
      /* 特性（slot 1 預設，PokeAPI 非隱藏特性）；冇資料 → null，全部特性效果 skip */
      ability: (typeof abilityOf === "function") ? abilityOf(dexId) : null
    };
  }

  return {
    stageMult, accMult, critChance, rollHitCount,
    effectiveStat, speciesTypes,
    hitCheck, computeDamage, turnOrder, makeBattlePokemon
  };
})();

if (typeof module !== "undefined" && module.exports) module.exports = Battle;
