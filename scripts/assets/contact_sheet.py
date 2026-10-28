#!/usr/bin/env python3
"""Build a labelled contact sheet of ambientCG candidate materials (selection aid).

Usage:
  python3 -I scripts/assets/contact_sheet.py <index.json> <out.png> ID [ID ...]
         [--flat]     use the flat 2048px colour preview (shown 2x2 tiled) instead of the sphere
         [--cell=N]   cell size in px (default 200)  [--cols=N] max columns (default 6)

<index.json> is produced by fetch_textures.py --catalog (a compact list of
{id, thumb, prev, ...}). Images are cached next to the index in ./thumbs/.
"""
import json
import os
import sys
import urllib.request

from PIL import Image, ImageDraw, ImageFont


def fetch(url, path):
    if not os.path.exists(path):
        req = urllib.request.Request(url, headers={"User-Agent": "asset-fetch/1.0"})
        with urllib.request.urlopen(req, timeout=60) as r, open(path + ".part", "wb") as f:
            f.write(r.read())
        os.replace(path + ".part", path)
    return path


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    flat = "--flat" in sys.argv
    cell = 200
    cols_max = 6
    for a in sys.argv[1:]:
        if a.startswith("--cell="):
            cell = int(a.split("=", 1)[1])
        if a.startswith("--cols="):
            cols_max = int(a.split("=", 1)[1])
    index_path, out_path, ids = args[0], args[1], args[2:]
    rows = {r["id"]: r for r in json.load(open(index_path))}
    cache = os.path.join(os.path.dirname(os.path.abspath(index_path)), "thumbs")
    os.makedirs(cache, exist_ok=True)
    cols = min(cols_max, len(ids))
    nrows = (len(ids) + cols - 1) // cols
    sheet = Image.new("RGB", (cols * cell, nrows * (cell + 18)), (40, 40, 40))
    draw = ImageDraw.Draw(sheet)
    try:
        font = ImageFont.load_default(size=14)
    except TypeError:
        font = ImageFont.load_default()
    for i, aid in enumerate(ids):
        r = rows.get(aid)
        x, y = (i % cols) * cell, (i // cols) * (cell + 18)
        if r is None:
            draw.text((x + 4, y + 4), aid + " ?", fill=(255, 80, 80), font=font)
            continue
        use_flat = flat
        try:
            if use_flat:
                p = fetch(r["prev"], os.path.join(cache, aid + "_flat.jpg"))
            else:
                p = fetch(r["thumb"], os.path.join(cache, aid + "_sph.jpg"))
        except Exception:  # flat preview missing -> fall back to sphere thumbnail
            use_flat = False
            try:
                p = fetch(r["thumb"], os.path.join(cache, aid + "_sph.jpg"))
            except Exception as e:
                draw.text((x + 4, y + 4), aid + " ERR " + str(e)[:20], fill=(255, 80, 80), font=font)
                continue
        im = Image.open(p).convert("RGB")
        if use_flat:
            # show a 2x2 tiling so seams/repetition are visible
            im = im.resize((cell // 2, cell // 2), Image.LANCZOS)
            t = Image.new("RGB", (cell, cell))
            for tx in (0, cell // 2):
                for ty in (0, cell // 2):
                    t.paste(im, (tx, ty))
            im = t
        else:
            im = im.resize((cell, cell), Image.LANCZOS)
        sheet.paste(im, (x, y + 18))
        draw.text((x + 4, y + 1), aid, fill=(255, 255, 255), font=font)
    sheet.save(out_path)
    print(out_path, sheet.size)


if __name__ == "__main__":
    main()
