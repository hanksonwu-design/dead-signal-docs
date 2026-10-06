import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { ROOT, parseMaster, deriveGraph } from './sync-canonical.mjs';
import { ACTS, APPENDIX } from './screenplay-files.mjs';
import { collectSceneAccess, collectSceneImages, bindImageRoutes, collectSubscenes } from './build-scene-images.mjs';
import { LAYOUTS, buildAccessLayouts, renderLayout } from './build-access-layouts.mjs';

const master = parseMaster();
const graph = JSON.parse(readFileSync(path.join(ROOT, 'scene_graph.json'), 'utf8'));
const docs = master.documents, access = collectSceneAccess(graph, docs);
const images = collectSceneImages(graph, docs), routes = bindImageRoutes(graph, images);
const spec = ACTS.slice(6, 9).map(a => docs.get(a.specPath)).join('\n');
const story = ACTS.slice(6, 9).map(a => docs.get(a.path)).join('\n');
let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log(`PASS ${name}`); };

test('13 composition proposals cover every local exit, including shared and closed doorways', () => {
  assert.equal(LAYOUTS.length, 13);
  assert.equal(new Set(LAYOUTS.map(l => l.id)).size, 13);
  for (const [file, output] of buildAccessLayouts(graph, docs)) {
    assert.equal(readFileSync(path.join(ROOT, file), 'utf8').replaceAll('\r\n', '\n'), output, file);
  }
  for (const layout of LAYOUTS) {
    const node = graph.nodes.find(n => n.id === layout.id), slug = node.id.toLowerCase();
    assert.equal(master.anchorFiles.get(`node-${slug}-access-layout`), node.pack);
    assert(docs.get(node.source).includes(`[出入口配置草圖](../${node.pack}#node-${slug}-access-layout)`));
    const spec = docs.get(node.pack);
    assert(spec.indexOf(`node-${slug}-access-layout`) > spec.indexOf(`<!-- scene-access:${node.id}:end -->`));
    assert(spec.indexOf(`node-${slug}-access-layout`) < spec.indexOf(`node-${slug}-level` + '"></a>'));
  }
});

test('invalid or overlapping port assignments fail generation', () => {
  const source = LAYOUTS.find(l => l.id === 'R14'), node = graph.nodes.find(n => n.id === 'R14');
  for (const edit of [
    l => l.ports.pop(),
    l => l.ports[0][3].push('R25↔R26'),
    l => { l.ports[1][0] = l.ports[0][0]; },
    l => { l.ports[0][0] = 'missing'; },
  ]) {
    const invalid = structuredClone(source); edit(invalid);
    assert.throws(() => renderLayout(invalid, node, access.get('R14')));
  }
});

test('shared 32-S doorway and fixed ladder stay distinct from branches and movable platform', () => {
  const r17 = LAYOUTS.find(l => l.id === 'R17');
  assert.equal(r17.ports.filter(p => p[3].includes('R17→R14') || p[3].includes('R17→R18')).length, 1);
  assert(LAYOUTS.find(l => l.id === 'U6').ports.some(p => p[1] === '固定保養梯'));
  assert(LAYOUTS.find(l => l.id === 'U6b').ports.some(p => p[1] === '配重踏面'));
  assert(LAYOUTS.find(l => l.id === 'U1').note.includes('不是管圖第四答案'));
});

test('U3-U1 is the sole added route and does not replace the mandatory first-pass chain', () => {
  assert.deepEqual(graph, deriveGraph(master, structuredClone(graph)));
  assert.equal(graph.nodes.length, 48);
  assert.equal(graph.edges.length, 56);
  const edge = graph.edges.find(e => e.id === 'U3-U1-return');
  assert(edge && edge.back && edge.kind === '捷徑');
  for (const key of ['lower.u1.route_known', 'lower.u2.bridge_clear', 'lower.u3.bridge_open', 'lower.u3.return_latch_open']) assert(edge.gate.includes(key));
  assert(edge.gate.includes('U1、U3 均已到訪'));
  assert(edge.gate.includes('無遭遇鎖場且未提交 R30 不可逆前進'));
  for (const [from, to] of [['U1', 'U2'], ['U2', 'U2b'], ['U2b', 'U3'], ['U3', 'R28']]) {
    assert(graph.edges.some(e => e.fromId === from && e.toId === to && e.kind === '主線'));
  }
  assert(!/memory\.|LM-03|stability|SQ-/.test(edge.gate));
});

test('unlock, cancellation, open-door return, save migration and pre-brake lock are explicit', () => {
  const contract = spec.split('<a id="shortcut-u3-u1-spec"></a>')[1].split('<a id="h-0610-212">')[0];
  for (const phrase of ['才接受 U3 本地', '並將門推到原門擋後', '回復關閉態', '門扇保持敞開', '不自動走入',
    '不可逆提交一旦成立即停用', '已提交、尚在演出的窗口', '不新增第二套離幕旗標',
    '中斷未抵達者在出發端恢復', '舊檔缺 `return_latch_open` 視為 false',
    '旗標 true 但缺前置', '零穩定度', '不讀 LM-03', '尚未完成引擎驗收']) assert(contract.includes(phrase), phrase);
  assert(story.includes('從 U1 回來不必另找把手'));
  assert(master.blocks.get('s-0808-28').includes('首次仍須走 U1→U2→U2b→U3'));
});

test('two details and one return subscene are budgeted; diagrams are not shipped game art', () => {
  assert.equal(images.rows.length, 523);
  assert.equal(images.rows.filter(r => r.view).length, 140);
  const route = routes.find(r => r.edge.id === 'U3-U1-return');
  assert.equal(route.mode, '出口接景');
  assert.deepEqual(route.rows.map(r => r.id), ['U3-V02']);
  const children = collectSubscenes(images, routes);
  assert.equal(children.length, 72);
  const child = children.find(s => s.id === 'U3-V02');
  assert.equal(child.from, 'U3-V01'); assert.equal(child.to, 'U1-V01');
  assert.equal(child.details.length, 0);
  for (const id of ['U1-C05', 'U3-C06']) assert(images.allIds.has(id));
  assert(docs.get(APPENDIX).includes('也不計入圖像製作單'));
});

console.log(`${passed} access-layout and shortcut specification checks passed; no engine gameplay tests executed.`);
