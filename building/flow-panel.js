import SceneOverview from '../scene-overview.js';
import {createElement,Minus,Plus,Scan,LocateFixed} from 'lucide';

const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function createFlowPanel(graph,flow,onSelect) {
 const $=id=>document.getElementById(id),dock=$('flow-dock'),viewport=$('flow-viewport'),stage=$('flow-stage');
 let snapshot,layout,zoom=.75,signature='';
 const scale=()=>{
  if(!layout)return;
  stage.style.width=layout.width*zoom+'px';stage.style.height=layout.height*zoom+'px';
  stage.firstElementChild.style.transform=`scale(${zoom})`;
  $('flow-zoom').textContent=Math.round(zoom*100)+'%';
 };
 const locate=()=>{
  if(!layout)return;
  const active=layout.nodes.find(n=>n.id===(snapshot.shot||snapshot.scene)&&n.type!=='boundary')||layout.nodes.find(n=>n.id===snapshot.scene);
  if(active)viewport.scrollTo({left:(active.x+active.width/2)*zoom-viewport.clientWidth/2,top:active.y*zoom-36,behavior:'instant'});
 };
 function draw(state,force=false) {
  snapshot=state;
  if(!dock.open)return;
  const act=graph.nodes.find(n=>n.id===state.scene).act;
  const ids=$('flow-range').value==='act'?graph.nodes.filter(n=>n.act===act).map(n=>n.id):state.visibleIds;
  const next=ids.join('|');
  if(force||next!==signature){
   signature=next;layout=SceneOverview.layout(graph,flow,ids);
   stage.innerHTML=`<div class="flow-world" style="width:${layout.width}px;height:${layout.height}px"><svg width="${layout.width}" height="${layout.height}" aria-hidden="true"><defs><marker id="flow-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10z" fill="context-stroke"/></marker></defs>${layout.segments.map(s=>`<path class="flow-edge" data-route="${esc(s.route)}" data-kind="${esc(s.kind)}" d="${s.d}" marker-end="url(#flow-arrow)" ${s.back?'marker-start="url(#flow-arrow)"':''}/>`).join('')}</svg>${layout.lanes.map(l=>`<div class="flow-lane" style="left:24px;top:${l.y}px">${esc(graph.acts[l.act])}</div>`).join('')}${layout.nodes.map(n=>{
    const item=n.type==='subscene'?flow.subscenes.find(s=>s.id===n.id):flow.nodes.find(s=>s.id===n.id);
    return `<button class="flow-node ${n.type}" data-key="${esc(n.key)}" data-flow-id="${n.id}" title="${esc(n.id+' · '+n.name+' · '+item.building.label+' · '+item.floor.label)}" style="left:${n.x}px;top:${n.y}px;width:${n.width}px;height:${n.height}px"><small>${n.type==='boundary'?'範圍外銜接':n.type==='main'?'主場景':'過渡次場景'}</small><b>${n.id}</b><span>${esc(n.name)}</span><small class="flow-location">${esc(item.building.label+' · '+item.floor.label)}</small><small>${n.image}</small></button>`;
   }).join('')}</div>`;
   $('flow-empty').hidden=!!ids.length;scale();locate();
  }
  const current=state.shot||state.scene;
  for(const b of stage.querySelectorAll('[data-flow-id]'))b.setAttribute('aria-pressed',String(b.dataset.flowId===current));
  for(const edge of stage.querySelectorAll('.flow-edge'))edge.classList.toggle('active',edge.dataset.route===state.route);
  stage.classList.toggle('all-edges',$('flow-all-edges').checked);
  $('flow-context').textContent=$('flow-range').value==='act'?graph.acts[act]:`${ids.length} 個主場景`;
 }
 stage.onclick=e=>{
  const b=e.target.closest('[data-key]');if(!b)return;
  const item=layout.nodes.find(n=>n.key===b.dataset.key);
  const child=item.type==='subscene'?flow.subscenes.find(s=>s.id===item.id):null;
  onSelect(child?.node||item.id,item.route||null,child?.id||'');
 };
 dock.addEventListener('toggle',()=>{if(dock.open&&snapshot){draw(snapshot);locate();}});
 for(const id of ['flow-range','flow-all-edges'])$(id).onchange=()=>draw(snapshot,true);
 for(const [id,icon,action] of [
  ['flow-minus',Minus,()=>{zoom=Math.max(.25,zoom/1.25);scale();}],
  ['flow-plus',Plus,()=>{zoom=Math.min(1.5,zoom*1.25);scale();}],
  ['flow-fit',Scan,()=>{zoom=Math.max(.05,Math.min(1,(viewport.clientWidth-16)/layout.width));scale();viewport.scrollTo(0,0);}],
  ['flow-locate',LocateFixed,locate]
 ]){$(id).append(createElement(icon,{width:16,height:16,'aria-hidden':'true'}));$(id).onclick=action;}
 return {render:draw,locate,fallback(){dock.open=true;dock.classList.add('required');dock.querySelector('summary').onclick=e=>e.preventDefault();if(snapshot)draw(snapshot);}};
}
