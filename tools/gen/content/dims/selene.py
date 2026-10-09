"""L-1 Selene - the Moon: grey regolith, craters, a black sky with a big blue planet, and a black monolith."""
from gen.content.dsl import *

# palette: regolith greys, dark mare basalt, black sky, earth blue, moonstone pale blue, gold foil
P_REGOLITH = ["#6e6e72", "#828286", "#96969a", "#aaaaae", "#bebec2"]
P_ANOR = ["#7a7a80", "#8e8e94", "#a2a2a8", "#b6b6bc", "#cacad0"]
P_MARE = ["#26262c", "#303036", "#3a3a42", "#46464e", "#54545c"]
P_ICE = ["#8ab0d0", "#a8c8e4", "#c4dcf0", "#e0f0ff"]
P_MOONSTONE = ["#3a5a9a", "#5a80c8", "#80a8ec", "#b0d0ff", "#e8f4ff"]
P_GLASS = ["#1a2a1a", "#2a402a", "#3e5a3a", "#5a7a50"]
P_FOIL = ["#7a5a10", "#b08a20", "#e0b830", "#ffe070", "#fff4c0"]
EARTH = ["#0e2a6a", "#2a62c0", "#3a8a5a", "#e8f0ff"]
MOONSTONE = "#9ac0ff"


def _monolith(seed):
    """Perfectly black slab: almost no texture, a faint vertical sheen."""
    import numpy as np
    from PIL import Image
    from gen.noise import rng
    r = rng(seed)
    a = np.zeros((16, 16, 4))
    a[..., 3] = 255
    for y in range(16):
        for x in range(16):
            v = 6 + 5 * max(0.0, 1 - abs(x - 4.5) / 3) + r.random() * 1.5
            a[y, x, :3] = [v, v, v + 2]
    return Image.fromarray(a.clip(0, 255).astype("uint8"), "RGBA")


def _regolith(pal, seed):
    """Moon dust: fine grey sand pocked with tiny craters (dark pit, lit lower rim)."""
    import numpy as np
    from PIL import Image
    from gen.noise import rng
    from gen.textures import sand
    a = np.asarray(sand(pal, seed).convert("RGBA"), float).copy()
    r = rng(seed + ":pits")
    for _ in range(3):
        x, y = int(r.integers(1, 15)), int(r.integers(1, 14))
        a[y, x, :3] *= 0.72
        a[y + 1, x, :3] = np.minimum(255, a[y + 1, x, :3] * 1.18)
        a[y, x - 1, :3] *= 0.85
    return Image.fromarray(a.clip(0, 255).astype("uint8"), "RGBA")


DIMENSION = Dimension(
    id="selene",
    code="L-1",
    name="Selene",
    tagline="Magnificent desolation, low gravity included",
    description=("The Moon - or a moon very like it. Grey regolith rolls between craters under a black, star-filled sky "
                 "where a blue planet hangs forever. Every jump is a leap; ice and glowing moonstone hide in the shadowed "
                 "craters. Moon Hoppers bound between the rims and Crater Crabs keep to themselves. Somewhere out on the "
                 "Sea of Tranquility stands a black monolith that hums when you touch it."),
    danger=2,
    color=MOONSTONE,
    terrain=Terrain(style="craters", stone="selene_anorthosite", fluid="minecraft:air", sea_level=-63, height=70,
                    amplitude=14, roughness=0.05, deepslate="selene_mare_basalt", ores=False,
                    params={"cell_size": 120, "min_radius": 12, "max_radius": 44, "depth": 0.5, "rim": 0.32,
                            "probability": 0.7, "biome_size": 380}),
    sky=Sky(sky_color="#000000", fog_color="#020205", fog_start=220, fog_end=520, cloud_color=None, time="day",
            star_brightness=1.0, sky_light_color="#f4f4ff", ambient_light=0.05,
            bodies=[
                Celestial("planet", EARTH, size=72, yaw=200, pitch=32, roll=20, seed="selene-earth"),
                Celestial("galaxy", ["#0a0a20", "#4a4a80", "#c0c8ff"], size=180, yaw=40, pitch=60, roll=35, alpha=0.4,
                          additive=True, seed="selene-milkyway"),
            ]),
    blocks=[
        Block("selene_regolith", "Regolith", "soil", {"all": tex(_regolith, P_REGOLITH, "selene-regolith")}, hardness=0.5,
              sound="sand", map_color="color_light_gray"),
        Block("selene_anorthosite", "Anorthosite", "stone", {"all": tex("stone", P_ANOR, seed="selene-anor")}, hardness=1.5,
              map_color="color_light_gray"),
        Block("selene_mare_basalt", "Mare Basalt", "stone", {"all": tex("basalt_top", P_MARE, seed="selene-mare")},
              hardness=1.8, sound="basalt", map_color="color_gray"),
        Block("selene_moon_ice", "Crater Ice", "ice", {"all": tex("ice", P_ICE, seed="selene-ice")}, hardness=0.6,
              sound="glass", friction=0.98, map_color="ice"),
        Block("selene_monolith", "Monolith Slab", "stone", {"all": tex(_monolith, "selene-monolith")}, hardness=50.0,
              resistance=1200.0, sound="netherite_block", map_color="color_black"),
        Block("selene_moonstone", "Moonstone", "crystal_block", {"all": tex("crystal", P_MOONSTONE, seed="selene-moonstone")},
              hardness=1.5, light=10, emissive=True, map_color="color_light_blue"),
        Block("selene_moonstone_cluster", "Moonstone Cluster", "crystal_cluster",
              {"cross": tex("crystal_shard_sprite", P_MOONSTONE, seed="selene-cluster", count=3)}, hardness=0.5, light=7,
              emissive=True, sound="amethyst_cluster"),
        Block("selene_helium_ore", "Helium-3 Ore", "ore",
              {"all": tex("ore", tex("stone", P_ANOR, seed="selene-anor"), ["#4a7ab0", "#80c0ff", "#e0f8ff"],
                          seed="selene-he3")},
              hardness=3.0, light=3, drop="selene_helium_crystal", drop_count=(1, 2), xp=(2, 5), map_color="color_light_blue"),
        Block("selene_impact_glass", "Impact Glass", "stone", {"all": tex("obsidian_like", P_GLASS, seed="selene-glass")},
              hardness=0.4, sound="glass", map_color="color_green"),
        Block("selene_gold_foil", "Lander Foil", "solid", {"all": tex("metal", P_FOIL, seed="selene-foil")}, hardness=2.0,
              sound="metal", tool="pickaxe", map_color="gold"),
        Block("selene_silver_lichen", "Silver Lichen", "plant",
              {"cross": tex("grass_tuft", ["#5a6070", "#80889a", "#aab4c8", "#dce4f4"], seed="selene-lichen")},
              hardness=0.0, sound="moss", light=2),
        Block("selene_outgas_vent", "Outgassing Vent", "vent", {"top": tex("basalt_top", P_MARE[:3] + ["#9ac0ff"], seed="selene-vent"),
                                                               "side": tex("basalt_side", P_MARE, seed="selene-vent-side")},
              hardness=1.8, sound="basalt", particle="minecraft:white_ash", effect="minecraft:slow_falling",
              effect_seconds=6, map_color="color_gray"),
    ],
    items=[
        Item("selene_moon_cheese", "Moon Cheese", tex("item_icon", "cheese", ["#a0a070", "#e0dca0", "#fff8d0"],
                                                      seed="selene-cheese"),
             kind="food", food=Food(5, 0.6, always=True, effects=[Effect("minecraft:jump_boost", 30, 1),
                                                                  Effect("minecraft:slow_falling", 20, 0)]),
             lore="It was cheese all along."),
        Item("selene_helium_crystal", "Helium-3 Crystal", tex("item_icon", "crystal", P_MOONSTONE[1:], seed="selene-he3-item"),
             rarity="uncommon", lore="Fuel for a fusion reactor, or a very fancy balloon."),
    ],
    creatures=[
        Creature("moon_hopper", "Moon Hopper", "hopper", ["#e4e4ee", "#b8b8c8", "#9ab0ff", "#20204a"], pattern="speckle",
                 size=0.8,
                 body={"kind": "rabbit", "ears": "long", "eye_style": "cute", "blush": True, "antennae": 3,
                       "glow_tips": True, "tail": 1, "tail_kind": "puff", "leg_len": 6},
                 behavior="passive", health=8, speed=0.3, tempt="selene_moon_cheese",
                 drops=[Drop("selene_moon_cheese", 0, 1, chance=0.5), Drop("minecraft:rabbit_hide", 0, 1)],
                 sounds="rabbit", pitch=1.2, xp=2, group=4,
                 description="Bounds thirty blocks at a time and lands like a dandelion seed. Hoards cheese, somehow."),
        Creature("crater_crab", "Crater Crab", "crawler", ["#a2a2ae", "#6a6a78", MOONSTONE, "#101018"], pattern="speckle",
                 size=1.0,
                 body={"kind": "crab", "claws": True, "shell": True, "eyestalks": 2, "crystals": 3},
                 behavior="neutral", health=22, damage=4, armor=5, speed=0.2, abilities=["shield"],
                 drops=[Drop("selene_helium_crystal", 0, 1, chance=0.4), Drop("minecraft:bone_meal", 0, 2)],
                 sounds="armadillo", pitch=0.8, xp=5, group=3,
                 description="Grows moonstone on its back and scuttles crater rims. Pinch it and it pinches back."),
        Creature("lunar_moth", "Lunar Moth", "flyer", ["#dfe8ff", "#9ac0ff", "#ffffff", "#3a5a9a"], pattern="glow_lines",
                 size=0.9, body={"kind": "moth", "fluffy": True, "antennae": 4, "wing_span": 12},
                 behavior="passive", health=6, speed=0.2, abilities=["glow_aura"],
                 drops=[Drop("minecraft:glowstone_dust", 0, 1)],
                 sounds="allay", pitch=1.2, xp=2, group=3,
                 description="Pale wings that drink starlight. It glows faintly for hours after you touch it."),
    ],
    biomes=[
        Biome("selene_highlands", "Lunar Highlands", top="selene_regolith", under="selene_regolith", temperature=0.0,
              humidity=-0.2, elevation=0.3, grass_color="#9a9aa0", foliage_color="#aab4c8", water_color="#3a5a9a",
              particles=[], ambient="cosmic_drone",
              features=[
                  Boulder(blocks=[("selene_anorthosite", 4), ("selene_regolith", 1)], radius=(1, 3), squash=0.8, count=1,
                          chance=2),
                  Patch(block="selene_silver_lichen", count=1, tries=6, chance=2),
                  Structure(kind="monolith", blocks={"main": "selene_monolith"}, size=(6, 8), count=1, chance=48),
                  Ore(block="selene_helium_ore", size=6, count=6, y=(-50, 70)),
              ],
              spawns=[Spawn("moon_hopper", 10, (2, 4)), Spawn("crater_crab", 4, (1, 2)), Spawn("lunar_moth", 4, (1, 2))]),
        Biome("selene_mare", "Sea of Tranquility", top="selene_mare_basalt", under="selene_mare_basalt", temperature=0.5,
              humidity=0.4, elevation=-0.3, grass_color="#5a5a62", foliage_color="#aab4c8", water_color="#3a5a9a",
              particles=[], ambient="cosmic_drone", music="minecraft:music.end",
              surface_noise=[("selene_regolith", 0.45)],
              features=[
                  Structure(kind="monolith", blocks={"main": "selene_monolith"}, size=(7, 9), count=1, chance=14),
                  Structure(kind="cuboids", blocks={"main": "selene_gold_foil", "alt": "minecraft:white_concrete",
                                                    "trim": "minecraft:iron_block"},
                            size=(3, 4), params={"count": 2}, count=1, chance=40),
                  Boulder(blocks=[("selene_impact_glass", 2), ("selene_mare_basalt", 3)], radius=(1, 2), count=1, chance=3),
                  Patch(block="selene_outgas_vent", count=1, tries=3, chance=3),
                  Ore(block="selene_helium_ore", size=8, count=8, y=(-50, 70), replace=["selene_mare_basalt",
                                                                                     "selene_anorthosite"]),
              ],
              spawns=[Spawn("moon_hopper", 8, (2, 4)), Spawn("crater_crab", 5, (1, 3)), Spawn("lunar_moth", 3, (1, 2))]),
        Biome("selene_shadow_craters", "Shadowed Craters", top="selene_regolith", under="selene_anorthosite",
              temperature=-0.6, humidity=0.2, elevation=-0.6, grass_color="#7a8090", foliage_color="#aab4c8",
              water_color="#3a5a9a", particles=[("dust:#c4dcf0:0.5", 0.0015)], ambient="cosmic_drone",
              surface_noise=[("selene_moon_ice", 0.35)],
              features=[
                  Spire(blocks=[("selene_moon_ice", 3), ("selene_moonstone", 1)], tip="selene_moonstone_cluster",
                        height=(5, 13), radius=(1, 2), lean=0.25, count=1, chance=2),
                  CrystalCluster(block="selene_moonstone", small="selene_moonstone_cluster", size=(3, 6), count=1, chance=3),
                  Patch(block="selene_moonstone_cluster", count=2, tries=10),
              ],
              spawns=[Spawn("lunar_moth", 8, (1, 3)), Spawn("crater_crab", 4, (1, 2)), Spawn("moon_hopper", 4, (1, 3))]),
        Biome("selene_moonstone_fields", "Moonstone Fields", top="selene_regolith", under="selene_regolith",
              temperature=0.6, humidity=-0.6, grass_color="#9a9aa0", foliage_color="#aab4c8", water_color="#3a5a9a",
              particles=[("dust:#9ac0ff:0.6", 0.003)], ambient="crystal_chimes",
              surface_noise=[("selene_anorthosite", 0.55)],
              features=[
                  Geode(outer="selene_mare_basalt", middle="minecraft:calcite", inner="selene_moonstone",
                        crystals=["selene_moonstone_cluster"], chance=5, y=(42, 64)),
                  CrystalCluster(block="selene_moonstone", small="selene_moonstone_cluster", size=(3, 7), count=1, chance=2),
                  Patch(block="selene_silver_lichen", count=2, tries=10),
                  Ore(block="selene_helium_ore", size=8, count=10, y=(-50, 75)),
              ],
              spawns=[Spawn("crater_crab", 6, (1, 3)), Spawn("moon_hopper", 8, (2, 3)), Spawn("lunar_moth", 5, (1, 2))]),
    ],
    effects=["low_gravity"],
    music="minecraft:music.end",
    ambient="cosmic_drone",
    platform="selene_anorthosite",
    icon="portalgun:selene_moon_cheese",
)
