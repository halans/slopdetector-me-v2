import json, re
wt = open("wp2.wiki", encoding="utf-8").read()
lines = wt.split("\n")

# Sections whose quoted examples are chat-register AI output
spans = [(631,692),(892,948),(959,1074),(1493,1560)]
chunks=[]
for a,b in spans:
    chunks.append("\n".join(lines[a-1:b]))
blob = "\n".join(chunks)

# Pull the quoted example bodies out of collapse/quote wrappers
bodies=[]
for m in re.finditer(r"\{\{(?:collapse top|ctop|quote frame|blockquote)\b(.*?)\{\{(?:collapse bottom|cbot)\}\}", blob, re.S):
    bodies.append(m.group(1))
for m in re.finditer(r"\{\{quote frame\|(.*?)\n\}\}", blob, re.S):
    bodies.append(m.group(1))

def clean(t):
    t = re.sub(r"\{\{fake heading\|level=(\d)\|([^}]*)\}\}", lambda m:"\n"+"#"*int(m.group(1))+" "+m.group(2)+"\n", t)
    t = re.sub(r"\{\{fake heading\|([^}]*)\}\}", r"\n## \1\n", t)
    t = re.sub(r"\{\{highlight\|([^|}]*)(?:\|[^}]*)?\}\}", r"\1", t)
    t = re.sub(r"\{\{xt\|([^}]*)\}\}", r"\1", t)
    t = re.sub(r"\{\{=\}\}", "=", t)
    for _ in range(3): t = re.sub(r"\{\{[^{}]*\}\}", " ", t)
    t = re.sub(r"^\|.*$","",t,flags=re.M)
    t = re.sub(r"<br\s*/?>", "\n", t)
    t = re.sub(r"</?(?:nowiki|syntaxhighlight|pre|small|div|span)[^>]*>"," ",t)
    t = re.sub(r"\[\[(?:[^\]|]*\|)?([^\]]*)\]\]", r"\1", t)
    t = re.sub(r"\[https?://\S+ ([^\]]*)\]", r"\1", t)
    t = re.sub(r"'''?","",t)
    t = re.sub(r"^\s*(?:From|expand=yes\|From).*$","",t,flags=re.M)
    return re.sub(r"\n{3,}","\n\n",t).strip()

docs=[]
for i,b in enumerate(bodies):
    c=clean(b)
    if len(c.split())>=60:
        docs.append({"id":f"chat-{i:02d}","text":c[:9000]})
json.dump(docs, open("corpus-chat.json","w"), indent=1)
print(f"chat corpus: {len(docs)} docs, {sum(len(d['text'].split()) for d in docs)} words")
for d in docs[:4]: print("---", d["text"][:160].replace("\n"," "))
