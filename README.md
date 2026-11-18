# 書籍搜尋

用書名、作者、ISBN 或分類搜尋公開的書籍資料，資料來源是 [Google Books API](https://developers.google.com/books)。

純 HTML／CSS／JavaScript，不需要後端或資料庫，用 GitHub Pages 發佈。

## 功能

- 四個搜尋條件：書名、作者、ISBN（10 或 13 碼，可含連字號）、分類；填多個時找出全部符合的書。
- 分類可從選單挑選（文學小說、商業管理、投資理財、AI人工智慧……共 21 類），也可以選「自訂」自己輸入。
- 可限定語言：繁體中文、簡體中文、英文、日文。Google Books 的語言條件常被忽略、中文書也幾乎都標成簡體，所以由網站自己篩選：英文、日文看書籍資料標的語言，繁體／簡體依書名等文字的用字判斷（字表 `zh-script.js` 由 OpenCC 字典產生），少數書可能誤判。有語言篩選時每頁筆數不固定，也不顯示總數。
- 「🆕 近一年上架」按鈕：按下後只顯示出版日期在一年內的書（Google Books 收錄的新書不多，結果可能較少）。Google Books 沒有實際上架日期，所以用出版日期代替；只有年份或年月的書，用那年（月）的最後一天判斷。
- 每頁 20 筆，可換頁；顯示封面、書名、作者、出版社與日期、ISBN、摘要、分類、頁數，點書名到 Google Books 看詳細資料。
- 搜尋條件會放進網址，可以直接分享搜尋結果的連結。
- 手機好用：輸入框不會讓 iPhone 自動放大，按搜尋會收起鍵盤，支援深色模式。

## 檔案

| 檔案 | 用途 |
|---|---|
| `index.html` | 頁面與搜尋表單 |
| `style.css` | 樣式 |
| `app.js` | 呼叫 Google Books API 與顯示結果 |
| `zh-script.js` | 判斷繁體／簡體用的字表 |
| `icons/`、`manifest.webmanifest` | 網站圖示（瀏覽器分頁、加到主畫面時的 App 圖示） |

## 發佈

到 GitHub 儲存庫的 **Settings → Pages**，Source 選 **Deploy from a branch**，分支選 `main`、資料夾選 `/ (root)`，存檔後幾分鐘就會上線。免費帳號的儲存庫要是公開的。

## 注意事項

- **查詢次數與 API 金鑰**：`app.js` 的 `API_KEY` 已填入本網站專用的 Google Books API 金鑰，使用自己的每日額度（預設每天約 1,000 次，可在 Google Cloud 申請提高）。金鑰會出現在網頁原始碼裡，所以在 Google Cloud 限制為「只允許 `https://3j1683.github.io/*`」與「只允許 Books API」；換網址時要記得更新這個限制。
- **分類**：Google Books 的分類是英文，選單的每個中文分類對應一個英文分類（對照在 `index.html` 的分類選單）。「熱門推薦」目前不限分類：Google Books 沒有提供熱門或排行資料。「自訂」時用英文輸入（例如 Cooking、Travel）比較容易找到。
- **資料正確性**：書籍資料與封面來自 Google Books，結果總數是估計值，內容以原網站為準。
