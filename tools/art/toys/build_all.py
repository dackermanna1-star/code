"""Regenerates every toys & decor asset (textures, models, blockstates, item definitions, loot tables).

Run from anywhere: python3 tools/art/toys/build_all.py
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import toys  # noqa: E402

if __name__ == "__main__":
	toys.build_all()
	try:
		import decor  # noqa: E402
		decor.build_all()
	except ModuleNotFoundError as e:
		if e.name != "decor":
			raise
	print("toys & decor assets written")
