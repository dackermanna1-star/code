#!/usr/bin/env python3
"""CaliberCraft Arsenal - procedural texture generator.

Regenerates every texture listed in docs/ASSET_SPEC.md section 3 into
src/main/resources/assets/calibercraft/textures/. Everything is computed from scratch with
numpy + Pillow using fixed seeds, so the output is fully deterministic.

Usage (from the repository root):
    python3 tools/assetgen/textures/generate_textures.py [--preview DIR] [--only SECTION ...]

    --preview DIR   also write a contact sheet + material tiling check into DIR (review aid,
                    never written into the mod resources)
    --only          restrict to sections: materials items blocks particles effects hud scopes gui
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import texlib  # noqa: E402

SECTIONS = ["materials", "items", "blocks", "particles", "effects", "hud", "scopes", "gui"]

# ---------------------------------------------------------------------------
# Expected output (docs/ASSET_SPEC.md section 3): rel path (no .png) -> (width, height)
# ---------------------------------------------------------------------------
LIBRARY = ["black_polymer", "od_polymer", "tan_polymer", "grey_polymer", "walnut_wood", "dark_walnut",
           "blued_steel", "parkerized", "dark_steel", "stainless", "gunmetal", "black_anodized", "brass",
           "copper", "red_plastic", "green_plastic", "rubber", "glass_lens", "glow_red", "glow_green",
           "glow_amber"]
SKINS = ["matte_black", "desert_tan", "woodland", "arctic", "digital", "industrial", "worn", "neon", "energy"]
ROLES = ["receiver", "furniture", "mag", "accent"]
ANIMATED = {"item/material/energy_receiver", "item/material/energy_accent", "item/material/neon_accent"}
AMMO = ["ammo_9mm", "ammo_9mm_hp", "ammo_44", "ammo_44_hp", "ammo_556", "ammo_556_ap", "ammo_762",
        "ammo_762_ap", "ammo_308", "ammo_308_ap", "ammo_338", "ammo_338_ap", "shell_buckshot", "shell_slug",
        "shell_incendiary"]


def expected():
    e = {}
    for m in LIBRARY + [f"{s}_{r}" for s in SKINS for r in ROLES]:
        e[f"item/material/{m}"] = (32, 32)
    for a in AMMO:
        e[f"item/ammo/{a}"] = (16, 16)
    for m in ("gun_parts", "precision_parts", "prismatic_finish_kit"):
        e[f"item/{m}"] = (16, 16)
    for f in ("top", "side", "front", "bottom"):
        e[f"block/gunsmith_bench_{f}"] = (16, 16)
    for i in range(4):
        e[f"particle/smoke_{i}"] = (16, 16)
    for i in range(2):
        e[f"particle/spark_{i}"] = (8, 8)
    for i in range(3):
        e[f"particle/bullet_hole_{i}"] = (16, 16)
        e[f"effect/muzzle_front_{i}"] = (64, 64)
        e[f"effect/muzzle_side_{i}"] = (64, 32)
    e["particle/casing_brass"] = (8, 8)
    e["particle/casing_shell"] = (8, 8)
    e["particle/impact_flash"] = (16, 16)
    e["effect/tracer"] = (16, 64)
    hud = {"bullet_pistol": (3, 7), "bullet_rifle": (3, 9), "bullet_shell": (4, 7),
           "hitmarker": (15, 15), "hitmarker_head": (15, 15), "hitmarker_kill": (15, 15),
           "reticle_red_dot": (15, 15), "reticle_holo": (31, 31), "reticle_acog": (31, 31),
           "heat_bar_background": (64, 4), "heat_bar_fill": (64, 4)}
    for m in ("semi", "burst", "auto", "bolt", "pump"):
        hud[f"mode_{m}"] = (16, 8)
    for k, v in hud.items():
        e[f"gui/sprites/hud/{k}"] = v
    e["misc/scope_sniper"] = (512, 512)
    e["misc/scope_acog"] = (512, 512)
    gs = {"panel": (32, 32), "slot": (22, 22), "slot_hover": (22, 22), "slot_selected": (22, 22),
          "stat_up": (7, 7), "stat_down": (7, 7), "lock": (9, 9)}
    for i in ("optic", "muzzle", "barrel", "grip", "stock", "magazine", "tactical", "charm", "skin"):
        gs[f"icon_{i}"] = (16, 16)
    for k, v in gs.items():
        e[f"gui/sprites/gunsmith/{k}"] = v
    return e


def validate() -> list[str]:
    """Check every spec'd texture exists on disk with the exact size, RGBA mode and mcmeta."""
    from PIL import Image
    problems = []
    for rel, (w, h) in expected().items():
        path = texlib.TEX_ROOT / f"{rel}.png"
        if not path.exists():
            problems.append(f"missing: {rel}.png")
            continue
        img = Image.open(path)
        if img.mode not in ("RGBA", "RGB"):
            problems.append(f"{rel}: mode {img.mode}")
        if rel in ANIMATED:
            ok = img.width == w and img.height % h == 0 and img.height // h >= 2
            if not (texlib.TEX_ROOT / f"{rel}.png.mcmeta").exists():
                problems.append(f"{rel}: missing .png.mcmeta")
        else:
            ok = img.size == (w, h)
        if not ok:
            problems.append(f"{rel}: size {img.size}, expected {(w, h)}{' (x frames)' if rel in ANIMATED else ''}")
    if not (texlib.TEX_ROOT / "gui/sprites/gunsmith/panel.png.mcmeta").exists():
        problems.append("gui/sprites/gunsmith/panel: missing nine-slice .png.mcmeta")
    return problems


def run_section(name: str):
    mod = __import__(name)
    return mod.generate()


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--preview", type=Path, default=None)
    ap.add_argument("--only", nargs="*", choices=SECTIONS, default=None)
    args = ap.parse_args(argv)

    sections = args.only or SECTIONS
    total = 0
    for s in sections:
        written = run_section(s)
        total += len(written)
        print(f"[{s}] {len(written)} textures")
    print(f"wrote {total} textures under {texlib.TEX_ROOT.relative_to(texlib.REPO_ROOT)}")

    problems = validate()
    if problems:
        print("VALIDATION FAILED:")
        for p in problems:
            print("  " + p)
        sys.exit(1)
    print(f"validated {len(expected())} spec'd textures (ASSET_SPEC section 3): OK")

    if args.preview:
        import contact_sheet
        args.preview.mkdir(parents=True, exist_ok=True)
        print(contact_sheet.build_contact_sheet(args.preview / "textures_contact_sheet.png"))
        print(contact_sheet.build_tiling_sheet(args.preview / "materials_tiling.png"))


if __name__ == "__main__":
    main()
