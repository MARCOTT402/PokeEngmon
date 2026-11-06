---
name: pokeengmon-preop-checklist
description: Pre-operation index for PokeEngmon. Read first before any edit, SQL, release or UI change — it maps every numbered Rule to the topic skill that now holds it (workflow, supabase, auth, game-data, battle, quiz, ui-sheets, responsive). Grep a Rule number or keyword here, then open the topic skill.
---

# PokeEngmon Pre-Operation Checklist（總索引）

開工前先睇呢份：揀啱題目 skill 再讀。Rule 編號唔變（舊引用照用）；每條 Rule 嘅現行要點喺題目 skill 嘅 `SKILL.md`，事故原文喺該 skill 嘅 `references/incidents.md`。

| 做緊咩 | 讀邊份 | Rule |
|---|---|---|
| release、commit、資產、`sw.js`、browser 跑 state JS、改 SKILL.md、錯誤處理／Guard | `.trae/skills/pokeengmon-workflow/` | 1、6、10、12、25、33、62、70、94、101 |
| SQL／migration、RPC、sync、鑽石／道具／獎勵、防作弊、網絡請求／token、sync queue／本機存檔防損 | `.trae/skills/pokeengmon-supabase/` | 2、3、5、9、11、14、24、54、57、66、75、76、78、96、98 |
| 登入／註冊／登出、Login Gate、Auth UI | `.trae/skills/pokeengmon-auth/` | 8、48、50、51、55、73 |
| 寶可夢／進化資料、本地 state、資料抽取 | `.trae/skills/pokeengmon-game-data/` | 4、13、15、16、18、19、69 |
| 戰鬥、EXP、道具效果、特性、戰鬥測試、數值兜底（NaN） | `.trae/skills/pokeengmon-battle/` | 21、22、61、63、68、79、92、99 |
| 答題、SM-2、結算、鍵盤 | `.trae/skills/pokeengmon-quiz/` | 7、44、71、74、77、93 |
| home sheet、binder、overlay 點擊、手勢、按鈕、icon、場景動畫倍速 | `.trae/skills/pokeengmon-ui-sheets/` | 17、23、28、29、31、32、34、35、36、40、41、49、52、53、56、58、60、64、65、91、95、100 |
| 版面、紅框、safe-area、斷點、overlay 定位、modal／toast、轉機、觸控範圍、版面驗證工具、全鍵盤操作 | `.trae/skills/pokeengmon-responsive/` | 20、26、27、30、37、38、39、42、43、45、46、47、59、67、72、80–90、97 |

- 一份改動跨幾個題目（例如新 overlay＝ui-sheets＋responsive），每份都要讀。
- 新 Rule：編號接最大號；內容入題目 skill（要點入 `SKILL.md`、經過入 `references/incidents.md`），呢度只加標題＋指向，並更新上表（`post-fix-lesson-capture`）。

## Rule 標題（Grep 用）

## Rule 1 — SemVer + semantic-release (do NOT hand-bump for releases)

→ `.trae/skills/pokeengmon-workflow/SKILL.md`（要點）；事故原文 `.trae/skills/pokeengmon-workflow/references/incidents.md`。

## Rule 2 — Supabase upsert requires `Prefer: resolution=merge-duplicates`

→ `.trae/skills/pokeengmon-supabase/SKILL.md`（要點）；事故原文 `.trae/skills/pokeengmon-supabase/references/incidents.md`。

## Rule 3 — `uuid` columns need valid UUIDs

→ `.trae/skills/pokeengmon-supabase/SKILL.md`（要點）；事故原文 `.trae/skills/pokeengmon-supabase/references/incidents.md`。

## Rule 4 — `chain_key` format: frontend uses chain names, NOT `dex_<id>`

→ `.trae/skills/pokeengmon-game-data/SKILL.md`（要點）；事故原文 `.trae/skills/pokeengmon-game-data/references/incidents.md`。

## Rule 5 — Sensitive state changes go through RPCs, not pushState

→ `.trae/skills/pokeengmon-supabase/SKILL.md`（要點）；事故原文 `.trae/skills/pokeengmon-supabase/references/incidents.md`。

## Rule 6 — Commit when asked; Conventional Commits; release via CI

→ `.trae/skills/pokeengmon-workflow/SKILL.md`（要點）；事故原文 `.trae/skills/pokeengmon-workflow/references/incidents.md`。

## Rule 7 — SM-2 sessions only pull DUE cards

→ `.trae/skills/pokeengmon-quiz/SKILL.md`（要點）；事故原文 `.trae/skills/pokeengmon-quiz/references/incidents.md`。

## Rule 8 — Google OAuth: in-app sign out ≠ Google sign out

→ `.trae/skills/pokeengmon-auth/SKILL.md`（要點）；事故原文 `.trae/skills/pokeengmon-auth/references/incidents.md`。

## Rule 9 — plpgsql RPC: variable names must NEVER collide with column names

→ `.trae/skills/pokeengmon-supabase/SKILL.md`（要點）；事故原文 `.trae/skills/pokeengmon-supabase/references/incidents.md`。

## Rule 10 — Service Worker fetch handler must skip non-http(s) schemes

→ `.trae/skills/pokeengmon-workflow/SKILL.md`（要點）；事故原文 `.trae/skills/pokeengmon-workflow/references/incidents.md`。

## Rule 11 — Import/Export save feature was removed (v107); import_state is one-shot and server-clamped (v106)

→ `.trae/skills/pokeengmon-supabase/SKILL.md`（要點）；事故原文 `.trae/skills/pokeengmon-supabase/references/incidents.md`。

## Rule 12 — Adding/replacing ANY asset? Check the copyright claims

→ `.trae/skills/pokeengmon-workflow/SKILL.md`（要點）；事故原文 `.trae/skills/pokeengmon-workflow/references/incidents.md`。

## Rule 13 — `EVOLUTION_CHAINS` is an array

→ `.trae/skills/pokeengmon-game-data/SKILL.md`（要點）；事故原文 `.trae/skills/pokeengmon-game-data/references/incidents.md`。

## Rule 14 — Sync.pull: normalize `dex_*` BEFORE collecting gens

→ `.trae/skills/pokeengmon-supabase/SKILL.md`（要點）；事故原文 `.trae/skills/pokeengmon-supabase/references/incidents.md`。

## Rule 15 — Defensive defaults that have bitten us

→ `.trae/skills/pokeengmon-game-data/SKILL.md`（要點）；事故原文 `.trae/skills/pokeengmon-game-data/references/incidents.md`。

## Rule 16 — Audio volume prefs are a separate localStorage key (v145) + three-channel taxonomy

→ `.trae/skills/pokeengmon-game-data/SKILL.md`（要點）；事故原文 `.trae/skills/pokeengmon-game-data/references/incidents.md`。

## Rule 17 — Feature hubs must close when clicking outside

→ `.trae/skills/pokeengmon-ui-sheets/SKILL.md`（要點）；事故原文 `.trae/skills/pokeengmon-ui-sheets/references/incidents.md`。

## Rule 18 — Derived fields (moves / knownMoves / level / stats) depend on POKEMON_DEX — NEVER compute pre-dex

→ `.trae/skills/pokeengmon-game-data/SKILL.md`（要點）；事故原文 `.trae/skills/pokeengmon-game-data/references/incidents.md`。

## Rule 19 — Re-collection after full evolution uses `is_final`; move loadouts are local-only

→ `.trae/skills/pokeengmon-game-data/SKILL.md`（要點）；事故原文 `.trae/skills/pokeengmon-game-data/references/incidents.md`。

## Rule 20 — Browser automation silently mis-fires when the IDE preview window is 0×0

→ 已整合入 `.trae/skills/pokeengmon-responsive/SKILL.md` 正文 §12；完整事故原文見 `.trae/skills/pokeengmon-responsive/references/incidents.md`（Rule 20）。

## Rule 21 — Hand-made battle anims: verify in slow-mo; never emit an empty frame 0

→ `.trae/skills/pokeengmon-battle/SKILL.md`（要點）；事故原文 `.trae/skills/pokeengmon-battle/references/incidents.md`。

## Rule 22 — The "fainted → skip action" guard in `runTurnResolution` must not swallow switch actions

→ `.trae/skills/pokeengmon-battle/SKILL.md`（要點）；事故原文 `.trae/skills/pokeengmon-battle/references/incidents.md`。

## Rule 23 — A class with `display:flex` defeats the `hidden` attribute; visible-by-default lists don't need a reveal tap

→ `.trae/skills/pokeengmon-ui-sheets/SKILL.md`（要點）；事故原文 `.trae/skills/pokeengmon-ui-sheets/references/incidents.md`。

## Rule 24 — plpgsql block terminators: `IF` ends with `end if;`, only the function body ends with `end;`

→ `.trae/skills/pokeengmon-supabase/SKILL.md`（要點）；事故原文 `.trae/skills/pokeengmon-supabase/references/incidents.md`。

## Rule 25 — 撞板／被修正之後，同一輪就要寫入 skill（唔准等用戶開口）

→ `.trae/skills/pokeengmon-workflow/SKILL.md`（要點）；事故原文 `.trae/skills/pokeengmon-workflow/references/incidents.md`。

## Rule 26 — Headless Chrome 截手機版圖：`--window-size` 出唔到 375×667，要用 CDP `Emulation.setDeviceMetricsOverride`

→ 已整合入 `.trae/skills/pokeengmon-responsive/SKILL.md` 正文 §12；完整事故原文見 `.trae/skills/pokeengmon-responsive/references/incidents.md`（Rule 26）。

## Rule 27 — Grid 列數必須等於實際子元素數；`env(safe-area-*)` 用 `padding` 吸收，不要當成 grid row

→ 已整合入 `.trae/skills/pokeengmon-responsive/SKILL.md` 正文 §4；完整事故原文見 `.trae/skills/pokeengmon-responsive/references/incidents.md`（Rule 27）。

## Rule 28 — 手寫 SVG 圖示一定要帶 `fill` 或 `stroke`，否則變黑塊或完全隱形

→ `.trae/skills/pokeengmon-ui-sheets/SKILL.md`（要點）；事故原文 `.trae/skills/pokeengmon-ui-sheets/references/incidents.md`。

## Rule 29 — 唔好對「按鈕本身」寫 textContent；圖鑑總數用 `TOTAL_SPECIES`

→ `.trae/skills/pokeengmon-ui-sheets/SKILL.md`（要點）；事故原文 `.trae/skills/pokeengmon-ui-sheets/references/incidents.md`。

## Rule 30 — 手機尺寸基準與本地預覽（iPhone 17 Pro Max）

→ 已整合入 `.trae/skills/pokeengmon-responsive/SKILL.md` 正文 §2；完整事故原文見 `.trae/skills/pokeengmon-responsive/references/incidents.md`（Rule 30）。

## Rule 31 — `_closeAllSheets()` 唔好立即設 `hidden=true`，要等 transform 動畫跑完

→ `.trae/skills/pokeengmon-ui-sheets/SKILL.md`（要點）；事故原文 `.trae/skills/pokeengmon-ui-sheets/references/incidents.md`。

## Rule 32 — Render 函數新增選項後，要審查所有「內部再 render」入口

→ `.trae/skills/pokeengmon-ui-sheets/SKILL.md`（要點）；事故原文 `.trae/skills/pokeengmon-ui-sheets/references/incidents.md`。

## Rule 33 — 「冇彈／有彈」類投訴，先確認邊個才係想要嘅行為，唔好自作聰明移除功能

→ `.trae/skills/pokeengmon-workflow/SKILL.md`（要點）；事故原文 `.trae/skills/pokeengmon-workflow/references/incidents.md`。

## Rule 34 — 手勢（swipe / drag）實作要點

→ `.trae/skills/pokeengmon-ui-sheets/SKILL.md`（要點）；事故原文 `.trae/skills/pokeengmon-ui-sheets/references/incidents.md`。

## Rule 35 — sheet 內 click handler 即時 re-render 會令 document click 誤關 sheet

→ `.trae/skills/pokeengmon-ui-sheets/SKILL.md`（要點）；事故原文 `.trae/skills/pokeengmon-ui-sheets/references/incidents.md`。

## Rule 36 — sheet compact → full 要共用同一個頂部 unit，唔好各整一份

→ `.trae/skills/pokeengmon-ui-sheets/SKILL.md`（要點）；事故原文 `.trae/skills/pokeengmon-ui-sheets/references/incidents.md`。

## Rule 37 — 唔好假設 `env(safe-area-inset-top)` 一定大過 0；負 offset 元素要畀 shell 留白下限

→ 已整合入 `.trae/skills/pokeengmon-responsive/SKILL.md` 正文 §4、§12；完整事故原文見 `.trae/skills/pokeengmon-responsive/references/incidents.md`（Rule 37）。

## Rule 38 — preview 工具 `--js`：`const` 全域（Gacha/App/Quiz）唔喺 `window` 上，要 click 真掣或 iframe `eval`

→ 已整合入 `.trae/skills/pokeengmon-responsive/SKILL.md` 正文 §12；完整事故原文見 `.trae/skills/pokeengmon-responsive/references/incidents.md`（Rule 38）。

## Rule 39 — display-window overlay 四個角都要圓角（唔好只修被投訴嗰個角）

→ 已整合入 `.trae/skills/pokeengmon-responsive/SKILL.md` 正文 §4；完整事故原文見 `.trae/skills/pokeengmon-responsive/references/incidents.md`（Rule 39）。

## Rule 40 — body 級 overlay 要豁免「點外面關 sheet」全域 handler

→ `.trae/skills/pokeengmon-ui-sheets/SKILL.md`（要點）；事故原文 `.trae/skills/pokeengmon-ui-sheets/references/incidents.md`。

## Rule 41 — 關 sheet 有兩條路徑：改一條就要同步另一條

→ `.trae/skills/pokeengmon-ui-sheets/SKILL.md`（要點）；事故原文 `.trae/skills/pokeengmon-ui-sheets/references/incidents.md`。

## Rule 42 — flex column 容器做滾動區：子項要 flex: none，否則被壓扁

→ 已整合入 `.trae/skills/pokeengmon-responsive/SKILL.md` 正文 §7；完整事故原文見 `.trae/skills/pokeengmon-responsive/references/incidents.md`（Rule 42）。

## Rule 43 — display-window overlay 定位要對齊 .pd-screen2（計埋佢嘅 margin:6px）

→ 已整合入 `.trae/skills/pokeengmon-responsive/SKILL.md` 正文 §4；完整事故原文見 `.trae/skills/pokeengmon-responsive/references/incidents.md`（Rule 43）。

## Rule 44 — 刪結算頁按鈕前必查 Gym conclude 依賴

→ `.trae/skills/pokeengmon-quiz/SKILL.md`（要點）；事故原文 `.trae/skills/pokeengmon-quiz/references/incidents.md`。

## Rule 45 — 將全頁 view 收入 display window：height:auto + 內部 fixed 轉 absolute

→ 已整合入 `.trae/skills/pokeengmon-responsive/SKILL.md` 正文 §4；完整事故原文見 `.trae/skills/pokeengmon-responsive/references/incidents.md`（Rule 45）。

## Rule 46 — 全域 popup（modal／toast）要貼 display window 頂部，z-index 要高過 view overlay

→ 已整合入 `.trae/skills/pokeengmon-responsive/SKILL.md` 正文 §4、§8；完整事故原文見 `.trae/skills/pokeengmon-responsive/references/incidents.md`（Rule 46）。

## Rule 47 — position:fixed overlays 必須：bezel/chin z-index 高過佢哋；exit 動畫跟 Settings sheet 一樣

→ 已整合入 `.trae/skills/pokeengmon-responsive/SKILL.md` 正文 §4；完整事故原文見 `.trae/skills/pokeengmon-responsive/references/incidents.md`（Rule 47）。

## Rule 48 — Email sign up / sign in 後必須觸發 Learning Curve Mode 設定

→ `.trae/skills/pokeengmon-auth/SKILL.md`（要點）；事故原文 `.trae/skills/pokeengmon-auth/references/incidents.md`。

## Rule 49 — Duolingo 風格按鈕動畫：pressed 彈出 + hover lift + vibration

→ `.trae/skills/pokeengmon-ui-sheets/SKILL.md`（要點）；事故原文 `.trae/skills/pokeengmon-ui-sheets/references/incidents.md`。

## Rule 50 — Supabase Auth：Email provider + Manual Linking + Automatic Linking

→ `.trae/skills/pokeengmon-auth/SKILL.md`（要點）；事故原文 `.trae/skills/pokeengmon-auth/references/incidents.md`。

## Rule 51 — Login Gate：未登入必須彈，sign out / OAuth cancel 後要自動再彈

→ `.trae/skills/pokeengmon-auth/SKILL.md`（要點）；事故原文 `.trae/skills/pokeengmon-auth/references/incidents.md`。

## Rule 52 — binder / dockBinder token cancel pattern：先 showView，再 bump 自己 token

→ `.trae/skills/pokeengmon-ui-sheets/SKILL.md`（要點）；事故原文 `.trae/skills/pokeengmon-ui-sheets/references/incidents.md`。

## Rule 53 — 由結算／display-window overlay 開 home sheet：唔可以用 `view-home.active` 做判斷

→ `.trae/skills/pokeengmon-ui-sheets/SKILL.md`（要點）；事故原文 `.trae/skills/pokeengmon-ui-sheets/references/incidents.md`。

## Rule 54 — 新增可寫 column 必須同一份 migration 加 column-level grant

→ `.trae/skills/pokeengmon-supabase/SKILL.md`（要點）；事故原文 `.trae/skills/pokeengmon-supabase/references/incidents.md`。

## Rule 55 — 每個 auth 入口頁都要有 Google 選項；唔可以只喺 Login Hub 提供

→ `.trae/skills/pokeengmon-auth/SKILL.md`（要點）；事故原文 `.trae/skills/pokeengmon-auth/references/incidents.md`。

## Rule 56 — 換進度條星星做動畫跑手：sprite sheet 化 + `flex: none` + 光暈 + 邊界淨空

→ `.trae/skills/pokeengmon-ui-sheets/SKILL.md`（要點）；事故原文 `.trae/skills/pokeengmon-ui-sheets/references/incidents.md`。

## Rule 57 — 10 連抽：`chain_rarity` 有 normal、保底查詢要排除；MCP 唔可以偽造 `auth.uid()`

→ `.trae/skills/pokeengmon-supabase/SKILL.md`（要點）；事故原文 `.trae/skills/pokeengmon-supabase/references/incidents.md`。

## Rule 58 — `_prompt()` 用 textContent：唔可以傳含 SVG 嘅字串

→ `.trae/skills/pokeengmon-ui-sheets/SKILL.md`（要點）；事故原文 `.trae/skills/pokeengmon-ui-sheets/references/incidents.md`。

## Rule 59 — preview 工具卡死：先 kill 殘留 CDP Chrome，再換 `--port`

→ 已整合入 `.trae/skills/pokeengmon-responsive/SKILL.md` 正文 §12；完整事故原文見 `.trae/skills/pokeengmon-responsive/references/incidents.md`（Rule 59）。

## Rule 60 — 掛喺 body 嘅 overlay 必須 `stopPropagation`，否則 sheet 外部點擊 handler 會誤關

→ `.trae/skills/pokeengmon-ui-sheets/SKILL.md`（要點）；事故原文 `.trae/skills/pokeengmon-ui-sheets/references/incidents.md`。

## Rule 61 — 戰鬥 EXP：battle pokemon 必須帶 `uid`，分配只計「存活 + participated」；Level Sync 只降唔升

→ `.trae/skills/pokeengmon-battle/SKILL.md`（要點）；事故原文 `.trae/skills/pokeengmon-battle/references/incidents.md`。

## Rule 62 — 喺 Browser pane 跑會改 state 嘅 JS 之前，一定要 assert `location.host` 係 localhost

→ `.trae/skills/pokeengmon-workflow/SKILL.md`（要點）；事故原文 `.trae/skills/pokeengmon-workflow/references/incidents.md`。

## Rule 63 — 一件道具有「育成效果」同「戰鬥效果」兩套：使用路徑一定要按場景分支，兩邊都要測

→ `.trae/skills/pokeengmon-battle/SKILL.md`（要點）；事故原文 `.trae/skills/pokeengmon-battle/references/incidents.md`。

## Rule 64 — 同時跑幾個 setInterval／setTimeout 動畫：每個用自己嘅 local handle，唔好共用一個變數

→ `.trae/skills/pokeengmon-ui-sheets/SKILL.md`（要點）；事故原文 `.trae/skills/pokeengmon-ui-sheets/references/incidents.md`。

## Rule 65 — 喺有 Rule 60 stopPropagation 嘅 overlay 入面做拖放：pointermove／pointerup 要掛 window capture

→ `.trae/skills/pokeengmon-ui-sheets/SKILL.md`（要點）；事故原文 `.trae/skills/pokeengmon-ui-sheets/references/incidents.md`。

## Rule 66 — 「共用池」數值存喺個別 row：刪 row 之前要將佢嗰份搬走

→ `.trae/skills/pokeengmon-supabase/SKILL.md`（要點）；事故原文 `.trae/skills/pokeengmon-supabase/references/incidents.md`。

## Rule 67 — 將現有 view 搬入另一個容器（例如橫向紅框）：要清走佢原本嘅定位 CSS

→ 已整合入 `.trae/skills/pokeengmon-responsive/SKILL.md` 正文 §4；完整事故原文見 `.trae/skills/pokeengmon-responsive/references/incidents.md`（Rule 67）。

## Rule 68 — 戰鬥測試：名唔好寫死、推進文字要撳 `.battle-bottom`、回合完 = 選單打開

→ `.trae/skills/pokeengmon-battle/SKILL.md`（要點）；事故原文 `.trae/skills/pokeengmon-battle/references/incidents.md`。

## Rule 69 — 由外部 API 抽遊戲資料：唔好靠單一關聯欄位；列出 skip 清單逐條核對

→ `.trae/skills/pokeengmon-game-data/SKILL.md`（要點）；事故原文 `.trae/skills/pokeengmon-game-data/references/incidents.md`。

## Rule 70 — 手砌 staged blob／改 SKILL.md：行尾要跟 repo blob（LF），唔好由工作檔抄 CRLF

→ `.trae/skills/pokeengmon-workflow/SKILL.md`（要點）；事故原文 `.trae/skills/pokeengmon-workflow/references/incidents.md`。

## Rule 71 — 答題 App 鍵盤版面係用戶指定：提示左上、Voice mode 右上、Submit／Next 右下

→ `.trae/skills/pokeengmon-quiz/SKILL.md`（要點）；事故原文 `.trae/skills/pokeengmon-quiz/references/incidents.md`。

## Rule 72 — 圖片題：張圖要用「剩餘高度」縮放，唔可以用固定／dvh 高度；iPhone 打開就要見到輸入格

→ 已整合入 `.trae/skills/pokeengmon-responsive/SKILL.md` 正文 §7；完整事故原文見 `.trae/skills/pokeengmon-responsive/references/incidents.md`（Rule 72）。

## Rule 73 — Auth UI v2：單一卡片 + Create/Sign in tab；表單一定要俾 Password Manager 用、input 16px

→ `.trae/skills/pokeengmon-auth/SKILL.md`（要點）；事故原文 `.trae/skills/pokeengmon-auth/references/incidents.md`。

## Rule 74 — 答題空格：顯示字同透明 input 嘅字型（字重、字距、size、family）一定要一致，否則浮標越打越向左移

→ `.trae/skills/pokeengmon-quiz/SKILL.md`（要點）；事故原文 `.trae/skills/pokeengmon-quiz/references/incidents.md`。

## Rule 75 — 新 JS module：`const X` 要掛 `window.X`；`SupabaseAuth._rpc` 會食 error 同拆 array；防作弊資料唔好放 `battles`

→ `.trae/skills/pokeengmon-supabase/SKILL.md`（要點）；事故原文 `.trae/skills/pokeengmon-supabase/references/incidents.md`。

## Rule 76 — 「有冇登入」用 `SupabaseAuth.isLoggedIn()`，唔好用 `Sync.isEnabled()`；server 退道具時本地唔好再加

→ `.trae/skills/pokeengmon-supabase/SKILL.md`（要點）；事故原文 `.trae/skills/pokeengmon-supabase/references/incidents.md`。

## Rule 77 — 揀多個單元／子單元答題：成個到期 pool 先 Fisher-Yates 洗勻再抽，唔好「過期最耐優先」或 `sort(random)`

→ `.trae/skills/pokeengmon-quiz/SKILL.md`（要點）；事故原文 `.trae/skills/pokeengmon-quiz/references/incidents.md`。

## Rule 78 — 防作弊收權：新 RPC 上線要 revoke 舊版；table-level revoke 會連 column grant 一齊收

→ `.trae/skills/pokeengmon-supabase/SKILL.md`（要點）；事故原文 `.trae/skills/pokeengmon-supabase/references/incidents.md`。

## Rule 79 — 新 Mega 特性：去 Pokémon Champions 資料搵效果；`statLabel` 只收 PokeAPI stat 名

→ `.trae/skills/pokeengmon-battle/SKILL.md`（要點）；事故原文 `.trae/skills/pokeengmon-battle/references/incidents.md`。

## Rule 80 — 響應式驗證：headless 觸控模擬會「黐住」；Browser pane resize 唔派 resize／matchMedia 事件

→ 已整合入 `.trae/skills/pokeengmon-responsive/SKILL.md` 正文 §12；完整事故原文見 `.trae/skills/pokeengmon-responsive/references/incidents.md`（Rule 80）。

## Rule 81 — display-window overlay 定位只准用 `--frame-screen-*`；寫死 `width:100%; max-width:428px` 喺 < 440 闊手機會凸出紅框

→ 已整合入 `.trae/skills/pokeengmon-responsive/SKILL.md` 正文 §4；完整事故原文見 `.trae/skills/pokeengmon-responsive/references/incidents.md`（Rule 81）。

## Rule 82 — 主頁拍檔卡喺矮視窗要可以縮；驗收一定要包矮尺寸（1000×500）

→ 已整合入 `.trae/skills/pokeengmon-responsive/SKILL.md` 正文 §7；完整事故原文見 `.trae/skills/pokeengmon-responsive/references/incidents.md`（Rule 82）。

## Rule 83 — wide 雙欄：右欄 = `.ph-sheets`，overlay 要同佢 rect 一致；左欄闊用固定分段，唔好用 %

→ 已整合入 `.trae/skills/pokeengmon-responsive/SKILL.md` 正文 §6；完整事故原文見 `.trae/skills/pokeengmon-responsive/references/incidents.md`（Rule 83）。

## Rule 84 — wide 右欄常駐 sheet：所有「有冇 sheet 開住」嘅判斷都要排除 `data-wide-default`；`ph-open` 唔可以喺 rAF 補落已 hidden 嘅 sheet

→ 已整合入 `.trae/skills/pokeengmon-responsive/SKILL.md` 正文 §6；完整事故原文見 `.trae/skills/pokeengmon-responsive/references/incidents.md`（Rule 84）。

## Rule 85 — wide 左欄喺 overlay 開住時仍然撳得：鎖要包左欄（inert）；Gym 結算要鎖 bezel＋左欄；任務板喺 sheet 入面都要當「開住」

→ 已整合入 `.trae/skills/pokeengmon-responsive/SKILL.md` 正文 §6；完整事故原文見 `.trae/skills/pokeengmon-responsive/references/incidents.md`（Rule 85）。

## Rule 86 — 響應式 @media 區塊喺檔案前面：覆寫後面嘅基礎規則要加 specificity；兩欄高度互不影響要用 wrapper，唔好硬用 grid areas

→ 已整合入 `.trae/skills/pokeengmon-responsive/SKILL.md` 正文 §11；完整事故原文見 `.trae/skills/pokeengmon-responsive/references/incidents.md`（Rule 86）。

## Rule 87 — 「要唔要轉機」只問 `App.layout()`：手機直向先轉 90°；手機橫向先提示轉返直；唔好用 innerWidth/innerHeight 比較或 `<= 1000`

→ 已整合入 `.trae/skills/pokeengmon-responsive/SKILL.md` 正文 §9；完整事故原文見 `.trae/skills/pokeengmon-responsive/references/incidents.md`（Rule 87）。

## Rule 88 — 擴大觸控範圍唔改外觀：用透明 `::after`；元素有 `overflow:hidden` 就改用父層點擊轉交；量度要用 hit-test

→ 已整合入 `.trae/skills/pokeengmon-responsive/SKILL.md` 正文 §10；完整事故原文見 `.trae/skills/pokeengmon-responsive/references/incidents.md`（Rule 88）。

## Rule 89 — overlay 基礎規則嘅 `max-width` 要喺 `.active` 覆寫；canvas 場景跟 overlay 變闊要 resize＋加闊內容

→ 已整合入 `.trae/skills/pokeengmon-responsive/SKILL.md` 正文 §4；完整事故原文見 `.trae/skills/pokeengmon-responsive/references/incidents.md`（Rule 89）。

## Rule 90 — 固定 px 設計嘅遊戲畫面（戰鬥）喺大屏要「固定畫布＋等比例 scale」，唔好拉闊舞台；JS 座標用 offset

→ 已整合入 `.trae/skills/pokeengmon-responsive/SKILL.md` 正文 §4；完整事故原文見 `.trae/skills/pokeengmon-responsive/references/incidents.md`（Rule 90）。

## Rule 91 — 重構拆 DOM 時，被保留／搬去 sheet 嘅元素，佢嘅 render 寫入要一齊搬；唔好沿用舊 id 而冇人寫

→ 已整合入 `.trae/skills/pokeengmon-ui-sheets/SKILL.md` 正文 Rules；完整事故原文見 `.trae/skills/pokeengmon-ui-sheets/references/incidents.md`（Rule 91）。

## Rule 92 — 暈咗之後嘅強制換寵係免費（對手唔可以白打一下）；自己揀換寵照計回合；Shift 免費

→ 已整合入 `.trae/skills/pokeengmon-battle/SKILL.md`；完整事故原文見 `.trae/skills/pokeengmon-battle/references/incidents.md`（Rule 92）。

## Rule 93 — SM-2 storage：唔好逐題 parse／寫成個 cards blob；buildSession 讀一次快取，唔好為成個 pool 建卡

→ `.trae/skills/pokeengmon-quiz/SKILL.md`（要點）；事故原文 `.trae/skills/pokeengmon-quiz/references/incidents.md`。

## Rule 94 — Guard 全域錯誤邊界：新 code 唔准令畫面白屏或卡死；async 掣用 `Guard.asyncClick`；資料檔 GET 用 `Guard.fetchGet`；開機失敗一定落 `Guard.fatal`

→ `.trae/skills/pokeengmon-workflow/SKILL.md`（要點）；事故原文 `.trae/skills/pokeengmon-workflow/references/incidents.md`。

## Rule 95 — 全域動畫倍速（GSAP `globalTimeline.timeScale`／`--anim-spd`）：場景所有結束同中斷路徑都要還原；用戶互動唔跟倍速

→ `.trae/skills/pokeengmon-ui-sheets/SKILL.md`（要點）；事故原文 `.trae/skills/pokeengmon-ui-sheets/references/incidents.md`。

## Rule 96 — 網絡請求一律經 `Net.request`／`SupabaseAuth.authedFetch`：有 timeout、token 自動續期（single-flight）、401 refresh 一次再試；POST／RPC 唔自動重試

→ `.trae/skills/pokeengmon-supabase/SKILL.md`（要點）；事故原文 `.trae/skills/pokeengmon-supabase/references/incidents.md`。

## Rule 97 — 全鍵盤操作（`js/keys.js`）：方向鍵空間導航要認啱當前情境（overlay > sheet > view）；舊 Enter／Esc 預設要讓位畀焦點掣；開關 overlay 要放／還焦點

→ `.trae/skills/pokeengmon-responsive/SKILL.md` §10（要點）；事故原文 `.trae/skills/pokeengmon-responsive/references/incidents.md`。

## Rule 98 — 本機資料唔准靜靜冇咗：sync queue 要持久化＋backoff＋毒批丟棄＋keepalive；存檔讀唔到要先備份；寫唔落要話用戶知；離線用 pill 提示

→ `.trae/skills/pokeengmon-supabase/SKILL.md`（要點）；事故原文 `.trae/skills/pokeengmon-supabase/references/incidents.md`。

## Rule 99 — 數值兜底：NaN 同任何數比較都係 false — 傷害／HP／比例／幾何／存檔計數一定要喺入口夾成有限值；`Math.max(1, NaN)` 都係 NaN

→ `.trae/skills/pokeengmon-battle/SKILL.md`（要點）；事故原文 `.trae/skills/pokeengmon-battle/references/incidents.md`。

## Rule 100 — Sheet 切換同時進行（220ms）、overlay exit 200ms：時長集中喺 `App.SHEET_MS／SHEET_SWAP_MS／OVERLAY_EXIT_MS`；close cleanup 只收冇 `ph-open` 嘅 sheet

→ `.trae/skills/pokeengmon-ui-sheets/SKILL.md`（要點）；事故原文 `.trae/skills/pokeengmon-ui-sheets/references/incidents.md`。

## Rule 101 — 開機唔載用唔著嘅大檔：戰鬥 BGM idle 預載、隱藏 sheet 嘅大圖 `loading=lazy`、題目圖片用 `index.json` 清單唔好逐個副檔名試

→ `.trae/skills/pokeengmon-workflow/SKILL.md`（要點）；事故原文 `.trae/skills/pokeengmon-workflow/references/incidents.md`。
