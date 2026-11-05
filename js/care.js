/* ============================================================
   Care — 飽肚值・HP・狀態・用藥（狀態系統第一期）
   ------------------------------------------------------------
   Spec：.trae/documents/status-hp-system-spec-20261105.md
   規則同 supabase-migrate-20261105c-care-status-phase1.sql 一致：
   - 登入：一律經 RPC（care_settle / care_feed / care_use_item / award_meds /
     settle_battle_team），server 結果覆蓋本地；本地規則只做兩次結算之間嘅顯示。
   - 未登入（guest）：本地規則就係權威。
   entry.pet 欄位：
     health   飽肚值 0–100（舊名沿用；DB = pet_health）   updatedAt 飽肚值錨點
     hp       HP 千分比 0–1000（0 = Faint）               careAt    HP 流失錨點
     status   null|brn|par|slp|frz|psn                     poison    psn 時 1 中毒／2 嚴重中毒
     statusSince 睡眠／冰凍開始（30 分鐘自然解除）          medLog    最近用藥時間戳（1 分鐘窗口）
     od       中毒期間累計用藥次數                          vomit     嘔吐階梯 0–2
   ============================================================ */
const Care = (() => {
  const MED_KINDS = ["potion", "super_potion", "antidote", "burn_heal", "paralyze_heal", "awakening", "ice_heal"];
  const ITEM_SPRITE = slug => `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/${slug}.png`;
  const MED_INFO = {
    potion:        { name: "Potion",        sprite: "potion",        effect: "+25% HP" },
    super_potion:  { name: "Super Potion",  sprite: "super-potion",  effect: "+50% HP" },
    antidote:      { name: "Antidote",      sprite: "antidote",      effect: "Cures poison", cures: "psn" },
    burn_heal:     { name: "Burn Heal",     sprite: "burn-heal",     effect: "Cures burn", cures: "brn" },
    paralyze_heal: { name: "Paralyze Heal", sprite: "paralyze-heal", effect: "Cures paralysis", cures: "par" },
    awakening:     { name: "Awakening",     sprite: "awakening",     effect: "Cures sleep", cures: "slp" },
    ice_heal:      { name: "Ice Heal",      sprite: "ice-heal",      effect: "Cures freeze", cures: "frz" }
  };
  const STATUS_INFO = {
    brn: { label: "Burned",         icon: "brn", note: "Loses 0.5% HP per minute. Fullness drops 1.5× faster. Use a Burn Heal." },
    par: { label: "Paralyzed",      icon: "par", note: "Can't eat food. Use a Paralyze Heal." },
    slp: { label: "Asleep",         icon: "slp", note: "Can't eat food. Wakes up by itself after 30 minutes, or use an Awakening." },
    frz: { label: "Frozen",         icon: "frz", note: "Can't eat food. Thaws by itself after 30 minutes, or use an Ice Heal." },
    psn: { label: "Poisoned",       icon: "psn", note: "Loses 1% HP per minute. Use an Antidote." },
    tox: { label: "Badly poisoned", icon: "tox", note: "Loses 2% HP per minute. Use an Antidote." }
  };
  const REASON_TEXT = {
    fainted: "It has fainted — use a Revival first",
    not_fainted: "Revival only works on a fainted Pokémon",
    no_item: "No item left",
    status_par: "It's paralyzed and can't eat — use a Paralyze Heal",
    status_slp: "It's asleep and can't eat — use an Awakening",
    status_frz: "It's frozen and can't eat — use an Ice Heal",
    bad_item: "This item can't be used here",
    bad_kind: "This item can't be used here",
    not_found: "Pokémon not found",
    offline: "Couldn't reach the server — try again"
  };
  const SLEEP_MS = 30 * 60 * 1000;
  const CAP_MS = 60 * 24 * 3600 * 1000;

  const now = () => (window.Pet && Pet.nowTs) ? Pet.nowTs() : Date.now();
  const iso = ms => new Date(ms).toISOString();
  const ms = v => { const t = v ? Date.parse(v) : NaN; return isFinite(t) ? t : null; };

  /* ---------- 欄位補齊（舊存檔：飽肚值 0 → Faint，否則滿血） ---------- */
  function ensure(p) {
    if (!p) return p;
    if (typeof p.hp !== "number" || !isFinite(p.hp)) p.hp = (typeof p.health === "number" && p.health <= 0) ? 0 : 1000;
    if (!["brn", "par", "slp", "frz", "psn"].includes(p.status)) p.status = null;
    if (typeof p.poison !== "number") p.poison = 0;
    if (!Array.isArray(p.medLog)) p.medLog = [];
    if (typeof p.od !== "number") p.od = 0;
    if (typeof p.vomit !== "number") p.vomit = 0;
    if (!p.careAt) p.careAt = iso(now());
    return p;
  }

  /* ---------- 時間結算（同 _care_settle_user 一致） ---------- */
  function settleOne(p, isActive, nowMs) {
    ensure(p);
    const before = JSON.stringify([p.health, p.hp, p.status, p.poison]);
    let full = typeof p.health === "number" ? p.health : 100;
    let hp = p.hp, st = p.status, pl = p.poison || 0, vomit = p.vomit || 0;
    let fa = Math.max(ms(p.updatedAt) ?? nowMs, nowMs - CAP_MS);
    let ca = Math.max(ms(p.careAt) ?? nowMs, nowMs - CAP_MS);
    let since = ms(p.statusSince);
    if (isActive && hp > 0) {
      const per = st === "brn" ? 600000 : 900000;
      const loss = Math.floor((nowMs - fa) / per);
      if (loss > 0 && full > 0) { full = Math.max(0, full - loss); fa += loss * per; }
      const rate = st === "brn" ? 5 : (st === "psn" && pl >= 2) ? 20 : st === "psn" ? 10 : 0;
      const min = Math.floor((nowMs - ca) / 60000);
      if (rate > 0 && min > 0) { hp = Math.max(0, hp - rate * min); ca += min * 60000; }
      else if (rate === 0) ca = nowMs;
    } else { fa = nowMs; ca = nowMs; }
    if ((st === "slp" || st === "frz") && since != null && since + SLEEP_MS <= nowMs) st = null;
    if (full <= 0) { full = 0; hp = 0; }
    if (hp <= 0) { hp = 0; st = null; }
    if (st !== "psn") pl = 0;
    if (st !== "slp" && st !== "frz") since = null;
    if (full < 100) vomit = 0;
    Object.assign(p, { health: full, hp, status: st, poison: pl, vomit, updatedAt: iso(fa), careAt: iso(ca), statusSince: since == null ? null : iso(since) });
    return before !== JSON.stringify([p.health, p.hp, p.status, p.poison]);
  }

  function settleAll(entries, activeUid, nowMs) {
    let changed = false;
    (entries || []).forEach(e => {
      if (!e.pet || typeof e.pet !== "object") e.pet = {};
      if (typeof e.pet.health !== "number") e.pet.health = 100;
      if (settleOne(e.pet, e.uid === activeUid, nowMs)) changed = true;
    });
    return changed;
  }

  /* ---------- 餵食（同 care_feed 一致；唔處理背包數量） ---------- */
  function feedRule(p, kind) {
    ensure(p);
    if (p.hp <= 0) return { ok: false, reason: "fainted" };
    if (["par", "slp", "frz"].includes(p.status)) return { ok: false, reason: "status_" + p.status };
    let event = "fed";
    if (p.health >= 100) {
      p.vomit += 1;
      if (p.vomit >= 3 || p.hp <= 250) { p.hp = 0; p.vomit = 0; event = "faint"; }
      else { p.hp -= 250; event = p.vomit === 1 ? "vomit" : "vomit_severe"; }
    } else {
      p.health = Math.min(100, p.health + (kind === "premium" ? 50 : 25));
      p.vomit = 0;
    }
    if (p.hp <= 0) { p.status = null; p.poison = 0; p.statusSince = null; }
    return { ok: true, event };
  }

  /* ---------- 用藥（同 care_use_item 一致；唔處理背包數量） ---------- */
  function useRule(p, item, nowMs) {
    ensure(p);
    if (item === "revive") {
      if (p.hp > 0) return { ok: false, reason: "not_fainted" };
      Object.assign(p, { hp: 1000, health: 100, status: null, poison: 0, statusSince: null, od: 0, medLog: [], vomit: 0, careAt: iso(nowMs), updatedAt: iso(nowMs) });
      return { ok: true, event: "revived" };
    }
    if (!MED_INFO[item]) return { ok: false, reason: "bad_item" };
    if (p.hp <= 0) return { ok: false, reason: "fainted" };
    const prevSt = p.status;
    let { hp, status: st, poison: pl, od } = p;
    if (item === "potion") hp = Math.min(1000, hp + 250);
    else if (item === "super_potion") hp = Math.min(1000, hp + 500);
    else if (MED_INFO[item].cures === st) { st = null; if (item === "antidote") { pl = 0; od = 0; } }
    let log = p.medLog.concat(nowMs).filter(t => t > nowMs - 60000).sort((a, b) => a - b).slice(-3);
    let event = "used";
    if (st === "psn") {
      od += 1;
      if (od >= 3) {
        if (pl >= 2) { hp = 0; event = "od_faint"; }
        else { pl = 2; od = 0; event = "od_severe"; }
      }
    } else if (log.length >= 3) { st = "psn"; pl = 1; od = 0; log = []; event = "od_poison"; }
    if (hp <= 0) { hp = 0; st = null; pl = 0; od = 0; }
    Object.assign(p, { hp, status: st, poison: pl, od, medLog: log });
    if (st !== "slp" && st !== "frz") p.statusSince = null;
    if ((st === "psn" || st === "brn") && prevSt !== st) p.careAt = iso(nowMs);
    return { ok: true, event };
  }

  /* ---------- 顯示用 ---------- */
  function maxHp(entry) {
    try {
      const cur = entryCurrentSpecies(entry);
      const s = calcStats(cur[0], entry.level || 1, entry.ivs, entry.evs, entry.nature);
      return (s && s.hp) || 0;
    } catch (e) { return 0; }
  }
  /* 千分比 → 實數；未 Faint 但換算係 0 → 顯示 1 */
  function hpOf(entry) {
    const p = ensure(entry && entry.pet ? entry.pet : { health: 100 });
    const max = maxHp(entry);
    let cur = Math.round(max * p.hp / 1000);
    if (p.hp > 0 && cur <= 0) cur = 1;
    return { cur, max, permille: p.hp, pct: p.hp / 10, faint: p.hp <= 0 };
  }
  function isFaint(entry) { return !!(entry && entry.pet && ensure(entry.pet).hp <= 0); }
  function statusKey(p) {
    if (!p || !p.status) return null;
    return p.status === "psn" && p.poison >= 2 ? "tox" : p.status;
  }
  function sleepLeftMs(p) {
    if (!p || (p.status !== "slp" && p.status !== "frz")) return 0;
    const s = ms(p.statusSince);
    return s == null ? SLEEP_MS : Math.max(0, s + SLEEP_MS - now());
  }
  function eventText(ev, name, item) {
    return {
      fed: `${name} ate it happily!`,
      vomit: `${name} ate too much and threw up! (−25% HP)`,
      vomit_severe: `${name} threw up badly! (−25% HP) One more and it faints!`,
      faint: `${name} ate way too much and fainted!`,
      revived: `${name} was revived!`,
      used: `Used ${item}.`,
      od_poison: `Too much medicine! ${name} is poisoned!`,
      od_severe: `Too much medicine! ${name} is badly poisoned!`,
      od_faint: `Too much medicine! ${name} fainted!`
    }[ev] || "";
  }

  /* ---------- server ---------- */
  function online() { return !!(window.SupabaseAuth && SupabaseAuth.isLoggedIn && SupabaseAuth.isLoggedIn()); }
  async function rpc(name, payload) {
    if (!online() || !SupabaseAuth._rpc) return null;
    return await SupabaseAuth._rpc(name, payload);
  }

  /* server care 狀態 → 本地 entry.pet + 背包 */
  function applyState(state) {
    if (!state || !Array.isArray(state.entries)) return false;
    const st = loadState();
    const byId = {};
    state.entries.forEach(r => { byId[r.id] = r; });
    st.entries.forEach(e => {
      const r = byId[e.uid]; if (!r) return;
      if (!e.pet || typeof e.pet !== "object") e.pet = {};
      Object.assign(e.pet, {
        health: r.fullness == null ? 100 : Number(r.fullness),
        hp: r.hp == null ? 1000 : Number(r.hp),
        status: r.status || null,
        poison: Number(r.poison) || 0,
        statusSince: r.status_since || null,
        vomit: Number(r.vomit) || 0,
        od: Number(r.od) || 0,
        updatedAt: r.fullness_at || e.pet.updatedAt || iso(now()),
        careAt: r.care_at || iso(now())
      });
    });
    if (state.items && window.Pet && Pet.items) {
      const bag = Pet.items();
      const m = state.items.meds || {};
      MED_KINDS.forEach(k => { bag[k] = Math.max(0, Number(m[k]) || 0); });
      ["food", "premium", "revive"].forEach(k => {
        if (state.items[k] != null) bag[k] = Math.max(0, Number(state.items[k]) || 0);
      });
    }
    saveState();
    return true;
  }

  /* 結算：登入 → server；guest → 本地。回傳 { faintedNow: [名] } 俾 UI 提示離線 Faint */
  async function settle() {
    const st = loadState();
    const wasAlive = new Set(st.entries.filter(e => e.pet && ensure(e.pet).hp > 0).map(e => e.uid));
    if (online()) {
      const res = await rpc("care_settle", {});
      if (res) applyState(res);
      else settleAll(st.entries, st.activeUid, now());
    } else {
      settleAll(st.entries, st.activeUid, now());
      saveState();
    }
    const after = loadState();
    const faintedNow = after.entries.filter(e => wasAlive.has(e.uid) && e.pet && e.pet.hp <= 0)
      .map(e => entryCurrentSpecies(e)[1]);
    return { faintedNow };
  }

  /* 本地即時推算（每分鐘 UI 更新；登入時亦用，下次 server 結算再校正） */
  function tickLocal() {
    const st = loadState();
    const changed = settleAll(st.entries, st.activeUid, now());
    if (changed) saveState();
    return changed;
  }

  async function feed(entry, kind) {
    if (!entry) return { ok: false, reason: "not_found" };
    if (online()) {
      const res = await rpc("care_feed", { p_entry: entry.uid, p_kind: kind });
      if (res) { if (res.state) applyState(res.state); return res; }
      /* RPC 唔通（migration 未跑／斷網）→ 退返本地規則，唔好令玩家餵唔到；下次 server 結算會校正 */
      console.warn("[Care] care_feed unavailable — using local rules");
    }
    if ((Pet.countOf(kind) || 0) <= 0) return { ok: false, reason: "no_item" };
    tickLocal();
    const out = feedRule(entry.pet, kind);
    if (out.ok) Pet.addItem(kind, -1);
    saveState();
    return out;
  }

  async function use(entry, item) {
    if (!entry) return { ok: false, reason: "not_found" };
    if (online()) {
      const res = await rpc("care_use_item", { p_entry: entry.uid, p_item: item });
      if (res) { if (res.state) applyState(res.state); return res; }
      console.warn("[Care] care_use_item unavailable — using local rules");
    }
    if ((Pet.countOf(item) || 0) <= 0) return { ok: false, reason: "no_item" };
    tickLocal();
    const out = useRule(entry.pet, item, now());
    if (out.ok) Pet.addItem(item, -1);
    saveState();
    return out;
  }

  /* 答題掉藥：全對穩掉、1–9 題 10%；7 種平均 */
  async function awardMeds(perfect) {
    if (online()) {
      const res = await rpc("award_meds", { p_perfect: !!perfect });
      if (!res) return null;   /* RPC 唔通就唔掉（藥數量以 server 為準，唔好本地憑空加） */
      if (!res.slug) return null;
      if (res.meds && window.Pet) { const bag = Pet.items(); MED_KINDS.forEach(k => { bag[k] = Math.max(0, Number(res.meds[k]) || 0); }); saveState(); }
      return res.slug;
    }
    if (!perfect && Math.random() >= 0.10) return null;
    const slug = MED_KINDS[Math.floor(Math.random() * MED_KINDS.length)];
    Pet.addItem(slug, 1);
    return slug;
  }

  /* 戰鬥正常完結：寫返出戰隊伍 HP／狀態 + 扣藥。team: [{ uid, hp(0–1000), status, poison }] */
  async function settleBattle(team, used) {
    const st = loadState();
    const nowMs = now();
    team.forEach(t => {
      const e = st.entries.find(x => x.uid === t.uid); if (!e) return;
      const p = ensure(e.pet || (e.pet = { health: 100 }));
      p.hp = Math.max(0, Math.min(1000, Math.round(t.hp)));
      p.status = p.hp > 0 ? (t.status || null) : null;
      p.poison = p.status === "psn" ? (t.poison >= 2 ? 2 : 1) : 0;
      p.statusSince = (p.status === "slp" || p.status === "frz") ? iso(nowMs) : null;
      p.careAt = iso(nowMs); p.od = 0; p.medLog = [];
    });
    Object.keys(used || {}).forEach(k => { if (used[k] > 0) Pet.addItem(k, -used[k]); });
    saveState();
    if (online()) {
      const res = await rpc("settle_battle_team", {
        p_team: team.map(t => ({ id: t.uid, hp: Math.round(t.hp), status: t.status || null, poison: t.poison || 0 })),
        p_used: used || {}
      });
      if (res && res.state) applyState(res.state);
    }
  }

  return {
    MED_KINDS, MED_INFO, STATUS_INFO, REASON_TEXT, ITEM_SPRITE, SLEEP_MS,
    ensure, settleOne, settleAll, feedRule, useRule,
    maxHp, hpOf, isFaint, statusKey, sleepLeftMs, eventText,
    online, applyState, settle, tickLocal, feed, use, awardMeds, settleBattle
  };
})();

window.Care = Care;
if (typeof module !== "undefined" && module.exports) module.exports = Care;
