"""S-0DA Effervescia - a fizzy soda sea dotted with ice-cream foam islands, floating lemon slices, giant straws
and soap bubbles the size of houses."""
import colorsys
from dataclasses import replace

import numpy as np
from PIL import Image

from gen.content.dsl import *
from gen.noise import rng

P_FOAM = ["#d6c094", "#e6d4ae", "#f2e6c8", "#faf2e0", "#fffaf0"]
P_SUGAR = ["#d6d0cc", "#e6e2de", "#f2f0ec", "#fbfaf8", "#ffffff"]
P_SYRUP = ["#3e1a06", "#5c2a0c", "#7c3e12", "#9c561c", "#bc722a"]
P_ICE = ["#a8d8f0", "#c4e8fa", "#dcf4ff", "#f0fbff"]
P_LEMON = ["#d89a10", "#f0c020", "#ffe048", "#fff08a", "#fffac8"]
P_CHERRY_LEAF = ["#2a6a3a", "#3a8a4a", "#58aa5a", "#80c870"]


def _hex(c):
    c = c.lstrip("#")
    return np.array([int(c[i:i + 2], 16) for i in (0, 2, 4)], float)


def _img(a):
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8), "RGBA")


def _bubbles(R, n, rmin, rmax):
    return [(R.uniform(0, 16), R.uniform(0, 16), R.uniform(rmin, rmax)) for _ in range(n)]


def foam(pal, seed, holes=9):
    """Whipped foam: creamy base with round bubble pockets (shaded inside, bright upper rim)."""
    R = rng(seed)
    cols = [_hex(c) for c in pal]
    a = np.zeros((16, 16, 4), float)
    a[..., 3] = 255
    n = R.random((16, 16))
    a[..., :3] = cols[3]
    a[n < 0.3, :3] = cols[2]
    a[n > 0.85, :3] = cols[4]
    yy, xx = np.mgrid[0:16, 0:16]
    for (bx, by, r) in _bubbles(R, holes, 1.0, 2.4):
        dx = (xx - bx + 8) % 16 - 8
        dy = (yy - by + 8) % 16 - 8
        d = np.hypot(dx, dy)
        a[d < r, :3] = cols[1]
        a[(d < r) & (dy > 0.2 * r), :3] = cols[0]
        rim = (d >= r) & (d < r + 0.9) & (dy < 0)
        a[rim, :3] = cols[4]
    return _img(a)


def bubble_film(seed):
    """A soap-bubble skin: nearly clear, with drifting rainbow swirls and a white specular glint."""
    R = rng(seed)
    yy, xx = np.mgrid[0:16, 0:16]
    a = np.zeros((16, 16, 4), float)
    ph = R.uniform(0, 6)
    hue = (np.sin(xx * 0.38 + ph) + np.sin(yy * 0.31 - ph * 0.7) + np.sin((xx + yy) * 0.21)) / 6 + 0.5
    for y in range(16):
        for x in range(16):
            r, g, b = colorsys.hsv_to_rgb(hue[y, x] % 1.0, 0.45, 1.0)
            a[y, x, :3] = (r * 255, g * 255, b * 255)
    swirl = np.abs(np.sin(xx * 0.5 + yy * 0.25 + ph))
    a[..., 3] = 46 + 60 * (swirl > 0.85)
    edge = (xx == 0) | (yy == 0) | (xx == 15) | (yy == 15)
    a[edge, 3] = np.maximum(a[edge, 3], 90)
    for (x, y) in ((3, 3), (4, 3), (3, 4), (5, 2), (2, 5)):
        a[y, x] = (255, 255, 255, 220)
    return _img(a)


def straw_end(red, seed):
    """Top of a drinking straw: striped rim around a dark hollow."""
    yy, xx = np.mgrid[0:16, 0:16]
    d = np.hypot(xx - 7.5, yy - 7.5)
    ang = np.arctan2(yy - 7.5, xx - 7.5)
    a = np.zeros((16, 16, 4), float)
    a[..., 3] = 255
    a[..., :3] = (250, 248, 244)
    stripe = (np.floor((ang + np.pi) / (np.pi / 4)) % 2) == 0
    a[stripe, :3] = _hex(red)
    a[d < 5.0, :3] = (70, 30, 14)
    a[d < 4.0, :3] = (40, 16, 6)
    a[(d >= 5.0) & (d < 5.8), :3] = a[(d >= 5.0) & (d < 5.8), :3] * 0.8
    return _img(a)


def lemon_pulp(pal, seed):
    """Juicy citrus flesh: teardrop juice cells radiating diagonally, each with a bright highlight."""
    R = rng(seed)
    cols = [_hex(c) for c in pal]
    a = np.zeros((16, 16, 4), float)
    a[..., 3] = 255
    a[..., :3] = cols[2]
    yy, xx = np.mgrid[0:16, 0:16]
    for _ in range(14):
        cx, cy = R.uniform(0, 16), R.uniform(0, 16)
        dx = (xx - cx + 8) % 16 - 8
        dy = (yy - cy + 8) % 16 - 8
        u = (dx + dy) * 0.707
        v = (dx - dy) * 0.707
        m = (u / 2.6) ** 2 + (v / 1.1) ** 2 < 1
        a[m, :3] = cols[3]
        a[m & (u < -1.0), :3] = cols[1]
        a[m & (u > 1.6) & (np.abs(v) < 0.6), :3] = cols[4]
    a[R.random((16, 16)) < 0.04, :3] = cols[0]
    return _img(a)


def citrus_slice(rind, pal, seed, lime=False):
    """A floating citrus wheel seen from above: rind ring, white pith, 8 glossy segments."""
    yy, xx = np.mgrid[0:16, 0:16]
    d = np.hypot(xx - 7.5, yy - 7.5)
    ang = np.arctan2(yy - 7.5, xx - 7.5)
    a = np.zeros((16, 16, 4), float)
    cols = [_hex(c) for c in pal]
    m = d < 7.6
    a[m, 3] = 255
    a[m, :3] = _hex(rind)
    a[d < 6.7, :3] = (250, 248, 232)
    seg = d < 5.9
    k = (ang + np.pi) / (np.pi / 4)
    frac = np.abs(k - np.round(k))
    a[seg, :3] = cols[2]
    a[seg & (frac * d < 0.55), :3] = (250, 248, 232)
    a[seg & (d > 3.5) & (frac * d > 0.9), :3] = cols[3]
    a[d < 1.1, :3] = (250, 248, 232)
    a[(d >= 7.0) & m, :3] = _hex(rind) * 0.75
    return _img(a)


def fizz_top(pal, seed):
    """Vent top: syrup crust full of rising bubble holes."""
    R = rng(seed)
    cols = [_hex(c) for c in pal]
    a = np.zeros((16, 16, 4), float)
    a[..., 3] = 255
    n = R.random((16, 16))
    a[..., :3] = cols[2]
    a[n < 0.35, :3] = cols[1]
    yy, xx = np.mgrid[0:16, 0:16]
    for (bx, by, r) in _bubbles(R, 8, 0.8, 1.8):
        d = np.hypot((xx - bx + 8) % 16 - 8, (yy - by + 8) % 16 - 8)
        a[d < r + 0.7, :3] = (250, 244, 230)
        a[d < r, :3] = cols[0]
    return _img(a)


LEMON = Structure(kind="lily_pad", blocks={"pad": "effervescia_lemon_pulp", "vein": "effervescia_lemon_pith"},
                  size=(6, 11), params={"notch": 0, "flowers": 0}, where="water_surface", count=1, chance=8)
STRAW = Spire(blocks=[("effervescia_straw", 1)], height=(16, 30), radius=(1, 1), lean=0.55, count=1, chance=6)
BUBBLE = Boulder(blocks=[("effervescia_bubble_glass", 1)], radius=(3, 6), hollow=True, where="air", y=(80, 125),
                 count=1, chance=9)
ICE = Boulder(blocks=[("effervescia_ice_cube", 1)], radius=(2, 3), squash=0.8, where="water_surface", count=1,
              chance=3)

DIMENSION = Dimension(
    id="effervescia",
    code="S-0DA",
    name="Effervescia",
    tagline="A fizzy soda sea that tickles your feet",
    description=("A warm, endless soda sea - cola in the deeps, lime in the lagoons, berry fizz in the shallows - "
                 "with islands of whipped foam floating on top. Lemon slices bigger than houses drift past giant "
                 "striped straws, ice cubes bob in the swell and soap bubbles hang in the carbonated air, which "
                 "makes everything (you included) a little floaty. Nothing here means you harm; the Fizzers just "
                 "like to share."),
    danger=1,
    color="#ff9a2a",
    terrain=Terrain(style="islands", stone="effervescia_syrupstone", sea_level=63, height=68, amplitude=10,
                    scale=1.1, roughness=0.12, caves=False, ores=False,
                    params={"coverage": 0.2, "depth": 16, "island_height": 8, "beach_block": "effervescia_sugar_sand",
                            "beach_height": 2, "biome_size": 280, "ceiling_block": "effervescia_foam",
                            "cliff_block": "effervescia_foam"}),
    sky=Sky(sky_color="#62c0ff", fog_color="#d6eeff", water_fog_color="#4a2208", fog_start=60, fog_end=260,
            cloud_color="#f8ffffff", cloud_height=150, time="noon", sky_light_color="#fff4e8",
            bodies=[Celestial("gas_giant", ["#e0701a", "#ff9a2a", "#ffd08a", "#fff0d8"], size=52, yaw=60, pitch=28,
                              roll=-10, seed="effervescia-orange"),
                    Celestial("planet", ["#4aa82a", "#8ad84a", "#d8ff9a"], size=28, yaw=120, pitch=55,
                              seed="effervescia-lime"),
                    Celestial("planet", ["#a02a6a", "#e04a8a", "#ffb0d8"], size=16, yaw=20, pitch=60,
                              seed="effervescia-berry")]),
    blocks=[
        Block("effervescia_froth", "Float Froth", "grass", {
            "top": tex(foam, P_FOAM, "effervescia-froth-top", holes=12),
            "side": tex(foam, P_FOAM, "effervescia-froth-side", holes=7),
            "bottom": tex(foam, P_FOAM, "effervescia-foam")}, hardness=0.5, sound="snow", map_color="snow"),
        Block("effervescia_foam", "Whipped Foam", "soil", {"all": tex(foam, P_FOAM, "effervescia-foam")},
              hardness=0.4, sound="wool", map_color="snow"),
        Block("effervescia_sugar_sand", "Sugar Sand", "sand", {"all": tex("salt", P_SUGAR, seed="effervescia-sugar")},
              hardness=0.5, sound="sand", map_color="quartz"),
        Block("effervescia_syrupstone", "Syrupstone", "stone",
              {"all": tex("obsidian_like", P_SYRUP, seed="effervescia-syrup")}, hardness=1.2, sound="calcite",
              map_color="color_brown"),
        Block("effervescia_straw", "Giant Straw", "log", {
            "side": tex("candy_stripe", "#e8304a", "#fafaf6", "effervescia-straw", width=4),
            "end": tex(straw_end, "#e8304a", "effervescia-straw-end")}, hardness=1.0, sound="bamboo_wood",
              tool="axe", map_color="color_red"),
        Block("effervescia_bubble_glass", "Bubble Film", "glass", {"all": tex(bubble_film, "effervescia-bubble")},
              hardness=0.2, sound="glass", map_color="none"),
        Block("effervescia_ice_cube", "Soda Ice Cube", "ice", {"all": tex("ice", P_ICE, seed="effervescia-ice")},
              hardness=0.5, sound="glass", friction=0.98, map_color="ice"),
        Block("effervescia_fizz_vent", "Fizz Geyser", "vent", {
            "top": tex(fizz_top, P_SYRUP, "effervescia-vent"),
            "side": tex("obsidian_like", P_SYRUP, seed="effervescia-syrup")}, hardness=1.0, sound="calcite",
              particle="minecraft:bubble_pop", effect="minecraft:jump_boost", effect_seconds=8, effect_amplifier=2,
              map_color="color_brown"),
        Block("effervescia_lemon_pulp", "Lemon Pulp", "glow", {"all": tex(lemon_pulp, P_LEMON, "effervescia-pulp")},
              hardness=0.4, sound="slime", tool="axe", light=9, emissive=True, map_color="color_yellow",
              jump=1.4),
        Block("effervescia_lemon_pith", "Lemon Pith", "solid", {"all": tex(foam, ["#e8e2c0", "#f0ecd2", "#f8f6e4",
                                                                                 "#fdfcf2", "#ffffff"],
                                                                         "effervescia-pith", holes=3)},
              hardness=0.4, sound="wool", tool="axe", map_color="color_yellow"),
        Block("effervescia_lime_wheel", "Lime Wheel", "lily",
              {"top": tex(citrus_slice, "#3a8a1a", ["#5aa02a", "#8ad040", "#b8ec60", "#e0ffa0"],
                          "effervescia-lime")},
              hardness=0.0, sound="lily_pad", map_color="color_light_green"),
        Block("effervescia_cherry_bush", "Soda Cherry Bush", "plant",
              {"cross": tex("berry_bush", P_CHERRY_LEAF, "#e0203a", seed="effervescia-cherry")}, hardness=0.0,
              sound="sweet_berry_bush", fruit="effervescia_soda_cherry"),
    ],
    items=[
        Item("effervescia_fizz_pop", "Fizz Pop", tex("item_icon", "bottle", ["#5c2a0c", "#9c561c", "#d0802a",
                                                                             "#ffd090"], seed="effervescia-pop",
                                                    accent="#ffffff"),
             kind="food", food=Food(3, 0.3, always=True, fast=True,
                                    effects=[Effect("minecraft:speed", 30, 1), Effect("minecraft:jump_boost", 30, 1)]),
             lore="Shake well. Then run."),
        Item("effervescia_soda_cherry", "Soda Cherry", tex("item_icon", "berry", ["#7a0a1a", "#c01a30", "#f04050",
                                                                                   "#ffb0b8"],
                                                           seed="effervescia-cherry", accent="#3a8a4a"),
             kind="food", food=Food(2, 0.4, fast=True, effects=[Effect("minecraft:levitation", 1.5, 0)]),
             lore="Burp responsibly."),
        Item("effervescia_fizz_bubble", "Everlasting Bubble", tex("item_icon", "pearl", ["#c0a0ff", "#a0e8ff",
                                                                                          "#ffffff", "#ffd0f0"],
                                                                  seed="effervescia-bubble"),
             rarity="uncommon", lore="Never pops in your pocket. Only in your face."),
    ],
    creatures=[
        Creature("cola_eel", "Cola Eel", "swimmer", ["#3a1606", "#c06a24", "#fff0d4", "#ffd860"], pattern="speckle",
                 size=1.6, body={"kind": "eel", "segments": 8, "seg_w": 5, "fins": True, "eye_style": "cute",
                                 "mouth": "smile", "belly": True},
                 behavior="neutral", health=18, damage=3, speed=0.9, abilities=["charge"],
                 on_hit=Effect("minecraft:nausea", 4), drops=[Drop("effervescia_fizz_pop", 0, 2)],
                 sounds="guardian", pitch=1.35, xp=4, group=2,
                 description="Leaves a trail of fizz wherever it swims. Startle it and it sprays you in the face."),
        Creature("fizzer", "Fizzer", "blob", ["#ff8a1e", "#ffd08a", "#ffffff", "#3a1a08"], pattern="spots",
                 size=0.85,
                 body={"shape": "round", "translucent": True, "core": True, "eye_style": "cute", "mouth": "grin",
                       "blob_size": 11, "blush": True, "antennae": 3, "glow_tips": True},
                 behavior="neutral", attack="ranged", health=12, damage=1, speed=0.3, movement="hopping",
                 ranged={"color": "#fff6e8", "damage": 1, "effect": Effect("minecraft:levitation", 2, 0),
                         "cooldown": 50, "speed": 0.8, "size": 0.3, "particle": "minecraft:bubble_pop"},
                 drops=[Drop("effervescia_fizz_bubble", 0, 1, chance=0.5), Drop("minecraft:sugar", 1, 2)],
                 sounds="slime", pitch=1.5, xp=3, group=3,
                 description="A hopping blob of orange soda. Annoy it and it burps bubbles that float you away."),
        Creature("soap_jelly", "Soap Jelly", "floater", ["#f0c8ff", "#a8ecff", "#ffffff", "#5a3a8a"],
                 pattern="gradient", size=1.1,
                 body={"kind": "jelly", "tentacles": 6, "tentacle_len": 10, "translucent": True, "eye_style": "cute",
                       "blush": True, "hover": 4},
                 behavior="passive", health=8, speed=0.1,
                 drops=[Drop("effervescia_fizz_bubble", 0, 1), Drop("minecraft:slime_ball", 0, 1)],
                 sounds="squid", pitch=1.6, xp=2, group=3,
                 description="Drifts on the fizz like a bubble that learned to swim. Shimmers in every colour."),
    ],
    biomes=[
        Biome("effervescia_cola_sea", "Cola Sea", top="effervescia_sugar_sand", under="effervescia_syrupstone",
              temperature=0.1, humidity=0.0, elevation=-0.7, underwater="effervescia_syrupstone",
              water_color="#6a3214", water_fog_color="#3a1806", particles=[("minecraft:bubble_pop", 0.01)],
              ambient="bubbling", music="minecraft:music.under_water",
              features=[
                  LEMON,
                  STRAW,
                  ICE,
                  BUBBLE,
                  Vanilla(id="minecraft:seagrass_normal", count=1),
              ],
              spawns=[Spawn("cola_eel", 8, (1, 2)), Spawn("soap_jelly", 4, (1, 2))]),
        Biome("effervescia_foam_isles", "Foam Isles", top="effervescia_froth", under="effervescia_foam",
              temperature=0.3, humidity=-0.4, elevation=0.6, water_color="#6a3214", water_fog_color="#3a1806",
              particles=[("minecraft:bubble_pop", 0.006), ("minecraft:white_smoke", 0.0006)], ambient="candy_chime",
              music="minecraft:music.overworld.cherry_grove",
              features=[
                  Patch(block="effervescia_cherry_bush", count=3, tries=16),
                  Patch(block="effervescia_fizz_vent", count=1, tries=3, chance=2),
                  Vanilla(id="minecraft:patch_sugar_cane", count=1),
                  replace(STRAW, chance=3, height=(10, 20)),
                  replace(BUBBLE, chance=6),
                  Boulder(blocks=[("effervescia_foam", 1)], radius=(2, 3), squash=0.6, count=1, chance=3),
              ],
              spawns=[Spawn("fizzer", 10, (2, 3)), Spawn("soap_jelly", 6, (1, 3))]),
        Biome("effervescia_lime_lagoon", "Lime Lagoon", top="effervescia_sugar_sand", under="effervescia_syrupstone",
              temperature=0.7, humidity=0.6, elevation=-0.2, underwater="effervescia_sugar_sand",
              water_color="#6ad83a", water_fog_color="#2a6a12", sky_color="#9ae0f0",
              particles=[("minecraft:bubble_pop", 0.012)], ambient="bubbling",
              music="minecraft:music.overworld.lush_caves",
              features=[
                  Patch(block="effervescia_lime_wheel", where="water_surface", count=4, tries=24, max_depth=4),
                  replace(ICE, chance=2),
                  replace(LEMON, chance=10, size=(5, 8)),
                  Vanilla(id="minecraft:patch_sugar_cane", count=2),
                  Patch(block="effervescia_cherry_bush", count=1, tries=8),
              ],
              spawns=[Spawn("soap_jelly", 6, (1, 3)), Spawn("fizzer", 5, (1, 2)), Spawn("cola_eel", 3, (1, 1))]),
        Biome("effervescia_berry_fizz", "Berry Fizz Shallows", top="effervescia_froth", under="effervescia_foam",
              temperature=-0.6, humidity=0.3, elevation=0.0, underwater="effervescia_sugar_sand",
              water_color="#d03a86", water_fog_color="#6a1440", sky_color="#a8c8ff", fog_color="#ffd8ec",
              particles=[("minecraft:bubble_pop", 0.01), ("minecraft:cherry_leaves", 0.002)], ambient="candy_chime",
              music="minecraft:music.overworld.cherry_grove",
              features=[
                  replace(BUBBLE, chance=3, radius=(2, 5)),
                  Boulder(blocks=[("effervescia_bubble_glass", 1)], radius=(1, 2), hollow=True, where="surface",
                          count=1, chance=2),
                  Patch(block="effervescia_cherry_bush", count=4, tries=20),
                  replace(STRAW, chance=4),
              ],
              spawns=[Spawn("soap_jelly", 10, (2, 4)), Spawn("fizzer", 5, (1, 3))]),
    ],
    effects=["floaty"],
    ambient="bubbling",
    music="minecraft:music.overworld.cherry_grove",
    icon="portalgun:effervescia_fizz_pop",
)
