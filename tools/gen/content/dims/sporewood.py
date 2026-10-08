"""D-716 Sporewood - twilight forests of towering glowing mushrooms."""
from gen.content.dsl import *

P_MOSS = ["#1d3b3a", "#245048", "#2f6b5a", "#3f8a6c", "#58a982"]
P_SOIL = ["#2a1f2e", "#3a2b3d", "#4b3a4e", "#5d4a5f"]
P_ROCK = ["#2b2d3a", "#3a3d4d", "#4a4e60", "#5c6074", "#6f7488"]
P_STEM = ["#b9b2a0", "#cfc8b4", "#e0dac8", "#efe9da"]
P_CAP = ["#1a6f7a", "#1f8a92", "#28a8aa", "#3fc9c0", "#7ff0dc"]
P_CAP2 = ["#6a2a7a", "#86339a", "#a443b6", "#c264d0", "#e39af0"]

DIMENSION = Dimension(
    id="sporewood",
    code="D-716",
    name="Sporewood",
    tagline="Twilight forests of towering glowcaps",
    description=("A world locked in permanent dusk where mushrooms grow taller than trees and glow in "
                 "teal and violet. Spores drift through the air like snow. Sporelings wander the moss, but "
                 "something tall and thin stalks the darker hollows."),
    danger=2,
    color="#3fc9c0",
    terrain=Terrain(style="hills", stone="sporewood_rock", sea_level=58, height=74, amplitude=18, roughness=0.25,
                    deepslate="minecraft:deepslate"),
    sky=Sky(sky_color="#22405a", fog_color="#2b5a5c", fog_start=24, fog_end=140, cloud_color="#6688ccbb",
            time="dusk", sunrise_color="#cc6a5acc", star_brightness=0.6, ambient_light=0.05,
            bodies=[Celestial("planet", ["#7a4aa8", "#b37be0", "#e3c2ff"], size=55, yaw=40, pitch=35, seed="spore-moon")]),
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
    ],
    items=[
        Item("glowcap_slice", "Glowcap Slice", tex("item_icon", "mushroom", P_CAP, seed="glowslice"), kind="food",
             food=Food(4, 0.4, effects=[Effect("minecraft:night_vision", 30, 0)]), lore="Tastes like blue raspberry and dirt"),
        Item("stalker_spore", "Stalker Spore", tex("item_icon", "spore", P_CAP2, seed="stalkerspore"), rarity="uncommon"),
    ],
    creatures=[
        Creature("sporeling", "Sporeling", "plantoid", ["#e0dac8", "#28a8aa", "#7ff0dc", "#101820"], pattern="spots",
                 size=0.6, body={"head": "mushroom_cap", "legs": 2}, behavior="skittish", health=8, speed=0.25,
                 drops=[Drop("glowcap_slice", 0, 2)], sounds="frog", pitch=1.4, xp=2,
                 description="A shy walking mushroom that squeaks when startled."),
        Creature("mycelid_stalker", "Mycelid Stalker", "biped", ["#3a2b3d", "#a443b6", "#e39af0", "#ff4fd8"], pattern="veins",
                 size=1.35, body={"thin": True, "arms": 2, "head": "cap"}, behavior="hostile", health=30, damage=6,
                 speed=0.3, abilities=["teleport"], on_hit=Effect("minecraft:nausea", 6), spawn_light="dark",
                 drops=[Drop("stalker_spore", 0, 2)], sounds="enderman", pitch=0.7, xp=8,
                 description="Tall, silent and patient. It only moves when you are not looking."),
        Creature("puffjelly", "Puffjelly", "floater", ["#c264d0", "#e39af0", "#ffffff", "#2a103a"], pattern="glow_lines",
                 size=1.2, body={"tentacles": 6}, behavior="passive", health=12, speed=0.12, emissive=True,
                 drops=[Drop("minecraft:glowstone_dust", 0, 2)], sounds="squid", xp=3,
                 description="A floating spore balloon that drifts on the dusk breeze."),
    ],
    biomes=[
        Biome("glowcap_forest", "Glowcap Forest", top="sporemoss", under="spore_soil", temperature=0.0, humidity=0.4,
              grass_color="#2f6b5a", foliage_color="#3fc9c0", water_color="#2a7a8a", water_fog_color="#123a40",
              particles=[("minecraft:warped_spore", 0.012)], ambient="alien_hum",
              music="minecraft:music.nether.warped_forest",
              features=[
                  GiantPlant(stem="glowcap_stem", head="teal_glowcap", shape="dome", height=(10, 22), radius=(4, 7), count=3),
                  GiantPlant(stem="glowcap_stem", head="violet_glowcap", shape="umbrella", height=(8, 16), radius=(3, 5), count=2),
                  Patch(block="glowcap_sprout", count=6, tries=24),
                  Patch(block="spore_puff", count=2, tries=12),
                  Patch(block="hanging_glowroot", count=3, where="cave_ceiling"),
              ],
              spawns=[Spawn("sporeling", 12, (2, 4)), Spawn("puffjelly", 4, (1, 2)), Spawn("mycelid_stalker", 3, (1, 1))]),
        Biome("puffball_meadows", "Puffball Meadows", top="sporemoss", under="spore_soil", temperature=0.6, humidity=-0.3,
              grass_color="#3f8a6c", water_color="#2a7a8a", particles=[("minecraft:spore_blossom_air", 0.006)],
              ambient="cozy_breeze",
              features=[
                  Patch(block="spore_puff", count=8, tries=32),
                  Patch(block="glowcap_sprout", count=3),
                  GiantPlant(stem="glowcap_stem", head="teal_glowcap", shape="puff", height=(4, 8), radius=(2, 3), count=1, chance=2),
                  Boulder(blocks=[("sporewood_rock", 3), ("minecraft:mossy_cobblestone", 1)], radius=(1, 3), count=1, chance=3),
              ],
              spawns=[Spawn("sporeling", 16, (3, 6)), Spawn("puffjelly", 8, (1, 3))]),
        Biome("rotting_hollow", "Rotting Hollow", top="spore_soil", under="spore_soil", temperature=-0.6, humidity=0.7,
              elevation=-0.4, grass_color="#245048", water_color="#3a2b4a", fog_color="#1a2a30", fog_end=70,
              particles=[("minecraft:crimson_spore", 0.02)], ambient="eerie_choir",
              features=[
                  GiantPlant(stem="glowcap_stem", head="violet_glowcap", shape="flat", height=(5, 9), radius=(3, 4), count=4),
                  Patch(block="hanging_glowroot", count=4, where="cave_ceiling"),
                  Disk(block="spore_soil", replace=["sporemoss"], radius=(2, 4), count=2),
              ],
              spawns=[Spawn("mycelid_stalker", 8, (1, 2)), Spawn("sporeling", 4, (1, 2))]),
    ],
    effects=[],
    icon="portalgun:glowcap_slice",
)
