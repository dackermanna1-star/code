"""G-100 Gloopolis - a slime world of bouncy goo hills, pink jelly lakes and wobbling slime pillars."""
import numpy as np
from PIL import Image

from gen.content.dsl import *
from gen.noise import rng

# palette: lime goo, raspberry jelly, aqua glow-goo, deep bog teal, lemon highlight
P_LIME = ["#2f7a12", "#4aa81a", "#6cd226", "#9cf040", "#d4ff8a"]
P_JELLY = ["#9a1460", "#c8247e", "#f0449e", "#ff86c4", "#ffc6e4"]
P_AQUA = ["#0e7a7a", "#1aa8a4", "#3ad8cc", "#7af8e8", "#d0fff8"]
P_SOIL = ["#1f4a3a", "#2a5e48", "#367456", "#448a62", "#58a070"]
P_ROCK = ["#16302c", "#1e403a", "#285246", "#336452", "#40785e"]
P_OOZE = ["#1a3410", "#284a16", "#38621c", "#4a7a24", "#62942e"]


def _rgb(c):
    c = c.lstrip("#")
    return np.array([int(c[i:i + 2], 16) for i in (0, 2, 4)], float)


def goo_turf_top(pal, seed):
    """Glossy goo skin: soft lumps with bright specular highlights and a few trapped bubbles."""
    R = rng(seed)
    yy, xx = np.mgrid[0:16, 0:16]
    f = np.zeros((16, 16))
    for _ in range(7):
        cx, cy, r = R.uniform(0, 16), R.uniform(0, 16), R.uniform(3.0, 6.0)
        for ox in (-16, 0, 16):
            for oy in (-16, 0, 16):
                d = np.hypot(xx - cx - ox, yy - cy - oy) / r
                f = np.maximum(f, np.clip(1 - d, 0, 1))
    f = f + R.uniform(-0.08, 0.08, (16, 16))
    idx = np.clip((f * 3.2).astype(int), 0, 3)
    cols = np.array([_rgb(c) for c in pal])
    out = cols[idx]
    # specular highlights on the upper-left shoulder of each lump
    hl = (np.roll(f, 1, 0) < f - 0.12) & (np.roll(f, 1, 1) < f - 0.12)
    out[hl] = cols[4]
    for _ in range(3):
        bx, by = int(R.integers(1, 15)), int(R.integers(1, 15))
        out[by, bx] = _rgb("#e8fff0")
        out[min(15, by + 1), min(15, bx + 1)] = cols[1]
    a = np.concatenate([out, np.full((16, 16, 1), 255.0)], axis=2)
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8), "RGBA")


def bubble(pal, seed):
    """Soap-bubble film: almost clear, iridescent rim bands and a bright window highlight."""
    yy, xx = np.mgrid[0:16, 0:16]
    a = np.zeros((16, 16, 4), float)
    cols = [_rgb(c) for c in pal]
    d = np.maximum(np.abs(xx - 7.5), np.abs(yy - 7.5))
    swirl = (np.sin((xx + yy * 0.6) * 0.7 + rng(seed).uniform(0, 6)) + 1) * 0.5
    a[..., :3] = cols[2] * (1 - swirl[..., None]) + _rgb("#ffb0f0") * swirl[..., None]
    a[..., 3] = 34
    rim = d > 6.5
    a[rim, :3] = cols[3]
    a[rim, 3] = 120
    a[2:4, 3:6, :3] = 255
    a[2:4, 3:6, 3] = 210
    a[4, 3, :3] = 255
    a[4, 3, 3] = 170
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8), "RGBA")


SLIME_PILLAR = Spire(blocks=[("gloop_goo", 5), ("gloop_jelly", 2)], tip="gloop_glowgoo", height=(16, 34), radius=(2, 4),
                     lean=0.25, count=1, chance=3)

DIMENSION = Dimension(
    id="gloopolis",
    code="G-100",
    name="Gloopolis",
    tagline="Everything here wobbles. Including you.",
    description=("A slime world where the hills are glossy goo that bounces back underfoot, raspberry jelly fills the "
                 "lakes and wobbling slime pillars glow aqua at their tips. Giant soap bubbles roll across the Bubble "
                 "Fields and Blob Grazers munch goo sprouts by the herd. Mind the Bounce Slimes - they hop straight "
                 "for your face and split when you hit them."),
    danger=2,
    color="#6cd226",
    terrain=Terrain(style="blobs", stone="gloopstone", sea_level=60, height=70, amplitude=18, scale=1.05,
                    roughness=0.2, deepslate=None, ores=False,
                    params={"blobbiness": 0.75, "floating": 0.4, "squash": 0.9, "cliff_block": "gloop_goo",
                            "ceiling_block": "gloop_goo", "biome_size": 260, "springs": 4}),
    sky=Sky(sky_color="#78e6c4", fog_color="#b4f2a6", water_fog_color="#b8287a", fog_start=40, fog_end=210,
            cloud_color="#d8ffd2c8", cloud_height=150, time="afternoon", sunrise_color="#ff86c4aa",
            bodies=[Celestial("planet", ["#c8247e", "#f0449e", "#ffc6e4"], size=70, yaw=200, pitch=32, roll=12,
                              seed="gloop-jellyworld"),
                    Celestial("planet", ["#1aa8a4", "#7af8e8", "#d0fff8"], size=22, yaw=165, pitch=48,
                              seed="gloop-moonlet")]),
    blocks=[
        Block("gloop_turf", "Goo Turf", "grass", {
            "top": tex(goo_turf_top, P_LIME, "gloop-turf"),
            "side": tex("grass_side", P_LIME, P_SOIL, seed="gloop-turf-side"),
            "bottom": tex("dirt", P_SOIL, seed="gloop-soil")}, hardness=0.6, sound="slime", bounce=0.35,
              map_color="color_light_green"),
        Block("gloop_jellysoil", "Jellysoil", "soil", {"all": tex("dirt", P_SOIL, seed="gloop-soil")}, hardness=0.5,
              sound="mud", map_color="color_green"),
        Block("gloopstone", "Gloopstone", "stone", {"all": tex("rough_stone", P_ROCK, seed="gloop-rock")}, hardness=1.4,
              sound="deepslate", map_color="color_cyan"),
        Block("gloop_goo", "Bounce Goo", "solid", {"all": tex("goo", P_LIME, seed="gloop-goo", alpha=255)}, hardness=0.5,
              sound="slime", tool="shovel", bounce=0.85, map_color="color_light_green"),
        Block("gloop_jelly", "Raspberry Jelly", "slime", {"all": tex("slime_block", P_JELLY, seed="gloop-jelly")},
              hardness=0.3, sound="slime", map_color="color_pink"),
        Block("gloop_glowgoo", "Glowgoo", "glow", {"all": tex("lamp", P_AQUA, seed="gloop-glow", style="orb")},
              hardness=0.4, sound="honey", light=14, emissive=True, map_color="color_cyan"),
        Block("gloop_ooze", "Bog Ooze", "sticky", {"all": tex("goo", P_OOZE, seed="gloop-ooze", alpha=255)},
              hardness=0.5, sound="honey", speed=0.45, jump=0.6, map_color="color_green"),
        Block("gloop_bubble", "Goo Bubble", "glass", {"all": tex(bubble, P_AQUA, "gloop-bubble")}, hardness=0.2,
              sound="glass", map_color="color_light_blue"),
        Block("gloop_bulb", "Goo Bulb", "plant", {"cross": tex("bulb", P_LIME[:4], P_AQUA[1:], seed="gloop-bulb")},
              hardness=0.0, sound="slime", light=7, emissive=True, fruit="gloopolis_gloopberry"),
        Block("gloop_tuft", "Goo Tuft", "plant", {"cross": tex("grass_tuft", P_LIME, seed="gloop-tuft")}, hardness=0.0,
              sound="slime"),
        Block("gloop_drip", "Goo Drip", "hanging_plant", {"cross": tex("tendril", P_LIME[1:], seed="gloop-drip")},
              hardness=0.0, sound="slime", light=4, particle="minecraft:item_slime"),
        Block("gloop_jelly_pad", "Jelly Pad", "lily", {"top": tex("lily_pad", P_JELLY, seed="gloop-pad")}, hardness=0.0,
              sound="slime", map_color="color_pink"),
        Block("gloop_burble_vent", "Burble Vent", "vent", {
            "top": tex("goo", P_AQUA, seed="gloop-vent", alpha=255),
            "side": tex("rough_stone", P_ROCK, seed="gloop-rock")}, hardness=1.0, sound="slime", light=8,
              emissive=True, particle="minecraft:item_slime", effect="minecraft:jump_boost", effect_seconds=6,
              effect_amplifier=2, map_color="color_cyan"),
    ],
    items=[
        Item("gloopolis_bounce_jelly", "Bounce Jelly", tex("item_icon", "jelly", P_LIME[1:], seed="gloop-bjelly"),
             kind="food", food=Food(3, 0.4, fast=True, always=True, effects=[Effect("minecraft:jump_boost", 30, 2),
                                                                             Effect("minecraft:slow_falling", 8, 0)]),
             lore="Eat it and your knees forget how gravity works."),
        Item("gloopolis_gloopberry", "Gloopberry", tex("item_icon", "berry", P_AQUA[1:], seed="gloop-berry"),
             kind="food", food=Food(2, 0.3, fast=True, effects=[Effect("minecraft:glowing", 10, 0, 0.5)]),
             lore="Squishes between your teeth. Glows a little on the way down."),
        Item("gloopolis_goo_glob", "Goo Glob", tex("item_icon", "goo", P_JELLY[1:], seed="gloop-glob"),
             rarity="uncommon", lore="Still trying to crawl back to the lake."),
    ],
    creatures=[
        Creature("bounce_slime", "Bounce Slime", "blob", ["#6cd226", "#d4ff8a", "#f0449e", "#1a3410", "#3ad8cc"],
                 pattern="spots", size=1.05,
                 body={"shape": "round", "blob_size": 14, "translucent": True, "core": True, "eye_style": "angry",
                       "eyes": 2, "eye_size": 3, "mouth": "grin", "brows": True, "antennae": 3, "glow_tips": True},
                 behavior="hostile", movement="hopping", health=18, damage=4, speed=0.3,
                 abilities=["leap", "split"], on_hit=Effect("minecraft:slowness", 3, 0),
                 drops=[Drop("gloopolis_bounce_jelly", 0, 2), Drop("minecraft:slime_ball", 0, 2)],
                 sounds="slime", pitch=1.25, xp=5, group=3,
                 description="A gleeful lime slime that boings at your face and splits in two when you hit back."),
        Creature("goo_serpent", "Goo Serpent", "serpent", ["#1aa8a4", "#d0fff8", "#f0449e", "#0a2a2a", "#7af8e8"],
                 pattern="rings", size=1.3,
                 body={"head": "dragon", "segments": 9, "seg_w": 6, "seg_len": 6, "taper": 0.55, "fins": True,
                       "translucent": True, "ridge": True, "eye_style": "cute", "eyes": 2, "mouth": "smile",
                       "antennae": 4, "glow_tips": True, "head_w": 8, "head_len": 8},
                 behavior="neutral", movement="amphibious", health=26, damage=5, speed=0.24,
                 abilities=["climb"], on_hit=Effect("minecraft:slowness", 5, 1),
                 drops=[Drop("gloopolis_goo_glob", 1, 2), Drop("minecraft:slime_ball", 0, 2)],
                 sounds="axolotl", pitch=0.7, xp=6, group=2,
                 description="A see-through serpent of aqua goo that glides through the jelly lakes. Poke it and you "
                             "will be stuck to the floor."),
        Creature("blob_grazer", "Blob Grazer", "quadruped", ["#f0449e", "#ffc6e4", "#9cf040", "#2a0a1a", "#ff86c4"],
                 pattern="spots", size=1.1,
                 body={"legs": 6, "leg_len": 3, "leg_w": 3, "body_w": 13, "body_h": 10, "body_len": 15,
                       "translucent": True, "eyestalks": 2, "eye_style": "cute", "mouth": "smile", "blush": True,
                       "ears": "none", "tail": 1, "tail_kind": "puff", "head_size": 1.1, "hump": True},
                 behavior="passive", health=16, speed=0.17, tempt="minecraft:slime_ball",
                 drops=[Drop("gloopolis_goo_glob", 0, 1), Drop("gloopolis_gloopberry", 0, 2)],
                 sounds="sniffer", pitch=1.5, xp=2, group=5,
                 description="A wobbly six-legged jelly loaf that hums happily while it slurps goo sprouts."),
    ],
    biomes=[
        Biome("gloop_bounce_hills", "Bounce Hills", top="gloop_turf", under="gloop_jellysoil", temperature=0.0,
              humidity=0.0, elevation=0.25, grass_color="#6cd226", foliage_color="#9cf040", water_color="#f0449e",
              water_fog_color="#b8287a", particles=[("dust:#b0ff60:1.1", 0.004)], ambient="wet_squelch",
              music="minecraft:music_disc.chirp",
              features=[
                  SLIME_PILLAR,
                  GiantPlant(stem="gloop_goo", head="gloop_jelly", shape="puff", height=(5, 10), radius=(2, 4), count=1,
                             bend=0.3),
                  Boulder(blocks=[("gloop_goo", 4), ("gloop_glowgoo", 1)], radius=(2, 3), squash=0.6, count=1, chance=3),
                  Patch(block="gloop_tuft", count=6, tries=32),
                  Patch(block="gloop_bulb", count=2, tries=16),
                  Patch(block="gloop_drip", count=3, where="cave_ceiling"),
              ],
              spawns=[Spawn("blob_grazer", 12, (2, 4)), Spawn("bounce_slime", 5, (1, 3)), Spawn("goo_serpent", 2, (1, 1))]),
        Biome("gloop_jelly_shallows", "Jelly Shallows", top="gloop_turf", under="gloop_jellysoil", temperature=0.35,
              humidity=0.6, elevation=-0.7, underwater="gloop_jelly", grass_color="#9cf040", water_color="#ff5ab0",
              water_fog_color="#c02a80", particles=[("minecraft:item_slime", 0.002)], ambient="bubbling",
              music="minecraft:music.overworld.lush_caves",
              surface_noise=[("gloop_jellysoil", 0.45)],
              features=[
                  Patch(block="gloop_jelly_pad", where="water_surface", count=8, tries=40, max_depth=4),
                  Spire(blocks=[("gloop_jelly", 3), ("gloop_goo", 1)], tip="gloop_glowgoo", height=(8, 16), radius=(1, 2),
                        lean=0.35, count=1, chance=2, where="underwater"),
                  Patch(block="gloop_tuft", count=4, tries=24),
                  Patch(block="gloop_bulb", count=3, tries=16),
              ],
              spawns=[Spawn("goo_serpent", 10, (1, 2)), Spawn("blob_grazer", 8, (2, 3)), Spawn("bounce_slime", 2, (1, 2))]),
        Biome("gloop_ooze_bog", "Ooze Bog", top="gloop_turf", under="gloop_jellysoil", temperature=-0.4, humidity=0.65,
              elevation=0.0, grass_color="#4a7a24", foliage_color="#38621c", water_color="#7ad040",
              water_fog_color="#2a5010", fog_color="#7ab878", fog_end=90, sky_color="#58c0a0",
              particles=[("minecraft:item_slime", 0.006), ("dust:#62942e:1.4", 0.006)], ambient="wet_squelch",
              music="minecraft:music.overworld.swamp",
              surface_noise=[("gloop_ooze", 0.25)],
              features=[
                  GiantPlant(stem="gloop_goo", head="gloop_glowgoo", shape="umbrella", height=(7, 13), radius=(2, 4),
                             bend=0.7, count=2),
                  Patch(block="gloop_burble_vent", count=1, tries=4, chance=2),
                  Patch(block="gloop_drip", count=5, where="cave_ceiling"),
                  Patch(block="gloop_bulb", count=4, tries=24),
                  Patch(block="gloop_tuft", count=3, tries=16),
                  Disk(block="gloop_ooze", replace=["gloop_turf", "gloop_jellysoil"], radius=(2, 4), count=1),
              ],
              spawns=[Spawn("bounce_slime", 10, (2, 3)), Spawn("goo_serpent", 4, (1, 1)), Spawn("blob_grazer", 4, (1, 2))]),
        Biome("gloop_bubble_fields", "Bubble Fields", top="gloop_turf", under="gloop_jellysoil", temperature=-0.2,
              humidity=-0.65, elevation=0.1, grass_color="#7ee02a", water_color="#ff5ab0", water_fog_color="#b8287a",
              sky_color="#86ecd8", particles=[("minecraft:bubble_pop", 0.002), ("dust:#7af8e8:1.0", 0.005)],
              ambient="bubbling", music="minecraft:music_disc.chirp",
              features=[
                  Boulder(blocks=[("gloop_bubble", 1)], radius=(4, 7), hollow=True, squash=0.9, count=1, chance=2),
                  Boulder(blocks=[("gloop_bubble", 1)], radius=(2, 4), hollow=True, where="air", count=1, chance=2,
                          y=(95, 135)),
                  Boulder(blocks=[("gloop_glowgoo", 1), ("gloop_goo", 2)], radius=(1, 2), count=1, chance=2),
                  Patch(block="gloop_burble_vent", count=1, tries=3, chance=3),
                  Patch(block="gloop_bulb", count=3, tries=24),
                  Patch(block="gloop_tuft", count=5, tries=24),
              ],
              spawns=[Spawn("blob_grazer", 16, (3, 5)), Spawn("bounce_slime", 3, (1, 2))]),
    ],
    effects=[],
    ambient="wet_squelch",
    music="minecraft:music_disc.chirp",
    platform="gloopstone",
    icon="portalgun:gloopolis_bounce_jelly",
)
