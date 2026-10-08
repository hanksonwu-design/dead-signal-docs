import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { ACTS, APPENDIX } from './screenplay-files.mjs';
import { MAIN_MARKERS } from '../building/marker-definitions.js';
import { READING_PLACEMENTS } from '../building/screenplay-marker-placement.js';
import { start, act } from '../playtest-model.mjs';
import { deriveGraph, parseMaster } from './sync-canonical.mjs';

const read = file => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8').replaceAll('\r\n', '\n');
const script = read(`docs/${ACTS[7].path}`);
const spec = read(`docs/${ACTS[7].specPath}`);
const finale = read(`docs/${ACTS[9].path}`);
const finaleSpec = read(`docs/${ACTS[9].specPath}`);
const appendix = read(`docs/${APPENDIX}`);
const block = (text, id) => {
  const begin = text.indexOf(`<!-- import:${id}:begin -->`);
  const end = text.indexOf(`<!-- import:${id}:end -->`, begin);
  assert(begin >= 0 && end > begin, `Missing source block: ${id}`);
  return text.slice(begin, end);
};
const has = (text, ...terms) => terms.forEach(term => assert(text.includes(term), `Missing contract: ${term}`));
const ordered = (text, ...terms) => {
  let cursor = -1;
  for (const term of terms) {
    const next = text.indexOf(term, cursor + 1);
    assert(next > cursor, `Missing or out-of-order beat: ${term}`);
    cursor = next;
  }
};
const u4 = block(script, 's-0909-35');
const bypass = block(script, 's-0909-36');
const u4b = block(script, 's-0909-37');

test('the real return is a bounded Xiaohua domain, not a new ghost or a rewritten building', () => {
  const world = block(appendix, 's-0102-24');
  has(world, '不是迷路、錯路或單純幻覺', 'U4 既有回返內門', '不改建物幾何',
    'U4b 檢修夾道在作用門檻之外', 'L2 來路仍按原門禁可返', '不能製造小花式的門檻回返',
    '不增加第三場 Boss', 'seal_resolved 成立後所有怨念回返失效');
  has(spec, '回返只綁 U4_RETURN', 'R29↔U4、U4↔U4b 與 U4b↔U5 不受此門檻改道',
    'R17 正常回程及 L1／L2 的感知異常不可共用此回返控制器');
});

test('the reading order establishes landmarks before returning and a physical bypass afterward', () => {
  ordered(u4, '候梯口的機械低鳴', '內門的陰影', '先看兩個固定地標', '主動穿過原內門',
    '出發前的觀察與眼前局部並排', '確認後，筆記留下');
  ordered(bypass, '初訪看得見的檢修蓋', '管線在內門之前', '鬆外扣', '安全上踏台');
  ordered(u4b, '滴水終於拖出完整的回音', '沿受力方向抽出內銷', '閘後露出冷藏後場');
  assert.doesNotMatch(u4 + bypass + u4b, /小花|雙結|巨翼|四鬚/);
  assert.equal(script.split(READING_PLACEMENTS['U4-V01-horror']).length - 1, 1);
  assert.equal(MAIN_MARKERS.U4.find(([category]) => category === 'horror')[2], '鬼打牆／門檻領域');
});

test('the domain preserves safe comparison, the old save contract and accessible variants', () => {
  has(spec, '原子保存 loop_seen 與同一布標前的回返位置', '不重播或自動寫 return_verified',
    '不增加 domain_cleared、安息鍵或新存檔版本', '既有 service_latch_open 檔',
    '零穩定度、零留光槽、靜音、低動態', '不增加隨機出口', '恐慌扣罰或波形追逐',
    '布標不是驅邪道具', 'service_latch_open 只開機械通路');
  has(u4, '沒有留光時，原本三個地標的比對照常完成');
  has(appendix, 'U4 回返、U4b 插銷不追逐');
});

test('the optional U4 recollection follows S6 confirmation without adding a fourth source', () => {
  const reveal = block(finale, 's-0910-12');
  ordered(reveal, '再確認一次', '關聯完成後，可回看已保存的 48F');
  has(finaleSpec, '不新增第四份證據', '未開回查也能繼續顯形',
    '舊檔未保留 U4 筆記時省略該回查', 'S6 本房三源仍可完整查證');
  const novel = read('docs/09_故事劇情/17_縮寫短文.md');
  ordered(novel, '我想起四十八樓的布結', '把我留在門內的，是小花的領域');
});

test('existing image orders and navigation counts cover the domain without new rooms', () => {
  const flow = JSON.parse(read('scene-flow.json'));
  assert.equal(flow.nodes.length, 48);
  assert.equal(flow.routes.length, 56);
  assert.equal(flow.subscenes.length, 72);
  assert.equal(Object.keys(flow.images).length, 557);
  const rows = spec.split('\n');
  has(rows.find(row => row.startsWith('| U4-V01 |')), '出發／越檻／同址回返', '低動態差分', '附方向字幕');
  has(rows.find(row => row.startsWith('| U4-C03 |')), '內門之前折入蓋底，初訪即有');
  has(rows.find(row => row.startsWith('| U4b-V01 |')), '上方保留 U4 布標', '靜音字幕');
  const body = spec.slice(spec.indexOf('| 入口／目標 | lower.u4.return_verified'));
  ordered(body, '| 保存／回訪 |', '| 出口 |', '| 時長歸屬 |', '| 素材 |', '**領域邊界：**');
  assert(!body.slice(0, body.indexOf('| 素材 |')).includes('\n\n'), 'Do not split the production table');
});

const sequence = ['繫布標', '穿過內門', '核對地標', '鬆外扣', '掀蓋至支撐位', '進入 U4b', '抽內銷'];
test('the model derives room phases from canonical navigation instead of preserving stale labels', () => {
  const graph = JSON.parse(read('scene_graph.json'));
  const model = JSON.parse(read('building/scene-data.json'));
  const master = parseMaster();
  const expected = spec.match(/^房內順序：(踏入門檻領域.*)$/m)[1].split('→').map(step => step.trim());
  assert.deepEqual(graph.phases.U4, expected);
  assert.deepEqual(model.phases, graph.phases);
  const stale = structuredClone(graph);
  stale.phases.U4 = ['stale'];
  stale.phases.UNKNOWN = ['retired'];
  assert.deepEqual(deriveGraph(master, stale).phases, graph.phases);
  const broken = { ...master, text: master.text.replace(/^房內順序：踏入門檻領域.*$/m, '房內順序：') };
  assert.throws(() => deriveGraph(broken, graph), /Empty phase: U4/);
  assert(graph.phases.R33.includes('二十秒黑畫面／環境音'), 'Keep the authored ending presentation override');
});

test('U4 prototype guards every step and cannot replay the return after comparison or reload', () => {
  let state = start('u4');
  for (const action of sequence) assert.equal(act(state, action).step, 0);
  state = act(state, '觀察');
  for (let i = 0; i < sequence.length; i++) {
    // This checks the small interaction model, not the future engine save system.
    state = structuredClone(state);
    for (const wrong of sequence.filter(action => action !== sequence[i])) {
      const unchanged = act(state, wrong);
      assert.equal(unchanged.step, i, `Step ${i}: ${wrong} bypassed its guard`);
      assert.equal(unchanged.done, false);
    }
    state = act(state, sequence[i]);
    assert.equal(state.step, i + 1);
    assert.equal(state.done, i === sequence.length - 1);
  }
  has(state.msg, '可去 U5', '領域未解除');
  assert(!Object.hasOwn(state, 'seal_resolved'));
  for (const action of sequence) assert.equal(act(structuredClone(state), action).step, sequence.length);
});
