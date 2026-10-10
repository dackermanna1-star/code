"""Mongolian Steppe world type: endless rolling hills of feather grass and bronze-red seed heads,
larch forest clinging to cool north-facing slopes, broad meandering river valleys dotted with gers,
granite tors, the dry Gobi fringe, flowery alpine pastures and colossal snow-capped massifs that
dominate the horizon."""
from wg.common import (cover_config, FLAT_CARVERS, LOCAL_MODIFICATIONS, MONSTERS, SURFACE_STRUCTURES, TOP_LAYER_MODIFICATION, VEGETAL_DECORATION, attrs, base_features,
                       biome, effects, noise_settings, param, router, spawn, surface_shell, world_preset)
from wg.dsl import (ON_FLOOR, UNDER_FLOOR, add, adds, biome_filter, c_biome, c_noise, c_not, c_steep, c_water, c_y_above, cell_bumps,
                    count, dabs, dmax, dmin, eroded, es, flat_cache, funiform, heightmap, in_square, lerp, local_peak, mul, noise, rarity, rl,
                    shifted, simple, slope, smooth_ramp, spline, square, sr_block, sr_if, sr_seq, state, sub, uniform, water_depth, weighted,
                    weighted_int)

W = 'steppe'
FEATHER, DRY, FOREST, MEADOW, MOUNTAINS, RIVER, VALLEY, TORS = (
    'feather_grass_steppe', 'gobi_dry_steppe', 'larch_forest_steppe', 'alpine_meadow', 'altai_mountains', 'steppe_river',
    'steppe_river_valley', 'granite_tors')
ALL = [FEATHER, DRY, FOREST, MEADOW, MOUNTAINS, RIVER, VALLEY, TORS]


def build(reg):
    n = {}
    for name, first, amps in (('hills', -10, [1.0, 0.5, 0.25]), ('roll', -8, [1.0, 0.5]), ('detail', -6, [1.0, 0.5]),
                              ('mountain', -11, [1.0, 0.6, 0.3]), ('mountain_shape', 0, [1.0]), ('massif', 0, [1.0]),
                              ('river', -10, [1.0, 0.5, 0.2]), ('dry', -10, [1.0, 0.6, 0.3]), ('forest', -8, [1.0, 0.6]),
                              ('tors', -8, [1.0, 0.5]), ('lakes', 0, [1.0])):
        n[name] = reg.noise('%s/%s' % (W, name), first, amps)

    # ------------------------------------------------------------------ terrain
    mmask = reg.df(W + '/mountain_mask', flat_cache(smooth_ramp(shifted(n['mountain']), 0.08, 0.4)))
    massif = reg.df(W + '/massif', flat_cache(cell_bumps(n['massif'], 2000, 0.4, 300.0, 450.0, 1.0, 1.0, edge=2.0, profile=1.3, elongation=1.6)))
    alpine = reg.df(W + '/alpine', flat_cache(dmax(mmask, massif)))
    ridges = reg.df(W + '/ridges', flat_cache(eroded(n['mountain_shape'], 1.0 / 420.0, octaves=8, erosion=1.2, ridged=True)))
    mountains_h = mul(mmask, add(25.0, mul(230.0, square(dmax(0.0, ridges)))))
    massif_h = mul(massif, add(175.0, mul(45.0, ridges)))
    hills = adds(92.0, mul(12.0, noise(n['hills'])), mul(5.0, noise(n['roll'])), mul(1.2, noise(n['detail'])))
    river = reg.df(W + '/river', flat_cache(dabs(shifted(n['river']))))
    lowland = sub(1.0, alpine)
    valley = mul(spline(river, [(0.0, 1.0), (0.018, 1.0), (0.08, 0.0)]), lowland)
    channel = mul(spline(river, [(0.0, 1.0), (0.008, 1.0), (0.012, 0.0)]), lowland)
    lakes = mul(cell_bumps(n['lakes'], 900, 0.14, 36.0, 80.0, 1.0, 1.0, edge=2.0, profile=0.9), lowland)
    h = adds(hills, mountains_h, massif_h)
    h = lerp(valley, h, add(66.0, mul(1.0, noise(n['detail']))))
    h = lerp(channel, h, 59.0)
    h = lerp(lakes, h, 57.0)
    height = reg.df(W + '/height', flat_cache(h))
    sloped = reg.df(W + '/sloped_cheese', mul(sub(height, 'minecraft:y'), 0.125))
    depth = reg.df(W + '/depth', mul(sub(dmin(height, 96.0), 'minecraft:y'), 1.0 / 80.0))
    dry = reg.df(W + '/dry', flat_cache(shifted(n['dry'])))
    forest = reg.df(W + '/forest', flat_cache(shifted(n['forest'])))
    tors = reg.df(W + '/tors', flat_cache(shifted(n['tors'])))

    # ------------------------------------------------------------------ features
    larch = {'trunk': simple(es('larch_log', axis='y')), 'leaves': simple(es('larch_leaves'))}
    reg.cf('tree/larch', 'larch', dict(larch, height=uniform(13, 24), crown_start=funiform(0.22, 0.35), branch_length=funiform(2.6, 4.2),
                                       density=0.75))
    reg.cf(W + '/larch_young', 'larch', dict(larch, height=uniform(6, 10), crown_start=funiform(0.15, 0.25), branch_length=funiform(1.5, 2.4),
                                             density=0.75))
    reg.cf(W + '/willow_scrub', 'shrub', {'stem': simple(state('oak_log', axis='y')), 'leaves': weighted((state('oak_leaves'), 60),
                                                                                                        (state('birch_leaves'), 40)),
                                          'radius': funiform(1.2, 2.4), 'flatness': funiform(0.8, 1.1), 'lobes': uniform(1, 3),
                                          'lift': uniform(0, 1), 'density': 0.8})
    reg.cf(W + '/saxaul', 'shrub', {'stem': simple(state('acacia_wood', axis='y')), 'leaves': simple(es('thornbush_leaves')),
                                    'radius': funiform(0.9, 1.6), 'flatness': funiform(0.7, 1.0), 'lobes': uniform(1, 2), 'density': 0.6,
                                    'desert': True})
    granite = weighted((es('kopje_granite'), 60), (state('granite'), 15), (state('stone'), 25))
    reg.cf(W + '/tor', 'boulders', {'block': granite, 'dome_radius': funiform(5.0, 10.0), 'boulders': uniform(6, 16),
                                    'boulder_radius': funiform(1.6, 4.2), 'spread': 8.0, 'stack_chance': 0.6, 'crack_chance': 0.45})
    reg.cf(W + '/field_stones', 'boulders', {'block': weighted((state('stone'), 50), (state('andesite'), 30), (state('cobblestone'), 20)),
                                             'dome_radius': funiform(0.0, 0.5), 'boulders': uniform(1, 3), 'boulder_radius': funiform(0.7, 1.5),
                                             'spread': 3.0, 'stack_chance': 0.2, 'crack_chance': 0.1})
    reg.cf(W + '/mountain_rocks', 'boulders', {'block': weighted((state('stone'), 50), (state('andesite'), 25), (state('tuff'), 10),
                                                                 (state('cobblestone'), 15)),
                                               'dome_radius': funiform(0.0, 0.5), 'boulders': uniform(2, 5),
                                               'boulder_radius': funiform(1.0, 2.6), 'spread': 5.0, 'stack_chance': 0.35, 'crack_chance': 0.3})
    reg.cf(W + '/ger', 'ger', {})
    reg.cf(W + '/ovoo', 'ovoo', {})

    def cover(name, entries, density, biomes, scale=22.0, influence=0.5, salt=0, patches=()):
        reg.cf(W + '/cover_' + name, 'ground_cover', cover_config(entries, density, biomes, scale, influence, salt, patches))
        return reg.pf(W + '/cover_' + name, W + '/cover_' + name, [])

    tall_steppe, steppe_g, feather = es('tall_steppe_grass', half='lower'), es('steppe_grass'), es('feather_grass', half='lower')
    # a knee-high sward that the eye travels over to the mountains; feather grass and bronze-headed tall grass grow in stands
    cover_feather = cover('feather', [(steppe_g, 52), (state('short_grass'), 16), (state('short_dry_grass'), 8), (tall_steppe, 6), (feather, 5),
                                      (es('pasque_flower'), 1), (es('edelweiss'), 1), (state('dandelion'), 1), (state('cornflower'), 1),
                                      (state('allium'), 1), (state('poppy'), 1)], 0.78, [FEATHER], salt=31,
                          patches=[([(tall_steppe, 55), (feather, 45)], 0.3, 16.0, 0.7)])
    cover_dry = cover('dry', [(steppe_g, 40), (state('short_dry_grass'), 25), (feather, 15), (state('tall_dry_grass'), 10), (state('dead_bush'), 5),
                              (es('drinn_grass'), 5)], 0.36, [DRY], influence=0.8, salt=32)
    cover_forest = cover('forest', [(state('short_grass'), 40), (state('tall_grass', half='lower'), 15), (state('fern'), 10), (steppe_g, 20),
                                    (feather, 5), (es('pasque_flower'), 3), (state('lily_of_the_valley'), 2), (state('oxeye_daisy'), 2)],
                         0.62, [FOREST], salt=33)
    cover_meadow = cover('meadow', [(state('short_grass'), 40), (state('tall_grass', half='lower'), 10), (es('edelweiss'), 8),
                                    (es('pasque_flower'), 5), (state('cornflower'), 6), (state('allium'), 4), (state('azure_bluet'), 4),
                                    (state('oxeye_daisy'), 4), (state('dandelion'), 4), (state('poppy'), 3)], 0.8, [MEADOW], salt=34)
    cover_mount = cover('mountains', [(state('short_grass'), 30), (steppe_g, 30), (es('edelweiss'), 4)], 0.25, [MOUNTAINS], influence=0.8,
                        salt=35)
    cover_valley = cover('valley', [(state('short_grass'), 52), (steppe_g, 20), (state('tall_grass', half='lower'), 8), (tall_steppe, 6),
                                    (state('cornflower'), 3), (state('dandelion'), 3)], 0.76, [VALLEY, RIVER], salt=36,
                         patches=[([(state('tall_grass', half='lower'), 50), (tall_steppe, 50)], 0.3, 12.0, 0.7)])
    cover_tors = cover('tors', [(steppe_g, 50), (state('short_grass'), 20), (tall_steppe, 8), (feather, 8), (es('edelweiss'), 5)], 0.56,
                       [TORS], salt=37)

    def pf(name, feature, mods):
        return reg.pf(W + '/' + name, feature, mods)

    surface_mods = [in_square(), water_depth(0), heightmap('OCEAN_FLOOR')]
    larch_north = pf('larch_north_slopes', 'tree/larch', [count(uniform(7, 11))] + surface_mods +
                     [slope(min_slope=0.1, facing='north', threshold=0.15, radius=4), biome_filter()])
    larch_scatter = pf('larch_scatter', 'tree/larch', [rarity(2)] + surface_mods + [slope(min_slope=0.05, facing='north', threshold=-0.2),
                                                                                    biome_filter()])
    larch_young = pf('larch_young', W + '/larch_young', [count(uniform(1, 3))] + surface_mods +
                     [slope(min_slope=0.08, facing='north', threshold=0.0), biome_filter()])
    larch_treeline = pf('larch_treeline', 'tree/larch', [rarity(4)] + surface_mods + [slope(max_slope=0.9), biome_filter()])
    birch_north = pf('birch_north', 'minecraft:birch', [count(uniform(0, 2))] + surface_mods +
                     [slope(min_slope=0.08, facing='north', threshold=0.0), biome_filter()])
    willows = pf('willow_scrub', W + '/willow_scrub', [count(uniform(0, 2))] + surface_mods + [biome_filter()])
    saxaul = pf('saxaul', W + '/saxaul', [rarity(2)] + surface_mods + [biome_filter()])
    tors_pf = pf('tors', W + '/tor', [count(weighted_int((0, 2), (1, 2), (2, 1)))] + surface_mods + [biome_filter()])
    stones = pf('field_stones', W + '/field_stones', [rarity(10)] + surface_mods + [biome_filter()])
    stones_dry = pf('field_stones_dry', W + '/field_stones', [rarity(4)] + surface_mods + [biome_filter()])
    rocks_mount = pf('mountain_rocks', W + '/mountain_rocks', [rarity(2)] + surface_mods + [biome_filter()])
    ger = pf('ger', W + '/ger', [rarity(70)] + surface_mods + [slope(max_slope=0.12, radius=4), biome_filter()])
    ovoo = pf('ovoo', W + '/ovoo', [rarity(24)] + surface_mods + [local_peak(12, 5), biome_filter()])

    # ------------------------------------------------------------------ biomes
    sky, fog = '#6AA8F6', '#C9DCF0'
    herd = [spawn('horse', 12, 3, 8), spawn('sheep', 10, 3, 6), spawn('cow', 4, 2, 4), spawn('rabbit', 4, 2, 3), spawn('donkey', 2, 1, 2),
            spawn('goat', 2, 1, 3)]

    def make(name, grass, foliage, local=(), surface=(), veg=(), temperature=0.6, downfall=0.35, creatures=None, music_sound=None,
             water='#3E72C0', water_fog='#1E3A66', fog_end=1100.0, rain=True):
        f = base_features()
        f[LOCAL_MODIFICATIONS] += list(local)
        f[SURFACE_STRUCTURES] += list(surface)
        f[VEGETAL_DECORATION] += list(veg)
        f[TOP_LAYER_MODIFICATION] = ['minecraft:freeze_top_layer']
        a = attrs(sky, fog, water_fog=water_fog, fog_start=96.0, fog_end=fog_end, music_sound=music_sound)
        reg.biome(name, biome(temperature, downfall, rain, effects(water, grass, foliage, '#9A8A50'), a, f,
                              creatures if creatures is not None else herd, monsters=MONSTERS, creature_probability=0.12,
                              carvers=None if name in (MOUNTAINS, MEADOW) else FLAT_CARVERS))

    make(FEATHER, '#B4A058', '#8E9A48', local=[stones], surface=[ger, ovoo], veg=[cover_feather], music_sound='minecraft:music.overworld.meadow')
    make(DRY, '#C2AA62', '#A09A50', local=[stones_dry], surface=[ger, ovoo], veg=[saxaul, cover_dry], temperature=0.8, downfall=0.1,
         creatures=[spawn('camel', 4, 1, 3), spawn('horse', 6, 2, 5), spawn('goat', 4, 2, 4), spawn('rabbit', 4, 2, 3)],
         music_sound='minecraft:music.overworld.badlands')
    make(FOREST, '#8FA44E', '#78A040', local=[stones], veg=[larch_north, larch_young, larch_scatter, birch_north, cover_forest],
         temperature=0.45, downfall=0.5, creatures=herd + [spawn('wolf', 2, 2, 4), spawn('fox', 3, 1, 2)],
         music_sound='minecraft:music.overworld.old_growth_taiga')
    make(MEADOW, '#78AA46', '#62983A', local=[stones], surface=[ovoo], veg=[larch_treeline, cover_meadow], temperature=0.45, downfall=0.55,
         creatures=[spawn('sheep', 8, 3, 6), spawn('horse', 6, 2, 5), spawn('goat', 5, 2, 4), spawn('rabbit', 3, 2, 3)],
         music_sound='minecraft:music.overworld.meadow')
    make(MOUNTAINS, '#8C9C52', '#6E8A40', local=[rocks_mount], veg=[cover_mount], temperature=0.3, downfall=0.5,
         creatures=[spawn('goat', 8, 2, 4), spawn('sheep', 2, 2, 3)], music_sound='minecraft:music.overworld.snowy_slopes')
    make(VALLEY, '#80A84A', '#6A9A3A', surface=[ger], veg=[willows, cover_valley, 'minecraft:patch_sugar_cane'], downfall=0.5,
         music_sound='minecraft:music.overworld.meadow')
    make(RIVER, '#80A84A', '#6A9A3A', veg=[willows, cover_valley, 'minecraft:patch_sugar_cane'], downfall=0.5,
         creatures=[spawn('horse', 4, 2, 4)])
    make(TORS, '#B09E5A', '#8E9A48', local=[tors_pf], surface=[ovoo], veg=[larch_scatter, cover_tors], music_sound='minecraft:music.overworld.meadow')

    for b in ALL:
        reg.tag_biome('minecraft:is_overworld', b)
        reg.tag_biome('minecraft:has_structure/mineshaft', b)
        reg.tag_biome('minecraft:has_structure/trial_chambers', b)
        reg.tag_biome('minecraft:stronghold_biased_to', b)
    for b in (FEATHER, DRY, FOREST, MEADOW, TORS, VALLEY):
        reg.tag_biome('minecraft:has_structure/ruined_portal_standard', b)
    for b in (FEATHER, DRY):
        reg.tag_biome('minecraft:has_structure/pillager_outpost', b)
    reg.tag_biome('minecraft:is_mountain', MOUNTAINS)
    reg.tag_biome('minecraft:has_structure/ruined_portal_mountain', MOUNTAINS)
    reg.tag_biome('minecraft:is_forest', FOREST)
    reg.tag_biome('minecraft:is_hill', TORS)
    reg.tag_biome('minecraft:is_river', RIVER)
    reg.tag_biome('minecraft:spawns_cold_variant_farm_animals', MOUNTAINS)
    reg.tag_biome('minecraft:spawns_white_rabbits', MOUNTAINS)
    reg.tag_biome('minecraft:spawns_snow_foxes', MOUNTAINS)

    # ------------------------------------------------------------------ surface
    s = 'minecraft:surface'
    underwater = c_not(c_water(0, 0))
    grass = sr_block(state('grass_block', snowy=False))
    stone = sr_block(state('stone'))
    snow = sr_block(state('snow_block'))
    floor = sr_seq(
        sr_if(underwater, sr_seq(sr_if(c_noise(s, 0.2), sr_block(state('gravel'))), sr_if(c_noise(s, -10.0, -0.45), sr_block(state('clay'))),
                                 sr_block(state('sand')))),
        sr_if(c_biome(MOUNTAINS, MEADOW), sr_seq(
            sr_if(c_y_above(238, 2), sr_seq(sr_if(c_noise(s, 0.42), sr_block(state('packed_ice'))), snow)),
            sr_if(c_y_above(204, 2), sr_seq(sr_if(c_steep(), stone), snow)),
            sr_if(c_steep(), sr_seq(sr_if(c_noise(s, 0.3), sr_block(state('andesite'))), stone)),
            sr_if(c_y_above(152, 2), sr_seq(sr_if(c_noise(s, 0.1), sr_block(state('gravel'))), sr_if(c_noise(s, -10.0, -0.45),
                                                                                                    sr_block(state('coarse_dirt'))), stone)),
            sr_if(c_y_above(132, 2), sr_if(c_noise(s, 0.3), sr_block(state('coarse_dirt')))),
            grass)),
        sr_if(c_biome(TORS), sr_seq(sr_if(c_steep(), sr_block(es('kopje_granite'))), sr_if(c_noise(s, 0.55), sr_block(state('coarse_dirt'))),
                                    grass)),
        sr_if(c_biome(DRY), sr_seq(sr_if(c_noise(s, 0.45), sr_block(state('coarse_dirt'))), sr_if(c_noise(s, -10.0, -0.6), sr_block(state('gravel'))),
                                   sr_if(c_noise('minecraft:surface_secondary', 0.6), sr_block(state('sand'))), grass)),
        sr_if(c_biome(FEATHER), sr_seq(sr_if(c_noise(s, 0.72), sr_block(state('coarse_dirt'))), grass)),
        sr_if(c_biome(RIVER, VALLEY), sr_seq(sr_if(c_not(c_y_above(65)), sr_if(c_noise(s, 0.0), sr_block(state('gravel')))), grass)),
        sr_if(c_biome(FOREST), sr_seq(sr_if(c_noise(s, 0.5), sr_block(state('podzol', snowy=False))), grass)),
        grass)
    under = sr_seq(
        sr_if(underwater, sr_block(state('gravel'))),
        sr_if(c_biome(MOUNTAINS), sr_if(c_y_above(150), stone)),
        sr_block(state('dirt')))
    rules = surface_shell(sr_seq(sr_if(ON_FLOOR, floor), sr_if(UNDER_FLOOR, under)))

    # ------------------------------------------------------------------ biome source
    entries = []

    def surface_entry(b, **kw):
        entries.append({'biome': rl(b), 'parameters': param(d=0.0, **kw)})
        entries.append({'biome': rl(b), 'parameters': param(d=1.0, **kw)})

    surface_entry(MOUNTAINS, c=(0.62, 2))
    surface_entry(MEADOW, c=(0.38, 0.62))
    surface_entry(RIVER, c=(-2, 0.38), w=(-2, 0.011))
    surface_entry(VALLEY, c=(-2, 0.38), w=(0.011, 0.04))
    surface_entry(TORS, c=(-2, 0.38), w=(0.04, 2), e=(0.36, 2))
    surface_entry(FOREST, c=(-2, 0.38), w=(0.04, 2), e=(-2, 0.36), h=(0.3, 2))
    surface_entry(DRY, c=(-2, 0.38), w=(0.04, 2), e=(-2, 0.36), h=(-2, 0.3), t=(0.32, 2))
    surface_entry(FEATHER, c=(-2, 0.38), w=(0.04, 2), e=(-2, 0.36), h=(-2, 0.3), t=(-2, 0.32))
    entries.append({'biome': 'minecraft:dripstone_caves', 'parameters': param(t=(0.2, 2), d=(0.2, 0.9))})
    entries.append({'biome': 'minecraft:lush_caves', 'parameters': param(h=(0.5, 2), d=(0.2, 0.9))})
    entries.append({'biome': 'minecraft:deep_dark', 'parameters': param(t=(-2, 0.05), d=(1.15, 2.0))})

    spawn_target = [param(c=(-2, 0.3), w=(0.08, 2), d=0.0)]
    ns = noise_settings(router(height, sloped, dry, forest, alpine, tors, river, depth), rules, spawn_target)
    reg.put('worldgen/noise_settings', 'mongolian_steppe', ns)
    preset = world_preset('mongolian_steppe')
    preset['dimensions']['minecraft:overworld']['generator']['biome_source']['biomes'] = entries
    reg.put('worldgen/world_preset', 'mongolian_steppe', preset)
    return 'mongolian_steppe'
