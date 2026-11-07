// @ts-check
/* =====================================================================
   Trainer Avatar（第 14 項）：原作角色全身像（Pokémon Showdown 80×80 trainer sprites）
   - 圖檔：assets/trainers/avatars/<id>.png（tools/fetch_trainer_avatars.py 下載）
   - 本地：st.trainerAvatar；雲端：user_account.trainer_avatar（column grant + check）
   - 好友／對手：RPC get_trainer_cards 攞（名、頭像、PvP 戰績、對戰紀錄）
   ===================================================================== */
const Avatars = (() => {
  const GROUPS = ["Heroes", "Rivals", "Kanto", "Johto", "Hoenn", "Sinnoh", "Unova", "Elite Four", "Professors", "Villains"];
  /* id = 檔名；src = Showdown 檔名（唔同先寫） */
  const LIST = [
    { id: "red", name: "Red", g: "Heroes" }, { id: "leaf", name: "Leaf", g: "Heroes", src: "leaf-gen3" },
    { id: "ethan", name: "Ethan", g: "Heroes" }, { id: "lyra", name: "Lyra", g: "Heroes" }, { id: "kris", name: "Kris", g: "Heroes" },
    { id: "brendan", name: "Brendan", g: "Heroes" }, { id: "may", name: "May", g: "Heroes" },
    { id: "lucas", name: "Lucas", g: "Heroes" }, { id: "dawn", name: "Dawn", g: "Heroes" },
    { id: "hilbert", name: "Hilbert", g: "Heroes" }, { id: "hilda", name: "Hilda", g: "Heroes" },
    { id: "nate", name: "Nate", g: "Heroes" }, { id: "rosa", name: "Rosa", g: "Heroes" },
    { id: "calem", name: "Calem", g: "Heroes" }, { id: "serena", name: "Serena", g: "Heroes" },
    { id: "elio", name: "Elio", g: "Heroes" }, { id: "selene", name: "Selene", g: "Heroes" },
    { id: "victor", name: "Victor", g: "Heroes" }, { id: "gloria", name: "Gloria", g: "Heroes" },

    { id: "blue", name: "Blue", g: "Rivals" }, { id: "silver", name: "Silver", g: "Rivals" }, { id: "wally", name: "Wally", g: "Rivals" },
    { id: "barry", name: "Barry", g: "Rivals" }, { id: "cheren", name: "Cheren", g: "Rivals" }, { id: "bianca", name: "Bianca", g: "Rivals" },
    { id: "n", name: "N", g: "Rivals" }, { id: "hugh", name: "Hugh", g: "Rivals" },

    { id: "brock", name: "Brock", g: "Kanto" }, { id: "misty", name: "Misty", g: "Kanto" }, { id: "ltsurge", name: "Lt. Surge", g: "Kanto" },
    { id: "erika", name: "Erika", g: "Kanto" }, { id: "koga", name: "Koga", g: "Kanto" }, { id: "janine", name: "Janine", g: "Kanto" },
    { id: "sabrina", name: "Sabrina", g: "Kanto" }, { id: "blaine", name: "Blaine", g: "Kanto" },

    { id: "falkner", name: "Falkner", g: "Johto" }, { id: "bugsy", name: "Bugsy", g: "Johto" }, { id: "whitney", name: "Whitney", g: "Johto" },
    { id: "morty", name: "Morty", g: "Johto" }, { id: "chuck", name: "Chuck", g: "Johto" }, { id: "jasmine", name: "Jasmine", g: "Johto" },
    { id: "pryce", name: "Pryce", g: "Johto" }, { id: "clair", name: "Clair", g: "Johto" },

    { id: "roxanne", name: "Roxanne", g: "Hoenn" }, { id: "brawly", name: "Brawly", g: "Hoenn" }, { id: "wattson", name: "Wattson", g: "Hoenn" },
    { id: "flannery", name: "Flannery", g: "Hoenn" }, { id: "norman", name: "Norman", g: "Hoenn" }, { id: "winona", name: "Winona", g: "Hoenn" },
    { id: "tate", name: "Tate", g: "Hoenn" }, { id: "liza", name: "Liza", g: "Hoenn" }, { id: "juan", name: "Juan", g: "Hoenn" },
    { id: "wallace", name: "Wallace", g: "Hoenn" }, { id: "steven", name: "Steven", g: "Hoenn" },

    { id: "roark", name: "Roark", g: "Sinnoh" }, { id: "gardenia", name: "Gardenia", g: "Sinnoh" }, { id: "maylene", name: "Maylene", g: "Sinnoh" },
    { id: "crasherwake", name: "Crasher Wake", g: "Sinnoh" }, { id: "fantina", name: "Fantina", g: "Sinnoh" }, { id: "byron", name: "Byron", g: "Sinnoh" },
    { id: "candice", name: "Candice", g: "Sinnoh" }, { id: "volkner", name: "Volkner", g: "Sinnoh" }, { id: "cynthia", name: "Cynthia", g: "Sinnoh" },

    { id: "cilan", name: "Cilan", g: "Unova" }, { id: "chili", name: "Chili", g: "Unova" }, { id: "cress", name: "Cress", g: "Unova" },
    { id: "lenora", name: "Lenora", g: "Unova" }, { id: "burgh", name: "Burgh", g: "Unova" }, { id: "elesa", name: "Elesa", g: "Unova" },
    { id: "clay", name: "Clay", g: "Unova" }, { id: "skyla", name: "Skyla", g: "Unova" }, { id: "brycen", name: "Brycen", g: "Unova" },
    { id: "drayden", name: "Drayden", g: "Unova" }, { id: "iris", name: "Iris", g: "Unova" }, { id: "alder", name: "Alder", g: "Unova" },

    { id: "lorelei", name: "Lorelei", g: "Elite Four", src: "lorelei-gen3" }, { id: "bruno", name: "Bruno", g: "Elite Four" },
    { id: "agatha", name: "Agatha", g: "Elite Four", src: "agatha-gen3" }, { id: "lance", name: "Lance", g: "Elite Four" },
    { id: "will", name: "Will", g: "Elite Four" }, { id: "karen", name: "Karen", g: "Elite Four" },
    { id: "sidney", name: "Sidney", g: "Elite Four" }, { id: "phoebe", name: "Phoebe", g: "Elite Four", src: "phoebe-gen3" },
    { id: "glacia", name: "Glacia", g: "Elite Four" }, { id: "drake", name: "Drake", g: "Elite Four", src: "drake-gen3" },
    { id: "aaron", name: "Aaron", g: "Elite Four" }, { id: "bertha", name: "Bertha", g: "Elite Four" },
    { id: "flint", name: "Flint", g: "Elite Four" }, { id: "lucian", name: "Lucian", g: "Elite Four" },
    { id: "shauntal", name: "Shauntal", g: "Elite Four" }, { id: "grimsley", name: "Grimsley", g: "Elite Four" },
    { id: "caitlin", name: "Caitlin", g: "Elite Four" }, { id: "marshal", name: "Marshal", g: "Elite Four" },
    { id: "anabel", name: "Anabel", g: "Elite Four" },

    { id: "oak", name: "Prof. Oak", g: "Professors" }, { id: "elm", name: "Prof. Elm", g: "Professors" },
    { id: "birch", name: "Prof. Birch", g: "Professors" }, { id: "rowan", name: "Prof. Rowan", g: "Professors" },
    { id: "juniper", name: "Prof. Juniper", g: "Professors" },

    { id: "giovanni", name: "Giovanni", g: "Villains" }, { id: "archie", name: "Archie", g: "Villains", src: "archie-gen3" },
    { id: "maxie", name: "Maxie", g: "Villains", src: "maxie-gen3" }, { id: "cyrus", name: "Cyrus", g: "Villains" },
    { id: "ghetsis", name: "Ghetsis", g: "Villains" }
  ];
  const BY = {};
  LIST.forEach(a => { BY[a.id] = a; });
  const DEFAULT = "red";

  function valid(id) { return typeof id === "string" && !!BY[id]; }
  function url(id) { return `assets/trainers/avatars/${valid(id) ? id : DEFAULT}.png`; }
  function label(id) { return (BY[valid(id) ? id : DEFAULT] || {}).name || "Trainer"; }
  function mine() {
    const st = (typeof loadState === "function") ? loadState() : {};
    return valid(st.trainerAvatar) ? st.trainerAvatar : DEFAULT;
  }
  /* <img> HTML（pixelated 全身像） */
  function img(id, cls) {
    return `<img class="trainer-avatar ${cls || ""}" src="${url(id)}" alt="${label(id)}" loading="lazy" draggable="false">`;
  }

  /* 存本地 + 推雲端（未跑 migration 就靜靜失敗，本地照用） */
  async function set(id) {
    if (!valid(id)) return false;
    const st = loadState();
    st.trainerAvatar = id;
    saveState();
    try { if (window.Sync && Sync.pushAvatar) await Sync.pushAvatar(id); } catch (e) { console.warn("[Avatar] push failed:", e && e.message); }
    try { document.dispatchEvent(new CustomEvent("trainer-avatar-changed", { detail: id })); } catch (e) {}
    return true;
  }

  /* 揀頭像：分組格仔，撳一下即揀 */
  function openPicker(onDone) {
    if (!window.App || !App.showModal) return;
    const cur = mine();
    const html = GROUPS.map(g => {
      const items = LIST.filter(a => a.g === g);
      if (!items.length) return "";
      return `<div class="avp-group"><div class="avp-gtitle">${g}</div><div class="avp-grid">${items.map(a =>
        `<button type="button" class="avp-item${a.id === cur ? " on" : ""}" data-av="${a.id}" title="${a.name}">
          ${img(a.id)}<span>${a.name}</span></button>`).join("")}</div></div>`;
    }).join("");
    App.showModal(`<div class="avp-box">
        <h3 class="avp-title">Choose Your Trainer</h3>
        <div class="avp-current">${img(cur, "avp-big")}<b id="avp-cur-name">${label(cur)}</b></div>
        <div class="avp-scroll">${html}</div>
        <div class="confirm-row"><button id="avp-close" class="btn-big btn-plain">Done</button></div>
      </div>`);
    const box = document.querySelector(".avp-box");
    box.addEventListener("click", Guard.asyncClick(async e => {
      const b = e.target.closest("[data-av]");
      if (!b) return;
      box.querySelectorAll(".avp-item.on").forEach(x => x.classList.remove("on"));
      b.classList.add("on");
      const id = b.dataset.av;
      /** @type {HTMLImageElement} */ (box.querySelector(".avp-big")).src = url(id);
      document.getElementById("avp-cur-name").textContent = label(id);
      await set(id);
    }, "avatar-pick"));
    document.getElementById("avp-close").onclick = () => { App.closeModal(); if (onDone) onDone(mine()); };
  }

  /* 好友／對手卡（名、頭像、戰績、對戰紀錄）；未登入或 RPC 未有就回 [] */
  async function fetchCards(uids) {
    const ids = (uids || []).filter(Boolean).slice(0, 60);
    if (!ids.length || !window.SupabaseAuth || !SupabaseAuth.currentUser || !SupabaseAuth.currentUser()) return [];
    try {
      /* RPC 回 { cards: [...] }（_rpc 會將 array 結果拆剩第一個，所以包一層 object） */
      const res = await SupabaseAuth._rpc("get_trainer_cards", { p_uids: ids });
      return res && Array.isArray(res.cards) ? res.cards : [];
    } catch (e) { console.warn("[Avatar] get_trainer_cards failed:", e && e.message); return []; }
  }

  return { LIST, GROUPS, DEFAULT, valid, url, label, mine, img, set, openPicker, fetchCards };
})();

if (typeof window !== "undefined") window.Avatars = Avatars;
if (typeof module !== "undefined" && module.exports) module.exports = Avatars;
