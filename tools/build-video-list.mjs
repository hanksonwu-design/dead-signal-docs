// Builds the upper-part video production list from every （動畫演出／…） cue in the act scripts.
// Only the marked region of 10-16 is generated; its introduction and delivery rules stay hand-written.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ACTS, APPENDIX } from './screenplay-files.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DOCS = path.join(ROOT, 'docs');
const TARGET = '10_製作規格/10-16_製作規格_影片製作列表.md';
const UPPER = ACTS.slice(0, 5);
const TYPES = ['第一人稱過場', '第一人稱互動', '第一人稱動作回饋', '場景局部動畫', '設備內影片', '設備即時影像'];
const BEGIN = '<!-- video-list:begin -->';
const END = '<!-- video-list:end -->';

const read = rel => readFileSync(path.join(DOCS, rel), 'utf8').replaceAll('\r\n', '\n');
const cell = value => String(value).replaceAll('|', '／').replaceAll('\n', ' ').trim();
const table = (headers, rows) => [headers, headers.map(() => '---'), ...rows]
  .map(row => `| ${row.map(cell).join(' | ')} |`).join('\n');
const IMAGE = /\b(?:T-[A-Z]\d+b?-[A-Z]\d+b?-\d{2}(?:-C\d{2})?|[PRU]\d+b?-[VCD]\d{2}(?:-C\d{2})?)\b/g;
const plain = text => text
  .replace(/<!--[\s\S]*?-->/g, '')
  .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
  .replace(/\s+/g, ' ')
  .trim();

function parseHeading(line) {
  const m = line.match(/^(#{2,6}) (.+)$/);
  if (!m) return null;
  const level = m[1].length;
  const text = plain(m[2]);
  let code = null;
  let title = text;
  let beat;
  if ((beat = text.match(/^\[([^\]]+)\]\s*(.*)$/))) [, code, title] = beat;
  else if ((beat = text.match(/^次場景 (\S+) · (.+)$/))) [, code, title] = beat;
  else if (level === 3 && (beat = text.match(/^(\S+) · (.+)$/))) [, code, title] = beat;
  return { level, text, code, title };
}

function collect(act) {
  const lines = read(act.path).split('\n');
  const cues = [];
  const stack = [];
  let pending = [];
  let floating = [];
  let block = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let m;
    if ((m = line.match(/^<a id="([^"]+)"><\/a>$/))) { pending.push(m[1]); continue; }
    if ((m = line.match(/^<!-- import:([^:]+):begin -->$/))) { block = m[1]; continue; }
    if ((m = line.match(/^<!-- import:([^:]+):end -->$/))) { block = null; continue; }
    const heading = parseHeading(line);
    if (heading) {
      while (stack.length && stack.at(-1).level >= heading.level) stack.pop();
      stack.push({ ...heading, line: i, anchors: pending });
      pending = [];
      floating = [];
      continue;
    }
    // An anchor followed by text marks a section inside the current heading until the next heading.
    if (line.trim() && pending.length) { floating.push(...pending); pending = []; }
    if (!(m = line.match(/^（動畫演出／([^）]+)）(.*)$/))) continue;
    const [, type, rest] = m;
    assert(TYPES.includes(type), `${act.name}: unknown animation type ${type}`);
    const coded = [...stack].reverse().find(h => h.code && h.level >= 3);
    assert(coded, `${act.name}: animation outside a scene at line ${i + 1}`);
    const deepest = stack.at(-1);
    const sub = deepest !== coded && deepest.level > coded.level ? deepest.title : '';
    const anchor = [...floating.slice().reverse(), ...[...stack].reverse().flatMap(h => h.anchors.slice().reverse())][0];
    assert(anchor, `${act.name}: no anchor before line ${i + 1}`);
    const description = plain(rest);
    let images = [...new Set(rest.match(IMAGE) || [])];
    if (!images.length) {
      const sceneStart = (stack.find(h => h.level === 4) || coded).line;
      for (let j = i - 1; j >= sceneStart && !images.length; j--) images = [...new Set(lines[j].match(IMAGE) || [])];
      for (let j = i + 1; j < lines.length && !images.length && !parseHeading(lines[j]); j++) images = [...new Set(lines[j].match(IMAGE) || [])];
    }
    cues.push({
      act, type, description, images, block,
      code: coded.code, title: coded.title, sub, anchor,
      anchors: new Set([block, ...stack.flatMap(h => h.anchors), ...floating].filter(Boolean)),
    });
  }
  const seen = new Map();
  for (const cue of cues) {
    const n = (seen.get(cue.code) || 0) + 1;
    seen.set(cue.code, n);
    cue.id = `${cue.code}·${n}`;
  }
  return cues;
}

function keyBridges(cues) {
  const appendix = read(APPENDIX);
  const start = appendix.indexOf('<a id="first-person-animation-contract"></a>');
  assert(start >= 0, 'Missing first-person animation contract');
  const after = appendix.slice(start);
  const tableStart = after.indexOf('| 橋段與來源 |');
  assert(tableStart >= 0, 'Missing first-person animation table');
  const rows = [];
  for (const line of after.slice(tableStart).split('\n').slice(2)) {
    if (!line.startsWith('| ')) break;
    const [label, method, control] = line.slice(2, -2).split(' | ');
    const m = label.match(/^\[([^\]]+)\]\(([^)#]*)#([^)]+)\)$/);
    assert(m, `Unreadable animation contract row: ${label}`);
    const [, name, file, anchor] = m;
    const act = UPPER.find(a => file && a.path.endsWith(file));
    if (!act) continue;
    // Narrow a source block to the cue types and scenes the contract row names, when that leaves any.
    let matched = cues.filter(c => c.act === act && c.anchors.has(anchor));
    const kinds = Object.entries({ 過場: '第一人稱過場', 互動: '第一人稱互動', 動作回饋: '第一人稱動作回饋' })
      .filter(([word]) => method.split('；')[0].includes(word)).map(([, type]) => type);
    const byKind = matched.filter(c => kinds.includes(c.type));
    if (byKind.length) matched = byKind;
    const named = method.match(IMAGE) || [];
    const byImage = matched.filter(c => c.images.some(id => named.some(n => id === n || id.startsWith(n + '-'))));
    // Keep whole scenes: a picture match selects its scene, including cues there that name no picture.
    const scenes = new Set(byImage.map(c => c.code));
    if (byImage.length) matched = matched.filter(c => scenes.has(c.code));
    assert(matched.length, `Animation contract row matches no cue: ${name}`);
    for (const cue of matched) cue.key = name;
    rows.push([`[${name}](../${act.path}#${anchor})`, method, control,
      matched.map(c => c.id).join('、')]);
  }
  return rows;
}

const cues = UPPER.flatMap(collect);
const bridges = keyBridges(cues);
const usedTypes = TYPES.filter(t => cues.some(c => c.type === t));
const out = [];
out.push('## 統計', '');
out.push(table(['幕', ...usedTypes, '合計'], [
  ...UPPER.map(act => {
    const own = cues.filter(c => c.act === act);
    return [`[${act.name}](#video-act-${act.act})`, ...usedTypes.map(t => own.filter(c => c.type === t).length), own.length];
  }),
  ['**上部合計**', ...usedTypes.map(t => cues.filter(c => c.type === t).length), `**${cues.length}**`],
]), '');
out.push('<a id="video-key-bridges"></a>', '', '## 重點橋段（★）', '');
out.push('下列橋段另有控制交接規格，取自[第一人稱動畫製作與交接](../09_劇本/09-15_正式劇本_共用附錄.md#first-person-animation-contract)；製作時先讀這一列，再看對應的影片描述。', '');
out.push(table(['橋段', '方式／既有素材', '控制交接與時序', '對應列表'], bridges), '');
for (const act of UPPER) {
  const own = cues.filter(c => c.act === act);
  out.push(`<a id="video-act-${act.act}"></a>`, '', `## ${act.name} · ${act.subtitle}（${own.length} 段）`, '');
  out.push(table(['編號', '場次', '類型', '影片描述', '畫面', '重點'], own.map(c => [
    `\`${c.id}\``,
    `[${c.code} ${c.title}](../${act.path}#${c.anchor})${c.sub ? `<br>${c.sub}` : ''}`,
    c.type.replace('第一人稱', ''),
    c.description,
    c.images.length ? c.images.map(id => `\`${id}\``).join('、') : '—',
    c.key ? `★ ${c.key}` : '',
  ])), '');
}

const file = path.join(DOCS, TARGET);
const original = readFileSync(file, 'utf8');
const nl = original.includes('\r\n') ? '\r\n' : '\n';
const text = original.replaceAll('\r\n', '\n');
assert.equal(text.split(BEGIN).length, 2, 'video-list begin marker');
assert.equal(text.split(END).length, 2, 'video-list end marker');
const from = text.indexOf(BEGIN) + BEGIN.length;
const to = text.indexOf(END);
const output = (text.slice(0, from) + '\n\n' + out.join('\n').trim() + '\n\n' + text.slice(to)).replaceAll('\n', nl);
const changed = output !== original;
if (process.argv.includes('--check')) {
  assert(!changed, 'Video list is stale; run node tools/build-video-list.mjs');
} else if (changed) {
  writeFileSync(file, output);
}
console.log(`Video list ${changed && !process.argv.includes('--check') ? 'updated' : 'verified'}: ${cues.length} animation cues, ${bridges.length} key bridges`);
