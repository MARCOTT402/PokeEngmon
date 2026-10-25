# BGM 音量調校手把手教學

適用於：調整 PokeEngmon 入面任何 BGM / 音樂嘅音量。
零基礎都做到，跟住步驟逐個做就得。

---

## 第一步：搵到音量控制嗰行

所有 BGM 音量都寫喺 `js/capture.js`。用 VS Code / 記事本開呢個檔案，然後按 `Ctrl + F` 搜尋。

| 音樂 | 搜尋關鍵字 | 位置（大約） | 預設音量 |
|---|---|---|---|
| 主頁全域音樂（Nuvema Town） | `g.gain.value = 0.25` | `startTownBGM()` 入面，約第 556 行 | 0.25 |
| 捕捉場景戰鬥音樂（Wild Battle） | `g.gain.value = 0.55` | `startBGM()` 入面，約第 378 行 | 0.55 |

音量數字規則：

- `0.0` = 完全靜音
- `1.0` = 最大聲
- 建議範圍 `0.2` – `0.6`，太細聽唔到、太大會蓋過音效

---

## 第二步：改數字

例如想全域音樂再細聲啲，將：

```js
g.gain.value = 0.25;
```

改成：

```js
g.gain.value = 0.18;
```

記住：**行尾要有分號 `;`**，改完儲存檔案（`Ctrl + S`）。

> ⚠️ 捕捉場景戰鬥音樂有一套「收細 → 淡出」編排（duck 到 `0.32`、6.2 秒淡出到 0），如果只想起始細聲啲，記得 duck 目標都要按比例改：
> - 第 378 行 `g.gain.value = 0.55;`（起始音量）
> - 約第 1667 行 `this.duckBGM(0.32, 400);`（點擊後收細到嘅音量）
> - 比例維持大約 `0.32 / 0.55 ≈ 0.58`，例如起始改 `0.42`，duck 就改 `0.24`

---

## 第三步：Bump 版本號（唔好 skip！）

呢個遊戲有 Service Worker 離線快取。**只改 JS 唔 bump 版本號，玩家（包括你自己部電話）會永遠睇到舊版本。**

要同時改 3 個檔，版本號三處要一模一樣（假設而家係 `v120`，新版本就係 `v121`）：

1. `js/app.js` 第 6 行：
   ```js
   const APP_VERSION = "v121";
   ```
2. `sw.js` 第 2 行：
   ```js
   const CACHE_NAME = "pokeengmon-v121";
   ```
3. `index.html`：將所有 `?v=120` 改成 `?v=121`（共 17 處，用「取代全部」功能一次過搞掂）

---

## 第四步：Commit + Push 上 GitHub

網站由 GitHub Pages 部署，**本地改完唔 push，線上永遠唔會變**。

打開 PowerShell，`cd` 到專案目錄，行一鍵指令碼：

```powershell
cd C:\Users\user\Documents\trae_projects\PokeEngmon
python tools/git_commit_push.py --paths js/capture.js js/app.js sw.js index.html -m "v121: adjust BGM volume"
```

見到 `✔ 已 push 到 origin/main` 就完成。

> 💡 想快啲試效果：改完可以直接開本地 `index.html` 試聽，滿意先 bump version + push。

---

## 第五步：驗證

1. 等 1–2 分鐘等 GitHub Pages 部署
2. 手機 / 電腦開網站，去 **Settings** 睇版本號係咪 `v121`
3. 聽下 BGM 音量係咪啱

如果版本號仲係舊：先查 `git status` / `git log` 確認有冇 push 成功。

---

## 快速參考（Cheat Sheet）

```
改音量  →  js/capture.js 搜 "g.gain.value"
Bump版 →  app.js APP_VERSION + sw.js CACHE_NAME + index.html 所有 ?v=
發佈    →  python tools/git_commit_push.py --paths js/capture.js js/app.js sw.js index.html -m "vNN: ..."
驗證    →  Settings 頁睇版本號 + 實機聽
```
