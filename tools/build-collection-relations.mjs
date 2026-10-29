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
  const partOf = new Map(graph.nodes.map(node => [node.id, node.part]));
  const acts = graph.acts.map((name, act) => ({ act, name: name.split('／')[0].replace(/^[上下]部・/, ''), title: name }));
  const parts = graph.parts.map((name, index) => ({
    part: index + 1, name,
    acts: [...new Set(graph.nodes.filter(node => node.part === index + 1).map(node => node.act))].sort((a, b) => a - b),
  }));
  const register = text.split('\n## 三、')[1]?.split('\n## 四、')[0];
  assert(register, 'Missing evidence register');

  // Overview rows describe every group's board, sources and outcome.
  const overview = new Map();
  for (const line of register.split('### 關聯總覽')[1].split('\n### ')[0].split('\n')) {
    if (!line.startsWith('| [')) continue;
    const [first, release, board, sources, outcome] = cellsOf(line);
    overview.set(first.match(/\(#([^)]+)\)/)[1], { release, board, sources, outcome });
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
        ? { id: anchor.replace('collection-', ''), kind: 'board', order: Number(board[1]), title: board[2], room: board[3], act: actOf.get(board[3]), part: partOf.get(board[3]) }
        : { id: anchor.replace('collection-', ''), kind: 'chain', order: null, title: heading.replace(/（.+）$/, ''), room: null, act: null, part: null };
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
      source, room, act: actOf.get(room), part: partOf.get(room), use, nature,
      carried: slot.includes('前情帶入'), teaser: slot.includes('跨部伏筆'),
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
  const EVIDENCE_ID = '(E\\d-\\d\\d(?:-[A-D])?)';
  const known = other => { assert(byId.has(other), `Unknown evidence in relation: ${other}`); return other; };
  for (const item of evidence) {
    const owner = byGroup.get(item.group);
    if (owner.kind === 'board' && item.code !== '—') {
      if (item.code === '成果') link(owner.id, item.id, 'result');
      else link(item.id, owner.id, SUPPORT.has(item.code) ? 'support' : 'slot', item.code);
    }
    for (const segment of item.slot.split('；')) {
      const reuse = segment.match(/(?:之後|補全後)為\s*(.+?)\s*([A-E])$/);
      if (reuse) link(item.id, findGroup(reuse[1]).id, 'reuse', reuse[2]);
      if (/R31 實核/.test(segment)) link(item.id, findGroup('R31').id, 'later');
      // Script-stated relations between two evidence items, written into the 格位／關聯 cell.
      const prereq = segment.match(new RegExp(`須先(?:讀|解讀)\\s*${EVIDENCE_ID}`));
      if (prereq) link(known(prereq[1]), item.id, 'prereq');
      const alternative = segment.match(new RegExp(`與\\s*${EVIDENCE_ID}\\s*擇一`));
      if (alternative) link(item.id, known(alternative[1]), 'alternative');
      const pair = segment.match(new RegExp(`與\\s*${EVIDENCE_ID}\\s*(?:核對|時序對齊)`));
      if (pair) link(known(pair[1]), item.id, 'pair');
      const confirms = segment.match(new RegExp(`補證\\s*${EVIDENCE_ID}`));
      if (confirms) link(item.id, known(confirms[1]), 'confirms');
      for (const [, room, letter] of segment.matchAll(/(R\d+) ([A-E]) 格誘答/g)) link(item.id, findGroup(room).id, 'decoy', letter);
      // A later look-back comparison inside the same part (or a marked cross-part teaser).
      const payoff = segment.match(new RegExp(`回頭比對\\s*${EVIDENCE_ID}`));
      if (payoff) link(item.id, known(payoff[1]), 'payoff', '回頭比對');
      else if (/對照|比對/.test(segment)) {
        for (const [, other] of segment.matchAll(new RegExp(EVIDENCE_ID, 'g'))) if (other !== item.id) link(item.id, known(other), 'compare');
      }
    }
  }
  for (const owner of groups) {
    const choice = owner.note.match(/結論選擇（提交前三選一）：正解「(.+?)」；誘答「(.+?)」「(.+?)」。/);
    if (choice) owner.conclusion = { answer: choice[1], decoys: [choice[2], choice[3]] };
    const opens = owner.outcome.match(/開通 (R\d+)/);
    if (opens) link(owner.id, findGroup(opens[1]).id, 'opens');
    if (owner.kind !== 'chain') continue;
    const members = evidence.filter(item => item.group === owner.id).map(item => ({ id: item.id, code: item.code }));
    for (const [, letter, id] of owner.note.matchAll(/([A-E])（(E\d-\d\d)）列於/g)) {
      members.push({ id, code: letter });
      // A chain may borrow a member listed under a board group; record that second role on the item.
      (byId.get(id).chains ??= []).push({ group: owner.id, code: letter });
    }
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
    }
  }
  for (const { from, to } of links) assert((byId.has(from) || byGroup.has(from)) && (byId.has(to) || byGroup.has(to)), `Dangling link ${from} → ${to}`);

  // The parts ship separately: a relation may cross from 上部 into 下部 only when the prequel
  // snapshot carries the required source, or when an optional source is marked as a cross-part teaser.
  const partOfNode = id => byId.get(id)?.part ?? byGroup.get(id)?.part;
  // Decoys come from what the player already holds in that part, and the final one-slot board stays pure.
  for (const decoy of links.filter(l => l.kind === 'decoy')) {
    assert.equal(partOfNode(decoy.from), partOfNode(decoy.to), `Decoy crosses the release split: ${decoy.from} → ${decoy.to}`);
    assert.notEqual(decoy.to, findGroup('R31').id, 'R31 keeps a single slot without decoys');
  }
  for (const relation of links) {
    const [from, to] = [partOfNode(relation.from), partOfNode(relation.to)];
    if (!from || !to || from === to) continue;
    assert(from < to, `Relation runs backwards across the release split: ${relation.from} → ${relation.to}`);
    const source = byId.get(relation.from);
    assert(source, `Cross-part relation must start from a collected source: ${relation.from}`);
    assert(source.required ? source.carried : source.teaser,
      `${source.id} reaches 下部 without being carried by the prequel (required) or marked 跨部伏筆 (optional)`);
    relation.crossPart = source.required ? 'carried' : 'teaser';
  }
  for (const item of evidence.filter(item => item.carried || item.teaser)) {
    assert(links.some(l => l.from === item.id && l.crossPart), `${item.id} is marked as crossing parts but no relation crosses`);
  }
  assert(links.some(l => l.kind === 'reuse' && l.from === 'E5-01' && l.to === findGroup('R31').id), 'R27 result feeds the final board');

  // Four-system view: rooms (定點場景), signals (筆記本與訊號), route records (動線與鑰匙)
  // and the links that close the play loop: room → source → board → key → next room.
  const actByName = new Map(acts.map(a => [a.name, a.act]));
  const sceneIndex = new Map(graph.nodes.map((node, index) => [node.id, index]));
  const roomIds = new Set();
  const roomRef = id => { assert(sceneIndex.has(id), `Unknown room: ${id}`); roomIds.add(id); return `room:${id}`; };
  const systemLinks = [];
  // Both ends of a route record may name the same step (F1 → 覆寫碼 and 覆寫碼 ← F1～F5); keep one.
  const system = (from, to, kind) => {
    if (!systemLinks.some(l => l.from === from && l.to === to && l.kind === kind)) systemLinks.push({ from, to, kind });
  };
  for (const item of evidence) system(roomRef(item.room), item.id, item.witnessed ? 'found-freeze' : 'found');
  for (const group of groups.filter(g => g.kind === 'board')) roomRef(group.room);

  const signalTable = text.split('\n## 四、')[1].split('\n## 五、')[0];
  const signals = [];
  for (const line of signalTable.split('\n')) {
    if (!line.startsWith('| ') || line.startsWith('| 幕別') || line.startsWith('| ---')) continue;
    const [, index, source, use, usedIn] = cellsOf(line);
    const id = plain(index).match(/#\d+′?/)[0];
    const fromRooms = source.match(/^([A-Z]\d+b?(?:／[A-Z]\d+b?)*)\s/)[1].split('／');
    const uses = usedIn === '—' ? [] : usedIn.split('、');
    const signal = { id: `signal:${id}`, index: id, label: source.split('；')[0].replace(/^[A-Z]\d+b?(?:／[A-Z]\d+b?)*\s/, ''),
      required: index.includes('collectible-required'), source, use, act: actOf.get(fromRooms[0]), part: partOf.get(fromRooms[0]) };
    signals.push(signal);
    for (const room of fromRooms) system(roomRef(room), signal.id, 'signal-found');
    for (const room of uses) {
      assert(actOf.get(room) >= signal.act, `Signal ${id} is used before it is found: ${room}`);
      system(signal.id, roomRef(room), 'signal-use');
    }
  }
  assert.equal(new Set(signals.map(s => s.index.replace('′', ''))).size, 15, 'Fifteen signal slots');

  const keyTable = text.split('\n## 五、')[1].split('<a id="collection-lower-interactions"></a>')[0];
  const keys = [];
  for (const line of keyTable.split('\n')) {
    if (!line.startsWith('| ') || line.startsWith('| 幕別') || line.startsWith('| ---')) continue;
    const [actName, item, where, use, from, opens] = cellsOf(line);
    const label = plain(item).replace(/〔[^〕]*〕$/, '');
    const code = label.match(/K\d-\d\d|^F\d$/)?.[0];
    keys.push({ id: `key:${code ?? label}`, label, code: code ?? '', act: actByName.get(actName), where, use, from, opens });
  }
  for (const key of keys) key.part = parts.find(p => p.acts.includes(key.act)).part;
  const keyByName = name => keys.find(k => k.code === name || k.label === name);
  const resolve = token => {
    let match;
    if ((match = token.match(/^推理 (R\d+)$/))) return [findGroup(match[1]).id];
    if ((match = token.match(/^現場 ([A-Z]\d+b?)$/))) return [roomRef(match[1])];
    if ((match = token.match(/^(E\d-\d\d(?:-[A-D])?)$/))) return [known(match[1])];
    if ((match = token.match(/^F(\d)～F(\d)$/))) return Array.from({ length: match[2] - match[1] + 1 }, (_, i) => keyByName(`F${Number(match[1]) + i}`).id);
    if (/^[A-Z]\d+b?$/.test(token)) return [roomRef(token)];
    const key = keyByName(token);
    assert(key, `Unknown route token: ${token}`);
    return [key.id];
  };
  for (const key of keys) {
    for (const token of key.from.split('、')) for (const id of resolve(token)) system(id, key.id, 'produces');
    for (const token of key.opens.split('、')) for (const id of resolve(token)) {
      if (id.startsWith('room:')) assert(actOf.get(id.slice(5)) >= key.act, `${key.label} opens an earlier room: ${id}`);
      system(key.id, id, id.startsWith('room:') ? 'unlocks' : 'produces');
    }
  }
  assert.equal(keys.length, 12, 'Twelve route, credential and override records');
  const rooms = [...roomIds].sort((a, b) => sceneIndex.get(a) - sceneIndex.get(b)).map(id => {
    const node = graph.nodes.find(n => n.id === id);
    return { id: `room:${id}`, room: id, name: node.name, act: node.act, part: node.part, order: sceneIndex.get(id) };
  });

  return { version: 1, source: TABLE, parts, acts, groups, evidence, links, rooms, signals, keys, systemLinks };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const graph = JSON.parse(readFileSync(path.join(ROOT, 'scene_graph.json'), 'utf8'));
  const data = buildCollectionRelations(readFileSync(path.join(ROOT, 'docs', TABLE), 'utf8'), graph);
  // Each listed conclusion must match the choice line authored in that room's screenplay.
  for (const group of data.groups.filter(g => g.conclusion)) {
    const script = readFileSync(path.join(ROOT, 'docs', graph.nodes.find(n => n.id === group.room).source), 'utf8');
    const line = script.split(/\r?\n/).find(l => l.includes('（結論選擇）') && l.includes(`「${group.conclusion.answer}」`));
    assert(line, `${group.room}: screenplay has no conclusion choice for 「${group.conclusion.answer}」`);
    for (const decoy of group.conclusion.decoys) assert(line.includes(`「${decoy}」`), `${group.room}: screenplay choice lacks 「${decoy}」`);
  }
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
