"""Regenerates every LaptopCraft fashion asset (hats, garments, icons, item definitions, overlays).

    python3 -B tools/art/fashion/build_all.py            # everything
    python3 -B tools/art/fashion/build_all.py top_hat    # only some hats (+ the cheap rest)

Dev previews (not needed for the build):
    python3 -B tools/art/fashion/preview.py top_hat beanie -o /tmp/hats.png
"""
import os
import sys

sys.dont_write_bytecode = True
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import defs  # noqa: E402
import extras  # noqa: E402
import garments  # noqa: E402
import hats  # noqa: E402
import icons  # noqa: E402


def main(argv):
    hats.build(only=set(argv) or None)
    garments.build()
    icons.build()
    defs.build()
    extras.build()
    print("fashion assets written")


if __name__ == "__main__":
    main(sys.argv[1:])
