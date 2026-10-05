import assert from 'node:assert/strict';
import { readChildFloors } from './scene-floors.mjs';

// Only exceptions need an authored placement. Other images follow their cited story paragraph.
export const IMAGE_PLACEMENTS = {
  'P0-V01': ['s-0903-4', '前景：淺水'],
  'P1-C07': ['s-0903-18', '鐵網**多了一個濕手印'],
  'P1-C02': ['s-0903-14', '翻開筆記'],
  'P1-C08': ['s-0903-17', '再查看左岔路'],
  'P2-C02': ['s-0903-22', '查看地面的'], 'P2-D01': ['s-0903-22', '在紙本筆記中關聯'],
  'P2-C03': ['s-0903-23', '| 物件 | 回饋 |'], 'P2-C04': ['s-0903-23', '| 物件 | 回饋 |'],
  'P2-C06': ['s-0903-23', '| 物件 | 回饋 |'],
  'R2-D03': ['s-0904-13', '在現場有電的接待電腦'],
  'R3-C02': ['s-0904-19', '近看藏著的全家福'], 'R3-F01': ['s-0904-19', '同一鏡位冷青滲入'],
  'R3-C05': ['s-0904-22', '選填翻看同編號床邊補過的拖鞋'],
  'R4-C02': ['s-0904-26', '近看兩段普通刻字'],
  'R5-C03': ['s-0904-39', '〔生活近看〕'], 'R5-C02': ['s-0904-40', '自行近看繡布'],
  'R6-C01': ['s-0905-4', '第二次查看櫃檯告示'], 'R6-C04': ['s-0905-3', '也可低頭近看空椅'],
  'R8-C04': ['s-0905-22', '近看燈背'], 'R8-D02': ['s-0905-59', '紙墊移妥後'],
  'R8-F02': ['h-0905-300', '同鏡位凝固'],
  'R9-C03': ['s-0905-32', '可翻房卡'], 'R9-C04': ['s-0905-32', '可翻房卡'],
  'R9-C05': ['s-0905-32', '可翻房卡'], 'R9-C06': ['s-0905-32', '桌板翻面'],
  'R9-F01': ['s-0905-32', '沿原關聯看兩個時態'],
  'R9-C01': ['s-0905-32', '可翻房卡'], 'R9-D02': ['s-0905-34', '可再查看原空白處置表'],
  'R10-C01': ['s-0905-37', '杯底有一圈圈水痕'],
  'R10-C04': ['s-0905-40', '原三拍排程在第三拍'], 'R10-F01': ['s-0905-40', '原凝固近景是一隻'],
  'R11-C05': ['s-0905-44', '玩家先翻家庭照片'], 'R11-C06': ['s-0905-44', '玩家先翻家庭照片'],
  'R11-V02': ['s-0905-45', '玩家切到**來向對側的隔板凹位**'],
  'R12-C03': ['s-0906-3', '工具櫃旁緊貼藥櫃'], 'R12-C04': ['s-0906-43', '親手接通辦公區線路'],
  'R12-C05': ['s-0906-5', '查看工具櫃與藥品櫃'],
  'R12-F01': ['s-0906-8', '依原局部關聯進入燒焦開關'],
  'R13-C01': ['s-0906-11', '玩家查看候診椅'], 'R13-F01': ['s-0906-11', '原感知呈現連續候診'],
  'R13-D02': ['s-0906-13', '玩家在照護註記旁讀完回執'], 'R13-D03': ['s-0906-13', '在本地健康終端選'],
  'R14-D02': ['s-0906-20', '可再翻同一終端'], 'R14-C03': ['s-0906-21', '退出凝固，查看現時貨梯控制器'],
  'R15-C06': ['s-0906-33', '先在筆記對齊'],
  'R16-D02': ['s-0906-37', '再讀分流輸出'], 'R16-D07': ['s-0906-41', '玩家查看原舊操作索引'],
  'R16-C02': ['s-0906-43', '32F 中繼顯示未通電'],
  'R18-C03': ['s-0907-7', '玩家手動打開隔音室門'],
  'R19-C04': ['s-0907-11', '視線移到單向玻璃下緣壓條'],
  'R19-C06': ['s-0907-10', '| 原物件 | 鏡位呈現 |'], 'R19-C07': ['s-0907-9', '若用原控制器抹除'],
  'R20-V03': ['s-0907-19', '必要時收手、躲到桌下'],
  'R21-D04': ['s-0907-34', '現場門控的授權欄與走廊同框'],
  'R22-C03': ['s-0907-41', '手停在扣件上'],
  'R23-C03': ['s-0908-7', '核對櫃端'], 'R23-D02': ['s-0908-8', '同一查證桌保留'],
  'R23-D08': ['s-0908-8', '人物板的內控主管卡'],
  'R24-D02': ['s-0908-21', '玩家對齊框線'], 'R25-D02': ['s-0908-32', '把三帶對到同一時間尺'],
  'R26-C04': ['s-0908-45', '保存破例完成及 B01'], 'R26-D03': ['s-0908-49', '耳機緩衝的待回放來源'],
  'R26-D01': ['s-0908-46', '| 區塊 | 無聲正文 |'],
  'R26-C03': ['s-0908-53', '原終端提供'],
  'R27-C01': ['s-0909-9', '廉價展板'],
  'U1-C01': ['s-0909-15', '〔生活近看〕'], 'U1-C02': ['s-0909-15', '旋轉三片管圖對接'],
  'U1-C03': ['s-0909-15', '旋轉三片管圖對接'], 'U1-C04': ['s-0909-15', '親手退開普通插栓'],
  'U1-C05': ['s-0909-15', '核心柱另一側留著'],
  'U2-C01': ['s-0909-16', '沿可見鏈路區分'], 'U2-C02': ['s-0909-16', '沿可見鏈路區分'],
  'U2-C03': ['s-0909-16', '在安全處準備好'],
  'U2b-C02': ['s-0909-18', '兩段完成'],
  'U3-C01': ['s-0909-19', '先斷局部燈電'], 'U3-C02': ['s-0909-19', '裝妥窄罩，轉遮光葉'],
  'U3-C03': ['s-0909-19', '一道刻線先出現'], 'U3-C04': ['s-0909-19', '按本地刻度對齊橋栓'],
  'U3-C06': ['shortcut-u3-u1-script', '門內橫閂與外側護板'],
  'R28-C02': ['s-0909-22', '舊玻璃字樣與覆貼邊緣可近看'],
  'R28-C03': ['s-0909-22', '舊玻璃字樣與覆貼邊緣可近看'],
  'R28-C01': ['s-0909-24', '玩家主動開遠端索引'], 'R28-D03': ['s-0909-24', '最後 1.5 秒'],
  'R29-D01': ['s-0909-26', '把 R21 小花排程上的簽名'],
  'R29-C01': ['s-0909-26', '再親自展開最後一份的備註'],
  'R29-D02': ['s-0909-26', '讀完三個月份與提價備註'],
  'U4-C01': ['s-0909-35', '比對缺角、焊疤'], 'U4-C02': ['s-0909-35', '先看兩個固定地標'],
  'U4-D01': ['s-0909-36', 'MR-01'],
  'U4b-C02': ['s-0909-37', '沿受力方向抽出內銷'],
  'U5-C02': ['s-0909-39', '轉向隔板擋來向'],
  'U6-C01': ['s-0909-40', '把左一格導中'], 'U6-C02': ['s-0909-40', '三槽平衡後'],
  'U6-F01': ['s-0909-41', '一張工場工具桌靜格'],
  'U6b-C02': ['s-0909-42', '親手扣上止回栓'],
  'R30-C01': ['s-0909-46', '停步'], 'R30-C02': ['s-0909-48', '玩家親手拉制動桿'],
  'R30-V03': ['s-0909-48', '末車底板翻開'], 'R30-C04': ['s-0909-45', '| 來源 | 放置／核對 | 可以成立 |'],
  'R30-C05': ['s-0909-45', '還可查看貨梯拖板'], 'R30-D04': ['s-0909-45', '還可查看貨梯拖板'],
  'R30-D05': ['s-0909-45', '還可查看貨梯拖板'],
  'R31-C02': ['s-0909-52', '先看備份內門外側'], 'R32-F01': ['s-0910-6', '再查看 M6-01'],
  'R31-F01': ['s-0909-59', '十二秒解凍依下表接續'],
  'POST-V01': ['s-0910-40', '共用片尾餘波完成'],
  'POST-V02': ['s-0910-42', '康刷白色管理卡'],
};

const ENTRY = {
  P0: '沿踏台同層的管線可辨出維修柵門，與斷梯上方的豎井分開。',
  P1: '來時的柵門框與低管留在畫面側緣。左側低管後掛著「地基處理室」門牌，右側梯間隔著封死的鐵網。',
  P2: '來路門框接回管線岔口；另一端的實體維修標牌下，是向上的梯口。兩處與地面拖痕同時可辨。',
  R1: '進場的地下梯段門留在身側，櫃檯後是接待後室內門。通往樓外的舊出口在另一側，不能與後室門混為一處。',
  R2: '來路接回大廳。櫃側通道通往卡著餐車的梯口；原交貨窗與出餐小窗都不是可穿越的門。',
  R3: '來路門框外仍可辨紅扶手。左近綠磁磚折角接著排水槽；另一側舊門框旁是粗管、厚柱與加鋼板的門檻。',
  R4: '來路通向洗衣窄巷，走道另一端繞向樓梯轉角；地上的排水槽和綠磁磚能讓玩家辨認回程。',
  R4b: '供桌旁仍看得見原走道轉角。這是走近神壇的鏡位，返回時沿原轉角退回 R4，不另走一間新房。',
  R5: '來路仍在厚柱與粗管旁，改衣桌另一側可見上行低壓門；衣架和止擋是房內阻物，不是另一條出口。',
  R6: '11F 的厚柱旁留著吊籃後道來路；玻璃門接往 12F 的短梯，循住戶夾道才能到 15F 隊尾。旁邊另一家公司的獨立門鎖仍關著。',
  R7: '桌列來向的短梯下接 14F 候工道，沿已開側路可回 11F 網咖；桌列另一端是跨棟窄橋的舊鋁門，封閉窗洞不能穿越。',
  R8: '來時的窄橋門在隔音布旁，另兩條路分別位於舊住宅門及窗邊地面側道。內井封窗不是第三個可翻越的出口。',
  R9: '門框外的兩級台階接回視訊隔間；隔板後另有接往工位長巷的通道。布景上的門窗只有圖像，沒有移動熱區。',
  R10: '來路接回內井平台，柱角另一側的側門通向工位。供桌讓出交通線，祭台側縫只能查看，不能鑽入。',
  R11: '隔板後長巷與平台側門從工位兩側接入，都在遭遇安全邊界外。靠牆的 S-03 門框接著上行扶手。',
  R12: '來路門框外仍是同一立管與後勤平台。診所舊門、朝貨梯的鋼平台門，以及低矮服務道的門扣各在不同位置。',
  R13: '候診椅外側的門接回修理舖；病床後簾通向有輪痕的送物廊，設備通道口另在後勤側，兩條後路沒有合成一扇門。',
  R14: '接縫鋼平台與診所輪痕分別接到平台兩側。井道內側有固定短梯，物流標籤旁另留維修口；貨梯井門本身不是乘梯出口。',
  R15: '診所設備道和貨梯短梯從兩側接入。維修箱旁是低矮服務門扣，發電機外側則是通往機櫃通道的防火門。',
  R16: '31F 來路接回 30F 門下平台；沿已開的後勤側路才能下返 27F 機房。辦公區門端在冷卻管下，接向 32F。機櫃間隙只供查看。',
  R17: '進場門口位於飾板與機房裸牆交界。受損公開出口和 32-S 服務門各自可辨；服務門後的去向尚待資料核對。',
  R18: '來路門框與扶手保留在近處；向前沿原走道可辨隔音室門。吸音板縫與被封舊門洞不作出口。',
  R19: '進場的隔音門和椅外側側門分開可辨；後者繞向玻璃後方，不是穿過單向玻璃。',
  R20: '37F 來路短折角仍貼著同一玻璃壓條；前方工作梯上接 38F，辦公室在 40F。控制桌下是房內掩體，不是跨房密道。',
  R21: '40F 來路接回 39F 工作梯；另一端釋放口的鋼梯上接 41F 候放平台。被櫃子擋住的窗不是逃生出口。',
  R22: '42F 身後門端接回 41F 候放平台，前方踏面受釋放機構牽住。A 扣與 B 桿控制同一條路，並非兩個不同出口。',
  R23: '來時低門楣和扶手保持原位；往檔案架外側的窄路與封閉的樓層門分開辨認。',
  R24: '來路在比對桌外側，飯廳服務口接著收碗槽與磁磚腰線；封死的傳菜窗不能穿越。',
  R25: '來時服務門接回飯廳轉角。C-07 厚門嵌在舊柱跨內，管理維修門則位於另一側，不能從校正室直接上行。',
  R26: '身後仍是進場的 C-07 厚門；門側安全角與椅邊凹位都在同房，沒有另一個離場通道。',
  M1: '來路接管理維修門，七窗旁的連續扶手一路指向上端出口。觀察窗只能遠看，沒有通往封閉樓層的門。',
  R27: '窄脊柱的門框留在來向，展示牆另一側的服務口接向分租廊；展示窗與維修座不作出口。',
  U1: '核心柱旁的來路接回展示廊；收件架後的服務口和柱另一側的送件窄門分開可辨。重複住宅門號本身不代表有新路。',
  U2: '來路門旁仍是下彎接頭，往橋底側台的固定短階貼著扶手下降；不能從入口直接跨過受阻的橋面。',
  U2b: '身後固定短階接回內井，通往原橋面的側階在另一側；手輪作業位與乾燥凹位沒有變成出口。',
  U3: '來路門檻接著已清通的晾架橋。維修支架旁是尚未落位的服務橋，核心柱另一側可見窄送件門，內閂被支架擋住。',
  R28: '',
  R29: '來路接內部運送道；簽核架背面的服務口通向門牌走廊。核可佇列是桌上的選填操作，不是門端機關。',
  U4: '來路仍接簽核室。重複門牌的內門與冷凝管旁檢修蓋各在原位；此時還不能從外觀斷定哪一道能離開走廊。',
  U4b: '上方檢修蓋接回布標處，服務閘在夾道另一端；低位鏡頭仍保留同組管線，不讓切鏡看起來像跨進別層。',
  U5: '來路服務閘與後方維修口分開可辨；左右投送孔是封板與辨向的位置，不能讓玩家鑽出。',
  U6: '冷藏維修口在來向，三水槽旁是固定保養梯；配重管沿梯向下，活動踏板不在此充當下行路。',
  U6b: '來路是同一固定梯的梯腳。另一端活動踏面通向運送通道，必須先確認水平並扣栓，才可踩上去。',
  R30: '來路接回已固定的配重踏面。焊死核心門與單人維修籠通道彼此分開；籠後可辨下一個踏點和階梯。',
  R31: '來路維修籠與後方階梯的封閉狀態保持不變，不能原路倒退；備份內室另一端留著通向同層核心的短廊。',
  R32: '', R33: '', POST: '',
};

// These are conditional departure passages, not a required visit order.
export const EXIT_PLACEMENTS = {
  'P2-V02': ['s-0903-26', '梯段與門框遮擋連續交代', '上行梯段', ''],
  'R8-V02': [null, null, '短租房門（前往 R9 的分岔）', '選擇舊住宅門，沿地磚拼縫下兩級台階進 R9。也可先走另一側道；兩路不要求讀卡、放蛾或讀完小帳才開放。'],
  'R8-V03': [null, null, '內井側道（前往 R10 的分岔）', '選擇窗邊地面側道，沿遮棚下共用平台走向祈禱角。這不是翻窗；也可先去 R9，不要求兩條路依序走完。'],
  'R9-V02': [null, null, '隔板後的長巷', '選擇往 R11 時，跨過半層門檻，從第三排工位隔板後側進入；兩端地標相接，不從遭遇對象背後進場。也可沿兩級台階返回 R8。'],
  'R10-V02': [null, null, '平台側門', '選擇前往 R11，沿原柱角與平台側門接近第三排工位；不經 R9。也可沿來路回 R8，不必收完選填草稿。'],
  'R14-V02': [null, null, '井道內側短梯', '物流繼電器接回、病患安息後，選擇沿固定短梯進 R15。欄杆與地坪接縫交代局部高差；不搭貨梯，也不要求完成搬運工支線。'],
  'R16-V02': ['s-0906-43', null, '冷卻管下接駁', '本房推理、憑證及辦公區供電均完成後，沿冷卻管下的夾層上行。全面、定向供電直接使用已開門端；部分供電先完成上段回接。機房裸牆逐步轉成管理辦公區飾板。'],
  'R19-V02': ['s-0907-16', '從椅外側側門繞到', '玻璃後方短折角', ''],
  'R22-V03': ['s-0907-48', '玩家自行跨門', '跨部銜接：深層門檻', ''],
  'R25-V03': ['s-0908-42', '玩家走到會議側廊', 'C-07 厚門', ''],
  'U3-V02': ['shortcut-u3-u1-script', '斜側接景同時保留兩端門框', '柱後送件廊（選填回程）', ''],
  'R28-V02': ['s-0909-24', null, '簽核室旁門', '未開遠端終端，或已結算快取後，可沿內部運送道旁門進 R29。厚牆轉角與封閉舊門洞維持方向；十五秒收束仍延續，不因跨門取消。'],
  'R30-V02': ['s-0909-50', null, '制動後的上行踏面', '〔操作／場景點擊〕完成制動且現場穩定後，穿過 49F 固定維修籠，循可見踏面及短梯上行 50F R31；籠不升降、不載人。已封的後方階梯不恢復；選填 H-07 未播放也能前進。這條路不可被拿去解釋終幕救援隊如何進 P1。'],
  'R31-V02': ['s-0909-62', '玩家沿她讓出的原短廊', '同層核心短廊', ''],
};

const tag = id => `<a id="${id}"></a>`;
const sourceAnchor = row => row.source.match(/#([^)]+)/)[1];
const marker = (key, body) => `<!-- reading-flow:${key}:begin -->\n${body}\n<!-- reading-flow:${key}:end -->`;

export function stripReadingInline(story) {
  return story.replace(/^<!-- reading-inline:([^:]+):(pad|tight) -->\n([^\n]+(?:\n[^\n]+)*)/gm, (_, key, spacing, body) => {
    const links = key.split('_').map(id => `\\[${id}\\]\\(\\.\\./10_製作規格/[^)\\n]+#node-[a-z0-9]+-images\\)`).join(' · ');
    const pattern = new RegExp(` ${links}${spacing === 'pad' ? ' ' : ''}`, 'g');
    assert.equal([...body.matchAll(pattern)].length, 1, `Missing inline image links: ${key}`);
    return body.replace(pattern, '');
  });
}

function inlineImages(point, items, link) {
  const prefix = point.text.match(/^(?:（[^）]+）|〔[^〕]+〕|\| [^|\n]*\S(?=\s*\|))/)?.[0];
  assert(prefix, `Missing inline image cue: ${items.map(i => i.row.id).join(', ')}`);
  const rest = point.text.slice(prefix.length);
  const pad = rest.length > 0 && !/^\s/.test(rest);
  const key = items.map(i => i.row.id).join('_');
  return `<!-- reading-inline:${key}:${pad ? 'pad' : 'tight'} -->\n` +
    prefix + ' ' + items.map(i => link(i.row)).join(' · ') + (pad ? ' ' : '') + rest;
}

export function stripReadingFlow(story, groups) {
  story = stripReadingInline(story);
  story = story.replace(/\n\n<!-- reading-flow:([^:]+):begin -->[\s\S]*?<!-- reading-flow:\1:end -->/g, '');
  for (const group of groups) {
    const name = group.node.toLowerCase();
    story = story.replace(new RegExp(`\\n*<!-- scene-image-${name}:begin -->[\\s\\S]*?<!-- scene-image-${name}:end -->\\n*`), '\n\n');
  }
  return story;
}

function extent(story, anchor) {
  const start = story.indexOf(tag(anchor));
  assert(start >= 0, `Missing reading source: ${anchor}`);
  const end = story.indexOf('<!-- import:', start + tag(anchor).length);
  // s-* anchors precede their begin marker; inner anchors are already inside the block.
  const begin = story.indexOf(`<!-- import:${anchor}:begin -->`, start);
  const stop = begin >= 0 && begin < start + 100
    ? story.indexOf(`<!-- import:${anchor}:end -->`, begin)
    : story.indexOf(':end -->', end) + ':end -->'.length;
  assert(stop > start, `Unbounded reading source: ${anchor}`);
  return { start, end: stop, text: story.slice(start, stop) };
}

function paragraph(story, anchor, needle, main = false) {
  const scope = extent(story, anchor);
  const paragraphs = [...scope.text.matchAll(/[^\n]+(?:\n[^\n]+)*/g)];
  let found;
  if (needle) {
    const matches = paragraphs.filter(p => p[0].includes(needle));
    assert.equal(matches.length, 1, `Ambiguous reading placement: ${anchor} / ${needle}`);
    found = matches[0];
  } else {
    found = main && paragraphs.find(p => /^（靜態畫面/.test(p[0]));
    if (!main) found ||= paragraphs.find(p => /^(?:〔操作|〔生活近看〕)/.test(p[0]));
    found ||= paragraphs.find(p => /^（/.test(p[0]));
    found ||= paragraphs.find(p => /^(?:（|〔操作|〔玩家〕|〔生活近看〕)/.test(p[0]));
    assert(found, `No presentation paragraph: ${anchor}`);
  }
  return { start: scope.start + found.index, end: scope.start + found.index + found[0].length, text: found[0] };
}

export function placeReadingImages(original, act, groups, subscenes, spec) {
  const story = stripReadingFlow(original, groups), points = new Map(), placements = [];
  const floors = new Map(groups.flatMap(group => [...readChildFloors(spec, group.node, subscenes.filter(s => s.node === group.node))]));
  const put = (position, item) => { const list = points.get(position) ?? []; list.push(item); points.set(position, list); };
  const mainPoints = new Map();
  const link = row => `[${row.id}](../${act.specPath}#node-${row.node.toLowerCase()}-images)`;
  for (const group of groups) {
    const start = story.indexOf(tag(`node-${group.node.toLowerCase()}-script`));
    const first = story.slice(start).match(/<!-- import:([^:]+):begin -->[\s\S]*?^#### (?:\[|POST)/m);
    assert(first, `Main presentation: ${group.node}`);
    const defaultAnchor = first[1];
    for (const row of group.rows.filter(r => !r.id.startsWith('T-') && r.kind !== '出口接景')) {
      const main = row.id === `${group.node}-V01`;
      const [anchor, needle] = IMAGE_PLACEMENTS[row.id] ?? [main ? defaultAnchor : sourceAnchor(row), null];
      const point = paragraph(story, anchor, needle, main);
      put(point.end, { row, main, anchor, point });
      if (main) mainPoints.set(group.node, point);
      placements.push({ id: row.id, anchor, paragraph: point.text, position: point.end });
    }
  }
  for (const child of subscenes.filter(s => s.kind === '出口接景')) {
    const config = EXIT_PLACEMENTS[child.id]; assert(config, `Missing exit placement: ${child.id}`);
    const [anchor, needle, title, prose] = config;
    let position;
    if (anchor) {
      if (needle) position = paragraph(story, anchor, needle).end;
      else position = extent(story, anchor).end + `<!-- import:${anchor}:end -->`.length;
    } else {
      const start = story.indexOf(tag(`node-${child.node.toLowerCase()}-script`));
      const next = story.indexOf('<a id="node-', start + 1);
      const body = story.slice(start, next < 0 ? story.length : next);
      const last = [...body.matchAll(/<!-- import:[^:]+:end -->/g)].at(-1);
      assert(last, `Exit after room: ${child.id}`);
      position = start + last.index + last[0].length;
    }
    assert(position > mainPoints.get(child.node).end, `Exit before entry: ${child.id}`);
    put(position, { child, title, prose });
    placements.push({ id: child.id, anchor: anchor ?? `node-${child.node.toLowerCase()}-script`, position, paragraph: prose || needle });
  }
  let result = story;
  for (const [position, items] of [...points].sort((a, b) => b[0] - a[0])) {
    const lines = [], main = items.find(i => i.main);
    if (main) {
      const node = main.row.node, slug = node.toLowerCase();
      lines.push(tag(`node-${slug}-access-script`));
      if (ENTRY[node]) lines.push('', ENTRY[node]);
    }
    const images = items.filter(i => i.row);
    if (main && spec.includes(tag(`node-${main.row.node.toLowerCase()}-access-layout`))) {
      lines.push('', `[出入口配置草圖](../${act.specPath}#node-${main.row.node.toLowerCase()}-access-layout)`);
    }
    for (const { child, title, prose } of items.filter(i => i.child)) {
      lines.push('', tag(`subscene-${child.id.toLowerCase()}-script`), `###### 次場景 ${child.id} · ${title}`);
      lines.push('', `**樓層：**${floors.get(child.id).label}`);
      if (prose) lines.push('', prose);
      lines.push('', `[次場景製作規格](../${act.specPath}#subscene-${child.id.toLowerCase()}-spec)`);
    }
    const key = items.map(i => i.row?.id ?? i.child.id).join('_');
    if (lines.length) result = result.slice(0, position) + '\n\n' + marker(key, lines.join('\n').trim()) + result.slice(position);
    if (images.length) {
      const point = images[0].point;
      result = result.slice(0, point.start) + inlineImages(point, images, link) + result.slice(point.end);
    }
  }
  return { story: result, placements };
}
