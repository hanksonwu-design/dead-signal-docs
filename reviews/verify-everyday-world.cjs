const assert = require('node:assert/strict');
const {readFileSync, mkdirSync, writeFileSync} = require('node:fs');
const {createRequire} = require('node:module');
const {pathToFileURL} = require('node:url');
const path = require('node:path');
const runtime = createRequire(path.resolve(process.argv[2], '__qa__.cjs'));
const {chromium} = runtime('playwright'), sharp = runtime('sharp');
const base = process.argv[3] || 'http://127.0.0.1:8768';
const out = path.resolve(process.argv[4]);
mkdirSync(out, {recursive: true});
const markers = JSON.parse(readFileSync(path.join(__dirname, '../building/scene-markers.json'))).markers;
const ids = ['R1-C07', 'R5-C06', 'R8-C05', 'R14-C05', 'U3-C07', 'U5-C03', 'U6-C03'];
const errors = [], checks = [];
const pass = text => { checks.push(text); console.log('PASS', text); };
const readerUrl = (doc, heading) => `${base}/?static=1#${new URLSearchParams({doc, heading})}`;

async function bounds(page, selector) {
  const issues = await page.locator(selector).evaluateAll(elements => elements.filter(el => el.scrollWidth > el.clientWidth + 2).map(el => el.className || el.id));
  assert.deepEqual(issues, []);
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
}

(async () => {
  const {ACTS} = await import(pathToFileURL(path.join(__dirname, '../tools/screenplay-files.mjs')));
  const browser = await chromium.launch({channel: 'chrome', headless: true, args: ['--enable-unsafe-swiftshader']});
  try {
    const context = await browser.newContext();
    context.on('page', page => page.on('pageerror', error => errors.push(error.message)));
    const page = await context.newPage();
    for (const width of [1440, 390]) {
      await page.setViewportSize({width, height: width > 800 ? 1000 : 844});
      for (const [act, image, heading] of [[1, 'R1-V02', 'belongings-r1-v02-script'], [1, 'R5-V02', 'clothing-r5-v02-script'], [2, 'R8-V04', 'preparation-r8-v04-script']]) {
        await page.goto(readerUrl(ACTS[act].path, heading));
        await page.locator('#readerOverlay:not(.hidden)').waitFor();
        const link = page.locator('#readerContent a').filter({hasText: new RegExp(`^${image}$`)});
        assert.equal(await link.count(), 1);
        assert((await link.evaluate(el => el.closest('p').textContent)).includes('靜態畫面／全景'));
        await link.scrollIntoViewIfNeeded();
        await bounds(page, '.reader-panel,.reader-topbar,.screenplay-cues,.screenplay-cue');
        await page.screenshot({path: path.join(out, `${image}-${width}.png`)});
        const pending = context.waitForEvent('page');
        await link.click();
        const popup = await pending;
        await popup.locator('#readerOverlay:not(.hidden)').waitFor();
        assert((await popup.locator('#readerContent').innerText()).includes(image));
        assert.equal(await popup.evaluate(() => opener), null);
        await popup.close();
      }
      for (const image of ids) {
        const marker = markers.find(marker => marker.id === `${image}-item`);
        await page.goto(readerUrl(marker.source, marker.heading));
        await page.locator('#readerOverlay:not(.hidden)').waitFor();
        const cue = page.locator(`[data-reading-markers~="${marker.id}"]`);
        assert.equal(await cue.count(), 1);
        assert.equal(await cue.innerText(), '道具／線索');
        assert((await cue.evaluate(el => el.closest('p').textContent)).includes('操作／物件近看'));
        await cue.scrollIntoViewIfNeeded();
        await bounds(page, '.reader-panel,.screenplay-cues,.screenplay-cue');

        await page.goto(`${base}/building/#${new URLSearchParams({scene: marker.node, marker: marker.id})}`);
        await page.locator('#loading').waitFor({state: 'detached'});
        assert(await page.locator('#error').isHidden());
        assert.equal(await page.locator('#marker-detail h4').innerText(), marker.title);
        assert((await page.locator('#marker-detail').innerText()).includes('選填查看'));
        await page.locator('#focus').click();
        await page.waitForTimeout(250);
        await bounds(page, '#node-title,#marker-detail,.content-marker:not([hidden])');
        const pin = page.locator(`.content-marker[data-marker="${marker.id}"]`);
        assert(await pin.isVisible());
        const canvas = page.locator('#canvas-host canvas');
        const before = await canvas.screenshot();
        assert((await sharp(before).stats()).channels.slice(0, 3).some(channel => channel.stdev > 7));
        if (image === 'R8-C05') {
          await page.locator('#front').click(); await page.waitForTimeout(250);
          const after = await canvas.screenshot();
          assert(!before.equals(after), 'camera changes rendered pixels');
          await page.screenshot({path: path.join(out, `model-r8-${width}.png`), fullPage: true});
        }
      }
      pass(`${width}px: three optional views, seven untyped life markers, new-window specifications and nonblank interactive 3D`);
    }
    assert.deepEqual(errors, []);
    writeFileSync(path.join(out, 'result.json'), JSON.stringify({checks, errors}, null, 2));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
