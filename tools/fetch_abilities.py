# -*- coding: utf-8 -*-
"""
fetch_abilities.py — 精靈特性資料管道（一次性離線腳本）

由 PokeAPI api-data（GitHub raw，免 rate limit）抽取每隻精靈嘅
非隱藏特性（slot 順序），輸出 data/abilities.json：
  { "25": ["static"], "94": ["levitate"], ... }

battle engine 用 slot 1 做預設特性（見 js/pokemon.js abilityOf）。
可中斷重跑：輸出係一次過寫，中斷重跑會覆寫。
用法：python tools/fetch_abilities.py
"""
import json
import os
import time
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
URL = "https://raw.githubusercontent.com/PokeAPI/api-data/master/data/api/v2/pokemon/{id}/index.json"
OUT = os.path.join(ROOT, "data", "abilities.json")
UA = {"User-Agent": "PokeEngmon-abilities/1.0 (edu fan project)"}
DELAY = 0.08


def fetch(dex_id):
    req = urllib.request.Request(URL.format(id=dex_id), headers=UA)
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read().decode("utf-8"))


def main():
    abilities = {}
    missing = []
    for dex_id in range(1, 650):
        try:
            doc = fetch(dex_id)
            slots = [a for a in doc.get("abilities", []) if not a.get("is_hidden")]
            slots.sort(key=lambda a: a.get("slot", 99))
            abilities[str(dex_id)] = [a["ability"]["name"] for a in slots]
            if not abilities[str(dex_id)]:
                missing.append(dex_id)
        except Exception as e:
            missing.append(dex_id)
            print(f"  !! dex {dex_id}: {e}")
        if dex_id % 100 == 0:
            print(f"  ... {dex_id}/649")
        time.sleep(DELAY)

    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(abilities, f, ensure_ascii=False, indent=0)
    print(f"written {OUT}: {len(abilities)} entries, "
          f"{os.path.getsize(OUT)} bytes")
    if missing:
        print("missing/no-ability:", missing)


if __name__ == "__main__":
    main()
