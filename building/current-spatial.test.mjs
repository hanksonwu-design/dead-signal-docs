import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildCurrentModel,FLOORS} from './current-spatial.js';
const graph=JSON.parse(readFileSync(new URL('../scene_graph.json',import.meta.url)));
const flow=JSON.parse(readFileSync(new URL('../scene-flow.json',import.meta.url)));
const onSegment=(p,a,b)=>Math.abs(Math.hypot(...p.map((v,i)=>v-a[i]))+Math.hypot(...p.map((v,i)=>v-b[i]))-Math.hypot(...b.map((v,i)=>v-a[i])))<1e-6;
test('all current scenes, routes and secondary images are represented without altering canonical data',()=>{
 const before=JSON.stringify({graph,flow});
 for(const actual of [false,true]){
  const m=buildCurrentModel(graph,flow,actual);
  assert.equal(m.nodes.length,48);assert.equal(m.shots.length,67);assert.equal(m.routes.length,56);
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
  for(const [id,floor] of [['T-R12-R14-01',24],['T-R17-R18-04',36]])assert(Math.abs(m.shots.find(s=>s.id===id).position[1]-m.floorY.get(floor)-.3)<1e-6,id);
 }
});
test('lower floors, dining stair and maintenance spine use continuous real endpoints',()=>{
 for(const actual of [false,true]){
  const m=buildCurrentModel(graph,flow,actual),n=id=>m.nodes.find(n=>n.id===id),r=(a,b)=>m.routes.find(r=>r.from===a&&r.to===b);
  assert.equal(n('R24').level,43);assert.equal(n('R25').level,44);assert.equal(n('R27').level,45);
  assert.equal(r('R24','R25').points[0][1],n('R24').y+.3);assert.equal(r('R24','R25').points.at(-1)[1],n('R25').y+.3);
  assert.deepEqual(r('R25','M1').points.at(-1),n('M1').points[0]);
  assert.deepEqual(n('M1').points.at(-1),r('M1','R27').points[0]);
  assert.deepEqual(FLOORS,[-3,-2,-1,...Array.from({length:50},(_,i)=>i+1)]);
  assert.equal(r('U3','U1').kind,'捷徑');assert(r('U3','U1').back);
  for(const [id,f] of [['U2b',46],['U4b',48],['U6b',49]]){assert.equal(n(id).level,f);assert.equal(n(id).y,m.floorY.get(f)-1.8);}
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
