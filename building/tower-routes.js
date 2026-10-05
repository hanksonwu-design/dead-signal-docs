export const TOWERS = [
 {id:'A',name:'A 棟 · 舊住商樓',x:-34,top:26,color:0xd6b984},
 {id:'B',name:'B 棟 · 後勤管制樓',x:34,top:50,color:0x8ebdaf}
];
export const towerShift = code => code === 'B' ? 34 : -34;
const distance=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));

// Crossings have fixed, level bridge decks; ascent happens within the named tower.
export function connectTowers(edge,raw,children,floorY,a,b) {
 const points=[raw[0].map((v,i)=>v+(i===0?a.shiftX:0))],anchors=[];
 const push=p=>{if(distance(points.at(-1),p)>1e-7)points.push(p);};
 const walk=p=>{
  const last=points.at(-1);
  if(Math.abs(p[1]-last[1])>.01){
   const turn=last[2]>0?last[2]-3:last[2]+3,mid=(p[1]+last[1])/2;
   push([last[0],mid,turn]);push([p[0],mid,turn]);
  } else if(Math.abs(p[0]-last[0])>.01&&Math.abs(p[2]-last[2])>.01)push([p[0],last[1],last[2]]);
  push(p);
 };
 const key=`${edge.fromId}-${edge.toId}`;
 const lane={'R12-R14':-18,'R13-R14':-6,'R13-R15':6,'R12-R15':18}[key]??(key==='R7-R8'?-12:20);
 for(const [i,s] of children.entries()) {
  const y=floorY.get(s.floor.levels[0])+.3;
  if(s.travel==='跨棟橋'){
   const forward=s.building.entry==='A',x=forward?-7:7;
   walk([x,y,lane]);push([0,y,lane]);anchors.push({id:s.id,position:[0,y,lane],index:points.length-1});push([-x,y,lane]);
  } else {
   const x=towerShift(s.building.entry)+(i%2?-18:18),z=lane+(i%2?0:-4);
   walk([x,y,z]);anchors.push({id:s.id,position:[...points.at(-1)],index:points.length-1});
  }
 }
 walk(raw.at(-1).map((v,i)=>v+(i===0?b.shiftX:0)));
 return {points,anchors};
}

export function liftPath(edge,raw,floorY,shiftX) {
 const key=`${edge.fromId}-${edge.toId}`,first=key==='R15-R16',levels=first?[29,30,31]:[47,48];
 const x=shiftX+24,z=first?21:-21,y=f=>floorY.get(f)+.3;
 const points=[raw[0].map((v,i)=>v+(i===0?shiftX:0))],anchors=[],shafts=[];
 const add=p=>{if(distance(points.at(-1),p)>1e-7)points.push(p);};
 const mark=(index,p)=>{add(p);anchors.push({id:`T-${key}-${String(index).padStart(2,'0')}`,position:[...p],index:points.length-1});};
 const walk=p=>{const prev=points.at(-1);if(Math.abs(p[1]-prev[1])>.01){const mid=(p[1]+prev[1])/2;add([prev[0],mid,prev[2]+3]);add([p[0],mid,prev[2]+3]);}else if(p[0]!==prev[0]&&p[2]!==prev[2])add([p[0],prev[1],prev[2]]);add(p);};
 if(first){walk([x-6,y(28),z-3]);mark(1,points.at(-1));walk([x-3,y(29),z]);mark(2,points.at(-1));}
 else {walk([x-3,y(47),z]);mark(1,points.at(-1));}
 for(let i=0;i<levels.length-1;i++){
  const lo=levels[i],hi=levels[i+1],a=[x,y(lo),z],b=[x,y(hi),z];
  walk(a);mark(first?3+i*2:2,[x,(a[1]+b[1])/2,z]);add(b);shafts.push({id:first?'L1':'L2',from:lo,to:hi,a,b});
  walk([x-3,y(hi),z]);mark(first?4+i*2:3,points.at(-1));
  if(first&&hi===30){add([x-3,y(30),z+3]);add([x,y(30),z+3]);add([x,y(30),z]);}
 }
 walk(raw.at(-1).map((v,i)=>v+(i===0?shiftX:0)));
 return {points,anchors,shafts};
}

export function anchoredShots(children,points,anchors) {
 const lengths=[0];points.slice(1).forEach((p,i)=>lengths.push(lengths.at(-1)+distance(points[i],p)));
 return children.map(s=>{const a=anchors.find(a=>a.id===s.id);if(!a)throw Error(`Missing location anchor: ${s.id}`);return {...s,position:a.position,along:lengths[a.index]};});
}
