import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseMaster } from './sync-canonical.mjs';
import { ACTS, APPENDIX } from './screenplay-files.mjs';
import { buildSceneImageOutputs } from './build-scene-images.mjs';
import { buildSceneFlowData } from './scene-flow-data.mjs';
import { buildingLocation, readSceneBuilding } from './scene-buildings.mjs';
import { buildCurrentModel, TOWERS } from '../building/current-spatial.js';

const graph = JSON.parse(readFileSync(new URL('../scene_graph.json', import.meta.url)));
const master = parseMaster();
const { flow, collection, routes, subscenes, access } = buildSceneImageOutputs(graph, master.documents);
const children = (a, b) => flow.subscenes.filter(s => s.route === flow.routes.find(r => r.from === a && r.to === b).id);
const policy = master.documents.get(APPENDIX).split('<a id="lattice-lift-contract"></a>')[1].split('<!-- import:')[0];

test('two physical towers and shared foundations locate every node within its own height', () => {
  assert.deepEqual(TOWERS.map(t => [t.id, t.top]), [['A', 26], ['B', 50]]);
  assert.deepEqual(flow.nodes.filter(n => n.building.entry === 'A').map(n => n.id), ['R1', 'R2', 'R3', 'R4', 'R4b', 'R5', 'R6', 'R7', 'R12', 'R13']);
  assert.deepEqual(flow.nodes.filter(n => n.building.entry === 'BASE').map(n => n.id), ['P0', 'P1', 'P2']);
  for (const n of [...flow.nodes, ...flow.subscenes]) {
    assert(n.building, n.id);
    if (n.floor.kind === 'ending') assert.equal(n.building.entry, 'ENDING');
    else if (n.building.codes.length === 1) for (const f of n.floor.levels) {
      assert(n.building.entry === 'BASE' ? f >= -3 && f < 0 : f > 0 && f <= (n.building.entry === 'A' ? 26 : 50), n.id);
    }
  }
});

test('only three bridge levels cross towers, with four separate routes at 26F', () => {
  const bridges = flow.subscenes.filter(s => s.travel === '跨棟橋');
  assert.deepEqual(bridges.map(s => [s.id, s.floor.label, s.building.label]), [
    ['T-R7-R8-02', '15F', 'A 棟 → B 棟'], ['T-R11-R12-07', '22F', 'B 棟 → A 棟'],
    ...['T-R12-R14-03', 'T-R13-R14-03', 'T-R13-R15-03', 'T-R12-R15-03'].map(id => [id, '26F', 'A 棟 → B 棟']),
  ]);
  assert.deepEqual(flow.subscenes.filter(s => s.building.codes.length > 1 && s.travel !== '跨棟橋').map(s => s.id), ['P2-V02']);
  assert(policy.includes('不能把四條有條件路畫成可自由串走的同一平台'));
});

test('bridge decks stay level and stairs stay inside the proper tower in both height modes', () => {
  for (const actual of [false, true]) {
    const model = buildCurrentModel(graph, flow, actual);
    const lanes = [];
    for (const route of model.routes.filter(r => r.travel.includes('跨棟橋'))) {
      const shot = route.shots.find(s => s.travel === '跨棟橋');
      const y = model.floorY.get(shot.floor.levels[0]) + .3;
      assert.equal(shot.position[0], 0);
      assert.equal(shot.position[1], y);
      if (shot.floor.label === '26F') lanes.push(shot.position[2]);
      for (let i = 1; i < route.points.length; i++) {
        const a = route.points[i - 1], b = route.points[i];
        if (Math.min(a[0], b[0]) < 7 && Math.max(a[0], b[0]) > -7) {
          assert.equal(a[1], y, route.id); assert.equal(b[1], y, route.id);
          assert.equal(a[2], b[2], route.id);
        }
      }
      for (const [id, point] of [[route.from, route.points[0]], [route.to, route.points.at(-1)]]) {
        const n = model.nodes.find(n => n.id === id);
        assert(Math.abs(point[0] - n.x) <= n.w / 2 + .01 && Math.abs(point[2] - n.z) <= n.d / 2 + .01, `${id} doorway`);
        assert(Math.abs(point[1] - n.y - .3) < 1e-6, `${id} floor`);
      }
    }
    assert.equal(new Set(lanes).size, 4);
  }
});

test('L1 requires the 30F landing and L2 has only its two real stops', () => {
  const l1 = children('R15', 'R16'), l2 = children('R29', 'U4');
  assert.deepEqual(l1.map(s => [s.floor.label, s.travel]), [
    ['28F', '步道'], ['29F', '電梯候梯'], ['29F → 30F', '電梯車廂'],
    ['30F', '電梯停靠'], ['30F → 31F', '電梯車廂'], ['31F', '電梯停靠'],
  ]);
  assert.deepEqual(l2.map(s => [s.floor.label, s.travel]), [
    ['47F', '電梯候梯'], ['47F → 48F', '電梯車廂'], ['48F', '電梯停靠'],
  ]);
  assert([...l1, ...l2].every(s => s.play && s.details.length === 1 && s.building.entry === 'B'));
  assert(l1[3].play.action.includes('啟用柄') && l1[3].play.action.includes('扣緊兩端'));
  assert(l1[4].play.clue.includes('30F 踏板到位及啟用柄均成立'));
  assert(l2[1].play.clue.includes('沒有落地平台'));
  for (const actual of [false, true]) {
    const model = buildCurrentModel(graph, flow, actual);
    const lifts = model.routes.filter(r => r.shafts?.length);
    assert.deepEqual(lifts.flatMap(r => r.shafts.map(s => [s.id, s.from, s.to])), [['L1', 29, 30], ['L1', 30, 31], ['L2', 47, 48]]);
    for (const route of lifts) for (const shaft of route.shafts) {
      assert.equal(shaft.a[0], shaft.b[0]); assert.equal(shaft.a[2], shaft.b[2]);
      assert.equal(shaft.a[1], model.floorY.get(shaft.from) + .3);
      assert.equal(shaft.b[1], model.floorY.get(shaft.to) + .3);
    }
  }
});

test('power, source identity, optional approval, return locks and old-save rules remain explicit', () => {
  for (const phrase of ['R15 三條供電路線均先保留', '不切斷乘梯保留支路', '未開或拒絕核可佇列仍可通行',
    '無上部存檔依原合法下部起始契約', '均非 R14', '不是 R30 固定維修籠', 'R30 不可逆提交當下',
    '車廂唯一', '無直達 29→31', 'version: 4', '不按同名、序號或 open 直接繼承',
    '不是新的動態歷史凝固', '回訪、讀檔不重播嚇點', '不提供人名', '沒有可鑽電梯頂']) assert(policy.includes(phrase), phrase);
  assert.equal(flow.nodes.length, 48); assert.equal(flow.routes.length, 56);
  assert(graph.edges.every(e => !/lifts\.|anomaly_seen|culture_/.test(e.gate)));
});

test('in-transit anomalies appear before arrival actions in reading order', () => {
  for (const [act, anchor, press, anomaly, leave] of [
    [3, 'ascent-t-r15-r16-03-script', '按下 30F 按鍵', '金屬倒影裡的閘門', '走出 30F 平台'],
    [6, 'ascent-t-r29-u4-02-script', '按下 48F 按鍵', '空送物袋響起', '走到 48F 平台'],
  ]) {
    const text = master.documents.get(ACTS[act].path).split(`<a id="${anchor}"></a>`)[1].split('<!-- scene-image-subscene-')[0];
    assert(text.indexOf(press) > 0 && text.indexOf(press) < text.indexOf(anomaly) && text.indexOf(anomaly) < text.indexOf(leave), anchor);
  }
});

test('invalid tower sources, disconnected children and unlabeled bridges fail publication', () => {
  const node = graph.nodes.find(n => n.id === 'R7'), spec = master.documents.get(node.pack);
  const room = spec.slice(spec.indexOf(`<a id="${node.spatialHeading}"></a>`));
  const row = '| 樓棟定位 | A 棟 |';
  assert.throws(() => readSceneBuilding(room.replace(row, ''), node), /Building row/);
  assert.throws(() => readSceneBuilding(room.replace(row, `${row}\n${row}`), node), /Building row/);
  assert.throws(() => buildingLocation('C 棟', 'invalid'), /Unknown building/);
  const build = documents => buildSceneFlowData(graph, collection, routes, subscenes, access, documents);
  const invalid = new Map(master.documents);
  invalid.set(node.pack, spec.replace('| T-R7-R8-02 | 15F | A 棟 → B 棟 | 跨棟橋 |', '| T-R7-R8-02 | 15F | B 棟 → A 棟 | 跨棟橋 |'));
  assert.throws(() => build(invalid), /Disconnected building entry/);
  invalid.set(node.pack, spec.replace('| T-R7-R8-02 | 15F | A 棟 → B 棟 | 跨棟橋 |', '| T-R7-R8-02 | 15F | A 棟 → B 棟 | 步道 |'));
  assert.throws(() => build(invalid), /Missing bridge/);
});
