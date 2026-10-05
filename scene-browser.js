/* Graph and picture routes are generated from the canonical screenplay and specs. */
window.SceneBrowser = (() => {
  let data=null, flow=null, options=null, selected='P0', act='all', part='all', zoom=1, trail=[], showAll=false;
  let routeId='', shotId='', reverse=false;
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const colors={'捷徑':'#99c77a','誤導':'#cc9ae6','回返':'#cc9ae6','封路':'#e79b85','肉身回返':'#e79b85','片尾':'#a7aabc'};
  const color=e=>colors[e.kind]||'#85c9c3';
  const get=id=>data.nodes.find(n=>n.id===id);
  async function load(){
    data=null;flow=null;
    const r=await fetch(`scene_graph.json?ts=${Date.now()}`,{cache:'no-store'});
    const f=await fetch(`scene-flow.json?ts=${Date.now()}`,{cache:'no-store'});
    if(!r.ok||!f.ok)throw Error('場景或銜接路段資料無法讀取');
    const graph=await r.json(), detail=await f.json();
    if(detail.version!==1||detail.nodes.length!==graph.nodes.length||detail.routes.length!==graph.edges.length||
      !graph.nodes.every(n=>detail.nodes.some(d=>d.id===n.id&&d.floor?.label&&d.building?.label))||
      !detail.subscenes.every(s=>s.floor?.label&&s.floor?.reverseLabel&&s.building?.label&&s.building?.reverseLabel)||
      !graph.edges.every(e=>detail.routes.some(d=>d.id===e.id&&d.from===e.fromId&&d.to===e.toId&&d.back===e.back&&d.floor?.label&&d.floor?.reverseLabel&&d.building?.label&&d.travel)))throw Error('場景與銜接資料尚未同步');
    data=graph;flow=detail;
  }
  const nodeInfo=id=>flow.nodes.find(n=>n.id===id);
  const childInfo=id=>flow.subscenes.find(n=>n.id===id);
  const floorLabel=(step,returning=false)=>{
    if(step.image==='R33-V02')return `${nodeInfo('P1').floor.label} · 肉身回返`;
    const item=step.type==='subscene'?childInfo(step.id):nodeInfo(step.id);
    return `${returning?item.building.reverseLabel:item.building.label} · ${returning?item.floor.reverseLabel:item.floor.label}`;
  };
  const floorText=(label,title=label)=>`<em class="scene-floor" title="${esc(title)}">${esc(label)}</em>`;
  function saveRoute(){const hash=new URLSearchParams({scene:selected});if(routeId)hash.set('route',routeId);if(shotId)hash.set('shot',shotId);if(reverse)hash.set('direction','return');history.replaceState(null,'',`#${hash}`);}
  function select(id, follow=false){if(!get(id))return;selected=id;routeId='';shotId='';reverse=false;if(follow)trail=[...(trail.length?trail:[new URLSearchParams(location.hash.slice(1)).get('scene')||'P0']),id].slice(-8);else trail=[];saveRoute();draw();}
  function source(path, heading='', newWindow=false){
    if(newWindow){
      const url=new URL(location.href);
      const params=new URLSearchParams({doc:path});
      if(heading)params.set('heading',heading);
      url.hash=params.toString();
      window.open(url.href,'_blank','noopener,noreferrer');
      return;
    }
    options.openReader(path,true,heading);
  }
  const sourceButton=(label,file,heading)=>`<button type="button" data-source="${esc(file)}" data-heading="${esc(heading)}" data-new-window="true" title="${esc(label)}（另開分頁）">${esc(label)} ↗</button>`;
  function detailRows(ids){
    return ids.map(id=>{const image=flow.images[id];return `<li><div>${sourceButton(id,image.spec,image.heading)}<span>${esc(image.kind)} · 待製作</span></div><p>${esc(image.content)}</p><details><summary>拆圖與狀態</summary><p>${esc(image.requirements)}</p></details></li>`;}).join('');
  }
  function locateSelected(){
    const node=options.root.querySelector('.scene-node.selected'),scroll=options.root.querySelector('.scene-scroll');
    if(node&&scroll){scroll.scrollLeft=Math.max(0,node.offsetLeft*zoom-12);scroll.scrollTop=Math.max(0,node.offsetTop*zoom-44);}
  }
  function routePanel(connections){
    let edge=connections.find(e=>e.id===routeId)||connections.find(e=>e.fromId===selected)||connections[0];
    if(!edge)return '';
    routeId=edge.id;reverse=reverse&&edge.back;
    const route=flow.routes.find(r=>r.id===edge.id),steps=reverse?[...route.steps].reverse():route.steps;
    if(!steps.some(s=>s.id===shotId))shotId=steps[0].id;
    const current=steps.find(s=>s.id===shotId),child=current.type==='subscene'?childInfo(current.id):null;
    const image=flow.images[current.image],owner=nodeInfo(image.node),node=get(image.node);
    const access=nodeInfo(selected).access.filter(a=>a.edge===edge.id);
    const shotName=s=>s.image==='R33-V02'?'P1 肉身回返與救援後果':s.type==='subscene'?childInfo(s.id).name:get(s.id).name;
    const count=route.steps.filter(s=>s.type==='subscene').length;
    const frame=owner.reference;
    const reference=frame?`<figure class="scene-reference"><a href="${esc(frame.url)}" target="_blank" rel="noopener noreferrer"><img src="${esc(frame.url)}" alt="${esc(frame.label)}" loading="lazy"></a><figcaption>${esc(frame.label)} · ${esc(frame.kind)}${child?' · 所屬主場景參考':''}</figcaption></figure>`:'';
    const boundary=edge.fromId==='R22'&&edge.toId==='R23'?'跨部銜接：上部完成保存後，由下部入口承接。':route.mode==='後果演出'?'結局演出銜接，非自由探索動線。':route.mode==='原鏡回返'?'同一場景的原鏡回返。':count?'獨立路段圖：待製作。':'沿用兩端場景圖，不新增中間探索節點。';
    return `<section class="scene-route-panel" aria-label="銜接路段" id="sceneRoutePanel">
      <div class="scene-route-heading"><h3>銜接路段</h3><span>${esc(route.mode)} · ${count} 個次場景</span></div>
      <div class="scene-route-controls"><label for="sceneRoute">路線</label><select id="sceneRoute">${connections.map(e=>`<option value="${esc(e.id)}" ${e.id===edge.id?'selected':''}>${esc(e.fromId)} ${e.back?'↔':'→'} ${esc(e.toId)} · ${esc(e.kind)}</option>`).join('')}</select>
      <div class="scene-direction" role="group" aria-label="路段方向"><button type="button" data-direction="forward" aria-pressed="${!reverse}">正向</button><button type="button" data-direction="return" aria-pressed="${reverse}" ${!edge.back?'disabled':''} title="${edge.back?'反向排列同一組路段；通行仍依回訪條件':'此連線不提供反向通行'}">回程</button></div></div>
      <p class="scene-route-kind">${esc(edge.kind)} · ${edge.back?'可回訪，依原條件':'單向／條件銜接'} · ${esc(boundary)}</p>
      <p class="scene-route-floor"><b>路段位置</b> ${esc(reverse?route.building.reverseLabel:route.building.label)} · ${esc(reverse?route.floor.reverseLabel:route.floor.label)} · ${esc(route.travel.join('／'))}</p>
      <ol class="scene-route-chain">${steps.map((s,i)=>`<li>${i?`<span class="scene-route-arrow" aria-hidden="true">→</span>`:''}<button type="button" class="scene-route-step ${s.type==='subscene'?'secondary':''}" data-shot="${esc(s.id)}" aria-pressed="${s.id===shotId}"><small>${s.type==='subscene'?esc(childInfo(s.id).type):'主場景／演出'}</small><b>${esc(s.id)}</b><span>${esc(shotName(s))}</span>${floorText(floorLabel(s,reverse),s.type==='subscene'?'本畫面的所在樓層或實際跨層方向':nodeInfo(s.id).floor.description)}<small>${esc(s.image)} · 待製作</small></button></li>`).join('')}</ol>
      <div class="scene-route-gates"><p><b>通行條件</b> ${esc(edge.gate)}</p><p><b>回訪限制</b> ${esc(edge.returnRule)}</p>${access.map(a=>`<p><b>${esc(a.label)}</b> ${esc(a.location)} ${esc(a.state)}</p>`).join('')}</div>
      <section class="scene-shot-detail" aria-label="畫面與近看資料"><div><h4>${esc(current.image)} · ${esc(shotName(current))}</h4><p class="scene-shot-floor">樓層／位置：${esc(floorLabel(current,reverse))}</p><p class="scene-asset-status">正式圖：待製作</p><p>${esc(image.content)}</p>
      <div class="scene-source">${sourceButton('圖像製作單',image.spec,image.heading)}${sourceButton('遊戲劇本',child?.source??node.source,child?.heading??node.heading)}${child?sourceButton('次場景規格',child.spec,child.specHeading):''}</div>
      <details class="scene-image-requirements"><summary>畫面狀態與交付</summary><p>${esc(image.requirements)}</p></details>
      ${child?.play?`<div class="scene-exploration"><p><b>辨路依據</b> ${esc(child.play.clue)}</p><p><b>操作與開通</b> ${esc(child.play.action)}</p><p><b>錯路與復原</b> ${esc(child.play.recovery)}</p></div>`:''}
      <details class="scene-closeups"><summary>物件近看與原件（${(child?.details??owner.details).length}）</summary><ul>${detailRows(child?.details??owner.details)}</ul></details></div>${reference}</section>
    </section>`;
  }
  function draw(){
    const root=options.root;root.classList.add('scene-mode');
    const previousScroll=root.querySelector('.scene-scroll'),scrollPosition=[previousScroll?.scrollLeft||0,previousScroll?.scrollTop||0];
    if(!data||!flow){root.innerHTML='<p role="alert">節點或銜接資料未載入，請重新載入。</p>';return;}
    const q=options.query.trim().toLowerCase();
    const visible=data.nodes.filter(n=>(part==='all'||n.part===Number(part))&&(act==='all'||n.act===Number(act))&&(!q||[n.id,n.name,n.goal,nodeInfo(n.id).building.label,nodeInfo(n.id).floor.label,...n.quests,...n.tags,...flow.subscenes.filter(s=>s.node===n.id).flatMap(s=>[s.id,s.name,s.building.label,s.floor.label])].join(' ').toLowerCase().includes(q)));
    if(visible.length&&!visible.some(n=>n.id===selected)){selected=visible[0].id;routeId='';shotId='';reverse=false;}
    const n=get(selected)||data.nodes[0];
    const connections=data.edges.filter(e=>e.fromId===selected||e.toId===selected);
    const panel=visible.length?routePanel(connections):'',activeChild=childInfo(shotId);
    const overview=window.SceneOverview.layout(data,flow,visible.map(n=>n.id)),{width,height}=overview;
    const strokes=overview.segments.map(s=>{
      const e=data.edges.find(e=>e.id===s.route),near=e.id===routeId;
      return `<path data-map-route="${esc(e.id)}" data-from="${esc(s.from)}" data-to="${esc(s.to)}" d="${s.d}" fill="none" stroke="${color(e)}" stroke-width="${near?2.5:1.5}" opacity="${near?1:showAll?.8:.4}" ${['捷徑','誤導','回返','肉身回返','片尾'].includes(e.kind)?'stroke-dasharray="6 5"':''} ${e.back?'marker-start="url(#scene-arrow)"':''} marker-end="url(#scene-arrow)"><title>${esc(`${e.fromId} ${e.back?'↔':'→'} ${e.toId} · ${e.kind} · ${e.gate}`)}</title></path>`;
    }).join('');
    root.innerHTML=`<section class="scene-shell">
      <div class="scene-intro"><div><h3>場景連接</h3><p>${data.nodes.length} 個主節點 · ${flow.subscenes.length} 個次場景 · ${data.edges.length} 條動線</p></div><button type="button" data-atlas>完整節點規格 ↗</button></div>
      <div class="scene-controls"><label>部別 <select id="scenePart"><option value="all">上下部</option><option value="1" ${part==='1'?'selected':''}>上部</option><option value="2" ${part==='2'?'selected':''}>下部</option></select></label><label>章節 <select id="sceneAct"><option value="all">全程總覽</option>${data.acts.map((a,i)=>`<option value="${i}" ${String(i)===act?'selected':''}>${esc(a)}</option>`).join('')}</select></label><button type="button" data-zoom="-0.15" aria-label="縮小節點圖" title="縮小節點圖">−</button><span>${Math.round(zoom*100)}%</span><button type="button" data-zoom="0.15" aria-label="放大節點圖" title="放大節點圖">＋</button><button type="button" data-fit>適合寬度</button><label><input type="checkbox" id="sceneAllEdges" ${showAll?'checked':''}>全部連線</label><span>${visible.length} 個主節點 · ${overview.nodes.filter(n=>n.type==='subscene').length} 個次場景</span></div>
      <div class="scene-legend"><span class="scene-legend-main">主場景</span><span class="scene-legend-child">過渡次場景／轉場接景</span><span>實線：主線／分岔</span><span>綠虛線：捷徑</span><span>紫虛線：誤導／回返</span><span>橘：封路／肉身回返</span></div>
      <div class="scene-layout"><div><div class="scene-scroll" tabindex="0" aria-label="場景串接圖，可橫向捲動"><div style="width:${width*zoom}px;height:${height*zoom}px"><div class="scene-canvas" style="width:${width}px;height:${height}px;transform:scale(${zoom})">
      <svg width="${width}" height="${height}" aria-hidden="true"><defs><marker id="scene-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#a7b6bd"/></marker></defs>${strokes}</svg>
      ${overview.lanes.map(l=>`<div class="scene-lane" style="top:${l.y}px">${esc(data.acts[l.act])}</div>`).join('')}
      ${overview.nodes.map(node=>{const child=node.type==='subscene',boundary=node.type==='boundary',active=child?node.id===shotId:!boundary&&node.id===selected;
        const label=child?childInfo(node.id).type:boundary?'銜接至其他場景':'主場景';
        return `<button type="button" class="scene-map-node ${child?'scene-child':boundary?'scene-boundary':'scene-node'} ${active?'selected':''}" ${child?`data-subscene="${esc(node.id)}"`:boundary?`data-follow="${esc(node.id)}"`:`data-node="${esc(node.id)}"`} data-map-key="${esc(node.key)}" style="left:${node.x}px;top:${node.y}px;width:${node.width}px;height:${node.height}px" aria-pressed="${active}" title="${esc(`${label} · ${node.name} · ${node.image}`)}"><small>${label}</small><b>${esc(node.id)}</b><span>${esc(node.name)}</span>${floorText(floorLabel(node),child?'本畫面的所在樓層或實際跨層方向':nodeInfo(node.id).floor.description)}<small>${child?'正式圖待製作':esc(node.image)}</small></button>`;}).join('')}
      </div></div></div>${!visible.length?'<p role="status">沒有符合條件的場景，請調整搜尋或章節。</p>':''}
      <p class="scene-note">流程連接，非比例地圖。</p>${panel}</div>
      <aside class="scene-detail" aria-label="場景詳細資料" ${visible.length?'':'hidden'}><div class="eyebrow">${esc(data.acts[n.act])} / ${esc(n.id)}</div><h3>${esc(n.name)}</h3><p>${esc(n.goal)}</p>
      <p class="scene-location"><b>所在位置</b> ${esc(nodeInfo(n.id).building.label)} · ${esc(nodeInfo(n.id).floor.label)}</p>
      <details class="scene-spatial"><summary>空間定位</summary><p>${esc(nodeInfo(n.id).floor.description)}</p>${sourceButton('樓層規格',nodeInfo(n.id).floor.source,nodeInfo(n.id).floor.heading)}</details>
      ${activeChild?`<section class="scene-child-summary"><h4>${esc(activeChild.id)} · ${esc(activeChild.name)}</h4><p>${esc(activeChild.type)} · ${esc(activeChild.from)} → ${esc(activeChild.to)}</p><p class="scene-child-floor">所在位置：${esc(floorLabel({id:activeChild.id,type:'subscene'},reverse))}</p><p>${esc(flow.images[activeChild.image].content)}</p><div class="scene-source">${sourceButton('次場景劇本',activeChild.source,activeChild.heading)}${sourceButton('次場景規格',activeChild.spec,activeChild.specHeading)}</div></section>`:''}
      ${n.tags.length?`<p class="scene-tags">${n.tags.map(esc).join(' · ')}</p>`:''}
      <div class="scene-source"><button type="button" data-source="${esc(n.source)}" data-heading="${esc(n.heading)}" data-new-window="true" title="在新視窗開啟本場景劇情、台詞與演出" aria-label="遊戲劇本（在新視窗開啟）">遊戲劇本 ↗</button><a class="scene-3d" href="building/#${esc(new URLSearchParams({scene:n.id,...(routeId?{route:routeId}:{}),...(activeChild?{shot:activeChild.id}:{}),...(reverse?{direction:'return'}:{})}).toString())}" title="在全劇空間模型中查看場景與銜接路段">3D 空間 ↗</a>${n.duplicatePack || n.source===n.pack ? '' : `<button type="button" data-source="${esc(n.pack)}" data-heading="${esc(n.packAnchor || n.id)}" data-new-window="true" title="互動 ID、狀態鍵、資產與驗收條件（在新視窗開啟）" aria-label="製作規格（在新視窗開啟）">製作規格 ↗</button>`}</div>
      ${data.phases[n.id]?`<h4>房內進行順序</h4><ol>${data.phases[n.id].map(x=>`<li>${esc(x)}</li>`).join('')}</ol>`:''}
      <h4>入口、出口與回訪</h4>${connections.map(e=>{const outgoing=e.fromId===selected,other=outgoing?e.toId:e.fromId;return `<article class="scene-edge" style="border-left-color:${color(e)}"><strong>${esc(e.fromId)} ${e.back?'↔':'→'} ${esc(e.toId)} <small>${esc(e.kind)} · ${outgoing?'出口':'入口'}</small></strong><p><b>條件</b> ${esc(e.gate)}</p><p><b>移動演出</b> ${esc(e.motion)}</p><p class="scene-note">${esc(e.returnRule)}</p><button type="button" data-route="${esc(e.id)}" aria-expanded="${routeId===e.id}">展開銜接路段</button><button type="button" data-follow="${esc(other)}">查看 ${esc(other)} · ${esc(get(other).name)}</button></article>`;}).join('')}
      <details class="scene-closed-access"><summary>封閉位置與特殊銜接</summary>${nodeInfo(n.id).access.filter(a=>!a.edge).map(a=>`<p><b>${esc(a.label)}</b> ${esc(a.location)} ${esc(a.state)}</p>`).join('')||'<p>無額外封閉位置。</p>'}</details>
      <h4>支線與收集</h4><p>${n.quests.length?n.quests.map(esc).join('<br>'):'沒有新增支線掛點；選填調查依場景原文。'}</p>
      <button type="button" data-quests>查看支線規格 ↗</button>
      <p class="scene-note">目前是製作閱讀預覽，不模擬解鎖，也不修改遊戲進度。灰盒尚須驗證鏡位、節奏與路線前置。</p></aside></div>
      <div class="scene-trail" ${visible.length?'':'hidden'}>閱讀路徑：${trail.length?trail.map(esc).join(' → '):esc(n.id)} <button type="button" data-clear>清除</button></div>
      <details class="scene-docs"><summary>依章閱讀原文件（${options.docs.length} 份）</summary>${options.docs.map(d=>`<button type="button" data-source="${esc(d.path)}">${esc(window.documentDisplayTitle(d.title))}</button>`).join('')}</details></section>`;
    if(visible.length)saveRoute();
    const scroller=root.querySelector('.scene-scroll');scroller.scrollLeft=scrollPosition[0];scroller.scrollTop=scrollPosition[1];
    root.querySelectorAll('[data-node]').forEach(b=>b.onclick=()=>{select(b.dataset.node);root.querySelector(`[data-node="${selected}"]`)?.focus({preventScroll:true});});
    root.querySelectorAll('[data-follow]').forEach(b=>b.onclick=()=>{act='all';part='all';const hadQuery=Boolean(options.query);options.query='';select(b.dataset.follow,true);if(hadQuery)options.clearQuery?.();root.querySelector(`[data-node="${selected}"]`)?.scrollIntoView({block:'nearest',inline:'nearest'});});
    root.querySelectorAll('[data-source]').forEach(b=>b.onclick=()=>source(b.dataset.source,b.dataset.heading,b.dataset.newWindow==='true'));
    const redrawRoute=focus=>{const scroll=root.querySelector('.scene-scroll');const position=[scroll.scrollLeft,scroll.scrollTop];saveRoute();draw();const next=root.querySelector('.scene-scroll');next.scrollLeft=position[0];next.scrollTop=position[1];root.querySelector(focus)?.focus({preventScroll:true});};
    root.querySelectorAll('[data-subscene]').forEach(b=>b.onclick=()=>{const child=childInfo(b.dataset.subscene);selected=child.node;routeId=child.route;shotId=child.id;reverse=false;redrawRoute(`[data-subscene="${child.id}"]`);});
    root.querySelector('#sceneRoute')?.addEventListener('change',e=>{routeId=e.target.value;shotId='';reverse=false;redrawRoute('#sceneRoute');});
    root.querySelectorAll('[data-route]').forEach(b=>b.onclick=()=>{routeId=b.dataset.route;shotId='';reverse=false;redrawRoute('#sceneRoute');root.querySelector('#sceneRoutePanel')?.scrollIntoView({block:'start'});});
    root.querySelectorAll('[data-shot]').forEach(b=>b.onclick=()=>{shotId=b.dataset.shot;redrawRoute(`[data-shot="${shotId}"]`);});
    root.querySelectorAll('[data-direction]').forEach(b=>b.onclick=()=>{reverse=b.dataset.direction==='return';redrawRoute(`[data-direction="${b.dataset.direction}"]`);});
    root.querySelector('[data-atlas]').onclick=()=>source(data.atlas||options.docs.find(d=>d.path.includes('06-09_'))?.path);
    root.querySelector('[data-quests]').onclick=()=>source(options.allDocs.find(d=>d.path.includes('03-05_')).path);
    root.querySelector('#scenePart').onchange=e=>{part=e.target.value;act='all';if(part!=='all'&&get(selected).part!==Number(part))select(data.nodes.find(n=>n.part===Number(part)).id);else draw();locateSelected();};
    root.querySelector('#sceneAct').onchange=e=>{part='all';act=e.target.value;if(act!=='all'&&get(selected).act!==Number(act))select(data.nodes.find(n=>n.act===Number(act)).id);else draw();locateSelected();};
    root.querySelector('#sceneAllEdges').onchange=e=>{showAll=e.target.checked;draw();};
    const fitScale=()=>Math.min(1,Math.max(.001,(root.querySelector('.scene-scroll').clientWidth-2)/width));
    root.querySelectorAll('[data-zoom]').forEach(b=>b.onclick=()=>{zoom=Math.min(1.6,Math.max(Math.min(.05,fitScale()),zoom+Number(b.dataset.zoom)));draw();});
    root.querySelector('[data-fit]').onclick=()=>{zoom=fitScale();draw();locateSelected();};
    root.querySelector('[data-clear]').onclick=()=>{trail=[];draw();};
  }
  return {load,render(o){options=o;const hash=new URLSearchParams(location.hash.slice(1)),id=hash.get('scene');if(data?.nodes.some(n=>n.id===id)){if(id!==selected){part='all';act='all';}selected=id;}routeId=hash.get('route')||'';shotId=hash.get('shot')||'';reverse=hash.get('direction')==='return';draw();locateSelected();}};
})();
