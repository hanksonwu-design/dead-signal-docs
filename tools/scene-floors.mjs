import assert from 'node:assert/strict';

export function preciseFloor(label, id) {
  const stops = label.split(' → ');
  const levels = stops.map(stop => {
    const match = stop.match(/^(B[1-3]|(?:[1-9]|[1-4][0-9]|50)F)(?: (?:上半層平台|橋下夾層|檢修蓋下夾層|水箱下夾層))?$/);
    assert(match, `Floor must be precise: ${id}: ${label}`);
    return match[1].startsWith('B') ? -Number(match[1].slice(1)) : Number(match[1].slice(0, -1));
  });
  return { label, reverseLabel: [...stops].reverse().join(' → '), entry: stops[0], exit: stops.at(-1), levels,
    kind: stops.length > 1 ? 'passage' : label.includes('夾層') ? 'low' : 'floor' };
}

export function readSceneFloor(spec, node) {
  const anchor = `<a id="${node.spatialHeading}"></a>`;
  assert(spec.includes(anchor), `Missing spatial section: ${node.id}`);
  const section = spec.split(anchor)[1].split('<a id="node-')[0];
  const rows = section.split('\n').filter(line => line.startsWith('|'))
    .map(line => line.split('|').slice(1, -1).map(cell => cell.trim()));
  const values = key => rows.filter(cells => cells[0] === key);
  assert.equal(values('樓層與環境').length, 1, `Floor description: ${node.id}`);
  assert.equal(values('樓層定位').length, 1, `Floor row: ${node.id}`);
  const description = values('樓層與環境')[0][1], label = values('樓層定位')[0][1];
  const source = { description, source: node.pack, heading: node.spatialHeading };
  // Ending nodes are presentation states, not another traversable floor.
  if (description.startsWith('分支演出節點')) {
    assert(['R33', 'POST'].includes(node.id), `Unknown ending floor: ${node.id}`);
    assert.equal(label, node.id === 'R33' ? '50F／B3（分支演出）' : '片尾演出（無固定樓層）');
    return { ...source, kind: 'ending', label, reverseLabel: label, entry: null, exit: null, levels: [] };
  }
  const floor = preciseFloor(label, node.id);
  assert.equal(floor.levels.length, node.id === 'M1' ? 2 : 1, `Room floor count: ${node.id}`);
  return { ...source, ...floor };
}

export function readChildFloors(spec, node, expected) {
  const begin = `<!-- scene-floor-locations:${node}:begin -->`, end = `<!-- scene-floor-locations:${node}:end -->`;
  if (!expected.length) {
    assert(!spec.includes(begin), `Unexpected floor table: ${node}`);
    return new Map();
  }
  assert.equal(spec.split(begin).length, 2, `Missing or duplicate child floor table: ${node}`);
  assert.equal(spec.split(end).length, 2, `Missing or duplicate child floor end: ${node}`);
  const body = spec.split(begin)[1].split(end)[0];
  const rows = body.split('\n').filter(line => line.startsWith('|')).map(line => line.split('|').slice(1, -1).map(c => c.trim()));
  assert.deepEqual(rows.shift(), ['次場景／主圖', '樓層定位', '樓棟定位', '移動方式']);
  assert.deepEqual(rows.shift(), ['---', '---', '---', '---']);
  assert.deepEqual(rows.map(r => r[0]).sort(), expected.map(s => s.id).sort(), `Child floor coverage: ${node}`);
  return new Map(rows.map(([id, label]) => [id, preciseFloor(label, id)]));
}
