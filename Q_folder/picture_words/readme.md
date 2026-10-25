# 🎙️ PokeEngmon - 圖片單字 TTS 語音自動生成系統

本工具專為 **PokeEngmon** 答題遊戲設計，透過 `edge-tts`（Microsoft Edge 語音引擎）自動讀取 CSV 內的單字清單，並即時生成純正英式英語（UK English）發音的 MP3 音頻檔案。

---

## 📂 資料夾與檔案結構

```text
picture_words/
│
├── picture_words.csv           # 題目 CSV 檔（包含 Word 欄位）
├── auto_generate_tts.py        # TTS 自動生成與背景監控 Python 腳本
├── README.md                   # 本說明文件
│
└── picture_words_audio/        # 自動生成的 MP3 音檔儲存資料夾
    ├── book.mp3
    ├── pen.mp3
    ├── pencil.mp3
    └── ...
```

---

## ⚙️ 環境準備 (Prerequisites)

首次使用前，請確保電腦已安裝 Python 3.8+，並在 **Terminal / Command Prompt (CMD)** 執行以下指令安裝所需套件：

```bash
pip install pandas edge-tts watchdog
```

---

## 🚀 使用方法 (How to Run)

### 1. 啟動自動生成與監控腳本

開啟 Terminal / CMD，切換至本資料夾或直接執行：

```bash
python auto_generate_tts.py
```

### 2. 運作邏輯說明

* **首次運行 / 啟動時**：
  * 腳本會自動讀取 `picture_words.csv` 裡面的 `Word` 欄位。
  * 檢查 `picture_words_audio/` 資料夾內是否已有對應單字的 MP3（例如 `book.mp3`）。
  * 若**不存在**，會立即調用 AI 語音引擎生成 MP3。
  * 若**已存在**，會自動 **Skip（跳過）**，不會重複生成，節省時間與資源。

* **背景實時監控模式**：
  * 腳本會保持運行狀態。
  * 任何時候你開啟 `picture_words.csv` **新增、修改或刪除單字並儲存**，腳本會在 1 秒之內自動感應變更，並補齊最新單字的 MP3 音檔！

---

## 🎙️ 目前 TTS 語音設定 (Current TTS Config)

目前在 `auto_generate_tts.py` 中的語音配置如下：

| 設定項目 | 目前設定值 | 說明 |
| :--- | :--- | :--- |
| **語音聲線 (Voice)** | `en-GB-SoniaNeural` | 純正英式女聲 (Standard UK RP) |
| **語速 (Rate)** | `-10%` | 速度調慢 10%，適合兒童及英文學習者 |
| **音訊格式** | `.mp3` | 檔名以單字命名（如 `pen.mp3`） |

> **如欲更改為美式發音**：
> 可將 `auto_generate_tts.py` 內的 `VOICE = "en-GB-SoniaNeural"` 修改為 `VOICE = "en-US-AvaNeural"` (美式女聲) 或 `VOICE = "en-US-GuyNeural"` (美式男聲)。

---

## 📝 CSV 格式要求 (CSV Requirements)

`picture_words.csv` 必須包含標頭列（Header），且**必須包含 `Word` 欄位**（不區分大小寫）：

```csv
Word,Level,Course,Type,Category,Image,Accept,Source
book,1,Dictation,Noun,stationary,...
pen,1,Dictation,Noun,stationary,...
```

---

## 🛑 如何停止腳本

在運行腳本的 Terminal / CMD 視窗中按下 `Ctrl + C` 即可安全關閉監控系統。