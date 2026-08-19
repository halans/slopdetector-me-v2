/**
 * pretty.js — human-readable terminal output, ESLint-shaped.
 * Colour is applied only when the stream is a TTY and NO_COLOR is unset.
 */

const useColor = () =>
  process.stdout.isTTY && !process.env.NO_COLOR && process.env.TERM !== 'dumb';

function makeStyle(enabled) {
  const w = (a, b) => (s) => (enabled ? `[${a}m${s}[${b}m` : String(s));
  return {
    bold: w(1, 22), dim: w(2, 22), underline: w(4, 24),
    red: w(31, 39), yellow: w(33, 39), blue: w(34, 39),
    grey: w(90, 39), green: w(32, 39), magenta: w(35, 39)
  };
}

const TIER_MARK = { critical: '!!', high: '! ', medium: '~ ', low: '· ' };

export function format(results, summary, opts = {}) {
  const c = makeStyle(opts.color ?? useColor());
  const lines = [];
  const rel = (p) => p.replace(process.cwd() + '/', '');

  for (const r of results) {
    if (!r.findings.length && !r.thresholdExceeded) continue;

    const scoreCol = r.score >= 65 ? c.red : r.score >= 35 ? c.yellow : r.score >= 15 ? c.blue : c.green;
    lines.push('');
    lines.push(
      c.underline(c.bold(rel(r.filePath))) + '  ' +
      c.grey(`score `) + scoreCol(c.bold(String(r.score))) + c.grey(`/100 · ${r.band} · ${r.wordCount} words`)
    );

    // Column-align the position gutter.
    const posW = Math.max(0, ...r.findings.map((f) => `${f.line}:${f.column}`.length));
    const ruleW = Math.max(0, ...r.findings.map((f) => f.ruleId.length));

    for (const f of r.findings) {
      const pos = `${f.line}:${f.column}`.padEnd(posW);
      const sev = f.severity === 'error' ? c.red('error  ') : c.yellow('warning');
      const mark = c.grey(TIER_MARK[f.tier] ?? '  ');
      lines.push(
        `  ${c.grey(pos)}  ${sev}  ${mark} ${f.categoryLabel}` +
        `  ${c.magenta(JSON.stringify(trunc(f.match.trim(), 48)))}` +
        `  ${c.grey(f.ruleId.padEnd(ruleW))}`
      );
    }

    if (r.thresholdExceeded) {
      lines.push(`  ${c.red('error')}  document score ${r.score} is at or above the configured threshold`);
    }

    if (opts.verbose) {
      const m = r.metrics;
      lines.push(c.grey(
        `  metrics: em dashes ${m.emDash.perThousand}/1k (${m.emDash.spaced} spaced) · ` +
        `sentence CV ${m.burstiness.cv ?? 'n/a'} · quotes mixed ${m.quotes.mixed ? 'yes' : 'no'}`
      ));
    }
  }

  const clean = summary.errorCount === 0 && summary.warningCount === 0 && !summary.overThreshold.length;
  lines.push('');
  if (clean) {
    lines.push(c.green(`✓ ${summary.fileCount} file${summary.fileCount === 1 ? '' : 's'} checked, nothing flagged`));
  } else {
    const bits = [];
    if (summary.errorCount) bits.push(c.red(`${summary.errorCount} error${summary.errorCount === 1 ? '' : 's'}`));
    if (summary.warningCount) bits.push(c.yellow(`${summary.warningCount} warning${summary.warningCount === 1 ? '' : 's'}`));
    if (summary.overThreshold.length) bits.push(c.red(`${summary.overThreshold.length} over threshold`));
    lines.push(c.bold(`${bits.join(', ')} in ${summary.fileCount} file${summary.fileCount === 1 ? '' : 's'}`));
    if (summary.maxWarnings >= 0 && summary.warningCount > summary.maxWarnings) {
      lines.push(c.red(`warnings (${summary.warningCount}) exceed --max-warnings ${summary.maxWarnings}`));
    }
  }
  lines.push(c.grey('These are style signals, not proof of authorship. See README before acting on them.'));
  lines.push('');
  return lines.join('\n');
}

function trunc(s, n) { return s.length > n ? s.slice(0, n - 1) + '…' : s; }
