# Anti-AI Writing Guide for Chatbots
*A pattern-based reference for producing natural, professional prose free of the linguistic tells that mark text as AI-generated.*

_Last generated: 2026-08-18T13:00:35.509Z_

---
## Objective
AI language models regress toward statistically common language, replacing specific facts with generic, positive-sounding descriptions and inserting formulaic structures that recur regardless of topic. This guide catalogs those patterns so developers and writers can detect, avoid, and lint against them. The rules apply to any content type: blog posts, technical documentation, business reports, emails, or reference material. The goal is prose that reads as written by a knowledgeable human, not assembled from high-frequency training tokens.

---
## Non-negotiables (hard rules)

**Puffery and promotional language**
- No "nestled", "breathtaking", "vibrant", "boasts a", "groundbreaking", "renowned", "showcasing", "commitment to", "natural beauty", "in the heart of", "gateway to", "diverse array", "rich history", "stunning", "captivating", "diverse tapestry", "dependable value-driven experiences", "acts as the gateway", "seamlessly connecting"

**Importance and legacy emphasis**
- No "stands/serves as a testament/reminder", "vital/significant/crucial/pivotal role/moment", "underscores/highlights its importance/significance", "reflects broader", "symbolizing its ongoing/enduring/lasting", "setting the stage for", "marking/shaping the", "represents/marks a shift", "key turning point", "evolving landscape", "focal point", "indelible mark", "deeply rooted", "contributing to the"

**Superficial analysis via participial phrases**
- No trailing "-ing" clauses that add empty commentary: "highlighting its significance", "emphasizing the importance", "reflecting the rich culture", "underscoring its role", "fostering a sense of", "demonstrating the ongoing relevance", "confirming its relevance", "illustrating lasting influence", "creating a space where", "contributing to the socio-economic development"

**Notability and media coverage emphasis**
- No "independent coverage", "local/regional/national media outlets", "featured in [list of outlets]", "profiled in", "documented in archived programs", "maintains an active social media presence", "strong digital presence", "significant, substantial, secondary coverage", "repeated national media coverage", "ongoing public presence in respected media", "high-quality, independent, and widely-read outlets"

**Vague attributions**
- No "industry reports", "observers have cited", "experts argue", "some critics argue", "researchers and conservationists", "several sources/publications" when only one or two sources exist, "described in scholarship" without naming the scholar, "modern researchers treat" without citation, "according to [vague collective noun]"

**Challenges-and-future formula**
- No "despite its [positive word], [subject] faces challenges" followed by vague optimism, "future prospects" speculation, "despite these challenges, continues to thrive", "positions them as critical components", standalone "Challenges and future directions" or "Future outlook" sections, "faces several challenges that must be addressed for broader adoption"

**Negative parallelisms**
- No "not only...but also", "not just...it's", "it's not about...it's", "no...no...just", "is not X but Y", "not a career, not a body of work, just", "rather than" used to create false contrasts

**Ritual conclusions**
- No "in summary", "in conclusion", "overall" section endings or paragraph restatements of the preceding content; no standalone "Conclusion" or "Future outlook" sections; no restating the section's theme after the last fact

**Collaborative and meta-commentary text**
- No "I hope this helps", "certainly!", "of course!", "would you like", "let me know", "here is a", "more detailed breakdown", "you're absolutely right", "as an AI language model", "as a large language model", "happy to address any further concerns"

**Knowledge-cutoff disclaimers**
- No "as of my last knowledge update", "based on available information", "while specific details are limited/scarce", "not widely available/documented/disclosed", "in the provided sources", "up to my last training update", "keeps much of his personal life private" when speculative, "likely due to limited mainstream exposure", "I've inferred common motifs"

**Placeholder text**
- No fill-in-the-blank brackets, "2025-xx-xx" dates, "INSERT_SOURCE_URL", "SOURCE_PUBLISHER", "PASTE_URL_HERE", unfilled fields, "Delete this section before submission"

**Formatting tells**
- No title-case headings, emoji in headings or bullets, excessive boldface for emphasis, em-dash overuse for rhetorical punch, inline-header vertical lists (bullet + **Bold header**: text), unnecessary tables for information that fits in a sentence or two

**Overused AI vocabulary**
- Avoid clustering: "additionally" (sentence-initial), "align with", "bolstered", "crucial", "delve", "emphasizing", "enduring", "enhance", "fostering", "garner", "highlight" (verb), "interplay", "intricate/intricacies", "key" (adjective), "landscape" (abstract), "meticulous/meticulously", "pivotal", "showcase", "tapestry" (abstract), "testament", "underscore" (verb), "valuable", "vibrant"

**Copulative avoidance**
- Do not substitute "serves as", "stands as", "marks as", "represents a", "boasts", "features", "offers", "maintains", "holds the distinction of being" for simple "is", "are", "has"

**Elegant variation**
- Do not cycle through synonyms for the same subject to avoid repetition; reuse the name or a simple pronoun

---
## Do this instead

1. **State facts without editorializing their significance.** Write "The institute was established in 1989" not "marking a pivotal moment in the evolution of regional statistics."
2. **Use specific, concrete details.** "The station has six platforms and eight tracks" not "serving as a major hub facilitating the movement of passengers and goods."
3. **Attribute claims to named sources.** "Chen et al. (2024) found a 12% efficiency gain" not "researchers have noted promising developments."
4. **End sections with content, not summaries.** Stop when the last fact is stated; do not restate the section's theme.
5. **Describe challenges in context.** Integrate specific obstacles into the relevant paragraph rather than isolating them in a formulaic "Challenges" section.
6. **Use simple copulatives.** "The gallery has four spaces" not "The gallery features four distinct spaces that serve as a hub for contemporary expression."
7. **Use sentence case for all headings.** "Early career" not "Early Career and Professional Development."
8. **Vary sentence structure naturally.** Avoid mechanical triads: "adjective, adjective, and adjective" or "phrase, phrase, and phrase."
9. **Avoid elegant variation.** Reuse the subject's name or a simple pronoun rather than cycling through synonyms to dodge repetition.
10. **Keep formatting minimal.** Bold only terms being defined; use plain bullets for genuine lists; avoid tables for fewer than three rows of comparable data.

---
## Quick templates (safe patterns)

- **Factual statement:** [Entity] [verb] [specific object] in [location/context] since [date].
- **Historical event:** [Event] occurred on [specific date], resulting in [measurable outcome].
- **Technical description:** [Process] uses [specific method] to produce [documented result] under [conditions].
- **Organizational fact:** [Institution] was founded in [year] and conducts [primary activities] for [defined audience].
- **Comparative claim:** [Source, year] found that [X] outperformed [Y] by [specific measure] in [defined conditions].

---
## Linter patterns to flag (review on generate)

```regex
(stands|serves)\s+as\s+a\s+(testament|symbol|hub|reminder|celebration)
(rich|vibrant)\s+(cultural|historical)\s+(heritage|tapestry|legacy)
(breathtaking|stunning|nestled|captivating|groundbreaking|renowned|exemplifies|profound)
(plays\s+a|played\s+a)\s+(vital|significant|crucial|pivotal)\s+role
(underscores|highlights)\s+(its|their)\s+(importance|significance)
(reflects\s+broader|symbolizing\s+its\s+ongoing|setting\s+the\s+stage\s+for|marks\s+a\s+shift|focal\s+point)
(enduring|lasting)\s+(impact|legacy|influence)
(key\s+turning\s+point|indelible\s+mark|deeply\s+rooted)
not\s+(just|only).{1,60}but\s+(also|rather)
(it'?s\s+not\s+about|it\s+is\s+not\s+about).{1,60}(it'?s|it\s+is)
despite\s+(its|these)\s+(success|challenges).{1,120}(continues\s+to|positions\s+them|future\s+prospects)
(in\s+summary|in\s+conclusion|overall,\s+)(the|this|these)
(industry\s+reports|observers\s+have\s+cited|experts\s+argue|some\s+critics\s+argue|researchers\s+and\s+conservationists)
(several\s+sources|several\s+publications)\s+(have|suggest)
(featured\s+in|cited\s+in|profiled\s+in|documented\s+in\s+archived)
(certainly|of\s+course)!
(would\s+you\s+like|let\s+me\s+know|I\s+hope\s+this\s+helps|here\s+is\s+a\s+|more\s+detailed\s+breakdown)
as\s+(of|at)\s+my\s+(last|latest)\s+(update|training|knowledge)
(while\s+specific\s+details\s+are|not\s+widely)\s+(limited|available|documented|disclosed)
(based\s+on\s+available\s+information|in\s+the\s+provided\s+sources|up\s+to\s+my\s+last\s+training)
(highlighting|emphasizing|ensuring|reflecting|underscoring|showcasing|cultivating|fostering|encompassing)\s+(its|their)\s+(significance|importance|role)
(aligns?\s+with|resonates?\s+with|valuable\s+insights)
^Additionally,
\b(delves?|delving)\b
\b(crucial)\b
\b(pivotal)\b
\b(tapestry)\b
\b(underscore[sd]?|underscoring)\b
\b(showcase[sd]?|showcasing)\b
\b(vibrant)\b
\b(intricate|intricacies)\b
\b(meticulous(?:ly)?)\b
\b(garner(?:ed|ing)?)\b
\b(interplay)\b
\b(testament)\b
^\d+\.\s+\*\*[^*]+\*\*:
^[-•]\s+\*\*[^*]+\*\*:
(maintains\s+an?\s+(active|strong)\s+(social\s+media|digital)\s+presence)
(keeps?\s+(much\s+of\s+)?(his|her|their)\s+personal\s+life\s+private)
(it'?s\s+important\s+(to\s+note|to\s+remember|to\s+consider)|worth\s+noting\s+that)
(may\s+vary\s+depending|it\s+is\s+crucial\s+to\s+differentiate)
(not\s+just\s+a?\s+\w+.{1,40}it'?s\s+a)
(no\s+\w+,\s+no\s+\w+,\s+just)
(\w+,\s+\w+,\s+and\s+\w+\s+(alike|together|combined))
(serves?\s+as|stands?\s+as|marks?\s+as|represents?\s+a)\s+\w+
\b(bolstered)\b
(demonstrating|confirming|illustrating)\s+(the\s+)?(ongoing|enduring|lasting|continued)\s+(relevance|influence|importance)
(keeps?\s+personal\s+details\s+private|maintains\s+a\s+low\s+profile)
(likely\s+due\s+to\s+limited|I\s+have\s+inferred|my\s+analysis\s+is\s+based\s+on\s+available)
(as\s+an\s+AI\s+(language\s+)?model|as\s+a\s+large\s+language\s+model)
(plays?\s+a\s+role\s+in\s+the\s+ecosystem|contributes?\s+to\s+.*cultural\s+heritage)
(preserving\s+this\s+.*\s+is\s+vital|crucial\s+for\s+the\s+survival\s+of)
(creating\s+a\s+(space|sense|community)\s+where|embodying\s+the\s+spirit\s+of)
(significant,\s+substantial,\s+secondary\s+coverage)
(repeated\s+national\s+media\s+coverage|ongoing\s+public\s+presence\s+in\s+respected\s+media)
(I\s+am\s+open\s+to\s+(any|further)\s+(suggestions|feedback|guidance|input))
(if\s+(there\s+are|you\s+have)\s+specific\s+(areas|sections|concerns))
(I\s+would\s+(greatly\s+)?appreciate\s+(your\s+)?(guidance|feedback|input))
(happy\s+to\s+address\s+any\s+further\s+concerns)
(aligns?\s+with\s+.*\s+(standards|guidelines|principles|goals))
(adheres?\s+to\s+.*\s+(policies|guidelines|standards))
(holds?\s+the\s+distinction\s+of\s+being)
(acts?\s+as\s+the\s+gateway)
(faces\s+several\s+challenges\s+that\s+must\s+be\s+addressed)
(positions?\s+(it|them)\s+(well\s+)?for\s+(future|continued))
(the\s+future\s+of\s+.*\s+lies\s+in\s+its\s+ability\s+to)
(continue[sd]?\s+to\s+(evolve|thrive|provide|serve|grow))
(generated\s+debate\s+about|prompted\s+broader\s+reflection|raised\s+philosophical\s+questions)
(shaped\s+emerging\s+policy\s+discussions|sparked\s+conversations\s+about)
```

---
## Final self-check (before returning any draft)

- [ ] No promotional or puffery language present
- [ ] No formulaic significance statements or superficial participial analysis
- [ ] No ritual section conclusions, summaries, or "in conclusion" restatements
- [ ] No vague third-party attributions; all claims tied to named, verifiable sources
- [ ] No collaborative meta-commentary, chatbot pleasantries, or subject-line headers
- [ ] No knowledge-cutoff disclaimers or speculative gap-filling
- [ ] No placeholder text, unfilled brackets, or dummy dates
- [ ] No title-case headings, emoji decorations, or excessive boldface
- [ ] No challenges-and-future-prospects formula
- [ ] No mechanical negative parallelisms ("not only...but also", "it's not...it's")
- [ ] No clustering of AI vocabulary words in the same passage
- [ ] No inline-header vertical lists (bullet + **Bold**: description format)
- [ ] Copulatives used naturally; "is/are/has" preferred over elaborate substitutes

---
## Minimal example rewrites

**Before:** "The museum stands as a testament to the enduring legacy of the region, highlighting its cultural significance and fostering a sense of community among visitors."