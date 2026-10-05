import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import graph from '../scene_graph.json';
import flow from '../scene-flow.json';
import {buildCurrentModel,FLOORS,floorName} from './current-spatial.js';
import {dressCurrentRoom} from './current-props.js';
import {sharedGlassBoundary} from './story-props.js';
import {clipRouteToHeight} from './floor-route-view.js';
import {dressTransition,transitionFor} from './transition-spaces.js';

const $=id=>document.getElementById(id);
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const source=(doc,heading)=>'../#'+new URLSearchParams({doc,heading});
const link=(label,doc,heading)=>`<a href="${esc(source(doc,heading))}" target="_blank" rel="noopener noreferrer">${esc(label)} ↗</a>`;
const locationLabel=(item,back=false)=>`${back?item.building.reverseLabel:item.building.label} · ${back?item.floor.reverseLabel:item.floor.label}`;
let model=buildCurrentModel(graph,flow),selected='R6',routeId='',shotId='',reverse=false,scope='all',floor=null,view='iso';
const node=id=>model.nodes.find(n=>n.id===id),shot=id=>model.shots.find(s=>s.id===id),route=()=>model.routes.find(r=>r.id===routeId);
const host=$('canvas-host'),colors=[0x719eae,0x8bab8e,0x6fae9c,0x93a8bd,0xbd969c,0xc2aa7e,0x8dabbe,0xbdc5ae];
let renderer,camera,controls,scene,root,resizeObserver;
let roomObjects=[],routeObjects=[],shotObjects=[],labels=[],floorLabels=[],visiblePoints=[];
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
  else if(Math.abs(dy)>.1){const count=Math.max(2,Math.ceil(Math.abs(dy)/.24));for(let j=0;j<count;j++)steps.push({p:a.map((v,k)=>v+(b[k]-v)*(j+.5)/count),angle:Math.atan2(dx,dz),depth:Math.max(.12,horizontal/count+.05)});}
  else segment(a,b,1.2,.12,mat,parent);
 }
 if(steps.length){const inst=new THREE.InstancedMesh(new THREE.BoxGeometry(1,.12,1),mat,steps.length),dummy=new THREE.Object3D();steps.forEach((s,i)=>{dummy.position.set(...s.p);dummy.rotation.y=s.angle;dummy.scale.set(1.2,1,s.depth);dummy.updateMatrix();inst.setMatrixAt(i,dummy.matrix);});parent.add(inst);}
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
  const gaps=exits.filter(e=>e[0]===side).map(e=>[Math.max(-length/2,e[2]-.8),Math.min(length/2,e[2]+.8)]).sort((a,b)=>a[0]-b[0]);
  let cursor=-length/2;const piece=end=>{if(end>cursor+.03){const center=(cursor+end)/2;box(horizontal?end-cursor:.12,1.3,horizontal?.12:end-cursor,horizontal?n.x+center:fixed,n.y+.75,horizontal?fixed:n.z+center,material(colors[n.act]||0x92a8a0,.3),g);}};
  for(const [lo,hi] of gaps){piece(lo);cursor=Math.max(cursor,hi);}piece(length/2);
 }
}
function label(id,position,isShot){const el=document.createElement('button');el.className='model-label'+(isShot?' shot':'');el.dataset[isShot?'shot':'node']=id;el.textContent=id;const itemData=isShot?shot(id):node(id);el.title=`${itemData.name} · ${locationLabel(itemData)}`;el.setAttribute('aria-label',el.title);el.onclick=()=>choose(isShot?shot(id).node:id,isShot?shot(id).route:null,isShot?id:'',false);host.append(el);const item={el,id,position:new THREE.Vector3(...position),isShot,enabled:true};labels.push(item);return item;}
function latticeGate(x,y,z,parent){
 const mat=material(0xc8b891);
 for(const side of[-1,1])box(.1,2.2,.1,x+side,y+1.1,z,mat,parent);
 for(let i=0;i<5;i++){const left=x-1+i*.4;line([[left,y+.15,z],[left+.4,y+2.05,z]],0xd2c29b,parent);line([[left,y+2.05,z],[left+.4,y+.15,z]],0xd2c29b,parent);}
 box(2,.1,.1,x,y+2.2,z,mat,parent);
}
function build(){
 if(root){scene.remove(root);dispose(root);}for(const l of [...labels,...floorLabels])l.el.remove();labels=[];floorLabels=[];roomObjects=[];routeObjects=[];shotObjects=[];
 root=new THREE.Group();scene.add(root);
 const glass=sharedGlassBoundary({...node('R19'),floor:node('R19').level},{...node('R20'),floor:node('R19').level});
 for(const n of model.nodes.filter(n=>n.spatial)){
  const g=new THREE.Group();root.add(g);g.userData.node=n.id;
  if(n.id==='M1')pathMesh(n.points,0xdbb575,g);
  else {const base=box(n.w,.23,n.d,n.x,n.y,n.z,material(colors[n.act]||0x94b4a3,.65),g);walls(n,g);dressCurrentRoom(n,g,{THREE,box,material,line,segment,y:n.y});const outline=new THREE.BoxHelper(base,0xf0c878);g.add(outline);g.userData.outline=outline;}
  if(n.id==='R19'&&glass)box(glass.x2-glass.x1,2,.08,(glass.x1+glass.x2)/2,n.y+1.25,glass.z,material(0x82ccc7,.4),g);
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
    latticeGate(p[0],p[1],p[2]+.8,frame);
    if(s.travel==='電梯車廂'){box(2,.12,2,p[0],p[1],p[2],material(0xa5b3a1),frame);box(2,2.2,.12,p[0],p[1]+1.1,p[2]-.9,material(0x697c75,.4),frame);}
   } else dressTransition(r,r.points,g,{THREE,box,material,line,segment,floorY:model.floorY,definition,views:[station],hideLabels:true});
   if(s.play&&s.travel==='步道'){
    // A blocked former stair contrasts with the connected side path, not another live exit.
    box(2.2,.16,1.6,p[0]+3.5,p[1],p[2],material(0x7c6660),g);
    box(.18,1.2,1.6,p[0]+4.5,p[1]+.6,p[2],material(0xa57b68),g);
    line([[p[0]+4.62,p[1]+.2,p[2]-.6],[p[0]+4.62,p[1]+1,p[2]+.6]],0xe6b488,g);
   }
   box(1.5,.14,1.5,p[0],p[1]+.15,p[2],material(0x80c4ac),g);g.traverse(o=>{o.userData.shot=s.id;});shotObjects.push({s,g});label(s.id,[p[0],p[1]+3,p[2]],true);
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
 applyVisibility();
}
function contextNode(){return node(selected).spatial?node(selected):node('R32');}
function roomVisible(n){
 if(floor!==null)return n.floor.levels.includes(floor);
 if(scope==='route'){const r=route();return r?(r.from===n.id||r.to===n.id):n.id===contextNode().id;}
 if(scope==='act')return n.act===contextNode().act||model.routes.some(r=>r.spatial&&(r.from===n.id&&node(r.to).act===contextNode().act||r.to===n.id&&node(r.from).act===contextNode().act));
 return true;
}
function applyVisibility(){
 visiblePoints=[];
 for(const o of roomObjects){const {n,g}=o;if(o.sliced){root.remove(o.sliced);dispose(o.sliced);o.sliced=null;}g.visible=roomVisible(n);if(g.userData.outline)g.userData.outline.visible=n.id===selected&&!shotId;if(g.visible){if(n.id==='M1'){
   if(floor===null)visiblePoints.push(...n.points);
   else {g.visible=false;o.sliced=new THREE.Group();root.add(o.sliced);for(const p of clipRouteToHeight(n.points,model.floorY.get(floor)-.01,model.floorY.get(floor)+4.5)){pathMesh(p,0xdbb575,o.sliced);visiblePoints.push(...p);}o.sliced.traverse(obj=>{obj.userData.node='M1';});}
  }else visiblePoints.push([n.x-n.w/2,n.y-2,n.z-n.d/2],[n.x+n.w/2,n.y+3,n.z+n.d/2]);}}
 const bounds=floor===null?null:[model.floorY.get(floor)-2,model.floorY.get(floor)+4.5];
 for(const o of routeObjects){
  if(o.sliced){root.remove(o.sliced);dispose(o.sliced);o.sliced=null;}
  o.g.visible=floor===null&&(scope==='all'||scope==='route'&&o.r.id===routeId||scope==='act'&&(node(o.r.from).act===contextNode().act||node(o.r.to).act===contextNode().act));
  if(o.g.visible)visiblePoints.push(...o.r.points);
  if(bounds){const pieces=clipRouteToHeight(o.r.points,...bounds);if(pieces.length){o.sliced=new THREE.Group();root.add(o.sliced);for(const p of pieces){pathMesh(p,o.color,o.sliced);visiblePoints.push(...p);}o.sliced.traverse(obj=>{obj.userData.route=o.r.id;});}}
 }
 for(const {s,g} of shotObjects){
  g.visible=$('shots').checked&&(floor!==null?s.floor.levels.includes(floor):scope==='route'?s.route===routeId:scope==='act'?node(s.node).act===contextNode().act:true);
  // Cabin views depict different moments of one car, never simultaneous cars.
  if(g.userData.cabin)g.userData.cabin.visible=s.id===shotId;
 }
 for(const l of labels){const room=l.isShot?null:roomObjects.find(o=>o.n.id===l.id);l.enabled=$('labels').checked&&(l.isShot?shotObjects.find(o=>o.s.id===l.id).g.visible:room.g.visible||!!room.sliced);if(!l.enabled)l.el.hidden=true;if(l.id==='M1')l.position.set(...(floor===null?node('M1').position:[node('M1').x,model.floorY.get(floor)+2,20]));l.el.classList.toggle('selected',l.id===(shotId||selected));}
 for(const l of floorLabels){l.g.visible=$('floor-guides').checked&&scope==='all'&&(floor===null||floor===l.floor);l.enabled=l.g.visible&&(floor!==null||[...new Set(model.nodes.filter(n=>n.spatial).map(n=>n.level)),24,36].includes(l.floor));}
 $('view-title').textContent=floor!==null?`${floorName(floor)} 空間`:scope==='route'?(route()?reverse?`${route().to} → ${route().from}`:`${route().from} → ${route().to}`:'場景定位'):scope==='act'?graph.acts[contextNode().act]:'雙棟概覽';
 $('view-floor').textContent=floor!==null?floorName(floor):scope==='route'?(route()?locationLabel(route(),reverse):''):scope==='act'?locationLabel(contextNode()):'A 棟 1–26F · B 棟 1–50F · 共用地基';
}
function fit(points=visiblePoints){
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
function focus(){const n=shotId?shot(shotId):contextNode(),p=n.position;fit([[p[0]-8,p[1]-5,p[2]-8],[p[0]+8,p[1]+7,p[2]+8]]);}
function renderList(){
 const q=$('search').value.trim().toLowerCase(),act=$('act').value;
 const list=model.nodes.filter(n=>(act==='all'||String(n.act)===act)&&(floor===null||n.floor.levels.includes(floor)||n.id==='M1'&&n.floor.levels.includes(floor))&&`${n.id} ${n.name} ${locationLabel(n)}`.toLowerCase().includes(q));
 $('scene-list').innerHTML=list.map(n=>`<li><button data-select="${n.id}" aria-pressed="${selected===n.id}"><span><b>${n.id}</b>${esc(n.name)}</span><small>${esc(locationLabel(n))}</small></button></li>`).join('');$('empty').hidden=!!list.length;
}
function renderDetails(){
 const n=node(selected),s=shotId?shot(shotId):null,current=s||n,r=route();
 $('node-id').textContent=s?`${s.id} · ${s.type}`:`${n.id} · ${graph.acts[n.act]}`;
 $('node-title').textContent=s?s.name:n.name;$('node-floor').textContent=locationLabel(current,reverse&&!!s);
 $('node-goal').textContent=s?flow.images[s.id].content:n.goal;
 $('node-spatial').textContent=s?`${s.from} → ${s.id} → ${s.to}`:n.floor.description;
 $('exploration').hidden=!s?.play;
 $('exploration').innerHTML=s?.play?`<h3>逐層探路</h3><p class="route-rule"><b>辨路依據</b> ${esc(s.play.clue)}</p><p class="route-rule"><b>操作與開通</b> ${esc(s.play.action)}</p><p class="route-rule"><b>錯路與復原</b> ${esc(s.play.recovery)}</p>`:'';
 $('node-links').innerHTML=link('遊戲劇本',current.source,current.heading)+link('製作規格',s?s.spec:n.pack,s?s.specHeading:n.packAnchor)+link(current.image,current.spec||n.pack,flow.images[current.image].heading);
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
 $('images').innerHTML=current.details.map(id=>{const i=flow.images[id];return `<li>${link(id,i.spec,i.heading)} ${esc(i.content)}</li>`;}).join('');
 $('reference').hidden=!n.reference;if(n.reference){$('reference-image').src='../'+n.reference.url;$('reference-caption').textContent=n.reference.kind;}
 $('flow-link').href='../#'+new URLSearchParams({scene:selected,...(r?{route:r.id}:{}),...(shotId?{shot:shotId}:{}),...(reverse?{direction:'return'}:{})});
 $('editor-link').href='editor.html#scene='+(n.part===1?n.id:'R6');
}
function saveHash(){history.replaceState(null,'','#'+new URLSearchParams({scene:selected,...(routeId?{route:routeId}:{}),...(shotId?{shot:shotId}:{}),...(reverse?{direction:'return'}:{})}));}
function choose(id,preferred=null,shot='',refit=true,keepDirection=false){
 if(!node(id))return;selected=id;
 const related=model.routes.filter(r=>r.from===id||r.to===id);routeId=related.find(r=>r.id===preferred)?.id||related.find(r=>r.from===id)?.id||related[0]?.id||'';
 shotId=shot&&model.shots.some(s=>s.id===shot&&s.node===id&&s.route===routeId)?shot:'';
 if(!keepDirection||!route()?.back)reverse=false;
 const target=shotId?model.shots.find(s=>s.id===shotId):node(id);
 if(floor!==null&&!target.floor.levels.includes(floor)&&!(id==='M1'&&target.floor.levels.includes(floor))){$('floor').value='all';floor=null;}
 renderList();renderDetails();applyVisibility();saveHash();if(refit)fit();
}
function readHash(){const p=new URLSearchParams(location.hash.slice(1)),id=node(p.get('scene'))?p.get('scene'):'R6';if(p.get('route')){scope='route';$('scope').value=scope;}choose(id,p.get('route'),p.get('shot'),false);reverse=p.get('direction')==='return'&&!!route()?.back;renderDetails();applyVisibility();saveHash();}
function placeLabels(){
 const w=host.clientWidth,h=host.clientHeight,occupied=[];
 const headerBottom=document.querySelector('.view-head').offsetTop+document.querySelector('.view-head').offsetHeight+12;
 const sorted=[...labels].sort((a,b)=>Number(b.id===(shotId||selected))-Number(a.id===(shotId||selected))||Number(a.isShot)-Number(b.isShot));
 for(const l of sorted){
  if(!l.enabled){l.el.hidden=true;continue;}const p=l.position.clone().project(camera),x=(p.x+1)*w/2,y=(1-p.y)*h/2;
  const width=l.isShot?102:35,height=24,rect=[x-width/2,y-height,x+width/2,y];
  const visible=p.z>-1&&p.z<1&&x>width/2&&x<w-width/2&&rect[1]>headerBottom&&y<h-95&&!occupied.some(b=>rect[0]<b[2]+3&&rect[2]>b[0]-3&&rect[1]<b[3]+3&&rect[3]>b[1]-3);
  l.el.hidden=!visible;if(visible){occupied.push(rect);l.el.style.left=x+'px';l.el.style.top=y+'px';}
 }
 for(const l of floorLabels){const p=l.position.clone().project(camera),x=(p.x+1)*w/2,y=(1-p.y)*h/2;const rect=[x-30,y-7,x,y+7];l.el.hidden=!l.enabled||p.z<-1||p.z>1||x<30||x>w-20||y<80||y>h-95||occupied.some(b=>rect[0]<b[2]+3&&rect[2]>b[0]-3&&rect[1]<b[3]+3&&rect[3]>b[1]-3);if(!l.el.hidden){occupied.push(rect);l.el.style.left=x+'px';l.el.style.top=y+'px';}}
}
function bind(){
 $('search').oninput=renderList;$('act').onchange=()=>{renderList();if($('act').value!=='all'){const n=model.nodes.find(n=>String(n.act)===$('act').value);scope='act';$('scope').value=scope;choose(n.id);}};
 $('floor').onchange=()=>{floor=$('floor').value==='all'?null:Number($('floor').value);if(floor!==null){const n=model.nodes.find(n=>n.spatial&&(n.level===floor||n.id==='M1'&&n.floor.levels.includes(floor)));const s=model.shots.find(s=>s.floor.levels.length===1&&s.floor.levels[0]===floor);if(n){selected=n.id;shotId='';routeId=model.routes.find(r=>r.from===n.id)?.id||'';}else if(s){selected=s.node;shotId=s.id;routeId=s.route;}reverse=false;}renderList();renderDetails();applyVisibility();saveHash();fit();};
 $('scope').onchange=()=>{scope=$('scope').value;floor=null;$('floor').value='all';renderList();applyVisibility();fit();};
 $('height').onchange=()=>{model=buildCurrentModel(graph,flow,$('height').value==='actual');build();renderDetails();fit();};
 for(const id of ['labels','shots','floor-guides'])$(id).onchange=applyVisibility;
 $('scene-list').onclick=e=>{const b=e.target.closest('[data-select]');if(b)choose(b.dataset.select);};
 $('route').onchange=()=>{routeId=$('route').value;shotId='';reverse=false;scope='route';$('scope').value=scope;floor=null;$('floor').value='all';renderDetails();renderList();applyVisibility();saveHash();fit();};
 $('steps').onclick=e=>{const b=e.target.closest('[data-step]');if(!b)return;const id=b.dataset.step;choose(b.dataset.type==='subscene'?shot(id).node:id,routeId,b.dataset.type==='subscene'?id:'',false,true);focus();};
 for(const [id,value] of [['forward',false],['reverse',true]])$(id).onclick=()=>{if(value&&!route()?.back)return;reverse=value;renderDetails();applyVisibility();saveHash();};
 for(const id of ['iso','front','top'])$(id).onclick=()=>{view=id;fit();};
 $('reset').onclick=()=>{view='iso';fit();};$('focus').onclick=focus;
 $('zoom-in').onclick=()=>{camera.zoom=Math.min(12,camera.zoom*1.25);camera.updateProjectionMatrix();};$('zoom-out').onclick=()=>{camera.zoom=Math.max(.2,camera.zoom/1.25);camera.updateProjectionMatrix();};
 window.addEventListener('hashchange',()=>{readHash();fit();});
 let down;
 renderer.domElement.addEventListener('pointerdown',e=>{down=[e.clientX,e.clientY];});
 renderer.domElement.addEventListener('pointerup',e=>{
  if(!down||Math.hypot(e.clientX-down[0],e.clientY-down[1])>5)return;
  const rect=host.getBoundingClientRect(),ray=new THREE.Raycaster();ray.params.Line.threshold=.22;ray.setFromCamera(new THREE.Vector2((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1),camera);
  const hit=ray.intersectObjects([...roomObjects.map(o=>({g:o.sliced||o.g})),...shotObjects,...routeObjects.map(o=>({g:o.sliced||o.g}))].filter(o=>o.g.visible).map(o=>o.g),true)[0];if(!hit)return;
  const d=hit.object.userData;if(d.shot)choose(shot(d.shot).node,shot(d.shot).route,d.shot,false);else if(d.node)choose(d.node,null,'',false);else if(d.route){const r=model.routes.find(r=>r.id===d.route);choose(r.from,r.id,'',false);}
 });
}
try {
 $('counts').textContent=`2 棟樓 · ${model.nodes.length} 個流程節點 · ${model.shots.length} 個次場景 · ${model.routes.length} 條動線`;
 $('act').insertAdjacentHTML('beforeend',graph.acts.map((a,i)=>`<option value="${i}">${esc(a)}</option>`).join(''));
 $('floor').insertAdjacentHTML('beforeend',FLOORS.map(f=>`<option value="${f}">${floorName(f)}</option>`).join(''));
 scene=new THREE.Scene();scene.background=new THREE.Color(0x111a1c);camera=new THREE.OrthographicCamera(-40,40,40,-40,.1,1500);
 renderer=new THREE.WebGLRenderer({antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,1.7));renderer.setSize(host.clientWidth,host.clientHeight);renderer.outputColorSpace=THREE.SRGBColorSpace;host.append(renderer.domElement);
 scene.add(new THREE.HemisphereLight(0xe7f3ea,0x334543,2.3));const light=new THREE.DirectionalLight(0xfff1d5,2.3);light.position.set(40,150,80);scene.add(light);
 controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.dampingFactor=.12;controls.maxPolarAngle=Math.PI*.495;controls.minZoom=.2;controls.maxZoom=12;
 build();readHash();bind();fit();$('loading').remove();
 resizeObserver=new ResizeObserver(()=>{renderer.setSize(host.clientWidth,host.clientHeight);fit();});resizeObserver.observe(host);
 renderer.setAnimationLoop(()=>{controls.update();placeLabels();renderer.render(scene,camera);});
 window.addEventListener('pagehide',event=>{if(event.persisted)return;resizeObserver.disconnect();renderer.setAnimationLoop(null);controls.dispose();dispose(root);renderer.dispose();});
} catch(error){$('loading')?.remove();$('error').hidden=false;$('error').textContent=`模型無法載入：${error.message}`;console.error(error);}
