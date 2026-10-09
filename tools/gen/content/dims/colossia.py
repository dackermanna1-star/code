"""35-C Colossia - a giant's garden where you are the size of a bug."""
from gen.content.dsl import *

# palette: lawn green, deep green, loam brown, dandelion yellow, petal pink, sky blue
P_MOSS = ["#2e6a1e", "#3e8426", "#52a030", "#6cbc3c", "#90d454"]
P_LOAM = ["#3a2616", "#4c321e", "#5e4028", "#725034"]
P_STONE = ["#6a645a", "#7e786c", "#948e80", "#aaa494", "#c0baa8"]
P_PEBBLE = ["#6a6a72", "#84848c", "#9c9ca4", "#b6b6bc", "#d0d0d4"]
P_BLADE = ["#2a6a1a", "#3a8422", "#4c9e2c", "#62b838", "#86d050"]
P_STALK = ["#4a7a2a", "#5e9234", "#74aa40", "#8cc250", "#a8d868"]
P_PINK = ["#a8306a", "#d0508a", "#ee74a8", "#ff9cc4", "#ffcce0"]
P_YELLOW = ["#c07a10", "#e0a018", "#f8c428", "#ffdc50", "#fff09a"]
P_POLLEN = ["#b06a08", "#e09418", "#ffb828", "#ffd860", "#fff4b0"]
P_CAP = ["#7a0e0e", "#a81a14", "#d0281c", "#ee4430"]
P_DEW = ["#7ac0e8", "#a8daf6", "#d4f0ff", "#ffffff"]


def _blade_side(pal, seed):
    """A grass blade seen up close: parallel veins running the length of the leaf, a pale midrib."""
    import numpy as np
    from PIL import Image
    from gen.noise import fbm
    from gen.textures import pal as P
    cols = [np.array([int(c[i:i + 2], 16) for i in (1, 3, 5)], float) for c in P(pal)]
    n = fbm(16, 16, 8, seed, 2)
    a = np.zeros((16, 16, 4))
    for y in range(16):
        for x in range(16):
            vein = x % 4 == 0
            mid = x in (7, 8)
            v = 0.45 + 0.35 * (n[y, x] - 0.5) * 2 + (0.0 if not vein else -0.25) + (0.35 if mid else 0.0)
            i = int(max(0, min(len(cols) - 1, round(v * (len(cols) - 1)))))
            a[y, x, :3] = cols[i]
            a[y, x, 3] = 255
    return Image.fromarray(a.astype("uint8"), "RGBA")


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
    id="colossia",
    code="35-C",
    name="Colossia",
    tagline="A garden so big you are the bug",
    description=("Step through and everything is enormous - or you are tiny. Grass blades tower like green "
                 "skyscrapers, flowers bloom on stalks thirty blocks tall, dewdrops sit on the lawn like glass "
                 "boulders and pebbles are mountains. The Titan Snail is harmless, if you can get out of its way; "
                 "the Giant Ants and Mega Bees are friendly until you touch their stuff."),
    danger=3,
    color="#8ccf4a",
    terrain=Terrain(style="hills", stone="colossia_pebblestone", sea_level=60, height=78, amplitude=34, scale=2.6,
                    roughness=0.12, deepslate="minecraft:deepslate",
                    params={"rivers": 0.45, "detail": 0.15, "beach_block": "minecraft:sand", "beach_height": 1,
                            "biome_size": 380}),
    sky=Sky(sky_color="#7ec8ff", fog_color="#d6ecff", water_fog_color="#2a6a8a", fog_start=70, fog_end=300,
            cloud_color="#f0ffffff", cloud_height=300, time="day", sunrise_color="#ffffc070",
            bodies=[
                Celestial("planet", ["#c8b8e8", "#e8dcff", "#ffffff"], size=150, yaw=150, pitch=24, alpha=0.45,
                          seed="colossia-moon"),
                Celestial("sun", ["#fff8d0", "#ffe080", "#ffb040"], size=48, yaw=330, pitch=58, alpha=0.6,
                          additive=True, seed="colossia-glare"),
            ]),
    blocks=[
        Block("colossia_moss_turf", "Giant's Lawn Turf", "grass", {
            "top": tex("moss", P_MOSS, seed="colossia-turf"),
            "side": tex("grass_side", P_MOSS, P_LOAM, seed="colossia-turfside"),
            "bottom": tex("dirt", P_LOAM, seed="colossia-loam")}, hardness=0.6, sound="moss", map_color="grass"),
        Block("colossia_loam", "Garden Loam", "soil", {"all": tex("dirt", P_LOAM, seed="colossia-loam")}, hardness=0.5,
              sound="rooted_dirt", map_color="dirt"),
        Block("colossia_pebblestone", "Pebblestone", "stone", {"all": tex("stone", P_STONE, seed="colossia-stone")},
              hardness=1.5, map_color="stone"),
        Block("colossia_pebble", "Polished Pebble", "stone", {"all": tex("marble", P_PEBBLE, seed="colossia-pebble")},
              hardness=2.0, sound="deepslate", map_color="color_light_gray"),
        Block("colossia_grass_blade", "Giant Grass Blade", "log", {
            "side": tex(_blade_side, P_BLADE, "colossia-blade"),
            "end": tex(_blade_side, P_BLADE, "colossia-blade-end")}, hardness=0.8, sound="grass",
              flammable=True, map_color="grass"),
        Block("colossia_stalk", "Giant Flower Stalk", "log", {
            "side": tex("log_side", P_STALK, seed="colossia-stalk"),
            "end": tex("log_top", P_STALK, ["#c8e890", "#e0f4b0"], seed="colossia-stalk-end")}, hardness=1.0,
              sound="bamboo_wood", flammable=True, map_color="color_light_green"),
        Block("colossia_pink_petal", "Giant Pink Petal", "solid", {"all": tex("velvet", P_PINK, seed="colossia-pink")},
              hardness=0.4, sound="wool", tool="hoe", flammable=True, map_color="color_pink"),
        Block("colossia_sun_petal", "Giant Sun Petal", "solid", {"all": tex("velvet", P_YELLOW, seed="colossia-yellow")},
              hardness=0.4, sound="wool", tool="hoe", flammable=True, map_color="color_yellow"),
        Block("colossia_pollen_block", "Pollen Cushion", "solid", {"all": tex("sponge", P_POLLEN, seed="colossia-pollen")},
              hardness=0.3, sound="wool", tool="hoe", light=6, bounce=0.6, map_color="gold",
              particle="minecraft:falling_spore_blossom"),
        Block("colossia_toadstool_cap", "Toadstool Cap", "mushroom_cap",
              {"all": tex("mushroom_cap", P_CAP, seed="colossia-cap", spots_pal=["#f0e8e0", "#ffffff"])},
              hardness=0.4, sound="wood", map_color="color_red"),
        Block("colossia_dewdrop", "Dewdrop", "glass", {"all": tex(_fused_glass, P_DEW, "colossia-dew", alpha=(90, 170))},
              hardness=0.3, sound="glass", light=4, map_color="color_light_blue"),
        Block("colossia_moss_sprout", "Moss Sprout", "plant", {"cross": tex("sprout", P_MOSS[1:], seed="colossia-sprout")},
              hardness=0.0, sound="grass"),
    ],
    items=[
        Item("colossia_honey_glob", "Mega Honey Glob", tex("item_icon", "goo", P_POLLEN, seed="colossia-honey"),
             kind="food", food=Food(8, 0.8, effects=[Effect("minecraft:regeneration", 8, 1),
                                                     Effect("minecraft:absorption", 60, 0)]),
             lore="One drop from a Mega Bee. Enough for a whole picnic."),
        Item("colossia_ant_chitin", "Giant Ant Chitin", tex("item_icon", "shell", ["#5a1a10", "#a8402a", "#ffb040"],
                                                            seed="colossia-chitin"),
             lore="Light as paper, strong as a door."),
        Item("colossia_titan_shell_shard", "Titan Shell Shard", tex("item_icon", "shard", ["#8a4a2a", "#c8a070", "#f0d090"],
                                                                     seed="colossia-shell"),
             rarity="rare", lore="A flake the size of a shield. The snail did not notice it was missing."),
    ],
    creatures=[
        Creature("titan_snail", "Titan Snail", "snail", ["#c8a070", "#a8502a", "#f4d8a0", "#202020", "#6a3a1a"],
                 pattern="stripes", size=3.2,
                 body={"shell_kind": "spiral", "shell_size": 16, "foot_len": 24, "foot_w": 9, "neck_h": 9,
                       "eyestalks": 2, "antennae": 4, "eye_style": "sleepy", "mouth": "smile", "blush": True},
                 behavior="passive", health=140, armor=12, speed=0.06, abilities=["shield"],
                 tempt="colossia_pink_petal",
                 drops=[Drop("colossia_titan_shell_shard", 0, 1, chance=0.5), Drop("minecraft:slime_ball", 2, 5)],
                 sounds="sniffer", pitch=0.55, xp=20, group=1, tracking=12,
                 description="Slow as a glacier and big as a house. Tiny things that get in its way get carried along."),
        Creature("giant_ant", "Giant Ant", "crawler", ["#5a1a10", "#a8402a", "#ffb040", "#101010"],
                 pattern="gradient", size=1.5,
                 body={"kind": "ant", "mandibles": True, "antennae": 7, "eye_style": "compound", "head_size": 1.1},
                 behavior="neutral", health=26, damage=5, armor=4, speed=0.31, abilities=["swarm"],
                 drops=[Drop("colossia_ant_chitin", 0, 2)],
                 sounds="silverfish", pitch=0.6, xp=6, group=4,
                 description="Busy, strong and orderly. Hit one and the whole column turns around."),
        Creature("mega_bee", "Mega Bee", "flyer", ["#ffc828", "#2a1a10", "#ffffff", "#101010", "#e0f4ff"],
                 pattern="stripes", size=1.7,
                 body={"kind": "insect", "fluffy": True, "stinger": True, "antennae": 5, "eye_style": "compound",
                       "wing_kind": "insect", "body_len": 9},
                 behavior="neutral", health=22, damage=4, speed=0.3, on_hit=Effect("minecraft:poison", 5, 0),
                 tempt="minecraft:sunflower",
                 drops=[Drop("colossia_honey_glob", 0, 2)],
                 sounds="bee", pitch=0.6, xp=6, group=2,
                 description="Bumbling from flower to flower with a hum you feel in your chest. Defends its honey."),
    ],
    biomes=[
        Biome("colossia_lawn", "The Lawn", top="colossia_moss_turf", under="colossia_loam", temperature=0.0,
              humidity=0.2, grass_color="#5aaa30", foliage_color="#4c9e2c", water_color="#4a9ad0",
              particles=[("minecraft:spore_blossom_air", 0.004)], ambient="cozy_breeze",
              features=[
                  Spire(blocks=[("colossia_grass_blade", 1)], height=(22, 40), radius=(1, 1), lean=0.4, count=3),
                  GiantPlant(stem="colossia_grass_blade", head="colossia_grass_blade", shape="tuft", height=(2, 4),
                             radius=(8, 13), count=2),
                  Boulder(blocks=[("colossia_dewdrop", 1)], radius=(2, 3), squash=0.85, count=1, chance=3),
                  Boulder(blocks=[("colossia_pebble", 1)], radius=(2, 4), squash=0.6, count=1, chance=4),
                  Patch(block="colossia_moss_sprout", count=6, tries=32),
              ],
              spawns=[Spawn("giant_ant", 8, (2, 4)), Spawn("mega_bee", 4, (1, 2)), Spawn("titan_snail", 3, (1, 1))]),
        Biome("colossia_flowerbed", "Flowerbed", top="colossia_moss_turf", under="colossia_loam", temperature=0.6,
              humidity=-0.1, grass_color="#6cbc3c", foliage_color="#62b838", water_color="#4a9ad0",
              particles=[("minecraft:falling_spore_blossom", 0.003), ("dust:#ffd860:0.9", 0.006)], ambient="cozy_breeze",
              music="minecraft:music.overworld.flower_forest",
              features=[
                  GiantPlant(stem="colossia_stalk", head="colossia_pink_petal", decoration="colossia_pollen_block",
                             shape="flower", height=(18, 32), radius=(6, 9), stem_width=2, bend=0.15, count=1),
                  GiantPlant(stem="colossia_stalk", head="colossia_sun_petal", decoration="colossia_pollen_block",
                             shape="flower", height=(14, 24), radius=(5, 7), stem_width=2, bend=0.2, count=1),
                  GiantPlant(stem="colossia_stalk", head="minecraft:moss_block", shape="flower", height=(5, 9),
                             radius=(3, 5), count=1, chance=2),
                  Spire(blocks=[("colossia_grass_blade", 1)], height=(16, 30), radius=(1, 1), lean=0.35, count=3),
                  Patch(block="colossia_moss_sprout", count=4, tries=24),
              ],
              spawns=[Spawn("mega_bee", 10, (1, 3)), Spawn("giant_ant", 4, (2, 3)), Spawn("titan_snail", 2, (1, 1))]),
        Biome("colossia_toadstool_hollow", "Toadstool Hollow", top="colossia_loam", under="colossia_loam",
              temperature=-0.5, humidity=0.7, elevation=-0.3, grass_color="#3e8426", foliage_color="#3a8422",
              water_color="#3a7aa0", fog_color="#c8dcd0", fog_end=180,
              particles=[("minecraft:spore_blossom_air", 0.01)], ambient="wet_squelch",
              surface_noise=[("colossia_moss_turf", 0.0)],
              features=[
                  GiantPlant(stem="minecraft:mushroom_stem", head="colossia_toadstool_cap", shape="dome",
                             height=(12, 24), radius=(6, 9), stem_width=2, count=1),
                  GiantPlant(stem="minecraft:mushroom_stem", head="colossia_toadstool_cap", shape="umbrella",
                             height=(6, 12), radius=(3, 5), count=1, chance=2),
                  Boulder(blocks=[("colossia_dewdrop", 1)], radius=(2, 3), squash=0.85, count=1, chance=2),
                  Spire(blocks=[("colossia_grass_blade", 1)], height=(14, 26), radius=(1, 1), lean=0.4, count=2),
                  Patch(block="colossia_moss_sprout", count=4, tries=24),
              ],
              spawns=[Spawn("titan_snail", 8, (1, 1)), Spawn("giant_ant", 3, (1, 3))]),
        Biome("colossia_pebble_wash", "Pebble Wash", top="minecraft:coarse_dirt", under="colossia_loam",
              underwater="minecraft:sand", temperature=0.8, humidity=-0.7, elevation=-0.5, grass_color="#8aaa40",
              foliage_color="#74aa40", water_color="#5aaad8", ambient="cozy_breeze",
              surface_noise=[("minecraft:sand", 0.4)],
              features=[
                  Boulder(blocks=[("colossia_pebble", 1)], radius=(4, 8), squash=0.55, count=1),
                  Boulder(blocks=[("colossia_pebblestone", 2), ("colossia_pebble", 1)], radius=(2, 4), squash=0.6,
                          count=1, chance=2),
                  Boulder(blocks=[("minecraft:smooth_sandstone", 1)], radius=(2, 5), squash=0.5, count=1, chance=3),
                  Spire(blocks=[("colossia_grass_blade", 1)], height=(10, 22), radius=(1, 1), lean=0.4, count=1),
              ],
              spawns=[Spawn("giant_ant", 10, (2, 4)), Spawn("titan_snail", 2, (1, 1))]),
    ],
    effects=[],
    music="minecraft:music.overworld.meadow",
    ambient="cozy_breeze",
    icon="portalgun:colossia_honey_glob",
)
