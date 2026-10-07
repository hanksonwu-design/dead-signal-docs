import {MARKER_CATEGORIES, markerIcon} from './marker-presentation.js';
import {locateReadingMarkers} from './screenplay-marker-placement.js';
import {fragmentLabel, readingCueGroups} from './fragment-forms.js';

const data = __READING_MARKERS__;
const preferenceKey = 'dead-signal:screenplay-cues:v1';
let enabled = true;
try { enabled = localStorage.getItem(preferenceKey) !== 'off'; } catch (_) { /* Reading works without storage. */ }

export function setup() {
  const input = document.getElementById('reading-markers');
  input.checked = enabled;
  input.addEventListener('change', () => {
    const content = document.getElementById('readerContent'), panel = document.querySelector('.reader-panel');
    const top = document.querySelector('.reader-topbar').getBoundingClientRect().bottom;
    const focus = [...content.querySelectorAll('[data-source-line]')].find(el => el.getBoundingClientRect().bottom > top);
    const before = focus?.getBoundingClientRect().top;
    enabled = input.checked;
    content.classList.toggle('hide-screenplay-cues', !enabled);
    if (focus) panel.scrollTop += focus.getBoundingClientRect().top - before;
    try { localStorage.setItem(preferenceKey, enabled ? 'on' : 'off'); } catch (_) { /* Keep the in-memory choice. */ }
  });
}

export function decorate(content, raw, path) {
  content.querySelectorAll('.screenplay-cues').forEach(el => el.remove());
  const markers = data[path] || [];
  const {found} = locateReadingMarkers(raw, markers);
  const groups = new Map();
  for (const m of found) {
    const target = content.querySelector(`[data-source-line="${m.line}"]`);
    if (!target) continue;
    if (!groups.has(target)) groups.set(target, []);
    groups.get(target).push(m);
  }
  for (const [target, items] of groups) {
    const row = document.createElement('span');
    row.className = 'screenplay-cues';
    for (const {category, forms, matches} of readingCueGroups(items, MARKER_CATEGORIES)) {
      const label = document.createElement('span'), name = document.createElement('span');
      label.className = 'screenplay-cue';
      label.dataset.category = category;
      label.dataset.readingMarkers = matches.map(m => m.id).join(' ');
      name.textContent = fragmentLabel(MARKER_CATEGORIES[category], forms);
      label.title = matches.map(m => fragmentLabel(m.title, m.fragmentForms)).join('、');
      label.append(markerIcon(category), name);
      row.append(label);
    }
    (target.matches('tr') ? target.querySelector('td,th') : target).prepend(row);
  }
  document.getElementById('reading-marker-control').hidden = !groups.size;
  content.classList.toggle('hide-screenplay-cues', !enabled);
}
