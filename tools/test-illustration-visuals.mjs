import assert from 'node:assert/strict';
import test from 'node:test';
import { BOARDS } from './illustration-boards.mjs';
import { buildBoards } from './build-illustration-boards.mjs';
import { VISUAL_BOARD_IDS, renderPanelVisual } from './illustration-visuals.mjs';

test('all 29 former text boards have real drawings, short visible captions and complete accessible rules', () => {
  assert.deepEqual(new Set(VISUAL_BOARD_IDS), new Set([...Object.keys(BOARDS), 'WORLD']));
  assert.equal(VISUAL_BOARD_IDS.length, 29);
  const diagrams = buildBoards();
  for (const id of VISUAL_BOARD_IDS) {
    const svg = diagrams.get(id);
    assert(svg.includes('data-layout="visual-v1"'), id);
    assert(!svg.includes('class="body"'), id);
    const count = BOARDS[id]?.panels.length ?? 6;
    assert.equal((svg.match(/data-panel=/g) || []).length, count, id);
    assert.equal((svg.match(/data-visual=/g) || []).length, count, id);
    for (let i = 0; i < count; i++) {
      const drawing = renderPanelVisual(id, i);
      assert((drawing.match(/<(?:path|ellipse) /g) || []).length >= 4, `${id}/${i}: not just text in rectangles`);
      if (BOARDS[id]) for (const line of BOARDS[id].panels[i][2].split('\n')) assert(svg.includes(line.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')), `${id}: rule lost`);
    }
  }
  assert.equal(diagrams.size, 46);
  assert.throws(() => renderPanelVisual('UNKNOWN', 0), /No visual illustration/);
});

test('V09 shows eleven identity windows, protected reading, same-terminal sources and a released completion state', () => {
  const start = renderPanelVisual('V09', 0), read = renderPanelVisual('V09', 1), compare = renderPanelVisual('V09', 2), submit = renderPanelVisual('V09', 3);
  assert.equal((start.match(/data-identity-window=/g) || []).length, 11);
  assert.equal((start.match(/data-human-posture=/g) || []).length, 1);
  assert(start.includes('99%'));
  assert(read.includes('data-view="protected-reading"'));
  assert(compare.includes('data-view="same-terminal-sources"'));
  for (const label of ['同一終端', '撤銷紀錄', '封包尾段', '待完成傳輸']) assert(compare.includes(label));
  assert(submit.includes('data-encounter-state="released"'));
  assert(!submit.includes('data-human-posture='));
  assert(submit.includes('100%') && submit.includes('6 秒操作空檔'));
});

test('captives, Xiaohua tendrils, distinct defenses and historical/current views keep their original scope', () => {
  const called = [0, 1, 2, 3, 4, 5].map(i => (renderPanelVisual('L02', i).match(/data-human-posture=/g) || []).length);
  assert.deepEqual(called, [0, 3, 3, 2, 1, 0]);
  for (let i = 0; i < 6; i++) assert.equal((renderPanelVisual('V38', i).match(/data-moth-tendril=/g) || []).length, 4);
  assert(!renderPanelVisual('ART02', 0).includes('data-moth-tendril='));
  assert.equal((renderPanelVisual('L09', 3).match(/data-human-posture="sit"/g) || []).length, 2);
  assert.notEqual(renderPanelVisual('V10', 1), renderPanelVisual('V10', 3));
  assert.notEqual(renderPanelVisual('V12', 0), renderPanelVisual('V12', 1));
  assert(renderPanelVisual('L05', 3).includes('現在：空椅'));
  assert(renderPanelVisual('L05', 3).includes('歷史：凝固靜格'));
  assert(renderPanelVisual('V25', 1).includes('>錄音</text>'));
  assert(!renderPanelVisual('V25', 1).includes('>現場</text>'));
});

test('physical operations keep cable destinations, water conservation and separate living-space floors', () => {
  const wires = renderPanelVisual('REF-R12', 1);
  assert(wires.includes('data-wire="two-short" data-target="right"'));
  assert(wires.includes('data-wire="long" data-target="left"'));
  const levels = svg => [...svg.matchAll(/data-water-level="(\d+)"/g)].map(m => Number(m[1]));
  assert.deepEqual(levels(renderPanelVisual('REF-MECHANISM', 3)), [3, 0, 3]);
  assert.deepEqual(levels(renderPanelVisual('REF-MECHANISM', 4)), [2, 2, 2]);
  const living = renderPanelVisual('WORLD', 3);
  assert(living.includes('R6 · 食堂 · 11F'));
  assert(living.includes('R4 · 衛浴 · 2F'));
  assert.equal((living.match(/data-shower-bay=/g) || []).length, 6);
  const lifts = renderPanelVisual('REF-LIFT', 5);
  for (const f of [29, 30, 31, 47, 48]) assert(lifts.includes(`${f}F`));
});
