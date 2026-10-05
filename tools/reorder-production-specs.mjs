// Loss-checked layout migration. Preview by default; --write applies it, --check validates order.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ACTS, MASTER } from './screenplay-files.mjs';
import { ROOT, parseMaster, deriveGraph } from './sync-canonical.mjs';

const marker = '<!-- production:ordered:v1 -->';
const anchor = id => `<a id="${id}"></a>`;
const imported = /<a id="(s-[^"]+)"><\/a>\s*<!-- import:\1:begin -->([\s\S]*?)<!-- import:\1:end -->/g;
const bundled = /(?:<a id="[^"]+"><\/a>\s*)+<!-- import:([^:]+):begin -->([\s\S]*?)<!-- import:\1:end -->/g;
const wrap = (id, body) => `${anchor(id)}\n\n<!-- import:${id}:begin -->\n${body.trim()}\n<!-- import:${id}:end -->`;
const ids = (prefix, numbers) => numbers.map(n => `s-${prefix}-${n}`);
const policies = [
  { front: [...ids('0903', [1]), ...ids('0601', [5, 2, 3, 4, 11, 17])], end: [...ids('0903', [27, 28]), ...ids('0601', [9, 16]), ...ids('0903', [30])], art: ids('0601', [13, 19, 14]) },
  { front: [...ids('0602', [1]), ...ids('0904', [1]), ...ids('0602', [3, 2, 17])], end: [...ids('0602', [10]), ...ids('0904', [46, 47, 48])], art: ids('0602', [14, 21, 15]) },
  { front: [...ids('0603', [1]), ...ids('0905', [1]), ...ids('0603', [3, 2, 11, 15, 23])], end: [...ids('0905', [56, 57]), ...ids('0603', [12]), ...ids('0905', [58])], art: ids('0603', [19, 34, 20]), rooms: { r7: ids('0603', [21]), r11: ids('0603', [10]) } },
  { front: [...ids('0604', [1]), ...ids('0906', [1]), ...ids('0604', [3, 2, 21])], end: [...ids('0604', [10]), ...ids('0906', [63, 64]), ...ids('0604', [11, 12]), ...ids('0906', [65])], art: ids('0604', [18, 27]), rooms: { r17: ids('0604', [22]) } },
  { front: [...ids('0605', [1]), ...ids('0907', [1]), ...ids('0605', [3, 2, 19])], end: [...ids('0605', [10]), ...ids('0907', [49, 50]), ...ids('0605', [11, 12]), ...ids('0907', [51, 52])], art: ids('0605', [17, 26, 18]), rooms: { r21: ids('0605', [22]), r22: ids('0605', [23]) } },
  { front: [...ids('0606', [1]), ...ids('0908', [1, 2]), ...ids('0606', [3, 2, 23, 24, 18])], end: [...ids('0606', [8]), ...ids('0908', [60, 61]), ...ids('0606', [9, 10]), ...ids('0908', [62, 63])], art: ids('0606', [15, 25, 16]) },
  { front: [...ids('0607', [1]), ...ids('0909', [1, 2]), ...ids('0607', [4, 2, 3, 21])], end: [...ids('0607', [11]), ...ids('0909', [63]), ...ids('0607', [12, 13]), ...ids('0909', [64])], art: ids('0607', [18, 27, 19]) },
  { front: [...ids('0910', [1, 2]), ...ids('0608', [3, 2, 15])], end: [...ids('0910', [43]), ...ids('0608', [11]), ...ids('0910', [44])], art: ids('0608', [13, 19]), rooms: { r32: ids('0608', [17, 14]), post: ids('0608', [12]) } },
];

function generated(text, name) {
  const begin = `<!-- scene-image-${name}:begin -->`, end = `<!-- scene-image-${name}:end -->`;
  const start = text.indexOf(begin), stop = text.indexOf(end);
  assert(start >= 0 && stop > start && text.split(begin).length === 2, name);
  return text.slice(start, stop + end.length);
}

function storyPosition(row, story) {
  if (row.includes('| 過渡場景 |') || row.includes('| 過渡近看 |') || row.includes('| 出口接景 |')) return Infinity;
  const id = row.match(/\]\([^)]*#([^)]+)\)\s*\|$/)?.[1];
  assert(id, `Missing image source: ${row}`);
  const index = id ? story.indexOf(anchor(id)) : -1;
  return index >= 0 ? index : Number.MAX_SAFE_INTEGER;
}

export function orderImages(text, story) {
  return text.replace(/(<!-- scene-images:[^:]+:begin -->\n)([\s\S]*?)(\n<!-- scene-images:[^:]+:end -->)/g, (_, begin, body, end) => {
    const [heading, rule, base, ...rows] = body.split('\n');
    rows.sort((a, b) => storyPosition(a, story) - storyPosition(b, story));
    return begin + [heading, rule, base, ...rows].join('\n') + end;
  });
}

export function validateProductionOrder(documents, graph) {
  let children = 0, passages = 0;
  for (const act of ACTS) {
    const text = documents.get(act.specPath), story = documents.get(act.path);
    assert(text.includes(marker), `Unordered specification: ${act.name}`);
    assert(!text.includes('### 本幕共通規格與交付'), act.name);
    const boundaries = ['overview', 'rooms', 'shared', 'references', 'delivery'].map(s => text.indexOf(anchor(`spec-act-${act.act}-${s}`)));
    assert(boundaries.every((n, i) => n >= 0 && (!i || n > boundaries[i - 1])), act.name);
    const rooms = [...text.matchAll(/^<a id="node-([a-z0-9]+)-spec"><\/a>$/gm)];
    assert.deepEqual(rooms.map(m => m[1]), graph.nodes.filter(n => n.act === act.act).map(n => n.id.toLowerCase()));
    assert(rooms[0].index > boundaries[1] && rooms.at(-1).index < boundaries[2]);
    const index = text.indexOf(anchor(`image-routes-act-${act.act}`));
    assert(index > boundaries[0] && index < boundaries[1]);
    for (const [i, match] of rooms.entries()) {
      const id = match[1], body = text.slice(match.index, rooms[i + 1]?.index ?? boundaries[2]);
      const positions = ['nav', 'level', 'pack', 'images', 'visual', 'exit'].map(s => body.indexOf(anchor(`node-${id}-${s}`)));
      assert(positions.every((n, i) => n >= 0 && (!i || n > positions[i - 1])), `Room section order: ${id}`);
      for (const child of body.matchAll(/<a id="subscene-([^"]+)-spec"><\/a>/g)) {
        assert(child.index > positions.at(-1), `Child before parent completion: ${child[1]}`);
        children++;
      }
      for (const passage of body.matchAll(/<a id="transition-([a-z0-9]+)-[^"]+"><\/a>/g)) {
        assert.equal(passage[1], id, `Wrong departure scene: ${passage[0]}`);
        assert(passage.index > positions.at(-1), `Passage before parent completion: ${id}`);
        passages++;
      }
      assert.equal(orderImages(body, story), body, `Image source order: ${id}`);
    }
    for (const id of policies[act.act].front) assert(text.indexOf(anchor(id)) > boundaries[0] && text.indexOf(anchor(id)) < boundaries[1], id);
    for (const id of policies[act.act].end) assert(text.indexOf(anchor(id)) > boundaries[4], id);
    for (const id of policies[act.act].art) assert(text.indexOf(anchor(id)) > boundaries[3] && text.indexOf(anchor(id)) < boundaries[4], id);
    for (const [room, supplements] of Object.entries(policies[act.act].rooms ?? {})) {
      for (const id of supplements) assert(text.indexOf(anchor(id)) > text.indexOf(anchor(`node-${room}-level`)) && text.indexOf(anchor(id)) < text.indexOf(anchor(`node-${room}-pack`)), id);
    }
  }
  assert.equal(children, 67);
  assert.equal(passages, 21);
  return { acts: ACTS.length, nodes: graph.nodes.length, subscenes: children, passages };
}

export function reorderProduction(original, graph) {
  if (ACTS.every(a => original.documents.get(a.specPath).includes(marker))) {
    return { documents: original.documents, audit: validateProductionOrder(original.documents, graph) };
  }
  assert(ACTS.every(a => !original.documents.get(a.specPath).includes(marker)), 'Partially migrated specifications');
  const documents = new Map(original.documents), expected = new Map(original.blocks);
  const manifest = original.sources.map(({ id, path, indices }) => ({ id, path, indices: [...indices] }));
  const moved = [];
  for (const act of ACTS) {
    const policy = policies[act.act], passagesByParent = new Map();
    // Legacy passages sometimes sit under the arrival room. Always attach them to the departure.
    const text = documents.get(act.specPath).replace(imported, (whole, sourceId, body) => {
      const pattern = /<a id="transition-[^"]+"><\/a>\n##### [^\n]+[\s\S]*?(?=\n<a id=|\n#{1,6} |$)/g;
      const rest = body.replace(pattern, passage => {
        const source = manifest.find(s => sourceId.startsWith(`s-${s.id}-`));
        assert(source, sourceId);
        const number = Math.max(...source.indices) + 1;
        source.indices.push(number);
        const newId = `s-${source.id}-${number}`, room = passage.match(/id="transition-([a-z0-9]+)-/)[1];
        expected.set(newId, passage.trim());
        const entries = passagesByParent.get(room) ?? [];
        entries.push(wrap(newId, passage));
        passagesByParent.set(room, entries);
        moved.push({ from: sourceId, to: newId, anchor: passage.match(/id="([^"]+)"/)[1], room });
        return '';
      });
      if (rest === body) return whole;
      expected.set(sourceId, rest.trim());
      return wrap(sourceId, rest);
    });
    const starts = [...text.matchAll(/^<a id="node-([a-z0-9]+)-spec"><\/a>$/gm)];
    const tailStart = text.indexOf('### 本幕共通規格與交付');
    assert(tailStart > starts.at(-1).index, act.name);
    const tail = text.slice(tailStart + '### 本幕共通規格與交付'.length);
    const blocks = new Map([...tail.matchAll(bundled)].map(m => [m[1], m[0]]));
    const footer = tail.replace(bundled, '').trim();
    assert(/^\[總目錄\][^\n]+$/.test(footer), `Unexpected tail text: ${act.name}`);
    const take = ids => ids.map(id => { assert(blocks.has(id), id); const b = blocks.get(id); blocks.delete(id); return b; }).join('\n\n');
    const front = take(policy.front), delivery = take(policy.end), references = take(policy.art);
    const supplements = new Map(Object.entries(policy.rooms ?? {}).map(([room, ids]) => [room, take(ids)]));
    const routeIndex = generated(text, `routes-${act.act}`);
    const intro = text.slice(0, starts[0].index).replace(routeIndex, '').trimEnd();
    const rooms = starts.map((match, i) => {
      const id = match[1];
      const raw = text.slice(match.index, starts[i + 1]?.index ?? tailStart).trim();
      const positions = ['images', 'nav', 'visual', 'level', 'pack'].map(s => raw.indexOf(anchor(`node-${id}-${s}`)));
      assert(positions.every((n, j) => n > 0 && (!j || n > positions[j - 1])), id);
      const [imagesAt, navAt, visualAt, levelAt, packAt] = positions;
      const heading = raw.slice(0, imagesAt).trim();
      let images = raw.slice(imagesAt, navAt).trim();
      let nav = raw.slice(navAt, visualAt).trim();
      const visual = raw.slice(visualAt, levelAt).trim(), pack = raw.slice(packAt).trim();
      const level = raw.slice(levelAt, packAt).trim();
      let children = '';
      if (images.includes(`<!-- scene-image-subscenes-${id}:begin -->`)) {
        children = generated(images, `subscenes-${id}`);
        images = images.replace(children, '').trim();
      }
      const passages = passagesByParent.get(id) ?? [];
      nav = nav.replace(/\*\*演出限制與製作註記\*\*\s*$/, '').trim();
      const jump = `[進場與動線](#node-${id}-nav) · [操作與解謎](#node-${id}-level) · [狀態與驗收](#node-${id}-pack) · [圖像製作單](#node-${id}-images) · [離場與次場景](#node-${id}-exit)`;
      const exit = `${anchor(`node-${id}-exit`)}\n\n#### 離場通路與次場景\n\n` +
        (passages.length ? passages.join('\n\n') + '\n\n' : '') + `<!-- production-subscenes:${id} -->\n\n` +
        (children || `沿[本場景動線](#node-${id}-nav)的原出口與分支交接；不新增中間探索場景。`);
      const sections = [heading, jump, nav, level, supplements.get(id), pack, images, visual, exit].filter(Boolean);
      return orderImages(sections.join('\n\n'), documents.get(act.path));
    });
    const section = (id, title, body) => `${anchor(`spec-act-${act.act}-${id}`)}\n\n### ${title}\n\n${body}`;
    const contents = [['overview', '本幕概覽'], ['rooms', '場景流程'], ['shared', '跨場景共用規則'], ['references', '跨場景圖解'], ['delivery', '幕尾狀態與交付']];
    const toc = contents.map(([id, label]) => `[${label}](#spec-act-${act.act}-${id})`).join(' · ');
    documents.set(act.specPath, [intro, marker, toc,
      section('overview', '本幕概覽與前置', front + '\n\n' + routeIndex),
      section('rooms', '依流程逐場景製作', rooms.join('\n\n')),
      section('shared', '跨場景共用規則', [...blocks.values()].join('\n\n')),
      section('references', '跨場景圖解對照', references),
      section('delivery', '幕尾狀態與交付', delivery), footer].join('\n\n') + '\n');
  }
  const index = documents.get(MASTER).replace(/^<!-- canonical-source: (\{[^\n]+\}) -->$/gm, (_, json) => {
    const source = manifest.find(s => s.id === JSON.parse(json).id);
    return `<!-- canonical-source: ${JSON.stringify(source)} -->`;
  });
  documents.set(MASTER, index);
  const after = parseMaster([...documents.values()].join('\n\n'), documents);
  assert.equal(after.blocks.size, expected.size);
  for (const [id, text] of expected) assert.equal(after.blocks.get(id), text, `Unexpected content change: ${id}`);
  for (const [id, owner] of original.anchorFiles) assert.equal(after.anchorFiles.get(id), owner, `Anchor owner changed: ${id}`);
  for (const act of ACTS) assert.equal(documents.get(act.path), original.documents.get(act.path), `Story changed: ${act.name}`);
  const imageRows = docs => ACTS.flatMap(a => [...docs.get(a.specPath).matchAll(/<!-- scene-images:[^:]+:begin -->([\s\S]*?)<!-- scene-images:[^:]+:end -->/g)]
    .flatMap(m => m[1].split('\n').filter(l => l.startsWith('|')))).sort();
  assert.deepEqual(imageRows(documents), imageRows(original.documents), 'Image work-order contents changed');
  const images = docs => [...docs.values()].flatMap(t => [...t.matchAll(/!\[[^\]]*\]\([^)]+\)/g)].map(m => m[0])).sort();
  assert.deepEqual(images(documents), images(original.documents), 'Illustration inventory changed');
  assert.deepEqual(deriveGraph(after, graph), graph, 'Game routes changed');
  const stats = validateProductionOrder(documents, graph);
  const hash = createHash('sha256').update([...expected].sort(([a], [b]) => a.localeCompare(b)).map(([id, text]) => `${id}\n${text}`).join('\n')).digest('hex');
  return { documents, audit: { ...stats, beforeBlocks: original.blocks.size, afterBlocks: after.blocks.size, moved,
    checks: 'Source text, original anchors, reading acts, work-order rows, illustrations and game routes preserved', contentHash: hash } };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const original = parseMaster();
  const graph = JSON.parse(readFileSync(path.join(ROOT, 'scene_graph.json'), 'utf8'));
  if (process.argv.includes('--check')) console.log(JSON.stringify(validateProductionOrder(original.documents, graph)));
  else {
    const { documents, audit } = reorderProduction(original, graph);
    console.log(JSON.stringify(audit, null, 2));
    if (process.argv.includes('--write')) {
      for (const [file, text] of documents) if (text !== original.documents.get(file)) writeFileSync(path.join(ROOT, 'docs', file), text);
      if (audit.moved) writeFileSync(path.join(ROOT, 'reviews/2026-10-02_production-specs-order.json'), JSON.stringify(audit, null, 2) + '\n');
    } else console.log('Preview only; no documents changed.');
  }
}
