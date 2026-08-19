#!/usr/bin/env node
/**
 * build-tool.mjs — generate the standalone SlopDetector page.
 *
 * The page must be a single self-contained HTML file (published artifacts are
 * sandboxed and cannot import modules), but the engine must remain the SAME
 * code the npm package and CLI use. So we inline pkg/src/patterns.js and
 * pkg/src/lint.js at build time rather than maintaining a second copy.
 * Any divergence becomes impossible by construction.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, '..', 'pkg', 'src');

/** Strip ESM syntax so a module can run inside a classic <script>. */
function declassify(code) {
  return code
    // drop `import { a, b } from './x.js';` including multi-line forms
    .replace(/import\s*\{[\s\S]*?\}\s*from\s*['"][^'"]*['"];?/g, '')
    .replace(/import\s+[\w*\s{},]+\s+from\s*['"][^'"]*['"];?/g, '')
    // drop the default-export convenience object
    .replace(/export\s+default\s+\{[\s\S]*?\};?/g, '')
    .replace(/export\s+default\s+[^\n;]+;?/g, '')
    // `export function foo` -> `function foo`
    .replace(/^export\s+/gm, '');
}

const patterns = declassify(readFileSync(join(src, 'patterns.js'), 'utf8'));
const lint = declassify(readFileSync(join(src, 'lint.js'), 'utf8'));

const engine = `
/* ===================================================================
 * SlopDetector engine — inlined verbatim from the ai-text-patterns
 * npm package at build time. Do not edit here; edit pkg/src/ and rerun
 * tool/build-tool.mjs. Generated ${new Date().toISOString()}
 * =================================================================== */
${patterns}
${lint}
window.SlopEngine = {
  CATEGORIES, lintText, summarize, listRules, dedupeOverlaps,
  normalize, maskCode, lineIndex, wordCount, TYPOGRAPHY_METRICS,
  DEFAULT_TIER_SEVERITY
};
`;

const tpl = readFileSync(join(here, 'tool.template.html'), 'utf8');
if (!tpl.includes('/*__ENGINE__*/')) throw new Error('template is missing the /*__ENGINE__*/ marker');
const html = tpl.replace('/*__ENGINE__*/', () => engine);

const out = join(here, 'public', 'index.html');
writeFileSync(out, html);
console.log(`wrote ${out} — ${(html.length / 1024).toFixed(1)} KB (engine ${(engine.length / 1024).toFixed(1)} KB)`);
