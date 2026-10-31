# -*- coding: utf-8 -*-
"""
fetch_gen_assets.py — Gen 2-5 素材管道（一次性離線腳本）

下載：
  - assets/animated/{152..649}.gif   PokeAPI black-white animated GIF（同 Gen 1 同源）
  - assets/cries/{152..649}.mp3      PokeAPI OGG + ffmpeg 轉 MP3（iOS 唔支援 OGG）
  - assets/gen-icons/{1..5}.png      各代封面傳說 official artwork
  - assets/gen-packs/gen{2..5}.json  每代素材 manifest（路徑 + byte size，下載管理器用）

可中斷重跑：已存在嘅檔案會 skip。
用法：python tools/fetch_gen_assets.py
"""
import json
import os
import shutil
import subprocess
import sys
import time
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DELAY = 0.12

GIF_URL = "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions/generation-v/black-white/animated/{id}.gif"
CRY_URL = "https://raw.githubusercontent.com/PokeAPI/cries/main/cries/pokemon/latest/{id}.ogg"
ICON_URL = "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/{id}.png"

GEN_RANGES = {1: (1, 151), 2: (152, 251), 3: (252, 386), 4: (387, 493), 5: (494, 649)}
GEN_ICONS = {1: 150, 2: 250, 3: 383, 4: 483, 5: 643}

UA = {"User-Agent": "PokeEngmon-gen-assets/1.0 (edu fan project)"}

ANIM_DIR = os.path.join(ROOT, "assets", "animated")
CRY_DIR = os.path.join(ROOT, "assets", "cries")
ICON_DIR = os.path.join(ROOT, "assets", "gen-icons")
PACK_DIR = os.path.join(ROOT, "assets", "gen-packs")
TMP_DIR = os.path.join(ROOT, "tools", ".cache_ogg")


def find_ffmpeg():
    """優先 PATH；否則搵 winget 安裝位置。"""
    exe = shutil.which("ffmpeg")
    if exe:
        return exe
    base = os.path.join(os.environ.get("LOCALAPPDATA", ""), "Microsoft", "WinGet", "Packages")
    for dirpath, _dirs, files in os.walk(base):
        if "ffmpeg.exe" in files:
            return os.path.join(dirpath, "ffmpeg.exe")
    return None


def download(url, dest, binary=True):
    if os.path.exists(dest) and os.path.getsize(dest) > 0:
        return "skip"
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    req = urllib.request.Request(url, headers=UA)
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            data = r.read()
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return "404"
        raise
    with open(dest, "wb") as f:
        f.write(data)
    time.sleep(DELAY)
    return "ok"


def main():
    ffmpeg = find_ffmpeg()
    if not ffmpeg:
        print("!! 搵唔到 ffmpeg。請先執行：winget install Gyan.FFmpeg")
        sys.exit(1)
    print(f"ffmpeg: {ffmpeg}")

    missing_gifs, missing_cries = [], []

    print("[1/4] 下載動態 GIF（152-649）")
    ok = skipped = 0
    for dex_id in range(152, 650):
        dest = os.path.join(ANIM_DIR, f"{dex_id}.gif")
        r = download(GIF_URL.format(id=dex_id), dest)
        if r == "ok":
            ok += 1
        elif r == "skip":
            skipped += 1
        else:
            missing_gifs.append(dex_id)
        if dex_id % 50 == 0:
            print(f"  ... {dex_id}/649 (ok={ok} skip={skipped})")
    print(f"  GIF done: ok={ok} skip={skipped} missing={len(missing_gifs)}")

    print("[2/4] 下載 + 轉檔叫聲（152-649）")
    os.makedirs(TMP_DIR, exist_ok=True)
    ok = skipped = 0
    for dex_id in range(152, 650):
        mp3 = os.path.join(CRY_DIR, f"{dex_id}.mp3")
        if os.path.exists(mp3) and os.path.getsize(mp3) > 0:
            skipped += 1
            continue
        ogg = os.path.join(TMP_DIR, f"{dex_id}.ogg")
        r = download(CRY_URL.format(id=dex_id), ogg)
        if r == "404":
            missing_cries.append(dex_id)
            continue
        os.makedirs(CRY_DIR, exist_ok=True)
        res = subprocess.run(
            [ffmpeg, "-y", "-loglevel", "error", "-i", ogg, "-codec:a", "libmp3lame", "-q:a", "4", mp3],
            capture_output=True,
        )
        if res.returncode == 0 and os.path.exists(mp3) and os.path.getsize(mp3) > 0:
            ok += 1
            os.remove(ogg)
        else:
            missing_cries.append(dex_id)
            print(f"  !! cry {dex_id} 轉檔失敗: {res.stderr.decode('utf-8', 'ignore')[:200]}")
        if dex_id % 50 == 0:
            print(f"  ... {dex_id}/649 (ok={ok} skip={skipped})")
    print(f"  cries done: ok={ok} skip={skipped} missing={len(missing_cries)}")

    print("[3/4] 下載世代圖示（封面傳說 artwork）")
    for g, dex in GEN_ICONS.items():
        dest = os.path.join(ICON_DIR, f"{g}.png")
        download(ICON_URL.format(id=dex), dest)
        print(f"  gen{g} <- dex #{dex}")

    print("[4/4] 生成素材 manifest（assets/gen-packs/gen{N}.json）")
    os.makedirs(PACK_DIR, exist_ok=True)
    # 對戰用素材：精靈 front/back atlas 同招式動畫 sheets（各代共用，每代 pack 都包一份路徑）
    battle_extra = []
    for side in ("front", "back"):
        for name in sorted(os.listdir(os.path.join(ROOT, "assets", "battle", "pkmn", side))):
            if name.endswith(".png"):
                battle_extra.append(os.path.join(ROOT, "assets", "battle", "pkmn", side, name))
    anim_dir = os.path.join(ROOT, "assets", "battle", "anim")
    for name in sorted(os.listdir(anim_dir)):
        if name.endswith(".json"):
            battle_extra.append(os.path.join(anim_dir, name))
    sheets_dir = os.path.join(anim_dir, "sheets")
    for name in sorted(os.listdir(sheets_dir)):
        if name.endswith(".png"):
            battle_extra.append(os.path.join(sheets_dir, name))
    # 精靈圖只包該代（dex 範圍）；招式動畫全代共用 → 全部包
    def dex_of_pkmn_rel(rel):
        if not rel.startswith("assets/battle/pkmn/"):
            return None
        return int(os.path.splitext(os.path.basename(rel))[0])

    for g in range(2, 6):
        lo, hi = GEN_RANGES[g]
        files = []
        total = 0
        for dex_id in range(lo, hi + 1):
            for path in (os.path.join(ANIM_DIR, f"{dex_id}.gif"), os.path.join(CRY_DIR, f"{dex_id}.mp3")):
                if os.path.exists(path):
                    rel = os.path.relpath(path, ROOT).replace("\\", "/")
                    size = os.path.getsize(path)
                    files.append({"path": rel, "bytes": size})
                    total += size
        # 世代圖示同資料 JSON 一併落入 manifest
        extra = [os.path.join(ICON_DIR, f"{g}.png"), os.path.join(ROOT, "data", f"pokemon-gen{g}.json")]
        extra += battle_extra
        for path in extra:
            if not os.path.exists(path):
                continue
            rel = os.path.relpath(path, ROOT).replace("\\", "/")
            dex = dex_of_pkmn_rel(rel)
            if dex is not None and not (lo <= dex <= hi):
                continue
            size = os.path.getsize(path)
            files.append({"path": rel, "bytes": size})
            total += size
        doc = {"gen": g, "files": files, "totalBytes": total,
               "generatedAt": time.strftime("%Y-%m-%d")}
        out = os.path.join(PACK_DIR, f"gen{g}.json")
        with open(out, "w", encoding="utf-8") as f:
            json.dump(doc, f, ensure_ascii=False, indent=1)
        print(f"  gen{g}: {len(files)} files, {total/1024/1024:.1f} MB")

    print("=== 完成 ===")
    if missing_gifs:
        print("missing gifs:", missing_gifs)
    if missing_cries:
        print("missing cries:", missing_cries)


if __name__ == "__main__":
    main()
