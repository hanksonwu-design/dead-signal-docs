import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import { ROOT } from './sync-canonical.mjs';

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
