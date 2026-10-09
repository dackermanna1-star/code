"""S-55 Ember Savanna - an endless savanna frozen at sunset: umbrella trees, golden grass and smoking termite cathedrals."""
import numpy as np
from PIL import Image

from gen.content.dsl import *
from gen.noise import fbm, rng

# ------------------------------------------------------------------------------------------------ palette
# sunset orange / ember red / straw gold / dusk violet / charcoal bark
P_GRASS = ["#7a5a1c", "#987424", "#b48e30", "#cca440", "#e2bc58"]
P_EARTH = ["#6a2a14", "#82361a", "#9a4622", "#b0582c"]
P_STONE = ["#6a3424", "#7e4230", "#93503a", "#a86448", "#be7a58"]
P_BARK = ["#2a1a12", "#3a261a", "#4a3222", "#5c402c"]
P_BAOBAB = ["#6a5a54", "#7e6c64", "#948078", "#aa968c"]
P_BAOBAB_END = ["#c8a080", "#a88060"]
P_LEAF = ["#4a4a16", "#64601c", "#807824", "#a08c30", "#c0a040"]
P_TALL = ["#8a6420", "#a87c2a", "#c49638", "#dcb04a", "#f0cc68"]
P_CLAY = ["#7a3a1c", "#944a24", "#ac5c2e", "#c4723c", "#d88c50"]
P_MUD = ["#7a5034", "#8e6040", "#a2724e", "#b6845c"]
P_FIRE = ["#8a1a08", "#d03a10", "#ff7a20", "#ffb040", "#ffe890"]
SUNSET = "#ff7a30"


def _hex(c):
    c = c.lstrip("#")
    return np.array([int(c[i:i + 2], 16) for i in (0, 2, 4)], float)


def _ramp(cols, t):
    t = np.clip(t, 0, 0.999) * (len(cols) - 1)
    i = t.astype(int)
    f = (t - i)[..., None]
    c = np.array([_hex(x) for x in cols])
    return c[i] * (1 - f) + c[np.minimum(i + 1, len(cols) - 1)] * f


def _img(rgb, alpha=None):
    a = np.full(rgb.shape[:2] + (1,), 255.0) if alpha is None else alpha[..., None]
    return Image.fromarray(np.clip(np.round(np.concatenate([rgb, a], -1)), 0, 255).astype(np.uint8), "RGBA")


def termite_clay(pal, seed, holes=5):
    """Sun-baked mound clay: lumpy horizontal mud courses (how termites build) pierced by dark tunnel holes."""
    yy, xx = np.mgrid[0:16, 0:16]
    n = fbm(16, 16, 4, seed, 3)
    course = np.sin((yy + n * 3.0) * np.pi / 2.6) * 0.5 + 0.5
    t = 0.35 + course * 0.35 + (n - 0.5) * 0.45
    q = np.round(t * 5) / 5
    rgb = _ramp(pal, q)
    R = rng(seed + ":h")
    for _ in range(holes):
        x, y = int(R.integers(0, 15)), int(R.integers(0, 15))
        rgb[y, x] = _hex(pal[0]) * 0.45
        if R.uniform() < 0.5:
            rgb[y, (x + 1) % 16] = _hex(pal[0]) * 0.55
        rgb[(y + 1) % 16, x] = _hex(pal[4])          # lit lip under the hole
    return _img(rgb)


def chimney_top(pal, seed):
    """Top of a termite chimney: a ring of clay around a smoking dark shaft."""
    yy, xx = np.mgrid[0:16, 0:16]
    base = np.asarray(termite_clay(pal, seed, holes=2), float)[..., :3]
    d = np.hypot(xx - 7.5, yy - 7.5)
    rgb = base.copy()
    rgb[d < 5.5] = _ramp(pal, np.full_like(d, 0.75))[d < 5.5]
    rgb[d < 4.2] = _hex(pal[1]) * 0.8
    rgb[d < 3.0] = _hex(pal[0]) * 0.35
    rgb[(d < 1.6)] = _hex("#ff7a20") * 0.55        # faint ember glow deep inside
    return _img(rgb)


def cracked_mud(pal, seed):
    """Dried waterhole mud: flat plates separated by dark polygonal cracks."""
    from gen.noise import worley
    yy, xx = np.mgrid[0:16, 0:16]
    n = fbm(16, 16, 4, seed, 2)
    rgb = _ramp(pal, 0.45 + (n - 0.5) * 0.5)
    R = rng(seed)
    pts = R.uniform(0, 16, (6, 2))
    best = np.full((16, 16), 1e9)
    second = np.full((16, 16), 1e9)
    for px, py in pts:
        for ox in (-16, 0, 16):
            for oy in (-16, 0, 16):
                d = np.hypot(xx + 0.5 - px - ox, yy + 0.5 - py - oy)
                second = np.where(d < best, best, np.minimum(second, d))
                best = np.minimum(best, d)
    crack = (second - best) < 0.7
    rgb[crack] = _hex(pal[0]) * 0.78
    lit = np.roll(crack, 1, axis=0) & ~crack
    rgb[lit] = np.minimum(rgb[lit] * 1.15, 255)
    return _img(rgb)


# ------------------------------------------------------------------------------------------------ features
UMBRELLA = GiantPlant(stem="ember_thornwood_log", head="ember_thornwood_leaves", shape="umbrella", height=(9, 14),
                      radius=(5, 7), stem_width=1, bend=0.35, count=1, chance=2)
BAOBAB = GiantPlant(stem="ember_baobab_log", head="ember_thornwood_leaves", shape="flat", height=(12, 17), radius=(4, 6),
                    stem_width=3, bend=0.05, count=1, chance=6)
TERMITE_CATHEDRAL = Spire(blocks=[("ember_termite_clay", 6), ("ember_red_earth", 1)], tip="ember_termite_chimney",
                          height=(9, 18), radius=(2, 4), lean=0.12, count=1, chance=3)
SMALL_MOUND = Spire(blocks=[("ember_termite_clay", 1)], tip="ember_termite_chimney", height=(3, 6), radius=(1, 2),
                    count=1, chance=4)
GRASSES = Patch(blocks=[("minecraft:short_grass", 8), ("minecraft:tall_grass", 2), ("ember_elephant_grass", 2)],
                count=6, tries=48, spread=8)

DIMENSION = Dimension(
    id="ember_savanna",
    code="S-55",
    name="Ember Savanna",
    tagline="The sun never quite finishes setting",
    description=("An endless golden savanna held forever in the last minute of sunset, under a swollen red sun that "
                 "never sinks. Flat-topped thornwood trees and giant baobabs stand against the glow, and termite "
                 "cathedrals taller than houses smoke quietly in the red pans. Herds of Stripe Grazers and gentle "
                 "Longnecks roam the grass - and so do the Dust Lions, which hunt from the tall grass at dusk."),
    danger=2,
    color=SUNSET,
    terrain=Terrain(style="flat", stone="ember_ironstone", sea_level=63, height=67, amplitude=4.0, scale=1.7,
                    roughness=0.04, deepslate="minecraft:deepslate",
                    params={"ponds": 0.24, "biome_size": 360}),
    sky=Sky(sky_color="#e47a4c", fog_color="#f2a464", water_fog_color="#4a3020", fog_start=60, fog_end=300,
            cloud_color="#c8ff9a6e", cloud_height=205, time=12250, sunrise_color="#ffff5a28", sky_light_color="#ffc890",
            star_brightness=0.25, ambient_light=0.05,
            bodies=[Celestial("sun", ["#c8200c", "#ff5a1c", "#ffa040", "#ffe0a0"], size=150, yaw=90, pitch=5,
                              seed="ember-great-sun"),
                    Celestial("moon", ["#d8c0d8", "#f4e8f0"], size=26, yaw=265, pitch=22, alpha=0.55,
                              seed="ember-pale-moon")]),
    blocks=[
        Block("ember_grass", "Sunburnt Grass", "grass", {
            "top": tex("grass_top", P_GRASS, seed="ember-grass"),
            "side": tex("grass_side", P_GRASS, P_EARTH, seed="ember-grass"),
            "bottom": tex("dirt", P_EARTH, seed="ember-earth")}, hardness=0.6, sound="grass", map_color="color_yellow"),
        Block("ember_red_earth", "Red Earth", "soil", {"all": tex("dirt", P_EARTH, seed="ember-earth")}, hardness=0.5,
              sound="gravel", map_color="terracotta_red"),
        Block("ember_ironstone", "Ironstone", "stone", {"all": tex("terracotta", P_STONE, seed="ember-ironstone")},
              hardness=1.5, map_color="terracotta_orange"),
        Block("ember_thornwood_log", "Thornwood Log", "log", {
            "side": tex("log_side", P_BARK, seed="ember-bark"),
            "end": tex("log_top", P_BARK, ["#a86a3a", "#8a5028"], seed="ember-bark-end")}, hardness=2.0, sound="wood",
              map_color="color_black", flammable=True),
        Block("ember_baobab_log", "Baobab Trunk", "log", {
            "side": tex("log_side", P_BAOBAB, seed="ember-baobab"),
            "end": tex("log_top", P_BAOBAB, P_BAOBAB_END, seed="ember-baobab-end")}, hardness=2.5, sound="wood",
              map_color="terracotta_light_gray", flammable=True),
        Block("ember_thornwood_leaves", "Thornwood Leaves", "leaves", {
            "all": tex("leaves", P_LEAF, seed="ember-leaf", holes=0.32)}, hardness=0.2, sound="leaves",
              map_color="color_green", flammable=True, drop="ember_marula", drop_count=(0, 1)),
        Block("ember_elephant_grass", "Elephant Grass", "tall_plant", {
            "bottom": tex("tall_plant_bottom", P_TALL, seed="ember-tall"),
            "top": tex("tall_plant_top", P_TALL, seed="ember-tall")}, hardness=0.0, sound="grass",
              map_color="color_yellow", flammable=True),
        Block("ember_termite_clay", "Termite Clay", "solid", {"all": tex(termite_clay, P_CLAY, "ember-termite")},
              hardness=1.2, sound="packed_mud", tool="shovel", map_color="terracotta_orange"),
        Block("ember_termite_chimney", "Termite Chimney", "vent", {
            "top": tex(chimney_top, P_CLAY, "ember-chimney"),
            "side": tex(termite_clay, P_CLAY, "ember-termite")}, hardness=1.2, sound="packed_mud", tool="shovel",
              particle="minecraft:campfire_cosy_smoke", map_color="terracotta_orange"),
        Block("ember_cracked_mud", "Cracked Mud", "soil", {"all": tex(cracked_mud, P_MUD, "ember-mud")}, hardness=0.6,
              sound="mud_bricks", map_color="terracotta_brown"),
        Block("ember_firebloom", "Firebloom", "plant", {
            "cross": tex("flower", ["#4a3a14", "#64501c", "#806a24"], P_FIRE, seed="ember-firebloom", shape="star",
                         center_hex="#ffe890")}, hardness=0.0, sound="grass", light=8, emissive=True,
              particle="minecraft:small_flame", map_color="color_orange"),
    ],
    items=[
        Item("ember_marula", "Sunset Marula", tex("item_icon", "fruit", ["#a85a10", "#e08a20", "#ffc050"], seed="ember-marula",
                                                  accent="#6a7a20"),
             kind="food", food=Food(4, 0.5, effects=[Effect("minecraft:fire_resistance", 30, 0),
                                                     Effect("minecraft:speed", 12, 0)]),
             lore="Ripens in the last light. Which is always."),
        Item("ember_lion_mane", "Dust Lion Mane", tex("item_icon", "feather", ["#6a2a10", "#b8602a", "#f0a050"],
                                                     seed="ember-mane"),
             rarity="uncommon", lore="Still smells of smoke and bad decisions."),
    ],
    creatures=[
        Creature("longneck", "Longneck", "quadruped", ["#e0a048", "#7a3a14", "#ffe0a0", "#1a0c06", "#f4d8a0"],
                 pattern="spots", size=1.75,
                 body={"neck": 20, "neck_angle": 78, "leg_len": 15, "leg_w": 3, "body_len": 14, "body_h": 9, "body_w": 9,
                       "horns": "small", "ears": "pointy", "tail": 2, "tail_kind": "puff", "hooves": True, "mane": True,
                       "eye_style": "sleepy", "snout": 2, "head_size": 0.9},
                 behavior="passive", health=60, speed=0.17, tempt="portalgun:ember_marula",
                 drops=[Drop("minecraft:leather", 1, 3)], sounds="camel", pitch=0.7, xp=5, group=3,
                 description="Eats from the tops of the umbrella trees and hums at the sunset."),
        Creature("dust_lion", "Dust Lion", "quadruped", ["#c89a5a", "#6a2e10", "#5a2a14", "#ffb020", "#5a2a10"],
                 pattern="plain", size=1.15,
                 body={"mane": True, "claws": True, "ears": "round", "tail": 3, "tail_len": 4, "tail_kind": "puff",
                       "snout": 2, "leg_len": 8, "body_len": 15, "body_h": 8, "mouth": "fangs", "eye_style": "slit",
                       "brows": True, "head_size": 1.15, "spikes": 5},
                 behavior="hostile", health=26, damage=6, speed=0.32, abilities=["leap", "charge"],
                 drops=[Drop("ember_lion_mane", 0, 1, chance=0.6), Drop("minecraft:leather", 0, 2)],
                 sounds="polar_bear", pitch=0.75, xp=8, group=2,
                 description="Sand-colored, smoke-maned and patient. You will see the grass move first."),
        Creature("stripe_grazer", "Stripe Grazer", "quadruped", ["#d47a34", "#f4e8d4", "#2e1c10", "#100806"],
                 pattern="stripes", size=0.9,
                 body={"horns": "long", "hooves": True, "tail": 1, "tail_kind": "thin", "leg_len": 10, "leg_w": 2,
                       "neck": 6, "neck_angle": 40, "ears": "pointy", "body_len": 13, "body_h": 7, "body_w": 7,
                       "eye_style": "round", "snout": 2},
                 behavior="passive", health=14, speed=0.3, tempt="minecraft:wheat",
                 drops=[Drop("minecraft:mutton", 1, 2, cooked="minecraft:cooked_mutton"), Drop("minecraft:leather", 0, 1)],
                 sounds="goat", pitch=1.15, xp=2, group=6,
                 description="Their stripes confuse lions. Mostly they confuse each other."),
    ],
    biomes=[
        Biome("ember_golden_grassland", "Golden Grassland", top="ember_grass", under="ember_red_earth",
              temperature=0.0, humidity=0.0, underwater="ember_cracked_mud",
              grass_color="#c8a040", foliage_color="#8a8028", water_color="#8a7a46", water_fog_color="#4a3a20",
              particles=[("minecraft:white_ash", 0.002), ("dust:#ffb060:0.6", 0.002)], ambient="cozy_breeze",
              music="minecraft:music.overworld.desert",
              features=[
                  UMBRELLA,
                  Tree(log="ember_thornwood_log", leaves="ember_thornwood_leaves", shape="acacia", height=(5, 8),
                       count=1, chance=3),
                  GRASSES,
                  Patch(block="ember_firebloom", count=1, tries=10, chance=2),
                  SMALL_MOUND,
              ],
              spawns=[Spawn("stripe_grazer", 10, (2, 5)), Spawn("longneck", 10, (1, 3)), Spawn("dust_lion", 3, (1, 2))]),
        Biome("ember_acacia_woodland", "Thornwood Woodland", top="ember_grass", under="ember_red_earth",
              temperature=-0.3, humidity=0.55, underwater="ember_cracked_mud",
              grass_color="#b49030", foliage_color="#80782a", water_color="#7a7a46", water_fog_color="#3a3a20",
              particles=[("minecraft:firefly", 0.002), ("dust:#ffb060:0.6", 0.0015)], ambient="cozy_breeze",
              music="minecraft:music.overworld.sparse_jungle",
              features=[
                  BAOBAB,
                  GiantPlant(stem="ember_thornwood_log", head="ember_thornwood_leaves", shape="umbrella", height=(10, 15),
                             radius=(5, 8), stem_width=1, bend=0.3, count=1),
                  Tree(log="ember_thornwood_log", leaves="ember_thornwood_leaves", shape="acacia", height=(5, 9), count=2),
                  Patch(blocks=[("minecraft:short_grass", 5), ("ember_elephant_grass", 2), ("minecraft:dead_bush", 1)],
                        count=5, tries=32),
              ],
              spawns=[Spawn("longneck", 12, (2, 3)), Spawn("stripe_grazer", 8, (2, 5)), Spawn("dust_lion", 2, (1, 1))]),
        Biome("ember_red_pan", "Red Pan", top="ember_red_earth", under="ember_red_earth",
              temperature=0.8, humidity=-0.6, underwater="ember_cracked_mud",
              grass_color="#a88a30", foliage_color="#6a6020", water_color="#9a5a36", water_fog_color="#4a2a18",
              fog_color="#f09058", particles=[("dust:#c86030:0.9", 0.004), ("minecraft:white_ash", 0.003)],
              ambient="wind_howl", music="minecraft:music.overworld.badlands",
              surface_noise=[("ember_grass", 0.45), ("ember_cracked_mud", 0.55)],
              features=[
                  TERMITE_CATHEDRAL,
                  SMALL_MOUND,
                  Patch(blocks=[("minecraft:dead_bush", 3), ("ember_firebloom", 1)], count=2, tries=16),
                  Tree(log="ember_thornwood_log", leaves="ember_thornwood_leaves", shape="acacia", height=(4, 6),
                       count=1, chance=4),
                  Boulder(blocks=[("ember_ironstone", 3), ("ember_termite_clay", 1)], radius=(1, 2), count=1, chance=3),
              ],
              spawns=[Spawn("dust_lion", 4, (1, 2)), Spawn("stripe_grazer", 6, (2, 4))]),
        Biome("ember_waterhole", "Ember Waterhole", top="ember_cracked_mud", under="ember_red_earth",
              temperature=-0.2, humidity=0.9, elevation=-0.5, underwater="ember_cracked_mud",
              grass_color="#98902e", foliage_color="#6a7a24", water_color="#6a7a5a", water_fog_color="#2a3020",
              particles=[("minecraft:firefly", 0.005)], ambient="jungle_night",
              music="minecraft:music.overworld.swamp",
              surface_noise=[("ember_grass", 0.25)],
              features=[
                  Patch(block="minecraft:sugar_cane", count=3, tries=20, spread=4),
                  Patch(block="minecraft:lily_pad", where="water_surface", count=2, tries=16, max_depth=2),
                  Patch(blocks=[("minecraft:short_grass", 4), ("ember_elephant_grass", 3)], count=4, tries=32),
                  Patch(block="ember_firebloom", count=1, tries=8),
                  Tree(log="ember_thornwood_log", leaves="ember_thornwood_leaves", shape="acacia", height=(5, 8),
                       count=1, chance=2),
              ],
              spawns=[Spawn("stripe_grazer", 10, (2, 5)), Spawn("longneck", 8, (1, 2))]),
    ],
    effects=["heat"],
    ambient="cozy_breeze",
    music="minecraft:music.overworld.desert",
    icon="portalgun:ember_marula",
)
