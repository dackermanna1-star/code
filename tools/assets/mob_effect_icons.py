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

# Bleeding: a heavy blood drop with smaller drops falling beside it.
icon("bleeding", legend(o="#3b0402", d="#6c100c", m="#a10e0a", b="#d81c1c", l="#ff5544", h="#ffb0a3"), """
..................
..................
.....oo...........
....olmo.....oo...
....olbo....olmo..
...olbbmo...obdo..
...olbbmo....oo...
..olbbbbmo........
..olbbbbmo........
.olbbbbbbmo...o...
.olhbbbbbmo..olo..
.olhbbbbbmo.olbmo.
.olbbbbbbmo.olbmo.
.obbbbbbmdo.obmdo.
..obbbbmdo...ooo..
...ommddo.........
....oooo..........
..................
""")

# Mending: a mint heart closed by a row of pale stitches.
icon("mending", legend(o="#0e3b2c", d="#1d6a4b", m="#34a374", b="#5fd09c", l="#9eeec8", h="#e3fff2", w="#f6f1e2"), """
..................
..................
....ooo....ooo....
...ohlbo..olbbo...
..ohhlbboolbbbmo..
.ohhlbbbobbbbbbmo.
.ohlbbbwwwwbbbbmo.
.olbbbbbbobbbbbmo.
.olbbbbbobbbbbbmo.
..olbbbwwwwbbbmo..
..obbbbbbobbbbmo..
...obbbbobbbbmo...
....obbwwwwbmo....
.....obbbomdo.....
......obomdo......
.......omdo.......
........oo........
..................
""")

# Warding: a silver buckler around a glowing Algiz, the rune of protection.
icon("warding", legend(o="#1f2632", d="#4f5b6e", m="#7f8da2", b="#a9b7c9", l="#d3dfeb", h="#f4f8fc",
                       f="#3a4659", F="#2a3343", G="#e9fbff", g="#8fdcff"), """
..................
......oooooo......
....oohhhllloo....
...ohhhhhlllbbo...
..ohhhFFFFFFbbbo..
..ohhFffGgfffbbo..
.ohhFGffGgffGfbmo.
.ohlFfGfGgfGffmmo.
.ollFffGGgGfffmmo.
.olbffffGgffffmdo.
.olbffffGgffffddo.
.obbffffGgffffddo.
..obbfffGgfffddo..
..obbmffffffdddo..
...obmmmmdddddo...
....oommddddoo....
......oooooo......
..................
""")

# Bloodrage: a crimson-bladed axe, still dripping.
icon("bloodrage", legend(o="#2a0508", E="#ff6b6b", R="#c8102e", r="#7d0a1c", s="#3b3f47", S="#5c626d",
                         W="#5e4029", w="#3f2a1b", B="#d81c1c"), """
..................
...oo.......oo....
..oEEoo....oWWo...
..oEERRoooosSSso..
.oEERRRRRRrsSSso..
.oERRRRRRrrsSSso..
.oERRRRRrrrsSSso..
.oEERRRrrrrsSSso..
..oERRroooosSSso..
..oEroo....oWWo...
..oBBo.....owwo...
...oBo.....oWWo...
..oBBo.....owwo...
..oBBo.....oWWo...
...oo......owwo...
...........oWWo...
............oo....
..................
""")

# Soulward: a soul flame cupped in a pale warding arc.
icon("soulward", legend(o="#0b2533", d="#1b4f6b", m="#2f8fb8", b="#56d8ff", l="#b8f4ff", h="#f2fdff",
                        a="#5b7a8b", A="#a9c6d3"), """
..................
.........o........
........obo.......
.......obbo.......
.......obbmo......
......obllmo......
......oblhbmo.....
.oo..oblhhlmo..oo.
oAAo.oblhhlbmooAAo
oaAoobblhhhlmooAao
oaAAoblhhhhlmoAAao
.oaAomblhhlbmoAao.
.oaAAombllbmoAAao.
..oaaAAommmoAAaao.
...oaaaAAAAAAaao..
....ooaaaaaaooo...
......oooooo......
..................
""")

# Deathward Spent: a cracked headstone whose rune has gone dim (the cooldown indicator).
icon("deathward_spent", legend(o="#11181d", d="#26343e", m="#3e5a6b", b="#577585", l="#7896a5", h="#a3bcc8",
                               k="#11181d", r="#3f7f91", g="#2e3b2a", G="#1e281c"), """
..................
......oooooo......
.....ohhllllo.....
....ohhllllbbo....
...ohlllkolbbmo...
...ohllokkobbmo...
...ohlbbbkobbmo...
..ohllbrbbkbbmdo..
..ohlbrrrbkkbmdo..
..ohlbbrbbbkbmdo..
..ohlbbrbbbbbmdo..
..olbbbbbbbbbmdo..
..olbbbbbbbbmmdoo.
.ogggggggggggggggo
.oGGGGGGGGGGGGGGGo
..ooooooooooooooo.
..................
..................
""")

# Curse of Frailty (less max health): a violet heart cracked in two.
icon("curse_frailty", legend(CURSE, d="#3d1856", v="#7f3fa8", l="#b07ad8", h="#e2c4ff"), """
..................
..................
....ooo....ooo....
...ovvvo..ovvvo...
..ovlvvvoovvvvvo..
.ovlhvvvvovvvvvdo.
ovlhvvvvvovvvvvvdo
ovlvvvvvvoovvvvvdo
ovvvvvvvvvoovvvddo
.ovvvvvvvoovvvddo.
.ovvvvvvvvoovddo..
..ovvvvvvvo.ooo...
...ovvvvvo..o*o...
....ovvvvvoo*+*o..
.....ovvvvo.o*o...
......ovvvo..o....
.......ovo........
........o.........
""")

# Curse of Fragility (more damage taken): a bone snapping along a cursed crack.
icon("curse_fragility", legend(CURSE, d="#8a6f7d", b="#cbbda8", l="#efe6d3", p="#7a2a5b", P="#e08ac0"), """
...o..............
..o*o.......oo....
.o*+*o.....ollo...
..o*o.....olbblo..
...o.....olbbbbdo.
..........olbbbbdo
.........olbbbbdo.
........olbbbdoo..
.......opPbdoo....
......opPpoo......
.....olbPpo.......
..ooolbbdo........
.ollbbbdo.........
olbbbbdo..........
.olbbbbdo.........
..odbbdo..........
...oddo...........
....oo............
""")

# Curse of Lethargy (slower movement and attacks): an hourglass of curse-violet sand.
icon("curse_lethargy", legend(CURSE, F="#5a4aa8", f="#2c2358", P="#3a2a7a", g="#9d97d8", G="#d6d2ff",
                              s="#b76bff"), """
..................
..oooooooooooooo..
.oFFFFFFFFFFFFFFo.
.offffffffffffffo.
..oPogGGGGGGgoPo..
..oPogssssssgoPo..
..oPoogssssgooPo..
..oPo.ogssgo.oPo..
..oPo..oggo..oPo..
..oPo..osgo..oPo..
..oPo.ogsGgo.oPo..
..oPoogGsGGgooPo..
..oPogGssssGgoPo..
..oPogssssssgoPo..
.oFFFFFFFFFFFFFFo.
.offffffffffffffo.
..oooooooooooooo..
..................
""")

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
            big = Image.fromarray(img, "RGBA").resize((SIZE * scale, SIZE * scale), Image.NEAREST)
            sheet.alpha_composite(big, (x, y))
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
