import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { ACTS, APPENDIX } from './screenplay-files.mjs';
import { parseMaster, deriveGraph } from './sync-canonical.mjs';

const read = file => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const master = parseMaster();
const inventory = read('docs/10_製作規格/10-12_製作規格_收集物與筆記本總表.md');
const sourceRows = inventory.split('\n').filter(line => /^\| (?:<span[^>]*>)?OBS[4-9]-\d\d/.test(line));
const expected = [3, 2, 6, 5, 3, 3].flatMap((count, index) =>
  Array.from({ length: count }, (_, i) => `OBS${index + 4}-${String(i + 1).padStart(2, '0')}`));
const fresh = ['OBS4-03', 'OBS5-01', 'OBS6-01', 'OBS6-02', 'OBS6-05', 'OBS6-06', 'OBS7-01', 'OBS7-04', 'OBS7-05'];
const requiredFieldClues = [
  { act: 6, id: 'OBS6-05', name: '分租改管覆核籤', alias: '覆核籤', node: 'U1', focus: 'U1-C02' },
  { act: 6, id: 'OBS6-06', name: '檢修校驗牌', alias: '校驗牌', node: 'U3', focus: 'U3-C03' },
  { act: 7, id: 'OBS7-04', name: '檢修蓋解扣銘片', alias: '解扣銘片', node: 'U4', focus: 'U4-C03' },
  { act: 7, id: 'OBS7-05', name: '封板與維修口配置銘片', alias: '配置銘片', node: 'U5', focus: 'U5-C02' },
];
const topicSource = id => {
  const source = master.sources.find(source => source.id === id);
  assert(source, `Missing maintained topic source ${id}`);
  return source.blocks.map(block => block.text).join('\n\n');
};
const tableRows = text => text.split('\n').filter(line => line.startsWith('| '));
const roomRows = (text, node) => tableRows(text).filter(row => row.split('|')[1].replaceAll('`', '').trim() === node);

test('all 22 scene observations have one act-owned register row and a saved source in its production spec', () => {
  assert.deepEqual(sourceRows.map(row => row.match(/OBS[4-9]-\d\d/)[0]), expected);
  for (const id of expected) {
    const [, act, number] = id.match(/OBS(\d)-(\d\d)/);
    const chapter = ACTS.find(a => a.act === Number(act));
    const spec = master.documents.get(chapter.specPath);
    assert(spec.includes(id), `${id}: production source missing`);
    assert(spec.includes(`observations.obs${act}_${number}.seen`), `${id}: saved read state missing`);
    // Reading chapters use the actual object names; the internal registry stays in production.
    assert(!master.documents.get(chapter.path).match(/OBS[4-9]-\d\d|observations\.obs\d|investigation\.(?:sound_route|archive_transfer|shared_tools|cold_service|water_route)/));
  }
  assert.deepEqual(sourceRows.filter(row => row.includes('| 新增原件 |')).map(row => row.match(/OBS[4-9]-\d\d/)[0]), fresh);
});

test('the inventory keeps original evidence separate from the new observation namespace', () => {
  const evidence = inventory.split('## 三、')[1].split('## 四、')[0].split('\n')
    .filter(line => /^\| (?:<span[^>]*>)?(?:E\d-\d\d|M6-01|S6-0[123])/.test(line));
  assert.equal(evidence.length, 66);
  assert.equal(new Set(evidence.map(row => row.match(/(?:E\d-\d\d(?:-[A-D])?|M6-01|S6-0[123])/)[0])).size, 66);
  assert.equal(sourceRows.length, 22);
  const side = inventory.split('## 六、')[1].split('## 七、')[0];
  assert.equal(new Set(side.match(/(?:CARE|MC|MU|PT|SG|KX|MR)-\d\d/g)).size, 19);
  const signals = inventory.split('## 四、')[1].split('## 五、')[0];
  assert.equal(new Set([...signals.matchAll(/^\| [^|]+\| (?:<span[^>]*>)?#(\d+)/gm)].map(m => m[1])).size, 15);
});

test('each added required clue has one physical source in story, spec and inventory and is visibly required', () => {
  for (const { act, id, name } of requiredFieldClues) {
    const row = sourceRows.find(row => row.includes(id));
    assert(row?.includes(`${id}〔必要〕</span>`), `${id}: required colour/label missing`);
    assert(row.includes(name) && row.includes('| 新增原件 |'), `${id}: missing physical source`);
    for (const file of [ACTS[act].path, ACTS[act].specPath]) {
      assert(master.documents.get(file).includes(name), `${id}: source not authored in ${file}`);
    }
    const spec = master.documents.get(ACTS[act].specPath);
    const key = id.toLowerCase().replace('-', '_');
    assert(spec.includes(`observations.${key}.verified`), `${id}: read and verified states are not separated`);
  }
  // Existing required observations remain distinct from the four new short originals.
  assert.equal(sourceRows.filter(row => row.includes('collectible-required')).length, 9);
  assert(inventory.includes('9（已含於 OBS 欄）'), 'Required observations must not be added to the E/M/S total');
});

test('optional investigations stay separate while required checks use original mechanical completion states', () => {
  const graph = JSON.parse(read('scene_graph.json'));
  const derived = deriveGraph(master, structuredClone(graph));
  assert.equal(derived.nodes.length, 48);
  assert.equal(derived.edges.length, 56);
  for (const edge of derived.edges) {
    assert(!/OBS[4-9]-|observations\.obs|investigation\.(?:sound_route|archive_transfer|shared_tools|cold_service|water_route|finale_landmarks)/
      .test(JSON.stringify({ gate: edge.gate, returnRule: edge.returnRule })), edge.id);
  }
  assert(master.documents.get(ACTS[6].specPath).includes('主線與捷徑完全不讀 linked、draft 或四 seen'));
});

test('physical source identifiers and dates agree between the reading script, spec and inventory', () => {
  for (const [act, fragments] of [
    [5, ['HR-026', 'VF-0818', '2025-08-18', '2025-08-19']],
    [6, ['共鉗 07', '2025-08-12', '2025-08-13', '窄布斜縫', '寬布方補']],
    [7, ['CL-48-02', '2024-08-16', '2025-10-24']],
  ]) {
    for (const fragment of fragments) {
      assert(master.documents.get(ACTS[act].path).includes(fragment), `${act} script: ${fragment}`);
      assert(master.documents.get(ACTS[act].specPath).includes(fragment), `${act} spec: ${fragment}`);
      assert(inventory.includes(fragment), `inventory: ${fragment}`);
    }
  }
});

test('shared rules retain source provenance, local objects, optionality and old-save compatibility', () => {
  const common = master.documents.get(APPENDIX).split('<a id="collection-investigation-contract"></a>')[1].split('<!-- import:s-0401-2:end -->')[0];
  for (const phrase of ['9 組新增可讀原件', '紙、鉗、布袋、標籤及設備留現場', '舊檔缺這批觀察', '不能撤銷既有主線', '不補發來源', 'R32 既有安全觀察／防禦已完成的舊檔不新增前置', '不能把尚不可見的內銷已讀當成開蓋前置', '後續房與結局仍讀原合法完成態']) {
    assert(common.includes(phrase), phrase);
  }
});

test('the novel, detailed act outline and pacing summaries retain all four local sources', () => {
  const novel = read('docs/09_故事劇情/17_縮寫短文.md');
  const detailedOutline = master.blocks.get('s-0301-17');
  assert(detailedOutline, 'Missing detailed lower-act outline');
  for (const clue of requiredFieldClues) {
    const actName = ACTS[clue.act].name;
    const nextAct = ACTS[clue.act + 1].name;
    const chapter = novel.split(`## ${actName}`)[1]?.split(`## ${nextAct}`)[0];
    assert(chapter?.includes(clue.name), `${clue.id}: novel source missing from its act`);
    for (const [label, text] of [['detailed outline', detailedOutline], ['03-01 summary', topicSource('0301')], ['03-04 pacing', topicSource('0304')]]) {
      assert(text.includes(clue.alias), `${clue.id}: ${label} omits its source`);
    }
  }
  assert.doesNotMatch(novel, /OBS[67]-\d\d|observations\.obs[67]_/, 'Internal source keys must stay out of the novel');
});

test('route and reasoning summaries keep necessary machine checks separate from optional investigations', () => {
  const routes = topicSource('0403');
  for (const [boundary, aliases] of [
    ['第六幕 → 第七幕', ['覆核籤', '校驗牌']],
    ['第七幕 → 第八幕', ['解扣', '配置銘片']],
  ]) {
    const row = tableRows(routes).find(row => row.includes(boundary));
    assert(row, `Missing route boundary ${boundary}`);
    for (const alias of aliases) assert(row.includes(alias), `${boundary}: ${alias}`);
    assert.match(row, /必要.*核對/);
    assert.match(row, /舊檔.*原完成態|舊檔銜接依同幕規格/);
  }
  const reasoning = topicSource('0405').split('\n\n').find(paragraph => /四件必要現場原件.*OBS/.test(paragraph));
  assert(reasoning, 'The reasoning system must describe the new OBS checks');
  assert.match(reasoning, /不增加.*三格.*E.*全局/);
  for (const state of ['已讀摘記', '待核對', '已核對']) assert(reasoning.includes(state), state);
  assert.match(reasoning, /機械操作.*完成.*核對結果/);
  assert.match(reasoning, /共用工具.*冷藏服務史.*(?:略過|選填)/);
});

test('the teaching tables include the source before the relevant local mechanical submission', () => {
  const teaching = topicSource('0412');
  for (const clue of requiredFieldClues) {
    const rows = roomRows(teaching, clue.node);
    assert(rows.length, `${clue.node}: teaching row missing`);
    for (const row of rows) assert(row.includes(clue.alias), `${clue.id}: a teaching row still skips the source`);
  }
  const u1 = roomRows(teaching, 'U1').join('\n');
  const u3 = roomRows(teaching, 'U3').join('\n');
  const u4 = roomRows(teaching, 'U4').join('\n');
  const u5 = roomRows(teaching, 'U5').join('\n');
  assert.match(u1, /實讀.*核對.*退栓/);
  assert.match(u3, /完整拉桿前.*核/);
  assert.match(u3, /牌不給正確燈槽/);
  assert.match(u4, /不.*第四.*地標/);
  assert.match(u4, /不.*蓋下.*內銷.*開蓋/);
  assert.match(roomRows(teaching, 'U4b').join('\n'), /下降後.*實查.*內銷/);
  assert.match(u5, /開始前.*安全實讀/);
  assert.match(u5, /閱讀不啟動攻擊/);
});

test('shared level and Godot sources preserve immediate reads, atomic verification and staged old saves', () => {
  // 06-10 is a retired landing page; its maintained s-0610 blocks carry the actual contract.
  const levels = topicSource('0610');
  const godot = topicSource('0808');
  for (const clue of requiredFieldClues) {
    assert(levels.includes(clue.name), `${clue.id}: shared level source missing`);
    const key = clue.id.toLowerCase().replace('-', '_');
    for (const state of ['seen', 'verified']) assert(godot.includes(`observations.${key}.${state}`), `${clue.id}: Godot ${state} field missing`);
  }
  assert.match(levels, /實讀即記 seen/);
  assert.match(levels, /verified.*原機械完成原子保存/);
  assert.match(levels, /共用工具.*冷藏服務史.*不作通行前置/);
  assert.match(levels, /已合法完成.*已開蓋.*UD-02.*安全續行/);
  const schema = master.blocks.get('s-0808-6');
  for (const key of ['observations.obs6_05.draft', 'observations.obs6_06.draft', 'investigation.service_safety.draft', 'ui.investigation_return']) assert(schema.includes(key), key);
  const saves = master.blocks.get('s-0808-14');
  assert.match(saves, /實讀即保存 seen/);
  assert.match(saves, /verified.*原子保存/);
  for (const key of ['route_known', 'bridge_open', 'service_latch_open', 'shutters_closed']) assert(saves.includes(key), `Missing original completion key ${key}`);
  assert.match(saves, /不預授.*內銷.*verified/);
  assert.match(saves, /舊進度.*未讀不補來源/);
  assert.match(saves, /已開蓋.*UD-02.*安全續接/);
  const r31Exit = saves.match(/~~~text\n([\s\S]*?exit_unlocked[^\n]*)\n~~~/)?.[1];
  assert(r31Exit, 'Missing R31 exit formula');
  assert.doesNotMatch(r31Exit, /observations\.|OBS[67]-|service_safety|shared_tools|cold_service/, 'Later exits must not add a global source checklist');
});

test('UI source states and required or functional document colours have usable styles', () => {
  const ui = topicSource('0703');
  assert.match(ui, /22 組 OBS.*9 件新增原件.*13 組既有物件/);
  assert.match(ui, /已讀摘記.*待核對.*已核對/);
  assert.match(ui, /未讀.*來源未查|來源未查.*未讀/);
  const css = read('styles.css');
  const usedClasses = new Set([...`${master.text}\n${inventory}`.matchAll(/class="([^"]+)"/g)]
    .flatMap(match => match[1].split(/\s+/)).filter(name => name.startsWith('collectible-')));
  for (const name of usedClasses) assert.match(css, new RegExp(`\\.${name}\\s*\\{[^}]*\\bcolor\\s*:`), `Unstyled collection label ${name}`);
  const colour = name => css.match(new RegExp(`\\.${name}\\s*\\{[^}]*\\bcolor\\s*:\\s*([^;}]+)`))?.[1];
  assert(colour('collectible-required') && colour('collectible-functional'));
  assert.notEqual(colour('collectible-required'), colour('collectible-functional'));
});

test('art workloads and the physical-object register keep the four originals local and budget their subitems', () => {
  const art = topicSource('0810');
  // This manually maintained props section is outside 08-13's generated scene/image/route blocks.
  const physicalInventory = read('docs/08_製作管理/08-13_劇情節點與場景道具總表.md');
  const props = physicalInventory
    .split('<a id="inventory-props"></a>')[1]?.split('<a id="inventory-sidequests"></a>')[0];
  assert(props, 'Missing physical-object register');
  for (const clue of requiredFieldClues) {
    for (const [label, text] of [['08-10 workload', art], ['08-13 physical objects', props]]) {
      const row = tableRows(text).find(row => row.includes(clue.name));
      assert(row?.includes('collectible-required'), `${clue.id}: ${label} is not visibly necessary`);
      assert(row.includes(label === '08-10 workload' ? clue.focus : clue.node), `${clue.id}: ${label} source location missing`);
    }
  }
  assert.match(art, /22 組 OBS.*9 件新增可讀原件.*13 組/);
  assert.match(art, /子項、文字及程式工時.*另列/);
  assert.match(art, /待排工.*實機驗收/);
  const observationSummary = physicalInventory.split(/\r?\n\r?\n/).find(paragraph => /^第四幕至終幕另有.*OBS/.test(paragraph));
  assert(observationSummary, 'Missing observation register boundary rules');
  assert.match(observationSummary, /零選填可通關/);
  assert.match(observationSummary, /舊檔.*保留原成果.*不補造.*已讀/);
});

test('inventory tables remain rectangular after act grouping and balance updates', () => {
  let columns = null;
  for (const line of inventory.split('\n')) {
    if (!line.startsWith('| ')) { columns = null; continue; }
    const width = line.split('|').length;
    columns ??= width;
    assert.equal(width, columns, line);
  }
});
