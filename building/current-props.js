import {dressRoom} from './story-props.js';
import {layout} from './spatial.js';
export function dressCurrentRoom(n,parent,api) {
 if(layout[n.id])return dressRoom(n,parent,api);
 const {THREE,box,material,line,y}=api;
 const metal=material(0x78928f),light=material(0xb4c4ba),dark=material(0x344346),accent=material(0xb08a69),glass=material(0x7cb2a3,.5);
 const b=(w,h,d,x,dy,z,mat=metal)=>box(w,h,d,n.x+x,y+dy,n.z+z,mat,parent);
 const table=()=>{b(4,.2,2,0,1,0,light);for(const x of[-1.5,1.5])b(.15,.8,1,x,.5,0);};
 const shelves=()=>{for(const x of[-n.w/2+1,n.w/2-1]){b(.7,2.3,n.d-2,x,1.15,0);for(const dy of[.5,1.1,1.7])b(.8,.13,n.d-2,x,dy,0,light);}};
 if(['R23','R24','R29','R31'].includes(n.id)){shelves();table();if(n.id==='R24')b(n.w-2,1.9,.12,0,1.3,-n.d/2+.5,glass);}
 if(['R25','R28'].includes(n.id)){table();for(const x of[-2,2])b(.7,.75,.7,x,.4,1.5,accent);b(2.4,.9,.15,0,1.55,-2.5,dark);}
 if(n.id==='R26'){b(1.2,.6,1.5,0,.35,0,dark);b(1.2,1.1,.2,0,1,-.7);b(n.w-1,2.2,.6,0,1.1,-n.d/2+.4);}
 if(n.id==='R27'){for(const z of[-2,0,2])b(.45,1.8,1.2,2,1,z,glass);}
 if(['U1','U4'].includes(n.id)){for(const z of[-2,1]){b(.2,2,1.3,-n.w/2+.3,1,z,accent);b(.22,.3,.5,-n.w/2+.2,1.8,z,light);}if(n.id==='U4')b(2,.1,2,0,.12,1,dark);}
 if(n.id==='U2'){b(2,.65,1,-2,.45,-2,light);for(const z of[-2,2]){b(.12,2.7,.12,1,1.35,z);b(4,.1,.1,0,2.6,z);}b(2,.9,.08,0,2,1,light);}
 if(n.id==='U2b'){b(1,.7,.3,0,.4,-1);b(.15,1.6,.15,.8,.8,-1);}
 if(n.id==='U3'){table();for(const x of[-2,0,2])b(.7,.2,.7,x,1.65,-2,light);}
 if(n.id==='U4b'){b(.15,1.5,2,1,.75,0);b(.2,.2,1.8,.7,.7,0,accent);}
 if(n.id==='U5'){b(2,2,3,-2,1,0,light);b(1.9,1.8,.08,-2,1,1.54,dark);table();}
 if(n.id==='U6'){const tank=new THREE.Mesh(new THREE.CylinderGeometry(1.7,1.7,2.4,20),metal);tank.position.set(n.x,y+1.6,n.z);parent.add(tank);b(.3,2.8,.3,2.6,1.4,0);}
 if(n.id==='U6b'){b(2,.2,1.7,0,.25,0,accent);for(const x of[-.8,.8])b(.12,1.7,.12,x,.9,-1);}
 if(n.id==='R30'){b(3,.12,4,0,.2,0);for(const x of[-1.5,1.5])b(.12,2,.12,x,1,-2);}
 if(n.id==='R32'){b(2,.25,3,0,.4,0,dark);b(n.w-2,.08,.7,0,.3,-2,accent);for(const x of[-3,3])line([[n.x+x,y+.3,n.z-3],[n.x+x,y+.3,n.z+3]],0xc4a883,parent);}
}
