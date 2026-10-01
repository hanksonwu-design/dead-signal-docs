import test from 'node:test';
import assert from 'node:assert/strict';
import data from './data.js';
import {layout,offsets,routePoints} from './spatial.js';
import {orthogonalize} from './sandbox-routes.js';
import {clipRouteToHeight} from './floor-route-view.js';
import {transitions,transitionPath,transitionViews} from './transition-spaces.js';

function heights(actual){
 const used=new Set(Object.values(layout).map(v=>v[2])),map=new Map(),floors=[-3,-2,-1,...Array.from({length:43},(_,i)=>i+1)];let y=0;
 floors.forEach((f,i)=>{if(i)y+=actual||used.has(floors[i-1])?4.2:.65;map.set(f,y);});return map;
}
function path(t,map){
 const edge=data.edges.find(e=>e.fromId+'-'+e.toId===t.id);
 const raw=orthogonalize(routePoints(edge,id=>map.get(layout[id][2])+(offsets[id]||0)),1.6);
 return {edge,raw,points:transitionPath(edge,raw,map)};
}
const onSegment=(p,a,b)=>Math.abs(Math.hypot(...p.map((v,i)=>v-a[i]))+Math.hypot(...p.map((v,i)=>v-b[i]))-Math.hypot(...b.map((v,i)=>v-a[i])))<1e-6;
test('all twelve stations stay on connected passages in both height modes',()=>{
 const snapshot=JSON.stringify(data);
 for(const actual of [false,true])for(const t of transitions){
  const map=heights(actual),{raw,points}=path(t,map),views=transitionViews(t,points,map);
  assert.deepEqual(points[0],raw[0]);assert.deepEqual(points.at(-1),raw.at(-1));
  assert.equal(views.length,t.views.length);
  for(const s of views){assert(s.position.every(Number.isFinite));assert(points.some((b,i)=>i&&onSegment(s.access||s.position,points[i-1],b)),t.id+' station must connect to its route');}
  for(let i=1;i<views.length;i++)assert(Math.hypot(...views[i].position.map((v,j)=>v-views[i-1].position[j]))>1,t.id+' distinct stations');
 }
 assert.equal(JSON.stringify(data),snapshot,'inspection must not alter graph or gates');
});
test('middle platforms match 24F and 36F and survive floor slicing',()=>{
 for(const actual of [false,true])for(const t of transitions.filter(t=>t.views.some(v=>v.floor))){
  const map=heights(actual),{points}=path(t,map),s=transitionViews(t,points,map).find(v=>v.floor);
  assert(s.flat,t.id+' needs a horizontal landing');
  assert(Math.abs(s.position[1]-(map.get(s.floor)+.3))<1e-6,t.id+' landing height');
  const sliced=clipRouteToHeight(points,map.get(s.floor)+.3,map.get(s.floor+1)+.3);
  assert(sliced.some(ps=>ps.some((b,i)=>i&&onSegment(s.access,ps[i-1],b))));
  assert(Math.hypot(...s.position.map((v,i)=>v-s.access[i]))>=3,'side bay clears stacked flights');
 }
});
test('custom paths retain all coordinates and relocated stations follow them',()=>{
 const map=heights(true),t=transitions.find(t=>t.id==='R11-R12'),{edge,points}=path(t,map);
 const moved=points.map(p=>[p[0]+40,p[1]+7,p[2]-20]),snapshot=JSON.stringify(moved);
 assert.deepEqual(transitionPath({...edge,route:{mode:'stairs'}},moved,map),moved);
 for(const s of transitionViews(t,moved,map))assert(moved.some((b,i)=>i&&onSegment(s.access||s.position,moved[i-1],b)));
 assert.equal(JSON.stringify(moved),snapshot);
});
test('unrelated or reconnected edges receive no authored middle landing',()=>{
 const map=heights(true),points=[[0,0,0],[0,50,20]];
 assert.deepEqual(transitionPath({fromId:'R11',toId:'R13'},points,map),points);
 assert.deepEqual(transitionViews(transitions[0],[],map),[]);
});
