// The outer document retains its single audio player and document filters.
// Only the scene view is framed; its URL remains shareable on static hosting.
(() => {
  const site = new URL('./', document.currentScript.src);
  const workspace = document.getElementById('sceneWorkspace');
  const loading = document.getElementById('sceneLoading');
  if (!workspace) return;
  const title = document.title;
  let frame;
  let ready = false;
  let returnFocus;
  let lastScene = new URL('building/', site);
  let home = new URL(location.href);
  home.searchParams.delete('view');
  if (new URLSearchParams(location.search).get('view') === 'building') home.hash = '';

  const isSceneOpen = () => new URLSearchParams(location.search).get('view') === 'building';
  const sceneURL = href => {
    const target = new URL(href, site);
    const path = new URL('building/', site).pathname;
    if (target.origin !== site.origin || ![path, `${path}index.html`].includes(target.pathname)) return null;
    target.pathname = path;
    target.searchParams.delete('view');
    return target;
  };
  const routeURL = scene => {
    const target = new URL(site);
    target.search = scene.search;
    target.searchParams.set('view', 'building');
    target.hash = scene.hash;
    return target;
  };
  const focusScene = () => {
    if (!ready || workspace.hidden) return;
    const heading = frame.contentDocument?.querySelector('h1');
    if (heading) { heading.tabIndex = -1; heading.focus({ preventScroll: true }); }
    else frame.focus();
  };
  const showScene = target => {
    document.body.classList.add('scene-view');
    workspace.hidden = false;
    document.title = '灰燈寨 · 場景與流程';
    lastScene = target;
    if (!frame) {
      frame = document.createElement('iframe');
      frame.title = '灰燈寨 · 場景與流程';
      frame.id = 'sceneFrame';
      frame.src = target.href;
      frame.addEventListener('load', () => {
        ready = true;
        loading.hidden = true;
        focusScene();
      });
      workspace.append(frame);
    } else if (frame.contentWindow.location.href !== target.href) {
      // Replace the child URL without adding an iframe history entry.
      frame.contentWindow.location.replace(target.href);
    }
    focusScene();
  };
  const hideScene = () => {
    const wasOpen = !workspace.hidden;
    workspace.hidden = true;
    document.body.classList.remove('scene-view');
    document.title = title;
    if (wasOpen) {
      const target = returnFocus?.isConnected && returnFocus.getClientRects().length ? returnFocus : document.getElementById('searchInput');
      target?.focus({ preventScroll: true });
    }
  };
  const openScene = href => {
    const target = sceneURL(href);
    if (!target) return false;
    if (!isSceneOpen()) {
      home = new URL(location.href);
      const hash = new URLSearchParams(home.hash.slice(1));
      if (hash.has('scene') && !hash.has('doc')) home.hash = '';
      returnFocus = document.activeElement;
    }
    // Re-entering from the ordinary scene links retains the last selection.
    if (!target.hash && ready) target.hash = lastScene.hash;
    history.pushState(null, '', routeURL(target));
    showScene(target);
    return true;
  };
  const openDocuments = () => {
    history.pushState(null, '', home);
    hideScene();
  };
  const setSceneHash = (source, hash) => {
    if (source !== frame?.contentWindow || !isSceneOpen()) return;
    lastScene.hash = hash;
    history.replaceState(null, '', routeURL(lastScene));
  };
  window.ArchiveNavigation = Object.freeze({ openScene, openDocuments, setSceneHash, isSceneOpen });

  document.addEventListener('click', event => {
    if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    const link = event.target.closest('a[href]');
    if (!link || (link.target && link.target !== '_self') || link.hasAttribute('download')) return;
    const target = sceneURL(link.href);
    if (!target) return;
    event.preventDefault();
    openScene(target.href);
  });
  document.getElementById('sceneReturn').addEventListener('click', openDocuments);
  const restore = () => {
    if (isSceneOpen()) {
      const target = new URL('building/', site);
      target.search = location.search;
      target.searchParams.delete('view');
      target.hash = location.hash;
      showScene(target);
    } else hideScene();
  };
  window.addEventListener('popstate', restore);
  window.addEventListener('hashchange', () => { if (isSceneOpen()) restore(); });
  restore();
})();
