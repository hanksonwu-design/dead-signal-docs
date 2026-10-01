# 灰燈寨｜企劃文件瀏覽器

《灰燈寨》敘事恐怖解謎遊戲的企劃文件網站。

以[遊戲劇本總目錄](docs/09_劇本/09-14_全劇本與關卡整合稿.md)連結的八份分幕正文、八份同幕製作規格及共用附錄為正式依據。劇情與技術規格分檔維護；文件仍待審，未完成實機驗收。

## 瀏覽

開啟此儲存庫的 GitHub Pages 網址，可使用分類、搜尋、文件閱讀及場景節點導覽。
製作時程中的 Google 試算表連結沿用原檔案權限。

「遊戲劇本」提供序幕至終幕的八份連續正文，保留台詞、演出、玩家操作、解謎因果與分支。「製作規格」另提供八份同幕文件，收納逐房技術條件、狀態保存、素材圖像與驗收；每個場景可在正文與規格間往返。跨幕共用設定與完整年表只保留於[共用附錄](docs/09_劇本/09-15_正式劇本_共用附錄.md)。「精簡版小說」保留[同設定小說](docs/09_故事劇情/17_縮寫短文.md)，不是另一套世界觀或操作規格。

## 修改文件

劇情只修改 `docs/09_劇本/09-03` 至 `09-10` 的對應幕別；逐房技術規格只修改 `docs/10_製作規格/` 的同幕文件；跨幕共用規格只修改 `09-15_正式劇本_共用附錄.md`。`09-14_全劇本與關卡整合稿.md` 沿用舊檔名，但現在只是總目錄，不存放重複正文。50 份分類文件是可重建的查閱副本；舊 06 文件與其餘退役 09 文件只保留轉介入口。不要在副本維護第二套正文，也不要手動改 `docs.json`、`scene_graph.json` 或 `building/data.js` 的衍生欄位。

修改主稿後執行：

```powershell
node tools/sync-canonical.mjs
node tools/build-story-inventory.mjs
node tools/test-canonical.mjs
node tools/build-docs.mjs
npm --prefix building run build
```

`node tools/sync-canonical.mjs --check` 檢查分類副本與場景資料；`node tools/build-docs.mjs --check` 檢查網站資料包。縮寫小說仍需人工依主稿複核，不從規格機械拼接。修改前備份為 `archive/2026-09-30-canonical-sync/before-sync.zip`。

總目錄末尾的 `canonical-source` 註記是同步來源清單，不是可讀正文。刪除匯入區塊時需同步移除對應 `indices`，舊連結可保留定位錨點；不能為湊舊段落數留下空白正文。`tools/screenplay-files.mjs` 定義正式文件清單；同步工具逐份讀取，不產生另一份合併正文。`tools/reorder-screenplay.mjs`、`tools/split-screenplay.mjs` 與 `tools/split-screenplay-specs.mjs` 是一次性遷移工具，已完成遷移的文件不會被再次改寫。網站保留總目錄與舊分幕製作錨點的轉介；一般 Markdown 連結直接指向目前的正式來源。

1. 本機預覽：雙擊 `preview.bat`（需要安裝 Node.js），瀏覽器會打開 http://localhost:8765/ 。
   改完 `.md` 存檔後，在網頁上按「重新載入」就會看到新內容。
2. 推送到 `main` 後，GitHub Actions 會自動從 `docs/` 重新產生 `docs.json` 並提交，
   GitHub Pages 約 1～2 分鐘後更新。推送下一批前請先 pull，拿到自動產生的那次提交。

也可以手動產生：`node tools/build-docs.mjs`（加 `--check` 只檢查是否過期）。

### 檔頭欄位

每份 `.md` 開頭的 `---` 區塊決定網站上的顯示方式，閱讀時不會顯示出來：

| 欄位 | 用途 |
| --- | --- |
| `文件` | 卡片標題 |
| `狀態` | 狀態標籤 |
| `摘要` | 卡片摘要；沒寫就用內文第一個 `>` 引言 |
| `導覽分類` | 分類；`批次存檔` 的文件不列在清單中 |
| `導覽層級` | `每週細表` 只在搜尋時出現 |

新增資料夾時，在 `tools/build-docs.mjs` 的 `FOLDER_LABELS` 補上顯示名稱。

## 其他資料

- 圖片：`assets/<資料夾>/`，對應 `.md` 裡的相對路徑。
- 場景節點圖：`scene_graph.json`。
- 上部 3D 空間模型：`building/`，網址 `building/`（可加 `#scene=R17` 直接選房）。
  網站頂部「3D 空間模型」與節點圖上部房間的「3D 空間 ↗」會連過去；模型裡的規格連結會回到本站。
  目前是第二十七版（六段故事通路、十二個過渡鏡位，保留房間／走廊／樓梯編輯），可直接在 3D 畫面中編輯房間、道路與逐層樓梯；編輯結果只存在各自的瀏覽器，要保存或分享請用左上「場景檔案 → 匯出場景檔」，之後再「載入場景檔」接著編輯。
  模型的敘事來源、節點目標與通行條件由同步工具更新（`building/data.js`／`building/scene-data.json`）；房間、走道與樓梯配置仍由原編輯器模組維護，不能反向當成故事樓層定稿。同步後需重新建置模型頁，才會更新其中嵌入的資料。
  修改模型原始碼後在 `building/` 執行 `npm install`、`npm run build` 重新產生 `building/index.html`。
- GitHub Pages 設為從 main 分支的根目錄發布。

本輪只更新本地週表的規格連結，沒有核對或改寫 Google 試算表中的派工、工期與完成狀態。概念圖像、配音素材、Godot 功能與真人試玩也不因文件一致而視為已驗收。
