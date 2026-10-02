// Run against tools/serve.mjs with a package directory containing Playwright.
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const { readFileSync, mkdirSync, writeFileSync } = require('node:fs');
const path = require('node:path');
const runtime = createRequire(path.resolve(process.argv[2] || 'node_modules', '__qa__.cjs'));
const { chromium } = runtime('playwright');
const base = process.argv[3] || 'http://127.0.0.1:8767';
const out = path.resolve(process.argv[4] || 'reviews/scene-flow-browser');
const flow = JSON.parse(readFileSync(path.join(__dirname, '../scene-flow.json'), 'utf8'));
const graph = JSON.parse(readFileSync(path.join(__dirname, '../scene_graph.json'), 'utf8'));
const errors = [], checks = [];
mkdirSync(out, { recursive: true });
function pass(name) { checks.push(name); console.log(`PASS ${name}`); }
const params = (scene, route = '', shot = '', direction = '') => new URLSearchParams({ scene, route, shot, direction }).toString();
const ids = page => page.locator('[data-shot]').evaluateAll(els => els.map(el => el.dataset.shot));
async function choose(page, scene, route = '', shot = '', direction = '') {
  await page.evaluate(hash => { location.hash = hash; }, params(scene, route, shot, direction));
  await page.waitForFunction(({ scene, route, shot }) => document.querySelector('.scene-node.selected')?.dataset.node === scene && (!route || document.querySelector('#sceneRoute')?.value === route) && (!shot || document.querySelector('[data-shot][aria-pressed="true"]')?.dataset.shot === shot), { scene, route, shot });
}
async function overflow(page) {
  const bad = await page.evaluate(() => {
    const result = [];
    if (document.documentElement.scrollWidth > innerWidth + 1) result.push('page');
    for (const el of document.querySelectorAll('.scene-route-step,.scene-shot-detail,.scene-route-controls,.scene-route-gates')) {
      if (el.scrollWidth > el.clientWidth + 1 || el.getBoundingClientRect().right > innerWidth + 1) result.push(el.className);
    }
    return result;
  });
  assert.deepEqual(bad, []);
}
async function reference(page) {
  const img = page.locator('.scene-reference img');
  await img.scrollIntoViewIfNeeded();
  await page.waitForFunction(() => { const img = document.querySelector('.scene-reference img'); return img.complete && img.naturalWidth > 0; });
  assert.match(await page.locator('.scene-reference figcaption').innerText(), /非遊戲背景|非正式素材/);
}

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    context.on('page', page => page.on('pageerror', error => errors.push(String(error))));
    const page = await context.newPage();
    await page.goto(`${base}/#scene=R2`);
    await page.locator('#sceneRoute').waitFor();
    assert.equal(await page.locator('.scene-node').count(), 48);
    assert.deepEqual(await ids(page), ['R2', 'T-R2-R3-01', 'T-R2-R3-02', 'R3']);
    await page.screenshot({ path: path.join(out, 'overview-desktop.png') });
    await page.locator('#sceneRoutePanel').scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(out, 'route-desktop.png') });
    await overflow(page);
    pass('main overview expands R2 to R3 into its four ordered pictures');

    await page.locator('[data-shot="T-R2-R3-01"]').click();
    assert.match(await page.locator('.scene-shot-detail h4').innerText(), /T-R2-R3-01.*後廚服務巷/);
    await page.locator('.scene-closeups>summary').click();
    assert.equal(await page.locator('.scene-closeups li').count(), 1);
    assert.match(await page.locator('.scene-closeups').innerText(), /T-R2-R3-01-C01/);
    await reference(page);
    assert.match(await page.locator('.scene-reference figcaption').innerText(), /所屬主場景參考/);
    pass('close-up remains attached to the transition and references are labeled');

    const original = page.url();
    const opened = context.waitForEvent('page');
    await page.locator('.scene-shot-detail [data-heading="subscene-t-r2-r3-01-spec"]').click();
    const popup = await opened;
    await popup.locator('#readerOverlay:not(.hidden)').waitFor();
    await popup.locator('[id="subscene-t-r2-r3-01-spec"]').waitFor({ state: 'attached' });
    assert.equal(new URLSearchParams(new URL(popup.url()).hash.slice(1)).get('heading'), 'subscene-t-r2-r3-01-spec');
    assert.equal(await popup.evaluate(() => window.opener), null);
    assert.equal(page.url(), original);
    await popup.close();
    pass('transition specification opens in a separate page at the correct anchor');

    await page.locator('[data-direction="return"]').click();
    assert.deepEqual(await ids(page), ['R3', 'T-R2-R3-02', 'T-R2-R3-01', 'R2']);
    await page.reload();
    await page.locator('#sceneRoute').waitFor();
    assert.deepEqual(await ids(page), ['R3', 'T-R2-R3-02', 'T-R2-R3-01', 'R2']);
    assert.equal(await page.locator('[data-shot][aria-pressed="true"]').getAttribute('data-shot'), 'T-R2-R3-01');
    pass('return order and selected transition survive a deep-link reload');

    for (const route of flow.routes) {
      await choose(page, route.from, route.id);
      assert.deepEqual(await ids(page), route.steps.map(s => s.id), route.id);
      assert.equal(await page.locator('[data-direction="return"]').isDisabled(), !route.back, route.id);
      assert((await page.locator('.scene-route-gates').innerText()).includes(graph.edges.find(e => e.id === route.id).gate), route.id);
      for (const child of flow.subscenes.filter(s => s.route === route.id)) {
        await page.locator(`[data-shot="${child.id}"]`).click();
        assert((await page.locator('.scene-shot-detail h4').innerText()).includes(child.id));
        assert.equal(await page.locator('.scene-closeups li').count(), child.details.length);
      }
    }
    pass('all 56 routes and 34 subscenes render with original gates and one-way restrictions');

    await choose(page, 'R33', 'R33-P1-43', 'P1');
    assert.match(await page.locator('.scene-shot-detail h4').innerText(), /R33-V02.*肉身回返/);
    assert(!(await page.locator('.scene-route-panel').innerText()).includes('P1-V01'));
    assert.match(await page.locator('.scene-route-kind').innerText(), /非自由探索/);
    await choose(page, 'R22', 'R22-R23-31');
    assert.match(await page.locator('.scene-route-kind').innerText(), /跨部銜接/);
    await choose(page, 'U4', 'U4-U4-lower');
    assert.deepEqual(await ids(page), ['U4']);
    assert.equal(await page.locator('.scene-canvas svg path[stroke-dasharray]').count() > 0, true);
    await choose(page, 'U3', 'U3-U1-return');
    await page.locator('[data-direction="return"]').click();
    assert.deepEqual(await ids(page), ['U1', 'U3-V02', 'U3']);
    assert.match(await page.locator('.scene-route-gates').innerText(), /return_latch_open/);
    pass('ending, part boundary, original-view loop and optional shortcut retain their distinctions');

    await choose(page, 'R8', 'R8-R9-12');
    await page.locator('[data-route="R8-R10-13"]').click();
    assert.deepEqual(await ids(page), ['R8', 'R8-V03', 'R10']);
    await page.locator('[data-shot="R8"]').click();
    await reference(page);
    pass('exit buttons select their own route and existing access sketches load');

    await page.locator('#scenePart').selectOption('1');
    assert.equal(await page.locator('.scene-node').count(), 26);
    await choose(page, 'R33', 'R33-P1-43');
    assert.equal(await page.locator('#scenePart').inputValue(), 'all');
    await page.locator('#sceneAct').selectOption('1');
    assert.equal(await page.locator('.scene-node').count(), graph.nodes.filter(n => n.act === 1).length);
    await page.locator('#sceneAct').selectOption('all');
    await page.locator('#searchInput').fill('T-R2-R3-01');
    assert.equal(await page.locator('.scene-node').count(), 1);
    assert.equal(await page.locator('.scene-node.selected').getAttribute('data-node'), 'R2');
    await page.locator('[data-follow="R3"]').click();
    assert.equal(await page.locator('.scene-node.selected').getAttribute('data-node'), 'R3');
    assert.equal(await page.locator('#searchInput').inputValue(), '');
    assert.equal(await page.locator('.scene-node').count(), 48);
    await page.locator('#searchInput').fill('NO_MATCH_FOR_SCENE');
    assert.equal(await page.locator('.scene-node').count(), 0);
    assert.equal(await page.locator('.scene-detail').isVisible(), false);
    assert.equal(await page.locator('.scene-route-panel').count(), 0);
    await page.locator('#searchInput').fill('');
    await page.locator('[data-fit]').click();
    await page.locator('[data-zoom="0.15"]').click();
    await page.locator('#sceneAllEdges').check();
    pass('filters, child-ID search, empty state, zoom and cross-part deep links work');

    for (const viewport of [{ width: 1920, height: 1080 }, { width: 390, height: 844 }]) {
      await page.setViewportSize(viewport);
      if (viewport.width < 760) await page.waitForFunction(() => document.querySelector('.sidebar').getBoundingClientRect().right <= 0);
      await choose(page, 'R2', 'R2-R3-5', 'T-R2-R3-02');
      await page.locator('#sceneRoutePanel').evaluate(el => el.scrollIntoView({ block: 'start' }));
      await overflow(page);
      await page.screenshot({ path: path.join(out, `route-${viewport.width}.png`) });
      await page.locator('.scene-shot-detail').evaluate(el => el.scrollIntoView({ block: 'start' }));
      await page.screenshot({ path: path.join(out, `picture-${viewport.width}.png`) });
      await reference(page);
    }
    pass('desktop and mobile route panels fit and reference pictures are nonblank');

    await page.goto(`${base}/?static=1#scene=R2`);
    await page.locator('#sceneRoute').waitFor();
    assert.deepEqual(await ids(page), ['R2', 'T-R2-R3-01', 'T-R2-R3-02', 'R3']);
    pass('GitHub Pages static document mode uses the same flow data');

    const failed = await context.newPage();
    await failed.route('**/scene-flow.json?*', route => route.fulfill({ status: 404, body: 'Not found' }));
    await failed.goto(`${base}/#scene=R2`);
    await failed.locator('.scene-mode [role="alert"]').waitFor();
    assert.equal(await failed.locator('.scene-route-panel').count(), 0);
    await failed.close();
    pass('missing route data reports failure instead of rendering stale or partial routes');
    assert.deepEqual(errors, []);
    writeFileSync(path.join(out, 'result.json'), JSON.stringify({ checks, errors }, null, 2));
    console.log(`${checks.length} browser checks passed.`);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
