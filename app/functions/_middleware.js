/**
 * _middleware.js — Cloudflare Pages Function for about.slopdetector.me.
 *
 * Content negotiation for AI agents: a request for the article that prefers
 * `text/markdown` over `text/html` gets served public/index.md instead of
 * public/index.html, at the same canonical URL. Human browsers (which send
 * `Accept: text/html,...`) are unaffected.
 *
 * `index.md` is already published at /index.md and linked from index.html
 * via <link rel="alternate" type="text/markdown">; this just lets an agent
 * get it without knowing that second URL exists, by asking with an Accept
 * header the way HTTP intends.
 */

const DOCUMENT_PATHS = new Set(['/', '/index.html']);

export async function onRequest(context) {
  const { request, next, env } = context;
  const url = new URL(request.url);

  if (!DOCUMENT_PATHS.has(url.pathname)) {
    return next();
  }

  if (prefersMarkdown(request.headers.get('Accept'))) {
    const mdRequest = new Request(new URL('/index.md', url), request);
    const mdResponse = await env.ASSETS.fetch(mdRequest);
    const headers = new Headers(mdResponse.headers);
    headers.set('Content-Type', 'text/markdown; charset=utf-8');
    headers.set('Vary', 'Accept');
    return new Response(mdResponse.body, { status: mdResponse.status, headers });
  }

  const response = await next();
  const headers = new Headers(response.headers);
  headers.set('Vary', 'Accept');
  return new Response(response.body, { status: response.status, headers });
}

/**
 * True when the Accept header's q-value for text/markdown is >= its
 * q-value for text/html (html defaults to 0 when absent, so a bare
 * "Accept: text/markdown" counts). Browsers send an explicit text/html
 * entry, so this only fires for clients that ask for markdown on purpose.
 */
function prefersMarkdown(accept) {
  if (!accept) return false;

  let mdQ = -1;
  let htmlQ = 0;

  for (const part of accept.split(',')) {
    const [rawType, ...params] = part.trim().split(';');
    const type = rawType.trim().toLowerCase();
    let q = 1;
    for (const param of params) {
      const match = param.trim().match(/^q=([\d.]+)$/);
      if (match) q = parseFloat(match[1]);
    }
    if (type === 'text/markdown' || type === 'text/x-markdown') mdQ = Math.max(mdQ, q);
    else if (type === 'text/html') htmlQ = Math.max(htmlQ, q);
  }

  return mdQ >= 0 && mdQ >= htmlQ;
}
