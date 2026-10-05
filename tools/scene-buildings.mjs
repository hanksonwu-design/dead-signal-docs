import assert from 'node:assert/strict';

export function buildingLocation(label, id) {
  const codes = label.split(' → ').map(value => {
    const code = { 'A 棟': 'A', 'B 棟': 'B', '共用地基': 'BASE', '分支演出': 'ENDING', '片尾演出': 'ENDING' }[value];
    assert(code, `Unknown building: ${id}: ${label}`);
    return code;
  });
  return { label, reverseLabel: label.split(' → ').reverse().join(' → '), codes, entry: codes[0], exit: codes.at(-1) };
}

export function readSceneBuilding(spec, node) {
  const body = spec.split(`<a id="${node.spatialHeading}"></a>`)[1]?.split('<a id="node-')[0];
  const labels = [...(body || '').matchAll(/^\| 樓棟定位 \| ([^|]+) \|$/gm)];
  assert.equal(labels.length, 1, `Building row: ${node.id}`);
  return buildingLocation(labels[0][1].trim(), node.id);
}

export function readChildLocations(spec, node) {
  const body = spec.split(`<!-- scene-floor-locations:${node}:begin -->`)[1]?.split(`<!-- scene-floor-locations:${node}:end -->`)[0];
  if (!body) return new Map();
  const entries = body.split('\n').filter(line => /^\| (?:T-|[A-Z]\w*-V)/.test(line)).map(line => {
    const [id, , label, travel] = line.split('|').slice(1, -1).map(s => s.trim());
    assert(['步道', '跨棟橋', '電梯候梯', '電梯車廂', '電梯停靠'].includes(travel), `Travel kind: ${id}`);
    return [id, { building: buildingLocation(label, id), travel }];
  });
  assert.equal(new Set(entries.map(([id]) => id)).size, entries.length, `Duplicate building location: ${node}`);
  return new Map(entries);
}

export function routeBuilding(from, children, to) {
  const codes = [from.entry, ...children.flatMap(s => s.building.codes), to.exit].filter((v, i, all) => !i || v !== all[i - 1]);
  const names = { A: 'A 棟', B: 'B 棟', BASE: '共用地基', ENDING: '分支演出' };
  return buildingLocation(codes.map(c => names[c]).join(' → '), 'route');
}
