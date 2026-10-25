/* ============================================================
   PokeEngmon - 世代資料包下載管理器
   未解鎖世代零流量零儲存；解鎖時先 download 該代素材
   （GIF + 叫聲 + 資料 JSON），全部經 SW runtime cache 持久化。
   斷點續傳：partial 狀態嘅代喺下次啟動/在線時自動補下。
   ============================================================ */

const GenPack = {
  KEY: "pokeengmon_genpacks_v1",   // localStorage: { "2": "done"|"partial", ... }
  _downloading: {},                // gen -> Promise（避免重複下載）

  _read() {
    try { return JSON.parse(localStorage.getItem(this.KEY) || "{}"); }
    catch (e) { return {}; }
  },
  _write(m) {
    try { localStorage.setItem(this.KEY, JSON.stringify(m)); } catch (e) { /* full */ }
  },

  status(gen) {
    return this._read()[gen] || null;   // null | "partial" | "done"
  },

  /* 下載某代資料包。onProgress({done, total, bytes, totalBytes}) 逐步回調。
     回傳 true=done / false=中途失敗（已記 partial，下次自動續傳）。 */
  async download(gen, onProgress) {
    if (gen <= 1) return true;                       // Gen 1 素材已入 pre-cache
    if (this.status(gen) === "done") return true;
    if (this._downloading[gen]) return this._downloading[gen];

    const job = (async () => {
      let manifest;
      try {
        const res = await fetch(`assets/gen-packs/gen${gen}.json`, { cache: "no-cache" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        manifest = await res.json();
      } catch (e) {
        console.warn(`[GenPack] manifest load failed (gen ${gen})`, e);
        return false;
      }

      const files = manifest.files || [];
      const total = files.length;
      let done = 0;
      let failed = 0;

      /* 逐檔 fetch：行經 SW cache-first handler，成功即永久離線可用。
         並發 4 條加速；個別失敗唔阻塞，記低由下次續傳補。 */
      const queue = files.slice();
      const workers = Array.from({ length: 4 }, async () => {
        while (queue.length) {
          const f = queue.shift();
          try {
            const r = await fetch(encodeURI(f.path));
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            await r.blob();   // 確保內容真正落地（SW 會 cache）
            done++;
          } catch (e) {
            failed++;
          }
          if (onProgress) {
            try { onProgress({ done: done + failed, total, failed }); } catch (e) { /* ignore */ }
          }
        }
      });
      await Promise.all(workers);

      const m = this._read();
      m[gen] = failed === 0 ? "done" : "partial";
      this._write(m);
      return failed === 0;
    })();

    this._downloading[gen] = job;
    try { return await job; }
    finally { delete this._downloading[gen]; }
  },

  /* 啟動時／在線時呼叫：補下所有已解鎖但未 done 嘅代（背景靜默） */
  async resumePending(maxGen) {
    for (let g = 2; g <= (maxGen || 1); g++) {
      if (this.status(g) !== "done") {
        /* 唔 await：背景逐代補 */
        this.download(g).then(ok => {
          if (ok) console.log(`[GenPack] gen ${g} pack ready`);
        });
      }
    }
  }
};

window.GenPack = GenPack;
