// Metre-based greybox targets, not surveyed dimensions or a building-code assessment.
export const SCALE = Object.freeze({
 floorHeight:3.2, floorSurface:.3, slab:.24, wallHeight:2.6, wallThickness:.12,
 doorWidth:1, doorHeight:2.1, corridorWidth:1.2, railHeight:.95,
 stairRise:.18, stairGoing:.28, treadThickness:.05,
 personHeight:1.7, bedWidth:1, bedLength:2.05, mattressTop:.52,
 deskWidth:1.4, deskDepth:.7, deskHeight:.75, seatHeight:.45,
 shelfHeight:1.9, shelfDepth:.45, rackWidth:.6, rackDepth:1, rackHeight:2,
 liftWidth:1.6, liftDepth:1.8, liftHeight:2.2, liftDoorWidth:1.1
});

export function stairFlight(a,b) {
 const rise=Math.abs(b[1]-a[1]),run=Math.hypot(b[0]-a[0],b[2]-a[2]);
 const count=Math.max(1,Math.ceil((rise-1e-8)/SCALE.stairRise));
 return {rise,run,count,riser:rise/count,going:run/count};
}

export function referenceSpot(room,obstacles=[]) {
 const primary=obstacles[0],candidates=primary?[
  [primary.maxX+.65,(primary.minZ+primary.maxZ)/2],
  [primary.minX-.65,(primary.minZ+primary.maxZ)/2],
  [(primary.minX+primary.maxX)/2,primary.maxZ+.65]
 ]:[];
 for(const x of [room.x-room.w/2+1,room.x+room.w/2-1,room.x])for(const z of [room.z+room.d/2-1,room.z-room.d/2+1,room.z])candidates.push([x,z]);
 return candidates.find(([x,z])=>x-.55>=room.x-room.w/2-1e-5&&x+.55<=room.x+room.w/2+1e-5&&z-.55>=room.z-room.d/2-1e-5&&z+.55<=room.z+room.d/2+1e-5&&obstacles.every(b=>x+.55<b.minX||x-.55>b.maxX||z+.55<b.minZ||z-.55>b.maxZ))||null;
}

// Preserve endpoints and authored landings. Short flights fold sideways instead of stretching treads.
export function metricStairPath(points,towerBounds=[]) {
 const out=[[...points[0]]];
 for(let i=1;i<points.length;i++){
  const a=points[i-1],b=points[i],flight=stairFlight(a,b);
  if(flight.rise>.1&&flight.run>.05&&flight.going<SCALE.stairGoing-1e-6){
   const run=Math.ceil((flight.rise/2-1e-8)/SCALE.stairRise)*SCALE.stairGoing;
   const dx=(b[2]-a[2])/flight.run,dz=-(b[0]-a[0])/flight.run,mid=(a[1]+b[1])/2;
   let side=(a[2]+b[2])*dz>0?-1:1;
   const bounds=towerBounds.find(([lo,hi])=>[a[0],b[0]].every(x=>x>=lo-1e-6&&x<=hi+1e-6));
   const fits=s=>!bounds||[a[0]+dx*run*s,b[0]+dx*run*s].every(x=>x>=bounds[0]-1e-6&&x<=bounds[1]+1e-6);
   if(!fits(side))side=-side;
   if(!fits(side))throw new Error('Stair flight exceeds its tower bay');
   out.push([a[0]+dx*run*side,mid,a[2]+dz*run*side],[b[0]+dx*run*side,mid,b[2]+dz*run*side]);
  }
  out.push([...b]);
 }
 return out;
}

export function addScaleReference(parent,{THREE,box,material,line}) {
 const group=new THREE.Group();group.name='human-scale-reference';parent.add(group);
 const body=material(0xd9be82),dark=material(0x685e48);
 const part=(w,h,d,x,y,z,mat=body)=>box(w,h,d,x,y,z,mat,group);
 const head=new THREE.Mesh(new THREE.SphereGeometry(.11,12,8),body);head.position.set(0,1.59,0);group.add(head);
 const torso=new THREE.Mesh(new THREE.CapsuleGeometry(.15,.32,4,10),body);torso.position.set(0,1.14,0);group.add(torso);
 for(const side of [-1,1]){
  part(.12,.72,.13,side*.09,.42,0);part(.13,.07,.25,side*.09,.035,.05,dark);
  part(.07,.5,.08,side*.22,1.06,0);
 }
 line([[.43,0,0],[.43,SCALE.personHeight,0]],0xf2d28c,group);
 for(const y of [0,1,SCALE.personHeight])line([[.36,y,0],[.5,y,0]],0xf2d28c,group);
 line([[-.5,.012,.5],[.5,.012,.5]],0xe5ded1,group);
 for(const x of [-.5,0,.5])line([[x,.012,.43],[x,.012,.57]],0xe5ded1,group);
 group.userData.referenceHeight=SCALE.personHeight;
 return group;
}
