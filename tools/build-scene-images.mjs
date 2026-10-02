import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ACTS } from './screenplay-files.mjs';
import { ROOT } from './sync-canonical.mjs';

const read = file => readFileSync(path.join(ROOT, 'docs', file), 'utf8').replaceAll('\r\n', '\n');
const inventory = '08_製作管理/08-13_劇情節點與場景道具總表.md';
const viewKinds = new Set(['主場景', '演出主圖', '操作鏡位', '演出底圖', '出口接景', '過渡場景']);
const kinds = new Set([...viewKinds, '近看', '操作近看', '文件', '介面', '回憶畫面', '過渡近看']);

export function collectSceneImages(graph, documents = new Map(ACTS.map(a => [a.specPath, read(a.specPath)]))) {
  const allIds = new Set();
  const groups = [];
  for (const act of ACTS) {
    const spec = documents.get(act.specPath);
    const matches = [...spec.matchAll(/<!-- scene-images:([^:]+):begin -->([\s\S]*?)<!-- scene-images:\1:end -->/g)];
    assert.deepEqual(matches.map(m => m[1]), graph.nodes.filter(n => n.act === act.act).map(n => n.id), `Image coverage: ${act.name}`);
    for (const [, node, body] of matches) {
      const lines = body.split('\n').filter(line => line.startsWith('|'));
      assert(lines[0]?.startsWith('| 畫面節點／圖號 |') && /^\|(?: --- \|){5}$/.test(lines[1]), `Image table header: ${node}`);
      const rows = lines.slice(2).map(line => {
        const cells = line.split('|').slice(1, -1).map(c => c.trim());
        assert.equal(cells.length, 5, `Image row: ${line}`);
        const [id, kind, content, requirements, source] = cells;
        assert.match(id, /^[A-Z][A-Za-z0-9-]+$/, `Invalid image ID: ${id}`);
        assert(kinds.has(kind), `Unknown image kind: ${kind}`);
        assert(id.startsWith(`${node}-`) || id.startsWith(`T-${node}-`), `Image owner: ${id}`);
        assert(!allIds.has(id), `Duplicate image: ${id}`);
        assert(cells.every(Boolean), `Incomplete image: ${id}`);
        assert.match(source, /^\[[^\]]+\]\([^)]*#[^)]+\)$/, `Image source: ${id}`);
        allIds.add(id);
        return { id, kind, content, requirements, source, node, act, view: viewKinds.has(kind) };
      });
      assert(rows.length > 1, `Empty image group: ${node}`);
      assert.equal(rows[0].id, `${node}-V01`);
      assert(['主場景', '演出主圖'].includes(rows[0].kind));
      groups.push({ node, act, rows });
    }
  }
  return { groups, rows: groups.flatMap(g => g.rows), allIds };
}

export function collectHotspotImages(collection, documents) {
  const bindings = [];
  const expected = new Set();
  const seen = new Set();
  for (const act of ACTS) {
    const spec = documents?.get(act.specPath) ?? read(act.specPath);
    // Read original source blocks, not the mapping table being validated.
    const source = [...spec.matchAll(/<!-- import:[^:]+:begin -->([\s\S]*?)<!-- import:[^:]+:end -->/g)].map(m => m[1]).join('\n');
    const ids = new Set([...source.matchAll(/\bR\d{2}_(?:H|B)[A-Za-z0-9_]+(?:-[A-Z])?\b/g)].map(m => m[0]));
    for (const id of ids) expected.add(id);
    for (const [, node, body] of spec.matchAll(/<!-- hotspot-images:([^:]+):begin -->([\s\S]*?)<!-- hotspot-images:\1:end -->/g)) {
      assert(collection.groups.some(g => g.node === node && g.act.act === act.act), `Hotspot group: ${node}`);
      const lines = body.split('\n').filter(l => l.startsWith('|'));
      assert.equal(lines[0], '| 原熱點／操作 | 圖號 | 對應內容／邊界 |');
      assert.equal(lines[1], '| --- | --- | --- |');
      for (const line of lines.slice(2)) {
        const cells = line.split('|').slice(1, -1).map(c => c.trim());
        assert.equal(cells.length, 3, line);
        const [id, imageCell, note] = cells;
        assert(ids.has(id), `Unknown original hotspot: ${id}`);
        assert.equal(`R${Number(id.match(/^R(\d+)/)[1])}`, node, `Hotspot owner: ${id}`);
        assert(!seen.has(id), `Duplicate hotspot: ${id}`);
        assert(note, `Missing hotspot note: ${id}`);
        const images = imageCell.split('、');
        assert.equal(new Set(images).size, images.length, `Duplicate hotspot image: ${id}`);
        for (const image of images) {
          assert(collection.allIds.has(image), `Missing hotspot image: ${id} -> ${image}`);
          assert(image.startsWith(`${node}-`) || id === 'R27_H01' && image === 'R25-C02', `Wrong hotspot image owner: ${id} -> ${image}`);
        }
        seen.add(id);
        bindings.push({ id, node, images, note });
      }
    }
  }
  assert.deepEqual([...seen].sort(), [...expected].sort(), 'Original hotspots missing from image work orders');
  return bindings;
}

export function bindImageRoutes(graph, collection) {
  const routes = graph.edges.map(edge => {
    const group = collection.groups.find(g => g.node === edge.fromId);
    const prefix = `T-${edge.fromId}-${edge.toId}-`;
    let rows = group.rows.filter(r => r.kind === '過渡場景' && r.id.startsWith(prefix));
    let mode = '逐鏡過渡';
    if (!rows.length) {
      rows = group.rows.filter(r => r.kind === '出口接景' && r.content.startsWith(`${edge.fromId}→${edge.toId}：`));
      assert(rows.length <= 1, `Duplicate exit view: ${edge.id}`);
      mode = '出口接景';
    }
    if (!rows.length) {
      const ids = edge.fromId === 'R33' && edge.toId === 'P1'
        ? ['R33-V02'] : [...new Set([`${edge.fromId}-V01`, `${edge.toId}-V01`])];
      rows = ids.map(id => collection.rows.find(r => r.id === id));
      mode = edge.fromId === edge.toId ? '原鏡回返' : ['R33', 'POST'].includes(edge.toId) || edge.fromId === 'R33' ? '後果演出' : '兩端接景';
    }
    assert(rows.every(Boolean), `Unbound route: ${edge.id}`);
    return { edge, rows, mode };
  });
  for (const row of collection.rows.filter(r => ['出口接景', '過渡場景'].includes(r.kind))) {
    assert.equal(routes.filter(r => r.rows.includes(row)).length, 1, `Unused or ambiguous route image: ${row.id}`);
  }
  return routes;
}

export function collectSubscenes(collection, routes) {
  const subscenes = routes.flatMap(route => {
    if (!['逐鏡過渡', '出口接景'].includes(route.mode)) return [];
    return route.rows.map((row, index, rows) => {
      const from = index ? rows[index - 1].id : `${route.edge.fromId}-V01`;
      const to = index + 1 < rows.length ? rows[index + 1].id : `${route.edge.toId}-V01`;
      const details = collection.rows.filter(r => r.kind === '過渡近看' && r.id.startsWith(`${row.id}-`));
      if (row.kind === '過渡場景') {
        assert.equal(row.id, `T-${route.edge.fromId}-${route.edge.toId}-${String(index + 1).padStart(2, '0')}`, `Subscene order: ${row.id}`);
        assert(row.requirements.startsWith(`來路 ${from}；去路 ${to}。`), `Subscene connections: ${row.id}`);
        assert(details.length, `Subscene close-ups: ${row.id}`);
        for (const detail of details) assert(detail.requirements.includes(`關閉回 ${row.id}，`), `Close-up return: ${detail.id}`);
      }
      return { ...row, route, from, to, details, name: row.content.split('：')[0],
        type: row.kind === '過渡場景' ? '可查看過渡' : '轉場接景' };
    });
  });
  assert.equal(new Set(subscenes.map(s => s.id)).size, subscenes.length, 'Duplicate subscene');
  for (const detail of collection.rows.filter(r => r.kind === '過渡近看')) {
    assert.equal(subscenes.filter(s => s.details.includes(detail)).length, 1, `Unowned close-up: ${detail.id}`);
  }
  return subscenes;
}

function section(text, name, body, insertion) {
  const begin = `<!-- scene-image-${name}:begin -->`;
  const end = `<!-- scene-image-${name}:end -->`;
  const replacement = `${begin}\n${body}\n${end}`;
  if (text.includes(begin)) {
    assert.equal(text.split(begin).length, 2, name);
    assert.equal(text.split(end).length, 2, name);
    const start = text.indexOf(begin), stop = text.indexOf(end, start);
    assert(stop > start, name);
    return text.slice(0, start) + replacement + text.slice(stop + end.length);
  }
  assert(insertion && text.includes(insertion), `Missing insertion: ${name}`);
  assert.equal(text.split(insertion).length, 2, `Ambiguous insertion: ${name}`);
  return text.replace(insertion, `${insertion}\n\n${replacement}`);
}

const cleanCell = value => String(value).replaceAll('|', '／').replaceAll('\n', ' ');
const table = (headings, rows) => [headings, headings.map(() => '---'), ...rows]
  .map(row => `| ${row.map(cleanCell).join(' | ')} |`).join('\n');
const isSubscene = row => ['過渡場景', '出口接景'].includes(row.kind);
const subsceneAnchor = (row, suffix) => `subscene-${row.id.toLowerCase()}-${suffix}`;
const specLink = (row, from) => {
  const target = from === row.act.specPath ? '' : path.posix.relative(path.posix.dirname(from), row.act.specPath);
  const anchor = isSubscene(row) ? subsceneAnchor(row, 'spec') : `node-${row.node.toLowerCase()}-images`;
  return `[${row.id}](${target}#${anchor})`;
};
const shortName = row => row.kind === '出口接景' ? row.content.split('：')[0] : row.content;

export function buildSceneImageOutputs(graph, documents) {
  const collection = collectSceneImages(graph, documents);
  const hotspots = collectHotspotImages(collection, documents);
  const routes = bindImageRoutes(graph, collection);
  const subscenes = collectSubscenes(collection, routes);
  const outputs = new Map();
  for (const act of ACTS) {
    let story = read(act.path);
    let spec = documents?.get(act.specPath) ?? read(act.specPath);
    for (const group of collection.groups.filter(g => g.act.act === act.act)) {
      const children = subscenes.filter(s => s.node === group.node);
      const rows = group.rows.filter(r => !r.id.startsWith('T-') && r.kind !== '出口接景');
      const main = rows[0];
      const lines = [`**場景圖：${main.id}** · ${main.content}`, '', '**近看、原件與其他畫面：**'];
      // Keep only names in the reading edition; states and art instructions remain in the specification.
      for (let i = 1; i < rows.length; i += 3) {
        lines.push(`- ${rows.slice(i, i + 3).map(r => `${r.id} ${shortName(r)}`).join('；')}。`);
      }
      const exits = children.filter(s => s.kind === '出口接景');
      if (exits.length) {
        lines.push('', '**接景次場景：**');
        for (const child of exits) lines.push('', `<a id="${subsceneAnchor(child, 'script')}"></a>`, '', `- ${specLink(child, act.path)} · ${child.content}`);
      }
      lines.push('', `[本場景圖像製作單](../${act.specPath}#node-${group.node.toLowerCase()}-images)`);
      const intro = `[製作規格](../${act.specPath}#node-${group.node.toLowerCase()}-spec)`;
      story = section(story, group.node.toLowerCase(), lines.join('\n'), intro);
      const transitionRoutes = new Set(group.rows.filter(r => r.kind === '過渡場景').map(r => r.id.replace(/-\d+$/, '')));
      for (const route of transitionRoutes) {
        const slug = route.slice(2).toLowerCase();
        const anchor = `transition-${slug}-script`;
        const heading = story.match(new RegExp(`<a id="${anchor}"></a>\\n(#{1,6} [^\\n]+)`))?.[0];
        assert(heading, `Transition reading anchor: ${route}`);
        const routeChildren = children.filter(s => s.id.startsWith(`${route}-`));
        const body = `**次場景順序：** ${routeChildren.map(s => `[${s.id} · ${s.name}](#${subsceneAnchor(s, 'script')})`).join(' → ')}\n\n` +
          `[通路圖像製作單](../${act.specPath}#subscenes-${group.node.toLowerCase()})`;
        story = section(story, route.toLowerCase(), body, heading);
        for (const child of routeChildren) {
          const childBody = `<a id="${subsceneAnchor(child, 'script')}"></a>\n###### 次場景 ${child.id} · ${child.name}\n\n` +
            `**近看：** ${child.details.map(d => `${d.content}（${d.id}）`).join('；')}。\n\n` +
            `[次場景製作規格](../${act.specPath}#${subsceneAnchor(child, 'spec')})`;
          // Each marker is placed beside its actual shot, never ahead of a route's entry condition.
          story = section(story, `subscene-${child.id.toLowerCase()}`, childBody);
        }
      }
      if (children.length) {
        const childBody = `<a id="subscenes-${group.node.toLowerCase()}"></a>\n#### 次場景節點\n\n` +
          `以下次場景歸 ${group.node} 管理，節點編號沿用主圖圖號。來去方向為原動線的正向排列；反向通行與單向限制依原門檻，不因列出來路就新增返回出口。\n\n` +
          children.map(s => `<a id="${subsceneAnchor(s, 'spec')}"></a>\n##### ${s.id} · ${s.name}\n\n` +
            `**類型：**${s.type}。**正向連接：**${s.from} → **${s.id}** → ${s.to}。\n\n` +
            `**近看：**${s.details.length ? `${s.details.map(d => d.id).join('、')}；關閉回 ${s.id}。` : '不新增近看；沿原轉場操作，不新增等待或讀取門檻。'}\n\n` +
            `[正文](../${act.path}#${subsceneAnchor(s, 'script')}) · [圖像製作單](#node-${group.node.toLowerCase()}-images) · [原門檻與回訪](#node-${group.node.toLowerCase()}-nav) · ${s.source}`
          ).join('\n\n');
        spec = section(spec, `subscenes-${group.node.toLowerCase()}`, childBody, `<!-- scene-images:${group.node}:end -->`);
      }
    }
    const actRoutes = routes.filter(r => graph.nodes.find(n => n.id === r.edge.fromId).act === act.act);
    const routeBody = `<a id="image-routes-act-${act.act}"></a>\n\n### 本幕連線與接景圖\n\n` +
      '每條既有動線均指定畫面。兩端接景使用已列主圖與門框遮擋，不另造中間房；出口接景必須交指定鏡位，動畫及低動態版共用定位。後果演出不開放探索。進入條件與回訪仍依原動線表，圖號不是通行權限。\n\n' +
      table(['原動線', '接景方式', '畫面節點／圖號', '操作與條件來源'], actRoutes.map(({ edge, rows, mode }) => [
        `${edge.fromId}→${edge.toId}`, mode, rows.map(r => specLink(r, act.specPath)).join(' → '),
        `[門檻、方向與回訪](#node-${edge.fromId.toLowerCase()}-nav)`,
      ]));
    const specIntro = `## ${act.name} · ${act.subtitle}：製作規格`;
    spec = section(spec, `routes-${act.act}`, routeBody, specIntro);
    outputs.set(act.path, story);
    outputs.set(act.specPath, spec);
  }
  const views = collection.rows.filter(r => r.view);
  const details = collection.rows.filter(r => !r.view);
  const transitions = collection.rows.filter(r => r.kind === '過渡場景');
  const exits = collection.rows.filter(r => r.kind === '出口接景');
  const summary = `<a id="inventory-scene-images"></a>\n\n## 場景畫面與靜態圖\n\n` +
    `**${collection.groups.length} 個流程節點，下分 ${subscenes.length} 個次場景節點（${transitions.length} 個可查看過渡、${exits.length} 個轉場接景）；合計 ${collection.rows.length} 列圖像製作項目（場景／操作／演出 ${views.length} 列，近看／文件／介面／回憶 ${details.length} 列），對應 ${routes.length} 條動線。**\n\n` +
    `原規格的 ${hotspots.length} 個 H／B 熱點編號均有逐項對圖；包含已撤除事件的相容參照，不代表新增同數量的可點物件。其餘節點沿原場次與操作名稱列圖。\n\n` +
    '一列可能包含多頁、正反面、子鏡位或差分，不等於一張輸出圖；共用圖也不能重複算獨立背景。全部仍待正式圖像與遊戲實作交付，現有概念圖不能當完成品。完整拆圖與來源以各幕製作單為準。\n\n' +
    table(['節點', '場景／操作／演出項目', '近看等項目', '逐件圖號與拆圖'], collection.groups.map(g => [
      g.node, g.rows.filter(r => r.view).length, g.rows.filter(r => !r.view).length,
      `[製作單](../${g.act.specPath}#node-${g.node.toLowerCase()}-images)`,
    ])) + '\n\n<a id="inventory-subscenes"></a>\n\n### 次場景節點總表\n\n' +
    '次場景沿用既有圖號，隸屬原連線的起點主場景；不另算主線房間。近看圖是次場景的局部，不是另一個可移動節點。接景型保留原轉場操作；兩端直接切鏡與結局演出不虛構中間場景。\n\n' +
    table(['所屬主場景', '次場景／主圖', '類型／名稱', '正向來路 → 去路', '近看圖'], subscenes.map(s => [
      s.node, specLink(s, inventory), `${s.type} · ${s.name}`, `${s.from} → ${s.to}`,
      s.details.map(d => d.id).join('、') || '無新增近看',
    ])) + '\n\n### 全部動線圖像對照\n\n' +
    table(['動線', '接景方式', '對應圖號'], routes.map(({ edge, mode, rows }) => [
      `${edge.fromId}→${edge.toId}`, mode, rows.map(r => specLink(r, inventory)).join(' → '),
    ]));
  outputs.set(inventory, section(read(inventory), 'inventory', summary, '<!-- inventory:summary:end -->'));
  return { outputs, collection, routes, hotspots, subscenes };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const graph = JSON.parse(readFileSync(path.join(ROOT, 'scene_graph.json'), 'utf8'));
  const { outputs, collection, routes, hotspots } = buildSceneImageOutputs(graph);
  for (const [file, content] of outputs) {
    if (process.argv.includes('--check')) assert(read(file) === content, `Stale scene images: ${file}`);
    else if (read(file) !== content) writeFileSync(path.join(ROOT, 'docs', file), content);
  }
  console.log(`Scene images verified: ${collection.groups.length} groups, ${collection.rows.length} work items, ${routes.length} routes, ${hotspots.length} hotspot bindings`);
}
