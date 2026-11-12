// Builds the upper-part video production lists from every （動畫演出／…） cue in the act scripts.
// 10-16 keeps its hand-written introduction and gets a generated overview; each upper act gets a
// fully generated list (10-17 to 10-21) whose segments carry a Chinese storyboard prompt for AI video tools
// and asset prompts (people, scene, props) for the reference images those tools take.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ACTS, APPENDIX, VIDEO_LIST, VIDEO_ACT_LISTS, VIDEO_DIRECTION, VIDEO_ASSETS } from './screenplay-files.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DOCS = path.join(ROOT, 'docs');
const UPPER = ACTS.slice(0, 5);
const CHECK = process.argv.includes('--check');
// Each type has its own text color in the reader (styles.css .video-*); app.js allows only these classes.
const TYPE_CLASSES = {
  第一人稱過場: 'video-cutscene', 第一人稱互動: 'video-interact', 第一人稱動作回饋: 'video-feedback',
  主觀記憶動畫: 'video-memory', 場景局部動畫: 'video-scene', 設備內影片: 'video-device', 設備即時影像: 'video-live',
};
const TYPES = Object.keys(TYPE_CLASSES);
const typeTag = (type, label = type) => `<span class="${TYPE_CLASSES[type]}">${label}</span>`;
const shortType = type => type.replace('第一人稱', '');
const BEGIN = '<!-- video-list:begin -->';
const END = '<!-- video-list:end -->';
const MEMORY_CONTRACT = '../09_劇本/09-15_正式劇本_共用附錄.md#memory-animation-contract';
const ANIMATION_CONTRACT = '../09_劇本/09-15_正式劇本_共用附錄.md#first-person-animation-contract';

const read = rel => readFileSync(path.join(DOCS, rel), 'utf8').replaceAll('\r\n', '\n');
const cell = value => String(value).replaceAll('|', '／').replaceAll('\n', ' ').trim();
const table = (headers, rows) => [headers, headers.map(() => '---'), ...rows]
  .map(row => `| ${row.map(cell).join(' | ')} |`).join('\n');
const IMAGE = /\b(?:T-[A-Z]\d+b?-[A-Z]\d+b?-\d{2}(?:-C\d{2})?|[PRU]\d+b?-[VCD]\d{2}(?:-C\d{2})?)\b/g;
const IMAGE_ID = new RegExp(`^${IMAGE.source}$`);
const plain = text => text
  .replace(/<!--[\s\S]*?-->/g, '')
  .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
  .replace(/\s+/g, ' ')
  .trim();
const fileName = rel => rel.split('/').at(-1);
const listFile = act => VIDEO_ACT_LISTS[UPPER.indexOf(act)];
const anchorOf = id => `v-${id.toLowerCase().replace('·', '-')}`;

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

// Sound and subtitle lines that follow a cue belong to it until the next picture, player or operation line.
const SOUND = /^(?:〔(?:環境|字幕|人聲)[^〕]*〕|（配音演出）|[\p{Script=Han}A-Za-z0-9·]{1,12}（[^）]+）「|主角「)/u;
function soundAfter(lines, i) {
  const found = [];
  for (let j = i + 1; j < lines.length && found.length < 4; j++) {
    const line = lines[j].trim();
    if (!line || /^<a id=/.test(line)) continue;
    if (!SOUND.test(line)) break;
    found.push(plain(line));
  }
  return found;
}

// Room and sub-scene names by code (「R1」→ 入口大廳, 「T-R2-R3-01」→ 後廚服務巷), for asset headings.
const TITLES = new Map();
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
      if (heading.code && !TITLES.has(heading.code)) TITLES.set(heading.code, heading.title);
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
      act, type, description, images, block, sound: soundAfter(lines, i),
      code: coded.code, title: coded.title, sub, anchor, room: stack.find(h => h.level === 3 && h.code)?.code,
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

// Picture rows of the act specs (| 畫面節點／圖號 | 用途 | 必畫內容 | …) give each prompt its first frame.
function pictureRows() {
  const rows = new Map();
  for (const act of UPPER) {
    let header = null;
    for (const line of read(act.specPath).split('\n')) {
      if (!line.startsWith('| ')) { header = null; continue; }
      const cells = line.slice(2, -2).split(' | ');
      if (!header) { header = cells; continue; }
      if (/^-+$/.test(cells[0]) || header[0] !== '畫面節點／圖號' || header[2] !== '必畫內容') continue;
      const id = cells[0].replaceAll('`', '').trim();
      if (IMAGE_ID.test(id) && !rows.has(id)) rows.set(id, { use: plain(cells[1]), draw: plain(cells[2]) });
    }
  }
  return rows;
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
    const kinds = Object.entries({ 過場: '第一人稱過場', 互動: '第一人稱互動', 動作回饋: '第一人稱動作回饋', 記憶: '主觀記憶動畫' })
      .filter(([word]) => method.split('；')[0].includes(word)).map(([, type]) => type);
    const byKind = matched.filter(c => kinds.includes(c.type));
    if (byKind.length) matched = byKind;
    const named = method.match(IMAGE) || [];
    const byImage = matched.filter(c => c.images.some(id => named.some(n => id === n || id.startsWith(n + '-'))));
    // Keep whole scenes: a picture match selects its scene, including cues there that name no picture.
    const scenes = new Set(byImage.map(c => c.code));
    if (byImage.length) matched = matched.filter(c => scenes.has(c.code));
    assert(matched.length, `Animation contract row matches no cue: ${name}`);
    for (const cue of matched) cue.key = { name, control: plain(control) };
    rows.push({ act, name, anchor, method, control, matched });
  }
  return rows;
}

// ---------- storyboard prompts ----------

// Where the script says "the player" for the first-person viewpoint, the prompt says the camera or her.
const VIEWPOINT = [
  [/玩家操作叫號機的位置/g, '鏡頭前的叫號機'], [/朝玩家站的方向/g, '朝鏡頭方向'], [/(朝向|對著)玩家/g, '$1鏡頭'],
  [/留在玩家眼前/g, '留在眼前'], [/玩家(?:躲著|所在)的/g, '鏡頭這側的'], [/玩家這側/g, '鏡頭這側'], [/玩家終端/g, '眼前終端'],
  [/玩家(?:把|的手)/g, m => m.replace('玩家', '她')], [/玩家動/g, '她一動'], [/玩家(切入凹位後|退回掩體時|走近)/g, '$1'],
  [/照玩家排好的/g, '照排好的'], [/沒有等玩家輸入，?/g, ''],
];
// A camera films what is there, so a stated absence that still matters to the shot is turned into the state it leaves.
const VISIBLE = [
  [/這\s*\d+(?:\.\d+)?\s*秒是/g, ''], [/飾板邊緣沒有封齊/g, '飾板邊緣封得參差'], [/結沒有鬆/g, '結仍扣緊'],
  [/紙沒有凹下去/g, '紙面始終平整'], [/掌中始終沒有藥/g, '掌心始終是空的'], [/沒有跟著淡/g, '仍留在原處'],
  [/它也沒有滾回去/g, '它仍停在那裡'], [/沒有退開/g, '仍停在原處'], [/的鏽屑沒有分開/g, '的鏽屑仍堆在原處'],
  [/的門扣沒有動/g, '的門扣始終靜止'], [/也不再擺/g, '也停止擺動'], [/沒有退回地漏，/g, ''],
  [/它們不往前一步，也不離開原位/g, '它們始終停在原位'], [/主動查看時恢復同步/g, '倒影恢復與她同步'],
  [/，那格門框上的綠點就亮/g, '，門框上的綠點一格接一格亮起'],
];
// Clauses that only state rules for input, saving, length or puzzle state are left out of the shot list.
const MECHANICS = new RegExp([
  '玩家', '任何(?:輸入|操作)', '一有輸入', '鎖輸入', '提交', '點選', '點回', '交還', '判定', '補救窗', '低動態', '讀檔', '略過', '不算', '回訪',
  '熱點', '條件', '筆記(?:不|只|更新|寫入|補)', '示範', '驗證', '憑證', '路由', '供電', '狀態', '不能', '可重試', '生效', '取消', '覆寫',
  '已讀', '索引', '證據', '不改', '仍需', '仍待', '可近看', '可查看', '等待', '標出', '方向字幕', '可見標記', '保持可用', '不只靠',
  '必要', '倒數', '抹除', '未處理', '演出', '本來就', '可橫穿', '不超過', '總長', '^(?:最長|前後|共)?約?\\s*\\d+(?:\\.\\d+)?\\s*秒$',
  '近看', '收起', '打開完整', '首次進', '至少\\s*\\d', '同一段\\s*\\d', '這\\s*\\d+(?:\\.\\d+)?\\s*秒', '^到\\s*\\d', '開始計', '共同顯示',
  '^那只是', '指定觀察', '^確認\\S{0,2}後$', '^記下', '退格', '^退出後$', '不要求', '保持連續',
].join('|'));
// What is only heard goes to the post-production cues, timed to the beat it lands on.
const HEARD = /(?<!噤)聲(?!源)|響|嗡|嘶|嗶|雜音|聽/;
// A clause that only carries a sound on ("……的金屬聲很短，在管子裡撞來撞去").
const ECHO = /^(?:在|又|再|慢慢|一直|最後|撞)/;
// A visible action with a sound tacked on ("鍵才悶悶地一聲落到底") keeps the action in the picture.
const TAGGED = /才?悶悶地一聲(?=落)|(?<=上)一聲$/;
// Absence and denial ("沒有被動過", "不是鏡像者") is nothing a camera can film.
const ABSENT = /沒有|沒人|不是|不再|不會|並非|不一齊|不先|也不|並不|卻不|^不(?!動|齊)/;
const NAMED_ABSENT = /(?:剩|是|成)沒有/;
// A sentence left with only its time clause ("安靜下來以後") goes whole to the sound cues.
const ORPHAN = text => text.length < 4 || /(?:以後|之後|後|時)$|^每[^，]{0,4}$/.test(text);
// A clause that opens with these words only finishes a dropped rule clause ("……，再對回待叫序列").
const DANGLING = clause => /^(?:再|才|便|就)/.test(clause) || (clause.length <= 8 && /就|便/.test(clause));
// A sentence led by a state condition ("已安息時，……", "提早放開，……") describes another variant of the same shot.
const VARIANT = /^(?:(?:已|若|如果|曾|全|部分)[^，]{0,20}(?:時|者|的話)|提早.*)$/;
// Framing limits ("only below the ankles") become a composition line instead of a timed beat.
const FRAMING = /^(?:畫面(?:始終)?只到|看不(?:到|見)(?:任何人的)?(?:臉|腳踝)|看得見的只有|眼前的紙和現在的手)/;
const CAPTION = /字幕「/;
const SECONDS = [
  /不超過(?:原\s*)?(\d+(?:\.\d+)?)\s*秒/, /(?:前後|最長|共)約\s*(\d+(?:\.\d+)?)\s*秒/, /固定\s*(\d+(?:\.\d+)?)\s*秒/,
  /同一段\s*(\d+(?:\.\d+)?)\s*秒/, /(\d+(?:\.\d+)?)\s*秒內/, /這\s*(\d+(?:\.\d+)?)\s*秒/,
];
// [shortest, longest, seconds per beat] used when the script gives no length.
const PACE = {
  第一人稱過場: [4, 10, 2.5], 第一人稱互動: [3, 8, 2], 第一人稱動作回饋: [1.5, 6, 1.2],
  主觀記憶動畫: [3, 6, 1.2], 場景局部動畫: [2, 8, 2], 設備內影片: [3, 10, 2.5], 設備即時影像: [3, 10, 2.5],
};
// Default camera of a segment without a direction note: the focal length of 10-22's shared camera language,
// a locked or body-led camera, and where the focus sits (see focusOf).
const CAMERA = {
  第一人稱過場: focus => `約 28mm 第一人稱主觀視線，接近人眼視角。只照分鏡緩慢推近或停住，不晃動、不旋轉、不快速轉向，地平線保持水平；${focus}；結尾停在與首格相同的視點與地標。`,
  第一人稱互動: focus => `約 28mm 第一人稱主觀視線，鏡位鎖定不動，要疊回原主圖，景深照首格。${focus}；只動分鏡點名的手、人物或物件，其餘背景保持靜止。`,
  第一人稱動作回饋: focus => `約 28mm 第一人稱主觀視線，鏡位鎖定不動，要疊回原主圖，景深照首格。${focus}；動作有重量，做完就停住，不加分鏡以外的動作。`,
  主觀記憶動畫: () => '約 35mm，從她當時的眼睛看出去，幾乎不動，只有極輕微的呼吸起伏；用焦點轉移代替運鏡，不推、不搖，不換成旁觀角度拍她。',
  場景局部動畫: focus => `約 28mm，鏡頭鎖定不動，要疊回原主圖，景深照首格。${focus}，其餘畫面保持靜止；不新增人物或物件。`,
  設備內影片: focus => `只生成設備螢幕裡播放的畫面本身（全幅，不含設備外框），後製再合成進螢幕遮罩。片內像固定機位的舊錄影，約 35mm、鏡頭不動，可以照分鏡切換畫面；${focus}。`,
  設備即時影像: focus => `只生成設備螢幕裡的即時畫面本身（全幅，不含設備外框），後製再合成進螢幕遮罩。像固定的監視鏡頭，鏡頭不動；${focus}。`,
};
const MOVING_CAMERA = focus => `約 28mm 第一人稱主觀視線。視點只照分鏡緩慢移動，由身體帶動、有重量與停頓，不晃動、不旋轉，地平線保持水平；${focus}；最後在分鏡寫的位置停穩。`;
const MOVING = /視點|鏡頭極慢|視野兩側退去|從腳邊退去|車廂上行/;
// The light sources a beat can name; only these change, and only when the storyboard says so.
const LIGHTS = /日光燈|消防燈|指示燈|電子燈|回路燈|紀錄燈|燈箱|反光條|反光標|綠點|綠光|窄光|亮縫|暖白光|暖光|螢幕|電視|手電筒|燈/g;
const LIGHT_CHANGE = /亮起|亮一下|亮回|亮綠|亮了|就亮|才亮|暗下|暗一|暗了|暗回|轉暗|熄|閃|明滅|掃過|照到|照出|淡白/;
const DELIVERY = {
  第一人稱過場: '成片可直接使用；頭尾各留一格與首格主圖對位，供程式切換。',
  第一人稱互動: 'AI 生成稿只作動態參考或底稿；正式交付拆成手部、前景遮擋與物件動態圖層，疊回原主圖，不以整支影片取代可點的場景。',
  第一人稱動作回饋: 'AI 生成稿只作動態參考或底稿；正式交付為疊在原主圖或近看上的短手部／物件動態圖層。',
  主觀記憶動畫: '併入觸碰物件的原近看或主圖素材項，另交記憶動畫分層與二至三張低動態記憶靜格。',
  場景局部動畫: '只取會動的局部，做成疊在原主圖或近看上的獨立動態圖層，其餘畫面沿用原圖。',
  設備內影片: '成片合成進設備螢幕遮罩；近看保留設備邊框，字幕與畫面文字後製加上。',
  設備即時影像: '成片合成進設備螢幕遮罩；近看保留設備邊框。',
};
const PALETTE = {
  device: '舊螢幕畫質：略低解析、輕微掃描線與色偏，亮度只在螢幕範圍內。',
  lobby: 'R1 大廳：廉價、均勻的暖白日光燈，乾淨得不自然；不加恐怖暗角，也不偏冷青。',
  now: '現在的暖黑：低飽和、潮濕、廢棄，深黑陰影佔大半，只有設備燈、消防燈或漏光照亮局部；光向與首格一致。',
  memory: '記憶色調：柔和低對比的暖褐微光，帶輕微顆粒與四周微暈；不用凝固層的單色冷青，也不加訊號雜訊。',
  dark: '深黑為主，只有畫面裡點名的光源發亮，低飽和。',
};
const PROTAGONIST_HAND =/(?:她|自己|主角)(?:的)?(?:雙手|右手|左手|手|指|拇指|指甲|指尖|指節|掌)|前景的(?:右|左)?手|撐地的手|手從視野下緣|她彎身|她用指/;
const FIGURE = /輪廓|殘留|人影|縫紉者|老周|阿尋|噤聲者|鏡像者|接待員|成年人|那人|三人|影邊|衣領|肩線|倒影/;
// Every clip is shot-on-camera realism: no game CG look and no stiff motion.
const STYLE = '寫實、極致逼真的真人實景拍攝質感：真實攝影機與自然光學，輕微景深、自然底片顆粒與真實曝光；皮膚、布料、金屬、水漬與灰塵都有真實細節。動作自然流暢，有重量與慣性，符合真實人體動作。不是遊戲 CG、不是 3D 算圖、不是插畫。';
const STYLE_DEVICE = '寫實、極致逼真的真人實拍錄影畫面，再疊上舊螢幕的質感；人物動作自然、不僵硬。不是遊戲 CG、不是 3D 算圖、不是動畫。';
const NEGATIVE = [
  '清楚可辨識的人臉五官', '任何可讀的文字、號碼、標誌、國旗或國名（畫面上的字留白或模糊，後製再合成）', '配樂',
  '血腥特寫、裸露', '手指數量或手部結構錯誤', '分鏡沒寫的人物、物件突然出現、消失或變形',
  '遊戲 CG 感、3D 算圖感、插畫、動漫或卡通畫風、塑膠般光滑的皮膚與材質', '動作僵硬、機械、卡頓、漂浮感或不自然的慢動作',
];

const fmt = n => String(Math.round(n * 10) / 10);
function sentences(text) {
  const out = [];
  let buf = '';
  let depth = 0;
  for (const ch of text) {
    buf += ch;
    if ('「（'.includes(ch)) depth++;
    else if ('」）'.includes(ch)) depth = Math.max(0, depth - 1);
    else if (!depth && '。；！？'.includes(ch)) { out.push(buf.trim()); buf = ''; }
  }
  if (buf.trim()) out.push(buf.trim());
  return out;
}
const tidy = text => text
  .replaceAll('**', '')
  .replace(/（[^）]*`[^）]*）/g, '')
  .replace(/沿\s*`[^`]+`\s*/g, '')
  .replaceAll('`', '')
  .replace(new RegExp(`(?:${IMAGE.source})\\s*`, 'g'), '')
  .replace(/^[，、\s]+/, '')
  .replace(/[；]$/, '。')
  .trim();

// One beat of a rule-built storyboard: what is seen, the sounds that land on it (at = where in the text they
// fall) and holds, the pauses that a sentence heard but not seen adds to it.
const beatOf = (text = '', sound = [], hold = 0) => ({ text, sound, hold });
const join = (a, b) => beatOf(a.text + b.text, [...a.sound, ...b.sound.map(s => ({ ...s, at: s.at + a.text.length }))], a.hold + b.hold);

function shots(cue) {
  const beats = [];
  const framing = [];
  let carry = beatOf();
  let total = 0;
  let visual = 0;
  let holds = 0;
  let captions = 0;
  const last = () => beats.at(-1) || carry;
  const hear = (beat, text, at, hold = 0) => { beat.sound.push({ text, at }); beat.hold += hold; holds += hold; };
  const described = [...VIEWPOINT, ...VISIBLE].reduce((text, [from, to]) => text.replace(from, to), cue.description);
  for (const raw of sentences(described)) {
    if (CAPTION.test(raw)) { captions++; hear(last(), tidy(raw), last().text.length); continue; }
    const end = /[。；！？]$/.test(raw) ? '。' : '';
    const clauses = raw.replace(/[。；！？]$/, '').split('，');
    if ((beats.length || carry.text) && VARIANT.test(clauses[0])) continue;
    total += raw.length;
    const kept = [];
    const heard = [];
    const order = [];
    const ruled = [];
    let dropped = false;
    let echo = false;
    let gone = false;
    for (const raw of clauses) {
      dropped = MECHANICS.test(raw) || (dropped && DANGLING(raw));
      if (dropped) { ruled.push(raw); echo = false; gone = true; continue; }
      // Once the rule or sound before it is gone, a clause reads without the "then" that tied it on.
      const clause = gone ? raw.replace(/^([^，]{2,14}?)[就便才](?=[^，])/, '$1') : raw;
      gone = false;
      if (TAGGED.test(clause) && !HEARD.test(clause.replace(TAGGED, ''))) {
        kept.push(clause.replace(TAGGED, '')); heard.push(clause); order.push(clause); echo = false; continue;
      }
      if (HEARD.test(clause) || (echo && ECHO.test(clause))) { heard.push(clause); order.push(clause); echo = true; gone = true; continue; }
      echo = false;
      if (ABSENT.test(clause) && !NAMED_ABSENT.test(clause)) continue;
      kept.push(clause);
      order.push(clause);
    }
    // What the sentence says apart from its rules; it sizes the beat as the script wrote it, and
    // framing limits keep their whole wording ("看得見的只有水紋，沒有腳踝以上").
    const framed = tidy(clauses.filter(clause => !ruled.includes(clause)).join('，'));
    if (FRAMING.test(framed)) { visual += framed.length; framing.push(framed + end); continue; }
    if (!framed || (framed.length < 6 && ruled.length)) continue;
    let text = tidy(kept.join('，'));
    const alone = heard.length && ORPHAN(text);
    const sound = heard.length ? tidy((alone ? order : heard).join('，')).replace(/^[卻也]/, '') + end : '';
    if (alone) text = '';
    visual += text.length + sound.length;
    if (!text) { if (sound) hear(last(), sound, last().text.length, framed.length >= 12 ? 1 : 0); continue; }
    // Very short sentences ride with a neighbouring beat so each beat is one readable action.
    const own = framed.length >= 12 && text.length >= 4;
    const beat = own ? join(carry, beatOf()) : last();
    const start = beat.text.length;
    beat.text += text + end;
    if (sound) hear(beat, sound, order[0] === heard[0] ? start : beat.text.length);
    if (own) { beats.push(beat); carry = beatOf(); }
  }
  if (carry.text) beats.push(carry);
  while (beats.length > 5) {
    let best = 0;
    for (let i = 1; i < beats.length - 1; i++) if (beats[i].text.length + beats[i + 1].text.length < beats[best].text.length + beats[best + 1].text.length) best = i;
    beats.splice(best, 2, join(beats[best], beats[best + 1]));
  }
  const loose = carry.text ? [] : carry.sound;
  // Mostly rules and state: better made as layer differences than generated as video.
  if (visual < total * 0.3 && !cue.key) loose.push(...beats.splice(0).flatMap(beat => beat.sound));
  return { beats, framing, loose, captions, slots: Math.min(5, beats.length + holds) };
}

function seconds(cue, slots) {
  // A beat heading such as 「拍點二｜趨光（4–10 秒）」 times the segment it holds.
  const span = cue.sub.match(/（(\d+(?:\.\d+)?)–(\d+(?:\.\d+)?) 秒）/);
  if (span) return { value: Number(span[2]) - Number(span[1]), stated: true };
  const about = cue.sub.match(/約 (\d+(?:\.\d+)?) 秒/);
  if (about) return { value: Number(about[1]), stated: true };
  for (const pattern of SECONDS) {
    const m = cue.description.match(pattern);
    if (m) return { value: Number(m[1]), stated: true };
  }
  const [low, high, each] = PACE[cue.type];
  if (cue.type === '主觀記憶動畫') return { value: 5, stated: false };
  return { value: Math.min(high, Math.max(low, Math.round(slots * each * 2) / 2)), stated: false };
}

// A beat's share of the cut: one unit, more for a held sound and for a beat crowded with clauses.
const weight = beat => 1 + beat.hold + Math.min(1, Math.max(0, (beat.text.match(/[，。；：]/g) || []).length - 2) * 0.25);
function marks(beats, total) {
  const sum = beats.reduce((s, beat) => s + weight(beat), 0);
  const out = [0];
  let acc = 0;
  beats.forEach((beat, i) => {
    acc += weight(beat);
    out.push(i === beats.length - 1 ? total : Math.max(out[i] + 0.5, Math.round(total * acc / sum * 2) / 2));
  });
  if (out.at(-1) < out.at(-2)) out[out.length - 1] = out.at(-2) + 0.5;
  return out;
}

// Every beat holds at least a second on screen; a shorter one joins its shorter neighbour.
function fit(beats, total) {
  const out = [...beats];
  while (out.length > 1) {
    const sum = out.reduce((s, beat) => s + weight(beat), 0);
    const share = out.map(beat => total * weight(beat) / sum);
    const i = share.indexOf(Math.min(...share));
    if (share[i] >= 1) break;
    const j = i === 0 ? 1 : i === out.length - 1 ? i - 1 : share[i - 1] <= share[i + 1] ? i - 1 : i + 1;
    const a = Math.min(i, j);
    out.splice(a, 2, join(out[a], out[a + 1]));
  }
  return out;
}

// A long single action is split at its commas so a clip of three seconds or more gets two or three timed beats.
function spread(beats, total) {
  const out = [...beats];
  const want = Math.min(3, Math.floor(total / 1.5));
  while (out.length && out.length < want) {
    const i = out.reduce((best, beat, j) => beat.text.length > out[best].text.length ? j : best, 0);
    const { text, sound, hold } = out[i];
    const parts = text.replace(/。$/, '').split('，');
    if (text.length < 24 || parts.length < 2 || text.includes('「')) break;
    let size = 0;
    let cut = 1;
    for (let k = 0; k < parts.length - 1; k++) {
      size += parts[k].length + 1;
      cut = k + 1;
      if (size >= text.length / 2) break;
    }
    const [head, tail] = [parts.slice(0, cut).join('，'), parts.slice(cut).join('，')];
    if (head.length < 8 || tail.length < 8) break;
    const early = sound.filter(s => s.at <= head.length);
    const late = sound.filter(s => s.at > head.length).map(s => ({ ...s, at: s.at - head.length - 1 }));
    out.splice(i, 1, beatOf(`${head}。`, early), beatOf(`${tail}。`, late, hold));
  }
  return out;
}

// ---------- direction notes ----------

// 10-22 holds hand-written shot, light and sound design for chosen segments; a note replaces the
// rule-built beats, camera line and sound list of its segment's prompt.
const quotes = text => text.match(/「[^」]+」/g) || [];
function directionNotes(cues, pictures) {
  const text = read(VIDEO_DIRECTION);
  const notes = new Map();
  const NOTE = /<a id="(vd-[a-z0-9-]+)"><\/a>\n\n### (\S+)　(.+)\n\n([\s\S]*?)(?=\n<a id="vd-|\n## |$)/g;
  for (const [, anchor, id, name, body] of text.matchAll(NOTE)) {
    const cue = cues.find(c => c.id === id);
    assert(cue, `${VIDEO_DIRECTION}: ${id} is not an animation segment`);
    assert.equal(anchor, anchorOf(id).replace(/^v-/, 'vd-'), `${id}: note anchor`);
    assert(!notes.has(id), `${id}: one note per segment`);
    const field = label => body.match(new RegExp(`^- \\*\\*${label}：\\*\\*(.+)$`, 'm'))?.[1].trim();
    const note = { id, name, anchor, match: field('對應描述'), mood: field('情緒節奏'), camera: field('鏡頭'), light: field('光'), end: field('尾格') };
    for (const key of ['match', 'mood', 'camera', 'light']) assert(note[key], `${id}: note needs ${key}`);
    assert(plain(cue.description).replaceAll('**', '').includes(note.match), `${id}: 對應描述「${note.match}」no longer matches the script; re-check the note`);
    if (note.end) assert(pictures.has(note.end), `${id}: 尾格 ${note.end} has no picture row`);
    note.rows = [...body.matchAll(/^\| (\d+(?:\.\d+)?)–(\d+(?:\.\d+)?) \| (.+?) \| (.+?) \|$/gm)]
      .map(([, from, to, picture, sound]) => ({ from: Number(from), to: Number(to), picture, sound: sound === '—' ? '' : sound }));
    assert(note.rows.length >= 1 && note.rows.length <= 6, `${id}: 1–6 timed rows`);
    note.rows.forEach((row, i) => assert.equal(row.from, i ? note.rows[i - 1].to : 0, `${id}: rows are continuous from 0`));
    const heard = note.rows.map(row => row.sound).join('');
    for (const quote of quotes(cue.sound.join(''))) assert(heard.includes(quote), `${id}: the note times the script line ${quote} word for word`);
    notes.set(id, note);
  }
  return notes;
}

// Where the default camera holds focus: her hand and what it touches, a figure, or the part that changes.
// A registered prop is named only when the script names it too.
function focusOf(cue, device) {
  const prop = cue.assets?.props.map(p => p.name.replace(/（[^）]*）$/, '')).find(name => cue.description.includes(name));
  if (device) return FIGURE.test(cue.description) || /嘴|肩膀|手/.test(cue.description) ? '焦點在片中人物的嘴、肩膀與手' : '焦點在分鏡點名的物件與畫面變化';
  const hand = PROTAGONIST_HAND.test(cue.description) && `焦點先在她的手，手碰到的${prop || '物件'}跟著收清`;
  const figure = FIGURE.test(cue.description) && '焦點在分鏡點名的人物、倒影或異變者，前景與背景略微失焦';
  // In her own action the hand leads; elsewhere what moves against her does.
  if (hand || figure) return cue.type === '第一人稱動作回饋' ? hand || figure : figure || hand;
  return prop ? `焦點落在${prop}與分鏡點名會變化的局部` : '焦點落在分鏡點名會變化的局部';
}
// The light of a rule-built segment: which of the first frame's sources change, if any.
function lightOf(beats) {
  const seen = beats.map(beat => beat.text).join('');
  if (!LIGHT_CHANGE.test(seen)) return '整段光源與明暗都不變。';
  const found = [...new Set(seen.match(LIGHTS) || [])];
  const names = found.filter(name => !found.some(other => other !== name && other.includes(name)));
  return names.length
    ? `光的變化只來自首格既有的${names.join('、')}，照分鏡的時間點亮暗，其餘的光不動。`
    : '分鏡寫的明暗變化只發生在點名的局部，其餘的光不動。';
}

function prompt(cue, previous, pictures, note) {
  const shot = shots(cue);
  const { framing } = shot;
  const memory = cue.type === '主觀記憶動畫';
  // A script-stated length binds the note too; otherwise the note's own timing sets the cut.
  const counted = seconds(cue, shot.slots);
  const length = note && !counted.stated && !memory ? { value: note.rows.at(-1).to, stated: false } : counted;
  const device = cue.type.startsWith('設備');
  const total = memory ? 5 : length.value;
  const beats = fit(spread(shot.beats, total), total);
  const at = marks(beats, total);
  const image = cue.images[0];
  const picture = image && pictures.get(image);
  const draw = picture && picture.draw.split(/[。；]/)[0].trim();
  const frame = picture ? `${image}（${picture.use}：${draw.length > 60 ? draw.slice(0, 60).replace(/[，、；\s]*$/, '') + '…' : draw}）` : '';
  const moving = !device && !memory && cue.type !== '第一人稱過場' && MOVING.test(cue.description);
  const continued = previous && previous.code === cue.code && previous.images[0] === image && !memory && previous.type !== '主觀記憶動畫';
  const lines = [];
  lines.push(`【影片】${cue.id}｜${cue.type}｜${cue.act.name} ${cue.code} ${cue.title}`);
  if (memory) {
    lines.push(`【生成方式】先依分鏡第一格生成一張寫實實拍的記憶首格${image ? `（併入 ${image} 素材項的記憶分層）` : ''}，再用圖生影片。`);
  } else if (device) {
    lines.push(`【生成方式】圖生影片：首格是${image ? ` ${image} ` : '設備'}螢幕裡播放的畫面，做成真人實拍的錄影畫面，不含設備外框。`);
  } else if (moving) {
    lines.push(`【生成方式】首尾格生影片：終點停在 ${frame || `${cue.code} 本場次主圖`} 的視點與構圖；起點依分鏡第一格另做一張寫實實拍的首格。構圖、光源與物件位置照定稿。`);
  } else if (continued) {
    lines.push(`【生成方式】圖生影片：首格用上一段 ${previous.id} 的最後一格，保持構圖、光線、色調、人物與物件造型不變，只加入下列動作。`);
  } else if (frame) {
    lines.push(`【生成方式】圖生影片：首格直接用 ${frame} 的寫實定稿圖；構圖、光線、人物與物件造型保持不變，只加入下列動作。`);
  } else {
    lines.push(`【生成方式】圖生影片：首格直接用 ${cue.code} 本場次主圖的寫實定稿圖（劇本未點名圖號，見同幕製作規格圖像表）；構圖、光線與造型保持不變，只加入下列動作。`);
  }
  if (note?.end) {
    const end = pictures.get(note.end);
    const start = continued ? `用上一段 ${previous.id} 的最後一格` : frame ? `直接用 ${frame} 的寫實定稿圖` : `直接用 ${cue.code} 本場次主圖的寫實定稿圖`;
    lines[lines.length - 1] = `【生成方式】首尾格生影片：首格${start}；尾格停在 ${note.end}（${end.use}）的視點與構圖。中間照分鏡過渡，光線與物件位置以尾格定稿為準。`;
  }
  const cut = memory ? '約 5 秒（可在 3–6 秒間）' : `約 ${fmt(length.value)} 秒${length.stated ? '（劇本指定）' : ''}`;
  lines.push(`【長度】剪用${cut}；${length.value > 10 ? '分兩段各生成 5–10 秒，接剪後裁切' : `生成 ${length.value > 5 ? 10 : 5} 秒後裁切`}。`);
  if (note) {
    assert.equal(note.rows.at(-1).to, total, `${cue.id}: direction rows end at the cut length`);
    lines.push(`【情緒節奏】${note.mood}`);
    lines.push('【分鏡】', ...note.rows.map(row => `${fmt(row.from)}–${fmt(row.to)} 秒｜${row.picture}`));
  } else if (beats.length) {
    lines.push('【分鏡】', ...beats.map((beat, i) => `${fmt(at[i])}–${fmt(at[i + 1])} 秒｜${beat.text}`));
  } else {
    lines.push('【分鏡】本段主要是介面、燈號或狀態變化，建議直接以圖層差分製作，不需要 AI 生成影片；細節見上方劇本描述。');
  }
  const focus = focusOf(cue, device);
  const camera = moving ? MOVING_CAMERA(focus) : CAMERA[cue.type](focus);
  lines.push(`【鏡頭】${note ? note.camera : camera}`);
  if (framing.length && !memory) lines.push(`【構圖限制】${framing.join('')}`);
  if (memory) {
    const crop = cue.description.match(/畫面只到([^，。；]+)/)?.[1] || '肩膀以下';
    lines.push(`【人物】她的手與前臂可入鏡，衣袖素色、無圖案。另一個人只以米色、過長、蓋到指節的袖口辨認；構圖只到${crop}，看不見任何人的臉。`);
    lines.push(`【光線色調】${note ? note.light : ''}記憶色調：柔和低對比的暖褐微光，帶輕微顆粒與四周微暈，像隔著一層舊塑膠片看；不用凝固層的單色冷青，也不加訊號雜訊。光源只用分鏡裡原有的。`);
  } else {
    const hands = [];
    if (!device && PROTAGONIST_HAND.test(cue.description)) hands.push('她的手只露出手與白襯衫袖口，手背乾裂、有擦傷，從畫面下緣入鏡；五指比例正確。');
    if (FIGURE.test(cue.description)) hands.push(device ? '片中人物的臉要被裁切、壓縮或模糊，只看得清嘴形、肩膀與手；不做清晰肖像。' : '人物與異變者照首格的造型與位置，臉不給清楚五官（無臉、背光或被遮住），動作緩慢但連貫自然。');
    if (hands.length) lines.push(`【人物】${hands.join('')}`);
    const palette = device ? PALETTE.device
      : cue.type === '第一人稱過場' ? (note ? '' : '照首格與分鏡：深黑為主，只有分鏡點名的光源發亮，低飽和。')
      : /^R1-/.test(cue.code) ? PALETTE.lobby : PALETTE.now;
    lines.push(`【光線色調】${note ? note.light : ''}${palette}${note ? '' : lightOf(beats)}`);
  }
  lines.push(`【影片風格】${device ? STYLE_DEVICE : STYLE}`);
  const texts = [...new Set(beats.map(beat => beat.text).join('').match(/「[^」]+」/g) || [])];
  // Sound notes keep what is heard; remarks on what the player can work out stay in the script.
  const script = cue.sound.map(line => sentences(line).filter(s => !s.includes('玩家')).join('')).filter(Boolean);
  // Without a note, what the description says is heard is timed to its beat; the script's own sound
  // lines run under the whole segment and are placed in the edit.
  const heard = note ? [] : [
    ...beats.flatMap((beat, i) => beat.sound.length ? [`・${fmt(at[i])}–${fmt(at[i + 1])} 秒：${beat.sound.map(s => s.text).join('')}`] : []),
    ...[...shot.loose.map(s => s.text), ...script].map(line => `・整段：${line}`),
  ];
  // A direction note times every sound and composited text to the beat it lands on.
  // A cell that names its own moment (「2.3 秒：…」) keeps it; otherwise the cue spans its row.
  const timed = note ? note.rows.filter(row => row.sound).map(row => /^\d+(?:\.\d+)? 秒：/.test(row.sound) ? `・${row.sound}` : `・${fmt(row.from)}–${fmt(row.to)} 秒：${row.sound}`) : [];
  if (texts.length || (note ? script.length || shot.captions || timed.length : heard.length)) {
    lines.push('【後製（不進 AI 生成）】');
    if (texts.length) lines.push(`畫面文字：${texts.join('、')}`);
    if (note || heard.length) lines.push('聲音與後製對點：', ...(note ? timed : heard));
  }
  const negative = [...NEGATIVE];
  if (!device) negative.splice(3, 0, '第三人稱或看見主角全身', cue.type === '第一人稱過場' || camera.includes('視點只照') ? '鏡頭晃動或突然換景' : '鏡頭晃動、推移或換景');
  if (memory) negative.push('冷青色調或訊號雜訊', '對方的臉、名牌或可讀的名字');
  lines.push(`【不要出現】${negative.join('；')}。`);
  return { text: lines.join('\n'), length, empty: !beats.length && !note };
}

// ---------- importance ----------

// Production priority: 高 is made first and to final quality, 中 next, 低 last (it may ship as its low-motion stills first).
// Each badge has its own reader style (styles.css .importance-*); app.js allows only these classes.
const LEVEL_CLASSES = { 高: 'importance-high', 中: 'importance-mid', 低: 'importance-low' };
const LEVELS = Object.keys(LEVEL_CLASSES);
const levelTag = level => `<span class="${LEVEL_CLASSES[level]}">${level}</span>`;
// Something approaching, following or watching her: the player has to read it.
const THREAT = /過來|逼|朝她|跟著她|並排|朝這側|這邊推|門縫下|腳印|拖鞋|腳跟|一步|每一聲落下|輪廓|殘留|指影|肩線|影邊|一扇接一扇|一格接一格|一支接一支/;
// Her own body remembering, or the objects the two of them shared.
const BODY = /手(?:會)?自己|沒有等玩家/;
const SHARED = /照片|布結|紙花|雙結/;
function importance(cue, next) {
  if (cue.key) return ['高', `重點橋段：${cue.key.name}`];
  if (cue.type === '第一人稱過場') return ['高', '劇情過場'];
  if (cue.type === '主觀記憶動畫') return ['高', '主觀記憶'];
  if (cue.prompt.empty) return ['低', '介面或狀態變化，做圖層差分'];
  if (cue.type === '第一人稱互動') return ['中', '操作中的現場動態'];
  if (cue.type === '設備內影片') return ['中', '設備裡的劇情影片'];
  if (cue.type === '場景局部動畫') return THREAT.test(cue.description) ? ['中', '逼近或異常的前兆'] : ['低', '環境氣氛'];
  if (next?.code === cue.code && next.type === '主觀記憶動畫') return ['中', '接主觀記憶的觸碰'];
  if (BODY.test(cue.description)) return ['中', '手自己動起來的身體記憶'];
  if (SHARED.test(cue.description)) return ['中', '兩人共有的物件'];
  return cue.prompt.length.value >= 3 ? ['中', '較長的動作回饋'] : ['低', '短動作回饋'];
}

// ---------- asset prompts ----------

// 10-23 registers people, hand-written scenes and props; each entry names the segments it appears in
// (場次, 類型, 認法 words of the script description). Scenes of ordinary segments are built from the
// picture rows and the scripts' static-shot lines instead.
const ASSET_KINDS = { 人物與生物: '人物', 場景: '場景', 物品: '物品' };
const ASSET_FRAME = {
  人物: '人物參考圖：中性灰背景、柔和均勻光；正面、側面、背面三視角，外加衣物與手部細節特寫；臉一律背光、失焦或出框。',
  物品: '物品參考圖：單一物件置中，中性深灰背景、柔和側光；正面、背面與局部特寫三個角度，比例照實物。',
};
const STILL = '寫實、極致逼真的真人實景攝影質感：真實相機與自然光學，輕微景深與自然底片顆粒；皮膚、布料、金屬、水漬與灰塵都有真實細節。不是遊戲 CG、不是 3D 算圖、不是插畫。';
const ASSET_NEGATIVE = [
  '清楚可辨識的人臉五官', '任何可讀的文字、號碼、標誌、國旗或國名（字留白或模糊，後製再合成）', '血腥特寫、裸露',
  '遊戲 CG 感、3D 算圖感、插畫、動漫或卡通畫風、塑膠般光滑的皮膚與材質',
];
const ASSET_EXTRA = { 人物: '名牌或品牌標誌；手指數量或手部結構錯誤', 場景: '任何人物、手、人影或異變者', 物品: '人物與手' };
const inScope = (cue, scope) => scope === '全部' || cue.id === scope || cue.code === scope || cue.code.startsWith(`${scope}-`);
const seen = cue => cue.description.replaceAll('**', '');

function assetRegistry(cues) {
  const entries = [];
  for (const part of read(VIDEO_ASSETS).split(/\n(?=## )/)) {
    const kind = ASSET_KINDS[part.match(/^## (.+)$/m)?.[1]];
    if (!kind) continue;
    for (const [, anchor, name, body] of part.matchAll(/<a id="(va-[a-z0-9-]+)"><\/a>\n\n### (.+)\n\n([\s\S]*?)(?=\n<a id="|$)/g)) {
      const field = label => body.match(new RegExp(`^- \\*\\*${label}：\\*\\*(.+)$`, 'm'))?.[1].trim();
      const list = (label, sep) => (field(label) || '').split(sep).map(s => s.trim()).filter(Boolean);
      const entry = {
        kind, anchor, name, scope: list('場次', '、'), types: list('類型', '、'), words: list('認法', '｜'), skip: list('排除', '、'),
        frame: field('構圖'), text: field('素材提示詞'), avoid: field('不要出現'),
      };
      assert(entry.scope.length && entry.text, `${VIDEO_ASSETS}: ${name} needs 場次 and 素材提示詞`);
      assert(!/[、｜]/.test(name), `${VIDEO_ASSETS}: ${name}: names are listed with 、 and ｜, so they cannot contain them`);
      assert(kind !== '場景' || entry.frame, `${VIDEO_ASSETS}: scene ${name} needs 構圖`);
      for (const type of entry.types) assert(TYPES.includes(type), `${name}: unknown type ${type}`);
      for (const scope of [...entry.scope, ...entry.skip]) assert(cues.some(c => inScope(c, scope)), `${name}: 場次 ${scope} matches no segment`);
      entries.push(entry);
    }
  }
  return entries;
}
const applies = (entry, cue) => entry.scope.some(s => inScope(cue, s)) && !entry.skip.some(s => inScope(cue, s))
  && (!entry.types.length || entry.types.includes(cue.type)) && (!entry.words.length || entry.words.some(w => seen(cue).includes(w)));

// The first static-shot line that links a picture describes it; indented 前景／中景／背景 lines continue it.
function staticShots() {
  const shots = new Map();
  for (const act of UPPER) {
    const lines = read(act.path).split('\n');
    lines.forEach((line, i) => {
      const m = line.match(/^（靜態畫面／[^）]+）\s*(.*)$/);
      if (!m) return;
      let text = m[1];
      for (let j = i + 1; j < lines.length && lines[j].startsWith('　'); j++) text += lines[j].trim();
      for (const id of new Set(line.match(IMAGE) || [])) if (!shots.has(id)) shots.set(id, plain(text));
    });
  }
  return shots;
}
// An empty plate keeps only the place: clauses about people, hands, traces of figures, sound, camera,
// routes and production or player rules are dropped; codes go, the things they label stay.
const PERSON = /(?<![扶把拉握提徒助選對])手(?![冊機套寫電推柄勢])|掌心|指尖|主觀視野|殘影|輪廓|人影|鞋影|身影|她|主角|屈膝|牛仔褲|噤聲者|怨靈|異變|鞋底/;
const ENV_RULE = new RegExp([
  '玩家', '任何(?:輸入|操作)', '判定', '條件', '狀態', '驗證', '可查看', '近看', '可辨', '差分', '另交', '另層', '座標', '辨認', '依據',
  '只能', '才可', '尚未', '只管', '雙重', '保存', '減少動態', '字幕', '第一人稱', '提前', '→', '跨門', '不再次', '注意力', '安排',
  '對位', '同框', '示意', '避開', '開始', '接景', '核對', '抹除', '視線', '視角', '這一眼', '由遠及近', '爬', '推開', '聲(?!軌|源)', '筆記(?:不|只|更新|寫入|補|中)',
  '熱點', '不變成', '不新增', '共用資產', '才露出', '穿越',
].join('|'));
const CODE = /\b[A-Z]{1,3}\d?(?:-[A-Z]?\d+)+\b\s*/g;
function scenery(text, kept = '') {
  const out = [];
  const cleaned = tidy(text || '').replace(CODE, '').replace(/\s+[、–～\s]*(?=[。，；]|$)/g, '').replace(/、(?=及|與|和)/g, '');
  for (const raw of sentences(cleaned)) {
    const clauses = raw.replace(/[。；！？]$/, '').split('，')
      .filter(c => c.trim().length > 1 && !ENV_RULE.test(c) && !PERSON.test(c));
    const sentence = `${clauses.join('，').replace(/^[：、\s]+/, '')}。`;
    if (sentence.length > 2 && !(kept + out.join('')).includes(sentence)) out.push(sentence);
  }
  return out.join('');
}
// A transition scene is its own place; any other picture belongs to the main picture of its room.
function placeOf(cue) {
  const image = cue.images[0];
  const scene = image?.match(/^T-[A-Z]\d+b?-[A-Z]\d+b?-\d{2}/)?.[0];
  if (scene) return { code: scene, base: pictures.has(scene) ? scene : image, focus: image };
  const room = image ? image.match(/^([PRU]\d+b?)-/)[1] : cue.room;
  return room && { code: room, base: `${room}-V01`, focus: image || `${room}-V01` };
}
function assetPalette(cue) {
  if (cue.type === '主觀記憶動畫') return PALETTE.memory;
  if (cue.type.startsWith('設備')) return PALETTE.device;
  if (cue.type === '第一人稱過場') return PALETTE.dark;
  return /^R1-/.test(cue.code) ? PALETTE.lobby : PALETTE.now;
}
function assetBlock(kind, name, cue, lines) {
  return [`【素材】${kind}｜${name}｜${cue.id}`, ...lines].join('\n');
}
function negative(kind, avoid) {
  return `【不要出現】${[...(avoid ? avoid.split('；') : []), ASSET_EXTRA[kind], ...ASSET_NEGATIVE].join('；')}。`;
}
function sceneAsset(cue, entry) {
  if (entry) {
    return { name: entry.name, link: entry.anchor, text: assetBlock('場景', entry.name, cue, [
      `【內容】${entry.text}`, `【構圖】${entry.frame}`, `【光線色調】${assetPalette(cue)}`, `【風格】${STILL}`, negative('場景', entry.avoid),
    ]) };
  }
  const place = placeOf(cue);
  assert(place && pictures.has(place.base), `${cue.id}: no picture to build its scene from; add a scene to ${VIDEO_ASSETS}`);
  const layer = id => {
    const row = pictures.get(id);
    const draw = scenery(row.draw);
    const text = draw + scenery(statics.get(id), draw);
    return text ? `${id}（${row.use}）：${text}` : `${id}（${row.use}），構圖照本段首格。`;
  };
  const close = place.focus !== place.base;
  const name = `${place.code} ${TITLES.get(place.code) || pictures.get(place.base).use}`;
  const content = [`【內容】寫實實景的空景，不含任何人物與手。`, `空間：${layer(place.base)}`];
  if (close) content.push(`本段畫面：${layer(place.focus)}`);
  const frame = close
    ? '空景參考兩張：一張照「空間」的全景，第一人稱站立視線高度、約 28mm 人眼視角、平視、地平線水平；一張照「本段畫面」的近看構圖，與本段首格一致。都不含人物、手與人影。'
    : '空景參考：第一人稱站立視線高度、約 28mm 人眼視角、平視、地平線水平；構圖與本段首格一致，不含人物、手與人影。';
  return { name, text: assetBlock('場景', name, cue, [...content, `【構圖】${frame}`, `【光線色調】${assetPalette(cue)}`, `【風格】${STILL}`, negative('場景')]) };
}
function assets(cue, registry) {
  const matched = registry.filter(entry => applies(entry, cue));
  const scenes = matched.filter(e => e.kind === '場景');
  assert(scenes.length <= 1, `${cue.id}: more than one scene in ${VIDEO_ASSETS}: ${scenes.map(e => e.name).join('、')}`);
  if (cue.type === '主觀記憶動畫' || cue.type.startsWith('設備')) assert(scenes.length, `${cue.id}: memories and device videos need a scene in ${VIDEO_ASSETS}`);
  const item = entry => ({ name: entry.name, link: entry.anchor, text: assetBlock(entry.kind, entry.name, cue, [
    `【內容】${entry.text}`, `【構圖】${entry.frame || ASSET_FRAME[entry.kind]}`, `【風格】${STILL}`, negative(entry.kind, entry.avoid),
  ]) });
  return {
    people: matched.filter(e => e.kind === '人物').map(item),
    scene: sceneAsset(cue, scenes[0]),
    props: matched.filter(e => e.kind === '物品').map(item),
  };
}

// ---------- output ----------

const cues = UPPER.flatMap(collect);
const bridges = keyBridges(cues);
const pictures = pictureRows();
for (const cue of cues) for (const id of cue.images) assert(pictures.has(id), `${cue.id}: picture ${id} has no row in the act spec`);
const usedTypes = TYPES.filter(t => cues.some(c => c.type === t));
const notes = directionNotes(cues, pictures);
const statics = staticShots();
const registry = assetRegistry(cues);
const noteLink = cue => `[${cue.id} ${cue.note.name}](${fileName(VIDEO_DIRECTION)}#${cue.note.anchor})`;
const assetLink = asset => asset.link ? `[${asset.name}](${fileName(VIDEO_ASSETS)}#${asset.link})` : asset.name;
cues.forEach((cue, i) => {
  const previous = cues[i - 1]?.act === cue.act ? cues[i - 1] : null;
  cue.assets = assets(cue, registry);
  cue.prompt = prompt(cue, previous, pictures, notes.get(cue.id));
  cue.note = notes.get(cue.id);
});
for (const entry of registry) assert(cues.some(c => applies(entry, c)), `${VIDEO_ASSETS}: ${entry.name} is used by no segment`);
cues.forEach((cue, i) => { [cue.level, cue.reason] = importance(cue, cues[i + 1]); });
const overview = read(VIDEO_LIST);
const updated = overview.match(/^更新: (\d{4}-\d{2}-\d{2})$/m)[1];
const status = overview.match(/^狀態: (.+)$/m)[1];

function actList(act) {
  const own = cues.filter(c => c.act === act);
  const index = UPPER.indexOf(act);
  const out = [];
  out.push('---', `文件: 製作規格｜影片製作列表・${act.name}`, `狀態: ${status}`, `更新: ${updated}`,
    `摘要: ${act.name}〈${act.subtitle}〉${own.length} 段動畫演出的製作列表；每段附劇本描述、首格圖號、AI 生成影片用的中文分鏡提示詞，以及人物、場景與物品的素材提示詞。`, '---', '');
  out.push(`<a id="video-act-${act.act}"></a>`, '', `# 影片製作列表・${act.name} · ${act.subtitle}（${own.length} 段）`, '');
  out.push(`> 本頁由 \`node tools/build-video-list.mjs\` 依[${act.name}劇本](../${act.path})與[${act.name}製作規格](${fileName(act.specPath)})產生，請勿手改；要改動畫，請改劇本或同幕圖像表，要改鏡頭、光與聲音設計，請改[影片導演註記](${fileName(VIDEO_DIRECTION)})，要改人物、場景與物品素材，請改[影片素材設定](${fileName(VIDEO_ASSETS)})，再重新執行。提示詞的用法、共用影片風格與禁止事項見[總表的提示詞說明](${fileName(VIDEO_LIST)}#video-prompt-guide)。`, '');
  const nav = [`[影片製作總表](${fileName(VIDEO_LIST)}#video-catalog)`];
  if (index > 0) nav.push(`[上一幕：${UPPER[index - 1].name}](${fileName(listFile(UPPER[index - 1]))})`);
  if (index < UPPER.length - 1) nav.push(`[下一幕：${UPPER[index + 1].name}](${fileName(listFile(UPPER[index + 1]))})`);
  nav.push(`[第一人稱動畫製作與交接](${ANIMATION_CONTRACT})`);
  out.push(nav.join(' · '), '');
  out.push('## 本幕統計', '');
  const types = usedTypes.filter(t => own.some(c => c.type === t));
  out.push(table([...types.map(t => typeTag(t)), '合計'], [[...types.map(t => own.filter(c => c.type === t).length), own.length]]), '');
  out.push(table(['重要級別', ...LEVELS.map(levelTag), '合計'], [['段數', ...LEVELS.map(level => own.filter(c => c.level === level).length), own.length]]), '');
  const directed = own.filter(c => c.note);
  const highs = own.filter(c => c.level === '高');
  out.push(`本幕重要級別 ${levelTag('高')} 的段落：${own.filter(c => c.level === '高').map(c => `\`${c.id}\``).join('、')}。分級方式見[總表的重要級別](${fileName(VIDEO_LIST)}#video-importance)。`, '');
  out.push(`導演註記：已寫 ${directed.length} 段（高級別 ${highs.filter(c => c.note).length}／${highs.length} 段）${directed.length ? `，${directed.map(noteLink).join('、')}` : ''}。寫了註記的段落，提示詞的分鏡、鏡頭與聲音改用註記。`, '');
  const keys = bridges.filter(b => b.act === act);
  if (keys.length) {
    out.push(`本幕重點橋段 ★：${keys.map(b => `${b.name}（${b.matched.map(c => c.id).join('、')}）`).join('；')}。控制交接見[總表重點橋段](${fileName(VIDEO_LIST)}#video-key-bridges)。`, '');
  }
  let scene = null;
  for (const cue of own) {
    if (cue.code !== scene) {
      scene = cue.code;
      const count = own.filter(c => c.code === scene).length;
      out.push(`## ${cue.code} ${cue.title}（${count} 段）`, '');
    }
    const built = cue.prompt;
    out.push(`<a id="${anchorOf(cue.id)}"></a>`, '', `### ${cue.id}　${shortType(cue.type)}（${cue.level}）`, '');
    out.push(`- **重要級別：**${levelTag(cue.level)}　${cue.reason}`);
    const facts = [`**類型：**${typeTag(cue.type)}`];
    facts.push(`**畫面：**${cue.images.length ? cue.images.map(id => `\`${id}\``).join('、') : '本場次主圖'}`);
    facts.push(`**剪用：**${cue.type === '主觀記憶動畫' ? '約 3–6 秒' : `約 ${fmt(built.length.value)} 秒`}`);
    out.push(`- ${facts.join('　')}`);
    out.push(`- **劇本：**[${cue.code} ${cue.title}](../${act.path}#${cue.anchor})${cue.sub ? `｜${cue.sub}` : ''}`);
    out.push(`- **交付：**${DELIVERY[cue.type]}`);
    if (cue.type === '主觀記憶動畫') out.push(`- **規則：**[主觀記憶動畫](${MEMORY_CONTRACT})：只到肩膀以下、不給臉與名字，任何輸入立即結束。`);
    if (cue.key) out.push(`- **重點 ★ ${cue.key.name}：**${cue.key.control}`);
    if (cue.note) out.push(`- **導演註記：**${noteLink(cue)}`);
    out.push('', `**劇本描述**　${cue.description}`, '');
    out.push('```prompt', built.text, '```', '');
    const { people, scene: place, props } = cue.assets;
    const names = list => list.length ? list.map(assetLink).join('、') : '無';
    out.push(`**素材提示詞**　人物：${names(people)}｜場景：${assetLink(place)}｜物品：${names(props)}`, '');
    for (const asset of [...people, place, ...props]) out.push('```asset', asset.text, '```', '');
  }
  return out.join('\n').trim() + '\n';
}

const outputs = new Map(UPPER.map(act => [listFile(act), actList(act)]));

const region = [];
region.push('## 統計', '');
region.push(table(['幕', ...usedTypes.map(t => typeTag(t)), '合計'], [
  ...UPPER.map(act => {
    const own = cues.filter(c => c.act === act);
    return [`[${act.name} · ${act.subtitle}](${fileName(listFile(act))})`, ...usedTypes.map(t => own.filter(c => c.type === t).length), own.length];
  }),
  ['**上部合計**', ...usedTypes.map(t => cues.filter(c => c.type === t).length), `**${cues.length}**`],
]), '');
region.push('<a id="video-importance-count"></a>', '', '## 重要級別統計', '');
region.push(table(['幕', ...LEVELS.map(levelTag), '合計', '已寫導演註記'], [
  ...UPPER.map(act => {
    const own = cues.filter(c => c.act === act);
    return [`[${act.name} · ${act.subtitle}](${fileName(listFile(act))})`, ...LEVELS.map(level => own.filter(c => c.level === level).length), own.length, own.filter(c => c.note).length];
  }),
  ['**上部合計**', ...LEVELS.map(level => cues.filter(c => c.level === level).length), `**${cues.length}**`, `**${notes.size}**`],
]), '');
region.push('<a id="video-key-bridges"></a>', '', '## 重點橋段（★）', '');
region.push(`下列橋段另有控制交接規格，取自[第一人稱動畫製作與交接](${ANIMATION_CONTRACT})；製作時先讀這一列，再到各幕列表看對應的影片描述與提示詞。`, '');
region.push(table(['橋段', '方式／既有素材', '控制交接與時序', '對應列表'], bridges.map(b => [
  `[${b.name}](../${b.act.path}#${b.anchor})`, b.method, b.control,
  b.matched.map(c => `[${c.id}](${fileName(listFile(c.act))}#${anchorOf(c.id)})`).join('、'),
])), '');
const original = readFileSync(path.join(DOCS, VIDEO_LIST), 'utf8');
const nl = original.includes('\r\n') ? '\r\n' : '\n';
assert.equal(overview.split(BEGIN).length, 2, 'video-list begin marker');
assert.equal(overview.split(END).length, 2, 'video-list end marker');
const from = overview.indexOf(BEGIN) + BEGIN.length;
const to = overview.indexOf(END);
outputs.set(VIDEO_LIST, overview.slice(0, from) + '\n\n' + region.join('\n').trim() + '\n\n' + overview.slice(to));

// 10-23 is hand-written except its usage table, which lists the segments that share each asset.
const ASSET_BEGIN = '<!-- video-assets:begin -->';
const ASSET_END = '<!-- video-assets:end -->';
const assetPage = read(VIDEO_ASSETS);
assert.equal(assetPage.split(ASSET_BEGIN).length, 2, 'video-assets begin marker');
assert.equal(assetPage.split(ASSET_END).length, 2, 'video-assets end marker');
const segmentLink = cue => `[${cue.id}](${fileName(listFile(cue.act))}#${anchorOf(cue.id)})`;
const autoScenes = cues.filter(c => !c.assets.scene.link);
const usage = [
  table(['素材', '類別', '段數', '段落'], registry.map(entry => {
    const used = cues.filter(c => applies(entry, c));
    return [`[${entry.name}](#${entry.anchor})`, entry.kind, used.length, used.map(segmentLink).join('、')];
  })), '',
  `其餘 ${autoScenes.length} 段的場景由圖像表與劇本靜態畫面自動整理，共 ${new Set(autoScenes.map(c => c.assets.scene.name)).size} 處空間；同一空間做一張全景空景即可共用，近看另依各段「本段畫面」補做。`,
];
outputs.set(VIDEO_ASSETS, assetPage.slice(0, assetPage.indexOf(ASSET_BEGIN) + ASSET_BEGIN.length) + '\n\n' + usage.join('\n') + '\n\n' + assetPage.slice(assetPage.indexOf(ASSET_END)));

const stale = [];
for (const [rel, text] of outputs) {
  const file = path.join(DOCS, rel);
  const before = existsSync(file) ? readFileSync(file, 'utf8') : null;
  const eol = before?.includes('\r\n') || (!before && nl === '\r\n') ? '\r\n' : '\n';
  const after = text.replaceAll('\n', eol);
  if (after === before) continue;
  stale.push(rel);
  if (!CHECK) writeFileSync(file, after);
}
if (CHECK) assert.deepEqual(stale, [], 'Video lists are stale; run node tools/build-video-list.mjs');
const empty = cues.filter(c => c.prompt.empty).length;
const levels = LEVELS.map(level => `${level} ${cues.filter(c => c.level === level).length}`).join('／');
const assetCount = cues.reduce((n, c) => n + c.assets.people.length + c.assets.props.length + 1, 0);
console.log(`Video lists ${stale.length && !CHECK ? 'updated' : 'verified'}: ${cues.length} animation cues in ${UPPER.length} act lists (${levels}), ${bridges.length} key bridges, ${empty} layer-only prompts, ${notes.size} direction notes, ${registry.length} registered assets, ${assetCount} asset prompts`);
