// Preview first; --write applies the checked, idempotent reading-layout migration.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ACTS, MASTER, APPENDIX } from './screenplay-files.mjs';
import { ROOT, parseMaster, deriveGraph } from './sync-canonical.mjs';
import { validateProductionOrder } from './reorder-production-specs.mjs';

const marker = '<!-- production:ordered:v2 -->';
const anchor = id => `<a id="${id}"></a>`;
const fold = (title, body) => `<details>\n<summary>${title}</summary>\n\n${body.trim()}\n\n</details>`;
const bundle = /(?:<a id="[^"]+"><\/a>\s*)+<!-- import:([^:]+):begin -->[\s\S]*?<!-- import:\1:end -->/g;
const imports = /<!-- import:([^:]+):begin -->([\s\S]*?)<!-- import:\1:end -->/g;
const primary = ['s-0903-1', 's-0904-1', 's-0905-1', 's-0906-1', 's-0907-1', 's-0908-2', null, null, null, 's-0910-2'];
const common = '../09_劇本/09-15_正式劇本_共用附錄.md#production-reading-contract';
const reminders = [
  '以下每列均為待製作圖像項目；', '同一圖可支援多個狀態，', '**探索呈現：**先讓玩家看見入口、',
  '本節未另立房間製作包；', '門框、視線及熱區仍須灰盒驗收，', '**空間與保存：**每個次場景標明來路、',
  '**驗收：**尚未抵達目的房不得取得該房道具；', '**驗收：**每層測原門檻、', '**局部操作：**依下表找到側路',
  '玩家畫面與查證閱讀採[用語分層]', '介面文字依[玩家用語]',
  '本章動畫分為過場、玩家驅動演出與現時局部循環。', '圖解按操作階段排列，個別用例的來源、',
  '> 圖稿供構圖參考，操作依本頁熱點規格：', '**造型版本：**現行概念或規則圖解已更新；',
  '以下圖像為製作參照；跨房圖僅使用標明的面板，', '共用規則見[對應條款]',
];
const preciseGate = text => text.replace(/到(?:達)?布簾後安全點(?:後)?手動開門/g, '親自抵達門前 N4，再手動開門');
const meaningful = text => text.replace(/<a id="[^"]+"><\/a>|<!--[^]*?-->|^#{1,6} .*$|^---$/gm, '').trim();
const imageRefs = docs => [...docs.values()].flatMap(t => [...t.matchAll(/!\[[^\]]*\]\([^)]+\)/g)].map(m => m[0])).sort();
const rows = (docs, prefix) => ACTS.flatMap(a => [...docs.get(a.specPath).matchAll(new RegExp(`<!-- ${prefix}:[^:]+:begin -->([\\s\\S]*?)<!-- ${prefix}:[^:]+:end -->`, 'g'))]
  .flatMap(m => m[1].split('\n').filter(l => l.startsWith('|')))).sort();

function relocateLooseFigures(text) {
  return text.replace(/<details>\n<summary>狀態、素材與驗收（製作細節）<\/summary>([\s\S]*?)<\/details>/g, (whole, body) => {
    const imageAt = body.search(/<a id="node-[a-z0-9]+-images"><\/a>/);
    const figureAt = body.indexOf('<a id="fig-');
    if (figureAt < 0 || figureAt > imageAt) return whole;
    const figures = body.slice(figureAt, imageAt).trim();
    assert(!figures.includes('<!-- import:'), 'Do not split a canonical source to relocate a figure');
    return figures + '\n\n' + fold('狀態、素材與驗收（製作細節）', body.slice(0, figureAt) + body.slice(imageAt));
  });
}

const contract = `<a id="production-reading-contract"></a>

## 製作規格共用閱讀與交付

各幕依「進場與動線 → 操作與解謎 → 圖像示意 → 製作細節 → 離場及次場景」排列。製作細節可展開查看；連結至其中的圖號、狀態或驗收時會自動展開。本節統一各房重複提醒，個別操作、數值與例外仍以所在場景為準。

| 範圍 | 共用要求 | 詳細契約 |
| --- | --- | --- |
| 玩家閱讀 | 技術識別碼、原始欄名及製作註解留在製作層；玩家用語精簡不改來源、費用、門檻及保存。 | [用語分層](#player-language) · [閱讀節奏](#reading-load) |
| 圖像工單 | 各列都是待交付項目，多頁、正反面、局部、差分依拆圖欄分別交付；同圖支援多狀態時，每個焦點與差分仍須製作。概念圖、底圖及熱點對圖不代替正式圖、動畫、聲音、互動或取得條件。 | [靜態圖共用契約](#scene-image-contract) |
| 進出與接景 | 主圖供探索移動，演出節點按原條件播放；近看關閉回開啟前畫面。接景沿同一門框及地標，指定出口鏡位與低動態版維持定位；不因圖號增加通行權限或中間房。門框、視線、熱區仍須灰盒驗收，不計遊戲圖像交付數。 | [出入口共用契約](#scene-access-contract) |
| 探路與保存 | 次場景交代來去、樓層及承重踏板；反向不翻圖。依各列操作及原門檻開路，生活近看選填；必要辨路資訊可重看，不只靠聲音、收藏或消耗品。拆下零件留當層掛架，已開路不重解，尚未抵達目的房不先取得該房道具。 | [通路共用規則](#transition-rules) · [逐層探路契約](#ascent-route-contract) |
| 世界觀與恐怖 | 先交代入口、方向與異常，再讓玩家選看生活物件。租戶遺跡不另發證據、派系任務或出口旗標；沿原事件、遭遇與保護時序演出，閱讀與安定段不插嚇點。 | [生活空間](#everyday-world-spec) · [恐怖節奏](#horror-mainline-contract) |
| 圖解與角色 | 跨房圖只使用標明面板；操作依所在房熱點，其他房依前置條件。分鏡估算不代表完成素材或時長保證；先驗鏡位、前兆與操作，再精修。完整角色結構、前兆／命中／恢復、低動態與拆件仍按各房工單交付。 | [示意圖目錄](../10_製作規格/10-11_製作規格_示意圖目錄.md) · [造型分級](#insect-dark-design) |
| 存讀與驗收 | 未另立房間製作包仍適用本房規格及共用技術交付。各層測門檻、錯路、取消、近看返回、正反向和存讀檔；圖像、音場與實機節奏仍待製作驗證。 | [共用技術與交付](#appendix-production) |

`;

export function compactProduction(original, graph) {
  if (ACTS.every(a => /<!-- production:ordered:v[23] -->/.test(original.documents.get(a.specPath)))) {
    const documents = new Map(original.documents);
    for (const act of ACTS) documents.set(act.specPath, relocateLooseFigures(documents.get(act.specPath))
      .replace('### 本幕概覽與前\n', '### 本幕概覽與前置\n').replace(/^置\s*\n/gm, ''));
    const unchanged = [...documents].every(([file, text]) => text === original.documents.get(file));
    const after = parseMaster([...documents.values()].join('\n\n'), documents);
    for (const [id, file] of original.anchorFiles) assert.equal(after.anchorFiles.get(id), file, id);
    assert.deepEqual(imageRefs(documents), imageRefs(original.documents));
    return { documents: unchanged ? original.documents : documents, audit: validateProductionOrder(documents, graph) };
  }
  assert(ACTS.every(a => original.documents.get(a.specPath).includes('<!-- production:ordered:v1 -->')), 'Partially migrated specifications');
  const documents = new Map(original.documents), removedBlocks = [], counts = new Map();
  for (const act of ACTS) {
    let text = documents.get(act.specPath).replace(/\r\n/g, '\n');
    text = text.split('\n').filter(paragraph => {
      const rule = reminders.find(p => paragraph.trim().startsWith(p));
      if (!rule) return true;
      // Curated prose only: work orders, state tables, source boundaries and figures stay intact.
      assert(!/<!--|<a id=|^\|/m.test(paragraph), `Mixed reminder: ${rule}`);
      counts.set(rule, (counts.get(rule) ?? 0) + 1);
      return false;
    }).join('\n');
    text = text.replace(imports, (whole, id, body) => {
      if (meaningful(body)) return whole;
      removedBlocks.push(id);
      return [...body.matchAll(/<a id="[^"]+"><\/a>/g)].map(m => m[0]).join('\n');
    });
    // Keep the current single-act overview visible, with older design context available on demand.
    const overviewStart = text.indexOf(anchor(`spec-act-${act.act}-overview`));
    const routesStart = text.indexOf(`<!-- scene-image-routes-${act.act}:begin -->`);
    let front = text.slice(overviewStart, routesStart), main = '', extra = [];
    front = front.replace(bundle, (whole, id) => {
      if (id === primary[act.act]) main = whole;
      else extra.push(whole);
      return '';
    }).trim();
    if (primary[act.act]) assert(main, `Missing primary overview: ${act.name}`);
    if (main) {
      const newline = front.indexOf('\n', front.indexOf('### '));
      const headingEnd = newline < 0 ? front.length : newline;
      front = front.slice(0, headingEnd) + '\n\n' + main + '\n\n' + front.slice(headingEnd).trim();
    }
    text = text.slice(0, overviewStart) + front + '\n\n' + (extra.length ? fold('前置設定與跨場景規則', extra.join('\n\n')) + '\n\n' : '') + text.slice(routesStart);

    const starts = [...text.matchAll(/^<a id="node-([a-z0-9]+)-spec"><\/a>$/gm)];
    const shared = text.indexOf(anchor(`spec-act-${act.act}-shared`));
    let result = text.slice(0, starts[0].index);
    for (const [i, match] of starts.entries()) {
      const id = match[1], raw = text.slice(match.index, starts[i + 1]?.index ?? shared).trim();
      const at = ['nav', 'level', 'pack', 'images', 'visual', 'exit'].map(s => raw.indexOf(anchor(`node-${id}-${s}`)));
      assert(at.every((n, j) => n > 0 && (!j || n > at[j - 1])), id);
      const [navAt, levelAt, packAt, imagesAt, visualAt, exitAt] = at;
      let level = raw.slice(levelAt, packAt).trim(), pack = raw.slice(packAt, imagesAt).trim();
      // The exit table belongs after the entry and operations, within its original canonical source.
      level = level.replace(imports, (whole, source, body) => {
        const exit = /(?:<a id="[^"]+"><\/a>\n\n)?###### [^\n]*出口與回訪\n[\s\S]*?(?=\n<a id=|\n#{1,6} |$)/g;
        const found = [...body.matchAll(exit)];
        if (!found.length) return whole;
        const remaining = body.replace(exit, '').trim();
        return `<!-- import:${source}:begin -->\n${remaining}\n\n${found.map(m => m[0].trim()).join('\n\n')}\n<!-- import:${source}:end -->`;
      });
      // The three-room overview is a reference, not an instruction to visit future rooms now.
      if (id === 'r18') level = level.replace(/(<a id="h-0605-67"><\/a>[\s\S]*?)(?=<a id="h-0605-85">)/,
        (_, body) => fold('R18–R20 跨房操作圖解', body) + '\n\n');
      const lastImport = [...pack.matchAll(/<!-- import:[^:]+:end -->/g)].at(-1)?.index ?? 0;
      const extrasAt = pack.indexOf('<a id="fig-', lastImport);
      const illustrations = extrasAt < 0 ? '' : pack.slice(extrasAt).trim();
      if (extrasAt >= 0) pack = pack.slice(0, extrasAt).trim();
      const heading = raw.slice(0, navAt).trim().replace(`[狀態與驗收](#node-${id}-pack) · [圖像製作單](#node-${id}-images)`,
        `[圖像示意](#node-${id}-visual) · [製作細節](#node-${id}-pack) · [圖像製作單](#node-${id}-images)`);
      result += [heading, raw.slice(navAt, levelAt).trim(), level,
        raw.slice(visualAt, exitAt).trim(), illustrations,
        fold('狀態、素材與驗收（製作細節）', pack + '\n\n' + raw.slice(imagesAt, visualAt).trim()),
        raw.slice(exitAt).trim()].filter(Boolean).join('\n\n') + '\n\n';
    }
    result += text.slice(shared);
    result = preciseGate(result).replace('<!-- production:ordered:v1 -->', marker);
    result = result.replace(marker, marker + `\n\n[共用製作規則](${common})`);
    documents.set(act.specPath, result.replace(/\n{4,}/g, '\n\n\n').trimEnd() + '\n');
  }
  const removed = new Set(removedBlocks);
  documents.set(MASTER, documents.get(MASTER).replace(/^<!-- canonical-source: (\{[^\n]+\}) -->$/gm, (_, json) => {
    const source = JSON.parse(json);
    source.indices = source.indices.filter(n => !removed.has(`s-${source.id}-${n}`));
    return `<!-- canonical-source: ${JSON.stringify(source)} -->`;
  }));
  documents.set(APPENDIX, documents.get(APPENDIX).trimEnd() + '\n\n' + contract.trim() + '\n');
  const after = parseMaster([...documents.values()].join('\n\n'), documents);
  for (const [id, file] of original.anchorFiles) assert.equal(after.anchorFiles.get(id), file, `Anchor lost: ${id}`);
  for (const act of ACTS) assert.equal(documents.get(act.path), original.documents.get(act.path), `Story changed: ${act.name}`);
  for (const prefix of ['scene-images', 'hotspot-images', 'route-exploration']) assert.deepEqual(rows(documents, prefix), rows(original.documents, prefix), prefix);
  assert.deepEqual(imageRefs(documents), imageRefs(original.documents), 'Illustrations changed');
  assert.equal(preciseGate(JSON.stringify(deriveGraph(after, graph))), preciseGate(JSON.stringify(graph)), 'Gameplay graph changed');
  return { documents, audit: { ...validateProductionOrder(documents, graph),
    removedReminderParagraphs: [...counts.values()].reduce((a, b) => a + b, 0),
    reminders: Object.fromEntries(counts), removedEmptySources: removedBlocks,
    beforeBlocks: original.blocks.size, afterBlocks: after.blocks.size,
    checks: 'All original anchors, reading acts, work orders, hotspots, exploration rows and illustrations preserved; R18 summaries now name the existing N4 arrival requirement.' } };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const original = parseMaster(), graph = JSON.parse(readFileSync(path.join(ROOT, 'scene_graph.json'), 'utf8'));
  const { documents, audit } = compactProduction(original, graph);
  console.log(JSON.stringify(audit, null, 2));
  if (process.argv.includes('--write')) {
    for (const [file, text] of documents) if (text !== original.documents.get(file)) writeFileSync(path.join(ROOT, 'docs', file), text);
    if (audit.reminders) writeFileSync(path.join(ROOT, 'reviews/2026-10-13_production-specs-cleanup.json'), JSON.stringify(audit, null, 2) + '\n');
  } else console.log('Preview only; no documents changed.');
}
