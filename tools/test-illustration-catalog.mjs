import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import { ACTS, APPENDIX, CANONICAL_FILES, ILLUSTRATION_CATALOG } from './screenplay-files.mjs';
import { ROOT } from './sync-canonical.mjs';
import { annotateIllustrations, buildIllustrationCatalog, collectIllustrations, stripIllustrationNotes } from './build-illustration-catalog.mjs';
import { ILLUSTRATION_DETAILS } from './illustration-details.mjs';
import { ALLOWED_ILLUSTRATION_TYPES, ILLUSTRATION_TYPES } from './illustration-types.mjs';
import { BOARDS } from './illustration-boards.mjs';

const read = file => readFileSync(path.join(ROOT, file), 'utf8').replaceAll('\r\n', '\n');
const documents = new Map(CANONICAL_FILES.map(file => [file, read('docs/' + file)]));
const graph = JSON.parse(read('scene_graph.json'));
const flow = JSON.parse(read('scene-flow.json'));
const manifest = JSON.parse(read('assets/illustrations/manifest.json'));
const { records, outputs } = buildIllustrationCatalog();
const catalog = outputs.get('docs/' + ILLUSTRATION_CATALOG);
const entries = new Map([...catalog.matchAll(/<a id="catalog-(?!group-)([^\"]+)"><\/a>/g)].map((match, index, matches) => [
  match[1], catalog.slice(match.index, matches[index + 1]?.index ?? catalog.length),
]));
const catalogAsset = href => path.posix.normalize(path.posix.join('docs', path.posix.dirname(ILLUSTRATION_CATALOG), href));

test('catalog covers every canonical illustration once, including supplements and access layouts', () => {
  const embedded = [...documents].flatMap(([file, text]) => [...text.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)]
    .map(m => path.posix.normalize(path.posix.join('docs', path.posix.dirname(file), m[1]))));
  assert.equal(records.length, 110);
  assert(catalog.includes(`更新: ${manifest.updated}`));
  assert.equal(records.filter(r => r.layout).length, 13);
  assert.deepEqual(records.map(r => r.asset).sort(), embedded.sort());
  assert.equal(new Set(records.map(r => r.id)).size, records.length);
  for (const r of records) assert(existsSync(path.join(ROOT, r.asset)), r.id);
  const pictures = [...catalog.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)];
  assert.equal(pictures.length, records.length, 'every catalog entry displays its existing illustration');
  assert.deepEqual(pictures.map(m => catalogAsset(m[1])).sort(), records.map(r => r.asset).sort());
  assert.equal(Object.keys(flow.images).length, 559, 'concept index does not create work orders');
  assert(Object.values(flow.images).every(image => image.status === 'pending'));
});

test('each catalog entry shows a short label and its picture before collapsed production notes', () => {
  assert.equal(entries.size, records.length);
  assert(!catalog.includes('| 圖號 |'), 'pictures replace the text-heavy catalog table');
  for (const r of records) {
    const entry = entries.get(r.id.toLowerCase());
    assert(entry, r.id);
    const notes = [...entry.matchAll(/<details>\n<summary>製作註記<\/summary>\n([\s\S]*?)<\/details>/g)];
    assert.equal(notes.length, 1, `${r.id}: one native details block, closed by default`);
    const visible = entry.replace(notes[0][0], '');
    const pictures = [...visible.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)];
    assert.equal(pictures.length, 1, `${r.id}: picture remains outside production notes`);
    assert.equal(catalogAsset(pictures[0][1]), r.asset, r.id);
    assert(pictures[0].index < notes[0].index, `${r.id}: picture precedes notes`);
    assert.match(visible, new RegExp(`^#{3,4} .*${r.id.replaceAll('-', '\\-')}`, 'm'), `${r.id}: visible figure label`);
    assert(visible.includes(`**類型：** ${r.types.join('、')}`), `${r.id}: gameplay types remain visible above the picture`);
    assert(visible.indexOf('**類型：**') < pictures[0].index, `${r.id}: types precede the picture`);
    assert(notes[0][1].includes(`**圖像形式：** ${r.kind}`), `${r.id}: rendering format stays separate from gameplay type`);
    assert(!visible.includes('**用途：**') && !visible.includes('**功能作用：**') && !visible.includes('次場景：'), r.id);
    assert(notes[0][1].includes(r.purpose) && notes[0][1].includes(r.effect), `${r.id}: full production context is retained`);
    for (const n of r.scenes) assert(visible.includes(`[${n.id}]`), `${r.id}: short scene link`);
    for (const n of [...r.scenes, ...r.subscenes]) {
      assert(notes[0][1].includes(`[${n.id}]`), `${r.id}: scene context remains in notes`);
      assert(notes[0][1].includes(`（${n.building} · ${n.floor}）`), `${r.id}: location remains in notes`);
      assert(!visible.includes(`（${n.building} · ${n.floor}）`), `${r.id}: location is collapsed`);
    }
    assert(!notes[0][1].includes('!['), `${r.id}: production notes do not repeat the image`);
  }
});

test('illustration types cover all content and distinguish gameplay from art references', () => {
  assert.deepEqual(Object.keys(ILLUSTRATION_TYPES).sort(), Object.keys(ILLUSTRATION_DETAILS).sort());
  for (const r of records) {
    assert(r.types.length >= 1 && r.types.length <= 3, r.id);
    assert.equal(new Set(r.types).size, r.types.length, r.id);
    assert(r.types.every(type => ALLOWED_ILLUSTRATION_TYPES.includes(type)), r.id);
    if (r.layout) assert.deepEqual(r.types, ['探索', '場景配置']);
    else assert.deepEqual(r.types, ILLUSTRATION_TYPES[r.base]);
    const source = documents.get(r.source).split(`<!-- illustration-info:${r.id}:begin -->`)[1]?.split(`<!-- illustration-info:${r.id}:end -->`)[0];
    assert(source?.includes(`**類型：** ${r.types.join('、')}`), `${r.id}: source notes agree with the catalog`);
  }
  assert(ILLUSTRATION_TYPES['REF-MECHANISM'].includes('操作') && ILLUSTRATION_TYPES['REF-MECHANISM'].includes('解謎'));
  assert(ILLUSTRATION_TYPES.V07.includes('潛行'));
  assert(ILLUSTRATION_TYPES.V38.includes('戰鬥／防禦'));
  assert(ILLUSTRATION_TYPES.V02.includes('介面'));
  assert(ILLUSTRATION_TYPES.CHAR.includes('角色設定') && !ILLUSTRATION_TYPES.CHAR.includes('解謎'));
  for (const r of records.filter(r => r.id.endsWith('-RULES'))) {
    assert.deepEqual(r.types, records.find(main => main.id === r.base)?.types, `${r.id}: paired visuals describe the same gameplay`);
  }
});

test('each illustration has scene, current location, purpose, function and return navigation', () => {
  for (const r of records) {
    const text = documents.get(r.source);
    const note = text.split(`<!-- illustration-info:${r.id}:begin -->`)[1]?.split(`<!-- illustration-info:${r.id}:end -->`)[0];
    assert(note, r.id);
    const production = ACTS.some(a => a.specPath === r.source);
    for (const field of production ? ['圖號', '類型', '場景編號'] : ['圖號', '類型', '場景編號', '用途', '功能作用']) assert(note.includes(`**${field}：**`), r.id);
    assert(note.includes(production ? '用途、功能與圖像目錄' : '返回示意圖目錄'), r.id);
    if (production) {
      assert(!note.includes('**用途：**') && !note.includes('**功能作用：**'), r.id);
      assert(catalog.includes(r.purpose) && catalog.includes(r.effect), r.id);
    }
    assert(r.purpose && r.effect, r.id);
    assert(text.includes(`<a id="${r.heading}"></a>`), r.id);
    for (const n of [...r.scenes, ...r.subscenes]) {
      assert(note.includes(`[${n.id}]`), r.id);
      assert((production ? catalog : note).includes(`（${n.building} · ${n.floor}）`), r.id);
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
