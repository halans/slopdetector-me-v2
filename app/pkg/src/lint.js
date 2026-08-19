/**
 * lint.js — turn pattern matches into positioned, severity-resolved findings.
 *
 * The library's scoreText gives a document-level view. A linter needs the
 * opposite: individual findings with a file, line, column, rule id, severity,
 * and enough context to print. This module provides that, and resolves each
 * finding's severity through the ESLint-style `rules` config.
 */

import {
  CATEGORIES, normalize, maskCode, lineIndex, wordCount, TYPOGRAPHY_METRICS
} from './patterns.js';

export const SEVERITY_RANK = { off: 0, warn: 1, error: 2 };
const CAT_BY_ID = new Map(CATEGORIES.map((c) => [c.id, c]));

/**
 * Lint a single text.
 *
 * @param {string} text
 * @param {object} opts
 * @param {string} [opts.filePath]              label used in reports
 * @param {Record<string,string>} opts.rules    categoryId -> off|warn|error
 * @param {boolean} [opts.maskCodeSpans=true]
 * @param {number|null} [opts.threshold=null]   document score gate
 * @param {number} [opts.maxHitsPerRule=0]      0 = unlimited
 * @returns {{filePath:string, score:number, band:string, wordCount:number,
 *            findings:Array, errorCount:number, warningCount:number,
 *            thresholdExceeded:boolean, metrics:object}}
 */
export function lintText(text, opts = {}) {
  const {
    filePath = '<text>',
    rules = {},
    maskCodeSpans = true,
    threshold = null,
    maxHitsPerRule = 0
  } = opts;

  const raw = String(text);
  const working = maskCodeSpans ? maskCode(raw) : raw;
  const norm = normalize(working);
  const idx = lineIndex(raw);

  const findings = [];
  let errorCount = 0;
  let warningCount = 0;

  for (const cat of CATEGORIES) {
    const sev = resolveSeverity(cat, rules);
    if (sev === 'off') continue;

    // Emoji and structural patterns need the un-normalised text; everything
    // else matches the folded form. Both are the same length as `raw`.
    const structural = cat.id === 'emoji_formatting' || cat.id === 'formatting_tells';
    const target = structural ? working : norm;

    let n = 0;
    for (const p of cat.patterns) {
      for (const m of target.matchAll(p.re)) {
        if (maxHitsPerRule && n >= maxHitsPerRule) break;
        n++;
        // Some patterns legitimately begin with a sentence terminator or
        // leading whitespace (e.g. `[.!?]\s+` before "In conclusion"). Point
        // the reported position at the first meaningful character instead, so
        // an editor jumping to line:column lands on the phrase itself.
        const rawLead = /^[.!?]?\s*/.exec(m[0])[0].length;
        const lead = rawLead < m[0].length ? rawLead : 0;
        const start = m.index + lead;
        const { line, column } = idx.locate(start);
        // The reported match must be exactly the text at the reported
        // position, otherwise an editor's jump-to-line lands off the phrase.
        const shown = m[0].slice(lead).trim();
        findings.push({
          filePath,
          ruleId: `${cat.id}/${p.id}`,
          category: cat.id,
          categoryLabel: cat.label,
          pattern: p.id,
          severity: sev,
          tier: cat.severity,
          line,
          column,
          endColumn: column + shown.split('\n')[0].length,
          offset: start,
          match: shown,
          text: idx.lineText(line),
          message: `${cat.label}: ${JSON.stringify(truncate(shown, 60))}`,
          help: cat.why,
          caution: cat.caution
        });
        if (sev === 'error') errorCount++; else warningCount++;
      }
    }
  }

  findings.sort((a, b) => a.line - b.line || a.column - b.column);

  const deduped = dedupeOverlaps(findings);
  errorCount = deduped.filter((f) => f.severity === 'error').length;
  warningCount = deduped.filter((f) => f.severity === 'warn').length;

  // Document-level score, from the library's own weighting.
  const { score, band, metrics } = scoreOnly(raw, working, norm);
  const thresholdExceeded = threshold != null && score >= threshold;

  return {
    filePath,
    score,
    band,
    wordCount: wordCount(norm),
    findings: deduped,
    errorCount,
    warningCount,
    thresholdExceeded,
    metrics
  };
}

/**
 * Several patterns in one category often describe the same construction from
 * different angles: "not just X — it's Y" trips three negative_parallelism
 * patterns at once. Reporting all three tells the reader nothing extra and
 * inflates counts that CI gates on, so keep the longest span per overlapping
 * group. Overlaps ACROSS categories are kept: those are genuinely different
 * observations about the same words.
 */
export function dedupeOverlaps(findings) {
  const byCategory = new Map();
  for (const f of findings) {
    if (!byCategory.has(f.category)) byCategory.set(f.category, []);
    byCategory.get(f.category).push(f);
  }
  const keep = [];
  for (const group of byCategory.values()) {
    // Longest first, so the most specific span claims the region.
    const ordered = [...group].sort((a, b) => b.match.length - a.match.length);
    const claimed = [];
    for (const f of ordered) {
      const start = f.offset, end = f.offset + f.match.length;
      if (claimed.some(([s, e]) => start < e && end > s)) continue;
      claimed.push([start, end]);
      keep.push(f);
    }
  }
  return keep.sort((a, b) => a.line - b.line || a.column - b.column || a.ruleId.localeCompare(b.ruleId));
}

/**
 * Resolve a category's configured severity.
 * Precedence: explicit user rule > per-rule default override > tier default.
 */
export function resolveSeverity(cat, rules = {}) {
  const explicit = rules[cat.id];
  if (explicit != null) return normalizeSeverity(explicit);
  if (DEFAULT_RULE_OVERRIDES[cat.id] != null) {
    return normalizeSeverity(DEFAULT_RULE_OVERRIDES[cat.id]);
  }
  return normalizeSeverity(DEFAULT_TIER_SEVERITY[cat.severity] ?? 'off');
}

export const DEFAULT_TIER_SEVERITY = {
  critical: 'error',
  high: 'error',
  medium: 'warn',
  low: 'off'
};

/**
 * Per-rule departures from the tier default. This lives in the library, not in
 * the CLI's config defaults, so that every surface — CLI, API, and the inlined
 * page engine — resolves the same severity for the same input. Putting it in
 * one consumer's defaults is how the CLI and the API silently disagreed.
 *
 * rule_of_three is a `medium` rule but ships `off`: it matched 94% of the
 * documents in the human control corpus, against 83% of the LLM documents.
 * By density it still carries a 4.4x lift, so it is kept and opt-in rather
 * than deleted.
 */
export const DEFAULT_RULE_OVERRIDES = {
  rule_of_three: 'off'
};

export function normalizeSeverity(v) {
  if (v === 0 || v === '0' || v === false || v === 'off') return 'off';
  if (v === 1 || v === '1' || v === 'warn' || v === 'warning') return 'warn';
  if (v === 2 || v === '2' || v === true || v === 'error') return 'error';
  throw new Error(`Invalid severity: ${JSON.stringify(v)} (use off|warn|error or 0|1|2)`);
}

/* Score the document without duplicating the per-finding walk above. */
function scoreOnly(raw, working, norm) {
  const words = wordCount(norm) || 1;
  let rawScore = 0;
  for (const cat of CATEGORIES) {
    const structural = cat.id === 'emoji_formatting' || cat.id === 'formatting_tells';
    const target = structural ? working : norm;
    const seen = new Set();
    for (const p of cat.patterns) {
      for (const m of target.matchAll(p.re)) seen.add(m[0].trim().toLowerCase());
    }
    if (seen.size) rawScore += Math.min(cat.cap, seen.size * cat.weight);
  }
  const metrics = {
    emDash: TYPOGRAPHY_METRICS.emDashRate(raw),
    quotes: TYPOGRAPHY_METRICS.curlyQuotes(raw),
    burstiness: TYPOGRAPHY_METRICS.burstiness(norm),
    paragraphs: TYPOGRAPHY_METRICS.paragraphUniformity(norm)
  };
  if (metrics.emDash.flag) rawScore += 6;
  if (metrics.burstiness.flag) rawScore += 6;
  if (metrics.paragraphs.flag) rawScore += 4;
  if (metrics.quotes.flag) rawScore += 2;

  const lengthFactor = Math.min(1.6, Math.max(0.6, 500 / Math.max(words, 120)));
  const score = Math.max(0, Math.min(100, Math.round(rawScore * lengthFactor)));
  const band =
    score >= 65 ? 'strong LLM register'
      : score >= 35 ? 'mixed signals'
        : score >= 15 ? 'faint traces'
          : 'no meaningful signal';
  return { score, band, metrics };
}

/** Aggregate several file results into a run summary. */
export function summarize(results, { maxWarnings = -1 } = {}) {
  const errorCount = results.reduce((a, r) => a + r.errorCount, 0);
  const warningCount = results.reduce((a, r) => a + r.warningCount, 0);
  const overThreshold = results.filter((r) => r.thresholdExceeded);
  const failed =
    errorCount > 0 ||
    overThreshold.length > 0 ||
    (maxWarnings >= 0 && warningCount > maxWarnings);
  return {
    fileCount: results.length,
    errorCount,
    warningCount,
    overThreshold: overThreshold.map((r) => ({ filePath: r.filePath, score: r.score })),
    maxWarnings,
    failed
  };
}

/** Every valid rule id, for config validation and `--print-rules`. */
export function listRules() {
  return CATEGORIES.map((c) => ({
    id: c.id,
    label: c.label,
    tier: c.severity,
    defaultSeverity: DEFAULT_TIER_SEVERITY[c.severity],
    patterns: c.patterns.map((p) => p.id),
    why: c.why,
    caution: c.caution
  }));
}

export function isKnownRule(id) { return CAT_BY_ID.has(id); }

function truncate(s, n) { return s.length > n ? s.slice(0, n - 1) + '…' : s; }
