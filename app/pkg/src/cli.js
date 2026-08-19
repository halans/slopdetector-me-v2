#!/usr/bin/env node
/**
 * cli.js — `slop` / `ai-text-patterns`
 *
 * Exit codes (stable, for CI):
 *   0  clean
 *   1  lint failure: errors, warnings over --max-warnings, or score >= threshold
 *   2  usage or configuration error
 */

import { readFileSync } from 'node:fs';
import { relative } from 'node:path';
import { CATEGORIES } from './patterns.js';
import { lintText, summarize, listRules } from './lint.js';
import { resolveConfig, ConfigError, DEFAULT_CONFIG } from './config.js';
import { expand } from './glob.js';
import { extractProse } from './extract.js';

const EXIT_OK = 0, EXIT_LINT = 1, EXIT_USAGE = 2;

const REPORTERS = {
  pretty: () => import('./reporters/pretty.js'),
  json: () => import('./reporters/json.js'),
  github: () => import('./reporters/github.js'),
  sarif: () => import('./reporters/sarif.js')
};

const HELP = `
ai-text-patterns — lint prose for the stylistic fingerprints of LLM-generated text

USAGE
  slop [files or globs...]            lint the given paths
  slop                                lint the configured include globs
  slop --stdin [--stdin-filename f]   lint text piped on stdin
  slop rules                          list every rule id and its default
  slop init                           write a starter .sloprc.json

OPTIONS
  -f, --format <name>       pretty | json | github | sarif        (default pretty)
  -t, --threshold <0-100>   fail when a document's score reaches this
      --max-warnings <n>    fail when total warnings exceed n (-1 disables)
      --rule <sev>:<id>     override one rule, repeatable
                            e.g. --rule off:ai_vocabulary --rule error:rule_of_three
      --only <id,id>        enable only these rules, disable all others
      --min-tier <tier>     ignore rules below low|medium|high|critical
      --exclude <glob>      add an exclude pattern, repeatable
  -c, --config <path>       use this config file
      --no-config           ignore all config files
      --no-mask-code        lint inside code fences too
      --max-hits <n>        cap reported hits per rule per file
  -q, --quiet               only report errors, suppress warnings
  -v, --verbose             include typography metrics in pretty output
      --no-color            disable colour
  -h, --help                this text
      --version             print version

EXAMPLES
  slop "docs/**/*.md" --threshold 40
  slop README.md --format json > report.json
  slop . --format github --max-warnings 0
  cat draft.txt | slop --stdin --verbose

NOTE
  This tool reports style signals, not authorship. Published AI detectors show
  false-positive rates up to 61% on human-written text by non-native English
  speakers. Never use output from this tool as evidence against a person.
`;

function parseArgs(argv) {
  const o = {
    paths: [], ruleOverrides: {}, exclude: [], only: [],
    quiet: false, verbose: false, stdin: false
  };
  const need = (i, flag) => {
    if (i + 1 >= argv.length) throw new ConfigError(`${flag} requires a value`);
    return argv[i + 1];
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case '-h': case '--help': o.help = true; break;
      case '--version': o.version = true; break;
      case '-f': case '--format': o.format = need(i, a); i++; break;
      case '-t': case '--threshold': o.threshold = num(need(i, a), a); i++; break;
      case '--max-warnings': o.maxWarnings = num(need(i, a), a); i++; break;
      case '--max-hits': o.maxHitsPerRule = num(need(i, a), a); i++; break;
      case '-c': case '--config': o.config = need(i, a); i++; break;
      case '--no-config': o.noConfig = true; break;
      case '--no-mask-code': o.maskCodeSpans = false; break;
      case '--exclude': o.exclude.push(need(i, a)); i++; break;
      case '--min-tier': o.minTier = need(i, a); i++; break;
      case '--only': o.only.push(...need(i, a).split(',').map((s) => s.trim()).filter(Boolean)); i++; break;
      case '--rule': {
        const v = need(i, a); i++;
        const m = /^(off|warn|error|0|1|2):(.+)$/.exec(v);
        if (!m) throw new ConfigError(`--rule expects <off|warn|error>:<ruleId>, got "${v}"`);
        o.ruleOverrides[m[2]] = m[1];
        break;
      }
      case '-q': case '--quiet': o.quiet = true; break;
      case '-v': case '--verbose': o.verbose = true; break;
      case '--no-color': o.color = false; break;
      case '--color': o.color = true; break;
      case '--stdin': o.stdin = true; break;
      case '--stdin-filename': o.stdinFilename = need(i, a); i++; break;
      default:
        if (a.startsWith('-')) throw new ConfigError(`Unknown option: ${a}`);
        o.paths.push(a);
    }
  }
  return o;
}

function num(v, flag) {
  const n = Number(v);
  if (!Number.isFinite(n)) throw new ConfigError(`${flag} expects a number, got "${v}"`);
  return n;
}

async function readStdin() {
  const chunks = [];
  for await (const c of process.stdin) chunks.push(c);
  return Buffer.concat(chunks).toString('utf8');
}

function printRules() {
  const rows = listRules();
  const w = Math.max(...rows.map((r) => r.id.length));
  console.log('\nrule id'.padEnd(w + 3) + 'tier      default   patterns');
  console.log('-'.repeat(w + 3 + 30));
  for (const r of rows) {
    console.log(
      r.id.padEnd(w + 3) +
      r.tier.padEnd(10) +
      r.defaultSeverity.padEnd(10) +
      r.patterns.length
    );
  }
  console.log(`\n${rows.length} rules, ${rows.reduce((a, r) => a + r.patterns.length, 0)} patterns.`);
  console.log('Defaults: critical/high = error, medium = warn, low = off.');
  console.log('rule_of_three ships off: it matched 94% of the human control corpus.\n');
}

async function main() {
  let opts;
  try { opts = parseArgs(process.argv.slice(2)); }
  catch (e) { console.error(`error: ${e.message}`); return EXIT_USAGE; }

  if (opts.help) { console.log(HELP.trim()); return EXIT_OK; }
  if (opts.version) {
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
    console.log(pkg.version);
    return EXIT_OK;
  }
  if (opts.paths[0] === 'rules') { printRules(); return EXIT_OK; }
  if (opts.paths[0] === 'init') {
    const { writeFileSync, existsSync } = await import('node:fs');
    if (existsSync('.sloprc.json')) { console.error('error: .sloprc.json already exists'); return EXIT_USAGE; }
    writeFileSync('.sloprc.json', JSON.stringify({
      include: DEFAULT_CONFIG.include,
      exclude: DEFAULT_CONFIG.exclude,
      threshold: 45,
      maxWarnings: -1,
      rules: {
        tool_artifacts: 'error',
        ai_self_reference: 'error',
        placeholder_text: 'error',
        collaborative_scaffolding: 'error',
        knowledge_cutoff: 'error',
        emoji_formatting: 'warn',
        significance_statements: 'warn',
        negative_parallelism: 'warn',
        rule_of_three: 'off',
        ai_vocabulary: 'off'
      }
    }, null, 2) + '\n');
    console.log('wrote .sloprc.json');
    return EXIT_OK;
  }

  let config, source;
  try { ({ config, source } = await resolveConfig(opts, process.cwd())); }
  catch (e) {
    console.error(`error: ${e instanceof ConfigError ? e.message : e.stack}`);
    return EXIT_USAGE;
  }

  const results = [];

  if (opts.stdin) {
    const text = await readStdin();
    const name = opts.stdinFilename ?? '<stdin>';
    const { text: prose } = extractProse(text, name);
    results.push(lintText(prose, {
      filePath: name, rules: config.rules, threshold: config.threshold,
      maskCodeSpans: config.maskCodeSpans, maxHitsPerRule: opts.maxHitsPerRule ?? config.maxHitsPerRule
    }));
  } else {
    const patterns = opts.paths.length ? opts.paths : config.include;
    const files = expand(patterns, {
      cwd: process.cwd(), include: config.include, exclude: config.exclude
    });
    if (!files.length) {
      console.error(
        `error: no files matched ${JSON.stringify(patterns)}` +
        (source ? ` (config: ${relative(process.cwd(), source) || source})` : '')
      );
      return EXIT_USAGE;
    }
    for (const f of files) {
      let content;
      try { content = readFileSync(f, 'utf8'); }
      catch (e) { console.error(`warning: could not read ${f}: ${e.message}`); continue; }
      const { text: prose } = extractProse(content, f);
      results.push(lintText(prose, {
        filePath: f, rules: config.rules, threshold: config.threshold,
        maskCodeSpans: config.maskCodeSpans, maxHitsPerRule: opts.maxHitsPerRule ?? config.maxHitsPerRule
      }));
    }
  }

  if (opts.quiet) {
    for (const r of results) {
      r.findings = r.findings.filter((f) => f.severity === 'error');
      r.warningCount = 0;
    }
  }

  const summary = summarize(results, { maxWarnings: config.maxWarnings });

  const reporter = REPORTERS[config.format];
  if (!reporter) { console.error(`error: unknown format "${config.format}"`); return EXIT_USAGE; }
  const { format } = await reporter();
  const out = format(results, summary, { color: opts.color, verbose: opts.verbose });
  if (out) console.log(out);

  return summary.failed ? EXIT_LINT : EXIT_OK;
}

main().then(
  (code) => process.exit(code),
  (err) => { console.error(err?.stack ?? String(err)); process.exit(EXIT_USAGE); }
);
