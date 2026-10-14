import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import test from 'node:test';
import { buildSupplementLayouts, ASCENT_GROUPS } from './illustration-supplement-layouts.mjs';
import { ILLUSTRATION_DETAILS } from './illustration-details.mjs';
import { buildIllustrationCatalog } from './build-illustration-catalog.mjs';

const read = f => readFileSync(new URL('../' + f, import.meta.url), 'utf8');
const flow = JSON.parse(read('scene-flow.json'));
const diagrams = buildSupplementLayouts(flow);
const manifest = JSON.parse(read('assets/illustrations/manifest.json'));
const provenance = JSON.parse(read('assets/illustrations/2026-10-13-gap-prompts.json'));

test('the gap supplement contains eleven saved concepts and seventeen precise diagrams', () => {
  assert.equal(provenance.selectedAssets.length, 11);
  assert.equal(diagrams.size, 17);
  for (const f of provenance.selectedAssets) {
    assert(existsSync(new URL('../' + f.asset, import.meta.url)), f.id);
    assert(provenance.prompts[f.id]?.length > 100, f.id);
    assert(manifest.figures.some(r => r.id === f.id && r.asset === f.asset), f.id);
  }
  for (const [id, svg] of diagrams) {
    assert.equal(read(`assets/illustrations/current/${id}.svg`), svg, id);
    assert(svg.includes('aria-labelledby="title desc"'), id);
    assert(svg.includes('非遊戲介面或完成素材'), id);
  }
});

test('ascent diagrams include every existing platform with original location and order', () => {
  for (const [id, group] of Object.entries(ASCENT_GROUPS)) {
    const children = group.prefix.flatMap(prefix => flow.subscenes.filter(s => s.id.startsWith(prefix)));
    assert.equal(children.length, group.beats.length);
    assert.deepEqual(ILLUSTRATION_DETAILS[id].subscenes, children.map(s => s.id));
    const svg = diagrams.get(id);
    let previous = -1;
    for (const s of children) {
      assert(svg.includes(s.floor.label));
      const current = svg.indexOf(s.id);
      assert(current > previous, s.id);
      previous = current;
    }
  }
  assert(diagrams.get('REF-ASCENT-A-UPPER').includes('先進 R6（11F）完成本房'));
  assert(diagrams.get('REF-ASCENT-B').includes('B22F 橋 → A22F'));
});

test('mechanism and clue illustrations preserve exact values and separate operations', () => {
  for (const phrase of ['兩條鏈', '空轉鏈', '兩段', '側階上原橋']) assert(diagrams.get('REF-LAUNDRY').includes(phrase));
  for (const phrase of ['4／8／3／1／6／2', '81']) {
    const all = diagrams.get('REF-GLASS') + JSON.stringify(ILLUSTRATION_DETAILS['REF-GLASS']);
    assert(all.includes(phrase));
  }
  for (const phrase of ['第二格長痕', '第四格短痕']) assert(diagrams.get('REF-GLASS').includes(phrase));
  for (const phrase of ['35', '再親自提交第三層', '本圖不增加另一個折紙解鎖題']) assert(diagrams.get('REF-PAPER').includes(phrase), phrase);
  for (const phrase of ['02:15', '02:22', '02:20:11', '02:20:22', '48 小時', 'F5「09」', 'VERIFY_ONLY', '安靜 3.8 秒']) assert(diagrams.get('REF-TIME').includes(phrase));
  assert(diagrams.get('REF-VERSIONS').includes('一份碎片 E4-01'));
  assert(diagrams.get('REF-UPPER-END').includes('同一扇門'));
  assert(diagrams.get('REF-CALIBRATION').includes('N2 不是失敗復位點'));
});

test('mirror and cinematic diagrams preserve reveal timing without new enemies or automatic travel', () => {
  for (const id of ['P0', 'R1', 'R8', 'R16', 'R17', 'R22', 'R25', 'R30', 'R31']) assert(diagrams.get('REF-MIRROR').includes(id));
  for (const phrase of ['晚 0.4 秒', '早 0.3 秒', '早 0.5 秒', '不代輸入', '無反射面']) assert(diagrams.get('REF-MIRROR').includes(phrase));
  for (const phrase of ['右拇指', '1.0–2.2', '5.0–8.4', '11.2–12.0', '不證明刪原件']) assert(diagrams.get('REF-THAW').includes(phrase));
  for (const phrase of ['固定於 49F', '不升降', '手動拉桿', '制動扣妥之後', '不遮制動桿']) assert(diagrams.get('REF-BRAKE').includes(phrase));
  assert.deepEqual(ILLUSTRATION_DETAILS.V37.scenes, ['R9', 'R12', 'U4', 'U6']);
});

test('all new images have navigable catalog captions without changing gameplay work orders', () => {
  const { records } = buildIllustrationCatalog();
  for (const id of [...diagrams.keys(), ...provenance.selectedAssets.map(f => f.id)]) assert(records.some(r => r.base === id), id);
  assert.equal(records.length, 110);
  assert.equal(flow.nodes.length, 48);
  assert.equal(flow.subscenes.length, 72);
  assert.equal(flow.routes.length, 56);
  assert.equal(Object.keys(flow.images).length, 558);
  assert(Object.values(flow.images).every(i => i.status === 'pending'));
});
