import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {readingMarkerData} from './build-reader-markers.mjs';
import {ACTS} from './screenplay-files.mjs';
import {locateReadingMarkers, screenplayBody, READING_PLACEMENTS} from '../building/screenplay-marker-placement.js';
import {MARKER_CATEGORIES} from '../building/marker-categories.js';
import {readingCueGroups} from '../building/fragment-forms.js';

const read = name => readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');
const data = readingMarkerData();
const model = JSON.parse(read('building/scene-markers.json')).markers;
const body = path => screenplayBody(read(`docs/${path}`));
const placements = Object.entries(data).flatMap(([path, markers]) => locateReadingMarkers(body(path), markers).found.map(m => ({...m, path})));

test('all canonical markers appear once across ten reading acts with the same categories and image IDs', () => {
  assert.equal(Object.keys(data).length, ACTS.length);
  assert.equal(placements.length, model.length);
  assert.equal(new Set(placements.map(m => m.id)).size, model.length);
  for (const m of placements) {
    const original = model.find(x => x.id === m.id);
    assert.equal(m.category, original.category);
    assert.equal(m.image, original.image);
    assert.deepEqual(m.fragmentForms, original.fragmentForms);
    assert.equal(m.title, original.title);
    assert.equal(m.reading, original.reading);
    assert(MARKER_CATEGORIES[m.category]);
    assert(!/^(?:\s*<|#{1,6} |\s*$)/.test(body(m.path).split('\n')[m.line]), m.id);
  }
  assert(Object.values(data).every(markers => markers.length > 0));
  assert(model.filter(m => m.shot).every(m => placements.some(p => p.id === m.id)), 'transition markers retained');
});

test('source reading overrides follow acquisition beats and retain sparse, distinct forms', () => {
  const groups = new Map();
  for (const m of placements) {
    if (m.reading) assert(body(m.path).split('\n')[m.line].includes(m.reading), m.id);
    const key = `${m.path}:${m.line}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(m);
  }
  for (const [key, items] of groups) assert(readingCueGroups(items, MARKER_CATEGORIES).length <= 2, key);
  const source = placements.find(m => m.id === 'R9-C03-item');
  const scare = placements.find(m => m.id === 'R9-C01-horror');
  assert(scare.line > source.line, 'the fake window occurs after investigating the room');
  assert.match(body(scare.path).split('\n')[scare.line], /帆布旁一道暗縫/);
});

test('fragment types use one formatter in the reader and every model label surface', () => {
  for (const file of ['building/current-model.js', 'building/screenplay-reader.js']) assert.match(read(file), /from '\.\/fragment-forms.js'/);
  const ui = read('building/current-model.js');
  assert.match(ui, /const title=fragmentLabel\(m.title,m.fragmentForms\)/);
  assert.match(ui, /form.textContent=title.slice\(m.title.length\)/);
  for (const surface of ["$('marker-list').innerHTML=", "$('marker-detail').innerHTML="]) {
    const line = ui.split('\n').find(line => line.includes(surface));
    assert(line.includes('fragmentLabel(m.title,m.fragmentForms)'), surface);
  }
  assert(placements.filter(m => m.fragmentForms.length).length > 0);
});

test('late horror and bosses stay on their occurrence rather than reused establishing shots', () => {
  for (const id of Object.keys(READING_PLACEMENTS)) {
    const p = placements.find(p => p.id === id);
    assert(p, id);
    assert(body(p.path).split('\n')[p.line].includes(READING_PLACEMENTS[id]), id);
  }
  const bosses = placements.filter(m => m.category === 'boss');
  assert.deepEqual(bosses.map(m => m.id), ['R26-V01-boss', 'R32-V01-boss']);
  const xiaohua = bosses[1], text = body(xiaohua.path), offset = text.split('\n').slice(0, xiaohua.line).join('\n').length;
  assert(offset > text.indexOf('[R32-09]'));
  assert(offset > text.indexOf('雙揭露所需來源已核對'));
  assert.equal(placements.find(m => m.id === 'R11-V01-horror').category, 'horror');
  const basin = placements.find(m => m.id === 'P2-C04-horror');
  assert.match(body(basin.path).split('\n')[basin.line], /^\| \*\*搪瓷盆/);
});

test('missing and ambiguous placements fail closed and never annotate comments or fenced examples', () => {
  const markers = [{id: 'test-item', image: 'TEST-C01', category: 'item'}];
  assert.equal(locateReadingMarkers('No image', markers).found.length, 0);
  const duplicate = '[TEST-C01](spec.md) clue\n\n[TEST-C01](spec.md) another';
  assert.match(locateReadingMarkers(duplicate, markers).issues[0], /2 reading targets/);
  const source = '<!-- [TEST-C01](spec.md) -->\n```\n[TEST-C01](spec.md)\n```\n\n[TEST-C01](spec.md) clue';
  assert.equal(locateReadingMarkers(source, markers).found[0].line, 5);
  assert.equal(locateReadingMarkers(source.replaceAll('\n', '\r\n'), markers).found[0].line, 5);
  assert.equal(screenplayBody('---\r\n文件: Test\r\n---\r\n\r\nBody'), 'Body');
});

test('reader and model use the same palette and icon factory without copying categories into scripts', () => {
  assert.match(read('index.html'), /href="marker-colors.css"/);
  assert.match(read('building/current-template.html'), /href="\.\.\/marker-colors.css"/);
  assert(!read('building/current-template.html').includes('[data-category=item]'));
  for (const file of ['building/current-model.js', 'building/screenplay-reader.js']) assert.match(read(file), /from '\.\/marker-presentation.js'/);
  assert.equal((read('marker-colors.css').match(/data-category=/g) || []).length, Object.keys(MARKER_CATEGORIES).length);
  for (const act of ACTS) assert(!read(`docs/${act.path}`).includes('screenplay-cue'), 'presentation does not rewrite narrative');
});
