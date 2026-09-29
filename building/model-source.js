import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import data from './data.js';
import {layout,offsets,rationale,routePoints} from './spatial.js';
import {dressRoom,dressBuilding,sharedGlassBoundary} from './story-props.js';
import {createEditorStore,adaptRoutePoints} from './editor-state.js';
import {makeRoutePoints,orthogonalize,portalPosition} from './sandbox-routes.js';
import {createSandboxUI} from './sandbox-ui.js';
import {createMouseEditor} from './mouse-editor.js';
import {clipRouteToHeight} from './floor-route-view.js';
import {createSceneFileUI} from './scene-files.js';
import {makeLandingLinkPoints,resolveLinkEndpoint} from './landing-links.js';
import {createStairDrag3D} from './stair-drag-3d.js';
import {createObjectEdit3D} from './object-edit-3d.js';
import {createRoomCreate3D} from './room-create-3d.js';

const $=id=>document.getElementById(id);
const groups=[
 {id:'all',title:'全棟概覽',range:'B3 → 43F',floors:[-3,43]},
 {id:'basement',title:'序幕 · 地底管線',range:'B3–B1',floors:[-3,-1]},
 {id:'lobby',title:'第一幕 · 入口大廳',range:'1F',floors:[1,1]},
 {id:'residence',title:'第一幕 · 住宅工場',range:'2F–7F',floors:[2,7]},
 {id:'production',title:'第二幕 · 中層產線',range:'15F–20F',floors:[15,20]},
 {id:'technical',title:'第三幕 · 技術後勤',range:'28F–31F',floors:[28,31]},
 {id:'office',title:'第三幕 · 管理辦公',range:'32F',floors:[32,32]},
 {id:'correction',title:'第四幕 · 校正前段',range:'41F–42F',floors:[41,42]},
];

const colors={0:0x7facc5,1:0x98bca6,2:0x80bac4,3:0x93a9c9,4:0xc0a29f};
const edgeColor=e=>e.kind==='捷徑'?0x91c789:e.kind==='誤導'?0xbd90df:['分岔','子節點'].includes(e.kind)?0x78b9c8:0xeab275;
const floorName=f=>f<0?`B${Math.abs(f)}`:`${f}F`;
const sourceUrl=id=>data.spatial[id]?'../#'+new URLSearchParams({doc:data.spatial[id].source,heading:data.spatial[id].heading}):'';
const roomCaption=n=>n.custom?floorName(n.floor)+' · 自訂房間':floorName(n.floor)+(editor.isChanged(n.id)?' 自訂配置':['R1','R2','R17','P0','P1'].includes(n.id)?'':' 配置提案')+' · 原文 '+groups.find(g=>g.id===n.group).range;
data.nodes.forEach(n=>{[n.x,n.z,n.floor,n.w,n.d]=layout[n.id];n.group=groups.find(g=>g.id!=='all'&&n.floor>=g.floors[0]&&n.floor<=g.floors[1]).id;});
const nodeMap=new Map(data.nodes.map(n=>[n.id,n]));
// Existing upper/lower boundary is an editable route endpoint, not another room.
const exitAnchor={id:'EXIT43',name:'43F 分部門檻',floor:43,x:24,z:22.1,w:3,d:.2,group:'correction',terminal:true};
nodeMap.set(exitAnchor.id,exitAnchor);
const defaultExitRoute={mode:'stairs',shape:'manual',width:1.5,from:{side:'east',u:0},to:{side:'north',u:0},points:[{x:24,z:16,t:0,dy:0},{x:24,z:19,t:0,dy:-.7}]};
data.edges.push({id:'R22-EXIT43',fromId:'R22',toId:'EXIT43',kind:'出口',back:false,gate:'上部與下部的分界。',motion:'下折避梁後沿樓梯上行至 43F 門檻。',returnRule:'出口示意，不新增 R23 房間。',route:defaultExitRoute});
data.platformLinks=[];
const editor=createEditorStore(data.nodes,layout,offsets,data.edges,{terminals:[exitAnchor],platformLinks:data.platformLinks,allowCustomRooms:true});
const originalRooms=new Map(data.nodes.map(n=>[n.id,{...n}]));
// Keep the reference floor elevations stable while rooms move between floors.
// Otherwise moving the last room off a floor collapses it during mouse release.
const structureFloors=new Set(data.nodes.map(n=>n.floor));
let usedFloors=[...new Set(data.nodes.map(n=>n.floor))].sort((a,b)=>a-b);
const floors=Array.from({length:47},(_,i)=>i-3).filter(f=>f!==0);
let state={group:'all',floor:null,selected:'R6',height:'compressed',spread:0,shell:true,special:true,labels:true,view:'iso'};
let scene,camera,renderer,controls,building,structure,roomMeshes=[],tags=[],floorTags=[],edgeObjects=[],platformLinkObjects=[],roomObjects=new Map(),floorY=new Map();
let editing=false,dragMode=false,drag=null;
let sandbox,mouseEditor,stairDrag3D,objectEdit3D,sceneFiles,routeFocus=false,routePreview,routeMarkers=[],pointDrag=null,lastPreviewId=null,portAnchor=null;
let roomCreate,creatingRoom=false;
const host=$('canvas-host');
function box(w,h,d,x,y,z,material,parent){const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),material);mesh.position.set(x,y,z);parent.add(mesh);return mesh;}
function material(color,opacity=1){return new THREE.MeshStandardMaterial({color,roughness:.82,metalness:.08,transparent:opacity<1,opacity,depthWrite:opacity>=1});}
function line(points,color,parent,opacity=1,dashed=false){const geom=new THREE.BufferGeometry().setFromPoints(points.map(p=>new THREE.Vector3(...p)));const mat=dashed?new THREE.LineDashedMaterial({color,dashSize:.65,gapSize:.45,transparent:true,opacity}):new THREE.LineBasicMaterial({color,transparent:true,opacity});const obj=new THREE.Line(geom,mat);if(dashed)obj.computeLineDistances();parent.add(obj);return obj;}
function segment(a,b,width,thickness,mat,parent){const pa=new THREE.Vector3(...a),pb=new THREE.Vector3(...b);const mesh=new THREE.Mesh(new THREE.BoxGeometry(width,thickness,pa.distanceTo(pb)),mat);mesh.position.copy(pa).add(pb).multiplyScalar(.5);mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),pb.sub(pa).normalize());parent.add(mesh);return mesh;}
function arrow(a,b,color,parent,reverse=false){const start=new THREE.Vector3(...a),end=new THREE.Vector3(...b),dir=end.clone().sub(start).normalize();const pos=start.clone().lerp(end,reverse?.28:.68);if(reverse)dir.negate();const cone=new THREE.Mesh(new THREE.ConeGeometry(.34,.9,5),new THREE.MeshBasicMaterial({color}));cone.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),dir);cone.position.copy(pos);parent.add(cone);}
function drawRoute(e,points,g,preview=false){
 const width=e.route?.width||1.6,col=preview?0x8af0ed:edgeColor(e),special=['捷徑','誤導'].includes(e.kind),deck=material(preview?0x45bbc6:e.fromId==='R2'&&e.toId==='R3'?0xa55441:special?col:0x546471,preview?.58:special?.3:.8);
 for(let i=1;i<points.length;i++){
  const a=points[i-1],b=points[i],length=Math.hypot(...a.map((v,j)=>v-b[j]));if(length<.01)continue;
  if(e.kind==='子節點'&&!e.route){line([a,b],col,g,.8,true);continue;}
  if(Math.abs(a[1]-b[1])>.05&&e.route?.mode!=='ramp'){
   const steps=Math.max(2,Math.ceil(Math.abs(b[1]-a[1])/.28)),horizontal=Math.hypot(b[0]-a[0],b[2]-a[2]);
   for(let j=0;j<steps;j++){const p=new THREE.Vector3(...a).lerp(new THREE.Vector3(...b),(j+.5)/steps);const step=box(width,.18,Math.max(.12,horizontal/steps+.04),p.x,p.y-.06,p.z,deck,g);step.rotation.y=Math.atan2(b[0]-a[0],b[2]-a[2]);}
  }else segment(a,b,width,.15,deck,g);
  const aa=[a[0],a[1]+.24,a[2]],bb=[b[0],b[1]+.24,b[2]];line([aa,bb],col,g,.95,special&&!preview);
  if(length>2.5){arrow(aa,bb,col,g);if(e.back)arrow(aa,bb,col,g,true);}
 }
 // Square plates close the inside corner of every orthogonal bend.
 for(let i=1;i<points.length-1;i++){const a=points[i-1],b=points[i],c=points[i+1];if(Math.abs((b[0]-a[0])*(c[2]-b[2])-(b[2]-a[2])*(c[0]-b[0]))>.001)box(width,.15,width,b[0],b[1]-.02,b[2],deck,g);}
 if(e.route?.stairSections){const seen=new Set();for(const p of points){if(!floors.some(f=>Math.abs(p[1]-floorY.get(f)-.3)<.001))continue;const key=p.map(v=>v.toFixed(5)).join('/');if(seen.has(key))continue;seen.add(key);box(width,.15,width,p[0],p[1]-.02,p[2],deck,g);}}
}
function recalcHeights(){let y=0;floors.forEach((f,i)=>{if(i){const prior=floors[i-1];y+=(state.height==='actual'?4.2:structureFloors.has(prior)?4.2:.65)+(structureFloors.has(prior)?state.spread:0);}floorY.set(f,y);});}
function roomY(n){return floorY.get(n.floor)+(offsets[n.id]||0);}
function point(n){return[n.x,roomY(n)+.3,n.z];}
function portal(n,p){
 if(n.id==='R4b')return null;
 const candidates=[['west',Math.abs(p[0]-(n.x-n.w/2)),p[2]-n.z],['east',Math.abs(p[0]-(n.x+n.w/2)),p[2]-n.z],['north',Math.abs(p[2]-(n.z-n.d/2)),p[0]-n.x],['south',Math.abs(p[2]-(n.z+n.d/2)),p[0]-n.x]];
 const c=candidates.sort((a,b)=>a[1]-b[1])[0];return{side:c[0],offset:c[2]};
}
function pathFor(e){
 const a=nodeMap.get(e.fromId),b=nodeMap.get(e.toId),width=e.route?.width||1.6;
 let route=e.route;
 if(b.terminal&&(!route||e.id==='R22-EXIT43'&&JSON.stringify(route)===JSON.stringify(defaultExitRoute)))route={...defaultExitRoute,points:[{x:b.x,z:a.z,t:0,dy:0},{x:b.x,z:a.z+3,t:0,dy:-.7}]};
 const points=route?makeRoutePoints(a,b,roomY(a),roomY(b),route,f=>floorY.get(f)):orthogonalize(adaptRoutePoints(routePoints(e,id=>roomY(nodeMap.get(id))),originalRooms.get(a.id),originalRooms.get(b.id),a,b),width);
 const ap=portal(a,points[0]),bp=portal(b,points.at(-1));if(ap)ap.width=width;if(bp)bp.width=width;
 return{points,ap,bp};
}
const landingContext=()=>({edges:data.edges,nodeMap,roomY,pathFor,floorHeight:f=>floorY.get(f)});
function makeWall(n,side,openings,parent,mat){
 if(n.id==='R4b'||n.id==='R10'||n.id==='R22')return;
 const glass=sharedGlassBoundary(nodeMap.get('R19'),nodeMap.get('R20'));
 const y=roomY(n),horizontal=side==='north'||side==='south',length=horizontal?n.w:n.d;
 const x=n.x+(side==='west'?-n.w/2:side==='east'?n.w/2:0),z=n.z+(side==='north'?-n.d/2:side==='south'?n.d/2:0);
 const piece=(lo,hi,h=2.2,dy=1.1)=>{if(hi-lo>.02)box(horizontal?hi-lo:.18,h,horizontal?.18:hi-lo,x+(horizontal?(lo+hi)/2:0),y+dy,z+(horizontal?0:(lo+hi)/2),mat,parent);};
 const intervals=openings.filter(p=>p&&p.side===side).map(p=>[Math.max(-length/2,p.offset-(p.width||1.6)/2),Math.min(length/2,p.offset+(p.width||1.6)/2)]);
 if(glass&&(n.id==='R19'&&side===glass.sideA||n.id==='R20'&&side===glass.sideB))intervals.push([glass.x1-n.x,glass.x2-n.x]);
 intervals.sort((a,b)=>a[0]-b[0]);
 let cursor=-length/2;for(const [lo,hi] of intervals){piece(cursor,lo);piece(Math.max(cursor,lo),hi,.25,2.075);cursor=Math.max(cursor,hi);}piece(cursor,length/2);
}
function syncRoomNodes(){
 const live=new Set(data.nodes.map(n=>n.id));
 for(const n of data.nodes){if(n.custom){const distance=g=>Math.max(g.floors[0]-n.floor,0,n.floor-g.floors[1]);n.group=groups.slice(1).reduce((best,g)=>distance(g)<distance(best)?g:best).id;}nodeMap.set(n.id,n);}
 if(!live.has(state.selected))state.selected=(data.nodes.find(n=>n.floor===state.floor)||data.nodes[0]).id;
 const removed=[...nodeMap.keys()].filter(id=>id!==exitAnchor.id&&!live.has(id));
 if(removed.length){mouseEditor?.cancel();objectEdit3D?.clearSelection();stairDrag3D?.clearSelection();for(const id of removed)nodeMap.delete(id);}
}
function rebuild(refit=true){
 roomCreate?.cancel();syncRoomNodes();
 const terminalSource=nodeMap.get('R22');exitAnchor.x=terminalSource.x+terminalSource.w/2+5;exitAnchor.z=terminalSource.z+6.1;
 if(building){scene.remove(building);building.traverse(o=>{o.geometry?.dispose();if(o.material){for(const m of(Array.isArray(o.material)?o.material:[o.material])){m.map?.dispose();m.dispose();}}});}
 tags.forEach(t=>t.el.remove());floorTags.forEach(t=>t.el.remove());tags=[];floorTags=[];roomMeshes=[];edgeObjects=[];platformLinkObjects=[];roomObjects.clear();usedFloors=[...new Set(data.nodes.map(n=>n.floor))].sort((a,b)=>a-b);recalcHeights();
 building=new THREE.Group();scene.add(building);structure=new THREE.Group();building.add(structure);
 const paths=new Map(),doors=new Map(data.nodes.map(n=>[n.id,[]]));
 data.edges.forEach(e=>{const p=pathFor(e);paths.set(e.id,p);if(e.kind!=='子節點'){doors.get(e.fromId)?.push(p.ap);doors.get(e.toId)?.push(p.bp);}});
 const linkPaths=new Map();
 data.platformLinks.forEach(link=>{
  const points=makeLandingLinkPoints(link,landingContext());if(points.length<2)return;linkPaths.set(link.id,points);
  for(const [endpoint,p] of [[link.from,points[0]],[link.to,points.at(-1)]])if(endpoint.kind==='room'){
   const opening=portal(nodeMap.get(endpoint.roomId),p);if(opening){opening.width=link.width;doors.get(endpoint.roomId)?.push(opening);}
  }
 });
 // Perimeter-only structure leaves room plans and corridors readable.
 const minY=floorY.get(-3)-.6,maxY=floorY.get(43)+2.7;
 for(const x of[-26,26])for(const z of[-24,24])box(.2,maxY-minY,.2,x,(minY+maxY)/2,z,material(0x60768b,.24),structure);
 floors.forEach(f=>{const y=floorY.get(f),used=usedFloors.includes(f),g=new THREE.Group();g.userData.floor=f;structure.add(g);
  line([[-26,y,-24],[26,y,-24],[26,y,24],[-26,y,24],[-26,y,-24]],used?0x728c9f:0x344d63,g,used?.55:.26);
  if(used){const panels=f>=41?[[0,0,52,48]]:[[-14.5,0,23,48],[15.5,0,21,48],[1,-19.5,8,9],[1,12.5,8,23]];for(const [x,z,w,d] of panels)box(w,.12,d,x,y-.16,z,material(0x65798c,.055),g);}
  const el=document.createElement('div');el.className='floor-tag'+(used?' active':'');const overviewText=used?floorName(f):({11:'8–14F · 封閉',24:'21–27F · 封閉',36:'33–40F · 封閉',43:'43F · 下部門檻'})[f]||floorName(f);el.textContent=overviewText;host.append(el);floorTags.push({el,point:new THREE.Vector3(-27,y,24),floor:f,overviewText,overviewVisible:used||[11,24,36,43].includes(f)});
 });
 // Ground datum separates underground from the above-ground tower.
 line([[-27,floorY.get(1)-.65,16],[28,floorY.get(1)-.65,16]],0xc5ae8e,structure,.65);
 data.nodes.forEach(n=>{const g=new THREE.Group();g.userData.node=n.id;building.add(g);const y=roomY(n),color=n.custom?0x6ab6ac:colors[n.act];
  const base=box(n.w,.38,n.d,n.x,y+.02,n.z,material(color,n.id==='R4b'?.12:.75),g);base.userData.node=n.id;roomMeshes.push(base);
  const wallMat=material(color,.34);for(const side of['north','east','south','west'])makeWall(n,side,doors.get(n.id),g,wallMat);
  if(n.id!=='R4b')line([[n.x-n.w/2,y+2.25,n.z-n.d/2],[n.x+n.w/2,y+2.25,n.z-n.d/2],[n.x+n.w/2,y+2.25,n.z+n.d/2],[n.x-n.w/2,y+2.25,n.z+n.d/2],[n.x-n.w/2,y+2.25,n.z-n.d/2]],color,g,.8);
  const fixtures=new THREE.Group(),original=originalRooms.get(n.id);g.add(fixtures);
  if(original){dressRoom({...original,x:0,z:0},fixtures,{THREE,box,material,line,segment,y:0});fixtures.scale.set(n.w/original.w,1,n.d/original.d);fixtures.position.set(n.x,y,n.z);}
  const selection=new THREE.BoxHelper(base,0xffce8c);selection.visible=n.id===state.selected;g.add(selection);
  const el=document.createElement('button');el.className='room-tag';el.dataset.node=n.id;el.textContent=n.id;el.setAttribute('aria-label',`${n.id} ${n.name}`);el.onclick=()=>{if(!mouseEditor?.enabled&&!roomCreate?.active)selectRoom(n.id);};el.addEventListener('pointerdown',e=>startRoomDrag(e,n.id));host.append(el);
  tags.push({el,point:new THREE.Vector3(n.x,y+3.05,n.z),node:n});roomObjects.set(n.id,{g,base,selection});
 });
 data.edges.forEach(e=>{const g=new THREE.Group();building.add(g);const points=paths.get(e.id).points;drawRoute(e,points,g);if(e.toId===exitAnchor.id){const p=points.at(-1);box(3,.22,3,p[0],p[1]-.1,p[2],material(0xeab275,.6),g);}g.traverse(o=>{o.userData.edge=e.id;});edgeObjects.push({g,e,points,viewG:null,viewPaths:[],viewKey:null});});
 data.platformLinks.forEach(link=>{const points=linkPaths.get(link.id);if(!points)return;const g=new THREE.Group(),e={id:link.id,kind:'分岔',back:true,route:{mode:'auto',width:link.width}};building.add(g);drawRoute(e,points,g);g.traverse(o=>{o.userData.platformLink=link.id;});platformLinkObjects.push({g,e,link,points,viewG:null,viewPaths:[],viewKey:null});});
 dressBuilding(building,{THREE,box,material,line,segment,floorY,roomY,nodeMap,isEdited:id=>editor.isChanged(id)||(['R7','R8'].includes(id)&&editor.edgeChanged('R7-R8-11'))});
 refreshFloorOptions();applyVisibility();updateRouteOverlay();mouseEditor?.refresh();stairDrag3D?.refresh();objectEdit3D?.refresh();sync3DEditor();if(refit)fitCamera();
}
function inGroup(n){if(mouseEditor?.enabled){const e=mouseEditor.selectedEdge,s=mouseEditor.selectedSection;if(s)return n.floor===s.fromFloor||n.floor===s.toFloor;if(e&&(n.id===e.fromId||n.id===e.toId))return true;}if(editing&&!mouseEditor?.enabled&&sandbox?.mode==='route'&&routeFocus&&sandbox.interaction!=='ports'&&sandbox.draft)return n.id===sandbox.draft.fromId||n.id===sandbox.draft.toId;return state.floor!==null?n.floor===state.floor:state.group==='all'||n.group===state.group;}
function groupFloorRange(id){const fs=data.nodes.filter(n=>id==='all'||n.group===id).map(n=>n.floor);return[Math.min(...fs),Math.max(...fs,...(id==='all'?[43]:[]))];}
function editedStairSection(){return mouseEditor?.enabled&&mouseEditor.selectedSection||stairDrag3D?.enabled&&stairDrag3D.selected||null;}
function routeViewBounds(){
 const section=editedStairSection();
 if(section){
  const precise=stairDrag3D?.enabled&&stairDrag3D.selectionBounds;
  if(precise)return precise;
  const points=mouseEditor?.enabled&&mouseEditor.sectionPoints;
  const a=points?.length?points[0][1]:floorY.get(section.fromFloor)+.3,b=points?.length?points.at(-1)[1]:floorY.get(section.toFloor)+.3;
  return[Math.min(a,b),Math.max(a,b)];
 }
 if(state.floor===null&&state.group==='all')return null;
 const range=state.floor!==null?[state.floor,state.floor]:groupFloorRange(state.group);
 const lo=floors.indexOf(range[0]),hi=floors.indexOf(range[1]);
 if(isEditMode()&&state.floor!==null&&!(mouseEditor?.enabled&&mouseEditor.tool==='link'))return hi<floors.length-1?[floorY.get(state.floor)+.3,floorY.get(floors[hi+1])+.3]:[floorY.get(floors[hi-1])+.3,floorY.get(state.floor)+.3];
 return[lo>0?floorY.get(floors[lo-1])+.3:floorY.get(floors[0])-2,hi<floors.length-1?floorY.get(floors[hi+1])+.3:floorY.get(floors.at(-1))+3];
}
function sliceRouteForView(record,bounds){
 const key=bounds.join('/');if(record.viewKey===key)return;
 if(record.viewG){building.remove(record.viewG);record.viewG.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});}
 const g=new THREE.Group();building.add(g);record.viewG=g;record.viewKey=key;
 record.viewPaths=clipRouteToHeight(record.points,...bounds);
 for(const path of record.viewPaths)drawRoute(record.e,path,g);
 if(record.e.toId===exitAnchor.id){const p=record.points.at(-1);if(p[1]>=bounds[0]&&p[1]<=bounds[1])box(3,.22,3,p[0],p[1]-.1,p[2],material(0xeab275,.6),g);}
 g.traverse(o=>{o.userData[record.link?'platformLink':'edge']=record.e.id;});
}
const visibleEdgeObjects=()=>edgeObjects.map(o=>({g:o.viewG?.visible?o.viewG:o.g,e:o.e}));
const visiblePlatformLinkObjects=()=>platformLinkObjects.map(o=>({g:o.viewG?.visible?o.viewG:o.g,link:o.link}));
const visibleRoutePoints=()=>[...edgeObjects,...platformLinkObjects].flatMap(o=>o.viewG?.visible?o.viewPaths.flat():o.g.visible?o.points:[]);
function platformLinkAt(event){const rect=host.getBoundingClientRect(),ray=new THREE.Raycaster();ray.params.Line.threshold=.5;ray.setFromCamera(new THREE.Vector2((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1),camera);return ray.intersectObjects(visiblePlatformLinkObjects().filter(o=>o.g.visible).map(o=>o.g),true)[0]?.object.userData.platformLink;}
function applyVisibility(){
 const chosen=groups.find(g=>g.id===state.group);
 structure.visible=state.shell;
 const routeView=editing&&!mouseEditor?.enabled&&sandbox?.mode==='route'&&routeFocus&&sandbox.draft&&sandbox.interaction!=='ports';
 structure.children.forEach(o=>{o.visible=routeView?data.nodes.some(n=>inGroup(n)&&n.floor===o.userData.floor):state.floor!==null?o.userData.floor===state.floor:state.group==='all'||data.nodes.some(n=>inGroup(n)&&n.floor===o.userData.floor);});
 roomObjects.forEach((o,id)=>{o.g.visible=inGroup(nodeMap.get(id));o.selection.visible=id===state.selected;});
 const bounds=routeViewBounds(),stairSection=editedStairSection();
 edgeObjects.forEach(record=>{const {g,e}=record,a=nodeMap.get(e.fromId),b=nodeMap.get(e.toId),allowed=!(mouseEditor?.enabled?mouseEditor.selectedEdge?.id===e.id:editing&&sandbox?.mode==='route'&&sandbox.draft?.id===e.id)&&(state.special||!['捷徑','誤導'].includes(e.kind));
  g.visible=false;if(record.viewG)record.viewG.visible=false;if(!allowed)return;
  // Editing isolates the selected floor interval; normal viewing also shows
  // neighbouring flights. Both use slices without changing saved geometry.
  if(bounds&&!routeView&&(stairSection||a.floor!==b.floor)){sliceRouteForView(record,bounds);record.viewG.visible=record.viewPaths.length>0;}
  else g.visible=inGroup(a)&&inGroup(b);
 });
 platformLinkObjects.forEach(record=>{
  const {g,link}=record,a=resolveLinkEndpoint(link.from,landingContext()),b=resolveLinkEndpoint(link.to,landingContext());g.visible=false;if(record.viewG)record.viewG.visible=false;if(!a||!b)return;
  if(bounds&&(stairSection||a.floor!==b.floor)){sliceRouteForView(record,bounds);record.viewG.visible=record.viewPaths.length>0;}
  else{const range=groupFloorRange(state.group);g.visible=state.floor!==null?a.floor===state.floor:state.group==='all'||a.floor>=range[0]&&a.floor<=range[1];}
 });
 building.children.filter(o=>o.userData.storyFloor!=null).forEach(o=>{const f=o.userData.storyFloor;o.visible=o.userData.storyNodes?o.userData.storyNodes.every(id=>inGroup(nodeMap.get(id))):(state.floor===null||state.floor===f)&&(state.group==='all'||data.nodes.some(n=>inGroup(n)&&n.floor===f));o.children.filter(c=>c.userData.detailSign).forEach(c=>c.visible=(state.group!=='all'||state.floor!==null)&&state.labels);});
 building.children.filter(o=>o.userData.exit).forEach(o=>o.visible=state.floor===null&&inGroup(nodeMap.get('R22')));
 for(const {el,node} of tags)el.classList.toggle('selected',node.id===state.selected);
 const mouseRoute=mouseEditor?.enabled&&mouseEditor.selectedEdge;
 const section=stairSection;
 const mainMode=!!(mouseEditor?.enabled&&mouseEditor.mainStair);
 $('stair-link-start').setAttribute('aria-pressed',String(editing));
 $('stair-link-start').textContent=editing?'返回物件編輯':'連接樓梯 A → B';
 document.querySelector('.right').classList.toggle('main-stair-mode',mainMode);
 document.querySelector('.right>.section-label').textContent=mainMode?'MAIN STAIR / 主樓梯':'SELECTED SPACE / 選取房間';
 if(mouseRoute){$('room-id').textContent=mouseEditor.mainStair?'主樓梯':'樓梯';$('room-name').textContent=mouseEditor.mainStair&&section?floorName(section.fromFloor)+' → '+floorName(section.toFloor):mouseRoute.fromId+' → '+mouseRoute.toId;$('room-floor').textContent=section?floorName(section.fromFloor)+' → '+floorName(section.toFloor)+' · 目前梯段':'目前選取的通路';}
 else{const n=nodeMap.get(state.selected);$('room-id').textContent=n.id;$('room-name').textContent=n.name;$('room-floor').textContent=roomCaption(n);}
 $('view-title').textContent=section?(mouseEditor.mainStair?'主樓梯 / ':'樓梯編輯 / ')+floorName(section.fromFloor)+' → '+floorName(section.toFloor):mouseRoute?'通路編輯 / '+mouseRoute.fromId+' → '+mouseRoute.toId:routeView?'通路編輯 / '+sandbox.draft.fromId+' → '+sandbox.draft.toId:state.floor!==null?'單層檢視 / '+floorName(state.floor):chosen.title;
 $('view-subtitle').textContent=section?'只顯示目前梯段 · '+floorName(section.fromFloor)+' → '+floorName(section.toFloor)+' · 完成編輯後恢復檢視':stairDrag3D?.enabled?'3D 物件編輯 · 選取房間／拖彩色移動軸 · 走廊節點 · 逐層樓梯':mainMode?'點選位置建立樓梯 · 自動銜接上一層 · 右鍵平移，滾輪縮放':mouseEditor?.enabled?'滑鼠建造 · 完成拖曳即保存 · 右鍵平移，滾輪縮放':editing?(sandbox?.mode==='route'?'道路／樓梯 · 青色為預覽，套用後儲存 · 平面直角轉折':'編輯配置 · '+(dragMode?'拖曳房間編號以移動':'選取房間後在右側修改')):state.group==='all'?'由地下逐層上行 · 封閉樓層保留':chosen.range+' · 原文高度帶';
 document.querySelectorAll('[data-group]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.group===state.group)));
}
function selectGroup(id){
 roomCreate?.cancel();
 stairDrag3D?.clearSelection();objectEdit3D?.clearSelection();routeFocus=false;state.group=id;
 const range=groupFloorRange(id),choices=data.nodes.filter(n=>id==='all'||n.group===id),target=choices.find(n=>n.id===state.selected)||choices[0];
 state.floor=id!=='all'&&range[0]===range[1]?range[0]:null;
 if(mouseEditor?.enabled){if(target)mouseEditor.selectRoom(target.id);state.floor=nodeMap.get(state.selected).floor;mouseEditor.floorChanged();}
 else if(target&&target.id!==state.selected){state.selected=target.id;updateDetails();history.replaceState(null,'','#scene='+state.selected);}
 refreshFloorOptions();applyVisibility();updateRouteOverlay();fitCamera();
}
function selectRoom(id){if(!data.nodes.some(n=>n.id===id))return;roomCreate?.cancel();if(stairDrag3D?.selected)stairDrag3D.clearSelection();state.selected=id;const n=nodeMap.get(id);let changedFloor=false;if(state.floor!==null){if(state.floor!==n.floor){state.floor=n.floor;$('floor-only').value=String(n.floor);changedFloor=true;}}else if(state.group!=='all'&&state.group!==n.group)selectGroup(n.group);applyVisibility();updateDetails();document.querySelector('.right').scrollTop=0;if(objectEdit3D?.enabled&&(objectEdit3D.selected?.kind!=='room'||objectEdit3D.selected.id!==id))objectEdit3D.selectRoom(id);if(changedFloor)fitCamera();history.replaceState(null,'','#scene='+id);}
function viewTerminal(id){state.group='all';state.floor=nodeMap.get(id).floor;refreshFloorOptions();applyVisibility();fitCamera();}
function updateDetails(){const n=nodeMap.get(state.selected),idx=data.nodes.indexOf(n);$('room-id').textContent=n.id;$('room-name').textContent=n.name;$('room-floor').textContent=roomCaption(n);$('room-goal').textContent=n.custom?'自行建立的房間，可移動、調整尺寸與連接通路。':n.goal;$('room-story').textContent=n.custom?'此房間為自訂配置，未指定故事內容。':(editor.isChanged(n.id)?'原配置說明（已自訂修改）：':'')+rationale[n.id];$('room-evidence').textContent=n.custom?'自訂房間，沒有對應的原文規格。':data.spatial[n.id].floor+' '+data.spatial[n.id].space;$('room-picker').value=n.id;$('source-link').hidden=!!n.custom;$('source-link').href=sourceUrl(n.id);$('docs-link').href=n.custom?'../':'../#scene='+encodeURIComponent(n.id);$('prev').disabled=idx===0;$('next').disabled=idx===data.nodes.length-1;
 const root=$('connections');root.replaceChildren();
 data.edges.filter(e=>e.fromId===n.id||e.toId===n.id).forEach(e=>{const other=e.fromId===n.id?e.toId:e.fromId;const card=document.createElement('div');card.className='edge-card';card.style.setProperty('--edge','#'+edgeColor(e).toString(16));const button=document.createElement('button');button.textContent=`${e.fromId} ${e.back?'↔':'→'} ${e.toId} · ${e.kind}`;button.onclick=()=>nodeMap.get(other).terminal?(isEditMode()?openMainStair(nodeMap.get(e.fromId).floor,e.id):viewTerminal(other)):mouseEditor?.enabled?mouseEditor.selectRoad(e.id):editing&&sandbox?.mode==='route'?sandbox.selectEdge(e.id):selectRoom(other);if(editor.edgeChanged(e.id))button.textContent+=' · 自訂';card.append(button);const small=document.createElement('small');small.textContent=`${nodeMap.get(other).name} · ${floorName(nodeMap.get(other).floor)}`;card.append(small);const details=document.createElement('details');const summary=document.createElement('summary');summary.textContent=editor.edgeChanged(e.id)?'通路說明（已自訂；原規則供參考）':'通行條件與移動方式';details.append(summary);[e.gate,e.motion,e.returnRule].forEach(text=>{const p=document.createElement('p');p.textContent=text;details.append(p);});card.append(details);root.append(card);});
 data.platformLinks.filter(link=>[link.from,link.to].some(endpoint=>endpoint.kind==='room'&&endpoint.roomId===n.id)).forEach(link=>{const other=link.from.kind==='room'&&link.from.roomId===n.id?link.to:link.from,info=resolveLinkEndpoint(other,landingContext());const card=document.createElement('div');card.className='edge-card';card.style.setProperty('--edge','#78b9c8');card.textContent=n.id+' ↔ '+(info?.label||'樓梯平台')+' · 自訂連接';root.append(card);});
 $('edge-count').textContent=data.edges.filter(e=>!nodeMap.get(e.fromId).terminal&&!nodeMap.get(e.toId).terminal).length+data.platformLinks.length;
 if(n.id==='R4b'){const p=document.createElement('p');p.className='note';p.textContent='R4b 是共享 R4 基底的神壇子節點，本模型以原走道中的神壇角落表示，未新增獨立房間。';root.append(p);}
 if(n.id==='R22'){const p=document.createElement('p');p.className='note';p.textContent='上部終點：局部下折避梁，再沿同一梯井上行至 43F 門檻。R23 屬下部，不建立其房間。';root.append(p);}
 syncEditor();mouseEditor?.refresh();
}
function fitCamera(){if(!camera)return;const ns=data.nodes.filter(inGroup);
 const focused=!!(mouseEditor?.enabled&&mouseEditor.selectedSection)||editing&&!mouseEditor?.enabled&&sandbox?.mode==='route'&&routeFocus&&sandbox.interaction!=='ports',ps=mouseEditor?.enabled&&mouseEditor.selectedSection?mouseEditor.sectionPoints:mouseEditor?.enabled&&mouseEditor.selectedEdge?pathFor(mouseEditor.selectedEdge).points:focused&&sandbox.draft?pathFor(sandbox.draft).points:visibleRoutePoints();
 if(!ns.length&&!ps.length)ps.push([-26,floorY.get(state.floor)||0,-24],[26,floorY.get(state.floor)||0,24]);
 let lo=Math.min(...ns.map(n=>roomY(n)),...ps.map(p=>p[1]))-2,hi=Math.max(...ns.map(n=>roomY(n)),...ps.map(p=>p[1]))+5;
 if(!focused&&state.group==='all'&&state.floor===null)hi=Math.max(hi,floorY.get(43)+3);
 const xmin=Math.min(...(focused?[]:[-27]),...ns.map(n=>n.x-n.w/2-3),...ps.map(p=>p[0]-3)),xmax=Math.max(...(focused?[]:[27]),...ns.map(n=>n.x+n.w/2+3),...ps.map(p=>p[0]+3)),zmin=Math.min(...(focused?[]:[-24]),...ns.map(n=>n.z-n.d/2-3),...ps.map(p=>p[2]-3)),zmax=Math.max(...(focused?[]:[26]),...ns.map(n=>n.z+n.d/2+3),...ps.map(p=>p[2]+3));
 const center=new THREE.Vector3((xmin+xmax)/2,(lo+hi)/2,(zmin+zmax)/2);const h=hi-lo,aspect=host.clientWidth/host.clientHeight,plan=Math.hypot(xmax-xmin,zmax-zmin);const span=state.view==='top'?Math.max((xmax-xmin+14)/aspect,zmax-zmin+12):Math.max(h+24,(plan+6)/aspect);camera.zoom=1;
 if(camera.isPerspectiveCamera)camera.aspect=aspect;else{camera.top=span/2;camera.bottom=-span/2;camera.left=-span*aspect/2;camera.right=span*aspect/2;}
 const offset=state.view==='front'?new THREE.Vector3(0,5,160):state.view==='top'?new THREE.Vector3(0,180,.01):new THREE.Vector3(95,58,130);
 if(camera.isPerspectiveCamera)offset.setLength(span/(2*Math.tan(THREE.MathUtils.degToRad(camera.fov/2)))+Math.hypot((xmax-xmin)/2,h/2,(zmax-zmin)/2));
 camera.position.copy(center).add(offset);controls.target.copy(center);camera.lookAt(center);camera.updateProjectionMatrix();controls.update();}
function togglePerspective(){
 const old=camera,aspect=host.clientWidth/host.clientHeight,offset=old.position.clone().sub(controls.target);
 const span=old.isPerspectiveCamera?2*offset.length()*Math.tan(THREE.MathUtils.degToRad(old.getEffectiveFOV()/2)):(old.top-old.bottom)/old.zoom;
 camera=old.isPerspectiveCamera?new THREE.OrthographicCamera(-span*aspect/2,span*aspect/2,span/2,-span/2,.1,1500):new THREE.PerspectiveCamera(45,aspect,.1,1500);
 if(camera.isPerspectiveCamera)offset.setLength(span/(2*Math.tan(THREE.MathUtils.degToRad(camera.fov/2))));
 camera.position.copy(controls.target).add(offset);camera.up.copy(old.up);camera.lookAt(controls.target);camera.updateProjectionMatrix();controls.object=camera;controls.update();
 $('perspective').setAttribute('aria-pressed',String(camera.isPerspectiveCamera===true));
 $('perspective').title=camera.isPerspectiveCamera?'目前為透視投影；點擊切回正交投影':'目前為正交投影；點擊開啟透視投影（近大遠小）';
}
function renderTags(){const rect=host.getBoundingClientRect();const occupied=[];
 tags.sort((a,b)=>Number(b.node.id===state.selected)-Number(a.node.id===state.selected)).forEach(t=>{const visible=(state.labels||editing)&&inGroup(t.node);t.el.hidden=!visible;if(!visible)return;const world=t.point.clone();if(mouseEditor?.roomDelta?.id===t.node.id){world.x+=mouseEditor.roomDelta.x;world.z+=mouseEditor.roomDelta.z;}if(drag?.id===t.node.id||objectEdit3D?.enabled)world.add(roomObjects.get(t.node.id).g.position);const p=world.project(camera);if(p.z<-1||p.z>1||Math.abs(p.x)>1.1||Math.abs(p.y)>1.1){t.el.hidden=true;return;}let x=(p.x*.5+.5)*rect.width,y=(-p.y*.5+.5)*rect.height;let shifted=0;while(occupied.some(q=>Math.abs(q.x-x)<36&&Math.abs(q.y-y)<19)&&shifted<4){y-=18;shifted++;}occupied.push({x,y});t.el.style.left=x+'px';t.el.style.top=y+'px';});
 const range=groupFloorRange(state.group);
 floorTags.forEach(t=>{const focusedRoute=editing&&!mouseEditor?.enabled&&sandbox?.mode==='route'&&routeFocus&&sandbox.interaction!=='ports';const visible=focusedRoute?data.nodes.some(n=>inGroup(n)&&n.floor===t.floor):state.floor!==null?t.floor===state.floor:t.overviewVisible&&(state.group==='all'||t.floor>=range[0]&&t.floor<=range[1]);t.el.hidden=!state.shell||!visible;if(t.el.hidden)return;t.el.textContent=state.floor!==null?floorName(t.floor):t.overviewText;const p=t.point.clone().project(camera);t.el.hidden=Math.abs(p.x)>1.15||Math.abs(p.y)>1.1;t.el.style.left=(p.x*.5+.5)*rect.width+'px';t.el.style.top=(-p.y*.5+.5)*rect.height+'px';});
}
const storageKey='dead-signal-building-sandbox-v2';
function clearRoutePreview(){
 if(routePreview){scene.remove(routePreview);routePreview.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});routePreview=null;}
}
function updateRouteOverlay(){
 clearRoutePreview();
 if(!pointDrag){routeMarkers.forEach(m=>m.el.remove());routeMarkers=[];}
 if(!editing||mouseEditor?.enabled||sandbox?.mode!=='route')return;
 const draft=sandbox.draft,a=nodeMap.get(draft?.fromId),b=nodeMap.get(draft?.toId),points=a&&b?pathFor(draft).points:null;
 if(points&&sandbox.interaction!=='ports'&&inGroup(a)&&inGroup(b)){routePreview=new THREE.Group();scene.add(routePreview);drawRoute(draft,points,routePreview,true);}
 if(pointDrag)return;
 const marker=(label,position,cls,title,action)=>{const el=document.createElement('button');el.className=cls;el.textContent=label;el.title=title;el.setAttribute('aria-label',title);host.append(el);if(action)el.onclick=event=>{event.stopPropagation();action();};routeMarkers.push({el,position});return el;};
 if(sandbox.interaction==='ports'){
  const names={north:'北側',south:'南側',east:'東側',west:'西側'};
  for(const n of data.nodes.filter(inGroup))for(const side of Object.keys(names))marker(portAnchor?.id===n.id&&portAnchor.side===side?'A':'+',portalPosition(n,{side,u:0},roomY(n)+.45),'sandbox-port',n.id+' '+names[side]+'路口',()=>{if(sandbox.pickPort(n.id,side,0)&&sandbox.interaction==='ports'){portAnchor={id:n.id,side};updateRouteOverlay();$('view-subtitle').textContent='起點 '+n.id+' 已選定 · 請點另一間房間的路口';}});
 }else if(points&&inGroup(a)&&inGroup(b)){
  marker('A',points[0].map((v,i)=>v+(i===1?.45:0)),'route-ghost-label','起點 '+a.id);
  marker('B',points.at(-1).map((v,i)=>v+(i===1?.45:0)),'route-ghost-label','終點 '+b.id);
  if(sandbox.interaction==='points')draft.route.points.forEach((p,index)=>{
   const pos=[p.x,roomY(a)+(roomY(b)-roomY(a))*p.t+.3+p.dy,p.z];
   const el=marker(String(index+1),pos,'route-handle','拖曳折點 '+(index+1));
   el.addEventListener('pointerdown',event=>{if(event.button!==0)return;event.preventDefault();event.stopPropagation();const start=dragPoint(event,pos[1]);if(!start)return;pointDrag={index,start,original:{...p},y:pos[1],pointer:event.pointerId,element:el};controls.enabled=false;el.setPointerCapture(event.pointerId);});
  });
 }
}
function renderRouteMarkers(){
 const rect=host.getBoundingClientRect();for(const m of routeMarkers){const p=new THREE.Vector3(...m.position).project(camera);m.el.hidden=!editing||sandbox?.mode!=='route'||Math.abs(p.x)>1.03||Math.abs(p.y)>1.03||p.z<-1||p.z>1;m.el.style.left=(p.x*.5+.5)*rect.width+'px';m.el.style.top=(-p.y*.5+.5)*rect.height+'px';}
}
function onRoutePreview(draft){
 if(!sandbox)return;
 if(mouseEditor?.enabled)return;
 if(!draft||sandbox.mode!=='route'){updateRouteOverlay();applyVisibility();return;}
 const key=draft.id+':'+draft.fromId+':'+draft.toId,changed=lastPreviewId!==key;lastPreviewId=key;routeFocus=true;
 $('edit-room-id').textContent=draft.fromId+' → '+draft.toId;
 applyVisibility();updateRouteOverlay();if(changed&&editing)fitCamera();
}
function setupSandbox(){
 sandbox=createSandboxUI({data,nodeMap,editor,pathFor,roomY,floorHeight:f=>floorY.get(f),afterEdit,status:editorStatus,
  setMode:mode=>{setDragMode(false);routeFocus=mode==='route';syncEditor();applyVisibility();updateRouteOverlay();if(editing)fitCamera();},
  onPreview:onRoutePreview,
  onInteraction:kind=>{portAnchor=null;controls.enableRotate=kind!=='points';if(kind==='points'){state.view='top';routeFocus=true;}applyVisibility();updateRouteOverlay();fitCamera();}
 });
 sandbox.init();
 host.addEventListener('pointermove',event=>{
  if(!pointDrag||pointDrag.pointer!==event.pointerId)return;const p=dragPoint(event,pointDrag.y);if(!p)return;
  const x=Math.max(-150,Math.min(150,Math.round((pointDrag.original.x+p.x-pointDrag.start.x)*2)/2)),z=Math.max(-150,Math.min(150,Math.round((pointDrag.original.z+p.z-pointDrag.start.z)*2)/2));
  const m=routeMarkers.find(m=>m.el===pointDrag.element);if(m)m.position=[x,pointDrag.y,z];sandbox.setWaypoint(pointDrag.index,{x,z});
 });
 const finish=(event,cancel=false)=>{
  if(!pointDrag||event.pointerId!==pointDrag.pointer)return;const d=pointDrag;pointDrag=null;controls.enabled=true;if(d.element.hasPointerCapture(d.pointer))d.element.releasePointerCapture(d.pointer);
  if(cancel){Object.assign(sandbox.draft.route.points[d.index],d.original);sandbox.renderPoints();}else sandbox.commit();updateRouteOverlay();
 };
 host.addEventListener('pointerup',event=>finish(event));host.addEventListener('pointercancel',event=>finish(event,true));
 window.addEventListener('keydown',event=>{if(event.key==='Escape'&&!mouseEditor?.enabled&&!document.querySelector('dialog[open]')){if(pointDrag){const d=pointDrag;finish({pointerId:d.pointer},true);}else{sandbox.setTab('room');}}});
}
function setupMouseEditor(){
 mouseEditor=createMouseEditor({THREE,host,scene,data,nodeMap,editor,roomY,pathFor,drawRoute,afterEdit,
  camera:()=>camera,controls:()=>controls,canvas:()=>renderer.domElement,roomMeshes:()=>roomMeshes,edgeObjects:visibleEdgeObjects,platformLinkAt,visible:inGroup,
  selectedRoom:()=>state.selected,floor:()=>state.floor??nodeMap.get(state.selected).floor,floors:()=>floors,floorHeight:f=>floorY.get(f),selectRoom,
  status:editorStatus,visibility:applyVisibility,fit:fitCamera,
  previewRoom:(id,delta)=>{roomObjects.get(id)?.g.position.set(delta.x,0,delta.z);},
  highlightRoom:id=>{roomObjects.forEach((o,key)=>{o.selection.visible=key===(id||state.selected);});},
  plan:()=>{state.view='top';state.group='all';state.floor=state.floor??nodeMap.get(state.selected).floor;routeFocus=false;refreshFloorOptions();applyVisibility();fitCamera();},
  setFloor:f=>{state.floor=f;state.group='all';const n=data.nodes.find(n=>n.floor===f);if(n){state.selected=n.id;history.replaceState(null,'','#scene='+n.id);}refreshFloorOptions();applyVisibility();updateDetails();fitCamera();}
 });
 mouseEditor.init();
 $('advanced-editor').addEventListener('toggle',()=>{
  if(!editing)return;
  const id=mouseEditor.selectedEdge?.id;
  if($('advanced-editor').open){mouseEditor.setEnabled(false);if(id){sandbox.selectEdge(id);sandbox.setTab('route');}else sandbox.setTab('room');}
  else if(!mouseEditor.enabled){sandbox.setTab('room');setDragMode(false);mouseEditor.setEnabled(true);}
  applyVisibility();updateRouteOverlay();
 });
}
function sync3DEditor(){
 const active=!!stairDrag3D?.enabled;
 document.querySelector('.app').classList.toggle('stair-3d-editing',active);
 $('stair-3d-toolbar').hidden=!active;
 $('stair-3d-undo').disabled=!editor.canUndo();$('stair-3d-redo').disabled=!editor.canRedo();
 const selected=objectEdit3D?.selected,stair=stairDrag3D?.selected,room=selected?.kind==='room'?nodeMap.get(selected.id):null;
 $('object-3d-selection').textContent=room?`${room.id} · ${floorName(room.floor)} · 拖彩色軸或平面把手移動`:selected?`走廊 ${selected.id} · 拖金色點改路線`:stair?`${floorName(stair.fromFloor)} → ${floorName(stair.toFloor)} · 拖動此段樓梯`:'選擇房間、走廊或樓梯';
 $('object-3d-floor-actions').hidden=!room;
 if(room){const i=floors.indexOf(room.floor);$('object-3d-down').disabled=i<=0;$('object-3d-up').disabled=i>=floors.length-1;}
 syncEditModeSwitch();
}
function isEditMode(){return !!(editing||stairDrag3D?.enabled||objectEdit3D?.enabled||roomCreate?.active);}
function syncEditModeSwitch(){
 const active=isEditMode();$('edit-mode-switch').setAttribute('aria-checked',String(active));
 $('edit-mode-label').textContent='編輯模式：'+(active?'開啟':'關閉');
 $('edit-mode-switch').title=active?'關閉編輯，僅查看模型':'開啟編輯，操作房間、走廊與樓梯';
 $('room-create-start').disabled=!active;$('room-create-start').setAttribute('aria-pressed',String(!!roomCreate?.active));
 $('room-create-start').textContent=roomCreate?.active?'取消新增（Esc）':'＋ 新增房間';
}
function setEditMode(value){
 roomCreate?.cancel();
 if(value&&stairDrag3D?.enabled&&objectEdit3D?.enabled)return;
 if(drag)finishRoomDrag({pointerId:drag.pointer},true);
 if(pointDrag){const d=pointDrag;pointDrag=null;if(d.element.hasPointerCapture(d.pointer))d.element.releasePointerCapture(d.pointer);const point=sandbox?.draft?.route?.points?.[d.index];if(point)Object.assign(point,d.original);}
 setEditing(false);$('advanced-editor').open=false;routeFocus=false;portAnchor=null;
 controls.enabled=true;controls.enableRotate=true;controls.mouseButtons.LEFT=THREE.MOUSE.ROTATE;controls.mouseButtons.RIGHT=THREE.MOUSE.PAN;
 if(value)setStairDrag3D(true);
 applyVisibility();updateRouteOverlay();syncEditModeSwitch();
 editorStatus(value?'編輯模式已開啟；選房間後拖彩色軸，或選取走廊與樓梯。':'編輯模式已關閉；可旋轉、平移及縮放視角。');
}
function setStairDrag3D(value){
 stairDrag3D?.setEnabled(value);objectEdit3D?.setEnabled(value);sync3DEditor();
}
function setupStairDrag3D(){
 stairDrag3D=createStairDrag3D({THREE,host,scene,data,nodeMap,editor,roomY,pathFor,floorHeight:f=>floorY.get(f),
  camera:()=>camera,controls:()=>controls,drawRoute,afterEdit,status:editorStatus,
  blocked:()=>!!(objectEdit3D?.gizmoActive||objectEdit3D?.dragging),
  occluded:(event,point)=>{
   scene.updateMatrixWorld(true);const rect=host.getBoundingClientRect(),ray=new THREE.Raycaster();
   ray.setFromCamera(new THREE.Vector2((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1),camera);
   const hit=ray.intersectObjects(roomMeshes.filter(mesh=>mesh.parent.visible))[0];
   return !!hit&&hit.distance<new THREE.Vector3(...point).sub(ray.ray.origin).dot(ray.ray.direction)-.4;
  },
  onSelect:()=>objectEdit3D?.clearSelection(),onChange:()=>{applyVisibility();sync3DEditor();},
  visible:(edge,section)=>{
   const record=edgeObjects.find(o=>o.e.id===edge.id);if(!record||!(record.g.visible||record.viewG?.visible))return false;
   const active=editedStairSection();if(active&&(Math.min(active.fromFloor,active.toFloor)!==Math.min(section.fromFloor,section.toFloor)||Math.max(active.fromFloor,active.toFloor)!==Math.max(section.fromFloor,section.toFloor)))return false;
   const bounds=routeViewBounds();if(!bounds)return true;
   const range=section.bounds||[floorY.get(section.fromFloor)+.3,floorY.get(section.toFloor)+.3],lo=Math.min(...range),hi=Math.max(...range);
   return hi>bounds[0]+1e-8&&lo<bounds[1]-1e-8;
  }
 });
}
function setupObjectEdit3D(){
 objectEdit3D=createObjectEdit3D({THREE,host,scene,data,nodeMap,editor,roomY,pathFor,floorHeight:f=>floorY.get(f),floors:()=>floors,offsets,
  camera:()=>camera,controls:()=>controls,canvas:()=>renderer.domElement,roomMeshes:()=>roomMeshes,edgeObjects:visibleEdgeObjects,platformLinkObjects:visiblePlatformLinkObjects,routeBounds:routeViewBounds,
  drawRoute,afterEdit,status:editorStatus,visible:inGroup,onSelect:selected=>{stairDrag3D?.clearSelection();if(selected?.kind==='room'&&state.selected!==selected.id)selectRoom(selected.id);},onChange:sync3DEditor,
  previewRoom:(id,delta)=>roomObjects.get(id)?.g.position.set(delta.x,delta.y||0,delta.z)
 });
}
function editorStatus(message,error=false){for(const id of ['edit-status','object-3d-status']){$(id).textContent=message;$(id).classList.toggle('error',error);}}
function refreshFloorOptions(){
 const select=$('floor-only');select.replaceChildren(new Option('整個區域','all'));
 floors.forEach(f=>select.add(new Option(floorName(f)+' · '+(data.nodes.filter(n=>n.floor===f).map(n=>n.id).join(' / ')||'無房間'),String(f))));
 select.value=state.floor===null?'all':String(state.floor);
 document.querySelectorAll('[data-group]').forEach(b=>{const[low,high]=groupFloorRange(b.dataset.group);b.querySelector('b').textContent=floorName(low)+(low===high?'':'–'+floorName(high));});
 $('room-picker').replaceChildren(...data.nodes.map(n=>new Option(n.id+' · '+n.name,n.id)));$('room-picker').value=state.selected;$('room-count').textContent=String(data.nodes.length);
}
function syncEditor(){
 const n=nodeMap.get(state.selected);$('edit-room-id').textContent=sandbox?.mode==='route'&&sandbox.draft?sandbox.draft.fromId+' → '+sandbox.draft.toId:n.id;$('edit-warning').hidden=sandbox?.mode==='route';
 for(const key of ['name','x','z','floor','w','d'])$('edit-'+key).value=n[key];$('edit-offset').value=offsets[n.id]||0;
 $('edit-undo').disabled=!editor.canUndo();$('edit-redo').disabled=!editor.canRedo();
 const warnings=[];
 if(editor.isChanged(n.id))warnings.push(n.custom?'新增的自訂房間。':'此房已自訂；原文依據仍保留供比對。');
 if(Math.abs(n.x)+n.w/2>26||Math.abs(n.z)+n.d/2>24)warnings.push('此房超出原建築外框。');
 const overlaps=data.nodes.filter(b=>b.id!==n.id&&![n.id,b.id].includes('R4b')&&Math.abs(roomY(b)-roomY(n))<2.2&&Math.abs(b.x-n.x)<(b.w+n.w)/2-.05&&Math.abs(b.z-n.z)<(b.d+n.d)/2-.05);
 if(overlaps.length)warnings.push('房間重疊：'+overlaps.map(b=>b.id).join('、')+'。');
 if(['R19','R20'].includes(n.id)&&!sharedGlassBoundary(nodeMap.get('R19'),nodeMap.get('R20')))warnings.push('R19／R20 已分離，無法共用玻璃。');
 if(n.id==='R4b'){const a=nodeMap.get('R4');if(n.floor!==a.floor||Math.abs(n.x-a.x)+n.w/2>a.w/2||Math.abs(n.z-a.z)+n.d/2>a.d/2)warnings.push('R4b 已離開 R4 範圍；原設定為共享神壇角落。');}
 $('edit-warning').textContent=warnings.join(' ');
}
function persistLayout(){try{localStorage.setItem(storageKey,JSON.stringify(editor.snapshot()));return true;}catch{return false;}}
function afterEdit(message,refit=false){
 roomCreate?.cancel();syncRoomNodes();
 const oldY=floorY.get(nodeMap.get(state.selected).floor);
 if(state.floor!==null&&!mouseEditor?.enabled&&!stairDrag3D?.enabled)state.floor=nodeMap.get(state.selected).floor;
 rebuild(refit);sandbox?.refresh();updateDetails();
 if(!refit&&!stairDrag3D?.enabled&&oldY!==undefined){const delta=floorY.get(nodeMap.get(state.selected).floor)-oldY;camera.position.y+=delta;controls.target.y+=delta;controls.update();}
 const saved=persistLayout();editorStatus(message+(saved?' · 已暫存在此瀏覽器':' · 無法暫存，請匯出 JSON 備份'),!saved);
 return saved;
}
function onSceneLoaded({name,changed}){
 roomCreate?.cancel();syncRoomNodes();
 // Discard transient gestures only after the imported snapshot has passed
 // validation, then show the complete loaded building rather than an old slice.
 const resume3D=!!stairDrag3D?.enabled;
 mouseEditor?.cancel();stairDrag3D?.cancel();objectEdit3D?.cancel();if(drag)finishRoomDrag({pointerId:drag.pointer},true);
 if(pointDrag){if(pointDrag.element.hasPointerCapture(pointDrag.pointer))pointDrag.element.releasePointerCapture(pointDrag.pointer);pointDrag=null;}
 state.group='all';state.floor=null;state.view='iso';routeFocus=false;
 setEditing(false);$('advanced-editor').open=false;
 if(resume3D)setStairDrag3D(true);
 if(changed)return afterEdit('已載入場景：'+name,true);
 applyVisibility();fitCamera();editorStatus('場景檔與目前配置相同。');return true;
}
function setDragMode(value){
 dragMode=value;controls.enableRotate=!value;host.classList.toggle('drag-edit',value);$('edit-drag').setAttribute('aria-pressed',String(value));
 if(value){state.view='top';state.floor=nodeMap.get(state.selected).floor;state.group='all';refreshFloorOptions();fitCamera();}
 applyVisibility();
}
function openMainStair(floor=state.floor??nodeMap.get(state.selected).floor,edgeId){
 roomCreate?.cancel();
 $('advanced-editor').open=false;setEditing(true);
 mouseEditor.selectMainStair(floor,edgeId);applyVisibility();
}
function openStairLink(){
 roomCreate?.cancel();
 $('advanced-editor').open=false;setEditing(true);
 routeFocus=false;mouseEditor.setTool('link');applyVisibility();fitCamera();
}
function setEditing(value){setStairDrag3D(false);editing=value;$('edit-toggle').hidden=!value;$('editor-panel').hidden=!value;document.querySelector('.right').classList.toggle('editing',value);setDragMode(false);if(value&&!$('advanced-editor').open)sandbox.setTab('room');mouseEditor?.setEnabled(value&&!$('advanced-editor').open);if(!value)controls.enableRotate=true;applyVisibility();updateRouteOverlay();syncEditor();syncEditModeSwitch();}
function startRoomCreation(){
 if(roomCreate?.active){roomCreate.cancel();return;}if(!isEditMode())return;
 setEditMode(true);const floor=state.floor??nodeMap.get(state.selected).floor,refit=state.floor!==floor;
 state.group='all';state.floor=floor;refreshFloorOptions();applyVisibility();if(refit)fitCamera();
 setStairDrag3D(false);creatingRoom=true;roomCreate.start();syncEditModeSwitch();
}
function setupRoomCreation(){
 roomCreate=createRoomCreate3D({THREE,host,scene,camera:()=>camera,controls:()=>controls,floor:()=>state.floor,floorHeight:f=>floorY.get(f),
  status:(message,error=false)=>{editorStatus(message,error);$('room-create-status').textContent=message;},
  onChange:()=>{if(!roomCreate?.active&&creatingRoom){creatingRoom=false;setStairDrag3D(true);}$('room-create-status').hidden=!roomCreate?.active;syncEditModeSwitch();},
  createRoom:patch=>{const id=editor.addRoom(patch);syncRoomNodes();state.selected=id;afterEdit(id+' 自訂房間已建立');history.replaceState(null,'','#scene='+id);objectEdit3D?.selectRoom?.(id);return id;}
 });
}
function dragPoint(event,y){const rect=host.getBoundingClientRect(),ray=new THREE.Raycaster();ray.setFromCamera(new THREE.Vector2((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1),camera);return ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0,1,0),-y),new THREE.Vector3());}
function startRoomDrag(event,id){
 if(!editing||!dragMode||event.button!==0)return;event.preventDefault();event.stopPropagation();selectRoom(id);
 const n=nodeMap.get(id),start=dragPoint(event,roomY(n));if(!start)return;
 drag={id,start,x:n.x,z:n.z,y:roomY(n),pointer:event.pointerId,element:event.currentTarget};controls.enabled=false;event.currentTarget.setPointerCapture(event.pointerId);
}
function moveRoomDrag(event){
 if(!drag||event.pointerId!==drag.pointer)return;const p=dragPoint(event,drag.y);if(!p)return;
 const x=Math.max(-100,Math.min(100,Math.round((drag.x+p.x-drag.start.x)*2)/2)),z=Math.max(-100,Math.min(100,Math.round((drag.z+p.z-drag.start.z)*2)/2));
 roomObjects.get(drag.id).g.position.set(x-drag.x,0,z-drag.z);$('edit-x').value=x;$('edit-z').value=z;
}
function finishRoomDrag(event,cancel=false){
 if(!drag||event.pointerId!==drag.pointer)return;const d=drag,g=roomObjects.get(d.id).g,patch={x:d.x+g.position.x,z:d.z+g.position.z};drag=null;controls.enabled=true;g.position.set(0,0,0);
 if(d.element.hasPointerCapture(d.pointer))d.element.releasePointerCapture(d.pointer);
 if(!cancel&&editor.updateRoom(d.id,patch))afterEdit(d.id+' 已移動');else syncEditor();
}
function initEditor(){
 sceneFiles=createSceneFileUI({editor,onLoaded:onSceneLoaded,onExportFallback:()=>{if(!$('export-dialog').open)$('edit-export').click();}});sceneFiles.init();
 let importRead=0;
 for(const f of floors)$('edit-floor').add(new Option(floorName(f),String(f)));
 $('edit-toggle').onclick=()=>setEditMode(false);
 $('room-create-start').onclick=startRoomCreation;
 $('stair-link-start').onclick=()=>editing?setEditMode(true):openStairLink();
 $('edit-mode-switch').onclick=()=>setEditMode(!isEditMode());
 $('stair-3d-done').onclick=()=>setEditMode(false);
 $('stair-3d-undo').onclick=()=>{stairDrag3D?.cancel();objectEdit3D?.cancel();if(editor.undo())afterEdit('已復原');};
 $('stair-3d-redo').onclick=()=>{stairDrag3D?.cancel();objectEdit3D?.cancel();if(editor.redo())afterEdit('已重做');};
 $('object-3d-up').onclick=()=>objectEdit3D?.moveFloor(1);$('object-3d-down').onclick=()=>objectEdit3D?.moveFloor(-1);
 $('edit-drag').onclick=()=>setDragMode(!dragMode);
 $('edit-form').onsubmit=event=>{event.preventDefault();if(!$('edit-form').reportValidity())return;try{const patch={name:$('edit-name').value};for(const key of ['x','z','floor','w','d','offset'])patch[key]=Number($('edit-'+key).value);const previous=nodeMap.get(state.selected).floor;if(editor.updateRoom(state.selected,patch))afterEdit(state.selected+' 已套用',previous!==patch.floor);else editorStatus('配置沒有變更。');}catch(error){editorStatus(error.message,true);}};
 $('edit-form').oninput=()=>editorStatus('欄位尚未套用；完成後按「套用修改」。');
 $('edit-undo').onclick=()=>{if(editor.undo())afterEdit('已復原',true);};$('edit-redo').onclick=()=>{if(editor.redo())afterEdit('已重做',true);};
 $('edit-save').onclick=()=>editorStatus(persistLayout()?'已儲存目前配置到此瀏覽器。跨電腦請匯出 JSON。':'瀏覽器無法儲存，請匯出 JSON 備份。');
 $('edit-export').onclick=()=>{$('export-json').value=JSON.stringify(editor.snapshot(),null,2);$('export-status').textContent='下載檔案，或複製內容另存為 .json，即可在其他電腦匯入。';$('export-dialog').showModal();};
 $('export-close').onclick=()=>$('export-dialog').close();
 $('export-copy').onclick=async()=>{try{await navigator.clipboard.writeText($('export-json').value);$('export-status').textContent='已複製配置 JSON。';}catch{$('export-json').focus();$('export-json').select();$('export-status').textContent='已選取全部內容，請按 Ctrl+C 複製。';}};
 $('export-download').onclick=()=>{const blob=new Blob([$('export-json').value],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='dead-signal-layout.json';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);$('export-status').textContent='已送出下載請求。若瀏覽器未下載，請使用「複製 JSON」。';};
 $('edit-import').onclick=()=>{importRead++;$('import-json').value='';$('import-file').value='';$('import-error').textContent='';$('import-dialog').showModal();};
 $('import-cancel').onclick=()=>{importRead++;$('import-dialog').close();};
 $('import-dialog').addEventListener('cancel',()=>{importRead++;});
 $('import-json').oninput=()=>{importRead++;};
 $('import-file').onchange=async event=>{const read=++importRead,file=event.target.files[0];if(!file)return;$('import-json').value='';try{if(file.size>128000000)throw Error('檔案超過 128 MB，請選擇匯出的場景 JSON。');const text=await file.text();if(read!==importRead||!$('import-dialog').open)return;$('import-json').value=text;$('import-error').textContent='';}catch(error){if(read===importRead)$('import-error').textContent='無法讀取檔案：'+error.message;}};
 $('import-apply').onclick=()=>{try{sceneFiles.loadText($('import-json').value,'匯入的場景');importRead++;$('import-dialog').close();}catch(error){$('import-error').textContent='載入失敗：'+error.message;}};
 $('edit-reset').onclick=()=>{if(editor.reset())afterEdit('已還原初始配置；可按復原回到剛才的版本',true);};
 host.addEventListener('pointermove',moveRoomDrag);host.addEventListener('pointerup',event=>finishRoomDrag(event));host.addEventListener('pointercancel',event=>finishRoomDrag(event,true));
 try{const saved=localStorage.getItem(storageKey)||localStorage.getItem('dead-signal-building-layout-v1');if(saved){editor.apply(JSON.parse(saved));editorStatus('已載入此瀏覽器的上次配置。');}else editorStatus('修改後自動暫存；匯出 JSON 可跨電腦保留。');}catch{editorStatus('無法讀取瀏覽器暫存，使用初始配置。可匯入 JSON。',true);}
}
function init(){
 scene=new THREE.Scene();camera=new THREE.OrthographicCamera(-60,60,60,-60,.1,1500);renderer=new THREE.WebGLRenderer({antialias:true,alpha:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.setSize(host.clientWidth,host.clientHeight);renderer.outputColorSpace=THREE.SRGBColorSpace;host.append(renderer.domElement);renderer.domElement.setAttribute('aria-label','可旋轉的大樓房間與走道模型');
 scene.add(new THREE.HemisphereLight(0xd9edff,0x384858,2.4));const sun=new THREE.DirectionalLight(0xffe2b7,2.3);sun.position.set(40,100,65);scene.add(sun);const fill=new THREE.DirectionalLight(0x88bbff,1.4);fill.position.set(-50,40,-30);scene.add(fill);
 controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.dampingFactor=.08;controls.minZoom=.35;controls.maxZoom=8;controls.minDistance=5;controls.maxDistance=1200;controls.maxPolarAngle=Math.PI*.93;
 groups.forEach(g=>{const b=document.createElement('button');b.dataset.group=g.id;b.innerHTML=`<b>${g.range}</b><small>${g.title}</small>`;b.onclick=()=>{setDragMode(false);selectGroup(g.id);};$('floor-list').append(b);});
 data.nodes.forEach(n=>{const o=document.createElement('option');o.value=n.id;o.textContent=n.id+' · '+n.name;$('room-picker').append(o);});
 $('floor-only').onchange=e=>{roomCreate?.cancel();stairDrag3D?.clearSelection();objectEdit3D?.clearSelection();routeFocus=false;state.floor=e.target.value==='all'?null:Number(e.target.value);state.group='all';if(state.floor!==null){const n=data.nodes.find(n=>n.floor===state.floor);if(n){state.selected=n.id;updateDetails();history.replaceState(null,'','#scene='+n.id);}}else setDragMode(false);mouseEditor?.enabled&&mouseEditor.floorChanged();applyVisibility();updateRouteOverlay();fitCamera();};
 const initial=new URLSearchParams(location.hash.slice(1)).get('scene');if(nodeMap.has(initial)&&!nodeMap.get(initial).terminal)state.selected=initial;
 $('room-picker').onchange=e=>mouseEditor?.enabled?mouseEditor.selectRoom(e.target.value):selectRoom(e.target.value);$('height-mode').onchange=e=>{state.height=e.target.value;rebuild();};$('spread').oninput=e=>{state.spread=Number(e.target.value);$('spread-value').textContent=state.spread;rebuild();};
 ['shell','special','labels'].forEach(id=>$(id).onchange=e=>{state[id]=e.target.checked;applyVisibility();});['iso','front','top'].forEach(id=>$(id).onclick=()=>{if(id!=='top')setDragMode(false);state.view=id;if(mouseEditor?.enabled){controls.enableRotate=id!=='top';controls.mouseButtons.LEFT=id==='top'?THREE.MOUSE.PAN:THREE.MOUSE.ROTATE;}fitCamera();});$('reset').onclick=()=>{setDragMode(false);state.view='iso';fitCamera();};
 $('perspective').onclick=togglePerspective;
 $('prev').onclick=()=>{const i=data.nodes.findIndex(n=>n.id===state.selected);if(i>0)selectRoom(data.nodes[i-1].id);};$('next').onclick=()=>{const i=data.nodes.findIndex(n=>n.id===state.selected);if(i<data.nodes.length-1)selectRoom(data.nodes[i+1].id);};
 window.addEventListener('hashchange',()=>{const id=new URLSearchParams(location.hash.slice(1)).get('scene');if(nodeMap.has(id))selectRoom(id);});
 function roomAt(e){const r=renderer.domElement.getBoundingClientRect(),ray=new THREE.Raycaster();ray.setFromCamera(new THREE.Vector2((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1),camera);return ray.intersectObjects(roomMeshes.filter(m=>m.parent.visible))[0]?.object.userData.node;}
 function edgeAt(e){const r=renderer.domElement.getBoundingClientRect(),ray=new THREE.Raycaster();ray.params.Line.threshold=.3;ray.setFromCamera(new THREE.Vector2((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1),camera);return ray.intersectObjects(visibleEdgeObjects().filter(o=>o.g.visible).map(o=>o.g),true)[0];}
 let down;renderer.domElement.addEventListener('pointerdown',e=>{if(mouseEditor?.enabled||stairDrag3D?.enabled||roomCreate?.active){down=null;return;}down=[e.clientX,e.clientY];if(dragMode){const id=roomAt(e);if(id)startRoomDrag(e,id);}});renderer.domElement.addEventListener('pointerup',e=>{if(mouseEditor?.enabled||stairDrag3D?.enabled||roomCreate?.active)return;if(!down||Math.hypot(e.clientX-down[0],e.clientY-down[1])>5)return;const hit=edgeAt(e),edge=hit?.object.userData.edge;if(editing&&sandbox?.mode==='route'&&edge){sandbox.selectEdge(edge);return;}const id=roomAt(e);if(id)selectRoom(id);});
 new ResizeObserver(()=>{renderer.setSize(host.clientWidth,host.clientHeight);const a=host.clientWidth/host.clientHeight;if(camera.isPerspectiveCamera)camera.aspect=a;else{camera.left=-camera.top*a;camera.right=camera.top*a;}camera.updateProjectionMatrix();}).observe(host);
 initEditor();rebuild();setupSandbox();setupMouseEditor();setupStairDrag3D();setupObjectEdit3D();setupRoomCreation();const restored=new URLSearchParams(location.hash.slice(1)).get('scene');if(data.nodes.some(n=>n.id===restored))state.selected=restored;updateDetails();setEditMode(false);$('loading').remove();
 renderer.setAnimationLoop(()=>{roomCreate?.update();if(!roomCreate?.active&&!stairDrag3D?.dragging&&!objectEdit3D?.dragging)controls.update();stairDrag3D?.update();objectEdit3D?.update();renderer.render(scene,camera);renderTags();renderRouteMarkers();mouseEditor?.render();});
}
try{init();}catch(error){$('loading')?.remove();$('error').style.display='block';$('error').textContent='3D 模型無法啟動。請使用支援 WebGL 的瀏覽器並開啟硬體加速。'+error.message;console.error(error);}
