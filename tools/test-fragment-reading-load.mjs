import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {parseMaster} from './sync-canonical.mjs';
import {FRAGMENT_IMAGE_FORMS} from '../building/fragment-sources.js';

const master = parseMaster();
const block = id => {
  assert(master.blocks.has(id), id);
  return master.blocks.get(id);
};
const includes = (text, phrases) => phrases.forEach(phrase => assert(text.includes(phrase), phrase));
const read = file => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

test('manual reading uses existing chapters and does not duplicate the printed process shot', () => {
  const story = block('s-0905-11');
  assert.equal((story.match(/01 → 02 → 03 → 04 → 05/g) || []).length, 1);
  includes(story, ['S-03', '完整原頁隨時可展開', '仍停在剛才那頁', '三句各佔一行']);
  assert(story.indexOf('翻到應對章') < story.indexOf('主角（OS）'));
  includes(block('s-0603-5'), ['E1-15 首次取得沿原規則', '分配聯和 #12 索引各沿原取得條件', '未讀章不自動補齊']);
});

test('R16 keeps identification, execution and customer comparison distinct before the reveal', () => {
  includes(block('s-0906-37'), ['原識別碼與人員列', '信任、服從、崩潰、離開風險', '門檻、核可者與執行狀態', 'RX-17、D-17 及日期', 'E2-04', 'E2-05']);
  includes(block('s-0906-38'), ['K-114', 'K-207', 'K-089', '三個客戶編號及處置列始終可見', 'E2-14']);
  includes(block('s-0604-8'), ['選列不等於自動完成 E2-04', '未釘也能完成', '三種供電有同等必要資訊', '最後仍由三格鎖定成立結論']);
});

test('R23 crops retain field identity and preserve all three versions with one confirmation', () => {
  includes(block('s-0908-8'), ['原工作、誘入承諾與到場分配', '入境、建檔與面試', '來源標頭和頁碼', '整組確認一次後取得 E4-01', '尚未讀到的頁面保持未讀', '跨人的改寫留到 R24']);
  includes(read('docs/10_製作規格/10-06_製作規格_第五幕.md'), ['三種局部僅是閱讀入口', '原三版逐項核對與一次確認不變', '局部由同一原頁裁取']);
});

test('R29 overlays preserve months, approval content and the original aftermath', () => {
  includes(block('s-0909-26'), ['透明疊片', '月份、頁碼與來源', '2025 年 8、9、10 月', '提價', '原頁影像、頁碼、筆勢']);
  includes(block('s-0607-8'), ['三個月份與提價資訊', '低動態改用靜態並排', '先保存 E5-02', '二十秒責任停頓後']);
});

test('R30 visual comparison does not replace chronology, five-source placement or commitment', () => {
  includes(block('s-0909-45'), ['同拍攝方向的震前／震後快照', '舊刻度、內側焊珠', '五個來源的位置仍由玩家親手安置', 'E3-07 隨有效前情']);
  includes(block('s-0607-25'), ['不由焊珠形狀單獨推得封門日期', '五位置空白待玩家安置', '未確認原不可逆警示就不發 E5-06', '沉降及制動不因切換讀法提前觸發']);
});

test('R31 groups are navigation rather than new identity or remount gates', () => {
  includes(block('s-0909-53'), ['「帳號與簽勢」「門端與方向」兩組', '可自由切換', '02:20:11', '第二道門未驗證完成', '02:20:22 下行', '玩家沿五列親自接起新舊來源']);
  includes(block('s-0607-10'), ['任一組可先查', '五列仍逐項核對', 'E5-08 掛載另行成立', '兩組不是兩次第五層提交']);
});

test('fragment reading stays media-neutral, resumable and subject to original safety exceptions', () => {
  includes(block('s-0304-19'), ['id="fragment-reading-contract"', '原件沒有日期或姓名時維持空白', '焦點只用來接續畫面，不是新解鎖條件', '圖表改為可點選', '不因此多發影證或多算碎片', '不開放未接通的 R15 原文', '不停止 R28 房間檢視倒數', '十二秒解凍', '沒有固定閱讀秒數']);
  for (const id of ['R7-D01', 'R16-D01', 'R16-D02', 'R16-D03', 'R23-D01', 'R29-D01', 'R31-D01']) assert.deepEqual(FRAGMENT_IMAGE_FORMS[id], ['文證']);
  assert.deepEqual(FRAGMENT_IMAGE_FORMS['R30-D01'], ['影證', '文證']);
  assert.equal(FRAGMENT_IMAGE_FORMS['R23-D02'], undefined, 'the comparison UI is not new evidence');
});
