import {toFloorStairs, reconcileFloorStairs, getFloorSectionPoints, translateFloorSection} from './floor-stairs.js';
import {stairBodyFromPath, translateStairBody} from './mouse-routes.js';
import {makeRoutePoints} from './sandbox-routes.js';
import {clipRouteToHeight} from './floor-route-view.js';

const clone = value => JSON.parse(JSON.stringify(value));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const snap = value => Math.round(value * 2) / 2;
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const floorName = floor => floor < 0 ? `B${-floor}` : `${floor}F`;
const floors = [-3, -2, -1, ...Array.from({length: 43}, (_, i) => i + 1)];
const mix = (a, b, t) => a.map((value, axis) => value + (b[axis] - value) * t);

// Flights and short landings are pickable. A long horizontal room approach
// must not turn an ordinary camera gesture into a staircase drag.
function bodySpans(points, width) {
  const slopes = points.slice(1).map((point, i) => Math.abs(point[1] - points[i][1]) > .05);
  const first = slopes.indexOf(true), last = slopes.lastIndexOf(true), spans = [];
  if (first < 0) return spans;
  for (let i = first; i <= last; i++) {
    const a = points[i], b = points[i + 1], length = Math.hypot(...b.map((value, axis) => value - a[axis]));
    if (slopes[i] || length <= Math.max(4, width * 3)) spans.push([a, b]);
    else {
      if (slopes[i - 1]) spans.push([a, mix(a, b, Math.min(.5, width / length))]);
      if (slopes[i + 1]) spans.push([mix(a, b, Math.max(.5, 1 - width / length)), b]);
    }
  }
  return spans;
}

function distanceToPath(point, path) {
  let nearest = Infinity;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], direction = path[i].map((value, axis) => value - a[axis]);
    const length = direction.reduce((sum, value) => sum + value * value, 0);
    const t = length ? clamp(direction.reduce((sum, value, axis) => sum + value * (point[axis] - a[axis]), 0) / length, 0, 1) : 0;
    nearest = Math.min(nearest, Math.hypot(...point.map((value, axis) => value - a[axis] - direction[axis] * t)));
  }
  return nearest;
}

// Assign pieces of the real visible path to the closest floor interval. A
// compressed floor with an offset may overlap another height interval; this
// never manufactures a virtual flight for picking or for selection display.
function assignSpans(stages, spans) {
  for (const [a, b] of spans) {
    const delta = b[1] - a[1], cuts = [0, 1];
    if (Math.abs(delta) > 1e-8) for (const stage of stages) for (const y of stage.bounds) {
      const t = (y - a[1]) / delta; if (t > 0 && t < 1) cuts.push(t);
    }
    const sorted = [...new Set(cuts)].sort((a, b) => a - b);
    for (let i = 1; i < sorted.length; i++) {
      const start = mix(a, b, sorted[i - 1]), end = mix(a, b, sorted[i]);
      const y = (start[1] + end[1]) / 2;
      const stage = stages.reduce((best, candidate) => {
        const score = value => Math.max(value.bounds[0] - y, 0, y - value.bounds[1]) * 1000 + Math.abs(y - (value.bounds[0] + value.bounds[1]) / 2);
        return !best || score(candidate) < score(best) ? candidate : best;
      }, null);
      stage?.spans.push([start, end]);
    }
  }
}

/** Direct staircase manipulation in the caller's existing 3D camera. Captured
 * pointers and preview geometry are transient; release writes one store edit. */
export function createStairDrag3D(env) {
  const {THREE, host, scene, data, nodeMap, editor, roomY, pathFor, floorHeight, drawRoute} = env;
  let enabled = false, gesture = null, selected = null, stages = [], overlay = null, label = null;
  let savedCursor = '', hovering = false, hoverStage = null;
  const notify = () => env.onChange?.();
  const stamp = () => JSON.stringify([editor.snapshot(), [...nodeMap.values()].map(n => [n.id, n.x, n.z, n.floor, roomY(n)]), floors.map(floorHeight)]);
  const edgeFor = id => data.edges.find(edge => edge.id === id);
  const visible = stage => Boolean(stage && (!env.visible || env.visible(edgeFor(stage.edgeId), stage)));
  const identity = stage => ({edgeId: stage.edgeId, index: stage.index, fromFloor: stage.fromFloor, toFloor: stage.toFloor, local: stage.local});
  const selectedStage = () => selected && stages.find(stage => stage.edgeId === selected.edgeId && stage.fromFloor === selected.fromFloor && stage.toFloor === selected.toFloor && stage.local === selected.local);
  const caption = stage => stage.local ? `${floorName(stage.fromFloor)} 局部階梯` : `${floorName(stage.fromFloor)} → ${floorName(stage.toFloor)}`;
  const clippedSpans = (stage, spans = stage.spans) => spans.flatMap(span => clipRouteToHeight(span, ...stage.bounds));

  function collect() {
    const result = [];
    for (const edge of data.edges) {
      const a = nodeMap.get(edge.fromId), b = nodeMap.get(edge.toId);
      if (!a || !b || edge.route?.mode === 'ramp') continue;
      try {
        const ha = roomY(a), hb = roomY(b), original = pathFor(edge).points;
        if (a.floor === b.floor) {
          const body = stairBodyFromPath(edge, original, a, b, ha, hb);
          if (!body) continue;
          const points = body.route.points.map(p => [p.x, ha + (hb - ha) * p.t + .3 + p.dy, p.z]);
          const spans = bodySpans(points, body.route.width);
          if (spans.length) result.push({edgeId: edge.id, index: 0, fromFloor: a.floor, toFloor: b.floor, local: true,
            route: body.route, body, points, spans, width: body.route.width, ha, hb,
            bounds: [Math.min(...points.map(p => p[1])), Math.max(...points.map(p => p[1]))]});
          continue;
        }
        const route = edge.route?.stairSections ? reconcileFloorStairs(edge.route, a, b, ha, hb, floorHeight)
          : toFloorStairs(edge, original, a, b, ha, hb, floorHeight);
        if (!route?.stairSections) continue;
        const converted = route.stairSections.map((section, index) => {
          const points = getFloorSectionPoints(route, index, ha, hb, floorHeight);
          const start = points[0][1], end = points.at(-1)[1];
          return {edgeId: edge.id, index, fromFloor: section.fromFloor, toFloor: section.toFloor,
            local: false, route, points, spans: [], width: route.width, ha, hb,
            bounds: [Math.min(start, end), Math.max(start, end)]};
        });
        const unsafeConversion = !edge.route?.stairSections && converted.some(stage => bodySpans(stage.points, route.width)
          .some(([a, b]) => [.25, .5, .75].some(t => distanceToPath(mix(a, b, t), original) > .2)));
        assignSpans(converted, bodySpans(original, route.width));
        for (const stage of converted) if (stage.spans.length) result.push({...stage, unsafeConversion});
      } catch { /* A stale or removed edge must not disable other staircases. */ }
    }
    return result;
  }
  function project(point, rect) {
    const v = new THREE.Vector3(...point).project(env.camera());
    if (![v.x, v.y, v.z].every(Number.isFinite) || v.z < -1 || v.z > 1) return null;
    return {x: rect.left + (v.x + 1) * rect.width / 2, y: rect.top + (1 - v.y) * rect.height / 2, depth: v.z};
  }
  function hit(event) {
    const rect = host.getBoundingClientRect();
    if (!rect.width || !rect.height || !env.camera()) return null;
    env.camera().updateMatrixWorld?.();
    let best = null;
    for (const stage of stages) {
      if (!visible(stage)) continue;
      for (const [a, b] of clippedSpans(stage)) {
      const pa = project(a, rect), pb = project(b, rect);
      if (!pa || !pb) continue;
      const dx = pb.x - pa.x, dy = pb.y - pa.y, length = dx * dx + dy * dy;
      const t = length > 1e-8 ? clamp(((event.clientX - pa.x) * dx + (event.clientY - pa.y) * dy) / length, 0, 1) : 0;
      const distance = Math.hypot(event.clientX - pa.x - dx * t, event.clientY - pa.y - dy * t);
      const point = mix(a, b, t), offset = project([point[0] + stage.width / 2, point[1], point[2]], rect);
      const at = project(point, rect), bodyWidth = offset && at ? Math.hypot(offset.x - at.x, offset.y - at.y) : 0;
      const tolerance = clamp(bodyWidth + 7, 11, 24), depth = pa.depth + (pb.depth - pa.depth) * t;
      if (distance > tolerance) continue;
      if (env.occluded?.(event, point)) continue;
      if (!best || distance < best.distance - 1.5 || Math.abs(distance - best.distance) <= 1.5 && depth < best.depth) {
        best = {stage, point, distance, depth};
      }
      }
    }
    return best;
  }
  function world(event, y) {
    const rect = host.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1), env.camera());
    return ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -y), new THREE.Vector3());
  }
  function cleanup() {
    if (overlay) {
      scene.remove(overlay);
      const geometries = new Set(), materials = new Set();
      overlay.traverse(object => {
        if (object.geometry) geometries.add(object.geometry);
        for (const material of object.material ? (Array.isArray(object.material) ? object.material : [object.material]) : []) materials.add(material);
      });
      geometries.forEach(geometry => geometry.dispose()); materials.forEach(material => material.dispose());
      overlay = null;
    }
    label?.remove(); label = null;
  }
  function currentPoints(stage, route) {
    return stage.local ? route.points.map(p => [p.x, stage.ha + (stage.hb - stage.ha) * p.t + .3 + p.dy, p.z])
      : getFloorSectionPoints(route, stage.index, stage.ha, stage.hb, floorHeight);
  }
  function drawOverlay() {
    cleanup();
    const stage = gesture?.stage || hoverStage || selectedStage();
    if (!enabled || !visible(stage)) return;
    const edge = edgeFor(stage.edgeId); if (!edge) return;
    const route = gesture?.preview || stage.route;
    overlay = new THREE.Group(); overlay.name = 'stair-drag-3d-preview'; scene.add(overlay);
    const draft = {...edge, route};
    if (gesture?.moved) {
      // Reuse the final renderer, including fixed doorway leads and floor
      // joins. Clipping changes visibility only, never preview geometry.
      const full = makeRoutePoints(nodeMap.get(edge.fromId), nodeMap.get(edge.toId), stage.ha, stage.hb, route, floorHeight);
      for (const path of clipRouteToHeight(full, ...stage.bounds)) drawRoute(draft, path, overlay, true);
    } else for (const span of clippedSpans(stage)) drawRoute(draft, span, overlay, true);
    overlay.traverse(object => {
      object.renderOrder = 30;
      for (const material of object.material ? (Array.isArray(object.material) ? object.material : [object.material]) : []) {
        material.depthWrite = false; material.depthTest = false;
      }
    });
    label = document.createElement('div'); label.className = `stair-3d-label${gesture ? ' active' : ''}`;
    label.style.position = 'absolute'; label.style.pointerEvents = 'none'; label.style.transform = 'translate(-50%, -120%)';
    label.textContent = `${caption(stage)} · ${gesture?.moved ? '放開保存 · Esc 取消' : '拖曳樓梯'}`;
    label.dataset.edge = stage.edgeId; host.append(label); update();
  }
  function setCursor(value) { host.style.cursor = value; }
  function release() {
    const done = gesture; gesture = null;
    if (!done) return null;
    done.controls.enabled = done.controlsEnabled;
    try { if (host.hasPointerCapture(done.pointerId)) host.releasePointerCapture(done.pointerId); } catch { /* Browser may already have released it. */ }
    setCursor(hovering ? 'grab' : savedCursor);
    return done;
  }
  function cancel(message = '') {
    const hadGesture = Boolean(gesture); release();
    if (hadGesture) { if (message) env.status?.(message); drawOverlay(); notify(); }
  }
  function clearSelection() {
    release(); selected = null; hovering = false; hoverStage = null; cleanup(); setCursor(savedCursor); notify();
  }
  function refresh() {
    if (!enabled) return;
    if (gesture) {
      if (gesture.stamp === stamp()) return;
      release(); env.status?.('資料已更新，未完成的樓梯拖曳已取消。');
    }
    stages = collect(); hoverStage = null;
    const stage = selectedStage(); selected = visible(stage) ? identity(stage) : null;
    drawOverlay(); notify();
  }
  function update() {
    if (!enabled || !label) return;
    const stage = gesture?.stage || hoverStage || selectedStage();
    if (!visible(stage)) { label.hidden = true; if (overlay) overlay.visible = false; return; }
    if (overlay) overlay.visible = true;
    const route = gesture?.preview || stage.route, points = currentPoints(stage, route);
    const spans = clippedSpans(stage, gesture?.moved ? bodySpans(points, route.width) : stage.spans);
    const span = spans[Math.floor(spans.length / 2)];
    const center = span ? mix(span[0], span[1], .5) : points[0], rect = host.getBoundingClientRect(), p = project(center, rect);
    label.hidden = !p || p.x < rect.left || p.x > rect.left + rect.width || p.y < rect.top || p.y > rect.top + rect.height;
    if (p) { label.style.left = `${p.x - rect.left}px`; label.style.top = `${p.y - rect.top}px`; }
  }
  function stop(event) { event.preventDefault(); event.stopImmediatePropagation(); }
  function commitHistory(method) {
    if (!enabled) return false;
    cancel();
    try {
      const changed = editor[method]();
      if (changed) { refresh(); env.afterEdit(method === 'undo' ? '已復原 3D 編輯' : '已重做 3D 編輯'); }
      return changed;
    } catch (error) { env.status?.(error.message, true); return false; }
  }
  host.addEventListener('pointerdown', event => {
    if (!enabled || gesture || event.button !== 0 || env.blocked?.()) return;
    if (event.target.closest?.('button,input,select,textarea,a')) return;
    const found = hit(event); if (!found) return;
    if (found.stage.unsafeConversion) {
      stop(event); env.onSelect?.(); selected = identity(found.stage); hoverStage = null;
      env.status?.('壓縮樓層與房間高差重疊，請先把「樓層高度」切為「等距樓層」再移動此段樓梯。', true);
      drawOverlay(); notify(); return;
    }
    const start = world(event, found.point[1]); if (!start) return;
    stop(event); env.onSelect?.();
    const controls = env.controls();
    selected = identity(found.stage); hoverStage = null;
    gesture = {pointerId: event.pointerId, stage: found.stage, start, y: found.point[1], route: clone(found.stage.route),
      stamp: stamp(), controls, controlsEnabled: controls.enabled, clientX: event.clientX, clientY: event.clientY, moved: false, dx: 0, dz: 0, preview: null};
    controls.enabled = false; hovering = true; setCursor('grabbing'); host.setPointerCapture(event.pointerId);
    env.status?.(`${caption(found.stage)}：拖曳移動，放開保存；Esc 取消。`);
    drawOverlay(); notify();
  }, true);
  host.addEventListener('pointermove', event => {
    if (!enabled) return;
    if (!gesture) {
      const found = env.blocked?.() || event.buttons || event.target.closest?.('button,input,select,textarea,a') ? null : hit(event);
      hovering = Boolean(found); setCursor(hovering ? 'grab' : savedCursor);
      const next = found?.stage || null;
      if (hoverStage !== next) { hoverStage = next; drawOverlay(); }
      return;
    }
    if (event.pointerId !== gesture.pointerId) return;
    stop(event);
    if (gesture.stamp !== stamp()) { cancel('資料已更新，未完成的樓梯拖曳已取消。'); refresh(); return; }
    if (Math.hypot(event.clientX - gesture.clientX, event.clientY - gesture.clientY) < 3 && !gesture.moved) return;
    const current = world(event, gesture.y); if (!current) return;
    const dx = snap(current.x - gesture.start.x), dz = snap(current.z - gesture.start.z);
    if (dx === gesture.dx && dz === gesture.dz) return;
    gesture.dx = dx; gesture.dz = dz; gesture.moved = true;
    try {
      gesture.preview = gesture.stage.local
        ? translateStairBody({...gesture.stage.body, route: gesture.route}, dx, dz).route
        : translateFloorSection(gesture.route, gesture.stage.index, dx, dz);
      drawOverlay(); notify();
    } catch (error) { cancel(); env.status?.(error.message, true); }
  }, true);
  host.addEventListener('pointerup', event => {
    if (!gesture || event.pointerId !== gesture.pointerId) return;
    stop(event); const done = release();
    if (done.stamp !== stamp()) { env.status?.('資料已更新，未完成的樓梯拖曳已取消。'); refresh(); return; }
    try {
      if (done.moved && done.preview && !same(done.route, done.preview)) {
        if (editor.updateEdge(done.stage.edgeId, {route: done.preview})) {
          refresh(); env.afterEdit(`${caption(done.stage)} 樓梯已移動`); return;
        }
      }
    } catch (error) { env.status?.(error.message, true); }
    drawOverlay(); notify();
  }, true);
  for (const type of ['pointercancel', 'lostpointercapture']) host.addEventListener(type, event => {
    if (gesture?.pointerId === event.pointerId) { if (type === 'pointercancel') stop(event); cancel('已取消樓梯拖曳'); }
  }, true);
  host.addEventListener('pointerleave', () => { if (!gesture) { hovering = false; hoverStage = null; setCursor(savedCursor); drawOverlay(); } });
  window.addEventListener('keydown', event => {
    if (!enabled || event.defaultPrevented || document.querySelector?.('dialog[open]') || ['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target?.tagName)) return;
    if (event.key === 'Escape' && gesture) { stop(event); cancel('已取消樓梯拖曳'); }
    else if (!env.blocked?.() && selected && (event.ctrlKey || event.metaKey) && ['z', 'y'].includes(event.key.toLowerCase())) {
      stop(event); commitHistory(event.key.toLowerCase() === 'y' || event.shiftKey ? 'redo' : 'undo');
    }
  }, true);
  window.addEventListener('blur', () => cancel('已取消樓梯拖曳'));
  return {
    setEnabled(value) {
      const next = Boolean(value); if (next === enabled) return;
      if (next) { savedCursor = host.style.cursor || ''; enabled = true; refresh(); }
      else { release(); enabled = false; selected = null; hovering = false; hoverStage = null; stages = []; cleanup(); setCursor(savedCursor); notify(); }
    }, refresh, update, cancel, clearSelection,
    undo: () => commitHistory('undo'), redo: () => commitHistory('redo'),
    get enabled() { return enabled; }, get dragging() { return Boolean(gesture); },
    get selected() { return selected ? {...selected} : null; },
    get selectionBounds() { const stage = gesture?.stage || selectedStage(); return stage ? [...stage.bounds] : null; }
  };
}
