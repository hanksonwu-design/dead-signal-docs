import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { ACTS } from './screenplay-files.mjs';
import { ROOT, parseMaster, deriveGraph } from './sync-canonical.mjs';

const file = path.join(ROOT, 'docs/08_製作管理/08-13_劇情節點與場景道具總表.md');
const original = readFileSync(file, 'utf8').replaceAll('\r\n', '\n');
const master = parseMaster();
const graph = JSON.parse(readFileSync(path.join(ROOT, 'scene_graph.json'), 'utf8'));
assert.deepEqual(graph, deriveGraph(master, structuredClone(graph)), 'Sync the canonical scene graph first');
const cell = value => String(value).replaceAll('|', '／').replaceAll('\n', ' ');
const link = (label, source, anchor) => `[${cell(label)}](../${source}#${anchor})`;
const table = (headers, rows) => [headers, headers.map(() => '---'), ...rows]
  .map(row => `| ${row.map(cell).join(' | ')} |`).join('\n');

function section(text, name) {
  const start = `<!-- inventory:${name}:begin -->`;
  const end = `<!-- inventory:${name}:end -->`;
  assert.equal(text.split(start).length, 2, `${name} start marker`);
  assert.equal(text.split(end).length, 2, `${name} end marker`);
  const from = text.indexOf(start) + start.length;
  const to = text.indexOf(end);
  assert(to > from, `${name} marker order`);
  return { from, to, content: text.slice(from, to) };
}

const sceneSection = section(original, 'scenes').content;
const sceneIds = [...sceneSection.matchAll(/^\| \[([A-Z]+\d*b?) · /gm)].map(match => match[1]);
assert.deepEqual(sceneIds, graph.nodes.map(node => node.id), 'Scene rows must cover the graph once, in order');
for (const node of graph.nodes) {
  assert(sceneSection.includes(`](../${node.source}#node-${node.id.toLowerCase()}-script)`), `Scene source ${node.id}`);
}

const indexedActs = ACTS.map(act => {
  const document = master.documents.get(act.path);
  const cutoff = document.indexOf(`<a id="spec-act-${act.act}"></a>`);
  assert(cutoff > 0, `Production boundary ${act.path}`);
  const story = document.slice(0, cutoff);
  const beats = [...story.matchAll(/<!-- import:([^:]+):begin -->([\s\S]*?)<!-- import:\1:end -->/g)]
    .flatMap(match => {
      const heading = match[2].match(/^#### (.+)$/m)?.[1];
      if (!heading) return [];
      assert(master.anchorFiles.get(match[1]) === act.path, `Beat owner ${match[1]}`);
      const code = heading.match(/^\[([^\]]+)\]\s*(.*)$/);
      return [{ anchor: match[1], code: code?.[1] || 'POST', title: code?.[2] || heading }];
    });
  assert(beats.length, `No beats in ${act.path}`);
  return { ...act, beats, nodes: graph.nodes.filter(node => node.act === act.act) };
});
const beatIds = indexedActs.flatMap(act => act.beats.map(beat => beat.anchor));
assert.equal(new Set(beatIds).size, beatIds.length, 'No duplicate story blocks');
assert.equal(new Set(graph.edges.map(edge => edge.id)).size, graph.edges.length, 'No duplicate routes');

// These namespaces are separate from encounter IDs and art-layer codes.
const evidence = [
  ...[0, 1, 2, 3, 4, 5, 6].flatMap((tier, i) => Array.from({ length: [2, 16, 15, 8, 7, 8, 2][i] },
    (_, n) => `E${tier}-${String(n + 1).padStart(2, '0')}`)),
  ...['A', 'B', 'C', 'D'].map(letter => `E4-00-${letter}`), 'M6-01', 'S6-01', 'S6-02', 'S6-03',
];
for (const id of evidence) {
  assert(original.includes(`| ${id} |`), `Missing evidence row ${id}`);
  assert(master.text.includes(id), `Evidence source ${id}`);
}
for (let number = 1; number <= 15; number++) assert(original.includes(`| #${number} |`), `Missing signal #${number}`);
assert(original.includes('| #4′ |'), 'Alternative signal #4');
for (const [prefix, numbers] of Object.entries({ CARE: [1, 2, 3, 4], MC: [1, 2, 3], MU: [2], PT: [1, 2, 3], SG: [1, 2, 3], KX: [1, 2, 3], MR: [1, 2] })) {
  for (const number of numbers) assert(original.includes(`${prefix}-${String(number).padStart(2, '0')}`), `Missing side source ${prefix}-${number}`);
}
for (const id of ['K0-01', 'K1-01', 'K2-01', 'F1', 'F2', 'F3', 'F4', 'F5']) {
  assert(original.includes(`| ${id} |`), `Missing key/code ${id}`);
}
const transitions = [...original.matchAll(/^\| (T-[A-Z0-9]+-[A-Z0-9]+) \| (\d+) \|/gm)];
assert.equal(transitions.length, 7, 'Seven transition rows');
assert.equal(transitions.reduce((sum, match) => sum + Number(match[2]), 0), 13, 'Thirteen transition compositions');
assert.equal(new Set(transitions.map(match => match[1])).size, 7, 'No duplicate transitions');
for (const match of transitions) assert(master.text.includes(match[1]), `Transition source ${match[1]}`);

const summary = `**盤點範圍：${ACTS.length} 幕（含序幕、終幕）、${graph.nodes.length} 個導覽節點、${beatIds.length} 段正文場次、${graph.edges.length} 條登記動線。**\n\n` +
  table(['幕別', '節點數', '正文場次數', '節點範圍'], indexedActs.map(act => [
    link(act.name, act.path, `act-${act.act}`), act.nodes.length, act.beats.length,
    act.nodes.map(node => node.id).join('、'),
  ]));
let ordinal = 0;
const beats = indexedActs.map(act => `### ${act.name}：${act.subtitle}\n\n` +
  table(['全劇序', '原場次代碼', '劇情段落／正文來源'], act.beats.map(beat => [
    ++ordinal, `\`${beat.code}\``, link(beat.title, act.path, beat.anchor),
  ]))).join('\n\n');

// Group by source-node story order without changing each node's edge order.
const orderedEdges = graph.nodes.flatMap(node => graph.edges.filter(edge => edge.fromId === node.id));
assert.equal(orderedEdges.length, graph.edges.length, 'All route origins exist');
const routes = table(['動線／來源', '類型', '進入或離房條件', '回訪邊界'], orderedEdges.map(edge => {
  const destination = graph.nodes.find(node => node.id === edge.toId);
  assert(destination, `Route destination ${edge.id}`);
  const anchor = `node-${destination.id.toLowerCase()}-spec`;
  assert(master.anchors.has(anchor), `Route source anchor ${anchor}`);
  return [link(`${edge.fromId}→${edge.toId}`, destination.source, anchor), edge.kind, edge.gate,
    `${edge.back ? '可回訪' : '單向／條件回返'}：${edge.returnRule}`];
}));

let output = original;
for (const [name, content] of Object.entries({ summary, beats, routes })) {
  const { from, to } = section(output, name);
  output = output.slice(0, from) + '\n\n' + content + '\n\n' + output.slice(to);
}
const changed = output !== original;
if (process.argv.includes('--check')) {
  assert(!changed, 'Story inventory is stale; run node tools/build-story-inventory.mjs');
} else if (changed) {
  writeFileSync(file, output);
}
console.log(`Story inventory ${changed ? 'updated' : 'verified'}: ${graph.nodes.length} nodes, ${beatIds.length} beats, ${graph.edges.length} routes, ${evidence.length} evidence/source rows; signal and side-source coverage checked`);
