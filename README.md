# Slop Detector

## ai-text-patterns

A regex catalogue of surface patterns characteristic of LLM-generated English
prose: 20 categories, 95 sub-patterns, with a scoring helper and honest
false-positive numbers.

**This is a style linter, not an authorship detector.** See the "Limits"
section of the accompanying article. Published detectors have false-positive
rates from ~4% per sentence (Turnitin) to 61% on human essays by non-native
English writers (Liang et al., Patterns, 2023). Do not use this to accuse
anyone of anything.

## Use

```js
import { scoreText, matchCategory, CATEGORIES } from './ai-text-patterns.js';

const r = scoreText(myText);
console.log(r.score, r.band);        // 0-100, plus a plain-language band
r.categories.forEach(c => console.log(c.id, c.count, c.hits[0].match));
console.log(r.metrics.emDash.perThousand);

matchCategory(myText, 'negative_parallelism');
```

## Files

| file | purpose |
|---|---|
| `ai-text-patterns.js` | the library (ES module, zero dependencies) |
| `validate.mjs` | test harness; prints every number in the article |
| `validation-report.txt` | raw output of the run described in the article |
| `build-corpus.py` | fetches 16 pre-2022 Wikipedia articles (human control) |
| `build-ai-corpus.py` | fetches Wikipedia's archived LLM-draft examples |
| `build-chat-corpus.py` | extracts chat-register AI samples from the source page |
| `build-page.mjs` | regenerates the article HTML from the library |
| `corpus-*.json` | the built corpora |

## Standalone web tool

`app/tool/build-tool.mjs` generates a single self-contained HTML page
(`app/tool/public/index.html`) that inlines the same engine the CLI and API
use — nothing is duplicated by hand, and no text ever leaves the browser.

Rebuild it after any change to the engine or the page:

```
node app/tool/build-tool.mjs
```

Requires Node ≥18 only — no `npm install`, the engine has zero dependencies.

### Customize

| to change | edit | then |
|---|---|---|
| UI, styling, interaction | `app/tool/tool.template.html` | rerun the build script |
| detection rules | `app/pkg/src/patterns.js` / `app/pkg/src/lint.js` | `npm test` in `app/pkg`, then rerun the build script |

Never hand-edit `app/tool/public/index.html` directly — it is fully
regenerated on every build and any manual changes will be overwritten.

## Reproduce

```
python3 build-corpus.py && python3 build-ai-corpus.py && python3 build-chat-corpus.py
node validate.mjs
```

## Measured results

63,143-word corpus. Self-test 101/101. At threshold 25: 66% recall on 29
documented LLM documents, 0/16 false positives on Wikipedia articles frozen in
December 2017. Em dashes 2.65/1k words in LLM text vs 0.26/1k human.
Sentence-length "burstiness" showed no useful separation.

## Licence

CC BY-NC-SA 4.0, inherited from Wikipedia:Signs of AI writing, from which the
pattern catalogue is derived.
