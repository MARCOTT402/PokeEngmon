# Tasks — 補齊 27 招對戰動畫（v1.15.17）

- [x] 1. 寫 `tools/gen_missing_anims.js`（27 招影格定義 + index.json 更新 + gen-packs manifest 重新生成 + 內建校驗）
- [x] 2. `node --check tools/gen_missing_anims.js` → 跑生成器 → 校驗輸出（27 JSON、index 563、gen packs +27 files）
- [x] 3. `node tools/_test_battle.js` 保持 29 PASS
- [x] 4. 瀏覽器 preview 抽樣目測 surf / rest / transform / body-press（slow-mo harness 4 招全部正確渲染，零 error 零 404）
- [x] 5. `package.json` → 1.15.17，`python tools/sync_app_version.py`
- [x] 6. `prd.md` §3.11 動畫 bullet 更新（536 原裝 + 27 自製 = 563 全覆蓋）
- [ ] 7. 報告 + 問用戶係咪 commit 三輪改動
