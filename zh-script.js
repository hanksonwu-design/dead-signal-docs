// Traditional / Simplified display toggle. Documents stay Traditional in the repository;
// Simplified is only a view, converted in the browser and reversible without reloading.
(() => {
  const STORAGE_KEY = "dead-signal:script";
  const CONVERTER_URL = "https://cdn.jsdelivr.net/npm/opencc-js@1.4.2/dist/umd/t2cn.js";
  const ATTRIBUTES = ["placeholder", "aria-label", "title", "alt"];
  const SKIP = "script, style, textarea, [data-zh-skip]";
  const HAN = /[㐀-鿿]/;
  const button = document.getElementById("scriptToggle");
  const originalLang = document.documentElement.lang;
  // Remember what was replaced, so switching back restores only text the page has not rewritten since.
  const texts = new Map();
  const attributes = new Map();
  let toSimplified = null;
  let simplified = false;

  const observer = new MutationObserver((records) => {
    for (const record of records) {
      if (record.type === "attributes") convertAttributes(record.target);
      else record.addedNodes.forEach(convertTree);
    }
    observer.takeRecords();
    if (texts.size > 20000) prune();
  });

  function loadConverter() {
    if (toSimplified) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = CONVERTER_URL;
      script.onload = () => {
        toSimplified = window.OpenCC.Converter({ from: "tw", to: "cn" });
        resolve();
      };
      script.onerror = () => reject(new Error("簡體轉換元件載入失敗，請稍後再試"));
      document.head.append(script);
    });
  }

  function skipped(node) {
    const element = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
    return !element || Boolean(element.closest(SKIP));
  }

  function convertText(node) {
    if (!HAN.test(node.nodeValue) || skipped(node)) return;
    const converted = toSimplified(node.nodeValue);
    if (converted === node.nodeValue) return;
    texts.set(node, { original: node.nodeValue, converted });
    node.nodeValue = converted;
  }

  function convertAttributes(element) {
    if (skipped(element)) return;
    for (const name of ATTRIBUTES) {
      const value = element.getAttribute(name);
      if (!value || !HAN.test(value)) continue;
      const converted = toSimplified(value);
      if (converted === value) continue;
      const saved = attributes.get(element) || {};
      saved[name] = { original: value, converted };
      attributes.set(element, saved);
      element.setAttribute(name, converted);
    }
  }

  function convertTree(root) {
    if (root.nodeType === Node.TEXT_NODE) return convertText(root);
    if (root.nodeType !== Node.ELEMENT_NODE || skipped(root)) return;
    convertAttributes(root);
    root.querySelectorAll("*").forEach(convertAttributes);
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) convertText(node);
  }

  function prune() {
    for (const node of texts.keys()) if (!node.isConnected) texts.delete(node);
    for (const element of attributes.keys()) if (!element.isConnected) attributes.delete(element);
  }

  function restore() {
    for (const [node, entry] of texts) if (node.isConnected && node.nodeValue === entry.converted) node.nodeValue = entry.original;
    for (const [element, saved] of attributes) {
      for (const [name, entry] of Object.entries(saved)) {
        if (element.getAttribute(name) === entry.converted) element.setAttribute(name, entry.original);
      }
    }
    texts.clear();
    attributes.clear();
  }

  function remember() {
    try { localStorage.setItem(STORAGE_KEY, simplified ? "hans" : "hant"); } catch (_) {}
  }

  function preferred() {
    try { return localStorage.getItem(STORAGE_KEY) === "hans"; } catch (_) { return false; }
  }

  function renderButton() {
    button.textContent = simplified ? "繁體" : "简体";
    button.setAttribute("aria-pressed", String(simplified));
    button.setAttribute("aria-label", simplified ? "改用繁体中文显示" : "改用簡體中文顯示");
    button.title = simplified ? "改用繁体中文显示" : "改用簡體中文顯示";
  }

  async function setSimplified(on) {
    if (on === simplified) return;
    if (on) {
      button.disabled = true;
      try {
        await loadConverter();
      } catch (error) {
        button.disabled = false;
        button.title = error.message;
        return;
      }
      simplified = true;
      convertTree(document.body);
      observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ATTRIBUTES });
      document.documentElement.lang = "zh-Hans";
    } else {
      simplified = false;
      observer.disconnect();
      restore();
      document.documentElement.lang = originalLang;
    }
    button.disabled = false;
    renderButton();
    remember();
    window.dispatchEvent(new CustomEvent("zh-script-change", { detail: { simplified } }));
  }

  window.ZhScript = {
    get simplified() { return simplified; },
    // Brings Traditional and Simplified text to one form so searches and heading lookups match either.
    normalize: (text) => (simplified && toSimplified ? toSimplified(text) : text),
  };

  if (!button) return;
  renderButton();
  button.addEventListener("click", () => setSimplified(!simplified));
  if (preferred()) setSimplified(true);
})();
