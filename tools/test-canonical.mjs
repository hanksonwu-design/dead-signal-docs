import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { ROOT, MASTER, parseMaster, buildSync, deriveGraph, canonicalFile } from './sync-canonical.mjs';
import { ACTS, APPENDIX, CANONICAL_FILES, READING_FILES, SPLIT_MARKER, SPEC_SPLIT_MARKER } from './screenplay-files.mjs';
import { buildDocuments } from './build-docs.mjs';
import { validateProductionOrder, reorderProduction } from './reorder-production-specs.mjs';
import { stripReadingInline } from './reading-scene-flow.mjs';

const read = file => readFileSync(path.join(ROOT, file), 'utf8').replace(/\r\n/g, '\n');
const master = parseMaster();
const graph = JSON.parse(read('scene_graph.json'));
const model = JSON.parse(read('building/scene-data.json'));
let passed = 0;
function test(name, fn) { fn(); passed++; console.log(`PASS ${name}`); }
function block(id) { assert(master.blocks.has(id), id); return stripReadingInline(master.blocks.get(id)); }

test('source manifest accounts for every retained block without empty placeholders', () => {
  assert.equal(master.sources.length, 72);
  assert.equal([...master.text.matchAll(/<!-- import:[^:]+:begin -->/g)].length, master.blocks.size);
  assert.equal([...master.text.matchAll(/<!-- import:[^:]+:end -->/g)].length, master.blocks.size);
  assert.equal(master.sources.reduce((sum, item) => sum + item.count, 0), master.blocks.size);
  assert.equal(new Set(master.sources.flatMap(source => source.blocks.map(block => block.id))).size, master.blocks.size);
  for (const [id, text] of master.blocks) assert(text.replace(/<a id="[^"]+"><\/a>/g, '').trim(), id);
});

test('eight reading acts and eight production files keep unique blocks and paired navigation', () => {
  assert.deepEqual([...master.documents.keys()], CANONICAL_FILES);
  const index = master.documents.get(MASTER);
  assert(index.includes(SPLIT_MARKER));
  assert(index.includes(SPEC_SPLIT_MARKER));
  assert(!index.includes('<!-- import:'));
  let sceneCount = 0;
  for (const act of ACTS) {
    const story = master.documents.get(act.path);
    const spec = master.documents.get(act.specPath);
    assert(!/^正式入口:/m.test(story));
    assert(!story.includes(`<a id="spec-act-${act.act}">`));
    assert(spec.includes(`<a id="spec-act-${act.act}">`));
    assert(!spec.includes(`<a id="act-${act.act}">`));
    assert(story.includes(`../${act.specPath}#spec-act-${act.act}`));
    assert(spec.includes(`../${act.path}#act-${act.act}`));
    assert(index.includes(`../${act.specPath}#spec-act-${act.act}`));
    assert.deepEqual([...story.matchAll(/<a id="act-(\d)">/g)].map(m => Number(m[1])), [act.act]);
    const sceneBlocks = [...story.matchAll(/<!-- import:([^:]+):begin -->/g)].map(m => m[1]);
    sceneCount += sceneBlocks.filter(id => /^#### /m.test(block(id))).length;
    for (const id of sceneBlocks) {
      if (['s-0905-59', 's-0905-60'].includes(id)) assert(/^##### /m.test(block(id)), id);
      else assert(/^#### \[|^#### POST ·/m.test(block(id)), id);
      assert(!spec.includes(`<!-- import:${id}:begin -->`), id);
    }
    for (const technical of ['進行目的：', '**狀態、素材與驗收**', '本幕台詞清單', '本節目標']) assert(!story.includes(technical), act.path);
    assert(story.indexOf(`<a id="act-${act.act}-continue">`) > story.lastIndexOf('<!-- import:'));
    if (act.act < 7) assert(story.includes(`${path.posix.basename(ACTS[act.act + 1].path)}#act-${act.act + 1}`));
    for (const node of graph.nodes.filter(node => node.act === act.act)) {
      const id = node.id.toLowerCase();
      assert(story.includes(`<a id="node-${id}-script">`), id);
      assert(story.includes(`../${act.specPath}#node-${id}-spec`), id);
      assert(spec.includes(`../${act.path}#node-${id}-script`), id);
      for (const suffix of ['spec', 'nav', 'level', 'pack', 'visual']) {
        assert(!story.includes(`<a id="node-${id}-${suffix}">`), `${id}:${suffix}`);
        assert(spec.includes(`<a id="node-${id}-${suffix}">`), `${id}:${suffix}`);
        assert.equal(canonicalFile(master, `node-${id}-${suffix}`), act.specPath);
      }
    }
  }
  assert.equal(sceneCount, 342);
  assert(block('s-0900-2').includes('八份同幕製作規格維護技術條件'));
  assert(!block('s-0900-2').includes('同一份文件內'));
  for (const section of ['book-payoffs', 'book-first-play', 'book-pending', 'book-sources']) {
    assert.equal(canonicalFile(master, section), APPENDIX);
  }
  assert(!master.text.includes('原正文 SHA-256：'));
  assert(!master.text.includes('### 本版修訂：'));
  assert(!master.text.includes('#### 本幕自檢'));
  assert.equal(master.text.split('**存檔與素材驗收：**原房主線').length - 1, 1);
});

test('production specifications follow overview, room flow, shared reference and delivery order', () => {
  assert.deepEqual(validateProductionOrder(master.documents, graph), { acts: 8, nodes: 48, subscenes: 72, passages: 21 });
  assert.deepEqual(reorderProduction(master, graph).documents, master.documents);
});

test('production order validation rejects a return to front-loaded children or misplaced passages', () => {
  const file = ACTS[1].specPath, original = master.documents.get(file);
  for (const edit of [
    text => text.replace('<a id="node-r2-exit"></a>', ''),
    text => text.replace('<a id="transition-r3-r4"></a>', '<a id="transition-r4-r3"></a>'),
    text => text.replace('<a id="spec-act-1-delivery"></a>', ''),
    text => text.replace('<a id="subscene-t-r2-r3-01-spec"></a>', '').replace('<a id="node-r2-level"></a>', '<a id="subscene-t-r2-r3-01-spec"></a>\n<a id="node-r2-level"></a>'),
  ]) {
    const invalid = new Map(master.documents); invalid.set(file, edit(original));
    assert.throws(() => validateProductionOrder(invalid, graph));
  }
});

test('reading scripts omit pause notes without removing production timing', () => {
  for (const act of ACTS) assert(!master.documents.get(act.path).includes('〔停頓〕'), act.name);
  assert(!block('s-0900-4').includes('〔停頓〕'));
  const finaleSpec = master.documents.get(ACTS[7].specPath);
  assert(finaleSpec.includes('離體知情後提供玩家自行繼續的停頓'));
  assert(finaleSpec.includes('疊層短暫減弱'));
});

test('screenplay presentation cues distinguish motion, stills, transitions and interfaces', () => {
  const labels = ['動畫演出', '靜態畫面／景別', '靜態差分', '鏡位切換', '畫面特效', '介面呈現', '配音演出'];
  assert(!master.text.includes('〔演出〕'));
  for (const label of labels) assert(block('s-0900-4').includes(`（${label}）`), label);
  for (const act of ACTS) {
    const story = master.documents.get(act.path);
    assert(story.includes('（動畫演出）'), act.path);
    assert.match(story, /（靜態畫面／(?:遠景|全景|中景|近景|特寫)）/, act.path);
    assert(story.includes('（介面呈現）'), act.path);
  }
  for (const id of ['s-0904-16', 's-0905-22', 's-0906-14', 's-0908-28']) {
    assert(block(id).includes('（鏡位切換）'), id);
  }
  assert(block('s-0903-3').includes('（配音演出）保留人的氣息與猶豫。'));
  assert(block('s-0904-42').includes('（介面呈現）五個人物碎片'));
});

test('every static screenplay cue names its shot size without changing protected framing', () => {
  const counts = [22, 55, 77, 97, 43, 29, 41, 20];
  for (const act of ACTS) {
    const story = master.documents.get(act.path);
    const cues = [...story.matchAll(/（靜態畫面[^）]*）/g)].map(m => m[0]);
    assert.equal(cues.length, counts[act.act], act.name);
    for (const cue of cues) assert.match(cue, /^（靜態畫面／(?:遠景|全景|中景|近景|特寫)）$/, act.name);
    assert(!story.includes('定點構圖'), act.name);
  }
  for (const [id, size, text] of [
    ['s-0903-4', '全景', '黑暗退去'],
    ['s-0903-10', '近景', '鞋印清楚'],
    ['s-0904-22', '近景', '近看先容得下整雙拖鞋'],
    ['s-0904-26', '近景', '同幅必要近看完整露出相鄰牆角'],
    ['s-0905-28', '中景', '真實的手仍扶在椅背上'],
    ['s-0906-50', '遠景', '桌上是咖啡杯'],
    ['s-0906-51', '特寫', '同一杯的外圈已乾'],
    ['s-0907-12', '遠景', '走廊最遠處有一個細小人形'],
    ['s-0907-19', '中景', '控制桌、桌下掩體與玻璃缺角同框'],
    ['s-0909-26', '特寫', '三份文件分別標著 2025 年 8、9、10 月'],
    ['s-0910-28', '中景', '暖光只落到近處的手與椅面'],
  ]) assert(block(id).includes(`（靜態畫面／${size}）${text}`), id);
  for (const text of ['不代表每行自動換鏡', '同鏡位延續沿用相同景別', '不自動框出答案']) {
    assert(block('s-0900-4').includes(text), text);
  }
  for (const text of ['景別對照', '倒影與來路不能被裁掉', '景別標示不改變原熱點']) {
    assert(block('s-0810-24').includes(text), text);
  }
});

test('operation, environment and system cues distinguish inputs, sources and automatic responses', () => {
  const kinds = {
    操作: new Set(['場景點擊', '物件近看', '近看翻頁', '物件操作', '設備按鍵', '介面點選', '介面查閱',
      '介面比對', '介面拖曳', '介面長按', '場景長按', '按鍵感應', '按鍵長按', '感知觸發', '感知長按',
      '視角切換', '返回操作', '原位停留', '定神停留']),
    環境: new Set(['背景聲', '局部音效', '設備聲', '異常聲', '聲場變化', '光線', '觸覺與聲音']),
    系統: new Set(['操作提示', '選項介面', '確認警示', '取得提示', '筆記更新', '狀態顯示', '狀態更新',
      '完成回饋', '錯誤回饋', '送出回饋', '規則註記']),
  };
  const counts = [[21, 17, 8], [62, 27, 20], [92, 33, 11], [133, 24, 12],
    [54, 18, 11], [51, 13, 12], [66, 6, 11], [23, 12, 4]];
  for (const act of ACTS) {
    const story = master.documents.get(act.path);
    assert(!/〔(?:操作|環境|系統)〕/.test(story), act.name);
    const cues = [...story.matchAll(/^〔(操作|環境|系統)／([^〕]+)〕/gm)];
    assert.deepEqual(Object.keys(kinds).map(type => cues.filter(m => m[1] === type).length), counts[act.act], act.name);
    for (const [, type, detail] of cues) {
      const parts = detail.split(/＋|或/);
      assert(parts.length <= 2 && new Set(parts).size === parts.length, detail);
      for (const part of parts) {
        assert(kinds[type].has(part), `${act.name}: ${type}/${part}`);
        assert(block('s-0900-4').includes(part), `Missing cue definition: ${part}`);
      }
    }
  }
  for (const [id, cue, text] of [
    ['s-0903-4', '操作／場景點擊', '玩家第一次點擊'],
    ['s-0903-16', '操作／按鍵感應', '玩家短按 `Q`'],
    ['s-0903-22', '操作／感知長按', '對強訊號點**長按滑鼠左鍵 0.8 秒**'],
    ['s-0904-6', '操作／設備按鍵', '玩家按下現場叫號功能'],
    ['s-0905-6', '操作／原位停留', '玩家在同步座主動停留 2.5 秒'],
    ['s-0905-38', '操作／原位停留或物件近看', '在原位置停留 5 秒，或查看第三張祈願卡'],
    ['s-0905-43', '操作／介面點選', '在同一通電終端選「比對兩版名單」'],
    ['s-0907-9', '操作／場景長按', '玩家按住慢關門'],
    ['s-0907-9', '操作／按鍵長按', '玩家依提示屏息'],
    ['s-0907-40', '系統／狀態更新', '第四次正確輸入後'],
    ['s-0908-32', '操作／介面拖曳', '把三帶對到同一時間尺'],
    ['s-0909-32', '操作／介面點選', '玩家已展開批次，再主動點「可移交」'],
    ['s-0910-23', '系統／送出回饋', '收到副本的收件證明後'],
    ['s-0910-29', '操作／介面長按', '長按「緊急接管」四秒'],
    ['s-0904-6', '環境／設備聲', '每顯示一個編號'],
    ['s-0905-6', '環境／設備聲', '接通快取後，是風扇、販賣機、雨和鍵盤'],
    ['s-0904-28', '系統／錯誤回饋', '「無法解讀。缺少對應線索。標記已記下。」'],
  ]) assert(block(id).includes(`〔${cue}〕${text}`), `${id}: ${cue}`);
  for (const [id, cue, text] of [
    ['s-0908-31', '介面呈現', '進房時，時序軌'],
    ['s-0909-22', '動畫演出', '主角在安全桌邊伸手'],
    ['s-0909-44', '動畫演出', '粉塵往一側落'],
    ['s-0910-34', '動畫演出', '既有分支演出中，她伸出手指向原簽名'],
  ]) assert(block(id).includes(`（${cue}）${text}`), `${id}: automatic presentation`);
  for (const text of ['不是新增的玩家介面文字', '不把替代路徑變成兩步必做', '不另外插入一次確認',
    '預覽不外送，回執不明不重發', '不單憑分類認定說話者', '規則註記不直接顯示']) {
    assert(block('s-0900-4').includes(text), text);
  }
});

test('frozen history and H-08 remain still while present action and the unique thaw are explicit', () => {
  for (const [id, size, text] of [
    ['s-0903-23', '全景', '同一間房'], ['s-0905-27', '近景', '同鏡位靜格'],
    ['s-0907-14', '中景', '凝固構圖始終不動'], ['s-0908-45', '近景', 'C-07 有完整可辨的臉'],
    ['s-0908-25', '近景', '凝固或原快取靜格'], ['s-0909-20', '中景', '25–45 秒靜止回憶'],
  ]) {
    assert(block(id).includes(`（靜態畫面／${size}）${text}`), id);
    assert(!block(id).includes('（動畫演出）'), id);
  }
  assert(block('s-0905-17').includes('（動畫演出）回到現時，老周的迴聲'));
  assert(block('s-0906-11').includes('（動畫演出）退出後，現時輪廓'));
  assert(block('s-0907-12').includes('（靜態差分）玩家轉開鏡頭後才撤去該靜格'));
  assert(block('s-0907-25').includes('（靜態畫面／中景）主角收手時，門邊那隻手仍是靜格。'));
  assert(block('s-0909-5').includes('（靜態畫面／遠景）窗內的人與物保持不動'));
  assert(block('s-0909-59').includes('（動畫演出）同一歷史鏡位中，十二秒解凍'));
  assert(block('s-0909-59').includes('（靜態差分）減少動態版用原八張定格、同十二秒。'));
  assert(block('s-0909-60').includes('（介面呈現）選用文字摘要'));
  assert(block('s-0910-5').includes('（動畫演出）泵體後內凹室'));
  assert(block('s-0910-6').includes('（靜態畫面／近景）記憶不動'));
  assert(block('s-0910-42').includes('（動畫演出）康刷白色管理卡'));
});

test('current document text uses reviewed Taiwan terminology without changing clue wording', () => {
  const stale = /證据|狀态|观察|辨认|设备|自动|選项|半翼与|開门|不从|未送出处置|历史|內井墙|實际打开|預览|条件|进入|關联|结果|结局|艺術|脚本|补記|結论|對话|来源|来自|属于|改变|緩存|隊列|交互文字|幀|接口|身份|主觀視像|實時等待|保存進度|保存離開|默認|全屏|同屏|黑屏|熄屏|整屏閃光|高亮|像素|Godot 導入/;
  for (const doc of buildDocuments()) {
    for (const [index, line] of doc.content.split('\n').entries()) {
      assert(!stale.test(line), `${doc.path}:${index + 1}: ${line}`);
    }
  }
  const format = block('s-0900-4');
  assert(format.includes('台灣用語與校訂原則'));
  assert(format.includes('量測或統計結果可稱「數據」'));
  assert(block('s-0908-21').includes('共同錯字「記綠」、VF-0818'));
  assert(block('s-0904-3').includes('「接收登記」燈箱'));
  assert(block('s-0906-4').includes('插接處缺一個低壓接頭'));
  assert(master.text.includes('來源與儲存介面'));
  assert(master.text.includes('只在佇列中留下空位'));
  assert(master.text.includes('真實時間換命'));
  assert(master.text.includes('完整屏息上限'));
});

test('derived files exactly match the current master; no legacy-heading fallback', () => {
  const { outputs, warnings } = buildSync();
  assert.deepEqual(warnings, []);
  for (const [file, expected] of outputs) assert.equal(read(file), expected, file);
});

test('48 nodes, 56 routes; every source and destination anchor is canonical', () => {
  assert.equal(graph.nodes.length, 48);
  assert.equal(graph.edges.length, 56);
  assert.equal(new Set(graph.nodes.map(n => n.id)).size, 48);
  assert.deepEqual(deriveGraph(master, graph), graph);
  for (const node of graph.nodes) {
    assert.equal(node.source, ACTS[node.act].path);
    assert.equal(node.pack, ACTS[node.act].specPath);
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
    for (const key of ['goal', 'source', 'heading', 'pack', 'packAnchor', 'spatialHeading']) assert.equal(node[key], canonical[key]);
    assert.equal(model.spatial[node.id].source, canonicalFile(master, canonical.spatialHeading));
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

test('worker origins are abduction or coerced friend referrals, without voluntary employment', () => {
  const appendix = master.documents.get(APPENDIX);
  const inventory = read('docs/08_製作管理/08-13_劇情節點與場景道具總表.md');
  for (const text of ['受控員工全部非自願入園', '一類遭直接綁架押入', '受集團脅迫的朋友',
    '帶來新人也不換得釋放', '活著的受控員工都想逃離', '不把小花改成誘騙主角的人',
    '不是面試錄取', '不以受迫免責']) assert(appendix.includes(text), text);
  for (const stale of ['招工燈箱', '招工大廳', '招工門面', '招募廣告', '入職名冊',
    '她面試時自己給的', '可能自願加入', '宿舍、福利、休閒設施，都會在報到後統一安排。']) {
    assert(!master.text.includes(stale), stale);
    assert(!read('docs/09_故事劇情/17_縮寫短文.md').includes(stale), stale);
    assert(!inventory.includes(stale), stale);
  }
  assert(!/招募|招工/.test(inventory));
  assert(inventory.includes('朋友受脅迫邀約／直接被擄'));
  assert(model.spatial.R1.space.includes('接收管制大廳'));
});

test('intake film, ledger and anonymous wall accounts share the coerced origin evidence', () => {
  const story = master.documents.get(ACTS[1].path), spec = master.documents.get(ACTS[1].specPath);
  const line = '食宿由管理處分配。依編號等候，不得自行離開。';
  const account = '朋友說是來修設備的。到了，他才說是被逼打那通電話。我說不做，他們不讓我走。';
  for (const text of [story, spec]) {
    for (const required of [line, account, '我是在回家的路上被抓來的。', '接收名冊',
      '受控轉介', '轉介者離園：不予放行', '對外聯絡：監看']) assert(text.includes(required), required);
  }
  assert(block('s-0904-26').includes('取得 #04 不自動補齊沒讀的段落'));
  assert(block('s-0904-42').includes('只讀一段保留該段，未讀不補發'));
  assert(block('s-0904-42').includes('不增加三格或離幕門檻'));
  assert(spec.includes('舊招收、福利宣傳或取號畫面不得沿用'));
});

test('forged consent remains a source claim and does not erase coercion or later responsibility', () => {
  const story = master.documents.get(ACTS[5].path), spec = master.documents.get(ACTS[5].specPath);
  for (const text of [story, spec]) {
    assert(text.includes('文件聲稱自願（待核）'));
    assert(text.includes('內控主管／已核可校正'));
    assert(text.includes('接收類別：受控轉介'));
    assert(text.includes('聯絡關係：朋友'));
    assert(text.includes('轉介者：留置'));
  }
  const originals = block('s-0913-3');
  assert(originals.includes('受控員工轉介'));
  assert(originals.includes('管理職自願應聘紀錄'));
  assert(originals.includes('原接收記綠'));
  assert(originals.includes('2024-06-18'));
  assert(originals.includes('2025-08-18'));
  assert(spec.includes('act5.r26.hotspot_recruitment_seen'));
});

test('ten expanded routes preserve original departure gates and ordered scene coverage', () => {
  const routes = [
    ['R3', 'R5', 1, 's-0904-23', null, 5, '可自由前往工坊，無額外門鎖；尚缺人物碎片或第一層證據時，只限制 R5→R6 離幕'],
    ['R5', 'R6', 1, 's-0904-45', null, 2, '第一層人物鏈與必要三格鎖定，再於現場門端核對訊號鑰匙；F1 隨必要血字近看記錄，不另作門禁'],
    ['R6', 'R7', 2, 's-0905-8', null, 3, '查看產線玻璃門，記下已見的中層路線後自行前往；設備同步、來電與帳號清單不擋通行'],
    ['R2', 'R3', 1, 's-0904-16', 's-0602-22', 2,
      '完成本房必要操作，依 R2-03 推開送餐車露出梯口；無額外證據或鑰匙'],
    ['R3', 'R4', 1, 's-0904-25', 's-0602-23', 1,
      '可自由前往刻痕牆，無額外門鎖；R3 人物碎片可章內回查，統一在 R5 離幕前核對'],
    ['R7', 'R8', 2, 's-0905-22', 's-0603-35', 2,
      '可沿窄橋自由前往；教戰手冊與留存排行榜在 R11 離幕前核對，老周安息及配給支線不擋通行'],
    ['R11', 'R12', 2, 's-0905-55', 's-0603-36', 7,
      '阿尋必要校驗、arc.ahsun.scope_confirmed 與幕尾 K1-01 成立，再完成現場第一鑰匙門端驗證；SQ-C1／SQ-S 不擋主線'],
    ['R13', 'R14', 3, 's-0906-14', 's-0604-28', 3,
      'E-07 已依本房叫號序列與照護註記安息，診所後門開啟；可退回 R12 不受本條阻擋'],
    ['R17', 'R18', 3, 's-0906-62', 's-0604-29', 4,
      '正確日期證據與 K2-01 成立；假路返回後可重排；離幕前可回查已發現未完成的 SQ-M1／SQ-T，支線不擋主線'],
    ['R24', 'R25', 5, 's-0908-28', 's-0606-26', 1,
      'E4-01／E4-02／E3-02 第四層鎖定成立；act5.r24.board_locked = true']
  ];
  const flow = JSON.parse(read('scene-flow.json'));
  let viewCount = 0;
  for (const [from, to, act, storyId, specId, views, gate] of routes) {
    const route = `T-${from}-${to}`, anchor = `transition-${from.toLowerCase()}-${to.toLowerCase()}`;
    const edges = graph.edges.filter(e => e.fromId === from && e.toId === to);
    assert.equal(edges.length, 1, route);
    const edge = edges[0], oneWay = ['R5','R11','R17'].includes(from);
    assert.equal(edge.gate, gate, route);
    assert.equal(edge.back, !oneWay);
    assert.equal(edge.kind, oneWay ? '跨幕' : from === 'R13' ? '分岔' : '主線');
    assert(!graph.nodes.some(n => n.id === route));
    assert.equal(canonicalFile(master, anchor), ACTS[act].specPath);
    assert.equal(canonicalFile(master, `${anchor}-script`), ACTS[act].path);
    assert(block(storyId).includes(`id="${anchor}-script"`));
    assert.equal(flow.subscenes.filter(s=>s.route===edge.id).length,views);
    assert(block('s-0810-23').includes(`| [${route}](../${ACTS[act].specPath}#${anchor}) | ${views} |`));
    const spec = master.documents.get(ACTS[act].specPath).split(`<a id="${anchor}"></a>`)[1].split('<a id=')[0];
    assert(spec.includes('#transition-rules') || spec.includes('#ascent-route-contract'));
    viewCount += views;
  }
  assert.equal(viewCount, 30);
  assert(master.text.includes('| 既有連線探路／過渡構圖 | **58 個** |'));
  assert(!master.text.includes('15–20F       R6–R11'));
  assert.equal(canonicalFile(master, 'transition-rules'), APPENDIX);
  assert.equal(canonicalFile(master, 'ascent-route-contract'), APPENDIX);
  assert.equal(canonicalFile(master, 'transition-assets'), APPENDIX);
  assert(block('s-0810-23').includes('尚未交付 58 個通路構圖的正式美術或遊戲場景'));
});

test('versioned route saves cannot skip exploration, destination operations or chapter gates', () => {
  const common = block('s-0403-3');
  for (const phrase of ['version: 4', '連續前綴', '不直接送到目的房', '版本 1／2／3 的舊通路圖號改義',
    '不把「看過」當通行權限', '起行不寫入目的房到訪', '不得只憑 to、committed', 'L-04 只走 R17→R14',
    'R13 ↔ R14 的安息門檻雙向有效', 'R3 ↔ R5、R6 ↔ R7']) assert(common.includes(phrase), phrase);
  assert(graph.edges.every(e => !/transition_(?:seen|progress)/.test(e.gate)));
  const leaving = block('s-0905-55');
  assert(leaving.indexOf('選「繼續」，沿原流程存檔') < leaving.indexOf('<a id="transition-r11-r12-script">'));
  assert(leaving.includes('房內仍然一片昏暗，尚未傳出敲擊聲'));
  assert(block('s-0906-3').includes('不重播梯段、離幕確認或門端驗證'));
  assert(block('s-0603-36').includes('尚未抵達目的房不得取得該房道具'));
  assert(block('s-0904-25').includes('由神壇轉角回廁所不重播'));
  assert(block('s-0905-22').includes('由 R9 或 R10 回 R8 不重播'));
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
  assert(block('s-0906-31').includes('僅全面供電後出現這次低壓迴聲'));
  assert(block('s-0906-31').includes('不會打斷穩壓操作、閱讀或安定，也不重複發生'));
});

test('V33 per-room instructions select the correct panel and retain encounter limits', () => {
  for (const [room, panel, character, limit] of [
    ['r10', 1, '通報者', '不新增 E-05 現時現身'],
    ['r13', 3, '斷藥者', '沿 R13 原場次'],
    ['r14', 2, '貨梯裡的人', '依 E-06 既有處置'],
    ['r15', 4, '電房殘響', '限全面供電']
  ]) {
    const start = master.text.indexOf(`<a id="node-${room}-visual">`);
    const story = canonicalFile(master, `node-${room}-script`);
    const end = master.text.indexOf(`[返回本房正式劇本](../${story}#node-${room}-script)`, start);
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
  assert.equal(imageRefs.length, 69);
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

test('website separates reading and production categories and preserves old act bookmarks', () => {
  const documents = buildDocuments();
  const screenplays = documents.filter(doc => doc.folder === '09_劇本' && !doc.archived);
  for (const doc of screenplays) {
    assert(doc.title.startsWith('遊戲劇本'), doc.path);
    assert.equal(doc.folderLabel, '遊戲劇本');
    assert(!/^(?:文件:|#{1,6} ).*正式劇本/m.test(doc.content), doc.path);
  }
  assert.deepEqual(screenplays.map(doc => doc.path).sort(), [...READING_FILES].sort());
  const specs = documents.filter(doc => doc.folder === '10_製作規格' && !doc.archived);
  assert.deepEqual(specs.map(doc => doc.path).sort(), ACTS.map(act => act.specPath).sort());
  for (const spec of specs) {
    assert(spec.title.startsWith('製作規格'), spec.path);
    assert.equal(spec.folderLabel, '製作規格');
  }
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
  for (const act of ACTS) {
    const story = documents.find(doc => doc.path === act.path);
    const expected = Object.fromEntries([...master.anchorFiles].filter(([, file]) => file === act.specPath));
    assert.deepEqual(story.anchorRedirects, expected);
    assert(!story.anchorRedirects[`node-${graph.nodes.find(node => node.act === act.act).id.toLowerCase()}-script`]);
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
  for (const text of ['A／B／C 三個來源位置', '整組確認一次後取得 E4-01', '尚未讀到的頁面保持未讀']) assert(versions.includes(text), text);
  assert(block('s-0606-4').includes('初見不醒目標示正解'));
  for (const text of ['每人一列', '另外三人的來源仍須各自展開並核對', '三個曆月', '不因畫面整理而自動鎖定']) assert(people.includes(text), text);
  for (const text of ['三帶的日期與時鐘基準始終可見', '先保留同日與共用時基', '放大只改視窗尺度', '48 小時事件留在另一日期頁', '未持有碎片也能用本地原件完成', '02:20:11', '02:20:22']) assert(timeline.includes(text), text);
  for (const [spec, anchor] of [['s-0606-4', 's-0908-8'], ['s-0606-5', 's-0908-21'], ['s-0606-6', 's-0908-32']]) {
    assert(block(spec).includes(`](../${ACTS[5].path}#${anchor})`));
  }
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
  assert(block('s-0909-42').includes('親手扣上止回栓'));
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
  assert(block('s-0905-55').includes('身後跨幕門已關'));
  assert(block('s-0906-62').includes('靜音模式仍可只靠接縫與投影判斷'));
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
    const story = master.documents.get(act.path);
    assert(!/^〔(?:禁止|製作|製作註|錄音註|保存|排程|抑制)〕/m.test(story), act.path);
    assert(!/【(?:鎖定|新增|沿用待審)/.test(story), act.path);
    assert(!/（新增待審）/.test(story), act.path);
    beats += [...story.matchAll(/^#### (?:\[|POST ·)/gm)].length;
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

test('Kang post-credit date counts from escape, not either later seal', () => {
  const dates = block('s-0913-2');
  assert(dates.includes('| 第 10 日，康死亡 | 2025-11-14 |'));
  const day = 24 * 60 * 60 * 1000;
  assert.equal((Date.parse('2025-11-14') - Date.parse('2025-11-04')) / day, 10);
  assert(block('s-0910-42').includes('逃亡後第十日（2025-11-14）'));
  assert(block('s-0102-26').includes('逃亡後第 10 日（2025-11-14）'));
  assert(read('docs/09_故事劇情/17_縮寫短文.md').includes('逃亡後第十日'));
  assert(!master.text.includes('封鎖形成後的第十日'));
});

test('evidence summaries keep reachable sources, date rules and exact marginal writing', () => {
  const evidence = block('s-0302-4');
  const row = id => evidence.split('\n').find(line => line.startsWith(`| \`${id}\` |`));
  assert(row('E2-14').includes('R16 第三機櫃本地分級頁'));
  assert(row('E2-14').includes('不返回 R7'));
  assert(row('E3-07').includes('R17 的 32F 外部中繼端'));
  assert(row('E4-02').includes('各自倒填至本人入境前三個曆月'));
  assert(!master.text.includes('同倒填日期檔案'));
  assert(!master.text.includes('R16 技術核心／R7 回訪'));
  assert(block('s-0103-3').includes('寫下「宿舍」二字'));
  assert(block('s-0604-9').includes('寫下「宿舍」二字'));
  assert(block('s-0906-46').includes('手寫「宿舍」兩字'));
});

test('inventory summaries do not invent a prologue lock, clue solution or occupation', () => {
  const inventory = read('docs/08_製作管理/08-13_劇情節點與場景道具總表.md');
  const row = id => {
    const rows = inventory.split('\n').filter(line => line.startsWith(`| ${id} |`));
    assert.equal(rows.length, 1, id);
    return rows[0];
  };
  assert(row('E0-02').includes('實際查看編號牌並記下聲證'));
  assert(row('E0-02').includes('不可鎖定灰槽'));
  assert(row('K0-01').includes('取得 E0-02 後'));
  assert(row('E1-13').includes('E-02 墜落者的逃生路線'));
  assert(row('E2-09').includes('R7 快捷鍵表「轉接校正」'));
  assert(row('E2-09').includes('實際比對後才可替代'));
  assert(row('E2-11').includes('不據此指定職業'));
  assert(row('E4-02').includes('三個曆月'));
  assert(row('E4-00-C').includes('前後電壓正常'));
  const scene = id => inventory.split('\n').find(line => line.startsWith(`| [${id} ·`)) || '';
  assert(scene('P2').includes('凝固全景少一個剪影'));
  assert(scene('R1').includes('不以姿態判定被騙或被擄'));
  assert(scene('R3').includes('E1-13 斷裂床單'));
  assert(scene('R11').includes('已解讀 E2-09'));
  assert(scene('R23').includes('本房同頁見臉與真名'));
  assert(scene('R33').includes('名冊另接片尾流程'));
  assert(block('s-0903-24').includes('房間仍凝固著，門邊卻少了一個人'));
  assert(block('s-0903-25').includes('退出 · 第零層疑點'));
  assert(!master.text.includes('第零層鎖定'));
  assert(!master.text.includes('玩家離開後，剛才的凝固剪影'));
  for (const stale of ['鎖定第零層', '第零層鎖定', '記者通報', '記者未寄', '依本房排班／水痕核對來源', '批次與三個月份'])
    assert(!inventory.includes(stale), stale);
});

test('E2-14 is mandatory inherited evidence but R29 comparison is optional', () => {
  assert(block('s-0906-40').includes('E2-14'));
  assert(block('s-0307-5').includes('E2-14 客戶分級表與第二層鎖定'));
  assert(block('s-0607-8').includes('選填的是本房再次比對，不是先前證據'));
  assert(block('s-0808-11').includes('有效檔略過 `R29_H12`／`R29_H13` 仍能完成'));
  assert(!master.text.includes('未在第三幕取得 `E2-14` 的玩家'));
  assert(!master.text.includes('取得後，一直沒有回收'));
});

test('R21 panic reset follows deduction and never shakes the interaction reticle', () => {
  const expected = '環境威脅資料已更新。';
  assert(block('s-0406-10').includes('親自完成第三層三格鎖定；只讀人事架構表不觸發'));
  assert(block('s-0406-10').includes(expected));
  assert(block('s-0703-6').includes(expected));
  assert(master.documents.get(ACTS[4].path).includes(expected));
  assert(master.documents.get(ACTS[4].specPath).includes(expected));
  assert(block('s-0703-6').includes('感知準心、互動按鈕與字幕保持穩定'));
  for (const stale of ['環境威脅評估更新', '感知準心在階段 2 起才晃動', '（玩家在上鎖辦公室讀完人事架構表）'])
    assert(!master.text.includes(stale), stale);
});

test('insufficient positive stability keeps existing fallback paths usable', () => {
  const rules = block('s-0404-8');
  for (const phrase of ['大於 0 但不足原成本時也可完成', 'max(0, 原值 - 原成本)',
    '不要求先耗到恰好 0', '未配置備援的選填耗費操作', '不啟動、不扣費',
    'R26 與 R31–R33 原停止消耗規則優先']) assert(rules.includes(phrase), phrase);
  assert(rules.includes('來源、關聯、供電與權限仍須成立'));
});

test('ending overview separates transaction commit, uncertain receipts and presentation result', () => {
  const overview = block('s-0303-11');
  assert(overview.includes('此時 branch_outcome_complete=false、seal_resolved=false'));
  assert(overview.includes('演出完成後，才同次保存 branch_outcome_complete=true'));
  assert(overview.includes('D 合翼完成只設 branch_outcome_complete=true'));
  assert(overview.includes('回執不明時，保留同一 pending_commit_id'));
  assert(overview.includes('不換路、不重送'));
  const contract = block('s-0809-4');
  assert(contract.includes('回執不明先查詢，不能重複傳送或換路線'));
  assert(contract.includes('完成後，同次保存 seal_resolved=true'));
  assert(contract.includes('D 完成合翼演出只設 branch_outcome_complete=true'));
});

test('two boss domains retain local geometry, original sources and no extra progression gates', () => {
  const domain = block('s-0410-3');
  for (const phrase of ['全作**兩場**', '阿尋以必要封包校驗收束',
    '或另一種可切換圖層', '不添加領域專屬鑰匙']) assert(domain.includes(phrase), phrase);
  assert(block('s-0606-7').includes('不新增異世界'));
  assert(domain.includes('門框、證物、設備及地標的實際位置不變'));
  assert(domain.includes('R26／R32 必要查證與防禦維持零穩定度可完成'));
  assert(block('s-0102-24').includes('不能製造小花式的門檻回返'));
  assert(block('s-0102-24').includes('R31 仍是唯一歷史解凍'));
  assert.equal(master.anchorFiles.get('boss-domains'), APPENDIX);
  assert.equal(master.anchorFiles.get('abiao-domain'), ACTS[5].specPath);
  assert.equal(master.anchorFiles.get('xiaohua-domain'), ACTS[7].specPath);
  assert(graph.edges.every(edge => !/domain|領域/.test(edge.gate)), 'domains do not become new route gates');
});

test('Abiao domain connects command-space feedback to the original investigation and resolutions', () => {
  assert(block('s-0908-44').includes('走廊的遠聲退下去'));
  assert(block('s-0908-47').includes('核可框只壓住空台面'));
  assert(block('s-0908-47').includes('鉤臂牽住空柄'));
  assert(block('s-0908-50').includes('同一個待確認的位置仍朝向玩家'));
  assert(block('s-0908-52').includes('厚門仍未釋放'));
  assert(block('s-0908-54').includes('阿彪也仍在房裡'));
  assert(block('s-0908-55').includes('房間沒有碎裂或坍塌'));
  const spec = block('s-0606-7').split('<a id="abiao-domain"></a>')[1];
  for (const phrase of ['四來源全核對即永久停攻', '三卡推理完成才進 RESPOND',
    '六秒仍絕對靜默', '3.2 秒完整前兆及 6 秒恢復窗', '明確確認後才等原五秒逾時',
    '不銷毀紙件、不重算抹除', '不另存領域通關旗標', '不重播入場收攏、不重啟 Boss']) assert(spec.includes(phrase), phrase);
  assert(block('s-0807-24').includes('只讀取原狀態，不另排第二組攻擊'));
});

test('Xiaohua domain preserves reveal order, fixed landmarks and ending-specific release', () => {
  assert(block('s-0910-4').includes('沒有遮住來路的翼'));
  assert(block('s-0910-11').includes('房間沒有換過'));
  assert(block('s-0910-13').includes('柱列沒有位移'));
  assert(block('s-0910-14').includes('扶手仍連著側牆凹位'));
  assert(block('s-0910-16').includes('剛才容身的桌下低縫被薄膜包住'));
  assert(block('s-0910-17').includes('假門的輪廓比側牆亮，扶手卻沒有接過去'));
  assert(block('s-0910-18').includes('仍不等於她已經讓路'));
  const spec = block('s-0608-7').split('<a id="xiaohua-domain"></a>')[1];
  for (const phrase of ['三來源完成前不顯完整形態', '不再接一次領域動畫',
    '不新增找地標清單或計時門檻', '不以新遮罩擴大命中', 'D 不先撤再重封',
    '3.5 秒前兆、6 秒恢復窗', '不覆寫 P1 維修影像', '回執不明仍查同一 `pending_commit_id`']) assert(spec.includes(phrase), phrase);
  assert(block('s-0809-9').includes('defense_complete 只清除動態攻擊，不清除封窗與回返'));
});

test('domain inventory and novel agree while added art and playtests remain pending', () => {
  const inventory = read('docs/08_製作管理/08-13_劇情節點與場景道具總表.md');
  assert(inventory.includes('退位、鬆柄與最終拒絕分開'));
  assert(inventory.includes('停戰仍未解封'));
  const novel = read('docs/09_故事劇情/17_縮寫短文.md');
  assert(novel.includes('柱跨和封窗沉進暗處'));
  assert(novel.includes('停止攻擊和讓我離開，是兩件不同的事'));
  const assets = block('s-0810-21');
  assert(assets.includes('以下六組交付'));
  assert(assets.includes('遮罩、音訊混音與差分需另估工時'));
  assert(assets.includes('關閉額外領域遮罩與聲場'));
  assert(assets.includes('原招式前兆、威脅範圍與地標提示仍保留'));
  assert(block('s-0606-7').includes('待灰盒驗收'));
  assert(block('s-0608-7').includes('待灰盒驗收'));
});

test('character-specific audiovisual motifs keep the original encounter scope and source priority', () => {
  const av = block('s-0412-8');
  for (const phrase of ['阿彪、小花仍是兩場正式 Boss', '阿尋是原 R11 訊號遭遇的局部領域',
    '老周是可暫離的低壓迴聲', '現時感知擬音，不是新錄音或可收集訊號',
    '必要來源原音／字幕及安全閱讀 > 招式方向、地標和操作提示 > 額外角色質感',
    'R31 唯一解凍不變', '不跟進相鄰房間', '禁止頻閃', '單聲道仍能作同樣判斷',
    '以上為待實作驗收']) assert(av.includes(phrase), phrase);
  for (const [anchor, owner] of [['haunted-av-language', APPENDIX], ['laozhou-resonance', ACTS[2].specPath],
    ['ahsun-domain', ACTS[2].specPath], ['silenced-field', ACTS[4].specPath]]) {
    assert.equal(master.anchorFiles.get(anchor), owner, anchor);
  }
  assert(block('s-0102-24').includes('不把「有領域感」等同新增 Boss'));
});

test('local uncanny spaces retain optional playback, safe source access and silenced-room boundaries', () => {
  const lao = block('s-0603-5').split('<a id="laozhou-resonance"></a>')[1];
  for (const phrase of ['不封門、不追擊', 'HA-R7-01 已依原規則停止', '兩路一律停新增擬音',
    '沒有背景耳語接話', '暫離只停本地效果，不能當成安息']) assert(lao.includes(phrase), phrase);
  assert(block('s-0905-17').includes('牆上沒有因此少掉一天'));
  const ah = block('s-0603-9').split('<a id="ahsun-domain"></a>')[1];
  for (const phrase of ['不是十一位客戶的亡魂', '此時停攻、不可播放或提交',
    '主動恢復操作才從完整前兆恢復', '後方 W01–W11 原文仍在', '不重寫歷史收件日']) assert(ah.includes(phrase), phrase);
  assert(block('s-0905-45').includes('三層表情薄膜各自繃住不同的笑意'));
  assert(block('s-0905-46').includes('後面的聊天原文還在'));
  const silenced = block('s-0605-4').split('<a id="silenced-field"></a>')[1];
  for (const phrase of ['同一巡行肩線', '不補腳步濺水音', 'R19 九十秒固定段依原靜默',
    '全抹除時只保留吸音板、舊門楣和門控', '不替玩家重演手勢']) assert(silenced.includes(phrase), phrase);
  assert(block('s-0907-37').includes('空缺沒有被陰影補滿'));
});

test('boss material and sound additions retain protected evidence, fixed cues and ending timing', () => {
  const abiao = block('s-0606-7');
  for (const phrase of ['不把表單文字印成新身分或證據', 'C-07 六秒絕對靜默',
    '四來源完成後永久撤掉招式擬音']) assert(abiao.includes(phrase), phrase);
  assert(block('s-0908-44').includes('身體像被壓進一格過窄的待核欄'));
  assert(block('s-0908-54').includes('反折的姿勢卻沒有復原'));
  const xiaohua = block('s-0608-7');
  for (const phrase of ['只在完整顯形條件成立後', '維持原四鬚兩左兩右',
    '不增加致盲、持續傷害或第二次命中', '停戰後掃擦、收緊聲與攻擊動態停止',
    'D 維持安靜的囚禁']) assert(xiaohua.includes(phrase), phrase);
  assert(block('s-0910-13').includes('翼膜近處的細纖維延續袖口邊緣'));
  assert(block('s-0910-17').includes('真正扶手的磨損與斷鉚釘保持清楚'));
});

test('uncanny audiovisual inventory, novel and pending asset estimates agree', () => {
  const assets = block('s-0810-21');
  for (const phrase of ['R7／R11／校正區須新增估工', '17 秒留言原檔保持不變',
    '不新增音檔', '素材命名與引擎匯入待製作時配置', '主觀不安程度']) assert(assets.includes(phrase), phrase);
  const inventory = read('docs/08_製作管理/08-13_劇情節點與場景道具總表.md');
  assert(inventory.includes('不新增收集物、訊號、房間或 Boss'));
  const novel = read('docs/09_故事劇情/17_縮寫短文.md');
  for (const phrase of ['留言照原來的樣子播完', '反光與膜擦退下', '沒有腳步濺水的聲音',
    '矩形反光卡住胸殼', '近處的纖維像原來的衣料']) assert(novel.includes(phrase), phrase);
});

test('gameplay progression maps every original node once and links all eight production acts', () => {
  const flow = block('s-0412-4');
  const table = flow.split('<a id="core-gameplay-nodes"></a>')[1]
    .split('<a id="core-gameplay-audit"></a>')[0];
  const rows = [...table.matchAll(/^\| `([A-Z][A-Za-z0-9]*)` \| (.+) \| (.+) \| (.+) \|$/gm)];
  assert.equal(rows.length, 48);
  assert.equal(new Set(rows.map(row => row[1])).size, 48);
  assert.deepEqual(rows.map(row => row[1]).sort(), graph.nodes.map(node => node.id).sort());
  for (const row of rows) for (const cell of row.slice(2)) assert(cell.trim().length > 8, row[1]);
  for (const act of ACTS) assert(master.documents.get(act.specPath).includes('#core-gameplay-nodes'), act.name);
  for (const anchor of ['core-gameplay-progression', 'core-gameplay-nodes', 'core-gameplay-audit',
    'photo-flow', 'light-marker-route', 'misplaced-residue-cases', 'core-gameplay-assets']) {
    assert.equal(master.anchorFiles.get(anchor), APPENDIX, anchor);
  }
  assert.equal(master.anchorFiles.get('signal-tests'), ACTS[1].specPath);
  assert(flow.includes('R25 喇叭靜默窗，不另加追兵'));
  assert(flow.includes('不使用照片、不留光、略過 R1 兩測試'));
});

test('photo use cannot farm clarity or override the story lock and saved boss outcome', () => {
  const photo = block('s-0406-9');
  for (const phrase of ['| 0–5 |', '| 6–15 |', '| 16–30 |', '| 31+ |',
    '不是每次翻頁就增加', '成功次數加 1', '恐慌至少 1、穩定度大於 0',
    '恐慌 0、穩定度 0、冷卻中或鎖定時只看照片', '不把看照片當作離幕條件',
    '由原處置結果推導完整清晰', '180 秒一次', '不延長正在跑的冷卻',
    '不倍增', '不能靠快捷鍵在招式中新增停攻窗口', '兩種阿彪處置']) assert(photo.includes(phrase), phrase);
  assert(block('s-0903-14').includes('頁內有一張過曝的照片記憶'));
  assert(block('s-0904-6').includes('不看照片也能接著調查'));
  assert(block('s-0908-58').includes('即使從未用過它，也是一樣'));
  assert(block('s-0606-8').includes('不要求查看才開管理門'));
  assert(block('s-0605-8').includes('不能把所有玩家強制鎖 3'));
  assert(block('s-0202-8').includes('單純開關頁面不計次'));
  assert(photo.includes('每次由關閉到主動開啟照片時只判斷一次'));
  assert(photo.includes('讀檔恢復已開啟頁面也不算新開啟'));
});

test('R1 signal tests have local useful effects without completing or resetting the encounter', () => {
  const signal = block('s-0602-4').split('<a id="signal-tests"></a>')[1];
  for (const phrase of ['選填播放 5 點，少於 5 點停用', '不由播放代讀',
    '已候坐時不重送、不扣款', '不清主線進度、不補穩定度',
    '不需要先做 #1 或 #2', '批次中停用另外兩項', '不重付費、不重算五人',
    '測試效果不跨房持續', '必要叫號完成旗標不回退']) assert(signal.includes(phrase), phrase);
  assert(block('s-0904-6').includes('鈴聲只讓它們轉頭'));
  assert(block('s-0904-6').includes('叫號完成後不再以測試召回五人'));
  assert(!block('s-0602-4').includes('播放其他訊號 → 激怒'));
  assert(!block('s-0904-6').includes('依原教學錯誤回饋'));
  assert(block('s-0404-11').includes('其他房不自動繼承有效性'));
  assert(block('s-uppertech-29').includes('不把回座寫成完成，也不把完成寫成安息'));
  assert(!block('s-uppertech-29').includes('安息後回訪不復活'));
  assert(block('s-0803-6').includes('前兩者不激怒、不安息、不開通路'));
  assert(!block('s-0803-9').includes('播放錯誤訊號一次'));
  assert(!master.text.includes('R1 安息後'));
});

test('light markers have four authored choices and cannot strand a zero-slot player', () => {
  const light = block('s-0406-12');
  for (const phrase of ['P1 工具箱', 'R8 通往 R9／R10', 'R12 工具櫃', 'U4 單結布標',
    '每處最多一個，全輪最多三個', '確認才扣槽，取消不扣',
    '不能搬動、收回、跨幕補槽或載入重生', '舊標記仍占槽但不要求為後幕預留',
    '反向鏡位只換投影', '不使用這三個留光槽']) assert(light.includes(phrase), phrase);
  assert(block('s-0905-22').includes('從短租房或祈禱室回來時'));
  assert(block('s-0906-3').includes('光不會替玩家接好線'));
  assert(block('s-0909-35').includes('沒有槽位也繼續沿單結'));
  assert(block('s-0610-9').includes('不能只看光就跳過任一步'));
  assert(block('s-0607-5').includes('已用完三槽或從未留光也呈現相同內容'));
  assert(!block('s-0909-5').includes('發光棒殘光掠過窗面'));
  assert(!block('s-0701-13').includes('發光棒經過'));
});

test('panic misplacements reuse seen objects without replacing evidence or reviving people', () => {
  const panic = block('s-0406-6');
  assert.equal((panic.match(/\| `MR-R\d+` \|/g) || []).length, 2);
  for (const phrase of ['恐慌階段 3、來源確實看過', '免費的全景差分',
    '不進入歷史凝固', '不帶人形、照片或文字', '不複製刻字或數字',
    '不在開門後補播', '不重扣資源或觸發驚嚇']) assert(panic.includes(phrase), phrase);
  assert(!panic.includes('約四分之一'));
  assert(block('s-0604-9').includes('文字摘要不能冒充曾看過該畫面'));
  assert(block('s-0605-8').includes('不干擾 E3-01／02／03 原件'));
  assert(block('s-0906-45').includes('文件上的日期、編號與門牌始終不變'));
  assert(block('s-0907-28').includes('沒有刻字跟過來'));
  assert(panic.includes('不要求跨幕回到原房'));
});

test('gameplay inventory and novel share the source contracts while production stays pending', () => {
  const inventory = read('docs/08_製作管理/08-13_劇情節點與場景道具總表.md');
  for (const anchor of ['core-gameplay-progression', 'photo-flow', 'signal-tests',
    'light-marker-route', 'misplaced-residue-cases', 'core-gameplay-assets', 'core-gameplay-audit']) {
    assert(inventory.includes(`#${anchor}`), anchor);
  }
  const novel = read('docs/09_故事劇情/17_縮寫短文.md');
  assert(novel.includes('重置之後，他們坐回原位'));
  assert(novel.includes('那張照片已經清楚了'));
  const assets = block('s-0810-21').split('<a id="core-gameplay-assets"></a>')[1];
  assert(assets.includes('未宣稱圖稿或引擎已完成'));
  assert(assets.includes('維持 48 個宏觀流程節點、342 場次與 15 個訊號槽'));
  assert(assets.includes('56 條動線包含新增的 U3↔U1 回程捷徑'));
  assert(assets.includes('須另估工時'));
});

test('reading scripts keep implementation states in production documents', () => {
  const states = /\b(?:act[2-6]|arc|side|lower|memory|inventory|scene_detail|moth|series)\.[a-z0-9_.]+|\b(?:SOURCE_READ|SIGNAL_GAMBIT|PACKING_COMPARE|EMERGENCY_CUSTODY|packet_checksum|projection_reveal_complete|seal_resolved|branch_outcome_complete|defense_step|thaw_state)\b|\bcommit [A-E]\b/;
  for (const act of ACTS) {
    assert(!states.test(master.documents.get(act.path)), act.name);
    for (const label of ['旗標', '原子操作', '相容鍵']) assert(!master.documents.get(act.path).includes(label), `${act.name}: ${label}`);
    const spec = master.documents.get(act.specPath);
    for (const anchor of ['player-language', 'reading-load']) assert(spec.includes(`#${anchor}`), act.name);
  }
  const production = [master.documents.get(APPENDIX), ...ACTS.map(act => master.documents.get(act.specPath))].join('\n');
  for (const key of ['arc.ahsun.scope_confirmed', 'packet_checksum', 'authority_familiarity',
    'act4.r20.palm_accepted', 'series.part1_complete', 'inventory.override_code.complete',
    'lower.u6.walkway_locked', 'queue_approved', 'memory.lm03.reviewed',
    'seal_resolved', 'branch_outcome_complete', 'EMERGENCY_CUSTODY']) assert(production.includes(key), key);
  for (const anchor of ['player-language', 'reading-load']) assert.equal(canonicalFile(master, anchor), APPENDIX);
  for (const id of ['s-0905-46', 's-0908-21', 's-0909-55', 's-0910-29']) {
    assert.match(block(id), /\n\n〔操作／[^〕]+〕/, `${id}: separate action paragraphs`);
    assert(block(id).includes('\n\n〔玩家〕'), `${id}: separate player response paragraphs`);
  }
});

test('plain-language signal repair still requires the actual card and expanded roster', () => {
  const card = block('s-0905-59');
  const roster = block('s-0905-43');
  const repair = block('s-0905-46');
  for (const text of ['自行插入原卡', '名單備份／最後一段', 'AX-17', '版本 02', '100／100', '6C2A']) assert(card.includes(text), text);
  for (const text of ['比對兩版名單', 'v01', 'v02', '排除其他人', '標出實際改動',
    '查閱時攻擊、播放與提交都暫停', '主動選「恢復終端操作」', '完整三秒前兆', '小型速查頁不暫停危險']) assert(roster.includes(text), text);
  for (const text of ['實際讀卡', '已收 001–099／缺 100', '再從原件選取 6C2A',
    '未查明他最後想送出哪些名字', '仍不能完成', '已保存可供外部讀取的副本', '0 穩定時仍可']) assert(repair.includes(text), text);
});

test('reading layers retain evidence distinctions without solving or revealing identity early', () => {
  const pace = block('s-0304-19');
  for (const text of ['未知欄位保持未讀', '同錯字只證明範本相同', '不先亮正確路徑',
    '三個月份皆必讀', '尚未測試', '不宣稱已降低負評']) assert(pace.includes(text), text);
  const versions = block('s-0908-8');
  for (const text of ['原職稱', '灰塵點', '建檔晚於入境', '三個月前']) assert(versions.includes(text), text);
  const people = block('s-0908-21');
  for (const text of ['記綠', 'VF-0818', '各自入境前三個曆月', '另外三人的來源仍須各自展開並核對']) assert(people.includes(text), text);
  assert(block('s-0908-32').includes('那個帳號什麼時候有機會通過'));
  assert(block('s-0908-32').includes('還不能證明操作帳號的人是誰'));
  const backup = block('s-0909-55');
  for (const text of ['01:50', '02:20', 'L48_INDEX_PURGE = COMPLETE',
    'DATA_OVERWRITE = INTERRUPTED_AT_POWER_LOSS', 'LOCAL_ASSESSMENT = UNREADABLE',
    'COLD_ARCHIVE_REMOUNTED', '五段通行碼', 'R29 留下的本地資料目錄與現場電力',
    '少了任何一項', '不說所有被覆寫的內容都已復原']) assert(backup.includes(text), text);
});

test('player-facing feedback and ending choices agree with production wording', () => {
  const language = block('s-0900-4');
  for (const text of ['緊急接管', '資料指紋不能還原正文', '四項後果', '不等於當下已送達警方']) assert(language.includes(text), text);
  for (const stale of ['校驗完成。外部可讀副本已保存。', '主管路由已恢復',
    '此工作階段不接受本訊號。', '三格關聯自洽。鎖定。', '遠端工作階段已恢復／刪除排程 01:30']) assert(!master.text.includes(stale), stale);
  assert(block('s-0910-29').includes('長按「緊急接管」四秒'));
  assert(block('s-0910-29').includes('取消不提交'));
  const finale = master.documents.get(ACTS[7].path);
  for (const text of ['收到收件證明後', '收到副本的收件證明後', '這時才保全本地原件',
    '她確認留下', '封鎖沒有解除', '沒有送出定位', 'P1 的肉身仍昏迷存活']) assert(finale.includes(text), text);
  const inventory = read('docs/08_製作管理/08-13_劇情節點與場景道具總表.md');
  assert(inventory.includes('#player-language'));
  assert(inventory.includes('#reading-load'));
  const novel = read('docs/09_故事劇情/17_縮寫短文.md');
  assert(novel.includes('名單已補齊。已保存可供外部讀取的副本。'));
  assert(!novel.includes('校驗完成。外部可讀副本已保存。'));
});

test('common-rule referrals are not duplicated within a source block', () => {
  for (const [id, source] of master.blocks) {
    const links = source.match(/^共用規則見.+$/gm) || [];
    assert.equal(links.length, new Set(links).size, id);
  }
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
