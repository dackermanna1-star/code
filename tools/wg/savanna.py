"""African Savanna world type: golden Serengeti grass plains under umbrella-thorn acacias, granite
kopjes, red-earth Tsavo bush with baobabs and termite mounds, fever-tree rivers with watering holes,
and blue Rift-Valley highlands on the horizon."""
from wg.common import (cover_config, FLAT_CARVERS, LOCAL_MODIFICATIONS, MONSTERS, TOP_LAYER_MODIFICATION, VEGETAL_DECORATION, attrs, base_features, biome, effects,
                       noise_settings, param, router, spawn, surface_shell, world_preset)
from wg.dsl import (ON_FLOOR, UNDER_FLOOR, add, adds, biome_filter, c_biome, c_noise, c_not, c_steep, c_water, c_y_above, cell_bumps,
                    count, dabs, dmax, dmin, eroded, es, flat_cache, funiform, heightmap, in_square, lerp, mul, noise, rarity, rl, shifted,
                    simple, spline, sr_block, sr_if, sr_seq, square, state, sub, uniform, water_depth, weighted, weighted_int, smooth_ramp)

W = 'savanna'
PLAINS, WOODLAND, RED_EARTH, BAOBAB, KOPJES, HIGHLANDS, RIVERINE, RIVER = (
    'serengeti_plains', 'acacia_woodland', 'tsavo_red_earth', 'baobab_savanna', 'kopje_plains', 'rift_highlands',
    'fever_tree_riverine', 'savanna_river')
ALL = [PLAINS, WOODLAND, RED_EARTH, BAOBAB, KOPJES, HIGHLANDS, RIVERINE, RIVER]


def build(reg):
    # ------------------------------------------------------------------ noises
    n = {}
    for name, first, amps in (('base', -10, [1.0, 0.6, 0.3]), ('roll', -8, [1.0, 0.5, 0.25]), ('detail', -6, [1.0, 0.5]),
                              ('highland', -11, [1.0, 0.6, 0.3]), ('mountain', 0, [1.0]), ('river', -10, [1.0, 0.5, 0.2]),
                              ('aridity', -10, [1.0, 0.6, 0.3]), ('trees', -8, [1.0, 0.6, 0.3]), ('kopje', -9, [1.0, 0.5]),
                              ('waterhole', 0, [1.0])):
        n[name] = reg.noise('%s/%s' % (W, name), first, amps)

    # ------------------------------------------------------------------ terrain
    highland = reg.df(W + '/highland', flat_cache(smooth_ramp(shifted(n['highland']), 0.3, 0.55)))
    mountains = reg.df(W + '/mountains', flat_cache(eroded(n['mountain'], 1.0 / 360.0, octaves=7, erosion=1.1, ridged=True)))
    river = reg.df(W + '/river', flat_cache(dabs(shifted(n['river']))))
    waterholes = reg.df(W + '/waterholes', flat_cache(cell_bumps(n['waterhole'], 176, 0.22, 10.0, 24.0, 1.0, 1.0, edge=2.0, profile=1.0)))
    land = reg.df(W + '/land', adds(
        72.0,
        mul(5.0, noise(n['base'])),
        mul(2.2, noise(n['roll'])),
        mul(0.7, noise(n['detail'])),
        mul(highland, add(16.0, mul(165.0, dmax(0.0, mountains))))))
    valley = spline(river, [(0.0, 1.0), (0.02, 1.0), (0.06, 0.0)])
    channel = spline(river, [(0.0, 1.0), (0.0105, 1.0), (0.017, 0.0)])
    h = lerp(valley, land, 66.0)
    h = lerp(channel, h, 58.0)
    h = sub(h, mul(mul(waterholes, 13.0), mul(sub(1.0, highland), sub(1.0, valley))))
    height = reg.df(W + '/height', flat_cache(h))
    sloped = reg.df(W + '/sloped_cheese', mul(sub(height, 'minecraft:y'), 0.125))
    depth = reg.df(W + '/depth', mul(sub(dmin(height, 96.0), 'minecraft:y'), 1.0 / 80.0))
    temperature = reg.df(W + '/aridity', flat_cache(shifted(n['aridity'])))
    vegetation = reg.df(W + '/trees', flat_cache(shifted(n['trees'])))
    erosion = reg.df(W + '/kopje', flat_cache(shifted(n['kopje'])))

    # ------------------------------------------------------------------ features
    acacia_log = state('acacia_log', axis='y')
    acacia_wood = state('acacia_wood', axis='y')
    reg.cf('tree/umbrella_thorn', 'umbrella_tree', {
        'trunk': simple(acacia_log), 'branch': simple(acacia_wood), 'leaves': simple(es('umbrella_thorn_leaves')),
        'trunk_height': uniform(3, 5), 'crown_height': uniform(3, 5), 'crown_radius': uniform(5, 8), 'branches': uniform(2, 4),
        'density': 0.85, 'thickness': 2, 'lean': 0.25})
    reg.cf(W + '/umbrella_thorn_young', 'umbrella_tree', {
        'trunk': simple(acacia_log), 'branch': simple(acacia_wood), 'leaves': simple(es('umbrella_thorn_leaves')),
        'trunk_height': uniform(2, 3), 'crown_height': uniform(2, 3), 'crown_radius': uniform(3, 4), 'branches': uniform(2, 3),
        'density': 0.8, 'thickness': 1, 'lean': 0.2})
    reg.cf('tree/fever_tree', 'umbrella_tree', {
        'trunk': simple(es('fever_tree_log', axis='y')), 'branch': simple(es('fever_tree_wood', axis='y')),
        'leaves': simple(es('fever_tree_leaves')), 'trunk_height': uniform(6, 9), 'crown_height': uniform(4, 6),
        'crown_radius': uniform(4, 6), 'branches': uniform(3, 5), 'density': 0.6, 'thickness': 1, 'lean': 0.12})
    reg.cf('tree/baobab', 'baobab', {
        'trunk': simple(es('baobab_log', axis='y')), 'branch': simple(es('baobab_wood', axis='y')), 'leaves': simple(es('baobab_leaves')),
        'height': uniform(10, 15), 'radius': funiform(2.0, 3.3), 'branches': uniform(5, 8), 'leaf_density': 0.45})
    reg.cf(W + '/baobab_young', 'baobab', {
        'trunk': simple(es('baobab_log', axis='y')), 'branch': simple(es('baobab_wood', axis='y')), 'leaves': simple(es('baobab_leaves')),
        'height': uniform(6, 8), 'radius': funiform(1.0, 1.6), 'branches': uniform(3, 4), 'leaf_density': 0.5})
    reg.cf(W + '/candelabra', 'candelabra', {'stem': simple(es('euphorbia', axis='y')), 'trunk_height': uniform(2, 4), 'arms': uniform(4, 8),
                                             'arm_height': uniform(2, 5)})
    reg.cf(W + '/thornbush', 'shrub', {'stem': simple(acacia_log), 'leaves': simple(es('thornbush_leaves')), 'radius': funiform(0.8, 1.6),
                                       'flatness': funiform(0.6, 0.9), 'lobes': uniform(1, 3), 'density': 0.7})
    reg.cf(W + '/commiphora', 'shrub', {'stem': simple(acacia_wood), 'leaves': simple(es('thornbush_leaves')), 'radius': funiform(1.2, 2.2),
                                        'flatness': funiform(0.45, 0.7), 'lobes': uniform(2, 3), 'lift': uniform(0, 1), 'density': 0.7})
    reg.cf(W + '/termite_mound', 'termite_mound', {'block': simple(es('termite_mound')), 'height': uniform(3, 6), 'radius': funiform(1.0, 2.0),
                                                   'spire_chance': 0.35})
    reg.cf(W + '/termite_mound_tall', 'termite_mound', {'block': simple(es('termite_mound')), 'height': uniform(4, 8),
                                                        'radius': funiform(1.2, 2.4), 'spire_chance': 0.5})
    granite = weighted((es('kopje_granite'), 85), (state('granite'), 15))
    reg.cf(W + '/kopje', 'boulders', {'block': granite, 'dome_radius': funiform(6.0, 11.0), 'boulders': uniform(5, 14),
                                      'boulder_radius': funiform(1.6, 4.0), 'spread': 8.0, 'stack_chance': 0.5, 'crack_chance': 0.35})
    reg.cf(W + '/rock_outcrop', 'boulders', {'block': granite, 'dome_radius': funiform(0.0, 0.5), 'boulders': uniform(1, 3),
                                             'boulder_radius': funiform(0.8, 1.8), 'spread': 2.0, 'stack_chance': 0.3, 'crack_chance': 0.1})

    def cover(name, entries, density, biomes, scale=18.0, influence=0.5, salt=0, patches=()):
        reg.cf(W + '/cover_' + name, 'ground_cover', cover_config(entries, density, biomes, scale, influence, salt, patches))
        return reg.pf(W + '/cover_' + name, W + '/cover_' + name, [])

    golden, tall_golden, red_oat = es('golden_grass'), es('tall_golden_grass', half='lower'), es('red_oat_grass', half='lower')
    # Knee-high grass that the eye can travel over (1 block); tall 2-block grass only grows in stands
    tall_stand = [(tall_golden, 70), (red_oat, 22), (state('tall_dry_grass'), 8)]
    cover_plains = cover('plains', [(golden, 70), (state('short_dry_grass'), 8), (red_oat, 3), (tall_golden, 4), (state('tall_dry_grass'), 1)],
                         0.82, [PLAINS, KOPJES], salt=1, patches=[(tall_stand, 0.32, 15.0, 0.75)])
    cover_woodland = cover('woodland', [(golden, 40), (state('short_grass'), 30), (state('short_dry_grass'), 10), (tall_golden, 5),
                                        (state('tall_grass', half='lower'), 4), (red_oat, 3)], 0.74, [WOODLAND, BAOBAB], salt=2,
                           patches=[([(tall_golden, 50), (state('tall_grass', half='lower'), 30), (red_oat, 20)], 0.36, 13.0, 0.7)])
    cover_red = cover('red_earth', [(golden, 46), (state('short_dry_grass'), 32), (tall_golden, 6), (state('tall_dry_grass'), 8),
                                    (state('dead_bush'), 6)], 0.42, [RED_EARTH], influence=0.85, scale=14.0, salt=3)
    cover_high = cover('highlands', [(state('short_grass'), 44), (golden, 32), (red_oat, 8), (state('tall_grass', half='lower'), 6),
                                     (state('short_dry_grass'), 10)], 0.62, [HIGHLANDS], salt=4)
    cover_river = cover('riverine', [(state('short_grass'), 50), (state('tall_grass', half='lower'), 16), (state('fern'), 10), (golden, 14),
                                     (tall_golden, 8)], 0.7, [RIVERINE, RIVER], salt=5,
                        patches=[([(state('tall_grass', half='lower'), 60), (tall_golden, 40)], 0.3, 10.0, 0.7)])

    def tree_pf(name, feature, cnt):
        return reg.pf(W + '/' + name, feature, [cnt, in_square(), water_depth(0), heightmap('OCEAN_FLOOR'), biome_filter()])

    def rare_pf(name, feature, chance, hm='OCEAN_FLOOR'):
        return reg.pf(W + '/' + name, feature, [rarity(chance), in_square(), water_depth(0), heightmap(hm), biome_filter()])

    # the open Serengeti: a lone umbrella thorn every few hundred metres, now and then a pair
    acacia_plains = tree_pf('acacia_plains', 'tree/umbrella_thorn', count(weighted_int((0, 30), (1, 4), (2, 1))))
    acacia_young_plains = rare_pf('acacia_young_plains', W + '/umbrella_thorn_young', 7)
    acacia_young = rare_pf('acacia_young', W + '/umbrella_thorn_young', 3)
    acacia_woodland = tree_pf('acacia_woodland', 'tree/umbrella_thorn', count(weighted_int((1, 4), (2, 4), (3, 2))))
    acacia_sparse = rare_pf('acacia_sparse', 'tree/umbrella_thorn', 4)
    fever = tree_pf('fever_trees', 'tree/fever_tree', count(weighted_int((1, 3), (2, 3), (3, 1))))
    baobab_grove = tree_pf('baobab_grove', 'tree/baobab', count(weighted_int((0, 3), (1, 2))))
    baobab_rare = rare_pf('baobab_rare', 'tree/baobab', 14)
    baobab_young = rare_pf('baobab_young', W + '/baobab_young', 6)
    candelabra_kopje = tree_pf('candelabra_kopje', W + '/candelabra', count(weighted_int((0, 2), (1, 2), (2, 1))))
    candelabra_rare = rare_pf('candelabra_rare', W + '/candelabra', 4)
    thorn_plains = rare_pf('thornbush_plains', W + '/thornbush', 3)
    thorn_dense = tree_pf('thornbush_dense', W + '/thornbush', count(uniform(2, 4)))
    commiphora = tree_pf('commiphora', W + '/commiphora', count(uniform(1, 3)))
    mound = rare_pf('termite_mound', W + '/termite_mound', 5)
    mound_tall = tree_pf('termite_mound_tall', W + '/termite_mound_tall', count(weighted_int((0, 2), (1, 2), (2, 1))))
    kopje_dense = tree_pf('kopje_dense', W + '/kopje', count(weighted_int((0, 2), (1, 3))))
    kopje_lone = rare_pf('kopje_lone', W + '/kopje', 40)
    rocks_high = tree_pf('rocks_highlands', W + '/rock_outcrop', count(uniform(0, 2)))
    rocks_rare = rare_pf('rocks_rare', W + '/rock_outcrop', 8)

    # ------------------------------------------------------------------ biomes
    # the great herds of the Serengeti and the animals that follow them
    savanna_creatures = [spawn('earthscapes:zebra', 12, 3, 6), spawn('earthscapes:wildebeest', 12, 4, 8),
                         spawn('earthscapes:thomsons_gazelle', 10, 3, 6), spawn('earthscapes:giraffe', 5, 1, 3), spawn('earthscapes:elephant', 4, 2, 5),
                         spawn('earthscapes:lion', 2, 2, 4), spawn('earthscapes:ostrich', 4, 1, 3), spawn('rabbit', 1, 1, 2)]
    woodland_creatures = [spawn('earthscapes:giraffe', 8, 1, 3), spawn('earthscapes:elephant', 6, 2, 5), spawn('earthscapes:zebra', 6, 3, 5),
                          spawn('earthscapes:thomsons_gazelle', 4, 2, 5), spawn('earthscapes:lion', 2, 2, 3), spawn('earthscapes:ostrich', 2, 1, 2)]
    red_earth_creatures = [spawn('earthscapes:elephant', 8, 2, 5), spawn('earthscapes:giraffe', 4, 1, 3), spawn('earthscapes:zebra', 5, 3, 5),
                           spawn('earthscapes:ostrich', 5, 1, 3), spawn('earthscapes:thomsons_gazelle', 4, 2, 4), spawn('earthscapes:lion', 2, 2, 3)]
    baobab_creatures = [spawn('earthscapes:elephant', 7, 2, 5), spawn('earthscapes:giraffe', 5, 1, 3), spawn('earthscapes:zebra', 4, 3, 5),
                        spawn('earthscapes:thomsons_gazelle', 4, 2, 4), spawn('earthscapes:lion', 1, 2, 3)]
    kopje_creatures = [spawn('earthscapes:lion', 5, 2, 4), spawn('earthscapes:thomsons_gazelle', 8, 3, 6), spawn('earthscapes:zebra', 6, 3, 6),
                       spawn('earthscapes:wildebeest', 6, 4, 8), spawn('earthscapes:ostrich', 3, 1, 2)]
    highland_creatures = [spawn('earthscapes:zebra', 6, 2, 5), spawn('earthscapes:thomsons_gazelle', 4, 2, 4), spawn('earthscapes:elephant', 3, 2, 4),
                          spawn('goat', 2, 1, 2), spawn('rabbit', 2, 1, 2)]
    riverine_creatures = [spawn('earthscapes:elephant', 8, 2, 5), spawn('earthscapes:hippo', 6, 2, 4), spawn('earthscapes:zebra', 5, 3, 5),
                          spawn('earthscapes:giraffe', 3, 1, 2), spawn('earthscapes:nile_crocodile', 3, 1, 2), spawn('frog', 3, 2, 3)]
    river_creatures = [spawn('earthscapes:hippo', 8, 2, 4), spawn('earthscapes:nile_crocodile', 5, 1, 2), spawn('frog', 4, 2, 4)]
    sky, fog = '#80B6F0', '#D8E2E8'

    def make(name, grass, foliage, local=(), veg=(), creatures=None, water='#4C7E78', water_fog='#2F4F48', temperature=1.2, downfall=0.25,
             rain=True, fog_end=560.0, extra_attrs=None, wildlife=0.12):
        f = base_features()
        f[LOCAL_MODIFICATIONS] += list(local)
        f[VEGETAL_DECORATION] += list(veg)
        f[TOP_LAYER_MODIFICATION] = ['minecraft:freeze_top_layer']
        a = attrs(sky, fog, water_fog=water_fog, fog_start=40.0, fog_end=fog_end, extra=dict({'minecraft:gameplay/snow_golem_melts': True},
                                                                                            **(extra_attrs or {})))
        reg.biome(name, biome(temperature, downfall, rain, effects(water, grass, foliage, '#A08A4A'), a, f,
                              creatures if creatures is not None else savanna_creatures, monsters=MONSTERS, creature_probability=wildlife,
                              carvers=None if name == HIGHLANDS else FLAT_CARVERS))

    make(PLAINS, '#C9A64B', '#8C9C3C', local=[kopje_lone], veg=[acacia_plains, acacia_young_plains, thorn_plains, mound, baobab_rare,
                                                               cover_plains, 'minecraft:flower_warm'], wildlife=0.17)
    make(WOODLAND, '#B4A44A', '#7E9A3A', local=[rocks_rare], veg=[acacia_woodland, acacia_young, thorn_dense, mound, cover_woodland,
                                                                 'minecraft:flower_warm'], creatures=woodland_creatures)
    make(RED_EARTH, '#CDA155', '#909A3E', local=[rocks_rare], veg=[acacia_sparse, baobab_rare, commiphora, mound_tall, candelabra_rare,
                                                                  cover_red], temperature=1.4, downfall=0.1, creatures=red_earth_creatures)
    make(BAOBAB, '#C2A04E', '#86963C', veg=[baobab_grove, baobab_young, acacia_sparse, commiphora, mound, cover_woodland], creatures=baobab_creatures)
    make(KOPJES, '#C6A54C', '#8A9A3C', local=[kopje_dense], veg=[acacia_sparse, candelabra_kopje, thorn_plains, cover_plains], creatures=kopje_creatures)
    make(HIGHLANDS, '#9EA24A', '#6E8E36', local=[rocks_high], veg=[acacia_sparse, candelabra_rare, thorn_plains, cover_high],
         temperature=0.9, downfall=0.4, creatures=highland_creatures)
    make(RIVERINE, '#94A84A', '#6C9A38', veg=[fever, thorn_plains, cover_river, 'minecraft:patch_sugar_cane'],
         creatures=riverine_creatures, temperature=1.0, downfall=0.5)
    make(RIVER, '#94A84A', '#6C9A38', veg=[fever, cover_river, 'minecraft:patch_sugar_cane'],
         creatures=river_creatures, temperature=1.0, downfall=0.5)

    for b in ALL:
        reg.tag_biome('minecraft:is_overworld', b)
        reg.tag_biome('minecraft:has_structure/mineshaft', b)
        reg.tag_biome('minecraft:has_structure/trial_chambers', b)
        reg.tag_biome('minecraft:spawns_warm_variant_farm_animals', b)
        reg.tag_biome('minecraft:stronghold_biased_to', b)
    for b in (PLAINS, WOODLAND, RED_EARTH, BAOBAB, KOPJES, HIGHLANDS):
        reg.tag_biome('minecraft:is_savanna', b)
        reg.tag_biome('minecraft:has_structure/ruined_portal_standard', b)
    for b in (PLAINS, WOODLAND, BAOBAB):
        reg.tag_biome('minecraft:has_structure/village_savanna', b)
    for b in (PLAINS, RED_EARTH):
        reg.tag_biome('minecraft:has_structure/pillager_outpost', b)
    reg.tag_biome('minecraft:is_river', RIVER)
    reg.tag_biome('minecraft:is_hill', HIGHLANDS)
    reg.tag_biome('minecraft:spawns_warm_variant_frogs', RIVER, RIVERINE)

    # ------------------------------------------------------------------ surface
    surface = 'minecraft:surface'
    underwater = c_not(c_water(0, 0))
    river_bed = sr_seq(sr_if(c_noise(surface, 0.3), sr_block(state('gravel'))), sr_block(state('sand')))
    hole_bed = sr_seq(sr_if(c_noise(surface, 0.25), sr_block(state('clay'))), sr_block(state('mud')))
    grass = sr_block(state('grass_block', snowy=False))
    laterite = sr_block(es('laterite'))
    floor = sr_seq(
        sr_if(underwater, sr_seq(sr_if(c_biome(RIVER), river_bed), hole_bed)),
        sr_if(c_biome(KOPJES, HIGHLANDS), sr_if(c_steep(), sr_block(es('kopje_granite')))),
        sr_if(c_biome(HIGHLANDS), sr_seq(sr_if(c_y_above(150), sr_if(c_noise(surface, 0.1), sr_block(state('stone')))),
                                         sr_if(c_noise(surface, 0.55), sr_block(state('coarse_dirt'))))),
        sr_if(c_biome(RED_EARTH), sr_seq(sr_if(c_noise('minecraft:surface_secondary', 0.25), grass), sr_if(c_noise(surface, 0.3), grass), laterite)),
        sr_if(c_biome(PLAINS, WOODLAND, BAOBAB, KOPJES), sr_seq(sr_if(c_noise(surface, 0.62), laterite),
                                                                 sr_if(c_noise(surface, -10.0, -0.72), sr_block(state('coarse_dirt'))))),
        sr_if(c_biome(RIVER, RIVERINE), sr_if(c_not(c_y_above(65)), sr_if(c_noise(surface, 0.35), sr_block(state('mud'))))),
        grass)
    under = sr_seq(
        sr_if(underwater, sr_seq(sr_if(c_biome(RIVER), sr_block(state('sand'))), sr_block(state('mud')))),
        sr_if(c_biome(PLAINS, WOODLAND, BAOBAB, KOPJES, RED_EARTH), laterite),
        sr_block(state('dirt')))
    rules = surface_shell(sr_seq(sr_if(ON_FLOOR, floor), sr_if(UNDER_FLOOR, under)))

    # ------------------------------------------------------------------ biome source
    entries = []

    def surface_entry(b, **kw):
        entries.append({'biome': rl(b), 'parameters': param(d=0.0, **kw)})
        entries.append({'biome': rl(b), 'parameters': param(d=1.0, **kw)})

    surface_entry(RIVER, w=(-2, 0.016))
    surface_entry(RIVERINE, w=(0.016, 0.045))
    surface_entry(HIGHLANDS, c=(0.55, 2), w=(0.045, 2))
    surface_entry(WOODLAND, c=(0.3, 0.55), w=(0.045, 2))
    surface_entry(KOPJES, c=(-2, 0.3), e=(0.33, 2), w=(0.045, 2))
    surface_entry(BAOBAB, c=(-2, 0.3), e=(-2, 0.33), t=(0.22, 2), h=(0.15, 2), w=(0.045, 2))
    surface_entry(RED_EARTH, c=(-2, 0.3), e=(-2, 0.33), t=(0.22, 2), h=(-2, 0.15), w=(0.045, 2))
    surface_entry(WOODLAND, c=(-2, 0.3), e=(-2, 0.33), t=(-2, 0.22), h=(0.2, 2), w=(0.045, 2))
    surface_entry(PLAINS, c=(-2, 0.3), e=(-2, 0.33), t=(-2, 0.22), h=(-2, 0.2), w=(0.045, 2))
    entries.append({'biome': 'minecraft:dripstone_caves', 'parameters': param(e=(-2, -0.38), d=(0.2, 0.9))})
    entries.append({'biome': 'minecraft:lush_caves', 'parameters': param(h=(0.45, 2), t=(-2, -0.2), d=(0.2, 0.9))})
    entries.append({'biome': 'minecraft:deep_dark', 'parameters': param(t=(-2, 0.05), d=(1.15, 2.0))})

    spawn_target = [param(c=(-2, 0.3), e=(-2, 0.33), t=(-2, 0.22), h=(-2, 0.2), w=(0.06, 2), d=0.0)]
    ns = noise_settings(router(height, sloped, temperature, vegetation, highland, erosion, river, depth), rules, spawn_target)
    reg.put('worldgen/noise_settings', 'african_savanna', ns)
    preset = world_preset('african_savanna')
    preset['dimensions']['minecraft:overworld']['generator']['biome_source']['biomes'] = entries
    reg.put('worldgen/world_preset', 'african_savanna', preset)
    return 'african_savanna'
