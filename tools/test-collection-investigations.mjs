import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { ACTS, APPENDIX } from './screenplay-files.mjs';
import { parseMaster, deriveGraph } from './sync-canonical.mjs';

const read = file => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const master = parseMaster();
const inventory = read('docs/10_製作規格/10-12_製作規格_收集物與筆記本總表.md');
const sourceRows = inventory.split('\n').filter(line => /^\| (?:<span[^>]*>)?OBS[4-9]-\d\d/.test(line));
const expected = [3, 2, 4, 3, 3, 3].flatMap((count, index) =>
  Array.from({ length: count }, (_, i) => `OBS${index + 4}-${String(i + 1).padStart(2, '0')}`));
const fresh = ['OBS4-03', 'OBS5-01', 'OBS6-01', 'OBS6-02', 'OBS7-01'];

test('all 18 scene observations have one act-owned register row and a saved source in its production spec', () => {
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
  assert.equal(sourceRows.length, 18);
  const side = inventory.split('## 六、')[1].split('## 七、')[0];
  assert.equal(new Set(side.match(/(?:CARE|MC|MU|PT|SG|KX|MR)-\d\d/g)).size, 19);
  const signals = inventory.split('## 四、')[1].split('## 五、')[0];
  assert.equal(new Set([...signals.matchAll(/^\| [^|]+\| (?:<span[^>]*>)?#(\d+)/gm)].map(m => m[1])).size, 15);
});

test('new optional observations never become navigation gates or additional scene nodes', () => {
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
  for (const phrase of ['5 組新增可讀原件', '紙、鉗、布袋、標籤及設備留現場', '舊檔缺這批觀察', '不能撤銷既有主線', '不補發來源', 'R32 既有安全觀察／防禦已完成的舊檔不新增前置']) {
    assert(common.includes(phrase), phrase);
  }
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
