import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { ACTS, APPENDIX } from './screenplay-files.mjs';

const read = file => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8').replaceAll('\r\n', '\n');
const story = act => read(`docs/${ACTS[act].path}`);
const spec = act => read(`docs/${ACTS[act].specPath}`);
const appendix = read(`docs/${APPENDIX}`);
const block = (text, id) => {
  const begin = `<!-- import:${id}:begin -->`;
  const end = `<!-- import:${id}:end -->`;
  assert(text.includes(begin) && text.includes(end), `Missing source block ${id}`);
  return text.slice(text.indexOf(begin), text.indexOf(end));
};
const includes = (text, phrases) => {
  for (const phrase of phrases) assert(text.includes(phrase), `Missing contract: ${phrase}`);
};

test('balance edits retain the ten acts, routes, secondary scenes and image work orders', () => {
  const graph = JSON.parse(read('scene_graph.json'));
  const flow = JSON.parse(read('scene-flow.json'));
  assert.equal(ACTS.length, 10);
  assert.equal(graph.nodes.length, 48);
  assert.equal(graph.edges.length, 56);
  assert.equal(flow.subscenes.length, 72);
  assert.equal(Object.keys(flow.images).length, 523);
  assert.deepEqual(ACTS.map(a => graph.nodes.filter(n => n.act === a.act).length), [3, 6, 6, 6, 5, 4, 6, 5, 4, 3]);
  assert.deepEqual(ACTS.map(a => (story(a.act).match(/^#### (?:\[|POST ·)/gm) ?? []).length), [22, 38, 47, 54, 41, 51, 15, 16, 21, 37]);
});

test('Act III return contract cannot bypass first traversal, power or optional shortcut gates', () => {
  const source = block(spec(3), 's-0604-1');
  includes(source, ['R13／R14 先後可選', '診所安息與物流繼電器', '實際走通該支路', 'transition_seen', 'route_local.*.open', '待處理一次性事件', '不恢復捨棄暫存', 'SQ-T 未完成', '不是新增 R16↔R12、R14↔R17 直連邊', '尚未抵達房間的成果']);
  includes(block(story(3), 's-0906-43'), ['沿已開路返回', '親手接通辦公區線路']);
  includes(block(story(3), 's-0906-59'), ['沿下行踏板到 27F', 'R14→R15→R16→R17', '重排第三份來源']);
});

test('Act V restores physical views without replacing either investigation or adding a gate', () => {
  includes(spec(5), ['不另做扶門框按鍵題', '不自動彈下一份文件', '不做三次提交', '只看一類欄位或站起看服務口不能發 E4-02', '原三格提交', '沒有最低停留秒數', '不預給 E4-05', '安全回景不啟動三喇叭']);
  includes(story(5), ['手扶上門框磨亮的邊', '自行點比對桌坐下', '重開時停在原列與已釘的位置', '收起七分鐘時間尺', '自行翻開旁邊不同日期的對帳頁']);
  const sevenMinutes = story(5).indexOf('[R25-02]');
  const twoDays = story(5).indexOf('[R25-05]');
  const speakers = story(5).indexOf('[R25-09]');
  assert(sevenMinutes < twoDays && twoDays < speakers);
});

test('R30 groups reading without reducing five source placements or committing on close', () => {
  includes(block(story(8), 's-0909-45'), ['三個查看方向', '五個位置都由玩家安置', '收起剖面後保留草稿']);
  includes(spec(8), ['三組不是三次提交', '未確認原不可逆警示就不發 E5-06', '不沉降、不封路', '親手完成制動']);
  includes(block(story(8), 's-0909-47'), ['明確繼續', '繼續才提交五點']);
});

test('R31 recap does not auto-complete new evidence, compromise fallback or remount', () => {
  includes(block(story(8), 's-0909-53'), ['R29 已核筆勢與 R25 已排妥', '玩家沿五列親自接起新舊來源']);
  includes(block(story(8), 's-0909-54'), ['尚未讀齊時', '補查並確認']);
  includes(spec(8), ['五列跨來源關聯仍由玩家完成', '已有單件不等於已完成本房核驗', '不憑縮頁補發未得來源', '缺旗標必須由原附件補查', '必要掛載與五列核驗可互換先後，但須全部完成']);
});

test('R31 and R32 document separate player-controlled revelation boundaries', () => {
  includes(block(story(8), 's-0909-62'), ['再自行轉身', '自行選擇走向門口']);
  includes(spec(8), ['不自動轉身、跨門、開 P1 畫面', '重載不重播解凍']);
  includes(block(story(9), 's-0910-7'), ['來源板收回側邊', '再點門邊的祈願卡繼續']);
  includes(spec(9), ['玩家主動點祈願卡才開始 R32-04', '尚未繼續的階段', '不重做 R31 身分題', '均不自動開封鎖核驗或顯形']);
  includes(block(appendix, 's-0808-14'), ['存讀與閒置不代做轉身或跨門']);
});

test('each act has its own pacing and encounter row, with unmeasured durations identified', () => {
  const pacing = block(appendix, 's-0304-6');
  const encounters = block(appendix, 's-0412-4');
  const checks = block(appendix, 's-0304-20');
  for (const { name } of ACTS) {
    assert(pacing.includes(`| ${name}`), `Missing pacing row: ${name}`);
    assert(encounters.includes(`| ${name}`) || encounters.includes(`| **${name}**`), `Missing encounter row: ${name}`);
    assert(checks.includes(`| ${name} |`), `Missing QA row: ${name}`);
  }
  assert(!pacing.includes('| 第六至八幕／'));
  assert(!encounters.includes('| 第六至八幕／'));
  includes(pacing, ['原合計 90–133 分鐘', '不平均分成三份', '未單獨核定']);
  includes(checks, ['最少必要內容、一般探索及完整收集', '不標成已平衡', '跨幕過渡列在離開幕']);
});

test('modified images reuse existing work orders and reading does not require new collectibles', () => {
  const flow = JSON.parse(read('scene-flow.json'));
  for (const id of ['R12-V01', 'R23-V01', 'R24-D02', 'R25-V01', 'R25-D04', 'R30-D01', 'R31-D01', 'R31-D02', 'R32-D09']) {
    assert(flow.images[id], `Missing image ${id}`);
  }
  includes(spec(5), ['低動態可直接切原出口', '不新增分段完成彈窗', '不加新鏡位']);
  includes(appendix, ['不加觀看或停留旗標', '原出口、必要來源及遭遇門檻不變']);
  const page = story(5).split('\n').find(line => line.includes('[R25-D04]'));
  assert(page.startsWith('〔操作／介面比對〕'), 'The document picture belongs to the actual comparison, not the preceding return');
});
