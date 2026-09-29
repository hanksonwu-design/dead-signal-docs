// Functions are called only after module initialization. sandbox-routes uses
// the section renderer below; this module reuses its portal/orthogonal tools.
import {createRoute, inferPortal, makeRoutePoints, orthogonalize} from './sandbox-routes.js';

const EPS = 1e-7;
const clone = value => JSON.parse(JSON.stringify(value));
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const ordinal = floor => floor > 0 ? floor - 1 : floor;
const fromOrdinal = value => value >= 0 ? value + 1 : value;
const equal = (a, b) => a.every((value, index) => Math.abs(value - b[index]) < EPS);
const mix = (a, b, t) => a.map((value, index) => value + (b[index] - value) * t);

function floorChain(from, to) {
  if (![from, to].every(value => Number.isInteger(value) && value >= -3 && value <= 43 && value !== 0)) throw new Error('樓梯樓層必須介於 B3 與 43F，且不能是 0。');
  const start = ordinal(from), end = ordinal(to), direction = Math.sign(end - start);
  return Array.from({length: Math.abs(end - start) + 1}, (_, index) => fromOrdinal(start + direction * index));
}

function append(path, point) {
  if (!path.length || !equal(path.at(-1), point)) path.push([...point]);
}

function simplify(path) {
  const result = [];
  for (const point of path) {
    append(result, point);
    while (result.length >= 3) {
      const [a, b, c] = result.slice(-3), u = b.map((value, i) => value - a[i]), v = c.map((value, i) => value - b[i]);
      const cross = Math.hypot(u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]);
      if (u.reduce((sum, value, i) => sum + value * v[i], 0) <= 0 || cross > EPS * Math.hypot(...u) * Math.hypot(...v)) break;
      result.splice(result.length - 2, 1);
    }
  }
  return result;
}

function capacity(route) {
  const sections = route.stairSections || [];
  if (sections.length > 45 || sections.some(section => section.points.length < 2 || section.points.length > 256) || sections.reduce((sum, section) => sum + section.points.length, 0) > 2048) {
    throw new Error('分層樓梯最多 45 段，每段 2–256 點，全部合計最多 2048 點。');
  }
  if (sections.some(section => section.points.some(point => ![point.x, point.z, point.t, point.dy].every(Number.isFinite) || Math.abs(point.x) > 150 || Math.abs(point.z) > 150 || point.t < 0 || point.t > 1 || Math.abs(point.dy) > 20))) {
    throw new Error('分層樓梯控制點超出編輯範圍。');
  }
  return route;
}

function baseRoute(edge, a, b, path = []) {
  const source = edge?.route || {};
  return {mode: 'stairs', shape: 'manual', width: source.width ?? 1.6,
    from: clone(source.from || inferPortal(a, path[0] || b)),
    to: clone(source.to || inferPortal(b, path.at(-1) || a)), points: []};
}

function resolver(route, ha, hb, floorHeight) {
  const sections = route.stairSections, first = sections[0].fromFloor, last = sections.at(-1).toFloor;
  const lo = ordinal(first), span = ordinal(last) - lo;
  return floor => {
    const resolved = typeof floorHeight === 'function' ? floorHeight(floor) : undefined;
    return Number.isFinite(resolved) ? resolved : ha + (hb - ha) * (ordinal(floor) - lo) / (span || 1);
  };
}

/** World-space points for one stage, including its two floor landing anchors. */
export function getFloorSectionPoints(route, index, ha, hb, floorHeight) {
  const sections = route.stairSections;
  if (!Array.isArray(sections) || !sections[index]) throw new Error('找不到指定的樓梯樓層段。');
  const section = sections[index], height = resolver(route, ha, hb, floorHeight);
  const start = index === 0 ? ha : height(section.fromFloor);
  const end = index === sections.length - 1 ? hb : height(section.toFloor);
  const points = section.points.map((point, i) => [point.x,
    i === 0 ? start + .3 : i === section.points.length - 1 ? end + .3 : start + (end - start) * point.t + .3 + point.dy, point.z]);
  return orthogonalize(points, route.width);
}

function sectionShape(section, shape, width) {
  const first = {...section.points[0], t: 0, dy: 0}, last = {...section.points.at(-1), t: 1, dy: 0};
  const sx = first.x, sz = first.z, ex = last.x, ez = last.z;
  const dx = ex - sx, dz = ez - sz, run = Math.max(4.8, width * 3);
  const point = (x, z, t) => ({x, z, t, dy: 0});
  let points = [first, last];
  if (shape === 'straight' && Math.hypot(dx, dz) > EPS) return {...section, points};
  if (shape === 'l') {
    let ax = sx, az = sz;
    const prefix = [first];
    // An aligned pair needs a short flat entry to leave room for a true
    // right-angle pair of flights, while retaining both landing anchors.
    if (Math.abs(dx) < EPS) { ax += (sx > 0 ? -1 : 1) * run; prefix.push(point(ax, az, 0)); }
    if (Math.abs(dz) < EPS) { az += (sz > 0 ? -1 : 1) * run; prefix.push(point(ax, az, 0)); }
    const cx = ex, cz = az, xDistance = Math.abs(ex - ax), zDistance = Math.abs(ez - az);
    const radius = Math.min(width * .6, xDistance * .3, zDistance * .3);
    points = [...prefix, point(cx - Math.sign(ex - ax) * radius, cz, .5), point(cx, cz, .5), point(cx, cz + Math.sign(ez - az) * radius, .5), last];
  } else {
    // U shape also handles coincident straight anchors: a vertical line
    // cannot be made into a walkable straight flight without a return leg.
    const useX = Math.abs(dx) >= Math.abs(dz), axisA = useX ? sx : sz, axisB = useX ? ex : ez;
    const laneA0 = useX ? sz : sx, laneB0 = useX ? ez : ex;
    const direction = 150 - Math.max(axisA, axisB) >= Math.min(axisA, axisB) + 150 ? 1 : -1;
    const near = (direction > 0 ? Math.max(axisA, axisB) : Math.min(axisA, axisB)) + direction * (width + .75);
    const far = near + direction * run;
    let laneA = laneA0, laneB = laneB0;
    if (Math.abs(laneB - laneA) < width * 1.5) {
      const centre = clamp((laneA + laneB) / 2, -150 + width * .85, 150 - width * .85);
      laneA = centre - width * .85; laneB = centre + width * .85;
    }
    const at = (along, lane, t) => useX ? point(along, lane, t) : point(lane, along, t);
    points = [first, at(near, laneA, 0), at(far, laneA, .5), at(far, laneB, .5), at(near, laneB, 1), last];
  }
  return {...section, points};
}

/** Reconcile stored stages after either room moves to another floor. Matching
 * floor pairs keep their edits; direction reversals retain the same geometry. */
export function reconcileFloorStairs(route, a, b, ha, hb, floorHeight) {
  if (!Array.isArray(route.stairSections)) return clone(route);
  const floors = floorChain(a.floor, b.floor);
  if (floors.length === 1) {
    return createRoute(a, b, ha, hb, {mode: 'auto', shape: Math.abs(hb - ha) > .05 ? 'u' : 'straight', width: route.width, from: route.from, to: route.to});
  }
  const result = {...clone(route), mode: route.mode === 'auto' ? 'auto' : 'stairs', shape: 'manual', points: [], stairSections: []};
  const old = new Map(route.stairSections.map(section => [`${section.fromFloor}/${section.toFloor}`, section]));
  const implicit = makeRoutePoints(a, b, ha, hb, {...result, stairSections: undefined});
  const start = implicit[1] || implicit[0], end = implicit.at(-2) || implicit.at(-1), count = floors.length - 1;
  for (let i = 0; i < count; i++) {
    const fromFloor = floors[i], toFloor = floors[i + 1];
    const existing = old.get(`${fromFloor}/${toFloor}`), reversed = old.get(`${toFloor}/${fromFloor}`);
    if (existing) result.stairSections.push(clone(existing));
    else if (reversed) result.stairSections.push({fromFloor, toFloor, points: reversed.points.toReversed().map(point => ({...point, t: 1 - point.t}))});
    else {
      const p = mix(start, end, i / count), q = mix(start, end, (i + 1) / count);
      result.stairSections.push(sectionShape({fromFloor, toFloor, points: [{x: p[0], z: p[2], t: 0, dy: 0}, {x: q[0], z: q[2], t: 1, dy: 0}]}, 'u', route.width || 1.6));
    }
  }
  return result;
}

/** Split a visible staircase at every building floor, including empty floors.
 * Existing flat doorway approaches are retained in the first/last stages. */
export function toFloorStairs(edge, path, a, b, ha, hb, floorHeight) {
  const floors = floorChain(a.floor, b.floor);
  if (floors.length === 1) return null;
  if (edge?.route?.stairSections) return capacity(reconcileFloorStairs(edge.route, a, b, ha, hb, floorHeight));
  if (!Array.isArray(path) || path.length < 2 || path.some(point => !Array.isArray(point) || point.length !== 3 || point.some(value => !Number.isFinite(value)))) throw new Error('請提供有效的樓梯路線。');
  const route = {...baseRoute(edge, a, b, path), stairSections: []};
  const implicit = makeRoutePoints(a, b, ha, hb, {...route, stairSections: undefined});
  const normalized = [];
  append(normalized, implicit[1] || implicit[0]);
  path.slice(1, -1).forEach(point => append(normalized, point));
  append(normalized, implicit.at(-2) || implicit.at(-1));
  const fallbackHeight = floor => ha + (hb - ha) * (ordinal(floor) - ordinal(a.floor)) / (ordinal(b.floor) - ordinal(a.floor));
  const height = floor => {
    const value = typeof floorHeight === 'function' ? floorHeight(floor) : undefined;
    return Number.isFinite(value) ? value : fallbackHeight(floor);
  };
  const boundaries = floors.map((floor, i) => i === 0 ? ha : i === floors.length - 1 ? hb : height(floor));
  let remaining = normalized;
  for (let index = 0; index < floors.length - 1; index++) {
    const startHeight = boundaries[index], endHeight = boundaries[index + 1], target = endHeight + .3;
    let part;
    if (index === floors.length - 2) part = remaining;
    else {
      let cut = -1, cross;
      for (let j = 1; j < remaining.length; j++) {
        const a = remaining[j - 1], b = remaining[j];
        if (target >= Math.min(a[1], b[1]) - EPS && target <= Math.max(a[1], b[1]) + EPS && Math.abs(b[1] - a[1]) > EPS) {
          cut = j; cross = mix(a, b, clamp((target - a[1]) / (b[1] - a[1]), 0, 1)); cross[1] = target; break;
        }
      }
      if (cut < 0) return capacity(reconcileFloorStairs({...route, stairSections: []}, a, b, ha, hb, floorHeight));
      part = remaining.slice(0, cut); append(part, cross);
      const next = [cross]; remaining.slice(cut).forEach(point => append(next, point)); remaining = next;
    }
    const simple = simplify(part), delta = endHeight - startHeight;
    if (simple.length === 1) simple.push([...simple[0]]);
    const points = simple.map((point, i) => {
      const t = Math.abs(delta) > EPS ? clamp((point[1] - startHeight - .3) / delta, 0, 1) : i / Math.max(1, simple.length - 1);
      return {x: point[0], z: point[2], t, dy: point[1] - startHeight - delta * t - .3};
    });
    points[0].t = 0; points[0].dy = 0; points.at(-1).t = 1; points.at(-1).dy = 0;
    route.stairSections.push({fromFloor: floors[index], toFloor: floors[index + 1], points});
  }
  return capacity(route);
}

/** Translate one floor pair rigidly. Its neighbours keep their coordinates;
 * their differing boundary positions are joined by a flat floor landing. */
export function translateFloorSection(route, index, dx, dz) {
  if (!route.stairSections?.[index] || !Number.isFinite(dx) || !Number.isFinite(dz)) throw new Error('樓層梯段或位移不正確。');
  const result = clone(route), points = result.stairSections[index].points;
  const xs = points.map(point => point.x), zs = points.map(point => point.z);
  const lowX = -150 - Math.min(...xs), highX = 150 - Math.max(...xs), lowZ = -150 - Math.min(...zs), highZ = 150 - Math.max(...zs);
  if (lowX > highX || lowZ > highZ) throw new Error('此層樓梯超出可平移範圍。');
  const x = clamp(dx, lowX, highX), z = clamp(dz, lowZ, highZ);
  result.stairSections[index].points = points.map(point => ({...point, x: point.x + x, z: point.z + z}));
  return capacity(result);
}

export function setFloorSectionShape(route, index, shape) {
  if (!route.stairSections?.[index] || !['straight', 'l', 'u'].includes(shape)) throw new Error('請選擇有效的樓層梯段與直梯、L 型或 U 型。');
  const result = clone(route);
  result.stairSections[index] = sectionShape(result.stairSections[index], shape, result.width || 1.6);
  return capacity(result);
}

/** Place a complete U staircase at the requested plan centre. The first
 * quarter-turn faces +X, then +Z, -X and -Z. Rotation changes the whole stair
 * footprint; t remains relative to the section's original travel direction.
 * Existing floor joins and room approaches are rebuilt by makeRoutePoints. */
export function placeFloorStair(route, index, x, z, rotation = 0) {
  if (!Number.isInteger(index) || !route?.stairSections?.[index] || !Number.isFinite(x) || !Number.isFinite(z) || !Number.isInteger(rotation)) {
    throw new Error('請選擇有效的樓梯樓層段、位置與 90° 旋轉方向。');
  }
  const width = route.width ?? 1.6;
  if (!Number.isFinite(width) || width < .8 || width > 6) throw new Error('樓梯寬度必須介於 0.8 與 6 之間。');
  const turn = ((rotation % 4) + 4) % 4;
  const run = Math.max(5, width * 3), separation = width + .4;
  const local = [
    [-run / 2, -separation / 2, 0],
    [run / 2, -separation / 2, .5],
    [run / 2, separation / 2, .5],
    [-run / 2, separation / 2, 1]
  ].map(([px, pz, t]) => {
    const [rx, rz] = turn === 0 ? [px, pz] : turn === 1 ? [-pz, px] : turn === 2 ? [-px, -pz] : [pz, -px];
    return {x: rx, z: rz, t, dy: 0};
  });
  // Include the deck half-width when constraining the footprint. Clamp one
  // centre rather than individual points, preserving both flight lengths and
  // the level return landing even at the edge of the editable workspace.
  const halfX = Math.max(...local.map(point => Math.abs(point.x))) + width / 2;
  const halfZ = Math.max(...local.map(point => Math.abs(point.z))) + width / 2;
  const centerX = clamp(x, -150 + halfX, 150 - halfX);
  const centerZ = clamp(z, -150 + halfZ, 150 - halfZ);
  const result = clone(route);
  result.stairSections[index] = {...result.stairSections[index],
    points: local.map(point => ({...point, x: point.x + centerX, z: point.z + centerZ}))};
  return capacity(result);
}
