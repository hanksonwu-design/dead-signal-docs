import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {ACTS, APPENDIX} from './screenplay-files.mjs';
import {parseMaster} from './sync-canonical.mjs';
import {collectSceneImages, buildSceneImageOutputs} from './build-scene-images.mjs';
import {readingMarkerData} from './build-reader-markers.mjs';
import {locateReadingMarkers, screenplayBody} from '../building/screenplay-marker-placement.js';

const master = parseMaster();
const story = act => master.documents.get(ACTS[act].path);
const spec = act => master.documents.get(ACTS[act].specPath);
const common = master.documents.get(APPENDIX);
const graph = JSON.parse(readFileSync(new URL('../scene_graph.json', import.meta.url)));
const collection = collectSceneImages(graph);
const includes = (text, phrases) => phrases.forEach(phrase => assert(text.includes(phrase), phrase));
const ids = ['R4-V02', 'R4-C06', 'R4-D02', 'R6-V02', 'R6-C05', 'R6-D04', 'R6-V03', 'R6-C06', 'R6-D05'];

test('communal rooms have independent work orders and reversible local entrances without mainline edges', () => {
  includes(spec(1), ['A 棟 2F', 'R4-V01 ↔ R4-V02', '不接 R4b、R5 或其他樓層', '不要求先收 F1']);
  includes(spec(2), ['A 棟 11F', 'R6-V01 ↔ R6-V02 ↔ R6-V03', 'V03 只從原門退回 V02', '零選填同樣能去 R7']);
  for (const id of ids) {
    const row = collection.rows.find(row => row.id === id);
    assert(row, id);
    assert.equal((master.documents.get(row.act.path).match(new RegExp(`\\[${id}\\]\\(`, 'g')) || []).length, 1, id);
    if (id.includes('-V')) assert(row.content.startsWith('房內次場景：'), id);
  }
  assert.equal(collection.rows.length, 557);
  assert.equal(graph.nodes.length, 48);
  assert.equal(graph.edges.length, 56);
  assert(graph.edges.every(edge => !/commons|meal_roll|water_log/.test(edge.gate)));
});

test('water and meal comparisons require their actual pages and do not invent victims or stolen portions', () => {
  includes(story(1), ['到場記錄不等於用到水', '未看完整頁時，先保留各自摘記']);
  includes(spec(1), ['wash_roll', 'water_log', '日期及班次吻合', '玩家主動確認', '不代發新的 D02 來源']);
  includes(story(2), ['應領 24／簽領 24', '實配 21／扣留 3', '主管餐盒列在另一批', '對不上的頁可以收回重排']);
  includes(spec(2), ['D04 簽領頁與 D05 底聯都實讀', '不計主線錯配', '不解鎖 CARE 或管理身分',
    '不能把這三份推定為主管所吃', '雙頁、日期／批次／數量核對與確認', '不同日期不合併成一次扣配給事件']);
  includes(common, ['不支持三人死亡', '不提前確認任何住客身分', '只有康因職務持有對外聯繫權限']);
});

test('historical delivery is not a cross-floor shortcut and communal facilities are not recovery stations', () => {
  includes(story(1), ['11F 配膳，2F 分送', '六個蓮蓬頭都乾著']);
  includes(spec(1), ['來源：2F 廁所刻痕殘留', '8F 工場不以直接聽見 2F 窗口聲定位', '沒有等待洗澡']);
  includes(spec(2), ['歷史配送牌繞過當前斷層', '灶台與供水均不可用', '不設飢餓', '不要求返 11F']);
  assert(!master.text.includes('四樓廁所刻痕殘留'));
});

test('empty dining sound occurs only on the optional return and respects reading and save boundaries', () => {
  includes(spec(2), ['首次實際由 V03 退回 V02', 'meal_echo_played', '不要求先完成核對',
    '離場立即終止尾音', '回訪不重播或排隊補播', '原熱點發生，不帶入食堂', '無需辨聲作答']);
  includes(spec(1), ['不在浴間重播', '不增加浴簾嚇點']);
  const markers = readingMarkerData()[ACTS[2].path];
  const horror = markers.find(row => row.id === 'R6-V02-horror');
  assert(horror);
  const body = screenplayBody(story(2));
  const {found, issues} = locateReadingMarkers(body, [horror]);
  assert.deepEqual(issues, []);
  assert(body.split('\n')[found[0].line].includes('第一次從回收間退回食堂'));
  const model = JSON.parse(readFileSync(new URL('../building/scene-markers.json', import.meta.url)));
  assert.equal(model.markers.find(row => row.id === horror.id).timing, '選填查看');
});

test('generation remains repeatable and new interior views stay out of the 72 transition nodes', () => {
  const {outputs, flow} = buildSceneImageOutputs(graph);
  for (const act of [ACTS[1], ACTS[2]]) assert.equal(outputs.get(act.path), master.documents.get(act.path));
  assert.equal(flow.subscenes.length, 72);
  assert(!flow.subscenes.some(row => ids.includes(row.id)));
  includes(outputs.get('08_製作管理/08-13_劇情節點與場景道具總表.md'), ['另有 13 個房內選填探索鏡位', 'R4-V02', 'R6-V03']);
});
