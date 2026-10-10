"""Shared worldgen building blocks: vanilla feature lists, noise router, biome and surface-rule shells."""
from wg.dsl import (add, interpolated, mul, ref, range_choice, rl, sr_block, sr_if, sr_seq, state, ygrad, c_above_preliminary,
                    c_vgradient, dmin, dmax, cache_once, spline, sub)

STEPS = 11
FLAT_CARVERS = ['minecraft:cave', 'minecraft:cave_extra_underground']
RAW_GENERATION, LAKES, LOCAL_MODIFICATIONS, UNDERGROUND_STRUCTURES, SURFACE_STRUCTURES, STRONGHOLDS, UNDERGROUND_ORES, \
    UNDERGROUND_DECORATION, FLUID_SPRINGS, VEGETAL_DECORATION, TOP_LAYER_MODIFICATION = range(STEPS)

ORES = ['minecraft:ore_dirt', 'minecraft:ore_gravel', 'minecraft:ore_granite_upper', 'minecraft:ore_granite_lower',
        'minecraft:ore_diorite_upper', 'minecraft:ore_diorite_lower', 'minecraft:ore_andesite_upper', 'minecraft:ore_andesite_lower',
        'minecraft:ore_tuff', 'minecraft:ore_coal_upper', 'minecraft:ore_coal_lower', 'minecraft:ore_iron_upper', 'minecraft:ore_iron_middle',
        'minecraft:ore_iron_small', 'minecraft:ore_gold', 'minecraft:ore_gold_lower', 'minecraft:ore_redstone', 'minecraft:ore_redstone_lower',
        'minecraft:ore_diamond', 'minecraft:ore_diamond_medium', 'minecraft:ore_diamond_large', 'minecraft:ore_diamond_buried',
        'minecraft:ore_lapis', 'minecraft:ore_lapis_buried', 'minecraft:ore_copper', 'minecraft:underwater_magma', 'minecraft:disk_sand',
        'minecraft:disk_clay', 'minecraft:disk_gravel']


def cover_config(entries, density, biomes, scale, influence, salt, patches=()):
    """Config of an earthscapes:ground_cover feature. patches: (entries, threshold, noise scale, chance) where a different
    plant mix grows wherever the patch noise (-1..1) is above the threshold."""
    from wg.dsl import weighted
    cfg = {'state': weighted(*entries), 'density': density, 'noise_scale': scale, 'noise_influence': influence,
           'biomes': [rl(b) for b in biomes], 'salt': salt}
    if patches:
        cfg['patches'] = [{'state': weighted(*pe), 'threshold': th, 'noise_scale': sc, 'chance': ch} for pe, th, sc, ch in patches]
    return cfg


def base_features(fossils=False, lava_surface=False):
    """Vanilla underground feature lists for steps 0-8 (identical ordering to vanilla biomes)."""
    f = [[] for _ in range(STEPS)]
    f[LAKES] = ['minecraft:lake_lava_underground'] + (['minecraft:lake_lava_surface'] if lava_surface else [])
    f[LOCAL_MODIFICATIONS] = ['minecraft:amethyst_geode']
    f[UNDERGROUND_STRUCTURES] = (['minecraft:fossil_upper', 'minecraft:fossil_lower'] if fossils else []) + \
        ['minecraft:monster_room', 'minecraft:monster_room_deep']
    f[UNDERGROUND_ORES] = list(ORES)
    f[FLUID_SPRINGS] = ['minecraft:spring_water', 'minecraft:spring_lava']
    f[VEGETAL_DECORATION] = ['minecraft:glow_lichen']
    f[TOP_LAYER_MODIFICATION] = []
    return f


def spawn(entity, weight, lo, hi):
    return {'type': entity if ':' in entity else 'minecraft:' + entity, 'weight': weight, 'minCount': lo, 'maxCount': hi}


MONSTERS = [spawn('spider', 100, 4, 4), spawn('zombie', 95, 4, 4), spawn('zombie_villager', 5, 1, 1), spawn('skeleton', 100, 4, 4),
            spawn('creeper', 100, 4, 4), spawn('slime', 100, 4, 4), spawn('enderman', 10, 1, 4), spawn('witch', 5, 1, 1)]
DESERT_MONSTERS = [spawn('spider', 100, 4, 4), spawn('zombie', 19, 4, 4), spawn('zombie_villager', 1, 1, 1), spawn('skeleton', 50, 4, 4),
                   spawn('creeper', 100, 4, 4), spawn('slime', 100, 4, 4), spawn('enderman', 10, 1, 4), spawn('witch', 5, 1, 1),
                   spawn('husk', 80, 4, 4), spawn('parched', 50, 4, 4)]
AMBIENT = [spawn('bat', 10, 8, 8)]
UNDERGROUND_WATER = [spawn('glow_squid', 10, 4, 6)]


def biome(temperature, downfall, precipitation, effects, attributes, features, creatures, monsters=None, water_creature=None,
          water_ambient=None, carvers=None, creature_probability=None, misc=None):
    b = {
        'attributes': attributes,
        'carvers': carvers if carvers is not None else ['minecraft:cave', 'minecraft:cave_extra_underground', 'minecraft:canyon'],
        'downfall': downfall,
        'effects': effects,
        'features': features,
        'has_precipitation': precipitation,
        'spawn_costs': {},
        'spawners': {
            'ambient': AMBIENT,
            'axolotls': [],
            'creature': creatures,
            'misc': misc or [],
            'monster': monsters if monsters is not None else MONSTERS,
            'underground_water_creature': UNDERGROUND_WATER,
            'water_ambient': water_ambient or [],
            'water_creature': water_creature or [],
        },
        'temperature': temperature,
    }
    if creature_probability is not None:
        b['creature_spawn_probability'] = creature_probability
    return b


def music(sound):
    return {'default': {'max_delay': 24000, 'min_delay': 12000, 'sound': sound}}


def attrs(sky, fog, water_fog=None, fog_start=None, fog_end=None, music_sound=None, extra=None):
    a = {'minecraft:visual/sky_color': sky, 'minecraft:visual/fog_color': fog}
    if water_fog:
        a['minecraft:visual/water_fog_color'] = water_fog
    if fog_start is not None:
        a['minecraft:visual/fog_start_distance'] = float(fog_start)
    if fog_end is not None:
        a['minecraft:visual/fog_end_distance'] = float(fog_end)
    if music_sound:
        a['minecraft:audio/background_music'] = music(music_sound)
    if extra:
        a.update(extra)
    return a


def effects(water, grass=None, foliage=None, dry_foliage=None):
    e = {'water_color': water}
    if grass:
        e['grass_color'] = grass
    if foliage:
        e['foliage_color'] = foliage
    if dry_foliage:
        e['dry_foliage_color'] = dry_foliage
    return e


# ---------------------------------------------------------------------------- noise router

def final_density(sloped_cheese, top_from=300, top_to=320, entrances=True):
    """Vanilla overworld final density with our own height-field 'sloped cheese' plugged in."""
    near_surface = dmin(sloped_cheese, mul(5.0, 'minecraft:overworld/caves/entrances')) if entrances else sloped_cheese
    underground = dmax(
        dmin(
            dmin(
                add(mul(4.0, {'type': 'minecraft:square', 'argument': {'type': 'minecraft:noise', 'noise': 'minecraft:cave_layer',
                                                                        'xz_scale': 1.0, 'y_scale': 8.0}}),
                    add({'type': 'minecraft:clamp', 'input': add(0.27, {'type': 'minecraft:noise', 'noise': 'minecraft:cave_cheese',
                                                                         'xz_scale': 1.0, 'y_scale': 0.6666666666666666}),
                         'min': -1.0, 'max': 1.0},
                        {'type': 'minecraft:clamp', 'input': add(1.5, mul(-0.64, sloped_cheese)), 'min': 0.0, 'max': 0.5})),
                'minecraft:overworld/caves/entrances'),
            add('minecraft:overworld/caves/spaghetti_2d', 'minecraft:overworld/caves/spaghetti_roughness_function')),
        range_choice('minecraft:overworld/caves/pillars', -1000000.0, 0.03, -1000000.0, 'minecraft:overworld/caves/pillars'))
    body = add(0.078125, range_choice(sloped_cheese, -1000000.0, 1.5625, near_surface, underground))
    body = add(-0.078125, mul(ygrad(top_from, top_to, 1.0, 0.0), body))
    body = add(-0.1171875, body)
    body = add(0.1171875, mul(ygrad(-64, -40, 0.0, 1.0), body))
    # noodle caves stay at least ~20 blocks below the surface so they never riddle dunes and plains
    noodle = dmax('minecraft:overworld/caves/noodle', sub(2.5, sloped_cheese))
    return dmin({'type': 'minecraft:squeeze', 'argument': mul(0.64, interpolated({'type': 'minecraft:blend_density', 'argument': body}))},
                noodle)


VANILLA_AUX = {
    'barrier': {'type': 'minecraft:noise', 'noise': 'minecraft:aquifer_barrier', 'xz_scale': 1.0, 'y_scale': 0.5},
    'fluid_level_floodedness': {'type': 'minecraft:noise', 'noise': 'minecraft:aquifer_fluid_level_floodedness', 'xz_scale': 1.0, 'y_scale': 0.67},
    'fluid_level_spread': {'type': 'minecraft:noise', 'noise': 'minecraft:aquifer_fluid_level_spread', 'xz_scale': 1.0,
                           'y_scale': 0.7142857142857143},
    'lava': {'type': 'minecraft:noise', 'noise': 'minecraft:aquifer_lava', 'xz_scale': 1.0, 'y_scale': 1.0},
    'vein_toggle': {'type': 'minecraft:interpolated', 'argument': {'type': 'minecraft:range_choice', 'input': 'minecraft:y', 'max_exclusive': 51.0,
                                                                  'min_inclusive': -60.0, 'when_in_range': {'type': 'minecraft:noise',
                                                                                                            'noise': 'minecraft:ore_veininess',
                                                                                                            'xz_scale': 1.5, 'y_scale': 1.5},
                                                                  'when_out_of_range': 0.0}},
    'vein_ridged': {'type': 'minecraft:add', 'argument1': -0.07999999821186066, 'argument2': {'type': 'minecraft:max', 'argument1': {
        'type': 'minecraft:abs', 'argument': {'type': 'minecraft:interpolated', 'argument': {
            'type': 'minecraft:range_choice', 'input': 'minecraft:y', 'max_exclusive': 51.0, 'min_inclusive': -60.0,
            'when_in_range': {'type': 'minecraft:noise', 'noise': 'minecraft:ore_vein_a', 'xz_scale': 4.0, 'y_scale': 4.0},
            'when_out_of_range': 0.0}}}, 'argument2': {'type': 'minecraft:abs', 'argument': {'type': 'minecraft:interpolated', 'argument': {
                'type': 'minecraft:range_choice', 'input': 'minecraft:y', 'max_exclusive': 51.0, 'min_inclusive': -60.0,
                'when_in_range': {'type': 'minecraft:noise', 'noise': 'minecraft:ore_vein_b', 'xz_scale': 4.0, 'y_scale': 4.0},
                'when_out_of_range': 0.0}}}}},
    'vein_gap': {'type': 'minecraft:noise', 'noise': 'minecraft:ore_gap', 'xz_scale': 1.0, 'y_scale': 1.0},
}


def router(height, sloped_cheese, temperature, vegetation, continents, erosion, ridges, depth, entrances=False, top=(300, 320)):
    r = dict(VANILLA_AUX)
    r.update({
        'continents': continents,
        'depth': depth,
        'erosion': erosion,
        'final_density': final_density(sloped_cheese, top[0], top[1], entrances),
        # Aquifers only flood terrain whose preliminary surface lies well below sea level: report
        # low ground (river beds, lake bowls) 9 blocks deeper so that it fills with water.
        'preliminary_surface_level': sub(height, mul(9.0, spline(height, [(62.0, 1.0), (66.0, 0.0)]))),
        'ridges': ridges,
        'temperature': temperature,
        'vegetation': vegetation,
    })
    return dict(sorted(r.items()))


def noise_settings(router_obj, surface_rule, spawn_target, sea_level=63):
    return {
        'aquifers_enabled': True,
        'default_block': {'Name': 'minecraft:stone'},
        'default_fluid': {'Name': 'minecraft:water', 'Properties': {'level': '0'}},
        'disable_mob_generation': False,
        'legacy_random_source': False,
        'noise': {'height': 384, 'min_y': -64, 'size_horizontal': 1, 'size_vertical': 2},
        'noise_router': router_obj,
        'ore_veins_enabled': True,
        'sea_level': sea_level,
        'spawn_target': spawn_target,
        'surface_rule': surface_rule,
    }


def surface_shell(world_rules):
    return sr_seq(
        sr_if(c_vgradient('minecraft:bedrock_floor', {'above_bottom': 0}, {'above_bottom': 5}), sr_block(state('bedrock'))),
        sr_if(c_above_preliminary(), world_rules),
        sr_if(c_vgradient('minecraft:deepslate', {'absolute': 0}, {'absolute': 8}), sr_block(state('deepslate', axis='y'))),
    )


def param(t=(-2, 2), h=(-2, 2), c=(-2, 2), e=(-2, 2), w=(-2, 2), d=0.0, offset=0.0):
    def rng(v):
        if isinstance(v, (int, float)):
            return float(v)
        return [float(v[0]), float(v[1])]
    return {'temperature': rng(t), 'humidity': rng(h), 'continentalness': rng(c), 'erosion': rng(e), 'weirdness': rng(w),
            'depth': rng(d), 'offset': float(offset)}


def world_preset(name):
    return {
        'dimensions': {
            'minecraft:overworld': {
                'type': 'minecraft:overworld',
                'generator': {'type': 'minecraft:noise', 'biome_source': {'type': 'minecraft:multi_noise', 'biomes': []},
                              'settings': rl(name)},
            },
            'minecraft:the_end': {'type': 'minecraft:the_end', 'generator': {'type': 'minecraft:noise', 'biome_source': {
                'type': 'minecraft:the_end'}, 'settings': 'minecraft:end'}},
            'minecraft:the_nether': {'type': 'minecraft:the_nether', 'generator': {'type': 'minecraft:noise', 'biome_source': {
                'type': 'minecraft:multi_noise', 'preset': 'minecraft:nether'}, 'settings': 'minecraft:nether'}},
        }
    }
