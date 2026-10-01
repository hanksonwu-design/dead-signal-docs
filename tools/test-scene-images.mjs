import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { ACTS, APPENDIX } from './screenplay-files.mjs';
import { ROOT, parseMaster, rewriteLinks } from './sync-canonical.mjs';
import { collectSceneImages, collectHotspotImages, bindImageRoutes, buildSceneImageOutputs } from './build-scene-images.mjs';

const master = parseMaster();
const graph = JSON.parse(readFileSync(path.join(ROOT, 'scene_graph.json'), 'utf8'));
const specs = new Map(ACTS.map(a => [a.specPath, master.documents.get(a.specPath)]));
const collection = collectSceneImages(graph, specs);
const routes = bindImageRoutes(graph, collection);
const hotspots = collectHotspotImages(collection, specs);
let passed = 0;
function test(name, fn) { fn(); console.log(`PASS ${name}`); passed++; }
const row = id => { const value = collection.rows.find(r => r.id === id); assert(value, id); return value; };

test('all 48 flow nodes have an owned base picture and named detail work orders', () => {
  assert.deepEqual(collection.groups.map(g => g.node), graph.nodes.map(n => n.id));
  assert.equal(collection.allIds.size, collection.rows.length);
  for (const group of collection.groups) {
    assert.equal(group.rows[0].id, `${group.node}-V01`);
    if (group.node === 'R33') assert(group.rows.every(r => r.view), 'Ending aftermath is not an exploration room');
    else assert(group.rows.some(r => !r.view), group.node);
    assert.equal(master.anchorFiles.get(`node-${group.node.toLowerCase()}-images`), group.act.specPath);
  }
});

test('every work order cites an existing canonical source', () => {
  for (const item of collection.rows) {
    const href = item.source.match(/\]\(([^)]+)\)/)[1];
    const [target, anchor] = href.split('#');
    const owner = target ? path.posix.normalize(path.posix.join(path.posix.dirname(item.act.specPath), target)) : item.act.specPath;
    assert.equal(master.anchorFiles.get(anchor), owner, `${item.id}: ${href}`);
  }
});

test('all original H and B hotspots bind images, including non-table and retired definitions', () => {
  assert.equal(hotspots.length, 224);
  assert.equal(new Set(hotspots.map(h => h.id)).size, 224);
  const images = id => hotspots.find(h => h.id === id)?.images;
  assert.deepEqual(images('R08_H07'), ['R8-C02']);
  assert.deepEqual(images('R26_B01'), ['R26-C04']);
  assert.deepEqual(images('R26_B04'), ['R26-D04']);
  assert.deepEqual(images('R26_B05'), ['R26-C02']);
  assert.deepEqual(images('R28_H06A-C'), ['R28-D03', 'R28-C01']);
  assert.deepEqual(images('R27_H01'), ['R25-C02']);
  assert(master.blocks.get('s-0808-9').includes('不再建立 R27 熱點'));
});

test('omitted, duplicated, foreign or unresolved hotspot mappings fail before generation', () => {
  const file = ACTS[2].specPath, original = specs.get(file);
  const line = original.split('\n').find(l => l.startsWith('| R09_H02 |'));
  for (const edit of [
    text => text.replace(line, ''),
    text => text.replace(line, `${line}\n${line}`),
    text => text.replace(line, line.replace('R09_H02', 'R09_H99')),
    text => text.replace(line, line.replace('R9-C03', 'R9-C99')),
    text => text.replace(line, line.replace('R9-C03', 'R10-C01')),
  ]) {
    const invalid = new Map(specs); invalid.set(file, edit(original));
    assert.throws(() => buildSceneImageOutputs(graph, invalid));
  }
});

test('new original hotspots cannot silently bypass image coverage', () => {
  const file = ACTS[2].specPath;
  const invalid = new Map(specs);
  invalid.set(file, specs.get(file).replace('<!-- import:s-uppertech-45:end -->', 'New original operation: R09_H99\n<!-- import:s-uppertech-45:end -->'));
  assert.throws(() => collectHotspotImages(collection, invalid), /missing from image/);
});

test('seven routes have thirteen individually identified views and close-ups with a return parent', () => {
  const expected = { 'T-R2-R3': 2, 'T-R3-R4': 1, 'T-R7-R8': 2, 'T-R11-R12': 3, 'T-R13-R14': 2, 'T-R17-R18': 2, 'T-R24-R25': 1 };
  assert.equal(collection.rows.filter(r => r.kind === '過渡場景').length, 13);
  for (const [route, count] of Object.entries(expected)) {
    const views = collection.rows.filter(r => r.kind === '過渡場景' && r.id.startsWith(`${route}-`));
    assert.equal(views.length, count);
    for (const [index, view] of views.entries()) {
      assert.equal(view.id, `${route}-${String(index + 1).padStart(2, '0')}`);
      assert(view.requirements.includes('來路 ') && view.requirements.includes('去路 '));
      assert(row(`${view.id}-C01`).requirements.includes(`關閉回 ${view.id}`));
      assert(master.documents.get(view.act.path).includes(view.id));
    }
  }
});

test('all 55 routes bind valid static views without conflating ending rescue with prologue exploration', () => {
  assert.equal(routes.length, 55);
  assert.equal(new Set(routes.map(r => r.edge.id)).size, 55);
  for (const route of routes) assert(route.rows.every(r => collection.allIds.has(r.id) && r.view), route.edge.id);
  assert.deepEqual(routes.find(r => r.edge.fromId === 'R33' && r.edge.toId === 'P1').rows.map(r => r.id), ['R33-V02']);
  assert.equal(collection.rows.filter(r => r.kind === '出口接景').length, 20);
  assert.equal(routes.find(r => r.edge.fromId === 'R17' && r.edge.toId === 'R14').mode, '出口接景');
  assert.equal(routes.find(r => r.edge.fromId === 'R17' && r.edge.toId === 'R18').mode, '逐鏡過渡');
});

test('exit work orders stay assigned to their actual routes rather than falling back silently', () => {
  const expected = ['P2-R1', 'R5-R6', 'R6-R7', 'R8-R9', 'R8-R10', 'R9-R11', 'R10-R11', 'R12-R14', 'R12-R15', 'R13-R15', 'R14-R15', 'R16-R17', 'R17-R14', 'R19-R20', 'R20-R21', 'R22-R23', 'R25-R26', 'R28-R29', 'R30-R31', 'R31-R32'];
  assert.deepEqual(routes.filter(r => r.mode === '出口接景').map(r => `${r.edge.fromId}-${r.edge.toId}`).sort(), expected.sort());
  const invalid = { ...collection, groups: collection.groups.map(g => ({ ...g, rows: g.rows.map(r => r.id === 'R17-V02' ? { ...r, content: r.content.replace('R17→R14', 'R17→R15') } : r) })) };
  invalid.rows = invalid.groups.flatMap(g => g.rows);
  assert.throws(() => bindImageRoutes(graph, invalid), /Unused or ambiguous/);
});

test('reading summaries and inventory are generated from the specification, with stable canonical links', () => {
  const { outputs } = buildSceneImageOutputs(graph, specs);
  for (const [file, content] of outputs) {
    assert.equal(content, readFileSync(path.join(ROOT, 'docs', file), 'utf8').replaceAll('\r\n', '\n'), file);
    if (master.documents.has(file)) assert.equal(rewriteLinks(content, file, master), content, file);
  }
  for (const item of collection.rows) assert(master.documents.get(item.act.path).includes(item.id), `Missing reading image: ${item.id}`);
});

test('interactive close-ups preserve frozen reflections, original clue text and source-reading boundaries', () => {
  assert(row('P2-C03').requirements.includes('無法深度查看'));
  assert(row('P2-C04').content.includes('第四人反射'));
  assert(row('R8-D02').requirements.includes('AX-17／版本 02／段號 100／100／尾段校驗值 6C2A'));
  assert(row('R24-D01').requirements.includes('記綠'));
  assert(row('R25-C01').requirements.includes('47-26-81-35-09'));
  assert(row('R31-F01').requirements.includes('八張低動態定格'));
  assert(row('R29-D08').requirements.includes('未知來源不自動補發'));
  assert(row('R32-D01').requirements.includes('不是一張假照片'));
});

test('new detail images preserve observed objects, layer prerequisites and hiding controls', () => {
  for (const id of ['R6-C04', 'R8-F02', 'R9-C03', 'R9-C04', 'R9-C05', 'R10-F01', 'R11-C05', 'R11-C06', 'R12-C05', 'R13-F01', 'R19-C06', 'R19-C07', 'R20-V03', 'R26-C04', 'R28-C03', 'R30-C04', 'R30-C05', 'R30-D04', 'R30-D05', 'R31-C02']) assert(row(id));
  assert(row('R8-F02').requirements.includes('出口燈只在歷史層'));
  assert(row('R10-F01').requirements.includes('已讀供桌與卡背並建立關聯'));
  assert(master.blocks.get('s-0905-40').includes('建立卡槽與已轉運紀錄的關聯'));
  assert(master.blocks.get('s-0905-44').includes('家庭照片') && master.blocks.get('s-0905-44').includes('鍵盤磨損'));
  assert.equal(row('R20-V03').kind, '操作鏡位');
  assert(row('R20-V03').requirements.includes('速查不暫停'));
  assert(row('R30-D05').requirements.includes('失蹤未確認'));
  assert(master.blocks.get('s-0909-45').includes('目的地空著，不等於已經死亡'));
});

test('R29 compares existing signatures and keeps a single informed approval action', () => {
  const r29 = master.blocks.get('s-0808-11');
  assert(r29.includes('R21 小花排程上已保存的原簽名'));
  assert(r29.includes('不生成新簽名，不提交核可'));
  assert(!r29.includes('自己已寫下的筆勢'));
  assert(master.blocks.get('s-0607-8').includes('與 R21 小花排程上已保存的原簽名疊合'));
  assert(!master.text.includes('筆記中的書寫筆勢'));
  assert(!/三月份|三月簽核/.test(master.text), 'Use three explicit months, not ambiguous March wording');
  for (const phrase of ['先讀 D05 批次明細', '無二次確認框', '無長按', '提交後不可取消', '主線索引均保留']) assert(row('R29-D06').requirements.includes(phrase), phrase);
  assert(r29.includes('後滿 20 秒'));
  assert(master.blocks.get('s-uppertech-61').includes('只看 D-17 的必要照護回執不自動取得整份評估'));
});

test('R27 prose, hotspot and artwork keep the same unknown-read indicator location', () => {
  const spec = master.documents.get(ACTS[6].specPath);
  const locationLines = spec.split('\n').filter(line => /右[上下]/.test(line) && /讀取心跳|未知節點讀取/.test(line));
  assert.equal(locationLines.length, 3);
  assert(locationLines.every(line => line.includes('右下角')));
  assert(row('R27-D02').requirements.includes('展示索引右下角'));
});

test('asset policy separates crops, pages, masks, saved states, optional culture and undelivered work', () => {
  const policy = master.documents.get(APPENDIX).split('<a id="scene-image-contract"></a>')[1].split('各場景原文')[0];
  for (const phrase of ['原母圖解析度足夠', '正反面', '每個焦點', '回到開啟前', '不重發物品', '可略過', '待製作規格', '42 張基底', '1280×720']) assert(policy.includes(phrase), phrase);
  for (const node of ['R18', 'R22', 'R26', 'U2b', 'U5', 'R32']) assert(collection.groups.find(g => g.node === node).rows.some(r => r.kind === '操作鏡位'), node);
});

test('missing, duplicated, malformed or incorrectly owned work orders fail validation', () => {
  const file = ACTS[0].specPath, original = specs.get(file);
  for (const edit of [
    text => text.replace(/<!-- scene-images:P0:begin -->[\s\S]*?<!-- scene-images:P0:end -->/, ''),
    text => text.replace('| P0-C01 |', '| P0-V01 |'),
    text => text.replace('| P0-C01 | 近看 |', '| P0-C01 | Unknown |'),
    text => text.replace('| P0-C01 |', '| R99-C01 |'),
    text => text.replace('| P0-C01 | 近看 |', '| P0-C01 | 近看 | extra |'),
  ]) {
    const invalid = new Map(specs); invalid.set(file, edit(original));
    assert.throws(() => collectSceneImages(graph, invalid));
  }
});

console.log(`${passed} scene-image checks passed. Production inventory only; not delivered game art or an engine playtest.`);
