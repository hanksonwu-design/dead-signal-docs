import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {parseMaster} from './sync-canonical.mjs';
import {ACTS, APPENDIX} from './screenplay-files.mjs';
import {collectSceneImages, buildSceneImageOutputs} from './build-scene-images.mjs';
import {readingMarkerData} from './build-reader-markers.mjs';

const master = parseMaster();
const story = master.documents.get(ACTS[7].path);
const spec = master.documents.get(ACTS[7].specPath);
const finale = master.documents.get(ACTS[8].path);
const finalSpec = master.documents.get(ACTS[8].specPath);
const common = master.documents.get(APPENDIX);
const graph = JSON.parse(readFileSync(new URL('../scene_graph.json', import.meta.url)));
const collection = collectSceneImages(graph);
const image = id => collection.rows.find(row => row.id === id);
const includes = (text, phrases) => phrases.forEach(phrase => assert(text.includes(phrase), phrase));

test('three manager residences retain separate motives, private bathrooms and controlled departure', () => {
  includes(common, ['47-01', '輪班督導', '設備值班主管', '入園及受訓時共同安置', '升任後才搬到 47-01', '不因一間套房判定自願入園']);
  includes(story, ['額外瓶裝水與洗衣份額', '該班人員的扣配給覆核', '這裡寄不出去', '私人設備扣存聯', '內部分機表', '夜間待命']);
  includes(spec, ['B 棟 47F', '沒有穿過別人的房間才到下一房', '現時儲熱與供水停用']);
});

test('only Kang holds external contact authority; controlled work and escape attempts remain distinct', () => {
  includes(common, ['只有康因職務持有對外聯繫權限', '也沒有探親申請或家書收寄制度',
    '康核定的受控工作通道', '執行話務或監看不等於取得對外線的開放權',
    '中央服務端的解密憑證', '阿尋越過管制嘗試送出的 99% 求援', '小花遭壓下的聯絡家人求助',
    '崩毀後逃生行動', '不取消原結局上傳與 P1 救援能力']);
  for (const act of ACTS) {
    const text = master.documents.get(act.path);
    assert(!/探親申請|待審封套|待審家書|家人的來信|私人聯絡須申請|離園另需上級|離園：另案核准|離園申請駁回聯|代購回條|證件領回聯/.test(text), act.path);
  }
  includes(story, ['「私人通聯：封鎖」「對外線：康職務端」', '這間房的分機標為「內線」', '封住的外線孔']);
  includes(spec, ['control_v2', 'draft_unsent_v2', 'custody_v2', 'intercom_v2',
    'C09 扣存與待命兩頁實讀且核對住客編號', '另讀分機表才保存內線觀察', '未改頁、到訪與敲擊狀態保留']);
});

test('revised confinement documents preserve side-source IDs and late identity reveal', () => {
  const upper = master.documents.get(ACTS[3].path);
  const lower = master.documents.get(ACTS[5].path);
  includes(upper, ['MC-01 的人事編號', 'MU-02 內控人員管制紀錄', '同一人事編號、同一日期',
    '〔系統／筆記更新〕「可處置工作，不可自行離園」', '文件仍未證明這位內控人員就是調查者']);
  includes(lower, ['MC-02 證件扣存續管聯', 'MC-01 事前歸檔副聯', '原件位置 R17、日期與編號']);
  includes(common, ['side.manager_upper.completed', 'MU-02 不新增主線 E 證據、鑰匙或通行權',
    '轉任管理職後證件仍集中扣存', '主管只在內部核定份額中選用']);
  includes(image('R17-D08').content, ['衣物領用回條', '管制紀錄']);
  includes(image('R24-D03').content, ['證件扣存續管聯', '衣物領用']);
  includes(image('R29-C07').content, ['未寄草稿']);
  includes(image('R29-C09').content, ['私人設備扣存聯', '內部分機表']);
});

test('seven optional interior nodes each have a unique view and close-up without adding a mainline route', () => {
  for (let n = 2; n <= 8; n++) {
    const id = `R29-V0${n}`, close = `R29-C${String(n + 2).padStart(2, '0')}`;
    assert.equal(image(id).kind, '操作鏡位');
    assert(image(id).content.startsWith('房內次場景：'));
    assert.equal(image(close).kind, '近看');
    assert.equal((story.match(new RegExp(`\\[${id}\\]\\(`, 'g')) || []).length, 1);
    assert.equal((story.match(new RegExp(`\\[${close}\\]\\(`, 'g')) || []).length, 1);
  }
  includes(spec, ['只接回 V03', '只接回 V05', '只接回 V07', '分別接 V03／V05／V07', '舊公共梯實牆封閉']);
  assert.equal(graph.nodes.length, 48);
  assert.equal(graph.edges.length, 56);
  assert.equal(collection.rows.length, 538);
});

test('optional exploration preserves existing waits, gates, source states and irreversible return lock', () => {
  includes(spec, ['R29 原至少二十秒責任餘波結束後', '三房任選、任意順序、零選填可離房', 'R28 的十五秒收束',
    'R30 原不可逆提交後不再返回 47F', 'views_seen', 'read_pages', '不回填收藏', '取消保留來源與草稿', '不新增主線 E 證據']);
  const route = graph.edges.find(edge => edge.fromId === 'R29' && edge.toId === 'U4');
  assert(!/suite|47-0[123]/i.test(route.gate));
});

test('room ownership requires three matching assignment fields after the original reveal and thaw', () => {
  const start = finale.indexOf('<a id="manager-suite-identity-script">');
  assert(start > finale.indexOf('讀完並確認後，保存 E5-05'));
  includes(finale.slice(start), ['第五層鎖定與十二秒解凍或等效摘要皆完成', '已讀 47-01 配房副聯', '原終端', 'IC-47-01', '三欄一致']);
  includes(finalSpec, ['thaw_state=complete', '不加入任何三格、出口或結局前置', '不把選填插入五秒靜默', '不補造到訪']);
  const wing = story.slice(story.indexOf('<a id="manager-suites-script">'), story.indexOf('<a id="transition-r29-u4-script">'));
  assert(!/梁樂瑤|Michelle|自己的住處|主角的房/.test(wing));
  assert.equal(image('R31-D08').kind, '介面');
});

test('corridor anomaly is optional and once-only while sources stay on their actual reading beat', () => {
  includes(spec, ['knock_played', '不新增 HA 收集項', '離開走廊終止未播尾音', '不排隊重播', '只在站穩鏡位寫入']);
  const markers = readingMarkerData();
  const horror = markers[ACTS[7].path].find(row => row.id === 'R29-V02-horror');
  assert(horror);
  const model = JSON.parse(readFileSync(new URL('../building/scene-markers.json', import.meta.url)));
  assert.equal(model.markers.find(row => row.id === horror.id).timing, '選填查看');
  const source = markers[ACTS[8].path].find(row => row.id === 'R31-D08-item');
  assert(source);
  assert.equal((finale.match(/三欄一致，她才確認/g) || []).length, 1);
  const original = finale.split('\n').find(line => line.includes('[R31-C01]('));
  assert(original.includes('舊站定痕'));
});

test('interior inventory is distinct from transition routes and generation is repeatable', () => {
  const {outputs, flow} = buildSceneImageOutputs(graph);
  const inventory = outputs.get('08_製作管理/08-13_劇情節點與場景道具總表.md');
  includes(inventory, ['另有 7 個房內選填探索鏡位', '房內選填探索鏡位', 'R29-V08']);
  for (const act of [ACTS[7], ACTS[8]]) assert.equal(outputs.get(act.path), master.documents.get(act.path));
  assert.equal(flow.subscenes.length, 72);
  assert(!flow.routes.some(route => route.steps.some(step => /^R29-V0[2-8]$/.test(step.id))));
});
