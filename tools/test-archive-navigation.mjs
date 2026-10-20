import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const navigationSource = readFileSync(new URL('../archive-navigation.js', import.meta.url), 'utf8');
const bridgeSource = readFileSync(new URL('../building/archive-bridge.js', import.meta.url), 'utf8');

class Events {
  handlers = new Map();
  addEventListener(type, listener) {
    const listeners = this.handlers.get(type) || [];
    listeners.push(listener);
    this.handlers.set(type, listeners);
  }
  emit(type, event = {}) {
    for (const listener of this.handlers.get(type) || []) listener(event);
  }
}

function element(document, properties = {}) {
  const classes = new Set();
  return Object.assign(new Events(), {
    hidden: false,
    isConnected: true,
    focused: 0,
    attributes: {},
    classList: {add: value => classes.add(value), remove: value => classes.delete(value), contains: value => classes.has(value)},
    focus() { this.focused++; document.activeElement = this; },
    getClientRects: () => [{}],
    setAttribute(name, value) { this.attributes[name] = value; },
    hasAttribute(name) { return Object.hasOwn(this.attributes, name); },
    querySelector() { return null; },
  }, properties);
}

function makeLocation(href) {
  let value = new URL(href);
  const replaced = [];
  return {
    get href() { return value.href; },
    set href(next) { value = new URL(next, value); },
    get origin() { return value.origin; },
    get search() { return value.search; },
    get hash() { return value.hash; },
    replace(next) { replaced.push(new URL(next, value).href); value = new URL(next, value); },
    replaced,
  };
}

function shell(href = 'https://example.test/project/?static=1') {
  const document = new Events();
  document.currentScript = {src: 'https://example.test/project/archive-navigation.js'};
  document.title = '企劃文件';
  document.body = element(document);
  const elements = new Map();
  for (const id of ['sceneWorkspace', 'sceneLoading', 'sceneReturn', 'searchInput']) elements.set(id, element(document));
  elements.get('sceneWorkspace').hidden = true;
  const trigger = element(document);
  document.activeElement = trigger;
  let audioOperations = 0;
  elements.set('backgroundMusic', {play() { audioOperations++; }, pause() { audioOperations++; }});
  document.getElementById = id => elements.get(id);
  const frames = [];
  document.createElement = tag => {
    assert.equal(tag, 'iframe');
    const heading = element(document);
    const frame = element(document, {
      contentDocument: {querySelector: selector => selector === 'h1' ? heading : null},
      contentWindow: {location: makeLocation('about:blank')},
      heading,
    });
    Object.defineProperty(frame, 'src', {
      get() { return this.contentWindow.location.href; },
      set(value) { this.contentWindow.location.href = value; },
    });
    frames.push(frame);
    return frame;
  };
  elements.get('sceneWorkspace').append = frame => { frame.isConnected = true; };
  const window = new Events();
  window.location = makeLocation(href);
  const entries = [];
  const history = Object.fromEntries(['pushState', 'replaceState'].map(method => [method, (_state, _title, url) => {
    window.location.href = url;
    entries.push({method, href: window.location.href});
  }]));
  vm.runInNewContext(navigationSource, {document, window, location: window.location, history, URL, URLSearchParams});
  return {window, document, elements, frames, trigger, entries, get audioOperations() { return audioOperations; }};
}

function click(target, extras = {}) {
  return {target, button: 0, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, ...extras};
}

function anchor(document, href, target = '') {
  const link = element(document, {href, target});
  link.closest = () => link;
  return link;
}

test('entering scenes keeps the audio owner and creates one child with one parent history push', () => {
  const page = shell();
  assert.equal(page.window.ArchiveNavigation.openScene('https://example.test/project/building/#scene=R24'), true);
  assert.equal(page.frames.length, 1);
  assert.equal(page.entries.length, 1);
  assert.equal(page.entries[0].method, 'pushState');
  assert.equal(page.window.location.href, 'https://example.test/project/?view=building#scene=R24');
  assert.equal(page.elements.get('sceneWorkspace').hidden, false);
  assert.equal(page.audioOperations, 0);
  const frame = page.frames[0];
  frame.emit('load');
  assert.equal(page.elements.get('sceneLoading').hidden, true);
  assert.equal(frame.heading.focused, 1);
});

test('scene selection replaces the parent URL only for its active child and preserves every share parameter', () => {
  const page = shell();
  page.window.ArchiveNavigation.openScene('https://example.test/project/building/?preview=1#scene=R24');
  const frame = page.frames[0];
  const selection = '#scene=R25&route=R24-R25-33&shot=T-R24-R25-01&direction=return&marker=record';
  page.window.ArchiveNavigation.setSceneHash({}, selection);
  assert.equal(page.entries.length, 1);
  page.window.ArchiveNavigation.setSceneHash(frame.contentWindow, selection);
  assert.equal(page.entries.at(-1).method, 'replaceState');
  assert.equal(page.window.location.href, `https://example.test/project/?preview=1&view=building${selection}`);
  page.window.ArchiveNavigation.openDocuments();
  const count = page.entries.length;
  page.window.ArchiveNavigation.setSceneHash(frame.contentWindow, '#scene=R6');
  assert.equal(page.entries.length, count);
});

test('return and browser history reuse the same scene frame and restore the original trigger', () => {
  const page = shell();
  page.window.ArchiveNavigation.openScene('https://example.test/project/building/#scene=R24');
  const frame = page.frames[0];
  frame.emit('load');
  page.window.ArchiveNavigation.setSceneHash(frame.contentWindow, '#scene=R25');
  frame.contentWindow.location.href = 'https://example.test/project/building/#scene=R25';
  const sceneEntry = page.window.location.href;
  page.window.ArchiveNavigation.openDocuments();
  assert.equal(page.window.location.href, 'https://example.test/project/?static=1');
  assert.equal(page.elements.get('sceneWorkspace').hidden, true);
  assert.equal(page.document.activeElement, page.trigger);
  page.window.location.href = sceneEntry;
  page.window.emit('popstate');
  assert.equal(page.frames.length, 1);
  assert.equal(page.elements.get('sceneWorkspace').hidden, false);
  page.window.location.href = 'https://example.test/project/?view=building#scene=R26';
  page.window.emit('popstate');
  assert.equal(frame.contentWindow.location.replaced.at(-1), 'https://example.test/project/building/#scene=R26');
  page.window.location.href = 'https://example.test/project/?static=1';
  page.window.emit('popstate');
  assert.equal(page.elements.get('sceneWorkspace').hidden, true);
  assert.equal(page.audioOperations, 0);
});

test('ordinary scene links are intercepted while outside URLs, modifiers and new tabs keep native behavior', () => {
  const page = shell();
  const scene = anchor(page.document, 'https://example.test/project/building/');
  for (const extras of [{ctrlKey: true}, {metaKey: true}, {shiftKey: true}, {altKey: true}, {button: 1}]) {
    const event = click(scene, extras);
    page.document.emit('click', event);
    assert.equal(event.defaultPrevented, false);
  }
  for (const link of [anchor(page.document, scene.href, '_blank'), anchor(page.document, 'https://outside.test/project/building/')]) {
    const event = click(link);
    page.document.emit('click', event);
    assert.equal(event.defaultPrevented, false);
  }
  assert.equal(page.window.ArchiveNavigation.openScene('https://outside.test/project/building/'), false);
  assert.equal(page.frames.length, 0);
  const event = click(scene);
  page.document.emit('click', event);
  assert.equal(event.defaultPrevented, true);
  assert.equal(page.frames.length, 1);
});

test('legacy scene hashes return to documents instead of leaving a redirecting scene URL', () => {
  const page = shell('https://example.test/project/#scene=R24&route=R24-R25-33');
  page.window.ArchiveNavigation.openScene('https://example.test/project/building/index.html#scene=R24');
  assert.equal(page.frames[0].contentWindow.location.href, 'https://example.test/project/building/#scene=R24');
  page.window.ArchiveNavigation.openDocuments();
  assert.equal(page.window.location.href, 'https://example.test/project/');
});

test('a directly opened scene enters the shell under its Pages project prefix with query and hash intact', () => {
  const location = makeLocation('https://name.github.io/project/building/?preview=1#scene=R25&marker=record');
  const window = new Events();
  window.parent = window;
  const document = {currentScript: {src: 'https://name.github.io/project/building/archive-bridge.js'}};
  vm.runInNewContext(bridgeSource, {window, document, location, URL});
  assert.deepEqual(location.replaced, ['https://name.github.io/project/?preview=1&view=building#scene=R25&marker=record']);
});

test('the embedded bridge delegates return, selection and music controls to the single parent player', () => {
  const document = new Events();
  document.currentScript = {src: 'https://example.test/project/building/archive-bridge.js'};
  const elements = new Map();
  for (const id of ['flow-link', 'sceneMusic', 'sceneMusicToggle', 'sceneMusicVolume', 'sceneMusicStatus']) elements.set(id, element(document));
  const icon = element(document);
  elements.get('sceneMusicToggle').querySelector = () => icon;
  document.getElementById = id => elements.get(id);
  let returned = 0, toggled = 0, unsubscribed = 0, nextVolume;
  const selections = [];
  const location = makeLocation('https://example.test/project/building/#scene=R25&marker=record');
  const window = new Events();
  window.parent = {
    location: {origin: location.origin},
    ArchiveNavigation: {openDocuments() { returned++; }, setSceneHash(source, hash) { selections.push({source, hash}); }},
    ArchiveMusic: {
      toggle() { toggled++; },
      setVolume(value) { nextVolume = value; },
      subscribe(listener) { listener({playing: true, volume: 31, failed: false, blocked: false}); return () => { unsubscribed++; }; },
    },
  };
  vm.runInNewContext(bridgeSource, {window, document, location, URL});
  window.emit('archive:scene-change');
  assert.equal(selections[0].source, window);
  assert.equal(selections[0].hash, location.hash);
  document.emit('DOMContentLoaded');
  assert.equal(elements.get('sceneMusic').hidden, false);
  assert.equal(elements.get('sceneMusicToggle').attributes['aria-pressed'], 'true');
  assert.equal(elements.get('sceneMusicVolume').value, '31');
  const modified = click(elements.get('flow-link'), {ctrlKey: true});
  elements.get('flow-link').emit('click', modified);
  assert.equal(modified.defaultPrevented, false);
  assert.equal(returned, 0);
  const back = click(elements.get('flow-link'));
  elements.get('flow-link').emit('click', back);
  assert.equal(back.defaultPrevented, true);
  assert.equal(returned, 1);
  elements.get('sceneMusicToggle').emit('click');
  elements.get('sceneMusicVolume').value = '42';
  elements.get('sceneMusicVolume').emit('input');
  assert.equal(toggled, 1);
  assert.equal(nextVolume, '42');
  window.emit('pagehide');
  assert.equal(unsubscribed, 1);
});
