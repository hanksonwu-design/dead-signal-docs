import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { ROOT, MASTER, parseMaster, buildSync, deriveGraph } from './sync-canonical.mjs';
import { buildDocuments } from './build-docs.mjs';

const read = file => readFileSync(path.join(ROOT, file), 'utf8').replace(/\r\n/g, '\n');
const master = parseMaster();
const graph = JSON.parse(read('scene_graph.json'));
const model = JSON.parse(read('building/scene-data.json'));
let passed = 0;
function test(name, fn) { fn(); passed++; console.log(`PASS ${name}`); }
function block(id) { assert(master.blocks.has(id), id); return master.blocks.get(id); }

test('72 sources and 1700 uniquely paired import blocks', () => {
  assert.equal(master.sources.length, 72);
  assert.equal(master.blocks.size, 1700);
  assert.equal([...master.text.matchAll(/<!-- import:[^:]+:begin -->/g)].length, 1700);
  assert.equal([...master.text.matchAll(/<!-- import:[^:]+:end -->/g)].length, 1700);
  assert.equal(master.sources.reduce((sum, item) => sum + item.count, 0), 1700);
});

test('derived files exactly match the current master; no legacy-heading fallback', () => {
  const { outputs, warnings } = buildSync();
  assert.deepEqual(warnings, []);
  for (const [file, expected] of outputs) assert.equal(read(file), expected, file);
});

test('48 nodes, 55 routes; every source and destination anchor is canonical', () => {
  assert.equal(graph.nodes.length, 48);
  assert.equal(graph.edges.length, 55);
  assert.equal(new Set(graph.nodes.map(n => n.id)).size, 48);
  assert.deepEqual(deriveGraph(master, graph), graph);
  for (const node of graph.nodes) {
    assert.equal(node.source, MASTER);
    assert.equal(node.pack, MASTER);
    for (const field of ['heading', 'packAnchor', 'spatialHeading']) assert(master.anchors.has(node[field]), `${node.id}:${field}`);
  }
  for (const edge of graph.edges) {
    assert.equal(edge.source, MASTER);
    assert(graph.nodes.some(n => n.id === edge.fromId));
    assert(graph.nodes.some(n => n.id === edge.toId));
  }
});

test('26 model nodes and 30 routes keep canonical references without adding lower rooms', () => {
  assert.equal(model.nodes.length, 26);
  assert.equal(model.edges.length, 30);
  for (const node of model.nodes) {
    const canonical = graph.nodes.find(n => n.id === node.id);
    assert.equal(canonical.part, 1);
    for (const key of ['goal', 'source', 'heading', 'packAnchor', 'spatialHeading']) assert.equal(node[key], canonical[key]);
    assert.equal(model.spatial[node.id].source, MASTER);
    assert(master.anchors.has(model.spatial[node.id].heading));
  }
  for (const edge of model.edges) {
    const canonical = graph.edges.find(e => e.id === edge.id);
    for (const key of ['gate', 'motion', 'kind', 'back', 'returnRule', 'source']) assert.equal(edge[key], canonical[key]);
  }
});

test('R1 coerced intake; no voluntary work or freedom result', () => {
  const scene = block('s-0904-6');
  assert(scene.includes('等待循環已結束。'));
  assert(scene.includes('不以姿態判定誰被騙、誰被綁'));
  assert(scene.includes('不以消散宣告受害者已得到自由'));
  assert(!scene.includes('「下一位」'));
});

test('F1 and moth actions do not gate exits; R11 uses actual sources', () => {
  assert(graph.edges.find(e => e.fromId === 'R5' && e.toId === 'R6').gate.includes('不另作門禁'));
  for (const edge of graph.edges.filter(e => e.fromId === 'R8')) assert(edge.gate.includes('不作出口門檻'));
  assert(block('s-0905-46').includes('實際讀卡'));
  assert(block('s-0905-46').includes('AX-17 / v02 / 100 / 6C2A'));
  assert(read('docs/08_製作管理/上部_技術與驗收參考.md').includes('SOURCE_READ'));
  assert(read('docs/08_製作管理/上部_技術與驗收參考.md').includes('E2-04 → E2-05 → E2-14'));
});

test('text-only index, playback count and identity-source distinction', () => {
  const signal = read('docs/04_核心玩法/04-04_手機與訊號系統.md');
  const sound = read('docs/07_視聽與介面/07-02_聲音設計.md');
  const villain = read('docs/02_角色/02-05_反派體系.md');
  assert(signal.includes('無錄音、不合成人聲'));
  assert(sound.includes('不加入播放清單'));
  assert(!sound.includes('語音合成，明顯不是人聲'));
  assert(!villain.includes('而且在她之前已經播過一百四十六次'));
  assert(villain.includes('K-114 的話原是傳給阿尋使用的身分'));
});

test('R32 reveal/defense/choice order and R33 ending sequence remain separate', () => {
  const ids = ['s-0910-5','s-0910-13','s-0910-14','s-0910-18','s-0910-19','s-0910-29','s-0910-38','s-0910-39','s-0910-40','s-0910-41','s-0910-42'];
  const positions = ids.map(id => master.text.indexOf(`<!-- import:${id}:begin -->`));
  assert(positions.every((p, i) => p >= 0 && (i === 0 || p > positions[i - 1])));
  assert(block('s-0910-29').includes('取消不提交'));
  assert(block('s-0910-36').includes('本人回想／原件待調取'));
  assert(graph.phases.R33.some(step => step.includes('二十秒黑畫面')));
  assert(block('s-0910-39').includes('可明確略過'));
});

test('novel corrects early reveal, floors, recording voice, timing and informed ending E', () => {
  const novel = read('docs/09_故事劇情/17_縮寫短文.md');
  assert(novel.includes('是康的聲音。'));
  assert(novel.includes('02:13 是準備。02:15 旁路才生效，到 02:22 結束。'));
  assert(novel.includes('我知道按完會失去什麼。'));
  assert(novel.includes('仍可以取消。我沒有取消。'));
  assert(novel.includes('第三段是 81'));
  assert(novel.includes('C 開或關都不影響這次比對'));
  assert(novel.indexOf('梁樂瑤') > novel.indexOf('## 第五幕'));
  for (const stale of ['十二樓是網咖','二十六樓的配電盤','四十二樓的檔案室','四十九樓的展示廊','樓內生命訊號：1','手指自己動了起來','按下去會怎麼樣，我不知道','病床','醫院的']) assert(!novel.includes(stale), stale);
  assert.equal([...novel.matchAll(/^## [ABCDE]：/gm)].length, 5);
});

test('unplaced timeline: 16 inventories x 4 comparison states follow source evidence', () => {
  const evidence = block('s-0302-5');
  const source = evidence.match(/<!-- unplaced-timeline-rules:begin -->\s*```json\s*([\s\S]*?)```\s*<!-- unplaced-timeline-rules:end -->/);
  assert(source, 'Missing canonical timeline contract');
  const contract = JSON.parse(source[1]);
  assert.deepEqual(Object.keys(contract).sort(), ['facts', 'titleRules']);
  assert.equal(contract.titleRules.length, 9);
  assert.equal(contract.facts.length, 3);
  for (const rule of [...contract.titleRules, ...contract.facts]) {
    assert(Array.isArray(rule.requires));
    assert(rule.requires.every(id => ['A', 'B', 'C', 'D'].includes(id)));
    assert.equal(new Set(rule.requires).size, rule.requires.length);
    assert(rule.comparison === undefined || ['ab_compared', 'cd_aligned'].includes(rule.comparison));
  }

  // Evaluate the master-owned contract against independent expected outcomes, not a game runtime.
  let cases = 0;
  for (const ab_compared of [false, true]) for (const cd_aligned of [false, true]) {
    const comparisons = { ab_compared, cd_aligned };
    const single = '未定位 · 1';
    const duration = '未定位 · 約七分鐘';
    const direction = '未定位 · 方向：向下';
    const pair = cd_aligned ? '未定位 · 約七分鐘 · 方向：向下' : '未定位';
    const titles = [null, single, single, ab_compared ? '未定位 · 同一夜？' : '未定位',
      duration, duration, duration, duration, direction, direction, direction, direction,
      pair, pair, pair, pair];
    for (let mask = 0; mask < 16; mask++) {
      const held = ['A', 'B', 'C', 'D'].filter((_, bit) => mask & (1 << bit));
      const matches = rule => rule.requires.every(id => held.includes(id)) &&
        (!rule.comparison || comparisons[rule.comparison]);
      const title = contract.titleRules.find(matches)?.title;
      const facts = contract.facts.filter(matches);
      const context = JSON.stringify({ held, ...comparisons });
      assert.equal(title, titles[mask], context);
      const expectedFacts = [];
      if ((mask & 3) === 3 && ab_compared) expectedFacts.push({ requires: ['A', 'B'], comparison: 'ab_compared', label: '同一夜？' });
      if (mask & 4) expectedFacts.push({ requires: ['C'], label: '約七分鐘' });
      if (mask & 8) expectedFacts.push({ requires: ['D'], label: '方向：向下' });
      assert.deepEqual(facts, expectedFacts, context);
      assert(!/主角|逃跑|那一夜/.test([title, ...facts.map(f => f.label)].join(' ')), context);
      cases++;
    }
  }
  assert.equal(cases, 64);
  assert(evidence.includes('四片全部為**選填**'));
  assert(evidence.includes('播放不代替 A／B 比對或 C／D 對齊'));
  assert(block('s-0905-49').includes('且實際核對殘缺格式'));
  assert(block('s-0906-32').includes('未定位 · 約七分鐘'));
  assert(block('s-0907-44').includes('C、D 都持有但未對齊'));
  for (const stale of ['隨持有數量改寫', '已持 A 才標', '| 3 片 | `未定位 · 約七分鐘`']) {
    assert(!master.text.includes(stale), stale);
  }
});

test('Ah Xun starts sending on day 0; the historical header arrives on day 5', () => {
  const character = block('s-0203-2');
  const dates = block('s-0913-2');
  assert(character.includes('逃亡夜（2025-11-04）切斷監控迴路前，已開始嘗試外傳'));
  assert(character.includes('逃亡後第 5 日（2025-11-09），外部中繼端收到'));
  assert(character.includes('第六至第七天攻堅'));
  assert(character.includes('R11 本輪校驗也不改寫歷史收件日期'));
  assert(!character.includes('已經讓一個**不含姓名的標頭**抵達外部中繼端'));
  assert(dates.includes('| 第 5 日，殘缺標頭到外部 | 2025-11-09 |'));
  assert(dates.includes('| 第 6–7 日，警方介入 | 2025-11-10 至 2025-11-11 |'));
  assert(master.text.includes('| **T−2 週 +5 日** | **阿尋傳輸的殘缺標頭抵達外部中繼端**'));
});

test('novel F3 reads the fixed glass strip from the other side without author knowledge', () => {
  const novel = read('docs/09_故事劇情/17_縮寫短文.md');
  assert(novel.includes('從觀察側望回去，我又看見收容室玻璃壓條裡的那片定位片'));
  assert(novel.includes('視訊組共用型／由缺口起算'));
  assert(novel.includes('逐格對上操作序位。第三段是 81'));
  for (const stale of ['貨梯帶來的同一張透光定位片', '小花見過視訊組的同型設備']) assert(!novel.includes(stale), stale);
  assert(master.text.includes('同一高度的玻璃壓條內嵌一小片透光定位片'));
  assert(master.text.includes('從觀察側對準同一片玻璃壓條定位片'));
});

test('act III outline respects local power routes and does not add police playback at R15', () => {
  const row = block('s-0301-9').split('\n').find(line => line.startsWith('| 第三幕 |'));
  assert(row);
  assert(row.includes('依所選路線恢復'));
  assert(row.includes('留待 R17 原件查證'));
  assert(row.includes('電房殘響只依全面供電的既有條件觸發'));
  assert(row.includes('藥品櫃與人員評級共用同一個權限碼'));
  for (const stale of ['整棟樓同時亮起一秒', '每一個亮起的螢幕', '二次進入失敗']) assert(!row.includes(stale), stale);
  assert(master.text.includes('沒有全樓亮起的蒙太奇，也不插警用人聲'));
  assert(block('s-0906-31').includes('僅全面供電的既有低壓迴聲'));
});

test('V33 per-room instructions select the correct panel and retain encounter limits', () => {
  for (const [room, panel, character, limit] of [
    ['r10', 1, '通報者', '不新增 E-05 現時現身'],
    ['r13', 3, '斷藥者', '沿 R13 原場次'],
    ['r14', 2, '貨梯裡的人', '依 E-06 既有處置'],
    ['r15', 4, '電房殘響', '限全面供電']
  ]) {
    const start = master.text.indexOf(`<a id="node-${room}-visual">`);
    const end = master.text.indexOf(`[返回本房正式劇本](#node-${room}-script)`, start);
    assert(start >= 0 && end > start, room);
    const note = master.text.slice(start, end).split('\n').find(line => line.startsWith('- **V33：**'));
    assert(note?.includes(`本房只取第 ${panel} 格「${character}」`), room);
    assert(note.includes(limit), room);
  }
});

test('all Markdown document and image links resolve; master anchors are unique', () => {
  const explicit = [...master.text.matchAll(/<a id="([^"]+)"><\/a>/g)].map(m => m[1]);
  assert.equal(explicit.length, new Set(explicit).size);
  const imageRefs = [...master.text.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)];
  assert.equal(imageRefs.length, 56);
  const files = readdirSync(path.join(ROOT, 'docs'), {recursive:true}).filter(f => f.endsWith('.md'));
  const errors = [];
  for (const relative of files) {
    const file = path.join(ROOT, 'docs', relative);
    const body = readFileSync(file,'utf8').replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '');
    for (const link of body.matchAll(/!?\[[^\]\n]*\]\(([^)\n]+)\)/g)) {
      const href = link[1];
      if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(href)) continue;
      const [target, fragment] = href.split('#');
      if (target && !/\.(?:md|png|jpe?g|webp|gif|svg)$/i.test(target)) continue;
      const absolute = target ? path.resolve(path.dirname(file), decodeURIComponent(target)) : file;
      if (!existsSync(absolute)) { errors.push(`${relative}: ${href}`); continue; }
      if (absolute === path.join(ROOT,'docs',MASTER) && fragment && !master.anchors.has(decodeURIComponent(fragment))) errors.push(`${relative}: missing #${fragment}`);
      if (/06_關卡規格.*\.md$/i.test(target)) errors.push(`${relative}: stale level link ${href}`);
    }
  }
  assert.deepEqual(errors, []);
});

test('website includes one visible master and resolves all retired document entries', () => {
  const documents = buildDocuments();
  const screenplays = documents.filter(doc => doc.folder === '09_劇本' && !doc.archived);
  assert.deepEqual(screenplays.map(doc => doc.path), [MASTER]);
  assert.equal(documents.filter(doc => doc.redirect).length,25);
  for (const doc of documents.filter(doc => doc.redirect)) {
    const [file, anchor] = doc.redirect.split('#');
    assert.equal(file, MASTER);
    assert(master.anchors.has(anchor));
  }
  assert.equal(documents.filter(doc => doc.weeklyDetail).length,13);
});

test('malformed masters and unmapped routes fail before any output is written', () => {
  assert.throws(() => parseMaster(master.text.replace('<!-- import:s-0904-6:end -->','')), /imported blocks/);
  const badGraph = structuredClone(graph);
  badGraph.edges.push({id:'invalid',fromId:'R1',toId:'POST'});
  assert.throws(() => deriveGraph(master,badGraph), /Unmapped edge/);
});

console.log(`${passed} checks passed. Text/data validation only; not a Godot playtest or art/audio sign-off.`);
