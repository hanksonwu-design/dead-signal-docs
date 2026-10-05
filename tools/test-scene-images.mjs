import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { ACTS, APPENDIX } from './screenplay-files.mjs';
import { ROOT, parseMaster, rewriteLinks } from './sync-canonical.mjs';
import { collectSceneImages, collectHotspotImages, bindImageRoutes, collectSubscenes, collectSceneAccess, buildSceneImageOutputs } from './build-scene-images.mjs';
import { placeReadingImages, stripReadingFlow, stripReadingInline } from './reading-scene-flow.mjs';

const master = parseMaster();
const graph = JSON.parse(readFileSync(path.join(ROOT, 'scene_graph.json'), 'utf8'));
const specs = new Map(ACTS.map(a => [a.specPath, master.documents.get(a.specPath)]));
const collection = collectSceneImages(graph, specs);
const routes = bindImageRoutes(graph, collection);
const subscenes = collectSubscenes(collection, routes);
const hotspots = collectHotspotImages(collection, specs);
const access = collectSceneAccess(graph, specs);
let passed = 0;
function test(name, fn) { fn(); console.log(`PASS ${name}`); passed++; }
const row = id => { const value = collection.rows.find(r => r.id === id); assert(value, id); return value; };

test('all 48 nodes name both endpoints of every original route without adding routes', () => {
  assert.deepEqual([...access.keys()], graph.nodes.map(n => n.id));
  assert.equal([...access.values()].flat().filter(r => r.edge).length, graph.edges.reduce((count, e) => count + (e.fromId === e.toId ? 1 : 2), 0));
  for (const node of graph.nodes) {
    assert.equal(master.anchorFiles.get(`node-${node.id.toLowerCase()}-access`), node.pack);
    assert.equal(master.anchorFiles.get(`node-${node.id.toLowerCase()}-access-script`), node.source);
  }
});

test('missing, repeated, reversed, foreign and incomplete access rows are rejected', () => {
  const file = ACTS[1].specPath;
  const original = specs.get(file);
  const line = original.split('\n').find(l => l.startsWith('| P2→R1 |'));
  for (const edit of [
    s => s.replace(line, ''),
    s => s.replace(line, `${line}\n${line}`),
    s => s.replace(line, line.replace('P2→R1', 'P2↔R1')),
    s => s.replace(line, line.replace('P2→R1', 'R25↔R26')),
    s => s.replace(line, line.replace('來路：地下梯段門', '')),
    s => s.replace('<!-- scene-access:R1:begin -->', '<!-- scene-access:R99:begin -->'),
  ]) {
    const invalid = new Map(specs); invalid.set(file, edit(original));
    assert.throws(() => collectSceneAccess(graph, invalid));
  }
});

test('reading introductions follow actual main shots without front-loaded inventories or ending spoilers', () => {
  for (const node of graph.nodes) {
    const text = master.documents.get(node.source);
    const start = text.indexOf(`<a id="node-${node.id.toLowerCase()}-script">`);
    const entry = text.indexOf(`<a id="node-${node.id.toLowerCase()}-access-script">`);
    assert(entry > start, node.id);
    assert(/（靜態畫面|（鏡位切換|〔前置〕/.test(text.slice(start, entry)), node.id);
    const body = text.slice(entry, text.indexOf(':end -->', entry));
    assert(text.slice(start, entry).includes(`[${node.id}-V01]`));
    for (const stale of ['**畫面：**', '**出入口：**', '**場景圖：', '**近看、原件與其他畫面：**', `<!-- scene-image-${node.id.toLowerCase()}:begin -->`]) assert(!text.includes(stale), node.id);
    if (node.id === 'P1') assert(!/肉身|R33|終幕銜接/.test(body));
  }
});

test('all reading picture placements follow actual paragraphs and survive repeat generation', () => {
  for (const act of ACTS) {
    const original = master.documents.get(act.path), groups = collection.groups.filter(g => g.act.act === act.act);
    const children = subscenes.filter(s => s.act.act === act.act), spec = specs.get(act.specPath);
    const first = placeReadingImages(original, act, groups, children, spec);
    assert.equal(first.story, original, act.name);
    assert.equal(placeReadingImages(first.story, act, groups, children, spec).story, first.story);
    assert.equal(stripReadingFlow(first.story, groups), stripReadingFlow(original, groups));
    const ids = first.placements.map(p => p.id);
    assert.equal(new Set(ids).size, ids.length);
    assert.deepEqual(ids.sort(), groups.flatMap(g => g.rows.filter(r => !r.id.startsWith('T-')).map(r => r.id)).sort());
    for (const p of first.placements) assert(p.paragraph && !p.paragraph.startsWith('〔玩家〕可自由觀察'), p.id);
  }
});

test('every former picture-list link is inline with its cue or table header, without duplicate standalone lines', () => {
  const ids = [];
  for (const act of ACTS) {
    const text = master.documents.get(act.path);
    assert(!/^\*\*畫面：\*\*/m.test(text), act.name);
    for (const [, key, , line] of text.matchAll(/^<!-- reading-inline:([^:]+):(pad|tight) -->\n([^\n]+)/gm)) {
      assert.match(line, /^(?:（[^）]+）|〔[^〕]+〕|\| [^|]+) \[/);
      for (const id of key.split('_')) {
        const row = collection.rows.find(r => r.id === id);
        assert(row, id);
        assert(line.includes(`[${id}](../${act.specPath}#node-${row.node.toLowerCase()}-images)`), id);
        ids.push(id);
      }
    }
    assert(!stripReadingInline(text).includes('<!-- reading-inline:'));
  }
  assert.equal(new Set(ids).size, ids.length);
  assert.deepEqual(ids.sort(), collection.rows.filter(r => !r.id.startsWith('T-') && r.kind !== '出口接景').map(r => r.id).sort());
  const prologue = master.documents.get(ACTS[0].path);
  assert(prologue.includes('（靜態畫面／全景） [P0-V01]'));
  assert.throws(() => stripReadingInline(prologue.replace('[P0-V01](', '[P0-V99](')), /Missing inline image links/);
});

test('missing and ambiguous paragraph targets fail before publishing a reading file', () => {
  const act = ACTS[0], original = master.documents.get(act.path);
  const groups = collection.groups.filter(g => g.act.act === 0), children = subscenes.filter(s => s.act.act === 0);
  for (const text of [original.replace('前景：淺水', '前景：水面'), original.replace('前景：淺水', '前景：淺水\n\n前景：淺水')]) {
    assert.throws(() => placeReadingImages(text, act, groups, children, specs.get(act.specPath)), /Ambiguous reading placement/);
  }
});

test('required events read in play order while optional branches remain optional', () => {
  const order = (act, values) => {
    const text = master.documents.get(ACTS[act].path), positions = values.map(v => text.indexOf(v));
    assert(positions.every((p, i) => p >= 0 && (!i || p > positions[i - 1])), values.join(' -> '));
  };
  order(0, ['id="s-0903-3"', 'id="s-0903-4"', 'id="s-0903-9"', 'id="s-0903-5"']);
  order(0, ['id="s-0903-15"', 'id="s-0903-17"', '將祈願紙與通道用途在筆記中連起', 'id="s-0903-16"']);
  order(0, ['id="s-0903-5"', '[P0-C01]', '查看斷梯、壓住出口的混凝土']);
  order(2, ['id="s-0905-24"', 'id="s-0905-28"', 'id="s-0905-26"', 'id="s-0905-59"', 'id="s-0905-25"', 'id="s-0905-60"', 'id="s-0905-27"']);
  order(3, ['id="s-0906-58"', 'id="s-0906-60"', 'id="s-0906-59"']);
  order(3, ['id="s-0906-33"', 'id="subscene-t-r12-r15-01-script"']);
  order(4, ['id="s-0907-34"', '[R21-D04]', '現場門控的授權欄與走廊同框']);
  order(6, ['id="s-0909-40"', 'id="s-0909-41"', '玩家選擇離開水槽旁，沿固定保養梯下到低位台']);
  order(6, ['門內橫閂與外側護板', '斜側接景同時保留兩端門框', 'id="subscene-u3-v02-script"']);
  const act2 = master.documents.get(ACTS[2].path);
  assert(act2.includes('兩路不要求讀卡、放蛾或讀完小帳才開放'));
  assert(act2.includes('不要求兩條路依序走完'));
  assert(master.documents.get(ACTS[4].path).includes('不在上部直接載入 R23'));
  assert(master.documents.get(ACTS[6].path).includes('選填 H-07 未播放也能前進'));
});

test('branch, return-only, one-way and ending access remain distinct', () => {
  const routes = node => access.get(node).filter(r => r.edge).map(r => r.route);
  assert.deepEqual(routes('R26'), ['R25↔R26']);
  assert.equal(routes('R12').length, 4);
  assert(routes('R14').includes('R17→R14'));
  assert(routes('R17').includes('R17→R18'));
  assert(routes('U4').includes('U4→U4'));
  assert(access.get('R4b').some(r => r.state.includes('共用場景的近景')));
  assert(access.get('R33').some(r => r.state.includes('D 留在翼內')));
  assert(access.get('POST').some(r => r.route === '結束'));
  const p1 = access.get('P1').find(r => r.route === 'R33→P1');
  assert.equal(p1.reading, false);
});

test('art sheets link access locations and require visible, separately gated doorways', () => {
  assert.equal(master.anchorFiles.get('scene-access-contract'), APPENDIX);
  for (const node of graph.nodes) {
    const spec = specs.get(node.pack);
    const slug = node.id.toLowerCase();
    assert(spec.includes(`[出入口位置](#node-${slug}-access)`));
    const note = spec.split(`<!-- scene-image-access-art-${slug}:begin -->`)[1]?.split(`<!-- scene-image-access-art-${slug}:end -->`)[0];
    assert(note?.includes(`${node.id}-V01`) && note.includes(`#node-${slug}-access`), node.id);
  }
});

test('U2b clears the existing bridge by raising racks and uses side stairs, while U6 uses the fixed ladder', () => {
  assert(!/待抬橋面|橋第一段|晾架橋升起/.test(row('U2b-V01').content + row('U2b-V01').requirements + row('U2b-C02').content));
  assert(row('U2b-V01').content.includes('上橋側階'));
  assert(row('U2b-C02').requirements.includes('不畫成升降橋'));
  assert(access.get('U2b').find(r => r.route === 'U2b↔U3').state.includes('沿側階上橋'));
  assert(access.get('U6').find(r => r.route === 'U6↔U6b').state.includes('不踏尚未固定'));
  assert(row('R12-V01').content.includes('後開的服務捷徑門扣'));
});

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

test('twenty-one routes have fifty-three individually identified views and close-ups with a return parent', () => {
  const expected = { 'T-R2-R3': 2, 'T-R3-R4': 1, 'T-R7-R8': 2, 'T-R3-R5': 5, 'T-R5-R6': 2, 'T-R6-R7': 3, 'T-R11-R12': 7, 'T-R13-R14': 3, 'T-R17-R18': 4, 'T-R24-R25': 1, 'T-R12-R14': 3, 'T-R12-R15': 3, 'T-R13-R15': 3, 'T-R15-R16': 3, 'T-R17-R14': 4, 'T-R20-R21': 2, 'T-R21-R22': 1, 'T-R27-U1': 1, 'T-U3-R28': 1, 'T-R29-U4': 1, 'T-U5-U6': 1 };
  assert.equal(collection.rows.filter(r => r.kind === '過渡場景').length, 53);
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

test('all 56 routes bind valid static views without conflating ending rescue with prologue exploration', () => {
  assert.equal(routes.length, 56);
  assert.equal(new Set(routes.map(r => r.edge.id)).size, 56);
  for (const route of routes) assert(route.rows.every(r => collection.allIds.has(r.id) && r.view), route.edge.id);
  assert.deepEqual(routes.find(r => r.edge.fromId === 'R33' && r.edge.toId === 'P1').rows.map(r => r.id), ['R33-V02']);
  assert.equal(collection.rows.filter(r => r.kind === '出口接景').length, 14);
  assert.equal(routes.find(r => r.edge.fromId === 'R17' && r.edge.toId === 'R14').mode, '逐鏡過渡');
  assert.equal(routes.find(r => r.edge.fromId === 'R17' && r.edge.toId === 'R18').mode, '逐鏡過渡');
});

test('67 secondary scene nodes retain their parent, ordered connections and distinct reading/spec anchors', () => {
  assert.equal(subscenes.length, 67);
  assert.equal(subscenes.filter(s => s.type === '可查看過渡').length, 53);
  assert.equal(subscenes.filter(s => s.type === '轉場接景').length, 14);
  assert.equal(graph.nodes.length, 48);
  for (const child of subscenes) {
    assert.equal(child.node, child.route.edge.fromId);
    assert(collection.allIds.has(child.from) && collection.allIds.has(child.to), child.id);
    assert.equal(master.anchorFiles.get(`subscene-${child.id.toLowerCase()}-script`), child.act.path);
    assert.equal(master.anchorFiles.get(`subscene-${child.id.toLowerCase()}-spec`), child.act.specPath);
    const story = master.documents.get(child.act.path);
    if (child.type === '可查看過渡') {
      const heading = `###### 次場景 ${child.id} · ${child.name}`;
      assert.equal(story.split(heading).length, 2, child.id);
      const body = story.split(heading)[1].split(/\n(?:#{1,6} |<a id="subscene-)/)[0];
      assert(/（鏡位切換）|（靜態畫面／全景）/.test(body), `Missing prose after child heading: ${child.id}`);
      for (const detail of child.details) assert(body.includes(detail.id));
    } else assert.equal(child.details.length, 0, child.id);
  }
  for (const id of ['R20-V03', 'R33-V02', 'R31-F01', 'T-R2-R3-01-C01']) assert(!subscenes.some(s => s.id === id), id);
});

test('invalid child order, adjacency, orphan close-ups and wrong return parents fail before generation', () => {
  const invalid = edit => {
    const copy = structuredClone(collection);
    edit(copy.rows);
    copy.groups = copy.groups.map(g => ({ ...g, rows: copy.rows.filter(r => r.node === g.node) }));
    assert.throws(() => collectSubscenes(copy, bindImageRoutes(graph, copy)));
  };
  invalid(rows => { rows.find(r => r.id === 'T-R2-R3-01').requirements = '來路 R2-V01；去路 R3-V01。'; });
  invalid(rows => { rows.find(r => r.id === 'T-R2-R3-01-C01').requirements = '關閉回 T-R2-R3-02，'; });
  invalid(rows => { rows.find(r => r.id === 'T-R2-R3-01-C01').id = 'T-R2-R3-99-C01'; });
  invalid(rows => { rows.find(r => r.id === 'T-R2-R3-02').id = 'T-R2-R3-03'; });
});

test('secondary scene headings preserve entry gates and do not redefine transition saves', () => {
  const act3 = master.documents.get(ACTS[3].path);
  assert(act3.indexOf('確認後沿原流程存檔') < act3.indexOf('###### 次場景 T-R17-R18-01'));
  assert(act3.indexOf('不覆蓋上段十二秒餘波') < act3.indexOf('###### 次場景 T-R13-R14-01'));
  const policy = master.documents.get(APPENDIX).split('<a id="scene-image-contract"></a>')[1].split('各場景原文')[0];
  for (const phrase of ['主場景 → 次場景 → 物件近看', '操作與演出 V 圖不一律', '實際觸發仍依正文分支', '14 個出口接景不套用探路進度']) assert(policy.includes(phrase), phrase);
});

test('exit work orders stay assigned to their actual routes rather than falling back silently', () => {
  const expected = ['P2-R1', 'R8-R9', 'R8-R10', 'R9-R11', 'R10-R11', 'R14-R15', 'R16-R17', 'R19-R20', 'R22-R23', 'R25-R26', 'R28-R29', 'R30-R31', 'R31-R32', 'U3-U1'];
  assert.deepEqual(routes.filter(r => r.mode === '出口接景').map(r => `${r.edge.fromId}-${r.edge.toId}`).sort(), expected.sort());
  const invalid = { ...collection, groups: collection.groups.map(g => ({ ...g, rows: g.rows.map(r => r.id === 'R16-V02' ? { ...r, content: r.content.replace('R16→R17', 'R16→R15') } : r) })) };
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

test('regenerating a missing secondary-scene list keeps it at the departure end', () => {
  const file = ACTS[1].specPath;
  const documents = new Map(specs);
  documents.set(file, specs.get(file).replace(/<!-- scene-image-subscenes-r2:begin -->[\s\S]*?<!-- scene-image-subscenes-r2:end -->/, ''));
  const output = buildSceneImageOutputs(graph, documents).outputs.get(file);
  const position = output.indexOf('<a id="subscenes-r2"></a>');
  assert(position > output.indexOf('<a id="node-r2-exit"></a>'));
  assert(position < output.indexOf('<a id="node-r3-spec"></a>'));
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
