const assert = require('node:assert/strict');
const { readFileSync, mkdirSync, writeFileSync } = require('node:fs');
const { createRequire } = require('node:module');
const path = require('node:path');
const runtime = createRequire(path.resolve(process.argv[2], '__qa__.cjs'));
const { chromium } = runtime('playwright'), sharp = runtime('sharp');
const base = process.argv[3], out = path.resolve(process.argv[4]);
const flow = JSON.parse(readFileSync(path.join(__dirname, '../scene-flow.json'), 'utf8'));
mkdirSync(out, { recursive: true });
const checks = [], errors = [];
const pass = name => { checks.push(name); console.log('PASS', name); };
const examples = ['T-R7-R8-02', 'T-R11-R12-07', 'T-R12-R14-03', 'T-R15-R16-03', 'T-R15-R16-04', 'T-R29-U4-02'];
async function select(page, id) {
  const s = flow.subscenes.find(s => s.id === id);
  const hash = new URLSearchParams({ scene: s.node, route: s.route, shot: id }).toString();
  await page.evaluate(hash => { location.hash = hash; }, hash);
  await page.waitForFunction(id => document.querySelector('#node-id').textContent.startsWith(id + ' · '), id);
  return s;
}
async function fit(page) {
  assert.deepEqual(await page.evaluate(() => {
    const bad = [];
    if (document.documentElement.scrollWidth > innerWidth + 1) bad.push('page');
    for (const el of document.querySelectorAll('header,.left,.right,#node-title,.toolbar,.controls')) {
      if (el.scrollWidth > el.clientWidth + 2) bad.push(el.id || el.className || el.tagName);
    }
    return bad;
  }), []);
}
async function pixels(page, name) {
  const canvas = page.locator('#canvas-host canvas');
  await canvas.scrollIntoViewIfNeeded();
  const before = await canvas.screenshot();
  const stats = await sharp(before).stats();
  assert(stats.channels.slice(0, 3).some(c => c.stdev > 7), name + ' nonblank');
  await page.locator('#front').click();
  await page.waitForTimeout(200);
  const a = await sharp(before).raw().toBuffer(), b = await sharp(await canvas.screenshot()).raw().toBuffer();
  assert.equal(a.length, b.length);
  let changed = 0;
  for (let i = 0; i < a.length; i++) if (Math.abs(a[i] - b[i]) > 10) changed++;
  assert(changed / a.length > .005, name + ' camera responds');
  await page.locator('#iso').click();
  await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(out, name + '.png'), fullPage: true });
}
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-unsafe-swiftshader'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(base + '/building/');
    await page.locator('#loading').waitFor({ state: 'detached' });
    assert.equal(await page.locator('.floor-label[data-tower="A"]').count(), 26);
    assert.equal(await page.locator('.floor-label[data-tower="B"]').count(), 50);
    pass('tower floor outlines stop at A26 and B50');
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: width > 800 ? 1000 : 844 });
      for (const id of examples) {
        const s = await select(page, id);
        await page.locator('#scope').selectOption('route');
        assert.equal(await page.locator('#node-floor').innerText(), `${s.building.label} · ${s.floor.label}`);
        const steps = await page.locator('#steps [data-step]').evaluateAll(es => es.map(e => e.dataset.step));
        assert.deepEqual(steps, flow.routes.find(r => r.id === s.route).steps.map(s => s.id));
        if (s.play) for (const field of ['clue', 'action', 'recovery']) assert((await page.locator('#exploration').innerText()).includes(s.play[field]));
        await fit(page);
        await pixels(page, `${id}-${width}`);
      }
      pass(`${width}px: bridges and both lifts have ordered steps, readable labels and interactive nonblank geometry`);
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    const bridge = await select(page, 'T-R7-R8-02');
    await page.locator('#reverse').click();
    assert.equal(await page.locator('#node-floor').innerText(), 'B 棟 → A 棟 · 15F');
    await page.reload();
    await page.locator('#loading').waitFor({ state: 'detached' });
    assert.equal(await page.locator('#node-floor').innerText(), 'B 棟 → A 棟 · 15F');
    await page.locator('#flow-link').click();
    await page.locator('#sceneRoute').waitFor();
    assert.equal(await page.locator('#sceneRoute').inputValue(), bridge.route);
    assert.match(await page.locator('.scene-shot-floor').innerText(), /B 棟 → A 棟 · 15F/);
    assert.match(await page.locator('.scene-child-floor').innerText(), /B 棟 → A 棟 · 15F/);
    await page.locator('.scene-3d').click();
    await page.locator('#loading').waitFor({ state: 'detached' });
    assert.equal(await page.locator('#node-floor').innerText(), 'B 棟 → A 棟 · 15F');
    pass('bridge return direction survives reload and the model-to-flow round trip');
    assert.deepEqual(errors, []);
    pass('no browser JavaScript errors');
    writeFileSync(path.join(out, 'results.json'), JSON.stringify({ checks, errors }, null, 2));
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
