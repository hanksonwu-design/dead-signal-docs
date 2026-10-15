import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import { ACTS, APPENDIX, CANONICAL_FILES, ILLUSTRATION_CATALOG } from './screenplay-files.mjs';
import { ROOT } from './sync-canonical.mjs';
import { annotateIllustrations, buildIllustrationCatalog, collectIllustrations, stripIllustrationNotes } from './build-illustration-catalog.mjs';
import { ILLUSTRATION_DETAILS } from './illustration-details.mjs';
import { BOARDS } from './illustration-boards.mjs';

const read = file => readFileSync(path.join(ROOT, file), 'utf8').replaceAll('\r\n', '\n');
const documents = new Map(CANONICAL_FILES.map(file => [file, read('docs/' + file)]));
const graph = JSON.parse(read('scene_graph.json'));
const flow = JSON.parse(read('scene-flow.json'));
const manifest = JSON.parse(read('assets/illustrations/manifest.json'));
const { records, outputs } = buildIllustrationCatalog();
const catalog = outputs.get('docs/' + ILLUSTRATION_CATALOG);

test('catalog covers every canonical illustration once, including supplements and access layouts', () => {
  const embedded = [...documents].flatMap(([file, text]) => [...text.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)]
    .map(m => path.posix.normalize(path.posix.join('docs', path.posix.dirname(file), m[1]))));
  assert.equal(records.length, 110);
  assert(catalog.includes(`更新: ${manifest.updated}`));
  assert.equal(records.filter(r => r.layout).length, 13);
  assert.deepEqual(records.map(r => r.asset).sort(), embedded.sort());
  assert.equal(new Set(records.map(r => r.id)).size, records.length);
  for (const r of records) assert(existsSync(path.join(ROOT, r.asset)), r.id);
  assert(!catalog.includes('!['), 'the catalog must not duplicate original image embeds');
  assert.equal(Object.keys(flow.images).length, 559, 'concept index does not create work orders');
  assert(Object.values(flow.images).every(image => image.status === 'pending'));
});

test('each illustration has scene, current location, purpose, function and return navigation', () => {
  for (const r of records) {
    const text = documents.get(r.source);
    const note = text.split(`<!-- illustration-info:${r.id}:begin -->`)[1]?.split(`<!-- illustration-info:${r.id}:end -->`)[0];
    assert(note, r.id);
    for (const field of ['圖號', '類型', '場景編號', '用途', '功能作用']) assert(note.includes(`**${field}：**`), r.id);
    assert(note.includes('返回示意圖目錄'), r.id);
    assert(r.purpose && r.effect, r.id);
    assert(text.includes(`<a id="${r.heading}"></a>`), r.id);
    for (const n of [...r.scenes, ...r.subscenes]) {
      assert(note.includes(`[${n.id}]`), r.id);
      assert(note.includes(`（${n.building} · ${n.floor}）`), r.id);
    }
    if (!r.scenes.length) assert(note.includes('跨幕共用（無單一場景）'), r.id);
    if (r.layout) assert(text.indexOf(`<!-- access-layout:${r.scenes[0].id}:end -->`) < text.indexOf(`<!-- illustration-info:${r.id}:begin -->`), r.id);
  }
  assert.match(JSON.stringify(BOARDS.V24), /R21 · 40F/);
  assert.doesNotMatch(JSON.stringify(BOARDS.V24), /R21 · 41F/);
});

test('catalog and all metadata links resolve to real files and exact anchors', () => {
  const verify = (source, text) => {
    for (const m of text.matchAll(/(?<!!)\[[^\]]+\]\(([^)]+)\)/g)) {
      const [target, heading] = m[1].split('#');
      const file = target ? path.posix.normalize(path.posix.join('docs', path.posix.dirname(source), target)) : 'docs/' + source;
      assert(existsSync(path.join(ROOT, file)), `${source}: ${m[1]}`);
      if (heading) assert(read(file).includes(`<a id="${heading}"></a>`), `${source}: ${m[1]}`);
    }
  };
  verify(ILLUSTRATION_CATALOG, catalog);
  for (const [source, text] of documents) {
    for (const m of text.matchAll(/<!-- illustration-info:[\w-]+:begin -->([\s\S]*?)<!-- illustration-info:[\w-]+:end -->/g)) verify(source, m[1]);
  }
  const sections = [...catalog.matchAll(/<a id="catalog-group-([^"]+)"><\/a>/g)].map(m => m[1]);
  assert.deepEqual(sections, [...ACTS.map(a => String(a.act)), 'common']);
  assert.equal([...catalog.matchAll(/<a id="catalog-(?!group-)[^"]+"><\/a>/g)].length, records.length);
});

test('regeneration is idempotent and keeps original pictures, anchors and narrative untouched', () => {
  for (const [file, text] of outputs) assert.equal(read(file), text, file);
  const once = annotateIllustrations(documents, records);
  assert.deepEqual(annotateIllustrations(once, records), once);
  for (const [file, text] of once) {
    assert.equal(stripIllustrationNotes(text), stripIllustrationNotes(documents.get(file)), file);
    if (ACTS.some(a => a.path === file)) assert.equal(text, documents.get(file), file);
  }
  for (const r of records) {
    const text = once.get(r.source);
    assert(text.includes(`<a id="${r.originalHeading}"></a>`), r.id);
    assert.equal(text.split(r.image).length, 2, r.id);
  }
  assert(documents.get(APPENDIX).includes('[製作規格：示意圖目錄]'));
});

test('unmapped pictures, unknown scenes and duplicate image IDs fail before writing', () => {
  const source = ACTS[1].specPath, image = records.find(r => r.id === 'L02').image;
  const missing = new Map(documents);
  missing.set(source, documents.get(source) + '\n<a id="fig-unmapped"></a>\n![Missing](../../assets/unmapped.png)');
  assert.throws(() => collectIllustrations(missing, graph, flow, manifest), /Missing scene, purpose or function/);
  const duplicate = new Map(documents);
  duplicate.set(source, documents.get(source) + '\n<a id="fig-L02"></a>\n' + image);
  assert.throws(() => collectIllustrations(duplicate, graph, flow, manifest), /Duplicate illustration IDs/);
  const invalid = { ...graph, nodes: graph.nodes.filter(n => n.id !== 'R1') };
  assert.throws(() => collectIllustrations(documents, invalid, flow, manifest), /Unknown scene/);
  assert(records.every(r => r.layout || ILLUSTRATION_DETAILS[r.base]));
});

test('reader supports safe inline row anchors without allowing arbitrary HTML', () => {
  const app = read('app.js');
  const esc = app.split('\n').find(line => line.startsWith('const esc ='));
  const inline = app.slice(app.indexOf('function inlineMarkdown(value)'), app.indexOf('function renderMarkdown(raw'));
  const render = runInNewContext(`${esc}\n${inline}\ninlineMarkdown;`, { state: { selected: null, documents: [] } });
  assert.equal(render('<a id="catalog-l02-rules"></a>L02-RULES'), '<span id="catalog-l02-rules" class="md-anchor"></span>L02-RULES');
  assert.equal(render('<script>alert(1)</script>'), '&lt;script&gt;alert(1)&lt;/script&gt;');
  assert(render('<a id="bad" onclick="alert(1)"></a>').startsWith('&lt;a'));
  assert(render('<a id="bad/path"></a>').startsWith('&lt;a'));
});

test('production specifications and the catalog open document and section links separately', () => {
  const app = read('app.js');
  const esc = app.split('\n').find(line => line.startsWith('const esc ='));
  const inline = app.slice(app.indexOf('function inlineMarkdown(value)'), app.indexOf('function renderMarkdown(raw'));
  const state = { selected: { path: ILLUSTRATION_CATALOG, folder: '10_製作規格' }, documents: [
    ...ACTS.map(a => ({ path: a.specPath, folder: '10_製作規格' })),
    { path: APPENDIX, folder: '09_劇本' },
  ] };
  const render = runInNewContext(`${esc}\n${inline}\ninlineMarkdown;`, {
    state, URL, URLSearchParams, location: { href: 'https://example.test/dead-signal-docs/?static#doc=old' },
    imageAssetUrl: href => href.endsWith('.png') ? 'assets/example.png' : null,
    documentDisplayTitle: value => value,
  });
  for (const href of ['10-05_製作規格_第四幕.md#illustration-note-ref-silencer', '../' + APPENDIX + '#illustration-note-ref-mirror', '10-07_製作規格_第六幕.md#node-u2-spec']) {
    const html = render(`[參考](${href})`);
    assert(html.includes('target="_blank"'), href);
    assert(html.includes('rel="noopener noreferrer"'), href);
    assert(html.includes('data-doc-window="true"'), href);
    assert(html.includes('https://example.test/dead-signal-docs/?static#doc='), href);
    assert(html.includes('heading='), href);
  }
  assert(render('[分類](#catalog-group-4)').includes('target="_blank"'));
  state.selected = { path: ACTS[4].specPath, folder: '10_製作規格' };
  assert(render('[其他幕](10-07_製作規格_第六幕.md#node-u2-spec)').includes('target="_blank"'));
});

test('all production acts retain complete URLs, isolated openers and exact collapsed targets', () => {
  const app = read('app.js'), esc = app.split('\n').find(line => line.startsWith('const esc ='));
  const inline = app.slice(app.indexOf('function inlineMarkdown(value)'), app.indexOf('function renderMarkdown(raw'));
  const state = { selected: null, documents: [
    ...ACTS.flatMap(a => [{ path: a.specPath, folder: '10_製作規格' }, { path: a.path, folder: '09_劇本' }]),
    { path: APPENDIX, folder: '09_劇本' },
    { path: ILLUSTRATION_CATALOG, folder: '10_製作規格' },
  ] };
  const render = runInNewContext(`${esc}\n${inline}\ninlineMarkdown;`, {
    state, URL, URLSearchParams, location: { href: 'https://example.test/dead-signal-docs/?static#doc=old' },
    imageAssetUrl: href => href.endsWith('.png') ? 'assets/example.png' : null,
    documentDisplayTitle: value => value,
  });
  for (const current of state.documents.filter(d => d.folder === '10_製作規格')) {
    state.selected = current;
    for (const [href, target, heading] of [
      ['#node-r18-images', current.path, 'node-r18-images'],
      [ACTS[4].specPath.split('/').at(-1) + '#node-r18-pack', ACTS[4].specPath, 'node-r18-pack'],
      ['../' + ACTS[4].path + '#node-r18-script', ACTS[4].path, 'node-r18-script'],
      ['../' + APPENDIX + '#production-reading-contract', APPENDIX, 'production-reading-contract'],
    ]) {
      const html = render(`[參照](${href})`);
      const url = new URL(html.match(/href="([^"]+)"/)[1].replaceAll('&amp;', '&'));
      const destination = new URLSearchParams(url.hash.slice(1));
      assert.equal(url.pathname, '/dead-signal-docs/');
      assert.equal(url.search, '?static');
      assert.equal(destination.get('doc'), target);
      assert.equal(destination.get('heading'), heading);
      assert(html.includes('target="_blank"'));
      assert(html.includes('rel="noopener noreferrer"'));
      assert(html.includes('另開新視窗或分頁'));
    }
    for (const href of ['../../assets/example.png', 'https://example.test/reference']) {
      const html = render(`[參照](${href})`);
      assert(html.includes('target="_blank"'));
      assert(html.includes('rel="noopener noreferrer"'));
    }
  }
  state.selected = state.documents.find(d => d.path === ACTS[4].path);
  assert(!render('[本幕段落](#node-r18-script)').includes('target="_blank"'));
  assert(!render(`[附錄](../${APPENDIX}#reading-load)`).includes('target="_blank"'));
  assert(render(`[製作規格](../${ACTS[4].specPath}#node-r18-pack)`).includes('target="_blank"'));
});
