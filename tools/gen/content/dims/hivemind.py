"""H-55 Hivemind - the inside of a hive the size of a world: honeycomb chambers, wax halls, honey pools and amber."""
import numpy as np
from PIL import Image

from gen.content.dsl import *
from gen.noise import rng

# palette: honey amber, wax cream, comb gold, dark propolis brown, royal jelly white, ember orange
P_COMB = ["#7a4808", "#a0620e", "#c88418", "#e8a828", "#f8c850"]
P_OLDCOMB = ["#2e1a08", "#40260c", "#583612", "#70481a", "#8a5c24"]
P_WAX = ["#d08a20", "#e4a030", "#f2b840", "#fcd058", "#ffe888"]
P_HONEY = ["#a85808", "#c87010", "#e08c18", "#f4aa30", "#ffd060"]
P_AMBER = ["#8a3a04", "#b8560a", "#e07a14", "#f8a030", "#ffd070"]
P_JELLY = ["#e8dcb0", "#f4ead0", "#fff6e0", "#fffcf0", "#ffffff"]


def _rgb(c):
    c = c.lstrip("#")
    return np.array([int(c[i:i + 2], 16) for i in (0, 2, 4)], float)


def fossil_amber(seed):
    """Glowing amber with an ancient bee trapped inside (dark body, pale wings, a few bubbles)."""
    from gen.textures import crystal
    a = np.array(crystal(P_AMBER, seed, shards=5)).astype(float)
    R = rng(seed)
    yy, xx = np.mgrid[0:16, 0:16]
    cx, cy = 7.5 + R.uniform(-0.5, 0.5), 8.5 + R.uniform(-0.5, 0.5)
    ang = R.uniform(-0.6, 0.6)
    u = (xx - cx) * np.cos(ang) + (yy - cy) * np.sin(ang)
    v = -(xx - cx) * np.sin(ang) + (yy - cy) * np.cos(ang)
    wings = (((u + 3.4) / 3.2) ** 2 + ((v + 1.6) / 1.8) ** 2 < 1) | (((u - 3.4) / 3.2) ** 2 + ((v + 1.6) / 1.8) ** 2 < 1)
    body = ((u / 1.9) ** 2 + ((v - 1.0) / 4.2) ** 2) < 1
    a[wings, :3] = a[wings, :3] * 0.55 + _rgb("#fff0c0") * 0.45
    a[body, :3] = _rgb("#3a1c06")
    stripes = body & (np.abs(np.round(v) % 2) == 0) & (v > -1)
    a[stripes, :3] = _rgb("#c07818")
    head = ((u / 1.6) ** 2 + ((v + 4.2) / 1.4) ** 2) < 1
    a[head, :3] = _rgb("#2a1404")
    for _ in range(4):
        bx, by = int(R.integers(0, 16)), int(R.integers(0, 16))
        if not body[by, bx]:
            a[by, bx, :3] = _rgb("#fff4c0")
    a[..., 3] = 255
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8), "RGBA")


def larva_comb(seed):
    """Brood comb: a dark hexagonal cell holding a curled, pale, softly glowing larva."""
    from gen.textures import honeycomb
    a = np.array(honeycomb(P_OLDCOMB, seed)).astype(float)
    yy, xx = np.mgrid[0:16, 0:16]
    d = np.hypot(xx - 7.5, yy - 7.5)
    cell = d < 6.2
    a[cell, :3] = _rgb("#3a2208")
    ring = (d > 1.2) & (d < 4.8)
    gap = (xx > 8.5) & (np.abs(yy - 7.5) < 1.6)
    larva = ring & ~gap
    shade = np.clip((xx + yy) / 30.0, 0, 1)[..., None]
    a[larva, :3] = (_rgb("#fff4dc") * (1 - shade) + _rgb("#e8c890") * shade)[larva]
    seg = larva & ((np.round(np.arctan2(yy - 7.5, xx - 7.5) * 3) % 2) == 0)
    a[seg, :3] = _rgb("#f0d8a8")
    core = d <= 1.2
    a[core, :3] = _rgb("#f8e4b8")
    a[5:7, 11:13, :3] = _rgb("#a87038")
    a[..., 3] = 255
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8), "RGBA")


HIVE_AMBER_CLUSTER = CrystalCluster(block="hivemind_amber", small="hivemind_amber_cluster", size=(4, 8),
                                    where="cave_floor", count=2)

DIMENSION = Dimension(
    id="hivemind",
    code="H-55",
    name="Hivemind",
    tagline="You are inside the hive. The hive knows.",
    description=("A world that is one colossal beehive: endless hexagonal chambers walled in honeycomb, wax halls lit "
                 "by royal jelly, golden honey pooling in the lower cells and amber galleries where ancient bees sleep "
                 "in glowing stone. Wax Grubs inch along the floors and Hive Drones patrol in buzzing squads - "
                 "leave them be. Wherever the larvae are kept, the Hive Warden is never far."),
    danger=3,
    color="#f4aa30",
    terrain=Terrain(style="cells", stone="hivemind_comb", fluid="minecraft:water", sea_level=38, height=72,
                    amplitude=10, roughness=0.0, min_y=0, total_height=192, caves=False, ores=False,
                    params={"cell_size": 38, "wall": 3.4, "roof": True, "biome_size": 200,
                            "ceiling_block": "hivemind_comb"}),
    sky=Sky(sky_color="#c07a1c", fog_color="#a86a14", water_fog_color="#a85808", fog_start=6, fog_end=80,
            cloud_color=None, time="noon", skybox="none", ambient_light=0.32, sky_light_factor=0.6),
    blocks=[
        Block("hivemind_comb", "Hive Comb", "stone", {"all": tex("honeycomb", P_COMB, seed="hive-comb")},
              hardness=1.2, sound="coral", map_color="color_orange"),
        Block("hivemind_brood_comb", "Brood Comb", "stone", {"all": tex("honeycomb", P_OLDCOMB, seed="hive-oldcomb")},
              hardness=1.2, sound="coral", map_color="color_brown"),
        Block("hivemind_wax", "Hive Wax", "solid", {"all": tex("wax", P_WAX, seed="hive-wax")}, hardness=0.8,
              sound="wool", tool="axe", map_color="color_yellow", flammable=True),
        Block("hivemind_honey_floor", "Honey Floor", "sticky", {"all": tex("goo", P_HONEY, seed="hive-honey", alpha=235)},
              hardness=0.6, sound="honey", speed=0.45, jump=0.5, map_color="color_orange"),
        Block("hivemind_amber", "Hive Amber", "crystal_block", {"all": tex("crystal", P_AMBER, seed="hive-amber", shards=6)},
              hardness=1.5, sound="amethyst", light=11, emissive=True, map_color="color_orange"),
        Block("hivemind_fossil_amber", "Fossil Amber", "crystal_block", {"all": tex(fossil_amber, "hive-fossil")},
              hardness=1.5, sound="amethyst", light=7, emissive=True, map_color="color_orange", drop="hivemind_amber_chunk",
              drop_count=(1, 3), xp=(1, 3)),
        Block("hivemind_amber_cluster", "Amber Bud", "crystal_cluster",
              {"cross": tex("crystal_shard_sprite", P_AMBER[1:], seed="hive-bud", count=3)}, hardness=0.5,
              sound="amethyst_cluster", light=6, emissive=True),
        Block("hivemind_honey_drip", "Honey Drip", "hanging_plant",
              {"cross": tex("tendril", ["#c87010", "#f4aa30", "#ffe090"], seed="hive-drip")}, hardness=0.0,
              sound="honey", light=5, emissive=True, particle="minecraft:dripping_honey"),
        Block("hivemind_royal_jelly", "Royal Jelly Lamp", "glow", {"all": tex("lamp", P_JELLY, seed="hive-jelly",
                                                                             style="orb")},
              hardness=0.6, sound="honey", light=15, emissive=True, map_color="snow"),
        Block("hivemind_larva_cell", "Larva Cell", "solid", {"all": tex(larva_comb, "hive-larva")}, hardness=0.8,
              sound="coral", tool="axe", light=4, map_color="color_brown"),
        Block("hivemind_pollen_vent", "Pollen Vent", "vent", {
            "top": tex("honeycomb", ["#c08010", "#e8b030", "#ffd860", "#fff0a0", "#ffffff"], seed="hive-vent"),
            "side": tex("honeycomb", P_COMB, seed="hive-comb")}, hardness=1.0, sound="coral",
              particle="minecraft:falling_nectar", effect="minecraft:regeneration", effect_seconds=3, light=6,
              emissive=True, map_color="color_yellow"),
        Block("hivemind_pollen_carpet", "Pollen Drift", "carpet",
              {"all": tex("sand", ["#e8b020", "#f4c840", "#ffdc60", "#fff090"], seed="hive-pollen")}, hardness=0.1,
              sound="sand", map_color="color_yellow"),
    ],
    items=[
        Item("hivemind_royal_jelly_bite", "Royal Jelly", tex("item_icon", "jelly", P_JELLY[:3] + ["#f4aa30"],
                                                              seed="hive-royal"),
             kind="food", rarity="rare", food=Food(6, 1.0, always=True, effects=[
                 Effect("minecraft:regeneration", 10, 1), Effect("minecraft:absorption", 60, 1)]),
             lore="Meant for a queen. You will do."),
        Item("hivemind_amber_chunk", "Amber Chunk", tex("item_icon", "gem", P_AMBER[1:], seed="hive-amberchunk"),
             rarity="uncommon", lore="Something small is still in there, waiting."),
        Item("hivemind_drone_stinger", "Drone Stinger", tex("item_icon", "fang", ["#2a1404", "#c87010", "#ffe090"],
                                                            seed="hive-stinger"),
             lore="Still twitches when it hears buzzing."),
    ],
    creatures=[
        Creature("hive_warden", "Hive Warden", "crawler", ["#2a1606", "#e8a020", "#ffd060", "#ff6010", "#40200a"],
                 pattern="stripes", size=2.0,
                 body={"kind": "ant", "legs": 3, "leg_len": 10, "body_w": 10, "body_h": 7, "body_len": 14,
                       "mandibles": True, "stinger": True, "shell": True, "head_size": 1.25, "eye_style": "compound",
                       "antennae": 7, "glow_tips": True, "spikes": 3, "plates": True},
                 behavior="hostile", health=70, damage=9, speed=0.27, armor=8, abilities=["charge", "swarm"],
                 on_hit=Effect("minecraft:poison", 5, 0), spawn_light="any",
                 drops=[Drop("hivemind_royal_jelly_bite", 1, 2), Drop("hivemind_amber_chunk", 1, 3)],
                 sounds="ravager", pitch=1.3, xp=30, group=1, tracking=10,
                 description="Guardian of the brood: armoured, enormous, and absolutely sure that you are the threat."),
        Creature("hive_drone", "Hive Drone", "flyer", ["#e8a020", "#2a1606", "#fff4d0", "#101010"], pattern="stripes",
                 size=0.75,
                 body={"kind": "insect", "wings": 2, "stinger": True, "antennae": 4, "eye_style": "compound",
                       "fluffy": True, "body_len": 8},
                 behavior="neutral", health=10, damage=3, speed=0.3, abilities=["swarm"],
                 on_hit=Effect("minecraft:poison", 3, 0), tempt="hivemind_pollen_carpet",
                 drops=[Drop("hivemind_drone_stinger", 0, 1, chance=0.5), Drop("minecraft:honeycomb", 0, 1)],
                 sounds="bee", pitch=0.8, xp=4, group=4,
                 description="A bee the size of a dog. Busy, polite, and backed by ten thousand siblings."),
        Creature("wax_grub", "Wax Grub", "serpent", ["#fff0d0", "#f0c880", "#e8a020", "#2a1606"], pattern="rings",
                 size=0.8,
                 body={"head": "worm", "segments": 6, "seg_w": 6, "seg_len": 4, "taper": 0.75, "ringed": True,
                       "eyes": 2, "eye_style": "sleepy", "mouth": "smile", "blush": True},
                 behavior="passive", health=10, speed=0.12, tempt="minecraft:honey_bottle",
                 drops=[Drop("minecraft:honeycomb", 0, 2), Drop("hivemind_royal_jelly_bite", 0, 1, chance=0.08)],
                 sounds="silverfish", pitch=0.6, xp=2, group=3,
                 description="A plump, sleepy larva that chews wax all day and squeaks if you step over it."),
    ],
    biomes=[
        Biome("hivemind_wax_halls", "Wax Halls", top="hivemind_wax", under="hivemind_comb", temperature=0.0,
              humidity=0.0, water_color="#e8a020", water_fog_color="#a85808",
              particles=[("dust:#ffd040:0.6", 0.006), ("minecraft:wax_on", 0.001)],
              ambient="hive_drone", music="minecraft:music.overworld.lush_caves",
              features=[
                  Patch(block="hivemind_honey_drip", where="cave_ceiling", count=10, tries=24),
                  Patch(block="hivemind_pollen_carpet", where="cave_floor", count=4, tries=24),
                  Patch(block="hivemind_pollen_vent", where="cave_floor", count=2, tries=4),
                  Spire(blocks=[("hivemind_wax", 3), ("hivemind_comb", 1)], tip="hivemind_royal_jelly",
                        height=(5, 12), radius=(1, 2), where="cave_floor", count=3),
                  Spire(blocks=[("hivemind_wax", 3), ("hivemind_honey_floor", 1)], height=(4, 10), radius=(1, 2),
                        hanging=True, where="cave_ceiling", count=4),
                  Ore(block="hivemind_royal_jelly", size=4, count=6),
                  Ore(block="hivemind_fossil_amber", size=5, count=4),
                  CrystalCluster(block="hivemind_amber", small="hivemind_amber_cluster", size=(3, 5),
                                 where="cave_floor", count=1),
              ],
              spawns=[Spawn("wax_grub", 10, (2, 3)), Spawn("hive_drone", 8, (2, 4)), Spawn("hive_warden", 2, (1, 1))]),
        Biome("hivemind_honey_vaults", "Honey Vaults", top="hivemind_honey_floor", under="hivemind_wax",
              temperature=0.6, humidity=0.55, water_color="#f09818", water_fog_color="#b06008", fog_color="#b8700c",
              underwater="hivemind_honey_floor",
              particles=[("minecraft:falling_honey", 0.006), ("minecraft:dripping_honey", 0.004)],
              ambient="bubbling", music="minecraft:music.overworld.lush_caves",
              features=[
                  Lake(fluid="minecraft:water", border="hivemind_wax", where="cave_floor", count=2),
                  Patch(block="hivemind_honey_drip", where="cave_ceiling", count=18, tries=32),
                  Spire(blocks=[("hivemind_honey_floor", 2), ("hivemind_amber", 1)], tip="hivemind_amber",
                        height=(6, 14), radius=(1, 3), hanging=True, where="cave_ceiling", count=4),
                  Patch(block="hivemind_pollen_vent", where="cave_floor", count=1, tries=3),
                  Ore(block="hivemind_royal_jelly", size=4, count=4),
              ],
              spawns=[Spawn("wax_grub", 14, (2, 4)), Spawn("hive_drone", 6, (2, 3))]),
        Biome("hivemind_amber_galleries", "Amber Galleries", top="hivemind_comb", under="hivemind_comb",
              temperature=-0.6, humidity=0.5, water_color="#e07a14", water_fog_color="#8a3a04", fog_color="#c0600c",
              particles=[("minecraft:wax_off", 0.002), ("dust:#ff9020:0.7", 0.005)],
              ambient="crystal_chimes", music="minecraft:music.overworld.dripstone_caves",
              features=[
                  HIVE_AMBER_CLUSTER,
                  CrystalCluster(block="hivemind_amber", small="hivemind_amber_cluster", size=(5, 10),
                                 where="cave_ceiling", count=1),
                  Spire(blocks=[("hivemind_amber", 3), ("hivemind_fossil_amber", 1)], tip="hivemind_amber",
                        height=(10, 22), radius=(2, 4), lean=0.25, where="cave_floor", count=2),
                  Spire(blocks=[("hivemind_amber", 2), ("hivemind_comb", 1)], height=(8, 16), radius=(2, 3),
                        hanging=True, where="cave_ceiling", count=3),
                  Geode(outer="hivemind_wax", middle="hivemind_comb", inner="hivemind_amber",
                        crystals=["hivemind_amber_cluster"], count=1, chance=3, y=(20, 150), where="anywhere"),
                  Ore(block="hivemind_fossil_amber", size=7, count=10),
                  Patch(block="hivemind_amber_cluster", where="cave_floor", count=4, tries=16),
              ],
              spawns=[Spawn("hive_drone", 10, (2, 4)), Spawn("wax_grub", 6, (1, 3)), Spawn("hive_warden", 1, (1, 1))]),
        Biome("hivemind_royal_brood", "Royal Brood", top="hivemind_brood_comb", under="hivemind_brood_comb",
              stone="hivemind_brood_comb", temperature=-0.5, humidity=-0.6, water_color="#c87010",
              fog_color="#5a300a", fog_end=50,
              particles=[("minecraft:white_ash", 0.004), ("dust:#ffe0a0:0.5", 0.003)],
              ambient="eerie_choir", music="minecraft:music.overworld.deep_dark",
              features=[
                  Structure(kind="nest", blocks={"main": "hivemind_wax", "egg": "hivemind_larva_cell"}, size=(4, 7),
                            params={"eggs": 4}, where="cave_floor", count=2),
                  Ore(block="hivemind_larva_cell", size=9, count=12),
                  Patch(block="hivemind_honey_drip", where="cave_ceiling", count=6, tries=20),
                  Spire(blocks=[("hivemind_brood_comb", 2), ("hivemind_larva_cell", 1)], tip="hivemind_royal_jelly",
                        height=(6, 12), radius=(1, 2), where="cave_floor", count=2),
                  Ore(block="hivemind_royal_jelly", size=3, count=3),
              ],
              spawns=[Spawn("hive_warden", 5, (1, 1)), Spawn("wax_grub", 12, (2, 4)), Spawn("hive_drone", 6, (2, 3))]),
    ],
    effects=[],
    ambient="hive_drone",
    music="minecraft:music.overworld.lush_caves",
    platform="hivemind_wax",
    icon="portalgun:hivemind_royal_jelly_bite",
)
