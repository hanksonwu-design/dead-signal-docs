// One-time, loss-checked relocation. Preview by default; --write applies it.
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { ROOT, parseMaster, rewriteLinks } from './sync-canonical.mjs';
import { MASTER, APPENDIX, ACTS, CANONICAL_FILES, SPEC_SPLIT_MARKER } from './screenplay-files.mjs';

const original = parseMaster();
if (original.documents.get(MASTER).includes(SPEC_SPLIT_MARKER)) {
  console.log('Specifications are already separate; no changes made.');
  process.exit(0);
}
const documents = new Map(original.documents);
const anchor = id => `<a id="${id}"></a>`;
const link = (from, label, to, id) => `[${label}](${path.posix.relative(path.posix.dirname(from), to)}#${id})`;
const specNav = act => [
  link(act.specPath, '總目錄', MASTER, 'book-specs'),
  link(act.specPath, '本幕劇本', act.path, `act-${act.act}`),
  ...(act.act > 0 ? [link(act.specPath, `上一幕規格：${ACTS[act.act - 1].name}`, ACTS[act.act - 1].specPath, `spec-act-${act.act - 1}`)] : []),
  ...(act.act < 7 ? [link(act.specPath, `下一幕規格：${ACTS[act.act + 1].name}`, ACTS[act.act + 1].specPath, `spec-act-${act.act + 1}`)] : []),
  link(act.specPath, '共用附錄', APPENDIX, 'book-appendices'),
].join(' · ');

function relocate(text, from, to) {
  return text.replace(/\]\(([^)\n]+)\)/g, (whole, href) => {
    if (/^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(href)) return whole;
    const [target, ...fragment] = href.split('#');
    const absolute = path.posix.normalize(path.posix.join(path.posix.dirname(from), target));
    return `](${path.posix.relative(path.posix.dirname(to), absolute)}${fragment.length ? '#' + fragment.join('#') : ''})`;
  });
}
function structureNotes(text) {
  return text
    .replace('#### 一、分幕文件與共用附錄的規格分工', '#### 一、遊戲劇本、製作規格與共用附錄的分工')
    .replace('各幕文件前半部為正式演出，後半部為該幕製作規格；跨幕共用設定另由共用附錄維護。',
      '八份遊戲劇本維護台詞、演出、玩家操作、解謎因果與分支；八份同幕製作規格維護技術條件、數值、狀態保存、素材與驗收。跨幕共用設定另由共用附錄維護。同一段落只保留一份正式來源，兩類文件以場景編號雙向連結。')
    .replace('逐房圖像集中於各幕文件後半部的對應場景', '逐房製作圖像集中於各幕獨立製作規格的對應場景')
    .replace('各幕文件維護正式劇情與逐房製作規格，本檔只維護跨幕共用設定', '各幕遊戲劇本與製作規格分檔維護，本檔只維護跨幕共用設定');
}

const acts = [];
for (const act of ACTS) {
  assert(!existsSync(path.join(ROOT, 'docs', act.specPath)), `Refuse to overwrite ${act.specPath}`);
  const before = original.documents.get(act.path);
  const boundary = before.indexOf(anchor(`spec-act-${act.act}`));
  assert(boundary > before.indexOf(anchor(`act-${act.act}-continue`)), act.path);
  const story = before.slice(0, boundary).replace(/\s*---\s*$/, '').trimEnd() + '\n';
  let spec = before.slice(boundary).trim();
  assert(/^\[總目錄\]/.test(spec.split('\n').at(-1)), `${act.name} footer`);
  spec = spec.slice(0, spec.lastIndexOf('\n')).trim();
  const rooms = [...story.matchAll(/<a id="node-([a-z0-9]+)-script"><\/a>/g)].map(m => m[1]);
  documents.set(act.path, story
    .replace(/^更新: .*$/m, '更新: 2026-10-01')
    .replace(/^摘要: .*$/m, `摘要: ${act.name}劇情正文、台詞、演出、玩家操作與解謎因果；技術細節另見本幕製作規格。`));
  documents.set(act.specPath,
    `---\n文件: 製作規格 · ${act.name} · ${act.subtitle}\n狀態: 正式製作規格（待審）；未完成實機驗收\n更新: 2026-10-01\n摘要: ${act.name}逐房動線、技術條件、狀態保存、素材圖像與驗收；劇情與台詞另見本幕遊戲劇本。\n---\n\n` +
    `# 製作規格：${act.name}\n\n${specNav(act)}\n\n` +
    rooms.map(id => `[${id.toUpperCase().replace(/B$/, 'b')}](#node-${id}-spec)`).join('、') + '\n\n' +
    relocate(spec, act.path, act.specPath) + `\n\n${specNav(act)}\n`);
  acts.push({ act: act.name, story: act.path, specs: act.specPath, nodes: rooms.length,
    storyBlocks: [...story.matchAll(/<!-- import:[^:]+:begin -->/g)].length,
    specBlocks: [...spec.matchAll(/<!-- import:[^:]+:begin -->/g)].length });
}

const specTable = '| 幕別 | 劇情正文 | 製作規格 |\n| --- | --- | --- |\n' + ACTS.map(act =>
  `| ${act.name} · ${act.subtitle} | ${link(MASTER, '閱讀劇本', act.path, `act-${act.act}`)} | ${link(MASTER, '查閱規格', act.specPath, `spec-act-${act.act}`)} |`).join('\n');
documents.set(MASTER, documents.get(MASTER)
  .replace(/^更新: .*$/m, '更新: 2026-10-01')
  .replace(/^摘要: .*$/m, '摘要: 八幕遊戲劇本與八份製作規格分開閱讀，共用設定集中於附錄；本頁為唯一總目錄。')
  .replace('<!-- screenplay:split -->', `<!-- screenplay:split -->\n${SPEC_SPLIT_MARKER}`)
  .replace('正式內容由八份分幕文件與一份共用附錄組成。每幕先讀劇情正文，再查該幕製作規格；跨幕共用設定只在附錄維護。本頁僅作導覽，不保留另一份整合正文。',
    '正式內容由八份遊戲劇本、八份同幕製作規格與一份共用附錄組成。劇本可從序幕連續讀到終幕；需要技術細節時，由場景連結開啟對應製作規格。跨幕共用設定只在附錄維護，本頁僅作導覽，不保留另一份整合正文。')
  .replace('各幕規格位於該幕正文後。台詞、演出、解法、數值、狀態與素材在對應幕別修訂；分類副本由同步工具產生。',
    '各幕規格已分檔。劇本保留台詞、演出、玩家操作、解謎因果與分支；製作規格保留技術條件、數值、狀態保存、素材及驗收，不另抄一套劇情。製作示意圖隨原規格搬移，仍引用原素材。分類副本由同步工具產生。\n\n' + specTable));
documents.set(APPENDIX, structureNotes(documents.get(APPENDIX)).replace(/^更新: .*$/m, '更新: 2026-10-01'));

let split = parseMaster([...documents.values()].join('\n\n'), documents);
const warnings = [];
for (const [file, text] of documents) documents.set(file, rewriteLinks(text, file, split, warnings));
assert.deepEqual(warnings, [], 'Unresolved links');
const ordered = new Map(CANONICAL_FILES.map(file => [file, documents.get(file)]));
split = parseMaster([...ordered.values()].join('\n\n'), ordered);
assert.deepEqual([...split.anchors].sort(), [...original.anchors].sort(), 'Anchor inventory');
assert.deepEqual([...split.blocks.keys()].sort(), [...original.blocks.keys()].sort(), 'Block inventory');

// Compare every block after the required link rebasing and the single ownership note.
for (const [id, before] of original.blocks) {
  const from = original.anchorFiles.get(id), to = split.anchorFiles.get(id);
  const expected = rewriteLinks(relocate(structureNotes(before), from, to), to, split);
  assert.equal(split.blocks.get(id), expected, `Changed content: ${id}`);
}
const images = master => [...master.documents].flatMap(([file, text]) =>
  [...text.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)].map(m => path.posix.normalize(path.posix.join(path.posix.dirname(file), m[1])))).sort();
assert.deepEqual(images(split), images(original), 'Image inventory');
assert.equal(acts.reduce((sum, act) => sum + act.storyBlocks, 0), 342);
assert.equal(acts.reduce((sum, act) => sum + act.nodes, 0), 48);
const contentHash = createHash('sha256').update([...split.blocks].sort(([a], [b]) => a.localeCompare(b))
  .map(([id, text]) => `${id}\n${text}`).join('\n')).digest('hex');
const audit = { documents: ordered.size, retainedBlocks: split.blocks.size, retainedAnchors: split.anchors.size,
  imageReferences: images(split).length, blockContentAndLinkChecks: 'passed', contentHash, acts };
console.log(JSON.stringify(audit, null, 2));
if (process.argv.includes('--write')) {
  for (const [file, text] of ordered) {
    const full = path.join(ROOT, 'docs', file);
    mkdirSync(path.dirname(full), { recursive: true });
    writeFileSync(full, text, 'utf8');
  }
  writeFileSync(path.join(ROOT, 'reviews/2026-10-01_screenplay-specs-split.json'), JSON.stringify(audit, null, 2) + '\n');
  console.log('Written. Run canonical sync, inventory and website builds.');
} else console.log('Preview only; no documents changed.');
