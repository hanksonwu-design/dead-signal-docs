import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ACTS, APPENDIX, CANONICAL_FILES, MASTER, ILLUSTRATION_CATALOG } from './screenplay-files.mjs';
import { ILLUSTRATION_DETAILS } from './illustration-details.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const read = file => readFileSync(path.join(ROOT, file), 'utf8').replaceAll('\r\n', '\n');
const slug = id => id.toLowerCase();
const link = (from, to, heading) => (from === to && heading ? '' : path.posix.relative(path.posix.dirname(from), to)) + (heading ? '#' + heading : '');
const cell = value => value.replaceAll('|', '／').replaceAll('\n', ' ');

export function stripIllustrationNotes(text) {
  return text.replaceAll('\r\n', '\n')
    .replace(/^<a id="illustration-note-[^"]+"><\/a>\n/gm, '')
    .replace(/\n\n<!-- illustration-info:[\w-]+:begin -->[\s\S]*?<!-- illustration-info:[\w-]+:end -->/g, '');
}

export function collectIllustrations(documents, graph, flow, manifest) {
  const records = [], nodes = new Map(graph.nodes.map(n => [n.id, n]));
  const places = new Map(flow.nodes.map(n => [n.id, n]));
  const bindings = new Map();
  for (const f of manifest.figures) {
    bindings.set(f.asset, { id: f.id, supplement: false });
    for (const asset of f.supplement || []) bindings.set(asset, { id: f.id, supplement: true });
  }
  for (const [source, content] of documents) {
    const text = stripIllustrationNotes(content);
    for (const m of text.matchAll(/!\[([^\]]*)\]\(([^)]+)\)/g)) {
      const asset = path.posix.normalize(path.posix.join('docs', path.posix.dirname(source), m[2]));
      const heading = [...text.slice(0, m.index).matchAll(/<a id="([^"]+)"><\/a>/g)].at(-1)?.[1];
      assert(heading, `Missing figure anchor: ${asset}`);
      const layout = asset.match(/^assets\/scene_access\/([^/]+)\.svg$/);
      const binding = bindings.get(asset);
      const base = layout ? 'ACCESS-' + graph.nodes.find(n => slug(n.id) === layout[1])?.id
        : heading.startsWith('fig-') ? heading.slice(4).toUpperCase() : binding?.id;
      assert(base && base !== 'ACCESS-undefined', `Unmapped illustration: ${asset}`);
      const id = base + (binding?.supplement ? '-RULES' : '');
      const details = layout ? {
        scenes: [base.slice(7)], purpose: '主場景出入口與視線配置草圖',
        effect: '對照入口、出口、回訪及封閉位置，協助製作門框、移動熱區與遮擋；實際通行仍依本房條件。',
      } : ILLUSTRATION_DETAILS[base];
      assert(details, `Missing scene, purpose or function: ${id}`);
      const scenes = details.scenes.map(id => {
        const node = nodes.get(id), place = places.get(id);
        assert(node && place, `Unknown scene: ${base}/${id}`);
        return { id, name: node.name, source: node.pack, heading: `node-${slug(id)}-spec`,
          floor: place.floor.label, building: place.building.label };
      });
      const subscenes = (details.subscenes || []).map(id => {
        const child = flow.subscenes.find(s => s.id === id);
        assert(child, `Unknown subscene: ${id}`);
        return { id, source: child.spec, heading: child.specHeading, floor: child.floor.label, building: child.building.label };
      });
      const act = ACTS.find(a => a.specPath === source);
      records.push({ id, base, title: m[1], asset, source, originalHeading: heading,
        heading: layout ? heading : `illustration-note-${slug(id)}`, layout: Boolean(layout),
        group: details.shared || !act ? 'common' : String(act.act),
        kind: layout ? '出入口草圖' : asset.endsWith('.svg') ? '規則圖解' : '概念／構圖參考',
        scenes, subscenes, purpose: details.purpose, effect: details.effect, image: m[0] });
    }
  }
  assert.equal(new Set(records.map(r => r.id)).size, records.length, 'Duplicate illustration IDs');
  assert.equal(new Set(records.map(r => r.asset)).size, records.length, 'Duplicate illustration assets');
  return records;
}

function sceneLinks(record, from, locations = false) {
  const prefix = record.group === 'common' ? '跨幕共用' + (record.scenes.length ? '；對照場景：' : '（無單一場景）') : '';
  return prefix + record.scenes.map(n => `[${n.id}](${link(from, n.source, n.heading)})${locations ? `（${n.building} · ${n.floor}）` : ''}`).join('、');
}

export function illustrationNote(record) {
  const lines = [
    `<!-- illustration-info:${record.id}:begin -->`,
    `**圖號：** ${record.id}　**類型：** ${record.kind}`,
    '',
    `**場景編號：** ${sceneLinks(record, record.source, true)}`,
  ];
  if (record.subscenes.length) lines.push('', '**次場景編號：** ' + record.subscenes.map(n => `[${n.id}](${link(record.source, n.source, n.heading)})（${n.building} · ${n.floor}）`).join('、'));
  lines.push('', `**用途：** ${record.purpose}`, '', `**功能作用：** ${record.effect}`, '',
    `[返回示意圖目錄](${link(record.source, ILLUSTRATION_CATALOG, 'catalog-' + slug(record.id))}) · [原圖檔](${link(record.source, '../' + record.asset)})`,
    `<!-- illustration-info:${record.id}:end -->`);
  return lines.join('\n');
}

export function annotateIllustrations(documents, records) {
  const outputs = new Map([...documents].map(([file, text]) => [file, stripIllustrationNotes(text)]));
  for (const r of records) {
    let text = outputs.get(r.source);
    if (r.layout) {
      const end = `<!-- access-layout:${r.scenes[0].id}:end -->`;
      assert(text.includes(end), r.id);
      text = text.replace(end, end + '\n\n' + illustrationNote(r));
    } else {
      text = text.replace(r.image, `<a id="${r.heading}"></a>\n` + r.image + '\n\n' + illustrationNote(r));
    }
    outputs.set(r.source, text);
  }
  return outputs;
}

export function renderCatalog(records) {
  const groups = [...ACTS.map(a => ({ id: String(a.act), title: `${a.name} · ${a.subtitle}` })), { id: 'common', title: '跨幕共用' }];
  const lines = ['---', '文件: 製作規格 · 示意圖目錄', '狀態: 現行示意圖索引；正式素材仍待製作與驗收',
    '更新: 2026-10-12', '摘要: 依幕別查閱全部示意圖、出入口草圖與補充規則圖；每張圖標示場景編號、樓層、用途及功能作用。', '---', '',
    '# 製作規格：示意圖目錄', '', '<a id="illustration-catalog"></a>', '',
    `[遊戲劇本總目錄](${link(ILLUSTRATION_CATALOG, MASTER, 'book-specs')}) · [現行版本與製作狀態](${link(ILLUSTRATION_CATALOG, APPENDIX, 'illustration-refresh')})`, '',
    `共 **${records.length} 張**現行示意圖，包含 ${records.filter(r => r.layout).length} 張出入口配置草圖。同組概念圖與規則圖各列一筆；圖名連到原文件的該張圖與註記，原圖檔另列。場景編號可查本房製作規格，圖下可返回本目錄。`, '',
    '目錄依幕別及原文件順序排列，跨幕共用圖另列；跨房圖的場景清單表示適用範圍，不代表房間直接相通。索引圖號不新增正式遊戲圖像工單，完成狀態仍以各房圖像表為準。', '',
    groups.map(g => `[${g.title}](#catalog-group-${g.id})`).join(' · '), ''];
  for (const group of groups) {
    const rows = records.filter(r => r.group === group.id);
    if (!rows.length) continue;
    lines.push(`<a id="catalog-group-${group.id}"></a>`, '', `## ${group.title}（${rows.length} 張）`, '',
      '| 圖號 | 示意圖與原圖檔 | 場景編號 | 用途 | 功能作用 |', '| --- | --- | --- | --- | --- |');
    for (const r of rows) lines.push(`| <a id="catalog-${slug(r.id)}"></a>${r.id} | [${cell(r.title)}](${link(ILLUSTRATION_CATALOG, r.source, r.heading)}) · [原圖](${link(ILLUSTRATION_CATALOG, '../' + r.asset)}) | ${sceneLinks(r, ILLUSTRATION_CATALOG)} | ${cell(r.purpose)} | ${cell(r.effect)} |`);
    lines.push('');
  }
  return lines.join('\n');
}

export function buildIllustrationCatalog() {
  const documents = new Map(CANONICAL_FILES.map(f => [f, read('docs/' + f)]));
  const records = collectIllustrations(documents, JSON.parse(read('scene_graph.json')), JSON.parse(read('scene-flow.json')), JSON.parse(read('assets/illustrations/manifest.json')));
  const outputs = new Map([...annotateIllustrations(documents, records)].map(([file, text]) => ['docs/' + file, text]));
  outputs.set('docs/' + ILLUSTRATION_CATALOG, renderCatalog(records));
  return { records, outputs };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const check = process.argv.includes('--check');
  const { records, outputs } = buildIllustrationCatalog();
  for (const [file, text] of outputs) {
    if (check) assert.equal(read(file), text, `Stale illustration information: ${file}`);
    else if (file === 'docs/' + ILLUSTRATION_CATALOG || read(file) !== text) writeFileSync(path.join(ROOT, file), text);
  }
  console.log(`${records.length} illustrations and ${records.filter(r => r.layout).length} access layouts ${check ? 'verified' : 'catalogued'} with scene, purpose and function notes.`);
}
