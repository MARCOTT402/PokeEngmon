/* ============================================================
   PokeEngmon Battle - 狀態模型 + 招式執行
   依賴全域：Battle (engine.js) / moveInfo
   ============================================================ */

const BattleState = (() => {
  /* 場地邊狀態（每邊獨立）：釘子層數 0-3、隱形岩、光牆/反射壁回合數 */
  function freshSide() {
    return { spikes: 0, stealthRock: false, reflect: 0, lightScreen: 0 };
  }
  function create(p1Team, p2Team) {
    return {
      p1: { team: p1Team.map(Battle.makeBattlePokemon), active: 0, side: freshSide() },
      p2: { team: p2Team.map(Battle.makeBattlePokemon), active: 0, side: freshSide() },
      /* 天氣：{ name: "sun"|"rain"|"sandstorm"|"hail", turns }；null = 無天氣 */
      weather: null,
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
  /* PokeAPI stat 名 → statStages key（之前冇 map，Growl/Swords Dance 全部寫咗入
     statStages["attack"] 而 effectiveStat 讀 "atk" → stat 招形同虛設） */
  const STAT_ALIAS = {
    attack: "atk", defense: "def", "special-attack": "spa",
    "special-defense": "spd", speed: "spe", accuracy: "acc", evasion: "eva"
  };
  /* 特性擋異常：ability slug → 免疫嘅 status list */
  const STATUS_IMMUNE = {
    insomnia: ["sleep"], "vital-spirit": ["sleep"],
    limber: ["paralyze"], immunity: ["poison", "toxic"]
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
    if (p.hp <= 0) msgs.push(`${p.name} fainted!`);
    return msgs;
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
      if (!neverMiss && !hitCheckFor(effMove, actor, target)) {
        log(state, `${actor.name}'s attack missed!`);
        continue;
      }
      const crit = Math.random() < Battle.critChance(effMove.meta && effMove.meta.crit_rate);
      if (effMove.power && effMove.damage_class !== "status") {
        /* 受壁嗰邊：reflect 擋物理、lightScreen 擋特殊（crit 會喺 engine 無視） */
        const defSide = state[foeSideKey].side;
        const { damage, effectiveness } = Battle.computeDamage(actor, target, effMove, {
          crit,
          weather: wName,
          slug: moveObj.slug,
          reflect: defSide.reflect > 0,
          lightScreen: defSide.lightScreen > 0
        });
        /* 屬性免疫（0 倍）：成招落空，後續效果一律唔出 */
        if (effectiveness === 0) { log(state, `It doesn't affect ${target.name}...`); break; }
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
        if (Math.random() * 100 < chance) {
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
        tgt.statStages[key] = Math.max(-6, Math.min(6, (tgt.statStages[key] || 0) + sc.change));
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
    /* 離場方清 volatile（Flash Fire 等換走即消失） */
    const out = team[state[side].active];
    if (out && out.volatile) out.volatile.flashFire = false;
    state[side].active = idx;
    const p = team[idx];
    /* 換人重置 volatile，但保留 status */
    p.volatile.flinch = false;
    log(state, `Go! ${p.name}!`);
    return true;
  }

  /* ---------- 上場特性（Intimidate）：回傳訊息俾 UI 逐句 narrate ---------- */
  function onSwitchIn(state, side) {
    const msgs = [];
    const p = active(state, side);
    const foeP = active(state, otherSide(side));
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
    executeMove, endTurnResidual, endTurnField, switchTo, onSwitchIn,
    applyEntryHazards, hasUsable, checkFinished, statusLabel
  };
})();

if (typeof module !== "undefined" && module.exports) module.exports = BattleState;
