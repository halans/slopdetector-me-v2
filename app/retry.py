import json, re, time, urllib.parse, urllib.request, pathlib, importlib.util
spec = importlib.util.spec_from_file_location("bc","build-ai-corpus.py")
UA = {"User-Agent":"ai-pattern-research/1.0"}
def api(params):
    url="https://en.wikipedia.org/w/api.php?"+urllib.parse.urlencode(params)
    return json.load(urllib.request.urlopen(urllib.request.Request(url,headers=UA),timeout=30))
def clean(t):
    for _ in range(3): t=re.sub(r"\{\{[^{}]*\}\}"," ",t)
    t=re.sub(r"<ref[^>]*/>"," ",t); t=re.sub(r"<ref[^>]*>.*?</ref>"," ",t,flags=re.S)
    t=re.sub(r"<!--.*?-->"," ",t,flags=re.S)
    t=re.sub(r"</?(?:div|span|small|nowiki|syntaxhighlight|pre|blockquote)[^>]*>"," ",t)
    t=re.sub(r"\[\[(?:[^\]|]*\|)?([^\]]*)\]\]",r"\1",t)
    t=re.sub(r"\[https?://\S+ ([^\]]*)\]",r"\1",t)
    t=re.sub(r"'''?","",t)
    t=re.sub(r"==+\s*(?:References|External links|See also|Further reading|Notes)\s*==+.*","",t,flags=re.S|re.I)
    return re.sub(r"\n{3,}","\n\n",t).strip()

ai=json.load(open("corpus-ai.json")); have={d["id"] for d in ai}
missing=["Jacques Blois (linguist)","Josef von Rickenbach","Mehak Malik","Pacific Mall, Tagore Garden","Parmod Maloo","Paytra","Peter Oloche David","Pixaroo","Reze (Chainsaw Man)","Self-portrait (Yayoi Kusama)","Socio-cognitive engineering","TUSAŞ Gölge tactical UAV","Talk:Arthur Katalayi","Triple Entry Accounting","Émile Dufresne"]
for name in missing:
    if name in have: continue
    for attempt in range(4):
        try:
            d=api({"action":"query","prop":"revisions","titles":f"Wikipedia:Signs of AI writing/Examples/{name}","rvlimit":1,"rvprop":"content","rvslots":"main","format":"json","formatversion":2})
            p=d["query"]["pages"][0]
            if "revisions" in p:
                t=clean(p["revisions"][0]["slots"]["main"]["content"])
                if len(t.split())>250:
                    ai.append({"id":name,"text":t[:14000]}); print(f"  + {name[:40]:42s} {len(t.split())}")
            break
        except Exception as e:
            time.sleep(4*(attempt+1))
    time.sleep(2.5)
json.dump(ai,open("corpus-ai.json","w"),indent=1)
print(f"\nai corpus: {len(ai)} docs, {sum(len(d['text'].split()) for d in ai)} words")
