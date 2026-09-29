import {getFloorSectionPoints, reconcileFloorStairs} from './floor-stairs.js';

// Pure sandbox geometry. Coordinates use [x, y, z]; heights are the room floor
// elevation, before the shared 0.3 walkway offset. Portal u is -1..1, with 0
// at the wall centre. North is -Z; positive u follows +X or +Z on every wall.
const EPS = 1e-7;
const WALKWAY_Y = .3;
const NORMALS = {north: [0, -1], east: [1, 0], south: [0, 1], west: [-1, 0]};
const clamp = (value, lo, hi) => Math.min(hi, Math.max(lo, value));
const number = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;
const routeWidth = width => Math.max(.1, number(width, 1.6));
const same = (a, b) => a.every((value, i) => Math.abs(value - b[i]) < EPS);
const planarDistance = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]);

function append(points, point) {
  if (!points.length || !same(points.at(-1), point)) points.push([...point]);
}

export function portalPosition(room, portal = {}, height = 0, width = 1.6) {
  const side = Object.hasOwn(NORMALS, portal.side) ? portal.side : 'east';
  const verticalWall = side === 'east' || side === 'west';
  const length = Math.max(0, number(verticalWall ? room.d : room.w));
  // If a requested corridor exceeds the wall length, its portal is centred.
  // The caller can cap the actual wall opening to the available wall length.
  const maxOffset = Math.max(0, (length - routeWidth(width)) / 2);
  const offset = clamp(number(portal.u), -1, 1) * length / 2;
  const fittedOffset = clamp(offset, -maxOffset, maxOffset);
  const normal = NORMALS[side];
  return [
    room.x + (verticalWall ? normal[0] * room.w / 2 : fittedOffset),
    height + WALKWAY_Y,
    room.z + (verticalWall ? fittedOffset : normal[1] * room.d / 2)
  ];
}

export function inferPortal(room, point) {
  const px = Array.isArray(point) ? point[0] : point.x;
  const pz = Array.isArray(point) ? point[2] : point.z;
  const dx = number(px, room.x) - room.x, dz = number(pz, room.z) - room.z;
  const halfW = Math.max(EPS, room.w / 2), halfD = Math.max(EPS, room.d / 2);
  if (Math.abs(dx) / halfW >= Math.abs(dz) / halfD) {
    return {side: dx >= 0 ? 'east' : 'west', u: clamp(dz / halfD, -1, 1)};
  }
  return {side: dz >= 0 ? 'south' : 'north', u: clamp(dx / halfW, -1, 1)};
}

function leadPosition(point, portal, width, distance = routeWidth(width) / 2 + .5) {
  const normal = NORMALS[portal.side] || NORMALS.east;
  return [point[0] + normal[0] * distance, point[1], point[2] + normal[1] * distance];
}

function portalsWithLeads(a, b, ha, hb, from, to, width) {
  const start = portalPosition(a, from, ha, width), end = portalPosition(b, to, hb, width);
  const n = NORMALS[from.side] || NORMALS.east, m = NORMALS[to.side] || NORMALS.east;
  const normalGap = (end[0] - start[0]) * n[0] + (end[2] - start[2]) * n[1];
  const opposing = n[0] === -m[0] && n[1] === -m[1];
  let distance = routeWidth(width) / 2 + .5;
  // Facing doors can be separated by a gap narrower than two standard entry
  // landings. Keep both leads within that gap so the route never doubles back
  // into either room; the middle third remains available for a rising flight.
  if (opposing && normalGap >= 0) distance = Math.min(distance, normalGap / 3);
  return {start, end, startLead: leadPosition(start, from, width, distance), endLead: leadPosition(end, to, width, distance)};
}

// Replace every diagonal XZ span with axis-aligned legs. Existing points (and
// their heights) are retained. Sloping turns receive a short, level landing;
// the height change is assigned to the two flights on either side of it.
export function orthogonalize(points, width = 1.6) {
  if (!Array.isArray(points) || !points.length) return [];
  const result = [];
  append(result, points[0]);
  for (let i = 1; i < points.length; i++) {
    const a = result.at(-1), b = points[i];
    const dx = b[0] - a[0], dz = b[2] - a[2], dy = b[1] - a[1];
    if (Math.abs(dx) > EPS && Math.abs(dz) > EPS) {
      const previous = result.length > 1 ? result.at(-2) : null;
      // Continue the entering direction where possible; otherwise choose the
      // longer first flight. Both choices preserve strictly rectangular plans.
      const xFirst = previous && planarDistance(previous, a) > EPS
        ? Math.abs(a[0] - previous[0]) > Math.abs(a[2] - previous[2])
        : Math.abs(dx) >= Math.abs(dz);
      const firstLength = Math.abs(xFirst ? dx : dz);
      const secondLength = Math.abs(xFirst ? dz : dx);
      const cornerY = a[1] + dy * firstLength / (firstLength + secondLength);
      const corner = [xFirst ? b[0] : a[0], cornerY, xFirst ? a[2] : b[2]];
      if (Math.abs(dy) > EPS) {
        const radius = Math.min(routeWidth(width) / 2 + .1, firstLength * .3, secondLength * .3);
        const before = [...corner], after = [...corner];
        before[xFirst ? 0 : 2] -= Math.sign(xFirst ? dx : dz) * radius;
        after[xFirst ? 2 : 0] += Math.sign(xFirst ? dz : dx) * radius;
        append(result, before); append(result, corner); append(result, after);
      } else append(result, corner);
    }
    append(result, b);
  }
  return result;
}

function insidePlan(point, box) {
  return point[0] > box[0] + EPS && point[0] < box[2] - EPS && point[2] > box[1] + EPS && point[2] < box[3] - EPS;
}

function planCrosses(a, b, box) {
  return intersectsBox([a[0], 0, a[2]], [b[0], 0, b[2]], [box[0], -1, box[1]], [box[2], 1, box[3]]);
}

function liftDetour(path, start, end, width) {
  const distance = [0];
  for (let i = 1; i < path.length; i++) distance.push(distance.at(-1) + planarDistance(path[i - 1], path[i]));
  const length = distance.at(-1), rise = end[1] - start[1], result = [[...start]];
  for (let i = 1; i < path.length - 1; i++) {
    const p = path[i], before = path[i - 1], after = path[i + 1];
    const y = start[1] + rise * distance[i] / length;
    const firstLength = planarDistance(before, p), secondLength = planarDistance(p, after);
    if (Math.abs(rise) > EPS) {
      const radius = Math.min(width / 2 + .1, firstLength * .3, secondLength * .3);
      append(result, [p[0] - (p[0] - before[0]) / firstLength * radius, y, p[2] - (p[2] - before[2]) / firstLength * radius]);
      append(result, [p[0], y, p[2]]);
      append(result, [p[0] + (after[0] - p[0]) / secondLength * radius, y, p[2] + (after[2] - p[2]) / secondLength * radius]);
    } else append(result, [p[0], y, p[2]]);
  }
  append(result, end);
  return result;
}

// A tiny visibility grid around the two endpoint rooms is enough to keep
// generated connectors from crossing a room to reach its far-side door. This
// does not perform building-wide pathfinding or alter manual control points.
function avoidEndpointRooms(start, end, endpoints, width, force = false) {
  const minY = Math.min(start[1], end[1]), maxY = Math.max(start[1], end[1]);
  const rawBoxes = endpoints.filter(({height}) => maxY > height + .05 && minY < height + 2.25)
    .map(({room}) => [room.x - room.w / 2, room.z - room.d / 2, room.x + room.w / 2, room.z + room.d / 2]);
  if (!force && !rawBoxes.some(box => planCrosses(start, end, box))) return orthogonalize([start, end], width);
  // A user-moved automatic waypoint can itself lie inside a room. Preserve it
  // and let the collision warning explain the conflict rather than secretly
  // relocating the visible editing handle.
  if (rawBoxes.some(box => insidePlan(start, box) || insidePlan(end, box))) return orthogonalize([start, end], width);
  const boxes = rawBoxes.map(box => {
    const distance = point => Math.max(box[0] - point[0], point[0] - box[2], box[1] - point[2], point[2] - box[3], 0);
    const pad = Math.min(width / 2 + .15, distance(start), distance(end));
    return [box[0] - pad, box[1] - pad, box[2] + pad, box[3] + pad];
  });
  const xs = [...new Set([start[0], end[0], ...boxes.flatMap(box => [box[0], box[2]])])].sort((a, b) => a - b);
  const zs = [...new Set([start[2], end[2], ...boxes.flatMap(box => [box[1], box[3]])])].sort((a, b) => a - b);
  const nodes = xs.flatMap((x, xi) => zs.map((z, zi) => ({point: [x, 0, z], xi, zi})));
  const index = (xi, zi) => xi * zs.length + zi;
  const source = index(xs.indexOf(start[0]), zs.indexOf(start[2]));
  const target = index(xs.indexOf(end[0]), zs.indexOf(end[2]));
  const distances = nodes.map(() => Infinity), parents = nodes.map(() => -1), visited = new Set();
  distances[source] = 0;
  while (visited.size < nodes.length) {
    let current = -1;
    for (let i = 0; i < nodes.length; i++) if (!visited.has(i) && (current < 0 || distances[i] < distances[current])) current = i;
    if (current < 0 || !Number.isFinite(distances[current]) || current === target) break;
    visited.add(current);
    const node = nodes[current];
    for (const [xi, zi] of [[node.xi - 1, node.zi], [node.xi + 1, node.zi], [node.xi, node.zi - 1], [node.xi, node.zi + 1]]) {
      if (xi < 0 || zi < 0 || xi >= xs.length || zi >= zs.length) continue;
      const next = index(xi, zi), point = nodes[next].point;
      if (visited.has(next) || boxes.some(box => insidePlan(point, box) || planCrosses(node.point, point, box))) continue;
      const distance = distances[current] + planarDistance(node.point, point);
      if (distance + EPS < distances[next]) { distances[next] = distance; parents[next] = current; }
    }
  }
  if (!Number.isFinite(distances[target])) return orthogonalize([start, end], width);
  const path = [];
  for (let at = target; at !== -1; at = parents[at]) path.unshift(nodes[at].point);
  const turns = path.filter((point, i) => !i || i === path.length - 1 ||
    !((nearAxis(path[i - 1][0], point[0]) && nearAxis(point[0], path[i + 1][0])) ||
      (nearAxis(path[i - 1][2], point[2]) && nearAxis(point[2], path[i + 1][2]))));
  return liftDetour(turns, start, end, width);
}

function nearAxis(a, b) { return Math.abs(a - b) < EPS; }

// Intersections of coplanar orthogonal spans. For an overlap, use the first
// shared point along a -> b so a retraced stretch is removed completely.
function flatIntersection(a, b, c, d) {
  const axis = nearAxis(a[0], b[0]) ? 2 : 0, other = axis === 0 ? 2 : 0;
  const between = (value, p, q) => value >= Math.min(p, q) - EPS && value <= Math.max(p, q) + EPS;
  if (nearAxis(c[other], d[other])) {
    if (!nearAxis(a[other], c[other])) return null;
    const lo = Math.max(Math.min(a[axis], b[axis]), Math.min(c[axis], d[axis]));
    const hi = Math.min(Math.max(a[axis], b[axis]), Math.max(c[axis], d[axis]));
    if (lo > hi + EPS) return null;
    const point = [...a]; point[axis] = b[axis] > a[axis] ? lo : hi; return point;
  }
  if (!between(c[axis], a[axis], b[axis]) || !between(a[other], c[other], d[other])) return null;
  const point = [...a]; point[axis] = c[axis]; return point;
}

// Only erase a flat loop if a nonzero part of an automatically added join
// closes it. Authored loops inside a section, rising U flights and crossings
// on different floors stay intact. This also repairs previously saved joins
// without moving any stored handles or rewriting scene data.
function withoutJoinLoops(points, joins) {
  let changed = true;
  while (changed) {
    changed = false;
    const joinCounts = [0]; joins.forEach(value => joinCounts.push(joinCounts.at(-1) + Number(value)));
    search: for (let i = 0; i < joins.length - 1; i++) {
      let end = i;
      while (end < joins.length && nearAxis(points[i][1], points[end + 1][1])) end++;
      // Prefer the last crossing: removing an earlier reversal first could
      // leave the remainder of the rectangular detour as a long U-shaped path.
      for (let j = end - 1; j > i; j--) {
        if (joinCounts[j + 1] === joinCounts[i]) continue;
        const hit = flatIntersection(points[i], points[i + 1], points[j], points[j + 1]);
        if (!hit) continue;
        const closesJoin = joins[i] && !same(hit, points[i + 1]) || joins[j] && !same(hit, points[j]) || joinCounts[j] > joinCounts[i + 1];
        if (!closesJoin) continue;
        const next = points.slice(0, i + 1), flags = joins.slice(0, i);
        const add = (point, generated) => { if (!same(next.at(-1), point)) { next.push(point); flags.push(generated); } };
        add(hit, joins[i]); add(points[j + 1], joins[j]);
        for (let k = j + 2; k < points.length; k++) add(points[k], joins[k - 1]);
        points = next; joins = flags; changed = true; break search;
      }
    }
  }
  return points;
}

export function makeRoutePoints(a, b, ha, hb, route = {}, floorHeight) {
  if (route.stairSections?.length) {
    const current = reconcileFloorStairs(route, a, b, ha, hb, floorHeight);
    if (!current.stairSections?.length) return makeRoutePoints(a, b, ha, hb, current, floorHeight);
    const width = routeWidth(current.width), from = current.from || inferPortal(a, b), to = current.to || inferPortal(b, a);
    const {start, end, startLead, endLead} = portalsWithLeads(a, b, ha, hb, from, to, width);
    const points = [start], joins = [];
    const add = (point, generated = false) => {
      if (same(points.at(-1), point)) return;
      const prefix = points.slice(-2);
      for (const next of orthogonalize([...prefix, point], width).slice(prefix.length)) {
        points.push(next); joins.push(generated);
      }
    };
    add(startLead);
    current.stairSections.forEach((section, index) => {
      getFloorSectionPoints(current, index, ha, hb, floorHeight).forEach((point, i) => add(point, i === 0));
    });
    add(endLead, true); add(end);
    return withoutJoinLoops(points, joins);
  }
  const width = routeWidth(route.width);
  const from = route.from || inferPortal(a, b), to = route.to || inferPortal(b, a);
  const {start, end, startLead, endLead} = portalsWithLeads(a, b, ha, hb, from, to, width);
  const points = [start, startLead];
  for (const point of route.points || []) {
    points.push([point.x, ha + (hb - ha) * clamp(number(point.t), 0, 1) + WALKWAY_Y + number(point.dy), point.z]);
  }
  points.push(endLead, end);
  if (route.shape === 'manual') return orthogonalize(points, width);
  const safe = [[...points[0]]], endpoints = [{room: a, height: ha}, {room: b, height: hb}];
  for (let i = 1; i < points.length; i++) {
    // Keep the actual doorway crossing unchanged. The adjacent flat lead is
    // the anchor for every detour, preserving the selected wall approach.
    let segment = orthogonalize([points[i - 1], points[i]], width);
    const crossesRoom = segment.slice(1).some((end, j) => endpoints.some(({room, height}) =>
      intersectsBox(segment[j], end, [room.x - room.w / 2, height + .05, room.z - room.d / 2],
        [room.x + room.w / 2, height + 2.25, room.z + room.d / 2])));
    if (i !== 1 && i !== points.length - 1 && crossesRoom) {
      segment = avoidEndpointRooms(points[i - 1], points[i], endpoints, width, true);
    }
    segment.slice(1).forEach(point => append(safe, point));
  }
  return safe;
}

function waypoint(point, t) { return {x: point[0], z: point[2], t, dy: 0}; }

export function createRoute(a, b, ha, hb, options = {}) {
  const width = routeWidth(options.width);
  const from = options.from || inferPortal(a, b), to = options.to || inferPortal(b, a);
  const route = {mode: options.mode || 'auto', shape: options.shape || 'straight', width,
    from: {...from}, to: {...to}, points: []};
  const {startLead: start, endLead: end} = portalsWithLeads(a, b, ha, hb, from, to, width);
  const dx = end[0] - start[0], dz = end[2] - start[2];
  const rise = Math.abs(hb - ha), margin = width + .75;
  if (route.shape === 'l') {
    if (Math.abs(dx) > EPS && Math.abs(dz) > EPS) {
      const preferredX = from.side === 'east' || from.side === 'west';
      const corners = [preferredX, !preferredX].map(xFirst => {
        const corner = [xFirst ? end[0] : start[0], 0, xFirst ? start[2] : end[2]];
        const radius = Math.min(width * .6, Math.abs(dx) * .3, Math.abs(dz) * .3);
        const before = [...corner], after = [...corner];
        before[xFirst ? 0 : 2] -= Math.sign(xFirst ? dx : dz) * radius;
        after[xFirst ? 2 : 0] += Math.sign(xFirst ? dz : dx) * radius;
        const points = [before, corner, after], y = (ha + hb) / 2 + WALKWAY_Y;
        const conflicts = points.filter(point => [{room: a, height: ha}, {room: b, height: hb}].some(({room, height}) =>
          y > height + .05 && y < height + 2.25 && insidePlan(point, [room.x - room.w / 2, room.z - room.d / 2, room.x + room.w / 2, room.z + room.d / 2]))).length;
        return {points, conflicts};
      });
      corners.sort((a, b) => a.conflicts - b.conflicts);
      route.points = corners[0].points.map(point => waypoint(point, .5));
    } else {
      // Aligned or stacked portals cannot have a single 90-degree elbow.
      // Place a rectangular landing outside the rooms so both flights remain
      // visible and editable instead of introducing a diagonal or vertical run.
      const outsideX = Math.max(a.x + a.w / 2, b.x + b.w / 2, start[0], end[0]) + margin;
      const outsideZ = Math.max(a.z + a.d / 2, b.z + b.d / 2, start[2], end[2]) + margin;
      const run = Math.max(width * 2, rise / 2 + width);
      route.points = [
        {x: outsideX + run, z: outsideZ, t: .5, dy: 0},
        {x: outsideX + run, z: outsideZ + width, t: .5, dy: 0}
      ];
    }
  } else if (route.shape === 'u') {
    // Two parallel flights with a level 180-degree landing. Keep the complete
    // stairwell outside both room footprints; connectors to it stay level.
    const useX = from.side === 'east' || from.side === 'west';
    const axis = useX ? 0 : 2, laneAxis = useX ? 2 : 0;
    const direction = from.side === 'west' || from.side === 'north' ? -1 : 1;
    const lo = useX ? Math.min(a.x - a.w / 2, b.x - b.w / 2, start[0], end[0])
      : Math.min(a.z - a.d / 2, b.z - b.d / 2, start[2], end[2]);
    const hi = useX ? Math.max(a.x + a.w / 2, b.x + b.w / 2, start[0], end[0])
      : Math.max(a.z + a.d / 2, b.z + b.d / 2, start[2], end[2]);
    const near = (direction > 0 ? hi : lo) + direction * margin;
    const far = near + direction * Math.max(width * 3, rise / 2 + width);
    let laneA = start[laneAxis], laneB = end[laneAxis];
    if (Math.abs(laneB - laneA) < width * 1.5) {
      const centre = (laneA + laneB) / 2;
      laneA = centre - width * .85; laneB = centre + width * .85;
    }
    const at = (along, lane) => {
      const point = [0, 0, 0]; point[axis] = along; point[laneAxis] = lane; return point;
    };
    route.points = [waypoint(at(near, laneA), 0), waypoint(at(far, laneA), .5),
      waypoint(at(far, laneB), .5), waypoint(at(near, laneB), 1)];
  } else if (planarDistance(start, end) < width && rise > EPS) {
    // A straight connection between stacked doors would be a vertical wall.
    // Give it an exterior flight and a flat turn that can be moved by the user.
    const n = NORMALS[from.side] || NORMALS.east;
    const distance = Math.max(rise + width, width * 3);
    route.points = [{x: start[0] + n[0] * distance, z: start[2] + n[1] * distance, t: .5, dy: 0}];
  }
  return route;
}

function intersectsBox(a, b, lo, hi) {
  let enter = 0, leave = 1;
  for (let axis = 0; axis < 3; axis++) {
    const delta = b[axis] - a[axis];
    if (Math.abs(delta) < EPS) {
      if (a[axis] <= lo[axis] || a[axis] >= hi[axis]) return false;
    } else {
      let low = (lo[axis] - a[axis]) / delta, high = (hi[axis] - a[axis]) / delta;
      if (low > high) [low, high] = [high, low];
      enter = Math.max(enter, low); leave = Math.min(leave, high);
      if (enter >= leave) return false;
    }
  }
  return leave > 0 && enter < 1;
}

export function routeWarnings(points, a, b, ha, hb, rooms, heightFn, width = 1.6) {
  if (!Array.isArray(points) || !points.length || points.some(p => !Array.isArray(p) || p.length !== 3 || p.some(v => !Number.isFinite(v)))) {
    return ['路線座標不完整，請重新設定路口與轉折點。'];
  }
  const warnings = [];
  let length = 0, vertical = false, steep = false;
  for (let i = 1; i < points.length; i++) {
    const flat = planarDistance(points[i - 1], points[i]), rise = Math.abs(points[i][1] - points[i - 1][1]);
    length += Math.hypot(flat, rise);
    if (rise > .05 && flat < EPS) vertical = true;
    else if (rise > flat + .05) steep = true;
  }
  if (vertical) warnings.push('路線含垂直落差；請增加水平梯段或改用折返樓梯。');
  else if (steep) warnings.push('部分梯段坡度超過 45°；請拉長梯段或增加折返。');
  if (Math.abs(points[0][1] - ha - WALKWAY_Y) > .05 || Math.abs(points.at(-1)[1] - hb - WALKWAY_Y) > .05) {
    warnings.push('路線端點高度未貼齊房間地面。');
  }
  const blocked = [], half = routeWidth(width) / 2;
  const supplied = rooms instanceof Map ? [...rooms.values()] : (rooms || []);
  const list = [...new Map([...supplied, a, b].map(room => [room.id, room])).values()];
  for (const room of list) {
    if (room.id === 'R4b' && (a.id === 'R4' || b.id === 'R4')) continue;
    const endpointA = room.id === a.id, endpointB = room.id === b.id;
    const y = endpointA ? ha : endpointB ? hb : heightFn(room.id);
    if (!Number.isFinite(y)) continue;
    const padding = endpointA || endpointB ? 0 : half;
    const lo = [room.x - room.w / 2 - padding, y + .05, room.z - room.d / 2 - padding];
    const hi = [room.x + room.w / 2 + padding, y + 2.25, room.z + room.d / 2 + padding];
    if (points.slice(1).some((point, index) => {
      if (endpointA && index === 0 || endpointB && index === points.length - 2) return false;
      return intersectsBox(points[index], point, lo, hi);
    })) blocked.push(room.id);
  }
  if (blocked.length) warnings.push(`通道可能穿過 ${blocked.slice(0, 5).join('、')}${blocked.length > 5 ? ' 等房間' : ''}；請調整轉折點或高度。`);
  if (length > Math.max(120, Math.hypot(...points[0].map((v, i) => v - points.at(-1)[i])) * 5 + 30)) {
    warnings.push('路線繞行較長，可移動轉折點縮短通行距離。');
  }
  return warnings;
}
