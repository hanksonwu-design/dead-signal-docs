// Display labels only: file paths, search metadata and production IDs stay intact.
function documentDisplayTitle(value) {
  return String(value ?? "").replace(/^\s*(?:-\s*)?0[0-8]-[A-Z]?\d{2}(?=$|[\s_：:·—-])(?:[\s_：:·—-]+)?/i, "").trim();
}
window.documentDisplayTitle = documentDisplayTitle;

const documentAliases = {"08_製作管理/08-04_Godot逐房製作包_R6-R11.md":"08_製作管理/上部_第05週_提交細表.md","08_製作管理/08-05_Godot逐房製作包_R12-R17.md":"08_製作管理/上部_第06週_提交細表.md","08_製作管理/08-06_Godot逐房製作包_R18-R22.md":"08_製作管理/上部_第06週_提交細表.md","08_製作管理/08-02_決策紀錄.md":"README.md","05_對戰系統/05-01_對戰設計原則.md": "04_核心玩法/04-07_怨靈應對原則.md", "05_對戰系統/05-02_訊號博弈.md": "04_核心玩法/04-08_訊號博弈.md", "05_對戰系統/05-03_潛行追逐.md": "04_核心玩法/04-09_潛行追逐.md", "05_對戰系統/05-04_凝固對峙_Boss戰.md": "04_核心玩法/04-10_凝固對峙_Boss戰.md", "05_對戰系統/05-05_權限反擊.md": "04_核心玩法/04-11_權限反擊.md", "05_對戰系統/05-06_對戰整合與配置.md": "04_核心玩法/04-12_遭遇整合與配置.md"};
const productionCategories = ["上部", "下部", "共用"];
const coreCategories = ["探索與調查", "感知與壓力", "怨靈應對"];
const state = {
  documents: [],
  filtered: [],
  folder: "all",
  status: "all",
  query: "",
  view: "cards",
  selected: null,
  category: "all",
};

const $ = (id) => document.getElementById(id);
const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));

function statusClass(status) {
  if (/已完成|✅/.test(status)) return "done";
  if (/骨架|待補|🔨|幕級可製作規格/.test(status)) return "draft";
  return "empty";
}

function classifyStatus(status) {
  if (/已完成|✅/.test(status)) return "已完成";
  if (/骨架|待補|🔨|幕級可製作規格/.test(status)) return "待補完";
  if (/活文件|🔄/.test(status)) return "活文件";
  return "未標記";
}

function refreshState() {
  state.documents.forEach(doc => { if (doc.folder === "08_製作管理") doc.folderLabel = "製作時程提交表"; });
  if (state.folder === "08_製作管理" && !productionCategories.includes(state.category)) state.category = "上部";
  if (state.folder === "04_核心玩法" && !coreCategories.includes(state.category)) state.category = coreCategories[0];
  if (state.folder !== "06_關卡規格" && location.hash.startsWith("#scene=")) { history.replaceState(null,"",location.pathname+location.search); window.sceneReturnId=null; }
  const q = state.query.trim().toLowerCase();
  state.filtered = state.documents.filter((doc) => {
    const inFolder = state.folder === "all" || doc.folder === state.folder;
    const inStatus = state.status === "all" || classifyStatus(doc.status) === state.status;
    const haystack = [doc.title, doc.path, doc.folderLabel, doc.status, doc.summary, doc.content].join(" ").toLowerCase();
    const inCategory = state.category === "all" || doc.category === state.category;
    const visible = !doc.archived && (!doc.weeklyDetail || Boolean(q));
    return inFolder && inStatus && inCategory && visible && (!q || haystack.includes(q));
  });
  state.filtered.sort((a, b) => (a.folder === b.folder && a.folder === "07_視聽與介面") ? avRank(a) - avRank(b) : 0);
  if(state.folder === "04_核心玩法") state.filtered.sort((a,b)=>coreCategories.indexOf(a.category)-coreCategories.indexOf(b.category)||a.path.localeCompare(b.path));
  if (state.folder === "08_製作管理") state.filtered.sort((a,b) => Number(!/08-(?:11|12)_/.test(a.path))-Number(!/08-(?:11|12)_/.test(b.path)) || a.path.localeCompare(b.path));
  renderNav();
  renderHero();
  renderCards();
  renderHeading();
}

function currentDocs() { return state.documents.filter(doc => !doc.archived && (!doc.weeklyDetail || Boolean(state.query.trim()))); }

function renderHero() {
  const total = currentDocs().length;
  const done = currentDocs().filter((doc) => classifyStatus(doc.status) === "已完成").length;
  const draft = currentDocs().filter((doc) => classifyStatus(doc.status) === "待補完").length;
  const folders = new Set(state.documents.map((doc) => doc.folder)).size;
  $("heroStats").innerHTML = `
    <div class="stat"><div class="stat-value">${total}</div><div class="stat-label">Markdown 文件</div></div>
    <div class="stat"><div class="stat-value">${folders}</div><div class="stat-label">企劃分類</div></div>
    <div class="stat"><div class="stat-value">${done}</div><div class="stat-label">已完成</div></div>
    <div class="stat"><div class="stat-value">${draft}</div><div class="stat-label">持續補完</div></div>`;
}

function avRank(doc) {
  return ["分類導覽", "共用規範", "介面與玩法", "製作參考"].indexOf(doc.category);
}

function renderNav() {
  const folderCounts = new Map();
  const statusCounts = new Map();
  currentDocs().forEach((doc) => {
    folderCounts.set(doc.folder, (folderCounts.get(doc.folder) || 0) + 1);
    const status = classifyStatus(doc.status);
    statusCounts.set(status, (statusCounts.get(status) || 0) + 1);
  });
  $("allCount").textContent = currentDocs().length;
  $("allDocs").classList.toggle("active", state.folder === "all" && state.status === "all");
  const folders = [...folderCounts.entries()].sort((a, b) => a[0].localeCompare(b[0], "zh-Hant"));
  $("folderNav").innerHTML = folders.map(([key, count]) => `
    <button class="folder-link ${state.folder === key ? "active" : ""}" data-folder="${esc(key)}" type="button">
      <span class="folder-icon">▱</span><span>${esc(state.documents.find((d) => d.folder === key)?.folderLabel || key)}</span><span class="nav-count">${count}</span>
    </button>`).join("");
  if (state.folder === "07_視聽與介面") {
    const categories = ["all", "共用規範", "製作參考"];
    $("folderNav").innerHTML += `<div class="av-nav" aria-label="視聽與介面類型">${categories.map(key => `<button type="button" class="folder-link ${state.category === key ? "active" : ""}" data-category="${esc(key)}" aria-pressed="${state.category === key}"><span>${key === "all" ? "全部主題" : esc(key)}</span><span class="nav-count">${state.documents.filter(d => d.folder === state.folder && (key === "all" ? !d.archived : d.category === key)).length}</span></button>`).join("")}</div>`;
    document.querySelectorAll("[data-category]").forEach(button => button.addEventListener("click", () => { state.category = button.dataset.category; closeSidebar(); refreshState(); }));
  }
  const order = ["已完成", "活文件", "待補完", "未標記"];
  $("statusNav").innerHTML = order.filter((key) => statusCounts.has(key)).map((key) => `
    <button class="status-link ${state.status === key ? "active" : ""}" data-status="${key}" type="button">
      <span>${key === "已完成" ? "✓" : key === "活文件" ? "◌" : key === "待補完" ? "△" : "·"}</span><span>${key}</span><span class="nav-count">${statusCounts.get(key)}</span>
    </button>`).join("");
  document.querySelectorAll("[data-folder]").forEach((button) => button.addEventListener("click", () => { state.category = "all"; state.folder = button.dataset.folder; state.status = "all"; closeSidebar(); refreshState(); }));
  document.querySelectorAll("[data-status]").forEach((button) => button.addEventListener("click", () => { state.category = "all"; state.status = button.dataset.status; state.folder = "all"; closeSidebar(); refreshState(); }));
}

function renderHeading() {
  const sceneMode = state.folder === "06_關卡規格" && state.view === "cards";
  $("hero").classList.toggle("hidden", sceneMode);
  document.querySelector('[data-view="cards"]').textContent = state.folder === "06_關卡規格" ? "節點" : "卡片";
  const folderLabel = state.folder === "all" ? "全部文件" : (state.documents.find((d) => d.folder === state.folder)?.folderLabel || state.folder);
  const suffix = state.category !== "all" ? ` · ${state.category}` : state.status !== "all" ? ` · ${state.status}` : "";
  $("sectionTitle").textContent = `${folderLabel}${suffix}`;
  $("sectionEyebrow").textContent = sceneMode ? "SCENE CONNECTIONS" : state.query ? "SEARCH RESULTS" : "DOCUMENTS";
  $("resultCount").textContent = sceneMode ? "上下部 · 場景流程" : `${state.filtered.length} 份文件`;
  $("breadcrumbs").innerHTML = `企劃庫 <span>/</span> ${esc(folderLabel)}${state.status !== "all" ? ` <span>/</span> ${esc(state.status)}` : ""}`;
}

function renderCards() {
  const grid = $("documentGrid");
  const sceneMode = state.folder === "06_關卡規格" && state.view === "cards";
  grid.classList.toggle("scene-mode", sceneMode);
  if (sceneMode) {
    $("emptyState").classList.add("hidden");
    window.SceneBrowser.render({root:grid,docs:state.documents.filter(d=>d.folder===state.folder&&!d.archived),allDocs:state.documents,query:state.query,openReader});
    return;
  }
  grid.classList.toggle("list-view", state.view === "list");
  $("emptyState").classList.toggle("hidden", state.filtered.length !== 0);
  const core = state.folder === "04_核心玩法" || state.folder === "08_製作管理";
  const categories = state.folder === "08_製作管理" ? productionCategories : coreCategories;
  const filters = core ? `<div class="core-filters" role="group" aria-label="文件分類">${categories.map(c=>`<button type="button" data-core-category="${esc(c)}" aria-pressed="${state.category===c}">${esc(c)}</button>`).join('')}</div>` : '';
  grid.innerHTML = filters + state.filtered.map((doc) => `
    <article class="doc-card" data-path="${esc(doc.path)}" tabindex="0" role="button" aria-label="開啟 ${esc(documentDisplayTitle(doc.title))}">
      <div class="doc-card-top"><span class="doc-folder">${esc(doc.category || doc.folderLabel)}</span><span class="doc-status ${statusClass(doc.status)}">${esc(classifyStatus(doc.status))}</span></div>
      <h3 class="doc-title">${esc(documentDisplayTitle(doc.title))}</h3>
      <p class="doc-summary">${esc(doc.summary)}</p>
      <div class="doc-meta"><span class="doc-path">${esc(doc.path)}</span><span>${esc(doc.updated || "—")}</span></div>
    </article>`).join("");
  grid.querySelectorAll("[data-core-category]").forEach(b=>b.onclick=()=>{state.category=b.dataset.coreCategory;refreshState();});
  grid.querySelectorAll(".doc-card").forEach((card) => {
    card.addEventListener("click", () => openReader(card.dataset.path));
    card.addEventListener("keydown", (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); openReader(card.dataset.path); } });
  });
}

function imageAssetUrl(href) {
  // Resolve against the selected Markdown document, never the viewer page.
  try {
    if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(href)) return null;
    const base = new URL(state.selected?.path || "README.md", "https://docs.invalid/");
    const resolved = new URL(href, base);
    if (!/\.(?:png|jpe?g|webp|gif)$/i.test(resolved.pathname)) return null;
    return `assets/${resolved.pathname.slice(1)}`;
  } catch (_) { return null; }
}

function inlineMarkdown(value) {
  let html = esc(value);
  html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (match, alt, href) => {
    const url = imageAssetUrl(href);
    return url ? `<a class="md-image-link" href="${url}" target="_blank" rel="noreferrer"><img alt="${alt}" src="${url}" loading="lazy" decoding="async" /></a>` : `<span>${alt}</span>`;
  });
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (match, label, href) => {
    const asset = imageAssetUrl(href);
    if (asset) return `<a href="${asset}" target="_blank" rel="noreferrer">${label}</a>`;
    if (/\.md(?:#.*)?$/i.test(href) || href.startsWith("../")) {
      const file = href.split("#")[0].replace(/^\.\.\//, "");
      const target = state.documents.find((doc) => doc.path === file || doc.path.endsWith(file));
      label = documentDisplayTitle(label) || (target ? esc(documentDisplayTitle(target.title)) : label);
      const headingRef = href.includes("#") ? href.slice(href.indexOf("#") + 1) : "";
      let heading = headingRef;
      try { heading = decodeURIComponent(headingRef); } catch (_) { /* Keep a literal heading if not encoded. */ }
      const docHref = target ? `#doc=${encodeURIComponent(target.path)}${heading ? `&amp;heading=${encodeURIComponent(heading)}` : ""}` : "";
      if (target && target.folder === "06_關卡規格") return `<a href="${docHref}" target="_blank" rel="noopener noreferrer" data-scene-source="true" aria-label="${label}（另開視窗或分頁）">${label}</a>`;
      if (target?.weeklyDetail) return `<a href="${docHref}" target="_blank" rel="noopener noreferrer" data-week-detail="true" aria-label="${label}（另開新視窗）">${label}</a>`;
      return target ? `<a href="${docHref}" data-doc-link="${esc(target.path)}" data-doc-heading="${esc(heading)}">${label}</a>` : `<span>${label}</span>`;
    }
    return `<a href="${href}" target="_blank" rel="noreferrer">${label}</a>`;
  });
  const styleText = (text) => {
    const code = [];
    let styled = text.replace(/`([^`]+)`/g, (match, content) => {
      const token = `\u0000CODE${code.length}\u0000`;
      code.push(`<code>${content}</code>`);
      return token;
    });
    styled = styled.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    styled = styled.replace(/__([^_]+)__/g, "<strong>$1</strong>");
    styled = styled.replace(/\*([^*]+)\*/g, "<em>$1</em>");
    styled = styled.replace(/_([^_]+)_/g, "<em>$1</em>");
    return styled.replace(/\u0000CODE(\d+)\u0000/g, (match, index) => code[Number(index)]);
  };
  html = html.split(/(<[^>]+>)/g).map((part) => part.startsWith("<") ? part : styleText(part)).join("");
  return html;
}

function renderMarkdown(raw) {
  const lines = raw.replace(/\r\n/g, "\n").split("\n");
  const out = [];
  let i = 0;
  let paragraph = [];
  let listType = null;
  let table = null;
  let code = null;

  const flushParagraph = () => { if (paragraph.length) { out.push(`<p>${inlineMarkdown(paragraph.join(" "))}</p>`); paragraph = []; } };
  const closeList = () => { if (listType) { out.push(`</${listType}>`); listType = null; } };
  const closeTable = () => { if (table) { out.push(`</tbody></table></div>`); table = null; } };
  const closeCode = () => { if (code !== null) { out.push(`<pre><code>${esc(code.join("\n"))}</code></pre>`); code = null; } };

  while (i < lines.length) {
    const line = lines[i];
    if (code !== null) { if (/^\s*(?:```|~~~)/.test(line)) closeCode(); else code.push(line); i += 1; continue; }
    if (/^\s*(?:```|~~~)/.test(line)) { flushParagraph(); closeList(); closeTable(); code = []; i += 1; continue; }
    if (/^\s*---\s*$/.test(line)) { flushParagraph(); closeList(); closeTable(); out.push("<hr>"); i += 1; continue; }
    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) { flushParagraph(); closeList(); closeTable(); const level = heading[1].length; out.push(`<h${level}>${inlineMarkdown(documentDisplayTitle(heading[2]))}</h${level}>`); i += 1; continue; }
    if (/^\s*>/.test(line)) { flushParagraph(); closeList(); closeTable(); const quote = []; while (i < lines.length && /^\s*>/.test(lines[i])) { quote.push(lines[i].replace(/^\s*>\s?/, "")); i += 1; } out.push(`<blockquote>${renderMarkdown(quote.join("\n"))}</blockquote>`); continue; }
    if (/^\s*\|/.test(line)) {
      flushParagraph(); closeList();
      if (!table) {
        const header = line.split("|").slice(1, -1).map((cell) => `<th>${inlineMarkdown(cell.trim())}</th>`).join("");
        table = true; out.push(`<div class="md-table-wrap"><table><thead><tr>${header}</tr></thead><tbody>`); i += 1;
        if (i < lines.length && /^\s*\|?\s*:?-{2,}/.test(lines[i])) i += 1;
        continue;
      }
      const cells = line.split("|").slice(1, -1).map((cell) => `<td>${inlineMarkdown(cell.trim())}</td>`).join(""); out.push(`<tr>${cells}</tr>`); i += 1; continue;
    }
    if (table) closeTable();
    const list = line.match(/^\s*([-*+] |\d+\. )(.+)$/);
    if (list) {
      flushParagraph(); if (!listType) { listType = /^\d/.test(list[1]) ? "ol" : "ul"; out.push(`<${listType}>`); }
      const checked = list[2].match(/^\[([ xX])\]\s*(.*)$/); const text = checked ? checked[2] : list[2];
      const cls = checked ? (checked[1].toLowerCase() === "x" ? "task-done" : "task-open") : "";
      out.push(`<li class="${cls}">${inlineMarkdown(text)}</li>`); i += 1; continue;
    }
    if (!line.trim()) { flushParagraph(); closeList(); closeTable(); i += 1; continue; }
    closeList(); paragraph.push(line.trim()); i += 1;
  }
  flushParagraph(); closeList(); closeTable(); closeCode();
  return out.join("\n");
}

function openReader(path, updateHash = true, headingText = "") {
  path = documentAliases[path] || path;
  let doc = state.documents.find((item) => item.path === path);
  if (doc?.archived) {
    const links = [...doc.content.matchAll(/\[[^\]]+\]\(([^)]+\.md)\)/g)];
    if (links.length === 1) {
      const name = links[0][1].split('/').pop();
      doc = state.documents.find(item => item.path.endsWith('/' + name)) || doc;
    }
  }
  if (!doc) return;
  const previousScene = new URLSearchParams(location.hash.slice(1)).get("scene");
  if (previousScene) window.sceneReturnId = previousScene;
  else if (state.folder !== "06_關卡規格") window.sceneReturnId = null;
  state.selected = doc;
  $("readerPath").textContent = `${doc.folderLabel} / ${documentDisplayTitle(doc.title)}`;
  // Front matter is useful metadata for cards and filters, but not part of the
  // reading flow. Keep the body clean while preserving support for plain .md.
  const body = doc.content.startsWith("---")
    ? doc.content.replace(/^---\s*\n[\s\S]*?\n---\s*\n?/, "")
    : doc.content;
  $("readerContent").innerHTML = renderMarkdown(body);
  const headings = [...$("readerContent").querySelectorAll("h2")];
  if (headings.length > 3) {
    const nav = document.createElement("nav");
    nav.className = "reader-toc";
    nav.setAttribute("aria-label", "章節跳轉");
    headings.forEach((heading, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = heading.textContent;
      button.addEventListener("click", () => { heading.tabIndex = -1; heading.focus({preventScroll: true}); heading.scrollIntoView({block: "start"}); });
      nav.appendChild(button);
    });
    $("readerContent").prepend(nav);
  }

  $("readerOverlay").classList.remove("hidden");
  $("readerOverlay").setAttribute("aria-hidden", "false");
  document.querySelector(".reader-panel").scrollTop = 0;
  document.body.style.overflow = "hidden";
  if (headingText) {
    headingText = documentDisplayTitle(headingText);
    const target = [...$("readerContent").querySelectorAll("h1,h2,h3,h4")].find(h => h.textContent === headingText || h.textContent.startsWith(headingText + " ") || h.textContent.startsWith(headingText + "：") || h.textContent.toLowerCase().replace(/[*`]/g, "").replace(/[^\p{L}\p{N}_\- ]/gu, "").replace(/ /g, "-") === headingText);
    if (target) requestAnimationFrame(() => { target.tabIndex=-1; target.focus({preventScroll:true}); target.scrollIntoView({block:"start"}); });
  }
  if (updateHash) history.replaceState(null, "", `#doc=${encodeURIComponent(path)}${headingText ? `&heading=${encodeURIComponent(headingText)}` : ""}`);
  $("readerContent").querySelectorAll("[data-scene-source], [data-week-detail]").forEach((link) => link.addEventListener("click", (event) => {
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button !== 0) return;
    event.preventDefault();
    window.open(link.href, "_blank", "noopener,noreferrer");
  }));
  $("readerContent").querySelectorAll("[data-doc-link]").forEach((link) => link.addEventListener("click", (event) => { event.preventDefault(); openReader(link.dataset.docLink, true, link.dataset.docHeading || ""); }));
}

function closeReader() {
  state.selected = null;
  $("readerOverlay").classList.add("hidden");
  $("readerOverlay").setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";
  const scene = window.sceneReturnId;
  history.replaceState(null, "", scene ? `#scene=${encodeURIComponent(scene)}` : location.pathname + location.search);
}

function syncHash() {
  const value = new URLSearchParams(location.hash.slice(1));
  if (value.has("scene")) {
    state.selected = null;
    $("readerOverlay").classList.add("hidden");
    $("readerOverlay").setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
    window.sceneReturnId = value.get("scene");
    state.folder="06_關卡規格";state.view="cards";
    document.querySelectorAll(".view-button").forEach(b=>b.classList.toggle("active",b.dataset.view===state.view));
    renderNav();renderHeading();renderCards();return;
  }
  const path = documentAliases[value.get("doc")] || value.get("doc");
  if (path && state.documents.some((doc) => doc.path === path)) openReader(path, false, value.get("heading") || "");
}

async function loadDocuments() {
  $("documentGrid").innerHTML = `<div class="empty-state"><div class="empty-icon">…</div><h3>正在讀取企劃文件</h3><p>掃描目前資料夾中的 Markdown。</p></div>`;
  try {
    // Local server keeps live filesystem scanning. GitHub Pages receives the
    // generated static payload from the Actions build step.
    const forceStatic = new URLSearchParams(location.search).has("static");
    const local = ["localhost", "127.0.0.1", "::1"].includes(location.hostname) && !forceStatic;
    const endpoint = local ? `/api/docs?ts=${Date.now()}` : `docs.json?ts=${Date.now()}`;
    const response = await fetch(endpoint, { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    state.documents = (data.documents || []).map(doc => {
      const category = doc.category || (doc.content || "").match(/^導覽分類:\s*(.+)$/m)?.[1]?.trim() || "";
      return {...doc, summary: (doc.content || "").match(/^摘要:\s*(.+)$/m)?.[1]?.trim() || doc.summary, folderLabel: doc.folder === "06_關卡規格" ? "關卡流程" : doc.folderLabel, category: category === "類型圖文" ? "介面與玩法" : category === "製作交接" ? "製作參考" : category, weeklyDetail: /^導覽層級:\s*每週細表\s*$/m.test(doc.content || ""), archived: category === "批次存檔"};
    });
    try { await window.SceneBrowser.load(); } catch(error) { console.warn(error.message); }
    if (new URLSearchParams(location.hash.slice(1)).has("scene")) state.folder="06_關卡規格";
    refreshState();
    syncHash();
  } catch (error) {
    $("documentGrid").innerHTML = `<div class="empty-state"><div class="empty-icon">!</div><h3>無法讀取文件</h3><p>${esc(error.message)}。請確認是透過 preview.bat 開啟，而不是直接雙擊 HTML。</p></div>`;
  }
}

function closeSidebar() { $("sidebar").classList.remove("open"); }

$("allDocs").addEventListener("click", () => { state.category = "all"; state.folder = "all"; state.status = "all"; closeSidebar(); refreshState(); });
$("searchInput").addEventListener("input", (event) => { state.query = event.target.value; refreshState(); });
$("refreshButton").addEventListener("click", loadDocuments);
$("closeReader").addEventListener("click", closeReader);
$("readerBackdrop").addEventListener("click", closeReader);
$("menuButton").addEventListener("click", () => $("sidebar").classList.toggle("open"));
$("copyPath").addEventListener("click", async () => { if (!state.selected) return; try { await navigator.clipboard.writeText(state.selected.path); $("copyPath").textContent = "✓"; setTimeout(() => { $("copyPath").textContent = "⧉"; }, 1000); } catch (_) {} });
document.querySelectorAll(".view-button").forEach((button) => button.addEventListener("click", () => { state.view = button.dataset.view; document.querySelectorAll(".view-button").forEach((item) => item.classList.toggle("active", item === button)); renderCards(); renderHeading(); }));
document.addEventListener("keydown", (event) => { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") { event.preventDefault(); $("searchInput").focus(); } if (event.key === "Escape" && state.selected) closeReader(); });
window.addEventListener("hashchange", syncHash);
loadDocuments();
