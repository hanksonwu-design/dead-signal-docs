const assert = require('node:assert/strict');
const {readFileSync, mkdirSync, writeFileSync} = require('node:fs');
const {createRequire} = require('node:module');
const {pathToFileURL} = require('node:url');
const path = require('node:path');
const runtime = createRequire(path.resolve(process.argv[2], '__qa__.cjs'));
const {chromium} = runtime('playwright');
const base = process.argv[3] || 'http://127.0.0.1:8768', out = path.resolve(process.argv[4]);
mkdirSync(out, {recursive: true});
const errors = [], checks = [], pass = label => { checks.push(label); console.log('PASS', label); };
const root = path.resolve(__dirname, '..');
const url = (file, heading = '', staticMode = false) => base + '/' + (staticMode ? '?static=1' : '') + '#' + new URLSearchParams({doc: file, heading});
async function ready(page) { await page.locator('#readerOverlay:not(.hidden)').waitFor(); }
async function bounds(page) {
  assert.deepEqual(await page.evaluate(() => {
    const issues = [], bar = document.querySelector('.reader-topbar');
    if (document.documentElement.scrollWidth > innerWidth + 1) issues.push('page');
    for (const el of document.querySelectorAll('.reader-panel,.reader-topbar,.reader-actions,.screenplay-cues,.screenplay-cue')) {
      if (el.scrollWidth > el.clientWidth + 2) issues.push(el.className);
    }
    const r = document.querySelector('#reading-marker-control').getBoundingClientRect();
    if (r.right > innerWidth || r.top < bar.getBoundingClientRect().top || r.bottom > bar.getBoundingClientRect().bottom) issues.push('toggle');
    return issues;
  }), []);
}
(async () => {
  const {ACTS} = await import(pathToFileURL(path.join(root, 'tools/screenplay-files.mjs')));
  const {readingMarkerData} = await import(pathToFileURL(path.join(root, 'tools/build-reader-markers.mjs')));
  const expected = readingMarkerData();
  const browser = await chromium.launch({channel: 'chrome', headless: true, args: ['--enable-unsafe-swiftshader']});
  try {
    const context = await browser.newContext({viewport: {width: 1440, height: 1000}});
    context.on('page', p => p.on('pageerror', e => errors.push(e.message)));
    const page = await context.newPage();
    await page.goto(url(ACTS[0].path)); await ready(page);
    for (const act of ACTS) {
      await page.evaluate(file => openReader(file), act.path);
      const result = await page.evaluate(() => {
        const content = document.querySelector('#readerContent'), copy = content.cloneNode(true);
        copy.querySelectorAll('.screenplay-cues,.reader-toc').forEach(el => el.remove());
        const raw = state.selected.content.replace(/^---\s*\n[\s\S]*?\n---\s*\n?/, '');
        const plain = document.createElement('div'); plain.innerHTML = renderMarkdown(raw);
        const strip = el => ({text: el.textContent, links: [...el.querySelectorAll('a')].map(a => [a.textContent, a.href, a.target]), headings: [...el.querySelectorAll('h1,h2,h3,h4,h5,h6')].map(h => h.textContent)});
        return {same: JSON.stringify(strip(copy)) === JSON.stringify(strip(plain)),
          markers: [...content.querySelectorAll('[data-reading-markers]')].flatMap(el => el.dataset.readingMarkers.split(' ').map(id => ({id, category: el.dataset.category}))),
          cues: [...content.querySelectorAll('[data-reading-markers]')].map(el => ({ids: el.dataset.readingMarkers.split(' '), text: el.textContent, title: el.title})),
          max: Math.max(...[...content.querySelectorAll('.screenplay-cues')].map(row => row.children.length))};
      });
      assert(result.same, act.name + ': original text, headings and links');
      assert.deepEqual(result.markers.sort((a,b) => a.id.localeCompare(b.id)), expected[act.path].map(({id, category}) => ({id, category})).sort((a,b) => a.id.localeCompare(b.id)));
      assert(result.max <= 2, 'sparse category labels');
      const categories = {item:'道具／線索',puzzle:'解謎／操作',event:'事件',horror:'恐怖點',boss:'BOSS'};
      for (const cue of result.cues) {
        const matches = cue.ids.map(id => expected[act.path].find(m => m.id === id));
        const forms = ['物證','聲證','影證','文證'].filter(form => matches.some(m => m.fragmentForms.includes(form)));
        for (const m of matches) assert.deepEqual(m.fragmentForms, forms, 'different media and ordinary actions do not inherit each other\'s parentheses');
        assert.equal(cue.text, categories[matches[0].category] + (forms.length ? `（${forms.join('／')}）` : ''));
        assert.equal(cue.title, matches.map(m => m.title + (m.fragmentForms.length ? `（${m.fragmentForms.join('／')}）` : '')).join('、'));
      }
    }
    pass(`${Object.values(expected).flat().length} markers render exactly once across ten acts; narrative text, headings and source links are unchanged`);
    pass('all fragment parentheses and source-name tooltips agree with 3D metadata, including mixed forms');
    await page.evaluate(file => openReader(file), ACTS[2].path);
    const sourceCue=page.locator('[data-reading-markers~="R7-C03-item"]');
    assert((await sourceCue.evaluate(el=>el.closest('p').textContent)).includes('347 道記號'));
    assert.equal(await sourceCue.innerText(),'道具／線索（物證／聲證／文證）');
    assert.equal(await page.locator('[data-reading-markers~="R7-C03-horror"]').innerText(),'恐怖點');
    assert((await page.locator('[data-reading-markers~="R9-C01-horror"]').evaluate(el=>el.closest('p').textContent)).includes('帆布旁一道暗縫在 3 秒內退去'));
    await page.evaluate(file => openReader(file), ACTS[9].path);
    for(const id of ['R32-D01-item','R32-D02-item','R32-F01-item']) assert.equal(await page.locator(`[data-reading-markers~="${id}"]`).innerText(),'道具／線索（影證）');
    assert.equal(await page.locator('[data-reading-markers~="R32-D09-puzzle"]').innerText(),'解謎／操作');
    pass('source cues follow their authored reading beats, while the same-image scare and final comparison remain untyped');
    const labels = ['item', 'puzzle', 'event', 'horror', 'boss'];
    const readerStyle = {};
    for (const category of labels) {
      const marker = page.locator(`.screenplay-cue[data-category=${category}]`).first();
      if (!await marker.count()) await page.evaluate(file => openReader(file), ACTS[5].path);
      readerStyle[category] = await page.locator(`.screenplay-cue[data-category=${category}]`).first().evaluate(el => ({color: getComputedStyle(el).color, icon: el.querySelector('svg').outerHTML}));
    }
    const modelPage = await context.newPage();
    await modelPage.goto(base + '/building/#scene=R26');
    await modelPage.locator('#loading').waitFor({state: 'detached'});
    for (const category of labels) {
      const style = await modelPage.locator(`.marker-filters label[data-category=${category}]`).evaluate(el => ({color: getComputedStyle(el).color, icon: el.querySelector('svg').outerHTML}));
      assert.deepEqual(style, readerStyle[category]);
    }
    await modelPage.close();
    pass('all five categories use identical colors and Lucide icons in the reader and 3D model');
    await page.goto(url(ACTS[1].path, 's-0904-19')); await ready(page);
    await bounds(page);
    await page.screenshot({path: path.join(out, 'reading-1440.png')});
    const toggle = page.getByRole('checkbox', {name: '顯示關鍵標示'});
    await toggle.focus(); await toggle.press('Space');
    assert.equal(await page.locator('.screenplay-cue:visible').count(), 0);
    assert(await page.locator('[data-doc-window=true]').count() > 0);
    await page.screenshot({path: path.join(out, 'plain-1440.png')});
    await page.reload(); await ready(page);
    assert(!await toggle.isChecked());
    await page.evaluate(file => openReader(file), ACTS[5].path);
    assert.equal(await page.locator('.screenplay-cue:visible').count(), 0);
    await toggle.check();
    await page.evaluate(() => { const raw = state.selected.content.replace(/^---\s*\n[\s\S]*?\n---\s*\n?/, ''); ScreenplayMarkers.decorate(document.getElementById('readerContent'), raw, state.selected.path); });
    assert.equal(await page.locator('[data-reading-markers~="R26-V01-boss"]').count(), 1);
    pass('keyboard toggle persists across reloads and acts; repeated rendering does not duplicate cues');
    for (const width of [390, 320]) {
      await page.setViewportSize({width, height: 844});
      await page.goto(url(ACTS[5].path, 's-0908-8', true)); await ready(page);
      await page.locator('[data-reading-markers~="R23-D01-item"]').evaluate(el => el.closest('p').scrollIntoView({block: 'center'}));
      await bounds(page);
      await page.screenshot({path: path.join(out, `reading-${width}.png`)});
      const popupEvent = context.waitForEvent('page');
      await page.locator('[data-doc-heading=node-r23-images]').first().click();
      const popup = await popupEvent; await ready(popup);
      assert(await popup.locator('#reading-marker-control').isHidden());
      assert.equal(await popup.locator('.screenplay-cue').count(), 0);
      assert.equal(await popup.evaluate(() => opener), null);
      await popup.close();
    }
    pass('static Pages payload and 390/320px layouts remain readable; specification links still open a separate page');
    for (const width of [1440,390,320]) {
      await page.setViewportSize({width,height:width>800?1000:844});
      await page.goto(url(ACTS[5].path,'s-0908-25',true)); await ready(page);
      const cue = page.locator('[data-reading-markers~="R24-D04-event"]');
      assert.equal(await cue.innerText(),'事件（影證／文證）');
      await cue.scrollIntoViewIfNeeded(); await bounds(page);
      await page.screenshot({path:path.join(out,`fragment-mixed-${width}.png`)});
    }
    pass('mixed-form parentheses wrap without overflow on static desktop and mobile readers');
    for (const width of [1440, 390]) {
      await page.setViewportSize({width, height: width > 800 ? 1000 : 844});
      for (const [act, node, phrase] of [[2, 'R7', '一聲清喉嚨在近處'], [6, 'U2', '初次從門邊望進內井']]) {
        await page.goto(url(ACTS[act].path, `node-${node.toLowerCase()}-script`, true)); await ready(page);
        const cue = page.locator(`[data-reading-markers~="${node}-V01-horror"]`);
        const paragraph = await cue.evaluate(el => {
          const p = el.closest('p'); p.scrollIntoView({block: 'center'}); return p.textContent;
        });
        assert(paragraph.includes(phrase)); await bounds(page);
        await page.screenshot({path: path.join(out, `entry-${node.toLowerCase()}-${width}.png`)});
      }
    }
    pass('R7 arrival and U2 wet-cloth cues label their exact beats on desktop/mobile and static Pages');
    for (const width of [1440, 390]) {
      await page.setViewportSize({width, height: width > 800 ? 1000 : 844});
      for (const [act, id, phrase] of [[4, 'R19-V01-horror', '確認屏息後'], [5, 'R25-V02-puzzle', '每輪播放 5 秒']]) {
        await page.goto(url(ACTS[act].path, '', true)); await ready(page);
        const cue = page.locator(`[data-reading-markers~="${id}"]`);
        const text = await cue.evaluate(el => {
          const p = el.closest('p'); p.scrollIntoView({block: 'center'}); return p.textContent;
        });
        assert(text.includes(phrase), id); await bounds(page);
        await page.screenshot({path: path.join(out, `hearing-${id}-${width}.png`)});
      }
    }
    pass('door-breath and speaker-window cues label the authored operation beats in desktop/mobile static reading');
    for (const width of [1440, 390]) {
      await page.setViewportSize({width, height: width > 800 ? 1000 : 844});
      for (const [act, id, phrase] of [
        [6, 'R27-C01', '把待核的那一列暫留桌側'],
        [6, 'U3-C05', '可放大靜格裡停在補口袋旁'],
        [7, 'R29-C01', '提價那一列可翻回桌上的原頁'],
        [7, 'U4-C01', '比對缺角、焊疤'],
        [8, 'R31-C02', '檢查掛載條件時，點開鑑識座'],
      ]) {
        await page.goto(url(ACTS[act].path, '', true)); await ready(page);
        const link = page.locator('#readerContent a').filter({hasText: new RegExp(`^${id}$`)});
        assert.equal(await link.count(), 1, id + ': unique inline work order');
        const text = await link.evaluate(el => {
          const p = el.closest('p'); p.scrollIntoView({block: 'center'}); return p.textContent;
        });
        assert(text.includes(phrase), id + ': authored interaction'); await bounds(page);
        assert.equal(await link.getAttribute('data-doc-window'), 'true');
        await page.screenshot({path: path.join(out, `core-return-${id}-${width}.png`)});
      }
    }
    pass('five late-game close-ups stay on their interaction paragraphs with unique work-order links on desktop/mobile');
    for (const width of [1440, 390]) {
      await page.setViewportSize({width, height: width > 800 ? 1000 : 844});
      for (const [act, id, phrase] of [
        [2, 'R7-D01', '人設、素材與應對章各留一枚頁籤'],
        [3, 'R16-D01', '原識別碼與人員列並在旁邊'],
        [5, 'R23-D02', '來源標頭和頁碼留在局部旁'],
        [7, 'R29-D01', '透明疊片對齊同欄筆勢'],
        [8, 'R30-D01', '同拍攝方向的震前／震後快照'],
        [8, 'R31-D01', '兩組，可自由切換'],
      ]) {
        await page.goto(url(ACTS[act].path, '', true)); await ready(page);
        const link = page.locator('#readerContent a').filter({hasText: new RegExp(`^${id}$`)});
        assert.equal(await link.count(), 1, id);
        assert((await page.locator('#readerContent').innerText()).includes(phrase), id);
        await link.evaluate(el => el.closest('p').scrollIntoView({block: 'center'}));
        await bounds(page);
        await page.screenshot({path: path.join(out, `reading-load-${id}-${width}.png`)});
      }
    }
    pass('six revised reading hubs retain their inline work orders and readable desktop/mobile source cues');
    const chains = [
      [1,'第一層揭露','h-0904-524'], [2,'產線關聯','h-0905-652'],
      [3,'第二層揭露','h-0906-451'], [3,'服務門路由','h-0906-626'],
      [4,'第三層揭露','h-0907-385'], [5,'第四層揭露','h-0908-194'],
      [5,'阿彪對峙','h-0908-515'], [8,'第五層揭露','h-0909-502'],
    ];
    for (const width of [1440,390,320]) {
      await page.setViewportSize({width,height:width>800?1000:844});
      for (const [act,name,heading] of chains) {
        await page.goto(url(ACTS[act].path,heading,width<800)); await ready(page);
        await page.waitForFunction(id=>document.activeElement?.id===id,heading);
        const title=page.locator('#readerContent strong').filter({hasText:`${name}｜三格關聯`});
        assert.equal(await title.count(),1,name);
        const table=title.locator('xpath=ancestor::p/following-sibling::div[1]/table');
        assert.deepEqual(await table.locator('tbody tr td:first-child').allTextContents().then(cells=>cells.map(c=>c.slice(0,4))),['碎片 A','碎片 B','碎片 C']);
        assert(await table.locator('a[data-doc-link]').count()>=3,name+': original sources');
        await table.evaluate(el=>{
          const panel=document.querySelector('.reader-panel');
          panel.scrollTop+=el.getBoundingClientRect().top-140;
        });
        await bounds(page);
        if (['第一層揭露','阿彪對峙','第五層揭露'].includes(name)) await page.screenshot({path:path.join(out,`fragment-chain-${act}-${width}.png`)});
      }
    }
    pass('eight A/B/C groups render ordered source tables in dynamic desktop and static 390/320px readers');
    for (const staticMode of [false,true]) {
      await page.setViewportSize({width:1440,height:1000});
      for (const [from,heading,label,to,source] of [
        [1,'h-0904-524','第一層揭露／碎片 A',1,'s-0904-12'],
        [6,'h-0909-502','第五層揭露／碎片 A',8,'s-0909-10'],
        [2,'h-0905-652','產線關聯／碎片 C',2,'s-0905-39'],
      ]) {
        await page.goto(url(ACTS[from].path,'',staticMode)); await ready(page);
        await page.locator('#readerContent a').filter({hasText:new RegExp(`^${label}$`)}).last().click();
        await page.waitForFunction(({file,heading})=>state.selected.path===file&&new URLSearchParams(location.hash.slice(1)).get('heading')===heading,{file:ACTS[to].path,heading});
        assert.equal(await page.locator(`#readerContent #${heading}`).count(),1);
        const back=page.locator(`#readerContent table a[data-doc-heading="${source}"]`).first();
        assert.equal(await back.getAttribute('data-doc-link'),ACTS[from].path);
        await back.click();
        await page.waitForFunction(({file,source})=>state.selected.path===file&&new URLSearchParams(location.hash.slice(1)).get('heading')===source,{file:ACTS[from].path,source});
        assert.equal(await page.locator(`#readerContent #${source}`).count(),1);
      }
    }
    pass('fragment labels and source links navigate both ways within acts, across acts, and through alternative C in dynamic/static mode');
    await page.goto(url(ACTS[0].path)); await ready(page);
    assert.match(await page.locator('[data-reading-markers~="P2-C04-horror"]').locator('xpath=ancestor::tr').innerText(), /搪瓷盆.*第四個人/s);
    await page.goto(url(ACTS[9].path)); await ready(page);
    const bossPosition = await page.locator('[data-reading-markers~="R32-V01-boss"]').evaluate(el => {
      const target = el.closest('p'); return {text: target.textContent, before: target.previousElementSibling.textContent};
    });
    assert.match(bossPosition.text, /熟悉袖口向兩側延長/);
    assert.match(bossPosition.before, /雙揭露所需來源已核對/);
    await page.evaluate(() => openReader('README.md'));
    assert(await page.locator('#reading-marker-control').isHidden());
    assert.equal(await page.locator('.screenplay-cue').count(), 0);
    pass('table-row horror remains local, the final boss follows both revelations, and other documents stay unannotated');
    const blocked = await browser.newContext();
    await blocked.addInitScript(() => { Storage.prototype.getItem = Storage.prototype.setItem = () => { throw new Error('storage blocked'); }; });
    const p = await blocked.newPage(); await p.goto(url(ACTS[1].path)); await ready(p);
    await p.getByRole('checkbox', {name: '顯示關鍵標示'}).uncheck();
    assert.equal(await p.locator('.screenplay-cue:visible').count(), 0);
    await blocked.close();
    assert.deepEqual(errors, []); pass('reading works with storage disabled; no browser JavaScript errors');
    writeFileSync(path.join(out, 'result.json'), JSON.stringify({checks, errors}, null, 2));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
