// Run against tools/serve.mjs. Pass a package directory containing playwright and sharp.
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const { mkdirSync, writeFileSync, readFileSync } = require('node:fs');
const path = require('node:path');
const runtime = createRequire(path.resolve(process.argv[2] || 'node_modules', '__qa__.cjs'));
const { chromium } = runtime('playwright');
const sharp = runtime('sharp');
const base = process.argv[3] || 'http://127.0.0.1:8765';
const master = '09_劇本/09-14_全劇本與關卡整合稿.md';
const out = path.resolve(__dirname, process.argv[4] || 'canonical-browser');
const expectedAnchors = [...readFileSync(path.join(__dirname, '..', 'docs', master), 'utf8').matchAll(/<a id="[^"]+"><\/a>/g)].length;
mkdirSync(out, { recursive: true });
const checks = [];
const errors = [];
function pass(name, detail) { checks.push({ name, detail }); console.log(`PASS ${name}`, detail || ''); }
const docUrl = (doc, heading = '') => `${base}/#${new URLSearchParams({ doc, heading })}`;

async function readerReady(page, anchor) {
  await page.locator('#readerOverlay:not(.hidden)').waitFor();
  await page.waitForFunction(id => {
    const el = document.getElementById(id);
    return el && el.getBoundingClientRect().top >= 70 && el.getBoundingClientRect().top < 150;
  }, anchor);
  assert.match(await page.locator('#readerPath').innerText(), /正式劇本.*全劇本與關卡整合稿/);
}

async function canvasCheck(page, name) {
  const canvas = page.locator('#canvas-host canvas');
  await canvas.waitFor();
  await page.waitForFunction(() => document.querySelectorAll('.room-tag').length === 26);
  const first = await canvas.screenshot();
  const stats = await sharp(first).stats();
  assert(stats.channels.slice(0, 3).some(c => c.stdev > 8), 'canvas is nonblank');
  await page.locator('#front').click();
  const second = await canvas.screenshot();
  const before = await sharp(first).removeAlpha().raw().toBuffer();
  const after = await sharp(second).removeAlpha().raw().toBuffer();
  assert.equal(before.length, after.length);
  let changed = 0;
  for (let i = 0; i < before.length; i += 3) {
    if (Math.abs(before[i] - after[i]) + Math.abs(before[i + 1] - after[i + 1]) + Math.abs(before[i + 2] - after[i + 2]) > 30) changed++;
  }
  const ratio = changed / (before.length / 3);
  assert(ratio > 0.005, 'camera control changes canvas pixels');
  await page.locator('#iso').click();
  await page.screenshot({ path: path.join(out, `${name}.png`), fullPage: true });
  pass(name, { channelDeviation: stats.channels.slice(0, 3).map(c => +c.stdev.toFixed(2)), changedRatio: +ratio.toFixed(4) });
}

(async () => {
  const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome', headless: true, args: ['--enable-unsafe-swiftshader'] });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    context.on('page', page => page.on('pageerror', error => errors.push(error.message)));
    const page = await context.newPage();
    page.setDefaultTimeout(45000);
    await page.goto(base);
    await page.locator('[data-folder="09_劇本"]').click();
    assert.equal(await page.locator('#documentGrid .doc-card').count(), 1);
    pass('one visible canonical screenplay');

    await page.goto(docUrl(master, 'node-r8-script'));
    await readerReady(page, 'node-r8-script');
    assert.equal(await page.locator('#readerContent .md-anchor').count(), expectedAnchors);
    assert(!await page.locator('#readerContent').innerText().then(t => t.includes('<!-- import:')));
    assert(!await page.locator('#readerContent').innerText().then(t => t.includes('canonical-source:')));
    await page.screenshot({ path: path.join(out, 'reader-desktop.png') });
    pass('canonical anchors and import markers');

    const ordered = await page.evaluate(() => {
      const before = (a, b) => Boolean(document.getElementById(a).compareDocumentPosition(document.getElementById(b)) & Node.DOCUMENT_POSITION_FOLLOWING);
      return before('act-0', 'act-7') && before('node-post-script', 'book-specs') &&
        before('book-specs', 'node-r8-visual') && before('book-specs', 'book-appendices') && before('book-appendices', 'book-payoffs');
    });
    assert(ordered);
    pass('sequential story before production and spoiler appendices');
    await page.locator('[data-doc-heading="node-r8-spec"]').first().click();
    await readerReady(page, 'node-r8-spec');
    await page.locator('[data-doc-heading="node-r8-script"]').first().click();
    await readerReady(page, 'node-r8-script');
    pass('story and room specification round-trip');

    const samePage = page.locator('[data-doc-heading="node-r1-script"]').first();
    await samePage.click();
    await readerReady(page, 'node-r1-script');
    pass('in-document navigation');

    const images = await page.locator('#readerContent img').evaluateAll(imgs => imgs.map(img => img.src));
    assert.equal(images.length, 56);
    assert(images.every(src => new URL(src).pathname.startsWith('/assets/') && !src.includes('/assets/assets/')));
    for (const src of new Set(images)) {
      const response = await page.request.get(src);
      assert(response.ok(), src);
    }
    const image = page.locator('#readerContent img').first();
    await image.scrollIntoViewIfNeeded();
    await page.waitForFunction(() => { const img = document.querySelector('#readerContent img'); return img.complete && img.naturalWidth > 0; });
    await page.screenshot({ path: path.join(out, 'reader-image.png') });
    pass('56 image URLs and lazy image rendering');

    await page.goto(docUrl('06_關卡規格/06-02_第一幕_門面與棚.md'));
    await readerReady(page, 'act-1');
    pass('legacy level URL redirects to canonical act');

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(docUrl(master, 'node-r8-script'));
    await readerReady(page, 'node-r8-script');
    const overflow = await page.locator('.reader-panel').evaluate(el => el.scrollWidth - el.clientWidth);
    await page.screenshot({ path: path.join(out, 'reader-mobile.png') });
    if (overflow > 1) console.log(await page.locator('.reader-panel').evaluate(el => [...el.querySelectorAll('*')].filter(item => !item.closest('.md-table-wrap') && item.scrollWidth > item.clientWidth + 2).slice(0, 10).map(item => ({ tag: item.tagName, class: item.className, width: item.clientWidth, scrollWidth: item.scrollWidth, text: item.textContent.slice(0, 150) }))));
    assert(overflow <= 1, `reader horizontal overflow: ${overflow}`);
    assert(await page.evaluate(() => Boolean(document.elementFromPoint(25, 120)?.closest('#readerOverlay'))), 'sidebar must not cover the reader');
    pass('mobile canonical reader', { width: 390, overflow });

    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(`${base}/#scene=R8`);
    await page.locator('.scene-node[data-node="R8"][aria-pressed="true"]').waitFor();
    assert.equal(await page.locator('.scene-node').count(), 48);
    assert((await page.locator('.scene-edge').allInnerTexts()).some(t => t.includes('不作出口門檻')));
    const popupPromise = context.waitForEvent('page');
    await page.locator('.scene-source [data-source]').first().click();
    const popup = await popupPromise;
    await readerReady(popup, 'node-r8-script');
    await popup.close();
    pass('48-node graph opens correct canonical scene');

    await page.goto(`${base}/building/#scene=R8`);
    await page.locator('#room-id').filter({ hasText: 'R8' }).waitFor();
    assert.equal(await page.locator('#room-picker option').count(), 26);
    const source = new URL(await page.locator('#source-link').getAttribute('href'), page.url());
    const params = new URLSearchParams(source.hash.slice(1));
    assert.equal(params.get('doc'), master);
    assert.equal(params.get('heading'), 'node-r8-level');
    pass('3D source and node count');
    await canvasCheck(page, 'model-desktop');
    await page.locator('#room-picker').selectOption('R11');
    assert.equal((await page.locator('#room-id').innerText()).trim(), 'R11');
    await page.locator('#edit-mode-switch').click();
    assert.equal(await page.locator('#edit-mode-switch').getAttribute('aria-checked'), 'true');
    await page.locator('#edit-mode-switch').click();
    pass('3D room selection and editor mode remain interactive');
    await page.setViewportSize({ width: 390, height: 844 });
    await canvasCheck(page, 'model-mobile');

    // Exercise published docs.json too, not only the local live-document API.
    await page.route('**/api/docs', route => route.fulfill({ status: 404, body: 'not found' }));
    await page.goto(docUrl(master, 'node-r33-script'));
    await readerReady(page, 'node-r33-script');
    pass('static docs.json fallback opens ending');
    assert.deepEqual(errors, []);
    pass('no JavaScript page errors');
    writeFileSync(path.join(out, 'results.json'), JSON.stringify({ base, checks, errors }, null, 2));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
