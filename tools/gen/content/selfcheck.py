"""Post-generation consistency check of the emitted data pack + assets (fast, no game needed).

Catches the mistakes that would otherwise only show up as a world-load failure or purple/black textures:
dangling feature/noise/carver/biome/timeline references, block ids that are neither generated nor vanilla, missing
models/textures, loot entries naming unknown items, tags in places that only accept ids.

    python3 -m gen.content.selfcheck [res_dir]
"""
from __future__ import annotations

import json
import os
import re
import sys

from .common import NS
from .validate import vanilla

VANILLA_WORLDGEN = None


def _vanilla_ids(kind):
    """Vanilla registry entries we may reference (placed features, noises, density functions...)."""
    if kind == "placed_feature":
        from .features import vanilla_steps
        return {k.split(":", 1)[1] for k in vanilla_steps()}
    known = {
        "noise": {"aquifer_barrier", "aquifer_fluid_level_floodedness", "aquifer_fluid_level_spread", "aquifer_lava",
                  "offset", "surface", "surface_secondary", "temperature", "vegetation", "continentalness", "erosion",
                  "ridge", "jagged", "cave_cheese", "spaghetti_3d_1", "spaghetti_3d_2"},
        "density_function": {"y", "zero", "shift_x", "shift_z"},
        "timeline": {"day", "moon", "early_game", "villager_schedule"},
        "configured_carver": {"cave", "cave_extra_underground", "canyon", "nether_cave"},
    }
    return known.get(kind, set())


class Checker:
    def __init__(self, res):
        self.res = res
        self.data = os.path.join(res, "data", NS)
        self.assets = os.path.join(res, "assets", NS)
        self.errors = []
        self._exists_cache = {}

    def err(self, where, msg):
        self.errors.append(f"{os.path.relpath(where, self.res)}: {msg}")

    def exists(self, kind, rid):
        """Does registry entry `rid` of data kind `kind` exist (generated or vanilla)?"""
        ns, path = rid.split(":", 1) if ":" in rid else ("minecraft", rid)
        if ns == "minecraft":
            return path in _vanilla_ids(kind) or kind not in ("placed_feature", "noise", "density_function", "timeline",
                                                               "configured_carver")
        if ns != NS:
            return True
        sub = {"placed_feature": "worldgen/placed_feature", "configured_feature": "worldgen/configured_feature",
               "noise": "worldgen/noise", "density_function": "worldgen/density_function",
               "configured_carver": "worldgen/configured_carver", "biome": "worldgen/biome",
               "noise_settings": "worldgen/noise_settings", "timeline": "timeline", "dimension_type": "dimension_type"}[kind]
        return os.path.exists(os.path.join(self.data, sub, path + ".json"))

    def block_ok(self, bid, blocks):
        ns, path = bid.split(":", 1) if ":" in bid else ("minecraft", bid)
        if ns == "minecraft":
            return path in vanilla("blocks") or path in ("air", "cave_air", "void_air", "water", "lava")
        if ns == NS:
            return path in blocks
        return True

    def item_ok(self, iid, items):
        ns, path = iid.split(":", 1) if ":" in iid else ("minecraft", iid)
        if ns == "minecraft":
            return path in vanilla("items")
        if ns == NS:
            return path in items
        return True

    def walk(self, sub):
        root = os.path.join(self.data, sub)
        for dp, _, fns in os.walk(root):
            for fn in fns:
                if fn.endswith(".json"):
                    p = os.path.join(dp, fn)
                    try:
                        with open(p, encoding="utf-8") as f:
                            yield p, json.load(f)
                    except (OSError, ValueError) as e:
                        self.err(p, f"unreadable JSON: {e}")

    def run(self, spec=None):
        spec = spec or {}
        blocks = {b["id"] for b in spec.get("blocks", [])}
        items = blocks | {i["id"] for i in spec.get("items", [])}
        items |= {c.get("id", "") + "_spawn_egg" for c in spec.get("creatures", [])} | {"portal_gun", "portal_fluid"}
        state_names = []

        def collect_states(obj, where):
            if isinstance(obj, dict):
                if "Name" in obj and isinstance(obj["Name"], str) and len(obj) <= 2:
                    state_names.append((obj["Name"], where))
                for k, v in obj.items():
                    if k in ("noise",) and isinstance(v, str) and ":" in v:
                        if not self.exists("noise", v):
                            self.err(where, f"unknown noise {v}")
                    collect_states(v, where)
            elif isinstance(obj, list):
                for v in obj:
                    collect_states(v, where)

        for p, d in self.walk("dimension"):
            gen = d.get("generator", {})
            if not self.exists("noise_settings", gen.get("settings", "")):
                self.err(p, f"unknown noise settings {gen.get('settings')}")
            if not self.exists("dimension_type", d.get("type", "")):
                self.err(p, f"unknown dimension type {d.get('type')}")
            src = gen.get("biome_source", {})
            bl = [src["biome"]] if "biome" in src else [b["biome"] for b in src.get("biomes", [])]
            for b in bl:
                if not self.exists("biome", b):
                    self.err(p, f"unknown biome {b}")
        for p, d in self.walk("dimension_type"):
            tl = d.get("timelines")
            if isinstance(tl, list):
                for t in tl:
                    if t.startswith("#"):
                        self.err(p, f"timeline list may not contain tag {t}")
                    elif not self.exists("timeline", t):
                        self.err(p, f"unknown timeline {t}")
            if d.get("height", 16) % 16 or d.get("min_y", 0) % 16:
                self.err(p, "height/min_y must be multiples of 16")
        for p, d in self.walk("worldgen/biome"):
            feats = d.get("features", [])
            if len(feats) > 11:
                self.err(p, f"{len(feats)} feature steps (max 11)")
            seen = {}
            for i, step in enumerate(feats):
                for f in step:
                    if f in seen:
                        self.err(p, f"feature {f} listed twice (steps {seen[f]} and {i})")
                    seen[f] = i
                    if not self.exists("placed_feature", f):
                        self.err(p, f"unknown placed feature {f}")
            carvers = d.get("carvers", [])
            for c in (carvers if isinstance(carvers, list) else [carvers]):
                if not self.exists("configured_carver", c):
                    self.err(p, f"unknown carver {c}")
            for cat, lst in d.get("spawners", {}).items():
                for s in lst:
                    t = s.get("type", "")
                    if t.startswith("minecraft:") and t.split(":", 1)[1] not in vanilla("entities"):
                        self.err(p, f"unknown entity {t}")
                    if t.startswith(NS + ":") and t.split(":", 1)[1] not in {c.get("id") for c in spec.get("creatures", [])}:
                        self.err(p, f"spawner for {t} which is not a spec creature")
        for p, d in self.walk("worldgen/placed_feature"):
            f = d.get("feature")
            if isinstance(f, str) and not self.exists("configured_feature", f):
                self.err(p, f"unknown configured feature {f}")
            collect_states(d, p)
        for sub in ("worldgen/configured_feature", "worldgen/noise_settings", "worldgen/configured_carver"):
            for p, d in self.walk(sub):
                collect_states(d, p)
        for name, where in state_names:
            if not self.block_ok(name, blocks):
                self.err(where, f"unknown block {name}")
        for p, d in self.walk("loot_table"):
            for m in re.findall(r'"name":\s*"([^"]+)"', json.dumps(d)):
                if not self.item_ok(m, items):
                    self.err(p, f"loot entry names unknown item {m}")
        # assets: blockstate -> model -> textures, item definitions -> models
        models_dir = os.path.join(self.assets, "models")
        tex_dir = os.path.join(self.assets, "textures")

        def model_ok(ref, where):
            ns, path = ref.split(":", 1) if ":" in ref else ("minecraft", ref)
            if ns != NS:
                return
            mp = os.path.join(models_dir, path + ".json")
            if not os.path.exists(mp):
                self.err(where, f"missing model {ref}")
                return
            with open(mp, encoding="utf-8") as f:
                m = json.load(f)
            for k, t in m.get("textures", {}).items():
                if t.startswith("#"):
                    continue
                tns, tpath = t.split(":", 1) if ":" in t else ("minecraft", t)
                if tns == NS and not os.path.exists(os.path.join(tex_dir, tpath + ".png")):
                    self.err(mp, f"missing texture {t}")
            if "parent" in m:
                model_ok(m["parent"], mp)

        bs_dir = os.path.join(self.assets, "blockstates")
        if os.path.isdir(bs_dir):
            for fn in os.listdir(bs_dir):
                p = os.path.join(bs_dir, fn)
                with open(p, encoding="utf-8") as f:
                    bs = json.load(f)
                for ref in re.findall(r'"model":\s*"([^"]+)"', json.dumps(bs)):
                    model_ok(ref, p)
            for b in blocks:
                if not os.path.exists(os.path.join(bs_dir, b + ".json")):
                    self.err(bs_dir, f"block {b} has no blockstate")
        it_dir = os.path.join(self.assets, "items")
        if os.path.isdir(it_dir):
            for fn in os.listdir(it_dir):
                p = os.path.join(it_dir, fn)
                with open(p, encoding="utf-8") as f:
                    d = json.load(f)
                for ref in re.findall(r'"model":\s*"([^"]+:[^"]+)"', json.dumps(d)):
                    model_ok(ref, p)
            for i in items - {"portal_gun", "portal_fluid"}:
                if i.endswith("_spawn_egg"):
                    continue
                if not os.path.exists(os.path.join(it_dir, i + ".json")):
                    self.err(it_dir, f"item {i} has no item model definition")
        for d in spec.get("dimensions", []):
            for s in d.get("sky", []):
                tp = s["texture"].split(":", 1)[1]
                if not os.path.exists(os.path.join(self.assets, tp)):
                    self.err(self.assets, f"missing sky texture {s['texture']}")
        return self.errors


def check(res, spec=None):
    return Checker(res).run(spec)


if __name__ == "__main__":
    here = os.path.dirname(os.path.abspath(__file__))
    res = sys.argv[1] if len(sys.argv) > 1 else os.path.join(here, "..", "..", "..", "src", "main", "resources")
    spec_p = os.path.join(res, "portalgun", "content.json")
    spec = json.load(open(spec_p)) if os.path.exists(spec_p) else {}
    errs = check(res, spec)
    for e in errs:
        print("  -", e)
    print(f"{len(errs)} problem(s)")
    sys.exit(1 if errs else 0)
