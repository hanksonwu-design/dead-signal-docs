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
    page.context().on('page', popup => popup.on('pageerror', error => errors.push(error.message)));
    await page.goto(base);
    await page.waitForFunction(() => state.documents.length > 0);
    const navigate = async (doc, heading) => {
      await page.evaluate(hash => { location.hash = hash; }, new URLSearchParams({ doc, heading }).toString());
      await page.waitForFunction(({ doc, heading }) => state.selected?.path === doc && document.getElementById(heading), { doc, heading });
      await page.waitForFunction(id => document.activeElement?.id === id, heading);
    };
    const screenshot = async name => {
      await page.evaluate(async () => {
        await document.fonts.ready;
        await Promise.all([...document.querySelectorAll('#readerContent img')].map(async img => {
          img.loading = 'eager';
          await img.decode();
        }));
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      });
      await page.screenshot({ path: path.join(out, name) });
    };
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      for (const act of ACTS) {
        await navigate(act.specPath, `spec-act-${act.act}-rooms`);
        await page.evaluate(async () => {
          await document.fonts.ready;
          await Promise.all([...document.querySelectorAll('#readerContent img')].map(async img => {
            img.loading = 'eager';
            await img.decode();
          }));
        });
        const count = graph.nodes.filter(n => n.act === act.act).length;
        const technical = page.locator('#readerContent details').filter({ has: page.locator('summary', { hasText: '狀態、素材與驗收（製作細節）' }) });
        assert.equal(await technical.count(), count);
        assert.equal(await technical.evaluateAll(items => items.filter(d => d.open).length), 0);
        assert(!await page.locator('#readerContent').innerText().then(t => /<\/?(?:details|summary)>/.test(t)));
        assert(await page.locator('#readerContent table').evaluateAll(tables => tables.every(t => t.getBoundingClientRect().width >= 760)));
        assert(await page.locator('#readerContent a').evaluateAll(links => links.length > 0 && links.every(link =>
          link.target === '_blank' && link.rel.includes('noopener') && link.rel.includes('noreferrer'))));
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
          await link.evaluate(el => el.scrollIntoView({ block: 'center', behavior: 'instant' }));
          const original = await page.evaluate(() => ({ href: location.href, scroll: document.querySelector('.reader-panel').scrollTop }));
          const opened = page.waitForEvent('popup');
          await link.click();
          const popup = await opened;
          try {
            await popup.waitForFunction(({ doc, id }) => typeof state !== 'undefined' && state.selected?.path === doc &&
              document.getElementById(id)?.closest('details').open && document.activeElement?.id === id, { doc: act.specPath, id });
            assert.equal(await popup.evaluate(() => window.opener), null);
            assert.deepEqual(await page.evaluate(() => ({ href: location.href, scroll: document.querySelector('.reader-panel').scrollTop })), original);
            assert.equal(await page.locator(`#${id}`).evaluate(el => el.closest('details').open), false);
          } finally { await popup.close(); }
        }
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1 &&
          document.querySelector('.reader-panel').scrollWidth <= document.querySelector('.reader-panel').clientWidth + 1));
      }
      await navigate(ACTS[4].specPath, 'node-r18-level');
      await navigate(ACTS[4].specPath, 'h-0605-67');
      assert(await page.evaluate(() => Boolean(document.getElementById('node-r22-spec')
        .compareDocumentPosition(document.getElementById('h-0605-67')) & Node.DOCUMENT_POSITION_FOLLOWING)), 'cross-room operation reference follows the final room');
      await navigate(ACTS[4].specPath, 'node-r18-pack');
      await screenshot(`technical-${width}.png`);
      await page.locator('#node-r18-pack').evaluate(el => { el.closest('details').open = false; });
      await navigate(ACTS[4].specPath, 'node-r18-spec');
      await screenshot(`flow-${width}.png`);
      await navigate(ACTS[0].specPath, 'fig-l01');
      assert(await page.evaluate(() => Boolean(document.getElementById('h-0601-313')
        .compareDocumentPosition(document.getElementById('fig-l01')) & Node.DOCUMENT_POSITION_FOLLOWING)));
      await screenshot(`inline-diagram-${width}.png`);
      await navigate(ACTS[9].specPath, 'fig-v13');
      assert(await page.evaluate(() => {
        const follows = (first, second) => Boolean(document.getElementById(first)
          .compareDocumentPosition(document.getElementById(second)) & Node.DOCUMENT_POSITION_FOLLOWING);
        return follows('h-0608-114', 'fig-v13') && follows('h-0608-152', 'r32-ceasefire-pressure') &&
          follows('r32-ceasefire-pressure', 'h-0608-163');
      }), 'complete manifestation and ceasefire rules follow their actual gameplay beats');
      await screenshot(`finale-diagram-${width}.png`);
      checks.push(`${width}px: all production links open separately; 48 deep targets and 48 popups preserve source position, expand destination and isolate opener`);
      console.log(`PASS ${checks.at(-1)}`);
    }
    const catalog = '10_製作規格/10-11_製作規格_示意圖目錄.md';
    await navigate(catalog, 'illustration-catalog');
    assert(await page.locator('#readerContent a').evaluateAll(links => links.length > 0 && links.every(link => link.target === '_blank')));
    for (const heading of ['catalog-group-4', 'illustration-note-ref-calibration', 'node-r18-spec']) {
      const link = page.locator(`#readerContent a[data-doc-heading="${heading}"]`).first();
      await link.scrollIntoViewIfNeeded();
      const original = await page.evaluate(() => location.href);
      const opened = page.waitForEvent('popup');
      await link.click();
      const popup = await opened;
      try {
        await popup.waitForFunction(id => document.activeElement?.id === id, heading);
        assert.equal(await popup.evaluate(() => window.opener), null);
        assert.equal(await page.evaluate(() => location.href), original);
      } finally { await popup.close(); }
    }
    checks.push('Catalog category, illustration and scene links open separately without replacing the catalog');
    console.log(`PASS ${checks.at(-1)}`);
    assert.deepEqual(errors, []);
    writeFileSync(path.join(out, 'result.json'), JSON.stringify({ checks, errors, scope: 'Documentation reading order, collapsible specifications, anchors and responsive layout.' }, null, 2) + '\n');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
