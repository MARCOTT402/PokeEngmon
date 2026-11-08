# pokeengmon-prototype — 事故原文

## Rule 122 — Prototype 要喺真 app 上面做、用遊戲現有素材同設定位置；交付用 localhost URL，唔好用檔案預覽

- 2026-11-08 battle menu「訓練員卡」（頭像＋勝率＋6 隻隊伍）。第一版我寫咗一頁獨立 HTML（`tools/prototype/battle-menu-trainer-prototype.html`），自己仿 battle menu CSS。
- 用戶回饋：
  1. 改隊應該喺**背包**（已經有 My Team：`st.myTeam`、`BagUI.getTeam()`），唔使喺 battle menu 再整編輯 sheet；打 Trainer 唔使再開揀隊頁。→ 我冇先查設定本身喺邊。
  2. 頭像用咗深色框包住；應該直接用已設定嘅頭像顯示。
  3. 「成個 page 太 AI 味」：圓環圖、漸變卡、emoji，冇 Pokémon 元素。
  4. 「圖片睇唔到」：獨立頁用 `../../assets/` 相對路徑，喺檔案預覽開（唔經 server）就全部爛圖。
  5. 「次次 prototype 用本身遊戲有嘅嘢都做得唔足」—— Rule 118 已經講要高保真，但收埋喺 workflow skill，開工時冇讀到。
- 修正：改用 `tools/prototype/battle-menu/`（build.mjs＋early.js＋proto.css／proto.js，抄 incubator 做法）生成 `battle-menu-app.html`：真 app、真紅框、真 battle menu；人物企喺 `bg-grass.png` 我方草地台、勝率用 `pr-window-1.png` 視窗＋PokeRogueEmerald 字＋HP 色條、隊伍格用背包語言＋`.bag-minihp`＋狀態 icon；「Edit in Bag」開真 `BagUI`；monkeypatch `openTeamSelect` 直接用 My Team 頭 N 隻（跳過 Faint），tier 卡顯示會出場嘅幾隻。
- 過程再踩嘅坑：seed Pikachu Lv34 即刻彈進化；新存檔能量 0 打唔到；`App.init` 會重算能量要開機後先補；抄 `early.js` 之後 incubator 嗰份先加 SW 註銷（Rule 121），要再同步；`@media` 入面 `width` 蓋過 `left`＋`right`，資料框冇冚到對面草地台；深色 tier modal 入面新字對比唔夠。
- 驗證：440×956 同 1280×800 行完整流程（換頭像 → 卡即時更新；Edit in Bag → 背包 → 關返 battle menu；Trainer → tier（顯示出場隻數）→ 直接開戰，`teamEntries = [Charizard]`、揀隊頁冇開）；空隊伍／隊長 Faint／未登入／0 場狀態逐個截圖。
- 結果：新開 `pokeengmon-prototype` skill（本檔），preop 總索引加入題目表，`CLAUDE.md` 開工必讀加一行。

- 第二輪回饋（同日）：隊伍格要顯示 Pokémon 名；人物左上角唔使 CHANGE 掣（撳人物就換）；資料牌嘅名要用用戶名（我 seed 咗「Ash」，用戶以為冇綁 `st.playerName`）；`PvP WIN RATE` 同 `62%` 放同一行；綠色 bar 只係勝率再畫一次、冇意思 → 要計劃用戶等級／PvP 段位；頂部 hero 太厚、info 冇用 → 拎走，PvP／Friends 搬上頂一齊重做。
- 修正：隊伍格加名；拎走 CHANGE；seed 讀本機真存檔嘅 `playerName`／`trainerAvatar`（`__protoRawGet`），冇就用 app 預設名；資料牌改「名 …… Lv」／「PvP WIN RATE …… 62%」／W-L／方案條；hero 收埋，PvP／Friends 原 button 搬上頂改做 `pr-window-1` 戰鬥指令框（紅 ▶ 游標、Poké Ball／訓練員 sprite icon，保留原 id 所以真 click 照用）；方案寫入 `.trae/documents/20261108-trainer-level-plan.md`，dev panel 可切 A Trainer Lv／B PvP Rank／Off。
- 驗證：440×956、1280×800 截圖；撳人物開到 `.avp-box`；console 冇 error。

Skill: Rule 122 added（第二輪更新：數據唔好重複畫、撳得就唔使加掣、示範名用真存檔、隊伍格要有名）
