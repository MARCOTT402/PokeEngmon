# 訓練員資料牌嗰條 bar：用戶等級／PvP 段位方案（2026-11-08）

> 來源：battle menu 訓練員卡 prototype（`tools/prototype/battle-menu-app.html`）。用戶問「條綠色 bar 係咩數據？要唔要用戶等級？PvP 有冇 Lv 升？」
> 狀態：**2026-11-08 用戶揀咗方案 A（Trainer Lv）**，其餘決定已答（建議數值、舊玩家由 Lv1 開始、每 5 級 💎10、Friends／PvP 戰前頁／排行榜顯示）→ spec：`.trae/specs/20261108-trainer-level.md`。B 留待 PvP 多人先再諗。
> 原則：**只 reward，唔 punish**——輸唔扣任何分（下面 B 嘅「輸 −15」作廢，改為輸 0 或者細額 +）。prototype 🧪 面板「Bar（方案比較）」仍然可以切換 A／B／Off 睇樣。

## 而家嘅情況

- 舊 prototype 嗰條綠色 bar ＝ 勝率（62%）再畫多次，**冇新資訊**，所以要換。
- 現有數據：`st.pvpWins`／`st.pvpLosses`（server 計）、`totalCorrect`／`totalQuestions`／`totalSets`、`battleAiTotal`／`battlePvpTotal`（server 計）、`trainerProgress`（梯隊精通）、`dexCaught`、`gymBadges`。
- **冇**用戶等級，亦**冇** PvP 段位。`settle_battle` 曾經有 `p_trainer_level` 參數，已廢棄（`supabase-migrate-20261101c-settle-battle.sql`）。

## 方案 A：訓練員等級（Trainer Lv＋EXP 條）← 建議先做

資料牌變成同戰鬥資料牌一樣：**名 …… Lv12**，下面一條藍色 EXP 條（`340 / 500 EXP to Lv13`）。

- **點樣攞 EXP**（數字可以再調）：
  - 答啱一題 +1（每日上限，例如 200，防止刷題）
  - 完成一組 +5
  - 打贏 AI 訓練員：+10 × 難度倍率（同 tier EXP 倍率一樣：Easy 0.7／Normal 1／Hard／Inferno）；第一次通關 +20
  - PvP：贏 +20、輸 +5（有參與都有）；好友戰唔計（防止互刷）
  - 圖鑑新品種 +15
- **升級曲線**：升下一級要 `100 + 20 × (Lv − 1)` EXP，上限 Lv100。
- **防作弊（必須）**：`user_account.trainer_exp int` 只可以經 server 改。喺現有結算 RPC 入面加 EXP（`settle_battle`／`settle_pvp_battle`／`report_battle_result`、答題結算、捕捉），**唔開 column grant**，client 只讀。Lv 由 EXP 計，唔另外存。
- **其他地方顯示**：Friends 名單、PvP pre-battle 頁（`showPreBattle`）、排行榜，都可以加 Lv。
- **好處**：唔玩 PvP 嘅小朋友都有得升級；同學英文掛鈎（答題係主要 EXP 來源），啱呢個 app 嘅目的。

## 方案 B：PvP 段位（Rank＋RP 條）

名旁邊放段位牌（POKé／GREAT／ULTRA／MASTER），條 bar 係 RP 去下一段（`1240 RP · 260 to ULTRA`）。

- RP：贏 +25（對手段位高過自己 +5）、~~輸 −15~~ 輸唔扣（用戶：只 reward 唔 punish）；段位底線：Poké 0／Great 300／Ultra 800／Master 1500。
- 只計隨機 PvP（`settle_pvp_battle`），好友戰唔計。
- 之後配對可以用 RP 揀對手。
- **缺點**：而家 PvP 人少，大部分人會長期停喺 Poké；唔玩 PvP 嘅人條 bar 永遠空。

## 建議

先做 **A**（人人都用得著，同學習掛鈎）。PvP 多人玩之後再加 **B**：到時 A 嘅 Lv 照擺名旁邊，B 嘅段位牌擺勝率旁邊，兩樣可以並存。

## 要你決定

1. 揀 A、B、定兩樣都做？
2. EXP 來源同數值（上面係建議）；答題每日上限要幾多？
3. 舊玩家要唔要按現有紀錄補 EXP（`totalCorrect`、AI／PvP 場數、圖鑑數）？定係由 0 開始？
4. 升級有冇獎勵（例如每 5 級 💎10）？
5. Friends／PvP pre-battle／排行榜要唔要一齊顯示 Lv？

## 決定之後嘅步驟（未開始）

1. Spec 寫入 `.trae/specs/`。
2. Migration：`trainer_exp` column（唔 grant 寫）＋ 結算 RPC 加 EXP；（B）`pvp_rp`。
3. `js/sync.js` pull 落 `st.trainerExp`；共用 `trainerLevel(exp)` 函數＋單元測試（`tests/unit/`）。
4. Battle menu 資料牌、Friends／pre-battle 顯示 Lv；升級提示用現有 toast／結算畫面。
