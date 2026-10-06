const assert=require('node:assert/strict');
const {readFileSync,mkdirSync,writeFileSync}=require('node:fs');
const {createRequire}=require('node:module');
const path=require('node:path');
const runtime=createRequire(path.resolve(process.argv[2],'__qa__.cjs'));
const {chromium}=runtime('playwright'),sharp=runtime('sharp');
const base=process.argv[3]||'http://127.0.0.1:8768';
const out=path.resolve(process.argv[4]);mkdirSync(out,{recursive:true});
const flow=JSON.parse(readFileSync(path.join(__dirname,'../scene-flow.json'),'utf8'));
const graph=JSON.parse(readFileSync(path.join(__dirname,'../scene_graph.json'),'utf8'));
const errors=[],checks=[];
const pass=name=>{checks.push(name);console.log('PASS',name);};
const names='.model-label:not([hidden]) .model-label-name:not([hidden])';
const route=flow.routes.find(r=>r.from==='R2'&&r.to==='R3');
async function open(page,scene='R2',routeId='',shot=''){
 await page.goto(base+'/building/#'+new URLSearchParams({scene,route:routeId,shot}));
 await page.locator('#loading').waitFor({state:'detached'});
 await page.waitForTimeout(250);
 assert(await page.locator('#error').isHidden());
}
async function layout(page){
 const issues=await page.evaluate(()=>{
  const issues=[],host=document.querySelector('#canvas-host').getBoundingClientRect();
  const head=document.querySelector('.view-head').getBoundingClientRect(),bar=document.querySelector('.toolbar').getBoundingClientRect();
  const labels=[...document.querySelectorAll('.model-label:not([hidden]),.floor-label:not([hidden])')];
  const overlap=(a,b)=>a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top;
  if(document.documentElement.scrollWidth>innerWidth+1)issues.push('page overflow');
  labels.forEach((el,i)=>{
   const r=el.getBoundingClientRect();
   if(r.left<host.left||r.right>host.right||r.top<host.top||r.bottom>host.bottom)issues.push('clipped: '+el.textContent);
   if(overlap(r,head)||overlap(r,bar))issues.push('controls: '+el.textContent);
   if(el.scrollWidth>el.clientWidth+1)issues.push('text overflow: '+el.textContent);
   for(const other of labels.slice(i+1))if(overlap(r,other.getBoundingClientRect()))issues.push('label overlap: '+el.textContent);
  });return issues;
 });assert.deepEqual(issues,[]);
}
async function pixels(page,name){
 const canvas=page.locator('#canvas-host canvas');await canvas.scrollIntoViewIfNeeded();
 const before=await canvas.screenshot();
 assert((await sharp(before).stats()).channels.slice(0,3).some(c=>c.stdev>7),'nonblank canvas');
 await page.locator('#front').click();await page.waitForTimeout(200);
 const a=await sharp(before).raw().toBuffer(),b=await sharp(await canvas.screenshot()).raw().toBuffer();
 assert.equal(a.length,b.length);let changed=0;for(let i=0;i<a.length;i++)if(Math.abs(a[i]-b[i])>10)changed++;
 assert(changed/a.length>.005,'camera interaction changes canvas pixels');
 await page.locator('#iso').click();await page.waitForTimeout(200);
 await layout(page);await page.locator('.view').screenshot({path:path.join(out,name+'.png')});
}
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-unsafe-swiftshader']});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}});
  page.on('pageerror',e=>errors.push(e.message));
  await open(page);
  const actual=await page.locator('.model-label').evaluateAll(es=>es.map(e=>({id:e.dataset.node||e.dataset.shot,name:e.querySelector('.model-label-name').textContent,aria:e.getAttribute('aria-label')})));
  assert.equal(actual.length,118);
  for(const item of actual){const source=[...graph.nodes,...flow.subscenes].find(s=>s.id===item.id);assert.equal(item.name,source.name);assert(item.aria.includes(item.id)&&item.aria.includes(source.name));}
  pass('all 46 physical scenes and 72 secondary scenes use canonical Chinese names and accessible IDs');
  for(let i=0;i<4;i++)await page.locator('#zoom-out').click();
  assert(await page.locator(names).count()<=1);
  await page.locator('#focus').click();await page.waitForTimeout(200);
  assert(await page.locator(names).count()>1);
  await layout(page);
  pass('zoomed-out overview stays compact while focusing expands nearby scene names');
  await open(page,'R2',route.id);
  assert(await page.locator('.model-label[data-node="R2"] .model-label-name').isVisible());
  assert(await page.locator('.model-label[data-shot] .model-label-name:visible').count()>0);
  const url=page.url();
  await page.getByRole('checkbox',{name:'場景名稱',exact:true}).uncheck();
  assert.equal(await page.locator(names).count(),0);assert(await page.locator('.model-label:visible').count()>0);assert.equal(page.url(),url);
  await page.locator('#scene-names').focus();await page.locator('#scene-names').press('Space');await page.waitForTimeout(100);
  assert(await page.locator(names).count()>0);
  await page.locator('.model-label[data-shot="T-R2-R3-02"] .model-label-name').click();
  assert.match(await page.locator('#node-title').innerText(),/住宅側平台/);
  assert.equal(new URLSearchParams(new URL(page.url()).hash.slice(1)).get('shot'),'T-R2-R3-02');
  pass('name toggle supports keyboard and clicking a Chinese subscene name keeps the original selection');
  await page.locator('#labels').uncheck();assert.equal(await page.locator('.model-label:visible').count(),0);
  await page.locator('#labels').check();await page.locator('#shots').uncheck();assert.equal(await page.locator('.model-label.shot:visible').count(),0);await page.locator('#shots').check();
  await page.locator('#scene-names').uncheck();
  await page.locator('#height').selectOption('actual');await page.waitForTimeout(100);assert.equal(await page.locator(names).count(),0);
  await page.locator('#height').selectOption('compressed');await page.locator('#scene-names').check();
  pass('ID and secondary toggles retain behavior and name preference survives geometry rebuilds');
  for(const width of [1920,1440,390,320]){
   await page.setViewportSize({width,height:width>800?1000:844});await open(page,'R2',route.id);
   await pixels(page,'route-names-'+width);
   const longest=[...flow.subscenes].sort((a,b)=>b.name.length-a.name.length)[0];
   await open(page,longest.node,longest.route,longest.id);await page.locator('#focus').click();await page.waitForTimeout(200);
   assert(await page.locator(`.model-label[data-shot="${longest.id}"] .model-label-name`).isVisible());
   await layout(page);await page.locator('.view').screenshot({path:path.join(out,'long-name-'+width+'.png')});
  }
  pass('desktop and mobile names wrap without overlap, canvas is nonblank and camera remains interactive');
  await page.setViewportSize({width:1440,height:1000});await open(page,'R2',route.id);
  for(let i=0;i<8;i++)await page.locator('#zoom-out').click();
  const other=page.locator('.model-label[data-node="R3"]');await other.focus();await page.waitForTimeout(100);
  assert(await other.locator('.model-label-name').isVisible());
  await page.locator('#zoom-out').focus();await other.hover();await page.waitForTimeout(100);
  assert(await other.locator('.model-label-name').isVisible());await layout(page);
  pass('keyboard focus and pointer hover reveal names even below the zoom threshold');
  assert.deepEqual(errors,[]);pass('no browser JavaScript errors');
  writeFileSync(path.join(out,'results.json'),JSON.stringify({checks,errors},null,2));
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
