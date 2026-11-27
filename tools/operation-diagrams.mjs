// Operation diagrams for the act scripts: a text-free photo with numbered hotspots, arrows and a step legend,
// one per physical puzzle or mechanism. build-video-list.mjs inserts each image after the first script line
// that starts with `after` (plus the sound or subtitle lines right after it); `act` is the act name in ACTS.
// Files live in assets/07_視聽與介面/assets/ as 示意圖_<scene code>_<name>_v<n>.png.
export const OPERATION_DIAGRAMS = [
  { act: '第一幕', after: '〔操作／介面查閱〕查看功能及來源後，筆記記下 #1 模擬鈴聲', file: '示意圖_R1-03_叫號機三鍵_v1.png', caption: 'R1-03 操作示意：叫號機三個既存功能' },
  { act: '第一幕', after: '〔操作／設備按鍵〕玩家按下現場叫號功能', file: '示意圖_R1-03_播放叫號音_v1.png', caption: 'R1-03 操作示意：播放叫號音' },
  { act: '第一幕', after: '**完成條件（非必要測試）：**鈴聲使輪廓轉向喇叭', file: '示意圖_R1-03_測試鍵反應_v1.png', caption: 'R1-03 操作示意：鈴聲測試與重置測試的反應' },
  { act: '序幕', after: '〔操作／場景點擊〕 [P0-C06]', file: '示意圖_P0-04_穿過維修柵門_v1.png', caption: 'P0-04 操作示意：兩次拉開維修柵門' },
  { act: '序幕', after: '〔操作／物件操作〕近看鐵網時可以拉一下', file: '示意圖_P1-06_拉鐵網_v1.png', caption: 'P1 操作示意：拉鐵網的時機' },
  { act: '第一幕', after: '〔玩家〕解煞扣，推把手，把車停進牆邊凹位。', file: '示意圖_R2-03_推開送餐車_v1.png', caption: 'R2-03 操作示意：推開送餐車露出梯口' },
  { act: '第一幕', after: '〔操作／物件操作〕 [R5-C01]', file: '示意圖_R5-01_推衣架取得繡布_v1.png', caption: 'R5-01 操作示意：解鉤推開衣架、近看繡布' },
  { act: '第二幕', after: '〔操作／介面點選〕關閉自動重撥，選舊手機留存的 #6', file: '示意圖_R7-01_老周的電話循環_v1.png', caption: 'R7-01 操作示意：關掉自動重撥、選播舊留言' },
  { act: '第二幕', after: '〔玩家〕三個動作逐一選取後確認。', file: '示意圖_R8-04_移紙放蛾與插卡_v1.png', caption: 'R8-04 操作示意：三步移紙放蛾、插卡讀名單' },
  { act: '第二幕', after: '##### 第一個前兆以前', file: '示意圖_R11-02_阿尋兩種攻勢_v1.png', caption: 'R11-02 操作示意：凝視與節指敲擊的躲法' },
  { act: '第三幕', after: '〔操作／物件操作〕玩家把候選件移到插口旁', file: '示意圖_R12-01_挑接頭接線合閘_v1.png', caption: 'R12-01 操作示意：挑接頭、接兩路、扣護蓋合閘' },
  { act: '第三幕', after: '〔操作／場景點擊＋物件操作〕轉動手輪拉回空車', file: '示意圖_T-R12-R14-02_手輪拉回空車_v1.png', caption: 'T-R12-R14-02 操作示意：轉手輪拉回空車' },
  { act: '第三幕', after: '〔操作／場景點擊＋物件操作〕開啟旁通讓錶針落入刻線區', file: '示意圖_T-R12-R14-03_旁通與漏水支管_v1.png', caption: 'T-R12-R14-03 操作示意：先開旁通、再關漏水支管' },
  { act: '第三幕', after: '〔操作／物件操作〕 [R14-C01]', file: '示意圖_R14-01_物流三路繼電器_v1.png', caption: 'R14-01 操作示意：依端點形狀與圖示接三路' },
  { act: '第三幕', after: '〔操作／介面長按〕任一路完成實際機構後', file: '示意圖_R15-03_三種供電方案_v1.png', caption: 'R15 操作示意：三種供電方案與長按確認' },
  { act: '第三幕', after: '〔操作／介面比對＋物件操作〕 [R15-C06]', file: '示意圖_R15-06_巡檢門扣_v1.png', caption: 'R15-06 操作示意：收外扣、轉中輪、壓末桿' },
  { act: '第三幕', after: '〔操作／場景點擊＋物件操作〕查看到站刻線與實體牌', file: '示意圖_T-R15-R16-02_雙閘候梯口_v1.png', caption: 'T-R15-R16-02 操作示意：開外閘、關妥雙閘再上行' },
  { act: '第四幕', after: '〔操作／場景點擊〕玩家逐段選擇移動', file: '示意圖_R18-01_三點掩體潛行_v1.png', caption: 'R18-01 操作示意：依前兆逐段換掩體' },
  { act: '第四幕', after: '〔操作／場景長按〕 [R19-C01]', file: '示意圖_R19-00_慢關門與屏息_v1.png', caption: 'R19-00 操作示意：慢關門、看門下影子、屏息' },
  { act: '第四幕', after: '〔操作／場景點擊〕 [R20-C01]', file: '示意圖_R20-01_桌下躲藏_v1.png', caption: 'R20-01 操作示意：判來向、躲桌下、回控制台' },
  { act: '第四幕', after: '〔操作／介面比對〕叫出本地憑證', file: '示意圖_R20-05_主管操作台核驗_v1.png', caption: 'R20-05 操作示意：主管操作台的掌位與登錄欄' },
  { act: '第四幕', after: '〔操作／場景點擊〕 [R22-C02]', file: '示意圖_R22-03_手勢快速釋放_v1.png', caption: 'R22-03 操作示意：敲門框兩下、左掌向下兩次' },
  { act: '第四幕', after: '〔操作／場景長按〕到位後才起獨立操作窗', file: '示意圖_R22-04_手動緊急釋放_v1.png', caption: 'R22-04 操作示意：先 A 防火扣、再 B 釋放桿' },
];
