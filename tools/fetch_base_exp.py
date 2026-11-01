#!/usr/bin/env python3
"""由 PokeAPI 官方 CSV（GitHub raw）抽 1-649 每隻寵嘅 base_experience，
寫落 pokemon-151.json / pokemon-gen{2..5}.json 嘅 baseExp 欄。
pokeapi.co 對本機 403，所以改用 raw.githubusercontent.com 嘅 data/v2/csv/pokemon.csv。"""
import csv, io, json, os, urllib.request

BASE = os.path.join(os.path.dirname(__file__), "..", "data")
FILES = ["pokemon-151.json"] + [f"pokemon-gen{g}.json" for g in range(2, 6)]
CSV_URL = "https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv/pokemon.csv"


def main():
    raw = urllib.request.urlopen(CSV_URL, timeout=30).read().decode("utf-8")
    rows = list(csv.DictReader(io.StringIO(raw)))
    base = {}
    for r in rows:
        try:
            pid = int(r["id"])
        except (KeyError, ValueError):
            continue
        if 1 <= pid <= 649 and r["is_default"] == "1":
            try:
                base[pid] = int(r["base_experience"])
            except (TypeError, ValueError):
                pass
    print(f"CSV rows: {len(rows)}, mapped 1-649 default forms: {len(base)}")

    total, filled = 0, 0
    for fn in FILES:
        p = os.path.join(BASE, fn)
        if not os.path.exists(p):
            continue
        with open(p, encoding="utf-8") as f:
            doc = json.load(f)
        for dex_id, poke in doc["pokemon"].items():
            total += 1
            be = base.get(int(dex_id))
            if be is not None:
                poke["baseExp"] = be
                filled += 1
        with open(p, "w", encoding="utf-8") as f:
            json.dump(doc, f, ensure_ascii=False, separators=(",", ":"))
        print(f"  wrote {fn}")
    print(f"baseExp filled: {filled}/{total}")


if __name__ == "__main__":
    main()
