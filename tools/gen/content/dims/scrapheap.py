"""S-9 Scrapheap - a junkyard planet: rust plains, mountains of scrap, oil fens and the graves of giant machines."""
import colorsys

import numpy as np
from PIL import Image

from gen.content.dsl import *
from gen.noise import rng

# palette: rust orange, steel blue-grey, grime brown, oil black, hazard yellow, neon pink/cyan
P_RUST = ["#6a2e10", "#8e4216", "#b05a1e", "#cc7428", "#e8963e"]
P_GRIME = ["#2a221c", "#3a2e24", "#4a3c30", "#5c4c3c"]
P_SLAG = ["#26272c", "#323438", "#404248", "#505258", "#62646a"]
P_STEEL = ["#3a4048", "#4e5660", "#646c78", "#7c8490", "#a0a8b4"]
P_PLATE = ["#4a2a18", "#6a3a1c", "#8a5028", "#a86a36", "#c48a4e"]


def _rgb(c):
    c = c.lstrip("#")
    return np.array([int(c[i:i + 2], 16) for i in (0, 2, 4)], float)


def junk_mosaic(seed):
    """Compacted junk: crushed panels of rusty, painted and bare metal with dark gaps, rivets and a stray wire."""
    R = rng(seed)
    paints = ["#9a4e1e", "#b8662a", "#646c78", "#7c8490", "#3a6a9a", "#c8a020", "#8a2a20", "#4a6a3a", "#5a3a5a",
              "#a0a8b4", "#6a3a1c"]
    a = np.zeros((16, 16, 4))
    a[..., :3] = _rgb("#1a1614")
    for _ in range(14):
        w, h = int(R.integers(3, 8)), int(R.integers(2, 6))
        x, y = int(R.integers(-2, 15)), int(R.integers(-2, 15))
        col = _rgb(paints[int(R.integers(0, len(paints)))])
        for yy in range(y, y + h):
            for xx in range(x, x + w):
                if 0 <= xx < 16 and 0 <= yy < 16:
                    edge = yy == y or xx == x
                    shade = 1.18 if edge else (0.78 if (yy == y + h - 1 or xx == x + w - 1) else 1.0)
                    a[yy % 16, xx % 16, :3] = col * shade * R.uniform(0.9, 1.08)
        # gap line under each panel
        for xx in range(x, x + w):
            if 0 <= xx < 16 and 0 <= y + h < 16:
                a[y + h, xx, :3] = _rgb("#14100e")
    for _ in range(5):
        px, py = int(R.integers(0, 16)), int(R.integers(0, 16))
        a[py, px, :3] = _rgb("#d8dce4")
    # a dangling copper wire
    x = int(R.integers(2, 14))
    for y in range(int(R.integers(4, 10))):
        x = int(np.clip(x + R.integers(-1, 2), 0, 15))
        a[y, x, :3] = _rgb("#e08040")
    a[..., 3] = 255
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8), "RGBA")


def girder(seed):
    """Riveted steel I-beam: two flanges, a web with lightening holes and streaks of rust."""
    R = rng(seed)
    a = np.zeros((16, 16, 4))
    st = [_rgb(c) for c in P_STEEL]
    for x in range(16):
        if x in (0, 15):
            c = st[0]
        elif x in (1, 2, 13, 14):
            c = st[3] if x in (1, 13) else st[2]
        else:
            c = st[1]
        a[:, x, :3] = c
    for y in (3, 11):
        for x in range(5, 11):
            if (x - 7.5) ** 2 / 9 + (y - y) ** 2 < 1:
                pass
        a[y - 2:y + 2, 6:10, :3] = st[0] * 0.6
        a[y - 2, 6:10, :3] = st[0] * 0.4
    for y in range(1, 16, 4):
        a[y, 1, :3] = st[4]
        a[y, 14, :3] = st[4]
    for _ in range(4):
        x, y = int(R.integers(0, 16)), int(R.integers(0, 12))
        for k in range(int(R.integers(2, 5))):
            if y + k < 16:
                a[y + k, x, :3] = _rgb(P_RUST[int(R.integers(1, 4))])
    a[..., 3] = 255
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8), "RGBA")


def neon_sign(seed, n=8):
    """Broken neon sign panel: glowing pink and cyan tube glyphs that flicker (animated)."""
    R = rng(seed)
    base = np.zeros((16, 16, 3))
    base[...] = _rgb("#14121a")
    base[0, :] = base[15, :] = base[:, 0] = base[:, 15] = _rgb("#3a3a44")
    tubes = []
    pink, cyan = _rgb("#ff4fb0"), _rgb("#40f0ff")
    # a crooked arrow + a ring glyph
    for x in range(3, 12):
        tubes.append((x, 5, pink))
    for k in range(3):
        tubes.append((11 - k, 5 - k - 1, pink))
        tubes.append((11 - k, 5 + k + 1, pink))
    for ang in np.linspace(0, 2 * np.pi, 18, endpoint=False):
        tubes.append((int(round(7.5 + 3 * np.cos(ang))), int(round(11 + 2.2 * np.sin(ang))), cyan))
    flick = R.uniform(0, 1, (n, 2))
    frames = []
    for f in range(n):
        a = np.zeros((16, 16, 4))
        a[..., :3] = base
        for x, y, c in tubes:
            if 0 <= x < 16 and 0 <= y < 16:
                on = flick[f, 0] > 0.2 if c is pink else flick[f, 1] > 0.35
                a[y, x, :3] = c if on else c * 0.3
        a[..., 3] = 255
        frames.append(Image.fromarray(np.clip(a, 0, 255).astype(np.uint8), "RGBA"))
    return frames


def rusted_plate(seed):
    """Riveted steel hull plate eaten by orange rust blooms and dark streaks."""
    R = rng(seed)
    yy, xx = np.mgrid[0:16, 0:16]
    st = [_rgb(c) for c in P_STEEL]
    a = np.zeros((16, 16, 4))
    a[..., :3] = st[2]
    n = R.uniform(-1, 1, (16, 16))
    a[..., :3] += (n * 6)[..., None]
    # panel seams + bevels
    a[0, :, :3] = st[4]
    a[:, 0, :3] = st[4]
    a[15, :, :3] = st[0]
    a[:, 15, :3] = st[0]
    a[7, 1:15, :3] = st[0]
    a[8, 1:15, :3] = st[3]
    for x, y in ((2, 2), (13, 2), (2, 5), (13, 5), (2, 10), (13, 10), (2, 13), (13, 13)):
        a[y, x, :3] = st[4]
        a[y + 1, x + 1, :3] = st[0]
    # rust blooms (soft blobs) and drip streaks
    rust = [_rgb(c) for c in P_RUST]
    for _ in range(4):
        cx, cy, r = R.uniform(0, 16), R.uniform(0, 16), R.uniform(2, 4.5)
        d = np.hypot(((xx - cx + 8) % 16) - 8, ((yy - cy + 8) % 16) - 8) / r + R.uniform(-0.25, 0.25, (16, 16))
        for lvl, thr in ((1, 1.0), (2, 0.75), (3, 0.5)):
            a[d < thr, :3] = rust[lvl + 1] if lvl == 3 else rust[lvl]
    for _ in range(3):
        x, y = int(R.integers(0, 16)), int(R.integers(0, 10))
        for k in range(int(R.integers(3, 7))):
            if y + k < 16:
                a[y + k, x, :3] = rust[1]
    a[..., 3] = 255
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8), "RGBA")


def oil_slick(seed):
    """Black oil with thin-film rainbow sheen."""
    R = rng(seed)
    yy, xx = np.mgrid[0:16, 0:16]
    f = np.sin((xx + yy * 0.6) / 2.4 + R.uniform(0, 6)) + np.sin((xx * 0.4 - yy) / 3.1 + R.uniform(0, 6))
    t = (f - f.min()) / (np.ptp(f) + 1e-6)
    a = np.zeros((16, 16, 4))
    for y in range(16):
        for x in range(16):
            v = t[y, x]
            if v > 0.8:
                r, g, b = colorsys.hsv_to_rgb((v * 2.3) % 1.0, 0.4, 0.24)
                a[y, x, :3] = (r * 255, g * 255, b * 255)
            else:
                a[y, x, :3] = _rgb("#0c0a0e") + v * 22
    a[..., 3] = 255
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8), "RGBA")


SCRAP_PILE = Boulder(blocks=[("scrapheap_junk", 5), ("scrapheap_scrap_plate", 3), ("scrapheap_slag", 2),
                             ("minecraft:iron_bars", 1), ("minecraft:iron_chain", 1)],
                     radius=(3, 6), squash=0.75)

DIMENSION = Dimension(
    id="scrapheap",
    code="S-9",
    name="Scrapheap",
    tagline="Somewhere, everything ever thrown away ends up here",
    description=("A whole planet of junk under a smog-orange sky and a shattered moon: rust-dust plains, mountains "
                 "of compacted scrap, black oil fens and the rusting skeletons of machines the size of cathedrals, "
                 "their gears half-sunk in the dust. Rust Rats scatter at your footsteps and the Junk Golems only "
                 "fight if you start it - but the Scrap Drones shoot first and never ask."),
    danger=3,
    color="#d08440",
    terrain=Terrain(style="hills", stone="scrapheap_slag", sea_level=60, height=72, amplitude=22, scale=1.0,
                    roughness=0.2, ores=True,
                    params={"rivers": 0.25, "detail": 0.5, "biome_size": 280, "cliffs": True,
                            "cliff_block": "scrapheap_slag", "peak_block": "scrapheap_junk", "peak_y": 104,
                            "ceiling_block": "scrapheap_grime", "beach_block": "scrapheap_oil_slick",
                            "beach_height": 1}),
    sky=Sky(sky_color="#c8946a", fog_color="#a87c58", water_fog_color="#0a0808", fog_start=20, fog_end=150,
            cloud_color="#b0805838", cloud_height=150, time="afternoon", sunrise_color="#ccff7a30",
            sky_light_color="#ffd0a0",
            bodies=[Celestial("shattered_moon", ["#b0a090", "#7a6a5a", "#d08440"], size=64, yaw=150, pitch=40,
                              roll=10, seed="scrap-moon"),
                    Celestial("ringed_planet", ["#8a5a3a", "#c08a5a", "#e0c090"], size=34, yaw=250, pitch=58,
                              roll=25, seed="scrap-planet")]),
    blocks=[
        Block("scrapheap_rust_dust", "Rust Dust", "soil", {"all": tex("sand", P_RUST[1:], seed="scrap-dust")},
              hardness=0.6, sound="sand", map_color="color_orange"),
        Block("scrapheap_grime", "Grime", "soil", {"all": tex("dirt", P_GRIME, seed="scrap-grime")}, hardness=0.6,
              sound="gravel", map_color="color_brown"),
        Block("scrapheap_slag", "Slag", "stone", {"all": tex("rough_stone", P_SLAG, seed="scrap-slag")}, hardness=1.8,
              map_color="color_gray"),
        Block("scrapheap_scrap_plate", "Rusted Plating", "solid", {"all": tex(rusted_plate, "scrap-plate")},
              hardness=3.0, sound="metal", tool="pickaxe", map_color="color_orange"),
        Block("scrapheap_junk", "Compacted Junk", "solid", {"all": tex(junk_mosaic, "scrap-junk")}, hardness=2.0,
              sound="metal", tool="pickaxe", map_color="color_brown"),
        Block("scrapheap_girder", "Steel Girder", "solid", {"all": tex(girder, "scrap-girder")}, hardness=3.5,
              sound="metal", tool="pickaxe", map_color="metal"),
        Block("scrapheap_oil_slick", "Oil Slick", "sticky", {"all": tex(oil_slick, "scrap-oil")}, hardness=0.8,
              sound="honey", speed=0.5, jump=0.6, map_color="color_black"),
        Block("scrapheap_exhaust_vent", "Exhaust Vent", "vent", {
            "top": tex("metal", ["#1a1a1e", "#2a2a30", "#3a3a42", "#4a4a54", "#5a5a66"], seed="scrap-vent"),
            "side": tex(rusted_plate, "scrap-vent-side")}, hardness=2.5, sound="metal", tool="pickaxe",
              particle="minecraft:large_smoke", effect="minecraft:nausea", effect_seconds=4, map_color="color_black"),
        Block("scrapheap_neon_sign", "Flickering Neon", "glow", {"all": tex(neon_sign, "scrap-neon", frames=8,
                                                                         frametime=3)},
              hardness=1.0, sound="glass", light=12, emissive=True, map_color="color_pink"),
        Block("scrapheap_wire_weed", "Wire Weed", "plant",
              {"cross": tex("wire_sprite", ["#8a4a20", "#c06a30", "#e09050", "#50a0d0"], seed="scrap-wire")},
              hardness=0.0, sound="chain"),
        Block("scrapheap_cog_bloom", "Cog Bloom", "plant",
              {"cross": tex("gear_sprite", ["#6a3a1c", "#a86a36", "#d0a060", "#f0d090"], seed="scrap-cog")},
              hardness=0.0, sound="chain"),
    ],
    items=[
        Item("scrapheap_scrap_bolt", "Scrap Bolt", tex("item_icon", "bolt", P_STEEL[1:], seed="scrap-bolt"),
             lore="Fits nothing. Fits everything. Depends how hard you hit it."),
        Item("scrapheap_drone_core", "Drone Core", tex("item_icon", "core", ["#3a1010", "#ff3020", "#ffd040", "#ffffff"],
                                                      seed="scrap-core"),
             rarity="uncommon", lore="Still warm. Still angry."),
        Item("scrapheap_rat_jerky", "Questionable Jerky", tex("item_icon", "meat_cooked", ["#4a2a14", "#8a5a30", "#c08a50"],
                                                             seed="scrap-jerky"),
             kind="food", food=Food(5, 0.5, effects=[Effect("minecraft:strength", 30, 0),
                                                     Effect("minecraft:hunger", 10, 0, chance=0.3)]),
             lore="Chewy, metallic, and probably rat."),
    ],
    creatures=[
        Creature("junk_golem", "Junk Golem", "golem", ["#8a5a32", "#5a6470", "#e0b020", "#40e0ff", "#c03020"],
                 pattern="patches", size=1.6,
                 body={"gears": True, "chimney": True, "shoulders": True, "core": True, "eyes": 1, "eye_size": 3,
                       "eye_style": "glow", "antennae": 4, "glow_tips": True, "head_size": 1.0, "arm_len": 16,
                       "arm_w": 5, "spikes": 2},
                 behavior="neutral", health=90, damage=10, speed=0.22, armor=8, abilities=["shield", "regen"],
                 tempt="scrapheap_scrap_bolt",
                 drops=[Drop("scrapheap_scrap_bolt", 2, 5), Drop("minecraft:iron_ingot", 0, 2),
                        Drop("minecraft:copper_ingot", 0, 2)],
                 sounds="iron_golem", pitch=0.7, xp=25, group=1, tracking=10,
                 description="A walking landfill that patiently rebuilds itself from whatever it steps on."),
        Creature("scrap_drone", "Scrap Drone", "flyer", ["#5a6470", "#2a2e34", "#e0b020", "#ff3020"],
                 pattern="stripes", size=0.8,
                 body={"kind": "insect", "wings": 2, "eyes": 1, "eye_size": 3, "eye_style": "glow", "antennae": 3,
                       "glow_tips": True, "body_len": 8, "legs": 0},
                 behavior="hostile", attack="ranged", health=14, damage=3, speed=0.3, armor=2,
                 ranged={"color": "#ffd040", "damage": 3, "cooldown": 45, "speed": 1.3, "particle": "minecraft:electric_spark",
                         "size": 0.25},
                 drops=[Drop("scrapheap_drone_core", 0, 1, chance=0.35), Drop("scrapheap_scrap_bolt", 0, 2)],
                 sounds="bee", pitch=0.55, xp=7, group=2, spawn_light="any",
                 description="A rattling surveillance drone that never got the message the war was over."),
        Creature("rust_rat", "Rust Rat", "crawler", ["#8a5a3a", "#c49a6a", "#ff9a9a", "#ff3010"], pattern="speckle",
                 size=0.55,
                 body={"kind": "rat", "whiskers": True, "ears": "round", "tail": 2, "tail_len": 5, "eye_style": "glow",
                       "snout": 2},
                 behavior="skittish", health=6, speed=0.34, tempt="scrapheap_scrap_bolt",
                 drops=[Drop("scrapheap_rat_jerky", 0, 1), Drop("minecraft:iron_nugget", 0, 2)],
                 sounds="rabbit", pitch=1.4, xp=1, group=4,
                 description="It has eaten so much rusted iron that it clanks when it runs."),
    ],
    biomes=[
        Biome("scrapheap_rust_plains", "Rust Plains", top="scrapheap_rust_dust", under="scrapheap_grime",
              temperature=0.0, humidity=-0.3, elevation=0.0, grass_color="#8a6a3a", foliage_color="#7a5a30",
              water_color="#2a2420", water_fog_color="#0a0808",
              surface_noise=[("scrapheap_grime", 0.6), ("scrapheap_scrap_plate", 0.75)],
              particles=[("dust:#c07a40:0.8", 0.006), ("minecraft:white_ash", 0.002)],
              ambient="wind_howl", music="minecraft:music.overworld.badlands",
              features=[
                  Patch(block="scrapheap_wire_weed", count=4, tries=32),
                  Patch(block="scrapheap_cog_bloom", count=2, tries=16),
                  Structure(kind="gear", blocks={"main": "scrapheap_scrap_plate", "axle": "scrapheap_girder"},
                            size=(6, 10), params={"pair": 0}, chance=6),
                  Boulder(blocks=[("scrapheap_junk", 3), ("scrapheap_scrap_plate", 2)], radius=(1, 3), squash=0.7,
                          count=1, chance=2),
                  Patch(block="scrapheap_exhaust_vent", count=1, tries=3, chance=3),
                  Patch(blocks=[("minecraft:iron_bars", 2), ("minecraft:iron_chain", 1)], count=1, tries=6, chance=2),
              ],
              spawns=[Spawn("rust_rat", 12, (2, 4)), Spawn("junk_golem", 3, (1, 1)), Spawn("scrap_drone", 4, (1, 2))]),
        Biome("scrapheap_scrap_mounds", "Scrap Mountains", top="scrapheap_junk", under="scrapheap_junk",
              temperature=0.5, humidity=0.2, elevation=0.4, grass_color="#7a6a4a", water_color="#2a2420",
              surface_noise=[("scrapheap_scrap_plate", 0.3), ("scrapheap_rust_dust", 0.5)],
              particles=[("dust:#a0a8b4:0.6", 0.003), ("minecraft:smoke", 0.002)],
              ambient="clockwork", music="minecraft:music.overworld.stony_peaks",
              features=[
                  SCRAP_PILE,
                  Boulder(blocks=[("scrapheap_junk", 3), ("scrapheap_scrap_plate", 2), ("scrapheap_girder", 1)],
                          radius=(2, 4), squash=1.0, count=1),
                  Spire(blocks=[("scrapheap_junk", 3), ("scrapheap_scrap_plate", 2), ("scrapheap_girder", 2)],
                        tip="scrapheap_neon_sign", height=(12, 24), radius=(2, 4), lean=0.35, count=1, chance=2),
                  Structure(kind="cuboids", blocks={"main": "scrapheap_scrap_plate", "alt": "scrapheap_junk",
                                                    "trim": "scrapheap_girder"},
                            size=(4, 8), params={"scatter": 4}, chance=3),
                  Patch(block="scrapheap_wire_weed", count=2, tries=16),
              ],
              spawns=[Spawn("junk_golem", 5, (1, 1)), Spawn("scrap_drone", 5, (1, 2)), Spawn("rust_rat", 8, (2, 3))]),
        Biome("scrapheap_oil_fens", "Oil Fens", top="scrapheap_grime", under="scrapheap_grime",
              temperature=-0.5, humidity=0.6, elevation=-0.45, underwater="scrapheap_oil_slick",
              grass_color="#4a4030", water_color="#14101a", water_fog_color="#060408", fog_color="#6a5444",
              surface_noise=[("scrapheap_oil_slick", 0.35)],
              particles=[("minecraft:smoke", 0.004), ("minecraft:small_flame", 0.0008)],
              ambient="sizzle_toxic", music="minecraft:music.nether.nether_wastes",
              features=[
                  Disk(block="scrapheap_oil_slick", replace=["scrapheap_grime", "scrapheap_rust_dust"], radius=(2, 5),
                       count=2),
                  Patch(block="scrapheap_exhaust_vent", count=2, tries=4),
                  Structure(kind="tendril", blocks={"main": "scrapheap_scrap_plate", "tip": "scrapheap_exhaust_vent"},
                            size=(6, 11), params={"curl": 0.35, "thickness": 0.8}, chance=3),
                  Spire(blocks=[("scrapheap_girder", 3), ("scrapheap_scrap_plate", 1)], tip="scrapheap_exhaust_vent",
                        height=(8, 16), radius=(1, 1), count=1, chance=3),
                  Patch(block="scrapheap_wire_weed", count=3, tries=20),
              ],
              spawns=[Spawn("rust_rat", 10, (2, 4)), Spawn("scrap_drone", 4, (1, 2))]),
        Biome("scrapheap_machine_graveyard", "Machine Graveyard", top="scrapheap_rust_dust", under="scrapheap_grime",
              temperature=-0.5, humidity=-0.6, elevation=0.15, grass_color="#8a6a3a", water_color="#2a2420",
              surface_noise=[("scrapheap_scrap_plate", 0.4), ("scrapheap_junk", 0.55)],
              particles=[("minecraft:electric_spark", 0.002), ("dust:#c07a40:0.8", 0.004)],
              ambient="electric_buzz", music="minecraft:music.overworld.desert",
              features=[
                  Structure(kind="gear", blocks={"main": "scrapheap_scrap_plate", "axle": "scrapheap_girder"},
                            size=(10, 14), chance=3),
                  Structure(kind="ribcage", blocks={"bone": "scrapheap_girder", "spine": "scrapheap_scrap_plate"},
                            size=(10, 14), params={"skull": 0, "height": 1.2}, chance=3),
                  Structure(kind="monolith", blocks={"main": "scrapheap_scrap_plate"}, size=(10, 16), chance=8),
                  Spire(blocks=[("scrapheap_girder", 4), ("scrapheap_junk", 1)], tip="scrapheap_neon_sign",
                        height=(10, 18), radius=(1, 2), lean=0.5, count=1, chance=2),
                  Patch(block="scrapheap_cog_bloom", count=3, tries=24),
                  Patch(block="scrapheap_neon_sign", count=1, tries=2, chance=3),
                  Boulder(blocks=[("scrapheap_junk", 2), ("scrapheap_scrap_plate", 2)], radius=(1, 2), squash=0.8,
                          count=1),
              ],
              spawns=[Spawn("junk_golem", 6, (1, 1)), Spawn("scrap_drone", 6, (1, 3)), Spawn("rust_rat", 6, (1, 3))]),
    ],
    effects=[],
    ambient="wind_howl",
    music="minecraft:music.overworld.badlands",
    icon="portalgun:scrapheap_drone_core",
)
