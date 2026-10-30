/* ============================================================
   PokeEngmon - 進化場景（Evolution Hub）
   ------------------------------------------------------------
   流程：
   1. 顯示進化前 GIF + 播一次進化前叫聲
   2. 播 assets/bgm/evolution.mp3，同時交替閃動前／後 GIF 8 秒
   3. 只顯示進化後 GIF + 播一次進化後叫聲
   4. 播 assets/bgm/evolution-fanfare.mp3 5 秒後完結
   5. 完結後等用戶點擊 backdrop（hub 以外）返回
   ============================================================ */
const EvolveScene = (() => {
  const MUSIC = "assets/bgm/evolution.mp3";
  const FANFARE = "assets/bgm/evolution-fanfare.mp3";
  const LEAD_MS = 900;          // 先播叫聲，再入進化音樂
  const FLICKER_MS = 8000;      // 交替閃動時間
  const MUSIC_CUT_MS = 11000;   // 進化音樂播到第 11 秒自動 cut
  const FLICKER_STEP = 400;      // 交替間隔
  const CRY_GAP_MS = 1200;      // 進化後叫聲 → fanfare
  const FANFARE_MS = 5000;      // fanfare 播放時間

  let _timers = [];
  let _intervals = [];
  let _handles = [];
  let _onDone = null;
  let _closing = false;

  function _audio() {
    return window.CaptureScene && CaptureScene.audio;
  }

  function _later(ms, fn) {
    _timers.push(setTimeout(fn, ms));
  }

  function _clearAll() {
    _timers.forEach(clearTimeout);
    _timers = [];
    _intervals.forEach(clearInterval);
    _intervals = [];
  }

  function _stopAudio() {
    _handles.forEach(h => { try { h.stop(); } catch (e) {} });
    _handles = [];
  }

  function _speciesName(dexId) {
    const sp = (typeof SPECIES !== "undefined") ? SPECIES[dexId] : null;
    return sp ? sp.name : "Pokémon";
  }

  function _gifHTML(dexId, cls) {
    const fallback = typeof spriteURL === "function" ? spriteURL(dexId) : "";
    return `<img class="evo-gif ${cls}" src="${animatedURL(dexId)}" alt="${escapeHTML(_speciesName(dexId))}"
      onerror="this.onerror=null;this.src='${fallback}'">`;
  }

  function _armClose() {
    const root = document.getElementById("modal-root");
    if (!root) return;
    const backdrop = root.querySelector(".modal-backdrop");
    if (backdrop) {
      backdrop.onclick = (e) => {
        if (e.target === e.currentTarget) close();
      };
    }
    const hint = document.getElementById("evo-hint");
    if (hint) hint.textContent = "Tap outside to continue";
  }

  /* opts: { fromDex, toDex, onDone } */
  function open(opts) {
    if (!opts || !opts.fromDex || !opts.toDex) return;
    _clearAll();
    _stopAudio();
    _closing = false;
    _onDone = opts.onDone || null;

    const audio = _audio();
    if (audio) audio.stopTownBGM();

    const fromDex = opts.fromDex;
    const toDex = opts.toDex;
    const fromName = _speciesName(fromDex);
    const toName = _speciesName(toDex);

    App.showModal(`
      <div class="evolve-scene">
        <div class="evolve-title" id="evo-title">What? ${escapeHTML(fromName)} is evolving!</div>
        <div class="evo-stage">
          ${_gifHTML(fromDex, "base show")}
          ${_gifHTML(toDex, "next")}
        </div>
        <div class="evo-name" id="evo-name"></div>
        <div class="evo-hint" id="evo-hint">Evolution in progress…</div>
      </div>`, true);

    /* 1) 進化前叫聲 */
    if (window.Pokedex && Pokedex.playCry) Pokedex.playCry(fromDex);

    /* 2) 進化音樂 + 交替閃動 */
    _later(LEAD_MS, () => {
      const a = _audio();
      if (a && a.playMusicOnce) _handles.push(a.playMusicOnce(MUSIC, 0.7, MUSIC_CUT_MS / 1000));

      const base = document.querySelector("#modal-root .evo-gif.base");
      const next = document.querySelector("#modal-root .evo-gif.next");
      let showNext = false;
      _intervals.push(setInterval(() => {
        showNext = !showNext;
        if (base) base.classList.toggle("show", !showNext);
        if (next) next.classList.toggle("show", showNext);
      }, FLICKER_STEP));

      _later(FLICKER_MS, () => {
        _intervals.forEach(clearInterval);
        _intervals = [];
        /* 3) 只顯示進化後 */
        if (base) base.classList.remove("show");
        if (next) next.classList.add("show");
        const title = document.getElementById("evo-title");
        if (title) title.textContent = "Congratulations!";
        const nameEl = document.getElementById("evo-name");
        if (nameEl) nameEl.textContent = toName;
        if (window.Pokedex && Pokedex.playCry) Pokedex.playCry(toDex);

        /* 4) Fanfare 5 秒 → 完結，等用戶點擊外面 */
        _later(CRY_GAP_MS, () => {
          const a2 = _audio();
          if (a2 && a2.playMusicOnce) _handles.push(a2.playMusicOnce(FANFARE, 0.8, FANFARE_MS / 1000));
          _later(FANFARE_MS, _armClose);
        });
      });
    });
  }

  function close() {
    if (_closing) return;
    _closing = true;
    _clearAll();
    _stopAudio();
    const audio = _audio();
    if (audio) audio.startTownBGM();
    App.closeModal();
    const cb = _onDone;
    _onDone = null;
    if (cb) cb();
    _closing = false;
  }

  return { open, close };
})();

window.EvolveScene = EvolveScene;
