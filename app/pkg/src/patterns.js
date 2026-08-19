/**
 * ai-text-patterns.js
 * ---------------------------------------------------------------------------
 * A regex catalogue of surface-level patterns characteristic of LLM-generated
 * English prose, organised by category, with a scoring helper.
 *
 * WHAT THIS IS:  a style linter. It finds writing habits that large language
 * models exhibit far more often than most human writers.
 *
 * WHAT THIS IS NOT:  an authorship detector. A high score means "this reads
 * like LLM default register". It does not mean "a machine wrote this", and a
 * low score does not mean a human did. Published false-positive rates for
 * real AI detectors run from ~4% per sentence (Turnitin's own figure) to
 * 61% on human-written essays by non-native English speakers (Liang et al.,
 * Patterns, 2023). Treat every hit as a prompt to reread a sentence, never as
 * evidence of misconduct.
 *
 * Severity tiers:
 *   critical — machine artifacts. Essentially never produced by a human
 *              typing prose. A single hit is close to conclusive that text
 *              was pasted out of a chatbot.
 *   high     — assistant-register leakage. Chat scaffolding that survived
 *              into a document. Rare in edited human prose.
 *   medium   — rhetorical formulas. Human writers do this, LLMs do it far
 *              more, and far more mechanically.
 *   low      — individually meaningless vocabulary and jargon. Only
 *              informative in aggregate, as density.
 *
 * Source material:
 *   - Wikipedia:Signs of AI writing (WikiProject AI Cleanup), en.wikipedia.org
 *   - Kobak, González-Márquez, Horvát & Lause, "Delving into LLM-assisted
 *     writing in biomedical publications through excess vocabulary",
 *     Science Advances 11(27), 2025. doi:10.1126/sciadv.adt3813
 *   - Juzek & Ward, "Why Does ChatGPT 'Delve' So Much?", Findings of ACL 2025.
 *     arXiv:2412.11385
 *   - Liang et al., "GPT detectors are biased against non-native English
 *     writers", Patterns 4(7), 2023.
 *   - Merrill, Chen & Kumer, The Washington Post, 13 Nov 2025.
 *   - "How to spot AI writing", The Economist, 30 July 2026.
 *
 * Engineering notes:
 *   - Every pattern is a fresh RegExp literal with the `g` flag. Patterns are
 *     read via String.prototype.matchAll, which clones the regex, so the
 *     module-level objects never accumulate `lastIndex` state.
 *   - No nested unbounded quantifiers over overlapping character classes, so
 *     there is no catastrophic-backtracking exposure. All `.{n,m}` spans are
 *     explicitly bounded.
 *   - Lookbehind `(?<=...)` is deliberately avoided for Safari < 16.4
 *     compatibility. The `u` flag is used only where `\p{...}` is required.
 *   - Text is normalised (NFC, curly punctuation folded) before matching, so
 *     patterns are written against straight quotes and plain apostrophes.
 *     The typography signals are measured separately, before normalisation.
 *
 * License: CC BY-NC-SA 4.0 (inherits from the Wikipedia source material).
 */

/* ==========================================================================
 * 1. Normalisation
 * ========================================================================== */

/**
 * Fold typographic variants so that a single pattern can match both
 * "it's" and "it’s". Run this before matching, not before measuring
 * typography (see TYPOGRAPHY_METRICS, which needs the raw characters).
 *
 * IMPORTANT - this function is length-preserving. Every replacement maps one
 * code unit to one code unit, and NFC normalisation is applied only when it
 * does not change the string's length. Callers depend on this: match offsets
 * taken against normalised text are reported as line and column numbers in the
 * ORIGINAL file, so any drift here silently corrupts every position the linter
 * prints. The test suite pins this property with a property-based check.
 *
 * Consequence: an ellipsis folds to a single period rather than expanding to
 * three. No pattern in the catalogue depends on ellipses.
 */
export function normalize(text) {
  let s = String(text);
  const nfc = s.normalize('NFC');
  if (nfc.length === s.length) s = nfc;
  return s
    .replace(/[‘’‚‛′]/g, "'")
    .replace(/[“”„‟″]/g, '"')
    .replace(/[      ⁠]/g, ' ')
    .replace(/…/g, '.');
}

/**
 * Replace fenced and inline code spans with runs of spaces of identical
 * length. Newlines are preserved so line numbers survive, and total length is
 * preserved so character offsets survive. Use this instead of deleting code:
 * deleting it shifts every subsequent offset and corrupts reported positions.
 */
export function maskCode(text) {
  const blank = (m) => m.replace(/[^\n]/g, ' ');
  return String(text)
    .replace(/```[\s\S]*?(?:```|$)/g, blank)
    .replace(/~~~[\s\S]*?(?:~~~|$)/g, blank)
    .replace(/`[^`\n]*`/g, blank);
}

/**
 * Build a line-offset index once, then resolve character offsets to 1-based
 * line/column pairs in O(log n) per lookup.
 */
export function lineIndex(text) {
  const starts = [0];
  for (let i = 0; i < text.length; i++) if (text[i] === '\n') starts.push(i + 1);
  return {
    starts,
    locate(offset) {
      let lo = 0, hi = starts.length - 1;
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (starts[mid] <= offset) lo = mid; else hi = mid - 1;
      }
      return { line: lo + 1, column: offset - starts[lo] + 1 };
    },
    lineText(line) {
      const s = starts[line - 1];
      if (s === undefined) return '';
      const e = starts[line] === undefined ? text.length : starts[line] - 1;
      return text.slice(s, e);
    }
  };
}

const WORD_RE = /[A-Za-z][A-Za-z'-]*/g;

export function wordCount(text) {
  const m = String(text).match(WORD_RE);
  return m ? m.length : 0;
}

/* ==========================================================================
 * 2. The catalogue
 * ==========================================================================
 * Each category:
 *   id        stable machine key
 *   label     human name
 *   severity  critical | high | medium | low
 *   weight    points contributed per distinct hit (see scoreText)
 *   cap       maximum points this category can contribute
 *   why       one-line explanation of the underlying cause
 *   caution   the realistic false-positive scenario
 *   combined  a single union regex for the whole category
 *   patterns  individually named sub-patterns
 */

export const CATEGORIES = [

  /* ---------------------------------------------------------------- */
  {
    id: 'tool_artifacts',
    label: 'Chatbot tool artifacts',
    severity: 'critical',
    weight: 40,
    cap: 60,
    why:
      'Internal citation and rendering markup that leaks when a user copies a ' +
      'chatbot answer out of the web UI. Each vendor has its own signature.',
    caution:
      'Almost none. The only realistic false positive is an article that ' +
      'quotes these markers while discussing AI detection — such as this one.',
    patterns: [
      {
        id: 'openai_citation_markup',
        vendor: 'ChatGPT',
        re: /:?contentReference\[oaicite:\d+\]|oai_citation:?\s*\d*|\boaicite\b/g,
        note: 'ChatGPT reference placeholders.',
        examples: [':contentReference[oaicite:16]{index=16}', '[oai_citation:0‡example.com]']
      },
      {
        id: 'openai_turn_tokens',
        vendor: 'ChatGPT',
        re: /\b(?:cite)?turn\d+(?:search|image|news|file|view|forecast)\d+\b/g,
        note: 'Search/image result tokens, PUA-wrapped in the original response.',
        examples: ['citeturn0search1', 'turn0image4']
      },
      {
        id: 'openai_attribution_json',
        vendor: 'ChatGPT',
        re: /\{\s*"attribution"\s*:\s*\{\s*"attributableIndex"/g,
        note: 'JSON attribution blob appended to sentences.',
        examples: ['({"attribution":{"attributableIndex":"1009-1"}})']
      },
      {
        id: 'gemini_cite_markers',
        vendor: 'Gemini',
        re: /\[cite:\s*\d+(?:\s*,\s*\d+)*\]|\[cite_start\]/g,
        note: 'Gemini inline citation markers.',
        examples: ['[cite: 17]', '[cite: 19, 20, 21]']
      },
      {
        id: 'gemini_span_markers',
        vendor: 'Gemini',
        re: /\[span_\d+\]\((?:start|end)_span\)/g,
        note: 'Gemini span formatting bug.',
        examples: ['[span_2](start_span)']
      },
      {
        id: 'grok_cards',
        vendor: 'Grok',
        re: /<grok-card\b|grok_render_citation_card_json|data-type="citation_card"/g,
        note: 'Grok citation card markup.',
        examples: ['<grok-card data-id="e8ff4f" data-type="citation_card">']
      },
      {
        id: 'deepseek_lenticular',
        vendor: 'DeepSeek',
        re: /【\d+†L?\d+(?:-L?\d+)?】/g,
        note: 'Lenticular-bracket + dagger source refs.',
        examples: ['【85†L261-269】']
      },
      {
        id: 'perplexity_tags',
        vendor: 'Perplexity',
        re: /\[(?:attached_file|web|search):\s*\d+\]|ppl-ai-file-upload/g,
        note: 'Perplexity attachment and web-result tags.',
        examples: ['[attached_file:1]', '[web:1]']
      },
      {
        id: 'writing_variant_block',
        vendor: 'unclassified',
        re: /:{3}\s*(?:writing|ecriture|écriture)\s*\{\s*(?:variant|variante)\s*=/gi,
        note: 'Document-variant fence seen from mid-2026.',
        examples: [':::writing{variant="document" id="68427"}']
      },
      {
        id: 'chatgpt_utm',
        vendor: 'ChatGPT',
        re: /utm_source=(?:chatgpt\.com|openai)/gi,
        note: 'Tracking parameter on links copied out of ChatGPT.',
        examples: ['https://example.com/?utm_source=chatgpt.com']
      }
    ]
  },

  /* ---------------------------------------------------------------- */
  {
    id: 'ai_self_reference',
    label: 'Model self-identification',
    severity: 'critical',
    weight: 35,
    cap: 50,
    why:
      'The assistant describing its own nature or limits. Refusal and ' +
      'disclaimer boilerplate that was never edited out.',
    caution:
      'Quoted examples in writing about AI. Check whether the phrase sits ' +
      'inside quotation marks.',
    patterns: [
      {
        id: 'as_an_ai',
        re: /\bas an? (?:AI|artificial intelligence)(?: language)?(?: model| assistant| system)?\b/gi,
        note: 'The canonical tell.',
        examples: ['As an AI language model, I cannot...']
      },
      {
        id: 'as_a_llm',
        re: /\bas a large language model\b/gi,
        note: '',
        examples: ['As a large language model, I do not have...']
      },
      {
        id: 'no_personal_capacity',
        re: /\bI (?:don't|do not|cannot|can't) have (?:personal |any )?(?:opinions|feelings|beliefs|preferences|access to real[- ]time|the ability to browse)\b/gi,
        note: 'Capability disclaimer.',
        examples: ["I don't have personal opinions, but..."]
      },
      {
        id: 'language_model_self',
        re: /\bI(?:'m| am) (?:an? )?(?:AI|language model|chatbot|virtual assistant)\b/gi,
        note: '',
        examples: ["I'm an AI, so I..."]
      }
    ]
  },

  /* ---------------------------------------------------------------- */
  {
    id: 'knowledge_cutoff',
    label: 'Knowledge-cutoff and source-gap hedging',
    severity: 'high',
    weight: 14,
    cap: 40,
    why:
      'The model signalling that its training data ran out, or narrating the ' +
      'thinness of its own retrieved sources instead of just omitting the claim.',
    caution:
      'Legitimate scholarship does say "records are scarce". The tell is the ' +
      'first-person framing and the reference to "available information".',
    patterns: [
      {
        id: 'last_update',
        re: /\b(?:as of|up to|until) my (?:last |latest |most recent )?(?:knowledge |training |data )?(?:update|cutoff|cut-off)\b/gi,
        note: '',
        examples: ['As of my last knowledge update, ...']
      },
      {
        id: 'available_information',
        re: /\bbased on (?:the )?(?:available|provided) (?:information|sources|data)\b|\bin the (?:provided|given) sources\b/gi,
        note: '',
        examples: ['Based on available information, ...']
      },
      {
        id: 'details_limited',
        re: /\b(?:while |although )?(?:specific |further |additional )?details (?:are|remain) (?:limited|scarce|sparse|not widely (?:available|documented|disclosed))\b/gi,
        note: '',
        examples: ['While specific details are limited, ...']
      },
      {
        id: 'not_widely_documented',
        re: /\bnot widely (?:available|documented|disclosed|reported|publicised|publicized)\b/gi,
        note: '',
        examples: ['His early career is not widely documented.']
      },
      {
        id: 'private_life_speculation',
        re: /\bkeeps? (?:much of )?(?:his|her|their) personal life private\b|\bmaintains? a low profile\b/gi,
        note: 'Gap-filling speculation about biography subjects.',
        examples: ['She keeps much of her personal life private.']
      },
      {
        id: 'inference_disclosure',
        re: /\bI(?:'ve| have) inferred\b|\bmy analysis is based on\b|\blikely due to limited (?:mainstream )?(?:exposure|coverage|documentation)\b/gi,
        note: '',
        examples: ["I've inferred common motifs..."]
      }
    ]
  },

  /* ---------------------------------------------------------------- */
  {
    id: 'collaborative_scaffolding',
    label: 'Conversational scaffolding',
    severity: 'high',
    weight: 12,
    cap: 45,
    why:
      'Turn-taking pleasantries from the chat interface. RLHF rewards them; ' +
      'they have no function inside a finished document.',
    caution:
      'Genuine correspondence, teaching material, and newsletters legitimately ' +
      'address a reader. Weigh by genre — an encyclopedia entry should have none.',
    patterns: [
      {
        id: 'hope_this_helps',
        re: /\bI hope (?:this|that) helps\b|\bhope this (?:helps|is helpful)\b/gi,
        note: '',
        examples: ['I hope this helps!']
      },
      {
        id: 'enthusiastic_openers',
        re: /(?:^|[.!?]\s+|\n)\s*(?:Certainly|Absolutely|Of course|Sure thing|Great question|Excellent question|Fantastic question|Happy to help)\s*[!,.]/g,
        note: 'Opening acknowledgement token.',
        examples: ['Certainly! Here is a summary.']
      },
      {
        id: 'offer_more',
        re: /\bwould you like me to\b|\blet me know if (?:you|there|that|I)\b|\bfeel free to (?:ask|reach out|let me know)\b|\bif you(?:'d| would) like,? I can\b/gi,
        note: '',
        examples: ['Let me know if you would like me to expand this.']
      },
      {
        id: 'here_is_a',
        re: /\bhere(?:'s| is| are)\s+(?:a|an|the)\s+(?:brief |quick |detailed |comprehensive |more detailed )?(?:breakdown|overview|summary|rundown|deep dive|look at)\b/gi,
        note: '',
        examples: ["Here's a detailed breakdown of the options."]
      },
      {
        id: 'lets_dive_in',
        re: /\blet(?:'s| us) (?:dive (?:in|into)|explore|take a (?:look|closer look)|unpack|break (?:this|it) down|get started)\b/gi,
        note: '',
        examples: ["Let's dive into the details."]
      },
      {
        id: 'youre_right',
        re: /\byou(?:'re| are) (?:absolutely |completely |quite )?right\b|\bgreat point\b|\bthat(?:'s| is) a (?:great|excellent|fair) point\b/gi,
        note: 'Sycophantic agreement token.',
        examples: ["You're absolutely right to point that out."]
      },
      {
        id: 'meta_offer_feedback',
        re: /\bhappy to (?:address|answer|clarify|expand on) any (?:further|additional|other)\b|\bI(?:'m| am) open to (?:any |further )?(?:suggestions|feedback|guidance|input)\b|\bI would (?:greatly )?appreciate (?:your )?(?:guidance|feedback|input)\b/gi,
        note: '',
        examples: ['Happy to address any further concerns.']
      }
    ]
  },

  /* ---------------------------------------------------------------- */
  {
    id: 'placeholder_text',
    label: 'Unfilled placeholders',
    severity: 'critical',
    weight: 25,
    cap: 40,
    why:
      'Template slots the model emitted for a human to fill, shipped unfilled.',
    caution:
      'Documentation and code samples use angle-bracket placeholders on ' +
      'purpose. Restrict this check to prose, not code blocks.',
    patterns: [
      {
        id: 'bracket_insert',
        re: /\[(?:INSERT|ADD|ENTER|YOUR|PASTE|TODO|TBD|XX+)[^\]\n]{0,40}\]/gi,
        note: '',
        examples: ['[INSERT SOURCE URL]', '[Your Name Here]']
      },
      {
        id: 'screaming_snake_slot',
        re: /\b(?:INSERT|PASTE|ADD)_[A-Z_]{3,}\b|\bSOURCE_(?:URL|PUBLISHER|NAME)\b|\bURL_HERE\b/g,
        note: '',
        examples: ['INSERT_SOURCE_URL', 'PASTE_URL_HERE']
      },
      {
        id: 'dummy_date',
        re: /\b(?:19|20)\d{2}-(?:xx|XX|mm|MM)-(?:xx|XX|dd|DD)\b|\bYYYY-MM-DD\b/g,
        note: '',
        examples: ['2025-xx-xx']
      },
      {
        id: 'delete_before_submission',
        re: /\b(?:delete|remove) this (?:section|line|note|paragraph) before (?:submission|publishing|sending)\b/gi,
        note: '',
        examples: ['Delete this section before submission.']
      }
    ]
  },

  /* ---------------------------------------------------------------- */
  {
    id: 'significance_statements',
    label: 'Significance and legacy inflation',
    severity: 'medium',
    weight: 7,
    cap: 45,
    why:
      'Rather than state a fact and stop, the model appends a claim about why ' +
      'the fact matters. This is the single most characteristic move in LLM ' +
      'encyclopedic prose, and the hardest for the model to suppress.',
    caution:
      'Obituaries, award citations, and advocacy writing make these claims ' +
      'sincerely. Density matters more than any single instance.',
    patterns: [
      {
        id: 'stands_as_testament',
        re: /\b(?:stands?|serves?|remains?) as an? (?:enduring |lasting |powerful |living |stark )?(?:testament|testimony|reminder|symbol|beacon|hallmark|cornerstone|monument|celebration)\b/gi,
        note: '',
        examples: ['The bridge stands as a testament to Victorian engineering.']
      },
      {
        id: 'vital_role',
        re: /\b(?:plays?|played|playing|has played) an? (?:vital|crucial|pivotal|significant|central|key|critical|important|instrumental|major) role\b/gi,
        note: '',
        examples: ['She played a pivotal role in the negotiations.']
      },
      {
        id: 'underscores_importance',
        re: /\b(?:underscore[sd]?|highlight(?:s|ed)?|emphasi[sz]e[sd]?|reflect(?:s|ed)?|demonstrate[sd]?|illustrate[sd]?) (?:the |its |their |his |her )?(?:importance|significance|centrality|enduring|lasting|ongoing|continued|broader|vital)\b/gi,
        note: '',
        examples: ['This underscores the importance of early testing.']
      },
      {
        id: 'enduring_legacy',
        re: /\b(?:enduring|lasting|indelible|profound|far-reaching|ongoing) (?:legacy|impact|influence|mark|imprint|significance|relevance|contribution)\b/gi,
        note: '',
        examples: ['He left an indelible mark on the discipline.']
      },
      {
        id: 'turning_point',
        re: /\b(?:key |major |critical |defining )?turning point\b|\bwatershed moment\b|\bmark(?:s|ed|ing)? a (?:shift|departure|new (?:chapter|era)|milestone)\b|\bsetting the stage for\b/gi,
        note: '',
        examples: ['1968 marked a turning point for the movement.']
      },
      {
        id: 'evolving_landscape',
        re: /\b(?:ever-)?(?:evolving|changing|shifting|dynamic) (?:landscape|world|environment|ecosystem|terrain)\b|\bin (?:today's|the modern) (?:fast-paced|rapidly changing|digital) (?:world|landscape|environment)\b/gi,
        note: '',
        examples: ['In the ever-evolving landscape of cybersecurity...']
      },
      {
        id: 'deeply_rooted',
        re: /\bdeeply (?:rooted|embedded|ingrained|intertwined)\b|\breflects? (?:a )?broader (?:trends?|shifts?|patterns?|movements?)\b|\bfocal point\b/gi,
        note: '',
        examples: ['The practice is deeply rooted in local tradition.']
      },
      {
        id: 'contributing_to',
        re: /\bcontribut(?:es?|ed|ing) to (?:the )?(?:rich |broader |ongoing |overall )?(?:tapestry|fabric|mosaic|development|discourse|understanding|conversation|dialogue)\b/gi,
        note: '',
        examples: ['...contributing to the rich tapestry of city life.']
      }
    ]
  },

  /* ---------------------------------------------------------------- */
  {
    id: 'participial_tackon',
    label: 'Trailing participial commentary',
    severity: 'medium',
    weight: 8,
    cap: 40,
    why:
      'A comma followed by an "-ing" clause that adds evaluation rather than ' +
      'information. The model uses it to make a bare fact feel analysed.',
    caution:
      'Perfectly grammatical and sometimes genuinely informative. The tell is ' +
      'that the clause could be deleted with zero loss of meaning.',
    patterns: [
      {
        id: 'ing_significance_clause',
        re: /,\s+(?:highlighting|emphasi[sz]ing|underscoring|showcasing|reflecting|demonstrating|illustrating|signalling|signaling|cementing|solidifying|reinforcing|affirming|confirming|marking|symbolizing|symbolising|embodying|fostering|cultivating|ensuring|encompassing)\s+(?:its|their|his|her|the|a|an)\b/gi,
        note: 'The core construction.',
        examples: [', highlighting its cultural significance.']
      },
      {
        id: 'creating_a_space',
        re: /\bcreating a (?:space|sense|environment|community|platform|foundation) (?:where|for|of)\b|\bfostering a (?:sense|culture|spirit|climate) of\b/gi,
        note: '',
        examples: ['...fostering a sense of community.']
      },
      {
        id: 'ongoing_relevance',
        re: /\b(?:demonstrating|confirming|illustrating|reflecting|affirming)\s+(?:the\s+)?(?:ongoing|enduring|lasting|continued|persistent)\s+(?:relevance|influence|importance|appeal|significance)\b/gi,
        note: '',
        examples: ['...confirming the enduring relevance of the form.']
      }
    ]
  },

  /* ---------------------------------------------------------------- */
  {
    id: 'negative_parallelism',
    label: 'Negative parallelism',
    severity: 'medium',
    weight: 10,
    cap: 45,
    why:
      'Defining something by first denying a lesser description. Documented as ' +
      'a stereotypical AI construction by the Washington Post, The Economist, ' +
      'and Russell et al. (ACL 2025).',
    caution:
      'A real rhetorical device with a long human pedigree. Speechwriting and ' +
      'myth-busting listicles use it deliberately. Repetition is the tell.',
    patterns: [
      {
        id: 'not_only_but_also',
        re: /\bnot only\b[^.!?\n]{1,80}?\bbut(?: also)?\b/gi,
        note: '',
        examples: ['Not only did it fail, but it also cost millions.']
      },
      {
        id: 'not_just_its',
        re: /\bnot (?:just|merely|simply)\b[^.!?\n]{1,80}?[,;—-]\s*(?:it(?:'s| is)|they(?:'re| are)|but)\b/gi,
        note: '',
        examples: ["It's not just a phone — it's a platform."]
      },
      {
        id: 'its_not_its',
        re: /\bit(?:'s| is)\s+not\s+(?:about\s+)?[^.!?\n]{1,60}?[,;—-]\s*it(?:'s| is)\b/gi,
        note: '',
        examples: ["It's not about speed, it's about accuracy."]
      },
      {
        id: 'no_no_just',
        re: /\bno\s+\w+(?:\s+\w+)?,\s+no\s+\w+(?:\s+\w+)?,\s+(?:just|only)\b/gi,
        note: '',
        examples: ['No hype, no jargon, just results.']
      },
      {
        id: 'isnt_x_its_y',
        re: /\b(?:this|that|it|there)\s+(?:is|was)\s?n(?:'|o)t\s+[^.!?\n]{1,60}?[—-]\s*(?:it(?:'s| is)|that(?:'s| is))\b/gi,
        note: 'Em-dash-joined variant.',
        examples: ["This isn't a setback — it's a redirection."]
      },
      {
        id: 'rather_than_contrast',
        re: /\b(?:prioriti[sz]ing|choosing|favou?ring|emphasi[sz]ing|seeking)\b[^.!?\n]{1,70}?\brather than\b/gi,
        note: 'The reversed form; common in Grok output.',
        examples: ['...prioritizing consolidation rather than ideological purity.']
      }
    ]
  },

  /* ---------------------------------------------------------------- */
  {
    id: 'rule_of_three',
    label: 'Mechanical triads',
    severity: 'medium',
    weight: 5,
    cap: 25,
    why:
      'LLMs reach for three-item lists far more often than the content ' +
      'warrants, especially adjective triads used to pad a thin claim.',
    caution:
      'Highest false-positive category in this file. Three-item lists are ' +
      'ordinary English. Only meaningful when several appear per paragraph.',
    patterns: [
      {
        id: 'adjective_triad',
        re: /\b(\w+ly\s+)?(\w{4,}),\s+(\w{4,}),\s+and\s+(\w{4,})\b/g,
        note: 'Generic X, Y, and Z triad. Count, do not read individually.',
        examples: ['clear, concise, and compelling']
      },
      {
        id: 'triad_closer',
        re: /\b\w+,\s+\w+,\s+and\s+\w+\s+(?:alike|together|combined|all at once)\b/gi,
        note: '',
        examples: ['critics, fans, and scholars alike']
      }
    ]
  },

  /* ---------------------------------------------------------------- */
  {
    id: 'ritual_conclusion',
    label: 'Ritual conclusions',
    severity: 'medium',
    weight: 9,
    cap: 30,
    why:
      'Chat answers are trained to close with a wrap-up. Transplanted into an ' +
      'article, the summary restates what the reader just read.',
    caution:
      'Academic papers and reports have legitimate conclusion sections. The ' +
      'tell is a summary paragraph closing every section, not just the piece.',
    patterns: [
      {
        id: 'in_conclusion',
        re: /(?:^|\n|[.!?]\s+)\s*(?:In (?:conclusion|summary|essence|short)|Ultimately|Overall|To sum up|All in all|In the end),/g,
        note: '',
        examples: ['In conclusion, the evidence is mixed.']
      },
      {
        id: 'conclusion_heading',
        re: /^[ \t]*#{1,6}\s*(?:Conclusion|Summary|Final [Tt]houghts|Key [Tt]akeaways?|Wrapping [Uu]p|The [Bb]ottom [Ll]ine|Future [Oo]utlook|Looking [Aa]head)\s*:?\s*$/gm,
        note: '',
        examples: ['## Key Takeaways']
      },
      {
        id: 'bottom_line',
        re: /\bthe bottom line (?:is|here is)\b|\bat the end of the day,/gi,
        note: '',
        examples: ['The bottom line is that costs rose.']
      }
    ]
  },

  /* ---------------------------------------------------------------- */
  {
    id: 'challenges_and_future',
    label: 'Challenges-and-future formula',
    severity: 'medium',
    weight: 9,
    cap: 30,
    why:
      'A structural template: concede a difficulty, then reassure. It fills ' +
      'space without adding a single verifiable fact.',
    caution:
      'Strategy documents and policy briefs are supposed to do this. Judge by ' +
      'whether the challenges are named specifically or gestured at.',
    patterns: [
      {
        id: 'despite_challenges',
        re: /\bdespite (?:these |its |the |such )?(?:challenges|obstacles|setbacks|difficulties|limitations|criticism)\b/gi,
        note: '',
        examples: ['Despite these challenges, the project continues to thrive.']
      },
      {
        id: 'faces_challenges',
        re: /\bfaces? (?:several |a number of |numerous |significant |ongoing )?(?:challenges|hurdles|obstacles)(?: that must be addressed)?\b/gi,
        note: '',
        examples: ['The sector faces several challenges that must be addressed.']
      },
      {
        id: 'continues_to',
        re: /\bcontinue[sd]? to (?:evolve|thrive|grow|shape|serve|inspire|play|provide|resonate|attract)\b/gi,
        note: '',
        examples: ['The festival continues to thrive.']
      },
      {
        id: 'future_lies_in',
        re: /\bthe future of\b[^.!?\n]{1,60}?\b(?:lies in|will depend on|hinges on|remains (?:bright|uncertain|promising))\b|\bpositions? (?:it|them|itself) (?:well )?for (?:future|continued|further)\b/gi,
        note: '',
        examples: ['The future of the format lies in its ability to adapt.']
      },
      {
        id: 'sparked_conversation',
        re: /\b(?:sparked|prompted|generated|ignited|raised) (?:broader |wider |important |renewed )?(?:conversations?|debates?|discussions?|reflections?|questions?) (?:about|around|regarding)\b/gi,
        note: '',
        examples: ['The ruling sparked broader conversations about privacy.']
      }
    ]
  },

  /* ---------------------------------------------------------------- */
  {
    id: 'vague_attribution',
    label: 'Vague attribution',
    severity: 'medium',
    weight: 8,
    cap: 35,
    why:
      'Consensus asserted without a nameable source. The model cannot cite ' +
      'what it does not have, so it invokes an anonymous collective.',
    caution:
      'Journalism uses "experts say" under real deadline constraints. The ' +
      'question to ask is whether a name appears anywhere nearby.',
    patterns: [
      {
        id: 'experts_say',
        re: /\b(?:experts|analysts|observers|critics|commentators|scholars|researchers|historians|industry (?:experts|analysts|watchers))\s+(?:say|said|argue|argued|note|noted|believe|suggest|contend|have (?:noted|argued|suggested|cited|observed))\b/gi,
        note: '',
        examples: ['Experts argue that the trend will continue.']
      },
      {
        id: 'studies_have_shown',
        re: /\b(?:studies|research|reports|surveys|data)\s+(?:have |has )?(?:shown|suggest(?:ed)?|indicate[sd]?|reveal(?:ed)?|found)\b(?![^.!?\n]{0,60}\b(?:19|20)\d{2}\b)/gi,
        note: 'Only fires when no year appears in the same sentence.',
        examples: ['Studies have shown a link between the two.']
      },
      {
        id: 'several_sources',
        re: /\b(?:several|multiple|various|numerous|a number of)\s+(?:sources|publications|outlets|commentators|accounts)\b/gi,
        note: '',
        examples: ['Several sources suggest otherwise.']
      },
      {
        id: 'widely_regarded',
        re: /\b(?:widely|generally|commonly|often)\s+(?:regarded|considered|recognised|recognized|acknowledged|seen|viewed|described|praised|hailed)\s+as\b/gi,
        note: '',
        examples: ['Widely regarded as a masterpiece.']
      },
      {
        id: 'media_presence',
        re: /\bmaintains? an? (?:active|strong|significant|growing) (?:social media|digital|online|public) presence\b|\b(?:featured|profiled|covered) in (?:local|regional|national|international) (?:media )?outlets\b/gi,
        note: 'Notability puffery.',
        examples: ['She maintains an active social media presence.']
      }
    ]
  },

  /* ---------------------------------------------------------------- */
  {
    id: 'editorial_hedging',
    label: 'Editorialising hedges',
    severity: 'medium',
    weight: 6,
    cap: 30,
    why:
      'Instructing the reader how to weigh a fact instead of presenting it. ' +
      'Safety training rewards this register heavily.',
    caution:
      'Common in genuine explanatory and pedagogical writing.',
    patterns: [
      {
        id: 'important_to_note',
        re: /\bit(?:'s| is) (?:important|crucial|essential|vital|worth|useful|helpful|necessary) to (?:note|remember|consider|recognise|recognize|understand|emphasi[sz]e|highlight|acknowledge|point out|keep in mind)\b/gi,
        note: '',
        examples: ["It's important to note that results vary."]
      },
      {
        id: 'worth_noting',
        re: /\b(?:it is |it's )?worth (?:noting|mentioning|considering|remembering) that\b|\bnotably,|\bimportantly,/gi,
        note: '',
        examples: ['Worth noting that the sample was small.']
      },
      {
        id: 'may_vary',
        re: /\bmay vary (?:depending|based) on\b|\bresults (?:may|can) vary\b|\byour mileage may vary\b/gi,
        note: '',
        examples: ['Costs may vary depending on region.']
      },
      {
        id: 'both_sides',
        re: /\bwhile\b[^.!?\n]{1,70}?,\s*it(?:'s| is) (?:also )?(?:important|worth|crucial|essential)\b/gi,
        note: 'False-balance construction.',
        examples: ["While the data is promising, it's important to remain cautious."]
      }
    ]
  },

  /* ---------------------------------------------------------------- */
  {
    id: 'promotional_puffery',
    label: 'Promotional puffery',
    severity: 'medium',
    weight: 6,
    cap: 35,
    why:
      'Travel-brochure register. The model reaches for evaluative adjectives ' +
      'when it lacks specific facts about a place, person, or product.',
    caution:
      'Marketing copy is supposed to sound like this. Only a tell in registers ' +
      'that claim neutrality.',
    patterns: [
      {
        id: 'nestled_in_heart',
        re: /\bnestled (?:in|among|between|within)\b|\bin the heart of\b|\b(?:serves?|acts?) as (?:the |a )?gateway\b|\bhidden gem\b/gi,
        note: '',
        examples: ['Nestled in the heart of the old town...']
      },
      {
        id: 'breathtaking_adjectives',
        re: /\b(?:breathtaking|stunning|captivating|mesmeri[sz]ing|awe-inspiring|picturesque|idyllic|charming|quaint|bustling|vibrant|thriving|renowned|acclaimed|groundbreaking|revolutionary|cutting-edge|state-of-the-art|world-class|unparalleled|unrivalled|unrivaled)\b/gi,
        note: 'Count as density, not as individual hits.',
        examples: ['a breathtaking view of the valley']
      },
      {
        id: 'rich_tapestry',
        re: /\b(?:rich|vibrant|diverse|colou?rful|intricate) (?:tapestry|mosaic|blend|array|heritage|history|culture|tradition)\b/gi,
        note: '',
        examples: ['a rich tapestry of influences']
      },
      {
        id: 'commitment_to',
        re: /\b(?:unwavering|steadfast|deep|strong|ongoing) commitment to\b|\bdedication to (?:excellence|quality|innovation|sustainability)\b/gi,
        note: '',
        examples: ['their unwavering commitment to quality']
      },
      {
        id: 'boasts',
        re: /\bboasts (?:a|an|the|over|more than|some)\b/gi,
        note: '',
        examples: ['The campus boasts a modern library.']
      }
    ]
  },

  /* ---------------------------------------------------------------- */
  {
    id: 'copula_avoidance',
    label: 'Copula avoidance',
    severity: 'low',
    weight: 3,
    cap: 24,
    why:
      'LLMs substitute elaborate verbs for "is", "are", and "has". Geng & ' +
      'Trotta measured a >10% drop in "is"/"are" in academic writing in 2023.',
    caution:
      'Each of these verbs has honest uses. This is a density signal only.',
    patterns: [
      {
        id: 'serves_as',
        re: /\b(?:serves?|served|stands?|stood|functions?|operates?|acts?|emerges?|positions? itself) as (?:a|an|the|one of)\b/gi,
        note: '',
        examples: ['The hall serves as a community centre.']
      },
      {
        id: 'represents_a',
        re: /\brepresents? (?:a|an|one of|the)\b|\bmarks? (?:a|an|the) (?:first|beginning|start|shift|milestone)\b/gi,
        note: '',
        examples: ['The move represents a significant change.']
      },
      {
        id: 'features_offers',
        re: /\b(?:features?|offers?|houses?|showcases?|encompasses|comprises|holds the distinction of being)\s+(?:a|an|the|over|more than|several|numerous)\b/gi,
        note: '',
        examples: ['The building features a glass atrium.']
      }
    ]
  },

  /* ---------------------------------------------------------------- */
  {
    id: 'ai_vocabulary',
    label: 'Overrepresented vocabulary',
    severity: 'low',
    weight: 2,
    cap: 30,
    why:
      'Words whose post-2022 frequency jumped measurably. Kobak et al. (2025) ' +
      'found "delves" at 28x its extrapolated 2024 frequency in PubMed ' +
      'abstracts; Juzek & Ward report even larger ratios for "delving" and ' +
      '"showcasing" in scientific abstracts.',
    caution:
      'Every one of these is an ordinary English word. A single use means ' +
      'nothing whatsoever. Clustering is the only meaningful signal, and this ' +
      'category is the primary driver of bias against non-native English ' +
      'writers, who tend toward formal register. Weight accordingly.',
    patterns: [
      {
        id: 'era_gpt4',
        era: '2023 to mid-2024',
        re: /\b(?:delv(?:e|es|ed|ing)|tapestr(?:y|ies)|testament|pivotal|meticulous(?:ly)?|intricac(?:y|ies)|intricate|underscor(?:e|es|ed|ing)|bolster(?:ed|ing)?|garner(?:ed|ing)?|interplay|multifaceted|nuanced)\b/gi,
        note: 'Peak-GPT-4 register.',
        examples: ['delve into the intricacies']
      },
      {
        id: 'era_gpt4o',
        era: 'mid-2024 to mid-2025',
        re: /\b(?:showcas(?:e|es|ed|ing)|foster(?:s|ed|ing)?|align(?:s|ed|ing)? with|enhanc(?:e|es|ed|ing)|enduring|crucial|vibrant|holistic|seamless(?:ly)?|robust|comprehensive|leverage[sd]?|realm|landscape)\b/gi,
        note: '',
        examples: ['a seamless and robust solution']
      },
      {
        id: 'era_current',
        era: 'mid-2025 onward',
        re: /\b(?:emphasi[sz]ing|highlighting|showcasing|deep dive|actionable|streamlin(?:e|es|ed|ing)|empower(?:s|ed|ing)?|unlock(?:s|ed|ing)? the (?:potential|power)|game[- ]chang(?:er|ing)|paradigm shift)\b/gi,
        note: '',
        examples: ['unlock the potential of your data']
      },
      {
        id: 'sentence_initial_additionally',
        re: /(?:^|\n)\s*(?:Additionally|Moreover|Furthermore|Notably|Consequently|Nevertheless|Nonetheless),/gm,
        note: 'Sentence-initial connective. Human writers vary these more.',
        examples: ['Additionally, the cost fell.']
      }
    ]
  },

  /* ---------------------------------------------------------------- */
  {
    id: 'business_jargon',
    label: 'Consulting jargon',
    severity: 'low',
    weight: 3,
    cap: 24,
    why:
      'Corporate register the model defaults to for any business-adjacent ' +
      'prompt, regardless of whether the subject is commercial.',
    caution:
      'A real dialect spoken by real people in real meetings. Only a tell ' +
      'outside its native habitat.',
    patterns: [
      {
        id: 'synergy_family',
        re: /\b(?:synerg(?:y|ies|istic)|actionable insights?|value[- ]add(?:ed)?|best[- ]in[- ]class|mission[- ]critical|core competenc(?:y|ies)|low[- ]hanging fruit|move the needle|circle back|touch base|boil the ocean|north star metric)\b/gi,
        note: '',
        examples: ['actionable insights that move the needle']
      },
      {
        id: 'stakeholder_speak',
        re: /\b(?:key stakeholders?|cross[- ]functional|end[- ]to[- ]end|scalable solutions?|drive (?:growth|value|impact|adoption)|operationali[sz]e|ideate|bandwidth for)\b/gi,
        note: '',
        examples: ['align key stakeholders end-to-end']
      },
      {
        id: 'transformation_speak',
        re: /\b(?:digital transformation|thought leader(?:ship)?|disrupt(?:ive|ion)? (?:innovation|technolog)|next[- ]generation|future[- ]proof|holistic approach|strategic imperative)\b/gi,
        note: '',
        examples: ['a holistic approach to digital transformation']
      }
    ]
  },

  /* ---------------------------------------------------------------- */
  {
    id: 'data_analysis_phrases',
    label: 'Analysis-report register',
    severity: 'low',
    weight: 4,
    cap: 24,
    why:
      'Formulaic framing the model wraps around numbers, often when the ' +
      'numbers themselves are thin or unsourced.',
    caution:
      'Standard in analyst reports and data journalism.',
    patterns: [
      {
        id: 'data_reveals',
        re: /\bthe (?:data|numbers|figures|results|findings|evidence|analysis) (?:reveals?|shows?|suggests?|tells? (?:a|us)|paints? a (?:picture|clear picture)|speaks? for itself)\b/gi,
        note: '',
        examples: ['The data paints a clear picture.']
      },
      {
        id: 'at_a_glance',
        re: /\b(?:at a glance|key (?:takeaways?|findings?|highlights?|metrics|insights?)|by the numbers|tl;?dr)\b/gi,
        note: '',
        examples: ['Key takeaways at a glance']
      },
      {
        id: 'deep_dive_analysis',
        re: /\b(?:let(?:'s| us) )?(?:take a )?(?:deep dive|closer look) (?:into|at)\b|\bdiving deeper\b|\bunpack(?:ing)? the (?:data|numbers|findings)\b/gi,
        note: '',
        examples: ['A deep dive into the quarterly figures']
      },
      {
        id: 'suggests_trend',
        re: /\b(?:indicat(?:es?|ing)|suggest(?:s|ing)?|point(?:s|ing)? to) a (?:growing|clear|strong|significant|notable|marked|worrying|promising) (?:trend|shift|correlation|pattern|increase|decline)\b/gi,
        note: '',
        examples: ['This points to a growing trend.']
      }
    ]
  },

  /* ---------------------------------------------------------------- */
  {
    id: 'emoji_formatting',
    label: 'Emoji as structure',
    severity: 'high',
    weight: 12,
    cap: 36,
    why:
      'Decorating headings and bullets with a leading pictograph. Rare in ' +
      'edited prose in any genre outside social posts and release notes.',
    caution:
      'Changelogs, README files, Slack messages, and consumer newsletters use ' +
      'emoji headings by convention. Genre-dependent.',
    patterns: [
      {
        id: 'emoji_heading',
        re: /^[ \t]*#{1,6}\s*\p{Extended_Pictographic}/gmu,
        note: 'Markdown heading opening with an emoji.',
        examples: ['## 🚀 Getting Started']
      },
      {
        id: 'emoji_bullet',
        re: /^[ \t]*(?:[-*+]|\d+\.)\s+\p{Extended_Pictographic}/gmu,
        note: 'List item opening with an emoji.',
        examples: ['- ✅ Ship the feature']
      },
      {
        id: 'emoji_label_line',
        re: /^[ \t]*\p{Extended_Pictographic}[️‍\p{Extended_Pictographic}]*\s*\*{0,2}[A-Z][^\n]{0,60}:/gmu,
        note: 'Emoji-led pseudo-heading followed by a colon.',
        examples: ['🧠 Cognitive Dissonance Pattern:']
      },
      {
        id: 'checkmark_cross_pairs',
        re: /(?:✅|✔️|❌|⚠️|🔑|💡|🚀|📌|🎯|🔥|✨)/gu,
        note: 'The specific decorative set LLMs favour. Density signal.',
        examples: ['✅ Pros / ❌ Cons']
      }
    ]
  },

  /* ---------------------------------------------------------------- */
  {
    id: 'formatting_tells',
    label: 'Structural formatting tells',
    severity: 'medium',
    weight: 6,
    cap: 30,
    why:
      'Markdown habits from the chat interface surviving into a document: ' +
      'bolded label lists, title-case headings, gratuitous horizontal rules.',
    caution:
      'These are legitimate formatting choices. They only become evidence ' +
      'when they appear in a venue whose house style forbids them.',
    patterns: [
      {
        id: 'inline_header_list',
        re: /^[ \t]*(?:[-*+]|\d+\.)\s+\*\*[^*\n]{2,60}\*\*\s*[:—-]/gm,
        note: 'Bullet + bold label + colon. The single most recognisable ' +
              'LLM list shape.',
        examples: ['- **Scalability**: handles growth gracefully']
      },
      {
        id: 'title_case_heading',
        re: /^[ \t]*#{2,6}\s+(?:[A-Z][a-z']+\s+){2,}[A-Z][a-z']+\s*$/gm,
        note: 'Every Word Capitalised In A Heading.',
        examples: ['### Early Career And Professional Development']
      },
      {
        id: 'thematic_break_spam',
        re: /^[ \t]*(?:---|\*\*\*|___)\s*$/gm,
        note: 'Horizontal rules between every section. Density signal.',
        examples: ['---']
      },
      {
        id: 'bold_lead_in',
        re: /^[ \t]*\*\*[^*\n]{2,60}\*\*\s*$/gm,
        note: 'A bolded line standing in for a real heading.',
        examples: ['**Key considerations**']
      },
      {
        id: 'heading_then_heading',
        re: /^[ \t]*#{1,3}\s+[^\n]{1,60}\n+[ \t]*#{2,4}\s+/gm,
        note: 'A heading whose only child is another heading.',
        examples: ['# Overview\n## Background']
      }
    ]
  }
];

/* Attach a combined union regex per category, built from its sub-patterns. */
for (const cat of CATEGORIES) {
  const parts = cat.patterns.map((p) => `(?:${p.re.source})`);
  // Union preserves each sub-pattern's semantics; flags are the superset used
  // across the category (unicode only where a sub-pattern needs it).
  const needsU = cat.patterns.some((p) => p.re.flags.includes('u'));
  const needsM = cat.patterns.some((p) => p.re.flags.includes('m'));
  const needsI = cat.patterns.some((p) => p.re.flags.includes('i'));
  cat.combined = new RegExp(
    parts.join('|'),
    'g' + (needsI ? 'i' : '') + (needsM ? 'm' : '') + (needsU ? 'u' : '')
  );
}

/* ==========================================================================
 * 3. Typography and density metrics
 * ==========================================================================
 * Signals that are statistical rather than lexical. These run on the RAW
 * text, before normalize(), because the exact characters are the evidence.
 */

export const TYPOGRAPHY_METRICS = {
  /**
   * Em-dash rate per 1,000 words. Freeburg (2026) measured instruction-tuned
   * models between 0.0 and 9.1 per 1,000 words depending on vendor and
   * prompt. The Economist (July 2026) found that among current models only
   * Claude exceeded professional human writers. Typical edited human prose
   * sits near 1-2 per 1,000. Spaced em dashes ( — ) are the stronger tell:
   * most humans who reach for an em dash close it up.
   */
  emDashRate(raw) {
    const words = wordCount(raw) || 1;
    const all = (raw.match(/—/g) || []).length;
    const spaced = (raw.match(/\s—\s/g) || []).length;
    return {
      total: all,
      spaced,
      perThousand: +((all / words) * 1000).toFixed(2),
      spacedShare: all ? +(spaced / all).toFixed(2) : 0,
      flag: (all / words) * 1000 > 3
    };
  },

  /**
   * Curly-quote usage. Weak on its own: Word, macOS, and any professional
   * typesetting pipeline produce curly quotes. Mixing both styles in one
   * document is the more interesting signal.
   */
  curlyQuotes(raw) {
    const curly = (raw.match(/[‘’“”]/g) || []).length;
    const straight = (raw.match(/["']/g) || []).length;
    return {
      curly,
      straight,
      mixed: curly > 0 && straight > 0,
      flag: curly > 0 && straight > 0
    };
  },

  /**
   * Sentence-length uniformity ("burstiness"). Human prose varies sentence
   * length far more than LLM prose. Reported as the coefficient of variation
   * of sentence word counts; low values are the suspicious direction.
   * Needs at least 5 sentences to mean anything.
   */
  burstiness(raw) {
    const sentences = raw
      .replace(/\n+/g, ' ')
      .split(/(?<=[.!?])\s+/)
      .map((s) => wordCount(s))
      .filter((n) => n > 2);
    if (sentences.length < 5) {
      return { sentences: sentences.length, cv: null, flag: false, note: 'too few sentences' };
    }
    const mean = sentences.reduce((a, b) => a + b, 0) / sentences.length;
    const variance =
      sentences.reduce((a, b) => a + (b - mean) ** 2, 0) / sentences.length;
    const cv = Math.sqrt(variance) / mean;
    return {
      sentences: sentences.length,
      meanLength: +mean.toFixed(1),
      cv: +cv.toFixed(3),
      flag: cv < 0.35
    };
  },

  /**
   * Paragraph-length uniformity. LLMs produce suspiciously even blocks.
   */
  paragraphUniformity(raw) {
    const paras = raw.split(/\n\s*\n/).map((p) => wordCount(p)).filter((n) => n > 15);
    if (paras.length < 3) return { paragraphs: paras.length, cv: null, flag: false };
    const mean = paras.reduce((a, b) => a + b, 0) / paras.length;
    const variance = paras.reduce((a, b) => a + (b - mean) ** 2, 0) / paras.length;
    const cv = Math.sqrt(variance) / mean;
    return { paragraphs: paras.length, meanLength: +mean.toFixed(1), cv: +cv.toFixed(3), flag: cv < 0.25 };
  }
};

/* ==========================================================================
 * 4. Scoring
 * ========================================================================== */

/**
 * Analyse text and return a structured report.
 *
 * @param {string} text
 * @param {object} [opts]
 * @param {boolean} [opts.stripCodeBlocks=true]  ignore fenced code
 * @param {string[]} [opts.only]  restrict to these category ids
 * @returns {{score:number, band:string, wordCount:number, categories:Array, metrics:object, topHits:Array}}
 */
export function scoreText(text, opts = {}) {
  const { stripCodeBlocks = true, only = null } = opts;

  const raw = String(text);
  // maskCode blanks code spans in place rather than removing them, so every
  // reported match index remains a valid offset into `raw`.
  const working = stripCodeBlocks ? maskCode(raw) : raw;
  const norm = normalize(working);
  const words = wordCount(norm);
  const per1k = words > 0 ? 1000 / words : 0;

  const results = [];
  let rawScore = 0;

  for (const cat of CATEGORIES) {
    if (only && !only.includes(cat.id)) continue;

    const hits = [];
    for (const p of cat.patterns) {
      // Emoji and formatting patterns must see the un-normalised text so that
      // pictographs and markdown structure survive.
      const target =
        cat.id === 'emoji_formatting' || cat.id === 'formatting_tells' ? working : norm;
      for (const m of target.matchAll(p.re)) {
        hits.push({
          pattern: p.id,
          match: m[0].trim().slice(0, 120),
          index: m.index
        });
      }
    }

    if (!hits.length) continue;

    // Distinct surface forms matter more than raw repetition of one phrase.
    const distinct = new Set(hits.map((h) => h.match.toLowerCase())).size;
    const points = Math.min(cat.cap, distinct * cat.weight);
    rawScore += points;

    results.push({
      id: cat.id,
      label: cat.label,
      severity: cat.severity,
      count: hits.length,
      distinct,
      points,
      per1000Words: +(hits.length * per1k).toFixed(2),
      why: cat.why,
      caution: cat.caution,
      hits: hits.slice(0, 25)
    });
  }

  const metrics = {
    emDash: TYPOGRAPHY_METRICS.emDashRate(raw),
    quotes: TYPOGRAPHY_METRICS.curlyQuotes(raw),
    burstiness: TYPOGRAPHY_METRICS.burstiness(norm),
    paragraphs: TYPOGRAPHY_METRICS.paragraphUniformity(norm)
  };
  if (metrics.emDash.flag) rawScore += 6;
  if (metrics.burstiness.flag) rawScore += 6;
  if (metrics.paragraphs.flag) rawScore += 4;
  if (metrics.quotes.flag) rawScore += 2;

  // Length normalisation: a 3,000-word essay has more room to accumulate hits
  // than a tweet. Scale toward a 500-word reference document, but never
  // inflate very short texts.
  const lengthFactor = words > 0 ? Math.min(1.6, Math.max(0.6, 500 / Math.max(words, 120))) : 1;
  const score = Math.max(0, Math.min(100, Math.round(rawScore * lengthFactor)));

  const band =
    score >= 65 ? 'strong LLM register'
      : score >= 35 ? 'mixed signals'
        : score >= 15 ? 'faint traces'
          : 'no meaningful signal';

  results.sort((a, b) => b.points - a.points);

  return {
    score,
    band,
    wordCount: words,
    categories: results,
    metrics,
    topHits: results.flatMap((r) =>
      r.hits.slice(0, 3).map((h) => ({ category: r.id, severity: r.severity, match: h.match }))
    ).slice(0, 20)
  };
}

/**
 * Convenience: test one category id against text, returning matches only.
 */
export function matchCategory(text, categoryId) {
  const cat = CATEGORIES.find((c) => c.id === categoryId);
  if (!cat) throw new Error(`Unknown category: ${categoryId}`);
  const norm = normalize(String(text));
  return [...norm.matchAll(cat.combined)].map((m) => ({ match: m[0], index: m.index }));
}

/** Flat map of every sub-pattern, keyed `category.pattern`. */
export const PATTERN_INDEX = Object.fromEntries(
  CATEGORIES.flatMap((c) => c.patterns.map((p) => [`${c.id}.${p.id}`, p.re]))
);

export default { CATEGORIES, scoreText, matchCategory, normalize, wordCount, TYPOGRAPHY_METRICS, PATTERN_INDEX };
