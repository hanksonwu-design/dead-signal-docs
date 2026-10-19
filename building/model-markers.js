import {VIDEO_SUITE,videoSuiteMarkerLocal} from './video-suite.js';

export function showContentMarkers(pixelsPerUnit,previouslyVisible){return pixelsPerUnit>=(previouslyVisible?7:8);}

export const shotPosition=(shot,floor=null)=>shot.landings?.find(p=>p.floor===floor)?.position||shot.position;
// Scene-wide route cues may follow a floor slice; a local event keeps its authored landing.
export const markerOnFloor=(marker,floor=null)=>floor===null||marker.authoredFloor===undefined||marker.authoredFloor===floor;

export function markerPosition(marker,model,floor=null){
 const owner=marker.shot?model.shots.find(s=>s.id===marker.shot):model.nodes.find(n=>n.id===marker.node);
 if(!owner?.spatial&&!marker.shot)return null;
 if(marker.shot){const p=shotPosition(owner,marker.authoredFloor??floor);return [p[0]+marker.offset[0],p[1]+1.2,p[2]+marker.offset[1]];}
 if(owner.id==='M1')return [owner.position[0]+marker.offset[0],owner.position[1]+1.2,owner.position[2]+marker.offset[1]*5];
 if(owner.id==='R8'){
  const local=videoSuiteMarkerLocal(marker.image);
  if(local)return [owner.x+local[0]*owner.w/VIDEO_SUITE.width,owner.y+1.2,owner.z+local[1]*owner.d/VIDEO_SUITE.depth];
 }
 return [owner.x+marker.offset[0]*owner.w,owner.y+1.2,owner.z+marker.offset[1]*owner.d];
}

export function markerInContext(marker,node,shot){return marker.node===node&&marker.shot===(shot||'');}
