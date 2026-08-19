#!/usr/bin/env python3
"""Collect documented LLM-generated text: the /Examples/ subpages archived
under Wikipedia:Signs of AI writing. These are real chatbot outputs that were
posted to Wikipedia and preserved as evidence, so they are ground truth for
'text a person actually pasted out of an LLM'."""
import json, re, time, urllib.parse, urllib.request, pathlib
from importlib import import_module

bc = import_module("build-corpus".replace("-", "_")) if False else None

UA = {"User-Agent": "ai-pattern-research/1.0 (regex validation)"}


def api(params):
    url = "https://en.wikipedia.org/w/api.php?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)


def clean_wikitext(t):
    for _ in range(3):
        t = re.sub(r"\{\{[^{}]*\}\}", " ", t)
    t = re.sub(r"<ref[^>]*/>", " ", t)
    t = re.sub(r"<ref[^>]*>.*?</ref>", " ", t, flags=re.S)
    t = re.sub(r"<!--.*?-->", " ", t, flags=re.S)
    t = re.sub(r"</?(?:div|span|small|nowiki|syntaxhighlight|pre|blockquote)[^>]*>", " ", t)
    t = re.sub(r"\[\[(?:[^\]|]*\|)?([^\]]*)\]\]", r"\1", t)
    t = re.sub(r"\[https?://\S+ ([^\]]*)\]", r"\1", t)
    t = re.sub(r"'''?", "", t)
    t = re.sub(r"==+\s*(?:References|External links|See also|Further reading|Notes)\s*==+.*",
               "", t, flags=re.S | re.I)
    t = re.sub(r"\n{3,}", "\n\n", t)
    return t.strip()


# enumerate the archived example subpages
members = []
cont = {}
while True:
    d = api({"action": "query", "list": "allpages",
             "apprefix": "Signs of AI writing/Examples/",
             "apnamespace": 4, "aplimit": 500, "format": "json",
             "formatversion": 2, **cont})
    members += [p["title"] for p in d["query"]["allpages"]]
    if "continue" in d:
        cont = d["continue"]
        time.sleep(0.4)
    else:
        break

print(f"found {len(members)} archived example pages")

ai = []
for title in members:
    try:
        d = api({"action": "query", "prop": "revisions", "titles": title,
                 "rvlimit": 1, "rvprop": "content|timestamp", "rvslots": "main",
                 "format": "json", "formatversion": 2})
        page = d["query"]["pages"][0]
        if "revisions" not in page:
            continue
        txt = clean_wikitext(page["revisions"][0]["slots"]["main"]["content"])
        # drop the editorial banner Wikipedia prepends to these archives
        txt = re.sub(r"^.*?(?:archived|preserved|example).*?\n", "", txt, count=1, flags=re.I)
        if len(txt.split()) > 250:
            ai.append({"id": title.split("/")[-1], "text": txt[:14000]})
            print(f"  ai  {title.split('/')[-1][:40]:42s} {len(txt.split()):>5} words")
    except Exception as e:
        print(f"  ERR {title}: {e}")
    time.sleep(0.35)

pathlib.Path("corpus-ai.json").write_text(json.dumps(ai, indent=1))
print(f"\nai corpus: {len(ai)} documents, {sum(len(d['text'].split()) for d in ai)} words")
