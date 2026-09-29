import {createRoute, inferPortal, makeRoutePoints, portalPosition} from './sandbox-routes.js';

const EPS = 1e-7;
const MAX_POINTS = 256;
const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
const close = (a, b) => a.every((value, index) => Math.abs(value - b[index]) < EPS);
const lerp = (a, b, t) => a.map((value, index) => value + (b[index] - value) * t);
const planDistance = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]);

function coordinates(point, defaultY = 0) {
  const result = Array.isArray(point) ? [...point] : [point?.x, point?.y ?? defaultY, point?.z];
  if (result.length !== 3 || result.some(value => !Number.isFinite(value))) throw new Error('通路控制點必須是有效的 X、Y、Z 座標。');
  return result;
}

function portal(room, candidate, fallback) {
  if (candidate?.side) return {side: candidate.side, u: candidate.u ?? 0};
  return inferPortal(room, candidate || fallback);
}

function checkHeights(ha, hb) {
  if (!Number.isFinite(ha) || !Number.isFinite(hb)) throw new Error('通路兩端需要有效的樓層高度。');
}

function progress(points) {
  const lengths = [0];
  // The rendered plan is rectangular, so diagonal mouse clicks span the sum
  // of their X and Z travel rather than a diagonal Euclidean shortcut.
  for (let i = 1; i < points.length; i++) lengths.push(lengths.at(-1) + Math.abs(points[i][0] - points[i - 1][0]) + Math.abs(points[i][2] - points[i - 1][2]));
  return lengths.map((distance, i) => lengths.at(-1) > EPS ? distance / lengths.at(-1) : i / Math.max(1, points.length - 1));
}

/** Mouse clicks establish the plan; height is interpolated automatically even
 * when all clicks were picked against the source-floor drawing plane. */
export function connectionFromGesture({id, fromRoom, toRoom, fromPortal, toPortal, waypoints = [], heightA, heightB, width = 1.6}) {
  checkHeights(heightA, heightB);
  if (!fromRoom?.id || !toRoom?.id || fromRoom.id === toRoom.id) throw new Error('請連接兩個不同房間。');
  if (!Array.isArray(waypoints)) throw new Error('通路控制點必須是陣列。');
  const clicked = [];
  for (const point of waypoints) {
    const p = coordinates(point, heightA + .3);
    if (!clicked.length || planDistance(p, clicked.at(-1)) > EPS) clicked.push(p);
  }
  const from = portal(fromRoom, fromPortal, clicked[0] || toRoom);
  const to = portal(toRoom, toPortal, clicked.at(-1) || fromRoom);
  const start = portalPosition(fromRoom, from, heightA, width), end = portalPosition(toRoom, to, heightB, width);
  const rise = Math.abs(heightB - heightA);
  // Nearby rooms on distant floors need folded stairs by default; a direct
  // flight would be excessively steep. Explicit drawing gestures retain the
  // user's chosen plan and can expose any resulting slope warning normally.
  const automaticShape = rise > .05 && rise > planDistance(start, end) * .75 ? 'u' : 'straight';
  let route = createRoute(fromRoom, toRoom, heightA, heightB, {from, to, width, mode: 'auto', shape: clicked.length ? 'manual' : automaticShape});
  if (clicked.length) {
    while (clicked.length && planDistance(clicked[0], start) < EPS) clicked.shift();
    while (clicked.length && planDistance(clicked.at(-1), end) < EPS) clicked.pop();
    const t = progress([start, ...clicked, end]);
    route.points = clicked.map((p, i) => ({x: p[0], z: p[2], t: t[i + 1], dy: 0}));
    if (!clicked.length) route = createRoute(fromRoom, toRoom, heightA, heightB, {from, to, width, mode: 'auto', shape: automaticShape});
  }
  if (route.points.length > MAX_POINTS) throw new Error('每條通路最多可有 256 個控制點。');
  return {id, fromId: fromRoom.id, toId: toRoom.id, kind: '自訂', back: true,
    gate: '', motion: '滑鼠繪製通路；依兩端樓層自動銜接高度。', returnRule: '雙向通行', route};
}

function redundant(a, b, c) {
  const first = b.map((value, i) => value - a[i]), second = c.map((value, i) => value - b[i]);
  const len1 = Math.hypot(...first), len2 = Math.hypot(...second);
  if (len1 < EPS || len2 < EPS) return true;
  // A bend, grade change, landing or reversal is a meaningful control point.
  const samePlanAxis = (Math.abs(first[0]) < EPS && Math.abs(second[0]) < EPS) ||
    (Math.abs(first[2]) < EPS && Math.abs(second[2]) < EPS);
  if (!samePlanAxis || first.reduce((sum, value, i) => sum + value * second[i], 0) <= 0) return false;
  const cross = [first[1] * second[2] - first[2] * second[1], first[2] * second[0] - first[0] * second[2], first[0] * second[1] - first[1] * second[0]];
  return Math.hypot(...cross) <= EPS * len1 * len2;
}

function simplify(points) {
  const result = [];
  for (const point of points) {
    if (result.length && close(result.at(-1), point)) continue;
    result.push([...point]);
    while (result.length > 2 && redundant(...result.slice(-3))) result.splice(result.length - 2, 1);
  }
  return result;
}

function preserveOriginalSlope(points, implicit) {
  if (points.length < 2 || implicit.length < 2) return points;
  const result = points.map(point => [...point]);
  const start = points[0], next = points[1], end = points.at(-1), prior = points.at(-2);
  // Legacy story paths can start directly with a stair flight. The manual
  // renderer needs level doorway leads, so rejoin the old slope shortly after
  // each entrance instead of changing the complete flight's elevation.
  const beginning = planDistance(start, next), ending = planDistance(prior, end);
  if (Math.abs(start[1] - next[1]) > EPS && beginning > EPS) {
    const t = Math.min(.3, Math.max(planDistance(implicit[0], implicit[1]) * 2, .5) / beginning);
    result.splice(1, 0, lerp(start, next, t));
  }
  if (Math.abs(prior[1] - end[1]) > EPS && ending > EPS) {
    const t = Math.min(.3, Math.max(planDistance(implicit.at(-2), implicit.at(-1)) * 2, .5) / ending);
    result.splice(result.length - 1, 0, lerp(end, prior, t));
  }
  return result;
}

function validManualRoute(route) {
  const within = (value, min, max) => Number.isFinite(value) && value >= min && value <= max;
  const validPortal = point => point && ['north', 'east', 'south', 'west'].includes(point.side) && within(point.u, -1, 1);
  return route?.shape === 'manual' && ['auto', 'stairs', 'ramp'].includes(route.mode) &&
    within(route.width, .8, 6) && validPortal(route.from) && validPortal(route.to) &&
    Array.isArray(route.points) && route.points.length <= MAX_POINTS && route.points.every(point =>
      point && !Array.isArray(point) && within(point.x, -150, 150) && within(point.z, -150, 150) && within(point.t, 0, 1) && within(point.dy, -20, 20));
}

function copyRoute(route) {
  return {mode: route.mode, shape: route.shape, width: route.width,
    from: {...route.from}, to: {...route.to}, points: route.points.map(point => ({...point}))};
}

/** Convert the full visible path into movable corner/landing handles. Existing
 * generated stair geometry is preserved; legacy paths gain flat doorway leads
 * on first edit. Only redundant equal-grade straight points are removed. */
export function editableRouteFromPath(edge, points, a, b, ha, hb) {
  checkHeights(ha, hb);
  if (!Array.isArray(points) || !points.length) throw new Error('沒有可編輯的通路座標。');
  const path = points.map(point => coordinates(point));
  const route = {mode: edge?.route?.mode || 'auto', shape: 'manual', width: edge?.route?.width ?? 1.6,
    from: portal(a, edge?.route?.from, path[0]), to: portal(b, edge?.route?.to, path.at(-1)), points: []};
  const implicit = makeRoutePoints(a, b, ha, hb, route);
  const original = simplify(path);
  // Simplify first, then retain rejoining anchors even though they are
  // collinear with the old flight: the newly added level lead changes its slope.
  const full = preserveOriginalSlope(original, implicit);
  const tByDistance = progress(full);
  const interior = full.slice(1, -1).map((point, i) => {
    const t = Math.abs(hb - ha) > EPS ? clamp((point[1] - ha - .3) / (hb - ha), 0, 1) : tByDistance[i + 1];
    return {x: point[0], z: point[2], t, dy: point[1] - (ha + (hb - ha) * t + .3)};
  });
  // Fixed doorway leads are already generated by makeRoutePoints. Do not
  // expose duplicate editing handles on those same anchors.
  if (interior.length && implicit.length > 1 && close(full[1], implicit[1])) interior.shift();
  if (interior.length && implicit.length > 1 && close(full.at(-2), implicit.at(-2))) interior.pop();
  if (interior.length > MAX_POINTS) {
    // A valid stored manual path can render additional orthogonal elbows and
    // stair landings. Selection must not reject that existing route merely
    // because expanding every rendered bend would exceed its handle budget.
    if (validManualRoute(edge?.route)) return copyRoute(edge.route);
    throw new Error('這條通路超過 256 個必要控制點，請先簡化路線。');
  }
  route.points = interior;
  return route;
}

/** Return the closest point on a rendered polyline. segment is the zero-based
 * start-point index; t is local to that segment. With plan:true distance ignores
 * Y, but the returned point still retains the interpolated route elevation. */
export function nearestPathPoint(points, point, {plan = false} = {}) {
  if (!Array.isArray(points) || !points.length) return null;
  const target = coordinates(point), path = points.map(p => coordinates(p));
  const axes = plan ? [0, 2] : [0, 1, 2];
  let nearest = null;
  const segments = Math.max(1, path.length - 1);
  for (let i = 0; i < segments; i++) {
    const a = path[i], b = path[Math.min(i + 1, path.length - 1)];
    const delta = b.map((value, axis) => value - a[axis]);
    const length2 = axes.reduce((sum, axis) => sum + delta[axis] ** 2, 0);
    const t = length2 > EPS * EPS ? clamp(axes.reduce((sum, axis) => sum + (target[axis] - a[axis]) * delta[axis], 0) / length2, 0, 1) : 0;
    const projected = lerp(a, b, t);
    const distance = Math.hypot(...axes.map(axis => target[axis] - projected[axis]));
    if (!nearest || distance < nearest.distance - EPS) nearest = {point: projected, segment: i, t, distance};
  }
  return nearest;
}

function midpointAlong(points) {
  const lengths = points.slice(1).map((point, i) => Math.hypot(...point.map((value, axis) => value - points[i][axis])));
  let remaining = lengths.reduce((sum, value) => sum + value, 0) / 2;
  for (let i = 0; i < lengths.length; i++) {
    if (remaining <= lengths[i] && lengths[i] > EPS) return lerp(points[i], points[i + 1], remaining / lengths[i]);
    remaining -= lengths[i];
  }
  return [...points[0]];
}

/** Extract only the staircase body. All sloping flights and intervening level
 * landings move together; the room portals and their flat approaches stay
 * outside this transient selection and are regenerated by the route renderer. */
export function stairBodyFromPath(edge, points, a, b, ha, hb) {
  checkHeights(ha, hb);
  if (!Array.isArray(points) || !points.length) return null;
  const path = points.map(point => coordinates(point));
  let first = -1, last = -1;
  for (let i = 1; i < path.length; i++) {
    if (Math.abs(path[i][1] - path[i - 1][1]) > EPS) {
      if (first < 0) first = i - 1;
      last = i;
    }
  }
  if (first < 0) return null;
  const core = simplify(path.slice(first, last + 1));
  if (core.length > MAX_POINTS) throw new Error('樓梯本體超過 256 個必要控制點，請先簡化梯段。');
  const tByDistance = progress(core);
  const route = {mode: edge?.route?.mode || 'auto', shape: 'manual', width: edge?.route?.width ?? 1.6,
    from: portal(a, edge?.route?.from, path[0]), to: portal(b, edge?.route?.to, path.at(-1)),
    points: core.map((point, i) => {
      const t = Math.abs(hb - ha) > EPS ? clamp((point[1] - ha - .3) / (hb - ha), 0, 1) : tByDistance[i];
      return {x: point[0], z: point[2], t, dy: point[1] - (ha + (hb - ha) * t + .3)};
    })};
  return {route, center: midpointAlong(core)};
}

/** Return a translated selection without mutating it. A single common delta
 * is clamped against every control point, so hitting the editing boundary
 * cannot squash a flight or distort its landing. Heights and portals are fixed. */
export function translateStairBody(body, dx, dz) {
  if (!body?.route || body.route.shape !== 'manual' || !Array.isArray(body.route.points) || !body.route.points.length ||
      !Number.isFinite(dx) || !Number.isFinite(dz)) throw new Error('樓梯移動需要有效的本體與平面位移。');
  const center = coordinates(body.center), route = copyRoute(body.route);
  const xs = route.points.map(point => point.x), zs = route.points.map(point => point.z);
  if (![...xs, ...zs].every(Number.isFinite)) throw new Error('樓梯控制點座標不正確。');
  const minDx = -150 - Math.min(...xs), maxDx = 150 - Math.max(...xs);
  const minDz = -150 - Math.min(...zs), maxDz = 150 - Math.max(...zs);
  if (minDx > maxDx || minDz > maxDz) throw new Error('樓梯本體超出可編輯範圍，無法整體平移。');
  const actualDx = clamp(dx, minDx, maxDx), actualDz = clamp(dz, minDz, maxDz);
  route.points = route.points.map(point => ({...point, x: point.x + actualDx, z: point.z + actualDz}));
  return {route, center: [center[0] + actualDx, center[1], center[2] + actualDz]};
}
