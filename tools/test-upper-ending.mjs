import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { ACTS, APPENDIX } from './screenplay-files.mjs';
import { start, act } from '../playtest-model.mjs';

const read = file => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const story = n => read(`docs/${ACTS[n].path}`);
const spec = n => read(`docs/${ACTS[n].specPath}`);
const block = (source, id) => {
  const begin = source.indexOf(`<!-- import:${id}:begin -->`);
  const end = source.indexOf(`<!-- import:${id}:end -->`, begin);
  assert(begin >= 0 && end > begin, `Missing source block ${id}`);
  return source.slice(begin, end);
};
const includes = (source, phrases) => {
  for (const phrase of phrases) assert(source.includes(phrase), `Missing contract: ${phrase}`);
};

test('Act III separates reading beats without auto-solving either source chain', () => {
  const reading = block(spec(3), 's-0604-1');
  includes(reading, ['不自動彈出分流頁', '沒有最低停留時間', '原頁、已核欄位與調查板草稿',
    'E2-04／E2-05／E2-14 三格仍由玩家放置並確認', '不代發來源', '不重置已讀或先顯 RT-3／C-02']);
  const reveal = block(story(3), 's-0906-40');
  assert.equal((reveal.match(/〔系統／完成回饋〕/g) ?? []).length, 1);
  includes(reveal, ['兩份評級，用的是同一套規則。', 'E2-04', 'E2-05', 'E2-14', '回安全全景至少 3 秒']);
  assert(!spec(3).includes('[系統] 管理模型用途已確認。'));
  includes(block(story(3), 's-0906-37'), ['可以收起回執', '再開時接續原頁']);
});

test('R8 to R22 emotional recall requires the actual memory, not an optional dossier', () => {
  includes(block(story(2), 's-0905-26'), ['小花把剛打好的短尾雙結托在她掌心', '針線和兩人的手都停著', '自己的修理桌']);
  const source = block(spec(2), 's-0603-29');
  includes(source, ['scene_detail.r8.read_pages', 'knot_memory', '舊存檔缺該頁鍵時採未看',
    '不由讀卡、E2-02、小帳或 moth.released 推定', '不作出口或結局條件']);
  const finale = block(spec(4), 's-0605-23');
  includes(finale, ['knot_memory', '缺鍵採未看', '不播新的歷史回憶', '無聲版提供相同台詞',
    '減少動態版用掌心已鬆開的靜止差分']);
  includes(block(story(4), 's-0907-47'), ['這次，等我一起走。', '……這次？', '掌心留出一個空位']);
});

test('both finale routes retain their inputs, windows, erased states and voluntary crossing', () => {
  includes(block(story(4), 's-0907-40'), ['四次點擊', '第四次正確輸入後', '低頭 6 秒', '門維持開啟']);
  includes(block(story(4), 's-0907-41'), ['3.8 秒', '3 秒長按', '2.8 秒', '至少 0.8 秒', '已完成的 A 保持開啟']);
  const finale = block(spec(4), 's-0605-23');
  includes(finale, ['不加第五個步驟', '不追加第三鎖或追逐', '不要求六秒內衝門',
    '不補衣領、人影、腳步或服從聲', '拒絕路不出現過去手勢疊影',
    '較晚走到踏台不重播六秒', '保存失敗留在安全門前可重試']);
  const script = story(4);
  assert(script.indexOf('[R22-05]') < script.indexOf('[ACT4-02]'));
  includes(block(script, 's-0907-48'), ['玩家自行跨門', '保存成功後進入上部片尾', '下部從 R23']);
});

for (const [route, actions, reaction] of [
  ['手勢路', ['敲門框', '敲門框', '掌心下壓', '掌心下壓'], '原噤聲者低頭'],
  ['手動路', ['解 A 扣', '拉 B 桿'], '原噤聲者仍站直'],
]) {
  test(`abstract R22 ${route} feedback cannot complete or cross the finale automatically`, () => {
    let state = act(act(start('r22'), '觀察'), route);
    for (let i = 0; i < actions.length; i++) {
      state = act(state, actions[i]);
      assert.equal(state.step, i + 1);
      assert.equal(state.done, false);
      if (i < actions.length - 1) assert(!state.msg.includes('踏面開放'));
    }
    assert(state.msg.includes(reaction));
    state = act(state, '跨門');
    assert.equal(state.done, false);
    state = act(state, '走到安全踏台');
    assert.equal(state.step, 10);
    assert(!state.msg.includes('這次，等我一起走。'));
    state = act(state, '深層出口');
    assert.equal(state.step, 11);
    includes(state.msg, ['這次，等我一起走。', '掌心留空', '門仍開著']);
    assert.equal(state.done, false);
    assert.equal(act(state, '跨門').done, true);
  });
}

test('work orders and split contract preserve a complete upper part without invented conversion claims', () => {
  const appendix = read(`docs/${APPENDIX}`);
  includes(block(appendix, 's-0307-3'), ['當部完成與續篇動機分開成立', '不是理解片尾的門票']);
  includes(block(appendix, 's-0307-6'), ['最少必要內容', '猜到主管身分', '尚不能宣稱已能促成購買']);
  includes(block(appendix, 's-0810-24'), ['上部收尾補強交付', '須另估工時', '均待製作']);
  const flow = JSON.parse(read('scene-flow.json'));
  assert.equal(Object.keys(flow.images).length, 538);
  for (const id of ['R8-C02', 'R16-D01', 'R16-D02', 'R16-D06', 'R22-V01', 'R22-C02', 'R22-C03', 'R22-C06']) {
    assert(flow.images[id], `Missing work order ${id}`);
  }
  const novel = read('docs/09_故事劇情/17_縮寫短文.md');
  const chapter = novel.slice(novel.indexOf('## 第四幕'), novel.indexOf('## 第五幕'));
  includes(chapter, ['緊急鎖', '輪廓沒有低頭', '路是我打開的', '這次，等我一起走。', '我跨過門檻']);
});
