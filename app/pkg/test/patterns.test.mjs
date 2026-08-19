import test from 'node:test';
import assert from 'node:assert/strict';
import { CATEGORIES, normalize, maskCode, lineIndex, scoreText } from '../src/index.js';

test('every documented example matches its own pattern', () => {
  const failures = [];
  let checked = 0;
  for (const cat of CATEGORIES) {
    for (const p of cat.patterns) {
      for (const ex of p.examples ?? []) {
        checked++;
        const re = new RegExp(p.re.source, p.re.flags);
        if (!re.test(ex)) failures.push(`${cat.id}/${p.id} <- ${JSON.stringify(ex)}`);
      }
    }
  }
  assert.ok(checked >= 90, `expected many examples, got ${checked}`);
  assert.deepEqual(failures, [], `unmatched examples:\n${failures.join('\n')}`);
});

test('catalogue is structurally well formed', () => {
  const ids = new Set();
  for (const cat of CATEGORIES) {
    assert.ok(!ids.has(cat.id), `duplicate category id ${cat.id}`);
    ids.add(cat.id);
    assert.match(cat.severity, /^(critical|high|medium|low)$/);
    assert.ok(cat.weight > 0 && cat.cap >= cat.weight, `${cat.id} weight/cap`);
    assert.ok(cat.why?.length > 20, `${cat.id} needs a why`);
    assert.ok(cat.caution?.length > 20, `${cat.id} needs a caution`);
    const pids = new Set();
    for (const p of cat.patterns) {
      assert.ok(!pids.has(p.id), `duplicate pattern id ${cat.id}/${p.id}`);
      pids.add(p.id);
      assert.ok(p.re.flags.includes('g'), `${cat.id}/${p.id} must be global`);
    }
  }
});

test('normalize is length-preserving', () => {
  const cases = [
    'a’b', 'x…y', '“quoted”', 'q w', 'plain', '‘single’ ‛odd‟',
    'é combining', 'mixed “a” and "b" with … ellipsis', '',
    'nbsp fig narrow'
  ];
  for (const s of cases) {
    assert.equal(normalize(s).length, s.length, `length changed for ${JSON.stringify(s)}`);
  }
});

test('normalize folds typography so patterns match either form', () => {
  const curly = 'It’s not just a phone — it’s a platform.';
  const straight = "It's not just a phone — it's a platform.";
  assert.equal(normalize(curly), normalize(straight));
});

test('maskCode preserves length, line count, and removes code', () => {
  const t = 'before\n```js\nconst delve = "tapestry";\n```\nafter `inline testament` end';
  const m = maskCode(t);
  assert.equal(m.length, t.length);
  assert.equal(m.split('\n').length, t.split('\n').length);
  assert.ok(!/delve|tapestry|testament/.test(m));
  assert.ok(/before/.test(m) && /after/.test(m) && /end/.test(m));
});

test('maskCode handles an unterminated fence', () => {
  const t = 'text\n```\nunclosed delve\n';
  const m = maskCode(t);
  assert.equal(m.length, t.length);
  assert.ok(!/delve/.test(m));
});

test('lineIndex resolves offsets to 1-based line and column', () => {
  const t = 'abc\ndefgh\n\nij';
  const idx = lineIndex(t);
  assert.deepEqual(idx.locate(0), { line: 1, column: 1 });
  assert.deepEqual(idx.locate(2), { line: 1, column: 3 });
  assert.deepEqual(idx.locate(4), { line: 2, column: 1 });
  assert.deepEqual(idx.locate(6), { line: 2, column: 3 });
  assert.deepEqual(idx.locate(11), { line: 4, column: 1 });
  assert.equal(idx.lineText(2), 'defgh');
  assert.equal(idx.lineText(3), '');
});

test('lineIndex agrees with a naive implementation on random offsets', () => {
  const t = 'alpha beta\ngamma\n\ndelta epsilon\nzeta';
  const idx = lineIndex(t);
  for (let o = 0; o < t.length; o++) {
    const before = t.slice(0, o);
    const line = before.split('\n').length;
    const column = o - (before.lastIndexOf('\n') + 1) + 1;
    assert.deepEqual(idx.locate(o), { line, column }, `offset ${o}`);
  }
});

test('scoreText separates LLM register from plain factual prose', () => {
  const slop = 'The museum stands as a testament to the enduring legacy of the region, ' +
    'highlighting its cultural significance and fostering a sense of community. ' +
    'It is not just a building — it is a symbol. In conclusion, this underscores its importance.';
  const plain = 'The museum opened in 1887. It holds 4,000 objects, of which about 900 are ' +
    'on display. Admission cost £8 in 2019. The building was extended in 1932 and again in 1975.';
  const a = scoreText(slop), b = scoreText(plain);
  assert.ok(a.score > 50, `expected slop > 50, got ${a.score}`);
  assert.ok(b.score < 20, `expected plain < 20, got ${b.score}`);
  assert.ok(a.score > b.score * 2);
});

test('scoreText ignores fenced code by default and can be told not to', () => {
  const t = 'Plain sentence here.\n\n```\nIt stands as a testament to the enduring legacy.\n```\n';
  assert.equal(scoreText(t).categories.length, 0);
  assert.ok(scoreText(t, { stripCodeBlocks: false }).categories.length > 0);
});

test('patterns do not backtrack catastrophically on adversarial input', () => {
  // Long runs of the characters our bounded spans traverse.
  const evil = [
    'not just ' + 'a'.repeat(5000),
    'It is not ' + 'x, '.repeat(2000),
    'while ' + 'y '.repeat(3000) + ', it is important',
    '- **' + 'z'.repeat(4000) + '**:',
    'the future of ' + 'w '.repeat(2000)
  ].join('\n');
  const t0 = Date.now();
  scoreText(evil);
  const ms = Date.now() - t0;
  assert.ok(ms < 3000, `scoreText took ${ms}ms on adversarial input`);
});

test('regexes are stateless across repeated calls', () => {
  const t = 'It stands as a testament to the enduring legacy of the work.';
  const first = scoreText(t).score;
  for (let i = 0; i < 5; i++) assert.equal(scoreText(t).score, first);
});
