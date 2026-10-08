"""Creature test dimension (dev only; generated only by `generate.py --gallery`, so it never ships).

Holds creatures of all 14 archetypes with varied body knobs so the creature pipeline can be previewed
(python3 -m gen.content.creature_preview zz_creature_lab) and tested in game (PORTALGUN_TEST=creatures).
"""
from gen.content.dsl import *

# only generated with `generate.py --gallery` (never part of a release build)
TEST_ONLY = True

ROCK = ["#3a3a44", "#4a4a56", "#5a5a68", "#6c6c7a"]

C = [
    # ---------------------------------------------------------------- quadrupeds
    Creature("lab_gummy_bear", "Gummy Bear", "quadruped", ["#ff5a7a", "#ffb0c0", "#ffe070", "#3a0a14"], size=0.8,
             body={"translucent": True, "ears": "round", "leg_len": 5, "body_len": 11, "body_h": 8, "body_w": 9,
                   "head_size": 1.25, "snout": 2, "eye_style": "cute", "mouth": "smile"},
             behavior="passive", tempt="minecraft:sugar", sounds="panda", pitch=1.4),
    Creature("lab_lollicorn", "Lollicorn", "quadruped", ["#f6e9ff", "#ff7ad9", "#7af0ff", "#5a2a8a"], pattern="patches",
             body={"horns": "unicorn", "mane": True, "neck": 7, "neck_angle": 55, "leg_len": 11, "leg_w": 3, "hooves": True,
                   "tail": 2, "tail_kind": "bushy", "ears": "pointy", "eye_style": "cute"},
             behavior="passive", sounds="horse", pitch=1.3, speed=0.28),
    Creature("lab_longneck", "Longneck", "quadruped", ["#e0b060", "#7a4a20", "#ffd890", "#201008"], pattern="spots", size=1.5,
             body={"neck": 18, "neck_angle": 80, "leg_len": 14, "body_len": 14, "horns": "small", "ears": "floppy", "tail": 2,
                   "tail_kind": "thin"},
             behavior="passive", sounds="camel", pitch=0.8, health=40),
    Creature("lab_mud_croc", "Mud Croc", "quadruped", ["#4a5a2a", "#8a8a50", "#c0c070", "#ffe040"], pattern="scales",
             body={"stance": "low", "ears": "none", "leg_len": 3, "leg_w": 3, "body_len": 18, "body_h": 6, "body_w": 10, "snout": 6, "jaw": True,
                   "spikes": 6, "tail": 3, "tail_len": 6, "eye_style": "slit", "head_size": 0.85},
             behavior="hostile", damage=5, health=24, sounds="hoglin", pitch=0.8, movement="amphibious", abilities=["charge"]),
    Creature("lab_thorn_hog", "Thorn Hog", "quadruped", ["#6a4a3a", "#3a2a20", "#e0d0a0", "#ff6020"], pattern="speckle",
             body={"tusks": True, "snout": 3, "leg_len": 5, "spikes": 7, "plates": False, "ears": "pointy", "tail": 1,
                   "tail_kind": "curl", "eye_style": "angry"},
             behavior="neutral", damage=4, abilities=["thorns", "charge"], sounds="hoglin", pitch=1.1),
    # ---------------------------------------------------------------- bipeds
    Creature("lab_stalker", "Lab Stalker", "biped", ["#3a2b3d", "#a443b6", "#e39af0", "#ff4fd8"], pattern="veins",
             size=1.35, body={"thin": True, "arms": 2, "head": "cap"}, behavior="hostile", damage=6, health=30,
             abilities=["teleport"], on_hit=Effect("minecraft:nausea", 6), sounds="enderman", pitch=0.7),
    Creature("lab_yeti", "Frost Yeti", "biped", ["#e8f0f8", "#9ab0c8", "#60a0ff", "#103060"], size=1.4,
             body={"bulky": True, "fur": True, "horns": "curved", "mouth": "fangs", "head_size": 0.9},
             behavior="neutral", damage=7, health=50, sounds="polar_bear", pitch=0.7, abilities=["leap"]),
    Creature("lab_raptor", "Raptor", "biped", ["#5a7a3a", "#c0a060", "#e04020", "#ffd000"], pattern="stripes",
             body={"stance": "raptor", "leg_len": 9, "neck": 4, "crest": True, "claws": True, "tail": 3, "tail_len": 5},
             behavior="hostile", damage=5, speed=0.34, abilities=["leap", "swarm"], sounds="ravager", pitch=1.6),
    Creature("lab_stiltbird", "Stiltbird", "biped", ["#ffb0c0", "#ffffff", "#ff8040", "#202020"],
             body={"stance": "raptor", "leg_len": 22, "body_len": 9, "body_w": 6, "body_h": 6, "neck": 12, "neck_angle": 75,
                   "beak": 5, "arms": 0, "tail": 1, "tail_kind": "fan", "head_size": 0.8},
             behavior="skittish", sounds="parrot", pitch=0.9),
    # ---------------------------------------------------------------- flyers
    Creature("lab_puffbird", "Puffbird", "flyer", ["#ffd060", "#ffffff", "#ff7030", "#202020"], size=0.7,
             body={"kind": "bird", "crest": True}, behavior="passive", sounds="parrot"),
    Creature("lab_moth", "Shimmer Moth", "flyer", ["#c0b0ff", "#ffffff", "#70f0ff", "#202040"], pattern="glow_lines",
             body={"kind": "moth"}, behavior="passive", sounds="bee", emissive=False),
    Creature("lab_drop_bat", "Drop Bat", "flyer", ["#4a3a5a", "#8a6aa0", "#ff4060", "#ff2040"],
             body={"kind": "bat"}, behavior="hostile", damage=3, health=10, sounds="bat", pitch=0.8, spawn_light="dark"),
    Creature("lab_cinder_imp", "Cinder Imp", "flyer", ["#5a1a10", "#ff6020", "#ffd040", "#ffe060"], pattern="glow_lines",
             body={"kind": "dragon", "wing_span": 10, "body_len": 8, "horns": "small", "tail": 2},
             behavior="hostile", attack="ranged", ranged={"color": "#ff8030", "damage": 4, "fire": 3, "cooldown": 50},
             fire_immune=True, sounds="blaze", pitch=1.4, emissive=True),
    # ---------------------------------------------------------------- floaters
    Creature("lab_jelly", "Puffjelly", "floater", ["#c264d0", "#e39af0", "#ffffff", "#2a103a"], pattern="glow_lines",
             size=1.2, body={"tentacles": 6}, behavior="passive", emissive=True, sounds="squid"),
    Creature("lab_sky_whale", "Sky Whale", "floater", ["#5a7ab0", "#d0e0f0", "#ffffff", "#102030"], pattern="speckle",
             size=2.2, body={"kind": "whale", "garden": True}, behavior="passive", health=80, speed=0.08, sounds="happy_ghast"),
    Creature("lab_wraith", "Wraith", "floater", ["#2a3a4a", "#506070", "#80ffe0", "#80ffe0"],
             body={"kind": "ghost", "translucent": True}, behavior="hostile", damage=4, abilities=["blink"],
             on_hit=Effect("minecraft:slowness", 4), sounds="vex", pitch=0.6, spawn_light="dark"),
    Creature("lab_lantern", "Paper Lantern", "floater", ["#ff5040", "#ffd080", "#ffe040", "#301008"],
             body={"kind": "lantern", "tentacles": 1}, behavior="passive", emissive=True, abilities=["glow_aura"], sounds="allay"),
    # ---------------------------------------------------------------- blobs
    Creature("lab_jawbreaker", "Jawbreaker", "blob", ["#ff3060", "#ffffff", "#3080ff", "#101010"], pattern="stripes",
             body={"shape": "round", "eye_style": "angry", "mouth": "grin"}, behavior="hostile", attack="explode",
             sounds="slime", pitch=1.2, movement="hopping"),
    Creature("lab_mimic", "Treasure Mimic", "blob", ["#8a5a2a", "#ffd040", "#ffe080", "#ff2020"],
             body={"shape": "box", "blob_size": 12}, behavior="hostile", damage=6, sounds="slime", pitch=0.6, movement="hopping"),
    Creature("lab_glitch_cube", "Glitch Cube", "blob", ["#20ff80", "#ff20c0", "#ffffff", "#000000"], pattern="checker",
             body={"shape": "cube", "translucent": True, "core": True, "eye_style": "glow", "mouth": "none"},
             behavior="hostile", abilities=["teleport", "split"], sounds="slime", movement="hopping"),
    # ---------------------------------------------------------------- crawlers
    Creature("lab_crystal_crawler", "Crystal Crawler", "crawler", ["#304060", "#60c0ff", "#b0f0ff", "#ff40a0"], pattern="crystal",
             body={"kind": "spider", "crystals": 3}, behavior="hostile", damage=4, sounds="spider", pitch=1.2, spawn_light="dark"),
    Creature("lab_crab", "Crater Crab", "crawler", ["#d06030", "#f0a070", "#ffffff", "#101010"], pattern="speckle",
             body={"kind": "crab"}, behavior="neutral", sounds="armadillo", abilities=["shield"]),
    Creature("lab_scorpion", "Glass Scorpion", "crawler", ["#c0e0e8", "#80a0b0", "#ff60a0", "#ff2060"], pattern="crystal",
             body={"kind": "scorpion", "translucent": True}, behavior="hostile", damage=4, on_hit=Effect("minecraft:poison", 4),
             sounds="silverfish", pitch=0.7),
    Creature("lab_ant", "Giant Ant", "crawler", ["#3a1a10", "#8a3a20", "#ffa040", "#101010"],
             body={"kind": "ant"}, behavior="neutral", abilities=["swarm"], sounds="silverfish"),
    # ---------------------------------------------------------------- serpents
    Creature("lab_sand_worm", "Sand Worm", "serpent", ["#c0a070", "#8a6a40", "#ffe0a0", "#ff4020"], pattern="rings", size=2.0,
             body={"head": "worm", "segments": 7, "seg_w": 8, "taper": 0.7}, behavior="hostile", damage=8, health=60,
             abilities=["burrow"], sounds="ravager", pitch=0.5),
    Creature("lab_rattler", "Rattle Serpent", "serpent", ["#a06030", "#e0c080", "#402010", "#ffd000"], pattern="scales",
             body={"head": "snake", "segments": 6, "seg_w": 4, "seg_len": 5, "rattle": True, "hood": True},
             behavior="hostile", damage=3, on_hit=Effect("minecraft:poison", 5), sounds="silverfish", pitch=0.6),
    # ---------------------------------------------------------------- swimmers
    Creature("lab_koi", "Koi", "swimmer", ["#ffffff", "#ff6020", "#202020", "#101010"], pattern="patches",
             body={"kind": "koi", "whiskers": True}, behavior="passive", sounds="tropical_fish"),
    Creature("lab_ray", "Bubble Ray", "swimmer", ["#3060a0", "#a0d0ff", "#ffffff", "#101830"], pattern="spots", size=1.3,
             body={"kind": "ray"}, behavior="passive", sounds="squid"),
    Creature("lab_deep_maw", "Deep Maw", "swimmer", ["#202838", "#405060", "#40ffd0", "#e0ff40"], pattern="glow_lines", size=1.4,
             body={"kind": "angler"}, behavior="hostile", damage=6, sounds="guardian"),
    Creature("lab_lantern_eel", "Lantern Eel", "swimmer", ["#103040", "#40e0ff", "#a0ffff", "#ffff80"], pattern="glow_lines",
             body={"kind": "eel", "segments": 7, "seg_w": 4}, behavior="neutral", emissive=False, sounds="guardian"),
    # ---------------------------------------------------------------- golems
    Creature("lab_geode_golem", "Geode Golem", "golem", ["#5a5a68", "#8a7aa0", "#c080ff", "#e0b0ff"], pattern="crystal",
             size=1.3, body={"crystals": 5, "shoulders": True}, behavior="neutral", damage=9, health=80, armor=6,
             abilities=["regen"], sounds="iron_golem", pitch=0.8),
    Creature("lab_automaton", "Brass Automaton", "golem", ["#b08030", "#704818", "#ffd060", "#60e0ff"], pattern="plain",
             body={"gears": True, "chimney": True, "head_size": 0.8}, behavior="neutral", damage=7, health=60,
             sounds="iron_golem", pitch=1.2),
    # ---------------------------------------------------------------- eyes
    Creature("lab_floating_eye", "Floating Eye", "eye", ["#c0b0a0", "#7a4050", "#ff4060", "#30c040"], pattern="veins",
             body={"stalks": 5, "tentacles": 4}, behavior="hostile", attack="ranged",
             ranged={"color": "#80ff40", "damage": 3, "effect": Effect("minecraft:slowness", 3), "cooldown": 40, "homing": 0.3},
             sounds="guardian", pitch=1.2),
    Creature("lab_eyebat", "Eyebat", "eye", ["#a08070", "#503040", "#ffc0c0", "#4060ff"],
             size=0.5, body={"wings": True, "lids": True}, behavior="passive", category="ambient", sounds="bat", pitch=1.3),
    # ---------------------------------------------------------------- hoppers
    Creature("lab_glow_frog", "Glow Frog", "hopper", ["#30a060", "#e0ff80", "#80ffe0", "#101010"], pattern="spots",
             body={"kind": "frog", "throat_sac": True}, behavior="passive", sounds="frog"),
    Creature("lab_moon_hopper", "Moon Hopper", "hopper", ["#d0d0e0", "#ffffff", "#a0a0ff", "#202040"], size=0.8,
             body={"kind": "rabbit", "ears": "long"}, behavior="skittish", sounds="rabbit"),
    # ---------------------------------------------------------------- tripods
    Creature("lab_tripod", "Martian Tripod", "tripod", ["#8a3020", "#c06040", "#ff4020", "#ff2010"], size=1.3,
             body={"tentacles": 3, "lights": 6}, behavior="hostile", attack="ranged",
             ranged={"color": "#ff3020", "damage": 5, "explode": 1.0, "cooldown": 60}, sounds="iron_golem", pitch=0.6, health=60),
    # ---------------------------------------------------------------- plantoids
    Creature("lab_sporeling", "Lab Sporeling", "plantoid", ["#e0dac8", "#28a8aa", "#7ff0dc", "#101820"], pattern="spots",
             size=0.6, body={"head": "mushroom_cap", "legs": 2}, behavior="skittish", sounds="frog", pitch=1.4),
    Creature("lab_flower", "Sunpetal", "plantoid", ["#40a040", "#ffd020", "#ff8020", "#202020"],
             body={"head": "flower", "legs": 4, "arms": 2}, behavior="passive", abilities=["regen"], sounds="frog"),
    Creature("lab_snapper", "Bulb Snapper", "plantoid", ["#306030", "#c03040", "#ffe060", "#ffff40"],
             body={"head": "bulb", "legs": 0, "stem_h": 8, "arms": 2}, behavior="hostile", damage=4, speed=0.0,
             sounds="sniffer", pitch=1.3),
    # ---------------------------------------------------------------- snails
    Creature("lab_titan_snail", "Titan Snail", "snail", ["#a08060", "#c06040", "#f0c080", "#202020"], size=1.8,
             body={"shell_kind": "spiral"}, behavior="passive", speed=0.06, health=60, armor=10, abilities=["shield"],
             sounds="slime", pitch=0.5),
    Creature("lab_static_slug", "Static Slug", "snail", ["#4060a0", "#ffe040", "#80ffff", "#101010"], pattern="glow_lines",
             body={"shell_kind": "cone", "crystals": True}, behavior="passive", sounds="slime", pitch=1.3),
]

DIMENSION = Dimension(
    id="zz_creature_lab",
    code="LAB-0",
    name="Creature Lab",
    tagline="Temporary test dimension for the creature pipeline",
    description="Flat grey test floor holding one of every creature archetype. Delete before release.",
    danger=1,
    color="#8080ff",
    terrain=Terrain(style="flat", stone="minecraft:stone", height=64, amplitude=1, caves=False, ores=False),
    sky=Sky(sky_color="#88aadd", fog_color="#c0d0e0", time="noon"),
    blocks=[],
    items=[],
    creatures=C,
    biomes=[Biome("zz_creature_lab_floor", "Lab Floor", top="minecraft:grass_block", under="minecraft:dirt",
                  spawns=[Spawn(c.id, 1, (1, 1)) for c in C[:3]])],
)
