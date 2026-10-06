import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {ROOT,parseMaster} from './sync-canonical.mjs';
import {collectSceneImages} from './build-scene-images.mjs';
import {MAIN_MARKERS,MARKER_CATEGORIES,MARKER_TIMINGS,HORROR_TIMING,TRANSITION_HORROR} from '../building/marker-definitions.js';

export function buildModelMarkers(graph,flow,rows,master,definitions=MAIN_MARKERS){
 const markers=[],seen=new Set(),images=new Map(rows.map(r=>[r.id,r]));
 const offsets=[[-.28,.27],[.29,.21],[-.26,-.29],[.27,-.28],[0,.35],[.35,0],[-.35,0],[0,-.35]];
 function add(node,shot,category,image,title,index,play=null,timing=''){
  const row=images.get(image),asset=flow.images[image];
  assert(row&&asset,`Unknown marker image: ${image}`);
  assert(row.node===node&&asset.node===node,`Marker image owner: ${image}`);
  assert(MARKER_CATEGORIES[category],`Unknown marker category: ${category}`);
  assert(title?.trim(),`Missing marker title: ${image}`);
  assert(category!=='boss'||['R26','R32'].includes(node),`Not a boss encounter: ${node}`);
  if(['horror','boss'].includes(category)){
   timing||=HORROR_TIMING[image];
   assert(MARKER_TIMINGS.includes(timing),`Missing horror timing: ${image}`);
  }
  const source=row.source.match(/^\[[^\]]+\]\(([^#]*)#([^)]+)\)$/);
  assert(source,`Marker source link: ${image}`);
  const sourceFile=source[1]?path.posix.normalize(path.posix.join(path.posix.dirname(asset.spec),source[1])):asset.spec;
  assert.equal(master.anchorFiles.get(source[2]),sourceFile,`Marker source anchor: ${image}`);
  assert.equal(master.anchorFiles.get(asset.heading),asset.spec,`Marker spec anchor: ${image}`);
  const id=`${image}-${category}`;assert(!seen.has(id),`Duplicate marker: ${id}`);seen.add(id);
  markers.push({id,node,shot,category,title,image,content:asset.content,requirements:asset.requirements,
   source:sourceFile,heading:source[2],spec:asset.spec,specHeading:asset.heading,
   offset:shot?(category==='horror'?[-.8,-1.3]:[.8,0]):offsets[index%offsets.length],play,timing});
 }
 assert.deepEqual(Object.keys(definitions).sort(),graph.nodes.map(n=>n.id).sort(),'Marker scene coverage');
 for(const n of graph.nodes)for(const [i,[category,suffix,title,timing]] of definitions[n.id].entries())add(n.id,'',category,`${n.id}-${suffix}`,title,i,null,timing);
 for(const s of flow.subscenes){
  if(!s.play&&!s.details.length)continue;
  const image=s.play?s.image:s.details[0];
  add(s.node,s.id,s.play?'puzzle':'item',image,s.play?'辨路與開通':`${s.name}近看`,0,s.play);
 }
 for(const [id,title] of TRANSITION_HORROR){
  const s=flow.subscenes.find(s=>s.id===id);assert(s,`Missing horror subscene: ${id}`);
  add(s.node,s.id,'horror',s.image,title,0,null,'主線時機');
 }
 return {version:1,markers};
}

export function modelMarkerOutput(){
 const graph=JSON.parse(readFileSync(path.join(ROOT,'scene_graph.json'),'utf8'));
 const flow=JSON.parse(readFileSync(path.join(ROOT,'scene-flow.json'),'utf8'));
 return JSON.stringify(buildModelMarkers(graph,flow,collectSceneImages(graph).rows,parseMaster()),null,2)+'\n';
}
export function writeModelMarkers(check=false){
 const file=path.join(ROOT,'building/scene-markers.json'),output=modelMarkerOutput();
 if(check)assert.equal(readFileSync(file,'utf8'),output,'Stale model markers; rebuild the model');
 else writeFileSync(file,output);
 return JSON.parse(output).markers.length;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))console.log(`${writeModelMarkers(process.argv.includes('--check'))} canonical model markers verified.`);
