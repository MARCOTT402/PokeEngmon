# Import/Export Save 安全收口（v103）

## Context

用戶提出審計問題：「import/export save 會否係一個漏洞？用戶先用修改好嘅 import data，再同步 Google account」。

**審計結論：係一個「殘餘、有上限」嘅漏洞。** 攻擊路徑成立：篡改 save JSON → 本地 import → 連接**新** Google 帳戶 → `import_state` RPC 上傳本地進度。v99 已喺服務端 clamp（diamonds ≤200、entries ≤200、exp ≤1.3M/隻、IV/EV/candies 合法範圍），並 guard 只限無進度新帳戶。但：

1. **殘餘作弊面**：每開一個新 Google 帳戶，篡改 save 可換到「200 鑽（≈66 次稀有抽）+ 最多 200 隻近滿級寶可夢（MAX_LEVEL=99 最慢曲線僅需 ≈1.21M EXP，1.3M cap ≈ 滿級）+ 每隻 999 糖」。無 rate limit、無 audit log、可無限換帳重複。
2. **正版用戶誤傷**：匿名玩咗好耐嘅正版用戶首次連接時，>200 鑽同滿級 EXP 嘅合法累積同樣被 clamp。
3. 已免疫嘅部分（無需改動）：現有帳戶 import 篡改數據不會上雲（`import_state` guard + `pushState` 只推 trainer_name + `Sync.pull` 單向覆蓋本地）；本地篡改鑽石過唔到 `gachaPull` 服務端餘額驗證。

**核心矛盾**：任何 client 上傳嘅數值都無法驗證真偽。收緊 = 正版匿名用戶首次連接失去更多；唔收 = 接受 bounded cheat。採用「中度收緊」：貨幣（鑽石）唔過信任邊界，學習進度（寶可夢/EXP/SM-2）保住但貼住合法上限。

**影響評估**：單機 edu app、無排行榜/交易/真錢價值，作弊僅損害作弊者自己。今次收口屬原則性加固，非緊急事故。

## 改動內容

### 1. 新增 SQL migration：`supabase-migrate-20261024d-import-tightening.sql`

遵循專案規則（獨立遷移檔、僅含本次內容、REPLACE 後重設權限）：

**a) `import_state(payload jsonb)` 收緊（CREATE OR REPLACE 現有函數）：**
- **diamonds 唔過界**：忽略 client 傳入值，固定派 **20 粒 welcome bonus**（`diamonds = 20`）。呢個係今次最關鍵嘅改動——貨幣永遠唔接受 client 輸入。
- **entries 上限 200 → 151**（每物種一隻已係合法天花板，dupes 由 dupes 欄位表達）。
- **exp cap 1,300,000 → 1,250,000**（略高於 99 級最慢曲線 ≈1,212,874，杜絕超額 headroom）。
- **candies cap 999 → 99**；**dupes cap 999 → 100**（stars 顯示 20 dupes 已封頂，100 屬慷慨）。
- IV 0-31、EV 單項 0-252、ev_points ≤510、`chain_rarity` 合法性檢查、`total_sets/total_correct/total_questions` clamp ≥0 —— 全部**維持不變**。
- **一次性語義加強**：`user_account` 新增 `imported_at bigint` 欄位；`import_state` 開頭檢查 `acct.imported_at is not null → raise exception 'import already used'`，成功後寫入 `imported_at`。即使進度計數將來被點樣歸零，import 都係每帳戶一生一次。
- 函數收尾維持 `revoke execute from public, anon; grant execute to authenticated;`。

**b) 新增 audit 表 `user_imports`：**
```sql
create table if not exists user_imports (
  id bigint generated always as identity primary key,
  account_id uuid not null references auth.users(id) on delete cascade,
  imported_at bigint not null,
  entry_count int not null,
  diamonds_granted int not null
);
alter table user_imports enable row level security;
-- 無 anon/authenticated 直寫；只有 SECURITY DEFINER 嘅 import_state 寫入
-- 讀：用戶可讀自己（debug 用，可選）
```
`import_state` 成功後 insert 一行（account_id、imported_at、entry_count、diamonds_granted=20），供日後濫用追查。

**c) `ALTER TABLE user_account ADD COLUMN IF NOT EXISTS imported_at bigint;`** —— 注意放喺任何引用呢個欄位嘅語句**之前**（v99 學過嘅 42703 教訓）。

### 2. 前端改動（`js/app.js`，約 L1001-1032）

- 更新 post-login 註釋，反映新 server 規則（diamonds 固定 20、entries ≤151、exp ≤1.25M）。
- payload 維持原樣照傳（server 權威忽略 diamonds），**唔加** client-side clamp（可被繞過且無安全價值，保持簡單）。
- Login Hub 匿名狀態提示文案加一句：`"Sign in transfers your Pokémon & learning progress; diamonds become a fresh 20💎 welcome bonus."`——等正版用戶有預期，唔會連接後先發現鑽石變咗。

### 3. 版本號三處同步（SKILL 規則）

- `js/app.js` `APP_VERSION` → `103`
- `sw.js` `CACHE_NAME` → `pokeengmon-v103`
- `index.html` 所有 `?v=` 參數 → `103`

### 4. 部署

- commit + push main（GitHub Pages 自動部署）。
- **手動**喺 Supabase SQL Editor 執行新 migration 檔（前端改動喺 migration 執行前向後兼容：舊 server 函數仍接受 payload，只係未收緊）。

## 明確唔做（Out of Scope）

- **相鄰 RPC 漏洞另開任務**（今次發現、同屬攻擊面但與 import 無關）：
  - `obtain_capture(chain_key, dex_id)` 無驗證用戶真係完成過答題回合 → 可無限刷全 normal 物種 + dupes/ev_points。
  - `add_entry_exp(entry_id, delta)` 每次 ≤10000 但無 rate limit → loop call 灌滿任何 entry。
  - `award_round_diamonds(score, total)` 疑似無回合真實性驗證 → 可能可直接 call (10,10) 刷鑽。**呢個其實比 import 洞更直接，建議下個任務優先處理。**
- SM-2 cards/history 維持 client 可寫（學習數據，篡改僅自欺，屬設計取捨）。
- 本地單機篡改（devtools 改 localStorage）屬接受風險，單機 edu app 無法亦無需根治。

## Verification

1. **SQL 語法**：Supabase SQL Editor 分段執行新 migration，確認無 42703/權限報錯。
2. **篡改攻擊測試**（browser）：export save → 改 `diamonds: 999999`、加假 entries（exp 9e9、candies 9999）→ import → 連接**全新** Google 帳戶 → 檢查 Supabase：`user_account.diamonds = 20`（唔係 200/999999）、entries ≤151 且 exp ≤1.25M、`imported_at` 已寫入、`user_imports` 多咗一行。
3. **重複 import 測試**：同一帳戶再觸發一次 import_state → 預期 exception `import already used`。
4. **現有帳戶免疫**：有進度帳戶連接 → import_state 拒絕 → `Sync.pull` 後雲端權威值覆蓋本地篡改值。
5. **正版路徑回歸**：匿名玩幾個回合 → 連接新 Google 帳 → 寶可夢/EXP/SM-2 進度保留，鑽石顯示 20（預期內行為改變），Login Hub 文案正確顯示。
6. **離線回歸**：斷網狀態正常遊玩唔受影響（RPC fallback 邏輯無改動）。
