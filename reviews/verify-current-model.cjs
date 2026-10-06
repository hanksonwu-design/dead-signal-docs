const assert=require('node:assert/strict');
const {readFileSync,mkdirSync,writeFileSync}=require('node:fs');
const {createRequire}=require('node:module');
const {pathToFileURL}=require('node:url');
const path=require('node:path');
const runtime=createRequire(path.resolve(process.argv[2],'__qa__.cjs'));
const {chromium}=runtime('playwright'),sharp=runtime('sharp');
const base=process.argv[3]||'http://127.0.0.1:8767';
const out=path.resolve(process.argv[4]);mkdirSync(out,{recursive:true});
const root=path.resolve(__dirname,'..'),flow=JSON.parse(readFileSync(path.join(root,'scene-flow.json'),'utf8'));
const errors=[],checks=[];
const pass=name=>{checks.push(name);console.log('PASS',name);};
const params=(scene,route='',shot='')=>new URLSearchParams({scene,route,shot}).toString();
async function choose(page,scene,route='',shot=''){
 await page.evaluate(hash=>{location.hash=hash;},params(scene,route,shot));
 await page.waitForFunction(id=>document.querySelector('#node-id').textContent.startsWith(id+' · '),shot||scene);
}
async function bounds(page){
 const bad=await page.evaluate(()=>{
  const bad=[];if(document.documentElement.scrollWidth>innerWidth+1)bad.push('page');
  for(const el of document.querySelectorAll('header,.left,.right,#node-title,.toolbar,.controls'))if(el.scrollWidth>el.clientWidth+2)bad.push(el.id||el.className||el.tagName);
  return bad;
 });assert.deepEqual(bad,[]);
}
async function canvas(page,name){
 const c=page.locator('#canvas-host canvas');await c.scrollIntoViewIfNeeded();
 const before=await c.screenshot(),stats=await sharp(before).stats();assert(stats.channels.slice(0,3).some(v=>v.stdev>7),'nonblank scene');
 await page.locator('#front').click();await page.waitForTimeout(400);
 const after=await c.screenshot(),a=await sharp(before).raw().toBuffer(),b=await sharp(after).raw().toBuffer();assert.equal(a.length,b.length);let changed=0;for(let i=0;i<a.length;i++)if(Math.abs(a[i]-b[i])>10)changed++;
 assert(changed/a.length>.005,'camera changes rendered pixels');
 await page.locator('#iso').click();await page.waitForTimeout(300);await page.screenshot({path:path.join(out,name+'.png'),fullPage:true});
}
async function floorGuides(page,name){
 const toggle=page.getByRole('checkbox',{name:'樓層線框'}),c=page.locator('#canvas-host canvas');
 assert(await toggle.isChecked());
 assert(await page.locator('.floor-label:visible').count()>0);
 const url=page.url(),floor=await page.locator('#node-floor').innerText();
 await c.scrollIntoViewIfNeeded();const before=await sharp(await c.screenshot()).raw().toBuffer();
 await page.screenshot({path:path.join(out,name.replace('guides-off-','guides-on-')+'.png'),fullPage:true});
 await toggle.uncheck();await page.waitForTimeout(100);
 assert.equal(await page.locator('.floor-label:visible').count(),0);
 assert(await page.locator('.model-label[data-node]:visible').count()>0);
 assert.equal(await page.locator('#node-floor').innerText(),floor);assert.equal(page.url(),url);
 assert(await page.locator('#labels').isChecked());assert(await page.locator('#shots').isChecked());
 await c.scrollIntoViewIfNeeded();const off=await c.screenshot(),after=await sharp(off).raw().toBuffer();
 assert((await sharp(off).stats()).channels.slice(0,3).some(v=>v.stdev>7),'scenes remain nonblank without guides');
 assert.equal(before.length,after.length);let changed=0;for(let i=0;i<before.length;i++)if(Math.abs(before[i]-after[i])>10)changed++;
 assert(changed/before.length>.001,'guide toggle changes rendered lines');
 await bounds(page);await page.screenshot({path:path.join(out,name+'.png'),fullPage:true});
 await toggle.focus();await toggle.press('Space');await page.waitForTimeout(100);
 assert(await toggle.isChecked());assert(await page.locator('.floor-label:visible').count()>0);
}
(async()=>{
 const {layout,offsets}=await import(pathToFileURL(path.join(root,'building/spatial.js')));
 const model=JSON.parse(readFileSync(path.join(root,'building/scene-data.json'),'utf8'));
 const {createEditorStore}=await import(pathToFileURL(path.join(root,'building/editor-state.js')));
 const saved=createEditorStore(model.nodes,layout,{...offsets},model.edges,{allowCustomRooms:true,platformLinks:[]}).snapshot();
 saved.rooms.find(r=>r.id==='R2').x+=3.5;
 saved.rooms.push({id:'R23',custom:true,name:'舊存檔自訂房間',x:30,z:0,floor:2,w:5,d:5,offset:0});
 const savedText=JSON.stringify(saved),key='dead-signal-building-sandbox-v2';
 const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-unsafe-swiftshader']});
 try {
  const context=await browser.newContext({viewport:{width:1440,height:1000}});
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base);await page.evaluate(({key,savedText})=>localStorage.setItem(key,savedText),{key,savedText});
  await page.goto(base+'/building/#scene=R6');await page.waitForSelector('#canvas-host canvas');await page.waitForSelector('#loading',{state:'detached'});
  assert(await page.locator('#error').isHidden());assert.equal(await page.locator('#scene-list [data-select]').count(),48);
  assert.equal(await page.locator('#editor-link,a[href*="editor.html"]').count(),0);
  assert(await page.locator('#flow-link').isVisible());
  pass('formal model navigation contains no archived sandbox entry');
  assert.equal(await page.locator('.model-label[data-node]').count(),46);assert.equal(await page.locator('.model-label[data-shot]').count(),72);
  assert.match(await page.locator('#counts').innerText(),/48.*72.*56/);await bounds(page);await canvas(page,'all-1440');
  pass('full B3-50F model renders 48 beats, 46 physical nodes and 72 secondary markers');
  await floorGuides(page,'guides-off-1440');
  await page.locator('#floor-guides').uncheck();
  for(const [id,value] of [['height','actual'],['floor','15'],['scope','route'],['scope','all'],['height','compressed']]){
   await page.locator('#'+id).selectOption(value);await page.waitForTimeout(100);
   assert(!(await page.locator('#floor-guides').isChecked()));assert.equal(await page.locator('.floor-label:visible').count(),0);
  }
  await choose(page,'R6');await page.locator('#floor-guides').check();
  pass('floor guides toggle independently, respond to keyboard and remain off through filters and model rebuilds');
  for(const n of flow.nodes){await choose(page,n.id);assert.equal(await page.locator('#node-floor').innerText(),`${n.building.label} · ${n.floor.label}`);const source=new URL(await page.locator('#node-links a').first().getAttribute('href'),page.url());assert.equal(new URLSearchParams(source.hash.slice(1)).get('heading'),'node-'+n.id.toLowerCase()+'-script');}
  pass('every main scene has its canonical floor and story link');
  for(const s of flow.subscenes){await choose(page,s.node,s.route,s.id);assert.equal(await page.locator('#node-floor').innerText(),`${s.building.label} · ${s.floor.label}`);assert.match(await page.locator('#node-links').innerText(),new RegExp(s.id));}
  pass('every secondary view is selectable with its own image and floor');
  await choose(page,'R24','R24-R25-33','T-R24-R25-01');await page.locator('#reverse').click();assert.equal(await page.locator('#node-floor').innerText(),'B 棟 · 44F → 43F');assert.equal(await page.locator('#steps [data-step]').first().getAttribute('data-step'),'R25');
  await page.reload();await page.waitForSelector('#loading',{state:'detached'});assert.equal(await page.locator('#reverse').getAttribute('aria-pressed'),'true');
  await page.screenshot({path:path.join(out,'dining-stair-1440.png'),fullPage:true});
  pass('return direction and deep links preserve the 43F-44F dining stair');
  await choose(page,'R11','R11-R12-16','T-R11-R12-01');assert.equal(await page.locator('#node-floor').innerText(),'B 棟 · 16F');assert(await page.locator('#reverse').isDisabled());
  await choose(page,'R17','R17-R18-26','T-R17-R18-04');assert.equal(await page.locator('#node-floor').innerText(),'B 棟 · 36F');await page.screenshot({path:path.join(out,'landing-36.png'),fullPage:true});
  assert((await page.locator('#exploration').innerText()).includes(flow.subscenes.find(s=>s.id==='T-R17-R18-04').play.clue));
  await page.locator('#floor').selectOption('36');await page.locator('[data-step="T-R17-R18-04"]').click();assert.equal(await page.locator('#floor').inputValue(),'36');
  await page.locator('#floor').selectOption('all');
  pass('exact 16F and 36F landings retain exploration clues, floor filtering and one-way rules');
  await choose(page,'R33','R33-P1-43');assert.match(await page.locator('#presentation-note').innerText(),/不配置實體房間/);assert.match(await page.locator('#route-floor').innerText(),/肉身回返/);
  await choose(page,'U4','U4-U4-lower');assert.match(await page.locator('#presentation-note').innerText(),/原場景回返/);
  pass('ending and repeated-view routes are explicitly nonphysical');
  await choose(page,'U6b');await page.locator('#scope').selectOption('all');await page.locator('#floor').selectOption('50');await page.locator('#top').click();await page.waitForTimeout(300);await bounds(page);await page.screenshot({path:path.join(out,'floor-50-top.png'),fullPage:true});
  await page.locator('#height').selectOption('actual');await canvas(page,'floor-50-equal-height');
  await page.locator('#floor').selectOption('47');await canvas(page,'spine-47');
  pass('50F core and the 47F trade rooms render in both height modes');
  for(const f of [23,27,31,32,37,40,41,42,44,45,46,47,48,49,50]){
   await page.locator('#floor').selectOption(String(f));
   const shown=await page.locator('#scene-list [data-select]').evaluateAll(es=>es.map(e=>e.dataset.select).sort());
   const expected=flow.nodes.filter(n=>n.floor.levels?.includes(f)).map(n=>n.id).sort();
   assert.deepEqual(shown,expected,`${f}F scene filter`);
   await bounds(page);await canvas(page,`redistributed-${f}`);
  }
  pass('all relocated floors and intervening landings render with the exact room list; M1 stops at 45F');
  await page.locator('#floor').selectOption('all');await page.locator('#search').fill('not-found-scene');assert(await page.locator('#empty').isVisible());await page.locator('#search').fill('R25');assert.equal(await page.locator('#scene-list [data-select]').count(),1);await page.locator('#search').fill('');
  await page.locator('#act').selectOption('5');assert.equal(await page.locator('#scope').inputValue(),'act');await page.locator('#act').selectOption('all');
  await page.locator('#shots').uncheck();assert.equal(await page.locator('.model-label.shot:visible').count(),0);await page.locator('#shots').check();
  pass('search, chapter, floor, scope and secondary marker controls work');
  await page.locator('#height').selectOption('compressed');await page.locator('#scope').selectOption('all');
  for(const width of [1920,390,320]){await page.setViewportSize({width,height:width>800?1080:844});await choose(page,'U6b');await page.locator('#scope').selectOption('act');await page.waitForTimeout(200);await bounds(page);await canvas(page,'lower-'+width);}
  for(const width of [390,320]){
   await page.setViewportSize({width,height:844});await choose(page,'R11','R11-R12-16','T-R11-R12-01');await page.locator('#scope').selectOption('route');await bounds(page);await canvas(page,'ascent-'+width);
   assert.deepEqual(await page.evaluate(()=>{const head=document.querySelector('.view-head').getBoundingClientRect();return [...document.querySelectorAll('.model-label:not([hidden]),.floor-label:not([hidden])')].filter(el=>{const r=el.getBoundingClientRect();return r.top<head.bottom&&r.bottom>head.top;}).map(el=>el.textContent);}),[]);
  }
  pass('desktop and mobile canvas are nonblank, interactive and overflow-free, including long ascent labels');
  for(const width of [390,320]){
   await page.setViewportSize({width,height:844});await page.locator('#scope').selectOption('all');await page.waitForTimeout(300);
   await floorGuides(page,'guides-off-'+width);
  }
  pass('mobile floor-guide control fits and hides only reference geometry');
  assert.equal(await page.evaluate(key=>localStorage.getItem(key),key),savedText);
  await page.setViewportSize({width:1440,height:1000});await page.goto(base+'/building/editor.html#scene=R2');await page.locator('#loading').waitFor({state:'detached'});
  assert.match(await page.title(),/舊配置沙盒（封存）/);
  assert.match(await page.locator('.header-meta').innerText(),/封存 · 舊單棟配置/);
  assert(await page.locator('#scene-export').isVisible());assert(await page.locator('#scene-import').isVisible());
  assert.equal(await page.locator('.room-tag').count(),27);assert.match(await page.locator('#room-floor').innerText(),/自訂配置/);await page.locator('#room-picker').selectOption('R23');assert.equal(await page.locator('#room-name').innerText(),'舊存檔自訂房間');
  assert.equal(await page.evaluate(key=>localStorage.getItem(key),key),savedText);
  pass('legacy editor preserves custom R23 and modified upper-room coordinates without migration');
  await page.goto(base+'/#scene=U6b');await page.waitForSelector('.scene-3d');await page.locator('.scene-3d').click();await page.waitForSelector('#loading',{state:'detached'});assert.match(await page.locator('#node-id').innerText(),/^U6b/);
  await page.locator('#flow-link').click();await page.waitForSelector('.scene-detail');assert.match(await page.locator('.scene-detail .eyebrow').innerText(),/U6b/i);
  pass('lower scenes open the 3D model and return to their canonical flow');
  await page.goBack();await page.waitForSelector('#canvas-host canvas');await page.waitForFunction(()=>document.querySelector('#node-id')?.textContent.startsWith('U6b'));
  await canvas(page,'history-return');pass('browser Back restores an interactive model');
  assert.deepEqual(errors,[]);pass('no browser JavaScript errors');
  writeFileSync(path.join(out,'results.json'),JSON.stringify({checks,errors},null,2));
 } finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
