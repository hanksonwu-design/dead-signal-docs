// Operation diagrams for the act scripts: a text-free photo with numbered hotspots, arrows and a step legend,
// one per physical puzzle or mechanism. build-video-list.mjs inserts each image after the first script line
// that starts with `after` (plus the sound or subtitle lines right after it); `act` is the act name in ACTS.
// Files live in assets/07_視聽與介面/assets/ as 示意圖_<scene code>_<name>_v<n>.png.
export const OPERATION_DIAGRAMS = [
  { act: '第一幕', after: '〔操作／介面查閱〕查看功能及來源後，筆記記下 #1 模擬鈴聲', file: '示意圖_R1-03_叫號機三鍵_v1.png', caption: 'R1-03 操作示意：叫號機三個既存功能' },
  { act: '第一幕', after: '〔操作／設備按鍵〕玩家按下現場叫號功能', file: '示意圖_R1-03_播放叫號音_v1.png', caption: 'R1-03 操作示意：播放叫號音' },
  { act: '第一幕', after: '**完成條件（非必要測試）：**鈴聲使輪廓轉向喇叭', file: '示意圖_R1-03_測試鍵反應_v1.png', caption: 'R1-03 操作示意：鈴聲測試與重置測試的反應' },
];
