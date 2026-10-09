"""X-13 Spinelands - a thorn world: spike forests, needle trees, bone-white quills and brambles that bite."""
import math

import numpy as np
from PIL import Image

from gen.content.dsl import *
from gen.noise import fbm, rng

# palette: bruise-black thornwood, crimson, bone white, ashen olive, acid green, steel-green sky
P_THORNSTONE = ["#1e1420", "#2a1c2a", "#382636", "#463044", "#563c52"]
P_GRASS = ["#2e3220", "#3e4428", "#545a30", "#6a7238", "#86903e"]
P_SOIL = ["#24201c", "#322a24", "#40362c", "#4e4234"]
P_QUILL = ["#8a8270", "#b0a68e", "#cfc6ac", "#e8dcc0", "#fff6e4"]
P_BARK = ["#140a12", "#22121e", "#341a2c", "#4a2238"]
P_NEEDLE = ["#0e1e1c", "#16302a", "#20443a", "#2e5a48", "#4a7a5a"]
P_CRIMSON = ["#4a0818", "#7a0c24", "#a01c3c", "#d8304c", "#ff6a7a"]
P_ICHOR = ["#6a3a08", "#b06a10", "#f0a820", "#ffe070"]
CRIMSON = "#d8304c"
BONE = "#e8dcc0"


def _hex(c):
    c = c.lstrip("#")
    return np.array([int(c[i:i + 2], 16) for i in (0, 2, 4)], float)


def _img(a):
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8), "RGBA")


def thorn_bark(pal, tip, seed):
    """Near-black bark with vertical fibres and pale hooked thorns breaking through."""
    cols = [_hex(c) for c in pal]
    t = _hex(tip)
    n = fbm(16, 16, 4, seed, 2)
    R = rng(seed)
    a = np.zeros((16, 16, 4))
    a[..., 3] = 255
    for y in range(16):
        for x in range(16):
            v = (1 if x % 4 in (1, 2) else 0) + (1 if n[y, x] > 0.55 else 0) + (1 if n[y, x] > 0.75 else 0)
            a[y, x, :3] = cols[min(len(cols) - 1, v)]
    for k in range(5):
        x, y = int(R.integers(1, 15)), int(R.integers(2, 15))
        a[y, x, :3] = cols[-1]
        a[y - 1, x, :3] = t * 0.8
        a[y - 2, x + (1 if k % 2 else -1), :3] = t
    return _img(a)


def thorn_mass(pal, tip, seed):
    """A tangle of crossing thorny stems, crimson-tipped barbs everywhere (hazard block)."""
    cols = [_hex(c) for c in pal]
    t = _hex(tip)
    R = rng(seed)
    a = np.zeros((16, 16, 4))
    a[..., 3] = 255
    a[..., :3] = cols[0]
    for k in range(7):
        x0, y0 = R.uniform(0, 16), R.uniform(0, 16)
        ang = R.uniform(0, math.pi)
        dx, dy = math.cos(ang), math.sin(ang)
        for s in range(-12, 13):
            x, y = int(x0 + dx * s) % 16, int(y0 + dy * s) % 16
            a[y, x, :3] = cols[2 + (s % 3 == 0)]
            if s % 5 == 0:
                bx, by = (x + int(round(-dy * 1.5))) % 16, (y + int(round(dx * 1.5))) % 16
                a[by, bx, :3] = t
    return _img(a)


def thorn_litter(pal, seed):
    """Dark barbed soil strewn with shed pale thorns and a few crimson barb tips."""
    from gen.textures import dirt
    a = np.asarray(dirt(pal, seed).convert("RGBA"), float).copy()
    R = rng(seed + ":t")
    for k in range(3):
        x, y = int(R.integers(0, 16)), int(R.integers(0, 16))
        dx, dy = [(1, 1), (-1, 1), (1, 0), (0, 1)][int(R.integers(0, 4))]
        for i in range(2 + int(R.integers(0, 2))):
            xx, yy = (x + dx * i) % 16, (y + dy * i) % 16
            a[yy, xx, :3] = a[yy, xx, :3] * 0.4 + _hex(P_QUILL[2 - min(i, 2)]) * 0.6
    x, y = int(R.integers(0, 16)), int(R.integers(0, 16))
    a[y, x, :3] = a[y, x, :3] * 0.4 + _hex(P_CRIMSON[2]) * 0.6
    return _img(a)


def petals(pal, seed):
    """Giant bloodrose petal tissue: veined crimson with a dark heart and pale rim streaks."""
    cols = [_hex(c) for c in pal]
    n = fbm(16, 16, 6, seed, 3)
    a = np.zeros((16, 16, 4))
    a[..., 3] = 255
    for y in range(16):
        for x in range(16):
            vein = abs(math.sin((x + 0.6 * math.sin(y * 0.7)) * math.pi / 4))
            v = 1.5 + n[y, x] * 2.2 + (0.9 if vein < 0.18 else 0) - (1.0 if vein > 0.92 else 0)
            a[y, x, :3] = cols[int(max(0, min(len(cols) - 1, round(v))))]
    return _img(a)


def quills(pal, seed):
    """A spray of long bone-white quills fanning out from one point (crystal cluster sprite)."""
    cols = [_hex(c) for c in pal]
    R = rng(seed)
    a = np.zeros((16, 16, 4))
    for k in range(6):
        ang = math.radians(R.uniform(-70, 70)) - math.pi / 2
        ln = R.uniform(8, 14)
        for s in range(int(ln)):
            x = int(round(7.5 + math.cos(ang) * s))
            y = int(round(15 + math.sin(ang) * s))
            if 0 <= x < 16 and 0 <= y < 16:
                tip = s > ln - 3
                a[y, x, :3] = _hex(CRIMSON) if s > ln - 1.5 else cols[4 if tip else (2 + (k % 2))]
                a[y, x, 3] = 255
    return _img(a)


def bloodrose(seed):
    """A single crimson rose on a thorny dark stem."""
    a = np.zeros((16, 16, 4))
    stem = _hex("#2a1c2a")
    for y in range(7, 16):
        x = 8 + (1 if y in (10, 11) else 0)
        a[y, x, :3] = stem
        a[y, x, 3] = 255
        if y in (9, 13):
            a[y, x - 1, :3] = _hex(BONE)
            a[y, x - 1, 3] = 255
    for (lx, ly) in ((6, 12), (5, 12), (10, 10), (11, 9)):
        a[ly, lx, :3] = _hex(P_NEEDLE[3])
        a[ly, lx, 3] = 255
    cols = [_hex(c) for c in P_CRIMSON]
    for y in range(1, 8):
        for x in range(4, 13):
            d = math.hypot(x - 8, (y - 4.2) * 1.15)
            if d < 3.6:
                ang = math.atan2(y - 4.2, x - 8)
                k = int((d * 1.4 + ang * 0.8) % 3)
                a[y, x, :3] = cols[1 + k] if d > 0.9 else cols[0]
                a[y, x, 3] = 255
    return _img(a)


def _patch_spike_terrain():
    """Workaround for a framework bug (worldgen.Terrain._spikes): the spike profile is a df.lerp_spline whose first
    point has a non-zero derivative, and vanilla CubicSpline extrapolates linearly below its first point - so every
    column *between* the spikes (most of the map) is pushed tens of blocks down, to bedrock. Clamp the heightmap to
    the ground band for this dimension only (harmless once the framework fixes the spline)."""
    from gen.content import df, worldgen
    if getattr(worldgen.Terrain, "_spinelands_patched", False):
        return
    orig = worldgen.Terrain._spikes

    def _spikes(self):
        res = orig(self)
        if self.dim.id != "spinelands":
            return res
        t = self.t
        floor = float(t.height - 0.4 * t.amplitude - 3)
        H = df.col(df.max_(res["H"], floor))
        return {"D": self.surface(H, 0.4, 0.3), "H": H}

    worldgen.Terrain._spikes = _spikes
    worldgen.Terrain._spinelands_patched = True


_patch_spike_terrain()

NEEDLE_TREE = Tree(log="spinelands_thornwood", leaves="spinelands_needles", shape="pine", height=(10, 16),
                   decoration="spinelands_ichor_bulb", count=3)
NEEDLE_CONE = GiantPlant(stem="spinelands_thornwood", head="spinelands_needles", shape="cone", height=(14, 24),
                         radius=(3, 5), stem_width=1, count=1, chance=2)
THORN_TENDRIL = Structure(kind="tendril", blocks={"main": "spinelands_thorn_mass", "tip": "spinelands_thornwood"},
                          size=(9, 15), params={"curl": 0.8, "thickness": 0.9}, count=1, chance=3)
URCHIN = CrystalCluster(block="spinelands_thornwood", small="spinelands_quills", size=(4, 8), count=1, chance=3)
BONE_NEEDLE = Spire(blocks=[("spinelands_quill_block", 1)], tip="spinelands_quill_block", height=(16, 36), radius=(1, 2),
                    lean=0.5, count=2)

DIMENSION = Dimension(
    id="spinelands",
    code="X-13",
    name="Spinelands",
    tagline="Everything here has a point",
    description=("A world grown entirely of spikes: rock spires like teeth, black needle forests, bone-white quills "
                 "longer than a house and brambles that bite through boots. Deep in the hollows the bloodroses open "
                 "huge and beautiful and drip sweet amber ichor. Thorn Hogs bristle when you come close, Needle Birds "
                 "shoot quills from the treetops, and the Spine Crawlers climb whatever you are hiding on."),
    danger=4,
    color=CRIMSON,
    terrain=Terrain(style="spikes", stone="spinelands_thornstone", sea_level=58, height=70, amplitude=14, scale=1.0,
                    roughness=0.12, deepslate="minecraft:deepslate",
                    params={"density": 0.45, "spike_height": 50, "thin": 0.75, "biome_size": 300, "cliffs": True,
                            "cliff_block": "spinelands_thornstone", "peak_block": "spinelands_quill_block",
                            "peak_y": 108}),
    sky=Sky(sky_color="#93a49a", fog_color="#76867e", water_fog_color="#1e2a28", fog_start=22, fog_end=150,
            cloud_color="#a05a6a68", cloud_height=190, time=500, sunrise_color="#eea01c3c", star_brightness=0.3,
            sky_light_color="#f0e4e0", ambient_light=0.06,
            bodies=[Celestial("sun", ["#a01c3c", "#d8304c", BONE, "#ffffff"], size=34, yaw=275, pitch=12,
                              seed="spinelands-sun"),
                    Celestial("shattered_moon", ["#8a8270", "#cfc6ac", BONE], size=40, yaw=100, pitch=50, roll=25,
                              seed="spinelands-moon")]),
    blocks=[
        Block("spinelands_thornstone", "Thornstone", "stone", {"all": tex("stone", P_THORNSTONE, seed="spine-stone")},
              hardness=1.6, map_color="color_purple"),
        Block("spinelands_barbgrass", "Barbgrass", "grass", {
            "top": tex("grass_top", P_GRASS, seed="spine-grass"),
            "side": tex("grass_side", P_GRASS, P_SOIL, seed="spine-grass-side"),
            "bottom": tex("dirt", P_SOIL, seed="spine-soil")}, hardness=0.7, sound="grass", map_color="color_green"),
        Block("spinelands_soil", "Barbed Soil", "soil", {"all": tex(thorn_litter, P_SOIL, "spine-soil")}, hardness=0.6,
              sound="rooted_dirt", map_color="color_brown"),
        Block("spinelands_quill_gravel", "Quill Gravel", "soil", {"all": tex("gravel", P_QUILL, seed="spine-quillgravel")},
              hardness=0.6, sound="gravel", map_color="sand"),
        Block("spinelands_quill_block", "Quill Bone", "stone", {"all": tex("bone", P_QUILL, seed="spine-quillbone")},
              hardness=1.8, sound="bone_block", map_color="sand"),
        Block("spinelands_thornwood", "Thornwood", "log", {
            "side": tex(thorn_bark, P_BARK, BONE, "spine-bark"),
            "end": tex("log_top", P_BARK, ["#5a2a40", "#3a1a2a"], seed="spine-bark-end")}, hardness=2.2, sound="wood",
              map_color="color_black", flammable=True),
        Block("spinelands_needles", "Needle Foliage", "leaves", {"all": tex("leaves", P_NEEDLE, seed="spine-needles",
                                                                           holes=0.35)},
              hardness=0.3, sound="leaves", map_color="color_cyan"),
        Block("spinelands_thorn_mass", "Thorn Mass", "hazard", {"all": tex(thorn_mass, P_BARK, CRIMSON, "spine-mass")},
              hardness=1.2, sound="wood", tool="axe", damage=2, damage_type="cactus", map_color="color_black",
              flammable=True),
        Block("spinelands_bramble", "Razor Bramble", "plant", {"cross": tex("thorn_bush", P_BARK[1:] + [BONE],
                                                                           seed="spine-bramble")},
              hardness=0.0, sound="sweet_berry_bush", damage=1.5, damage_type="sweet_berry_bush", map_color="color_black"),
        Block("spinelands_thorn_vine", "Thorn Vine", "vine", {"face": tex("vine_overlay", P_CRIMSON[:4], seed="spine-vine")},
              hardness=0.2, sound="vine", damage=1, damage_type="sweet_berry_bush", map_color="color_red"),
        Block("spinelands_bloodrose", "Bloodrose", "plant", {"cross": tex(bloodrose, "spine-rose")}, hardness=0.0,
              sound="grass", fruit="spinelands_rose_hip", light=2, map_color="color_red"),
        Block("spinelands_bloodrose_petal", "Bloodrose Petal", "mushroom_cap", {"all": tex(petals, P_CRIMSON, "spine-petal")},
              hardness=0.4, sound="wart_block", light=4, map_color="color_red"),
        Block("spinelands_ichor_bulb", "Ichor Bulb", "hanging_plant", {"cross": tex("bulb", P_BARK[1:], P_ICHOR,
                                                                                   seed="spine-ichor")},
              hardness=0.0, sound="cave_vines", light=11, emissive=True, particle="minecraft:dripping_honey",
              map_color="color_orange"),
        Block("spinelands_quills", "Quill Spray", "crystal_cluster", {"cross": tex(quills, P_QUILL, "spine-quills")},
              hardness=0.3, sound="bone_block", map_color="sand"),
    ],
    items=[
        Item("spinelands_hog_quill", "Hog Quill", tex("item_icon", "fang", P_QUILL[1:] + [CRIMSON], seed="spine-quill"),
             lore="Barbed both ways. Pull it out slowly. No, slower."),
        Item("spinelands_rose_hip", "Rose Hip", tex("item_icon", "berry", P_CRIMSON[1:], seed="spine-hip"), kind="food",
             food=Food(3, 0.5, effects=[Effect("minecraft:regeneration", 6, 1), Effect("minecraft:poison", 2, 0, chance=0.3)]),
             lore="Sweet, tart and only slightly stabby."),
        Item("spinelands_needle_feather", "Needle Feather", tex("item_icon", "feather", ["#2a1a2a", "#a01c3c", BONE],
                                                                 seed="spine-feather"),
             rarity="uncommon", lore="Each barb is sharp enough to sew with. Several have."),
    ],
    creatures=[
        Creature("thorn_hog", "Thorn Hog", "quadruped", ["#6a3a3a", "#3a1e22", BONE, "#ff4a20"], pattern="speckle",
                 size=1.15,
                 body={"tusks": True, "snout": 3, "leg_len": 5, "leg_w": 3, "body_len": 16, "body_h": 9, "body_w": 11,
                       "spikes": 9, "crystals": 6, "ears": "pointy", "tail": 1, "tail_kind": "curl", "eye_style": "angry",
                       "brows": True, "head_size": 1.05},
                 behavior="neutral", health=34, damage=6, armor=4, speed=0.27, abilities=["thorns", "charge"],
                 tempt="spinelands_rose_hip",
                 drops=[Drop("spinelands_hog_quill", 1, 3), Drop("minecraft:porkchop", 1, 2, cooked="minecraft:cooked_porkchop")],
                 sounds="hoglin", pitch=1.05, xp=8, group=3,
                 description="A walking pincushion with a temper. Hug it at your own risk - it bristles back."),
        Creature("needle_bird", "Needle Bird", "flyer", ["#a01c3c", "#2a1a2a", BONE, "#ffd040"], pattern="plain",
                 size=0.8,
                 body={"kind": "bird", "beak": 6, "crest": True, "spikes": 4, "tail": 2, "tail_kind": "feather",
                       "wing_span": 12, "eye_style": "angry"},
                 behavior="hostile", attack="ranged", health=10, damage=2, speed=0.3,
                 ranged={"color": BONE, "damage": 3, "count": 3, "spread": 0.12, "cooldown": 45, "speed": 1.8,
                         "size": 0.1},
                 drops=[Drop("spinelands_needle_feather", 0, 2), Drop("minecraft:feather", 0, 1)],
                 sounds="parrot", pitch=0.6, xp=6, group=3,
                 description="Nests in the needle trees and fires its own quills at intruders, three at a time."),
        Creature("spine_crawler", "Spine Crawler", "crawler", ["#a01c3c", "#2a1420", BONE, "#ffcc30"], pattern="stripes",
                 size=1.0,
                 body={"kind": "centipede", "segments": 8, "spikes": 8, "mandibles": True, "eyes": 4,
                       "eye_style": "glow", "crystals": 4, "antennae": 5, "leg_len": 5},
                 behavior="hostile", health=20, damage=4, speed=0.3, abilities=["climb"],
                 on_hit=Effect("minecraft:poison", 4), spawn_light="dark",
                 drops=[Drop("minecraft:string", 0, 2), Drop("spinelands_hog_quill", 0, 1, chance=0.3)],
                 sounds="silverfish", pitch=0.6, xp=7, group=2,
                 description="Forty legs, eighty barbs, and it climbs straight up the spikes after you."),
    ],
    biomes=[
        Biome("spinelands_needle_forest", "Needle Forest", top="spinelands_barbgrass", under="spinelands_soil",
              temperature=0.0, humidity=0.3, grass_color="#545a30", foliage_color="#20443a", water_color="#2a4a44",
              water_fog_color="#1e2a28", particles=[("minecraft:ash", 0.004)], ambient="wind_howl",
              music="minecraft:music.overworld.old_growth_taiga",
              features=[
                  NEEDLE_TREE,
                  NEEDLE_CONE,
                  Patch(block="spinelands_bramble", count=1, tries=10),
                  Patch(block="spinelands_thorn_vine", count=2, tries=24),
                  Patch(block="spinelands_quills", count=1, tries=6),
                  Patch(block="spinelands_ichor_bulb", count=2, where="cave_ceiling"),
              ],
              spawns=[Spawn("needle_bird", 6, (1, 3)), Spawn("thorn_hog", 6, (1, 3)), Spawn("spine_crawler", 3, (1, 2))]),
        Biome("spinelands_bramblewaste", "Bramblewaste", top="spinelands_soil", under="spinelands_soil", temperature=0.8,
              humidity=-0.4, grass_color="#3e4428", foliage_color="#16302a", water_color="#3a2a34", fog_color="#6a6a68",
              particles=[("minecraft:crimson_spore", 0.006)], ambient="dark_void",
              music="minecraft:music.nether.crimson_forest",
              surface_noise=[("spinelands_barbgrass", 0.55)],
              features=[
                  THORN_TENDRIL,
                  URCHIN,
                  Patch(block="spinelands_bramble", count=4, tries=24),
                  Patch(block="spinelands_thorn_vine", count=3, tries=24),
                  Boulder(blocks=[("spinelands_thorn_mass", 3), ("spinelands_thornwood", 1)], radius=(2, 3), squash=0.7,
                          count=1, chance=2),
              ],
              spawns=[Spawn("spine_crawler", 8, (1, 2)), Spawn("needle_bird", 3, (1, 2)), Spawn("thorn_hog", 4, (1, 2))]),
        Biome("spinelands_quill_barrens", "Quill Barrens", top="spinelands_quill_gravel", under="spinelands_soil",
              temperature=-0.7, humidity=-0.6, elevation=0.3, stone="spinelands_quill_block", grass_color="#86903e",
              foliage_color="#2e5a48", water_color="#5a6a68", sky_color="#a4b0a6", fog_color="#9aa49c",
              particles=[("minecraft:white_ash", 0.006)], ambient="wind_howl",
              music="minecraft:music.overworld.stony_peaks",
              features=[
                  BONE_NEEDLE,
                  Spire(blocks=[("spinelands_quill_block", 3), ("spinelands_thornstone", 1)], height=(8, 18),
                        radius=(2, 3), lean=0.2, count=1),
                  Patch(block="spinelands_quills", count=3, tries=12),
                  Patch(block="spinelands_bramble", count=1, tries=6, chance=2),
              ],
              spawns=[Spawn("thorn_hog", 10, (2, 4)), Spawn("needle_bird", 2, (1, 2))]),
        Biome("spinelands_bloodrose_hollow", "Bloodrose Hollow", top="spinelands_barbgrass", under="spinelands_soil",
              temperature=-0.2, humidity=0.9, elevation=-0.4, grass_color="#6a3a30", foliage_color="#7a0c24",
              water_color="#7a1a30", water_fog_color="#3a0a18", fog_color="#8a6a70", sky_color="#a89098",
              particles=[("minecraft:cherry_leaves", 0.002), ("dust:#d8304c:0.7", 0.004)], ambient="eerie_choir",
              music="minecraft:music.overworld.lush_caves",
              features=[
                  GiantPlant(stem="spinelands_thornwood", head="spinelands_bloodrose_petal", shape="flower",
                             height=(9, 16), radius=(4, 6), bend=0.35, decoration="spinelands_ichor_bulb", count=1),
                  GiantPlant(stem="spinelands_thornwood", head="spinelands_bloodrose_petal", shape="flower",
                             height=(5, 8), radius=(2, 3), bend=0.2, count=1),
                  Patch(block="spinelands_bloodrose", count=6, tries=24),
                  Patch(block="spinelands_bramble", count=1, tries=8),
                  Patch(block="spinelands_thorn_vine", count=2, tries=20),
              ],
              spawns=[Spawn("thorn_hog", 6, (1, 3)), Spawn("needle_bird", 2, (1, 2)), Spawn("spine_crawler", 2, (1, 1))]),
    ],
    effects=[],
    ambient="wind_howl",
    music="minecraft:music.overworld.old_growth_taiga",
    icon="portalgun:spinelands_hog_quill",
)
