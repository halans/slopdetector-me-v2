/**
 * sarif.js — SARIF 2.1.0, for GitHub code scanning and any other tool that
 * ingests the standard static-analysis interchange format.
 */
import { listRules } from '../lint.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

let version = '0.0.0';
try {
  version = JSON.parse(readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'package.json'), 'utf8')).version;
} catch { /* version is cosmetic here */ }

export function format(results) {
  const rules = listRules().map((r) => ({
    id: r.id,
    name: r.label,
    shortDescription: { text: r.label },
    fullDescription: { text: `${r.why} False positives: ${r.caution}` },
    defaultConfiguration: { level: r.defaultSeverity === 'error' ? 'error' : r.defaultSeverity === 'warn' ? 'warning' : 'none' },
    properties: { tier: r.tier, tags: ['style', 'ai-generated-text'] }
  }));

  const rel = (p) => p.replace(process.cwd() + '/', '');

  return JSON.stringify({
    $schema: 'https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json',
    version: '2.1.0',
    runs: [{
      tool: {
        driver: {
          name: 'ai-text-patterns',
          version,
          informationUri: 'https://github.com/halans/ai-text-patterns',
          rules
        }
      },
      results: results.flatMap((r) => r.findings.map((f) => ({
        ruleId: f.category,
        level: f.severity === 'error' ? 'error' : 'warning',
        message: { text: `${f.message} — ${f.help}` },
        locations: [{
          physicalLocation: {
            artifactLocation: { uri: rel(f.filePath) },
            region: {
              startLine: f.line, startColumn: f.column, endColumn: f.endColumn,
              snippet: { text: f.match }
            }
          }
        }],
        properties: { tier: f.tier, pattern: f.pattern, documentScore: r.score }
      })))
    }]
  }, null, 2);
}
