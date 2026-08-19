/**
 * github.js — GitHub Actions workflow commands, so findings appear as inline
 * annotations on the pull request diff.
 * https://docs.github.com/actions/reference/workflow-commands-for-github-actions
 */
const esc = (s) => String(s)
  .replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
const escProp = (s) => esc(s).replace(/:/g, '%3A').replace(/,/g, '%2C');

export function format(results, summary) {
  const out = [];
  const rel = (p) => p.replace(process.cwd() + '/', '');
  for (const r of results) {
    for (const f of r.findings) {
      const cmd = f.severity === 'error' ? 'error' : 'warning';
      out.push(
        `::${cmd} file=${escProp(rel(f.filePath))},line=${f.line},col=${f.column},` +
        `endColumn=${f.endColumn},title=${escProp(f.categoryLabel)}::` +
        esc(`${f.message} [${f.ruleId}] — ${f.help}`)
      );
    }
    if (r.thresholdExceeded) {
      out.push(
        `::error file=${escProp(rel(r.filePath))},line=1,title=Score threshold::` +
        esc(`Document score ${r.score} (${r.band}) is at or above the configured threshold.`)
      );
    }
  }
  out.push(
    `::notice title=ai-text-patterns::` +
    esc(`${summary.errorCount} errors, ${summary.warningCount} warnings across ${summary.fileCount} files. ` +
        `Style signals only — not evidence of authorship.`)
  );
  return out.join('\n');
}
