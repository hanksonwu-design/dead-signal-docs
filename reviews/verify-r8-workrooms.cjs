const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {createRequire} = require('node:module');
const runtime = createRequire(path.resolve(process.argv[2], '__qa__.cjs'));
const {chromium} = runtime('playwright');
const sharp = runtime('sharp');
const base = process.argv[3], out = path.resolve(process.argv[4]);
fs.mkdirSync(out, {recursive:true});
(async () => {
 const browser = await chromium.launch({channel:'chrome',headless:true,args:['--enable-unsafe-swiftshader']});
 const checks=[],errors=[];
 const pass = text => {checks.push(text);console.log('PASS',text);};
 try {
  const page = await browser.newPage({viewport:{width:1440,height:1000}});
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/building/#scene=R8');
  await page.waitForFunction(()=>document.querySelector('#node-id')?.textContent.startsWith('R8 · '));
  await page.waitForSelector('#canvas-host canvas');
  await page.waitForSelector('#loading',{state:'detached'});
  assert.match(await page.locator('#node-spatial').textContent(),/四間.*單人輪班/);
  for(const id of ['R8-V04','R8-V05','R8-V06','R8-C06'])assert.equal(await page.locator(`[data-image="${id}"]`).count(),1,id);
  assert.equal(await page.locator('[data-marker-select="R8-C06-item"]').count(),1);
  pass('R8 exposes all new image orders and its optional observation marker');
  await page.locator('#floor').selectOption('15');
  await page.locator('[data-select="R8"][data-select-shot=""]').click();
  await page.locator('#content-markers').uncheck();
  await page.locator('#labels').uncheck();
  await page.locator('#full-walls').check();
  for(const view of ['top','iso']){
   await page.locator('#'+view).click();await page.locator('#focus').click();
   await page.waitForTimeout(300);
   const canvas=page.locator('#canvas-host canvas');
   const buffer=await canvas.screenshot({path:path.join(out,`R8-${view}.png`)});
   assert((await sharp(buffer).stats()).channels.slice(0,3).some(c=>c.stdev>7));
  }
  pass('four-room cutaway renders nonblank with full partitions in top and perspective views');
  await page.setViewportSize({width:390,height:844});
  await page.locator('#focus').click();
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  await page.screenshot({path:path.join(out,'R8-mobile.png'),fullPage:true});
  pass('R8 remains usable on a narrow viewport');
  const doc='10_製作規格/10-03_製作規格_第二幕.md';
  await page.goto(base+'/?static#'+new URLSearchParams({doc,heading:'video-workrooms-r8-spec'}));
  await page.waitForSelector('#video-workrooms-r8-spec',{state:'attached'});
  assert.match(await page.locator('#readerContent').innerText(),/共用走道.*R8-V01/);
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  pass('published static document payload contains the four-room specification');
  assert.deepEqual(errors,[]);
  fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({checks,errors,scope:'Documentation and schematic model only; engine gameplay remains unimplemented.'},null,2)+'\n');
 } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
