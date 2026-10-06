const assert=require('node:assert/strict');
const {createRequire}=require('node:module');
const {mkdirSync,writeFileSync}=require('node:fs');
const path=require('node:path');
const runtime=createRequire(path.resolve(process.argv[2],'__qa__.cjs'));
const {chromium}=runtime('playwright'),sharp=runtime('sharp');
const base=process.argv[3],out=path.resolve(process.argv[4]);mkdirSync(out,{recursive:true});
const checks=[],errors=[];const pass=t=>{checks.push(t);console.log('PASS',t);};
const ready=p=>p.locator('#loading').waitFor({state:'detached'});
async function diff(a,b){const aa=await sharp(a).raw().toBuffer(),bb=await sharp(b).raw().toBuffer();assert.equal(aa.length,bb.length);let changed=0;for(let i=0;i<aa.length;i++)if(Math.abs(aa[i]-bb[i])>10)changed++;return changed/aa.length;}
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-unsafe-swiftshader']});
 try{
  const p=await browser.newPage({viewport:{width:1440,height:1000}});p.on('pageerror',e=>errors.push(e.message));
  await p.goto(base+'/building/#scene=R3');await ready(p);
  await p.locator('#floor').selectOption('2');await p.locator('#scene-list [data-select="R3"][data-select-shot=""]').click();
  for(const id of ['labels','content-markers','floor-guides'])await p.locator('#'+id).uncheck();
  await p.locator('#focus').click();await p.waitForTimeout(200);
  const canvas=p.locator('canvas'),before=await canvas.screenshot();
  assert((await sharp(before).stats()).channels.slice(0,3).some(c=>c.stdev>7));
  await p.locator('#human-scale').uncheck();await p.waitForTimeout(100);
  assert(await diff(before,await canvas.screenshot())>.00002,'human and metre ruler render');
  await p.locator('#human-scale').check();
  await p.screenshot({path:path.join(out,'dorm-human-1440.png'),fullPage:true});
  await p.locator('#full-walls').uncheck();await p.waitForTimeout(100);
  assert(await diff(before,await canvas.screenshot())>.001,'wall height toggle changes geometry');
  assert(!(await p.locator('#full-walls').isChecked()));
  await p.locator('#height').selectOption('actual');assert(!(await p.locator('#full-walls').isChecked()));
  assert.match(await p.locator('#metric-size').innerText(),/20 × 14 公尺/);
  await p.locator('#full-walls').check();
  pass('metre furniture, human/ruler toggle and independent wall cutaway render without losing selection');
  for(const scene of ['R2','R7','R16','R19','U6']){
   await p.evaluate(id=>{location.hash='scene='+id;},scene);
   await p.waitForFunction(id=>document.querySelector('#node-id').textContent.startsWith(id+' ·'),scene);
   await p.locator('#scope').selectOption('route');await p.locator('#focus').click();
   await p.screenshot({path:path.join(out,scene+'-1440.png'),fullPage:true});
  }
  await p.evaluate(()=>{location.hash='scene=R15&route=R15-R16-22&shot=T-R15-R16-03';});
  await p.waitForFunction(()=>document.querySelector('#node-id').textContent.startsWith('T-R15-R16-03'));
  assert.match(await p.locator('#metric-size').innerText(),/1.6 × 1.8 × 2.2/);
  await p.locator('#focus').click();await p.locator('#zoom-in').click();
  await p.screenshot({path:path.join(out,'lift-1440.png'),fullPage:true});
  pass('kitchen, workstations, server racks, restraint chair, water tank and gated lift remain selectable');
  for(const width of [390,320]){
   await p.setViewportSize({width,height:844});await p.evaluate(()=>{location.hash='scene=R3';});
   await p.waitForFunction(()=>document.querySelector('#node-id').textContent.startsWith('R3 ·'));
   await p.locator('#focus').click();await p.waitForTimeout(200);
   assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
   await canvas.scrollIntoViewIfNeeded();const before=await canvas.screenshot();
   assert((await sharp(before).stats()).channels.slice(0,3).some(c=>c.stdev>7));
   await p.locator('#front').click();await p.waitForTimeout(200);assert(await diff(before,await canvas.screenshot())>.005);
   await p.locator('#iso').click();await p.screenshot({path:path.join(out,'dorm-'+width+'.png'),fullPage:true});
  }
  pass('mobile canvas stays nonblank, responds to camera controls and has no horizontal overflow');
  assert.deepEqual(errors,[]);pass('no browser errors');
  writeFileSync(path.join(out,'results.json'),JSON.stringify({checks,errors},null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
