// Derive topic views and navigation from the maintained screenplay chapters.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { readSceneFloor } from './scene-floors.mjs';
import { MASTER, ACTS, FINALE, CANONICAL_FILES, READING_FILES, SPLIT_MARKER, SPEC_SPLIT_MARKER, legacyFinalHeading } from './screenplay-files.mjs';
export { MASTER } from './screenplay-files.mjs';

export const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DOCS = path.join(ROOT, 'docs');
const read = file => readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
const slug = text => text.toLowerCase().replace(/[*`]/g, '').replace(/[^\p{L}\p{N}_\- ]/gu, '').replace(/ /g, '-');
const clean = text => text.replace(/[*`]/g, '').trim();

export function parseMaster(text, documents) {
  if (text === undefined) {
    const index = read(path.join(DOCS, MASTER));
    documents = new Map((index.includes(SPEC_SPLIT_MARKER) ? CANONICAL_FILES : index.includes(SPLIT_MARKER) ? READING_FILES : [MASTER])
      .map(file => [file, read(path.join(DOCS, file))]));
    text = [...documents.values()].join('\n\n');
  }
  documents ||= new Map([[MASTER, text]]);
  const anchorFiles = new Map();
  for (const [file, content] of documents) {
    for (const match of content.matchAll(/<a id="([^"]+)"><\/a>/g)) {
      assert(!anchorFiles.has(match[1]), `Duplicate anchor: ${match[1]}`);
      anchorFiles.set(match[1], file);
    }
  }
  const manifest = [...text.matchAll(/^<!-- canonical-source: (\{[^\n]+\}) -->$/gm)].map(m => JSON.parse(m[1]));
  const sources = manifest.length ? manifest.map(source => ({ ...source, count: source.indices.length })) : [...text.matchAll(/<a id="doc-([^"]+)"><\/a>\s*\n\s*### [^\n]+\s*\n\s*原檔：`([^`]+)`；正文 \d+ 行，([\d,]+) 段/g)]
    .map(m => ({ id: m[1], path: m[2], count: Number(m[3].replaceAll(',', '')) }));
  const entries = [...text.matchAll(/<!-- import:([^:]+):begin -->([\s\S]*?)<!-- import:\1:end -->/g)].map(m => [m[1], m[2].trim()]);
  const blocks = new Map(entries);
  assert.equal(blocks.size, entries.length, 'Duplicate imported blocks');
  assert.equal([...text.matchAll(/<!-- import:[^:]+:begin -->/g)].length, blocks.size, 'Unpaired imported blocks');
  assert.equal([...text.matchAll(/<!-- import:[^:]+:end -->/g)].length, blocks.size, 'Unpaired imported blocks');
  const anchors = new Set([...text.matchAll(/<a id="([^"]+)"><\/a>/g)].map(m => m[1]));
  assert.equal(sources.length, 72, 'source manifest');
  assert.equal(new Set(sources.map(source => source.id)).size, sources.length, 'Duplicate source IDs');
  assert.equal(new Set(sources.map(source => source.path)).size, sources.length, 'Duplicate source paths');
  assert.equal(blocks.size, sources.reduce((sum, source) => sum + source.count, 0), 'imported blocks');
  for (const source of sources) {
    const indices = source.indices || Array.from({ length: source.count }, (_, i) => i);
    assert.equal(new Set(indices).size, indices.length, `Duplicate indices: ${source.id}`);
    source.blocks = indices.map(i => {
      assert(Number.isSafeInteger(i) && i >= 0, `Invalid index: ${source.id}`);
      const id = `s-${source.id}-${i}`;
      assert(blocks.has(id), `Missing ${id}`);
      return { id, text: blocks.get(id) };
    });
    source.first = source.blocks.find(block => block.text)?.id || `doc-${source.id}`;
    source.headings = source.blocks.flatMap(block => [...block.text.matchAll(/<a id="([^"]+)"><\/a>\s*\n\s*(#{1,6}) ([^\n]+)/g)]
      .map(m => ({ id: m[1], title: clean(m[3]), slug: slug(m[3]) })));
  }
  return { text, sources, blocks, anchors, documents, anchorFiles };
}

export function canonicalFile(master, anchor) {
  assert(master.anchorFiles.has(anchor), `Unknown canonical anchor: ${anchor}`);
  return master.anchorFiles.get(anchor);
}

function metadata(content) {
  const fields = new Map();
  const header = content.match(/^---\n([\s\S]*?)\n---\n/);
  for (const line of (header?.[1] || '').split('\n')) {
    const colon = line.indexOf(':');
    if (colon > 0) fields.set(line.slice(0, colon).trim(), line.slice(colon + 1).trim());
  }
  return fields;
}

function header(fields) {
  return `---\n${[...fields].map(([key, value]) => `${key}: ${value}`).join('\n')}\n---\n\n`;
}

function withMetadata(content, updates) {
  const fields = metadata(content);
  for (const [key, value] of Object.entries(updates)) fields.set(key, value);
  return header(fields) + content.replace(/^---\n[\s\S]*?\n---\n\s*/, '');
}

function masterLink(from, anchor, master) {
  const target = canonicalFile(master, anchor);
  const relative = from === target ? '' : path.posix.relative(path.posix.dirname(from), target);
  return `${relative}#${anchor}`;
}

function retiredAnchor(id) {
  if (id === '0600' || id === '0609') return 'book-toc';
  if (id === '0610') return 'act-6';
  if (/^060[1-8]$/.test(id)) return `act-${Number(id.slice(-1)) - 1}`;
  if (id === '0900') return 'appendix-rules';
  if (id === '0911') return 'doc-0911';
  if (id === '0913') return 'appendix-clues';
  if (id === '0910') return `act-${FINALE.act}`;
  if (/^090[3-9]$/.test(id)) return `act-${Number(id.slice(2)) - 3}`;
  return 'book-toc';
}

function isRetired(source) {
  return source.path.startsWith('06_') || source.path.startsWith('09_劇本/');
}

function topicView(source, original, master) {
  const fields = metadata(original);
  if (source.id === '0301') fields.set('文件', '03-01 全劇流程大綱');
  fields.set('狀態', '正式稿衍生查閱；待審／未實機驗收');
  fields.set('更新', '2026-09-30');
  fields.set('來源', `${canonicalFile(master, source.first)}#${source.first}`);
  fields.set('維護', '由 tools/sync-canonical.mjs 產生；請只修訂對應遊戲劇本、製作規格或共用附錄');
  fields.set('摘要', '正式來源的分類查閱副本；劇情、逐房製作規格與共用設定各有唯一維護位置，不獨立修訂。');
  // Each retained block can now live in a different folder from this topic view.
  let body = source.blocks.filter(block => block.text).map(block => {
    const owner = canonicalFile(master, block.id);
    return block.text.replace(/\]\(([^)]+)\)/g, (whole, href) => {
      if (/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(href)) return whole;
      const [target, ...fragment] = href.split('#');
      const anchor = fragment.join('#');
      if (anchor && master.anchors.has(anchor)) return `](${masterLink(source.path, anchor, master)})`;
      if (!target) return whole;
      const absolute = path.posix.normalize(path.posix.join(path.posix.dirname(owner), target));
      return `](${path.posix.relative(path.posix.dirname(source.path), absolute)}${fragment.length ? '#' + anchor : ''})`;
    });
  }).join('\n\n');
  let fenced = false;
  let firstHeading = true;
  body = body.split('\n').map(line => {
    if (/^\s*(?:```|~~~)/.test(line)) { fenced = !fenced; return line; }
    if (fenced) return line;
    const heading = line.match(/^(#{1,6}) (.*)$/);
    if (!heading) return line;
    const level = firstHeading ? 1 : Math.max(2, heading[1].length - 2);
    firstHeading = false;
    return `${'#'.repeat(level)} ${heading[2]}`;
  }).join('\n');
  const notice = `> 本頁由[正式來源](${masterLink(source.path, source.first, master)})產生，方便分類查閱；請只修訂對應遊戲劇本、製作規格或共用附錄。台詞與揭露順序仍讀對應正式場次，不能把製作端完整設定提前顯示給玩家。\n\n`;
  return header(fields) + notice + (body.trim() || `# ${path.posix.basename(source.path, '.md')}\n\n此分類以正式稿的共用規格與圖像索引為準。`) + '\n';
}

function retiredView(file, original, anchor, master) {
  const fields = metadata(original);
  fields.set('狀態', '已併入正式劇本；相容入口');
  fields.set('更新', '2026-09-30');
  fields.set('導覽分類', file.startsWith('06_') && file.includes('06-00_') ? '場景導覽' : '批次存檔');
  fields.set('正式入口', `${canonicalFile(master, anchor)}#${anchor}`);
  fields.set('摘要', '內容由對應遊戲劇本、製作規格或共用附錄維護；此頁只保留舊連結入口。');
  fields.set('維護', '由 tools/sync-canonical.mjs 產生');
  return header(fields) + `# 遊戲劇本入口\n\n本文件已併入[正式來源](${masterLink(file, anchor, master)})；劇情讀對應遊戲劇本，技術細節查同幕製作規格，跨幕設定查共用附錄。\n\n[逐房目錄](${masterLink(file, 'book-toc', master)}) · [圖像與示意](${masterLink(file, 'book-illustrations', master)}) · [待審與驗收](${masterLink(file, 'book-pending', master)})\n\n修改前內容保存在儲存庫的 \`archive/2026-09-30-canonical-sync/before-sync.zip\`；備份是歷史快照，不是製作依據。\n`;
}

export function rewriteLinks(content, file, master, warnings = []) {
  return content.replace(/(?<!!)\[([^\]\n]+)\]\(([^)\n]+)\)/g, (whole, label, href) => {
    if (/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(href)) return whole;
    const [target, ...fragment] = href.split('#');
    const absolute = target ? path.posix.normalize(path.posix.join(path.posix.dirname(file), target)) : file;
    const ref = legacyFinalHeading(absolute, decodeURIComponent(fragment.join('#')));
    if (master.documents.has(absolute)) {
      if (!ref) return whole;
      if (master.anchors.has(ref)) return `[${label}](${masterLink(file, ref, master)})`;
    }
    if (!target) return whole;
    const source = master.sources.find(item => item.path === absolute);
    if (!source) return whole;
    let anchor = isRetired(source) ? retiredAnchor(source.id) : source.first;
    if (ref) {
      const found = source.headings.find(h => h.id === ref || h.slug === ref || slug(h.title) === slug(ref));
      if (found) anchor = found.id;
      else {
        const node = ref.match(/^(p\d|r\d+b?|u\d+b?|m1|post)(?:-|\s|$)/i)?.[1].toLowerCase();
        if (node && master.anchors.has(`node-${node}`)) anchor = `node-${node}`;
        else if (master.anchors.has(ref)) anchor = ref;
        else warnings.push({ file, href, fallback: anchor });
      }
    }
    return `[${label}](${masterLink(file, anchor, master)})`;
  });
}

export function deriveGraph(master, existing) {
  const graph = structuredClone(existing);
  graph.phases = {};
  const routes = new Map();
  for (const node of graph.nodes) {
    const id = node.id.toLowerCase();
    const start = master.text.indexOf(`<a id="node-${id}-nav">`);
    const navEnd = master.text.indexOf(`<!-- navigation:${id}:end -->`, start);
    const end = navEnd >= 0 ? navEnd : master.text.indexOf(`<a id="node-${id}-script">`, start);
    assert(start >= 0 && end > start, `Navigation section: ${node.id}`);
    const nav = master.text.slice(start, end);
    const goal = nav.match(/^進行目的：(.*)$/m)?.[1];
    assert(goal, `Goal: ${node.id}`);
    const phaseLine = nav.match(/^房內順序：(.*)$/m);
    if (phaseLine) {
      const phases = phaseLine[1].split('→').map(step => step.trim());
      assert(phases.every(Boolean), `Empty phase: ${node.id}`);
      graph.phases[node.id] = phases;
    }
    const source = canonicalFile(master, `node-${id}-script`);
    const chapter = ACTS.find(act => act.path === source);
    assert(chapter, `Unknown chapter owner: ${node.id}`);
    Object.assign(node, { act: chapter.act, goal, source, heading: `node-${id}-script`, pack: canonicalFile(master, `node-${id}-pack`), packAnchor: `node-${id}-pack`, spatialHeading: `node-${id}-level`, duplicatePack: false });
    for (const line of nav.split('\n')) {
      const cells = line.split('|').slice(1, -1).map(cell => cell.trim());
      const route = cells[0]?.match(/^([A-Za-z0-9]+) ([↔→]) ([A-Za-z0-9]+)$/);
      if (!route) continue;
      const key = `${route[1]}:${route[3]}`;
      const value = { kind: cells[1], gate: cells[2], motion: cells[3], returnRule: cells[4], back: route[2] === '↔', source: canonicalFile(master, `node-${route[1].toLowerCase()}-script`) };
      if (routes.has(key)) assert.deepEqual(routes.get(key), value, `Conflicting route: ${key}`);
      routes.set(key, value);
    }
  }
  for (const edge of graph.edges) {
    const route = routes.get(`${edge.fromId}:${edge.toId}`);
    assert(route, `Unmapped edge: ${edge.id}`);
    Object.assign(edge, route);
  }
  graph.atlas = MASTER;
  graph.acts = ACTS.map(act => `${act.act < 5 ? '上部' : '下部'}・${act.name}／${act.subtitle}`);
  graph.source = MASTER;
  graph.notes[0] = `${graph.nodes.length} 個導覽節點（上部 ${graph.nodes.filter(node => node.part === 1).length}、下部 ${graph.nodes.filter(node => node.part === 2).length}）；含共用子節點、操作鏡位與片尾，不等於獨立房間數。`;
  const endingOrder = master.blocks.get('s-0608-18').match(/順序固定為([^。]+)。/)?.[1];
  assert(endingOrder, 'Canonical ending presentation order');
  graph.phases.R33 = endingOrder.split('→').map(step => step.trim());
  return graph;
}

export function buildSync() {
  const master = parseMaster();
  const outputs = new Map();
  const warnings = [];
  for (const source of master.sources) {
    if (CANONICAL_FILES.includes(source.path)) continue;
    const original = read(path.join(DOCS, source.path));
    outputs.set(`docs/${source.path}`, isRetired(source) ? retiredView(source.path, original, retiredAnchor(source.id), master) : topicView(source, original, master));
  }
  const extraRetired = {
    '09_劇本/09-01_劇本細綱_上部.md': 'act-0',
    '09_劇本/09-02_劇本細綱_下部.md': 'act-5',
    '09_劇本/09-12_全篇三輪檢修.md': 'book-completeness',
  };
  for (const [file, anchor] of Object.entries(extraRetired)) outputs.set(`docs/${file}`, retiredView(file, read(path.join(DOCS, file)), anchor, master));
  for (const item of readdirSync(DOCS, { recursive: true })) {
    const file = item.replaceAll('\\', '/');
    if (!file.endsWith('.md') || outputs.has(`docs/${file}`)) continue;
    const original = read(path.join(DOCS, file));
    let content = rewriteLinks(original, file, master, warnings);
    if (file.startsWith('08_製作管理/') && /(?:08-1[12]_|上部_第)/.test(file)) {
      content = withMetadata(content, { '規格基準': MASTER, '雲端狀態': '本輪僅同步本地規格連結；Google 試算表內容未核對、未改寫' });
    }
    outputs.set(`docs/${file}`, content);
  }
  const graph = deriveGraph(master, JSON.parse(read(path.join(ROOT, 'scene_graph.json'))));
  outputs.set('scene_graph.json', JSON.stringify(graph, null, 2) + '\n');
  const model = JSON.parse(read(path.join(ROOT, 'building/scene-data.json')));
  model.phases = structuredClone(graph.phases);
  model.nodes = model.nodes.map(node => {
    const canonical = graph.nodes.find(item => item.id === node.id);
    assert(canonical, `Model node ${node.id}`);
    return { ...node, goal: canonical.goal, source: canonical.source, heading: canonical.heading, pack: canonical.pack, packAnchor: canonical.packAnchor, spatialHeading: canonical.spatialHeading, duplicatePack: canonical.duplicatePack };
  });
  model.edges = model.edges.map(edge => {
    const canonical = graph.edges.find(item => item.id === edge.id);
    assert(canonical, `Model edge ${edge.id}`);
    return { ...edge, gate: canonical.gate, motion: canonical.motion, kind: canonical.kind, back: canonical.back, returnRule: canonical.returnRule, source: canonical.source };
  });
  for (const [id, spatial] of Object.entries(model.spatial)) {
    spatial.source = canonicalFile(master, `node-${id.toLowerCase()}-level`);
    spatial.heading = `node-${id.toLowerCase()}-level`;
    const floor = readSceneFloor(master.documents.get(spatial.source), graph.nodes.find(n => n.id === id));
    spatial.floor = floor.description;
    spatial.floorLabel = floor.label;
  }
  model.source = MASTER;
  model.retrieved = '2026-09-30';
  outputs.set('building/scene-data.json', JSON.stringify(model, null, 2) + '\n');
  outputs.set('building/data.js', `// Generated by tools/sync-canonical.mjs; editor geometry is maintained separately.\nexport default ${JSON.stringify(model)};\n`);
  return { outputs, warnings };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const { outputs, warnings } = buildSync();
  const changed = [...outputs].filter(([file, text]) => read(path.join(ROOT, file)) !== text);
  if (process.argv.includes('--check')) {
    console.log(changed.length ? `Canonical sync out of date: ${changed.map(([file]) => file).join(', ')}` : 'Canonical topic views and scene references are up to date');
    process.exitCode = changed.length ? 1 : 0;
  } else {
    for (const [file, text] of changed) writeFileSync(path.join(ROOT, file), text);
    console.log(`Canonical sync: ${changed.length} files updated; ${outputs.size} files checked`);
  }
  if (warnings.length) console.log(JSON.stringify({ legacyHeadingFallbacks: warnings }, null, 2));
}
