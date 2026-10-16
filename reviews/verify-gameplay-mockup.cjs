const assert = require('node:assert/strict');
const { mkdirSync, writeFileSync } = require('node:fs');
const { createRequire } = require('node:module');
const path = require('node:path');
const runtime = createRequire(path.resolve(process.argv[2], '__qa__.cjs'));
const { chromium } = runtime('playwright'), sharp = runtime('sharp');
const base = process.argv[3], out = path.resolve(process.argv[4]);
mkdirSync(out, { recursive: true });

(async () => {
  const checks = [], errors = [], catalog = '10_製作規格/10-11_製作規格_示意圖目錄.md';
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const context = await browser.newContext();
    context.on('page', page => page.on('pageerror', error => errors.push(error.message)));
    const page = await context.newPage();
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.goto(base + '/?static#' + new URLSearchParams({ doc: catalog, heading: 'catalog-v07' }).toString());
      await page.waitForFunction(() => typeof state !== 'undefined' && state.selected?.path.endsWith('示意圖目錄.md') && document.activeElement?.id === 'catalog-v07');
      assert.equal(await page.locator('#readerContent tbody tr').count(), 111);
      const original = await page.evaluate(() => location.href);
      for (const [id, asset, kind] of [
        ['v07', 'V07_gameplay_current.png', '遊戲畫面模擬'],
        ['v07-rules', 'V07.svg', '規則圖解'],
      ]) {
        const heading = `illustration-note-${id}`;
        const link = page.locator(`#readerContent a[data-doc-heading="${heading}"]`).first();
        assert.equal(await link.getAttribute('target'), '_blank');
        const opened = page.waitForEvent('popup');
        await link.click();
        const popup = await opened;
        try {
          await popup.waitForFunction(id => document.activeElement?.id === id, heading);
          assert.equal(await popup.evaluate(() => window.opener), null);
          const image = popup.locator(`#readerContent img[src$="${asset}"]`);
          assert.equal(await image.count(), 1);
          await image.scrollIntoViewIfNeeded();
          await image.evaluate(img => img.decode());
          assert(await image.evaluate(img => img.naturalWidth > 1000 && img.naturalHeight > 500));
          assert(await popup.locator('#readerContent').innerText().then(t => t.includes(kind) && t.includes('N2 是部分掩體') && t.includes('2.2 秒補救指令窗')));
          assert(await popup.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1 &&
            document.querySelector('.reader-panel').scrollWidth <= document.querySelector('.reader-panel').clientWidth + 1));
          const screenshot = await image.screenshot();
          assert((await sharp(screenshot).stats()).channels.slice(0, 3).some(c => c.stdev > 10));
          writeFileSync(path.join(out, `${id}-${width}.png`), screenshot);
          assert.equal(await page.evaluate(() => location.href), original);
        } finally { await popup.close(); }
      }
      checks.push(`${width}px: gameplay raster and exact SVG open separately, decode, retain original catalog and stay within reader`);
      console.log(`PASS ${checks.at(-1)}`);
    }
    assert.deepEqual(errors, []);
    writeFileSync(path.join(out, 'result.json'), JSON.stringify({ checks, errors, scope: 'V07 documentation mockup and link verification, not engine gameplay.' }, null, 2) + '\n');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
