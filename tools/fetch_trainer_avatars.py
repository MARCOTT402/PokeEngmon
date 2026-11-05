"""Download trainer avatar sprites (Pokemon Showdown 80x80 full-body trainers).

Reads the avatar list from js/avatars.js (id + optional src) and saves
assets/trainers/avatars/<id>.png. Existing files are skipped.

Usage: python tools/fetch_trainer_avatars.py [--force]
"""
import os
import re
import sys
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = "https://play.pokemonshowdown.com/sprites/trainers/{}.png"
OUT = os.path.join(ROOT, "assets", "trainers", "avatars")


def avatar_list():
    js = open(os.path.join(ROOT, "js", "avatars.js"), encoding="utf-8").read()
    out = []
    for m in re.finditer(r'\{\s*id:\s*"([a-z0-9-]+)"[^}]*\}', js):
        src = re.search(r'src:\s*"([a-z0-9-]+)"', m.group(0))
        out.append((m.group(1), src.group(1) if src else m.group(1)))
    return out


def main():
    force = "--force" in sys.argv
    os.makedirs(OUT, exist_ok=True)
    items = avatar_list()
    bad = []
    for aid, src in items:
        dst = os.path.join(OUT, aid + ".png")
        if os.path.exists(dst) and not force:
            continue
        req = urllib.request.Request(SRC.format(src), headers={"User-Agent": "PokeEngmon-asset-fetch"})
        try:
            data = urllib.request.urlopen(req, timeout=20).read()
        except Exception as e:  # noqa: BLE001
            bad.append((aid, str(e)))
            continue
        if not data.startswith(b"\x89PNG"):
            bad.append((aid, "not png"))
            continue
        open(dst, "wb").write(data)
    print(f"{len(items)} avatars, {len(bad)} failed")
    for b in bad:
        print("  FAIL", *b)
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
