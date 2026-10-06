import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { ACTS, APPENDIX } from './screenplay-files.mjs';

const read = file => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const story = act => read(`docs/${ACTS[act].path}`);
const spec = act => read(`docs/${ACTS[act].specPath}`);
const appendix = read(`docs/${APPENDIX}`);
const includes = (source, phrases) => {
  for (const phrase of phrases) assert(source.includes(phrase), `Missing contract: ${phrase}`);
};

test('Xiaohua disclosure keeps a written source, adult chronology and unchanged death', () => {
  includes(story(2), ['說做完這批就能換工作', '我沒有答應。不要替我寫願意。', '修理桌草圖']);
  assert(!story(2).includes('我遭到性侵'));
  includes(story(4), ['我遭到性侵。我要求就醫、停止出鏡，並聯絡家人。', '不要改成我不肯工作', '申請的日期早於同案入區核可', '附件已閱', '出勤態度', '不予轉送']);
  includes(spec(4), ['個案識別沿用小花原排程', '原 Michelle 核可欄同頁', '不因此被指定為主角或阿彪', '不新增第二次校正或改寫死因']);
  includes(appendix, ['小花成年後入園', '三週觀察', '六週半留置', '不以受害程度決定力量', '第七日晚死於校正區', '第八日起']);
});

test('anonymous testimony remains separate from Xiaohua and material-gap evidence', () => {
  includes(story(2), ['他們說要讓家人看到。我不敢告訴任何人。', '這句請一起留下。', '紙上沒有署名']);
  includes(spec(2), ['不指定當事人為小花', '不證明素材內容、實際散布或後續命運', '214 筆索引／197 張儲存卡', '17 筆明示刪除狀態']);
  includes(spec(7), ['兩個案例不合併成同一個受害者', '不以簽名認定她遭性侵的直接施暴者']);
});

test('updated pages cannot be unlocked by old read flags or a different paper side', () => {
  includes(spec(2), ['舊 `request` 不自動換成 `request_v2`', '`testimony_back`', '正反面分別確認已讀']);
  includes(spec(4), ['`request_v2`', '`reply_v2`', '舊 `request`／`reply` 不自動升級']);
  includes(spec(7), ['R21 合併責任摘要須兩個 v2 鍵皆成立', '不能解鎖新版求助或覆核', '在此看摘要也不回填來源']);
  includes(appendix, ['只有一頁時只顯示該頁', '原 E2-15 取得不代替求助頁', '過不可逆點不強迫回頭']);
  includes(story(7), ['每份只展開已讀頁', '讀過申請與覆核兩頁時']);
});

test('optional non-graphic disclosure has art coverage and matching content notices', () => {
  includes(spec(2), ['| R8-D03 |', '| R9-D02 |', '交付求助頁正反面']);
  includes(spec(4), ['| R21-D02 |', '只製文件與無聲轉錄，不製受害影像']);
  includes(spec(7), ['| R29-D08 |', '復用原圖']);
  includes(appendix, ['性侵與性羞辱的非露骨文字敘述', '略過不影響原主線、通行或結局', '也不會在 R29 自動補播或補字']);
  const novel = read('docs/09_故事劇情/17_縮寫短文.md');
  includes(novel, ['內容提醒', '我遭到性侵。我要求就醫、停止出鏡，並聯絡家人。', '收件日期早於入區核可']);
  assert.equal(ACTS.length, 10);
  const graph = JSON.parse(read('scene_graph.json'));
  const flow = JSON.parse(read('scene-flow.json'));
  assert.equal(graph.nodes.length, 48);
  assert.equal(graph.edges.length, 56);
  assert.equal(flow.subscenes.length, 72);
  assert.equal(Object.keys(flow.images).length, 523);
});
