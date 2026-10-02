import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { ROOT } from './sync-canonical.mjs';
import { EXIT_PLACEMENTS } from './reading-scene-flow.mjs';

export function readSceneFloor(spec, node) {
  const anchor = `<a id="${node.spatialHeading}"></a>`;
  assert(spec.includes(anchor), `Missing spatial section: ${node.id}`);
  const section = spec.split(anchor)[1].split('<a id="node-')[0];
  const rows = section.split('\n').filter(line => line.startsWith('|'))
    .map(line => line.split('|').slice(1, -1).map(cell => cell.trim()))
    .filter(cells => cells[0] === '樓層與環境');
  assert.equal(rows.length, 1, `Floor row: ${node.id}`);
  const description = rows[0][1];
  const source = { description, source: node.pack, heading: node.spatialHeading };
  // Ending nodes are presentation states, not another traversable floor.
  if (description.startsWith('分支演出節點')) {
    assert(['R33', 'POST'].includes(node.id), `Unknown ending floor: ${node.id}`);
    return { ...source, kind: 'ending', label: node.id === 'R33' ? '分支演出（非單一樓層）' : '片尾演出（無固定樓層）', entry: null, exit: null };
  }
  const floors = [...description.matchAll(/(?:B\d+|\d+F)(?:–(?:B\d+|\d+F))?/g)].map(m => m[0]);
  assert(floors.length, `Unrecognized floor: ${node.id}`);
  if (description.startsWith('由 ')) {
    assert(node.id === 'M1' && description.includes('封閉層外緣'), `Unknown floor passage: ${node.id}`);
    return { ...source, kind: 'passage', label: `${floors[0]} → ${floors.at(-1)}`, entry: `${floors[0]} 區段`, exit: `${floors.at(-1)} 區段` };
  }
  assert(description.startsWith(`${floors[0]} `), `Unrecognized floor prefix: ${node.id}`);
  const low = ['U2b', 'U4b', 'U6b'].includes(node.id);
  if (low) assert(description.includes('低位操作鏡位'), `Missing low-level scope: ${node.id}`);
  const band = floors[0].includes('–') || description.includes('相鄰量體夾層');
  const label = `${floors[0]}${low ? ' 低位夾層' : band ? ' 區段' : ''}`;
  return { ...source, kind: low ? 'low' : band ? 'band' : 'floor', label, entry: label, exit: label };
}

function routeFloor(edge, nodes) {
  const from = nodes.find(n => n.id === edge.fromId).floor;
  const to = nodes.find(n => n.id === edge.toId).floor;
  if (from.kind === 'ending' || to.kind === 'ending') {
    const label = edge.kind === '肉身回返' ? `${to.label} · 肉身回返` : '結局／片尾演出';
    return { label, reverseLabel: label, kind: 'ending' };
  }
  const start = from.exit, end = to.entry;
  return { label: start === end ? start : `${start} → ${end}`,
    reverseLabel: start === end ? start : `${end} → ${start}`, kind: 'route' };
}

export function buildSceneFlowData(graph, collection, routes, subscenes, access, documents) {
  const images = Object.fromEntries(collection.rows.map(row => [row.id, {
    id: row.id, node: row.node, kind: row.kind, content: row.content, requirements: row.requirements,
    status: 'pending', spec: row.act.specPath, heading: `node-${row.node.toLowerCase()}-images`,
  }]));
  const nodes = graph.nodes.map(node => {
    const group = collection.groups.find(g => g.node === node.id);
    const spec = documents?.get(node.pack) ?? readFileSync(path.join(ROOT, 'docs', node.pack), 'utf8');
    const slug = node.id.toLowerCase();
    const visual = spec.split(`<a id="node-${slug}-visual"></a>`)[1]?.split(`<a id="node-${slug}-exit"></a>`)[0] || '';
    const image = visual.match(/!\[([^\]]*)\]\(([^)]+)\)/);
    const layout = `assets/scene_access/${slug}.svg`;
    let reference = null;
    if (spec.includes(`<a id="node-${slug}-access-layout"></a>`)) {
      reference = { url: layout, label: `${node.id} 出入口配置草圖`, kind: '配置提案，非遊戲背景' };
    } else if (image) {
      const url = path.posix.normalize(path.posix.join('docs', path.posix.dirname(node.pack), image[2]));
      assert(url.startsWith('assets/') && !url.includes('..'), `Unsafe scene reference: ${node.id}`);
      reference = { url, label: image[1], kind: '概念參考，非正式素材' };
    }
    if (reference) assert(existsSync(path.join(ROOT, reference.url)), `Missing scene reference: ${node.id}`);
    return {
      id: node.id, image: `${node.id}-V01`, reference, floor: readSceneFloor(spec, node),
      details: group.rows.filter(row => !row.view && row.kind !== '過渡近看').map(row => row.id),
      access: access.get(node.id).map(({ edge, ...entry }) => ({ ...entry, edge: edge?.id ?? null })),
    };
  });
  const children = subscenes.map(child => ({
    id: child.id, node: child.node, route: child.route.edge.id, image: child.id,
    name: EXIT_PLACEMENTS[child.id]?.[2] ?? child.name, type: child.type,
    floor: routeFloor(child.route.edge, nodes),
    from: child.from, to: child.to, details: child.details.map(row => row.id),
    source: child.act.path, heading: `subscene-${child.id.toLowerCase()}-script`,
    spec: child.act.specPath, specHeading: `subscene-${child.id.toLowerCase()}-spec`,
  }));
  const connections = routes.map(route => {
    const edge = route.edge;
    const steps = [{ type: 'main', id: edge.fromId, image: `${edge.fromId}-V01` },
      ...children.filter(child => child.route === edge.id).map(child => ({ type: 'subscene', id: child.id, image: child.image }))];
    if (edge.fromId !== edge.toId) steps.push({
      type: 'main', id: edge.toId,
      // The ending returns to the body, not the prologue's exploration view.
      image: edge.fromId === 'R33' && edge.toId === 'P1' ? 'R33-V02' : `${edge.toId}-V01`,
    });
    for (const step of steps) assert(images[step.image], `Unbound flow image: ${step.image}`);
    return { id: edge.id, from: edge.fromId, to: edge.toId, back: edge.back, mode: route.mode, floor: routeFloor(edge, nodes),
      images: route.rows.map(row => row.id), steps };
  });
  assert.equal(connections.length, graph.edges.length);
  assert.equal(children.length, 34);
  return { version: 1, nodes, subscenes: children, routes: connections, images };
}
