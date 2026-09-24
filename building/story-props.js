// Schematic fixtures communicate narrative use and landmarks, not finished art assets.
export function dressRoom(n,parent,{THREE,box,material,line,segment,y}){
 const m={metal:material(0x536774),wood:material(0x85634e),cloth:material(0x718d84),dark:material(0x253442),light:material(0xb3baab),red:material(0xa65d48)};
 const b=(w,h,d,dx,dy,dz,mat=m.metal)=>box(w,h,d,n.x+dx,y+dy,n.z+dz,mat,parent);
 const pipe=(a,c,r=.17)=>{const aa=new THREE.Vector3(n.x+a[0],y+a[1],n.z+a[2]),bb=new THREE.Vector3(n.x+c[0],y+c[1],n.z+c[2]);const p=new THREE.Mesh(new THREE.CylinderGeometry(r,r,aa.distanceTo(bb),8),m.metal);p.position.copy(aa).add(bb).multiplyScalar(.5);p.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),bb.sub(aa).normalize());parent.add(p);};
 const desk=(dx,dz)=>{b(2.2,.22,1,dx,1,dz,m.wood);b(.65,.6,.12,dx,1.4,dz-.1,m.dark);b(.6,.45,.6,dx,.45,dz+1,m.cloth);};
 const bed=(dx,dz)=>{b(2.2,.35,3.7,dx,.55,dz,m.cloth);b(2.2,.4,.35,dx,.9,dz-1.6,m.light);};
 if(n.id==='P0'){b(3,.05,8,-2,.25,0,material(0x345b66,.75));b(2,2,1.8,3,1.1,-3,m.dark);for(let i=0;i<5;i++)b(1,.6,.8,2+(i%2),.5+Math.floor(i/2)*.5,-3,m.metal);pipe([-5,2,-4],[5,2,-4],.32);}
 if(n.id==='P1'){b(3,1.5,2.5,0,1,-2,m.metal);pipe([-5,1.5,-3],[5,1.5,-3],.5);b(2.5,2.2,.3,3,1.1,-1,m.dark);b(2,1,1,-3,.7,-3,m.wood);}
 if(n.id==='P2'){b(.9,.7,.9,0,.65,0,m.metal);b(.9,1,.15,0,1.2,-.45,m.metal);b(2,1,.7,-3,.7,-3,m.wood);pipe([-5,2,-4],[5,2,-4],.25);}
 if(n.id==='R1'){b(10,1.1,1.3,2,.8,-3,m.light);b(.12,1.5,2,n.w/2,1,0,m.wood);b(3,2,.2,-4,1.1,n.d/2,m.dark);for(let i=0;i<5;i++)b(.06,1.8,.2,-5+i*.5,1.1,n.d/2+.1,m.red);}
 if(n.id==='R2'){b(4,.9,1.6,-2,.65,-4,m.light);b(1.5,.9,1.2,3,.65,-4,m.metal);b(2,.2,.1,-n.w/2,1.3,-2,m.wood);}
 if(n.id==='R3'){for(const dx of[-6,0,6])for(const dz of[-3,3]){bed(dx,dz);b(2.2,.25,3.7,dx,2.0,dz,m.cloth);}for(const dx of[-3,3])b(.16,2.1,7,dx,1.1,0,material(0x78746d,.4));}
 if(n.id==='R4'){b(4,.6,1,0,.75,-3.7,m.light);b(.2,1.8,3,-4,1,-1,material(0x607f79,.55));b(1,.8,1.4,0,.65,1,m.light);line([[n.x-3,y+.23,n.z-4],[n.x-3,y+.23,n.z+3]],0x355a50,parent);}
 if(n.id==='R4b'){b(1.8,.8,.8,0,.7,0,m.wood);b(.7,.7,.15,0,1.35,-.25,m.red);b(2.7,.12,2.5,0,1.95,0,m.wood);}
 if(n.id==='R5'){for(const dx of[-5,2]){b(4,.2,2,dx,1,0,m.wood);b(1.2,.5,.6,dx,1.35,0,m.dark);}b(.65,2.4,.65,7,1.2,-3,m.light);for(let i=0;i<4;i++)b(.8,1.5,.15,-6+i*1.8,1.2,4,m.cloth);}
 if(n.id==='R6'){for(const dx of[-3,1])for(const dz of[-2,2])desk(dx,dz);b(.15,2,2,6,1.1,2,m.dark);}
 if(n.id==='R7'){for(const dz of[-7,-2,3,8])for(const dx of[-3,2])desk(dx,dz);for(const dz of[-5,5])b(.6,2.2,.6,0,1.1,dz,m.light);}
 if(n.id==='R8'){bed(3,-1);b(.2,2,6,-1,1.1,-1,material(0xaf9d82,.7));b(1.5,.12,1.5,-3,2,-2,m.light);b(.2,1.6,.2,-3,1,-2,m.dark);b(3,1.1,.15,-6.9,1.3,0,material(0x69a8ad,.4));}
 if(n.id==='R9'){bed(3,0);b(4,1.2,1.2,-3,.8,-3,m.cloth);b(.2,2,6,0,1.1,0,material(0x6b6175,.7));b(1.2,1,.5,-4,1,2,m.dark);}
 if(n.id==='R10'){b(2.2,.8,.8,1,.7,-1,m.wood);b(.8,.7,.12,1,1.25,-1.3,m.light);for(const dx of[-2,0,2])b(.6,.4,.6,dx,.45,1,m.wood);}
 if(n.id==='R11'){for(const dx of[-2.5,1.5])desk(dx,0);b(6,1.4,.15,0,.9,-3,m.light);b(.7,2.3,.7,3.5,1.15,3,m.metal);}
 if(n.id==='R12'){b(4,.2,1.8,-1,1,0,m.wood);b(1.5,2,1,4,1.2,-3,m.light);for(let i=0;i<3;i++)b(.6,.4,.7,-2+i,1.3,0,m.metal);}
 if(n.id==='R13'){bed(-1,0);b(3,1,1.3,-3,.7,-3,m.light);b(.15,1.8,5,3,1.1,1,material(0xaba78c,.6));}
 if(n.id==='R14'){b(4,.05,4,0,.22,0,m.dark);for(const dx of[-2,2])b(.15,2.2,4,dx,1.3,0,m.metal);b(4,2.2,.15,0,1.3,-2,m.dark);b(1,.3,1,3,.5,2,m.wood);}
 if(n.id==='R15'){for(const dx of[-2.5,2.5]){b(3,1.3,4,dx,.95,0,m.metal);pipe([dx,1.5,0],[dx,2.5,-3],.32);}for(let i=0;i<3;i++)b(.8,1.2,.35,-3+i*2,1.1,-4,m.red);}
 if(n.id==='R16'){for(const dx of[-3,0,3])b(1.5,1.9,3,dx,1.2,0,m.dark);pipe([-5,2.2,-3],[5,2.2,-3],.25);}
 if(n.id==='R17'||n.id==='R21'){b(5,.25,2,0,1,0,m.wood);b(1,1,.7,0,.7,2,m.cloth);for(const dx of[-4,0,4])b(2.2,2,1,dx,1.2,-n.d/2+1,m.metal);}
 if(n.id==='R18'){for(const dz of[-10,-3,5,11])b(1.5,1.1,2,dz%2?1:-1,.8,dz,m.dark);for(const dz of[-12,-6,0,6,12])b(.16,2.1,2,-2.4,1.1,dz,m.light);}
 if(n.id==='R19'){b(1,.6,1.3,0,.6,0,m.dark);b(1,1.4,.15,0,1.2,-.5,m.dark);b(1.5,.12,.15,0,1,.1,m.red);}
 if(n.id==='R20'){b(6,.8,1.2,0,.6,-1.5,m.metal);b(1.3,.6,.15,0,1.2,-1.6,m.dark);}
 if(n.id==='R22'){b(.3,2.2,.3,-3,1.3,-2,m.red);b(1,.7,.7,-3,1.2,-1.5,m.metal);}
}

export function dressBuilding(building,{THREE,box,material,line,segment,floorY,roomY,nodeMap}){
 function group(f){const g=new THREE.Group();g.userData.storyFloor=f;building.add(g);return g;}
 function sign(text,x,y,z,g){const c=document.createElement('canvas');c.width=600;c.height=72;const ctx=c.getContext('2d');ctx.fillStyle='#14202be8';ctx.fillRect(0,0,600,72);ctx.fillStyle='#c4d5dd';ctx.font='28px "Microsoft JhengHei", sans-serif';ctx.textAlign='center';ctx.fillText(text,300,46);const map=new THREE.CanvasTexture(c);const s=new THREE.Sprite(new THREE.SpriteMaterial({map,depthTest:false,transparent:true}));s.scale.set(12,1.44,1);s.position.set(x,y,z);s.userData.detailSign=true;g.add(s);}
 // The lightwell and service shafts are within the cutaway building envelope, never open-air bridges.
 for(const f of[2,15,31,32]){const g=group(f),y=floorY.get(f);
  line([[-3,y+.1,-15],[5,y+.1,-15],[5,y+.1,1],[-3,y+.1,1],[-3,y+.1,-15]],0x496d80,g,.7);
  if(f===15){sign('封頂內井 · 跨棟窄橋',1,y+3,-11,g);for(const z of[-13,-11])segment([-10,y+.8,z],[7,y+1.2,z],.08,.08,material(0x6a838e),g);}
  if(f===31)sign('共用貨梯 · 後勤平台',15,y+3,-10,g);
 }
 const g=group(41),y=floorY.get(41);
 box(14,2,.1,-5,y+1.7,-3,material(0x77c5ce,.35),g);
 box(4,1.9,.15,4,y+1.85,0,material(0x73848e,.6),g);
 line([[-12,y+.7,-3],[2,y+.7,-3],[2,y+2.7,-3],[-12,y+2.7,-3],[-12,y+.7,-3]],0x9ad4d8,g,.9);
 // Single physical scratch marker shared by both sides, not two duplicate clues.
 line([[-6,y+1,-3.07],[-5.6,y+1.13,-3.07],[-5.25,y+1.06,-3.07]],0xf1ddb8,g);
 sign('R19／R20 共用單向玻璃',-5,y+3.5,-3,g);
 const b=group(-3);sign('B3 處理室 → B2–B1 爬梯出口',17,floorY.get(-3)+3.2,7,b);
 const r=group(2);sign('同層住宅 → 工坊',-10,floorY.get(2)+2.8,0,r);
 const cap=group(40);box(8,.3,16,1,floorY.get(40)+.2,-7,material(0x394d5c,.25),cap);
}
