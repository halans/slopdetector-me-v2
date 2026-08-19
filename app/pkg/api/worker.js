/**
 * worker.js — Cloudflare Worker entry point.
 *
 *   npx wrangler deploy
 *
 * No KV, no D1, no bindings: the linter is pure computation, so the Worker is
 * stateless and runs comfortably inside the free tier's CPU budget.
 *
 * PRIVACY: nothing is written anywhere. There is deliberately no analytics
 * binding and no logging of request bodies.
 */
import { handle, LIMITS } from './core.js';

export default {
  async fetch(request) {
    const url = new URL(request.url);

    // Reject oversized uploads before reading the body into memory.
    const declared = Number(request.headers.get('content-length') || 0);
    if (declared > LIMITS.maxBodyBytes) {
      return new Response(
        JSON.stringify({ error: { code: 'body_too_large', message:
          `Request body is ${declared} bytes; the limit is ${LIMITS.maxBodyBytes}.` } }, null, 2),
        { status: 413, headers: { 'content-type': 'application/json; charset=utf-8',
                                  'access-control-allow-origin': '*' } }
      );
    }

    let rawBody = null;
    if (request.method === 'POST') {
      try { rawBody = await request.text(); }
      catch { rawBody = ''; }
    }

    const res = handle({
      method: request.method,
      path: url.pathname,
      query: url.searchParams,
      rawBody
    });

    // 204 and 304 must carry a null body: passing even an empty string throws
    // in a spec-compliant fetch implementation.
    const outBody = res.status === 204 || res.status === 304 ? null : res.body;
    return new Response(outBody, { status: res.status, headers: res.headers });
  }
};
