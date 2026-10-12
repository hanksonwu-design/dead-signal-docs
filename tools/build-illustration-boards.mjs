import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BOARDS } from './illustration-boards.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DIR = path.join(ROOT, 'assets/illustrations/current');
const colors = { item: '#e6bc68', puzzle: '#79d8dc', event: '#a6cfa7', horror: '#dcb3e4', boss: '#ffa18b' };
const esc = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');

export function wrap(value, max = 23) {
  const lines = [];
  for (const paragraph of value.split('\n')) {
    let line = '', width = 0;
    for (const char of paragraph) {
      const step = /[\u0000-\u007f]/.test(char) ? .58 : 1;
      if (width + step > max) { lines.push(line); line = ''; width = 0; }
      line += char; width += step;
    }
    lines.push(line);
  }
  return lines;
}
const textLines = (lines, x, y, cls, lineHeight = 34) => lines.map((line, i) =>
  `<text class="${cls}" x="${x}" y="${y + i * lineHeight}">${esc(line)}</text>`).join('\n');

export function renderBoard(id, board) {
  const prepared = board.panels.map(([phase, title, body, color = 'puzzle']) => ({ phase, title, lines: wrap(body), color }));
  let y = 156;
  const content = [];
  for (let i = 0; i < prepared.length; i += 2) {
    const pair = prepared.slice(i, i + 2);
    const height = 132 + Math.max(...pair.map(panel => panel.lines.length)) * 34;
    pair.forEach((panel, column) => {
      const x = 32 + column * 578, color = colors[panel.color];
      content.push(`<g data-panel="${i + column + 1}"><rect x="${x}" y="${y}" width="558" height="${height}" rx="4" fill="#152025" stroke="#425155"/>
<rect x="${x}" y="${y}" width="5" height="${height}" fill="${color}"/>
<text class="phase" x="${x + 26}" y="${y + 37}" fill="${color}">${String(i + column + 1).padStart(2, '0')} · ${esc(panel.phase.replace(/^\d{2} · /, ''))}</text>
<text class="panel-title" x="${x + 26}" y="${y + 77}">${esc(panel.title)}</text>
${textLines(panel.lines, x + 26, y + 120, 'body')}</g>`);
    });
    y += height + 20;
  }
  const height = y + 70;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="${height}" viewBox="0 0 1200 ${height}" role="img" aria-labelledby="title desc">
<title id="title">${esc(id + '｜' + board.title)}</title><desc id="desc">${esc(board.subtitle + ' ' + board.panels.map(p => p.slice(0, 3).join('：')).join('；'))}</desc>
<style>text{font-family:"Microsoft JhengHei","Noto Sans TC",sans-serif;letter-spacing:0}.title{font-size:32px;font-weight:700;fill:#edf1ef}.subtitle{font-size:21px;fill:#b3c1c5}.phase{font-size:21px;font-weight:700}.panel-title{font-size:26px;font-weight:700;fill:#edf1ef}.body{font-size:22px;fill:#d1dcdf}.footer{font-size:19px;fill:#aebec2}</style>
<rect width="1200" height="${height}" fill="#0b1418"/>
<text class="title" x="32" y="52">${esc(id + '｜' + board.title)}</text>
${textLines(wrap(board.subtitle, 49), 32, 91, 'subtitle', 29)}
${content.join('\n')}
<path d="M32 ${y + 5}H1168" stroke="#425155"/><text class="footer" x="32" y="${y + 39}">現行規則圖解 · 非遊戲介面或完成素材 · 狀態、差分與計時仍依逐房製作規格</text>
</svg>\n`;
}

export function worldBoard(flow) {
  const bridges = flow.subscenes.filter(s => s.travel === '跨棟橋');
  const lifts = flow.subscenes.filter(s => s.travel === '電梯車廂');
  const work = Object.values(flow.images);
  return { title: '雙棟動線與生活管理', subtitle: `${flow.nodes.length} 個主節點／${flow.subscenes.length} 個次場景／${flow.routes.length} 條動線；正式圖像 ${work.length} 列均待製作。`, panels: [
    ['跨棟橋', '同層連接，不垂直跳樓', bridges.map(s => `${s.floor.label} ${s.building.label}：${s.id}`).join('\n')],
    ['拉閘門電梯', '只到既有停靠樓層', lifts.map(s => `${s.name}：${s.floor.label}`).join('\n') + '\nL1 必須完成 30F 平台；L2 假停靠不開閘。'],
    ['逐層探路', '坍塌不代表整層不存在', '2F→8F、15F→31F、32F→41F 依原次場景逐層辨路。\n已開通路按原條件回訪，沒有直達捷徑替代。'],
    ['集體管理', '共用生活空間', 'R4：2F 集體衛浴。\nR6：11F 食堂與配膳回收。\n房內探索鏡位不冒充跨房主線。'],
    ['主管套間', '生活差異不等於自由', 'R29：47F 本人與其他主管的生活套間。\n獨立衛浴仍受管理；外部聯絡權限只屬康。'],
    ['外界與素材', '紅霧、白絲與可辨地標', `窗縫外維持紅霧與白絲，不畫可自由出去的街景。\n圖像工單 ${work.length} 列包含多頁和差分，不是同數量的獨立背景。`],
  ] };
}

export function buildBoards() {
  const flow = JSON.parse(readFileSync(path.join(ROOT, 'scene-flow.json'), 'utf8'));
  return new Map(Object.entries({ ...BOARDS, WORLD: worldBoard(flow) }).map(([id, board]) => [id, renderBoard(id, board)]));
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const check = process.argv.includes('--check');
  if (!check) mkdirSync(DIR, { recursive: true });
  for (const [id, svg] of buildBoards()) {
    const file = path.join(DIR, `${id}.svg`);
    if (check) assert.equal(readFileSync(file, 'utf8'), svg, `Stale illustration: ${id}`);
    else writeFileSync(file, svg);
  }
  console.log(`${buildBoards().size} current illustration diagrams ${check ? 'verified' : 'built'}.`);
}
