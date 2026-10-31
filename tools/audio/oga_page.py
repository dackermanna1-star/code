#!/usr/bin/env python3
"""Fetch and parse OpenGameArt content pages (title, author, license, files).

Used by build_audio.py; can also be run on its own to inspect packs:

    python3 -I tools/audio/oga_page.py <pages_dir> <slug> [<slug> ...]

The page HTML is treated as untrusted data: it is only parsed with regular
expressions, never executed.  The page's own license is the FIRST license name
that appears after the "License(s)" label (later ones belong to related
content in the sidebar).
"""
import html
import json
import os
import re
import subprocess
import sys

OGA = "https://opengameart.org"


def curl(url, dest, timeout=300):
    """Download url to dest with curl (curl honours the session proxy/CA)."""
    tmp = dest + ".part"
    cmd = ["curl", "-sS", "-L", "--fail", "--retry", "3", "--max-time", str(timeout),
           "-o", tmp, url]
    subprocess.run(cmd, check=True)
    os.replace(tmp, dest)
    return dest


def fetch_page(slug, pages_dir, refresh=False):
    os.makedirs(pages_dir, exist_ok=True)
    dest = os.path.join(pages_dir, slug + ".html")
    if refresh or not os.path.exists(dest) or os.path.getsize(dest) < 1000:
        curl(f"{OGA}/content/{slug}", dest, timeout=120)
    with open(dest, "r", encoding="utf-8", errors="replace") as f:
        return f.read()


def _strip_tags(s):
    return html.unescape(re.sub(r"<[^>]+>", "", s)).strip()


def parse_page(text):
    info = {}
    m = re.search(r"<title>(.*?)</title>", text, re.S)
    info["title"] = _strip_tags(m.group(1)).replace(" | OpenGameArt.org", "").strip() if m else None

    # Author: first username span after the "Author:" label.
    m = re.search(r"field-name-author-submitter.*?<div class=\"field-label\">Author:&nbsp;</div>(.*?)</div></div></div>",
                  text, re.S)
    author = None
    if m:
        blk = m.group(1)
        mu = re.search(r"<span class='username'>(.*?)</span>", blk, re.S)
        if mu:
            author = _strip_tags(mu.group(1))
        ms = re.search(r"\(Submitted by <strong>(.*?)</strong>\)", blk, re.S)
        if ms:
            info["submitted_by"] = _strip_tags(ms.group(1))
    info["author"] = author

    # License: first license-name after the License(s) label.
    i = text.find("License(s):")
    info["license"] = None
    if i >= 0:
        ml = re.search(r"<div class='license-name'>(.*?)</div>", text[i:], re.S)
        if ml:
            info["license"] = _strip_tags(ml.group(1))
        # all licenses inside this field only (multi-licensed pages)
        mf = re.search(r"License\(s\):&nbsp;</div><div class=\"field-items\">(.*?)</div></div></div>(?:</div>)?<div class=\"field",
                       text[i - 40:], re.S)
        if mf:
            info["licenses_field"] = [_strip_tags(x) for x in re.findall(r"<div class='license-name'>(.*?)</div>", mf.group(1), re.S)]

    # Files: anchors inside the field-name-field-art-files block.
    files = []
    mf = re.search(r"field-name-field-art-files(.*?)</div></div></div>", text, re.S)
    if mf:
        for a in re.finditer(r"<a href=\"([^\"]+)\"[^>]*type=\"([^\";]+)(?:; length=(\d+))?\"[^>]*>(.*?)</a>", mf.group(1), re.S):
            href, mime, length, name = a.groups()
            if "/styles/" in href or "audio_preview" in href:
                continue
            files.append({"url": html.unescape(href), "mime": mime,
                          "bytes": int(length) if length else None, "name": _strip_tags(name)})
    info["files"] = files

    # Description body (for selection hints).
    md = re.search(r"field-name-body.*?<div class=\"field-item even\"[^>]*>(.*?)</div></div></div>", text, re.S)
    info["description"] = _strip_tags(md.group(1))[:2000] if md else ""
    return info


def main(argv):
    pages_dir = argv[1]
    out = {}
    for slug in argv[2:]:
        try:
            info = parse_page(fetch_page(slug, pages_dir))
        except subprocess.CalledProcessError as e:
            info = {"error": str(e)}
        out[slug] = info
    json.dump(out, sys.stdout, indent=1)
    print()


if __name__ == "__main__":
    main(sys.argv)
