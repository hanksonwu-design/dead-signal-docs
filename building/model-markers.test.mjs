import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {MAIN_MARKERS,MARKER_CATEGORIES} from './marker-definitions.js';
import {markerPosition,markerInContext,showContentMarkers} from './model-markers.js';
import {buildCurrentModel} from './current-spatial.js';
import {buildModelMarkers,writeModelMarkers} from '../tools/build-model-markers.mjs';
import {collectSceneImages} from '../tools/build-scene-images.mjs';
import {parseMaster} from '../tools/sync-canonical.mjs';
const read=file=>JSON.parse(readFileSync(new URL(file,import.meta.url),'utf8'));
const graph=read('../scene_graph.json'),flow=read('../scene-flow.json');
const rows=collectSceneImages(graph).rows,master=parseMaster();
const build=definitions=>buildModelMarkers(graph,flow,rows,master,definitions);
const data=build().markers;

test('all scene markers resolve to current canonical assets and sources without changing topology',()=>{
 const before=JSON.stringify({graph,flow});
 assert.equal(new Set(data.map(m=>m.node)).size,48);
 assert.deepEqual([...new Set(data.map(m=>m.category))].sort(),Object.keys(MARKER_CATEGORIES).sort());
 for(const m of data){
  assert.equal(flow.images[m.image].node,m.node);
  assert.equal(master.anchorFiles.get(m.heading),m.source);
  assert.equal(m.content,flow.images[m.image].content);
  if(m.shot)assert(flow.subscenes.some(s=>s.id===m.shot&&s.node===m.node));
 }
 assert.deepEqual(data.filter(m=>m.category==='boss').map(m=>m.node),['R11','R26','R32']);
 assert.equal(JSON.stringify({graph,flow}),before);
 writeModelMarkers(true);
});

test('canonical exploration operations and recovery remain intact, including elevator horror',()=>{
 for(const s of flow.subscenes.filter(s=>s.play)){
  const m=data.find(m=>m.shot===s.id&&m.category==='puzzle');assert.deepEqual(m.play,s.play);
 }
 assert.equal(data.filter(m=>m.shot&&m.category==='horror').length,2);
 assert(data.some(m=>m.node==='U2b'&&m.category==='horror'));
 assert(data.some(m=>m.node==='U5'&&m.category==='horror'));
});

test('invalid image, category, ownership, boss classification, coverage and duplicates fail the build',()=>{
 for(const mutate of [d=>d.R2[0][1]='missing',d=>d.R2[0][0]='unknown',d=>d.R2[0][0]='boss',d=>delete d.P0,d=>d.R2.push(d.R2[0])]){
  const definitions=structuredClone(MAIN_MARKERS);mutate(definitions);assert.throws(()=>build(definitions));
 }
 const wrong=structuredClone(flow);wrong.images['R2-D01'].node='R3';
 assert.throws(()=>buildModelMarkers(graph,wrong,rows,master),/owner/);
 const badMaster={...master,anchorFiles:new Map(master.anchorFiles)};badMaster.anchorFiles.delete(data[0].heading);
 assert.throws(()=>buildModelMarkers(graph,flow,rows,badMaster),/source anchor/);
});

test('schematic anchors rebuild with floor spacing, stay within rooms and exclude nonphysical endings',()=>{
 for(const actual of [false,true]){
  const model=buildCurrentModel(graph,flow,actual);
  for(const m of data){
   const p=markerPosition(m,model),n=model.nodes.find(n=>n.id===m.node);
   if(!n.spatial){assert.equal(p,null);continue;}
   assert(p.every(Number.isFinite));
   if(!m.shot&&n.id!=='M1'){assert(Math.abs(p[0]-n.x)<=n.w/2);assert(Math.abs(p[2]-n.z)<=n.d/2);assert.equal(p[1],n.y+1.2);}
  }
 }
});

test('marker scale uses hysteresis and selection context excludes adjacent rooms and transitions',()=>{
 assert.equal(showContentMarkers(7.5,false),false);assert.equal(showContentMarkers(8,false),true);
 assert.equal(showContentMarkers(7.5,true),true);assert.equal(showContentMarkers(6.9,true),false);
 const m=data.find(m=>m.shot);assert(markerInContext(m,m.node,m.shot));
 assert(!markerInContext(m,m.node,''));assert(!markerInContext(m,'POST',m.shot));
});
