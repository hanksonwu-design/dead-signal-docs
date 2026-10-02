import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import SceneOverview from '../scene-overview.js';

const graph = JSON.parse(readFileSync(new URL('../scene_graph.json', import.meta.url), 'utf8'));
const flow = JSON.parse(readFileSync(new URL('../scene-flow.json', import.meta.url), 'utf8'));
const layout = ids => SceneOverview.layout(graph, flow, ids);
const full = layout(graph.nodes.map(n => n.id));
let passed = 0;
function test(name, fn) { fn(); console.log(`PASS ${name}`); passed++; }
function geometry(result) {
  for (const a of result.nodes) {
    assert(a.x >= 0 && a.y >= 0 && a.x + a.width <= result.width && a.y + a.height <= result.height, a.key);
    for (const b of result.nodes) if (a !== b) assert(!(a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y), `${a.key} overlaps ${b.key}`);
  }
  for (const line of result.segments) {
    for (const [i, p] of line.points.entries()) {
      assert(p.x >= 0 && p.x <= result.width && p.y >= 0 && p.y <= result.height, `${line.route} outside canvas`);
      if (!i) continue;
      const before = line.points[i - 1];
      assert(p.x === before.x || p.y === before.y, 'orthogonal connector');
      for (const n of result.nodes) {
        const crosses = p.x === before.x
          ? p.x > n.x && p.x < n.x + n.width && Math.max(p.y, before.y) > n.y && Math.min(p.y, before.y) < n.y + n.height
          : p.y > n.y && p.y < n.y + n.height && Math.max(p.x, before.x) > n.x && Math.min(p.x, before.x) < n.x + n.width;
        assert(!crosses, `${line.route}: ${line.from} -> ${line.to} crosses ${n.key}`);
      }
    }
  }
}

test('overview has 48 main rooms and all 34 transition nodes, each drawn once', () => {
  assert.equal(full.nodes.length, 82);
  assert.equal(new Set(full.nodes.map(n => n.key)).size, 82);
  assert.equal(full.nodes.filter(n => n.type === 'main').length, 48);
  assert.deepEqual(full.nodes.filter(n => n.type === 'subscene').map(n => n.id).sort(), flow.subscenes.map(n => n.id).sort());
  assert.equal(full.segments.length, 90);
});

test('every original route is subdivided in picture order without bypass edges', () => {
  for (const route of flow.routes) {
    const ids = route.steps.map(s => s.id);
    if (ids.length === 1) ids.push(ids[0]);
    const expected = ids.slice(1).map((id, i) => [ids[i], id, route.back]);
    assert.deepEqual(full.segments.filter(s => s.route === route.id).map(s => [s.from, s.to, s.back]), expected, route.id);
  }
});

test('R2 transition chain is visibly inline and R8 exits are separate branches', () => {
  const chain = ['R2', 'T-R2-R3-01', 'T-R2-R3-02', 'R3'].map(id => full.nodes.find(n => n.id === id));
  assert.equal(new Set(chain.map(n => n.y)).size, 1);
  for (let i = 1; i < chain.length; i++) assert(chain[i].x > chain[i - 1].x + chain[i - 1].width);
  const exits = ['R8-V02', 'R8-V03'].map(id => full.nodes.find(n => n.id === id));
  assert.notEqual(exits[0].y, exits[1].y);
  assert(!full.segments.some(s => s.from === exits[0].id && s.to === exits[1].id));
});

test('full overview keeps every arrow outside every scene rectangle', () => geometry(full));

test('chapter filters preserve transition order and explicit external destination stubs', () => {
  for (const [act] of graph.acts.entries()) {
    const rooms = graph.nodes.filter(n => n.act === act), result = layout(rooms.map(n => n.id));
    assert.equal(result.nodes.filter(n => n.type === 'main').length, rooms.length);
    assert.equal(result.nodes.filter(n => n.type === 'subscene').length, flow.subscenes.filter(s => rooms.some(n => n.id === s.node)).length);
    for (const stub of result.nodes.filter(n => n.type === 'boundary')) {
      assert(!rooms.some(n => n.id === stub.id));
      assert(result.segments.some(s => s.to === stub.key));
    }
    geometry(result);
  }
});

test('part filters, single-scene searches and empty results remain bounded', () => {
  for (const part of [1, 2]) geometry(layout(graph.nodes.filter(n => n.part === part).map(n => n.id)));
  for (const n of graph.nodes) geometry(layout([n.id]));
  const empty = layout([]);
  assert.equal(empty.nodes.length, 0);
  assert.equal(empty.segments.length, 0);
});

test('ending and loops remain original routes, not added transition rooms', () => {
  const ending = layout(['R33']);
  assert.equal(ending.nodes.find(n => n.id === 'P1').image, 'R33-V02');
  assert.equal(ending.nodes.find(n => n.id === 'P1').type, 'boundary');
  for (const id of ['U4', 'R32']) {
    const loop = full.segments.find(s => s.from === id && s.to === id);
    assert(loop && !loop.back);
  }
});

console.log(`${passed} scene-overview checks passed.`);
