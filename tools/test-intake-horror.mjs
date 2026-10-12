import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { ACTS, APPENDIX } from './screenplay-files.mjs';
import { parseMaster } from './sync-canonical.mjs';
import { stripReadingInline } from './reading-scene-flow.mjs';

const master = parseMaster();
const block = id => {
  assert(master.blocks.has(id), id);
  return stripReadingInline(master.blocks.get(id));
};
const story = act => master.documents.get(ACTS[act].path);
const spec = act => master.documents.get(ACTS[act].specPath);
const common = master.documents.get(APPENDIX);
const has = (source, ...phrases) => phrases.forEach(phrase => assert(source.includes(phrase), phrase));
const ordered = (source, ...phrases) => {
  let cursor = -1;
  for (const phrase of phrases) {
    const next = source.indexOf(phrase, cursor + 1);
    assert(next > cursor, phrase);
    cursor = next;
  }
};
const voices = [
  '我也是被騙來的。還要我騙朋友？',
  '照稿念。錄完交給我。',
  '這裡很好……你也過來吧。',
  '重來。笑。',
  '這裡很好。你也過來吧。',
];

test('intake shows forced referral in the existing TV before the waiting ghosts appear', () => {
  ordered(block('s-0904-5'), '食宿由管理處分配', '內部留存／錄製原檔', ...voices,
    '完成指定觀察後', '他們想走……卻還在等叫號。');
  has(block('s-0904-5'), '動畫演出／設備內影片', '一名成年人', '逐字字幕');
  has(spec(1), '匿名成年人的嘴、肩與手', '不是凝固歷史解凍', '對外通道仍由康職務管制',
    '錄影者沒有私人外聯權', '不把錄影者指定為五人之一');
  has(common, 'R1 新增五句設備舊檔台詞', '沒有員工自由聯絡或以帶人換釋放');
});

test('third caller resists in the same batch with no added attack, input or salvation', () => {
  const scene = block('s-0904-6');
  ordered(scene, '啟動本機保存的五人待叫序列', '第一、二個號響起', '扣住椅緣的手沒有鬆開',
    '膝蓋卻先朝內門轉去', '手指逐節滑脫', '第四人握緊號牌', '第五人起身後停了半步', '等待循環已結束。');
  has(scene, '這不表示他們已安息或獲救', '看著出口，手抓住椅緣，最後仍往內門走。');
  has(spec(1), '原一次批次、三按鍵、成本、零穩定備援與入口安全位不變',
    '沒有額外 QTE、傷害或救人選項', '抓握／膝轉／鬆手三態', '消散', '3 秒靜默');
  assert(!scene.includes('主角（OS）'));
  assert.equal([...scene.matchAll(/啟動本機保存的五人待叫序列/g)].length, 1);
});

test('film viewing and witnessed resistance are separate from legacy completion and passage', () => {
  has(spec(1), 'scene_detail.r1.intake_clip_v2', '舊電視已查看旗標不自動代表看過新片',
    '不增加看完影片的通行門檻', '未讀台詞不補進筆記', '新片不占用十五種訊號槽',
    'scene_detail.r1.third_resistance_seen', '僅有舊完成旗標不補記', '舊完成存檔不重召五人');
  has(spec(2), '本頁實讀後', '沒有該觀察時只列已知編號及工位', '缺 R1 編號觀察時先保留本頁',
    '不固定挑成 R11 第三排靠牆', '與這個工位沒有身分對應');
  ordered(block('s-0905-12'), '展開接收分配聯', '交友帳號代聊／依稿回覆',
    '實際讀過才把附頁存入', '若曾記下那次抗拒');
});

test('R2 makes the fraud legible without replacing evidence or adding a second puzzle', () => {
  const scene = block('s-0904-13');
  ordered(scene, '工位編號與板上同一列相符', '交友頁縮圖', '對外身分：虛構',
    '承諾服務：未設置', '客戶款項：已入內部帳', '用假交友身分收了錢，答應的服務根本不存在。');
  has(scene, '講師（設備錄音）', '主管（設備錄音）「照腳本」');
  has(spec(1), '舊三欄單獨不足以證明詐騙', '不增卡片、謎題或配音', '不列可操作的收款細節');
  has(spec(2), '第一幕已看出受迫行騙，這裡第一次展開整套產線流程');
});

test('new voice lines and existing stage dialogue agree with the production table', () => {
  const voiceTable = block('s-0904-47');
  const rows = voiceTable.split('\n').filter(line => /^\| \d+ \|/.test(line))
    .map(line => line.split('|').slice(1, -1).map(cell => cell.trim()));
  assert.deepEqual(rows.map(row => Number(row[0])), Array.from({ length: 26 }, (_, i) => i + 1));
  assert.equal(rows.filter(row => row[1].includes('設備')).length, 11);
  assert.equal(rows.filter(row => row[1] === '主角 OS').length, 14);
  for (const row of rows) assert(story(1).includes(`「${row[2]}」`), row[2]);
  for (const line of voices) {
    assert.equal(rows.filter(row => row[2] === line).length, 1, line);
    has(block('s-0904-5'), line);
  }
  has(voiceTable, '**26 行文本**', '| 設備人聲落點 | 11 |', '本輪新增設備人聲 | 5');
});

test('new visual layers reuse existing image orders and the novel reflects the same encounter', () => {
  for (const [act, image, phrase] of [[1, 'R1-V01', '抓椅／膝先轉／手滑脫'],
    [1, 'R1-C02', '五句舊檔字幕'], [1, 'R1-C03', '第三個待叫編號'],
    [1, 'R2-D02', '交友頁縮圖'], [2, 'R7-D02', '交友帳號代聊／依稿回覆']]) {
    const row = spec(act).split('\n').find(line => line.startsWith(`| ${image} |`));
    assert(row, image);
    has(row, phrase);
  }
  const novel = readFileSync(new URL('../docs/09_故事劇情/17_縮寫短文.md', import.meta.url), 'utf8');
  has(novel, ...voices, '手指逐節滑脫', '第三個待叫編號接到眼前桌沿的工位', '沒有告訴我他後來去了哪裡');
  const flow = JSON.parse(readFileSync(new URL('../scene-flow.json', import.meta.url), 'utf8'));
  assert.equal(flow.nodes.length, 48);
  assert.equal(flow.routes.length, 56);
  assert.equal(flow.subscenes.length, 72);
  assert.equal(Object.keys(flow.images).length, 557);
});
