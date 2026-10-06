// Run against tools/serve.mjs. Pass a package directory containing playwright and sharp.
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const { mkdirSync, writeFileSync, readFileSync } = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const runtime = createRequire(path.resolve(process.argv[2] || 'node_modules', '__qa__.cjs'));
const { chromium } = runtime('playwright');
const sharp = runtime('sharp');
const base = process.argv[3] || 'http://127.0.0.1:8765';
const master = '09_劇本/09-14_全劇本與關卡整合稿.md';
const out = path.resolve(__dirname, process.argv[4] || 'canonical-browser');
let canonical;
mkdirSync(out, { recursive: true });
const checks = [];
const errors = [];
function pass(name, detail) { checks.push({ name, detail }); console.log(`PASS ${name}`, detail || ''); }
const docUrl = (doc, heading = '', staticMode = false) => `${base}/${staticMode ? '?static=1' : ''}#${new URLSearchParams({ doc, heading })}`;

async function readerReady(page, anchor) {
  await page.locator('#readerOverlay:not(.hidden)').waitFor();
  await page.waitForFunction(id => {
    const el = document.getElementById(id);
    const panel = document.querySelector('.reader-panel');
    if (!el || !panel) return false;
    const top = el.getBoundingClientRect().top;
    const atEnd = panel.scrollHeight - panel.scrollTop - panel.clientHeight <= 2;
    return top >= 70 && (top < 150 || (atEnd && top < innerHeight - 20));
  }, anchor);
  assert.match(await page.locator('#readerPath').innerText(), /遊戲劇本|製作規格/);
  assert.equal(await page.evaluate(() => state.selected.path), canonical.anchorFiles.get(anchor));
}

async function openSpecification(page, anchor, activation = 'click') {
  const link = page.locator(`[data-doc-heading="${anchor}"]`).first();
  assert.equal(await link.getAttribute('target'), '_blank');
  assert.equal(await link.getAttribute('rel'), 'noopener noreferrer');
  assert.equal(await link.getAttribute('data-doc-window'), 'true');
  const destination = new URL(await link.getAttribute('href'));
  assert.equal(destination.origin, new URL(page.url()).origin);
  assert.equal(destination.pathname, new URL(page.url()).pathname);
  const params = new URLSearchParams(destination.hash.slice(1));
  assert.equal(params.get('doc'), canonical.anchorFiles.get(anchor));
  assert.equal(params.get('heading'), anchor);
  // Center the link below the sticky toolbar before measuring the reading position.
  await link.evaluate(el => el.scrollIntoView({ block: 'center' }));
  await link.focus();
  await link.evaluate(el => {
    window.specLinkDefaultPrevented = null;
    el.addEventListener('click', event => { window.specLinkDefaultPrevented = event.defaultPrevented; }, { once: true });
  });
  const readingState = () => ({ url: location.href, path: state.selected.path, scrollTop: document.querySelector('.reader-panel').scrollTop });
  const before = await page.evaluate(readingState);
  const opened = page.context().waitForEvent('page');
  if (activation === 'keyboard') await link.press('Enter');
  else await link.click(activation === 'modified' ? { modifiers: ['Control'] } : {});
  const popup = await opened;
  await readerReady(popup, anchor);
  assert.equal(await page.evaluate(() => window.specLinkDefaultPrevented), false, 'specifications use native new-page navigation without intercepting the click');
  assert.equal(await popup.evaluate(() => window.opener), null);
  assert.deepEqual(await page.evaluate(readingState), before, 'opening specifications preserves the original story and scroll position');
  return popup;
}

async function canvasCheck(page, name) {
  const canvas = page.locator('#canvas-host canvas');
  await canvas.waitFor();
  await page.waitForFunction(() => document.querySelectorAll('.room-tag').length === 26);
  const first = await canvas.screenshot();
  const stats = await sharp(first).stats();
  assert(stats.channels.slice(0, 3).some(c => c.stdev > 8), 'canvas is nonblank');
  await page.locator('#front').click();
  const second = await canvas.screenshot();
  const before = await sharp(first).removeAlpha().raw().toBuffer();
  const after = await sharp(second).removeAlpha().raw().toBuffer();
  assert.equal(before.length, after.length);
  let changed = 0;
  for (let i = 0; i < before.length; i += 3) {
    if (Math.abs(before[i] - after[i]) + Math.abs(before[i + 1] - after[i + 1]) + Math.abs(before[i + 2] - after[i + 2]) > 30) changed++;
  }
  const ratio = changed / (before.length / 3);
  assert(ratio > 0.005, 'camera control changes canvas pixels');
  await page.locator('#iso').click();
  await page.screenshot({ path: path.join(out, `${name}.png`), fullPage: true });
  pass(name, { channelDeviation: stats.channels.slice(0, 3).map(c => +c.stdev.toFixed(2)), changedRatio: +ratio.toFixed(4) });
}

(async () => {
  const { ACTS, APPENDIX, CANONICAL_FILES } = await import(pathToFileURL(path.join(__dirname, '../tools/screenplay-files.mjs')));
  const { parseMaster } = await import(pathToFileURL(path.join(__dirname, '../tools/sync-canonical.mjs')));
  canonical = parseMaster();
  const chapter = ACTS[2].path;
  const expectedAnchors = [...canonical.documents.get(chapter).matchAll(/<a id="[^"]+"><\/a>/g)].length;
  const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome', headless: true, args: ['--enable-unsafe-swiftshader'] });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    context.on('page', page => page.on('pageerror', error => errors.push(error.message)));
    const page = await context.newPage();
    page.setDefaultTimeout(45000);
    await page.goto(base);
    await page.locator('[data-folder="09_劇本"]').click();
    assert.equal(await page.locator('#documentGrid .doc-card').count(), ACTS.length + 2);
    const cardTitles = await page.locator('#documentGrid .doc-card h3').allInnerTexts();
    assert.equal(cardTitles.length, ACTS.length + 2);
    assert(cardTitles.every(title => title.startsWith('遊戲劇本')));
    assert.match(await page.locator('[data-folder="09_劇本"]').innerText(), /遊戲劇本/);
    await page.screenshot({ path: path.join(out, 'chapter-list.png') });
    pass('all current acts, one index and one shared appendix');
    await page.locator('[data-folder="10_製作規格"]').click();
    assert.equal(await page.locator('#documentGrid .doc-card').count(), ACTS.length);
    assert((await page.locator('#documentGrid .doc-card h3').allInnerTexts()).every(title => title.startsWith('製作規格')));
    await page.screenshot({ path: path.join(out, 'spec-list.png') });
    pass('all current production files are discoverable in their own category');

    for (const act of ACTS) {
      await page.goto(docUrl(act.path, `act-${act.act}`));
      await readerReady(page, `act-${act.act}`);
      assert.equal(await page.locator(`[id="spec-act-${act.act}"]`).count(), 0);
      const story = await page.evaluate(act => {
        const range = document.createRange();
        range.setStartAfter(document.getElementById(`act-${act}`));
        range.setEndBefore(document.getElementById(`act-${act}-continue`));
        return range.toString();
      }, act.act);
      assert(!/〔(?:禁止|製作|製作註|錄音註|保存|排程|抑制)〕|【(?:鎖定|新增|沿用待審)/.test(story), act.path);
      assert(!story.includes('〔演出〕'), act.path);
      for (const label of ['動畫演出', '介面呈現']) {
        assert(story.includes(`（${label}）`), `${act.path}: ${label}`);
      }
      const staticCues = story.match(/（靜態畫面[^）]*）/g) || [];
      assert(staticCues.length > 0, act.path);
      for (const cue of staticCues) assert.match(cue, /^（靜態畫面／(?:遠景|全景|中景|近景|特寫)）$/, act.path);
      assert(!story.includes('定點構圖'), act.path);
      assert(!/〔(?:操作|環境|系統)〕/.test(story), act.path);
      for (const type of ['操作', '環境', '系統']) {
        assert(new RegExp(`〔${type}／[^〕]+〕`).test(story), `${act.path}: ${type} subtype`);
      }
      if (act.act === 0) await page.screenshot({ path: path.join(out, 'clean-prologue-desktop.png') });
      const specs = await openSpecification(page, `spec-act-${act.act}`, act.act === 0 ? 'keyboard' : 'click');
      assert.equal(await specs.evaluate(() => state.selected.path), act.specPath);
      assert.equal(await specs.locator(`[id="act-${act.act}"]`).count(), 0);
      await specs.locator(`[data-doc-heading="act-${act.act}"]`).first().click();
      await readerReady(specs, `act-${act.act}`);
      await specs.close();
    }
    pass('all acts open separate specification windows, preserve reading position and retain return links');
    pass('specification links support keyboard activation with no opener access');
    pass('all rendered stories exclude editorial prohibition and production labels');
    await page.goto(docUrl(ACTS[4].path, 'node-r18-script'));
    await readerReady(page, 'node-r18-script');
    const r18Specs = await openSpecification(page, 'node-r18-spec');
    await page.screenshot({ path: path.join(out, 'act4-story-retained.png') });
    await r18Specs.screenshot({ path: path.join(out, 'act4-r18-spec-page.png') });
    await r18Specs.close();
    pass('act IV R18 specification opens a native new page while its story remains open');
    await page.goto(docUrl(ACTS[0].path, 'act-0-continue'));
    await readerReady(page, 'act-0-continue');
    await page.locator('[data-doc-heading="act-1"]').nth(1).click();
    await readerReady(page, 'act-1');
    await page.locator('[data-doc-heading="act-0"]').first().click();
    await readerReady(page, 'act-0');
    pass('story-end next-act link and previous-act navigation');

    await page.goto(docUrl(master, 'node-r8-script'));
    await readerReady(page, 'node-r8-script');
    assert.equal(await page.locator('#readerContent .md-anchor').count(), expectedAnchors);
    assert(!await page.locator('#readerContent').innerText().then(t => t.includes('<!-- import:')));
    assert(!await page.locator('#readerContent').innerText().then(t => t.includes('canonical-source:')));
    await page.screenshot({ path: path.join(out, 'reader-desktop.png') });
    pass('old combined screenplay bookmark opens owning act; import markers stay hidden');

    const ordered = await page.evaluate(() => {
      const before = (a, b) => Boolean(document.getElementById(a).compareDocumentPosition(document.getElementById(b)) & Node.DOCUMENT_POSITION_FOLLOWING);
      return before('act-2', 'node-r11-script') && before('node-r11-script', 'act-2-continue') &&
        !document.getElementById('spec-act-2') && !document.getElementById('node-r8-visual') && !document.getElementById('book-payoffs');
    });
    assert(ordered);
    pass('sequential story ends without production tables or spoiler appendices');
    const roomSpecs = await openSpecification(page, 'node-r8-spec');
    assert.equal(await roomSpecs.evaluate(() => state.selected.path), ACTS[2].specPath);
    await roomSpecs.screenshot({ path: path.join(out, 'spec-window-desktop.png') });
    await roomSpecs.locator('[data-doc-heading="node-r8-script"]').first().click();
    await readerReady(roomSpecs, 'node-r8-script');
    await roomSpecs.close();
    const modifiedSpecs = await openSpecification(page, 'node-r8-spec', 'modified');
    await modifiedSpecs.close();
    pass('room specifications open separately and modifier clicks retain native browser behavior');

    for (const act of ACTS) {
      await page.goto(docUrl(act.path, `spec-act-${act.act}`));
      await readerReady(page, `spec-act-${act.act}`);
      assert.equal(await page.evaluate(() => state.selected.path), act.specPath);
    }
    await page.goto(docUrl(chapter, 'node-r8-script'));
    await readerReady(page, 'node-r8-script');
    pass('all old act specification bookmarks redirect to their new owner');

    const samePage = page.locator('[data-doc-heading="node-r11-script"]').first();
    await samePage.click();
    await readerReady(page, 'node-r11-script');
    pass('in-document navigation');

    const transitionRoutes = [['r2-r3', 1], ['r3-r4', 1], ['r3-r5', 1], ['r5-r6', 1], ['r6-r7', 2], ['r7-r8', 2], ['r11-r12', 2], ['r13-r14', 3], ['r17-r18', 3], ['r24-r25', 5]];
    for (const [route, act] of transitionRoutes) {
      const anchor = `transition-${route}`;
      await page.goto(docUrl(ACTS[act].path, `${anchor}-script`));
      await readerReady(page, `${anchor}-script`);
      const specs = await openSpecification(page, anchor);
      if (route === 'r7-r8') await specs.screenshot({ path: path.join(out, 'transition-spec-desktop.png') });
      if (route === 'r17-r18') await specs.screenshot({ path: path.join(out, 'warehouse-transition-desktop.png') });
      await specs.locator('[data-doc-heading="transition-rules"]').first().click();
      await readerReady(specs, 'transition-rules');
      assert.equal(await specs.evaluate(() => state.selected.path), APPENDIX);
      await specs.close();
    }
    pass('ten transition scripts link to owned specifications and shared rules');

    await page.goto(docUrl(APPENDIX, 'culture-details'));
    await readerReady(page, 'culture-details');
    assert((await page.locator('#readerContent').innerText()).includes('上述 4 組局部'));
    await page.locator('[data-doc-heading="node-r3-script"]').last().click();
    await readerReady(page, 'node-r3-script');
    assert((await page.locator('#readerContent').innerText()).includes('起鍋再放鹽'));
    pass('cultural asset list links to the owning screenplay');

    for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
      await page.setViewportSize(viewport);
      for (const anchor of ['scene-play-roles', 'scene-playtest-checks']) {
        await page.goto(docUrl(APPENDIX, anchor));
        await readerReady(page, anchor);
        assert(await page.locator('.reader-panel').evaluate(el => el.scrollWidth - el.clientWidth <= 1));
        const text = await page.locator('#readerContent').innerText();
        assert(text.includes('待執行的遊戲灰盒測試'));
        assert(text.includes('F3 的視角／格位推理仍依 R20 原規格'));
        await page.screenshot({ path: path.join(out, `${anchor}-${viewport.width}.png`) });
      }
    }
    pass('play-role and pending-greybox tables render at desktop and mobile widths');

    for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
      await page.setViewportSize(viewport);
      for (const [anchor, expected] of [
        ['boss-domains', '不添加領域專屬鑰匙'], ['abiao-domain', '六秒仍絕對靜默'],
        ['xiaohua-domain', 'D 不先撤再重封'], ['boss-domain-assets', '以下六組交付'],
        ['haunted-av-language', '角色專屬的詭譎視聽'], ['laozhou-resonance', '聲音還在上工'],
        ['ahsun-domain', '永遠差最後一點的產線'], ['silenced-field', '被消音的住戶走道'],
      ]) {
        await page.goto(docUrl(canonical.anchorFiles.get(anchor), anchor));
        await readerReady(page, anchor);
        assert((await page.locator('#readerContent').innerText()).includes(expected));
        assert(await page.locator('.reader-panel').evaluate(el => el.scrollWidth - el.clientWidth <= 1));
        await page.screenshot({ path: path.join(out, `${anchor}-${viewport.width}.png`) });
      }
    }
    pass('boss domains, local uncanny spaces and pending assets render at desktop and mobile widths');

    for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
      await page.setViewportSize(viewport);
      for (const [anchor, expected] of [
        ['core-gameplay-progression', '核心玩法的教學、變化與回收'],
        ['core-gameplay-nodes', '逐節點操作與回饋'], ['core-gameplay-audit', '最少收集路線'],
        ['photo-flow', '不延長正在跑的冷卻'], ['signal-tests', '不由播放代讀'],
        ['light-marker-route', '每處最多一個，全輪最多三個'],
        ['misplaced-residue-cases', 'MR-R17'], ['core-gameplay-assets', '須另估工時'],
      ]) {
        await page.goto(docUrl(canonical.anchorFiles.get(anchor), anchor));
        await readerReady(page, anchor);
        assert((await page.locator('#readerContent').innerText()).includes(expected), anchor);
        assert(await page.locator('.reader-panel').evaluate(el => el.scrollWidth - el.clientWidth <= 1), anchor);
        await page.screenshot({ path: path.join(out, `${anchor}-${viewport.width}.png`) });
      }
    }
    pass('48-node gameplay progression and resource contracts render at desktop and mobile widths');

    for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
      await page.setViewportSize(viewport);
      for (const [anchor, expected] of [
        ['player-language', '玩家用語與製作識別碼分層'],
        ['reading-load', '必要查證的閱讀節奏'],
        ['s-0905-46', '再從原件選取 6C2A'],
        ['s-0908-21', '同一錯字只能支持共用範本'],
        ['s-0909-55', '備份資料已接回'],
        ['s-0910-29', '長按「緊急接管」四秒'],
      ]) {
        await page.goto(docUrl(canonical.anchorFiles.get(anchor), anchor));
        await readerReady(page, anchor);
        assert((await page.locator('#readerContent').innerText()).includes(expected), anchor);
        assert(await page.locator('.reader-panel').evaluate(el => el.scrollWidth - el.clientWidth <= 1), anchor);
        await page.screenshot({ path: path.join(out, `reading-${anchor}-${viewport.width}.png`) });
      }
    }
    pass('plain-language scenes and reading layers render without losing original clue values');

    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(docUrl(ACTS[5].path, 's-0908-21'));
    await readerReady(page, 's-0908-21');
    assert((await page.locator('#readerContent').innerText()).includes('同一錯字只能支持共用範本'));
    await page.goto(docUrl(ACTS[6].path, 's-0909-17'));
    await readerReady(page, 's-0909-17');
    assert((await page.locator('#readerContent').innerText()).includes('上方已選好的承重鏈及解開的煞扣保持原狀'));
    pass('revised investigations and continuous mechanisms render in their owning acts');

    await page.setViewportSize({ width: 390, height: 844 });
    for (const [route, act] of transitionRoutes) {
      const anchor = `transition-${route}`;
      await page.goto(docUrl(ACTS[act].path, anchor));
      await readerReady(page, anchor);
      assert(await page.locator('.reader-panel').evaluate(el => el.scrollWidth - el.clientWidth <= 1), route);
      if (route === 'r11-r12') await page.screenshot({ path: path.join(out, 'transition-spec-mobile.png') });
      if (route === 'r17-r18') await page.screenshot({ path: path.join(out, 'warehouse-transition-mobile.png') });
    }
    pass('ten transition specifications fit mobile reader');
    await page.setViewportSize({ width: 1440, height: 1000 });

    const images = [];
    for (const file of CANONICAL_FILES.filter(file => file !== master)) {
      const anchor = [...canonical.anchorFiles].find(([, owner]) => owner === file)[0];
      await page.goto(docUrl(file, anchor));
      await readerReady(page, anchor);
      images.push(...await page.locator('#readerContent img').evaluateAll(imgs => imgs.map(img => img.src)));
      const first = page.locator('#readerContent img').first();
      if (await first.count()) {
        await first.scrollIntoViewIfNeeded();
        await page.waitForFunction(() => { const img = document.querySelector('#readerContent img'); return img.complete && img.naturalWidth > 0; });
      }
    }
    assert.equal(images.length, 69);
    assert(images.every(src => new URL(src).pathname.startsWith('/assets/') && !src.includes('/assets/assets/')));
    for (const src of new Set(images)) {
      const response = await page.request.get(src);
      assert(response.ok(), src);
    }
    const image = page.locator('#readerContent img').first();
    await image.scrollIntoViewIfNeeded();
    await page.waitForFunction(() => { const img = document.querySelector('#readerContent img'); return img.complete && img.naturalWidth > 0; });
    await page.screenshot({ path: path.join(out, 'reader-image.png') });
    pass('69 image URLs and lazy image rendering');

    await page.goto(docUrl(master, 'book-payoffs'));
    await readerReady(page, 'book-payoffs');
    assert.equal(await page.evaluate(() => state.selected.path), APPENDIX);
    await page.locator('[data-doc-heading="book-toc"]').first().click();
    await readerReady(page, 'book-toc');
    await page.locator('[data-doc-heading="act-5"]').first().click();
    await readerReady(page, 'act-5');
    pass('shared appendix bookmark, index and act navigation');

    await page.goto(docUrl('06_關卡規格/06-02_第一幕_門面與棚.md'));
    await readerReady(page, 'act-1');
    pass('legacy level URL redirects to canonical act');

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(docUrl(master, 'node-r8-script'));
    await readerReady(page, 'node-r8-script');
    const overflow = await page.locator('.reader-panel').evaluate(el => el.scrollWidth - el.clientWidth);
    await page.screenshot({ path: path.join(out, 'reader-mobile.png') });
    if (overflow > 1) console.log(await page.locator('.reader-panel').evaluate(el => [...el.querySelectorAll('*')].filter(item => !item.closest('.md-table-wrap') && item.scrollWidth > item.clientWidth + 2).slice(0, 10).map(item => ({ tag: item.tagName, class: item.className, width: item.clientWidth, scrollWidth: item.scrollWidth, text: item.textContent.slice(0, 150) }))));
    assert(overflow <= 1, `reader horizontal overflow: ${overflow}`);
    assert(await page.evaluate(() => Boolean(document.elementFromPoint(25, 120)?.closest('#readerOverlay'))), 'sidebar must not cover the reader');
    pass('mobile canonical reader', { width: 390, overflow });
    const mobileSpecs = await openSpecification(page, 'node-r8-spec');
    await mobileSpecs.setViewportSize({ width: 390, height: 844 });
    await mobileSpecs.reload();
    await readerReady(mobileSpecs, 'node-r8-spec');
    assert(await mobileSpecs.locator('.reader-panel').evaluate(el => el.scrollWidth - el.clientWidth <= 1));
    await mobileSpecs.screenshot({ path: path.join(out, 'spec-window-mobile.png') });
    await mobileSpecs.close();
    pass('mobile specification window preserves the story and fits its viewport');

    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(`${base}/#scene=R8`);
    await page.locator('#scene-list [data-select="R8"][aria-pressed="true"]').waitFor();
    assert.equal(await page.locator('#scene-list [data-select]').count(), 48);
    assert((await page.locator('.route-comparison').allInnerTexts()).some(t => t.includes('不作出口門檻')));
    const popupPromise = context.waitForEvent('page');
    await page.locator('#node-links a').first().click();
    const popup = await popupPromise;
    await readerReady(popup, 'node-r8-script');
    await popup.close();
    pass('48-node graph opens correct canonical scene');
    const specPopupPromise = context.waitForEvent('page');
    await page.locator('#node-links a').nth(1).click();
    const specPopup = await specPopupPromise;
    await readerReady(specPopup, 'node-r8-pack');
    assert.equal(await specPopup.evaluate(() => state.selected.path), ACTS[2].specPath);
    await specPopup.close();
    pass('scene graph exposes a separate production link');

    await page.goto(`${base}/building/editor.html#scene=R8`);
    await page.locator('#room-id').filter({ hasText: 'R8' }).waitFor();
    assert.equal(await page.locator('#room-picker option').count(), 26);
    const source = new URL(await page.locator('#source-link').getAttribute('href'), page.url());
    const params = new URLSearchParams(source.hash.slice(1));
    assert.equal(params.get('doc'), ACTS[2].specPath);
    assert.equal(params.get('heading'), 'node-r8-level');
    pass('3D source and node count');
    const modelFloors = JSON.parse(readFileSync(path.join(__dirname, '../building/scene-data.json'), 'utf8')).spatial;
    for (const [id, floor] of Object.entries(modelFloors)) {
      await page.locator('#room-picker').selectOption(id);
      assert.equal(await page.locator('#room-floor').innerText(), `${floor.floorLabel} · 正式樓層`, id);
    }
    await page.locator('#room-picker').selectOption('R8');
    pass('all 26 default 3D room captions use canonical exact floors');
    await canvasCheck(page, 'model-desktop');
    await page.locator('#room-picker').selectOption('R11');
    assert.equal((await page.locator('#room-id').innerText()).trim(), 'R11');
    await page.locator('#edit-mode-switch').click();
    assert.equal(await page.locator('#edit-mode-switch').getAttribute('aria-checked'), 'true');
    await page.locator('#edit-mode-switch').click();
    pass('3D room selection and editor mode remain interactive');
    for (const [route, act] of [['R2-R3', 1], ['R3-R4', 1], ['R3-R5', 1], ['R5-R6', 1], ['R6-R7', 2], ['R7-R8', 2], ['R11-R12', 2], ['R13-R14', 3], ['R17-R18', 3]]) {
      await page.locator('#transition-picker').selectOption(route);
      const link = new URL(await page.locator('#transition-source').getAttribute('href'), page.url());
      const query = new URLSearchParams(link.hash.slice(1));
      assert.equal(query.get('doc'), ACTS[act].specPath);
      assert.equal(query.get('heading'), `transition-${route.toLowerCase()}`);
    }
    await page.locator('#transition-close').click();
    pass('all nine upper 3D passage source links target the canonical specifications');
    await page.setViewportSize({ width: 390, height: 844 });
    await canvasCheck(page, 'model-mobile');

    // Exercise published docs.json too, not only the local live-document API.
    await context.route('**/api/docs?*', route => route.abort());
    await page.goto(docUrl(master, 'node-r33-script', true));
    await readerReady(page, 'node-r33-script');
    pass('static docs.json redirects old bookmark to ending file without the live API');
    for (const act of ACTS) {
      await page.goto(docUrl(act.path, `spec-act-${act.act}`, true));
      await readerReady(page, `spec-act-${act.act}`);
      assert.equal(await page.evaluate(() => state.selected.path), act.specPath);
    }
    await page.goto(docUrl(master, 'transition-r7-r8', true));
    await readerReady(page, 'transition-r7-r8');
    pass('static payload preserves old act and combined specification bookmarks');
    await page.goto(docUrl(ACTS[2].path, 'node-r8-script', true));
    await readerReady(page, 'node-r8-script');
    const staticSpecs = await openSpecification(page, 'node-r8-spec');
    assert.equal(new URL(staticSpecs.url()).searchParams.get('static'), '1');
    await staticSpecs.close();
    pass('static specification window loads docs.json with the source mode and exact anchor retained');
    assert.deepEqual(errors, []);
    pass('no JavaScript page errors');
    writeFileSync(path.join(out, 'results.json'), JSON.stringify({ base, checks, errors }, null, 2));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
