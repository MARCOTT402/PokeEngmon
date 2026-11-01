#!/usr/bin/env python3
"""由 PokéAPI 抽 1-649 每隻寵嘅 base_experience，寫落 pokemon-151.json / pokemon-gen{2..5}.json 嘅 baseExp 欄。
逐隻一個 request（約 11 分鐘）；已經有 baseExp 嘅會 skip，可以中斷再跑。"""
import json, os, sys, time, urllib.request

BASE = os.path.join(os.path.dirname(__file__), "..", "data")
FILES = ["pokemon-151.json"] + [f"pokemon-gen{g}.json" for g in range(2, 6)]

def main():
    docs = {}
    todo = []
    for fn in FILES:
        p = os.path.join(BASE, fn)
        if not os.path.exists(p):
            continue
        with open(p, encoding="utf-8") as f:
            docs[p] = json.load(f)
        for dex_id, poke in docs[p]["pokemon"].items():
            if poke.get("baseExp") is None:
                todo.append((int(dex_id), p))
    print(f"total missing: {len(todo)}")
    t0 = time.time()
    for i, (dex_id, p) in enumerate(todo):
        url = f"https://pokeapi.co/api/v2/pokemon/{dex_id}"
        for attempt in range(4):
            try:
                with urllib.request.urlopen(url, timeout=30) as r:
                    be = json.load(r).get("base_experience")
                docs[p]["pokemon"][str(dex_id)]["baseExp"] = be if be is not None else 100
                break
            except Exception as e:
                print(f"  retry {dex_id} ({e})", flush=True)
                time.sleep(2 * (attempt + 1))
        else:
            print(f"  FAILED {dex_id}", flush=True)
            continue
        if (i + 1) % 50 == 0 or i + 1 == len(todo):
            el = time.time() - t0
            print(f"[{i+1}/{len(todo)}] {el/60:.1f} min elapsed, saving...", flush=True)
            for path, doc in docs.items():
                with open(path, "w", encoding="utf-8") as f:
                    json.dump(doc, f, ensure_ascii=False, separators=(",", ":"))
        time.sleep(0.5)
    for path, doc in docs.items():
        with open(path, "w", encoding="utf-8") as f:
            json.dump(doc, f, ensure_ascii=False, separators=(",", ":"))
    print("done")

if __name__ == "__main__":
    main()
