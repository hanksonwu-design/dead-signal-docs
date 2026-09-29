const FORMAT = 'dead-signal-layout';
const FIELDS = ['name', 'x', 'z', 'floor', 'w', 'd', 'offset'];
const EDGE_FIELDS = ['fromId', 'toId', 'kind', 'back', 'gate', 'motion', 'returnRule', 'source', 'route'];
const BUILDING_FLOORS = [-3, -2, -1, ...Array.from({length: 43}, (_, index) => index + 1)];
const copy = value => JSON.parse(JSON.stringify(value));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// Room-only clients keep their version 1 format. Passing the shared edge array
// enables version 2, with one history for room geometry and connection edits.
export function createEditorStore(nodes, layout, offsets, edges = undefined, options = {}) {
  const editableEdges = edges !== undefined;
  if (editableEdges && !Array.isArray(edges)) throw new Error('通路清單必須是陣列。');
  const version = editableEdges ? 2 : 1;
  const sourceEdges = editableEdges ? copy(edges) : [];
  const sourceById = new Map(sourceEdges.map(edge => [edge.id, edge]));
  const byId = new Map(nodes.map(node => [node.id, node]));
  const ids = nodes.map(node => node.id);
  if (byId.size !== nodes.length || Object.keys(layout).length !== ids.length || ids.some(id => !Object.hasOwn(layout, id))) {
    throw new Error('房間清單與原始配置不一致。');
  }
  if (!options || typeof options !== 'object' || Array.isArray(options) ||
      (options.terminals !== undefined && !Array.isArray(options.terminals))) {
    throw new Error('出口接點設定必須包含有效的接點清單。');
  }
  const editablePlatformLinks = options.platformLinks !== undefined;
  if (editablePlatformLinks && (!editableEdges || !Array.isArray(options.platformLinks))) {
    throw new Error('平台連線需要啟用通路編輯，並提供平台連線陣列。');
  }
  const platformLinks = options.platformLinks;
  const terminalIds = new Set();
  const terminalFloors = new Map();
  for (const terminal of options.terminals || []) {
    const id = terminal?.id;
    if (typeof id !== 'string' || !id.trim() || id.trim() !== id || id.length > 120 || byId.has(id) || terminalIds.has(id)) {
      throw new Error('出口接點代號不可為空、重複，或與房間代號相同。');
    }
    terminalIds.add(id);
    terminalFloors.set(id, terminal.floor);
  }
  const hasTerminals = terminalIds.size > 0;
  if (hasTerminals && !editableEdges) throw new Error('出口接點需要啟用通路編輯。');
  const isTerminalEdge = edge => terminalIds.has(edge?.fromId) || terminalIds.has(edge?.toId);
  const knownEndpoint = id => byId.has(id) || terminalIds.has(id);
  const sourceTerminalEdges = sourceEdges.filter(isTerminalEdge);
  const allEdges = snapshot => [...(snapshot.edges || []), ...(snapshot.terminalRoutes || [])];
  function setEdges(snapshot, combined) {
    snapshot.edges = hasTerminals ? combined.filter(edge => !isTerminalEdge(edge)) : combined;
    if (hasTerminals) snapshot.terminalRoutes = combined.filter(isTerminalEdge);
  }
  const finite = (value, min, max, label) => {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
      throw new Error(`${label} 必須是 ${min} 到 ${max} 之間的數字。`);
    }
    return value;
  };
  function boundedString(value, max, label, {required = false} = {}) {
    if (typeof value !== 'string' || value.length > max || (required && !value.trim())) {
      throw new Error(`${label} 必須是${required ? '非空的' : ''}文字，且不超過 ${max} 個字元。`);
    }
    return required ? value.trim() : value;
  }
  function validatePortal(portal, label) {
    if (!portal || !['north', 'south', 'east', 'west'].includes(portal.side)) {
      throw new Error(`${label} 必須選擇房間的東、西、南或北側。`);
    }
    return {side: portal.side, u: finite(portal.u, -1, 1, `${label} 位置`)};
  }
  function validatePoints(points, id, min = 0) {
    if (!Array.isArray(points) || points.length < min || points.length > 256) {
      throw new Error(`${id} 必須有 ${min} 到 256 個中繼點。`);
    }
    return points.map((point, index) => {
      if (!point || typeof point !== 'object' || Array.isArray(point)) throw new Error(`${id} 中繼點 ${index + 1} 不正確。`);
      return {
        x: finite(point.x, -150, 150, `${id} 中繼點 X`),
        z: finite(point.z, -150, 150, `${id} 中繼點 Z`),
        t: finite(point.t, 0, 1, `${id} 中繼點樓層比例`),
        dy: finite(point.dy, -20, 20, `${id} 中繼點高差`)
      };
    });
  }
  function validateStairSections(sections, id) {
    if (!Array.isArray(sections) || sections.length < 1 || sections.length > 45) {
      throw new Error(`${id} 樓梯必須有 1 到 45 個逐層區段。`);
    }
    let direction = null, previousFloor = null, totalPoints = 0;
    return sections.map((section, index) => {
      if (!section || typeof section !== 'object' || Array.isArray(section)) throw new Error(`${id} 樓梯區段 ${index + 1} 不正確。`);
      const from = BUILDING_FLOORS.indexOf(section.fromFloor), to = BUILDING_FLOORS.indexOf(section.toFloor);
      if (from < 0 || to < 0 || Math.abs(to - from) !== 1) {
        throw new Error(`${id} 每個樓梯區段必須連接 B3 到 43F 之間相鄰的兩層，不使用 0 樓。`);
      }
      const step = to - from;
      if (direction !== null && (step !== direction || section.fromFloor !== previousFloor)) {
        throw new Error(`${id} 樓梯區段必須依同一上行或下行方向逐層連續銜接。`);
      }
      direction = step; previousFloor = section.toFloor;
      const points = validatePoints(section.points, `${id} 區段 ${index + 1}`, 2);
      totalPoints += points.length;
      if (totalPoints > 2048) throw new Error(`${id} 所有樓梯區段合計最多可有 2048 個中繼點。`);
      if (points[0].t !== 0 || points[0].dy !== 0 || points.at(-1).t !== 1 || points.at(-1).dy !== 0) {
        throw new Error(`${id} 區段 ${index + 1} 的起終點必須貼齊兩層平台（t 為 0／1，高差為 0）。`);
      }
      return {fromFloor: section.fromFloor, toFloor: section.toFloor, points};
    });
  }
  function validateRoute(route, id) {
    if (!route || !['auto', 'stairs', 'ramp'].includes(route.mode) ||
        !['straight', 'l', 'u', 'manual'].includes(route.shape)) {
      throw new Error(`${id} 通路型態或形狀不正確。`);
    }
    const result = {
      mode: route.mode, shape: route.shape,
      width: finite(route.width, 0.8, 6, `${id} 通路寬度`),
      from: validatePortal(route.from, `${id} 起點路口`),
      to: validatePortal(route.to, `${id} 終點路口`),
      points: validatePoints(route.points, id)
    };
    if (route.stairSections !== undefined) {
      if (!['auto', 'stairs'].includes(route.mode) || route.shape !== 'manual' || result.points.length) {
        throw new Error(`${id} 逐層樓梯須使用自訂形狀、樓梯或自動模式，且主路徑中繼點必須為空。`);
      }
      // Keep stored sections when an endpoint room moves floors. The renderer
      // reconciles the current floor span, reusing matching floor pairs. This
      // preserves edits and makes an ordinary room move one reversible step;
      // its exported snapshot must remain importable before the next stair edit.
      result.stairSections = validateStairSections(route.stairSections, id);
    }
    return result;
  }
  function validateEdges(input) {
    if (!Array.isArray(input) || input.length > 160) throw new Error('通路清單必須是陣列，最多可有 160 條。');
    const seen = new Set();
    return input.map(edge => {
      if (!edge || typeof edge !== 'object' || Array.isArray(edge)) throw new Error('通路資料不正確。');
      const id = boundedString(edge.id, 120, '通路代號', {required: true});
      if (seen.has(id)) throw new Error('通路代號不可重複。');
      seen.add(id);
      if (!knownEndpoint(edge.fromId) || !knownEndpoint(edge.toId) || edge.fromId === edge.toId) {
        throw new Error(`${id} 必須連接兩個不同的既有房間或出口接點。`);
      }
      if (edge.back !== undefined && typeof edge.back !== 'boolean') throw new Error(`${id} 雙向通行必須是布林值。`);
      const result = {
        id, fromId: edge.fromId, toId: edge.toId,
        kind: boundedString(edge.kind === undefined ? '自訂' : edge.kind, 80, `${id} 類別`, {required: true}),
        back: edge.back ?? false,
        gate: boundedString(edge.gate === undefined ? '' : edge.gate, 2000, `${id} 門禁`),
        motion: boundedString(edge.motion === undefined ? '' : edge.motion, 2000, `${id} 移動說明`),
        returnRule: boundedString(edge.returnRule === undefined ? '' : edge.returnRule, 2000, `${id} 回訪規則`)
      };
      if (edge.source !== undefined) result.source = boundedString(edge.source, 500, `${id} 來源`);
      if (edge.route == null) {
        const original = sourceById.get(id);
        if (!original || original.fromId !== edge.fromId || original.toId !== edge.toId) {
          throw new Error(`${id} 是新建或改接的通路，必須設定路口與路線。`);
        }
        result.route = null;
      } else result.route = validateRoute(edge.route, id);
      return result;
    });
  }
  function landingContext(snapshot) {
    return {edges: new Map(allEdges(snapshot).map(edge => [edge.id, edge])),
      floors: new Map([...terminalFloors, ...snapshot.rooms.map(room => [room.id, room.floor])])};
  }
  function landingExists(endpoint, context) {
    const parent = context.edges.get(endpoint.edgeId);
    if (!parent || parent.route?.mode === 'ramp' || !BUILDING_FLOORS.includes(endpoint.floor)) return false;
    const a = context.floors.get(parent.fromId), b = context.floors.get(parent.toId);
    return BUILDING_FLOORS.includes(a) && BUILDING_FLOORS.includes(b) && a !== b &&
      endpoint.floor >= Math.min(a, b) && endpoint.floor <= Math.max(a, b);
  }
  function validatePlatformLinks(input, snapshot) {
    if (!Array.isArray(input) || input.length > 160) throw new Error('平台連線必須是陣列，最多可有 160 條。');
    const context = landingContext(snapshot), seen = new Set(context.edges.keys());
    const endpoint = (value, label) => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} 資料不正確。`);
      if (value.kind === 'room') {
        if (!byId.has(value.roomId)) throw new Error(`${label} 必須選擇既有房間。`);
        return {kind: 'room', roomId: value.roomId, ...validatePortal(value, label)};
      }
      if (value.kind !== 'landing') throw new Error(`${label} 必須是房間路口或樓梯平台。`);
      const result = {kind: 'landing', edgeId: boundedString(value.edgeId, 120, `${label} 樓梯代號`, {required: true}), floor: value.floor};
      if (!landingExists(result, context)) throw new Error(`${label} 平台必須位於既有跨層通路的樓層範圍內。`);
      return result;
    };
    return input.map(link => {
      if (!link || typeof link !== 'object' || Array.isArray(link)) throw new Error('平台連線資料不正確。');
      const id = boundedString(link.id, 120, '平台連線代號', {required: true});
      if (seen.has(id)) throw new Error('平台連線代號不可重複或與通路代號相同。');
      seen.add(id);
      const from = endpoint(link.from, `${id} 起點`), to = endpoint(link.to, `${id} 終點`);
      if (from.kind !== 'landing' && to.kind !== 'landing') throw new Error(`${id} 至少需要一端連接樓梯平台。`);
      if (same(from, to)) throw new Error(`${id} 必須連接兩個不同接點。`);
      if (!Array.isArray(link.points) || link.points.length > 256) throw new Error(`${id} 平台連線最多可有 256 個中繼點。`);
      const points = link.points.map((point, index) => {
        if (!point || typeof point !== 'object' || Array.isArray(point)) throw new Error(`${id} 中繼點 ${index + 1} 不正確。`);
        return {x: finite(point.x, -150, 150, `${id} 中繼點 X`), z: finite(point.z, -150, 150, `${id} 中繼點 Z`)};
      });
      return {id, from, to, width: finite(link.width, .8, 6, `${id} 平台連線寬度`), points};
    });
  }
  function prunePlatformLinks(snapshot) {
    if (!editablePlatformLinks) return;
    const context = landingContext(snapshot);
    snapshot.platformLinks = snapshot.platformLinks.filter(link => [link.from, link.to].every(endpoint =>
      endpoint.kind !== 'landing' || landingExists(endpoint, context)));
  }
  function validate(input) {
    if (!input || input.format !== FORMAT || ![1, ...(editableEdges ? [2] : [])].includes(input.version) || !Array.isArray(input.rooms)) {
      throw new Error(`請使用版本 ${editableEdges ? '1 或 2' : '1'} 的 Dead Signal 配置 JSON。`);
    }
    if (!editablePlatformLinks && input.platformLinks !== undefined) throw new Error('此編輯器尚未啟用平台連線。');
    if (input.rooms.length !== ids.length) throw new Error(`配置必須包含全部 ${ids.length} 個房間。`);
    const rooms = new Map();
    for (const room of input.rooms) {
      if (!room || !byId.has(room.id) || rooms.has(room.id)) throw new Error('房間代號不正確或重複。');
      const id = room.id;
      if (typeof room.name !== 'string' || !room.name.trim() || room.name.trim().length > 80) {
        throw new Error(`${id} 名稱必須是 1 到 80 個字元。`);
      }
      const floor = finite(room.floor, -3, 43, `${id} 樓層`);
      if (!Number.isInteger(floor) || floor === 0) throw new Error(`${id} 樓層必須是 B3 到 43F 的整數，不能是 0。`);
      rooms.set(id, {
        id, name: room.name.trim(),
        x: finite(room.x, -100, 100, `${id} X`),
        z: finite(room.z, -100, 100, `${id} Z`), floor,
        w: finite(room.w, 3, 60, `${id} 寬度`),
        d: finite(room.d, 3, 60, `${id} 深度`),
        offset: finite(room.offset, -2, 3, `${id} 局部高差`)
      });
    }
    const result = {format: FORMAT, version, rooms: ids.map(id => rooms.get(id))};
    // A version 1 file contains no topology; migration always restores the
    // original links, rather than accidentally keeping a different edit set.
    if (editableEdges) {
      let combined;
      if (input.version === 1) combined = sourceEdges;
      else {
        if (!Array.isArray(input.edges)) throw new Error('通路清單必須是陣列。');
        if (hasTerminals) {
          // Older v2 files predate editable exits. Omission restores their
          // original exit link; an explicit empty array records its deletion.
          const terminalRoutes = input.terminalRoutes === undefined ? sourceTerminalEdges : input.terminalRoutes;
          if (!Array.isArray(terminalRoutes)) throw new Error('出口通路清單必須是陣列。');
          if (input.edges.some(isTerminalEdge) || terminalRoutes.some(edge => !isTerminalEdge(edge))) {
            throw new Error('一般通路與出口通路必須分別放入 edges 與 terminalRoutes。');
          }
          combined = [...input.edges, ...terminalRoutes];
        } else {
          if (input.terminalRoutes !== undefined) throw new Error('此編輯器未設定出口接點，無法匯入出口通路。');
          combined = input.edges;
        }
      }
      // Validate the merged set so IDs and the 160-link budget are shared.
      setEdges(result, validateEdges(combined));
    }
    if (editablePlatformLinks) result.platformLinks = validatePlatformLinks(input.platformLinks === undefined ? [] : input.platformLinks, result);
    return result;
  }
  const initial = validate({format: FORMAT, version: 1, ...(editablePlatformLinks ? {platformLinks: copy(platformLinks)} : {}), rooms: nodes.map(node => {
    const [x, z, floor, w, d] = layout[node.id];
    return {id: node.id, name: node.name, x: node.x ?? x, z: node.z ?? z,
      floor: node.floor ?? floor, w: node.w ?? w, d: node.d ?? d, offset: offsets[node.id] ?? 0};
  })});
  const originalRooms = new Map(initial.rooms.map(room => [room.id, room]));
  let current = copy(initial);
  const past = [], future = [];
  function write(next) {
    const nextEdges = editableEdges ? copy(allEdges(next)) : null;
    const nextPlatformLinks = editablePlatformLinks ? copy(next.platformLinks) : null;
    for (const room of next.rooms) {
      const node = byId.get(room.id);
      for (const field of FIELDS) if (field !== 'offset') node[field] = room[field];
      offsets[room.id] = room.offset;
    }
    if (editableEdges) edges.splice(0, edges.length, ...nextEdges);
    if (editablePlatformLinks) platformLinks.splice(0, platformLinks.length, ...nextPlatformLinks);
    current = copy(next);
  }
  function apply(input) {
    const next = validate(input); // Finish validation before touching nodes or history.
    if (same(current, next)) return false;
    past.push(copy(current));
    if (past.length > 50) past.shift();
    future.length = 0;
    write(next);
    return true;
  }
  function requireEdges() {
    if (!editableEdges) throw new Error('此編輯器尚未啟用通路編輯。');
  }
  function requirePlatformLinks() {
    if (!editablePlatformLinks) throw new Error('此編輯器尚未啟用平台連線。');
  }
  function findEdge(id) {
    requireEdges();
    const edge = allEdges(current).find(edge => edge.id === id);
    if (!edge) throw new Error('找不到通路代號。');
    return edge;
  }
  return {
    snapshot: () => copy(current), apply,
    updateRoom(id, patch) {
      if (!byId.has(id)) throw new Error('找不到房間代號。');
      if (!patch || typeof patch !== 'object' || Array.isArray(patch) || Object.keys(patch).some(key => !FIELDS.includes(key))) {
        throw new Error('只能編輯房間名稱、位置、樓層、尺寸與局部高差。');
      }
      const next = copy(current);
      Object.assign(next.rooms.find(room => room.id === id), patch);
      prunePlatformLinks(next);
      return apply(next);
    },
    updateEdge(id, patch) {
      findEdge(id);
      if (!patch || typeof patch !== 'object' || Array.isArray(patch) || Object.keys(patch).some(key => !EDGE_FIELDS.includes(key))) {
        throw new Error('只能編輯通路端點、類型、通行規則與路線。');
      }
      const next = copy(current);
      const combined = allEdges(next);
      Object.assign(combined.find(edge => edge.id === id), patch);
      setEdges(next, combined);
      prunePlatformLinks(next);
      return apply(next);
    },
    addEdge(edge) {
      requireEdges();
      const next = copy(current);
      setEdges(next, [...allEdges(next), edge]);
      return apply(next);
    },
    removeEdge(id) {
      findEdge(id);
      const next = copy(current);
      setEdges(next, allEdges(next).filter(edge => edge.id !== id));
      prunePlatformLinks(next);
      return apply(next);
    },
    addPlatformLink(link) {
      requirePlatformLinks();
      const next = copy(current);
      next.platformLinks.push(link);
      return apply(next);
    },
    updatePlatformLink(id, patch) {
      requirePlatformLinks();
      if (!current.platformLinks.some(link => link.id === id)) throw new Error('找不到平台連線代號。');
      if (!patch || typeof patch !== 'object' || Array.isArray(patch) || Object.keys(patch).some(key => !['from','to','width','points'].includes(key))) {
        throw new Error('只能編輯平台連線端點、寬度與路線。');
      }
      const next = copy(current);
      Object.assign(next.platformLinks.find(link => link.id === id), patch);
      return apply(next);
    },
    removePlatformLink(id) {
      requirePlatformLinks();
      if (!current.platformLinks.some(link => link.id === id)) throw new Error('找不到平台連線代號。');
      const next = copy(current);
      next.platformLinks = next.platformLinks.filter(link => link.id !== id);
      return apply(next);
    },
    edgeChanged(id) {
      requireEdges();
      const original = allEdges(initial).find(edge => edge.id === id);
      const edge = allEdges(current).find(edge => edge.id === id);
      if (!original && !edge) throw new Error('找不到通路代號。');
      return !same(edge, original);
    },
    undo() {
      if (!past.length) return false;
      future.push(copy(current));
      write(past.pop());
      return true;
    },
    redo() {
      if (!future.length) return false;
      past.push(copy(current));
      write(future.pop());
      return true;
    },
    reset: () => apply(initial),
    canUndo: () => past.length > 0,
    canRedo: () => future.length > 0,
    isChanged(id) {
      if (!byId.has(id)) throw new Error('找不到房間代號。');
      return !same(current.rooms.find(room => room.id === id), originalRooms.get(id));
    }
  };
}

// Preserve each portal's normalized location on its room, then distribute the
// endpoint displacement along the existing path without inventing graph edges.
export function adaptRoutePoints(points, originalA, originalB, currentA, currentB) {
  if (!Array.isArray(points) || points.some(p => !Array.isArray(p) || p.length !== 3 || !p.every(Number.isFinite))) {
    throw new Error('走道座標必須是有限數字。');
  }
  for (const room of [originalA, originalB, currentA, currentB]) {
    if (!room || !['x', 'z', 'w', 'd'].every(key => Number.isFinite(room[key])) || room.w <= 0 || room.d <= 0) {
      throw new Error('走道端點需要有效的房間位置與尺寸。');
    }
  }
  if (!points.length) return [];
  const unchanged = (a, b) => ['x', 'z', 'w', 'd'].every(key => a[key] === b[key]);
  if (unchanged(originalA, currentA) && unchanged(originalB, currentB)) return points.map(p => [...p]);
  const displacement = (p, original, current) => [
    current.x + (p[0] - original.x) * current.w / original.w - p[0],
    current.z + (p[2] - original.z) * current.d / original.d - p[2]
  ];
  const start = displacement(points[0], originalA, currentA);
  const end = displacement(points.at(-1), originalB, currentB);
  const distances = [0];
  for (let i = 1; i < points.length; i++) {
    distances.push(distances[i - 1] + Math.hypot(...points[i].map((v, j) => v - points[i - 1][j])));
  }
  const length = distances.at(-1);
  return points.map((p, i) => {
    const t = length > 0 ? distances[i] / length : points.length > 1 ? i / (points.length - 1) : 0;
    return [p[0] + start[0] * (1 - t) + end[0] * t, p[1], p[2] + start[1] * (1 - t) + end[1] * t];
  });
}
