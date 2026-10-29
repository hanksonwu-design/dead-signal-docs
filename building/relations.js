// 3D view of the collection master table: evidence, reasoning boards and their causal links.
// Data comes from ../collection-relations.json (tools/build-collection-relations.mjs).
import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {CSS2DRenderer,CSS2DObject} from 'three/addons/renderers/CSS2DRenderer.js';

const $=id=>document.getElementById(id);
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const tableHref=anchor=>'../#'+new URLSearchParams({doc:'10_製作規格/10-12_製作規格_收集物與筆記本總表.md',heading:anchor});
// The graph lives inside 場景與流程 (index.html#panel=relations); opened directly it forwards there.
const PARAMS=new URLSearchParams(location.search),EMBED=PARAMS.get('embed')==='1';
const SYSTEMS_VIEW=PARAMS.get('mode')==='systems';
// The lane view spreads acts further apart so four columns do not read as one flat band.
const GAP=SYSTEMS_VIEW?13:8,HUB_RADIUS=20,EVIDENCE_RADIUS=29,RESULT_RADIUS=12,CHAIN_RADIUS=40,ACT_RING=46;
const SOLID=new Set(['slot','reuse','result','opens']);
const SUPPORT_KINDS=new Set(['support','pair']);
const DECOY_COLOR=new THREE.Color(0xd9774f),PAYOFF_COLOR=new THREE.Color(0xe2c77d);
// Decoys and look-back comparisons are not causes: they light up only one step from the selection.
const ONE_STEP=new Set(['decoy','payoff']);
const CHAIN_KINDS=new Set(['chain','later','compare','prereq','alternative']);
const CHAIN_COLORS=[0xc2a58c,0xa9bb8d,0xa3a9cc,0x9aa3a5];
// The four-system view follows the 探索與調查 pages: 定點場景 → 筆記本與訊號 → 調查板 → 動線與鑰匙.
const MODE=SYSTEMS_VIEW?'systems':'groups';
const LANES=[['room',-42,'定點場景與三圖層'],['notebook',-14,'筆記本與訊號系統'],['board',14,'調查板與推理系統'],['key',42,'動線與訊號鑰匙']];
const LANE_X=Object.fromEntries(LANES.map(([lane,x])=>[lane,x]));
const SYSTEM_STYLE={
  found:{color:0x6f8ea0},'found-freeze':{color:0xe2c77d,label:'凝固'},'signal-found':{color:0x8ccab1},
  'signal-use':{color:0x8ccab1,label:'用於',solid:true},produces:{color:0xe2c77d,solid:true},unlocks:{color:0x9fd3a4,label:'開通',solid:true,thick:true},
};
const FOUND_KINDS=new Set(['found','found-freeze']);

let data,nodes=new Map(),edges=[],selected='',allLinks=[];
let renderer,labelRenderer,camera,controls,scene;
const pickables=[];

const colorFor=(group,index)=>group.kind==='chain'
  ?new THREE.Color(CHAIN_COLORS[index%CHAIN_COLORS.length])
  :new THREE.Color().setHSL(((group.order-1)*0.067+0.47)%1,0.42,0.62);
const actName=act=>data.acts[act]?.name??'';
const partName=part=>data.parts.find(p=>p.part===part)?.name??'';
const groupOf=id=>data.groups.find(g=>g.id===id);
const groupTitle=g=>g.kind==='board'?`${g.order}｜${g.title}（${g.room}）`:g.title;

function layoutSystems(){
  const boards=data.groups.filter(g=>g.kind==='board');
  data.groups.forEach((g,i)=>g.color=colorFor(g,i-boards.length));
  // Height follows each room's place in the play order inside its act, so one moment reads across all four lanes.
  const roomY=new Map();
  for(const act of data.acts){
    const inAct=data.rooms.filter(r=>r.act===act.act);
    inAct.forEach((r,i)=>roomY.set(r.room,act.act*GAP+(i/Math.max(inAct.length,1))*GAP*.85));
  }
  const spread=(k,n,step)=>(k-(n-1)/2)*step;
  data.rooms.forEach((r,k)=>nodes.set(r.id,{type:'room',item:r,position:new THREE.Vector3(LANE_X.room,roomY.get(r.room),k%2?2.5:-2.5),color:new THREE.Color(0x6f8ea0)}));
  const byRoom=new Map();
  for(const e of data.evidence){if(!byRoom.has(e.room)) byRoom.set(e.room,[]);byRoom.get(e.room).push(e);}
  for(const [room,items] of byRoom) items.forEach((e,k)=>nodes.set(e.id,{type:'evidence',item:e,
    position:new THREE.Vector3(LANE_X.notebook,roomY.get(room)+(k%2)*.5,spread(k,items.length,2.4)),color:groupOf(e.group).color}));
  data.signals.forEach((s,k)=>{
    const first=data.systemLinks.find(l=>l.to===s.id&&l.kind==='signal-found').from.slice(5);
    nodes.set(s.id,{type:'signal',item:s,position:new THREE.Vector3(LANE_X.notebook+4,roomY.get(first)+.3,-11-(k%3)*2.2),color:new THREE.Color(0x8ccab1)});
  });
  boards.forEach((g,k)=>nodes.set(g.id,{type:'group',item:g,position:new THREE.Vector3(LANE_X.board,roomY.get(g.room)+.6,((k%3)-1)*3.5),color:g.color}));
  data.keys.forEach((key,k)=>{
    const sources=data.systemLinks.filter(l=>l.to===key.id&&l.kind==='produces').map(l=>nodes.get(l.from)?.position.y).filter(y=>y!==undefined);
    const y=(sources.length?Math.max(...sources):key.act*GAP)+.6;
    nodes.set(key.id,{type:'key',item:key,position:new THREE.Vector3(LANE_X.key,y,((k%3)-1)*3.5),color:new THREE.Color(0xe2c77d)});
  });
}

function layout(){
  if(MODE==='systems') return layoutSystems();
  const boards=data.groups.filter(g=>g.kind==='board'),chains=data.groups.filter(g=>g.kind==='chain');
  const angle={};
  boards.forEach((g,i)=>angle[g.id]=THREE.MathUtils.degToRad(i*300/(boards.length-1)));
  chains.forEach((g,i)=>angle[g.id]=THREE.MathUtils.degToRad(312+i*15));
  const at=(radius,theta,y)=>new THREE.Vector3(radius*Math.cos(theta),y,radius*Math.sin(theta));
  data.groups.forEach((g,i)=>{
    g.color=colorFor(g,i-boards.length);
    if(g.kind==='board') nodes.set(g.id,{type:'group',item:g,position:at(HUB_RADIUS,angle[g.id],g.act*GAP),color:g.color});
  });
  for(const g of data.groups){
    const members=data.evidence.filter(e=>e.group===g.id);
    const results=members.filter(e=>e.code==='成果'),sources=members.filter(e=>e.code!=='成果');
    sources.forEach((e,k)=>{
      const theta=angle[g.id]+(k-(sources.length-1)/2)*(g.kind==='chain'?0.05:0.075);
      const radius=g.kind==='chain'?CHAIN_RADIUS+(k%2)*2.5:EVIDENCE_RADIUS+(k%2)*3;
      nodes.set(e.id,{type:'evidence',item:e,position:at(radius,theta,e.act*GAP),color:g.color});
    });
    results.forEach((e,k)=>nodes.set(e.id,{type:'evidence',item:e,position:at(RESULT_RADIUS,angle[g.id]+(k-(results.length-1)/2)*0.16,e.act*GAP+1.2),color:g.color}));
  }
}

function addLabel(object,text,className,offsetY){
  const div=document.createElement('div');
  div.className=className;div.textContent=text;
  const label=new CSS2DObject(div);
  label.position.set(0,offsetY,0);
  object.add(label);
  return label;
}

function buildScene(){
  scene=new THREE.Scene();
  scene.background=new THREE.Color(0x101619);
  scene.add(new THREE.AmbientLight(0xffffff,1.6));
  const sun=new THREE.DirectionalLight(0xffffff,1.6);sun.position.set(30,80,40);scene.add(sun);
  if(MODE==='systems') addLaneGuides();else addCylinderGuides();
  addNodesAndEdges();
}

const lineMaterial=(color,opacity)=>new THREE.LineBasicMaterial({color,transparent:true,opacity});
const segment=(a,b,material)=>new THREE.Line(new THREE.BufferGeometry().setFromPoints([a,b]),material);

function addLaneGuides(){
  const top=data.acts.length*GAP,left=-56,right=56;
  const acts=new THREE.Group();acts.name='acts';
  data.acts.forEach(a=>{
    acts.add(segment(new THREE.Vector3(left,a.act*GAP,0),new THREE.Vector3(right,a.act*GAP,0),lineMaterial(0x2f3d40,.75)));
    const anchor=new THREE.Object3D();anchor.position.set(left-4,a.act*GAP+GAP/2,0);
    addLabel(anchor,a.name,'act-label',0);acts.add(anchor);
  });
  for(const [,x,name] of LANES){
    acts.add(segment(new THREE.Vector3(x,0,0),new THREE.Vector3(x,top,0),lineMaterial(0x3a4a4d,.5)));
    const anchor=new THREE.Object3D();anchor.position.set(x,top+2.5,0);
    addLabel(anchor,name,'lane-name',0);acts.add(anchor);
  }
  scene.add(acts);
  const boundary=new THREE.Group();boundary.name='parts';
  const [upper,lower]=data.parts,splitY=(Math.max(...upper.acts)+.5)*GAP;
  const plane=new THREE.Mesh(new THREE.PlaneGeometry(right-left+8,34),new THREE.MeshBasicMaterial({color:0x8ccab1,transparent:true,opacity:.06,side:THREE.DoubleSide,depthWrite:false}));
  plane.rotation.x=-Math.PI/2;plane.position.y=splitY;boundary.add(plane);
  boundary.add(segment(new THREE.Vector3(left-4,splitY,0),new THREE.Vector3(right+4,splitY,0),lineMaterial(0x8ccab1,.6)));
  const span=part=>`${part.name}（${actName(part.acts[0])}～${actName(part.acts.at(-1))}）`;
  for(const [text,dy] of [[`↑ ${span(lower)}`,1.8],[`↓ ${span(upper)}`,-1.8]]){
    const anchor=new THREE.Object3D();anchor.position.set(right+6,splitY+dy,0);
    addLabel(anchor,text,'part-name',0);boundary.add(anchor);
  }
  scene.add(boundary);
}

function addCylinderGuides(){
  const acts=new THREE.Group();acts.name='acts';
  data.acts.forEach(a=>{
    const ring=new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(Array.from({length:96},(_,i)=>{
      const t=i/96*Math.PI*2;return new THREE.Vector3(ACT_RING*Math.cos(t),a.act*GAP,ACT_RING*Math.sin(t));
    })),new THREE.LineBasicMaterial({color:0x2f3d40,transparent:true,opacity:.75}));
    acts.add(ring);
    const anchor=new THREE.Object3D();anchor.position.set(ACT_RING*Math.cos(-1.9),a.act*GAP,ACT_RING*Math.sin(-1.9));
    addLabel(anchor,a.name,'act-label',0);acts.add(anchor);
  });
  scene.add(acts);

  // The two parts ship separately; draw the split between the last 上部 act and the first 下部 act.
  const boundary=new THREE.Group();boundary.name='parts';
  const [upper,lower]=data.parts,splitY=(Math.max(...upper.acts)+.5)*GAP,splitRadius=ACT_RING+3;
  const disk=new THREE.Mesh(new THREE.CircleGeometry(splitRadius,96),new THREE.MeshBasicMaterial({color:0x8ccab1,transparent:true,opacity:.06,side:THREE.DoubleSide,depthWrite:false}));
  disk.rotation.x=-Math.PI/2;disk.position.y=splitY;boundary.add(disk);
  boundary.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(Array.from({length:96},(_,i)=>{
    const t=i/96*Math.PI*2;return new THREE.Vector3(splitRadius*Math.cos(t),splitY,splitRadius*Math.sin(t));
  })),new THREE.LineBasicMaterial({color:0x8ccab1,transparent:true,opacity:.6})));
  const span=part=>`${part.name}（${actName(part.acts[0])}～${actName(part.acts.at(-1))}）`;
  for(const [text,dy] of [[`↑ ${span(lower)}`,1.8],[`↓ ${span(upper)}`,-1.8]]){
    const anchor=new THREE.Object3D();anchor.position.set(splitRadius*Math.cos(1.25),splitY+dy,splitRadius*Math.sin(1.25));
    addLabel(anchor,text,'part-name',0);boundary.add(anchor);
  }
  scene.add(boundary);
}

const NODE_SIZE={group:1.7,room:1.4,key:1.1,signal:.9,evidence:.8};
function addNodesAndEdges(){
  for(const [id,node] of nodes){
    let mesh;
    const material=color=>new THREE.MeshLambertMaterial({color,transparent:true});
    if(node.type==='group'){
      mesh=new THREE.Mesh(new THREE.OctahedronGeometry(1.5),material(node.color));
      node.label=addLabel(mesh,'','node-label hub',2.6);
    }else if(node.type==='room'){
      mesh=new THREE.Mesh(new THREE.BoxGeometry(2.4,.9,2.4),material(node.color));
      node.label=addLabel(mesh,node.item.room,'node-label room',1.3);
    }else if(node.type==='key'){
      mesh=new THREE.Mesh(new THREE.CylinderGeometry(1,1,.4,24),material(node.color));
      mesh.rotation.x=Math.PI/2;
      node.label=addLabel(mesh,node.item.code||node.item.label,'node-label key',1.6);
    }else if(node.type==='signal'){
      mesh=new THREE.Mesh(new THREE.TetrahedronGeometry(.85),material(node.item.required?node.color:node.color.clone().multiplyScalar(.7)));
      node.label=addLabel(mesh,node.item.index,'node-label evidence-id',1.2);
    }else{
      const required=node.item.required;
      mesh=new THREE.Mesh(new THREE.SphereGeometry(required?0.62:0.46,20,14),new THREE.MeshLambertMaterial({color:required?node.color:node.color.clone().multiplyScalar(.7),transparent:true,opacity:required?1:.8}));
      if(node.item.witnessed){
        const ring=new THREE.Mesh(new THREE.TorusGeometry(1.0,0.08,8,40),new THREE.MeshBasicMaterial({color:0xe2c77d,transparent:true}));
        ring.rotation.x=Math.PI/2;mesh.add(ring);node.ring=ring;
      }
      node.label=addLabel(mesh,id,'node-label evidence-id',1.25);
    }
    mesh.position.copy(node.position);
    mesh.userData.id=id;
    node.mesh=mesh;
    scene.add(mesh);pickables.push(mesh);
  }

  for(const link of allLinks){
    const from=nodes.get(link.from),to=nodes.get(link.to);
    if(!from||!to) continue;
    const owner=to.type==='group'?to:from,style=SYSTEM_STYLE[link.kind];
    const color=style?new THREE.Color(style.color):link.kind==='result'?new THREE.Color(0xe8eeec):link.kind==='decoy'?DECOY_COLOR:link.kind==='payoff'?PAYOFF_COLOR:owner.color;
    const start=from.position,end=to.position;
    const mid=start.clone().lerp(end,.5);mid.y+=Math.max(1.5,start.distanceTo(end)*.12);
    const curve=new THREE.QuadraticBezierCurve3(start.clone(),mid,end.clone());
    const group=new THREE.Group();
    let line;
    if(SOLID.has(link.kind)||style?.solid){
      line=new THREE.Mesh(new THREE.TubeGeometry(curve,28,link.kind==='opens'||style?.thick?0.12:0.07,6,false),new THREE.MeshBasicMaterial({color,transparent:true,opacity:.85}));
    }else{
      line=new THREE.Line(new THREE.BufferGeometry().setFromPoints(curve.getPoints(40)),new THREE.LineDashedMaterial({color,dashSize:.7,gapSize:.45,transparent:true,opacity:.75}));
      line.computeLineDistances();
    }
    group.add(line);
    const tangent=curve.getTangentAt(1).normalize();
    const targetSize=NODE_SIZE[to.type]??.8;
    const cone=new THREE.Mesh(new THREE.ConeGeometry(.32,1,10),new THREE.MeshBasicMaterial({color,transparent:true}));
    cone.position.copy(end).addScaledVector(tangent,-(targetSize+.5));
    cone.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),tangent);
    group.add(cone);
    let codeLabel=null;
    const codeText=style?.label??(link.kind==='decoy'?`誘答 ${link.code}`:link.code);
    if(codeText){
      const holder=new THREE.Object3D();holder.position.copy(curve.getPointAt(.62));group.add(holder);
      codeLabel=addLabel(holder,codeText,'edge-label',0);
      codeLabel.element.style.background=`#${color.getHexString()}`;
    }
    let partLabel=null;
    if(link.crossPart){
      const holder=new THREE.Object3D();holder.position.copy(curve.getPointAt(.38));group.add(holder);
      partLabel=addLabel(holder,link.crossPart==='carried'?'前情帶入':'跨部伏筆',`part-label ${link.crossPart}`,0);
    }
    scene.add(group);
    edges.push({link,group,codeLabel,partLabel,materials:[line.material,cone.material]});
  }
}

function neighbours(start,direction){
  const seen=new Set([start]),queue=[start];
  while(queue.length){
    const id=queue.shift();
    for(const {link} of edges){
      if(ONE_STEP.has(link.kind)) continue;
      const [a,b]=direction==='down'?[link.from,link.to]:[link.to,link.from];
      if(a===id&&!seen.has(b)&&visibleNode(b)){seen.add(b);queue.push(b);}
    }
  }
  return seen;
}

const isChainNode=id=>{const n=nodes.get(id);return n?.type==='evidence'&&groupOf(n.item.group)?.kind==='chain';};
const visibleNode=id=>{
  if(nodes.get(id)?.type==='signal'&&!$('show-signals').checked) return false;
  return $('show-chains').checked||!isChainNode(id);
};
function visibleEdge({link}){
  if(FOUND_KINDS.has(link.kind)&&!$('show-found').checked) return false;
  if(link.kind==='decoy'&&!$('show-decoys').checked) return false;
  if(SUPPORT_KINDS.has(link.kind)&&!$('show-support').checked) return false;
  if(CHAIN_KINDS.has(link.kind)&&!$('show-chains').checked) return false;
  return visibleNode(link.from)&&visibleNode(link.to);
}

function refresh(){
  const lit=selected?new Set([...neighbours(selected,'up'),...neighbours(selected,'down')]):null;
  if(lit) for(const edge of edges){
    const {link}=edge;
    if(ONE_STEP.has(link.kind)&&visibleEdge(edge)&&(link.from===selected||link.to===selected)){lit.add(link.from);lit.add(link.to);}
  }
  for(const [id,node] of nodes){
    const shown=visibleNode(id),on=!lit||lit.has(id);
    node.mesh.visible=shown;
    node.mesh.material.opacity=on?(node.type==='evidence'&&!node.item.required?.8:1):.1;
    if(node.ring) node.ring.material.opacity=on?1:.1;
    // CSS2DRenderer hides only on a strict false, so keep these flags boolean.
    node.label.visible=shown&&(['group','room','key','signal'].includes(node.type)||$('show-ids').checked||Boolean(lit?.has(id)));
    node.label.element.classList.toggle('dim',!on);
    // Board labels stay short until they are part of the traced chain.
    if(node.type==='group') node.label.element.textContent=lit&&lit.has(id)?`${node.item.room}｜${node.item.title}`:`${node.item.order}｜${node.item.room}`;
  }
  for(const edge of edges){
    const touches=edge.link.from===selected||edge.link.to===selected;
    const shown=visibleEdge(edge),on=!lit||(lit.has(edge.link.from)&&lit.has(edge.link.to)&&(!ONE_STEP.has(edge.link.kind)||touches));
    edge.group.visible=shown;
    edge.materials.forEach(m=>m.opacity=on?.85:.06);
    // With four lanes the edge tags would cover each other, so that view shows them only along a traced chain.
    const tagged=shown&&(MODE!=='systems'||Boolean(lit&&on));
    if(edge.codeLabel){edge.codeLabel.visible=tagged&&$('show-codes').checked;edge.codeLabel.element.classList.toggle('dim',!on);}
    if(edge.partLabel){edge.partLabel.visible=tagged&&$('show-parts').checked;edge.partLabel.element.classList.toggle('dim',!on);}
  }
  scene.getObjectByName('acts').visible=$('show-acts').checked;
  scene.getObjectByName('parts').visible=$('show-parts').checked;
  document.querySelectorAll('#groups button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.id===selected)));
}

function linkList(title,list){
  if(!list.length) return '';
  return `<dt>${title}</dt><dd><ul class="links">${list.map(({id,text})=>`<li><button data-select="${esc(id)}">${esc(text)}</button></li>`).join('')}</ul></dd>`;
}
const nameOf=id=>{
  const n=nodes.get(id);if(!n) return id;
  if(n.type==='group') return groupTitle(n.item);
  if(n.type==='room') return `${n.item.room} ${n.item.name}`;
  if(n.type==='key') return n.item.label;
  if(n.type==='signal') return `${n.item.index} ${n.item.label}`;
  return `${id} ${n.item.label}`;
};
const KIND_TEXT={found:'在此取得','found-freeze':'在此凝固中取得','signal-found':'在此記錄訊號','signal-use':'用於',produces:'產生',unlocks:'開通',
  slot:'放入格位',support:'前置／旁證',reuse:'跨組沿用',result:'成立後取得',opens:'開通',chain:'延伸線',later:'之後歸屬',compare:'對照',prereq:'須先讀',alternative:'擇一觸發',pair:'前片配對',confirms:'補證',decoy:'誘答，原文不支持此格',payoff:'選填回頭比對'};
const choiceList=c=>c?`<dt>結論選擇</dt><dd><ul class="links"><li>✓ ${esc(c.answer)}</li>${c.decoys.map(d=>`<li>✗ ${esc(d)}</li>`).join('')}</ul></dd>`:'';

const roomOf=id=>{
  const n=nodes.get(id);if(!n) return '';
  if(n.item.room) return n.item.room;
  const l=(data.systemLinks||[]).find(l=>(l.to===id&&l.from.startsWith('room:'))||(l.from===id&&l.to.startsWith('room:')));
  return l?(l.from.startsWith('room:')?l.from:l.to).slice(5):'';
};
// Every scene room touched by the traced chain, for outlining in the scene model.
function chainRoomList(){
  const lit=new Set([...neighbours(selected,'up'),...neighbours(selected,'down')]),rooms=new Set();
  // Only rooms the trace actually reached: in the lane view rooms are nodes themselves.
  for(const id of lit){const n=nodes.get(id);if(n?.item.room) rooms.add(n.item.room);}
  return [...rooms];
}

function showDetail(id){
  renderDetail(id);
  if(id&&EMBED) $('detail').insertAdjacentHTML('beforeend','<p><button id="show-in-model" type="button">在大樓上查看這條鏈</button></p>');
}

function renderDetail(id){
  const box=$('detail');
  if(!id){box.innerHTML='<p class="hint">在圖上或左側清單選一個推理組或證據，這裡會列出它的格位、循環路徑與因果連線。拖曳旋轉、右鍵平移、滾輪縮放。</p>';return;}
  const node=nodes.get(id);
  const incoming=allLinks.filter(l=>l.to===id&&nodes.has(l.from)).map(l=>({id:l.from,text:`${l.code?l.code+'｜':''}${nameOf(l.from)}（${KIND_TEXT[l.kind]}）`}));
  const outgoing=allLinks.filter(l=>l.from===id&&nodes.has(l.to)).map(l=>({id:l.to,text:`${l.code?l.code+'｜':''}${nameOf(l.to)}（${KIND_TEXT[l.kind]}）`}));
  const lanes=`${linkList('來自',incoming)}${linkList('通往',outgoing)}`;
  if(node.type==='room'){
    const r=node.item;
    box.innerHTML=`<div class="eyebrow">${esc(actName(r.act))} · 定點場景</div><h3>${esc(r.room)} ${esc(r.name)}</h3><dl><dt>部別</dt><dd>${esc(partName(r.part))}</dd>${lanes}</dl>`;
    return;
  }
  if(node.type==='key'){
    const k=node.item;
    box.innerHTML=`<div class="eyebrow">${esc(actName(k.act))} · 動線與鑰匙</div><h3>${esc(k.label)}</h3><dl><dt>部別</dt><dd>${esc(partName(k.part))}</dd>
<dt>取得</dt><dd>${esc(k.where)}</dd><dt>用途</dt><dd>${esc(k.use)}</dd>${lanes}</dl>
<p><a href="${esc(tableHref('collection-lower-interactions'))}" target="_blank" rel="noopener noreferrer">在收集物總表查看 ↗</a></p>`;
    return;
  }
  if(node.type==='signal'){
    const s=node.item;
    box.innerHTML=`<div class="eyebrow">${esc(actName(s.act))} · 訊號索引</div><h3>${esc(s.index)} ${esc(s.label)}<span class="badge${s.required?' required':''}">${s.required?'必要':'選填或功能'}</span></h3><dl>
<dt>來源</dt><dd>${esc(s.source)}</dd><dt>功能</dt><dd>${esc(s.use)}</dd>${lanes}</dl>`;
    return;
  }
  if(node.type==='group'){
    const g=node.item;
    box.innerHTML=`<div class="eyebrow">${esc(actName(g.act))} · ${esc(g.room)}</div><h3>${esc(groupTitle(g))}</h3><dl>
<dt>部別</dt><dd>${esc(g.release)}</dd><dt>板面</dt><dd>${esc(g.board)}</dd><dt>放入來源</dt><dd>${esc(g.sources)}</dd><dt>成立後</dt><dd>${esc(g.outcome)}</dd>${choiceList(g.conclusion)}
${linkList('來自',incoming)}${linkList('通往',outgoing)}</dl>
<p>${esc(g.note.replace(/\[([^\]]+)\]\([^)]+\)/g,'$1'))}</p><p><a href="${esc(tableHref(g.anchor))}" target="_blank" rel="noopener noreferrer">在收集物總表查看 ↗</a></p>`;
  }else{
    const e=node.item,g=groupOf(e.group);
    box.innerHTML=`<div class="eyebrow">${esc(actName(e.act))} · ${esc(e.room)}</div><h3>${esc(e.id)} ${esc(e.label)}<span class="badge${e.required?' required':''}">${e.required?'必要':'選填'}</span></h3><dl>
<dt>部別</dt><dd>${esc(partName(e.part))}${e.carried?'；下部由有效前情帶入':''}${e.teaser?'；跨部伏筆（選填）':''}</dd>
<dt>所屬</dt><dd>${esc(groupTitle(g))}</dd><dt>代號</dt><dd>${esc(e.code)}</dd><dt>格位／關聯</dt><dd>${esc(e.slot)}</dd>
<dt>循環路徑</dt><dd class="${e.witnessed?'witness':''}">${esc(e.loop)}</dd><dt>來源</dt><dd>${esc(e.source)}</dd>
<dt>用途</dt><dd>${esc(e.use)}</dd><dt>性質</dt><dd>${esc(e.nature)}</dd>${linkList('來自',incoming)}${linkList('通往',outgoing)}</dl>
<p><a href="${esc(tableHref(g.anchor))}" target="_blank" rel="noopener noreferrer">在收集物總表查看 ↗</a></p>`;
  }
}

function select(id){
  selected=id&&nodes.has(id)?id:'';
  showDetail(selected);
  if(!scene) return;
  refresh();
  if(selected) controls.target.lerp(nodes.get(selected).position,.5);
}

function setView(kind){
  // Fit the whole cylinder of acts into the current viewport, whatever its aspect ratio.
  const centre=new THREE.Vector3(MODE==='systems'?2:0,4.5*GAP+(MODE==='systems'?2:0),0);
  const radius=Math.hypot(MODE==='systems'?62:ACT_RING,4.5*GAP+(MODE==='systems'?6:3));
  const vertical=THREE.MathUtils.degToRad(camera.fov);
  const horizontal=2*Math.atan(Math.tan(vertical/2)*camera.aspect);
  const distance=radius/Math.sin(Math.min(vertical,horizontal)/2);
  const directions={iso:MODE==='systems'?new THREE.Vector3(.4,.28,1):new THREE.Vector3(.62,.42,.66),front:new THREE.Vector3(0,0,1),top:new THREE.Vector3(0,1,.001)};
  camera.position.copy(centre).addScaledVector(directions[kind].normalize(),distance);
  controls.target.copy(centre);controls.update();
}

function buildGroupList(){
  $('groups').innerHTML=data.groups.map(g=>`<li><button data-id="${esc(g.id)}" aria-pressed="false"${g.kind==='chain'?` data-chain="true"`:''}><i class="swatch${g.kind==='board'?' hub':''}" style="background:#${g.color.getHexString()}"></i>${esc(groupTitle(g))}</button></li>`).join('');
  $('groups').addEventListener('click',event=>{
    const button=event.target.closest('button');if(!button) return;
    const g=groupOf(button.dataset.id);
    if(g.kind==='board') select(g.id);
    else{const first=data.evidence.find(e=>e.group===g.id);select(first?.id);}
  });
}

function start(){
  const host=$('canvas-host');
  renderer=new THREE.WebGLRenderer({antialias:true});
  renderer.setPixelRatio(Math.min(devicePixelRatio,2));
  host.appendChild(renderer.domElement);
  labelRenderer=new CSS2DRenderer();
  Object.assign(labelRenderer.domElement.style,{position:'absolute',inset:'0',pointerEvents:'none'});
  host.appendChild(labelRenderer.domElement);
  camera=new THREE.PerspectiveCamera(45,1,0.1,1000);
  controls=new OrbitControls(camera,renderer.domElement);
  controls.enableDamping=!matchMedia('(prefers-reduced-motion: reduce)').matches;
  buildScene();
  const resize=()=>{const {clientWidth:w,clientHeight:h}=host;renderer.setSize(w,h);labelRenderer.setSize(w,h);camera.aspect=w/Math.max(h,1);camera.updateProjectionMatrix();};
  resize();setView('iso');
  new ResizeObserver(resize).observe(host);

  const raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2(),tip=$('tooltip');
  const pick=event=>{
    const rect=renderer.domElement.getBoundingClientRect();
    pointer.set((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1);
    raycaster.setFromCamera(pointer,camera);
    return raycaster.intersectObjects(pickables.filter(m=>m.visible),false)[0]?.object.userData.id;
  };
  renderer.domElement.addEventListener('pointermove',event=>{
    const id=pick(event);
    if(!id){tip.hidden=true;renderer.domElement.style.cursor='';return;}
    const node=nodes.get(id),rect=host.getBoundingClientRect();
    tip.innerHTML=node.type==='evidence'?`${esc(id)} ${esc(node.item.label)}<br>${esc(actName(node.item.act))} · ${esc(node.item.code)}`:`${esc(nameOf(id))}<br>${esc(actName(node.item.act))}`;
    tip.style.left=`${event.clientX-rect.left+14}px`;tip.style.top=`${event.clientY-rect.top+14}px`;tip.hidden=false;
    renderer.domElement.style.cursor='pointer';
  });
  let down=null;
  renderer.domElement.addEventListener('pointerdown',event=>{down=[event.clientX,event.clientY];});
  renderer.domElement.addEventListener('pointerup',event=>{
    if(!down||Math.hypot(event.clientX-down[0],event.clientY-down[1])>5) return;
    select(pick(event)||'');
  });
  const loop=()=>{controls.update();renderer.render(scene,camera);labelRenderer.render(scene,camera);requestAnimationFrame(loop);};
  loop();
}

async function main(){
  if(!EMBED){
    location.replace(`./#${new URLSearchParams({panel:'relations',...(SYSTEMS_VIEW?{mode:'systems'}:{})})}`);
    return;
  }
  document.querySelector('body>header').hidden=true;
  for(const link of document.querySelectorAll('[data-mode]')) link.href=`relations.html?embed=1${link.dataset.mode==='systems'?'&mode=systems':''}`;
  parent.postMessage({type:'relations:mode',mode:MODE},location.origin);
  try{
    const response=await fetch('../collection-relations.json',{cache:'no-cache'});
    if(!response.ok) throw new Error(`讀取關聯資料失敗（${response.status}）`);
    data=await response.json();
  }catch(error){$('loading').hidden=true;Object.assign($('error'),{hidden:false,textContent:error.message});return;}
  $('table-link').href=tableHref('collection-board-groups');
  allLinks=MODE==='systems'?[...data.links,...data.systemLinks]:data.links;
  const boards=data.groups.filter(g=>g.kind==='board').length;
  $('counts').textContent=MODE==='systems'
    ?`四系統分道 · ${data.rooms.length} 個場景 · ${data.evidence.length} 項證據 · ${data.signals.length} 個訊號 · ${boards} 組推理 · ${data.keys.length} 項鑰匙與路線`
    :`${boards} 組調查板推理 · ${data.groups.length-boards} 條延伸線 · ${data.evidence.length} 項證據 · ${data.links.length} 條關聯`;
  document.querySelectorAll(`[data-mode]`).forEach(el=>el.setAttribute('aria-current',String(el.dataset.mode===MODE)));
  document.querySelectorAll('[data-only]').forEach(el=>{el.hidden=el.dataset.only!==MODE;});
  layout();buildGroupList();
  try{start();}catch(error){
    Object.assign($('error'),{hidden:false,textContent:'3D 無法顯示，仍可從左側清單查看各組關聯。'});
  }
  $('loading').hidden=true;
  for(const id of ['show-support','show-decoys','show-chains','show-codes','show-ids','show-acts','show-parts','show-found','show-signals']) $(id).addEventListener('change',()=>{if(selected&&!visibleNode(selected)) select('');else refresh();});
  $('detail').addEventListener('click',event=>{
    if(event.target.closest('#show-in-model')){parent.postMessage({type:'relations:show-rooms',rooms:chainRoomList(),focus:roomOf(selected)},location.origin);return;}
    const button=event.target.closest('[data-select]');if(button) select(button.dataset.select);
  });
  $('view-iso').onclick=()=>setView('iso');$('view-front').onclick=()=>setView('front');$('view-top').onclick=()=>setView('top');
  $('clear').onclick=()=>select('');
  addEventListener('keydown',event=>{if(event.key==='Escape') select('');});
  if(scene) refresh();
  const requested=PARAMS.get('select');
  if(requested&&nodes.has(requested)) select(requested);
}
main();
