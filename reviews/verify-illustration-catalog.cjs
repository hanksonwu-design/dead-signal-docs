const assert = require('node:assert/strict');
const { mkdirSync, writeFileSync } = require('node:fs');
const { createRequire } = require('node:module');
const { pathToFileURL } = require('node:url');
const path = require('node:path');
const runtime = createRequire(path.resolve(process.argv[2], '__qa__.cjs'));
const { chromium } = runtime('playwright');
const base = process.argv[3], out = path.resolve(process.argv[4]);
const root = path.resolve(__dirname, '..');
mkdirSync(out, { recursive: true });
const errors = [], checks = [];
const pass = name => { checks.push(name); console.log(`PASS ${name}`); };

(async () => {
  const { buildIllustrationCatalog } = await import(pathToFileURL(path.join(root, 'tools/build-illustration-catalog.mjs')));
  const { ILLUSTRATION_CATALOG } = await import(pathToFileURL(path.join(root, 'tools/screenplay-files.mjs')));
  const { records } = buildIllustrationCatalog();
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const context = await browser.newContext();
    context.on('page', page => page.on('pageerror', error => errors.push(error.message)));
    const page = await context.newPage();
    const ready = async (doc, heading) => page.waitForFunction(({ doc, heading }) => state.selected?.path === doc && document.getElementById(heading), { doc, heading });
    const navigate = async (doc, heading) => {
      await page.evaluate(hash => { location.hash = hash; }, new URLSearchParams({ doc, heading }).toString());
      await ready(doc, heading);
    };
    await page.goto(base);
    await page.waitForFunction(() => state.documents.length > 0);
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      await navigate(ILLUSTRATION_CATALOG, 'illustration-catalog');
      assert.equal(await page.locator('#readerContent tbody tr').count(), records.length);
      assert.equal(await page.locator('#readerContent [id^="catalog-group-"]').count(), 11);
      assert(!await page.locator('#readerContent').innerText().then(text => text.includes('<a id=')), 'row anchors are not visible markup');
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1 && document.querySelector('.reader-panel').scrollWidth <= document.querySelector('.reader-panel').clientWidth + 1));
      assert(await page.locator('#readerContent table').evaluateAll(tables => tables.every(table => table.getBoundingClientRect().width >= 820)), 'catalog columns retain a readable width');
      if (width === 390) assert(await page.locator('#readerContent .md-table-wrap').evaluateAll(wraps => wraps.every(wrap => wrap.scrollWidth > wrap.clientWidth)), 'mobile tables scroll within their containers');
      await page.screenshot({ path: path.join(out, `catalog-${width}.png`) });
      pass(`${width}px: ${records.length} indexed rows, 11 groups, valid row anchors and contained tables`);
      for (const r of records) {
        const rowHeading = `catalog-${r.id.toLowerCase()}`;
        await navigate(ILLUSTRATION_CATALOG, rowHeading);
        const row = page.locator(`#${rowHeading}`).locator('..').locator('..');
        assert.equal(await row.locator('td').first().innerText(), r.id);
        const link = row.locator('td').nth(1).locator('a').first();
        assert.equal(await link.getAttribute('target'), '_blank', `${r.id} opens a new window`);
        assert.equal(await link.getAttribute('rel'), 'noopener noreferrer');
        const originalHash = await page.evaluate(() => location.hash);
        const popupPromise = page.waitForEvent('popup');
        await link.click();
        const detail = await popupPromise;
        await detail.waitForFunction(({ doc, heading }) => typeof state !== 'undefined' && state.selected?.path === doc && document.getElementById(heading), { doc: r.source, heading: r.heading });
        assert.equal(await page.evaluate(() => location.hash), originalHash, 'catalog remains open at its original row');
        assert.equal(await detail.evaluate(() => window.opener), null, 'new window isolates opener');
        const image = detail.locator(`#readerContent img[src$="${encodeURIComponent(r.asset.split('/').at(-1))}"]`);
        assert.equal(await image.count(), 1, r.id);
        await image.scrollIntoViewIfNeeded();
        await image.evaluate(img => img.decode());
        assert(await image.evaluate(img => img.naturalWidth > 0 && img.naturalHeight > 0), r.id);
        assert(await detail.locator('#readerContent').innerText().then(text => text.includes(r.purpose) && text.includes(r.effect)), r.id);
        const back = detail.locator(`#readerContent a[data-doc-link="${ILLUSTRATION_CATALOG}"][data-doc-heading="${rowHeading}"]`);
        assert.equal(await back.count(), 1, `${r.id} unique return link`);
        if (await back.getAttribute('target') === '_blank') {
          const nextPopup = detail.waitForEvent('popup');
          await back.click();
          const popup = await nextPopup;
          await popup.waitForFunction(({ doc, heading }) => typeof state !== 'undefined' && state.selected?.path === doc && document.getElementById(heading), { doc: ILLUSTRATION_CATALOG, heading: rowHeading });
          await popup.close();
        } else {
          await back.click();
          await detail.waitForFunction(({ doc, heading }) => state.selected?.path === doc && document.getElementById(heading), { doc: ILLUSTRATION_CATALOG, heading: rowHeading });
        }
        await detail.close();
      }
      const scene = page.locator('#readerContent tbody tr').first().locator('td').nth(2).locator('a').first();
      assert.equal(await scene.getAttribute('target'), '_blank', 'scene specification opens separately');
      assert(await page.locator('#readerContent a[data-doc-heading="catalog-group-4"]').evaluateAll(links => links.every(link => link.target === '_blank')), 'catalog category links also open separately');
      pass(`${width}px: all ${records.length} picture links open separately with decoded images, captions and precise return links`);
      await navigate(records.find(r => r.id === 'REF-LIFT').source, 'illustration-note-ref-lift');
      await page.locator('#illustration-note-ref-lift').scrollIntoViewIfNeeded();
      await page.screenshot({ path: path.join(out, `lift-notes-${width}.png`) });
    }
    assert.deepEqual(errors, []);
    writeFileSync(path.join(out, 'result.json'), JSON.stringify({ checks, errors, scope: 'Documentation catalog, image links and responsive reader only.' }, null, 2));
    console.log(`${checks.length} browser checks passed.`);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
