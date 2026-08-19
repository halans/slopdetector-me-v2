#!/usr/bin/env node
/* Generates index.html. Category reference and the live checker are both
   driven by the real ai-text-patterns.js source, so docs cannot drift. */
import { readFileSync, writeFileSync } from 'node:fs';
import { CATEGORIES } from './ai-text-patterns.js';

// The interactive checker now lives in its own artifact (tool/), which inlines
// pkg/src at build time. This page only links to it, so no engine is embedded here.

const esc = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const SEV_ORDER = { critical: 0, high: 1, medium: 2, low: 3 };

// Real measured numbers from validation-report.txt
const MEASURED = {
  tool_artifacts:            { ai: 4.95, hu: 0,    aiDoc: 17, huDoc: 0 },
  ai_self_reference:         { ai: 0,    hu: 0,    aiDoc: 0,  huDoc: 0 },
  placeholder_text:          { ai: 0,    hu: 0,    aiDoc: 0,  huDoc: 0, chat: 33 },
  knowledge_cutoff:          { ai: 0.12, hu: 0,    aiDoc: 7,  huDoc: 0, chat: 33 },
  collaborative_scaffolding: { ai: 0.08, hu: 0,    aiDoc: 7,  huDoc: 0 },
  emoji_formatting:          { ai: 0,    hu: 0,    aiDoc: 0,  huDoc: 0, chat: 50 },
  significance_statements:   { ai: 0.23, hu: 0.03, aiDoc: 21, huDoc: 6 },
  participial_tackon:        { ai: 0.35, hu: 0,    aiDoc: 24, huDoc: 0 },
  negative_parallelism:      { ai: 0.15, hu: 0,    aiDoc: 7,  huDoc: 0 },
  rule_of_three:             { ai: 3.11, hu: 0.71, aiDoc: 83, huDoc: 94 },
  ritual_conclusion:         { ai: 0.12, hu: 0.03, aiDoc: 10, huDoc: 6 },
  challenges_and_future:     { ai: 0.04, hu: 0,    aiDoc: 3,  huDoc: 0 },
  vague_attribution:         { ai: 0.15, hu: 0.06, aiDoc: 14, huDoc: 13 },
  editorial_hedging:         { ai: 0,    hu: 0,    aiDoc: 0,  huDoc: 0 },
  promotional_puffery:       { ai: 0.27, hu: 0.20, aiDoc: 14, huDoc: 25 },
  copula_avoidance:          { ai: 0.73, hu: 0.46, aiDoc: 41, huDoc: 50 },
  ai_vocabulary:             { ai: 2.15, hu: 0.31, aiDoc: 59, huDoc: 38 },
  business_jargon:           { ai: 0.08, hu: 0,    aiDoc: 7,  huDoc: 0 },
  data_analysis_phrases:     { ai: 0,    hu: 0,    aiDoc: 0,  huDoc: 0 },
  formatting_tells:          { ai: 1.15, hu: 0,    aiDoc: 7,  huDoc: 0 }
};

const liftLabel = (id) => {
  const m = MEASURED[id];
  if (!m) return '—';
  if (m.hu === 0 && m.ai === 0) return m.chat ? 'chat-register only' : 'not exercised';
  if (m.hu === 0) return '∞ (zero human hits)';
  return `${(m.ai / m.hu).toFixed(1)}×`;
};

const cards = [...CATEGORIES]
  .sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity])
  .map((cat) => {
    const m = MEASURED[cat.id] || {};
    const pats = cat.patterns.map((p) => `
      <div class="pat">
        <div class="pat-head">
          <code class="pat-id">${esc(p.id)}</code>
          ${p.vendor ? `<span class="vendor">${esc(p.vendor)}</span>` : ''}
          ${p.era ? `<span class="vendor era">${esc(p.era)}</span>` : ''}
        </div>
        ${p.note ? `<p class="pat-note">${esc(p.note)}</p>` : ''}
        <pre class="rx"><code>${esc(String(p.re))}</code></pre>
        ${(p.examples || []).length
          ? `<ul class="ex">${p.examples.map((e) => `<li><span>${esc(e)}</span></li>`).join('')}</ul>`
          : ''}
      </div>`).join('');

    return `
    <article class="cat" id="cat-${esc(cat.id)}" data-sev="${cat.severity}">
      <header class="cat-head">
        <div class="cat-title">
          <span class="sev sev-${cat.severity}">${cat.severity}</span>
          <h3>${esc(cat.label)}</h3>
          <code class="cat-id">${esc(cat.id)}</code>
        </div>
        <dl class="cat-stats">
          <div><dt>AI /1k words</dt><dd>${m.ai ?? '—'}</dd></div>
          <div><dt>human /1k</dt><dd>${m.hu ?? '—'}</dd></div>
          <div><dt>lift</dt><dd>${liftLabel(cat.id)}</dd></div>
        </dl>
      </header>
      <p class="why"><strong>Why it happens.</strong> ${esc(cat.why)}</p>
      <p class="caution"><strong>False positives.</strong> ${esc(cat.caution)}</p>
      <details class="pats">
        <summary>${cat.patterns.length} pattern${cat.patterns.length > 1 ? 's' : ''} · ${cat.weight} pts each, capped at ${cat.cap}</summary>
        ${pats}
      </details>
    </article>`;
  }).join('\n');

const toc = [...CATEGORIES]
  .sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity])
  .map((c) => `<a href="#cat-${c.id}" class="toc-item" data-sev="${c.severity}"><span class="dot"></span>${esc(c.label)}</a>`)
  .join('');

const totalPatterns = CATEGORIES.reduce((a, c) => a + c.patterns.length, 0);

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>The Fingerprints of Machine Prose</title>
<meta name="description" content="A tested regex catalogue of the surface patterns that mark English text as LLM-generated — with honest false-positive numbers.">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;700&family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,500;1,6..72,400&display=swap" rel="stylesheet">
<style>
:root{
  --ink:#0f1115; --ink-2:#3a4048; --ink-3:#6b7480;
  --paper:#ffffff; --paper-2:#f6f7f9; --paper-3:#eceef2;
  --rule:#dfe3e9;
  --accent:#1b47c4; --accent-soft:#eef2ff;
  --flag:#b23214; --flag-soft:#fdf0ea;
  --crit:#a3172b; --high:#b45309; --med:#1b47c4; --low:#5b6472;
  --mono:'JetBrains Mono',ui-monospace,SFMono-Regular,Menlo,monospace;
  --sans:'Inter',system-ui,-apple-system,sans-serif;
}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--paper);color:var(--ink);
  font-family:var(--sans);font-size:17px;line-height:1.65;
  font-feature-settings:"kern","liga","cv05";-webkit-font-smoothing:antialiased}
.wrap{max-width:1180px;margin:0 auto;padding:0 6vw}
.narrow{max-width:720px;margin-left:auto;margin-right:auto}
h1,h2,h3,h4{line-height:1.15;letter-spacing:-.021em;margin:0}
a{color:var(--accent)}
code,pre{font-family:var(--mono);font-variant-ligatures:none}

/* ---------- masthead ---------- */
.mast{border-bottom:1px solid var(--rule);padding:20px 0;position:sticky;top:0;
  background:rgba(255,255,255,.92);backdrop-filter:saturate(180%) blur(12px);z-index:50}
.mast .wrap{display:flex;align-items:center;justify-content:space-between;gap:24px}
.brand{font-family:var(--mono);font-size:12.5px;font-weight:700;letter-spacing:.14em;
  text-transform:uppercase;color:var(--ink)}
.brand span{color:var(--accent)}
.mast nav{display:flex;gap:22px;font-size:13.5px;font-weight:500}
.mast nav a{color:var(--ink-2);text-decoration:none}
.mast nav a:hover{color:var(--accent)}
@media(max-width:720px){.mast nav{display:none}}

/* ---------- hero ---------- */
.hero{padding:88px 0 56px;border-bottom:1px solid var(--rule)}
.kicker{font-family:var(--mono);font-size:12px;font-weight:700;letter-spacing:.16em;
  text-transform:uppercase;color:var(--accent);margin-bottom:22px}
.hero h1{font-size:clamp(2.6rem,6.4vw,4.6rem);font-weight:700;letter-spacing:-.035em;max-width:16ch}
.standfirst{font-family:'Newsreader',Georgia,serif;font-size:clamp(1.2rem,2.3vw,1.5rem);
  line-height:1.5;color:var(--ink-2);max-width:60ch;margin-top:26px}
.hero-meta{display:flex;flex-wrap:wrap;gap:10px 28px;margin-top:34px;
  font-family:var(--mono);font-size:12.5px;color:var(--ink-3)}
.hero-meta b{color:var(--ink);font-weight:500}

/* ---------- upfront warning ---------- */
.warning{margin:44px 0 0;border:1px solid var(--rule);border-left:3px solid var(--flag);
  background:var(--flag-soft);padding:26px 30px;border-radius:2px}
.warning h2{font-size:1.02rem;font-family:var(--mono);text-transform:uppercase;
  letter-spacing:.1em;font-weight:700;color:var(--flag);margin-bottom:12px}
.warning p{margin:0 0 12px;font-size:16px;color:#5c2a18}
.warning p:last-child{margin-bottom:0}

/* ---------- sections ---------- */
section{padding:76px 0}
section+section{border-top:1px solid var(--rule)}
.sec-label{font-family:var(--mono);font-size:11.5px;font-weight:700;letter-spacing:.16em;
  text-transform:uppercase;color:var(--ink-3);margin-bottom:16px}
h2.big{font-size:clamp(1.9rem,3.6vw,2.7rem);font-weight:700;letter-spacing:-.03em;max-width:20ch}
.lede{font-size:1.14rem;color:var(--ink-2);max-width:66ch;margin-top:20px}
p{max-width:70ch}
section p+p{margin-top:1.1em}
h3.sub{font-size:1.28rem;font-weight:600;margin:44px 0 14px;letter-spacing:-.018em}

/* ---------- data tables ---------- */
.tbl-wrap{overflow-x:auto;margin:30px 0;border:1px solid var(--rule);border-radius:3px}
table{width:100%;border-collapse:collapse;font-size:14.5px}
caption{text-align:left;font-family:var(--mono);font-size:11.5px;letter-spacing:.1em;
  text-transform:uppercase;color:var(--ink-3);padding:14px 18px;border-bottom:1px solid var(--rule);
  background:var(--paper-2)}
th{text-align:left;font-weight:600;font-size:12px;letter-spacing:.05em;text-transform:uppercase;
  color:var(--ink-3);padding:12px 18px;border-bottom:1px solid var(--rule);white-space:nowrap}
td{padding:12px 18px;border-bottom:1px solid var(--paper-3);vertical-align:top}
tbody tr:last-child td{border-bottom:0}
td.num,th.num{text-align:right;font-family:var(--mono);font-variant-numeric:tabular-nums;font-size:13.5px}
tbody tr:hover{background:var(--paper-2)}
.pos{color:var(--flag);font-weight:600}
.neg{color:#15803d;font-weight:600}

/* ---------- callout ---------- */
.callout{border-left:3px solid var(--accent);background:var(--accent-soft);
  padding:22px 26px;margin:34px 0;border-radius:0 3px 3px 0}
.callout p{margin:0;font-size:16px;color:#1a2e6b}
.callout p+p{margin-top:10px}

/* ---------- toc ---------- */
.toc{display:flex;flex-wrap:wrap;gap:8px;margin:32px 0 8px}
.toc-item{display:inline-flex;align-items:center;gap:8px;padding:7px 13px;border:1px solid var(--rule);
  border-radius:999px;font-size:13px;font-weight:500;text-decoration:none;color:var(--ink-2);
  background:var(--paper);transition:.15s}
.toc-item:hover{border-color:var(--accent);color:var(--accent);background:var(--accent-soft)}
.dot{width:7px;height:7px;border-radius:50%;flex:none}
.toc-item[data-sev=critical] .dot{background:var(--crit)}
.toc-item[data-sev=high] .dot{background:var(--high)}
.toc-item[data-sev=medium] .dot{background:var(--med)}
.toc-item[data-sev=low] .dot{background:var(--low)}

/* ---------- category cards ---------- */
.cats{display:grid;gap:22px;margin-top:38px}
.cat{border:1px solid var(--rule);border-radius:3px;padding:28px 30px;background:var(--paper)}
.cat[data-sev=critical]{border-left:3px solid var(--crit)}
.cat[data-sev=high]{border-left:3px solid var(--high)}
.cat[data-sev=medium]{border-left:3px solid var(--med)}
.cat[data-sev=low]{border-left:3px solid var(--low)}
.cat-head{display:flex;flex-wrap:wrap;justify-content:space-between;gap:18px;align-items:flex-start}
.cat-title{display:flex;flex-wrap:wrap;align-items:center;gap:11px}
.cat-title h3{font-size:1.24rem;font-weight:650;letter-spacing:-.018em}
.sev{font-family:var(--mono);font-size:10px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;
  padding:3px 8px;border-radius:2px;color:#fff}
.sev-critical{background:var(--crit)} .sev-high{background:var(--high)}
.sev-medium{background:var(--med)} .sev-low{background:var(--low)}
.cat-id{font-size:12px;color:var(--ink-3);background:var(--paper-2);padding:2px 7px;border-radius:2px}
.cat-stats{display:flex;gap:22px;margin:0}
.cat-stats div{text-align:right}
.cat-stats dt{font-family:var(--mono);font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:var(--ink-3)}
.cat-stats dd{margin:2px 0 0;font-family:var(--mono);font-size:15px;font-weight:500;
  font-variant-numeric:tabular-nums}
.why,.caution{font-size:15.5px;margin:16px 0 0;max-width:78ch;color:var(--ink-2)}
.why strong,.caution strong{color:var(--ink);font-weight:600}
.caution{color:var(--ink-3)}
.pats{margin-top:20px;border-top:1px solid var(--paper-3);padding-top:16px}
.pats summary{cursor:pointer;font-family:var(--mono);font-size:12.5px;color:var(--accent);
  font-weight:500;list-style:none}
.pats summary::-webkit-details-marker{display:none}
.pats summary::before{content:"▸ ";display:inline-block;transition:.15s}
.pats[open] summary::before{content:"▾ "}
.pat{margin-top:20px;padding-left:16px;border-left:2px solid var(--paper-3)}
.pat-head{display:flex;align-items:center;gap:9px;flex-wrap:wrap}
.pat-id{font-size:12.5px;font-weight:700;color:var(--ink)}
.vendor{font-family:var(--mono);font-size:10px;letter-spacing:.06em;text-transform:uppercase;
  background:var(--paper-3);color:var(--ink-3);padding:2px 7px;border-radius:2px}
.vendor.era{background:var(--accent-soft);color:var(--accent);text-transform:none;letter-spacing:0}
.pat-note{font-size:14px;color:var(--ink-3);margin:6px 0 0;max-width:70ch}
pre.rx{background:#0f1115;color:#e6e9ef;padding:13px 16px;border-radius:3px;overflow-x:auto;
  font-size:12.5px;line-height:1.6;margin:10px 0 0}
pre.rx code{color:inherit;white-space:pre}
ul.ex{list-style:none;padding:0;margin:10px 0 0;display:flex;flex-wrap:wrap;gap:7px}
ul.ex li span{display:inline-block;font-family:var(--mono);font-size:12px;background:var(--flag-soft);
  color:var(--flag);padding:4px 9px;border-radius:2px;border:1px solid #f4dbd0}

/* ---------- checker ---------- */
#checker{background:var(--paper-2)}
.chk-grid{display:grid;grid-template-columns:1fr 380px;gap:26px;margin-top:34px}
@media(max-width:940px){.chk-grid{grid-template-columns:1fr}}
textarea{width:100%;min-height:340px;padding:20px 22px;border:1px solid var(--rule);border-radius:3px;
  font-family:var(--mono);font-size:13.5px;line-height:1.7;resize:vertical;background:var(--paper);
  color:var(--ink)}
textarea:focus{outline:2px solid var(--accent);outline-offset:-1px;border-color:transparent}
.chk-controls{display:flex;flex-wrap:wrap;gap:10px;margin-top:14px;align-items:center}
button{font-family:var(--sans);font-size:14px;font-weight:600;padding:10px 20px;border-radius:3px;
  border:1px solid var(--rule);background:var(--paper);color:var(--ink);cursor:pointer;transition:.15s}
button:hover{border-color:var(--accent);color:var(--accent)}
button.primary{background:var(--ink);color:#fff;border-color:var(--ink)}
button.primary:hover{background:var(--accent);border-color:var(--accent);color:#fff}
.panel{border:1px solid var(--rule);border-radius:3px;background:var(--paper);padding:24px;
  align-self:start;position:sticky;top:96px}
.gauge{text-align:center;padding-bottom:20px;border-bottom:1px solid var(--paper-3)}
.gauge .n{font-family:var(--mono);font-size:60px;font-weight:700;line-height:1;
  font-variant-numeric:tabular-nums;letter-spacing:-.03em}
.gauge .band{font-family:var(--mono);font-size:11.5px;letter-spacing:.12em;text-transform:uppercase;
  margin-top:10px;font-weight:700}
.gauge .sub{font-size:12.5px;color:var(--ink-3);margin-top:8px}
.bar{height:5px;background:var(--paper-3);border-radius:99px;margin-top:16px;overflow:hidden}
.bar i{display:block;height:100%;border-radius:99px;transition:width .4s ease}
.res-list{margin-top:18px;display:flex;flex-direction:column;gap:2px;max-height:460px;overflow-y:auto}
.res{padding:11px 0;border-bottom:1px solid var(--paper-3)}
.res:last-child{border-bottom:0}
.res-top{display:flex;justify-content:space-between;align-items:baseline;gap:10px}
.res-name{font-size:13.5px;font-weight:600}
.res-n{font-family:var(--mono);font-size:12px;color:var(--ink-3);white-space:nowrap}
.res-hits{margin-top:7px;display:flex;flex-wrap:wrap;gap:5px}
.res-hits span{font-family:var(--mono);font-size:11px;background:var(--flag-soft);color:var(--flag);
  padding:2px 7px;border-radius:2px;border:1px solid #f4dbd0}
.metrics{margin-top:18px;padding-top:16px;border-top:1px solid var(--paper-3);
  font-family:var(--mono);font-size:12px;color:var(--ink-3)}
.metrics div{display:flex;justify-content:space-between;padding:4px 0}
.metrics b{color:var(--ink);font-weight:500}
.empty{text-align:center;color:var(--ink-3);font-size:14px;padding:40px 10px}

/* ---------- footer ---------- */
footer{border-top:1px solid var(--rule);padding:56px 0 76px;font-size:14px;color:var(--ink-3)}
footer h4{font-size:12px;font-family:var(--mono);letter-spacing:.12em;text-transform:uppercase;
  color:var(--ink);margin-bottom:14px}
.fgrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:36px}
footer ol{padding-left:18px;margin:0}
footer li{margin-bottom:9px;line-height:1.55}
footer a{color:var(--accent);text-decoration:none}
footer a:hover{text-decoration:underline}
.colophon{margin-top:44px;padding-top:24px;border-top:1px solid var(--rule);font-size:13px}
</style>
</head>
<body>

<header class="mast">
  <div class="wrap">
    <div class="brand">slop<span>/</span>patterns</div>
    <nav>
      <a href="#mechanism">Mechanism</a>
      <a href="#taxonomy">Taxonomy</a>
      <a href="#validation">Validation</a>
      <a href="#limits">Limits</a>
      <a href="https://pub.hyperagent.com/p/QEeeAx22m4-oPVFXSGkfwe5hQvB02Q7DHVEBma1svHQ" target="_blank" rel="noopener noreferrer">SlopDetector →</a>
    </nav>
  </div>
</header>

<div class="wrap">
  <div class="hero">
    <div class="kicker">Computational stylistics · ${totalPatterns} patterns · ${CATEGORIES.length} categories</div>
    <h1>The fingerprints of machine prose</h1>
    <p class="standfirst">Large language models have a house style. It is measurable, it is documented in the peer-reviewed literature, and a good deal of it can be caught with regular expressions. Here is the full catalogue, the JavaScript to run it, and the false-positive numbers nobody publishing an "AI detector" wants to show you.</p>
    <div class="hero-meta">
      <span>Corpus <b>63,143 words</b></span>
      <span>Human control <b>frozen Dec 2017</b></span>
      <span>Self-test <b>101/101</b></span>
      <span>License <b>CC BY-NC-SA 4.0</b></span>
    </div>
  </div>

  <div class="warning narrow">
    <h2>Read this before you use any of it</h2>
    <p>This is a <strong>style linter</strong>, not an authorship detector. It finds writing habits that language models exhibit more often than most human writers. That is all it does.</p>
    <p>The distinction is not pedantic. In 2023 Liang and colleagues ran seven commercial GPT detectors over 91 TOEFL essays written by humans. The detectors flagged <strong>61.22%</strong> of them as machine-written, against 5.19% for essays by US eighth-graders. <strong>97.8%</strong> of the human TOEFL essays were flagged by at least one detector. The mechanism is simple and it is baked into every tool of this kind, including this one: writing in a careful, formal, limited-vocabulary register looks exactly like what these systems are trained to punish.</p>
    <p>Use these patterns to reread your own sentences. Do not use them to accuse anybody of anything.</p>
  </div>
</div>

<section id="mechanism">
  <div class="wrap narrow">
    <div class="sec-label">01 — Mechanism</div>
    <h2 class="big">Why the house style exists</h2>
    <p class="lede">The tells are not random. Each family of them traces back to something specific in how these models are built and served.</p>

    <h3 class="sub">Frequency regression</h3>
    <p>A language model samples from a probability distribution over tokens. Averaged across millions of generations, its output drifts toward whatever was statistically common in training, then further toward whatever human raters rewarded. Specific facts get replaced by generic, positive-sounding description because generic description is what the distribution says comes next.</p>
    <p>The measured effect is large. Kobak and colleagues compared 15.1 million PubMed abstracts against frequencies extrapolated from pre-ChatGPT trends. In 2024, <em>delves</em> appeared at <strong>28 times</strong> its expected rate. They counted <strong>454 excess words</strong> that year, against a previous record of 190 at the peak of the COVID-19 pandemic — and where the pandemic's excess words were topic nouns, 2024's were overwhelmingly <em>style</em> words: 66% verbs, 14% adjectives. Juzek and Ward, working on scientific abstracts, put the pre/post ratio for <em>delving</em> at roughly 2,240× and <em>showcasing</em> at 1,396×.</p>

    <h3 class="sub">Reinforcement learning rewards a register</h3>
    <p>Instruction tuning teaches the model to be helpful, balanced, and complete. Those are conversational virtues, and they produce conversational artifacts: the acknowledgement before the answer, the hedge that reminds you results may vary, the summary paragraph that closes a section you have just finished reading. Juzek and Ward found that learning from human feedback <em>amplifies</em> frequency biases already present in pre-training, rather than smoothing them out.</p>

    <h3 class="sub">Markdown leaking into prose</h3>
    <p>These systems are trained and served in Markdown. Most of that formatting is visibly structural — headings, bullets, bold — and gets stripped or noticed when text is moved somewhere else. The em dash is the exception: it is simultaneously a Markdown-era typographic habit and a legitimate piece of prose punctuation, so it survives the move. In our own corpus the gap is stark, <strong>2.65 em dashes per thousand words in LLM text against 0.26 in the human control</strong>, a tenfold difference. But this signal is decaying fastest of all: OpenAI explicitly tuned GPT-5.1 to suppress em dashes in late 2025, and by July 2026 <em>The Economist</em> reported that among current models only Claude used them more than professional human writers.</p>

    <h3 class="sub">The interface bleeds through</h3>
    <p>The highest-precision signals are not stylistic at all. They are machine artifacts — the internal citation markup a chatbot renders into its own web UI, copied out along with the text. ChatGPT leaves <code>:contentReference[oaicite:16]</code> and <code>citeturn0search1</code>. Gemini leaves <code>[cite: 17]</code> and <code>[span_2](start_span)</code>. Grok leaves <code>&lt;grok-card data-id=…&gt;</code>. DeepSeek leaves <code>【85†L261-269】</code>. Perplexity leaves <code>[attached_file:1]</code>. None of these is a writing habit. Each is proof that a specific product was in the loop.</p>
  </div>
</section>

<section id="taxonomy">
  <div class="wrap">
    <div class="narrow" style="margin-bottom:8px">
      <div class="sec-label">02 — Taxonomy</div>
      <h2 class="big">${CATEGORIES.length} categories, ${totalPatterns} patterns</h2>
      <p class="lede">Ordered by severity. <strong>Critical</strong> means a machine artifact that a human typing prose essentially never produces. <strong>Low</strong> means an ordinary English word that is meaningless alone and only informative as density. Every regex below is the live source from the library, and every listed example is asserted in the test suite.</p>
    </div>
    <div class="toc">${toc}</div>
    <div class="cats">${cards}</div>
  </div>
</section>

<section id="validation">
  <div class="wrap narrow">
    <div class="sec-label">03 — Validation</div>
    <h2 class="big">What it actually catches</h2>
    <p class="lede">Claims about detection are cheap. These are measured numbers from a run you can reproduce with the code below.</p>

    <p>Three corpora. The <strong>AI article</strong> set is 29 documented LLM outputs that Wikipedia editors archived as evidence when cleaning up machine-written drafts — real chatbot text that a real person pasted into a real encyclopedia. The <strong>AI chat</strong> set is 6 shorter samples in conversational register, from the same archive. The <strong>human control</strong> is 16 Wikipedia articles as they stood in December 2017, more than four years before ChatGPT shipped: same genre, same encyclopedic register, guaranteed pre-LLM.</p>

    <div class="tbl-wrap">
      <table>
        <caption>Score distribution</caption>
        <thead><tr><th>Corpus</th><th class="num">n</th><th class="num">words</th><th class="num">mean</th><th class="num">median</th><th class="num">min</th><th class="num">max</th></tr></thead>
        <tbody>
          <tr><td>AI, article register</td><td class="num">29</td><td class="num">26,863</td><td class="num pos">34.0</td><td class="num">31</td><td class="num">3</td><td class="num">87</td></tr>
          <tr><td>AI, chat register</td><td class="num">6</td><td class="num">778</td><td class="num pos">55.5</td><td class="num">62</td><td class="num">29</td><td class="num">66</td></tr>
          <tr><td>Human, Wikipedia Dec 2017</td><td class="num">16</td><td class="num">35,502</td><td class="num neg">9.9</td><td class="num">9</td><td class="num">4</td><td class="num">20</td></tr>
        </tbody>
      </table>
    </div>

    <p>The separation is real but the overlap matters more than the gap. No human document scored above 20. The lowest-scoring AI document scored 3.</p>

    <div class="tbl-wrap">
      <table>
        <caption>Threshold sweep — AI article corpus vs human control</caption>
        <thead><tr><th class="num">Threshold</th><th class="num">Recall</th><th class="num">False positives</th><th class="num">Precision</th></tr></thead>
        <tbody>
          <tr><td class="num">15</td><td class="num">83%</td><td class="num pos">25%</td><td class="num">86%</td></tr>
          <tr><td class="num">25</td><td class="num">66%</td><td class="num neg">0%</td><td class="num">100%</td></tr>
          <tr><td class="num">35</td><td class="num">38%</td><td class="num neg">0%</td><td class="num">100%</td></tr>
          <tr><td class="num">45</td><td class="num">21%</td><td class="num neg">0%</td><td class="num">100%</td></tr>
          <tr><td class="num">65</td><td class="num">17%</td><td class="num neg">0%</td><td class="num">100%</td></tr>
        </tbody>
      </table>
    </div>

    <div class="callout">
      <p><strong>Read that table honestly.</strong> A threshold clean enough to produce zero false positives on 16 human documents still misses a third of known machine text. Push recall to 83% and one human article in four gets flagged. There is no setting that is both safe and thorough, and this is on a tiny, favourable, single-genre corpus.</p>
    </div>

    <h3 class="sub">The signal that did not survive contact with data</h3>
    <p>"Burstiness" — the idea that humans vary sentence length far more than machines — is the most widely repeated heuristic in this space and a documented input to commercial detectors. On this corpus it does nothing. Mean coefficient of variation in sentence length came out at <strong>0.546 for the AI text and 0.606 for the human text</strong>: a difference in the predicted direction, far too small to separate anything, and swamped by genre. Encyclopedic prose is uniform whoever writes it.</p>
    <p>The em dash, by contrast, held up: <strong>2.65 per thousand words versus 0.26</strong>. So did the machine artifacts, at infinite lift — they appear in 17% of the AI documents and zero human ones, which is what you would expect of a signal that is not about writing at all.</p>

    <h3 class="sub">The noisiest category, and why it stays in</h3>
    <p>Three-item lists fire in <strong>94% of the human documents</strong> and 83% of the AI ones. Measured by document presence the category is worse than useless. Measured by density it still carries a 4.4× lift, because the AI text stacks triads at 3.11 per thousand words against 0.71. It is kept, weighted low, capped hard, and labelled as the highest false-positive family in the file. That is the honest treatment of a weak signal: keep it visible, never let it drive a verdict.</p>

    <h3 class="sub">What the corpus could not test</h3>
    <p>Three categories — model self-identification, editorialising hedges, and analysis-report register — recorded zero hits in <em>both</em> corpora. They are not broken; their unit examples all pass. They are simply absent from Wikipedia-register text, because nobody leaves "As an AI language model" in an encyclopedia draft they are trying to get past reviewers, and encyclopedias do not say "the data paints a clear picture". Those three rest on documented examples alone, and are marked as such rather than quietly presented as validated.</p>
  </div>
</section>

<section id="limits">
  <div class="wrap narrow">
    <div class="sec-label">04 — Limits</div>
    <h2 class="big">Why detection keeps failing</h2>

    <p>The industry's own numbers are the strongest argument against trusting any of this as evidence. OpenAI shipped an AI Text Classifier in January 2023 and withdrew it that July, citing low accuracy; its published figures were a <strong>26% true-positive rate at a 9% false-positive rate</strong> — a tool that missed three-quarters of machine text while wrongly accusing nearly one human document in eleven. Turnitin, which is still deployed at scale in education, states under 1% false positives at the document level but roughly <strong>4% at the sentence level</strong>. Weber-Wulff and colleagues tested fourteen tools in 2023 and concluded they were "neither accurate nor reliable", with detection degrading sharply on paraphrased, human-edited, or translated text.</p>

    <p>Then there is the bias, which is not a bug to be patched. Liang's TOEFL study found that running the human-written essays through ChatGPT to "enhance word choices to sound more like a native speaker" dropped their false-positive rate from 61.22% to <strong>11.77%</strong>. Running the reverse experiment — simplifying American students' essays to sound non-native — pushed their false-positive rate from 5.19% to <strong>56.65%</strong>. The detectors were not finding machines. They were finding low-perplexity prose, which is what you write when you are working carefully in your second language.</p>

    <p>Every category in this file inherits that flaw, and the vocabulary category is where it bites hardest. Formal register, restricted synonym range, careful connectives: this is what good non-native academic English looks like, and it is also what the model does.</p>

    <h3 class="sub">The target moves</h3>
    <p>Wikipedia's editors track which words cluster in which model era. Their breakdown: <em>delve, tapestry, testament, pivotal, meticulous, intricate</em> for GPT-4 through mid-2024; <em>align with, showcase, foster, enhance, vibrant</em> for the GPT-4o period; <em>emphasising, highlighting, showcasing</em> from mid-2025. <em>Delve</em> itself, the most famous tell of all, dropped off sharply during 2025. The library tags patterns by era for this reason. Any wordlist of this kind is a photograph of a particular season of model releases, and it starts decaying the day it is written.</p>

    <p>It also decays because it is adversarial. Once a tell becomes notorious, it gets tuned out — as happened to the em dash in GPT-5.1. The signals that survive are the ones nobody is optimising against, which is precisely why the vendor citation artifacts are the most durable category here and the vocabulary list is the least.</p>

    <div class="callout">
      <p><strong>What this is good for.</strong> Linting your own drafts before you publish. Reviewing a pull request against a house style guide. Feeding the pattern list to a model as instructions for what not to write. Getting a fast second opinion on prose that feels off, before you reread it properly yourself.</p>
      <p><strong>What it is not good for.</strong> Grading students. Screening job applicants. Moderation decisions. Anything where a person bears a cost for being wrongly flagged.</p>
    </div>
  </div>
</section>

<section id="tool">
  <div class="wrap narrow">
    <div class="sec-label">05 — The tool</div>
    <h2 class="big">SlopDetector</h2>
    <p class="lede">Everything above, as something you can actually use. Paste prose and every
    match is highlighted in place; click one to see which rule fired, why models produce it,
    and how it earns false positives.</p>

    <p>It runs entirely in your browser — no upload, no logging, verifiable in view-source.
    The engine is not a reimplementation: the page is generated by a build step that inlines the
    same two modules the command-line linter and the HTTP API import, so all three surfaces
    return identical findings for identical input. That equivalence is asserted by a test, which
    is how a real discrepancy surfaced: one rule shipped disabled in the CLI and enabled in the
    API, because the default lived in the wrong file.</p>

    <p style="margin-top:32px">
      <a href="https://pub.hyperagent.com/p/QEeeAx22m4-oPVFXSGkfwe5hQvB02Q7DHVEBma1svHQ" target="_blank" rel="noopener noreferrer"
         style="display:inline-block;background:var(--ink);color:#fff;text-decoration:none;
                padding:15px 30px;border-radius:3px;font-weight:600;font-size:1.03rem;
                letter-spacing:-.01em">Open SlopDetector →</a>
    </p>

    <h3 class="sub">Or run it yourself</h3>
    <p>The catalogue ships as a zero-dependency npm package with a CLI, an ESLint-style config,
    a pre-commit hook, and an HTTP API you can deploy to Cloudflare Workers or run locally.</p>
    <div class="tbl-wrap">
      <table>
        <caption>Three surfaces, one engine</caption>
        <thead><tr><th>Surface</th><th>Command</th><th>For</th></tr></thead>
        <tbody>
          <tr><td>Browser</td><td><code>SlopDetector</code></td><td>Reading a draft, exploring the rules</td></tr>
          <tr><td>CLI</td><td><code>npx slop "docs/**/*.md"</code></td><td>Pre-commit hooks, CI gates, editors</td></tr>
          <tr><td>API</td><td><code>npx -p ai-text-patterns slop-serve</code></td><td>Other apps, pipelines, deployment</td></tr>
        </tbody>
      </table>
    </div>
    <p>The CLI exits <code>0</code> clean, <code>1</code> on a lint failure and <code>2</code> on a
    config error, so a broken config never masquerades as a prose problem. Critical-tier rules —
    the vendor citation artifacts — are the only ones worth gating a build on.</p>
  </div>
</section>

<footer>
  <div class="wrap">
    <div class="fgrid">
      <div>
        <h4>Sources</h4>
        <ol>
          <li><a href="https://en.wikipedia.org/wiki/Wikipedia:Signs_of_AI_writing" target="_blank" rel="noopener noreferrer">Wikipedia:Signs of AI writing</a>, WikiProject AI Cleanup. The most complete public catalogue, continuously updated.</li>
          <li>Kobak, González-Márquez, Horvát &amp; Lause. <a href="https://www.science.org/doi/10.1126/sciadv.adt3813" target="_blank" rel="noopener noreferrer">Delving into LLM-assisted writing in biomedical publications through excess vocabulary</a>. <em>Science Advances</em> 11(27), 2025.</li>
          <li>Juzek &amp; Ward. <a href="https://arxiv.org/abs/2412.11385" target="_blank" rel="noopener noreferrer">Why Does ChatGPT "Delve" So Much?</a> Findings of ACL, 2025.</li>
          <li>Liang, Yüksekgönül, Mao, Wu &amp; Zou. <a href="https://www.cell.com/patterns/fulltext/S2666-3899(23)00130-7" target="_blank" rel="noopener noreferrer">GPT detectors are biased against non-native English writers</a>. <em>Patterns</em> 4(7), 2023.</li>
          <li>Russell, Karpinska &amp; Iyyer. <a href="https://aclanthology.org/2025.acl-long.267/" target="_blank" rel="noopener noreferrer">People who frequently use ChatGPT for writing tasks are accurate and robust detectors of AI-generated text</a>. ACL, 2025.</li>
          <li>Weber-Wulff et al. <a href="https://arxiv.org/abs/2306.15666" target="_blank" rel="noopener noreferrer">Testing of Detection Tools for AI-Generated Text</a>, 2023.</li>
          <li>Merrill, Chen &amp; Kumer. <a href="https://www.washingtonpost.com/technology/interactive/2025/how-detect-chatgpt-em-dash/" target="_blank" rel="noopener noreferrer">What are the clues that ChatGPT wrote something?</a> <em>The Washington Post</em>, 13 Nov 2025.</li>
          <li><a href="https://www.economist.com/culture/2026/07/30/how-to-spot-ai-writing" target="_blank" rel="noopener noreferrer">How to spot AI writing</a>. <em>The Economist</em>, 30 Jul 2026.</li>
          <li><a href="https://www.turnitin.com/blog/understanding-the-false-positive-rate-for-sentences-of-our-ai-writing-detection-capability" target="_blank" rel="noopener noreferrer">Understanding the false positive rate for sentences</a>. Turnitin, 14 Jun 2023.</li>
          <li><a href="https://aiwritingguide.misterburton.com" target="_blank" rel="noopener noreferrer">Anti-AI Writing Guide for Robots</a> — a machine-readable rendering of the Wikipedia catalogue, exportable as a system prompt.</li>
        </ol>
      </div>
      <div>
        <h4>Method</h4>
        <p style="font-size:13.5px;line-height:1.6">Human control: 16 English Wikipedia articles retrieved at their last revision before 1 January 2018 via the MediaWiki API, wikitext stripped to prose. AI corpora: the 29 archived subpages of <code>Wikipedia:Signs of AI writing/Examples</code> exceeding 250 words, plus 6 chat-register excerpts quoted in the parent page. Scoring counts distinct surface forms per category, weights by severity, caps per category, and normalises toward a 500-word reference length. Code blocks are stripped before matching. Typography metrics run on raw text before Unicode folding.</p>
      </div>
      <div>
        <h4>Reproducing</h4>
        <p style="font-size:13.5px;line-height:1.6">The bundle contains the <code>ai-text-patterns</code> npm package (library, CLI, four reporters, HTTP API, 64 tests), the SlopDetector page and its build step, plus the research harness: <code>build-corpus.py</code> and <code>build-ai-corpus.py</code> for corpus construction, <code>validate.mjs</code> for the run that produced every number on this page, and <code>validation-report.txt</code> as its raw output.</p>
      </div>
    </div>
    <div class="colophon">
      Pattern catalogue derived from Wikipedia:Signs of AI writing, used under CC BY-NC-SA 4.0; this page and the library carry the same licence. Measurements were produced on a corpus of 63,143 words and should be read as indicative of that corpus, not as general accuracy claims.
    </div>
  </div>
</footer>


</body>
</html>`;

writeFileSync('public/index.html', html);
console.log(`wrote public/index.html — ${(html.length / 1024).toFixed(1)} KB, ${CATEGORIES.length} categories, ${totalPatterns} patterns`);
