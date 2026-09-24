/* Scene navigation reads the same scene_graph.json used by the printed atlas. */
window.SceneBrowser = (() => {
  let data=null, options=null, selected='P0', act='all', part='all', zoom=1, trail=[], showAll=false;
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const colors={'捷徑':'#99c77a','誤導':'#cc9ae6','回返':'#cc9ae6','封路':'#e79b85','肉身回返':'#e79b85','片尾':'#a7aabc'};
  const color=e=>colors[e.kind]||'#85c9c3';
  const get=id=>data.nodes.find(n=>n.id===id);
  async function load(){const r=await fetch(`scene_graph.json?ts=${Date.now()}`,{cache:'no-store'});if(!r.ok)throw Error('節點資料無法讀取');data=await r.json();}
  function select(id, follow=false){if(!get(id))return;selected=id;if(follow)trail=[...(trail.length?trail:[new URLSearchParams(location.hash.slice(1)).get('scene')||'P0']),id].slice(-8);else trail=[];history.replaceState(null,'',`#scene=${encodeURIComponent(id)}`);draw();}
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
  function draw(){
    const root=options.root;root.classList.add('scene-mode');
    if(!data){root.innerHTML='<p>節點資料未載入；可切換清單閱讀原文件。</p>';return;}
    const q=options.query.trim().toLowerCase();
    const visible=data.nodes.filter(n=>(part==='all'||n.part===Number(part))&&(act==='all'||n.act===Number(act))&&(!q||[n.id,n.name,n.goal,...n.quests,...n.tags].join(' ').toLowerCase().includes(q)));
    const n=get(selected)||data.nodes[0];const activeActs=[...new Set(visible.map(n=>n.act))];
    const positions=new Map();
    activeActs.forEach((a,row)=>data.nodes.filter(n=>n.act===a).forEach((node,col)=>positions.set(node.id,{x:40+col*176,y:55+row*156})));
    const ids=new Set(visible.map(n=>n.id));const width=Math.max(1115,...activeActs.map(a=>data.nodes.filter(n=>n.act===a).length*176+80)),height=Math.max(190,activeActs.length*156+30);
    const strokes=data.edges.filter(e=>ids.has(e.fromId)&&ids.has(e.toId)).map(e=>{
      const p=positions.get(e.fromId),t=positions.get(e.toId),near=e.fromId===selected||e.toId===selected;
      let d;if(e.fromId===e.toId)d=`M ${p.x+128} ${p.y+66} c 35 55 -110 55 -80 8`;
      else if(p.y===t.y)d=`M ${p.x+150} ${p.y+39} C ${p.x+170} ${p.y+104},${t.x-24} ${t.y+104},${t.x-5} ${t.y+39}`;
      else d=`M ${p.x+74} ${p.y+77} C ${p.x+74} ${p.y+117},${t.x+74} ${t.y-30},${t.x+74} ${t.y-5}`;
      return `<path d="${d}" fill="none" stroke="${color(e)}" stroke-width="${near?3:1.5}" opacity="${near?1:showAll?.48:.12}" ${['捷徑','誤導','回返','肉身回返','片尾'].includes(e.kind)?'stroke-dasharray="6 5"':''} ${e.back?'marker-start="url(#scene-arrow)"':''} marker-end="url(#scene-arrow)"><title>${esc(`${e.fromId} ${e.back?'↔':'→'} ${e.toId} · ${e.kind} · ${e.gate}`)}</title></path>`;
    }).join('');
    const connections=data.edges.filter(e=>e.fromId===selected||e.toId===selected);
    root.innerHTML=`<section class="scene-shell">
      <div class="scene-intro"><div><div class="eyebrow">SCENE CONNECTIONS</div><h3>從一個場景，走到下一個場景。</h3><p>${data.nodes.length} 個節點 · 上部 26 節點至 R22 釋放門檻；下部 22 節點從 R23 至終幕。選取節點，查看連接、前置與移動演出。</p></div><button type="button" data-atlas>閱讀完整節點規格 ↗</button></div>
      <div class="scene-controls"><label>部別 <select id="scenePart"><option value="all">上下部</option><option value="1" ${part==='1'?'selected':''}>上部</option><option value="2" ${part==='2'?'selected':''}>下部</option></select></label><label>章節 <select id="sceneAct"><option value="all">全程總覽</option>${data.acts.map((a,i)=>`<option value="${i}" ${String(i)===act?'selected':''}>${esc(a)}</option>`).join('')}</select></label><button type="button" data-zoom="-0.15" aria-label="縮小節點圖">−</button><span>${Math.round(zoom*100)}%</span><button type="button" data-zoom="0.15" aria-label="放大節點圖">＋</button><button type="button" data-fit>適合寬度</button><label><input type="checkbox" id="sceneAllEdges" ${showAll?'checked':''}>全部連線</label><span>${visible.length} 個節點</span></div>
      <div class="scene-legend"><span>實線：主線／分岔</span><span>綠虛線：捷徑</span><span>紫虛線：誤導／回返</span><span>橘：封路／肉身回返</span><span>方向與雙向條件見右側連線卡</span></div>
      <div class="scene-layout"><div><div class="scene-scroll" tabindex="0" aria-label="場景串接圖，可橫向捲動"><div style="width:${width*zoom}px;height:${height*zoom}px"><div class="scene-canvas" style="width:${width}px;height:${height}px;transform:scale(${zoom})">
      <svg width="${width}" height="${height}" aria-hidden="true"><defs><marker id="scene-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#a7b6bd"/></marker></defs>${strokes}</svg>
      ${activeActs.map((a,row)=>`<div class="scene-lane" style="top:${row*156+14}px">${esc(data.acts[a])}</div>`).join('')}
      ${visible.map(node=>{const p=positions.get(node.id);return `<button type="button" class="scene-node ${node.id===selected?'selected':''}" data-node="${esc(node.id)}" style="left:${p.x}px;top:${p.y}px" aria-pressed="${node.id===selected}" title="${esc(node.name)}"><b>${esc(node.id)}</b><span>${esc(node.name)}</span><small>${esc(node.tags[0]|| (node.quests.length?'支線收集':'調查／推進'))}</small></button>`;}).join('')}
      </div></div></div>${!visible.length?'<p role="status">沒有符合條件的場景，請調整搜尋或章節。</p>':''}
      <p class="scene-note">拓撲圖不是比例地圖。高亮為目前節點的連線；跨章長線代表流程，不能據此推定自由穿越樓層。</p></div>
      <aside class="scene-detail" aria-label="場景詳細資料"><div class="eyebrow">${esc(data.acts[n.act])} / ${esc(n.id)}</div><h3>${esc(n.name)}</h3><p>${esc(n.goal)}</p>
      ${n.tags.length?`<p class="scene-tags">${n.tags.map(esc).join(' · ')}</p>`:''}
      <div class="scene-source"><button type="button" data-source="${esc(n.source)}" data-heading="${esc(n.heading)}" data-new-window="true" title="在新視窗開啟製作細節說明" aria-label="製作細節說明（在新視窗開啟）">製作細節說明 ↗</button>${n.part===1?`<a class="scene-3d" href="building/#scene=${encodeURIComponent(n.id)}" title="在上部空間模型中查看此房的樓層與通路">3D 空間 ↗</a>`:''}${n.duplicatePack || n.source===n.pack ? '' : `<button type="button" data-source="${esc(n.pack)}" data-heading="${esc(n.packAnchor || n.id)}" data-new-window="true" title="互動 ID、狀態鍵、資產與驗收條件（在新視窗開啟）" aria-label="製作規格（在新視窗開啟）">製作規格 ↗</button>`}</div>
      ${data.phases[n.id]?`<h4>房內進行順序</h4><ol>${data.phases[n.id].map(x=>`<li>${esc(x)}</li>`).join('')}</ol>`:''}
      <h4>入口、出口與回訪</h4>${connections.map(e=>{const outgoing=e.fromId===selected,other=outgoing?e.toId:e.fromId;return `<article class="scene-edge" style="border-left-color:${color(e)}"><strong>${esc(e.fromId)} ${e.back?'↔':'→'} ${esc(e.toId)} <small>${esc(e.kind)} · ${outgoing?'出口':'入口'}</small></strong><p><b>條件</b> ${esc(e.gate)}</p><p><b>移動演出提案</b> ${esc(e.motion)}</p><p class="scene-note">${esc(e.returnRule)}</p><button type="button" data-follow="${esc(other)}">${outgoing||e.back?'沿連線預覽':'查看來源'} ${esc(other)} · ${esc(get(other).name)}</button></article>`;}).join('')}
      <h4>支線與收集</h4><p>${n.quests.length?n.quests.map(esc).join('<br>'):'沒有新增支線掛點；選填調查依場景原文。'}</p>
      <button type="button" data-quests>查看支線規格 ↗</button>
      <p class="scene-note">目前是製作閱讀預覽，不模擬解鎖，也不修改遊戲進度。灰盒尚須驗證鏡位、節奏與路線前置。</p></aside></div>
      <div class="scene-trail">閱讀路徑：${trail.length?trail.map(esc).join(' → '):esc(n.id)} <button type="button" data-clear>清除</button></div>
      <details class="scene-docs"><summary>依章閱讀原文件（${options.docs.length} 份）</summary>${options.docs.map(d=>`<button type="button" data-source="${esc(d.path)}">${esc(window.documentDisplayTitle(d.title))}</button>`).join('')}</details></section>`;
    root.querySelectorAll('[data-node]').forEach(b=>b.onclick=()=>{select(b.dataset.node);root.querySelector(`[data-node="${selected}"]`)?.focus({preventScroll:true});});
    root.querySelectorAll('[data-follow]').forEach(b=>b.onclick=()=>{act='all';part='all';select(b.dataset.follow,true);root.querySelector(`[data-node="${selected}"]`)?.scrollIntoView({block:'nearest',inline:'nearest'});});
    root.querySelectorAll('[data-source]').forEach(b=>b.onclick=()=>source(b.dataset.source,b.dataset.heading,b.dataset.newWindow==='true'));
    root.querySelector('[data-atlas]').onclick=()=>source(data.atlas||options.docs.find(d=>d.path.includes('06-09_'))?.path);
    root.querySelector('[data-quests]').onclick=()=>source(options.allDocs.find(d=>d.path.includes('03-05_')).path);
    root.querySelector('#scenePart').onchange=e=>{part=e.target.value;act='all';if(part!=='all'&&get(selected).part!==Number(part))select(data.nodes.find(n=>n.part===Number(part)).id);else draw();};
    root.querySelector('#sceneAct').onchange=e=>{part='all';act=e.target.value;if(act!=='all'&&get(selected).act!==Number(act)){selected=data.nodes.find(n=>n.act===Number(act)).id;history.replaceState(null,'',`#scene=${selected}`);trail=[];}draw();};
    root.querySelector('#sceneAllEdges').onchange=e=>{showAll=e.target.checked;draw();};
    root.querySelectorAll('[data-zoom]').forEach(b=>b.onclick=()=>{zoom=Math.min(1.6,Math.max(.35,zoom+Number(b.dataset.zoom)));draw();});
    root.querySelector('[data-fit]').onclick=()=>{zoom=Math.min(1,Math.max(.35,root.querySelector('.scene-scroll').clientWidth/width));draw();};
    root.querySelector('[data-clear]').onclick=()=>{trail=[];draw();};
  }
  return {load,render(o){options=o;const id=new URLSearchParams(location.hash.slice(1)).get('scene');if(data?.nodes.some(n=>n.id===id))selected=id;draw();}};
})();
