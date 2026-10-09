"""U-404 Inversia - an upside-down world: meadows hanging from a stone sky above a bottomless void."""
import math

import numpy as np
from PIL import Image

from gen.content.dsl import *
from gen.noise import fbm, rng

# ------------------------------------------------------------------------------------------------ palette
# slate-violet stone sky, sage meadows growing downward, bone-white roots, amber lantern pods, blue void
P_STONE = ["#2c2840", "#3a3452", "#4a4264", "#5a5276", "#6c6488"]
P_TURF = ["#2e5a4c", "#3c7060", "#4e8a72", "#66a486", "#86c09c"]
P_SOIL = ["#3a2c2a", "#4a3a34", "#5a4840", "#6c584c"]
P_ROOT = ["#8a8070", "#a89c88", "#c4b8a0", "#dcd2bc", "#efe8d6"]
P_LEAF = ["#2a4a5a", "#386070", "#4a7a86", "#5e94a0", "#7cb0b8"]
P_POD = ["#a0480c", "#e07a1a", "#ffae3a", "#ffd878", "#fff4c8"]
P_QUARTZ = ["#4a5aa0", "#6a86d0", "#96b8f0", "#c8e0ff", "#f4faff"]
P_MOSS = ["#3a6a4a", "#4e8a5c", "#6aa874", "#8ec890"]


# ------------------------------------------------------------------------------------------------ custom textures
def _hex(c):
    c = c.lstrip("#")
    return np.array([int(c[i:i + 2], 16) for i in (0, 2, 4)], float)


def _arr(img):
    return np.asarray(img.convert("RGBA"), float).copy()


def _img(a):
    return Image.fromarray(np.clip(np.round(a), 0, 255).astype(np.uint8), "RGBA")


def flip_v(img):
    """The same texture, upside down (everything in Inversia grows the wrong way)."""
    return img.convert("RGBA").transpose(Image.FLIP_TOP_BOTTOM)


def rooted(base, root_pal, seed, roots=3):
    """Soil threaded with pale wandering rootlets."""
    a = _arr(base)
    cols = [_hex(c) for c in root_pal]
    R = rng(seed + ":roots")
    for k in range(roots):
        x, y = float(R.integers(0, 16)), float(R.integers(0, 16))
        ang = R.uniform(0, 2 * math.pi)
        for step in range(int(R.integers(6, 12))):
            xi, yi = int(round(x)) % 16, int(round(y)) % 16
            a[yi, xi, :3] = cols[2 + (step % 2)]
            if step % 3 == 0:
                a[(yi + 1) % 16, xi, :3] = a[(yi + 1) % 16, xi, :3] * 0.7   # shadow under the root
            ang += R.uniform(-0.7, 0.7)
            x += math.cos(ang)
            y += math.sin(ang)
    return _img(a)


def stratified(base, band_hex, seed):
    """Stone with faint pale horizontal strata (the underside of the sky is sedimentary)."""
    a = _arr(base)
    b = _hex(band_hex)
    n = fbm(16, 1, 4, seed + ":s", 2)[0]
    for x in range(16):
        for y0 in (4, 11):
            y = (y0 + int(round((n[x] - 0.5) * 3))) % 16
            a[y, x, :3] = a[y, x, :3] * 0.55 + b * 0.45
    return _img(a)


# ------------------------------------------------------------------------------------------------ features
UPSIDE_DOWN_TREE = Spire(blocks=[("inversia_rootwood", 1)], cap="inversia_leaves", tip="inversia_lantern_pod",
                         height=(6, 12), radius=(2, 2), lean=0.25, where="cave_ceiling", count=3)
STALACTITE = Spire(blocks=[("inversia_skystone", 4), ("inversia_gravity_quartz", 1)], tip="inversia_quartz_drip",
                   height=(18, 40), radius=(3, 6), lean=0.1, where="cave_ceiling", count=1, chance=2)
SKY_ROOTS = Structure(kind="tendril", blocks={"main": "inversia_rootwood", "tip": "inversia_lantern_pod"}, size=(5, 9),
                      params={"curl": 0.45, "thickness": 0.8}, count=1, chance=7)
VOID_SHARD = Boulder(blocks=[("inversia_skystone", 5), ("inversia_gravity_quartz", 1), ("inversia_turf", 2)], radius=(2, 4),
                     squash=0.7, where="air", y=(30, 110), count=1, chance=5)

DIMENSION = Dimension(
    id="inversia",
    code="U-404",
    name="Inversia",
    tagline="Meadows hang from a stone sky above the void",
    description=("Somebody turned this world upside down and forgot to tell gravity. Meadows hang from a stone sky, "
                 "trees grow downward with lantern pods at their tips, and a blue planet glows far below your feet. "
                 "Root Grazers browse the dangling roots, but Ceiling Crawlers drop from above - and one bite makes "
                 "you fall the wrong way. Do not step off the islands."),
    danger=3,
    color="#8a7ad8",
    terrain=Terrain(style="inverted", stone="inversia_skystone", fluid="minecraft:air", sea_level=0, height=74,
                    amplitude=30, scale=1.1, roughness=0.35, caves=False, ores=True, min_y=0, total_height=256,
                    bedrock_floor=False,
                    params={"ceiling": 152, "hang": 62, "holes": 0.15, "floor": 0.34, "biome_size": 280}),
    sky=Sky(sky_color="#6a7ac8", fog_color="#3a3860", fog_start=40, fog_end=200, cloud_color=None, time="day",
            ambient_light=0.3, star_brightness=0.5,
            bodies=[Celestial("planet", ["#0e2a5a", "#1e5aa0", "#3aa0c8", "#9ae0f0"], size=150, yaw=20, pitch=-62, roll=30,
                              seed="inversia-below"),
                    Celestial("nebula", ["#2a1a5a", "#6a4ac0", "#c0a0ff", "#ffffff"], size=200, yaw=200, pitch=-35,
                              alpha=0.55, additive=True, seed="inversia-void"),
                    Celestial("moon", ["#6a5a7a", "#b0a0c0", "#f0e8ff"], size=22, yaw=140, pitch=-20, seed="inversia-moon")]),
    blocks=[
        Block("inversia_turf", "Hanging Turf", "grass", {
            "top": tex(rooted, tex("grass_top", ["#22403a", "#2a4e44", "#345c50", "#3e6a5a", "#4a7a66"], seed="inversia-turf-top"), P_ROOT,
                       "inversia-turf-top", 1),
            "side": tex(flip_v, tex("grass_side", P_TURF, P_SOIL, seed="inversia-turf")),
            "bottom": tex("grass_top", P_TURF, seed="inversia-turf")}, hardness=0.6, sound="grass", map_color="color_green"),
        Block("inversia_rootloam", "Rootloam", "soil", {"all": tex(rooted, tex("dirt", P_SOIL, seed="inversia-soil"), P_ROOT,
                                                                   "inversia-loam")},
              hardness=0.5, sound="rooted_dirt", map_color="dirt"),
        Block("inversia_skystone", "Skystone", "stone", {"all": tex(stratified, tex("stone", P_STONE, seed="inversia-stone"),
                                                                    "#8a80a8", "inversia-stone")},
              hardness=1.5, map_color="color_purple"),
        Block("inversia_rootwood", "Rootwood", "log", {
            "side": tex("log_side", P_ROOT, seed="inversia-rootwood"),
            "end": tex("log_top", P_ROOT, ["#e8e0cc", "#cfc4ac", "#b0a48c"], seed="inversia-rootwood-end")},
              hardness=2.0, sound="wood", map_color="sand", flammable=True),
        Block("inversia_leaves", "Downleaf", "leaves", {"all": tex(flip_v, tex("leaves", P_LEAF, seed="inversia-leaf"))},
              hardness=0.2, sound="azalea_leaves", map_color="color_light_blue", flammable=True),
        Block("inversia_dangleroots", "Dangleroots", "hanging_plant", {"cross": tex("tendril", P_ROOT[1:], seed="inversia-dangle")},
              hardness=0.0, sound="hanging_roots", map_color="sand"),
        Block("inversia_downgrass", "Downgrass", "hanging_plant", {"cross": tex(flip_v, tex("grass_tuft", P_TURF, seed="inversia-down"))},
              hardness=0.0, sound="grass", map_color="color_green"),
        Block("inversia_lantern_pod", "Lantern Pod", "hanging_plant", {"cross": tex("bulb", P_ROOT, P_POD, seed="inversia-pod")},
              hardness=0.0, sound="shroomlight", light=13, emissive=True, fruit="inversia_pod", drop_count=(1, 2),
              map_color="color_orange"),
        Block("inversia_gravity_quartz", "Gravity Quartz", "crystal_block", {"all": tex("crystal", P_QUARTZ, seed="inversia-quartz")},
              hardness=1.5, sound="amethyst", light=11, emissive=True, map_color="color_light_blue"),
        Block("inversia_quartz_drip", "Quartz Drip", "crystal_cluster", {"cross": tex("crystal_shard_sprite", P_QUARTZ,
                                                                                      seed="inversia-drip")},
              hardness=0.6, sound="amethyst_cluster", light=7, emissive=True, map_color="color_light_blue"),
        Block("inversia_curtain_moss", "Curtain Moss", "vine", {"face": tex("vine_overlay", P_MOSS, seed="inversia-curtain")},
              hardness=0.1, sound="moss", map_color="color_green"),
        Block("inversia_bellflower", "Upturned Bellflower", "plant", {"cross": tex("flower", ["#2e5a4c", "#3c7060", "#4e8a72"],
                                                                                 ["#5a3aa0", "#7a5ad0", "#a88af0", "#d8c8ff"],
                                                                                 seed="inversia-bell", shape="bell")},
              hardness=0.0, sound="grass", map_color="color_purple"),
    ],
    items=[
        Item("inversia_pod", "Lantern Pod", tex("item_icon", "fruit", P_POD, seed="inversia-pod-item"), kind="food",
             food=Food(3, 0.4, effects=[Effect("minecraft:slow_falling", 20, 0)]),
             lore="Falls up if you let go of it. Eat it and so do you, a little."),
        Item("inversia_gravity_silk", "Gravity Silk", tex("item_icon", "dust", ["#6a5aa0", "#b8a8f0", "#f0ecff"],
                                                          seed="inversia-silk"),
             rarity="uncommon", lore="Spun by Ceiling Crawlers. It drifts toward the sky."),
    ],
    creatures=[
        Creature("ceiling_crawler", "Ceiling Crawler", "crawler", ["#3e3460", "#241c3c", "#c8b8ff", "#e8ff60"],
                 pattern="veins", size=1.15,
                 body={"kind": "spider", "legs": 4, "leg_len": 13, "body_w": 9, "body_h": 6, "body_len": 11, "eyes": 6,
                       "eye_style": "glow", "mandibles": True, "head_size": 1.0, "spikes": 3},
                 behavior="hostile", health=24, damage=4, speed=0.3, abilities=["climb", "leap"],
                 on_hit=Effect("minecraft:levitation", 1.5, 0), spawn_light="any",
                 drops=[Drop("inversia_gravity_silk", 0, 2), Drop("minecraft:string", 0, 2)], sounds="spider", pitch=0.8,
                 xp=7, group=2,
                 description="It walks on the ceiling because to it the ceiling is the floor. Its bite flips you too."),
        Creature("drop_bat", "Drop Bat", "flyer", ["#3a2a4e", "#6a4a8a", "#ff4a6a", "#ff2a4a"], size=0.75,
                 body={"kind": "bat", "ears": "pointy", "mouth": "fangs", "eye_style": "angry", "wing_span": 9},
                 behavior="hostile", health=8, damage=3, speed=0.3, spawn_light="dark", abilities=["swarm"],
                 drops=[Drop("minecraft:leather", 0, 1, 0.5)], sounds="bat", pitch=0.8, xp=4, group=3,
                 description="Roosts on the underside of the islands and drops on anything that walks above."),
        Creature("root_grazer", "Root Grazer", "quadruped", ["#cfc6a8", "#6a8a6a", "#8fd0a0", "#202020"], pattern="patches",
                 size=1.1,
                 body={"leg_len": 9, "leg_w": 3, "body_len": 14, "body_h": 9, "body_w": 10, "neck": 6, "neck_angle": 35,
                       "horns": "antlers", "ears": "floppy", "eye_style": "sleepy", "hump": True, "mane": True, "tail": 2,
                       "tail_kind": "bushy", "snout": 3, "hooves": True},
                 behavior="passive", health=20, speed=0.2, tempt="inversia_dangleroots",
                 drops=[Drop("minecraft:mutton", 1, 2, cooked="minecraft:cooked_mutton"), Drop("inversia_pod", 0, 1, 0.4)],
                 sounds="goat", pitch=0.8, xp=3, group=4,
                 description="A gentle browser whose antlers grow like roots - downward, out of habit."),
    ],
    biomes=[
        Biome("inversia_hanging_meadows", "Hanging Meadows", top="inversia_turf", under="inversia_rootloam", temperature=0.2,
              humidity=0.2, grass_color="#4e8a72", foliage_color="#4a7a86",
              particles=[("minecraft:spore_blossom_air", 0.01), ("dust:#efe8d6:0.8", 0.003)], ambient="cozy_breeze",
              music="minecraft:music.overworld.meadow",
              features=[
                  UPSIDE_DOWN_TREE,
                  Patch(block="inversia_downgrass", count=10, tries=32, where="cave_ceiling"),
                  Patch(block="inversia_lantern_pod", count=3, tries=16, where="cave_ceiling"),
                  Patch(block="inversia_dangleroots", count=3, tries=16, where="cave_ceiling"),
                  Patch(block="inversia_bellflower", count=3, tries=24),
                  Patch(block="minecraft:short_grass", count=6, tries=32),
                  SKY_ROOTS,
                  VOID_SHARD,
              ],
              spawns=[Spawn("root_grazer", 12, (2, 4)), Spawn("ceiling_crawler", 3, (1, 1)), Spawn("drop_bat", 3, (1, 2))]),
        Biome("inversia_stalactite_deeps", "Stalactite Deeps", top="inversia_skystone", under="inversia_skystone",
              temperature=-0.6, humidity=-0.2, grass_color="#3c7060", foliage_color="#386070", fog_color="#2a2448",
              fog_end=120, particles=[("minecraft:end_rod", 0.0015), ("dust:#c8e0ff:0.6", 0.004)],
              ambient="crystal_chimes", music="minecraft:music.overworld.dripstone_caves",
              features=[
                  STALACTITE,
                  Spire(blocks=[("inversia_skystone", 1)], tip="inversia_quartz_drip", height=(6, 14), radius=(1, 2),
                        where="cave_ceiling", count=4),
                  CrystalCluster(block="inversia_gravity_quartz", small="inversia_quartz_drip", size=(3, 6),
                                 where="cave_ceiling", count=2),
                  Patch(block="inversia_quartz_drip", count=4, tries=16, where="cave_ceiling"),
                  Geode(outer="inversia_skystone", middle="minecraft:calcite", inner="inversia_gravity_quartz",
                        crystals=["inversia_quartz_drip"], y=(130, 200), count=1, chance=4),
                  VOID_SHARD,
              ],
              spawns=[Spawn("ceiling_crawler", 8, (1, 2)), Spawn("drop_bat", 8, (2, 3)), Spawn("root_grazer", 2, (1, 2))]),
        Biome("inversia_rootfall", "Rootfall", top="inversia_turf", under="inversia_rootloam", temperature=0.5,
              humidity=0.75, grass_color="#3c7060", foliage_color="#386070", fog_color="#30405a", fog_end=110,
              particles=[("dust:#c4b8a0:0.7", 0.006), ("minecraft:spore_blossom_air", 0.006)], ambient="wind_howl",
              music="minecraft:music.overworld.old_growth_taiga",
              features=[
                  Patch(block="inversia_dangleroots", count=14, tries=40, where="cave_ceiling"),
                  Patch(block="inversia_curtain_moss", count=6, tries=32, where="cave_ceiling"),
                  Patch(block="inversia_downgrass", count=4, tries=24, where="cave_ceiling"),
                  Spire(blocks=[("inversia_rootwood", 3), ("inversia_rootloam", 1)], height=(10, 22), radius=(1, 2),
                        lean=0.5, where="cave_ceiling", count=2),
                  Structure(kind="tendril", blocks={"main": "inversia_rootwood", "tip": "inversia_leaves"}, size=(6, 11),
                            params={"curl": 0.6}, count=1, chance=3),
                  Patch(block="minecraft:short_grass", count=4, tries=24),
              ],
              spawns=[Spawn("root_grazer", 14, (2, 5)), Spawn("drop_bat", 4, (1, 3)), Spawn("ceiling_crawler", 2, (1, 1))]),
        Biome("inversia_lantern_hollows", "Lantern Hollows", top="inversia_turf", under="inversia_rootloam",
              temperature=0.75, humidity=-0.6, grass_color="#66a486", foliage_color="#5e94a0", fog_color="#4a3a48",
              particles=[("dust:#ffae3a:0.7", 0.006), ("minecraft:firefly", 0.004)], ambient="alien_hum",
              music="minecraft:music.overworld.lush_caves",
              features=[
                  Patch(block="inversia_lantern_pod", count=10, tries=32, where="cave_ceiling"),
                  UPSIDE_DOWN_TREE,
                  Patch(block="inversia_downgrass", count=6, tries=24, where="cave_ceiling"),
                  Patch(block="inversia_bellflower", count=4, tries=24),
                  CrystalCluster(block="inversia_gravity_quartz", small="inversia_quartz_drip", size=(2, 4),
                                 where="cave_ceiling", count=1),
                  SKY_ROOTS,
              ],
              spawns=[Spawn("root_grazer", 10, (2, 3)), Spawn("ceiling_crawler", 4, (1, 1)), Spawn("drop_bat", 2, (1, 2))]),
    ],
    effects=["floaty"],
    arrival_y=76,
    platform="inversia_skystone",
    ambient="cozy_breeze",
    music="minecraft:music.overworld.meadow",
    icon="portalgun:inversia_pod",
)
