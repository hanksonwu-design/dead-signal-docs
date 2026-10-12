import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { CANONICAL_FILES, APPENDIX } from './screenplay-files.mjs';
import { ROOT } from './sync-canonical.mjs';
import { buildBoards } from './build-illustration-boards.mjs';
import { BOARDS } from './illustration-boards.mjs';

const read = file => readFileSync(path.join(ROOT, file), 'utf8');
const manifest = JSON.parse(read('assets/illustrations/manifest.json'));
const flow = JSON.parse(read('scene-flow.json'));
const texts = CANONICAL_FILES.map(f => [`docs/${f}`, read(`docs/${f}`)]);
const embedded = texts.flatMap(([file, text]) => [...text.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)].map(m =>
  path.posix.normalize(path.posix.join(path.posix.dirname(file), m[1]))));

test('each current figure exists, is embedded and retains its canonical anchor', () => {
  assert.equal(new Set(manifest.figures.map(f => f.id)).size, manifest.figures.length);
  for (const figure of manifest.figures) {
    assert(existsSync(path.join(ROOT, figure.asset)), figure.id);
    assert(embedded.includes(figure.asset), `Unreferenced current figure: ${figure.id}`);
    assert(read(figure.source).includes(`<a id="${figure.heading}"></a>`), figure.id);
    if (figure.retiredAsset) assert(!embedded.includes(figure.retiredAsset), `Retired image embedded: ${figure.id}`);
    for (const asset of figure.supplement || []) assert(embedded.includes(asset), asset);
  }
});

test('3D references do not silently keep retired illustration pixels', () => {
  const retired = new Set(manifest.figures.map(f => f.retiredAsset).filter(Boolean));
  for (const node of flow.nodes) if (node.reference) {
    assert(!retired.has(node.reference.url), node.id);
    assert(existsSync(path.join(ROOT, node.reference.url)), node.id);
  }
  for (const [id, suffix] of [['R1', 'L02_current.png'], ['R16', 'V34_current.png'], ['R22', 'V29.svg'], ['R32', 'V13_current.png']]) {
    assert(flow.nodes.find(n => n.id === id).reference.url.endsWith(suffix), id);
  }
});

test('diagram files are reproducible and include accessible text and a pending-assets boundary', () => {
  assert.equal(buildBoards().size, 17);
  for (const [id, svg] of buildBoards()) {
    assert.equal(read(`assets/illustrations/current/${id}.svg`), svg, id);
    assert(svg.includes('aria-labelledby="title desc"'), id);
    assert(svg.includes('非遊戲介面或完成素材'), id);
    assert.doesNotMatch(svg, /<script\b|<foreignObject\b|<image\b|(?:href|src)=["'](?:https?:|data:|javascript:)/i);
  }
});

test('refreshed diagrams preserve three captives, distinct defenses and fixed-lamp operations', () => {
  const body = id => JSON.stringify(BOARDS[id]);
  assert.match(body('L02'), /三張空椅/);
  assert.match(body('L02'), /玩家自行走到鎖舌損壞的內門/);
  assert.match(body('V07'), /B 棟 37F/);
  assert.match(body('V07'), /N2 不是失敗復位點/);
  assert.match(body('V10'), /關閉本地操作介面/);
  assert.match(body('V10'), /退到來向的另一側/);
  assert.match(body('V12'), /主動鬆柄、停止操作/);
  assert.match(body('V38'), /停戰不等於解封/);
  assert.match(body('V30'), /固定燈架，不是手提燈/);
  assert.match(body('CORE'), /不是所有前進都需要三格鎖定/);
});

test('work-order totals remain current and concept art never marks game assets complete', () => {
  assert.equal(flow.nodes.length, 48);
  assert.equal(flow.subscenes.length, 72);
  assert.equal(flow.routes.length, 56);
  assert.equal(Object.keys(flow.images).length, 557);
  assert(Object.values(flow.images).every(image => image.status === 'pending'));
  const appendix = read(`docs/${APPENDIX}`);
  assert(appendix.includes('557 列：153 列場景／操作／演出與 404 列近看等細節'));
  assert.doesNotMatch(appendix, /523 (?:張圖像工單|列圖像|列：140)/);
  assert(appendix.includes('只有該段明列的必要條件限制推進'));
});
