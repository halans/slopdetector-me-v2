# ai-text-patterns

Lint prose for the stylistic fingerprints of LLM-generated text. 20 rule
categories, 95 regex patterns, validated against a human control corpus.
Zero dependencies.

```
$ slop docs/architecture.md

docs/architecture.md  score 62/100 · mixed signals · 840 words
  14:4   warning  ~  Significance and legacy inflation  "stands as a testament"  significance_statements/stands_as_testament
  22:1   warning  ~  Negative parallelism  "not just a database — it's"  negative_parallelism/isnt_x_its_y
  31:1   error    !  Conversational scaffolding  "Let me know if you"  collaborative_scaffolding/offer_more
  48:12  error    !! Chatbot tool artifacts  "[cite: 17]"  tool_artifacts/gemini_cite_markers

2 errors, 2 warnings in 1 file
```

## Read this first

**This is a style linter, not an authorship detector.** It finds writing habits
that language models exhibit more often than most human writers. That is all it
does.

The distinction is not pedantic. Liang et al. (*Patterns*, 2023) ran seven
commercial GPT detectors over 91 human-written TOEFL essays: **61%** were
flagged as machine-written, against 5% for essays by US eighth-graders, and
**98%** were flagged by at least one detector. Writing carefully in a formal,
limited-vocabulary register — which is what good second-language English looks
like — is indistinguishable to tools of this kind from what a model produces.

Use this to reread your own drafts. Do not use it to accuse anyone of anything,
and do not wire it into anything that assigns blame to a person.

## Install

```bash
npm install --save-dev ai-text-patterns
```

Requires Node 18+. No runtime dependencies.

## CLI

```bash
slop                          # lint the configured include globs
slop "docs/**/*.md"           # lint a glob
slop README.md CONTRIBUTING.md
slop .                        # walk a directory
cat draft.txt | slop --stdin
slop rules                    # list every rule id and its default
slop init                     # write a starter .sloprc.json
```

| Option | Description |
| --- | --- |
| `-f, --format <name>` | `pretty` (default), `json`, `github`, `sarif` |
| `-t, --threshold <0-100>` | Fail when a document's score reaches this |
| `--max-warnings <n>` | Fail when total warnings exceed `n`. `-1` disables |
| `--rule <sev>:<id>` | Override one rule, repeatable |
| `--only <id,id>` | Enable only these rules, disable the rest |
| `--min-tier <tier>` | Ignore rules below `low`\|`medium`\|`high`\|`critical` |
| `--exclude <glob>` | Add an exclude pattern, repeatable |
| `-c, --config <path>` | Use this config file |
| `--no-config` | Ignore all config files |
| `--no-mask-code` | Lint inside code fences too |
| `--max-hits <n>` | Cap reported hits per rule per file |
| `-q, --quiet` | Report errors only |
| `-v, --verbose` | Include typography metrics |
| `--no-color` | Disable colour (also honours `NO_COLOR`) |

### Exit codes

| Code | Meaning |
| --- | --- |
| `0` | Clean |
| `1` | Lint failure: errors, warnings over `--max-warnings`, or a score at/above `--threshold` |
| `2` | Usage or configuration error |

The split between `1` and `2` matters in CI: a broken config should not look
like a prose problem.

## Configuration

Resolved in this order, each overriding the last:

1. Built-in defaults
2. `package.json` → `"aiTextPatterns": { … }`
3. The nearest `.sloprc.json`, `.sloprc`, `.sloprc.js`, or `.sloprc.mjs`,
   found by walking up from the working directory
4. `--config <path>`
5. Individual CLI flags

```json
{
  "include": ["docs/**/*.md", "README.md"],
  "exclude": ["**/node_modules/**", "**/CHANGELOG.md"],
  "threshold": 45,
  "maxWarnings": 20,
  "rules": {
    "tool_artifacts": "error",
    "emoji_formatting": "warn",
    "ai_vocabulary": "off"
  }
}
```

Severities are ESLint-shaped: `"off"` | `"warn"` | `"error"`, or `0` | `1` | `2`.
Anything you do not list falls back to its tier default. A typo'd rule id is a
hard error, not a silent no-op.

### Two independent gates

`rules` decide whether an individual finding is a warning or an error.
`threshold` is separate: it gates the whole document's aggregate score, which
catches prose that trips many low-weight signals without any single serious one.
Use either, or both, or neither.

## Rule defaults, and why they are conservative

| Tier | Default | Contains |
| --- | --- | --- |
| `critical` | `error` | Vendor citation artifacts, model self-identification, unfilled placeholders |
| `high` | `error` | Conversational scaffolding, knowledge-cutoff hedging, emoji-as-structure |
| `medium` | `warn` | Significance inflation, negative parallelism, ritual conclusions, vague attribution, puffery, formatting tells |
| `low` | `off` | AI vocabulary, copula avoidance, consulting jargon, analysis-report register |

`rule_of_three` ships **off** despite being a `medium` rule. It matched 94% of
the documents in the human control corpus. A linter whose defaults cry wolf gets
uninstalled on day one, so the noisy rules are opt-in.

The `critical` tier is the one worth gating a build on. Those patterns match
machine artifacts — `:contentReference[oaicite:0]`, `[cite: 17]`,
`【85†L261-269】`, `<grok-card>`, `[attached_file:1]` — not writing habits. They
are near-deterministic evidence that text was pasted out of a chatbot UI, and
they had zero hits across 35,502 words of human control text.

## The API

The same engine behind an HTTP interface, for CI systems and other apps.
Three deployment targets share one core, so they cannot drift.

### Run it locally

```bash
npx -p ai-text-patterns slop-serve            # http://127.0.0.1:8787
npx -p ai-text-patterns slop-serve --port 8080 --rate-limit 60
```

Binds to `127.0.0.1` by default, so it is not reachable from your network.
Pass `--host 0.0.0.0` deliberately if you want that.

### Deploy it

```bash
# Cloudflare Workers — stateless, no bindings, comfortable on the free tier
npx wrangler deploy            # uses the bundled wrangler.toml

# Vercel / Netlify / any Node host
# re-export the handler:  export { default } from 'ai-text-patterns/api/node';
```

### Endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/health` | Liveness, catalogue size |
| `GET` | `/v1/rules` | Rule catalogue with tiers, defaults and cautions |
| `POST` | `/v1/lint` | Positioned findings plus score |
| `POST` | `/v1/score` | Score, band and metrics only |
| `GET` | `/openapi.json` | OpenAPI 3.1 document, rule enum generated from the live catalogue |

```bash
curl -s localhost:8787/v1/lint \
  -H 'content-type: application/json' \
  -d '{"text":"It stands as a testament to the enduring legacy [cite: 4]."}' | jq .
```

```json
{
  "summary": { "files": 1, "errors": 1, "warnings": 2, "failed": true },
  "results": [{
    "score": 100,
    "band": "strong LLM register",
    "findings": [
      { "ruleId": "significance_statements/stands_as_testament",
        "severity": "warn", "tier": "medium",
        "line": 1, "column": 4, "match": "stands as a testament" },
      { "ruleId": "tool_artifacts/gemini_cite_markers",
        "severity": "error", "tier": "critical",
        "line": 1, "column": 49, "match": "[cite: 4]" }
    ]
  }]
}
```

Request fields: `text` (required), `rules`, `threshold`, `filePath`,
`maxHitsPerRule`, and `extract` (apply per-filetype masking based on
`filePath`'s extension, as the CLI does).

Error codes are stable and machine-readable: `missing_text`, `empty_text`,
`invalid_json`, `invalid_body`, `unknown_rule`, `invalid_rules`,
`invalid_threshold`, `invalid_max_hits`, `body_too_large`, `text_too_large`,
`rate_limited`, `not_found`, `method_not_allowed`.

### Privacy

Submitted text is never logged, persisted, or echoed back — not even inside an
error message for a malformed body, which is exactly where prose tends to leak.
The access log records method, path, status and duration only. There is
deliberately no analytics binding in the Worker config. A test asserts that a
request body cannot appear in an error response.

Limits: 512 KB body, 200,000 characters of text. The local server offers a
fixed-window per-IP rate limiter; the Worker is stateless, so put Cloudflare
rate limiting rules in front of it if you expose it publicly.

### One source of truth

The CLI, the API and the browser tool all resolve the same severities and
return the same findings for the same input. That is asserted, not assumed:
`test/api.test.mjs` runs a fixture through the CLI and through the API handler
and requires the findings to be byte-identical. Building it that way caught a
real bug — `rule_of_three: "off"` originally lived in the CLI's config defaults,
so the API silently reported a rule the CLI documented as disabled. Per-rule
default departures now live in `DEFAULT_RULE_OVERRIDES` in the library, where
every surface reads them.

## Pre-commit

### pre-commit framework

```yaml
# .pre-commit-config.yaml
repos:
  - repo: https://github.com/halans/ai-text-patterns
    rev: v2.0.0
    hooks:
      - id: ai-text-patterns-strict   # critical artifacts only, safe hard gate
      # - id: ai-text-patterns        # full default rule set
```

### husky + lint-staged

```bash
npx husky init
echo 'npx lint-staged' > .husky/pre-commit
```

```json
{
  "lint-staged": {
    "*.{md,mdx,txt}": "slop --min-tier critical"
  }
}
```

Scoping the hook to `--min-tier critical` is the recommended default. Blocking a
commit over a stylistic warning trains people to pass `--no-verify`, at which
point the hook is worse than nothing.

## GitHub Actions

The `github` reporter emits workflow commands, so findings land as inline
annotations on the pull request diff:

```yaml
- run: npx slop "**/*.md" --format github --min-tier high
```

For the Security tab instead, emit SARIF and upload it. Both workflows are in
[`examples/.github/workflows`](examples/.github/workflows).

## Programmatic use

```js
import { lintText, scoreText, CATEGORIES } from 'ai-text-patterns';

// Per-finding, with positions.
const { findings, score, band, errorCount } = lintText(text, {
  filePath: 'draft.md',
  rules: { ai_vocabulary: 'warn', rule_of_three: 'off' }
});
for (const f of findings) {
  console.log(`${f.line}:${f.column}  ${f.severity}  ${f.ruleId}  ${f.match}`);
}

// Document-level only.
const r = scoreText(text);
console.log(r.score, r.band, r.metrics.emDash.perThousand);
```

Subpath exports: `ai-text-patterns/patterns`, `/lint`, `/config`,
`/reporters/json`.

### Offset guarantee

Reported positions are offsets into the **original** file. Everything that
preprocesses text — Unicode folding, code-fence masking, front-matter and table
masking — is strictly length-preserving, blanking regions in place rather than
deleting them. The test suite pins this, because the alternative is a linter
whose line numbers drift silently as soon as a document contains a code block.

## What gets linted

| File type | Behaviour |
| --- | --- |
| `.md` `.mdx` `.markdown` | Prose only: front matter, code fences, link targets, HTML and tables are masked |
| `.txt` `.rst` `.adoc` `.org` | Prose, with front matter and URLs masked |
| `.html` `.vue` `.svelte` | Text content; tags, comments, `<script>` and `<style>` masked |
| `.js` `.ts` `.py` `.go` … | **Comments only.** String literals are ignored |

## Validation

Measured, reproducible, and reported honestly. Three corpora: 29 documented LLM
outputs archived by Wikipedia editors as cleanup evidence, 6 chat-register
samples, and 16 Wikipedia articles frozen in December 2017 — same genre,
guaranteed pre-LLM.

| Corpus | n | words | mean score | median | max |
| --- | --- | --- | --- | --- | --- |
| AI, article register | 29 | 26,863 | 34.0 | 31 | 87 |
| AI, chat register | 6 | 778 | 55.5 | 62 | 66 |
| Human, Dec 2017 | 16 | 35,502 | 9.9 | 9 | 20 |

| Threshold | Recall | False positives |
| --- | --- | --- |
| 15 | 83% | 25% |
| 25 | 66% | 0% |
| 45 | 21% | 0% |

Read that honestly: a threshold clean enough for zero false positives on 16
human documents still misses a third of known machine text. There is no setting
that is both safe and thorough, and this is a small, single-genre corpus.

Two further findings worth knowing:

- **Em dashes held up**: 2.65 per 1,000 words in LLM text against 0.26 in the
  human control, a tenfold gap. But it is the fastest-decaying signal — GPT-5.1
  was explicitly tuned to suppress them, and by mid-2026 only Claude exceeded
  professional human writers.
- **"Burstiness" did not.** Sentence-length variation, the most widely repeated
  heuristic in this space, came out at 0.546 CV for AI text and 0.606 for human
  text. No useful separation. It is reported by `--verbose` as a metric and
  deliberately contributes almost nothing to the score.

## The target moves

Wikipedia's editors track which words cluster in which model era: *delve,
tapestry, testament, pivotal, meticulous* for GPT-4 through mid-2024; *align
with, showcase, foster, enhance, vibrant* for GPT-4o; *emphasising, highlighting,
showcasing* from mid-2025. *Delve* itself, the most famous tell of all, dropped
off sharply during 2025.

Patterns are tagged by era for this reason. Any wordlist like this is a
photograph of one season of model releases, and it decays — faster where the tell
became notorious enough to tune out. The vendor artifacts are the durable
category; the vocabulary list is the disposable one.

## The browser tool

**SlopDetector** is the same engine as a standalone page: paste prose and see
every match highlighted in place, click a finding for its cause and its
false-positive caution, filter by tier or category, and export the same JSON the
CLI emits. It runs entirely client-side — the page is generated by
`tool/build-tool.mjs`, which inlines `src/patterns.js` and `src/lint.js` at build
time so the page cannot drift from the package.

## Development

```bash
node --test test/*.test.mjs   # 47 tests
node src/cli.js README.md -v  # lint this file
```

## Licence

CC BY-NC-SA 4.0, inherited from
[Wikipedia:Signs of AI writing](https://en.wikipedia.org/wiki/Wikipedia:Signs_of_AI_writing),
from which the pattern catalogue is derived.

### Sources

- [Wikipedia:Signs of AI writing](https://en.wikipedia.org/wiki/Wikipedia:Signs_of_AI_writing), WikiProject AI Cleanup
- Kobak, González-Márquez, Horvát & Lause, "Delving into LLM-assisted writing in biomedical publications through excess vocabulary", *Science Advances* 11(27), 2025
- Juzek & Ward, "Why Does ChatGPT 'Delve' So Much?", Findings of ACL 2025, arXiv:2412.11385
- Liang, Yüksekgönül, Mao, Wu & Zou, "GPT detectors are biased against non-native English writers", *Patterns* 4(7), 2023
- Russell, Karpinska & Iyyer, ACL 2025; Weber-Wulff et al., arXiv:2306.15666
- Merrill, Chen & Kumer, *The Washington Post*, 13 Nov 2025; "How to spot AI writing", *The Economist*, 30 Jul 2026
