import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { handle, LIMITS } from '../api/core.js';
import worker from '../api/worker.js';
import { buildOpenApi } from '../api/openapi.js';
import { CATEGORIES } from '../src/patterns.js';

const CLI = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'cli.js');
const FIX = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');

const post = (path, obj) => handle({
  method: 'POST', path, rawBody: typeof obj === 'string' ? obj : JSON.stringify(obj)
});
const get = (path) => handle({ method: 'GET', path, rawBody: null });
const body = (r) => JSON.parse(r.body);

test('GET routes respond', () => {
  const idx = get('/');
  assert.equal(idx.status, 200);
  assert.equal(body(idx).routes.length, 5);

  const h = get('/health');
  assert.equal(h.status, 200);
  assert.equal(body(h).categories, CATEGORIES.length);

  const rules = get('/v1/rules');
  assert.equal(rules.status, 200);
  assert.equal(body(rules).rules.length, CATEGORIES.length);

  const spec = get('/openapi.json');
  assert.equal(spec.status, 200);
  assert.equal(body(spec).openapi, '3.1.0');
});

test('path normalisation tolerates trailing and doubled slashes', () => {
  assert.equal(get('/v1/rules/').status, 200);
  assert.equal(get('//health').status, 200);
  assert.equal(get('/').status, 200);
});

test('POST /v1/lint returns positioned findings', () => {
  const r = post('/v1/lint', {
    text: 'It stands as a testament to design [cite: 4].\n\nI hope this helps!'
  });
  assert.equal(r.status, 200);
  const d = body(r);
  assert.equal(d.version, 1);
  assert.ok(d.disclaimer.includes('not evidence of authorship') || d.disclaimer.includes('Not evidence'));
  const f = d.results[0].findings;
  assert.ok(f.length >= 3);
  assert.ok(f.every((x) => x.line >= 1 && x.column >= 1 && x.match));
  assert.ok(f.some((x) => x.category === 'tool_artifacts' && x.line === 1));
  assert.ok(f.some((x) => x.category === 'collaborative_scaffolding' && x.line === 3));
});

test('POST /v1/score omits findings but keeps metrics', () => {
  const d = body(post('/v1/score', { text: 'The vines first fruited in 1910 and again in 1911.' }));
  assert.ok(typeof d.score === 'number');
  assert.ok(d.band);
  assert.ok(d.metrics.emDash);
  assert.equal(d.findings, undefined);
});

test('rules override severity, and threshold sets failure', () => {
  const text = 'It stands as a testament to the enduring legacy of design.';
  const off = body(post('/v1/lint', { text, rules: { significance_statements: 'off' } }));
  assert.equal(off.results[0].findings.filter((f) => f.category === 'significance_statements').length, 0);

  const err = body(post('/v1/lint', { text, rules: { significance_statements: 'error' } }));
  assert.ok(err.summary.errors > 0);
  assert.equal(err.summary.failed, true);

  const th = body(post('/v1/lint', { text, threshold: 1 }));
  assert.equal(th.results[0].thresholdExceeded, true);
  assert.equal(th.summary.failed, true);
});

test('extract:true applies filetype masking', () => {
  const text = 'Ordinary line.\n\n```\nIt stands as a testament to design.\n```\n';
  const raw = body(post('/v1/lint', { text, filePath: 'a.md', rules: { significance_statements: 'warn' } }));
  const masked = body(post('/v1/lint', { text, filePath: 'a.md', extract: true, rules: { significance_statements: 'warn' } }));
  // lintText masks code fences by default, so both should ignore the fence.
  assert.equal(raw.results[0].findings.length, 0);
  assert.equal(masked.results[0].findings.length, 0);

  const fm = '---\ntitle: a pivotal testament\n---\n\nPlain sentence.\n';
  const withExtract = body(post('/v1/lint', { text: fm, filePath: 'a.md', extract: true, rules: { significance_statements: 'warn' } }));
  assert.equal(withExtract.results[0].findings.length, 0, 'front matter must be masked');
});

test('validation errors carry stable codes', () => {
  const cases = [
    [post('/v1/lint', {}), 400, 'missing_text'],
    [post('/v1/lint', { text: '   ' }), 400, 'empty_text'],
    [post('/v1/lint', '{not json'), 400, 'invalid_json'],
    [post('/v1/lint', [1, 2]), 400, 'invalid_body'],
    [post('/v1/lint', { text: 'a b c', rules: { nope: 'error' } }), 400, 'unknown_rule'],
    [post('/v1/lint', { text: 'a b c', rules: { tool_artifacts: 'loud' } }), 400, 'invalid_rules'],
    [post('/v1/lint', { text: 'a b c', threshold: 500 }), 400, 'invalid_threshold'],
    [post('/v1/lint', { text: 'a b c', maxHitsPerRule: -1 }), 400, 'invalid_max_hits'],
    [get('/v1/nope'), 404, 'not_found'],
    [post('/health', {}), 404, 'not_found'],
    [handle({ method: 'DELETE', path: '/v1/lint' }), 405, 'method_not_allowed'],
    [post('/v1/lint', { text: 'x '.repeat(LIMITS.maxTextChars) }), 413, 'text_too_large']
  ];
  for (const [res, status, code] of cases) {
    assert.equal(res.status, status, `expected ${status} for ${code}, got ${res.status}`);
    assert.equal(body(res).error.code, code);
  }
});

test('error responses never echo the submitted text back', () => {
  const secret = 'CONFIDENTIAL-DRAFT-abc123';
  const r = post('/v1/lint', `{"text":"${secret}" oops`);
  assert.equal(body(r).error.code, 'invalid_json');
  assert.ok(!r.body.includes(secret), 'the request body must not appear in the error response');
});

test('OPTIONS preflight and CORS headers', () => {
  const p = handle({ method: 'OPTIONS', path: '/v1/lint' });
  assert.equal(p.status, 204);
  assert.equal(p.headers['access-control-allow-origin'], '*');
  assert.match(p.headers['access-control-allow-methods'], /POST/);
  assert.equal(get('/health').headers['access-control-allow-origin'], '*');
});

test('the Cloudflare Worker entry serves the same responses', async () => {
  const res = await worker.fetch(new Request('https://api.example.com/v1/lint', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text: 'It stands as a testament to design.' })
  }));
  assert.equal(res.status, 200);
  const d = await res.json();
  assert.ok(d.results[0].findings.length > 0);
  assert.equal(res.headers.get('access-control-allow-origin'), '*');

  const health = await worker.fetch(new Request('https://api.example.com/health'));
  assert.equal(health.status, 200);

  const pre = await worker.fetch(new Request('https://api.example.com/v1/lint', { method: 'OPTIONS' }));
  assert.equal(pre.status, 204);
});

test('the Worker rejects an oversized declared content-length early', async () => {
  const res = await worker.fetch(new Request('https://api.example.com/v1/lint', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'content-length': String(LIMITS.maxBodyBytes + 1) },
    body: JSON.stringify({ text: 'short' })
  }));
  assert.equal(res.status, 413);
  assert.equal((await res.json()).error.code, 'body_too_large');
});

test('the OpenAPI document enumerates the live rule ids', () => {
  const spec = buildOpenApi();
  const enumIds = spec.paths['/v1/lint'].post.requestBody
    .content['application/json'].schema.properties.rules.propertyNames.enum;
  assert.deepEqual([...enumIds].sort(), CATEGORIES.map((c) => c.id).sort());
  assert.ok(spec.info.description.includes('not** an authorship detector'));
  assert.deepEqual(Object.keys(spec.paths).sort(), ['/health', '/v1/lint', '/v1/rules', '/v1/score']);
});

/* ------------------------------------------------------------------ *
 * The point of the whole exercise: CLI, API and page engine must all
 * agree. The page inlines the same modules, so testing CLI vs API
 * covers the shared contract.
 * ------------------------------------------------------------------ */
test('CLI and API produce identical findings for the same fixture', async () => {
  const { readFileSync } = await import('node:fs');
  const file = join(FIX, 'slop.md');
  const text = readFileSync(file, 'utf8');

  const cli = spawnSync(process.execPath,
    [CLI, file, '--no-config', '--format', 'json'],
    { encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' } });
  const cliJson = JSON.parse(cli.stdout);

  // The CLI applies per-filetype extraction; ask the API for the same.
  const api = body(post('/v1/lint', { text, filePath: 'slop.md', extract: true }));

  const strip = (f) => ({
    ruleId: f.ruleId, category: f.category, severity: f.severity,
    tier: f.tier, line: f.line, column: f.column, match: f.match
  });

  assert.deepEqual(
    api.results[0].findings.map(strip),
    cliJson.results[0].findings.map(strip),
    'API findings must match the CLI exactly'
  );
  assert.equal(api.results[0].score, cliJson.results[0].score, 'scores must match');
  assert.equal(api.summary.errors, cliJson.summary.errors);
  assert.equal(api.summary.warnings, cliJson.summary.warnings);
});
