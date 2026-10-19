// Editable production drawings. Geometry illustrates existing actions, not new rooms or inputs.
export const VISUAL_BOARD_IDS = [
  'L04', 'L07', 'L09', 'L10', 'V24', 'V25', 'V15', 'REF-LIFT', 'REF-U4',
  'REF-MECHANISM', 'REF-HEARING', 'REF-R12', 'L02', 'ART02', 'V01', 'V02',
  'V07', 'L05', 'V09', 'V10', 'L03', 'V12', 'L06', 'V38', 'L08', 'V29',
  'V30', 'CORE', 'WORLD',
];
const C = { ink: '#111c21', wall: '#243238', floor: '#1a272e', edge: '#607a80', light: '#b9d3cc',
  paper: '#d1d8cc', teal: '#79d8dc', gold: '#e6bc68', green: '#a6cfa7', red: '#ffa18b', ghost: '#dcb3e4' };
const esc = s => String(s).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const path = (d, color = C.edge, fill = 'none', width = 2, extra = '') => `<path d="${d}" fill="${fill}" stroke="${color}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round" ${extra}/>`;
const rect = (x, y, w, h, fill = C.ink, color = C.edge, r = 2) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}" stroke="${color}" stroke-width="2"/>`;
const ellipse = (x, y, rx, ry, color = C.edge, fill = C.ink) => `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="${fill}" stroke="${color}" stroke-width="2"/>`;
const txt = (s, x, y, color = C.light, size = 16) => `<text x="${x}" y="${y}" fill="${color}" font-size="${size}" font-weight="500">${esc(s)}</text>`;
const group = (x, y, body, scale = 1) => `<g transform="translate(${x} ${y}) scale(${scale})">${body}</g>`;
const arrow = (d, color = C.teal, dashed = false) => path(d, color, 'none', 3,
  `marker-end="url(#vis-arrow-${color === C.gold ? 'gold' : color === C.red ? 'red' : 'teal'})"${dashed ? ' stroke-dasharray="7 5"' : ''}`);
const cross = (x, y, size = 9) => path(`M${x - size} ${y - size}l${size * 2} ${size * 2}m0 ${-size * 2}l${-size * 2} ${size * 2}`, C.red, 'none', 3);
const check = (x, y) => path(`M${x - 8} ${y}l6 7 15 -19`, C.green, 'none', 4);

function room() {
  let g = rect(0, 0, 510, 244, C.wall, C.edge);
  g += path('M0 0L90 38H420L510 0M90 38V150L0 244M420 38V150L510 244M90 150H420', C.edge);
  g += path('M0 244L90 150H420L510 244Z', C.edge, C.floor);
  for (const x of [125, 200, 310, 385]) g += path(`M${x} 150L${255 + (x - 255) * 2.2} 244`, '#31494f');
  g += path('M55 184H455M24 218H486', '#31494f');
  return g;
}
function chair(x, y, color = C.edge) {
  return group(x, y, rect(0, 0, 30, 43, C.wall, color, 4) + path('M-4 43H34V52H-4ZM0 52V76M30 52V76M3 52L-3 71M27 52L33 71', color, C.wall));
}
function person(x, y, scale = 1, color = C.ghost, posture = 'stand') {
  const head = ellipse(0, 0, 10, 14, color, '#243039');
  let body = path('M-10 16Q0 11 10 16L16 56H-16ZM-12 23L-25 48M12 23L25 48M-9 56L-12 86M9 56L12 86', color, '#243039', 2.5);
  if (posture === 'sit') body = path('M-10 16Q0 11 10 16L16 44H-15ZM-10 24L-20 44M10 24L23 43M-9 44L-17 60H8L18 80M10 44L24 60L31 80', color, '#243039', 2.5);
  if (posture === 'crouch') body = path('M-10 15L18 31L27 48L4 58L-17 47ZM-7 20L-25 41M14 29L40 37M-10 49L-23 69H5M19 48L38 65H55', color, '#243039', 2.5);
  return `<g data-human-posture="${posture}">${group(x, y, head + body, scale)}</g>`;
}
function hand(x, y, mode = 'point', color = C.gold, scale = 1) {
  const d = mode === 'open'
    ? 'M-23 48L-30 20Q-32 11-26 13L-14 29L-17 -7Q-16 -17-10 -8L-5 20L-4 -18Q-1 -26 3 -17L6 19L12 -10Q17 -18 19 -9L17 22L25 7Q31 4 30 14L25 42L12 55'
    : 'M-22 48L-29 23Q-31 13-24 16L-12 30L-10 -24Q-6 -33-2 -22L1 15L10 7L19 11L28 20L26 40L13 55';
  return group(x, y, path(d, color, '#3c4140', 2.5) + path('M-23 48L-27 67H13L13 55', color, '#344046'), scale);
}
function paper(x, y, w = 100, h = 130, color = C.paper) {
  let g = path(`M${x} ${y}h${w - 20}l20 20v${h - 20}h${-w}ZM${x + w - 20} ${y}v20h20`, C.edge, color);
  for (let i = 0; i < 4; i++) g += path(`M${x + 12} ${y + 35 + i * 17}h${w - 28}`, '#7c918e');
  return g;
}
function door(x, y, open = false, color = C.edge, w = 70, h = 115) {
  let g = rect(x, y, w, h, '#0b1418', color) + path(`M${x - 5} ${y + h}V${y - 5}h${w + 10}v${h + 5}`, color, 'none', 3);
  g += open ? path(`M${x + 3} ${y + 3}l${w * .62} 13v${h - 26}l${-w * .62} 10Z`, color, '#2e4246') : rect(x + 5, y + 5, w - 10, h - 10, '#283b40', color);
  g += ellipse(x + (open ? w * .49 : w - 14), y + h * .6, 3, 3, C.gold, C.gold);
  return g;
}
function monitor(x, y, w = 180, h = 105, windows = 0, percent = null) {
  let g = rect(x, y, w, h, '#071015', C.light, 4) + path(`M${x + w * .44} ${y + h}v14h${-w * .14}h${w * .4}h${-w * .14}v-14`, C.edge, C.wall, 3);
  if (windows) {
    for (let i = 0; i < windows; i++) {
      const xx = x + 10 + (i % 4) * (w - 20) / 4, yy = y + 8 + Math.floor(i / 4) * (h - 33) / 3;
      g += `<g data-identity-window="${i + 1}">` + rect(xx, yy, (w - 31) / 4, (h - 44) / 3, '#273a44', C.ghost);
      g += path(`M${xx + 5} ${yy + 9}q8 -8 16 0q-8 8-16 0`, C.ghost) + '</g>';
    }
  } else g += path(`M${x + 12} ${y + 24}h${w * .65}m${-w * .65} 18h${w * .45}m${-w * .45} 18h${w * .7}`, C.teal);
  if (percent !== null) {
    g += rect(x + 10, y + h - 22, w - 20, 12, '#24363a', C.edge);
    g += rect(x + 12, y + h - 20, (w - 24) * percent / 100, 8, C.teal, C.teal, 0);
    g += txt(`${percent}%`, x + w + 9, y + h - 10, C.gold, 20);
  }
  return g;
}
function desk() {
  return path('M90 145L370 145L420 176H55ZM55 176H420V191H55ZM75 191V238M399 191V238', C.edge, '#374b4f', 3) +
    rect(150, 178, 155, 9, '#1f3237', C.light) + chair(74, 160) + chair(397, 160);
}
function ahsun(attack = '') {
  let g = person(255, 65, .9);
  for (let i = 0; i < 3; i++) g += path(`M${236 - i * 5} ${66 + i * 8}Q255 ${88 + i * 7} ${274 + i * 5} ${66 + i * 8}`, C.ghost, 'none', 3);
  if (attack === 'gaze') g += path('M241 61L185 91M267 61L302 91', C.red, 'none', 2, 'stroke-dasharray="4 3"');
  if (attack === 'scratch') {
    g += path('M230 97L175 119L121 153L83 163M121 153L88 179M121 153L94 194', C.ghost, 'none', 4);
    for (let i = 0; i < 3; i++) g += path(`M${74 + i * 13} 161l-4 26`, C.red, 'none', 3);
  }
  return g;
}
function ahsunScene(mode = 'state') {
  let g = room() + (mode === 'submit' ? '' : ahsun(mode === 'gaze' || mode === 'scratch' ? mode : '')) + desk();
  if (mode !== 'closed') g += monitor(167, 90, 155, 79, mode === 'read' ? 0 : 11, mode === 'state' ? 99 : mode === 'submit' ? 100 : null);
  else g += monitor(167, 90, 155, 79) + cross(298, 104) + path('M179 116h130v40H179Z', C.edge, C.ink);
  if (mode === 'read') {
    g += '<g data-view="protected-reading">' + rect(92, 25, 326, 190, '#12272e', C.green) + txt('完整來源查證', 111, 54, C.green, 18);
    g += rect(109, 69, 138, 124, C.ink, C.edge) + rect(263, 69, 138, 124, C.ink, C.edge);
    for (let i = 0; i < 5; i++) g += path(`M120 ${88 + i * 21}h110M275 ${88 + i * 21}h114`, C.light);
    g += '</g>';
  }
  if (mode === 'submit') g += hand(288, 193, 'point', C.gold, .65) + txt('6 秒操作空檔', 335, 42, C.gold);
  if (mode === 'scratch' || mode === 'retreat') g += arrow('M190 207H369') + person(451, 146, .55, C.teal, 'crouch');
  if (mode === 'gaze') g += hand(295, 205, 'point', C.gold, .55);
  return `<g data-encounter-state="${mode === 'submit' ? 'released' : 'active'}">${g}</g>`;
}
function sources(count = 3, labels = ['撤銷紀錄', '封包尾段', '待完成傳輸'], context = '同一終端：來源放大對照') {
  let g = `<g data-view="${count === 3 ? 'same-terminal-sources' : 'field-source-details'}">` + txt(context, 125, 20, C.green, 17) + path('M20 204H490', C.edge);
  for (let i = 0; i < count; i++) {
    const w = 450 / count - 15, x = 30 + i * 450 / count;
    g += rect(x, 38, w, 94, C.ink, C.light) + path(`M${x + 10} 51h${w - 20}m${20 - w} 23h${w - 35}m${35 - w} 23h${w - 20}`, C.teal);
    g += txt(labels[i] || `來源 ${i + 1}`, x + 4, 165, C.gold, count > 3 ? 15 : 16);
    g += path(`M${x + w / 2} 178v26`, C.teal);
  }
  g += arrow('M255 204V236');
  return g + '</g>';
}
function abiao(mode = 'palm') {
  let g = room() + ellipse(255, 48, 11, 15, C.ghost, '#243039') + path('M245 63v12m20 -12v12', C.ghost, 'none', 3);
  g += path('M221 69L201 103L223 140H285L306 102L286 69ZM231 76L216 104L236 130H275L291 104L280 76Z', C.ghost, '#2d3940', 3);
  g += desk();
  g += path(mode === 'palm' ? 'M224 81L192 114L154 178' : 'M224 81L206 125L220 148', C.ghost, 'none', 7);
  g += path(['hook', 'release'].includes(mode) ? 'M288 78L332 127L295 106L317 164' : 'M286 81L305 117L302 145', C.ghost, 'none', 7);
  if (mode === 'palm') g += hand(136, 115, 'open', C.red, 1.25) + rect(82, 151, 136, 56, 'none', C.red) + arrow('M232 214H371');
  if (mode === 'hook') g += path('M290 157h42v16h-42M311 174v36', C.gold, '#3b4141', 4);
  if (mode === 'release') g += path('M296 145v66M280 212h31', C.gold, 'none', 5) + hand(374, 185, 'open', C.gold, .55) + arrow('M339 192H400');
  if (mode === 'sources') g += group(49, 72, sources(4, ['編號', '任用', '命令', '處置'], '現場來源：四項原件'), .8);
  if (mode === 'choice') g += hand(154, 192, 'open', C.gold, .6) + monitor(307, 130, 110, 70) + path('M255 183v52', C.edge, 'none', 2, 'stroke-dasharray="5 5"') + txt('拒絕', 109, 232, C.gold) + txt('撤權', 345, 232, C.gold);
  if (mode === 'safe') g += person(441, 155, .6, C.teal, 'crouch') + arrow('M240 214H392');
  if (mode === 'stopped') g += path('M165 205H337', C.green, 'none', 4) + check(369, 204);
  return g;
}
function xiaohua(mode = 'reveal') {
  let g = room();
  const open = mode === 'release';
  g += path(open ? 'M250 78Q158 20 18 26L60 163L213 132ZM265 78Q365 20 490 26L452 163L297 132Z'
    : 'M253 76Q157 -8 14 12Q31 164 203 191L251 126ZM261 76Q365 -8 499 12Q483 164 310 191L261 126Z', C.ghost, '#3e3748', 3);
  for (const x of [95, 150, 365, 420]) g += path(`M256 77Q${x} 60 ${x} 140`, '#8c7d9c');
  if (mode !== 'stay') g += person(258, 80, .8, C.paper);
  if (mode !== 'human') for (const [i, x] of [70, 147, 365, 446].entries()) g += path(`M${i < 2 ? 247 : 269} 91Q${x} ${135 + i * 8} ${x} 211`, C.ghost, 'none', 3, `data-moth-tendril="${i + 1}"`);
  g += path('M61 174H194V190H61M78 191V240M176 191V240', C.edge, '#3d5051', 3);
  g += door(220, 127, false, C.teal, 54, 111) + path('M348 141H468M355 141V222M456 141V222', C.light, 'none', 4);
  g += path('M351 143l7 -9m-4 9l4 5', C.gold, 'none', 3);
  if (mode === 'sweep') g += path('M35 162Q255 133 476 170', C.red, 'none', 6) + person(115, 212, .45, C.teal, 'crouch') + arrow('M202 213H158');
  if (mode === 'cocoon') g += path('M82 156Q252 231 438 158Q300 241 102 235Z', C.ghost, '#59445e', 2) + arrow('M280 170V235');
  if (mode === 'powder') g += door(298, 136, false, C.ghost, 40, 99) + arrow('M278 219H422') + person(433, 164, .55, C.teal, 'crouch');
  if (mode === 'safe') g += person(417, 169, .55, C.teal, 'crouch') + check(478, 220);
  if (mode === 'stop') g += path('M20 222H490', C.green, 'none', 3) + check(474, 199);
  if (mode === 'enclose') g += path('M1 34Q99 170 211 227L12 237ZM508 34Q413 170 299 227L500 237Z', C.ghost, '#51415a', 3);
  if (mode === 'human') return room() + person(255, 95, 1.1, C.paper) + hand(354, 165, 'open', C.paper, .85);
  return g;
}
function ending(kind) {
  if (kind === 'D') return xiaohua('stay') + chair(207, 157, C.gold) + chair(288, 157, C.gold) + person(222, 145, .7, C.teal, 'sit') + person(303, 145, .7, C.paper, 'sit');
  if (kind === 'C') return xiaohua('release') + path('M99 197l69 -17 46 27 -76 16Z', C.paper, '#bbc6bb') + hand(134, 205, 'open', C.gold, .45);
  if (kind === 'E') return room() + chair(281, 95, C.ghost) + desk() + hand(192, 199, 'point', C.gold, .6) + path('M214 180l5 -7m3 13l8 -3', C.gold, 'none', 3);
  if (kind === 'A' || kind === 'B') {
    let g = room() + paper(52, 35, 139, 165) + monitor(294, 49, 151, 109) + arrow('M203 114H278') + hand(173, 191, 'point', C.gold, .6);
    if (kind === 'B') g += path('M65 121H172M65 141H172', C.ink, 'none', 11);
    else g += check(163, 174);
    return g;
  }
  return room() + path('M53 151H212V182H53ZM69 182V224M196 182V224', C.edge, '#53696b', 3) +
    ellipse(83, 144, 12, 10, C.paper, '#425c64') + path('M97 136L145 137L165 151L194 151M97 152L143 155L158 166L192 166M104 139L133 146', C.paper, '#425c64', 3) + path('M270 57l-17 31m35 -31l-17 31', C.gold, 'none', 4) +
    person(389, 86, 1.1, C.teal) + hand(359, 155, 'open', C.teal, .65);
}
function corridor(stage = 0) {
  let g = room() + door(354, 51, stage === 4, C.teal, 53, 102);
  g += path('M45 122H145V176H45ZM60 176V189M130 176V189', C.edge, '#3f5257', 3);
  g += path('M205 45h24v123h-24M285 45h49v125h-49', C.edge, '#334b50', 3);
  for (const x of [286, 298, 310, 322]) g += path(`M${x} 49v119`, C.edge);
  const points = [[28, 212], [104, 190], [217, 185], [306, 186], [379, 175]];
  for (let i = 0; i < 5; i++) {
    const [x, y] = points[i];
    g += ellipse(x, y, 14, 7, i === 2 ? C.gold : C.green, C.ink) + txt(`N${i}`, x - 10, y + 28, i === 2 ? C.gold : C.green, 14);
    if (i < 4) g += arrow(`M${x + 19} ${y}L${points[i + 1][0] - 19} ${points[i + 1][1]}`, C.teal, true);
  }
  if (stage < 4) g += person(408, 73, .9) + path('M391 66l34 -6M406 150q-34 14-52 12', C.ghost);
  const [x, y] = points[stage];
  g += person(x, y - 28, .48, C.teal, 'crouch');
  if (stage === 2) g += arrow('M206 162L126 172', C.gold);
  if (stage === 4) g += check(439, 191);
  return g;
}
function reception(stage) {
  let g = room() + door(372, 46, stage === 5, C.gold, 47, 104);
  g += path('M307 130H439L474 158H299ZM299 158H474V188H299', C.edge, '#4a5756', 3);
  for (let i = 0; i < 3; i++) {
    const x = 112 + i * 66;
    g += chair(x, 123);
    if (stage > 0 && stage < 5 && i >= stage - 2) {
      g += person(x + 15, 101, .67, C.ghost, 'sit') + rect(x + 26, 141, 12, 20, C.paper, C.gold);
      if (i === stage - 2) g += arrow(`M${x + 41} 165Q${x + 80} 178 361 183`);
    }
  }
  g += monitor(33, 61, 62, 39) + rect(324, 78, 37, 28, C.ink, C.gold);
  if (stage >= 2 && stage <= 4) g += txt(`0${stage - 1}`, 329, 99, C.gold, 20);
  if (stage === 5) g += arrow('M227 209L369 176') + hand(418, 147, 'point', C.gold, .5);
  return g;
}
function pipes(mode = 0) {
  let g = rect(22, 21, 466, 202, '#23363c', C.edge);
  for (let i = 0; i < 3; i++) {
    const x = 48 + i * 100;
    g += rect(x, 53, 83, 100, C.ink, C.gold) + path(`M${x} 108h42V${mode ? 76 : 153}`, C.teal, 'none', 7);
    g += path(`M${x + 19} 38q23 -20 43 0`, C.gold, 'none', 2, 'marker-end="url(#vis-arrow-gold)"');
  }
  g += path('M332 108h61v-52h47M393 108h47M393 108v73h47', C.teal, 'none', 7);
  g += path('M434 45v22M434 101v16', C.red, 'none', 4) + arrow('M394 178H456');
  return g;
}
function lamp(stage = 0) {
  let g = room() + path('M95 224V68M68 224H124', C.edge, 'none', 8);
  g += path('M68 72l56 -17v49l-56 -18Z', C.edge, '#4a595b', 3);
  if (stage !== 0) g += path('M124 61L416 112L416 180L124 100Z', C.gold, '#e6bc6819');
  g += path('M390 110V194M403 110V194M354 194H455', C.edge, 'none', 6);
  g += rect(367, 133, 64, 25, C.ink, C.gold) + path(`M${stage === 2 ? 403 : 384} 136v19`, C.gold, 'none', 5);
  g += path('M432 189v-40l19 -10', C.gold, 'none', 5);
  if (stage === 0) g += path('M176 167l35 -29 25 45 -43 14ZM245 158l30 -15 23 41 -38 7ZM315 152l23 -11 17 39 -26 10Z', C.edge, '#516769');
  if (stage === 2) g += hand(450, 193, 'point', C.gold, .55) + arrow('M445 155V183');
  return g;
}
function tanks(balanced = false) {
  let g = path('M40 207H471', C.edge, 'none', 6);
  for (let i = 0; i < 3; i++) {
    const x = 66 + i * 151, level = balanced ? 2 : i === 1 ? 0 : 3;
    g += `<g data-water-level="${level}">` + rect(x, 34, 103, 165, 'none', C.light);
    if (level) g += rect(x + 3, 196 - level * 39, 97, level * 39, '#3f7c86', C.teal, 0);
    for (let t = 1; t < 4; t++) g += path(`M${x + 2} ${196 - t * 39}h10`, C.gold);
    g += txt(level, x + 44, 229, C.gold, 22) + '</g>';
  }
  g += path('M168 165h48M320 165h47', C.edge, 'none', 9);
  if (!balanced) g += arrow('M174 89H211', C.gold) + arrow('M365 89H327', C.gold);
  else g += ellipse(192, 166, 12, 12, C.gold) + path('M183 157l18 18m0 -18l-18 18', C.gold) + check(441, 218);
  return g;
}
function hatch(mode = 'lid') {
  let g = path('M20 185L211 61L489 103L303 231Z', C.edge, '#33484e', 3);
  g += path('M170 146L260 91L387 111L295 169Z', C.teal, '#071015', 3);
  if (mode === 'lid') g += path('M260 91L258 15L388 36L387 111Z', C.gold, '#485b5d', 3) + path('M359 51L376 124', C.gold, 'none', 5) + arrow('M217 136L282 164');
  else g += path('M217 130L281 141M230 152L294 161M247 176L307 183', C.teal, 'none', 5) +
    path('M333 136l44 15v42M358 151h32v11h-32', C.gold, 'none', 5) + hand(394, 165, 'point', C.gold, .6);
  return g;
}
function platform() {
  return path('M28 80L253 36L482 87L255 141ZM255 141V170M28 80V109L255 170L482 117V87', C.edge, '#3e5c61', 3) +
    rect(155, 161, 173, 31, C.ink, C.light) + ellipse(241, 176, 11, 8, C.green) +
    path('M353 83l37 -7v40l-37 7ZM368 103l49 17', C.gold, '#79705a', 4) + hand(421, 157, 'point', C.gold, .6) + check(105, 175);
}
function landmarks(stage = 0) {
  let g = room() + door(218, 42, false, C.light, 80, 155);
  g += path('M214 44l11 12 -11 7', C.gold, 'none', 5) + path('M289 121H450M342 121V221M430 121V221', C.light, 'none', 5);
  g += path('M343 128l11 15m-14 -5l7 7m-3 -1l5 6', C.gold, 'none', 3);
  g += path('M354 141q-14 9 3 16l12 42 -16 16 2 -40 -10 -20q-8 -16 9 -14Z', C.paper, '#8fa09c');
  if (stage === 1) g += arrow('M192 217Q98 208 138 162Q186 130 193 192', C.ghost, true);
  if (stage === 2) {
    g += ellipse(220, 56, 23, 23, C.gold, 'none') + ellipse(347, 140, 24, 24, C.gold, 'none') + ellipse(358, 186, 24, 24, C.gold, 'none');
  }
  if (stage === 3) g += path('M414 63V182H386V217', C.teal, 'none', 5) + arrow('M385 191V230');
  if (stage === 4) return hatch('lid');
  return g;
}
function lift(stage = 0) {
  let g = room() + rect(117, 19, 262, 217, C.ink, C.light);
  g += rect(135, 35, 227, 188, stage === 3 ? '#65706b' : '#21363d', C.edge);
  if (stage !== 2 && stage !== 4) for (let i = 0; i < 6; i++) g += path(`M${140 + i * 35} 40l35 85 -35 91m0 -176l-30 85 30 91`, C.light, 'none', 2);
  g += rect(392, 51, 50, 109, C.wall, C.edge);
  for (let i = 0; i < 3; i++) g += ellipse(416, 73 + i * 31, 7, 7, i === Math.min(stage, 2) ? C.gold : C.edge);
  if (stage === 1) {
    g += path('M153 182L271 175L309 214L182 229Z', C.gold, '#56665f', 3) + path('M174 190l3 13m95 -13l6 12', C.gold, 'none', 5) + hand(311, 169, 'point', C.gold, .6);
  }
  if (stage === 2 || stage === 4) g += path('M128 212H365M160 222H333M175 236H320', C.teal, 'none', 5) + arrow('M255 224V115') + hand(353, 180, 'open', C.gold, .55);
  if (stage === 3) g += path('M145 77h211m-211 42h211m-211 42h211M189 35v42m83 0v42m-83 0v42m83 0v61', C.edge);
  return g;
}
function liftStops() {
  let g = rect(60, 26, 130, 201, C.wall, C.edge) + rect(305, 26, 130, 201, C.wall, C.edge);
  for (const [x, values] of [[60, [29, 30, 31]], [305, [47, 48]]]) {
    for (const [i, value] of values.entries()) {
      const y = 184 - i * 63;
      g += path(`M${x - 17} ${y}h164`, C.edge) + txt(`${value}F`, x + 43, y - 13, C.gold, 20);
    }
    g += path(`M${x + 19} 32V213M${x + 111} 32V213`, C.light, 'none', 3);
  }
  return g + txt('L1', 105, 19, C.teal, 18) + txt('L2', 351, 19, C.teal, 18);
}
function waves(live = false, label = '現場') {
  let g = rect(25, 13, 460, 222, C.ink, C.edge);
  g += path('M84 38V209M80 54h8m-8 62h8m-8 62h8', C.edge);
  const count = live ? 1 : 3;
  for (let i = 0; i < count; i++) {
    const y = live ? 128 : 54 + i * 61;
    g += path(`M95 ${y}H465`, '#31494f');
    g += path(`M96 ${y}h25l8 -10 9 20 10 -31 11 42 10 -35 11 20 11 -13h24l10 -7 9 14 10 -5h35l9 -15 9 23 11 -11h66`, i === 1 ? C.gold : C.teal);
    g += txt(live ? label : ['A', 'B', 'C'][i], 42, y + 6, live ? C.green : C.gold, 18);
  }
  if (live && label === '現場') g += path('M386 191l22 -16 24 16m-24 -16v32', C.green, 'none', 3);
  if (live && label !== '現場') g += path('M389 176l22 15 -22 15Z', C.gold, C.gold);
  return g;
}
function power(stage) {
  let g = rect(44, 19, 420, 204, C.wall, C.edge);
  if (stage === 0) {
    g += path('M255 40V89M114 102V87H397V102', C.teal, 'none', 4);
    for (let i = 0; i < 3; i++) g += rect(77 + i * 141, 111, 76, 78, C.ink, [C.green, C.gold, C.ghost][i]) + path(`M${92 + i * 141} 150l20 -16 23 22`, C.light, 'none', 3);
  } else if (stage === 1) {
    for (let i = 0; i < 3; i++) g += rect(88 + i * 116, 58, 75, 106, C.ink, C.edge) + path(`M${125 + i * 116} 80v61`, i < 2 ? C.green : C.edge, 'none', 8);
    g += arrow('M255 185H422', C.gold) + txt('R12 回訪', 310, 214, C.gold, 16);
  } else if (stage === 2) {
    g += ellipse(255, 105, 62, 62, C.light) + path('M204 127L255 105L273 57', C.gold, 'none', 4) + path('M203 74q54 -58 105 0', C.green, 'none', 4);
    for (let i = 0; i < 3; i++) g += ellipse(199 + i * 56, 194, 11, 11, C.green);
  } else {
    for (let i = 0; i < 4; i++) {
      const x = 79 + i * 101;
      g += rect(x, 69, 49, 88, C.ink, C.gold) + txt(i + 1, x + 18, 120, C.gold, 20);
      g += ellipse(x + 25, 85, 5, 5, C.green) + path(`M${x + 12} 137h25m-12 0v34`, C.gold, 'none', 3);
      if (i < 3) g += arrow(`M${x + 51} 113h42`);
    }
  }
  return g;
}
function repair(stage) {
  let g = rect(29, 20, 452, 204, C.wall, C.edge);
  if (stage === 0) {
    g += ellipse(104, 83, 24, 24, C.light) + rect(224, 58, 48, 50, C.ink, C.light) + rect(368, 58, 48, 50, C.ink, C.green);
    g += path('M234 58l18 24 -15 26', C.red, 'none', 4) + cross(102, 139) + cross(248, 139) + check(391, 138);
    g += path('M368 164h48v34h-48Z', C.gold) + arrow('M392 114V155');
  } else if (stage === 1) {
    g += '<g data-wire="two-short" data-target="right">' + path('M80 57H360V149', C.teal, 'none', 7) + '</g>';
    g += '<g data-wire="long" data-target="left">' + path('M80 102H204V149', C.teal, 'none', 7) + '</g>';
    g += path('M115 48v18m13 -18v18M115 94v16', C.gold, 'none', 4);
    g += rect(182, 149, 45, 43, C.ink, C.gold) + rect(338, 149, 45, 43, C.ink, C.gold);
    for (const x of [194, 213, 350, 369]) g += path(`M${x} 158v25`, C.light, 'none', 3);
    g += txt('雙短線', 80, 37, C.light, 16) + txt('長線', 80, 89, C.light, 16);
    g += txt('設備／左座', 163, 217, C.light, 16) + txt('門禁／右座', 321, 217, C.light, 16);
  } else if (stage === 2) {
    g += rect(130, 45, 253, 134, '#3c4d50', C.light) + path('M151 62v98M179 62v98', C.green, 'none', 8);
    g += path('M294 67v85', C.gold, 'none', 9) + hand(329, 151, 'point', C.gold, .65) + check(412, 117);
  } else {
    g += monitor(79, 47, 181, 123) + paper(312, 54, 97, 134) + arrow('M277 119H300');
    g += txt('供電', 137, 211, C.green, 18) + txt('權限另核', 316, 211, C.gold, 18);
  }
  return g;
}
function bed(stage = 0) {
  let g = room() + path('M56 125L240 107L322 153L133 181ZM133 181V204M56 125V175M322 153V194', C.edge, '#5b7373', 3);
  g += path('M76 128l46 -4 39 18 -47 8Z', C.edge, C.paper) + rect(202, 61, 37, 27, C.paper, C.gold);
  if (stage === 0) g += paper(357, 122, 87, 111);
  if (stage === 1) g += arrow('M238 99Q299 69 375 127', C.gold) + hand(368, 193, 'point', C.gold, .55);
  if (stage >= 2) g += person(196, 86, .9, C.ghost, 'sit') + path('M92 42h326v129H92Z', C.ghost, 'none', 2, 'stroke-dasharray="6 5"');
  if (stage === 3) g += path('M133 218h249', C.gold, 'none', 2) + txt('同鏡位歷史靜格', 181, 237, C.gold, 16);
  return g;
}
function notebook(stage = 0) {
  let g = path('M37 25Q157 4 255 30Q358 4 476 25V219Q360 195 255 223Q157 195 37 219ZM255 30V223', C.edge, '#bdcbbf', 3);
  const ink = '#3f5d63';
  if (stage === 0) g += rect(65, 54, 146, 115, '#5c7d7c', ink) + person(113, 85, .65, C.paper) + path('M143 135l40 -14 15 30 -43 13Z', ink, '#b9c0b3');
  else if (stage === 1) g += group(58, 53, waves(true), .33) + path('M316 70v91m-10 -77l10 -14 10 14m-21 64l11 13 10 -13', ink, 'none', 3);
  else if (stage === 2) g += rect(70, 49, 152, 139, '#3c5059', ink) + person(151, 82, .8, C.paper) + path('M81 57h15m100 0h15M81 180h15m100 0h15', C.paper);
  else if (stage === 3) g += paper(78, 43, 126, 147) + path('M99 143q21 -32 48 0q22 -22 37 8', ink, 'none', 3);
  else if (stage === 4) g += door(96, 52, false, ink, 75, 133) + path('M321 64h102m-102 29h72m-72 29h94m-94 29h56', ink, 'none', 3);
  else if (stage === 5) g += rect(72, 59, 126, 121, '#e3e5d9', ink) + rect(316, 59, 126, 121, '#e3e5d9', ink) + arrow('M207 121H303', C.gold) +
    path('M88 91h91m-91 28h70m-70 28h85', ink) + path('M333 150l29 -44 20 19 18 -10 26 35Z', ink, '#829f98');
  else if (stage === 6) g += path('M76 146h56v-60h69m98 27h69v60h58', ink, 'none', 5) + path('M201 86h40M279 113h20', ink, 'none', 3, 'stroke-dasharray="5 5"') + ellipse(76, 146, 10, 10, ink, '#e3e5d9');
  else g += path('M98 79l80 -22v68l-80 22ZM178 79q52 12 0 38m0 -51q82 17 0 66', ink, '#557c80', 4) + paper(325, 53, 99, 134);
  return g;
}
function brake() {
  let g = room() + ellipse(240, 121, 73, 73, C.light, '#354f55');
  for (let i = 0; i < 12; i++) {
    const a = i * Math.PI / 6, x = 240 + Math.cos(a) * 72, y = 121 + Math.sin(a) * 72;
    g += path(`M${x.toFixed(1)} ${y.toFixed(1)}l${(Math.cos(a) * 12).toFixed(1)} ${(Math.sin(a) * 12).toFixed(1)}`, C.light, 'none', 5);
  }
  g += path('M330 151L289 175L315 201L359 168Z', C.gold, '#615e4f', 4) + hand(372, 194, 'point', C.gold, .65);
  g += path('M67 63h71v115H67ZM74 75l56 92m0 -92l-56 92', C.edge, 'none', 3);
  return g;
}
function archive() {
  let g = room() + path('M76 72h145v134H76ZM281 72h145v134H281', C.edge, '#2c444c', 3);
  for (let i = 0; i < 5; i++) g += rect(85, 80 + i * 22, 125, 15, C.ink, C.light);
  g += rect(291, 116, 122, 65, '#576970', C.gold) + ellipse(353, 148, 23, 23, C.light);
  g += path('M285 103l17 21m-16 63l17 -20m116 -63l-17 21m16 63l-17 -20', C.gold, 'none', 3);
  return g + hand(329, 203, 'point', C.gold, .55) + arrow('M232 153H270');
}
function documents(stage = 0) {
  let g = paper(36, 37, 130, 166) + paper(190, 28, 130, 175) + paper(344, 37, 130, 166);
  if (stage === 0) g += path('M61 161q29 -30 75 5M215 161q29 -30 75 5M369 161q29 -30 75 5', '#405b64', 'none', 3);
  if (stage === 1) g += rect(57, 106, 87, 44, 'none', C.red) + txt('自願', 79, 135, C.red, 20) + path('M55 151l94 -47', C.red, 'none', 4);
  if (stage === 2) g += arrow('M167 124H186') + arrow('M320 124H340') + hand(428, 201, 'point', C.gold, .55);
  return g;
}
function timeline(date = false) {
  let g = rect(28, 21, 454, 201, C.ink, C.edge);
  if (date) {
    g += path('M65 132H444', C.teal, 'none', 4);
    for (const [i, label] of ['失聯', '缺口', '封鎖'].entries()) g += path(`M${85 + i * 161} 114v36`, C.gold, 'none', 3) + txt(label, 66 + i * 161, 183, C.gold, 18);
    g += txt('48 小時', 208, 81, C.paper, 24);
  } else {
    for (let i = 0; i < 3; i++) g += path(`M66 ${79 + i * 46}H447`, C.teal, 'none', 9) + rect(321, 63 + i * 46, 20, 32, '#796044', C.gold);
    g += txt('02:15', 59, 44, C.light, 16) + txt('02:22', 389, 44, C.light, 16) + path('M321 216h20', C.gold, 'none', 4);
  }
  return g;
}
function speakers() {
  let g = room();
  for (let i = 0; i < 3; i++) {
    const x = 96 + i * 145;
    g += rect(x, 47, 70, 101, '#344c54', C.light) + ellipse(x + 35, 93, 24, 24, C.edge) + ellipse(x + 35, 93, 8, 8, C.teal);
    g += path(`M${x + 35} 151v37`, C.gold, 'none', 4) + txt(['A', 'B', 'C'][i], x + 28, 221, C.gold, 20);
    if (i < 2) g += arrow(`M${x + 77} 182h52`);
  }
  return g + hand(409, 175, 'point', C.gold, .55);
}
function moth() {
  return room() + path('M139 194l89 -20 66 29 -103 21Z', C.paper, '#cad3c5') + hand(175, 197, 'open', C.gold, .55) +
    path('M227 175q-20 -29-31 -16q-8 18 30 23q21 -31 34 -21q10 19-33 22m0 -8v16', C.gold, '#796b53', 2);
}
function communal(suite = false) {
  let g = room();
  if (suite) {
    g += path('M44 128L184 102L254 139L112 176ZM112 176V202M244 144V187', C.edge, '#677c78', 3);
    g += path('M298 47V207M298 118H454', C.edge, 'none', 4) + rect(331, 67, 75, 45, C.paper, C.edge) + ellipse(369, 89, 21, 11, C.edge);
    g += ellipse(372, 171, 22, 28, C.edge, C.paper) + rect(355, 134, 34, 20, C.paper, C.edge);
  } else {
    for (let i = 0; i < 4; i++) g += rect(68 + i * 94, 91, 67, 35, '#667f7e', C.light) + ellipse(97 + i * 94, 108, 20, 8, C.edge);
    g += path('M49 131H463V149H49M78 150V206M429 150V206', C.edge, '#3c555b', 4);
    g += path('M55 217H462', C.gold, 'none', 3);
  }
  return g;
}
function washroom() {
  let g = room();
  for (let i = 0; i < 6; i++) {
    const x = 95 + i * 54;
    g += `<g data-shower-bay="${i + 1}">` + path(`M${x} 50v102M${x + 26} 113V66h12v8`, C.edge, 'none', 3) + ellipse(x + 38, 77, 7, 3, C.light) + '</g>';
  }
  g += path('M420 50V152M85 177H359L392 195H99Z', C.edge, C.paper, 3);
  for (let i = 0; i < 4; i++) g += path(`M${117 + i * 65} 178v-18h14v9`, C.edge, 'none', 3);
  return g;
}
function buildings() {
  let g = path('M52 231V73L190 45V231ZM314 231V21L459 45V231Z', C.edge, '#2e444b', 3);
  for (const [x, w, floors] of [[53, 135, 7], [316, 140, 10]]) for (let i = 0; i < floors; i++) g += path(`M${x} ${219 - i * 17}h${w}`, '#678186');
  for (const [y, name] of [[187, '15F'], [143, '22F'], [115, '26F']]) {
    g += path(`M190 ${y}H314`, C.gold, 'none', 5) + txt(name, 231, y - 9, C.gold, 16);
  }
  return g + txt('A 棟 · 26F', 63, 37, C.teal, 20) + txt('B 棟 · 50F', 324, 17, C.teal, 20);
}
function ascent() {
  let g = rect(18, 18, 110, 172, C.wall, C.edge) + rect(151, 122, 177, 68, C.wall, C.edge) + rect(354, 42, 138, 148, C.wall, C.edge);
  g += arrow('M73 65V166H189V151H236V126H285V100H405V75');
  g += path('M137 27V185M340 27V185', C.red, 'none', 4);
  g += path('M28 113H111M28 139H111M28 165H111', C.edge);
  g += path('M175 168H206V143H253V118H300', C.edge);
  g += txt('32F R17', 28, 42, C.gold, 18) + txt('C-02 ↓', 31, 94, C.teal, 18);
  g += txt('28F 校正', 159, 180, C.gold, 17) + txt('29F', 213, 119, C.gold, 17) + txt('30F', 272, 91, C.gold, 17);
  g += txt('31F R23', 367, 65, C.gold, 18) + txt('檔案新翼', 367, 113, C.teal, 18);
  return g + txt('隔牆分翼；跨門後才展開下部 → 50F', 36, 224, C.light, 18);
}
function core(index) {
  if (index === 0) return bed(0);
  if (index === 1) return notebook(0) + group(282, 49, monitor(0, 0, 145, 94), 1);
  if (index === 2) return documents(2);
  if (index === 3) return lamp(2);
  if (index === 4) return corridor(1);
  return room() + door(217, 42, true, C.green, 80, 155) + arrow('M255 231V164') + check(342, 180);
}

export function renderPanelVisual(id, index) {
  let drawing;
  switch (id) {
    case 'V09': drawing = index === 2 ? sources() : ahsunScene(['state', 'read', null, 'submit'][index]); break;
    case 'V10': drawing = ahsunScene(['gaze', 'closed', 'scratch', 'retreat'][index]); break;
    case 'L03': drawing = ahsunScene(['closed', 'retreat', 'read', 'state'][index]); break;
    case 'V12': drawing = abiao(['palm', 'release', 'sources', 'choice'][index]); break;
    case 'L06': drawing = abiao(['palm', 'release', 'safe', 'stopped'][index]); break;
    case 'V38': drawing = xiaohua(['reveal', 'sweep', 'cocoon', 'powder', 'safe', 'stop'][index]); break;
    case 'L08': drawing = xiaohua(['sweep', 'cocoon', 'powder', 'reveal'][index]); break;
    case 'ART02': drawing = xiaohua(['human', 'reveal', 'enclose', 'release'][index]); break;
    case 'L02': drawing = reception(index); break;
    case 'V07': drawing = index === 1 ? waves(true) : corridor([0, 0, 2, 4][index]); break;
    case 'L05': drawing = index < 2 ? corridor(index) : index === 2 ? room() + door(211, 35, true, C.gold, 86, 172) + hand(320, 185, 'point', C.gold, .7)
      : index === 3 ? group(0, 32, room() + chair(245, 125, C.gold), .47) + group(269, 32, room() + chair(245, 125, C.gold) + person(260, 103, .75, C.ghost, 'sit'), .47) + txt('現在：空椅', 57, 208, C.gold) + txt('歷史：凝固靜格', 319, 208, C.ghost)
      : index === 4 ? room() + rect(122, 36, 261, 130, '#496b7722', C.teal) + person(258, 76, .9) + path('M135 153L363 49', C.light)
      : waves(); break;
    case 'V01': drawing = bed(index); break;
    case 'V02': drawing = notebook(index); break;
    case 'L04': drawing = power(index); break;
    case 'L07': drawing = [() => documents(), () => lift(4), () => hatch(), () => tanks(true), brake, archive][index](); break;
    case 'L09': drawing = ending(['A', 'B', 'C', 'D', 'E', 'return'][index]); break;
    case 'L10': drawing = [pipes, () => lamp(2), () => landmarks(2), () => hatch('pin'), () => tanks(), platform][index](); break;
    case 'V24': drawing = [waves, () => room() + rect(122, 36, 261, 130, '#496b7722', C.teal) + person(258, 76, .9), () => documents(2), () => room() + door(217, 42, true, C.green, 80, 155) + arrow('M121 211Q255 225 260 162', C.gold) + arrow('M389 211Q270 225 270 162')][index](); break;
    case 'V25': drawing = [() => documents(1), () => waves(true, '錄音') + txt('來源錄音 · 30 秒', 161, 40, C.gold, 18), () => timeline(), () => timeline(true), speakers,
      () => room() + door(49, 70, true, C.edge, 65, 130) + monitor(198, 91, 116, 74) + door(384, 70, true, C.teal, 65, 130) + arrow('M118 207H185') + arrow('M315 207H375') + txt('R26', 67, 56, C.gold) + txt('R25', 236, 56, C.gold) + txt('M1', 401, 56, C.gold)][index](); break;
    case 'V15': drawing = index === 0 ? documents() + hand(429, 191, 'point', C.gold, .55) : index === 1 ? ending('D') : index === 2 ? archive() : ending('E'); break;
    case 'REF-LIFT': drawing = index === 5 ? liftStops() : lift(index); break;
    case 'REF-U4': drawing = index === 5 ? landmarks(2) : landmarks(index); break;
    case 'REF-MECHANISM': drawing = index < 3 ? lamp(index) : index < 5 ? tanks(index === 4) : platform(); break;
    case 'REF-HEARING': drawing = index === 0 ? group(0, 32, waves(), .47) + group(269, 32, waves(true), .47) + txt('歷史來源', 74, 208, C.gold) + txt('現場聲音', 345, 208, C.green)
      : index === 1 ? corridor(0) : index === 2 ? corridor(2) : index === 3 ? ahsunScene('read') : index === 4 ? corridor(1) : waves(true); break;
    case 'REF-R12': drawing = repair(index); break;
    case 'V29': drawing = index === 0 ? room() + door(217, 42, true, C.green, 80, 155) + arrow('M255 231V164') : index === 1 ? moth()
      : index === 2 ? room() + door(217, 42, true, C.green, 80, 155) + check(345, 178) : archive(); break;
    case 'V30': drawing = [pipes, () => hatch('pin'), () => lamp(2), () => landmarks(1)][index](); break;
    case 'CORE': drawing = core(index); break;
    case 'WORLD': drawing = [buildings, liftStops, ascent,
      () => group(0, 32, communal(), .47) + group(269, 32, washroom(), .47) + txt('R6 · 食堂 · 11F', 35, 208, C.gold) + txt('R4 · 衛浴 · 2F', 310, 208, C.gold),
      () => communal(true), () => room() + rect(179, 53, 151, 115, '#703b44', C.ghost) + path('M181 55l146 111m0 -111l-146 111m73 -110v110m-73 -55h146', '#d1c6cc', 'none', 2)][index](); break;
    default: throw new Error(`No visual illustration: ${id}`);
  }
  if (!drawing) throw new Error(`No visual panel: ${id}/${index}`);
  return `<g data-visual="${id}" data-step="${index + 1}">${drawing}</g>`;
}

export const VISUAL_DEFS = ['teal', 'gold', 'red'].map(name => `<marker id="vis-arrow-${name}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M1 1L9 5L1 9Z" fill="${C[name]}"/></marker>`).join('');
