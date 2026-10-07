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
const flow = JSON.parse(readFileSync(new URL('../scene-flow.json', import.meta.url)));
const collection = collectSceneImages(graph);
const model = JSON.parse(readFileSync(new URL('../building/scene-markers.json', import.meta.url)));
const includes = (text, phrases) => phrases.forEach(phrase => assert(text.includes(phrase), phrase));
const views = ['R1-V02', 'R5-V02', 'R8-V04'];
const details = ['R1-C07', 'R5-C06', 'R8-C05', 'R14-C05', 'U3-C07', 'U5-C03', 'U6-C03'];

test('three optional interior views have art, local return paths and no new mainline routes', () => {
  assert.equal(graph.nodes.length, 48);
  assert.equal(graph.edges.length, 56);
  assert.equal(flow.subscenes.length, 72);
  assert.equal(collection.rows.length, 557);
  assert.equal(collection.rows.filter(row => row.content.startsWith('房內次場景：')).length, 13);
  includes(spec(1), ['R1-V01 ↔ R1-V02', 'A 棟 1F', 'R5-V01 ↔ R5-V02', 'A 棟 8F', '不繞過衣架']);
  includes(spec(2), ['R8-V01 ↔ R8-V04', 'B 棟 15F', '各分岔仍從 V01 選擇']);
  for (const id of [...views, ...details]) {
    const row = collection.rows.find(row => row.id === id);
    assert(row, id);
    assert.equal((master.documents.get(row.act.path).match(new RegExp(`\\[${id}\\]\\(`, 'g')) || []).length, 1, id);
    assert(!flow.subscenes.some(child => child.id === id), id);
  }
  assert(graph.edges.every(edge => !/life\.|belongings|clothing|preparation/.test(edge.gate)));
});

test('life observations require actual focus reads and do not grant evidence or identity', () => {
  includes(common, ['imageId/focusKey', 'read_focus', '舊同圖已讀旗標不代發新焦點', '場景觀察', '不冒充四型態證據碎片', '零查看可完成原主線']);
  includes(spec(1), ['不補發 R1-C05', '不把行李數量當受困人數', '回 V01 保留原等候狀態', '未看領衣牌仍可靠各層地標操作']);
  includes(spec(2), ['不與小花、主角或既有客戶編號配對', '不代發 R6 帳號交接', 'R9／R21 才揭露的傷害']);
  includes(common, ['其他人包含內控、輪班督導與設備主管', '沒有私人對外聯絡權', '原住戶、其他商戶與被拘禁員工不能整批視為同一群人']);
});

test('existing transitional frames retain cultural details and their original access mechanics', () => {
  const checks = {
    'T-R5-R6-01-C01': ['9F洗衣牌', '濾籃'],
    'T-R5-R6-02-C01': ['10F用途牌', '止擋銷'],
    'T-R11-R12-02-C01': ['碗底筆跡', '旁通'],
    'T-R11-R12-04-C01': ['成人鞋楦', '固定護欄'],
    'T-R17-R18-01-C01': ['店號覆貼', '踏板'],
    'T-R17-R18-02-C01': ['不補配送終點', '檢修蓋'],
    'T-R17-R18-03-C01': ['門框花磚', '停靠孔'],
    'T-R20-R21-01-C01': ['只隔網近看', '輪值牌'],
    'T-R24-R25-01-C01': ['舊菜牌', '不解封傳菜窗'],
  };
  for (const [id, phrases] of Object.entries(checks)) {
    const row = collection.rows.find(row => row.id === id);
    assert(row, id);
    includes(row.content + row.requirements, phrases);
    assert(flow.subscenes.some(child => child.details.includes(id)), id);
  }
});

test('delivery history is not a shortcut or proof of unrelated harm', () => {
  includes(common, ['11F 食堂、43F 封存舊飯廳及48F 原食肆冷藏後場', '不同用途', '僅11F 配膳與2F 分送', '食品冷藏不證明器官用途']);
  includes(story(1), ['8F 返修', '9F 洗衣', '10F 吊籃', '籃內已空']);
  includes(spec(1), ['現時仍須完成 9F 排水', '空籃狀態不變']);
  includes(story(7), ['原食肆', '菜盆', '入口側食品架']);
});

test('life details preserve pursuit windows, water conservation and quiet breaks', () => {
  includes(common, ['U5-C03 僅 UD-02 尚未啟動或已完成', '威脅中關閉入口', 'HP-04 演出中不切鏡', '三槽總量六格', '保留20F安靜', '50F揭露不擴房']);
  includes(story(8), ['舊供水出口已用盲蓋封住', '配重循環', '總量仍是六格', '得到 2／2／2']);
  const tools = collection.rows.find(row => row.id === 'U3-C07');
  includes(tools.requirements, ['獨立於 LM-03', '保持安靜']);
  assert(model.markers.filter(marker => details.includes(marker.image)).every(marker => marker.category === 'item'));
});

test('reader and model place optional life markers at their actual inspection paragraphs', () => {
  const data = readingMarkerData();
  for (const id of details) {
    const row = collection.rows.find(row => row.id === id);
    const marker = model.markers.find(marker => marker.id === `${id}-item`);
    assert(marker, id);
    assert.equal(marker.timing, '選填查看');
    assert.deepEqual(marker.fragmentForms, []);
    const reading = data[row.act.path].find(marker => marker.id === `${id}-item`);
    assert(reading, id);
    const body = screenplayBody(story(row.act.act));
    const {found, issues} = locateReadingMarkers(body, [reading]);
    assert.deepEqual(issues, [], id);
    assert(body.split('\n')[found[0].line].includes('〔操作／物件近看〕'), id);
  }
});

test('canonical generation is repeatable with the new views included in inventory only', () => {
  const {outputs} = buildSceneImageOutputs(graph);
  for (const act of ACTS) assert.equal(outputs.get(act.path), master.documents.get(act.path));
  includes(outputs.get('08_製作管理/08-13_劇情節點與場景道具總表.md'), ['另有 13 個房內選填探索鏡位', 'R1-V02', 'R5-V02', 'R8-V04']);
});
