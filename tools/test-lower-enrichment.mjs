import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { ACTS, APPENDIX } from './screenplay-files.mjs';
import { parseMaster, deriveGraph } from './sync-canonical.mjs';
import { buildSceneImageOutputs } from './build-scene-images.mjs';

const read = file => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8').replaceAll('\r\n', '\n');
const master = parseMaster();
const graph = JSON.parse(read('scene_graph.json'));
const published = JSON.parse(read('scene-flow.json'));
const generated = buildSceneImageOutputs(graph, master.documents);
const spec = act => master.documents.get(ACTS[act].specPath);
const inventory = read('docs/10_製作規格/10-12_製作規格_收集物與筆記本總表.md');
const section = (text, anchor) => {
  const marker = `<a id="${anchor}"></a>`;
  const start = text.indexOf(marker);
  assert.notEqual(start, -1, `Missing maintained section ${anchor}`);
  const end = text.indexOf('<a id="', start + marker.length);
  return text.slice(start + marker.length, end === -1 ? text.length : end);
};
const common = section(master.documents.get(APPENDIX), 'lower-exploration-enrichment-contract');
const rows = text => text.split('\n').filter(line => line.startsWith('| '))
  .map(line => line.split('|').slice(1, -1).map(cell => cell.replace(/<[^>]+>/g, '').replaceAll('`', '').trim()));
const optional = [
  { key: 'act5.transit.r24_r25.drainboard_position', act: 5, node: 'R24', image: 'T-R24-R25-01-C01', anchor: 'transition-r24-r25' },
  { key: 'scene_detail.u1.splash_guard_set', act: 6, node: 'U1', image: 'U1-C01', anchor: 'u1-splash-guard-spec' },
  { key: 'scene_detail.u3.shared_pliers_hung', act: 6, node: 'U3', image: 'U3-C07', anchor: 'u3-hang-pliers-spec' },
];
const passages = [
  { id: 'R28-V02', from: 'R28', to: 'R29', floor: [47], anchor: 'reception-r28-v02-spec' },
  { id: 'T-U5-U6-01', from: 'U5', to: 'U6', floor: [48, 49], anchor: 'ascent-t-u5-u6-01-spec' },
];

test('both enriched passages publish playable steps on their existing routes and real image sources', () => {
  for (const { id, from, to, floor } of passages) {
    const child = generated.flow.subscenes.find(child => child.id === id);
    const route = generated.flow.routes.find(route => route.id === child?.route);
    assert(child && route, id);
    assert.equal(child.node, from, id);
    assert.equal(child.image, id, id);
    assert.equal(child.type, '探路次場景', id);
    assert.equal(child.play?.state, `route_local.${id.toLowerCase()}.open`, id);
    for (const field of ['objective', 'clue', 'action', 'recovery']) assert(child.play[field]?.trim(), `${id}: ${field}`);
    assert.deepEqual([route.from, route.to, route.back], [from, to, true], id);
    assert.deepEqual(route.steps.map(step => [step.id, step.image]),
      [[from, `${from}-V01`], [id, id], [to, `${to}-V01`]], id);
    assert.equal(route.mode, '逐層探索', id);
    assert.deepEqual(child.floor.levels, floor, id);
    assert.equal(child.building.label, 'B 棟', id);
    assert(child.details.length, `${id}: inspection image missing`);
    for (const image of [child.image, ...child.details]) {
      assert.equal(generated.flow.images[image].node, from, image);
      assert.equal(generated.flow.images[image].spec, ACTS[7].specPath, image);
      assert.deepEqual(published.images[image], generated.flow.images[image], `Unpublished art requirements: ${image}`);
    }
    assert.deepEqual(published.subscenes.find(item => item.id === id), child, `Unpublished play contract: ${id}`);
    assert.deepEqual(published.routes.find(item => item.id === route.id), route, `Unpublished route: ${id}`);
  }
});

test('a passage cannot silently publish as exploration after its authored play contract is removed', () => {
  for (const { id } of passages) {
    const documents = new Map(master.documents);
    const source = spec(7);
    const row = source.split('\n').find(line => line.startsWith(`| ${id} |`) && line.includes(`route_local.${id.toLowerCase()}.open`));
    assert(row, `${id}: missing maintained play row`);
    documents.set(ACTS[7].specPath, source.replace(row, ''));
    assert.throws(() => buildSceneImageOutputs(graph, documents),
      error => error.message.includes(`Missing exploration rules: ${id}`), id);
  }
});

test('passage departure gates retain the remote-session alternative and the completed U5 defense', () => {
  const derived = deriveGraph(master, structuredClone(graph));
  for (const { from, to } of passages) {
    const edge = graph.edges.find(edge => edge.fromId === from && edge.toId === to);
    const canonical = derived.edges.find(item => item.id === edge.id);
    assert.equal(canonical.gate, edge.gate, `${edge.id}: canonical and published gates differ`);
    assert(!edge.gate.includes('route_local.'), `${edge.id}: local traversal must not become an entry prerequisite`);
    assert.doesNotMatch(edge.gate, /investigation\.|observations\.|lower\.u6\./, edge.id);
    if (from === 'R28') {
      assert.match(edge.gate, /未開遠端終端[，,、]\s*或快取[／/]逾時結算完成/);
      assert.match(edge.gate, /不要求 E5-07、姓名或特定快取頁/);
    } else {
      assert.match(edge.gate, /^lower\.u5\.shutters_closed\s*=\s*true/);
      assert.match(edge.gate, /不要求先解完目的房/);
    }
  }
});

test('all three autonomous object states stay outside graph, route and published access gates', () => {
  const gateTexts = [
    ...graph.edges.map(edge => JSON.stringify({ gate: edge.gate, returnRule: edge.returnRule })),
    ...deriveGraph(master, structuredClone(graph)).edges.map(edge => edge.gate),
    ...generated.routes.map(route => route.edge.gate),
    ...published.nodes.flatMap(node => node.access.map(access => access.state)),
    ...published.subscenes.filter(child => child.play).map(child => child.play.action),
  ];
  for (const action of optional) {
    const contract = section(spec(action.act), action.anchor);
    assert(contract.includes(action.key), action.key);
    assert(common.includes(action.key), `${action.key}: shared contract missing`);
    assert(gateTexts.every(text => !text.includes(action.key)), `${action.key}: optional action became a gate`);
    assert.equal(generated.flow.images[action.image].node, action.node, action.image);
    assert.deepEqual(published.images[action.image], generated.flow.images[action.image], action.image);
  }
  assert.equal(published.images['U1-C01'].kind, '操作近看');
  assert.equal(published.images['U3-C07'].kind, '操作近看');
});

test('the five interactions add neither evidence nor observation entries or macro routes', () => {
  const cells = rows(inventory).map(row => row[0]);
  const observations = cells.map(cell => cell.match(/^OBS[4-9]-\d\d/)?.[0]).filter(Boolean);
  const evidence = cells.map(cell => cell.match(/^(E\d-\d\d(?:-[A-D])?|M6-01|S6-0[123])(?=$|[\s（〔])/)?.[1]).filter(Boolean);
  assert.equal(observations.length, 27);
  assert.equal(new Set(observations).size, 27);
  assert.equal(evidence.length, 66);
  assert.equal(new Set(evidence).size, 66);
  assert.equal(graph.nodes.length, 48);
  assert.equal(graph.edges.length, 56);
  assert.equal(published.subscenes.length, 72);
  assert.equal(new Set(published.routes.map(route => route.id)).size, 56);
  assert.deepEqual(published.routes.map(route => route.id), graph.edges.map(edge => edge.id));
  const sceneInventory = read('docs/08_製作管理/08-13_劇情節點與場景道具總表.md');
  const types = ['探路次場景', '可查看過渡', '轉場接景'];
  const counts = types.map(type => published.subscenes.filter(child => child.type === type).length);
  assert.equal(counts.reduce((sum, count) => sum + count, 0), published.subscenes.length);
  for (const [i, type] of types.entries()) {
    assert(sceneInventory.includes(`${counts[i]} 個${type}`), `Inventory classification disagrees with flow: ${type}`);
  }
  assert.equal(rows(common).filter(row => row.length === 3 && /^(?:第五幕|第六幕|第七幕)/.test(row[0])).length, 5);
});

// These assertions check authored save contracts, not a substitute engine implementation.
test('optional objects preserve real positions, cancellation and old-save defaults without granting sources', () => {
  const drain = section(spec(5), optional[0].anchor);
  const saveRow = rows(drain).find(row => row[0] === '狀態保存')?.[1];
  assert(saveRow, 'Drainboard storage contract missing');
  assert.match(saveRow, /covered.*parked.*預設.*covered/);
  assert.match(saveRow, /未完成.*取消.*還原上次已保存位置/);
  assert.match(saveRow, /舊檔缺鍵.*不要求重做 R24/);
  assert.match(saveRow, /回訪.*存讀還原同一位置/);
  assert.match(rows(drain).find(row => row[0] === '背包與筆記')?.[1] ?? '', /無新 E.*無新筆記.*不重發 E4-02/);
  for (const action of optional.slice(1)) {
    const contract = section(spec(6), action.anchor);
    assert.match(contract, /初始 false/, action.key);
    assert.match(contract, /取消.*(?:初態|復原)|取消或失焦.*初態/, action.key);
    assert.match(contract, /回訪.*存讀|存讀.*回訪/, action.key);
    assert.match(contract, /舊檔缺欄位取 false/, action.key);
    assert.match(contract, /不(?:代發|補發|補來源|造出未讀)/, action.key);
    assert.match(contract, /本輪操作/, action.key);
    assert.match(contract, /R30.*不可逆提交/, action.key);
  }
  assert.match(section(spec(6), optional[2].anchor), /不改寫 2025-08-13.*還修燈桌/);
  assert.match(published.images['U3-C07'].requirements, /已掛後.*回掛鉤/);
});

test('previously traversed passages migrate without replaying sources, attacks or destination puzzles', () => {
  for (const passage of passages) {
    const contract = section(spec(7), passage.anchor);
    assert.match(contract, new RegExp(`合法舊檔已(?:到|抵達) ${passage.to}.*補通路完成`), passage.id);
    assert.match(contract, /不倒鎖|不能倒鎖/, passage.id);
    assert.match(contract, /(?:回訪.*不重做|回訪保持.*開妥)/, passage.id);
    assert.match(contract, /(?:未完成.*取消|中途取消不提交)/, passage.id);
    if (passage.from === 'R28') assert.match(contract, /不重開遠端倒數.*不重選快取.*不補讀件/);
    else assert.match(contract, /不重開襲擊.*3／0／3.*不新增敵人、倒數/s);
  }
  assert.match(common, /不要求重走或補選填.*不補造新近看已讀/);
  assert.match(common, /不補造原件文字、已讀或歷史用途/);
});
