/**
 * glob.js — a small, dependency-free glob matcher and directory walker.
 *
 * Supports the subset that actually matters for a file linter:
 *   *      any run of characters except /
 *   ?      one character except /
 *   **     any number of path segments
 *   {a,b}  alternation
 *   [abc]  character class
 *
 * Deliberately not a full fnmatch. A linter that pulls in a glob library and
 * its 30 transitive dependencies to find *.md files is not worth installing.
 */

import { readdirSync, statSync, existsSync } from 'node:fs';
import { join, resolve, relative, sep, posix } from 'node:path';

/** Convert a glob to an anchored RegExp. */
export function globToRegExp(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*') {
      if (glob[i + 1] === '*') {
        // '**/' consumes zero or more segments; bare '**' consumes the rest.
        if (glob[i + 2] === '/') { re += '(?:[^/]*(?:/|$))*'; i += 2; }
        else { re += '.*'; i += 1; }
      } else {
        re += '[^/]*';
      }
    } else if (c === '?') {
      re += '[^/]';
    } else if (c === '{') {
      const close = glob.indexOf('}', i);
      if (close === -1) { re += '\\{'; continue; }
      const alts = glob.slice(i + 1, close).split(',');
      re += '(?:' + alts.map((a) => a.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*')).join('|') + ')';
      i = close;
    } else if (c === '[') {
      const close = glob.indexOf(']', i);
      if (close === -1) { re += '\\['; continue; }
      re += glob.slice(i, close + 1);
      i = close;
    } else if ('.+^$()|\\'.includes(c)) {
      re += '\\' + c;
    } else {
      re += c;
    }
  }
  return new RegExp('^' + re + '$');
}

const toPosix = (p) => p.split(sep).join(posix.sep);

export function matches(relPath, globs) {
  const p = toPosix(relPath);
  return globs.some((g) => globToRegExp(toPosix(g)).test(p));
}

/** True when the glob contains no wildcard metacharacters. */
export function isLiteral(g) { return !/[*?{[]/.test(g); }

/**
 * Expand patterns into a sorted, de-duplicated list of file paths.
 *
 * A literal path is taken as-is (a file, or a directory to walk with
 * `include`). A wildcard pattern is matched against a walk of `cwd`.
 */
export function expand(patterns, { cwd = process.cwd(), include = [], exclude = [] } = {}) {
  const root = resolve(cwd);
  const out = new Set();
  const excluded = (rel) => exclude.length > 0 && matches(rel, exclude);

  const walk = (dir, test) => {
    let entries;
    try { entries = readdirSync(dir, { withFileTypes: true }); }
    catch { return; }
    for (const e of entries) {
      const full = join(dir, e.name);
      const rel = toPosix(relative(root, full));
      if (!rel || rel.startsWith('..')) continue;
      if (e.isDirectory()) {
        // Prune whole trees early: excluding node_modules must not mean
        // walking node_modules and rejecting each file individually.
        if (excluded(rel) || excluded(rel + '/')) continue;
        walk(full, test);
      } else if (e.isFile()) {
        if (excluded(rel)) continue;
        if (test(rel)) out.add(full);
      }
    }
  };

  const wildcards = [];
  for (const p of patterns) {
    if (isLiteral(p)) {
      const full = resolve(root, p);
      if (!existsSync(full)) continue;
      const st = statSync(full);
      if (st.isFile()) {
        const rel = toPosix(relative(root, full));
        if (!excluded(rel)) out.add(full);
      } else if (st.isDirectory()) {
        const globs = include.length ? include : ['**/*'];
        walk(full, (rel) => matches(rel, globs) || matches(posix.basename(rel), globs));
      }
    } else {
      wildcards.push(p);
    }
  }
  if (wildcards.length) walk(root, (rel) => matches(rel, wildcards));

  return [...out].sort();
}
