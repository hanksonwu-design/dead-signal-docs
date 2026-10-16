import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { ROOT, parseMaster } from './sync-canonical.mjs';
import { ACTS } from './screenplay-files.mjs';
import { buildIllustrationCatalog } from './build-illustration-catalog.mjs';

const read = file => readFileSync(path.join(ROOT, file), 'utf8');
const manifest = JSON.parse(read('assets/illustrations/manifest.json'));
const provenance = JSON.parse(read('assets/illustrations/2026-10-13-gameplay-mockups.json'));

test('V07 uses the selected generated raster without discarding its exact SVG counterpart', () => {
  const figure = manifest.figures.find(f => f.id === 'V07');
  assert.equal(figure.kind, 'current-gameplay-mockup');
  assert.equal(figure.asset, provenance.selectedOutput.asset);
  assert.deepEqual(figure.supplement, ['assets/illustrations/current/V07.svg']);
  const png = readFileSync(path.join(ROOT, figure.asset));
  assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  assert.equal(png.readUInt32BE(16), 1536);
  assert.equal(png.readUInt32BE(20), 1024);
  assert.equal(createHash('sha256').update(png).digest('hex'), provenance.selectedOutput.sha256);
  assert(read(figure.supplement[0]).includes('data-layout="visual-v1"'));
});

test('catalog distinguishes simulated gameplay from precise rules with stable original targets', () => {
  const { records } = buildIllustrationCatalog();
  const main = records.find(r => r.id === 'V07'), rules = records.find(r => r.id === 'V07-RULES');
  assert.equal(main.kind, '遊戲畫面模擬');
  assert.equal(main.heading, 'illustration-note-v07');
  assert.equal(rules.kind, '規則圖解');
  assert.equal(rules.heading, 'illustration-note-v07-rules');
  assert.deepEqual(main.scenes.map(n => n.id), ['R18']);
  assert.deepEqual(rules.scenes, main.scenes);
  assert.equal(records.length, 111);
});

test('mockup notes preserve manual progression and disclose the scope and unimplemented behavior', () => {
  const spec = parseMaster().documents.get(ACTS[4].specPath);
  for (const text of ['第三格只是開始退避', '不代表已到安全位', 'N2 是部分掩體', 'N4 才是通過終態', '2.2 秒補救指令窗', '現場波形', '無聲模式']) assert(spec.includes(text), text);
  assert(provenance.finalEditPrompt.includes('OVERTURNED'));
  assert(provenance.finalEditPrompt.includes('acoustic panels'));
  assert(provenance.scope.includes('V07 only'));
  const flow = JSON.parse(read('scene-flow.json'));
  assert.equal(Object.keys(flow.images).length, 562);
  assert(Object.values(flow.images).every(i => i.status === 'pending'));
});
