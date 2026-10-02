/* Authored scene order stays fixed; transition pictures occupy the gaps between rooms. */
const SceneOverview = (() => {
  const box = { width: 168, height: 112 }, gap = 40, pitch = box.width + gap;
  function layout(graph, flow, visibleIds) {
    const visible = new Set(visibleIds), rooms = graph.nodes.filter(n => visible.has(n.id));
    const acts = [...new Set(rooms.map(n => n.act))];
    const routeById = new Map(flow.routes.map(r => [r.id, r]));
    const childById = new Map(flow.subscenes.map(s => [s.id, s]));
    const edges = graph.edges.filter(e => visible.has(e.fromId));
    const nodes = [], lanes = [], positions = new Map(), tracks = new Map();
    let top = 0, width = 600;
    for (const act of acts) {
      const inAct = rooms.filter(n => n.act === act);
      const actEdges = edges.filter(e => inAct.some(n => n.id === e.fromId));
      const lane = { act, y: top + 18, bottom: 0, tracks: 0 };
      lanes.push(lane);
      let x = 48;
      for (const [i, room] of inAct.entries()) {
        const outgoing = actEdges.filter(e => e.fromId === room.id);
        const primary = outgoing.find(e => e.toId === inAct[i + 1]?.id && e.kind !== '捷徑') ||
          (i === inAct.length - 1 ? outgoing.find(e => graph.nodes.find(n => n.id === e.toId).act > act) : null);
        const add = item => { const entry = { ...box, act, ...item }; nodes.push(entry); positions.set(entry.key, entry); };
        add({ key: room.id, id: room.id, type: 'main', image: `${room.id}-V01`, name: room.name, x, y: top + 52 });
        let extra = 0;
        for (const edge of outgoing) {
          const route = routeById.get(edge.id), children = route.steps.filter(s => s.type === 'subscene');
          const adjacent = edge.id === primary?.id;
          const boundary = !visible.has(edge.toId);
          const track = !adjacent && (children.length || boundary) ? ++lane.tracks : 0;
          tracks.set(edge.id, { act, track });
          const y = top + 52 + track * (box.height + 64);
          children.forEach((s, j) => add({ key: s.id, id: s.id, image: s.image, name: childById.get(s.id).name,
            type: 'subscene', route: edge.id, parent: room.id, x: x + (j + 1) * pitch, y }));
          // A filtered-out destination remains a labeled boundary, never an extra room.
          if (boundary) add({ key: `${edge.id}:boundary`, id: edge.toId, type: 'boundary', route: edge.id,
            image: route.steps.at(-1).image, name: graph.nodes.find(n => n.id === edge.toId).name,
            x: x + (children.length + 1) * pitch, y });
          extra = Math.max(extra, children.length + Number(boundary));
        }
        x += (extra + 1) * pitch;
      }
      // Separate routing channels below each row avoid crossing unrelated node rectangles.
      lane.bottom = top + 52 + lane.tracks * (box.height + 64) + box.height + 58 + actEdges.length * 12;
      top = lane.bottom + 26;
      width = Math.max(width, x + 48);
    }
    const segments = [];
    const point = (x, y) => ({ x, y });
    for (const edge of edges) {
      const route = routeById.get(edge.id), lane = lanes.find(l => l.act === tracks.get(edge.id).act);
      const steps = route.steps.map((s, i) => positions.get(i === route.steps.length - 1 && !visible.has(edge.toId) ? `${edge.id}:boundary` : s.id));
      const chain = steps.length === 1 ? [steps[0], steps[0]] : steps;
      for (let i = 1; i < chain.length; i++) {
        const a = chain[i - 1], b = chain[i], right = a.x + a.width, ay = a.y + a.height / 2, by = b.y + b.height / 2;
        let points;
        if (a === b) {
          points = [point(right - 28, a.y + a.height), point(right - 28, a.y + a.height + 32),
            point(a.x + 28, a.y + a.height + 32), point(a.x + 28, a.y + a.height)];
        } else if (a.act !== b.act) {
          const channel = lane.bottom - 12 - edges.filter(e => tracks.get(e.id).act === a.act).findIndex(e => e.id === edge.id) * 12;
          const gutter = 16 + edges.indexOf(edge) % 3 * 8;
          points = [point(right, ay), point(right + 18, ay), point(right + 18, channel),
            point(gutter, channel), point(gutter, b.y - 12), point(b.x - 16, b.y - 12), point(b.x - 16, by), point(b.x, by)];
        } else if (a.y === b.y && b.x > right && !nodes.some(n => n.act === a.act && n.y === a.y && n.x > a.x && n.x < b.x)) {
          points = [point(right, ay), point(b.x, by)];
        } else if (b.x === a.x + pitch) {
          points = [point(right, ay), point(right + gap / 2, ay), point(right + gap / 2, by), point(b.x, by)];
        } else {
          const track = tracks.get(edge.id).track;
          const below = Math.max(a.y, b.y) + box.height + 24 + (track % 3) * 10 + (b.x < a.x ? 16 : 0);
          const startX = right + 16, endX = b.x - 16;
          points = [point(right, ay), point(startX, ay), point(startX, below), point(endX, below), point(endX, by), point(b.x, by)];
        }
        segments.push({ route: edge.id, from: a.key, to: b.key, back: edge.back, kind: edge.kind, points,
          d: points.map((p, j) => `${j ? 'L' : 'M'} ${p.x} ${p.y}`).join(' ') });
      }
    }
    return { nodes, lanes, segments, width, height: Math.max(190, top), box };
  }
  return { layout };
})();
if (typeof module !== 'undefined') module.exports = SceneOverview;
else window.SceneOverview = SceneOverview;
