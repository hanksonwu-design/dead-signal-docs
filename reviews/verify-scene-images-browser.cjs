const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const { mkdirSync, writeFileSync, readFileSync } = require('node:fs');
const path = require('node:path');
const runtime = createRequire(path.resolve(process.argv[2], '__qa__.cjs'));
const { chromium } = runtime('playwright');
const base = process.argv[3];
const out = path.resolve(process.argv[4]);
const checks = [], errors = [];
const inventoryFile = '08_製作管理/08-13_劇情節點與場景道具總表.md';
const inventoryText = readFileSync(path.resolve(__dirname, '../docs', inventoryFile), 'utf8');
const imageCount = inventoryText.match(/合計 (\d+) 列圖像製作項目/)[1];
mkdirSync(out, { recursive: true });
const targets = [
  ['reading', '09_劇本/09-04_正式劇本_第一幕.md', 'transition-r2-r3-script', 'T-R2-R3-02-C01'],
  ['spec', '10_製作規格/10-02_製作規格_第一幕.md', 'node-r2-images', 'R2-C01'],
  ['inventory', inventoryFile, 'inventory-scene-images', `${imageCount} 列圖像製作項目`],
  ['details', '10_製作規格/10-03_製作規格_第二幕.md', 'node-r9-images', 'R09_H02'],
  ['hiding', '10_製作規格/10-05_製作規格_第四幕.md', 'node-r20-images', 'R20-V03'],
  ['subscene', '09_劇本/09-04_正式劇本_第一幕.md', 'subscene-t-r2-r3-02-script', '次場景 T-R2-R3-02'],
  ['subscene-spec', '10_製作規格/10-02_製作規格_第一幕.md', 'subscene-t-r2-r3-02-spec', '關閉回 T-R2-R3-02'],
  ['exit-subscene', '09_劇本/09-06_正式劇本_第三幕.md', 'subscene-r12-v03-script', 'R12→R15'],
  ['subscene-inventory', inventoryFile, 'inventory-subscenes', '34 個次場景節點'],
  ['room-order', '10_製作規格/10-02_製作規格_第一幕.md', 'node-r2-spec', '進場與動線'],
  ['passage-order', '10_製作規格/10-02_製作規格_第一幕.md', 'node-r3-exit', 'T-R3-R4'],
  ['access-reading', '09_劇本/09-04_正式劇本_第一幕.md', 'node-r3-access-script', '出口：洗衣窄巷'],
  ['access-spec', '10_製作規格/10-04_製作規格_第三幕.md', 'node-r12-access', '後開捷徑：低負荷門扣'],
  ['access-return', '09_劇本/09-08_正式劇本_第五幕.md', 'node-r26-access-script', '唯一出入口：C-07 厚門'],
];
const url = (doc, heading, staticMode = false) => `${base}/${staticMode ? '?static=1' : ''}#${new URLSearchParams({ doc, heading })}`;
async function ready(page, doc, heading) {
  await page.locator('#readerOverlay:not(.hidden)').waitFor();
  await page.waitForFunction(({ doc, heading }) => {
    const anchor = document.getElementById(heading);
    return state.selected?.path === doc && anchor && anchor.getBoundingClientRect().top >= 70 && anchor.getBoundingClientRect().top < 155;
  }, { doc, heading });
}
function pass(name) { checks.push(name); console.log(`PASS ${name}`); }
(async () => {
  const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome', headless: true });
  try {
    const context = await browser.newContext();
    context.on('page', page => page.on('pageerror', e => errors.push(e.message)));
    const page = await context.newPage();
    page.setDefaultTimeout(45000);
    for (const size of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
      await page.setViewportSize(size);
      for (const [name, doc, heading, expected] of targets) {
        await page.goto(url(doc, heading));
        await ready(page, doc, heading);
        const text = await page.locator('#readerContent').innerText();
        assert(text.includes(expected));
        assert(!text.includes('<!-- scene-image'));
        assert(!text.includes('<!-- scene-access'));
        assert(!text.includes('<a id='), 'No escaped anchor markup in the reading view');
        if (name === 'subscene') {
          const childHeading = page.locator(`#${heading} + h6`);
          assert((await childHeading.innerText()).includes('住宅側平台'));
          assert(await childHeading.evaluate(el => parseFloat(getComputedStyle(el).fontSize)) >= 14);
        }
        const dimensions = await page.evaluate(() => {
          const panel = document.querySelector('.reader-panel');
          return [document.documentElement.scrollWidth, innerWidth, panel.scrollWidth, panel.clientWidth];
        });
        assert(dimensions[0] <= dimensions[1] + 1 && dimensions[2] <= dimensions[3] + 1, dimensions.join(','));
        const overflow = await page.locator('#readerContent .md-table-wrap').evaluateAll(els => els
          .filter(el => el.scrollWidth > el.clientWidth + 1).map(el => getComputedStyle(el).overflowX));
        assert(overflow.every(value => ['auto', 'scroll'].includes(value)));
        await page.screenshot({ path: path.join(out, `${name}-${size.width}.png`) });
        pass(`${name} shows image IDs with contained layout at ${size.width}px`);
      }
    }
    await page.goto(url(targets[0][1], targets[0][2]));
    await ready(page, targets[0][1], targets[0][2]);
    const link = page.locator('#readerContent [data-doc-heading="node-r2-images"]').last();
    assert.equal(await link.getAttribute('target'), '_blank');
    const popupReady = context.waitForEvent('page');
    await link.click();
    const popup = await popupReady;
    await ready(popup, targets[1][1], targets[1][2]);
    assert.equal(await popup.evaluate(() => window.opener), null);
    assert.equal(await page.evaluate(() => state.selected.path), targets[0][1]);
    await popup.close();
    pass('reading image list opens its production sheet in a separate page');
    for (const [doc, child] of [
      [targets[0][1], 't-r2-r3-02'],
      ['09_劇本/09-06_正式劇本_第三幕.md', 'r12-v03'],
    ]) {
      await page.goto(url(doc, `subscene-${child}-script`));
      await ready(page, doc, `subscene-${child}-script`);
      const link = page.locator(`#readerContent [data-doc-heading="subscene-${child}-spec"]`).first();
      assert.equal(await link.getAttribute('target'), '_blank');
      const target = await link.getAttribute('data-doc-link');
      const opened = context.waitForEvent('page');
      await link.click();
      const sheet = await opened;
      await ready(sheet, target, `subscene-${child}-spec`);
      assert.equal(await sheet.evaluate(() => window.opener), null);
      const back = sheet.locator(`[data-doc-heading="subscene-${child}-script"]`).first();
      await back.click();
      await ready(sheet, doc, `subscene-${child}-script`);
      assert.equal(await page.evaluate(() => state.selected.path), doc);
      await sheet.close();
      pass(`${child} opens its own specification and returns to the matching reading node`);
    }
    const { ACTS } = await import('../tools/screenplay-files.mjs');
    let readingAnchors = 0, specAnchors = 0;
    for (const doc of ACTS.flatMap(act => [act.path, act.specPath])) {
      const source = readFileSync(path.resolve(__dirname, '../docs', doc), 'utf8').replaceAll('\r\n', '\n');
      const ids = [...source.matchAll(/^<a id="(subscene-[^"]+)"><\/a>$/gm)].map(m => m[1]);
      if (!ids.length) continue;
      await page.goto(url(doc, ids[0]));
      await ready(page, doc, ids[0]);
      for (const id of ids) assert.equal(await page.locator(`#readerContent #${id}`).count(), 1, id);
      if (doc.startsWith('09_')) readingAnchors += ids.length;
      else specAnchors += ids.length;
    }
    assert.equal(readingAnchors, 34);
    assert.equal(specAnchors, 34);
    pass('all 34 secondary nodes have rendered anchors in both reading and production documents');
    const graph = JSON.parse(readFileSync(path.resolve(__dirname, '../scene_graph.json'), 'utf8'));
    for (const act of ACTS) {
      await page.goto(url(act.specPath, `spec-act-${act.act}-overview`));
      await ready(page, act.specPath, `spec-act-${act.act}-overview`);
      const ids = await page.locator('#readerContent .md-anchor').evaluateAll(els => els.map(el => el.id));
      const inOrder = expected => {
        const positions = expected.map(id => ids.indexOf(id));
        assert(positions.every((n, i) => n >= 0 && (!i || n > positions[i - 1])), expected.join(','));
      };
      const nodes = graph.nodes.filter(n => n.act === act.act);
      inOrder(['overview', 'rooms', 'shared', 'references', 'delivery'].map(s => `spec-act-${act.act}-${s}`));
      for (const [i, node] of nodes.entries()) {
        const id = node.id.toLowerCase();
        inOrder(['spec', 'nav', 'access', 'level', 'pack', 'images', 'visual', 'exit'].map(s => `node-${id}-${s}`));
        const end = nodes[i + 1] ? `node-${nodes[i + 1].id.toLowerCase()}-spec` : `spec-act-${act.act}-shared`;
        for (const child of ids.filter(s => s.startsWith(`subscene-t-${id}-`) && s.endsWith('-spec'))) inOrder([`node-${id}-exit`, child, end]);
        for (const route of ids.filter(s => s.startsWith(`transition-${id}-`))) inOrder([`node-${id}-exit`, route, end]);
      }
      pass(`${act.name} renders overview, sequential rooms, departure passages and delivery in order`);
      await page.goto(url(act.path, `node-${nodes[0].id.toLowerCase()}-access-script`));
      await ready(page, act.path, `node-${nodes[0].id.toLowerCase()}-access-script`);
      for (const node of nodes) assert.equal(await page.locator(`#readerContent #node-${node.id.toLowerCase()}-access-script`).count(), 1);
      if (act.act === 0) {
        const intro = await page.evaluate(() => {
          let el = document.getElementById('node-p1-access-script').nextElementSibling;
          const parts = [];
          while (el && !el.innerText?.includes('近看、原件與其他畫面')) { parts.push(el.innerText || ''); el = el.nextElementSibling; }
          return parts.join('\n');
        });
        assert(!/肉身|R33|終幕銜接/.test(intro));
      }
      pass(`${act.name} renders every main scene access summary at its own anchor`);
    }
    await page.goto(url(targets[2][1], targets[2][2], true));
    await ready(page, targets[2][1], targets[2][2]);
    assert((await page.locator('#readerContent').innerText()).includes(`${imageCount} 列圖像製作項目`));
    pass('static docs.json contains the synchronized image inventory');
    assert.deepEqual(errors, []);
    pass('no browser runtime errors');
  } finally {
    await browser.close();
    writeFileSync(path.join(out, 'results.json'), JSON.stringify({ base, checks, errors }, null, 2) + '\n');
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
