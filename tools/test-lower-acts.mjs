import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { parseMaster, deriveGraph, rewriteLinks } from './sync-canonical.mjs';
import { ACTS, FINALE, MASTER, APPENDIX, LOWER_ACT_NODES } from './screenplay-files.mjs';
import { buildDocuments } from './build-docs.mjs';

const master = parseMaster();
const graph = JSON.parse(readFileSync(new URL('../scene_graph.json', import.meta.url), 'utf8'));
const flow = JSON.parse(readFileSync(new URL('../scene-flow.json', import.meta.url), 'utf8'));
const documents = buildDocuments();

test('three lower acts have 6, 5 and 4 nodes with stable order, identities and production ownership', () => {
  assert.equal(ACTS.length, 10);
  assert.equal(master.sources.length, 72);
  assert.equal(master.blocks.size, 1563);
  assert.equal(graph.nodes.length, 48);
  assert.equal(graph.edges.length, 56);
  for (const [i, ids] of LOWER_ACT_NODES.entries()) {
    const act = ACTS[i + 6];
    const nodes = graph.nodes.filter(n => n.act === act.act);
    assert.deepEqual(nodes.map(n => n.id), ids);
    for (const node of nodes) {
      assert.equal(node.source, act.path);
      assert.equal(node.pack, act.specPath);
      assert.equal(flow.nodes.find(n => n.id === node.id).floor.source, act.specPath);
    }
    assert(graph.acts[act.act].includes(act.subtitle));
  }
  assert.deepEqual(graph.nodes.filter(n => n.act === FINALE.act).map(n => n.id), ['R32', 'R33', 'POST']);
  assert.deepEqual(deriveGraph(master, graph), graph);
});

test('website chapter order is narrative order despite stable historical filenames', () => {
  assert.deepEqual(documents.filter(d => d.folder === '09_劇本' && !d.archived).map(d => d.path),
    [...ACTS.map(a => a.path), MASTER, APPENDIX]);
  assert.deepEqual(documents.filter(d => d.folder === '10_製作規格' && !d.archived).map(d => d.path), ACTS.map(a => a.specPath));
});

test('legacy lower-act and finale bookmarks resolve without hijacking the new seventh act', () => {
  const resolve = (file, anchor) => {
    const visited = new Set();
    while (true) {
      assert(!visited.has(file), `Redirect cycle: ${file}`);
      visited.add(file);
      const doc = documents.find(d => d.path === file);
      assert(doc, file);
      anchor = doc.headingAliases?.[anchor] || anchor;
      const dest = doc.anchorRedirects?.[anchor] || doc.redirect;
      if (!dest) {
        assert(doc.content.includes(`<a id="${anchor}"></a>`), `${file}#${anchor}`);
        return [file, anchor];
      }
      const [next, explicit] = dest.split('#');
      file = next;
      anchor = explicit || anchor;
    }
  };
  for (const [from, anchor, to, target = anchor] of [
    [ACTS[6].path, 'node-r28-script', ACTS[7].path],
    [ACTS[6].path, 's-0909-40', ACTS[8].path],
    [ACTS[6].path, 'node-r31-images', ACTS[8].specPath],
    [ACTS[6].specPath, 'node-r29-spec', ACTS[7].specPath],
    [ACTS[6].specPath, 'node-u6-images', ACTS[8].specPath],
    [FINALE.path, 'act-7', FINALE.path, 'act-9'],
    [FINALE.specPath, 'spec-act-7-rooms', FINALE.specPath, 'spec-act-9-rooms'],
    [FINALE.path, 'spec-act-7', FINALE.specPath, 'spec-act-9'],
    [MASTER, 'act-7', FINALE.path, 'act-9'],
    [MASTER, 'spec-act-7', FINALE.specPath, 'spec-act-9'],
    [ACTS[7].path, 'act-7', ACTS[7].path],
    [ACTS[7].specPath, 'spec-act-7', ACTS[7].specPath],
  ]) assert.deepEqual(resolve(from, anchor), [to, target]);
  assert(rewriteLinks('[終幕](09-10_正式劇本_終幕.md#act-7)', MASTER, master).includes('#act-9'));
  assert(rewriteLinks('[第七幕](09-16_正式劇本_第七幕.md#act-7)', MASTER, master).includes('#act-7'));
});

test('chapter boundaries retain original route gates, save keys and optional choices', () => {
  // Graph endpoints are immutable IDs; no new inter-act edge or gate is introduced.
  const routes = flow.routes.filter(r => [['U3', 'R28'], ['U5', 'U6'], ['R31', 'R32']].some(([a, b]) => r.from === a && r.to === b));
  assert.equal(routes.length, 3);
  for (const route of routes) {
    const edge = graph.edges.find(e => e.id === route.id);
    assert(edge.gate, route.id);
    assert.equal(edge.fromId, route.from);
    assert.equal(edge.toId, route.to);
  }
  const specs = ACTS.slice(6, 9).map(a => master.documents.get(a.specPath)).join('\n');
  for (const key of ['act6.r29.queue_approved', 'lower.u3.return_latch_open', 'lower.u6.walkway_locked']) assert(specs.includes(key), key);
  assert(master.documents.get(ACTS[7].specPath).includes('核可與未核可均可前進'));
  assert(master.documents.get(ACTS[8].path).includes('選填 H-07 未播放也能前進'));
});
