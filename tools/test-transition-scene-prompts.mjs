import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';

const doc = readFileSync(new URL('../docs/10_製作規格/10-15_製作規格_連接靜態圖場景列表.md', import.meta.url), 'utf8').replaceAll('\r\n', '\n');
const start = doc.indexOf('<a id="transition-scene-prompts"></a>');
const tables = doc.slice(0, start);
const prompts = doc.slice(start, doc.indexOf('## 製作交接欄位'));
const STYLE = '【風格】寫實、極致逼真的真人實景攝影質感：真實相機與自然光學，輕微景深與自然底片顆粒；皮膚、布料、金屬、水漬與灰塵都有真實細節。不是遊戲 CG、不是 3D 算圖、不是插畫。';
const AVOID = '【不要出現】任何人物、手、人影或異變者；清楚可辨識的人臉五官；任何可讀的文字、號碼、標誌、國旗或國名（字留白或模糊，後製再合成）；血腥特寫、裸露；遊戲 CG 感、3D 算圖感、插畫、動漫或卡通畫風、塑膠般光滑的皮膚與材質。';

test('every static transition image in 10-15 has one scene prompt in the fixed six-part format', () => {
  assert.ok(start > 0, '10-15 keeps a 場景 AI 生成提示詞 section');
  const ids = [...new Set([...tables.matchAll(/`((?:T-[A-Z]\d+b?-[A-Z]\d+b?-\d{2})|(?:[PRU]\d+b?-V\d{2}))`/g)].map(m => m[1]))];
  assert.equal(ids.length, 72);
  const blocks = [...prompts.matchAll(/```asset\n([\s\S]*?)\n```/g)].map(m => m[1].split('\n'));
  assert.equal(blocks.length, 72);
  // Scene names come from each row's 主圖序列 cell (the first mention of the id).
  const named = new Map();
  for (const m of tables.matchAll(/`(T-[A-Z0-9-]+-\d{2})` ([^|→`（]+)/g)) if (!named.has(m[1])) named.set(m[1], m[2].trim());
  const seen = [];
  for (const lines of blocks) {
    const head = lines[0].match(/^【素材】場景｜([^｜]+)｜(\S+)$/);
    assert.ok(head, lines[0]);
    const [, name, id] = head;
    seen.push(id);
    if (named.has(id)) assert.equal(name, named.get(id), id);
    assert.ok(prompts.includes(`<a id="tsp-${id.toLowerCase()}"></a>\n\n#### ${id} ${name}\n\n\`\`\`asset\n`), `${id} has its own anchor and heading`);
    assert.deepEqual(lines.map(l => l.slice(0, l.indexOf('】') + 1)), ['【素材】', '【內容】', '【構圖】', '【光線色調】', '【風格】', '【不要出現】'], id);
    assert.ok(lines[1].startsWith('【內容】寫實實景的空景：'), id);
    // Each plate closes on its floor band's walled-city ground: wrapped old homes, patchwork eras, life left in place.
    assert.match(lines[1], /層層加建/, id);
    assert.match(lines[2], /^【構圖】16:9 橫幅，第一人稱站立視線高度、約 28mm 人眼視角，/, id);
    assert.equal(lines[4], STYLE, id);
    assert.equal(lines[5], AVOID, id);
    // A still plate shows no sound, no people and no player-facing wording.
    assert.doesNotMatch(lines.slice(1, 4).join(''), /玩家|聲|人影|——/, id);
    // Prompts name no real place, and every sign or paper shows which script it carries instead of a blank.
    assert.doesNotMatch(lines.slice(1, 4).join(''), /九龍|城寨|字留白/, id);
    for (const clause of lines[1].split(/[。；]/).filter(c => /模糊不可讀|字跡模糊/.test(c))) assert.match(clause, /簡體|繁體|緬甸文|英文|中文/, `${id}: ${clause}`);
  }
  assert.deepEqual([...seen].sort(), [...ids].sort());
});

test('red mist and white silk stay in the three transition plates whose specs call for them', () => {
  const misty = [...prompts.matchAll(/```asset\n【素材】場景｜[^｜]+｜(\S+)\n([\s\S]*?)\n```/g)]
    .filter(m => /紅霧|白絲|蠶絲/.test(m[2].split('\n').slice(0, 3).join(''))).map(m => m[1]);
  assert.deepEqual(misty, ['T-R7-R8-02', 'T-R11-R12-07', 'T-R12-R14-03']);
});

test('signs left from before the compound keep the 40/10/50 script mix, and each plate shows its assigned script', () => {
  const at = prompts.indexOf('<a id="tsp-scripts"></a>');
  assert.ok(at > 0, '10-15 keeps a 招牌與文件的文字 section');
  const section = prompts.slice(at, prompts.indexOf('### A.', at));
  const rows = [...section.matchAll(/^\| \[`(\S+)`\]\(#tsp-[^)]+\) \| ([^|]+) \| ([^|]+) \|$/gm)].map(m => [m[1], m[2].trim(), m[3].trim()]);
  assert.ok(rows.length >= 20, 'enough signs to hold a ratio');
  const content = new Map([...prompts.matchAll(/```asset\n【素材】場景｜[^｜]+｜(\S+)\n(【內容】[^\n]*)/g)].map(m => [m[1], m[2]]));
  for (const [id, what, script] of rows) {
    assert.ok(['簡體中文', '繁體中文', '緬甸文', '英文', '緬甸文與英文並列'].includes(script), `${id} ${what}: ${script}`);
    assert.ok(content.get(id)?.includes(script), `${id} ${what} shows ${script}`);
  }
  const share = s => rows.filter(r => r[2] === s).length / rows.length;
  assert.ok(Math.abs(share('簡體中文') - 0.4) <= 0.05, 'about 40% simplified Chinese');
  assert.ok(Math.abs(share('繁體中文') - 0.1) <= 0.05, 'about 10% traditional Chinese');
});
