// Geometry and values stay separate from generated material studies.
const C = { bg: '#0b1418', line: '#79d8dc', item: '#e6bc68', event: '#a6cfa7', horror: '#dcb3e4', boss: '#ffa18b', text: '#edf1ef', dim: '#b3c1c5' };
const esc = s => String(s).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const rect = (x, y, w, h, color = C.line, fill = '#152025') => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="4" fill="${fill}" stroke="${color}" stroke-width="2"/>`;
const text = (s, x, y, size = 22, color = C.text) => String(s).split('\n').map((line, i) => `<text x="${x}" y="${y + i * (size + 9)}" font-size="${size}" fill="${color}">${esc(line)}</text>`).join('');
const line = (points, color = C.line, arrow = false, dash = '') => `<polyline points="${points}" fill="none" stroke="${color}" stroke-width="3"${dash ? ` stroke-dasharray="${dash}"` : ''}${arrow ? ' marker-end="url(#arrow)"' : ''}/>`;
const box = (x, y, w, h, title, body = '', color = C.line) => rect(x, y, w, h, color) + text(title, x + 20, y + 34, 24, color) + text(body, x + 20, y + 69, 20);
const circle = (x, y, r, color = C.item) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${C.bg}" stroke="${color}" stroke-width="3"/>`;
function diagram(id, title, subtitle, height, graphics, notes) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="${height}" viewBox="0 0 1200 ${height}" role="img" aria-labelledby="title desc">
<title id="title">${esc(id + '｜' + title)}</title><desc id="desc">${esc(subtitle + '；' + notes.join('；'))}</desc>
<defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10Z" fill="${C.line}"/></marker></defs>
<style>text{font-family:"Microsoft JhengHei","Noto Sans TC",sans-serif;letter-spacing:0}</style>
<rect width="1200" height="${height}" fill="${C.bg}"/>
${text(id + '｜' + title, 32, 52, 30)}${text(subtitle, 32, 94, 20, C.dim)}
${graphics}
${line(`32,${height - 126} 1168,${height - 126}`, '#425155')}
${text(notes.join('\n'), 32, height - 94, 20, C.dim)}
${text('製作圖解 · 非遊戲介面或完成素材 · 正式差分及比例依本房工單驗收', 32, height - 25, 18, C.dim)}
</svg>\n`;
}

export const ASCENT_GROUPS = {
  'REF-ASCENT-A': { title: 'A 棟 3–7F 探路與接景', scenes: ['R3', 'R5'], prefix: ['T-R3-R5-'], start: 'R3 · A 棟 2F', end: 'R5 · A 棟 8F',
    beats: ['認防滑踏板與套箍旁承重支架', '退桌腳插銷，再沿原滑槽收桌', '選入樑螺栓與連續窄梯', '沿地磚過半扇小門；吊帶近看選填', '解夾扣、束布，沿雙輪痕上後梯'] },
  'REF-ASCENT-A-UPPER': { title: 'A 棟 9–14F 生活路線', scenes: ['R5', 'R6', 'R7'], prefix: ['T-R5-R6-', 'T-R6-R7-'], start: 'R5 · A 棟 8F', end: 'R7 · A 棟 15F',
    beats: ['掛回濾籃，開旁通露踏板', '空籃到限位並插止擋銷，人走旁梯', '沿服務線槽撥檢修扇門閂', '推空衣架，找水箱工作臺固定梯', '沿門底磨痕開工作通道上樓'] },
  'REF-ASCENT-B': { title: 'B 棟 16–22F 與同層跨棟', scenes: ['R11', 'R12'], prefix: ['T-R11-R12-'], start: 'R11 · B 棟 15F（單向門已跨過）', end: 'R12 · A 棟 23F',
    beats: ['沿完整接頭與踏板入缺口', '選溢流旁通，排水後走塔腳短梯', '鬆卡榫，空盤架沿導槽推至止擋', '暗側連續腳踏與護欄才接上行口', '折梯兩側扣已到位，直接循梯上行', '橋板只跨同層窄溝，扣妥另一端', '本地停機 → B22F 橋 → A22F → 短梯'] },
  'REF-ASCENT-HIGH': { title: 'B 棟 33–36F 到校正入口', scenes: ['R17', 'R18'], prefix: ['T-R17-R18-'], start: 'R17 · B 棟 32F（離幕門已跨過）', end: 'R18 · B 棟 37F 入口安全點',
    beats: ['核踏板接點，繞貨架外側上梯', '開四角扣檢修蓋，走背板後固定梯', '空貨臺橫移對孔，壓下繫繩鎖銷', '開護角旁檢修片，沿背後步道上樓'] },
};

function ascent(id, data, flow) {
  const children = data.prefix.flatMap(prefix => flow.subscenes.filter(s => s.id.startsWith(prefix)));
  let g = box(270, 135, 890, 84, data.start, '', C.event);
  children.forEach((s, i) => {
    const y = 257 + i * 144;
    g += line(`175,${y - 35} 175,${y + 108}`, C.line, true);
    g += box(32, y, 220, 105, `${s.floor.label} · ${s.building.entry} 棟`, '', C.item);
    g += box(270, y, 890, 105, `${s.id} · ${s.name}`, data.beats[i]);
    if (i < children.length - 1 && s.id === 'T-R5-R6-02') g += text('先進 R6（11F）完成本房，再續往 12F', 291, y + 128, 19, C.event);
  });
  const endY = 257 + children.length * 144;
  g += line(`175,${endY - 35} 175,${endY + 35} 260,${endY + 35}`, C.line, true);
  g += box(270, endY, 890, 84, data.end, '', C.event);
  return diagram(id, data.title, '圖號、棟別與單一平台樓層取自正式動線；箭頭表示接景順序，不代表一張連續長樓梯。', endY + 245, g,
    ['已開機構依原條件保存；回訪權限仍按本房與路線。', '次場景概念圖中的支架、門框與近看，須逐格對照此圖及圖像表。']);
}

function calibration() {
  let g = box(32, 140, 1136, 302, 'R18 · 37F 校正走廊／俯視關係示意', '');
  const names = ['N0 入口', 'N1 推車', 'N2 門凹', 'N3 布簾', 'N4 門前'];
  names.forEach((n, i) => {
    const x = 62 + i * 220;
    g += rect(x, 225, 190, 80, i === 2 ? C.item : C.event) + text(n, x + 16, 272, 23);
    if (i < 4) g += line(`${x + 190},265 ${x + 217},265`, C.line, true);
  });
  g += text('N0→N1：2.2／4.0 秒   N1→N2：1.6／3.2 秒   N2→N3：2.8／3.8 秒   N3→N4：2.2／3.4 秒', 62, 352, 20);
  g += text('失敗復位只用已到達完整掩體：N0／N1／N3；N2 不是失敗復位點。', 62, 396, 21, C.item);
  g += box(32, 496, 530, 285, 'R19 · 收容側', '入口隔音門 → 牆角 → 固定空椅\n椅外側側門繞行到 R20\n當前空椅與歷史凝固分層');
  g += box(638, 496, 530, 285, 'R20 · 觀察側', '入口實心擋板 → 控制台／桌下\n回全景再自行返回控制台\n三軌、段 C、F3、本地驗證各自完成');
  g += rect(585, 505, 25, 265, C.item) + text('同一片玻璃', 490, 828, 24, C.item);
  g += line('530,720 530,868 665,868 665,750', C.line, true);
  g += text('經側門繞到背面；不是穿過玻璃', 385, 910, 22);
  return diagram('REF-CALIBRATION', '三房遮蔽與同片玻璃', 'R18／R19／R20 均在 B 棟 37F；位置關係供鏡位校核，不是新增建築尺寸。', 1100, g,
    ['門牌、水痕、布簾與振膜可辨；巡行不新增腳步濺水聲。', 'R19 慢關門與屏息、R20 現場聽覺與歷史聲軌，沿各自安全規則。']);
}

function bridges(flow) {
  const pairs = [['R12', 'R14'], ['R13', 'R14'], ['R13', 'R15'], ['R12', 'R15']];
  let g = '';
  pairs.forEach(([from, to], i) => {
    const route = flow.routes.find(r => r.from === from && r.to === to);
    const y = 145 + i * 230;
    g += text(`${from} → ${to}｜${route.back ? '依原條件可回訪' : '依原方向通行'}`, 32, y, 25, C.event);
    const children = route.images.map(id => flow.subscenes.find(s => s.id === id));
    children.forEach((s, j) => {
      const x = 32 + j * 386;
      g += box(x, y + 25, 364, 130, `${s.floor.label} · ${s.building.label}`, `${s.id}\n${s.name}`, j === 2 ? C.item : C.line);
      if (j < 2) g += line(`${x + 364},${y + 87} ${x + 382},${y + 87}`, C.line, true);
    });
    const dest = flow.nodes.find(n => n.id === to);
    g += text(`${from} 在 A 棟 23F 出發；26F 同層過橋後，沿 B 棟短梯到 ${to}（${dest.floor.label}）。`, 32, y + 192, 21);
  });
  return diagram('REF-BRIDGES', '四條 24–26F 分岔跨棟路', '各列是不同路線，平台不互接；真正通行條件依出發房、目的房與原路線。', 1200, g,
    ['跨棟發生在 26F；房內門端與樓梯各自操作，不由本圖提供越級通行。', 'R12→R14 探路含旁通／關漏水；其他支路沿原後勤、診所與回程條件。']);
}

function pipe() {
  let g = box(32, 140, 1136, 108, 'U1 · 移架讀覆核籤，再旋三片管圖', '架腳墊磚與上格擋片保留；依籤核對實際接頭形刻與去向。');
  [0, 1, 2].forEach(i => {
    const x = 70 + i * 210;
    g += rect(x, 310, 150, 150, C.item) + line(`${x},385 ${x + 150},385`, C.line);
    g += text(`第 ${i + 1} 片`, x + 32, 502, 24, C.item);
    if (i < 2) g += line(`${x + 150},385 ${x + 209},385`, C.line);
  });
  g += text('各片可旋轉；接頭須相續', 85, 558, 24);
  g += line('700,385 800,385 800,290 910,290', C.line) + line('800,385 910,385', C.line) + line('800,385 800,500 910,500', C.line, true);
  g += box(925, 252, 230, 80, '上支管', '焊封／不通', C.item);
  g += box(925, 347, 230, 80, '橫支／單橫刻', '回住戶水槽', C.item);
  g += box(925, 462, 230, 80, '下彎／雙凹口', '續向內井', C.event);
  g += box(32, 625, 530, 155, '接頭不合／點錯端點', '保留目前位置，回圖片重查\n錯門可見封帽或水槽');
  g += box(638, 625, 530, 155, '籤文、管圖與現物核妥後', '手動退普通插栓 → 推門進 U2\n拼圖成功不代替開門', C.event);
  return diagram('REF-U1', '三片管圖與實體端點', '操作摘要；分租改管覆核籤全文依 U1 規格，旋圖初態與管線形仍按 U1-C02／C03 製作。', 960, g,
    ['先實讀覆核籤，再旋圖核對封止、單橫刻與雙凹口現物去向，最後手動退栓。', '向下維修道是既有去路；送件門另開內閂，三片旋圖、核現物與開門分開回饋。']);
}

function laundry() {
  let g = rect(32, 140, 1136, 665) + text('U2 · 46F 上層內井', 62, 180, 26, C.event);
  g += line('65,310 340,310 340,340 785,340 785,310 1140,310', '#87999d');
  g += text('來路門', 70, 275, 22) + text('受阻原橋面 → 清出後通 U3', 810, 275, 22);
  g += rect(425, 245, 315, 65, C.item) + text('同一組懸空晾架', 475, 285, 22, C.item);
  g += line('485,310 485,550 625,550', C.item) + text('承重牽引鏈', 290, 420, 22, C.item);
  g += line('770,180 770,450 940,450', C.line, false, '8 6') + text('空轉鏈 → 空曬衣桿', 827, 405, 21);
  g += box(60, 515, 270, 118, '固定短階', 'U2 → U2b\n不是跨橋捷徑');
  g += line('200,640 200,700 405,700', C.line, true);
  g += box(425, 500, 330, 220, 'U2b · 橋下操作台', '手輪／兩止點／離合柄\n首次正式轉輪才啟動\n每次安全窗轉 1.5 秒\n共兩段，已完成段數保存');
  g += box(820, 520, 315, 135, '乾燥凹位', '先收手退入，再等掃擊\n受擊後安全復位離合柄', C.event);
  g += line('755,600 815,600', C.line, true) + line('755,690 1035,690 1035,322', C.line, true);
  g += text('完成兩段後走側階上原橋', 815, 760, 21, C.event);
  g += box(32, 850, 1136, 150, '操作順序', 'U2 辨鏈 → 安全試動 → 解煞扣 → 確認凹位 → 下短階\nU2b 兩段收架 → 原橋清出 → 側階上橋 → 自行進 U3');
  return diagram('REF-LAUNDRY', '雙鏈與上下層連動剖面', 'B 棟 46F／橋下夾層；上層試動不算收架完成，下層凹位不是出口。', 1180, g,
    ['只有兩條鏈；實線承重、虛線空轉，並用文字區分，不只靠顏色。', '失敗保留已完成段；晾架清通後不搬運玩家、不自動切房。']);
}

function glass() {
  let g = box(32, 140, 1136, 115, 'R19 保存定位觀察 → R20 讀同型維護表', '兩面都從同一不對稱缺口起算；收容側刻痕沒有移到觀察側。');
  for (const [row, y] of [['R19 收容側', 320], ['R20 觀察側', 505]]) {
    g += text(row, 32, y + 45, 25, C.event);
    g += line(`255,${y + 10} 275,${y + 35} 255,${y + 60}`, C.item);
    for (let i = 0; i < 6; i++) {
      const x = 295 + i * 142;
      g += rect(x, y, 125, 90, '#87999d') + text(String(i + 1), x + 48, y + 125, 23);
      if (i === 1) g += line(`${x + 62},${y + 8} ${x + 62},${y + 80}`, C.item);
      if (i === 3) g += line(`${x + 62},${y + 52} ${x + 62},${y + 80}`, C.item);
    }
  }
  g += text('缺口基準', 232, 698, 20, C.item);
  g += text('格位', 100, 770, 24) + text('操作序位', 100, 830, 24);
  [4, 8, 3, 1, 6, 2].forEach((v, i) => {
    const x = 295 + i * 142;
    g += rect(x, 733, 125, 118, C.line) + text(String(i + 1), x + 48, 770, 23) + text(String(v), x + 48, 830, 26, C.item);
  });
  g += box(32, 902, 1136, 112, '製作端解答對照', '第二格長痕 → 8；第四格短痕 → 1；依長、短順序得 F3「81」。', C.event);
  return diagram('REF-GLASS', '玻璃定位片與六格維護表', '格位按缺口計算，不按螢幕左右；玩家先見痕跡，R20 才能讀序位表。', 1200, g,
    ['本圖同向展平基準供校核；正式兩側鏡位須保留缺口可辨與相同格號。', '先顯答案不作教學；F3 與 F2、三軌、本地驗證各自取得。']);
}

function paper() {
  let g = box(32, 140, 1136, 105, 'R21 · 同案三張處置單的時間順序', '同一個案識別、原日期及連續筆勢均須核對；不是只有按標題排序。');
  const states = ['退回', '減輕但核准', '完整核可'];
  states.forEach((s, i) => {
    const x = 32 + i * 386;
    g += box(x, 290, 364, 212, s, '個案識別：原欄\n日期：原件完整日期\n簽勢：原件連續筆勢', C.item);
    if (i < 2) g += line(`${x + 364},396 ${x + 383},396`, C.line, true);
  });
  g += box(32, 555, 530, 224, '三單確認後', '比對併入 E3-02\n再親自提交第三層三格\n折頁 F4 仍在原抽屜排程單', C.event);
  g += rect(638, 555, 530, 224, C.item) + text('原排程單：沿紙角折痕展開', 658, 590, 24, C.item);
  g += line('1040,615 1040,690 1120,690', C.item, false, '8 6');
  for (let i = 0; i < 5; i++) g += rect(660 + i * 95, 666, 82, 65, '#87999d');
  g += text('35', 964, 709, 26, C.item) + text('F4：第四格 35', 658, 762, 22);
  return diagram('REF-PAPER', '三單對照與折頁 F4', '紙面欄名可讀；日期與筆跡依既有原件，不另造一組時間或簽名。', 970, g,
    ['三單是同案先後處置，不是三份未簽草稿；受困來歷與後來核可同時保留。', '第三層與 F4 都完成才往 R22；本圖不增加另一個折紙解鎖題。']);
}

function versions() {
  let g = '';
  [['A 紙本底稿', '原工作／誘入承諾／到場分配\n完整入境日期'], ['B 後補電子檔', '建檔晚於入境\n面試倒填至入境前三個曆月'], ['C 二次列印', 'B 的印章邊＋灰塵點\n紙面偏移／非新原始簽署']].forEach(([h, b], i) => {
    const x = 32 + i * 386;
    g += box(x, 140, 364, 180, h, b, C.item);
    g += circle(x + 80, 361, 18) + circle(x + 134, 351, 4) + line(`${x + 175},340 ${x + 175},380`, C.item);
    g += text(i ? '印章／塵點位置可比對' : '日期欄與原職稱須展開', x + 12, 420, 20);
  });
  g += line('605,362 800,362', C.line, true) + text('B → C 複製特徵', 600, 469, 22);
  g += box(32, 505, 1136, 105, '三版本核對 → 一份碎片 E4-01', '文件版本 A／B／C ≠ 調查板碎片 A／B／C；此桌整組確認一次。', C.event);
  g += text('R24 · 四人逐列查證', 32, 664, 27, C.event);
  ['本人（R23 已核）', '其他管理者一', '其他管理者二', '其他管理者三'].forEach((h, i) => {
    const y = 700 + i * 92;
    g += box(32, y, 290, 72, h, '', C.item);
    g += box(350, y, 818, 72, '原職缺／面試 → 入境／建檔／倒填 → 轉任／撤號', '');
  });
  g += box(32, 1110, 1136, 110, '共同特徵只作佐證', '共同錯字「記綠」／VF-0818 批次；仍須各人的日期與轉移矛盾 → E4-02');
  return diagram('REF-VERSIONS', '三版原件與四人差異', '框線、印章與塵點只示核對部位；正式頁面、簽名和完整日期依既有來源。', 1400, g,
    ['E4-01／E4-02 與 E3-02 再由玩家提交第四層三格，核對文件不代完成因果板。', '同格式不能單獨證明偽造；不把「被騙入園」改成「沒有後來的責任」。']);
}

function time() {
  let g = box(32, 140, 1136, 355, '歷史七分鐘：02:15 → 02:22', '02:13 只有準備；02:15 旁路才生效，非現時倒數。');
  g += line('100,300 1100,300', C.line, true);
  [['02:15', 100], ['02:20', 790], ['02:21', 935], ['02:22', 1080]].forEach(([s, x]) => { g += line(`${x},284 ${x},315`, C.item) + text(s, x - 30, 350, 21); });
  g += rect(650, 379, 475, 70, C.item) + text('放大：02:20:11 → 02:20:22＝11 秒', 670, 423, 22, C.item);
  g += box(32, 540, 530, 185, '獨立日期頁：48 小時', '康備忘／快取失聯對帳／L-48 啟動\n以完整日期、日差核對\n不塞進七分鐘尺', C.event);
  g += box(638, 540, 530, 185, '原門端回傳：F5「09」', '2025-11-04 02:15 · C-12\nVERIFY_ONLY／未開啟\n保留前導零；不是小花手寫', C.item);
  [['A · 02:20', '內門重新驗證'], ['B · 02:21', '敏感索引仍在線'], ['C · 02:22', '下行門禁恢復']].forEach(([h, b], i) => {
    const x = 32 + i * 386;
    g += box(x, 790, 364, 140, h, b + '\n靜音窗移動、手動關本地開關');
    if (i < 2) g += line(`${x + 364},860 ${x + 383},860`, C.line, true);
  });
  g += box(32, 974, 1136, 110, '對時／E4-05／F5 已成，再做 A → B → C', '每輪播放 5 秒／安靜 3.8 秒；三處切斷後，親自進 R26。', C.event);
  return diagram('REF-TIME', '七分鐘、十一秒與獨立日期頁', '歷史聲軌時間與現在廣播操作分開；完整覆寫碼不單獨打開 C-07。', 1280, g,
    ['五段沿原 F1–F5：47／26／81／35／09；未取得的段保持空白。', '錯序不重置已核對時間線與 F5；阿彪處置後仍須回 R25 再接 M1。']);
}

function upperEnd() {
  let g = box(32, 140, 530, 350, '快速釋放：四次正確輸入', '1 指節敲門框\n2 指節再敲門框\n3 左掌向下\n4 左掌再向下\n門控用既有憑據驗證後退栓', C.item);
  g += box(638, 140, 530, 350, '手動釋放：兩個安全窗', '第一窗到 A：長按 3 秒解防火扣\n退回完整掩體\n第二窗到 B：拉下釋放桿\nA 完成仍未開通，成果保留\n兩道機構到位才接上踏面');
  g += line('300,490 300,535 600,535 600,580', C.line, true) + line('900,490 900,535 600,535', C.line);
  g += box(240, 590, 720, 140, '同一扇門／同一段可走踏面', '兩路沿同一鏡位：退栓、完整踏面、連續扶手\n門維持開啟，玩家自行走到安全踏台', C.event);
  g += line('600,730 600,770', C.line, true);
  g += box(240, 785, 720, 135, '跨門提交 → 保存上部進度 → 片尾', '布結與空掌懸念沿原門檻演出\n下部匯入／獨立開局不虛構未做的選擇', C.event);
  return diagram('REF-UPPER-END', '上部兩種解法與同一出口', 'B 棟 R22 · 42F；不新增第二扇出口，不用關門字幕代替突破成果。', 1120, g,
    ['手勢路原噤聲者低頭 6 秒；手動路仍直立，都是機構讓路，沒有抹除任何人。', '手動路移動與操作窗分開計時；完成不自動跨門或直接進下部。']);
}

function mirror() {
  const beats = [['P0 · 積水', '晚 0.4 秒；主動查看恢復同步'], ['R1 · 熄滅電視', '轉身晚 0.3 秒；近看已同步'], ['R8 · 拔電螢幕', '真手扶椅背；影手已在桌邊'], ['R16 · 機櫃玻璃', '完全同步；不加時間差'], ['R17 · 玻璃辦公室', '倒影在玻璃內桌前；臉不清'], ['R22 · 金屬門框', '敲擊早 0.3 秒；不代做手勢'], ['R25 · 門端金屬邊', '接觸早 0.5 秒；不代輸入'], ['R30 · 粉塵', '無反射面；制動穩定後才顯'], ['R31 · 十二秒解凍', '第九次即同一歷史片段轉身']];
  let g = '';
  beats.forEach(([h, b], i) => {
    const x = 32 + i % 3 * 386, y = 140 + Math.floor(i / 3) * 220;
    g += box(x, y, 364, 180, `${i + 1}｜${h}`, b, i < 3 ? C.item : C.horror);
    g += line(`${x + 35},${y + 127} ${x + 327},${y + 127}`, '#87999d');
    g += circle(x + 125, y + 127, 8, C.event) + circle(x + (i < 2 ? 95 : i === 3 ? 125 : 155), y + 127, 8, C.horror);
    g += text('實際動作／反射或主觀差分', x + 30, y + 162, 18, C.dim);
  });
  return diagram('REF-MIRROR', '九次鏡像的物件與時間差', '點位只示相對動作；R8 不另設秒數，R17 不改成主動分身，R30 不早於制動。', 1000, g,
    ['同一主角的當前衣著、背包與疲態；九次都不加 OS、專用音效或追逐。', '點陣圖的旁觀對照僅供手勢研究；正式第一人稱鏡位依正文與圖像表。']);
}

function thaw() {
  const beats = [['0.0–1.0', '管理者持平板，小花停門側；絕對靜默'], ['1.0–2.2', '只有右拇指先動：核可移交'], ['2.2–3.6', '工作人員帶小花離框，臉與傷勢不呈現'], ['3.6–5.0', '管理者仍在，只轉平板角度繼續看'], ['5.0–8.4', '側臉留在螢幕光裡 3.4 秒，內容不可見'], ['8.4–10.4', '往下滑、關閉可見畫面，不證明刪原件'], ['10.4–11.2', '看空位，未按撤回；原建築低頻進入'], ['11.2–12.0', '轉向鏡頭，臉與黑平板自我反射重合']];
  let g = '';
  beats.forEach(([time, action], i) => {
    const y = 140 + i * 104;
    g += box(32, y, 250, 80, time + ' 秒', '', C.item);
    g += box(315, y, 853, 80, action, '', C.event);
    if (i < 7) g += line(`155,${y + 80} 155,${y + 100}`, C.line, true);
  });
  return diagram('REF-THAW', 'R31 唯一十二秒歷史解凍', '同一歷史鏡位接續八拍；必要核驗、第五層鎖定完成後才呈現。', 1160, g,
    ['動畫或八拍等價摘要擇一完成取得 E5-05；可暫停與保存續接。', '點陣分鏡只定光影與姿態；右拇指、固定鏡位及揭臉時機以本圖驗收。']);
}

function brake() {
  let g = box(32, 140, 1136, 120, '五組來源比對 → 玩家提交「繼續」', '取得 E5-06 並鎖定後續路線；此時只是提交，後方階梯尚未因制動封住。');
  g += box(32, 310, 530, 310, '空推車導軌', '三輛空車依次滑向焊死核心門\n末車翻底：腕帶／水瓶／空白標籤\n核心門一直焊封，不是玩家去路', C.item);
  g += box(638, 310, 530, 310, '單人維修籠通道', '玩家仍在制動桿旁\n手動拉桿 → 棘爪扣入\n籠固定於 49F，不升降、不載人', C.event);
  for (let i = 0; i < 3; i++) g += rect(95 + i * 130, 510, 94, 64, C.item);
  g += line('900,620 900,663', C.line, true);
  g += box(638, 680, 530, 140, '制動扣妥之後', '後方梯段隨機構封閉\n前方踏點可走，穿固定籠上短梯');
  g += box(32, 680, 530, 140, '鏡像第八次另開安全鏡位', '制動已穩才在粉塵顯同衣站姿\n不遮制動桿，不與點桿判定重疊', C.horror);
  return diagram('REF-BRAKE', 'R30 雙路、沉降與手動制動', 'B 棟 49F → 50F R31；樓面約三度沉降與可點桿保持可辨。', 1010, g,
    ['零凝神／零光能仍能完成；不是限時自動失敗或自動拉桿過場。', '制動與歷史 H-07 播放分開；維修籠不等於電梯，推車不是玩家載具。']);
}

function defenses() {
  let g = box(32, 140, 530, 170, '阿尋 · 同一雙手的節指', '肩 → 原手臂 → 原手掌 → 多折指節\n沿單側桌沿，對側凹位仍空\n三層笑膜不是三個人頭', C.horror);
  g += box(638, 140, 530, 170, '阿彪 · 同一臂的兩段反肘', '肩 → 上臂 → 反肘一 → 反肘二\n→ 同一手掌／鉤腕 → 拉柄\n硬殼沿雙層制服，不另長背部手臂', C.boss);
  g += line('80,385 210,385 265,445 325,385 380,445 510,445', C.horror);
  g += text('原臂', 100, 430, 21) + text('同一手掌', 380, 492, 21);
  g += line('690,385 805,385 745,455 880,455 830,525 1040,525', C.boss);
  [['AX-01', '眼形對準終端 → 關本地介面、停操作'], ['AX-02', '單側三抓痕 → 收手退來向對側凹位'], ['AB-01', '受力框壓單側 → 收手退另一側椅邊'], ['AB-02', '鉤臂牽拉柄 → 主動鬆柄、停止操作']].forEach(([h, b], i) => {
    g += box(32, 590 + i * 100, 1136, 80, `${h}｜${b}`, '', i < 2 ? C.horror : C.boss);
  });
  return diagram('REF-DEFENSES', '兩位角色的結構與不同防禦', '折線是拆件連接關係，不是新增骨架尺寸；完整形體仍依原角色比例。', 1180, g,
    ['R11 有效校驗優先停攻；R26 四來源齊全永久停攻，再做三卡與處置。', '避開鉤臂不等於最終拒絕；所有防禦不代替必要查證或門端操作。']);
}

export function buildSupplementLayouts(flow) {
  return new Map([
    ...Object.entries(ASCENT_GROUPS).map(([id, group]) => [id, ascent(id, group, flow)]),
    ['REF-CALIBRATION', calibration()], ['REF-BRIDGES', bridges(flow)], ['REF-U1', pipe()],
    ['REF-LAUNDRY', laundry()], ['REF-GLASS', glass()], ['REF-PAPER', paper()],
    ['REF-VERSIONS', versions()], ['REF-TIME', time()], ['REF-UPPER-END', upperEnd()],
    ['REF-MIRROR', mirror()], ['REF-THAW', thaw()], ['REF-BRAKE', brake()], ['REF-DEFENSES', defenses()],
  ]);
}
