import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { ROOT, MASTER, parseMaster, buildSync, deriveGraph, canonicalFile } from './sync-canonical.mjs';
import { ACTS, APPENDIX, CANONICAL_FILES, SPLIT_MARKER } from './screenplay-files.mjs';
import { buildDocuments } from './build-docs.mjs';

const read = file => readFileSync(path.join(ROOT, file), 'utf8').replace(/\r\n/g, '\n');
const master = parseMaster();
const graph = JSON.parse(read('scene_graph.json'));
const model = JSON.parse(read('building/scene-data.json'));
let passed = 0;
function test(name, fn) { fn(); passed++; console.log(`PASS ${name}`); }
function block(id) { assert(master.blocks.has(id), id); return master.blocks.get(id); }

test('source manifest accounts for every retained block without empty placeholders', () => {
  assert.equal(master.sources.length, 72);
  assert.equal([...master.text.matchAll(/<!-- import:[^:]+:begin -->/g)].length, master.blocks.size);
  assert.equal([...master.text.matchAll(/<!-- import:[^:]+:end -->/g)].length, master.blocks.size);
  assert.equal(master.sources.reduce((sum, item) => sum + item.count, 0), master.blocks.size);
  assert.equal(new Set(master.sources.flatMap(source => source.blocks.map(block => block.id))).size, master.blocks.size);
  for (const [id, text] of master.blocks) assert(text.replace(/<a id="[^"]+"><\/a>/g, '').trim(), id);
});

test('eight maintained acts place their story before local specifications without duplicate master prose', () => {
  assert.deepEqual([...master.documents.keys()], CANONICAL_FILES);
  const index = master.documents.get(MASTER);
  assert(index.includes(SPLIT_MARKER));
  assert(!index.includes('<!-- import:'));
  let sceneCount = 0;
  for (const act of ACTS) {
    const text = master.documents.get(act.path);
    assert(!/^正式入口:/m.test(text));
    const specStart = text.indexOf(`<a id="spec-act-${act.act}">`);
    assert(specStart > text.indexOf(`<a id="act-${act.act}">`));
    const story = text.slice(0, specStart);
    assert.deepEqual([...story.matchAll(/<a id="act-(\d)">/g)].map(m => Number(m[1])), [act.act]);
    const sceneBlocks = [...story.matchAll(/<!-- import:([^:]+):begin -->/g)].map(m => m[1]);
    sceneCount += sceneBlocks.length;
    for (const id of sceneBlocks) assert(/^#### \[|^#### POST ·/m.test(block(id)), id);
    for (const technical of ['進行目的：', '**狀態、素材與驗收**', '本幕台詞清單', '本節目標']) assert(!story.includes(technical), act.path);
    assert(text.indexOf(`<a id="act-${act.act}-continue">`) < specStart);
    if (act.act < 7) assert(story.includes(`${path.posix.basename(ACTS[act.act + 1].path)}#act-${act.act + 1}`));
    for (const node of graph.nodes.filter(node => node.act === act.act)) {
      const id = node.id.toLowerCase();
      assert(text.indexOf(`<a id="node-${id}-script">`) > 0, id);
      assert(text.indexOf(`<a id="node-${id}-script">`) < specStart, id);
      for (const suffix of ['spec', 'nav', 'level', 'pack', 'visual']) {
        assert(text.indexOf(`<a id="node-${id}-${suffix}">`) > specStart, `${id}:${suffix}`);
        assert.equal(canonicalFile(master, `node-${id}-${suffix}`), act.path);
      }
    }
  }
  assert.equal(sceneCount, 342);
  assert(block('s-0900-2').includes('各幕文件前半部為正式演出，後半部為該幕製作規格'));
  assert(!block('s-0900-2').includes('同一份文件內'));
  for (const section of ['book-payoffs', 'book-first-play', 'book-pending', 'book-sources']) {
    assert.equal(canonicalFile(master, section), APPENDIX);
  }
  assert(!master.text.includes('原正文 SHA-256：'));
  assert(!master.text.includes('### 本版修訂：'));
  assert(!master.text.includes('#### 本幕自檢'));
  assert.equal(master.text.split('**保存與素材驗收：**原房主線').length - 1, 1);
});

test('screenplay presentation cues distinguish motion, stills, transitions and interfaces', () => {
  const labels = ['動畫演出', '靜態畫面', '靜態差分', '鏡位切換', '畫面特效', '介面呈現', '配音演出'];
  assert(!master.text.includes('〔演出〕'));
  for (const label of labels) assert(block('s-0900-4').includes(`（${label}）`), label);
  for (const act of ACTS) {
    const text = master.documents.get(act.path);
    const story = text.slice(0, text.indexOf(`<a id="spec-act-${act.act}">`));
    assert(story.includes('（動畫演出）'), act.path);
    assert(story.includes('（靜態畫面）'), act.path);
    assert(story.includes('（介面呈現）'), act.path);
  }
  for (const id of ['s-0904-16', 's-0905-22', 's-0905-55', 's-0906-14', 's-0906-62', 's-0908-28']) {
    assert(block(id).includes('（鏡位切換）'), id);
  }
  assert(block('s-0903-3').includes('（配音演出）保留人的氣息與猶豫。'));
  assert(block('s-0904-42').includes('（介面呈現）五個人物碎片'));
});

test('frozen history and H-08 remain still while present action and the unique thaw are explicit', () => {
  for (const [id, text] of [
    ['s-0903-23', '同一間房'], ['s-0905-27', '同鏡位靜格'],
    ['s-0907-14', '凝固構圖始終不動'], ['s-0908-45', 'C-07 有完整可辨的臉'],
    ['s-0908-25', '凝固或原快取靜格'], ['s-0909-20', '25–45 秒靜止回憶'],
  ]) {
    assert(block(id).includes(`（靜態畫面）${text}`), id);
    assert(!block(id).includes('（動畫演出）'), id);
  }
  assert(block('s-0905-17').includes('（動畫演出）回到現時，老周的迴聲'));
  assert(block('s-0906-11').includes('（動畫演出）退出後，現時輪廓'));
  assert(block('s-0907-12').includes('（靜態差分）玩家轉開鏡頭後才撤去該靜格'));
  assert(block('s-0907-25').includes('（靜態畫面）主角收手時，門邊那隻手仍是靜格。'));
  assert(block('s-0909-5').includes('（靜態畫面）窗內的人與物保持不動'));
  assert(block('s-0909-59').includes('（動畫演出）同一歷史鏡位中，十二秒解凍'));
  assert(block('s-0909-59').includes('（靜態差分）減少動態版用原八張定格、同十二秒。'));
  assert(block('s-0909-60').includes('（介面呈現）選用文字摘要'));
  assert(block('s-0910-5').includes('（動畫演出）泵體後內凹室'));
  assert(block('s-0910-6').includes('（靜態畫面）記憶不動'));
  assert(block('s-0910-42').includes('（動畫演出）康刷白色管理卡'));
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
    assert.equal(node.source, ACTS[node.act].path);
    assert.equal(node.pack, ACTS[node.act].path);
    for (const field of ['heading', 'packAnchor', 'spatialHeading']) assert(master.anchors.has(node[field]), `${node.id}:${field}`);
  }
  for (const edge of graph.edges) {
    assert.equal(edge.source, graph.nodes.find(n => n.id === edge.fromId).source);
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
    assert.equal(model.spatial[node.id].source, canonical.source);
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
  const spec = block('s-0602-4');
  assert(spec.includes('不據此判定誰被騙、誰被綁'));
  assert(spec.includes('沒有證據證明已救出他們'));
  assert(!scene.includes('「下一位」'));
});

test('seven transition routes retain gates and directions without adding rooms', () => {
  const routes = [
    ['R2', 'R3', 1, 's-0904-16', 's-0602-5', 2,
      '完成本房必要操作，依 R2-03 推開送餐車露出梯口；無額外證據或鑰匙'],
    ['R3', 'R4', 1, 's-0904-25', 's-0602-7', 1,
      '可自由前往刻痕牆，無額外門鎖；R3 人物碎片可章內回查，統一在 R5 離幕前核對'],
    ['R7', 'R8', 2, 's-0905-22', 's-0603-6', 2,
      '可沿窄橋自由前往；教戰手冊與留存排行榜在 R11 離幕前核對，老周安息及配給支線不擋通行'],
    ['R11', 'R12', 2, 's-0905-55', 's-0603-9', 3,
      '阿尋必要校驗、arc.ahsun.scope_confirmed 與幕尾 K1-01 成立，再完成現場第一鑰匙門端驗證；SQ-C1／SQ-S 不擋主線'],
    ['R13', 'R14', 3, 's-0906-14', 's-0604-5', 2,
      'E-07 已依本房叫號序列與照護註記安息，診所後門開啟；可退回 R12 不受本條阻擋'],
    ['R17', 'R18', 3, 's-0906-62', 's-0604-9', 2,
      '正確日期證據與 K2-01 成立；假路返回後可重排；離幕前可回查已發現未完成的 SQ-M1／SQ-T，支線不擋主線'],
    ['R24', 'R25', 5, 's-0908-28', 's-0606-5', 1,
      'E4-01／E4-02／E3-02 第四層鎖定成立；act5.r24.board_locked = true']
  ];
  let viewCount = 0;
  for (const [from, to, act, storyId, specId, views, gate] of routes) {
    const route = `T-${from}-${to}`;
    const anchor = `transition-${from.toLowerCase()}-${to.toLowerCase()}`;
    const edges = graph.edges.filter(e => e.fromId === from && e.toId === to);
    assert.equal(edges.length, 1, route);
    const edge = edges[0];
    assert.equal(edge.gate, gate, route);
    const oneWay = ['R11', 'R17'].includes(from);
    assert.equal(edge.kind, oneWay ? '跨幕' : from === 'R13' ? '分岔' : '主線');
    assert.equal(edge.back, !oneWay);
    assert.equal(edge.returnRule, oneWay ? '單向流程；不代表可沿此線倒退' :
      '章內回訪；遇鎖場、追逐或封路停用' + (from === 'R7' ? '；R8 放蛾不鎖通路，必要讀卡在 R11 校驗前核對' : ''));
    assert(edge.motion.startsWith(`${route}：`));
    assert(!graph.nodes.some(n => n.id === route));
    for (const id of [anchor, `${anchor}-script`]) assert.equal(canonicalFile(master, id), ACTS[act].path);
    assert(block(storyId).includes(`[通路製作規格](#${anchor})`));
    const spec = block(specId).split(`<a id="${anchor}"></a>`)[1].split('<a id=')[0];
    assert.equal([...spec.matchAll(/^\| [ABC]：/gm)].length, views, route);
    assert(spec.includes('#transition-rules'));
    assert(spec.includes('#transition-assets'));
    assert(block('s-0810-23').includes(`| [${route}](${path.posix.basename(ACTS[act].path)}#${anchor}) | ${views} |`));
    viewCount += views;
  }
  assert.equal(viewCount, 13);
  assert.equal(canonicalFile(master, 'transition-rules'), APPENDIX);
  assert.equal(canonicalFile(master, 'transition-assets'), APPENDIX);
  assert(block('s-0810-8').includes('既有連線過渡構圖'));
  assert(block('s-0810-23').includes('尚未交付這 13 個過渡構圖的正式圖像或遊戲場景'));
});

test('transition text separates presentation saves from story gates and chapter handoff', () => {
  const common = block('s-0403-3');
  assert(common.includes('transition_progress = { route, from, to, view, committed }'));
  assert(common.includes('`transition_seen` 絕不是通行權限'));
  assert(common.includes('不標記目的房已到訪、不啟動其入場事件'));
  assert(common.includes('不能只憑通路欄位裡的 `to` 或 `committed` 越過主線驗證'));
  assert(graph.edges.every(e => !/transition_(?:seen|progress)/.test(e.gate)));
  const leaving = block('s-0905-55');
  assert(leaving.indexOf('選「繼續」，沿原流程存檔') < leaving.indexOf('<a id="transition-r11-r12-script">'));
  assert(leaving.includes('不先播該房的三下敲擊'));
  assert(block('s-0906-3').includes('不重播梯段、離幕確認或門端驗證'));
  assert(block('s-0603-9').includes('亦不可預先提交 `act3.r12.breaker_repaired`'));
  assert(block('s-0904-25').includes('由神壇轉角回廁所不重播'));
  assert(block('s-0905-22').includes('由 R9 或 R10 回 R8 不重播'));
  assert(common.includes('R17 的 L-04 假路不是離幕'));
  assert(common.includes('R13 ↔ R14 的安息門檻雙向有效'));
  assert(block('s-0907-3').includes('不代做後續掩體移動'));
  assert(!graph.edges.find(e => e.fromId === 'R17' && e.toId === 'R14').motion.includes('T-R17-R18'));
});

test('cultural close-ups stay optional, local and outside main evidence gates', () => {
  assert.equal(canonicalFile(master, 'culture-details'), APPENDIX);
  const assets = block('s-0810-23');
  for (const [id, detail] of [['s-0904-18', '起鍋再放鹽'], ['s-0904-39', '袖口先別剪'],
    ['s-0906-3', '借走的鉗子請掛回'], ['s-0909-15', '下層會濕']]) assert(block(id).includes(detail), id);
  for (const key of ['cooking', 'mending', 'borrowing', 'shared_mail']) {
    assert(assets.includes(`\`${key}\``));
    assert(graph.edges.every(edge => !edge.gate.includes(key)));
  }
  assert(assets.includes('上述 4 組局部'));
  assert(assets.includes('無新配音、證據、資源、主線或結局旗標'));
  assert(block('s-0904-39').includes('不先開放被衣架擋住的繡布'));
  for (const id of ['s-uppertech-31', 's-uppertech-34', 's-uppertech-60', 's-0610-5'])
    assert(block(id).includes('#culture-details'), id);
});

test('P0 footprint contract requires a witnessed baseline and a later occluded change', () => {
  const story = block('s-0903-10');
  for (const phrase of ['須先實際近看第一階段鞋印', '停留 4 秒只使事件待發',
    '完全遮住鞋印時', '關閉該次近看']) assert(story.includes(phrase), phrase);
  for (const phrase of ['未觀察／已觀察／待發／已換圖／已揭露',
    '重載已揭露狀態不補播', '事件可略過，不補播、不擋主線']) assert(block('s-0601-6').includes(phrase), phrase);
  for (const id of ['s-0601-6', 's-0601-10']) {
    assert(block(id).includes('原鞋印'));
    assert(block(id).includes('4 秒只'));
    assert(block(id).includes('完全遮'));
  }
  assert(!master.text.includes('全景停留 4 秒時呈現方向難辨'));
  assert(!master.text.includes('腳印回訪僅靜態差分'));
  const edge = graph.edges.find(e => e.fromId === 'P0' && e.toId === 'P1');
  assert.equal(edge.back, false);
  assert(!edge.gate.includes('HA-P0-01'));
});

test('R2 sightline and R14 arrivals respect the physical route', () => {
  assert(block('s-0904-12').includes('上緣仍留一道能看向梯口的窄縫'));
  for (const id of ['s-0904-16', 's-0602-5']) {
    assert(block(id).includes('出餐小窗上緣窄縫'));
    assert(block(id).includes('沿櫃側原通道'));
  }
  const arrival = block('s-0906-18');
  for (const route of ['從 R13 抵達', '從 R12 抵達', 'R17 假路回流', 'R15 回訪']) assert(arrival.includes(route));
  assert(arrival.includes('抵達均不自動解開本房繼電箱'));
  assert(block('s-uppertech-61').includes('返回 R12 不受安息條件阻擋'));
});

test('R13 date observation does not invent lock-date knowledge or a cause of death', () => {
  assert(block('s-0906-16').includes('已有封鎖日來源才核對重疊'));
  const spec = block('s-0604-5');
  assert(spec.includes('玩家未取得封鎖日來源前只記實見日期'));
  assert(spec.includes('取得封鎖日來源並由玩家比對後'));
  assert(spec.includes('反序取得亦須完成比對'));
  assert(!master.text.includes('使用日期與封鎖日重疊'));
  assert(!master.text.includes('這張床在撤離當天被用過一次'));
});

test('R24 production and sensitive-sequence summary retain actual evidence requirements', () => {
  const pack = block('s-0807-11');
  for (const phrase of ['只疊版面不發', '原職稱', '未安排管理職面試', '倒填三個曆月',
    '同人轉任／撤號欄', '反序查閱也須返回確認', '不同人不必同一天']) assert(pack.includes(phrase), phrase);
  assert(block('s-0001-12').includes('R19 的記憶可不啟動，M1 必須通行但各窗觀察可略過'));
  assert(!block('s-0001-12').includes('四段必須確認必要資訊'));
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
      const canonical = path.relative(path.join(ROOT, 'docs'), absolute).split(path.sep).join('/');
      if (master.documents.has(canonical) && fragment && master.anchorFiles.get(decodeURIComponent(fragment)) !== canonical) errors.push(`${relative}: wrong document for #${fragment}: ${canonical}`);
      if (/06_關卡規格.*\.md$/i.test(target)) errors.push(`${relative}: stale level link ${href}`);
    }
  }
  assert.deepEqual(errors, []);
});

test('website exposes eight acts, an index and one appendix; old bookmarks resolve to their owner', () => {
  const documents = buildDocuments();
  const screenplays = documents.filter(doc => doc.folder === '09_劇本' && !doc.archived);
  for (const doc of screenplays) {
    assert(doc.title.startsWith('遊戲劇本'), doc.path);
    assert.equal(doc.folderLabel, '遊戲劇本');
    assert(!/^(?:文件:|#{1,6} ).*正式劇本/m.test(doc.content), doc.path);
  }
  assert.deepEqual(screenplays.map(doc => doc.path).sort(), [...CANONICAL_FILES].sort());
  assert.equal(documents.filter(doc => doc.redirect).length,17);
  for (const doc of documents.filter(doc => doc.redirect)) {
    const [file, anchor] = doc.redirect.split('#');
    assert.equal(file, canonicalFile(master, anchor));
  }
  const index = documents.find(doc => doc.path === MASTER);
  for (const [anchor, file] of master.anchorFiles) {
    if (file === MASTER) assert(!index.anchorRedirects[anchor]);
    else assert.equal(index.anchorRedirects[anchor], file, anchor);
  }
  assert.equal(documents.filter(doc => doc.weeklyDetail).length,13);
});

test('abridged novel category and titles agree without changing its document path', () => {
  const novels = buildDocuments().filter(doc => doc.folder === '09_故事劇情');
  assert.equal(novels.length, 1);
  assert.equal(novels[0].path, '09_故事劇情/17_縮寫短文.md');
  assert.equal(novels[0].folderLabel, '精簡版小說');
  assert.equal(novels[0].title, '精簡版小說');
  assert(novels[0].content.includes('# 灰燈寨（精簡版小說）'));
});

test('act V varies investigation controls without removing evidence or adding per-page gates', () => {
  const versions = block('s-0908-8');
  const people = block('s-0908-21');
  const timeline = block('s-0908-32');
  for (const text of ['A／B／C 三個來源位置', '整組只提交一次', '不補發尚未取得的證據']) assert(versions.includes(text), text);
  assert(block('s-0606-4').includes('初見不高亮正解'));
  for (const text of ['每人一列', '另外三人的來源仍須各自展開並核對', '三個曆月', '不因畫面整理而自動鎖定']) assert(people.includes(text), text);
  for (const text of ['同一日及共用時間基準', '放大只改視窗尺度', '48 小時事件留在另一日期頁', '未持有碎片也能用本地原件完成', '02:20:11', '02:20:22']) assert(timeline.includes(text), text);
  for (const [spec, anchor] of [['s-0606-4', 's-0908-8'], ['s-0606-5', 's-0908-21'], ['s-0606-6', 's-0908-32']]) assert(block(spec).includes(`](#${anchor})`));
  assert(block('s-0606-6').includes('不播放歷史人物動作'));
  assert(block('s-0908-22').includes('E3-02'));
  const exit = graph.edges.find(e => e.fromId === 'R25' && e.toId === 'R26');
  for (const key of ['timeline_locked', 'e405_seen', 'inventory.override_code.complete', 'speaker_sequence_cleared']) assert(exit.gate.includes(key), key);
  assert(graph.edges.filter(e => ['R23', 'R24', 'R25'].includes(e.fromId))
    .every(e => !/草稿|釘欄|近看已讀/.test(e.gate)));
});

test('act VI adjacent views retain actions and safety while removing repeated setup', () => {
  assert(block('s-0909-17').includes('未主動轉輪不啟動襲擊'));
  assert(block('s-0909-37').includes('不要求重繫、重走或再確認異常'));
  assert(block('s-0909-42').includes('不再出一題分水'));
  assert(block('s-0909-42').includes('親手扣止回栓'));
  const handoff = block('s-0610-15');
  for (const text of ['仍須自行啟動並完成 UD-01', '原完成鍵仍獨立保存', '尚未固定的 U6 重開閥', 'U6 載入仍驗總水量六格']) assert(handoff.includes(text), text);
  assert(block('s-0610-2').includes('不自動把玩家送入下一房'));
  for (const [from, to, gate] of [['U2', 'U2b', 'lower.u2.setup_ready'], ['U2b', 'U3', 'lower.u2.bridge_clear'],
    ['U4b', 'U5', 'lower.u4.service_latch_open'], ['U6', 'U6b', 'lower.u6.balance_held'], ['U6b', 'R30', 'lower.u6.walkway_locked']]) {
    assert(graph.edges.find(e => e.fromId === from && e.toId === to).gate.includes(gate), `${from}->${to}`);
  }
  assert(block('s-0610-16').includes('不增加水槽、步數或必讀文件來湊時長'));
});

test('orientation and visible cultural use do not depend on reading optional notes', () => {
  const common = block('s-0403-3');
  for (const text of ['來路輪廓、去路熱區', '不能直接把底圖水平翻轉', '不提前啟動下一房聲音事件']) assert(common.includes(text), text);
  assert(block('s-0905-55').includes('不能因此新增返回產線的熱點'));
  assert(block('s-0906-62').includes('不另設聲音猜路題'));
  for (const [id, text] of [['s-0904-18', '避開牆上滲水線'], ['s-0904-39', '不讀註記也能看見'],
    ['s-0906-3', '先看得見長期共用與後加管制'], ['s-0909-15', '不讀短箋也能辨認']]) assert(block(id).includes(text), id);
  assert(block('s-0810-23').includes('略過四組文字仍能走完主線'));
  const inventory = read('docs/08_製作管理/08-13_劇情節點與場景道具總表.md');
  assert(inventory.includes('知道了，這次少放'));
  assert(!inventory.includes('借鹽回覆'));
  assert(inventory.includes('不是搶救倒數'));
});

test('play roles and unexecuted greybox checks distinguish design from validation', () => {
  for (const anchor of ['scene-play-roles', 'scene-playtest-checks']) assert.equal(canonicalFile(master, anchor), APPENDIX);
  const roles = block('s-0304-19');
  for (const role of ['推理查證', '證據收集與記錄', '空間觀察與機械操作', '遭遇判讀', '喘息與情感承接', '過渡與生活觀察']) assert(roles.includes(`| ${role} |`), role);
  assert(roles.includes('F3 的視角／格位推理仍依 R20 原規格'));
  const checks = block('s-0304-22');
  for (const text of ['待執行的遊戲灰盒測試', '尚無受測紀錄時一律標未測', '不能把提示後成功混算為自行解出', 'R29 至少 20 秒', 'R31 原 12 秒']) assert(checks.includes(text), text);
  assert(read('docs/08_製作管理/08-13_劇情節點與場景道具總表.md').includes('#scene-playtest-checks'));
});

test('reading chapters omit editorial notes while production contracts remain available', () => {
  let beats = 0;
  for (const act of ACTS) {
    const text = master.documents.get(act.path);
    const story = text.slice(0, text.indexOf(`<a id="spec-act-${act.act}">`));
    assert(!/^〔(?:禁止|製作|製作註|錄音註|保存|排程|抑制)〕/m.test(story), act.path);
    assert(!/【(?:鎖定|新增|沿用待審)/.test(story), act.path);
    assert(!/（新增待審）/.test(story), act.path);
    beats += [...story.matchAll(/<!-- import:[^:]+:begin -->/g)].length;
  }
  assert.equal(beats, 342);
  assert(block('s-0903-3').includes('「……看著亮的地方。」'));
  assert(block('s-0903-3').includes('「別先走。」'));
  assert(!block('s-0903-3').includes('音訊檔名與製作註解'));
  assert(block('s-0601-6').includes('音訊檔名與製作註解不進玩家介面'));
  assert(block('s-0604-5').includes('r13.correct_number_called'));
  assert(block('s-0605-7').includes('核對條件是 A 開、B 關，C 任意'));
  assert(block('s-0608-18').includes('順序固定為人物結局'));
});

test('malformed masters and unmapped routes fail before any output is written', () => {
  assert.throws(() => parseMaster(master.text.replace('<!-- import:s-0904-6:end -->','')), /imported blocks/);
  const badGraph = structuredClone(graph);
  badGraph.edges.push({id:'invalid',fromId:'R1',toId:'POST'});
  assert.throws(() => deriveGraph(master,badGraph), /Unmapped edge/);
  const duplicate = new Map(master.documents);
  duplicate.set(APPENDIX, duplicate.get(APPENDIX) + '\n<a id="act-0"></a>');
  assert.throws(() => parseMaster([...duplicate.values()].join('\n\n'), duplicate), /Duplicate anchor/);
});

console.log(`${passed} checks passed. Text/data validation only; not a Godot playtest or art/audio sign-off.`);
