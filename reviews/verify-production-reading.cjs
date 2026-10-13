const assert = require('node:assert/strict');
const { mkdirSync, writeFileSync, readFileSync } = require('node:fs');
const { createRequire } = require('node:module');
const { pathToFileURL } = require('node:url');
const path = require('node:path');
const runtime = createRequire(path.resolve(process.argv[2], '__qa__.cjs'));
const { chromium } = runtime('playwright');
const base = process.argv[3], out = path.resolve(process.argv[4]);
const root = path.resolve(__dirname, '..');
mkdirSync(out, { recursive: true });

(async () => {
  const { ACTS } = await import(pathToFileURL(path.join(root, 'tools/screenplay-files.mjs')));
  const graph = JSON.parse(readFileSync(path.join(root, 'scene_graph.json'), 'utf8'));
  const checks = [], errors = [];
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(base);
    await page.waitForFunction(() => state.documents.length > 0);
    const navigate = async (doc, heading) => {
      await page.evaluate(hash => { location.hash = hash; }, new URLSearchParams({ doc, heading }).toString());
      await page.waitForFunction(({ doc, heading }) => state.selected?.path === doc && document.getElementById(heading), { doc, heading });
      await page.waitForFunction(id => document.activeElement?.id === id, heading);
    };
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      for (const act of ACTS) {
        await navigate(act.specPath, `spec-act-${act.act}-rooms`);
        const count = graph.nodes.filter(n => n.act === act.act).length;
        const technical = page.locator('#readerContent details').filter({ has: page.locator('summary', { hasText: '狀態、素材與驗收（製作細節）' }) });
        assert.equal(await technical.count(), count);
        assert.equal(await technical.evaluateAll(items => items.filter(d => d.open).length), 0);
        assert(!await page.locator('#readerContent').innerText().then(t => /<\/?(?:details|summary)>/.test(t)));
        assert(await page.locator('#readerContent table').evaluateAll(tables => tables.every(t => t.getBoundingClientRect().width >= 760)));
        for (const node of graph.nodes.filter(n => n.act === act.act)) {
          const id = `node-${node.id.toLowerCase()}-images`;
          await navigate(act.specPath, id);
          assert(await page.locator(`#${id}`).evaluate(el => el.closest('details').open), id);
          assert(await page.locator(`#${id}`).evaluate(el => {
            const bounds = el.getBoundingClientRect();
            return bounds.top >= 0 && bounds.top < innerHeight;
          }), `${id}: scrolled into view`);
          await page.locator(`#${id}`).evaluate(el => { el.closest('details').open = false; });
          const link = page.locator(`#readerContent a[data-doc-heading="${id}"]`).first();
          await link.click();
          await page.waitForFunction(id => document.getElementById(id).closest('details').open, id);
          await page.locator(`#${id}`).evaluate(el => { el.closest('details').open = false; });
        }
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1 &&
          document.querySelector('.reader-panel').scrollWidth <= document.querySelector('.reader-panel').clientWidth + 1));
      }
      await navigate(ACTS[4].specPath, 'node-r18-level');
      const nested = page.locator('#readerContent details').filter({ has: page.locator('summary', { hasText: 'R18–R20 跨房操作圖解' }) });
      assert.equal(await nested.count(), 1);
      await navigate(ACTS[4].specPath, 'h-0605-67');
      assert(await nested.evaluate(el => el.open));
      await navigate(ACTS[4].specPath, 'node-r18-pack');
      await page.screenshot({ path: path.join(out, `technical-${width}.png`) });
      await page.locator('#node-r18-pack').evaluate(el => { el.closest('details').open = false; });
      await nested.evaluate(el => { el.open = false; });
      await navigate(ACTS[4].specPath, 'node-r18-spec');
      await page.screenshot({ path: path.join(out, `flow-${width}.png`) });
      checks.push(`${width}px: all ten acts, 48 closed technical sections, 96 deep/link navigations, nested reference and contained layout`);
      console.log(`PASS ${checks.at(-1)}`);
    }
    assert.deepEqual(errors, []);
    writeFileSync(path.join(out, 'result.json'), JSON.stringify({ checks, errors, scope: 'Documentation reading order, collapsible specifications, anchors and responsive layout.' }, null, 2) + '\n');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
