"""M-1 Microverse - shrunk to a micron: stained cell walls, a cytoplasm sea and organelles the size of hills."""
import numpy as np
from PIL import Image

from gen.content.dsl import *
from gen.noise import rng

# palette: H&E stain - eosin pink membranes, hematoxylin purple nuclei, lilac cytosol, aqua cytoplasm,
# mitochondria orange, chloroplast green
P_MEMB = ["#b4507e", "#cc6a96", "#e088ae", "#f0a8c6", "#fcd0e2"]
P_TAIL = ["#c890b4", "#d8a8c8", "#e8c4dc"]
P_GEL = ["#a890c8", "#b8a2d4", "#c8b6e0", "#d8caea", "#ece2f6"]
P_MATRIX = ["#8c74ac", "#9a84b8", "#aa96c4", "#bca8d0"]
P_NUC = ["#2e1450", "#43206e", "#5a2e8a", "#7442a8", "#9a6ac8"]
P_MITO = ["#a8401a", "#cc5a22", "#ec7a30", "#ffa050", "#ffd090"]
P_CHLORO = ["#1e5a28", "#2a7a34", "#3c9a40", "#5cba50", "#a0e080"]
P_AQUA = ["#5ab8b0", "#7ad0c8", "#9ae4dc", "#c4f4ee", "#eafffc"]
P_LYSO = ["#7a8a10", "#a0b018", "#c8d82a", "#e4f050", "#f8ff98"]


def _rgb(c):
    c = c.lstrip("#")
    return np.array([int(c[i:i + 2], 16) for i in (0, 2, 4)], float)


def _img(a):
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8), "RGBA")


def lipid_bilayer(head_pal, tail_pal, seed):
    """Cell membrane cross-section: two rows of round phospholipid heads with wavy tails meeting in the middle."""
    a = np.zeros((16, 16, 4), float)
    a[..., 3] = 255
    a[..., :3] = _rgb(tail_pal[1])
    R = rng(seed)
    yy, xx = np.mgrid[0:16, 0:16]
    # tails: wavy vertical stripes
    for x in range(1, 16, 2):
        wob = (np.sin(yy[:, 0] * 1.3 + x) > 0.3).astype(int)
        for y in range(16):
            xx2 = (x + wob[y]) % 16
            a[y, xx2, :3] = _rgb(tail_pal[0])
    a[7:9, :, :3] = _rgb(tail_pal[2])
    # heads: row at top (y~1.5) and bottom (y~13.5), 4px period, shaded spheres
    for row_y in (1.5, 13.5):
        for cx in (1.5, 5.5, 9.5, 13.5):
            jx = cx + R.uniform(-0.3, 0.3)
            d = np.hypot(xx - jx, yy - row_y)
            m = d < 2.1
            shade = np.clip((xx - jx + yy - row_y) / 3.0, -1, 1)
            idx = np.clip(np.round(2.6 - shade * 1.5 - d * 0.4), 0, 4).astype(int)
            cols = np.array([_rgb(c) for c in head_pal])
            a[m, :3] = cols[idx[m]]
    return _img(a)


def cytogel_top(pal, seed):
    """Granular cytosol surface: soft lilac gel dotted with dark ribosome granules and bright vesicles."""
    from gen.textures import clay
    a = np.array(clay(pal, seed)).astype(float)
    R = rng(seed)
    for _ in range(10):
        x, y = int(R.integers(0, 16)), int(R.integers(0, 16))
        a[y, x, :3] = _rgb("#5a3a7a")
    for _ in range(3):
        x, y = int(R.integers(1, 14)), int(R.integers(1, 14))
        a[y:y + 2, x:x + 2, :3] = _rgb(pal[4])
        a[y, x, :3] = _rgb("#ffffff")
    return _img(a)


def chromatin(pal, seed):
    """Nucleus matter: deep purple with tangled darker chromatin threads and a few bright nucleolus spots."""
    a = np.zeros((16, 16, 4), float)
    a[..., 3] = 255
    R = rng(seed)
    base = R.uniform(0, 1, (16, 16))
    cols = np.array([_rgb(c) for c in pal])
    a[..., :3] = cols[np.clip((base * 1.5 + 2).astype(int), 2, 3)]
    for _ in range(5):
        x, y = R.uniform(0, 16), R.uniform(0, 16)
        ang = R.uniform(0, 6.28)
        for _s in range(14):
            ang += R.uniform(-0.9, 0.9)
            x = (x + np.cos(ang)) % 16
            y = (y + np.sin(ang)) % 16
            a[int(y), int(x), :3] = cols[0]
    for _ in range(3):
        x, y = int(R.integers(0, 16)), int(R.integers(0, 16))
        a[y, x, :3] = cols[4]
    return _img(a)


def mitochondrion(pal, seed):
    """Mitochondrion cross-section: outer membrane frame and folded cristae ribbons."""
    a = np.zeros((16, 16, 4), float)
    a[..., 3] = 255
    cols = [_rgb(c) for c in pal]
    a[..., :3] = cols[3]
    yy, xx = np.mgrid[0:16, 0:16]
    # zig-zag cristae across the block
    for k, x0 in enumerate((2, 6, 10, 14)):
        wave = x0 + np.round(np.sin(yy[:, 0] * 0.8 + k) * 1.2).astype(int)
        for y in range(16):
            a[y, wave[y] % 16, :3] = cols[1]
            a[y, (wave[y] + 1) % 16, :3] = cols[2]
    a[0, :, :3] = a[15, :, :3] = cols[0]
    a[:, 0, :3] = a[:, 15, :3] = cols[0]
    a[1, 1:15, :3] = cols[4]
    R = rng(seed)
    for _ in range(4):
        x, y = int(R.integers(2, 14)), int(R.integers(2, 14))
        a[y, x, :3] = cols[4]
    return _img(a)


def chloroplast(pal, seed):
    """Chloroplast: stacks of thylakoid discs (grana) in a paler stroma."""
    a = np.zeros((16, 16, 4), float)
    a[..., 3] = 255
    cols = [_rgb(c) for c in pal]
    a[..., :3] = cols[3]
    R = rng(seed)
    for gx in (1, 9):
        for gy in (1, 9):
            ox, oy = gx + int(R.integers(0, 2)), gy + int(R.integers(0, 2))
            for row in range(0, 6, 2):
                a[oy + row, ox:ox + 6, :3] = cols[1]
                a[oy + row + 1, ox:ox + 6, :3] = cols[2]
                a[oy + row, ox, :3] = cols[0]
    a[7:9, :, :3] = cols[4] * 0.5 + cols[3] * 0.5
    return _img(a)


NUCLEUS = Boulder(blocks=[("micro_nucleus", 8), ("micro_nucleolus", 1)], radius=(5, 8), squash=0.85, count=1, chance=4)

DIMENSION = Dimension(
    id="microverse",
    code="M-1",
    name="Microverse",
    tagline="You are smaller than you have ever been.",
    description=("Shrink below a micron into a living tissue sample: towering pink cell walls stained like a lab "
                 "slide, a sea of cytoplasm, glowing purple nuclei the size of hills and orange mitochondria humming "
                 "with energy. Paramecia glide through the cytoplasm, but Amoebas creep along the membranes and "
                 "Phages - six-legged viral walkers - hunt anything with DNA. Something enormous is looking down "
                 "through the lens."),
    danger=3,
    color="#e088ae",
    terrain=Terrain(style="cells", stone="micro_membrane", fluid="minecraft:water", sea_level=54, height=63,
                    amplitude=12, roughness=0.0, min_y=0, total_height=192, caves=False, ores=False,
                    params={"cell_size": 40, "wall": 3.0, "roof": False, "open": 1.0, "biome_size": 220,
                            "ceiling_block": "micro_membrane", "cliffs": True, "cliff_block": "micro_membrane"}),
    sky=Sky(sky_color="#f2eaff", fog_color="#ead8f2", water_fog_color="#5ab8b0", fog_start=24, fog_end=150,
            cloud_color=None, time="noon", sky_light_color="#fff4fc", ambient_light=0.08,
            bodies=[Celestial("eye", ["#f4f0f8", "#6a4a8a", "#2a1a3a", "#101010"], size=150, yaw=0, pitch=89, alpha=0.35,
                              seed="micro-observer"),
                    Celestial("nebula", ["#f0a8c6", "#c8b6e0", "#9ae4dc", "#ffffff"], size=170, yaw=120, pitch=40,
                              alpha=0.4, additive=True, seed="micro-stain"),
                    Celestial("planet", ["#5a2e8a", "#9a6ac8", "#e8d8ff"], size=40, yaw=250, pitch=30, alpha=0.55,
                              seed="micro-blurcell")]),
    blocks=[
        Block("micro_membrane", "Cell Membrane", "stone", {"all": tex(lipid_bilayer, P_MEMB, P_TAIL, "micro-memb")},
              hardness=1.2, sound="mud_bricks", map_color="color_pink"),
        Block("micro_cytogel", "Cytogel", "grass", {
            "top": tex(cytogel_top, P_GEL, "micro-gel"),
            "side": tex("grass_side", P_GEL, P_MATRIX, seed="micro-gel-side"),
            "bottom": tex("clay", P_MATRIX, seed="micro-matrix")}, hardness=0.6, sound="slime",
              map_color="color_light_blue"),
        Block("micro_matrix", "Cell Matrix", "soil", {"all": tex("clay", P_MATRIX, seed="micro-matrix")}, hardness=0.5,
              sound="mud", map_color="color_purple"),
        Block("micro_nucleus", "Nucleus Matter", "glow", {"all": tex(chromatin, P_NUC, "micro-nuc")}, hardness=0.8,
              sound="slime", light=10, emissive=True, map_color="color_purple"),
        Block("micro_nucleolus", "Nucleolus", "glow", {"all": tex("lamp", ["#2e1450", "#7442a8", "#c090ff", "#f0d8ff"],
                                                              seed="micro-nucleolus", style="orb")},
              hardness=0.8, sound="slime", light=15, emissive=True, map_color="color_magenta"),
        Block("micro_mitochondrion", "Mitochondrion", "solid", {"all": tex(mitochondrion, P_MITO, "micro-mito")},
              hardness=0.8, sound="slime", tool="shovel", light=7, map_color="color_orange", drop="micro_atp",
              drop_count=(1, 3), xp=(0, 1)),
        Block("micro_chloroplast", "Chloroplast", "solid", {"all": tex(chloroplast, P_CHLORO, "micro-chloro")},
              hardness=0.8, sound="slime", tool="shovel", light=4, map_color="color_green"),
        Block("micro_vacuole", "Vacuole Film", "glass", {"all": tex("glass", P_AQUA, seed="micro-vac", inner_alpha=30)},
              hardness=0.3, sound="slime", map_color="color_light_blue"),
        Block("micro_lysosome", "Lysosome Acid", "hazard", {"all": tex("goo", P_LYSO, seed="micro-lyso", alpha=255)},
              hardness=0.6, sound="honey", light=6, emissive=True, damage=2, damage_type="magic",
              effect="minecraft:poison", effect_seconds=3, map_color="color_yellow"),
        Block("micro_cilia", "Cilia", "plant", {"cross": tex("grass_tuft", P_MEMB[1:], seed="micro-cilia")},
              hardness=0.0, sound="slime"),
        Block("micro_ribosomes", "Ribosome Cluster", "plant", {"cross": tex("puffball", ["#43206e", "#7442a8", "#b090e0"],
                                                                           seed="micro-ribo")},
              hardness=0.0, sound="slime", light=3),
        Block("micro_flagellum", "Flagellum", "hanging_plant", {"cross": tex("tendril", P_MEMB[:4], seed="micro-flag")},
              hardness=0.0, sound="slime"),
        Block("micro_er_tube", "Endoplasmic Reticulum", "solid", {"all": tex("velvet", P_MEMB, seed="micro-er")},
              hardness=0.8, sound="slime", tool="shovel", light=0, map_color="color_pink"),
        Block("micro_vesicle_vent", "Vesicle Vent", "vent", {
            "top": tex("lamp", P_AQUA, seed="micro-vent", style="orb"),
            "side": tex(lipid_bilayer, P_MEMB, P_TAIL, "micro-memb")}, hardness=1.0, sound="slime", light=8,
              emissive=True, particle="minecraft:bubble_pop", effect="minecraft:regeneration", effect_seconds=4,
              map_color="color_light_blue"),
    ],
    items=[
        Item("micro_atp", "ATP Pellet", tex("item_icon", "pearl", P_MITO[1:], seed="micro-atp"), kind="food",
             food=Food(2, 0.2, fast=True, always=True, effects=[Effect("minecraft:speed", 20, 1),
                                                                Effect("minecraft:haste", 20, 1)]),
             lore="Pure cellular energy. Do not chew."),
        Item("micro_phage_capsid", "Phage Capsid", tex("item_icon", "crystal", ["#5a5a7a", "#9a9ac0", "#e0e0ff"],
                                                       seed="micro-capsid", accent="#40ffd0"),
             rarity="uncommon", lore="Twenty perfect faces and one terrible idea inside."),
        Item("micro_cytoplasm_jelly", "Cytoplasm Jelly", tex("item_icon", "jelly", P_AQUA[:4], seed="micro-cjelly"),
             kind="food", food=Food(4, 0.6, effects=[Effect("minecraft:water_breathing", 30, 0),
                                                     Effect("minecraft:dolphins_grace", 10, 0, 0.5)]),
             lore="Mostly water, a little salt and a lot of enthusiasm."),
    ],
    creatures=[
        Creature("phage", "Phage", "tripod", ["#8a8aa8", "#c8c8e8", "#40ffd0", "#ff3a6a", "#4a4a68"], pattern="crystal",
                 size=1.25,
                 body={"legs": 6, "leg_len": 20, "dome": "pod", "dome_w": 12, "dome_h": 14, "eyes": 1, "eye_size": 3,
                       "lights": 5, "tentacles": 0, "spikes": 3},
                 behavior="hostile", health=30, damage=5, speed=0.28, armor=4, abilities=["leap"],
                 on_hit=Effect("minecraft:wither", 4, 0),
                 drops=[Drop("micro_phage_capsid", 0, 2)],
                 sounds="spider", pitch=1.5, xp=10, group=3, tracking=8,
                 description="A crystalline head of DNA on six stilt legs. It lands on anything alive and injects."),
        Creature("amoeba", "Amoeba", "blob", ["#9ae4dc", "#eafffc", "#5a2e8a", "#2a1a3a", "#7442a8"], pattern="speckle",
                 size=1.3,
                 body={"shape": "drop", "blob_size": 14, "translucent": True, "core": True, "feet": True,
                       "eye_style": "sleepy", "eyes": 2, "mouth": "open"},
                 behavior="hostile", movement="ground", health=22, damage=4, speed=0.18,
                 abilities=["split", "regen"], on_hit=Effect("minecraft:slowness", 4, 1),
                 drops=[Drop("micro_cytoplasm_jelly", 0, 2), Drop("minecraft:slime_ball", 0, 1)],
                 sounds="slime", pitch=0.6, xp=6, group=2,
                 description="A shapeless glob that flows over its prey and swallows it. Cut it in half and you have "
                             "two problems."),
        Creature("paramecium", "Paramecium", "swimmer", ["#a0e080", "#e8ffd8", "#5a2e8a", "#1a3a10", "#5cba50"],
                 pattern="speckle", size=1.1,
                 body={"kind": "fish", "body_len": 18, "body_w": 7, "body_h": 6, "fins": False, "whiskers": True,
                       "antennae": 3, "translucent": True, "eye_style": "cute", "eyes": 2},
                 behavior="passive", health=10, speed=0.4,
                 drops=[Drop("micro_cytoplasm_jelly", 1, 2)],
                 sounds="squid", pitch=1.5, xp=2, group=4,
                 description="A slipper-shaped swimmer fringed with thousands of beating cilia. Harmless and "
                             "perpetually in a hurry."),
    ],
    biomes=[
        Biome("micro_cytoplasm", "Cytoplasm Shallows", top="micro_cytogel", under="micro_membrane", temperature=0.0,
              humidity=0.5, elevation=-0.5, underwater="micro_matrix", grass_color="#c8b6e0",
              water_color="#7ad0c8", water_fog_color="#5ab8b0", particles=[("dust:#ffffff:0.7", 0.004)],
              ambient="bubbling", music="minecraft:music.under_water",
              features=[
                  Boulder(blocks=[("micro_vacuole", 1)], radius=(3, 6), hollow=True, where="underwater", count=1, chance=2),
                  Boulder(blocks=[("micro_mitochondrion", 1)], radius=(2, 4), squash=0.55, count=1, chance=2),
                  Patch(block="micro_ribosomes", count=4, tries=24),
                  Patch(block="micro_cilia", count=3, tries=24),
                  Patch(block="micro_cilia", where="underwater", count=4, tries=24),
                  Patch(block="micro_flagellum", count=3, where="cave_ceiling"),
              ],
              spawns=[Spawn("paramecium", 14, (2, 4)), Spawn("amoeba", 3, (1, 1)), Spawn("phage", 2, (1, 2))]),
        Biome("micro_nucleus_chamber", "Nucleus Chamber", top="micro_cytogel", under="micro_membrane", temperature=0.5,
              humidity=-0.2, elevation=0.2, grass_color="#b8a2d4", water_color="#9a84d8", water_fog_color="#5a4a8a",
              fog_color="#dccaf0", particles=[("dust:#9a6ac8:1.0", 0.005)], ambient="alien_hum",
              music="minecraft:music_disc.strad",
              features=[
                  NUCLEUS,
                  Structure(kind="tendril", blocks={"main": "micro_nucleus", "tip": "micro_nucleolus"}, size=(6, 10),
                            params={"curl": 0.8, "thickness": 0.7}, chance=3),
                  Boulder(blocks=[("micro_mitochondrion", 1)], radius=(2, 3), squash=0.55, count=1, chance=3),
                  Patch(block="micro_ribosomes", count=5, tries=24),
                  Patch(block="micro_vesicle_vent", count=1, tries=3, chance=3),
              ],
              spawns=[Spawn("amoeba", 6, (1, 2)), Spawn("paramecium", 6, (1, 3)), Spawn("phage", 3, (1, 2))]),
        Biome("micro_chloroplast_grove", "Chloroplast Grove", top="micro_cytogel", under="micro_membrane",
              stone="micro_membrane", temperature=-0.5, humidity=0.2, elevation=0.0, grass_color="#a0e080",
              water_color="#8ad8a0", water_fog_color="#3a8a5a", fog_color="#dcf0d8", sky_color="#eefae8",
              particles=[("dust:#a0e080:0.9", 0.006)], ambient="cozy_breeze", music="minecraft:music.overworld.lush_caves",
              surface_noise=[("micro_chloroplast", 0.62)],
              features=[
                  Boulder(blocks=[("micro_chloroplast", 1)], radius=(3, 5), squash=0.6, count=1),
                  Structure(kind="ring", blocks={"main": "micro_er_tube", "alt": "micro_chloroplast"}, size=(5, 8),
                            params={"thickness": 0.22, "sink": 0.2}, chance=3),
                  Patch(block="micro_cilia", count=6, tries=32),
                  Patch(block="micro_vesicle_vent", count=1, tries=3, chance=2),
              ],
              spawns=[Spawn("paramecium", 10, (2, 4)), Spawn("amoeba", 3, (1, 1))]),
        Biome("micro_viral_bloom", "Viral Bloom", top="micro_matrix", under="micro_matrix", temperature=-0.3,
              humidity=-0.7, elevation=0.3, grass_color="#8c74ac", water_color="#c8d82a", water_fog_color="#5a6a10",
              fog_color="#c0a8b8", fog_end=100, sky_color="#e0c8d8",
              surface_noise=[("micro_lysosome", 0.72)],
              particles=[("dust:#c8d82a:1.0", 0.004), ("minecraft:mycelium", 0.01)], ambient="wet_squelch",
              music="minecraft:music.overworld.deep_dark",
              features=[
                  Structure(kind="tendril", blocks={"main": "micro_er_tube", "tip": "micro_lysosome"}, size=(6, 11),
                            params={"curl": 0.4}, chance=2),
                  Boulder(blocks=[("micro_lysosome", 1), ("micro_matrix", 2)], radius=(2, 3), count=1, chance=2),
                  Patch(block="micro_flagellum", count=4, where="cave_ceiling"),
                  Patch(block="micro_ribosomes", count=2, tries=12),
              ],
              spawns=[Spawn("phage", 8, (2, 3)), Spawn("amoeba", 4, (1, 2))]),
    ],
    effects=["floaty"],
    ambient="bubbling",
    music="minecraft:music.under_water",
    platform="micro_membrane",
    icon="portalgun:micro_atp",
)
