// Builds the upper-part video production lists from every （動畫演出／…） cue in the act scripts.
// 10-16 keeps its hand-written introduction and gets a generated overview; each upper act gets a
// fully generated list (10-17 to 10-21) whose segments carry a Chinese storyboard prompt for AI video tools.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ACTS, APPENDIX, VIDEO_LIST, VIDEO_ACT_LISTS, VIDEO_DIRECTION } from './screenplay-files.mjs';

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
      act, type, description, images, block, sound: soundAfter(lines, i),
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
// Clauses that only state rules for input, saving, length or puzzle state are left out of the shot list.
const MECHANICS = new RegExp([
  '玩家', '任何(?:輸入|操作)', '一有輸入', '鎖輸入', '提交', '點選', '點回', '交還', '判定', '補救窗', '低動態', '讀檔', '略過', '不算', '回訪',
  '熱點', '條件', '筆記(?:不|只|更新|寫入|補)', '示範', '驗證', '憑證', '路由', '供電', '狀態', '不能', '可重試', '生效', '取消', '覆寫',
  '已讀', '索引', '證據', '不改', '仍需', '仍待', '可近看', '可查看', '等待', '標出', '方向字幕', '可見標記', '保持可用', '不只靠',
  '必要', '倒數', '抹除', '未處理', '演出', '本來就', '可橫穿', '不超過', '總長', '^(?:最長|前後|共)?約?\\s*\\d+(?:\\.\\d+)?\\s*秒$',
].join('|'));
// A clause that opens with these words only finishes a dropped rule clause ("……，再對回待叫序列").
const DANGLING = clause => /^(?:再|才|便|就)/.test(clause) || (clause.length <= 8 && /就|便/.test(clause));
// A sentence led by a state condition ("已安息時，……") describes another variant of the same shot.
const VARIANT = /^(?:已|若|如果|曾)[^，]{0,20}(?:時|者|的話)$/;
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
const CAMERA = {
  第一人稱過場: '第一人稱主觀鏡頭。只照分鏡緩慢推近或停住，不晃動、不旋轉、不快速轉向；結尾停在與首格相同的視點與地標。',
  第一人稱互動: '第一人稱固定鏡位，鏡頭完全不動。只動分鏡點名的手、人物或物件，其餘背景保持靜止。',
  第一人稱動作回饋: '第一人稱固定鏡位，鏡頭不動。動作做完就停住，不加分鏡以外的動作。',
  主觀記憶動畫: '從她當時的眼睛看出去的主觀鏡頭，幾乎不動，只有極輕微的呼吸感；不換成旁觀角度拍她。',
  場景局部動畫: '固定鏡頭，整個畫面靜止，只有分鏡點名的局部在動；不新增人物或物件。',
  設備內影片: '只生成設備螢幕裡播放的畫面本身（全幅，不含設備外框），後製再合成進螢幕遮罩；片內可以照分鏡切換畫面。',
  設備即時影像: '只生成設備螢幕裡的即時畫面本身（全幅，不含設備外框），後製再合成進螢幕遮罩。',
};
const MOVING = /視點|鏡頭極慢|視野兩側退去|從腳邊退去|車廂上行/;
const DELIVERY = {
  第一人稱過場: '成片可直接使用；頭尾各留一格與首格主圖對位，供程式切換。',
  第一人稱互動: 'AI 生成稿只作動態參考或底稿；正式交付拆成手部、前景遮擋與物件動態圖層，疊回原主圖，不以整支影片取代可點的場景。',
  第一人稱動作回饋: 'AI 生成稿只作動態參考或底稿；正式交付為疊在原主圖或近看上的短手部／物件動態圖層。',
  主觀記憶動畫: '併入觸碰物件的原近看或主圖素材項，另交記憶動畫分層與二至三張低動態記憶靜格。',
  場景局部動畫: '只取會動的局部，做成疊在原主圖或近看上的獨立動態圖層，其餘畫面沿用原圖。',
  設備內影片: '成片合成進設備螢幕遮罩；近看保留設備邊框，字幕與畫面文字後製加上。',
  設備即時影像: '成片合成進設備螢幕遮罩；近看保留設備邊框。',
};
const PROTAGONIST_HAND = /(?:她|自己|主角)(?:的)?(?:雙手|右手|左手|手|指|拇指|指甲|指尖|指節|掌)|前景的(?:右|左)?手|撐地的手|手從視野下緣|她彎身|她用指/;
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

function shots(cue) {
  const beats = [];
  const captions = [];
  const framing = [];
  let carry = '';
  let total = 0;
  let visual = 0;
  for (const raw of sentences(VIEWPOINT.reduce((text, [from, to]) => text.replace(from, to), cue.description))) {
    if (CAPTION.test(raw)) { captions.push(tidy(raw)); continue; }
    const end = /[。；！？]$/.test(raw) ? '。' : '';
    const clauses = raw.replace(/[。；！？]$/, '').split('，');
    if (beats.length && VARIANT.test(clauses[0])) continue;
    total += raw.length;
    const kept = [];
    let dropped = false;
    for (const clause of clauses) {
      dropped = MECHANICS.test(clause) || (dropped && DANGLING(clause));
      if (!dropped) kept.push(clause);
    }
    const text = tidy(kept.join('，'));
    if (text.length < 6 && kept.length < clauses.length) continue;
    if (!text) continue;
    visual += text.length;
    if (FRAMING.test(text)) { framing.push(text + end); continue; }
    // Very short sentences ride with a neighbouring beat so each beat is one readable action.
    if (text.length < 12) {
      if (beats.length) beats[beats.length - 1] += text + end;
      else carry += text + end;
      continue;
    }
    beats.push(carry + text + end);
    carry = '';
  }
  if (carry) beats.push(carry);
  while (beats.length > 5) {
    let best = 0;
    for (let i = 1; i < beats.length - 1; i++) if (beats[i].length + beats[i + 1].length < beats[best].length + beats[best + 1].length) best = i;
    beats.splice(best, 2, beats[best] + beats[best + 1]);
  }
  // Mostly rules and state: better made as layer differences than generated as video.
  if (visual < total * 0.3 && !cue.key) beats.length = 0;
  return { beats, captions, framing };
}

function seconds(cue, beats) {
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
  return { value: Math.min(high, Math.max(low, Math.round(beats.length * each * 2) / 2)), stated: false };
}

function timeline(beats, total) {
  const marks = [0];
  for (let i = 1; i <= beats.length; i++) marks.push(i === beats.length ? total : Math.max(marks[i - 1] + 0.5, Math.round(total * i / beats.length * 2) / 2));
  if (marks.at(-1) < marks.at(-2)) marks[marks.length - 1] = marks.at(-2) + 0.5;
  return beats.map((beat, i) => `${fmt(marks[i])}–${fmt(marks[i + 1])} 秒｜${beat}`);
}

// A long single action is split at its commas so a clip of three seconds or more gets two or three timed beats.
function spread(beats, total) {
  const out = [...beats];
  const want = Math.min(3, Math.floor(total / 1.5));
  while (out.length && out.length < want) {
    const i = out.reduce((best, beat, j) => beat.length > out[best].length ? j : best, 0);
    const parts = out[i].replace(/。$/, '').split('，');
    if (out[i].length < 24 || parts.length < 2 || out[i].includes('「')) break;
    let size = 0;
    let cut = 1;
    for (let k = 0; k < parts.length - 1; k++) {
      size += parts[k].length + 1;
      cut = k + 1;
      if (size >= out[i].length / 2) break;
    }
    const [head, tail] = [parts.slice(0, cut).join('，'), parts.slice(cut).join('，')];
    if (head.length < 8 || tail.length < 8) break;
    out.splice(i, 1, `${head}。`, `${tail}。`);
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

function prompt(cue, previous, pictures, note) {
  const shot = shots(cue);
  const { captions, framing } = shot;
  const length = seconds(cue, shot.beats);
  const beats = spread(shot.beats, cue.type === '主觀記憶動畫' ? 5 : length.value);
  const memory = cue.type === '主觀記憶動畫';
  const device = cue.type.startsWith('設備');
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
    const start = continued ? `用上一段 ${previous.id} 的最後一格` : frame ? `直接用 ${frame} 的寫實定稿圖` : '依分鏡第一格另做一張寫實實拍的畫面';
    lines[lines.length - 1] = `【生成方式】首尾格生影片：首格${start}；尾格停在 ${note.end}（${end.use}）的視點與構圖。中間照分鏡過渡，光線與物件位置以尾格定稿為準。`;
  }
  const cut = memory ? '約 5 秒（可在 3–6 秒間）' : `約 ${fmt(length.value)} 秒${length.stated ? '（劇本指定）' : ''}`;
  lines.push(`【長度】剪用${cut}；${length.value > 10 ? '分兩段各生成 5–10 秒，接剪後裁切' : `生成 ${length.value > 5 ? 10 : 5} 秒後裁切`}。`);
  const total = memory ? 5 : length.value;
  if (note) {
    assert.equal(note.rows.at(-1).to, total, `${cue.id}: direction rows end at the cut length`);
    lines.push(`【情緒節奏】${note.mood}`);
    lines.push('【分鏡】', ...note.rows.map(row => `${fmt(row.from)}–${fmt(row.to)} 秒｜${row.picture}`));
  } else if (beats.length) {
    lines.push('【分鏡】', ...timeline(beats, total));
  } else {
    lines.push('【分鏡】本段主要是介面、燈號或狀態變化，建議直接以圖層差分製作，不需要 AI 生成影片；細節見上方劇本描述。');
  }
  const camera = moving
    ? '第一人稱主觀鏡頭。視點只照分鏡緩慢移動，不晃動、不旋轉，地平線保持水平；最後在分鏡寫的位置停穩。'
    : CAMERA[cue.type];
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
    const palette = device ? '舊螢幕畫質：略低解析、輕微掃描線與色偏，亮度只在螢幕範圍內。'
      : cue.type === '第一人稱過場' ? (note ? '' : '照首格與分鏡：深黑為主，只有分鏡點名的光源發亮，低飽和。')
      : /^R1-/.test(cue.code) ? 'R1 大廳：廉價、均勻的暖白日光燈，乾淨得不自然；不加恐怖暗角，也不偏冷青。'
      : '現在的暖黑：低飽和、潮濕、廢棄，深黑陰影佔大半，只有設備燈、消防燈或漏光照亮局部；光向與首格一致。';
    lines.push(`【光線色調】${note ? note.light : ''}${palette}`);
  }
  lines.push(`【影片風格】${device ? STYLE_DEVICE : STYLE}`);
  const texts = [...new Set(beats.join('').match(/「[^」]+」/g) || [])];
  // Sound notes keep what is heard; remarks on what the player can work out stay in the script.
  const audio = [...cue.sound.map(line => sentences(line).filter(s => !s.includes('玩家')).join('')).filter(Boolean), ...captions];
  // A direction note times every sound and composited text to the beat it lands on.
  // A cell that names its own moment (「2.3 秒：…」) keeps it; otherwise the cue spans its row.
  const timed = note ? note.rows.filter(row => row.sound).map(row => /^\d+(?:\.\d+)? 秒：/.test(row.sound) ? `・${row.sound}` : `・${fmt(row.from)}–${fmt(row.to)} 秒：${row.sound}`) : [];
  if (audio.length || texts.length || timed.length) {
    lines.push('【後製（不進 AI 生成）】');
    if (texts.length) lines.push(`畫面文字：${texts.join('、')}`);
    if (note) lines.push('聲音與後製對點：', ...timed);
    else for (const line of audio) lines.push(line);
  }
  const negative = [...NEGATIVE];
  if (!device) negative.splice(3, 0, '第三人稱或看見主角全身', cue.type === '第一人稱過場' || camera.includes('視點只照') ? '鏡頭晃動或突然換景' : '鏡頭晃動、推移或換景');
  if (memory) negative.push('冷青色調或訊號雜訊', '對方的臉、名牌或可讀的名字');
  lines.push(`【不要出現】${negative.join('；')}。`);
  return { text: lines.join('\n'), length, empty: !beats.length };
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

// ---------- output ----------

const cues = UPPER.flatMap(collect);
const bridges = keyBridges(cues);
const pictures = pictureRows();
for (const cue of cues) for (const id of cue.images) assert(pictures.has(id), `${cue.id}: picture ${id} has no row in the act spec`);
const usedTypes = TYPES.filter(t => cues.some(c => c.type === t));
const notes = directionNotes(cues, pictures);
const noteLink = cue => `[${cue.id} ${cue.note.name}](${fileName(VIDEO_DIRECTION)}#${cue.note.anchor})`;
cues.forEach((cue, i) => {
  const previous = cues[i - 1]?.act === cue.act ? cues[i - 1] : null;
  cue.prompt = prompt(cue, previous, pictures, notes.get(cue.id));
  cue.note = notes.get(cue.id);
});
cues.forEach((cue, i) => { [cue.level, cue.reason] = importance(cue, cues[i + 1]); });
const overview = read(VIDEO_LIST);
const updated = overview.match(/^更新: (\d{4}-\d{2}-\d{2})$/m)[1];
const status = overview.match(/^狀態: (.+)$/m)[1];

function actList(act) {
  const own = cues.filter(c => c.act === act);
  const index = UPPER.indexOf(act);
  const out = [];
  out.push('---', `文件: 製作規格｜影片製作列表・${act.name}`, `狀態: ${status}`, `更新: ${updated}`,
    `摘要: ${act.name}〈${act.subtitle}〉${own.length} 段動畫演出的製作列表；每段附劇本描述、首格圖號與 AI 生成影片用的中文分鏡提示詞。`, '---', '');
  out.push(`<a id="video-act-${act.act}"></a>`, '', `# 影片製作列表・${act.name} · ${act.subtitle}（${own.length} 段）`, '');
  out.push(`> 本頁由 \`node tools/build-video-list.mjs\` 依[${act.name}劇本](../${act.path})與[${act.name}製作規格](${fileName(act.specPath)})產生，請勿手改；要改動畫，請改劇本或同幕圖像表，要改鏡頭、光與聲音設計，請改[影片導演註記](${fileName(VIDEO_DIRECTION)})，再重新執行。提示詞的用法、共用影片風格與禁止事項見[總表的提示詞說明](${fileName(VIDEO_LIST)}#video-prompt-guide)。`, '');
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
console.log(`Video lists ${stale.length && !CHECK ? 'updated' : 'verified'}: ${cues.length} animation cues in ${UPPER.length} act lists (${levels}), ${bridges.length} key bridges, ${empty} layer-only prompts, ${notes.size} direction notes`);
