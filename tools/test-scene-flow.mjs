import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { ROOT, parseMaster } from './sync-canonical.mjs';
import { buildSceneImageOutputs } from './build-scene-images.mjs';
import { buildSceneFlowData } from './scene-flow-data.mjs';

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
