/**
 * core.js — framework-agnostic request handling for the SlopDetector API.
 *
 * Deliberately depends on nothing but the package itself and the Web
 * Request/Response-shaped primitives, so the same logic serves a Cloudflare
 * Worker, a Node server, and a serverless function without forking.
 *
 * PRIVACY: submitted text is never logged, never persisted, and never included
 * in an error message. It exists only for the duration of the call. The only
 * thing any deployment should log is method, path, status, and duration — see
 * `accessLogLine`, which takes no body.
 */

import { lintText, summarize, listRules } from '../src/lint.js';
import { expandRules, ConfigError } from '../src/config.js';
import { CATEGORIES } from '../src/patterns.js';
import { extractProse } from '../src/extract.js';
import { buildOpenApi } from './openapi.js';

export const VERSION = '1.0.0';

export const LIMITS = {
  /** Hard cap on the raw request body. Returns 413 above this. */
  maxBodyBytes: 512 * 1024,
  /** Hard cap on analysed characters. Returns 413 above this. */
  maxTextChars: 200_000
};

const DISCLAIMER =
  'Style signals only. Not evidence of authorship. Published AI detectors show ' +
  'false-positive rates up to 61% on human text by non-native English writers ' +
  '(Liang et al., Patterns 4(7), 2023). Do not use this output in any process ' +
  'where a person bears a cost for being flagged.';

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-headers': 'content-type',
  'access-control-max-age': '86400'
};

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8', ...CORS };

function ok(data, status = 200, extra = {}) {
  return { status, headers: { ...JSON_HEADERS, ...extra }, body: JSON.stringify(data, null, 2) };
}

function fail(status, code, message, extra = {}) {
  return {
    status,
    headers: JSON_HEADERS,
    body: JSON.stringify({ error: { code, message, ...extra } }, null, 2)
  };
}

/**
 * Handle one request.
 *
 * @param {object} req
 * @param {string} req.method
 * @param {string} req.path      pathname only, no query string
 * @param {string|null} req.rawBody
 * @param {URLSearchParams} [req.query]
 * @returns {{status:number, headers:object, body:string}}
 */
export function handle(req) {
  const method = (req.method || 'GET').toUpperCase();
  const path = normalizePath(req.path || '/');

  if (method === 'OPTIONS') return { status: 204, headers: CORS, body: '' };

  if (method === 'GET') {
    switch (path) {
      case '/':          return ok(index());
      case '/health':
      case '/v1/health': return ok({
        status: 'ok',
        version: VERSION,
        categories: CATEGORIES.length,
        patterns: CATEGORIES.reduce((a, c) => a + c.patterns.length, 0)
      });
      case '/v1/rules':  return ok({ version: 1, rules: listRules() });
      case '/openapi.json': return ok(buildOpenApi());
      default: return fail(404, 'not_found', `No route for GET ${path}. See GET / for the route list.`);
    }
  }

  if (method !== 'POST') {
    return fail(405, 'method_not_allowed', `${method} is not supported.`, { allow: 'GET, POST, OPTIONS' });
  }
  if (path !== '/v1/lint' && path !== '/v1/score') {
    return fail(404, 'not_found', `No route for POST ${path}. Use /v1/lint or /v1/score.`);
  }

  // ---- body ----
  const raw = req.rawBody ?? '';
  const bytes = byteLength(raw);
  if (bytes > LIMITS.maxBodyBytes) {
    return fail(413, 'body_too_large',
      `Request body is ${bytes} bytes; the limit is ${LIMITS.maxBodyBytes}.`);
  }

  let payload;
  try {
    payload = raw ? JSON.parse(raw) : {};
  } catch {
    // Note: the malformed body is NOT echoed back. It may contain the user's prose.
    return fail(400, 'invalid_json', 'Request body is not valid JSON.');
  }
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
    return fail(400, 'invalid_body', 'Request body must be a JSON object.');
  }

  const { text, rules, threshold, filePath, maxHitsPerRule, extract } = payload;

  if (typeof text !== 'string') {
    return fail(400, 'missing_text', 'Field "text" is required and must be a string.');
  }
  if (!text.trim()) {
    return fail(400, 'empty_text', 'Field "text" must not be empty.');
  }
  if (text.length > LIMITS.maxTextChars) {
    return fail(413, 'text_too_large',
      `"text" is ${text.length} characters; the limit is ${LIMITS.maxTextChars}.`);
  }
  if (threshold != null && (typeof threshold !== 'number' || threshold < 0 || threshold > 100)) {
    return fail(400, 'invalid_threshold', '"threshold" must be a number between 0 and 100.');
  }
  if (maxHitsPerRule != null && (typeof maxHitsPerRule !== 'number' || maxHitsPerRule < 0)) {
    return fail(400, 'invalid_max_hits', '"maxHitsPerRule" must be a non-negative number.');
  }

  let resolvedRules;
  try {
    resolvedRules = expandRules(rules ?? {});
  } catch (e) {
    if (e instanceof ConfigError || /Invalid severity/.test(e.message)) {
      return fail(400, 'invalid_rules', e.message);
    }
    throw e;
  }
  for (const key of Object.keys(rules ?? {})) {
    if (!CATEGORIES.some((c) => c.id === key)) {
      return fail(400, 'unknown_rule',
        `Unknown rule "${key}". GET /v1/rules lists the valid ids.`);
    }
  }

  const name = typeof filePath === 'string' && filePath ? filePath : 'input';
  // Optional per-filetype masking, matching what the CLI does for that
  // extension. Off by default: an API caller usually posts prose already.
  const source = extract === true ? extractProse(text, name).text : text;

  const result = lintText(source, {
    filePath: name,
    rules: resolvedRules,
    threshold: threshold ?? null,
    maxHitsPerRule: maxHitsPerRule ?? 0
  });

  if (path === '/v1/score') {
    return ok({
      version: 1,
      disclaimer: DISCLAIMER,
      score: result.score,
      band: result.band,
      wordCount: result.wordCount,
      thresholdExceeded: result.thresholdExceeded,
      metrics: result.metrics
    });
  }

  const s = summarize([result], { maxWarnings: -1 });
  return ok({
    version: 1,
    disclaimer: DISCLAIMER,
    summary: {
      files: 1,
      errors: s.errorCount,
      warnings: s.warningCount,
      overThreshold: s.overThreshold,
      failed: s.failed
    },
    results: [{
      filePath: result.filePath,
      score: result.score,
      band: result.band,
      wordCount: result.wordCount,
      errorCount: result.errorCount,
      warningCount: result.warningCount,
      thresholdExceeded: result.thresholdExceeded,
      metrics: result.metrics,
      findings: result.findings.map((f) => ({
        ruleId: f.ruleId, category: f.category, severity: f.severity, tier: f.tier,
        line: f.line, column: f.column, endColumn: f.endColumn,
        match: f.match, message: f.message
      }))
    }]
  });
}

function index() {
  return {
    name: 'SlopDetector API',
    version: VERSION,
    description:
      'Lint prose for the stylistic fingerprints of LLM-generated text. ' +
      'A style linter, not an authorship detector.',
    disclaimer: DISCLAIMER,
    routes: [
      { method: 'GET',  path: '/health',        description: 'Liveness and catalogue size' },
      { method: 'GET',  path: '/v1/rules',      description: 'Rule catalogue with tiers and defaults' },
      { method: 'POST', path: '/v1/lint',       description: 'Positioned findings plus score' },
      { method: 'POST', path: '/v1/score',      description: 'Score, band and metrics only' },
      { method: 'GET',  path: '/openapi.json',  description: 'OpenAPI 3.1 document' }
    ],
    limits: LIMITS,
    privacy: 'Submitted text is not logged, stored, or retained beyond the request.',
    license: 'CC-BY-NC-SA-4.0'
  };
}

/** Collapse duplicate slashes and drop a single trailing slash. */
function normalizePath(p) {
  const s = String(p).replace(/\/{2,}/g, '/');
  return s.length > 1 && s.endsWith('/') ? s.slice(0, -1) : s;
}

function byteLength(s) {
  if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(s).length;
  return Buffer.byteLength(s, 'utf8');
}

/** Body-free access log line. Never pass request content to this. */
export function accessLogLine({ method, path, status, ms }) {
  return `${new Date().toISOString()} ${method} ${path} ${status} ${ms}ms`;
}
