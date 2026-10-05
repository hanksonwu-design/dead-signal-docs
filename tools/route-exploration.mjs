import assert from 'node:assert/strict';

// Authored alongside each route's image and floor tables in the production chapter.
export function readRouteExploration(spec, children) {
  const result = new Map();
  for (const [, owner, body] of spec.matchAll(/<!-- route-exploration:([^:]+):begin -->([\s\S]*?)<!-- route-exploration:\1:end -->/g)) {
    const rows = body.split('\n').filter(line => line.startsWith('|'))
      .map(line => line.split('|').slice(1, -1).map(cell => cell.trim()));
    assert.deepEqual(rows.shift(), ['次場景／主圖', '玩家目標', '辨路依據', '操作與通行條件', '錯路與復原', '通過狀態']);
    assert.deepEqual(rows.shift(), Array(6).fill('---'));
    for (const row of rows) {
      const [id, objective, clue, action, recovery, state] = row;
      assert.equal(row.length, 6, `Exploration columns: ${id}`);
      assert(row.every(Boolean), `Incomplete exploration: ${id}`);
      assert(children.some(child => child.id === id && child.node === owner), `Unknown exploration child: ${id}`);
      assert(!result.has(id), `Duplicate exploration: ${id}`);
      assert.equal(state, `route_local.${id.toLowerCase()}.open`, `Local exploration state: ${id}`);
      result.set(id, { objective, clue, action, recovery, state });
    }
  }
  return result;
}
