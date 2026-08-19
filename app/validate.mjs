#!/usr/bin/env node
/**
 * Validate ai-text-patterns.js against two corpora.
 *
 *   corpus-ai.json     29 documented LLM outputs archived by Wikipedia
 *   corpus-human.json  16 Wikipedia articles as they stood in Dec 2017,
 *                      more than four years before ChatGPT shipped
 *
 * Reports per-category hit rates on each corpus, score distributions, and
 * the false-positive rate at each threshold.
 */
import { readFileSync } from 'node:fs';
import { CATEGORIES, scoreText } from './ai-text-patterns.js';

const ai = JSON.parse(readFileSync('corpus-ai.json', 'utf8'));
const human = JSON.parse(readFileSync('corpus-human.json', 'utf8'));
const chat = JSON.parse(readFileSync('corpus-chat.json', 'utf8'));

// ---- 1. self-test: every documented example must match its own pattern ----
let selfFail = 0, selfTotal = 0;
for (const cat of CATEGORIES) {
  for (const p of cat.patterns) {
    for (const ex of p.examples ?? []) {
      selfTotal++;
      const re = new RegExp(p.re.source, p.re.flags);
      if (!re.test(ex)) {
        selfFail++;
        console.log(`  SELF-TEST FAIL  ${cat.id}.${p.id}  <- ${JSON.stringify(ex)}`);
      }
    }
  }
}
console.log(`Self-test: ${selfTotal - selfFail}/${selfTotal} documented examples match their pattern\n`);

// ---- 2. score both corpora ----
const run = (docs) => docs.map((d) => ({ id: d.id, ...scoreText(d.text) }));
const aiR = run(ai), huR = run(human), chR = run(chat);

const stats = (rs) => {
  const s = rs.map((r) => r.score).sort((a, b) => a - b);
  const q = (p) => s[Math.min(s.length - 1, Math.floor(p * s.length))];
  return {
    n: s.length,
    mean: +(s.reduce((a, b) => a + b, 0) / s.length).toFixed(1),
    median: q(0.5), min: s[0], max: s[s.length - 1], p25: q(0.25), p75: q(0.75)
  };
};
console.log('SCORE DISTRIBUTION');
console.table({
  'AI articles': stats(aiR),
  'AI chat-register': stats(chR),
  'Human 2017': stats(huR)
});

// ---- 3. threshold sweep ----
console.log('\nTHRESHOLD SWEEP  (positive = flagged as LLM register)');
const rows = [];
for (const t of [15, 25, 35, 45, 55, 65, 75]) {
  const tp = aiR.filter((r) => r.score >= t).length;
  const fp = huR.filter((r) => r.score >= t).length;
  rows.push({
    threshold: t,
    'recall (AI flagged)': `${tp}/${aiR.length} = ${(100 * tp / aiR.length).toFixed(0)}%`,
    'false positives': `${fp}/${huR.length} = ${(100 * fp / huR.length).toFixed(0)}%`,
    precision: tp + fp ? `${(100 * tp / (tp + fp)).toFixed(0)}%` : '-'
  });
}
console.table(rows);

// ---- 4. per-category discrimination ----
console.log('\nPER-CATEGORY  (docs containing >=1 hit, and hits per 1,000 words)');
const perCat = [];
for (const cat of CATEGORIES) {
  const g = (rs) => {
    const withHit = rs.filter((r) => r.categories.some((c) => c.id === cat.id));
    const hits = rs.reduce((a, r) => a + (r.categories.find((c) => c.id === cat.id)?.count ?? 0), 0);
    const words = rs.reduce((a, r) => a + r.wordCount, 0);
    return { docPct: Math.round(100 * withHit.length / rs.length), per1k: +(1000 * hits / words).toFixed(2) };
  };
  const a = g(aiR), h = g(huR), c = g(chR);
  perCat.push({
    category: cat.id,
    sev: cat.severity,
    'AI art%': a.docPct, 'AI chat%': c.docPct, 'human%': h.docPct,
    'AI /1k': a.per1k, 'human /1k': h.per1k,
    lift: h.per1k > 0 ? +(a.per1k / h.per1k).toFixed(1) : (a.per1k > 0 || c.per1k > 0 ? Infinity : 0)
  });
}
perCat.sort((x, y) => (y.lift === Infinity ? 1e9 : y.lift) - (x.lift === Infinity ? 1e9 : x.lift));
console.table(perCat);

// ---- 5. worst human false positives, for honesty ----
console.log('\nHIGHEST-SCORING HUMAN (2017) DOCUMENTS — these are the false positives');
for (const r of [...huR].sort((a, b) => b.score - a.score).slice(0, 5)) {
  console.log(`  ${r.score.toString().padStart(3)}  ${r.id}`);
  for (const c of r.categories.slice(0, 3)) {
    console.log(`         ${c.id} x${c.count}  e.g. ${JSON.stringify(c.hits[0].match.slice(0, 70))}`);
  }
}

console.log('\nLOWEST-SCORING AI DOCUMENTS — these are the misses');
for (const r of [...aiR].sort((a, b) => a.score - b.score).slice(0, 5)) {
  console.log(`  ${r.score.toString().padStart(3)}  ${r.id}  (${r.wordCount}w)`);
}

// ---- 6. typography metrics ----
const em = (rs) => {
  const w = rs.reduce((a, r) => a + r.wordCount, 0);
  return +(1000 * rs.reduce((a, r) => a + r.metrics.emDash.total, 0) / w).toFixed(2);
};
const burst = (rs) => {
  const v = rs.map((r) => r.metrics.burstiness.cv).filter((x) => x != null);
  return +(v.reduce((a, b) => a + b, 0) / v.length).toFixed(3);
};
console.log('\nTYPOGRAPHY');
console.table({
  'AI corpus': { 'em dashes /1k words': em(aiR), 'mean sentence-length CV': burst(aiR) },
  'Human corpus (2017)': { 'em dashes /1k words': em(huR), 'mean sentence-length CV': burst(huR) }
});
