import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import { ROOT } from './sync-canonical.mjs';
import { VIDEO_LIST, VIDEO_ACT_LISTS } from './screenplay-files.mjs';

const app = readFileSync(path.join(ROOT, 'app.js'), 'utf8');
const esc = app.split('\n').find(line => line.startsWith('const esc ='));
const renderer = app.slice(app.indexOf('function renderMarkdown(raw'), app.indexOf('function openReader('));
const { render, cueKind } = runInNewContext(`${esc}\n${renderer}\n({ render: renderMarkdown, cueKind });`, {
  inlineMarkdown: value => value, documentDisplayTitle: value => value,
});
const css = readFileSync(path.join(ROOT, 'styles.css'), 'utf8');

test('screenplay cue labels at a line start get their category class', () => {
  const cases = [
    ['（靜態畫面／全景）照片貼得端正。', 'shot'], ['（靜態差分）少一張椅子。', 'shot'], ['（鏡位切換）沿同一門框。', 'shot'],
    ['（動畫演出／第一人稱動作回饋）手收回。', 'anim'], ['（介面呈現）三列並排。', 'ui'],
    ['〔操作／場景點擊＋物件操作〕扳下斷電柄。', 'op'], ['〔操作／介面點選〕選繼續。', 'ui-op'], ['〔操作／介面查閱〕翻開名冊。', 'ui-op'],
    ['〔環境／局部音效〕滴水。', 'sound'], ['〔字幕〕「我在。」', 'text'], ['〔系統／取得提示〕取得 E0-01。', 'system'],
    ['〔玩家〕可直接離開。', 'player'], ['〔前置〕已讀 R8。', 'logic'], ['〔條件〕看過 R27 者。', 'logic'],
  ];
  for (const [line, kind] of cases) {
    const html = render(line);
    const label = line.match(/^[（〔][^）〕]+[）〕]/)[0];
    assert(html.includes(`<span class="cue-tag cue-${kind}">${label}</span>`), line);
  }
});

test('ordinary parentheses, mid-line labels and unknown labels stay plain', () => {
  for (const line of ['（若玩家先到右側鐵網）再回頭。', '（詳見 02-01 主角）', '她說：〔字幕〕不是標示。', '〔不存在的類別〕文字。', '〔靜態畫面／全景〕括號不對。']) {
    assert(!render(line).includes('cue-tag'), line);
  }
  assert.equal(cueKind('（動畫演出／歷史解凍過場）'), 'anim');
});

test('each label in a merged paragraph and list item is tagged', () => {
  const html = render('〔字幕〕「一。」\n〔玩家〕二。\n\n- 〔前置〕三。');
  assert.equal((html.match(/class="cue-tag/g) || []).length, 3);
  assert(!html.includes('\u0001'));
});

test('every cue category has a color in the reader styles', () => {
  for (const kind of ['shot', 'anim', 'ui', 'op', 'ui-op', 'sound', 'text', 'system', 'player', 'logic']) {
    assert.match(css, new RegExp(`\\.reader-content \\.cue-${kind} \\{ --cue: #[0-9a-f]{6}; \\}`), kind);
  }
});

test('video-list animation types each render in their own reader color', () => {
  const inline = app.slice(app.indexOf('function inlineMarkdown(value)'), app.indexOf('function renderMarkdown(raw'));
  const inlineMarkdown = runInNewContext(`${esc}\n${inline}\ninlineMarkdown;`, {
    state: { selected: null, documents: [] }, imageAssetUrl: () => null, documentDisplayTitle: value => value,
  });
  const builder = readFileSync(path.join(ROOT, 'tools/build-video-list.mjs'), 'utf8');
  const classes = [...builder.matchAll(/: '(video-[a-z]+)'/g)].map(match => match[1]);
  assert.equal(classes.length, 7);
  const colors = classes.map(name => css.match(new RegExp(`\.reader-content \.${name} \{ --video: (#[0-9a-f]{6}); \}`))?.[1]);
  assert(colors.every(Boolean), 'every animation type has a color');
  assert.equal(new Set(colors).size, classes.length, 'animation type colors are distinct');
  for (const name of classes) {
    assert.equal(inlineMarkdown(`<span class="${name}">互動</span>`), `<span class="${name}">互動</span>`, name);
  }
  assert(!inlineMarkdown('<span class="video-other">互動</span>').includes('<span'), 'unknown classes stay escaped');
  const docs = rel => readFileSync(path.join(ROOT, 'docs', rel), 'utf8').replaceAll('\r\n', '\n');
  const total = docs(VIDEO_LIST).match(/^\| \*\*上部合計\*\* \|.*\| \*\*(\d+)\*\* \|$/m);
  const typeCells = VIDEO_ACT_LISTS.flatMap(rel => docs(rel).split('\n').filter(line => line.startsWith('- **類型：**'))
    .map(line => line.slice('- **類型：**'.length).split('　')[0]));
  assert.equal(typeCells.length, Number(total[1]));
  assert(typeCells.every(cell => /^<span class="video-[a-z]+">[^<]+<\/span>$/.test(cell)), 'every type cell is colored');
});

test('storyboard and asset prompt fences wrap and carry a copy button; other code blocks stay plain', () => {
  const html = render('```prompt\n【影片】A·1\n【分鏡】<b>\n```\n\n```asset\n【素材】人物｜她\n```\n\n```\nplain\n```');
  assert.match(html, /^<div class="prompt-block"><button type="button" class="prompt-copy">複製提示詞<\/button><pre><code>【影片】A·1\n【分鏡】&lt;b&gt;<\/code><\/pre><\/div>/);
  assert(html.includes('<div class="prompt-block"><button type="button" class="prompt-copy">複製提示詞</button><pre><code>【素材】人物｜她</code></pre></div>'), 'asset fences get the same copy button');
  assert((html.match(/class="prompt-block"/g) || []).length === 2, 'plain fences get no copy button');
  assert(app.includes('querySelectorAll(".prompt-copy")') && app.includes('navigator.clipboard.writeText'), 'copy buttons are wired');
  assert.match(css, /\.reader-content \.prompt-block pre code \{ white-space: pre-wrap;/);
});

test('video importance badges render in the reader and keep readable contrast', () => {
  const inline = app.slice(app.indexOf('function inlineMarkdown(value)'), app.indexOf('function renderMarkdown(raw'));
  const inlineMarkdown = runInNewContext(`${esc}\n${inline}\ninlineMarkdown;`, {
    state: { selected: null, documents: [] }, imageAssetUrl: () => null, documentDisplayTitle: value => value,
  });
  for (const name of ['importance-high', 'importance-mid', 'importance-low']) {
    assert.equal(inlineMarkdown(`<span class="${name}">高</span>`), `<span class="${name}">高</span>`, name);
    assert.match(css, new RegExp(`\\.reader-content \\.${name} \\{ color: #[0-9a-f]{6}; background: `), name);
  }
  assert(!inlineMarkdown('<span class="importance-top">高</span>').includes('<span'), 'unknown levels stay escaped');
});
