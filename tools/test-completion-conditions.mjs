import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { ACTS } from './screenplay-files.mjs';
import { parseMaster } from './sync-canonical.mjs';

const master = parseMaster();
const flow = JSON.parse(readFileSync(new URL('../scene-flow.json', import.meta.url), 'utf8'));
const markers = JSON.parse(readFileSync(new URL('../building/scene-markers.json', import.meta.url), 'utf8')).markers;
const acts = ACTS.filter(act => act.act !== 1);
const files = new Set(acts.map(act => act.path));
const notes = text => [...text.matchAll(/^\*\*((?:成功|完成)條件（[^\n]+?）：)\*\*([^\n]+)$/gm)]
  .map(([, label, text]) => ({ label, text, plain: label + text }));
const has = (text, ...phrases) => phrases.forEach(phrase => assert(text.includes(phrase), phrase));
const block = id => master.blocks.get(id);

test('all remaining acts annotate completion at the authored interaction', () => {
  const counts = new Map([[0, 4], [2, 19], [3, 28], [4, 12], [5, 9], [6, 10], [7, 11], [8, 10], [9, 13]]);
  for (const act of acts) {
    const story = master.documents.get(act.path);
    const localNotes = notes(story);
    assert.equal(localNotes.length, counts.get(act.act), act.name);
    assert.equal(new Set(localNotes.map(note => note.plain)).size, localNotes.length, act.name);
    const sourceBodies = [...story.matchAll(/<!-- import:[^:]+:begin -->([\s\S]*?)<!-- import:[^:]+:end -->/g)]
      .map(match => match[1]).join('\n');
    assert.equal(notes(sourceBodies).length, localNotes.length, `Notes outside story beats: ${act.name}`);
  }
});

test('every puzzle marker and annotated image carries the same condition in story, spec and model', () => {
  for (const marker of markers.filter(marker => files.has(marker.source) && marker.category === 'puzzle')) {
    const candidates = notes(master.documents.get(marker.source));
    assert(candidates.some(note => marker.requirements.includes(note.plain)), `Unannotated puzzle: ${marker.id}`);
  }
  for (const act of acts) {
    const localNotes = notes(master.documents.get(act.path));
    const rows = master.documents.get(act.specPath).split('\n')
      .filter(line => line.startsWith('| ') && /(?:成功|完成)條件（/.test(line));
    for (const row of rows) {
      const cells = row.split('|').slice(1, -1).map(cell => cell.trim());
      assert.equal(cells.length, 5, row);
      const [image, , , requirements] = cells;
      assert(localNotes.some(note => requirements.includes(note.plain)), `Story/spec disagreement: ${image}`);
      assert.equal(flow.images[image].requirements, requirements, image);
      for (const marker of markers.filter(marker => marker.image === image)) {
        assert.equal(marker.requirements, requirements, marker.id);
      }
    }
  }
});

test('all 31 later route interactions retain local completion notes and unchanged routes', () => {
  const children = flow.subscenes.filter(child => child.play && !/^T-R[35]-/.test(child.id));
  assert.equal(children.length, 31);
  for (const id of ['T-R24-R25-01', 'T-R27-U1-01', 'T-U3-R28-01']) {
    assert(children.some(child => child.id === id), `Missing continuous platform route: ${id}`);
  }
  for (const child of children) {
    const anchor = `<a id="ascent-${child.id.toLowerCase()}-script"></a>`;
    const story = acts.map(act => master.documents.get(act.path)).find(story => story.includes(anchor));
    assert(story, child.id);
    const note = story.split(anchor)[1].trimStart().split('\n')[0];
    assert.match(note, /^\*\*(成功|完成)條件（通路操作）：\*\*/, child.id);
    assert(flow.images[child.id].requirements.includes(note.replaceAll('**', '')), child.id);
  }
  assert.equal(flow.nodes.length, 48);
  assert.equal(flow.routes.length, 56);
  assert.equal(flow.subscenes.length, 72);
  assert.equal(Object.keys(flow.images).length, 562);
});

test('conditions preserve deferred evidence, alternative sources and optional activities', () => {
  has(block('s-0905-14'), '成功條件（主線必要，離幕前補齊）', '未完成排行仍可先往 R8');
  has(block('s-0905-53'), '第三格擇一', '缺段校驗仍各自必要');
  has(block('s-0906-43'), '成功條件（部分供電分支必要）', '未開仍走原路');
  has(block('s-0906-33'), '成功條件（選填捷徑）', '略過仍能走主線');
  has(block('s-0909-24'), '完成條件（選填快取）', '至多保留一頁', '兩種結果都不鎖主線');
});

test('later gates still require physical actions after investigation and arrival', () => {
  has(block('s-0908-52'), '四處查證齊全後攻擊停止', '仍須排卡成立並另做處置');
  has(block('s-0908-53'), '兩路都須長按 2 秒確認');
  has(block('s-0909-16'), '試動本身不算完成收架');
  has(block('s-0909-17'), '把晾架收到止點', '原橋面清出後', '沿側階上橋');
  assert(!block('s-0909-17').includes('升橋'));
  has(block('s-0909-19'), '只有栓肩上的短線跟著走', '橋確實落位後');
  has(block('s-0909-40'), '達到 2／2／2', '再親手關妥閥門');
  has(block('s-0909-42'), '配平不會代替本地止回操作');
  has(block('s-0909-47'), '樓梯此時還未因機構動作封住');
  has(block('s-0909-48'), '零光能與零凝神也能完成');
  has(block('s-0909-62'), '對外握手屬選填');
});

test('finale notes preserve evidence, defensive stages and mutually exclusive ending commitments', () => {
  has(block('s-0910-11'), '親自嘗試離開一次');
  has(block('s-0910-14'), '三段皆過才開放結局處置', '停攻不等於封鎖解除');
  has(block('s-0910-19'), '只須完成一條結局');
  has(block('s-0910-26'), '第三拍放手確認', '原件留在本地而非完整公開');
  has(block('s-0910-27'), '完成 4 秒長按或等價輔助操作', '不以定位送出或封鎖解除為條件');
  has(block('s-0910-29'), '長按 4 秒完成緊急接管');
  has(block('s-0910-32'), '選擇留下則維持封鎖', '康的選填條件不影響正常結束');
});
