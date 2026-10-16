import {SCALE} from './human-scale.js';

// One R8 node. These are local greybox bays, not additional graph nodes or bedrooms.
export const VIDEO_SUITE = Object.freeze({
 width:14,depth:12,roomFront:-.8,corridorCenter:.35,
 rooms:Object.freeze([
  {number:1,name:'小花慣用房',access:'full',x:-5.25,doorX:-4.7},
  {number:2,name:'另一工作房',access:'short',x:-1.75,doorX:-1.2},
  {number:3,name:'停用房',access:'threshold',x:1.75,doorX:2.3},
  {number:4,name:'封閉房',access:'closed',x:5.25,doorX:5.8}
 ]),
 // Existing R7 / R10 / R9 endpoints in the room's local frame.
 exits:Object.freeze({R7:[-7,0],R10:[-7,5],R9:[0,6]}),
 sharedPaths:Object.freeze([
  [[-7,0],[-6.1,.35],[0,.35],[6.2,.35]],
  [[-7,5],[-6.1,5],[-6.1,.35]],
  [[0,6],[0,.35]]
 ]),
 preparation:Object.freeze({x:3.8,z:4.6,width:4.8,depth:2.4})
});

export const VIDEO_SUITE_DESCRIPTION='四間到頂分隔的單人輪班視訊工作房，共用走道與準備區。小花慣用房完整探索、另一工作房短探索、停用房僅門口查看、封閉房不開放；各外門皆接共用走道，不穿過工作房。房間不是住處，房號僅作製作辨識。';

// Share fixtures between the published model and the archived editor. A resized
// editor proposal scales its local plan without replacing the user's saved layout.
export function dressVideoSuite(n,parent,{THREE,box,material,y}) {
 const sx=n.w/VIDEO_SUITE.width,sz=n.d/VIDEO_SUITE.depth;
 const m={wall:material(0x7b8b82),dark:material(0x344346),wood:material(0xa18a68),
  light:material(0xb4c4ba),cloth:material(0x819d87),closed:material(0x685c56),metal:material(0x78928f)};
 const group=(fixture,x,z,extra={})=>{const g=new THREE.Group();g.position.set(n.x+x*sx,y,n.z+z*sz);g.scale.set(sx,1,sz);g.userData={fixture,...extra};parent.add(g);return g;};
 const b=(g,w,h,d,x,dy,z,mat=m.metal)=>box(w,h,d,x,dy,z,mat,g);
 const solid=(fixture,w,h,d,x,z,mat=m.wall,extra={})=>{const g=group(fixture,x,z,extra);b(g,w,h,d,0,h/2,0,mat);return g;};
 const partition=(w,d,x,z)=>solid('video-privacy-wall',w,SCALE.wallHeight,d,x,z,m.wall,{fullHeight:true});
 const workstation=room=>{
  const g=group('video-workstation',room.x,-4.65,{roomNumber:room.number,occupancyLimit:1,access:room.access});
  b(g,1.4,.045,.7,0,.7275,0,m.wood);
  for(const x of [-.61,.61])for(const z of [-.26,.26])b(g,.05,.705,.05,x,.3525,z);
  b(g,.54,.32,.045,0,.97,-.12,m.dark);b(g,.05,.14,.05,0,.82,-.12);
  b(g,.4,.025,.14,0,.78,.2,m.dark);
  b(g,.45,.07,.44,0,.415,.92,m.cloth);b(g,.43,.44,.05,0,.71,1.12,m.cloth);
  for(const x of [-.17,.17])for(const z of [.76,1.08])b(g,.035,.415,.035,x,.2075,z);
  b(g,.05,1.35,.05,.93,.675,-.05);b(g,.18,.13,.15,.93,1.42,-.05,m.dark);
  // Keep the background against the back wall; a freestanding screen across
  // this narrow bay would leave no human-width route from the doorway to the desk.
  b(g,2.7,2.2,.06,0,1.1,-1.05,m.cloth);
  return g;
 };
 parent.userData.videoSuite={...VIDEO_SUITE,rooms:VIDEO_SUITE.rooms.map(r=>({...r,occupancyLimit:1}))};
 // The outer shell supplies the north/back and end walls; internal side walls
 // and the fronts reach the same ceiling plane. The roof is omitted for cutaway viewing.
 for(const x of [-3.5,0,3.5])partition(.12,5.2,x,-3.4);
 for(const room of VIDEO_SUITE.rooms){
  const left=room.x-1.75,right=room.x+1.75,lo=room.doorX-.5,hi=room.doorX+.5;
  partition(lo-left,.12,(left+lo)/2,VIDEO_SUITE.roomFront);
  partition(right-hi,.12,(right+hi)/2,VIDEO_SUITE.roomFront);
  const header=group('video-door-header',room.doorX,VIDEO_SUITE.roomFront,{roomNumber:room.number,access:room.access,name:room.name});
  b(header,1,SCALE.wallHeight-SCALE.doorHeight,.12,0,(SCALE.wallHeight+SCALE.doorHeight)/2,0,m.wall);
  if(room.access==='closed')solid('video-closed-door',1,SCALE.doorHeight,.08,room.doorX,VIDEO_SUITE.roomFront,m.closed,{roomNumber:room.number,access:room.access});
  else if(room.access==='threshold')solid('video-out-of-service-barrier',1,.95,.12,room.doorX,VIDEO_SUITE.roomFront,m.closed,{roomNumber:room.number,access:room.access});
  // No new evidence inside the sealed bay; the disabled bay is visible from its doorway.
  if(room.access!=='closed')workstation(room);
 }
 const personal=group('video-personal-sources',-5.25,-4.65,{roomNumber:1});
 b(personal,.3,.05,.22,-.35,.8,.14,m.light);b(personal,.28,.04,.2,.36,.795,.17,m.light);
 b(personal,.38,.2,.65,-.42,.1,.1,m.wood); // shoe box beneath the existing source desk
 const short=group('video-short-exploration',-2.8,-2,{roomNumber:2});
 b(short,.24,.025,.18,0,.0125,0,m.light); // a local trace, not another mandatory collection
 const prep=group('video-shared-preparation',3.8,4.6,{zone:'shared-preparation'});
 b(prep,3.4,.045,.7,0,.7275,0,m.wood);
 for(const x of [-1.55,1.55])for(const z of [-.26,.26])b(prep,.05,.705,.05,x,.3525,z);
 b(prep,2.8,1,.06,0,1.35,.36,m.light); // mirror/backboard and shared role materials
 for(const x of [-1,0,1])b(prep,.35,.025,.25,x,.77,0,m.light);
 const rack=group('video-shared-garments',6.25,2.7,{zone:'shared-preparation'});
 for(const z of [-.5,.5])b(rack,.04,1.9,.04,0,.95,z);
 b(rack,.04,.04,1.1,0,1.9,0);
 for(const z of [-.3,.3])b(rack,.04,1.15,.4,0,1.18,z,m.cloth);
}

// Source pins follow their authored work area instead of spreading into sealed
// rooms. Unmapped future shots retain the generic placement until authored.
export function videoSuiteMarkerLocal(image){
 const points={
  'R8-C01':[-5.7,-4.3],'R8-C02':[-5.1,-4.3],'R8-C03':[-5.25,-4.85],
  'R8-C04':[-4.6,-3.8],'R8-C05':[3.8,4.6],'R8-C06':[-1.75,-2],
  'R8-V04':[3.8,4.6],'R8-V05':[-5.25,-2.2],'R8-V06':[-1.75,-2.2],
  'R8-D01':[-5.65,-4.7],'R8-D02':[-5,-4.7],
  'R8-D03':[-4.8,-4.4],'R8-D04':[-5.25,-4.6],'R8-D05':[-5.25,-4.9],
  'R8-F01':[-5.25,-2.7],'R8-F02':[-5.25,-3.3]
 };
 return points[image]||null;
}
