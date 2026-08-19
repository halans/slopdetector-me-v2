#!/usr/bin/env node
/**
 * server.js — the npx-runnable local server.
 *
 *   npx ai-text-patterns-serve
 *   npx -p ai-text-patterns slop-serve --port 8080
 *
 * Serves the same API as the Worker, plus a plain-text landing page, plus an
 * optional in-memory rate limiter (which the stateless Worker cannot offer).
 *
 * PRIVACY: the access log records method, path, status and duration only.
 * Request bodies are never written to disk or to stdout.
 */

import { createServer } from 'node:http';
import { handle, LIMITS, accessLogLine, VERSION } from './core.js';
import { readBody, TOO_LARGE } from './node.js';
import { CATEGORIES } from '../src/patterns.js';

function parseArgs(argv) {
  const o = { port: 8787, host: '127.0.0.1', rateLimit: 120, quiet: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => {
      if (i + 1 >= argv.length) { console.error(`error: ${a} requires a value`); process.exit(2); }
      return argv[++i];
    };
    if (a === '--port' || a === '-p') o.port = Number(next());
    else if (a === '--host') o.host = next();
    else if (a === '--rate-limit') o.rateLimit = Number(next());
    else if (a === '--no-rate-limit') o.rateLimit = 0;
    else if (a === '--quiet' || a === '-q') o.quiet = true;
    else if (a === '--help' || a === '-h') { help(); process.exit(0); }
    else if (a === '--version') { console.log(VERSION); process.exit(0); }
    else { console.error(`error: unknown option ${a}`); process.exit(2); }
  }
  if (!Number.isFinite(o.port) || o.port < 1 || o.port > 65535) {
    console.error('error: --port must be a valid port number'); process.exit(2);
  }
  return o;
}

function help() {
  console.log(`
slop-serve — run the SlopDetector API locally

USAGE
  npx -p ai-text-patterns slop-serve [options]

OPTIONS
  -p, --port <n>          port to listen on          (default 8787)
      --host <addr>       address to bind            (default 127.0.0.1)
      --rate-limit <n>    requests per minute per IP (default 120, 0 disables)
      --no-rate-limit     disable rate limiting
  -q, --quiet             do not print an access log
  -h, --help              this text
      --version           print version

ROUTES
  GET  /                  route list
  GET  /health            liveness
  GET  /v1/rules          rule catalogue
  POST /v1/lint           positioned findings + score
  POST /v1/score          score, band and metrics only
  GET  /openapi.json      OpenAPI 3.1 document

EXAMPLE
  curl -s localhost:8787/v1/lint -H 'content-type: application/json' \\
    -d '{"text":"It stands as a testament to the enduring legacy."}' | jq .

  Binds to 127.0.0.1 by default, so it is not reachable from the network.
  Pass --host 0.0.0.0 deliberately if you want that.
`.trim());
}

/* ---- naive fixed-window rate limiter, adequate for a local dev server ---- */
function makeLimiter(perMinute) {
  const hits = new Map();
  return function check(ip) {
    if (!perMinute) return true;
    const now = Date.now();
    const windowStart = now - 60_000;
    const arr = (hits.get(ip) || []).filter((t) => t > windowStart);
    if (arr.length >= perMinute) { hits.set(ip, arr); return false; }
    arr.push(now);
    hits.set(ip, arr);
    // Opportunistic cleanup so the map cannot grow without bound.
    if (hits.size > 5000) {
      for (const [k, v] of hits) if (!v.some((t) => t > windowStart)) hits.delete(k);
    }
    return true;
  };
}

const opts = parseArgs(process.argv.slice(2));
const limiter = makeLimiter(opts.rateLimit);

const server = createServer(async (req, res) => {
  const started = Date.now();
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const ip = req.socket.remoteAddress || 'unknown';

  const send = (status, headers, body) => {
    res.statusCode = status;
    for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
    res.end(body);
    if (!opts.quiet) {
      console.log(accessLogLine({
        method: req.method, path: url.pathname, status, ms: Date.now() - started
      }));
    }
  };

  const jsonErr = (status, code, message) => send(
    status,
    { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': '*' },
    JSON.stringify({ error: { code, message } }, null, 2)
  );

  if (!limiter(ip)) {
    return jsonErr(429, 'rate_limited',
      `Too many requests. Limit is ${opts.rateLimit} per minute per IP.`);
  }

  let rawBody = null;
  if ((req.method || 'GET').toUpperCase() === 'POST') {
    rawBody = await readBody(req, LIMITS.maxBodyBytes);
    if (rawBody === TOO_LARGE) {
      return jsonErr(413, 'body_too_large', `Request body exceeds ${LIMITS.maxBodyBytes} bytes.`);
    }
  }

  const out = handle({
    method: req.method, path: url.pathname, query: url.searchParams, rawBody
  });
  send(out.status, out.headers, out.body);
});

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.error(`error: port ${opts.port} is already in use. Try --port ${opts.port + 1}.`);
    process.exit(2);
  }
  console.error(`error: ${e.message}`);
  process.exit(2);
});

server.listen(opts.port, opts.host, () => {
  const patterns = CATEGORIES.reduce((a, c) => a + c.patterns.length, 0);
  console.log(`SlopDetector API v${VERSION} — ${CATEGORIES.length} categories, ${patterns} patterns`);
  console.log(`listening on http://${opts.host}:${opts.port}`);
  console.log(`rate limit: ${opts.rateLimit ? opts.rateLimit + '/min per IP' : 'disabled'}`);
  console.log('style signals only — not evidence of authorship\n');
});

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => { server.close(() => process.exit(0)); });
}
