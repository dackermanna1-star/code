"""J-65 Jurassica - a steaming prehistoric jungle of ferns, cycads, tar pits and smoking volcanoes."""
import numpy as np
from PIL import Image

from gen.content.dsl import *
from gen.noise import rng

# palette: fern green, jungle shadow, laterite red, volcanic black, ash grey, lava orange, tar black
P_FERN = ["#1e3a12", "#2a4e18", "#386620", "#4a7e2a", "#64983a"]
P_SOIL = ["#4a2414", "#5e301a", "#743e22", "#8a4e2c"]
P_SHALE = ["#5a4e3a", "#6c5e46", "#807056", "#94866a", "#aa9c80"]
P_CYCAD = ["#3a2a16", "#4e3a1e", "#664c28", "#7e6034", "#987844"]
P_FROND = ["#18361a", "#224a22", "#2e6028", "#3e7a32", "#5a9842"]
P_ASH = ["#2a2a2c", "#363638", "#444446", "#545456", "#68686a"]
P_LAVA = ["#5a0e04", "#a02408", "#e05010", "#ff8a20", "#ffd060"]


def _rgb(c):
    c = c.lstrip("#")
    return np.array([int(c[i:i + 2], 16) for i in (0, 2, 4)], float)


def tar(seed):
    """Glossy black tar: near-black swirls with oily blue/violet sheen highlights and a trapped bubble."""
    R = rng(seed)
    yy, xx = np.mgrid[0:16, 0:16]
    f = np.zeros((16, 16))
    for k in range(4):
        fx, fy, ph = R.uniform(0.2, 0.7), R.uniform(0.2, 0.7), R.uniform(0, 6.3)
        f += np.sin(2 * np.pi * (xx * fx / 3.2 + yy * fy / 3.2) / 2 + ph) / (k + 1)
    t = (f - f.min()) / (np.ptp(f) + 1e-6)
    cols = [_rgb(c) for c in ("#070504", "#0e0b08", "#16120e", "#201a14")]
    idx = np.clip((t * 4).astype(int), 0, 3)
    a = np.zeros((16, 16, 4))
    for i in range(4):
        a[idx == i, :3] = cols[i]
    sheen = (t > 0.86)
    a[sheen, :3] = _rgb("#34302a")
    a[(t > 0.94), :3] = _rgb("#5a5448")
    bx, by = int(R.integers(3, 12)), int(R.integers(3, 12))
    a[by, bx, :3] = _rgb("#8a8270")
    a[by + 1, bx + 1, :3] = _rgb("#2a2620")
    a[..., 3] = 255
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8), "RGBA")


def magma_crust(seed):
    """Cooling basalt crust split by glowing lava seams."""
    from gen.textures import basalt_top
    a = np.array(basalt_top(P_ASH, seed)).astype(float)
    R = rng(seed + "seam")
    lava = [_rgb(c) for c in P_LAVA]
    for _ in range(4):
        x, y = float(R.uniform(0, 16)), float(R.uniform(0, 16))
        ang = R.uniform(0, 2 * np.pi)
        for step in range(10):
            ix, iy = int(x) % 16, int(y) % 16
            a[iy, ix, :3] = lava[3] if step % 3 else lava[4]
            jx = (ix + (1 if abs(np.cos(ang)) < 0.7 else 0)) % 16
            jy = (iy + (1 if abs(np.cos(ang)) >= 0.7 else 0)) % 16
            if a[jy, jx, :3].mean() < 120:
                a[jy, jx, :3] = lava[2]
            ang += R.uniform(-0.7, 0.7)
            x += np.cos(ang)
            y += np.sin(ang)
    a[..., 3] = 255
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8), "RGBA")


VOLCANO = Spire(blocks=[("minecraft:basalt", 4), ("minecraft:blackstone", 3), ("jurassica_ash", 2),
                        ("jurassica_magma_crust", 1)],
                tip="jurassica_smoke_vent", height=(26, 44), radius=(7, 10), lean=0.05, count=1, chance=6)

CYCAD = GiantPlant(stem="jurassica_cycad_log", head="jurassica_cycad_fronds", shape="palm", height=(4, 7),
                   radius=(3, 4), stem_width=1, bend=0.15)

DIMENSION = Dimension(
    id="jurassica",
    code="J-65",
    name="Jurassica",
    tagline="Steaming fern jungles where the dinosaurs never left",
    description=("A hot, wet, prehistoric world: jungles of tree ferns and cycads, open plains where Brontobacks "
                 "graze in thundering herds, bubbling tar pits full of old bones and volcanoes smoking on the ridges. "
                 "A comet hangs in the afternoon sky. The Pterodons only mind you near their nests - the Raptors hunt "
                 "in packs and they are faster than you."),
    danger=4,
    color="#64983a",
    terrain=Terrain(style="hills", stone="jurassica_shale", sea_level=62, height=76, amplitude=27, scale=1.2,
                    roughness=0.2, deepslate="minecraft:deepslate",
                    params={"rivers": 0.5, "detail": 0.35, "biome_size": 300, "cliffs": True,
                            "cliff_block": "jurassica_shale", "peak_block": "jurassica_ash", "peak_y": 118,
                            "ceiling_block": "jurassica_red_soil", "beach_block": "minecraft:mud", "beach_height": 1}),
    sky=Sky(sky_color="#8ec0d8", fog_color="#c4cc9c", water_fog_color="#1e3a24", fog_start=30, fog_end=190,
            cloud_color="#e8eef0e0", cloud_height=180, time="afternoon", sunrise_color="#c0ff9040",
            bodies=[Celestial("moon", ["#f0ece0", "#c8c0b0", "#8a8478"], size=70, yaw=110, pitch=30, alpha=0.55,
                              seed="jura-moon"),
                    Celestial("comet", ["#fff4d0", "#ffb060", "#ff6030"], size=46, yaw=300, pitch=52, roll=35,
                              seed="jura-comet")]),
    blocks=[
        Block("jurassica_fern_turf", "Fern Turf", "grass", {
            "top": tex("grass_top", P_FERN, seed="jura-turf"),
            "side": tex("grass_side", P_FERN, P_SOIL, seed="jura-turf-side"),
            "bottom": tex("dirt", P_SOIL, seed="jura-soil")}, hardness=0.6, sound="grass", map_color="color_green"),
        Block("jurassica_red_soil", "Laterite Soil", "soil", {"all": tex("dirt", P_SOIL, seed="jura-soil")},
              hardness=0.6, sound="gravel", map_color="terracotta_red"),
        Block("jurassica_shale", "Fossil Shale", "stone", {"all": tex("stone", P_SHALE, seed="jura-shale")},
              hardness=1.5, map_color="color_brown"),
        Block("jurassica_ash", "Volcanic Ash", "soil", {"all": tex("ash", P_ASH, seed="jura-ash")}, hardness=0.5,
              sound="sand", map_color="color_black"),
        Block("jurassica_cycad_log", "Cycad Trunk", "log", {
            "side": tex("scales", P_CYCAD, seed="jura-cycad"),
            "end": tex("log_top", P_CYCAD, ["#a08050", "#806038"], seed="jura-cycad-end")}, hardness=2.0, sound="wood",
              flammable=True, map_color="color_brown"),
        Block("jurassica_cycad_fronds", "Cycad Fronds", "leaves",
              {"all": tex("leaves", P_FROND, seed="jura-fronds", holes=0.3)}, hardness=0.2, sound="grass",
              flammable=True, map_color="color_green"),
        Block("jurassica_giant_fern", "Giant Fern", "tall_plant", {
            "bottom": tex("tall_plant_bottom", P_FROND, seed="jura-giantfern"),
            "top": tex("tall_plant_top", P_FROND, seed="jura-giantfern")}, hardness=0.0, sound="grass"),
        Block("jurassica_horsetail", "Horsetail", "plant",
              {"cross": tex("reeds", ["#2e5420", "#3e6e2a", "#56883a", "#78a050"], seed="jura-horsetail",
                            head_hex="#3a4a20")}, hardness=0.0, sound="grass"),
        Block("jurassica_tar", "Tar", "sticky", {"all": tex(tar, "jura-tar")}, hardness=1.0, sound="honey",
              speed=0.3, jump=0.35, map_color="color_black"),
        Block("jurassica_magma_crust", "Magma Crust", "hazard", {"all": tex(magma_crust, "jura-crust")}, hardness=1.2,
              damage=1.0, light=8, emissive=True, map_color="color_orange", damage_type="hot_floor"),
        Block("jurassica_smoke_vent", "Smoking Vent", "vent", {
            "top": tex(magma_crust, "jura-vent"),
            "side": tex("basalt_side", P_ASH, seed="jura-vent-side")}, hardness=1.5, sound="basalt",
              particle="minecraft:campfire_signal_smoke", light=10, emissive=True, map_color="color_black"),
    ],
    items=[
        Item("jurassica_raptor_claw", "Raptor Claw", tex("item_icon", "fang", ["#3a3020", "#a89070", "#f0e8d0"],
                                                         seed="jura-claw"),
             rarity="uncommon", lore="Sharper than it has any right to be. Count your fingers."),
        Item("jurassica_bronto_rib", "Bronto Rib", tex("item_icon", "meat_raw", ["#8a2a20", "#c04a3a", "#f0d0c0"],
                                                       seed="jura-rib"),
             kind="food", food=Food(5, 0.3), lore="One rib. Roughly the size of a canoe."),
        Item("jurassica_bronto_roast", "Bronto Roast", tex("item_icon", "meat_cooked", ["#5a2a10", "#a85a28", "#e8b070"],
                                                           seed="jura-roast"),
             kind="food", food=Food(12, 1.0, effects=[Effect("minecraft:health_boost", 120, 1),
                                                      Effect("minecraft:slowness", 10, 0)]),
             lore="Feeds a family of twelve. Or one very tired explorer."),
    ],
    creatures=[
        Creature("raptor", "Raptor", "biped", ["#5a7a3a", "#c8a868", "#d84020", "#ffd000", "#2a3a1a"],
                 pattern="stripes", size=1.05,
                 body={"stance": "raptor", "leg_len": 9, "neck": 4, "crest": True, "claws": True, "tail": 3,
                       "tail_len": 7, "mouth": "fangs", "jaw": True, "eye_style": "slit", "arms": 2, "snout": 4,
                       "body_len": 12, "spikes": 4},
                 behavior="hostile", health=22, damage=5, speed=0.36, abilities=["leap", "swarm"],
                 drops=[Drop("jurassica_raptor_claw", 0, 1, chance=0.6), Drop("minecraft:leather", 0, 1)],
                 sounds="ravager", pitch=1.7, xp=8, group=3,
                 description="Clever, fast and never alone. If you see one, the other two are already flanking you."),
        Creature("brontoback", "Brontoback", "quadruped", ["#6a7a5a", "#b0b48c", "#c8683a", "#201810", "#4a5a3a"],
                 pattern="patches", size=2.0,
                 body={"neck": 14, "neck_angle": 50, "leg_len": 10, "leg_w": 5, "body_len": 22, "body_h": 12,
                       "body_w": 14, "tail": 4, "tail_len": 10, "tail_kind": "thin", "spikes": 6, "plates": True,
                       "head_size": 0.8, "eye_style": "sleepy", "mouth": "smile", "ears": "none"},
                 behavior="passive", health=120, speed=0.17, armor=4, tempt="jurassica_giant_fern",
                 drops=[Drop("jurassica_bronto_rib", 2, 4, cooked="jurassica_bronto_roast")],
                 sounds="sniffer", pitch=0.5, xp=15, group=3, tracking=12,
                 description="A gentle hill of a herbivore. The ground shakes politely when it walks by."),
        Creature("pterodon", "Pterodon", "flyer", ["#8a5a3a", "#e0a878", "#d03a20", "#ffd000"], pattern="gradient",
                 size=1.35,
                 body={"kind": "bird", "wing_kind": "membrane", "wing_span": 22, "beak": 5, "crest": True,
                       "tail": 0, "legs": 2, "eye_style": "slit", "neck": 3},
                 behavior="neutral", health=18, damage=4, speed=0.32, abilities=["swarm"],
                 drops=[Drop("minecraft:feather", 0, 2), Drop("minecraft:leather", 0, 1)],
                 sounds="phantom", pitch=1.3, xp=6, group=2, tracking=10,
                 description="A leathery glider that wheels over the volcanoes. Mind it and it minds you."),
    ],
    biomes=[
        Biome("jurassica_fern_jungle", "Fern Jungle", top="jurassica_fern_turf", under="jurassica_red_soil",
              temperature=0.3, humidity=0.5, elevation=0.0, grass_color="#3a6a22", foliage_color="#2e6a1e",
              water_color="#3a7a5a", water_fog_color="#1e3a24", precipitation=True,
              particles=[("dust:#c8e070:0.6", 0.002), ("minecraft:falling_spore_blossom", 0.0008)],
              ambient="jungle_night", music="minecraft:music.overworld.jungle",
              features=[
                  Tree(log="minecraft:jungle_log", leaves="minecraft:jungle_leaves", shape="mega_jungle",
                       height=(18, 28), decoration="minecraft:vine", count=1),
                  Tree(log="minecraft:jungle_log", leaves="minecraft:jungle_leaves", shape="jungle", height=(6, 10),
                       decoration="minecraft:vine", count=2),
                  GiantPlant(stem="jurassica_cycad_log", head="jurassica_cycad_fronds", shape="palm", height=(8, 13),
                             radius=(4, 5), bend=0.3, count=1),
                  CYCAD,
                  Patch(block="jurassica_giant_fern", count=6, tries=40),
                  Patch(block="minecraft:large_fern", count=4, tries=32),
                  Patch(block="minecraft:fern", count=6, tries=48),
                  Patch(block="jurassica_horsetail", count=2, tries=16),
                  Structure(kind="nest", blocks={"main": "minecraft:jungle_log", "egg": "minecraft:sniffer_egg"},
                            size=(3, 5), chance=24),
              ],
              spawns=[Spawn("raptor", 6, (2, 3)), Spawn("brontoback", 4, (1, 3)), Spawn("pterodon", 3, (1, 2))]),
        Biome("jurassica_cycad_plains", "Cycad Plains", top="jurassica_fern_turf", under="jurassica_red_soil",
              temperature=-0.9, humidity=0.1, elevation=0.0, grass_color="#5a8a2e", foliage_color="#4a7e2a",
              water_color="#3a8a7a", water_fog_color="#1e4a3a",
              surface_noise=[("jurassica_red_soil", 0.4), ("minecraft:coarse_dirt", 0.55)],
              particles=[("dust:#e0d890:0.5", 0.0015)],
              ambient="cozy_breeze", music="minecraft:music.overworld.sparse_jungle",
              features=[
                  CYCAD,
                  GiantPlant(stem="jurassica_cycad_log", head="jurassica_cycad_fronds", shape="palm", height=(9, 14),
                             radius=(4, 6), bend=0.25, count=1, chance=3),
                  Patch(block="minecraft:short_grass", count=8, tries=48),
                  Patch(block="jurassica_horsetail", count=4, tries=32),
                  Patch(block="jurassica_giant_fern", count=2, tries=16),
                  Boulder(blocks=[("jurassica_shale", 4), ("minecraft:mossy_cobblestone", 1)], radius=(2, 3), squash=0.7,
                          count=1, chance=3),
                  Structure(kind="ribcage", blocks={"bone": "minecraft:bone_block", "spine": "minecraft:bone_block"},
                            size=(8, 12), chance=18),
              ],
              spawns=[Spawn("brontoback", 12, (2, 4)), Spawn("raptor", 4, (2, 3)), Spawn("pterodon", 3, (1, 2))]),
        Biome("jurassica_tar_pits", "Tar Pits", top="jurassica_red_soil", under="jurassica_red_soil",
              temperature=0.8, humidity=-0.4, elevation=-0.35, underwater="minecraft:mud", grass_color="#5a6a2a",
              foliage_color="#4a5a22", water_color="#4a5a30", water_fog_color="#2a2a14", fog_color="#b0a880",
              surface_noise=[("minecraft:mud", 0.3), ("jurassica_fern_turf", 0.5)],
              particles=[("minecraft:smoke", 0.002), ("minecraft:ash", 0.003)],
              ambient="bubbling", music="minecraft:music.overworld.swamp",
              features=[
                  Lake(fluid="jurassica_tar", border="jurassica_red_soil", count=1, chance=2),
                  Disk(block="jurassica_tar", replace=["jurassica_red_soil", "minecraft:mud", "jurassica_fern_turf"],
                       radius=(3, 6), count=2),
                  Structure(kind="ribcage", blocks={"bone": "minecraft:bone_block", "spine": "minecraft:bone_block"},
                            size=(9, 13), params={"height": 0.8}, chance=3),
                  Spire(blocks=[("minecraft:bone_block", 1)], height=(4, 9), radius=(1, 1), lean=0.7, count=1, chance=2),
                  Patch(block="jurassica_horsetail", count=5, tries=32),
                  Patch(block="minecraft:dead_bush", count=2, tries=12),
                  CYCAD,
              ],
              spawns=[Spawn("raptor", 8, (2, 3)), Spawn("brontoback", 3, (1, 2)), Spawn("pterodon", 2, (1, 2))]),
        Biome("jurassica_volcanic_highlands", "Smoking Highlands", top="jurassica_ash", under="minecraft:basalt",
              temperature=-0.3, humidity=-0.5, elevation=0.55, grass_color="#4a5a3a", water_color="#5a6a6a",
              water_fog_color="#2a2a2a", fog_color="#9a9488", sky_color="#a8a8a0",
              surface_noise=[("minecraft:blackstone", 0.35), ("jurassica_magma_crust", 0.62)],
              particles=[("minecraft:ash", 0.02), ("minecraft:white_ash", 0.006)],
              ambient="volcanic_rumble", music="minecraft:music.nether.basalt_deltas",
              features=[
                  VOLCANO,
                  Spire(blocks=[("minecraft:basalt", 3), ("minecraft:blackstone", 1)], height=(6, 12), radius=(1, 2),
                        lean=0.2, count=1, chance=2),
                  Lake(fluid="minecraft:lava", border="minecraft:basalt", count=1, chance=6),
                  Patch(block="jurassica_smoke_vent", count=1, tries=3, chance=2),
                  Boulder(blocks=[("minecraft:obsidian", 1), ("minecraft:blackstone", 3), ("minecraft:basalt", 2)],
                          radius=(1, 3), squash=0.8, count=1, chance=2),
                  Structure(kind="nest", blocks={"main": "minecraft:dead_bush", "egg": "minecraft:sniffer_egg"},
                            size=(3, 4), chance=20),
              ],
              spawns=[Spawn("pterodon", 5, (1, 2)), Spawn("raptor", 3, (1, 2))]),
    ],
    effects=[],
    ambient="jungle_night",
    music="minecraft:music.overworld.jungle",
    icon="portalgun:jurassica_raptor_claw",
)
