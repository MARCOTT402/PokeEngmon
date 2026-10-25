# -*- coding: utf-8 -*-
"""
fetch_gen_data.py — Gen 2-5 資料管道（一次性離線腳本）

由 PokeAPI 抓取 Gen 1-5（#1-649）嘅 species / pokemon / evolution-chain / move 資料，
按「跨代進化鏈截斷政策」建鏈，輸出：
  - js/gens-data.js            （GENS 陣列 + Gen 2-5 鏈定義，開 app 即載）
  - data/pokemon-gen{2..5}.json（shape 同 data/pokemon-151.json 完全一致）
  - data/moves.json            （補齊 Gen 2-5 learnset 用到嘅招式）
  - data/growth extra: erratic / fluctuating 表補入各 gen json

可中斷重跑：所有 API 回應 cache 喺 tools/.cache_pokeapi/，重跑唔會重新下載。
用法：python tools/fetch_gen_data.py
"""
import json
import os
import re
import sys
import time
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE_DIR = os.path.join(ROOT, "tools", ".cache_pokeapi")
API = "https://pokeapi.co/api/v2"
DELAY = 0.12  # 每個 request 之間嘅 delay（秒）

# ---- 世代範圍 ----
GEN_RANGES = {1: (1, 151), 2: (152, 251), 3: (252, 386), 4: (387, 493), 5: (494, 649)}
GEN_NAMES = {1: "Kanto", 2: "Johto", 3: "Hoenn", 4: "Sinnoh", 5: "Unova"}
GEN_ICONS = {1: 150, 2: 250, 3: 383, 4: 483, 5: 643}  # 封面傳說

# ---- Rarity 閾值（Gen 2-5；Gen 1 維持 data.js 手調不變）----
EPIC_BST = 600
RARE_BST = 500

# learnset 版本組優先次序（舊代寶可夢喺新遊戲可能冇資料，逐個 fallback）
VERSION_GROUP_PREF = [
    "scarlet-violet", "sword-shield",
    "lets-go-pikachu-lets-go-eevee",
    "ultra-sun-ultra-moon", "sun-moon",
    "omega-ruby-alpha-sapphire", "x-y",
    "black-2-white-2", "black-white",
    "heartgold-soulsilver", "platinum", "diamond-pearl",
    "emerald", "firered-leafgreen", "ruby-sapphire",
    "crystal", "gold-silver", "yellow", "red-blue",
]

UA = {"User-Agent": "PokeEngmon-gen-fetch/1.0 (edu fan project)"}


def gen_of(dex_id):
    for g, (lo, hi) in GEN_RANGES.items():
        if lo <= dex_id <= hi:
            return g
    return None


def cache_path(kind, key):
    d = os.path.join(CACHE_DIR, kind)
    os.makedirs(d, exist_ok=True)
    return os.path.join(d, f"{key}.json")


def fetch_json(url, kind, key):
    """帶 cache 嘅 JSON 抓取；404 記低做 None（唔重試）。"""
    p = cache_path(kind, key)
    if os.path.exists(p):
        with open(p, "r", encoding="utf-8") as f:
            return json.load(f)
    req = urllib.request.Request(url, headers=UA)
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            data = json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        if e.code == 404:
            data = None
        else:
            raise
    with open(p, "w", encoding="utf-8") as f:
        json.dump(data, f)
    time.sleep(DELAY)
    return data


def get_species(dex_id):
    return fetch_json(f"{API}/pokemon-species/{dex_id}", "species", dex_id)


def get_pokemon(dex_id):
    return fetch_json(f"{API}/pokemon/{dex_id}", "pokemon", dex_id)


def get_evo_chain(chain_id):
    return fetch_json(f"{API}/evolution-chain/{chain_id}", "evo", chain_id)


def get_move(slug):
    return fetch_json(f"{API}/move/{slug}", "move", slug)


def get_growth_rate(name):
    return fetch_json(f"{API}/growth-rate/{name}", "growth", name)


def en_name(species_json, fallback):
    for n in species_json.get("names", []):
        if n["language"]["name"] == "en":
            return n["name"]
    return fallback


def chain_key_of(slug):
    """由 species slug 生成鏈 key：全小寫淨字母（同 Gen 1 風格一致，如 mrmime）。"""
    return re.sub(r"[^a-z]", "", slug.lower())


def extract_learnset(poke_json):
    """抽 level-up 招式，按版本組優先次序，回傳 (learnset, versionGroup)。"""
    moves = poke_json.get("moves", [])
    by_vg = {}
    for m in moves:
        for vgd in m["version_group_details"]:
            if vgd["move_learn_method"]["name"] != "level-up":
                continue
            vg = vgd["version_group"]["name"]
            by_vg.setdefault(vg, []).append({
                "level": vgd["level_learned_at"],
                "move": m["move"]["name"],
            })
    for vg in VERSION_GROUP_PREF:
        if vg in by_vg:
            ls = by_vg[vg]
            # 同級同招去重 + 排序（等級 → 招式名）
            seen = set()
            uniq = []
            for e in sorted(ls, key=lambda e: (e["level"], e["move"])):
                k = (e["level"], e["move"])
                if k not in seen:
                    seen.add(k)
                    uniq.append(e)
            return uniq, vg
    return [], None


def walk_chain(node, edges):
    """由 evolution-chain JSON 建 parent->child 圖（含觸發資料）。"""
    sp = node["species"]
    dex_id = int(sp["url"].rstrip("/").split("/")[-1])
    for child in node.get("evolves_to", []):
        child_id = int(child["species"]["url"].rstrip("/").split("/")[-1])
        det = child["evolution_details"][0] if child.get("evolution_details") else {}
        edges.append((dex_id, child_id, {
            "minLevel": det.get("min_level"),
            "trigger": det.get("trigger", {}).get("name"),
            "item": det.get("item", {}).get("name") if det.get("item") else None,
        }))
        walk_chain(child, edges)


def build_chains(all_species, all_pokemon):
    """按截斷政策建 Gen 2-5 鏈，回傳 chains list（data.js EVOLUTION_CHAINS 格式 + gen 欄）。"""
    # 1. 收集全部 evolution chain id
    chain_ids = set()
    for dex_id in range(1, 650):
        sp = all_species[dex_id]
        url = sp.get("evolution_chain", {}).get("url")
        if url:
            chain_ids.add(int(url.rstrip("/").split("/")[-1]))
    print(f"[chains] {len(chain_ids)} evolution chains")

    # 2. 建全量 edge 圖
    edges = []  # (parent_id, child_id, det)
    for cid in sorted(chain_ids):
        cj = get_evo_chain(cid)
        if cj:
            walk_chain(cj["chain"], edges)

    # 3. 截斷：cut 晒所有跨代 edge
    children = {}   # parent -> [(child, det)]（只限同代）
    has_parent = {}  # child -> parent（只限同代）
    for p, c, det in edges:
        if p > 649 or c > 649:
            continue
        if gen_of(p) != gen_of(c):
            continue
        children.setdefault(p, []).append((c, det))
        has_parent[c] = p

    # 4. 每個冇 in-gen parent 嘅節點做 root，向前展開成鏈
    chains = []
    visited_roots = set()
    for dex_id in range(152, 650):
        if dex_id in has_parent or dex_id in visited_roots:
            continue
        # 搵 root：呢個 node 冇同代 parent，就係一個 component 嘅 root
        # （單節點鏈都會喺度被執起）
        g = gen_of(dex_id)
        # 收集 component：BFS 沿同代 children
        comp = []
        stack = [dex_id]
        seen = set()
        while stack:
            n = stack.pop()
            if n in seen:
                continue
            seen.add(n)
            comp.append(n)
            for c, _ in children.get(n, []):
                stack.append(c)
        comp.sort()
        visited_roots.update(comp)

        # 線性段：由 root 行到第一個分叉或終點
        stages = [dex_id]
        cur = dex_id
        branch_kids = None
        while True:
            kids = children.get(cur, [])
            if len(kids) == 0:
                cur = None
                break
            if len(kids) > 1:
                branch_kids = kids
                break
            nxt = kids[0][0]
            stages.append(nxt)
            cur = nxt

        root_slug = all_species[dex_id]["name"]
        key = chain_key_of(root_slug)
        stage_entries = [[s, en_name(all_species[s], all_species[s]["name"])] for s in stages]
        chain = {"key": key, "gen": g, "stages": stage_entries}

        if branch_kids:
            branches = []
            for kid, _det in branch_kids:
                br = [kid]
                c2 = kid
                while True:
                    k2 = children.get(c2, [])
                    if len(k2) != 1:
                        break
                    c2 = k2[0][0]
                    br.append(c2)
                branches.append([[b, en_name(all_species[b], all_species[b]["name"])] for b in br])
            chain["branches"] = branches

        # 5. rarity 判定
        species_in_chain = list(comp)
        is_legend = any(
            all_species[s].get("is_legendary") or all_species[s].get("is_mythical")
            for s in species_in_chain
        )
        if is_legend:
            rarity = "legend"
        else:
            # 最終階段 BST：鏈內所有「冇同代仔女」嘅節點
            finals = [s for s in species_in_chain if not children.get(s)]
            bst = 0
            for s in finals:
                pj = all_pokemon.get(s)
                if pj:
                    bst = max(bst, sum(st["base_stat"] for st in pj["stats"]))
            if bst >= EPIC_BST:
                rarity = "epic"
            elif bst >= RARE_BST:
                rarity = "rare"
            else:
                rarity = "normal"
        chain["baseRarity"] = rarity
        chains.append(chain)

    return chains


def main():
    print("=== PokeEngmon Gen 2-5 資料管道 ===")
    print(f"[1/6] 讀取現有 data/pokemon-151.json / moves.json")
    with open(os.path.join(ROOT, "data", "pokemon-151.json"), encoding="utf-8") as f:
        gen1 = json.load(f)
    with open(os.path.join(ROOT, "data", "moves.json"), encoding="utf-8") as f:
        moves_doc = json.load(f)
    moves = moves_doc["moves"]

    print(f"[2/6] 抓取 species + pokemon（1-649，有 cache 會 skip）")
    all_species, all_pokemon = {}, {}
    for dex_id in range(1, 650):
        sp = get_species(dex_id)
        if not sp:
            print(f"  !! species {dex_id} 404，skip")
            continue
        all_species[dex_id] = sp
        pj = get_pokemon(dex_id)
        if pj:
            all_pokemon[dex_id] = pj
        if dex_id % 50 == 0:
            print(f"  ... {dex_id}/649")

    print("[3/6] 建鏈（跨代截斷政策）")
    chains = build_chains(all_species, all_pokemon)
    print(f"  Gen 2-5 共 {len(chains)} 條鏈")
    from collections import Counter
    print("  各代數量:", dict(Counter(c["gen"] for c in chains)))
    print("  稀有度分佈:", dict(Counter(c["baseRarity"] for c in chains)))

    print("[4/6] 補齊 growth-rate 表（erratic / fluctuating）")
    growth_tables = dict(gen1["growthRates"])
    for gr in ("slow-then-very-fast", "fast-then-very-slow"):
        if gr not in growth_tables:
            gj = get_growth_rate(gr)
            growth_tables[gr] = [lv["experience"] for lv in gj["levels"]]
    natures = gen1["natures"]

    print("[5/6] 生成各代 pokemon-gen{N}.json + 收集招式需求")
    # 同代 edge det 圖（evolvesTo 用）
    # 重建一次（同 build_chains 邏輯一致）
    chain_ids = set()
    for dex_id in range(1, 650):
        sp = all_species.get(dex_id)
        if sp and sp.get("evolution_chain", {}).get("url"):
            chain_ids.add(int(sp["evolution_chain"]["url"].rstrip("/").split("/")[-1]))
    edges = []
    for cid in sorted(chain_ids):
        cj = get_evo_chain(cid)
        if cj:
            walk_chain(cj["chain"], edges)
    evo_map = {}
    for p, c, det in edges:
        if p <= 649 and c <= 649 and gen_of(p) == gen_of(c):
            evo_map.setdefault(p, []).append({"id": c, **det})

    needed_moves = set()
    out_files = []
    for g in range(2, 6):
        lo, hi = GEN_RANGES[g]
        pokemon = {}
        for dex_id in range(lo, hi + 1):
            sp = all_species.get(dex_id)
            pj = all_pokemon.get(dex_id)
            if not sp or not pj:
                print(f"  !! #{dex_id} 缺資料，skip")
                continue
            ls, vg = extract_learnset(pj)
            for e in ls:
                needed_moves.add(e["move"])
            stats = {s["stat"]["name"]: s["base_stat"] for s in pj["stats"]}
            pokemon[str(dex_id)] = {
                "id": dex_id,
                "name": en_name(sp, sp["name"]),
                "names": {"en": en_name(sp, sp["name"])},
                "types": [t["type"]["name"] for t in sorted(pj["types"], key=lambda t: t["slot"])],
                "baseStats": {
                    "hp": stats.get("hp"), "atk": stats.get("attack"),
                    "def": stats.get("defense"), "spa": stats.get("special-attack"),
                    "spd": stats.get("special-defense"), "spe": stats.get("speed"),
                },
                "growthRate": sp["growth_rate"]["name"],
                "learnset": ls,
                "evolvesTo": evo_map.get(dex_id, []),
                "versionGroup": vg,
            }
        doc = {
            "source": gen1["source"],
            "generatedAt": time.strftime("%Y-%m-%d"),
            "levelRange": gen1["levelRange"],
            "growthRates": growth_tables,
            "natures": natures,
            "pokemon": pokemon,
        }
        out = os.path.join(ROOT, "data", f"pokemon-gen{g}.json")
        with open(out, "w", encoding="utf-8") as f:
            json.dump(doc, f, ensure_ascii=False, separators=(",", ":"))
        out_files.append(out)
        print(f"  -> {out} ({len(pokemon)} 隻)")

    print(f"[6/6] 補齊 moves.json（現有 {len(moves)}，需要 {len(needed_moves)}）")
    missing = sorted(needed_moves - set(moves.keys()))
    print(f"  缺失 {len(missing)} 招，開始抓取")
    for i, slug in enumerate(missing):
        mj = get_move(slug)
        if not mj:
            print(f"  !! move {slug} 404，skip")
            continue
        desc = ""
        for ef in mj.get("effect_entries", []):
            if ef["language"]["name"] == "en":
                desc = ef["short_effect"].replace("$effect_chance", str(mj.get("effect_chance") or ""))
                break
        # 對齊現有 moves.json 欄位
        name_en = slug
        for n in mj.get("names", []):
            if n["language"]["name"] == "en":
                name_en = n["name"]
                break
        moves[slug] = {
            "name": name_en,
            "power": mj.get("power"),
            "accuracy": mj.get("accuracy"),
            "pp": mj.get("pp"),
            "priority": mj.get("priority", 0),
            "type": mj["type"]["name"],
            "damage_class": mj["damage_class"]["name"],
            "target": mj.get("target", {}).get("name", "selected-pokemon"),
            "effect_chance": mj.get("effect_chance"),
            "desc": desc,
        }
        if (i + 1) % 50 == 0:
            print(f"  ... {i+1}/{len(missing)}")
    with open(os.path.join(ROOT, "data", "moves.json"), "w", encoding="utf-8") as f:
        json.dump(moves_doc, f, ensure_ascii=False, separators=(",", ":"))
    print(f"  moves.json 而家有 {len(moves)} 招")

    # 輸出 js/gens-data.js
    gens_meta = [{
        "gen": g, "name": GEN_NAMES[g], "range": list(GEN_RANGES[g]),
        "iconDex": GEN_ICONS[g],
        "dataFile": "data/pokemon-151.json" if g == 1 else f"data/pokemon-gen{g}.json",
    } for g in range(1, 6)]
    js = (
        "/* ============================================================\n"
        "   PokeEngmon - 世代資料（Gen 1-5）\n"
        "   由 tools/fetch_gen_data.py 自動生成，請勿手改。\n"
        "   GENS: 世代元資料；EVOLUTION_CHAINS_G25: Gen 2-5 進化鏈\n"
        "   ============================================================ */\n\n"
        f"const GENS = {json.dumps(gens_meta, ensure_ascii=False, indent=2)};\n\n"
        f"const EVOLUTION_CHAINS_G25 = {json.dumps(chains, ensure_ascii=False, indent=2)};\n"
    )
    out = os.path.join(ROOT, "js", "gens-data.js")
    with open(out, "w", encoding="utf-8") as f:
        f.write(js)
    print(f"-> {out}")
    print("=== 完成 ===")


if __name__ == "__main__":
    main()
