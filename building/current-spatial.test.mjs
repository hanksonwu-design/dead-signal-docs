import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildCurrentModel,FLOORS} from './current-spatial.js';
import {currentLayout,layout} from './spatial.js';
import {markerPosition,shotPosition} from './model-markers.js';
import {clipRouteToHeight} from './floor-route-view.js';
const graph=JSON.parse(readFileSync(new URL('../scene_graph.json',import.meta.url)));
const flow=JSON.parse(readFileSync(new URL('../scene-flow.json',import.meta.url)));
const onSegment=(p,a,b)=>Math.abs(Math.hypot(...p.map((v,i)=>v-a[i]))+Math.hypot(...p.map((v,i)=>v-b[i]))-Math.hypot(...b.map((v,i)=>v-a[i])))<1e-6;
test('all current scenes, routes and secondary images are represented without altering canonical data',()=>{
 const before=JSON.stringify({graph,flow});
 for(const actual of [false,true]){
  const m=buildCurrentModel(graph,flow,actual);
  assert.equal(m.nodes.length,48);assert.equal(m.shots.length,72);assert.equal(m.routes.length,56);
  assert.equal(m.nodes.filter(n=>n.spatial).length,46);assert.equal(m.routes.filter(r=>r.spatial).length,51);
  for(const n of m.nodes)assert.deepEqual(n.floor,flow.nodes.find(f=>f.id===n.id).floor);
  for(const r of m.routes){const original=graph.edges.find(e=>e.id===r.id);for(const k of ['gate','motion','returnRule','back'])assert.deepEqual(r[k],original[k]);}
 }
 assert.equal(JSON.stringify({graph,flow}),before);
});
test('all secondary markers lie on their own route and preserve picture order',()=>{
 for(const actual of [false,true]){
  const m=buildCurrentModel(graph,flow,actual);
  for(const r of m.routes.filter(r=>r.spatial)){
   assert(r.points.length>=2&&r.points.every(p=>p.every(Number.isFinite)),r.id);
   for(const s of r.shots)assert(r.points.some((p,i)=>i&&onSegment(s.position,r.points[i-1],p)),s.id);
   assert.deepEqual(r.shots.map(s=>s.id),r.steps.filter(s=>s.type==='subscene').map(s=>s.id));
  }
  for(const [id,floor] of [['T-R12-R14-01',24],['T-R17-R18-04',28]])assert(Math.abs(m.shots.find(s=>s.id===id).position[1]-m.floorY.get(floor)-.3)<1e-6,id);
 }
});
test('lower floors, dining stair and maintenance spine use continuous real endpoints',()=>{
 for(const actual of [false,true]){
  const m=buildCurrentModel(graph,flow,actual),n=id=>m.nodes.find(n=>n.id===id),r=(a,b)=>m.routes.find(r=>r.from===a&&r.to===b);
  assert.equal(n('R24').level,31);assert.equal(n('R25').level,34);assert.equal(n('R27').level,35);
  assert.equal(r('R24','R25').points[0][1],n('R24').y+.3);assert.equal(r('R24','R25').points.at(-1)[1],n('R25').y+.3);
  assert.deepEqual(r('R25','M1').points.at(-1),n('M1').points[0]);
  assert.deepEqual(n('M1').points.at(-1),r('M1','R27').points[0]);
  assert.deepEqual(FLOORS,[-3,-2,-1,...Array.from({length:50},(_,i)=>i+1)]);
  assert.equal(r('U3','U1').kind,'捷徑');assert(r('U3','U1').back);
  for(const [id,f] of [['U2b',41],['U4b',48],['U6b',49]]){assert.equal(n(id).level,f);assert.equal(n(id).y,m.floorY.get(f)-1.8);}
 }
});
test('upper mainline reaches 32F, descends to the isolated 28F wing and releases into the 31F archive wing',()=>{
 for(const actual of [false,true]){
  const m=buildCurrentModel(graph,flow,actual),n=id=>m.nodes.find(n=>n.id===id),r=(a,b)=>m.routes.find(r=>r.from===a&&r.to===b);
  assert.equal(Math.max(...m.nodes.filter(n=>n.spatial&&n.part===1).flatMap(n=>n.floor.levels)),32);
  assert.deepEqual(['R16','R17','R18','R19','R20','R21','R22','R23','R24'].map(id=>n(id).level),[31,32,28,28,28,29,30,31,31]);
  const descent=r('R17','R18');assert.deepEqual(descent.shots.map(s=>s.floor.levels[0]),[31,30,29,28]);
  assert(descent.points.every((p,i)=>!i||p[1]<=descent.points[i-1][1]+1e-6),'C02 is a continuous descent');
  for(const [a,b,label] of [['R20','R21','28F 上半層平台'],['R21','R22','29F 上半層平台']]){
   const shot=r(a,b).shots.find(s=>s.floor.label===label);assert(shot,label);
   assert(Math.abs(shot.position[1]-m.floorY.get(Number(label.slice(0,2)))-1.9)<1e-6);
  }
  for(const id of ['R18','R19','R20','R21','R22'])assert.equal(n(id).zone,'隔離校正內翼');
  for(const id of ['R23','R24']){
   assert.equal(n(id).zone,'檔案新翼');
   const a=n(id),b=n('R16');assert(Math.abs(a.x-b.x)>=(a.w+b.w)/2||Math.abs(a.z-b.z)>=(a.d+b.d)/2,`${id} does not overlap 31F server room`);
  }
  const l1=r('R15','R16').shafts;assert.deepEqual(l1.map(s=>[s.from,s.to]),[[29,30],[30,31]]);
  for(const p of descent.points)for(const shaft of l1)assert(Math.hypot(p[0]-shaft.a[0],p[2]-shaft.a[2])>4,'C02 stays outside original L1');
 }
 assert.equal(layout.R18[2],37);assert.equal(layout.R22[2],42);
 assert.equal(currentLayout.R18[2],28);assert.equal(currentLayout.R22[2],30);
});
test('single-image long passages have a flat landing and aligned markers at every named floor in either walking direction',()=>{
 for(const actual of [false,true]){
  const m=buildCurrentModel(graph,flow,actual);
  for(const [id,expected] of [['P2-V02',[-3,-2,-1,1]],['T-R24-R25-01',[31,32,33,34]],['T-R27-U1-01',[35,36,37,38,39,40,41]],['T-U3-R28-01',[41,42,43,44,45,46,47]]]){
   const s=m.shots.find(s=>s.id===id),route=m.routes.find(r=>r.id===s.route);
   assert.deepEqual(s.landings.map(p=>p.floor),expected,id);
   assert.deepEqual([...s.landings].reverse().map(p=>p.floor),[...expected].reverse(),id);
   for(const p of s.landings){
    assert.equal(p.position[1],m.floorY.get(p.floor)+.3,id);
    assert(route.points.some((b,i)=>i&&Math.abs(b[1]-route.points[i-1][1])<1e-6&&onSegment(p.position,route.points[i-1],b)),`${id} ${p.floor}F has a connected flat platform`);
    const next=FLOORS[FLOORS.indexOf(p.floor)+1],sliced=clipRouteToHeight(route.points,m.floorY.get(p.floor)+.3,m.floorY.get(next)+.3);
    assert(sliced.some(points=>points.some((b,i)=>i&&onSegment(p.position,points[i-1],b))),`${id} ${p.floor} platform survives floor slicing`);
    assert.deepEqual(shotPosition(s,p.floor),p.position);
    const marker={shot:id,offset:[.4,-.2]};
    assert.deepEqual(markerPosition(marker,m,p.floor),[p.position[0]+.4,p.position[1]+1.2,p.position[2]-.2]);
   }
   assert(s.landings.every((p,i)=>!i||p.along>s.landings[i-1].along),id+' platform order');
  }
 }
});
test('loop and ending beats do not become physical rooms or roads',()=>{
 const m=buildCurrentModel(graph,flow);
 assert.deepEqual(m.nodes.filter(n=>!n.spatial).map(n=>n.id),['R33','POST']);
 assert.deepEqual(m.routes.filter(r=>!r.spatial).map(r=>r.id),['R32-R32-41','R32-R33-42','R33-P1-43','R33-POST-44','U4-U4-lower']);
 for(const r of m.routes.filter(r=>!r.spatial))assert.deepEqual(r.points,[]);
});
test('unknown physical nodes and unbound routes fail instead of inventing geometry',()=>{
 const bad=structuredClone(graph);bad.edges[0].id='unknown';assert.throws(()=>buildCurrentModel(bad,flow),/Missing flow route/);
 const source=readFileSync(new URL('./current-model.js',import.meta.url),'utf8');
 assert(!source.includes('localStorage')&&!source.includes('sessionStorage'),'current viewer must not overwrite legacy editing state');
 const editor=readFileSync(new URL('./model-source.js',import.meta.url),'utf8');
 assert(editor.includes("const storageKey='dead-signal-building-sandbox-v2'"));
});
test('formal navigation excludes the archived editor while its original URL and recovery controls remain',()=>{
 for(const file of ['current-template.html','index.html']){
  const text=readFileSync(new URL(file,import.meta.url),'utf8');
  assert(!/editor-link|href="editor\.html/.test(text),file);
  assert(text.includes('id="flow-link"'),file);
 }
 assert(!readFileSync(new URL('current-model.js',import.meta.url),'utf8').includes('editor-link'));
 for(const file of ['template.html','editor.html']){
  const text=readFileSync(new URL(file,import.meta.url),'utf8');
  assert(text.includes('舊配置沙盒（封存）'),file);
  assert(text.includes('封存 · 舊單棟配置'),file);
  for(const id of ['scene-export','scene-import','edit-mode-switch'])assert(text.includes(`id="${id}"`),id);
  assert(text.includes('href="index.html"'),file);
 }
});
