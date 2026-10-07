"""Sanity check for the toys & decor assets: every block has a blockstate + loot table, every item an item
definition, every referenced model/texture exists and every lang key used by Java is translated.

Run: python3 tools/art/toys/check.py
"""
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(__file__))
from lib import ASSETS, DATA, ROOT  # noqa: E402

JAVA = [os.path.join(ROOT, "src/main/java/com/laptopcraft/content/ToyContent.java"),
	os.path.join(ROOT, "src/main/java/com/laptopcraft/content/DecorContent.java")]


def ids(pattern):
	out = []
	for f in JAVA:
		out += re.findall(pattern, open(f).read())
	return out


def main():
	problems = []
	blocks = ids(r'Reg\.block\("([a-z0-9_]+)"') + ids(r'(?:plush|lavaLamp|beanBag)\("([a-z0-9_]+)"')
	items = ids(r'Reg\.item\("([a-z0-9_]+)"')
	lang = json.load(open(os.path.join(ASSETS, "lang/parts/toys.json")))
	seen_models = set()

	def check_model(ref):
		path = ref.split(":")[1]
		if path in seen_models or path.startswith("item/generated") or path.startswith("block/block"):
			return
		seen_models.add(path)
		f = os.path.join(ASSETS, "models", path + ".json")
		if not os.path.exists(f):
			problems.append(f"missing model {ref}")
			return
		m = json.load(open(f))
		for k, v in m.get("textures", {}).items():
			if v.startswith("#"):
				continue
			tp = v.split(":")[1]
			if not os.path.exists(os.path.join(ASSETS, "textures", tp + ".png")):
				problems.append(f"{path}: missing texture {v}")
		for el in m.get("elements", []):
			for d, face in el["faces"].items():
				if face["texture"].lstrip("#") not in m["textures"]:
					problems.append(f"{path}: face texture {face['texture']} undefined")

	for b in blocks:
		bs = os.path.join(ASSETS, "blockstates", b + ".json")
		if not os.path.exists(bs):
			problems.append(f"missing blockstate {b}")
		else:
			for v in json.load(open(bs))["variants"].values():
				check_model(v["model"])
		if not os.path.exists(os.path.join(DATA, "loot_table/blocks", b + ".json")):
			problems.append(f"missing loot table {b}")
		if f"block.laptopcraft.{b}" not in lang:
			problems.append(f"missing lang block.laptopcraft.{b}")
	for i in blocks + items:
		idef = os.path.join(ASSETS, "items", i + ".json")
		if not os.path.exists(idef):
			problems.append(f"missing item definition {i}")
		else:
			check_model(json.load(open(idef))["model"]["model"])
	for i in items:
		if f"item.laptopcraft.{i}" not in lang:
			problems.append(f"missing lang item.laptopcraft.{i}")
	# translation keys used literally in Java
	src = ""
	for root, _, files in os.walk(os.path.join(ROOT, "src")):
		for fn in files:
			p = os.path.join(root, fn)
			if fn.endswith(".java") and ("decor" in p or "toy" in p.lower()):
				src += open(p).read()
	for key in re.findall(r'"((?:block|item|container)\.laptopcraft\.[a-z0-9_.]+)"', src):
		if key.endswith("."):
			if not any(k.startswith(key) for k in lang):
				problems.append(f"no lang keys with prefix {key}")
		elif key not in lang:
			problems.append(f"missing lang key {key}")
	print(f"{len(blocks)} blocks, {len(items)} items checked")
	for p in problems:
		print("PROBLEM:", p)
	return 1 if problems else 0


if __name__ == "__main__":
	sys.exit(main())
