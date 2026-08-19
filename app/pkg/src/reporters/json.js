/** json.js — machine-readable output for scripts and dashboards. */
export function format(results, summary) {
  return JSON.stringify({
    version: 1,
    summary: {
      files: summary.fileCount,
      errors: summary.errorCount,
      warnings: summary.warningCount,
      overThreshold: summary.overThreshold,
      failed: summary.failed
    },
    disclaimer:
      'Style signals only. Not evidence of authorship. Published AI detectors ' +
      'show false-positive rates up to 61% on human text by non-native English writers.',
    results: results.map((r) => ({
      filePath: r.filePath,
      score: r.score,
      band: r.band,
      wordCount: r.wordCount,
      errorCount: r.errorCount,
      warningCount: r.warningCount,
      thresholdExceeded: r.thresholdExceeded,
      metrics: r.metrics,
      findings: r.findings.map((f) => ({
        ruleId: f.ruleId, category: f.category, severity: f.severity, tier: f.tier,
        line: f.line, column: f.column, endColumn: f.endColumn,
        match: f.match, message: f.message
      }))
    }))
  }, null, 2);
}
