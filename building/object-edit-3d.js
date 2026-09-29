import {TransformControls} from 'three/addons/controls/TransformControls.js';
import {editableRouteFromPath, nearestPathPoint} from './mouse-routes.js';
import {inferPortal, makeRoutePoints, portalPosition} from './sandbox-routes.js';
import {clipRouteToHeight} from './floor-route-view.js';
import {makeLandingLinkPoints} from './landing-links.js';

const clone = value => JSON.parse(JSON.stringify(value));
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const snap = value => Math.round(value * 2) / 2;
const floorName = value => value < 0 ? `B${-value}` : `${value}F`;
const samePoint = (a, b) => a.every((value, i) => Math.abs(value - b[i]) < 1e-6);

// Only completed gestures reach the shared store. The gizmo moves a proxy and
// room groups/route overlays provide transient previews, so cancel is lossless.
export function createObjectEdit3D(env) {
 const {THREE, host, scene, data, nodeMap, editor, roomY, pathFor} = env;
 const proxy = new THREE.Object3D(); scene.add(proxy);
 const transform = new TransformControls(env.camera(), env.canvas());
 transform.setMode('translate'); transform.setSpace('world'); transform.setTranslationSnap(.5); transform.setSize(.85);
 transform.showX = true; transform.showY = true; transform.showZ = true; transform.enabled = false;
 const helper = transform.getHelper(); scene.add(helper);
 let enabled = false, selected = null, working = null, gesture = null, gizmoGesture = null, gizmoOwner = null, overlay = null, markers = [], cancelling = false, previewBounds = null;
 const notify = () => env.onChange?.();
 const edge = id => data.edges.find(value => value.id === id);
 const platform = id => data.platformLinks?.find(value => value.id === id);
 const platformDraft = link => ({...clone(link), isPlatform: true, route: {width: link.width, points: clone(link.points)}});
 const landingContext = () => ({edges: data.edges, nodeMap, roomY, pathFor, floorHeight: env.floorHeight});
 const nodeVisible = n => n && !n.terminal && (env.visible?.(n) ?? true);
 const offset = id => env.offsets?.[id] ?? 0;
 const stamp = () => JSON.stringify([editor.snapshot(), data.nodes.map(n => [n.id, roomY(n)]), env.floors().map(env.floorHeight), env.routeBounds?.()]);
 const edgeVisible = id => env.edgeObjects().some(value => value.e?.id === id && value.g.visible);
 const platformVisible = id => env.platformLinkObjects?.().some(value => value.link?.id === id && value.g.visible) ?? false;
 const routeVisible = value => value.isPlatform ? platformVisible(value.id) : edgeVisible(value.id);
 const pointVisible = point => { const bounds = env.routeBounds?.(); return !bounds || point[1] >= bounds[0] && point[1] <= bounds[1]; };
 const status = (message, error = false) => env.status?.(message, error);
 const roomDescription = n => `${n.id} · ${floorName(n.floor)} · 已選取；拖 X／Y／Z 箭頭或平面把手移動`;
 function ray(event) {
  const rect = env.canvas().getBoundingClientRect(), result = new THREE.Raycaster();
  result.setFromCamera(new THREE.Vector2((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1), env.camera());
  return result;
 }
 const world = (event, y) => ray(event).ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -y), new THREE.Vector3());
 function clearOverlay() {
  if (overlay) { scene.remove(overlay); overlay.traverse(o => { o.geometry?.dispose(); for (const m of Array.isArray(o.material) ? o.material : [o.material]) m?.dispose(); }); overlay = null; }
 }
 function clearMarkers() { for (const marker of markers) marker.el.remove(); markers = []; }
 function routePath(value) {
  if (value.isPlatform) return makeLandingLinkPoints({...value, width: value.route.width, points: value.route.points}, landingContext());
  const a = nodeMap.get(value.fromId), b = nodeMap.get(value.toId);
  return makeRoutePoints(a, b, roomY(a), roomY(b), value.route, env.floorHeight);
 }
 function drawPreview() {
  clearOverlay(); if (!enabled || !working || !routeVisible(working)) return;
  const bounds = env.routeBounds?.(), points = routePath(working), paths = bounds ? clipRouteToHeight(points, ...bounds) : [points];
  previewBounds = JSON.stringify(bounds ?? null);
  overlay = new THREE.Group(); scene.add(overlay); for (const path of paths) env.drawRoute(working, path, overlay, true);
 }
 function marker(text, point, kind, info = {}) {
  if (!pointVisible(point)) return;
  const el = document.createElement('button'); el.type = 'button'; el.textContent = text;
  el.className = kind === 'endpoint' || kind === 'fixed' ? 'mouse-endpoint object3d-handle' : kind === 'midpoint' ? 'mouse-midpoint object3d-handle' : 'mouse-point object3d-handle';
  el.dataset.object3dKind = kind; el.title = kind === 'fixed' ? '固定接點：隨原房間或樓梯平台移動' : kind === 'endpoint' ? '拖曳調整房間路口' : kind === 'midpoint' ? '新增通路轉角' : '拖曳通路轉角'; el.setAttribute('aria-label', el.title);
  if (kind === 'fixed') { el.disabled = true; el.style.cursor = 'default'; }
  host.append(el); markers.push({el, point: [...point], kind, ...info});
 }
 function buildMarkers() {
  clearMarkers(); if (!enabled || !working || !routeVisible(working)) return;
  if (working.isPlatform) { buildPlatformMarkers(); return; }
  const a = nodeMap.get(working.fromId), b = nodeMap.get(working.toId), ha = roomY(a), hb = roomY(b), route = working.route;
  marker('A', portalPosition(a, route.from, ha, route.width), 'endpoint', {end: 'from', y: ha + .3});
  marker('B', portalPosition(b, route.to, hb, route.width), 'endpoint', {end: 'to', y: hb + .3});
  // The section renderer owns all intermediate anchors. Its room entrances
  // remain editable, without flattening or replacing any saved stair stage.
  if (route.stairSections?.length) return;
  const points = routePath(working), anchors = []; let previous = 0;
  for (const [index, p] of route.points.entries()) {
   const point = [p.x, ha + (hb - ha) * p.t + .3 + p.dy, p.z];
   marker('', point, 'point', {index, y: point[1]});
   const at = points.findIndex((q, i) => i >= previous && samePoint(point, q)); previous = at < 0 ? previous : at; anchors.push(previous);
  }
  if (route.points.length >= 256) return;
  for (let i = 1; i < points.length; i++) {
   const p = points[i - 1], q = points[i];
   if (Math.abs(p[1] - q[1]) > .05 || Math.hypot(q[0] - p[0], q[2] - p[2]) < 3) continue;
   const point = p.map((value, axis) => (value + q[axis]) / 2), t = Math.abs(hb - ha) > .001 ? clamp((point[1] - ha - .3) / (hb - ha), 0, 1) : .5;
   marker('+', point, 'midpoint', {index: anchors.filter(at => at <= i - 1).length, y: point[1], waypoint: {x: point[0], z: point[2], t, dy: point[1] - ha - (hb - ha) * t - .3}});
  }
 }
 function buildPlatformMarkers() {
  const points = routePath(working); if (points.length < 2) return;
  marker('A', points[0], 'fixed'); marker('B', points.at(-1), 'fixed');
  const anchors = []; let previous = 0;
  for (const [index, p] of working.route.points.entries()) {
   const at = points.findIndex((q, i) => i >= previous && Math.abs(q[0] - p.x) < 1e-6 && Math.abs(q[2] - p.z) < 1e-6); previous = at < 0 ? previous : at; anchors.push(previous);
   const point = points[previous]; marker('', point, 'point', {index, y: point[1]});
  }
  if (working.route.points.length >= 256) return;
  for (let i = 1; i < points.length; i++) {
   const p = points[i - 1], q = points[i]; if (Math.hypot(q[0] - p[0], q[2] - p[2]) < 3) continue;
   const point = p.map((value, axis) => (value + q[axis]) / 2);
   marker('+', point, 'midpoint', {index: anchors.filter(at => at <= i - 1).length, y: point[1], waypoint: {x: point[0], z: point[2]}});
  }
 }
 function resetRoomPreview(id) { if (id) env.previewRoom?.(id, {x: 0, y: 0, z: 0}); }
 function roomBefore(n) { return {id: n.id, x: n.x, z: n.z, floor: n.floor, offset: offset(n.id), y: roomY(n)}; }
 function roomPatch(before, position) {
  const patch = {x: clamp(snap(position.x), -100, 100), z: clamp(snap(position.z), -100, 100)};
  if (Math.abs(position.y - before.y) < 1e-6) return {...patch, floor: before.floor, offset: before.offset};
  const floors = env.floors(), floor = floors.reduce((near, f) => Math.abs(env.floorHeight(f) - position.y) < Math.abs(env.floorHeight(near) - position.y) ? f : near, floors[0]);
  return {...patch, floor, offset: clamp(snap(position.y - env.floorHeight(floor)), -2, 3)};
 }
 function previewRoom(before, position) {
  const patch = roomPatch(before, position), y = env.floorHeight(patch.floor) + patch.offset;
  env.previewRoom?.(before.id, {x: patch.x - before.x, y: y - before.y, z: patch.z - before.z});
  status(`${before.id} · ${floorName(patch.floor)} · X ${patch.x} / Z ${patch.z} / 高差 ${patch.offset}`); return patch;
 }
 function commitRoom(before, patch) {
  resetRoomPreview(before.id);
  if (editor.updateRoom(before.id, patch)) env.afterEdit(`${before.id} · ${floorName(patch.floor)} 位置已保存`);
  refresh(); notify();
 }
 function cancel() {
  cancelling = true;
  if (gesture) { const old = gesture; gesture = null; if (old.beforeEdge) working = old.beforeEdge; if (host.hasPointerCapture?.(old.pointer)) host.releasePointerCapture(old.pointer); env.controls().enabled = old.orbit; }
  if (gizmoGesture) { const old = gizmoGesture; gizmoGesture = null; resetRoomPreview(old.before.id); proxy.position.set(old.before.x, old.before.y, old.before.z); env.controls().enabled = old.orbit; }
  const owner = gizmoOwner; gizmoOwner = null; if (owner !== null && env.canvas().hasPointerCapture?.(owner)) env.canvas().releasePointerCapture(owner);
  transform.dragging = false; transform.axis = null; cancelling = false;
  drawPreview(); buildMarkers(); notify();
 }
 function clearSelection() { cancel(); selected = null; working = null; transform.detach(); clearOverlay(); clearMarkers(); notify(); }
 function selectRoom(id) {
  const n = nodeMap.get(id); if (!nodeVisible(n)) return false;
  clearSelection(); selected = {kind: 'room', id}; proxy.position.set(n.x, roomY(n), n.z); transform.attach(proxy); transform.enabled = enabled;
  env.onSelect?.(selected); status(roomDescription(n)); notify(); return true;
 }
 function selectEdge(id) {
  const original = edge(id); if (!original) return false;
  const a = nodeMap.get(original.fromId), b = nodeMap.get(original.toId); if (!a || !b) return false;
  clearSelection(); selected = {kind: 'edge', id};
  working = {...clone(original), route: original.route?.stairSections?.length || original.route?.shape === 'manual' ? clone(original.route) : editableRouteFromPath(original, pathFor(original).points, a, b, roomY(a), roomY(b))};
  env.onSelect?.(selected); drawPreview(); buildMarkers(); status(`${a.id} → ${b.id} · 拖金色轉角調整走廊；＋ 新增轉角，A／B 調整路口`); notify(); return true;
 }
 function selectPlatform(id) {
  const link = platform(id); if (!link || !platformVisible(id)) return false;
  clearSelection(); selected = {kind: 'platform', id}; working = platformDraft(link);
  env.onSelect?.(selected); drawPreview(); buildMarkers(); status(`${id} · 拖金色轉角，＋ 新增轉角；A／B 固定，隨原房間或樓梯平台移動`); notify(); return true;
 }
 function roomAt(event, cast) {
  const label = event.target.closest?.('.room-tag');
  if (label?.dataset.node && nodeVisible(nodeMap.get(label.dataset.node))) return {n: nodeMap.get(label.dataset.node), distance: -1};
  const hit = cast.intersectObjects(env.roomMeshes().filter(o => o.parent?.visible !== false && nodeVisible(nodeMap.get(o.userData.node))), true)[0];
  return hit ? {n: nodeMap.get(hit.object.userData.node), distance: hit.distance} : null;
 }
 function corridorAt(cast) {
  cast.params.Line.threshold = .4;
  const objects = [...env.edgeObjects(), ...(env.platformLinkObjects?.() || [])];
  const hits = cast.intersectObjects(objects.filter(o => o.g.visible).map(o => o.g), true);
  for (const hit of hits) {
   if (hit.object.userData.platformLink && platformVisible(hit.object.userData.platformLink)) return {id: hit.object.userData.platformLink, kind: 'platform', distance: hit.distance};
   const original = edge(hit.object.userData.edge); if (!original) continue;
   const points = pathFor(original).points, nearest = nearestPathPoint(points, hit.point);
   if (!nearest || !points[nearest.segment + 1] || Math.abs(points[nearest.segment][1] - points[nearest.segment + 1][1]) > .05) continue;
   return {id: original.id, distance: hit.distance};
  }
  return null;
 }
 function capture(event, value) {
  gesture = {...value, pointer: event.pointerId, startClientX: event.clientX, startClientY: event.clientY, stamp: stamp(), moved: false, orbit: env.controls().enabled};
  env.controls().enabled = false; host.setPointerCapture(event.pointerId); event.preventDefault(); event.stopImmediatePropagation(); notify();
 }
 function pointerDown(event) {
  if (!enabled || event.button !== 0 || gesture) return;
  if (gizmoGesture) { if (gizmoOwner !== null && event.pointerId !== gizmoOwner) { event.preventDefault(); event.stopImmediatePropagation(); } return; }
  const handle = event.target.closest?.('[data-object3d-kind]'), item = markers.find(m => m.el === handle);
  if (item && working) {
   if (item.kind === 'fixed') return;
   const start = world(event, item.y); if (!start) return;
   const beforeEdge = clone(working);
   if (item.kind === 'midpoint') working.route.points.splice(item.index, 0, clone(item.waypoint));
   const value = item.kind === 'endpoint' ? null : clone(working.route.points[item.index]);
   capture(event, {kind: item.kind, marker: item, index: item.index, end: item.end, y: item.y, start, value, beforeEdge}); drawPreview(); return;
  }
  if (event.target !== env.canvas() && !event.target.closest?.('.room-tag')) return;
  if (event.target === env.canvas() && transform.enabled && transform.object && (transform.axis || transform.dragging)) { gizmoOwner = event.pointerId; return; }
  const cast = ray(event), room = roomAt(event, cast), corridor = event.target.closest?.('.room-tag') ? null : corridorAt(cast);
  if (room && (!corridor || room.distance <= corridor.distance)) {
   // Room bodies and labels select only. Movement starts on the transform
   // gizmo, so a selection click that slips cannot alter the layout.
   if (selectRoom(room.n.id)) capture(event, {kind: 'select'});
  } else if (corridor) { if ((corridor.kind === 'platform' ? selectPlatform : selectEdge)(corridor.id)) capture(event, {kind: 'select'}); }
 }
 function pointerMove(event) {
  if (gizmoGesture && gizmoOwner !== null && event.pointerId !== gizmoOwner) { event.preventDefault(); event.stopImmediatePropagation(); return; }
  if (!enabled || !gesture || event.pointerId !== gesture.pointer) return;
  const g = gesture;
  if (g.stamp !== stamp()) { cancel(); refresh(); return; }
  if (Math.hypot(event.clientX - g.startClientX, event.clientY - g.startClientY) > 4) g.moved = true;
  if (!g.moved) return;
  if (g.kind === 'point' || g.kind === 'midpoint') {
   const p = world(event, g.y); if (!p) return; const point = working.route.points[g.index];
   point.x = clamp(snap(g.value.x + p.x - g.start.x), -150, 150); point.z = clamp(snap(g.value.z + p.z - g.start.z), -150, 150); working.route.shape = 'manual'; drawPreview();
   g.marker.point = [point.x, g.y, point.z];
  } else if (g.kind === 'endpoint') {
   const p = world(event, g.y); if (!p) return;
   const n = nodeMap.get(g.end === 'from' ? working.fromId : working.toId); working.route[g.end] = inferPortal(n, p); drawPreview();
   g.marker.point = portalPosition(n, working.route[g.end], roomY(n), working.route.width);
  }
 }
 function pointerUp(event, aborted = false) {
  if (gizmoGesture && gizmoOwner !== null && event.pointerId !== gizmoOwner) { event.preventDefault(); event.stopImmediatePropagation(); return; }
  if (aborted && gizmoGesture) { cancel(); refresh(); return; }
  if (!gesture || event.pointerId !== gesture.pointer) return;
  if (gesture.stamp !== stamp()) { cancel(); refresh(); return; }
  if (aborted) { cancel(); refresh(); return; }
  const g = gesture; gesture = null; if (host.hasPointerCapture?.(g.pointer)) host.releasePointerCapture(g.pointer); env.controls().enabled = g.orbit;
  event.preventDefault(); event.stopImmediatePropagation();
  try {
   if (g.beforeEdge && (g.moved || g.kind === 'midpoint')) {
    const changed = working.isPlatform ? editor.updatePlatformLink(working.id, {points: clone(working.route.points)}) : editor.updateEdge(working.id, {route: clone(working.route)});
    if (changed) env.afterEdit(working.isPlatform ? '平台連接轉角已更新；A／B 接點保持固定' : `${working.fromId} → ${working.toId} 通路已更新`);
   }
  } catch (error) { if (g.beforeEdge) working = g.beforeEdge; status(error.message, true); }
  refresh(); notify();
 }
 function refresh() {
  if (gesture || gizmoGesture) { if ((gesture || gizmoGesture).stamp === stamp()) return; cancel(); }
  transform.camera = env.camera();
  if (selected?.kind === 'room') {
   const n = nodeMap.get(selected.id); if (!nodeVisible(n)) { clearSelection(); return; }
   proxy.position.set(n.x, roomY(n), n.z); if (enabled) transform.attach(proxy);
  } else if (selected?.kind === 'edge') {
   const original = edge(selected.id); if (!original || !edgeVisible(selected.id)) { clearSelection(); return; }
   const a = nodeMap.get(original.fromId), b = nodeMap.get(original.toId);
   working = {...clone(original), route: original.route?.stairSections?.length || original.route?.shape === 'manual' ? clone(original.route) : editableRouteFromPath(original, pathFor(original).points, a, b, roomY(a), roomY(b))};
   drawPreview(); buildMarkers();
  } else if (selected?.kind === 'platform') {
   const link = platform(selected.id); if (!link || !platformVisible(selected.id)) { clearSelection(); return; }
   working = platformDraft(link); drawPreview(); buildMarkers();
  }
  notify();
 }
 function setEnabled(value) { if (!value) clearSelection(); enabled = value; transform.enabled = value && selected?.kind === 'room'; if (!value) transform.detach(); refresh(); notify(); }
 function moveFloor(delta) {
  if (!enabled || selected?.kind !== 'room') return false;
  cancel(); const n = nodeMap.get(selected.id), floors = env.floors(), next = floors[floors.indexOf(n.floor) + delta]; if (next === undefined) return false;
  try { const changed = editor.updateRoom(n.id, {floor: next}); if (changed) env.afterEdit(`${n.id} 已移到 ${floorName(next)}`); refresh(); return changed; } catch (error) { status(error.message, true); return false; }
 }
 function history(method) {
  cancel();
  try { const changed = editor[method](); if (changed) env.afterEdit(method === 'undo' ? '已復原 3D 編輯' : '已重做 3D 編輯'); refresh(); return changed; }
  catch (error) { status(error.message, true); return false; }
 }
 transform.addEventListener('mouseDown', () => {
  if (!enabled || selected?.kind !== 'room' || cancelling) return;
  const n = nodeMap.get(selected.id); gizmoGesture = {before: roomBefore(n), stamp: stamp(), orbit: env.controls().enabled, patch: null}; env.controls().enabled = false; notify();
 });
 transform.addEventListener('objectChange', () => { if (!cancelling && gizmoGesture) { if (gizmoGesture.stamp !== stamp()) { cancel(); refresh(); return; } gizmoGesture.patch = previewRoom(gizmoGesture.before, proxy.position); } });
 transform.addEventListener('mouseUp', () => {
  if (!gizmoGesture || cancelling) return;
  if (gizmoGesture.stamp !== stamp()) { cancel(); refresh(); return; }
  const g = gizmoGesture; gizmoGesture = null; gizmoOwner = null; env.controls().enabled = g.orbit;
  try { if (g.patch) commitRoom(g.before, g.patch); else resetRoomPreview(g.before.id); } catch (error) { resetRoomPreview(g.before.id); status(error.message, true); }
  refresh(); notify();
 });
 transform.addEventListener('dragging-changed', () => { if (!cancelling) notify(); });
 host.addEventListener('pointerdown', pointerDown, true); host.addEventListener('pointermove', pointerMove, true);
 host.addEventListener('pointerup', event => pointerUp(event), true); host.addEventListener('pointercancel', event => pointerUp(event, true), true);
 host.addEventListener('lostpointercapture', event => { if (gesture?.pointer === event.pointerId || gizmoGesture && (gizmoOwner === null || gizmoOwner === event.pointerId)) { cancel(); refresh(); } }, true);
 window.addEventListener('blur', () => { if (enabled) { cancel(); refresh(); } });
 window.addEventListener('keydown', event => {
  if (!enabled || event.defaultPrevented || document.querySelector('dialog[open]')) return;
  if (event.key === 'Escape') { event.preventDefault(); cancel(); refresh(); }
  else if (selected && !['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target?.tagName) && (event.ctrlKey || event.metaKey) && ['z', 'y'].includes(event.key.toLowerCase())) {
   event.preventDefault(); event.stopImmediatePropagation(); history(event.key.toLowerCase() === 'y' || event.shiftKey ? 'redo' : 'undo');
  }
 }, true);
 function update() {
  if (!enabled) return; transform.camera = env.camera(); const rect = host.getBoundingClientRect();
  if (selected?.kind === 'room' && !nodeVisible(nodeMap.get(selected.id))) { clearSelection(); return; }
  if (selected?.kind === 'edge' && !edgeVisible(selected.id)) { clearSelection(); return; }
  if (selected?.kind === 'platform' && !platformVisible(selected.id)) { clearSelection(); return; }
  if (working && previewBounds !== JSON.stringify(env.routeBounds?.() ?? null)) { drawPreview(); buildMarkers(); }
  for (const m of markers) { const point = new THREE.Vector3(...m.point).project(env.camera()); m.el.hidden = !pointVisible(m.point) || Math.abs(point.x) > 1.05 || Math.abs(point.y) > 1.05 || point.z < -1 || point.z > 1; m.el.style.left = `${(point.x * .5 + .5) * rect.width}px`; m.el.style.top = `${(-point.y * .5 + .5) * rect.height}px`; }
 }
 return {setEnabled, refresh, update, clearSelection, cancel, moveFloor, selectRoom,
  get enabled() { return enabled; }, get selected() { return selected; }, get dragging() { return !!(gesture || gizmoGesture || transform.dragging); },
  get gizmoActive() { return enabled && selected?.kind === 'room' && !!(transform.axis || transform.dragging || gizmoGesture); }};
}
