"""Regenerate every LaptopCraft art & audio asset owned by the art pipeline.

  python3 tools/art/build_all.py          # everything (needs Pillow, numpy and ffmpeg with libvorbis)
  python3 tools/art/build_all.py --no-sound

Outputs go to src/main/resources/assets/laptopcraft/; QA contact sheets: python3 tools/art/preview.py
"""
from __future__ import annotations

import sys

import blocks
import icons
import logos
import os_art
import wallpapers


def main(argv):
	icons.main()
	os_art.main()
	logos.main()
	wallpapers.main()
	blocks.main()
	if "--no-sound" not in argv:
		import sounds
		sounds.main()


if __name__ == "__main__":
	main(sys.argv[1:])
