// One-time migration of the interleaved screenplay. Run without --write to preview.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { ROOT, MASTER, parseMaster, deriveGraph } from './sync-canonical.mjs';

const file = path.join(ROOT, 'docs', MASTER);
const before = readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
if (before.includes('<a id="book-story"></a>') || before.includes('<!-- screenplay:split -->')) {
  console.log('The screenplay already uses the sequential layout; no changes made.');
  process.exit(0);
}
const original = parseMaster(before);
const graph = JSON.parse(readFileSync(path.join(ROOT, 'scene_graph.json'), 'utf8'));
const blockPattern = /<a id="(s-[^"]+)"><\/a>\s*<!-- import:\1:begin -->([\s\S]*?)<!-- import:\1:end -->/g;
const anchorsIn = text => [...text.matchAll(/<a id="([^"]+)"><\/a>/g)].map(m => m[1]);
const idsIn = text => [...text.matchAll(/<!-- import:([^:]+):begin -->/g)].map(m => m[1]);
const heading = text => text.match(/^#{1,6} (.+)$/m)?.[1] || '';
const isScene = id => /^\[/.test(heading(original.blocks.get(id)));
const official = id => /^s-09(?:0[3-9]|10)-/.test(id);
const stripMarkup = text => text.replace(/<a id="[^"]+"><\/a>/g, '').replace(/^#{1,6} .*$/gm, '').replace(/^---$/gm, '').trim();
const wrap = id => `<a id="${id}"></a>\n\n<!-- import:${id}:begin -->\n${original.blocks.get(id)}\n<!-- import:${id}:end -->`;
const chunk = ids => ids.map(wrap).join('\n\n');
const anchor = id => `<a id="${id}"></a>`;
const aliases = new Map();
const deleted = [];
const movedRoomNotes = new Set();
const roomOwners = new Map();
const storyIds = new Set();
const actNames = ['序幕 · 雨夜與地底', '第一幕 · 門面與棚', '第二幕 · 產線', '第三幕 · 技術核心', '第四幕 · 校正區', '第五幕 · 我也是被逼的', '第六幕 · 上層與回返', '終幕 · 頂層的地板'];
const acts = [];
for (let act = 0; act < 8; act++) {
  const start = before.indexOf(anchor(`act-${act}`));
  const end = before.indexOf(anchor(act === 7 ? 'appendix-illustrations' : `act-${act + 1}`), start + 1);
  const raw = before.slice(start, end);
  const roomStarts = [...raw.matchAll(/^<a id="node-([a-z0-9]+)"><\/a>$/gm)];
  const tailStart = raw.search(/^### (?:上部|下部)・[^\n]+：幕尾、配音與待審$/m);
  assert(roomStarts.length && tailStart > roomStarts.at(-1).index, `Act boundaries: ${act}`);
  const rooms = roomStarts.map((match, i) => {
    const id = match[1];
    const body = raw.slice(match.index, roomStarts[i + 1]?.index ?? tailStart);
    const title = body.match(/^### (.+)$/m)[1];
    const navStart = body.indexOf(anchor(`node-${id}-nav`));
    const scriptStart = body.indexOf(anchor(`node-${id}-script`));
    const visualStart = body.indexOf(anchor(`node-${id}-visual`));
    assert(navStart > 0 && scriptStart > navStart && visualStart > scriptStart, id);
    const scripts = idsIn(body.slice(scriptStart, visualStart));
    const sceneIds = scripts.filter(key => isScene(key) || key === 's-0910-39');
    assert(sceneIds.length, `No narrative: ${id}`);
    sceneIds.forEach(key => storyIds.add(key));
    const notes = scripts.filter(key => !sceneIds.includes(key));
    notes.forEach(key => movedRoomNotes.add(key));
    idsIn(body).forEach(key => roomOwners.set(key, `node-${id}-${notes.includes(key) ? 'script' : 'spec'}`));
    return { id, title, sceneIds, notes,
      nav: body.slice(navStart, scriptStart).trim(),
      material: body.slice(visualStart).trim() };
  });
  const extras = idsIn(raw.slice(0, roomStarts[0].index) + '\n' + raw.slice(tailStart));
  const leadScenes = idsIn(raw.slice(0, roomStarts[0].index)).filter(isScene);
  const endScenes = idsIn(raw.slice(tailStart)).filter(isScene);
  [...leadScenes, ...endScenes].forEach(key => storyIds.add(key));
  acts.push({ act, rooms, leadScenes, endScenes, extras: extras.filter(key => !storyIds.has(key)) });
}
assert.equal(acts.flatMap(act => act.rooms).length, 48);

function sceneText(ids) {
  return chunk(ids);
}

const front = `---
文件: 09-14 全劇本與關卡整合稿
狀態: 正式劇本順讀版（待審）；未完成實機驗收
更新: 2026-09-30
摘要: 序幕至終幕連續正文；逐房動線、解謎、圖像與驗收集中於後半部，共用設定與完整年表置於附錄。
---

# 灰燈寨：正式劇本與製作規格

${anchor('book-start')}

正文依玩家經歷排列；歷史事件仍在取得證據時揭露。選填、回訪與互斥分支依各場前置閱讀，不代表全部依次發生。場次 ID 保留作製作定位，不按編號重新排序。

本檔是唯一修改來源。台詞、演出與揭露順序見正文；解法、數值、狀態及交付條件見同檔製作規格；完整真相見附錄。文件待審，未核字原件、配音、美術與實機驗收不因整併而視為完成。

${anchor('book-toc')}

## 閱讀目錄

| 劇情正文 | 場景 |
| --- | --- |
${acts.map(({ act, rooms }) => `| [${actNames[act]}](#act-${act}) | ${rooms.map(room => `[${room.id.toUpperCase().replace(/B$/, 'b')}](#node-${room.id})`).join('、')} |`).join('\n')}

[逐房製作規格](#book-specs) · [圖像索引](#book-illustrations) · [共用附錄](#book-appendices) · [未完成與驗收](#book-pending)

${anchor('book-story')}

## 第一部：劇情正文
`;
const story = acts.map(({ act, rooms, leadScenes, endScenes }) => `
${anchor(`act-${act}`)}

## ${actNames[act]}

${leadScenes.length ? '### 下部入口\n\n' + sceneText(leadScenes) : ''}

${rooms.map(room => `${anchor(`node-${room.id}`)}\n${anchor(`node-${room.id}-script`)}\n\n### ${room.title}\n\n[製作規格](#node-${room.id}-spec)\n\n${room.id === 'r32' ? '> 共用揭露與三拍防禦完成後，A～E 關係行動擇一；不是五條路線依次重演。\n\n' : ''}${room.id === 'r33' ? '> 只呈現已提交分支對應的人物後果，不再選一次結局。\n\n' : ''}${sceneText(room.sceneIds)}`).join('\n\n')}

${endScenes.length ? anchor(`act-${act}-outro`) + '\n\n### 幕尾\n\n' + sceneText(endScenes) : ''}
`).join('\n');

const specs = `${anchor('book-specs')}

## 第二部：逐房製作規格

台詞與演出只以第一部正式場次為準。本部保留動線、解法、失敗處理、保存、素材及驗收；摘要與圖版不新增演出或必做操作。

${anchor('book-illustrations')}

### 場景與圖像索引

${acts.map(({ act, rooms }) => `- [${actNames[act]}](#spec-act-${act})：${rooms.map(room => `[${room.id.toUpperCase().replace(/B$/, 'b')}](#node-${room.id}-visual)`).join('、')}`).join('\n')}

圖像仍引用原 assets 檔案，不刪除圖片。跨房圖只使用逐房指定面板；概念圖上的字、身分與號碼不能取代正式原件。L02 等既有待修圖事項仍須驗收。

${acts.map(({ act, rooms, extras }) => `${anchor(`spec-act-${act}`)}\n\n## ${actNames[act]}：製作規格\n\n${rooms.map(room => `${anchor(`node-${room.id}-spec`)}\n\n### ${room.title}\n\n[正式場次](#node-${room.id}-script)\n\n${room.nav}\n<!-- navigation:${room.id}:end -->\n\n${room.notes.length ? '**演出限制與製作註記**\n\n' + chunk(room.notes) + '\n\n' : ''}${room.material}`).join('\n\n')}\n\n### 本幕共通規格與交付\n\n${chunk(extras)}`).join('\n\n')}
`;

let appendix = before.slice(before.indexOf(anchor('appendix-illustrations')), before.indexOf(anchor('book-sources')));
appendix = appendix.replace('本區只放跨幕流程、移動、介面與主角美術基準。場景專用圖已放到正式劇本旁；各圖原始說明仍在同一份文件，不必另開舊章。', '本區放跨幕共用圖；逐房圖像集中於第二部對應場景。圖片只作製作參考，不提前顯示給玩家。');
const pending = before.slice(before.indexOf(anchor('book-pending')), before.indexOf(anchor('book-completeness')));
const unfinished = before.slice(before.indexOf('### 尚未完成的內容'), before.indexOf(anchor('book-payoffs')));
const payoffs = before.slice(before.indexOf(anchor('book-payoffs')), before.indexOf(anchor('book-toc')));
let result = front + story + specs + '\n' + anchor('book-appendices') + '\n\n## 第三部：共用附錄\n\n' + appendix + '\n' + pending + '\n' + anchor('book-completeness') + '\n\n' + unfinished + '\n' + payoffs + '\n' + anchor('book-maintenance') + `

## 維護與閱讀邊界

本檔集中正式劇情與必要製作規格；分類副本由同步工具產生，舊章只保留相容入口。歷史修訂與檢查結果留在 Git、archive 及 reviews，不再混入劇情正文。

脅迫受困者誘騙朋友、綁架、拘禁與強迫接收不等於自願入園；受困身分與後來的加害責任分開查證。製作端完整年表不自動成為玩家已知資訊。
`;

function retire(id, text, target, reason) {
  aliases.set(id, target);
  anchorsIn(text).forEach(key => aliases.set(key, target));
  deleted.push({ id, reason, target });
  return '';
}
const originalCoverage = idsIn(result);
assert.equal(originalCoverage.length, original.blocks.size, 'Every old block must first be allocated');
assert.equal(new Set(originalCoverage).size, original.blocks.size, 'A block was allocated twice');

result = result.replace(blockPattern, (whole, id, raw) => {
  let text = raw.trim();
  if (storyIds.has(id)) return whole;
  if (!stripMarkup(text)) return retire(id, text, roomOwners.get(id) || 'book-maintenance', 'empty or duplicate heading');
  if (id === 's-0903-29') return retire(id, text, 'book-first-play', 'historical completed self-check');
  if (id === 's-0900-3') {
    text = text.slice(text.indexOf(anchor('h-0900-34')));
    aliases.set('h-0900-15', 'h-0900-34');
  }
  if (id === 's-0900-4') {
    text = text.replace('正式劇本使用以下格式，一個節點一節：\n\n', '').replace(/~~~text\n[\s\S]*?~~~\n*/, '');
  }
  if (movedRoomNotes.has(id)) text = text.replace(/^#### .+$/m, '#### 演出限制');
  text = text.replace(/^>.*(?:舊索引或排程參考|以下為.+演出層|逐場演出、逐字台詞).*(?:\n|$)/gm, '');
  text = text.replace(/^原文：.+(?:\n|$)/gm, '');
  text = text.replace(/^> \*\*製作導覽：\*\*先在 docs_viewer.+(?:\n|$)/gm, '');
  text = text.replace(/^逐房規格已整合至 .+(?:\n|$)/gm, '');
  text = text.replace('適用卷首「整合後的優先規則」', '依第一部正式演出、第二部製作規格及第三部共用附錄分工');
  return `${anchor(id)}\n\n<!-- import:${id}:begin -->\n${text.trim()}\n<!-- import:${id}:end -->`;
});

// Repeated production paragraphs become references; dialogue in actual scenes is untouched.
const seenParagraphs = new Map();
let duplicateParagraphs = 0;
let duplicateCharacters = 0;
result = result.replace(blockPattern, (whole, id, raw) => {
  if (storyIds.has(id) || /```|~~~/.test(raw)) return whole;
  const text = raw.trim().split(/\n\s*\n/).map(paragraph => {
    if (paragraph.length < 100 || paragraph.includes('<a id=') || paragraph.startsWith('#')) return paragraph;
    if (!seenParagraphs.has(paragraph)) { seenParagraphs.set(paragraph, id); return paragraph; }
    const first = seenParagraphs.get(paragraph);
    if (first === id) return paragraph;
    duplicateParagraphs++;
    duplicateCharacters += paragraph.length;
    return `共用規則見[對應條款](#${first})。`;
  }).join('\n\n');
  return `${anchor(id)}\n\n<!-- import:${id}:begin -->\n${text}\n<!-- import:${id}:end -->`;
});

const currentIds = new Set(idsIn(result));
for (const source of original.sources) {
  const candidates = source.blocks.filter(block => currentIds.has(block.id));
  const target = candidates[0]?.id || (/^07a/.test(source.id) ? 'appendix-av' : 'book-maintenance');
  aliases.set(`doc-${source.id}`, /^09(?:0[3-9]|10)$/.test(source.id) ? `act-${Number(source.id.slice(2)) - 3}` : target);
  for (const block of source.blocks.filter(block => !currentIds.has(block.id))) {
    if (aliases.get(block.id) === 'book-maintenance') {
      aliases.set(block.id, target);
      anchorsIn(block.text).forEach(key => { if (aliases.get(key) === 'book-maintenance') aliases.set(key, target); });
    }
  }
}
aliases.set('book-sources', 'book-maintenance');
aliases.set('book-exclusions', 'book-maintenance');
const existing = new Set(anchorsIn(result));
for (const old of original.anchors) if (!existing.has(old) && !aliases.has(old)) aliases.set(old, 'book-maintenance');
const byTarget = new Map();
for (const [id, initialTarget] of aliases) {
  if (existing.has(id)) continue;
  let target = initialTarget;
  const visited = new Set([id]);
  while (!existing.has(target) && aliases.has(target)) {
    assert(!visited.has(target), `Alias cycle: ${id}`);
    visited.add(target);
    target = aliases.get(target);
  }
  assert(existing.has(target), `Alias target missing: ${id} -> ${target}`);
  const list = byTarget.get(target) || [];
  list.push(id);
  byTarget.set(target, list);
}
for (const [target, ids] of byTarget) result = result.replace(anchor(target), ids.map(anchor).join('\n') + '\n' + anchor(target));
const manifest = original.sources.map(source => ({ id: source.id, path: source.path,
  indices: source.blocks.filter(block => currentIds.has(block.id)).map(block => Number(block.id.split('-').at(-1))) }));
result += '\n' + manifest.map(source => `<!-- canonical-source: ${JSON.stringify(source)} -->`).join('\n') + '\n';
result = result.replace(/\n{4,}/g, '\n\n\n').trimEnd() + '\n';
const after = parseMaster(result);
assert.equal(anchorsIn(result).length, after.anchors.size, 'Unique anchors');
for (const id of original.anchors) assert(after.anchors.has(id), `Lost anchor: ${id}`);
for (const id of storyIds) assert.equal(after.blocks.get(id), original.blocks.get(id), `Changed narrative: ${id}`);
assert.deepEqual(deriveGraph(after, graph), graph, 'Navigation and ending order must not change');
assert.deepEqual([...result.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)].map(m => m[1]).sort(), [...before.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)].map(m => m[1]).sort(), 'Image inventory');
const stats = { beforeLines: before.split('\n').length, afterLines: result.split('\n').length,
  beforeCharacters: before.length, afterCharacters: result.length, scenesPreserved: storyIds.size,
  beforeBlocks: original.blocks.size, afterBlocks: after.blocks.size,
  duplicateParagraphs, duplicateCharacters, deleted, anchors: after.anchors.size };
console.log(JSON.stringify({ ...stats, deleted: deleted.length }, null, 2));
if (process.argv.includes('--write')) {
  writeFileSync(file, result);
  writeFileSync(path.join(ROOT, 'reviews', '2026-09-30_screenplay-reorder.json'), JSON.stringify(stats, null, 2) + '\n');
}
