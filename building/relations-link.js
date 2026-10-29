// Joins the scene model with the collection relations graph shown on the same page:
// a 空間模型／收集物關聯 switch, a per-room relation summary, and selections passed both ways.
const $=id=>document.getElementById(id);
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export function initRelationsView({selected,isScene,choose,setChain,refit}){
 let data=null,chain=[];
 const frame=$('relations-frame'),panel=$('relations-view'),layout=document.querySelector('main.layout'),header=document.querySelector('body>header');
 $('marker-section').insertAdjacentHTML('afterend',`<section id="relation-section" class="relation-section"><h3>收集物關聯</h3><div id="relation-summary" class="reading">讀取中…</div><button id="relation-open" type="button">在關聯圖追這個房間</button><p id="chain-banner" class="chain-banner" hidden>大樓上標出的關聯鏈：<span id="chain-rooms"></span> <button id="chain-clear" type="button">清除</button></p></section>`);

 const keyLabel=id=>data.keys.find(k=>k.id===id)?.label||id;
 const evidenceLabel=id=>{const e=data.evidence.find(x=>x.id===id);return e?`${e.id} ${e.label}`:id;};
 const row=(title,items)=>items.length?`<p><b>${title}</b> ${items.map(esc).join('、')}</p>`:'';
 function renderSummary(room){
  const box=$('relation-summary');
  if(!data){box.textContent=data===false?'無法讀取收集物關聯資料。':'讀取中…';$('relation-open').disabled=true;return;}
  const id=`room:${room}`,links=data.systemLinks;
  const found=links.filter(l=>l.from===id&&l.kind.startsWith('found')).map(l=>evidenceLabel(l.to)+(l.kind==='found-freeze'?'（凝固）':''));
  const signals=links.filter(l=>l.from===id&&l.kind==='signal-found').map(l=>l.to.slice(7));
  const boards=data.groups.filter(g=>g.room===room).map(g=>`${g.order}｜${g.title}`);
  const made=links.filter(l=>l.from===id&&l.kind==='produces').map(l=>keyLabel(l.to));
  const opened=links.filter(l=>l.to===id&&l.kind==='unlocks').map(l=>keyLabel(l.from));
  const used=links.filter(l=>l.to===id&&l.kind==='signal-use').map(l=>l.from.slice(7));
  const html=row('在此取得',found)+row('記錄訊號',signals)+row('在此推理',boards)+row('產生',made)+row('由此開通',opened)+row('在此使用訊號',used);
  box.innerHTML=html||'這個場景沒有收集物關聯。';
  $('relation-open').disabled=!data.rooms.some(r=>r.room===room);
 }
 function renderChain(){
  $('chain-banner').hidden=!chain.length;$('chain-rooms').textContent=chain.join('、');
 }
 function fitPanel(){panel.style.height=`${Math.max(420,innerHeight-(header?.offsetHeight||0))}px`;}
 // The view lives in the hash (#panel=relations&mode=systems): the document shell frames this page,
 // owns ?view=building, and mirrors only the hash into its shareable address.
 const hashParams=()=>new URLSearchParams(location.hash.slice(1));
 function writeHash(params){
  history.replaceState(null,'',`#${params}`);
  dispatchEvent(new Event('archive:scene-change'));
 }
 const modeIn=params=>params.get('mode')==='systems'?'systems':'';
 function show(view,select='',requested){
  const relations=view==='relations',params=hashParams();
  panel.hidden=!relations;layout.hidden=relations;
  $('view-model').setAttribute('aria-selected',String(!relations));$('view-relations').setAttribute('aria-selected',String(relations));
  if(relations){
   params.set('panel','relations');
   // Rooms only exist in the four-system lanes, so tracing a room opens that layout;
   // otherwise follow the address, then the layout last used in this visit.
   const mode=select.startsWith('room:')?'systems':requested??(params.has('mode')?modeIn(params):(frame.dataset.mode||''));
   if(mode)params.set('mode',mode);else params.delete('mode');
   if(select||!frame.getAttribute('src')||frame.dataset.mode!==mode){
    frame.src=`relations.html?${new URLSearchParams({embed:'1',...(mode?{mode}:{}),...(select?{select}:{})})}`;frame.dataset.mode=mode;
   }
   fitPanel();
  }else{params.delete('panel');params.delete('mode');}
  writeHash(params);
  if(!relations)requestAnimationFrame(refit);
 }

 $('view-model').onclick=()=>show('model');
 $('view-relations').onclick=()=>show('relations');
 $('relation-open').onclick=()=>show('relations',`room:${selected()}`);
 $('chain-clear').onclick=()=>{chain=[];setChain(chain);renderChain();};
 addEventListener('resize',()=>{if(!panel.hidden)fitPanel();});
 // Back, forward or an edited address in the shell changes only this page's hash, without a reload.
 addEventListener('hashchange',()=>{
  const params=hashParams(),relations=params.get('panel')==='relations';
  if(relations===panel.hidden||relations&&modeIn(params)!==frame.dataset.mode)show(relations?'relations':'model','',modeIn(params));
 });
 addEventListener('message',event=>{
  if(event.origin!==location.origin||event.source!==frame.contentWindow)return;
  const message=event.data||{};
  if(message.type==='relations:mode'&&!panel.hidden){
   const params=hashParams();
   if(message.mode==='systems')params.set('mode','systems');else params.delete('mode');
   frame.dataset.mode=message.mode==='systems'?'systems':'';
   writeHash(params);
  }
  if(message.type==='relations:show-rooms'){
   chain=(message.rooms||[]).filter(isScene);setChain(chain);renderChain();show('model');
   const focus=isScene(message.focus)?message.focus:chain[0];
   if(focus)choose(focus);
  }
 });
 fetch('../collection-relations.json',{cache:'no-cache'}).then(r=>r.ok?r.json():Promise.reject(new Error(String(r.status))))
  .then(json=>{data=json;},()=>{data=false;}).finally(()=>renderSummary(selected()));
 if(hashParams().get('panel')==='relations')show('relations');
 return {renderSummary};
}
