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
  function applyStatus(defender, ailment) {
    if (!ailment || ailment === "none") return false;
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
  function executeMove(state, side, moveIdx) {
    const actor = active(state, side);
    const target = active(state, otherSide(side));
    const moveObj = actor.moves[moveIdx];
    if (!moveObj || moveObj.pp <= 0) { log(state, `${actor.name} 冇 PP 了！`); return; }
    moveObj.pp -= 1;
    const move = (typeof moveInfo === "function") ? moveInfo(moveObj.slug) : { name: moveObj.name, type: "normal", power: 0, damage_class: "physical", accuracy: null, priority: 0, meta: {}, stat_changes: [] };

    /* status 阻礙 */
    if (actor.status === "sleep") {
      actor.statusTimer -= 1;
      if (actor.statusTimer <= 0) { actor.status = null; log(state, `${actor.name} 醒返！`); }
      else { log(state, `${actor.name} 訓緊覺...`); return; }
    }
    if (actor.status === "freeze") {
      if (Math.random() < 0.2) { actor.status = null; log(state, `${actor.name} 解凍！`); }
      else { log(state, `${actor.name} 結凍咗！`); return; }
    }
    if (actor.status === "paralyze" && Math.random() < 0.25) {
      log(state, `${actor.name} 麻痺咗郁唔到！`); return;
    }

    /* confusion: 50% 打自己 */
    if (actor.volatile.confusion > 0) {
      actor.volatile.confusion -= 1;
      if (Math.random() < 0.5) {
        const selfDmg = Math.floor(actor.maxHp * 0.125);
        actor.hp = Math.max(0, actor.hp - selfDmg);
        log(state, `${actor.name} 混亂攻擊自己！受到 ${selfDmg} 傷害`);
        return;
      }
    }

    /* flinch */
    if (actor.volatile.flinch) { actor.volatile.flinch = false; log(state, `${actor.name} 嚇到縮！`); return; }

    log(state, `${actor.name} 使出 ${move.name}！`);

    /* status 類招式（damage_class = status）：無傷害，只出效果 */
    const hitCount = (move.damage_class === "status") ? 1 : Battle.rollHitCount(move.meta && move.meta.min_hits, move.meta && move.meta.max_hits);

    for (let hit = 0; hit < hitCount; hit++) {
      if (!hitCheckFor(move, actor, target)) {
        log(state, `${actor.name} 嘅攻擊唔夠準，打唔中！`);
        continue;
      }
      const crit = Math.random() < Battle.critChance(move.meta && move.meta.crit_rate);
      if (move.power && move.damage_class !== "status") {
        const { damage, effectiveness } = Battle.computeDamage(actor, target, move, { crit });
        target.hp = Math.max(0, target.hp - damage);
        log(state, `對 ${target.name} 造成 ${damage} 傷害` + (effectiveness > 1 ? "（效果絕佳！）" : effectiveness < 1 && effectiveness > 0 ? "（效果唔好...）" : ""));
        /* drain */
        if (move.meta && move.meta.drain) {
          const heal = Math.floor(damage * (move.meta.drain / 100));
          actor.hp = Math.min(actor.maxHp, actor.hp + heal);
          if (heal > 0) log(state, `${actor.name} 吸取咗 ${heal} HP！`);
        }
      }
      /* healing */
      if (move.meta && move.meta.healing) {
        const heal = Math.floor(actor.maxHp * (move.meta.healing / 100));
        actor.hp = Math.min(actor.maxHp, actor.hp + heal);
        if (heal > 0) log(state, `${actor.name} 回復咗 ${heal} HP！`);
      }
      /* ailment */
      if (move.meta && move.meta.ailment && move.meta.ailment !== "none") {
        const chance = (move.meta.ailment_chance == null) ? 100 : move.meta.ailment_chance;
        if (Math.random() * 100 < chance) {
          if (applyStatus(target, move.meta.ailment)) {
            log(state, `${target.name} 陷入 ${statusLabel(move.meta.ailment)} 狀態！`);
          }
        }
      }
      /* stat changes */
      (move.stat_changes || []).forEach(sc => {
        const tgt = sc.change < 0 ? target : actor;
        tgt.statStages[sc.stat] = Math.max(-6, Math.min(6, (tgt.statStages[sc.stat] || 0) + sc.change));
        log(state, `${tgt.name} 嘅 ${sc.stat} ${sc.change > 0 ? "上升" : "下降"}！`);
      });
      /* flinch */
      if (move.meta && move.meta.flinch_chance && Math.random() * 100 < move.meta.flinch_chance) {
        target.volatile.flinch = true;
      }
      if (target.hp <= 0) { log(state, `${target.name} 倒下喇！`); break; }
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
      log(state, `${p.name} 被燒傷，受到 ${dmg} 傷害`);
    } else if (p.status === "poison") {
      const dmg = Math.floor(p.maxHp / 8);
      p.hp = Math.max(0, p.hp - dmg);
      log(state, `${p.name} 中毒，受到 ${dmg} 傷害`);
    } else if (p.status === "toxic") {
      p.statusTimer = (p.statusTimer || 0) + 1;
      const dmg = Math.floor(p.maxHp * Math.min(15, p.statusTimer) / 16);
      p.hp = Math.max(0, p.hp - dmg);
      log(state, `${p.name} 劇毒發作，受到 ${dmg} 傷害`);
    }
    if (p.hp <= 0) log(state, `${p.name} 倒下喇！`);
  }

  /* ---------- 換 Pokémon ---------- */
  function switchTo(state, side, idx) {
    const team = state[side].team;
    if (idx < 0 || idx >= team.length || team[idx].hp <= 0) return false;
    state[side].active = idx;
    const p = team[idx];
    /* 換人重置 volatile，但保留 status */
    p.volatile.flinch = false;
    log(state, `換上 ${p.name}！`);
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
    return { burn: "燒傷", paralyze: "麻痺", poison: "中毒", toxic: "劇毒", sleep: "睡眠", freeze: "冰凍", confusion: "混亂" }[s] || s;
  }

  return {
    create, active, otherSide, log,
    executeMove, endTurnResidual, switchTo,
    hasUsable, checkFinished, statusLabel
  };
})();

if (typeof module !== "undefined" && module.exports) module.exports = BattleState;
