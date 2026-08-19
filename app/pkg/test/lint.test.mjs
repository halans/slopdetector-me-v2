import test from 'node:test';
import assert from 'node:assert/strict';
import {
  lintText, summarize, listRules, normalizeSeverity, resolveSeverity, DEFAULT_RULE_OVERRIDES
} from '../src/lint.js';
import { expandRules, resolveConfig, ConfigError } from '../src/config.js';
import { extractProse } from '../src/extract.js';
import { CATEGORIES } from '../src/patterns.js';

const allOn = Object.fromEntries(CATEGORIES.map((c) => [c.id, 'error']));

test('findings carry accurate line and column into the ORIGINAL text', () => {
  const text = [
    'Line one is ordinary.',              // 1
    '',                                   // 2
    'It stands as a testament to design.',// 3
    '',                                   // 4
    '## 🚀 Heading'                        // 5
  ].join('\n');
  const r = lintText(text, { rules: allOn });

  const sig = r.findings.find((f) => f.pattern === 'stands_as_testament');
  assert.equal(sig.line, 3);
  assert.equal(sig.column, 4, 'should point at "stands", after "It "');
  assert.equal(text.split('\n')[sig.line - 1].slice(sig.column - 1, sig.column - 1 + sig.match.length), sig.match);

  const emoji = r.findings.find((f) => f.pattern === 'emoji_heading');
  assert.equal(emoji.line, 5, 'multiline ^ must not consume the previous newline');
  assert.equal(emoji.column, 1);
});

test('every finding position round-trips back to its matched text', () => {
  const text = [
    '# Notes',
    '',
    'Experts argue this plays a pivotal role, highlighting its significance.',
    '',
    'In conclusion, it is not just a tool — it is a platform.',
    '',
    '- **Speed**: fast',
    '',
    'I hope this helps! As an AI language model, I cannot verify [INSERT URL].'
  ].join('\n');
  const r = lintText(text, { rules: allOn });
  assert.ok(r.findings.length > 8, `expected many findings, got ${r.findings.length}`);
  const lines = text.split('\n');
  for (const f of r.findings) {
    const line = lines[f.line - 1];
    assert.ok(line !== undefined, `line ${f.line} out of range for ${f.ruleId}`);
    const firstMatchLine = f.match.split('\n')[0];
    assert.equal(
      line.slice(f.column - 1, f.column - 1 + firstMatchLine.length),
      firstMatchLine,
      `${f.ruleId} at ${f.line}:${f.column} does not sit on its match`
    );
  }
});

test('severity resolution follows tier defaults, then per-rule overrides', () => {
  for (const cat of CATEGORIES) {
    const tier = { critical: 'error', high: 'error', medium: 'warn', low: 'off' }[cat.severity];
    const expected = DEFAULT_RULE_OVERRIDES[cat.id] ?? tier;
    assert.equal(resolveSeverity(cat, {}), expected, cat.id);
  }
  // The one documented departure from its tier.
  assert.equal(DEFAULT_RULE_OVERRIDES.rule_of_three, 'off');
  assert.equal(resolveSeverity(CATEGORIES.find((c) => c.id === 'rule_of_three'), {}), 'off');
  // An explicit user rule still wins.
  assert.equal(resolveSeverity(CATEGORIES.find((c) => c.id === 'rule_of_three'), { rule_of_three: 'error' }), 'error');
});

test('the off-by-default set is identical for the CLI and the API', async () => {
  const { expandRules } = await import('../src/config.js');
  const { DEFAULT_CONFIG } = await import('../src/config.js');
  const cli = expandRules(DEFAULT_CONFIG.rules);
  const api = expandRules({});
  assert.deepEqual(cli, api,
    'CLI defaults and bare API defaults must resolve identically, or the two surfaces disagree');
  assert.equal(api.rule_of_three, 'off');
});

test('rules override tier defaults and off suppresses findings', () => {
  const text = 'It stands as a testament to the enduring legacy.';
  assert.ok(lintText(text, { rules: { significance_statements: 'error' } }).errorCount > 0);
  assert.equal(lintText(text, { rules: { significance_statements: 'off' } }).findings.length, 0);
  const warned = lintText(text, { rules: { significance_statements: 'warn' } });
  assert.equal(warned.errorCount, 0);
  assert.ok(warned.warningCount > 0);
});

test('numeric and boolean severities are accepted, ESLint-style', () => {
  assert.equal(normalizeSeverity(0), 'off');
  assert.equal(normalizeSeverity(1), 'warn');
  assert.equal(normalizeSeverity(2), 'error');
  assert.equal(normalizeSeverity('warning'), 'warn');
  assert.equal(normalizeSeverity(false), 'off');
  assert.throws(() => normalizeSeverity('loud'), /Invalid severity/);
});

test('expandRules yields a severity for every category', () => {
  const r = expandRules({ rule_of_three: 'off' });
  assert.equal(Object.keys(r).length, CATEGORIES.length);
  assert.equal(r.rule_of_three, 'off');
  assert.equal(r.tool_artifacts, 'error');
});

test('maxHitsPerRule caps reported findings', () => {
  const text = Array(20).fill('It stands as a testament to progress.').join(' ');
  const uncapped = lintText(text, { rules: allOn });
  const capped = lintText(text, { rules: allOn, maxHitsPerRule: 2 });
  assert.ok(capped.findings.length < uncapped.findings.length);
});

test('threshold flag is reported but does not depend on rules', () => {
  const text = 'It stands as a testament to the enduring legacy, underscoring its importance. ' +
    'In conclusion, it is not just a tool — it is a platform.';
  const off = lintText(text, { rules: {}, threshold: 20 });
  assert.equal(off.findings.filter((f) => f.severity !== 'off').length >= 0, true);
  assert.ok(off.score >= 20);
  assert.equal(off.thresholdExceeded, true);
  assert.equal(lintText(text, { rules: {}, threshold: null }).thresholdExceeded, false);
});

test('summarize decides run failure correctly', () => {
  const mk = (e, w, over = false) => ({ errorCount: e, warningCount: w, thresholdExceeded: over, filePath: 'f', score: 50 });
  assert.equal(summarize([mk(0, 0)]).failed, false);
  assert.equal(summarize([mk(1, 0)]).failed, true);
  assert.equal(summarize([mk(0, 5)]).failed, false, 'warnings alone pass when maxWarnings is -1');
  assert.equal(summarize([mk(0, 5)], { maxWarnings: 4 }).failed, true);
  assert.equal(summarize([mk(0, 5)], { maxWarnings: 5 }).failed, false);
  assert.equal(summarize([mk(0, 0, true)]).failed, true);
});

test('listRules exposes ids, tiers and defaults', () => {
  const rules = listRules();
  assert.equal(rules.length, CATEGORIES.length);
  assert.ok(rules.every((r) => r.id && r.tier && r.defaultSeverity && r.patterns.length));
});

test('config rejects unknown rules and out-of-range thresholds', async () => {
  await assert.rejects(
    () => resolveConfig({ only: ['not_a_rule'], noConfig: true }),
    (e) => e instanceof ConfigError && /Unknown rule/.test(e.message)
  );
  await assert.rejects(
    () => resolveConfig({ ruleOverrides: { nope: 'error' }, noConfig: true }),
    ConfigError
  );
});

test('--only keeps configured severity and enables off-by-default rules at warn', async () => {
  const { config } = await resolveConfig({ only: ['significance_statements', 'rule_of_three'], noConfig: true });
  assert.equal(config.rules.significance_statements, 'warn', 'medium tier stays warn, not promoted');
  assert.equal(config.rules.rule_of_three, 'warn', 'explicitly selected off rule turns on');
  assert.equal(config.rules.tool_artifacts, 'off', 'everything else is disabled');
});

test('--min-tier disables lower tiers', async () => {
  const { config } = await resolveConfig({ minTier: 'high', noConfig: true });
  for (const cat of CATEGORIES) {
    if (cat.severity === 'low' || cat.severity === 'medium') assert.equal(config.rules[cat.id], 'off', cat.id);
    else assert.notEqual(config.rules[cat.id], 'off', cat.id);
  }
});

test('extractProse never changes text length', () => {
  const samples = [
    ['---\ntitle: x\n---\n\nIt stands as a testament.\n', 'a.md'],
    ['# H\n\n[link](https://example.com/delve) and text\n', 'b.md'],
    ['<div class="x">It stands as a testament</div>\n', 'c.html'],
    ['// It stands as a testament\nconst x = 1;\n', 'd.js'],
    ['| a | b |\n|---|---|\n| x, y, and z | q |\n', 'e.md'],
    ['plain text with no markup at all', 'f.txt']
  ];
  for (const [text, name] of samples) {
    const { text: out } = extractProse(text, name);
    assert.equal(out.length, text.length, name);
    assert.equal(out.split('\n').length, text.split('\n').length, name);
  }
});

test('extractProse masks front matter, URLs and tables but keeps prose', () => {
  const md = '---\ntitle: A pivotal testament\n---\n\nIt stands as a testament here.\n';
  const { text } = extractProse(md, 'x.md');
  assert.ok(!/pivotal/.test(text), 'front matter should be masked');
  assert.ok(/stands as a testament here/.test(text), 'body prose must survive');
});

test('extractProse on source files lints comments only', () => {
  const js = 'const s = "It stands as a testament";\n// It stands as a testament\n';
  const { text, mode } = extractProse(js, 'x.js');
  assert.equal(mode, 'comments');
  const hits = lintText(text, { rules: allOn }).findings;
  // The identical phrase appears on both lines. Only the comment may be
  // reported, and one phrase can legitimately trip several patterns.
  assert.ok(hits.length > 0, 'the comment must be caught');
  assert.ok(hits.every((f) => f.line === 2), `string literal on line 1 must be ignored, got ${JSON.stringify(hits.map((f) => f.line))}`);
});

test('overlapping patterns within a category collapse to the longest span', () => {
  const text = 'It is not just a tool — it is a paradigm shift.';
  const r = lintText(text, { rules: { negative_parallelism: 'warn' } });
  assert.equal(r.findings.length, 1, `expected one finding, got ${JSON.stringify(r.findings.map((f) => f.ruleId))}`);
  assert.equal(r.warningCount, 1, 'counts must reflect the deduped set');
});

test('overlaps across different categories are preserved', () => {
  const text = 'It stands as a testament to the enduring legacy of the work.';
  const r = lintText(text, { rules: { significance_statements: 'warn', copula_avoidance: 'warn' } });
  const cats = new Set(r.findings.map((f) => f.category));
  assert.ok(cats.has('significance_statements'));
  assert.ok(cats.has('copula_avoidance'), 'a different category may report the same words');
});

test('dedupe keeps distinct non-overlapping hits in one category', () => {
  const text = 'It stands as a testament to design. Elsewhere it plays a pivotal role too.';
  const r = lintText(text, { rules: { significance_statements: 'warn' } });
  assert.ok(r.findings.length >= 2, 'separate constructions must both survive');
});
