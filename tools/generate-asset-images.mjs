// 影片製作列表（10-17 序幕至 10-21 第四幕）的 ```asset 素材提示詞 → 去重 → 分批呼叫 OpenAI 相容的生圖 API。
// 別幕已生成同一提示詞（類別、名稱、內文都相同）的圖就直接複製沿用，不重複花額度。
//
// 用法：
//   node tools/generate-asset-images.mjs --act 1 --dry                 只列出本幕去重後的清單與批次，不呼叫 API
//   node tools/generate-asset-images.mjs --act 1 --batch 2             生成第一幕第二批（已存在的圖會略過）
//   node tools/generate-asset-images.mjs --act 2 --only 3-05 --extra "左耳罩掛在脖子上"   單張重生並附加補充說明
// 參數：
//   --act 0-4（0 為序幕）；沿用只往前找：第一幕 → 第四幕，序幕最後  --batch 批號或 all  --only 圖號  --extra 補充說明（附在提示詞後的【補充】）
//   --model gpt-image-2.6  --size 1536x1024  --quality high  --concurrency 3  --base API 網址  --dry
// 金鑰與網址：
//   金鑰讀 OPENAI_API_KEY（目前環境沒有時，Windows 會改讀使用者環境變數），不寫進任何檔案也不印出。
//   API 網址依序取 --base、OPENAI_BASE_URL（同樣會讀 Windows 使用者環境變數），都沒有才用 api.openai.com。
// 輸出：
//   素材圖/<幕>/{批}-{序}_{類別}_{名稱}_{首段}.png，另寫 index.html（含提示詞的圖庫）與 prompts.json。
//   素材圖/ 整個不進版控（自動寫入內容為 * 的 .gitignore）。要重生某張，先把舊圖移到 _舊版/ 再跑 --only。
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SPEC_DIR = path.join(ROOT, 'docs', '10_製作規格');
const ASSET_DIR = path.join(ROOT, '素材圖');

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : def; };
const has = name => args.includes(`--${name}`);

function userEnv(name) {
  if (process.env[name]) return process.env[name];
  if (process.platform !== 'win32') return '';
  try {
    const out = execFileSync('reg', ['query', 'HKCU\\Environment', '/v', name], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    return out.match(new RegExp(`${name}\\s+REG_(?:EXPAND_)?SZ\\s+(.+)`))?.[1].trim() || '';
  } catch { return ''; }
}

const roomNo = seg => { const t = seg.match(/^T-R\d+-R(\d+)/); if (t) return Number(t[1]); const r = seg.match(/^R(\d+)/); return r ? Number(r[1]) : Infinity; };
const ACTS = {
  0: {
    prefix: '10-17_', folder: '序幕', title: '序幕〈雨夜與地底〉',
    batches: { 1: '第一批 P0 夢境與深層下水道', 2: '第二批 P1 地底管線層與 P2 地基處理室' },
    batchOf: seg => (seg.startsWith('P0') ? 1 : 2),
  },
  1: {
    prefix: '10-18_', folder: '第一幕', title: '第一幕〈門面與棚〉',
    batches: { 1: '第一批 R1 進門、宣導片與錄製原檔', 2: '第二批 R1 叫號與反光', 3: '第三批 R2 後室、後廚巷與 R3 宿舍', 4: '第四批 R4 廁所、R4b 神壇、早餐攤與 R5 工坊' },
    batchOf(seg) {
      const m = seg.match(/^R1-(\d+)/);
      if (m) { const sub = Number(seg.split('·')[1] || 0); return m[1] === '01' || (m[1] === '02' && sub < 6) ? 1 : 2; }
      return /^(R2|T-R2|R3)/.test(seg) ? 3 : 4;
    },
  },
  2: {
    prefix: '10-19_', folder: '第二幕', title: '第二幕〈產線〉',
    batches: { 1: '第一批 晾衣層與 R7 產線主廊（老周）', 2: '第二批 A 棟橋頭與 R8 視訊組（灰蛾）', 3: '第三批 R9 卡拉 OK、R10 祈禱室、R11 座位（阿尋）與幕尾' },
    batchOf: seg => (roomNo(seg) <= 7 ? 1 : roomNo(seg) === 8 ? 2 : 3),
  },
  3: {
    prefix: '10-20_', folder: '第三幕', title: '第三幕〈技術核心〉',
    batches: { 1: '第一批 R12 設備修理與藥品櫃', 2: '第二批 R13 非法診所與 R14 貨梯轉接間', 3: '第三批 R15 發電機房、候梯口與 R16 伺服器室', 4: '第四批 R17 檔案區與幕尾' },
    batchOf: seg => { const r = roomNo(seg); return r <= 12 ? 1 : r <= 14 ? 2 : r <= 16 ? 3 : 4; },
  },
  4: {
    prefix: '10-21_', folder: '第四幕', title: '第四幕〈校正區〉',
    batches: { 1: '第一批 R18 校正走廊（噤聲者）與 R19 隔音收容室', 2: '第二批 R20 單向玻璃觀察室', 3: '第三批 吸音板後工作臺與 R21 紀律辦公室', 4: '第四批 R22 釋放接點與幕尾' },
    batchOf: seg => { const r = roomNo(seg); return r <= 19 ? 1 : r === 20 ? 2 : r === 21 ? 3 : 4; },
  },
};
const ACT = ACTS[opt('act', '1')];
if (!ACT) { console.error(`--act 只接受 ${Object.keys(ACTS).join('、')}`); process.exit(1); }
const OUT = path.join(ASSET_DIR, ACT.folder);
const batchArg = opt('batch', 'all');
const model = opt('model', 'gpt-image-2.6');
const quality = opt('quality', 'high');
const size = opt('size', '1536x1024');
const concurrency = Number(opt('concurrency', '3'));
const only = opt('only', null);
const extra = opt('extra', '');
const dry = has('dry');

const file = readdirSync(SPEC_DIR).find(n => n.startsWith(ACT.prefix));
const text = readFileSync(path.join(SPEC_DIR, file), 'utf8').replaceAll('\r\n', '\n');
const blocks = [...text.matchAll(/```asset\n([\s\S]*?)```/g)].map(m => m[1].trim());

const unique = new Map();
for (const block of blocks) {
  const lines = block.split('\n');
  const parts = lines[0].replace('【素材】', '').split('｜');
  const seg = parts.pop();
  const [kind, name] = parts;
  const body = lines.slice(1).join('\n');
  const key = `${kind}｜${name}\n${body}`;
  if (!unique.has(key)) unique.set(key, { kind, name, segments: [], body });
  unique.get(key).segments.push(seg);
}

// 生成順序：第一幕最先、序幕最後；每幕只沿用排在前面的幕，避免把別幕複製過去的圖反過來當來源。
const ORDER = [1, 2, 3, 4, 0];
const otherPrompts = ORDER.slice(0, ORDER.indexOf(Number(opt('act', '1')))).map(n => ACTS[n]).map(a => {
  const dir = path.join(ASSET_DIR, a.folder);
  const list = existsSync(path.join(dir, 'prompts.json')) ? JSON.parse(readFileSync(path.join(dir, 'prompts.json'), 'utf8')) : [];
  return { act: a.folder, dir, list };
});

const safe = s => s.replace(/[\\/:*?"<>|\s]+/g, '');
const counters = {};
const items = [...unique.values()].map(item => {
  const batch = ACT.batchOf(item.segments[0]);
  counters[batch] = (counters[batch] || 0) + 1;
  const id = `${batch}-${String(counters[batch]).padStart(2, '0')}`;
  const filename = `${id}_${item.kind}_${safe(item.name)}_${safe(item.segments[0])}.png`;
  const prompt = `【素材】${item.kind}｜${item.name}｜${item.segments.join('、')}\n${item.body}`;
  let reuse = null;
  for (const { act, dir, list } of otherPrompts) {
    const hit = list.find(o => o.kind === item.kind && o.name === item.name && o.prompt.slice(o.prompt.indexOf('\n') + 1) === item.body);
    if (hit && existsSync(path.join(dir, hit.filename))) { reuse = { act, id: hit.id, file: path.join(dir, hit.filename) }; break; }
  }
  return { id, batch, ...item, filename, prompt, reuse };
});

function writeIndex() {
  mkdirSync(OUT, { recursive: true });
  writeFileSync(path.join(ASSET_DIR, '.gitignore'), '*\n');
  writeFileSync(path.join(OUT, 'prompts.json'), JSON.stringify(items.map(({ body, ...rest }) => rest), null, 2));
  const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const sections = Object.entries(ACT.batches).map(([b, title]) => {
    const cards = items.filter(i => i.batch === Number(b)).map(i => {
      const done = existsSync(path.join(OUT, i.filename));
      const img = done ? `<a href="${encodeURI(i.filename)}"><img src="${encodeURI(i.filename)}" loading="lazy"></a>` : '<div class="todo">尚未生成</div>';
      return `<figure>${img}<figcaption><b>${i.id}</b> ${esc(i.kind)}｜${esc(i.name)}<br><small>${esc(i.segments.join('、'))}${i.reuse ? `（沿用${esc(i.reuse.act)} ${i.reuse.id}）` : ''}</small><details><summary>提示詞</summary><pre>${esc(i.prompt)}</pre></details></figcaption></figure>`;
    }).join('\n');
    return `<h2>${esc(title)}</h2><div class="grid">${cards}</div>`;
  }).join('\n');
  writeFileSync(path.join(OUT, 'index.html'), `<!DOCTYPE html><html lang="zh-Hant"><meta charset="utf-8"><title>${esc(ACT.title)}素材圖</title>
<style>body{font-family:system-ui,"Microsoft JhengHei",sans-serif;background:#1b1b1b;color:#ddd;margin:24px}h1,h2{font-weight:600}h2{margin-top:36px;border-bottom:1px solid #444;padding-bottom:6px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:18px}figure{margin:0;background:#262626;border-radius:6px;overflow:hidden}
img{width:100%;display:block}.todo{aspect-ratio:3/2;display:grid;place-items:center;color:#777;background:#202020}figcaption{padding:10px 12px;font-size:14px;line-height:1.5}
small{color:#999}pre{white-space:pre-wrap;font-size:12px;color:#bbb;max-height:300px;overflow:auto}</style>
<h1>${esc(ACT.title)}素材圖</h1><p>來源：${esc(file.replace(/\.md$/, ''))} 的素材提示詞，去重後 ${items.length} 張；模型 ${esc(model)}，${esc(size)}，品質 ${esc(quality)}。</p>${sections}</html>`);
}

async function generate(item, base, key) {
  const target = path.join(OUT, item.filename);
  if (existsSync(target)) return { item, status: 'skip' };
  if (item.reuse) { copyFileSync(item.reuse.file, target); return { item, status: 'reuse' }; }
  const body = { model, prompt: extra ? `${item.prompt}\n【補充】${extra}` : item.prompt, size, quality, n: 1 };
  for (let attempt = 1; attempt <= 4; attempt++) {
    const started = Date.now();
    let res, json;
    try {
      res = await fetch(`${base}/images/generations`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      json = await res.json().catch(() => ({}));
    } catch (e) {
      if (attempt < 4) { console.log(`  ${item.id} 連線失敗，${15 * attempt} 秒後重試（${attempt}/3）`); await new Promise(r => setTimeout(r, 15000 * attempt)); continue; }
      return { item, status: 'error', error: `連線失敗 ${e.message}` };
    }
    if (res.ok) {
      const data = json.data?.[0];
      let buf;
      if (data?.b64_json) buf = Buffer.from(data.b64_json, 'base64');
      else if (data?.url) buf = Buffer.from(await (await fetch(data.url)).arrayBuffer());
      else return { item, status: 'error', error: '回應沒有圖片資料' };
      writeFileSync(target, buf);
      return { item, status: 'ok', seconds: Math.round((Date.now() - started) / 1000) };
    }
    const err = json.error || {};
    if ((res.status === 429 || res.status >= 500) && attempt < 4 && err.code !== 'insufficient_quota') {
      const wait = 15000 * attempt;
      console.log(`  ${item.id} HTTP ${res.status}，${wait / 1000} 秒後重試（${attempt}/3）`);
      await new Promise(r => setTimeout(r, wait));
      continue;
    }
    return { item, status: 'error', error: `HTTP ${res.status} ${err.code || ''} ${err.message || ''}`.trim() };
  }
}

const selected = items.filter(i => (batchArg === 'all' || i.batch === Number(batchArg)) && (!only || i.id === only));
writeIndex();
if (dry) {
  for (const i of selected) console.log(`${i.id}\t${i.kind}｜${i.name}\t← ${i.segments.join('、')}\t(${i.prompt.length} 字)${i.reuse ? `\t沿用${i.reuse.act} ${i.reuse.id}` : ''}`);
  console.log(`共 ${selected.length} 張（其中沿用 ${selected.filter(i => i.reuse).length} 張）`);
  process.exit(0);
}

const key = userEnv('OPENAI_API_KEY');
if (!key) { console.error('找不到 OPENAI_API_KEY'); process.exit(1); }
const base = (opt('base', '') || userEnv('OPENAI_BASE_URL') || 'https://api.openai.com/v1').replace(/\/$/, '');

console.log(`開始：${selected.length} 張，模型 ${model}，${size}，品質 ${quality}，同時 ${concurrency} 張`);
const queue = [...selected];
const results = [];
await Promise.all(Array.from({ length: concurrency }, async () => {
  while (queue.length) {
    const item = queue.shift();
    const r = await generate(item, base, key);
    results.push(r);
    const label = { ok: '完成', skip: '已存在', reuse: `沿用${item.reuse?.act} ${item.reuse?.id}`, error: '失敗' }[r.status];
    console.log(`${label} ${item.id} ${item.kind}｜${item.name}${r.seconds ? `（${r.seconds} 秒）` : ''}${r.error ? `：${r.error}` : ''}`);
    writeIndex();
  }
}));
const count = s => results.filter(r => r.status === s).length;
console.log(`結束：成功 ${count('ok')}、沿用 ${count('reuse')}、略過 ${count('skip')}、失敗 ${count('error')}`);
if (count('error')) process.exitCode = 2;
