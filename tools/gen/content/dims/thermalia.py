"""T-77 Thermalia - hot-spring world: stepped travertine terraces, turquoise pools, geysers, steam and sulfur flats."""
import math

import numpy as np
from PIL import Image

from gen.content.dsl import *
from gen.noise import fbm, rng, worley

# palette: travertine cream, turquoise pool, microbial orange, sulfur yellow, fern green, steam white
P_TRAV = ["#a89878", "#c4b496", "#d8ccb0", "#e8e0ca", "#f6f2e6"]
P_SINTER = ["#cfc8b8", "#e0dccf", "#ece9e0", "#f6f4ee", "#ffffff"]
P_MAT = ["#7a2a0c", "#a8420e", "#d06818", "#e89a2c", "#f6c84a"]
P_MAT_SIDE = ["#8a3a10", "#b85818", "#e08a28"]
P_SULF = ["#8a7a10", "#b8a418", "#dcc830", "#efe25a", "#fff4a0"]
P_RUST = ["#4a2a18", "#62381e", "#7a4a28", "#946038"]
P_MOSS = ["#24482a", "#2e6034", "#3c7a3c", "#58964a", "#7ab45a"]
P_FERN = ["#1e4a24", "#2c6a30", "#3e8a3a", "#62ac4a", "#9ad06a"]
P_TRUNK = ["#3a2a1e", "#52402c", "#6a5438", "#806a48"]
P_TURQ = ["#0e6a70", "#1a9aa0", "#2ccac4", "#7af0e4", "#d0fff8"]
P_BLOOM = ["#a8304a", "#e0506a", "#ff8a8a", "#ffc0a0", "#fff0d0"]
TURQUOISE = "#2ccac4"


def _hex(c):
    c = c.lstrip("#")
    return np.array([int(c[i:i + 2], 16) for i in (0, 2, 4)], float)


def _img(a):
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8), "RGBA")


def travertine(pal, seed):
    """Layered travertine: wavy horizontal growth bands with a few dark pores (tiles vertically and horizontally)."""
    cols = [_hex(c) for c in pal]
    n = fbm(16, 16, 4, seed + ":n", 3)
    R = rng(seed)
    a = np.zeros((16, 16, 4))
    a[..., 3] = 255
    for y in range(16):
        for x in range(16):
            # bands repeat every 4 px (16/4 tiles), gently warped along x with a periodic sine so the edge wraps
            b = (y + 0.9 * math.sin(2 * math.pi * x / 16 + (y // 4) * 1.7) + 0.6 * (n[y, x] - 0.5)) % 4.0
            v = [3, 4, 2, 3][int(b)] - (1 if n[y, x] < 0.32 else 0)
            a[y, x, :3] = cols[max(0, min(len(cols) - 1, v))]
    for _ in range(5):
        x, y = int(R.integers(0, 16)), int(R.integers(0, 16))
        a[y, x, :3] = cols[0]
        a[(y + 1) % 16, x, :3] = cols[1]
    return _img(a)


def sinter_crust(pal, accent, seed):
    """White siliceous sinter: knobbly popcorn crust with tiny turquoise water-filled rims."""
    cols = [_hex(c) for c in pal]
    acc = _hex(accent)
    f1, f2 = worley(16, 16, 9, seed)
    n = fbm(16, 16, 4, seed + ":n", 2)
    a = np.zeros((16, 16, 4))
    a[..., 3] = 255
    for y in range(16):
        for x in range(16):
            e = f2[y, x] - f1[y, x]
            v = 0.55 + 0.6 * f1[y, x] * -1 + 0.5 * n[y, x]
            i = int(max(0, min(len(cols) - 1, round(v * (len(cols) - 1) + 1))))
            a[y, x, :3] = cols[i]
            if e < 0.07:
                a[y, x, :3] = cols[1]
    # a couple of tiny pools
    R = rng(seed + ":pool")
    for _ in range(2):
        x, y = int(R.integers(1, 14)), int(R.integers(1, 14))
        a[y, x, :3] = acc
        a[y, x + 1, :3] = acc * 0.85 + cols[-1] * 0.15
        a[y - 1, x, :3] = cols[-1]
        a[y + 1, x, :3] = cols[0]
    return _img(a)


def microbial_mat(pal, seed):
    """Prismatic-spring bacterial mat: concentric orange/amber growth rings with darker filaments."""
    cols = [_hex(c) for c in pal]
    n = fbm(16, 16, 5, seed, 3)
    f1, _ = worley(16, 16, 4, seed + ":w")
    a = np.zeros((16, 16, 4))
    a[..., 3] = 255
    for y in range(16):
        for x in range(16):
            ring = (f1[y, x] * 3.2 + n[y, x] * 1.4) % 1.0
            i = int(ring * (len(cols) - 1) + 0.5)
            a[y, x, :3] = cols[max(0, min(len(cols) - 1, i))]
    return _img(a)


def mud_pot(pal, seed, frames=8):
    """Bubbling grey-brown mud: slow swirl with bubbles that swell, brighten and pop."""
    cols = [_hex(c) for c in pal]
    R = rng(seed)
    bubbles = [(int(R.integers(1, 15)), int(R.integers(1, 15)), float(R.uniform(0, 1)), float(R.uniform(1.0, 2.2)))
               for _ in range(4)]
    out = []
    for fi in range(frames):
        t = fi / frames
        n = fbm(16, 16, 5, f"{seed}:{fi % 4}", 2) * 0.35 + fbm(16, 16, 5, seed, 2) * 0.65
        a = np.zeros((16, 16, 4))
        a[..., 3] = 255
        for y in range(16):
            for x in range(16):
                i = int(max(0, min(len(cols) - 2, round(n[y, x] * (len(cols) - 2)))))
                a[y, x, :3] = cols[i]
        for bx, by, ph, rmax in bubbles:
            p = (t + ph) % 1.0
            if p > 0.85:
                continue          # popped
            r = rmax * p / 0.85
            for y in range(16):
                for x in range(16):
                    dx, dy = ((x - bx + 8) % 16) - 8, ((y - by + 8) % 16) - 8
                    d = math.hypot(dx, dy)
                    if d <= r + 0.3:
                        a[y, x, :3] = cols[-1] if (dx < 0 and dy < 0 and d > r - 1.0) else cols[-2]
        out.append(_img(a))
    return out


def bathbloom(pal, pad, seed):
    """Hot-spring lotus seen from above: round pad with a pink-orange star bloom in the middle."""
    from gen.textures import lily_pad
    base = np.asarray(lily_pad(pad, seed).convert("RGBA"), float).copy()
    cols = [_hex(c) for c in pal]
    for y in range(16):
        for x in range(16):
            dx, dy = x - 7.5, y - 7.5
            d = math.hypot(dx, dy)
            ang = math.atan2(dy, dx)
            petal = 3.0 + 1.6 * abs(math.cos(ang * 3))
            if d < petal:
                k = int(min(len(cols) - 1, max(0, (1 - d / petal) * (len(cols) - 1) + 0.5)))
                base[y, x, :3] = cols[k]
                base[y, x, 3] = 255
            if d < 1.0:
                base[y, x, :3] = _hex("#ffe060")
    return _img(base)


GEYSER = Structure(kind="geyser", blocks={"vent": "thermalia_geyser_vent", "mound": "thermalia_sinter_crust"},
                   size=(7, 12), params={"pools": 1, "height": 1.3}, count=1, chance=3)
SINTER_CONE = Spire(blocks=[("thermalia_travertine", 3), ("thermalia_sinter_crust", 2)], tip="thermalia_geyser_vent",
                    height=(5, 11), radius=(2, 3), count=1, chance=3)
TERRACE_POOL = Lake(fluid="minecraft:water", border="thermalia_travertine", count=1)
TREE_FERN = GiantPlant(stem="thermalia_fern_trunk", head="thermalia_fern_fronds", shape="palm", height=(7, 13),
                       radius=(3, 5), bend=0.25, count=1)

DIMENSION = Dimension(
    id="thermalia",
    code="T-77",
    name="Thermalia",
    tagline="Hot springs, steam and a sky-high spa day",
    description=("A tidally-heated moon of a great amber gas giant, its every hillside stepped into cream travertine "
                 "terraces brimming with turquoise pools. Geysers thunder plumes into the steam, prismatic springs bloom "
                 "orange and blue, and the warm vents heal whoever lingers. Steam Turtles graze the tree-fern gullies; "
                 "mind the scalding mud pots, and the Sulfur Toads that spit from the yellow flats."),
    danger=2,
    color=TURQUOISE,
    terrain=Terrain(style="terraces", stone="thermalia_travertine", sea_level=58, height=78, amplitude=22, scale=1.3,
                    roughness=0.04, deepslate="minecraft:tuff",
                    params={"step": 4, "smoothness": 0.12, "rivers": 0.3, "biome_size": 300, "cliffs": True,
                            "cliff_block": "thermalia_travertine", "beach_block": "thermalia_sinter_crust",
                            "beach_height": 2}),
    sky=Sky(sky_color="#9ad8d4", fog_color="#d6ece6", water_fog_color="#1a9aa0", fog_start=26, fog_end=170,
            cloud_color="#e8fff8f0", cloud_height=150, time="morning", sunrise_color="#ccffd890",
            sky_light_color="#fff4e4", ambient_light=0.04,
            bodies=[Celestial("gas_giant", ["#a04a1c", "#d07a3a", "#eab070", "#f8e0b8"], size=110, yaw=150, pitch=24,
                              roll=-12, alpha=0.92, seed="thermalia-giant"),
                    Celestial("moon", ["#7a8a90", "#a8b8bc", "#d8e4e4"], size=10, yaw=110, pitch=48, speed=40,
                              seed="thermalia-sister")]),
    blocks=[
        Block("thermalia_travertine", "Travertine", "stone", {"all": tex(travertine, P_TRAV, "thermalia-trav")},
              hardness=1.4, sound="calcite", map_color="sand"),
        Block("thermalia_sinter_crust", "Sinter Crust", "grass", {
            "top": tex(sinter_crust, P_SINTER, TURQUOISE, "thermalia-sinter"),
            "side": tex("grass_side", P_SINTER[1:], P_TRAV, seed="thermalia-sinter-side"),
            "bottom": tex(travertine, P_TRAV, "thermalia-trav")}, hardness=0.9, sound="calcite", tool="pickaxe",
              map_color="snow"),
        Block("thermalia_microbial_mat", "Microbial Mat", "grass", {
            "top": tex(microbial_mat, P_MAT, "thermalia-mat"),
            "side": tex("grass_side", P_MAT_SIDE, P_TRAV, seed="thermalia-mat-side"),
            "bottom": tex(travertine, P_TRAV, "thermalia-trav")}, hardness=0.7, sound="moss", map_color="color_orange"),
        Block("thermalia_warm_moss", "Warm Moss", "grass", {
            "top": tex("grass_top", P_MOSS, seed="thermalia-moss"),
            "side": tex("grass_side", P_MOSS, P_TRAV, seed="thermalia-moss-side"),
            "bottom": tex(travertine, P_TRAV, "thermalia-trav")}, hardness=0.6, sound="moss", map_color="grass"),
        Block("thermalia_sulfur_crust", "Sulfur Crust", "soil", {"all": tex("salt", P_SULF, seed="thermalia-sulfur")},
              hardness=0.6, sound="sand", map_color="color_yellow"),
        Block("thermalia_sulfur_crystal", "Sulfur Crystal", "crystal_block",
              {"all": tex("crystal", P_SULF, seed="thermalia-sulfur-xtal", shards=6)}, hardness=1.0, light=9,
              emissive=True, map_color="color_yellow"),
        Block("thermalia_sulfur_cluster", "Sulfur Bloom", "crystal_cluster",
              {"cross": tex("crystal_shard_sprite", P_SULF, seed="thermalia-sulfur-bud", count=4)}, hardness=0.3, light=6,
              emissive=True, sound="amethyst_cluster"),
        Block("thermalia_scalding_mud", "Scalding Mud", "hazard",
              {"all": tex(mud_pot, ["#3a3430", "#52483e", "#6a5e50", "#8a7c6a", "#c8bca8"], "thermalia-mud", frames=8,
                          frametime=4)},
              hardness=0.6, sound="mud", tool="shovel", damage=2, damage_type="hot_floor", speed=0.5,
              particle="minecraft:bubble_pop", map_color="color_brown"),
        Block("thermalia_geyser_vent", "Geyser Vent", "vent", {
            "top": tex("lamp", ["#5a5448", "#8a8270", P_TURQ[2], P_TURQ[4]], seed="thermalia-vent", style="orb"),
            "side": tex(travertine, P_TRAV, "thermalia-trav")}, hardness=1.4, sound="calcite", tool="pickaxe",
              particle="minecraft:campfire_signal_smoke", effect="minecraft:levitation", effect_seconds=1,
              effect_amplifier=5, light=4, map_color="color_cyan"),
        Block("thermalia_spa_vent", "Spa Vent", "vent", {
            "top": tex("lamp", ["#6a5040", "#a07a50", "#f0b860", "#fff0c0"], seed="thermalia-spa", style="cross"),
            "side": tex(travertine, P_TRAV, "thermalia-trav")}, hardness=1.2, sound="calcite", tool="pickaxe",
              particle="minecraft:campfire_cosy_smoke", effect="minecraft:regeneration", effect_seconds=4, light=6,
              map_color="color_orange"),
        Block("thermalia_fern_trunk", "Tree Fern Trunk", "log", {
            "side": tex("log_side", P_TRUNK, seed="thermalia-trunk"),
            "end": tex("log_top", P_TRUNK, ["#8a7050", "#6a5438"], seed="thermalia-trunk-end")}, hardness=1.6,
              sound="wood", map_color="color_brown", flammable=True),
        Block("thermalia_fern_fronds", "Tree Fern Fronds", "leaves", {"all": tex("leaves", P_FERN, seed="thermalia-fronds",
                                                                                holes=0.3)},
              hardness=0.2, sound="azalea_leaves", map_color="plant", flammable=True),
        Block("thermalia_steamfern", "Steamfern", "plant", {"cross": tex("fern", P_FERN, seed="thermalia-steamfern")},
              hardness=0.0, sound="grass", map_color="plant"),
        Block("thermalia_bathbloom", "Bathbloom", "lily", {"top": tex(bathbloom, P_BLOOM, P_FERN[1:], "thermalia-bloom")},
              hardness=0.0, sound="lily_pad", light=5, map_color="color_pink"),
    ],
    items=[
        Item("thermalia_onsen_egg", "Onsen Egg", tex("item_icon", "egg", ["#c8b490", "#e8dcc0", "#fff8ec"],
                                                     seed="thermalia-egg"),
             kind="food", food=Food(6, 0.8, effects=[Effect("minecraft:regeneration", 10, 1),
                                                     Effect("minecraft:fire_resistance", 30, 0)]),
             lore="Slow-cooked in a geyser for exactly one hundred years."),
        Item("thermalia_sulfur_gland", "Sulfur Gland", tex("item_icon", "goo", P_SULF[1:], seed="thermalia-gland"),
             lore="Smells like a thousand rotten eggs. Alchemists love it."),
        Item("thermalia_geyser_pearl", "Geyser Pearl", tex("item_icon", "pearl", P_TURQ[1:], seed="thermalia-pearl"),
             rarity="rare", glint=True, lore="Grown one boiling layer at a time inside a serpent's throat."),
    ],
    creatures=[
        Creature("geyser_serpent", "Geyser Serpent", "serpent", ["#1a8a92", "#e8e0ca", "#f08a2a", "#ffd040"],
                 pattern="scales", size=1.4,
                 body={"head": "dragon", "segments": 8, "seg_w": 7, "seg_len": 6, "taper": 0.4, "fins": True,
                       "ridge": True, "horns": "curved", "whiskers": True, "crest": True, "eye_style": "slit",
                       "mouth": "fangs", "tail_kind": "fluke"},
                 placement="water", movement="swimming", category="water_creature",
                 behavior="neutral", attack="ranged", health=36, damage=5, speed=0.3, armor=2,
                 ranged={"color": "#c8fff6", "damage": 3, "cooldown": 50, "speed": 1.1, "count": 3, "spread": 0.12,
                         "particle": "minecraft:cloud", "knockback": 0.6, "size": 0.22},
                 drops=[Drop("thermalia_geyser_pearl", 0, 1, chance=0.3), Drop("minecraft:prismarine_crystals", 0, 2)],
                 sounds="guardian", pitch=0.85, xp=10, group=1, tracking=8,
                 description="Coils at the bottom of the hottest pools. Bother it and it spouts a jet of boiling water."),
        Creature("steam_turtle", "Steam Turtle", "quadruped", ["#4a7a3a", "#e8e0ca", TURQUOISE, "#101810"],
                 pattern="patches", size=1.25,
                 body={"shell": True, "stance": "low", "legs": 4, "leg_len": 2, "leg_w": 4, "body_len": 15, "body_w": 13,
                       "body_h": 6, "head_size": 1.0, "snout": 1, "crystals": 4, "eye_style": "sleepy", "mouth": "smile",
                       "tail": 1, "tail_len": 3, "ears": "none", "neck": 3},
                 behavior="passive", health=30, armor=8, speed=0.12, abilities=["shield"], tempt="minecraft:seagrass",
                 drops=[Drop("thermalia_onsen_egg", 0, 1, chance=0.6), Drop("minecraft:turtle_scute", 0, 1, chance=0.25)],
                 sounds="turtle", pitch=0.8, xp=4, group=3,
                 description="Carries a little hot spring on its back; the mineral crystals grow a ring every century."),
        Creature("sulfur_toad", "Sulfur Toad", "hopper", ["#d8c020", "#f08a20", "#ff4a20", "#201000"], pattern="spots",
                 size=0.9,
                 body={"kind": "frog", "throat_sac": True, "eye_style": "angry", "mouth": "frown", "body_w": 9,
                       "body_h": 7, "leg_len": 6, "spikes": 3, "brows": True},
                 behavior="hostile", attack="ranged", health=14, damage=3, speed=0.26,
                 ranged={"color": "#e8d840", "damage": 2, "cooldown": 70, "speed": 0.8, "gravity": True,
                         "effect": Effect("minecraft:nausea", 5), "particle": "minecraft:white_smoke", "size": 0.2},
                 abilities=["leap"],
                 drops=[Drop("thermalia_sulfur_gland", 0, 1), Drop("minecraft:gunpowder", 0, 1, chance=0.4)],
                 sounds="frog", pitch=0.7, xp=5, group=3,
                 description="Puffs its throat full of sulfur and lobs stinking globs. The smell lingers for days."),
    ],
    biomes=[
        Biome("thermalia_terraces", "Travertine Terraces", top="thermalia_sinter_crust", under="thermalia_travertine",
              temperature=0.0, humidity=0.1, grass_color="#7ab45a", foliage_color="#62ac4a", water_color="#30d4cc",
              water_fog_color="#1a9aa0", particles=[("minecraft:cloud", 0.0012), ("minecraft:white_ash", 0.004)],
              ambient="bubbling", music="minecraft:music.overworld.meadow",
              features=[
                  TERRACE_POOL,
                  GEYSER,
                  SINTER_CONE,
                  Patch(block="thermalia_spa_vent", count=1, tries=4),
                  Patch(block="thermalia_steamfern", count=2, tries=10),
                  Patch(block="thermalia_bathbloom", where="water_surface", count=3, tries=24, max_depth=3),
                  Disk(block="thermalia_microbial_mat", replace=["thermalia_sinter_crust", "thermalia_travertine"],
                       radius=(2, 4), count=1, chance=2),
              ],
              spawns=[Spawn("steam_turtle", 10, (2, 3)), Spawn("geyser_serpent", 3, (1, 1)),
                      Spawn("sulfur_toad", 3, (1, 2))]),
        Biome("thermalia_prismatic", "Prismatic Springs", top="thermalia_microbial_mat", under="thermalia_travertine",
              temperature=0.55, humidity=0.6, elevation=-0.2, underwater="thermalia_sinter_crust",
              grass_color="#d06818", foliage_color="#e89a2c", water_color="#1e6ce8", water_fog_color="#1a4ab0",
              sky_color="#a8dce0", particles=[("minecraft:cloud", 0.002)], ambient="bubbling",
              music="minecraft:music.overworld.lush_caves",
              surface_noise=[("thermalia_sinter_crust", 0.55)],
              features=[
                  Lake(fluid="minecraft:water", border="thermalia_sulfur_crust", count=1, chance=1),
                  Patch(block="thermalia_bathbloom", where="water_surface", count=5, tries=32, max_depth=4),
                  Patch(block="thermalia_spa_vent", count=1, tries=3),
                  Structure(kind="geyser", blocks={"vent": "thermalia_geyser_vent", "mound": "thermalia_microbial_mat"},
                            size=(5, 8), params={"pools": 1, "height": 0.8}, count=1, chance=4),
                  Disk(block="thermalia_sulfur_crust", replace=["thermalia_microbial_mat"], radius=(2, 3), count=1),
              ],
              spawns=[Spawn("geyser_serpent", 8, (1, 1)), Spawn("steam_turtle", 6, (1, 2))]),
        Biome("thermalia_sulfur_flats", "Sulfur Flats", top="thermalia_sulfur_crust", under="thermalia_travertine",
              temperature=0.9, humidity=-0.6, grass_color="#b8a418", foliage_color="#9a9a30", water_color="#a8c040",
              water_fog_color="#6a7a20", sky_color="#c8d4a0", fog_color="#e2dca8", fog_end=110,
              particles=[("dust:#e8d840:0.9", 0.012), ("minecraft:white_smoke", 0.002)], ambient="sizzle_toxic",
              music="minecraft:music.overworld.badlands",
              surface_noise=[("thermalia_scalding_mud", 0.78)],
              features=[
                  CrystalCluster(block="thermalia_sulfur_crystal", small="thermalia_sulfur_cluster", size=(3, 6), count=1,
                                 chance=2),
                  Patch(block="thermalia_sulfur_cluster", count=2, tries=12),
                  Disk(block="thermalia_scalding_mud", replace=["thermalia_sulfur_crust"], radius=(2, 3), count=1),
                  Patch(block="thermalia_geyser_vent", count=1, tries=3, chance=2),
                  Structure(kind="geyser", blocks={"vent": "thermalia_geyser_vent", "mound": "thermalia_sulfur_crust"},
                            size=(4, 7), params={"pools": 0, "height": 1.4}, count=1, chance=4),
                  CrystalCluster(where="cave_ceiling", block="thermalia_sulfur_crystal", small="thermalia_sulfur_cluster",
                                 size=(2, 4), count=2),
              ],
              spawns=[Spawn("sulfur_toad", 10, (1, 3)), Spawn("steam_turtle", 2, (1, 1))]),
        Biome("thermalia_fern_gullies", "Steamfern Gullies", top="thermalia_warm_moss", under="thermalia_travertine",
              temperature=-0.85, humidity=0.85, elevation=-0.4, underwater="thermalia_travertine",
              grass_color="#58964a", foliage_color="#3e8a3a", water_color="#38d0b8", water_fog_color="#1a8a80",
              fog_color="#c8e4d0", particles=[("minecraft:cloud", 0.0015), ("minecraft:falling_spore_blossom", 0.002)],
              ambient="jungle_night", music="minecraft:music.overworld.bamboo_jungle",
              features=[
                  TREE_FERN,
                  GiantPlant(stem="thermalia_fern_trunk", head="thermalia_fern_fronds", shape="palm", height=(12, 18),
                             radius=(4, 6), bend=0.35, stem_width=1, count=1, chance=3),
                  Patch(block="thermalia_steamfern", count=8, tries=32),
                  Patch(block="thermalia_spa_vent", count=1, tries=3, chance=2),
                  Patch(block="thermalia_bathbloom", where="water_surface", count=2, tries=16, max_depth=3),
                  TERRACE_POOL,
              ],
              spawns=[Spawn("steam_turtle", 14, (2, 4)), Spawn("geyser_serpent", 2, (1, 1))]),
    ],
    effects=[],
    ambient="bubbling",
    music="minecraft:music.overworld.meadow",
    icon="portalgun:thermalia_onsen_egg",
)
