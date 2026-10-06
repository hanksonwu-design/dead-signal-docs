import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {searchScenes,sceneArtwork,connectedRoutes} from './scene-workspace.js';
import redirect from '../scene-redirect.js';
import overview from '../scene-overview.js';
const graph=JSON.parse(readFileSync(new URL('../scene_graph.json',import.meta.url)));
const flow=JSON.parse(readFileSync(new URL('../scene-flow.json',import.meta.url)));

test('scene search covers parts, chapters, secondary scenes, goals and collection hooks',()=>{
 assert.equal(searchScenes(graph,flow).length,48);
 for(const part of [1,2])assert.deepEqual(searchScenes(graph,flow,{part}).map(n=>n.id),graph.nodes.filter(n=>n.part===part).map(n=>n.id));
 assert.deepEqual(searchScenes(graph,flow,{query:'SQ-S'}).map(n=>n.id),['R7','R8','R9']);
 for(const s of flow.subscenes){const found=searchScenes(graph,flow,{query:s.id}).find(n=>n.id===s.id);assert.equal(found?.node,s.node);assert.equal(found?.route,s.route);}
 assert(searchScenes(graph,flow,{query:'老周 17 秒留言'}).some(n=>n.id==='R7'));
 assert.equal(searchScenes(graph,flow,{query:'no-such-scene'}).length,0);
 for(const entry of searchScenes(graph,flow,{floor:36}))assert(entry.floor.levels.includes(36));
});
test('all 523 artwork records are available, including non-marker assets and secondary details',()=>{
 const actual=new Set(flow.nodes.flatMap(n=>sceneArtwork(flow,n).map(i=>i.id)));
 assert.deepEqual([...actual].sort(),Object.keys(flow.images).sort());
 for(const s of flow.subscenes)assert.deepEqual(sceneArtwork(flow,s).map(i=>i.id),[...new Set([s.image,...s.details])] );
});
test('ending P1 uses the R33-V02 playback picture without ordinary P1 exploration requirements',()=>{
 const p1=flow.nodes.find(n=>n.id==='P1'),route=flow.routes.find(r=>r.id==='R33-P1-43');
 assert.deepEqual(sceneArtwork(flow,p1,route).map(i=>i.id),['R33-V02']);
 assert(sceneArtwork(flow,p1).some(i=>i.id==='P1-V01'));
});
test('all route comparisons preserve authored incoming, outgoing and conditional return semantics',()=>{
 for(const n of graph.nodes){
  const connections=connectedRoutes(flow.routes,n.id);
  assert.equal(connections.length,flow.routes.filter(r=>r.from===n.id||r.to===n.id).length);
  for(const r of connections){assert.equal(r.canReturn,!!r.back);assert.equal(r.relation,r.from===r.to?'原場景回返':r.from===n.id?'出口':'入口');}
 }
});
test('legacy scene links redirect under local and Pages bases without losing selection or opening external URLs',()=>{
 const hash='#scene=R24&route=R24-R25-33&shot=T-R24-R25-01&direction=return&marker=x';
 for(const base of ['http://127.0.0.1:8768/','https://hanksonwu-design.github.io/dead-signal-docs/']){
  assert.equal(redirect.target(base+hash),base+'building/'+hash);
  assert.equal(redirect.target(base+'index.html'+hash),base+'building/'+hash);
  assert.equal(redirect.target(base+'#doc=README.md'),null);
  assert.equal(redirect.target(base+'#doc=README.md&scene=R2'),null);
 }
});
test('shared overview retains 48 rooms, 72 secondary scenes and every authored route',()=>{
 const result=overview.layout(graph,flow,graph.nodes.map(n=>n.id));
 assert.equal(result.nodes.filter(n=>n.type==='main').length,48);
 assert.equal(result.nodes.filter(n=>n.type==='subscene').length,72);
 assert.equal(new Set(result.segments.map(s=>s.route)).size,56);
});
