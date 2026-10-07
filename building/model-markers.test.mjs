import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {MAIN_MARKERS,MARKER_CATEGORIES,MARKER_TIMINGS,TRANSITION_HORROR} from './marker-definitions.js';
import {FRAGMENT_IMAGE_FORMS,FRAGMENT_SOURCE_OPTIONS,FRAGMENT_RECORD_IMAGES,NON_FRAGMENT_RECORDS} from './fragment-sources.js';
import {FRAGMENT_FORMS,fragmentLabel,readingCueGroups} from './fragment-forms.js';
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

test('fragment forms follow the canonical four forms and explicit source index, not image prefixes',()=>{
 const appendix=readFileSync(new URL('../docs/09_劇本/09-15_正式劇本_共用附錄.md',import.meta.url),'utf8');
 const block=appendix.split('<!-- import:s-0405-6:begin -->')[1].split('<!-- import:s-0405-6:end -->')[0];
 assert.deepEqual([...block.matchAll(/\| \*\*([^*]+)\*\* \|/g)].map(m=>m[1]),FRAGMENT_FORMS);
 assert.deepEqual([...new Set(data.flatMap(m=>m.fragmentForms))].sort(),[...FRAGMENT_FORMS].sort());
 for(const m of data)assert.deepEqual(m.fragmentForms,m.category===(FRAGMENT_SOURCE_OPTIONS[m.image]?.category||'item')?FRAGMENT_IMAGE_FORMS[m.image]||[]:[],m.id);
 for(const [image,forms] of Object.entries({'R2-D01':['物證'],'R3-C02':['物證'],'R2-D03':['聲證'],'R19-F01':['影證'],'R29-D01':['文證'],'R24-D04':['影證','文證'],'R24-C01':['聲證'],'R22-C05':['影證'],'R8-D05':['聲證','文證'],'R32-D01':['影證']})){
  assert.deepEqual(data.find(m=>m.image===image&&m.fragmentForms.length).fragmentForms,forms);
 }
 for(const image of ['P0-C04','P1-C05','R1-C03','R18-V02','R20-D01','R26-V01','U5-C01','R32-V01','POST-V01']){
  assert.deepEqual(data.find(m=>m.image===image).fragmentForms,[],`${image} is not a fragment source`);
 }
});

test('fragment labels have deterministic parentheses, merge duplicate forms and preserve ordinary labels',()=>{
 assert.equal(fragmentLabel('全家福',['物證']),'全家福（物證）');
 assert.equal(fragmentLabel('錄音',['聲證']),'錄音（聲證）');
 assert.equal(fragmentLabel('靜格',['影證']),'靜格（影證）');
 assert.equal(fragmentLabel('簽核',['文證']),'簽核（文證）');
 assert.equal(fragmentLabel('快取',['文證','影證','影證']),'快取（影證／文證）');
 assert.equal(fragmentLabel('機關',[]),'機關');
 assert.equal(fragmentLabel('機關'),'機關');
});

test('fragment mapping fails for invalid, duplicate or unknown source classifications',()=>{
 for(const mutate of [d=>d['R2-D01']=['未知'],d=>d['R2-D01']=[],d=>d['R2-D01']=['物證','物證'],d=>d['R2-D01']='物證',d=>d['missing']=['物證'],d=>delete d['R2-D03']]){
  const forms=structuredClone(FRAGMENT_IMAGE_FORMS);mutate(forms);
  assert.throws(()=>buildModelMarkers(graph,flow,rows,master,MAIN_MARKERS,forms),/fragment/i);
 }
});

test('evidence inventory coverage is complete without reclassifying action records as media',()=>{
 const inventory=readFileSync(new URL('../docs/08_製作管理/08-13_劇情節點與場景道具總表.md',import.meta.url),'utf8');
 const ids=[...inventory.matchAll(/^\| ((?:E\d-\d\d(?:-[A-D])?|M6-01|S6-0[123])) \|/gm)].map(m=>m[1]);
 const indexed=[...Object.keys(FRAGMENT_RECORD_IMAGES),...Object.keys(NON_FRAGMENT_RECORDS)];
 assert.equal(ids.length,66);assert.equal(new Set(indexed).size,indexed.length);
 assert.deepEqual(indexed.sort(),ids.sort());
 for(const [id,images] of Object.entries(FRAGMENT_RECORD_IMAGES)){
  assert(images.length,id);
  for(const image of images)assert(data.some(m=>m.image===image&&m.fragmentForms.length),`${id}: ${image}`);
 }
 for(const image of Object.keys(FRAGMENT_IMAGE_FORMS))assert.equal(data.filter(m=>m.image===image&&m.fragmentForms.length).length,1,image);
 for(const image of ['R8-D01','R16-D01','R16-D03','R20-D03','R21-C01','R26-D02','R26-D03','R32-D01','R32-D02','R32-F01','R15-C05']){
  assert(data.some(m=>m.image===image&&m.fragmentForms.length),image);
 }
 assert.deepEqual(FRAGMENT_RECORD_IMAGES['E1-12'],['R1-C04']);
 assert.deepEqual(FRAGMENT_RECORD_IMAGES['E2-04'],['R16-D01']);
 assert.deepEqual(FRAGMENT_RECORD_IMAGES['E2-05'],['R16-D02']);
 assert.deepEqual(FRAGMENT_RECORD_IMAGES['E2-10'],['R16-D05']);
 assert.deepEqual(FRAGMENT_IMAGE_FORMS['R7-C02'],['影證','文證']);
 assert.deepEqual(FRAGMENT_IMAGE_FORMS['R9-C02'],['聲證','文證']);
 assert.deepEqual(FRAGMENT_IMAGE_FORMS['R13-D04'],['文證']);
 assert.match(inventory,/\| E1-12 \| R1 舊出口震損門框、焊珠與裂口/);
});

test('source markers are independent of curated scare markers, comparison boards and alternate transcripts',()=>{
 for(const m of data.filter(m=>['horror','boss'].includes(m.category)))assert.deepEqual(m.fragmentForms,[],m.id);
 for(const image of ['R17-D10','R23-D02','R24-D02','R25-D02','R28-D02','R29-D02','R32-D09','R8-D04','R19-D01','R31-D06']){
  assert(!data.some(m=>m.image===image&&m.fragmentForms.length),image);
 }
 const definitions=structuredClone(MAIN_MARKERS);definitions.R2=definitions.R2.filter(m=>m[1]!=='D01');
 assert.equal(build(definitions).markers.filter(m=>m.image==='R2-D01'&&m.fragmentForms.length).length,1);
 const options=structuredClone(FRAGMENT_SOURCE_OPTIONS);options['R2-D01']={category:'boss'};
 assert.throws(()=>buildModelMarkers(graph,flow,rows,master,MAIN_MARKERS,FRAGMENT_IMAGE_FORMS,options),/fragment category/);
});

test('same-paragraph badges keep different fragment forms and ordinary actions separate',()=>{
 const items=[{id:'a',category:'item',fragmentForms:['物證']},{id:'b',category:'item',fragmentForms:['文證']},{id:'c',category:'item',fragmentForms:[]},{id:'d',category:'item',fragmentForms:['物證']}];
 const groups=readingCueGroups(items,MARKER_CATEGORIES);
 assert.deepEqual(groups.map(g=>({forms:g.forms,ids:g.matches.map(m=>m.id)})),[
  {forms:['物證'],ids:['a','d']},{forms:['文證'],ids:['b']},{forms:[],ids:['c']}
 ]);
});

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
 assert.deepEqual(data.filter(m=>m.category==='boss').map(m=>m.node),['R26','R32']);
 assert.equal(JSON.stringify({graph,flow}),before);
 writeModelMarkers(true);
});

test('canonical exploration operations and recovery remain intact, including elevator horror',()=>{
 for(const s of flow.subscenes.filter(s=>s.play)){
  const m=data.find(m=>m.shot===s.id&&m.category==='puzzle');assert.deepEqual(m.play,s.play);
 }
 assert.equal(data.filter(m=>m.shot&&m.category==='horror').length,TRANSITION_HORROR.length);
 assert(data.some(m=>m.node==='U2b'&&m.category==='horror'));
 assert(data.some(m=>m.node==='U5'&&m.category==='horror'));
});

test('horror timing distinguishes optional, conditional and mainline beats without inventing bosses',()=>{
 for(const m of data.filter(m=>['horror','boss'].includes(m.category)))assert(MARKER_TIMINGS.includes(m.timing),m.id);
 assert.equal(data.find(m=>m.image==='R11-V01').category,'horror');
 assert.equal(data.find(m=>m.id==='R25-C03-horror').timing,'主線時機');
 assert.equal(data.find(m=>m.id==='R24-C02-horror').timing,'選填查看');
 assert.equal(data.find(m=>m.id==='P1-V01-horror').timing,'條件出現');
 for(const image of ['T-R2-R3-01','R23-V01','T-R24-R25-01','U6-V01','U6b-V01','R7-V01','U2-V01']){
  assert.equal(data.find(m=>m.id===`${image}-horror`).timing,'主線時機');
 }
 for(let act=0;act<10;act++)assert(data.some(m=>['horror','boss'].includes(m.category)&&graph.nodes.find(n=>n.id===m.node).act===act),`Act ${act}`);
 const invalid=structuredClone(MAIN_MARKERS);invalid.R25.at(-1)[3]='always';
 assert.throws(()=>build(invalid),/horror timing/);
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
