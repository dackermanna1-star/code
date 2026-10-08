"""Feature emitter: every dsl.Feature -> configured_feature + placed_feature JSON, plus per-dimension shared features
(vanilla-style ores in the dimension stone, springs, freeze layer) and a globally consistent feature order.

Generation steps (vanilla GenerationStep.Decoration indices):
 0 raw_generation 1 lakes 2 local_modifications 3 underground_structures 4 surface_structures 5 strongholds
 6 underground_ores 7 underground_decoration 8 fluid_springs 9 vegetal_decoration 10 top_layer_modification

`where` placement:
  surface       heightmap MOTION_BLOCKING_NO_LEAVES (trees/boulders also: no water above). In layered worlds
                (caves, cells, inverted, layers, multi-tier sky islands, planetoids) count_on_every_layer instead,
                so every floor of every tier/cavern gets decorated.
  underwater    heightmap OCEAN_FLOOR_WG + must be in water
  water_surface heightmap WORLD_SURFACE_WG (the air block right above the water)
  cave_floor    height_range + environment_scan down to a sturdy floor      (count is scaled by range/24 blocks
  cave_ceiling  height_range + environment_scan up to a sturdy ceiling       because most attempts start in rock)
  air / anywhere height_range only (Feature.y or a style default)
"""
from __future__ import annotations

import json
import os

from .common import (NS, full_id, has_java, int_provider, is_leaves, java_multiface_vines, simple_provider, state, warn,
                     weighted_provider, write_json)
from .dsl import (Boulder, CrystalCluster, Disk, Feature, Geode, GiantPlant, Lake, Ore, Patch, Spire, Structure, Tree,
                  Vanilla)
from .worldgen import VOID_STYLES, has_roof, world_range

DATA_DIR = os.path.join(os.path.dirname(__file__), "data")
_VSTEPS = None

STEP = {"Tree": 9, "GiantPlant": 9, "Patch": 9, "Ore": 6, "Disk": 6, "Boulder": 2, "Spire": 4, "CrystalCluster": 7,
        "Structure": 4, "Lake": 1, "Geode": 2}
N_STEPS = 11

PLANT_KINDS = {"plant", "tall_plant", "hanging_plant", "crystal_cluster", "lily", "vine", "carpet"}


def vanilla_steps():
    global _VSTEPS
    if _VSTEPS is None:
        with open(os.path.join(DATA_DIR, "vanilla_feature_steps.json")) as f:
            _VSTEPS = json.load(f)
    return _VSTEPS


class FCtx:
    """Per-dimension feature context."""

    def __init__(self, ctx, dim):
        self.ctx = ctx
        self.dim = dim
        t = dim.terrain
        self.t = t
        self.min_y, self.height = world_range(t)
        self.top = self.min_y + self.height
        P = t.params or {}
        multi_tier = (t.style == "sky_islands" and int(P.get("layers", 2)) > 1)
        self.layered = t.style in ("caves", "cells", "inverted", "layers", "planetoids") or multi_tier or has_roof(t)
        self.void = t.style in VOID_STYLES
        self.warned = set()

    def y_range(self, f, where):
        if f.y:
            return int(f.y[0]), int(f.y[1])
        t = self.t
        if where in ("cave_floor", "cave_ceiling"):
            if self.layered or t.style in ("caves", "cells"):
                return self.min_y + 6, self.top - 8
            return self.min_y + 8, max(self.min_y + 16, t.height - 6)
        if where == "air":
            return t.height + 12, min(self.top - 10, t.height + int(t.amplitude * 2) + 70)
        return self.min_y + 4, self.top - 8

    def warn_once(self, key, msg):
        if key not in self.warned:
            self.warned.add(key)
            warn(msg)


def _hr(a, b):
    a, b = int(min(a, b)), int(max(a, b))
    return {"type": "minecraft:height_range", "height": {"type": "minecraft:uniform", "min_inclusive": {"absolute": a},
                                                          "max_inclusive": {"absolute": b}}}


def _count(c):
    if isinstance(c, (tuple, list)):
        lo, hi = min(256, int(c[0])), min(256, int(c[1]))
        if hi <= 0:
            return None
        return {"type": "minecraft:count", "count": int_provider((max(0, lo), max(0, hi)))}
    c = int(c)
    if c <= 0:
        return None
    if c == 1:
        return None
    return {"type": "minecraft:count", "count": min(256, c)}


def _count_value(c):
    if isinstance(c, (tuple, list)):
        return int_provider((max(0, int(c[0])), max(0, min(256, int(c[1])))))
    return max(0, min(256, int(c)))


def _env_scan(direction):
    target = {"type": "minecraft:has_sturdy_face", "direction": "up" if direction == "down" else "down"}
    return {"type": "minecraft:environment_scan", "direction_of_search": direction, "max_steps": 16,
            "target_condition": target,
            "allowed_search_condition": {"type": "minecraft:matching_blocks", "blocks": ["minecraft:air", "minecraft:cave_air"]}}


def _shallow_pred(f):
    """Lily pads & co. stay in shallows: no water `max_depth`+1 blocks below the surface block."""
    d = int(getattr(f, "max_depth", 0) or 0)
    if d <= 0:
        return None
    return {"type": "minecraft:not", "predicate": {"type": "minecraft:matching_fluids", "offset": [0, -(d + 1), 0],
                                                   "fluids": ["minecraft:water", "minecraft:flowing_water"]}}


def placement(fc: FCtx, f: Feature, ground_check=False, solid_below=False):
    """Placement modifiers for a feature according to its count/chance/where/y."""
    where = f.where
    mods = []
    if f.chance and f.chance > 1:
        mods.append({"type": "minecraft:rarity_filter", "chance": int(f.chance)})
    if where == "surface" and fc.layered:
        mods.append({"type": "minecraft:count_on_every_layer", "count": _count_value(f.count)})
        if solid_below:
            mods.append({"type": "minecraft:block_predicate_filter",
                         "predicate": {"type": "minecraft:has_sturdy_face", "offset": [0, -1, 0], "direction": "up"}})
        mods.append({"type": "minecraft:biome"})
        return mods
    count = f.count
    if where in ("cave_floor", "cave_ceiling"):
        # most random points of a tall height range are inside rock; scale attempts with the range so `count`
        # stays "roughly this many patches per chunk" like for surface features
        a, b = fc.y_range(f, where)
        k = max(1.0, (b - a) / 24.0)
        count = (int(count[0] * k), int(count[1] * k)) if isinstance(count, (tuple, list)) else int(round(count * k))
    c = _count(count)
    if c:
        mods.append(c)
    mods.append({"type": "minecraft:in_square"})
    if where == "surface":
        mods.append({"type": "minecraft:heightmap", "heightmap": "MOTION_BLOCKING_NO_LEAVES"})
        if ground_check:
            mods.append({"type": "minecraft:surface_water_depth_filter", "max_water_depth": 0})
        if solid_below:
            mods.append({"type": "minecraft:block_predicate_filter",
                         "predicate": {"type": "minecraft:has_sturdy_face", "offset": [0, -1, 0], "direction": "up"}})
    elif where == "underwater":
        mods.append({"type": "minecraft:heightmap", "heightmap": "OCEAN_FLOOR_WG"})
        mods.append({"type": "minecraft:block_predicate_filter",
                     "predicate": {"type": "minecraft:matching_fluids", "fluids": ["minecraft:water", "minecraft:lava"]}})
    elif where == "water_surface":
        mods.append({"type": "minecraft:heightmap", "heightmap": "WORLD_SURFACE_WG"})
        mods.append({"type": "minecraft:block_predicate_filter",
                     "predicate": {"type": "minecraft:matching_fluids", "offset": [0, -1, 0], "fluids": ["minecraft:water"]}})
        if _shallow_pred(f):
            mods.append({"type": "minecraft:block_predicate_filter", "predicate": _shallow_pred(f)})
    elif where == "cave_floor":
        a, b = fc.y_range(f, where)
        mods.append(_hr(a, b))
        mods.append(_env_scan("down"))
        mods.append({"type": "minecraft:random_offset", "xz_spread": 0, "y_spread": 1})
    elif where == "cave_ceiling":
        a, b = fc.y_range(f, where)
        mods.append(_hr(a, b))
        mods.append(_env_scan("up"))
        mods.append({"type": "minecraft:random_offset", "xz_spread": 0, "y_spread": -1})
    else:  # air / anywhere
        a, b = fc.y_range(f, where)
        mods.append(_hr(a, b))
    mods.append({"type": "minecraft:biome"})
    return mods


# ----------------------------------------------------------------------------------------------- block helpers
WATERLOGGABLE = {"plant", "crystal_cluster", "hanging_plant", "vine"}


def plant_state(fc, ref, where):
    kind = fc.ctx.kind(ref)
    extra = {"waterlogged": "true"} if (where == "underwater" and kind in WATERLOGGABLE) else {}
    if kind == "crystal_cluster":
        return state(ref, facing="down" if where == "cave_ceiling" else "up", **extra)
    if kind == "vine":
        return state(ref, up="true", **extra) if where == "cave_ceiling" else state(ref, down="true", **extra)
    return state(ref, **extra)


def is_plantish(fc, ref):
    k = fc.ctx.kind(ref)
    if k:
        return k in PLANT_KINDS
    p = full_id(ref).split(":", 1)[1]
    return any(s in p for s in ("grass", "fern", "flower", "bush", "sapling", "mushroom", "roots", "sprouts", "tulip",
                                "orchid", "allium", "bluet", "daisy", "poppy", "dandelion", "lily", "rose", "peony",
                                "lilac", "vine", "lichen", "coral", "kelp", "seagrass", "pickle", "dripleaf", "berry",
                                "petals", "litter", "cactus", "cane", "bamboo", "torchflower", "pitcher", "eyeblossom",
                                "carpet", "snow", "button", "fungus", "moss_carpet", "wildflowers", "leaf_litter"))


def _patch_feature(fc, f: Patch):
    where = f.where
    if f.blocks:
        entries = f.blocks
    else:
        entries = [(f.block, 1)]
    first = entries[0][0]
    if len(entries) == 1:
        provider = {"type": "minecraft:simple_state_provider", "state": plant_state(fc, first, where)}
    else:
        provider = {"type": "minecraft:weighted_state_provider",
                    "entries": [{"data": plant_state(fc, r, where), "weight": int(w)} for r, w in entries]}
    preds = [{"type": "minecraft:matching_blocks", "blocks": ["minecraft:air", "minecraft:cave_air"]}]
    if where == "underwater":
        preds = [{"type": "minecraft:matching_fluids", "fluids": ["minecraft:water"]}]
    preds.append({"type": "minecraft:would_survive", "state": plant_state(fc, first, where)})
    if not is_plantish(fc, first):
        if where == "cave_ceiling":
            preds.append({"type": "minecraft:has_sturdy_face", "offset": [0, 1, 0], "direction": "down"})
        else:
            preds.append({"type": "minecraft:has_sturdy_face", "offset": [0, -1, 0], "direction": "up"})
    if where == "water_surface":
        preds.append({"type": "minecraft:matching_fluids", "offset": [0, -1, 0], "fluids": ["minecraft:water"]})
        if _shallow_pred(f):
            preds.append(_shallow_pred(f))
    elif where in ("surface", "cave_floor"):
        # never on top of water/lava (carpets and many plants would happily sit on a fluid surface)
        preds.append({"type": "minecraft:not", "predicate": {"type": "minecraft:matching_fluids", "offset": [0, -1, 0],
                                                              "fluids": ["minecraft:water", "minecraft:flowing_water",
                                                                         "minecraft:lava", "minecraft:flowing_lava"]}})
    inner = {"feature": {"type": "minecraft:simple_block", "config": {"to_place": provider}},
             "placement": [{"type": "minecraft:block_predicate_filter", "predicate": {"type": "minecraft:all_of", "predicates": preds}}]}
    y_spread = 1 if where in ("water_surface",) else (2 if where in ("cave_floor", "cave_ceiling") else 3)
    return {"type": "minecraft:random_patch", "config": {"tries": max(1, int(f.tries)), "xz_spread": max(0, min(16, int(f.spread))),
                                                         "y_spread": y_spread, "feature": inner}}


def _vine_feature(fc, f: Patch):
    ref = f.block or (f.blocks[0][0] if f.blocks else "")
    t = fc.t
    can = sorted({full_id(t.stone)} | {full_id(b.under) for b in fc.dim.biomes} | {full_id(b.top) for b in fc.dim.biomes}
                 | {full_id(b.stone) for b in fc.dim.biomes if b.stone})
    return {"type": "minecraft:multiface_growth", "config": {
        "block": full_id(ref), "search_range": 20, "chance_of_spreading": 0.5,
        "can_place_on_floor": f.where in ("surface", "cave_floor"), "can_place_on_ceiling": True, "can_place_on_wall": True,
        "can_be_placed_on": can}}


TREE_SHAPES = {
    "oak": lambda lo, a: ({"type": "minecraft:straight_trunk_placer", "base_height": lo, "height_rand_a": a, "height_rand_b": 0},
                          {"type": "minecraft:blob_foliage_placer", "radius": 2, "offset": 0, "height": 3},
                          {"type": "minecraft:two_layers_feature_size", "limit": 1, "lower_size": 0, "upper_size": 1}),
    "birch": lambda lo, a: ({"type": "minecraft:straight_trunk_placer", "base_height": lo, "height_rand_a": a, "height_rand_b": 0},
                            {"type": "minecraft:blob_foliage_placer", "radius": 2, "offset": 0, "height": 3},
                            {"type": "minecraft:two_layers_feature_size", "limit": 1, "lower_size": 0, "upper_size": 1}),
    "fancy": lambda lo, a: ({"type": "minecraft:fancy_trunk_placer", "base_height": lo, "height_rand_a": max(a, 1), "height_rand_b": 0},
                            {"type": "minecraft:fancy_foliage_placer", "radius": 2, "offset": 4, "height": 4},
                            {"type": "minecraft:two_layers_feature_size", "limit": 0, "lower_size": 0, "upper_size": 0,
                             "min_clipped_height": 4}),
    "spruce": lambda lo, a: ({"type": "minecraft:straight_trunk_placer", "base_height": lo, "height_rand_a": a, "height_rand_b": 1},
                             {"type": "minecraft:spruce_foliage_placer", "radius": int_provider((2, 3)), "offset": int_provider((0, 2)),
                              "trunk_height": int_provider((1, 2))},
                             {"type": "minecraft:two_layers_feature_size", "limit": 2, "lower_size": 0, "upper_size": 2}),
    "pine": lambda lo, a: ({"type": "minecraft:straight_trunk_placer", "base_height": lo, "height_rand_a": a, "height_rand_b": 0},
                           {"type": "minecraft:pine_foliage_placer", "radius": 1, "offset": 1, "height": int_provider((3, 4))},
                           {"type": "minecraft:two_layers_feature_size", "limit": 2, "lower_size": 0, "upper_size": 2}),
    "acacia": lambda lo, a: ({"type": "minecraft:forking_trunk_placer", "base_height": lo, "height_rand_a": max(1, a // 2), "height_rand_b": max(1, a - a // 2)},
                             {"type": "minecraft:acacia_foliage_placer", "radius": 2, "offset": 0},
                             {"type": "minecraft:two_layers_feature_size", "limit": 1, "lower_size": 0, "upper_size": 2}),
    "dark_oak": lambda lo, a: ({"type": "minecraft:dark_oak_trunk_placer", "base_height": lo, "height_rand_a": max(1, a // 2), "height_rand_b": 1},
                               {"type": "minecraft:dark_oak_foliage_placer", "radius": 0, "offset": 0},
                               {"type": "minecraft:three_layers_feature_size", "limit": 1, "upper_limit": 1, "lower_size": 0,
                                "middle_size": 1, "upper_size": 2}),
    "jungle": lambda lo, a: ({"type": "minecraft:straight_trunk_placer", "base_height": lo, "height_rand_a": a, "height_rand_b": 0},
                             {"type": "minecraft:blob_foliage_placer", "radius": 2, "offset": 0, "height": 3},
                             {"type": "minecraft:two_layers_feature_size", "limit": 1, "lower_size": 0, "upper_size": 1}),
    "mega_jungle": lambda lo, a: ({"type": "minecraft:mega_jungle_trunk_placer", "base_height": lo, "height_rand_a": 2, "height_rand_b": max(1, a)},
                                  {"type": "minecraft:jungle_foliage_placer", "radius": 2, "offset": 0, "height": 2},
                                  {"type": "minecraft:two_layers_feature_size", "limit": 1, "lower_size": 1, "upper_size": 2}),
    "cherry": lambda lo, a: ({"type": "minecraft:cherry_trunk_placer", "base_height": lo, "height_rand_a": max(0, min(a, 3)), "height_rand_b": 0,
                              "branch_count": {"type": "minecraft:weighted_list", "distribution": [{"data": 1, "weight": 1}, {"data": 2, "weight": 1}, {"data": 3, "weight": 1}]},
                              "branch_horizontal_length": int_provider((2, 4)),
                              "branch_start_offset_from_top": {"min_inclusive": -4, "max_inclusive": -3},
                              "branch_end_offset_from_top": int_provider((-1, 0))},
                             {"type": "minecraft:cherry_foliage_placer", "radius": 4, "offset": 0, "height": 5,
                              "wide_bottom_layer_hole_chance": 0.25, "corner_hole_chance": 0.25, "hanging_leaves_chance": 0.16666667,
                              "hanging_leaves_extension_chance": 0.33333334},
                             {"type": "minecraft:two_layers_feature_size", "limit": 1, "lower_size": 0, "upper_size": 2}),
    "bush": lambda lo, a: ({"type": "minecraft:straight_trunk_placer", "base_height": max(1, min(lo, 2)), "height_rand_a": 0, "height_rand_b": 0},
                           {"type": "minecraft:bush_foliage_placer", "radius": 2, "offset": 1, "height": 2},
                           {"type": "minecraft:two_layers_feature_size", "limit": 0, "lower_size": 0, "upper_size": 0}),
    # vanilla stand-ins for the custom shapes when portalgun:tree is unavailable
    "palm": lambda lo, a: ({"type": "minecraft:bending_trunk_placer", "base_height": lo, "height_rand_a": a, "height_rand_b": 0,
                            "bend_length": int_provider((1, 3)), "min_height_for_leaves": max(1, lo - 1)},
                           {"type": "minecraft:acacia_foliage_placer", "radius": 3, "offset": 0},
                           {"type": "minecraft:two_layers_feature_size", "limit": 1, "lower_size": 0, "upper_size": 1}),
    "twisted": lambda lo, a: ({"type": "minecraft:bending_trunk_placer", "base_height": lo, "height_rand_a": a, "height_rand_b": 0,
                               "bend_length": int_provider((2, 4)), "min_height_for_leaves": max(1, lo - 2)},
                              {"type": "minecraft:random_spread_foliage_placer", "radius": 3, "offset": 0, "foliage_height": 2,
                               "leaf_placement_attempts": 60},
                              {"type": "minecraft:two_layers_feature_size", "limit": 1, "lower_size": 0, "upper_size": 1}),
    "mushroom_like": lambda lo, a: ({"type": "minecraft:straight_trunk_placer", "base_height": lo, "height_rand_a": a, "height_rand_b": 0},
                                    {"type": "minecraft:acacia_foliage_placer", "radius": 3, "offset": 0},
                                    {"type": "minecraft:two_layers_feature_size", "limit": 1, "lower_size": 0, "upper_size": 1}),
}
CUSTOM_TREE_SHAPES = {"palm", "twisted", "mushroom_like"}


def _dirt_for(fc, biome):
    return biome.under if biome is not None else fc.t.stone


def _tree_feature(fc, f: Tree, biome):
    lo, hi = int(f.height[0]), int(f.height[1])
    a = max(0, hi - lo)
    if f.shape in CUSTOM_TREE_SHAPES and has_java("tree"):
        cfg = {"log": state(f.log), "leaves": state(f.leaves), "shape": f.shape, "height": int_provider((lo, hi))}
        if f.decoration:
            cfg["decoration"] = state(f.decoration)
        return {"type": f"{NS}:tree", "config": cfg}
    shape = TREE_SHAPES.get(f.shape, TREE_SHAPES["oak"])
    trunk, foliage, size = shape(max(1, lo), a)
    decorators = []
    if f.decoration:
        decorators.append({"type": "minecraft:attached_to_leaves", "probability": 0.18, "exclusion_radius_xz": 1,
                           "exclusion_radius_y": 0, "required_empty_blocks": 1,
                           "block_provider": {"type": "minecraft:simple_state_provider", "state": plant_state(fc, f.decoration, "cave_ceiling")},
                           "directions": ["down"]})
    return {"type": "minecraft:tree", "config": {
        "trunk_provider": simple_provider(f.log), "foliage_provider": simple_provider(f.leaves, **({"persistent": False} if is_leaves(f.leaves) else {})),
        "trunk_placer": trunk, "foliage_placer": foliage, "minimum_size": size,
        "dirt_provider": simple_provider(_dirt_for(fc, biome)), "force_dirt": False, "ignore_vines": True,
        "decorators": decorators}}


GIANT_FALLBACK = {"dome": "oak", "sphere": "oak", "puff": "bush", "flat": "acacia", "umbrella": "acacia", "palm": "palm",
                  "cone": "spruce", "flower": "acacia", "tuft": "bush"}


def _giant_feature(fc, f: GiantPlant, biome):
    if has_java("giant_plant"):
        cfg = {"stem": state(f.stem), "head": state(f.head), "shape": f.shape, "height": int_provider(f.height),
               "radius": int_provider(f.radius), "stem_width": max(1, min(3, int(f.stem_width))), "bend": float(max(0.0, min(1.0, f.bend)))}
        if f.decoration:
            cfg["decoration"] = state(f.decoration)
        return {"type": f"{NS}:giant_plant", "config": cfg}
    fc.warn_once("giant", f"{fc.dim.id}: portalgun:giant_plant not registered in Java yet - using vanilla tree stand-ins")
    t = Tree(log=f.stem, leaves=f.head, shape=GIANT_FALLBACK.get(f.shape, "oak"), height=f.height, decoration=f.decoration)
    return _tree_feature(fc, t, biome)


def _boulder_feature(fc, f: Boulder):
    blocks = f.blocks or [(fc.t.stone, 1)]
    if has_java("boulder"):
        return {"type": f"{NS}:boulder", "config": {"blocks": weighted_provider(blocks), "radius": int_provider(f.radius),
                                                   "hollow": bool(f.hollow), "squash": float(f.squash),
                                                   "floating": f.where == "air"}}
    if f.where == "air":
        return None
    fc.warn_once("boulder", f"{fc.dim.id}: portalgun:boulder not registered yet - using minecraft:forest_rock")
    return {"type": "minecraft:forest_rock", "config": {"state": state(blocks[0][0])}}


def _spire_feature(fc, f: Spire):
    blocks = f.blocks or [(fc.t.stone, 1)]
    if has_java("spire"):
        cfg = {"blocks": weighted_provider(blocks), "height": int_provider(f.height), "radius": int_provider(f.radius),
               "lean": float(max(0.0, min(1.0, f.lean))), "hanging": bool(f.hanging or f.where == "cave_ceiling")}
        if f.tip:
            cfg["tip"] = state(f.tip)
        if f.cap:
            cfg["cap"] = state(f.cap)
        return {"type": f"{NS}:spire", "config": cfg}
    fc.warn_once("spire", f"{fc.dim.id}: portalgun:spire not registered yet - using minecraft:block_column")
    down = f.hanging or f.where == "cave_ceiling"
    layers = [{"height": int_provider(f.height), "provider": weighted_provider(blocks)}]
    if f.tip:
        layers.append({"height": 1, "provider": simple_provider(f.tip)})
    return {"type": "minecraft:block_column", "config": {
        "direction": "down" if down else "up",
        "allowed_placement": {"type": "minecraft:matching_blocks", "blocks": ["minecraft:air", "minecraft:cave_air"]},
        "prioritize_tip": bool(f.tip), "layers": layers}}


def _crystal_feature(fc, f: CrystalCluster):
    if has_java("crystal_cluster"):
        cfg = {"block": state(f.block), "size": int_provider(f.size)}
        if f.small:
            cfg["small"] = state(f.small, facing="up") if fc.ctx.kind(f.small) == "crystal_cluster" else state(f.small)
        return {"type": f"{NS}:crystal_cluster", "config": cfg}
    fc.warn_once("crystal", f"{fc.dim.id}: portalgun:crystal_cluster not registered yet - using block_column")
    down = f.where == "cave_ceiling"
    return {"type": "minecraft:block_column", "config": {
        "direction": "down" if down else "up",
        "allowed_placement": {"type": "minecraft:matching_blocks", "blocks": ["minecraft:air", "minecraft:cave_air"]},
        "prioritize_tip": False, "layers": [{"height": int_provider(f.size), "provider": simple_provider(f.block)}]}}


def _structure_feature(fc, f: Structure):
    if not has_java("structure"):
        fc.warn_once("structure", f"{fc.dim.id}: portalgun:structure not registered yet - structures skipped")
        return None
    cfg = {"kind": f.kind, "blocks": {r: state(b) for r, b in f.blocks.items()}, "size": int_provider(f.size)}
    if f.params:
        cfg["params"] = {k: float(v) for k, v in f.params.items()}
    return {"type": f"{NS}:structure", "config": cfg}


def _ore_feature(fc, f: Ore, ore_tag):
    targets = []
    reps = f.replace or ["#" + ore_tag]
    for r in reps:
        if r.startswith("#"):
            rule = {"predicate_type": "minecraft:tag_match", "tag": r[1:]}
        else:
            rule = {"predicate_type": "minecraft:block_match", "block": full_id(r)}
        targets.append({"target": rule, "state": state(f.block)})
    return {"type": "minecraft:ore", "config": {"size": max(1, min(64, int(f.size))), "discard_chance_on_air_exposure": 0.0,
                                               "targets": targets}}


def _disk_feature(fc, f: Disk, biome):
    reps = f.replace or ([biome.top, biome.under] if biome else [fc.t.stone])
    blocks = [full_id(r) for r in reps if not r.startswith("#")]
    tags = [r for r in reps if r.startswith("#")]
    preds = []
    if blocks:
        preds.append({"type": "minecraft:matching_blocks", "blocks": blocks})
    for tg in tags:
        preds.append({"type": "minecraft:matching_block_tag", "tag": tg[1:]})
    target = preds[0] if len(preds) == 1 else {"type": "minecraft:any_of", "predicates": preds}
    r0, r1 = int(f.radius[0]), int(f.radius[1])
    return {"type": "minecraft:disk", "config": {
        "state_provider": {"fallback": simple_provider(f.block), "rules": []}, "target": target,
        "radius": int_provider((max(0, min(8, r0)), max(0, min(8, r1)))), "half_height": 2}}


def _lake_feature(fc, f: Lake, biome):
    barrier = f.border or (biome.under if biome else fc.t.stone)
    return {"type": "minecraft:lake", "config": {"fluid": simple_provider(f.fluid), "barrier": simple_provider(barrier)}}


def _geode_feature(fc, f: Geode):
    crystals = f.crystals or []
    inner = [state(c, facing="up") if (fc.ctx.kind(c) == "crystal_cluster" or c.endswith("_bud") or c.endswith("amethyst_cluster"))
             else state(c) for c in crystals]
    return {"type": "minecraft:geode", "config": {
        "blocks": {"filling_provider": simple_provider("minecraft:air"), "inner_layer_provider": simple_provider(f.inner),
                   "alternate_inner_layer_provider": simple_provider(f.budding or f.inner),
                   "middle_layer_provider": simple_provider(f.middle), "outer_layer_provider": simple_provider(f.outer),
                   "inner_placements": inner, "cannot_replace": "#minecraft:features_cannot_replace",
                   "invalid_blocks": "#minecraft:geode_invalid_blocks"},
        "layers": {"filling": 1.7, "inner_layer": 2.2, "middle_layer": 3.2, "outer_layer": 4.2},
        "crack": {"generate_crack_chance": 0.95, "base_crack_size": 2.0, "crack_point_offset": 2},
        "use_potential_placements_chance": 0.35 if inner else 0.0, "use_alternate_layer0_chance": 0.083 if f.budding else 0.0,
        "placements_require_layer0_alternate": bool(f.budding), "outer_wall_distance": int_provider((4, 6)),
        "distribution_points": int_provider((3, 4)), "point_offset": int_provider((1, 2)), "min_gen_offset": -16,
        "max_gen_offset": 16, "noise_multiplier": 0.05, "invalid_blocks_threshold": 1}}


def build_feature(fc, f, biome, ore_tag):
    """-> (configured feature JSON or None, placement list, step)"""
    name = type(f).__name__
    step = STEP.get(name, 9)
    if isinstance(f, Tree):
        return _tree_feature(fc, f, biome), placement(fc, f, ground_check=True, solid_below=True), step
    if isinstance(f, GiantPlant):
        return _giant_feature(fc, f, biome), placement(fc, f, ground_check=True, solid_below=True), step
    if isinstance(f, Patch):
        ref = f.block or (f.blocks[0][0] if f.blocks else "")
        if fc.ctx.kind(ref) == "vine":
            if java_multiface_vines():
                return _vine_feature(fc, f), placement(fc, f), 7
        return _patch_feature(fc, f), placement(fc, f), step
    if isinstance(f, Ore):
        mods = []
        if f.chance and f.chance > 1:
            mods.append({"type": "minecraft:rarity_filter", "chance": int(f.chance)})
        c = _count(f.count)
        if c:
            mods.append(c)
        mods.append({"type": "minecraft:in_square"})
        a, b = f.y if f.y else (fc.min_y, fc.t.height + int(fc.t.amplitude))
        mods.append(_hr(a, b))
        mods.append({"type": "minecraft:biome"})
        return _ore_feature(fc, f, ore_tag), mods, step
    if isinstance(f, Disk):
        mods = []
        if f.chance and f.chance > 1:
            mods.append({"type": "minecraft:rarity_filter", "chance": int(f.chance)})
        c = _count(f.count)
        if c:
            mods.append(c)
        if f.where == "surface" and fc.layered:
            mods = [m for m in mods if m["type"] != "minecraft:count"]
            mods.append({"type": "minecraft:count_on_every_layer", "count": _count_value(f.count)})
            mods.append({"type": "minecraft:random_offset", "xz_spread": 0, "y_spread": -1})
        else:
            mods.append({"type": "minecraft:in_square"})
            mods.append({"type": "minecraft:heightmap", "heightmap": "OCEAN_FLOOR_WG"})
            if f.where == "underwater":
                mods.append({"type": "minecraft:block_predicate_filter",
                             "predicate": {"type": "minecraft:matching_fluids", "fluids": ["minecraft:water"]}})
            else:
                mods.append({"type": "minecraft:random_offset", "xz_spread": 0, "y_spread": -1})
        mods.append({"type": "minecraft:biome"})
        return _disk_feature(fc, f, biome), mods, step
    if isinstance(f, Boulder):
        return _boulder_feature(fc, f), placement(fc, f, ground_check=f.where == "surface"), step
    if isinstance(f, Spire):
        return _spire_feature(fc, f), placement(fc, f, solid_below=f.where == "surface"), step
    if isinstance(f, CrystalCluster):
        return _crystal_feature(fc, f), placement(fc, f), step
    if isinstance(f, Structure):
        return _structure_feature(fc, f), placement(fc, f, ground_check=f.where == "surface"), step
    if isinstance(f, Lake):
        mods = []
        mods.append({"type": "minecraft:rarity_filter", "chance": int(f.chance) if f.chance else 12})
        mods.append({"type": "minecraft:in_square"})
        # minecraft:lake fills origin..origin+15 and (for water) samples biomes there with zoom fuzz, which can
        # reach 2 chunks east/south of the chunk being decorated -> "Requested chunk unavailable" crash. Centre
        # the 16x16 footprint on the chunk instead (vanilla only ships lava lakes, which skip the biome lookup).
        mods.append({"type": "minecraft:random_offset", "xz_spread": -8, "y_spread": 0})
        if f.where in ("cave_floor", "anywhere", "air") or fc.layered:
            a, b = fc.y_range(f, "cave_floor")
            mods.append(_hr(a, b))
        else:
            mods.append({"type": "minecraft:heightmap", "heightmap": "WORLD_SURFACE_WG"})
        mods.append({"type": "minecraft:biome"})
        return _lake_feature(fc, f, biome), mods, step
    if isinstance(f, Geode):
        mods = [{"type": "minecraft:rarity_filter", "chance": int(f.chance) if f.chance else 24}, {"type": "minecraft:in_square"}]
        a, b = f.y if f.y else (fc.min_y + 6, max(fc.min_y + 20, fc.t.height - 24))
        mods.append(_hr(a, b))
        mods.append({"type": "minecraft:biome"})
        return _geode_feature(fc, f), mods, step
    raise TypeError(f"unknown feature type {name}")


# ----------------------------------------------------------------------------------------------- shared features
ORES = [  # name, size, count, (lo, hi) as fractions of the column span, distribution
    ("coal", 17, 16, (0.35, 1.0), "uniform"),
    ("iron", 9, 10, (0.0, 0.65), "trapezoid"),
    ("copper", 10, 8, (0.25, 0.75), "trapezoid"),
    ("gold", 9, 4, (0.0, 0.35), "trapezoid"),
    ("redstone", 8, 4, (0.0, 0.22), "uniform"),
    ("lapis", 7, 2, (0.0, 0.4), "trapezoid"),
    ("diamond", 6, 5, (-0.15, 0.2), "trapezoid"),
    ("emerald", 3, 3, (0.7, 1.0), "uniform"),
]


def shared_features(fc, ore_tag, deep_tag):
    """[(id, step)] written for this dimension and used by every biome."""
    ctx, dim, t = fc.ctx, fc.dim, fc.t
    out = []
    if t.ores:
        lo_y = fc.min_y
        hi_y = min(fc.top - 8, t.height + int(t.amplitude * 1.5))
        span = max(16, hi_y - lo_y)
        for name, size, count, (a, b), dist in ORES:
            y0, y1 = int(lo_y + a * span), int(lo_y + b * span)
            targets = [{"target": {"predicate_type": "minecraft:tag_match", "tag": ore_tag}, "state": state(f"minecraft:{name}_ore")}]
            if deep_tag:
                targets.append({"target": {"predicate_type": "minecraft:tag_match", "tag": deep_tag},
                                "state": state(f"minecraft:deepslate_{name}_ore")})
            cf = {"type": "minecraft:ore", "config": {"size": size, "discard_chance_on_air_exposure": 0.0, "targets": targets}}
            fid = f"{dim.id}/ore_{name}"
            write_json(ctx.data("worldgen", "configured_feature", fid + ".json"), cf)
            height = {"type": f"minecraft:{dist}", "min_inclusive": {"absolute": min(y0, y1 - 1)}, "max_inclusive": {"absolute": y1}}
            pf = {"feature": f"{NS}:{fid}", "placement": [{"type": "minecraft:count", "count": count}, {"type": "minecraft:in_square"},
                                                          {"type": "minecraft:height_range", "height": height}, {"type": "minecraft:biome"}]}
            write_json(ctx.data("worldgen", "placed_feature", fid + ".json"), pf)
            out.append((f"{NS}:{fid}", 6))
    P = t.params or {}
    default_springs = 8 if t.style in ("mountains", "hills", "terraces", "canyons", "pillars", "sky_islands", "spikes") else 0
    springs = int(P.get("springs", default_springs))
    fluid = P.get("spring_fluid") or (t.fluid if t.fluid != "minecraft:air" else "minecraft:water")
    if springs > 0 and fluid in ("minecraft:water", "minecraft:lava"):
        valid = sorted({full_id(t.stone)} | {full_id(b.under) for b in dim.biomes if not ctx.kind(b.under) == "sand"}
                       | {full_id(b.stone) for b in dim.biomes if b.stone})
        cf = {"type": "minecraft:spring_feature", "config": {"state": {"Name": fluid, "Properties": {"falling": "true"}},
                                                             "requires_block_below": True, "rock_count": 4, "hole_count": 1,
                                                             "valid_blocks": valid}}
        fid = f"{dim.id}/spring"
        write_json(ctx.data("worldgen", "configured_feature", fid + ".json"), cf)
        pf = {"feature": f"{NS}:{fid}", "placement": [{"type": "minecraft:count", "count": springs}, {"type": "minecraft:in_square"},
                                                      _hr(fc.min_y + 4, fc.top - 16), {"type": "minecraft:biome"}]}
        write_json(ctx.data("worldgen", "placed_feature", fid + ".json"), pf)
        out.append((f"{NS}:{fid}", 8))
    return out


def emit_features(ctx, dim, ore_tag, deep_tag):
    """Write all features of a dimension. Returns {biome_id: [[ids per step] x 11]}."""
    fc = FCtx(ctx, dim)
    shared = shared_features(fc, ore_tag, deep_tag)
    per_biome = {}
    vsteps = vanilla_steps()
    vanilla_order = {}   # (step) -> [ids] first-appearance order
    for b in dim.biomes:
        steps = [[] for _ in range(N_STEPS)]
        for fid, st in shared:
            steps[st].append(fid)
        for i, f in enumerate(b.features):
            if isinstance(f, Vanilla):
                vid = f.id if ":" in f.id else "minecraft:" + f.id
                st = int(vsteps.get(vid, 9))
                vanilla_order.setdefault(st, [])
                if vid not in vanilla_order[st]:
                    vanilla_order[st].append(vid)
                if vid not in steps[st]:
                    steps[st].append(vid)
                continue
            try:
                cf, mods, st = build_feature(fc, f, b, ore_tag)
            except Exception as e:  # never let one bad feature kill the dimension
                warn(f"{dim.id}/{b.id}: feature #{i} ({type(f).__name__}) failed: {e}")
                continue
            if cf is None or mods is None:
                continue
            kind = type(f).__name__.lower()
            fid = f"{dim.id}/{b.id}/{i}_{kind}"
            write_json(ctx.data("worldgen", "configured_feature", fid + ".json"), cf)
            write_json(ctx.data("worldgen", "placed_feature", fid + ".json"), {"feature": f"{NS}:{fid}", "placement": mods})
            steps[st].append(f"{NS}:{fid}")
        if b.snowy:
            steps[10].append("minecraft:freeze_top_layer")
        per_biome[b.id] = steps
    # globally consistent order: shared (fixed) < vanilla (first appearance) < biome-local (unique per biome)
    shared_rank = {fid: i for i, (fid, _) in enumerate(shared)}
    for b_id, steps in per_biome.items():
        for st in range(N_STEPS):
            vo = vanilla_order.get(st, [])
            vo_all = vo + (["minecraft:freeze_top_layer"] if st == 10 else [])

            def rank(fid, _vo=vo_all):
                if fid in shared_rank:
                    return (0, shared_rank[fid])
                if fid in _vo:
                    return (1, _vo.index(fid))
                return (2, 0)
            steps[st] = sorted(steps[st], key=lambda x: (rank(x), steps[st].index(x)))
    return per_biome
