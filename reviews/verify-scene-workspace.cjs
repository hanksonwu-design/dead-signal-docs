const assert=require('node:assert/strict');
const {readFileSync,mkdirSync,writeFileSync}=require('node:fs');
const {createRequire}=require('node:module');
const path=require('node:path');
const runtime=createRequire(path.resolve(process.argv[2],'__qa__.cjs'));
const {chromium}=runtime('playwright'),sharp=runtime('sharp');
const base=process.argv[3]||'http://127.0.0.1:8768',out=path.resolve(process.argv[4]);
mkdirSync(out,{recursive:true});
const graph=JSON.parse(readFileSync(path.join(__dirname,'../scene_graph.json'),'utf8'));
const flow=JSON.parse(readFileSync(path.join(__dirname,'../scene-flow.json'),'utf8'));
const checks=[],errors=[];
const pass=label=>{checks.push(label);console.log('PASS',label);};
const ready=p=>p.locator('#loading').waitFor({state:'detached'});
async function choose(p,scene,route='',shot=''){
 await p.evaluate(hash=>{location.hash=hash;},new URLSearchParams({scene,route,shot}).toString());
 await p.waitForFunction(id=>document.querySelector('#node-id')?.textContent.startsWith(id+' ·'),shot||scene);
}
async function bounds(p){assert.deepEqual(await p.evaluate(()=>{
 const issues=[];
 if(document.documentElement.scrollWidth>innerWidth+1)issues.push('page overflow');
 for(const el of document.querySelectorAll('header,.left,.right,.flow-tools,.toolbar,#node-title'))if(el.scrollWidth>el.clientWidth+2)issues.push(el.id||el.className);
 return issues;
}),[]);}
async function pixels(p){
 const canvas=p.locator('#canvas-host canvas');await canvas.scrollIntoViewIfNeeded();
 const before=await canvas.screenshot();assert((await sharp(before).stats()).channels.slice(0,3).some(c=>c.stdev>7));
 await p.locator('#front').click();await p.waitForTimeout(200);
 const a=await sharp(before).raw().toBuffer(),b=await sharp(await canvas.screenshot()).raw().toBuffer();
 assert.equal(a.length,b.length);let changes=0;for(let i=0;i<a.length;i++)if(Math.abs(a[i]-b[i])>10)changes++;
 assert(changes/a.length>.005);await p.locator('#iso').click();
}
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-unsafe-swiftshader']});
 try{
  const p=await browser.newPage({viewport:{width:1440,height:1000}});p.on('pageerror',e=>errors.push(e.message));
  await p.goto(base+'/#scene=R24&route=R24-R25-33&shot=T-R24-R25-01&direction=return');await ready(p);
  assert(new URL(p.url()).pathname.endsWith('/building/'));
  assert.equal(await p.locator('#reverse').getAttribute('aria-pressed'),'true');
  assert.equal(await p.locator('#node-floor').innerText(),'B 棟 · 44F → 43F');
  await p.reload();await ready(p);assert.equal(await p.locator('#reverse').getAttribute('aria-pressed'),'true');
  pass('legacy bookmarks redirect with scene, route, secondary scene and return direction preserved');
  await choose(p,'R2','R2-R3-5');
  assert.deepEqual(await p.locator('#phases li').allTextContents(),graph.phases.R2);
  await p.locator('#flow-dock>summary').click();
  await p.locator('[data-flow-id="T-R2-R3-01"]').click();
  assert.match(await p.locator('#node-id').innerText(),/^T-R2-R3-01/);
  assert.equal(new URLSearchParams(new URL(p.url()).hash.slice(1)).get('shot'),'T-R2-R3-01');
  assert.equal(await p.locator('[data-step="T-R2-R3-01"]').getAttribute('aria-pressed'),'true');
  await p.locator('[data-step="R3"]').click();
  assert.equal(await p.locator('[data-flow-id="R3"]').getAttribute('aria-pressed'),'true');
  await p.locator('#flow-locate').click();await pixels(p);await bounds(p);
  await p.screenshot({path:path.join(out,'workspace-1440.png'),fullPage:true});
  pass('flow diagram and model share ordered transitions, selection and a nonblank interactive canvas');
  await choose(p,'R7');
  assert.deepEqual(await p.locator('#quests li').allTextContents(),graph.nodes.find(n=>n.id==='R7').quests);
  assert.equal(await p.locator('[data-connection]').count(),flow.routes.filter(r=>r.from==='R7'||r.to==='R7').length);
  const incoming=flow.routes.find(r=>r.to==='R7');await p.locator(`[data-connection="${incoming.id}"]`).click();assert.equal(await p.locator('#route').inputValue(),incoming.id);
  await p.locator('#artwork-section>summary').click();
  const covered=new Set();
  for(const n of flow.nodes){await choose(p,n.id);for(const id of await p.locator('#images [data-image]').evaluateAll(es=>es.map(e=>e.dataset.image)))covered.add(id);}
  assert.equal(covered.size,523);
  await choose(p,'R33','R33-P1-43');await p.locator('[data-step="P1"]').click();
  assert.deepEqual(await p.locator('#images [data-image]').evaluateAll(es=>es.map(e=>e.dataset.image)),['R33-V02']);
  assert.match(await p.locator('#presentation-note').innerText(),/非可步行路線/);
  pass('all 523 artwork work orders, authored phases, quests and nonphysical ending context remain available');
  await p.locator('#part').selectOption('2');
  assert.equal(await p.locator('#scene-list [data-select]').count(),graph.nodes.filter(n=>n.part===2).length);
  await p.locator('#part').selectOption('all');await p.locator('#search').fill('SQ-S');
  assert.deepEqual(await p.locator('#scene-list [data-select]').evaluateAll(es=>es.map(e=>e.dataset.select)),['R7','R8','R9']);
  await p.locator('#search').fill('T-R2-R3-01');await p.locator('#scene-list [data-select-shot="T-R2-R3-01"]').click();
  assert.match(await p.locator('#node-id').innerText(),/^T-R2-R3-01/);
  await p.locator('#search').fill('no-such-scene');assert(await p.locator('#empty').isVisible());assert(await p.locator('#flow-empty').isVisible());
  await p.locator('#search').fill('');await p.locator('#flow-range').selectOption('filtered');
  assert.equal(await p.locator('.flow-node.main').count(),48);assert.equal(await p.locator('.flow-node.subscene').count(),72);
  await p.locator('#flow-all-edges').check();await p.locator('#flow-fit').click();await p.locator('#flow-plus').click();await p.locator('#flow-minus').click();
  pass('part, goal and quest search, secondary-scene lookup, empty results and whole-game flow work');
  for(const width of [1920,390,320]){
   await p.setViewportSize({width,height:width>800?1080:844});await choose(p,'R2','R2-R3-5');
   await p.locator('#flow-range').selectOption('act');await bounds(p);await pixels(p);
   await p.locator('#flow-locate').click();await p.locator('#flow-dock').screenshot({path:path.join(out,'flow-'+width+'.png')});
   await p.screenshot({path:path.join(out,'workspace-'+width+'.png'),fullPage:true});
  }
  pass('desktop and 390/320px mobile layouts fit and retain interactive model/flow access');
  const popupWait=p.context().waitForEvent('page');await p.locator('#node-links a').first().evaluate(a=>a.click());
  const popup=await popupWait;await popup.waitForLoadState();
  await popup.locator('#readerOverlay:not(.hidden)').waitFor();await popup.close();
  await p.setViewportSize({width:1440,height:1000});
  await p.evaluate(()=>{document.querySelector('canvas').getContext('webgl2').getExtension('WEBGL_lose_context').loseContext();});
  await p.locator('#fallback-status').waitFor();assert(await p.locator('.view').isHidden());
  await p.locator('[data-flow-id="R3"]').click();assert.match(await p.locator('#node-id').innerText(),/^R3/);
  await p.screenshot({path:path.join(out,'context-loss.png'),fullPage:true});
  pass('source documents open separately and context loss preserves a working flow interface');
  await p.goto(base);await p.locator('#folderNav a[href="building/"]').waitFor();
  assert.equal(await p.locator('script[src*="scene-browser"]').count(),0);
  await p.locator('#folderNav a[href="building/"]').click();await ready(p);
  await p.locator('#flow-link').click();await p.locator('#folderNav').waitFor();await p.goBack();await ready(p);await pixels(p);
  pass('single navigation entry replaces the old page; browser Back restores the model');
 }finally{await browser.close();}
 const noGL=await chromium.launch({channel:'chrome',headless:true,args:['--disable-webgl']});
 try{
  const p=await noGL.newPage({viewport:{width:390,height:844}});p.on('pageerror',e=>errors.push(e.message));
  await p.goto(base+'/building/#scene=R2&route=R2-R3-5');await ready(p);
  assert(await p.locator('#fallback-status').isVisible());assert(await p.locator('.view').isHidden());
  await p.locator('[data-flow-id="T-R2-R3-02"]').focus();await p.locator('[data-flow-id="T-R2-R3-02"]').press('Enter');
  assert.match(await p.locator('#node-id').innerText(),/^T-R2-R3-02/);
  await p.locator('#search').fill('SQ-S');assert.equal(await p.locator('#scene-list [data-select]').count(),3);
  await p.locator('#search').fill('');await bounds(p);
  await p.screenshot({path:path.join(out,'no-webgl-mobile.png'),fullPage:true});
  pass('no-WebGL startup retains keyboard selection, filtering and full details on mobile');
 }finally{await noGL.close();}
 assert.deepEqual(errors,[]);pass('no JavaScript errors');
 writeFileSync(path.join(out,'results.json'),JSON.stringify({checks,errors},null,2));
})().catch(e=>{console.error(e);process.exitCode=1;});
