/*
 * Globals shared by the classic <script> files in index.html (type-check only; never loaded by the app).
 * `npm run typecheck` reads this with tsconfig.json.
 *
 * Add a line here when a script publishes a new global:
 *   - `window.X = ...` modules (Rule 75), or
 *   - files that end with `module.exports` (TS treats those as CommonJS, so their top-level const is not global).
 * Start with `any`; tighten a type when you touch that module.
 */

/* ---- modules that only exist as window.X (no top-level const in their file) ----
 * Files that already say `const X = …` at top level (App, BagUI, BattleLand, EvolveScene, Friends,
 * GenPack, Pet, PvpRealtime, SupabaseAuth) must NOT be listed here: TS2451 redeclare. */
declare var AnimSpeed: any;
declare var Gacha: any;
declare var Avatars: any;
declare var CaptureAudio: any;
declare var CaptureScene: any;
declare var Care: any;
declare var Guard: any;
declare var Keys: any;
declare var Net: any;
declare var PokemonCaptureScene: any;
declare var SM2: any;
declare var SUPABASE_CONFIG: any;
declare var Sync: any;

/* ---- files with module.exports (CommonJS to TS) ---- */
declare var Battle: any;
declare var BattleRng: any;
declare var BattleState: any;
declare var MEGA_STONES: any;

/* ---- vendor ---- */
declare var gsap: any;

/* ---- debug / test hooks ---- */
interface Window {
  AnimSpeed: any; App: any; Avatars: any; BagUI: any; BattleLand: any; CaptureAudio: any;
  CaptureScene: any; Care: any; EvolveScene: any; Friends: any; GenPack: any; Guard: any;
  Html: any; Keys: any; Net: any; Pet: any; Pokedex: any; PokemonCaptureScene: any;
  PvpRealtime: any; Quests: any; SM2: any; SUPABASE_CONFIG: any; SupabaseAuth: any; Sync: any;
  gsap: any;
  webkitAudioContext: typeof AudioContext;
  __SUPABASE_ANON_KEY: string;
  __gachaForceRarity: string;
  __oauthError: any;
  __pvpLatency: number;
  __setCatchRate: any;
  __stateRecovered: boolean;
  __testCapture: any;
}
