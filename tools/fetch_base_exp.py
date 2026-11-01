#!/usr/bin/env python3
"""由 PokéAPI 抽 1-649 每隻寵嘅 base_experience，寫落 pokemon-151.json / pokemon-gen{2..5}.json 嘅 baseExp 欄。
並發下載（16 線程），已經有 baseExp 嘅會 skip，可以中斷再跑。"""
import json, os, time, urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed

BASE = os.path.join(os.path.dirname(__file__), "..", "data")
FILES = ["pokemon-151.json"] + [f"pokemon-gen{g}.json" for g in range(2, 6)]


def fetch_one(dex_id):
    url = f"https://pokeapi.co/api/v2/pokemon/{dex_id}"
    for attempt in range(4):
        try:
            with urllib.request.urlopen(url, timeout=20) as r:
                return dex_id, json.load(r).get("base_experience")
        except Exception:
            time.sleep(1 + attempt)
    return dex_id, None


def main():
    docs, todo = {}, []
    for fn in FILES:
        p = os.path.join(BASE, fn)
        if not os.path.exists(p):
            continue
        with open(p, encoding="utf-8") as f:
            docs[p] = json.load(f)
        for dex_id, poke in docs[p]["pokemon"].items():
            if poke.get("baseExp") is None:
                todo.append(int(dex_id))
    print(f"missing: {len(todo)}", flush=True)
    t0, done, failed = time.time(), 0, []
    with ThreadPoolExecutor(max_workers=16) as ex:
        futs = {ex.submit(fetch_one, d): d for d in todo}
        for fut in as_completed(futs):
            dex_id, be = fut.result()
            done += 1
            if be is None:
                failed.append(dex_id)
            for p, doc in docs.items():
                poke = doc["pokemon"].get(str(dex_id))
                if poke is not None:
                    poke["baseExp"] = be if be is not None else 64
            if done % 100 == 0 or done == len(todo):
                print(f"[{done}/{len(todo)}] {(time.time()-t0):.0f}s", flush=True)
    for p, doc in docs.items():
        with open(p, "w", encoding="utf-8") as f:
            json.dump(doc, f, ensure_ascii=False, separators=(",", ":"))
    print("done; failed:", failed, flush=True)


if __name__ == "__main__":
    main()
