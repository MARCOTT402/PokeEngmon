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
  const INVITE_TTL_MS = 120000;   /* 本地 2 分鐘後顯示 Expired */
  const MAX_FRIENDS = 50;
  const MAX_PENDING = 20;

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
  let bound = false;

  /* ---------- 小工具 ---------- */
  function toast(msg) { if (window.App && App.toast) App.toast(msg); }
  function el(id) { return document.getElementById(id); }

  function esc(s) {
    const v = String(s == null ? "" : s);
    if (typeof escapeHTML === "function") return escapeHTML(v);
    return v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function loggedIn() {
    return !!(window.SupabaseAuth && SupabaseAuth.isEnabled && SupabaseAuth.isEnabled()
      && SupabaseAuth.isLoggedIn && SupabaseAuth.isLoggedIn());
  }

  function meUid() {
    const u = (window.SupabaseAuth && SupabaseAuth.currentUser) ? SupabaseAuth.currentUser() : null;
    return u ? u.id : null;
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
    if (window.App && App.showView) App.showView("view-friends");
    bindView();
    load();
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
    seenInvites.clear();
    if (waiting && waiting.timer) clearTimeout(waiting.timer);
    waiting = null;
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
      const friendsRes = await call("getMyFriends");
      if (!polling) return;

      if (Array.isArray(friendsRes)) cache.friends = friendsRes.length;

      if (Array.isArray(invitesRes)) {
        lastInvites = invitesRes;
        cache.invites = invitesRes.filter(i => i.direction === "in" && i.status === "pending").length;
        notifyInvites(invitesRes);
        if (friendsOpen()) renderInvites(invitesRes);
      }
      if (Array.isArray(reqRes)) {
        cache.requests = reqRes.length;
        if (friendsOpen()) renderRequests(reqRes);
      }
      if (!Array.isArray(invitesRes) && !Array.isArray(reqRes) && friendsOpen()) {
        toast("Could not refresh friends");
      }
      refreshBadge();
    } finally {
      tickRunning = false;
      if (polling) reschedule(friendsOpen() ? VIEW_POLL_MS : POLL_MS);
    }
  }

  /* 新嘅 incoming pending invite → toast（每個 invite_id 只一次） */
  function notifyInvites(rows) {
    const view = activeView();
    if (view !== "view-home" && view !== "view-battle-menu" && view !== "view-friends") return;
    rows.forEach(inv => {
      if (inv.direction !== "in" || inv.status !== "pending") return;
      const key = String(inv.invite_id);
      if (seenInvites.has(key)) return;
      seenInvites.add(key);
      toast((inv.trainer_name || "A friend") + " challenged you to a "
        + inv.team_size + "v" + inv.team_size + " battle!");
    });
  }

  function refreshBadge() {
    const badge = el("battle-menu-friends-badge");
    const total = (Number(cache.requests) || 0) + (Number(cache.invites) || 0);
    if (badge) {
      badge.textContent = String(total);
      badge.hidden = total <= 0;
    }
    /* 登入後 tile 副標題顯示好友／請求數 */
    const sub = el("battle-menu-friends-sub");
    if (sub && loggedIn()) {
      const f = Number(cache.friends) || 0;
      const r = Number(cache.requests) || 0;
      sub.textContent = f + " friend" + (f === 1 ? "" : "s") + " · " + r + " request" + (r === 1 ? "" : "s");
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
    bound = true;
  }

  function setCode(text) {
    const c = el("friends-code");
    if (c) c.textContent = text;
  }

  function setEmpty(id, text) {
    const box = el(id);
    if (box) box.innerHTML = '<div class="friends-empty">' + esc(text) + "</div>";
  }

  async function load() {
    bindView();
    if (!loggedIn()) {
      setCode("Log in first");
      setEmpty("friends-requests", "Log in to see friends");
      setEmpty("friends-list", "Log in to see friends");
      setEmpty("friends-invites", "Log in to see invites");
      return;
    }

    const seq = ++loadSeq;
    setCode("Loading…");
    setEmpty("friends-requests", "Loading…");
    setEmpty("friends-list", "Loading…");
    setEmpty("friends-invites", "Loading…");

    const codeRes = await call("ensureFriendCode");
    if (seq !== loadSeq) return;
    myCode = codeFrom(codeRes);
    setCode(myCode || "Unavailable");
    if (!myCode) toast("Could not load your friend code");

    const [friendsRes, reqRes, invitesRes] = await Promise.all([
      call("getMyFriends"),
      call("getFriendRequests"),
      call("getBattleInvites")
    ]);
    if (seq !== loadSeq) return;

    if (Array.isArray(friendsRes)) cache.friends = friendsRes.length;
    if (Array.isArray(reqRes)) cache.requests = reqRes.length;
    if (Array.isArray(invitesRes)) {
      lastInvites = invitesRes;
      cache.invites = invitesRes.filter(i => i.direction === "in" && i.status === "pending").length;
    }

    renderRequests(reqRes);
    renderFriendsList(friendsRes);
    renderInvites(invitesRes);
    refreshBadge();

    if (!Array.isArray(friendsRes) || !Array.isArray(reqRes) || !Array.isArray(invitesRes)) {
      toast("Could not load friends data");
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
    } catch (e) {
      toast("Copy failed — long-press the code");
    }
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

    box.onclick = async (e) => {
      const b = e.target.closest("button[data-act]");
      if (!b) return;
      b.disabled = true;
      if (b.dataset.act === "add") await addByUid(b.dataset.uid, b.dataset.name);
      else if (b.dataset.act === "accept") await respondRequest(b.dataset.uid, true);
    };
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
    const box = el("friends-requests");
    if (!box) return;
    if (!Array.isArray(rows)) {
      box.innerHTML = '<div class="friends-empty">Could not load requests</div>';
      return;
    }
    if (!rows.length) {
      box.innerHTML = '<div class="friends-empty">No requests</div>';
      return;
    }
    box.innerHTML = rows.map(r => {
      const uid = esc(r.account_uuid);
      return '<div class="friends-list-row">'
        + '<span class="friends-row-name">' + esc(r.trainer_name || "Trainer") + "</span>"
        + '<span class="friends-row-actions">'
        + '<button class="friends-btn friends-btn-accept" data-act="accept" data-uid="' + uid + '">ACCEPT</button>'
        + '<button class="friends-btn friends-btn-decline" data-act="decline" data-uid="' + uid + '">DECLINE</button>'
        + "</span></div>";
    }).join("");

    box.onclick = async (e) => {
      const b = e.target.closest("button[data-act]");
      if (!b) return;
      b.disabled = true;
      await respondRequest(b.dataset.uid, b.dataset.act === "accept");
    };
  }

  /* ---------- 好友清單 ---------- */
  function renderFriendsList(rows) {
    const box = el("friends-list");
    if (!box) return;
    if (!Array.isArray(rows)) {
      box.innerHTML = '<div class="friends-empty">Could not load friends</div>';
      return;
    }
    if (!rows.length) {
      box.innerHTML = '<div class="friends-empty">No friends yet</div>';
      return;
    }
    box.innerHTML = rows.map(r => {
      const uid = esc(r.account_uuid);
      const name = esc(r.trainer_name || "Trainer");
      const w = Number(r.pvp_wins) || 0;
      const l = Number(r.pvp_losses) || 0;
      return '<div class="friends-list-row">'
        + '<div class="friends-row-main">'
        + '<div class="friends-row-name">' + name + "</div>"
        + '<div class="friends-meta">' + w + "–" + l + "</div>"
        + "</div>"
        + '<div class="friends-row-actions">'
        + '<button class="friends-btn friends-btn-invite" data-act="invite" data-uid="' + uid
        + '" data-name="' + name + '">⚔ Battle</button>'
        + '<button class="friends-btn friends-btn-remove" data-act="remove" data-uid="' + uid
        + '" data-name="' + name + '">REMOVE</button>'
        + "</div></div>";
    }).join("");

    box.onclick = (e) => {
      const b = e.target.closest("button[data-act]");
      if (!b) return;
      if (b.dataset.act === "invite") openInviteModal(b.dataset.uid, b.dataset.name);
      else if (b.dataset.act === "remove") confirmRemove(b.dataset.uid, b.dataset.name);
    };
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
    if (yes) yes.onclick = async () => {
      App.closeModal();
      const res = await call("removeFriend", uid);
      if (!res || !res.removed) { toast("Could not remove friend"); return; }
      toast("Removed " + (name || "friend"));
      refreshBadge();
      if (friendsOpen()) load();
    };
  }

  /* ---------- 對戰邀請 ---------- */
  function openInviteModal(uid, name) {
    if (!window.App || !App.showModal) return;
    App.showModal('<div class="friends-invite-modal">'
      + '<h3 class="friends-modal-title">Invite ' + esc(name) + "</h3>"
      + '<p class="friends-modal-sub">Choose a team size for the friendly battle.</p>'
      + '<div class="friends-size-row">'
      + '<button class="friends-size-btn" data-size="1">1v1</button>'
      + '<button class="friends-size-btn" data-size="3">3v3</button>'
      + '<button class="friends-size-btn" data-size="6">6v6</button>'
      + "</div>"
      + '<button id="friends-invite-cancel" class="btn-big btn-plain">CANCEL</button>'
      + "</div>", false);   /* 可以撳背景 / CANCEL 關閉 */

    document.querySelectorAll(".friends-size-btn").forEach(b => {
      b.onclick = () => sendInvite(uid, name, Number(b.dataset.size));
    });
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

      /* 2 分鐘本地 timeout */
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

  /* ---------- 邀請列表 ---------- */
  function renderInvites(rows) {
    const box = el("friends-invites");
    if (!box) return;

    const parts = [];
    if (waiting) parts.push(waitingHTML());

    if (!Array.isArray(rows)) {
      parts.push('<div class="friends-empty">Could not load invites</div>');
    } else {
      /* waiting 區塊已經顯示自己發嘅邀請，避免重複一行 */
      const pending = rows.filter(r => r.status === "pending"
        && !(waiting && r.direction === "out" && String(r.invite_id) === waiting.inviteId));
      pending.forEach(inv => parts.push(inviteHTML(inv)));
      if (!pending.length && !waiting) {
        parts.push('<div class="friends-empty">No invites</div>');
      }
    }
    box.innerHTML = parts.join("");

    box.onclick = async (e) => {
      const b = e.target.closest("button[data-act]");
      if (!b) return;
      b.disabled = true;
      const act = b.dataset.act;
      if (act === "accept-invite") await acceptInvite(b.dataset.invite);
      else if (act === "decline-invite") await declineInvite(b.dataset.invite);
      else if (act === "cancel-invite") await cancelInvite(b.dataset.invite);
      else if (act === "cancel-wait") await cancelWaiting();
    };
  }

  function secondsLeft(createdAtMs) {
    const created = Number(createdAtMs) || 0;
    const left = Math.ceil((created + INVITE_TTL_MS - Date.now()) / 1000);
    return Math.max(0, left);
  }

  function inviteHTML(inv) {
    const name = esc(inv.trainer_name || "Trainer");
    const size = Number(inv.team_size) || 3;
    const id = esc(inv.invite_id);
    const expired = Date.now() >= (Number(inv.created_at) || 0) + INVITE_TTL_MS;

    if (inv.direction === "in") {
      const actions = expired
        ? '<span class="friends-expired">Expired</span>'
        : '<button class="friends-btn friends-btn-accept" data-act="accept-invite" data-invite="' + id + '">ACCEPT</button>'
          + '<button class="friends-btn friends-btn-decline" data-act="decline-invite" data-invite="' + id + '">DECLINE</button>';
      return '<div class="friends-invite-row">'
        + '<div class="friends-row-main">'
        + '<div class="friends-row-name">' + name + "</div>"
        + '<div class="friends-meta">⚔ ' + size + "v" + size + "</div>"
        + "</div>"
        + '<div class="friends-row-actions">' + actions + "</div>"
        + "</div>";
    }

    /* outgoing pending：倒數 + CANCEL；2 分鐘後本地顯示 Expired */
    const actions = expired
      ? '<span class="friends-expired">Expired</span>'
      : '<button class="friends-btn friends-btn-decline" data-act="cancel-invite" data-invite="' + id + '">CANCEL</button>';
    return '<div class="friends-invite-row">'
      + '<div class="friends-row-main">'
      + '<div class="friends-row-name">' + (expired
        ? name + " · Expired"
        : "Waiting for " + name + "… (" + secondsLeft(inv.created_at) + "s)") + "</div>"
      + '<div class="friends-meta">⚔ ' + size + "v" + size + "</div>"
      + "</div>"
      + '<div class="friends-row-actions">' + actions + "</div>"
      + "</div>";
  }

  function waitingHTML() {
    const left = Math.max(0, Math.ceil((waiting.startedAt + INVITE_TTL_MS - Date.now()) / 1000));
    return '<div class="friends-waiting friends-invite-row">'
      + '<div class="friends-row-main">'
      + '<div class="friends-row-name">Waiting for ' + esc(waiting.friendName) + "… (" + left + "s)</div>"
      + '<div class="friends-meta">⚔ ' + waiting.size + "v" + waiting.size + "</div>"
      + "</div>"
      + '<div class="friends-row-actions">'
      + '<button class="friends-btn friends-btn-decline" data-act="cancel-wait">CANCEL</button>'
      + "</div></div>";
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
    load
  };
  window.Friends = api;
  return api;
})();
