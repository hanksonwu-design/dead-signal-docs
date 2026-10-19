// This player is loaded by the document browser only. All its controls share
// one audio element, including the accessible control inside the reader dialog.
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
  const storedVolume = Number(preference.volume);
  audio.volume = Number.isFinite(storedVolume) && storedVolume >= 0 && storedVolume <= 1 ? storedVolume : .25;
  volume.value = String(Math.round(audio.volume * 100));
  volume.setAttribute('aria-valuetext', `${volume.value}%`);

  const save = () => {
    try { localStorage.setItem(preferenceKey, JSON.stringify({ playing: desiredPlaying, volume: audio.volume })); } catch (_) {}
  };
  const sync = () => {
    const playing = !audio.paused && !audio.ended;
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
  };
  const play = () => {
    if (pending || leaving || !desiredPlaying) return;
    blocked = false;
    failed = false;
    pending = audio.play().catch(error => {
      if (error.name === 'NotAllowedError') blocked = true;
      else if (error.name !== 'AbortError') failed = true;
    }).finally(() => { pending = null; sync(); });
  };

  // Keep multiple document tabs from playing the same track over one another.
  let channel;
  try {
    channel = new BroadcastChannel('dead-signal:background-music');
    channel.onmessage = event => { if (event.data === 'playing') audio.pause(); };
  } catch (_) {}
  audio.addEventListener('play', () => { channel?.postMessage('playing'); sync(); });
  audio.addEventListener('pause', sync);
  audio.addEventListener('error', () => { failed = true; sync(); });
  for (const button of toggles) button.addEventListener('click', () => {
    desiredPlaying = audio.paused;
    blocked = false;
    save();
    if (desiredPlaying) {
      if (pending) pending.finally(() => { if (desiredPlaying && !leaving) play(); });
      else play();
    }
    else audio.pause();
  });
  volume.addEventListener('input', () => {
    audio.volume = Number(volume.value) / 100;
    volume.setAttribute('aria-valuetext', `${volume.value}%`);
    save();
  });
  window.addEventListener('pagehide', () => { leaving = true; audio.pause(); });
  window.addEventListener('pageshow', () => { leaving = false; if (desiredPlaying) play(); });
  sync();
  if (desiredPlaying) play();
})();
