"""W-81 Abyssia - an endless night ocean lit from below by glowing reefs."""
from gen.content.dsl import *

# palette: abyss navy, deep teal, glow cyan, coral magenta, pearl white, lantern gold
P_REEF = ["#0a1a2c", "#10283e", "#183852", "#224a66", "#2e5e7c"]
P_SILT = ["#0a1424", "#101e32", "#182a42", "#223852"]
P_PEARL_SAND = ["#9aa8c0", "#b6c2d6", "#d0d8e6", "#e8eef6"]
P_CYAN = ["#0b4f6c", "#118a9a", "#20c0c0", "#3ff0e0", "#b0fff6"]
P_MAGENTA = ["#5a1048", "#9a1e72", "#d6338e", "#ff4fa8", "#ffb0dc"]
P_KELP = ["#1a3a1e", "#24502a", "#2e6a34", "#3c8442", "#5aa85a"]
P_FROND = ["#1e4a2a", "#2a6a3a", "#38884a", "#4aa860", "#7ad08a"]
P_SHELL = ["#6a5a7a", "#8a7a9a", "#b0a0c0", "#d6cce4", "#f2ecf8"]
P_PEARL = ["#c8d8f0", "#e0ecfa", "#f4f8ff", "#ffffff"]
P_GOLD = ["#8a6a1a", "#c8962a", "#ffcf5a", "#fff0b0"]


def _clam_shell(pal, seed):
    """Fluted clam shell: radiating ridges with growth bands."""
    import math
    import numpy as np
    from PIL import Image
    from gen.noise import fbm
    from gen.textures import pal as P
    cols = np.array([[int(c[i:i + 2], 16) for i in (1, 3, 5)] for c in P(pal)], float)
    n = fbm(16, 16, 6, seed, 2)
    out = np.zeros((16, 16, 4))
    for y in range(16):
        for x in range(16):
            ridge = 0.5 + 0.5 * math.cos((x + 0.5) * 2 * math.pi / 4.0)     # vertical flutes
            band = 1.0 if (y % 5) == 0 else 0.0                            # growth lines
            v = 0.25 + 0.55 * ridge - 0.35 * band + 0.25 * (n[y, x] - 0.5)
            i = int(max(0, min(len(cols) - 1, round(v * (len(cols) - 1)))))
            out[y, x, :3] = cols[i]
            out[y, x, 3] = 255
    return Image.fromarray(out.astype("uint8"), "RGBA")


DIMENSION = Dimension(
    id="abyssia",
    code="W-81",
    name="Abyssia",
    tagline="An endless ocean that glows from below",
    description=("A planet without continents: one warm, endless ocean under a ringed moon, its reefs glowing cyan "
                 "and magenta through the dark water, and the sea is strangely breathable. Giant kelp rises like "
                 "cathedral columns, leviathan bones and pearl clams litter the trench floor. Lantern Eels light "
                 "the way - the Deep Maw waits where the light runs out."),
    danger=2,
    color="#3ff0e0",
    terrain=Terrain(style="ocean", stone="abyssia_reefrock", sea_level=63, height=40, amplitude=14, roughness=0.12,
                    caves=False, ores=True,
                    params={"depth": 30, "atolls": 0.05, "ridges": 0.85, "beach_block": "abyssia_pearl_sand",
                            "beach_height": 2, "biome_size": 300}),
    sky=Sky(sky_color="#0a1e44", fog_color="#0e3358", water_fog_color="#06304a", cloud_color="#6a4a8ab0",
            cloud_height=170, time="night", star_brightness=1.0, moon_phase="full_moon", ambient_light=0.28,
            bodies=[
                Celestial("ringed_planet", ["#13405e", "#2f9ab8", "#bff4ff"], size=95, yaw=200, pitch=24, roll=-12,
                          seed="abyssia-ring"),
                Celestial("moon", ["#ffd6ec", "#c890b4", "#7a5078"], size=18, yaw=70, pitch=52, seed="abyssia-moon2"),
                Celestial("nebula", ["#1a8aa0", "#3ff0e0", "#ff4fa8"], size=170, yaw=320, pitch=62, alpha=0.55,
                          additive=True, seed="abyssia-nebula"),
            ]),
    blocks=[
        Block("abyssia_pearl_sand", "Pearl Sand", "sand", {"all": tex("sand", P_PEARL_SAND, seed="abyssia-sand")},
              hardness=0.5, sound="sand", map_color="color_light_gray"),
        Block("abyssia_abyss_silt", "Abyss Silt", "soil", {"all": tex("dirt", P_SILT, seed="abyssia-silt")},
              hardness=0.6, sound="mud", map_color="color_blue"),
        Block("abyssia_reefrock", "Reefrock", "stone", {"all": tex("rough_stone", P_REEF, seed="abyssia-reef")},
              hardness=1.5, map_color="color_blue"),
        Block("abyssia_glowcoral", "Glowcoral", "glow", {"all": tex("coral", P_CYAN, seed="abyssia-cyan")},
              hardness=0.8, sound="coral", light=12, emissive=True, map_color="color_cyan"),
        Block("abyssia_heartcoral", "Heartcoral", "glow", {"all": tex("coral", P_MAGENTA, seed="abyssia-magenta")},
              hardness=0.8, sound="coral", light=10, emissive=True, map_color="color_magenta"),
        Block("abyssia_coral_fan", "Lumen Fan", "plant",
              {"cross": tex("coral_fan", P_MAGENTA[1:], seed="abyssia-fan")}, hardness=0.0, sound="coral",
              light=6, emissive=True),
        Block("abyssia_anemone", "Lantern Anemone", "plant",
              {"cross": tex("tendril", ["#118a9a", "#3ff0e0", "#fff0b0"], seed="abyssia-anemone")}, hardness=0.0,
              sound="coral", light=8, emissive=True, particle="minecraft:glow"),
        Block("abyssia_kelp_stalk", "Kelpwood Stalk", "log", {
            "side": tex("log_side", P_KELP, seed="abyssia-kelp"),
            "end": tex("log_top", P_KELP, P_FROND[1:], seed="abyssia-kelp-end")}, hardness=1.2, sound="wet_grass",
              map_color="color_green"),
        Block("abyssia_kelp_frond", "Kelp Frond", "leaves", {"all": tex("leaves", P_FROND, seed="abyssia-frond",
                                                                         holes=0.3)},
              hardness=0.2, sound="wet_grass", map_color="color_green"),
        Block("abyssia_bubble_vent", "Bubble Vent", "vent", {
            "top": tex("lamp", ["#0a1424", "#224a66", "#3ff0e0", "#b0fff6"], seed="abyssia-vent", style="orb"),
            "side": tex("rough_stone", P_REEF, seed="abyssia-vent-side")},
              hardness=1.5, light=6, particle="minecraft:bubble_column_up", map_color="color_cyan"),
        Block("abyssia_clam_shell", "Giant Clam Shell", "solid", {"all": tex(_clam_shell, P_SHELL, seed="abyssia-clam")},
              hardness=1.2, sound="bone", map_color="color_purple"),
        Block("abyssia_pearl_block", "Glow Pearl Block", "crystal_block",
              {"all": tex("lamp", P_PEARL, seed="abyssia-pearl", style="orb")}, hardness=1.0, light=14,
              emissive=True, map_color="quartz"),
    ],
    items=[
        Item("abyssia_glow_pearl", "Glow Pearl", tex("item_icon", "pearl", ["#3ff0e0", "#b0fff6", "#ffffff"],
                                                     seed="abyssia-glowpearl"),
             rarity="uncommon", glint=True, lore="Still warm. Something in it is breathing."),
        Item("abyssia_bubble_jelly", "Bubble Jelly", tex("item_icon", "jelly", ["#2a4a8a", "#a8e0ff", "#ff7ac8"],
                                                         seed="abyssia-jelly"), kind="food",
             food=Food(4, 0.5, always=True, effects=[Effect("minecraft:water_breathing", 90, 0),
                                                     Effect("minecraft:dolphins_grace", 20, 0)]),
             lore="Pops on the tongue. You can breathe the bubbles."),
        Item("abyssia_maw_fang", "Deep Maw Fang", tex("item_icon", "fang", ["#202838", "#c0d8e0", "#40ffd0"],
                                                      seed="abyssia-fang"),
             rarity="uncommon", lore="Glows faintly at the root, like a lure."),
    ],
    creatures=[
        Creature("lantern_eel", "Lantern Eel", "swimmer", ["#0e2a44", "#3ff0e0", "#ffcf5a", "#fff6a0", "#0a1424"],
                 pattern="glow_lines", size=1.25,
                 body={"kind": "eel", "segments": 9, "seg_w": 4, "seg_len": 5, "taper": 0.45, "head_w": 6,
                       "head_len": 6, "antennae": 6, "glow_tips": True, "ridge": True, "eye_style": "glow",
                       "eye_size": 2, "mouth": "smile"},
                 behavior="neutral", health=22, damage=4, speed=0.32, abilities=["glow_aura"],
                 on_hit=Effect("minecraft:slowness", 3, 0), tempt="minecraft:tropical_fish",
                 drops=[Drop("abyssia_glow_pearl", 0, 1, chance=0.6), Drop("minecraft:glow_ink_sac", 0, 2)],
                 sounds="guardian", pitch=1.7, xp=6, group=2,
                 description="A gentle, curious eel whose whiskers glow like paper lanterns. Shocks you if you pull its tail."),
        Creature("bubble_ray", "Bubble Ray", "swimmer", ["#4a86d8", "#d8f4ff", "#ff7ac8", "#101830", "#2a4a8a"],
                 pattern="spots", size=1.6,
                 body={"kind": "ray", "wing_span": 14, "body_len": 13, "eye_style": "cute", "mouth": "smile",
                       "blush": True},
                 behavior="passive", health=14, speed=0.28, tempt="minecraft:kelp",
                 drops=[Drop("abyssia_bubble_jelly", 0, 2)], sounds="squid", pitch=1.4, xp=3, group=3,
                 description="Glides through the reef in slow circles, trailing bubbles that taste of grape."),
        Creature("deep_maw", "Deep Maw", "swimmer", ["#121a2a", "#2c3c50", "#40ffd0", "#e0ff40", "#06080e"],
                 pattern="glow_lines", size=1.9,
                 body={"kind": "angler", "body_len": 13, "body_w": 11, "body_h": 10, "eye_style": "angry",
                       "eye_size": 1, "spikes": 4},
                 behavior="hostile", health=34, damage=7, speed=0.36, armor=3, abilities=["charge"],
                 on_hit=Effect("minecraft:darkness", 5, 0),
                 drops=[Drop("abyssia_maw_fang", 0, 1, chance=0.7), Drop("minecraft:prismarine_crystals", 0, 2)],
                 sounds="guardian", pitch=0.55, xp=12, group=1,
                 description="A lure in the dark, and behind the lure a mouth. It hunts in the trenches where the reef light dies."),
    ],
    biomes=[
        Biome("abyssia_glow_reef", "Glowing Reef", top="abyssia_pearl_sand", under="abyssia_pearl_sand",
              underwater="abyssia_pearl_sand", temperature=0.5, humidity=0.1, elevation=0.4,
              water_color="#1fd6cc", water_fog_color="#0a5a6e", grass_color="#3c8a6a", foliage_color="#3ff0e0",
              particles=[("minecraft:glow", 0.002)], ambient="bubbling",
              features=[
                  Structure(kind="arch", where="underwater", blocks={"main": "abyssia_heartcoral", "alt": "abyssia_glowcoral"},
                            size=(6, 10), count=1, chance=4),
                  GiantPlant(where="underwater", stem="abyssia_heartcoral", head="abyssia_glowcoral", shape="puff",
                             height=(5, 10), radius=(3, 5), decoration="abyssia_anemone", count=1, chance=2),
                  Boulder(where="underwater", blocks=[("abyssia_glowcoral", 3), ("abyssia_heartcoral", 2), ("abyssia_reefrock", 2)],
                          radius=(2, 3), squash=0.8, count=2),
                  Vanilla(id="minecraft:warm_ocean_vegetation"),
                  Vanilla(id="minecraft:sea_pickle"),
                  Vanilla(id="minecraft:seagrass_warm"),
                  Patch(where="underwater", blocks=[("abyssia_coral_fan", 3), ("abyssia_anemone", 2)], count=6, tries=40,
                        spread=7),
              ],
              spawns=[Spawn("bubble_ray", 12, (1, 3)), Spawn("lantern_eel", 7, (1, 2)),
                      Spawn("minecraft:tropical_fish", 18, (4, 8))]),
        Biome("abyssia_kelp_labyrinth", "Kelp Labyrinth", top="abyssia_abyss_silt", under="abyssia_abyss_silt",
              underwater="abyssia_abyss_silt", temperature=-0.4, humidity=0.6, elevation=0.0,
              water_color="#1a9a7a", water_fog_color="#0a3a30", grass_color="#2e6a34", foliage_color="#38884a",
              ambient="deep_ocean",
              features=[
                  GiantPlant(where="underwater", stem="abyssia_kelp_stalk", head="abyssia_kelp_frond", shape="palm",
                             height=(18, 30), radius=(3, 5), bend=0.35, count=3),
                  GiantPlant(where="underwater", stem="abyssia_kelp_stalk", head="abyssia_kelp_frond", shape="tuft",
                             height=(8, 14), radius=(4, 6), bend=0.2, count=1),
                  Vanilla(id="minecraft:kelp_cold"),
                  Vanilla(id="minecraft:kelp_warm"),
                  Vanilla(id="minecraft:seagrass_deep"),
                  Patch(where="underwater", block="abyssia_anemone", count=3, tries=24),
                  Boulder(where="underwater", blocks=[("abyssia_reefrock", 4), ("abyssia_glowcoral", 1)], radius=(1, 3),
                          count=1, chance=2),
              ],
              spawns=[Spawn("lantern_eel", 10, (1, 2)), Spawn("bubble_ray", 6, (1, 2)), Spawn("deep_maw", 2, (1, 1)),
                      Spawn("minecraft:cod", 12, (3, 6))]),
        Biome("abyssia_trench", "Abyssal Trench", top="abyssia_abyss_silt", under="abyssia_abyss_silt",
              underwater="abyssia_abyss_silt", temperature=-0.2, humidity=-0.5, elevation=-0.8,
              water_color="#0c2a5a", water_fog_color="#02081a", fog_color="#081a30", grass_color="#1a2a3a",
              particles=[("dust:#40ffd0:0.6", 0.003)], ambient="dark_void",
              features=[
                  Structure(kind="ribcage", where="underwater", blocks={"bone": "minecraft:bone_block",
                                                                        "spine": "abyssia_clam_shell"},
                            size=(11, 16), count=1, chance=9),
                  Structure(kind="nest", where="underwater", blocks={"main": "abyssia_clam_shell", "egg": "abyssia_pearl_block"},
                            size=(3, 5), count=1, chance=4, params={"twigs": 0.3}),
                  Structure(kind="geyser", where="underwater", blocks={"vent": "abyssia_bubble_vent", "mound": "abyssia_reefrock"},
                            size=(4, 7), count=1, chance=3),
                  Spire(where="underwater", blocks=[("abyssia_reefrock", 4), ("minecraft:tuff", 1)], tip="abyssia_bubble_vent",
                        height=(6, 14), radius=(1, 2), count=1, chance=2),
                  Patch(where="underwater", block="abyssia_anemone", count=2, tries=16),
              ],
              spawns=[Spawn("deep_maw", 6, (1, 1)), Spawn("lantern_eel", 4, (1, 2))]),
        Biome("abyssia_atolls", "Pearl Atolls", top="abyssia_pearl_sand", under="abyssia_pearl_sand",
              underwater="abyssia_pearl_sand", temperature=0.8, humidity=-0.4, elevation=0.9,
              water_color="#3fe6e0", water_fog_color="#0e6a7a", grass_color="#5aa85a", foliage_color="#4aa860",
              particles=[("minecraft:glow", 0.001)], ambient="tidal_waves",
              features=[
                  Tree(log="abyssia_kelp_stalk", leaves="abyssia_kelp_frond", shape="palm", height=(5, 8),
                       decoration="abyssia_anemone", count=1, chance=2),
                  Patch(block="abyssia_coral_fan", count=2, tries=16),
                  Vanilla(id="minecraft:warm_ocean_vegetation"),
                  Vanilla(id="minecraft:seagrass_warm"),
                  Boulder(where="underwater", blocks=[("abyssia_glowcoral", 2), ("abyssia_heartcoral", 2)], radius=(1, 2),
                          count=2),
              ],
              spawns=[Spawn("bubble_ray", 10, (1, 3)), Spawn("minecraft:turtle", 5, (2, 4)),
                      Spawn("minecraft:tropical_fish", 14, (4, 8))]),
    ],
    effects=["water_breathing"],
    music="minecraft:music.under_water",
    ambient="deep_ocean",
    icon="portalgun:abyssia_glow_pearl",
)
