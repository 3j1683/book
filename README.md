# 書籍搜尋

用書名、作者、ISBN 或分類搜尋公開的書籍資料，資料來源是 [Google Books API](https://developers.google.com/books)。

純 HTML／CSS／JavaScript，不需要後端或資料庫，用 GitHub Pages 發佈。

## 功能

- 四個搜尋條件：書名、作者、ISBN（10 或 13 碼，可含連字號）、分類或標籤；填多個時找出全部符合的書。
- 可限定語言：中文、英文、日文。
- 每頁 20 筆，可換頁；顯示封面、書名、作者、出版社與日期、ISBN、摘要、分類、頁數，點書名到 Google Books 看詳細資料。
- 搜尋條件會放進網址，可以直接分享搜尋結果的連結。
- 手機好用：輸入框不會讓 iPhone 自動放大，按搜尋會收起鍵盤，支援深色模式。

## 檔案

| 檔案 | 用途 |
|---|---|
| `index.html` | 頁面與搜尋表單 |
| `style.css` | 樣式 |
| `app.js` | 呼叫 Google Books API 與顯示結果 |

## 發佈

到 GitHub 儲存庫的 **Settings → Pages**，Source 選 **Deploy from a branch**，分支選 `main`、資料夾選 `/ (root)`，存檔後幾分鐘就會上線。免費帳號的儲存庫要是公開的。

## 注意事項

- **查詢次數**：不帶 API 金鑰時，Google 會限制每天的查詢次數，超過會顯示「查詢次數已達上限」。使用量大時，可以在 Google Cloud 申請 Books API 金鑰，填在 `app.js` 的 `API_KEY`，並在 Google Cloud 把金鑰限制為「只允許這個網站的網址」與「只允許 Books API」。金鑰會出現在網頁原始碼裡，所以一定要設限制。
- **分類**：Google Books 的分類多半是英文（例如 Business & Economics、Computers），用英文搜尋分類比較容易找到。
- **資料正確性**：書籍資料與封面來自 Google Books，結果總數是估計值，內容以原網站為準。
