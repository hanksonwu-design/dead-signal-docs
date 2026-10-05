import {layout as upper, offsets as upperOffsets, routePoints} from './spatial.js';
import {orthogonalize} from './sandbox-routes.js';
import {transitionPath} from './transition-spaces.js';

// Lower-room dimensions are greybox proposals. Floors and topology come from the published flow.
const lower = {
 R23:[12,12,12,12], R24:[-10,12,12,12], R25:[-10,12,12,10], R26:[12,12,12,10],
 M1:[-24,20,3,3], R27:[-18,19,8,8], U1:[-18,7,8,10], U2:[-18,-6,8,10],
 U2b:[-11,-6,4,5], U3:[-18,-18,8,8], R28:[-6,-18,8,8], R29:[6,-18,8,8],
 U4:[18,-18,8,8], U4b:[18,-11,4,4], U5:[18,-3,8,8], U6:[18,10,8,8],
 U6b:[18,18,4,5], R30:[7,19,8,8], R31:[-5,19,8,8], R32:[-3,4,12,12]
};
const lowerPaths = {
 'R22-R23':[[19,16,0],[24,16,0],[24,19,-.08],[24,22,1],[12,22,1],[12,18,1]],
 'R23-R24':[[6,12,0],[-4,12,1]],
 'R24-R25':[[-16,12,0],[-23,12,0],[-23,19,1],[-10,19,1],[-10,17,1]],
 'R25-R26':[[-4,12,0],[6,12,1]],
 'R25-M1':[[-10,17,0],[-10,20,0],[-24,20,1]],
 'M1-R27':[[-24,20,0],[-22,20,1]],
 'R27-U1':[[-18,15,0],[-18,12,1]],
 'U1-U2':[[-18,2,0],[-18,-1,1]],
 'U2-U2b':[[-14,-6,0],[-13,-6,1]],
 'U2b-U3':[[-11,-8.5,0],[-11,-18,1],[-14,-18,1]],
 'U3-R28':[[-14,-18,0],[-10,-18,1]],
 'R28-R29':[[-2,-18,0],[2,-18,1]],
 'R29-U4':[[10,-18,0],[14,-18,1]],
 'U4-U4b':[[18,-14,0],[18,-13,1]],
 'U4b-U5':[[18,-9,0],[18,-7,1]],
 'U5-U6':[[18,1,0],[18,6,1]],
 'U6-U6b':[[18,14,0],[18,15.5,1]],
 'U6b-R30':[[16,18,0],[13,18,1],[13,19,1],[11,19,1]],
 'R30-R31':[[3,19,0],[-1,19,1]],
 'R31-R32':[[-5,15,0],[-5,10,1]],
 'U3-U1':[[-22,-18,0],[-25,-18,0],[-25,7,1],[-22,7,1]]
};
export const FLOORS = [-3,-2,-1,...Array.from({length:50},(_,i)=>i+1)];
export const floorName = f => f < 0 ? `B${-f}` : `${f}F`;
export function heights(actual=false,activeFloors=[]) {
 const occupied = new Set([...Object.values(upper).map(v=>v[2]),...activeFloors,24,36,43,44,50]);
 const map = new Map(); let y=0;
 FLOORS.forEach((f,i)=>{if(i)y+=actual||occupied.has(FLOORS[i-1])?5:.8;map.set(f,y);});
 return map;
}
const distance=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));
const mix=(a,b,t)=>a.map((v,i)=>v+(b[i]-v)*t);

// A marker is constrained to its own authored floor, never the route's midpoint by default.
export function locateShot(points, floor, floorY, fraction, tolerance=0) {
 const lengths=[0];points.slice(1).forEach((p,i)=>lengths.push(lengths.at(-1)+distance(points[i],p)));
 const total=lengths.at(-1), wanted=total*fraction;
 const yFor=label=>{
  const f=label.startsWith('B')?-Number(label.match(/^B(\d+)/)[1]):Number(label.match(/^(\d+)F/)[1]);
  return floorY.get(f)+.3+(label.includes('上半層')?1.6:0);
 };
 const lo=Math.min(yFor(floor.entry),yFor(floor.exit)),hi=Math.max(yFor(floor.entry),yFor(floor.exit));
 const candidates=[];
 for(let i=1;i<points.length;i++) {
  const a=points[i-1],b=points[i],len=lengths[i]-lengths[i-1];if(len<1e-8)continue;
  const dy=b[1]-a[1];let start=0,end=1;
  // Two-step local thresholds remain on the same named floor.
  if(Math.abs(dy)<1e-8){if(a[1]<lo-.01||a[1]>hi+tolerance+.01)continue;}
  else {start=Math.max(0,Math.min((lo-a[1])/dy,(hi-a[1])/dy));end=Math.min(1,Math.max((lo-a[1])/dy,(hi-a[1])/dy));if(start>end)continue;}
  const t=Math.max(start,Math.min(end,(wanted-lengths[i-1])/len));
  candidates.push({position:mix(a,b,t),along:lengths[i-1]+len*t,score:Math.abs(lengths[i-1]+len*t-wanted)});
 }
 if(!candidates.length&&!tolerance)return locateShot(points,floor,floorY,fraction,1.1);
 if(!candidates.length)throw new Error(`No path at authored floor: ${floor.label}`);
 return candidates.sort((a,b)=>a.score-b.score)[0];
}

export function buildCurrentModel(graph,flow,actual=false) {
 const floorY=heights(actual,[...flow.nodes,...flow.subscenes].flatMap(s=>s.floor.levels)), byId=new Map(flow.nodes.map(n=>[n.id,n]));
 const nodes=graph.nodes.map(n=>{
  const canonical=byId.get(n.id);if(!canonical)throw new Error(`Missing flow node: ${n.id}`);
  if(canonical.floor.kind==='ending')return {...n,...canonical,spatial:false};
  const u=upper[n.id],l=lower[n.id];if(!u&&!l)throw new Error(`Missing geometry: ${n.id}`);
  const [x,z]=u||l, [w,d]=u?u.slice(3):l.slice(2),floor=canonical.floor.levels[0];
  const offset=upperOffsets[n.id]||(['U2b','U4b','U6b'].includes(n.id)?-1.8:0);
  const y=floorY.get(floor)+offset;
  return {...n,...canonical,spatial:true,x,z,w,d,level:floor,y,position:[x,y+.3,z]};
 });
 const map=new Map(nodes.map(n=>[n.id,n]));
 const routes=graph.edges.map(edge=>{
  const a=map.get(edge.fromId),b=map.get(edge.toId),flowRoute=flow.routes.find(r=>r.id===edge.id);
  if(!flowRoute)throw new Error(`Missing flow route: ${edge.id}`);
  if(!a.spatial||!b.spatial||a.id===b.id)return {...edge,...flowRoute,spatial:false,points:[]};
  const key=`${a.id}-${b.id}`;let points;
  if(upper[a.id]&&upper[b.id])points=transitionPath(edge,orthogonalize(routePoints(edge,id=>map.get(id).y),1.6),floorY);
  else {
   const raw=lowerPaths[key];if(!raw)throw new Error(`Missing route geometry: ${key}`);
   const ay=a.id==='M1'?floorY.get(a.floor.levels.at(-1)):a.y,by=b.y;
   points=raw.map(([x,z,t])=>[x,ay+.3+(by-ay)*t,z]);
  }
  const children=flow.subscenes.filter(s=>s.route===edge.id);
  const shots=children.map((s,i)=>({...s,...locateShot(points,s.floor,floorY,(i+.5)/children.length)}));
  if(shots.some((s,i)=>i&&s.along<shots[i-1].along-1e-6))throw new Error(`Reversed shot order: ${edge.id}`);
  return {...edge,...flowRoute,spatial:true,points,shots};
 });
 const m=map.get('M1'),spine=[];
 const start=m.floor.levels[0],end=m.floor.levels.at(-1);
 for(let f=start;f<=end;f++) {
  const y=floorY.get(f)+.3;
  spine.push([-24,y,20]);
  if(f<end)spine.push([-24,(y+floorY.get(f+1)+.3)/2,16]);
 }
 m.points=spine;m.position=spine[Math.floor(spine.length/2)];
 const shots=routes.flatMap(r=>r.shots||[]);
 if(shots.length!==flow.subscenes.length)throw new Error('Missing spatial subscene');
 return {nodes,routes,shots,floorY};
}
