"""W-0 The White Room - a featureless white limbo of perfect flatness, black monoliths and silence."""
import math

import numpy as np
from PIL import Image

from gen.content.dsl import *
from gen.noise import fbm, rng

WHITE = "#f4f4f4"
BLACK = "#08080a"
P_STATIC = ["#202024", "#585860", "#9a9aa2", "#d8d8de", "#ffffff"]


def _img(a):
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8), "RGBA")


def blank(level, seed, grain=1.6, seam=None):
    """Almost perfectly flat colour: a whisper of grain, optionally a 1px seam on two edges (tiles into a grid)."""
    R = rng(seed)
    a = np.zeros((16, 16, 4))
    a[..., 3] = 255
    g = R.normal(0, grain, (16, 16))
    a[..., 0] = level + g
    a[..., 1] = level + g
    a[..., 2] = level + 1.5 + g
    if seam is not None:
        a[0, :, :3] = seam
        a[:, 0, :3] = seam
    return _img(a)


def void_slab(seed, edge=34):
    """Monolith face: absolute black with a barely visible bevel - it looks like a hole cut in the world."""
    a = np.zeros((16, 16, 4))
    a[..., 3] = 255
    R = rng(seed)
    for y in range(16):
        for x in range(16):
            v = 7 + R.random() * 1.2
            if x in (0, 15) or y in (0, 15):
                v = edge * 0.35
            a[y, x, :3] = [v, v, v + 2]
    return _img(a)


def light_slab(seed):
    """Glowing white panel with a soft brighter core (for the inverted monoliths of the Negative)."""
    a = np.zeros((16, 16, 4))
    a[..., 3] = 255
    for y in range(16):
        for x in range(16):
            d = max(abs(x - 7.5), abs(y - 7.5)) / 7.5
            v = 255 - 22 * d ** 3
            a[y, x, :3] = [v, v, min(255, v + 2)]
    return _img(a)


def tv_static(pal, seed, frames=8, bright=0.0):
    """Animated analogue TV snow, with a rolling brighter scan band."""
    cols = [np.array([int(c[i:i + 2], 16) for i in (1, 3, 5)], float) for c in pal]
    out = []
    for f in range(frames):
        R = rng(f"{seed}:{f}")
        n = R.random((16, 16))
        a = np.zeros((16, 16, 4))
        a[..., 3] = 255
        band = (f * 16 // frames)
        for y in range(16):
            lift = 0.25 if abs(((y - band + 8) % 16) - 8) < 2 else 0.0
            for x in range(16):
                v = min(0.999, n[y, x] * 0.85 + lift + bright)
                a[y, x, :3] = cols[int(v * len(cols))]
        out.append(_img(a))
    return out


def footprints(seed, ink="#101012"):
    """A pair of bare black footprints walking across the tile (on transparent)."""
    a = np.zeros((16, 16, 4))
    c = np.array([int(ink[i:i + 2], 16) for i in (1, 3, 5)], float)

    def foot(cx, cy, flip):
        for y in range(16):
            for x in range(16):
                dx, dy = (x - cx) * (-1 if flip else 1), y - cy
                # sole: an ellipse, heel a smaller one, five toe dots
                sole = (dx / 1.9) ** 2 + ((dy + 0.4) / 2.9) ** 2 < 1.0
                heel = (dx / 1.5) ** 2 + ((dy - 2.6) / 1.5) ** 2 < 1.0
                if sole or heel:
                    a[y, x, :3] = c
                    a[y, x, 3] = 235
        for k, (tx, ty) in enumerate(((-1.6, -4.2), (-0.2, -4.6), (1.1, -4.3), (2.1, -3.5))):
            x, y = int(round(cx + (tx if not flip else -tx))), int(round(cy + ty))
            if 0 <= x < 16 and 0 <= y < 16:
                a[y, x, :3] = c
                a[y, x, 3] = 235
    foot(4.5, 10.5, False)
    foot(11.0, 5.0, True)
    return _img(a)


def static_shard(seed):
    """Black/white glitch shards (crystal cluster sprite)."""
    from gen.textures import crystal_shard_sprite
    img = np.asarray(crystal_shard_sprite(["#050507", "#2a2a30", "#e8e8ee", "#ffffff"], seed, count=3).convert("RGBA"),
                     float).copy()
    R = rng(seed + ":g")
    for y in range(16):
        if R.random() < 0.25:
            sh = int(R.integers(-2, 3))
            img[y] = np.roll(img[y], sh, axis=0)
    return _img(img)


FLOATING_MONOLITH = Structure(kind="monolith", blocks={"main": "white_room_void_slab"}, size=(6, 9), params={"float": 7},
                              count=1, chance=26)
MONOLITH = Structure(kind="monolith", blocks={"main": "white_room_void_slab"}, size=(7, 11), count=1, chance=14)
FOOTPRINTS = Patch(block="white_room_footprints", count=1, tries=6, spread=9, chance=4)

DIMENSION = Dimension(
    id="white_room",
    code="W-0",
    name="The White Room",
    tagline="Nothing here. Nothing at all. Probably.",
    description=("A perfectly flat white floor under a perfectly white sky, stretching until the horizon simply "
                 "stops. Black monoliths stand at impossible distances and some of them hover; nobody knows who left "
                 "the footprints. The Faceless wander here politely. The Silhouettes do not - and in the Negative, where "
                 "everything is inverted, you will not see them coming at all."),
    danger=3,
    color="#e8e8e8",
    terrain=Terrain(style="flat", stone="white_room_substrate", fluid="minecraft:air", sea_level=-63, height=64,
                    amplitude=0.4, scale=2.0, roughness=0.0, caves=False, ores=False,
                    params={"ponds": 0.0, "biome_size": 420, "cliffs": False}),
    sky=Sky(sky_color="#ffffff", fog_color="#f2f2f4", fog_start=6, fog_end=110, cloud_color=None, time="noon",
            star_brightness=0.0, sky_light_color="#ffffff", ambient_light=0.35,
            bodies=[Celestial("planet", ["#000000", "#040406", "#08080c", "#0c0c10"], size=26, yaw=30, pitch=62,
                              seed="white-room-hole")]),
    blocks=[
        Block("white_room_substrate", "White", "solid", {"all": tex(blank, 244, "white-room-floor", 1.2)},
              hardness=2.0, resistance=12.0, sound="wool", tool="pickaxe", map_color="snow"),
        Block("white_room_tile", "White Tile", "solid", {"all": tex(blank, 246, "white-room-tile", 1.0, [226, 226, 230])},
              hardness=2.0, resistance=12.0, sound="calcite", tool="pickaxe", map_color="snow"),
        Block("white_room_negative", "Negative", "solid", {"all": tex(blank, 12, "white-room-neg", 1.0, [26, 26, 30])},
              hardness=2.0, resistance=12.0, sound="wool", tool="pickaxe", map_color="color_black"),
        Block("white_room_void_slab", "Void Slab", "stone", {"all": tex(void_slab, "white-room-void")}, hardness=50.0,
              resistance=1200.0, sound="netherite_block", map_color="color_black"),
        Block("white_room_light_slab", "Light Slab", "glow", {"all": tex(light_slab, "white-room-light")}, hardness=3.0,
              light=15, emissive=True, sound="glass", tool="pickaxe", map_color="snow"),
        Block("white_room_static_floor", "Static", "solid",
              {"all": tex(tv_static, P_STATIC[1:], "white-room-static", frames=8, frametime=1)}, hardness=1.5,
              sound="sculk", tool="pickaxe", map_color="color_light_gray"),
        Block("white_room_static_rift", "Static Rift", "hazard",
              {"all": tex(tv_static, P_STATIC, "white-room-rift", frames=8, frametime=1, bright=0.12)}, hardness=1.5,
              sound="sculk", tool="pickaxe", damage=1, damage_type="magic", effect="minecraft:blindness",
              effect_seconds=3, light=3, emissive=True, map_color="color_gray"),
        Block("white_room_mirror", "Mirror Pane", "glass", {"all": tex("glass", ["#c8ccd4", "#e4e8ee", "#ffffff"],
                                                                         seed="white-room-mirror", inner_alpha=70)},
              hardness=0.6, sound="glass", map_color="snow"),
        Block("white_room_footprints", "Footprints", "carpet", {"all": tex(footprints, "white-room-steps")},
              hardness=0.1, sound="wool", map_color="color_black"),
        Block("white_room_glitch_shard", "Glitch Shard", "crystal_cluster", {"cross": tex(static_shard, "white-room-shard")},
              hardness=0.3, light=4, sound="amethyst_cluster", map_color="color_black"),
    ],
    items=[
        Item("white_room_blank_wafer", "Blank Wafer", tex("item_icon", "chip", ["#c8c8cc", "#e8e8ec", "#ffffff"],
                                                          seed="white-room-wafer", accent="#d8d8dc"),
             kind="food", food=Food(3, 0.3, always=True, effects=[Effect("minecraft:invisibility", 30, 0)]),
             lore="Tastes of absolutely nothing. You become a little bit of nothing, too."),
        Item("white_room_shadow_ink", "Shadow Ink", tex("item_icon", "bottle", ["#000000", "#16161a", "#3a3a44"],
                                                        seed="white-room-ink"),
             rarity="uncommon", lore="Pours upward when nobody is watching."),
        Item("white_room_static_mote", "Static Mote", tex("item_icon", "orb", ["#58585e", "#b0b0b8", "#ffffff"],
                                                          seed="white-room-mote"),
             lore="Hums at exactly sixty hertz. Hold it to your ear if you dare."),
    ],
    creatures=[
        Creature("silhouette", "Silhouette", "biped", [BLACK, "#121216", "#ffffff", "#ffffff"], pattern="plain",
                 size=1.3,
                 body={"thin": True, "arms": 2, "arm_len": 18, "leg_len": 14, "head": "box", "eyes": 2, "eye_size": 1,
                       "eye_style": "glow", "mouth": "none", "ears": "none", "belly": False, "head_size": 0.9},
                 behavior="hostile", health=30, damage=6, speed=0.33, abilities=["blink", "teleport"],
                 on_hit=Effect("minecraft:blindness", 3), spawn_light="any", glow_eyes=True,
                 drops=[Drop("white_room_shadow_ink", 0, 2), Drop("minecraft:ender_pearl", 0, 1, chance=0.25)],
                 sounds="enderman", pitch=0.55, xp=10, group=1,
                 description="A person-shaped hole in the light. It is always a little closer than last time you looked."),
        Creature("static", "Static", "floater", ["#8a8a92", "#e8e8ee", "#18181c", "#ffffff"], pattern="speckle",
                 size=1.0, body={"kind": "ghost", "translucent": True, "eye_style": "glow", "eyes": 2, "arms": 2,
                                  "mouth": "open", "body_w": 10, "body_h": 12},
                 behavior="hostile", attack="ranged", health=16, damage=2, speed=0.2, emissive=True, abilities=["blink"],
                 ranged={"color": "#ffffff", "damage": 3, "effect": Effect("minecraft:nausea", 4), "cooldown": 45,
                         "count": 3, "spread": 0.15, "speed": 1.2, "particle": "minecraft:white_ash", "size": 0.14},
                 drops=[Drop("white_room_static_mote", 0, 2)],
                 sounds="breeze", pitch=1.6, xp=6, group=2,
                 description="Snow from a channel that went off the air. It crackles toward anything warm."),
        Creature("faceless", "Faceless", "biped", ["#ececee", "#d4d4d8", "#a8a8b0", "#ececee"], pattern="plain",
                 size=1.0,
                 body={"head": "box", "eyes": 0, "eye_style": "none", "mouth": "none", "ears": "none", "arms": 2,
                       "torso_w": 8, "torso_h": 12, "belly": False},
                 behavior="neutral", health=24, damage=5, speed=0.23, glow_eyes=False,
                 drops=[Drop("white_room_blank_wafer", 0, 1, chance=0.6), Drop("minecraft:paper", 0, 3)],
                 sounds="player", pitch=0.8, xp=5, group=3,
                 description="Polite, patient and entirely without a face. It hums the silence back at you."),
    ],
    biomes=[
        Biome("white_room_expanse", "The Expanse", top="white_room_substrate", under="white_room_substrate",
              temperature=0.0, humidity=0.0, grass_color="#e8e8e8", foliage_color="#e0e0e0", water_color="#e8e8f0",
              particles=[], ambient=None, music="minecraft:music.end",
              features=[MONOLITH, FLOATING_MONOLITH, FOOTPRINTS],
              spawns=[Spawn("faceless", 8, (1, 3)), Spawn("silhouette", 2, (1, 1)), Spawn("static", 1, (1, 1))]),
        Biome("white_room_gallery", "The Gallery", top="white_room_tile", under="white_room_substrate",
              temperature=0.6, humidity=-0.3, grass_color="#e8e8e8", foliage_color="#e0e0e0", water_color="#e8e8f0",
              particles=[], ambient="cosmic_drone", music="minecraft:music.end",
              features=[
                  Structure(kind="monolith", blocks={"main": "white_room_void_slab"}, size=(6, 10), count=1, chance=5),
                  Structure(kind="cuboids", blocks={"main": "white_room_void_slab", "alt": "white_room_mirror",
                                                    "trim": "white_room_void_slab"},
                            size=(3, 6), params={"float": 9, "scatter": 1, "count": 2}, count=1, chance=8),
                  Structure(kind="arch", blocks={"main": "white_room_void_slab"}, size=(5, 8), params={"thickness": 1.0},
                            count=1, chance=12),
                  Structure(kind="ring", blocks={"main": "white_room_void_slab"}, size=(8, 11),
                            params={"float": 10, "thickness": 0.1, "sink": 0}, count=1, chance=40),
                  FOOTPRINTS,
              ],
              spawns=[Spawn("faceless", 10, (2, 4)), Spawn("silhouette", 3, (1, 1))]),
        Biome("white_room_static_field", "Static Field", top="white_room_substrate", under="white_room_substrate",
              temperature=-0.9, humidity=0.9, grass_color="#b0b0b0", foliage_color="#a0a0a0", water_color="#c0c0c8",
              sky_color="#e4e4e6", fog_color="#d4d4d8", fog_end=80,
              particles=[("minecraft:white_ash", 0.012)], ambient="glitch_noise",
              music="minecraft:music.overworld.deep_dark",
              surface_noise=[("white_room_static_floor", 0.5)],
              features=[
                  Disk(block="white_room_static_rift", replace=["white_room_static_floor"],
                       radius=(1, 2), count=1, chance=2),
                  Patch(block="white_room_glitch_shard", count=1, tries=4),
                  Structure(kind="cuboids", blocks={"main": "white_room_static_floor", "alt": "white_room_void_slab",
                                                    "trim": "white_room_static_rift"},
                            size=(2, 4), params={"float": 4, "scatter": 1}, count=1, chance=7),
              ],
              spawns=[Spawn("static", 10, (1, 3)), Spawn("faceless", 3, (1, 2))]),
        Biome("white_room_negative_zone", "The Negative", top="white_room_negative", under="white_room_negative",
              temperature=0.95, humidity=0.95, grass_color="#202020", foliage_color="#202020", water_color="#101014",
              sky_color="#000000", fog_color="#040406", fog_end=90, particles=[("minecraft:white_ash", 0.008)],
              ambient="dark_void", music="minecraft:music.overworld.deep_dark",
              features=[
                  Structure(kind="monolith", blocks={"main": "white_room_light_slab"}, size=(6, 10), count=1, chance=6),
                  Structure(kind="monolith", blocks={"main": "white_room_light_slab"}, size=(5, 8), params={"float": 6},
                            count=1, chance=14),
                  Patch(block="white_room_glitch_shard", count=1, tries=6, chance=2),
              ],
              spawns=[Spawn("silhouette", 6, (1, 2)), Spawn("static", 2, (1, 1))]),
    ],
    effects=[],
    ambient=None,
    music="minecraft:music.end",
    platform="white_room_substrate",
    icon="portalgun:white_room_blank_wafer",
)
