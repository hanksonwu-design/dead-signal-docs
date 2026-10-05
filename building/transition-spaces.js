import flow from '../scene-flow.json' with {type:'json'};
import {layout} from './spatial.js';

// Route metadata shares the published flow; geometry remains a greybox proposal.
const legacyTransitions = [
 {id:'R2-R3',title:'後廚共用梯',source:'09-04_正式劇本_第一幕.md',seconds:'8–12',views:[
  {label:'A · 後廚服務巷',at:.18,kind:'kitchen',text:'餐車與出餐窗留在來路，碗架、磨刀石靠牆；紅扶手指向上行梯段。'},
  {label:'B · 住宅側平台',at:.88,kind:'residence',text:'沿同一紅扶手上行，繞過封住的住戶後門，才抵達 R3。'}]},
 {id:'R3-R4',title:'共用洗衣窄巷',source:'09-04_正式劇本_第一幕.md',seconds:'5–8',views:[
  {label:'A · 洗衣槽斜側',at:.5,kind:'laundry',text:'住宅門、洗衣槽、排水槽及廁所轉角共同定位；兩端出口保持可見。'}]},
 {id:'R7-R8',title:'跨棟窄橋',source:'09-05_正式劇本_第二幕.md',seconds:'8–12',views:[
  {label:'A · 產線橋頭',at:.16,kind:'bridge',text:'舊鋁門與橋欄交代來路；兩端門檻、地磚與窗高不同。'},
  {label:'B · 視訊區門側',at:.84,kind:'bridge',text:'回看對岸門與橋面，側面為封閉內井；前方隔音布標示 R8。'}]},
 {id:'R13-R14',title:'診所送物廊',source:'09-06_正式劇本_第三幕.md',seconds:'6–10',views:[
  {label:'A · 後簾外短廊',at:.22,kind:'clinic',text:'後簾、舊廚房磚和車輪磨痕連續；搬運字牌與後加管制分層。'},
  {label:'B · 貨梯側平台',at:.8,kind:'lift',text:'沿分流線到既有貨梯平台，保留井道內壁；沒有乘梯或新岔路。'}]}
];
const explorations = flow.routes.filter(r=>layout[r.from]&&layout[r.to]&&flow.subscenes.some(s=>s.route===r.id&&s.id.startsWith('T-'))&&!['R2-R3','R3-R4','R7-R8'].includes(`${r.from}-${r.to}`)).map(r=>({
 id:`${r.from}-${r.to}`,title:r.mode==='逐層探索'?'逐層探路':'樓層銜接',source:flow.subscenes.find(s=>s.route===r.id).source.split('/').at(-1),
 seconds:'依玩家移動，非定時轉場',views:flow.subscenes.filter(s=>s.route===r.id).map((s,i,all)=>({
  label:`${s.floor.label} · ${s.name}`,at:(i+.5)/all.length,floor:s.floor.levels[0],play:!!s.play,
  kind:r.from==='R3'?'residence':r.from==='R5'?'laundry':r.from==='R6'?'residence':r.from==='R17'?(s.floor.levels[0]<37?'warehouse':'acoustic'):'service',
  text:s.play?.action||flow.images[s.id].requirements
 }))
}));
export const transitions = [...legacyTransitions.filter(t=>!explorations.some(e=>e.id===t.id)),...explorations];
const mix=(a,b,t)=>a.map((v,i)=>v+(b[i]-v)*t);
const length=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));
export const transitionFor=e=>transitions.find(t=>t.id===e.fromId+'-'+e.toId);

// Insert authored landings into default routes, using every floor for exploration.
// Saved/custom routes keep their geometry; their scenery uses their own landings.
export function transitionPath(edge,points,floorY){
 const definition=transitionFor(edge);
 let result=points.map(p=>[...p]);
 if(!definition||edge.route)return result;
 if(definition.views.every(v=>v.floor))return explorationPath(points,definition.views,floorY,definition.id);
 for(const view of definition.views.filter(v=>v.floor)){
  const y=floorY.get(view.floor)+.3;
  const i=result.findIndex((b,i)=>i>0&&result[i-1][1]<y-1e-6&&b[1]>y+1e-6);
  if(i<1)continue;
  const a=result[i-1],b=result[i],t=(y-a[1])/(b[1]-a[1]);
  const run=Math.hypot(b[0]-a[0],b[2]-a[2]);if(run<.1)continue;
  const delta=Math.min(.7/run,t*.8,(1-t)*.8),p=mix(a,b,t-delta),q=mix(a,b,t+delta);p[1]=q[1]=y;
  result.splice(i,0,p,q);
 }
 return result;
}

// Every floor has a level landing. Successive stairs change sides around blocked cores.
export function explorationPath(points,views,floorY,id){
 const routeBays={
  'R12-R14':[[-23,-18],[-23,-8],[-23,2]],
  'R12-R15':[[-5,18],[4,18],[13,18]],
  'R13-R14':[[-7,-19],[2,-19],[11,-19]],
  'R13-R15':[[23,-12],[23,0],[23,12]],
  'R17-R14':[[23,19],[23,9],[23,-1],[23,-11]],
  'R20-R21':[[5,-4],[14,-4]],'R21-R22':[[23,16]]
 };
 const result=[points[0]],bays=routeBays[id]||[[-19,20],[-10,20],[-10,10],[-19,10]];
 const connect=target=>{
  const a=result.at(-1),mid=(a[1]+target[1])/2;
  const turn=a[2]+(target[2]>=a[2]?3:-3);
  result.push([a[0],mid,turn],[target[0]-2,mid,turn],
   [target[0]-2,mid,target[2]-3],[target[0]-2,target[1],target[2]],target);
 };
 for(const [i,view] of views.entries()){
  const [x,z]=bays[i%bays.length],y=floorY.get(view.floor)+.3;
  connect([x,y,z]);result.push([x+3,y,z]);
 }
 // The last half-flight approaches the existing destination doorway from outside.
 const last=points.at(-1),approach=points.at(-2);
 connect([approach[0],last[1],approach[2]]);result.push(last);
 return result.filter((p,i,all)=>!i||length(p,all[i-1])>1e-6);
}

export function transitionViews(definition,points,floorY){
 if(points.length<2)return [];
 const distances=[0];for(let i=1;i<points.length;i++)distances.push(distances.at(-1)+length(points[i-1],points[i]));
 const total=distances.at(-1);if(total<1e-6)return [];
 return definition.views.map((view,index)=>{
  const wanted=total*view.at,targetY=view.floor?floorY.get(view.floor)+.3:null;
  const candidates=[];
  for(let i=1;i<points.length;i++){
   const a=points[i-1],b=points[i],distance=distances[i]-distances[i-1];if(distance<.05)continue;
   const flat=Math.abs(a[1]-b[1])<.01;
   let t=Math.max(.12,Math.min(.88,(wanted-distances[i-1])/distance));
   if(targetY!==null)t=.5;
   const position=mix(a,b,t),score=targetY===null?Math.abs(distances[i-1]+distance*t-wanted):Math.abs(position[1]-targetY)*total+Math.abs(distances[i-1]+distance*t-wanted);
   const dx=b[0]-a[0],dz=b[2]-a[2],horizontal=Math.hypot(dx,dz);if(horizontal<.01)continue;
   candidates.push({position,direction:[dx/horizontal,0,dz/horizontal],score:score+(flat?0:total*2),flat});
  }
  const best=candidates.sort((a,b)=>a.score-b.score)[0];
  if(!best)return null;
  const station={...view,...best,index,route:definition.id};
  if(view.floor&&best.flat){
   // A side landing stays clear of the stacked switchback flights above it.
   station.access=[...best.position];station.bay=3.3;
   let [dx,,dz]=station.direction;
   if(best.position[0]*dz-best.position[2]*dx>0){dx=-dx;dz=-dz;}
   station.direction=[dx,0,dz];station.position=[best.position[0]+dz*station.bay,best.position[1],best.position[2]-dx*station.bay];
  }
  return station;
 }).filter(Boolean);
}

export function dressTransition(edge,points,parent,api){
 const definition=api.definition||transitionFor(edge);if(!definition)return [];
 const {THREE,box,material,line,segment,floorY}=api;
 const views=api.views||transitionViews(definition,points,floorY),width=edge.route?.width||1.6;
 const stone=material(0x697a77),metal=material(0x586a72),old=material(0x8d8876),red=material(0xa75a43),panel=material(0x9ca8a5),dark=material(0x344650);
 for(const view of views){
  const g=new THREE.Group();g.position.set(...view.position);g.rotation.y=Math.atan2(view.direction[0],view.direction[2]);
  g.userData.transition=definition.id;g.userData.station=view;parent.add(g);view.object=g;
  const side=width/2+.35,b=(w,h,d,x,y,z,mat=stone)=>box(w,h,d,x,y,z,mat,g);
  // Side bay preserves a clear centre aisle. Open portals and rails remain legible in section.
  b(width+1.25,.14,2.4,.35,-.06,0,stone);
  if(view.bay)b(view.bay,.14,1.2,-view.bay/2,-.06,0,stone);
  b(.15,2.4,2.4,side+.6,1.2,0,old);
  for(const z of[-1.05,1.05])b(.12,2.4,.12,-width/2-.08,1.2,z,metal);
  b(width+1.1,.16,.14,.35,2.4,1.05,metal);
  for(const x of[-width/2,width/2]){if(view.bay&&x<0)continue;segment([x,.9,-1.15],[x,.9,1.15],.07,.07,view.kind==='kitchen'||view.kind==='residence'?red:metal,g);}
  if(!api.hideLabels){const badge=document.createElement('canvas');badge.width=128;badge.height=96;const ctx=badge.getContext('2d');
  ctx.fillStyle='#18323a';ctx.fillRect(0,0,128,96);ctx.strokeStyle='#79ded1';ctx.lineWidth=5;ctx.strokeRect(3,3,122,90);ctx.fillStyle='#dcfff4';ctx.font='bold 62px sans-serif';ctx.textAlign='center';ctx.fillText(String.fromCharCode(65+view.index),64,71);
  const sign=new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(badge),depthTest:false}));sign.scale.set(.9,.68,1);sign.position.set(-width/2-.15,2.7,0);sign.renderOrder=10;sign.userData.transitionLabel=true;g.add(sign);}
  line([[0,.05,-.55],[-.3,.05,-.1],[.3,.05,-.1],[0,.05,-.55]],0x91ecda,g);
  switch(view.kind){
   case 'kitchen':
    for(const y of[.4,.95,1.5])b(.6,.1,1.5,side,y,0,old);
    for(const z of[-.4,.1,.5])b(.4,.12,.3,side,1.06,z,panel);
    b(.4,.16,.55,side,.55,.7,dark);break;
   case 'laundry':
    b(.75,.65,1.4,side,.35,0,panel);b(.5,.06,1.1,side,.72,0,dark);
    line([[-width/2+.12,.035,-1.2],[-width/2+.12,.035,1.2]],0x365b5b,g);
    for(const z of[-.7,.25])b(.08,.55,.5,side-.1,1.8,z,old);break;
   case 'bridge':
    b(.08,.7,1.2,side,1.5,0,dark);b(.1,.08,1.3,side-.08,1.15,0,panel);
    b(width,.025,.6,0,.025,.8,view.index?old:panel);break;
   case 'residence':case 'sealed':case 'warehouse':
    b(.12,1.9,1.05,side+.48,.95,0,dark);
    for(const z of[-.45,.45])b(.16,.1,.45,side+.37,1.15,z,metal);
    if(view.kind==='warehouse')b(.18,1.35,1,side+.2,.7,.55,panel);break;
   case 'clinic':
    b(.08,1.8,.9,side,1,-.3,old);for(const x of[-.4,.4])line([[x,.025,-1.2],[x,.025,1.2]],0xaaa28a,g);break;
   case 'lift':
    b(.12,2.3,1.8,side+.35,1.15,0,dark);for(const z of[-.85,.85])b(.2,2.3,.15,side+.2,1.15,z,metal);
    line([[-.35,.025,-1.1],[-.35,.025,1.1]],0xdab576,g);break;
   case 'acoustic':
    for(const z of[-.8,-.3,.2,.7])b(.2,2,.35,side+.22,1,z,dark);break;
   case 'dining':
    b(.12,.75,1,side+.4,1.5,0,dark);b(.5,.65,1.1,side,.35,0,panel);b(.4,.08,.9,side,.72,0,dark);break;
   default:b(.2,.45,.75,side,1.4,0,metal);
  }
  segment([side+.15,2.1,-1.2],[side+.15,2.1,1.2],.1,.1,metal,g);
 }
 return views;
}
