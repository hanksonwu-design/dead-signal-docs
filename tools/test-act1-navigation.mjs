import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { ACTS, APPENDIX } from './screenplay-files.mjs';
import { parseMaster } from './sync-canonical.mjs';
import { stripReadingInline } from './reading-scene-flow.mjs';

const master = parseMaster();
const story = act => master.documents.get(ACTS[act].path);
const spec = act => master.documents.get(ACTS[act].specPath);
const block = id => stripReadingInline(master.blocks.get(id));
const flow = JSON.parse(readFileSync(new URL('../scene-flow.json', import.meta.url), 'utf8'));
const has = (text, ...phrases) => phrases.forEach(phrase => assert(text.includes(phrase), phrase));
const ordered = (text, ...phrases) => {
  let position = -1;
  for (const phrase of phrases) {
    const next = text.indexOf(phrase, position + 1);
    assert(next > position, phrase);
    position = next;
  }
};
const row = (act, image) => spec(act).split('\n').find(line => line.startsWith(`| ${image} |`) &&
  /\| (主場景|操作近看|出口接景|過渡場景) \|/.test(line));

test('R1 early backroom clicks reveal an existing obstruction without granting observations', () => {
  has(block('s-0904-3'), '等候椅仍是空的', '唯一可繞往後室的窄口', '若先點櫃檯後門', '膝腿殘影');
  has(spec(1), '同一組 E-01', '不補寫任何已讀、凝神辨識或完成旗標',
    '不重播初現、不扣資源、不啟動追逐', '電視舊檔是否播完仍不作門檻',
    '叫號完成時同次清除椅列與窄口殘影', '回訪與舊完成存檔維持暢通');
  ordered(block('s-0904-6'), '等待循環已結束。', '窄口的鞋影與膝腿殘影一同散去');
  has(row(1, 'R1-V01'), '初見鞋影、近門膝腿阻路、叫號後地磚清空', '低動態');
});

test('P2 entry explains the one-way door before the original crossing input', () => {
  ordered(block('s-0903-26'), '抵達頂端，門上只有梯間側橫推桿', '單向通行／通過後自閉',
    '玩家可沿梯退回 P2', '點擊原推門熱點才跨入大廳', '手壓下橫推桿', '斜舌扣入門框');
  has(block('s-0904-3'), '大廳側只剩沒有把手的平鐵皮', '庫房門的鎖舌已損壞');
  has(spec(0), '跨門提交前存讀回梯間原安全站位', '提交後回 R1 門內', '不追加確認點擊');
  has(spec(1), '地下梯段門與櫃檯後庫房門為不同門件', '安全站位始終在大廳側');
  has(row(0, 'P2-V02'), '兩幕共用一次推門演出與輸入', '跨門前可退回梯間', '大廳側平板無把手');
  const entry = flow.nodes.find(node => node.id === 'R1').access.find(port => port.route === 'P2→R1');
  has(entry.state, '閉門器', '大廳側無把手');
});

test('Act 1 reading order returns to the actual branch before the ascent and workshop', () => {
  ordered(story(1), 'id="node-r3-script"', 'id="node-r4-script"', 'id="node-r4b-script"',
    'id="s-0904-49"', 'id="transition-r3-r5-script"', 'id="node-r5-script"');
  assert(!block('s-0904-23').includes('transition-r3-r5-script'));
  has(block('s-0904-49'), '穿回洗衣窄巷', '回到 2F 宿舍', '也可初到宿舍就先選工場',
    '沿原路返回', '抵達 R5 的入口並親自進門');
  assert.equal(story(1).split('id="transition-r3-r5-script"').length, 2);
});

test('R4 remains necessary, R4b optional, and the fork does not reveal unread evidence', () => {
  has(spec(1), 'R4 是可晚去的必要調查分支', '只有 R4b 神壇及其觀察可完全略過',
    '不以閱讀順序強迫先去神壇', '不預告血字內容、不補 E1-03 或 F1');
  has(block('s-0904-18'), '人工刻痕', '字仍遠得讀不清', '也可以先上工場');
  has(block('s-0904-42'), '`E1-03` 血字遺言', '先沿已走通的夾道返回宿舍');
  has(row(1, 'R3-V01'), '不可讀姓名、血字或 F1', '未查刻痕也能上工場');
  const routes = flow.routes.filter(route => ['R3', 'R4', 'R4b', 'R5'].includes(route.from) && route.to !== 'R6');
  assert.deepEqual(routes.map(route => [route.from, route.to, route.back]),
    [['R3', 'R4', true], ['R3', 'R5', true], ['R4', 'R4b', true]]);
});

test('R5 departure separates local unlock, cancellation, commitment and later arrival', () => {
  has(block('s-0904-44'), '僅工坊側放行', '閉門接點與插銷相連');
  ordered(block('s-0904-45'), '門扇微開', '門合上後，就無法從這側返回工坊。',
    '選「留在工坊」', '選「繼續」後跨過原門檻', '原低壓插銷復位', '9F 共用熱水槽');
  has(spec(1), '選「留在工坊」不提交路線，門端核對成果保留', '門閉與原單向 committed 同次保存',
    '9F、10F 已到平台可雙向查路', 'R6 到訪只在親自進該房後提交',
    '已離幕舊檔補還原門閉差分，不補觀看、證據或返程權限');
  has(row(1, 'R5-C04'), '微開門兩面', '原插銷復位', '不代做 9F／10F 操作');
  has(row(1, 'T-R5-R6-01'), '無工坊側釋放端');
  const exit = flow.nodes.find(node => node.id === 'R5').access.find(port => port.route === 'R5→R6');
  has(exit.state, '原插銷復位', '不能重開回 R5');
});

test('published routes preserve every floor and original one-way boundary', () => {
  const route = (from, to) => flow.routes.find(item => item.from === from && item.to === to);
  assert.equal(route('P2', 'R1').back, false);
  assert.equal(route('R1', 'R2').back, true);
  assert.deepEqual(route('R3', 'R5').steps.map(step => step.id),
    ['R3', ...[1, 2, 3, 4, 5].map(i => `T-R3-R5-0${i}`), 'R5']);
  assert.deepEqual(route('R5', 'R6').steps.map(step => step.id), ['R5', 'T-R5-R6-01', 'T-R5-R6-02', 'R6']);
  assert.equal(route('R3', 'R5').floor.label, '2F → 3F → 4F → 5F → 6F → 7F → 8F');
  assert.equal(route('R5', 'R6').floor.label, '8F → 9F → 10F → 11F');
  assert.equal(route('R5', 'R6').back, false);
  assert.equal(flow.nodes.length, 48);
  assert.equal(flow.routes.length, 56);
  assert.equal(flow.subscenes.length, 72);
  assert.equal(Object.keys(flow.images).length, 557);
});

test('shared rules and novel use the same door causes and return path', () => {
  has(master.documents.get(APPENDIX), '具體機構只套用這兩扇門', '大廳側無把手', '核對端只在工坊側');
  const novel = readFileSync(new URL('../docs/09_故事劇情/17_縮寫短文.md', import.meta.url), 'utf8');
  has(novel, '我沿洗衣窄巷回到二樓宿舍', '四樓早餐攤', '斜舌在身後扣回', '僅工坊側放行');
  assert(!novel.includes('四樓共用水槽'));
});
