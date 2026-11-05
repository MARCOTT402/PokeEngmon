/* Care 規則單元測試：node tools/_test_care.js
   規則要同 supabase-migrate-20261105c-care-status-phase1.sql 一致 */
global.window = {};
const C = require("../js/care.js");
let fail = 0;
const T = (n, c) => { console.log((c ? "PASS " : "FAIL ") + n); if (!c) fail++; };
const H = 3600e3, M = 60e3, t0 = Date.parse("2026-11-05T00:00:00Z");
const iso = t => new Date(t).toISOString();
let p, r;

p = C.ensure({ health: 100, updatedAt: iso(t0), careAt: iso(t0) });
C.settleOne(p, true, t0 + 25 * H); T("fullness 100 -> 0 after 25h => faint", p.health === 0 && p.hp === 0);
p = C.ensure({ health: 100, updatedAt: iso(t0), careAt: iso(t0), status: "brn" });
C.settleOne(p, true, t0 + 60 * M); T("burn 60min: fullness -6, hp -30%", p.health === 94 && p.hp === 700);
p = C.ensure({ health: 80, updatedAt: iso(t0), careAt: iso(t0), status: "psn", poison: 2 });
C.settleOne(p, false, t0 + 60 * M); T("non-partner: poison / fullness frozen", p.hp === 1000 && p.health === 80);
p = C.ensure({ health: 80, updatedAt: iso(t0), careAt: iso(t0), status: "psn", poison: 2 });
C.settleOne(p, true, t0 + 10 * M); T("partner badly poisoned: -2%/min", p.hp === 800);
p = C.ensure({ health: 80, status: "slp", statusSince: iso(t0) });
C.settleOne(p, false, t0 + 31 * M); T("sleep wakes after 30m (non-partner too)", p.status === null);

p = C.ensure({ health: 100, hp: 1000 });
r = C.feedRule(p, "food"); T("vomit 1 (-25%)", r.event === "vomit" && p.hp === 750);
r = C.feedRule(p, "food"); T("vomit 2 (-25%)", r.event === "vomit_severe" && p.hp === 500);
r = C.feedRule(p, "food"); T("3rd = faint", r.event === "faint" && p.hp === 0);
p = C.ensure({ health: 96, hp: 1000 }); r = C.feedRule(p, "food");
T("96 + food -> 100, no vomit", p.health === 100 && p.hp === 1000 && r.event === "fed");
p = C.ensure({ health: 100, hp: 200 }); r = C.feedRule(p, "food"); T("vomit with HP < 25% = faint", p.hp === 0);
p = C.ensure({ health: 50, hp: 1000, status: "par" }); r = C.feedRule(p, "food"); T("paralyzed can't eat", !r.ok && r.reason === "status_par");

p = C.ensure({ health: 50, hp: 400, status: "brn" });
C.useRule(p, "potion", t0); C.useRule(p, "potion", t0 + 10e3); r = C.useRule(p, "potion", t0 + 20e3);
T("3 meds in 1 min -> poison (overwrites burn)", r.event === "od_poison" && p.status === "psn" && p.poison === 1 && p.hp === 1000);
C.useRule(p, "potion", t0 + 100e3); C.useRule(p, "potion", t0 + 200e3); r = C.useRule(p, "potion", t0 + 300e3);
T("3 more while poisoned -> badly poisoned", r.event === "od_severe" && p.poison === 2);
C.useRule(p, "potion", t0 + 400e3); C.useRule(p, "potion", t0 + 500e3); r = C.useRule(p, "potion", t0 + 600e3);
T("3 more while badly poisoned -> faint", r.event === "od_faint" && p.hp === 0);
r = C.useRule(p, "potion", t0 + 700e3); T("potion on fainted blocked", !r.ok);
r = C.useRule(p, "revive", t0 + 800e3); T("revive: full HP + fullness, no status", r.ok && p.hp === 1000 && p.health === 100 && !p.status);
p = C.ensure({ health: 50, hp: 500, status: "psn", poison: 2 }); C.useRule(p, "antidote", t0);
T("antidote cures bad poison", p.status === null && p.poison === 0);
p = C.ensure({ health: 50, hp: 1000 }); C.useRule(p, "potion", t0); C.useRule(p, "potion", t0 + 61e3);
T("sliding window: 2 uses > 60s apart don't poison", p.status === null);

console.log(fail ? `\n${fail} FAILED` : "\nALL PASS");
process.exit(fail ? 1 : 0);
