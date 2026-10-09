"""R-2 Radlands - a toxic wasteland: glowing green pools, dead forests, radioactive rock and things that glow back."""
import numpy as np
from PIL import Image

from gen.content.dsl import *
from gen.noise import rng

# palette: ash grey-brown, sickly mustard-olive, toxic glow green, rust, hazard yellow, bleached bone
P_CRUST = ["#3c382c", "#4c4838", "#5c5746", "#6c6652", "#7e7860"]
P_ASH = ["#3a372e", "#4a463a", "#5a5546", "#6c6654"]
P_ROCK = ["#2e2c28", "#3c3a34", "#4c4942", "#5c5950", "#6e6a60"]
P_GLOW = ["#2a8a10", "#46c018", "#6aff2a", "#b4ff6a", "#eaffc0"]
P_DEAD = ["#4a4038", "#625648", "#7a6e5c", "#948670"]
P_TWIG = ["#3a3028", "#54483a", "#6c5e4a", "#84765e"]
P_SLUDGE = ["#1a2a08", "#2a4210", "#3c5e18", "#548020", "#76a82e"]
P_RUST = ["#4a2210", "#6a3418", "#8a4a22", "#a8642e"]
HAZARD = "#f0c818"


def _rgb(c):
    c = c.lstrip("#")
    return np.array([int(c[i:i + 2], 16) for i in (0, 2, 4)], float)


def _img(a):
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8), "RGBA")


def _cracks(seed, n=5, length=10):
    """Boolean mask of a few wandering cracks (wrapping)."""
    R = rng(seed)
    m = np.zeros((16, 16), bool)
    for _ in range(n):
        x, y = R.uniform(0, 16), R.uniform(0, 16)
        ang = R.uniform(0, 6.28)
        for _s in range(length):
            ang += R.uniform(-0.7, 0.7)
            x, y = (x + np.cos(ang)) % 16, (y + np.sin(ang)) % 16
            m[int(y), int(x)] = True
    return m


def cracked_crust(pal, seed):
    """Dry, cracked wasteland crust: polygon plates split by dark fissures, a faint green tint in the deepest."""
    from gen.textures import sand
    a = np.array(sand(pal, seed)).astype(float)
    m = _cracks(seed + ":c", 6, 12)
    a[m, :3] = _rgb(P_ASH[0])
    edge = np.roll(m, 1, 0) & ~m
    a[edge, :3] = a[edge, :3] * 0.5 + _rgb(pal[4]) * 0.5
    R = rng(seed + ":g")
    pts = np.argwhere(m)
    for _ in range(2):
        if len(pts):
            y, x = pts[int(R.integers(0, len(pts)))]
            a[y, x, :3] = _rgb(P_GLOW[1])
    return _img(a)


def glow_vein_rock(rock_pal, glow_pal, seed):
    """Radioactive rock: dark stone with bright green fissures that glow from inside."""
    from gen.textures import rough_stone
    a = np.array(rough_stone(rock_pal, seed)).astype(float)
    m = _cracks(seed + ":v", 5, 11)
    halo = (np.roll(m, 1, 0) | np.roll(m, -1, 0) | np.roll(m, 1, 1) | np.roll(m, -1, 1)) & ~m
    a[halo, :3] = a[halo, :3] * 0.4 + _rgb(glow_pal[1]) * 0.6
    a[m, :3] = _rgb(glow_pal[3])
    R = rng(seed + ":h")
    pts = np.argwhere(m)
    for _ in range(3):
        if len(pts):
            y, x = pts[int(R.integers(0, len(pts)))]
            a[y, x, :3] = _rgb(glow_pal[4])
    return _img(a)


def waste_barrel(side=True, seed="rad-barrel"):
    """Rusty hazard-yellow drum with ribs and a black trefoil (side) or a lid with a bung (top)."""
    a = np.zeros((16, 16, 4), float)
    a[..., 3] = 255
    R = rng(seed)
    yy, xx = np.mgrid[0:16, 0:16]
    base = _rgb(HAZARD)
    shade = 0.78 + 0.22 * np.cos((xx - 7.5) / 8.0 * 1.4)[..., None]
    a[..., :3] = base * shade
    if side:
        for y in (1, 2, 13, 14):
            a[y, :, :3] = base * 0.55
        a[0, :, :3] = a[15, :, :3] = _rgb("#3a3010")
        cx, cy = 7.5, 7.5
        d = np.hypot(xx - cx, yy - cy)
        ang = np.degrees(np.arctan2(yy - cy, xx - cx)) % 360
        blade = ((ang + 30) % 120) < 60
        tre = ((d < 4.4) & (d > 1.6) & blade) | (d < 1.0)
        a[tre, :3] = _rgb("#141008")
    else:
        d = np.hypot(xx - 7.5, yy - 7.5)
        a[(d > 6.5) & (d < 7.6), :3] = base * 0.5
        a[(np.hypot(xx - 11, yy - 4.5) < 1.6), :3] = _rgb("#3a3010")
    # rust and toxic leaks
    for _ in range(14):
        x, y = int(R.integers(0, 16)), int(R.integers(0, 16))
        a[y, x, :3] = _rgb(P_RUST[int(R.integers(0, 4))])
    if side:
        x = int(R.integers(2, 6))
        for y in range(3, 3 + int(R.integers(4, 9))):
            a[y, x, :3] = _rgb(P_GLOW[2])
    return _img(a)


DEAD_TREE = Tree(log="rad_dead_log", leaves="rad_dead_twigs", shape="acacia", height=(5, 8), count=1)
HOT_SPIRE = Spire(blocks=[("rad_stone", 4), ("rad_glowrock", 2)], tip="rad_glowrock", height=(10, 24), radius=(2, 4),
                  lean=0.3, count=1, chance=2)

DIMENSION = Dimension(
    id="radlands",
    code="R-2",
    name="Radlands",
    tagline="Don't drink the water. Don't touch the rocks. Don't stay.",
    description=("A burnt-out world after the bombs: cracked ash flats under a mustard sky, dead forests of bleached "
                 "trunks and pools that glow an awful green. The rocks themselves are hot here - stepping on glowrock "
                 "poisons you - but uranium waits inside them. Mutant Rats hunt in packs, Sludge Blobs ooze out of "
                 "the pools, and the Glowing Ghouls are drawn to anything that is still warm."),
    danger=4,
    color="#6aff2a",
    terrain=Terrain(style="hills", stone="rad_stone", sea_level=60, height=70, amplitude=15, scale=1.4,
                    roughness=0.18, deepslate="minecraft:deepslate",
                    params={"rivers": 0.35, "detail": 0.7, "biome_size": 300, "cliff_block": "rad_stone",
                            "cliffs": True, "beach_block": "rad_sludge", "beach_height": 1, "springs": 0}),
    sky=Sky(sky_color="#a09a5e", fog_color="#7e7656", water_fog_color="#1e4a0a", fog_start=16, fog_end=120,
            cloud_color="#a0606a3c", cloud_height=150, time="afternoon", sunrise_color="#ffa0ff40",
            sky_light_color="#f0f0b0", sky_light_factor=0.85,
            bodies=[Celestial("sun", ["#fff4c0", "#e8e070", "#a0a030"], size=40, yaw=250, pitch=58, alpha=0.65,
                              seed="rad-sun"),
                    Celestial("shattered_moon", ["#6a6a58", "#9a9a80", "#6aff2a", "#2a2a20"], size=50, yaw=60, pitch=30,
                              roll=-10, seed="rad-moon")]),
    blocks=[
        Block("rad_crust", "Cracked Crust", "grass", {
            "top": tex(cracked_crust, P_CRUST, "rad-crust"),
            "side": tex("grass_side", P_CRUST, P_ASH, seed="rad-crust-side"),
            "bottom": tex("dirt", P_ASH, seed="rad-ash")}, hardness=0.7, sound="gravel", map_color="color_brown"),
        Block("rad_ashsoil", "Ash Soil", "soil", {"all": tex("dirt", P_ASH, seed="rad-ash")}, hardness=0.6,
              sound="gravel", map_color="color_gray"),
        Block("rad_stone", "Scorched Stone", "stone", {"all": tex("rough_stone", P_ROCK, seed="rad-stone")},
              hardness=1.6, sound="tuff", map_color="color_gray"),
        Block("rad_glowrock", "Glowrock", "hazard", {"all": tex(glow_vein_rock, P_ROCK, P_GLOW, "rad-glowrock")},
              hardness=2.0, sound="tuff", tool="pickaxe", light=9, damage=1, damage_type="magic",
              effect="minecraft:poison", effect_seconds=3, map_color="color_light_green"),
        Block("rad_uranium_ore", "Uranium Ore", "ore",
              {"all": tex("ore", tex("rough_stone", P_ROCK, seed="rad-stone"), P_GLOW[1:], seed="rad-uranium")},
              hardness=3.0, light=6, drop="rad_uranium_shard", drop_count=(1, 2), xp=(2, 5), map_color="color_light_green"),
        Block("rad_dead_log", "Dead Log", "log", {
            "side": tex("log_side", P_DEAD, seed="rad-deadlog"),
            "end": tex("log_top", P_DEAD, ["#a89a80", "#8a7e66"], seed="rad-deadlog-top")}, hardness=1.6, sound="wood",
              map_color="color_light_gray", flammable=True),
        Block("rad_dead_twigs", "Dead Twigs", "leaves", {"all": tex("leaves", P_TWIG, seed="rad-twigs", holes=0.82)},
              hardness=0.2, sound="azalea_leaves", map_color="color_brown", drop="minecraft:stick", flammable=True),
        Block("rad_sludge", "Toxic Sludge", "sticky", {"all": tex("goo", P_SLUDGE, seed="rad-sludge", alpha=255)},
              hardness=0.5, sound="mud", speed=0.4, jump=0.6, effect="minecraft:poison", effect_seconds=2,
              map_color="color_green"),
        Block("rad_waste_barrel", "Leaking Waste Barrel", "solid", {"all": tex(waste_barrel, True, "rad-barrel")},
              hardness=1.5, sound="metal", tool="pickaxe", light=4, map_color="color_yellow", particle="minecraft:glow"),
        Block("rad_bleached_bone", "Mutant Bone", "solid", {"all": tex("bone", ["#7a7258", "#948a6a", "#aea27e", "#c4b892"],
                                                                     seed="rad-bone")},
              hardness=2.0, sound="bone_block", tool="pickaxe", map_color="sand", drop="minecraft:bone_meal",
              drop_count=(2, 4)),
        Block("rad_glowshroom", "Glowshroom", "plant", {"cross": tex("mushroom_sprite", P_GLOW, P_DEAD, seed="rad-shroom",
                                                                   shape="cluster")},
              hardness=0.0, sound="fungus", light=9, emissive=True, fruit="rad_glowshroom_cap"),
        Block("rad_dead_bush", "Withered Scrub", "plant", {"cross": tex("thorn_bush", P_TWIG, seed="rad-bush")},
              hardness=0.0, sound="grass"),
        Block("rad_crystal", "Rad Crystal", "crystal_cluster",
              {"cross": tex("crystal_shard_sprite", P_GLOW[:4], seed="rad-crystal")}, hardness=0.6,
              sound="amethyst_cluster", light=10, emissive=True),
        Block("rad_fallout_vent", "Fallout Vent", "vent", {
            "top": tex(glow_vein_rock, P_ROCK, P_GLOW, "rad-vent"),
            "side": tex("rough_stone", P_ROCK, seed="rad-stone")}, hardness=1.6, sound="tuff", light=7, emissive=True,
              particle="minecraft:campfire_cosy_smoke", effect="minecraft:nausea", effect_seconds=5,
              map_color="color_light_green"),
    ],
    items=[
        Item("rad_uranium_shard", "Uranium Shard", tex("item_icon", "crystal", P_GLOW[1:], seed="rad-u"),
             rarity="rare", lore="Warm to the touch. Then warmer. Put it down."),
        Item("rad_mutant_jerky", "Mutant Jerky", tex("item_icon", "meat_cooked", ["#4a2a10", "#7a4a20", "#a8702e", "#d0a050"],
                                                     seed="rad-jerky", accent=P_GLOW[2]),
             kind="food", food=Food(6, 0.6, effects=[Effect("minecraft:hunger", 15, 0, 0.6),
                                                     Effect("minecraft:night_vision", 30, 0, 0.5)]),
             lore="Three-eyed rat, sun-dried. Might let you see in the dark. Might not."),
        Item("rad_glowshroom_cap", "Glowshroom Cap", tex("item_icon", "mushroom", P_GLOW, seed="rad-cap"), kind="food",
             food=Food(2, 0.2, effects=[Effect("minecraft:glowing", 20, 0), Effect("minecraft:poison", 3, 0, 0.3)]),
             lore="It glows because it is radioactive. You will glow because you ate it."),
    ],
    creatures=[
        Creature("glowing_ghoul", "Glowing Ghoul", "biped", ["#5e6a48", "#2e3624", "#8aff3a", "#d8ff50", "#3a2a20"],
                 pattern="glow_lines", size=1.15,
                 body={"stance": "hunched", "thin": False, "arms": 2, "arm_len": 15, "claws": True, "core": True,
                       "eye_style": "glow", "eyes": 2, "mouth": "fangs", "undead": True, "head_size": 0.95,
                       "spikes": 3, "ears": "pointy"},
                 behavior="hostile", health=28, damage=5, speed=0.27, armor=2, abilities=["regen", "glow_aura"],
                 on_hit=Effect("minecraft:poison", 4, 0), spawn_light="any",
                 drops=[Drop("minecraft:rotten_flesh", 0, 2), Drop("rad_uranium_shard", 0, 1, 0.25)],
                 sounds="zombie", pitch=0.65, xp=9, group=2,
                 description="What is left of a scavenger who stayed too long. Its heart glows green and it heals "
                             "in the fallout."),
        Creature("mutant_rat", "Mutant Rat", "crawler", ["#6a5a4a", "#c49488", "#8aff3a", "#ccff40", "#3a2e24"],
                 pattern="patches", size=0.95,
                 body={"kind": "rat", "eyes": 3, "eye_style": "angry", "mouth": "fangs", "tail": 2, "tail_len": 6,
                       "tail_kind": "thin", "ears": "round", "whiskers": True, "spikes": 3},
                 behavior="hostile", health=10, damage=3, speed=0.33, abilities=["swarm", "leap"],
                 on_hit=Effect("minecraft:poison", 3, 0),
                 drops=[Drop("rad_mutant_jerky", 0, 1, cooked="rad_mutant_jerky")],
                 sounds="silverfish", pitch=0.75, xp=4, group=4,
                 description="Dog-sized, three-eyed and never alone. If you see one, count to five."),
        Creature("sludge_blob", "Sludge Blob", "blob", ["#3c5e18", "#76a82e", "#6aff2a", "#101808", "#f0c818"],
                 pattern="speckle", size=1.25,
                 body={"shape": "drop", "blob_size": 13, "translucent": True, "core": True, "eye_style": "sleepy",
                       "eyes": 2, "mouth": "frown", "feet": False},
                 behavior="neutral", movement="ground", health=26, damage=4, speed=0.16,
                 abilities=["split"], on_hit=Effect("minecraft:poison", 5, 1),
                 drops=[Drop("minecraft:slime_ball", 1, 3), Drop("rad_glowshroom_cap", 0, 1)],
                 sounds="slime", pitch=0.55, xp=5, group=2,
                 description="A sleepy puddle of toxic waste that wandered out of a pool. Leave it alone and it "
                             "leaves you alone."),
    ],
    biomes=[
        Biome("rad_ash_flats", "Ash Flats", top="rad_crust", under="rad_ashsoil", temperature=0.4, humidity=-0.5,
              elevation=0.1, grass_color="#8a8462", foliage_color="#6c5e4a", water_color="#5aff20",
              water_fog_color="#1e4a0a", particles=[("minecraft:white_ash", 0.02), ("dust:#b4ff6a:0.7", 0.002)],
              ambient="wind_howl", music="minecraft:music.overworld.badlands",
              features=[
                  Patch(block="rad_dead_bush", count=4, tries=24),
                  Patch(block="rad_waste_barrel", count=1, tries=4, chance=3),
                  Boulder(blocks=[("rad_stone", 5), ("rad_glowrock", 1)], radius=(1, 3), count=1, chance=3),
                  Structure(kind="ribcage", blocks={"bone": "rad_bleached_bone", "spine": "rad_bleached_bone"},
                            size=(7, 12), params={"skull": 1}, chance=28),
                  Patch(block="rad_fallout_vent", count=1, tries=3, chance=4),
                  Lake(fluid="minecraft:water", border="rad_sludge", count=1, chance=6),
              ],
              spawns=[Spawn("mutant_rat", 8, (2, 4)), Spawn("glowing_ghoul", 3, (1, 2)), Spawn("sludge_blob", 2, (1, 1))]),
        Biome("rad_glow_pools", "Glow Pools", top="rad_crust", under="rad_ashsoil", temperature=-0.2, humidity=0.6,
              elevation=-0.6, underwater="rad_sludge", grass_color="#76a82e", foliage_color="#548020",
              water_color="#66ff22", water_fog_color="#2a6a10", fog_color="#7a9a4a",
              particles=[("dust:#6aff2a:1.0", 0.006), ("minecraft:glow", 0.002)], ambient="sizzle_toxic",
              music="minecraft:music.overworld.swamp",
              surface_noise=[("rad_sludge", 0.35)],
              features=[
                  Lake(fluid="minecraft:water", border="rad_glowrock", count=1, chance=2),
                  Patch(block="rad_glowshroom", count=4, tries=24),
                  Patch(block="rad_crystal", count=1, tries=6),
                  Patch(block="rad_waste_barrel", count=1, tries=3, chance=2),
                  Patch(block="rad_dead_bush", count=2, tries=12),
              ],
              spawns=[Spawn("sludge_blob", 9, (1, 2)), Spawn("mutant_rat", 4, (2, 3)), Spawn("glowing_ghoul", 2, (1, 1))]),
        Biome("rad_dead_forest", "Dead Forest", top="rad_crust", under="rad_ashsoil", temperature=-0.5, humidity=-0.2,
              elevation=0.2, surface_noise=[("rad_ashsoil", 0.3)], grass_color="#6c6654", foliage_color="#54483a",
              water_color="#5aff20", water_fog_color="#1e4a0a", fog_color="#6a6648", fog_end=80, sky_color="#8a8448",
              particles=[("minecraft:ash", 0.03)], ambient="eerie_choir", music="minecraft:music.nether.soul_sand_valley",
              features=[
                  DEAD_TREE,
                  Spire(blocks=[("rad_dead_log", 1)], height=(5, 11), radius=(1, 1), lean=0.45, count=3),
                  Tree(log="rad_dead_log", leaves="rad_dead_twigs", shape="bush", height=(1, 2), count=1, chance=2),
                  Patch(block="rad_dead_bush", count=3, tries=16),
                  Patch(block="rad_glowshroom", count=2, tries=12),
              ],
              spawns=[Spawn("glowing_ghoul", 6, (1, 2)), Spawn("mutant_rat", 6, (2, 4))]),
        Biome("rad_hot_zone", "The Hot Zone", top="rad_stone", under="rad_stone", temperature=0.7, humidity=0.2,
              elevation=0.5, grass_color="#46c018", water_color="#8aff3a", water_fog_color="#2a6a10",
              fog_color="#7e8a4a", sky_color="#9aa458",
              surface_noise=[("rad_glowrock", 0.55), ("rad_crust", 0.2)],
              particles=[("dust:#6aff2a:1.2", 0.01), ("minecraft:white_ash", 0.01)], ambient="electric_buzz",
              music="minecraft:music_disc.5",
              features=[
                  HOT_SPIRE,
                  CrystalCluster(block="rad_glowrock", small="rad_crystal", size=(3, 6), count=1, chance=2),
                  Patch(block="rad_crystal", count=2, tries=10),
                  Patch(block="rad_fallout_vent", count=1, tries=4),
                  Geode(outer="rad_stone", middle="rad_glowrock", inner="rad_uranium_ore", crystals=["rad_crystal"],
                        count=1, chance=8),
              ],
              spawns=[Spawn("glowing_ghoul", 8, (1, 3)), Spawn("sludge_blob", 3, (1, 1))]),
    ],
    effects=[],
    ambient="wind_howl",
    music="minecraft:music.overworld.badlands",
    platform="rad_stone",
    icon="portalgun:rad_uranium_shard",
)
