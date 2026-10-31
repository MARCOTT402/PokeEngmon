# Spec — 補齊 27 招對戰動畫（v1.15.17）

## 背景

`assets/battle/anim/<slug>.json` 現有 536 招（PokeRogue battle-anims 移植）。以下 27 招喺 PokeRogue 冇資源，對戰時 fallback 去屬性特效圖：

```
confusion, after-you, rest, mimic, wonder-room, sludge-wave, surf,
snowscape, minimize, memento, endure, tickle, teeter-dance, vice-grip,
muddy-water, transform, bounce, quash, power-split, power-trick,
entrainment, magic-room, camouflage, aromatic-mist, confide, trick-room,
body-press
```

`moves.json` 全部 563 招都有資料，learnset 引用 0 缺。呢 27 招入面 **surf / confusion / rest / transform / endure / minimize / memento / body-press / bounce / muddy-water / sludge-wave / snowscape** 係常見招，值得做。

## 方案

自製 anim JSON：**唔新增任何 PNG**，全部重用 `assets/battle/anim/sheets/` 現有 264 張 sheet（已逐張目視確認內容），只係重新編排影格。呢點好重要：

- 冇新素材 → **disclaimer 唔使改**（Rule 12：同一來源 Pokémon Reborn / PokeRogue battle-anims）
- 冇新 sheet → `sw.js` 唔使改（只 precache `anim/index.json`，逐招 JSON 係 cache-first 懶載入；gen-packs manifest 會重新生成包埋新 JSON）

## Anim JSON schema（已核實，跟 moveanim.js）

```json
{"graphic": "<sheet 名，唔使 .png>", "frames": [[<layer>, ...], ...]}
```

每個 layer：`{x, y, zoomX, zoomY, opacity, graphicFrame, target:2, focus, angle?, mirror?}`

- `target` 永遠 = 2（GRAPHIC 圖層；moveanim.js 淨係畫 target===2）
- `focus`：1=TARGET、2=USER、3=USER_TARGET（沿連線）、4=SCREEN
- `graphicFrame`：96px 格 row-major index（cols = floor(sheet闊/96)）；播放器會 clamp 到 maxCell-1
- `opacity` 0–255；`zoomX/zoomY` 百分比；`angle` 度數
- 60fps 每格；`index.json` 入面個 value = `frames.length`

## 27 招設計（sheet 已逐張目視確認）

| 招 | sheet | 設計 |
|---|---|---|
| confusion | PRAS- Psybeam (384×96, 4 cells，粉紫 ring) | focus 1，ring 喺對手頭頂來回擺 + zoom 脈動，10 格 |
| after-you | PRAS- Follow Me (cell 2 = 黃色 spotlight) | focus 1，spotlight 由大縮細落對手身上，fade out，8 格 |
| rest | PRAS- Yawn (384×96, 4 cells 白色泡泡) | focus 2，泡泡由 user 身上升起循環 0→3，淡出，16 格 |
| mimic | PRAS- Sketch + Lick (cell 0/2 鉛筆, 1 粉波) | focus 2，鉛筆喺 user 前面左右掃（angle 搖擺），最後粉波彈出，10 格 |
| wonder-room | PRAS- Magic Coat (576×192, 12 cells 紫色牆磚) | focus 4，牆磚喺螢幕四個位置浮現旋轉定住，10 格 |
| sludge-wave | PRAS- Poison (cells 10-14 大 sludge 潑濺, 20-24 滴落) | focus 3 主波 user→target 推進 + focus 1 殘留滴落，12 格 |
| surf | PRAS- Water (cells 5-14 螺旋水柱, 15-19 水花) | focus 1，水柱由底升起 zoom 80→160，頂部水花，淡出，14 格 |
| snowscape | PRAS- Powder Snow (480×192, 10 cells 雪團) | focus 4，多層雪團斜落循環 cells 0-9，16 格 |
| minimize | PRAS- Stats (cells 5-9 紫色旋渦) | focus 2，旋渦 zoom 100→20 旋轉收縮，8 格 |
| memento | PRAS- Night Daze (cell 0 黑環, 1-3 紅色鋸齒) | focus 2 黑環擴大+紅閃爍 → 後段 focus 1 紅鋸齒落對手，12 格 |
| endure | PRAS- Protect (480×96, 5 cells 藍盾) | focus 2，盾浮現 hold 再淡，8 格 |
| tickle | PRAS- Hands (cells 0-1 白色手) | focus 1，手喺對手身兩側 wiggle（x jitter + angle 搖），10 格 |
| teeter-dance | PRAS- Sound (cells 0-14 彩色音符) | focus 1，音符繞對手螺旋上升，12 格 |
| vice-grip | PRAS- Hands (cells 5-7 爪) | focus 1，兩爪由 ±x 夾埋 + zoomX 脈動，10 格 |
| muddy-water | PRAS- Mud Slap (480×192, cells 0-4 泥波, 5-9 濺) | focus 3 泥波推進 + focus 1 濺泥，12 格 |
| transform | PRAS- Swap (cells 35-38 白色圓圈由細到大) | focus 2，白圈罩住 user 擴大→收縮（變身包裹感），12 格 |
| bounce | PRAS- Fly (cells 2-5 白色旋風弧) | focus 2 旋風向上衝（y 急降）→ focus 1 由上落下擊中，12 格 |
| quash | PRAS- Night Daze (cell 0 黑環) | focus 1，黑環由上壓落對手（y -60→0），壓低淡出，8 格 |
| power-split | PRAS- Swap (cell 0 紅珠 + cell 20 藍珠) | user 紅珠、target 藍珠沿 focus 3 互換位置，中點相遇後到位，12 格 |
| power-trick | PRAS- Swap (彩虹珠 cells 0-29 循環) | focus 2，珠繞 user 公轉一圈，10 格 |
| entrainment | PRAS- Sound (cells 25-29 黃色音符) | focus 3，音符 user 飄去 target 再圍繞，10 格 |
| magic-room | PRAS- Magic Coat (牆磚) | focus 4，磚喺螢幕中央浮現旋轉 180° 定住，10 格 |
| camouflage | PRAS- Conversion (384×96, 4 cells 火/冰/電/草鑽石) | focus 2，四屬性鑽石繞 user 快閃循環，10 格 |
| aromatic-mist | PRAS- Aromatherapy (cells 0-4 花瓣, 5-9 閃爍) | focus 2，花瓣圍 user 飄落 + 閃爍，12 格 |
| confide | PRAS- Sound (cells 15-19 黑色音符) | focus 3，單個音符細聲飄去 target，8 格 |
| trick-room | PRAS- Magic Coat (牆磚) | focus 4，磚喺螢幕四角 + 中央浮現旋轉，12 格 |
| body-press | PRAS- Strike (cells 3-4 紅爆, 26 大白圓, 28-29 紅星) | focus 1，白圓由上壓落（zoomY 壓扁）+ 紅爆散開，10 格 |

## 實施步驟

1. **新增 `tools/gen_missing_anims.js`**（一次性生成腳本，同 `fetch_gen_assets.py` 嘅一次性離線腳本風格一致）：
   - 內含 27 招嘅影格定義（上面設計），生成 `assets/battle/anim/<slug>.json`（minified 單行，同現有格式一致）
   - 更新 `assets/battle/anim/index.json`：加入 27 個 entry，value = frames.length；寫回時保持原 key 順序 + 新 key 按字母插入
   - 重新生成 `assets/gen-packs/gen{2,3,4,5}.json`：複製 `fetch_gen_assets.py` L129-180 嘅 manifest 邏輯（行 filesystem 得出 files+bytes+totalBytes+generatedAt），唔使上網
   - 內建校驗：每招 graphic 嘅 sheet 存在；graphicFrame 唔超過 maxCell-1；27 個 slug 同 moves.json 完全對應
2. **驗證**：
   - `node --check tools/gen_missing_anims.js`
   - 跑生成器 → 校驗輸出（27 個 JSON parse OK、index.json 563 entries、gen packs 每個 +27 files、totalBytes 增加）
   - `node tools/_test_battle.js` 保持全綠（現 29 PASS）
   - 瀏覽器 preview 抽樣目測 surf / rest / transform / body-press（Rule 20：如 bridge wedge 就記低，唔硬撞）
3. **版本**：`package.json` → 1.15.17 → `python tools/sync_app_version.py`（自動同步 app.js / sw.js / index.html / prd.md header）
4. **prd.md** §3.11 「逐招原裝動畫」bullet 更新：536 原裝 + 27 自製（重用現有 sheets），563 招全覆蓋，再冇 fallback
5. **報告並問用戶係咪 commit**（Rule 6：唔主動 commit）

## 明確唔做

- 唔新增/修改任何 PNG sheet → disclaimer、sw.js ASSETS 唔變
- 唔改 moveanim.js / battle.js（播放器已支援全部需要嘅屬性）
- 唔郁 moves.json / learnset（資料齊全，只缺動畫）
- Gen 1 冇 gen-pack（Gen 1 素材直接喺 repo），所以 manifest 只動 gen2–5
