import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { ROOT } from './sync-canonical.mjs';
import { ACTS, VIDEO_LIST, VIDEO_ACT_LISTS, VIDEO_DIRECTION, VIDEO_ASSETS } from './screenplay-files.mjs';

const docs = rel => readFileSync(path.join(ROOT, 'docs', rel), 'utf8').replaceAll('\r\n', '\n');
const overview = docs(VIDEO_LIST);
const lists = VIDEO_ACT_LISTS.map(rel => ({ rel, text: docs(rel) }));
const segments = lists.flatMap(({ rel, text }) => [...text.matchAll(/<a id="(v-[a-z0-9-]+)"><\/a>\n\n### (\S+)　(\S+?)（([高中低])）\n\n([\s\S]*?)```prompt\n([\s\S]*?)\n```/g)]
  .map(([, anchor, id, type, level, facts, prompt]) => ({ rel, anchor, id, type, level, facts, prompt })));
const LEVEL_CLASSES = { 高: 'importance-high', 中: 'importance-mid', 低: 'importance-low' };
const SECTIONS = ['【影片】', '【生成方式】', '【長度】', '【分鏡】', '【鏡頭】', '【影片風格】', '【不要出現】'];

test('the overview counts every segment that the five act lists carry', () => {
  const typeTable = overview.slice(overview.indexOf('## 統計'), overview.indexOf('## 重要級別統計'));
  const rows = typeTable.match(/^\| \[[^\]]+\]\(10-\d\d_[^)]+\) \|.*$/gm);
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
    assert(/【影片風格】寫實、極致逼真的真人實/.test(prompt) && !prompt.includes('手繪'), `${id}: shot-on-camera realism, not a painted look`);
    assert(prompt.includes('遊戲 CG 感') && prompt.includes('動作僵硬'), `${id}: no game CG look or stiff motion`);
    if (type === '主觀記憶動畫') {
      assert(prompt.includes('不用凝固層的單色冷青'), `${id}: memory palette differs from the frozen layer`);
      assert(prompt.includes('米色、過長') && prompt.includes('看不見任何人的臉'), `${id}: the other person is only a sleeve`);
      assert(!prompt.includes('白襯衫'), `${id}: memories predate the escape shirt`);
    }
    if (type === '設備內影片') assert(prompt.includes('不含設備外框'), `${id}: device video is screen content`);
  }
});

test('rule-built storyboards hold each beat a second, keep sound and absence out of the picture, and set lens, focus and light', () => {
  const ruled = segments.filter(s => !s.prompt.includes('【情緒節奏】'));
  assert(ruled.length >= 60, 'most mid and low segments are rule-built');
  for (const { id, type, prompt } of ruled) {
    const camera = prompt.match(/^【鏡頭】(.+)$/m)[1];
    assert(/約 (?:28|35)mm/.test(camera) && camera.includes('焦點'), `${id}: default camera names a focal length and a focus`);
    if (type !== '設備內影片') assert(/^【光線色調】.*(?:整段光源與明暗都不變|照分鏡的時間點亮暗|明暗變化只發生在點名的局部)/m.test(prompt), `${id}: light says what changes`);
    for (const [, from, to, text] of prompt.matchAll(/^(\d+(?:\.\d+)?)–(\d+(?:\.\d+)?) 秒｜(.+)$/gm)) {
      assert(Number(to) - Number(from) >= 1, `${id}: ${from}–${to} holds at least a second`);
      assert(!/聲音|聲響|雜音/.test(text), `${id}: ${text} — what is heard goes to 後製`);
      assert(!/不是|不再|沒有/.test(text.replace(/(?:剩|是|成)沒有/g, '')), `${id}: ${text} — an absence is not filmed`);
    }
    if (!prompt.includes('【後製')) continue;
    const post = prompt.slice(prompt.indexOf('【後製'), prompt.indexOf('【不要出現】')).trim().split('\n').slice(1);
    for (const line of post) {
      assert(/^(?:畫面文字：.+|聲音與後製對點：|・(?:\d+(?:\.\d+)?–\d+(?:\.\d+)? 秒|整段)：.+)$/.test(line), `${id}: ${line} — every sound is a timed cue`);
    }
  }
  // A sound the description places in the picture lands on its beat.
  assert.match(segments.find(s => s.id === 'P0-04·1').prompt, /^・0–1 秒：鏽卡榫的金屬聲很短，在管子裡撞來撞去。$/m);
  assert.match(segments.find(s => s.id === 'ACT2-01·1').prompt, /紙面始終平整/);
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

test('every segment carries an importance level, and the counts add up in every table', () => {
  for (const { id, level, type, facts, prompt } of segments) {
    const line = facts.match(/^- \*\*重要級別：\*\*<span class="(importance-[a-z]+)">([高中低])<\/span>　(.+)$/m);
    assert(line, `${id}: level line`);
    assert.equal(line[1], LEVEL_CLASSES[line[2]], `${id}: level class`);
    assert.equal(line[2], level, `${id}: heading and badge agree`);
    assert(line[3].trim().length >= 4, `${id}: level has a reason`);
    if (facts.includes('**重點 ★ ') || type === '過場' || type === '主觀記憶動畫') assert.equal(level, '高', `${id}: key bridges, cutscenes and memories are high`);
    else if (prompt.includes('建議直接以圖層差分製作')) assert.equal(level, '低', `${id}: layer-only segments are low`);
  }
  for (const level of ['高', '中', '低']) assert(segments.some(s => s.level === level), `some segments are ${level}`);
  const start = overview.indexOf('## 重要級別統計');
  const rows = overview.slice(start, overview.indexOf('## 重點橋段（★）')).match(/^\| (?:\[|\*\*上部合計).*$/gm);
  assert.equal(rows.length, 6);
  rows.slice(0, 5).forEach((row, i) => {
    const cells = row.split(' | ').slice(1).map(cell => Number(cell.replace(/[ |*]/g, '')));
    const own = segments.filter(s => s.rel === VIDEO_ACT_LISTS[i]);
    assert.deepEqual(cells.slice(0, 4), [...['高', '中', '低'].map(level => own.filter(s => s.level === level).length), own.length], VIDEO_ACT_LISTS[i]);
    const actRow = lists[i].text.match(/^\| 段數 \| (.+) \|$/m)[1].split(' | ').map(Number);
    assert.deepEqual(actRow, cells.slice(0, 4), `${VIDEO_ACT_LISTS[i]}: act table matches the overview`);
    const high = lists[i].text.match(/^本幕重要級別 <span class="importance-high">高<\/span> 的段落：(.+)。分級方式見\[[^\]]+\]\(10-16_[^)]+#video-importance\)。$/m);
    assert(high, `${VIDEO_ACT_LISTS[i]}: high list`);
    assert.deepEqual([...high[1].matchAll(/`([^`]+)`/g)].map(m => m[1]), own.filter(s => s.level === '高').map(s => s.id));
  });
  const total = rows[5].split(' | ').slice(1).map(cell => Number(cell.replace(/[ |*]/g, '')));
  assert.deepEqual(total.slice(0, 4), [...['高', '中', '低'].map(level => segments.filter(s => s.level === level).length), segments.length]);
  assert(overview.includes('<a id="video-importance"></a>\n\n## 重要級別怎麼分'), 'the importance guide anchor exists');
});

test('direction notes replace the rule-built storyboard of their segment and are linked both ways', () => {
  const direction = docs(VIDEO_DIRECTION);
  const notes = [...direction.matchAll(/<a id="(vd-[a-z0-9-]+)"><\/a>\n\n### (\S+)　(.+)\n\n([\s\S]*?)(?=\n<a id="vd-|\n## |$)/g)]
    .map(([, anchor, id, name, body]) => ({ anchor, id, name, rows: [...body.matchAll(/^\| (\d+(?:\.\d+)?)–(\d+(?:\.\d+)?) \| (.+?) \| (.+?) \|$/gm)] }));
  assert(notes.length >= 7, 'the prologue pilot is written');
  const file = VIDEO_DIRECTION.split('/').at(-1);
  for (const { anchor, id, name, rows } of notes) {
    const segment = segments.find(s => s.id === id);
    assert(segment, `${id}: note belongs to a segment`);
    assert(segment.facts.includes(`- **導演註記：**[${id} ${name}](${file}#${anchor})`), `${id}: the act list links its note`);
    const mood = segment.prompt.indexOf('【情緒節奏】');
    assert(mood > segment.prompt.indexOf('【長度】') && mood < segment.prompt.indexOf('【分鏡】'), `${id}: mood sits between length and storyboard`);
    const beats = [...segment.prompt.matchAll(/^(\d+(?:\.\d+)?)–(\d+(?:\.\d+)?) 秒｜(.+)$/gm)];
    assert.deepEqual(beats.map(b => b[3]), rows.map(r => r[3]), `${id}: storyboard is the note's picture column`);
    if (rows.some(r => r[4] !== '—')) assert(segment.prompt.includes('聲音與後製對點：\n・'), `${id}: sound cues are timed`);
  }
  for (const segment of segments) {
    if (!notes.some(n => n.id === segment.id)) assert(!segment.prompt.includes('【情緒節奏】'), `${segment.id}: only directed segments carry a mood line`);
  }
  for (const segment of segments.filter(s => s.level === '高')) {
    assert(notes.some(n => n.id === segment.id), `${segment.id}: every high segment is directed before it is generated`);
  }
  const total = overview.match(/^\| \*\*上部合計\*\* \| \d+ \| \d+ \| \d+ \| \*\*\d+\*\* \| \*\*(\d+)\*\* \|$/m);
  assert.equal(Number(total[1]), notes.length, 'the overview counts the notes');
  VIDEO_ACT_LISTS.forEach((rel, i) => {
    const count = notes.filter(n => segments.find(s => s.id === n.id).rel === rel).length;
    assert.match(lists[i].text, new RegExp(`^導演註記：已寫 ${count} 段`, 'm'), rel);
  });
});

test('every segment lists its people, scene and props, each as a reference-image prompt', () => {
  const registry = docs(VIDEO_ASSETS);
  const file = VIDEO_ASSETS.split('/').at(-1);
  const anchors = new Set([...registry.matchAll(/<a id="(va-[a-z0-9-]+)"><\/a>/g)].map(m => m[1]));
  const banned = ['身份', '高亮', '像素', '幀', '接口', '隊列', '緩存', '默認', '全屏', '黑屏', '保存進度', '選填', '聲優', '玩家'];
  const ORDER = ['【素材】', '【內容】', '【構圖】', '【風格】', '【不要出現】'];
  const used = new Map();
  let count = 0;
  for (const { text } of lists) {
    for (const part of text.split(/\n(?=<a id="v-)/).slice(1)) {
      const id = part.match(/^### (\S+)　/m)[1];
      const type = part.match(/^- \*\*類型：\*\*<span class="video-[a-z]+">([^<]+)<\/span>/m)[1];
      const summary = part.match(/^\*\*素材提示詞\*\*　人物：(.+)｜場景：(.+)｜物品：(.+)$/m);
      assert(summary, `${id}: asset summary line`);
      assert(part.indexOf('**素材提示詞**') > part.indexOf('```prompt\n'), `${id}: assets follow the storyboard prompt`);
      const names = cell => cell === '無' ? [] : cell.split('、').map(name => {
        const link = name.match(/^\[([^\]]+)\]\(([^)#]+)#(va-[a-z0-9-]+)\)$/);
        if (link) { assert.equal(link[2], file, `${id}: ${name}`); assert(anchors.has(link[3]), `${id}: ${link[3]} exists`); return link[1]; }
        return name;
      });
      const listed = [...names(summary[1]).map(n => ['人物', n]), ['場景', names(summary[2])[0]], ...names(summary[3]).map(n => ['物品', n])];
      const blocks = [...part.matchAll(/^```asset\n([\s\S]*?)\n```$/gm)].map(m => m[1]);
      assert.deepEqual(blocks.map(b => b.match(/^【素材】(人物|場景|物品)｜(.+)｜(\S+)$/m).slice(1, 3)), listed, `${id}: one block per listed asset, in order`);
      for (const block of blocks) {
        count++;
        assert(block.startsWith('【素材】') && block.split('\n')[0].endsWith(`｜${id}`), `${id}: block names its segment`);
        let at = -1;
        for (const section of ORDER) { const next = block.indexOf(section); assert(next > at, `${id}: ${section} out of order`); at = next; }
        for (const word of banned) assert(!block.includes(word), `${id}: ${word}`);
        assert(block.includes('清楚可辨識的人臉五官') && block.includes('【風格】寫實、極致逼真的真人實景攝影質感'), `${id}: realism and unreadable faces`);
        assert(!/[A-Z]\d+b?-[VCD]\d{2}[^（]*（[^）]*）：\s*\n/.test(block), `${id}: no empty scene layer`);
        if (block.startsWith('【素材】場景')) assert(block.includes('任何人物、手、人影或異變者') && block.includes('【光線色調】'), `${id}: scene plates are empty and lit`);
        const name = block.match(/^【素材】\S+?｜(.+)｜/)[1];
        used.set(name, (used.get(name) || 0) + 1);
      }
      const people = names(summary[1]);
      if (type === '主觀記憶動畫') {
        assert(people.includes('她・記憶裡') && people.includes('小花・記憶裡（米色袖口）'), `${id}: memories show her and the beige sleeve`);
        assert(summary[2].includes(`](${file}#`), `${id}: memory scenes are hand-written`);
        assert(!blocks.join('').includes('白襯衫的袖口有'), `${id}: memories predate the escape shirt`);
      } else {
        assert(!people.some(n => n.includes('記憶裡')), `${id}: memory people stay in memories`);
      }
      if (type === '設備內影片') assert(summary[2].includes(`](${file}#`), `${id}: device videos have a hand-written screen scene`);
    }
  }
  assert.equal(count, [...used.values()].reduce((a, b) => a + b, 0));
  const table = registry.slice(registry.indexOf('<!-- video-assets:begin -->'), registry.indexOf('<!-- video-assets:end -->'));
  const rows = [...table.matchAll(/^\| \[([^\]]+)\]\(#(va-[a-z0-9-]+)\) \| (人物|場景|物品) \| (\d+) \| .+ \|$/gm)];
  assert.equal(rows.length, anchors.size, 'every registered asset has a usage row');
  for (const [, name, anchor, , n] of rows) {
    assert(anchors.has(anchor), anchor);
    assert.equal(used.get(name) || 0, Number(n), `${name}: usage count matches the act lists`);
  }
});
