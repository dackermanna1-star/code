"""E-44 Oculus Swamp - a murky purple swamp where eyeballs grow on stalks and everything watches you."""
from gen.content.dsl import *

# palette: bruise violet, bog purple-brown, sclera ivory, bloodshot red, iris acid green, pupil black
P_MOSS = ["#36204a", "#46295c", "#5a3470", "#704486", "#88589c"]
P_MUD = ["#2a1c2c", "#372536", "#453143", "#543e52"]
P_LID = ["#2e2430", "#3c3040", "#4c3e50", "#5e5062", "#706274"]
P_FLESH = ["#6a2a40", "#8a3a52", "#a85068", "#c46a80", "#dc8a9a"]
P_SCLERA = ["#b8a69a", "#d2c2b4", "#e6d8ca", "#f4ece2"]
P_VEIN = ["#8a1020", "#b02030", "#d03a44"]
P_IRIS = ["#3a5a10", "#6a9a18", "#a8d030", "#d8f070", "#f4ffc0"]
P_MIRE = ["#22182a", "#30223a", "#40304a", "#52405c"]
P_LEAF = ["#2a2a1a", "#3e3a24", "#5a4a30", "#6e5a3a"]
IRIS = "#b8e040"
SCLERA = "#ece0d4"


def _hex(c):
    c = c.lstrip("#")
    return [int(c[i:i + 2], 16) for i in (0, 2, 4)]


def _iris(pal, seed):
    """A staring iris: black pupil, radial striations, dark limbal ring, a white glint."""
    import math
    import numpy as np
    from PIL import Image
    from gen.noise import rng
    cols = [np.array(_hex(c), float) for c in pal]
    r = rng(seed)
    spokes = r.random(64)
    a = np.zeros((16, 16, 4))
    a[..., 3] = 255
    for y in range(16):
        for x in range(16):
            dx, dy = x + 0.5 - 8, y + 0.5 - 8
            d = math.hypot(dx, dy)
            ang = (math.atan2(dy, dx) / (2 * math.pi) + 0.5) * 64
            s = spokes[int(ang) % 64]
            if d < 2.9:
                col = np.array([10, 4, 14], float)
            elif d < 3.6:
                col = cols[0] * 0.7
            elif d < 7.0:
                t = (d - 3.6) / 3.4
                k = max(0, min(len(cols) - 1, int(round((1 - t) * (len(cols) - 2) + s * 1.6 - 0.4))))
                col = cols[k]
            else:
                col = cols[0] * 0.55
            a[y, x, :3] = col
    a[5, 9, :3] = [255, 255, 255]
    a[5, 10, :3] = [230, 240, 220]
    a[6, 9, :3] = [220, 230, 210]
    return Image.fromarray(a.clip(0, 255).astype("uint8"), "RGBA")


def _eye_lily(pad_pal, seed):
    """A lily pad with a lidded eye peeking out of its middle."""
    import numpy as np
    from PIL import Image
    from gen.textures import lily_pad
    a = np.asarray(lily_pad(pad_pal, seed).convert("RGBA"), float).copy()
    white = np.array(_hex(SCLERA), float)
    iris = np.array(_hex(IRIS), float)
    for y in range(16):
        for x in range(16):
            ex, ey = (x + 0.5 - 8) / 3.6, (y + 0.5 - 8) / 2.2
            if ex * ex + ey * ey <= 1.0:
                a[y, x, :3] = white
                a[y, x, 3] = 255
                if (x + 0.5 - 8) ** 2 + (y + 0.5 - 8) ** 2 <= 3.2:
                    a[y, x, :3] = iris
                if (x + 0.5 - 8) ** 2 + (y + 0.5 - 8) ** 2 <= 0.8:
                    a[y, x, :3] = [12, 6, 16]
            elif ex * ex + ey * ey <= 1.45 and a[y, x, 3] > 0:
                a[y, x, :3] = np.array(_hex("#3a1a2a"), float)
    return Image.fromarray(a.clip(0, 255).astype("uint8"), "RGBA")


def _bloodshot(seed):
    """Sclera block: ivory with branching red capillaries."""
    from gen.textures import flesh
    return flesh(P_SCLERA, P_VEIN, seed)


DIMENSION = Dimension(
    id="oculus",
    code="E-44",
    name="Oculus Swamp",
    tagline="The swamp that stares back",
    description=("A violet bog under a sky full of open eyes. Eyeballs grow on fleshy stalks, lily pads blink, and "
                 "black pupil-pools ringed with glowing irises dilate as you pass. Eyebats flutter harmlessly, but the "
                 "Floating Eyes fire bolts that drag at your legs, and Bog Lurkers wait under the water with too many "
                 "eyes of their own."),
    danger=3,
    color=IRIS,
    terrain=Terrain(style="flat", stone="oculus_lidstone", sea_level=63, height=64, amplitude=3.5, roughness=0.12,
                    deepslate="minecraft:deepslate",
                    params={"ponds": 0.55, "biome_size": 260, "beach_block": "oculus_bog_mud", "beach_height": 1}),
    sky=Sky(sky_color="#2a1438", fog_color="#3a2448", fog_start=6, fog_end=96, cloud_color="#88402a50",
            cloud_height=150, time="night", star_brightness=0.25, ambient_light=0.16, sky_light_color="#c0a0e0",
            moon_phase="new_moon",
            bodies=[
                Celestial("eye", ["#3a5a10", IRIS, "#f4ffc0"], size=110, yaw=180, pitch=38, seed="oculus-eye1"),
                Celestial("eye", ["#6a1020", "#e04050", "#ffc0c0"], size=36, yaw=60, pitch=62, seed="oculus-eye2"),
                Celestial("eye", ["#10406a", "#40a0e0", "#c0f0ff"], size=24, yaw=300, pitch=24, seed="oculus-eye3"),
                Celestial("nebula", ["#1a0a20", "#5a2a6a", "#a06aa0"], size=160, yaw=100, pitch=75, alpha=0.3,
                          additive=True, seed="oculus-haze"),
            ]),
    blocks=[
        Block("oculus_bogmoss", "Bogmoss", "grass", {
            "top": tex("grass_top", P_MOSS, seed="oculus-moss"),
            "side": tex("grass_side", P_MOSS, P_MUD, seed="oculus-moss"),
            "bottom": tex("dirt", P_MUD, seed="oculus-mud")}, hardness=0.6, sound="moss", map_color="color_purple"),
        Block("oculus_bog_mud", "Bog Mud", "soil", {"all": tex("dirt", P_MUD, seed="oculus-mud")}, hardness=0.5,
              sound="mud", map_color="terracotta_purple"),
        Block("oculus_lidstone", "Lidstone", "stone", {"all": tex("stone", P_LID, seed="oculus-lid")}, hardness=1.5,
              map_color="terracotta_gray"),
        Block("oculus_eyestalk", "Eyestalk", "log", {
            "side": tex("flesh", P_FLESH, P_VEIN, seed="oculus-stalk"),
            "end": tex("log_top", P_FLESH, ["#dc8a9a", "#f0b0b8"], seed="oculus-stalk-end")},
              hardness=1.0, sound="mud", tool="hoe", map_color="color_pink"),
        Block("oculus_eyeball", "Eyeball Flesh", "solid", {"all": tex(_bloodshot, "oculus-sclera")}, hardness=0.8,
              sound="slime", tool="hoe", map_color="snow"),
        Block("oculus_iris", "Glaring Iris", "glow", {"all": tex(_iris, P_IRIS, "oculus-iris")}, hardness=0.8,
              sound="slime", light=9, emissive=True, tool="hoe", map_color="color_light_green"),
        Block("oculus_pupil_gel", "Pupil Gel", "sticky", {"all": tex("obsidian_like", ["#06030a", "#0e0818", "#1c1030",
                                                                                    "#3a2a5a"], seed="oculus-pupil")},
              hardness=0.6, sound="honey", speed=0.4, jump=0.5, map_color="color_black"),
        Block("oculus_eyestalk_sprout", "Watching Sprout", "plant",
              {"cross": tex("eyeball_plant", P_FLESH, SCLERA, IRIS, seed="oculus-sprout")},
              hardness=0.0, sound="fungus", light=4, emissive=True),
        Block("oculus_eye_lily", "Blinking Lily", "lily", {"top": tex(_eye_lily, ["#2a3a1a", "#3e5226", "#566a32", "#6e8240"],
                                                                     "oculus-lily")},
              hardness=0.0, sound="lily_pad"),
        Block("oculus_weeping_lashes", "Weeping Lashes", "hanging_plant",
              {"cross": tex("tendril", ["#1a0e1e", "#3a2040", "#6a4070"], seed="oculus-lash")}, hardness=0.0,
              sound="cave_vines"),
        Block("oculus_mirewood_log", "Mirewood Log", "log", {
            "side": tex("log_side", P_MIRE, seed="oculus-mire"),
            "end": tex("log_top", P_MIRE, ["#5a4a62", "#6e5c76"], seed="oculus-mire-end")}, hardness=2.0, sound="wood",
              flammable=True, map_color="color_purple"),
        Block("oculus_mirewood_leaves", "Mirewood Leaves", "leaves", {"all": tex("leaves", P_LEAF, seed="oculus-leaf",
                                                                               holes=0.3)},
              hardness=0.2, sound="leaves", map_color="color_brown"),
    ],
    items=[
        Item("oculus_pickled_eye", "Pickled Eye", tex("item_icon", "eyeball", ["#a8c040", SCLERA, "#3a5a10"], seed="oculus-pickle"),
             kind="food", food=Food(3, 0.4, always=True, effects=[Effect("minecraft:night_vision", 60, 0),
                                                                  Effect("minecraft:nausea", 5, 0, chance=0.4)]),
             lore="It blinks if you shake the jar."),
        Item("oculus_watcher_lens", "Watcher's Lens", tex("item_icon", "orb", ["#3a5a10", IRIS, "#f4ffc0"], seed="oculus-lens"),
             rarity="rare", glint=True, lore="Look through it, and something looks back."),
    ],
    creatures=[
        Creature("floating_eye", "Floating Eye", "eye", [SCLERA, "#7a3a52", "#c03040", IRIS], pattern="veins", size=1.2,
                 body={"eye_px": 14, "lids": True, "stalks": 5, "tentacles": 4, "tentacle_len": 10, "spikes": 0},
                 behavior="hostile", attack="ranged", health=22, damage=3, speed=0.22,
                 ranged={"color": "#b8ff40", "damage": 3, "effect": Effect("minecraft:slowness", 3, 1), "cooldown": 45,
                         "homing": 0.35, "speed": 0.9, "particle": "minecraft:glow"},
                 spawn_light="dark",
                 drops=[Drop("oculus_watcher_lens", 0, 1, chance=0.4), Drop("minecraft:spider_eye", 0, 2)],
                 sounds="guardian", pitch=1.25, xp=10, group=1,
                 description="A beholder of the bog. It never blinks, and its gaze is heavy enough to slow you down."),
        Creature("bog_lurker", "Bog Lurker", "quadruped", ["#3a2e48", "#6a7a3a", IRIS, "#ff3050"], pattern="patches",
                 size=1.1,
                 body={"stance": "low", "leg_len": 3, "leg_w": 3, "body_len": 18, "body_h": 6, "body_w": 10, "snout": 5,
                       "jaw": True, "mouth": "fangs", "eyestalks": 3, "eyes": 4, "eye_style": "slit", "spikes": 5,
                       "tail": 2, "tail_len": 4, "ears": "none", "head_size": 1.1},
                 behavior="hostile", health=26, damage=5, speed=0.24, armor=2, movement="amphibious",
                 abilities=["charge"], on_hit=Effect("minecraft:slowness", 3),
                 drops=[Drop("oculus_pickled_eye", 0, 2), Drop("minecraft:leather", 0, 1), Drop("minecraft:slime_ball", 0, 1)],
                 sounds="frog", pitch=0.5, xp=8, group=2,
                 description="Lies under the scum with only its eyestalks up. If the water looks back, back away."),
        Creature("eyebat", "Eyebat", "eye", ["#d8c8c0", "#4a2848", "#ffb0c0", "#3050ff"], size=0.5,
                 body={"eye_px": 10, "wings": True, "wing_kind": "membrane", "lids": True},
                 behavior="passive", category="ambient", health=4, speed=0.3,
                 drops=[Drop("minecraft:spider_eye", 0, 1, chance=0.5)],
                 sounds="bat", pitch=1.3, xp=1, group=4,
                 description="A single eye on bat wings. It just wants to see everything."),
    ],
    biomes=[
        Biome("oculus_staring_bog", "Staring Bog", top="oculus_bogmoss", under="oculus_bog_mud", temperature=0.0,
              humidity=0.2, underwater="oculus_bog_mud", grass_color="#5e3a70", foliage_color="#5a4a30",
              water_color="#4a2a5a", water_fog_color="#1e0e26",
              particles=[("minecraft:mycelium", 0.02), ("dust:#b8e040:0.6", 0.0015)], ambient="wet_squelch",
              features=[
                  GiantPlant(stem="oculus_eyestalk", head="oculus_eyeball", shape="sphere", decoration="oculus_iris",
                             height=(6, 13), radius=(2, 4), bend=0.5, count=1),
                  Tree(log="oculus_mirewood_log", leaves="oculus_mirewood_leaves", shape="twisted", height=(5, 8),
                       decoration="oculus_weeping_lashes", count=1, chance=2),
                  Patch(block="oculus_eyestalk_sprout", count=3, tries=14),
                  Patch(block="oculus_eye_lily", where="water_surface", count=3, tries=16, max_depth=3),
              ],
              spawns=[Spawn("eyebat", 10, (2, 4)), Spawn("floating_eye", 4, (1, 1)), Spawn("bog_lurker", 3, (1, 2))]),
        Biome("oculus_weeping_mire", "Weeping Mire", top="oculus_bogmoss", under="oculus_bog_mud", temperature=-0.3,
              humidity=0.8, elevation=-0.5, underwater="oculus_bog_mud", grass_color="#4c2c5c",
              foliage_color="#3e3a24", water_color="#3a2a40", water_fog_color="#140a18", fog_color="#2a1a34",
              fog_end=64, particles=[("minecraft:dripping_water", 0.01), ("minecraft:mycelium", 0.02)],
              ambient="wet_squelch", music="minecraft:music.overworld.swamp",
              features=[
                  Tree(log="oculus_mirewood_log", leaves="oculus_mirewood_leaves", shape="twisted", height=(6, 10),
                       decoration="oculus_weeping_lashes", count=2),
                  Patch(block="oculus_eye_lily", where="water_surface", count=8, tries=24, max_depth=4),
                  Patch(block="oculus_eyestalk_sprout", count=2, tries=12),
                  Patch(block="oculus_weeping_lashes", where="cave_ceiling", count=2),
              ],
              spawns=[Spawn("bog_lurker", 6, (1, 2)), Spawn("eyebat", 8, (2, 3)), Spawn("floating_eye", 2, (1, 1))]),
        Biome("oculus_iris_hummocks", "Iris Hummocks", top="oculus_bogmoss", under="oculus_bog_mud", temperature=0.6,
              humidity=-0.4, elevation=0.3, underwater="oculus_bog_mud", grass_color="#744a86",
              foliage_color="#5a4a30", water_color="#4a2a5a", water_fog_color="#1e0e26",
              particles=[("dust:#b8e040:0.7", 0.003)], ambient="eerie_choir",
              surface_noise=[("oculus_bog_mud", 0.5)],
              features=[
                  Lake(fluid="oculus_pupil_gel", border="oculus_iris", chance=3),
                  Structure(kind="tendril", blocks={"main": "oculus_eyestalk", "tip": "oculus_eyeball"}, size=(6, 11),
                            params={"curl": 0.5}, count=1, chance=2),
                  GiantPlant(stem="oculus_eyestalk", head="oculus_eyeball", shape="sphere", decoration="oculus_iris",
                             height=(9, 16), radius=(3, 5), bend=0.3, count=1, chance=2),
                  Patch(block="oculus_eyestalk_sprout", count=4, tries=16),
              ],
              spawns=[Spawn("floating_eye", 5, (1, 2)), Spawn("eyebat", 8, (1, 3)), Spawn("bog_lurker", 1, (1, 1))]),
        Biome("oculus_gazing_pits", "The Gazing Pits", top="oculus_bog_mud", under="oculus_lidstone", temperature=-0.6,
              humidity=-0.4, underwater="oculus_bog_mud", grass_color="#3a2148", foliage_color="#3e3a24",
              water_color="#2a1a30", water_fog_color="#100810", fog_color="#2a1630", fog_end=72,
              particles=[("minecraft:mycelium", 0.015), ("minecraft:glow", 0.0008)], ambient="eerie_choir",
              surface_noise=[("oculus_bogmoss", 0.35)],
              features=[
                  GiantPlant(stem="oculus_eyestalk", head="oculus_eyeball", shape="sphere", decoration="oculus_iris",
                             height=(2, 3), radius=(4, 6), count=1, chance=2),
                  Lake(fluid="oculus_pupil_gel", border="oculus_iris", chance=2),
                  Structure(kind="tendril", blocks={"main": "oculus_eyestalk", "tip": "oculus_iris"}, size=(4, 8),
                            count=1, chance=2),
                  Patch(block="oculus_eyestalk_sprout", count=3, tries=16),
              ],
              spawns=[Spawn("floating_eye", 7, (1, 2)), Spawn("eyebat", 6, (1, 3)), Spawn("bog_lurker", 2, (1, 1))]),
    ],
    effects=[],
    music="minecraft:music.overworld.swamp",
    ambient="wet_squelch",
    platform="oculus_lidstone",
    icon="portalgun:oculus_watcher_lens",
)
