export function showContentMarkers(pixelsPerUnit,previouslyVisible){return pixelsPerUnit>=(previouslyVisible?7:8);}

export function markerPosition(marker,model){
 const owner=marker.shot?model.shots.find(s=>s.id===marker.shot):model.nodes.find(n=>n.id===marker.node);
 if(!owner?.spatial&&!marker.shot)return null;
 if(marker.shot)return [owner.position[0]+marker.offset[0],owner.position[1]+1.2,owner.position[2]+marker.offset[1]];
 if(owner.id==='M1')return [owner.position[0]+marker.offset[0],owner.position[1]+1.2,owner.position[2]+marker.offset[1]*5];
 return [owner.x+marker.offset[0]*owner.w,owner.y+1.2,owner.z+marker.offset[1]*owner.d];
}

export function markerInContext(marker,node,shot){return marker.node===node&&marker.shot===(shot||'');}
