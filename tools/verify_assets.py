#!/usr/bin/env python3
"""Checks that every asset referenced by code and JSON exists (textures, particles, models, sounds).
Run from the repo root: python3 tools/verify_assets.py   (exit code 1 when something is missing)"""
import json, os, re, sys

NS = "jjkshowdown"
A = f"src/main/resources/assets/{NS}"
missing = []


def need(path, why):
    if not os.path.isfile(path):
        missing.append(f"{path}  <- {why}")


# textures referenced from Java: JjkShowdown.id("textures/...png") and id("entity/x") skins
for root, _, files in os.walk("src"):
    for fn in files:
        if not fn.endswith(".java"):
            continue
        p = os.path.join(root, fn)
        text = open(p, encoding="utf-8").read()
        for m in re.finditer(r'id\("(textures/[a-z0-9_/]+\.png)"\)', text):
            need(f"{A}/{m.group(1)}", p)
        for m in re.finditer(r'id\("textures/gui/emblem_" \+', text):
            for c in ("gojo", "sukuna"):
                need(f"{A}/textures/gui/emblem_{c}.png", p)
        for m in re.finditer(r'id\("textures/gui/select_" \+', text):
            for c in ("gojo", "sukuna"):
                need(f"{A}/textures/gui/select_{c}.png", p)
        for m in re.finditer(r'ResourceTexture\(JjkShowdown\.id\("([a-z0-9_/]+)"\)\)', text):
            need(f"{A}/textures/{m.group(1)}.png", p)

# ability icons
for ab in ["infinity", "blue", "red", "blink", "hollow_purple", "unlimited_void", "dismantle", "cleave", "fuga", "world_slash",
           "domain_amplification", "malevolent_shrine", "reverse_cursed_technique"]:
    need(f"{A}/textures/gui/icons/{ab}.png", "Ability.icon()")

# particles
for fn in os.listdir(f"{A}/particles"):
    d = json.load(open(f"{A}/particles/{fn}"))
    for t in d["textures"]:
        ns, path = t.split(":")
        need(f"src/main/resources/assets/{ns}/textures/particle/{path}.png", f"particles/{fn}")

# models
for sub in ("block", "item"):
    folder = f"{A}/models/{sub}"
    for fn in os.listdir(folder):
        d = json.load(open(f"{folder}/{fn}"))
        for t in d.get("textures", {}).values():
            ns, path = t.split(":")
            need(f"src/main/resources/assets/{ns}/textures/{path}.png", f"models/{sub}/{fn}")

# equipment
for fn in os.listdir(f"{A}/equipment"):
    d = json.load(open(f"{A}/equipment/{fn}"))
    for layers in d["layers"].values():
        for layer in layers:
            ns, path = layer["texture"].split(":")
            need(f"src/main/resources/assets/{ns}/textures/entity/equipment/humanoid/{path}.png", f"equipment/{fn}")

# sounds
sounds = json.load(open(f"{A}/sounds.json"))
for ev, d in sounds.items():
    for snd in d["sounds"]:
        name = snd["name"] if isinstance(snd, dict) else snd
        ns, path = name.split(":")
        need(f"src/main/resources/assets/{ns}/sounds/{path}.ogg", f"sounds.json:{ev}")

need(f"{A}/icon.png", "fabric.mod.json icon")
need(f"{A}/textures/mob_effect/information_overload.png", "effect icon")

if missing:
    print(f"{len(missing)} missing asset(s):")
    for m in missing:
        print("  " + m)
    sys.exit(1)
print("all referenced assets present")
