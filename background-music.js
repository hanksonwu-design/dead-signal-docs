// The document browser owns the persistent player. The scene workspace and
// reader controls share it so changing views never replaces the audio element.
(() => {
  const audio = document.getElementById('backgroundMusic');
  const volume = document.getElementById('musicVolume');
  const status = document.getElementById('musicStatus');
  const toggles = [...document.querySelectorAll('[data-music-toggle]')];
  if (!audio || !volume || !status || !toggles.length) return;

  const preferenceKey = 'dead-signal:background-music';
  let preference = {};
  try { preference = JSON.parse(localStorage.getItem(preferenceKey)) || {}; } catch (_) {}
  let desiredPlaying = preference.playing !== false;
  let blocked = false;
  let failed = false;
  let pending = null;
  let leaving = false;
  const listeners = new Set();
  const storedVolume = Number(preference.volume);
  audio.volume = Number.isFinite(storedVolume) && storedVolume >= 0 && storedVolume <= 1 ? storedVolume : .25;
  volume.value = String(Math.round(audio.volume * 100));
  volume.setAttribute('aria-valuetext', `${volume.value}%`);

  const save = () => {
    try { localStorage.setItem(preferenceKey, JSON.stringify({ playing: desiredPlaying, volume: audio.volume })); } catch (_) {}
  };
  const getState = () => ({
    playing: !audio.paused && !audio.ended,
    volume: Math.round(audio.volume * 100),
    blocked,
    failed,
  });
  const sync = () => {
    const state = getState();
    const { playing } = state;
    volume.value = String(state.volume);
    volume.setAttribute('aria-valuetext', `${state.volume}%`);
    for (const button of toggles) {
      const label = playing ? '暫停背景音樂' : '播放背景音樂';
      button.setAttribute('aria-pressed', String(playing));
      button.setAttribute('aria-label', label);
      button.title = label;
      button.querySelector('[data-music-icon]').textContent = playing ? 'Ⅱ' : '▶';
      const text = button.querySelector('[data-music-label]');
      if (text) text.textContent = playing ? '暫停音樂' : '播放音樂';
    }
    status.textContent = failed ? '音樂暫時無法載入' : playing ? '循環播放中' : blocked ? '點按播放 · 循環' : '已暫停 · 循環';
    for (const listener of listeners) {
      try { listener({ ...state }); }
      catch (error) { console.error('背景音樂狀態訂閱失敗', error); }
    }
    return state;
  };
  const play = () => {
    if (pending || leaving || !desiredPlaying) return;
    blocked = false;
    failed = false;
    pending = audio.play().catch(error => {
      if (error.name === 'NotAllowedError') blocked = true;
      else if (error.name !== 'AbortError') failed = true;
      sync();
    }).finally(() => { pending = null; sync(); });
  };

  const toggle = () => {
    desiredPlaying = audio.paused;
    blocked = false;
    save();
    if (desiredPlaying) {
      if (pending) pending.finally(() => { if (desiredPlaying && !leaving) play(); });
      else play();
    }
    else audio.pause();
    return sync();
  };
  const setVolume = percent => {
    const nextVolume = Number(percent);
    if (!Number.isFinite(nextVolume)) return getState();
    audio.volume = Math.min(100, Math.max(0, nextVolume)) / 100;
    save();
    return sync();
  };
  const subscribe = listener => {
    if (typeof listener !== 'function') throw new TypeError('音樂狀態訂閱者必須是函式');
    listeners.add(listener);
    try { listener(getState()); }
    catch (error) { console.error('背景音樂狀態訂閱失敗', error); }
    return () => listeners.delete(listener);
  };
  window.ArchiveMusic = Object.freeze({ toggle, setVolume, subscribe });

  // Keep multiple document tabs from playing the same track over one another.
  let channel;
  try {
    channel = new BroadcastChannel('dead-signal:background-music');
    channel.onmessage = event => { if (event.data === 'playing') audio.pause(); };
  } catch (_) {}
  audio.addEventListener('play', () => { channel?.postMessage('playing'); sync(); });
  audio.addEventListener('pause', sync);
  audio.addEventListener('error', () => { failed = true; sync(); });
  audio.addEventListener('volumechange', sync);
  for (const button of toggles) button.addEventListener('click', toggle);
  volume.addEventListener('input', () => setVolume(volume.value));
  window.addEventListener('pagehide', () => { leaving = true; audio.pause(); });
  window.addEventListener('pageshow', () => { leaving = false; if (desiredPlaying) play(); });
  sync();
  if (desiredPlaying) play();
})();
