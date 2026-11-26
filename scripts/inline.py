#!/usr/bin/env python3
"""
inline.py: turn a webgl-deck HTML into ONE self-contained offline file.

  * three.js: the import-map entry for "three" becomes a base64 data: URL
  * fonts:    the Google Fonts <link> becomes inline @font-face rules with base64 woff2
              (latin subset only by default, to keep the file small)
  * images / other files referenced as  src="local/path"  or  url(local/path)  are embedded

usage:
  python3 inline.py deck.html -o deck.offline.html
  python3 inline.py deck.html -o out.html --three node_modules/three/build/three.module.min.js
  python3 inline.py deck.html -o out.html --font "Anton|400|normal|fonts/anton.woff2" --font ...
  python3 inline.py deck.html -o out.html --subsets latin,latin-ext

Without --three, three.js is downloaded from the URL in the import map (needs network).
Without --font, fonts are downloaded from the Google Fonts URL in the page (needs network).
--font replaces the Google link entirely: give one per family/weight/style you use.
Standard library only.
"""
import argparse, base64, json, mimetypes, os, re, sys, urllib.request

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"  # makes Google serve woff2


def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read()


def b64(data, mime):
    return f"data:{mime};base64,{base64.b64encode(data).decode()}"


def read_src(src):
    if re.match(r"^https?://", src):
        return fetch(src)
    with open(src, "rb") as f:
        return f.read()


def inline_three(html, three_src):
    m = re.search(r'<script type="importmap">(.*?)</script>', html, re.S)
    if not m:
        print("  no import map found, skipping three.js")
        return html
    imap = json.loads(m.group(1))
    url = imap["imports"].get("three")
    if not url or url.startswith("data:"):
        print("  three.js already inline")
        return html
    src = three_src or url
    code = read_src(src)
    if b"export" not in code:
        sys.exit(f"error: {src} does not look like an ES module build of three.js (use build/three.module(.min).js)")
    imap["imports"]["three"] = b64(code, "text/javascript")
    print(f"  three.js  {len(code) / 1024:.0f} KB  from {src}")
    return html[: m.start(1)] + json.dumps(imap) + html[m.end(1):]


def google_faces(css_url, subsets):
    css = fetch(css_url).decode()
    out = []
    # Google emits:  /* latin */ @font-face { ... src: url(...) format('woff2'); unicode-range: ...; }
    for sub, block in re.findall(r"/\*\s*([\w-]+)\s*\*/\s*(@font-face\s*\{.*?\})", css, re.S):
        if subsets and sub not in subsets:
            continue
        def rep(mm):
            data = fetch(mm.group(1))
            return f"url({b64(data, 'font/woff2')})"
        out.append(f"/* {sub} */ " + re.sub(r"url\((https://[^)]+)\)", rep, block))
    return out


def local_faces(specs):
    faces = []
    for spec in specs:
        try:
            family, weight, style, path = spec.split("|")
        except ValueError:
            sys.exit(f'error: --font must be "Family|weight|style|path.woff2", got {spec!r}')
        with open(path, "rb") as f:
            data = f.read()
        faces.append(f"@font-face{{font-family:'{family}';font-style:{style};font-weight:{weight};font-display:block;"
                     f"src:url({b64(data, 'font/woff2')}) format('woff2');}}")
    return faces


def inline_fonts(html, font_specs, subsets):
    links = list(re.finditer(r'<link[^>]+href="(https://fonts\.googleapis\.com/css2?\?[^"]+)"[^>]*>', html))
    html = re.sub(r'<link rel="preconnect"[^>]*fonts\.(googleapis|gstatic)\.com[^>]*>\s*', "", html)
    if font_specs:
        faces = local_faces(font_specs)
    else:
        faces = []
        for l in links:
            faces += google_faces(l.group(1).replace("&amp;", "&"), subsets)
    for l in re.finditer(r'<link[^>]+href="https://fonts\.googleapis\.com/[^"]+"[^>]*>', html):
        html = html.replace(l.group(0), "")
    if faces:
        size = sum(len(f) for f in faces) / 1024
        print(f"  fonts     {len(faces)} face(s), {size:.0f} KB")
        html = html.replace("<style>", "<style>\n" + "\n".join(faces) + "\n", 1)
    else:
        print("  fonts     none found")
    return html


def inline_assets(html, base):
    # src="x.png" / url(x.png) pointing at local files next to the deck
    def rep(m):
        ref = m.group(2)
        if re.match(r"^(data:|https?:|#|/)", ref):
            return m.group(0)
        p = os.path.join(base, ref)
        if not os.path.isfile(p):
            return m.group(0)
        mime = mimetypes.guess_type(p)[0] or "application/octet-stream"
        with open(p, "rb") as f:
            print(f"  asset     {ref}")
            return m.group(1) + b64(f.read(), mime) + m.group(3)
    html = re.sub(r'(\bsrc=")([^"]+)(")', rep, html)
    html = re.sub(r"(url\(['\"]?)([^'\")]+)(['\"]?\))", rep, html)
    return html


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("input")
    ap.add_argument("-o", "--output")
    ap.add_argument("--three", help="local path or URL of three.module(.min).js")
    ap.add_argument("--font", action="append", default=[], help='"Family|weight|style|file.woff2" (repeatable)')
    ap.add_argument("--subsets", default="latin", help="Google font subsets to keep, comma separated ('' = all)")
    a = ap.parse_args()
    out = a.output or re.sub(r"\.html?$", "", a.input) + ".offline.html"
    with open(a.input, encoding="utf-8") as f:
        html = f.read()
    print(f"inlining {a.input}")
    html = inline_three(html, a.three)
    html = inline_fonts(html, a.font, [s for s in a.subsets.split(",") if s])
    html = inline_assets(html, os.path.dirname(os.path.abspath(a.input)))
    with open(out, "w", encoding="utf-8") as f:
        f.write(html)
    left = re.findall(r'(?:src|href)="(https?://[^"]+)"', html)
    print(f"wrote {out}  ({os.path.getsize(out) / 1024 / 1024:.2f} MB)")
    if left:
        print("note: still references the network:\n  " + "\n  ".join(left))


if __name__ == "__main__":
    main()
