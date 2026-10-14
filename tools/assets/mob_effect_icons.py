#!/usr/bin/env python3
"""Abyssal Descent status effect icon generator.

Every mob effect registered in ModEffects gets an 18x18 icon in the style of the
vanilla ones: a dark, hue-tinted outline, light from the top left and a mostly
transparent one pixel margin.  Each icon is a hand-authored ASCII pixel map: one
character per pixel, ``.`` is transparent, every other character is looked up in
the icon's legend.

1.21.11 draws effect icons from the GUI atlas as ``<namespace>:mob_effect/<path>``
(Gui.getMobEffectSprite), and the vanilla atlas definition (atlases/gui.json)
loads those from ``textures/mob_effect/`` in every namespace, so no atlas JSON is
needed.

Running the script (re)writes textures/mob_effect/<name>.png for every icon.

Usage:
  python3 tools/assets/mob_effect_icons.py                 # write everything
  python3 tools/assets/mob_effect_icons.py --check         # lint only, write nothing
  python3 tools/assets/mob_effect_icons.py --sheet out.png # also write a contact sheet
"""
from __future__ import annotations

import argparse
import re
import sys
from dataclasses import dataclass
from pathlib import Path

import numpy as np
from PIL import Image

MOD_ID = "abyssal_descent"
REPO = Path(__file__).resolve().parents[2]
TEX_DIR = REPO / "src" / "main" / "resources" / "assets" / MOD_ID / "textures" / "mob_effect"
MOD_EFFECTS = REPO / "src" / "main" / "java" / "net" / "abyssaldescent" / "registry" / "ModEffects.java"
SIZE = 18


def _rgba(hex_code: str) -> tuple[int, int, int, int]:
    h = hex_code.lstrip("#")
    return int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), 255


def legend(*shared: dict[str, str], **chars: str) -> dict[str, tuple[int, int, int, int]]:
    """Maps legend chars to colours; ``shared`` dicts (e.g. CURSE) are merged in first."""
    out: dict[str, tuple[int, int, int, int]] = {}
    for group in (*shared, chars):
        for ch, tone in group.items():
            if ch in out or ch == ".":
                raise ValueError(f"legend char {ch!r} assigned twice or reserved")
            out[ch] = _rgba(tone)
    return out


@dataclass
class Icon:
    name: str
    legend: dict
    grid: str


ICONS: list[Icon] = []


def icon(name: str, lg: dict, grid: str) -> None:
    ICONS.append(Icon(name, lg, grid))


# Shared by the three Cursed Idol curses: a deep violet outline and the curse glint.
CURSE = {"o": "#1d0c2b", "*": "#c58cff", "+": "#f1e0ff"}

# @ICONS@

# ==========================================================================
# Build machinery
# ==========================================================================
def parse_grid(ic: Icon) -> list[str]:
    rows = [r.strip() for r in ic.grid.strip("\n").split("\n")]
    if len(rows) != SIZE:
        raise ValueError(f"{ic.name}: {len(rows)} rows, expected {SIZE}")
    for i, r in enumerate(rows):
        if len(r) != SIZE:
            raise ValueError(f"{ic.name}: row {i} has {len(r)} chars: {r!r}")
    return rows


def render(ic: Icon) -> np.ndarray:
    img = np.zeros((SIZE, SIZE, 4), dtype=np.uint8)
    for y, row in enumerate(parse_grid(ic)):
        for x, ch in enumerate(row):
            if ch == ".":
                continue
            if ch not in ic.legend:
                raise ValueError(f"{ic.name}: ({x},{y}) unknown char {ch!r}")
            img[y, x] = ic.legend[ch]
    return img


def lint(img: np.ndarray) -> list[str]:
    """Style checks: no pure black, no isolated single pixels."""
    issues = []
    opaque = img[..., 3] > 0
    if np.any(opaque & (img[..., :3].sum(axis=-1) == 0)):
        issues.append("uses pure black")
    pad = np.pad(opaque, 1)
    neigh = sum(np.roll(np.roll(pad, dy, 0), dx, 1) for dy in (-1, 0, 1) for dx in (-1, 0, 1)
                if (dy, dx) != (0, 0))[1:-1, 1:-1]
    for y, x in np.argwhere(opaque & (neigh == 0)):
        issues.append(f"isolated pixel at ({x},{y})")
    return issues


def registered_effects() -> list[str]:
    """Effect ids registered in ModEffects.java, so a new effect without an icon fails the build step."""
    return re.findall(r'register\("([a-z0-9_]+)"', MOD_EFFECTS.read_text())


def contact_sheet(images: list[tuple[str, np.ndarray]], out: Path, scale: int = 8) -> None:
    from PIL import ImageDraw, ImageFont
    cw, ch = SIZE * scale + 24, SIZE * scale + 30
    backgrounds = [(198, 198, 198, 255), (40, 40, 44, 255)]  # inventory panel grey, dark HUD
    sheet = Image.new("RGBA", (len(images) * cw, len(backgrounds) * ch), (112, 112, 112, 255))
    draw = ImageDraw.Draw(sheet)
    try:
        font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 11)
    except OSError:
        font = ImageFont.load_default()
    for r, bg in enumerate(backgrounds):
        for i, (name, img) in enumerate(images):
            x, y = i * cw + 12, r * ch + 6
            draw.rectangle((x - 4, y - 4, x + SIZE * scale + 3, y + SIZE * scale + 3), fill=bg)
            sheet.alpha_composite(Image.fromarray(img, "RGBA").resize((SIZE * scale, SIZE * scale), Image.NEAREST), (x, y))
            if r == len(backgrounds) - 1:
                draw.text((x, y + SIZE * scale + 6), name[:22], fill=(255, 255, 255, 255), font=font)
    out.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(out)


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--check", action="store_true", help="lint only, write nothing")
    ap.add_argument("--sheet", type=Path, help="also write a contact sheet PNG here")
    args = ap.parse_args(argv)

    names = [ic.name for ic in ICONS]
    problems = 0
    dupes = sorted({n for n in names if names.count(n) > 1})
    if dupes:
        print(f"duplicate icons: {dupes}", file=sys.stderr)
        problems += 1
    effects = registered_effects()
    missing = [e for e in effects if e not in names]
    extra = [n for n in names if n not in effects]
    if missing:
        print(f"effects without an icon: {missing}", file=sys.stderr)
        problems += 1
    if extra:
        print(f"icons for unregistered effects: {extra}", file=sys.stderr)
        problems += 1

    rendered = []
    for ic in ICONS:
        img = render(ic)
        for issue in lint(img):
            print(f"[lint] {ic.name}: {issue}")
            problems += "pure black" in issue
        rendered.append((ic.name, img))
        if not args.check:
            TEX_DIR.mkdir(parents=True, exist_ok=True)
            Image.fromarray(img, "RGBA").save(TEX_DIR / f"{ic.name}.png")

    if args.sheet:
        contact_sheet(rendered, args.sheet)
    print(f"{len(rendered)} icons {'checked' if args.check else 'written'}")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
