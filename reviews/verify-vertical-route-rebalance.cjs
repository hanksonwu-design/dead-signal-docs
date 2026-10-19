const assert = require('node:assert/strict');
const { readFileSync, mkdirSync, writeFileSync } = require('node:fs');
const { createRequire } = require('node:module');
const path = require('node:path');
const runtime = createRequire(path.resolve(process.argv[2], '__qa__.cjs'));
const { chromium } = runtime('playwright');
const sharp = runtime('sharp');
const base = process.argv[3] || 'http://127.0.0.1:8770';
const output = path.resolve(process.argv[4] || 'reviews/2026-10-16-vertical-route-browser');
mkdirSync(output, { recursive: true });
const flow = JSON.parse(readFileSync(path.join(__dirname, '../scene-flow.json'), 'utf8'));
const errors = [], checks = [];
const pass = label => { checks.push(label); console.log('PASS', label); };
async function select(page, scene, shot = '', reverse = false) {
  const route = shot ? flow.subscenes.find(s => s.id === shot).route : '';
  await page.evaluate(hash => { location.hash = hash; }, new URLSearchParams({ scene, route, shot, direction: reverse ? 'return' : 'forward' }).toString());
  await page.waitForFunction(id => document.querySelector('#node-id')?.textContent.startsWith(id + ' · '), shot || scene);
}
async function screen(page, name) {
  assert.equal(await page.locator('#error').isHidden(), true);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
  const image = await page.locator('#canvas-host canvas').screenshot();
  assert((await sharp(image).stats()).channels.slice(0, 3).some(c => c.stdev > 7));
  await page.screenshot({ path: path.join(output, name + '.png'), fullPage: true });
}
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-unsafe-swiftshader'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(base + '/building/#scene=R17');
    await page.locator('#loading').waitFor({ state: 'detached' });
    for (const [id, floor] of [['R17', '32F'], ['R18', '28F'], ['R19', '28F'], ['R20', '28F'], ['R21', '29F'], ['R22', '30F'], ['R23', '31F'], ['R24', '31F'], ['R25', '34F'], ['R26', '34F'], ['M1', '34F → 35F'], ['R27', '35F'], ['U1', '41F'], ['U3', '41F'], ['R28', '47F'], ['R32', '50F']]) {
      await select(page, id);
      const zone = ['R18', 'R19', 'R20', 'R21', 'R22'].includes(id) ? ' · 隔離校正內翼' : ['R23', 'R24'].includes(id) ? ' · 檔案新翼' : '';
      assert.equal(await page.locator('#node-floor').innerText(), 'B 棟 · ' + floor + zone, id);
    }
    pass('upper descent, release boundary and lower distribution display their exact floors');
    for (const [index, floor] of [31, 30, 29, 28].entries()) {
      const id = `T-R17-R18-${String(index + 1).padStart(2, '0')}`;
      await select(page, 'R17', id);
      assert.equal(await page.locator('#node-floor').innerText(), `B 棟 · ${floor}F`);
      assert.match(await page.locator('#node-links').innerText(), /劇本|製作/);
    }
    await screen(page, 'c02-descent-desktop');
    pass('all four C-02 descending platforms can be selected in order');
    for (const id of ['T-R24-R25-01', 'T-R27-U1-01', 'T-U3-R28-01']) {
      const child = flow.subscenes.find(s => s.id === id);
      assert(child.play, id);
      const expected = child.floor.levels;
      assert(expected.length >= 4, id);
      for (let i = 1; i < expected.length; i++) assert.equal(expected[i] - expected[i - 1], 1, id);
      await select(page, child.node, id);
      assert.equal(await page.locator('#node-floor').innerText(), `${child.building.label} · ${child.floor.label}`);
      await select(page, child.node, id, true);
      assert.equal(await page.locator('#node-floor').innerText(), `${child.building.reverseLabel} · ${child.floor.reverseLabel}`);
    }
    await screen(page, 'lower-platforms-desktop');
    pass('all three multi-platform routes show each intervening floor in both directions');
    const hp03 = 'T-R24-R25-01-horror', routeCue = 'T-R24-R25-01-puzzle';
    await select(page, 'R24', 'T-R24-R25-01');
    await page.locator(`[data-marker-select="${hp03}"]`).click();
    await page.locator('#focus').click();
    await page.waitForTimeout(200);
    assert(await page.locator(`.content-marker[data-marker="${hp03}"]`).isVisible());
    for (const floor of [31, 32, 33, 34]) {
      await page.locator('#floor').selectOption(String(floor));
      await select(page, 'R24', 'T-R24-R25-01');
      assert.equal(await page.locator(`[data-marker-select="${hp03}"]`).count(), floor === 31 ? 1 : 0);
      assert.equal(await page.locator(`[data-marker-select="${routeCue}"]`).count(), 1);
      if (floor === 31) {
        await page.locator(`[data-marker-select="${hp03}"]`).click();
        await page.locator('#focus').click();
        await page.waitForTimeout(200);
        assert(await page.locator(`.content-marker[data-marker="${hp03}"]`).isVisible());
        await screen(page, 'hp03-fixed-31f');
      } else {
        assert(await page.locator(`.content-marker[data-marker="${hp03}"]`).isHidden());
        await page.locator(`[data-marker-select="${routeCue}"]`).click();
        await page.locator('#focus').click();
        await page.waitForTimeout(200);
        assert(await page.locator(`.content-marker[data-marker="${routeCue}"]`).isVisible());
        assert(await page.locator(`.content-marker[data-marker="${hp03}"]`).isHidden());
      }
    }
    await page.locator('#floor').selectOption('all');
    pass('HP-03 stays on 31F while route cues remain available on every landing');
    await select(page, 'R6');
    for (const floor of [33, 36, 37, 38, 39, 40, 42, 43, 44, 45, 46]) {
      await page.locator('#floor').selectOption(String(floor));
      const expected = flow.subscenes.find(s => s.floor.levels.length > 1 && s.floor.levels.includes(floor));
      assert(expected, `authored route at ${floor}F`);
      assert((await page.locator('#node-id').innerText()).startsWith(expected.id + ' · '), `${floor}F selects its actual route`);
      const params = new URLSearchParams(new URL(page.url()).hash.slice(1));
      assert.equal(params.get('scene'), expected.node);
      assert.equal(params.get('shot'), expected.id);
      assert.equal(params.get('route'), expected.route);
      assert.equal(await page.locator('#floor').inputValue(), String(floor));
    }
    await page.locator('#floor').selectOption('33');
    await page.locator('#focus').click();
    await screen(page, '33f-platform-selected');
    await select(page, 'R27', 'T-R27-U1-01', true);
    for (const floor of [38, 39]) {
      await page.locator('#floor').selectOption(String(floor));
      assert.equal(new URLSearchParams(new URL(page.url()).hash.slice(1)).get('direction'), 'return');
      assert((await page.locator('#node-id').innerText()).startsWith('T-R27-U1-01 · '));
    }
    await page.locator('#floor').selectOption('33');
    assert.equal(new URLSearchParams(new URL(page.url()).hash.slice(1)).get('direction'), null);
    pass('route-only floors select their own platform context in the map, detail panel and URL');
    for (const scope of ['all', 'route', 'act']) {
      await page.locator('#floor').selectOption('33');
      assert.equal(await page.locator(`[data-marker-select="${hp03}"]`).count(), 0);
      await page.locator('#scope').selectOption(scope);
      assert.equal(await page.locator('#floor').inputValue(), 'all');
      assert.equal(await page.locator(`[data-marker-select="${hp03}"]`).count(), 1);
      assert.equal(await page.locator(`[data-marker-select="${routeCue}"]`).count(), 1);
    }
    await page.locator(`[data-marker-select="${hp03}"]`).click();
    await page.locator('#focus').click();
    await page.waitForTimeout(200);
    assert(await page.locator(`.content-marker[data-marker="${hp03}"]`).isVisible());
    assert.match(await page.locator('#marker-detail').innerText(), /封板內的壓力/);
    await screen(page, 'hp03-restored-after-scope');
    pass('leaving a floor slice restores HP-03 in both the map and detail list for all scopes');
    await page.locator('#part').selectOption('1');
    await page.locator('#floor').selectOption('33');
    assert.equal(await page.locator('#part').inputValue(), '1');
    assert.equal(await page.locator('#floor').inputValue(), 'all');
    assert.match(await page.locator('#node-id').innerText(), /上部/);
    await page.locator('#part').selectOption('all');
    pass('a floor without content in the selected part clears the floor filter without crossing parts');
    await page.setViewportSize({ width: 390, height: 844 });
    await select(page, 'R22');
    await screen(page, 'release-mobile');
    await select(page, 'R23');
    await screen(page, 'archive-wing-mobile');
    pass('release and archive entrance render without overflow on mobile');
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    writeFileSync(path.join(output, 'result.json'), JSON.stringify({ checks, errors }, null, 2) + '\n');
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
