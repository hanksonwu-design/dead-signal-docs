const assert=require('node:assert/strict');
const {createRequire}=require('node:module');
const fs=require('node:fs');
const path=require('node:path');
const runtime=createRequire(path.join(process.argv[2],'__qa__.cjs'));
const {chromium}=runtime('playwright');
const sharp=runtime('sharp');
const out=path.join(__dirname,'transition-model-browser');fs.mkdirSync(out,{recursive:true});
const base=process.argv[3]||'http://127.0.0.1:8765';
const errors=[],checks=[];
const pass=name=>{checks.push(name);console.log('PASS '+name);};
const key='dead-signal-building-sandbox-v2';
(async()=>{
 const browser=await chromium.launch({channel:process.env.PLAYWRIGHT_CHANNEL||'msedge',headless:true,args:['--enable-unsafe-swiftshader']});
 try{
  const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage();
  page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(30000);
  await page.goto(base+'/building/');await page.locator('#loading').waitFor({state:'detached'});
  assert.equal(await page.locator('#error').isVisible(),false);assert.equal(await page.locator('.room-tag').count(),26);
  assert.equal(await page.locator('#edge-count').innerText(),'30');
  const routes=await page.locator('#transition-picker option').evaluateAll(os=>os.filter(o=>o.value).map(o=>o.value));assert.equal(routes.length,6);
  let count=0;
  for(const route of routes){
   await page.locator('#transition-picker').selectOption(route);
   const shots=await page.locator('#transition-shots button[data-shot]:not([data-shot="-1"])').count();
   for(let i=0;i<shots;i++){
    await page.locator(`#transition-shots [data-shot="${i}"]`).click();
    assert.match(await page.locator('#view-subtitle').innerText(),/鏡位定位/);
    const stats=await sharp(await page.locator('#canvas-host canvas').screenshot()).stats();
    assert(stats.channels.slice(0,3).some(c=>c.stdev>8),'nonblank '+route+' '+i);count++;
   }
   await page.locator('#transition-shots [data-shot="-1"]').click();
   await page.screenshot({path:path.join(out,route+'.png')});
  }
  assert.equal(count,12);pass('six passages and twelve nonblank camera locations; 26 nodes / 30 edges');
  for(const [route,shot] of [['R11-R12',1],['R17-R18',0]]){
   await page.locator('#transition-picker').selectOption(route);await page.locator(`#transition-shots [data-shot="${shot}"]`).click();
   await page.screenshot({path:path.join(out,route+'-landing.png')});
   await page.locator('#height-mode').selectOption('actual');assert.match(await page.locator('#view-title').innerText(),new RegExp(route));
   await page.screenshot({path:path.join(out,route+'-actual.png')});await page.locator('#height-mode').selectOption('compressed');
  }
  pass('cross-floor platform views rebuild in compressed and equal-height modes');
  await page.locator('#transition-close').click();
  for(const floor of ['24','36']){await page.locator('#floor-only').selectOption(floor);await page.screenshot({path:path.join(out,'floor-'+floor+'.png')});}
  await page.locator('#floor-only').selectOption('all');
  await page.locator('#room-picker').selectOption('R2');await page.locator('#edit-mode-switch').click();
  await page.locator('#room-picker').selectOption('R2');await page.locator('#object-3d-up').click();
  let snapshot=await page.evaluate(k=>JSON.parse(localStorage.getItem(k)),key);assert.equal(snapshot.rooms.find(r=>r.id==='R2').floor,2);
  await page.locator('#stair-3d-undo').click();snapshot=await page.evaluate(k=>JSON.parse(localStorage.getItem(k)),key);assert.equal(snapshot.rooms.find(r=>r.id==='R2').floor,1);
  await page.locator('#stair-3d-redo').click();await page.locator('#stair-3d-undo').click();await page.locator('#stair-3d-done').click();
  pass('room floor editing, undo and redo remain operational');
  const original=await page.evaluate(k=>JSON.parse(localStorage.getItem(k)),key);
  await page.locator('#stair-link-start').click();await page.locator('#advanced-editor > summary').click();await page.locator('#edit-route-tab').click();
  await page.locator('#route-picker').selectOption('R13-R14-19');await page.locator('#route-width').fill('2.4');await page.locator('#route-apply').click();
  assert.equal((await page.evaluate(k=>JSON.parse(localStorage.getItem(k)),key)).edges.find(e=>e.id==='R13-R14-19').route.width,2.4);
  await page.locator('#edit-undo').click();assert.deepEqual(await page.evaluate(k=>JSON.parse(localStorage.getItem(k)),key),original);await page.locator('#edit-toggle').click();
  pass('corridor geometry editing and undo preserve the existing scene contract');
  await page.locator('#transition-picker').selectOption('R2-R3');await page.locator('#transition-shots [data-shot="0"]').click();
  assert.deepEqual(await page.evaluate(k=>JSON.parse(localStorage.getItem(k)),key),original);pass('passage inspection leaves the saved scene untouched');
  const custom=structuredClone(original);custom.rooms.find(r=>r.id==='R2').x+=4;
  const load=async object=>{await page.locator('#scene-file').setInputFiles({name:'previous-layout.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(object))});await page.waitForFunction(()=>document.getElementById('scene-file-status').textContent.includes('已載入 previous-layout.json'));};
  await load(custom);await page.locator('#transition-picker').selectOption('R2-R3');assert.match(await page.locator('#transition-copy').innerText(),/目前配置/);
  assert.deepEqual(await page.evaluate(k=>JSON.parse(localStorage.getItem(k)),key),custom);pass('old-format scene import preserves customized room coordinates');
  const deleted=structuredClone(custom);deleted.edges=deleted.edges.filter(e=>!(e.fromId==='R13'&&e.toId==='R14'));
  await load(deleted);assert(await page.locator('#transition-picker option[value="R13-R14"]').isDisabled());
  await load(original);assert.equal(await page.locator('#transition-picker option[value="R13-R14"]').isDisabled(),false);pass('deleted passage is disabled and restored on scene import');
  const downloadPromise=page.waitForEvent('download');await page.locator('#scene-export').click();const download=await downloadPromise;
  assert.deepEqual(JSON.parse(fs.readFileSync(await download.path(),'utf8')),original);pass('scene export round-trip preserves layout and connection data');
  await page.locator('#transition-picker').selectOption('R7-R8');await page.locator('#floor-only').selectOption('15');assert.equal(await page.locator('#transition-picker').inputValue(),'');
  await page.locator('#transition-picker').selectOption('R7-R8');await page.locator('#edit-mode-switch').click();assert.equal(await page.locator('#transition-picker').inputValue(),'');
  await page.locator('#stair-3d-done').click();pass('floor and edit controls leave passage inspection cleanly');
  const mobile=await context.newPage();mobile.on('pageerror',e=>errors.push(e.message));await mobile.setViewportSize({width:390,height:844});await mobile.goto(base+'/building/');await mobile.locator('#loading').waitFor({state:'detached'});
  await mobile.locator('#transition-picker').selectOption('R11-R12');await mobile.locator('#transition-shots [data-shot="1"]').click();await mobile.locator('#canvas-host').scrollIntoViewIfNeeded();
  assert(await mobile.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await mobile.screenshot({path:path.join(out,'mobile.png'),fullPage:true});pass('mobile passage controls and model render without horizontal overflow');
  assert.deepEqual(errors,[]);pass('no JavaScript page errors');
  fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({checks,errors},null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
