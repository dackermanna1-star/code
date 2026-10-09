"""X-01 Synthwave - a retro neon grid world frozen in an eternal sunset."""
from gen.content.dsl import *

# palette: midnight violet, hot magenta, electric cyan, sunset orange, sun yellow, chrome
NIGHT = "#170b30"
MAGENTA = "#ff2bd6"
CYAN = "#21f4ff"
SUNSET = "#ff7a3d"
SUNYELLOW = "#ffd84a"
P_CHROME = ["#2e3250", "#565c80", "#8a92b8", "#c4cce8", "#f2f6ff"]
P_SOIL = ["#140a26", "#1e1036", "#2a1748", "#38205c"]
P_BARK = ["#1a0e2e", "#2a1646", "#3c2060", "#52307a"]
P_FROND = ["#0a6a8a", "#10a4c8", CYAN, "#a8fcff"]


def _hexrgb(c):
    c = c.lstrip("#")
    return [int(c[i:i + 2], 16) for i in (0, 2, 4)]


def _chevrons(bg, fg, seed, frames=1):
    """Hyperdrive strip: dark asphalt with glowing chevrons that scroll forward (animated)."""
    import numpy as np
    from PIL import Image
    from gen.noise import rng
    b = np.array(_hexrgb(bg), float)
    f = np.array(_hexrgb(fg), float)
    r = rng(seed)
    grain = r.random((16, 16))
    out = []
    n = max(1, frames)
    for k in range(n):
        a = np.zeros((16, 16, 4))
        a[..., 3] = 255
        for y in range(16):
            for x in range(16):
                a[y, x, :3] = b * (0.85 + 0.25 * grain[y, x])
                # side rails
                if x in (0, 15):
                    a[y, x, :3] = f * 0.55 + b * 0.45
                # chevron: rows shift with the frame (period 8)
                yy = (y + k * 8 // n) % 8
                d = abs(x - 7.5)
                if 2 <= x <= 13 and abs(yy - (2 + d * 0.6)) < 0.9:
                    a[y, x, :3] = np.minimum(255, f * 1.0 + 40)
                elif 2 <= x <= 13 and abs(yy - (2 + d * 0.6)) < 1.6:
                    a[y, x, :3] = f * 0.6 + b * 0.4
        out.append(Image.fromarray(a.clip(0, 255).astype("uint8"), "RGBA"))
    return out if frames > 1 else out[0]


def _neon_tube(color, seed):
    """Glowing neon tube block: white-hot core bands fading to the tube colour, thin dark frame."""
    import numpy as np
    from PIL import Image
    c = np.array(_hexrgb(color), float)
    a = np.zeros((16, 16, 4))
    a[..., 3] = 255
    for y in range(16):
        for x in range(16):
            e = min(x, y, 15 - x, 15 - y)
            t = min(1.0, e / 6.0)
            col = c * (0.55 + 0.45 * t) + (255 - c) * (t ** 3) * 0.75
            if e == 0:
                col = c * 0.35
            a[y, x, :3] = col
    return Image.fromarray(a.clip(0, 255).astype("uint8"), "RGBA")


def _sunset_panel(seed):
    """Retro-sun stripes: yellow -> orange -> magenta bands with dark gaps that widen toward the bottom."""
    import numpy as np
    from PIL import Image
    top = np.array(_hexrgb(SUNYELLOW), float)
    mid = np.array(_hexrgb(SUNSET), float)
    bot = np.array(_hexrgb(MAGENTA), float)
    dark = np.array(_hexrgb("#2a0b40"), float)
    gaps = {7, 10, 12, 13, 15}
    a = np.zeros((16, 16, 4))
    a[..., 3] = 255
    for y in range(16):
        t = y / 15
        col = top * (1 - 2 * t) + mid * 2 * t if t < 0.5 else mid * (2 - 2 * t) + bot * (2 * t - 1)
        for x in range(16):
            a[y, x, :3] = dark if y in gaps else col
    return Image.fromarray(a.clip(0, 255).astype("uint8"), "RGBA")


def _chrome(seed):
    """80s chrome: dark-blue sky reflection over a bright horizon line, then magenta ground reflection."""
    import numpy as np
    from PIL import Image
    from gen.noise import rng
    stops = [(0, "#1a2a6a"), (5, "#5a8ad0"), (7, "#d8f4ff"), (8, "#ffffff"), (9, "#5a2a6a"), (12, "#c040a0"),
             (15, "#ff90d0")]
    r = rng(seed)
    a = np.zeros((16, 16, 4))
    a[..., 3] = 255
    for y in range(16):
        for i in range(len(stops) - 1):
            if stops[i][0] <= y <= stops[i + 1][0]:
                t = (y - stops[i][0]) / max(1, stops[i + 1][0] - stops[i][0])
                col = np.array(_hexrgb(stops[i][1]), float) * (1 - t) + np.array(_hexrgb(stops[i + 1][1]), float) * t
                break
        for x in range(16):
            a[y, x, :3] = col * (0.94 + 0.08 * r.random())
    a[0, :, :3] *= 0.6
    a[:, 0, :3] *= 0.7
    a[:, 15, :3] *= 0.8
    a[15, :, :3] *= 0.7
    return Image.fromarray(a.clip(0, 255).astype("uint8"), "RGBA")


def _grid_side(bg, line, soil, seed):
    """Side of the grid turf: neon border lines over dark soil, top edge brightest."""
    import numpy as np
    from gen.textures import neon_grid
    img = neon_grid(bg, line, seed)
    a = np.asarray(img.convert("RGBA"), float).copy()
    ln = np.array(_hexrgb(line), float)
    a[0, :, :3] = np.minimum(255, ln + 50)
    a[1, :, :3] = ln * 0.7 + a[1, :, :3] * 0.3
    from PIL import Image
    return Image.fromarray(a.clip(0, 255).astype("uint8"), "RGBA")


DIMENSION = Dimension(
    id="synthwave",
    code="X-01",
    name="Synthwave",
    tagline="Neon grids racing toward an endless sunset",
    description=("A world rendered in 1986: glowing magenta grid plains run to a striped sun that never finishes "
                 "setting, chrome mesas wear neon-trimmed edges, and cyan palms line the boulevards. Hyperdrive strips "
                 "fling you forward and bounce pads fling you up. Neon Panthers prowl the mesas - leave them be - "
                 "and Glitch Cubes skip through space to bite."),
    danger=2,
    color=MAGENTA,
    terrain=Terrain(style="cubes", stone="synthwave_vaporstone", sea_level=57, height=66, amplitude=11, roughness=0.0,
                    caves=False, ores=False,
                    params={"step": 5, "cell_size": 46, "min_size": 3, "max_size": 7, "probability": 0.28,
                            "floating": True, "y_min": 92, "y_max": 140, "cliff_block": "synthwave_neon_trim",
                            "biome_size": 300}),
    sky=Sky(sky_color="#2c0b5c", fog_color="#ff3d8b", fog_start=40, fog_end=240, cloud_color="#55ff5ad0",
            cloud_height=220, sunrise_color="#ddff3a7a", time="dusk", star_brightness=0.8, ambient_light=0.1,
            sky_light_color="#ffb0e0",
            bodies=[
                Celestial("retro_sun", [SUNYELLOW, "#ff9a3a", "#ff2b9a", "#b020d0"], size=120, yaw=90, pitch=9,
                          seed="synth-sun"),
                Celestial("ringed_planet", ["#1a2a6a", CYAN, "#c0ffff"], size=34, yaw=230, pitch=48, alpha=0.85,
                          seed="synth-planet"),
                Celestial("nebula", ["#3a0a6a", MAGENTA, "#ffa0f0"], size=150, yaw=300, pitch=70, alpha=0.35,
                          additive=True, seed="synth-neb"),
            ]),
    blocks=[
        Block("synthwave_grid_turf", "Neon Grid Turf", "grass", {
            "top": tex("neon_grid", NIGHT, MAGENTA, seed="synth-grid"),
            "side": tex(_grid_side, NIGHT, "#d020b0", P_SOIL, "synth-grid-side"),
            "bottom": tex("dirt", P_SOIL, seed="synth-soil")},
              hardness=0.8, sound="glass", emissive=True, map_color="color_magenta"),
        Block("synthwave_vapor_soil", "Vapor Soil", "soil", {"all": tex("dirt", P_SOIL, seed="synth-soil")},
              hardness=0.6, sound="gravel", map_color="color_purple"),
        Block("synthwave_vaporstone", "Vaporstone", "stone", {"all": tex("neon_grid", "#22163f", "#5a2a8a", seed="synth-stone")},
              hardness=1.5, map_color="color_purple"),
        Block("synthwave_chrome", "Chrome Plating", "stone", {"all": tex(_chrome, "synth-chrome")},
              hardness=3.0, sound="metal", map_color="metal"),
        Block("synthwave_neon_trim", "Neon Trim", "stone", {"all": tex("neon_grid", "#1c2040", CYAN, seed="synth-trim")},
              hardness=2.0, sound="metal", light=4, emissive=True, map_color="color_cyan"),
        Block("synthwave_sunset_panel", "Sunset Panel", "glow", {"all": tex(_sunset_panel, "synth-sunpanel")},
              hardness=0.6, sound="glass", light=15, emissive=True, map_color="color_orange"),
        Block("synthwave_neon_tube", "Magenta Neon Tube", "glow", {"all": tex(_neon_tube, MAGENTA, "synth-tube")},
              hardness=0.5, sound="glass", light=12, emissive=True, map_color="color_magenta"),
        Block("synthwave_hyper_strip", "Hyperdrive Strip", "solid",
              {"all": tex(_chevrons, "#1a1030", CYAN, "synth-chev", frames=8, frametime=2)},
              hardness=1.5, sound="metal", speed=1.6, emissive=True, tool="pickaxe", map_color="color_cyan"),
        Block("synthwave_bounce_pad", "Bounce Pad", "slime", {"all": tex("slime_block", ["#6a0a5a", "#c018a8", MAGENTA, "#ffa0f0"],
                                                                         seed="synth-bounce")},
              hardness=0.3, sound="slime", bounce=1.0, light=6, emissive=True, map_color="color_pink"),
        Block("synthwave_palm_log", "Silhouette Palm Log", "log", {
            "side": tex("log_side", P_BARK, seed="synth-palm"),
            "end": tex("log_top", P_BARK, ["#ff2bd6", "#ff7ae6"], seed="synth-palm-end")},
              hardness=2.0, sound="wood", map_color="color_purple"),
        Block("synthwave_palm_fronds", "Neon Fronds", "leaves", {"all": tex("leaves", P_FROND, seed="synth-frond", holes=0.3)},
              hardness=0.2, sound="azalea_leaves", light=5, emissive=True, map_color="color_cyan"),
        Block("synthwave_pixel_grass", "Pixel Grass", "plant",
              {"cross": tex("grass_tuft", ["#7a0a6a", "#c018a8", MAGENTA, "#ffb0f4"], seed="synth-tuft")},
              hardness=0.0, sound="grass", light=3, emissive=True),
    ],
    items=[
        Item("synthwave_pixel_drumstick", "8-Bit Drumstick",
             tex("item_icon", "meat_cooked", ["#a03a10", SUNSET, SUNYELLOW], seed="synth-drum"), kind="food",
             food=Food(4, 0.4, always=True, effects=[Effect("minecraft:speed", 20, 1), Effect("minecraft:jump_boost", 20, 0)]),
             lore="Low resolution. High flavour."),
        Item("synthwave_neon_filament", "Neon Filament", tex("item_icon", "rod", ["#0a6a8a", CYAN, "#e0ffff"], seed="synth-fil"),
             rarity="uncommon", lore="Still warm. Still humming in B minor."),
        Item("synthwave_glitch_shard", "Glitch Shard", tex("item_icon", "shard", ["#8a0a7a", MAGENTA, CYAN], seed="synth-glitch"),
             rarity="rare", glint=True, lore="Hold it to your ear: dial-up tones."),
    ],
    creatures=[
        Creature("neon_panther", "Neon Panther", "quadruped", ["#150a2a", "#2a1450", CYAN, MAGENTA], pattern="glow_lines",
                 size=1.15,
                 body={"ears": "pointy", "leg_len": 8, "leg_w": 3, "body_len": 16, "body_h": 7, "body_w": 8, "tail": 3,
                       "tail_kind": "thin", "tail_len": 6, "claws": True, "whiskers": True, "eye_style": "slit",
                       "snout": 2, "head_size": 1.0, "glow_tips": True, "belly": False},
                 behavior="neutral", health=30, damage=6, speed=0.32, armor=2, abilities=["leap"],
                 drops=[Drop("synthwave_neon_filament", 0, 2), Drop("minecraft:glowstone_dust", 0, 1)],
                 sounds="cat", pitch=0.6, xp=8, group=2,
                 description="Sleek as a VHS cover. Ignores you until you hit it - then it is very, very fast."),
        Creature("glitch_cube", "Glitch Cube", "blob", [MAGENTA, CYAN, "#ffffff", "#000000"], pattern="checker",
                 size=0.9,
                 body={"shape": "cube", "translucent": True, "core": True, "eye_style": "glow", "eyes": 2,
                       "mouth": "none", "blob_size": 11},
                 behavior="hostile", health=14, damage=3, speed=0.28, abilities=["teleport"],
                 on_hit=Effect("minecraft:nausea", 3), movement="hopping",
                 drops=[Drop("synthwave_glitch_shard", 0, 1, chance=0.35), Drop("minecraft:slime_ball", 0, 1)],
                 sounds="slime", pitch=1.6, xp=5, group=2,
                 description="A cube that failed to render properly and is angry about it. Blinks a few blocks at a time."),
        Creature("pixel_bird", "Pixel Bird", "flyer", [SUNYELLOW, SUNSET, CYAN, NIGHT], pattern="checker", size=0.6,
                 body={"kind": "bird", "crest": True, "beak": 2, "tail": 2, "tail_kind": "fan", "eye_style": "cute"},
                 behavior="passive", health=6, speed=0.25,
                 drops=[Drop("synthwave_pixel_drumstick", 0, 1), Drop("minecraft:feather", 0, 2)],
                 sounds="parrot", pitch=1.4, xp=2, group=4,
                 description="Flaps in exactly eight frames. Sings chiptune at sunset, which is always."),
    ],
    biomes=[
        Biome("synthwave_grid_plains", "Neon Grid", top="synthwave_grid_turf", under="synthwave_vapor_soil",
              temperature=0.0, humidity=0.0, elevation=-0.1, grass_color="#ff2bd6", foliage_color=CYAN,
              water_color="#c03aff", water_fog_color="#3a0a5a",
              particles=[("dust:#ff2bd6:0.8", 0.003), ("minecraft:end_rod", 0.0006)], ambient="neon_synth",
              surface_noise=[("synthwave_hyper_strip", 0.82)],
              features=[
                  Structure(kind="ring", blocks={"main": "synthwave_neon_tube"}, size=(6, 9),
                            params={"float": 1, "thickness": 0.12, "sink": 0.0}, count=1, chance=7),
                  Structure(kind="cuboids", blocks={"main": "synthwave_chrome", "trim": "synthwave_neon_trim"},
                            size=(3, 5), params={"count": 1, "scatter": 3}, count=1, chance=10),
                  Spire(blocks=[("synthwave_chrome", 1)], tip="synthwave_sunset_panel", height=(4, 6), radius=(1, 1),
                        count=1, chance=4),
                  Patch(block="synthwave_pixel_grass", count=2, tries=10, spread=6),
                  Patch(block="synthwave_bounce_pad", count=1, tries=3, spread=4, chance=6),
              ],
              spawns=[Spawn("pixel_bird", 10, (2, 4)), Spawn("glitch_cube", 4, (1, 2)), Spawn("neon_panther", 3, (1, 1))]),
        Biome("synthwave_chrome_mesas", "Chrome Mesas", top="synthwave_chrome", under="synthwave_vaporstone",
              temperature=0.6, humidity=-0.5, elevation=0.55, grass_color="#ff2bd6", foliage_color=CYAN,
              water_color="#c03aff", fog_color="#ff5a7a",
              particles=[("dust:#21f4ff:0.9", 0.003)], ambient="neon_synth",
              surface_noise=[("synthwave_grid_turf", 0.35)],
              features=[
                  Structure(kind="cuboids", blocks={"main": "synthwave_chrome", "alt": "synthwave_vaporstone",
                                                    "trim": "synthwave_neon_trim"},
                            size=(8, 14), params={"scatter": 2}, count=1, chance=2),
                  Structure(kind="cuboids", blocks={"main": "synthwave_chrome", "trim": "synthwave_neon_tube"},
                            size=(4, 7), params={"float": 9, "count": 1}, count=1, chance=6),
                  Patch(block="synthwave_pixel_grass", count=1, tries=6),
              ],
              spawns=[Spawn("neon_panther", 7, (1, 2)), Spawn("glitch_cube", 3, (1, 1)), Spawn("pixel_bird", 4, (1, 3))]),
        Biome("synthwave_palm_boulevard", "Sunset Boulevard", top="synthwave_grid_turf", under="synthwave_vapor_soil",
              temperature=-0.5, humidity=0.4, grass_color="#ff2bd6", foliage_color=CYAN, water_color="#c03aff",
              particles=[("dust:#ffd84a:0.7", 0.002), ("minecraft:end_rod", 0.0008)], ambient="neon_synth",
              surface_noise=[("synthwave_hyper_strip", 0.7)],
              features=[
                  GiantPlant(stem="synthwave_palm_log", head="synthwave_palm_fronds", shape="palm", height=(10, 16),
                             radius=(3, 4), bend=0.35, count=1),
                  GiantPlant(stem="synthwave_palm_log", head="synthwave_palm_fronds", shape="palm", height=(7, 10),
                             radius=(2, 3), bend=0.6, count=1, chance=3),
                  Spire(blocks=[("synthwave_chrome", 1)], tip="synthwave_sunset_panel", height=(5, 7), radius=(1, 1),
                        count=1, chance=2),
                  Patch(block="synthwave_pixel_grass", count=4, tries=16),
              ],
              spawns=[Spawn("pixel_bird", 14, (2, 5)), Spawn("neon_panther", 2, (1, 1)), Spawn("glitch_cube", 2, (1, 1))]),
        Biome("synthwave_vapor_lagoon", "Vapor Lagoon", top="synthwave_grid_turf", under="synthwave_vapor_soil",
              temperature=0.5, humidity=0.8, elevation=-0.7, underwater="synthwave_vaporstone", grass_color="#ff2bd6",
              foliage_color=CYAN, water_color="#d040ff", water_fog_color="#4a0a6a", fog_color="#ff6ab0",
              particles=[("minecraft:end_rod", 0.0015), ("dust:#21f4ff:0.6", 0.002)], ambient="neon_synth",
              music="minecraft:music.end",
              features=[
                  Structure(kind="ring", blocks={"main": "synthwave_neon_tube"}, size=(7, 11),
                            params={"flat": 1, "float": 0, "thickness": 0.1}, count=1, chance=5),
                  Structure(kind="cuboids", blocks={"main": "synthwave_chrome", "trim": "synthwave_neon_tube"},
                            size=(3, 5), params={"float": 6, "count": 1, "scatter": 4}, count=1, chance=5),
                  GiantPlant(stem="synthwave_palm_log", head="synthwave_palm_fronds", shape="palm", height=(6, 10),
                             radius=(3, 4), bend=0.7, count=1, chance=2),
                  Patch(block="synthwave_bounce_pad", count=1, tries=4, spread=4, chance=2),
              ],
              spawns=[Spawn("glitch_cube", 5, (1, 2)), Spawn("pixel_bird", 6, (1, 3))]),
    ],
    effects=[],
    music="minecraft:music.credits",
    ambient="neon_synth",
    platform="synthwave_chrome",
    icon="portalgun:synthwave_glitch_shard",
)
