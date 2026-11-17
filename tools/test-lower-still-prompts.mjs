import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { ACTS } from './screenplay-files.mjs';

const read = p => readFileSync(new URL(`../docs/${p}`, import.meta.url), 'utf8').replaceAll('\r\n', '\n');
const doc = read('10_製作規格/10-25_製作規格_下部靜態圖提示詞.md');
const upperDoc = read('10_製作規格/10-24_製作規格_上部靜態圖提示詞.md');
const plates = read('10_製作規格/10-15_製作規格_連接靜態圖場景列表.md');
const LOWER = ACTS.slice(5);
// Every still image the lower acts list, with its kind, from each spec's scene-image tables.
const rows = LOWER.flatMap(act => [...read(act.specPath).matchAll(/<!-- scene-images:([^:]+):begin -->([\s\S]*?)<!-- scene-images:\1:end -->/g)]
  .flatMap(([, , body]) => body.split('\n').filter(l => l.startsWith('|')).slice(2).map(l => l.split('|').slice(1, -1).map(c => c.trim())))
  .map(([id, kind]) => ({ id, kind, act: act.name })));
const blocks = [...doc.matchAll(/<a id="(lsp-[^"]+)"><\/a>\n\n#### (\S+) ([^\n]+)\n\n```asset\n([\s\S]*?)\n```/g)]
  .map(([, anchor, id, name, body]) => ({ anchor, id, name, lines: body.split('\n'), at: doc.indexOf(`<a id="${anchor}">`) }));
const SECTIONS = [
  ['scene', '場景大圖', ['主場景', '演出底圖', '演出主圖']], ['view', '操作鏡位', ['操作鏡位']], ['memory', '回憶畫面', ['回憶畫面']],
  ['look', '近看', ['近看']], ['op', '操作近看', ['操作近看']], ['transition', '過渡近看', ['過渡近看']],
  ['doc', '文件', ['文件']], ['screen', '介面：現場設備螢幕', ['介面']], ['board', '介面：筆記本與調查板', ['介面']],
];
const sectionAt = at => SECTIONS.filter(([cat]) => doc.indexOf(`<a id="lsp-cat-${cat}"></a>`) < at).at(-1);
const PROMPT = /^【(內容|構圖|光線色調|色調|分圖)】/;
const TRAD_ONLY = /[樓號區門開關電線請進廠貨運單後間費維時熱錶輪價診務經許轉輕庫錢檢應說讓點類辦釋臨禱貿業實體媽願飯湯標別著處閉載產棟換補報廢鑰籃閥負側]/;
const SIMP_ONLY = /[楼号区门开关电线请进厂货运单后间费维时热轮价诊务经许转轻库钱检应说让点类办释临祷贸业实体妈愿饭汤标别着处闭载产栋换补报废钥篮阀负侧]/;

test('every lower still image has exactly one prompt across 10-15 and 10-25', () => {
  assert.ok(doc.includes('<a id="lower-still-prompts"></a>'));
  assert.equal(rows.length, 201, 'the lower acts list 201 still images');
  const inPlates = new Set([...plates.matchAll(/^【素材】場景｜[^｜]+｜(\S+)$/gm)].map(m => m[1]));
  const here = blocks.map(b => b.id);
  assert.equal(new Set(here).size, here.length, 'no image is written twice in 10-25');
  for (const id of here) assert.ok(!inPlates.has(id), `${id} is already in 10-15`);
  const covered = new Set([...here, ...inPlates]);
  const missing = rows.filter(r => !covered.has(r.id)).map(r => r.id);
  assert.deepEqual(missing, []);
  const lower = new Set(rows.map(r => r.id));
  assert.deepEqual(here.filter(id => !lower.has(id)), [], '10-25 only covers lower images');
  assert.equal(here.length, 189);
});

test('each block sits in the section for its kind and keeps the fixed field order', () => {
  const kindOf = new Map(rows.map(r => [r.id, r]));
  for (const b of blocks) {
    const [cat, title, kinds] = sectionAt(b.at);
    assert.ok(kinds.includes(kindOf.get(b.id).kind), `${b.id} (${kindOf.get(b.id).kind}) filed under ${title}`);
    assert.equal(b.anchor, `lsp-${b.id.toLowerCase()}`);
    assert.equal(b.lines[0], `【素材】${title.replace(/^介面：.*/, '介面')}｜${b.name}｜${b.id}`);
    const tags = b.lines.map(l => l.slice(0, l.indexOf('】') + 1));
    const light = cat === 'board' ? '【色調】' : '【光線色調】';
    assert.deepEqual(tags.slice(1, 4), ['【內容】', '【構圖】', light], b.id);
    const tail = tags.slice(4).filter(t => t !== '【分圖】' && t !== '【圖層】');
    const expect = { doc: ['【文字層】'], screen: ['【介面層】'], board: ['【介面層】'] }[cat] ?? [];
    if (cat === 'transition') assert.ok(tail.length === 0 || (tail.length === 1 && tail[0] === '【到位態】'), b.id);
    else assert.deepEqual(tail, expect, b.id);
    if (tags.includes('【分圖】')) assert.ok(tags.filter(t => t === '【分圖】').length >= 2, `${b.id}: parts come in sets`);
    assert.match(b.lines[2], /^【構圖】16:9 橫幅/, b.id);
    // Photographed images use the light that is really there; memory layers use the frozen cyan look.
    const frozen = cat === 'memory' || b.lines.includes('【圖層】凝固層，風格用回憶畫面一類');
    if (frozen) assert.match(b.lines[1], /^【內容】凝固層：/, b.id);
    else if (cat !== 'board') assert.match(b.lines[3], /^【光線色調】現場自然光，照實拍：/, b.id);
    // Documents and screens are bases only: their words are typeset from the clue tables.
    if (cat === 'doc') assert.match(b.lines[1], /空|留白/, `${b.id}: paper fields stay empty`);
    if (cat === 'screen') assert.match(b.lines[1], /留空給/, `${b.id}: the screen is left for the interface`);
  }
});

test('every section states its shared style and avoid lines once', () => {
  for (const [cat, title] of SECTIONS) {
    const start = doc.indexOf(`<a id="lsp-cat-${cat}"></a>`);
    assert.ok(start > 0, title);
    const shared = doc.slice(start).match(/```asset\n(【風格】[^\n]+)\n(【不要出現】[^\n]+)\n```/);
    assert.ok(shared, `${title} shares one style block`);
    assert.ok(doc.indexOf(shared[0], start) < (blocks.find(b => b.at > start)?.at ?? Infinity), `${title}: shared block comes first`);
  }
});

test('prompt lines keep to the art rules', () => {
  for (const b of blocks) {
    const prompt = b.lines.filter(l => PROMPT.test(l)).join('');
    assert.doesNotMatch(prompt, /(?<![A-Za-z0-9-])[RUP]\d+b?(?!\d)/, `${b.id}: room codes get drawn as signs`);
    assert.doesNotMatch(prompt, /玩家|——/, b.id);
    assert.doesNotMatch(b.lines.join(''), /身份|高亮|像素|幀|接口|隊列|緩存|默認|全屏|黑屏|保存進度|選填|聲優/, b.id);
    // Overcast light only, and the mist, silk and figures stay on their own layers.
    assert.doesNotMatch(prompt, /陽光|太陽|晴天|直射|日光(?!燈)/, b.id);
    assert.doesNotMatch(prompt, /紅霧|白絲|怨靈|窄繭|暖黑|死黑/, b.id);
    assert.doesNotMatch(prompt, /盆栽(?![^。；]*褪成灰黃)|綠葉/, `${b.id}: plants in frame are dead`);
    for (const clause of b.lines[1].split(/[。；]/).filter(c => c.includes('「'))) {
      const quotes = [...clause.matchAll(/「([^」]+)」/g)].map(m => m[1]);
      if (clause.includes('簡體') && !clause.includes('繁體')) for (const q of quotes) assert.doesNotMatch(q, TRAD_ONLY, `${b.id}: ${q}`);
      if (clause.includes('繁體') && !clause.includes('簡體')) for (const q of quotes) assert.doesNotMatch(q, SIMP_ONLY, `${b.id}: ${q}`);
      if (clause.includes('緬甸文')) assert.ok(quotes.some(q => /[က-႟]/.test(q)), `${b.id}: Burmese text`);
    }
  }
});

test('transition close-ups borrow the light of their own 10-15 plate', () => {
  const plateLight = new Map([...plates.matchAll(/^【素材】場景｜[^｜]+｜(\S+)\n【內容】[^\n]*\n【構圖】[^\n]*\n【光線色調】([^\n]+)$/gm)].map(m => [m[1], m[2]]));
  const kindOf = new Map(rows.map(r => [r.id, r.kind]));
  const closeups = blocks.filter(b => kindOf.get(b.id) === '過渡近看');
  assert.equal(closeups.length, 9);
  for (const b of closeups) {
    const base = plateLight.get(b.id.replace(/-C\d+$/, ''));
    assert.ok(base, b.id);
    const firstTwo = base.split('；').slice(0, 2).join('；');
    assert.ok(b.lines[3].startsWith(`【光線色調】${firstTwo}`), `${b.id} keeps its plate's light`);
  }
});

test('the lower half shares the upper half style and avoid lines', () => {
  for (const [cat, title] of SECTIONS) {
    const shared = d => d.slice(d.indexOf(`-cat-${cat}"></a>`)).match(/```asset\n(【風格】[^\n]+)\n(【不要出現】[^\n]+)\n```/)[0];
    assert.equal(shared(doc), shared(upperDoc), title);
  }
});
