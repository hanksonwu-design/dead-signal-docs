// Direct scene links enter the persistent document shell. Embedded scenes use
// its existing audio player instead of loading another copy of the track.
(() => {
  const site = new URL('../', document.currentScript.src);
  if (window.parent === window) {
    site.search = location.search;
    site.searchParams.set('view', 'building');
    site.hash = location.hash;
    location.replace(site.href);
    return;
  }
  let navigation, music;
  try {
    if (window.parent.location.origin !== location.origin) return;
    navigation = window.parent.ArchiveNavigation;
    music = window.parent.ArchiveMusic;
  } catch (_) { return; }
  if (!navigation) return;
  window.addEventListener('archive:scene-change', () => navigation.setSceneHash(window, location.hash));
  document.addEventListener('DOMContentLoaded', () => {
    const back = document.getElementById('flow-link');
    back.addEventListener('click', event => {
      if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      navigation.openDocuments();
    });
    if (!music) return;
    const panel = document.getElementById('sceneMusic');
    const button = document.getElementById('sceneMusicToggle');
    const volume = document.getElementById('sceneMusicVolume');
    const status = document.getElementById('sceneMusicStatus');
    const unsubscribe = music.subscribe(state => {
      const label = state.playing ? '暫停背景音樂' : '播放背景音樂';
      button.setAttribute('aria-label', label);
      button.setAttribute('aria-pressed', String(state.playing));
      button.title = label;
      button.querySelector('[data-scene-music-icon]').textContent = state.playing ? 'Ⅱ' : '▶';
      volume.value = String(state.volume);
      volume.setAttribute('aria-valuetext', `${state.volume}%`);
      status.textContent = state.failed ? '音樂暫時無法載入' : state.playing ? '音樂播放中' : state.blocked ? '點按播放音樂' : '音樂已暫停';
    });
    button.addEventListener('click', () => music.toggle());
    volume.addEventListener('input', () => music.setVolume(volume.value));
    window.addEventListener('pagehide', unsubscribe, { once: true });
    panel.hidden = false;
  });
})();
