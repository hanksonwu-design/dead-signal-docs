import {SCALE} from './human-scale.js';

// Current viewer only. The archived editor keeps its original fixtures and saved layouts.
export function dressCurrentRoom(n,parent,api) {
 const {THREE,box,material,line,y}=api;
 const m={metal:material(0x78928f),light:material(0xb4c4ba),dark:material(0x344346),wood:material(0xa18a68),cloth:material(0x819d87),red:material(0xad6752),glass:material(0x7cb2a3,.35)};
 const group=(kind,x=0,z=0)=>{const g=new THREE.Group();g.position.set(n.x+x,y,n.z+z);g.userData.fixture=kind;parent.add(g);return g;};
 const b=(g,w,h,d,x,dy,z,mat=m.metal)=>box(w,h,d,x,dy,z,mat,g);
 const block=(kind,w,h,d,x,dy,z,mat=m.metal)=>{const g=group(kind,x,z);b(g,w,h,d,0,dy,0,mat);return g;};
 const pipe=(a,c,r=.08)=>{
  const g=group('pipe'),start=new THREE.Vector3(...a),end=new THREE.Vector3(...c);
  const p=new THREE.Mesh(new THREE.CylinderGeometry(r,r,start.distanceTo(end),10),m.metal);
  p.position.copy(start).add(end).multiplyScalar(.5);p.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),end.sub(start).normalize());g.add(p);
 };
 const table=(x,z,w=SCALE.deskWidth,d=SCALE.deskDepth,h=SCALE.deskHeight)=>{
  const g=group('table',x,z);g.userData.dimensions={width:w,depth:d,height:h};
  b(g,w,.045,d,0,h-.0225,0,m.wood);
  for(const dx of [-w/2+.07,w/2-.07])for(const dz of [-d/2+.07,d/2-.07])b(g,.05,h-.045,.05,dx,(h-.045)/2,dz);
  return g;
 };
 const chair=(x,z,restraint=false)=>{
  const g=group(restraint?'restraint-chair':'chair',x,z);
  b(g,.45,.07,.44,0,SCALE.seatHeight-.035,0,m.cloth);b(g,.43,.44,.05,0,.71,-.2,m.cloth);
  for(const dx of [-.17,.17])for(const dz of [-.16,.16])b(g,.035,.415,.035,dx,.2075,dz);
  if(restraint){b(g,.6,.035,.08,0,.7,0,m.red);for(const dx of [-.28,.28])b(g,.04,.26,.04,dx,.57,0);}
 };
 const desk=(x,z)=>{
  const g=table(x,z);b(g,.54,.32,.045,0,.97,-.1,m.dark);b(g,.05,.09,.05,0,.795,-.1);
  b(g,.24,.02,.15,0,.76,-.1);b(g,.4,.025,.14,0,.77,.19,m.dark);chair(x,z+.72);
 };
 const bed=(x,z,bunk=false)=>{
  const g=group(bunk?'bunk-bed':'bed',x,z);g.userData.dimensions={width:SCALE.bedWidth,depth:SCALE.bedLength,height:bunk?1.9:.85};
  for(const top of bunk?[SCALE.mattressTop,1.48]:[SCALE.mattressTop]){
   b(g,1,.13,2.05,0,top-.065,0,m.cloth);b(g,1.04,.05,2.09,0,top-.155,0);
   b(g,.55,.1,.32,0,top+.05,-.76,m.light);
  }
  for(const dx of [-.5,.5])for(const dz of [-1.025,1.025])b(g,.045,bunk?1.9:.85,.045,dx,(bunk?1.9:.85)/2,dz);
  if(bunk){for(const dx of [-.5,.5])b(g,.035,.04,2.05,dx,1.76,0);for(let i=1;i<6;i++)b(g,.38,.035,.035,.29,i*.28,1.06);}
 };
 const shelf=(x,z,w=1.2)=>{
  const g=group('shelf',x,z);g.userData.dimensions={width:w,depth:SCALE.shelfDepth,height:SCALE.shelfHeight};
  for(const dx of [-w/2+.025,w/2-.025])b(g,.05,1.9,.45,dx,.95,0);
  for(const h of [.18,.72,1.26,1.84]){b(g,w,.035,.45,0,h,0,m.light);if(h<1.8)b(g,w*.65,.24,.28,0,h+.137,0,m.wood);}
 };
 const archives=()=>{for(const x of [-n.w/2+1,n.w/2-1])for(const z of [-n.d/2+1,0,n.d/2-1]){const before=parent.children.length;shelf(x,z,1.4);parent.children[before].rotation.y=Math.PI/2;}};
 const sink=(x,z,w=1.1)=>{const g=group('sink',x,z);b(g,w,.72,.55,0,.36,0,m.light);b(g,w,.08,.6,0,.78,0,m.light);b(g,w-.12,.025,.43,0,.825,.015,m.dark);b(g,.035,.2,.035,0,.94,-.2);};
 const panel=(x,z,w=1.2,h=1.8)=>block('partition',w,h,.06,x,h/2,z,m.glass);
 const trolley=(x,z)=>{const g=group('trolley',x,z);for(const h of [.22,.72])b(g,.8,.04,.5,0,h,0,m.light);for(const dx of [-.35,.35])for(const dz of [-.2,.2]){b(g,.03,.78,.03,dx,.45,dz);b(g,.07,.1,.08,dx,.06,dz,m.dark);}b(g,.78,.03,.03,0,.85,-.23);};
 const rack=(x,z)=>{const g=group('server-rack',x,z);g.userData.dimensions={width:SCALE.rackWidth,depth:SCALE.rackDepth,height:SCALE.rackHeight};b(g,.6,2,1,0,1,0,m.dark);for(let i=0;i<9;i++){b(g,.53,.1,.03,0,.18+i*.19,.51);b(g,.035,.02,.02,.2,.18+i*.19,.535,m.light);}};
 const shrine=(x,z)=>{table(x,z,1.2,.6,.85);block('shrine',.38,.4,.18,x,1.05,z-.12,m.red);};

 if(n.id==='P0'){block('water-channel',2,.035,7,-2,.018,0,m.glass);block('blocked-shaft',1.2,1.9,1.2,3,.95,-3,m.dark);for(let i=0;i<5;i++)block('rubble',.55,.3,.45,2+i%2*.5,.15+Math.floor(i/2)*.25,-3);pipe([-5,2.25,-4],[5,2.25,-4],.16);}
 if(n.id==='P1'){block('pump',1.6,.9,1,0,.45,-2);pipe([-5,1.2,-3],[5,1.2,-3],.2);panel(3,-1,.9,2.1);shelf(-3,-3);}
 if(n.id==='P2'){chair(0,0,true);shelf(-3,-3);pipe([-5,2.25,-4],[5,2.25,-4],.12);}
 if(n.id==='R1'){block('counter',5,.95,.65,2,.475,-3,m.light);panel(-4,n.d/2-.12,1.6,2.1);}
 if(n.id==='R2'){sink(-2,-4,1.5);trolley(3,-4);shelf(3,-2);}
 if(n.id==='R3'){for(const x of [-6,0,6])for(const z of [-3,3])bed(x,z,true);for(const x of [-3,3])block('curtain',.04,2.2,7,x,1.1,0,m.glass);}
 if(n.id==='R4'){sink(0,-3.7,1.6);panel(-4,-1,1.2,1.9);block('toilet-base',.36,.4,.65,0,.2,1,m.light);block('toilet-tank',.38,.7,.16,0,.35,.72,m.light);}
 if(n.id==='R4b')shrine(0,0);
 if(n.id==='R5'){for(const x of [-5,2]){table(x,0,1.5,.75);block('sewing-machine',.5,.32,.23,x,.91,0,m.dark);}shelf(7,-3,.8);for(let i=0;i<4;i++)block('garment',.46,1.3,.04,-6+i*1.8,1.05,4,m.cloth);}
 if(n.id==='R6')for(const x of [-3,1])for(const z of [-2,2])desk(x,z);
 if(n.id==='R7')for(const z of [-7,-2,3,8])for(const x of [-3,2])desk(x,z);
 if(n.id==='R8'){bed(3,-1);block('curtain',.035,2.2,4,-1,1.1,-1,m.cloth);block('camera-tripod',.06,1.35,.06,-3,.675,-2);block('camera',.18,.13,.15,-3,1.42,-2,m.dark);panel(-6,0,1.2,1.8);}
 if(n.id==='R9'){bed(3,0);block('sofa-seat',1.8,.43,.75,-3,.215,-3,m.cloth);block('sofa-back',1.8,.78,.14,-3,.39,-3.3,m.cloth);block('curtain',.035,2.2,4,0,1.1,0,m.cloth);}
 if(n.id==='R10')shrine(1,-1);
 if(n.id==='R11'){for(const x of [-2.5,1.5])desk(x,0);block('work-partition',5,1.4,.055,0,.7,-3,m.light);shelf(3.5,3,.8);}
 if(n.id==='R12'){table(-1,0,1.8,.8);shelf(4,-3,.9);for(let i=0;i<3;i++)block('repair-tool',.22,.16,.25,-1.6+i*.5,.83,0);}
 if(n.id==='R13'){bed(-1,0);sink(-3,-3);block('curtain',.035,2.1,3,3,1.05,1,m.cloth);}
 if(n.id==='R14'){block('lift-opening',2,2.2,.08,0,1.1,-1.5,m.dark);for(const x of [-1.1,1.1])block('shaft-jamb',.1,2.3,1.8,x,1.15,-.6);trolley(3,2);}
 if(n.id==='R15'){for(const x of [-2.5,2.5]){block('generator',1.4,1.1,2.2,x,.55,0);pipe([x,1,0],[x,2.25,-3],.12);}for(let i=0;i<3;i++)block('electrical-box',.45,.65,.22,-3+i*2,1.35,-4,m.red);}
 if(n.id==='R16'){for(const x of [-3,0,3])rack(x,0);pipe([-5,2.4,-3],[5,2.4,-3],.1);}
 if(n.id==='R17'||n.id==='R21'){desk(0,0);for(const x of [-4,0,4])shelf(x,-n.d/2+.7,1.1);}
 if(n.id==='R18'){for(const z of [-10,-3,5,11])block('covered-crate',.7,.9,1.2,z%2?1:-1,.45,z,m.dark);for(const z of [-12,-6,0,6,12])block('acoustic-panel',.08,2.1,1,-2.4,1.05,z,m.light);}
 if(n.id==='R19')chair(0,0,true);
 if(n.id==='R20')desk(0,-1.5);
 if(n.id==='R22'){block('release-lever',.1,1.1,.1,-3,.55,-2,m.red);block('release-box',.45,.35,.25,-3,1.1,-1.8);}
 if(['R23','R24','R29','R31'].includes(n.id)){archives();table(0,0,1.8,.8);if(n.id==='R24')panel(0,-n.d/2+.5,2.4,1.9);}
 if(['R25','R28'].includes(n.id)){desk(0,0);chair(-1.2,1.2);chair(1.2,1.2);panel(0,-2.5,1.2,.8);}
 if(n.id==='R26'){chair(0,0,true);for(const x of [-3,0,3])shelf(x,-n.d/2+.5);}
 if(n.id==='R27')for(const z of [-2,0,2])block('mirror',.035,1.5,.7,2,1.05,z,m.glass);
 if(['U1','U4'].includes(n.id)){for(const z of [-2,1])block('service-door',.05,2.1,.9,-n.w/2+.12,1.05,z,m.wood);if(n.id==='U4')block('inspection-hatch',.9,.04,.9,0,.02,1,m.dark);}
 if(n.id==='U2'){sink(-2,-2);for(const z of [-2,2]){block('drying-post',.055,2.2,.055,1,1.1,z);block('drying-rail',3,.035,.035,0,2.18,z);}block('hanging-sheet',1.1,1.3,.025,0,1.35,1,m.cloth);}
 if(n.id==='U2b'){block('winch',.5,.55,.32,0,.275,-1);block('winch-handle',.04,.6,.04,.35,.7,-1);}
 if(n.id==='U3'){table(0,0,1.6,.7);for(const x of [-2,0,2])block('junction-box',.32,.25,.14,x,1.5,-2,m.light);}
 if(n.id==='U4b'){block('pipe-screen',.06,1.2,1.8,1,.6,0);pipe([.7,.7,-.8],[.7,.7,.8],.06);}
 if(n.id==='U5'){block('cold-cabinet',.85,1.9,.8,-2,.95,0,m.light);block('cold-cabinet-door',.79,1.74,.04,-2,.98,.42,m.dark);table(1,0);}
 if(n.id==='U6'){const g=group('water-tank');const tank=new THREE.Mesh(new THREE.CylinderGeometry(1.1,1.1,1.8,20),m.metal);tank.position.y=1.1;g.add(tank);for(const x of [-.7,.7])b(g,.1,.2,1.3,x,.1,0);for(const x of [1.45,1.9])b(g,.04,2.25,.04,x,1.125,0);for(let i=1;i<=8;i++)b(g,.49,.035,.035,1.675,i*.27,0);}
 if(n.id==='U6b'){block('drain-cover',1.2,.06,1.2,0,.03,0,m.wood);for(const x of [-.24,.24])block('ladder-rail',.04,1.65,.04,x,.825,-1);for(let i=1;i<6;i++)block('ladder-rung',.52,.035,.035,0,i*.27,-1);}
 if(n.id==='R30'){block('comparison-board',1.6,.04,1.1,0,.02,0,m.light);for(const x of [-1.2,1.2])block('paper-rail',.04,1.9,.04,x,.95,-1.2);}
 if(n.id==='R32'){block('relay-core',.8,.9,1.2,0,.45,0,m.dark);block('floor-channel',n.w-2,.06,.3,0,.03,-2,m.wood);for(const x of [-3,3])line([[n.x+x,y+.02,n.z-3],[n.x+x,y+.02,n.z+3]],0xc4a883,parent);}
}
