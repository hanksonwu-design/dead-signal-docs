const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const { mkdirSync, writeFileSync } = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const runtime = createRequire(path.resolve(process.argv[2], '__qa__.cjs'));
const { chromium } = runtime('playwright');
const base = process.argv[3] || 'http://127.0.0.1:8768';
const out = path.resolve(process.argv[4]);
const checks = [], errors = [];
mkdirSync(out, { recursive: true });

(async () => {
  const { ACTS, APPENDIX } = await import(pathToFileURL(path.resolve(__dirname, '../tools/screenplay-files.mjs')));
  const cases = [
    [ACTS[2].path, 's-0905-26', '小花把剛打好的短尾雙結托在她掌心', 'r8-memory'],
    [ACTS[3].path, 's-0906-40', '兩份評級，用的是同一套規則。', 'r16-reading'],
    [ACTS[4].path, 's-0907-40', '第四下才與下方掌痕疊合', 'r22-gesture'],
    [ACTS[4].path, 's-0907-47', '掌心留出一個空位', 'r22-outro'],
    [ACTS[3].specPath, 'act3-reading-beats', '不代發來源', 'reading-spec'],
    [ACTS[4].specPath, 'h-0605-800', '較晚走到踏台不重播六秒', 'outro-spec'],
    [APPENDIX, 'upper-ending-playtest', '尚不能宣稱已能促成購買', 'ending-qa'],
  ];
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    for (const width of [1440, 390]) {
      const context = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 1000 } });
      context.on('page', p => p.on('pageerror', e => errors.push(String(e))));
      const page = await context.newPage();
      for (const [file, heading, text, name] of cases) {
        await page.goto(`${base}/?static=1#${new URLSearchParams({ doc: file, heading })}`);
        await page.waitForFunction(({ file, heading }) => typeof state !== 'undefined' && state.selected?.path === file && document.getElementById(heading), { file, heading });
        assert((await page.locator('#readerContent').innerText()).includes(text));
        await page.locator(`#${heading}`).scrollIntoViewIfNeeded();
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
        assert.equal(await page.locator('#readerContent').evaluate(el => el.scrollWidth > el.clientWidth + 1), false);
        if (name === 'r22-outro') {
          const link = page.locator('#readerContent a').filter({ hasText: /^R22-C06$/ }).first();
          assert.equal(await link.getAttribute('target'), '_blank');
          const pending = context.waitForEvent('page');
          await link.click();
          const popup = await pending;
          await popup.waitForFunction(file => typeof state !== 'undefined' && state.selected?.path === file && document.getElementById('node-r22-images'), ACTS[4].specPath);
          assert((await popup.locator('#readerContent').innerText()).includes('搭扶手／鬆掌留空'));
          assert.equal(await popup.evaluate(() => window.opener), null);
          assert.equal(await page.evaluate(() => state.selected.path), file);
          await popup.close();
        }
        await page.screenshot({ path: path.join(out, `${name}-${width}.png`) });
        checks.push(`${name}: current text, anchor and layout at ${width}px`);
        console.log(`PASS ${checks.at(-1)}`);
      }
      await context.close();
    }
    assert.deepEqual(errors, []);
    writeFileSync(path.join(out, 'results.json'), JSON.stringify({ checks, errors, scope: 'Document website and links only; no engine playtest or purchase-intent validation.' }, null, 2));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
