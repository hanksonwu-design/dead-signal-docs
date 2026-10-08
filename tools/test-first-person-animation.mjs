import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { ACTS, APPENDIX } from './screenplay-files.mjs';
import { parseMaster } from './sync-canonical.mjs';
import { READING_PLACEMENTS } from '../building/screenplay-marker-placement.js';

const master = parseMaster();
const story = act => master.documents.get(ACTS[act].path);
const spec = act => master.documents.get(ACTS[act].specPath);
const common = master.documents.get(APPENDIX);
const block = id => {
  assert(master.blocks.has(id), `Missing source block: ${id}`);
  return master.blocks.get(id);
};
const has = (text, ...phrases) => phrases.forEach(phrase => assert(text.includes(phrase), `Missing contract: ${phrase}`));
const ordered = (text, ...phrases) => {
  let cursor = -1;
  for (const phrase of phrases) {
    const next = text.indexOf(phrase, cursor + 1);
    assert(next > cursor, `Missing or out-of-order beat: ${phrase}`);
    cursor = next;
  }
};
const row = (act, image) => {
  const imageTables = [...spec(act).matchAll(/<!-- scene-images:([^:]+):begin -->([\s\S]*?)<!-- scene-images:\1:end -->/g)];
  const line = imageTables.flatMap(match => match[2].split('\n')).find(line => line.startsWith(`| ${image} |`));
  assert(line, `Missing image work order: ${image}`);
  return line;
};

test('first-person cues distinguish cutscenes, live interaction and input feedback', () => {
  const kinds = ['過場', '互動', '動作回饋'];
  for (const kind of kinds) has(common, `（動畫演出／第一人稱${kind}）`);
  for (const act of ACTS) {
    for (const [, kind] of story(act.act).matchAll(/（動畫演出／第一人稱([^）]+)）/g)) {
      assert(kinds.includes(kind), `${act.name}: ${kind}`);
    }
  }
  has(common, 'first-person-animation-contract', '現有 2D 主圖', '不新增場景、碎片或謎題',
    '略過僅在原本支援處啟用', '動畫完成只提交該原事件一次', '仍待引擎實作及真人試玩');
});

test('P0, R1, R8 and R12 feedback retains separate player actions and present-day perspective', () => {
  ordered(block('s-0903-4'), '玩家第一次點擊', '玩家第二次點擊', '第一人稱動作回饋');
  has(block('s-0903-9'), '0.4 秒', '主動查看時恢復同步');
  has(row(0, 'P0-V01'), '兩次點擊各自啟動', '不新增第三人稱肉身');
  has(block('s-0904-6'), '第一人稱動作回饋', '機台邊緣留在前景', '損壞的鎖舌仍在原處');
  ordered(block('s-0905-26'), '玩家扶起紙邊', '等待玩家下一個動作', '玩家移開擋路的手', '玩家放開紙緣', '蛾自己離開紙');
  has(row(2, 'R8-C02'), '不能播放一次就自動完成三步', '不與現時放蛾動畫混層');
  has(block('s-0906-5'), '第一人稱動作回饋', '不超過原 1.5 秒', '等待玩家接著核驗');
  has(row(3, 'R12-C05'), '不自動補後續欄位或提交');
});

test('L1 viewpoint switching and R18 threat windows cannot become noninteractive movies', () => {
  has(story(3), '第一人稱互動）車廂上行', '可移開視線看實體門扣', '仍停在經驗證的 30F 門內');
  has(row(3, 'T-R15-R16-03'), '略過只停 30F 門內', '不自動開閘、完成 30F 檢修或直達 31F');
  has(block('s-0907-5'), '第一人稱互動', '2.2 秒補救窗', '點回上一個掩體', '波形與方向字幕持續可讀');
  has(row(4, 'R18-V02'), '退回與屏息由玩家輸入', '低動態版保持原移動時間與警戒', 'N2 交部分遮蔽', 'N0／N1／N3');
  has(common, '不因省動畫跳到成功', '動畫不自動救人');
});

test('upper-ending and wing cutscenes keep their budgets and return before traversal or combat', () => {
  has(block('s-0907-46'), '第一人稱過場', '30–45 秒', '等待玩家自行跨門');
  has(block('s-0907-47'), '第一人稱過場', '看過 R8 才保留對照', '玩家字幕匿名');
  has(block('s-0907-48'), '玩家自行跨門，才儲存上部完成進度');
  has(row(4, 'R22-C06'), '不疊加第二段時長', '跨門保存由玩家另行觸發');
  has(block('s-0910-13'), '第一人稱過場', '二十至三十五秒', '顯形無攻擊判定');
  has(block('s-0910-14'), '安全觀察', '親自確認開始第一拍');
  has(row(9, 'R32-V01'), '不切外部大全景', '演出後先安全查看', '低動態版');
});

test('M1 and R29 preserve optional inspection and previously acquired evidence', () => {
  has(block('s-0909-4'), '第一人稱互動', '二分二十秒', '40 度', '各窗可自行選擇');
  has(block('s-0909-5'), '窗內的人與物保持不動', '主動查看或確認對應摘要才記該窗觀察');
  has(row(6, 'M1-V02'), '不自動記下未看的觀察');
  has(block('s-0909-27'), '文件已保存', '第一人稱互動', '至少二十秒', '可讀已保存原件', '暫停／失焦時停止計時');
  has(row(7, 'R29-V01'), '水痕不覆寫 R29-D01', '查閱入口可用');
});

test('U4 return and R30 brake animations do not solve their mechanisms or repeat completed events', () => {
  ordered(block('s-0909-35'), '先看兩個固定地標', '第一人稱互動', '視點停下', '出發前的觀察與眼前局部並排', '再親手確認');
  has(row(7, 'U4-V01'), '不自動配對地標或掀檢修蓋', '不重新穿門', '沒有新走廊節點');
  ordered(block('s-0909-48'), '第一人稱互動', '玩家親手拉制動桿', '第一人稱動作回饋', '後方階梯隨後沉降封閉');
  has(row(8, 'R30-V03'), '原拉桿隨時可操作', '零穩定仍可制動', '失焦暫停');
  has(row(8, 'R30-C02'), '未操作不自動固定');
});

test('R33 body return leaves D excluded and historical observation cameras unchanged', () => {
  has(block('s-0910-33'), 'A／B／C／E 共用', '第一人稱過場', '同一口吸氣', '回返後仍須等待救援', '同一室內時間省略');
  has(row(9, 'R33-V02'), 'D 不用', '不重送定位', '不呈現即時傳送救援');
  assert.doesNotMatch(block('s-0907-14'), /（動畫演出(?:／[^）]+)?）/);
  has(block('s-0909-59'), '同一歷史鏡位中', '十二秒', '自我反射重合');
  assert(!block('s-0909-59').includes('第一人稱'));
  has(row(8, 'R31-F01'), '不套管理者的第一人稱視角');
  has(common, 'POST 仍為觀眾視角', '不改成受害者眼中的動態受虐片');
});

test('all animation layers reuse current work orders and reader markers stay on the actual event', () => {
  for (const [act, image] of [[0, 'P0-V01'], [1, 'R1-V01'], [2, 'R8-C02'], [3, 'R12-C05'],
    [3, 'T-R15-R16-03'], [4, 'R18-V02'], [4, 'R22-C06'], [6, 'M1-V02'],
    [7, 'R29-V01'], [7, 'U4-V01'], [8, 'R30-V03'], [8, 'R30-C02'], [9, 'R32-V01'], [9, 'R33-V02']]) {
    has(row(act, image), '第一人稱', '低動態');
  }
  for (const [act, id] of [[3, 'T-R15-R16-03-horror'], [7, 'U4-V01-horror'], [9, 'R32-V01-boss']]) {
    assert.equal(story(act).split(READING_PLACEMENTS[id]).length - 1, 1, id);
  }
  const flow = JSON.parse(readFileSync(new URL('../scene-flow.json', import.meta.url), 'utf8'));
  assert.equal(flow.nodes.length, 48);
  assert.equal(flow.routes.length, 56);
  assert.equal(flow.subscenes.length, 72);
  assert.equal(Object.keys(flow.images).length, 557);
});

test('R5 and R7 local animation preserves readable evidence, frozen history and playback completion', () => {
  has(block('s-0904-40'), '第一人稱互動', '近看繡字時，針線停在字外', '玩家查清後收錄');
  has(row(1, 'R5-C02'), '歷史層保持靜止', '不能靠看完一輪取得 E1-05');
  ordered(block('s-0905-17'), '感知歷史只給撥號前的固定姿勢', '第一人稱互動）回到現時',
    '頸殼停在原輪廓', '最後一段播放結束後', '紙條停在桌上');
  has(block('s-0905-17'), '拖到結尾不算完成', '同樣收起頸殼細動', '紙條不移入玩家手中');
  has(row(2, 'R7-V01'), '播放來源時停新增動態與擬音', '安息後不重啟循環');
  has(row(2, 'R7-C03'), '不代播完來源', '不重扣播放費', '不重演安息');
});

test('R14 cocoon moves only in the present and cannot turn the freight shaft into a ride', () => {
  ordered(block('s-0906-21'), '人、手和衣物靜止', '退出凝固', '第一人稱互動',
    '核對識別牌原定停靠碼', '第一人稱動作回饋');
  has(row(3, 'R14-V01'), '呼吸與起伏同相', '歷史層不動', '不能靠看動畫自動完成');
  has(row(3, 'R14-C03'), '本機有電才可播放', '不搭梯', '不新增目的樓層', '不以停止起伏判定現實人物死亡');
});

test('R11 first-person defense differentiates closing the interface from changing position', () => {
  const scene = block('s-0905-45');
  has(scene, '第一人稱互動', '原無代價示範', '3 秒前兆', '原 0.6 秒表現', '完整 6 秒操作空檔');
  ordered(scene, '玩家**關閉本地介面', '自己的手隨關閉操作離開終端', '來向對側的隔板凹位', '玩家切入凹位後');
  has(scene, '只放開拖曳、仍留介面不算防禦完成', '只關介面、仍待原位不能躲過此招', '查閱時不受攻擊，也不能提交');
  has(row(2, 'R11-V02'), '未操作不套成功片', '切鏡不鎖輸入', '有效提交優先取消同影格攻擊', '低動態仍可辨向且沿同時鐘');
});

test('R26 shoulder and hook animation retains two distinct defenses and safe reading', () => {
  has(block('s-0908-47'), '第一人稱互動', '3.2 秒內退到對側', '3.2 秒內主動鬆柄',
    '玩家鬆開拉柄後', '接著有 6 秒空檔', '凝固近看、必要錄音停表');
  has(row(5, 'R26-V02'), '不能自動退位、鬆柄或核可', '低動態版同落點、同判定',
    '返回給完整前兆', 'C-07 歷史人像仍靜止');
});

test('U2b moving rack uses original danger and work windows without automatically clearing the bridge', () => {
  has(block('s-0909-17'), '未主動轉輪不啟動襲擊');
  has(block('s-0909-18'), '第一人稱互動', '3.5 秒完整前兆', '0.6 秒掃擊', '六秒窗口轉輪 1.5 秒',
    '已完成段保留', '親手扳回離合柄', '視線仍在橋下操作台');
  has(row(6, 'U2b-C01'), '仍需完成原 1.5 秒輸入', '不以切圖代做一段');
  has(row(6, 'U2b-V02'), '手動退凹位才交', '低動態版共享判定', '不能因縮短切鏡自動躲避或收架');
  has(row(6, 'U2b-C02'), '不自動上橋或到訪 U3', '不重播原襲擊');
});

test('U5 blocking and sealing stay separate with no copied U2b timer', () => {
  has(block('s-0909-39'), '第一人稱互動', '3.5 秒前兆', '0.6 秒穿刺', '重試時維持相同來向',
    '卡榫承住隔板時可以停下查看', '親手把隔板回中位', '保留已封側');
  ordered(block('s-0909-39'), '把轉向隔板擋向霜線來處', '再一次拉下獨立遮板', '兩側封好');
  has(row(7, 'U5-V02'), '沒有額外六秒倒數', '動畫不代轉板');
  has(row(7, 'U5-C02'), '擋住不等於封好', '不自動走進維修口', '低動態差分');
});

test('bridge parallax and L2 anomaly connect existing stops without automatic room entry', () => {
  ordered(block('s-0905-22'), '可以回 R7', '第一人稱動作回饋', '第二鏡位位於對面門邊', '直接跨過門檻進 R8');
  has(row(2, 'T-R7-R8-01'), '僅點選前行才播', '低動態版以同兩端構圖切換', '仍待點選進 R8');
  has(row(2, 'T-R7-R8-02'), '原路返回 A 棟', '不把 A／B 字牌鏡像翻轉', '不強制俯看深井');
  const l2 = story(7).split('<a id="ascent-t-r29-u4-02-script"></a>')[1].split('<!-- scene-image-subscene-t-r29-u4-03:begin -->')[0];
  ordered(l2, '按下 48F 按鍵', '第一人稱互動', '第二次卻從車廂內的空送物袋', '到站後核對', '親手拉開閘門');
  has(row(7, 'T-R29-U4-02'), '不補袋中身體或另一樓層', '低動態版', '只停已驗證的 48F 門內', '不自動到訪 U4');
});

test('five ending animations preserve branch commits and three separate paper actions', () => {
  has(block('s-0910-21'), '收到收件證明後', '小花還沒有放行');
  has(block('s-0910-23'), '收到副本的收件證明後');
  has(block('s-0910-22'), '第一人稱過場', '封鎖真正解除');
  has(block('s-0910-24'), '第一人稱過場', '自己讓出門', '本地原件仍在');
  const paper = block('s-0910-26');
  ordered(paper, '第一拍，玩家', '第一人稱動作回饋', '第二拍，玩家', '第一人稱動作回饋',
    '第三拍，玩家主動確認鬆手', '第一人稱動作回饋', '資料尚未完整送出');
  assert.equal([...paper.matchAll(/（動畫演出／第一人稱動作回饋）/g)].length, 3);
  has(row(9, 'R32-C03'), '不能一次播放完成三拍', '第三拍前仍可取消', '不重送定位或指紋');
  has(block('s-0910-28'), '第一人稱過場', '已坐下的低視點', '封鎖沒有解除', '肉身仍昏迷存活');
  has(row(9, 'R32-C04'), '不在確認前靠椅或合翼', '不接 R33-V02');
  has(block('s-0910-30'), '第一人稱過場', '自己的手仍在控制器旁', '只有這一種把小花列為空白訊號');
  has(row(9, 'R32-C05'), '只在接管已提交後', '不能播放動畫代替四秒確認');
  has(row(9, 'R32-V01'), '不重播封房 20–35 秒', '動畫不提交分支', 'D 保持封鎖');
});

test('second-batch art coverage, reader anchors and offscreen still anomalies remain consistent', () => {
  for (const [act, image] of [[1, 'R5-V01'], [1, 'R5-C02'], [2, 'R7-V01'], [2, 'R7-C03'],
    [2, 'R11-V01'], [2, 'R11-V02'], [2, 'T-R7-R8-01'], [2, 'T-R7-R8-02'],
    [3, 'R14-V01'], [3, 'R14-C03'], [5, 'R26-V02'], [6, 'U2b-V02'], [6, 'U2b-C01'],
    [6, 'U2b-C02'], [7, 'U5-V02'], [7, 'U5-C02'], [7, 'T-R29-U4-02'],
    [9, 'R32-V01'], [9, 'R32-C03'], [9, 'R32-C04'], [9, 'R32-C05']]) {
    has(row(act, image), '第一人稱', '低動態');
  }
  for (const [act, id] of [[6, 'U2b-V02-horror'], [7, 'U5-V02-horror'], [7, 'T-R29-U4-02-horror']]) {
    assert.equal(story(act).split(READING_PLACEMENTS[id]).length - 1, 1, id);
  }
  has(common, '第二批製作次序', '不另加強制觀賞時間', '保留靜態異常', '不補物件自行移動');
  has(block('s-0907-25'), '主角收回自己的手', '門邊那隻手仍是靜格', '轉開或遮擋後再看');
});
