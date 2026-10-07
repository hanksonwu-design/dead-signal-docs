const assert=require('node:assert/strict');
const {readFileSync,mkdirSync,writeFileSync}=require('node:fs');
const {createRequire}=require('node:module');
const path=require('node:path');
const runtime=createRequire(path.resolve(process.argv[2],'__qa__.cjs'));
const {chromium}=runtime('playwright'),sharp=runtime('sharp');
const base=process.argv[3]||'http://127.0.0.1:8768',out=path.resolve(process.argv[4]);
mkdirSync(out,{recursive:true});
const data=JSON.parse(readFileSync(path.join(__dirname,'../building/scene-markers.json'),'utf8')).markers;
const errors=[],checks=[];
const pass=name=>{checks.push(name);console.log('PASS',name);};
const visible='.content-marker:not([hidden])';
async function open(page,params={scene:'R2',route:'R2-R3-5'}){
 await page.goto('about:blank');
 await page.goto(base+'/building/#'+new URLSearchParams(params));
 await page.locator('#loading').waitFor({state:'detached'});await page.waitForTimeout(200);
 assert(await page.locator('#error').isHidden());
}
async function layout(page){
 const issues=await page.evaluate(()=>{
  const issues=[],host=document.querySelector('#canvas-host').getBoundingClientRect();
  const head=document.querySelector('.view-head').getBoundingClientRect(),bar=document.querySelector('.toolbar').getBoundingClientRect();
  const labels=[...document.querySelectorAll('.model-label:not([hidden]),.floor-label:not([hidden]),.content-marker:not([hidden])')];
  const overlap=(a,b)=>a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top;
  if(document.documentElement.scrollWidth>innerWidth+1)issues.push('page overflow');
  labels.forEach((el,i)=>{
   const r=el.getBoundingClientRect();
   if(r.left<host.left||r.right>host.right||r.top<host.top||r.bottom>host.bottom)issues.push('clipped: '+el.textContent);
   if(overlap(r,head)||overlap(r,bar))issues.push('controls: '+el.textContent);
   if(el.scrollWidth>el.clientWidth+1)issues.push('text overflow: '+el.textContent);
   for(const other of labels.slice(i+1))if(overlap(r,other.getBoundingClientRect()))issues.push('overlap: '+el.textContent);
  });return issues;
 });assert.deepEqual(issues,[]);
}
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-unsafe-swiftshader']});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}});page.on('pageerror',e=>errors.push(e.message));
  await open(page,{scene:'R2'});
  assert.equal(await page.locator('.content-marker').count(),data.filter(m=>!['R33','POST'].includes(m.node)).length);
  assert.equal(await page.locator(visible).count(),0);
  await page.locator('#focus').click();await page.waitForTimeout(200);
  assert(await page.locator(visible).count()>0);await layout(page);
  pass('zoom-aware canonical markers appear at close scale, not in the whole-building overview');
  for(const category of ['item','puzzle','event','horror','boss']){
   await page.locator('#marker-'+category).uncheck();
   assert.equal(await page.locator(`${visible}[data-category="${category}"]`).count(),0);
   await page.locator('#marker-'+category).check();
  }
  await page.locator('#content-markers').uncheck();assert.equal(await page.locator(visible).count(),0);
  await page.locator('#content-markers').focus();await page.locator('#content-markers').press('Space');
  await page.locator('#labels').uncheck();assert(await page.locator(visible).count()>0);
  await page.locator('#labels').check();pass('five category toggles, master toggle and independent scene labels work');
  await open(page);await page.locator('#focus').click();await page.waitForTimeout(200);
  const pin=page.locator(visible).first(),id=await pin.getAttribute('data-marker');
  await pin.click();assert.equal(new URLSearchParams(new URL(page.url()).hash.slice(1)).get('marker'),id);
  assert(await page.locator('#marker-detail').isVisible());
  const source=data.find(m=>m.id===id),links=await page.locator('#marker-detail a').evaluateAll(es=>es.map(e=>({url:e.href,target:e.target,rel:e.rel})));
  for(const l of links){assert.equal(l.target,'_blank');assert(l.rel.includes('noopener'));}
  assert.equal(new URLSearchParams(new URL(links[0].url).hash.slice(1)).get('heading'),source.heading);
  assert.equal(new URLSearchParams(new URL(links[1].url).hash.slice(1)).get('heading'),source.specHeading);
  const selectedUrl=page.url();await page.reload();await page.locator('#loading').waitFor({state:'detached'});
  assert.equal(page.url(),selectedUrl);assert(await page.locator('#marker-detail').isVisible());
  await page.locator('#marker-'+source.category).uncheck();assert(await page.locator('#marker-detail').isHidden());
  assert(!new URLSearchParams(new URL(page.url()).hash.slice(1)).has('marker'));
  pass('pin selection, original/spec links, deep links and selection cleanup remain correct');
  // The stored route ID is resolved from the secondary-scene data, not inferred from numbering.
  const flow=JSON.parse(readFileSync(path.join(__dirname,'../scene-flow.json'),'utf8'));
  const elevator=flow.subscenes.find(s=>s.id==='T-R15-R16-03');
  await open(page,{scene:elevator.node,route:elevator.route,shot:elevator.id});
  assert.match(await page.locator('#marker-list').innerText(),/金屬倒影中的開閘/);
  await page.locator('[data-marker-select="T-R15-R16-03-puzzle"]').click();
  assert.match(await page.locator('#marker-detail').innerText(),/30F/);
  assert.match(await page.locator('#marker-detail').innerText(),/復原/);
  await page.locator('#shots').uncheck();
  const visibleIds=await page.locator(visible).evaluateAll(es=>es.map(e=>e.dataset.marker));
  assert(visibleIds.every(id=>!data.find(m=>m.id===id).shot));await page.locator('#shots').check();
  await page.locator('#height').selectOption('actual');assert(await page.locator('#marker-detail').isVisible());
  await page.locator('#floor').selectOption('1');await page.waitForTimeout(100);assert(await page.locator('#marker-detail').isHidden());
  const allowed=new Set(flow.nodes.filter(n=>n.floor.levels.includes(1)).map(n=>n.id));
  const allowedShots=new Set(flow.subscenes.filter(s=>s.floor.levels.includes(1)).map(s=>s.id));
  for(const id of await page.locator(visible).evaluateAll(es=>es.map(e=>e.dataset.marker))){const m=data.find(m=>m.id===id);assert(m.shot?allowedShots.has(m.shot):allowed.has(m.node));}
  pass('transition operations, elevator horror, secondary visibility, floor filters and rebuilds preserve context');
  for(const scene of ['R11','R26','R32','R33','POST']){
   await open(page,{scene});assert(await page.locator('#marker-list button').count()>0);
   if(['R33','POST'].includes(scene))assert.equal(await page.locator(`.content-marker[data-marker^="${scene}-"]`).count(),0);
   else if(scene==='R11'){
    assert.equal(await page.locator('#marker-list [data-category="boss"]').count(),0);
    assert.match(await page.locator('#marker-list').innerText(),/訊號遭遇/);
   }else assert.equal(await page.locator('#marker-list [data-category="boss"]').count(),1);
  }
  await open(page,{scene:'R2',marker:'R32-V01-boss'});assert(await page.locator('#marker-detail').isHidden());
  await open(page,{scene:'R2',marker:'does-not-exist'});assert(await page.locator('#marker-detail').isHidden());
  pass('boss encounters and nonphysical endings are distinct; mismatched or invalid marker URLs are discarded');
  for(const image of ['T-R2-R3-01','R23-V01','T-R24-R25-01','U6-V01','U6b-V01','R25-C03','R24-C02','R7-V01','U2-V01']){
   const m=data.find(m=>m.id===image+'-horror');
   const params={scene:m.node,marker:m.id};
   if(m.shot){params.shot=m.shot;params.route=flow.subscenes.find(s=>s.id===m.shot).route;}
   await open(page,params);
   assert((await page.locator('#marker-detail .marker-meta').innerText()).includes(m.timing));
   assert((await page.locator(`[data-marker-select="${m.id}"]`).innerText()).includes(m.timing));
   assert((await page.locator(`.content-marker[data-marker="${m.id}"]`).getAttribute('title')).includes(m.timing));
   await page.locator('#focus').click();await page.waitForTimeout(200);await layout(page);
  }
  pass('mainline and optional labels resolve across all six HP cues, first-arrival R7 and the revised mirror beat');
  for(const id of ['R18-V02-horror','R19-V01-horror','R20-V03-horror','R25-V02-puzzle','U2b-V02-horror','U5-V02-horror']){
   const m=data.find(m=>m.id===id);
   await open(page,{scene:m.node,marker:id});
   await page.locator('#marker-detail summary').click();
   assert((await page.locator('#marker-detail').innerText()).includes('波形'),id);
   assert.equal(m.category,m.node==='R25'?'puzzle':'horror');
   await page.locator('#focus').click();await page.waitForTimeout(200);await layout(page);
  }
  pass('hearing and cover markers use canonical production layers, with speaker timing classified as a puzzle');
  for(const width of [1440,390]){
   await page.setViewportSize({width,height:width>800?1000:844});
   for(const [scene,marker] of [['R19','R19-V01-horror'],['R25','R25-V02-puzzle']]){
    await open(page,{scene,marker});await page.locator('#focus').click();await page.waitForTimeout(200);
    await layout(page);
    assert(await page.locator(`.content-marker[data-marker="${marker}"]`).isVisible(),`${marker} at ${width}px`);
    await page.screenshot({path:path.join(out,`hearing-${scene.toLowerCase()}-${width}.png`),fullPage:true});
   }
  }
  for(const width of [1440,390]){
   await page.setViewportSize({width,height:width>800?1000:844});
   for(const scene of ['R23','U2']){
    await open(page,{scene,marker:scene+'-V01-horror'});await page.locator('#focus').click();await page.waitForTimeout(200);
    await layout(page);assert(await page.locator(`.content-marker[data-marker="${scene}-V01-horror"]`).isVisible());
    await page.screenshot({path:path.join(out,`horror-${scene.toLowerCase()}-${width}.png`),fullPage:true});
   }
  }
  for(const width of [1920,1440,390,320]){
   await page.setViewportSize({width,height:width>800?1000:844});await open(page);
   await page.locator('[data-marker-select="R2-D01-item"]').click();await page.waitForTimeout(200);
   await page.locator('#focus').click();await page.waitForTimeout(200);
   assert(await page.locator(visible).count()>0);await layout(page);
   assert(await page.locator('.content-marker[data-marker="R2-D01-item"]').isVisible(),'selected item remains in frame at every viewport');
   const canvas=page.locator('#canvas-host canvas');const before=await canvas.screenshot();
   assert((await sharp(before).stats()).channels.slice(0,3).some(c=>c.stdev>7));
   await page.locator('.view').screenshot({path:path.join(out,`markers-${width}.png`)});
   await page.screenshot({path:path.join(out,`page-${width}.png`),fullPage:true});
   const a=await sharp(before).raw().toBuffer();await page.locator('#front').click();await page.waitForTimeout(200);
   const b=await sharp(await canvas.screenshot()).raw().toBuffer();let changed=0;
   assert.equal(a.length,b.length);for(let i=0;i<a.length;i++)if(Math.abs(a[i]-b[i])>10)changed++;
   assert(changed/a.length>.005);await layout(page);
  }
  pass('desktop/mobile labels do not overlap; canvas renders and camera interaction changes pixels');
  assert.deepEqual(errors,[]);pass('no browser JavaScript errors');
  writeFileSync(path.join(out,'results.json'),JSON.stringify({checks,errors},null,2));
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
