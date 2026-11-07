# 招式動畫忠實度審計（對照 PokeRogue 原作）— 2026-11-07

> 用戶回報：「有啲招式原作有動畫特效，但我哋冇做到，變成普通 Tackle 嘅動畫。」
> 方法：將 `assets/battle/anim/` 563 招同 `pagefaultgames/pokerogue-assets`（beta）`battle-anims/<slug>.json` 原版逐招比較（原版下載到暫存，冇入 repo）。
> 結論：**根本原因唔係個別招式漏咗，而係當初匯入時只保留咗原作四種內容之中嘅一種。**

## 1. 原作一招動畫有四種內容，我哋只播一種

| 原作內容 | 例子 | 我哋 |
|---|---|---|
| 特效圖層（`target: 2`，spritesheet 影格） | 火花、水柱、雷電 | ✅ 有（`MoveAnim` 只畫呢層） |
| 出招方／受招方精靈動作（`target: 0／1`：位移、透明度、縮放、角度、變色） | Quick Attack 衝刺、Dig 鑽地、Fly 飛起、受招方被彈開 | ❌ 匯入時刪走，改用統一嘅「衝前 + 左右震」 |
| 定時事件：背景（`AnimTimedAddBgEvent`／`UpdateBgEvent`） | Psychic 紫色背景、Thunder 閃白、Night Shade 黑背景 | ❌ 刪走；85 張背景圖冇下載 |
| 定時事件：音效（`AnimTimedSoundEvent`） | 每招獨有 PRSFX 音效 | ❌ 刪走；只有 9 個通用命中音效 |

另外：原作 223 招分「我方出招」同「敵方出招」兩個版本，我哋只存第一個，所以敵方出招方向可能唔啱。

## 2. 數字（原作有 561 招；`snowscape`、`vice-grip` 原作都冇）

| 類別 | 招數 | 用戶睇到嘅後果 |
|---|---|---|
| 原作**冇特效圖層**、效果全靠精靈動作／背景 | 41 | 我哋只剩「衝前 + 震」，最似 Tackle。例如 `psychic`、`night-shade`、`heat-wave`、`tail-whip`、`rain-dance`、`sunny-day`、`hail`、`agility`、`double-team`、`bind`、`surf`、`confusion`、`rest`、`transform`、`body-press` |
| 原作有背景變化 | 123 | 少咗招式嘅標誌性畫面。例如 `thunderbolt`、`thunder`、`earthquake`、`fire-blast`、`psychic`、`hypnosis`、`dream-eater`、`explosion`、`outrage`、`close-combat` |
| 原作有出招方精靈動作 | 204 | 衝刺、跳起、旋轉全部變成同一個衝前 |
| 原作有受招方精靈動作 | 251 | 被擊飛、縮細、隱身等變成同一個左右震 |
| 特效圖層一樣，但尾段影格被剪 | 360 | 精靈動作嗰段冇咗，動畫提早完 |
| 特效圖層真係唔同 | 31 | 25 招係當年「原作冇資源」而自己砌嘅版本（`.trae/specs/missing-move-anims`）；**原作而家已經有其中 23 招**，不過係靠背景／精靈動作，冇特效圖層。另外 6 招（`acid`、`sludge-bomb`、`charm`、`absorb`、`sludge`、`leafage`）圖層同影格數一樣，只係細微參數差異 |
| 任何一項有損失 | **462／561** | |

## 3. 修正方向（建議做法：「MoveAnim 2.0」）

1. **重新匯入原作完整資料**：保留全部影格、`target 0／1／2` 圖層、`frameTimedEvents`、敵我兩個版本。匯入腳本要入 repo（`tools/fetch_move_anims.py`），可以重跑。
2. **`js/battle/moveanim.js` 支援精靈圖層**：出招方／受招方 canvas 嘅位移、透明度、縮放、角度、`visible`、變色（tone／color）。用原作動作取代統一嘅 `lunge`／`hitShake`，但原作冇精靈動作嘅招就保留而家嘅做法。
3. **支援背景事件**：下載 85 張背景圖（每張約 1–8 KB，合共大約 0.5 MB）到 `assets/battle/anim/bg/`；`AddBg`／`UpdateBg` 喺舞台背景同精靈之間加一層，做淡入淡出、捲動同透明度。
4. **敵方出招用第二個版本**。
5. **25 招自製動畫**：原作有嘅改用原作；`snowscape`、`vice-grip` 繼續用自製。
6. **音效（可選、另外決定）**：原作有 804 個音效引用，每個 wav 大約 10 KB，轉 mp3 之後估計 3–6 MB。建議做成按需載入，或者喺 gen pack 入面下載，唔好放入首次載入。
7. **驗收**：每招用 headless 錄影格，同 PokeRogue 原作對比；選 20 招代表性招式（上面列出嗰啲）逐格睇；全部 561 招行一次自動檢查（冇 error、時長同原作一致）。

## 4. 同 P4（PixiJS 強化）嘅關係

兩樣可以疊加：MoveAnim 2.0 負責「跟足原作」，PixiJS 只喺命中嗰刻加強化。建議**先做 MoveAnim 2.0**：因為 Pixi prototype 嘅右邊用嘅都係 `MoveAnim`，原作效果補齊之後，兩邊比較先準確。

## 5. 素材授權

背景圖同音效同現有 spritesheet 同一來源（Pokémon Reborn／PokeRogue battle-anims），Rule 12 嘅 disclaimer 唔使改；加入新素材之後要更新 `sw.js` 同部署清單規則（Rule 113）。
