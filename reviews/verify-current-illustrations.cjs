const assert = require('node:assert/strict');
const { readFileSync, mkdirSync, writeFileSync } = require('node:fs');
const { createRequire } = require('node:module');
const { pathToFileURL } = require('node:url');
const path = require('node:path');
const runtime = createRequire(path.resolve(process.argv[2], '__qa__.cjs'));
const { chromium } = runtime('playwright'), sharp = runtime('sharp');
const base = process.argv[3], out = path.resolve(process.argv[4]);
const root = path.resolve(__dirname, '..');
const manifest = JSON.parse(readFileSync(path.join(root, 'assets/illustrations/manifest.json'), 'utf8'));
const flow = JSON.parse(readFileSync(path.join(root, 'scene-flow.json'), 'utf8'));
const checks = [], errors = [];
mkdirSync(out, { recursive: true });
const pass = name => { checks.push(name); console.log(`PASS ${name}`); };
async function capture(page) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try { return await page.screenshot(); }
    catch (error) {
      if (attempt === 2 || !error.message.includes('Unable to capture screenshot')) throw error;
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    }
  }
}
async function ready(page, doc, heading) {
  await page.waitForFunction(({ doc, heading }) => state.selected?.path === doc && document.getElementById(heading), { doc, heading });
}
(async () => {
  const { buildBoards } = await import(pathToFileURL(path.join(root, 'tools/build-illustration-boards.mjs')));
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-unsafe-swiftshader'] });
  try {
    const context = await browser.newContext();
    context.on('page', page => page.on('pageerror', error => errors.push(error.message)));
    const page = await context.newPage();
    await page.setViewportSize({ width: 1200, height: 1100 });
    for (const id of buildBoards().keys()) {
      await page.goto(`${base}/assets/illustrations/current/${id}.svg`);
      const result = await page.evaluate(async () => {
        await document.fonts.ready;
        const svg = document.querySelector('svg'), bounds = svg.viewBox.baseVal;
        const globalBox = el => {
          const b = el.getBBox(), m = svg.getCTM().inverse().multiply(el.getCTM());
          const corners = [[b.x, b.y], [b.x + b.width, b.y], [b.x, b.y + b.height], [b.x + b.width, b.y + b.height]]
            .map(([x, y]) => new DOMPoint(x, y).matrixTransform(m));
          const x = Math.min(...corners.map(p => p.x)), y = Math.min(...corners.map(p => p.y));
          return { x, y, width: Math.max(...corners.map(p => p.x)) - x, height: Math.max(...corners.map(p => p.y)) - y };
        };
        const texts = [...svg.querySelectorAll('text')].map(el => ({ text: el.textContent, box: globalBox(el) }));
        const outside = texts.filter(({ box: b }) => b.x < 0 || b.y < 0 || b.x + b.width > bounds.width || b.y + b.height > bounds.height).map(t => t.text);
        const overlap = texts.flatMap((a, i) => texts.slice(i + 1).filter(b => Math.min(a.box.x + a.box.width, b.box.x + b.box.width) - Math.max(a.box.x, b.box.x) > 1 && Math.min(a.box.y + a.box.height, b.box.y + b.box.height) - Math.max(a.box.y, b.box.y) > 1).map(b => `${a.text} / ${b.text}`));
        const panelOverflow = [...svg.querySelectorAll('[data-panel]')].flatMap(g => {
          const r = globalBox(g.querySelector('rect'));
          return [...g.querySelectorAll('text')].filter(t => { const b = globalBox(t); return b.x < r.x || b.x + b.width > r.x + r.width || b.y < r.y || b.y + b.height > r.y + r.height; }).map(t => t.textContent);
        });
        return { outside, overlap, panelOverflow };
      });
      assert.deepEqual(result, { outside: [], overlap: [], panelOverflow: [] }, id);
      const shot = await capture(page);
      assert((await sharp(shot).stats()).channels.slice(0, 3).some(c => c.stdev > 10), `${id} nonblank`);
      if (['V09', 'V10', 'V12', 'L09', 'L02', 'L05', 'V38', 'WORLD', 'CORE', 'REF-U4', 'REF-MECHANISM', 'REF-LIFT'].includes(id)) writeFileSync(path.join(out, `${id}.png`), shot);
      pass(`${id}: SVG text stays in bounds, without overlap, and renders nonblank`);
    }
    await page.goto(base);
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      for (const figure of manifest.figures) {
        const doc = figure.source.replace(/^docs\//, ''), heading = figure.heading;
        await page.evaluate(hash => { location.hash = hash; }, new URLSearchParams({ doc, heading }).toString());
        await ready(page, doc, heading);
        for (const asset of [figure.asset, ...(figure.supplement || [])]) {
          const target = page.locator(`#readerContent img[src$="${asset.split('/').at(-1)}"]`);
          assert.equal(await target.count(), 1, `${figure.id} embedded once: ${asset}`);
          await target.scrollIntoViewIfNeeded();
          await target.evaluate(img => img.decode());
          assert(await target.evaluate(img => img.naturalWidth > 0 && img.naturalHeight > 0), asset);
        }
        const fits = await page.evaluate(() => {
          const panel = document.querySelector('.reader-panel');
          return document.documentElement.scrollWidth <= innerWidth + 1 && panel.scrollWidth <= panel.clientWidth + 1;
        });
        assert(fits, `${figure.id} reader ${width}px`);
        if (['L02', 'V13', 'WORLD-ART', 'V39', 'REF-U4', 'REF-LIFT', 'REF-MECHANISM'].includes(figure.id)) await page.screenshot({ path: path.join(out, `${figure.id}-reader-${width}.png`) });
      }
      pass(`All ${manifest.figures.length} manifest images load in the reader at ${width}px without overflow`);
    }
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.goto(`${base}/building/#scene=R1`);
      await page.waitForSelector('#loading', { state: 'detached' });
      assert(await page.locator('#error').isHidden());
      for (const id of ['R1', 'R16', 'R22', 'R32', 'M1', 'U4']) {
        await page.evaluate(id => { location.hash = `scene=${id}`; }, id);
        await page.waitForFunction(id => document.querySelector('#node-id').textContent.startsWith(`${id} · `), id);
        const img = page.locator('#reference-image');
        await img.evaluate(img => img.decode());
        assert((await img.getAttribute('src')).endsWith(flow.nodes.find(n => n.id === id).reference.url), id);
        assert(await img.evaluate(img => img.naturalWidth > 0), id);
      }
      await page.locator('#floor').selectOption('50');
      await page.locator('#iso').click();
      await page.waitForTimeout(300);
      const canvas = page.locator('#canvas-host canvas');
      await canvas.scrollIntoViewIfNeeded();
      const before = await canvas.screenshot();
      assert((await sharp(before).stats()).channels.slice(0, 3).some(c => c.stdev > 7), '3D nonblank');
      await page.locator('#front').click();
      await page.waitForTimeout(400);
      const after = await canvas.screenshot();
      const a = await sharp(before).raw().toBuffer(), b = await sharp(after).raw().toBuffer();
      assert.equal(a.length, b.length);
      let changed = 0;
      for (let i = 0; i < a.length; i++) if (Math.abs(a[i] - b[i]) > 10) changed++;
      assert(changed / a.length > .005, `3D camera changes pixels: ${changed / a.length}`);
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      await page.screenshot({ path: path.join(out, `model-reference-${width}.png`) });
      pass(`3D references use current art at ${width}px; canvas is nonblank and camera interactive`);
    }
    assert.deepEqual(errors, []);
    writeFileSync(path.join(out, 'result.json'), JSON.stringify({ checks, errors, scope: 'Documentation and 3D reference rendering only; not engine gameplay or formal art approval.' }, null, 2));
    console.log(`${checks.length} browser checks passed.`);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
