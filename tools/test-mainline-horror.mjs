import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {ACTS,APPENDIX} from './screenplay-files.mjs';

const read=file=>readFileSync(new URL(`../${file}`,import.meta.url),'utf8');
const story=act=>read(`docs/${ACTS[act].path}`);
const spec=act=>read(`docs/${ACTS[act].specPath}`);
const appendix=read(`docs/${APPENDIX}`);
const block=(text,id)=>{
 const begin=`<!-- import:${id}:begin -->`,end=`<!-- import:${id}:end -->`;
 assert(text.includes(begin)&&text.includes(end),id);
 return text.slice(text.indexOf(begin),text.indexOf(end));
};
const has=(text,...terms)=>terms.forEach(term=>assert(text.includes(term),`Missing: ${term}`));
const cues=[
 ['HP-01',1,'s-0904-16','T-R2-R3-01','亮縫'],
 ['HP-02',5,'s-0908-18','R23-V01','摺痕'],
 ['HP-03',5,'s-0908-28','T-R24-R25-01','折線'],
 ['HP-04',8,'s-0909-40','U6-V01','水紋'],
 ['HP-05',8,'s-0909-42','U6b-V01','廢管'],
 ['HP-06',6,'s-0909-16','U2-V01','濕布'],
];

test('six progress cues have inline screenplay images, production contracts and canonical asset layers',()=>{
 const flow=JSON.parse(read('scene-flow.json'));
 for(const [id,act,beat,image,word] of cues){
  has(block(story(act),beat),`[${image}]`,word);
  has(spec(act),`主線氣氛 ${id}`, '#horror-mainline-contract');
  has(flow.images[image].content,id);
  has(flow.images[image].requirements,'低動態');
  has(appendix,`| ${id} |`);
 }
 assert.equal(Object.keys(flow.images).length,557);
 assert.equal(flow.subscenes.length,72);
});

test('HP presentation shares suppression, persistence and migration rules without adding progression gates',()=>{
 const common=block(appendix,'s-0304-8');
 has(common,'6 組 HP','presentation.hp06','HP 與 HA 共用冷卻','90 秒有效探索冷卻','unseen / playing / done / skipped',
  '中途存檔保存已到差分與播放位置','暫停／失焦凍結','開始前就被抑制記 skipped',
  '舊檔已越過觸發進程點則記 skipped','不改基底','永不出現在出口、解題、蒐集或結局前置',
  'HP-04 與 HP-05 不必同輪連播','文字修訂不等於已通過恐怖效果實測');
 const graph=JSON.parse(read('scene_graph.json'));
 for(const e of graph.edges)assert(!/presentation\.hp|HP-0[1-6]/.test(JSON.stringify(e)),e.id);
 assert.equal(graph.nodes.length,48);assert.equal(graph.edges.length,56);
 for(const {name} of ACTS)has(common,`| ${name} |`);
});

test('material changes respect off-camera rules and preserve trustworthy mechanical outcomes',()=>{
 has(block(story(5),'s-0908-18'),'（靜態差分）','門框短暫遮住');
 has(block(story(5),'s-0908-28'),'（靜態差分）','轉角背面');
 has(spec(5),'無直視壓陷動畫','不演直視變形');
 has(spec(8),'總量六格守恆','不寫 balance_held 或 walkway_locked','walkway_locked 已保存後','不提前開始 R30 沉降');
 const water=block(story(8),'s-0909-40');
 assert(water.indexOf('先導一格')<water.indexOf('第一次完成有效導水後'));
 assert(water.indexOf('第一次完成有效導水後')<water.indexOf('再從另一側導一格'));
 has(block(appendix,'s-0304-8'),'非歷史解凍','回壓波紋','受重力掉落');
});

test('seventh mirror precedes player-owned F5 while H-08 remains optional after it',()=>{
 const mirror=block(story(5),'s-0908-36');
 has(mirror,'鏡像者第七次','金屬邊','原欄位由玩家親手展開');
 assert(!mirror.includes('選填'));
 has(block(story(5),'s-0908-37'),'親自展開回傳欄','取得 F5');
 has(spec(5),'以原第七次鏡像旗標去重','不要求先得 F5','F5 保存後、三喇叭前，玩家選填重看',
  '略過輪廓不影響已取得的 F5','不同層、不同時機');
 has(appendix,'| 8 | 八 | R30','| 9 | 八 | **R31 解凍**');
});

test('R7 reuses its existing HA at first arrival before optional reading and keeps Lao Zhou priority',()=>{
 const text=story(2),cue=block(text,'s-0905-16'),production=spec(2);
 has(cue,'首次踏進主廊','[R7-V01]','每張桌前都空著','點開舊電話時');
 assert(text.indexOf('<!-- import:s-0905-10:begin -->')<text.indexOf('<!-- import:s-0905-16:begin -->'));
 assert(text.indexOf('<!-- import:s-0905-16:begin -->')<text.indexOf('<!-- import:s-0905-11:begin -->'));
 has(production,'不限來向、不需先讀手冊、不另等閒置 4 秒','到點仍受保護或冷卻未到亦略過',
  'HA-R7-01 已依原規則停止','安息後及回訪不重播','舊檔已到過 R7 而尚無事件紀錄','不新增 HA 或 HP');
 assert(!production.includes('已讀手冊後首次從網咖方向'));
 const table=block(production,'s-0603-16').match(/\| 事件／類型[\s\S]*?(?=\n\n)/)?.[0];
 for(const node of ['R6','R7','R8','R9','R10','R11'])has(table,`HA-${node}-01`);
});

test('U2 entry atmosphere preserves honest mechanics, safe reading and the later voluntary encounter',()=>{
 const entry=block(story(6),'s-0909-16'),production=block(spec(6),'s-0610-6');
 assert(entry.indexOf('初次從門邊望進內井')<entry.indexOf('〔操作／物件操作〕'));
 has(entry,'後面只有格柵與封窗','兩條鏈的接點、煞扣與下方落腳處一直清楚可見','空鏈只動空桿');
 has(production,'主線氣氛 HP-06','presentation.hp06','90 秒有效探索冷卻',
  '緩衝中開近看、開始操作或離鏡即記 skipped','到點受保護或冷卻未到亦略過',
  '不在關閉介面、回訪或前往 U2b 後補播','布料回到普通垂落',
  '該旗標不寫入 `lower.u2.setup_ready`','不扣穩定或增加恐慌',
  '正式 UD-01 仍僅在 U2b 主動轉輪後開始','U3 修理與回憶段保留原安靜');
 has(block(story(6),'s-0909-17'),'未主動轉輪不啟動襲擊');
 has(block(story(6),'s-0909-18'),'3.5 秒完整前兆','1.5 秒','已完成段保留');
});
