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
  for (const [id, suffix] of [['R1', 'L02_current.png'], ['R16', 'V34_current.png'], ['R22', 'REF-UPPER-END.svg'], ['R32', 'V13_current.png']]) {
    assert(flow.nodes.find(n => n.id === id).reference.url.endsWith(suffix), id);
  }
});

test('diagram files are reproducible and include accessible text and a pending-assets boundary', () => {
  assert.equal(buildBoards().size, 46);
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
  assert.match(body('V07'), /B 棟 28F/);
  assert.match(body('V07'), /N2 不是失敗復位點/);
  assert.match(body('V10'), /關閉本地操作介面/);
  assert.match(body('V10'), /退到來向的另一側/);
  assert.match(body('V12'), /主動鬆柄、停止操作/);
  assert.match(body('V38'), /停戰不等於解封/);
  assert.match(body('V30'), /(?:燈架固定留場|固定燈架.{0,20}(?:不拿走|不是手提燈))/);
  assert.match(body('CORE'), /不是所有前進都需要三格鎖定/);
});

test('work-order totals remain current and concept art never marks game assets complete', () => {
  assert.equal(flow.nodes.length, 48);
  assert.equal(flow.subscenes.length, 72);
  assert.equal(flow.routes.length, 56);
  assert.equal(Object.keys(flow.images).length, 562);
  assert(Object.values(flow.images).every(image => image.status === 'pending'));
  const appendix = read(`docs/${APPENDIX}`);
  assert(appendix.includes('562 列：155 列場景／操作／演出與 407 列近看等細節'));
  assert.doesNotMatch(appendix, /523 (?:張圖像工單|列圖像|列：140)/);
  assert(appendix.includes('只有該段明列的必要條件限制推進'));
});

test('supplemental routes keep stops, floors and manual actions distinct', () => {
  const body = id => JSON.stringify(BOARDS[id]);
  assert.match(body('REF-LIFT'), /29F／30F／31F/);
  assert.match(body('REF-LIFT'), /47F／48F/);
  assert.match(body('REF-LIFT'), /兩端卡妥/);
  assert.match(body('REF-U4'), /一長兩短焊疤/);
  assert.match(body('REF-U4'), /(?:門仍受影響|領域仍在|領域未解除)/);
  assert.match(body('REF-U4'), /仍在 48F 蓋下/);
  assert.match(body('L07'), /U4 → U4b → U5/);
  assert.match(body('L07'), /U6 → U6b → R30/);
  assert(flow.nodes.find(n => n.id === 'M1').reference.url.endsWith('V39_current.png'));
  assert(flow.nodes.find(n => n.id === 'U4').reference.url.endsWith('domain_u4_current.png'));
});

test('mechanism and ending guides preserve independent prerequisites', () => {
  const body = id => JSON.stringify(BOARDS[id]);
  assert.match(body('REF-R12'), /雙短線門禁線 → 右座/);
  assert.match(body('REF-R12'), /長線設備線 → 左座/);
  assert.match(body('REF-R12'), /待權限核驗/);
  assert.match(body('REF-MECHANISM'), /遮光葉開／閉 × (?:燈框)?內／中／外/);
  assert.match(body('REF-MECHANISM'), /3／0／3 → 2／2／2/);
  assert.match(body('REF-MECHANISM'), /平水不自動扣栓/);
  assert.match(body('V25'), /R26 → R25 → M1/);
  assert.match(body('V24'), /同一出口/);
  assert.match(body('V15'), /肉身昏迷存活/);
  assert.match(body('L09'), /R33 承接結果/);
  assert.match(body('REF-HEARING'), /補救不套用其他 Boss 或 UD/);
});

test('new concepts retain provenance and explicit geometric limits', () => {
  const provenance = JSON.parse(read('assets/illustrations/2026-10-12-supplement-prompts.json'));
  for (const id of ['V39', 'REF-LIFT', 'REF-U4', 'REF-MECHANISM']) {
    assert(provenance.prompts[id].length > 100, id);
    assert(provenance.selectedAssets.find(f => f.id === id), id);
  }
  const u4 = read('docs/10_製作規格/10-09_製作規格_第七幕.md');
  assert(u4.includes('牆面斑駁不代替門框缺角'));
  const appendix = read(`docs/${APPENDIX}`);
  assert(appendix.includes('液面替代 3／0／3 或 2／2／2 差分'));
});
