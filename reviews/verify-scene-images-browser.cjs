const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const { mkdirSync, writeFileSync, readFileSync } = require('node:fs');
const path = require('node:path');
const runtime = createRequire(path.resolve(process.argv[2], '__qa__.cjs'));
const { chromium } = runtime('playwright');
const base = process.argv[3];
const out = path.resolve(process.argv[4]);
const checks = [], errors = [];
const inventoryFile = '08_製作管理/08-13_劇情節點與場景道具總表.md';
const inventoryText = readFileSync(path.resolve(__dirname, '../docs', inventoryFile), 'utf8');
const imageCount = inventoryText.match(/合計 (\d+) 列圖像製作項目/)[1];
mkdirSync(out, { recursive: true });
const targets = [
  ['reading', '09_劇本/09-04_正式劇本_第一幕.md', 'transition-r2-r3-script', 'T-R2-R3-02-C01'],
  ['spec', '10_製作規格/10-02_製作規格_第一幕.md', 'node-r2-images', 'R2-C01'],
  ['inventory', inventoryFile, 'inventory-scene-images', `${imageCount} 列圖像製作項目`],
  ['details', '10_製作規格/10-03_製作規格_第二幕.md', 'node-r9-images', 'R09_H02'],
  ['hiding', '10_製作規格/10-05_製作規格_第四幕.md', 'node-r20-images', 'R20-V03'],
];
const url = (doc, heading, staticMode = false) => `${base}/${staticMode ? '?static=1' : ''}#${new URLSearchParams({ doc, heading })}`;
async function ready(page, doc, heading) {
  await page.locator('#readerOverlay:not(.hidden)').waitFor();
  await page.waitForFunction(({ doc, heading }) => {
    const anchor = document.getElementById(heading);
    return state.selected?.path === doc && anchor && anchor.getBoundingClientRect().top >= 70 && anchor.getBoundingClientRect().top < 155;
  }, { doc, heading });
}
function pass(name) { checks.push(name); console.log(`PASS ${name}`); }
(async () => {
  const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome', headless: true });
  try {
    const context = await browser.newContext();
    context.on('page', page => page.on('pageerror', e => errors.push(e.message)));
    const page = await context.newPage();
    page.setDefaultTimeout(45000);
    for (const size of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
      await page.setViewportSize(size);
      for (const [name, doc, heading, expected] of targets) {
        await page.goto(url(doc, heading));
        await ready(page, doc, heading);
        const text = await page.locator('#readerContent').innerText();
        assert(text.includes(expected));
        assert(!text.includes('<!-- scene-image'));
        const dimensions = await page.evaluate(() => {
          const panel = document.querySelector('.reader-panel');
          return [document.documentElement.scrollWidth, innerWidth, panel.scrollWidth, panel.clientWidth];
        });
        assert(dimensions[0] <= dimensions[1] + 1 && dimensions[2] <= dimensions[3] + 1, dimensions.join(','));
        const overflow = await page.locator('#readerContent .md-table-wrap').evaluateAll(els => els
          .filter(el => el.scrollWidth > el.clientWidth + 1).map(el => getComputedStyle(el).overflowX));
        assert(overflow.every(value => ['auto', 'scroll'].includes(value)));
        await page.screenshot({ path: path.join(out, `${name}-${size.width}.png`) });
        pass(`${name} shows image IDs with contained layout at ${size.width}px`);
      }
    }
    await page.goto(url(targets[0][1], targets[0][2]));
    await ready(page, targets[0][1], targets[0][2]);
    const link = page.locator('#readerContent [data-doc-heading="node-r2-images"]').last();
    assert.equal(await link.getAttribute('target'), '_blank');
    const popupReady = context.waitForEvent('page');
    await link.click();
    const popup = await popupReady;
    await ready(popup, targets[1][1], targets[1][2]);
    assert.equal(await popup.evaluate(() => window.opener), null);
    assert.equal(await page.evaluate(() => state.selected.path), targets[0][1]);
    await popup.close();
    pass('reading image list opens its production sheet in a separate page');
    await page.goto(url(targets[2][1], targets[2][2], true));
    await ready(page, targets[2][1], targets[2][2]);
    assert((await page.locator('#readerContent').innerText()).includes(`${imageCount} 列圖像製作項目`));
    pass('static docs.json contains the synchronized image inventory');
    assert.deepEqual(errors, []);
    pass('no browser runtime errors');
  } finally {
    await browser.close();
    writeFileSync(path.join(out, 'results.json'), JSON.stringify({ base, checks, errors }, null, 2) + '\n');
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
