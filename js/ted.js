/* ============================================================
   PokeEngmon - World Class（TED 題庫）
   只經公開 RPC get_ted_session 取有上限的一組題，不下載整張表。
   呼叫方式對應 Supabase JS rpc(fn, args)：
   POST /rest/v1/rpc/get_ted_session
   headers: apikey + Authorization Bearer（已登入用使用者 JWT，否則 anon key）
   實作走現有 SupabaseAuth.authedFetch，不使用 service role。
   ============================================================ */

const TED_BANDS = [
  { cefr: "A1", min: 1, max: 5 },
  { cefr: "A2", min: 6, max: 10 },
  { cefr: "B1", min: 11, max: 15 },
  { cefr: "B2", min: 16, max: 20 },
  { cefr: "C1", min: 21, max: 25 },
  { cefr: "C2", min: 26, max: 30 }
];

const TED_PREF_KEY = "pokeengmon_ted_pref_v1";
const TED_RECALL_KEY = "pokeengmon_ted_recent_v1";
const TED_RECALL_MAX = 100;
const TED_SIZES = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];

const TedWorld = {
  BANDS: TED_BANDS,
  SIZES: TED_SIZES,

  /* 10、20、…、100。非法值收斂到這個刻度，不超出伺服器 LIMIT 100。 */
  clampSize(size) {
    const n = Math.round(Number(size));
    if (!Number.isFinite(n)) return 10;
    const snapped = Math.round(n / 10) * 10;
    return Math.min(100, Math.max(10, snapped));
  },

  clampLevel(level) {
    const n = Math.round(Number(level));
    if (!Number.isFinite(n)) return 1;
    return Math.min(30, Math.max(1, n));
  },

  bandOf(level) {
    const lv = this.clampLevel(level);
    return TED_BANDS.find(b => lv >= b.min && lv <= b.max) || TED_BANDS[0];
  },

  loadPref() {
    let raw = null;
    try { raw = JSON.parse(localStorage.getItem(TED_PREF_KEY) || "null"); } catch (e) { raw = null; }
    const level = this.clampLevel(raw && raw.level);
    const ability = this.clampLevel(raw && raw.ability != null ? raw.ability : level);
    const mode = raw && (raw.mode === "band" || raw.mode === "adaptive" || raw.mode === "level") ? raw.mode : "level";
    return { level, ability, mode, size: this.clampSize(raw && raw.size) };
  },

  savePref(pref) {
    const prev = this.loadPref();
    const next = {
      level: this.clampLevel(pref && pref.level != null ? pref.level : prev.level),
      ability: this.clampLevel(pref && pref.ability != null ? pref.ability : prev.ability),
      mode: pref && (pref.mode === "band" || pref.mode === "adaptive" || pref.mode === "level") ? pref.mode : prev.mode,
      size: this.clampSize(pref && pref.size != null ? pref.size : prev.size)
    };
    try { localStorage.setItem(TED_PREF_KEY, JSON.stringify(next)); } catch (e) {}
    return next;
  },

  /* 一組題的等級範圍與所選題數。lim 只會是 10–100 的十的倍數。 */
  sessionQuery(pref) {
    const p = pref || this.loadPref();
    const lv = this.clampLevel(p.level);
    const ability = this.clampLevel(p.ability != null ? p.ability : lv);
    let minLv = lv;
    let maxLv = lv;
    if (p.mode === "band") {
      const band = this.bandOf(lv);
      minLv = band.min;
      maxLv = band.max;
    } else if (p.mode === "adaptive") {
      minLv = Math.max(1, ability - 1);
      maxLv = Math.min(30, ability + 1);
    }
    return { min_lv: minLv, max_lv: maxLv, lim: this.clampSize(p.size), prefer_audio: true };
  },

  /* 把 ___ 換成答案，還原完整英文句。只替換第一個空格。 */
  fullSentence(q) {
    if (q && q.type === "word") return String(q.word || "").trim();
    const sentence = String((q && q.sentence) || "");
    const answer = String((q && q.answer) || "");
    if (sentence.indexOf("___") < 0) return sentence.trim();
    return sentence.replace(/_{3,}/, answer).trim();
  },

  /* 外部語料保持純文字。talk_title 空白就留空，不補假標題。 */
  mapRow(row) {
    const src = row || {};
    const level = this.clampLevel(src.level);
    const band = this.bandOf(level);
    const cefr = String(src.cefr || band.cefr || "").trim() || band.cefr;
    const accept = Array.isArray(src.accept)
      ? src.accept.map(s => String(s == null ? "" : s).trim()).filter(Boolean)
      : [];
    const talk = src.talk_title == null ? "" : String(src.talk_title).trim();
    const hasAudio = src.has_audio === true && !!src.audio_url;
    const note = src.note == null ? "" : String(src.note);
    return {
      id: "ted:" + String(src.id == null ? "" : src.id),
      source: "ted",
      type: "sentence",
      custom: false,
      no: "",
      category: "World Class",
      unit: cefr,
      topic: "TED",
      level,
      cefr,
      sentence: String(src.sentence || ""),
      answer: String(src.answer || ""),
      accept,
      zh: src.zh == null ? "" : String(src.zh),
      note,
      talkTitle: talk,
      hasAudio,
      audioUrl: hasAudio ? String(src.audio_url) : "",
      explain: note.trim() ? { keyword: "", hint: note } : null
    };
  },

  _usable(q) {
    return !!(q && q.sentence && q.sentence.indexOf("___") >= 0 && String(q.answer || "").trim());
  },

  _publicDetail(text) {
    return String(text || "")
      .replace(/eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, "[redacted]")
      .slice(0, 300);
  },

  async fetchSession(query, post) {
    const body = {
      min_lv: this.clampLevel(query && query.min_lv),
      max_lv: this.clampLevel(query && query.max_lv),
      lim: this.clampSize(query && query.lim),
      prefer_audio: !(query && query.prefer_audio === false)
    };
    if (body.min_lv > body.max_lv) {
      const swap = body.min_lv;
      body.min_lv = body.max_lv;
      body.max_lv = swap;
    }
    const send = post || this._postRpc;
    try {
      const res = await send(body);
      if (!res || !res.ok) {
        let detail = "";
        try { detail = this._publicDetail(await res.text()); } catch (e) { detail = ""; }
        return {
          ok: false,
          empty: false,
          error: "HTTP " + ((res && res.status) || 0),
          detail,
          questions: []
        };
      }
      const data = await res.json();
      if (!Array.isArray(data)) {
        return { ok: false, empty: false, error: "bad-payload", detail: "", questions: [] };
      }
      let questions = data.map(row => this.mapRow(row)).filter(q => this._usable(q));
      const expected = body.lim;
      if (questions.length > expected) questions = questions.slice(0, expected);
      if (questions.length === 0) {
        return { ok: true, empty: true, error: "", expected, got: 0, detail: "", questions: [] };
      }
      if (questions.length !== expected) {
        return {
          ok: false,
          empty: false,
          error: "short",
          expected,
          got: questions.length,
          detail: "",
          questions: []
        };
      }
      return { ok: true, empty: false, error: "", expected, got: questions.length, detail: "", questions };
    } catch (e) {
      const kind = (e && e.kind) || "network";
      return {
        ok: false,
        empty: false,
        error: kind,
        detail: this._publicDetail(e && e.message),
        questions: []
      };
    }
  },

  _postRpc(body) {
    const auth = globalThis.SupabaseAuth;
    if (!auth || !auth.authedFetch || !auth.URL) {
      const err = new Error("Supabase client unavailable");
      err.kind = "config";
      throw err;
    }
    return auth.authedFetch(auth.URL + "/rest/v1/rpc/get_ted_session", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Prefer: "return=representation"
      },
      body: JSON.stringify(body)
    }, { timeout: 20000, quiet: true, where: "rpc/get_ted_session" });
  },

  remember(questions) {
    const list = Array.isArray(questions) ? questions.filter(q => q && q.id) : [];
    const map = this._recallMap();
    list.forEach(q => { map.set(q.id, q); });
    const kept = [...map.values()].slice(-TED_RECALL_MAX);
    this._recallCache = kept;
    try { localStorage.setItem(TED_RECALL_KEY, JSON.stringify(kept)); } catch (e) {}
    return kept;
  },

  recall(id) {
    if (!id) return null;
    const map = this._recallMap();
    return map.get(String(id)) || null;
  },

  _recallMap() {
    if (this._recallCache) return new Map(this._recallCache.map(q => [q.id, q]));
    let raw = [];
    try { raw = JSON.parse(localStorage.getItem(TED_RECALL_KEY) || "[]"); } catch (e) { raw = []; }
    if (!Array.isArray(raw)) raw = [];
    this._recallCache = raw.filter(q => q && q.id).slice(-TED_RECALL_MAX);
    return new Map(this._recallCache.map(q => [q.id, q]));
  },

  noteResult(score, total) {
    const pref = this.loadPref();
    const tot = Math.max(0, Number(total) || 0);
    const ratio = tot ? (Number(score) || 0) / tot : 0;
    if (ratio >= 0.8) pref.ability = Math.min(30, pref.ability + 1);
    else if (ratio < 0.4) pref.ability = Math.max(1, pref.ability - 1);
    return this.savePref(pref);
  }
};

Object.assign(globalThis, { TedWorld });
