import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT } from './sync-canonical.mjs';
import { ACTS } from './screenplay-files.mjs';
import { collectSceneAccess } from './build-scene-images.mjs';

// Geometry proposals only. Route permissions remain in the canonical access tables.
export const LAYOUTS = [
  { id: 'R3', landmark: ['床架與厚柱', '左近綠磁磚、排水槽'], ports: [
    ['front-right', '住宅側平台', '來路／可返回', ['R2↔R3']],
    ['front-left', '洗衣窄巷', '雙向', ['R3↔R4']],
    ['back-right', '工坊方向側路', '逐層上行／可返回', ['R3↔R5']],
  ], note: '2F 洗衣路在左近；另一側經 3F–7F 側路至 8F 工坊，不綁宿舍碎片。' },
  { id: 'R8', landmark: ['視訊隔間', '封窗與地面側道分開'], ports: [
    ['front-left', '窄橋門', '來路／可返回', ['R7↔R8']],
    ['back-left', '短租房門', '雙向／門後下兩級', ['R8↔R9']],
    ['back-right', '內井側道', '雙向／不可翻窗', ['R8↔R10']],
  ], note: '兩出口分列隔間與窗邊；側道接遮棚平台，不露出樓外天空。' },
  { id: 'R11', landmark: ['三排工位與安全邊界', '入口均在遭遇邊界外'], ports: [
    ['front-left', '隔板後長巷', '鎖場時停用', ['R9↔R11']],
    ['front-right', '平台側門', '鎖場時停用', ['R10↔R11']],
    ['back-right', 'S-03 服務梯門', '必要驗證後單向', ['R11→R12']],
  ], note: '來路只保留門框側緣；不能從另一入口繞到敵後或跨房躲避。' },
  { id: 'R12', landmark: ['修理桌與配電面板', '原立管作進場基準'], ports: [
    ['front-left', '後勤平台門', '來路／不可反走', ['R11→R12']],
    ['back-left', '診所舊門', '配電及權限後', ['R12↔R13']],
    ['back-right', '鋼平台門', '配電及權限後', ['R12↔R14']],
    ['front-right', '低負荷門扣', '維修支線後開', ['R12↔R15']],
  ], note: '兩個一般出口與維修門扣分開；捷徑不是初訪第三條解法。' },
  { id: 'R13', landmark: ['候診椅、病床與後簾', '車輪磨痕指向送物廊'], ports: [
    ['front-left', '候診入口', '可返回修理舖', ['R12↔R13']],
    ['back-center', '後簾送物廊', '安息後雙向', ['R13↔R14']],
    ['back-right', '後勤設備道', '安息及物流供電後', ['R13↔R15']],
  ], note: '未完成安息仍可從候診入口退出；兩道後門不合併為同一熱區。' },
  { id: 'R14', landmark: ['貨梯核心與繼電器', '平台、井壁接縫'], ports: [
    ['front-left', '接縫鋼平台', '可返回修理舖', ['R12↔R14']],
    ['back-left', '診所送物廊', '安息後雙向', ['R13↔R14']],
    ['front-right', '井道內側短梯', '安息及物流供電後', ['R14↔R15']],
    ['back-right', '物流維修口', '僅承接 L-04 抵達', ['R17→R14']],
    ['back-center', '貨梯井門', '封閉／不能乘梯', ['封閉']],
  ], note: '維修口不產生回 R17 的捷徑；貨梯門不是可選樓層的出口。' },
  { id: 'R15', landmark: ['發電機與厚柱', '排氣管、舊地磚'], ports: [
    ['front-left', '診所設備道', '原門檻成立可返回', ['R13↔R15']],
    ['front-right', '貨梯短梯', '原門檻成立可返回', ['R14↔R15']],
    ['back-left', '維修門扣', '維修支線後開', ['R12↔R15']],
    ['back-right', '後加防火門', '供電確認及 E2-06 後', ['R15↔R16']],
  ], note: '三供電方案共用同一防火門；不要依方案增畫三扇出口。' },
  { id: 'R17', landmark: ['檔案區與 32-S 路由', '服務門後才有兩支路'], ports: [
    ['front-left', '冷卻管接駁口', '離幕前可返回', ['R16↔R17']],
    ['back-center', '32-S 服務門', '同一門後 L-04／C-02', ['R17→R14', 'R17→R18']],
    ['back-right', '受損公開出口', '封閉／不能到樓外', ['封閉']],
  ], note: 'L-04 與 C-02 是固定分岔，不畫成兩扇外門；去向只供製作核對。' },
  { id: 'R25', landmark: ['會議桌與三喇叭', '舊柱跨、磁磚腰線'], ports: [
    ['front-left', '飯廳轉角門', '安全時可返回', ['R24↔R25']],
    ['back-right', 'C-07 厚門', '校驗及遭遇完成後', ['R25↔R26']],
    ['back-left', '管理維修門', '五段及阿彪處置後', ['R25→M1']],
  ], note: 'R26 返回仍走 C-07；M1 在另一道管理門，必須回此確認離幕。' },
  { id: 'U1', landmark: ['核心柱、墊高收件架', '管圖三端點另在近看'], ports: [
    ['front-left', '展示牆服務門', '可返回 R27', ['R27↔U1']],
    ['back-right', '管圖服務門', '移架、辨路及退栓後', ['U1↔U2']],
    ['back-left', '修燈送件門', '須從 U3 端後開', ['U3↔U1']],
  ], note: '送件門沿同一核心柱回 U3，不是管圖第四答案；初訪外側無把手。' },
  { id: 'U3', landmark: ['核心柱與維修支架', '支架收回才露送件內閂'], ports: [
    ['front-left', '晾架橋口', '已清通的原橋面', ['U2b↔U3']],
    ['back-right', '遮光服務橋', '修燈、橋栓完成後', ['U3↔R28']],
    ['back-left', '柱後送件門', '落橋後另行手動退閂', ['U3↔U1']],
  ], note: '送件廊沿核心柱接回 U1，使用 U3-V02；R30 不可逆提交後停用。' },
  { id: 'U6', landmark: ['三水槽與配重管', '水位 2／2／2、關閥'], ports: [
    ['front-left', '冷藏維修口', '安全時可返回', ['U5↔U6']],
    ['back-right', '固定保養梯', '平衡及關閥後下行', ['U6↔U6b']],
  ], note: '配重管指向下方維修艙；此處只畫固定梯，不依賴未固定的踏板。' },
  { id: 'U6b', landmark: ['水平泡、止回栓', '固定梯與活動踏面分開'], ports: [
    ['back-left', '保養梯腳', '同一固定梯向上', ['U6↔U6b']],
    ['front-right', '配重踏面', '水平確認及扣栓後', ['U6b↔R30']],
  ], note: '到艙與離艙是兩種結構；回 U6 重開閥後，須重新平衡才能再下來。' },
];

const slots = {
  'back-left': [215, 220, '後景左側'], 'back-center': [550, 195, '後景中央'],
  'back-right': [885, 220, '後景右側'], 'front-left': [200, 480, '前景左側'],
  'front-center': [550, 515, '前景中央'], 'front-right': [900, 480, '前景右側'],
};
const escape = text => String(text).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const text = (x, y, size, value, attrs = '') => `<text x="${x}" y="${y}" font-size="${size}" ${attrs}>${escape(value)}</text>`;

export function renderLayout(layout, node, rows) {
  assert.equal(new Set(layout.ports.map(p => p[0])).size, layout.ports.length, `Repeated position: ${layout.id}`);
  assert.deepEqual(layout.ports.flatMap(p => p[3]).sort(), rows.map(r => r.route).sort(), `Layout route coverage: ${layout.id}`);
  const height = 770 + layout.ports.length * 48;
  const shapes = layout.ports.map(([slot, label, state, routes], i) => {
    assert(slots[slot] && label.length <= 12 && state.length <= 16);
    const [x, y] = slots[slot];
    const locked = routes.includes('封閉'), conditional = /後|門檻|鎖場|僅/.test(state);
    const color = locked ? '#6a737b' : conditional ? '#aa582a' : '#147469';
    return `<g data-port="${i + 1}">
      <rect x="${x - 130}" y="${y - 48}" width="260" height="96" fill="white" stroke="${color}" stroke-width="3"/>
      ${text(x - 116, y - 16, 22, `${i + 1}. ${label}`, 'font-weight="700"')}
      ${text(x - 116, y + 17, 17, state, `fill="${color}"`)}
    </g>`;
  });
  const legend = layout.ports.map(([slot, , , routes], i) =>
    text(60, 665 + i * 48, 22, `${i + 1}. ${slots[slot][2]}   ${routes.join(' ／ ')}`));
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1100" height="${height}" viewBox="0 0 1100 ${height}" role="img" aria-labelledby="title desc">
  <title id="title">${escape(layout.id + ' 出入口配置草圖')}</title>
  <desc id="desc">${escape(node.name + '。' + layout.note + '。' + rows.map(r => `${r.label}：${r.location} ${r.state}`).join(' '))}</desc>
  <rect width="1100" height="${height}" fill="#fbfcfc"/>
  <g font-family="Microsoft JhengHei, Noto Sans TC, sans-serif" fill="#233536" letter-spacing="0">
    ${text(40, 52, 30, `${layout.id} · ${node.name} / 出入口配置`, 'font-weight="700"')}
    ${text(40, 92, 20, '固定鏡位提案 · 非比例平面圖 · 非遊戲背景完成稿')}
    <path d="M40 125H1060V600H40Z" fill="#eef4f3" stroke="#a8b8b7" stroke-width="2"/>
    <path d="M260 140H840V325H260Z M260 325L80 580H1020L840 325" fill="none" stroke="#bbc9c8" stroke-width="2"/>
    <rect x="380" y="302" width="340" height="88" fill="#dce8e5" stroke="#a8b8b7"/>
    ${text(550, 337, 23, layout.landmark[0], 'text-anchor="middle" font-weight="700"')}
    ${text(550, 373, 20, layout.landmark[1], 'text-anchor="middle"')}
    ${shapes.join('\n')}
    ${text(550, 580, 17, '主鏡位：由前景看向後景；反向回訪不水平翻圖', 'text-anchor="middle"')}
    ${legend.join('\n')}
    ${text(40, height - 62, 21, layout.note)}
    ${text(40, height - 25, 18, '完整門檻以本房出入口表及動線表為準；未知去向不提前顯示給玩家。')}
  </g>
</svg>\n`;
}

export function buildAccessLayouts(graph, documents) {
  const access = collectSceneAccess(graph, documents), outputs = new Map();
  for (const layout of LAYOUTS) {
    const node = graph.nodes.find(n => n.id === layout.id);
    assert(node, layout.id);
    const act = ACTS.find(a => a.act === node.act), slug = node.id.toLowerCase();
    const file = `assets/scene_access/${slug}.svg`;
    outputs.set(file, renderLayout(layout, node, access.get(node.id)));
    const specFile = `docs/${act.specPath}`;
    let spec = outputs.get(specFile) ?? documents.get(act.specPath);
    const begin = `<!-- access-layout:${node.id}:begin -->`, end = `<!-- access-layout:${node.id}:end -->`;
    const body = `${begin}\n<a id="node-${slug}-access-layout"></a>\n##### 出入口配置草圖\n\n` +
      `![${node.id} 出入口配置草圖](../../${file})\n\n` +
      `**構圖提案：**${layout.note} 各門端位置對應上表；數字只供製作辨識，不是玩家介面或解謎提示。\n\n` +
      `門框、視線及熱區仍須灰盒驗收，依[共用契約](../09_劇本/09-15_正式劇本_共用附錄.md#scene-access-contract)，不計入遊戲圖像交付數。\n${end}`;
    if (spec.includes(begin)) {
      assert.equal(spec.split(begin).length, 2);
      const start = spec.indexOf(begin), stop = spec.indexOf(end, start);
      assert(stop > start);
      spec = spec.slice(0, start) + body + spec.slice(stop + end.length);
    } else {
      const after = `<!-- scene-access:${node.id}:end -->`;
      spec = spec.replace(after, `${after}\n\n${body}`);
    }
    outputs.set(specFile, spec);
  }
  return outputs;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const graph = JSON.parse(readFileSync(path.join(ROOT, 'scene_graph.json'), 'utf8'));
  const docs = new Map(ACTS.map(a => [a.specPath, readFileSync(path.join(ROOT, 'docs', a.specPath), 'utf8').replaceAll('\r\n', '\n')]));
  const outputs = buildAccessLayouts(graph, docs);
  for (const [file, body] of outputs) {
    const absolute = path.join(ROOT, file);
    if (process.argv.includes('--check')) assert.equal(readFileSync(absolute, 'utf8').replaceAll('\r\n', '\n'), body, `Stale layout: ${file}`);
    else { mkdirSync(path.dirname(absolute), { recursive: true }); writeFileSync(absolute, body); }
  }
  console.log(`${LAYOUTS.length} access layouts ${process.argv.includes('--check') ? 'verified' : 'generated'}; permissions sourced from scene access tables.`);
}
