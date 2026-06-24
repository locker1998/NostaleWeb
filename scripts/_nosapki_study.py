import re
import urllib.request

UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}

def fetch(url):
    req = urllib.request.Request(url, headers=UA)
    return urllib.request.urlopen(req, timeout=20).read().decode("utf-8", "replace")

html = fetch("https://nosapki.com/nt/character")
print("html len", len(html))
for pat in [
    r'character-view-box',
    r'element-character-view',
    r'shadowChar',
    r'fr=',
    r'/sprites/',
]:
    print(pat, html.count(pat))

# find script src
scripts = re.findall(r'<script[^>]+src="([^"]+)"', html)
print("scripts", len(scripts))
for s in scripts[:20]:
    print(" ", s)

# inline script snippets
for m in re.finditer(r'character-view', html):
    start = max(0, m.start() - 80)
    print("CTX:", html[start:m.start()+120].replace("\n", " ")[:200])

# try common static paths
for path in [
    "/css/main.css",
    "/css/app.css",
    "/static/css/main.css",
    "/assets/index.css",
]:
    try:
        body = fetch("https://nosapki.com" + path)
        if "character-view" in body:
            print("FOUND CSS", path)
            idx = body.find("character-view")
            print(body[idx-200:idx+800])
    except Exception as e:
        pass
