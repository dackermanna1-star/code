"""M-4 Rubra - the red planet: rust dust, craters, dust storms, low gravity and two tiny racing moons."""
import math

import numpy as np
from PIL import Image

from gen.content.dsl import *
from gen.noise import fbm, rng

# palette: rust, ochre dust, dark basalt, butterscotch sky, CO2 frost, perchlorate violet (+ derelict white/blue)
P_DUST = ["#7a2c14", "#9a3c1c", "#b45028", "#c86a3a", "#d8864c"]
P_DUNE = ["#8a3818", "#a84a22", "#c2602e", "#d47a40", "#e4985a"]
P_SOIL = ["#4a1e10", "#5e2814", "#72341a", "#863f22"]
P_ROCK = ["#4a2418", "#5e2e1e", "#743a26", "#8a4830", "#a05a3c"]
P_BASALT = ["#1e1414", "#2a1c1a", "#382420", "#462e28", "#56382e"]
P_FROST = ["#c8b0ac", "#dcc8c4", "#ece0dc", "#f8f0ee", "#ffffff"]
P_DRYICE = ["#b8c8d8", "#d0dce8", "#e4ecf4", "#f4f8ff"]
P_PERC = ["#4a2a6a", "#7040a0", "#9a6acc", "#c8a0f0", "#f0e0ff"]
P_HEMA = ["#202838", "#384458", "#56647a", "#8a9ab0"]
P_LICHEN = ["#3a1a14", "#6a2a1e", "#9a3a26", "#c85a34", "#e88a4a"]
RUST = "#c2602e"


def _hex(c):
    c = c.lstrip("#")
    return np.array([int(c[i:i + 2], 16) for i in (0, 2, 4)], float)


def _img(a):
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8), "RGBA")


def solar_panel(seed):
    """Dusty blue photovoltaic cells in a white frame, a little rust dust settled in the corners."""
    R = rng(seed)
    n = fbm(16, 16, 4, seed, 2)
    a = np.zeros((16, 16, 4))
    a[..., 3] = 255
    for y in range(16):
        for x in range(16):
            if x in (0, 15) or y in (0, 15):
                a[y, x, :3] = _hex("#c8ccd4") if (x + y) % 5 else _hex("#a8acb4")
            elif x in (5, 10) or y in (5, 10):
                a[y, x, :3] = _hex("#8a9ab8")
            else:
                cell = (x // 5 + y // 5) % 2
                base = _hex("#1e3a78") if cell else _hex("#24468a")
                if (x + y) % 7 == 0:
                    base = base * 1.25
                a[y, x, :3] = base
            if n[y, x] > 0.72:
                a[y, x, :3] = a[y, x, :3] * 0.4 + _hex(RUST) * 0.6
    return _img(a)


def hull_plate(seed):
    """Weathered white lander hull: riveted panels, scorch streaks and red dust."""
    n = fbm(16, 16, 4, seed, 3)
    R = rng(seed)
    a = np.zeros((16, 16, 4))
    a[..., 3] = 255
    for y in range(16):
        for x in range(16):
            v = 214 + (n[y, x] - 0.5) * 30
            c = np.array([v, v, v + 4])
            if y in (0, 8) or x == 0:
                c = c * 0.78
            if (x in (2, 13)) and (y in (2, 6, 10, 14)):
                c = np.array([150, 150, 156])
            if n[y, x] < 0.3:
                c = c * 0.55 + _hex(RUST) * 0.45
            a[y, x, :3] = c
    for x in range(3, 13):
        if R.random() < 0.6:
            a[11 + int(R.integers(0, 3)), x, :3] *= 0.62
    return _img(a)


def beacon(seed, frames=8):
    """Derelict lander beacon: a red lamp behind a grille that slowly blinks."""
    out = []
    for f in range(frames):
        on = 0.35 + 0.65 * max(0.0, math.cos(2 * math.pi * f / frames))
        a = np.zeros((16, 16, 4))
        a[..., 3] = 255
        for y in range(16):
            for x in range(16):
                d = math.hypot(x - 7.5, y - 7.5)
                if x in (0, 15) or y in (0, 15):
                    c = _hex("#b8bcc4")
                elif d < 5.5:
                    k = 1 - d / 5.5
                    c = _hex("#5a0a08") * (1 - on) + (_hex("#ff3018") * (0.6 + 0.4 * k) + _hex("#ffd0a0") * k ** 3 * 0.8) * on
                    if y % 3 == 0:
                        c = c * 0.7
                else:
                    c = _hex("#6a6e78")
                a[y, x, :3] = c
        out.append(_img(a))
    return out


def spherules(pal, seed):
    """Hematite 'blueberries': a scatter of tiny shiny grey-blue spheres (plant sprite)."""
    cols = [_hex(c) for c in pal]
    R = rng(seed)
    a = np.zeros((16, 16, 4))
    pts = [(int(R.integers(2, 14)), int(R.integers(13, 15))) for _ in range(6)]
    for cx, cy in pts:
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                x, y = cx + dx, cy + dy
                if 0 <= x < 16 and 0 <= y < 16 and abs(dx) + abs(dy) < 2:
                    a[y, x, :3] = cols[1] if dy >= 0 else cols[2]
                    a[y, x, 3] = 255
        a[cy - 1, cx - 1 if cx > 0 else cx, :3] = cols[3]
        a[cy - 1, cx - 1 if cx > 0 else cx, 3] = 255
        if cy + 1 < 16:
            a[cy + 1, cx, :3] = cols[0]
    return _img(a)


def frost(pal, seed):
    """Carbonic frost: pale pink-white rime with hexagonal sparkle and rusty dust showing through."""
    from gen.textures import snow
    a = np.asarray(snow(pal, seed).convert("RGBA"), float).copy()
    n = fbm(16, 16, 5, seed + ":d", 2)
    for y in range(16):
        for x in range(16):
            if n[y, x] < 0.28:
                a[y, x, :3] = a[y, x, :3] * 0.55 + _hex(P_DUST[3]) * 0.45
    return _img(a)


LANDER = Structure(kind="cuboids", blocks={"main": "rubra_hull_plate", "alt": "rubra_solar_panel", "trim": "rubra_beacon"},
                   size=(3, 5), params={"count": 3, "scatter": 1}, count=1, chance=28)
VENTIFACT = Spire(blocks=[("rubra_rock", 5), ("rubra_dust_soil", 1)], cap="rubra_basalt", height=(10, 22), radius=(2, 4),
                  lean=0.3, count=1, chance=3)

DIMENSION = Dimension(
    id="rubra",
    code="M-4",
    name="Rubra",
    tagline="Rust, dust and two moons in a hurry",
    description=("A cold red planet under a butterscotch sky, where the sunsets are blue and two pebble-sized moons race "
                 "each other overhead. Every step is a bound in the thin gravity; dust storms swallow the basins and "
                 "rime of frozen air crusts the poles. Old landers rust half-buried in the dunes - and on the highlands, "
                 "tall three-legged things still patrol, burning anything that moves."),
    danger=3,
    color=RUST,
    terrain=Terrain(style="craters", stone="rubra_rock", fluid="minecraft:air", sea_level=-63, height=78, amplitude=24,
                    scale=1.3, roughness=0.16, deepslate="rubra_basalt", ores=True,
                    params={"cell_size": 84, "min_radius": 8, "max_radius": 32, "depth": 0.55, "rim": 0.4,
                            "probability": 0.55, "biome_size": 360, "cliffs": True, "cliff_block": "rubra_rock",
                            "peak_block": "rubra_frost", "peak_y": 106, "floating_debris": 0.0}),
    sky=Sky(sky_color="#d49a6a", fog_color="#c98a5e", fog_start=36, fog_end=230, cloud_color="#40f4d8c0",
            cloud_height=260, time="cycle", sunrise_color="#dd6a9ae8", star_brightness=0.45,
            sky_light_color="#ffe0c8", ambient_light=0.05,
            bodies=[Celestial("moon", ["#5a4a40", "#7a6656", "#a08a74"], size=8, yaw=60, pitch=40, speed=900,
                              seed="rubra-phobos"),
                    Celestial("moon", ["#6a5a50", "#8e7a68", "#b8a48e"], size=5, yaw=250, pitch=55, speed=220,
                              seed="rubra-deimos")]),
    blocks=[
        Block("rubra_dust", "Rust Dust", "sand", {"all": tex("sand", P_DUST, seed="rubra-dust")}, hardness=0.5,
              sound="sand", map_color="color_red"),
        Block("rubra_dune_sand", "Red Dune Sand", "sand", {"all": tex("sand", P_DUNE, seed="rubra-dune")}, hardness=0.5,
              sound="sand", map_color="color_orange"),
        Block("rubra_dust_soil", "Oxidized Regolith", "soil", {"all": tex("dirt", P_SOIL, seed="rubra-soil")},
              hardness=0.6, sound="gravel", map_color="terracotta_red"),
        Block("rubra_rock", "Rubra Rock", "stone", {"all": tex("rough_stone", P_ROCK, seed="rubra-rock")}, hardness=1.5,
              map_color="terracotta_red"),
        Block("rubra_basalt", "Rubra Basalt", "stone", {"all": tex("basalt_top", P_BASALT, seed="rubra-basalt")},
              hardness=1.8, sound="basalt", map_color="color_black"),
        Block("rubra_frost", "Carbonic Frost", "soil", {"all": tex(frost, P_FROST, "rubra-frost")}, hardness=0.4,
              sound="snow", tool="shovel", map_color="snow"),
        Block("rubra_dry_ice", "Dry Ice", "hazard", {"all": tex("ice", P_DRYICE, seed="rubra-dryice", alpha=(235, 255))},
              hardness=0.8, sound="glass", tool="pickaxe", damage=1, damage_type="freeze",
              effect="minecraft:slowness", effect_seconds=3, map_color="ice"),
        Block("rubra_co2_geyser", "Frost Geyser", "vent", {
            "top": tex("lamp", ["#6a5a5a", "#a89894", "#e8f0ff", "#ffffff"], seed="rubra-geyser", style="orb"),
            "side": tex(frost, P_FROST, "rubra-frost")}, hardness=0.8, sound="snow", tool="pickaxe",
              particle="minecraft:white_smoke", effect="minecraft:slow_falling", effect_seconds=6, map_color="snow"),
        Block("rubra_perchlorate", "Perchlorate Crystal", "crystal_block",
              {"all": tex("crystal", P_PERC, seed="rubra-perc", shards=7)}, hardness=1.2, light=10, emissive=True,
              map_color="color_purple"),
        Block("rubra_perchlorate_cluster", "Perchlorate Cluster", "crystal_cluster",
              {"cross": tex("crystal_shard_sprite", P_PERC, seed="rubra-perc-bud", count=3)}, hardness=0.4, light=7,
              emissive=True, sound="amethyst_cluster", map_color="color_purple"),
        Block("rubra_hematite", "Hematite Spherules", "plant", {"cross": tex(spherules, P_HEMA, "rubra-berries")},
              hardness=0.0, sound="gravel", fruit="rubra_blueberry", map_color="color_blue"),
        Block("rubra_rust_lichen", "Rust Lichen", "plant", {"cross": tex("grass_tuft", P_LICHEN, seed="rubra-lichen")},
              hardness=0.0, sound="moss", map_color="color_red"),
        Block("rubra_hull_plate", "Lander Hull", "solid", {"all": tex(hull_plate, "rubra-hull")}, hardness=3.0,
              sound="metal", tool="pickaxe", map_color="snow"),
        Block("rubra_solar_panel", "Dusty Solar Panel", "solid", {"all": tex(solar_panel, "rubra-solar")}, hardness=2.0,
              sound="glass", tool="pickaxe", map_color="color_blue"),
        Block("rubra_beacon", "Lander Beacon", "glow", {"all": tex(beacon, "rubra-beacon", frames=8, frametime=5)},
              hardness=2.0, light=12, emissive=True, sound="metal", tool="pickaxe", map_color="color_red"),
    ],
    items=[
        Item("rubra_blueberry", "Martian Blueberry", tex("item_icon", "berry", P_HEMA[1:], seed="rubra-berry"),
             kind="food", food=Food(2, 0.6, fast=True, effects=[Effect("minecraft:resistance", 20, 0),
                                                                Effect("minecraft:jump_boost", 20, 1)]),
             lore="Not a berry. Not blue. Not technically edible. Crunchy, though."),
        Item("rubra_heat_lens", "Heat-Ray Lens", tex("item_icon", "core", ["#5a0a08", "#ff3018", "#ffb070"],
                                                     seed="rubra-lens"),
             rarity="epic", glint=True, lore="Still warm. Point it away from your face."),
        Item("rubra_skimmer_silk", "Skimmer Silk", tex("item_icon", "wing", ["#c86a3a", "#f0c090", "#fff0d8"],
                                                       seed="rubra-silk"),
             lore="Thin enough to read through, strong enough to ride a dust storm."),
    ],
    creatures=[
        Creature("tripod", "Tripod", "tripod", ["#3a3638", "#7a6e66", "#ff3018", "#ff2010"], pattern="plain",
                 size=1.6,
                 body={"legs": 3, "leg_len": 26, "dome": "dome", "dome_w": 16, "dome_h": 9, "eyes": 1, "eye_size": 3,
                       "tentacles": 3, "lights": 6},
                 behavior="hostile", attack="ranged", health=70, damage=6, speed=0.22, armor=8, fire_immune=True,
                 ranged={"color": "#ff3018", "damage": 5, "cooldown": 60, "speed": 1.8, "fire": 3, "size": 0.25,
                         "particle": "minecraft:flame"},
                 drops=[Drop("rubra_heat_lens", 0, 1, chance=0.35), Drop("minecraft:iron_ingot", 1, 3),
                        Drop("minecraft:redstone", 0, 4)],
                 sounds="iron_golem", pitch=0.5, xp=20, group=1, tracking=10,
                 description="Three legs, one eye, no mercy. Its heat-ray sets the dust itself alight."),
        Creature("dust_mite", "Dust Mite", "crawler", ["#b45028", "#e09060", "#f4c898", "#180808"], pattern="speckle",
                 size=0.45, body={"kind": "mite", "legs": 4, "leg_len": 5, "antennae": 3, "eye_style": "cute",
                                  "head_size": 1.2, "fur": True},
                 behavior="passive", health=5, speed=0.28, tempt="rubra_blueberry",
                 drops=[Drop("rubra_blueberry", 0, 1, chance=0.5)],
                 sounds="silverfish", pitch=1.6, xp=1, group=6,
                 description="Fuzzy rust-coloured grazers that roll themselves in dust to stay warm."),
        Creature("sand_skimmer", "Sand Skimmer", "flyer", ["#d4864c", "#f4d0a0", "#ff7a3a", "#201008"], pattern="stripes",
                 size=0.95,
                 body={"kind": "insect", "wings": 2, "wing_span": 15, "wing_w": 5, "body_len": 12, "body_w": 4,
                       "body_h": 4, "eyes": 2, "eye_style": "compound", "tail": 2, "tail_kind": "thin", "antennae": 4},
                 behavior="passive", health=8, speed=0.24,
                 drops=[Drop("rubra_skimmer_silk", 0, 2)],
                 sounds="bee", pitch=0.7, xp=2, group=3,
                 description="Rides the storm fronts on glassy wings, sipping frost from the crater rims."),
    ],
    biomes=[
        Biome("rubra_oxide_plains", "Oxide Plains", top="rubra_dust", under="rubra_dust_soil", temperature=0.0,
              humidity=0.0, grass_color="#b45028", foliage_color="#9a3c1c", water_color="#8a5a4a",
              particles=[("dust:#c86a3a:1.0", 0.004)], ambient="wind_howl", music="minecraft:music.overworld.desert",
              surface_noise=[("rubra_dune_sand", 0.5)],
              features=[
                  Boulder(blocks=[("rubra_rock", 4), ("rubra_basalt", 2)], radius=(1, 3), squash=0.7, count=1, chance=2),
                  Patch(block="rubra_hematite", count=1, tries=6, chance=2),
                  Patch(block="rubra_rust_lichen", count=1, tries=8, chance=2),
                  LANDER,
                  Geode(outer="rubra_basalt", middle="rubra_rock", inner="rubra_perchlorate",
                        crystals=["rubra_perchlorate_cluster"], count=1, chance=18, where="anywhere", y=(-40, 40)),
              ],
              spawns=[Spawn("dust_mite", 10, (3, 6)), Spawn("sand_skimmer", 4, (1, 3)), Spawn("tripod", 1, (1, 1))]),
        Biome("rubra_storm_basin", "Dust Storm Basin", top="rubra_dune_sand", under="rubra_dust_soil", temperature=0.5,
              humidity=0.6, elevation=-0.4, grass_color="#c2602e", foliage_color="#a84a22", water_color="#8a5a4a",
              sky_color="#b8704a", fog_color="#a8603a", fog_end=56,
              particles=[("dust:#c2602e:1.8", 0.06), ("dust:#e4985a:1.2", 0.03), ("minecraft:white_ash", 0.01)],
              ambient="wind_howl", music="minecraft:music.overworld.badlands",
              features=[
                  VENTIFACT,
                  Boulder(blocks=[("rubra_rock", 3), ("rubra_dust", 1)], radius=(1, 2), squash=0.6, count=1, chance=3),
                  Structure(kind="cuboids", blocks={"main": "rubra_hull_plate", "alt": "rubra_solar_panel",
                                                    "trim": "rubra_beacon"},
                            size=(2, 4), params={"count": 2, "scatter": 1}, count=1, chance=20),
              ],
              spawns=[Spawn("sand_skimmer", 8, (2, 4)), Spawn("dust_mite", 6, (2, 4)), Spawn("tripod", 2, (1, 1))]),
        Biome("rubra_highlands", "Tharsis Highlands", top="rubra_dust_soil", under="rubra_rock", temperature=-0.2,
              humidity=-0.7, elevation=0.5, stone="rubra_basalt", grass_color="#72341a", foliage_color="#5e2814",
              water_color="#8a5a4a", sky_color="#cc9064", particles=[("dust:#9a3c1c:0.8", 0.003)],
              ambient="cosmic_drone", music="minecraft:music.overworld.stony_peaks",
              surface_noise=[("rubra_basalt", 0.52)],
              features=[
                  Spire(blocks=[("rubra_basalt", 4), ("rubra_rock", 2)], cap="rubra_rock", height=(14, 30),
                        radius=(2, 5), lean=0.15, count=1, chance=2),
                  CrystalCluster(block="rubra_perchlorate", small="rubra_perchlorate_cluster", size=(3, 7), count=1,
                                 chance=4),
                  Patch(block="rubra_perchlorate_cluster", count=1, tries=6, chance=2),
                  CrystalCluster(where="cave_ceiling", block="rubra_perchlorate", small="rubra_perchlorate_cluster",
                                 size=(2, 5), count=2),
                  LANDER,
              ],
              spawns=[Spawn("tripod", 3, (1, 1)), Spawn("dust_mite", 6, (2, 4)), Spawn("sand_skimmer", 3, (1, 2))]),
        Biome("rubra_frost_cap", "Frost Cap", top="rubra_frost", under="rubra_dust_soil", temperature=-0.9,
              humidity=0.3, grass_color="#dcc8c4", foliage_color="#c8b0ac", water_color="#a0b0d0", sky_color="#c8a28a",
              fog_color="#d8c0b0", snowy=True, precipitation=True, particles=[("minecraft:white_ash", 0.006)],
              ambient="wind_howl", music="minecraft:music.overworld.frozen_peaks",
              features=[
                  Spire(blocks=[("rubra_dry_ice", 3), ("rubra_frost", 1)], height=(6, 16), radius=(1, 3), count=1,
                        chance=2),
                  Patch(block="rubra_co2_geyser", count=1, tries=4),
                  Disk(block="rubra_dry_ice", replace=["rubra_frost"], radius=(2, 4), count=1, chance=2),
                  Patch(block="rubra_hematite", count=1, tries=6, chance=2),
              ],
              spawns=[Spawn("dust_mite", 6, (2, 4)), Spawn("sand_skimmer", 4, (1, 2))]),
    ],
    effects=["low_gravity"],
    ambient="wind_howl",
    music="minecraft:music.overworld.desert",
    icon="portalgun:rubra_heat_lens",
)
