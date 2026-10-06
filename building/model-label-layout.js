// Use projected scale, not camera.zoom: fitting a floor resets zoom to one.
export function showSceneNames(pixelsPerUnit, previouslyVisible) {
 return pixelsPerUnit >= (previouslyVisible ? 5 : 6);
}

export function placeModelLabel({x,y,z,width,height},bounds,occupied) {
 if(z<=-1||z>=1||x<bounds.left||x>bounds.right||y<bounds.top||y>bounds.bottom)return null;
 if(width>bounds.right-bounds.left)return null;
 const left=Math.max(bounds.left,Math.min(x-width/2,bounds.right-width));
 const rect=[left,y-height,left+width,y];
 if(rect[1]<bounds.top||occupied.some(b=>rect[0]<b[2]+3&&rect[2]>b[0]-3&&rect[1]<b[3]+3&&rect[3]>b[1]-3))return null;
 return rect;
}
