"""Preview helpers: contact sheet of every generated texture + 3x3 tiling check of materials.

Usage (from repo root):
    python3 tools/assetgen/textures/contact_sheet.py OUT_DIR
Writes OUT_DIR/textures_contact_sheet.png and OUT_DIR/materials_tiling.png.
These previews are review aids only and are never written into the mod resources.
"""
from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, str(Path(__file__).resolve().parent))
from texlib import TEX_ROOT  # noqa: E402

SECTIONS = [
    ("3.1 materials", "item/material", 4),
    ("3.2 items", "item", 6),
    ("3.3 block", "block", 8),
    ("3.4 particles", "particle", 8),
    ("3.5 effects", "effect", 3),
    ("3.6 hud", "gui/sprites/hud", 6),
    ("3.7 scopes", "misc", 0.5),
    ("3.8 gunsmith gui", "gui/sprites/gunsmith", 6),
]


def checker(w, h, c1=(60, 60, 64), c2=(84, 84, 90), sz=8):
    y, x = np.mgrid[0:h, 0:w]
    m = ((x // sz + y // sz) % 2).astype(bool)
    a = np.zeros((h, w, 4), np.uint8)
    a[~m] = c1 + (255,)
    a[m] = c2 + (255,)
    return Image.fromarray(a, "RGBA")


def load_font(size=11):
    try:
        return ImageFont.load_default(size=size)
    except TypeError:
        return ImageFont.load_default()


def files_for(sub, exclude_sub=None):
    root = TEX_ROOT / sub
    out = []
    for p in sorted(root.rglob("*.png")):
        rel = p.relative_to(TEX_ROOT).as_posix()
        if exclude_sub and any(rel.startswith(e) for e in exclude_sub):
            continue
        out.append(p)
    return out


def thumb(p: Path, scale):
    img = Image.open(p).convert("RGBA")
    w, h = img.size
    frames = 1
    if (p.parent.name == "material") and h > w:
        frames = h // w
    if frames > 1:
        # lay the animation frames out horizontally (max 8 shown)
        n = min(frames, 8)
        strip = Image.new("RGBA", (w * n + (n - 1) * 2, w), (0, 0, 0, 0))
        for i in range(n):
            fi = i * frames // n
            strip.paste(img.crop((0, fi * w, w, (fi + 1) * w)), (i * (w + 2), 0))
        img = strip
        w, h = img.size
    if scale >= 1:
        img = img.resize((int(w * scale), int(h * scale)), Image.NEAREST)
    else:
        img = img.resize((int(w * scale), int(h * scale)), Image.LANCZOS)
    return img, frames


def build_contact_sheet(out_path: Path, width=1800):
    font = load_font(11)
    hfont = load_font(16)
    blocks = []
    for title, sub, scale in SECTIONS:
        excl = ["item/material"] if sub == "item" else None
        items = []
        for p in files_for(sub, excl):
            t, frames = thumb(p, scale)
            rel = p.relative_to(TEX_ROOT / sub).as_posix()[:-4]
            label = rel + (f" [{frames}f]" if frames > 1 else "")
            items.append((t, label))
        blocks.append((title, items))
    # layout
    pad = 8
    rows_layout = []
    y = pad
    for title, items in blocks:
        rows_layout.append(("title", title, y))
        y += 24
        x = pad
        row_h = 0
        for t, label in items:
            cw = max(t.width, 90)
            ch = t.height + 16
            if x + cw > width - pad:
                x = pad
                y += row_h + pad
                row_h = 0
            rows_layout.append(("item", (t, label), (x, y)))
            x += cw + pad
            row_h = max(row_h, ch)
        y += row_h + pad * 2
    sheet = Image.new("RGBA", (width, y + pad), (32, 33, 36, 255))
    d = ImageDraw.Draw(sheet)
    for kind, payload, pos in rows_layout:
        if kind == "title":
            d.text((pad, pos), payload, fill=(255, 210, 120, 255), font=hfont)
        else:
            t, label = payload
            x, yy = pos
            bg = checker(t.width, t.height)
            sheet.paste(bg, (x, yy))
            sheet.alpha_composite(t, (x, yy))
            d.text((x, yy + t.height + 2), label, fill=(220, 220, 220, 255), font=font)
    sheet.save(out_path)
    return out_path


def build_tiling_sheet(out_path: Path, scale=2, per_row=8):
    font = load_font(11)
    mats = files_for("item/material")
    cell = 32 * 3 * scale
    pad = 6
    cols = per_row
    rows = (len(mats) + cols - 1) // cols
    sheet = Image.new("RGBA", (cols * (cell + pad) + pad, rows * (cell + 18 + pad) + pad), (30, 30, 30, 255))
    d = ImageDraw.Draw(sheet)
    for i, p in enumerate(mats):
        img = Image.open(p).convert("RGBA").crop((0, 0, 32, 32))
        tile = Image.new("RGBA", (96, 96))
        for ty in range(3):
            for tx in range(3):
                tile.paste(img, (tx * 32, ty * 32))
        tile = tile.resize((cell, cell), Image.NEAREST)
        x = pad + (i % cols) * (cell + pad)
        y = pad + (i // cols) * (cell + 18 + pad)
        sheet.paste(tile, (x, y))
        d.text((x, y + cell + 2), p.stem, fill=(230, 230, 230, 255), font=font)
    sheet.save(out_path)
    return out_path


if __name__ == "__main__":
    out_dir = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(".")
    out_dir.mkdir(parents=True, exist_ok=True)
    print(build_contact_sheet(out_dir / "textures_contact_sheet.png"))
    print(build_tiling_sheet(out_dir / "materials_tiling.png"))
