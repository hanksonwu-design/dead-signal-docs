// Builds the static payload (docs.json) from the Markdown sources in docs/.
//   node tools/build-docs.mjs          -> writes docs.json
//   node tools/build-docs.mjs --check  -> exits 1 if docs.json is out of date
import { readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = fileURLToPath(new URL("..", import.meta.url));
export const DOCS_DIR = join(ROOT, "docs");
const OUTPUT = join(ROOT, "docs.json");

const FOLDER_LABELS = {
  "00_總覽": "總覽",
  "01_世界觀": "世界觀",
  "02_角色": "角色",
  "03_敘事結構": "敘事結構",
  "04_核心玩法": "核心玩法",
  "06_關卡規格": "關卡流程",
  "07_視聽與介面": "視聽與介面",
  "08_製作管理": "製作管理",
};
const ROOT_FOLDER = "根目錄";

function listMarkdown(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listMarkdown(full));
    else if (entry.name.toLowerCase().endsWith(".md")) out.push(full);
  }
  return out;
}

function frontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---\n/);
  const fields = {};
  if (!match) return fields;
  for (const line of match[1].split("\n")) {
    const i = line.indexOf(":");
    if (i > 0) fields[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return fields;
}

function fileTitle(path) {
  return path.split("/").pop().replace(/\.md$/i, "").replace(/_/g, " ");
}

function firstQuote(content) {
  const body = content.replace(/^---\n[\s\S]*?\n---\n/, "");
  return body.match(/^>\s*(.+)$/m)?.[1]?.trim() || "";
}

export function buildDocuments() {
  const files = listMarkdown(DOCS_DIR);
  const documents = files.map(file => {
    const path = relative(DOCS_DIR, file).split(sep).join("/");
    // Normalise line endings so editors that save CRLF do not change the payload.
    const content = readFileSync(file, "utf8").replace(/^﻿/, "").replace(/\r\n/g, "\n");
    const fm = frontmatter(content);
    const folder = path.includes("/") ? path.split("/")[0] : ROOT_FOLDER;
    const category = fm["導覽分類"] || "";
    return {
      path,
      title: fm["文件"] || fileTitle(path),
      folder,
      folderLabel: FOLDER_LABELS[folder] || folder.replace(/^\d+_/, ""),
      category,
      archived: category === "批次存檔",
      status: fm["狀態"] || "",
      updated: fm["更新"] || "",
      summary: fm["摘要"] || firstQuote(content),
      content,
    };
  });
  return documents.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

export function buildPayload() {
  return { generatedAt: new Date().toISOString(), documents: buildDocuments() };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const payload = buildPayload();
  if (process.argv.includes("--check")) {
    const current = existsSync(OUTPUT) ? JSON.parse(readFileSync(OUTPUT, "utf8")).documents : [];
    const same = JSON.stringify(current) === JSON.stringify(payload.documents);
    console.log(same ? "docs.json is up to date" : "docs.json is out of date");
    process.exit(same ? 0 : 1);
  }
  writeFileSync(OUTPUT, JSON.stringify(payload));
  console.log(`docs.json: ${payload.documents.length} documents`);
}
