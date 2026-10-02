import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { ROOT } from './sync-canonical.mjs';
import { EXIT_PLACEMENTS } from './reading-scene-flow.mjs';

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
      id: node.id, image: `${node.id}-V01`, reference,
      details: group.rows.filter(row => !row.view && row.kind !== '過渡近看').map(row => row.id),
      access: access.get(node.id).map(({ edge, ...entry }) => ({ ...entry, edge: edge?.id ?? null })),
    };
  });
  const children = subscenes.map(child => ({
    id: child.id, node: child.node, route: child.route.edge.id, image: child.id,
    name: EXIT_PLACEMENTS[child.id]?.[2] ?? child.name, type: child.type,
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
    return { id: edge.id, from: edge.fromId, to: edge.toId, back: edge.back, mode: route.mode,
      images: route.rows.map(row => row.id), steps };
  });
  assert.equal(connections.length, graph.edges.length);
  assert.equal(children.length, 34);
  return { version: 1, nodes, subscenes: children, routes: connections, images };
}
