"""Regenerate every texture and sound, then build previews and run verification.

usage:  python3 tools/assetgen/generate_all.py [--skip-voice] [--skip-music] [--no-verify]
"""
from __future__ import annotations

import sys
import time

import gen_blocks
import gen_effects
import gen_gui
import gen_items
import gen_music
import gen_particles
import gen_sfx
import gen_skins
import gen_voice


def step(name, fn):
    t0 = time.time()
    print(f"--- {name}")
    fn()
    print(f"    ({time.time() - t0:.1f}s)")


def main():
    args = set(sys.argv[1:])
    step("skins + blindfold", gen_skins.main)
    step("technique effects", gen_effects.main)
    step("blocks", gen_blocks.main)
    step("items", gen_items.main)
    step("particles", gen_particles.main)
    step("gui + mod icon", gen_gui.main)
    step("sfx", gen_sfx.main)
    if "--skip-music" not in args:
        step("music", gen_music.main)
    if "--skip-voice" not in args:
        step("voice", gen_voice.main)
    if "--no-verify" not in args:
        import runpy
        runpy.run_module("verify", run_name="__main__")


if __name__ == "__main__":
    main()
