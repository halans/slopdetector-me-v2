import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const CLI = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'cli.js');
const FIX = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');

/** Run the CLI and return { status, stdout, stderr }. Never throws. */
function run(args, opts = {}) {
  const r = spawnSync(process.execPath, [CLI, ...args], {
    encoding: 'utf8',
    env: { ...process.env, NO_COLOR: '1' },
    ...opts
  });
  return { status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}

test('exit 0: --help and --version', () => {
  const h = run(['--help']);
  assert.equal(h.status, 0);
  assert.match(h.stdout, /USAGE/);
  assert.match(h.stdout, /never use output from this tool as evidence/i);

  const v = run(['--version']);
  assert.equal(v.status, 0);
  assert.match(v.stdout.trim(), /^\d+\.\d+\.\d+$/);
});

test('exit 0: a clean file produces no findings', () => {
  const r = run([join(FIX, 'clean.md'), '--no-config']);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /nothing flagged/);
});

test('exit 1: errors in a file with chatbot artifacts', () => {
  const r = run([join(FIX, 'artifact.md'), '--no-config']);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /Chatbot tool artifacts/);
  assert.match(r.stdout, /Model self-identification/);
  assert.match(r.stdout, /Unfilled placeholders/);
});

test('exit 1: threshold gate fires independently of rules', () => {
  const under = run([join(FIX, 'clean.md'), '--no-config', '--threshold', '90']);
  assert.equal(under.status, 0);
  const over = run([join(FIX, 'clean.md'), '--no-config', '--threshold', '1']);
  assert.equal(over.status, 1);
  assert.match(over.stdout, /over threshold/);
});

test('exit 1: --max-warnings is enforced', () => {
  const base = ['--no-config', '--rule', 'off:emoji_formatting',
    '--rule', 'off:collaborative_scaffolding', '--rule', 'off:knowledge_cutoff'];
  assert.equal(run([join(FIX, 'slop.md'), ...base, '--max-warnings', '100']).status, 0);
  assert.equal(run([join(FIX, 'slop.md'), ...base, '--max-warnings', '1']).status, 1);
});

test('exit 2: unknown option, unknown rule, bad --rule syntax', () => {
  const a = run(['--nope']);
  assert.equal(a.status, 2);
  assert.match(a.stderr, /Unknown option/);

  const b = run(['--only', 'not_a_rule']);
  assert.equal(b.status, 2);
  assert.match(b.stderr, /Unknown rule/);

  const c = run(['--rule', 'shout:tool_artifacts']);
  assert.equal(c.status, 2);
  assert.match(c.stderr, /--rule expects/);

  const d = run(['--threshold', 'high']);
  assert.equal(d.status, 2);
  assert.match(d.stderr, /expects a number/);
});

test('exit 2: no files matched, and missing config file', () => {
  const a = run(['no/such/**/*.md', '--no-config']);
  assert.equal(a.status, 2);
  assert.match(a.stderr, /no files matched/);

  const b = run([join(FIX, 'clean.md'), '-c', 'definitely-missing.json']);
  assert.equal(b.status, 2);
  assert.match(b.stderr, /Config file not found/);
});

test('--quiet suppresses warnings and can flip the exit code', () => {
  const loud = run([join(FIX, 'slop.md'), '--no-config', '--only', 'significance_statements']);
  assert.equal(loud.status, 0, 'warnings alone do not fail without --max-warnings');
  assert.match(loud.stdout, /Significance and legacy inflation/);

  const quiet = run([join(FIX, 'slop.md'), '--no-config', '--only', 'significance_statements', '--quiet']);
  assert.equal(quiet.status, 0);
  assert.doesNotMatch(quiet.stdout, /Significance and legacy inflation/);
});

test('--stdin lints piped text', () => {
  const r = run(['--stdin', '--no-config', '--stdin-filename', 'draft.md'], {
    input: 'It stands as a testament to the enduring legacy of the work.\n'
  });
  assert.match(r.stdout, /draft\.md/);
  assert.match(r.stdout, /Significance and legacy inflation/);
});

test('json reporter emits valid, parseable JSON', () => {
  const r = run([join(FIX, 'artifact.md'), '--no-config', '--format', 'json']);
  assert.equal(r.status, 1);
  const d = JSON.parse(r.stdout);
  assert.equal(d.version, 1);
  assert.equal(d.summary.errors, 5);
  assert.equal(d.summary.failed, true);
  assert.ok(d.disclaimer.includes('Not evidence of authorship'));
  const f = d.results[0].findings[0];
  assert.ok(f.ruleId && f.line > 0 && f.column > 0 && f.match);
});

test('sarif reporter emits schema-shaped output', () => {
  const r = run([join(FIX, 'artifact.md'), '--no-config', '--format', 'sarif']);
  const d = JSON.parse(r.stdout);
  assert.equal(d.version, '2.1.0');
  const run0 = d.runs[0];
  assert.equal(run0.tool.driver.name, 'ai-text-patterns');
  assert.equal(run0.tool.driver.rules.length, 20);
  assert.ok(run0.results.length > 0);
  const loc = run0.results[0].locations[0].physicalLocation;
  assert.ok(loc.artifactLocation.uri && loc.region.startLine > 0);
});

test('github reporter emits workflow commands with escaped properties', () => {
  const r = run([join(FIX, 'artifact.md'), '--no-config', '--format', 'github']);
  const lines = r.stdout.trim().split('\n');
  assert.ok(lines.every((l) => l.startsWith('::')));
  assert.ok(lines.some((l) => /^::error file=.*,line=\d+,col=\d+/.test(l)));
  assert.ok(lines.at(-1).startsWith('::notice'));
  // No raw newlines may survive inside a command.
  assert.ok(!lines.some((l) => /::.*\n/.test(l)));
});

test('rules subcommand lists all rules', () => {
  const r = run(['rules']);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /20 rules, 95 patterns/);
  assert.match(r.stdout, /rule_of_three ships off/);
});

test('code fences are ignored unless --no-mask-code is passed', () => {
  const dir = mkdtempSync(join(tmpdir(), 'slop-fence-'));
  try {
    const f = join(dir, 'a.md');
    writeFileSync(f, 'Ordinary line.\n\n```\nIt stands as a testament to the enduring legacy.\n```\n');
    assert.equal(run([f, '--no-config', '--only', 'significance_statements']).stdout.includes('testament'), false);
    assert.ok(run([f, '--no-config', '--no-mask-code', '--only', 'significance_statements']).stdout.includes('testament'));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('config file is discovered by walking up from the cwd', () => {
  const dir = mkdtempSync(join(tmpdir(), 'slop-cfg-'));
  try {
    writeFileSync(join(dir, '.sloprc.json'), JSON.stringify({
      include: ['**/*.md'],
      rules: { significance_statements: 'off', tool_artifacts: 'error' }
    }));
    const sub = join(dir, 'deep');
    execFileSync('mkdir', ['-p', sub]);
    writeFileSync(join(sub, 'doc.md'),
      'It stands as a testament to design :contentReference[oaicite:1]{index=1}\n');

    const r = run(['doc.md'], { cwd: sub });
    assert.equal(r.status, 1);
    assert.doesNotMatch(r.stdout, /Significance and legacy inflation/, 'rc rule must disable it');
    assert.match(r.stdout, /Chatbot tool artifacts/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('package.json aiTextPatterns key is honoured, and bad rules exit 2', () => {
  const dir = mkdtempSync(join(tmpdir(), 'slop-pkg-'));
  try {
    writeFileSync(join(dir, 'doc.md'), 'It stands as a testament to design.\n');
    writeFileSync(join(dir, 'package.json'), JSON.stringify({
      name: 'x', version: '1.0.0', aiTextPatterns: { rules: { significance_statements: 'error' } }
    }));
    const ok = run(['doc.md'], { cwd: dir });
    assert.equal(ok.status, 1, 'config promoted the rule to error');

    writeFileSync(join(dir, 'package.json'), JSON.stringify({
      name: 'x', version: '1.0.0', aiTextPatterns: { rules: { bogus_rule: 'error' } }
    }));
    const bad = run(['doc.md'], { cwd: dir });
    assert.equal(bad.status, 2, 'invalid config must not be silently ignored');
    assert.match(bad.stderr, /Unknown rule "bogus_rule"/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('init writes a config and refuses to overwrite it', () => {
  const dir = mkdtempSync(join(tmpdir(), 'slop-init-'));
  try {
    const first = run(['init'], { cwd: dir });
    assert.equal(first.status, 0);
    assert.ok(existsSync(join(dir, '.sloprc.json')));
    const second = run(['init'], { cwd: dir });
    assert.equal(second.status, 2);
    assert.match(second.stderr, /already exists/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('globs and directory arguments resolve to the same file set', () => {
  const a = JSON.parse(run(['test/fixtures', '--no-config', '--format', 'json'],
    { cwd: join(dirname(fileURLToPath(import.meta.url)), '..') }).stdout);
  const b = JSON.parse(run(['test/**/*.md', '--no-config', '--format', 'json'],
    { cwd: join(dirname(fileURLToPath(import.meta.url)), '..') }).stdout);
  assert.deepEqual(
    a.results.map((r) => r.filePath).sort(),
    b.results.map((r) => r.filePath).sort()
  );
  assert.equal(a.results.length, 3);
});

test('--exclude prunes matched paths', () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const r = JSON.parse(run(
    ['test/**/*.md', '--no-config', '--exclude', '**/slop.md', '--format', 'json'],
    { cwd: root }
  ).stdout);
  assert.equal(r.results.length, 2);
  assert.ok(!r.results.some((x) => x.filePath.endsWith('slop.md')));
});
