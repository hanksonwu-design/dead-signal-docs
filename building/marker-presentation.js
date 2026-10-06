import {createElement, KeyRound, Puzzle, Clapperboard, Ghost, Skull} from 'lucide';
export {MARKER_CATEGORIES} from './marker-categories.js';

const icons = {item: KeyRound, puzzle: Puzzle, event: Clapperboard, horror: Ghost, boss: Skull};
export const markerIcon = category => createElement(icons[category], {
  width: 16, height: 16, 'aria-hidden': 'true', focusable: 'false'
});
