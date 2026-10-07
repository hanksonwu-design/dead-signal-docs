import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { ACTS, APPENDIX } from './screenplay-files.mjs';
import { collectSceneImages } from './build-scene-images.mjs';

const read = file => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8').replaceAll('\r\n', '\n');
const scripts = ACTS.map(act => read(`docs/${act.path}`));
const specs = ACTS.map(act => read(`docs/${act.specPath}`));
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
const contract = block(appendix, 's-0401-4');

// These checks cover authored contracts and generated data, not engine behavior.
test('past observation and present domains remain distinct within the existing three layers', () => {
  has(contract, '表世界是現在的實景', '過去是同鏡位的凝固觀察', '怨靈領域則是發生在現在的壓迫',
    '不自動成為歷史證據', '沒有第四圖層、平行地圖', '現在觀察 → 查看已解鎖的凝固過去',
    '回現在核對／親手操作', '不會把它帶回現在', 'R31 十二秒解凍仍是唯一歷史動態例外');
  has(block(appendix, 's-0401-5'), '旁邊只有一名', 'R20 的現場查證不以完整觀看 R19 為門檻');
  assert(!block(appendix, 's-0401-5').includes('旁邊站著另外兩個輪廓'));
  assert(!block(appendix, 's-0402-6').includes('安全的現在'));
});

test('comparison retains existing costs, accessibility, encounter and save boundaries', () => {
  has(contract, '首次凝神沿各房既有解鎖、長按及消耗規則', '免費重看只開放實際已見',
    '仍在現場設備播放', '未知的歷史日期不補造',
    '只有已允許調查的空檔可開啟', '不能用來躲過追逐', '不增加通關旗標或存檔版本',
    '不補發未看的碎片', '不重扣首次凝神', '不重播已完成嚇點', '不重設遭遇階段',
    '零選填記憶仍可依原條件通關', '靜音與灰階', '不取代可玩版本');
});

test('R3 teaches spatial comparison without a second photo award or a new window exit', () => {
  const room = block(scripts[1], 's-0904-19');
  ordered(room, '床架與壁紙接縫', '退出後回到現時', '親手掀起現時的枕角', '通往盥洗所與工場');
  has(specs[1], '照片仍沿凝固內實際查看的原條件記為 E1-02', '現時重看不重發',
    '不能據此判死、打開外牆梯或取代 R17 舊檢修副本');
  has(block(scripts[1], 's-0904-21'), '第一部分', '舊維修梯的缺段與封毀處');
  for (const id of ['s-0401-9', 's-0402-11']) {
    has(block(appendix, id), '床位牌姓名與床邊信件');
    assert(!block(appendix, id).includes('先查看枕頭壓痕'));
  }
});

test('R7 to R10 preserves the observed shortcut page, explicit decode and alternate source path', () => {
  has(block(scripts[2], 's-0905-15'), '過去的游標也不動', '凝固觀察', '現場終端紀錄');
  has(block(scripts[2], 's-0905-39'), '凝固中實際查看過的快捷鍵標記', '確認後才記為已解讀',
    '若先拿到卡、後補讀快捷鍵表');
  has(specs[2], '不是假裝兩個不同房間共用一個鏡位', 'E2-01 腳本替代路徑不變',
    '`e209_seen`／`e209_decoded` 分離', '不升格成設備原件');
});

test('R19 comparison follows input recovery and gives the summary equal spatial information', () => {
  const memory = block(scripts[4], 's-0907-14');
  const summary = memory.slice(memory.indexOf('##### 同段文字摘要'));
  has(summary, '椅腳螺栓、排水孔及玻璃下緣', '束帶固定在同一組扣環上');
  has(block(scripts[4], 's-0907-16'), '只讀摘要者回查同段文字', '沿現時可見的側門');
  has(specs[4], '對照入口僅在 R19-07 恢復操作後開放', '八秒 → OS → 四秒',
    '未看此選填內容者仍可沿現場 F2／F3 完成原主線',
    '不由今昔翻頁觸發或重播', '不增加等待時間或離房條件');
});

test('R26 comparison remains one existing B04 verification inside its safe reading window', () => {
  const room = block(scripts[5], 's-0908-50');
  ordered(room, '查看現場未送出處置表', '紙張、手與筆都停住', '安全查證近看',
    '回到門邊', '保存 B04');
  has(specs[5], '不新增戰鬥中切換世界的按鍵', 'C-07 六秒靜默或等值摘要',
    'B04 仍需原三者核對', '四來源全核對即永久止攻', '之後仍須 BOARD_BOSS_ABIAO',
    '不新增第五來源', '不送出處置表');
});

test('existing image orders carry the comparison work without extra maps or fragments', () => {
  const graph = JSON.parse(read('scene_graph.json'));
  const collection = collectSceneImages(graph);
  const row = id => collection.rows.find(row => row.id === id)?.requirements ?? '';
  assert.equal(collection.rows.length, 557);
  has(row('R3-C02'), '現時掀枕後摺邊', '不重發');
  has(row('R3-F01'), '床架、壁紙接縫', '低動態對照');
  has(row('R3-C04'), '舊梯沒有移動熱點');
  has(row('R7-C02'), '快捷鍵頁維持記憶觀察', '來源標籤');
  has(row('R10-D01'), 'S-03', '缺來源與待確認態');
  has(row('R19-D01'), '摘要 A 含椅腳螺栓', '已讀內容');
  has(row('R19-F01'), '現時空椅', '過去束帶與現時 HA 差分分層');
  has(row('R26-D04'), '來源文字可讀', '低動態版維持同資訊');
  const flow = JSON.parse(read('scene-flow.json'));
  assert.equal(flow.nodes.length, 48);
  assert.equal(flow.routes.length, 56);
  assert.equal(flow.subscenes.length, 72);
});

test('the condensed novel preserves the same past to present progression', () => {
  const novel = read('docs/09_故事劇情/17_縮寫短文.md');
  ordered(novel, '床架和壁紙的接縫都在原處', '停在過去的手',
    '等手能動了，我又看向空椅', '凝固裡的筆尖停在同一條欄線上方');
  has(novel, '我想起四十八樓的布結');
});
