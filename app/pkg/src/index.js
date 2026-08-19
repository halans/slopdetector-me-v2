/**
 * ai-text-patterns — public API.
 *
 * A style linter for the surface fingerprints of LLM-generated English prose.
 * NOT an authorship detector: see README, "Limits".
 */
export {
  CATEGORIES, PATTERN_INDEX, TYPOGRAPHY_METRICS,
  scoreText, matchCategory, normalize, maskCode, lineIndex, wordCount
} from './patterns.js';

export {
  lintText, summarize, listRules, isKnownRule,
  resolveSeverity, normalizeSeverity, DEFAULT_TIER_SEVERITY, DEFAULT_RULE_OVERRIDES, SEVERITY_RANK, dedupeOverlaps
} from './lint.js';

export { resolveConfig, discover, expandRules, DEFAULT_CONFIG, ConfigError } from './config.js';
export { extractProse, isLintable, PROSE_EXTENSIONS } from './extract.js';
export { expand as expandGlobs, globToRegExp, matches as globMatches } from './glob.js';
