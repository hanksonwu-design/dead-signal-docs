const assert = require('node:assert/strict');
const { mkdirSync, writeFileSync } = require('node:fs');
const { createRequire } = require('node:module');
const { pathToFileURL } = require('node:url');
const path = require('node:path');
const runtime = createRequire(path.resolve(process.argv[2], '__qa__.cjs'));
const { chromium } = runtime('playwright');
const base = process.argv[3], out = path.resolve(process.argv[4]);
const root = path.resolve(__dirname, '..');
mkdirSync(out, { recursive: true });
const errors = [], checks = [];
const pass = name => { checks.push(name); console.log(`PASS ${name}`); };

(async () => {
  const { buildIllustrationCatalog } = await import(pathToFileURL(path.join(root, 'tools/build-illustration-catalog.mjs')));
  const { ACTS, ILLUSTRATION_CATALOG } = await import(pathToFileURL(path.join(root, 'tools/screenplay-files.mjs')));
  const { records } = buildIllustrationCatalog();
  const ordered = [...ACTS.map(act => String(act.act)), 'common'].flatMap(group => records.filter(record => record.group === group));
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const context = await browser.newContext();
    context.on('page', page => page.on('pageerror', error => errors.push(error.message)));
    const page = await context.newPage();
    const ready = async (doc, heading) => page.waitForFunction(({ doc, heading }) => state.selected?.path === doc && document.getElementById(heading), { doc, heading });
    const navigate = async (doc, heading) => {
      await page.evaluate(hash => { location.hash = hash; }, new URLSearchParams({ doc, heading }).toString());
      await ready(doc, heading);
    };
    await page.goto(base);
    await page.waitForFunction(() => state.documents.length > 0);
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      await navigate(ILLUSTRATION_CATALOG, 'illustration-catalog');
      assert.equal(await page.locator('#readerContent img').count(), records.length);
      assert.equal(await page.locator('#readerContent details').count(), records.length);
      assert.equal(await page.locator('#readerContent details[open]').count(), 0, 'production notes start collapsed');
      assert.equal(await page.locator('#readerContent table').count(), 0, 'the catalog displays pictures instead of a text table');
      assert.equal(await page.locator('#readerContent [id^="catalog-group-"]').count(), 11);
      assert.equal(await page.locator('#readerContent .reader-toc').count(), 0, 'the picture catalog has no duplicate automatic contents');
      assert.equal(await page.locator('#readerContent a[data-doc-heading^="catalog-group-"]').count(), 11, 'the short native act navigation remains available');
      assert.deepEqual(await page.locator('#readerContent [id^="catalog-"]:not([id^="catalog-group-"])').evaluateAll(anchors => anchors.map(anchor => anchor.id)), ordered.map(record => `catalog-${record.id.toLowerCase()}`));
      assert(!await page.locator('#readerContent').innerText().then(text => /<a id=|<\/?(?:details|summary)>/.test(text)), 'anchors and notes render as native controls');
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1 && document.querySelector('.reader-panel').scrollWidth <= document.querySelector('.reader-panel').clientWidth + 1));
      await page.screenshot({ path: path.join(out, `catalog-${width}.png`) });
      pass(`${width}px: ${records.length} direct pictures, collapsed notes, 11 groups and preserved catalog anchors`);
      for (const [index, r] of ordered.entries()) {
        const rowHeading = `catalog-${r.id.toLowerCase()}`;
        await navigate(ILLUSTRATION_CATALOG, rowHeading);
        const entry = await page.locator(`#${rowHeading}`).evaluate(anchor => {
          const nodes = [];
          for (let node = anchor.nextElementSibling; node && !node.matches('[id^="catalog-"]'); node = node.nextElementSibling) nodes.push(node);
          const descendants = selector => nodes.flatMap(node => [node, ...node.querySelectorAll(selector)].filter(element => element.matches(selector)));
          const images = descendants('img'), notes = descendants('details');
          return {
            imageCount: images.length, notesCount: notes.length,
            imageOutsideNotes: images.every(image => !image.closest('details')),
            summary: notes[0]?.querySelector('summary')?.textContent,
            open: notes[0]?.open,
            visibleLabel: nodes.filter(node => node.tagName !== 'DETAILS').map(node => node.textContent).join('\n'),
            imageBeforeNotes: Boolean(images[0] && notes[0] && (images[0].compareDocumentPosition(notes[0]) & Node.DOCUMENT_POSITION_FOLLOWING)),
          };
        });
        assert.equal(entry.imageCount, 1, `${r.id}: one directly displayed image`);
        assert.equal(entry.notesCount, 1, `${r.id}: one notes control`);
        assert(entry.imageOutsideNotes && entry.imageBeforeNotes, `${r.id}: picture remains visible before notes`);
        assert.equal(entry.summary, '製作註記', r.id);
        assert.equal(entry.open, false, r.id);
        assert(entry.visibleLabel.includes(r.id), `${r.id}: short figure label`);
        assert(!entry.visibleLabel.includes(r.purpose) && !entry.visibleLabel.includes(r.effect), `${r.id}: long explanations are collapsed`);
        for (const scene of r.scenes) assert(entry.visibleLabel.includes(scene.id), `${r.id}: scene link remains visible`);
        const catalogImage = page.locator('#readerContent img').nth(index);
        await catalogImage.scrollIntoViewIfNeeded();
        await catalogImage.evaluate(image => image.decode());
        assert(await catalogImage.isVisible(), `${r.id}: no additional click is needed to see the image`);
        assert(await catalogImage.evaluate((image, asset) => decodeURI(new URL(image.src).pathname).endsWith('/' + asset) && image.naturalWidth > 0 && image.naturalHeight > 0, r.asset), r.id);
        assert(await catalogImage.evaluate(image => image.getBoundingClientRect().width <= document.querySelector('.reader-panel').clientWidth + 1), `${r.id}: responsive image width`);
        const notes = page.locator('#readerContent details').nth(index);
        await notes.locator('summary').click();
        assert.equal(await notes.evaluate(element => element.open), true, r.id);
        const notesText = await notes.innerText();
        assert(notesText.includes(r.purpose) && notesText.includes(r.effect), `${r.id}: production information is retained`);
        for (const scene of [...r.scenes, ...r.subscenes]) assert(notesText.includes(`${scene.building} · ${scene.floor}`), `${r.id}: location is retained`);
        const rawLink = notes.getByRole('link', { name: /原圖/ }).first();
        assert.equal(await rawLink.getAttribute('target'), '_blank', `${r.id}: original asset opens separately`);
        assert.equal(await rawLink.getAttribute('rel'), 'noopener noreferrer', r.id);
        assert(await rawLink.evaluate((link, asset) => decodeURI(new URL(link.href).pathname).endsWith('/' + asset), r.asset), `${r.id}: exact original asset`);
        const link = page.locator(`#readerContent a[data-doc-link="${r.source}"][data-doc-heading="${r.heading}"]`).first();
        assert(await link.evaluate(element => !element.closest('details')), `${r.id}: source specification link stays visible`);
        assert.equal(await link.getAttribute('target'), '_blank', `${r.id} opens a new window`);
        assert.equal(await link.getAttribute('rel'), 'noopener noreferrer');
        const originalHash = await page.evaluate(() => location.hash);
        const popupPromise = page.waitForEvent('popup');
        await link.click();
        const detail = await popupPromise;
        await detail.waitForFunction(({ doc, heading }) => typeof state !== 'undefined' && state.selected?.path === doc && document.getElementById(heading), { doc: r.source, heading: r.heading });
        assert.equal(await page.evaluate(() => location.hash), originalHash, 'catalog remains open at its original row');
        assert.equal(await detail.evaluate(() => window.opener), null, 'new window isolates opener');
        const image = detail.locator(`#readerContent img[src$="${encodeURIComponent(r.asset.split('/').at(-1))}"]`);
        assert.equal(await image.count(), 1, r.id);
        await image.scrollIntoViewIfNeeded();
        await image.evaluate(img => img.decode());
        assert(await image.evaluate(img => img.naturalWidth > 0 && img.naturalHeight > 0), r.id);
        const back = detail.locator(`#readerContent a[data-doc-link="${ILLUSTRATION_CATALOG}"][data-doc-heading="${rowHeading}"]`);
        assert.equal(await back.count(), 1, `${r.id} unique return link`);
        if (await back.getAttribute('target') === '_blank') {
          const nextPopup = detail.waitForEvent('popup');
          await back.click();
          const popup = await nextPopup;
          await popup.waitForFunction(({ doc, heading }) => typeof state !== 'undefined' && state.selected?.path === doc && document.getElementById(heading), { doc: ILLUSTRATION_CATALOG, heading: rowHeading });
          await popup.close();
        } else {
          await back.click();
          await detail.waitForFunction(({ doc, heading }) => state.selected?.path === doc && document.getElementById(heading), { doc: ILLUSTRATION_CATALOG, heading: rowHeading });
        }
        await detail.close();
        await notes.locator('summary').click();
        assert.equal(await notes.evaluate(element => element.open), false, `${r.id}: notes can collapse again`);
      }
      const firstScene = ordered.find(record => record.scenes.length).scenes[0];
      const scene = page.locator(`#readerContent a[data-doc-link="${firstScene.source}"][data-doc-heading="${firstScene.heading}"]`).first();
      assert.equal(await scene.getAttribute('target'), '_blank', 'scene specification opens separately');
      assert(await page.locator('#readerContent a[data-doc-heading="catalog-group-4"]').evaluateAll(links => links.every(link => link.target === '_blank')), 'catalog category links also open separately');
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1 && document.querySelector('.reader-panel').scrollWidth <= document.querySelector('.reader-panel').clientWidth + 1));
      pass(`${width}px: all ${records.length} pictures decode directly; notes expand and collapse; source and original links retain exact targets and return anchors`);
      await navigate(records.find(r => r.id === 'REF-LIFT').source, 'illustration-note-ref-lift');
      await page.locator('#illustration-note-ref-lift').scrollIntoViewIfNeeded();
      await page.screenshot({ path: path.join(out, `lift-notes-${width}.png`) });
    }
    assert.deepEqual(errors, []);
    writeFileSync(path.join(out, 'result.json'), JSON.stringify({ checks, errors, scope: 'Direct illustration catalog, collapsed production notes, image links and responsive reader only.' }, null, 2));
    console.log(`${checks.length} browser checks passed.`);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
