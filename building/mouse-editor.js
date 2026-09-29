import {createRoute, inferPortal, portalPosition, makeRoutePoints, orthogonalize, routeWarnings} from './sandbox-routes.js';
import {connectionFromGesture, editableRouteFromPath, stairBodyFromPath, translateStairBody} from './mouse-routes.js';
import {toFloorStairs, reconcileFloorStairs, getFloorSectionPoints, translateFloorSection, setFloorSectionShape, placeFloorStair} from './floor-stairs.js';
import {buildStairCatalog} from './stair-catalog.js';
import {landingPorts, resolveLinkEndpoint, makeLandingLinkPoints} from './landing-links.js';
import {clipRouteToHeight} from './floor-route-view.js';

const clone = value => JSON.parse(JSON.stringify(value));
const snap = value => Math.round(value * 2) / 2;
const clamp = (value, lo, hi) => Math.min(hi, Math.max(lo, value));
const names = {north:'北',east:'東',south:'南',west:'西'};

// Direct manipulation owns transient gestures. Only a completed gesture reaches
// the shared store, so Escape and pointer cancellation never change the model.
export function createMouseEditor(env) {
 const {THREE,host,scene,data,nodeMap,editor,roomY,pathFor,drawRoute,afterEdit} = env;
 const $=id=>document.getElementById(id);
 let enabled=false,mode='select',selectedId=null,working=null,drawing=null,gesture=null;
 let overlay=null,markers=[],roomDelta=null,hoverRoom=null,stairBody=null,sectionIndex=0;
 let mainStair=false,mainStages=[],mainEdgeIds=new Set();
 let placement=null;
 let linkDraft=null;
 const linkContext=()=>({edges:data.edges,nodeMap,roomY,pathFor,floorHeight:env.floorHeight});
 const sameEndpoint=(a,b)=>a&&b&&a.kind===b.kind&&(a.kind==='room'?a.roomId===b.roomId&&a.side===b.side&&a.u===b.u:a.edgeId===b.edgeId&&a.floor===b.floor);
 const endpointName=p=>p.kind==='room'?`${p.roomId} ${names[p.side]}側門口`:`${floorLabel(p.floor)} 樓梯平台`;
 const mainDrafts=new Map();
 const edge=()=>data.edges.find(e=>e.id===selectedId);
 const camera=()=>env.camera(),controls=()=>env.controls();
 const visibleRooms=()=>data.nodes.filter(env.visible);
 const floorLabel=f=>f<0?'B'+Math.abs(f):f+'F';
 const activeFloors=()=>env.floors();
 const sections=()=>working?.route.stairSections;
 const section=()=>sections()?.[sectionIndex];
 function sectionAtFloor(f){const list=sections();if(!list)return -1;const at=list.findIndex(s=>s.fromFloor===f);return at>=0?at:list.at(-1).toFloor===f?list.length-1:-1;}
 const sectionLabel=s=>floorLabel(s.fromFloor)+' → '+floorLabel(s.toFloor);
 const sectionPoints=()=>sections()?getFloorSectionPoints(working.route,sectionIndex,roomY(nodeMap.get(working.fromId)),roomY(nodeMap.get(working.toId)),env.floorHeight):[];
 function sectionHeights(){const s=section();return s?[sectionIndex===0?roomY(nodeMap.get(working.fromId)):env.floorHeight(s.fromFloor),sectionIndex===sections().length-1?roomY(nodeMap.get(working.toId)):env.floorHeight(s.toFloor)]:[roomY(nodeMap.get(working.fromId)),roomY(nodeMap.get(working.toId))];}
 const controlPoints=()=>section()?.points||working.route.points;
 function editable(e,forMain=false){const a=nodeMap.get(e.fromId),b=nodeMap.get(e.toId);return e.route?.stairSections?reconcileFloorStairs(e.route,a,b,roomY(a),roomY(b),env.floorHeight):forMain&&a.floor!==b.floor?toFloorStairs(e,pathFor(e).points,a,b,roomY(a),roomY(b),env.floorHeight):editableRouteFromPath(e,pathFor(e).points,a,b,roomY(a),roomY(b));}
 const mainStageKey=s=>`${s.edgeId}:${s.fromFloor}:${s.toFloor}`;
 function refreshCatalog(){const catalog=buildStairCatalog(data.edges,nodeMap,pathFor);mainEdgeIds=new Set(catalog.filter(e=>e.main).map(e=>e.edgeId));mainStages=catalog.filter(e=>e.main).flatMap(e=>e.sections.map(s=>({...s,edgeId:e.edgeId})));}
 function isMainEdge(id){return mainEdgeIds.has(id);}
 function leaveMain(){mainStair=false;mainDrafts.clear();}
 function mainDraft(e){
  const signature=JSON.stringify(e),saved=mainDrafts.get(e.id),a=nodeMap.get(e.fromId),b=nodeMap.get(e.toId);
  const draft=saved?.signature===signature?clone(saved.draft):{...clone(e),route:editable(e,true)};
  if(draft.route?.stairSections)draft.route=reconcileFloorStairs(draft.route,a,b,roomY(a),roomY(b),env.floorHeight);
  mainDrafts.set(e.id,{signature,draft:clone(draft)});return draft;
 }
 function mainStageAt(floor,edgeId){
  const preferred=edgeId?mainStages.filter(s=>s.edgeId===edgeId):mainStages;
  const choices=preferred.length?preferred:mainStages;
  return choices.find(s=>s.fromFloor===floor)||choices.find(s=>s.toFloor===floor)||choices[0];
 }
 function beginPlacement(){
  if(!section())return;cancel();$('mouse-stair-fine-tune').open=false;
  placement={edgeId:selectedId,signature:JSON.stringify(edge()),index:sectionIndex,rotation:0,x:null,z:null,route:null};
  host.dataset.mouseTool='stairs';env.plan();sync();refreshOverlay();instructions();
 }
 function updatePlacement(event){
  if(!placement||!section())return;
  const p=world(event,sectionHeights()[0]+.3);if(!p)return;
  const x=snap(p.x),z=snap(p.z);if(x===placement.x&&z===placement.z&&placement.route)return;
  placement.x=x;placement.z=z;previewPlacement();
 }
 function previewPlacement(){
  try{placement.route=placeFloorStair(working.route,sectionIndex,placement.x,placement.z,placement.rotation);}
  catch(error){placement.route=null;env.status(error.message,true);status('無法放置樓梯',error.message);}
  refreshOverlay(false);
 }
 function rotatePlacement(){
  if(!placement)return;placement.rotation=(placement.rotation+1)%4;
  if(placement.x!==null)previewPlacement();
  instructions();
 }
 function status(title,text='') {
  $('mouse-banner').replaceChildren();
  const b=document.createElement('b'),span=document.createElement('span');b.textContent=title;span.textContent=text;$('mouse-banner').append(b,span);
  if(drawing){const stop=document.createElement('button');stop.type='button';stop.className='mouse-cancel';stop.textContent='取消畫路';stop.onclick=()=>{cancel();instructions();};$('mouse-banner').append(stop);}
  $('mouse-help').textContent=text;
 }
 function instructions() {
  if(mode==='link')status(linkDraft?'已選 A：'+endpointName(linkDraft.from)+' · 請點 B':'A → B 連接 · 請先點 A','點這層樓梯的 ＋ 選 A，再切換樓層點另一座樓梯的 ＋ 選 B；中間自動接樓梯。也可連接房間門口；Esc 取消。');
  else if(placement&&section())status('點地面放樓梯 · '+sectionLabel(section()),'移動滑鼠預覽，點一下放置並自動接通上下平台。R 旋轉 90°，Esc 取消。');
  else if(drawing)status('從 '+drawing.fromId+' 畫通路','移到另一間房放開／點一下完成；點空白處加轉角，Esc 取消。');
  else if(mode==='draw')status('從房間邊緣拉出通路','拖到另一間房，自動開門接路；跨樓層會自動接樓梯。');
  else if(mode==='demolish')status('點選要拆除的通路','點一下即可拆除；按 ↶ 可以復原。');
  else if(mainStair&&section())status('主樓梯 · '+sectionLabel(section()),'按「點地面放樓梯」選位置，自動接到上一層；切換樓層可繼續放置，微調形狀可調整細節。');
  else if(section())status(sectionLabel(section())+' · 只編輯這一層','拖「✥ 移動此層樓梯」調位置；金色點改轉角，右側切換梯段。相鄰層由平台銜接。');
  else if(selectedId&&stairBody)status('拖曳「✥ 移動樓梯」調整位置','整座樓梯與平台一起移動，兩端走道接回房間；金色點改轉折，A／B 改路口。');
  else if(selectedId)status('直接拖動通路','拖金色轉角改路線，拖 A／B 改路口，拖 ＋ 增加轉角。');
  else status('直接拖曳房間','拖房間移動、拖角落改大小；從牆邊的 ＋ 拉到另一間房接路。');
 }
 function ray(event){const r=host.getBoundingClientRect(),ray=new THREE.Raycaster();ray.setFromCamera(new THREE.Vector2((event.clientX-r.left)/r.width*2-1,-(event.clientY-r.top)/r.height*2+1),camera());return ray;}
 function world(event,y){return ray(event).ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0,1,0),-y),new THREE.Vector3());}
 function roomAt(event){
  const under=document.elementFromPoint(event.clientX,event.clientY)?.closest?.('[data-mouse-kind="port"],.room-tag');
  if(under?.dataset.mouseKind==='port')return nodeMap.get(under.dataset.id);
  const label=under||event.target.closest?.('.room-tag');if(label?.dataset.node)return nodeMap.get(label.dataset.node);
  const hit=ray(event).intersectObjects(env.roomMeshes().filter(m=>m.parent.visible))[0];return hit?nodeMap.get(hit.object.userData.node):null;
 }
 function roadAt(event){const r=ray(event);r.params.Line.threshold=.5;return r.intersectObjects(env.edgeObjects().filter(o=>o.g.visible).map(o=>o.g),true)[0]?.object.userData.edge;}
 function linkEndpointAt(event){
  const under=document.elementFromPoint(event.clientX,event.clientY)?.closest?.('[data-mouse-kind="link-port"]');
  const handle=under||(!gesture?event.target.closest?.('[data-mouse-kind="link-port"]'):null);
  if(!handle)return null;
  try{return JSON.parse(handle.dataset.endpoint);}catch{return null;}
 }
 function nextLinkId(){let i=1;while([...(data.platformLinks||[]),...data.edges].some(link=>link.id==='platform-'+i))i++;return 'platform-'+i;}
 function pickLinkEndpoint(endpoint){
  if(!enabled||mode!=='link')return false;
  try{
   if(!resolveLinkEndpoint(endpoint,linkContext()))throw Error('這個門口或樓梯平台已不存在，請重新選擇。');
   if(!linkDraft){linkDraft={from:clone(endpoint),to:null};refreshOverlay();sync();instructions();return true;}
   if(sameEndpoint(linkDraft.from,endpoint)){status('A 與 B 不能是同一個接點','請點選另一個房間門口或樓梯平台；Esc 取消。');return false;}
   const from=linkDraft.from;
   if(from.kind==='room'&&endpoint.kind==='room'){
    if(from.roomId===endpoint.roomId){status('請選另一間房間或樓梯平台','同一房間的兩個門口不能接成新通路；Esc 取消。');return false;}
    const a=nodeMap.get(from.roomId),b=nodeMap.get(endpoint.roomId);
    const proposed=connectionFromGesture({id:idForNew(),fromRoom:a,toRoom:b,fromPortal:{side:from.side,u:from.u},toPortal:{side:endpoint.side,u:endpoint.u},heightA:roomY(a),heightB:roomY(b)});
    if(a.floor!==b.floor)proposed.route=toFloorStairs(proposed,routePath(proposed),a,b,roomY(a),roomY(b),env.floorHeight);
    editor.addEdge(proposed);
   }else{
    const link={id:nextLinkId(),from:clone(from),to:clone(endpoint),width:1.6,points:[]};
    if(makeLandingLinkPoints(link,linkContext()).length<2)throw Error('無法連接這兩個接點，請重新選擇。');
    editor.addPlatformLink(link);
   }
   linkDraft=null;afterEdit(`${endpointName(from)} → ${endpointName(endpoint)} 已連接`);refreshOverlay();sync();instructions();return true;
  }catch(error){env.status(error.message,true);status('尚未連接',error.message);return false;}
 }
 function updateLinkPreview(event){
  if(!linkDraft)return;
  const target=linkEndpointAt(event);linkDraft.to=target&&!sameEndpoint(linkDraft.from,target)?target:null;
  refreshOverlay(false);
 }
 function portAt(n,event){const under=document.elementFromPoint(event.clientX,event.clientY)?.closest?.('[data-mouse-kind="port"]');if(under?.dataset.id===n.id)return{side:under.dataset.side,u:0};const p=world(event,roomY(n)+.3);return inferPortal(n,p?[p.x,p.y,p.z]:[n.x+n.w/2,0,n.z]);}
 function cleanupGeometry(){if(overlay){scene.remove(overlay);overlay.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});overlay=null;}}
 function clearMarkers(){markers.forEach(m=>m.el.remove());markers=[];}
 function addMarker(text,p,cls,label,kind,values={}){
  const el=document.createElement('button');el.className=cls;el.textContent=text;el.title=label;el.setAttribute('aria-label',label);el.dataset.mouseKind=kind;
  for(const [key,value] of Object.entries(values))el.dataset[key]=value;
  host.append(el);markers.push({el,point:[...p],kind,...values});return el;
 }
 function routePath(e){const a=nodeMap.get(e.fromId),b=nodeMap.get(e.toId);return makeRoutePoints(a,b,roomY(a),roomY(b),e.route,env.floorHeight);}
 function hasStairs(e,points){return e.route?.mode!=='ramp'&&points.some((p,i)=>i&&Math.abs(p[1]-points[i-1][1])>.05);}
 function bodyFor(e,points){if(!hasStairs(e,points))return null;const a=nodeMap.get(e.fromId),b=nodeMap.get(e.toId);try{return stairBodyFromPath(e,points,a,b,roomY(a),roomY(b));}catch{return null;}}
 function warnings(e,points){const a=nodeMap.get(e.fromId),b=nodeMap.get(e.toId);return routeWarnings(points,a,b,roomY(a),roomY(b),data.nodes,id=>roomY(nodeMap.get(id)),e.route.width).join(' ');}
 function paintRoute(e,points){drawRoute(e,points,overlay,true);}
 function displayDrawing(){
  const a=nodeMap.get(drawing.fromId),start=portalPosition(a,drawing.from,roomY(a)),last=drawing.cursor||start;
  if(drawing.target){const b=nodeMap.get(drawing.target.id),proposal=connectionFromGesture({id:'preview',fromRoom:a,toRoom:b,fromPortal:drawing.from,toPortal:drawing.target.portal,waypoints:drawing.waypoints,heightA:roomY(a),heightB:roomY(b)});paintRoute(proposal,routePath(proposal));}
  else{const points=orthogonalize([start,...drawing.waypoints.map(p=>[p.x,roomY(a)+.3,p.z]),last]);paintRoute({route:{width:1.6},back:true},points);}
 }
 function refreshOverlay(rebuildMarkers=true){
  cleanupGeometry();if(rebuildMarkers){clearMarkers();stairBody=null;}if(!enabled)return;
  overlay=new THREE.Group();scene.add(overlay);
  if(mode==='link'&&linkDraft?.to){
   try{paintRoute({route:{width:1.6},back:true},makeLandingLinkPoints({from:linkDraft.from,to:linkDraft.to,width:1.6,points:[]},linkContext()));}catch{/* Invalid hovered targets remain uncommitted. */}
  }else if(drawing)displayDrawing();else if(working){
   if(section()){
    const shown=placement?.route?{...working,route:placement.route}:working,ghost=new THREE.Group(),heights=sectionHeights().map(y=>y+.3);
    const minY=Math.min(...heights),maxY=Math.max(...heights);overlay.add(ghost);
    // Keep this floor's connecting landings without showing other floors' stairs.
    for(const points of clipRouteToHeight(routePath(shown),minY,maxY))drawRoute(shown,points,ghost,true);
    ghost.traverse(o=>{if(o.material){o.material.transparent=true;o.material.opacity*=placement?.route ? .45 : .16;o.material.depthWrite=false;}});
    const points=getFloorSectionPoints(shown.route,sectionIndex,roomY(nodeMap.get(shown.fromId)),roomY(nodeMap.get(shown.toId)),env.floorHeight);
    for(const path of clipRouteToHeight(points,minY,maxY))paintRoute(shown,path);
   }
   else paintRoute(working,routePath(working));
  }
  if(gesture?.kind==='resize'){
   const p=gesture.patch,y=roomY(nodeMap.get(gesture.id))+.4;
   const geometry=new THREE.BoxGeometry(p.w,.15,p.d),material=new THREE.MeshBasicMaterial({color:0xffd38a,transparent:true,opacity:.35});const box=new THREE.Mesh(geometry,material);box.position.set(p.x,y,p.z);overlay.add(box);
  }
  if(!rebuildMarkers)return;
  if(mode==='link'){
   const addPort=(endpoint,point,label)=>{const selected=sameEndpoint(linkDraft?.from,endpoint),el=addMarker(selected?'A':'+',point,'mouse-port mouse-link-port'+(endpoint.kind==='landing'?' landing':'')+(selected?' selected':''),label,'link-port',{endpoint:JSON.stringify(endpoint)});el.setAttribute('aria-pressed',String(!!selected));};
   for(const n of visibleRooms().filter(n=>n.floor===env.floor()))for(const side of Object.keys(names)){const endpoint={kind:'room',roomId:n.id,side,u:0};addPort(endpoint,portalPosition(n,endpoint,roomY(n)+.5),`${n.id} ${names[side]}側門口`);}
   for(const port of landingPorts(linkContext()).filter(port=>port.endpoint.floor===env.floor()))addPort(port.endpoint,port.point,port.label);
   return;
  }
  if(section()&&(placement||mainStair&&!$('mouse-stair-fine-tune').open))return;
  if(drawing||mode==='draw'){
   for(const n of visibleRooms())for(const side of Object.keys(names))addMarker(drawing?.fromId===n.id&&drawing.from.side===side?'A':'+',portalPosition(n,{side,u:0},roomY(n)+.5),'mouse-port',`${n.id} ${names[side]}側拉出通路`,'port',{id:n.id,side});
  }else if(mode==='select'&&working){
   const a=nodeMap.get(working.fromId),b=nodeMap.get(working.toId),r=working.route,[ha,hb]=sectionHeights(),points=controlPoints();
   if(!mainStair&&(!section()||sectionIndex===0))addMarker('A',portalPosition(a,r.from,roomY(a)+.25,r.width),'mouse-endpoint','拖曳起點路口','endpoint',{end:'from'});
   if(!mainStair&&(!section()||sectionIndex===sections().length-1))addMarker('B',portalPosition(b,r.to,roomY(b)+.25,r.width),'mouse-endpoint','拖曳終點路口','endpoint',{end:'to'});
   points.forEach((p,index)=>addMarker('',[p.x,ha+(hb-ha)*p.t+.3+p.dy,p.z],'mouse-point',section()?(index===0?'拖曳此層梯段起點':index===points.length-1?'拖曳此層梯段終點':'拖曳此層轉角 '+index):'拖曳轉角 '+(index+1),'point',{index}));
   const actual=section()?sectionPoints():routePath(working);let previous=0;
   const anchors=points.map(p=>{const y=ha+(hb-ha)*p.t+.3+p.dy;let at=actual.findIndex((q,i)=>i>=previous&&Math.hypot(q[0]-p.x,q[1]-y,q[2]-p.z)<.001);if(at<0)at=previous;previous=at;return at;});
   for(let i=1;i<actual.length;i++){const p=actual[i-1],q=actual[i];if(Math.hypot(q[0]-p[0],q[2]-p[2])<3)continue;const x=(p[0]+q[0])/2,y=(p[1]+q[1])/2,z=(p[2]+q[2])/2,t=Math.abs(hb-ha)>.001?clamp((y-ha-.3)/(hb-ha),0,1):.5,dy=y-ha-(hb-ha)*t-.3,index=anchors.filter(at=>at<=i-1).length;addMarker('+',[x,y,z],'mouse-midpoint','新增轉角 '+i,'midpoint',{index,x,z,t,dy});}
   if(section()){const middle=actual[Math.floor(actual.length/2)];addMarker('✥ 移動此層樓梯',middle,'mouse-stair-body','拖曳移動此層樓梯','stair-section');}
   else{stairBody=bodyFor(working,actual);if(stairBody)addMarker('✥ 移動樓梯',stairBody.center,'mouse-stair-body','拖曳移動整座樓梯','stair-body');}
  }else if(mode==='select'){
   const n=nodeMap.get(env.selectedRoom());if(n&&env.visible(n)){
    for(const side of Object.keys(names))addMarker('+',portalPosition(n,{side,u:0},roomY(n)+.5),'mouse-port',`${n.id} ${names[side]}側拉出通路`,'port',{id:n.id,side});
    for(const sx of[-1,1])for(const sz of[-1,1])addMarker('',[n.x+sx*n.w/2,roomY(n)+.3,n.z+sz*n.d/2],'mouse-room-size','拖曳房間角落調整大小','resize',{id:n.id,sx,sz});
   }
  }
 }
 function sync(){
  if(!$('mouse-toolbar'))return;
  refreshCatalog();
  for(const id of['mouse-toolbar','mouse-banner','mouse-floorbar'])$(id).hidden=!enabled;
  for(const key of['select','draw','link','demolish'])$('mouse-'+key)?.setAttribute('aria-pressed',String(mode===key));
  $('mouse-undo').disabled=!editor.canUndo();$('mouse-redo').disabled=!editor.canRedo();
  const fs=activeFloors(),f=env.floor();$('mouse-floor').replaceChildren(...fs.map(v=>new Option(floorLabel(v)+' · '+(data.nodes.filter(n=>n.floor===v).map(n=>n.id).join(' / ')||'無房間'),v)));$('mouse-floor').value=String(f);
  const index=fs.indexOf(f);$('mouse-floor-prev').disabled=index<=0;$('mouse-floor-next').disabled=index>=fs.length-1;
  const n=nodeMap.get(env.selectedRoom());
  $('mouse-room-actions').hidden=!!selectedId||mode!=='select'||n.floor!==f;$('mouse-route-actions').hidden=!selectedId||mainStair;
  for(const shape of['straight','l','u'])$('mouse-shape-'+shape).hidden=!!sections();
  $('mouse-selection').textContent=mainStair&&section()?'主樓梯 · '+sectionLabel(section()):working?`${working.fromId} ↔ ${working.toId}`:n.floor===f?n.id+' · '+n.name:floorLabel(f)+' · 樓梯配置';
  $('mouse-selection-info').textContent=mainStair&&section()?'目前編輯 '+sectionLabel(section())+'；點選位置後，自動生成樓梯並銜接上下平台。':section()?sectionLabel(section())+' · 此段的改動會獨立保存':working?(warnings(working,routePath(working))||(hasStairs(working,routePath(working))?'樓梯已選取 · 拖曳「✥ 移動樓梯」':'通路已選取 · 在畫面上拖動轉角')):n.floor===f?floorLabel(n.floor)+' · 拖曳移動，角落縮放':'可從下方選取途經此層的樓梯。';
  if(mode==='link'){$('mouse-selection').textContent=linkDraft?'A：'+endpointName(linkDraft.from):'A → B 連接';$('mouse-selection-info').textContent=linkDraft?'切換到目標樓層，再點樓梯的 ＋ 選 B；中間自動連接。':'先點這層樓梯的 ＋ 選 A，也可選房間門口。';}
  if($('mouse-main-stair-tools'))$('mouse-main-stair-tools').hidden=!mainStair;
  if($('mouse-main-stair-picker')){$('mouse-main-stair-picker').replaceChildren(...mainStages.map(s=>new Option(sectionLabel(s),mainStageKey(s))));const current=section();$('mouse-main-stair-picker').value=current?mainStageKey({...current,edgeId:selectedId}):'';}
  const canSplit=working&&nodeMap.get(working.fromId).floor!==nodeMap.get(working.toId).floor&&working.route.mode!=='ramp';
  $('mouse-stair-placement-tools').hidden=!section();
  $('mouse-place-stair').setAttribute('aria-pressed',String(!!placement));
  $('mouse-place-stair').textContent=placement?'取消放置（Esc）':'點地面放樓梯';
  $('mouse-rotate-stair').disabled=!placement;
  $('mouse-floor-stairs').hidden=!canSplit;
  $('mouse-split-stairs').hidden=mainStair||!!sections();$('mouse-section-tools').hidden=!sections();
  const sectionNav=$('mouse-section-picker').closest('.mouse-section-nav'),sectionCaption=$('mouse-section-tools').querySelector('label[for="mouse-section-picker"]');if(sectionNav)sectionNav.hidden=mainStair;if(sectionCaption)sectionCaption.hidden=mainStair;
  $('mouse-section-picker').replaceChildren(...(sections()||[]).map((s,i)=>new Option(sectionLabel(s),String(i))));$('mouse-section-picker').value=String(sectionIndex);
  $('mouse-section-prev').disabled=sectionIndex<=0;$('mouse-section-next').disabled=!sections()||sectionIndex>=sections().length-1;
  $('mouse-floor-down').disabled=n.floor===-3;$('mouse-floor-up').disabled=n.floor===43;
  const stairs=data.edges.filter(e=>{const a=nodeMap.get(e.fromId),b=nodeMap.get(e.toId);return (e.fromId===n.id&&n.floor===f||e.toId===n.id&&n.floor===f||f>=Math.min(a.floor,b.floor)&&f<=Math.max(a.floor,b.floor))&&hasStairs(e,pathFor(e).points);});
  $('mouse-stair-list').hidden=mainStair||mode!=='select'||!stairs.length;
  $('mouse-stair-links').replaceChildren(...stairs.map(e=>{const button=document.createElement('button');button.type='button';button.textContent=`${e.fromId} ${floorLabel(nodeMap.get(e.fromId).floor)} ↔ ${e.toId} ${floorLabel(nodeMap.get(e.toId).floor)}`;button.setAttribute('aria-label',`編輯樓梯 ${e.fromId} 到 ${e.toId}`);button.setAttribute('aria-pressed',String(e.id===selectedId));button.onclick=()=>selectRoad(e.id,{focus:true});return button;}));
  env.onChange?.();
 }
 function refresh(){
  if(gesture)return;
  if(linkDraft){try{if(!resolveLinkEndpoint(linkDraft.from,linkContext()))linkDraft=null;}catch{linkDraft=null;}}
  if(placement&&(!edge()||JSON.stringify(edge())!==placement.signature)){placement=null;host.dataset.mouseTool=mode;}
  refreshCatalog();
  if(selectedId){const e=edge(),current=section();if(!e||mainStair&&!isMainEdge(selectedId)){selectedId=null;working=null;leaveMain();}else{working=mainStair?mainDraft(e):{...clone(e),route:editable(e)};const retained=current?sections()?.findIndex(s=>s.fromFloor===current.fromFloor&&s.toFloor===current.toFloor):-1;sectionIndex=retained>=0?retained:clamp(sectionIndex,0,(sections()?.length||1)-1);}}
  env.visibility();sync();refreshOverlay();
 }
 function selectMainStair(floor=env.floor(),edgeId){
  cancel();refreshCatalog();const chosen=mainStageAt(floor,edgeId);
  if(!chosen){leaveMain();status('目前沒有可編輯的主樓梯','主線與跨幕通路需要連接不同樓層。');sync();return;}
  const e=data.edges.find(value=>value.id===chosen.edgeId);if(!e)return;
  try{
   mainStair=true;mode='select';host.dataset.mouseTool=mode;selectedId=e.id;working=mainDraft(e);
   sectionIndex=sections()?.findIndex(s=>s.fromFloor===chosen.fromFloor&&s.toFloor===chosen.toFloor)??-1;
   if(sectionIndex<0){leaveMain();selectedId=null;working=null;status('無法定位這一層主樓梯','請重新選擇樓層。');sync();return;}
   // Cache the read-only conversion before setFloor triggers the host's
   // updateDetails/refresh path; no selection operation writes to the store.
   env.setFloor(section().fromFloor);env.visibility();sync();refreshOverlay();env.plan();env.fit();beginPlacement();
  }catch(error){leaveMain();selectedId=null;working=null;env.status(error.message,true);status('無法選取主樓梯',error.message);sync();refreshOverlay();}
 }
 function selectRoad(id,{focus=false}={}){
  refreshCatalog();if(isMainEdge(id)){selectMainStair(env.floor(),id);return;}
  cancel();const e=data.edges.find(e=>e.id===id);if(!e)return;
  leaveMain();
  mode='select';host.dataset.mouseTool=mode;
  selectedId=id;working=clone(e);working.route=editable(e);sectionIndex=Math.max(0,sectionAtFloor(env.floor()));
  if(section())env.setFloor(section().fromFloor);
  env.visibility();sync();refreshOverlay();if(focus){env.plan();env.fit();}instructions();
 }
 function selectRoom(id){cancel();leaveMain();selectedId=null;working=null;env.selectRoom(id);env.visibility();sync();refreshOverlay();instructions();}
 function chooseSection(index){if(!sections()||index<0||index>=sections().length)return;cancel();sectionIndex=index;env.setFloor(section().fromFloor);env.visibility();sync();refreshOverlay();env.fit();instructions();}
 function splitStairs(){if(!working)return;cancel();const a=nodeMap.get(working.fromId),b=nodeMap.get(working.toId);try{const route=toFloorStairs(working,routePath(working),a,b,roomY(a),roomY(b),env.floorHeight);if(!route)return;working.route=route;sectionIndex=Math.max(0,sectionAtFloor(env.floor()));saveWorking('已分成 '+sections().length+' 段，可逐層設定');chooseSection(sectionIndex);}catch(error){env.status(error.message,true);}}
 function idForNew(){let i=1;while([...data.edges,...(data.platformLinks||[])].some(e=>e.id==='custom-'+i))i++;return 'custom-'+i;}
 function saveWorking(message){
  if(!working)return;
  const old=edge(),patch={fromId:working.fromId,toId:working.toId,route:clone(working.route)};
  if(old&&(old.fromId!==working.fromId||old.toId!==working.toId))Object.assign(patch,{kind:'自訂',source:'沙盒自訂配置',gate:'沙盒自訂路口。',motion:'滑鼠編輯通路。',returnRule:'依自訂通行方向。'});
  if(editor.updateEdge(selectedId,patch))afterEdit(message);
 }
 function finishConnection(target){
  const a=nodeMap.get(drawing.fromId),b=nodeMap.get(target.id);
  if(a.id===b.id){status('請接到另一間房間','Esc 取消這條通路。');return false;}
  const proposed=connectionFromGesture({id:idForNew(),fromRoom:a,toRoom:b,fromPortal:drawing.from,toPortal:target.portal,waypoints:drawing.waypoints,heightA:roomY(a),heightB:roomY(b)});
  if(a.floor!==b.floor)proposed.route=toFloorStairs(proposed,routePath(proposed),a,b,roomY(a),roomY(b),env.floorHeight);
  editor.addEdge(proposed);drawing=null;working=null;selectedId=null;afterEdit(`${a.id} ↔ ${b.id} 已接通`);if(hasStairs(proposed,routePath(proposed)))selectRoad(proposed.id,{focus:true});else{refreshOverlay();instructions();}return true;
 }
 function capture(event,kind,extra={}){
  gesture={kind,pointer:event.pointerId,startX:event.clientX,startY:event.clientY,moved:false,...extra};event.preventDefault();event.stopImmediatePropagation();controls().enabled=false;host.setPointerCapture(event.pointerId);
 }
 function startDraw(event,n,portal){
  leaveMain();
  const explicitTarget=drawing&&drawing.fromId!==n.id?{id:n.id,portal}:null;
  if(!drawing){selectedId=null;working=null;drawing={fromId:n.id,from:portal,waypoints:[],cursor:portalPosition(n,portal,roomY(n)),target:null};env.visibility();refreshOverlay();sync();instructions();}
  capture(event,'draw',{explicitTarget});
 }
 function pointerDown(event){
  if(!enabled||event.button!==0||gesture)return;
  if(mode==='link'){
   const endpoint=linkEndpointAt(event);
   if(endpoint){const started=!linkDraft;if(started&&!pickLinkEndpoint(endpoint))return;capture(event,'link',{started,endpoint});}
   return;
  }
  if(placement){if(event.target===env.canvas()||event.target.closest?.('.room-tag')){updatePlacement(event);capture(event,'stair-place',{before:clone(working)});}return;}
  const handle=event.target.closest?.('[data-mouse-kind]'),kind=handle?.dataset.mouseKind;
  if(handle){
   if(kind==='stair-section'&&section()){const marker=markers.find(m=>m.el===handle),y=marker.point[1],start=world(event,y);if(!start)return;capture(event,'stair-section',{before:clone(working),sectionIndex,start,y,center:[...marker.point]});return;}
   if(kind==='stair-body'&&stairBody){const y=stairBody.center[1],start=world(event,y);if(!start)return;capture(event,'stair-body',{before:clone(working),body:clone(stairBody),start,y});return;}
   if(kind==='port'){const n=nodeMap.get(handle.dataset.id);startDraw(event,n,{side:handle.dataset.side,u:0});return;}
   if(kind==='resize'){
    const n=nodeMap.get(handle.dataset.id);capture(event,'resize',{id:n.id,original:{...n},sx:Number(handle.dataset.sx),sz:Number(handle.dataset.sz),patch:{x:n.x,z:n.z,w:n.w,d:n.d}});return;
   }
   if(kind==='point'||kind==='midpoint'){
    const before=clone(working);let index=Number(handle.dataset.index);
    if(kind==='midpoint'){if(controlPoints().length>=256)return;controlPoints().splice(index,0,{x:Number(handle.dataset.x),z:Number(handle.dataset.z),t:Number(handle.dataset.t),dy:Number(handle.dataset.dy)});}
    const p=controlPoints()[index],[ha,hb]=sectionHeights(),y=ha+(hb-ha)*p.t+.3+p.dy,start=world(event,y);
    capture(event,'point',{before,index,original:{...p},y,start,inserted:kind==='midpoint'});refreshOverlay(false);return;
   }
   if(kind==='endpoint'){capture(event,'endpoint',{before:clone(working),end:handle.dataset.end,valid:false});return;}
  }
  if(event.target!==env.canvas()&&!event.target.closest?.('.room-tag'))return;
  const n=roomAt(event),road=event.target.closest?.('.room-tag')?null:roadAt(event);
  if(mode==='demolish'){const platformId=env.platformLinkAt?.(event);capture(event,platformId?'delete-platform':'delete',{id:platformId||road});return;}
  if(mode==='draw'||drawing){
   if(!drawing){if(n)startDraw(event,n,portAt(n,event));else status('先點房間邊緣','從房間的 ＋ 拉出通路。');}
   else capture(event,'draw');return;
  }
  if(road){if(isMainEdge(road))selectMainStair(env.floor(),road);else selectRoad(road);capture(event,'select');return;}
  if(n){selectRoom(n.id);const start=world(event,roomY(n));capture(event,'move',{id:n.id,original:{x:n.x,z:n.z},start,y:roomY(n),patch:{x:n.x,z:n.z}});return;}
  if(mainStair){instructions();return;}selectedId=null;working=null;env.visibility();sync();refreshOverlay();instructions();
 }
 function updateDraw(event){
  const a=nodeMap.get(drawing.fromId),n=roomAt(event),p=world(event,roomY(a)+.3);
  drawing.target=n&&n.id!==a.id?{id:n.id,portal:portAt(n,event)}:null;
  if(p)drawing.cursor=[snap(p.x),roomY(a)+.3,snap(p.z)];
  if(hoverRoom!==drawing.target?.id){hoverRoom=drawing.target?.id;env.highlightRoom(hoverRoom);}
  refreshOverlay(false);
  if(drawing.target)status(`${drawing.fromId} → ${drawing.target.id} · 放開／點一下接通`,nodeMap.get(drawing.target.id).floor!==a.floor?'跨樓層：自動配置樓梯。':'同層：自動接上直角通路。');
 }
 function pointerMove(event){
  if(!enabled)return;
  if(gesture&&event.pointerId!==gesture.pointer)return;
  if(gesture&&Math.hypot(event.clientX-gesture.startX,event.clientY-gesture.startY)>4)gesture.moved=true;
  if(mode==='link'){updateLinkPreview(event);return;}
  if(placement){updatePlacement(event);return;}
  if(drawing){updateDraw(event);return;}
  if(!gesture)return;
  const g=gesture;
  if(g.kind==='stair-section'&&g.moved){const p=world(event,g.y);if(!p)return;working.route=translateFloorSection(g.before.route,g.sectionIndex,snap(p.x-g.start.x),snap(p.z-g.start.z));const first=working.route.stairSections[g.sectionIndex].points[0],old=g.before.route.stairSections[g.sectionIndex].points[0];for(const m of markers){if(m.kind==='stair-section')m.point=[g.center[0]+first.x-old.x,g.center[1],g.center[2]+first.z-old.z];else if(m.kind==='point'||m.kind==='midpoint')m.el.style.visibility='hidden';}refreshOverlay(false);}
  if(g.kind==='stair-body'&&g.moved){const p=world(event,g.y);if(!p)return;const moved=translateStairBody(g.body,snap(p.x-g.start.x),snap(p.z-g.start.z));working.route=moved.route;for(const m of markers){if(m.kind==='stair-body')m.point=moved.center;else if(m.kind==='point'||m.kind==='midpoint')m.el.style.visibility='hidden';}refreshOverlay(false);}
  if(g.kind==='move'&&g.moved){const p=world(event,g.y);if(!p)return;g.patch={x:clamp(snap(g.original.x+p.x-g.start.x),-100,100),z:clamp(snap(g.original.z+p.z-g.start.z),-100,100)};roomDelta={id:g.id,x:g.patch.x-g.original.x,z:g.patch.z-g.original.z};env.previewRoom(g.id,roomDelta);}
  if(g.kind==='resize'&&g.moved){const n=g.original,p=world(event,roomY(n));if(!p)return;const ax=n.x-g.sx*n.w/2,az=n.z-g.sz*n.d/2,w=clamp(snap((p.x-ax)*g.sx),3,60),d=clamp(snap((p.z-az)*g.sz),3,60);g.patch={x:clamp(ax+g.sx*w/2,-100,100),z:clamp(az+g.sz*d/2,-100,100),w,d};refreshOverlay(false);}
  if(g.kind==='point'&&g.moved){const p=world(event,g.y);if(!p)return;const point=controlPoints()[g.index];point.x=clamp(snap(g.original.x+p.x-g.start.x),-150,150);point.z=clamp(snap(g.original.z+p.z-g.start.z),-150,150);working.route.shape='manual';for(const m of markers)if(m.kind==='point'&&Number(m.index)===g.index)m.point=[point.x,g.y,point.z];refreshOverlay(false);}
  if(g.kind==='endpoint'&&g.moved){const n=roomAt(event),other=g.end==='from'?working.toId:working.fromId;g.valid=!!n&&n.id!==other;if(g.valid){const before=g.before,fromId=g.end==='from'?n.id:before.fromId,toId=g.end==='to'?n.id:before.toId,a=nodeMap.get(fromId),b=nodeMap.get(toId),from=g.end==='from'?portAt(n,event):before.route.from,to=g.end==='to'?portAt(n,event):before.route.to;
   const retained=before.route.stairSections?{route:reconcileFloorStairs(before.route,a,b,roomY(a),roomY(b),env.floorHeight)}:fromId===before.fromId&&toId===before.toId?bodyFor(before,routePath(before)):null;
   const route=retained?{...retained.route,from:clone(from),to:clone(to)}:createRoute(a,b,roomY(a),roomY(b),{mode:before.route.mode,shape:'straight',width:before.route.width,from,to});
   working={...clone(before),fromId,toId,route};refreshOverlay(false);}}
 }
 function release(event,cancelled=false){
  if(!gesture||event.pointerId!==gesture.pointer)return;
  const g=gesture;gesture=null;controls().enabled=true;if(host.hasPointerCapture(g.pointer))host.releasePointerCapture(g.pointer);
  event.preventDefault();event.stopImmediatePropagation();
  try{
   if(cancelled){if(g.before)working=g.before;if(g.kind==='draw')drawing=null;if(g.kind==='link')linkDraft=null;if(g.kind==='stair-place'){placement=null;host.dataset.mouseTool=mode;}}
   else if(g.kind==='link'){const target=g.moved?linkEndpointAt(event):g.started?null:g.endpoint;if(target)pickLinkEndpoint(target);}
   else if(g.kind==='stair-place'&&!g.moved&&placement?.route){working.route=clone(placement.route);placement=null;host.dataset.mouseTool=mode;saveWorking(sectionLabel(section())+' 樓梯已放置，上下平台已自動接通');instructions();}
   else if(g.kind==='move'&&g.moved){if(editor.updateRoom(g.id,g.patch))afterEdit(g.id+' 已移動');}
   else if(g.kind==='resize'&&g.moved){if(editor.updateRoom(g.id,g.patch))afterEdit(g.id+' 尺寸已調整');}
   else if(g.kind==='point'&&(g.moved||g.inserted)){saveWorking('通路轉角已調整');}
   else if(g.kind==='stair-body'&&g.moved){saveWorking('樓梯位置已更新，兩端仍連接原房間');}
   else if(g.kind==='stair-section'&&g.moved){saveWorking(sectionLabel(section())+' 梯段位置已保存');}
   else if(g.kind==='endpoint'){if(g.moved&&g.valid)saveWorking('路口已重新連接');else working=g.before;}
   else if(g.kind==='delete'&&g.id&&!g.moved){editor.removeEdge(g.id);selectedId=null;working=null;afterEdit('通路已拆除，可按 ↶ 復原');}
   else if(g.kind==='delete-platform'&&g.id&&!g.moved){editor.removePlatformLink(g.id);afterEdit('平台連接已拆除，可按 ↶ 復原');}
   else if(g.kind==='draw'&&drawing){
    updateDraw(event);
    if(!g.moved&&g.explicitTarget)drawing.target=g.explicitTarget;
    if(drawing.target)finishConnection(drawing.target);
    else if(g.moved||!roomAt(event)){const p=drawing.cursor;if(p)drawing.waypoints.push({x:p[0],z:p[2]});}
   }
  }catch(error){if(g.before)working=g.before;status('尚未完成',error.message);env.status(error.message,true);}
  if(g.id&&g.kind==='move')env.previewRoom(g.id,{x:0,z:0});roomDelta=null;hoverRoom=null;env.highlightRoom(null);refreshOverlay();sync();if(drawing||g.kind==='stair-place'||cancelled&&g.kind==='link')instructions();
 }
 function cancel(){
  if(gesture){const g=gesture;gesture=null;if(g.before)working=g.before;if(g.kind==='move')env.previewRoom(g.id,{x:0,z:0});if(host.hasPointerCapture(g.pointer))host.releasePointerCapture(g.pointer);}
  placement=null;linkDraft=null;host.dataset.mouseTool=mode;drawing=null;roomDelta=null;hoverRoom=null;controls().enabled=true;env.highlightRoom(null);refreshOverlay();sync();
 }
 function setTool(next){cancel();leaveMain();mode=next;host.dataset.mouseTool=next;selectedId=null;working=null;env.visibility();if(next==='draw'||next==='link')env.plan();controls().enableRotate=false;controls().mouseButtons.LEFT=THREE.MOUSE.PAN;sync();refreshOverlay();instructions();}
 function setEnabled(value){
  cancel();enabled=value;if(!value)leaveMain();host.classList.toggle('mouse-editing',value);controls().enableRotate=!value;controls().mouseButtons.LEFT=value?THREE.MOUSE.PAN:THREE.MOUSE.ROTATE;
  if(value){mode='select';env.plan();}sync();refreshOverlay();if(value)instructions();
 }
 function floorChanged(){if(mode==='link'){if(linkDraft)linkDraft.to=null;env.visibility();sync();refreshOverlay();env.fit();instructions();return;}if(placement)cancel();if(mainStair&&!drawing){selectMainStair(env.floor());return;}if(!drawing){const index=sectionAtFloor(env.floor());if(index>=0)sectionIndex=index;else{selectedId=null;working=null;}}env.visibility();sync();refreshOverlay();env.fit();instructions();}
 function changeFloor(delta){const n=nodeMap.get(env.selectedRoom()),all=env.floors(),index=all.indexOf(n.floor),next=all[index+delta];if(next==null)return;cancel();leaveMain();selectedId=null;working=null;editor.updateRoom(n.id,{floor:next});env.setFloor(next);env.selectRoom(n.id);afterEdit(n.id+' 已移到 '+floorLabel(next),true);sync();refreshOverlay();}
 function init(){
  for(const key of['select','draw','link','demolish'])if($('mouse-'+key))$('mouse-'+key).onclick=()=>setTool(key);
  $('mouse-undo').onclick=()=>{cancel();if(editor.undo())afterEdit('已復原');};$('mouse-redo').onclick=()=>{cancel();if(editor.redo())afterEdit('已重做');};
  $('mouse-floor').onchange=e=>{env.setFloor(Number(e.target.value));floorChanged();};
  for(const [id,direction] of[['mouse-floor-prev',-1],['mouse-floor-next',1]])$(id).onclick=()=>{const fs=activeFloors(),next=fs[fs.indexOf(env.floor())+direction];if(next!=null){env.setFloor(next);floorChanged();}};
  $('mouse-floor-down').onclick=()=>changeFloor(-1);$('mouse-floor-up').onclick=()=>changeFloor(1);
  $('mouse-split-stairs').onclick=splitStairs;
  $('mouse-place-stair').onclick=()=>{if(placement){cancel();instructions();}else beginPlacement();};
  $('mouse-rotate-stair').onclick=rotatePlacement;
  $('mouse-stair-fine-tune').addEventListener('toggle',()=>{if($('mouse-stair-fine-tune').open)cancel();refreshOverlay();instructions();});
  if($('mouse-main-stair-picker'))$('mouse-main-stair-picker').onchange=event=>{const chosen=mainStages.find(s=>mainStageKey(s)===event.target.value);if(chosen)selectMainStair(chosen.fromFloor,chosen.edgeId);};
  $('mouse-section-picker').onchange=e=>chooseSection(Number(e.target.value));
  $('mouse-section-prev').onclick=()=>chooseSection(sectionIndex-1);$('mouse-section-next').onclick=()=>chooseSection(sectionIndex+1);
  for(const shape of['straight','l','u'])$('mouse-section-'+shape).onclick=()=>{if(!section())return;cancel();try{working.route=setFloorSectionShape(working.route,sectionIndex,shape);saveWorking(sectionLabel(section())+' 梯段形狀已保存');refreshOverlay();env.fit();instructions();}catch(error){env.status(error.message,true);}};
  for(const shape of['straight','l','u'])$('mouse-shape-'+shape).onclick=()=>{if(!working)return;const a=nodeMap.get(working.fromId),b=nodeMap.get(working.toId);working.route=createRoute(a,b,roomY(a),roomY(b),{...working.route,shape});saveWorking('已套用 '+(shape==='u'?'U 形':shape==='l'?'L 形':'直連')+'通路');instructions();};
  $('mouse-delete-selected').onclick=()=>{if(!selectedId||mainStair)return;cancel();editor.removeEdge(selectedId);selectedId=null;working=null;afterEdit('通路已拆除，可按 ↶ 復原');instructions();};
  host.addEventListener('pointerdown',pointerDown,true);host.addEventListener('pointermove',pointerMove,true);host.addEventListener('pointerup',e=>release(e),true);host.addEventListener('pointercancel',e=>release(e,true),true);
  window.addEventListener('keydown',event=>{if(!enabled||document.querySelector('dialog[open]'))return;if(event.key==='Escape'&&(placement||linkDraft)){event.preventDefault();cancel();instructions();return;}if(/INPUT|TEXTAREA/.test(event.target.tagName))return;if(placement&&event.key.toLowerCase()==='r'&&!event.ctrlKey&&!event.metaKey){event.preventDefault();rotatePlacement();return;}if(event.target.tagName==='SELECT')return;if(event.key==='Escape'){cancel();instructions();}else if(event.key==='Delete'&&selectedId){$('mouse-delete-selected').click();}else if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='z'){event.preventDefault();$(event.shiftKey?'mouse-redo':'mouse-undo').click();}});
  sync();
 }
 function render(){if(!enabled)return;const rect=host.getBoundingClientRect();for(const m of markers){const p=new THREE.Vector3(...m.point).project(camera());m.el.hidden=Math.abs(p.x)>1.03||Math.abs(p.y)>1.03||p.z<-1||p.z>1;m.el.style.left=(p.x*.5+.5)*rect.width+'px';m.el.style.top=(-p.y*.5+.5)*rect.height+'px';} }
 return {init,refresh,render,setEnabled,setTool,selectRoad,selectMainStair,isMainEdge,selectRoom,floorChanged,cancel,pickEndpoint:pickLinkEndpoint,get tool(){return mode;},get mainStair(){return mainStair;},get mainStages(){return mainStages;},get enabled(){return enabled;},get selectedEdge(){return working;},get selectedSection(){return section();},get sectionPoints(){return sectionPoints();},get drawing(){return drawing;},get linkDraft(){return linkDraft;},get roomDelta(){return roomDelta;}};
}
