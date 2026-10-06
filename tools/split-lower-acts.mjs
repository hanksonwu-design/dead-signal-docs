// One-time, loss-checked chapter relocation; --write applies the preview.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, parseMaster, rewriteLinks } from './sync-canonical.mjs';
import { MASTER, APPENDIX, ACTS, LEGACY_ACTS, LOWER_ACT_NODES, FINALE, CANONICAL_FILES } from './screenplay-files.mjs';

const read = file => fs.readFileSync(path.join(ROOT, 'docs', file), 'utf8').replaceAll('\r\n', '\n');
const marker = '<!-- screenplay:lower-three-acts:v1 -->';
if (read(MASTER).includes(marker)) {
  console.log('Lower acts already split; no changes made.');
  process.exit(0);
}
const files = [MASTER, ...LEGACY_ACTS.map(a => a.path), ...LEGACY_ACTS.map(a => a.specPath), APPENDIX];
const before = new Map(files.map(file => [file, read(file)]));
const original = parseMaster([...before.values()].join('\n\n'), before);
const docs = new Map(before);
const tag = id => `<a id="${id}"></a>`;
const link = (from, label, to, anchor) => `[${label}](${path.posix.relative(path.posix.dirname(from), to)}#${anchor})`;
const nav = (act, spec = false) => {
  const from = spec ? act.specPath : act.path;
  const target = a => spec ? a.specPath : a.path;
  const heading = a => `${spec ? 'spec-' : ''}act-${a.act}`;
  return [link(from, '總目錄', MASTER, spec ? 'book-specs' : 'book-toc'),
    ...(spec ? [link(from, '本幕劇本', act.path, `act-${act.act}`)] : []),
    ...(act.act ? [link(from, `上一幕${spec ? '規格' : ''}：${ACTS[act.act - 1].name}`, target(ACTS[act.act - 1]), heading(ACTS[act.act - 1]))] : []),
    ...(act.act < ACTS.length - 1 ? [link(from, `下一幕${spec ? '規格' : ''}：${ACTS[act.act + 1].name}`, target(ACTS[act.act + 1]), heading(ACTS[act.act + 1]))] : []),
    link(from, '共用附錄', APPENDIX, 'book-appendices')].join(' · ');
};
const header = (act, spec = false) => `---\n文件: ${spec ? '製作規格' : '遊戲劇本'} · ${act.name} · ${act.subtitle}\n狀態: 正式分幕稿（待審）；未完成實機驗收\n更新: 2026-10-06\n摘要: ${act.name}${spec ? '逐房動線、技術條件、圖像與驗收；劇情另見同幕遊戲劇本。' : '劇情正文、台詞、操作與解謎因果；技術細節另見同幕製作規格。'}\n---\n\n${spec ? '' : '<!-- screenplay:reading-flow:v1 -->\n\n'}# ${spec ? '製作規格' : '遊戲劇本'}：${act.name}\n\n${nav(act, spec)}\n\n`;
const roomLinks = (nodes, spec) => nodes.map(id => `[${id}](#node-${id.toLowerCase()}-${spec ? 'spec' : 'script'})`).join('、');
const section = (act, id, title, body) => `${tag(`spec-act-${act.act}-${id}`)}\n\n### ${title}\n\n${body.trim()}\n\n`;
const story = before.get(LEGACY_ACTS[6].path), spec = before.get(LEGACY_ACTS[6].specPath);
const storyStarts = ['node-m1', 'node-r28', 'node-u6', 'act-6-continue'].map(id => story.indexOf(tag(id)));
const specStarts = ['node-m1-spec', 'node-r28-spec', 'node-u6-spec', 'spec-act-6-shared'].map(id => spec.indexOf(tag(id)));
assert(storyStarts.every((n, i) => n >= 0 && (!i || n > storyStarts[i - 1])));
assert(specStarts.every((n, i) => n >= 0 && (!i || n > specStarts[i - 1])));
const commonLink = (from, anchor, label) => link(from, label, ACTS[8].specPath, anchor);
const openings = [
  '承接第五幕阿彪退場，保留 R23–R25 安全整理後，由玩家確認進入 M1；經七窗、展示廊與生活夾層，於 U3 完成既有落橋及通行條件後銜接 R28。',
  '從 U3 已開的服務橋進入 R28。供電、來源已讀、資源、回訪及抹除狀態全部承接；依序經交易、簽核、門牌回返與冷藏後場。R29 的原二十秒責任整理保留，再由玩家出發。',
  '承接 U5 原出口進入 U6。水箱與配重作短解謎喘息，之後沿 R30 沉降及不可逆確認抵達 R31，完成原來源核驗、身分鎖定與十二秒解凍，再走向終幕。',
];
for (let i = 0; i < 3; i++) {
  const act = ACTS[6 + i], nodes = LOWER_ACT_NODES[i];
  docs.set(act.path, header(act) + roomLinks(nodes, false) + ` · ${link(act.path, '本幕製作規格', act.specPath, `spec-act-${act.act}`)}\n\n` +
    (i === 0 ? tag('doc-0909') + '\n' : '') + tag(`act-${act.act}`) + `\n\n## ${act.name} · ${act.subtitle}\n\n` +
    story.slice(storyStarts[i], storyStarts[i + 1]).trim() + '\n\n' + tag(`act-${act.act}-continue`) + `\n\n${nav(act)}\n`);
  const contents = [['overview', '本幕概覽'], ['rooms', '場景流程'], ['shared', '跨幕共用規則'], ['references', '圖解對照'], ['delivery', '幕尾交接']];
  const toc = contents.map(([id, label]) => `[${label}](#spec-act-${act.act}-${id})`).join(' · ');
  const routeIndex = `<!-- scene-image-routes-${act.act}:begin -->\n${tag(`image-routes-act-${act.act}`)}\n<!-- scene-image-routes-${act.act}:end -->`;
  const oldFront = spec.slice(spec.indexOf(tag('spec-act-6-overview')) + tag('spec-act-6-overview').length, spec.indexOf(tag('spec-act-6-rooms')))
    .replace(/^\s*### 本幕概覽與前置\s*/, '').replace(/<!-- scene-image-routes-6:begin -->[\s\S]*?<!-- scene-image-routes-6:end -->/, '').trim();
  const front = openings[i] + '\n\n' + (i === 0 ? oldFront + '\n\n' : '') + routeIndex;
  let tail;
  if (i === 2) {
    tail = spec.slice(specStarts[3], spec.lastIndexOf('\n[總目錄]')).replace(/spec-act-6-(shared|references|delivery)/g, 'spec-act-8-$1');
  } else {
    tail = section(act, 'shared', '跨幕共用規則', commonLink(act.specPath, 'spec-act-8-shared', '第六至八幕共用規則')) +
      section(act, 'references', '圖解對照', commonLink(act.specPath, 'spec-act-8-references', '第六至八幕圖解與原素材對照')) +
      section(act, 'delivery', '幕尾交接', i === 0 ? 'U3 落橋及原出口條件完成後，沿既有服務橋進入第七幕 R28；已開 U3↔U1 捷徑與其他回訪條件不變。' : 'U5 兩側封阻及原出口條件完成後，沿既有路段進入第八幕 U6；保留原可回返範圍。') +
      '分幕只調整文件與導覽分類，不重置資源、不補發來源、不新增門鎖、黑場或強制確認；讀檔沿原房間與狀態鍵恢復。\n\n';
  }
  docs.set(act.specPath, header(act, true) + roomLinks(nodes, true) + '\n\n' + tag(`spec-act-${act.act}`) + `\n\n## ${act.name} · ${act.subtitle}：製作規格\n\n<!-- production:ordered:v1 -->\n\n${toc}\n\n` +
    section(act, 'overview', '本幕概覽與前置', front) + section(act, 'rooms', '依流程逐場景製作', spec.slice(specStarts[i], specStarts[i + 1])) + tail + nav(act, true) + '\n');
}
// Finale paths stay published; only presentation anchors advance to act 9.
for (const file of [FINALE.path, FINALE.specPath]) docs.set(file, docs.get(file).replace(/((?:spec-)?act-|image-routes-act-|scene-image-routes-)7(?=[-:"#)])/g, '$19'));
for (const act of [ACTS[5], FINALE]) for (const spec of [false, true]) {
  const file = spec ? act.specPath : act.path;
  docs.set(file, docs.get(file).replace(/^\[總目錄\].*$/gm, nav(act, spec)));
}
// Rebuild the public index in play order while retaining the source manifest.
let index = docs.get(MASTER);
const graph = JSON.parse(fs.readFileSync(path.join(ROOT, 'scene_graph.json'), 'utf8'));
for (const node of graph.nodes) {
  const part = LOWER_ACT_NODES.findIndex(ids => ids.includes(node.id));
  if (part >= 0) node.act = 6 + part;
  else if (node.act === 7) node.act = 9;
}
const table = '| 劇情正文 | 場景 |\n| --- | --- |\n' + ACTS.map(a => `| ${link(MASTER, `${a.name} · ${a.subtitle}`, a.path, `act-${a.act}`)} | ${graph.nodes.filter(n => n.act === a.act).map(n => link(MASTER, n.id, a.path, `node-${n.id.toLowerCase()}`)).join('、')} |`).join('\n');
index = index.replace(/\| 劇情正文 \| 場景 \|[\s\S]*?(?=\n\n)/, table);
const specs = '| 幕別 | 劇情正文 | 製作規格 |\n| --- | --- | --- |\n' + ACTS.map(a => `| ${a.name} · ${a.subtitle} | ${link(MASTER, '閱讀劇本', a.path, `act-${a.act}`)} | ${link(MASTER, '查閱規格', a.specPath, `spec-act-${a.act}`)} |`).join('\n');
index = index.replace(/\| 幕別 \| 劇情正文 \| 製作規格 \|[\s\S]*?(?=\n\n)/, specs);
const art = ACTS.map(a => `- ${link(MASTER, `${a.name} · ${a.subtitle}`, a.specPath, `spec-act-${a.act}`)}：${graph.nodes.filter(n => n.act === a.act).map(n => link(MASTER, n.id, a.specPath, `node-${n.id.toLowerCase()}-visual`)).join('、')}`).join('\n');
index = index.replace(/(- \[序幕 · 雨夜與地底\][^\n]*\n)(?:- [^\n]*\n)*/, art + '\n');
docs.set(MASTER, index.replace('<!-- screenplay:specs-split -->', '<!-- screenplay:specs-split -->\n' + marker));
// Fix old finale targets before resolving anchors that now belong to act VII.
for (const [file, content] of docs) docs.set(file, content.replace(/(09-10_正式劇本_終幕\.md#act-)7\b/g, '$19')
  .replace(/(10-08_製作規格_終幕\.md#(?:spec-act-|image-routes-act-))7\b/g, '$19'));
let split = parseMaster([...docs.values()].join('\n\n'), docs);
for (const [file, content] of docs) docs.set(file, rewriteLinks(content, file, split));
const ordered = new Map(CANONICAL_FILES.map(file => [file, docs.get(file)]));
split = parseMaster([...ordered.values()].join('\n\n'), ordered);
assert.deepEqual([...split.blocks.keys()].sort(), [...original.blocks.keys()].sort(), 'Every source block retained exactly once');
for (const [id, text] of original.blocks) {
  assert.equal(split.blocks.get(id), rewriteLinks(text.replace(/(09-10_正式劇本_終幕\.md#act-)7\b/g, '$19'), split.anchorFiles.get(id), split), `Changed block: ${id}`);
}
const images = source => [...source.text.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)].map(m => m[1]).sort();
assert.deepEqual(images(split), images(original), 'Illustrations retained');
const audit = { chapters: ACTS.length, blocks: split.blocks.size, beforeBlocks: original.blocks.size,
  relocated: LOWER_ACT_NODES.map((nodes, i) => ({ act: ACTS[6 + i].name, nodes })),
  checks: 'Source blocks, original scene IDs, route conditions and illustration references retained' };
console.log(JSON.stringify(audit, null, 2));
if (process.argv.includes('--write')) {
  for (const [file, content] of ordered) fs.writeFileSync(path.join(ROOT, 'docs', file), content);
  fs.writeFileSync(path.join(ROOT, 'reviews/2026-10-06_lower-three-acts.json'), JSON.stringify(audit, null, 2) + '\n');
} else console.log('Preview only; no documents changed.');
