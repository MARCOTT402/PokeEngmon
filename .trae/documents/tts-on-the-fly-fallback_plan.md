# 圖片單字題：mp3 缺失時用系統語音即時讀出 — Implementation Plan（簡化版）

## Repository Research

**現況**
- [capture.js `playWord(url, onFail)`](file:///c:/Users/user/Documents/trae_projects/PokeEngmon/js/capture.js#L619) 已經有兩層：
  1. `fetch(url)` 拿 `Q_folder/picture_words/picture_words_audio/<word>.mp3` → Web Audio 播放。
  2. 失敗 → [`_speakFallback(word)`](file:///c:/Users/user/Documents/trae_projects/PokeEngmon/js/capture.js#L670)，用瀏覽器 `speechSynthesis` 讀個 word。
- v115 補返咗 `wordAudioURL()`，所以而家點圖**唔會再 throw**，理論上 fallback 鏈已經行得通。
- 但 `_speakFallback` 過於簡單：冇等 voices 載入、冇揀 en-US 語音、冇處理首次講嘢失敗，某啲瀏覽器（尤其手機 Safari / 舊 Chrome）可能靜音。

**用戶要求**
- mp3 缺失時，用系統 TTS 即時讀出個 word 就得，**唔需要** Edge Function / 後端 / IndexedDB。

## 方案：強化 `speechSynthesis` fallback（唔加任何基建）

保持兩層 fallback：
```
mp3（Azure JennyNeural 錄音）  →  失敗  →  瀏覽器 speechSynthesis（系統聲）
```
重點係令第二層**真係一定出到聲**。

## Files and Modules

- `js/capture.js`：重寫 `_speakFallback(word)`，加強穩定性。
- `js/quiz.js`：`playWordAudio` 入面個 `onFail` callback 個狀態文字執清楚（系統聲 vs 完全失敗）。
- `js/powerup.js`：同上，確保 powerup 嘅圖片題都有同樣 fallback。

## Implementation Steps

1. **強化 `_speakFallback(word)`**（`js/capture.js`）
   - 確保 `speechSynthesis` 有 voices（`speechSynthesis.getVoices()` 可能首次為空，要等 `onvoiceschanged`）。
   - 優先揀一個 en-US 語音（`voices.find(v => /en[-_]US/i.test(v.lang))`），冇就用第一個。
   - `Utterance` 設定：`lang='en-US'`、`rate=0.85`、`volume=1`、`pitch=1`。
   - 因為用戶已經撳過圖片（user gesture），`speak()` 應該唔會被擋。
   - 包 `try/catch`，任何異常都 `return false`。
   - 加一個 `setTimeout` 檢查：如果 2 秒內 `utterance.onstart` 冇觸發，當失敗處理（某啲瀏覽器靜默 fail）。
   - 播放前先 `speechSynthesis.cancel()` 清隊列，避免疊聲。

2. **狀態文字執清楚**（`js/quiz.js` `playWordAudio`）
   - 成功用系統聲 → 顯示「🔊 Playing (system voice)」。
   - 完全失敗 → 顯示「🔇 Audio unavailable」。
   - （依家 `playWord` 嘅 `onFail(true/false)` 已經區分咗兩種情況，只係狀態文字要對應。）

3. **`js/powerup.js`** 嘅圖片題播放 callback 同步處理（依家只係 `audio.playWord(wordAudioURL(q.word))`，冇 onFail → 失敗時完全冇提示）。加返同樣 callback。

4. **版本 bump v115 → v116**（app.js / sw.js / index.html）。

## Dependencies and Considerations

- 唔加任何新依賴、唔加後端、唔加快取。
- `speechSynthesis` 語音質素因裝置而異，但一定有聲（系統會自動揀一個語音）。
- 首次使用可能需要用戶點擊（已有，因為點圖片先觸發）。
- 離線 mp3 仍然係首選；系統聲只係兜底。

## Validation

- 有 mp3 嘅字 → 點圖播 mp3。
- 冇 mp3 嘅字 → 點圖 → 狀態「Playing (system voice)」→ 聽到系統讀個字。
- 關網絡 / 冇語音 → 狀態「Audio unavailable」（保底，唔會靜默無反應）。
- Chrome / Safari / Firefox 桌面 + 手機各試一次。

## Risks

- **手機 Safari 語音延遲**：`speechSynthesis` 有時要等 1 秒先出聲，屬正常，UI 狀態會顯示「Playing…」。
- **完全冇語音嘅極端環境**：`onFail(false)` → UI 顯示「Audio unavailable」，唔會靜默。
