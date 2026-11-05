# 背包系統 Spec（2026-11-05 已確認）

> 來源：負責人 Obsidian《pokemon-背包系統》+ 2026-11-05 Claude Code 對比現有 code 後逐條確認。
> 實作次序：**先做狀態系統第一期**（藥物 + server RPC，見 `status-hp-system-spec-20261105.md`），背包跟住做。
> 落 code 前要先過 prototype：`tools/prototype-bag.html`。

---

## 1. 外框同橫向

- 沿用現有紅色 Pokédex 機身；橫向 = 成個紅框轉橫（逆時針）：
  - 機頂裝飾列（鏡頭／品牌字／精靈球）→ 左邊直條
  - 上框數據（連續日數／鑽石／圖鑑／能量）→ 跟住轉去左側直排
  - 下巴 Home 精靈球 → 右邊
  - 屏幕內容本身保持正向（橫向閱讀）
- **背包一定橫向**；**戰鬥畫面都改橫向**（現況戰鬥係直屏，要重做版面）。
- `manifest.json` 現時 `"orientation": "portrait"` → 要改（否則 Android 已安裝 PWA 轉唔到橫）。
- 由直屏頁入背包：未打橫就出動畫提示轉手機；離開返直屏頁：未轉直就提示轉返。網頁只能提示，唔能強制。

## 2. 入口

- 主頁底部 dock 嘅 Battle sheet（`#sheet-battle`）加「Bag」入口，撳入去轉橫向背包。

## 3. 三欄排版

| 區域 | 內容 |
|---|---|
| 左欄 | **我的隊伍**（最多 6 隻），固定，唔受類別切換影響；可直接點擊做目標 |
| 中欄 | 頂部類別 tab + 排序／篩選；下面格仔，可捲動 |
| 右欄 | 選中項目資料頁 |
| 頂部 | 不顯示持有上限同貨幣 |

## 4. 我的隊伍

- 同「拍檔」無關：拍檔係育成用，可以啱啱好喺隊入面，亦可以唔喺。
- AI 戰、PvP、好友戰**共用同一隊**；NvN 出隊伍排列嘅頭 N 隻（1v1 出第 1 隻，4v4 出頭 4 隻）。
- 出戰前可以調整（揀隊畫面預填我的隊伍次序）。
- 唔做自動編隊。
- Faint 唔可以出戰（狀態系統規則）。

## 5. 類別

| 類別 | 說明 |
|---|---|
| Items | medicine、berries、進化石、化石、Mega 石、EV point unit 等，用篩選分，不另設類別 |
| Key items | 做框架但**隱藏**，有內容先出現 |
| Held items | 框架先行，冇內容顯示空 |
| Pokémon | 只顯示持有嘅 Pokémon，做設定（招式、EV、攜帶道具） |

- 化石、Mega 石、held items、key items 今次只做框架，冇內容顯示空。
- Pokémon 右上角「我的最愛」★；排序可揀我的最愛。
- 右欄 Pokémon 顯示全部參數（跟遊戲現有）：能力值旁數字 = EV，招式旁數字 = PP。
- EV 上限沿用 `MAX_EV`（每項 252）／`MAX_EV_TOTAL`（510）。

## 6. 食物改用樹果（PokeAPI berry）

- 取代現有 food／premium food：部分樹果 = Normal food 效果（飽肚值 +25%），部分 = Super food 效果（+50%）。只限育成。
- 戰鬥內樹果效果跟原作。

### 6.1 已確認（2026-11-05）

| 項目 | 決定 |
|---|---|
| 用邊幾款 | **原作全部 67 款**（PokeAPI berry 1–64 + Roseli／Kee／Maranga） |
| 分級 | 負責人交由 agent 定 → 見 6.2（有戰鬥大效果嘅 = Super，其餘 = Normal） |
| 掉落 | 沿用而家方法：10/10 → 1 粒 Super 樹果（+ 原有 Revival 規則）；1–9 題 → 1 粒 Normal 樹果 |
| 舊庫存 | 一換一：food → Oran Berry、premium → Sitrus Berry |
| 攜帶 | 可以攜帶；戰鬥效果跟原作（自動觸發、用完消失） |
| 從背包餵／用 | 育成 = 飽肚值（按分級）；麻痹／睡眠／冰凍照舊唔准食 |
| 戰鬥中從背包用 | 跟原作（Rule 63：冇效果唔准用、唔扣數）；一回合一件 |
| Mega 進化 | 跟原作：攜帶對應 Mega 石，每場戰鬥一次，揀招頁有 Mega 掣，戰鬥完變返原形；背包只顯示 Mega 石 |

### 6.2 樹果分級同效果（原作 Gen 7+ 數值）

掉落權重：同一級入面，**常用樹果權重 3，其餘 1**（免得狀態解藥類太難拎）。

**Super food（+50% 飽肚值，21 款）**

| 樹果 | 攜帶時戰鬥效果 | 權重 |
|---|---|---|
| Sitrus | HP ≤ 50% → 回 25% HP | 3 |
| Lum | 解所有主要狀態 + 混亂 | 3 |
| Figy／Wiki／Mago／Aguav／Iapapa | HP ≤ 25% → 回 1/3 HP；性格唔鍾意嗰種味會混亂 | 1 |
| Liechi／Ganlon／Salac／Petaya／Apicot | HP ≤ 25% → 攻擊／防禦／速度／特攻／特防 +1 | 1 |
| Lansat | HP ≤ 25% → 會心率 +2 | 1 |
| Starf | HP ≤ 25% → 隨機一項能力 +2 | 1 |
| Micle | HP ≤ 25% → 下一招命中 ×1.2 | 1 |
| Custap | HP ≤ 25% → 下回合先出手 | 1 |
| Enigma | 被效果絕佳嘅招打中 → 回 25% HP | 1 |
| Jaboca／Rowap | 被物理／特殊招打中 → 對手扣 1/8 HP | 1 |
| Kee／Maranga | 被物理／特殊招打中 → 防禦／特防 +1 | 1 |

**Normal food（+25% 飽肚值，46 款）**

| 樹果 | 攜帶時戰鬥效果 | 權重 |
|---|---|---|
| Cheri／Chesto／Pecha／Rawst／Aspear | 解麻痹／睡眠／中毒／燒傷／冰凍 | 3 |
| Persim | 解混亂 | 3 |
| Oran | HP ≤ 50% → 回 10 HP | 3 |
| Leppa | 某招 PP 用完 → 回 10 PP | 3 |
| Occa／Passho／Wacan／Rindo／Yache／Chople／Kebia／Shuca／Coba／Payapa／Tanga／Charti／Kasib／Haban／Colbur／Babiri／Roseli | 被對應屬性嘅效果絕佳招打中 → 傷害減半（火／水／電／草／冰／格鬥／毒／地面／飛行／超能力／蟲／岩石／幽靈／龍／惡／鋼／妖精） | 1 |
| Chilan | 被一般系招打中 → 傷害減半 | 1 |
| Pomeg／Kelpsy／Qualot／Hondew／Grepa／Tamato | 戰鬥冇效果；原作喺戰鬥外用 = HP／攻擊／防禦／特攻／特防／速度 EV −10 → 本作：喺背包餵嘅時候**同時** EV −10（可以用嚟重新分配 EV，扣咗嘅 EV 唔退 unit） | 1 |
| Razz／Bluk／Nanab／Wepear／Pinap／Cornn／Magost／Rabuta／Nomel／Spelon／Pamtre／Watmel／Durin／Belue | 冇戰鬥效果（原作係製作寶可方塊用） | 1 |

> 待負責人確認：EV −10 嗰 6 款樹果，餵嘅時候同時扣 EV（跟原作戰鬥外效果），定係只當食物？

## 7. EV point unit

- 抽到重複 Pokémon → 改為掉 1 件 EV point unit 入背包（共用一格），唔再加落該隻身上。
- 遷移：所有 entry 嘅 `evPoints` 加總轉成背包數量，entry 歸 0。
- 用法同藥一樣：揀 unit → 揀 Pokémon → 揀能力值 +1。

## 8. 舊入口

- Partner Care 彈窗：保留做餵食／睇飽肚值；道具一律喺背包用。
- Pokédex 詳情：改純睇；招式同 EV 只可以喺背包改。舊嘅修改入口刪除。
- Pokédex 照舊睇圖鑑（包括未捉到）；背包 Pokémon tab 只顯示持有。

## 9. 使用流程

1. 揀物品 → 「Use」→ 中欄跳去 Pokémon tab → 點目標。
2. 或直接點左欄隊伍內 Pokémon，唔使跳轉。
3. Held items：揀道具 → 攜帶 → 揀 Pokémon；Pokémon 右欄顯示攜帶道具，可拆除。

## 10. 戰鬥中開背包

- 三欄排版一樣，**鎖定而非隱藏**：只有 Items 可用，其他 tab 變灰。
- 左欄 = 當前出戰隊伍；目標直接點左欄。
- Items 全部列出，戰鬥用唔到嘅（化石、Mega 石、EV point unit）變灰，撳落去提示「Can't use this in battle」。
- Faint 嘅 Pokémon 只可以用活力碎片（revive）。
- 用藥佔一個回合；結算跟戰鬥結束一次過寫 server。

## 11. 風格

- 配色沿用 app 現有（紅色機身 + 米白卡 + 深色描邊），只參考參考圖嘅版面。

## 12. Prototype 回饋後追加（2026-11-05）

- **配招上雲**：每隻 Pokémon 嘅持有招式存 `user_entries.move_loadout`（migration `20261105b`），log out／換機都保留。
- **送回大木博士**：Pokémon 右欄可以送走；退還佢身上用咗嘅 EV Point Unit（= 已加 EV 總數）+ 額外 1 個，攜帶道具退返背包。拍檔、最後一隻唔可以送；要撳住 1 秒確認。
- **進化石**放 Held items：啱條件就即刻進化，進化石用完消失；唔啱條件就只係攜帶。
- **排序**：No.／Level／Favorites／Type／Fullness／HP loss／Faint／Status（冇 Obtained）；照顧類排序將最需要照顧嘅排頭；每格一定顯示名，第二行顯示排序對應資料；用戶可以自訂排序 chip 次序（存用戶設定）。
- **我的最愛**用心心；雙擊 Pokémon 切換。
- **拖放**：道具 → 隊伍 Pokémon（使用／攜帶）；Pokémon → 隊伍 slot（加入／替換）；隊伍 slot 互拖調位；隊伍 slot → 中欄 = 移出隊伍。Touch 長撳 0.3 秒先拎起。
- **換招頁**蓋住中欄 + 右欄：左邊而家 4 招、右邊可學招式（分類篩選）+ 比較卡 + Learn 掣；亦可以拖招式去格仔。招式有分類 icon 同詳細說明（正式版讀 moves.json effect）。
- **EV 加點**：6 個大格，撳 +1、撳住連加、Undo。
- **紅框數據列**喺背包入面鎖定；Home 鍵平時返主頁（提示轉返直向），戰鬥中 = 返戰鬥畫面。
- **戰鬥中換 Pokémon** 都用呢個三欄版面（取代舊 party 頁），中欄鎖定，左欄揀 → 右欄「Switch in」。
- **轉手機提示頁**：斜紋底 + 中間手機旋轉動畫 + 標題／副題 + 「Play like this anyway」。
- **戰鬥 held item**：現有引擎完全冇 held item 機制，要新增（跟原作效果）。
- **一回合只可以用一次道具**（跟原作）：用道具或者換 Pokémon 都算該回合嘅行動，之後背包同換 Pokémon 鎖到下一回合。
- **戰鬥文字**：背包每個操作（用藥、樹果、Revival、換 Pokémon、攜帶樹果自動食）都要喺戰鬥文字框顯示，PvP 對手畫面都要見到（例如「Ash used a Potion!」→「Gengar recovered 25 HP!」、「Gengar's poison was cured!」、「Gengar ate its Sitrus Berry!」）。
  - 現況：引擎 `BattleState.useItem` 已經會寫 log（「X used a Potion!」→「Y recovered N HP!」），雙方各自模擬所以對手都見到；換 Pokémon 亦有「come back!／withdrew」文字。但 `BattleState.ITEMS` 只有 potion／full-restore，新藥同樹果要逐件補效果同句子，PvP 收到對手 item action 時亦只接受 `ITEMS` 入面有嘅道具。

## 12.1 第 4b 段：攜帶樹果（2026-11-05 實作）

- **攜帶**：背包 Items → 樹果 → 「Hold」→ 撳 Pokémon（拖放照舊 = 餵）。背包數量 −1；原本攜帶嘅道具（樹果／進化石）自動退返背包。server：`hold_berry(p_entry, p_berry)`（null = 拆返）。
- **觸發位**（`BattleState.checkHeld`，雙方客戶端各自模擬，PvP 隊伍序列化帶 `heldItem`）：出招後（目標先、出招者後）、回合末殘留傷害後、上場（帶育成狀態入場會即刻解）、用藥後（過量中毒 → Pecha／Lum）。
- **中招即時**：抗性樹果扣血前減半；Jaboca／Rowap（攻方扣 1/8，目標暈咗都觸發）、Enigma（效果絕佳 → 回 25%）、Kee／Maranga（+1）喺中招後。
- **Custap**：揀出招 + HP ≤ 25% → 回合開始食，同優先度先出手（p1 先 p2 後判斷）。
- **Micle** 下一招命中 ×1.2；**Lansat** 會心 +2（換走清）；**Starf** 隨機一項 +2；升唔到（+6）唔食；HP 滿唔食回血樹果；暈咗唔食。
- **Figy 類**：性格降嗰項能力 = 唔鍾意嗰種味 → 混亂（Figy 攻、Wiki 特攻、Mago 速度、Aguav 特防、Iapapa 防禦）。
- **戰鬥文字**：「X ate its Y Berry!」+ 效果句；戰鬥背包左欄顯示攜帶樹果 icon。
- **完場**：正常完場 `settle_battle_team` 每隻帶 `held_used` → server 只清同一粒 held_item；斷線／中途離開唔扣（同藥一致）。
- **送返大木博士**：攜帶樹果退返背包（`release_to_oak` 更新）。
- 已知限制：`held_item` 仍有 client column grant（進化石 B 方案），理論上可以直寫攜帶樹果唔扣數；要收緊需將進化石攜帶都改經 RPC。

## 12.2 第 4c 段：Mega 進化（2026-11-05 實作）

- **範圍**：Gen 1–5 物種（圖鑑號 ≤ 649）全部有 Mega 石嘅形態 = **70 粒**（46 粒經典 + 24 粒 Legends Z-A 新 Mega，例如 Raichu X／Y、Dragonite、Feraligatr、Garchomp Z）；Rayquaza 冇 Mega 石（靠 Dragon Ascent）唔包。資料由 `tools/fetch_mega.py` 抽 PokéAPI → `js/mega-data.js`。Darkrai／Heatran 嘅 Mega 特性 PokéAPI 未有，暫用原本特性（`abilityGuess`）。
- **掉落**：答題 10/10 → 3% 掉 1 粒；只會掉你擁有物種（任何一隻 entry 嘅 `owned_species`）嘅石；同一物種 X／Y 隨機。server `award_mega`，每日最多抽 30 次。
- **存放**：`user_account.items_mega`（只經 RPC 寫）；背包 Held items tab 顯示持有嘅 Mega 石，詳情有「Mega Evolves A → Mega A」、Mega 屬性、邊個攜帶緊。
- **攜帶**：Give → 撳 Pokémon（拖放都得）；任何 Pokémon 都可以拎住，但只有對應物種先 Mega 到。`hold_item` RPC（樹果同 Mega 石共用；`hold_berry` 變 wrapper）；送返大木博士退返 Mega 石。
- **戰鬥**：FIGHT 頁有 **MEGA** 掣（攜帶對應石 + 今場未用過先出現），撳一下準備，再揀招 → 回合開始、出招之前 Mega 進化（p1 先 p2 後），之後先用 Mega 速度排先後。每場每位訓練家一次；換走都保持 Mega；戰鬥完變返原形（戰鬥用副本）。
- **Mega 效果**：屬性、特性（引擎有實作嘅特性先有效）、HP 以外能力值（同一套 IV／EV／性格重計）、精靈圖（PokeRogue `<dex>-mega[-x|-y|-z]`）；HP 唔變；名唔變。
- **文字**：「Raichu's Raichunite X is reacting to your Key Stone!」→ 閃光 + 換圖 →「Raichu has Mega Evolved into Mega Raichu X!」。PvP：action 帶 `mega: true`，兩邊各自模擬。
- **戰鬥背包**：Mega 石灰色（Can't use this in battle）。AI 訓練家唔會 Mega。

## 13. 待定

- [ ] 第 6 節樹果細節。
- [ ] 原文「可以檢視所有持有的pokemon，用」句尾缺失。
- [ ] Mega 進化係咪戰鬥系統另有鍵位，背包只顯示。
