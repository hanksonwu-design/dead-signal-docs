const assert=require('node:assert/strict');
const {mkdirSync,writeFileSync}=require('node:fs');
const {createRequire}=require('node:module');
const path=require('node:path');
const runtime=createRequire(path.resolve(process.argv[2],'__qa__.cjs'));
const {chromium}=runtime('playwright'),sharp=runtime('sharp');
const base=process.argv[3]||'http://127.0.0.1:8768',out=path.resolve(process.argv[4]);
mkdirSync(out,{recursive:true});
const checks=[],errors=[],consoleErrors=[],previewNotes=[],httpErrors=[];
const pass=label=>{checks.push(label);console.log('PASS',label);};
const ready=p=>p.locator('#loading').waitFor({state:'detached'});
async function choose(p,scene,route='',shot=''){
 await p.evaluate(hash=>{location.hash=hash;},new URLSearchParams({scene,route,shot}).toString());
 await p.waitForFunction(id=>document.querySelector('#node-id')?.textContent.startsWith(id+' ·'),shot||scene);
}
async function bounds(p){assert.deepEqual(await p.evaluate(()=>{
 const issues=[];if(document.documentElement.scrollWidth>innerWidth+1)issues.push('page overflow');
 for(const el of document.querySelectorAll('header,.left,.right,.flow-tools,.toolbar,#node-title'))if(el.scrollWidth>el.clientWidth+2)issues.push(el.id||el.className);
 return issues;
}),[]);}
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-unsafe-swiftshader']});
 try{
  const p=await browser.newPage({viewport:{width:1440,height:1000}});
  p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error')consoleErrors.push({text:m.text(),location:m.location()});});p.on('response',r=>{if(r.status()>=400)httpErrors.push({url:r.url(),status:r.status()});});
  await p.goto(base+'/building/#scene=R28&route=R28-R29-37&shot=R28-V02');await ready(p);
  assert.match(await p.locator('#node-id').innerText(),/R28-V02 · 探路次場景/);
  assert.equal(await p.locator('#node-title').innerText(),'舊接待後廊');
  assert.equal(await p.locator('#node-floor').innerText(),'B 棟 · 47F');pass('desktop R28 reception passage is a selectable 47F exploration subscene');
  assert.match(await p.locator('#exploration').innerText(),/封口|磚牆/);assert.match(await p.locator('#exploration').innerText(),/普通門閂/);assert.match(await p.locator('#exploration').innerText(),/門擋/);assert.match(await p.locator('#exploration').innerText(),/不扣資源/);pass('R28 exploration shows physical route choice, ordinary latch, door stop and recovery');
  assert.match(await p.locator('#gate').innerText(),/未開遠端終端|未開遠端/);assert.match(await p.locator('#gate').innerText(),/不要求 E5-07/);pass('R28 retains optional remote-index and evidence boundaries');
  await p.locator('#artwork-section').evaluate(el=>{el.open=true;});
  const close=p.locator('#images [data-image="R28-V02-C01"]');assert.equal(await close.count(),1);assert.match(await close.innerText(),/橫閂|門閂/);assert.match(await close.innerText(),/關閉回 R28-V02/);pass('new R28-V02-C01 close-up is listed with mechanism states and return destination');
  const source=p.locator('#node-links a').first();assert.match(decodeURIComponent(await source.getAttribute('href')),/subscene-r28-v02-script/);
  const popupWait=p.context().waitForEvent('page');await source.evaluate(a=>a.click());const popup=await popupWait;await popup.waitForLoadState();const staticURL=new URL(popup.url());staticURL.searchParams.set('static','');await popup.goto(staticURL.href);await popup.locator('#readerOverlay:not(.hidden)').waitFor();assert.match(await popup.locator('#readerContent').innerText(),/旁門後的舊接待後廊|舊接待後廊/);await popup.close();previewNotes.push('The supplied static-only localhost server has no /api/docs endpoint; app.js supports ?static to read docs.json, so source-reader QA uses that existing mode. Original link URL and anchor are unchanged.');pass('R28 screenplay source and subscene anchor open in the supported static document-reader mode');
  const canvas=p.locator('#canvas-host canvas');await canvas.scrollIntoViewIfNeeded();const stats=await sharp(await canvas.screenshot()).stats();assert(stats.channels.slice(0,3).some(c=>c.stdev>7));pass('desktop 3D canvas renders nonblank scene geometry');
  await p.locator('#flow-dock').evaluate(el=>{el.open=true;});await p.locator('#flow-locate').click();assert.equal(await p.locator('[data-flow-id="R28-V02"]').getAttribute('aria-pressed'),'true');await bounds(p);await p.locator('#exploration').scrollIntoViewIfNeeded();await p.screenshot({path:path.join(out,'reception-desktop.png'),fullPage:true});await close.scrollIntoViewIfNeeded();await p.screenshot({path:path.join(out,'reception-closeup-desktop.png'),fullPage:true});pass('R28 flow/model selection is synchronized and desktop layout fits');
  await choose(p,'U5','U5-U6-lower','T-U5-U6-01');assert.equal(await p.locator('#node-floor').innerText(),'B 棟 · 48F → 49F');assert.match(await p.locator('#node-id').innerText(),/探路次場景/);assert.match(await p.locator('#exploration').innerText(),/護板/);assert.match(await p.locator('#exploration').innerText(),/止擋/);assert.match(await p.locator('#exploration').innerText(),/無第三波/);assert.match(await p.locator('#gate').innerText(),/lower.u5.shutters_closed/);pass('U5 passage shows 48F-to-49F exploration, panel stop, no third wave and original shutter gate');
  assert.match(await p.locator('#images [data-image="T-U5-U6-01-C01"]').innerText(),/不拆承重踏面或護欄/);assert.match(await p.locator('#exploration').innerText(),/不要求.*目的房水箱完成/);pass('U5 passage retains fixed footing and does not solve or require U6 water puzzle');
  await choose(p,'U1');assert.match(await p.locator('#images [data-image="U1-C01"]').innerText(),/擋片/);assert.match(await p.locator('#images [data-image="U1-C01"]').innerText(),/初態|扶正|卡槽/);pass('U1 artwork requirements expose new optional splash-guard operation and visual states');
  await choose(p,'U3');assert.match(await p.locator('#images [data-image="U3-C07"]').innerText(),/鬆手|承重/);assert.match(await p.locator('#images [data-image="U3-C07"]').innerText(),/差分/);pass('U3 artwork requirements expose pliers hanging, release and persistent visual differences');
  for(const width of [390,320]){
   await p.setViewportSize({width,height:844});await choose(p,'R28','R28-R29-37','R28-V02');await bounds(p);assert(await p.locator('#exploration').isVisible());
   await p.locator('[data-step="R29"]').click();assert.match(await p.locator('#node-id').innerText(),/^R29 ·/);
   await choose(p,'U5','U5-U6-lower','T-U5-U6-01');await bounds(p);assert.match(await p.locator('#exploration').innerText(),/檢修護板/);
   if(width===390){await p.locator('#flow-locate').click();assert.equal(await p.locator('[data-flow-id="T-U5-U6-01"]').getAttribute('aria-pressed'),'true');await p.locator('#exploration').scrollIntoViewIfNeeded();await p.screenshot({path:path.join(out,'ascent-mobile-390.png'),fullPage:true});}
   pass(width+'px mobile passage selection, destination step and overflow checks');
  }

  assert.deepEqual(errors,[]);const appConsoleErrors=consoleErrors.filter(e=>!new URL(e.location.url||base).pathname.endsWith('/favicon.ico'));assert.deepEqual(appConsoleErrors,[]);if(consoleErrors.length)previewNotes.push('The static preview has no favicon.ico (HTTP 404); this is excluded from application console errors.');pass('no application JavaScript or console errors; preview favicon 404 is recorded separately');
 }finally{await browser.close();writeFileSync(path.join(out,'results.json'),JSON.stringify({checks,errors,appConsoleErrors:consoleErrors.filter(e=>!new URL(e.location.url||base).pathname.endsWith('/favicon.ico')),previewConsoleMessages:consoleErrors,httpErrors,previewNotes},null,2));}
})().catch(e=>{console.error(e);process.exitCode=1;});
