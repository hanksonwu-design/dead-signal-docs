// One-time, loss-checked migration. Preview by default; --write applies it.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { ROOT, parseMaster, rewriteLinks } from './sync-canonical.mjs';
import { MASTER, APPENDIX, ACTS, SPLIT_MARKER } from './screenplay-files.mjs';

const read = file => readFileSync(path.join(ROOT, 'docs', file), 'utf8').replace(/\r\n/g, '\n');
const before = read(MASTER);
if (before.includes(SPLIT_MARKER)) {
  console.log('The screenplay is already split by act; no changes made.');
  process.exit(0);
}
const original = parseMaster(before);
const anchor = id => `<a id="${id}"></a>`;
const at = id => {
  const position = before.indexOf(anchor(id));
  assert(position >= 0, `Missing boundary: ${id}`);
  return position;
};
const fileName = file => path.posix.basename(file);
const header = (title, summary) => `---\n文件: ${title}\n狀態: 正式劇本分幕版（待審）；未完成實機驗收\n更新: 2026-09-30\n摘要: ${summary}\n---\n\n`;
const link = (label, file, id) => `[${label}](${fileName(file)}${id ? '#' + id : ''})`;
const nav = act => [
  link('總目錄', MASTER, 'book-toc'),
  ...(act > 0 ? [link(`上一幕：${ACTS[act - 1].name}`, ACTS[act - 1].path, `act-${act - 1}`)] : []),
  ...(act < 7 ? [link(`下一幕：${ACTS[act + 1].name}`, ACTS[act + 1].path, `act-${act + 1}`)] : []),
  link('共用附錄', APPENDIX, 'book-appendices'),
].join(' · ');
const documents = new Map();
const manifest = [...before.matchAll(/^<!-- canonical-source: .* -->$/gm)].map(m => m[0]).join('\n');
const table = before.slice(at('book-toc'), at('book-story')).replace(/\n\[逐房製作規格\][^\n]+/, '');
const figures = before.slice(at('book-illustrations'), at('spec-act-0'));
documents.set(MASTER, header('遊戲劇本 · 總目錄', '序幕至終幕分幕閱讀；各幕包含正文、製作規格與圖像，共用設定集中於附錄。') +
  `${SPLIT_MARKER}\n\n# 灰燈寨：遊戲劇本總目錄\n\n${anchor('book-start')}\n\n` +
  '正式內容由八份分幕文件與一份共用附錄組成。每幕先讀劇情正文，再查該幕製作規格；跨幕共用設定只在附錄維護。本頁僅作導覽，不保留另一份整合正文。\n\n' +
  '正文依玩家經歷排列；歷史事件仍在取得證據時揭露。選填、回訪與互斥分支依各場前置閱讀，不代表全部依次發生。場次 ID 沿用原編號。\n\n' +
  `${anchor('book-story')}\n\n${table.trim()}\n\n` +
  `${anchor('book-specs')}\n\n## 製作規格與圖像\n\n` +
  '各幕規格位於該幕正文後。台詞、演出、解法、數值、狀態與素材在對應幕別修訂；分類副本由同步工具產生。\n\n' +
  `${figures.trim()}\n\n## 共用設定與驗收\n\n` +
  `${link('共用附錄', APPENDIX, 'book-appendices')} · ${link('待審與驗收', APPENDIX, 'book-pending')} · ${link('未完成原件與素材', APPENDIX, 'book-completeness')}\n\n` +
  `文件待審；未核字原件、配音、美術與實機驗收不因拆分而視為完成。\n\n${manifest}\n`);

const stats = [];
for (const item of ACTS) {
  const { act, name, subtitle } = item;
  const startId = `doc-${String(act + 903).padStart(4, '0')}`;
  const nextId = act === 7 ? 'book-specs' : `doc-${String(act + 904).padStart(4, '0')}`;
  const story = before.slice(at(startId), at(nextId)).trim();
  const specs = before.slice(at(`spec-act-${act}`), at(act === 7 ? 'book-appendices' : `spec-act-${act + 1}`)).trim();
  const rooms = [...story.matchAll(/<a id="node-([a-z0-9]+)-script"><\/a>/g)].map(m => m[1]);
  const contents = rooms.map(id => `[${id.toUpperCase().replace(/B$/, 'b')}](#node-${id}-script)`).join('、');
  documents.set(item.path, header(`遊戲劇本 · ${name} · ${subtitle}`, `${name}正文、逐房動線、解謎、圖像與驗收；共用設定另見附錄。`) +
    `# 遊戲劇本：${name}\n\n${nav(act)}\n\n` +
    `${contents} · [本幕製作規格](#spec-act-${act})\n\n${story}\n\n` +
    `${anchor(`act-${act}-continue`)}\n\n${nav(act)}\n\n` +
    `---\n\n${specs}\n\n${nav(act)}\n`);
  stats.push({ act, file: item.path, rooms: rooms.length, narrativeSections: [...story.matchAll(/<!-- import:[^:]+:begin -->/g)].length });
}
const structureNotes = text => text
  .replace('#### 一、同一份文件內的規格分工', '#### 一、分幕文件與共用附錄的規格分工')
  .replace('本稿同時承接原 06 與 09 的責任，依第一部正式演出、第二部製作規格及第三部共用附錄分工。', '本套正式劇本同時承接原 06 與 09 的責任：各幕文件前半部為正式演出，後半部為該幕製作規格；跨幕共用設定另由共用附錄維護。');
let appendix = structureNotes(before.slice(at('book-appendices')).replace(/^<!-- canonical-source: .* -->\n?/gm, '').trim());
appendix = appendix.replace('## 第三部：共用附錄', '## 共用附錄')
  .replace('逐房圖像集中於第二部對應場景', '逐房圖像集中於各幕文件後半部的對應場景')
  .replace('本檔集中正式劇情與必要製作規格；分類副本由同步工具產生，舊章只保留相容入口。', '各幕文件維護正式劇情與逐房製作規格，本檔只維護跨幕共用設定；分類副本由同步工具產生，舊關卡與其他退役章節只保留相容入口。');
const appendixSections = [...appendix.matchAll(/<a id="(appendix-[^"]+)"><\/a>\s*\n\s*## ([^\n]+)/g)];
documents.set(APPENDIX, header('遊戲劇本 · 共用附錄', '跨幕設定、完整年表、線索字表、共用玩法、圖版與驗收；含完整真相。') +
  `# 遊戲劇本：共用附錄\n\n${link('總目錄', MASTER, 'book-toc')}\n\n` +
  '本檔含製作端完整設定與真相；玩家資訊仍依各幕正式場次逐步揭露。\n\n' +
  appendixSections.map(m => `- [${m[2]}](#${m[1]})`).join('\n') + `\n\n${appendix}\n`);

let split = parseMaster([...documents.values()].join('\n\n'), documents);
const warnings = [];
const titleLabels = text => text.replace(/^(#{1,6} )正式劇本(?= ·)/gm, '$1遊戲劇本');
for (const [file, content] of documents) documents.set(file, rewriteLinks(titleLabels(content), file, split, warnings));
assert.deepEqual(warnings, [], 'Unresolved links during split');
split = parseMaster([...documents.values()].join('\n\n'), documents);
for (const id of original.anchors) assert(split.anchors.has(id), `Lost anchor: ${id}`);
assert.equal(split.blocks.size, original.blocks.size);
for (const [id, body] of original.blocks) {
  assert.equal(split.blocks.get(id), titleLabels(structureNotes(rewriteLinks(body, split.anchorFiles.get(id), split))), `Changed content: ${id}`);
}
const images = text => [...text.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)].map(m => m[1]).sort();
assert.deepEqual(images(split.text), images(before), 'Image inventory changed');
assert.equal(stats.reduce((sum, act) => sum + act.rooms, 0), 48);
assert.equal(stats.reduce((sum, act) => sum + act.narrativeSections, 0), 342);
assert(!documents.get(MASTER).includes('<!-- import:'));
const audit = { documents: documents.size, retainedBlocks: split.blocks.size, retainedOriginalAnchors: original.anchors.size, images: images(split.text).length, acts: stats };
console.log(JSON.stringify(audit, null, 2));
if (process.argv.includes('--write')) {
  for (const [file, content] of documents) writeFileSync(path.join(ROOT, 'docs', file), content);
  writeFileSync(path.join(ROOT, 'reviews/2026-09-30_screenplay-split.json'), JSON.stringify(audit, null, 2) + '\n');
  console.log('Split written. Run sync-canonical.mjs and build-docs.mjs next.');
} else console.log('Preview only; no files changed.');
