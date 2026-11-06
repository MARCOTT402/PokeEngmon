"""產生 Q_folder/grammar/grammar_images/index.json（Rule 101）。

js/data.js findQuestionImage() 會讀呢份清單，冇圖嘅題就唔使逐個副檔名試（每題最多 5 個 404）。
加／刪／改名題目圖片之後一定要重跑：

    python tools/gen_grammar_image_index.py
"""
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
IMG_DIR = os.path.join(ROOT, "Q_folder", "grammar", "grammar_images")
EXTS = {".png", ".jpg", ".jpeg", ".webp", ".gif"}


def main():
    if not os.path.isdir(IMG_DIR):
        print("missing folder:", IMG_DIR)
        return 1
    files = sorted(f for f in os.listdir(IMG_DIR)
                   if os.path.splitext(f)[1].lower() in EXTS and not f.startswith("."))
    out = os.path.join(IMG_DIR, "index.json")
    with open(out, "w", encoding="utf-8", newline="\n") as fh:
        json.dump({"files": files}, fh, ensure_ascii=False, indent=0)
        fh.write("\n")
    print("wrote", os.path.relpath(out, ROOT), "-", len(files), "images")
    return 0


if __name__ == "__main__":
    sys.exit(main())
