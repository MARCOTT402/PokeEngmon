# Battle System 2.0 — 實例說明書（Worked Examples v1.1）

> 配套文件：`battle-system-2.0-trainer-mastery-matrix.md`
> 用途：用具體數字行一次成個系統，供 Product / Engineering / QA 對齊認知。
> 版本：v1.1（14 trainer × 4 tier、EP 能量點、Inferno Level Sync +2、等級範圍顯示）

---

## 0. Trainer Roster 實際換算總表

等級換算規則：`Math.round(base × 0.9)`（Easy）、`base`（Normal）、`Math.round(base × 1.1)`（Hard，上限 100）；Easy 且 AI=6 時再乘 0.9（合計 −20%）。Inferno 敵人固定 base 等級，玩家走 Level Sync。

| # | Trainer | Base Lv | AI 數 | Easy AI Lv / 玩家 | Normal AI Lv / 玩家 | Hard AI Lv / 玩家 | Inferno 玩家 / Sync |
|---|---|---|---|---|---|---|---|
| 1 | Youngster Timmy | 5 | 1 | 5 / 2 | 5 / 1 | 6 / 1 | 1 / Lv.7 |
| 2 | Bug Catcher Wade | 8 | 6 | 7 / 6 | 8 / 6 | 9 / 5 | 5 / Lv.10 |
| 3 | Lass Dana | 14 | 2 | 13 / 3 | 14 / 2 | 15 / 1 | 1 / Lv.16 |
| 4 | Hiker Marcos | 22 | 3 | 20 / 4 | 22 / 3 | 24 / 2 | 2 / Lv.24 |
| 5 | Gentleman Alfred | 30 | 2 | 27 / 3 | 30 / 2 | 33 / 1 | 1 / Lv.32 |
| 6 | Swimmer Barry | 38 | 6 | 30 / 6 | 38 / 6 | 42 / 5 | 5 / Lv.40 |
| 7 | Ace Trainer Kiera | 46 | 4 | 41 / 5 | 46 / 4 | 51 / 3 | 3 / Lv.48 |
| 8 | Gym Leader Jasmine | 55 | 3 | 50 / 4 | 55 / 3 | 61 / 2 | 2 / Lv.57 |
| 9 | Psychic Sarah | 64 | 6 | 51 / 6 | 64 / 6 | 70 / 5 | 5 / Lv.66 |
| 10 | Champion Cynthia | 76 | 5 | 68 / 6 | 76 / 5 | 84 / 4 | 4 / Lv.78 |
| 11 | Champion Alder | 82 | 6 | 66 / 6 | 82 / 6 | 90 / 5 | 5 / Lv.84 |
| 12 | Elite Four Drake | 90 | 6 | 72 / 6 | 90 / 6 | 99 / 5 | 5 / Lv.92 |
| 13 | Frontier Brain Anabel | 95 | 6 | 76 / 6 | 95 / 6 | 100 / 5 | 5 / Lv.97 |
| 14 | Champion Red | 99 | 6 | 79 / 6 | 99 / 6 | 100 / 5 | 5 / Lv.100（封頂） |

**卡面顯示**：主卡顯示 `Lv. 5–6`、`Lv. 68–84` 呢類實際範圍，唔顯示單一固定數字；難度選擇畫面才顯示精確值（見主文件 §7.1）。

---

## 例 1：新手阿明 vs Youngster Timmy（1 隻，四級全行）

**玩家**：2 隻 —— Bulbasaur Lv.7、Rattata Lv.5。Timmy = Rattata 1 隻。

| 難度 | 玩家出戰 | 敵人 Lv | AI 質素 | 預估勝率 | EP |
|---|---|---|---|---|---|
| Easy | 2 | 5 | IV0、最弱 2 招、T0 | >95% | −1 |
| Normal | 1 | 5 | 隨機 IV、4 招、T1 | ~85% | −1 |
| Hard | 1 | 6 | IV31、T2、+10% | ~55% | −1 |
| Inferno | 1 | 5 | IV31 + EV252 + 最優性格 + T3(85%) + Potion×1；玩家 Sync Lv.7 | ~35% | −1 |

**獎勵（Timmy base = 10 EXP）**

| 場次 | EXP | 鑽石 | 備註 |
|---|---|---|---|
| Easy 首通 | 7 | +10 💎 | 10 × 0.7 |
| Normal 首通 Flawless | 12 | +10 💎 | 10 × 1.0 × 1.2，首次 Flawless 再 +1 candy |
| Hard 首通 | 16 | +10 💎 | 10 × 1.6，解鎖 Inferno 剪影 |
| Inferno 輸 | 0 | 0 | 只扣 1 EP，零其他懲罰 |
| Inferno 首通 | 25 | +10 💎 | 10 × 2.5 |
| 任何 tier 重打 | 40% EXP | 0 | 例：Easy 重打 = 2 EXP |

**關鍵體感**：Inferno 1v1 係「完美個體 + 會食藥」嘅單挑考驗；玩家有 Lv.7 優勢，所以仍然可贏，唔係無解。

---

## 例 2：阿明 vs Bug Catcher Wade（Lv.8 但 6 隻）——低等級大隊示範

**設計意圖**：打破「等級低 = 隊伍細」嘅直覺。Wade 六隻 Lv.8 蟲（Caterpie / Metapod / Weedle / Kakuna / Paras / Venonat）。

| 難度 | 玩家出戰 | 敵人 Lv | AI 質素 | 戰鬥體感 |
|---|---|---|---|---|
| Easy | 6（封頂） | 7（再 −10%） | IV0、最弱 2 招、T0 | 6v6 但每隻好脆，1–2 招就倒 |
| Normal | 6 | 8 | 隨機 IV、4 招、T1 | 標準 6v6 |
| Hard | 5 | 9 | IV31、EV252、T2 | 5v6，靠等級同相剋追回數量差 |
| Inferno | 5 | 8 | 完美培育 + T3 + Potion×1；玩家 Sync Lv.10 | 5v6，敵人有等級差但血量低，Potion 時機係關鍵 |

**Easy 飽和補償**：AI 6 隻時 `AI+1` 封頂成 6，數量優勢消失 → AI 等級額外 −10%（合計 −20%）、保持 T0、只帶最弱 2 招。所以 Easy 仍然輕鬆。

**經驗值**：Wade base = 20 EXP → Easy 14 / Normal 20 / Hard 32 / Inferno 50。

---

## 例 3：阿欣 vs Gym Leader Jasmine（Hard：2v3）

**玩家**：6 隻平均 Lv.55。Jasmine = Steelix / Skarmory / Magneton，base Lv.55。

**Hard 生成結果**：玩家 **2 隻**（AI−1）、敵人全部 **Lv.61**（+10%）、IV31、主攻 252 / Speed 252、T2、無道具。

**T2 決策示範**（Steelix vs 阿欣嘅 Vaporeon）

| 招式 | power | acc | STAB | 相剋 | 期望值 | |
|---|---|---|---|---|---|---|
| Iron Tail | 100 | 75% | ×1.5 | ×1 | 112.5 | |
| Earthquake | 100 | 100% | ×1.5 | ×1 | **150** | ← T2 揀呢招 |
| Rock Slide | 75 | 90% | — | ×1 | 67.5 | |
| Curse | — | — | — | — | 0（有傷害招時跳過） | |

**T1 vs T2 分別**：對手換成飛行系時，T1 仍然會打 Earthquake（無效），T2 會改揀 Rock Slide。呢個就係玩家感受到嘅「AI 變聰明」。

**預估勝率**：~45%（少一隻但玩家可以帶相剋隊）。**獎勵**：Jasmine base 90 → Hard 首通 144 EXP + 💎10。

---

## 例 4：頂階玩家 vs Champion Cynthia（Inferno：4v5 + Level Sync）

**玩家**：6 隻平均 Lv.80。Cynthia 5 隻，平均 Lv.76。

- 玩家出戰 **4 隻**（AI−1）
- **Level Sync**：玩家 4 隻戰鬥內全部視為 **Lv.78**（76 + 2，上限 100），戰後真實等級不變
- AI：IV31、EV252、最優性格、競技配招、Potion×1、T3（85% 最優 / 15% 隨機）
- 玩家補償：開場 Full Restore ×1

**T3 決策示範**（Garchomp vs 玩家 Dragonite）

1. 計算 Dragon Claw 期望值 → 可 2HKO 對方 → **直接攻擊**（必殺優先）
2. 預測玩家會換 Ice 系（Weavile，4 倍弱 Ice）→ 自己會被 1HKO → **換入抗冰 Lucario**
3. Lucario HP <30% 且判定安全 → **食 Potion**
4. 對面換入被克目標 → 判定安全回合 → **Swords Dance 強化**

**預估勝率**：~28%。玩家要贏，需要 ① 帶對屬性、② 善用 Full Restore 時機、③ 逼 AI 換人後打擊弱點。**獎勵**：Cynthia base 120 → Inferno 首通 300 EXP + 💎10。

---

## 例 5：最終試煉 — Champion Red（Lv.99，6 隻，Inferno）

- 玩家出戰 **5 隻**（AI−1）
- 敵人全部 Lv.99、完美培育、T3、Potion×1
- 玩家 Sync：99 + 2 = 101 → **封頂 Lv.100**
- 預估勝率：**~20%**（全遊戲最難節點，符合「後期內容」定位）
- **Hard 版本**：5v6、敵人 Lv.100（99 × 1.1 封頂）、IV31、T2 → 預估 ~40%

**設計意義**：Red 係 Lv.99 終點，令玩家知道「練到 99 都仲有嘢玩」，但唔會因為等級牆而永遠打唔到——Level Sync 保證任何等級都可以入場，只係勝率低。

---

## 例 6：能量點（EP）一週實際流轉

規則：每日登入 +1、完成 10 題 +1（每日最多 3 次）、每日獲取上限 4、持有上限 8、每日消耗上限 4、每場 −1。

| 日 | 開始 EP | 獲取 | 消耗 | 結束 EP | 備註 |
|---|---|---|---|---|---|
| D1（新手） | 5 | +4 | 4 | 5 | 登入 +1、30 題 +3；打 4 場 |
| D2 | 5 | +4 | 4 | 5 | 穩定 4 場/日 |
| D3 | 5 | +1（只登入） | 4 | 2 | 冇答題，用存貨 |
| D4 | 2 | +4 | 4 | 2 | |
| D5 | 2 | +4 | 2 | 4 | 只打 2 場，儲 2 點 |
| D6（週末） | 4 | +4 | 4 | 4 | |
| D7 | 4 | +4 | 4 | 4 | |

**一週總對戰**：4+4+4+4+2+4+4 = **26 場**（平均 3.7 場/日），加每日 10–30 題 ≈ 每日 25–35 分鐘。符合兒童時長目標。

**為何唔可以無限刷**：獲取上限 4、持有上限 8、消耗上限 4 三重鎖；全部由 `spend_energy` RPC 驗證，前端改唔到。

---

## 例 7：PvP 好友對戰（非同步）

1. 阿明喺 PvP 頁上傳自己 6 隻 snapshot，取得 friend code `PE-8842`
2. 阿欣輸入 friend code，消耗 **1 EP** 發起挑戰
3. Server 用 snapshot 重建阿明隊伍（同一 Level Sync 規則，避免等級壓制）
4. 結果：阿欣贏 → +EXP、+PvP 積分；**冇鑽石**、**唔計 trainer mastery**
5. 阿明防守方 **0 EP**，唔會被朋友騷擾扣資源

**防作弊**：snapshot 由 server 驗證（等級上限、招式合法性、道具上限）；唔設「同一朋友每日挑戰次數」上限，玩家自行決定挑戰節奏。

---

## 例 8：經濟總賬（14 trainer × 4 tier）

| 項目 | 數字 |
|---|---|
| 首通鑽石 | 56 節點 × 💎10 = **💎560**（一生一次，封頂） |
| 對比稀有抽 | 💎3/抽 → 約 **186 抽** |
| Flawless candy | 56 × 首次 1 粒 = 最多 **56 candy** |
| 重複通關 | 40% EXP、0 鑽石；EP 每日上限天然限制 farm |
| Server 驗證 | 首通判定睇 `user_trainer_progress.cleared_at`，重複只派 40% EXP |

**節奏檢查**：以每日 3.7 場計，56 節點全破約需 **3–4 週**（未計輸場），配合答題、抽獎、育成，內容壽命合理。

---

## 附：QA 驗收用例

| # | 用例 | 預期 |
|---|---|---|
| E1 | 新帳戶只有 1 隻寶可夢打 Easy Timmy | 出戰數 = min(2, 1) = 1，唔報錯 |
| E2 | Easy Wade（AI 6） | 玩家 6 隻、敵人 Lv.7、AI 等級額外 −10% 生效 |
| E3 | Jasmine Hard | 玩家 2 隻、敵人 Lv.61、IV31、EV252、T2 |
| E4 | Cynthia Inferno | 確認窗顯示 `Level Sync → Lv.78`，戰後真實等級/EXP 不變 |
| E5 | Red Inferno | Sync 顯示 Lv.100（封頂），唔會出現 Lv.101 |
| E6 | 同日第 5 場對戰 | `spend_energy` 拒絕（每日消耗上限 4），前端顯示明確提示 |
| E7 | 完成 10 題後 EP +1 | Server 驗證該 10 題來自有效回合，重複提交唔會再派 |
| E8 | 已首通後重打同一 tier | 只派 40% EXP、0 鑽石 |
| E9 | 未破 Normal 直接 call RPC 報 Hard 首通 | Server 403 拒絕 |
| E10 | PvP 勝利 | 只派 EXP + PvP 積分，0 鑽石、唔計 mastery |
| E11 | reduced-motion 裝置 | 鬼火框、ember、解鎖演出全部靜態 |
| E12 | 主卡 vs 實際等級 | 卡面 `Lv. 68–84` 與四級精確值一致，冇「貨不對版」 |
