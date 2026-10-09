"""U-0 Umbra - the shadow realm: lightless caverns threaded with glowing crystal trails, where the dark itself pulses."""
from dataclasses import replace

import numpy as np
from PIL import Image

from gen import textures as T
from gen.content.dsl import *
from gen.noise import rng

P_SHADOW = ["#0a0810", "#110e19", "#181423", "#211c30", "#2c2640"]
P_MOSS = ["#140f22", "#1d1630", "#281e40", "#342852", "#403264"]
P_SILT = ["#0e0c14", "#16131e", "#1f1b29", "#292435"]
P_LUMEN = ["#1a6a88", "#2ab4d0", "#5ae8f4", "#a8fcff", "#f0ffff"]
P_NIGHT = ["#120a22", "#1e1236", "#2c1c4c", "#3e2a66"]
P_WRAITH = ["#6a5a9a", "#9a88c8", "#cbbcf0", "#efe8ff"]


def _hex(c):
    c = c.lstrip("#")
    return np.array([int(c[i:i + 2], 16) for i in (0, 2, 4)], float)


def _img(a):
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8), "RGBA")


def gloom_moss(pal, glint, seed):
    """Near-black violet moss with a few faint cyan spore glints."""
    a = np.array(T.moss(pal, seed).convert("RGBA"), float)
    R = rng(seed + ":glint")
    for _ in range(int(R.integers(2, 4))):
        x, y = int(R.integers(0, 16)), int(R.integers(0, 16))
        a[y, x, :3] = _hex(glint)
    return _img(a)


def lumen_trail(pal, seed):
    """Branching glowing crystal veins crawling across a face (multiface 'vine' texture)."""
    R = rng(seed)
    cols = [_hex(c) for c in pal]
    a = np.zeros((16, 16, 4), float)
    pts = [(R.uniform(0, 16), 0.0, R.uniform(0.6, 1.2))]
    for k in range(5):
        x, y = R.uniform(2, 14), R.uniform(2, 14)
        ang = R.uniform(0, np.pi * 2)
        for s in range(int(R.integers(7, 13))):
            xi, yi = int(x) % 16, int(y) % 16
            a[yi, xi, :3] = cols[3] if s % 3 else cols[4]
            a[yi, xi, 3] = 255
            for (dx, dy) in ((1, 0), (0, 1)):
                if a[(yi + dy) % 16, (xi + dx) % 16, 3] == 0 and R.random() < 0.5:
                    a[(yi + dy) % 16, (xi + dx) % 16, :3] = cols[1]
                    a[(yi + dy) % 16, (xi + dx) % 16, 3] = 255
            ang += R.uniform(-0.8, 0.8)
            x += np.cos(ang)
            y += np.sin(ang)
            if R.random() < 0.15:  # a small crystal bud
                a[(yi - 1) % 16, xi, :3] = cols[2]
                a[(yi - 1) % 16, xi, 3] = 255
    return _img(a)


def void_tar(seed):
    """Glossy black tar with slow violet oil-sheen swirls."""
    R = rng(seed)
    yy, xx = np.mgrid[0:16, 0:16]
    ph = R.uniform(0, 6)
    s = np.sin(xx * 0.5 + np.sin(yy * 0.4 + ph) * 2) * 0.5 + 0.5
    a = np.zeros((16, 16, 4), float)
    a[..., 3] = 255
    base = np.array([6, 4, 10], float)
    sheen = np.array([60, 30, 90], float)
    a[..., :3] = base + sheen * (s ** 6)[..., None]
    for (x, y) in ((4, 3), (5, 3), (11, 9)):
        a[y, x, :3] = (150, 120, 200)
    return _img(a)


LUMEN_SPIRE = Spire(blocks=[("umbra_lumen_crystal", 3), ("umbra_nightglass", 1)], tip="umbra_lumen_crystal",
                    height=(8, 22), radius=(1, 3), lean=0.15, count=1, chance=2)
HANGING = Spire(blocks=[("umbra_shadowstone", 3), ("umbra_nightglass", 1)], tip="umbra_lumen_crystal",
                height=(6, 16), radius=(1, 3), hanging=True, where="cave_ceiling", count=1)
TRAILS = [Patch(block="umbra_lumen_vein", count=10, tries=64, spread=8, where="cave_floor"),
          Patch(block="umbra_lumen_vein", count=4, tries=32, where="cave_ceiling")]

DIMENSION = Dimension(
    id="umbra",
    code="U-0",
    name="Umbra",
    tagline="Where light goes to be eaten",
    description=("A realm of caverns so dark that your torch seems to shrink. Trails of living crystal glow in "
                 "the black like veins, leading - maybe - somewhere, and gentle Glimmers carry their own light "
                 "through the galleries. Every so often the darkness pulses and swallows your sight. Umbral "
                 "Hounds hunt by smell, and the Shades only move when the light goes out."),
    danger=5,
    color="#5ae8f4",
    terrain=Terrain(style="caves", stone="umbra_shadowstone", sea_level=30, height=72, amplitude=22, roughness=0.35,
                    deepslate=None, ores=True, bedrock_roof=True,
                    params={"openness": 0.55, "pillars": 0.4, "shelves": 0.35, "biome_size": 220,
                            "ceiling_block": "umbra_shadowstone"}),
    sky=Sky(sky_color="#000000", fog_color="#07060d", water_fog_color="#040208", fog_start=4, fog_end=64,
            cloud_color=None, skybox="none", has_skylight=False, ambient_light=0.05, time="midnight"),
    blocks=[
        Block("umbra_shadowstone", "Shadowstone", "stone", {"all": tex("stone", P_SHADOW, seed="umbra-stone")},
              hardness=2.2, resistance=9, sound="deepslate", map_color="color_black"),
        Block("umbra_gloom_moss", "Gloom Moss", "grass", {
            "top": tex(gloom_moss, P_MOSS, "#5ae8f4", "umbra-moss"),
            "side": tex("grass_side", P_MOSS, P_SILT, seed="umbra-moss-side"),
            "bottom": tex("dirt", P_SILT, seed="umbra-silt")}, hardness=0.6, sound="moss", map_color="color_purple"),
        Block("umbra_umbral_silt", "Umbral Silt", "soil", {"all": tex("dirt", P_SILT, seed="umbra-silt")},
              hardness=0.5, sound="soul_soil", speed=0.85, map_color="color_black"),
        Block("umbra_lumen_crystal", "Lumen Crystal", "crystal_block",
              {"all": tex("crystal", P_LUMEN, seed="umbra-lumen")}, hardness=1.5, sound="amethyst", light=13,
              emissive=True, map_color="color_cyan"),
        Block("umbra_lumen_shard", "Lumen Shard", "crystal_cluster",
              {"cross": tex("crystal_shard_sprite", P_LUMEN[1:], seed="umbra-shard")}, hardness=0.8,
              sound="amethyst_cluster", light=9, emissive=True, map_color="color_cyan"),
        Block("umbra_lumen_vein", "Lumen Trail", "vine", {"face": tex(lumen_trail, P_LUMEN, "umbra-trail")},
              hardness=0.2, sound="sculk_vein", light=6, emissive=True, map_color="color_cyan"),
        Block("umbra_glimmer_moss", "Glimmer Moss", "glow",
              {"all": tex(gloom_moss, ["#14324a", "#1c4a64", "#26647e", "#2e8098", "#3aa0b4"], "#c8ffff",
                          "umbra-glimmer-moss")},
              hardness=0.6, sound="moss", tool="hoe", light=5, emissive=True, map_color="color_cyan"),
        Block("umbra_nightglass", "Nightglass", "glass", {"all": tex("glass", P_NIGHT, seed="umbra-nightglass",
                                                                     inner_alpha=150)},
              hardness=1.2, sound="glass", light=2, map_color="color_purple"),
        Block("umbra_shadow_vent", "Shadow Vent", "vent", {
            "top": tex("obsidian_like", ["#020104", "#08060e", "#140e20", "#2a1e40", "#5a3a8a"], seed="umbra-vent"),
            "side": tex("stone", P_SHADOW, seed="umbra-stone")}, hardness=2.0, sound="deepslate",
              particle="minecraft:squid_ink", effect="minecraft:darkness", effect_seconds=8,
              map_color="color_black"),
        Block("umbra_void_tar", "Void Tar", "hazard", {"all": tex(void_tar, "umbra-tar")}, hardness=1.0,
              sound="honey", tool="shovel", damage=1.0, damage_type="wither", effect="minecraft:blindness",
              effect_seconds=3, speed=0.5, map_color="color_black"),
        Block("umbra_wraithcap", "Wraithcap", "plant",
              {"cross": tex("mushroom_sprite", P_WRAITH, ["#3a3050", "#5a4c78", "#7a6aa0"], seed="umbra-wraithcap",
                            shape="cluster")},
              hardness=0.0, sound="fungus", light=5, emissive=True),
        Block("umbra_gloom_bulb", "Gloom Bulb", "hanging_plant",
              {"cross": tex("bulb", ["#14101e", "#241c34", "#342a4a"], P_LUMEN[1:], seed="umbra-bulb")},
              hardness=0.0, sound="cave_vines", light=11, emissive=True, fruit="umbra_lumen_berry"),
    ],
    items=[
        Item("umbra_lumen_berry", "Lumen Berry", tex("item_icon", "berry", P_LUMEN[1:], seed="umbra-berry",
                                                     accent="#241c34"),
             kind="food", food=Food(3, 0.4, always=True, effects=[Effect("minecraft:night_vision", 90, 0)]),
             lore="Eat one and the dark steps back. A little."),
        Item("umbra_glimmer_mote", "Glimmer Mote", tex("item_icon", "orb", ["#2ab4d0", "#7ff8ff", "#d8ffff",
                                                                            "#ffffff"], seed="umbra-mote"),
             rarity="uncommon", glint=True, lore="Warm in your hand, like it is glad you are there."),
        Item("umbra_shade_essence", "Shade Essence", tex("item_icon", "goo", ["#050308", "#1a1426", "#4a2a7a",
                                                                              "#b080ff"], seed="umbra-essence"),
             rarity="rare", lore="Colder than it should be, and heavier than it looks."),
    ],
    creatures=[
        Creature("shade", "Shade", "biped", ["#06050b", "#161222", "#b080ff", "#f4f0ff"], pattern="glow_lines",
                 size=1.3,
                 body={"thin": True, "arms": 2, "arm_len": 18, "head": "long", "eye_style": "glow", "eyes": 2,
                       "mouth": "none", "claws": True, "translucent": True, "stance": "hunched", "belly": False},
                 behavior="hostile", health=40, damage=8, speed=0.32, armor=2, abilities=["blink"],
                 on_hit=Effect("minecraft:blindness", 4), spawn_light="dark",
                 drops=[Drop("umbra_shade_essence", 0, 1, chance=0.6)], sounds="warden", pitch=1.3, xp=20, group=1,
                 description="A gap in the dark the shape of a person. It is always one step outside your light."),
        Creature("umbral_hound", "Umbral Hound", "quadruped", ["#0c0a14", "#221a32", "#5ae8f4", "#a8fcff"],
                 pattern="veins", size=1.05,
                 body={"leg_len": 9, "body_len": 14, "body_h": 7, "body_w": 7, "snout": 5, "ears": "pointy",
                       "mouth": "fangs", "eye_style": "glow", "eyes": 4, "spikes": 6, "tail": 2, "tail_kind": "thin",
                       "neck": 2, "claws": True},
                 behavior="hostile", health=22, damage=6, speed=0.36, abilities=["leap", "swarm"], spawn_light="dark",
                 drops=[Drop("minecraft:bone", 0, 2), Drop("umbra_shade_essence", 0, 1, chance=0.08)],
                 sounds="zoglin", pitch=1.25, xp=10, group=3,
                 description="Four glowing eyes and no smell of its own. You hear the pack long before you see it."),
        Creature("glimmer", "Glimmer", "floater", ["#bff8ff", "#5ae8f4", "#ffffff", "#1a4a5a"], pattern="gradient",
                 size=0.7, body={"kind": "wisp", "motes": 6, "body_w": 6, "translucent": True, "eye_style": "cute",
                                 "hover": 2.5},
                 behavior="passive", health=6, speed=0.14, emissive=True, abilities=["glow_aura"],
                 drops=[Drop("umbra_glimmer_mote", 0, 1)], sounds="allay", pitch=1.4, xp=3, group=3,
                 description="A shy little light. Stay near one and the hounds keep their distance."),
    ],
    biomes=[
        Biome("umbra_lumen_galleries", "Lumen Galleries", top="umbra_gloom_moss", under="umbra_umbral_silt",
              temperature=0.5, humidity=0.4, water_color="#14102a", water_fog_color="#040208", fog_end=64,
              particles=[("minecraft:glow", 0.004), ("dust:#5ae8f4:0.6", 0.006)], ambient="crystal_chimes",
              music="minecraft:music.overworld.deep_dark", surface_noise=[("umbra_glimmer_moss", 0.4)],
              features=TRAILS + [
                  LUMEN_SPIRE,
                  HANGING,
                  CrystalCluster(block="umbra_lumen_crystal", small="umbra_lumen_shard", size=(3, 6), count=1,
                                 where="cave_floor"),
                  Patch(block="umbra_lumen_shard", count=3, tries=16),
                  Patch(block="umbra_wraithcap", count=2, tries=12),
                  Patch(block="umbra_gloom_bulb", count=3, where="cave_ceiling"),
              ],
              spawns=[Spawn("glimmer", 14, (2, 4)), Spawn("umbral_hound", 3, (2, 3)), Spawn("shade", 1, (1, 1))]),
        Biome("umbra_black_hollows", "Black Hollows", top="umbra_umbral_silt", under="umbra_umbral_silt",
              temperature=-0.5, humidity=-0.5, water_color="#08040e", water_fog_color="#020104", fog_color="#040308",
              fog_end=30, particles=[("minecraft:squid_ink", 0.002), ("minecraft:ash", 0.01)], ambient="dark_void",
              music="minecraft:music.overworld.deep_dark", surface_noise=[("umbra_void_tar", 0.62)],
              features=[
                  Patch(block="umbra_shadow_vent", count=2, tries=6),
                  Structure(kind="tendril", blocks={"main": "umbra_nightglass", "tip": "umbra_lumen_crystal"},
                            size=(6, 12), params={"curl": 0.7}, count=1, chance=2),
                  Patch(block="umbra_lumen_vein", count=2, tries=24, where="cave_floor"),
                  replace(HANGING, chance=3),
                  Patch(block="umbra_wraithcap", count=1, tries=8),
              ],
              spawns=[Spawn("umbral_hound", 8, (2, 4)), Spawn("shade", 5, (1, 1)), Spawn("glimmer", 2, (1, 1))]),
        Biome("umbra_nightglass_reach", "Nightglass Reach", top="umbra_gloom_moss", under="umbra_shadowstone",
              temperature=0.6, humidity=-0.6, water_color="#14102a", water_fog_color="#040208",
              particles=[("dust:#b080ff:0.7", 0.006)], ambient="eerie_choir",
              music="minecraft:music.overworld.deep_dark", surface_noise=[("umbra_glimmer_moss", 0.48), ("umbra_shadowstone", 0.4)],
              features=TRAILS + [
                  Geode(outer="umbra_shadowstone", middle="umbra_nightglass", inner="umbra_lumen_crystal",
                        crystals=["umbra_lumen_shard"], count=1, chance=3, where="anywhere", y=(20, 150)),
                  Spire(blocks=[("umbra_nightglass", 3), ("umbra_shadowstone", 1)], tip="umbra_lumen_crystal",
                        height=(8, 18), radius=(1, 2), lean=0.3, count=1),
                  Structure(kind="monolith", blocks={"main": "umbra_shadowstone"}, size=(4, 7), count=1, chance=4),
                  Patch(block="umbra_wraithcap", count=3, tries=16),
              ],
              spawns=[Spawn("glimmer", 6, (1, 3)), Spawn("umbral_hound", 5, (2, 3)), Spawn("shade", 2, (1, 1))]),
        Biome("umbra_inkwell_shores", "Inkwell Shores", top="umbra_gloom_moss", under="umbra_umbral_silt",
              temperature=-0.6, humidity=0.6, underwater="umbra_umbral_silt", water_color="#06030c",
              water_fog_color="#010003", particles=[("minecraft:glow", 0.002)], ambient="deep_ocean",
              music="minecraft:music.overworld.deep_dark", surface_noise=[("umbra_glimmer_moss", 0.5)],
              features=TRAILS[:1] + [
                  Patch(block="umbra_gloom_bulb", count=6, where="cave_ceiling"),
                  Patch(block="umbra_wraithcap", count=4, tries=20),
                  replace(HANGING, chance=2),
                  Patch(block="umbra_lumen_shard", count=2, tries=10, where="underwater"),
              ],
              spawns=[Spawn("glimmer", 10, (1, 3)), Spawn("umbral_hound", 4, (2, 3)), Spawn("shade", 2, (1, 1))]),
    ],
    effects=["darkness"],
    ambient="dark_void",
    music="minecraft:music.overworld.deep_dark",
    icon="portalgun:umbra_glimmer_mote",
)
