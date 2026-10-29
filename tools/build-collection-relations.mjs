// Derives the 3D relation graph data from the collection master table (10-12).
//   node tools/build-collection-relations.mjs          rewrite collection-relations.json
//   node tools/build-collection-relations.mjs --check  fail if the JSON is stale
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TABLE = '10_製作規格/10-12_製作規格_收集物與筆記本總表.md';
const OUTPUT = path.join(ROOT, 'collection-relations.json');
const ID = /^(E\d-\d\d(?:-[A-D])?|M6-01|S6-0\d)/;
const SUPPORT = new Set(['前置', '旁證', '前片', '資料']);

const cellsOf = line => line.split('|').slice(1, -1).map(cell => cell.trim());
const plain = cell => cell.replace(/<[^>]+>/g, '').trim();

export function buildCollectionRelations(markdown, graph) {
  const text = markdown.replaceAll('\r\n', '\n');
  const actOf = new Map(graph.nodes.map(node => [node.id, node.act]));
  const acts = graph.acts.map((name, act) => ({ act, name: name.split('／')[0].replace(/^[上下]部・/, ''), title: name }));
  const register = text.split('\n## 三、')[1]?.split('\n## 四、')[0];
  assert(register, 'Missing evidence register');

  // Overview rows describe every group's board, sources and outcome.
  const overview = new Map();
  for (const line of register.split('### 關聯總覽')[1].split('\n### ')[0].split('\n')) {
    if (!line.startsWith('| [')) continue;
    const [first, board, sources, outcome] = cellsOf(line);
    overview.set(first.match(/\(#([^)]+)\)/)[1], { board, sources, outcome });
  }

  const groups = [], evidence = [];
  let group = null, anchor = '', expectNote = false;
  for (const line of register.split('\n')) {
    const anchorMatch = line.match(/^<a id="(collection-(?:board|chain)-[^"]+)"><\/a>$/);
    if (anchorMatch) { anchor = anchorMatch[1]; continue; }
    if (line.startsWith('### ')) { anchor = ''; group = null; continue; }
    if (line.startsWith('#### ')) {
      group = null;
      if (!anchor) continue;
      const heading = line.slice(5).trim();
      const board = heading.match(/^(\d+)｜(.+)（([A-Z]\d+b?)）$/);
      const meta = overview.get(anchor);
      assert(meta, `Overview row missing for ${anchor}`);
      group = board
        ? { id: anchor.replace('collection-', ''), kind: 'board', order: Number(board[1]), title: board[2], room: board[3], act: actOf.get(board[3]) }
        : { id: anchor.replace('collection-', ''), kind: 'chain', order: null, title: heading.replace(/（.+）$/, ''), room: null, act: null };
      Object.assign(group, { anchor, ...meta, note: '' });
      assert(group.kind === 'chain' || Number.isInteger(group.act), `Unknown board room: ${heading}`);
      groups.push(group);
      anchor = '';
      expectNote = true;
      continue;
    }
    if (!group) continue;
    if (expectNote && line.trim() && !line.startsWith('|')) { group.note = line.trim(); expectNote = false; continue; }
    if (!line.startsWith('| ')) continue;
    expectNote = false;
    const cells = cellsOf(line);
    const id = plain(cells[0]).match(ID)?.[1];
    if (!id) continue;
    assert.equal(cells.length, 7, `Evidence row shape: ${id}`);
    const [, code, slot, loop, source, use, nature] = cells;
    const room = source.match(/^([A-Z]\d+b?)\s/)?.[1];
    assert(actOf.has(room), `Unknown source room for ${id}: ${source}`);
    evidence.push({
      id, required: cells[0].includes('collectible-required'), group: group.id, code, slot, loop,
      witnessed: loop.includes('見證過去'), label: source.split('；')[0].replace(/^[A-Z]\d+b?\s/, ''),
      source, room, act: actOf.get(room), use, nature,
    });
  }

  const byId = new Map(evidence.map(item => [item.id, item]));
  const byGroup = new Map(groups.map(item => [item.id, item]));
  assert.equal(evidence.length, 66, 'All 66 evidence rows');
  assert.equal(byId.size, 66, 'Evidence IDs are unique');
  assert.deepEqual(groups.filter(g => g.kind === 'board').map(g => g.order), Array.from({ length: 15 }, (_, i) => i + 1));
  const findGroup = target => {
    const room = target.match(/R\d+/)?.[0];
    const match = groups.filter(g => g.kind === 'board' && (room ? g.room === room : g.title === target));
    assert.equal(match.length, 1, `Ambiguous or unknown relation target: ${target}`);
    return match[0];
  };

  const links = [];
  const link = (from, to, kind, code = '') => links.push({ from, to, kind, code });
  for (const item of evidence) {
    const owner = byGroup.get(item.group);
    if (owner.kind === 'board') {
      if (item.code === '成果') link(owner.id, item.id, 'result');
      else link(item.id, owner.id, SUPPORT.has(item.code) ? 'support' : 'slot', item.code);
    }
    for (const segment of item.slot.split('；')) {
      const reuse = segment.match(/(?:之後|補全後)為\s*(.+?)\s*([A-E])$/);
      if (reuse) link(item.id, findGroup(reuse[1]).id, 'reuse', reuse[2]);
      if (/R31 實核/.test(segment)) link(item.id, findGroup('R31').id, 'later');
      for (const [, other] of segment.matchAll(/(E\d-\d\d)/g)) {
        if (/對照/.test(segment) && other !== item.id) { assert(byId.has(other), `Unknown comparison: ${other}`); link(item.id, other, 'compare'); }
      }
    }
  }
  for (const owner of groups) {
    const opens = owner.outcome.match(/開通 (R\d+)/);
    if (opens) link(owner.id, findGroup(opens[1]).id, 'opens');
    if (owner.kind !== 'chain') continue;
    const members = evidence.filter(item => item.group === owner.id).map(item => ({ id: item.id, code: item.code }));
    for (const [, letter, id] of owner.note.matchAll(/([A-E])（(E\d-\d\d)）列於/g)) members.push({ id, code: letter });
    const lanes = new Map();
    for (const member of members) {
      const [prefix, letter] = member.code.includes('・') ? member.code.split('・') : ['', member.code];
      if (!/^[A-E]$/.test(letter) || (!prefix && !/A .+ → B/.test(owner.note))) continue;
      if (!lanes.has(prefix)) lanes.set(prefix, []);
      lanes.get(prefix).push({ ...member, letter });
    }
    for (const lane of lanes.values()) {
      lane.sort((a, b) => a.letter.localeCompare(b.letter));
      for (let i = 1; i < lane.length; i++) link(lane[i - 1].id, lane[i].id, 'chain', lane[i].letter);
      // A chain may borrow a member listed under a board group; record that second role on the item.
      for (const member of lane) {
        const item = byId.get(member.id);
        if (item.group !== owner.id) (item.chains ??= []).push({ group: owner.id, code: member.letter });
      }
    }
  }
  for (const { from, to } of links) assert((byId.has(from) || byGroup.has(from)) && (byId.has(to) || byGroup.has(to)), `Dangling link ${from} → ${to}`);
  assert(links.some(l => l.kind === 'reuse' && l.from === 'E5-01' && l.to === findGroup('R31').id), 'R27 result feeds the final board');

  return { version: 1, source: TABLE, acts, groups, evidence, links };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const graph = JSON.parse(readFileSync(path.join(ROOT, 'scene_graph.json'), 'utf8'));
  const data = buildCollectionRelations(readFileSync(path.join(ROOT, 'docs', TABLE), 'utf8'), graph);
  const json = `${JSON.stringify(data, null, 2)}\n`;
  const summary = `${data.groups.length} groups, ${data.evidence.length} evidence items, ${data.links.length} links`;
  if (process.argv.includes('--check')) {
    let current = '';
    try { current = readFileSync(OUTPUT, 'utf8').replaceAll('\r\n', '\n'); } catch { /* reported below */ }
    assert.equal(current, json, 'collection-relations.json is stale; run node tools/build-collection-relations.mjs');
    console.log(`Collection relations are up to date: ${summary}`);
  } else {
    writeFileSync(OUTPUT, json);
    console.log(`Collection relations written: ${summary}`);
  }
}
