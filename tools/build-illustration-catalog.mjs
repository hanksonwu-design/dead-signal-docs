import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ACTS, CANONICAL_FILES, ILLUSTRATION_CATALOG } from './screenplay-files.mjs';
import { ILLUSTRATION_DETAILS } from './illustration-details.mjs';
import { ALLOWED_ILLUSTRATION_TYPES, ILLUSTRATION_TYPES } from './illustration-types.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const read = file => readFileSync(path.join(ROOT, file), 'utf8').replaceAll('\r\n', '\n');
const slug = id => id.toLowerCase();
const link = (from, to, heading) => (from === to && heading ? '' : path.posix.relative(path.posix.dirname(from), to)) + (heading ? '#' + heading : '');

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
      const types = layout ? ['探索', '場景配置'] : ILLUSTRATION_TYPES[base];
      assert(Array.isArray(types) && types.length >= 1 && types.length <= 3 &&
        new Set(types).size === types.length && types.every(type => ALLOWED_ILLUSTRATION_TYPES.includes(type)),
      `Missing or invalid illustration types: ${id}`);
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
        types, scenes, subscenes, purpose: details.purpose, effect: details.effect, image: m[0] });
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
  if (ACTS.some(a => a.specPath === record.source)) return [
    `<!-- illustration-info:${record.id}:begin -->`,
    `**圖號：** ${record.id}　**類型：** ${record.types.join('、')}　**圖像形式：** ${record.kind}`,
    '', `**場景編號：** ${sceneLinks(record, record.source)}`,
    ...(record.subscenes.length ? ['', '**次場景編號：** ' + record.subscenes.map(n => `[${n.id}](${link(record.source, n.source, n.heading)})`).join('、')] : []),
    '', `[用途、功能與圖像目錄](${link(record.source, ILLUSTRATION_CATALOG, 'catalog-' + slug(record.id))}) · [原圖檔](${link(record.source, '../' + record.asset)})`,
    `<!-- illustration-info:${record.id}:end -->`,
  ].join('\n');
  const lines = [
    `<!-- illustration-info:${record.id}:begin -->`,
    `**圖號：** ${record.id}　**類型：** ${record.types.join('、')}　**圖像形式：** ${record.kind}`,
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

export function renderCatalog(records, updated) {
  const groups = [...ACTS.map(a => ({ id: String(a.act), title: `${a.name} · ${a.subtitle}`, label: a.name })), { id: 'common', title: '跨幕共用', label: '跨幕共用' }];
  const lines = ['---', '文件: 製作規格 · 示意圖目錄', '狀態: 現行示意圖索引；正式素材仍待製作與驗收',
    `更新: ${updated}`, '摘要: 依幕別直接看圖；簡標圖號、類型與場景，製作註記可展開查閱。', '---', '',
    '# 製作規格：示意圖目錄', '', '<a id="illustration-catalog"></a>', '',
    `共 **${records.length} 張**。依幕別及劇本順序看圖，點圖可開原圖；詳細說明收在「製作註記」。`, '',
    groups.map(g => `[${g.label}](#catalog-group-${g.id})`).join(' · '), ''];
  for (const group of groups) {
    const rows = records.filter(r => r.group === group.id);
    if (!rows.length) continue;
    lines.push(`<a id="catalog-group-${group.id}"></a>`, '', `## ${group.title}（${rows.length} 張）`, '');
    for (const r of rows) {
      const asset = link(ILLUSTRATION_CATALOG, '../' + r.asset);
      const scenes = r.scenes.map(n => `[${n.id}](${link(ILLUSTRATION_CATALOG, n.source, n.heading)})`).join('、');
      const label = (r.group === 'common' ? '跨幕共用' + (scenes ? ' · ' : '') : '') + scenes;
      const locations = sceneLinks(r, ILLUSTRATION_CATALOG, true) + (r.subscenes.length ? '；次場景：' + r.subscenes.map(n => `[${n.id}](${link(ILLUSTRATION_CATALOG, n.source, n.heading)})（${n.building} · ${n.floor}）`).join('、') : '');
      lines.push(`<a id="catalog-${slug(r.id)}"></a>`, '', `### ${r.id}｜${r.title}`, '',
        `**類型：** ${r.types.join('、')} · ${label} · [製作規格](${link(ILLUSTRATION_CATALOG, r.source, r.heading)})`, '',
        `![${r.title}](${asset})`, '',
        '<details>', '<summary>製作註記</summary>', '',
        `**圖像形式：** ${r.kind}`, '', `**用途：** ${r.purpose}`, '', `**功能作用：** ${r.effect}`, '',
        `**位置：** ${locations}`, '', `[原圖檔](${asset})`, '', '</details>', '');
    }
    lines.push('');
  }
  return lines.join('\n').trimEnd() + '\n';
}

export function buildIllustrationCatalog() {
  const documents = new Map(CANONICAL_FILES.map(f => [f, read('docs/' + f)]));
  const manifest = JSON.parse(read('assets/illustrations/manifest.json'));
  const records = collectIllustrations(documents, JSON.parse(read('scene_graph.json')), JSON.parse(read('scene-flow.json')), manifest);
  const outputs = new Map([...annotateIllustrations(documents, records)].map(([file, text]) => ['docs/' + file, text]));
  outputs.set('docs/' + ILLUSTRATION_CATALOG, renderCatalog(records, manifest.updated));
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
