# 扭蛋重做方案：「快龍空投」（Dragonite Delivery）

> 狀態：方案 + prototype（未改正式代碼）
> **主線定案（2026-11-08）**：玩法 A 快龍空投（即時抽）＋ 孵化器（§10 v4）；玩法 C 卡包唔做。實作計劃：`.trae/documents/20261108-gacha-dragonite-incubator-plan.md`
> Prototype：孵化器（植入真 app）`tools/prototype/incubator-app.html`（`node tools/prototype/incubator/build.mjs` 生成）／A `tools/prototype/gacha-v2-prototype.html`／B `tools/prototype/gacha-b-egg-prototype.html`／C `tools/prototype/gacha-c-pack-prototype.html`（B、C 由 A 衍生，共用快龍 rig `tools/prototype/assets/dnite-*.png`）（要開 8080 static server：`http://localhost:8080/tools/prototype/gacha-v2-prototype.html`）
> 參考方向：手遊熱門扭蛋（例如 Puzzle & Dragons 龍蛋機）嘅「儀式感 → 懸念 → 爆發 → 收成」節奏；只借**節奏同心理機制**，畫面、角色、流程細節全部用我哋自己嘅 Pokémon 主題重新設計（快龍＝送貨員，精靈球＝蛋）。

---

## 1. 現況診斷（點解而家唔吸引）

| # | 問題 | 影響 |
|---|------|------|
| 1 | **入口靠隱藏手勢**：拉快龍隻手過 72%、按住 3 秒先變 10 連 | 新玩家唔知點玩；誤觸；10 連入口幾乎冇人搵到 |
| 2 | **球種一跌出嚟就揭曉**：rare/epic/legend 由第一格畫面已經寫死 | 冇「會唔會升級？」嘅懸念，最大張力來源冇咗 |
| 3 | **玩家全程被動**：拉完手之後 drop → roll → wobble → 開球全部自動 | 冇「親手開」嘅參與感，期待感建立唔起 |
| 4 | **節奏平**：三個稀有度都係 ~3.3 秒，legend 只係多啲 flash + shake | 中大獎冇「世界停咗一秒」嘅對比 |
| 5 | **揭示太直接**：開球即出卡 | 冇「係邊隻？」第二層懸念（剪影 → 上色） |
| 6 | **顏色語言矛盾**：odds chip 用 Epic=金、Legend=紫，但演出係 Epic=紫光、Legend=金光 | 玩家學唔到「見咩色＝咩級」 |
| 7 | **聲效零散**：冇場景底音、冇 riser、冇靜默、fanfare 唔分級 | 畫面再靚都冇「重量」 |
| 8 | **10 連自動播完**：冇逐粒開、冇「留最好嗰粒最後」 | 10 連應該係最爽嘅時刻，而家最悶 |

---

## 2. 設計原則

1. **期待 = 不確定 × 參與 × 對比**。每一幕都要有一樣「未知」、一個「玩家動作」、一次「靜 → 爆」。
2. **三層懸念，逐層揭開**：① 球種會唔會升級（稀有度）→ ② 親手撳開（時機由玩家控制）→ ③ 剪影 → 上色（係邊隻）。
3. **誠實嘅預兆（tell）**：快龍尾巴拖光顏色、球落地後嘅震動都係真提示；可以「假動作」（tease 後冇升級），但**最終結果永遠由 server 結算決定**，演出只係包裝。
4. **每個 beat 三重回饋**：畫面 + 聲 + 震動（haptic）。
5. **稀有度越高 → 越長、越靜、越大聲**。Rare ≈ 4 秒、Epic ≈ 6 秒、Legend ≈ 9 秒（1× 速度）。
6. **任何時候可以 Skip**；Skip 只跳演出，唔影響結果（沿用現有「經濟同演出解耦」架構）。
7. **入口要明確**：兩粒大掣（1 抽／10 連），唔再靠隱藏手勢。

---

## 3. 稀有度視覺語言（統一）

| 稀有度 | 機率 | 球 | 主色 | 星 | 快龍拖光 | 揭示背景 |
|--------|------|----|------|----|----------|----------|
| Rare | 80% | Great Ball | 藍 `#4aa8ff` | ★★★ | 白 | 藍色光線 |
| Epic | 15% | Ultra Ball | 金 `#ffc93c` | ★★★★ | 白／金 | 金色光線 + 光環 |
| Legend | 5% | Master Ball | 紫 → 彩虹 `#b46cff` | ★★★★★ | 金／彩虹 | 彩虹旋轉光線 + 全屏閃 + 慢鏡 |

> 要同步改 `index.html` odds chip、檢視卡、10 連格、Pokédex 稀有度 badge，全部用同一套色。

---

## 4. 單抽流程（時間以 1× 計）

| 幕 | 畫面 | 聲 | 玩家 | 備註 |
|----|------|----|------|------|
| **0 大堂** | 黃昏天空、雲層視差、快龍浮喺半空（呼吸 bob）；上面 banner、pity 進度條；下面兩粒大掣 `1 抽 💎3` / `10 連 💎30` | 低音量 ambient pad | 撳掣 | 掣撳落有 press 回饋 |
| **1 起飛**（0–1.2s） | 快龍蹲低（squash）→ 拍翼加速 → 爆衝飛出畫面頂（拉伸 + 速度線）；天空轉夜、星星浮出 | 快龍叫聲 → whoosh 上升 | — | **呢 1.2 秒剛好遮住 `gacha_pull` RPC 延遲** |
| **2a 飛近**（2.0s） | 快龍由天邊細細隻（遠景矇、暗、淡）沿 bezier 弧線飛近鏡頭；按飛行方向轉身、傾側；翼拍「下拍快、上拍慢」，身體隨每下拍翼升降；尾擺；地面影子跟住變大變實；背景雲反向視差 | 每下拍翼「噗」（遠細近大）＋飛掠 doppler（左聲道→右聲道） | — | 見下面「快龍 rig」 |
| **2b 懸停＋擲波**（~1.3s） | 懸停喺鏡頭前、轉返正面；每下拍翼吹起地面塵；吼一聲 → 舉手儲力（身體反扭）→ 擲出手上嗰粒波（波由手嘅位置飛出，拋物線＋旋轉＋拖光）；快龍轉身斜上飛走 | 叫聲 → 揮手 whoosh → 口哨式下墮音 | — | 手上一開始就攬住嗰粒波（起始球種）；拖光：rare 白；epic 50% 金；legend 金／彩虹 |
| **3 落地**（2.6–3.0s） | 撞地：hit-stop 80ms、震屏、塵環、地面光圈 | 低頻 thud + 碎石 | 震動 | 球種＝起始球（唔一定係最終） |
| **4 升級**（0–2 次 × 0.9s） | 球震 → 閃白 → 換成更高級球 + 光環擴散；文字 `UPGRADE!` | 每級上升琶音（越升越高） | 震動 | Rare 有 25% **tease**（震咗但冇升，「fizz」聲）|
| **5 親手開** | 球浮起、脈衝光圈、`TAP ×3` 提示；每撳一下：球 squash、裂紋 + 光漏（稀有度色）、粒子 | 玻璃裂聲，音高逐下升 | **撳 3 下** | 3 秒冇撳自動提示（唔自動開，保留儀式）|
| **6 爆發** | 第 3 下：**全場靜 0.25s + 變暗** → 白閃 → 球上下兩半彈開 → 光柱 + 旋轉光線 | riser → 靜默 → 爆炸 + 和弦 | — | Legend：慢鏡 0.4s + 彩虹 + 大震 |
| **7 剪影** | Pokémon 黑色剪影由光柱升起，停 0.6s | 心跳／低鳴 | — | 「係邊隻？」第二層懸念 |
| **8 上色** | 閃白 → 上色；星星逐粒「叮」彈出；名牌滑入；`NEW!` 印章蓋落 | 叫聲 + 星星五聲音階 + fanfare（分級） | — | 重複 → 卡片縮成糖果飛去計數器 |
| **9 結算卡** | 底部 sheet 滑上（見 §6） | — | 再抽／睇夥伴／返回 | |

### 快龍 rig（點解唔再係「一張平面圖左至右移」）

`assets/gacha/dragonite.png` 用 `tools/prototype/assets/dnite-{wing,tail,body,arm}.png` 拆成 4 層（同一 640×829 座標系，疊返一模一樣），各自繞關節轉：

| 層 | 關節（transform-origin） | 動作 |
|----|--------------------------|------|
| 翼 | 53.9% 35%（肩後） | 上拍 −36° 0.26s（sine）→ 下拍 +26° 0.18s（power2.in），scaleY 模擬透視 |
| 身（`.rig-bob`） | — | 上拍沉 1.4%、下拍升 1.8%（同翼同步）；懸停時 squash／吼 |
| 尾 | 71% 72.4% | −5° ↔ +7°，0.95s 慢擺 |
| 手 | 22.7% 39.8%（肩） | 揮手、舉手儲力 +42°、擲 −38°（0.13s power3.in）、elastic 回位；手中掛住一粒波 |

整個 rig 再做：bezier 飛行路線、按速度傾側（±22°）、按方向轉身（scaleX 翻面 0.3s）、遠近縮放＋空氣透視（blur／brightness／saturate）、地面影子。正式版建議請畫師出分層 PNG（或 Spine／Lottie）會更順，但呢套純 CSS＋GSAP 已經冇額外依賴。

---

## 5. 10 連流程

1. **起飛**同單抽一樣（1.2s，遮 RPC）。
2. **飛近＋一擲十粒**：快龍同單抽一樣飛近懸停，舉手一擲，手中波爆開做 10 粒，扇形拋物線逐粒落入 5×2 格（70ms stagger），每粒小落地音 + 小震（音高逐粒升）。
3. **升級波**：有升級嘅球**一齊**震 → 一齊升級（每一級一次 sting），越升越少粒，張力集中喺最後嗰粒。
4. **開球**：玩家可以逐粒撳，或者撳 `OPEN ALL`：
   - Rare 球快速連開（80ms stagger，「噗噗噗」）。
   - Epic 球逐粒開，每粒金閃 + 小震。
   - **Legend 留到最後**，切入完整單抽 cinematic（剪影 → 上色）。
5. **結算頁**（見 §6）。
6. 10 連保底：最少 1 隻 Epic+（現有 `_pickLuckyChainLocal` 本地邏輯；server 端要對齊）。

---

## 6. 結算頁設計

### 單抽結算卡（bottom sheet）
- 上半：稀有度色背景 + 慢轉光線、動態 sprite（`assets/animated/<id>.gif`）、星星、`#編號 名字`。
- 標籤：`NEW!`（第一次得到）或 `Duplicate → 🍬 Candy +1 ・ ⚡ EV +1`（有轉換動畫）。
- 學習連結（建議）：名字旁邊 🔊 讀出英文名，配一句 Pokédex 英文短句——將扭蛋接返「學英文」主軸。
- 掣：主掣 `再抽 💎3`（同位置，方便連抽）、次掣 `查看夥伴`、`完成`。

### 10 連結算
- 標題 `10× RESULTS`，5×2 卡逐張翻（60ms stagger），最高稀有度張卡有皇冠 + 呼吸光。
- 每張：sprite、名、星、`NEW` 或 `+🍬`。
- 總結列：`NEW ×3 ・ 🍬 +7 ・ ⚡ +7`。
- 撳卡睇詳情（重用單抽結算卡）。
- 掣：`再 10 連 💎30`、`完成`。

---

## 7. 聲效設計（WebAudio synth，零檔案）

| 事件 | 做法 |
|------|------|
| 大堂底音 | 兩條 detune saw → lowpass 600Hz + 慢 LFO，音量 0.04 |
| 起飛 | 快龍叫聲（`assets/cries/149.mp3`）+ bandpass noise 向上掃 |
| 墮落 | sine 1800→300Hz 0.9s（口哨） |
| 落地 | sine 120→40Hz + lowpass noise burst |
| 升級 | 三音琶音，每級移高四度；Legend 加 shimmer |
| 撳裂 | triangle ping 1200×1.26ⁿ + click |
| Riser → 靜默 | noise bandpass 200→4000Hz 1s，之後 **完全靜 250ms** |
| 爆發 | white noise + 大和弦（root/5th/oct），Legend 加 sub-bass |
| 星星 | 五聲音階逐粒上 |
| Fanfare | Rare 短 major 三和弦；Epic 加七度 + 琶音；Legend 完整上行 + 長延音 |
| 糖果轉換 | 金幣 blip ×2 |

所有音效行現有 `sfxBus`；跟隨 Settings 音量同靜音。

---

## 8. UX 細節

- **入口**：兩粒大掣放拇指區（底部 1/3），10 連掣較大、有 `Epic+ 保底` ribbon。唔夠鑽 → 掣變灰 + 「去答題賺 💎」連結。
- **Skip**：右上角 `SKIP ⏭`，單抽跳去結算卡，10 連跳去結算頁。
- **動畫倍速**：沿用 `AnimSpeed`（1×／2×／3×），GSAP `globalTimeline.timeScale`。
- **Reduced motion**：取消震屏、慢鏡、粒子減 80%，保留升級同揭示（資訊唔可以少）。
- **觸控**：所有撳點 ≥ 48px；球嘅 hit area 比畫面大。
- **Pity 進度條**（建議，需 server）：`再 N 抽保證 Epic+`，令輸咗都有「進度」。

---

## 9. 落地計劃（分期）

| 期 | 內容 | 檔案 | 風險 |
|----|------|------|------|
| P1 | 大堂 + 單抽新時間線（GSAP timeline）+ 統一色 + Skip | `js/gacha/scene.js` 重寫；`arm.js`／`charge.js` 由大堂掣取代；`index.html` gacha markup；CSS | 中：要保留 `_beginPull`／`_settleResult`／`abort()` 結算保證 |
| P2 | 10 連新流程（升級波、逐粒開、Legend cinematic、結算頁） | `js/gacha/multi.js` 重寫 | 中 |
| P3 | 聲效全套（加入 `js/audio.js`） | `js/audio.js` | 低 |
| P4 | Pity counter + 10 連保底對齊 server | migration + `gacha_pull`／multi RPC | 高（經濟，要 column-level grant，Rule 54） |
| P5 | 結算卡學習連結（🔊 英文名 + 例句） | `scene.js` + `audio.js` TTS | 低 |

**唔變**：server 權威結算（`gacha_pull` RPC）、`flow` token、`abort()` 補結算、`_pendingEvolves`。演出層只讀 settlement 結果決定「起始球種／升級次數／tease」——呢啲純視覺隨機，喺 client 用 `settlement.rarity` 推導。

驗收：`npm test`（加 `tests/unit/gacha-tells.test.js` 測「升級路線一定落喺正確最終球種」）、`npm run lint`、`npm run test:e2e`、iPhone 440×956 preview、console 冇 error。

---

## 10. 其他玩法候選（揀一個做主線）

三個玩法共用同一套後端（`gacha_pull` server 結算、稀有度色、升級路線、SKIP、結算頁），分別只係「點樣包裝懸念」。

### 玩法 A：快龍空投（已有 prototype）
見 §4–§5。張力來源：快龍飛近 → 球種升級 → 親手撳 3 下 → 剪影。

### 玩法 B：神秘蛋孵化（Mystery Egg Hatchery）
| 幕 | 內容 |
|----|------|
| 得蛋 | 快龍將一隻蛋放入巢（或者直接由天降落巢）。蛋紋＝預兆：米白綠點（Rare）、金斑（Epic）、七彩流光（Legend）；同樣可以「孵化中升級」（蛋紋變色）。 |
| 親手孵 | 手指喺蛋上**打圈揉／磨**加熱：溫度計上升，蛋越震越勁、裂紋隨溫度蔓延、裂縫漏稀有度色光。比「撳 3 下」更有手感，亦可以控制節奏（揉得快＝孵得快）。 |
| 孵出 | 溫度滿 → 蛋殼一塊塊爆開（3–4 塊殼碎分別飛走）→ 剪影 → 上色（同 A 嘅 §4 幕 6–8）。 |
| 10 連 | 巢入面 10 隻蛋，揉任何一隻都會「傳熱」俾隔籬，連鎖孵化；最好嗰隻最後先爆。 |
| **學習連結（賣點）** | 可以揀「放入孵化器」：之後每答啱 1 題英文，蛋就震一下、裂多啲，答啱 5 題自動孵出（「答題孵蛋」）。即刻孵都得，但孵化器版送少少額外 EXP。將抽獎變成溫習動力。 |
| 優點 | 最接近 P&D 開蛋嘅期待感；同學英文主軸綁得最緊；孵化器係每日回來嘅理由（retention）。 |
| 缺點 | 要畫蛋（SVG 可做）；孵化器要新 state＋server column（同 P4 一樣要 migration、Rule 54 grant）；工作量最大。 |

#### B 孵化器：答題提升 Epic／Legend 機率（2026-11-08 用戶要求）

> ⚠️ 下面「每 5 題擲升級骰」版本已被「題數＝品質」取代（見下一節），保留作記錄。

揀「即刻孵」定「放入孵化器」要有真分別：**孵化器版會提升抽到 Epic／Legend 嘅機率**，代價係要時間同答題。

- **抽蛋時**：server 照舊即時擲出基本稀有度（80／15／5），寫入一隻「未孵」蛋（稀有度唔俾 client 睇）。
- **孵化器**：一次只可以放 1 隻（最多 2 個 slot），要累積 **20 題答啱** 先孵得。
- **每 5 題答啱 = 1 次升級擲骰**（共 4 次）：Rare→Epic 4%、Epic→Legend 3%。升級成功時，學緊嘢嘅畫面即時彈出「🥚 你隻蛋變色喇！」（蛋紋升級動畫），做溫習途中嘅驚喜。
- **最終機率**：

| | Rare | Epic | Legend |
|--|--|--|--|
| 即刻孵 | 80% | 15% | 5% |
| 孵化器（20 題） | 67.9% | 24.8% | 7.3% |

- **防刷**：答啱題數只由現有答題結算（`award_round_diamonds` 同一條 server path）累加，信任度同派鑽石一樣；每日上限（例如每日最多推進 40 題）；孵化器滿咗就唔再計。
- **選擇張力**：即刻孵＝即時爽；孵化器＝等耐啲但有機會升級，仲要去溫習。兩樣都合理，唔係「蠢選擇」。
- **要改 server**：新 table `user_eggs`（rarity、chain_key、progress、upgrades、slot、created_at），RPC `incubate_egg`／`hatch_egg`，`award_round_diamonds` 加 progress 累加同升級擲骰；column-level grant（Rule 54）。

#### 孵化器 v2：題數＝品質（2026-11-08 用戶建議，取代升級骰）

揀「🥚 Incubator」嗰刻就**公佈要答幾多題先孵到**，而題數越多＝蛋越好。玩家見到大數字會興奮，越想快啲答完。

- **只升唔跌**：喺抽到嘅稀有度上加升級機會：Rare→Epic 14%、Rare→Legend 1%、Epic→Legend 8%。整體 = **68／25／7**（即刻孵 = 80／15／5）。蛋保持抽到時見到嘅蛋紋，唔會「降級」。
- **題數表**（由最終稀有度抽；範圍重疊，數字係提示唔係答案）：

| 最終 | 10 題 | 15 題 | 20 題 | 25 題 | 30 題 |
|------|------|------|------|------|------|
| Rare | 50% | 35% | 15% | | |
| Epic | | 20% | 40% | 30% | 10% |
| Legend | | | | 35% | 65% |

- **玩家見到嘅提示**（孵化器 sheet 顯示「A 25-answer egg is: ★4 75% ・★5 25%」）：10 題 = 一定 Rare；15 題 = 83% Rare；20 題 = Rare／Epic 各半；25 題 = 75% Epic・25% Legend；30 題 = 65% Legend。
- **揭曉演出**：數字好似拉霸咁由 5 滾上去（越滾越慢＋riser），停低後按大細變色：≥30 彩虹字「🔥 SOMETHING LEGENDARY!?」、≥20 金字「✨ A BIG NUMBER」、其他白字「A QUICK ONE」。
- **答題途中變色**：最終比見到嘅蛋紋高，就喺預定進度變色（升 1 級：50%；升 2 級：40%、80%），彈 toast「🥚 Your egg changed colour!」；其他每 5 題蛋震一下保持懸念。
- **提早孵**：可以，但只會得到「而家見到嘅蛋紋」嘅稀有度。
- **Server**：揀孵化器時 server 擲最終稀有度＋題數＋變色進度並寫入 `user_eggs`（client 只收 `need`、`tier`、`reveals` 嘅已到期部分）；答啱題數經 `award_round_diamonds` 累加。
- Prototype：`tools/prototype/incubator-prototype.html`。

#### 孵化器 v4：經濟同 slot 規則（2026-11-08 用戶定案，覆蓋 v2／v3 嘅題數同機率）

- **Claim**：Lucky Draw display window「🥚 Claim an egg into the Incubator」💎3（同一抽一樣價）；冇空 slot 或者唔夠石就唔得。
- **孵化器機率**：Common 30%／Rare 40%／Epic 20%／Legendary 10%（即時抽 = Rare 80／Epic 15／Legend 5，冇 Common）。用「可能抽到 Common」換「Legendary 機會加倍」。
- **題數 = 稀有度（固定）**：Common **30**／Rare **80**／Epic **140**／Legendary **200** 題答啱。
  - Claim 時數字拉霸（30 → 80 → 140 → 200 輪住閃、越轉越慢）停喺邊個就係咩級 → **Claim 就係抽獎時刻**；孵化先揭係邊隻 Pokémon（兩次驚喜）。
  - 時間感（一回合 10 題、~80% 準確）：30 ≈ 當日、80 ≈ 2–3 日、140 ≈ 4–5 日、200 ≈ 1 星期（每日 3–5 回合）。
  - 蛋紋：Common 米白啡點、Rare 綠點、Epic 金、Legendary 彩虹；孵蛋演出級別 Common 0／Rare 2／Epic 3／Legendary 4。
  - 分段環：≤30 題 1 格 = 1 題；>30 題 1 格 = 5 題（200 題 = 40 格）。
- **2 個 slot**：
  - Slot 1 永遠開；**Slot 2 從未用過 → 第一次解鎖要連續答題 7 日**；之後 streak 斷咗，**重新連續 3 日就再解鎖**（用戶定案，取代 17 日）。
  - 解鎖要記住（`ever`／`on`／`last`）：解鎖後只要 streak 冇斷就一直開；streak 變細 = 斷咗 → 取消解鎖。
  - Streak 斷咗而 Slot 2 有蛋 → **❄️ 凍結**：進度唔跌、唔再計題；**重新連續答題 3 日就自動解凍**（用戶定案）。凍結同「再解鎖」都係 3 日，所以解凍即係 Slot 2 重新解鎖。
  - Slot 2 冇蛋時 streak 斷咗 → 變返 🔒 鎖住。
- **1 條答啱嘅題同時計落所有開住、未滿嘅蛋**（凍結嘅唔計）；同一回合兩隻都夠數 → 結算頁逐隻彈孵蛋小視窗。
- **防刷（用戶定案）**：**只計內置題庫**。家長 CSV 匯入同 App 內新增嘅自訂題（`customQuestions`，id `c…`／`cw…`）答啱都唔計；計法 = 結算 `results` 入面 `correct`（clean）而且 `qid` 唔喺 `customQuestions`。孵化器頁細字註明「Only built-in questions count」。Server 版要喺 `award_round_diamonds`（或新 RPC）用 server 題庫 id 驗證，唔可以信 client 報嘅數。
- **丟棄蛋（用戶定案）**：孵化器頁「Discard this egg」→ 真 app `confirm-box`（DISCARD／KEEP）；進度清零、💎3 唔退；丟 Slot 2 而 Slot 2 未解鎖緊（例如凍結中）會提醒「Slot 2 will lock again until a 3-day streak」，丟完即鎖。已夠數（可以孵）嘅蛋唔顯示丟棄。Server 版要 `discard_egg` RPC。
- **仲未定**：每日上限（而家只計內置題，可能已經夠）、Common 對比即時抽嘅體感。
- Server 要做：`user_eggs`（slot、rarity、need、progress、frozen 由 streak 推導、created_at）、`claim_egg` RPC（原子扣 3 石＋server 擲稀有度＋檢查空 slot）、`award_round_diamonds` 順手累加所有開住嘅蛋、`hatch_egg` RPC（server 揀寵＋派寵）；column-level grant（Rule 54）。

#### 孵化器 v3：用戶定案（2026-11-08，取代下面「擺邊」同 v2 嘅答題中提示）

- **入口**：首頁 Battle dock → Battle 捲頁加「Incubator」（同 Battle Menu／Bag 同款 `ph-sitem`，副題顯示「N answers to hatch」／「READY TO HATCH!」，夠數時 Battle dock 出紅點）；扭蛋 display window（Lucky Draw sheet）加 Incubator 行。
- **孵化器頁**：`#sheet-incubator`，同 `#sheet-gacha` 一樣佔滿 display window；主角係巢入面隻蛋。
  - 蛋外圍 **N 格分段環**（1 格 = 1 題答啱）＋大數字「仲差幾題」＋「x / N correct answers」。
  - **5 個熱度階段**（0–24% 😴 Sleeping、25–49% 🌡️ Warming up、50–74% 🔥 Getting hot、75–99% 💥 Cracking!、100% 🐣 Ready）：背景色溫、光暈呼吸速度、蛋動作（呼吸 → 偶爾郁 → 常郁 → 狂震 → 跳）、裂紋數、漏光、粒子（Zzz → 火星 → 火花＋星光）、光線逐級加強；底部熱度軌標住而家喺邊一級。
  - **每次打開**：上次之後新答啱嘅格逐格「叮」亮起、數字倒數；跨階段時有升級音＋banner；答題期間蛋變咗色就喺呢度揭（唔喺答題中打擾）。撳蛋有反應（按階段唔同對白）。
- **答題中**：唔顯示任何孵化器資訊（取消 toast）。
- **結算頁**：取消「🥚 +N」行同「可以孵化」掣；只有答完呢回合**啱啱夠數**，先喺 display window 內自動彈**孵蛋小視窗**：蛋震（次數按題數）→ 裂 →（20 題起）riser＋變暗＋（25 題起）心跳 → 爆殼（光線顏色、粒子、彩紙、震幅按題數 10／15／20／25／30 分 5 級；30 = 彩虹）→ 剪影 → 上色＋叫聲＋fanfare → 收窗 → 真 `#gacha-inspect` 抽獎結果卡（加「🥚 Hatched from a N-answer egg」，掣改 Done）。
- Prototype 做法：由真 `index.html` 生成，`<base>` 載真資源；`early.js` 將 localStorage 加 `proto_incu:` namespace（唔郁本機真存檔／登入）、停 SW；`incubator.js` 植入入口、sheet、結算 hook（包 `App._renderSettlement`）同 🧪 控制面板（給蛋 10–30 題、差 3 題、下一階段、完成一回合 10/10）。

#### 孵化器擺邊（入口設計）

唔開獨立新頁，用現有 sheet 模式（同 Pokédex／Daily Quests 一樣），三個入口：

1. **扭蛋頁（主入口）**：大堂快龍下面加「🥚 Incubator」一行 slot 卡（蛋圖＋`12/20`進度條＋下一次升級擲骰仲差幾題）；撳開 Incubator sheet。抽到蛋時喺呢度揀「即刻孵／放入孵化器」。
2. **首頁提示（最重要）**：`Start quiz` 大掣上面加一粒細 chip「🥚 12/20 · 再答 8 題孵蛋」，撳開 Incubator sheet。放喺開始答題掣旁邊＝提醒「去答題就會孵」。冇蛋喺孵化器時唔顯示。
3. **答題中／結算**：每答啱 5 題做一次升級擲骰；升級成功即時彈 toast「🥚 你隻蛋變色喇！」（細、唔阻答題，1.5 秒自動收）；回合結算頁加一行「🥚 +7（19/20）」。滿 20 題時結算頁出「🥚 可以孵化！」掣，直接入孵化演出。

唔放落 bottom dock（已經有 Battle／Leaderboard／Friends／Settings，而且係社交／對戰位）。新 sheet 要跟 `pokeengmon-responsive` skill 嘅 sheet 規則同 `tools/responsive/` 測試。

### 玩法 C：卡包撕開（Booster Pack Rip）
| 幕 | 內容 |
|----|------|
| 得卡包 | 快龍送嚟一包封住嘅卡包（包裝閃光顏色＝預兆）。 |
| 親手撕 | 手指沿頂部**橫掃撕開**（撕紙聲、紙碎粒子、裂口跟手指走）。 |
| 逐張翻 | 卡疊住出嚟，逐張向上掃走揭下一張；稀有卡喺未掃之前**卡邊已經漏光**（edge peek），最好嗰張永遠喺最底；Epic／Legend 卡有 holo 反光，跟手指／陀螺儀（DeviceOrientation）郁。 |
| 卡面 | 每張卡背面印一個英文生字＋例句（呢隻 Pokémon 相關），抽卡同時學字。 |
| 10 連 | 一包 10 張，最自然；單抽＝一張「單卡信封」。 |
| 優點 | 最快做、最易控制節奏；10 連體驗最好；卡面可以放英文內容；holo 效果好打卡（截圖分享）。 |
| 缺點 | 同市面某隻 Pokémon 卡牌手遊嘅開包玩法好似，容易俾人覺得係抄；快龍角色感最弱。 |

### 比較

| | A 快龍空投 | B 神秘蛋孵化 | C 卡包撕開 |
|--|--|--|--|
| 期待感 | ★★★★ | ★★★★★ | ★★★★ |
| 玩家操作 | 撳 3 下 | 打圈揉（最有手感） | 撕＋逐張掃 |
| 學英文連結 | 結算卡 🔊 | **答題孵蛋**（最強） | 卡背生字 |
| 單抽體驗 | ★★★★★ | ★★★★★ | ★★★ |
| 10 連體驗 | ★★★★ | ★★★★ | ★★★★★ |
| 重用現有代碼 | 高（已有 prototype） | 中（重用揭示＋A 嘅快龍） | 中 |
| 開發量 | 中 | 大（孵化器要 server） | 中 |

**建議**：主線用 **A**（已經有 prototype、快龍有角色感），之後加 **B 嘅「孵化器＋答題孵蛋」** 做第二階段——快龍送嚟嘅唔一定係波，有時係蛋，放入孵化器要答題先孵。咁就兩樣都有：即時抽嘅爽快＋同學習綁定嘅長線動力。

---

## 11. 現有經濟（參考）：抽獎有冇機會抽到糖果？

**冇「糖果」呢個獨立獎品**。每次抽一定係抽 Pokémon；糖果只係**重複**時嘅補償：

- 抽中你已經有（同一條進化鏈、未完全進化）嘅 Pokémon → 唔會多一隻，改為嗰隻 entry：`candies +1`、`ev_points +1`、`dupes +1`，`stars = min(5, 1 + dupes/5)`（每 5 隻重複升 1 星）。
- 糖果係**跟住嗰隻 Pokémon**（per-entry），喺 Pokédex 詳情「Feed candy」餵佢升級。
- 已經完全進化咗嘅鏈（例如 Eevee 已進化做 Flareon）→ 當新寵開一隻新 entry，方便集齊分支進化。
- 代碼：server `gacha_pull`（`supabase-migrate-20261031b-collect-fully-evolved.sql`，有 `is_final = false` 條件）、本地 `obtainPokemon()`（`js/storage.js`）。

⚠️ 發現不一致：10 連保底槽用嘅 `gacha_pull_lucky`（`supabase-migrate-20261104-lucky-10pull.sql` 第 96–97 行）判斷重複時**冇** `is_final = false`，亦冇 `order by obtained_at limit 1`。即係保底槽抽中一條你已完全進化嘅鏈，會當重複送糖俾嗰隻完全進化嘅 entry，而唔係開新 entry；有多個 entry 時揀邊個亦唔固定。同普通單抽規則唔一致，建議另開 migration 修正。
