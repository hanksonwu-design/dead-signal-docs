import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseMaster} from './sync-canonical.mjs';
import {buildCurrentModel} from '../building/current-spatial.js';

const flow=JSON.parse(readFileSync(new URL('../scene-flow.json',import.meta.url)));
const graph=JSON.parse(readFileSync(new URL('../scene_graph.json',import.meta.url)));
const master=parseMaster(),model=buildCurrentModel(graph,flow);
const n=id=>flow.nodes.find(n=>n.id===id);
const r=(a,b)=>flow.routes.find(r=>r.from===a&&r.to===b);
const edge=(a,b)=>graph.edges.find(e=>e.fromId===a&&e.toId===b);
let passed=0;
function test(name,fn){fn();passed++;console.log('PASS '+name);}

test('approved room groups occupy exact floors and the final floor is sparse',()=>{
 const groups={23:['R12','R13'],27:['R14','R15'],31:['R16'],32:['R17'],37:['R18','R19','R20'],40:['R21'],42:['R22'],45:['R27'],46:['U1','U2','U2b','U3'],47:['R28','R29'],48:['U4','U4b','U5'],49:['U6','U6b','R30'],50:['R31','R32']};
 for(const [floor,ids] of Object.entries(groups))for(const id of ids)assert.deepEqual(n(id).floor.levels,[Number(floor)],id);
 assert.deepEqual(model.nodes.filter(n=>n.spatial&&n.level===50).map(n=>n.id),['R31','R32']);
});
test('every multi-floor route names each intervening platform, including conditional branches',()=>{
 for(const [a,b,expected] of [
  ['R11','R12',[16,17,18,19,20,21,22]],['R12','R14',[24,25,26]],['R12','R15',[24,25,26]],
  ['R13','R14',[24,25,26]],['R13','R15',[24,25,26]],['R15','R16',[28,29,29,30,30,31]],
  ['R17','R14',[31,30,29,28]],['R17','R18',[33,34,35,36]],['R20','R21',[38,39]],['R21','R22',[41]]
 ])assert.deepEqual(flow.subscenes.filter(s=>s.route===r(a,b).id).map(s=>s.floor.levels[0]),expected,`${a}-${b}`);
});
test('upper-story stairs and the brake exit bind their actual endpoints',()=>{
 for(const [a,b,lo,hi] of [['R27','U1',45,46],['U3','R28',46,47],['U5','U6',48,49],['R30','R31',49,50]]){
  const route=r(a,b),children=flow.subscenes.filter(s=>s.route===route.id);
  assert.equal(children.length,1);assert.equal(children[0].floor.label,`${lo}F → ${hi}F`);
  assert.equal(route.steps[0].id,a);assert.equal(route.steps.at(-1).id,b);
 }
});
test('shared glass, same-column shortcut and local mechanisms remain on one floor',()=>{
 const room=id=>model.nodes.find(n=>n.id===id);
 assert.equal(room('R19').z+room('R19').d/2,room('R20').z-room('R20').d/2);
 for(const ids of [['R18','R19','R20'],['U1','U2','U2b','U3'],['U4','U4b','U5'],['U6','U6b','R30']])assert.equal(new Set(ids.map(id=>room(id).level)).size,1);
 assert(r('U3','U1').back);assert.equal(r('U3','U1').floor.label,'46F');
});
test('M1 ends at the display floor, not at the final core',()=>{
 assert.equal(n('M1').floor.label,'44F → 45F');assert.equal(r('M1','R27').floor.label,'45F');
 const spine=model.nodes.find(n=>n.id==='M1');assert.equal(spine.points.at(-1)[1],model.floorY.get(45)+.3);
 assert(!n('M1').floor.levels.some(f=>f>45));
});
test('original gates still prevent branch bypasses and premature core access',()=>{
 assert.match(edge('R12','R15').gate,/SQ-T 完成.*均已到訪.*E2-06/);
 assert.match(edge('R13','R15').gate,/E-07.*安息.*R14.*繼電器/);
 assert.match(edge('R15','R16').gate,/E2-06/);
 assert.match(edge('R20','R21').gate,/段 C.*F3.*本地憑證驗證/);
 assert.match(edge('R21','R22').gate,/arc.protagonist.compromise_seen/);
 for(const [a,b] of [['R11','R12'],['R17','R14'],['R17','R18'],['R30','R31']])assert.equal(r(a,b).back,false);
});
test('new revision saves cannot convert old route ordinals into unexplored room progress',()=>{
 const policy=master.blocks.get('s-0403-3');
 for(const text of ['version: 4','版本 1／2／3','每條新路獨立驗證','供電未完成','不能初始化 R15→R16','M1 保留原七窗各自觀察旗標'])assert(policy.includes(text),text);
 const act4=master.documents.get(n('R21').floor.source);
 for(const text of ['平行工作梯','不因入房或讀檔重生','下返 37F 不重播段 C'])assert(act4.includes(text),text);
});
test('retired exits are not duplicated in current artwork or reading order',()=>{
 for(const id of ['R12-V02','R12-V03','R13-V02','R17-V02','R20-V02'])assert(!flow.images[id],id);
 const story=master.blocks.get('s-0906-59');
 assert(story.indexOf('ascent-t-r17-r14-04-script')<story.indexOf('先看見熟悉的搬運標記'));
 assert.equal(Object.values(flow.images).filter(i=>i.kind==='過渡場景').length,58);
 assert.equal(flow.subscenes.filter(s=>s.play).length,33);
});
test('abridged novel and the transition inventory share the new distribution',()=>{
 const novel=readFileSync(new URL('../docs/09_故事劇情/17_縮寫短文.md',import.meta.url),'utf8');
 for(const stale of ['八樓到十四樓沒有可以進去的門','四十一樓前段','五十樓展示廊'])assert(!novel.includes(stale),stale);
 for(const current of ['二十三樓修理區','二十七樓的貨梯','三十一樓伺服器室','四十樓辦公室','四十五樓展示廊','四十六樓分租廊','四十七樓交易區','四十八樓','四十九樓水箱'])assert(novel.includes(current),current);
 const inventory=readFileSync(new URL('../docs/08_製作管理/08-13_劇情節點與場景道具總表.md',import.meta.url),'utf8');
 const table=inventory.split('<!-- inventory:transitions:begin -->')[1].split('<!-- inventory:transitions:end -->')[0];
 const rows=[...table.matchAll(/^\| \[T-[^\]]+\]\([^\n]+?\) \| (\d+) \|/gm)];
 assert.equal(rows.length,21);assert.equal(rows.reduce((sum,m)=>sum+Number(m[1]),0),58);
});
console.log(`${passed} floor-distribution checks passed; room rules and artwork remain production specifications.`);
