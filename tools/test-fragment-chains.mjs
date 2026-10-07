import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import {parseMaster} from './sync-canonical.mjs';
import {ACTS} from './screenplay-files.mjs';

const master = parseMaster();
const block = id => {
  assert(master.blocks.has(id), id);
  return master.blocks.get(id);
};
const groups = [
  {name:'第一層揭露', anchor:'h-0904-524', block:'s-0904-42', slots:[['E1-01','s-0904-12'],['E1-03','s-0904-26'],['E1-06','s-0904-13']]},
  {name:'產線關聯', anchor:'h-0905-652', block:'s-0905-53', slots:[['E1-15','s-0905-11'],['E1-06','s-0905-14'],['E2-01','s-0905-23']]},
  {name:'第二層揭露', anchor:'h-0906-451', block:'s-0906-40', slots:[['E2-04','s-0906-37'],['E2-05','s-0906-37'],['E2-14','s-0906-38']]},
  {name:'服務門路由', anchor:'h-0906-626', block:'s-0906-58', slots:[['E3-03','s-0906-46'],['E3-06','s-0906-50'],['E3-07','s-0906-52']]},
  {name:'第三層揭露', anchor:'h-0907-385', block:'s-0907-33', slots:[['E3-01','s-0907-29'],['E3-02','s-0907-31'],['E3-03','s-0906-46']]},
  {name:'第四層揭露', anchor:'h-0908-194', block:'s-0908-22', slots:[['E4-01','s-0908-8'],['E4-02','s-0908-21'],['E3-02','s-0907-31']]},
  {name:'阿彪對峙', anchor:'h-0908-515', block:'s-0908-52', slots:[['E4-03','s-0908-48'],['B03','s-0908-49'],['B01','s-0908-50']]},
  {name:'第五層揭露', anchor:'h-0909-502', block:'s-0909-57', slots:[['E5-01','s-0909-10'],['E5-02','s-0909-26'],['E5-03','s-0909-53']]},
];

function resolveLink(file, href) {
  const [target, anchor] = href.split('#');
  const resolved = target ? path.posix.normalize(path.posix.join(path.posix.dirname(file), target)) : file;
  assert.equal(master.anchorFiles.get(anchor), resolved, `${file}: ${href}`);
  return {file:resolved, anchor};
}

for (const group of groups) test(`${group.name}: all three slots link to their annotated sources`, () => {
  const story = block(group.block), file = master.anchorFiles.get(group.block);
  assert(story.includes(`id="${group.anchor}"`));
  assert(story.includes(`**${group.name}｜三格關聯**`));
  const rows = story.split('\n').filter(line => /^\| 碎片 [ABC](?:／| \|)/.test(line));
  assert.equal(rows.length, 3, group.name);
  group.slots.forEach(([record, source], index) => {
    const letter = 'ABC'[index], row = rows[index];
    assert(row.startsWith(`| 碎片 ${letter}`));
    assert(row.includes(record), `${letter}: ${record}`);
    const sources = [...row.matchAll(/\]\(([^)]+)\)/g)].map(match => resolveLink(file, match[1]).anchor);
    assert(sources.includes(source), `${record}: source link`);
    const pickup = block(source);
    const reference = [...pickup.matchAll(/\[([^\]]+)\]\(([^)]+)\)/g)].find(match => match[1] === `${group.name}／碎片 ${letter}`);
    assert(reference, `${source}: ${group.name}／碎片 ${letter}`);
    assert.equal(resolveLink(master.anchorFiles.get(source), reference[2]).anchor, group.anchor);
  });
});

test('every screenplay fragment annotation resolves, including alternatives and composed sources', () => {
  const allowed = new Set(groups.map(g => g.anchor).concat('h-0906-645'));
  const actualGroups = ACTS.flatMap(act => [...master.documents.get(act.path).matchAll(/\*\*([^*\n]+)｜三格關聯\*\*/g)].map(match => match[1]));
  assert.deepEqual(actualGroups.sort(), groups.map(group => group.name).sort(), 'every declared group is covered exactly once');
  let count = 0;
  for (const act of ACTS) {
    const text = master.documents.get(act.path);
    for (const match of text.matchAll(/\[([^\]]+／碎片 [ABC][^\]]*)\]\(([^)]+)\)/g)) {
      assert(allowed.has(resolveLink(act.path, match[2]).anchor), match[0]);
      count++;
    }
  }
  assert.equal(count, 31);
  assert(!master.documents.get(ACTS[0].path).includes('／碎片 A'));
  assert(!master.documents.get(ACTS[9].path).includes('／碎片 A'));
});

test('reused rankings keep their act-specific completion gates and two slot letters', () => {
  assert(block('s-0904-13').includes('產線關聯／碎片 B'));
  assert(block('s-0904-13').includes('於 R7 補全後使用'));
  assert(block('s-0905-14').includes('第一層揭露／碎片 C'));
  assert(block('s-0905-14').includes('補成完整 `E1-06`'));
  assert(block('s-0905-53').includes('完整 E1-06'));
});

test('alternative C preserves decoding, while stale C still takes the authored false route', () => {
  const seal = block('s-0905-39'), route = block('s-0906-59');
  for (const text of ['狀態仍是未解讀', '實際比對後才可代替', '產線關聯／碎片 C']) assert(seal.includes(text));
  assert(block('s-0905-53').includes('**或已解讀** [E2-09'));
  assert(block('s-0905-15').includes('管理章路的解讀對照頁，與 E2-09 原卡合用'));
  assert(block('s-0905-39').includes('[R7 快捷鍵表](#s-0905-15)'));
  assert(block('s-0905-53').includes('[R7 快捷鍵表](#s-0905-15)'));
  assert(block('s-0906-20').includes('服務門路由／碎片 C：舊路由分支'));
  for (const text of ['碎片 A／E3-03', '碎片 B／E3-06', '碎片 C／E2-08', '32-S → N-2 → RT-3 → L-04', 'C-02 不開']) assert(route.includes(text));
  assert(block('s-0906-58').includes('32-S → N-2 → RT-3 → C-02'));
});

test('document versions and four boss source points do not become extra collectible cards', () => {
  assert(block('s-0908-8').includes('三份原件版本，合併查證後形成這一個碎片'));
  assert(block('s-0908-22').includes('隨前情承接'));
  for (const source of ['s-0908-45','s-0908-46','s-0908-50']) assert(block(source).includes('阿彪對峙／碎片 C'));
  assert(block('s-0908-52').includes('A／B／C 在 B01～B04 全數查證後合成'));
  assert(block('s-0908-52').includes('B01 的演出與摘要共用同一查證狀態'));
  const spec = master.documents.get(ACTS[5].specPath);
  assert(spec.includes('B02：誘入記錄＋任用文件＋較晚自行追加限制附件'));
  for (const id of ['ABIAO_ORIGIN','ABIAO_ORDER','ABIAO_UNFINISHED']) assert(spec.includes(id));
  for (const name of ['誘入與受控任用','主管命令','C-07 與完成欄']) assert(block('s-0908-52').includes(`**${name}**`));
});

test('final identity preserves one last insertion and independent verification gates', () => {
  const reveal = block('s-0909-57'), reading = block('s-0405-9');
  for (const text of ['E5-03／04 核驗與 E5-08 掛載均完成','E5-01 人口展示、E5-02 長期簽核已在前兩格','玩家親手拖 E5-03 進最後一格']) assert(reveal.includes(text));
  assert(block('s-0909-53').includes('E5-04 另作時間與門端核驗'));
  for (const text of ['字母只表示**該組的格位**','物證、聲證、影證、文證','正確槽位和關係仍由玩家判斷及提交','終幕多來源查證']) assert(reading.includes(text));
  for (const group of groups) assert(reading.includes(`#${group.anchor}`));
});

test('opening or filling a board cannot skip the authored submission action', () => {
  for (const [id, action, feedback] of [
    ['s-0905-53','確認關係後正式提交','〔系統／完成回饋〕'],
    ['s-0906-40','再親自確認提交','〔系統／完成回饋〕'],
    ['s-0908-52','再親自確認提交','〔系統／完成回饋〕'],
  ]) {
    const text=block(id);
    assert(text.includes(action), id);
    assert(text.indexOf(action)<text.indexOf(feedback), id+': submit before outcome');
  }
});

test('route and identity fragments are recorded after their essential original fields', () => {
  const after=(id, acquisition, fields)=>{
    const text=block(id), at=text.indexOf(acquisition);
    assert(at>=0, id+': receipt');
    for (const field of fields) assert(text.indexOf(field)>=0&&text.indexOf(field)<at, id+': '+field);
    assert(at<text.indexOf('／碎片 '), id+': annotation follows completed source');
  };
  after('s-0906-50','確認收錄 E3-06',['照撤離協定做','同源文字附件有撤離當日','聽完三句備忘或讀完等效逐字文字']);
  after('s-0906-52','完成才取得 E3-07',['RT-1 的可用支路為 L-04','自檢原件日期晚於撤離改接']);
  after('s-0907-29','確認取得 E3-01',['對回紀律／校正線','在已保存的 E3-03-B 上核對相同入園流水']);
  const routeSpec=master.documents.get(ACTS[3].specPath);
  for (const phrase of ['只對齊 99% 標頭不算完整來源','不提前寫完成','資料收錄不代替 R17_H09']) assert(routeSpec.includes(phrase));
  assert(master.documents.get(ACTS[4].specPath).includes('部門隸屬與 IN-06-B→既有人事號／Michelle 原始對照均由玩家核對後'));
});

test('Act II production distinguishes source ownership, completion and alternative decoding', () => {
  const spec=master.documents.get(ACTS[2].specPath), readiness=block('s-0603-10');
  for (const phrase of [
    'act2-fragment-readiness','act2.r07.e106_seen = true','第一幕持有半頁不等於本幕已補全',
    '`act2.r10.e209_seen`、`act2.r10.e209_decoded` 均為 true','與腳本擇一',
    '不以整房到訪、E1-07 或 `r07.script_seen` 單獨代替那一頁',
    '兩份來源可任意先後取得','未取得的頁維持缺來源','持有來源、放滿草稿與開啟調查板都不算提交',
    '凝固中查閱的快捷鍵頁保留記憶觀察身分，不升格成設備原件',
    '未完成本幕且缺補全或解讀紀錄者','已成功提交的舊成果依有效存檔契約保留',
  ]) assert(readiness.includes(phrase),phrase);
  const row=id=>spec.split('\n').find(line=>line.startsWith(`| \`${id}\` |`));
  assert(row('R07_H03').includes('`LOOK`→`ALIGN`'));
  assert(row('R07_H03').includes('比對完成才補全'));
  assert(row('R10_H03').includes('比對確認另寫 `act2.r10.e209_decoded`'));
  assert(block('s-uppertech-47').includes('可完成產線三格，離幕另依原校驗與門端條件'));
  assert(block('s-uppertech-47').includes('`act2.r10.e209_decoded` 分開保存'));
});
