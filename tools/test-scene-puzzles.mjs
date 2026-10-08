import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { ACTS, APPENDIX } from './screenplay-files.mjs';
import { MAIN_MARKERS } from '../building/marker-definitions.js';
import { buildCurrentModel } from '../building/current-spatial.js';
import { start, act } from '../playtest-model.mjs';

const read = file => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8').replaceAll('\r\n', '\n');
const story = act => read(`docs/${ACTS[act].path}`);
const spec = act => read(`docs/${ACTS[act].specPath}`);
const appendix = read(`docs/${APPENDIX}`);
const has = (text, ...terms) => terms.forEach(term => assert(text.includes(term), `Missing contract: ${term}`));
const afterAnchor = (text, id) => {
  const tag = `<a id="${id}"></a>`;
  const start = text.indexOf(tag);
  assert(start >= 0, `Missing anchor: ${id}`);
  const rest = text.slice(start + tag.length);
  return rest.split(/\n<a id=/)[0];
};
const table = (text, id) => {
  const firstTable = afterAnchor(text, id).split(/\n\s*\n/).find(part => part.startsWith('|'));
  assert(firstTable, `Missing table: ${id}`);
  const lines = firstTable.trim().split('\n');
  const cells = line => line.split('|').slice(1, -1).map(cell => cell.trim());
  const headers = cells(lines[0]).map(header => header.replace(/^`([^`]+)`$/, '$1'));
  assert(lines.length > 2 && cells(lines[1]).every(cell => /^:?-+:?$/.test(cell)));
  return lines.slice(2).map(line => {
    const row = cells(line);
    assert.equal(row.length, headers.length, `Broken table: ${id}`);
    return Object.fromEntries(headers.map((header, index) => [header, row[index]]));
  });
};
const ordered = (text, ...terms) => {
  let cursor = -1;
  for (const term of terms) {
    const next = text.indexOf(term, cursor + 1);
    assert(next > cursor, `Missing or out of order: ${term}`);
    cursor = next;
  }
};

// Validate authored decision tables and publication contracts, not a playable engine.
test('R12 connector and terminal tables provide one locally observable solution', () => {
  const connectors = table(spec(3), 'r12-connector-options');
  assert.equal(connectors.length, 3);
  const fitting = connectors.filter(row => row['端型'] === '方形' && row['卡榫'] === '完整' && row['標記'] === '低壓');
  assert.deepEqual(fitting.map(row => row['托盤件']), ['完整件']);
  assert(connectors.every(row => row['入座結果'].length > 0));
  const terminals = table(spec(3), 'r12-circuit-terminals');
  assert.equal(terminals.length, 2);
  for (const column of ['固定線端', '可見追線終點', '線端刻記', '正確接座']) {
    assert.equal(new Set(terminals.map(row => row[column])).size, 2, `Ambiguous ${column}`);
  }
  for (const row of terminals) assert.equal(row['線端刻記'], row['接座刻記']);
  assert.deepEqual(terminals.map(row => [row['固定線端'], row['正確接座']]), [['門禁線', '右座'], ['設備線', '左座']]);
  has(story(3), '一個圓口，兩個方口', '方口沿卡榫裂開', '雙短線', '長線', '露出的線槽', '兩條線可任選先接');
});

test('R12 testing, cancellation and restored power cannot grant permission or awaken E11', () => {
  has(spec(3), '插接操作時保持斷電', '收手、扣妥透明護蓋', '失敗回到斷電操作態',
    '成功後保留只讀完成近看', '占用中的接座先拆回該線', '完整件已入座且兩線均接到表列接座',
    '未成功的測試不送出門控、E-11 喚醒或恐慌事件', '保留完整件與其他正確配線',
    '零件回托盤、線端回固定掛位', '已完成舊檔直接還原通電態', '供電正常／待權限核驗',
    'E-11 在通電介面確認供電路由後才喚醒');
  assert.doesNotMatch(spec(3), /開啟 R13[^\n]*同時喚醒 E-?11/);
});

test('U3 light table covers all six positions and exposes both marks only at one angle', () => {
  const rows = table(spec(6), 'u3-light-states');
  assert.equal(rows.length, 6);
  assert.equal(new Set(rows.map(row => `${row['遮光葉']}/${row['燈架槽']}`)).size, 6);
  for (const leaf of ['未遮', '遮住']) {
    assert.deepEqual(rows.filter(row => row['遮光葉'] === leaf).map(row => row['燈架槽']), ['內槽', '中槽', '外槽']);
  }
  assert(rows.filter(row => row['遮光葉'] === '未遮').every(row => row['固定座線'] === '不可辨' && row['可動栓肩線'] === '不可辨'));
  const both = rows.filter(row => row['固定座線'] === '可辨' && row['可動栓肩線'] === '可辨');
  assert.equal(both.length, 1);
  assert.equal(both[0]['燈架槽'], '中槽');
  has(both[0]['畫面回饋'], '仍可看見偏移');
  ordered(story(6), '先斷局部燈電', '裝妥窄罩', '一道刻線先出現', '按本地刻度對齊橋栓');
});

test('U3 mechanical alignment, not lighting or memory collection, controls the bridge', () => {
  const rows = table(spec(6), 'u3-bolt-states');
  assert.deepEqual(rows.map(row => row['橋栓定位']), ['內格', '中格', '外格']);
  assert.equal(rows.filter(row => row['栓孔／止擋'] === '栓孔對正').length, 1);
  assert(rows.filter(row => row['栓孔／止擋'] === '受擋').every(row => row['拉桿結果'] === '保持原位'));
  has(rows[2]['拉桿結果'], '手動拉完整行程後落橋');
  has(spec(6), '罩未固定時檢修燈不啟用', '招牌是另一支路', '不要求已讀 U2 局部或 LM-03',
    '關燈後仍可在原全景操作可辨的拉桿', '僅在當前栓孔對正並完整拉下時',
    '調回錯位就恢復止擋', '拉桿取消則回起點、保留已設定栓位', '僅缺項回原初始位置',
    '不倒補回憶已讀', '送件門內閂仍另需手動開啟');
});

test('U4 landmarks are distinct and compare current observations, not historical access', () => {
  const rows = table(spec(7), 'u4-landmark-pairs');
  assert.deepEqual(rows.map(row => row['原必要組']), ['缺角', '焊疤', '布標']);
  for (const column of ['出發前特徵', '回返後對應', '錯配時可見依據']) {
    assert.equal(new Set(rows.map(row => row[column])).size, 3);
    assert(rows.every(row => row[column].length > 0));
  }
  has(story(7), '斜口朝向扶手', '一長兩短', '長疤靠著直桿', '較長的斷邊垂向地面');
  has(spec(7), '不畫成監控截圖或可探索過去', '門號是可查看的既有對照，不算第四組答案',
    '右側同一局部不能被兩組占用', '必須三組一對一核對且 `marker_tied`、`loop_seen` 已成立',
    '最後一組配對本身不代按確認', '無效配對只清該項', 'ui.investigation_return',
    '原內門只返回一次', '未掀妥不移動鏡位', '內銷仍須到 U4b 親手處理');
});

test('minigames preserve accessible input, tiered hints, safe trials and existing pacing budgets', () => {
  has(appendix, 'id="scene-puzzle-contract"', '鍵盤選取／確認與拖曳等效', '靜音、灰階及低動態都可判題',
    '沿既有三級', '不檢查是否點遍提示或帶齊選填記憶');
  for (const act of [3, 6, 7]) has(spec(act), '#scene-puzzle-contract', '第三級', '不代表');
  has(spec(3), '30～90 秒', '不因試錯多一場嚇點');
  has(spec(6), '2～4 分鐘', '原 10～15 分鐘預算');
  has(spec(7), '2～4 分鐘', '原 8～12 分鐘預算');
});

test('existing artwork work orders and 3D markers carry the same puzzle details', () => {
  const flow = JSON.parse(read('scene-flow.json'));
  assert.equal(flow.nodes.length, 48);
  assert.equal(flow.routes.length, 56);
  assert.equal(flow.subscenes.length, 72);
  assert.equal(Object.keys(flow.images).length, 557);
  for (const [act, id, terms] of [
    [3, 'R12-C01', ['兩條線槽', '雙短線右座', '透明護蓋']],
    [6, 'U3-C02', ['三槽']],
    [6, 'U3-C03', ['偏兩格／偏一格／對正']],
    [7, 'U4-C01', ['一長兩短', '三組配對']],
  ]) {
    assert(flow.images[id]);
    const row = spec(act).split('\n').find(line => line.startsWith(`| ${id} |`));
    has(row, ...terms);
    has(story(act), `[${id}]`);
  }
  for (const [node, title] of [['R12', '接頭配對／雙路追線'], ['U3', '雙刻線對位'], ['U4', '布標與地標配對']]) {
    assert(MAIN_MARKERS[node].some(([category, , label]) => category === 'puzzle' && label === title));
  }
});

test('canonical room phases introduce lighting before mechanical alignment', () => {
  const graph = JSON.parse(read('scene_graph.json'));
  const model = JSON.parse(read('building/scene-data.json'));
  assert.deepEqual(model.phases.U3, graph.phases.U3);
  ordered(graph.phases.U3.join(' → '), '查看燈座', '配罩並隔離眩光', '照出本地雙刻線', '對齊');
  const inventory = read('docs/08_製作管理/08-13_劇情節點與場景道具總表.md');
  has(inventory, '雙路正接', '固定座線／栓肩線', '三組配對後親手確認');
  const novel = read('docs/09_故事劇情/17_縮寫短文.md');
  has(novel, '透明護蓋下的小片', '只有其中一道跟著走', '三處全在原位');
});

test('R12 exit truth table requires both repaired power and verified local access', () => {
  const rows = table(spec(3), 'r12-local-access');
  assert.equal(rows.length, 4);
  assert.equal(new Set(rows.map(row => `${row.breaker_repaired}/${row.local_access_verified}`)).size, 4);
  for (const row of rows) {
    assert(['true', 'false'].includes(row.breaker_repaired));
    assert(['true', 'false'].includes(row.local_access_verified));
    assert.equal(row['R13／R14 通行'] === '開放', row.breaker_repaired === 'true' && row.local_access_verified === 'true');
  }
  const gate = spec(3).split('\n').find(row => row.startsWith('| `must_exit_when` |'));
  has(gate, '`act3.r12.breaker_repaired = true`', '`act3.r12.local_access_verified = true`');
  for (const id of ['R13', 'R14']) {
    const exit = spec(3).split('\n').find(row => row.startsWith(`| ${id} | R12`));
    has(exit, '局部回路已修復且本地權限核驗完成');
  }
  has(afterAnchor(spec(3), 'r12-local-access'), '來源不藏在尚未開啟的櫃內', '查看權限列只記已見',
    '僅有修復或 `shared_access_seen` 不算通過', '經驗證的 R12 門端通過紀錄', '不補發 E-11');
  has(story(3), '完整帳號 `MAINT-A3` 與角色 `SUPERVISOR`', '再按下確認');
  has(appendix, 'act3.r12.local_access_verified');
});

test('U4 matching contract allows releasing occupied targets without discarding other pairs', () => {
  has(spec(7), '只解除這一組並釋放右側位置', '三組全占用時仍可解除，其他連線不變',
    '選到占用位置則保持原草稿', 'Delete／Backspace',
    '每次建立、替換或解除連線後保存草稿', '重開不恢復舊錯線',
    '取消尚未接上右端的選取只清暫時焦點', '核驗完成後為只讀對照',
    '六種完整排列、全占用後逐條解除重排', '只是連滿三條不代表核對成功',
    '來源合法但特徵錯配的線仍保留', '按缺角、焊疤、布標固定組序');
  has(story(7), '按解除圖示騰出位置，再重新配對；其餘連線保留');
  has(appendix, '建立、替換與解除連線都保存');
  const art = spec(7).split('\n').find(row => row.startsWith('| U4-C01 |'));
  has(art, '選中連線／解除釋放', '解除圖示及鍵盤焦點');
});

test('U4 hatch table separates release, lifting and supported opening across cancellation', () => {
  const rows = table(spec(7), 'u4-hatch-state');
  assert.deepEqual(rows.map(row => row['蓋板階段']), ['外扣扣住', '外扣鬆開、蓋未掀', '掀蓋中', '支撐定位']);
  assert.deepEqual(rows.map(row => [row.outer_clasp_released, row.hatch_open]),
    [['false', 'false'], ['true', 'false'], ['true', 'false'], ['true', 'true']]);
  assert(rows.slice(0, 3).every(row => row['可下降'] === '否'));
  has(rows[3]['可下降'], 'return_verified 為 true');
  has(rows[2]['取消／讀檔接續'], '不保存半開姿態');
  has(afterAnchor(spec(7), 'u4-hatch-state'), '回訪不自動落蓋或重扣', '抵達前取消或讀檔回 U4',
    '抵達後還原 U4b 安全位置', '缺少 `hatch_open` 視為未開蓋', '已有合法 U4b 通過紀錄',
    '退回 U4 最近的有效操作階段');
  ordered(story(7), '順著滑槽鬆外扣', '直到支撐片卡入定位', '另點下降到 U4b');
});

test('U4 prototype cannot enter the lower platform after releasing only the clasp', () => {
  let state = start('u4');
  for (const action of ['觀察', '繫布標', '穿過內門', '核對地標', '鬆外扣']) state = act(state, action);
  assert.equal(state.step, 4);
  has(state.msg, '蓋板仍蓋著');
  const premature = act(structuredClone(state), '進入 U4b');
  assert.equal(premature.step, 4);
  assert.equal(premature.done, false);
  state = act(state, '掀蓋至支撐位');
  assert.equal(state.step, 5);
  has(state.msg, '蓋板已撐開');
  assert.equal(act(structuredClone(state), '抽內銷').step, 5);
  state = act(structuredClone(state), '進入 U4b');
  assert.equal(state.step, 6);
  assert.equal(act(state, '抽內銷').done, true);
  has(read('playtest.html'), "'鬆外扣','掀蓋至支撐位','進入 U4b'");
});

test('published routes and 3D data retain the same R12 and U4 passage gates', () => {
  const graph = JSON.parse(read('scene_graph.json'));
  const model = buildCurrentModel(graph, JSON.parse(read('scene-flow.json')));
  for (const to of ['R13', 'R14']) {
    const route = graph.edges.find(edge => edge.fromId === 'R12' && edge.toId === to);
    assert(route, `Missing R12 route to ${to}`);
    has(route.gate, '配電接妥並通過本地權限');
    assert.equal(model.routes.find(edge => edge.id === route.id).gate, route.gate);
  }
  const route = graph.edges.find(edge => edge.fromId === 'U4' && edge.toId === 'U4b');
  assert(route);
  for (const key of ['return_verified', 'outer_clasp_released', 'hatch_open']) {
    has(route.gate, `lower.u4.${key} = true`);
  }
  assert.equal(model.routes.find(edge => edge.id === route.id).gate, route.gate);
  assert(!route.gate.includes('service_latch_open'), 'The below-hatch latch cannot gate reaching it');
  const rows = spec(7).split('\n').filter(row => row.startsWith('| U4 ↔ U4b |') || row.startsWith('| U4b | lower.u4.return_verified'));
  assert.equal(rows.length, 3);
  for (const row of rows) has(row, 'return_verified = true', 'outer_clasp_released = true', 'hatch_open = true');
  has(appendix, 'U4→U4b 同時讀 return_verified、outer_clasp_released 與 hatch_open');
});

test('U3 present-day memory closeup supports both lamp states without changing bridge or recall completion', () => {
  const rows = table(spec(6), 'u3-memory-light');
  assert.deepEqual(rows.map(row => row['現時檢修燈']), ['開啟', '關閉']);
  for (const row of rows) {
    has(row['可選操作'], '查看針線包', '離開');
    has(row['落橋／回憶狀態'], '橋保持開通', '查看不自動完成 LM-03');
  }
  has(rows[1]['針線包與近看照明'], '移除檢修燈光束', '原招牌漏光');
  has(spec(6), '重新開燈是自選操作，不是回憶前置', '不因切燈重播',
    'M 類靜格裡的暖燈屬過去回想，不受現時開關控制');
  has(story(6), '若已關燈，原招牌漏光', '可直接近看包內窄布');
  assert(!story(6).includes('落橋完成，沒有威脅。檢修燈照到舊針線包'));
  const art = spec(6).split('\n').find(row => row.startsWith('| U3-C05 |'));
  has(art, '檢修燈開啟／關閉差分', 'M 靜格暖燈獨立');
});
