export function sceneMatches(n, {part='all', act='all'}={}) {
 return (part==='all'||String(n.part)===String(part))&&(act==='all'||String(n.act)===String(act));
}

export function searchScenes(graph, flow, filters={}) {
 const query=(filters.query||'').trim().toLocaleLowerCase();
 const matches=(item,extra=[])=>{
  const text=[item.id,item.name,item.goal,item.floor.label,item.building.label,...extra].join(' ').toLocaleLowerCase();
  return (!query||text.includes(query))&&(filters.floor==null||item.floor.levels?.includes(filters.floor));
 };
 return graph.nodes.filter(n=>sceneMatches(n,filters)).flatMap(n=>{
  const main={...n,...flow.nodes.find(item=>item.id===n.id)};
  const children=flow.subscenes.filter(s=>s.node===n.id);
  return [
   ...(matches(main,[...n.tags,...n.quests,...Object.values(flow.images).filter(i=>i.node===n.id).flatMap(i=>[i.id,i.content])])?[{...main,node:n.id,shot:''}]:[]),
   ...(query||filters.floor!=null?children.filter(s=>matches(s,s.details.map(id=>flow.images[id]?.content))).map(s=>({...s,shot:s.id})):[])
  ];
 });
}

export function sceneArtwork(flow, current, selectedRoute) {
 const step=selectedRoute?.steps.find(s=>s.id===current.id);
 const image=step?.image||current.image;
 // Ending playback can reuse a place with a different camera, not its normal exploration assets.
 const alternate=image!==current.image;
 const ids=alternate?[image]:current.type?[image,...current.details]:Object.values(flow.images).filter(i=>i.node===current.id).map(i=>i.id);
 return [...new Set(ids)].map(id=>flow.images[id]).filter(Boolean);
}

export function connectedRoutes(routes, id) {
 return routes.filter(r=>r.from===id||r.to===id).map(r=>({...r,
  relation:r.from===id&&r.to===id?'原場景回返':r.from===id?'出口':'入口',
  canReturn:!!r.back
 }));
}
