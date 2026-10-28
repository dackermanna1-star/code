#!/usr/bin/env python3
"""Print title, author, license(s) and file links of a saved OpenGameArt page (selection aid).
Usage: python3 -I scripts/assets/oga_info.py page.html [...]"""
import html
import re
import sys

for path in sys.argv[1:]:
    s = open(path, encoding="utf-8", errors="replace").read()
    title = re.search(r"<title>(.*?)</title>", s, re.S)
    lic_block = re.search(r'field-name-field-art-licenses.*?</div>\s*</div>\s*</div>', s, re.S)
    lics = re.findall(r"<div class=['\"]license-name['\"]>(.*?)</div>", s) or (
        re.findall(r'title="([^"]*(?:CC0|CC-BY|GPL|OGA-BY|CC-BY-SA)[^"]*)"', lic_block.group(0)) if lic_block else [])
    author = re.search(r'field-name-author-submitter.*?<a href="/users/[^"]*">(.*?)</a>', s, re.S)
    files = re.findall(r'href="(https://opengameart\.org/sites/default/files/[^"]+)"', s)
    print("==", path)
    print("title  :", html.unescape(title.group(1).strip()) if title else "?")
    print("author :", html.unescape(author.group(1)) if author else "?")
    print("license:", [html.unescape(x) for x in lics])
    for f in dict.fromkeys(files):
        if not re.search(r"\.(png|jpe?g|gif|css)$", f, re.I):
            print("file   :", f)
