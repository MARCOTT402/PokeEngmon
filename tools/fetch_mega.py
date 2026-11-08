"""背包第 4c 段：由 PokéAPI 抽 Gen 1–5 物種嘅 Mega 進化資料 → data/mega.json

用法：python tools/fetch_mega.py
- 由 PokéAPI pokemon 清單搵晒 "*-mega*" 形態（包括 X／Y／Z 同 Legends Z-A 新 Mega）
- 每個形態配返 item-category mega-stones 入面嘅 Mega 石（同後綴 x／y／z + 名稱最長共同前綴）
- 只保留物種圖鑑號 ≤ 649（Gen 1–5）；冇 Mega 石嘅（Rayquaza 靠 Dragon Ascent）唔包
- 每個形態：formId（PokéAPI pokemon id，俾 sprite 用）、base dexId、types、baseStats、ability
"""
import json, re, sys, urllib.request

API = "https://pokeapi.co/api/v2"
STAT = {"hp": "hp", "attack": "atk", "defense": "def", "special-attack": "spa", "special-defense": "spd", "speed": "spe"}


def get(url):
    req = urllib.request.Request(url if url.startswith("http") else API + url, headers={"User-Agent": "PokeEngmon-data-script"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read().decode("utf-8"))


def common_prefix(a, b):
    n = 0
    while n < min(len(a), len(b)) and a[n] == b[n]:
        n += 1
    return n


def main():
    stones = [i["name"] for i in get("/item-category/mega-stones")["items"]]
    forms = [p for p in get("/pokemon?limit=3000")["results"] if re.search(r"-mega(-[xyz])?$", p["name"])]
    out = {}
    for f in sorted(forms, key=lambda p: p["name"]):
        pk = get(f["url"])
        dex = int(pk["species"]["url"].rstrip("/").split("/")[-1])
        if dex > 649:
            continue
        sp = pk["species"]["name"]
        sfx = re.search(r"-mega-([xyz])$", pk["name"])
        sfx = sfx.group(1) if sfx else None
        cands = [s for s in stones if (re.search(r"-([xyz])$", s).group(1) if re.search(r"-([xyz])$", s) else None) == sfx]
        scored = sorted(((common_prefix(sp.replace("-", ""), re.sub(r"-[xyz]$", "", s)), s) for s in cands), reverse=True)
        if not scored or scored[0][0] < 4 or (len(scored) > 1 and scored[1][0] == scored[0][0]):
            print("skip (no stone):", pk["name"], scored[:2], file=sys.stderr)
            continue
        stone = scored[0][1]
        item = get(f"/item/{stone}")
        out[stone] = {
            "stone": stone,
            "stoneName": next((n["name"] for n in item["names"] if n["language"]["name"] == "en"), stone),
            "dexId": dex,
            "species": sp,
            "formId": pk["id"],
            "form": pk["name"],
            "formName": "Mega " + sp.replace("-", " ").title() + (f" {sfx.upper()}" if sfx else ""),
            # 對戰精靈（PokeRogue atlas，tools/fetch_pkmn_sprites.py --mega 下載）：<dex>-mega[-x|-y|-z]
            "spriteKey": f"{dex}-mega" + (f"-{sfx}" if sfx else ""),
            "types": [t["type"]["name"] for t in sorted(pk["types"], key=lambda t: t["slot"])],
            "baseStats": {STAT[s["stat"]["name"]]: s["base_stat"] for s in pk["stats"]},
            # Legends Z-A 新 Mega 喺 PokéAPI 未必有特性 → 用返原本物種第一特性（abilityGuess 標記）
            "ability": pk["abilities"][0]["ability"]["name"] if pk["abilities"] else get(f"/pokemon/{dex}")["abilities"][0]["ability"]["name"],
        }
        if not pk["abilities"]:
            out[stone]["abilityGuess"] = True
        print(stone, "->", pk["name"], dex, file=sys.stderr)
    # 直接出 JS（同步載入；node 測試同 battle engine 都用得），唔使 fetch
    body = ",\n".join(f"  {json.dumps(k)}: {json.dumps(v, ensure_ascii=False)}" for k, v in sorted(out.items(), key=lambda x: (x[1]["dexId"], x[0])))
    with open("js/mega-data.js", "w", encoding="utf-8", newline="\n") as fh:
        fh.write("/* 自動產生：python tools/fetch_mega.py（PokéAPI *-mega 形態 + mega-stones）。唔好手改。\n"
                 "   背包第 4c 段：Gen 1–5 物種嘅 Mega 進化（包括 Legends Z-A 新 Mega）；key = Mega 石 slug */\n"
                 "const MEGA_STONES = {\n" + body + "\n};\n"
                 "/* ES module 過渡期（總計劃 P2.3；Rule 119）：index.html 用 type=\"module\" 載入，頂層名唔會自動變全域 → 明確掛上 globalThis，classic script 照用 */\n"
                 "Object.assign(globalThis, { MEGA_STONES });\n"
                 "if (typeof module !== \"undefined\" && module.exports) module.exports = MEGA_STONES;\n")
    print(len(out), "mega forms written", file=sys.stderr)


if __name__ == "__main__":
    main()
