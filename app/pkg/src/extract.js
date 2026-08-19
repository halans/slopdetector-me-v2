/**
 * extract.js — reduce a file to the prose worth linting, without moving any
 * character offsets.
 *
 * Everything here blanks unwanted regions in place (same length, newlines
 * intact) rather than deleting them, so a match index still maps to the right
 * line and column of the file on disk. That is the whole contract.
 */

import { extname } from 'node:path';

const blank = (m) => m.replace(/[^\n]/g, ' ');

/** YAML / TOML front matter at the very start of a file. */
function maskFrontMatter(t) {
  return t
    .replace(/^---\r?\n[\s\S]*?\r?\n---(?=\r?\n|$)/, blank)
    .replace(/^\+\+\+\r?\n[\s\S]*?\r?\n\+\+\+(?=\r?\n|$)/, blank);
}

/** Markdown link/image targets: keep the label, blank the URL. */
function maskUrls(t) {
  return t
    .replace(/\]\(([^)\s]+)(\s+"[^"]*")?\)/g, (m) => blank(m))
    .replace(/^\s*\[[^\]]+\]:\s*\S+.*$/gm, blank)          // reference defs
    .replace(/<https?:\/\/[^>]+>/g, blank)
    .replace(/https?:\/\/\S+/g, blank);
}

/** HTML comments and tags, plus script/style bodies. */
function maskHtml(t) {
  return t
    .replace(/<!--[\s\S]*?-->/g, blank)
    .replace(/<script\b[\s\S]*?<\/script>/gi, blank)
    .replace(/<style\b[\s\S]*?<\/style>/gi, blank)
    .replace(/<\/?[a-zA-Z][^>]*>/g, blank);
}

/** Markdown tables: mostly data, and a rich source of false triads. */
function maskTables(t) {
  return t.replace(/^\|.*\|[ \t]*$/gm, blank);
}

/** Line-comment and block-comment bodies, for source files. */
function extractComments(t) {
  const out = t.split('');
  const keep = new Set();
  const re = /\/\*[\s\S]*?\*\/|(?:^|[^:])\/\/[^\n]*|^\s*#[^\n]*/gm;
  for (const m of t.matchAll(re)) {
    for (let i = m.index; i < m.index + m[0].length; i++) keep.add(i);
  }
  for (let i = 0; i < out.length; i++) if (!keep.has(i) && out[i] !== '\n') out[i] = ' ';
  return out.join('');
}

export const PROSE_EXTENSIONS = new Set([
  '.md', '.mdx', '.markdown', '.mdown', '.txt', '.rst', '.adoc', '.org'
]);
export const HTML_EXTENSIONS = new Set(['.html', '.htm', '.vue', '.svelte']);
export const CODE_EXTENSIONS = new Set([
  '.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx', '.py', '.rb', '.go', '.rs',
  '.java', '.c', '.h', '.cpp', '.cs', '.php', '.sh', '.yml', '.yaml'
]);

/**
 * @param {string} text
 * @param {string} filePath
 * @param {object} [opts]
 * @param {boolean} [opts.commentsOnly]  force source-comment extraction
 * @returns {{text:string, mode:string}}  same length as input
 */
export function extractProse(text, filePath = '', opts = {}) {
  const ext = extname(filePath).toLowerCase();
  const raw = String(text);

  if (opts.commentsOnly || (!opts.commentsOnly && CODE_EXTENSIONS.has(ext))) {
    return { text: extractComments(raw), mode: 'comments' };
  }
  if (HTML_EXTENSIONS.has(ext)) {
    return { text: maskUrls(maskHtml(raw)), mode: 'html' };
  }
  if (ext === '.mdx' || ext === '.md' || ext === '.markdown' || ext === '.mdown') {
    return { text: maskTables(maskUrls(maskHtml(maskFrontMatter(raw)))), mode: 'markdown' };
  }
  return { text: maskUrls(maskFrontMatter(raw)), mode: 'text' };
}

/** Should this path be linted at all, absent an explicit pattern? */
export function isLintable(filePath) {
  const ext = extname(filePath).toLowerCase();
  return PROSE_EXTENSIONS.has(ext) || HTML_EXTENSIONS.has(ext) || CODE_EXTENSIONS.has(ext);
}
