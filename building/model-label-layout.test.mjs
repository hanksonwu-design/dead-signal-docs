import test from 'node:test';
import assert from 'node:assert/strict';
import {showSceneNames,placeModelLabel} from './model-label-layout.js';

const bounds={left:8,right:382,top:80,bottom:500};
const label={x:195,y:200,z:0,width:150,height:46};

test('names follow projected scale with hysteresis, independent of fit zoom',()=>{
 assert.equal(showSceneNames(4,false),false);
 assert.equal(showSceneNames(6,false),true);
 assert.equal(showSceneNames(5.5,true),true);
 assert.equal(showSceneNames(5.5,false),false);
 assert.equal(showSceneNames(4.9,true),false);
 assert.equal(showSceneNames(600/80,false),true);
 assert.equal(showSceneNames(600*4/320,false),true);
});

test('actual multiline bounds reject overlaps and allow compact ID fallback',()=>{
 const occupied=[[130,145,260,173]];
 assert.equal(placeModelLabel(label,bounds,occupied),null);
 assert.deepEqual(placeModelLabel({...label,width:38,height:22},bounds,occupied),[176,178,214,200]);
 assert.deepEqual(placeModelLabel(label,bounds,[]),[120,154,270,200]);
});

test('labels stay inside narrow viewports and reserve header and toolbar space',()=>{
 assert.deepEqual(placeModelLabel({...label,x:10},bounds,[]),[8,154,158,200]);
 assert.deepEqual(placeModelLabel({...label,x:380},bounds,[]),[232,154,382,200]);
 for(const change of [{x:-1},{x:390},{y:100},{y:501},{z:-1},{z:1},{width:400}]){
  assert.equal(placeModelLabel({...label,...change},bounds,[]),null,JSON.stringify(change));
 }
});
