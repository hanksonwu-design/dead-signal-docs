// Run with the bundled Playwright/Sharp package directory and the local docs server.
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const { mkdirSync, writeFileSync } = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const runtime = createRequire(path.resolve(process.argv[2], '__qa__.cjs'));
const { chromium } = runtime('playwright'), sharp = runtime('sharp');
const base = process.argv[3] || 'http://127.0.0.1:8767';
const out = path.resolve(__dirname, 'lower-acts-browser');
const checks = [], errors = [];
mkdirSync(out, { recursive: true });
const docURL = (doc, heading) => `${base}/#${new URLSearchParams({ doc, heading })}`;
const pass = name => { checks.push(name); console.log(`PASS ${name}`); };
async function ready(page, file, heading) {
  await page.waitForFunction(({ file, heading }) => typeof state !== 'undefined' && state.selected?.path === file && document.getElementById(heading), { file, heading });
  assert(await page.locator('#readerOverlay').isVisible());
}
async function canvasCheck(page, name) {
  const canvas = page.locator('#canvas-host canvas');
  await canvas.scrollIntoViewIfNeeded();
  const first = await canvas.screenshot();
  assert((await sharp(first).stats()).channels.slice(0, 3).some(c => c.stdev > 7));
  await page.locator('#front').click();
  await page.waitForFunction(() => document.querySelector('#front').getAttribute('aria-pressed') === 'true');
  const second = await canvas.screenshot();
  const a = await sharp(first).raw().toBuffer(), b = await sharp(second).raw().toBuffer();
  assert.equal(a.length, b.length);
  let changed = 0;
  for (let i = 0; i < a.length; i++) if (Math.abs(a[i] - b[i]) > 12) changed++;
  assert(changed > 300, `Interactive model pixels: ${changed}`);
  await canvas.screenshot({ path: path.join(out, `${name}.png`) });
}
(async () => {
  const { ACTS, FINALE, MASTER } = await import(pathToFileURL(path.resolve(__dirname, '../tools/screenplay-files.mjs')));
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    for (const width of [1440, 390]) {
      const context = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 1000 } });
      context.on('page', p => p.on('pageerror', e => errors.push(String(e))));
      const page = await context.newPage();
      if (width === 1440) {
        await page.goto(base);
        await page.locator('[data-folder="09_劇本"]').click();
        const cards = await page.locator('.doc-card').evaluateAll(els => els.map(e => e.dataset.path));
        assert.deepEqual(cards.slice(0, 10), ACTS.map(a => a.path));
        await page.screenshot({ path: path.join(out, 'chapters-desktop.png') });
        pass('Cards follow prologue, I-VIII, finale order');
      }
      await page.goto(docURL(ACTS[6].path, 'act-6'));
      await ready(page, ACTS[6].path, 'act-6');
      for (const a of ACTS.slice(7)) {
        await page.locator('#readerContent a').filter({ hasText: `下一幕：${a.name}` }).first().click();
        await ready(page, a.path, `act-${a.act}`);
      }
      await page.goto(docURL(ACTS[7].path, 'act-7'));
      await ready(page, ACTS[7].path, 'act-7');
      await page.screenshot({ path: path.join(out, `act7-reader-${width}.png`) });
      const spec = page.locator('[data-doc-heading="spec-act-7"]').first();
      assert.equal(await spec.getAttribute('target'), '_blank');
      const popupPromise = context.waitForEvent('page');
      await spec.click();
      const popup = await popupPromise;
      await ready(popup, ACTS[7].specPath, 'spec-act-7');
      assert.equal(await popup.evaluate(() => window.opener), null);
      assert.equal(await page.evaluate(() => state.selected.path), ACTS[7].path);
      await popup.close();
      pass(`Reading handoffs and new-window specification at ${width}px`);
      if (width === 1440) {
        for (const [file, old, target, current] of [
          [ACTS[6].path, 'node-r28-script', ACTS[7].path, 'node-r28-script'],
          [ACTS[6].specPath, 'node-r31-images', ACTS[8].specPath, 'node-r31-images'],
          [MASTER, 'act-7', FINALE.path, 'act-9'],
          [FINALE.path, 'act-7', FINALE.path, 'act-9'],
          [FINALE.path, 'spec-act-7', FINALE.specPath, 'spec-act-9'],
        ]) {
          await page.goto(docURL(file, old));
          await ready(page, target, current);
        }
        pass('Published legacy bookmarks reach moved scenes and finale');
        await page.goto(`${base}/?static=1#${new URLSearchParams({ doc: MASTER, heading: 'act-7' })}`);
        await ready(page, FINALE.path, 'act-9');
        pass('GitHub Pages static payload preserves legacy finale bookmark');
      }
      await page.goto(`${base}/#scene=R28`);
      await page.locator('#sceneAct').waitFor();
      for (const [act, count] of [[6, 6], [7, 5], [8, 4]]) {
        await page.locator('#sceneAct').selectOption(String(act));
        assert.equal(await page.locator('.scene-node').count(), count);
      }
      await page.screenshot({ path: path.join(out, `act8-flow-${width}.png`) });
      pass(`Flow filters show 6/5/4 main nodes at ${width}px`);
      await page.goto(`${base}/building/#scene=R28`);
      await page.locator('#loading').waitFor({ state: 'detached' });
      assert.equal(await page.locator('#error').isVisible(), false);
      assert.equal(await page.locator('#act option').count(), 11);
      for (const [act, count] of [[6, 6], [7, 5], [8, 4]]) {
        await page.locator('#act').selectOption(String(act));
        assert.equal(await page.locator('#scene-list button').count(), count);
      }
      await page.locator('#scope').selectOption('act');
      await canvasCheck(page, `act8-model-${width}`);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
      pass(`3D chapter filters, rendered pixels, camera and overflow at ${width}px`);
      await context.close();
    }
    assert.deepEqual(errors, []);
    writeFileSync(path.join(out, 'results.json'), JSON.stringify({ checks, errors }, null, 2));
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
