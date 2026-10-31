# -*- coding: utf-8 -*-
"""
fetch_pkmn_sprites.py — 對戰精靈動畫圖管道（一次性離線腳本）

下載 PokeRogue（beta branch）素材：
  - images/pokemon/<dex>.{png,json}        front atlas（正面）
  - images/pokemon/back/<dex>.{png,json}   back atlas（背面）
並將 atlas 原圖寫入 assets/battle/pkmn/{front,back}/<dex>.png，
同時擴充 assets/battle/pkmn/index.json：
  {w, h, n, f: [[sx, sy, sw, sh, dx, dy], ...]}
  f 逐 frame 記錄「atlas 裁切框 + 未裁切精靈內嘅偏移」，順序 = 檔名 0001..NNNN。

要注意：
  - front/back atlas 都係 TexturePacker 輸出，有兩種格式：{textures:[{frames}]} 或 {frames}。
  - 部分精靈（201 Unown、412 Burmy、487 Giratina…）主目錄冇 <dex>.png，只存 form 名
    （例如 201-a.png），所以 FORM 表用嚟 fallback 揀預設形態。

可中斷重跑：已存在嘅 PNG 會 skip；index.json 會逐條覆寫。
用法：python tools/fetch_pkmn_sprites.py [--from 152] [--to 649]
"""
import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = "https://raw.githubusercontent.com/pagefaultgames/pokerogue-assets/beta/images/pokemon/"
BASE = os.path.join(ROOT, "assets", "battle", "pkmn")
CACHE = os.path.join(ROOT, "tools", ".cache_pkmn")
SIDES = {"front": "", "back": "back/"}
UA = {"User-Agent": "PokeEngmon-pkmn-sprites/1.0 (edu fan project)"}

# 預設形態 fallback（主目錄用 form 檔名嘅精靈）
FORM = {
    201: "a", 412: "plant", 413: "plant", 421: "overcast", 422: "west", 423: "west",
    487: "altered", 492: "land", 493: "normal", 550: "red-striped", 585: "spring",
    586: "spring", 641: "incarnate", 642: "incarnate", 645: "incarnate",
    647: "ordinary", 648: "aria",
}


def fetch(url, dest, tries=3):
    if os.path.exists(dest) and os.path.getsize(dest) > 0:
        return "skip"
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=30) as r:
                data = r.read()
            if data:
                with open(dest, "wb") as fh:
                    fh.write(data)
                return "ok"
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return "404"
        except Exception:  # noqa: BLE001
            pass
        time.sleep(1 + i * 2)
    return "fail"


def frames_of(j):
    return j["textures"][0]["frames"] if "textures" in j else j["frames"]


def build_entry(jpath):
    with open(jpath, encoding="utf-8") as fh:
        j = json.load(fh)
    frames = frames_of(j)
    ordered = sorted(frames, key=lambda x: int(os.path.splitext(x["filename"])[0]))
    f = []
    for fr in ordered:
        s = fr["spriteSourceSize"]
        box = fr["frame"]
        f.append([box["x"], box["y"], box["w"], box["h"], s["x"], s["y"]])
    w = max(fr["sourceSize"]["w"] for fr in frames)
    h = max(fr["sourceSize"]["h"] for fr in frames)
    return {"w": w, "h": h, "n": len(f), "f": f}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--from", dest="start", type=int, default=152)
    ap.add_argument("--to", dest="end", type=int, default=649)
    args = ap.parse_args()
    os.makedirs(CACHE, exist_ok=True)

    jobs = []
    for dex in range(args.start, args.end + 1):
        name = f"{dex}-{FORM[dex]}" if dex in FORM else str(dex)
        for side, prefix in SIDES.items():
            jobs.append((RAW + prefix + name + ".json", os.path.join(CACHE, f"{side}-{dex}.json")))
            jobs.append((RAW + prefix + name + ".png", os.path.join(CACHE, f"{side}-{dex}.png")))
    with ThreadPoolExecutor(max_workers=12) as ex:
        list(ex.map(lambda a: fetch(a[0], a[1]), jobs))

    index_path = os.path.join(BASE, "index.json")
    with open(index_path, encoding="utf-8") as fh:
        index = json.load(fh)
    index.setdefault("front", {})
    index.setdefault("back", {})

    written, missing = 0, []
    for dex in range(args.start, args.end + 1):
        for side in SIDES:
            jp = os.path.join(CACHE, f"{side}-{dex}.json")
            pp = os.path.join(CACHE, f"{side}-{dex}.png")
            if not (os.path.exists(jp) and os.path.exists(pp) and os.path.getsize(pp) > 0):
                missing.append(f"{side}/{dex}: no file")
                continue
            try:
                entry = build_entry(jp)
            except Exception as e:  # noqa: BLE001
                missing.append(f"{side}/{dex}: {e}")
                continue
            with open(pp, "rb") as src, open(os.path.join(BASE, side, f"{dex}.png"), "wb") as out:
                out.write(src.read())
            index[side][str(dex)] = entry
            written += 1

    with open(index_path, "w", encoding="utf-8") as fh:
        json.dump(index, fh, separators=(",", ":"))
    print(f"written {written} | index front {len(index['front'])} back {len(index['back'])}")
    if missing:
        print(f"missing {len(missing)}:", file=sys.stderr)
        for m in missing:
            print("  " + m, file=sys.stderr)


if __name__ == "__main__":
    main()
