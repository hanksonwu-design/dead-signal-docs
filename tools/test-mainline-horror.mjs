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
];

test('five progress cues have inline screenplay images, production contracts and canonical asset layers',()=>{
 const flow=JSON.parse(read('scene-flow.json'));
 for(const [id,act,beat,image,word] of cues){
  has(block(story(act),beat),`[${image}]`,word);
  has(spec(act),`主線氣氛 ${id}`, '#horror-mainline-contract');
  has(flow.images[image].content,id);
  has(flow.images[image].requirements,'低動態');
  has(appendix,`| ${id} |`);
 }
 assert.equal(Object.keys(flow.images).length,523);
 assert.equal(flow.subscenes.length,72);
});

test('HP presentation shares suppression, persistence and migration rules without adding progression gates',()=>{
 const common=block(appendix,'s-0304-8');
 has(common,'5 組 HP','HP 與 HA 共用冷卻','90 秒有效探索冷卻','unseen / playing / done / skipped',
  '中途存檔保存已到差分與播放位置','暫停／失焦凍結','開始前就被抑制記 skipped',
  '舊檔已越過觸發進程點則記 skipped','不改基底','永不出現在出口、解題、蒐集或結局前置',
  'HP-04 與 HP-05 不必同輪連播','文字修訂不等於已通過恐怖效果實測');
 const graph=JSON.parse(read('scene_graph.json'));
 for(const e of graph.edges)assert(!/presentation\.hp|HP-0[1-5]/.test(JSON.stringify(e)),e.id);
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
