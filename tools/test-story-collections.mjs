import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { ACTS, APPENDIX } from './screenplay-files.mjs';
import { parseMaster, deriveGraph } from './sync-canonical.mjs';

const read = file => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const master = parseMaster();
const inventory = read('docs/10_製作規格/10-12_製作規格_收集物與筆記本總表.md');
const novel = read('docs/09_故事劇情/17_縮寫短文.md');
const common = master.documents.get(APPENDIX);
const specs = act => master.documents.get(ACTS[act].specPath);
const stories = act => master.documents.get(ACTS[act].path);
const groups = [
  [4, 'OBS4-04', '小花換工申請與處理回覆', true, 'R21-D02'],
  [6, 'OBS6-07', '剪扣識別牌與私物退回封套', true, 'R27-C01'],
  [6, 'OBS6-08', '修補拖鞋與洗衣留條', false, 'U2-C03'],
  [7, 'OBS7-06', '返家陳述與提價附欄', true, 'R29-D01'],
  [7, 'OBS7-07', '翻譯耳機套內求返卡', false, 'R28-C02'],
];

test('five story discoveries have consistent source ownership, required labels and physical delivery', () => {
  const props = read('docs/08_製作管理/08-13_劇情節點與場景道具總表.md');
  for (const [act, id, name, required, focus] of groups) {
    const rows = inventory.split('\n').filter(row => row.startsWith('| ') && row.includes(id));
    assert.equal(rows.length, 1, `${id}: duplicate or missing inventory row`);
    assert.equal(rows[0].includes('collectible-required'), required, `${id}: required colour`);
    assert(rows[0].includes(name) && rows[0].includes(focus), `${id}: inventory provenance`);
    assert(stories(act).includes(name), `${id}: no story discovery`);
    assert(specs(act).includes(name) && specs(act).includes(focus), `${id}: no local production source`);
    assert(common.includes(name) && props.includes(name) && novel.includes(name), `${id}: related sources omit discovery`);
    for (const state of ['seen', 'draft', 'verified']) {
      assert(specs(act).includes(`observations.${id.toLowerCase().replace('-', '_')}.${state}`), `${id}: missing ${state}`);
    }
    assert.doesNotMatch(stories(act), /OBS[467]-\d\d|observations\.obs/, 'Internal IDs leaked into reading script');
  }
});

test('the three necessary discoveries extend original checks without a new global collection gate', () => {
  const r21 = specs(4).split('<a id="work-request-r21-spec"></a>')[1].split('<a id="h-0605-429"></a>')[0];
  assert.match(r21, /改去修理桌/);
  assert.match(r21, /重排訓練.*維持原組/);
  assert.match(r21, /原子提交.*verified.*E3-02/);
  assert.match(r21, /不寫.*request_v2.*reply_v2/);
  assert.match(r21, /F4.*親手/);
  const r27 = specs(6).split('<a id="returned-belongings-r27-spec"></a>')[1].split('<a id="h-0607-244"></a>')[0];
  assert.match(r27, /returned_subject = personal_items.*person_receipt = unconfirmed/);
  assert.match(r27, /同次寫.*verified.*alias_chain_c_locked/);
  assert.match(r27, /只有三鏈原合併才生成 E5-01/);
  const r29 = specs(7).split('<a id="home-statement-price-spec"></a>')[1].split('<a id="h-0808-409"></a>')[0];
  assert.match(r29, /要求返家；不接受再次調組/);
  assert.match(r29, /管理評級/);
  assert.match(r29, /單次原子保存 E5-02.*local_index_available.*verified/);
  assert.match(r29, /不檢查 R28 卡.*遠端快取/);
  assert.match(r29, /保存後.*二十秒責任停頓/);
  const graph = deriveGraph(master, JSON.parse(read('scene_graph.json')));
  assert.equal(graph.nodes.length, 48);
  assert.equal(graph.edges.length, 56);
  for (const edge of graph.edges) {
    assert.doesNotMatch(JSON.stringify({ gate: edge.gate, returnRule: edge.returnRule }), /OBS[467]-|observations\.obs/, edge.id);
  }
});

test('optional personal stories cannot supply mandatory evidence, resources or extra remote pages', () => {
  const slipper = specs(6).split('<a id="mended-slipper-u2-spec"></a>')[1].split('<a id="h-0610-125"></a>')[0];
  for (const phrase of ['2025-08-03', '2025-08-05', 'slipper_repairs', 'laundry_note', 'UD-01', '不給穿鞋']) assert(slipper.includes(phrase), phrase);
  assert.match(slipper, /正式鎖場不開 U2 入口/);
  assert.match(slipper, /零選填.*全部機關與主線/);
  const card = specs(7).split('<a id="translation-return-card-spec"></a>')[1].split('<a id="h-0808-336"></a>')[0];
  assert.match(card, /不啟動遠端三選一.*不占或增加快取名額.*不補.*E5-07/);
  assert.match(card, /批次.*列號/);
  assert.match(card, /不鎖既有進度/);
  // R28's original single-page choice remains an actual choice.
  assert.match(stories(7), /至多保留一頁/);
  assert.match(stories(7), /未開終端可直接前往 R29/);
});

test('partial reads and legacy completion remain distinct from new verified sources', () => {
  const contract = common.split('<a id="collection-investigation-contract"></a>')[1].split('<!-- import:s-0401-2:end -->')[0];
  assert.match(contract, /多物件未齊只保留部分摘記/);
  assert.match(contract, /合法完成 E3-02.*鏈 C.*E5-02.*不倒扣/);
  assert.match(contract, /不由完成鍵補造新原文.*verified/);
  assert.match(contract, /不重播.*十二／二十秒/);
  for (const [act, id] of groups.filter(([act]) => act !== 4)) {
    const key = id.toLowerCase().replace('-', '_');
    assert(specs(act).includes(`observations.${key}.read_parts`));
  }
  const godot = master.blocks.get('s-0808-6');
  for (const key of ['obs6_07', 'obs6_08', 'obs7_06', 'obs7_07']) assert(godot.includes(key), `${key}: shared save schema`);
});
