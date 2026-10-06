const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const { mkdirSync, writeFileSync } = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const runtime = createRequire(path.resolve(process.argv[2], '__qa__.cjs'));
const { chromium } = runtime('playwright');
const base = process.argv[3] || 'http://127.0.0.1:8768';
const out = path.resolve(__dirname, 'act-balance-browser');
const checks = [], errors = [];
mkdirSync(out, { recursive: true });
const url = (doc, heading) => `${base}/?static=1#${new URLSearchParams({ doc, heading })}`;

(async () => {
  const { ACTS, APPENDIX } = await import(pathToFileURL(path.resolve(__dirname, '../tools/screenplay-files.mjs')));
  const cases = [
    [ACTS[3].path, 's-0906-43', '沿已開路返回', 'act3-return'],
    [ACTS[5].path, 's-0908-35', '自行翻開旁邊不同日期', 'act5-reading'],
    [ACTS[8].path, 's-0909-62', '跨門前，可留在原室', 'act8-door'],
    [ACTS[9].path, 's-0910-7', '再點門邊的祈願卡繼續', 'finale-continue'],
    [APPENDIX, 'act-balance-checks', '最少必要內容、一般探索及完整收集', 'balance-checks'],
  ];
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    for (const width of [1440, 390]) {
      const context = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 1000 } });
      context.on('page', p => p.on('pageerror', e => errors.push(String(e))));
      const page = await context.newPage();
      for (const [file, heading, text, name] of cases) {
        await page.goto(url(file, heading));
        await page.waitForFunction(({ file, heading }) => typeof state !== 'undefined' && state.selected?.path === file && document.getElementById(heading), { file, heading });
        assert((await page.locator('#readerContent').innerText()).includes(text));
        await page.locator(`#${heading}`).scrollIntoViewIfNeeded();
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
        assert.equal(await page.locator('#readerContent').evaluate(el => el.scrollWidth > el.clientWidth + 1), false, `${name} reader overflow`);
        if (name === 'balance-checks') {
          const names = await page.locator('#readerContent table').evaluateAll(tables => tables.map(t => [...t.rows].map(r => r.cells[0]?.textContent.trim())));
          assert(names.some(rows => ACTS.every(a => rows.includes(a.name))), 'All ten acts in one QA table');
        }
        if (name === 'act5-reading') {
          const link = page.locator('#readerContent a').filter({ hasText: /^R25-D04$/ }).first();
          assert((await link.locator('..').innerText()).startsWith('〔操作／介面比對〕'));
          assert.equal(await link.getAttribute('target'), '_blank');
          const pending = context.waitForEvent('page');
          await link.click();
          const popup = await pending;
          await popup.waitForFunction(file => typeof state !== 'undefined' && state.selected?.path === file && document.getElementById('node-r25-images'), ACTS[5].specPath);
          assert.equal(await popup.evaluate(() => window.opener), null);
          assert.equal(await page.evaluate(() => state.selected.path), file);
          await popup.close();
        }
        await page.screenshot({ path: path.join(out, `${name}-${width}.png`) });
        checks.push(`${name}: current static text, anchor and responsive layout at ${width}px`);
        console.log(`PASS ${checks.at(-1)}`);
      }
      await context.close();
    }
    assert.deepEqual(errors, []);
    writeFileSync(path.join(out, 'results.json'), JSON.stringify({ checks, errors, scope: 'Document website only; no game-engine playtest.' }, null, 2));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
