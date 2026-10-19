import test from 'node:test';
import assert from 'node:assert/strict';
import {layout,offsets,currentLayout} from './spatial.js';
import {archivedTransitions} from './transition-spaces.js';
import {createEditorStore} from './editor-state.js';

test('archived custom coordinates, 42F–43F terminal stairs and landing links survive the canonical floor revision',()=>{
 const rooms=Object.keys(layout).map(id=>({id,name:id})),edges=[{id:'R22-EXIT43',fromId:'R22',toId:'EXIT43',kind:'出口',back:false,gate:'上部邊界',motion:'封存路線',returnRule:'封存',route:null}];
 const store=createEditorStore(rooms,structuredClone(layout),structuredClone(offsets),edges,{terminals:[{id:'EXIT43',floor:43}],platformLinks:[],allowCustomRooms:true});
 const saved=store.snapshot();
 Object.assign(saved.rooms.find(r=>r.id==='R18'),{x:71,z:-41,floor:37});
 saved.terminalRoutes[0].route={mode:'stairs',shape:'manual',width:1.5,from:{side:'east',u:0},to:{side:'north',u:0},points:[],stairSections:[{fromFloor:42,toFloor:43,points:[{x:24,z:16,t:0,dy:0},{x:24,z:22,t:1,dy:0}]}]};
 saved.platformLinks=[{id:'legacy-link',from:{kind:'landing',edgeId:'R22-EXIT43',floor:43},to:{kind:'room',roomId:'R22',side:'east',u:0},width:1.5,points:[{x:24,z:20}]}];
 store.apply(saved);assert.deepEqual(store.snapshot(),saved);
 assert.deepEqual([layout.R18[2],layout.R21[2],layout.R22[2]],[37,40,42]);
 assert.deepEqual([currentLayout.R18[2],currentLayout.R21[2],currentLayout.R22[2]],[28,29,30]);
 for(const [id,expected] of [['R17-R18',[33,34,35,36]],['R20-R21',[38,39]],['R21-R22',[41]]]){
  const route=archivedTransitions.find(t=>t.id===id);assert.deepEqual(route.views.map(v=>v.floor),expected);
  assert(route.views.every(v=>v.label.includes('封存舊配置')));
 }
});
