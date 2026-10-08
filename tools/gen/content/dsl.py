"""The dimension description language.

Every dimension lives in tools/gen/content/dims/<id>.py and defines a module-level ``DIMENSION = Dimension(...)``.
The emitters in this package (worldgen.py, blocks.py, creatures.py, ...) turn these objects into data pack JSON,
assets and the /portalgun/content.json spec that the Java side reads.

Conventions
-----------
* Ids are lower_snake_case and globally unique across ALL dimensions (blocks, items, creatures, biomes).
  Prefix with the dimension when a name is generic (e.g. ``sporewood_stone``).
* A "block ref" is either one of this dimension's block ids (``"sporemoss"``) or a full id
  (``"minecraft:stone"``, ``"portalgun:other_block"``).
* Colors are "#rrggbb" strings.
* Textures are described lazily with :func:`tex` so specs stay declarative and cheap to import.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Optional, Union


# --------------------------------------------------------------------------------------------- textures
@dataclass
class Tex:
    """A deferred call to a generator in gen.textures, e.g. tex("stone", ["#222", "#444", "#666"], seed="x")."""
    fn: str
    args: tuple = ()
    kwargs: dict = field(default_factory=dict)
    frames: int = 0          # >0: fn returns a list of frames -> animated texture
    frametime: int = 2


def tex(fn: str, *args, frames: int = 0, frametime: int = 2, **kwargs) -> Tex:
    return Tex(fn, args, kwargs, frames, frametime)


# --------------------------------------------------------------------------------------------- blocks / items
BLOCK_KINDS = {
    # kind            textures roles                 notes
    "solid": ("all",),                               # generic full block; tool picks pickaxe/shovel/axe
    "stone": ("all",),                               # pickaxe, drops itself
    "soil": ("all",),                                # shovel
    "sand": ("all",),                                # falling block (shovel)
    "grass": ("top", "side", "bottom"),              # shovel; plants can grow on it
    "log": ("side", "end"),                          # rotated pillar, axe, #minecraft:logs
    "planks": ("all",),                              # axe
    "leaves": ("all",),                              # cutout, decays away from logs, #minecraft:leaves
    "glass": ("all",),                               # translucent, no occlusion
    "ice": ("all",),                                 # translucent + slippery (friction)
    "glow": ("all",),                                # full light-emitting block
    "crystal_block": ("all",),                       # amethyst-like sound, optional light
    "ore": ("all",),                                 # pickaxe; drop=<item id>, xp
    "slime": ("all",),                               # bouncy, translucent
    "hazard": ("all",),                              # damages entities standing on it (damage=)
    "sticky": ("all",),                              # honey-like: slows movement and jumps
    "vent": ("top", "side"),                         # emits particle= upward (and optional effect=)
    "mushroom_cap": ("all",),                        # huge-mushroom style cap (axe), no tag needs
    "plant": ("cross",),                             # small cross plant, no collision, on any solid top
    "tall_plant": ("bottom", "top"),                 # two-block-tall cross plant
    "hanging_plant": ("cross",),                     # hangs below a solid block (roots, glow bulbs)
    "crystal_cluster": ("cross",),                   # directional (attaches to any face), light, amethyst sound
    "lily": ("top",),                                # floats on water like a lily pad
    "vine": ("face",),                               # multiface growth on walls/ceilings (glow lichen style)
    "carpet": ("all",),                              # thin layer (moss carpet style)
}


@dataclass
class Block:
    id: str
    name: str
    kind: str
    textures: dict[str, Tex]           # role -> Tex, roles per BLOCK_KINDS
    hardness: float = 1.0
    resistance: float = -1.0           # -1 -> same as hardness*3
    sound: str = "stone"               # stone,grass,wood,sand,gravel,glass,amethyst,slime,wool,metal,bone,moss,
    #                                    snow,coral,honey,mud,nether,fungus,basalt,calcite,sculk,chain,copper,
    #                                    cherry,bamboo,froglight,deepslate,tuff,dripstone,soul_sand,powder_snow
    # Full list accepted by Java (dev/portalgun/block/BlockLookups.SOUNDS): empty wood gravel grass lily_pad stone
    #   metal glass wool sand snow powder_snow ladder anvil slime(_block) honey(_block) wet_grass coral(_block) bamboo
    #   bamboo_sapling scaffolding sweet_berry_bush crop hard_crop vine nether_wart lantern stem nylium fungus roots
    #   shroomlight weeping_vines twisting_vines soul_sand soul_soil basalt wart_block netherrack nether nether_bricks
    #   nether_sprouts nether_ore bone(_block) netherite(_block) ancient_debris lodestone chain nether_gold_ore
    #   gilded_blackstone candle amethyst amethyst_cluster crystal small/medium/large_amethyst_bud tuff tuff_bricks
    #   polished_tuff calcite dripstone(_block) pointed_dripstone copper copper_bulb copper_grate cave_vines
    #   spore_blossom cactus_flower azalea flowering_azalea moss_carpet pink_petals petals leaf_litter moss
    #   big_dripleaf small_dripleaf rooted_dirt hanging_roots azalea_leaves leaves sculk_sensor sculk_catalyst sculk
    #   sculk_vein sculk_shrieker glow_lichen deepslate deepslate_bricks deepslate_tiles polished_deepslate froglight
    #   frogspawn mangrove_roots muddy_mangrove_roots mud mud_bricks packed_mud hanging_sign bamboo_wood nether_wood
    #   cherry(_wood) cherry_sapling cherry_leaves chiseled_bookshelf suspicious_sand suspicious_gravel decorated_pot
    #   trial_spawner sponge wet_sponge vault creaking_heart heavy_core cobweb spawner resin resin_bricks iron
    #   dried_ghast
    light: int = 0                     # light level 0-15
    tool: Optional[str] = None         # pickaxe/axe/shovel/hoe/None(hand); default by kind
    map_color: str = "stone"           # a vanilla MapColor name (lower case, e.g. "color_purple", "grass", "sand")
    friction: float = 0.6
    jump: float = 1.0
    speed: float = 1.0
    bounce: float = 0.0
    damage: float = 0.0                # hazard: damage per second while standing on it
    flammable: bool = False
    particle: Optional[str] = None     # vent/ambient particle id, e.g. "minecraft:white_smoke"
    effect: Optional[str] = None       # vent/hazard status effect id applied on contact
    emissive: bool = False             # render full-bright (glowing textures)
    drop: Optional[str] = None         # ore/leaves etc.: item id dropped instead of the block
    drop_count: tuple[int, int] = (1, 1)
    xp: tuple[int, int] = (0, 0)
    fruit: Optional[str] = None        # plant: item dropped when broken (in addition to/instead of itself)
    tint: Optional[str] = None         # optional color multiplied onto the textures at generation time
    creative: bool = True              # list in the creative tab
    effect_seconds: float = 5          # duration of `effect` per contact
    effect_amplifier: int = 0
    damage_type: Optional[str] = None  # hazard flavour: hot_floor (default) cactus magic freeze wither generic
    #                                    sweet_berry_bush lightning


@dataclass
class Effect:
    id: str                             # e.g. "minecraft:jump_boost"
    seconds: float = 5
    amplifier: int = 0
    chance: float = 1.0


@dataclass
class Food:
    nutrition: int = 4
    saturation: float = 0.3
    always: bool = False
    fast: bool = False
    effects: list[Effect] = field(default_factory=list)


@dataclass
class Item:
    id: str
    name: str
    icon: Tex                           # usually tex("item_icon", "<kind>", palette, seed=...)
    kind: str = "material"              # material / food
    food: Optional[Food] = None
    rarity: str = "common"              # common/uncommon/rare/epic
    glint: bool = False
    stack: int = 64
    lore: Optional[str] = None          # one-line flavour text shown in the tooltip


# --------------------------------------------------------------------------------------------- terrain
TERRAIN_STYLES = (
    "hills", "mountains", "flat", "islands", "ocean", "sky_islands", "caves", "planetoids", "pillars",
    "terraces", "canyons", "sponge", "inverted", "cubes", "craters", "dunes", "spikes", "blobs", "cells", "layers",
)


@dataclass
class Terrain:
    style: str                          # one of TERRAIN_STYLES
    stone: str                          # default block (block ref)
    fluid: str = "minecraft:water"      # default fluid block (water, lava or minecraft:air for none)
    sea_level: int = 63
    height: int = 72                    # typical surface y
    amplitude: float = 20               # typical vertical variation (blocks)
    scale: float = 1.0                  # horizontal stretch (>1 = broader features)
    roughness: float = 0.3              # 0..1 strength of 3D noise (overhangs/chaos)
    caves: bool = True                  # carve noise caves
    min_y: int = -64
    total_height: int = 384
    bedrock_floor: bool = True
    bedrock_roof: bool = False          # true for 'caves' style
    deepslate: Optional[str] = None     # block ref used below y=0 (like deepslate) or None
    ores: bool = True                   # sprinkle vanilla ores (coal/iron/copper/gold/diamond...) in the stone
    params: dict[str, Any] = field(default_factory=dict)   # style specific knobs (documented in worldgen.py)


# --------------------------------------------------------------------------------------------- sky
@dataclass
class Celestial:
    """An extra body drawn in the sky by the client (planets, rings, extra suns...)."""
    texture: str                        # generator name in gen.sky_art: planet, ringed_planet, sun, moon, nebula, eye, ...
    colors: list[str] = field(default_factory=list)
    size: float = 30                    # vanilla sun is 30
    yaw: float = 0                      # direction around the horizon (deg)
    pitch: float = 60                   # elevation (deg, 90 = zenith)
    roll: float = 0
    speed: float = 0                    # deg per day of slow drift (0 = fixed)
    alpha: float = 1.0
    additive: bool = False
    seed: str = ""


@dataclass
class Sky:
    sky_color: str = "#78a7ff"
    fog_color: str = "#c0d8ff"
    water_fog_color: Optional[str] = None
    fog_start: Optional[float] = None   # blocks; None = vanilla default (no thick fog)
    fog_end: Optional[float] = None
    cloud_color: Optional[str] = "#ccffffff"   # "#aarrggbb"; None = no clouds
    cloud_height: float = 192.33
    sunrise_color: Optional[str] = None # "#aarrggbb" tint of sunrise/sunset glow
    time: Union[str, int] = "cycle"     # "cycle" (normal day/night) or fixed: "day","noon","dusk","dawn","night","midnight" or ticks
    skybox: str = "overworld"           # overworld / end / none
    star_brightness: Optional[float] = None   # override stars (0..1), e.g. 1.0 for space dims with fixed day
    sky_light_color: Optional[str] = None
    sky_light_factor: Optional[float] = None  # <1 darkens skylight
    ambient_light: float = 0.0          # dimension_type ambient_light (0..1): >0 makes darkness less dark
    has_skylight: bool = True
    moon_phase: Optional[str] = None    # e.g. "full_moon", "new_moon"
    bodies: list[Celestial] = field(default_factory=list)


# --------------------------------------------------------------------------------------------- features
@dataclass
class Feature:
    """Base for all placed features. `count` per chunk (int or (min,max)); `chance` = 1/N rarity filter."""
    count: Union[int, tuple[int, int]] = 1
    chance: int = 0                     # 0 = always; N = once every N chunks
    where: str = "surface"              # surface | underwater | cave_floor | cave_ceiling | air | anywhere | water_surface
    y: Optional[tuple[int, int]] = None # absolute y range (for underground/anywhere/air placement)


@dataclass
class Tree(Feature):
    log: str = ""
    leaves: str = ""
    shape: str = "oak"                  # oak fancy birch spruce pine acacia dark_oak jungle mega_jungle cherry bush
    #                                     palm (custom) twisted (custom) mushroom_like (custom)
    height: tuple[int, int] = (4, 7)
    decoration: Optional[str] = None    # block ref hung from leaves (vines/bulbs/fruit) or None
    on: Optional[list[str]] = None      # restrict to these ground blocks (default: anything solid)


@dataclass
class GiantPlant(Feature):
    """Custom stem + head plants: giant mushrooms, lollipops, gumdrop trees, giant flowers, palm trees..."""
    stem: str = ""
    head: str = ""
    shape: str = "dome"                 # dome flat sphere cone flower(petal ring) puff(cluster of spheres) umbrella palm tuft
    height: tuple[int, int] = (6, 12)
    radius: tuple[int, int] = (3, 5)
    decoration: Optional[str] = None    # spots/center/fruit block ref
    stem_width: int = 1                 # 1..3
    bend: float = 0.0                   # 0..1 stem curvature


@dataclass
class Patch(Feature):
    """Scatter of small plants / blocks on the ground (or underwater/ceilings via `where`)."""
    block: str = ""
    tries: int = 32
    spread: int = 7
    blocks: Optional[list[tuple[str, int]]] = None   # weighted mix instead of `block`


@dataclass
class Ore(Feature):
    block: str = ""
    replace: list[str] = field(default_factory=list)  # block refs/tags it may replace (default: dimension stone)
    size: int = 8


@dataclass
class Disk(Feature):
    block: str = ""
    replace: list[str] = field(default_factory=list)
    radius: tuple[int, int] = (2, 5)


@dataclass
class Boulder(Feature):
    """Noisy blob of blocks: rocks, scrap piles, cheese chunks, cloud puffs (where='air'), bubbles (hollow)."""
    blocks: list[tuple[str, int]] = field(default_factory=list)   # weighted
    radius: tuple[int, int] = (2, 4)
    hollow: bool = False
    squash: float = 1.0                 # vertical scale (<1 flatter)


@dataclass
class Spire(Feature):
    """Tapered spike/column: crystal spires, ice spikes, hoodoos, stalagmites (hanging=True for stalactites)."""
    blocks: list[tuple[str, int]] = field(default_factory=list)
    tip: Optional[str] = None
    height: tuple[int, int] = (6, 18)
    radius: tuple[int, int] = (1, 3)
    lean: float = 0.0                   # 0..1
    hanging: bool = False
    cap: Optional[str] = None           # block for a mushroom-like cap (hoodoos)


@dataclass
class CrystalCluster(Feature):
    """Spray of crystal spikes radiating out of a point (floor/ceiling/walls)."""
    block: str = ""
    small: Optional[str] = None         # crystal_cluster block placed around the base
    size: tuple[int, int] = (3, 7)


@dataclass
class Structure(Feature):
    """Parametric custom structures implemented in Java (see worldgen.py for each kind's params)."""
    kind: str = "arch"                  # arch ring gear ribcage lily_pad monolith geyser cuboids tendril nest
    blocks: dict[str, str] = field(default_factory=dict)   # role -> block ref (kind-specific roles)
    size: tuple[int, int] = (4, 8)
    params: dict[str, Any] = field(default_factory=dict)


@dataclass
class Lake(Feature):
    fluid: str = "minecraft:water"
    border: Optional[str] = None


@dataclass
class Vanilla(Feature):
    """Reuse a vanilla placed feature by id (placement included), e.g. Vanilla(id='minecraft:kelp_cold')."""
    id: str = ""


@dataclass
class Geode(Feature):
    outer: str = "minecraft:smooth_basalt"
    middle: str = "minecraft:calcite"
    inner: str = "minecraft:amethyst_block"
    budding: Optional[str] = None
    crystals: list[str] = field(default_factory=list)


# --------------------------------------------------------------------------------------------- biomes
@dataclass
class Spawn:
    creature: str                       # creature id (this mod) or vanilla entity id "minecraft:..."
    weight: int = 10
    group: tuple[int, int] = (1, 3)


@dataclass
class Biome:
    id: str
    name: str
    top: str                            # surface block
    under: str                          # 3-4 blocks below the top
    temperature: float = 0.0            # -1..1 climate coordinate for biome placement (not vanilla temperature)
    humidity: float = 0.0               # -1..1
    elevation: Optional[float] = None   # -1..1 bias toward low/high terrain (optional)
    underwater: Optional[str] = None    # block for surfaces below the fluid
    stone: Optional[str] = None         # override dimension stone for this biome's surface layers
    grass_color: Optional[str] = None
    foliage_color: Optional[str] = None
    water_color: str = "#3f76e4"
    water_fog_color: Optional[str] = None
    sky_color: Optional[str] = None     # overrides Sky.sky_color in this biome
    fog_color: Optional[str] = None
    fog_end: Optional[float] = None
    particles: list[tuple[str, float]] = field(default_factory=list)   # (particle id or "dust:#rrggbb:scale", probability)
    music: Optional[str] = None         # sound event id (vanilla music.*) or None for dimension default
    ambient: Optional[str] = None       # one of ModSounds.AMBIENT_LOOPS names (looped ambience)
    snowy: bool = False                 # vanilla temperature < 0.15 (snow instead of rain, ice on water)
    precipitation: bool = False
    features: list[Feature] = field(default_factory=list)
    spawns: list[Spawn] = field(default_factory=list)
    surface_noise: list[tuple[str, float]] = field(default_factory=list)  # (block ref, threshold) noise patches on the surface


# --------------------------------------------------------------------------------------------- creatures
@dataclass
class Drop:
    item: str                           # item id (this mod's item id or "minecraft:...")
    min: int = 0
    max: int = 1
    chance: float = 1.0
    cooked: Optional[str] = None        # dropped instead when killed while on fire


@dataclass
class Creature:
    """A mob. Anatomy is generated procedurally from `archetype` + `body` params (see creatures.py)."""
    id: str
    name: str
    archetype: str                      # quadruped biped flyer floater blob crawler serpent swimmer golem eye hopper tripod plantoid snail
    colors: list[str]                   # [primary, secondary, accent, eye] (+ optional more)
    pattern: str = "plain"              # plain spots stripes speckle gradient scales crystal veins patches glow_lines checker
    size: float = 1.0                   # overall scale multiplier (1 = roughly cow/zombie sized for its archetype)
    body: dict[str, Any] = field(default_factory=dict)  # archetype-specific anatomy knobs (legs, horns, tail...)
    behavior: str = "passive"           # passive skittish neutral hostile
    attack: str = "melee"               # melee ranged explode none
    health: float = 10
    damage: float = 2
    speed: float = 0.25                 # movement speed attribute
    armor: float = 0
    abilities: list[str] = field(default_factory=list)   # teleport leap regen thorns glow_aura split charge burrow ...
    on_hit: Optional[Effect] = None     # status effect applied by melee hits
    ranged: Optional[dict[str, Any]] = None   # {color, damage, effect: Effect, cooldown, speed, explode, count}
    fire_immune: bool = False
    glow_eyes: bool = True
    emissive: bool = False              # whole body glows (full bright)
    category: Optional[str] = None      # monster creature ambient water_creature water_ambient (default from behavior/archetype)
    placement: Optional[str] = None     # ground water air (default from archetype)
    spawn_light: str = "any"            # any / dark
    tempt: Optional[str] = None         # item that tempts/feeds it
    drops: list[Drop] = field(default_factory=list)
    sounds: Optional[str] = None        # vanilla sound family to borrow: cow pig sheep wolf spider zombie slime frog
    #                                     bat phantom enderman guardian squid fox goat camel bee silverfish skeleton
    #                                     blaze ghast strider hoglin warden allay sniffer armadillo breeze ...
    pitch: float = 1.0
    xp: int = 3
    description: str = ""
    movement: Optional[str] = None      # ground flying floating swimming amphibious hopping (default from archetype)
    group: int = 4                      # max spawn cluster size
    tracking: int = 0                   # client tracking range in chunks (0 = from size)


# --------------------------------------------------------------------------------------------- dimension
@dataclass
class Dimension:
    id: str
    code: str                           # dial code, e.g. "D-716"
    name: str
    tagline: str                        # one line for the dial
    description: str                    # 2-4 sentences for the dial info panel
    danger: int                         # 1..5
    color: str                          # theme color for the dial
    terrain: Terrain
    sky: Sky
    biomes: list[Biome]
    blocks: list[Block] = field(default_factory=list)
    items: list[Item] = field(default_factory=list)
    creatures: list[Creature] = field(default_factory=list)
    effects: list[str] = field(default_factory=list)   # low_gravity floaty high_gravity lightning darkness water_breathing glitch heat
    platform: Optional[str] = None      # block ref used for emergency arrival platforms (default: terrain.stone)
    arrival: Optional[str] = None       # surface / cave / void (default from terrain style)
    arrival_y: Optional[int] = None     # y used when building a platform / searching (default from terrain)
    music: Optional[str] = None         # dimension-wide background music sound event
    ambient: Optional[str] = None       # dimension-wide ambient loop (biomes may override)
    icon: Optional[str] = None          # item id used for this dimension's advancement icon
