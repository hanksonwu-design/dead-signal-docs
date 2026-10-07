// Reused establishing images must not announce an encounter before its authored beat.
export const READING_PLACEMENTS = Object.freeze({
  'P0-C05-horror': '（靜態差分）關閉該次近看，才看見',
  'P1-V01-horror': '〔環境／異常聲〕左側管後兩下腳步',
  'P2-C04-horror': '| **搪瓷盆** |',
  'R1-C06-horror': '（動畫演出）原電視熄滅。',
  'R7-V01-horror': '〔環境／異常聲〕一聲清喉嚨在近處。',
  'R9-C01-horror': '（動畫演出）帆布旁一道暗縫在 3 秒內退去。',
  'R11-V01-horror': '（介面呈現）其他螢幕一起跳出來電視窗。',
  'R12-D04-horror': '（介面呈現）維修檯上一支無主舊手機亮起。',
  'R13-V01-horror': '（動畫演出）退出後，現時輪廓才逐顆數不存在的藥',
  'R16-C01-horror': '〔環境／聲場變化〕原伺服器風扇一起停 1 秒',
  'R17-V01-horror': '（靜態畫面／中景）鏡像者第五次不在玩家這一側',
  'R19-V01-horror': '（動畫演出）確認屏息後，影子停在門下 5.2 秒。',
  'R21-D02-item': '查看原小花校正排程與核可欄。',
  'R23-V01-horror': '手沿門框滑到扶手，側身後鬆開。',
  'R26-V01-boss': '（靜態畫面／中景）阿彪停在椅旁',
  'R29-V02-horror': '第一次從任一套房退回走廊、站穩之後',
  'U2-V01-horror': '初次從門邊望進內井，風柵前的濕布',
  'U2b-V02-horror': '（動畫演出）地面黑線爬向搖輪',
  'U4-V01-horror': '〔玩家〕主動穿過原內門，一次短轉場後',
  'U5-V02-horror': '（動畫演出）左或右霜線由對應孔口延伸',
  'U6-V01-horror': '第一次完成有效導水後，玩家的手離開閥輪。',
  'U6b-V01-horror': '止回栓扣妥，水平泡停在中央。',
  'R30-C03-horror': '（靜態差分）粉塵裡有同衣、同包、同疲態的站姿。',
  'R32-V01-boss': '（動畫演出）熟悉袖口向兩側延長',
  'T-R2-R3-01-horror': '（動畫演出）往梯腳靠近時，亮縫從遠端',
  'T-R15-R16-03-horror': '（動畫演出）車廂上行，井壁字牌從鐵格後移過',
  'T-R29-U4-02-horror': '（動畫演出）車廂緩緩上行，一處沒有落地平台',
});

export function screenplayBody(content) {
  return content.replace(/\r\n/g, '\n').replace(/^---\s*\n[\s\S]*?\n---\s*\n?/, '');
}

export function locateReadingMarkers(raw, markers, placements = READING_PLACEMENTS) {
  const lines = raw.replace(/\r\n/g, '\n').split('\n'), found = [], issues = [];
  let code = false;
  const eligible = lines.map(line => {
    if (/^\s*(?:```|~~~)/.test(line)) { code = !code; return false; }
    return !code && !!line.trim() && !/^\s*(?:<!--|<a |#)/.test(line);
  });
  for (const m of markers) {
    const needle = m.reading || placements[m.id];
    let matches = lines.flatMap((line, i) => eligible[i] && (needle ? line.includes(needle) : line.includes(`[${m.image}](`)) ? [i] : []);
    // Older transition close-ups use a plain image number beside their local description.
    if (!needle && !matches.length) matches = lines.flatMap((line, i) => eligible[i] && line.startsWith('**近看：**') && line.includes(`（${m.image}）`) ? [i] : []);
    if (matches.length !== 1) { issues.push(`${m.id}: ${matches.length} reading targets`); continue; }
    let line = matches[0];
    if (!/^\s*(?:\||[-*+] |\d+\. |>|#{1,6} )/.test(lines[line])) {
      while (line > 0 && eligible[line - 1] && !/^\s*(?:\||[-*+] |\d+\. |>|#{1,6} |---)/.test(lines[line - 1])) line--;
    }
    found.push({...m, line});
  }
  return {found: found.sort((a, b) => a.line - b.line), issues};
}
