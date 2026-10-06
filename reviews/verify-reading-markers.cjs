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
          max: Math.max(...[...content.querySelectorAll('.screenplay-cues')].map(row => row.children.length))};
      });
      assert(result.same, act.name + ': original text, headings and links');
      assert.deepEqual(result.markers.sort((a,b) => a.id.localeCompare(b.id)), expected[act.path].map(({id, category}) => ({id, category})).sort((a,b) => a.id.localeCompare(b.id)));
      assert(result.max <= 2, 'sparse category labels');
    }
    pass(`${Object.values(expected).flat().length} markers render exactly once across ten acts; narrative text, headings and source links are unchanged`);
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
