#!/usr/bin/env python3
"""Build two corpora for validating ai-text-patterns.js.

HUMAN control: Wikipedia article text as it stood on 2018-01-01, i.e. more
than four years before ChatGPT's public release. Same genre and register as
the AI samples, which is the only fair comparison.

AI samples: extracted from the documented examples on
Wikipedia:Signs of AI writing, plus prose from LLM-authored pages.
"""
import json, re, time, urllib.parse, urllib.request, pathlib

UA = {"User-Agent": "ai-pattern-research/1.0 (regex validation)"}
OUT = pathlib.Path(".")

HUMAN_TITLES = [
    "Bengal tiger", "Cologne Cathedral", "Hokkaido", "Kiwifruit",
    "Great Barrier Reef", "Salzburg", "Nikola Tesla", "Baobab",
    "Trans-Siberian Railway", "Machu Picchu", "Chess", "Lisbon",
    "Aurora", "Bauhaus", "Coral reef", "Kyoto", "Manuka honey",
    "Rembrandt", "Sourdough", "Volcano",
]


def api(params):
    url = "https://en.wikipedia.org/w/api.php?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)


def clean_wikitext(t):
    t = re.sub(r"\{\{[^{}]*\}\}", " ", t)
    t = re.sub(r"\{\{[^{}]*\}\}", " ", t)
    t = re.sub(r"<ref[^>]*/>", " ", t)
    t = re.sub(r"<ref[^>]*>.*?</ref>", " ", t, flags=re.S)
    t = re.sub(r"<!--.*?-->", " ", t, flags=re.S)
    t = re.sub(r"<[^>]+>", " ", t)
    t = re.sub(r"\[\[(?:[^\]|]*\|)?([^\]]*)\]\]", r"\1", t)
    t = re.sub(r"\[https?://\S+ ([^\]]*)\]", r"\1", t)
    t = re.sub(r"\[https?://\S+\]", " ", t)
    t = re.sub(r"^\s*[\|!\{].*$", "", t, flags=re.M)   # table rows
    t = re.sub(r"'''?", "", t)
    t = re.sub(r"==+\s*(?:References|External links|See also|Further reading|Notes|Bibliography)\s*==+.*",
               "", t, flags=re.S | re.I)
    t = re.sub(r"\n{3,}", "\n\n", t)
    return t.strip()


def fetch_old(title, ts="2018-01-01T00:00:00Z"):
    d = api({"action": "query", "prop": "revisions", "titles": title,
             "rvlimit": 1, "rvstart": ts, "rvdir": "older",
             "rvprop": "content|timestamp", "rvslots": "main",
             "format": "json", "formatversion": 2})
    pages = d.get("query", {}).get("pages", [])
    if not pages or "revisions" not in pages[0]:
        return None, None
    rev = pages[0]["revisions"][0]
    return clean_wikitext(rev["slots"]["main"]["content"]), rev["timestamp"]


human = []
for t in HUMAN_TITLES:
    try:
        txt, when = fetch_old(t)
        if txt and len(txt.split()) > 400:
            human.append({"id": t, "date": when, "text": txt[:14000]})
            print(f"  human  {t:28s} {when[:10]}  {len(txt.split()):>5} words")
        else:
            print(f"  SKIP   {t}")
    except Exception as e:
        print(f"  ERR    {t}: {e}")
    time.sleep(0.3)

(OUT / "corpus-human.json").write_text(json.dumps(human, indent=1))
print(f"\nhuman corpus: {len(human)} documents, "
      f"{sum(len(d['text'].split()) for d in human)} words")
