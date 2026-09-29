const EPS = 1e-6;
const ordinal = floor => floor > 0 ? floor - 1 : floor;
const fromOrdinal = value => value >= 0 ? value + 1 : value;
const floorName = floor => floor < 0 ? `B${-floor}` : `${floor}F`;
const validFloor = floor => Number.isInteger(floor) && floor >= -3 && floor <= 43 && floor !== 0;

function sectionsBetween(fromFloor, toFloor) {
  const start = ordinal(fromFloor), end = ordinal(toFloor), direction = Math.sign(end - start);
  if (!direction) return [{fromFloor, toFloor, index: 0, label: `${floorName(fromFloor)} 局部階梯`}];
  return Array.from({length: Math.abs(end - start)}, (_, index) => {
    const from = fromOrdinal(start + direction * index), to = fromOrdinal(start + direction * (index + 1));
    return {fromFloor: from, toFloor: to, index, label: `${floorName(from)} → ${floorName(to)}`};
  });
}

/** Enumerate existing stair links without changing the graph. Main spine links
 * include both 主線 and 跨幕: the original long flights use the latter kind.
 * Cross-floor links rely on declared room floors; same-floor steps rely on the
 * actual rendered elevation changes. Explicit ramps are excluded throughout. */
export function buildStairCatalog(edges, nodeMap, pathFor) {
  const node = id => typeof nodeMap?.get === 'function' ? nodeMap.get(id) : nodeMap?.[id];
  const catalog = [];
  for (const edge of edges || []) {
    const from = node(edge.fromId), to = node(edge.toId);
    if (!from || !to || !validFloor(from.floor) || !validFloor(to.floor) || edge.route?.mode === 'ramp') continue;
    const local = from.floor === to.floor;
    if (local) {
      let points;
      try { points = pathFor?.(edge)?.points; } catch { continue; }
      if (!Array.isArray(points) || points.length < 2 ||
          points.some(point => !Array.isArray(point) || point.length !== 3 || point.some(value => !Number.isFinite(value))) ||
          !points.some((point, i) => i && Math.abs(point[1] - points[i - 1][1]) > EPS)) continue;
    }
    const terminal = edge.fromId === 'EXIT43' || edge.toId === 'EXIT43';
    const main = !local && (terminal || edge.kind === '主線' || edge.kind === '跨幕');
    catalog.push({edgeId: edge.id, fromFloor: from.floor, toFloor: to.floor,
      fromId: edge.fromId, toId: edge.toId, stairs: true, sections: sectionsBetween(from.floor, to.floor), local, main});
  }
  return catalog.sort((a, b) => ordinal(a.fromFloor) - ordinal(b.fromFloor) || Number(b.main) - Number(a.main) || ordinal(a.toFloor) - ordinal(b.toFloor));
}

/** Keep the caller's floor order, exposing any floor touched by a stair stage. */
export function catalogFloorChoices(catalog, floors) {
  const available = new Set(catalog.flatMap(entry => entry.sections.flatMap(section => [section.fromFloor, section.toFloor])));
  return floors.filter(floor => validFloor(floor) && available.has(floor));
}
