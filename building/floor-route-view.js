const EPS = 1e-9;
const same = (a, b) => a.every((value, axis) => Math.abs(value - b[axis]) <= EPS);

/** Clip a polyline against the inclusive horizontal slab [minY,maxY]. Each
 * result is one uninterrupted visit to that slab, in original travel order.
 * Leaving and returning never creates a chord between separate route visits. */
export function clipRouteToHeight(points, minY, maxY) {
  if (!Number.isFinite(minY) || !Number.isFinite(maxY) || minY > maxY) throw new Error('樓層顯示範圍必須是由低至高的有效高度。');
  if (!Array.isArray(points) || points.some(point => !Array.isArray(point) || point.length !== 3 || point.some(value => !Number.isFinite(value)))) {
    throw new Error('樓梯路線必須包含有效的 X、Y、Z 座標。');
  }
  const paths = [];
  let current = [];
  const finish = () => { if (current.length >= 2) paths.push(current); current = []; };
  const append = point => { if (!current.length || !same(current.at(-1), point)) current.push([...point]); };
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i], dy = b[1] - a[1];
    let enter = 0, leave = 1;
    if (dy === 0) {
      if (a[1] < minY || a[1] > maxY) { finish(); continue; }
    } else {
      // Coordinate input is finite; scale only the unusual case where
      // subtracting two finite extreme heights overflows the JS number range.
      const scale = Number.isFinite(dy) ? 1 : Math.max(Math.abs(a[1]), Math.abs(b[1]), Math.abs(minY), Math.abs(maxY));
      const delta = b[1] / scale - a[1] / scale;
      const low = (minY / scale - a[1] / scale) / delta;
      const high = (maxY / scale - a[1] / scale) / delta;
      enter = Math.max(0, Math.min(low, high));
      leave = Math.min(1, Math.max(low, high));
      if (enter > leave) { finish(); continue; }
    }
    if (enter > 0) finish();
    const at = t => t === 0 ? [...a] : t === 1 ? [...b] : a.map((value, axis) => {
      const delta = b[axis] - value;
      const mixed = Number.isFinite(delta) ? value + delta * t : value * (1 - t) + b[axis] * t;
      return axis === 1 ? Math.min(maxY, Math.max(minY, mixed)) : mixed;
    });
    const start = at(enter), end = at(leave);
    if (!same(start, end)) {
      if (current.length && !same(current.at(-1), start)) finish();
      append(start); append(end);
    }
    // Even an excursion that returns to the same boundary position must
    // split the output, so connectedness follows travel rather than position.
    if (leave < 1) finish();
  }
  finish();
  return paths;
}
