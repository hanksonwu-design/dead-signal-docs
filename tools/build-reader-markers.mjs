import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {ACTS} from './screenplay-files.mjs';
import {locateReadingMarkers, screenplayBody} from '../building/screenplay-marker-placement.js';

const read = name => readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');
export function readingMarkerData() {
  const graph = JSON.parse(read('scene_graph.json'));
  const markers = JSON.parse(read('building/scene-markers.json')).markers;
  const data = Object.fromEntries(ACTS.map(a => [a.path, []]));
  for (const m of markers) {
    const owner = graph.nodes.find(n => n.id === m.node)?.source;
    assert(data[owner], `Missing reading chapter: ${m.id}`);
    data[owner].push({id: m.id, image: m.image, category: m.category});
  }
  for (const [file, items] of Object.entries(data)) {
    const {issues} = locateReadingMarkers(screenplayBody(read(`docs/${file}`)), items);
    assert.deepEqual(issues, [], `Reading marker placement: ${file}`);
  }
  return data;
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  console.log(`${Object.values(readingMarkerData()).flat().length} reading markers verified across ${ACTS.length} acts.`);
}
