# BGM／音效音量調校

## 玩家：用 Settings 滑動條（v145+）

1. 主頁 → ⚙️ Settings
2. **Music**／**Sound Effects** 兩個連續滑動條（0–100%，step 1）
3. 拖動即時變聲；數值寫入 `localStorage` key `pokeengmon_audio_v1`（refresh／關網再開都 keep；清進度唔抹）

100% = 而家設計音量；0% = 靜音。唔使改碼。

---

## 開發者：改「設計基數」（少用）

玩家滑動條係 **倍率**，乘喺設計基數之上。硬改基數先至要動碼。

| 音樂 | 搜尋 | 設計基數（100% 時） |
|---|---|---|
| 主頁全域（Flat Water） | `startTownBGM` → `g.gain.value = 0.1` | 0.1 |
| 捕捉戰鬥（Wild Battle） | `startBGM` → `g.gain.value = 0.15` | 0.15 |
| 戰鬥 duck | `duckBGM(0.08, 400)` | 0.08 |

用戶倍率經 `CaptureAudio.bgmBus`／`sfxBus`（`setBgmScale`／`setSfxScale`）。duck 目標保持設計絕對值，bus 負責縮放。

改完基數要 bump 版本（三處）+ commit push：

```powershell
cd C:\Users\user\Documents\trae_projects\PokeEngmon
python tools/git_commit_push.py --paths js/capture.js js/app.js sw.js index.html -m "vNN: adjust designed BGM base"
```

---

## 驗證清單

1. Settings 拖 Music → 主頁 BGM 即時變
2. 拖 Sound Effects → 停 ~180ms 播 obtained-pokemon preview（跟新 %）；答對／錯／叫聲／jingle 亦跟倍率
3. F5 後 slider 位置同音量仍在
4. Reset Progress 後音量設定仍在
