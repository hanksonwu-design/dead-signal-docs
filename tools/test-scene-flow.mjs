import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { ROOT, parseMaster } from './sync-canonical.mjs';
import { buildSceneImageOutputs } from './build-scene-images.mjs';
import { buildSceneFlowData, readSceneFloor, preciseFloor } from './scene-flow-data.mjs';
import { layout } from '../building/spatial.js';

const graph = JSON.parse(readFileSync(path.join(ROOT, 'scene_graph.json'), 'utf8'));
const master = parseMaster();
const result = buildSceneImageOutputs(graph, master.documents);
const { flow, collection, routes, subscenes, access } = result;
const route = (from, to) => flow.routes.find(r => r.from === from && r.to === to);
let passed = 0;
function test(name, fn) { fn(); console.log(`PASS ${name}`); passed++; }

test('published flow is generated from canonical specs without changing story documents', () => {
  assert.deepEqual(flow, JSON.parse(readFileSync(path.join(ROOT, 'scene-flow.json'), 'utf8')));
  for (const [file, content] of result.outputs) assert.equal(content, master.documents.get(file) ?? readFileSync(path.join(ROOT, 'docs', file), 'utf8').replaceAll('\r\n', '\n'), file);
  assert.equal(flow.nodes.length, 48);
  assert.equal(flow.routes.length, 56);
  assert.equal(flow.subscenes.length, 34);
  assert.equal(Object.keys(flow.images).length, 440);
});

test('all original directions and only original routes survive expansion', () => {
  assert.deepEqual(flow.routes.map(r => [r.id, r.from, r.to, r.back]), graph.edges.map(e => [e.id, e.fromId, e.toId, e.back]));
  for (const r of flow.routes) {
    assert.equal(r.steps[0].id, r.from);
    assert.equal(r.steps.at(-1).id, r.to);
    for (const step of r.steps) assert(flow.images[step.image], step.image);
  }
});

test('every floor label comes from its own canonical spatial table', () => {
  for (const node of graph.nodes) {
    const floor = flow.nodes.find(n => n.id === node.id).floor;
    assert.deepEqual(floor, readSceneFloor(master.documents.get(node.pack), node));
    assert.equal(floor.source, node.pack);
    assert.equal(floor.heading, node.spatialHeading);
    assert(floor.description && floor.label);
  }
  const label = id => flow.nodes.find(n => n.id === id).floor.label;
  assert.equal(label('P0'), 'B3');
  assert.equal(label('P2'), 'B3');
  assert.equal(label('R2'), '1F');
  assert.equal(label('R3'), '2F');
  assert.equal(label('R17'), '32F');
  assert.equal(label('R23'), '43F');
  assert.equal(label('R25'), '44F');
  assert.equal(label('R6'), '15F');
  assert.equal(label('R11'), '15F 上半層平台');
  assert.equal(label('R12'), '31F');
  for (const [id, location] of [['U2b', '橋下'], ['U4b', '檢修蓋下'], ['U6b', '水箱下']]) assert.equal(label(id), `50F ${location}夾層`);
});

test('transition floors locate each picture while routes include intermediate landings', () => {
  const floors = route('R2', 'R3').floor;
  assert.equal(floors.label, '1F → 2F');
  assert.equal(floors.reverseLabel, '2F → 1F');
  const child = id => flow.subscenes.find(s => s.id === id).floor;
  assert.equal(child('T-R2-R3-01').label, '1F');
  assert.equal(child('T-R2-R3-02').label, '2F');
  assert.equal(child('T-R11-R12-02').label, '24F');
  assert.equal(child('T-R17-R18-01').label, '36F');
  assert.equal(route('R11', 'R12').floor.label, '15F 上半層平台 → 24F → 31F');
  assert.equal(route('R17', 'R18').floor.label, '32F → 36F → 41F');
  assert.equal(route('R17', 'R14').floor.label, '32F → 31F');
  assert.equal(route('R24', 'R25').floor.label, '43F → 44F');
  assert.equal(child('T-R24-R25-01').reverseLabel, '44F → 43F');
  assert.equal(route('R3', 'R4').floor.label, '2F');
  assert.equal(route('U6', 'U6b').floor.label, '50F → 50F 水箱下夾層');
  assert.equal(route('U6', 'U6b').floor.reverseLabel, '50F 水箱下夾層 → 50F');
});

test('M1 uses distinct entrance and exit heights, not a new explorable floor', () => {
  assert.equal(flow.nodes.find(n => n.id === 'M1').floor.label, '44F → 50F');
  assert.equal(route('R25', 'M1').floor.label, '44F');
  assert.equal(route('M1', 'R27').floor.label, '50F');
});

test('ending floors never imply a walk down from 50F to B3', () => {
  for (const id of ['R33', 'POST']) assert.equal(flow.nodes.find(n => n.id === id).floor.kind, 'ending');
  assert.equal(route('R33', 'P1').floor.label, 'B3 · 肉身回返');
  assert.equal(route('R33', 'POST').floor.label, '結局／片尾演出');
  assert.equal(route('R32', 'R33').floor.kind, 'ending');
});

test('missing, duplicated or unrecognized floor sources fail rather than guessing', () => {
  const node = graph.nodes[0], spec = master.documents.get(node.pack);
  const row = spec.split('\n').find(line => line.startsWith('| 樓層定位 |'));
  assert.throws(() => readSceneFloor(spec.replace(row, ''), node), /Floor row/);
  assert.throws(() => readSceneFloor(spec.replace(row, `${row}\n${row}`), node), /Floor row/);
  assert.throws(() => readSceneFloor(spec.replace(row, '| 樓層定位 | 未定 |'), node), /Floor must be precise/);
  for (const label of ['15F–20F', '15F 區段', '0F', '51F', 'B4']) assert.throws(() => preciseFloor(label, 'invalid'), /Floor must be precise/);
});

test('every rendered floor is precise and upper model defaults agree', () => {
  const model = JSON.parse(readFileSync(path.join(ROOT, 'building/scene-data.json'), 'utf8'));
  for (const n of [...flow.nodes, ...flow.subscenes]) {
    assert(!/[–~]|區段/.test(n.floor.label), n.id);
    if (n.floor.kind !== 'ending') assert(n.floor.levels.every(Number.isInteger), n.id);
    if (layout[n.id]) {
      assert.equal(n.floor.levels[0], layout[n.id][2], n.id);
      assert.equal(model.spatial[n.id].floorLabel, n.floor.label, n.id);
    }
  }
});

test('missing or off-route secondary floors fail publication', () => {
  const node = graph.nodes.find(n => n.id === 'R2'), spec = master.documents.get(node.pack);
  const invalid = new Map(master.documents);
  invalid.set(node.pack, spec.replace('| T-R2-R3-01 | 1F |', '| T-R2-R3-01 | 40F |'));
  assert.throws(() => buildSceneFlowData(graph, collection, routes, subscenes, access, invalid), /Non-contiguous floor order/);
  invalid.set(node.pack, spec.replace('| T-R2-R3-01 | 1F |', ''));
  assert.throws(() => buildSceneFlowData(graph, collection, routes, subscenes, access, invalid), /Child floor coverage/);
});

test('R2 to R3 shows both existing transitions in playable order', () => {
  assert.deepEqual(route('R2', 'R3').steps.map(s => s.id), ['R2', 'T-R2-R3-01', 'T-R2-R3-02', 'R3']);
  assert.deepEqual(flow.subscenes.filter(s => s.node === 'R2').map(s => s.name), ['後廚服務巷', '住宅側平台']);
});

test('every transition has ordered adjacent pictures and a single route', () => {
  assert.equal(flow.subscenes.filter(s => s.type === '可查看過渡').length, 13);
  assert.equal(flow.subscenes.filter(s => s.type === '轉場接景').length, 21);
  const expanded = flow.routes.flatMap(r => r.steps.filter(s => s.type === 'subscene').map(s => s.id));
  assert.deepEqual(expanded.sort(), flow.subscenes.map(s => s.id).sort());
  for (const s of flow.subscenes) {
    const steps = flow.routes.find(r => r.id === s.route).steps;
    const i = steps.findIndex(step => step.id === s.id);
    assert.equal(steps[i - 1].image, s.from, s.id);
    assert.equal(steps[i + 1].image, s.to, s.id);
  }
});

test('close-ups are attached to their actual scene, never traversable steps', () => {
  const detailIds = [...flow.nodes, ...flow.subscenes].flatMap(n => n.details);
  assert.equal(detailIds.length, 338);
  assert.equal(new Set(detailIds).size, 338);
  const steps = new Set(flow.routes.flatMap(r => r.steps.map(s => s.image)));
  for (const id of detailIds) assert(!steps.has(id), id);
  for (const child of flow.subscenes) for (const id of child.details) assert(id.startsWith(`${child.id}-C`));
});

test('two R8 exits keep distinct picture nodes and optional clues remain optional', () => {
  assert.deepEqual(route('R8', 'R9').steps.map(s => s.image), ['R8-V01', 'R8-V02', 'R9-V01']);
  assert.deepEqual(route('R8', 'R10').steps.map(s => s.image), ['R8-V01', 'R8-V03', 'R10-V01']);
  for (const to of ['R9', 'R10']) assert.match(graph.edges.find(e => e.toId === to && e.fromId === 'R8').gate, /不作出口門檻.*均選填/);
});

test('return shortcut retains both endpoints and original entry restrictions', () => {
  assert.equal(route('U3', 'U1').back, true);
  assert.deepEqual(route('U3', 'U1').steps.map(s => s.image), ['U3-V01', 'U3-V02', 'U1-V01']);
  const edge = graph.edges.find(e => e.id === route('U3', 'U1').id);
  assert.match(edge.gate, /return_latch_open/);
  assert.match(edge.gate, /未提交 R30/);
  for (const id of ['U3', 'U1']) assert(flow.nodes.find(n => n.id === id).access.some(a => a.edge === edge.id));
});

test('ending rescue, one-shot loop and part boundary are not extra free-roaming rooms', () => {
  assert.deepEqual(route('R33', 'P1').steps.map(s => s.image), ['R33-V01', 'R33-V02']);
  assert.equal(route('R33', 'P1').mode, '後果演出');
  assert.equal(route('R33', 'P1').back, false);
  assert.equal(route('U4', 'U4').steps.length, 1);
  assert.equal(route('U4', 'U4').mode, '原鏡回返');
  assert.equal(route('U4', 'U4').back, false);
  assert.equal(route('R22', 'R23').back, false);
});

test('directions, local door locations and closed exits are copied without added gates', () => {
  for (const n of flow.nodes) assert.deepEqual(n.access, access.get(n.id).map(({ edge, ...entry }) => ({ ...entry, edge: edge?.id ?? null })));
  assert(flow.nodes.find(n => n.id === 'P0').access.some(a => !a.edge));
});

test('all picture and subscene links point to existing canonical anchors', () => {
  for (const image of Object.values(flow.images)) assert.equal(master.anchorFiles.get(image.heading), image.spec, image.id);
  for (const child of flow.subscenes) {
    assert.equal(master.anchorFiles.get(child.heading), child.source, child.id);
    assert.equal(master.anchorFiles.get(child.specHeading), child.spec, child.id);
  }
});

test('existing reference assets are local, and no formal game art is marked delivered', () => {
  assert.equal(flow.nodes.filter(n => n.reference?.url.startsWith('assets/scene_access/')).length, 13);
  for (const n of flow.nodes.filter(n => n.reference)) {
    assert(n.reference.url.startsWith('assets/') && !n.reference.url.includes('..'), n.id);
    assert(existsSync(path.join(ROOT, n.reference.url)), n.id);
    assert.match(n.reference.kind, /非遊戲背景|非正式素材/);
  }
  for (const image of Object.values(flow.images)) assert.equal(image.status, 'pending');
});

test('a missing base picture fails generation instead of yielding a broken flow', () => {
  const invalid = { ...collection, rows: collection.rows.filter(r => r.id !== 'R2-V01') };
  assert.throws(() => buildSceneFlowData(graph, invalid, routes, subscenes, access, master.documents), /Unbound flow image: R2-V01/);
});

console.log(`${passed} scene-flow checks passed. Art remains pending; flow expansion does not change gameplay gates.`);
