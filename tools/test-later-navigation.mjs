import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { parseMaster } from './sync-canonical.mjs';
import { ACTS, APPENDIX } from './screenplay-files.mjs';
import { stripReadingInline } from './reading-scene-flow.mjs';
import { buildSceneImageOutputs } from './build-scene-images.mjs';

const master = parseMaster();
const story = act => master.documents.get(ACTS[act].path);
const spec = act => master.documents.get(ACTS[act].specPath);
const block = id => stripReadingInline(master.blocks.get(id));
const flow = JSON.parse(readFileSync(new URL('../scene-flow.json', import.meta.url), 'utf8'));
const graph = JSON.parse(readFileSync(new URL('../scene_graph.json', import.meta.url), 'utf8'));
const has = (text, ...phrases) => phrases.forEach(phrase => assert(text.includes(phrase), phrase));
const ordered = (text, ...phrases) => {
  let position = -1;
  for (const phrase of phrases) {
    const next = text.indexOf(phrase, position + 1);
    assert(next > position, phrase);
    position = next;
  }
};
const route = (from, to) => flow.routes.find(r => r.from === from && r.to === to);

test('Act 3 finishes clinic investigation before departure and distinguishes alternate arrivals', () => {
  ordered(story(3), 'id="node-r12-script"', 'id="node-r13-script"',
    'id="s-0906-14"', 'id="s-0906-15"', 'id="s-0906-16"',
    'id="transition-r13-r14-script"', 'id="transition-r12-r14-script"',
    'id="node-r14-script"', 'id="transition-r13-r15-script"', 'id="node-r15-script"');
  assert(!block('s-0906-9').includes('id="transition-r12-r14-script"'));
  assert(!block('s-0906-14').includes('23F 後簾接往 24F'));
  has(block('s-0906-16'), '實際離房後沿已開通路回到 R13', '兩條自選來路', '接續房內調查');
  has(block('s-0906-23'), '已接回 R14 繼電器', '此刻人在診所', '兩條入口抵達的是同一個房間');
});

test('SQ-T reads R15 to R12 while graph and production keep the original bidirectional route', () => {
  const passage = block('s-0906-33');
  has(passage, '此刻位於 B 棟 27F 的 R15', '也可留在機房', '回到 R15 並選擇前進後');
  ordered(passage, 'id="subscene-t-r12-r15-03-script"',
    'id="subscene-t-r12-r15-02-script"', 'id="subscene-t-r12-r15-01-script"');
  has(passage, '**樓層：**26F · B 棟 → A 棟', '親自推門返回 R12');
  assert.equal(route('R12', 'R15').back, true);
  assert.deepEqual(route('R12', 'R15').steps.map(s => s.id),
    ['R12', 'T-R12-R15-01', 'T-R12-R15-02', 'T-R12-R15-03', 'R15']);
  const output = buildSceneImageOutputs(graph, master.documents).outputs.get(ACTS[3].path);
  const sequence = output.split('<!-- scene-image-t-r12-r15:begin -->')[1].split('\n\n')[0];
  ordered(sequence, 'T-R12-R15-03', 'T-R12-R15-02', 'T-R12-R15-01');
  has(spec(3), '圖號、製作表與流程資料仍登錄 R12→R15 正向', '不能水平翻圖');
});

test('clinic and logistics gates expose both independent causes without adding a task or bypass', () => {
  has(block('s-0906-11'), '診所待處理', '診所處置', '物流供電');
  has(block('s-0906-14'), '若貨梯側已接妥，設備道門扣也一同退開');
  has(block('s-0906-19'), '診所待處理', '門扣保持伸出', '兩個放行位置同時成立');
  has(spec(3), '不是設備偵測怨靈', '不改寫歷史病歷', '物流先完成時', '診所先完成時',
    '不新增讀牌、巡查或第二次確認條件', '不重播安息');
  for (const [from, to] of [['R13', 'R15'], ['R14', 'R15']]) {
    const edge = graph.edges.find(e => e.fromId === from && e.toId === to);
    has(edge.gate, 'E-07', '物流繼電器');
  }
  const port = flow.nodes.find(n => n.id === 'R14').access.find(p => p.route === 'R14↔R15');
  has(port.state, '診所處置', '物流供電', '伸出鎖舌');
});

test('later one-way doors show restrictions before crossing and keep cancellation and saves distinct', () => {
  has(block('s-0905-54'), '服務測試按鍵只在產線側', '通過後自閉');
  ordered(block('s-0905-55'), '選「留在產線」', '選「繼續」', '跨過這道門', '原鎖舌扣進門框');
  has(spec(2), '目的房到訪只在親自進 R12 時提交', '已離幕舊檔還原門閉差分');
  has(block('s-0906-58'), '相同的「單向檢修／通過後自閉」', '尚未跨門時可收起資料');
  has(block('s-0906-59'), '途中已到平台仍可往返查看', 'R14→R15→R16→R17');
  assert(!block('s-0906-59').includes('〔操作／返回操作〕沿下行扶手繼續前進'));
  has(spec(3), 'L-04 只保存假路進度', '不寫 C-02 離幕或 R18 到訪', '不新增確認次數');
  ordered(block('s-0908-59'), '通過後自閉', '單向離幕確認', '取消留在安全門前', '鎖舌復位');
  has(spec(5), '五段核對與阿彪處置完成只解除工作鎖', '不補七窗觀察');
  has(spec(6), '不於進場再播一次');
  for (const [from, to] of [['R11', 'R12'], ['R17', 'R14'], ['R17', 'R18'], ['R25', 'M1']]) {
    assert.equal(route(from, to).back, false);
  }
});

test('R30 blocks departure on commitment but seals the stairs only after manual braking', () => {
  has(story(7), '留在沉降中的通道完成制動', '制動完成後才實際封閉');
  has(block('s-0909-47'), '繼續後須留在通道完成制動');
  ordered(block('s-0909-48'), '親手拉制動桿', '後方階梯隨後沉降封閉');
  has(spec(8), '此時 return_route_state 為 warning', '未制動不得提前 sealed',
    '已制動不得重新開啟回程', '保留暫停、失焦停表與存檔退出');
  has(master.documents.get(APPENDIX), '手動制動完成後的沉降才設 sealed');
  assert(!master.text.includes('R30 不可逆提交即封回程，不等到制動後'));
});

test('the seven ascent scenes match budgeting without adding routes, evidence or art IDs', () => {
  const ascent = route('R11', 'R12');
  assert.equal(ascent.images.length, 7);
  assert.equal(Object.keys(flow.images).filter(id => /^T-R11-R12-\d{2}-C01$/.test(id)).length, 7);
  has(spec(2), '7 個逐層探路主圖、7 個近看項目');
  assert(!spec(2).includes('15 個逐層探路主圖'));
  assert.equal(flow.nodes.length, 48);
  assert.equal(flow.routes.length, 56);
  assert.equal(flow.subscenes.length, 72);
  assert.equal(Object.keys(flow.images).length, 559);
});
