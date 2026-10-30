#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
PokeEngmon — 圖片單字題語音生成器

由 vocab.csv 讀取單字，為每個字生成一個 MP3：
    assets/tts/w/<word>.mp3

同一個字只生成一次（已存在就跳過），之後加新題只要跑一次，
已經有檔嘅字唔會重複花 Azure 額度。

用法（Azure Speech，官方、合規、免費層每月 50 萬字元）：
    $env:AZURE_SPEECH_KEY  = "<your key>"
    $env:AZURE_SPEECH_REGION = "eastasia"
    python tools/gen_word_tts.py

用法（edge-tts 備用，聲音一樣但走非官方 endpoint）：
    pip install edge-tts
    python tools/gen_word_tts.py --engine edge

常用參數：
    --voice  en-US-JennyNeural   （英文女聲，最自然）
    --rate   -10%                （學習用途慢少少）
    --force                      重生成所有檔案
    --limit  10                  只生成前 10 個（測試用）
"""

import argparse
import csv
import os
import re
import sys
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CSV_PATH = ROOT / "Q_folder" / "vocab" / "vocab.csv"
OUT_DIR = ROOT / "Q_folder" / "vocab" / "vocab_audio"
OUT_FORMAT = "audio-24khz-48kbitrate-mono-mp3"


def safe_name(word: str) -> str:
    """同 js/data.js 嘅 wordAudioURL 保持一致"""
    key = word.lower().strip().replace(" ", "_")
    key = re.sub(r"[^a-z0-9_\-']", "", key)
    return key


def read_words(path: Path):
    if not path.exists():
        sys.exit(f"[x] 搵唔到 {path}")
    words, seen = [], set()
    with path.open("r", encoding="utf-8-sig", newline="") as f:
        reader = csv.reader(f)
        for i, row in enumerate(reader):
            if not row:
                continue
            first = (row[0] or "").strip()
            if i == 0 and first.lower() in ("word", "單字", "单词"):
                continue
            if not first or not re.match(r"^[A-Za-z'\- ]+$", first):
                continue
            key = first.lower()
            if key in seen:
                continue
            seen.add(key)
            words.append(first)
    return words


def ssml(word: str, voice: str, rate: str) -> str:
    esc = word.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    return (
        "<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='en-US'>"
        f"<voice name='{voice}'><prosody rate='{rate}'>{esc}</prosody></voice></speak>"
    )


def synth_azure(word: str, voice: str, rate: str, key: str, region: str) -> bytes:
    url = f"https://{region}.tts.speech.microsoft.com/cognitiveservices/v1"
    req = urllib.request.Request(
        url,
        data=ssml(word, voice, rate).encode("utf-8"),
        headers={
            "Ocp-Apim-Subscription-Key": key,
            "Content-Type": "application/ssml+xml",
            "X-Microsoft-OutputFormat": OUT_FORMAT,
            "User-Agent": "PokeEngmon-TTS",
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        return resp.read()


def synth_edge(word: str, voice: str, rate: str, out: Path) -> None:
    import asyncio
    import edge_tts

    async def run():
        await edge_tts.Communicate(word, voice, rate=rate).save(str(out))

    asyncio.run(run())


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--engine", choices=["azure", "edge"], default="azure")
    ap.add_argument("--voice", default="en-US-JennyNeural")
    ap.add_argument("--rate", default="-10%")
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--limit", type=int, default=0)
    args = ap.parse_args()

    words = read_words(CSV_PATH)
    if args.limit:
        words = words[: args.limit]

    key = os.environ.get("AZURE_SPEECH_KEY", "").strip()
    region = os.environ.get("AZURE_SPEECH_REGION", "").strip()
    if args.engine == "azure" and (not key or not region):
        sys.exit(
            "[x] 未設定 AZURE_SPEECH_KEY / AZURE_SPEECH_REGION\n"
            "    設定方法（PowerShell）:\n"
            '      $env:AZURE_SPEECH_KEY="<key>"\n'
            '      $env:AZURE_SPEECH_REGION="eastasia"\n'
            "    或用備用引擎: python tools/gen_word_tts.py --engine edge"
        )

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    made = skipped = failed = 0

    for idx, word in enumerate(words, 1):
        out = OUT_DIR / (safe_name(word) + ".mp3")
        if out.exists() and not args.force:
            skipped += 1
            continue
        try:
            if args.engine == "azure":
                data = synth_azure(word, args.voice, args.rate, key, region)
                out.write_bytes(data)
                time.sleep(0.45)          # F0 免費層同時只准 1 個請求
            else:
                synth_edge(word, args.voice, args.rate, out)
            made += 1
            print(f"  [{idx}/{len(words)}] {word} -> {out.relative_to(ROOT)}")
        except Exception as e:            # noqa: BLE001
            failed += 1
            print(f"  [!] {word} 失敗: {e}")

    print(f"\n完成：生成 {made} · 跳過 {skipped} · 失敗 {failed}")
    print(f"輸出資料夾：{OUT_DIR}")
    if failed:
        sys.exit(1)


if __name__ == "__main__":
    main()
