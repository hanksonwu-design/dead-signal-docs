const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const { mkdirSync, writeFileSync } = require('node:fs');
const { pathToFileURL } = require('node:url');
const path = require('node:path');
const runtime = createRequire(path.resolve(process.argv[2], '__qa__.cjs'));
const { chromium } = runtime('playwright');
const base = process.argv[3], out = path.resolve(process.argv[4]);
const root = path.resolve(__dirname, '..');
mkdirSync(out, { recursive: true });
const checks = [], errors = [];
const pass = name => { checks.push(name); console.log(`PASS ${name}`); };
const url = (doc, heading) => `${base}/#${new URLSearchParams({ doc, heading })}`;
async function ready(page, doc, heading) {
  await page.waitForFunction(({ doc, heading }) => state.selected?.path === doc && document.getElementById(heading), { doc, heading });
}
(async () => {
  const { LAYOUTS } = await import(pathToFileURL(path.join(root, 'tools/build-access-layouts.mjs')));
  const graph = require('../scene_graph.json');
  const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome', headless: true });
  try {
    const context = await browser.newContext();
    context.on('page', page => page.on('pageerror', error => errors.push(error.message)));
    const page = await context.newPage();
    for (const layout of LAYOUTS) {
      await page.setViewportSize({ width: 1100, height: 1050 });
      await page.goto(`${base}/assets/scene_access/${layout.id.toLowerCase()}.svg`);
      const result = await page.evaluate(async () => {
        const svg = document.querySelector('svg'), bounds = svg.viewBox.baseVal;
        await document.fonts.ready;
        const texts = [...svg.querySelectorAll('text')].map(el => ({ text: el.textContent, box: el.getBBox() }));
        const outside = texts.filter(({ box: b }) => b.x < 0 || b.y < 0 || b.x + b.width > bounds.width || b.y + b.height > bounds.height).map(t => t.text);
        const overlap = texts.flatMap((a, i) => texts.slice(i + 1).filter(b => Math.min(a.box.x + a.box.width, b.box.x + b.box.width) - Math.max(a.box.x, b.box.x) > 1 && Math.min(a.box.y + a.box.height, b.box.y + b.box.height) - Math.max(a.box.y, b.box.y) > 1).map(b => `${a.text} / ${b.text}`));
        const labelOverflow = [...svg.querySelectorAll('[data-port]')].flatMap(g => {
          const r = g.querySelector('rect').getBBox();
          return [...g.querySelectorAll('text')].filter(t => { const b = t.getBBox(); return b.x < r.x || b.x + b.width > r.x + r.width || b.y < r.y || b.y + b.height > r.y + r.height; }).map(t => t.textContent);
        });
        const blob = new Blob([new XMLSerializer().serializeToString(svg)], { type: 'image/svg+xml' });
        const src = URL.createObjectURL(blob), img = new Image(); img.src = src; await img.decode();
        const canvas = document.createElementNS('http://www.w3.org/1999/xhtml', 'canvas'); canvas.width = canvas.height = 128;
        const ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0, 128, 128); URL.revokeObjectURL(src);
        const data = ctx.getImageData(0, 0, 128, 128).data;
        let ink = 0; for (let i = 0; i < data.length; i += 4) if (Math.min(data[i], data[i + 1], data[i + 2]) < 200 && data[i + 3]) ink++;
        return { outside, overlap, labelOverflow, ink };
      });
      assert.deepEqual(result.outside, [], `${layout.id} outside`);
      assert.deepEqual(result.overlap, [], `${layout.id} overlapping text`);
      assert.deepEqual(result.labelOverflow, [], `${layout.id} port label`);
      assert(result.ink > 500, `${layout.id} nonblank pixels: ${result.ink}`);
      await page.screenshot({ path: path.join(out, `${layout.id}.png`), clip: { x: 0, y: 0, width: 1100, height: 1050 } });
      pass(`${layout.id} SVG renders nonblank with contained, nonoverlapping labels`);
    }
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      for (const layout of LAYOUTS) {
        const node = graph.nodes.find(n => n.id === layout.id), heading = `node-${node.id.toLowerCase()}-access-layout`;
        await page.goto(url(node.pack, heading)); await ready(page, node.pack, heading);
        const img = page.locator(`#readerContent img[alt="${node.id} 出入口配置草圖"]`);
        await img.scrollIntoViewIfNeeded();
        await img.evaluate(img => img.decode());
        assert.equal(await img.evaluate(img => img.naturalWidth), 1100);
        const fits = await page.evaluate(() => {
          const panel = document.querySelector('.reader-panel');
          return document.documentElement.scrollWidth <= innerWidth + 1 && panel.scrollWidth <= panel.clientWidth + 1;
        });
        assert(fits, `${layout.id} ${width}`);
        if (['R14', 'R17', 'U3'].includes(node.id)) await page.screenshot({ path: path.join(out, `${node.id}-reader-${width}.png`) });
        pass(`${node.id} diagram loads in the production reader at ${width}px without overflow`);
      }
    }
    const u3 = graph.nodes.find(n => n.id === 'U3');
    await page.goto(url(u3.source, 'node-u3-access-script')); await ready(page, u3.source, 'node-u3-access-script');
    const imagePaths = await page.evaluate(() => [
      imageAssetUrl('../../assets/scene_access/u3.svg'),
      imageAssetUrl('https://example.com/image.svg'),
      imageAssetUrl('data:image/svg+xml,test'),
      imageAssetUrl('javascript:alert(1)'),
      imageAssetUrl('../../assets/example.html'),
    ]);
    assert.deepEqual(imagePaths, ['assets/scene_access/u3.svg', null, null, null, null]);
    pass('local SVG support retains remote URL, executable scheme and non-image rejection');
    const link = page.locator('[data-doc-heading="node-u3-access-layout"]');
    assert.equal(await link.getAttribute('target'), '_blank');
    const pending = context.waitForEvent('page'); await link.click(); const popup = await pending;
    await ready(popup, u3.pack, 'node-u3-access-layout');
    assert.equal(await popup.evaluate(() => window.opener), null);
    assert.equal(await page.evaluate(() => state.selected.path), u3.source);
    await popup.close();
    pass('screenplay sketch link opens a separate production page and preserves reading position');
    assert.deepEqual(errors, []);
    writeFileSync(path.join(out, 'result.json'), JSON.stringify({ checks, errors, scope: 'Document rendering only; no engine gameplay validation.' }, null, 2));
    console.log(`${checks.length} browser checks passed.`);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
