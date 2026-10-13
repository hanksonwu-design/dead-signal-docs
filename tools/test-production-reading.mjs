import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import { ROOT, parseMaster } from './sync-canonical.mjs';
import { ACTS, APPENDIX } from './screenplay-files.mjs';
import { compactProduction } from './compact-production-specs.mjs';
import { validateProductionOrder } from './reorder-production-specs.mjs';
import { buildSceneImageOutputs } from './build-scene-images.mjs';

const master = parseMaster();
const graph = JSON.parse(readFileSync(path.join(ROOT, 'scene_graph.json'), 'utf8'));
const app = readFileSync(path.join(ROOT, 'app.js'), 'utf8');
const esc = app.split('\n').find(line => line.startsWith('const esc ='));
const renderer = app.slice(app.indexOf('function renderMarkdown(raw'), app.indexOf('function openReader('));
const render = runInNewContext(`${esc}\n${renderer}\nrenderMarkdown;`, {
  inlineMarkdown: value => value, documentDisplayTitle: value => value,
});

test('all ten acts follow gameplay-first order with one technical disclosure per room', () => {
  assert.deepEqual(validateProductionOrder(master.documents, graph), { acts: 10, nodes: 48, subscenes: 72, passages: 21 });
  let technical = 0;
  for (const act of ACTS) {
    const text = master.documents.get(act.specPath);
    assert(text.includes('<!-- production:ordered:v2 -->'));
    assert(text.includes('#production-reading-contract'));
    assert(!text.includes('以下每列均為待製作圖像項目'));
    const html = render(text);
    assert.equal((html.match(/<details class=/g) || []).length, (html.match(/<\/details>/g) || []).length);
    assert(!html.includes('&lt;details&gt;'));
    technical += (text.match(/<summary>狀態、素材與驗收（製作細節）<\/summary>/g) || []).length;
    for (const room of graph.nodes.filter(n => n.act === act.act)) {
      const slug = room.id.toLowerCase();
      const section = text.split(`<a id="node-${slug}-spec"></a>`)[1].split(/<a id="(?:node-\w+-spec|spec-act-\d+-shared)"><\/a>/)[0];
      const block = section.match(/<details>\n<summary>狀態、素材與驗收（製作細節）<\/summary>([^]*?)<\/details>/)?.[1];
      assert(block?.includes(`id="node-${slug}-pack"`), room.id);
      assert(block.includes(`id="node-${slug}-images"`), room.id);
      assert(!block.includes('id="fig-'), `${room.id}: illustrations remain in the visible visual section`);
    }
  }
  assert.equal(technical, 48);
});

test('empty placeholders are removed but their published anchors survive', () => {
  const audit = JSON.parse(readFileSync(path.join(ROOT, 'reviews/2026-10-13_production-specs-cleanup.json'), 'utf8'));
  assert.equal(audit.removedReminderParagraphs, 279);
  assert.equal(audit.removedEmptySources.length, 16);
  for (const id of audit.removedEmptySources) {
    assert(!master.blocks.has(id));
    assert(master.anchorFiles.has(id));
  }
  assert(master.documents.get(APPENDIX).includes('不因圖號增加通行權限'));
});

test('compaction and image regeneration are idempotent and preserve the reading scripts', () => {
  assert.equal(compactProduction(master, graph).documents, master.documents);
  const { outputs } = buildSceneImageOutputs(graph, master.documents);
  for (const act of ACTS) {
    assert.equal(outputs.get(act.path), master.documents.get(act.path));
    assert.equal(outputs.get(act.specPath), master.documents.get(act.specPath));
  }
});

test('plain and nested disclosures render tables, anchors and accurate source lines', () => {
  const html = render('<details>\n<summary>State & QA</summary>\n\n<a id="inside"></a>\n## State\n\n<details>\n<summary>Nested</summary>\n\n| A | B |\n| --- | --- |\n| 1 | 2 |\n\n</details>\n</details>', 20);
  assert(html.includes('<summary>State &amp; QA</summary>'));
  assert(html.includes('<h2 data-source-line="24">State</h2>'));
  assert(html.includes('<span id="inside"'));
  assert(html.includes('<tr data-source-line="31">'));
  assert.equal((html.match(/<details class=/g) || []).length, 2);
});

test('disclosures cannot inject attributes or HTML, and fenced markers stay code', () => {
  assert(!render('<details onclick="alert(1)">\n<summary>Bad</summary>\n</details>').includes('<details class='));
  assert(!render('<details>\n<summary><img src=x onerror=alert(1)></summary>\n</details>').includes('<details class='));
  assert(!render('<details>\n<summary>Missing end</summary>\nhello').includes('<details class='));
  const html = render('<details>\n<summary>Safe</summary>\n\n```html\n</details>\n<script>alert(1)</script>\n```\n\nText\n</details>');
  assert(html.includes('&lt;/details&gt;'));
  assert(html.includes('&lt;script&gt;'));
  assert(html.includes('<p data-source-line="8">Text</p>'));
});

test('deep navigation reveals every ancestor before focus and scrolling', () => {
  const fn = app.slice(app.indexOf('function revealReaderTarget('), app.indexOf('function closeReader('));
  const events = [], outer = { tagName: 'DETAILS', open: false }, inner = { tagName: 'DETAILS', open: false, parentElement: outer };
  const target = { parentElement: inner, focus: () => events.push('focus'), scrollIntoView: () => events.push('scroll') };
  const reveal = runInNewContext(`${fn}\nrevealReaderTarget;`, { requestAnimationFrame: callback => {
    assert(outer.open && inner.open); callback();
  } });
  reveal(target);
  assert.equal(target.tabIndex, -1);
  assert.deepEqual(events, ['focus', 'scroll']);
});

test('R18 summaries require physically reaching N4, including the duplicated incoming route', () => {
  const spec = master.documents.get(ACTS[4].specPath);
  assert(!/到(?:達)?布簾後安全點(?:後)?手動開門/.test(spec));
  assert.equal((spec.match(/親自抵達門前 N4，再手動開門/g) || []).length, 4);
  const edge = graph.edges.find(e => e.fromId === 'R18' && e.toId === 'R19');
  assert(edge.gate.includes('親自抵達門前 N4，再手動開門'));
});
