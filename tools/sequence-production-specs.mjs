// Keep illustrations beside their authored gameplay beat; composite boards remain references.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ACTS, APPENDIX } from './screenplay-files.mjs';
import { ROOT, parseMaster, deriveGraph, rewriteLinks } from './sync-canonical.mjs';
import { ILLUSTRATION_DETAILS } from './illustration-details.mjs';
import { orderImages, validateProductionOrder } from './reorder-production-specs.mjs';

export const SEQUENCE_MARKER = '<!-- production:ordered:v3 -->';
const tag = id => `<a id="${id}"></a>`;
const figureAnchor = id => ({ 'v07-rules': 'illustration-v07-rules', 'ref-u4': 'illustration-u4' }[id] ?? `fig-${id}`);
// A beat is an existing source anchor, never a new copy of the screenplay flow.
export const FIGURE_BEATS = [
  ['v16', 'p0', 'h-0601-128'], ['v40', 'p1', 'h-0601-259'], ['v02', 'p1', 'h-0601-284'],
  ['l01', 'p2', 'h-0601-313'], ['l02', 'r1', 'h-0602-78'],
  ['v01', 'r3', 'h-0602-467'], ['v03', 'r5', 'h-0602-836'], ['v05', 'r5', 'h-0602-847'],
  ['ref-ascent-a', 'r3', 'transition-r3-r5', 'exit'],
  ['v11', 'r7', 'h-0603-279'], ['v41', 'r8', 'h-0603-1136'], ['art01', 'r8', 'h-0603-1173'],
  ['l03', 'r11', 'h-0603-687'], ['v10', 'r11', 'h-0603-922'], ['v09', 'r11', 'h-0603-839'], ['ref-ahsun', 'r11', 'ahsun-domain'],
  ['ref-ascent-b', 'r11', 'transition-r11-r12', 'exit'],
  ['v08', 'r12', 'h-0604-131'], ['l04', 'r15', 'h-0604-435'],
  ['ref-ascent-high', 'r17', 'transition-r17-r18', 'exit'],
  ['v07', 'r18', 'h-0605-132'], ['v07-rules', 'r18', 'h-0605-132'], ['ref-glass', 'r19', 'h-0605-303'],
  ['ref-paper', 'r21', 'h-0605-472'], ['ref-upper-end', 'r22', 'h-0605-776'],
  ['ref-versions', 'r23', 'h-0606-127'], ['ref-time', 'r25', 'h-0606-313'],
  ['l06', 'r26', 'h-0606-509'], ['ref-abiao', 'r26', 'abiao-domain'],
  ['v39', 'm1', 'h-0607-123'], ['ref-u1', 'u1', 'h-0610-70'],
  ['ref-laundry', 'u2', 'h-0610-114'], ['ref-suites', 'r29', 'manager-suites-spec'], ['ref-u4', 'u4', 'h-0610-252'],
  ['ref-brake', 'r30', 'h-0607-605'], ['v28', 'r31', 'h-0607-680'], ['ref-thaw', 'r31', 'h-0607-729'],
  ['v13', 'r32', 'h-0608-114'], ['art02', 'r32', 'h-0608-114'],
  ['v38', 'r32', 'h-0608-152'], ['v14', 'r32', 'h-0608-163'], ['v15', 'r32', 'h-0608-163'],
  ['l09', 'r33', 'h-0608-182'], ['v31', 'post', 'h-0608-266'],
];

export const STEP_ORDER = [
  ['p0', ['h-0601-158', 'h-0601-188', 'h-0601-162', 'h-0601-172', 'h-0601-184', 'h-0601-196']],
  ['p1', ['h-0601-259', 'h-0601-265', 'h-0601-284', 'h-0601-274', 'h-0601-293']],
  ['r7', ['h-0603-1124', 'r7-song-list-operation', 'h-0603-246']],
  ['r8', ['h-0603-440', 'h-0603-453', 'h-0603-1178', 'h-0603-1136', 'h-0603-462', 'h-0603-1173', 'h-0603-470', 'r8-audio-library-operation']],
  ['r9', ['h-0603-564', 'h-0603-1128', 'h-0603-513']],
  ['r15', ['h-0604-435', 'h-0604-441', 'h-0604-895', 'r15-shortcut-return', 'h-0604-457', 'h-0604-387']],
  ['r16', ['h-0604-520', 'r16-permission-summary', 'r16-second-layer-lock', 'r16-login-residue', 'r16-old-operation-index', 'r16-optional-registers', 'r16-partial-power-return', 'h-0604-496']],
  ['r20', ['h-0605-367', 'h-0605-668', 'r20-management-three-seconds', 'r20-local-verification', 'h-0605-690', 'h-0605-381', 'h-0605-395']],
  ['r23', ['h-0606-127', 'h-0606-139', 'h-0606-133']],
  ['r26', ['h-0606-436', 'h-0606-509', 'h-0606-477', 'h-0606-492', 'h-0606-496']],
  ['r29', ['h-0607-417', 'h-0607-429', 'h-0607-471', 'manager-suites-spec']],
  ['r30', ['h-0607-585', 'h-0607-621', 'h-0607-597', 'h-0607-605', 'h-0607-611']],
  ['r31', ['h-0607-680', 'h-0607-989', 'h-0607-694', 'h-0607-700', 'h-0607-725', 'h-0607-729', 'h-0607-758', 'h-0607-774']],
  ['r32', ['h-0608-88', 'h-0608-98', 'h-0608-114', 'h-0608-128', 'h-0608-152', 'r32-ceasefire-pressure', 'r32-ceasefire-sources', 'h-0608-163']],
];

function roomText(text, slug) {
  const start = text.indexOf(tag(`node-${slug}-spec`));
  assert(start >= 0, slug);
  const rest = text.slice(start);
  const end = rest.slice(tag(`node-${slug}-spec`).length).search(/<a id="(?:node-[a-z0-9]+-spec|spec-act-\d+-shared)"><\/a>/);
  return end < 0 ? rest : rest.slice(0, end + tag(`node-${slug}-spec`).length);
}

export function validateProductionSequence(documents, graph) {
  validateProductionOrder(documents, graph);
  for (const [id] of FIGURE_BEATS) {
    if (id === 'v07-rules') continue; // Exists only with the locally authored V07 gameplay mockup.
    const count = ACTS.reduce((n, a) => n + documents.get(a.specPath).split(tag(figureAnchor(id))).length - 1, 0);
    assert.equal(count, 1, `${id}: missing or repeated illustration`);
  }
  for (const act of ACTS) {
    const text = documents.get(act.specPath);
    assert(text.includes(SEQUENCE_MARKER), `${act.name}: missing screenplay sequence`);
    assert(text.includes('### 本幕概覽與前置\n'), `${act.name}: truncated overview heading`);
    assert(!/^置\s*$/m.test(text), `${act.name}: stranded overview character`);
    assert(!/\| 階段 \| 製作規格 \|/.test(text), `${act.name}: duplicate flow summary`);
    for (const m of text.matchAll(/<!-- ((?:scene-image[\w-]*|scene-images|route-exploration)(?::[^:\n ]+)?):begin -->([\s\S]*?)<!-- \1:end -->/g)) {
      assert(!/<a id="(?:fig-|illustration-(?!note-))/.test(m[2]), `${act.name}: authored figure inside a generated section`);
    }
    for (const node of graph.nodes.filter(n => n.act === act.act)) {
      const room = roomText(text, node.id.toLowerCase());
      assert(!/^\- \*\*(?:L\d+|V\d+|REF-[^：]+)：\*\*/m.test(room), `${node.id}: repeated gallery caption`);
    }
  }
  for (const [slug, ids] of STEP_ORDER) {
    const act = ACTS.find(a => documents.get(a.specPath).includes(tag(`node-${slug}-spec`)));
    const text = roomText(documents.get(act.specPath), slug);
    const positions = ids.map(id => text.indexOf(tag(id)));
    assert(positions.every((n, i) => n >= 0 && (!i || n > positions[i - 1])), `Screenplay beat order: ${slug}`);
  }
  let inline = 0, reference = 0;
  for (const act of ACTS) {
    const text = documents.get(act.specPath);
    const referenceAt = text.indexOf(tag(`spec-act-${act.act}-references`));
    for (const m of text.matchAll(/^<a id="(fig-[^"]+|illustration-(?!note-)[^"]+)"><\/a>$/gm)) {
      const beat = FIGURE_BEATS.find(([id]) => figureAnchor(id) === m[1]);
      if (beat) {
        const [, slug, id, placement] = beat, room = roomText(text, slug);
        const position = room.indexOf(m[0]);
        assert(position > room.indexOf(tag(id)), `${m[1]}: illustration before its gameplay beat`);
        assert(placement === 'exit' ? position > room.indexOf(tag(`node-${slug}-exit`)) : position < room.indexOf(tag(`node-${slug}-visual`)), `${m[1]}: separated from gameplay`);
        const between = room.slice(room.indexOf(tag(id)) + tag(id).length, position);
        assert(!/^<a id="(?:h-|s-|node-)/m.test(between), `${m[1]}: illustration detached from its step`);
        inline++;
      } else {
        assert(m.index > referenceAt, `${m[1]}: composite board interrupts gameplay`);
        reference++;
      }
    }
  }
  return { acts: ACTS.length, inlineFigures: inline, referenceBoards: reference };
}

function removeSummaries(text, audit) {
  // Only the redundant four-row overview. Mechanism/save/material specification tables stay.
  text = text.replace(/\| 階段 \| 製作規格 \|\n\|[^\n]+\|\n(?:\|[^\n]+\|\n)+/g, table => {
    assert(/\| 進入／目標 \|/.test(table) && /\| 操作順序 \|/.test(table), 'Unexpected flow table');
    audit.removedFlowSummaries++;
    return '';
  });
  text = text.replace(/^#{5} ([^\n]+) 製作流程\n/gm, '');
  // Technical packs retain flags, numbers, exception tests and materials; no second flow outline.
  text = text.replace(/^\| 前置與操作順序 \|[^\n]+\|\n/gm, () => { audit.removedPackFlowRows++; return ''; });
  return text.replace('### 本幕概覽與前\n', '### 本幕概覽與前置\n').replace(/^置\s*\n/gm, '');
}

function extractFigures(text) {
  const figures = new Map();
  const starts = [...text.matchAll(/^<a id="(fig-[^"]+|illustration-(?!note-)[^"]+)"><\/a>$/gm)];
  for (const match of starts.reverse()) {
    const rest = text.slice(match.index);
    const boundary = rest.slice(match[0].length).search(/^<a id="(?:fig-|illustration-(?!note-)|node-|s-|spec-act-)|^<\/?details>|^<!-- import:/m);
    assert(boundary >= 0, `Missing figure boundary: ${match[1]}`);
    const end = match.index + match[0].length + boundary;
    const body = text.slice(match.index, end).trim();
    assert(body.includes('![') && !body.includes('<!-- import:'), match[1]);
    const id = match[1] === 'illustration-u4' ? 'ref-u4' : match[1].replace(/^(?:fig-|illustration-)/, '');
    figures.set(id, body);
    text = text.slice(0, match.index) + text.slice(end);
  }
  return { text, figures: new Map([...figures].reverse()) };
}

function afterBeat(text, id, figures) {
  const start = text.indexOf(tag(id));
  assert(start >= 0, `Unknown figure beat: ${id}`);
  const from = start + tag(id).length;
  const next = text.slice(from).search(/^<a id="(?!illustration-note-)|^<!-- import:[^:]+:end -->|^<!-- (?:scene-|route-exploration:|production-subscenes:)/m);
  assert(next >= 0, `Missing end of beat: ${id}`);
  const end = from + next;
  return text.slice(0, end).trimEnd() + '\n\n' + figures.join('\n\n') + '\n\n' + text.slice(end);
}

export function sequenceProduction(original, graph) {
  if (ACTS.every(a => original.documents.get(a.specPath).includes(SEQUENCE_MARKER))) {
    return { documents: original.documents, audit: validateProductionSequence(original.documents, graph) };
  }
  assert(ACTS.every(a => original.documents.get(a.specPath).includes('<!-- production:ordered:v2 -->')), 'Run the v2 compaction first');
  const documents = new Map(original.documents), allFigures = new Map(), extraLinks = new Map(), panelNotes = new Map(), preferredFigures = new Map();
  const audit = { removedFlowSummaries: 0, removedPackFlowRows: 0 };
  for (const act of ACTS) {
    let text = removeSummaries(documents.get(act.specPath), audit);
    const extracted = extractFigures(text);
    text = extracted.text;
    for (const [id, body] of extracted.figures) allFigures.set(id, { body, act });
    // The old gallery introduction repeats each figure caption and jumps out of the scene flow.
    text = text.replace(/<a id="node-([a-z0-9]+)-visual"><\/a>[\s\S]*?(?=<details>\n<summary>狀態、素材與驗收（製作細節）)/g,
      (_, slug) => {
        const originalGallery = original.documents.get(act.specPath).split(tag(`node-${slug}-visual`))[1].split('<details>')[0];
        extraLinks.set(slug, [...originalGallery.matchAll(/\[([^\]]+)\]\(([^)]*#(?:fig-|illustration-)[^)]+)\)/g)]
          .filter(m => m[2].includes('../09_劇本/')).map(m => m[0]));
        preferredFigures.set(slug, [...originalGallery.matchAll(/#(fig-[\w-]+|illustration-(?!note-)[\w-]+)\)/g)].map(m => m[1]));
        panelNotes.set(slug, originalGallery.split('\n').filter(line => /^- \*\*/.test(line) && /本房只取第|本房僅取第/.test(line))
          .map(line => line.replace(/^- \*\*([^：]+)：\*\*/, '**$1 本房面板：**')));
        return tag(`node-${slug}-visual`) + '\n\n';
      });
    documents.set(act.specPath, text);
  }
  // Insert all figures assigned to the same beat together, preserving the authored tie order.
  const insertions = new Map();
  for (const [id, slug, anchor] of FIGURE_BEATS) {
    const figure = allFigures.get(id);
    if (!figure) continue; // Optional locally authored artwork may not exist in every checkout.
    assert(roomText(documents.get(figure.act.specPath), slug).includes(tag(anchor)), `${id}: wrong room`);
    const key = `${figure.act.act}:${anchor}`, entry = insertions.get(key) ?? { act: figure.act, anchor, bodies: [] };
    entry.bodies.push(figure.body);
    insertions.set(key, entry);
  }
  for (const { act, anchor, bodies } of insertions.values()) documents.set(act.specPath, afterBeat(documents.get(act.specPath), anchor, bodies));
  for (const act of ACTS) {
    let text = documents.get(act.specPath);
    const boards = [...allFigures].filter(([id, f]) => f.act.act === act.act && !FIGURE_BEATS.some(b => b[0] === id));
    const nodeRank = id => graph.nodes.findIndex(n => n.id === id);
    boards.sort(([a], [b]) => Math.min(...(ILLUSTRATION_DETAILS[a.toUpperCase()]?.scenes ?? []).map(nodeRank), Infinity)
      - Math.min(...(ILLUSTRATION_DETAILS[b.toUpperCase()]?.scenes ?? []).map(nodeRank), Infinity));
    if (boards.length) {
      const heading = text.slice(text.indexOf(tag(`spec-act-${act.act}-references`))).match(/^### [^\n]+/m)?.[0];
      assert(heading, act.name);
      text = text.replace(heading, heading + '\n\n跨房整板集中於此；各格依標示場景使用，互斥分支、後續回訪及不同幕內容不連成必做步驟。\n\n' + boards.map(([, f]) => f.body).join('\n\n'));
    }
    text = text.replace(/^\[第六至八幕圖解與原素材對照\]\([^\n]+\)\n/gm, '');
    for (const node of graph.nodes.filter(n => n.act === act.act)) {
      const slug = node.id.toLowerCase();
      const refs = [...allFigures].filter(([id]) => {
        const scenes = ILLUSTRATION_DETAILS[id.toUpperCase()]?.scenes ?? [];
        return scenes.includes(node.id) && !FIGURE_BEATS.some(b => b[0] === id && b[1] === slug);
      });
      const priority = id => {
        const index = (preferredFigures.get(slug) ?? []).indexOf(figureAnchor(id));
        return index < 0 ? Infinity : index;
      };
      refs.sort(([a], [b]) => priority(a) - priority(b));
      const links = refs.map(([id, f]) => `[${id.toUpperCase()}（${node.id} 適用格）](${f.act.act === act.act ? '' : path.posix.basename(f.act.specPath)}#${figureAnchor(id)})`);
      links.push(...(extraLinks.get(slug) ?? []));
      if (links.length) text = text.replace(tag(`node-${slug}-visual`), tag(`node-${slug}-visual`) + '\n\n**跨房圖像參照：** ' + links.join(' · '));
      if (panelNotes.get(slug)?.length) text = text.replace(tag(`node-${slug}-visual`), tag(`node-${slug}-visual`) + '\n\n' + panelNotes.get(slug).join('\n\n'));
      text = text.replace(`[操作與解謎](#node-${slug}-level)`, `[操作與示意](#node-${slug}-level)`);
    }
    text = orderImages(text, documents.get(act.path)).replace('<!-- production:ordered:v2 -->', SEQUENCE_MARKER);
    documents.set(act.specPath, text.replace(/\n{4,}/g, '\n\n\n').trimEnd() + '\n');
  }
  documents.set(APPENDIX, documents.get(APPENDIX).replace(
    '各幕依「進場與動線 → 操作與解謎 → 圖像示意 → 製作細節 → 離場及次場景」排列。',
    '各幕依正式劇本順序閱讀：進場與動線 → 逐步操作及對應示意 → 製作細節 → 離場及次場景。各房保留一套詳細操作；圖像隨適用步驟呈現，跨房整板集中於幕末並由當房連結。互斥選擇、選填及回訪以所在操作條款區分。'));
  let after = parseMaster([...documents.values()].join('\n\n'), documents);
  for (const [file, text] of documents) documents.set(file, rewriteLinks(text, file, after));
  after = parseMaster([...documents.values()].join('\n\n'), documents);
  for (const [id, file] of original.anchorFiles) assert.equal(after.anchorFiles.get(id), file, `Anchor lost or moved between files: ${id}`);
  assert.equal(after.blocks.size, original.blocks.size);
  for (const act of ACTS) assert.equal(documents.get(act.path), rewriteLinks(original.documents.get(act.path), act.path, after), `Story changed: ${act.name}`);
  const inventory = docs => [...docs.values()].flatMap(t => [...t.matchAll(/!\[[^\]]*\]\([^)]+\)/g)].map(m => m[0])).sort();
  assert.deepEqual(inventory(documents), inventory(original.documents), 'Illustration inventory changed');
  assert.deepEqual(deriveGraph(after, graph), graph, 'Game graph changed');
  return { documents, audit: { ...audit, ...validateProductionSequence(documents, graph),
    sourceBlocksBefore: original.blocks.size, sourceBlocksAfter: after.blocks.size,
    preservedAnchors: original.anchorFiles.size, preservedIllustrationEmbeds: inventory(documents).length } };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const original = parseMaster(), graph = JSON.parse(readFileSync(path.join(ROOT, 'scene_graph.json'), 'utf8'));
  const result = process.argv.includes('--check') ? { audit: validateProductionSequence(original.documents, graph) } : sequenceProduction(original, graph);
  console.log(JSON.stringify(result.audit, null, 2));
  if (process.argv.includes('--write')) {
    for (const [file, text] of result.documents) if (text !== original.documents.get(file)) writeFileSync(path.join(ROOT, 'docs', file), text);
    writeFileSync(path.join(ROOT, 'reviews/2026-10-16_production-sequence.json'), JSON.stringify(result.audit, null, 2) + '\n');
  }
}
