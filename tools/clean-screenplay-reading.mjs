// One-time separation of editorial notes from the sequential screenplay.
// Preview by default; --write applies the mechanical migration.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { ACTS } from './screenplay-files.mjs';
import { ROOT, parseMaster, deriveGraph } from './sync-canonical.mjs';

const master = parseMaster();
const documents = new Map(master.documents);
const graph = JSON.parse(readFileSync(path.join(ROOT, 'scene_graph.json'), 'utf8'));
const additions = new Map();
const report = [];
const removedTags = new Set(['禁止', '製作', '製作註', '錄音註', '保存', '排程', '抑制']);
const annotations = /(?:\*\*)?【((?:鎖定|新增|沿用待審)[^】]*)】(?:\*\*)?/g;

function readableAnnotation(_, value) {
  const parts = value.split('；').slice(1).filter(part =>
    !/^(?:待審|無聲|共用|結論|共用關聯完成|三格共用回饋|\d{2}-\d{2} 結論)$/.test(part));
  return parts.length ? `（${parts.map(part => part.replace(/待審$/, '')).join('；')}）` : '';
}

function replaceBlock(text, id, replacement) {
  const start = `<!-- import:${id}:begin -->`;
  const end = `<!-- import:${id}:end -->`;
  assert.equal(text.split(start).length, 2, id);
  const from = text.indexOf(start) + start.length;
  const to = text.indexOf(end, from);
  assert(to > from, id);
  return text.slice(0, from) + '\n' + replacement.trim() + '\n' + text.slice(to);
}

for (const act of ACTS) {
  const original = documents.get(act.path);
  const boundary = original.indexOf(`<a id="spec-act-${act.act}">`);
  assert(boundary > 0, act.path);
  const story = original.slice(0, boundary);
  const roomStarts = [...story.matchAll(/<a id="node-([a-z0-9]+)-script"><\/a>/g)];
  const counts = { act: act.name, prohibitions: 0, productionNotes: 0, editorialLabels: 0 };
  let revised = story.replace(/<!-- import:([^:]+):begin -->([\s\S]*?)<!-- import:\1:end -->/g,
    (whole, id, body, offset) => {
      const room = roomStarts.findLast(item => item.index < offset)?.[1] || roomStarts[0][1];
      const levelStart = original.indexOf(`<a id="node-${room}-level">`);
      assert(levelStart > boundary, room);
      const target = original.slice(levelStart).match(/<!-- import:([^:]+):begin -->/)?.[1];
      assert(master.blocks.has(target), `${room} production block`);
      const lines = body.split('\n');
      const kept = [];
      for (let i = 0; i < lines.length; i++) {
        const note = lines[i].match(/^〔([^〕]+)〕(.*)$/);
        if (!note || !removedTags.has(note[1])) { kept.push(lines[i]); continue; }
        const content = [note[2]];
        while (i + 1 < lines.length && /^(?:[-*] |[ \t\u3000]{2,})\S/.test(lines[i + 1])) content.push(lines[++i]);
        if (note[1] === '禁止') { counts.prohibitions++; continue; }
        // This line is navigation, not an implementation instruction.
        if (/^詳見\[通路製作規格\]/.test(note[2])) {
          kept.push(note[2].replace(/^詳見/, '').replace(/。$/, ''));
          continue;
        }
        counts.productionNotes++;
        const notes = additions.get(target) || [];
        notes.push({ id, content: content.join('\n').trim() });
        additions.set(target, notes);
      }
      const clean = kept.join('\n').replace(annotations, (...args) => {
        counts.editorialLabels++;
        return readableAnnotation(...args);
      }).replace(/（(?:新增待審|新增，待審|待審)）/g, '')
        .replace(/\n{3,}/g, '\n\n');
      assert(/^#### /m.test(clean), `Retain beat: ${id}`);
      return `<!-- import:${id}:begin -->${clean}<!-- import:${id}:end -->`;
    });
  documents.set(act.path, revised + original.slice(boundary));
  report.push(counts);
}

for (const [target, notes] of additions) {
  const file = master.anchorFiles.get(target);
  const supplement = '\n\n##### 操作與呈現補充\n\n' + notes
    .map(note => `- [${note.id}](#${note.id})：${note.content}`).join('\n');
  documents.set(file, replaceBlock(documents.get(file), target, master.blocks.get(target) + supplement));
}

const revised = parseMaster([...documents.values()].join('\n\n'), documents);
assert.equal(revised.blocks.size, master.blocks.size);
assert.deepEqual([...revised.anchors].sort(), [...master.anchors].sort());
assert.deepEqual(deriveGraph(revised, structuredClone(graph)), graph, 'No route or gate changes');
for (const act of ACTS) {
  const text = documents.get(act.path);
  const story = text.slice(0, text.indexOf(`<a id="spec-act-${act.act}">`));
  assert(!/^〔(?:禁止|製作|製作註|錄音註|保存|排程|抑制)〕/m.test(story), act.path);
}
const changed = [...documents].filter(([file, text]) => text !== master.documents.get(file));
console.log(JSON.stringify({ write: process.argv.includes('--write'), changed: changed.length, acts: report }, null, 2));
if (process.argv.includes('--write')) {
  for (const [file, text] of changed) writeFileSync(path.join(ROOT, 'docs', file), text, 'utf8');
}
