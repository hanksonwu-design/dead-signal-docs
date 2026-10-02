import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { ACTS, MASTER } from './screenplay-files.mjs';

const read = file => readFileSync(`docs/${file}`, 'utf8').replaceAll('\r\n', '\n');
const files = new Map(ACTS.map(a => [a.path, read(a.path)]));
const marker = '<!-- screenplay:reading-flow:v1 -->';
if ([...files.values()].every(text => text.includes(marker))) {
  console.log('Reading-flow migration already applied.');
  process.exit(0);
}
assert([...files.values()].every(text => !text.includes(marker)), 'Partial migration');
function block(text, id) {
  const start = text.indexOf(`<a id="${id}"></a>`), endTag = `<!-- import:${id}:end -->`;
  const end = text.indexOf(endTag, start) + endTag.length;
  assert(start >= 0 && end > start, id);
  return text.slice(start, end);
}
function moveAfter(text, moving, target) {
  const body = block(text, moving);
  text = text.replace(body + '\n\n', '');
  const after = `<!-- import:${target}:end -->`;
  return text.replace(after, `${after}\n\n${body}`);
}
function wrap(id, content) {
  return `<a id="${id}"></a>\n\n<!-- import:${id}:begin -->\n${content.trim()}\n<!-- import:${id}:end -->`;
}

let prologue = files.get(ACTS[0].path);
prologue = moveAfter(prologue, 's-0903-9', 's-0903-4');
prologue = prologue.replace('[P0-03a2] 鏡像者 · 第一次', '[P0-01a] 鏡像者 · 第一次');
prologue = prologue.replace('〔觸發〕第二次撐起時。', '〔觸發〕承接剛才第二次撐起的動作，尚未開始自由觀察。');
prologue = moveAfter(prologue, 's-0903-17', 's-0903-15');
prologue = prologue.replace('主角「有人把它貼在不會被帶走的地方。」',
  '主角「有人把它貼在不會被帶走的地方。」\n\n〔操作／物件近看＋介面比對〕再查看左岔路的「地基處理室」門牌與人員通道標籤，將祈願紙與通道用途在筆記中連起。也可先看門牌再回來查看紙背；兩項都已觀察，才進入下段感應。');
files.set(ACTS[0].path, prologue);

let act2 = files.get(ACTS[2].path);
const old = Object.fromEntries([24, 25, 26, 27, 28].map(n => [n, block(act2, `s-0905-${n}`)]));
const content = n => old[n].split(`<!-- import:s-0905-${n}:begin -->`)[1].split(`<!-- import:s-0905-${n}:end -->`)[0].trim();
const split = '〔操作／物件操作＋介面點選〕紙墊移妥後';
const card = content(24), splitAt = card.indexOf(split);
assert(splitAt > 0);
let before = card.slice(0, splitAt).trim();
before = before.replace('玩家取卡，走向讀卡桌；沿 [R8-05] 原倒影事件，在坐下以前看見姿勢差異，無聲、不切近景追認。', '玩家取卡，走向讀卡桌，準備坐下。');
before = before.replace(/\n\n（動畫演出）舊紙墊覆住讀卡托盤[^\n]*/u, '');
const after = '##### 插卡後：讀取名單與選填照片記憶\n\n' + card.slice(splitAt);
const reflection = content(28), knockAt = reflection.indexOf('〔前置〕兩下輕敲');
assert(knockAt > 0);
const early = reflection.slice(0, knockAt).trim()
  .replace('[R8-05] 倒影與兩下輕敲', '[R8-05] 坐下以前的倒影')
  .replace('玩家取卡後走向剪輯桌，準備坐下；與 [R8-02] 是同一事件，只播一次。', '接續剛才走到桌前的動作；此時尚未坐下，也未移開紙墊。');
const late = '##### 兩下輕敲（選填）\n\n' + reflection.slice(knockAt);
const paper = content(26).replace('玩家沿 [R8-02] 進原', '玩家接著進原');
const replacement = [wrap('s-0905-24', before), wrap('s-0905-28', early), wrap('s-0905-26', paper),
  wrap('s-0905-59', after), old[25], wrap('s-0905-60', late), old[27]].join('\n\n');
const first = act2.indexOf(old[24]), last = act2.indexOf(old[28]) + old[28].length;
assert(first >= 0 && last > first);
act2 = act2.slice(0, first) + replacement + act2.slice(last);
files.set(ACTS[2].path, act2);

let act3 = files.get(ACTS[3].path);
act3 = moveAfter(act3, 's-0906-60', 's-0906-58');
files.set(ACTS[3].path, act3);

let index = read(MASTER);
index = index.replace(/<!-- canonical-source: (\{[^\n]+\}) -->/g, (whole, json) => {
  const source = JSON.parse(json);
  if (source.id !== '0905') return whole;
  assert(!source.indices.includes(59) && !source.indices.includes(60));
  source.indices.push(59, 60);
  return `<!-- canonical-source: ${JSON.stringify(source)} -->`;
});
for (const [file, text] of files) {
  const headerEnd = text.indexOf('\n---\n') + 5;
  files.set(file, text.slice(0, headerEnd) + `\n${marker}\n` + text.slice(headerEnd));
}
files.set(MASTER, index);
assert(process.argv.includes('--write'), 'Use --write to apply the reviewed migration');
for (const [file, text] of files) writeFileSync(`docs/${file}`, text);
console.log('Moved P0/P1/R8/R17 events to their trigger order; original source anchors retained.');
