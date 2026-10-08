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
                  sky=dict(time="noon", bodies=[Celestial("planet", ["#2a4a8a", "#5a8ad0", "#c0e0ff"], size=50, yaw=30, pitch=40, seed="g1")])),
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
                   sky=dict(time="noon", bodies=[Celestial("aurora", [], size=160, yaw=0, pitch=45, additive=True)])),
}


def _features(style, top, tree):
    grassy = top in ("minecraft:grass_block", "minecraft:moss_block", "minecraft:podzol")
    plant = "minecraft:short_grass" if grassy else "minecraft:dead_bush"
    feats = [
        Tree(log="minecraft:oak_log" if tree not in ("spruce", "cherry", "acacia", "dark_oak", "birch") else f"minecraft:{tree}_log",
             leaves="minecraft:oak_leaves" if tree not in ("spruce", "cherry", "acacia", "dark_oak", "birch") else f"minecraft:{tree}_leaves",
             shape=tree, height=(5, 8), count=2, decoration="minecraft:glowstone"),
        GiantPlant(stem="minecraft:mushroom_stem", head="minecraft:red_mushroom_block", shape="dome", height=(8, 14), radius=(3, 5),
                   count=1, chance=2, decoration="minecraft:shroomlight"),
        GiantPlant(stem="minecraft:bone_block", head="minecraft:purple_wool", shape="umbrella", height=(6, 10), radius=(3, 4),
                   count=1, chance=3),
        Patch(block=plant, count=4, tries=32),
        Patch(blocks=[("minecraft:poppy", 2), ("minecraft:dandelion", 2), ("minecraft:blue_orchid", 1)], count=2, tries=16),
        Boulder(blocks=[("minecraft:mossy_cobblestone", 3), ("minecraft:cobblestone", 1)], radius=(2, 3), count=1, chance=2),
        Spire(blocks=[("minecraft:calcite", 2), ("minecraft:dripstone_block", 1)], tip="minecraft:amethyst_block", height=(8, 16),
              radius=(1, 3), count=1, chance=3, lean=0.3),
        CrystalCluster(block="minecraft:amethyst_block", small="minecraft:amethyst_cluster", size=(3, 6), count=1, chance=3),
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
    return dims
