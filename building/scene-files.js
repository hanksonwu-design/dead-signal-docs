const MAX_BYTES = 128000000;

export function createSceneFileUI({editor, onLoaded = () => true, onExportFallback = () => {}}) {
  const $ = id => document.getElementById(id);
  let generation = 0, initialized = false;
  function status(message, error = false) {
    $('scene-file-status').textContent = message;
    $('scene-file-status').classList.toggle('error', error);
  }
  function loadText(text, name = '場景檔') {
    generation++; // A direct/pasted import also supersedes outstanding file reads.
    if (typeof text !== 'string' || text.length > MAX_BYTES) throw new Error('場景檔超過 128 MB 或內容不是文字。');
    const changed = editor.apply(JSON.parse(text.replace(/^\uFEFF/, ''))); // Store validation is atomic.
    const saved = onLoaded({name, changed}) !== false;
    const snapshot = editor.snapshot(), routes = (snapshot.edges?.length || 0) + (snapshot.terminalRoutes?.length || 0);
    status(`已載入 ${name} · ${snapshot.rooms.length} 個房間／${routes} 條通路${saved ? '' : ' · 瀏覽器無法暫存，請保留 JSON 備份。'}`, !saved);
    return {changed, saved};
  }
  function exportFile() {
    let text;
    try { text = JSON.stringify(editor.snapshot(), null, 2); }
    catch (error) { status('無法匯出場景：' + error.message, true); return false; }
    let url, anchor;
    try {
      const now = new Date(), pad = value => String(value).padStart(2, '0');
      const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
      url = URL.createObjectURL(new Blob([text], {type: 'application/json'}));
      anchor = document.createElement('a'); anchor.href = url;
      anchor.download = `dead-signal-scene-${stamp}.json`;
      document.body.append(anchor); anchor.click();
      status('已送出場景 JSON 下載請求。若未下載，可檢視並複製 JSON。');
      const fallback = document.createElement('button'); fallback.type = 'button';
      fallback.className = 'scene-file-fallback'; fallback.textContent = '檢視／複製 JSON';
      fallback.onclick = () => onExportFallback({text}); $('scene-file-status').append(fallback);
      return true;
    } catch (error) {
      status('無法啟動下載，請使用備用視窗複製場景 JSON。', true);
      onExportFallback({text, error}); return false;
    } finally {
      anchor?.remove();
      if (url) setTimeout(() => URL.revokeObjectURL(url), 30000);
    }
  }
  function init() {
    if (initialized) return; initialized = true;
    const input = $('scene-file');
    $('scene-export').onclick = exportFile;
    $('scene-import').onclick = () => {
      generation++; input.value = ''; status('選擇要載入的 JSON 場景檔。');
      try { input.click(); } catch (error) { status('無法開啟選檔視窗：' + error.message, true); }
    };
    input.onchange = async () => {
      const current = ++generation, file = input.files?.[0]; input.value = '';
      if (!file) return;
      if (file.size > MAX_BYTES) { status('場景檔超過 128 MB，請選擇匯出的配置 JSON。', true); return; }
      status(`正在讀取 ${file.name}…`);
      let text;
      try { text = await file.text(); }
      catch (error) { if (current === generation) status(`載入 ${file.name} 失敗：${error.message}`, true); return; }
      if (current !== generation) return;
      try { loadText(text, file.name); }
      catch (error) { status(`載入 ${file.name} 失敗：${error.message}`, true); }
    };
    input.addEventListener('cancel', () => { generation++; status('已取消選檔，場景未變更。'); });
  }
  return {init, loadText, exportFile};
}
