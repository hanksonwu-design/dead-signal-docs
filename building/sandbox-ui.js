import {createRoute, inferPortal, makeRoutePoints, portalPosition, routeWarnings} from './sandbox-routes.js';

const copy = value => JSON.parse(JSON.stringify(value));
const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

// Drafts remain separate from editor history until Apply (or a drag release).
// The model owns projection, picking and preview geometry; this module owns DOM.
export function createSandboxUI({data, nodeMap, editor, pathFor, roomY, floorHeight, afterEdit,
  setMode = () => {}, onPreview = () => {}, onInteraction = () => {}, status = () => {}}) {
  const $ = id => document.getElementById(id);
  let selectedId = null, draft = null, mode = 'room', interaction = null, firstPort = null;
  let initialized = false;
  const currentEdge = id => data.edges.find(edge => edge.id === id);
  function message(text, error = false) {
    $('route-status').textContent = text;
    $('route-status').classList.toggle('error', error);
  }
  function interact(next) {
    interaction = next;
    if (next !== 'ports') firstPort = null;
    $('route-connect').setAttribute('aria-pressed', String(next === 'ports'));
    $('route-edit-points').setAttribute('aria-pressed', String(next === 'points'));
    onInteraction(next);
  }
  function preview() {
    if (draft) {
      const a = nodeMap.get(draft.fromId), b = nodeMap.get(draft.toId);
      const points = makeRoutePoints(a, b, roomY(a), roomY(b), draft.route, floorHeight);
      $('route-warning').textContent = routeWarnings(points, a, b, roomY(a), roomY(b),
        data.nodes, id => roomY(nodeMap.get(id)), draft.route.width).join(' ');
    } else $('route-warning').textContent = '';
    onPreview(mode === 'route' ? draft : null);
  }
  function roomOptions(select, value) {
    select.replaceChildren(...[...data.nodes,...[...nodeMap.values()].filter(node=>node.terminal&&node.id===value)].map(node => {
      const option = document.createElement('option');
      option.value = node.id; option.textContent = `${node.id} · ${node.name}`;
      return option;
    }));
    if (nodeMap.has(value)) select.value = value;
  }
  function syncPicker() {
    $('edge-count').textContent = data.edges.filter(edge=>!nodeMap.get(edge.fromId).terminal&&!nodeMap.get(edge.toId).terminal).length + (data.platformLinks?.length || 0);
    const options = data.edges.map(edge => {
      const option = document.createElement('option');
      option.value = edge.id;
      option.textContent = `${edge.fromId} ${edge.back ? '↔' : '→'} ${edge.toId}${editor.edgeChanged(edge.id) ? ' · 自訂' : ''}`;
      return option;
    });
    if (draft && !currentEdge(draft.id)) {
      const option = document.createElement('option');
      option.value = draft.id; option.textContent = `${draft.fromId} → ${draft.toId} · 新通路草稿`;
      options.push(option);
    }
    if (!options.length) {
      const option = document.createElement('option');
      option.value = ''; option.textContent = '尚無通路，請新增'; options.push(option);
    }
    $('route-picker').replaceChildren(...options);
    $('route-picker').value = selectedId || '';
    $('route-delete').disabled = !draft;
    $('route-edit-points').disabled = !draft || !!draft.route.stairSections;
    $('route-add-point').disabled = !draft || !!draft.route.stairSections || draft.route.points.length >= 256;
    $('route-apply').disabled = !draft;
  }
  function fillForm() {
    roomOptions($('route-from-room'), draft?.fromId);
    roomOptions($('route-to-room'), draft?.toId);
    if (draft) {
      const r = draft.route;
      $('route-from-side').value = r.from.side; $('route-to-side').value = r.to.side;
      $('route-from-u').value = (r.from.u + 1) * 50;
      $('route-to-u').value = (r.to.u + 1) * 50;
      $('route-type').value = r.mode; $('route-shape').value = r.shape;
      $('route-width').value = r.width; $('route-direction').value = draft.back ? 'both' : 'forward';
    }
    syncPicker(); renderPoints();
  }
  function draftFromEdge(edge) {
    if (edge.route) return copy(edge);
    const a = nodeMap.get(edge.fromId), b = nodeMap.get(edge.toId);
    const ha = roomY(a), hb = roomY(b), path = pathFor(edge).points;
    const lengths = [0];
    for (let i = 1; i < path.length; i++) lengths.push(lengths.at(-1) + Math.hypot(...path[i].map((v, k) => v - path[i - 1][k])));
    const points = path.slice(1, -1).map((p, i) => {
      const t = Math.abs(hb - ha) > 1e-7 ? clamp((p[1] - ha - .3) / (hb - ha), 0, 1)
        : lengths.at(-1) ? lengths[i + 1] / lengths.at(-1) : .5;
      return {x: p[0], z: p[2], t, dy: p[1] - ha - (hb - ha) * t - .3};
    });
    return {...copy(edge), route: {mode: 'auto', shape: 'manual', width: 1.6,
      from: inferPortal(a, path[0]), to: inferPortal(b, path.at(-1)), points}};
  }
  function refresh() {
    const edge = currentEdge(selectedId) || data.edges[0];
    selectedId = edge?.id || null; draft = edge ? draftFromEdge(edge) : null;
    firstPort = null;
    fillForm(); preview();
  }
  function selectEdge(id) {
    const edge = currentEdge(id);
    if (!edge) return false;
    selectedId = id; draft = draftFromEdge(edge); interact(null);
    fillForm(); preview();
    message(draft.route.stairSections?'此樓梯已逐層設定；收起進階設定後，可拖動各層梯段。':'調整欄位可預覽；按「套用通路」保存，拖曳節點放開即套用。');
    return true;
  }
  function setTab(tab) {
    mode = tab === 'route' ? 'route' : 'room';
    $('room-edit-tools').hidden = mode !== 'room'; $('route-edit-tools').hidden = mode !== 'route';
    $('edit-room-tab').setAttribute('aria-pressed', String(mode === 'room'));
    $('edit-route-tab').setAttribute('aria-pressed', String(mode === 'route'));
    interact(null); setMode(mode); preview();
  }
  function nextId() {
    let index = 1;
    while (currentEdge(`custom-${index}`) || data.platformLinks?.some(link => link.id === `custom-${index}`)) index++;
    return `custom-${index}`;
  }
  function newDraft(fromId, toId, from, to) {
    const a = nodeMap.get(fromId), b = nodeMap.get(toId);
    if (!a || !b || a.id === b.id) throw new Error('請選擇兩個不同房間作為通路端點。');
    selectedId = nextId();
    draft = {id: selectedId, fromId, toId, kind: '自訂', back: true,
      gate: '沙盒自訂通路，門禁待定。', motion: '自訂直角走道／樓梯。', returnRule: '依自訂通行方向。', source: '沙盒自訂配置',
      route: createRoute(a, b, roomY(a), roomY(b), {from, to, shape: 'straight', mode: 'auto', width: 1.6})};
    fillForm(); preview();
    message('新通路草稿已建立；按「套用通路」加入目前配置。');
  }
  function readForm() {
    if (!draft || !$('route-form').checkValidity()) return false;
    const fromId = $('route-from-room').value, toId = $('route-to-room').value;
    if (fromId === toId) throw new Error('起點與終點必須是不同房間。');
    const a = nodeMap.get(fromId), b = nodeMap.get(toId);
    const options = {mode: $('route-type').value, shape: $('route-shape').value,
      width: Number($('route-width').value),
      from: {side: $('route-from-side').value, u: Number($('route-from-u').value) / 50 - 1},
      to: {side: $('route-to-side').value, u: Number($('route-to-u').value) / 50 - 1}};
    const route = options.shape === 'manual' ? {...options, points: copy(draft.route.points),...(draft.route.stairSections&&options.mode!=='ramp'?{stairSections:copy(draft.route.stairSections)}:{})}
      : createRoute(a, b, roomY(a), roomY(b), options);
    draft = {...draft, fromId, toId, back: $('route-direction').value === 'both', route};
    syncPicker();
    return true;
  }
  function commit() {
    if (!draft || !$('route-form').reportValidity()) return false;
    try {
      if (!readForm()) return false;
      const edge = copy(draft);
      const existing = currentEdge(edge.id);
      if (!existing || existing.fromId !== edge.fromId || existing.toId !== edge.toId) {
        Object.assign(edge, {kind: '自訂', gate: '沙盒自訂通路，門禁待定。',
          motion: '自訂直角走道／樓梯。', returnRule: '依自訂通行方向。', source: '沙盒自訂配置'});
      }
      const {id, ...patch} = edge;
      const changed = existing ? editor.updateEdge(id, patch) : editor.addEdge(edge);
      if (changed) { afterEdit(`${edge.fromId} → ${edge.toId} 通路已套用`); message('通路已套用，可用「復原」撤回。'); }
      else message('通路沒有變更。');
      return changed;
    } catch (error) { message(error.message, true); status(error.message, true); return false; }
  }
  function pickPort(roomId, side, u = 0) {
    if (interaction !== 'ports' || !nodeMap.has(roomId) || !['north', 'south', 'east', 'west'].includes(side) || !Number.isFinite(u)) return false;
    const port = {roomId, side, u: clamp(u, -1, 1)};
    if (!firstPort) { firstPort = port; message(`已選起點 ${roomId}，請點另一個房間的牆面路口。`); return true; }
    if (firstPort.roomId === roomId) { message('終點需要在另一個房間。', true); return false; }
    const start = firstPort; interact(null);
    newDraft(start.roomId, roomId, {side: start.side, u: start.u}, {side, u: port.u});
    return true;
  }
  function manual() { draft.route.shape = 'manual'; $('route-shape').value = 'manual'; }
  function setWaypoint(index, {x, z}) {
    const point = draft?.route.points[index];
    if (!point || !Number.isFinite(x) || !Number.isFinite(z)) return false;
    point.x = clamp(Math.round(x * 2) / 2, -150, 150);
    point.z = clamp(Math.round(z * 2) / 2, -150, 150);
    manual(); renderPoints(); preview(); return true;
  }
  function renderPoints() {
    const list = $('route-point-list'); list.replaceChildren();
    for (const [index, point] of (draft?.route.points || []).entries()) {
      const row = document.createElement('div'); row.dataset.index = index;
      const title = document.createElement('span'); title.textContent = `折點 ${index + 1}`; title.style.gridColumn = '1 / -1'; row.append(title);
      for (const [key, text, min, max] of [['x', 'X', -150, 150], ['z', 'Z', -150, 150], ['t', '高度％', 0, 100], ['dy', '高差', -20, 20]]) {
        const label = document.createElement('label'); label.textContent = text;
        const input = document.createElement('input'); input.type = 'number'; input.min = min; input.max = max; input.step = 'any'; input.required = true;
        input.setAttribute('aria-label', `折點 ${index + 1} ${text}`);
        input.value = Number((point[key] * (key === 't' ? 100 : 1)).toFixed(4));
        input.onchange = () => {
          if (!input.reportValidity()) return;
          draft.route.points[index][key] = Number(input.value) / (key === 't' ? 100 : 1);
          manual(); preview(); message('折點已更新預覽；按「套用通路」保存。');
        };
        label.append(input); row.append(label);
      }
      const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = '刪除此折點';
      remove.onclick = () => { draft.route.points.splice(index, 1); manual(); renderPoints(); preview(); };
      row.append(remove); list.append(row);
    }
    $('route-add-point').disabled = !draft || !!draft.route.stairSections || draft.route.points.length >= 256;
  }
  function addPoint() {
    if (!draft || draft.route.stairSections || draft.route.points.length >= 256) return;
    const r = draft.route, a = nodeMap.get(draft.fromId), b = nodeMap.get(draft.toId);
    const start = portalPosition(a, r.from, roomY(a), r.width), end = portalPosition(b, r.to, roomY(b), r.width);
    const knots = [{x: start[0], z: start[2], t: 0, dy: 0}, ...r.points, {x: end[0], z: end[2], t: 1, dy: 0}];
    let index = 0, longest = -1;
    for (let i = 0; i < knots.length - 1; i++) {
      const p = knots[i], q = knots[i + 1], length = Math.hypot(q.x - p.x, q.z - p.z, (q.t - p.t) * (roomY(b) - roomY(a)) + q.dy - p.dy);
      if (length > longest) { longest = length; index = i; }
    }
    const p = knots[index], q = knots[index + 1];
    r.points.splice(index, 0, {x: (p.x + q.x) / 2, z: (p.z + q.z) / 2, t: (p.t + q.t) / 2, dy: (p.dy + q.dy) / 2});
    manual(); renderPoints(); preview(); message('已在最長梯段插入折點；可拖曳位置或編輯數值。');
  }
  function init() {
    if (initialized) return; initialized = true;
    $('edit-room-tab').onclick = () => setTab('room'); $('edit-route-tab').onclick = () => setTab('route');
    $('route-picker').onchange = () => selectEdge($('route-picker').value);
    $('route-form').onsubmit = event => { event.preventDefault(); commit(); };
    $('route-form').onchange = () => {
      try { if (readForm()) { renderPoints(); preview(); message('預覽已更新；按「套用通路」保存。'); } }
      catch (error) { message(error.message, true); }
    };
    $('route-new').onclick = () => {
      interact(null);
      const fromId = $('route-from-room').value || data.nodes[0].id;
      const toId = $('route-to-room').value !== fromId ? $('route-to-room').value : data.nodes.find(n => n.id !== fromId)?.id;
      try { newDraft(fromId, toId); } catch (error) { message(error.message, true); }
    };
    $('route-connect').onclick = () => { interact(interaction === 'ports' ? null : 'ports'); firstPort = null; message(interaction === 'ports' ? '請依序點選起點與終點房間的牆面路口。' : '已結束路口連接。'); };
    $('route-edit-points').onclick = () => { interact(interaction === 'points' ? null : 'points'); preview(); message(interaction === 'points' ? '拖曳金色節點，放開即套用；也可以插入折點。' : '已結束節點拖曳。'); };
    $('route-add-point').onclick = addPoint;
    $('route-delete').onclick = () => {
      if (!draft) return;
      interact(null);
      try {
        if (currentEdge(draft.id)) { editor.removeEdge(draft.id); afterEdit('通路已刪除，可按復原恢復'); message('通路已刪除，可按「復原」恢復。'); }
        else { refresh(); message('已取消新通路草稿。'); }
      } catch (error) { message(error.message, true); }
    };
    refresh();
  }
  return {get selectedId() { return selectedId; }, get draft() { return draft; }, get mode() { return mode; }, get interaction() { return interaction; },
    refresh, selectEdge, setTab, pickPort, setWaypoint, renderPoints, commit, init};
}
