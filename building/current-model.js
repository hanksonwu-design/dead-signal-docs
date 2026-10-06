import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import graph from '../scene_graph.json';
import flow from '../scene-flow.json';
import {buildCurrentModel,FLOORS,floorName} from './current-spatial.js';
import {dressCurrentRoom} from './current-props.js';
import {sharedGlassBoundary} from './story-props.js';
import {clipRouteToHeight} from './floor-route-view.js';
import {dressTransition,transitionFor} from './transition-spaces.js';
import {showSceneNames,placeModelLabel} from './model-label-layout.js';
import {createElement,KeyRound,Puzzle,Clapperboard,Ghost,Skull} from 'lucide';
import markerData from './scene-markers.json';
import {MARKER_CATEGORIES} from './marker-definitions.js';
import {showContentMarkers,markerPosition,markerInContext} from './model-markers.js';
import {searchScenes,sceneMatches,sceneArtwork,connectedRoutes} from './scene-workspace.js';
import {createFlowPanel} from './flow-panel.js';
import {SCALE,stairFlight,addScaleReference,referenceSpot} from './human-scale.js';

const $=id=>document.getElementById(id);
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const source=(doc,heading)=>'../#'+new URLSearchParams({doc,heading});
const link=(label,doc,heading)=>`<a href="${esc(source(doc,heading))}" target="_blank" rel="noopener noreferrer">${esc(label)} ↗</a>`;
const locationLabel=(item,back=false)=>`${back?item.building.reverseLabel:item.building.label} · ${back?item.floor.reverseLabel:item.floor.label}`;
let model=buildCurrentModel(graph,flow),selected='R6',routeId='',shotId='',reverse=false,scope='all',floor=null,view='iso';
const node=id=>model.nodes.find(n=>n.id===id),shot=id=>model.shots.find(s=>s.id===id),route=()=>model.routes.find(r=>r.id===routeId);
const host=$('canvas-host'),colors=[0x719eae,0x8bab8e,0x6fae9c,0x93a8bd,0xbd969c,0xc2aa7e,0x8dabbe,0xb69aa6,0x87b5ad,0xbdc5ae];
let renderer,camera,controls,scene,root,resizeObserver;
let roomObjects=[],routeObjects=[],shotObjects=[],labels=[],floorLabels=[],visiblePoints=[];
let namesAtScale=false;
let flowPanel,webglReady=false;
let scaleReference;
const filters=()=>({part:$('part').value,act:$('act').value,query:$('search').value,floor});
function renderFlow(){flowPanel?.render({scene:selected,shot:shotId,route:routeId,visibleIds:[...new Set(searchScenes(graph,flow,filters()).map(n=>n.node))]});}
let markerPins=[],markerId='',markersAtScale=false;
const markerIcons={item:KeyRound,puzzle:Puzzle,event:Clapperboard,horror:Ghost,boss:Skull};
const markerById=new Map(markerData.markers.map(m=>[m.id,m]));
const markerIcon=category=>createElement(markerIcons[category],{width:16,height:16,'aria-hidden':'true',focusable:'false'});
const categoryEnabled=category=>$(`marker-${category}`).checked;
function initMarkers(){
 $('scene-list').insertAdjacentHTML('beforebegin',`<fieldset class="marker-filters"><legend><label><input id="content-markers" type="checkbox" checked>內容標示</label></legend><div class="checks">${Object.entries(MARKER_CATEGORIES).map(([id,title])=>`<label data-category="${id}" title="${esc(title)}"><input id="marker-${id}" type="checkbox" checked>${esc(title)}</label>`).join('')}</div></fieldset>`);
 for(const label of document.querySelectorAll('.marker-filters [data-category]'))label.insertBefore(markerIcon(label.dataset.category),label.childNodes[1]);
 $('node-links').insertAdjacentHTML('afterend','<section id="marker-section"><h3>場景重點 <small id="marker-count"></small></h3><ul id="marker-list"></ul><p id="marker-empty" class="reading" hidden>此分類沒有標示</p><div id="marker-detail" tabindex="-1" hidden></div></section>');
 for(const id of ['content-markers',...Object.keys(MARKER_CATEGORIES).map(c=>'marker-'+c)])$(id).onchange=()=>{
  if(markerId&&!categoryEnabled(markerById.get(markerId).category))markerId='';
  renderMarkers();applyVisibility();saveHash();
 };
 $('marker-list').onclick=e=>{const b=e.target.closest('[data-marker-select]');if(b)selectMarker(b.dataset.markerSelect,true);};
}
function buildMarkerPins(){
 for(const m of markerData.markers){
  const p=markerPosition(m,model);if(!p)continue;
  const el=document.createElement('button'),name=document.createElement('span');
  el.className='content-marker';el.dataset.marker=m.id;el.dataset.category=m.category;
  name.textContent=m.title;el.append(markerIcon(m.category),name);name.hidden=true;
   el.title=`${MARKER_CATEGORIES[m.category]}${m.timing?' · '+m.timing:''} · ${m.title} · ${m.shot||m.node} · 場景內位置示意`;
  el.setAttribute('aria-label',el.title);el.hidden=true;el.onclick=()=>selectMarker(m.id,false);host.append(el);
  markerPins.push({el,name,m,position:new THREE.Vector3(...p),sizes:{},enabled:false});
 }
}
function renderMarkers(){
 const alternate=route()?.steps.some(s=>s.id===(shotId||selected)&&s.image!==(shotId?shot(shotId):node(selected)).image);
 $('marker-section').hidden=!!alternate;
 const items=markerData.markers.filter(m=>markerInContext(m,selected,shotId)&&categoryEnabled(m.category));
 if(markerId&&!items.some(m=>m.id===markerId))markerId='';
 $('marker-count').textContent=`${items.length}`;$('marker-empty').hidden=!!items.length;
  $('marker-list').innerHTML=items.map(m=>`<li><button data-marker-select="${m.id}" data-category="${m.category}" aria-pressed="${markerId===m.id}"><span>${esc(m.title)}</span><small>${MARKER_CATEGORIES[m.category]}${m.timing?' · '+esc(m.timing):''} · ${m.image}</small></button></li>`).join('');
 for(const button of $('marker-list').querySelectorAll('button'))button.prepend(markerIcon(button.dataset.category));
 const m=markerById.get(markerId);$('marker-detail').hidden=!m;
  $('marker-detail').innerHTML=m?`<h4>${esc(m.title)}</h4><p class="marker-meta">${MARKER_CATEGORIES[m.category]}${m.timing?' · '+esc(m.timing):''} · ${node(m.node).spatial?'場景內位置示意':'非實體演出節點'}</p><p class="reading">${esc(m.content)}</p>${m.play?`<p class="route-rule"><b>辨路依據</b> ${esc(m.play.clue)}</p><p class="route-rule"><b>操作</b> ${esc(m.play.action)}</p><p class="route-rule"><b>復原</b> ${esc(m.play.recovery)}</p>`:''}<details class="details"><summary>條件與製作要求</summary><p>${esc(m.requirements)}</p></details><div class="links">${link('原文依據',m.source,m.heading)}${link(m.image,m.spec,m.specHeading)}</div>`:'';
 for(const p of markerPins)p.el.setAttribute('aria-pressed',String(p.m.id===markerId));
}
function selectMarker(id,refit){
 const m=markerById.get(id);if(!m)return;
 $('content-markers').checked=true;$(`marker-${m.category}`).checked=true;if(m.shot)$('shots').checked=true;
 choose(m.node,m.shot?shot(m.shot).route:null,m.shot,false,true);markerId=id;
 renderMarkers();applyVisibility();saveHash();if(refit)focus();
 $('marker-detail').focus({preventScroll:true});
 if(matchMedia('(max-width:800px)').matches)$('marker-detail').scrollIntoView({block:'center',behavior:'instant'});
}
function placeMarkers(bounds,occupied,w,h,scale){
 markersAtScale=showContentMarkers(scale,markersAtScale);
 const sorted=[...markerPins].sort((a,b)=>Number(b.m.id===markerId)-Number(a.m.id===markerId)||Number(markerInContext(b.m,selected,shotId))-Number(markerInContext(a.m,selected,shotId)));
 for(const l of sorted){
  if(!l.enabled||!markersAtScale){l.el.hidden=true;continue;}
  const p=l.position.clone().project(camera),x=(p.x+1)*w/2,y=(1-p.y)*h/2;
  let rect=null;
  for(const named of scale>=12||l.m.id===markerId?[true,false]:[false]){
   l.name.hidden=!named;l.el.hidden=false;
   const size=l.sizes[String(named)]??={width:l.el.offsetWidth,height:l.el.offsetHeight};
   rect=placeModelLabel({x,y,z:p.z,...size},bounds,occupied);if(rect)break;
  }
  l.el.hidden=!rect;if(rect){occupied.push(rect);l.el.style.left=(rect[0]+rect[2])/2+'px';l.el.style.top=rect[3]+'px';}
 }
}
const material=(color,opacity=1)=>new THREE.MeshStandardMaterial({color,roughness:.8,metalness:.08,transparent:opacity<1,opacity,depthWrite:opacity>=1});
function box(w,h,d,x,y,z,mat,parent){const o=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);o.position.set(x,y,z);parent.add(o);return o;}
function line(points,color,parent){const o=new THREE.Line(new THREE.BufferGeometry().setFromPoints(points.map(p=>new THREE.Vector3(...p))),new THREE.LineBasicMaterial({color,transparent:true,opacity:.7}));parent.add(o);return o;}
function segment(a,b,w,h,mat,parent){const start=new THREE.Vector3(...a),end=new THREE.Vector3(...b),o=new THREE.Mesh(new THREE.BoxGeometry(w,h,start.distanceTo(end)),mat);o.position.copy(start).add(end).multiplyScalar(.5);o.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),end.sub(start).normalize());parent.add(o);return o;}
function dispose(group){group.traverse(o=>{o.geometry?.dispose();for(const m of o.material?(Array.isArray(o.material)?o.material:[o.material]):[])m.dispose();});}
function pathMesh(points,color,parent){
 const mat=material(color,.85),steps=[];
 for(let i=1;i<points.length;i++) {
  const a=points[i-1],b=points[i],dy=b[1]-a[1],dx=b[0]-a[0],dz=b[2]-a[2],horizontal=Math.hypot(dx,dz);
  if(Math.hypot(dx,dy,dz)<.01)continue;
  if(Math.abs(dy)>.1&&horizontal<.05){for(const x of[-.85,.85])line([[a[0]+x,a[1],a[2]],[b[0]+x,b[1],b[2]]],0xdac48a,parent);}
  else if(Math.abs(dy)>.1){
   const {count,going}=stairFlight(a,b);
   for(let j=0;j<count;j++){const p=a.map((v,k)=>v+(b[k]-v)*(j+.5)/count);p[1]=Math.min(a[1],b[1])+Math.abs(dy)*(dy>0?j+1:count-j)/count-SCALE.treadThickness/2;steps.push({p,angle:Math.atan2(dx,dz),depth:going+.015});}
   for(const side of [-1,1]){
    const ox=dz/horizontal*side*(SCALE.corridorWidth/2-.05),oz=-dx/horizontal*side*(SCALE.corridorWidth/2-.05);
    segment([a[0]+ox,a[1]-.15,a[2]+oz],[b[0]+ox,b[1]-.15,b[2]+oz],.06,.09,mat,parent);
    line([[a[0]+ox,a[1]+SCALE.railHeight,a[2]+oz],[b[0]+ox,b[1]+SCALE.railHeight,b[2]+oz]],color,parent);
    const posts=Math.max(1,Math.ceil(horizontal/1.2));
    for(let j=0;j<=posts;j++){const t=j/posts;box(.035,SCALE.railHeight,.035,a[0]+dx*t+ox,a[1]+dy*t+SCALE.railHeight/2,a[2]+dz*t+oz,mat,parent);}
   }
  }
  else segment([a[0],a[1]-.06,a[2]],[b[0],b[1]-.06,b[2]],SCALE.corridorWidth,.12,mat,parent);
 }
 if(steps.length){const inst=new THREE.InstancedMesh(new THREE.BoxGeometry(1,SCALE.treadThickness,1),mat,steps.length),dummy=new THREE.Object3D();steps.forEach((s,i)=>{dummy.position.set(...s.p);dummy.rotation.y=s.angle;dummy.scale.set(SCALE.corridorWidth,1,s.depth);dummy.updateMatrix();inst.setMatrixAt(i,dummy.matrix);});inst.userData.fixture='stair-treads';parent.add(inst);}
 line(points.map(p=>[p[0],p[1]+.15,p[2]]),color,parent);
}
function pathArrows(points,back,color,parent){
 const runs=points.slice(1).map((p,i)=>({a:points[i],b:p,length:Math.hypot(...p.map((v,k)=>v-points[i][k]))})).filter(p=>p.length>1.2).sort((a,b)=>b.length-a.length);
 if(!runs.length)return;const {a,b}=runs[0],start=new THREE.Vector3(...a),end=new THREE.Vector3(...b),dir=end.clone().sub(start).normalize();
 for(const reversed of back?[false,true]:[false]){const arrow=new THREE.Mesh(new THREE.ConeGeometry(.32,.85,5),material(color));arrow.position.copy(start).lerp(end,reversed?.3:.7);arrow.position.y+=.3;arrow.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),dir.clone().multiplyScalar(reversed?-1:1));parent.add(arrow);}
}
function opening(n,p){const sides=[['west',Math.abs(p[0]-(n.x-n.w/2)),p[2]-n.z],['east',Math.abs(p[0]-(n.x+n.w/2)),p[2]-n.z],['north',Math.abs(p[2]-(n.z-n.d/2)),p[0]-n.x],['south',Math.abs(p[2]-(n.z+n.d/2)),p[0]-n.x]];return sides.sort((a,b)=>a[1]-b[1])[0];}
function walls(n,g){
 if(['R4b','R10','R22','M1','U2b','U4b','U6b'].includes(n.id))return;
 const exits=model.routes.filter(r=>r.spatial&&(r.from===n.id||r.to===n.id)).map(r=>opening(n,r.from===n.id?r.points[0]:r.points.at(-1)));
 const glass=sharedGlassBoundary({...node('R19'),floor:node('R19').level},{...node('R20'),floor:node('R19').level});
 for(const side of ['north','south','east','west']){
  if(glass&&(n.id==='R19'&&side===glass.sideA||n.id==='R20'&&side===glass.sideB))continue;
  const horizontal=['north','south'].includes(side),length=horizontal?n.w:n.d;
  const fixed=horizontal?n.z+(side==='north'?-n.d/2:n.d/2):n.x+(side==='west'?-n.w/2:n.w/2);
  const gaps=exits.filter(e=>e[0]===side).map(e=>[Math.max(-length/2,e[2]-SCALE.doorWidth/2-.06),Math.min(length/2,e[2]+SCALE.doorWidth/2+.06)]).sort((a,b)=>a[0]-b[0]);
  const height=$('full-walls').checked?SCALE.wallHeight:1.1;
  let cursor=-length/2;const piece=end=>{if(end>cursor+.03){const center=(cursor+end)/2;box(horizontal?end-cursor:.12,height,horizontal?.12:end-cursor,horizontal?n.x+center:fixed,n.y+SCALE.floorSurface+height/2,horizontal?fixed:n.z+center,material(colors[n.act]||0x92a8a0,.22),g);}};
  for(const [lo,hi] of gaps){piece(lo);cursor=Math.max(cursor,hi);}piece(length/2);
  for(const [lo,hi] of gaps){
   const center=(lo+hi)/2,mat=material(0xc2b897),top=n.y+SCALE.floorSurface+SCALE.doorHeight;
   const frame=box(horizontal?hi-lo:.1,.07,horizontal?.1:hi-lo,horizontal?n.x+center:fixed,top+.035,horizontal?fixed:n.z+center,mat,g);frame.userData.fixture='door-header';
   for(const at of [lo+.03,hi-.03])box(horizontal?.06:.1,SCALE.doorHeight,horizontal?.1:.06,horizontal?n.x+at:fixed,top-SCALE.doorHeight/2,horizontal?fixed:n.z+at,mat,g);
  }
 }
}
function label(id,position,isShot){
 const el=document.createElement('button');el.className='model-label'+(isShot?' shot':'');el.dataset[isShot?'shot':'node']=id;
 const itemData=isShot?shot(id):node(id),code=document.createElement('span'),name=document.createElement('small');
 code.className='model-label-code';code.textContent=id;name.className='model-label-name';name.textContent=itemData.name;name.hidden=true;el.append(code,name);
 el.title=`${id} · ${itemData.name} · ${locationLabel(itemData)}`;el.setAttribute('aria-label',el.title);
 el.onclick=()=>choose(isShot?shot(id).node:id,isShot?shot(id).route:null,isShot?id:'',false);host.append(el);
 const item={el,name,id,position:new THREE.Vector3(...position),isShot,enabled:true,hovered:false,sizes:{}};
 el.onpointerenter=()=>{item.hovered=true;};el.onpointerleave=()=>{item.hovered=false;};labels.push(item);return item;
}
function latticeGate(x,y,z,parent){
 const mat=material(0xc8b891),half=SCALE.liftDoorWidth/2,h=SCALE.doorHeight;
 for(const side of[-1,1])box(.06,h,.06,x+side*(half+.03),y+h/2,z,mat,parent);
 for(let i=0;i<5;i++){const left=x-half+i*SCALE.liftDoorWidth/5,right=left+SCALE.liftDoorWidth/5;line([[left,y+.08,z],[right,y+h-.08,z]],0xd2c29b,parent);line([[left,y+h-.08,z],[right,y+.08,z]],0xd2c29b,parent);}
 box(SCALE.liftDoorWidth+.12,.07,.06,x,y+h+.035,z,mat,parent);
}
function build(){
 if(!webglReady)return;
 if(root){scene.remove(root);dispose(root);}for(const l of [...labels,...floorLabels,...markerPins])l.el.remove();labels=[];floorLabels=[];markerPins=[];roomObjects=[];routeObjects=[];shotObjects=[];
 root=new THREE.Group();scene.add(root);
 const glass=sharedGlassBoundary({...node('R19'),floor:node('R19').level},{...node('R20'),floor:node('R19').level});
 for(const n of model.nodes.filter(n=>n.spatial)){
  const g=new THREE.Group();root.add(g);g.userData.node=n.id;
  if(n.id==='M1')pathMesh(n.points,0xdbb575,g);
  else {const base=box(n.w,SCALE.slab,n.d,n.x,n.y+SCALE.floorSurface-SCALE.slab/2,n.z,material(colors[n.act]||0x94b4a3,.65),g);walls(n,g);dressCurrentRoom(n,g,{THREE,box,material,line,segment,y:n.y+SCALE.floorSurface});const outline=new THREE.BoxHelper(base,0xf0c878);g.add(outline);g.userData.outline=outline;}
  if(n.id==='R19'&&glass)box(glass.x2-glass.x1,2,.08,(glass.x1+glass.x2)/2,n.y+SCALE.floorSurface+1.25,glass.z,material(0x82ccc7,.3),g);
  if(n.id!=='M1'){
   const fixtures=g.children.filter(o=>o.userData.fixture&&o.userData.fixture!=='door-header'&&o.userData.fixture!=='pipe');
   const obstacles=fixtures.map(o=>{const b=new THREE.Box3().setFromObject(o);return {minX:b.min.x,maxX:b.max.x,minZ:b.min.z,maxZ:b.max.z};});
   g.userData.referenceSpot=referenceSpot(n,obstacles);
  }
  g.traverse(o=>{o.userData.node=n.id;});roomObjects.push({n,g});
  label(n.id,n.id==='M1'?n.position:[n.x,n.y+3,n.z],false);
 }
 for(const r of model.routes.filter(r=>r.spatial)){
  const color=['捷徑','誤導'].includes(r.kind)?0xac9acc:r.back?0x85bdae:0xd7b371;
  const g=new THREE.Group();root.add(g);pathMesh(r.points,color,g);pathArrows(r.points,r.back,color,g);g.traverse(o=>{o.userData.route=r.id;});routeObjects.push({r,g,color,sliced:null});
  for(const [index,s] of r.shots.entries()){
   const g=new THREE.Group();root.add(g);const p=s.position;
   const definition=transitionFor(r)||{id:`${r.from}-${r.to}`,views:[{kind:r.from==='R24'?'dining':'service'}]};
   const nearest=r.points.slice(1).map((b,i)=>({a:r.points[i],b})).filter(({a,b})=>Math.hypot(b[0]-a[0],b[2]-a[2])>.01).sort((u,v)=>Math.hypot(...u.a.map((x,i)=>x-p[i]))-Math.hypot(...v.a.map((x,i)=>x-p[i])))[0];
   const length=Math.hypot(nearest.b[0]-nearest.a[0],nearest.b[2]-nearest.a[2]),direction=[(nearest.b[0]-nearest.a[0])/length,0,(nearest.b[2]-nearest.a[2])/length];
   const station={...definition.views[index]||definition.views[0],position:p,direction,index};
   if(s.travel.startsWith('電梯')){
    const frame=s.travel==='電梯車廂'?new THREE.Group():g;
    if(frame!==g){g.add(frame);g.userData.cabin=frame;}
    latticeGate(p[0],p[1],p[2]+SCALE.liftDepth/2,frame);
    if(s.travel==='電梯車廂'){box(SCALE.liftWidth,.12,SCALE.liftDepth,p[0],p[1]-.06,p[2],material(0xa5b3a1),frame);box(SCALE.liftWidth,SCALE.liftHeight,.08,p[0],p[1]+SCALE.liftHeight/2,p[2]-SCALE.liftDepth/2,material(0x697c75,.3),frame);for(const side of[-1,1])box(.06,SCALE.liftHeight,SCALE.liftDepth,p[0]+side*SCALE.liftWidth/2,p[1]+SCALE.liftHeight/2,p[2],material(0x697c75,.18),frame);}
   } else dressTransition(r,r.points,g,{THREE,box,material,line,segment,floorY:model.floorY,definition,views:[station],hideLabels:true});
   if(s.play&&s.travel==='步道'){
    // A blocked former stair contrasts with the connected side path, not another live exit.
    box(2.2,.16,1.6,p[0]+3.5,p[1],p[2],material(0x7c6660),g);
    box(.18,1.2,1.6,p[0]+4.5,p[1]+.6,p[2],material(0xa57b68),g);
    line([[p[0]+4.62,p[1]+.2,p[2]-.6],[p[0]+4.62,p[1]+1,p[2]+.6]],0xe6b488,g);
   }
   box(1.2,.14,1.2,p[0],p[1]-.07,p[2],material(0x80c4ac),g);g.traverse(o=>{o.userData.shot=s.id;});shotObjects.push({s,g});label(s.id,[p[0],p[1]+3,p[2]],true);
  }
 }
 for(const tower of model.towers)for(const f of FLOORS.filter(f=>f>0&&f<=tower.top)){
  const y=model.floorY.get(f),g=new THREE.Group(),x=tower.x;root.add(g);
  const geometry=new THREE.BufferGeometry().setFromPoints([[x-27,y,-24],[x+27,y,-24],[x+27,y,24],[x-27,y,24],[x-27,y,-24]].map(p=>new THREE.Vector3(...p)));
  const guide=new THREE.Line(geometry,new THREE.LineDashedMaterial({color:tower.color,transparent:true,opacity:.24,depthWrite:false,dashSize:1.4,gapSize:1.2}));
  guide.computeLineDistances();g.add(guide);
  const el=document.createElement('span');el.className='floor-label';el.textContent=`${tower.id} 棟 · ${floorName(f)}`;el.dataset.tower=tower.id;host.append(el);
  floorLabels.push({el,position:new THREE.Vector3(x+27,y,25),floor:f,g});
 }
 scaleReference=addScaleReference(root,{THREE,box,material,line});buildMarkerPins();applyVisibility();
}
function contextNode(){return node(selected).spatial?node(selected):node('R32');}
function roomVisible(n){
 if(!sceneMatches(n,{part:$('part').value}))return false;
 if(floor!==null)return n.floor.levels.includes(floor);
 if(scope==='route'){const r=route();return r?(r.from===n.id||r.to===n.id):n.id===contextNode().id;}
 if(scope==='act')return n.act===contextNode().act||model.routes.some(r=>r.spatial&&(r.from===n.id&&node(r.to).act===contextNode().act||r.to===n.id&&node(r.from).act===contextNode().act));
 return true;
}
function applyVisibility(){
 visiblePoints=[];
 for(const o of roomObjects){const {n,g}=o;if(o.sliced){root.remove(o.sliced);dispose(o.sliced);o.sliced=null;}g.visible=roomVisible(n);if(g.userData.outline)g.userData.outline.visible=n.id===selected&&!shotId;if(g.visible){if(n.id==='M1'){
   if(floor===null)visiblePoints.push(...n.points);
   else {g.visible=false;o.sliced=new THREE.Group();root.add(o.sliced);for(const p of clipRouteToHeight(n.points,model.floorY.get(floor)-.01,model.floorY.get(floor)+SCALE.floorHeight-.05)){pathMesh(p,0xdbb575,o.sliced);visiblePoints.push(...p);}o.sliced.traverse(obj=>{obj.userData.node='M1';});}
  }else visiblePoints.push([n.x-n.w/2,n.y-2,n.z-n.d/2],[n.x+n.w/2,n.y+3,n.z+n.d/2]);}}
 const bounds=floor===null?null:[model.floorY.get(floor)-2,model.floorY.get(floor)+SCALE.floorHeight-.05];
 for(const o of routeObjects){
  if(o.sliced){root.remove(o.sliced);dispose(o.sliced);o.sliced=null;}
  const inPart=[o.r.from,o.r.to].every(id=>sceneMatches(node(id),{part:$('part').value}));
  o.g.visible=inPart&&floor===null&&(scope==='all'||scope==='route'&&o.r.id===routeId||scope==='act'&&(node(o.r.from).act===contextNode().act||node(o.r.to).act===contextNode().act));
  if(o.g.visible)visiblePoints.push(...o.r.points);
  if(bounds&&inPart){const pieces=clipRouteToHeight(o.r.points,...bounds);if(pieces.length){o.sliced=new THREE.Group();root.add(o.sliced);for(const p of pieces){pathMesh(p,o.color,o.sliced);visiblePoints.push(...p);}o.sliced.traverse(obj=>{obj.userData.route=o.r.id;});}}
 }
 for(const {s,g} of shotObjects){
  g.visible=$('shots').checked&&sceneMatches(node(s.node),{part:$('part').value})&&(floor!==null?s.floor.levels.includes(floor):scope==='route'?s.route===routeId:scope==='act'?node(s.node).act===contextNode().act:true);
  // Cabin views depict different moments of one car, never simultaneous cars.
  if(g.userData.cabin)g.userData.cabin.visible=s.id===shotId;
 }
 for(const l of labels){const room=l.isShot?null:roomObjects.find(o=>o.n.id===l.id);l.enabled=$('labels').checked&&(l.isShot?shotObjects.find(o=>o.s.id===l.id).g.visible:room.g.visible||!!room.sliced);if(!l.enabled)l.el.hidden=true;if(l.id==='M1')l.position.set(...(floor===null?node('M1').position:[node('M1').x,model.floorY.get(floor)+2,20]));l.el.classList.toggle('selected',l.id===(shotId||selected));}
 for(const l of markerPins){
  const owner=l.m.shot?shotObjects.find(o=>o.s.id===l.m.shot):roomObjects.find(o=>o.n.id===l.m.node);
  l.enabled=$('content-markers').checked&&categoryEnabled(l.m.category)&&!!owner?.g.visible;
  // M1 spans floors; its overview annotations do not imply a precise window on a floor slice.
  if(l.m.node==='M1'&&floor!==null)l.enabled=false;
  if(l.m.shot&&owner?.g.userData.cabin&&!owner.g.userData.cabin.visible)l.enabled=false;
  if(!l.enabled)l.el.hidden=true;
 }
 for(const l of floorLabels){l.g.visible=$('floor-guides').checked&&scope==='all'&&(floor===null||floor===l.floor);l.enabled=l.g.visible&&(floor!==null||[...new Set(model.nodes.filter(n=>n.spatial).map(n=>n.level)),24,36].includes(l.floor));}
 updateScaleReference();
 $('view-title').textContent=floor!==null?`${floorName(floor)} 空間`:scope==='route'?(route()?reverse?`${route().to} → ${route().from}`:`${route().from} → ${route().to}`:'場景定位'):scope==='act'?graph.acts[contextNode().act]:'雙棟概覽';
 $('view-floor').textContent=floor!==null?floorName(floor):scope==='route'?(route()?locationLabel(route(),reverse):''):scope==='act'?locationLabel(contextNode()):'A 棟 1–26F · B 棟 1–50F · 共用地基';
}
function fit(points=visiblePoints){
 if(!webglReady||!controls)return;
 if(!points.length)points=[contextNode().position];
 const box=new THREE.Box3().setFromPoints(points.map(p=>new THREE.Vector3(...p))),center=box.getCenter(new THREE.Vector3());
 const direction=(view==='top'?new THREE.Vector3(.001,1,.001):view==='front'?new THREE.Vector3(0,.06,1):new THREE.Vector3(1,.65,1.25)).normalize();
 const right=new THREE.Vector3().crossVectors(new THREE.Vector3(0,1,0),direction).normalize(),up=new THREE.Vector3().crossVectors(direction,right).normalize();
 const projected=points.map(p=>new THREE.Vector3(...p).sub(center));
 const width=2*Math.max(...projected.map(p=>Math.abs(p.dot(right))))+4,height=2*Math.max(...projected.map(p=>Math.abs(p.dot(up))))+6;
 const aspect=Math.max(.2,host.clientWidth/host.clientHeight),extent=Math.max(height*host.clientHeight/Math.max(200,host.clientHeight-210),width*host.clientWidth/Math.max(200,host.clientWidth-60)/aspect,15)*1.03;
 camera.left=-extent*aspect/2;camera.right=extent*aspect/2;camera.top=extent/2;camera.bottom=-extent/2;camera.zoom=1;
 camera.position.copy(center).add(direction.multiplyScalar(250));camera.near=.1;camera.far=1500;camera.updateProjectionMatrix();controls.target.copy(center);controls.update();
 for(const id of ['iso','front','top'])$(id).setAttribute('aria-pressed',String(id===view));
}
function focus(){const n=shotId?shot(shotId):contextNode(),m=markerById.get(markerId),p=m?markerPosition(m,model)||n.position:n.position;fit([[p[0]-8,p[1]-5,p[2]-8],[p[0]+8,p[1]+7,p[2]+8]]);}
function updateScaleReference(){
 if(!scaleReference)return;
 const n=node(selected),s=shotId?shot(shotId):null,owner=s?shotObjects.find(o=>o.s.id===s.id):roomObjects.find(o=>o.n.id===n.id);
 const playback=route()?.steps.some(step=>step.id===selected&&step.image!==n.image);
 scaleReference.visible=$('human-scale').checked&&!playback&&!!owner?.g.visible;
 if(s)scaleReference.position.set(...s.position);
 else if(n.id==='M1')scaleReference.position.set(...n.position);
 else if(n.spatial){const spot=owner?.g.userData.referenceSpot;scaleReference.visible=scaleReference.visible&&!!spot;if(spot)scaleReference.position.set(spot[0],n.y+SCALE.floorSurface,spot[1]);}
}
function renderList(){
 const list=searchScenes(graph,flow,filters());
 $('scene-list').innerHTML=list.map(n=>`<li><button data-select="${n.node}" data-select-shot="${n.shot}" aria-pressed="${(shotId||selected)===n.id}"><span><b>${n.id}</b>${esc(n.name)}</span><small>${esc(locationLabel(n))}</small></button></li>`).join('');$('empty').hidden=!!list.length;
 renderFlow();
}
function renderDetails(){
 const n=node(selected),s=shotId?shot(shotId):null,current=s||n,r=route();
 $('node-id').textContent=s?`${s.id} · ${s.type}`:`${n.id} · ${graph.acts[n.act]}`;
 $('node-title').textContent=s?s.name:n.name;$('node-floor').textContent=locationLabel(current,reverse&&!!s);
 $('node-goal').textContent=s?flow.images[s.id].content:n.goal;
 $('metric-size').textContent=s?(s.travel==='電梯車廂'?`車廂 ${SCALE.liftWidth} × ${SCALE.liftDepth} × ${SCALE.liftHeight} 公尺 · 估算`:`步道參考寬 ${SCALE.corridorWidth} 公尺`):n.id==='M1'?`跨層夾道 · 參考寬 ${SCALE.corridorWidth} 公尺`:n.spatial?`${n.w} × ${n.d} 公尺 · 平面估算`:'非實體演出節點';
 $('node-spatial').textContent=s?`${s.from} → ${s.id} → ${s.to}`:n.floor.description;
 $('exploration').hidden=!s?.play;
 $('exploration').innerHTML=s?.play?`<h3>逐層探路</h3><p class="route-rule"><b>辨路依據</b> ${esc(s.play.clue)}</p><p class="route-rule"><b>操作與開通</b> ${esc(s.play.action)}</p><p class="route-rule"><b>錯路與復原</b> ${esc(s.play.recovery)}</p>`:'';
 const artwork=sceneArtwork(flow,current,r),primary=flow.images[r?.steps.find(step=>step.id===current.id)?.image||current.image];
 const playback=primary.id!==current.image,owner=playback?node(primary.node):current;
 if(playback){$('node-id').textContent=`${n.id} · ${graph.acts[owner.act]} · 後果演出`;$('node-title').textContent=n.name+'／肉身回返';$('node-goal').textContent=primary.content;}
 $('node-links').innerHTML=link('遊戲劇本',owner.source,owner.heading)+link('製作規格',owner.spec||owner.pack,owner.specHeading||owner.packAnchor)+link(primary.id,primary.spec,primary.heading);
 const phases=!s?graph.phases[n.id]||[]:[],quests=!s?n.quests:[];
 $('phases-section').hidden=!phases.length;$('phases').innerHTML=phases.map(p=>`<li>${esc(p)}</li>`).join('');
 $('quests-section').hidden=!quests.length;$('quests').innerHTML=quests.map(q=>`<li>${esc(q)}</li>`).join('');
 $('quest-links').innerHTML=quests.length?link('主支線與特殊收集', '03_敘事結構/03-05_主支線與特殊收集.md',''):'';
 const related=model.routes.filter(r=>r.from===n.id||r.to===n.id);
 $('route').innerHTML=related.map(r=>`<option value="${r.id}">${r.from} ${r.back?'↔':'→'} ${r.to} · ${esc(r.kind)}</option>`).join('');$('route').value=routeId;
 $('reverse').disabled=!r?.back;$('forward').setAttribute('aria-pressed',String(!reverse));$('reverse').setAttribute('aria-pressed',String(reverse));
 $('route-floor').textContent=r?locationLabel(r,reverse):'';
 const steps=r?(reverse?[...r.steps].reverse():r.steps):[];
 $('steps').innerHTML=steps.map(step=>{const item=step.type==='subscene'?shot(step.id):node(step.id);return `<li><button data-step="${step.id}" data-type="${step.type}" aria-pressed="${step.id===(shotId||selected)}"><strong>${step.id}</strong><span>${esc(item.name)}</span><small>${esc(locationLabel(item,reverse&&step.type==='subscene'))}</small><span>${step.image}${item.travel?' · '+item.travel:''}</span></button></li>`;}).join('');
 $('route-kind').textContent=r?`${r.kind} · ${r.back?'依條件回訪':'單向／演出銜接'} · ${r.travel.join('／')}`:'';
 $('gate').innerHTML=r?`<b>通行條件</b> ${esc(r.gate)}`:'';$('return-rule').innerHTML=r?`<b>回訪限制</b> ${esc(r.returnRule)}`:'';$('motion').textContent=r?.motion||'';
 $('presentation-note').hidden=n.spatial&&(!r||r.spatial);
 $('presentation-note').textContent=!n.spatial?'演出節點 · 不配置實體房間':r?.from===r?.to?'原場景回返 · 不新增實體通道':'結局演出連接 · 非可步行路線';
 $('access').innerHTML=n.access.map(a=>`<li><b>${esc(a.label)}</b> ${esc(a.location)} ${esc(a.state)}</li>`).join('');
 $('connections').innerHTML=connectedRoutes(model.routes,n.id).map(c=>`<article class="route-comparison"><button data-connection="${c.id}" aria-pressed="${c.id===routeId}">${esc(c.relation)} · ${c.from} ${c.back?'↔':'→'} ${c.to} · ${esc(c.kind)}</button><p>${esc(locationLabel(c))}</p><p><b>通行條件</b> ${esc(c.gate)}</p><p><b>回訪限制</b> ${esc(c.returnRule)}</p>${!c.spatial?'<p>演出銜接 · 非新增步行通道</p>':''}</article>`).join('');
 $('image-count').textContent=`(${artwork.length})`;
 $('images').innerHTML=artwork.map(i=>`<li data-image="${i.id}">${link(i.id,i.spec,i.heading)} <small>${esc(i.kind)}${i.status==='pending'?' · 待製作':''}</small><p>${esc(i.content)}</p><p>${esc(i.requirements)}</p></li>`).join('');
 $('reference').hidden=!n.reference;if(n.reference){$('reference-image').src='../'+n.reference.url;$('reference-caption').textContent=n.reference.kind;}
 renderMarkers();renderFlow();
}
function saveHash(){history.replaceState(null,'','#'+new URLSearchParams({scene:selected,...(routeId?{route:routeId}:{}),...(shotId?{shot:shotId}:{}),...(reverse?{direction:'return'}:{}),...(markerId?{marker:markerId}:{})}));}
function choose(id,preferred=null,shot='',refit=true,keepDirection=false){
 if(!node(id))return;selected=id;markerId='';
 if(!sceneMatches(node(id),{part:$('part').value}))$('part').value='all';
 if(!sceneMatches(node(id),{act:$('act').value}))$('act').value='all';
 const related=model.routes.filter(r=>r.from===id||r.to===id);routeId=related.find(r=>r.id===preferred)?.id||related.find(r=>r.from===id)?.id||related[0]?.id||'';
 shotId=shot&&model.shots.some(s=>s.id===shot&&s.node===id&&s.route===routeId)?shot:'';
 if(!keepDirection||!route()?.back)reverse=false;
 if(scope==='route'&&route()&&[route().from,route().to].some(id=>!sceneMatches(node(id),{part:$('part').value})))$('part').value='all';
 const target=shotId?model.shots.find(s=>s.id===shotId):node(id);
 if(floor!==null&&!target.floor.levels.includes(floor)&&!(id==='M1'&&target.floor.levels.includes(floor))){$('floor').value='all';floor=null;}
 renderList();renderDetails();applyVisibility();saveHash();document.querySelector('.right').scrollTop=0;if(refit)fit();
}
function readHash(){const p=new URLSearchParams(location.hash.slice(1)),id=node(p.get('scene'))?p.get('scene'):'R6';if(p.get('route')){scope='route';$('scope').value=scope;}choose(id,p.get('route'),p.get('shot'),false);reverse=p.get('direction')==='return'&&!!route()?.back;const m=markerById.get(p.get('marker'));if(m&&markerInContext(m,selected,shotId))markerId=m.id;renderDetails();applyVisibility();saveHash();}
function placeLabels(){
 if(!webglReady)return;
 const w=host.clientWidth,h=host.clientHeight,occupied=[];
 const headerBottom=document.querySelector('.view-head').offsetTop+document.querySelector('.view-head').offsetHeight+12;
 const bounds={left:8,right:w-8,top:headerBottom,bottom:h-95},active=shotId||selected;
 const scale=h*camera.zoom/(camera.top-camera.bottom);
 namesAtScale=showSceneNames(scale,namesAtScale);
 const priority=l=>l.id===active?3:l.hovered||l.el===document.activeElement?2:l.isShot?0:1;
 const sorted=[...labels].sort((a,b)=>priority(b)-priority(a));
 for(const l of sorted){
  if(!l.enabled){l.el.hidden=true;continue;}const p=l.position.clone().project(camera),x=(p.x+1)*w/2,y=(1-p.y)*h/2;
  if(p.z<=-1||p.z>=1||x<bounds.left||x>bounds.right||y<bounds.top||y>bounds.bottom){l.el.hidden=true;continue;}
  const named=$('scene-names').checked&&(namesAtScale||priority(l)>=2);
  let rect=null;
  // Measure both modes once per resize. Crowded labels fall back to the ID.
  for(const expanded of named?[true,false]:[false]){
   l.name.hidden=!expanded;l.el.hidden=false;
   const size=l.sizes[String(expanded)]??={width:l.el.offsetWidth,height:l.el.offsetHeight};
   rect=placeModelLabel({x,y,z:p.z,...size},bounds,occupied);if(rect)break;
  }
  l.el.hidden=!rect;if(rect){occupied.push(rect);l.el.style.left=(rect[0]+rect[2])/2+'px';l.el.style.top=rect[3]+'px';}
 }
 placeMarkers(bounds,occupied,w,h,scale);
 for(const l of floorLabels){
  if(!l.enabled){l.el.hidden=true;continue;}
  const p=l.position.clone().project(camera),x=(p.x+1)*w/2,y=(1-p.y)*h/2;l.el.hidden=false;
  const size=l.size??={width:l.el.offsetWidth,height:l.el.offsetHeight};
  const rect=placeModelLabel({x:x-size.width/2,y:y+size.height/2,z:p.z,...size},bounds,occupied);
  l.el.hidden=!rect;if(rect){occupied.push(rect);l.el.style.left=rect[2]+'px';l.el.style.top=(rect[1]+rect[3])/2+'px';}
 }
}
function bind(){
 $('search').oninput=()=>{if($('search').value.trim())$('flow-range').value='filtered';renderList();};
 $('part').onchange=()=>{$('act').value='all';floor=null;$('floor').value='all';$('flow-range').value='filtered';scope='all';$('scope').value=scope;const first=model.nodes.find(n=>sceneMatches(n,filters()));choose(sceneMatches(node(selected),filters())?selected:first.id);};
 $('act').onchange=()=>{if($('act').value!=='all'){const n=model.nodes.find(n=>String(n.act)===$('act').value);scope='act';$('scope').value=scope;$('flow-range').value='act';choose(n.id);}else{scope='all';$('scope').value=scope;$('flow-range').value='filtered';renderList();applyVisibility();fit();}};
 $('floor').onchange=()=>{floor=$('floor').value==='all'?null:Number($('floor').value);$('act').value='all';$('flow-range').value='filtered';if(floor!==null){const n=model.nodes.find(n=>n.spatial&&sceneMatches(n,{part:$('part').value})&&(n.level===floor||n.id==='M1'&&n.floor.levels.includes(floor)));const s=model.shots.find(s=>sceneMatches(node(s.node),{part:$('part').value})&&s.floor.levels.length===1&&s.floor.levels[0]===floor);if(n){selected=n.id;shotId='';routeId=model.routes.find(r=>r.from===n.id)?.id||'';}else if(s){selected=s.node;shotId=s.id;routeId=s.route;}reverse=false;}renderList();renderDetails();applyVisibility();saveHash();fit();};
 $('scope').onchange=()=>{scope=$('scope').value;floor=null;$('floor').value='all';renderList();applyVisibility();fit();};
 $('height').onchange=()=>{model=buildCurrentModel(graph,flow,$('height').value==='actual');build();renderDetails();fit();};
 $('human-scale').onchange=updateScaleReference;
 $('full-walls').onchange=()=>{build();};
 for(const id of ['labels','shots','floor-guides'])$(id).onchange=applyVisibility;
 $('scene-names').onchange=placeLabels;
 $('scene-list').onclick=e=>{const b=e.target.closest('[data-select]');if(b){const s=shot(b.dataset.selectShot);choose(b.dataset.select,s?.route,s?.id);}};
 const selectRoute=id=>{routeId=id;shotId='';reverse=false;scope='route';$('scope').value=scope;floor=null;$('floor').value='all';if([route().from,route().to].some(id=>!sceneMatches(node(id),{part:$('part').value})))$('part').value='all';renderDetails();renderList();applyVisibility();saveHash();fit();};
 $('route').onchange=()=>selectRoute($('route').value);
 $('connections').onclick=e=>{const b=e.target.closest('[data-connection]');if(b){selectRoute(b.dataset.connection);$('route').focus({preventScroll:true});$('route').scrollIntoView({block:'nearest'});}};
 $('steps').onclick=e=>{const b=e.target.closest('[data-step]');if(!b)return;const id=b.dataset.step;choose(b.dataset.type==='subscene'?shot(id).node:id,routeId,b.dataset.type==='subscene'?id:'',false,true);focus();};
 for(const [id,value] of [['forward',false],['reverse',true]])$(id).onclick=()=>{if(value&&!route()?.back)return;reverse=value;renderDetails();applyVisibility();saveHash();};
 for(const id of ['iso','front','top'])$(id).onclick=()=>{view=id;fit();};
 $('reset').onclick=()=>{view='iso';fit();};$('focus').onclick=focus;
 $('zoom-in').onclick=()=>{if(webglReady){camera.zoom=Math.min(12,camera.zoom*1.25);camera.updateProjectionMatrix();}};$('zoom-out').onclick=()=>{if(webglReady){camera.zoom=Math.max(.2,camera.zoom/1.25);camera.updateProjectionMatrix();}};
 window.addEventListener('hashchange',()=>{readHash();fit();});
 $('retry-3d').onclick=()=>location.reload();
}
function bindCanvas(){
 let down;
 renderer.domElement.addEventListener('pointerdown',e=>{down=[e.clientX,e.clientY];});
 renderer.domElement.addEventListener('pointerup',e=>{
  if(!down||Math.hypot(e.clientX-down[0],e.clientY-down[1])>5)return;
  const rect=host.getBoundingClientRect(),ray=new THREE.Raycaster();ray.params.Line.threshold=.22;ray.setFromCamera(new THREE.Vector2((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1),camera);
  const hit=ray.intersectObjects([...roomObjects.map(o=>({g:o.sliced||o.g})),...shotObjects,...routeObjects.map(o=>({g:o.sliced||o.g}))].filter(o=>o.g.visible).map(o=>o.g),true)[0];if(!hit)return;
  const d=hit.object.userData;if(d.shot)choose(shot(d.shot).node,shot(d.shot).route,d.shot,false);else if(d.node)choose(d.node,null,'',false);else if(d.route){const r=model.routes.find(r=>r.id===d.route);choose(r.from,r.id,'',false);}
 });
}
function useFlowFallback(){
 webglReady=false;renderer?.setAnimationLoop(null);resizeObserver?.disconnect();
 $('loading')?.remove();document.body.classList.add('no-webgl');$('fallback-status').hidden=false;
 flowPanel.fallback();
}
try {
 document.querySelector('.left>.checks').insertAdjacentHTML('beforeend','<label><input id="human-scale" type="checkbox" checked>170 公分人形</label><label><input id="full-walls" type="checkbox" checked>完整牆高</label>');
 $('node-floor').insertAdjacentHTML('afterend','<p id="metric-size" class="reading"></p>');
 document.querySelector('.view-head>div>small').textContent='公尺尺度 · 配置估算';
 $('height').querySelector('[value="actual"]').textContent='層高 3.2 公尺';
 $('counts').textContent=`2 棟樓 · ${model.nodes.length} 個流程節點 · ${model.shots.length} 個次場景 · ${model.routes.length} 條動線`;
 $('act').insertAdjacentHTML('beforeend',graph.acts.map((a,i)=>`<option value="${i}">${esc(a)}</option>`).join(''));
 $('floor').insertAdjacentHTML('beforeend',FLOORS.map(f=>`<option value="${f}">${floorName(f)}</option>`).join(''));
 initMarkers();
 flowPanel=createFlowPanel(graph,flow,(id,preferred,shot)=>{const current=route(),next=preferred||(current&&[current.from,current.to].includes(id)?current.id:null);scope='route';$('scope').value=scope;choose(id,next,shot,true,next===routeId);flowPanel.locate();});
 readHash();bind();
} catch(error){$('loading')?.remove();$('error').hidden=false;$('error').textContent=`場景資料無法載入：${error.message}`;throw error;}
try {
 scene=new THREE.Scene();scene.background=new THREE.Color(0x111a1c);camera=new THREE.OrthographicCamera(-40,40,40,-40,.1,1500);
 renderer=new THREE.WebGLRenderer({antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,1.7));renderer.setSize(host.clientWidth,host.clientHeight);renderer.outputColorSpace=THREE.SRGBColorSpace;host.append(renderer.domElement);
 scene.add(new THREE.HemisphereLight(0xe7f3ea,0x334543,2.3));const light=new THREE.DirectionalLight(0xfff1d5,2.3);light.position.set(40,150,80);scene.add(light);
 controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.dampingFactor=.12;controls.maxPolarAngle=Math.PI*.495;controls.minZoom=.2;controls.maxZoom=12;
 webglReady=true;build();bindCanvas();fit();$('loading').remove();
 renderer.domElement.addEventListener('webglcontextlost',event=>{event.preventDefault();useFlowFallback();});
 const clearLabelSizes=()=>{for(const l of [...labels,...markerPins])l.sizes={};for(const l of floorLabels)l.size=null;};
 resizeObserver=new ResizeObserver(()=>{clearLabelSizes();renderer.setSize(host.clientWidth,host.clientHeight);fit();});resizeObserver.observe(host);
 document.fonts.ready.then(clearLabelSizes);
 renderer.setAnimationLoop(()=>{controls.update();placeLabels();renderer.render(scene,camera);});
 window.addEventListener('pagehide',event=>{if(event.persisted)return;resizeObserver.disconnect();renderer.setAnimationLoop(null);controls.dispose();dispose(root);renderer.dispose();});
} catch(error){useFlowFallback();console.warn('3D fallback:',error.message);}
