import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';

const doc = readFileSync(new URL('../docs/10_製作規格/10-15_製作規格_連接靜態圖場景列表.md', import.meta.url), 'utf8').replaceAll('\r\n', '\n');
const start = doc.indexOf('<a id="transition-scene-prompts"></a>');
const tables = doc.slice(0, start);
const prompts = doc.slice(start, doc.indexOf('## 製作交接欄位'));
const STYLE = '【風格】寫實、極致逼真的真人實景攝影質感：普通相機在現場自然光下拍的紀錄片照片，不打燈、不做電影感調色，白平衡照實；整體氣氛陰冷、壓迫、令人不安，像人都突然不見了的樓裡留下的現場照片；現場光不夠，照實拍，曝光以亮處不過曝為準、整體壓低，大半個畫面落在陰影裡，光只照到局部；燈泡、燈管與透光的縫保留細節，光源照實帶著各自的顏色，老舊日光燈偏青綠、蒙灰的燈泡昏黃、陰雨天光發灰；暗處由近到遠慢慢沉下去，近處的牆面、地面與管線仍看得出層次，只有最深的門洞、梯井或走道盡頭暗到看不出裡面；真實相機與自然光學，景深自然，暗處帶明顯的相機雜訊；皮膚、布料、金屬、水漬、霉斑與灰塵都有真實細節；招牌、標籤與紙上的字照【內容】引號裡的原文正常顯示，筆畫正確，只帶實際的褪色、髒污與磨損；畫面裡若有盆栽或植物，一律已經枯死乾黃。不是電影劇照、不是遊戲 CG、不是 3D 算圖、不是插畫。';
const AVOID = '【不要出現】任何人物、手、人影或異變者；清楚可辨識的人臉五官；提示詞沒寫到的文字與號碼、真實的店名與品牌標誌、國旗或國名；模糊、馬賽克或打碼的字；還活著的綠色盆栽與植物；血腥特寫、裸露；遊戲 CG 感、3D 算圖感、插畫、動漫或卡通畫風、塑膠般光滑的皮膚與材質；電影感的戲劇打光、光束、霧氣效果、刻意調色與暗角；太陽、陽光直射與陽光照出的光斑；過曝死白的亮處、整片壓成死黑的暗面、所有燈都亮著的室內；明亮乾淨、溫暖舒適的氣氛；血跡、鬼影或刻意擺放的恐怖道具。';
const TRAD_ONLY = /[樓號區門開關電線請進廠貨運單後間費維時熱錶輪價診務經許轉輕庫錢檢應說讓點類辦釋臨禱貿業實體媽願飯湯標別著處閉載產棟換補報廢鑰籃閥負側]/;
const SIMP_ONLY = /[楼号区门开关电线请进厂货运单后间费维时热轮价诊务经许转轻库钱检应说让点类办释临祷贸业实体妈愿饭汤标别着处闭载产栋换补报废钥篮阀负侧]/;

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
    // Plain documentary photos in the light that is really there: no staged mood or cinematic grade.
    assert.ok(lines[3].startsWith('【光線色調】現場自然光，照實拍：'), id);
    assert.doesNotMatch(lines[3], /暖黑|深黑陰影|勾邊|勾出|光束|戲劇|電影/, id);
    // Where skylight comes in the lamps stay off, or only one or two are on when it is dim;
    // windowless plates keep their lamps only partly on. Every plate says what the shadows still show.
    if (lines[3].includes('這裡沒有任何透光的縫')) assert.match(lines[3], /不亮|只亮|只剩|燈座|熄|隔一/, `${id}: lamps partly on`);
    else assert.match(lines[3], /燈[^，；。]{0,4}沒開|只開了|沒有燈/, `${id}: skylit plates keep the lamps off or light one or two`);
    assert.match(lines[3], /仍(看得出|看得清|分得出)/, `${id}: shadow detail`);
    assert.doesNotMatch(lines.slice(1, 4).join(''), /深黑|死黑|漆黑|偏暗|均勻的暖白/, id);
    // Overcast skylight only: no sun, no cloud gaps, no sunlit patches, and no 日光 that reads as sunlight.
    assert.doesNotMatch(lines.slice(0, 4).join(''), /陽光|太陽|晴|雲|直射|日光(?!燈)|晒/, id);
    assert.equal(lines[4], STYLE, id);
    assert.equal(lines[5], AVOID, id);
    // A still plate shows no sound, no people and no player-facing wording.
    assert.doesNotMatch(lines.slice(1, 4).join(''), /玩家|聲|人影|——/, id);
    // Prompts name no real place, and every sign or paper shows which script it carries instead of a blank.
    assert.doesNotMatch(lines.slice(1, 4).join(''), /九龍|城寨|字留白|模糊不可讀|字跡模糊/, id);
    assert.doesNotMatch(lines.slice(1, 4).join(''), /(?<![A-Za-z0-9-])[RUP]\d+(?!\d)/, `${id}: room codes get drawn as signs`);
    // Signs show their real words: simplified quotes carry no traditional-only characters and the reverse,
    // and a clause that names Burmese quotes some Burmese script.
    for (const clause of lines[1].split(/[。；]/).filter(c => c.includes('「'))) {
      const quotes = [...clause.matchAll(/「([^」]+)」/g)].map(m => m[1]);
      if (clause.includes('簡體') && !clause.includes('繁體')) for (const q of quotes) assert.doesNotMatch(q, TRAD_ONLY, `${id}: ${q}`);
      if (clause.includes('繁體') && !clause.includes('簡體')) for (const q of quotes) assert.doesNotMatch(q, SIMP_ONLY, `${id}: ${q}`);
      if (clause.includes('緬甸文')) assert.ok(quotes.some(q => /[\u1000-\u109F]/.test(q)), `${id}: Burmese text in ${clause}`);
    }
  }
  assert.deepEqual([...seen].sort(), [...ids].sort());
});

test('base plates leave the red mist and white silk to their separate masks', () => {
  const misty = [...prompts.matchAll(/```asset\n【素材】場景｜[^｜]+｜(\S+)\n([\s\S]*?)\n```/g)]
    .filter(m => /紅霧|白絲|蠶絲/.test(m[2].split('\n').slice(0, 3).join(''))).map(m => m[1]);
  assert.deepEqual(misty, []);
  const intro = prompts.slice(0, prompts.indexOf('### A.'));
  for (const id of ['T-R7-R8-02', 'T-R11-R12-07', 'T-R12-R14-03']) assert.ok(intro.includes(id), `intro names ${id} as a mask plate`);
});

test('daylight changes from route to route, and the windowless plates use only the lamps there', () => {
  const lights = [...prompts.matchAll(/^【光線色調】(.*)$/gm)].map(m => m[1]);
  assert.equal(lights.length, 72);
  assert.equal(new Set(lights).size, 72, 'every plate has its own light');
  for (const kind of ['陰天', '細雨', '雨剛停', '雨停', '浪板', '帆布', '白磁磚井壁', '高窗']) assert.ok(lights.some(l => l.includes(kind)), kind);
  assert.equal(lights.filter(l => l.includes('這裡沒有任何透光的縫')).length, 31);
  assert.ok(lights.filter(l => l.includes('有天光')).length >= 15, 'plates with enough skylight keep the lamps off');
  assert.ok(lights.filter(l => l.includes('天光灰暗')).length >= 10, 'dim plates light only one or two lamps');
  assert.ok(prompts.includes('<a id="tsp-light"></a>'), '10-15 keeps a 光線的分配 section');
  // Horror comes from the light that is there: every plate ends on one place too dark to see into.
  assert.ok(prompts.includes('- **恐怖感：**'), '光線的分配 explains the horror look');
  for (const l of lights) assert.match(l.split('；').at(-1), /看不出|看不到底/, `one place too dark to see into: ${l.slice(0, 30)}`);
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

// Each room's own colour and material, from its 空間第一印象 in the production specs.
const ROOM_LOOK = {
  R2: /醬褐|麵店/, R3: /暗靛/, R4: /濕綠/, R5: /赭紅/, R6: /藍灰/, R7: /泛黃/, R8: /冷青/, R9: /褪紫/, R10: /粉白/,
  R12: /銅綠/, R13: /米黃/, R14: /暗鐵紅/, R17: /飾板/, R18: /吸音板/, R22: /裸露的鋼梯/, R27: /展示/, R28: /貿易/, R30: /黑鋼/,
};
const plates = () => [...prompts.matchAll(/```asset\n【素材】場景｜[^｜]+｜(\S+)\n([\s\S]*?)\n```/g)].map(m => [m[1], m[2].split('\n').slice(0, 3).join('\n')]);

test('route-end plates carry the colour and material of the rooms they leave and reach', () => {
  const all = plates();
  const routes = new Map();
  for (const [id, text] of all) {
    const t = id.match(/^T-([A-Z]\d+)b?-([A-Z]\d+)b?-(\d{2})$/);
    if (t) { const key = `${t[1]}-${t[2]}`; if (!routes.has(key)) routes.set(key, []); routes.get(key).push([id, text]); continue; }
    const room = id.replace(/b?-V\d+$/, '');
    if (ROOM_LOOK[room]) assert.match(text, ROOM_LOOK[room], `${id} shows ${room}`);
  }
  for (const [key, list] of routes) {
    const [from, to] = key.split('-');
    if (ROOM_LOOK[from]) assert.match(list[0][1], ROOM_LOOK[from], `${list[0][0]} shows ${from}`);
    if (ROOM_LOOK[to]) assert.match(list.at(-1)[1], ROOM_LOOK[to], `${list.at(-1)[0]} shows ${to}`);
  }
});

test('plates on the 8F–14F, 21F–27F and 33F–40F bands show the quake damage, and no other plate does', () => {
  const band = f => (f >= 8 && f <= 14) || (f >= 21 && f <= 27) || (f >= 33 && f <= 40);
  let quaked = 0;
  for (const [id, text] of plates()) {
    const content = text.split('\n')[0];
    const floors = [...content.replace(/這一段樓後來在震損中受創.*$/, '').matchAll(/(\d+)F/g)].map(m => +m[1]);
    const marked = content.includes('震損中受創');
    if (floors.length && band(floors[0])) assert.ok(marked, `${id} sits on a quake band`);
    if (marked) { quaked++; assert.ok(floors.some(band), `${id} marks quake damage off the bands`); }
  }
  assert.ok(quaked >= 20, 'quake bands are covered');
});

// Route pieces, close-up objects and sign text the act specs and scripts ask each plate to show (checked against the v2 images).
const MUST_SHOW = {
  'T-R2-R3-01': ['「收碗留後門」'],
  'T-R3-R5-01': ['半截鋼梯'],
  'T-R5-R6-01': ['濾籃', '溢流刻線', '旁通管的閥柄'],
  'T-R6-R7-02': ['只剩第一階', '空衣架', '固定鐵梯往上'],
  'T-R7-R8-01': ['「A栋 15F」', '「B栋 15F」'],
  'T-R11-R12-01': ['完整的鐵踏板'],
  'T-R11-R12-02': ['塔腳', '短梯'],
  'T-R12-R14-01': ['防塵片', '爬架'],
  'T-R13-R14-03': ['「A栋 26F」', '「B栋 26F」'],
  'T-R13-R15-03': ['「A栋 26F」', '「B栋 26F」'],
  'T-R15-R16-02': ['三站示意', '「29F」「30F」「31F」', '平層刻線'],
  'T-R12-R15-03': ['「A栋 26F」', '「B栋 26F」', '「低负荷通道」'],
  'T-R17-R18-01': ['側梯踏板', '壓斷'],
  'T-R17-R18-02': ['「皂盒／毛巾」', '「修理料」'],
  'T-R29-U4-02': ['「48F」', '平層刻線'],
  'T-U3-R28-01': ['「41F」', '停車凹位', '止擋'],
  'R16-V02': ['往上的鋼構坡道'],
};

test('plates show the route pieces, close-up objects and sign text their specs ask for', () => {
  const content = new Map([...prompts.matchAll(/```asset\n【素材】場景｜[^｜]+｜(\S+)\n(【內容】[^\n]*)/g)].map(m => [m[1], m[2]]));
  for (const [id, items] of Object.entries(MUST_SHOW)) for (const item of items) assert.ok(content.get(id)?.includes(item), `${id} shows ${item}`);
  assert.doesNotMatch(content.get('T-R29-U4-02'), /「47F」/, 'the sign up the shaft is the floor above');
});
