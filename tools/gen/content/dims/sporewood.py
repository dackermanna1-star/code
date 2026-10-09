"""D-716 Sporewood - twilight forests of towering glowing mushrooms."""
import math

import numpy as np
from PIL import Image

from gen.content.dsl import *
from gen.noise import rng

P_MOSS = ["#1d3b3a", "#245048", "#2f6b5a", "#3f8a6c", "#58a982"]
P_SOIL = ["#362a3b", "#47374b", "#5a485e", "#6e5b72"]
P_ROCK = ["#2b2d3a", "#3a3d4d", "#4a4e60", "#5c6074", "#6f7488"]
P_STEM = ["#b9b2a0", "#cfc8b4", "#e0dac8", "#efe9da"]
P_CAP = ["#1a6f7a", "#1f8a92", "#28a8aa", "#3fc9c0", "#7ff0dc"]
P_CAP2 = ["#6a2a7a", "#86339a", "#a443b6", "#c264d0", "#e39af0"]
P_SHELF = ["#5a3a1a", "#8a5a24", "#c08a3a", "#f0c060", "#fff0b0"]


def _hex(c):
    c = c.lstrip("#")
    return np.array([int(c[i:i + 2], 16) for i in (0, 2, 4)], float)


def shelf_fungus(pal, seed):
    """Tiers of glowing bracket fungus (half-discs with banded rims) on a transparent face."""
    out = np.zeros((16, 16, 4), float)
    cols = [_hex(c) for c in pal]
    R = rng(seed)
    yy, xx = np.mgrid[0:16, 0:16]
    for k in range(3):
        cx, cy = R.uniform(3, 13), 3 + k * 5 + R.uniform(-0.5, 0.5)
        rw, rh = R.uniform(3.5, 5.5), R.uniform(2.0, 2.8)
        d = ((xx - cx) / rw) ** 2 + ((yy - cy) / rh) ** 2
        m = (d < 1.0) & (yy >= cy - 0.5)
        band = np.clip((1.0 - d) * 4, 0, 3.99).astype(int)
        for i in range(4):
            sel = m & (band == i)
            out[sel, :3] = cols[min(4, i + 1)] if i else cols[0]
            out[sel, 3] = 255
        top = m & (np.abs(yy - np.ceil(cy - 0.5)) < 0.5)
        out[top, :3] = cols[4]
    return Image.fromarray(np.clip(out, 0, 255).astype(np.uint8), "RGBA")


ELDER_GLOWCAP = GiantPlant(stem="glowcap_stem", head="teal_glowcap", shape="umbrella", height=(26, 38), radius=(9, 12),
                           stem_width=3, bend=0.15, decoration="minecraft:shroomlight", count=1, chance=7)

DIMENSION = Dimension(
    id="sporewood",
    code="D-716",
    name="Sporewood",
    tagline="Twilight forests of towering glowcaps",
    description=("A world locked in permanent dusk where mushrooms grow taller than trees and glow in teal and "
                 "violet - the Elder Glowcaps are taller than any tower you have built. Spores drift through the "
                 "air like snow and fairy rings ring the meadows. Sporelings wander the moss, Puffjellies drift "
                 "over the fens, but something tall and thin stalks the darker hollows."),
    danger=2,
    color="#3fc9c0",
    terrain=Terrain(style="hills", stone="sporewood_rock", sea_level=58, height=74, amplitude=20, scale=1.2,
                    roughness=0.25, deepslate="minecraft:deepslate",
                    params={"rivers": 0.4, "detail": 0.35, "biome_size": 300, "ceiling_block": "spore_soil"}),
    sky=Sky(sky_color="#22405a", fog_color="#2b5a5c", water_fog_color="#123a40", fog_start=24, fog_end=140,
            cloud_color="#6688ccbb", time="dusk", sunrise_color="#cc6a5acc", star_brightness=0.6, ambient_light=0.12,
            bodies=[Celestial("ringed_planet", ["#7a4aa8", "#b37be0", "#e3c2ff"], size=55, yaw=40, pitch=35, roll=-15,
                              seed="spore-moon"),
                    Celestial("nebula", ["#1f8a92", "#7ff0dc", "#a443b6", "#e39af0"], size=150, yaw=220, pitch=55,
                              alpha=0.55, additive=True, seed="spore-nebula")]),
    blocks=[
        Block("sporemoss", "Sporemoss", "grass", {
            "top": tex("grass_top", P_MOSS, seed="sporemoss"),
            "side": tex("grass_side", P_MOSS, P_SOIL, seed="sporemoss"),
            "bottom": tex("dirt", P_SOIL, seed="sporesoil")}, hardness=0.6, sound="moss", map_color="color_cyan"),
        Block("spore_soil", "Spore Soil", "soil", {"all": tex("dirt", P_SOIL, seed="sporesoil")}, hardness=0.5,
              sound="gravel", map_color="color_purple"),
        Block("sporewood_rock", "Sporewood Rock", "stone", {"all": tex("stone", P_ROCK, seed="sporerock")},
              hardness=1.5, map_color="color_gray"),
        Block("glowcap_stem", "Glowcap Stem", "log", {
            "side": tex("mushroom_stem", P_STEM, seed="glowstem"),
            "end": tex("log_top", P_STEM, ["#d8d0bc", "#c4bca8"], seed="glowstem-top")}, hardness=1.5, sound="wood",
              map_color="wool"),
        Block("teal_glowcap", "Teal Glowcap", "mushroom_cap", {"all": tex("mushroom_cap", P_CAP, seed="tealcap",
              spots_pal=["#b8fff0", "#e8fffa"])}, hardness=0.4, sound="wood", light=12, emissive=True, map_color="color_cyan"),
        Block("violet_glowcap", "Violet Glowcap", "mushroom_cap", {"all": tex("mushroom_cap", P_CAP2, seed="violetcap",
              spots_pal=["#ffd0ff", "#fff0ff"])}, hardness=0.4, sound="wood", light=12, emissive=True, map_color="color_purple"),
        Block("glowcap_sprout", "Glowcap Sprout", "plant", {"cross": tex("mushroom_sprite", P_CAP, P_STEM, seed="sprout", shape="tall")},
              hardness=0.0, sound="fungus", light=7, emissive=True),
        Block("spore_puff", "Spore Puff", "plant", {"cross": tex("puffball", ["#8a7aa0", "#b3a3c8", "#d8ccec"], seed="puff")},
              hardness=0.0, sound="fungus", particle="minecraft:spore_blossom_air"),
        Block("hanging_glowroot", "Hanging Glowroot", "hanging_plant",
              {"cross": tex("tendril", ["#2a8a8a", "#3fc9c0", "#a0fff0"], seed="glowroot")}, hardness=0.0, sound="cave_vines",
              light=9, emissive=True),
        Block("sporewood_shelf_fungus", "Amber Shelf Fungus", "vine", {"face": tex(shelf_fungus, P_SHELF, "sporewood-shelf")},
              hardness=0.2, sound="fungus", light=6, emissive=True, map_color="color_orange"),
        Block("sporewood_spore_vent", "Spore Geyser", "vent", {
            "top": tex("mushroom_cap", P_CAP2, seed="sporewood-vent", spots_pal=["#2a103a", "#3a1a4a"]),
            "side": tex("dirt", P_SOIL, seed="sporesoil")}, hardness=0.8, sound="fungus",
              particle="minecraft:spore_blossom_air", effect="minecraft:slow_falling", effect_seconds=4,
              map_color="color_purple"),
        Block("sporewood_spore_lily", "Glow Lily", "lily", {"top": tex("lily_pad", ["#1a5a5a", "#28a8aa", "#7ff0dc"],
                                                                          seed="sporewood-lily")},
              hardness=0.0, sound="lily_pad", light=6, emissive=True, map_color="color_cyan"),
    ],
    items=[
        Item("glowcap_slice", "Glowcap Slice", tex("item_icon", "mushroom", P_CAP, seed="glowslice"), kind="food",
             food=Food(4, 0.4, effects=[Effect("minecraft:night_vision", 30, 0)]), lore="Tastes like blue raspberry and dirt"),
        Item("stalker_spore", "Stalker Spore", tex("item_icon", "spore", P_CAP2, seed="stalkerspore"), rarity="uncommon",
             lore="It is warm, and it is not entirely sure it is dead."),
        Item("puffjelly_gel", "Puffjelly Gel", tex("item_icon", "jelly", ["#86339a", "#c264d0", "#ffd0ff"], seed="puffgel"),
             kind="food", food=Food(2, 0.3, fast=True, effects=[Effect("minecraft:slow_falling", 15, 0),
                                                                Effect("minecraft:glowing", 15, 0)]),
             lore="Lighter than air for about fifteen seconds."),
    ],
    creatures=[
        Creature("sporeling", "Sporeling", "plantoid", ["#e0dac8", "#28a8aa", "#7ff0dc", "#101820"], pattern="spots",
                 size=0.6, body={"head": "mushroom_cap", "legs": 2, "arms": 2, "eye_style": "cute", "blush": True,
                                 "cap_w": 14, "cap_h": 5},
                 behavior="skittish", health=8, speed=0.25, tempt="minecraft:bone_meal",
                 drops=[Drop("glowcap_slice", 0, 2)], sounds="frog", pitch=1.4, xp=2,
                 description="A shy walking mushroom that squeaks when startled."),
        Creature("mycelid_stalker", "Mycelid Stalker", "biped", ["#2e2436", "#7a2f8a", "#e39af0", "#ff4fd8"],
                 pattern="glow_lines", size=1.35,
                 body={"thin": True, "arms": 2, "arm_len": 16, "head": "mushroom_cap", "claws": True, "eye_style": "glow",
                       "eyes": 3},
                 behavior="hostile", health=30, damage=6, speed=0.3, abilities=["teleport"],
                 on_hit=Effect("minecraft:nausea", 6), spawn_light="dark",
                 drops=[Drop("stalker_spore", 0, 2)], sounds="enderman", pitch=0.7, xp=8, group=1,
                 description="Tall, silent and patient. It only moves when you are not looking."),
        Creature("puffjelly", "Puffjelly", "floater", ["#c264d0", "#e39af0", "#ffffff", "#2a103a"], pattern="glow_lines",
                 size=1.2, body={"kind": "jelly", "tentacles": 8, "tentacle_len": 12, "eye_style": "cute", "blush": True},
                 behavior="passive", health=12, speed=0.12, emissive=True,
                 drops=[Drop("puffjelly_gel", 0, 2), Drop("minecraft:glowstone_dust", 0, 1)], sounds="squid", xp=3,
                 description="A floating spore balloon that drifts on the dusk breeze."),
    ],
    biomes=[
        Biome("glowcap_forest", "Glowcap Forest", top="sporemoss", under="spore_soil", temperature=0.22, humidity=-0.5, elevation=0.0,
              grass_color="#2f6b5a", foliage_color="#3fc9c0", water_color="#2a7a8a", water_fog_color="#123a40",
              particles=[("minecraft:warped_spore", 0.012)], ambient="alien_hum",
              music="minecraft:music.nether.warped_forest",
              features=[
                  ELDER_GLOWCAP,
                  GiantPlant(stem="glowcap_stem", head="teal_glowcap", shape="dome", height=(10, 22), radius=(4, 7), count=3,
                             decoration="minecraft:shroomlight"),
                  GiantPlant(stem="glowcap_stem", head="violet_glowcap", shape="umbrella", height=(8, 16), radius=(3, 5), count=2),
                  Patch(block="glowcap_sprout", count=6, tries=24),
                  Patch(block="spore_puff", count=2, tries=12),
                  Patch(block="sporewood_shelf_fungus", count=3, tries=24),
                  Patch(block="hanging_glowroot", count=3, where="cave_ceiling"),
              ],
              spawns=[Spawn("sporeling", 12, (2, 4)), Spawn("puffjelly", 4, (1, 2)), Spawn("mycelid_stalker", 3, (1, 1))]),
        Biome("puffball_meadows", "Puffball Meadows", top="sporemoss", under="spore_soil", temperature=-0.12, humidity=-0.97, elevation=0.0,
              grass_color="#3f8a6c", water_color="#2a7a8a", particles=[("minecraft:spore_blossom_air", 0.006)],
              ambient="cozy_breeze", music="minecraft:music.overworld.lush_caves",
              features=[
                  Patch(block="spore_puff", count=8, tries=32),
                  Patch(block="glowcap_sprout", count=3),
                  Structure(kind="ring", blocks={"main": "violet_glowcap", "alt": "teal_glowcap"}, size=(5, 8),
                            params={"flat": 1, "sink": 0.45, "thickness": 0.14}, chance=6),
                  GiantPlant(stem="glowcap_stem", head="teal_glowcap", shape="puff", height=(4, 8), radius=(2, 3), count=1, chance=2),
                  Boulder(blocks=[("sporewood_rock", 3), ("minecraft:mossy_cobblestone", 1)], radius=(1, 3), count=1, chance=3),
                  Patch(block="sporewood_spore_vent", count=1, tries=3, chance=3),
              ],
              spawns=[Spawn("sporeling", 16, (3, 6)), Spawn("puffjelly", 8, (1, 3))]),
        Biome("rotting_hollow", "Rotting Hollow", top="spore_soil", under="spore_soil", temperature=0.97, humidity=-0.9,
              elevation=0.1, grass_color="#245048", water_color="#3a2b4a", fog_color="#1a2a30", fog_end=70,
              particles=[("minecraft:crimson_spore", 0.02)], ambient="eerie_choir",
              music="minecraft:music.overworld.deep_dark",
              features=[
                  GiantPlant(stem="glowcap_stem", head="violet_glowcap", shape="flat", height=(5, 9), radius=(3, 4), count=4),
                  GiantPlant(stem="glowcap_stem", head="teal_glowcap", shape="puff", height=(3, 6), radius=(2, 3), count=1),
                  Patch(block="glowcap_sprout", count=4, tries=24),
                  Patch(block="sporewood_shelf_fungus", count=4, tries=24),
                  Patch(block="hanging_glowroot", count=4, where="cave_ceiling"),
                  Disk(block="spore_soil", replace=["sporemoss"], radius=(2, 4), count=2),
              ],
              spawns=[Spawn("mycelid_stalker", 8, (1, 2)), Spawn("sporeling", 4, (1, 2))]),
        Biome("sporewood_fen", "Glowing Fen", top="sporemoss", under="spore_soil", temperature=-0.43, humidity=0.81,
              elevation=-0.6, underwater="spore_soil", grass_color="#1f8a72", water_color="#3a7ab0",
              water_fog_color="#163a5a", fog_color="#2a4a62", particles=[("minecraft:glow", 0.003),
                                                                          ("minecraft:warped_spore", 0.008)],
              ambient="bubbling", music="minecraft:music.overworld.swamp",
              surface_noise=[("spore_soil", 0.5)],
              features=[
                  Patch(block="sporewood_spore_lily", where="water_surface", count=6, tries=32, max_depth=3),
                  Patch(block="sporewood_spore_vent", count=1, tries=4),
                  GiantPlant(stem="glowcap_stem", head="violet_glowcap", shape="umbrella", height=(6, 11), radius=(3, 4),
                             bend=0.4, count=1),
                  Patch(block="glowcap_sprout", count=3, tries=16),
                  Patch(block="spore_puff", count=2, tries=12),
              ],
              spawns=[Spawn("puffjelly", 14, (2, 4)), Spawn("sporeling", 8, (2, 3)), Spawn("mycelid_stalker", 2, (1, 1))]),
    ],
    effects=[],
    ambient="alien_hum",
    music="minecraft:music.nether.warped_forest",
    icon="portalgun:glowcap_slice",
)
