"""L-70 Groovy - lava-lamp psychedelia: floating wax worlds over a molten sea, disco fields and an orange-purple haze."""

import numpy as np
from PIL import Image

from gen.content.dsl import *
from gen.noise import rng

# palette: tangerine wax, hot magenta, deep purple, mustard, avocado/teal accent
P_ORANGE = ["#a83a08", "#d65a12", "#ff7a1a", "#ffa53a", "#ffd27a"]
P_MAGENTA = ["#7a0e52", "#a81a72", "#e0309a", "#ff62b8", "#ffa8dc"]
P_PURPLE = ["#24083e", "#3a1260", "#561e86", "#7430aa", "#a060d4"]
P_MUSTARD = ["#8a6408", "#b88a10", "#e0b020", "#f8d040", "#fff08a"]
P_SHAG = ["#a85010", "#c86a18", "#e08a22", "#f0a838", "#ffc860"]
P_TEAL = ["#0e5a5a", "#178080", "#20a8a0", "#4ad0c0", "#9af0e0"]
P_STALK = ["#3a5a1a", "#4e7422", "#669030", "#84ac44"]


def _rgb(c):
    c = c.lstrip("#")
    return np.array([int(c[i:i + 2], 16) for i in (0, 2, 4)], float)


def _img(a):
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8), "RGBA")


def lamp_wax(pal, seed):
    """Lava-lamp wax: smooth warm gradient with round rising bubbles of brighter wax."""
    a = np.zeros((16, 16, 4), float)
    a[..., 3] = 255
    yy, xx = np.mgrid[0:16, 0:16]
    cols = [_rgb(c) for c in pal]
    t = (yy / 15.0) * 0.6 + 0.2 * np.sin(xx * 0.5 + yy * 0.25)
    idx = np.clip((t * 3).astype(int), 0, 2)
    a[..., :3] = np.array([cols[3], cols[2], cols[1]])[idx]
    R = rng(seed)
    for _ in range(4):
        cx, cy, r = R.uniform(0, 16), R.uniform(0, 16), R.uniform(1.4, 3.2)
        for ox in (-16, 0, 16):
            for oy in (-16, 0, 16):
                d = np.hypot(xx - cx - ox, yy - cy - oy)
                a[d < r, :3] = cols[3]
                a[(d < r * 0.55) & (yy < cy + oy), :3] = cols[4]
    return _img(a)


def shag(pal, seed):
    """Shag-pile carpet: dense twisted tufts with dark gaps between them."""
    R = rng(seed)
    cols = [_rgb(c) for c in pal]
    a = np.zeros((16, 16, 4), float)
    a[..., 3] = 255
    a[..., :3] = cols[0]
    for _ in range(70):
        x, y = int(R.integers(0, 16)), int(R.integers(0, 16))
        k = int(R.integers(1, 5))
        a[y, x, :3] = cols[k]
        a[(y + 1) % 16, x, :3] = cols[max(1, k - 1)]
    return _img(a)


DISCO_COLORS = ["#ff2a8a", "#ffb020", "#3ae0d0", "#8a3aff", "#f8f040", "#ff6a1a"]


def disco_floor(seed, frame=0):
    """Light-up disco floor: 4x4 grid of glowing panels that change colour every frame."""
    R = rng(seed)
    order = R.integers(0, len(DISCO_COLORS), (4, 4))
    a = np.zeros((16, 16, 4), float)
    a[..., 3] = 255
    a[..., :3] = _rgb("#140820")
    for gy in range(4):
        for gx in range(4):
            c = _rgb(DISCO_COLORS[(order[gy, gx] + frame * (1 + (gx + gy) % 2)) % len(DISCO_COLORS)])
            dim = 1.0 if (frame + gx * 3 + gy) % 3 else 0.55
            y0, x0 = gy * 4, gx * 4
            a[y0 + 1:y0 + 4, x0 + 1:x0 + 4, :3] = c * dim
            a[y0 + 1, x0 + 1, :3] = np.minimum(255, c * dim + 90)
    return _img(a)


def mirror_tiles(seed, frame=0):
    """Disco-ball mirror tiles: grey facets, a couple of them flashing white."""
    R = rng(seed)
    base = R.uniform(0.55, 0.95, (4, 4))
    a = np.zeros((16, 16, 4), float)
    a[..., 3] = 255
    a[..., :3] = _rgb("#303040")
    flash = rng(f"{seed}:{frame}").integers(0, 16, 2)
    for gy in range(4):
        for gx in range(4):
            v = base[gy, gx]
            c = np.array([200, 205, 225]) * v
            if gy * 4 + gx in flash:
                c = np.array([255, 255, 255])
            a[gy * 4:gy * 4 + 3, gx * 4:gx * 4 + 3, :3] = c
            a[gy * 4, gx * 4, :3] = np.minimum(255, c + 40)
    return _img(a)


def bead_curtain(seed):
    """Strings of round coloured beads hanging from the top edge."""
    R = rng(seed)
    a = np.zeros((16, 16, 4), float)
    for x in (2, 6, 10, 13):
        n = int(R.integers(10, 16))
        a[0:n, x, :3] = _rgb("#2a1a10")
        a[0:n, x, 3] = 255
        for y in range(1, n, 3):
            c = _rgb(DISCO_COLORS[int(R.integers(0, len(DISCO_COLORS)))])
            for dx in (-1, 0, 1):
                xx = x + dx
                if 0 <= xx < 16:
                    a[y, xx, :3] = c * (1.0 if dx <= 0 else 0.7)
                    a[y, xx, 3] = 255
            a[y + 1 if y + 1 < 16 else y, x, :3] = c * 0.8
    return _img(a)


def petal_block(pal, seed):
    """Flower-power petal: glossy flat colour with soft radial streaks."""
    yy, xx = np.mgrid[0:16, 0:16]
    cols = [_rgb(c) for c in pal]
    t = np.sin(np.arctan2(yy - 7.5, xx - 7.5) * 6) * 0.5 + 0.5
    a = np.zeros((16, 16, 4), float)
    a[..., 3] = 255
    a[..., :3] = cols[2] * (1 - t[..., None] * 0.25) + cols[3] * (t[..., None] * 0.25)
    R = rng(seed)
    for _ in range(5):
        x, y = int(R.integers(0, 16)), int(R.integers(0, 16))
        a[y, x, :3] = cols[4]
    a[0, :, :3] = a[:, 0, :3] = cols[1]
    return _img(a)


LAVA_LAMP_SPIRE = Spire(blocks=[("groovy_wax", 4), ("groovy_wax_magenta", 2), ("groovy_lamp_glow", 1)],
                        tip="groovy_lamp_glow", height=(12, 26), radius=(2, 4), lean=0.35, count=1, chance=2)
WAX_DRIP = Spire(blocks=[("groovy_wax", 3), ("groovy_wax_magenta", 2)], tip="groovy_lamp_glow", height=(8, 22),
                 radius=(1, 3), hanging=True, where="cave_ceiling", count=1)
FLOATING_WAX = Boulder(blocks=[("groovy_wax", 3), ("groovy_wax_magenta", 3), ("groovy_lamp_glow", 1)], radius=(2, 5),
                       where="air", y=(40, 175), count=1, chance=2)

DIMENSION = Dimension(
    id="groovy",
    code="L-70",
    name="Groovy",
    tagline="Turn on, tune in, float away.",
    description=("A lava lamp the size of a universe: blobs of glowing wax drift through an orange-and-purple haze "
                 "above a molten sea, and some of them are big enough to stand on. Shag meadows sprout giant "
                 "flower-power daisies, disco fields flash under spinning mirror balls and the gravity is far out, "
                 "man. Everything here is friendly - just don't upset a Lava Lamp Blob, and don't look down."),
    danger=2,
    color="#ff7a1a",
    terrain=Terrain(style="planetoids", stone="groovy_wax", fluid="minecraft:lava", sea_level=18, height=100,
                    amplitude=24, roughness=0.25, min_y=0, total_height=256, caves=False, ores=False,
                    bedrock_floor=True,
                    params={"cell_size": 58, "min_radius": 8, "max_radius": 21, "probability": 0.72, "y_min": 62,
                            "y_max": 150, "shape": "blob", "biome_size": 140, "ceiling_block": "groovy_wax_magenta"}),
    sky=Sky(sky_color="#6a1a8a", fog_color="#d0508a", water_fog_color="#ff7a1a", fog_start=50, fog_end=230,
            cloud_color="#ccff9a3a", cloud_height=210, time="dusk", sunrise_color="#ffff8a1a", star_brightness=0.5,
            ambient_light=0.12,
            bodies=[Celestial("gas_giant", ["#ff7a1a", "#e0309a", "#7430aa", "#f8d040"], size=90, yaw=150, pitch=38,
                              roll=-20, speed=4, seed="groovy-lampworld"),
                    Celestial("nebula", ["#e0309a", "#ff7a1a", "#7430aa", "#f8d040"], size=180, yaw=320, pitch=55,
                              alpha=0.5, additive=True, seed="groovy-haze"),
                    Celestial("planet", ["#20a8a0", "#4ad0c0", "#f8d040"], size=26, yaw=40, pitch=22, seed="groovy-moon")]),
    blocks=[
        Block("groovy_wax", "Lamp Wax", "stone", {"all": tex(lamp_wax, P_ORANGE, "groovy-wax")}, hardness=1.0,
              sound="honey", tool="pickaxe", light=3, map_color="color_orange"),
        Block("groovy_wax_magenta", "Magenta Lamp Wax", "stone", {"all": tex(lamp_wax, P_MAGENTA, "groovy-waxm")},
              hardness=1.0, sound="honey", tool="pickaxe", light=3, map_color="color_magenta"),
        Block("groovy_shag", "Shag Turf", "grass", {
            "top": tex(shag, P_SHAG, "groovy-shag"),
            "side": tex("grass_side", P_SHAG, P_ORANGE, seed="groovy-shag-side"),
            "bottom": tex(lamp_wax, P_ORANGE, "groovy-wax")}, hardness=0.7, sound="wool", map_color="color_orange"),
        Block("groovy_velvet", "Purple Velvet", "grass", {
            "top": tex("velvet", P_PURPLE, seed="groovy-velvet"),
            "side": tex("grass_side", P_PURPLE, P_MAGENTA, seed="groovy-velvet-side"),
            "bottom": tex(lamp_wax, P_MAGENTA, "groovy-waxm")}, hardness=0.7, sound="wool", map_color="color_purple"),
        Block("groovy_disco_floor", "Disco Floor", "glow", {"all": tex(disco_floor, "groovy-disco", frames=6,
                                                                      frametime=8)},
              hardness=1.2, sound="glass", light=12, emissive=True, map_color="color_pink"),
        Block("groovy_mirror", "Disco Mirror", "crystal_block", {"all": tex(mirror_tiles, "groovy-mirror", frames=6,
                                                                           frametime=5)},
              hardness=1.0, sound="glass", light=8, emissive=True, map_color="color_light_gray"),
        Block("groovy_lamp_glow", "Lamp Glow", "glow", {"all": tex("lamp", P_MUSTARD, seed="groovy-glow", style="orb")},
              hardness=0.6, sound="honey", light=15, emissive=True, map_color="color_yellow"),
        Block("groovy_stalk", "Flower Stalk", "log", {
            "side": tex("log_side", P_STALK, seed="groovy-stalk"),
            "end": tex("log_top", P_STALK, ["#a0c860", "#84ac44"], seed="groovy-stalk-top")}, hardness=1.2,
              sound="bamboo_wood", map_color="color_green"),
        Block("groovy_petal", "Power Petal", "mushroom_cap", {"all": tex(petal_block, P_MAGENTA, "groovy-petal")},
              hardness=0.4, sound="wool", map_color="color_pink"),
        Block("groovy_petal_sun", "Sunny Petal", "mushroom_cap", {"all": tex(petal_block, P_MUSTARD, "groovy-petal2")},
              hardness=0.4, sound="wool", light=6, map_color="color_yellow"),
        Block("groovy_daisy", "Flower Power", "plant", {"cross": tex("flower", P_STALK, ["#ffffff", "#fff4e0", "#ffd8f0"],
                                                                    seed="groovy-daisy", shape="daisy",
                                                                    center_hex="#ff7a1a")},
              hardness=0.0, sound="grass"),
        Block("groovy_spiral_bloom", "Spiral Bloom", "plant", {"cross": tex("flower", P_STALK, P_MAGENTA[1:],
                                                                           seed="groovy-spiral", shape="spiral")},
              hardness=0.0, sound="grass", light=5, emissive=True),
        Block("groovy_fuzz", "Groovy Fuzz", "plant", {"cross": tex("grass_tuft", P_MUSTARD, seed="groovy-fuzz")},
              hardness=0.0, sound="wool"),
        Block("groovy_bead_curtain", "Bead Curtain", "hanging_plant", {"cross": tex(bead_curtain, "groovy-beads")},
              hardness=0.0, sound="chain"),
        Block("groovy_haze_vent", "Haze Vent", "vent", {
            "top": tex("lamp", P_PURPLE, seed="groovy-vent", style="orb"),
            "side": tex(lamp_wax, P_MAGENTA, "groovy-waxm")}, hardness=1.0, sound="honey", light=9, emissive=True,
              particle="minecraft:witch", effect="minecraft:speed", effect_seconds=8, effect_amplifier=1,
              map_color="color_purple"),
    ],
    items=[
        Item("groovy_groove_jelly", "Groove Jelly", tex("item_icon", "jelly", P_PURPLE[2:] + ["#ff62b8"], seed="groovy-gj"),
             kind="food", food=Food(3, 0.4, fast=True, always=True, effects=[Effect("minecraft:speed", 25, 1),
                                                                             Effect("minecraft:jump_boost", 25, 1)]),
             lore="Your feet will not stop. Do not fight it."),
        Item("groovy_disco_shard", "Disco Shard", tex("item_icon", "shard", ["#5a5a70", "#a0a0b8", "#e0e0f0", "#ffffff"],
                                                      seed="groovy-ds", accent="#ff2a8a"),
             rarity="uncommon", lore="Every face catches a different colour of light."),
        Item("groovy_warm_wax", "Warm Wax Drop", tex("item_icon", "goo", P_ORANGE[1:], seed="groovy-ww"), kind="food",
             food=Food(2, 0.3, effects=[Effect("minecraft:fire_resistance", 40, 0),
                                        Effect("minecraft:nausea", 6, 0, 0.3)]),
             lore="Rises when warm, sinks when cool. So do you, apparently."),
    ],
    creatures=[
        Creature("lava_lamp_blob", "Lava Lamp Blob", "blob", ["#ff7a1a", "#ffd27a", "#e0309a", "#3a0828", "#f8d040"],
                 pattern="gradient", size=1.45,
                 body={"shape": "stack", "blob_size": 14, "translucent": True, "core": True, "eye_style": "sleepy",
                       "eyes": 2, "eye_size": 2, "mouth": "smile", "blush": True},
                 behavior="neutral", movement="floating", health=30, damage=5, speed=0.1, fire_immune=True,
                 emissive=True, abilities=["glow_aura"], on_hit=Effect("minecraft:nausea", 6, 0),
                 ranged=None, drops=[Drop("groovy_warm_wax", 1, 3), Drop("minecraft:magma_cream", 0, 1)],
                 sounds="magma", pitch=0.7, xp=6, group=2, tracking=8,
                 description="A mellow blob of warm wax that drifts up and down, forever. Upset it and it gets hot "
                             "about it."),
        Creature("groove_jelly", "Groove Jelly", "floater", ["#7430aa", "#ff62b8", "#f8d040", "#24083e", "#20a8a0"],
                 pattern="rings", size=0.95,
                 body={"kind": "jelly", "tentacles": 7, "tentacle_len": 14, "bell_w": 12, "bell_h": 9,
                       "eye_style": "sleepy", "eyes": 2, "mouth": "smile", "blush": True},
                 behavior="passive", health=10, speed=0.12, emissive=True,
                 drops=[Drop("groovy_groove_jelly", 0, 2)],
                 sounds="allay", pitch=0.75, xp=3, group=3,
                 description="It sways to a beat only it can hear. Rumour has it the beat is real."),
        Creature("disco_beetle", "Disco Beetle", "crawler", ["#c8c8dc", "#ff2a8a", "#3ae0d0", "#140820", "#f8d040"],
                 pattern="crystal", size=0.75,
                 body={"kind": "beetle", "shell": True, "legs": 3, "antennae": 5, "glow_tips": True,
                       "eye_style": "cute", "eyes": 2, "horns": "small"},
                 behavior="passive", health=8, speed=0.24, tempt="minecraft:glowstone_dust",
                 drops=[Drop("groovy_disco_shard", 0, 2)],
                 sounds="armadillo", pitch=1.5, xp=2, group=4,
                 description="Its mirror shell throws dots of light everywhere it scuttles. Loves shiny dust."),
    ],
    biomes=[
        Biome("groovy_wax_isles", "Wax Isles", top="groovy_wax", under="groovy_wax", temperature=0.5, humidity=0.0,
              grass_color="#ffa53a", foliage_color="#ff7a1a", water_color="#ff7a1a", water_fog_color="#a83a08",
              particles=[("dust:#ffa53a:1.3", 0.004), ("minecraft:falling_lava", 0.001)], ambient="bubbling",
              music="minecraft:music_disc.pigstep",
              features=[
                  LAVA_LAMP_SPIRE,
                  WAX_DRIP,
                  FLOATING_WAX,
                  Boulder(blocks=[("groovy_wax_magenta", 2), ("groovy_lamp_glow", 1)], radius=(1, 3), count=1, chance=2),
                  Patch(block="groovy_fuzz", count=2, tries=12),
              ],
              spawns=[Spawn("lava_lamp_blob", 10, (1, 2)), Spawn("disco_beetle", 4, (1, 3)), Spawn("groove_jelly", 4, (1, 2))]),
        Biome("groovy_disco_fields", "Disco Fields", top="groovy_disco_floor", under="groovy_wax_magenta",
              temperature=-0.5, humidity=0.4, grass_color="#ff2a8a", water_color="#ff7a1a", water_fog_color="#a83a08",
              fog_color="#b03a9a", particles=[("minecraft:note", 0.0015), ("dust:#3ae0d0:1.0", 0.004)],
              ambient="neon_synth", music="minecraft:music_disc.chirp",
              features=[
                  Boulder(blocks=[("groovy_mirror", 1)], radius=(2, 3), where="air", y=(95, 170), count=1),
                  Patch(block="groovy_bead_curtain", count=4, where="cave_ceiling"),
                  Structure(kind="ring", blocks={"main": "groovy_lamp_glow", "alt": "groovy_mirror"}, size=(4, 7),
                            params={"thickness": 0.18, "sink": 0.1}, chance=3),
                  WAX_DRIP,
              ],
              spawns=[Spawn("disco_beetle", 14, (2, 4)), Spawn("groove_jelly", 5, (1, 2)), Spawn("lava_lamp_blob", 3, (1, 1))]),
        Biome("groovy_shag_meadows", "Shag Meadows", top="groovy_shag", under="groovy_wax", temperature=0.0,
              humidity=-0.6, grass_color="#e08a22", foliage_color="#669030", water_color="#ff7a1a",
              water_fog_color="#a83a08", particles=[("minecraft:cherry_leaves", 0.003)], ambient="cozy_breeze",
              music="minecraft:music_disc.cat",
              features=[
                  GiantPlant(stem="groovy_stalk", head="groovy_petal", shape="flower", height=(7, 13), radius=(3, 5),
                             decoration="groovy_petal_sun", bend=0.3, count=1),
                  GiantPlant(stem="groovy_stalk", head="groovy_petal_sun", shape="flower", height=(5, 9), radius=(2, 4),
                             decoration="groovy_lamp_glow", bend=0.2, count=1, chance=2),
                  Patch(block="groovy_daisy", count=6, tries=32),
                  Patch(block="groovy_spiral_bloom", count=2, tries=16),
                  Patch(block="groovy_fuzz", count=4, tries=24),
                  WAX_DRIP,
              ],
              spawns=[Spawn("disco_beetle", 8, (2, 3)), Spawn("groove_jelly", 6, (1, 3)), Spawn("lava_lamp_blob", 3, (1, 1))]),
        Biome("groovy_purple_haze", "Purple Haze", top="groovy_velvet", under="groovy_wax_magenta",
              stone="groovy_wax_magenta", temperature=-0.1, humidity=0.9, grass_color="#7430aa", foliage_color="#a060d4",
              water_color="#e0309a", water_fog_color="#7a0e52", fog_color="#7a2a9a", fog_end=110, sky_color="#4a1070",
              particles=[("minecraft:witch", 0.002), ("dust:#c080f0:0.8", 0.003)], ambient="cosmic_drone",
              music="minecraft:music_disc.mall",
              features=[
                  Patch(block="groovy_haze_vent", count=1, tries=4),
                  Patch(block="groovy_spiral_bloom", count=4, tries=24),
                  Patch(block="groovy_bead_curtain", count=5, where="cave_ceiling"),
                  Spire(blocks=[("groovy_wax_magenta", 3), ("groovy_lamp_glow", 1)], tip="groovy_lamp_glow",
                        height=(6, 14), radius=(1, 2), lean=0.5, count=1),
                  WAX_DRIP,
              ],
              spawns=[Spawn("groove_jelly", 12, (2, 4)), Spawn("lava_lamp_blob", 4, (1, 1)), Spawn("disco_beetle", 3, (1, 2))]),
    ],
    effects=["floaty"],
    ambient="bubbling",
    music="minecraft:music_disc.pigstep",
    platform="groovy_wax",
    arrival_y=110,
    icon="portalgun:groovy_groove_jelly",
)
