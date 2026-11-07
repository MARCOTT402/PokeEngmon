/* ============================================================
   PokeEngmon - Gacha：單抽結算（server 權威 gacha_pull RPC、離線本地結算、進化）
   由 js/gacha.js 拆出（總計劃 P2.5；Rule 116）。同 js/gacha.js 共用同一個 Gacha 物件：
   Object.assign 只係將方法掛返上去，this／Gacha.xxx 用法完全唔變。
   載入次序：js/gacha.js 之後（index.html）。
   ============================================================ */

Object.assign(Gacha, {
  /* ---------- 扣鑽 + 開獎 ----------
     v102 無按鈕版：拉動手杆過閾值 → _triggerPull 先調 _beginPull，
     即刻扣 3 寶石 + server 抽獎背景進行；波球跌出前先結算，
     之後所有演出純視覺，中途離開只會跳過動畫。 */
  _beginPull() {
    if (this.busy || !this._canPull()) return false;
    this.busy = true;
    Pokedex.unlockAudio();   // 喺用戶手勢內解鎖音效（手機自動播放限制）
    const audio = this._audio();
    if (audio) {
      audio.ensure();
      audio.stopTownBGM(500);
      this._townStopped = true;
    }

    /* v99：登入時走 server 權威抽獎 —— gacha_pull RPC 原子扣鑽 +
       server 自己 roll rarity/chain + 拎寵，防止 client 改機率/必中神獸。
       失敗或未登入 → 結算時用本地 path 頂上。 */
    const authed = window.SupabaseAuth && SupabaseAuth.isEnabled() && SupabaseAuth.currentUser();
    const st = loadState();

    this._clearTimers();
    this._flow = {
      id: ++this._flowId,
      rpc: authed ? SupabaseAuth.gachaPull(st.pendingExp || 0, st.unlockedGen || 1).catch(() => null) : null,
      settled: false,
      settling: null,
      settlement: null
    };

    this._refreshControls();
    return true;
  },

  /* 經濟結算：扣鑽 + 派寵一次過落地，同演出完全解耦。
     server 有結果用 server 權威數據，否則行本地 fallback。 */
  async _settleResult(flow) {
    if (!flow) return null;
    if (flow.settled) return flow.settlement;
    if (flow.settling) return flow.settling;   // 同一 flow 只結算一次

    flow.settling = (async () => {
      let r = null;
      if (flow.rpc) {
        flow.rpcPending = true;
        flow.rpc.then(() => { flow.rpcPending = false; });
        await Promise.resolve();
        /* 仲等緊 server 先用「…」頂住，避免玩家以為流程卡死 */
        if (flow.rpcPending && flow.id === this._flowId) this._prompt("…");
        r = await flow.rpc;
        if (flow.id === this._flowId) this._prompt("");
      }

      const st = loadState();
      let rarity, chainKey, entry, isDupe, candyGain = 0;
      let firstExpEvolve = null;
      let newlyUnlockedGen = null;

      if (r && r.entry) {
        /* server path：扣鑽 / rarity / dupe 已由 gacha_pull RPC 完成 */
        st.diamonds = r.balance;          // server 權威餘額（已扣 3 鑽）
        saveState();
        rarity = r.rarity;
        chainKey = r.entry.chain_key;
        const hadEntries = st.entries.length > 0;
        const genBefore = st.unlockedGen || 1;
        entry = adoptServerEntry(r.entry);
        const genAfter = loadState().unlockedGen || 1;
        if (genAfter > genBefore) newlyUnlockedGen = genAfter;
        isDupe = r.is_dupe;
        candyGain = isDupe ? 1 : 0;       // 稀有抽 dupe 必送 1 糖（server 已入帳）
        if (st.pendingExp > 0) {
          if (!hadEntries && !isDupe) {
            /* 第一隻寵：server init_exp 已入帳 → 本地清零 */
            st.pendingExp = 0;
            saveState();
            if (entry.stage > 1) firstExpEvolve = SPECIES[entryCurrentSpecies(entry)[0]];
          } else {
            /* server 冇 apply init_exp（唔係第一隻）→ 本地入帳 + 背景補 RPC */
            const pending = st.pendingExp;
            const res = addEntryExp(entry, pending);
            st.pendingExp = 0;
            (res.learned || []).forEach(m => {
              if (entry.moves.length < 4 && !entry.moves.includes(m.move)) entry.moves.push(m.move);
            });
            saveState();
            firstExpEvolve = res.evolvedTo;
            if (window.SupabaseAuth && SupabaseAuth.isEnabled() && SupabaseAuth.currentUser()) {
              SupabaseAuth.addEntryExp(entry.uid, pending);
              if (res.evolvedTo && entry.branch != null && window.Sync && Sync.isEnabled()) {
                Sync.patchEntry(entry.uid, { branch: entry.branch });
              }
            }
          }
        }
      } else {
        /* v140：已登入且 RPC 已試過但失敗 → 唔好本地假成功（否則 pull 會打回頭，寵／鑽「消失」）
           匿名／真離線（冇發起 RPC）先至走本地 fallback */
        const attemptedRpc = !!flow.rpc;
        const loggedIn = !!(window.SupabaseAuth && SupabaseAuth.isLoggedIn && SupabaseAuth.isLoggedIn());
        if (loggedIn && attemptedRpc) {
          flow.settled = true;
          flow.settlement = null;
          return null;
        }
        /* 本地 fallback（匿名／離線） */
        rarity = this.rollRarity(this.mode);
        chainKey = this.pickChain(rarity);
        if (!chainKey) {
          /* 該世代呢個稀有度冇鏈（理論上唔會發生）→ 退款兼中止 */
          flow.settled = true;
          flow.settlement = null;
          return null;
        }
        st.diamonds -= GAME_CONFIG.RARE_PULL_COST;
        saveState();
        const got = obtainPokemon(chainKey, this.mode);
        entry = got.entry;
        isDupe = got.isDupe;
        candyGain = got.candyGain || 0;
        newlyUnlockedGen = got.newlyUnlockedGen || null;

        /* 若有之前儲起嘅經驗值（第一次未有拍檔時），一次過入帳
           v138：必須先 snapshot pending，再清零——舊碼清零後 RPC 永遠傳 0 */
        if (st.pendingExp > 0) {
          const pending = st.pendingExp;
          const res = addEntryExp(entry, pending);
          st.pendingExp = 0;
          (res.learned || []).forEach(m => {
            if (entry.moves.length < 4 && !entry.moves.includes(m.move)) entry.moves.push(m.move);
          });
          saveState();
          firstExpEvolve = res.evolvedTo;
          if (window.SupabaseAuth && SupabaseAuth.isEnabled() && SupabaseAuth.currentUser()) {
            SupabaseAuth.addEntryExp(entry.uid, pending);
            if (res.evolvedTo && entry.branch != null && window.Sync && Sync.isEnabled()) {
              Sync.patchEntry(entry.uid, { branch: entry.branch });
            }
          }
        }
      }

      flow.settled = true;
      flow.settlement = { rarity, chainKey, entry, isDupe, candyGain, firstExpEvolve, newlyUnlockedGen };

      /* 預先載入叫聲，出卡時即刻叫（v102 起：新舊寵都播） */
      const preview = EVOLUTION_CHAINS.find(c => c.key === chainKey);
      if (preview) Pokedex.prepareCry(preview.stages[0][0]);

      this._updateDiamondDisplay();
      return flow.settlement;
    })();

    try {
      return await flow.settling;
    } finally {
      flow.settling = null;
    }
  },

  /* server 單抽結果落地（沿用單抽 server path 的規則） */
  _applyServerPull(r, applyPending) {
    const st = loadState();
    st.diamonds = r.balance;
    saveState();
    const rarity = r.rarity;
    const chainKey = r.entry.chain_key;
    const hadEntries = st.entries.length > 0;
    const genBefore = st.unlockedGen || 1;
    const entry = adoptServerEntry(r.entry);
    const genAfter = loadState().unlockedGen || 1;
    const newlyUnlockedGen = genAfter > genBefore ? genAfter : null;
    const isDupe = !!r.is_dupe;
    const candyGain = isDupe ? 1 : 0;
    let firstExpEvolve = null;

    if (applyPending && st.pendingExp > 0) {
      if (!hadEntries && !isDupe) {
        st.pendingExp = 0;
        saveState();
        if (entry.stage > 1) firstExpEvolve = SPECIES[entryCurrentSpecies(entry)[0]];
      } else {
        const pending = st.pendingExp;
        const res = addEntryExp(entry, pending);
        st.pendingExp = 0;
        (res.learned || []).forEach(m => {
          if (entry.moves.length < 4 && !entry.moves.includes(m.move)) entry.moves.push(m.move);
        });
        saveState();
        firstExpEvolve = res.evolvedTo;
        if (window.SupabaseAuth && SupabaseAuth.isEnabled() && SupabaseAuth.currentUser()) {
          SupabaseAuth.addEntryExp(entry.uid, pending);
          if (res.evolvedTo && entry.branch != null && window.Sync && Sync.isEnabled()) {
            Sync.patchEntry(entry.uid, { branch: entry.branch });
          }
        }
      }
    }

    const preview = EVOLUTION_CHAINS.find(c => c.key === chainKey);
    if (preview) Pokedex.prepareCry(preview.stages[0][0]);
    return { rarity, chainKey, entry, isDupe, candyGain, firstExpEvolve, newlyUnlockedGen };
  },

  /* 本地單抽結果落地（匿名／離線） */
  _applyLocalPull(chainKey, rarity, applyPending) {
    const got = obtainPokemon(chainKey, this.mode);
    if (!got) return null;
    const entry = got.entry;
    const isDupe = got.isDupe;
    const candyGain = got.candyGain || 0;
    const newlyUnlockedGen = got.newlyUnlockedGen || null;
    let firstExpEvolve = null;
    const st = loadState();

    if (applyPending && st.pendingExp > 0) {
      const pending = st.pendingExp;
      const res = addEntryExp(entry, pending);
      st.pendingExp = 0;
      (res.learned || []).forEach(m => {
        if (entry.moves.length < 4 && !entry.moves.includes(m.move)) entry.moves.push(m.move);
      });
      saveState();
      firstExpEvolve = res.evolvedTo;
      if (window.SupabaseAuth && SupabaseAuth.isEnabled() && SupabaseAuth.currentUser()) {
        SupabaseAuth.addEntryExp(entry.uid, pending);
        if (res.evolvedTo && entry.branch != null && window.Sync && Sync.isEnabled()) {
          Sync.patchEntry(entry.uid, { branch: entry.branch });
        }
      }
    }
    return { rarity, chainKey, entry, isDupe, candyGain, firstExpEvolve, newlyUnlockedGen };
  },

  /* 本地保底：50/50 legend / epic，優先「未持有」，排除 normal */
  _pickLuckyChainLocal(gen) {
    const st = loadState();
    const owned = new Set((st.entries || []).map(e => e.chainKey));
    const order = Math.random() < 0.5 ? ["legend", "epic"] : ["epic", "legend"];
    for (const rar of order) {
      const pool = pullablePool(gen, rar) || [];
      if (!pool.length) continue;
      const fresh = pool.filter(k => !owned.has(k));
      const list = fresh.length ? fresh : pool;
      return { rarity: rar, key: list[Math.floor(Math.random() * list.length)] };
    }
    return { rarity: "rare", key: this.pickChain("rare") };
  },

  /* 一次過揭示所有待播進化（逐個彈窗，上一個撳完先到下一個） */
  _flushEvolves(list) {
    const q = (list || []).filter(Boolean);
    if (!q.length) return;
    const show = (i) => {
      if (i >= q.length) return;
      App.showEvolveModal(q[i], () => show(i + 1));
    };
    show(0);
  }
});
