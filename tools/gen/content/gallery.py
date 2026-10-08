"""Throwaway test dimensions, one per terrain style ("gallery_<style>"), built only with `generate.py --gallery`.

They use vanilla blocks only (so they load even before the Java side registers custom blocks), one biome each and
a few features of every kind, so every terrain style / feature type / sky option can be screenshot-tested.
"""
from __future__ import annotations

from .dsl import (Biome, Boulder, Celestial, CrystalCluster, Dimension, Disk, Geode, GiantPlant, Lake, Ore, Patch, Sky,
                  Spawn, Spire, Structure, Terrain, Tree, Vanilla, TERRAIN_STYLES)

# style -> (terrain kwargs, top, under, extra biome kwargs, sky kwargs)
GRASS = ("minecraft:grass_block", "minecraft:dirt")
PALETTES = {
    "hills": dict(terrain=dict(stone="minecraft:stone", height=74, amplitude=20, roughness=0.25, sea_level=60,
                               deepslate="minecraft:deepslate"), ground=GRASS, tree="oak",
                  sky=dict(time="cycle", sunrise_color="#ffff5080", moon_phase="new_moon",
                           bodies=[Celestial("planet", ["#2a4a8a", "#5a8ad0", "#c0e0ff"], size=50, yaw=30, pitch=40, seed="g1")])),
    "mountains": dict(terrain=dict(stone="minecraft:stone", height=80, amplitude=45, roughness=0.4, sea_level=62,
                                   params={"peak_block": "minecraft:snow_block", "peak_y": 150}), ground=GRASS, tree="spruce",
                      sky=dict(time="day", sky_color="#88b8ff", bodies=[Celestial("moon", [], size=24, yaw=120, pitch=55)])),
    "flat": dict(terrain=dict(stone="minecraft:stone", height=66, amplitude=3, roughness=0.0, sea_level=63, params={"ponds": 0.4}),
                 ground=GRASS, tree="birch", sky=dict(time="noon")),
    "islands": dict(terrain=dict(stone="minecraft:stone", height=63, amplitude=18, roughness=0.15, sea_level=63,
                                 params={"beach_block": "minecraft:sand"}), ground=GRASS, tree="palm",
                    underwater="minecraft:sand", sky=dict(time="noon", sky_color="#7ac8ff")),
    "ocean": dict(terrain=dict(stone="minecraft:stone", height=40, amplitude=10, roughness=0.1, sea_level=63,
                               params={"beach_block": "minecraft:sand"}),
                  ground=("minecraft:sand", "minecraft:sandstone"), tree="palm", underwater="minecraft:gravel",
                  sky=dict(time="noon", sky_color="#5ab0ff")),
    "sky_islands": dict(terrain=dict(stone="minecraft:stone", fluid="minecraft:air", sea_level=-64, height=110, amplitude=10,
                                     roughness=0.3, caves=False), ground=GRASS, tree="oak",
                        sky=dict(time="noon", sky_color="#9fd0ff", fog_color="#d8ecff",
                                 bodies=[Celestial("ringed_planet", ["#6a3a2a", "#c08050", "#ffe0b0"], size=70, yaw=200, pitch=30, seed="g2")])),
    "caves": dict(terrain=dict(stone="minecraft:stone", fluid="minecraft:lava", sea_level=20, height=64, amplitude=20,
                               roughness=0.5, bedrock_roof=True), ground=("minecraft:moss_block", "minecraft:dirt"), tree="oak",
                  sky=dict(time="night", skybox="none", fog_color="#301818", fog_start=8, fog_end=96, ambient_light=0.1,
                           has_skylight=False, cloud_color=None)),
    "planetoids": dict(terrain=dict(stone="minecraft:end_stone", fluid="minecraft:air", sea_level=-64, height=96, amplitude=10,
                                    roughness=0.2, caves=False), ground=GRASS, tree="oak",
                       sky=dict(time="midnight", skybox="overworld", sky_color="#000010", fog_color="#05050f", star_brightness=1.0,
                                cloud_color=None,
                                bodies=[Celestial("gas_giant", ["#402060", "#a060c0", "#ffd0ff"], size=110, yaw=60, pitch=35, seed="g3"),
                                        Celestial("nebula", ["#102060", "#4080ff", "#c0e0ff"], size=140, yaw=250, pitch=60, alpha=0.8, seed="g4"),
                                        Celestial("galaxy", [], size=60, yaw=150, pitch=70, seed="g5")])),
    "pillars": dict(terrain=dict(stone="minecraft:andesite", height=50, amplitude=10, roughness=0.3, sea_level=48,
                                 params={"pillar_height": 90}), ground=GRASS, tree="oak",
                    sky=dict(time="dawn", fog_color="#e0d0c0", fog_start=20, fog_end=220)),
    "terraces": dict(terrain=dict(stone="minecraft:stone", height=72, amplitude=28, roughness=0.1, sea_level=58),
                     ground=GRASS, tree="cherry", sky=dict(time="noon")),
    "canyons": dict(terrain=dict(stone="minecraft:terracotta", height=96, amplitude=14, roughness=0.15, sea_level=50,
                                 params={"depth": 52}),
                    ground=("minecraft:red_sand", "minecraft:orange_terracotta"), tree="acacia",
                    sky=dict(time="noon", sky_color="#ffc890", fog_color="#ffd8b0")),
    "sponge": dict(terrain=dict(stone="minecraft:yellow_terracotta", height=74, amplitude=16, roughness=0.2, sea_level=50),
                   ground=("minecraft:hay_block", "minecraft:yellow_terracotta"), tree="oak", sky=dict(time="noon")),
    "inverted": dict(terrain=dict(stone="minecraft:stone", fluid="minecraft:air", sea_level=-64, height=80, amplitude=24,
                                  roughness=0.3, caves=False), ground=("minecraft:moss_block", "minecraft:dirt"), tree="oak",
                     sky=dict(time="noon", fog_color="#a0b0c0")),
    "cubes": dict(terrain=dict(stone="minecraft:light_gray_concrete", height=70, amplitude=18, roughness=0.0, sea_level=50,
                               caves=False), ground=("minecraft:cyan_concrete", "minecraft:gray_concrete"), tree="bush",
                  sky=dict(time="dusk", sky_color="#301040", fog_color="#ff60a0", sunrise_color="#ffff40a0",
                           bodies=[Celestial("retro_sun", [], size=90, yaw=90, pitch=12)])),
    "craters": dict(terrain=dict(stone="minecraft:andesite", fluid="minecraft:air", sea_level=-64, height=70, amplitude=8,
                                 roughness=0.05, caves=False), ground=("minecraft:light_gray_concrete_powder", "minecraft:gravel"),
                    tree="bush", sky=dict(time="noon", sky_color="#000000", fog_color="#101010", star_brightness=1.0,
                                          cloud_color=None, bodies=[Celestial("planet", ["#103070", "#3080d0", "#f0f8ff"], size=80, yaw=40, pitch=40, seed="earth")])),
    "dunes": dict(terrain=dict(stone="minecraft:sandstone", height=70, amplitude=14, roughness=0.0, sea_level=40),
                  ground=("minecraft:sand", "minecraft:sand"), tree="acacia",
                  sky=dict(time="noon", sky_color="#ffe0a0", bodies=[Celestial("twin_suns", [], size=50, yaw=10, pitch=70, additive=True)])),
    "spikes": dict(terrain=dict(stone="minecraft:deepslate", height=66, amplitude=12, roughness=0.2, sea_level=50),
                   ground=("minecraft:podzol", "minecraft:coarse_dirt"), tree="dark_oak",
                   sky=dict(time="dusk", sky_color="#402020", fog_color="#603030")),
    "blobs": dict(terrain=dict(stone="minecraft:pink_terracotta", height=72, amplitude=20, roughness=0.4, sea_level=56),
                  ground=("minecraft:red_terracotta", "minecraft:pink_terracotta"), tree="oak",
                  sky=dict(time="noon", sky_color="#ffb0c0", bodies=[Celestial("eye", ["#304010", "#80c020", "#e0ff80"], size=60, yaw=300, pitch=50)])),
    "cells": dict(terrain=dict(stone="minecraft:honeycomb_block", fluid="minecraft:water", sea_level=10, height=64,
                               amplitude=10, roughness=0.0, min_y=0, total_height=192, caves=False),
                  ground=("minecraft:honey_block", "minecraft:honeycomb_block"), tree="bush",
                  sky=dict(time="noon", skybox="none", fog_color="#e0a020", fog_start=4, fog_end=80, ambient_light=0.3,
                           cloud_color=None)),
    "layers": dict(terrain=dict(stone="minecraft:smooth_stone", fluid="minecraft:air", sea_level=-64, height=96, amplitude=6,
                                roughness=0.2, caves=False), ground=GRASS, tree="oak",
                   sky=dict(time="night", skybox="end", bodies=[Celestial("aurora", [], size=160, yaw=0, pitch=45, additive=True)])),
}


def _features(style, top, tree):
    grassy = top in ("minecraft:grass_block", "minecraft:moss_block", "minecraft:podzol")
    plant = "minecraft:short_grass" if grassy else "minecraft:dead_bush"
    feats = [
        Tree(log="minecraft:oak_log" if tree not in ("spruce", "cherry", "acacia", "dark_oak", "birch") else f"minecraft:{tree}_log",
             leaves="minecraft:oak_leaves" if tree not in ("spruce", "cherry", "acacia", "dark_oak", "birch") else f"minecraft:{tree}_leaves",
             shape=tree, height=(5, 8), count=1, decoration="minecraft:glowstone"),
        GiantPlant(stem="minecraft:mushroom_stem", head="minecraft:red_mushroom_block", shape="dome", height=(8, 14), radius=(3, 5),
                   count=1, chance=4, decoration="minecraft:shroomlight"),
        GiantPlant(stem="minecraft:bone_block", head="minecraft:purple_wool", shape="umbrella", height=(6, 10), radius=(3, 4),
                   count=1, chance=6),
        Patch(block=plant, count=4, tries=32),
        Patch(blocks=[("minecraft:poppy", 2), ("minecraft:dandelion", 2), ("minecraft:blue_orchid", 1)], count=2, tries=16),
        Boulder(blocks=[("minecraft:mossy_cobblestone", 3), ("minecraft:cobblestone", 1)], radius=(2, 3), count=1, chance=5),
        Spire(blocks=[("minecraft:calcite", 2), ("minecraft:dripstone_block", 1)], tip="minecraft:amethyst_block", height=(8, 16),
              radius=(1, 3), count=1, chance=6, lean=0.3),
        CrystalCluster(block="minecraft:amethyst_block", small="minecraft:amethyst_cluster", size=(3, 6), count=1, chance=6),
        Structure(kind="arch", blocks={"main": "minecraft:stone_bricks"}, size=(6, 10), count=1, chance=8),
        Structure(kind="monolith", blocks={"main": "minecraft:obsidian"}, size=(8, 14), count=1, chance=12),
        Ore(block="minecraft:emerald_ore", size=6, count=6),
        Disk(block="minecraft:gravel", radius=(2, 4), count=1, chance=2),
        Lake(fluid="minecraft:water", chance=20),
        Geode(outer="minecraft:smooth_basalt", middle="minecraft:calcite", inner="minecraft:amethyst_block",
              budding="minecraft:budding_amethyst", crystals=["minecraft:amethyst_cluster"], chance=20),
        Vanilla(id="minecraft:flower_default"),
        Patch(block="minecraft:hanging_roots", count=6, tries=24, where="cave_ceiling"),
        Patch(block="minecraft:glow_lichen[down=true]", count=4, tries=16, where="cave_floor"),
        Patch(block="minecraft:seagrass", count=4, tries=32, where="underwater"),
        Patch(block="minecraft:lily_pad", count=1, tries=12, where="water_surface"),
    ]
    if style in ("sky_islands", "planetoids", "layers", "inverted"):
        feats.append(Boulder(blocks=[("minecraft:white_wool", 1)], radius=(2, 4), count=1, chance=4, where="air"))
    return feats


def gallery_dimensions():
    dims = []
    for i, style in enumerate(TERRAIN_STYLES):
        p = PALETTES[style]
        top, under = p["ground"]
        t = Terrain(style=style, **p["terrain"])
        sky = Sky(**p.get("sky", {}))
        biome = Biome(f"gallery_{style}_biome", f"Gallery {style.replace('_', ' ').title()}", top=top, under=under,
                      underwater=p.get("underwater"), temperature=0.0, humidity=0.0,
                      water_color="#3f76e4", grass_color="#79c05a", foliage_color="#59ae30",
                      particles=[("minecraft:white_ash", 0.004)] if style in ("caves", "craters") else [],
                      features=_features(style, top, p["tree"]),
                      spawns=[Spawn("minecraft:sheep", 8, (2, 4))] if top == "minecraft:grass_block" else [],
                      snowy=style == "mountains", precipitation=style in ("hills", "mountains"))
        dims.append(Dimension(
            id=f"gallery_{style}", code=f"GAL-{i:02d}", name=f"Gallery: {style.replace('_', ' ').title()}",
            tagline=f"Terrain style test: {style}", description=f"Throwaway test dimension for the '{style}' terrain style.",
            danger=1, color="#888888", terrain=t, sky=sky, biomes=[biome]))
    dims.append(_blocks_dimension())
    return dims


# ------------------------------------------------------------------------------------------------ block showcase
def _blocks_dimension():
    """gallery_blocks: one custom block of every BLOCK_KIND (+ animated/emissive variants) and every sky body
    generator, so blockstates/models/textures/item models and sky art can be checked in-game."""
    from .dsl import Block, Food, Effect, Item, tex
    from .sky_art import GENERATORS
    rock = ["#3a3f4a", "#4d5361", "#636a7a", "#7b8394", "#959eb0"]
    moss = ["#1f4a2a", "#2b6a38", "#3c8a46", "#58a85a", "#7cc878"]
    soil = ["#3a2a20", "#4e392b", "#644a38", "#7a5c47"]
    bark = ["#3b2a1e", "#553d2a", "#6f5038", "#8a6648"]
    rings = ["#c9a878", "#b08f60"]
    leaf = ["#1e5a3a", "#2a7a4a", "#3a9a5a", "#5aba72"]
    crys = ["#4a2a8a", "#6a3ab8", "#8a5ae0", "#b48aff", "#e0c8ff"]
    gold = ["#7a5a10", "#a07a18", "#c89a28", "#e8c050", "#fff0a0"]
    pink = ["#7a2a5a", "#a03a7a", "#c85a9a", "#e88abe", "#ffc0e0"]
    blocks = [
        Block("gb_stone", "Gallery Stone", "stone", {"all": tex("stone", rock, seed="gb_stone")}, hardness=1.5),
        Block("gb_grass", "Gallery Grass", "grass", {"top": tex("grass_top", moss, seed="gb_grass"),
                                                      "side": tex("grass_side", moss, soil, seed="gb_grass"),
                                                      "bottom": tex("dirt", soil, seed="gb_soil")}, sound="grass"),
        Block("gb_soil", "Gallery Soil", "soil", {"all": tex("dirt", soil, seed="gb_soil")}, sound="gravel"),
        Block("gb_sand", "Gallery Sand", "sand", {"all": tex("sand", gold, seed="gb_sand")}, sound="sand"),
        Block("gb_log", "Gallery Log", "log", {"side": tex("log_side", bark, seed="gb_log"),
                                                "end": tex("log_top", bark, rings, seed="gb_log")}, sound="wood", flammable=True),
        Block("gb_planks", "Gallery Planks", "planks", {"all": tex("planks", bark, seed="gb_planks")}, sound="wood"),
        Block("gb_leaves", "Gallery Leaves", "leaves", {"all": tex("leaves", leaf, seed="gb_leaves")}, sound="grass",
              drop="gb_fruit"),
        Block("gb_glass", "Gallery Glass", "glass", {"all": tex("glass", ["#60c0ff", "#a0e0ff", "#e0f8ff"], seed="gb_glass")}, sound="glass"),
        Block("gb_ice", "Gallery Ice", "ice", {"all": tex("ice", ["#80b0ff", "#a8ccff", "#d0e8ff"], seed="gb_ice")}, sound="glass", friction=0.98),
        Block("gb_glow", "Gallery Glow", "glow", {"all": tex("lamp", gold, seed="gb_glow", frames=6, frametime=4)},
              light=15, emissive=True, sound="glass"),
        Block("gb_crystal", "Gallery Crystal", "crystal_block", {"all": tex("crystal", crys, seed="gb_crystal")},
              light=6, sound="amethyst", emissive=True),
        Block("gb_ore", "Gallery Ore", "ore", {"all": tex("ore", tex("stone", rock, seed="gb_stone"), ["#30c0ff", "#a0f0ff"], seed="gb_ore")},
              hardness=3.0, drop="gb_gem", drop_count=(1, 2), xp=(2, 5)),
        Block("gb_slime", "Gallery Slime", "slime", {"all": tex("slime_block", ["#3a9a3a", "#5aca5a", "#9af09a"], seed="gb_slime")}, sound="slime"),
        Block("gb_hazard", "Gallery Hazard", "hazard", {"all": tex("ash", ["#3a1a10", "#6a2a10", "#c04010", "#ff8020"], seed="gb_hazard")},
              damage=1.0, light=4),
        Block("gb_sticky", "Gallery Goo", "sticky", {"all": tex("goo", pink, seed="gb_goo")}, sound="honey", speed=0.4, jump=0.5),
        Block("gb_vent", "Gallery Vent", "vent", {"top": tex("lamp", ["#202020", "#404040", "#ff6020"], seed="gb_vent"),
                                                   "side": tex("rough_stone", rock, seed="gb_vent_side")},
              particle="minecraft:white_smoke"),
        Block("gb_cap", "Gallery Cap", "mushroom_cap", {"all": tex("mushroom_cap", pink, seed="gb_cap", spots_pal=["#ffe0f0", "#ffffff"])},
              light=10, emissive=True, sound="wood"),
        Block("gb_plant", "Gallery Flower", "plant", {"cross": tex("flower", moss, pink, seed="gb_flower")}, sound="grass",
              fruit="gb_fruit"),
        Block("gb_tall", "Gallery Tall Grass", "tall_plant", {"bottom": tex("tall_plant_bottom", moss, seed="gb_tall"),
                                                               "top": tex("tall_plant_top", moss, seed="gb_tall")}, sound="grass"),
        Block("gb_hanging", "Gallery Tendril", "hanging_plant", {"cross": tex("tendril", crys, seed="gb_tendril")},
              light=8, emissive=True, sound="cave_vines"),
        Block("gb_cluster", "Gallery Cluster", "crystal_cluster", {"cross": tex("crystal_shard_sprite", crys, seed="gb_cluster")},
              light=7, sound="amethyst"),
        Block("gb_lily", "Gallery Lily", "lily", {"top": tex("lily_pad", moss, seed="gb_lily")}, sound="grass"),
        Block("gb_vine", "Gallery Vine", "vine", {"face": tex("vine_overlay", leaf, seed="gb_vine")}, sound="vine"),
        Block("gb_carpet", "Gallery Carpet", "carpet", {"all": tex("carpet_pattern", pink, seed="gb_carpet")}, sound="wool"),
        Block("gb_solid", "Gallery Solid", "solid", {"all": tex("metal", ["#505860", "#707880", "#a0a8b0", "#d0d8e0"], seed="gb_metal")},
              sound="metal"),
    ]
    items = [
        Item("gb_fruit", "Gallery Fruit", tex("item_icon", "fruit", pink, seed="gb_fruit"), kind="food",
             food=Food(4, 0.5, effects=[Effect("minecraft:speed", 10)])),
        Item("gb_gem", "Gallery Gem", tex("item_icon", "gem", crys, seed="gb_gem"), rarity="rare"),
    ]
    feats = [
        Tree(log="gb_log", leaves="gb_leaves", shape="oak", height=(5, 7), count=1, decoration="gb_hanging"),
        GiantPlant(stem="gb_log", head="gb_cap", shape="dome", height=(7, 10), radius=(3, 4), count=1, chance=2),
        Patch(block="gb_plant", count=3, tries=24),
        Patch(block="gb_tall", count=2, tries=24),
        Patch(block="gb_carpet", count=1, tries=16),
        Patch(block="gb_cluster", count=2, tries=16),
        Patch(block="gb_lily", count=2, tries=24, where="water_surface"),
        Patch(block="gb_vine", count=8, tries=20, where="cave_ceiling"),
        Patch(block="gb_hanging", count=8, tries=20, where="cave_ceiling"),
        Boulder(blocks=[("gb_glass", 1), ("gb_ice", 1), ("gb_slime", 1), ("gb_crystal", 1), ("gb_ore", 1), ("gb_solid", 1)],
                radius=(2, 3), count=1),
        Spire(blocks=[("gb_crystal", 1)], tip="gb_glow", height=(6, 10), radius=(1, 2), count=1, chance=2),
        CrystalCluster(block="gb_crystal", small="gb_cluster", size=(3, 5), count=1, chance=2),
        Structure(kind="cuboids", blocks={"main": "gb_planks", "alt": "gb_sticky", "trim": "gb_vent"}, size=(4, 7), count=1, chance=2),
        Structure(kind="arch", blocks={"main": "gb_stone"}, size=(6, 9), count=1, chance=2),
        Ore(block="gb_ore", size=8, count=12),
        Disk(block="gb_sand", radius=(2, 4), count=1),
    ]
    bodies = []
    for i, g in enumerate(sorted(GENERATORS)):
        bodies.append(Celestial(g, [], size=40, yaw=i * 360.0 / len(GENERATORS), pitch=25 + (i % 3) * 18, seed=f"gb{i}",
                                additive=g in ("sun", "twin_suns", "aurora", "nebula", "comet", "galaxy")))
    biome = Biome("gallery_blocks_biome", "Gallery Blocks", top="gb_grass", under="gb_soil", underwater="gb_sand",
                  temperature=0.0, humidity=0.0, water_color="#3fa0e4",
                  surface_noise=[("gb_sand", 0.35), ("gb_glow", 0.62), ("gb_hazard", 0.75)],
                  particles=[("dust:#ff80c0:1.2", 0.004), ("minecraft:firefly", 0.002)], ambient="crystal_chimes",
                  features=feats)
    return Dimension(
        id="gallery_blocks", code="GAL-BLK", name="Gallery: Blocks", tagline="Every block kind and sky body",
        description="Throwaway test dimension showing one custom block of every kind and every sky body texture.",
        danger=1, color="#ff80c0",
        terrain=Terrain(style="flat", stone="gb_stone", height=66, amplitude=4, roughness=0.0, sea_level=63,
                        params={"ponds": 0.5}, caves=False),
        sky=Sky(time="noon", sky_color="#88aaff", star_brightness=0.4, bodies=bodies),
        biomes=[biome], blocks=blocks, items=items, icon="gb_gem")
