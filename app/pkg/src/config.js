/**
 * config.js — ESLint-style configuration discovery and merging.
 *
 * Precedence, lowest to highest:
 *   1. built-in defaults (severity tier per category)
 *   2. package.json  "aiTextPatterns": { ... }
 *   3. .sloprc.json / .sloprc / .sloprc.js / .sloprc.mjs  (nearest ancestor)
 *   4. --config <path>
 *   5. individual CLI flags
 */

import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve, isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
import { DEFAULT_TIER_SEVERITY, DEFAULT_RULE_OVERRIDES, normalizeSeverity, isKnownRule } from './lint.js';
import { CATEGORIES } from './patterns.js';

const RC_NAMES = ['.sloprc.json', '.sloprc', '.sloprc.js', '.sloprc.mjs', 'sloprc.json'];

export const DEFAULT_CONFIG = {
  // Files to lint when no positional argument is given.
  include: ['**/*.md', '**/*.mdx', '**/*.markdown', '**/*.txt'],
  exclude: [
    '**/node_modules/**', '**/.git/**', '**/dist/**', '**/build/**',
    '**/coverage/**', '**/vendor/**', '**/CHANGELOG.md', '**/*.min.*'
  ],
  // Per-category severity. Anything absent resolves through
  // DEFAULT_RULE_OVERRIDES then the tier default, both defined in lint.js so
  // the CLI, the API and the page engine cannot disagree.
  rules: {},
  threshold: null,       // document score gate; null disables
  maxWarnings: -1,       // -1 disables
  maskCodeSpans: true,
  maxHitsPerRule: 0,     // 0 = unlimited
  format: 'pretty'
};

export class ConfigError extends Error {}

/** Full effective rules map: every category id -> off|warn|error. */
export function expandRules(rules = {}) {
  const out = {};
  for (const cat of CATEGORIES) {
    const v = rules[cat.id];
    out[cat.id] = v != null
      ? normalizeSeverity(v)
      : normalizeSeverity(
        DEFAULT_RULE_OVERRIDES[cat.id] ?? DEFAULT_TIER_SEVERITY[cat.severity] ?? 'off'
      );
  }
  return out;
}

function validate(cfg, source) {
  for (const key of Object.keys(cfg.rules ?? {})) {
    if (!isKnownRule(key)) {
      throw new ConfigError(
        `Unknown rule "${key}" in ${source}. Run \`slop rules\` to list valid rule ids.`
      );
    }
  }
  for (const [k, v] of Object.entries(cfg.rules ?? {})) {
    try { normalizeSeverity(v); }
    catch (e) { throw new ConfigError(`Rule "${k}" in ${source}: ${e.message}`); }
  }
  if (cfg.threshold != null && (typeof cfg.threshold !== 'number' || cfg.threshold < 0 || cfg.threshold > 100)) {
    throw new ConfigError(`"threshold" in ${source} must be a number 0-100.`);
  }
  if (cfg.format != null && !['pretty', 'json', 'github', 'sarif'].includes(cfg.format)) {
    throw new ConfigError(`"format" in ${source} must be pretty|json|github|sarif.`);
  }
  return cfg;
}

async function loadFile(file) {
  const ext = file.slice(file.lastIndexOf('.'));
  if (ext === '.js' || ext === '.mjs') {
    const mod = await import(pathToFileURL(file).href);
    return validate(mod.default ?? mod, file);
  }
  let parsed;
  try { parsed = JSON.parse(readFileSync(file, 'utf8')); }
  catch (e) { throw new ConfigError(`Could not parse ${file}: ${e.message}`); }
  return validate(parsed, file);
}

/** Walk up from `cwd` looking for an rc file or a package.json key. */
export async function discover(cwd = process.cwd()) {
  let dir = resolve(cwd);
  const found = [];
  for (;;) {
    for (const name of RC_NAMES) {
      const f = join(dir, name);
      if (existsSync(f)) { found.push(await loadFile(f)); return { config: found[0], source: f }; }
    }
    const pkg = join(dir, 'package.json');
    if (existsSync(pkg)) {
      let json = null;
      try { json = JSON.parse(readFileSync(pkg, 'utf8')); }
      catch { /* a malformed package.json is not this tool's problem to report */ }
      if (json?.aiTextPatterns) {
        // validate() throws ConfigError and must NOT be swallowed by the
        // parse guard above — a typo'd rule id has to surface as exit code 2.
        return { config: validate(json.aiTextPatterns, `${pkg} (aiTextPatterns)`), source: pkg };
      }
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return { config: {}, source: null };
}

/**
 * Resolve the effective configuration.
 * @param {object} cliOverrides values already parsed from argv
 * @param {string} [cwd]
 */
export async function resolveConfig(cliOverrides = {}, cwd = process.cwd()) {
  let base = {}, source = null;
  if (cliOverrides.config) {
    const f = isAbsolute(cliOverrides.config) ? cliOverrides.config : resolve(cwd, cliOverrides.config);
    if (!existsSync(f)) throw new ConfigError(`Config file not found: ${cliOverrides.config}`);
    base = await loadFile(f);
    source = f;
  } else if (!cliOverrides.noConfig) {
    const d = await discover(cwd);
    base = d.config; source = d.source;
  }

  const merged = {
    ...DEFAULT_CONFIG,
    ...base,
    rules: { ...DEFAULT_CONFIG.rules, ...(base.rules ?? {}) }
  };

  // CLI flags win over everything.
  if (cliOverrides.threshold !== undefined) merged.threshold = cliOverrides.threshold;
  if (cliOverrides.maxWarnings !== undefined) merged.maxWarnings = cliOverrides.maxWarnings;
  if (cliOverrides.format !== undefined) merged.format = cliOverrides.format;
  if (cliOverrides.maskCodeSpans !== undefined) merged.maskCodeSpans = cliOverrides.maskCodeSpans;
  if (cliOverrides.exclude?.length) merged.exclude = [...merged.exclude, ...cliOverrides.exclude];

  // --only <ids>: disable everything else, but keep each selected rule at the
  // severity it would otherwise have had. Promoting selections to `error`
  // would silently change exit codes just because a user narrowed the run.
  // A selected rule that resolves to `off` is enabled at `warn`, since asking
  // for it explicitly must turn it on.
  if (cliOverrides.only?.length) {
    for (const bad of cliOverrides.only.filter((r) => !isKnownRule(r))) {
      throw new ConfigError(`Unknown rule "${bad}" passed to --only.`);
    }
    const keep = new Set(cliOverrides.only);
    const effective = expandRules(merged.rules);
    merged.rules = Object.fromEntries(CATEGORIES.map((c) => [
      c.id,
      keep.has(c.id) ? (effective[c.id] === 'off' ? 'warn' : effective[c.id]) : 'off'
    ]));
  }
  for (const [id, sev] of Object.entries(cliOverrides.ruleOverrides ?? {})) {
    if (!isKnownRule(id)) throw new ConfigError(`Unknown rule "${id}" passed to --rule.`);
    merged.rules[id] = sev;
  }
  if (cliOverrides.minTier) {
    const order = ['low', 'medium', 'high', 'critical'];
    const floor = order.indexOf(cliOverrides.minTier);
    if (floor < 0) throw new ConfigError(`--min-tier must be one of ${order.join('|')}.`);
    for (const cat of CATEGORIES) {
      if (order.indexOf(cat.severity) < floor) merged.rules[cat.id] = 'off';
    }
  }

  validate(merged, source ?? 'CLI options');
  return { config: { ...merged, rules: expandRules(merged.rules) }, source };
}
