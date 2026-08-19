/**
 * node.js — generic Node/serverless handler.
 *
 * Works as a Vercel function (`export default handler`), a Netlify function,
 * or anything else that passes Node-style (req, res).
 *
 * Vercel:  place a re-export at api/lint.js and set `"type": "module"`.
 * Netlify: wrap with @netlify/functions' `builder` or use the Express adapter.
 */
import { handle, LIMITS } from './core.js';

export default async function handler(req, res) {
  const url = new URL(req.url || '/', `http://${req.headers?.host || 'localhost'}`);

  let rawBody = null;
  if ((req.method || 'GET').toUpperCase() === 'POST') {
    // Some platforms pre-parse JSON bodies; honour that when present.
    if (typeof req.body === 'string') rawBody = req.body;
    else if (req.body && typeof req.body === 'object') rawBody = JSON.stringify(req.body);
    else rawBody = await readBody(req, LIMITS.maxBodyBytes);
  }

  if (rawBody === TOO_LARGE) {
    res.statusCode = 413;
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.setHeader('access-control-allow-origin', '*');
    res.end(JSON.stringify({ error: { code: 'body_too_large',
      message: `Request body exceeds ${LIMITS.maxBodyBytes} bytes.` } }, null, 2));
    return;
  }

  const out = handle({ method: req.method, path: url.pathname, query: url.searchParams, rawBody });
  res.statusCode = out.status;
  for (const [k, v] of Object.entries(out.headers)) res.setHeader(k, v);
  res.end(out.body);
}

export const TOO_LARGE = Symbol('too_large');

export function readBody(req, maxBytes) {
  return new Promise((resolve) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > maxBytes) { resolve(TOO_LARGE); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', () => resolve(''));
  });
}
