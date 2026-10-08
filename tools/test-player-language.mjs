import assert from 'node:assert/strict';
import test from 'node:test';
import {parseMaster} from './sync-canonical.mjs';
import {ACTS} from './screenplay-files.mjs';
import {MAIN_MARKERS} from '../building/marker-definitions.js';

const master = parseMaster();
const block = id => {
  assert(master.blocks.has(id), id);
  return master.blocks.get(id);
};
const spec = act => master.documents.get(ACTS[act].specPath);
const has = (text, ...phrases) => phrases.forEach(phrase => assert(text.includes(phrase), phrase));

// Check authored UI contracts and source fidelity, not player comprehension or engine behavior.
test('source names reduce code load without leaking identity or completed board slots', () => {
  has(block('s-0900-4'), '原件名稱、縮圖及物證／聲證／影證／文證',
    'A／B／C 是本次比對的位置', '不在尚未解題時替三張候選卡標好正確格位',
    '未知姓名維持原稱呼', '內控、校正、轉運、留用',
    '推理成立、記下通路與設備准許開門分別判定', '仍到原現場設備操作',
    '文件測試不代表玩家已理解');
});

test('R12 readable account fields retain original values and manual access verification', () => {
  const story = block('s-0906-5');
  for (const text of [story, spec(3)]) has(text, '工具櫃紀錄', '藥品櫃紀錄',
    '帳號：MAINT-A3／身分：主管', 'MAINT-A3 / SUPERVISOR', '啟用本層門禁');
  has(story, '兩欄核對完，再按下確認', '來源留在輸入欄旁', '日期各自保留');
  has(spec(3), '手輸與選取走同一核驗', '不自動填滿', '不標操作人姓名',
    '已修復供電、兩欄一致及原本地憑據有效', '不增加按第二次確認');
});

test('R16 plain login status does not identify the operator or execute a targetless action', () => {
  for (const text of [block('s-0906-40'), spec(3)]) has(text,
    '先前的登入已恢復／權限資料無法查看', '舊工作階段已恢復／權限層級：遮蔽');
  has(block('s-0906-41'), '先接通現場設備、完成權限確認，再選擇現場目標。',
    '完成後，該訊號無法恢復。', '目標欄留白');
  has(spec(3), '系統此時不替她命名', '目標留白，此處只呈現說明，不執行抹除');
});

test('R17 named sources retain both route chains and neutral completion feedback', () => {
  const story = block('s-0906-58');
  for (const text of [story, spec(3), block('s-0900-4')]) has(text, '服務門通路紀錄', 'K2-01');
  has(story, '32-S → N-2 → RT-3 → C-02', 'E3-03', 'E3-06', 'E3-07', 'E2-08',
    '字色、聲音、停頓與初次驗證相同', '沒有先畫好的正確路徑', '姓名未確認');
  has(block('s-0906-59'), '32-S → N-2 → RT-3 → L-04', '沒有可證明震損後仍有效的日期');
  has(spec(3), '不能自動按代碼配對', '不提前標「正確出口」或尚未到訪的目的房名稱',
    '不能單靠自檢表或 R16 憑據填出整條路由');
  const imageRow = spec(3).split('\n').find(line => line.startsWith('| R17-D10 |'));
  has(imageRow, '共用「服務門通路紀錄」與完成回饋，不預標正誤');
  assert(!imageRow.includes('分開回饋'));
  assert.equal(MAIN_MARKERS.R17.find(([category, image]) => category === 'puzzle' && image === 'D10')[2], '服務門來源與日期比對');
});

test('R28 single-page warning and outcomes match the selected page rather than imply total loss', () => {
  const story = block('s-0909-24');
  const warning = '只能保留其中一頁。確認後，其他頁面將無法再讀取。';
  for (const text of [story, spec(7), block('s-0900-4')]) has(text, warning, '保留這一頁');
  for (const text of [story, spec(7)]) has(text,
    '已保留：〈所選頁面名稱〉。其他頁面全文已無法讀取。',
    '未保留任何頁面。三頁全文已無法讀取。', '刪除紀錄已保存');
  has(story, '預覽還未載入任何一頁全文', '標準 90 秒', '放大閱讀、設定、失焦及暫停均停表',
    '最後 1.5 秒', '選定即保存', '離房再回來也不能改選');
  has(spec(7), '不新增確認視窗', '已保存頁仍可開啟', 'none_timeout', '桌上紙本不消失');
  assert(!story.includes('完整頁槽'));
  assert(!story.includes('已保存刪除發生證明。內容不可復原。'));
});

test('R31 named prerequisites keep the source requirements and historical time separate', () => {
  const story = block('s-0909-55');
  for (const text of [story, spec(8)]) has(text, '「通行碼」「資料目錄」「設備供電」',
    '接回備份資料', 'COLD_ARCHIVE_REMOUNTED');
  has(story, '五段通行碼', 'R29 留下的本地資料目錄與現場電力',
    '01:50 的舊排程留在另一欄', '完成原三項核對後', '只列出這次能核實的原件');
  has(spec(8), 'F1–F5', '不新增三次確認', '不能由點亮勾選代替有效條件',
    '先做五列或先掛載皆可');
  assert.equal(MAIN_MARKERS.R31.find(([category, image]) => category === 'puzzle' && image === 'D03')[2], '接回備份資料');
});
