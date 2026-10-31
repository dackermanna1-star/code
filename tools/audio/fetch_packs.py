#!/usr/bin/env python3
"""Download + safely extract the OpenGameArt packs used by build_audio.py.

    python3 -I tools/audio/fetch_packs.py <src_dir> [slug ...]   (default: every pack in packs.PACKS)

Every pack goes into its own directory <src_dir>/<slug>/ :
    <src_dir>/<slug>/page.html      the OGA page (license re-verified from it)
    <src_dir>/<slug>/dl/<file>      downloaded file(s)
    <src_dir>/<slug>/x/...          extracted archive contents
Downloaded data is untrusted: archives are extracted with path checks, nothing
from them is ever executed.  Packs whose page license (first license name after
"License(s)") is not CC0 are refused.
"""
import json
import os
import shutil
import subprocess
import sys
import zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)  # only our own trusted tools dir
import oga_page  # noqa: E402
from packs import CANDIDATES, PACKS  # noqa: E402

ALL_PACKS = {**CANDIDATES, **PACKS}
MAX_MEMBER = 300 * 1024 * 1024


def _safe_target(root, name):
    name = name.replace("\\", "/")
    if name.startswith("/") or ":" in name.split("/")[0]:
        raise ValueError(f"absolute path in archive: {name!r}")
    target = os.path.realpath(os.path.join(root, name))
    if not (target == os.path.realpath(root) or target.startswith(os.path.realpath(root) + os.sep)):
        raise ValueError(f"path escapes extraction dir: {name!r}")
    return target


def extract(archive, dest):
    os.makedirs(dest, exist_ok=True)
    low = archive.lower()
    if low.endswith(".zip"):
        with zipfile.ZipFile(archive) as z:
            for info in z.infolist():
                _safe_target(dest, info.filename)
                if info.file_size > MAX_MEMBER:
                    raise ValueError(f"suspiciously large member {info.filename}")
            for info in z.infolist():
                if info.is_dir():
                    continue
                target = _safe_target(dest, info.filename)
                os.makedirs(os.path.dirname(target), exist_ok=True)
                with z.open(info) as src, open(target, "wb") as out:
                    shutil.copyfileobj(src, out)
    elif low.endswith(".7z"):
        import py7zr
        with py7zr.SevenZipFile(archive, "r") as z:
            for f in z.files:
                _safe_target(dest, f.filename)
                if f.is_symlink or f.is_junction or f.is_socket:
                    raise ValueError(f"refusing link/special member {f.filename!r}")
                if (f.uncompressed or 0) > MAX_MEMBER:
                    raise ValueError(f"suspiciously large member {f.filename}")
            z.extractall(path=dest)
    else:
        raise ValueError(f"unsupported archive: {archive}")


def fetch_pack(slug, src_dir, refresh=False):
    """Fetch page (license check) + files of one pack; refresh=True re-downloads the page."""
    spec = ALL_PACKS[slug]
    pdir = os.path.join(src_dir, slug)
    os.makedirs(pdir, exist_ok=True)
    page_path = os.path.join(pdir, "page.html")
    if refresh or not os.path.exists(page_path):
        oga_page.curl(f"{oga_page.OGA}/content/{slug}", page_path, timeout=120)
    with open(page_path, encoding="utf-8", errors="replace") as f:
        info = oga_page.parse_page(f.read())
    if info.get("license") != "CC0":
        raise RuntimeError(f"{slug}: page license is {info.get('license')!r}, not CC0 -- refusing")
    want = spec["download"]
    avail = {f["name"]: f for f in info["files"]}
    dl = os.path.join(pdir, "dl")
    os.makedirs(dl, exist_ok=True)
    for name in want:
        if name not in avail:
            raise RuntimeError(f"{slug}: file {name!r} not on page (have {list(avail)})")
        dest = os.path.join(dl, name)
        if not os.path.exists(dest) or (avail[name]["bytes"] and os.path.getsize(dest) != avail[name]["bytes"]):
            print(f"[fetch] {slug}: {name} ({avail[name]['bytes']} bytes)", flush=True)
            oga_page.curl(avail[name]["url"], dest, timeout=1800)
        x = os.path.join(pdir, "x")
        marker = os.path.join(x, "." + name + ".done")
        if name.lower().endswith((".zip", ".7z")):
            if not os.path.exists(marker):
                print(f"[extract] {slug}: {name}", flush=True)
                extract(dest, x)
                open(marker, "w").close()
        else:
            os.makedirs(x, exist_ok=True)
            if not os.path.exists(os.path.join(x, name)):
                shutil.copyfile(dest, os.path.join(x, name))
    meta = {"slug": slug, "url": f"{oga_page.OGA}/content/{slug}", "title": info["title"],
            "author": info["author"], "submitted_by": info.get("submitted_by"),
            "license": info["license"], "files": [avail[n] for n in want]}
    with open(os.path.join(pdir, "meta.json"), "w") as f:
        json.dump(meta, f, indent=1)
    return meta


def main(argv):
    src_dir = argv[1]
    slugs = argv[2:] or list(PACKS)  # pass slugs explicitly to fetch CANDIDATES too
    failed = []
    for slug in slugs:
        try:
            m = fetch_pack(slug, src_dir)
            print(f"[ok] {slug}: {m['title']} by {m['author']} ({m['license']})", flush=True)
        except Exception as e:  # keep going, report at end
            print(f"[FAIL] {slug}: {e}", flush=True)
            failed.append(slug)
    if failed:
        print("failed:", failed)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
