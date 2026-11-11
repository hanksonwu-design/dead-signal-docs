import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { ROOT } from './sync-canonical.mjs';
import { ACTS, VIDEO_LIST, VIDEO_ACT_LISTS } from './screenplay-files.mjs';

const docs = rel => readFileSync(path.join(ROOT, 'docs', rel), 'utf8').replaceAll('\r\n', '\n');
const overview = docs(VIDEO_LIST);
const lists = VIDEO_ACT_LISTS.map(rel => ({ rel, text: docs(rel) }));
const segments = lists.flatMap(({ rel, text }) => [...text.matchAll(/<a id="(v-[a-z0-9-]+)"><\/a>\n\n### (\S+)　(\S+)\n\n([\s\S]*?)```prompt\n([\s\S]*?)\n```/g)]
  .map(([, anchor, id, type, facts, prompt]) => ({ rel, anchor, id, type, facts, prompt })));
const SECTIONS = ['【影片】', '【生成方式】', '【長度】', '【分鏡】', '【鏡頭】', '【畫風】', '【不要出現】'];

test('the overview counts every segment that the five act lists carry', () => {
  const rows = overview.match(/^\| \[[^\]]+\]\(10-\d\d_[^)]+\) \|.*$/gm);
  assert.equal(rows.length, 5);
  rows.forEach((row, i) => {
    assert(row.includes(`](${VIDEO_ACT_LISTS[i].split('/').at(-1)})`), row);
    const count = Number(row.split(' | ').at(-1).replace(' |', ''));
    assert.equal(segments.filter(s => s.rel === VIDEO_ACT_LISTS[i]).length, count, VIDEO_ACT_LISTS[i]);
    assert.equal((lists[i].text.match(/^```prompt$/gm) || []).length, count, 'one prompt per segment');
    assert(lists[i].text.startsWith(`---\n文件: 製作規格｜影片製作列表・${ACTS[i].name}\n`), 'title names the act');
  });
  assert.equal(segments.length, Number(overview.match(/\| \*\*(\d+)\*\* \|$/m)[1]));
  assert(!/^\| `/m.test(overview), 'per-segment rows live in the act lists, not the overview');
});

test('every storyboard prompt has the same sections in order and times its beats to the cut length', () => {
  for (const { id, type, prompt, facts } of segments) {
    let at = -1;
    for (const section of SECTIONS) {
      const next = prompt.indexOf(section);
      assert(next > at, `${id}: ${section} out of order`);
      at = next;
    }
    assert(prompt.startsWith(`【影片】${id}｜`), id);
    assert(prompt.split('\n')[0].includes(type.startsWith('過場') || type.startsWith('互動') || type.startsWith('動作回饋') ? `第一人稱${type}` : type), id);
    const beats = [...prompt.matchAll(/^(\d+(?:\.\d+)?)–(\d+(?:\.\d+)?) 秒｜(.+)$/gm)];
    if (prompt.includes('建議直接以圖層差分製作')) { assert.equal(beats.length, 0, id); continue; }
    assert(beats.length >= 1 && beats.length <= 5, `${id}: ${beats.length} beats`);
    let end = 0;
    for (const [, from, to, text] of beats) {
      assert.equal(Number(from), end, `${id}: beats are continuous`);
      assert(Number(to) > Number(from), `${id}: beat has length`);
      assert(text.trim().length >= 4, `${id}: beat has an action`);
      end = Number(to);
    }
    const cut = type === '主觀記憶動畫' ? 5 : Number(facts.match(/\*\*剪用：\*\*約 (\d+(?:\.\d+)?) 秒/)[1]);
    assert.equal(end, cut, `${id}: beats end at the cut length`);
  }
});

test('prompts describe what is seen, not player rules, and keep the faceless art rules', () => {
  const banned = ['身份', '高亮', '像素', '幀', '接口', '隊列', '緩存', '默認', '全屏', '黑屏', '保存進度', '選填', '聲優'];
  for (const { id, type, prompt } of segments) {
    assert(!prompt.includes('玩家'), `${id}: prompt speaks of the camera or her, never the player`);
    for (const word of banned) assert(!prompt.includes(word), `${id}: ${word}`);
    assert(prompt.includes('清楚可辨識的人臉五官'), `${id}: faces stay unreadable`);
    assert(prompt.includes('配樂'), `${id}: no music`);
    if (type === '主觀記憶動畫') {
      assert(prompt.includes('不用凝固層的單色冷青'), `${id}: memory palette differs from the frozen layer`);
      assert(prompt.includes('米色、過長') && prompt.includes('看不見任何人的臉'), `${id}: the other person is only a sleeve`);
      assert(!prompt.includes('白襯衫'), `${id}: memories predate the escape shirt`);
    }
    if (type === '設備內影片') assert(prompt.includes('不含設備外框'), `${id}: device video is screen content`);
  }
});

test('key bridges link to the prompt section of their segment', () => {
  const start = overview.indexOf('## 重點橋段（★）');
  const links = [...overview.slice(start).matchAll(/\[([^\]]+)\]\((10-\d\d_[^)#]+)#(v-[a-z0-9-]+)\)/g)];
  assert(links.length >= 20);
  for (const [, id, file, anchor] of links) {
    const segment = segments.find(s => s.anchor === anchor);
    assert(segment, `${id}: ${anchor} exists`);
    assert.equal(segment.id, id);
    assert(segment.rel.endsWith(file), `${id} lives in ${file}`);
    assert(segment.facts.includes('**重點 ★ '), `${id} shows its key bridge`);
  }
  assert(segments.filter(s => s.prompt.includes('建議直接以圖層差分製作')).length <= 6, 'only a few layer-only segments');
  // A key bridge with any visible action keeps its prompt even when rules dominate its description.
  assert.match(segments.find(s => s.id === 'R12-02·1').prompt, /^0–1\.5 秒｜主角的手先輸入前三碼/m);
});
