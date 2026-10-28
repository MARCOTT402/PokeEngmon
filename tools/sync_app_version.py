# -*- coding: utf-8 -*-
"""Sync package.json version → js/app.js, sw.js, index.html, prd.md header.

Used by semantic-release prepareCmd and local `npm run sync-version`.
"""
from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read_version() -> str:
    pkg = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))
    ver = str(pkg.get("version") or "").strip()
    if not re.fullmatch(r"\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?", ver):
        raise SystemExit(f"invalid package.json version: {ver!r}")
    return ver


def write_utf8(path: Path, text: str, *, bom: bool = False) -> None:
    data = text.encode("utf-8")
    if bom:
        data = b"\xef\xbb\xbf" + data
    path.write_bytes(data)


def sync_app_js(ver: str) -> None:
    path = ROOT / "js" / "app.js"
    raw = path.read_bytes()
    bom = raw[:3] == b"\xef\xbb\xbf"
    text = raw.decode("utf-8-sig")
    new, n = re.subn(
        r'const APP_VERSION = "[^"]+";',
        f'const APP_VERSION = "{ver}";',
        text,
        count=1,
    )
    if n != 1:
        raise SystemExit("APP_VERSION not found in js/app.js")
    write_utf8(path, new, bom=bom)


def sync_sw(ver: str) -> None:
    path = ROOT / "sw.js"
    text = path.read_text(encoding="utf-8")
    new, n = re.subn(
        r'const CACHE_NAME = "pokeengmon-[^"]+";',
        f'const CACHE_NAME = "pokeengmon-{ver}";',
        text,
        count=1,
    )
    if n != 1:
        raise SystemExit("CACHE_NAME not found in sw.js")
    path.write_text(new, encoding="utf-8", newline="\n")


def sync_index(ver: str) -> None:
    path = ROOT / "index.html"
    text = path.read_text(encoding="utf-8")
    # Replace any ?v=... query on local assets
    new, n = re.subn(r"(\?v=)[^\"'\s>]+", rf"\g<1>{ver}", text)
    if n < 1:
        raise SystemExit("no ?v= query params found in index.html")
    path.write_text(new, encoding="utf-8", newline="\n")


def sync_prd(ver: str) -> None:
    path = ROOT / "prd.md"
    if not path.exists():
        return
    text = path.read_text(encoding="utf-8")
    new, n = re.subn(
        r"(> 目前版本：\*\*)[^*]+(\*\*)",
        rf"\g<1>{ver}\2",
        text,
        count=1,
    )
    if n == 1:
        path.write_text(new, encoding="utf-8", newline="\n")


def main() -> None:
    ver = read_version()
    sync_app_js(ver)
    sync_sw(ver)
    sync_index(ver)
    sync_prd(ver)
    print(f"synced app version → {ver}")


if __name__ == "__main__":
    main()
