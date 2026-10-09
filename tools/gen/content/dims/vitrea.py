"""G-55 Vitrea - a glass desert under twin suns."""
from gen.content.dsl import *

# palette: pale peach sand, amber glass, rose glass, turquoise oasis, heat-white sky, fulgurite brown
P_SAND = ["#d8b890", "#e4c8a0", "#eed6b0", "#f6e4c4", "#fff2dc"]
P_SANDSTONE = ["#b08a5a", "#c49e6c", "#d4b07e", "#e2c292", "#eed4a8"]
P_AMBER = ["#c87a20", "#e8a040", "#ffc060", "#ffe0a0"]
P_ROSE = ["#c04a70", "#e06a8e", "#ff90b0", "#ffd0e0"]
P_TURQ = ["#0e8a8a", "#20b0a8", "#3ad6c8", "#8af0e4", "#d0fff8"]
P_FULGURITE = ["#3a2a20", "#5a4030", "#7a5a40", "#a08060", "#e8f0f0"]
P_PALM = ["#6a4a2a", "#84603a", "#9c784a", "#b4905c"]


def _glass_sand(pal, sparkle, seed):
    """Sand whose grains are tiny beads of glass: base sand plus scattered bright glints."""
    import numpy as np
    from PIL import Image
    from gen.noise import rng
    from gen.textures import sand, pal as P
    a = np.asarray(sand(pal, seed).convert("RGBA"), float).copy()
    cols = [np.array([int(c[i:i + 2], 16) for i in (1, 3, 5)], float) for c in P(sparkle)]
    r = rng(seed + ":glint")
    for k in range(9):
        x, y = int(r.integers(0, 16)), int(r.integers(0, 16))
        a[y, x, :3] = cols[k % len(cols)]
        if k % 3 == 0:
            a[y, (x + 1) % 16, :3] = cols[-1] * 0.6 + a[y, (x + 1) % 16, :3] * 0.4
    return Image.fromarray(a.astype("uint8"), "RGBA")


def _mirage(pal, seed, frames=1):
    """Shimmering heat-haze glass that looks like water: soft caustic ripples, semi transparent, animated."""
    import math
    import numpy as np
    from PIL import Image
    from gen.textures import pal as P
    cols = [np.array([int(c[i:i + 2], 16) for i in (1, 3, 5)], float) for c in P(pal)]
    out = []
    n = max(1, frames)
    for f in range(n):
        ph = 2 * math.pi * f / n
        a = np.zeros((16, 16, 4))
        for y in range(16):
            for x in range(16):
                u = math.sin((x + 2 * math.sin(y * 2 * math.pi / 16 + ph)) * 2 * math.pi / 16 * 2 + ph)
                v = math.sin((y + 2 * math.cos(x * 2 * math.pi / 16 - ph)) * 2 * math.pi / 16 * 2 - ph)
                t = (u * v + 1) / 2
                i = int(max(0, min(len(cols) - 1, round(t * (len(cols) - 1)))))
                a[y, x, :3] = cols[i]
                a[y, x, 3] = 150 + 70 * t
        out.append(Image.fromarray(a.astype("uint8"), "RGBA"))
    return out if frames > 1 else out[0]


def _fused_glass(pal, seed, alpha=(120, 200)):
    """Frameless natural glass: smooth translucent body, faint flow streaks and a few bright glints."""
    import numpy as np
    from PIL import Image
    from gen.noise import fbm, rng
    from gen.textures import pal as P
    cols = [np.array([int(c[i:i + 2], 16) for i in (1, 3, 5)], float) for c in P(pal)]
    n = fbm(16, 16, 8, seed, 3)
    r = rng(seed + ":g")
    a = np.zeros((16, 16, 4))
    for y in range(16):
        for x in range(16):
            streak = 0.12 if (x + y * 2 + int(n[y, x] * 6)) % 9 == 0 else 0.0
            t = max(0.0, min(0.999, n[y, x] * 1.1 - 0.05 + streak))
            i = int(t * (len(cols) - 1))
            a[y, x, :3] = cols[i]
            a[y, x, 3] = alpha[0] + (alpha[1] - alpha[0]) * t
    for k in range(4):
        x, y = int(r.integers(0, 15)), int(r.integers(0, 15))
        a[y, x] = [255, 255, 255, 235]
        a[y, x + 1] = [255, 255, 255, 170]
    return Image.fromarray(a.astype("uint8"), "RGBA")


DIMENSION = Dimension(
    id="vitrea",
    code="G-55",
    name="Vitrea",
    tagline="Glass dunes burning under twin suns",
    description=("Two suns have baked this desert until the sand itself turned to glass: dunes glitter, lightning "
                 "leaves fulgurite spires behind, and rose-glass arches throw pink light across the sand. Crystal "
                 "cacti bloom, oases shimmer - check before you drink, half of them are mirages. Dune Striders are "
                 "gentle; Glass Scorpions are not, and the dunes themselves sometimes open up with teeth."),
    danger=3,
    color="#ffb347",
    terrain=Terrain(style="dunes", stone="vitrea_sandstone", sea_level=56, height=70, amplitude=20, roughness=0.05,
                    deepslate="minecraft:deepslate",
                    params={"wavelength": 64, "direction": 30, "cross": 0.3, "dune_height": 24,
                            "beach_block": "vitrea_glass_sand", "beach_height": 1, "biome_size": 340}),
    sky=Sky(sky_color="#9cd4f4", fog_color="#ffe4c4", fog_start=50, fog_end=230, cloud_color="#80fff0e0",
            cloud_height=240, time="afternoon", sunrise_color="#ffff9060", sky_light_color="#fff0d0",
            bodies=[
                Celestial("sun", ["#ffe8f0", "#ff90b0", "#e04a70"], size=26, yaw=105, pitch=50, seed="vitrea-sun2"),
                Celestial("planet", ["#c8a070", "#e8d0a8", "#fff4e0"], size=60, yaw=250, pitch=30, alpha=0.5,
                          seed="vitrea-moon"),
            ]),
    blocks=[
        Block("vitrea_glass_sand", "Glass Sand", "sand", {"all": tex(_glass_sand, P_SAND, ["#ffffff", "#bff6ff", "#ffd6e6"],
                                                                     "vitrea-sand")},
              hardness=0.5, sound="sand", map_color="sand"),
        Block("vitrea_sandstone", "Sunbaked Sandstone", "stone", {"all": tex("stone", P_SANDSTONE, seed="vitrea-sandstone")},
              hardness=1.2, map_color="sand"),
        Block("vitrea_dune_glass", "Dune Glass", "glass", {"all": tex(_fused_glass, P_AMBER, "vitrea-duneglass", alpha=(130, 210))},
              hardness=0.4, sound="glass", map_color="color_orange"),
        Block("vitrea_rose_glass", "Rose Glass", "glass", {"all": tex(_fused_glass, P_ROSE, "vitrea-roseglass", alpha=(140, 220))},
              hardness=0.6, sound="glass", light=3, map_color="color_pink"),
        Block("vitrea_mirage_glass", "Mirage Glass", "glass",
              {"all": tex(_mirage, P_TURQ, "vitrea-mirage", frames=16, frametime=3)}, hardness=0.4, sound="glass",
              light=6, emissive=True, map_color="color_cyan"),
        Block("vitrea_crystal_cactus", "Crystal Cactus", "crystal_block",
              {"all": tex("crystal", ["#0e6a5a", "#18907a", "#30b898", "#70e0c0", "#d0fff0"], seed="vitrea-cactus",
                          shards=5)},
              hardness=0.8, light=5, map_color="color_cyan"),
        Block("vitrea_cactus_bloom", "Cactus Bloom", "crystal_cluster",
              {"cross": tex("crystal_shard_sprite", P_ROSE, seed="vitrea-bloom", count=3)}, hardness=0.4, light=9,
              emissive=True, sound="amethyst_cluster"),
        Block("vitrea_cactus_sprout", "Prism Cactus", "plant",
              {"cross": tex("cactus_sprite", ["#0e6a5a", "#20a088", "#50d0b0", "#a0ffe0"], seed="vitrea-sprout")},
              hardness=0.0, sound="glass", light=4, fruit="vitrea_prism_fruit"),
        Block("vitrea_fulgurite", "Fulgurite", "stone", {"all": tex("rough_stone", P_FULGURITE[:4], seed="vitrea-fulgurite")},
              hardness=1.0, sound="glass", map_color="color_brown"),
        Block("vitrea_palm_log", "Oasis Palm Log", "log", {
            "side": tex("log_side", P_PALM, seed="vitrea-palm"),
            "end": tex("log_top", P_PALM, ["#d0b080", "#e8cc9c"], seed="vitrea-palm-end")}, hardness=2.0, sound="wood",
              flammable=True, map_color="wood"),
        Block("vitrea_glassleaf", "Glassleaf Frond", "leaves", {"all": tex("leaves", P_TURQ[:4], seed="vitrea-glassleaf",
                                                                           holes=0.25)},
              hardness=0.2, sound="glass", map_color="color_cyan"),
        Block("vitrea_desert_grass", "Amber Grass", "plant",
              {"cross": tex("grass_tuft", ["#8a5a20", "#b07a30", "#d4a050", "#f0c878"], seed="vitrea-grass")},
              hardness=0.0, sound="grass"),
    ],
    items=[
        Item("vitrea_prism_fruit", "Prism Fruit", tex("item_icon", "fruit", ["#20a088", "#70e0c0", "#ff90b0"],
                                                      seed="vitrea-fruit"),
             kind="food", food=Food(4, 0.6, always=True,
                                    effects=[Effect("minecraft:fire_resistance", 30, 0), Effect("minecraft:speed", 20, 0)]),
             lore="Cool and crisp. Tastes like the color turquoise."),
        Item("vitrea_worm_tooth", "Sand Worm Tooth", tex("item_icon", "fang", ["#a07a48", "#f0e0c0", "#ffffff"],
                                                         seed="vitrea-tooth"),
             rarity="rare", lore="One of four hundred. It grows a new one every week."),
        Item("vitrea_glass_stinger", "Glass Stinger", tex("item_icon", "shard", ["#80b0c0", "#c8f0f0", "#ff70a8"],
                                                          seed="vitrea-stinger"),
             rarity="uncommon", lore="Hollow, with a drop of pink venom still inside."),
    ],
    creatures=[
        Creature("sand_worm", "Sand Worm", "serpent", ["#d8b880", "#a07a48", "#ffe0a0", "#ff4020", "#3a2010"],
                 pattern="rings", size=2.4,
                 body={"head": "worm", "segments": 8, "seg_w": 9, "seg_len": 7, "taper": 0.7, "ringed": True,
                       "ridge": True, "eyes": 0},
                 behavior="hostile", health=80, damage=9, armor=4, speed=0.3, abilities=["burrow", "charge"],
                 drops=[Drop("vitrea_worm_tooth", 0, 1, chance=0.5), Drop("vitrea_glass_sand", 2, 6)],
                 sounds="ravager", pitch=0.5, xp=25, group=1, tracking=10,
                 description="The dunes ripple, then rise. Listen for the hiss of moving sand and run uphill."),
        Creature("glass_scorpion", "Glass Scorpion", "crawler", ["#c8f0f0", "#80b0c0", "#ff70a8", "#ff2060"],
                 pattern="crystal", size=1.1,
                 body={"kind": "scorpion", "translucent": True, "claws": True, "crystals": 2, "eye_style": "glow",
                       "eyes": 4},
                 behavior="hostile", health=18, damage=4, armor=2, speed=0.3, on_hit=Effect("minecraft:poison", 4, 0),
                 drops=[Drop("vitrea_glass_stinger", 0, 1, chance=0.6), Drop("minecraft:glass_pane", 0, 2)],
                 sounds="silverfish", pitch=0.7, xp=7, group=2,
                 description="Nearly invisible against the glass dunes. You can see what it ate for breakfast."),
        Creature("dune_strider", "Dune Strider", "tripod", ["#f2dcb8", "#c88a50", "#3ad6c8", "#202020", "#ff90b0"],
                 pattern="patches", size=1.3,
                 body={"legs": 3, "leg_len": 26, "dome": "pod", "dome_w": 10, "dome_h": 7, "eyes": 1, "eye_size": 2,
                       "lights": 3, "tentacles": 0},
                 behavior="passive", health=30, speed=0.22, tempt="vitrea_prism_fruit",
                 drops=[Drop("minecraft:leather", 0, 2), Drop("vitrea_prism_fruit", 0, 1, chance=0.5)],
                 sounds="camel", pitch=1.15, xp=4, group=3, tracking=10,
                 description="Walks the dunes on stilts to keep its belly off the hot glass. Herds follow the shade."),
    ],
    biomes=[
        Biome("vitrea_glass_dunes", "Glass Dunes", top="vitrea_glass_sand", under="vitrea_glass_sand",
              temperature=0.0, humidity=-0.3, grass_color="#d4a050", foliage_color="#b07a30", water_color="#3ad6c8",
              particles=[("minecraft:white_ash", 0.006)], ambient="wind_howl",
              surface_noise=[("vitrea_dune_glass", 0.3)],
              features=[
                  Spire(blocks=[("vitrea_fulgurite", 3), ("vitrea_dune_glass", 1)], tip="vitrea_rose_glass",
                        height=(6, 16), radius=(1, 1), lean=0.45, count=1, chance=2),
                  Structure(kind="ribcage", blocks={"bone": "minecraft:bone_block", "spine": "vitrea_sandstone"},
                            size=(10, 15), count=1, chance=9),
                  Patch(block="vitrea_desert_grass", count=1, tries=10),
                  Patch(block="vitrea_cactus_sprout", count=1, tries=6, chance=2),
              ],
              spawns=[Spawn("dune_strider", 8, (2, 3)), Spawn("glass_scorpion", 4, (1, 2)), Spawn("sand_worm", 2, (1, 1))]),
        Biome("vitrea_crystal_flats", "Crystal Cactus Flats", top="vitrea_glass_sand", under="vitrea_glass_sand",
              temperature=0.4, humidity=0.3, elevation=-0.2, grass_color="#c49e6c", water_color="#3ad6c8",
              particles=[("dust:#70e0c0:0.8", 0.003)], ambient="crystal_chimes",
              surface_noise=[("vitrea_sandstone", 0.6)],
              features=[
                  Spire(blocks=[("vitrea_crystal_cactus", 1)], tip="vitrea_cactus_bloom", height=(4, 11),
                        radius=(1, 1), count=(0, 2)),
                  CrystalCluster(block="vitrea_rose_glass", small="vitrea_cactus_bloom", size=(3, 6), count=1, chance=2),
                  Patch(block="vitrea_cactus_sprout", count=3, tries=16),
                  Patch(block="vitrea_desert_grass", count=2, tries=12),
              ],
              spawns=[Spawn("glass_scorpion", 6, (1, 3)), Spawn("dune_strider", 5, (1, 3))]),
        Biome("vitrea_mirage_oasis", "Mirage Oasis", top="vitrea_glass_sand", under="vitrea_glass_sand",
              temperature=-0.4, humidity=0.8, elevation=-0.6, grass_color="#8aaa50", foliage_color="#3ad6c8",
              water_color="#3ad6c8", water_fog_color="#0e6a6a",
              particles=[("minecraft:end_rod", 0.0015)], ambient="cozy_breeze",
              music="minecraft:music.overworld.desert",
              features=[
                  Lake(fluid="minecraft:water", border="vitrea_sandstone", chance=2),
                  Lake(fluid="vitrea_mirage_glass", border="vitrea_sandstone", chance=2),
                  GiantPlant(stem="vitrea_palm_log", head="vitrea_glassleaf", shape="palm", height=(7, 12), radius=(3, 4),
                             bend=0.4, decoration="vitrea_cactus_bloom", count=1, chance=3),
                  Patch(block="vitrea_desert_grass", count=4, tries=24),
                  Patch(block="vitrea_cactus_sprout", count=1, tries=8),
              ],
              spawns=[Spawn("dune_strider", 10, (2, 4)), Spawn("glass_scorpion", 2, (1, 1))]),
        Biome("vitrea_rose_arches", "Rose Glass Arches", top="vitrea_glass_sand", under="vitrea_sandstone",
              temperature=0.8, humidity=-0.8, elevation=0.5, grass_color="#d4b07e", water_color="#3ad6c8",
              fog_color="#ffd8d0", particles=[("dust:#ff90b0:0.8", 0.004)], ambient="wind_howl",
              surface_noise=[("vitrea_rose_glass", 0.7), ("vitrea_sandstone", 0.35)],
              features=[
                  Structure(kind="arch", blocks={"main": "vitrea_rose_glass", "alt": "vitrea_dune_glass"}, size=(9, 15),
                            count=1, chance=2),
                  Spire(blocks=[("vitrea_rose_glass", 3), ("vitrea_dune_glass", 1)], height=(8, 20), radius=(1, 3),
                        lean=0.5, count=1, chance=2),
                  Structure(kind="monolith", blocks={"main": "vitrea_sandstone"}, size=(5, 9), count=1, chance=6),
                  Patch(block="vitrea_desert_grass", count=1, tries=8),
              ],
              spawns=[Spawn("glass_scorpion", 6, (1, 2)), Spawn("sand_worm", 3, (1, 1)), Spawn("dune_strider", 3, (1, 2))]),
    ],
    effects=["heat"],
    music="minecraft:music.overworld.desert",
    ambient="wind_howl",
    icon="portalgun:vitrea_prism_fruit",
)
