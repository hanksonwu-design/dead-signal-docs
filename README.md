# 灰燈寨｜企劃文件瀏覽器

《灰燈寨》敘事恐怖解謎遊戲的企劃文件網站。

以[遊戲劇本總目錄](docs/09_劇本/09-14_全劇本與關卡整合稿.md)連結的十份分幕正文、十份同幕製作規格及共用附錄為正式依據。劇情與技術規格分檔維護；文件仍待審，未完成實機驗收。

## 瀏覽

開啟此儲存庫的 GitHub Pages 網址，可使用分類、搜尋、文件閱讀及場景節點導覽。
製作時程中的 Google 試算表連結沿用原檔案權限。

「遊戲劇本」提供序幕至終幕的十份連續正文，保留台詞、演出、玩家操作、解謎因果與分支。「製作規格」另提供十份同幕文件，收納逐房技術條件、狀態保存、素材圖像與驗收；每個場景可在正文與規格間往返。跨幕共用設定與完整年表只保留於[共用附錄](docs/09_劇本/09-15_正式劇本_共用附錄.md)。「精簡版小說」保留[同設定小說](docs/09_故事劇情/17_縮寫短文.md)，不是另一套世界觀或操作規格。

## 修改文件

劇情只修改 `docs/09_劇本/09-03` 至 `09-10` 的對應幕別；逐房技術規格只修改 `docs/10_製作規格/` 的同幕文件；跨幕共用規格只修改 `09-15_正式劇本_共用附錄.md`。`09-14_全劇本與關卡整合稿.md` 沿用舊檔名，但現在只是總目錄，不存放重複正文。50 份分類文件是可重建的查閱副本；舊 06 文件與其餘退役 09 文件只保留轉介入口。不要在副本維護第二套正文，也不要手動改 `docs.json`、`scene_graph.json`、`scene-flow.json` 或 `building/data.js` 的衍生欄位。

修改主稿後執行：

```powershell
node tools/build-scene-images.mjs
node tools/sync-canonical.mjs
node tools/build-story-inventory.mjs
node tools/test-scene-images.mjs
node tools/test-scene-flow.mjs
node tools/test-scene-overview.mjs
node tools/test-two-towers.mjs
node tools/test-canonical.mjs
node tools/build-docs.mjs
npm --prefix building run build
```

`node tools/sync-canonical.mjs --check` 檢查分類副本與場景資料；`node tools/build-docs.mjs --check` 檢查網站資料包。縮寫小說仍需人工依主稿複核，不從規格機械拼接。修改前備份為 `archive/2026-09-30-canonical-sync/before-sync.zip`。

場景主圖、過渡鏡位、物件近看及文件頁只在各幕製作規格的 `scene-images` 表格維護；既有 H／B 熱點與圖號的對應在同房 `hotspot-images` 表格維護。新增原熱點時也須補對圖，不能只在正文列出物件。`build-scene-images.mjs` 檢查原熱點覆蓋，並同步劇本段落中的圖號連結、各幕連線圖號、場景道具總表與 `scene-flow.json`；加 `--check` 可檢查是否同步。一列可能含多頁或差分，並非已完成的一張圖。48 個宏觀流程節點與 56 條動線不等於全部畫面節點；新畫面不能默默新增關卡門檻。更動原動線時，先執行 `sync-canonical.mjs` 更新場景圖，再重建圖單與相關查表。

「場景與流程」統一於 `building/`：以 3D 為主，下方可展開章節流程總覽，按「主場景 → 過渡次場景 → 下一場景」連接；選取會同步更新 3D、流程圖及右側詳情。可篩選上下部、章節與樓層，搜尋主場景、次場景、目標及支線；右側保留正式房內步驟、支線收集、全部出入路線條件與完整圖像需求。未具備 WebGL 或繪圖環境中斷時，切換至同一頁的流程總覽。這是製作查閱介面，不模擬解鎖或任務完成狀態。

48 個主節點與 72 個次場景各畫一次。72 個次場景分為 33 個探路次場景、25 個可查看過渡與 14 個轉場接景；未配置獨立路段圖的連線沿用兩端畫面，物件近看不增加移動節點。分岔、捷徑、單向與回返沿用原條件，章節篩選外的目的地只顯示銜接入口，不新增房間。舊 `#scene=R2&route=R2-R3-5&shot=T-R2-R3-01` 網址保留定位轉址到 `building/`，也保留回程方向與內容標示。現有概念圖或出入口草圖僅作參考；523 筆正式畫面規格仍標示待製作，不代表已有遊戲美術素材。

流程圖的樓層標示由各房「樓層定位」「樓棟定位」及 `scene-floor-locations` 次場景表產生；次場景另填「移動方式」。A 棟最高 26F、B 棟最高 50F，共用地基；15F、22F、26F 同層跨棟，B 棟 L1 連 29／30／31F、L2 連 47／48F。每個房間與單一平台必須指定一層，不能填區段範圍。實際跨層畫面用 `起點 → 終點`，整條路線依次列出中途平台；回程同時反轉樓棟與樓層方向。M1 是 44F → 45F 七窗夾道；U2b／U4b／U6b 分別為 46F 橋下、48F 檢修蓋下與 49F 水箱下夾層；結局與片尾保留演出性質，不新增可探索樓層。`tools/scene-floors.mjs` 與 `tools/scene-buildings.mjs` 共用驗證與讀取，劇本、製作規格、總表和全劇 3D 定位保持一致。

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
- 場景節點圖：`scene_graph.json`；銜接次場景、圖號與參考圖：`scene-flow.json`。
- 場景與流程：`building/`，可加 `#scene=R25`，也接受 `route`、`shot`、`direction`、`marker` 參數。舊關卡流程入口自動轉到同一介面，不再維護獨立頁面。
  模型涵蓋 B3 至 50F 的 48 個流程節點、72 個次場景與 56 條動線；其中 46 個節點有空間配置（含 M1 跨層脊柱），51 條為實體銜接。R33／POST 及 5 條回返／結局演出不虛構房間或通道。主場景、次場景、圖號、通行條件與來源由 `scene_graph.json`／`scene-flow.json` 直接嵌入，尺寸與平面配置仍屬灰盒提案。
  目前模型以 1 單位 = 1 公尺校正物件，參考尺寸集中在 `building/human-scale.js`：人形高 1.7 公尺、床墊 1 × 2.05 公尺、桌面高 0.75 公尺、椅面高 0.45 公尺、門淨高 2.1 公尺、步道寬 1.2 公尺。標準層高暫估 3.2 公尺；壓縮模式只縮短空白樓層，不縮放家具。階梯以級高不超過 0.18 公尺、踏面至少 0.28 公尺為灰盒目標，過短的斜段改為折返梯；出入口、樓層停靠與流程不變。人形及完整牆高可以關閉。這些是設計參考值，房間平面、迴轉平台、淨空與碰撞仍須實機及建築配置驗證，不代表實測或法規合格。
  全劇模型為查閱模式，不讀寫配置存檔；正式導覽已移除舊沙盒入口。既有上部 3D 編輯器封存保留於 `building/editor.html` 原網址，仍有 26 個原始節點、30 條故事連線與出口接點，沿用原本機儲存鍵、匯入／匯出和復原功能；不清除舊配置，舊自訂 R23 等編號不會被新正式場景取代。
  先同步正式資料，再於 `building/` 執行 `npm run build`，同時產生全劇 `index.html` 與上部 `editor.html`。執行 `node building/current-spatial.test.mjs` 驗證全流程幾何與資料；`reviews/verify-current-model.cjs` 檢查桌面／手機、圖號、樓層、連結與舊存檔隔離。
  `building/scene-workspace.test.mjs` 驗證整合資料、圖像覆蓋與舊網址；`reviews/verify-scene-workspace.cjs` 檢查同步選取、章節總覽、手機與無 WebGL 的備援介面。`scene-overview.js` 是共用流程排版，`scene-redirect.js` 僅處理舊網址轉址。
- GitHub Pages 設為從 main 分支的根目錄發布。

本地週表的規格連結納入文件檢查；Google 試算表中的派工、工期與完成狀態仍須另行核對，不能視為已同步。概念圖像、配音素材、Godot 功能與真人試玩也不因文件一致而視為已驗收。
