"""Content pipeline entry point (module W1): dimension specs (dims/*.py) -> data pack + assets + content spec.

    build(res_dir, lang, sound_table, only=(), gallery=False) -> {"dimensions", "blocks", "items", "creatures"}

Per dimension this writes blocks/items (assets, loot, tags, lang), worldgen (dimension, dimension_type, timeline,
noise_settings, noises, carvers, biomes, configured/placed features), sky textures, and calls the creature module
(gen.content.creatures, module C) when available. Specs with validation errors are skipped with a clear report so a
single broken dimension never breaks the data pack.
"""
from __future__ import annotations

import importlib
import os
import pkgutil
import sys
import time
import traceback

from . import common
from .common import NS, Ctx, Tags, full_id, warn

DIMS_PKG = __name__ + ".dims"


def load_dimensions():
    """Import every dims/<id>.py that defines DIMENSION. Returns (dims, import_errors)."""
    from . import dims as dims_pkg
    out, errors = [], []
    for m in sorted(pkgutil.iter_modules(dims_pkg.__path__), key=lambda m: m.name):
        if m.name.startswith("_"):
            continue
        try:
            mod = importlib.import_module(f"{DIMS_PKG}.{m.name}")
        except Exception as e:
            errors.append(f"dims/{m.name}.py failed to import: {e!r}")
            traceback.print_exc(limit=3, file=sys.stderr)
            continue
        dim = getattr(mod, "DIMENSION", None)
        if dim is None:
            continue
        if getattr(mod, "TEST_ONLY", False):
            # dev/test dimensions (e.g. the creature lab) ship only in --gallery builds
            dim._test_only = True
        out.append(dim)
    return out, errors


def _creature_module():
    try:
        from . import creatures as C  # module C, written concurrently
    except Exception as e:
        warn(f"creatures module unavailable ({e!r}) - creatures and their spawns are skipped")
        return None
    if not hasattr(C, "build_creatures") or not hasattr(C, "spawn_category"):
        warn("creatures module lacks build_creatures/spawn_category - creatures skipped")
        return None
    return C


def _dimension_info(dim, terrain, sky_entries, creature_ids):
    from .worldgen import default_arrival
    t = dim.terrain
    arrival = dim.arrival or default_arrival(t)
    if dim.arrival_y is not None:
        ay = int(dim.arrival_y)
    elif arrival == "void" or t.fluid == "minecraft:air":
        ay = int(t.height + 2)
    else:
        # never build an emergency platform under the sea
        ay = int(max(t.height, t.sea_level) + 2)
    info = {
        "id": dim.id, "code": dim.code, "name": dim.name, "tagline": dim.tagline, "description": dim.description,
        "danger": int(dim.danger), "color": dim.color,
        "platform": full_id(dim.platform or t.stone),
        "raft": full_id(dim.platform or (dim.terrain.params or {}).get("beach_block")
                        or (dim.biomes[0].top if dim.biomes else None) or t.stone),
        "arrival": arrival, "arrivalY": ay,
        "effects": list(dim.effects), "sky": sky_entries,
        "creatures": creature_ids, "biomes": [b.id for b in dim.biomes],
        "style": t.style,
    }
    if dim.icon:
        info["icon"] = full_id(dim.icon)
    if dim.music:
        info["music"] = dim.music
    if dim.ambient:
        info["ambient"] = dim.ambient
    return info


def build_dimension(dim, res_dir, lang, sound_table, tags, C, spec):
    from . import biomes as B
    from . import blocks as BL
    from . import features as F
    from . import items as IT
    from . import sky_art as SA
    from . import worldgen as W

    ctx = Ctx(res_dir, lang, sound_table, tags, dim)
    for b in dim.blocks:
        spec["blocks"].append(BL.emit_block(ctx, b))
    for it in dim.items:
        spec["items"].append(IT.emit_item(ctx, it))
    BL.emit_recipes(ctx, dim)

    # creatures (module C)
    creature_cat, creature_ids, creatures_ok = {}, [], False
    if C is not None and dim.creatures:
        try:
            cspecs = C.build_creatures(dim, res_dir, lang) or []
            spec["creatures"].extend(cspecs)
            built = {c.get("id") for c in cspecs}
            for c in dim.creatures:
                if c.id in built:
                    creature_cat[c.id] = C.spawn_category(c)
                    creature_ids.append(c.id)
            creatures_ok = common.java_registers_creatures()
            if not creatures_ok:
                warn(f"{dim.id}: Java does not register spec creatures yet - their biome spawners are left out")
        except Exception as e:
            warn(f"{dim.id}: creatures.build_creatures failed ({e!r}) - creatures/spawns skipped")
            traceback.print_exc(limit=4, file=sys.stderr)

    # worldgen
    terrain, res = W.emit_noise_settings(ctx, dim)
    carvers = W.emit_carvers(ctx, dim, terrain)
    ore_tag = W.ore_replace_tag(ctx, dim)
    deep_tag = f"{NS}:deep_ore_replaceables/{dim.id}" if dim.terrain.deepslate else None
    per_biome = F.emit_features(ctx, dim, ore_tag, deep_tag)
    for b in dim.biomes:
        spawners = B.build_spawners(ctx, dim, b, creature_cat, creatures_ok)
        B.emit_biome(ctx, dim, b, per_biome[b.id], carvers, spawners)
    W.emit_dimension_type(ctx, dim, terrain)
    W.emit_dimension(ctx, dim, W.biome_points(dim))
    sky_entries = SA.emit_sky(ctx, dim)
    lang[f"dimension.{NS}.{dim.id}"] = dim.name
    spec["dimensions"].append(_dimension_info(dim, terrain, sky_entries, creature_ids))


def _soften_tags(res_dir):
    """Make every generated tag entry optional ({"id": x, "required": false}).

    A tag naming a block/entity that is not registered (a creature whose Java side is not ready, a stale entry...)
    otherwise fails as a whole, and vanilla content depending on it (carvers, enchantments) then breaks world loading.
    """
    import json as _json
    data = os.path.join(res_dir, "data")
    if not os.path.isdir(data):
        return
    for ns in os.listdir(data):
        root = os.path.join(data, ns, "tags")
        for dp, _, fns in os.walk(root):
            for fn in fns:
                if not fn.endswith(".json"):
                    continue
                p = os.path.join(dp, fn)
                try:
                    with open(p, encoding="utf-8") as f:
                        d = _json.load(f)
                except (OSError, ValueError):
                    continue
                vals = d.get("values")
                if not isinstance(vals, list) or all(isinstance(v, dict) for v in vals):
                    continue
                d["values"] = [v if isinstance(v, dict) else {"id": v, "required": False} for v in vals]
                with open(p, "w", encoding="utf-8") as f:
                    _json.dump(d, f, indent=2)
                    f.write("\n")


def build(res_dir, lang, sound_table, only=(), gallery=False):
    t0 = time.time()
    spec = {"dimensions": [], "blocks": [], "items": [], "creatures": []}
    dims, import_errors = load_dimensions()
    for e in import_errors:
        print(f"  [content] ERROR: {e}", file=sys.stderr)
    if gallery or os.environ.get("PORTALGUN_GALLERY") == "1":
        from . import gallery as G
        dims.extend(G.gallery_dimensions())
    else:
        dims = [d for d in dims if not getattr(d, "_test_only", False)]
    from .validate import validate_all
    reports, gerr = validate_all(dims)
    for e in gerr:
        print(f"  [content] ERROR: {e}", file=sys.stderr)
    only = [o for o in (only or []) if o]
    selected = [d for d in dims if not only or d.id in only]
    if only:
        missing = set(only) - {d.id for d in dims}
        for m in sorted(missing):
            warn(f"--only: no dimension {m!r}")
    common.GLOBAL_BLOCKS.clear()
    for d in dims:
        for b in d.blocks:
            common.GLOBAL_BLOCKS.setdefault(b.id, b)
    if not os.environ.get("PORTALGUN_JAVA_TYPES"):
        # all Java modules are integrated now: a missing capability means a Java regression, not work in progress
        missing = [n for n in common.ALL_JAVA_FEATURES + common.ALL_JAVA_DFS if not common.has_java(n)]
        if missing:
            warn(f"Java side does not register portalgun:{', portalgun:'.join(missing)} - terrain/features fall back "
                 f"to vanilla-only versions")
        if not common.java_registers_creatures():
            warn("Java side does not register spec creatures - biome spawners are left out")
        if not common.java_multiface_vines():
            warn("Java vine block is not multiface - vine features fall back to simple patches")
    tags = Tags()
    C = _creature_module() if any(d.creatures for d in selected) else None
    built = 0
    for d in selected:
        rep = reports.get(d.id)
        for w in (rep.warnings if rep else []):
            print(f"  [content] warning: {w}", file=sys.stderr)
        if rep and rep.errors:
            print(f"  [content] SKIPPING dimension {d.id!r} - {len(rep.errors)} spec error(s):", file=sys.stderr)
            for e in rep.errors:
                print(f"      - {e}", file=sys.stderr)
            continue
        try:
            build_dimension(d, res_dir, lang, sound_table, tags, C, spec)
            built += 1
        except Exception as e:
            print(f"  [content] ERROR building {d.id}: {e!r}", file=sys.stderr)
            traceback.print_exc(file=sys.stderr)
    tags.add("block", f"{NS}:hazards", "minecraft:magma_block")
    tags.write(res_dir)
    _soften_tags(res_dir)
    try:
        from .selfcheck import check
        problems = check(res_dir, spec)
    except Exception as e:  # the checker must never break generation
        problems = []
        warn(f"selfcheck crashed: {e!r}")
    for p in problems[:60]:
        print(f"  [content] SELFCHECK: {p}", file=sys.stderr)
    if len(problems) > 60:
        print(f"  [content] SELFCHECK: ... {len(problems) - 60} more", file=sys.stderr)
    print(f"  content: {built}/{len(selected)} dimensions built in {time.time() - t0:.1f}s "
          f"({len(spec['blocks'])} blocks, {len(spec['items'])} items, {len(spec['creatures'])} creatures)")
    return spec
