import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import data from './data.js';
import {layout,offsets,rationale,routePoints} from './spatial.js';
import {dressRoom,dressBuilding} from './story-props.js';

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
// Served as a sub-page of the docs site, so spec links stay on the same site.
const sourceUrl=id=>'../#'+new URLSearchParams({doc:data.spatial[id].source,heading:data.spatial[id].heading});
data.nodes.forEach(n=>{[n.x,n.z,n.floor,n.w,n.d]=layout[n.id];n.group=groups.find(g=>g.id!=='all'&&n.floor>=g.floors[0]&&n.floor<=g.floors[1]).id;});
const nodeMap=new Map(data.nodes.map(n=>[n.id,n]));
const usedFloors=[...new Set(data.nodes.map(n=>n.floor))].sort((a,b)=>a-b);
const floors=Array.from({length:47},(_,i)=>i-3).filter(f=>f!==0);
let state={group:'all',floor:null,selected:'R6',height:'compressed',spread:0,shell:true,special:true,labels:true,view:'iso'};
let scene,camera,renderer,controls,building,structure,roomMeshes=[],tags=[],floorTags=[],edgeObjects=[],roomObjects=new Map(),floorY=new Map();
const host=$('canvas-host');
function box(w,h,d,x,y,z,material,parent){const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),material);mesh.position.set(x,y,z);parent.add(mesh);return mesh;}
function material(color,opacity=1){return new THREE.MeshStandardMaterial({color,roughness:.82,metalness:.08,transparent:opacity<1,opacity,depthWrite:opacity>=1});}
function line(points,color,parent,opacity=1,dashed=false){const geom=new THREE.BufferGeometry().setFromPoints(points.map(p=>new THREE.Vector3(...p)));const mat=dashed?new THREE.LineDashedMaterial({color,dashSize:.65,gapSize:.45,transparent:true,opacity}):new THREE.LineBasicMaterial({color,transparent:true,opacity});const obj=new THREE.Line(geom,mat);if(dashed)obj.computeLineDistances();parent.add(obj);return obj;}
function segment(a,b,width,thickness,mat,parent){const pa=new THREE.Vector3(...a),pb=new THREE.Vector3(...b);const mesh=new THREE.Mesh(new THREE.BoxGeometry(width,thickness,pa.distanceTo(pb)),mat);mesh.position.copy(pa).add(pb).multiplyScalar(.5);mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),pb.sub(pa).normalize());parent.add(mesh);return mesh;}
function arrow(a,b,color,parent,reverse=false){const start=new THREE.Vector3(...a),end=new THREE.Vector3(...b),dir=end.clone().sub(start).normalize();const pos=start.clone().lerp(end,reverse?.28:.68);if(reverse)dir.negate();const cone=new THREE.Mesh(new THREE.ConeGeometry(.34,.9,5),new THREE.MeshBasicMaterial({color}));cone.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),dir);cone.position.copy(pos);parent.add(cone);}
function recalcHeights(){let y=0;floors.forEach((f,i)=>{if(i){const prior=floors[i-1];y+=(state.height==='actual'?4.2:usedFloors.includes(prior)?4.2:.65)+(usedFloors.includes(prior)?state.spread:0);}floorY.set(f,y);});}
function roomY(n){return floorY.get(n.floor)+(offsets[n.id]||0);}
function point(n){return[n.x,roomY(n)+.3,n.z];}
function portal(n,p){
 if(n.id==='R4b')return null;
 const candidates=[['west',Math.abs(p[0]-(n.x-n.w/2)),p[2]-n.z],['east',Math.abs(p[0]-(n.x+n.w/2)),p[2]-n.z],['north',Math.abs(p[2]-(n.z-n.d/2)),p[0]-n.x],['south',Math.abs(p[2]-(n.z+n.d/2)),p[0]-n.x]];
 const c=candidates.sort((a,b)=>a[1]-b[1])[0];return{side:c[0],offset:c[2]};
}
function pathFor(e){const points=routePoints(e,id=>roomY(nodeMap.get(id)));return{points,ap:portal(nodeMap.get(e.fromId),points[0]),bp:portal(nodeMap.get(e.toId),points.at(-1))};}
function makeWall(n,side,openings,parent,mat){
 if(n.id==='R4b'||n.id==='R10'||n.id==='R22'||n.id==='R19'&&side==='south'||n.id==='R20'&&side==='north')return;
 const y=roomY(n),horizontal=side==='north'||side==='south',length=horizontal?n.w:n.d;
 const x=n.x+(side==='west'?-n.w/2:side==='east'?n.w/2:0),z=n.z+(side==='north'?-n.d/2:side==='south'?n.d/2:0);
 const piece=(lo,hi,h=2.2,dy=1.1)=>{if(hi-lo>.02)box(horizontal?hi-lo:.18,h,horizontal?.18:hi-lo,x+(horizontal?(lo+hi)/2:0),y+dy,z+(horizontal?0:(lo+hi)/2),mat,parent);};
 const intervals=openings.filter(p=>p.side===side).map(p=>[Math.max(-length/2,p.offset-.8),Math.min(length/2,p.offset+.8)]).sort((a,b)=>a[0]-b[0]);
 let cursor=-length/2;for(const [lo,hi] of intervals){piece(cursor,lo);piece(lo,hi,.25,2.075);cursor=Math.max(cursor,hi);}piece(cursor,length/2);
}
function rebuild(){
 if(building){scene.remove(building);building.traverse(o=>{o.geometry?.dispose();if(o.material){for(const m of(Array.isArray(o.material)?o.material:[o.material])){m.map?.dispose();m.dispose();}}});}
 tags.forEach(t=>t.el.remove());floorTags.forEach(t=>t.el.remove());tags=[];floorTags=[];roomMeshes=[];edgeObjects=[];roomObjects.clear();recalcHeights();
 building=new THREE.Group();scene.add(building);structure=new THREE.Group();building.add(structure);
 const paths=new Map(),doors=new Map(data.nodes.map(n=>[n.id,[]]));
 data.edges.forEach(e=>{const p=pathFor(e);paths.set(e.id,p);if(e.kind!=='子節點'){doors.get(e.fromId).push(p.ap);doors.get(e.toId).push(p.bp);}});
 // Perimeter-only structure leaves room plans and corridors readable.
 const minY=floorY.get(-3)-.6,maxY=floorY.get(43)+2.7;
 for(const x of[-26,26])for(const z of[-24,24])box(.2,maxY-minY,.2,x,(minY+maxY)/2,z,material(0x60768b,.24),structure);
 floors.forEach(f=>{const y=floorY.get(f),used=usedFloors.includes(f),g=new THREE.Group();g.userData.floor=f;structure.add(g);
  line([[-26,y,-24],[26,y,-24],[26,y,24],[-26,y,24],[-26,y,-24]],used?0x728c9f:0x344d63,g,used?.55:.26);
  if(used){const panels=f>=41?[[0,0,52,48]]:[[-14.5,0,23,48],[15.5,0,21,48],[1,-19.5,8,9],[1,12.5,8,23]];for(const [x,z,w,d] of panels)box(w,.12,d,x,y-.16,z,material(0x65798c,.055),g);}
  if(used||[11,24,36,43].includes(f)){
   const el=document.createElement('div');el.className='floor-tag'+(used?' active':'');el.textContent=({11:'8–14F · 封閉',24:'21–27F · 封閉',36:'33–40F · 封閉',43:'43F · 下部門檻'})[f]||floorName(f);host.append(el);floorTags.push({el,point:new THREE.Vector3(-27,y,24),floor:f});
  }
 });
 // Ground datum separates underground from the above-ground tower.
 line([[-27,floorY.get(1)-.65,16],[28,floorY.get(1)-.65,16]],0xc5ae8e,structure,.65);
 data.nodes.forEach(n=>{const g=new THREE.Group();g.userData.node=n.id;building.add(g);const y=roomY(n),color=colors[n.act];
  const base=box(n.w,.38,n.d,n.x,y+.02,n.z,material(color,n.id==='R4b'?.12:.75),g);base.userData.node=n.id;roomMeshes.push(base);
  const wallMat=material(color,.34);for(const side of['north','east','south','west'])makeWall(n,side,doors.get(n.id),g,wallMat);
  if(n.id!=='R4b')line([[n.x-n.w/2,y+2.25,n.z-n.d/2],[n.x+n.w/2,y+2.25,n.z-n.d/2],[n.x+n.w/2,y+2.25,n.z+n.d/2],[n.x-n.w/2,y+2.25,n.z+n.d/2],[n.x-n.w/2,y+2.25,n.z-n.d/2]],color,g,.8);
  dressRoom(n,g,{THREE,box,material,line,segment,y});
  const selection=new THREE.BoxHelper(base,0xffce8c);selection.visible=n.id===state.selected;g.add(selection);
  const el=document.createElement('button');el.className='room-tag';el.textContent=n.id;el.setAttribute('aria-label',`${n.id} ${n.name}`);el.onclick=()=>selectRoom(n.id);host.append(el);
  tags.push({el,point:new THREE.Vector3(n.x,y+3.05,n.z),node:n});roomObjects.set(n.id,{g,base,selection});
 });
 data.edges.forEach(e=>{const g=new THREE.Group();building.add(g);const points=paths.get(e.id).points,col=edgeColor(e),special=['捷徑','誤導'].includes(e.kind);const deck=material(e.fromId==='R2'&&e.toId==='R3'?0xa55441:special?col:0x546471,special?.3:.8);
  for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i];if(new THREE.Vector3(...a).distanceTo(new THREE.Vector3(...b))<.05)continue;
   if(e.kind==='子節點'){line([a,b],col,g,.8,true);continue;}
   if(Math.abs(a[1]-b[1])>.05){
    const steps=Math.max(4,Math.ceil(Math.abs(b[1]-a[1])/.28));
    for(let j=0;j<steps;j++){const p=new THREE.Vector3(...a).lerp(new THREE.Vector3(...b),(j+.5)/steps);const horizontal=Math.hypot(b[0]-a[0],b[2]-a[2]);const step=box(1.6,.18,Math.max(.22,horizontal/steps+.04),p.x,p.y-.06,p.z,deck,g);step.rotation.y=Math.atan2(b[0]-a[0],b[2]-a[2]);}
   }else segment(a,b,1.6,.15,deck,g);
   const aa=[a[0],a[1]+.24,a[2]],bb=[b[0],b[1]+.24,b[2]];
   line([aa,bb],col,g,.95,special);
   if(new THREE.Vector3(...a).distanceTo(new THREE.Vector3(...b))>2.5){arrow(aa,bb,col,g);if(e.back)arrow(aa,bb,col,g,true);}
  }
  g.traverse(o=>{if(o.material)o.userData.baseOpacity=o.material.opacity;});edgeObjects.push({g,e});
 });
 // R22 exit only: original upper/lower release boundary, no R23 room added.
 const n=nodeMap.get('R22'),exit=new THREE.Group();building.add(exit);const y=floorY.get(42),endY=floorY.get(43);
 const exitPoints=[[19,y+.3,16],[24,y+.3,16],[24,y-.4,19],[24,endY+.3,22]];
 for(let i=1;i<exitPoints.length;i++){segment(exitPoints[i-1],exitPoints[i],1.5,.16,material(0xa3937a,.6),exit);line(exitPoints.slice(i-1,i+1),0xeab275,exit,.9);}
 box(3,.22,3,24,endY+.2,22,material(0xeab275,.6),exit);exit.userData.exit=true;
 dressBuilding(building,{THREE,box,material,line,segment,floorY,roomY,nodeMap});
 applyVisibility();fitCamera();
}
function inGroup(n){return(state.group==='all'||n.group===state.group)&&(state.floor===null||n.floor===state.floor);}
function applyVisibility(){
 const chosen=groups.find(g=>g.id===state.group);
 structure.visible=state.shell;
 structure.children.forEach(o=>{o.visible=state.floor!==null?o.userData.floor===state.floor:state.group==='all'||o.userData.floor!=null&&usedFloors.includes(o.userData.floor)&&o.userData.floor>=chosen.floors[0]&&o.userData.floor<=chosen.floors[1];});
 roomObjects.forEach((o,id)=>{o.g.visible=inGroup(nodeMap.get(id));o.selection.visible=id===state.selected;});
 edgeObjects.forEach(({g,e})=>{g.visible=(state.special||!['捷徑','誤導'].includes(e.kind))&&(state.group==='all'||inGroup(nodeMap.get(e.fromId))&&inGroup(nodeMap.get(e.toId)));});
 building.children.filter(o=>o.userData.storyFloor!=null).forEach(o=>{const f=o.userData.storyFloor;o.visible=(state.floor===null||state.floor===f)&&(state.group==='all'||f>=chosen.floors[0]&&f<=chosen.floors[1]);o.children.filter(c=>c.userData.detailSign).forEach(c=>c.visible=state.group!=='all'&&state.labels);});
 building.children.filter(o=>o.userData.exit).forEach(o=>o.visible=state.floor===null&&(state.group==='all'||state.group==='correction'));
 for(const {el,node} of tags)el.classList.toggle('selected',node.id===state.selected);
 $('view-title').textContent=chosen.title+(state.floor!==null?' / '+floorName(state.floor):'');
 $('view-subtitle').textContent=state.group==='all'?'由地下逐層上行 · 封閉樓層保留':chosen.range+' · 帶內落層為灰盒提案';
 document.querySelectorAll('[data-group]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.group===state.group)));
}
function selectGroup(id){state.group=id;state.floor=null;$('floor-only').value='all';if(!inGroup(nodeMap.get(state.selected))){state.selected=data.nodes.find(inGroup).id;updateDetails();history.replaceState(null,'','#scene='+state.selected);}applyVisibility();fitCamera();}
function selectRoom(id){if(!nodeMap.has(id))return;state.selected=id;const n=nodeMap.get(id);if(state.group!=='all'&&state.group!==n.group)selectGroup(n.group);if(state.floor!==null&&state.floor!==n.floor){state.floor=n.floor;$('floor-only').value=String(n.floor);fitCamera();}applyVisibility();updateDetails();history.replaceState(null,'','#scene='+id);}
function updateDetails(){const n=nodeMap.get(state.selected),idx=data.nodes.indexOf(n);$('room-id').textContent=n.id;$('room-name').textContent=n.name;$('room-floor').textContent=`${floorName(n.floor)}${['R1','R2','R17','P0','P1'].includes(n.id)?'':' 配置提案'} · ${groups.find(g=>g.id===n.group).range}`;$('room-goal').textContent=n.goal;$('room-story').textContent=rationale[n.id];$('room-evidence').textContent=data.spatial[n.id].floor+' '+data.spatial[n.id].space;$('room-picker').value=n.id;$('source-link').href=sourceUrl(n.id);$('docs-link').href='../#scene='+encodeURIComponent(n.id);$('prev').disabled=idx===0;$('next').disabled=idx===data.nodes.length-1;
 const root=$('connections');root.replaceChildren();
 data.edges.filter(e=>e.fromId===n.id||e.toId===n.id).forEach(e=>{const other=e.fromId===n.id?e.toId:e.fromId;const card=document.createElement('div');card.className='edge-card';card.style.setProperty('--edge','#'+edgeColor(e).toString(16));const button=document.createElement('button');button.textContent=`${e.fromId} ${e.back?'↔':'→'} ${e.toId} · ${e.kind}`;button.onclick=()=>selectRoom(other);card.append(button);const small=document.createElement('small');small.textContent=`${nodeMap.get(other).name} · ${floorName(nodeMap.get(other).floor)}`;card.append(small);const details=document.createElement('details');const summary=document.createElement('summary');summary.textContent='通行條件與移動方式';details.append(summary);[e.gate,e.motion,e.returnRule].forEach(text=>{const p=document.createElement('p');p.textContent=text;details.append(p);});card.append(details);root.append(card);});
 if(n.id==='R4b'){const p=document.createElement('p');p.className='note';p.textContent='R4b 是共享 R4 基底的神壇子節點，本模型以原走道中的神壇角落表示，未新增獨立房間。';root.append(p);}
 if(n.id==='R22'){const p=document.createElement('p');p.className='note';p.textContent='上部終點：局部下折避梁，再沿同一梯井上行至 43F 門檻。R23 屬下部，不建立其房間。';root.append(p);}
}
function fitCamera(){if(!camera)return;const ns=data.nodes.filter(inGroup);let lo=Math.min(...ns.map(n=>floorY.get(n.floor)))-2,hi=Math.max(...ns.map(n=>floorY.get(n.floor)))+5;if(state.group==='all'&&state.floor===null)hi=floorY.get(43)+3;const center=new THREE.Vector3(0,(lo+hi)/2,1);const h=hi-lo,aspect=host.clientWidth/host.clientHeight;const span=state.view==='top'?Math.max(68/aspect,62):Math.max(h+24,79/aspect);camera.zoom=1;
 if(camera.isPerspectiveCamera)camera.aspect=aspect;else{camera.top=span/2;camera.bottom=-span/2;camera.left=-span*aspect/2;camera.right=span*aspect/2;}
 const offset=state.view==='front'?new THREE.Vector3(0,5,160):state.view==='top'?new THREE.Vector3(0,180,.01):new THREE.Vector3(95,58,130);
 if(camera.isPerspectiveCamera)offset.setLength(span/(2*Math.tan(THREE.MathUtils.degToRad(camera.fov/2)))+Math.hypot(26,h/2,24));
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
 tags.sort((a,b)=>Number(b.node.id===state.selected)-Number(a.node.id===state.selected)).forEach(t=>{const visible=state.labels&&inGroup(t.node);t.el.hidden=!visible;if(!visible)return;const p=t.point.clone().project(camera);if(p.z<-1||p.z>1||Math.abs(p.x)>1.1||Math.abs(p.y)>1.1){t.el.hidden=true;return;}let x=(p.x*.5+.5)*rect.width,y=(-p.y*.5+.5)*rect.height;let shifted=0;while(occupied.some(q=>Math.abs(q.x-x)<36&&Math.abs(q.y-y)<19)&&shifted<4){y-=18;shifted++;}occupied.push({x,y});t.el.style.left=x+'px';t.el.style.top=y+'px';});
 floorTags.forEach(t=>{const g=groups.find(g=>g.id===state.group);t.el.hidden=!state.shell||!(state.group==='all'||t.floor>=g.floors[0]&&t.floor<=g.floors[1])||(state.floor!==null&&t.floor!==state.floor);if(t.el.hidden)return;const p=t.point.clone().project(camera);t.el.hidden=Math.abs(p.x)>1.15||Math.abs(p.y)>1.1;t.el.style.left=(p.x*.5+.5)*rect.width+'px';t.el.style.top=(-p.y*.5+.5)*rect.height+'px';});
}
function init(){
 scene=new THREE.Scene();camera=new THREE.OrthographicCamera(-60,60,60,-60,.1,1500);renderer=new THREE.WebGLRenderer({antialias:true,alpha:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.setSize(host.clientWidth,host.clientHeight);renderer.outputColorSpace=THREE.SRGBColorSpace;host.append(renderer.domElement);renderer.domElement.setAttribute('aria-label','可旋轉的大樓房間與走道模型');
 scene.add(new THREE.HemisphereLight(0xd9edff,0x384858,2.4));const sun=new THREE.DirectionalLight(0xffe2b7,2.3);sun.position.set(40,100,65);scene.add(sun);const fill=new THREE.DirectionalLight(0x88bbff,1.4);fill.position.set(-50,40,-30);scene.add(fill);
 controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.dampingFactor=.08;controls.minZoom=.35;controls.maxZoom=8;controls.minDistance=5;controls.maxDistance=1200;controls.maxPolarAngle=Math.PI*.93;
 groups.forEach(g=>{const b=document.createElement('button');b.dataset.group=g.id;b.innerHTML=`<b>${g.range}</b><small>${g.title}</small>`;b.onclick=()=>selectGroup(g.id);$('floor-list').append(b);});
 data.nodes.forEach(n=>{const o=document.createElement('option');o.value=n.id;o.textContent=n.id+' · '+n.name;$('room-picker').append(o);});
 usedFloors.forEach(f=>{const o=document.createElement('option');o.value=String(f);o.textContent=floorName(f)+' · '+data.nodes.filter(n=>n.floor===f).map(n=>n.id).join(' / ');$('floor-only').append(o);});
 $('floor-only').onchange=e=>{state.floor=e.target.value==='all'?null:Number(e.target.value);if(state.floor!==null){const n=data.nodes.find(n=>n.floor===state.floor);state.group=n.group;state.selected=n.id;updateDetails();history.replaceState(null,'','#scene='+n.id);}applyVisibility();fitCamera();};
 const initial=new URLSearchParams(location.hash.slice(1)).get('scene');if(nodeMap.has(initial))state.selected=initial;
 $('room-picker').onchange=e=>selectRoom(e.target.value);$('height-mode').onchange=e=>{state.height=e.target.value;rebuild();};$('spread').oninput=e=>{state.spread=Number(e.target.value);$('spread-value').textContent=state.spread;rebuild();};
 ['shell','special','labels'].forEach(id=>$(id).onchange=e=>{state[id]=e.target.checked;applyVisibility();});['iso','front','top'].forEach(id=>$(id).onclick=()=>{state.view=id;fitCamera();});$('reset').onclick=()=>{state.view='iso';fitCamera();};
 $('perspective').onclick=togglePerspective;
 $('prev').onclick=()=>{const i=data.nodes.findIndex(n=>n.id===state.selected);if(i>0)selectRoom(data.nodes[i-1].id);};$('next').onclick=()=>{const i=data.nodes.findIndex(n=>n.id===state.selected);if(i<data.nodes.length-1)selectRoom(data.nodes[i+1].id);};
 window.addEventListener('hashchange',()=>{const id=new URLSearchParams(location.hash.slice(1)).get('scene');if(nodeMap.has(id))selectRoom(id);});
 let down;renderer.domElement.addEventListener('pointerdown',e=>down=[e.clientX,e.clientY]);renderer.domElement.addEventListener('pointerup',e=>{if(!down||Math.hypot(e.clientX-down[0],e.clientY-down[1])>5)return;const r=renderer.domElement.getBoundingClientRect(),ray=new THREE.Raycaster();ray.setFromCamera(new THREE.Vector2((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1),camera);const hit=ray.intersectObjects(roomMeshes.filter(m=>m.parent.visible))[0];if(hit)selectRoom(hit.object.userData.node);});
 new ResizeObserver(()=>{renderer.setSize(host.clientWidth,host.clientHeight);const a=host.clientWidth/host.clientHeight;if(camera.isPerspectiveCamera)camera.aspect=a;else{camera.left=-camera.top*a;camera.right=camera.top*a;}camera.updateProjectionMatrix();}).observe(host);
 rebuild();updateDetails();$('loading').remove();
 renderer.setAnimationLoop(()=>{controls.update();renderer.render(scene,camera);renderTags();});
}
try{init();}catch(error){$('loading')?.remove();$('error').style.display='block';$('error').textContent='3D 模型無法啟動。請使用支援 WebGL 的瀏覽器並開啟硬體加速。'+error.message;console.error(error);}
