const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const { mkdirSync, writeFileSync } = require('node:fs');
const path = require('node:path');
const runtime = createRequire(path.resolve(process.argv[2] || 'node_modules', '__qa__.cjs'));
const { chromium } = runtime('playwright');
const base = process.argv[3] || 'http://127.0.0.1:8766';
const doc = '08_製作管理/08-13_劇情節點與場景道具總表.md';
const out = path.resolve(__dirname, process.argv[4] || 'story-inventory-browser');
mkdirSync(out, { recursive: true });
const checks = [];
const errors = [];
const url = heading => `${base}/#${new URLSearchParams({ doc, heading })}`;
const pass = name => { checks.push(name); console.log(`PASS ${name}`); };

async function ready(page, heading) {
  await page.locator('#readerOverlay:not(.hidden)').waitFor();
  await page.waitForFunction(({ doc, heading }) => {
    const el = document.getElementById(heading);
    return state.selected?.path === doc && el && el.getBoundingClientRect().top >= 70 && el.getBoundingClientRect().top < 155;
  }, { doc, heading });
}

(async () => {
  const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome', headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    page.setDefaultTimeout(45000);
    await page.goto(base);
    await page.locator('[data-folder="08_製作管理"]').click();
    await page.locator('[data-core-category="共用"]').click();
    assert.equal(await page.locator('#documentGrid .doc-card h3').filter({ hasText: '劇情節點與場景道具總表' }).count(), 1);
    pass('inventory is discoverable in production management');

    await page.goto(url('inventory-scenes'));
    await ready(page, 'inventory-scenes');
    const text = await page.locator('#readerContent').innerText();
    assert(text.includes('48 個導覽節點、342 段正文場次、56 條登記動線'));
    assert(!text.includes('<!-- inventory:'));
    assert(text.includes('不是保護受害者隱私'));
    await page.screenshot({ path: path.join(out, 'scenes-desktop.png') });
    pass('summary, scene tables and hidden generator markers render correctly');

    await page.locator('#readerContent [data-doc-heading="node-r11-script"]').first().click();
    await page.waitForFunction(() => state.selected?.path.endsWith('09-05_正式劇本_第二幕.md'));
    assert(await page.locator('#node-r11-script').count());
    pass('scene link opens its owning screenplay act');

    await page.goto(url('inventory-beats'));
    await ready(page, 'inventory-beats');
    assert.equal(await page.locator('#readerContent a[data-doc-heading^="s-090"], #readerContent a[data-doc-heading^="s-0910-"]').count(), 342);
    await page.locator('#readerContent [data-doc-heading="s-0910-23"]').click();
    await page.waitForFunction(() => state.selected?.path.endsWith('09-10_正式劇本_終幕.md'));
    assert(await page.locator('#s-0910-23').count());
    pass('all 342 beat links render and the B ending opens the correct source');

    await page.goto(url('inventory-routes'));
    await ready(page, 'inventory-routes');
    const routeTable = page.locator('#readerContent table').filter({ has: page.locator('th', { hasText: '動線／來源' }) });
    const routes = await routeTable.locator('a[data-doc-heading$="-spec"]').count();
    assert.equal(routes, 56);
    const routeLink = routeTable.locator('[data-doc-heading="node-u6b-spec"]');
    await routeLink.click();
    await page.waitForFunction(() => state.selected?.path.endsWith('10-07_製作規格_第六幕.md'));
    pass('all 56 route links render and lead to production specifications');

    for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
      await page.setViewportSize(viewport);
      await page.goto(base);
      await page.goto(url('inventory-props'));
      await ready(page, 'inventory-props');
      const dimensions = await page.evaluate(() => {
        const panel = document.querySelector('.reader-panel');
        return { page: document.documentElement.scrollWidth, viewport: innerWidth, panel: panel.clientWidth, scroll: panel.scrollWidth };
      });
      assert(dimensions.page <= dimensions.viewport + 1, JSON.stringify(dimensions));
      assert(dimensions.scroll <= dimensions.panel + 1, JSON.stringify(dimensions));
      const overflowing = await page.locator('#readerContent .md-table-wrap').evaluateAll(elements => elements
        .filter(el => el.scrollWidth > el.clientWidth + 1)
        .map(el => getComputedStyle(el).overflowX));
      assert(overflowing.every(overflow => ['auto', 'scroll'].includes(overflow)));
      await page.screenshot({ path: path.join(out, viewport.width < 500 ? 'props-mobile.png' : 'props-desktop.png') });
      pass(`readable props tables with contained overflow at ${viewport.width}px`);
    }
    assert.deepEqual(errors, []);
    pass('no browser runtime errors');
  } finally {
    await browser.close();
    writeFileSync(path.join(out, 'results.json'), JSON.stringify({ base, doc, checks, errors }, null, 2) + '\n');
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
