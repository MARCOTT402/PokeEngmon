/* Custom picture-question images — IndexedDB (not localStorage; avoid ~5MB quota). */
const QImgDB = (() => {
  const DB_NAME = "pokeengmon_qimg_v1";
  const STORE = "images";
  const urlCache = new Map(); /* imageId -> objectURL */

  function open() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error("IndexedDB open failed"));
    });
  }

  function urlSync(id) {
    return urlCache.get(id) || "";
  }

  function cacheBlob(id, blob) {
    const prev = urlCache.get(id);
    if (prev) {
      try { URL.revokeObjectURL(prev); } catch (e) {}
    }
    const url = URL.createObjectURL(blob);
    urlCache.set(id, url);
    return url;
  }

  async function put(id, blob) {
    const db = await open();
    try {
      await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, "readwrite");
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.objectStore(STORE).put(blob, id);
      });
    } finally {
      db.close();
    }
    return cacheBlob(id, blob);
  }

  async function get(id) {
    if (urlCache.has(id)) return urlCache.get(id);
    const db = await open();
    try {
      const blob = await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, "readonly");
        const req = tx.objectStore(STORE).get(id);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error);
      });
      if (!blob) return "";
      return cacheBlob(id, blob);
    } finally {
      db.close();
    }
  }

  async function clear() {
    for (const url of urlCache.values()) {
      try { URL.revokeObjectURL(url); } catch (e) {}
    }
    urlCache.clear();
    const db = await open();
    try {
      await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, "readwrite");
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.objectStore(STORE).clear();
      });
    } finally {
      db.close();
    }
  }

  /* Hydrate object URLs for every custom question that has imageId */
  async function hydrateFromState(customQuestions) {
    const list = customQuestions || [];
    await Promise.all(list.map(async (q) => {
      if (q && q.imageId && !urlCache.has(q.imageId)) {
        try { await get(q.imageId); } catch (e) { console.warn("QImgDB hydrate", e); }
      }
    }));
  }

  return { put, get, clear, urlSync, hydrateFromState };
})();
