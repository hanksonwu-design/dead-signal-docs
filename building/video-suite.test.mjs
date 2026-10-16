import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {SCALE} from './human-scale.js';
import {dressCurrentRoom} from './current-props.js';
import {dressRoom} from './story-props.js';
import {VIDEO_SUITE,videoSuiteMarkerLocal} from './video-suite.js';
import {buildCurrentModel} from './current-spatial.js';
import {markerPosition} from './model-markers.js';
import {layout,routes} from './spatial.js';

const graph=JSON.parse(readFileSync(new URL('../scene_graph.json',import.meta.url)));
const flow=JSON.parse(readFileSync(new URL('../scene-flow.json',import.meta.url)));
const api={THREE,material:(color,opacity=1)=>new THREE.MeshBasicMaterial({color,opacity}),
 box(w,h,d,x,y,z,material,parent){const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),material);mesh.position.set(x,y,z);parent.add(mesh);return mesh;},
 line(points,color,parent){const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints(points.map(p=>new THREE.Vector3(...p))),new THREE.LineBasicMaterial({color}));parent.add(line);return line;}
};
const room={id:'R8',x:0,z:0,w:14,d:12};
const dressed=draw=>{const g=new THREE.Group();draw(room,g,{...api,y:0});return g;};
const bounds=g=>new THREE.Box3().setFromObject(g);
const close=(a,b)=>assert(Math.abs(a-b)<1e-5,`${a} != ${b}`);

test('both viewers render the same four private single-worker bays with distinct access',()=>{
 const current=dressed(dressCurrentRoom),sandbox=dressed(dressRoom);
 const signature=g=>g.children.map(c=>({fixture:c.userData.fixture,data:c.userData,
  min:bounds(c).min.toArray(),max:bounds(c).max.toArray()}));
 assert.deepEqual(signature(current),signature(sandbox));
 assert.deepEqual(current.userData.videoSuite.rooms.map(r=>[r.access,r.occupancyLimit]),
  [['full',1],['short',1],['threshold',1],['closed',1]]);
 assert.equal(current.children.filter(c=>c.userData.fixture==='video-workstation').length,3);
 assert.equal(current.children.filter(c=>c.userData.fixture==='video-closed-door').length,1);
 assert.equal(current.children.filter(c=>c.userData.fixture==='video-out-of-service-barrier').length,1);
 assert(!current.children.some(c=>/bed/.test(c.userData.fixture||'')));
 for(const wall of current.children.filter(c=>c.userData.fixture==='video-privacy-wall')){
  close(bounds(wall).min.y,0);close(bounds(wall).max.y,SCALE.wallHeight);
 }
 for(const x of [-3.5,0,3.5]){
  const wall=current.children.find(c=>c.userData.fixture==='video-privacy-wall'&&Math.abs(c.position.x-x)<1e-5&&bounds(c).getSize(new THREE.Vector3()).z>5);
  assert(wall,`full-height side partition at ${x}`);close(bounds(wall).min.z,-6);close(bounds(wall).max.z,VIDEO_SUITE.roomFront);
 }
});

test('all three existing exterior doors connect through shared space without entering a work bay',()=>{
 const g=dressed(dressCurrentRoom),obstacles=g.children.map(bounds);
 const step=.1,clearance=.25,key=(x,z)=>`${x},${z}`;
 const valid=(ix,iz)=>{
  const x=ix*step,z=iz*step;
  if(x<-7+clearance||x>7-clearance||z<VIDEO_SUITE.roomFront+.2||z>6-clearance)return false;
  return !obstacles.some(b=>x+clearance>b.min.x+1e-5&&x-clearance<b.max.x-1e-5&&z+clearance>b.min.z+1e-5&&z-clearance<b.max.z-1e-5);
 };
 const start=[-66,0],queue=[start],seen=new Set([key(...start)]);
 for(let i=0;i<queue.length;i++)for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]){
  const [x,z]=[queue[i][0]+dx,queue[i][1]+dz],k=key(x,z);
  if(!seen.has(k)&&valid(x,z)){seen.add(k);queue.push([x,z]);}
 }
 for(const [name,[x,z]] of Object.entries({R7:[-66,0],R10:[-66,50],R9:[0,56],preparation:[38,34]}))assert(seen.has(key(x,z)),name);
 for(const bay of VIDEO_SUITE.rooms)assert(seen.has(key(Math.round(bay.doorX/step),0)),bay.name+' doorway approach');
 // The closed and disabled rooms have physical threshold barriers; neither is a through route.
 for(const fixture of ['video-closed-door','video-out-of-service-barrier']){
  const barrier=g.children.find(c=>c.userData.fixture===fixture),b=bounds(barrier);
  assert(b.min.y<.1&&b.max.y>.9&&b.min.z<VIDEO_SUITE.roomFront&&b.max.z>VIDEO_SUITE.roomFront);
 }
});

test('R8 keeps its graph endpoints, dimensions and R9 scenery when the private bays are added',()=>{
 assert.deepEqual(layout.R8,[14,-12,15,14,12]);
 assert.deepEqual(routes['R7-R8'].at(-1),[7,-12,1]);
 assert.deepEqual(routes['R8-R9'][0],[14,-6,0]);
 assert.deepEqual(routes['R8-R10'][0],[7,-7,0]);
 for(const actual of [false,true]){
  const model=buildCurrentModel(graph,flow,actual),n=model.nodes.find(n=>n.id==='R8');
  const linked=model.routes.filter(r=>r.spatial&&(r.from==='R8'||r.to==='R8'));
  assert.equal(linked.length,3);
  for(const r of linked){
   const p=r.from==='R8'?r.points[0]:r.points.at(-1),other=r.from==='R8'?r.to:r.from;
   const expected=VIDEO_SUITE.exits[other];
   close(p[0]-n.x,expected[0]);close(p[2]-n.z,expected[1]);
  }
 }
 const r9=new THREE.Group();dressCurrentRoom({...room,id:'R9'},r9,{...api,y:0});
 assert(r9.children.some(c=>c.userData.fixture==='bed'),'R9 keeps the prop bed in its photography set');
});

test('authored R8 source pins stay in the explored work room or the common preparation area',()=>{
 const model=buildCurrentModel(graph,flow),n=model.nodes.find(n=>n.id==='R8');
 for(const image of ['R8-C01','R8-C02','R8-C03','R8-C04','R8-C05','R8-C06','R8-V04','R8-V05','R8-V06','R8-D01','R8-D02','R8-D03','R8-D04','R8-D05','R8-F01','R8-F02']){
  const [x,z]=videoSuiteMarkerLocal(image),p=markerPosition({node:'R8',image,offset:[.4,.4]},model);
  close(p[0],n.x+x);close(p[2],n.z+z);
  if(['R8-C05','R8-V04'].includes(image))assert(x>1&&z>1,'preparation pin');
  else if(['R8-C06','R8-V06'].includes(image))assert(x>-3.5&&x<0&&z>-6&&z<VIDEO_SUITE.roomFront,image+' stays in the short exploration room');
  else assert(x>-7&&x<-3.5&&z>-6&&z<VIDEO_SUITE.roomFront,image+' stays in the full exploration room');
 }
});
