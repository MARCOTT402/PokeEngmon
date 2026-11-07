/* ============================================================
   PokeEngmon - 好友系統 MVP（UI 層 + 背景輪詢）
   - 好友碼／搜尋加好友／請求／刪除
   - 對戰邀請（1v1 / 3v3 / 6v6）＋等待對方接受
   - 所有 SupabaseAuth 好友 RPC 失敗都回 null → 一律 toast
   ============================================================ */

const Friends = (() => {
  /* 好友碼：8 字，避開易混淆字（I / O / 0 / 1） */
  const CODE_RE = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/;
  const INVITE_POLL_MS = 3000;    /* 發出邀請後每 3s 查一次 */
  const POLL_MS = 20000;          /* 一般背景輪詢 */
  const VIEW_POLL_MS = 8000;      /* friends view 開住時加快 */
  const INVITE_TTL_MS = 600000;   /* 同 server battle_invites 一樣 10 分鐘 */
  const MAX_FRIENDS = 50;
  const MAX_PENDING = 20;
  const ACTIONS_VISIBLE = 3;      /* Action Center 預設最多顯示幾行 */
  const PRESENCE_MS = 300000;     /* 5 分鐘內有 last_seen_at 當上線 */
  const FRIEND_SORT_KEY = "pokeengmon_friends_sort_v1";
  const FRIEND_SORTS = [
    { id: "name", label: "Name" },
    { id: "wins", label: "Most wins" },
    { id: "recent", label: "Recently added" }
  ];

  /* cache 俾 summary() / badge 用（同步讀，唔會打網絡） */
  const cache = { friends: 0, requests: 0, invites: 0 };
  const seenInvites = new Set();  /* 已 toast 過嘅 invite_id（每個只一次） */

  let myCode = "";
  let loadSeq = 0;
  let polling = false;
  let pollTimer = null;
  let tickRunning = false;
  let waiting = null;             /* { inviteId, friendName, size, startedAt, timer } */
  let lastInvites = [];
  let lastRequests = [];
  let lastOutgoing = [];
  let roster = [];
  let rosterSearch = "";
  let rosterSort = loadRosterSort();
  let actionsExpanded = false;
  let ticker = null;
  let bound = false;

  /* ---------- 小工具 ---------- */
  function toast(msg) { if (window.App && App.toast) App.toast(msg); }
  function el(id) { return document.getElementById(id); }

  function esc(s) {
    return escapeHTML(s);
  }

  function loggedIn() {
    return !!(window.SupabaseAuth && SupabaseAuth.isEnabled && SupabaseAuth.isEnabled()
      && SupabaseAuth.isLoggedIn && SupabaseAuth.isLoggedIn());
  }

  function activeView() {
    const v = document.querySelector(".view.active");
    return v ? v.id : null;
  }
  function friendsOpen() { return activeView() === "view-friends"; }

  /* 呼叫 SupabaseAuth 好友 RPC；未實作／拋錯都當 null（呼叫端負責 toast） */
  async function call(name, ...args) {
    const fn = window.SupabaseAuth && SupabaseAuth[name];
    if (typeof fn !== "function") return null;
    try { return await fn.apply(SupabaseAuth, args); }
    catch (e) {
      console.warn("[Friends] " + name + " failed:", e && e.message);
      return null;
    }
  }

  /* ensure_friend_code 回純字串；保險起見支援 {friend_code} / {code} */
  function codeFrom(res) {
    if (!res) return "";
    if (typeof res === "string") return res.trim();
    return String(res.friend_code || res.code || "").trim();
  }

  /* ---------- 對外 API ---------- */

  function open() {
    if (!loggedIn()) {
      toast("Log in first to use friends!");
      const loginBtn = el("btn-login");
      if (loginBtn) loginBtn.click();
      return;
    }
    actionsExpanded = false;
    renderIdentity();
    if (window.App && App.showView) App.showView("view-friends");
    bindView();
    load();
    ensureTicker();
    if (polling) reschedule(VIEW_POLL_MS);
  }

  /* 由排行榜／對戰結算等入口加好友 */
  async function addByUid(uid, name) {
    if (!uid) { toast("Could not send request"); return null; }
    const res = await call("sendFriendRequest", uid);
    const status = res && res.status;
    const label = name || "trainer";
    const msgs = {
      sent: "Friend request sent to " + label,
      pending: "Request already pending",
      already_friends: "Already friends",
      auto_accepted: "You are now friends!",
      friend_limit: "Friend list is full (" + MAX_FRIENDS + " max)",
      pending_limit: "Too many pending requests (" + MAX_PENDING + " max)",
      not_found: "Trainer not found",
      self: "That's your own code!"
    };
    toast(msgs[status] || "Could not send request");

    if (status === "sent" || status === "auto_accepted") {
      refreshBadge();
      if (friendsOpen()) load();
    }
    return status || null;
  }

  function summary() {
    return {
      friends: Number(cache.friends) || 0,
      requests: Number(cache.requests) || 0,
      invites: Number(cache.invites) || 0
    };
  }

  function startPolling() {
    if (!loggedIn()) return;
    if (polling) return;   /* renderHome 會重複叫，唔好開多條 timer */
    polling = true;
    tick();
  }

  function stopPolling() {
    polling = false;
    if (pollTimer) { clearTimeout(pollTimer); pollTimer = null; }
    stopTicker();
    seenInvites.clear();
    if (waiting && waiting.timer) clearTimeout(waiting.timer);
    waiting = null;
    lastRequests = [];
    lastOutgoing = [];
    cache.friends = 0;
    cache.requests = 0;
    cache.invites = 0;
    refreshBadge();
  }

  /* ---------- 輪詢 ---------- */
  function reschedule(ms) {
    if (!polling) return;
    if (pollTimer) clearTimeout(pollTimer);
    pollTimer = setTimeout(tick, ms);
  }

  async function tick() {
    pollTimer = null;
    if (!polling || tickRunning) return;
    tickRunning = true;
    try {
      const invitesRes = await call("getBattleInvites");
      const reqRes = await call("getFriendRequests");
      const outRes = await call("getOutgoingFriendRequests");
      const friendsRes = await call("getMyFriends");
      if (!polling) return;

      if (Array.isArray(friendsRes)) cache.friends = friendsRes.length;

      if (Array.isArray(invitesRes)) {
        lastInvites = invitesRes;
        cache.invites = invitesRes.filter(i =>
          i.direction === "in" && i.status === "pending" && !isExpired(i)).length;
        notifyInvites(invitesRes);
        if (friendsOpen()) renderInvites(invitesRes);
      }
      if (Array.isArray(reqRes)) {
        cache.requests = reqRes.length;
        if (friendsOpen()) renderRequests(reqRes);
      }
      if (Array.isArray(outRes)) {
        lastOutgoing = outRes;
        if (friendsOpen()) renderActions();
      }
      /* outgoing 係 Phase 2 新 RPC：未跑 migration 時回 null，唔算錯誤 */
      if (!Array.isArray(invitesRes) && !Array.isArray(reqRes) && friendsOpen()) {
        showBanner("Could not refresh friends");
      }
      refreshBadge();
    } finally {
      tickRunning = false;
      if (friendsOpen()) ensureTicker(); else stopTicker();
      if (polling) reschedule(friendsOpen() ? VIEW_POLL_MS : POLL_MS);
    }
  }

  /* 新嘅 incoming pending invite → toast（每個 invite_id 只一次） */
  function notifyInvites(rows) {
    const view = activeView();
    if (view !== "view-home" && view !== "view-battle-menu" && view !== "view-friends") return;
    rows.forEach(inv => {
      if (inv.direction !== "in" || inv.status !== "pending" || isExpired(inv)) return;
      const key = String(inv.invite_id);
      if (seenInvites.has(key)) return;
      seenInvites.add(key);
      toast((inv.trainer_name || "A friend") + " challenged you to a battle!");
    });
  }

  function refreshBadge() {
    const total = loggedIn()
      ? (Number(cache.requests) || 0) + (Number(cache.invites) || 0)
      : 0;
    /* 三個入口共用同一組數字：Home topbar / Home 選單 / Battle menu tile */
    ["battle-menu-friends-badge", "home-friends-badge", "top-friends-badge"].forEach(id => {
      const badge = el(id);
      if (!badge) return;
      badge.textContent = String(total);
      badge.hidden = total <= 0;
    });
    /* 登入後 tile 副標題顯示好友／請求數 */
    const sub = el("battle-menu-friends-sub");
    if (sub && loggedIn()) {
      const f = Number(cache.friends) || 0;
      const r = Number(cache.requests) || 0;
      sub.textContent = f + " friend" + (f === 1 ? "" : "s") + " · " + r + " request" + (r === 1 ? "" : "s");
    } else if (sub) {
      sub.textContent = "Log in to add friends";
    }
  }

  /* ---------- 載入 + render ---------- */
  function bindView() {
    if (bound) return;
    const copy = el("friends-copy-code");
    if (copy) copy.onclick = copyCode;
    const addBtn = el("friends-add-btn");
    if (addBtn) addBtn.onclick = onAdd;
    const input = el("friends-add-input");
    if (input) {
      input.onkeydown = (e) => {
        if (e.key === "Enter") { e.preventDefault(); onAdd(); }
      };
    }
    const toggle = el("friends-add-toggle");
    if (toggle) {
      toggle.onclick = () => {
        const panel = el("friends-add-panel");
        setAddPanel(panel ? panel.hidden : true);
      };
    }
    const search = el("friends-search");
    if (search) search.oninput = () => { rosterSearch = search.value; renderRoster(); };
    const sortSel = el("friends-sort");
    if (sortSel) {
      sortSel.innerHTML = FRIEND_SORTS.map(o => '<option value="' + o.id + '">' + o.label + "</option>").join("");
      sortSel.onchange = () => {
        rosterSort.sort = sortSel.value;
        rosterSort.dir = defaultFriendDir(sortSel.value);
        saveRosterSort();
        syncSortUI();
        renderRoster();
      };
    }
    const dirBtn = el("friends-sort-dir");
    if (dirBtn) dirBtn.onclick = () => {
      rosterSort.dir = rosterSort.dir === "asc" ? "desc" : "asc";
      saveRosterSort();
      syncSortUI();
      renderRoster();
    };
    const retry = el("friends-banner-retry");
    if (retry) retry.onclick = () => load();
    syncSortUI();
    bound = true;
  }

  function setCode(text) {
    const c = el("friends-code");
    if (c) c.textContent = text;
  }

  function setRosterMessage(text) {
    const box = el("friends-list");
    if (box) box.innerHTML = '<div class="friends-empty">' + esc(text) + "</div>";
    const count = el("friends-count");
    if (count) count.textContent = "0";
  }

  function renderRosterSkeleton() {
    const box = el("friends-list");
    if (box) box.innerHTML = '<div class="friends-skel"></div><div class="friends-skel"></div><div class="friends-skel"></div>';
  }

  function showBanner(msg) {
    const box = el("friends-banner");
    const text = el("friends-banner-text");
    if (text && msg) text.textContent = msg;
    if (box) box.hidden = false;
  }

  function hideBanner() {
    const box = el("friends-banner");
    if (box) box.hidden = true;
  }

  async function load() {
    bindView();
    renderIdentity();
    if (!loggedIn()) {
      setCode("Log in first");
      lastRequests = [];
      lastInvites = [];
      roster = [];
      renderActions();
      setRosterMessage("Log in to see friends");
      hideBanner();
      return;
    }

    const seq = ++loadSeq;
    setCode("Loading…");
    hideBanner();
    renderRosterSkeleton();

    const codeRes = await call("ensureFriendCode");
    if (seq !== loadSeq) return;
    myCode = codeFrom(codeRes);
    setCode(myCode || "Unavailable");
    if (!myCode) toast("Could not load your friend code");

    const [friendsRes, reqRes, outRes, invitesRes] = await Promise.all([
      call("getMyFriends"),
      call("getFriendRequests"),
      call("getOutgoingFriendRequests"),
      call("getBattleInvites")
    ]);
    if (seq !== loadSeq) return;

    roster = Array.isArray(friendsRes) ? friendsRes : [];
    lastRequests = Array.isArray(reqRes) ? reqRes : [];
    lastOutgoing = Array.isArray(outRes) ? outRes : [];
    if (Array.isArray(invitesRes)) lastInvites = invitesRes;

    cache.friends = roster.length;
    cache.requests = lastRequests.length;
    cache.invites = lastInvites.filter(i =>
      i.direction === "in" && i.status === "pending" && !isExpired(i)).length;

    renderActions();
    renderRoster();
    refreshBadge();
    ensureTicker();

    if (!Array.isArray(friendsRes) || !Array.isArray(reqRes) || !Array.isArray(invitesRes)) {
      showBanner("Could not load friends data");
    } else {
      hideBanner();
    }
  }

  /* ---------- Friend code ---------- */
  async function copyCode() {
    const code = myCode || (el("friends-code") ? el("friends-code").textContent.trim() : "");
    if (!code || code === "——" || code === "Unavailable" || code === "Loading…" || code === "Log in first") {
      toast("Friend code not ready yet");
      return;
    }
    try {
      await navigator.clipboard.writeText(code);
      toast("Friend code copied!");
      const btn = el("friends-copy-code");
      if (btn) {
        btn.textContent = "COPIED ✓";
        setTimeout(() => { btn.textContent = "COPY"; }, 1600);
      }
    } catch (e) {
      toast("Copy failed — long-press the code");
    }
  }

  /* ---------- Dashboard：identity / 倒數 / action center ---------- */
  function inviteExpiresAt(inv) {
    return (Number(inv.created_at) || 0) + INVITE_TTL_MS;
  }

  function isExpired(inv) {
    return Date.now() >= inviteExpiresAt(inv);
  }

  function fmtLeft(expiresMs) {
    const left = Math.max(0, Math.ceil((expiresMs - Date.now()) / 1000));
    return Math.floor(left / 60) + ":" + String(left % 60).padStart(2, "0");
  }

  function ensureTicker() {
    if (ticker || !friendsOpen()) return;
    updateCountdowns();
    ticker = setInterval(() => {
      if (!friendsOpen()) { stopTicker(); return; }
      updateCountdowns();
    }, 1000);
  }

  function stopTicker() {
    if (ticker) { clearInterval(ticker); ticker = null; }
  }

  function updateCountdowns() {
    document.querySelectorAll("#friends-action-list .fa-time").forEach(node => {
      node.textContent = fmtLeft(Number(node.dataset.expires) || 0);
    });
  }

  function renderIdentity() {
    const st = (typeof loadState === "function") ? loadState() : {};
    const nameEl = el("friends-trainer-name");
    if (nameEl) nameEl.textContent = st.playerName || "Trainer";

    const av = el("friends-avatar");
    if (!av) return;
    /* 第 14 項：Trainer Avatar（原作角色全身像），撳一下揀 */
    if (window.Avatars) {
      av.innerHTML = Avatars.img(Avatars.mine()) + '<span class="friends-avatar-edit">EDIT</span>';
      av.classList.add("is-trainer");
      av.setAttribute("role", "button");
      av.setAttribute("aria-label", "Change trainer avatar");
      av.removeAttribute("aria-hidden");
      av.onclick = () => Avatars.openPicker(() => renderIdentity());
      return;
    }
    let dex = 0;
    try {
      const entry = (typeof getActiveEntry === "function") ? getActiveEntry() : null;
      if (entry) dex = entryCurrentSpecies(entry)[0] || 0;
    } catch (e) { dex = 0; }
    if (dex && typeof spriteURL === "function") {
      av.innerHTML = '<img src="' + spriteURL(dex) + '" alt="">';
    } else {
      av.textContent = String(st.playerName || "T").trim().charAt(0).toUpperCase() || "T";
    }
  }

  function actionRow(it) {
    if (it.kind === "request") {
      const r = it.req;
      const uid = esc(r.account_uuid);
      return '<div class="fa-row fa-request">'
        + '<div class="fa-main">'
        + '<span class="fa-kind">Friend request</span>'
        + '<span class="fa-name" data-name="' + esc(r.trainer_name || "Trainer") + '">' + esc(r.trainer_name || "Trainer") + "</span>"
        + "</div>"
        + '<div class="fa-actions">'
        + '<button class="friends-btn friends-btn-accept" data-act="accept-request" data-uid="' + uid + '">ACCEPT</button>'
        + '<button class="friends-btn friends-btn-decline" data-act="decline-request" data-uid="' + uid + '">DECLINE</button>'
        + "</div></div>";
    }

    if (it.kind === "outreq") {
      const r = it.req;
      return '<div class="fa-row fa-outreq">'
        + '<div class="fa-main">'
        + '<span class="fa-kind">Request sent</span>'
        + '<span class="fa-name">' + esc(r.trainer_name || "Trainer") + "</span>"
        + '<span class="fa-sub">Waiting for them to accept</span>'
        + "</div>"
        + '<div class="fa-actions">'
        + '<button class="friends-btn friends-btn-decline" data-act="cancel-request" data-uid="'
        + esc(r.account_uuid) + '">CANCEL</button>'
        + "</div></div>";
    }

    if (it.kind === "waiting") {
      return '<div class="fa-row fa-waiting">'
        + '<div class="fa-main">'
        + '<span class="fa-kind">Waiting</span>'
        + '<span class="fa-name">Waiting for ' + esc(waiting.friendName) + "…</span>"
        + '<span class="fa-sub">⚔ Rules decided by vote'
        + ' · <span class="fa-time" data-expires="' + (waiting.startedAt + INVITE_TTL_MS) + '"></span></span>'
        + "</div>"
        + '<div class="fa-actions">'
        + '<button class="friends-btn friends-btn-decline" data-act="cancel-wait">CANCEL</button>'
        + "</div></div>";
    }

    const inv = it.inv;
    const name = esc(inv.trainer_name || "Trainer");
    const id = esc(inv.invite_id);
    const expires = inviteExpiresAt(inv);

    if (it.kind === "invite") {
      return '<div class="fa-row fa-invite">'
        + '<div class="fa-main">'
        + '<span class="fa-kind">Battle invite</span>'
        + '<span class="fa-name">' + name + "</span>"
        + '<span class="fa-sub"><span class="fa-time" data-expires="' + expires + '"></span> left</span>'
        + "</div>"
        + '<div class="fa-actions">'
        + '<button class="friends-btn friends-btn-accept" data-act="accept-invite" data-invite="' + id + '">ACCEPT</button>'
        + '<button class="friends-btn friends-btn-decline" data-act="decline-invite" data-invite="' + id + '">DECLINE</button>'
        + "</div></div>";
    }

    /* outgoing pending */
    return '<div class="fa-row fa-out">'
      + '<div class="fa-main">'
      + '<span class="fa-kind">Waiting</span>'
      + '<span class="fa-name">' + name + "</span>"
      + '<span class="fa-sub">Sent · <span class="fa-time" data-expires="' + expires + '"></span> left</span>'
      + "</div>"
      + '<div class="fa-actions">'
      + '<button class="friends-btn friends-btn-decline" data-act="cancel-invite" data-invite="' + id + '">CANCEL</button>'
      + "</div></div>";
  }

  function renderActions() {
    const card = el("friends-actions");
    const box = el("friends-action-list");
    if (!card || !box) return;

    const items = [];
    lastInvites.forEach(inv => {
      if (inv.direction === "in" && inv.status === "pending" && !isExpired(inv)) {
        items.push({ kind: "invite", inv: inv });
      }
    });
    lastRequests.forEach(r => items.push({ kind: "request", req: r }));
    /* 已送出、等對方回應嘅好友請求（Phase 2） */
    lastOutgoing.forEach(r => items.push({ kind: "outreq", req: r }));
    const outgoing = lastInvites.filter(inv =>
      inv.direction === "out" && inv.status === "pending" && !isExpired(inv));
    const waitingDup = waiting && outgoing.some(inv => String(inv.invite_id) === waiting.inviteId);
    if (waiting && !waitingDup) items.push({ kind: "waiting" });
    outgoing.forEach(inv => items.push({ kind: "out", inv: inv }));

    const total = items.length;
    card.hidden = total === 0;
    const countEl = el("friends-action-count");
    if (countEl) { countEl.textContent = String(total); countEl.hidden = total === 0; }
    if (!total) { box.innerHTML = ""; return; }

    const visible = actionsExpanded ? items : items.slice(0, ACTIONS_VISIBLE);
    box.innerHTML = visible.map(actionRow).join("")
      + (total > ACTIONS_VISIBLE
        ? '<button class="fa-see-all" data-act="toggle-actions">'
          + (actionsExpanded ? "Show less" : "See all (" + total + ")")
          + "</button>"
        : "");

    box.onclick = Guard.asyncClick(async (e) => {
      const b = e.target.closest("button[data-act]");
      if (!b) return;
      const act = b.dataset.act;
      if (act === "toggle-actions") {
        actionsExpanded = !actionsExpanded;
        renderActions();
        updateCountdowns();
        return;
      }
      b.disabled = true;
      try {
      if (act === "accept-request") await respondRequest(b.dataset.uid, true);
      else if (act === "decline-request") await respondRequest(b.dataset.uid, false);
      else if (act === "accept-invite") await acceptInvite(b.dataset.invite);
      else if (act === "decline-invite") await declineInvite(b.dataset.invite);
      else if (act === "cancel-invite") await cancelInvite(b.dataset.invite);
      else if (act === "cancel-request") await cancelRequest(b.dataset.uid);
      else if (act === "cancel-wait") await cancelWaiting();
      } catch (err) { b.disabled = false; throw err; } /* 出錯要還原掣，Guard.asyncClick 會 toast（Rule 94） */
    }, "friends-actions");
    updateCountdowns();
  }

  /* ---------- 加好友（好友碼 / 名稱搜尋） ---------- */
  async function onAdd() {
    const input = el("friends-add-input");
    if (!input) return;
    const raw = (input.value || "").trim();
    if (!raw) { toast("Type a friend code or name"); return; }

    const upper = raw.toUpperCase();
    if (CODE_RE.test(upper)) {
      const res = await call("resolveFriendCode", upper);
      if (res === null) { toast("No trainer with that code"); return; }
      if (res && res.self) { toast("That's your own code!"); return; }
      if (!res || !res.account_uuid) { toast("No trainer with that code"); return; }
      const status = await addByUid(res.account_uuid, res.trainer_name);
      if (status === "sent" || status === "auto_accepted") input.value = "";
      return;
    }

    if (raw.length >= 2) {
      await searchByName(raw);
    } else {
      const box = el("friends-search-results");
      if (box) box.innerHTML = "";
      toast("Type at least 2 characters");
    }
  }

  async function searchByName(q) {
    const box = el("friends-search-results");
    if (!box) return;
    box.innerHTML = '<div class="friends-empty">Loading…</div>';
    const rows = await call("searchTrainers", q);
    if (rows === null) {
      box.innerHTML = '<div class="friends-empty">Search failed</div>';
      toast("Could not search trainers");
      return;
    }
    renderSearch(Array.isArray(rows) ? rows : []);
  }

  function renderSearch(rows) {
    const box = el("friends-search-results");
    if (!box) return;
    if (!rows.length) {
      box.innerHTML = '<div class="friends-empty">No trainers found</div>';
      return;
    }
    box.innerHTML = rows.map(r => {
      const uid = r.account_uuid;
      const name = esc(r.trainer_name || "Trainer");
      let btn;
      if (r.relation === "friend") {
        btn = '<button class="friends-btn" disabled>FRIEND</button>';
      } else if (r.relation === "pending_out") {
        btn = '<button class="friends-btn" disabled>PENDING</button>';
      } else if (r.relation === "pending_in") {
        btn = '<button class="friends-btn friends-btn-accept" data-act="accept" data-uid="'
          + esc(uid) + '" data-name="' + name + '">ACCEPT</button>';
      } else {
        btn = '<button class="friends-btn friends-btn-add" data-act="add" data-uid="'
          + esc(uid) + '" data-name="' + name + '">＋ ADD</button>';
      }
      return '<div class="friends-list-row friends-search-row">'
        + '<span class="friends-row-name">' + name + "</span>"
        + '<span class="friends-row-actions">' + btn + "</span>"
        + "</div>";
    }).join("");

    box.onclick = Guard.asyncClick(async (e) => {
      const b = e.target.closest("button[data-act]");
      if (!b) return;
      b.disabled = true;
      try {
        if (b.dataset.act === "add") await addByUid(b.dataset.uid, b.dataset.name);
        else if (b.dataset.act === "accept") await respondRequest(b.dataset.uid, true);
      } catch (err) { b.disabled = false; throw err; }
    }, "friends-search");
  }

  /* ---------- 好友請求 ---------- */
  async function respondRequest(uid, accept) {
    const res = await call("respondFriendRequest", uid, accept);
    const status = res && res.status;
    if (!res) {
      toast("Could not update request");
    } else if (!accept) {
      toast(status === "declined" ? "Request declined" : "Request removed");
    } else if (status === "accepted") {
      toast("You are now friends!");
      refreshBadge();
    } else if (status === "friend_limit") {
      toast("Friend list is full (" + MAX_FRIENDS + " max)");
    } else if (status === "not_found") {
      toast("That request is gone");
    } else {
      toast("Could not update request");
    }
    if (friendsOpen()) load();
    return status || null;
  }

  function renderRequests(rows) {
    lastRequests = Array.isArray(rows) ? rows : [];
    renderActions();
  }

  /* 取消自己送出嘅好友請求 */
  async function cancelRequest(uid) {
    const res = await call("cancelFriendRequest", uid);
    const status = res && res.status;
    if (!res) toast("Could not cancel request");
    else if (status === "cancelled") toast("Friend request cancelled");
    else toast("That request is gone");
    if (friendsOpen()) load();
  }

  /* ---------- 好友名單：搜尋 / 排序 ---------- */
  function defaultFriendDir(sort) { return sort === "name" ? "asc" : "desc"; }

  function loadRosterSort() {
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(FRIEND_SORT_KEY) || "null"); } catch (e) { saved = null; }
    const sort = saved && FRIEND_SORTS.some(o => o.id === saved.sort) ? saved.sort : "name";
    const dir = saved && (saved.dir === "asc" || saved.dir === "desc") ? saved.dir : defaultFriendDir(sort);
    return { sort: sort, dir: dir };
  }

  function saveRosterSort() {
    try { localStorage.setItem(FRIEND_SORT_KEY, JSON.stringify(rosterSort)); } catch (e) { /* ignore */ }
  }

  function syncSortUI() {
    const sel = el("friends-sort");
    if (sel) sel.value = rosterSort.sort;
    const dir = el("friends-sort-dir");
    if (dir) {
      dir.textContent = rosterSort.dir === "asc" ? "↑" : "↓";
      dir.setAttribute("aria-label", rosterSort.dir === "asc" ? "Sort ascending" : "Sort descending");
    }
  }

  function friendHue(name) {
    let h = 0;
    const s = String(name || "");
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
    return h;
  }

  function fmtSince(ms) {
    const d = new Date(Number(ms));
    if (isNaN(d.getTime())) return "";
    return d.toLocaleDateString("en", { month: "short", year: "numeric" });
  }

  /* 好友拍檔：借用 leaderboard 嘅進化 resolver，保證兩處規則一致 */
  function friendPartner(r) {
    if (!r || !r.partner_chain_key) return null;
    try {
      if (typeof Leaderboard !== "undefined" && Leaderboard._resolvePartner) {
        const res = Leaderboard._resolvePartner(
          r.partner_chain_key, r.partner_exp, r.partner_branch);
        if (res && res[0]) {
          return { dex: res[0], name: res[1], level: res[2] || Number(r.partner_level) || 1 };
        }
      }
    } catch (e) { /* 落 fallback */ }
    return null;
  }

  /* get_battle_invites() 每輪順手寫 last_seen_at，5 分鐘內當上線 */
  function isOnline(r) {
    const seen = Number(r && r.last_seen_at);
    return !!seen && Date.now() - seen < PRESENCE_MS;
  }

  function rosterRow(r) {
    const uid = esc(r.account_uuid);
    const name = esc(r.trainer_name || "Trainer");
    const w = Number(r.pvp_wins) || 0;
    const l = Number(r.pvp_losses) || 0;
    const since = fmtSince(r.since);
    const initial = String(r.trainer_name || "T").trim().charAt(0).toUpperCase() || "T";
    const hue = friendHue(r.trainer_name || "");
    const partner = friendPartner(r);
    const online = isOnline(r);
    const meta = (partner ? "Lv." + partner.level + " · " : "")
      + w + "–" + l + (since ? " · since " + since : "");
    const avatarInner = (partner && typeof spriteURL === "function")
      ? '<img src="' + spriteURL(partner.dex) + '" alt="">'
      : esc(initial);
    const dot = online
      ? '<span class="friends-presence" aria-label="Online" title="Online"></span>'
      : "";
    return '<div class="friends-list-row">'
      + '<span class="friends-row-avatar" style="background:hsl(' + hue + ',70%,93%);color:hsl(' + hue + ',45%,32%)">'
      + avatarInner + "</span>"
      + '<div class="friends-row-main">'
      + '<div class="friends-row-name"><span class="friends-name-text">' + name + "</span>" + dot + "</div>"
      + '<div class="friends-meta">' + meta + "</div>"
      + "</div>"
      + '<div class="friends-row-actions">'
      + '<button class="friends-btn friends-btn-invite" data-act="invite" data-uid="' + uid
      + '" data-name="' + name + '">⚔ Battle</button>'
      + '<button class="friends-btn friends-btn-more" data-act="more" data-uid="' + uid
      + '" data-name="' + name + '" aria-label="More options for ' + name + '">⋯</button>'
      + "</div></div>";
  }

  function renderRoster() {
    const box = el("friends-list");
    const countEl = el("friends-count");
    if (!box) return;
    if (countEl) countEl.textContent = String(roster.length);

    if (!roster.length) {
      box.innerHTML = '<div class="friends-empty friends-empty-cta">'
        + '<div class="fe-icon" aria-hidden="true">👋</div>'
        + '<div class="fe-title">No friends yet</div>'
        + '<div class="fe-sub">Share your code or add a trainer to start battling together.</div>'
        + '<button class="friends-btn friends-btn-add" data-act="open-add">＋ Add your first friend</button>'
        + "</div>";
      box.onclick = (e) => {
        const b = e.target.closest("button[data-act]");
        if (b && b.dataset.act === "open-add") setAddPanel(true);
      };
      return;
    }

    const q = rosterSearch.trim().toLowerCase();
    const list = roster.filter(r =>
      !q || String(r.trainer_name || "").toLowerCase().includes(q));
    if (!list.length) {
      box.innerHTML = '<div class="friends-empty">No friend named “' + esc(rosterSearch.trim()) + '”.</div>';
      box.onclick = null;
      return;
    }

    const dir = rosterSort.dir === "asc" ? 1 : -1;
    list.sort((a, b) => {
      let cmp;
      if (rosterSort.sort === "wins") cmp = (Number(a.pvp_wins) || 0) - (Number(b.pvp_wins) || 0);
      else if (rosterSort.sort === "recent") cmp = (Number(a.since) || 0) - (Number(b.since) || 0);
      else cmp = String(a.trainer_name || "").localeCompare(String(b.trainer_name || ""));
      if (!cmp) cmp = String(a.trainer_name || "").localeCompare(String(b.trainer_name || ""));
      return cmp * dir;
    });

    box.innerHTML = list.map(rosterRow).join("");
    box.onclick = (e) => {
      const b = e.target.closest("button[data-act]");
      if (!b) return;
      if (b.dataset.act === "invite") openInviteModal(b.dataset.uid, b.dataset.name);
      else if (b.dataset.act === "more") openFriendMenu(b.dataset.uid, b.dataset.name);
    };
  }

  /* ---------- 加好友面板：預設收起 ---------- */
  function setAddPanel(open) {
    const panel = el("friends-add-panel");
    const btn = el("friends-add-toggle");
    if (!panel) return;
    panel.hidden = !open;
    if (btn) {
      btn.classList.toggle("open", open);
      btn.textContent = open ? "− Close" : "＋ Add friend";
    }
    if (open) setTimeout(() => { const input = el("friends-add-input"); if (input) input.focus(); }, 80);
  }

  /* ---------- 好友卡「⋯」選單 ---------- */
  function openFriendMenu(uid, name) {
    if (!window.App || !App.showModal) return;
    App.showModal('<div class="friends-invite-modal">'
      + '<h3 class="friends-modal-title">' + esc(name) + "</h3>"
      + '<p class="friends-modal-sub">Remove this friend from your list?</p>'
      + '<button id="friends-menu-remove" class="btn-big btn-danger">REMOVE FRIEND</button>'
      + '<button id="friends-menu-cancel" class="btn-big btn-plain" style="margin-top:8px">CANCEL</button>'
      + "</div>", false);
    const cancel = el("friends-menu-cancel");
    if (cancel) cancel.onclick = () => App.closeModal();
    const remove = el("friends-menu-remove");
    if (remove) remove.onclick = () => { App.closeModal(); confirmRemove(uid, name); };
  }

  function confirmRemove(uid, name) {
    if (!window.App || !App.showModal) return;
    App.showModal('<div class="confirm-box">'
      + "<p>Remove <b>" + esc(name) + "</b> from your friends?</p>"
      + '<div class="confirm-row">'
      + '<button id="friends-remove-yes" class="btn-big btn-danger">REMOVE</button>'
      + '<button id="friends-remove-no" class="btn-big btn-plain">CANCEL</button>'
      + "</div></div>", true);

    const no = el("friends-remove-no");
    if (no) no.onclick = () => App.closeModal();
    const yes = el("friends-remove-yes");
    if (yes) yes.onclick = Guard.asyncClick(async () => {
      App.closeModal();
      const res = await call("removeFriend", uid);
      if (!res || !res.removed) { toast("Could not remove friend"); return; }
      toast("Removed " + (name || "friend"));
      refreshBadge();
      if (friendsOpen()) load();
    }, "remove-friend");
  }

  /* ---------- 對戰邀請 ---------- */
  function openInviteModal(uid, name) {
    if (!window.App || !App.showModal) return;
    App.showModal('<div class="friends-invite-modal">'
      + '<h3 class="friends-modal-title">Invite ' + esc(name) + "</h3>"
      + '<p class="friends-modal-sub">You will both vote on team size, medicine and switching before the battle.</p>'
      + '<button id="friends-invite-send" class="btn-big btn-primary">SEND CHALLENGE</button>'
      + '<button id="friends-invite-cancel" class="btn-big btn-plain">CANCEL</button>'
      + "</div>", false);   /* 可以撳背景 / CANCEL 關閉 */

    /* 人數由入場後嘅戰前投票決定；server 仍要 team_size ∈ {1,3,6}，送 3 做 placeholder */
    const send = el("friends-invite-send");
    if (send) send.onclick = () => sendInvite(uid, name, 3);
    const cancel = el("friends-invite-cancel");
    if (cancel) cancel.onclick = () => App.closeModal();
  }

  async function sendInvite(uid, name, size) {
    App.closeModal();
    const res = await call("sendBattleInvite", uid, size);
    const status = res && res.status;
    if (status === "sent" || status === "pending_exists") {
      startWaiting(res.invite_id, name, Number(res.team_size) || size);
      toast(status === "sent" ? "Challenge sent to " + (name || "friend") : "You already have a pending invite");
      if (friendsOpen()) load();
      return;
    }
    const msgs = {
      not_friend: "That trainer is not your friend",
      bad_size: "Pick 1v1, 3v3 or 6v6",
      not_found: "Could not send invite"
    };
    toast(msgs[status] || "Could not send invite");
  }

  function startWaiting(inviteId, friendName, size) {
    stopWaiting(false);
    waiting = {
      inviteId: String(inviteId),
      friendName: friendName || "friend",
      size: size,
      startedAt: Date.now(),
      timer: null
    };
    if (friendsOpen()) renderInvites(lastInvites);
    pollWaiting();
  }

  function stopWaiting(showMsg, msg) {
    if (waiting && waiting.timer) clearTimeout(waiting.timer);
    waiting = null;
    if (showMsg && msg) toast(msg);
    if (friendsOpen()) load();
  }

  async function pollWaiting() {
    if (!waiting) return;
    const current = waiting;
    current.timer = setTimeout(async () => {
      if (!waiting || waiting.inviteId !== current.inviteId) return;

      /* 10 分鐘本地 timeout（同 server 一致） */
      if (Date.now() - current.startedAt > INVITE_TTL_MS) {
        stopWaiting(true, "No response");
        return;
      }

      const rows = await call("getBattleInvites");
      if (!waiting || waiting.inviteId !== current.inviteId) return;

      if (Array.isArray(rows)) {
        lastInvites = rows;
        const found = rows.find(r => String(r.invite_id) === current.inviteId);
        if (!found) {
          /* declined / cancelled：server 已唔再回傳 */
          stopWaiting(true, "No response");
          return;
        }
        if (found.status === "accepted" && found.direction === "out") {
          const invite = found;
          stopWaiting(false);
          await openOutgoingBattle(invite);
          return;
        }
        if (found.status !== "pending" && found.status !== "accepted") {
          stopWaiting(true, "No response");
          return;
        }
      }

      if (friendsOpen()) renderInvites(lastInvites);
      pollWaiting();
    }, INVITE_POLL_MS);
  }

  /* 對方接受：拉 battle row → 開好友局 */
  async function openOutgoingBattle(invite) {
    let battle = null;
    try {
      if (typeof PvpNet !== "undefined" && PvpNet.fetchBattle) {
        battle = await PvpNet.fetchBattle(invite.battle_id);
      }
    } catch (e) {
      console.warn("[Friends] fetchBattle failed:", e && e.message);
    }
    if (!battle) { toast("Could not load the battle"); return; }
    openFriendBattle(battle, invite.trainer_name);
  }

  function openFriendBattle(battle, foeName) {
    if (typeof BattleUI !== "undefined" && BattleUI.openFriendMatch) {
      BattleUI.openFriendMatch(battle, foeName);
      return true;
    }
    toast("Friend battles are not available yet");
    return false;
  }

  /* ---------- 邀請：全部合併入 Action Center ---------- */
  function renderInvites(rows) {
    if (Array.isArray(rows)) lastInvites = rows;
    renderActions();
  }

  async function cancelWaiting() {
    const w = waiting;
    if (!w) return;
    const res = await call("cancelBattleInvite", w.inviteId);
    stopWaiting(false);
    if (!res || (res.status && res.status !== "cancelled")) toast("Could not cancel invite");
    else toast("Invite cancelled");
  }

  async function cancelInvite(inviteId) {
    const res = await call("cancelBattleInvite", inviteId);
    if (!res || (res.status && res.status !== "cancelled")) toast("Could not cancel invite");
    else toast("Invite cancelled");
    if (friendsOpen()) load();
  }

  async function declineInvite(inviteId) {
    const res = await call("respondBattleInvite", inviteId, false);
    if (!res) { toast("Could not decline invite"); }
    else if (res.status === "expired") toast("That invite expired");
    else if (res.status === "declined") toast("Invite declined");
    else if (res.status === "not_found") toast("That invite is no longer available");
    else if (res.status === "not_friend") toast("That trainer is no longer your friend");
    else toast("Could not decline invite");
    if (friendsOpen()) load();
  }

  /* 接受方：server 已經開好 battle row，直接組物件開局 */
  async function acceptInvite(inviteId) {
    const res = await call("respondBattleInvite", inviteId, true);
    if (!res) { toast("Could not accept invite"); if (friendsOpen()) load(); return; }

    if (res.status === "accepted") {
      const me = (window.SupabaseAuth && SupabaseAuth.currentUser) ? SupabaseAuth.currentUser() : null;
      const battle = {
        id: res.battle_id,
        seed: res.seed,
        team_size: res.team_size,
        p1_uid: res.foe_uid,
        p2_uid: me ? me.id : null,
        is_friend: true
      };
      if (!openFriendBattle(battle, res.foe_name) && friendsOpen()) load();
      return;
    }
    if (res.status === "expired") toast("That invite expired");
    else if (res.status === "declined") toast("That invite is no longer available");
    else if (res.status === "not_found") toast("That invite is no longer available");
    else if (res.status === "not_friend") toast("That trainer is no longer your friend");
    else toast("Could not accept invite");
    if (friendsOpen()) load();
  }

  /* ---------- expose ---------- */
  const api = {
    open,
    addByUid,
    summary,
    startPolling,
    stopPolling,
    load,
    /* 排行榜「ACCEPT」直接接受好友請求 */
    acceptRequest: (uid) => respondRequest(uid, true)
  };
  window.Friends = api;
  return api;
})();
