import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {SCALE,stairFlight,metricStairPath,addScaleReference,referenceSpot} from './human-scale.js';
import {dressCurrentRoom} from './current-props.js';
import {buildCurrentModel,FLOORS} from './current-spatial.js';
const graph=JSON.parse(readFileSync(new URL('../scene_graph.json',import.meta.url)));
const flow=JSON.parse(readFileSync(new URL('../scene-flow.json',import.meta.url)));
const api={THREE,material:(color,opacity=1)=>new THREE.MeshBasicMaterial({color,opacity}),
 box(w,h,d,x,y,z,material,parent){const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),material);m.position.set(x,y,z);parent.add(m);return m;},
 line(points,color,parent){const l=new THREE.Line(new THREE.BufferGeometry().setFromPoints(points.map(p=>new THREE.Vector3(...p))),new THREE.LineBasicMaterial({color}));parent.add(l);return l;}
};
const close=(a,b,eps=1e-5)=>assert(Math.abs(a-b)<eps,`${a} != ${b}`);
const size=group=>new THREE.Box3().setFromObject(group).getSize(new THREE.Vector3());

test('metre floor spacing and canonical landings survive both viewing modes',()=>{
 const model=buildCurrentModel(graph,flow,true);
 for(let i=1;i<FLOORS.length;i++)close(model.floorY.get(FLOORS[i])-model.floorY.get(FLOORS[i-1]),3.2);
 for(const actual of [false,true]){
  const m=buildCurrentModel(graph,flow,actual);
  assert.equal(m.nodes.length,48);assert.equal(m.routes.length,56);assert.equal(m.shots.length,72);
  for(const r of m.routes.filter(r=>r.spatial))for(let i=1;i<r.points.length;i++){
   const f=stairFlight(r.points[i-1],r.points[i]);
   if(f.rise>.1&&f.run>.05){assert(f.riser<=SCALE.stairRise+1e-6,r.id);assert(f.going>=SCALE.stairGoing-1e-6,r.id);}
  }
 }
});
test('folded stairs retain endpoints, flat passages and lift shafts without entering the bridge gap',()=>{
 for(const points of [[[7,0,6],[7,3.2,3]],[[-7,3.2,3],[-7,0,6]]]){
  const expanded=metricStairPath(points,[[-61,-7],[7,61]]);
  assert.deepEqual(expanded[0],points[0]);assert.deepEqual(expanded.at(-1),points.at(-1));
  assert(expanded.length>2);assert(expanded.every(p=>Math.abs(p[0])>=7));
 }
 for(const points of [[[0,0,0],[0,0,6]],[[0,0,0],[0,3.2,0]]])assert.deepEqual(metricStairPath(points),points);
});
test('human reference is 1.70 m tall and grounded, with a metre-long floor ruler',()=>{
 const g=addScaleReference(new THREE.Group(),api),bounds=new THREE.Box3().setFromObject(g);
 close(bounds.min.y,0);close(bounds.max.y,SCALE.personHeight);close(bounds.max.x-bounds.min.x,1);
 assert.equal(g.userData.referenceHeight,1.7);
});
test('all room fixtures have finite geometry, stay inside their room and do not sink through the floor',()=>{
 for(const n of buildCurrentModel(graph,flow).nodes.filter(n=>n.spatial&&n.id!=='M1')){
  const g=new THREE.Group();dressCurrentRoom(n,g,{...api,y:n.y+SCALE.floorSurface});
  assert(g.children.length,n.id);
  const bounds=new THREE.Box3().setFromObject(g);
  assert(bounds.min.y>=n.y+SCALE.floorSurface-1e-5,n.id+' below floor');
  assert(bounds.min.x>=n.x-n.w/2-.01&&bounds.max.x<=n.x+n.w/2+.01,n.id+' width');
  assert(bounds.min.z>=n.z-n.d/2-.01&&bounds.max.z<=n.z+n.d/2+.01,n.id+' depth');
  g.traverse(o=>{if(o.geometry)assert([...o.geometry.attributes.position.array].every(Number.isFinite),n.id);});
  const obstacles=g.children.filter(o=>o.userData.fixture!=='pipe').map(o=>{const b=new THREE.Box3().setFromObject(o);return {minX:b.min.x,maxX:b.max.x,minZ:b.min.z,maxZ:b.max.z};});
  const spot=referenceSpot(n,obstacles);assert(spot,n.id+' reference placement');
  assert(obstacles.every(b=>spot[0]+.55<b.minX||spot[0]-.55>b.maxX||spot[1]+.55<b.minZ||spot[1]-.55>b.maxZ),n.id+' reference collision');
 }
});
test('beds, desks, chairs, racks and carts have human-scale dimensions rather than room-scale proxies',()=>{
 const n=id=>buildCurrentModel(graph,flow).nodes.find(n=>n.id===id);
 const fixtures=id=>{const g=new THREE.Group(),room=n(id);dressCurrentRoom(room,g,{...api,y:0});return g.children;};
 const bed=fixtures('R3').find(o=>o.userData.fixture==='bunk-bed');
 const bedSize=size(bed);assert(bedSize.x<1.1&&bedSize.z<2.2);close(bedSize.y,1.9);
 const desk=fixtures('R7').find(o=>o.userData.fixture==='table');close(desk.userData.dimensions.height,.75);close(size(desk).x,1.4);
 const chair=fixtures('R7').find(o=>o.userData.fixture==='chair');close(size(chair).x,.45);assert(size(chair).y<1);
 const rack=fixtures('R16').find(o=>o.userData.fixture==='server-rack');close(size(rack).x,.6);close(size(rack).y,2);assert(size(rack).z<1.1);
 const trolley=fixtures('R2').find(o=>o.userData.fixture==='trolley');close(size(trolley).x,.8);assert(size(trolley).y<.9);
});
