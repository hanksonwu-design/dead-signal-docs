import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';

const read = p => readFileSync(new URL(`../docs/${p}`, import.meta.url), 'utf8').replaceAll('\r\n', '\n');
const doc = read('10_製作規格/10-26_製作規格_角色提示詞.md');
const appendix = read('09_劇本/09-15_正式劇本_共用附錄.md');
const blocks = [...doc.matchAll(/<a id="(chp-[^"]+)"><\/a>\n\n#### (\S+) ([^\n]+)\n\n```asset\n([\s\S]*?)\n```/g)]
  .map(([, anchor, id, name, body]) => ({ anchor, id, name, lines: body.split('\n') }));
const PROMPT = /^【(內容|構圖|光線色調|分圖)】/;

test('the character sheet counts match its summary table', () => {
  assert.ok(doc.includes('<a id="character-prompts"></a>'));
  assert.equal(new Set(blocks.map(b => b.id)).size, blocks.length);
  const total = Number(doc.match(/\*\*合計：\*\* (\d+) 組/)[1]);
  assert.equal(blocks.length, total);
  const parts = blocks.reduce((n, b) => n + b.lines.filter(l => l.startsWith('【分圖】')).length, 0);
  assert.equal(parts, Number(doc.match(/共 (\d+) 張圖/)[1]));
  const rows = [...doc.matchAll(/^\| \[[^\]]+\]\(#(chp-[a-z0-9]+)\) \| (\d+) \|/gm)];
  assert.equal(rows.reduce((n, r) => n + Number(r[2]), 0), total);
  for (const [, anchor, count] of rows) {
    const start = doc.indexOf(`<a id="${anchor}"></a>`);
    assert.ok(start > 0, anchor);
    assert.match(doc.slice(start), new RegExp(`^<a id="${anchor}"></a>\\n\\n## [^\\n]+（${count} 組）`), anchor);
  }
});

test('each block keeps the fixed field order and one shared style block', () => {
  assert.equal([...doc.matchAll(/```asset\n【風格】[^\n]+\n【不要出現】[^\n]+\n```/g)].length, 1);
  for (const b of blocks) {
    assert.equal(b.lines[0], `【素材】角色｜${b.name}｜${b.id}`);
    const tags = b.lines.map(l => l.slice(0, l.indexOf('】') + 1));
    assert.deepEqual(tags.slice(1, 4), ['【內容】', '【構圖】', '【光線色調】'], b.id);
    assert.ok(tags.slice(4, -1).length >= 2 && tags.slice(4, -1).every(t => t === '【分圖】'), `${b.id}: parts come in sets`);
    assert.equal(tags.at(-1), '【用途】', b.id);
    assert.match(b.lines[2], /^【構圖】16:9 橫幅/, b.id);
  }
});

test('prompt lines keep to the art rules', () => {
  for (const b of blocks) {
    const prompt = b.lines.filter(l => PROMPT.test(l)).join('');
    assert.doesNotMatch(prompt, /(?<![A-Za-z0-9-])[RUP]\d+b?(?!\d)/, `${b.id}: room codes get drawn as signs`);
    assert.doesNotMatch(prompt, /玩家|——|梁樂瑤|小花|阿尋|老周|阿彪|康總|C-07|Michelle/, `${b.id}: names get drawn as text`);
    assert.doesNotMatch(b.lines.join(''), /身份|高亮|像素|幀|接口|隊列|緩存|默認|全屏|黑屏|選填|聲優/, b.id);
    assert.doesNotMatch(prompt, /陽光|太陽|晴天|直射|日光(?!燈)/, b.id);
    assert.doesNotMatch(prompt, /紅霧|白絲|紅光|冷青/, `${b.id}: effect layers stay off the sheet`);
  }
});

test('every design source link resolves in the shared appendix', () => {
  const links = [...doc.matchAll(/\]\(\.\.\/09_劇本\/09-15_正式劇本_共用附錄\.md#([^)]+)\)/g)].map(m => m[1]);
  assert.ok(links.length >= 12);
  for (const anchor of links) assert.ok(appendix.includes(`<a id="${anchor}"></a>`), anchor);
});
