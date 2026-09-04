# The Fingerprints of Machine Prose

_A tested regex catalogue of the surface patterns that mark English text as LLM-generated, with honest false-positive numbers._

Computational stylistics · 95 patterns · 20 categories

Large language models have a house style. It is measurable, it is documented in the peer-reviewed literature, and a good deal of it can be caught with regular expressions. Here is the full catalogue, the JavaScript to run it, and the false-positive numbers nobody publishing an "AI detector" wants to show you.

Corpus: **63,143 words** · Human control: **frozen Dec 2017** · Self-test: **101/101** · License: **CC BY-NC-SA 4.0**

## Read this before you use any of it

This is a **style linter**, not an authorship detector. It finds writing habits that language models exhibit more often than most human writers. That is all it does.

The distinction is not pedantic. In 2023 Liang and colleagues ran seven commercial GPT detectors over 91 TOEFL essays written by humans. The detectors flagged **61.22%** of them as machine-written, against 5.19% for essays by US eighth-graders. **97.8%** of the human TOEFL essays were flagged by at least one detector. The mechanism is simple and it is baked into every tool of this kind, including this one: writing in a careful, formal, limited-vocabulary register looks exactly like what these systems are trained to punish.

Use these patterns to reread your own sentences. Do not use them to accuse anybody of anything.

## 01 · Mechanism: Why the house style exists

The tells are not random. Each family of them traces back to something specific in how these models are built and served.

### Frequency regression

A language model samples from a probability distribution over tokens. Averaged across millions of generations, its output drifts toward whatever was statistically common in training, then further toward whatever human raters rewarded. Specific facts get replaced by generic, positive-sounding description because generic description is what the distribution says comes next.

The measured effect is large. Kobak and colleagues compared 15.1 million PubMed abstracts against frequencies extrapolated from pre-ChatGPT trends. In 2024, _delves_ appeared at **28 times** its expected rate. They counted **454 excess words** that year, against a previous record of 190 at the peak of the COVID-19 pandemic. Where the pandemic's excess words were topic nouns, 2024's were overwhelmingly _style_ words: 66% verbs, 14% adjectives. Juzek and Ward, working on scientific abstracts, put the pre/post ratio for _delving_ at roughly 2,240× and _showcasing_ at 1,396×.

### Reinforcement learning rewards a register

Instruction tuning teaches the model to be helpful, balanced, and complete. Those are conversational virtues, and they produce conversational artifacts: the acknowledgement before the answer, the hedge that reminds you results may vary, the summary paragraph that closes a section you have just finished reading. Juzek and Ward found that learning from human feedback _amplifies_ frequency biases already present in pre-training, rather than smoothing them out.

### Markdown leaking into prose

These systems are trained and served in Markdown. Most of that formatting is visibly structural (headings, bullets, bold) and gets stripped or noticed when text is moved somewhere else. The em dash is the exception: it is simultaneously a Markdown-era typographic habit and a legitimate piece of prose punctuation, so it survives the move. In our own corpus the gap is stark, **2.65 em dashes per thousand words in LLM text against 0.26 in the human control**, a tenfold difference. But this signal is decaying fastest of all: OpenAI explicitly tuned GPT-5.1 to suppress em dashes in late 2025, and by July 2026 _The Economist_ reported that among current models only Claude used them more than professional human writers.

### The interface bleeds through

The highest-precision signals are not stylistic at all. They are machine artifacts: the internal citation markup a chatbot renders into its own web UI, copied out along with the text. ChatGPT leaves `:contentReference[oaicite:16]` and `citeturn0search1`. Gemini leaves `[cite: 17]` and `[span_2](start_span)`. Grok leaves `<grok-card data-id=…>`. DeepSeek leaves `【85†L261-269】`. Perplexity leaves `[attached_file:1]`. None of these is a writing habit. Each is proof that a specific product was in the loop.

## 02 · Taxonomy: 20 categories, 95 patterns

Ordered by severity. **Critical** means a machine artifact that a human typing prose essentially never produces. **Low** means an ordinary English word that is meaningless alone and only informative as density. Every regex below is the live source from the library, and every listed example is asserted in the test suite.

### [critical] Chatbot tool artifacts `tool_artifacts`

AI /1k words: 4.95 · human /1k: 0 · lift: ∞ (zero human hits)

**Why it happens.** Internal citation and rendering markup that leaks when a user copies a chatbot answer out of the web UI. Each vendor has its own signature.

**False positives.** Almost none. The only realistic false positive is an article that quotes these markers while discussing AI detection, such as this one.

10 patterns · 40 pts each, capped at 60:

- `openai_citation_markup` (ChatGPT)
  ChatGPT reference placeholders.
  `/:?contentReference\[oaicite:\d+\]|oai_citation:?\s*\d*|\boaicite\b/g`
  Examples: `:contentReference[oaicite:16]{index=16}`, `[oai_citation:0‡example.com]`
- `openai_turn_tokens` (ChatGPT)
  Search/image result tokens, PUA-wrapped in the original response.
  `/\b(?:cite)?turn\d+(?:search|image|news|file|view|forecast)\d+\b/g`
  Examples: `citeturn0search1`, `turn0image4`
- `openai_attribution_json` (ChatGPT)
  JSON attribution blob appended to sentences.
  `/\{\s*"attribution"\s*:\s*\{\s*"attributableIndex"/g`
  Examples: `({"attribution":{"attributableIndex":"1009-1"}})`
- `gemini_cite_markers` (Gemini)
  Gemini inline citation markers.
  `/\[cite:\s*\d+(?:\s*,\s*\d+)*\]|\[cite_start\]/g`
  Examples: `[cite: 17]`, `[cite: 19, 20, 21]`
- `gemini_span_markers` (Gemini)
  Gemini span formatting bug.
  `/\[span_\d+\]\((?:start|end)_span\)/g`
  Examples: `[span_2](start_span)`
- `grok_cards` (Grok)
  Grok citation card markup.
  `/<grok-card\b|grok_render_citation_card_json|data-type="citation_card"/g`
  Examples: `<grok-card data-id="e8ff4f" data-type="citation_card">`
- `deepseek_lenticular` (DeepSeek)
  Lenticular-bracket + dagger source refs.
  `/【\d+†L?\d+(?:-L?\d+)?】/g`
  Examples: `【85†L261-269】`
- `perplexity_tags` (Perplexity)
  Perplexity attachment and web-result tags.
  `/\[(?:attached_file|web|search):\s*\d+\]|ppl-ai-file-upload/g`
  Examples: `[attached_file:1]`, `[web:1]`
- `writing_variant_block` (unclassified)
  Document-variant fence seen from mid-2026.
  `/:{3}\s*(?:writing|ecriture|écriture)\s*\{\s*(?:variant|variante)\s*=/gi`
  Examples: `:::writing{variant="document" id="68427"}`
- `chatgpt_utm` (ChatGPT)
  Tracking parameter on links copied out of ChatGPT.
  `/utm_source=(?:chatgpt\.com|openai)/gi`
  Examples: `https://example.com/?utm_source=chatgpt.com`

### [critical] Model self-identification `ai_self_reference`

AI /1k words: 0 · human /1k: 0 · lift: not exercised

**Why it happens.** The assistant describing its own nature or limits. Refusal and disclaimer boilerplate that was never edited out.

**False positives.** Quoted examples in writing about AI. Check whether the phrase sits inside quotation marks.

4 patterns · 35 pts each, capped at 50:

- `as_an_ai`
  The canonical tell.
  `/\bas an? (?:AI|artificial intelligence)(?: language)?(?: model| assistant| system)?\b/gi`
  Examples: `As an AI language model, I cannot...`
- `as_a_llm`
  `/\bas a large language model\b/gi`
  Examples: `As a large language model, I do not have...`
- `no_personal_capacity`
  Capability disclaimer.
  `/\bI (?:don't|do not|cannot|can't) have (?:personal |any )?(?:opinions|feelings|beliefs|preferences|access to real[- ]time|the ability to browse)\b/gi`
  Examples: `I don't have personal opinions, but...`
- `language_model_self`
  `/\bI(?:'m| am) (?:an? )?(?:AI|language model|chatbot|virtual assistant)\b/gi`
  Examples: `I'm an AI, so I...`

### [critical] Unfilled placeholders `placeholder_text`

AI /1k words: 0 · human /1k: 0 · lift: chat-register only

**Why it happens.** Template slots the model emitted for a human to fill, shipped unfilled.

**False positives.** Documentation and code samples use angle-bracket placeholders on purpose. Restrict this check to prose, not code blocks.

4 patterns · 25 pts each, capped at 40:

- `bracket_insert`
  `/\[(?:INSERT|ADD|ENTER|YOUR|PASTE|TODO|TBD|XX+)[^\]\n]{0,40}\]/gi`
  Examples: `[INSERT SOURCE URL]`, `[Your Name Here]`
- `screaming_snake_slot`
  `/\b(?:INSERT|PASTE|ADD)_[A-Z_]{3,}\b|\bSOURCE_(?:URL|PUBLISHER|NAME)\b|\bURL_HERE\b/g`
  Examples: `INSERT_SOURCE_URL`, `PASTE_URL_HERE`
- `dummy_date`
  `/\b(?:19|20)\d{2}-(?:xx|XX|mm|MM)-(?:xx|XX|dd|DD)\b|\bYYYY-MM-DD\b/g`
  Examples: `2025-xx-xx`
- `delete_before_submission`
  `/\b(?:delete|remove) this (?:section|line|note|paragraph) before (?:submission|publishing|sending)\b/gi`
  Examples: `Delete this section before submission.`

### [high] Knowledge-cutoff and source-gap hedging `knowledge_cutoff`

AI /1k words: 0.12 · human /1k: 0 · lift: ∞ (zero human hits)

**Why it happens.** The model signalling that its training data ran out, or narrating the thinness of its own retrieved sources instead of just omitting the claim.

**False positives.** Legitimate scholarship does say "records are scarce". The tell is the first-person framing and the reference to "available information".

6 patterns · 14 pts each, capped at 40:

- `last_update`
  `/\b(?:as of|up to|until) my (?:last |latest |most recent )?(?:knowledge |training |data )?(?:update|cutoff|cut-off)\b/gi`
  Examples: `As of my last knowledge update, ...`
- `available_information`
  `/\bbased on (?:the )?(?:available|provided) (?:information|sources|data)\b|\bin the (?:provided|given) sources\b/gi`
  Examples: `Based on available information, ...`
- `details_limited`
  `/\b(?:while |although )?(?:specific |further |additional )?details (?:are|remain) (?:limited|scarce|sparse|not widely (?:available|documented|disclosed))\b/gi`
  Examples: `While specific details are limited, ...`
- `not_widely_documented`
  `/\bnot widely (?:available|documented|disclosed|reported|publicised|publicized)\b/gi`
  Examples: `His early career is not widely documented.`
- `private_life_speculation`
  Gap-filling speculation about biography subjects.
  `/\bkeeps? (?:much of )?(?:his|her|their) personal life private\b|\bmaintains? a low profile\b/gi`
  Examples: `She keeps much of her personal life private.`
- `inference_disclosure`
  `/\bI(?:'ve| have) inferred\b|\bmy analysis is based on\b|\blikely due to limited (?:mainstream )?(?:exposure|coverage|documentation)\b/gi`
  Examples: `I've inferred common motifs...`

### [high] Conversational scaffolding `collaborative_scaffolding`

AI /1k words: 0.08 · human /1k: 0 · lift: ∞ (zero human hits)

**Why it happens.** Turn-taking pleasantries from the chat interface. RLHF rewards them; they have no function inside a finished document.

**False positives.** Genuine correspondence, teaching material, and newsletters legitimately address a reader. Weigh by genre: an encyclopedia entry should have none.

7 patterns · 12 pts each, capped at 45:

- `hope_this_helps`
  `/\bI hope (?:this|that) helps\b|\bhope this (?:helps|is helpful)\b/gi`
  Examples: `I hope this helps!`
- `enthusiastic_openers`
  Opening acknowledgement token.
  `/(?:^|[.!?]\s+|\n)\s*(?:Certainly|Absolutely|Of course|Sure thing|Great question|Excellent question|Fantastic question|Happy to help)\s*[!,.]/g`
  Examples: `Certainly! Here is a summary.`
- `offer_more`
  `/\bwould you like me to\b|\blet me know if (?:you|there|that|I)\b|\bfeel free to (?:ask|reach out|let me know)\b|\bif you(?:'d| would) like,? I can\b/gi`
  Examples: `Let me know if you would like me to expand this.`
- `here_is_a`
  `/\bhere(?:'s| is| are)\s+(?:a|an|the)\s+(?:brief |quick |detailed |comprehensive |more detailed )?(?:breakdown|overview|summary|rundown|deep dive|look at)\b/gi`
  Examples: `Here's a detailed breakdown of the options.`
- `lets_dive_in`
  `/\blet(?:'s| us) (?:dive (?:in|into)|explore|take a (?:look|closer look)|unpack|break (?:this|it) down|get started)\b/gi`
  Examples: `Let's dive into the details.`
- `youre_right`
  Sycophantic agreement token.
  `/\byou(?:'re| are) (?:absolutely |completely |quite )?right\b|\bgreat point\b|\bthat(?:'s| is) a (?:great|excellent|fair) point\b/gi`
  Examples: `You're absolutely right to point that out.`
- `meta_offer_feedback`
  `/\bhappy to (?:address|answer|clarify|expand on) any (?:further|additional|other)\b|\bI(?:'m| am) open to (?:any |further )?(?:suggestions|feedback|guidance|input)\b|\bI would (?:greatly )?appreciate (?:your )?(?:guidance|feedback|input)\b/gi`
  Examples: `Happy to address any further concerns.`

### [high] Emoji as structure `emoji_formatting`

AI /1k words: 0 · human /1k: 0 · lift: chat-register only

**Why it happens.** Decorating headings and bullets with a leading pictograph. Rare in edited prose in any genre outside social posts and release notes.

**False positives.** Changelogs, README files, Slack messages, and consumer newsletters use emoji headings by convention. Genre-dependent.

4 patterns · 12 pts each, capped at 36:

- `emoji_heading`
  Markdown heading opening with an emoji.
  `/^\s*#{1,6}\s*\p{Extended_Pictographic}/gmu`
  Examples: `## 🚀 Getting Started`
- `emoji_bullet`
  List item opening with an emoji.
  `/^\s*(?:[-*+]|\d+\.)\s+\p{Extended_Pictographic}/gmu`
  Examples: `- ✅ Ship the feature`
- `emoji_label_line`
  Emoji-led pseudo-heading followed by a colon.
  `/^\s*\p{Extended_Pictographic}[️‍\p{Extended_Pictographic}]*\s*\*{0,2}[A-Z][^\n]{0,60}:/gmu`
  Examples: `🧠 Cognitive Dissonance Pattern:`
- `checkmark_cross_pairs`
  The specific decorative set LLMs favour. Density signal.
  `/(?:✅|✔️|❌|⚠️|🔑|💡|🚀|📌|🎯|🔥|✨)/gu`
  Examples: `✅ Pros / ❌ Cons`

### [medium] Significance and legacy inflation `significance_statements`

AI /1k words: 0.23 · human /1k: 0.03 · lift: 7.7×

**Why it happens.** Rather than state a fact and stop, the model appends a claim about why the fact matters. This is the single most characteristic move in LLM encyclopedic prose, and the hardest for the model to suppress.

**False positives.** Obituaries, award citations, and advocacy writing make these claims sincerely. Density matters more than any single instance.

8 patterns · 7 pts each, capped at 45:

- `stands_as_testament`
  `/\b(?:stands?|serves?|remains?) as an? (?:enduring |lasting |powerful |living |stark )?(?:testament|testimony|reminder|symbol|beacon|hallmark|cornerstone|monument|celebration)\b/gi`
  Examples: `The bridge stands as a testament to Victorian engineering.`
- `vital_role`
  `/\b(?:plays?|played|playing|has played) an? (?:vital|crucial|pivotal|significant|central|key|critical|important|instrumental|major) role\b/gi`
  Examples: `She played a pivotal role in the negotiations.`
- `underscores_importance`
  `/\b(?:underscore[sd]?|highlight(?:s|ed)?|emphasi[sz]e[sd]?|reflect(?:s|ed)?|demonstrate[sd]?|illustrate[sd]?) (?:the |its |their |his |her )?(?:importance|significance|centrality|enduring|lasting|ongoing|continued|broader|vital)\b/gi`
  Examples: `This underscores the importance of early testing.`
- `enduring_legacy`
  `/\b(?:enduring|lasting|indelible|profound|far-reaching|ongoing) (?:legacy|impact|influence|mark|imprint|significance|relevance|contribution)\b/gi`
  Examples: `He left an indelible mark on the discipline.`
- `turning_point`
  `/\b(?:key |major |critical |defining )?turning point\b|\bwatershed moment\b|\bmark(?:s|ed|ing)? a (?:shift|departure|new (?:chapter|era)|milestone)\b|\bsetting the stage for\b/gi`
  Examples: `1968 marked a turning point for the movement.`
- `evolving_landscape`
  `/\b(?:ever-)?(?:evolving|changing|shifting|dynamic) (?:landscape|world|environment|ecosystem|terrain)\b|\bin (?:today's|the modern) (?:fast-paced|rapidly changing|digital) (?:world|landscape|environment)\b/gi`
  Examples: `In the ever-evolving landscape of cybersecurity...`
- `deeply_rooted`
  `/\bdeeply (?:rooted|embedded|ingrained|intertwined)\b|\breflects? (?:a )?broader (?:trends?|shifts?|patterns?|movements?)\b|\bfocal point\b/gi`
  Examples: `The practice is deeply rooted in local tradition.`
- `contributing_to`
  `/\bcontribut(?:es?|ed|ing) to (?:the )?(?:rich |broader |ongoing |overall )?(?:tapestry|fabric|mosaic|development|discourse|understanding|conversation|dialogue)\b/gi`
  Examples: `...contributing to the rich tapestry of city life.`

### [medium] Trailing participial commentary `participial_tackon`

AI /1k words: 0.35 · human /1k: 0 · lift: ∞ (zero human hits)

**Why it happens.** A comma followed by an "-ing" clause that adds evaluation rather than information. The model uses it to make a bare fact feel analysed.

**False positives.** Perfectly grammatical and sometimes genuinely informative. The tell is that the clause could be deleted with zero loss of meaning.

3 patterns · 8 pts each, capped at 40:

- `ing_significance_clause`
  The core construction.
  `/,\s+(?:highlighting|emphasi[sz]ing|underscoring|showcasing|reflecting|demonstrating|illustrating|signalling|signaling|cementing|solidifying|reinforcing|affirming|confirming|marking|symbolizing|symbolising|embodying|fostering|cultivating|ensuring|encompassing)\s+(?:its|their|his|her|the|a|an)\b/gi`
  Examples: `, highlighting its cultural significance.`
- `creating_a_space`
  `/\bcreating a (?:space|sense|environment|community|platform|foundation) (?:where|for|of)\b|\bfostering a (?:sense|culture|spirit|climate) of\b/gi`
  Examples: `...fostering a sense of community.`
- `ongoing_relevance`
  `/\b(?:demonstrating|confirming|illustrating|reflecting|affirming)\s+(?:the\s+)?(?:ongoing|enduring|lasting|continued|persistent)\s+(?:relevance|influence|importance|appeal|significance)\b/gi`
  Examples: `...confirming the enduring relevance of the form.`

### [medium] Negative parallelism `negative_parallelism`

AI /1k words: 0.15 · human /1k: 0 · lift: ∞ (zero human hits)

**Why it happens.** Defining something by first denying a lesser description. Documented as a stereotypical AI construction by the Washington Post, The Economist, and Russell et al. (ACL 2025).

**False positives.** A real rhetorical device with a long human pedigree. Speechwriting and myth-busting listicles use it deliberately. Repetition is the tell.

6 patterns · 10 pts each, capped at 45:

- `not_only_but_also`
  `/\bnot only\b[^.!?\n]{1,80}?\bbut(?: also)?\b/gi`
  Examples: `Not only did it fail, but it also cost millions.`
- `not_just_its`
  `/\bnot (?:just|merely|simply)\b[^.!?\n]{1,80}?[,.;:—-]\s*(?:it(?:'s| is)|they(?:'re| are)|but)\b/gi`
  Examples: `It's not just a phone — it's a platform.`, `It's not just a tool. It's a paradigm shift.`
- `its_not_its`
  `/\bit(?:'s| is)\s+not\s+(?:about\s+)?[^.!?\n]{1,60}?[,.;:—-]\s*it(?:'s| is)\b/gi`
  Examples: `It's not about speed, it's about accuracy.`, `It's not simply a design choice. It's a fundamental philosophy.`
- `no_no_just`
  `/\bno\s+\w+(?:\s+\w+)?,\s+no\s+\w+(?:\s+\w+)?,\s+(?:just|only)\b/gi`
  Examples: `No hype, no jargon, just results.`
- `isnt_x_its_y`
  Dash, comma, colon, or sentence-boundary joined variant.
  `/\b(?:this|that|it|there)\s+(?:is|was)\s?n(?:'|o)t\s+[^.!?\n]{1,60}?[,.;:—-]\s*(?:it(?:'s| is)|that(?:'s| is))\b/gi`
  Examples: `This isn't a setback — it's a redirection.`, `This isn't a setback. It's a redirection.`
- `rather_than_contrast`
  The reversed form; common in Grok output.
  `/\b(?:prioriti[sz]ing|choosing|favou?ring|emphasi[sz]ing|seeking)\b[^.!?\n]{1,70}?\brather than\b/gi`
  Examples: `...prioritizing consolidation rather than ideological purity.`

### [medium] Mechanical triads `rule_of_three`

AI /1k words: 3.11 · human /1k: 0.71 · lift: 4.4×

**Why it happens.** LLMs reach for three-item lists far more often than the content warrants, especially adjective triads used to pad a thin claim.

**False positives.** Highest false-positive category in this file. Three-item lists are ordinary English. Only meaningful when several appear per paragraph.

2 patterns · 5 pts each, capped at 25:

- `adjective_triad`
  Generic X, Y, and Z triad. Count, do not read individually.
  `/\b(\w+ly\s+)?(\w{4,}),\s+(\w{4,}),\s+and\s+(\w{4,})\b/g`
  Examples: `clear, concise, and compelling`
- `triad_closer`
  `/\b\w+,\s+\w+,\s+and\s+\w+\s+(?:alike|together|combined|all at once)\b/gi`
  Examples: `critics, fans, and scholars alike`

### [medium] Ritual conclusions `ritual_conclusion`

AI /1k words: 0.12 · human /1k: 0.03 · lift: 4.0×

**Why it happens.** Chat answers are trained to close with a wrap-up. Transplanted into an article, the summary restates what the reader just read.

**False positives.** Academic papers and reports have legitimate conclusion sections. The tell is a summary paragraph closing every section, not just the piece.

3 patterns · 9 pts each, capped at 30:

- `in_conclusion`
  `/(?:^|\n|[.!?]\s+)\s*(?:In (?:conclusion|summary|essence|short)|Ultimately|Overall|To sum up|All in all|In the end),/g`
  Examples: `In conclusion, the evidence is mixed.`
- `conclusion_heading`
  `/^\s*#{1,6}\s*(?:Conclusion|Summary|Final [Tt]houghts|Key [Tt]akeaways?|Wrapping [Uu]p|The [Bb]ottom [Ll]ine|Future [Oo]utlook|Looking [Aa]head)\s*:?\s*$/gm`
  Examples: `## Key Takeaways`
- `bottom_line`
  `/\bthe bottom line (?:is|here is)\b|\bat the end of the day,/gi`
  Examples: `The bottom line is that costs rose.`

### [medium] Challenges-and-future formula `challenges_and_future`

AI /1k words: 0.04 · human /1k: 0 · lift: ∞ (zero human hits)

**Why it happens.** A structural template: concede a difficulty, then reassure. It fills space without adding a single verifiable fact.

**False positives.** Strategy documents and policy briefs are supposed to do this. Judge by whether the challenges are named specifically or gestured at.

5 patterns · 9 pts each, capped at 30:

- `despite_challenges`
  `/\bdespite (?:these |its |the |such )?(?:challenges|obstacles|setbacks|difficulties|limitations|criticism)\b/gi`
  Examples: `Despite these challenges, the project continues to thrive.`
- `faces_challenges`
  `/\bfaces? (?:several |a number of |numerous |significant |ongoing )?(?:challenges|hurdles|obstacles)(?: that must be addressed)?\b/gi`
  Examples: `The sector faces several challenges that must be addressed.`
- `continues_to`
  `/\bcontinue[sd]? to (?:evolve|thrive|grow|shape|serve|inspire|play|provide|resonate|attract)\b/gi`
  Examples: `The festival continues to thrive.`
- `future_lies_in`
  `/\bthe future of\b[^.!?\n]{1,60}?\b(?:lies in|will depend on|hinges on|remains (?:bright|uncertain|promising))\b|\bpositions? (?:it|them|itself) (?:well )?for (?:future|continued|further)\b/gi`
  Examples: `The future of the format lies in its ability to adapt.`
- `sparked_conversation`
  `/\b(?:sparked|prompted|generated|ignited|raised) (?:broader |wider |important |renewed )?(?:conversations?|debates?|discussions?|reflections?|questions?) (?:about|around|regarding)\b/gi`
  Examples: `The ruling sparked broader conversations about privacy.`

### [medium] Vague attribution `vague_attribution`

AI /1k words: 0.15 · human /1k: 0.06 · lift: 2.5×

**Why it happens.** Consensus asserted without a nameable source. The model cannot cite what it does not have, so it invokes an anonymous collective.

**False positives.** Journalism uses "experts say" under real deadline constraints. The question to ask is whether a name appears anywhere nearby.

5 patterns · 8 pts each, capped at 35:

- `experts_say`
  `/\b(?:experts|analysts|observers|critics|commentators|scholars|researchers|historians|industry (?:experts|analysts|watchers))\s+(?:say|said|argue|argued|note|noted|believe|suggest|contend|have (?:noted|argued|suggested|cited|observed))\b/gi`
  Examples: `Experts argue that the trend will continue.`
- `studies_have_shown`
  Only fires when no year appears in the same sentence.
  `/\b(?:studies|research|reports|surveys|data)\s+(?:have |has )?(?:shown|suggest(?:ed)?|indicate[sd]?|reveal(?:ed)?|found)\b(?![^.!?\n]{0,60}\b(?:19|20)\d{2}\b)/gi`
  Examples: `Studies have shown a link between the two.`
- `several_sources`
  `/\b(?:several|multiple|various|numerous|a number of)\s+(?:sources|publications|outlets|commentators|accounts)\b/gi`
  Examples: `Several sources suggest otherwise.`
- `widely_regarded`
  `/\b(?:widely|generally|commonly|often)\s+(?:regarded|considered|recognised|recognized|acknowledged|seen|viewed|described|praised|hailed)\s+as\b/gi`
  Examples: `Widely regarded as a masterpiece.`
- `media_presence`
  Notability puffery.
  `/\bmaintains? an? (?:active|strong|significant|growing) (?:social media|digital|online|public) presence\b|\b(?:featured|profiled|covered) in (?:local|regional|national|international) (?:media )?outlets\b/gi`
  Examples: `She maintains an active social media presence.`

### [medium] Editorialising hedges `editorial_hedging`

AI /1k words: 0 · human /1k: 0 · lift: not exercised

**Why it happens.** Instructing the reader how to weigh a fact instead of presenting it. Safety training rewards this register heavily.

**False positives.** Common in genuine explanatory and pedagogical writing.

4 patterns · 6 pts each, capped at 30:

- `important_to_note`
  `/\bit(?:'s| is) (?:important|crucial|essential|vital|worth|useful|helpful|necessary) to (?:note|remember|consider|recognise|recognize|understand|emphasi[sz]e|highlight|acknowledge|point out|keep in mind)\b/gi`
  Examples: `It's important to note that results vary.`
- `worth_noting`
  `/\b(?:it is |it's )?worth (?:noting|mentioning|considering|remembering) that\b|\bnotably,|\bimportantly,/gi`
  Examples: `Worth noting that the sample was small.`
- `may_vary`
  `/\bmay vary (?:depending|based) on\b|\bresults (?:may|can) vary\b|\byour mileage may vary\b/gi`
  Examples: `Costs may vary depending on region.`
- `both_sides`
  False-balance construction.
  `/\bwhile\b[^.!?\n]{1,70}?,\s*it(?:'s| is) (?:also )?(?:important|worth|crucial|essential)\b/gi`
  Examples: `While the data is promising, it's important to remain cautious.`

### [medium] Promotional puffery `promotional_puffery`

AI /1k words: 0.27 · human /1k: 0.2 · lift: 1.4×

**Why it happens.** Travel-brochure register. The model reaches for evaluative adjectives when it lacks specific facts about a place, person, or product.

**False positives.** Marketing copy is supposed to sound like this. Only a tell in registers that claim neutrality.

5 patterns · 6 pts each, capped at 35:

- `nestled_in_heart`
  `/\bnestled (?:in|among|between|within)\b|\bin the heart of\b|\b(?:serves?|acts?) as (?:the |a )?gateway\b|\bhidden gem\b/gi`
  Examples: `Nestled in the heart of the old town...`
- `breathtaking_adjectives`
  Count as density, not as individual hits.
  `/\b(?:breathtaking|stunning|captivating|mesmeri[sz]ing|awe-inspiring|picturesque|idyllic|charming|quaint|bustling|vibrant|thriving|renowned|acclaimed|groundbreaking|revolutionary|cutting-edge|state-of-the-art|world-class|unparalleled|unrivalled|unrivaled)\b/gi`
  Examples: `a breathtaking view of the valley`
- `rich_tapestry`
  `/\b(?:rich|vibrant|diverse|colou?rful|intricate) (?:tapestry|mosaic|blend|array|heritage|history|culture|tradition)\b/gi`
  Examples: `a rich tapestry of influences`
- `commitment_to`
  `/\b(?:unwavering|steadfast|deep|strong|ongoing) commitment to\b|\bdedication to (?:excellence|quality|innovation|sustainability)\b/gi`
  Examples: `their unwavering commitment to quality`
- `boasts`
  `/\bboasts (?:a|an|the|over|more than|some)\b/gi`
  Examples: `The campus boasts a modern library.`

### [medium] Structural formatting tells `formatting_tells`

AI /1k words: 1.15 · human /1k: 0 · lift: ∞ (zero human hits)

**Why it happens.** Markdown habits from the chat interface surviving into a document: bolded label lists, title-case headings, gratuitous horizontal rules.

**False positives.** These are legitimate formatting choices. They only become evidence when they appear in a venue whose house style forbids them.

5 patterns · 6 pts each, capped at 30:

- `inline_header_list`
  Bullet + bold label + colon. The single most recognisable LLM list shape.
  `/^\s*(?:[-*+]|\d+\.)\s+\*\*[^*\n]{2,60}\*\*\s*[:—-]/gm`
  Examples: `- **Scalability**: handles growth gracefully`
- `title_case_heading`
  Every Word Capitalised In A Heading.
  `/^\s*#{2,6}\s+(?:[A-Z][a-z']+\s+){2,}[A-Z][a-z']+\s*$/gm`
  Examples: `### Early Career And Professional Development`
- `thematic_break_spam`
  Horizontal rules between every section. Density signal.
  `/^\s*(?:---|\*\*\*|___)\s*$/gm`
  Examples: `---`
- `bold_lead_in`
  A bolded line standing in for a real heading.
  `/^\s*\*\*[^*\n]{2,60}\*\*\s*$/gm`
  Examples: `**Key considerations**`
- `heading_then_heading`
  A heading whose only child is another heading.
  `/^\s*#{1,3}\s+[^\n]{1,60}\n+\s*#{2,4}\s+/gm`
  Examples: `# Overview
## Background`

### [low] Copula avoidance `copula_avoidance`

AI /1k words: 0.73 · human /1k: 0.46 · lift: 1.6×

**Why it happens.** LLMs substitute elaborate verbs for "is", "are", and "has". Geng & Trotta measured a >10% drop in "is"/"are" in academic writing in 2023.

**False positives.** Each of these verbs has honest uses. This is a density signal only.

3 patterns · 3 pts each, capped at 24:

- `serves_as`
  `/\b(?:serves?|served|stands?|stood|functions?|operates?|acts?|emerges?|positions? itself) as (?:a|an|the|one of)\b/gi`
  Examples: `The hall serves as a community centre.`
- `represents_a`
  `/\brepresents? (?:a|an|one of|the)\b|\bmarks? (?:a|an|the) (?:first|beginning|start|shift|milestone)\b/gi`
  Examples: `The move represents a significant change.`
- `features_offers`
  `/\b(?:features?|offers?|houses?|showcases?|encompasses|comprises|holds the distinction of being)\s+(?:a|an|the|over|more than|several|numerous)\b/gi`
  Examples: `The building features a glass atrium.`

### [low] Overrepresented vocabulary `ai_vocabulary`

AI /1k words: 2.15 · human /1k: 0.31 · lift: 6.9×

**Why it happens.** Words whose post-2022 frequency jumped measurably. Kobak et al. (2025) found "delves" at 28x its extrapolated 2024 frequency in PubMed abstracts; Juzek & Ward report even larger ratios for "delving" and "showcasing" in scientific abstracts.

**False positives.** Every one of these is an ordinary English word. A single use means nothing whatsoever. Clustering is the only meaningful signal, and this category is the primary driver of bias against non-native English writers, who tend toward formal register. Weight accordingly.

4 patterns · 2 pts each, capped at 30:

- `era_gpt4` · 2023 to mid-2024
  Peak-GPT-4 register.
  `/\b(?:delv(?:e|es|ed|ing)|tapestr(?:y|ies)|testament|pivotal|meticulous(?:ly)?|intricac(?:y|ies)|intricate|underscor(?:e|es|ed|ing)|bolster(?:ed|ing)?|garner(?:ed|ing)?|interplay|multifaceted|nuanced)\b/gi`
  Examples: `delve into the intricacies`
- `era_gpt4o` · mid-2024 to mid-2025
  `/\b(?:showcas(?:e|es|ed|ing)|foster(?:s|ed|ing)?|align(?:s|ed|ing)? with|enhanc(?:e|es|ed|ing)|enduring|crucial|vibrant|holistic|seamless(?:ly)?|robust|comprehensive|leverage[sd]?|realm|landscape)\b/gi`
  Examples: `a seamless and robust solution`
- `era_current` · mid-2025 onward
  `/\b(?:emphasi[sz]ing|highlighting|showcasing|deep dive|actionable|streamlin(?:e|es|ed|ing)|empower(?:s|ed|ing)?|unlock(?:s|ed|ing)? the (?:potential|power)|game[- ]chang(?:er|ing)|paradigm shift)\b/gi`
  Examples: `unlock the potential of your data`
- `sentence_initial_additionally`
  Sentence-initial connective. Human writers vary these more.
  `/(?:^|\n)\s*(?:Additionally|Moreover|Furthermore|Notably|Consequently|Nevertheless|Nonetheless),/gm`
  Examples: `Additionally, the cost fell.`

### [low] Consulting jargon `business_jargon`

AI /1k words: 0.08 · human /1k: 0 · lift: ∞ (zero human hits)

**Why it happens.** Corporate register the model defaults to for any business-adjacent prompt, regardless of whether the subject is commercial.

**False positives.** A real dialect spoken by real people in real meetings. Only a tell outside its native habitat.

3 patterns · 3 pts each, capped at 24:

- `synergy_family`
  `/\b(?:synerg(?:y|ies|istic)|actionable insights?|value[- ]add(?:ed)?|best[- ]in[- ]class|mission[- ]critical|core competenc(?:y|ies)|low[- ]hanging fruit|move the needle|circle back|touch base|boil the ocean|north star metric)\b/gi`
  Examples: `actionable insights that move the needle`
- `stakeholder_speak`
  `/\b(?:key stakeholders?|cross[- ]functional|end[- ]to[- ]end|scalable solutions?|drive (?:growth|value|impact|adoption)|operationali[sz]e|ideate|bandwidth for)\b/gi`
  Examples: `align key stakeholders end-to-end`
- `transformation_speak`
  `/\b(?:digital transformation|thought leader(?:ship)?|disrupt(?:ive|ion)? (?:innovation|technolog)|next[- ]generation|future[- ]proof|holistic approach|strategic imperative)\b/gi`
  Examples: `a holistic approach to digital transformation`

### [low] Analysis-report register `data_analysis_phrases`

AI /1k words: 0 · human /1k: 0 · lift: not exercised

**Why it happens.** Formulaic framing the model wraps around numbers, often when the numbers themselves are thin or unsourced.

**False positives.** Standard in analyst reports and data journalism.

4 patterns · 4 pts each, capped at 24:

- `data_reveals`
  `/\bthe (?:data|numbers|figures|results|findings|evidence|analysis) (?:reveals?|shows?|suggests?|tells? (?:a|us)|paints? a (?:picture|clear picture)|speaks? for itself)\b/gi`
  Examples: `The data paints a clear picture.`
- `at_a_glance`
  `/\b(?:at a glance|key (?:takeaways?|findings?|highlights?|metrics|insights?)|by the numbers|tl;?dr)\b/gi`
  Examples: `Key takeaways at a glance`
- `deep_dive_analysis`
  `/\b(?:let(?:'s| us) )?(?:take a )?(?:deep dive|closer look) (?:into|at)\b|\bdiving deeper\b|\bunpack(?:ing)? the (?:data|numbers|findings)\b/gi`
  Examples: `A deep dive into the quarterly figures`
- `suggests_trend`
  `/\b(?:indicat(?:es?|ing)|suggest(?:s|ing)?|point(?:s|ing)? to) a (?:growing|clear|strong|significant|notable|marked|worrying|promising) (?:trend|shift|correlation|pattern|increase|decline)\b/gi`
  Examples: `This points to a growing trend.`

## 03 · Validation: What it actually catches

Claims about detection are cheap. These are measured numbers from a run you can reproduce with the code in the repository.

Three corpora. The **AI article** set is 29 documented LLM outputs that Wikipedia editors archived as evidence when cleaning up machine-written drafts: real chatbot text that a real person pasted into a real encyclopedia. The **AI chat** set is 6 shorter samples in conversational register, from the same archive. The **human control** is 16 Wikipedia articles as they stood in December 2017, more than four years before ChatGPT shipped: same genre, same encyclopedic register, guaranteed pre-LLM.

**Score distribution**

| Corpus | n | words | mean | median | min | max |
|---|---:|---:|---:|---:|---:|---:|
| AI, article register | 29 | 26,863 | 34.0 | 31 | 3 | 87 |
| AI, chat register | 6 | 778 | 55.5 | 62 | 29 | 66 |
| Human, Wikipedia Dec 2017 | 16 | 35,502 | 9.9 | 9 | 4 | 20 |

The separation is real but the overlap matters more than the gap. No human document scored above 20. The lowest-scoring AI document scored 3.

**Threshold sweep: AI article corpus vs human control**

| Threshold | Recall | False positives | Precision |
|---:|---:|---:|---:|
| 15 | 83% | 25% | 86% |
| 25 | 66% | 0% | 100% |
| 35 | 38% | 0% | 100% |
| 45 | 21% | 0% | 100% |
| 65 | 17% | 0% | 100% |

> **Read that table honestly.** A threshold clean enough to produce zero false positives on 16 human documents still misses a third of known machine text. Push recall to 83% and one human article in four gets flagged. There is no setting that is both safe and thorough, and this is on a tiny, favourable, single-genre corpus.

### The signal that did not survive contact with data

"Burstiness" (the idea that humans vary sentence length far more than machines) is the most widely repeated heuristic in this space and a documented input to commercial detectors. On this corpus it does nothing. Mean coefficient of variation in sentence length came out at **0.546 for the AI text and 0.606 for the human text**: a difference in the predicted direction, far too small to separate anything, and swamped by genre. Encyclopedic prose is uniform whoever writes it.

The em dash, by contrast, held up: **2.65 per thousand words versus 0.26**. So did the machine artifacts, at infinite lift; they appear in 17% of the AI documents and zero human ones, which is what you would expect of a signal that is not about writing at all.

### The noisiest category, and why it stays in

Three-item lists fire in **94% of the human documents** and 83% of the AI ones. Measured by document presence the category is worse than useless. Measured by density it still carries a 4.4× lift, because the AI text stacks triads at 3.11 per thousand words against 0.71. It is kept, weighted low, capped hard, and labelled as the highest false-positive family in the file. That is the honest treatment of a weak signal: keep it visible, never let it drive a verdict.

### What the corpus could not test

Three categories (model self-identification, editorialising hedges, and analysis-report register) recorded zero hits in _both_ corpora. They are not broken; their unit examples all pass. They are simply absent from Wikipedia-register text, because nobody leaves "As an AI language model" in an encyclopedia draft they are trying to get past reviewers, and encyclopedias do not say "the data paints a clear picture". Those three rest on documented examples alone, and are marked as such rather than quietly presented as validated.

## 04 · Limits: Why detection keeps failing

The industry's own numbers are the strongest argument against trusting any of this as evidence. OpenAI shipped an AI Text Classifier in January 2023 and withdrew it that July, citing low accuracy; its published figures were a **26% true-positive rate at a 9% false-positive rate**: a tool that missed three-quarters of machine text while wrongly accusing nearly one human document in eleven. Turnitin, which is still deployed at scale in education, states under 1% false positives at the document level but roughly **4% at the sentence level**. Weber-Wulff and colleagues tested fourteen tools in 2023 and concluded they were "neither accurate nor reliable", with detection degrading sharply on paraphrased, human-edited, or translated text.

Then there is the bias, which is not a bug to be patched. Liang's TOEFL study found that running the human-written essays through ChatGPT to "enhance word choices to sound more like a native speaker" dropped their false-positive rate from 61.22% to **11.77%**. Running the reverse experiment (simplifying American students' essays to sound non-native) pushed their false-positive rate from 5.19% to **56.65%**. The detectors were not finding machines. They were finding low-perplexity prose, which is what you write when you are working carefully in your second language.

Every category in this file inherits that flaw, and the vocabulary category is where it bites hardest. Formal register, restricted synonym range, careful connectives: this is what good non-native academic English looks like, and it is also what the model does.

### The target moves

Wikipedia's editors track which words cluster in which model era. Their breakdown: _delve, tapestry, testament, pivotal, meticulous, intricate_ for GPT-4 through mid-2024; _align with, showcase, foster, enhance, vibrant_ for the GPT-4o period; _emphasising, highlighting, showcasing_ from mid-2025. _Delve_ itself, the most famous tell of all, dropped off sharply during 2025. The library tags patterns by era for this reason. Any wordlist of this kind is a photograph of a particular season of model releases, and it starts decaying the day it is written.

It also decays because it is adversarial. Once a tell becomes notorious, it gets tuned out, as happened to the em dash in GPT-5.1. The signals that survive are the ones nobody is optimising against, which is precisely why the vendor citation artifacts are the most durable category here and the vocabulary list is the least.

> **What this is good for.** Linting your own drafts before you publish. Reviewing a pull request against a house style guide. Feeding the pattern list to a model as instructions for what not to write. Getting a fast second opinion on prose that feels off, before you reread it properly yourself.
>
> **What it is not good for.** Grading students. Screening job applicants. Moderation decisions. Anything where a person bears a cost for being wrongly flagged.

## 05 · The tool: SlopDetector

Everything above, as something you can actually use. Paste prose and every match is highlighted in place; click one to see which rule fired, why models produce it, and how it earns false positives.

It runs entirely in your browser: no upload, no logging, verifiable in view-source. The engine is not a reimplementation, since the page is generated by a build step that inlines the same two modules the command-line linter and the HTTP API import, so all three surfaces return identical findings for identical input. That equivalence is asserted by a test, which is how a real discrepancy surfaced: one rule shipped disabled in the CLI and enabled in the API, because the default lived in the wrong file.

**[Open SlopDetector →](https://slopdetector.me)**

### Or run it yourself

The catalogue ships as a zero-dependency npm package with a CLI, an ESLint-style config, a pre-commit hook, and an HTTP API you can deploy to Cloudflare Workers or run locally.

| Surface | Command | For |
|---|---|---|
| Browser | `SlopDetector` | Reading a draft, exploring the rules |
| CLI | `npx slop "docs/**/*.md"` | Pre-commit hooks, CI gates, editors |
| API | `npx -p ai-text-patterns slop-serve` | Other apps, pipelines, deployment |

The CLI exits `0` clean, `1` on a lint failure and `2` on a config error, so a broken config never masquerades as a prose problem. Critical-tier rules (the vendor citation artifacts) are the only ones worth gating a build on.

## Sources

1. [Wikipedia:Signs of AI writing](https://en.wikipedia.org/wiki/Wikipedia:Signs_of_AI_writing), WikiProject AI Cleanup. The most complete public catalogue, continuously updated.
2. Kobak, González-Márquez, Horvát & Lause. [Delving into LLM-assisted writing in biomedical publications through excess vocabulary](https://www.science.org/doi/10.1126/sciadv.adt3813). _Science Advances_ 11(27), 2025.
3. Juzek & Ward. [Why Does ChatGPT "Delve" So Much?](https://arxiv.org/abs/2412.11385) Findings of ACL, 2025.
4. Liang, Yüksekgönül, Mao, Wu & Zou. [GPT detectors are biased against non-native English writers](https://www.cell.com/patterns/fulltext/S2666-3899(23)00130-7). _Patterns_ 4(7), 2023.
5. Russell, Karpinska & Iyyer. [People who frequently use ChatGPT for writing tasks are accurate and robust detectors of AI-generated text](https://aclanthology.org/2025.acl-long.267/). ACL, 2025.
6. Weber-Wulff et al. [Testing of Detection Tools for AI-Generated Text](https://arxiv.org/abs/2306.15666), 2023.
7. Merrill, Chen & Kumer. [What are the clues that ChatGPT wrote something?](https://www.washingtonpost.com/technology/interactive/2025/how-detect-chatgpt-em-dash/) _The Washington Post_, 13 Nov 2025.
8. [How to spot AI writing](https://www.economist.com/culture/2026/07/30/how-to-spot-ai-writing). _The Economist_, 30 Jul 2026.
9. [Understanding the false positive rate for sentences](https://www.turnitin.com/blog/understanding-the-false-positive-rate-for-sentences-of-our-ai-writing-detection-capability). Turnitin, 14 Jun 2023.
10. [Anti-AI Writing Guide for Robots](https://aiwritingguide.misterburton.com): a machine-readable rendering of the Wikipedia catalogue, exportable as a system prompt.

## Method

Human control: 16 English Wikipedia articles retrieved at their last revision before 1 January 2018 via the MediaWiki API, wikitext stripped to prose. AI corpora: the 29 archived subpages of `Wikipedia:Signs of AI writing/Examples` exceeding 250 words, plus 6 chat-register excerpts quoted in the parent page. Scoring counts distinct surface forms per category, weights by severity, caps per category, and normalises toward a 500-word reference length. Code blocks are stripped before matching. Typography metrics run on raw text before Unicode folding.

## Reproducing

The bundle contains the `ai-text-patterns` npm package (library, CLI, four reporters, HTTP API, 64 tests), the SlopDetector page and its build step, plus the research harness: `build-corpus.py` and `build-ai-corpus.py` for corpus construction, `validate.mjs` for the run that produced every number on this page, and `validation-report.txt` as its raw output.

---

Pattern catalogue derived from Wikipedia:Signs of AI writing, used under CC BY-NC-SA 4.0; this page and the library carry the same licence. Measurements were produced on a corpus of 63,143 words and should be read as indicative of that corpus, not as general accuracy claims.

Full interactive version: https://about.slopdetector.me/
Try the tool: https://slopdetector.me/
