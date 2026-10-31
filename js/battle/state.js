/* ============================================================
   PokeEngmon Battle - 狀態模型 + 招式執行
   依賴全域：Battle (engine.js) / moveInfo
   ============================================================ */

const BattleState = (() => {
  function create(p1Team, p2Team) {
    return {
      p1: { team: p1Team.map(Battle.makeBattlePokemon), active: 0 },
      p2: { team: p2Team.map(Battle.makeBattlePokemon), active: 0 },
      turn: 0,
      log: [],
      finished: false,
      winner: null
    };
  }

  function active(state, side) { return state[side].team[state[side].active]; }
  function otherSide(side) { return side === "p1" ? "p2" : "p1"; }

  function log(state, msg) { state.log.push({ turn: state.turn, msg }); }

  /* ---------- status 賦予 ---------- */
  /* PokeAPI 嘅 ailment 名稱 → 引擎內部 status key
     （moves.json 用 "paralysis"，引擎同 UI 用 "paralyze"） */
  const AILMENT_ALIAS = { paralysis: "paralyze", "bad-poison": "toxic" };
  function applyStatus(defender, ailment) {
    if (!ailment || ailment === "none") return false;
    ailment = AILMENT_ALIAS[ailment] || ailment;
    /* 已有 status 唔再覆蓋（除咗 toxic 覆蓋 poison） */
    if (defender.status) {
      if (ailment === "toxic" && defender.status === "poison") { defender.status = "toxic"; defender.statusTimer = 0; return true; }
      return false;
    }
    defender.status = ailment;
    defender.statusTimer = 0;
    if (ailment === "sleep") defender.statusTimer = 1 + Math.floor(Math.random() * 3);
    return true;
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
  function executeMove(state, side, moveIdx) {
    const actor = active(state, side);
    const target = active(state, otherSide(side));
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
      if (Math.random() < 0.2) { actor.status = null; log(state, `${actor.name} thawed out!`); }
      else { log(state, `${actor.name} is frozen solid!`); return; }
    }
    if (actor.status === "paralyze" && Math.random() < 0.25) {
      log(state, `${actor.name} is paralyzed! It can't move!`); return;
    }

    /* confusion: 50% 打自己 */
    if (actor.volatile.confusion > 0) {
      actor.volatile.confusion -= 1;
      if (Math.random() < 0.5) {
        const selfDmg = Math.floor(actor.maxHp * 0.125);
        actor.hp = Math.max(0, actor.hp - selfDmg);
        log(state, `${actor.name} is confused! It hurt itself in its confusion!`);
        return;
      }
    }

    /* flinch */
    if (actor.volatile.flinch) { actor.volatile.flinch = false; log(state, `${actor.name} flinched!`); return; }

    log(state, `${actor.name} used ${move.name}!`);

    /* status 類招式（damage_class = status）：無傷害，只出效果 */
    const hitCount = (move.damage_class === "status") ? 1 : Battle.rollHitCount(move.meta && move.meta.min_hits, move.meta && move.meta.max_hits);

    for (let hit = 0; hit < hitCount; hit++) {
      if (!hitCheckFor(move, actor, target)) {
        log(state, `${actor.name}'s attack missed!`);
        continue;
      }
      const crit = Math.random() < Battle.critChance(move.meta && move.meta.crit_rate);
      if (move.power && move.damage_class !== "status") {
        const { damage, effectiveness } = Battle.computeDamage(actor, target, move, { crit });
        target.hp = Math.max(0, target.hp - damage);
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
      }
      /* healing */
      if (move.meta && move.meta.healing) {
        const heal = Math.floor(actor.maxHp * (move.meta.healing / 100));
        actor.hp = Math.min(actor.maxHp, actor.hp + heal);
        if (heal > 0) log(state, `${actor.name} recovered ${heal} HP!`);
      }
      /* ailment */
      if (move.meta && move.meta.ailment && move.meta.ailment !== "none") {
        const chance = (move.meta.ailment_chance == null) ? 100 : move.meta.ailment_chance;
        if (Math.random() * 100 < chance) {
          if (applyStatus(target, move.meta.ailment)) {
            log(state, `${target.name} is ${statusLabel(move.meta.ailment)}!`);
          }
        }
      }
      /* stat changes */
      (move.stat_changes || []).forEach(sc => {
        const tgt = sc.change < 0 ? target : actor;
        tgt.statStages[sc.stat] = Math.max(-6, Math.min(6, (tgt.statStages[sc.stat] || 0) + sc.change));
        log(state, `${tgt.name}'s ${statLabel(sc.stat)} ${sc.change > 0 ? "rose" : "fell"}!`);
      });
      /* flinch */
      if (move.meta && move.meta.flinch_chance && Math.random() * 100 < move.meta.flinch_chance) {
        target.volatile.flinch = true;
      }
      if (target.hp <= 0) { log(state, `${target.name} fainted!`); break; }
    }
  }

  function hitCheckFor(move, attacker, defender) {
    return Battle.hitCheck(move, attacker, defender);
  }

  /* ---------- 回合殘留狀態傷害 ---------- */
  function endTurnResidual(state, side) {
    const p = active(state, side);
    if (p.hp <= 0) return;
    if (p.status === "burn") {
      const dmg = Math.floor(p.maxHp / 16);
      p.hp = Math.max(0, p.hp - dmg);
      log(state, `${p.name} is hurt by its burn!`);
    } else if (p.status === "poison") {
      const dmg = Math.floor(p.maxHp / 8);
      p.hp = Math.max(0, p.hp - dmg);
      log(state, `${p.name} is hurt by poison!`);
    } else if (p.status === "toxic") {
      p.statusTimer = (p.statusTimer || 0) + 1;
      const dmg = Math.floor(p.maxHp * Math.min(15, p.statusTimer) / 16);
      p.hp = Math.max(0, p.hp - dmg);
      log(state, `${p.name} is hurt by poison!`);
    }
    if (p.hp <= 0) log(state, `${p.name} fainted!`);
  }

  /* ---------- 換 Pokémon ---------- */
  function switchTo(state, side, idx) {
    const team = state[side].team;
    if (idx < 0 || idx >= team.length || team[idx].hp <= 0) return false;
    state[side].active = idx;
    const p = team[idx];
    /* 換人重置 volatile，但保留 status */
    p.volatile.flinch = false;
    log(state, `Go! ${p.name}!`);
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

  return {
    create, active, otherSide, log,
    executeMove, endTurnResidual, switchTo,
    hasUsable, checkFinished, statusLabel
  };
})();

if (typeof module !== "undefined" && module.exports) module.exports = BattleState;
