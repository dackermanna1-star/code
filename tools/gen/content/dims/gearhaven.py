"""T-1890 Gearhaven - a clockwork brass world of giant gears, smokestacks and copper pipes."""
from gen.content.dsl import *

# palette: polished brass, warm copper, verdigris, soot, steam white, amber glow
BRASS = "#d0a040"
COPPER = "#c86a3a"
VERDIGRIS = "#4aa088"
AMBER = "#ffc860"
P_BRASS = ["#6a4a18", "#94692a", "#c0903a", "#e0b85a", "#fae08a"]
P_COPPER = ["#5a2a14", "#86401e", "#b0582a", "#d4783c", "#f0a060"]
P_PATINA = ["#1e5a4a", "#2a7a62", "#3c9a7a", "#5cb894", "#8ad8b4"]
P_SLAG = ["#2a2420", "#3a322c", "#4a4038", "#5c5046", "#6e6254"]
P_IRON = ["#3a3634", "#4a4542", "#5a5450", "#6c6560", "#7e7670"]
P_BRICK = ["#3a1a14", "#5a2a1e", "#7a3a28", "#944a34", "#2a2420"]


def _hex(c):
    c = c.lstrip("#")
    return [int(c[i:i + 2], 16) for i in (0, 2, 4)]


def _ramp(pal, t):
    import numpy as np
    cols = [np.array(_hex(c), float) for c in pal]
    t = max(0.0, min(0.999, t)) * (len(cols) - 1)
    i = int(t)
    f = t - i
    return cols[i] * (1 - f) + cols[min(i + 1, len(cols) - 1)] * f


def _pipe_side(pal, seed):
    """Copper pipe seen from the side: cylindrical shading, flanged bands with rivets top and bottom."""
    import math
    import numpy as np
    from PIL import Image
    from gen.noise import rng
    r = rng(seed)
    a = np.zeros((16, 16, 4))
    a[..., 3] = 255
    for y in range(16):
        for x in range(16):
            u = (x + 0.5) / 16
            shade = 0.25 + 0.7 * math.sin(u * math.pi) ** 0.8 - 0.18 * u
            col = _ramp(pal, shade + 0.05 * (r.random() - 0.5))
            if y in (0, 1, 14, 15):
                col = _ramp(pal, shade * 0.75)
                if y in (1, 14) and x % 4 == 2:
                    col = _ramp(pal, 0.95)
            if y in (2, 13):
                col = _ramp(pal, 0.08)
            a[y, x, :3] = col
    # a little green patina creeping in
    pat = [np.array(_hex(c), float) for c in P_PATINA]
    for _ in range(5):
        x, y = int(r.integers(0, 16)), int(r.integers(3, 13))
        a[y, x, :3] = pat[int(r.integers(1, 4))]
    return Image.fromarray(a.clip(0, 255).astype("uint8"), "RGBA")


def _pipe_end(pal, seed):
    """Pipe opening: copper ring around a dark bore."""
    import math
    import numpy as np
    from PIL import Image
    a = np.zeros((16, 16, 4))
    a[..., 3] = 255
    for y in range(16):
        for x in range(16):
            d = math.hypot(x + 0.5 - 8, y + 0.5 - 8)
            if d < 4.2:
                col = np.array([20, 14, 12], float) + (4.2 - d) * 2
            elif d < 5.2:
                col = _ramp(pal, 0.15)
            elif d < 7.4:
                col = _ramp(pal, 0.55 + 0.35 * (1 - abs(d - 6.3) / 1.2) - 0.15 * ((x - y) / 16))
            else:
                col = _ramp(pal, 0.3)
            a[y, x, :3] = col
    return Image.fromarray(a.clip(0, 255).astype("uint8"), "RGBA")


def _grate(pal, seed):
    """Vent grate: dark pit under brass bars with a riveted frame."""
    import numpy as np
    from PIL import Image
    a = np.zeros((16, 16, 4))
    a[..., 3] = 255
    for y in range(16):
        for x in range(16):
            e = min(x, y, 15 - x, 15 - y)
            if e <= 1:
                col = _ramp(pal, 0.75 if e == 0 else 0.45)
                if e == 1 and (x in (1, 14)) and (y in (1, 14)):
                    col = _ramp(pal, 1.0)
            elif x % 3 == 0:
                col = _ramp(pal, 0.6 - 0.25 * (y / 16))
            else:
                col = np.array([30, 22, 18], float) + 30 * (1 - abs(y - 7.5) / 8)
            a[y, x, :3] = col
    return Image.fromarray(a.clip(0, 255).astype("uint8"), "RGBA")


def _brass_panel(pal, seed):
    """Polished brass panel: bevelled frame, corner rivets, engraved centre ring and a diagonal sheen."""
    import math
    import numpy as np
    from PIL import Image
    from gen.noise import rng
    r = rng(seed)
    a = np.zeros((16, 16, 4))
    a[..., 3] = 255
    for y in range(16):
        for x in range(16):
            sheen = 0.18 * math.exp(-((x + y - 12) ** 2) / 10) + 0.1 * math.exp(-((x + y - 20) ** 2) / 3)
            t = 0.55 + sheen + 0.04 * (r.random() - 0.5) - 0.1 * (y / 16)
            if x == 0 or y == 0:
                t = 0.85
            elif x == 15 or y == 15:
                t = 0.2
            elif x == 1 or y == 1:
                t = 0.7
            elif x == 14 or y == 14:
                t = 0.35
            d = math.hypot(x + 0.5 - 8, y + 0.5 - 8)
            if 3.3 < d < 4.3:
                t -= 0.25 if (x + y) > 15 else -0.12
            a[y, x, :3] = _ramp(pal, t)
    for x, y in ((2, 2), (13, 2), (2, 13), (13, 13)):
        a[y, x, :3] = _ramp(pal, 1.0)
        a[y + 1, x, :3] = _ramp(pal, 0.15)
    return Image.fromarray(a.clip(0, 255).astype("uint8"), "RGBA")


def _clockface(seed):
    """A little glowing clock: cream dial, brass bezel, hour ticks and two hands."""
    import math
    import numpy as np
    from PIL import Image
    from gen.noise import rng
    r = rng(seed)
    a = np.zeros((16, 16, 4))
    a[..., 3] = 255
    cream = np.array(_hex("#fff0c8"), float)
    ink = np.array(_hex("#2a1a10"), float)
    for y in range(16):
        for x in range(16):
            d = math.hypot(x + 0.5 - 8, y + 0.5 - 8)
            if d < 6.2:
                col = cream - (d / 6.2) * 26
            elif d < 7.6:
                col = _ramp(P_BRASS, 0.85 - 0.4 * ((x + y) / 30))
            else:
                col = _ramp(P_BRASS, 0.25)
            a[y, x, :3] = col
    for k in range(12):
        ang = k * math.pi / 6
        rr = 5.2 if k % 3 else 4.8
        x = int(round(7.5 + math.cos(ang) * rr))
        y = int(round(7.5 + math.sin(ang) * rr))
        a[y, x, :3] = ink if k % 3 == 0 else ink * 0.4 + cream * 0.6
    h = r.random() * 2 * math.pi
    m = r.random() * 2 * math.pi
    for t in np.linspace(0, 1, 12):
        a[int(round(7.5 + math.sin(h) * 3 * t)), int(round(7.5 + math.cos(h) * 3 * t)), :3] = ink
        a[int(round(7.5 + math.sin(m) * 4.6 * t)), int(round(7.5 + math.cos(m) * 4.6 * t)), :3] = np.array(_hex("#a02010"), float)
    a[7:9, 7:9, :3] = _ramp(P_BRASS, 0.9)
    return Image.fromarray(a.clip(0, 255).astype("uint8"), "RGBA")


def _hot_plate(seed, frames=1):
    """Boiler plate: riveted iron glowing cherry-orange, gently pulsing."""
    import numpy as np
    from PIL import Image
    from gen.textures import metal
    base = np.asarray(metal(["#5a1a08", "#8a2a0c", "#c04a14", "#ff7a28", "#ffc060"], seed).convert("RGBA"), float)
    out = []
    n = max(1, frames)
    for k in range(n):
        f = 0.85 + 0.15 * np.cos(2 * np.pi * k / n)
        a = base.copy()
        a[..., :3] = np.minimum(255, a[..., :3] * f)
        out.append(Image.fromarray(a.clip(0, 255).astype("uint8"), "RGBA"))
    return out if frames > 1 else out[0]


DIMENSION = Dimension(
    id="gearhaven",
    code="T-1890",
    name="Gearhaven",
    tagline="A world that runs on steam and never stops ticking",
    description=("Someone wound this world up and walked away. Brass-plated terraces step up toward smokestacks and "
                 "clock spires, gears the size of houses stand half-buried in verdigris, and copper pipes arch over "
                 "hissing steam vents. Brass Automatons keep the place running and dislike being interrupted; "
                 "Cogspiders skitter out of the machinery looking for spare parts - yours."),
    danger=3,
    color=BRASS,
    terrain=Terrain(style="terraces", stone="gearhaven_ironstone", sea_level=52, height=74, amplitude=24, roughness=0.05,
                    deepslate="minecraft:deepslate",
                    params={"step": 7, "smoothness": 0.06, "rivers": 0.0, "cliffs": True,
                            "cliff_block": "gearhaven_brass_plate", "biome_size": 300,
                            "beach_block": "gearhaven_slag", "beach_height": 1}),
    sky=Sky(sky_color="#c8a070", fog_color="#b8946a", fog_start=28, fog_end=170, cloud_color="#a0705a48",
            cloud_height=170, time="afternoon", sunrise_color="#ccff9a40", sky_light_color="#ffe0b0",
            bodies=[
                Celestial("ringed_planet", ["#5a3a14", BRASS, "#fae08a"], size=80, yaw=200, pitch=42, speed=4,
                          seed="gear-orrery"),
                Celestial("moon", ["#6a3a1a", COPPER, "#f0a060"], size=22, yaw=150, pitch=62, speed=9, seed="gear-moon1"),
                Celestial("moon", ["#1e5a4a", VERDIGRIS, "#8ad8b4"], size=14, yaw=240, pitch=70, speed=14,
                          seed="gear-moon2"),
            ]),
    blocks=[
        Block("gearhaven_patina_turf", "Patina Turf", "grass", {
            "top": tex("moss", P_PATINA, seed="gear-patina"),
            "side": tex("grass_side", P_PATINA, P_SLAG, seed="gear-patina"),
            "bottom": tex("gravel", P_SLAG, seed="gear-slag")}, hardness=0.7, sound="moss", map_color="color_cyan"),
        Block("gearhaven_slag", "Slag Gravel", "soil", {"all": tex("gravel", P_SLAG, seed="gear-slag")}, hardness=0.6,
              sound="gravel", map_color="color_brown"),
        Block("gearhaven_ironstone", "Ironstone", "stone", {"all": tex("stone", P_IRON, seed="gear-iron")}, hardness=1.8,
              map_color="stone"),
        Block("gearhaven_brass_plate", "Brass Plating", "stone", {"all": tex(_brass_panel, P_BRASS, "gear-brass")},
              hardness=3.0, resistance=9.0, sound="metal", map_color="gold"),
        Block("gearhaven_copper_pipe", "Copper Pipe", "log", {"side": tex(_pipe_side, P_COPPER, "gear-pipe"),
                                                              "end": tex(_pipe_end, P_COPPER, "gear-pipe-end")},
              hardness=2.5, sound="copper", tool="pickaxe", map_color="color_orange"),
        Block("gearhaven_steam_vent", "Steam Vent", "vent", {"top": tex(_grate, P_BRASS, "gear-grate"),
                                                            "side": tex("metal", P_IRON, seed="gear-vent-side")},
              hardness=2.0, sound="metal", particle="minecraft:campfire_cosy_smoke", map_color="metal"),
        Block("gearhaven_soot_brick", "Soot Brick", "stone", {"all": tex("bricks", P_BRICK[:4], seed="gear-brick")},
              hardness=2.0, map_color="terracotta_red"),
        Block("gearhaven_clockface", "Clockface", "glow", {"all": tex(_clockface, "gear-clock")}, hardness=1.0,
              sound="glass", light=13, emissive=True, map_color="color_yellow"),
        Block("gearhaven_boiler_plate", "Boiler Plate", "hazard", {"all": tex(_hot_plate, "gear-hot", frames=12, frametime=3)},
              hardness=3.0, sound="metal", light=8, emissive=True, damage=1.0, damage_type="hot_floor",
              tool="pickaxe", map_color="color_red"),
        Block("gearhaven_cog_sprout", "Cog Sprout", "plant", {"cross": tex("gear_sprite", P_BRASS, seed="gear-cogsprout")},
              hardness=0.0, sound="chain"),
        Block("gearhaven_copper_coil", "Copper Coil", "plant",
              {"cross": tex("wire_sprite", ["#2a2420", "#4a4038", "#6a5a4a", "#8a7a68", "#aaa090"], seed="gear-coil")},
              hardness=0.0, sound="chain", light=3),
        Block("gearhaven_brass_foliage", "Brass Foliage", "leaves", {"all": tex("leaves", P_BRASS[1:], seed="gear-leaf",
                                                                               holes=0.4)},
              hardness=0.3, sound="chain", map_color="gold"),
    ],
    items=[
        Item("gearhaven_wind_up_biscuit", "Wind-Up Biscuit", tex("item_icon", "coin", ["#8a5a2a", "#d0a060", "#f8e0a0"],
                                                                 seed="gear-biscuit"),
             kind="food", food=Food(5, 0.5, always=True, effects=[Effect("minecraft:haste", 30, 1),
                                                                  Effect("minecraft:speed", 15, 0)]),
             lore="Turn the key twice before eating."),
        Item("gearhaven_cog", "Loose Cog", tex("item_icon", "gear", P_COPPER[1:], seed="gear-cog"),
             lore="Twelve teeth. No idea where it goes."),
        Item("gearhaven_mainspring", "Mainspring", tex("item_icon", "core", P_BRASS[1:], seed="gear-spring"), rarity="rare",
             glint=True, lore="Wound tight enough to run a city for a week."),
    ],
    creatures=[
        Creature("brass_automaton", "Brass Automaton", "golem", [BRASS, "#7a4a20", AMBER, "#60e0ff"], pattern="rings",
                 size=1.3,
                 body={"gears": True, "chimney": True, "shoulders": True, "core": True, "head_size": 0.85,
                       "eye_style": "glow", "mouth": "none"},
                 behavior="neutral", health=70, damage=9, armor=8, speed=0.22, abilities=["charge"],
                 drops=[Drop("gearhaven_mainspring", 0, 1, chance=0.3), Drop("gearhaven_cog", 1, 3),
                        Drop("minecraft:copper_ingot", 0, 2)],
                 sounds="iron_golem", pitch=1.3, xp=15, group=1, tracking=10,
                 description="Tireless caretaker of the machinery. Polite, until you get in the way of its rounds."),
        Creature("cogspider", "Cogspider", "crawler", [COPPER, BRASS, AMBER, "#ff4020"], pattern="rings", size=0.9,
                 body={"kind": "spider", "legs": 4, "leg_len": 9, "eyes": 6, "eye_style": "glow", "shell": True,
                       "antennae": 0},
                 behavior="hostile", health=16, damage=4, speed=0.3, armor=3, abilities=["climb", "leap"],
                 drops=[Drop("gearhaven_cog", 0, 2), Drop("minecraft:string", 0, 1)],
                 sounds="spider", pitch=1.5, xp=6, group=3,
                 description="Copper legs, clockwork heart, and a deep interest in anything with screws."),
        Creature("steam_moth", "Steam Moth", "flyer", ["#6a625a", BRASS, AMBER, "#ffe080"], pattern="speckle", size=0.8,
                 body={"kind": "moth", "fluffy": True, "antennae": 4, "wing_span": 12},
                 behavior="passive", health=6, speed=0.22,
                 drops=[Drop("gearhaven_wind_up_biscuit", 0, 1, chance=0.35), Drop("minecraft:string", 0, 1)],
                 sounds="bat", pitch=1.6, xp=2, group=4,
                 description="Drinks steam, sheds soot, and is drawn to every clockface it sees."),
    ],
    biomes=[
        Biome("gearhaven_cogwork_terraces", "Cogwork Terraces", top="gearhaven_patina_turf", under="gearhaven_slag",
              temperature=0.0, humidity=0.1, grass_color="#3c9a7a", foliage_color=BRASS, water_color=VERDIGRIS,
              water_fog_color="#1a4a3a", particles=[("minecraft:white_ash", 0.004)], ambient="clockwork",
              features=[
                  Structure(kind="gear", blocks={"main": "gearhaven_brass_plate", "axle": "gearhaven_copper_pipe"},
                            size=(5, 9), count=1, chance=2),
                  Structure(kind="gear", blocks={"main": "gearhaven_brass_plate", "axle": "gearhaven_copper_pipe"},
                            size=(10, 12), params={"flat": 0, "pair": 1}, count=1, chance=7),
                  Tree(log="gearhaven_copper_pipe", leaves="gearhaven_brass_foliage", shape="fancy", height=(6, 10),
                       count=1, chance=2),
                  Patch(block="gearhaven_cog_sprout", count=3, tries=16),
                  Patch(block="gearhaven_copper_coil", count=2, tries=10),
              ],
              spawns=[Spawn("steam_moth", 10, (2, 4)), Spawn("brass_automaton", 4, (1, 1)), Spawn("cogspider", 3, (1, 2))]),
        Biome("gearhaven_boilerworks", "Boilerworks", top="gearhaven_slag", under="gearhaven_slag", temperature=0.7,
              humidity=-0.5, grass_color="#5a5046", foliage_color=BRASS, water_color="#6a7a6a",
              water_fog_color="#2a2a24", fog_color="#9a7a5a", fog_end=110,
              particles=[("minecraft:smoke", 0.006), ("minecraft:white_ash", 0.01)], ambient="volcanic_rumble",
              surface_noise=[("gearhaven_boiler_plate", 0.8), ("gearhaven_soot_brick", 0.55)],
              features=[
                  Spire(blocks=[("gearhaven_soot_brick", 4), ("gearhaven_brass_plate", 1)], tip="gearhaven_steam_vent",
                        height=(12, 24), radius=(1, 2), count=1, chance=2),
                  Structure(kind="geyser", blocks={"vent": "gearhaven_steam_vent", "mound": "gearhaven_soot_brick"},
                            size=(4, 7), count=1, chance=3),
                  Structure(kind="gear", blocks={"main": "gearhaven_brass_plate", "axle": "gearhaven_copper_pipe"},
                            size=(5, 8), params={"flat": 1}, count=1, chance=4),
                  Patch(block="gearhaven_copper_coil", count=2, tries=10),
              ],
              spawns=[Spawn("cogspider", 5, (1, 3)), Spawn("brass_automaton", 3, (1, 1)), Spawn("steam_moth", 6, (1, 3))]),
        Biome("gearhaven_pipeworks", "Copper Pipeworks", top="gearhaven_patina_turf", under="gearhaven_slag",
              temperature=-0.5, humidity=0.6, elevation=-0.3, grass_color="#2a7a62", foliage_color=COPPER,
              water_color=VERDIGRIS, water_fog_color="#1a4a3a", particles=[("minecraft:dripping_water", 0.004)],
              ambient="bubbling",
              features=[
                  Structure(kind="arch", blocks={"main": "gearhaven_copper_pipe", "alt": "gearhaven_brass_plate"},
                            size=(6, 11), params={"thickness": 1.3}, count=1, chance=2),
                  Structure(kind="tendril", blocks={"main": "gearhaven_copper_pipe", "tip": "gearhaven_steam_vent"},
                            size=(6, 10), params={"curl": 0.35, "thickness": 0.8}, count=1, chance=2),
                  Tree(log="gearhaven_copper_pipe", leaves="gearhaven_brass_foliage", shape="fancy", height=(6, 9),
                       count=1, chance=3),
                  Patch(block="gearhaven_copper_coil", count=4, tries=16),
                  Patch(block="gearhaven_cog_sprout", count=1, tries=8),
              ],
              spawns=[Spawn("steam_moth", 12, (2, 4)), Spawn("cogspider", 3, (1, 2)), Spawn("brass_automaton", 2, (1, 1))]),
        Biome("gearhaven_clockwork_heights", "Clockwork Heights", top="gearhaven_slag", under="gearhaven_ironstone",
              temperature=-0.2, humidity=-0.6, elevation=0.6, grass_color="#5cb894", foliage_color=BRASS,
              water_color=VERDIGRIS, fog_color="#d0b080", particles=[("dust:#ffc860:0.7", 0.003)], ambient="clockwork",
              music="minecraft:music.overworld.stony_peaks",
              surface_noise=[("gearhaven_brass_plate", 0.55), ("gearhaven_patina_turf", 0.2)],
              features=[
                  Structure(kind="monolith", blocks={"main": "gearhaven_clockface"}, size=(6, 10), count=1, chance=6),
                  Structure(kind="gear", blocks={"main": "gearhaven_brass_plate", "axle": "gearhaven_copper_pipe"},
                            size=(7, 11), params={"flat": 0}, count=1, chance=4),
                  Spire(blocks=[("gearhaven_brass_plate", 3), ("gearhaven_soot_brick", 1)], tip="gearhaven_clockface",
                        height=(14, 26), radius=(2, 3), count=1, chance=4),
                  Structure(kind="gear", blocks={"main": "gearhaven_brass_plate", "axle": "gearhaven_clockface"},
                            size=(6, 10), params={"flat": 1}, count=1, chance=6),
                  Patch(block="gearhaven_cog_sprout", count=2, tries=10),
              ],
              spawns=[Spawn("brass_automaton", 6, (1, 2)), Spawn("steam_moth", 8, (1, 3)), Spawn("cogspider", 2, (1, 1))]),
    ],
    effects=[],
    music="minecraft:music.overworld.stony_peaks",
    ambient="clockwork",
    platform="gearhaven_brass_plate",
    icon="portalgun:gearhaven_mainspring",
)
