"""R-7 Spectra - rolling rainbow prism plains where the very ground is striped in colour."""
import colorsys

import numpy as np
from PIL import Image

from gen.content.dsl import *
from gen.noise import rng

# palette: pearl white, mint, rose, gold, lilac, sky cyan (+ the full spectrum as accents)
P_PEARL = ["#d8d0e8", "#e4def0", "#eeeaf6", "#f6f4fb", "#ffffff"]
P_MINT = ["#3fae9a", "#58c8ad", "#78dcc0", "#a0ecd4", "#d0fff0"]
P_ROSE = ["#c8507e", "#e06c96", "#f08cb0", "#fcb0ca", "#ffd8e6"]
P_GOLD = ["#c88a2a", "#e0a838", "#f0c450", "#fadc78", "#fff0b0"]
P_LILAC = ["#7a5ab8", "#9474d0", "#ae90e4", "#c8b0f2", "#e8dcff"]
P_SOIL = ["#a89cc0", "#b8aed0", "#c8c0de", "#d8d2ea"]
P_BARK = ["#c0b8d8", "#d4cee6", "#e6e2f2", "#f8f6ff"]
RAINBOW = ["#ff5a6e", "#ff9a3c", "#ffe04a", "#5ee07a", "#4ac0ff", "#8a6aff", "#e070ff"]


def _hexrgb(c):
    c = c.lstrip("#")
    return np.array([int(c[i:i + 2], 16) for i in (0, 2, 4)], float)


def _hsv_img(h, s, v, a=None):
    """Arrays (16x16) of hue/sat/val in 0..1 -> RGBA image."""
    out = np.zeros((16, 16, 4), np.uint8)
    for y in range(16):
        for x in range(16):
            r, g, b = colorsys.hsv_to_rgb(h[y, x] % 1.0, float(np.clip(s[y, x], 0, 1)), float(np.clip(v[y, x], 0, 1)))
            out[y, x, :3] = (int(r * 255), int(g * 255), int(b * 255))
    out[..., 3] = 255 if a is None else a
    return Image.fromarray(out, "RGBA")


def rainbow_strata(seed, sat=0.42, val=0.93):
    """Pastel rainbow sediment: horizontal colour bands of uneven thickness with stony grain and pebbles."""
    R = rng(seed)
    h = np.zeros((16, 16))
    s = np.zeros((16, 16))
    v = np.zeros((16, 16))
    y, hue = 0, R.uniform(0, 1)
    rows = []
    while y < 16:
        th = int(R.integers(2, 4))
        rows += [hue] * th
        hue += 1.0 / 6.0 + R.uniform(-0.03, 0.03)
        y += th
    rows = rows[:16]
    # make the texture tile vertically: last band blends toward the first hue
    for yy in range(16):
        wob = R.uniform(-0.012, 0.012, 16)
        h[yy] = rows[yy] + wob
        g = R.uniform(-0.07, 0.07, 16)
        s[yy] = sat + g * 0.6
        v[yy] = val + g
    # band edges a touch darker (bedding planes)
    for yy in range(1, 16):
        if abs(rows[yy] - rows[yy - 1]) > 1e-6:
            v[yy - 1] -= 0.08
    # a few pebbles / mineral flecks
    for _ in range(5):
        px, py = int(R.integers(0, 16)), int(R.integers(0, 16))
        v[py, px] -= 0.18
        s[py, px] += 0.15
    for _ in range(3):
        px, py = int(R.integers(0, 16)), int(R.integers(0, 16))
        v[py, px] = 1.0
        s[py, px] = 0.08
    return _hsv_img(h, s, v)


def pastel_leaves(seed, hues):
    """Blossom canopy in a few neighbouring pastel hues (cut-out holes like vanilla leaves) - reads as one bright
    colour from afar but sparkles with tints up close."""
    from gen.textures import leaves
    base = np.array(leaves(["#404040", "#707070", "#a0a0a0", "#d0d0d0", "#f0f0f0"], seed, holes=0.22)).astype(float)
    R = rng(seed + "h")
    lum = base[..., :3].mean(axis=2) / 255.0
    yy, xx = np.mgrid[0:16, 0:16]
    # hue drifts diagonally across clumps of 4x4 with some random offsets -> patchwork rainbow
    hues = np.array(hues)
    clump = hues[R.integers(0, len(hues), (5, 5))]
    jx = R.integers(0, 3, (16, 16))
    h = clump[np.clip((yy + jx // 2) // 4, 0, 4), np.clip((xx + jx % 2) // 4, 0, 4)]
    s = 0.30 + 0.28 * (1 - lum)
    v = 0.72 + 0.34 * lum
    img = _hsv_img(h, s, v, base[..., 3].astype(np.uint8))
    return img


def prism_crystal(seed, n=12):
    """Iridescent prism block: crystal facets whose colours slowly cycle through the spectrum (animated)."""
    from gen.textures import crystal
    base = np.array(crystal(["#9a9ab0", "#c0c0d4", "#dcdcea", "#f0f0fa", "#ffffff"], seed, shards=6)).astype(float)
    lum = base[..., :3].mean(axis=2) / 255.0
    yy, xx = np.mgrid[0:16, 0:16]
    frames = []
    for f in range(n):
        h = (xx * 0.035 + yy * 0.05 + f / n) % 1.0
        s = 0.35 + 0.25 * (1 - lum)
        v = 0.62 + 0.4 * lum
        frames.append(_hsv_img(h, s, v))
    return frames


def rainbow_flower(seed):
    """A daisy whose petals run through the whole spectrum around the centre."""
    from gen.textures import flower
    img = np.array(flower(["#2f8a5a", "#3fa86a", "#58c880", "#90e8a8"], ["#9a9a9a", "#c0c0c0", "#e0e0e0", "#ffffff"],
                          seed, shape="daisy", center_hex="#ffe04a")).astype(float)
    out = img.copy()
    rgb = img[..., :3]
    grey = (np.abs(rgb[..., 0] - rgb[..., 1]) < 10) & (np.abs(rgb[..., 1] - rgb[..., 2]) < 10) & (img[..., 3] > 0)
    ys, xs = np.nonzero(grey)
    if len(xs):
        cy, cx = ys.mean(), xs.mean()
        for y, x in zip(ys, xs):
            ang = (np.arctan2(y - cy, x - cx) / (2 * np.pi)) % 1.0
            l = rgb[y, x, 0] / 255.0
            r, g, b = colorsys.hsv_to_rgb(ang, 0.62, 0.55 + 0.45 * l)
            out[y, x, :3] = (r * 255, g * 255, b * 255)
    return Image.fromarray(np.clip(out, 0, 255).astype(np.uint8), "RGBA")


def prism_shard_sprite(seed):
    """Small prism shards on a cross sprite, each a different colour of the spectrum."""
    from gen.textures import crystal_shard_sprite
    img = np.array(crystal_shard_sprite(["#a0a0b8", "#c8c8dc", "#e8e8f4", "#ffffff"], seed, count=3)).astype(float)
    out = img.copy()
    yy, xx = np.mgrid[0:16, 0:16]
    for y in range(16):
        for x in range(16):
            if img[y, x, 3] > 0:
                l = img[y, x, :3].mean() / 255.0
                r, g, b = colorsys.hsv_to_rgb((x / 16.0 + 0.1) % 1.0, 0.5, 0.6 + 0.4 * l)
                out[y, x, :3] = (r * 255, g * 255, b * 255)
    return Image.fromarray(np.clip(out, 0, 255).astype(np.uint8), "RGBA")


PRISM_TOWER = Spire(blocks=[("minecraft:red_stained_glass", 2), ("minecraft:orange_stained_glass", 2),
                            ("minecraft:yellow_stained_glass", 2), ("minecraft:lime_stained_glass", 2),
                            ("minecraft:light_blue_stained_glass", 2), ("minecraft:purple_stained_glass", 2),
                            ("minecraft:magenta_stained_glass", 2), ("spectra_prism_crystal", 3)],
                    tip="spectra_prism_crystal", height=(22, 40), radius=(3, 5), lean=0.12, count=1, chance=5)

DIMENSION = Dimension(
    id="spectra",
    code="R-7",
    name="Spectra",
    tagline="Rolling hills striped in every colour there is",
    description=("A gentle world where light itself got spilled: hills banded in pastel rainbow strata, quilted "
                 "meadows of rose, mint and gold, and rainbow-leaved groves that rustle in seven colours. Stained-glass "
                 "Prism Towers glitter on the crystal heights and every river runs a different hue. Prism Unicorns "
                 "graze the meadows and nothing here wants to hurt you - though the Chroma Slimes do sulk if poked."),
    danger=1,
    color="#ff7ad0",
    terrain=Terrain(style="hills", stone="spectra_bandstone", sea_level=60, height=74, amplitude=24, scale=1.25,
                    roughness=0.22, ores=False,
                    params={"rivers": 0.45, "detail": 0.35, "biome_size": 260, "cliffs": True,
                            "cliff_block": "spectra_bandstone", "ceiling_block": "spectra_pearl_soil",
                            "beach_block": "spectra_pearl_soil", "beach_height": 1, "springs": 40}),
    sky=Sky(sky_color="#8ec4ff", fog_color="#ecdcff", water_fog_color="#4a7ae0", fog_start=60, fog_end=260,
            cloud_color="#f0fff0fa", cloud_height=170, time="day", sunrise_color="#ccff90c0",
            bodies=[Celestial("aurora", ["#ff5a6e", "#ffe04a", "#5ee07a", "#4ac0ff", "#8a6aff"], size=200, yaw=200,
                              pitch=28, alpha=0.75, additive=True, seed="spectra-rainbow"),
                    Celestial("ringed_planet", ["#ffb0d8", "#b0e0ff", "#fff0a0"], size=46, yaw=60, pitch=42, roll=-20,
                              seed="spectra-planet"),
                    Celestial("moon", ["#ffffff", "#e0d0ff", "#b0a0e0"], size=14, yaw=95, pitch=55,
                              seed="spectra-moonlet")]),
    blocks=[
        Block("spectra_prism_turf", "Prism Turf", "grass", {
            "top": tex("grass_top", P_MINT, seed="spectra-mint"),
            "side": tex("grass_side", P_MINT, P_SOIL, seed="spectra-mint-side"),
            "bottom": tex("dirt", P_SOIL, seed="spectra-soil")}, hardness=0.6, sound="grass", map_color="color_cyan"),
        Block("spectra_rose_turf", "Rose Turf", "grass", {
            "top": tex("grass_top", P_ROSE, seed="spectra-rose"),
            "side": tex("grass_side", P_ROSE, P_SOIL, seed="spectra-rose-side"),
            "bottom": tex("dirt", P_SOIL, seed="spectra-soil")}, hardness=0.6, sound="grass", map_color="color_pink"),
        Block("spectra_gold_turf", "Gold Turf", "grass", {
            "top": tex("grass_top", P_GOLD, seed="spectra-gold"),
            "side": tex("grass_side", P_GOLD, P_SOIL, seed="spectra-gold-side"),
            "bottom": tex("dirt", P_SOIL, seed="spectra-soil")}, hardness=0.6, sound="grass", map_color="color_yellow"),
        Block("spectra_pearl_soil", "Pearl Soil", "soil", {"all": tex("dirt", P_SOIL, seed="spectra-soil")},
              hardness=0.5, sound="gravel", map_color="color_light_gray"),
        Block("spectra_bandstone", "Rainbow Bandstone", "stone", {"all": tex(rainbow_strata, "spectra-strata")},
              hardness=1.5, map_color="color_pink"),
        Block("spectra_prismwood_log", "Prismwood Log", "log", {
            "side": tex("log_side", P_BARK, seed="spectra-bark"),
            "end": tex("log_top", P_BARK, ["#ffd8f0", "#d8f0ff"], seed="spectra-bark-end")}, hardness=2.0,
              sound="cherry_wood", flammable=True, map_color="snow"),
        Block("spectra_rose_leaves", "Rose Prism Leaves", "leaves",
              {"all": tex(pastel_leaves, "spectra-leaves-rose", [0.92, 0.97, 0.83])},
              hardness=0.2, sound="cherry_leaves", flammable=True, map_color="color_pink",
              particle="minecraft:cherry_leaves"),
        Block("spectra_azure_leaves", "Azure Prism Leaves", "leaves",
              {"all": tex(pastel_leaves, "spectra-leaves-azure", [0.52, 0.47, 0.58])},
              hardness=0.2, sound="cherry_leaves", flammable=True, map_color="color_light_blue"),
        Block("spectra_gold_leaves", "Sunbeam Leaves", "leaves",
              {"all": tex(pastel_leaves, "spectra-leaves-gold", [0.13, 0.10, 0.16])},
              hardness=0.2, sound="cherry_leaves", flammable=True, map_color="color_yellow"),
        Block("spectra_prism_crystal", "Prism Crystal", "crystal_block",
              {"all": tex(prism_crystal, "spectra-prism", frames=12, frametime=4)}, hardness=1.2, sound="amethyst",
              light=12, emissive=True, map_color="color_light_blue"),
        Block("spectra_prism_cluster", "Prism Cluster", "crystal_cluster",
              {"cross": tex(prism_shard_sprite, "spectra-shards")}, hardness=0.5, sound="amethyst_cluster", light=7,
              emissive=True, drop="spectra_prism_shard", drop_count=(1, 2)),
        Block("spectra_huebloom", "Huebloom", "plant", {"cross": tex(rainbow_flower, "spectra-bloom")}, hardness=0.0,
              sound="grass", light=3, particle="minecraft:glow"),
        Block("spectra_shimmer_grass", "Shimmer Grass", "plant",
              {"cross": tex("grass_tuft", ["#7ab8c8", "#a0d8e0", "#d0f0f8", "#ffffff"], seed="spectra-tuft")},
              hardness=0.0, sound="grass"),
    ],
    items=[
        Item("spectra_prism_shard", "Prism Shard", tex("item_icon", "shard", ["#8a6aff", "#4ac0ff", "#ffe04a", "#ffffff"],
                                                        seed="spectra-shard"),
             rarity="uncommon", lore="Hold it up to the light and it hums in seven notes."),
        Item("spectra_chroma_gel", "Chroma Gel", tex("item_icon", "jelly", ["#ff5a9e", "#ffb0d8", "#b0f0ff"],
                                                     seed="spectra-gel"),
             kind="food", food=Food(3, 0.4, fast=True, effects=[Effect("minecraft:jump_boost", 20, 1),
                                                                Effect("minecraft:glowing", 20, 0)]),
             lore="Tastes like whichever colour you were thinking of."),
        Item("spectra_rainbow_mane", "Rainbow Mane", tex("item_icon", "feather", ["#ff5a6e", "#ffe04a", "#4ac0ff", "#e070ff"],
                                                         seed="spectra-mane"),
             rarity="rare", glint=True, lore="Shed, never cut. Unicorns are very particular about that."),
    ],
    creatures=[
        Creature("prism_unicorn", "Prism Unicorn", "quadruped", ["#fbf8ff", "#ffa8dc", "#7ae8ff", "#5a3aa0", "#ffe070"],
                 pattern="plain", size=1.15,
                 body={"horns": "unicorn", "mane": True, "neck": 8, "neck_angle": 58, "leg_len": 12, "leg_w": 3,
                       "hooves": True, "tail": 3, "tail_kind": "bushy", "ears": "pointy", "eye_style": "cute",
                       "blush": True, "glow_tips": True, "body_len": 15, "body_h": 9, "snout": 3, "head_size": 1.2},
                 behavior="passive", health=30, speed=0.3, abilities=["glow_aura"], tempt="spectra_huebloom",
                 drops=[Drop("spectra_rainbow_mane", 0, 1, chance=0.5), Drop("spectra_prism_shard", 0, 2)],
                 sounds="horse", pitch=1.3, xp=6, group=3, tracking=10,
                 description="A pearly unicorn whose horn refracts the sun into tiny rainbows wherever it walks."),
        Creature("chroma_slime", "Chroma Slime", "blob", ["#ff8ac8", "#8ae8ff", "#ffe070", "#2a1a50"],
                 pattern="gradient", size=0.9,
                 body={"shape": "round", "translucent": True, "core": True, "eye_style": "cute", "mouth": "smile",
                       "blush": True, "blob_size": 12, "antennae": 3, "glow_tips": True},
                 behavior="neutral", health=16, damage=3, speed=0.3, abilities=["split"], movement="hopping",
                 drops=[Drop("spectra_chroma_gel", 1, 2)], sounds="slime", pitch=1.35, xp=3, group=3,
                 description="A wobbling droplet of liquid colour. It splits into smaller sulky droplets when hit."),
        Creature("rainbow_moth", "Rainbow Moth", "flyer", ["#ffa0d8", "#a0f0ff", "#ffe070", "#2a1a40"],
                 pattern="stripes", size=0.6,
                 body={"kind": "moth", "wing_span": 12, "antennae": 4, "fluffy": True, "eye_style": "cute",
                       "glow_tips": True},
                 behavior="passive", health=6, speed=0.22, category="ambient", abilities=["glow_aura"],
                 drops=[Drop("minecraft:glowstone_dust", 0, 1)], sounds="bee", pitch=1.5, xp=1, group=4,
                 description="Its wingbeats leave a faint rainbow smear on the air."),
    ],
    biomes=[
        Biome("spectra_prism_meadows", "Prism Meadows", top="spectra_prism_turf", under="spectra_pearl_soil",
              temperature=0.0, humidity=0.0, elevation=0.0, grass_color="#78dcc0", foliage_color="#ff9ad0",
              water_color="#40d0ff", water_fog_color="#2070c0",
              surface_noise=[("spectra_rose_turf", 0.32), ("spectra_gold_turf", 0.42)],
              particles=[("dust:#ff7aa8:0.9", 0.002), ("dust:#7ad8ff:0.9", 0.002), ("dust:#ffe070:0.9", 0.002)],
              ambient="crystal_chimes", music="minecraft:music.overworld.cherry_grove",
              features=[
                  Patch(block="spectra_huebloom", count=5, tries=32),
                  Patch(block="spectra_shimmer_grass", count=8, tries=48),
                  Tree(log="spectra_prismwood_log", leaves="spectra_rose_leaves", shape="cherry", height=(5, 8),
                       count=1, chance=3),
                  Tree(log="spectra_prismwood_log", leaves="spectra_azure_leaves", shape="cherry", height=(5, 8),
                       count=1, chance=4),
                  Tree(log="spectra_prismwood_log", leaves="spectra_gold_leaves", shape="birch", height=(5, 7),
                       count=1, chance=5),
                  Structure(kind="arch", blocks={"main": "spectra_bandstone", "alt": "spectra_prism_crystal"},
                            size=(6, 10), chance=9),
                  CrystalCluster(block="spectra_prism_crystal", small="spectra_prism_cluster", size=(3, 5), chance=4),
                  Patch(block="spectra_prism_cluster", count=1, tries=6),
              ],
              spawns=[Spawn("prism_unicorn", 10, (2, 4)), Spawn("chroma_slime", 6, (1, 3)),
                      Spawn("rainbow_moth", 8, (2, 4))]),
        Biome("spectra_chroma_grove", "Chroma Grove", top="spectra_rose_turf", under="spectra_pearl_soil",
              temperature=-0.55, humidity=0.55, elevation=0.1, grass_color="#ae90e4", foliage_color="#ff9ad0",
              water_color="#b070ff", water_fog_color="#5030a0", fog_color="#f4d8ff",
              surface_noise=[("spectra_prism_turf", 0.3)],
              particles=[("minecraft:cherry_leaves", 0.004), ("dust:#c890ff:0.8", 0.002)],
              ambient="cozy_breeze", music="minecraft:music.overworld.flower_forest",
              features=[
                  Tree(log="spectra_prismwood_log", leaves="spectra_rose_leaves", shape="cherry", height=(6, 9),
                       count=(1, 2)),
                  Tree(log="spectra_prismwood_log", leaves="spectra_azure_leaves", shape="cherry", height=(6, 9),
                       count=(1, 2)),
                  Tree(log="spectra_prismwood_log", leaves="spectra_gold_leaves", shape="fancy", height=(9, 14),
                       count=1),
                  GiantPlant(stem="spectra_prismwood_log", head="spectra_rose_leaves", shape="puff",
                             height=(14, 22), radius=(5, 7), stem_width=2, bend=0.2, count=1, chance=4),
                  GiantPlant(stem="spectra_prismwood_log", head="spectra_azure_leaves", shape="puff",
                             height=(14, 22), radius=(5, 7), stem_width=2, bend=0.2, count=1, chance=3),
                  Patch(block="spectra_huebloom", count=3, tries=24),
                  Patch(block="spectra_shimmer_grass", count=6, tries=32),
              ],
              spawns=[Spawn("rainbow_moth", 14, (3, 5)), Spawn("prism_unicorn", 4, (1, 2)),
                      Spawn("chroma_slime", 4, (1, 2))]),
        Biome("spectra_crystal_heights", "Crystal Heights", top="spectra_gold_turf", under="spectra_bandstone",
              temperature=0.6, humidity=-0.45, elevation=0.5, grass_color="#f0c450", water_color="#ffd040",
              water_fog_color="#b07010", sky_color="#a0d0ff",
              surface_noise=[("spectra_bandstone", 0.3), ("spectra_pearl_soil", 0.55)],
              particles=[("minecraft:end_rod", 0.0015), ("dust:#ffffff:0.7", 0.003)],
              ambient="crystal_chimes", music="minecraft:music.overworld.meadow",
              features=[
                  PRISM_TOWER,
                  Spire(blocks=[("spectra_prism_crystal", 3), ("spectra_bandstone", 2)], tip="spectra_prism_crystal",
                        height=(8, 16), radius=(1, 2), lean=0.3, count=1, chance=2),
                  CrystalCluster(block="spectra_prism_crystal", small="spectra_prism_cluster", size=(4, 8), count=1),
                  Patch(block="spectra_prism_cluster", count=3, tries=16),
                  Patch(block="spectra_shimmer_grass", count=3, tries=24),
                  Boulder(blocks=[("spectra_bandstone", 4), ("spectra_prism_crystal", 1)], radius=(2, 3), squash=0.7,
                          count=1, chance=3),
              ],
              spawns=[Spawn("prism_unicorn", 6, (1, 3)), Spawn("rainbow_moth", 6, (1, 3))]),
        Biome("spectra_hue_lagoons", "Hue Lagoons", top="spectra_rose_turf", under="spectra_pearl_soil",
              temperature=0.45, humidity=0.7, elevation=-0.5, underwater="spectra_pearl_soil",
              grass_color="#f08cb0", water_color="#ff60c8", water_fog_color="#a02880", fog_color="#ffe0f4",
              surface_noise=[("spectra_prism_turf", 0.4)],
              particles=[("dust:#ff9ad8:1.0", 0.003), ("minecraft:dripping_water", 0.002)],
              ambient="bubbling", music="minecraft:music.overworld.cherry_grove",
              features=[
                  Lake(fluid="minecraft:water", border="spectra_pearl_soil", count=1, chance=2),
                  Patch(block="spectra_huebloom", count=4, tries=24),
                  Patch(block="spectra_shimmer_grass", count=5, tries=32),
                  Tree(log="spectra_prismwood_log", leaves="spectra_rose_leaves", shape="bush", height=(2, 3),
                       count=1),
                  CrystalCluster(block="spectra_prism_crystal", small="spectra_prism_cluster", size=(3, 5),
                                 where="underwater", count=1, chance=2),
              ],
              spawns=[Spawn("chroma_slime", 10, (2, 3)), Spawn("rainbow_moth", 6, (1, 3)),
                      Spawn("prism_unicorn", 3, (1, 2))]),
    ],
    effects=[],
    ambient="crystal_chimes",
    music="minecraft:music.overworld.cherry_grove",
    icon="portalgun:spectra_prism_shard",
)
