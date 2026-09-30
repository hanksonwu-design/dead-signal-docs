// Derive topic views and navigation from the single maintained screenplay.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

export const ROOT = fileURLToPath(new URL('..', import.meta.url));
export const MASTER = '09_劇本/09-14_全劇本與關卡整合稿.md';
const DOCS = path.join(ROOT, 'docs');
const read = file => readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
const slug = text => text.toLowerCase().replace(/[*`]/g, '').replace(/[^\p{L}\p{N}_\- ]/gu, '').replace(/ /g, '-');
const clean = text => text.replace(/[*`]/g, '').trim();

export function parseMaster(text = read(path.join(DOCS, MASTER))) {
  const sources = [...text.matchAll(/<a id="doc-([^"]+)"><\/a>\s*\n\s*### [^\n]+\s*\n\s*原檔：`([^`]+)`；正文 \d+ 行，([\d,]+) 段/g)]
    .map(m => ({ id: m[1], path: m[2], count: Number(m[3].replaceAll(',', '')) }));
  const blocks = new Map([...text.matchAll(/<!-- import:([^:]+):begin -->([\s\S]*?)<!-- import:\1:end -->/g)].map(m => [m[1], m[2].trim()]));
  const anchors = new Set([...text.matchAll(/<a id="([^"]+)"><\/a>/g)].map(m => m[1]));
  assert.equal(sources.length, 72, 'source manifest');
  assert.equal(blocks.size, 1700, 'imported blocks');
  for (const source of sources) {
    source.blocks = Array.from({ length: source.count }, (_, i) => {
      const id = `s-${source.id}-${i}`;
      assert(blocks.has(id), `Missing ${id}`);
      return { id, text: blocks.get(id) };
    });
    source.first = source.blocks.find(block => block.text)?.id;
    source.headings = source.blocks.flatMap(block => [...block.text.matchAll(/<a id="([^"]+)"><\/a>\s*\n\s*(#{1,6}) ([^\n]+)/g)]
      .map(m => ({ id: m[1], title: clean(m[3]), slug: slug(m[3]) })));
  }
  return { text, sources, blocks, anchors };
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

function masterLink(from, anchor) {
  const relative = path.posix.relative(path.posix.dirname(from), MASTER);
  return `${relative}#${anchor}`;
}

function retiredAnchor(id) {
  if (id === '0600' || id === '0609') return 'book-toc';
  if (id === '0610') return 'act-6';
  if (/^060[1-8]$/.test(id)) return `act-${Number(id.slice(-1)) - 1}`;
  if (id === '0900') return 'appendix-rules';
  if (id === '0911') return 'doc-0911';
  if (id === '0913') return 'appendix-clues';
  if (/^09(?:0[3-9]|10)$/.test(id)) return `act-${Number(id.slice(2)) - 3}`;
  return 'book-toc';
}

function isRetired(source) {
  return source.path.startsWith('06_') || source.path.startsWith('09_劇本/');
}

function topicView(source, original) {
  const fields = metadata(original);
  fields.set('狀態', '正式稿衍生查閱；待審／未實機驗收');
  fields.set('更新', '2026-09-30');
  fields.set('來源', `${MASTER}#${source.first}`);
  fields.set('維護', '由 tools/sync-canonical.mjs 產生；請只修訂正式劇本');
  fields.set('摘要', '正式劇本的分類查閱副本；條件、原件與演出以同一主稿為準，不獨立修訂。');
  let body = source.blocks.filter(block => block.text).map(block => block.text).join('\n\n');
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
  body = body.replace(/\]\(#([^)]+)\)/g, (_, anchor) => `](${masterLink(source.path, anchor)})`);
  // Topic files and the master are both one directory below docs/.
  body = body.replace(/\]\((\.\.\/[^)]+)\)/g, (whole, href) => {
    if (href.startsWith('../09_劇本/')) return whole;
    const absolute = path.posix.normalize(path.posix.join(path.posix.dirname(MASTER), href));
    return `](${path.posix.relative(path.posix.dirname(source.path), absolute)})`;
  });
  const notice = `> 本頁由[完整正式劇本](${masterLink(source.path, source.first)})的已整合正文產生，方便分類查閱；唯一修改來源是正式劇本。台詞與揭露順序仍讀對應正式場次，不能把製作端完整設定提前顯示給玩家。\n\n`;
  return header(fields) + notice + body.trim() + '\n';
}

function retiredView(file, original, anchor) {
  const fields = metadata(original);
  fields.set('狀態', '已併入正式劇本；相容入口');
  fields.set('更新', '2026-09-30');
  fields.set('導覽分類', file.startsWith('06_') && file.includes('06-00_') ? '場景導覽' : '批次存檔');
  fields.set('正式入口', `${MASTER}#${anchor}`);
  fields.set('摘要', '正文已併入單一正式劇本；此頁只保留舊連結入口，不另維護劇情或關卡條件。');
  fields.set('維護', '由 tools/sync-canonical.mjs 產生');
  return header(fields) + `# 正式劇本入口\n\n本文件已併入[全劇本與關卡整合稿](${masterLink(file, anchor)})，請在同一份主稿閱讀、修訂及驗收。\n\n[逐房目錄](${masterLink(file, 'book-toc')}) · [圖像與示意](${masterLink(file, 'book-illustrations')}) · [待審與驗收](${masterLink(file, 'book-pending')})\n\n修改前內容保存在儲存庫的 \`archive/2026-09-30-canonical-sync/before-sync.zip\`；備份是歷史快照，不是製作依據。\n`;
}

export function rewriteLinks(content, file, master, warnings = []) {
  return content.replace(/(?<!!)\[([^\]\n]+)\]\(([^)\n]+)\)/g, (whole, label, href) => {
    if (/^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(href)) return whole;
    const [target, ...fragment] = href.split('#');
    const absolute = path.posix.normalize(path.posix.join(path.posix.dirname(file), target));
    const source = master.sources.find(item => item.path === absolute);
    if (!source) return whole;
    const ref = decodeURIComponent(fragment.join('#'));
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
    return `[${label}](${masterLink(file, anchor)})`;
  });
}

export function deriveGraph(master, existing) {
  const graph = structuredClone(existing);
  const routes = new Map();
  for (const node of graph.nodes) {
    const id = node.id.toLowerCase();
    const start = master.text.indexOf(`<a id="node-${id}-nav">`);
    const end = master.text.indexOf(`<a id="node-${id}-script">`, start);
    assert(start >= 0 && end > start, `Navigation section: ${node.id}`);
    const nav = master.text.slice(start, end);
    const goal = nav.match(/^進行目的：(.*)$/m)?.[1];
    assert(goal, `Goal: ${node.id}`);
    Object.assign(node, { goal, source: MASTER, heading: `node-${id}-script`, pack: MASTER, packAnchor: `node-${id}-pack`, spatialHeading: `node-${id}-level`, duplicatePack: false });
    for (const line of nav.split('\n')) {
      const cells = line.split('|').slice(1, -1).map(cell => cell.trim());
      const route = cells[0]?.match(/^([A-Za-z0-9]+) ([↔→]) ([A-Za-z0-9]+)$/);
      if (!route) continue;
      const key = `${route[1]}:${route[3]}`;
      const value = { kind: cells[1], gate: cells[2], motion: cells[3], returnRule: cells[4], back: route[2] === '↔', source: MASTER };
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
  graph.source = MASTER;
  graph.notes[0] = `${graph.nodes.length} 個導覽節點（上部 ${graph.nodes.filter(node => node.part === 1).length}、下部 ${graph.nodes.filter(node => node.part === 2).length}）；含共用子節點、操作鏡位與片尾，不等於獨立房間數。`;
  const endingOrder = master.blocks.get('s-0910-39').match(/順序固定為([^。]+)。/)?.[1];
  assert(endingOrder, 'Canonical ending presentation order');
  graph.phases.R33 = endingOrder.split('→').map(step => step.trim());
  return graph;
}

export function buildSync() {
  const master = parseMaster();
  const outputs = new Map();
  const warnings = [];
  for (const source of master.sources) {
    const original = read(path.join(DOCS, source.path));
    outputs.set(`docs/${source.path}`, isRetired(source) ? retiredView(source.path, original, retiredAnchor(source.id)) : topicView(source, original));
  }
  const extraRetired = {
    '09_劇本/09-01_劇本細綱_上部.md': 'act-0',
    '09_劇本/09-02_劇本細綱_下部.md': 'act-5',
    '09_劇本/09-12_全篇三輪檢修.md': 'book-completeness',
  };
  for (const [file, anchor] of Object.entries(extraRetired)) outputs.set(`docs/${file}`, retiredView(file, read(path.join(DOCS, file)), anchor));
  for (const item of readdirSync(DOCS, { recursive: true })) {
    const file = item.replaceAll('\\', '/');
    if (!file.endsWith('.md') || file === MASTER || outputs.has(`docs/${file}`)) continue;
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
  model.nodes = model.nodes.map(node => {
    const canonical = graph.nodes.find(item => item.id === node.id);
    assert(canonical, `Model node ${node.id}`);
    return { ...node, goal: canonical.goal, source: canonical.source, heading: canonical.heading, pack: canonical.pack, packAnchor: canonical.packAnchor, spatialHeading: canonical.spatialHeading, duplicatePack: canonical.duplicatePack };
  });
  model.edges = model.edges.map(edge => {
    const canonical = graph.edges.find(item => item.id === edge.id);
    assert(canonical, `Model edge ${edge.id}`);
    return { ...edge, gate: canonical.gate, motion: canonical.motion, kind: canonical.kind, back: canonical.back, returnRule: canonical.returnRule, source: MASTER };
  });
  for (const [id, spatial] of Object.entries(model.spatial)) {
    spatial.source = MASTER;
    spatial.heading = `node-${id.toLowerCase()}-level`;
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
