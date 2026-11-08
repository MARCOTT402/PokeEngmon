/* ============================================================
   Incubator prototype — 喺真 app 所有 script 之前跑（由 build.mjs 插入 <head>）
   1) localStorage 加 namespace：prototype 用自己一份存檔，唔會郁你本機真 app 嘅進度／登入
   2) 停用 Service Worker 註冊：避免 prototype 頁被 SW precache／接管
   ============================================================ */
(function () {
  var NS = "proto_incu:";
  var SP = Storage.prototype, get = SP.getItem, set = SP.setItem, del = SP.removeItem;
  function mine(st) { try { return st === window.localStorage; } catch (e) { return false; } }
  SP.getItem = function (k) { return get.call(this, mine(this) ? NS + k : k); };
  SP.setItem = function (k, v) { return set.call(this, mine(this) ? NS + k : k, v); };
  SP.removeItem = function (k) { return del.call(this, mine(this) ? NS + k : k); };
  if (navigator.serviceWorker) {
    try { navigator.serviceWorker.register = function () { return new Promise(function () {}); }; } catch (e) { /* ignore */ }
    /* 本機開過真 app → localhost 已有真 SW：佢「頁面 3 秒冇回應就用 cache 嘅 index.html」會令 prototype 頁變成舊 index、
       JS 路徑全錯、卡喺 loading。localhost 先註銷（真 app 下次開會自動再註冊）。 */
    if (/^(localhost|127\.0\.0\.1)$/.test(location.hostname) && navigator.serviceWorker.getRegistrations) {
      navigator.serviceWorker.getRegistrations().then(function (rs) { rs.forEach(function (r) { r.unregister(); }); }).catch(function () {});
    }
  }
  window.__INCUBATOR_PROTO__ = true;
})();
