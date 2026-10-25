# PokeEngmon 出題 CSV 指引

## 點用（家長睇呢段就夠）

叫 AI 生成題目時，**由下面「# 任務」嗰行開始，成份複製貼俾 AI**，再加一句你想要咩題目，例如：

> 用以下指引，生成 30 題 P.3 現在完成式，分 2 個課題、每課題 2–3 個題型，難度 1–4。

AI 輸出嘅 CSV 可以直接喺 app 嘅「▶ 開始做題 → 📥 匯入 CSV 題目 → 方法二：貼上」匯入；
亦可以取代 `Q_folder/questions/questions.csv`，咁所有手機一開網站就有新題。

（如果 AI 幫你儲成 .csv 檔案，用「方法一：揀 CSV 檔案」，檔案要 UTF-8 編碼。）

---

以下係貼俾 AI 嘅部分：

# 任務：生成英文填空練習題（CSV 格式）

你係一個小學英文練習題生成器。根據用户要求嘅課題、程度（年級）、題型分類同題數，
生成以下 CSV 格式嘅題目。

**輸出要求：只輸出 CSV 本身。** 唔好加前言、總結、解說、markdown 代碼框（```）
或任何 CSV 以外嘅文字。第一行必須係表頭。

## CSV 格式（8 欄）

```
編號,課題,題型,難度,句子,答案,關鍵詞,提示
```

| 欄 | 必填 | 規則 |
|----|------|------|
| 編號 | 可留空 | 五位數，例如 `00001`。用嚟對應 `Q_folder/questions/questions_images/00001.png` 做題目圖片；留空就冇圖片 |
| 課題 | ✓ | **英文**大分類，例如 `Articles`、`Past Tense`。**同一個課題嘅寫法要完全一致**（app 會用佢做第一層選擇） |
| 題型 | ✓ | **英文**小分類，例如 `Articles: Basics`、`Past Tense Verbs`。同一課題內同名歸為同一題型 |
| 難度 | ✓ | 正整數 `1`、`2`、`3`、`4`…（1＝最淺）。答題畫面會顯示同等數量嘅 ★ |
| 句子 | ✓ | 完整英文句子，必須包埋 `___`（三個底線）做填空位，一題一個空位 |
| 答案 | 可留空 | 填空位嘅正確答案。多個可接受答案用 `/` 或 `\|` 分隔，例如 `were not / weren't`。**留空＝零冠詞題**（小朋友要唔填、直接提交） |
| 關鍵詞 | 可留空 | 句子入面要畫箭咀強調嘅詞語，多個用 `/` 分隔。**必須係句子入面一字不差出現嘅字** |
| 提示 | ✓ | 答錯時顯示嘅**英文**短解釋，例如 `Past tense of go is went.` 或 `Vowel sound (apple)` |

## 答案留空（零冠詞題）

- 如果正確做法係「唔加冠詞」，答案欄就**完全留空**，例如：
  `00005,Articles,Articles: Advanced,3,We go to ___ school by bus.,,school,Zero article: go to school`
- 呢類題目嘅句子仍然要有 `___`，小朋友答題時要**留空輸入框**再提交。
- 只有零冠詞題可以留空答案；其他題目一定要填答案。
- 唔可以用 `X`、`-`、`none` 等符號代替留空。

## 題目編號同圖片

- 編號係五位數字，例如 `00001`、`00002`…，每題唔可以重複。
- 如果該題有圖片，圖片檔名就要同編號一樣，放喺 `Q_folder/questions/questions_images` 資料夾：
  `Q_folder/questions/questions_images/00001.png`（亦接受 `.jpg`、`.jpeg`、`.webp`、`.gif`）。
- **冇圖片嘅題目，編號可以照填，唔使整圖片**——app 搵唔到圖片就唔會顯示。
- 如果 AI 只負責出題、唔知圖片情況：照順序填編號（由 00001 開始），
  家長之後按需要加圖片，或者刪走某題嘅編號。

## 課題同題型嘅分法

- **課題**＝一個大學習範圍，通常一個 CSV 有 1–5 個課題。
- **題型**＝課題入面嘅具體考法，一個課題通常有 2–6 個題型。
- 例：
  - 課題 `Articles` → 題型 `Articles: Basics`、`Articles: Usage`、`Articles: Advanced`
  - 課題 `Past Tense` → 題型 `Past Tense Verbs`、`Negative Sentences`、`Questions`、`Be-Verb (Past)`

## 難度建議

| 難度 | 意思 |
|------|------|
| 1 | 最基礎：常用字、直接套用規則 |
| 2 | 一般：不規則變化、需要少少判斷 |
| 3 | 較難：否定／疑問／綴字陷阱 |
| 4 | 進階：複合句、時態對比、例外情況 |
| 5 | 挑戰：長句、多重線索 |

## 硬性規則

1. 每行一題，用半形逗號 `,` 分欄，共 8 欄。
2. 編號由 `00001` 起順序遞增，唔可以重複；冇圖片都可以填。
3. 欄內容如果包住半形逗號（英文句子常有，例如 `, but`），**成欄要用雙引號 `"` 包住**。
   （中文全形逗號 `，` 唔使引號。）
4. 空位一定係 `___` 三個底線，唔可以用 `____`、`__` 或 `……`。可以喺底線後面加提示詞，
   例如 `___(go)`、`___(be)`。
5. **關鍵詞必須喺句子度搵得返**（唔分大小寫都計）。呢個係最常見嘅錯：
   - ❌ `did ... last summer`（句子冇呢個連續字串）→ ✅ `did / last summer`
   - ❌ 關鍵詞寫句子冇出現嘅字（例如用答案 `went` 做關鍵詞，但句子入面係 `___`）
6. 關鍵詞唔想畫箭咀就留空，唔可以亂填句子冇嘅字。
7. 答案唔好包逗號；如果有逗號需求就改寫答案。
8. 輸出係 UTF-8 純文字，除表頭同行與行之間，唔好加空行。
9. **課題、題型、提示一律用英文**；提示要短，避免文法術語，盡量用例子帶出規則。

## 關鍵詞點揀（建議）

- 揀**空位後面第一個實詞**（通常就係決定答案嘅名詞或形容詞），例如：
  - `This is ___ apple.` → `apple`
  - `I can see ___ big dog.` → `big`
  - `Look at ___ sun!` → `sun`
- 關鍵詞只會喺答錯解釋度出現，所以揀最有提示性嘅一個詞就夠。
- 如果一個關鍵詞都揀唔到，寧願留空，唔好硬填。

## 建議

- 程度配合用户指定年級，句子要短而自然。
- 同一批題目：課題名一致、題型名一致，唔好一時寫 `Past Tense` 一時寫 `Past tense`。
- 每批 20–50 題，分 2–5 個課題。

## 輸出前自我檢查（逐行）

- [ ] 有 8 欄
- [ ] 編號五位數、冇重複（有填嘅話）
- [ ] 句子有 `___`
- [ ] 難度係 1–5 嘅整數
- [ ] 答案有填；只有零冠詞題先可以留空（唔好用 `X`）
- [ ] 課題、題型、提示全部係英文
- [ ] 每個關鍵詞（用 `/` 拆開逐個計）都可以喺句子入面搵到
- [ ] 包半形逗號嘅欄已經用雙引號包住

## 例子（格式參考，唔好照抄內容）

```
編號,課題,題型,難度,句子,答案,關鍵詞,提示
00001,Articles,Articles: Basics,1,This is ___ apple. It is sweet and red.,an,apple,Vowel sound (apple)
00002,Articles,Articles: Basics,1,I can see ___ big dog under the tree.,a,big,Consonant sound (big)
00003,Articles,Articles: Advanced,3,We go to ___ school by bus.,,school,Zero article: go to school
00004,Past Tense,Past Tense Verbs,2,2. Yesterday I ___(go) to the park.,went,Yesterday,Past tense of go is went.
00005,Past Tense,Be-Verb (Past),3,"3. My sister and I ___(be) at home yesterday.",were,My sister and I,Plural subject → were.
00006,Past Tense,Negative Sentences,3,I didn't ___(go) to the library yesterday.,go,didn't,Use the base verb after didn't.
00007,Past Tense,Be-Verb Negatives,3,They ___(not be) hungry after lunch.,were not / weren't,They,Plural subject → were not.
```
