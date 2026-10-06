// One-time companion to split-lower-acts: update prose without renaming legacy IDs or paths.
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { CANONICAL_FILES, ACTS, APPENDIX } from './screenplay-files.mjs';

const replacements = [
  ['八份', '十份'], ['八幕玩法', '全幕玩法'], ['八幕閱讀', '全幕閱讀'], ['八幕製作', '全幕製作'], ['八幕遊戲', '全幕遊戲'],
  ['第五、六幕', '第五至八幕'], ['第五幕三句、第六幕五句', '第五幕三句、第六幕一句、第七幕兩句、第八幕兩句'],
  ['第四～六幕', '第四～八幕'], ['第二、三、六幕', '第二、三、七幕'],
  ['第六幕帳號撤銷', '第七幕帳號撤銷'], ['第六幕在帳號撤銷', '第七幕在帳號撤銷'],
  ['第六幕備份內室', '第八幕備份內室'], ['第六幕舊權限', '第八幕舊權限'],
  ['第六幕找到疑似同意書', '第七幕找到疑似同意書'], ['第六幕疑似同意書', '第七幕疑似同意書'],
  ['第六幕才可把矛盾文件', '第七幕才可把矛盾文件'],
  ['第六幕才回收震損', '第八幕才回收震損'], ['第六幕對上坍塌圖', '第八幕對上坍塌圖'],
  ['第六幕 R29', '第七幕 R29'], ['第六幕 R30', '第八幕 R30'], ['第六幕 R31', '第八幕 R31'],
  ['第六幕 U6-01', '第八幕 U6-01'], ['第六幕最終謎題', '第八幕最終謎題'],
  ['第六幕：**它一直', '第八幕：**它一直'],
  ['第六幕庫存紀錄', '第五幕 R25 庫存紀錄'], ['第六幕逃生線庫存', '第五幕 R25 逃生線庫存'],
  ['第六幕才可確認', '第五幕 R25 才可確認'],
  ['第六幕把', '第七幕把'], ['第六幕與人口交易簽核合流', '第七幕與人口交易簽核合流'],
  ['交易文件（第六幕', '交易文件（第七幕'],
  ['第六幕／下部探索', '第六至八幕／下部探索'], ['第六幕三個責任節拍', '第六至八幕三個責任節拍'],
  ['第六幕揭露預算', '第六至八幕揭露預算'], ['第六幕每房', '第六至八幕每房'],
  ['第六幕 90–133 分鐘', '第六至八幕原合計 90–133 分鐘'],
  ['第六幕核心房', '第六至八幕核心房'], ['第六幕與終幕', '第六至八幕與終幕'],
  ['第六幕＋終幕', '第六至八幕＋終幕'], ['第六幕／終幕', '第六至八幕／終幕'],
  ['第六幕的遠端刪除', '第七幕的遠端刪除'], ['第六幕的外部握手', '第八幕的外部握手'],
  ['第六幕才接齊公共通路', '第八幕才接齊公共通路'],
  ['第六幕的懸念轉向', '第六至八幕的懸念轉向'],
  ['第六幕追查持續簽核責任', '第七幕追查持續簽核責任'],
  ['第六幕沿實體條件', '第六至八幕沿實體條件'],
  ['第六幕以空間失序', '第六至八幕以空間失序'],
  ['第六幕新增資料欄位', '第六至八幕共用資料欄位'],
  ['第六幕結算與跨系統規則', '第八幕結算與跨幕共用規則'],
  ['第六幕的新問題', '第六至八幕的新問題'],
  ['第六幕 → 終幕', '第八幕 → 終幕'],
  ['完成第六幕', '完成第七幕'], ['讓第六幕在大量', '讓第八幕在大量'],
  ['第六幕此段', '第八幕此段'], ['第六幕：封窗', '第六至八幕：封窗'],
  ['06-07 第六幕 頂層', '06-07 第六至八幕總覽'],
  ['06-07 第六幕 · 頂層', '06-07 第六至八幕總覽'],
  ['06-07 第六幕 R27／R30', '第六幕 R27／第八幕 R30'],
  ['06-07《第六幕：頂層》R27／R28', '第六幕 R27／第七幕 R28'],
  ['06-07《第六幕：頂層》', '第六至八幕共用規格'],
];

function prose(text) {
  // Keep historical filenames, save keys and canonical manifests byte-stable.
  return text.split(/(<!--[^]*?-->|\]\([^)]*\)|`[^`\n]*`|^.*(?:正式入口:|\.md$).*$)/gm)
    .map((part, i) => i % 2 ? part : replacements.reduce((s, [a, b]) => s.replaceAll(a, b), part)).join('');
}
const files = [...CANONICAL_FILES.map(f => 'docs/' + f), 'README.md', 'docs/README.md'];
for (const file of files) {
  const original = readFileSync(file, 'utf8');
  let text = prose(original);
  if (file === 'docs/' + ACTS[6].specPath) {
    text = text.replace(/(<!-- import:(s-(?:0607-(?:1|2|3|4)|0909-(?:1|2))):begin -->)([^]*?)(<!-- import:\2:end -->)/g,
      (_, begin, id, body, end) => begin + body.replaceAll('本幕', '全段').replace('第六幕 · 頂層 ACT VI', '第六至八幕 · 上層探索總覽').replace('遊戲劇本 · 第六幕 ACT VI · 頂層', '第六至八幕的來源與承接') + end);
  }
  if (file === 'docs/' + APPENDIX) {
    text = text.replaceAll('03-01 · 七幕流程大綱', '03-01 · 全劇流程大綱')
      .replace('本作由**序幕＋七幕主體**構成；七幕主體是第一～六幕與終幕。', '本作由**序幕＋第一至八幕＋終幕**構成，共十個閱讀章節。')
      .replace('每一幕對應一個主要調查區域、一層責任揭露與一組對戰／情感節點', '各幕依調查區域與情緒節點分段；第六至八幕共同完成第五層责任揭露'.replace('责任', '責任'))
      .replaceAll('第六幕包含 R27–R31、M1 與 U1–U6／U2b／U4b／U6b。', '第六幕為 M1、R27、U1–U3／U2b；第七幕為 R28、R29、U4／U4b、U5；第八幕為 U6／U6b、R30、R31。')
      .replace('第六至八幕與終幕的逐字 VO 表分見 09-09／09-10。兩稿', '第六至八幕合計的逐字 VO 表見第八幕製作規格，終幕表見終幕製作規格。原兩份合併來源');
    text = text.split('\n').map(line => {
      if (/^\| \*\*R(?:28|29)\*\*/.test(line)) line = line.replace('| 六 |', '| 七 |');
      if (/^\| \*\*R(?:30|31)\*\*/.test(line)) line = line.replace('| 六 |', '| 八 |');
      if (/^\| `E(?:4-04|3-07|3-08|5-03)`/.test(line)) line = line.replaceAll('第六幕', '第八幕');
      if (/^\| `E(?:2-11|5-07)`/.test(line)) line = line.replaceAll('第六幕', '第七幕');
      if (/^\| 六 \| 不再是倒影/.test(line)) line = line.replace('| 六 |', '| 八 |');
      if (/^\| 第六幕 \| \*\*不再是倒影/.test(line)) line = line.replace('第六幕', '第八幕');
      if (/^\| 第六幕 \| 固定檢修|^\| 第六幕 \| 結構失衡|^\| 第六幕 \| 由玩家親手/.test(line)) line = line.replace('第六幕', '第八幕');
      if (/^\| \*\*第五層\*\*|^\| `E5-\*`/.test(line)) line = line.replace('第六幕', '第六至八幕');
      if (/^\| 50F/.test(line)) line = line.replace('第六幕', '第八幕');
      if (/^\| 45F–49F/.test(line)) line = line.replace('第六幕', '第六至八幕');
      if (/^\| 第六幕 \| 19/.test(line)) line = line.replace('第六幕', '第六至八幕合計');
      if (/^\| 一：R31/.test(line)) line = line.replace('[第六幕]', '[第八幕]');
      return line;
    }).join('\n');
    text = text.replaceAll('鎖定责任', '鎖定責任')
      .replace('本作不再要求玩家到第六幕才猜到主角身分', '本作不再要求玩家到第八幕才猜到主角身分')
      .replace('**本幕開場前先走完破例四（M1 七窗夾道，2 分 20 秒不可跳過）**', '**第六幕由 M1 七窗夾道起始，約 2 分 20 秒為完整呈現設計值；依原規格可切等效摘要或略過未看窗格**')
      .replace('逐房資料。本幕不靠', '逐房資料。這三幕的核心房不靠');
    const chapterLink = a => `[${a.name}](../${a.specPath}#spec-act-${a.act})`;
    text = text.replace(/\[06-07 第六幕\]\([^)]+\) → \[06-08 終幕\]\([^)]+\)/,
      ACTS.slice(6).map(chapterLink).join(' → '));
    text = text.replace(/\[第六幕\]\([^)]*#doc-0607\)、\[終幕\]\([^)]+\)。本表只索引/, ACTS.slice(6).map(chapterLink).join('、') + '。本表只索引');
    text = text.replace(/\[([^\]\n]+)\]\(([^)]+#(?:doc-0607|doc-0909))\)/g, (all, label, href) => {
      let dest;
      if (label === '第八幕 U6-01') dest = `${ACTS[8].path}#s-0909-40`;
      if (label === '第八幕') dest = `${ACTS[8].path}#act-8`;
      if (/^(?:R31 鑑識|R30 震損)/.test(label)) dest = `${ACTS[8].specPath}#node-${label.slice(0, 3).toLowerCase()}-spec`;
      if (label === '06-07 R29' || label === 'R29 最後一筆') dest = `${ACTS[7].specPath}#node-r29-spec`;
      if (!dest) return all;
      return `[${label}](${path.posix.relative(path.posix.dirname(APPENDIX), dest.split('#')[0])}#${dest.split('#')[1]})`;
    });
  }
  if (text !== original) {
    writeFileSync(file, text);
    console.log(file);
  }
}
