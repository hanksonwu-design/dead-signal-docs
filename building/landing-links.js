import {portalPosition, orthogonalize} from './sandbox-routes.js';
import {toFloorStairs, reconcileFloorStairs, getFloorSectionPoints} from './floor-stairs.js';

const EPS = 1e-7;
const sides = new Set(['north', 'east', 'south', 'west']);
const floorName = floor => floor < 0 ? `B${-floor}` : `${floor}F`;
const validFloor = floor => Number.isInteger(floor) && floor >= -3 && floor <= 43 && floor !== 0;
const finitePoint = point => Array.isArray(point) && point.length === 3 && point.every(Number.isFinite);
const nodeFor = (context, id) => typeof context.nodeMap?.get === 'function' ? context.nodeMap.get(id) : context.nodeMap?.[id];

function edgePorts(edge, context) {
  const a = nodeFor(context, edge.fromId), b = nodeFor(context, edge.toId);
  if (!a || !b || !validFloor(a.floor) || !validFloor(b.floor) || a.floor === b.floor || edge.route?.mode === 'ramp') return [];
  try {
    const ha = context.roomY(a), hb = context.roomY(b);
    if (!Number.isFinite(ha) || !Number.isFinite(hb)) return [];
    const route = edge.route?.stairSections
      ? reconcileFloorStairs(edge.route, a, b, ha, hb, context.floorHeight)
      : toFloorStairs(edge, context.pathFor(edge).points, a, b, ha, hb, context.floorHeight);
    if (!route?.stairSections?.length) return [];
    const ports = [], seen = new Set();
    const add = (floor, point) => {
      if (seen.has(floor) || !finitePoint(point)) return;
      seen.add(floor);
      ports.push({endpoint: {kind: 'landing', edgeId: edge.id, floor}, point: [...point],
        label: `樓梯 · ${floorName(floor)}（${edge.fromId} → ${edge.toId}）`});
    };
    route.stairSections.forEach((section, index) => {
      const points = getFloorSectionPoints(route, index, ha, hb, context.floorHeight);
      // If adjacent sections have independent X/Z anchors, the outgoing
      // section owns this floor's port; their existing flat join remains intact.
      add(section.fromFloor, points[0]);
      if (index === route.stairSections.length - 1) add(section.toFloor, points.at(-1));
    });
    return ports;
  } catch {
    // Stale/dangling geometry must not break the rest of the scene while a
    // parent edge or its rooms are being edited or removed.
    return [];
  }
}

/** Stable endpoint identities for every floor crossed by each staircase,
 * including original routes that have not been converted to editable stages. */
export function landingPorts(context) {
  return (context.edges || []).flatMap(edge => edgePorts(edge, context));
}

/** Resolve against current room and stair positions on every rebuild. Missing
 * references return null; no old world-space position is stored in a link. */
export function resolveLinkEndpoint(endpoint, context) {
  if (endpoint?.kind === 'landing') {
    if (!validFloor(endpoint.floor)) return null;
    const edge = context.edges?.find(value => value.id === endpoint.edgeId);
    const port = edge && edgePorts(edge, context).find(value => value.endpoint.floor === endpoint.floor);
    return port ? {point: [...port.point], label: port.label, floor: endpoint.floor} : null;
  }
  if (endpoint?.kind !== 'room' || !sides.has(endpoint.side) || !Number.isFinite(endpoint.u) || endpoint.u < -1 || endpoint.u > 1) return null;
  const room = nodeFor(context, endpoint.roomId), width = context.width ?? 1.6;
  if (!room || !validFloor(room.floor) || ![room.x, room.z, room.w, room.d, width].every(Number.isFinite) || room.w <= 0 || room.d <= 0 || width <= 0) return null;
  try {
    const height = context.roomY(room);
    if (!Number.isFinite(height)) return null;
    const point = portalPosition(room, endpoint, height, width);
    return finitePoint(point) ? {point, label: `${room.id} · ${floorName(room.floor)}`, floor: room.floor} : null;
  } catch { return null; }
}

function automaticStairConnection(start, end, width) {
  const rise = end[1] - start[1], halfY = start[1] + rise / 2;
  const useX = Math.abs(end[0] - start[0]) >= Math.abs(end[2] - start[2]);
  const along = useX ? 0 : 2, across = useX ? 2 : 0;
  const low = Math.min(start[along], end[along]), high = Math.max(start[along], end[along]);
  // Prefer the side with more room inside the usual editing bounds. Flight
  // length derives from rise, so tall or nearly stacked links cannot become
  // a vertical stack of steps. Each half-rise has a slope of at most 2:3.
  const direction = 150 - high >= low + 150 ? 1 : -1;
  const near = (direction > 0 ? high : low) + direction * (width / 2 + .5);
  const far = near + direction * Math.max(5, width * 3, Math.abs(rise) * .75);
  let laneA = start[across], laneB = end[across];
  const separation = width + .4;
  if (Math.abs(laneB - laneA) < separation) {
    const centre = Math.min(150 - separation / 2, Math.max(-150 + separation / 2, (laneA + laneB) / 2));
    laneA = centre - separation / 2; laneB = centre + separation / 2;
  }
  const at = (axis, lane, y) => useX ? [axis, y, lane] : [lane, y, axis];
  return orthogonalize([
    start, at(near, laneA, start[1]), at(far, laneA, halfY),
    at(far, laneB, halfY), at(near, laneB, end[1]), end
  ], width);
}

/** Link {from,to,width,points:[{x,z}]} joins two exact live endpoints. Height is
 * distributed along the rectangular plan; same-height links remain flat.
 * orthogonalize also supplies level elbow landings when heights differ. */
export function makeLandingLinkPoints(link, context) {
  if (!link) return [];
  const width = link.width ?? 1.6;
  if (!Number.isFinite(width) || width <= 0) return [];
  const current = {...context, width};
  const from = resolveLinkEndpoint(link.from, current), to = resolveLinkEndpoint(link.to, current);
  if (!from || !to || !Array.isArray(link.points ?? [])) return [];
  const waypoints = link.points || [];
  if (waypoints.some(point => !point || !Number.isFinite(point.x) || !Number.isFinite(point.z))) return [];
  const directRun = Math.abs(to.point[0] - from.point[0]) + Math.abs(to.point[2] - from.point[2]);
  const directRise = Math.abs(to.point[1] - from.point[1]);
  if (!waypoints.length && directRise > EPS && directRise > directRun * .6) {
    const folded = automaticStairConnection(from.point, to.point, width);
    return folded.every(finitePoint) ? folded : [];
  }
  const plan = [[...from.point], ...waypoints.map(point => [point.x, from.point[1], point.z]), [...to.point]];
  const travel = [0];
  for (let i = 1; i < plan.length; i++) travel.push(travel.at(-1) + Math.abs(plan[i][0] - plan[i - 1][0]) + Math.abs(plan[i][2] - plan[i - 1][2]));
  const distance = travel.at(-1), rise = to.point[1] - from.point[1];
  const points = plan.map((point, index) => {
    if (index === 0) return [...from.point];
    if (index === plan.length - 1) return [...to.point];
    const t = distance > EPS ? travel[index] / distance : index / (plan.length - 1);
    return [point[0], from.point[1] + rise * t, point[2]];
  });
  const result = orthogonalize(points, width);
  return result.every(finitePoint) ? result : [];
}
