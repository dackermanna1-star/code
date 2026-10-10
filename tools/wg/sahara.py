"""Sahara Desert world type: a great erg of orange star dunes with sharp, rippled crests, oases of
date palms around turquoise pools, dark varnished hamada plateaus cut by acacia wadis, black
volcanic Hoggar peaks, the sandstone pillar labyrinths of the Tassili and white salt flats."""
from wg.common import (cover_config, FLAT_CARVERS, DESERT_MONSTERS, LOCAL_MODIFICATIONS, SURFACE_STRUCTURES, TOP_LAYER_MODIFICATION, VEGETAL_DECORATION, attrs,
                       base_features, biome, effects, noise_settings, param, router, spawn, surface_shell, world_preset)
from wg.dsl import (ON_CEILING, ON_FLOOR, UNDER_FLOOR, add, adds, biome_filter, c_biome, c_noise, c_not, c_steep, c_water, c_y_above,
                    cell_bumps, count, dabs, deep_floor, dmax, dmin, dune_ridges, eroded, es, flat_cache, funiform, heightmap, in_square,
                    lerp, mul, noise, rarity, rl, shifted, simple, smooth_ramp, spline, sr_block, sr_if, sr_seq, state, sub, terrace, uniform,
                    water_depth, weighted, weighted_int)

W = 'sahara'
GREAT_ERG, SAND_SEA, MARGIN, OASIS, REG, HAMADA, HOGGAR, TASSILI, WADI, CHOTT = (
    'great_erg', 'sahara_sand_sea', 'erg_margin', 'sahara_oasis', 'reg_plain', 'hamada_plateau', 'hoggar_mountains',
    'tassili_stone_forest', 'sahara_wadi', 'chott_salt_flat')
ALL = [GREAT_ERG, SAND_SEA, MARGIN, OASIS, REG, HAMADA, HOGGAR, TASSILI, WADI, CHOTT]
SANDY = [GREAT_ERG, SAND_SEA, MARGIN]


def build(reg):
    n = {}
    for name, first, amps in (('erg', -11, [1.0, 0.6, 0.3]), ('dunesize', -10, [1.0, 0.5]), ('rock', -10, [1.0, 0.6, 0.3]),
                              ('warp1', -8, [1.0, 0.5]), ('warp2', -7, [1.0, 0.5]), ('crestmod', -8, [1.0, 0.5]),
                              ('hamada', -9, [1.0, 0.5, 0.25]), ('wadi', -9, [1.0, 0.5, 0.2]), ('volcano', 0, [1.0]), ('oasis', 0, [1.0]),
                              ('base', -9, [1.0, 0.5]), ('detail', -6, [1.0, 0.5]), ('canyon', -7, [1.0, 0.5, 0.25]),
                              ('chott', -9, [1.0, 0.5])):
        n[name] = reg.noise('%s/%s' % (W, name), first, amps)

    # ------------------------------------------------------------------ terrain
    erg = reg.df(W + '/erg', flat_cache(add(0.16, shifted(n['erg']))))
    erg_w = reg.df(W + '/erg_weight', flat_cache(smooth_ramp(erg, -0.02, 0.1)))
    rock_w = sub(1.0, erg_w)
    dunesize = reg.df(W + '/dunesize', flat_cache(shifted(n['dunesize'])))
    ridges_a = dune_ridges(25.0, 170.0, 0.72, 1.15, 0.1, offset=mul(60.0, noise(n['warp1'])))
    ridges_b = dune_ridges(115.0, 240.0, 0.62, 1.2, 0.15, offset=mul(80.0, noise(n['warp2'])))
    small = dune_ridges(40.0, 36.0, 0.75, 1.0, 0.1, offset=mul(14.0, noise(n['warp2'], 3.0)))
    amp = spline(dunesize, [(-0.45, 14.0), (0.0, 30.0), (0.45, 52.0)])
    crest = spline(noise(n['crestmod']), [(-0.5, 0.5), (0.5, 1.0)])
    dunes = reg.df(W + '/dunes', flat_cache(add(mul(mul(amp, crest), dmax(ridges_a, mul(0.85, ridges_b))), mul(4.0, small))))
    rock = reg.df(W + '/rock', flat_cache(shifted(n['rock'])))
    hamada_w = smooth_ramp(rock, 0.16, 0.26)
    hoggar_w = smooth_ramp(rock, 0.42, 0.6)
    tassili_w = spline(rock, [(-0.42, 1.0), (-0.3, 0.0)])
    reg_zone = spline(rock, [(-0.3, 0.0), (-0.2, 1.0), (0.1, 1.0), (0.2, 0.0)])
    hamada_h = dmax(0.0, terrace(add(14.0, mul(32.0, noise(n['hamada']))), 8.0, 0.18))
    volcano = eroded(n['volcano'], 1.0 / 260.0, octaves=7, erosion=1.0, ridged=True)
    hoggar_h = mul(hoggar_w, add(30.0, mul(150.0, dmax(0.0, volcano))))
    canyons = spline(dabs(noise(n['canyon'])), [(0.0, 1.0), (0.05, 1.0), (0.11, 0.0)])
    tassili_h = mul(tassili_w, sub(32.0, mul(28.0, canyons)))
    wadi = reg.df(W + '/wadi', flat_cache(dabs(shifted(n['wadi']))))
    wadi_carve = mul(spline(wadi, [(0.0, 1.0), (0.018, 1.0), (0.045, 0.0)]), rock_w)
    oasis = reg.df(W + '/oasis', flat_cache(cell_bumps(n['oasis'], 480, 0.55, 26.0, 50.0, 1.0, 1.0, edge=2.0, profile=1.2)))
    chott_noise = reg.df(W + '/chott', flat_cache(shifted(n['chott'])))
    chott_w = mul(mul(spline(chott_noise, [(-0.6, 1.0), (-0.45, 0.0)]), reg_zone), rock_w)

    h = adds(70.0, mul(2.0, noise(n['base'])), mul(0.6, noise(n['detail'])), mul(erg_w, dunes),
             mul(rock_w, adds(mul(hamada_w, hamada_h), hoggar_h, tassili_h)))
    h = sub(h, mul(wadi_carve, add(5.0, mul(0.6, dmax(0.0, sub(h, 72.0))))))
    h = lerp(chott_w, h, add(63.7, mul(0.5, noise(n['detail']))))
    h = lerp(oasis, h, 57.0)
    height = reg.df(W + '/height', flat_cache(h))
    sloped = reg.df(W + '/sloped_cheese', mul(sub(height, 'minecraft:y'), 0.125))
    depth = reg.df(W + '/depth', mul(sub(dmin(height, 96.0), 'minecraft:y'), 1.0 / 80.0))
    erosion = reg.df(W + '/erosion', flat_cache(add(mul(erg_w, dunesize), mul(rock_w, chott_noise))))

    # ------------------------------------------------------------------ features
    reg.cf(W + '/sand_smoothing', 'surface_smoothing', {'from': es('sahara_sand'), 'layer': es('sahara_sand_layer', layers=1)})
    smoothing = reg.pf(W + '/sand_smoothing', W + '/sand_smoothing', [])
    palm = {'trunk': simple(es('date_palm_log', axis='y')), 'fronds': simple(es('date_palm_leaves')), 'style': 'feather'}
    reg.cf('tree/date_palm', 'palm', dict(palm, height=uniform(7, 13), curve=funiform(0.1, 0.6), frond_count=uniform(12, 16),
                                         frond_length=funiform(4.0, 5.6), droop=0.16, fruit=simple(es('dates', age=2)), fruit_chance=0.55))
    reg.cf(W + '/date_palm_young', 'palm', dict(palm, height=uniform(2, 4), curve=funiform(0.0, 0.3), frond_count=uniform(6, 9),
                                               frond_length=funiform(2.0, 3.2), droop=0.2))
    acacia = {'trunk': simple(state('acacia_log', axis='y')), 'branch': simple(state('acacia_wood', axis='y')),
              'leaves': simple(es('umbrella_thorn_leaves'))}
    reg.cf(W + '/desert_acacia', 'umbrella_tree', dict(acacia, trunk_height=uniform(2, 3), crown_height=uniform(2, 4),
                                                      crown_radius=uniform(3, 5), branches=uniform(2, 3), density=0.6, thickness=1, lean=0.3))
    reg.cf(W + '/tamarisk', 'shrub', {'stem': simple(state('acacia_log', axis='y')), 'leaves': simple(es('fever_tree_leaves')),
                                      'radius': funiform(1.0, 2.0), 'flatness': funiform(0.7, 1.0), 'lobes': uniform(1, 3), 'density': 0.7,
                                      'desert': True})
    reg.cf(W + '/hamada_rocks', 'boulders', {'block': weighted((es('hamada_stone'), 90), (state('tuff'), 10)), 'dome_radius': funiform(0.0, 0.5),
                                             'boulders': uniform(1, 3), 'boulder_radius': funiform(0.7, 1.6), 'spread': 3.0, 'stack_chance': 0.2,
                                             'crack_chance': 0.2})
    reg.cf(W + '/basalt_rocks', 'boulders', {'block': weighted((state('blackstone'), 50), (state('basalt', axis='y'), 30),
                                                               (state('smooth_basalt'), 20)), 'dome_radius': funiform(0.0, 0.5),
                                             'boulders': uniform(1, 4), 'boulder_radius': funiform(0.8, 2.2), 'spread': 4.0,
                                             'stack_chance': 0.4, 'crack_chance': 0.25})
    reg.cf(W + '/hoodoo', 'hoodoo', {'rock': simple(es('sahara_sandstone')), 'band': simple(state('smooth_red_sandstone')),
                                     'cap': simple(es('hamada_stone')), 'height': uniform(9, 24), 'radius': funiform(1.8, 3.6),
                                     'arch_chance': 0.15})
    reg.cf(W + '/hoodoo_small', 'hoodoo', {'rock': simple(es('sahara_sandstone')), 'band': simple(state('smooth_red_sandstone')),
                                           'cap': simple(es('hamada_stone')), 'height': uniform(4, 9), 'radius': funiform(1.0, 1.8),
                                           'arch_chance': 0.0})

    def cover(name, entries, density, biomes, scale=18.0, influence=0.6, salt=0, patches=()):
        reg.cf(W + '/cover_' + name, 'ground_cover', cover_config(entries, density, biomes, scale, influence, salt, patches))
        return reg.pf(W + '/cover_' + name, W + '/cover_' + name, [])

    drinn = es('drinn_grass')
    cover_erg = cover('erg', [(drinn, 70), (state('short_dry_grass'), 20), (state('dead_bush'), 10)], 0.012, [GREAT_ERG, SAND_SEA],
                      scale=40.0, influence=0.9, salt=11)
    cover_margin = cover('margin', [(drinn, 60), (state('short_dry_grass'), 25), (state('tall_dry_grass'), 10), (state('dead_bush'), 5)],
                         0.05, [MARGIN, WADI], scale=24.0, influence=0.85, salt=12)
    cover_reg = cover('reg', [(drinn, 40), (state('short_dry_grass'), 35), (state('dead_bush'), 25)], 0.03, [REG, HAMADA, TASSILI],
                      scale=24.0, influence=0.85, salt=13)
    cover_oasis = cover('oasis', [(state('short_grass'), 50), (state('tall_grass', half='lower'), 18), (state('fern'), 10), (drinn, 12),
                                  (state('bush'), 10)], 0.55, [OASIS], scale=10.0, influence=0.4, salt=14)

    def tree_pf(name, feature, cnt, hm='OCEAN_FLOOR'):
        return reg.pf(W + '/' + name, feature, [cnt, in_square(), water_depth(0), heightmap(hm), biome_filter()])

    def rare_pf(name, feature, chance):
        return reg.pf(W + '/' + name, feature, [rarity(chance), in_square(), water_depth(0), heightmap('OCEAN_FLOOR'), biome_filter()])

    palms = tree_pf('date_palms', 'tree/date_palm', count(uniform(5, 9)))
    palms_young = tree_pf('date_palms_young', W + '/date_palm_young', count(uniform(1, 3)))
    acacia_wadi = tree_pf('acacia_wadi', W + '/desert_acacia', count(weighted_int((0, 1), (1, 2), (2, 1))))
    acacia_rare = rare_pf('acacia_rare', W + '/desert_acacia', 24)
    tamarisk_wadi = tree_pf('tamarisk_wadi', W + '/tamarisk', count(uniform(0, 2)))
    tamarisk_oasis = tree_pf('tamarisk_oasis', W + '/tamarisk', count(uniform(0, 2)))
    rocks_reg = rare_pf('rocks_reg', W + '/hamada_rocks', 3)
    rocks_hamada = tree_pf('rocks_hamada', W + '/hamada_rocks', count(uniform(0, 2)))
    rocks_basalt = tree_pf('rocks_basalt', W + '/basalt_rocks', count(uniform(0, 2)))
    hoodoos = tree_pf('hoodoos', W + '/hoodoo', count(weighted_int((0, 2), (1, 3), (2, 1))))
    hoodoos_small = tree_pf('hoodoos_small', W + '/hoodoo_small', count(uniform(0, 2)))
    hoodoo_rare = rare_pf('hoodoo_rare', W + '/hoodoo', 14)

    # ------------------------------------------------------------------ biomes
    sky, fog = '#66A2F0', '#E4DCC8'
    creatures = [spawn('rabbit', 6, 2, 3), spawn('camel', 2, 1, 2)]

    def make(name, grass='#B8A45C', foliage='#A09A50', local=(), surface=(), veg=(), water='#3C9AA0', water_fog='#226266',
             creatures_list=None, carvers=None, smoothing_on=True, fog_end=640.0):
        f = base_features(fossils=True)
        f[LOCAL_MODIFICATIONS] += list(local)
        f[SURFACE_STRUCTURES] += list(surface)
        f[VEGETAL_DECORATION] += list(veg)
        f[TOP_LAYER_MODIFICATION] = ([smoothing] if smoothing_on else []) + ['minecraft:freeze_top_layer']
        a = attrs(sky, fog, water_fog=water_fog, fog_start=56.0, fog_end=fog_end, music_sound='minecraft:music.overworld.desert',
                  extra={'minecraft:gameplay/snow_golem_melts': True})
        if carvers is None and name not in (HAMADA, HOGGAR, TASSILI):
            carvers = FLAT_CARVERS
        reg.biome(name, biome(2.0, 0.0, False, effects(water, grass, foliage, '#A68A56'), a, f,
                              creatures_list if creatures_list is not None else creatures, monsters=DESERT_MONSTERS, carvers=carvers))

    erg_carvers = ['minecraft:cave_extra_underground']
    make(GREAT_ERG, veg=[cover_erg], carvers=erg_carvers, creatures_list=[spawn('rabbit', 4, 1, 2), spawn('camel', 1, 1, 1)])
    make(SAND_SEA, veg=[cover_erg], carvers=erg_carvers, creatures_list=[spawn('rabbit', 4, 1, 2), spawn('camel', 2, 1, 2)])
    make(MARGIN, surface=['minecraft:desert_well'], veg=[acacia_rare, cover_margin], carvers=erg_carvers)
    make(OASIS, grass='#86A845', foliage='#6E9A38', veg=[palms, palms_young, tamarisk_oasis, cover_oasis, 'minecraft:patch_sugar_cane'],
         water='#2FA6AC', water_fog='#1C6468', creatures_list=[spawn('rabbit', 4, 2, 3), spawn('camel', 3, 1, 2), spawn('frog', 2, 1, 2)])
    make(REG, local=[rocks_reg], surface=['minecraft:desert_well'], veg=[acacia_rare, cover_reg], smoothing_on=True)
    make(HAMADA, local=[rocks_hamada], veg=[hoodoo_rare, acacia_rare, cover_reg])
    make(HOGGAR, local=[rocks_basalt], veg=[cover_reg], fog_end=900.0, creatures_list=[spawn('goat', 3, 1, 3), spawn('rabbit', 2, 1, 2)])
    make(TASSILI, local=[hoodoos, hoodoos_small], veg=[acacia_rare, cover_reg])
    make(WADI, local=[rocks_reg], veg=[acacia_wadi, tamarisk_wadi, cover_margin])
    make(CHOTT, smoothing_on=False, water='#7FB8B0', water_fog='#4E7E78', creatures_list=[])

    for b in ALL:
        reg.tag_biome('minecraft:is_overworld', b)
        reg.tag_biome('minecraft:has_structure/mineshaft', b)
        reg.tag_biome('minecraft:has_structure/trial_chambers', b)
        reg.tag_biome('minecraft:has_structure/ruined_portal_desert', b)
        reg.tag_biome('minecraft:spawns_gold_rabbits', b)
        reg.tag_biome('minecraft:spawns_warm_variant_farm_animals', b)
        reg.tag_biome('minecraft:stronghold_biased_to', b)
    for b in (MARGIN, REG, OASIS):
        reg.tag_biome('minecraft:has_structure/village_desert', b)
    for b in (MARGIN, REG, SAND_SEA):
        reg.tag_biome('minecraft:has_structure/desert_pyramid', b)
    for b in (REG, MARGIN):
        reg.tag_biome('minecraft:has_structure/pillager_outpost', b)
    reg.tag_biome('minecraft:is_mountain', HOGGAR)

    # ------------------------------------------------------------------ surface
    s = 'minecraft:surface'
    underwater = c_not(c_water(0, 0))
    sand = sr_block(es('sahara_sand'))
    sandstone = sr_block(es('sahara_sandstone'))
    hamada = sr_block(es('hamada_stone'))
    floor = sr_seq(
        sr_if(underwater, sr_seq(sr_if(c_biome(CHOTT), sr_block(es('salt_crust'))), sr_if(c_noise(s, 0.35), sr_block(state('clay'))), sand)),
        sr_if(c_biome(OASIS), sr_seq(sr_if(c_not(c_y_above(66)), sr_block(state('grass_block', snowy=False))),
                                     sr_if(c_noise(s, 0.3), sr_if(c_not(c_y_above(70)), sr_block(state('grass_block', snowy=False)))),
                                     sand)),
        sr_if(c_biome(*SANDY), sand),
        sr_if(c_biome(REG), sr_seq(sr_if(c_noise(s, 0.45), sand), sr_block(es('desert_pavement')))),
        sr_if(c_biome(HAMADA), sr_seq(sr_if(c_steep(), hamada), sr_if(c_noise(s, 0.3), sand),
                                      sr_if(c_noise(s, -10.0, -0.6), sr_block(es('desert_pavement'))), hamada)),
        sr_if(c_biome(HOGGAR), sr_seq(sr_if(c_steep(), sr_block(state('basalt', axis='y'))),
                                      sr_if(c_not(c_y_above(84)), sr_seq(sr_if(c_noise(s, 0.0), sand), sr_block(es('desert_pavement')))),
                                      sr_if(c_noise(s, 0.35), sr_block(state('tuff'))),
                                      sr_if(c_noise(s, -10.0, -0.35), sr_block(state('smooth_basalt'))),
                                      sr_block(state('blackstone')))),
        sr_if(c_biome(TASSILI), sr_seq(sr_if(c_steep(), sandstone),
                                       sr_if(c_y_above(90), sr_seq(sr_if(c_noise(s, 0.2), hamada), sandstone)), sand)),
        sr_if(c_biome(WADI), sr_seq(sr_if(c_noise(s, 0.35), sr_block(state('gravel'))), sand)),
        sr_if(c_biome(CHOTT), sr_seq(sr_if(c_noise(s, 0.62), sand), sr_block(es('salt_crust')))),
        sand)
    under = sr_seq(
        sr_if(c_biome(HAMADA), hamada),
        sr_if(c_biome(HOGGAR), sr_block(state('blackstone'))),
        sr_if(c_biome(TASSILI), sr_if(c_y_above(88), sandstone)),
        sand)
    deep = sr_if(c_biome(*(SANDY + [OASIS, REG, WADI, TASSILI, CHOTT])), sandstone)
    ceiling = sr_if(c_biome(*(SANDY + [OASIS, REG, WADI, TASSILI, CHOTT])), sandstone)
    rules = surface_shell(sr_seq(sr_if(ON_FLOOR, floor), sr_if(UNDER_FLOOR, under), sr_if(deep_floor(30), deep), sr_if(ON_CEILING, ceiling)))

    # ------------------------------------------------------------------ biome source
    entries = []

    def surface_entry(b, **kw):
        entries.append({'biome': rl(b), 'parameters': param(d=0.0, **kw)})
        entries.append({'biome': rl(b), 'parameters': param(d=1.0, **kw)})

    surface_entry(OASIS, h=(0.25, 2))
    surface_entry(GREAT_ERG, h=(-2, 0.25), c=(0.1, 2), e=(0.05, 2))
    surface_entry(SAND_SEA, h=(-2, 0.25), c=(0.1, 2), e=(-2, 0.05))
    surface_entry(MARGIN, h=(-2, 0.25), c=(-0.02, 0.1))
    surface_entry(WADI, h=(-2, 0.25), c=(-2, -0.02), w=(-2, 0.03))
    surface_entry(HOGGAR, h=(-2, 0.25), c=(-2, -0.02), w=(0.03, 2), t=(0.46, 2))
    surface_entry(HAMADA, h=(-2, 0.25), c=(-2, -0.02), w=(0.03, 2), t=(0.21, 0.46))
    surface_entry(CHOTT, h=(-2, 0.25), c=(-2, -0.02), w=(0.03, 2), t=(-0.32, 0.21), e=(-2, -0.48))
    surface_entry(REG, h=(-2, 0.25), c=(-2, -0.02), w=(0.03, 2), t=(-0.32, 0.21), e=(-0.48, 2))
    surface_entry(TASSILI, h=(-2, 0.25), c=(-2, -0.02), w=(0.03, 2), t=(-2, -0.32))
    entries.append({'biome': 'minecraft:dripstone_caves', 'parameters': param(e=(0.25, 2), d=(0.2, 0.9))})
    entries.append({'biome': 'minecraft:deep_dark', 'parameters': param(t=(-2, 0.1), d=(1.15, 2.0))})

    spawn_target = [param(c=(-0.04, 0.3), h=(-2, 0.2), d=0.0)]
    ns = noise_settings(router(height, sloped, rock, oasis, erg, erosion, wadi, depth, entrances=False), rules, spawn_target)
    reg.put('worldgen/noise_settings', 'sahara_desert', ns)
    preset = world_preset('sahara_desert')
    preset['dimensions']['minecraft:overworld']['generator']['biome_source']['biomes'] = entries
    reg.put('worldgen/world_preset', 'sahara_desert', preset)
    return 'sahara_desert'
