"""Spec validation: catch mistakes in dims/*.py early with clear messages.

validate_all(dims) -> {dim_id: [errors]}, [warnings]
A dimension with errors is skipped by build() (so one broken spec never breaks the whole data pack).
"""
from __future__ import annotations

import os
import re

from . import dsl
from .common import NS, full_id, tex_fn
from .dsl import (BLOCK_KINDS, TERRAIN_STYLES, Boulder, CrystalCluster, Disk, Geode, GiantPlant, Lake, Ore, Patch, Spire,
                  Structure, Tex, Tree, Vanilla)

DATA_DIR = os.path.join(os.path.dirname(__file__), "data")
ID_RE = re.compile(r"^[a-z0-9_]+$")
HEX_RE = re.compile(r"^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$")

WHERE = {"surface", "underwater", "cave_floor", "cave_ceiling", "air", "anywhere", "water_surface"}
TREE_SHAPES = {"oak", "fancy", "birch", "spruce", "pine", "acacia", "dark_oak", "jungle", "mega_jungle", "cherry", "bush",
               "palm", "twisted", "mushroom_like"}
PLANT_SHAPES = {"dome", "flat", "sphere", "cone", "flower", "puff", "umbrella", "palm", "tuft"}
STRUCT_ROLES = {"arch": {"main"}, "ring": {"main"}, "gear": {"main", "axle"}, "ribcage": {"bone", "spine"},
                "lily_pad": {"pad", "flower"}, "monolith": {"main"}, "geyser": {"vent", "mound"},
                "cuboids": {"main", "alt", "trim"}, "tendril": {"main", "tip"}, "nest": {"main", "egg"}}
SKYBOXES = {"overworld", "end", "none"}
MOON_PHASES = {"full_moon", "waning_gibbous", "third_quarter", "waning_crescent", "new_moon", "waxing_crescent",
               "first_quarter", "waxing_gibbous"}
EFFECTS = {"low_gravity", "floaty", "high_gravity", "lightning", "darkness", "water_breathing", "glitch", "heat"}
SOUNDS = {"stone", "grass", "wood", "sand", "gravel", "glass", "amethyst", "slime", "wool", "metal", "bone", "moss", "snow",
          "coral", "honey", "mud", "nether", "fungus", "basalt", "calcite", "sculk", "chain", "copper", "cherry", "bamboo",
          "froglight", "deepslate", "tuff", "dripstone", "soul_sand", "powder_snow", "cave_vines", "vine", "lantern",
          "netherrack", "nether_bricks", "shroomlight", "weeping_vines", "roots", "nylium", "glow_lichen", "azalea",
          "flowering_azalea", "big_dripleaf", "small_dripleaf", "hanging_roots", "rooted_dirt", "mangrove_roots",
          "muddy_mangrove_roots", "mud_bricks", "packed_mud", "frogspawn", "decorated_pot", "suspicious_sand",
          "suspicious_gravel", "spore_blossom", "moss_carpet", "pointed_dripstone", "candle", "lodestone", "ancient_debris",
          "netherite_block", "nether_gold_ore", "nether_ore", "wart_block", "stem", "polished_deepslate", "deepslate_bricks",
          "deepslate_tiles", "tuff_bricks", "polished_tuff", "heavy_core", "vault", "trial_spawner", "cobweb",
          "resin", "resin_bricks", "pale_hanging_moss", "dried_ghast", "iron", "nether_wood", "bamboo_wood", "cherry_wood",
          "cherry_leaves", "hard_crop", "crop", "sweet_berry_bush", "nether_wart", "lily_pad", "scaffolding", "ladder",
          "anvil", "chiseled_bookshelf", "sniffer_egg", "sculk_sensor", "sculk_catalyst", "sculk_vein", "sculk_shrieker",
          "glass", "ice", "medium_amethyst_bud", "small_amethyst_bud", "large_amethyst_bud", "amethyst_cluster", "leaf_litter",
          "dry_grass", "cactus_flower", "firefly_bush", "mossy"}
SIMPLE_PARTICLES = set("""angry_villager bubble cloud copper_fire_flame crit damage_indicator dripping_lava falling_lava
landing_lava dripping_water falling_water elder_guardian enchanted_hit enchant end_rod explosion_emitter explosion gust
small_gust gust_emitter_large gust_emitter_small sonic_boom firework fishing flame infested cherry_leaves pale_oak_leaves
sculk_soul sculk_charge_pop soul_fire_flame soul happy_villager composter heart item_slime item_cobweb item_snowball
large_smoke lava mycelium note poof portal rain smoke white_smoke sneeze spit squid_ink sweep_attack totem_of_undying
underwater splash witch bubble_pop current_down bubble_column_up nautilus dolphin campfire_cosy_smoke campfire_signal_smoke
dripping_honey falling_honey landing_honey falling_nectar falling_spore_blossom ash crimson_spore warped_spore
spore_blossom_air dripping_obsidian_tear falling_obsidian_tear landing_obsidian_tear reverse_portal white_ash small_flame
snowflake dripping_dripstone_lava falling_dripstone_lava dripping_dripstone_water falling_dripstone_water glow_squid_ink
glow wax_on wax_off electric_spark scrape egg_crack dust_plume trial_spawner_detection trial_spawner_detection_ominous
vault_connection ominous_spawning raid_omen trial_omen firefly""".split())
AMBIENT_LOOPS = {"wind_howl", "alien_hum", "bubbling", "crystal_chimes", "wet_squelch", "electric_buzz", "deep_ocean",
                 "volcanic_rumble", "eerie_choir", "jungle_night", "neon_synth", "glitch_noise", "cosmic_drone", "cozy_breeze",
                 "clockwork", "candy_chime", "hive_drone", "tidal_waves", "dark_void", "sizzle_toxic"}

_LISTS = {}
_JAVA_LOOKUPS = None


def java_lookups():
    """(sound names, map colour names) accepted by W2's BlockLookups (parsed from the Java source), or (None, None)."""
    global _JAVA_LOOKUPS
    if _JAVA_LOOKUPS is None:
        from .common import JAVA_MAIN
        p = os.path.join(JAVA_MAIN, "dev", "portalgun", "block", "BlockLookups.java")
        try:
            with open(p, encoding="utf-8") as f:
                src = f.read()
            sounds = set(re.findall(r'\bs\("([a-z0-9_]+)"', src))
            maps = set(re.findall(r'Map\.entry\("([a-z0-9_]+)"', src)) | set(re.findall(r'MAP_COLORS\.put\("([a-z0-9_]+)"', src))
            _JAVA_LOOKUPS = (sounds or None, maps or None)
        except OSError:
            _JAVA_LOOKUPS = (None, None)
    return _JAVA_LOOKUPS


def vanilla(name):
    if name not in _LISTS:
        p = os.path.join(DATA_DIR, f"vanilla_{name}.txt")
        with open(p) as f:
            _LISTS[name] = {line.strip() for line in f if line.strip()}
    return _LISTS[name]


def _ambient_loops():
    try:
        from gen import sounds
        names = getattr(sounds, "AMBIENT_NAMES", None)
        if names:
            return set(names)
    except Exception:
        pass
    return AMBIENT_LOOPS


class Report:
    def __init__(self, dim_id):
        self.dim = dim_id
        self.errors = []
        self.warnings = []

    def err(self, where, msg):
        self.errors.append(f"{self.dim}: {where}: {msg}")

    def warn(self, where, msg):
        self.warnings.append(f"{self.dim}: {where}: {msg}")


def _check_color(r, where, c, allow_alpha=True):
    if c is None:
        return
    if not isinstance(c, str) or not HEX_RE.match(c) or (not allow_alpha and len(c) == 9):
        r.err(where, f"bad colour {c!r} (expected '#rrggbb'{' or #aarrggbb' if allow_alpha else ''})")


def _check_tex(r, where, t):
    if not isinstance(t, Tex):
        r.err(where, f"texture must be tex(...), got {type(t).__name__}")
        return
    if tex_fn(t.fn) is None:
        r.err(where, f"unknown texture generator {t.fn!r} (not in gen.textures or textures_extra)")
    for a in list(t.args) + list(t.kwargs.values()):
        if isinstance(a, Tex):
            _check_tex(r, where, a)


class Refs:
    """Resolves block / item refs for one dimension."""

    def __init__(self, dim, global_blocks, global_items):
        self.dim = dim
        self.local_blocks = {b.id for b in dim.blocks}
        self.local_items = {i.id for i in dim.items}
        self.global_blocks = global_blocks
        self.global_items = global_items

    def block_ok(self, ref):
        if not isinstance(ref, str) or not ref:
            return False
        if ref.startswith("#"):
            return True
        try:
            fid = full_id(ref)
        except ValueError:
            return False
        ns, path = fid.split(":", 1)
        if ns == "minecraft":
            return path in vanilla("blocks") or path in ("air", "cave_air", "void_air", "water", "lava")
        if ns == NS:
            if ":" not in ref.split("[")[0]:
                return path in self.local_blocks
            return path in self.global_blocks
        return True   # other mods: can't check

    def item_ok(self, ref):
        if not isinstance(ref, str) or not ref:
            return False
        fid = full_id(ref)
        ns, path = fid.split(":", 1)
        if ns == "minecraft":
            return path in vanilla("items")
        if ns == NS:
            return path in self.global_items or path in self.global_blocks or path in self.local_items or path in self.local_blocks
        return True


def validate_dimension(dim, global_blocks, global_items, creature_ids_by_dim):
    r = Report(getattr(dim, "id", "?"))
    if not isinstance(dim, dsl.Dimension):
        r.err("DIMENSION", "is not a dsl.Dimension")
        return r
    refs = Refs(dim, global_blocks, global_items)
    if not ID_RE.match(dim.id or ""):
        r.err("id", f"bad dimension id {dim.id!r} (lower_snake_case)")
    if not (1 <= int(dim.danger) <= 5):
        r.err("danger", f"must be 1..5, got {dim.danger}")
    _check_color(r, "color", dim.color, False)
    for e in dim.effects:
        if e not in EFFECTS:
            r.warn("effects", f"unknown effect {e!r} (known: {', '.join(sorted(EFFECTS))})")
    # terrain
    t = dim.terrain
    if t.style not in TERRAIN_STYLES:
        r.err("terrain.style", f"unknown style {t.style!r} (one of {', '.join(TERRAIN_STYLES)})")
    if not refs.block_ok(t.stone):
        r.err("terrain.stone", f"unknown block {t.stone!r}")
    if t.fluid not in ("minecraft:water", "minecraft:lava", "minecraft:air") and not refs.block_ok(t.fluid):
        r.err("terrain.fluid", f"unknown fluid block {t.fluid!r}")
    if t.deepslate and not refs.block_ok(t.deepslate):
        r.err("terrain.deepslate", f"unknown block {t.deepslate!r}")
    if t.min_y % 16 or t.total_height % 16:
        r.err("terrain", f"min_y ({t.min_y}) and total_height ({t.total_height}) must be multiples of 16")
    if t.total_height < 64 or t.min_y + t.total_height > 2032 or t.min_y < -2032:
        r.err("terrain", "world height out of range")
    if not (t.min_y <= t.sea_level <= t.min_y + t.total_height):
        r.err("terrain.sea_level", f"{t.sea_level} outside the world ({t.min_y}..{t.min_y + t.total_height})")
    if t.style in ("sky_islands", "planetoids", "layers") and t.fluid != "minecraft:air" and t.sea_level > t.min_y + 8:
        r.warn("terrain", f"{t.style} world with a {t.fluid} sea at y={t.sea_level} will flood the void - "
                          "use fluid='minecraft:air' or a low sea_level")
    for k in ("peak_block", "beach_block", "cliff_block", "ceiling_block"):
        if k in (t.params or {}) and not refs.block_ok(t.params[k]):
            r.err(f"terrain.params.{k}", f"unknown block {t.params[k]!r}")
    # sky
    s = dim.sky
    for k in ("sky_color", "fog_color", "water_fog_color", "sky_light_color"):
        _check_color(r, f"sky.{k}", getattr(s, k), False)
    _check_color(r, "sky.cloud_color", s.cloud_color)
    _check_color(r, "sky.sunrise_color", s.sunrise_color)
    if s.skybox not in SKYBOXES:
        r.err("sky.skybox", f"{s.skybox!r} not in {sorted(SKYBOXES)}")
    from .worldgen import TIMES
    if not (s.time == "cycle" or isinstance(s.time, int) or s.time in TIMES):
        r.err("sky.time", f"{s.time!r}: use 'cycle', ticks or one of {sorted(TIMES)}")
    if s.moon_phase and s.moon_phase not in MOON_PHASES:
        r.err("sky.moon_phase", f"{s.moon_phase!r} not in {sorted(MOON_PHASES)}")
    from .sky_art import GENERATORS
    for i, b in enumerate(s.bodies):
        if b.texture not in GENERATORS:
            r.err(f"sky.bodies[{i}]", f"unknown generator {b.texture!r} (one of {', '.join(sorted(GENERATORS))})")
        for c in b.colors:
            _check_color(r, f"sky.bodies[{i}].colors", c)
    if s.fog_start is not None and s.fog_end is not None and s.fog_start > s.fog_end:
        r.warn("sky", "fog_start > fog_end")
    # blocks
    ids = set()
    for b in dim.blocks:
        w = f"block {b.id}"
        if not ID_RE.match(b.id):
            r.err(w, "bad id")
        if b.id in ids:
            r.err(w, "duplicate block id in this dimension")
        ids.add(b.id)
        if b.kind not in BLOCK_KINDS:
            r.err(w, f"unknown kind {b.kind!r}")
            continue
        for role in BLOCK_KINDS[b.kind]:
            if role not in b.textures:
                r.err(w, f"kind {b.kind!r} needs texture role {role!r} (has {sorted(b.textures)})")
        for role, tx in b.textures.items():
            if role not in BLOCK_KINDS[b.kind]:
                r.warn(w, f"texture role {role!r} unused by kind {b.kind!r}")
            _check_tex(r, f"{w}.textures.{role}", tx)
        jsounds, jmaps = java_lookups()
        if b.sound not in (jsounds or SOUNDS):
            r.warn(w, f"sound {b.sound!r} is not a SoundType name known to BlockLookups (falls back to the kind default)")
        if jmaps and b.map_color not in jmaps:
            r.warn(w, f"map_color {b.map_color!r} is not a MapColor name known to BlockLookups")
        if not (0 <= b.light <= 15):
            r.err(w, "light must be 0..15")
        if b.drop and not refs.item_ok(b.drop):
            r.err(w, f"drop {b.drop!r} is not a known item")
        if b.fruit and not refs.item_ok(b.fruit):
            r.err(w, f"fruit {b.fruit!r} is not a known item")
        if b.particle and b.particle.split(":")[-1] not in SIMPLE_PARTICLES and not b.particle.startswith(NS + ":"):
            r.warn(w, f"particle {b.particle!r} is not a simple vanilla particle")
        _check_color(r, f"{w}.tint", b.tint, False)
    # items
    for it in dim.items:
        w = f"item {it.id}"
        if not ID_RE.match(it.id):
            r.err(w, "bad id")
        if it.id in ids:
            r.err(w, "id clashes with a block of this dimension (blocks have items too)")
        ids.add(it.id)
        _check_tex(r, f"{w}.icon", it.icon)
        if it.rarity not in ("common", "uncommon", "rare", "epic"):
            r.err(w, f"rarity {it.rarity!r}")
        if it.kind == "food" and it.food is None:
            r.warn(w, "kind 'food' without food=Food(...)")
    # biomes
    if not dim.biomes:
        r.err("biomes", "a dimension needs at least one biome")
    creature_ids = {c.id for c in dim.creatures}
    bids = set()
    for b in dim.biomes:
        w = f"biome {b.id}"
        if not ID_RE.match(b.id):
            r.err(w, "bad id")
        if b.id in bids:
            r.err(w, "duplicate biome id")
        bids.add(b.id)
        for k in ("top", "under", "underwater", "stone"):
            v = getattr(b, k)
            if v is not None and not refs.block_ok(v):
                r.err(w, f"{k}: unknown block {v!r}")
        for k in ("grass_color", "foliage_color", "water_color", "water_fog_color", "sky_color", "fog_color"):
            _check_color(r, f"{w}.{k}", getattr(b, k), False)
        for k in ("temperature", "humidity"):
            v = getattr(b, k)
            if not (-2 <= v <= 2):
                r.warn(w, f"{k}={v} is far outside -1..1")
        for p, pr in b.particles:
            if p.startswith("dust:"):
                parts = p.split(":")
                if len(parts) < 2 or not HEX_RE.match(parts[1]):
                    r.err(w, f"bad dust particle {p!r} (dust:#rrggbb:scale)")
            elif p.split(":")[-1] not in SIMPLE_PARTICLES and not p.startswith(NS + ":"):
                r.err(w, f"particle {p!r} is not a simple particle type")
            if not (0 <= pr <= 1):
                r.err(w, f"particle probability {pr} not in 0..1")
        if b.ambient and b.ambient not in _ambient_loops():
            r.err(w, f"ambient {b.ambient!r} is not an ambient loop ({', '.join(sorted(_ambient_loops()))})")
        if b.music and b.music.startswith("minecraft:") and b.music.split(":", 1)[1] not in vanilla("sounds"):
            r.err(w, f"music {b.music!r} is not a vanilla sound event")
        for blk, thr in b.surface_noise:
            if not refs.block_ok(blk):
                r.err(w, f"surface_noise block {blk!r} unknown")
        for i, f in enumerate(b.features):
            _check_feature(r, refs, f"{w}.features[{i}]", f, dim)
        for sp in b.spawns:
            c = sp.creature
            if ":" in c and not c.startswith(NS + ":"):
                if c.startswith("minecraft:") and c.split(":", 1)[1] not in vanilla("entities"):
                    r.err(w, f"spawn {c!r} is not a vanilla entity")
            elif c.split(":")[-1] not in creature_ids:
                r.err(w, f"spawn {c!r} is not one of this dimension's creatures ({', '.join(sorted(creature_ids))})")
            if sp.weight <= 0:
                r.err(w, f"spawn {c!r} weight must be > 0")
    if dim.ambient and dim.ambient not in _ambient_loops():
        r.err("ambient", f"{dim.ambient!r} is not an ambient loop")
    if dim.music and dim.music.startswith("minecraft:") and dim.music.split(":", 1)[1] not in vanilla("sounds"):
        r.err("music", f"{dim.music!r} is not a vanilla sound event")
    if dim.platform and not refs.block_ok(dim.platform):
        r.err("platform", f"unknown block {dim.platform!r}")
    if dim.icon and not refs.item_ok(dim.icon):
        r.warn("icon", f"{dim.icon!r} is not a known item")
    if dim.arrival and dim.arrival not in ("surface", "cave", "void"):
        r.err("arrival", f"{dim.arrival!r} not in surface/cave/void")
    for c in dim.creatures:
        for d in c.drops:
            if not refs.item_ok(d.item):
                r.err(f"creature {c.id}", f"drop {d.item!r} is not a known item")
    return r


def _check_feature(r, refs, w, f, dim):
    if f.where not in WHERE:
        r.err(w, f"where={f.where!r} not in {sorted(WHERE)}")
    cnt = f.count
    if isinstance(cnt, (tuple, list)):
        if len(cnt) != 2 or cnt[0] > cnt[1] or cnt[0] < 0:
            r.err(w, f"bad count {cnt!r}")
    elif cnt < 0 or cnt > 256:
        r.err(w, f"count {cnt} out of 0..256")
    if f.y and (len(f.y) != 2 or f.y[0] > f.y[1]):
        r.err(w, f"bad y range {f.y!r}")

    def blk(name, v, optional=False):
        if v is None and optional:
            return
        if not refs.block_ok(v):
            r.err(w, f"{name}: unknown block {v!r}")

    if isinstance(f, Tree):
        blk("log", f.log)
        blk("leaves", f.leaves)
        blk("decoration", f.decoration, True)
        if f.shape not in TREE_SHAPES:
            r.err(w, f"tree shape {f.shape!r} not in {sorted(TREE_SHAPES)}")
        for g in f.on or []:
            blk("on", g)
    elif isinstance(f, GiantPlant):
        blk("stem", f.stem)
        blk("head", f.head)
        blk("decoration", f.decoration, True)
        if f.shape not in PLANT_SHAPES:
            r.err(w, f"giant plant shape {f.shape!r} not in {sorted(PLANT_SHAPES)}")
    elif isinstance(f, Patch):
        if f.blocks:
            for b, _ in f.blocks:
                blk("blocks", b)
        else:
            blk("block", f.block)
    elif isinstance(f, Ore):
        blk("block", f.block)
        for x in f.replace:
            blk("replace", x)
    elif isinstance(f, Disk):
        blk("block", f.block)
        for x in f.replace:
            blk("replace", x)
    elif isinstance(f, (Boulder, Spire)):
        for b, _ in f.blocks:
            blk("blocks", b)
        if isinstance(f, Spire):
            blk("tip", f.tip, True)
            blk("cap", f.cap, True)
    elif isinstance(f, CrystalCluster):
        blk("block", f.block)
        blk("small", f.small, True)
    elif isinstance(f, Structure):
        if f.kind not in STRUCT_ROLES:
            r.err(w, f"structure kind {f.kind!r} not in {sorted(STRUCT_ROLES)}")
        else:
            for role, b in f.blocks.items():
                if role not in STRUCT_ROLES[f.kind]:
                    r.warn(w, f"structure {f.kind}: unknown role {role!r} (roles: {sorted(STRUCT_ROLES[f.kind])})")
                blk(f"blocks.{role}", b)
    elif isinstance(f, Lake):
        if f.fluid not in ("minecraft:water", "minecraft:lava") and not refs.block_ok(f.fluid):
            r.err(w, f"lake fluid {f.fluid!r}")
        blk("border", f.border, True)
    elif isinstance(f, Vanilla):
        from .features import vanilla_steps
        vid = f.id if ":" in f.id else "minecraft:" + f.id
        if vid not in vanilla_steps():
            r.err(w, f"Vanilla id {f.id!r} is not a vanilla placed feature")
    elif isinstance(f, Geode):
        for k in ("outer", "middle", "inner"):
            blk(k, getattr(f, k))
        blk("budding", f.budding, True)
        for c in f.crystals:
            blk("crystals", c)


def validate_all(dims):
    """dims: list of dsl.Dimension. Returns (reports by dim id, global errors)."""
    global_blocks, global_items = {}, {}
    gerr = []
    seen_dims, seen_biomes, seen_creatures = {}, {}, {}
    for d in dims:
        if d.id in seen_dims:
            gerr.append(f"duplicate dimension id {d.id!r}")
        seen_dims[d.id] = d
        for b in d.blocks:
            if b.id in global_blocks or b.id in global_items:
                gerr.append(f"{d.id}: block id {b.id!r} already used by another dimension")
            global_blocks[b.id] = d.id
        for i in d.items:
            if i.id in global_items or i.id in global_blocks:
                gerr.append(f"{d.id}: item id {i.id!r} already used (ids must be globally unique)")
            global_items[i.id] = d.id
        for b in d.biomes:
            if b.id in seen_biomes:
                gerr.append(f"{d.id}: biome id {b.id!r} already used by {seen_biomes[b.id]}")
            seen_biomes[b.id] = d.id
        for c in d.creatures:
            if c.id in seen_creatures:
                gerr.append(f"{d.id}: creature id {c.id!r} already used by {seen_creatures[c.id]}")
            seen_creatures[c.id] = d.id
    reports = {d.id: validate_dimension(d, global_blocks, global_items, None) for d in dims}
    return reports, gerr
