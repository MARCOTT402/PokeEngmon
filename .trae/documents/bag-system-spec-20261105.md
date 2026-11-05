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
- **待定**：用邊幾款樹果、邊款屬 normal／super、戰鬥效果做幾多、掉落率、舊 food／premium 庫存點換。

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

## 13. 待定

- [ ] 第 6 節樹果細節。
- [ ] 原文「可以檢視所有持有的pokemon，用」句尾缺失。
- [ ] Mega 進化係咪戰鬥系統另有鍵位，背包只顯示。
