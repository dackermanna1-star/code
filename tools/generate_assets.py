"""Regenerates Ordnance's textures, 3D models, sounds and data files.

Usage (from the repository root): python3 tools/generate_assets.py [particles|models|blocks|sounds|data ...]
Requires numpy, Pillow and ffmpeg (with libvorbis). The generated files are committed, so building the mod
does not need Python.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from tools.assetgen import blocks, data, models, particles, sounds  # noqa: E402

STEPS = {"particles": particles.generate, "models": models.generate, "blocks": blocks.generate, "sounds": sounds.generate, "data": data.generate}

if __name__ == "__main__":
    selected = sys.argv[1:] or list(STEPS)
    for name in selected:
        print(f"generating {name}...")
        STEPS[name]()
    print("done")
