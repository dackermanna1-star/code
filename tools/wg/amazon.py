"""Amazon Rainforest world type: a vast, flat lowland of multi-storey rainforest where kapok giants
tower over a closed canopy hung with lianas, threaded by enormous muddy rivers and tea-black
tributaries, seasonally flooded varzea and igapo forests, buriti palm swamps and oxbow lagoons of
giant water lilies, rising here and there into forested hills."""
from wg.common import (cover_config, FLAT_CARVERS, LOCAL_MODIFICATIONS, MONSTERS, TOP_LAYER_MODIFICATION, VEGETAL_DECORATION, attrs, base_features, biome, effects,
                       noise_settings, param, router, spawn, surface_shell, world_preset)
from wg.dsl import (ON_FLOOR, UNDER_FLOOR, add, adds, biome_filter, c_biome, c_noise, c_not, c_steep, c_water, c_y_above, cell_bumps,
                    count, dabs, dmax, dmin, eroded, es, flat_cache, funiform, heightmap, in_square, lerp, mul, noise, rarity, rl, shifted,
                    simple, smooth_ramp, spline, sr_block, sr_if, sr_seq, state, sub, uniform, water_depth, weighted, weighted_int)

W = 'amazon'
RIVER, BLACKWATER, VARZEA, IGAPO, FOREST, EMERGENT, SWAMP, HILLS = (
    'amazon_river', 'blackwater_river', 'varzea_flooded_forest', 'igapo_flooded_forest', 'amazon_rainforest', 'emergent_rainforest',
    'buriti_palm_swamp', 'rainforest_hills')
ALL = [RIVER, BLACKWATER, VARZEA, IGAPO, FOREST, EMERGENT, SWAMP, HILLS]


def build(reg):
    n = {}
    for name, first, amps in (('base', -9, [1.0, 0.5]), ('detail', -6, [1.0, 0.5]), ('hills', -10, [1.0, 0.6, 0.3]), ('hill_shape', 0, [1.0]),
                              ('river_main', -11, [1.0, 0.4]), ('river_trib', -9, [1.0, 0.5, 0.25]), ('water_type', -10, [1.0, 0.5]),
                              ('wetness', -8, [1.0, 0.5]), ('canopy', -7, [1.0, 0.5]), ('lagoon', 0, [1.0])):
        n[name] = reg.noise('%s/%s' % (W, name), first, amps)

    # ------------------------------------------------------------------ terrain
    main = dabs(shifted(n['river_main']))
    trib = dabs(shifted(n['river_trib']))
    river = reg.df(W + '/river', flat_cache(dmin(mul(main, 0.5), trib)))
    main_near = spline(main, [(0.0, 1.0), (0.025, 1.0), (0.034, 0.0)])
    hills = reg.df(W + '/hills', flat_cache(smooth_ramp(shifted(n['hills']), 0.2, 0.55)))
    hill_h = mul(hills, add(10.0, mul(55.0, dmax(0.0, add(0.25, eroded(n['hill_shape'], 1.0 / 300.0, octaves=6, erosion=1.5))))))
    land = adds(67.0, mul(2.2, noise(n['base'])), mul(0.8, noise(n['detail'])), hill_h)
    wet = reg.df(W + '/wetness', flat_cache(shifted(n['wetness'])))
    swamp_w = mul(smooth_ramp(wet, 0.32, 0.5), sub(1.0, hills))
    floodplain = spline(river, [(0.0, 1.0), (0.03, 1.0), (0.052, 0.0)])
    channel = spline(river, [(0.0, 1.0), (0.0105, 1.0), (0.0145, 0.0)])
    near_rivers = spline(river, [(0.03, 1.0), (0.09, 0.0)])
    lagoon = mul(cell_bumps(n['lagoon'], 320, 0.35, 14.0, 30.0, 1.0, 1.0, edge=2.0, profile=0.8), near_rivers)
    h = lerp(floodplain, land, add(62.6, mul(0.9, noise(n['detail']))))
    h = lerp(swamp_w, h, add(62.4, mul(0.8, noise(n['detail']))))
    h = lerp(channel, h, lerp(main_near, 57.0, 51.0))
    h = lerp(lagoon, h, 59.5)
    height = reg.df(W + '/height', flat_cache(h))
    sloped = reg.df(W + '/sloped_cheese', mul(sub(height, 'minecraft:y'), 0.125))
    depth = reg.df(W + '/depth', mul(sub(dmin(height, 96.0), 'minecraft:y'), 1.0 / 80.0))
    water_type = reg.df(W + '/water_type', flat_cache(shifted(n['water_type'])))
    canopy = reg.df(W + '/canopy', flat_cache(shifted(n['canopy'])))

    # ------------------------------------------------------------------ features
    liana = simple(es('liana', tip=True))
    epiphyte = simple(es('bromeliad'))
    vine = simple(state('vine'))
    jungle_log = state('jungle_log', axis='y')
    mixed_leaves = weighted((es('rainforest_leaves'), 70), (state('jungle_leaves'), 30))
    reg.cf('tree/kapok', 'emergent_tree', {
        'trunk': simple(es('kapok_log', axis='y')), 'branch': simple(es('kapok_wood', axis='y')), 'leaves': simple(es('kapok_leaves')),
        'height': uniform(42, 58), 'trunk_radius': funiform(1.2, 1.75), 'buttresses': uniform(4, 7), 'limbs': uniform(5, 8),
        'limb_length': funiform(6.0, 9.5), 'cluster_radius': funiform(3.8, 5.0), 'liana': liana, 'epiphyte': epiphyte, 'vine': vine,
        'decoration_chance': 0.35})
    reg.cf(W + '/kapok_small', 'emergent_tree', {
        'trunk': simple(es('kapok_log', axis='y')), 'branch': simple(es('kapok_wood', axis='y')), 'leaves': simple(es('kapok_leaves')),
        'height': uniform(26, 34), 'trunk_radius': funiform(0.7, 1.1), 'buttresses': uniform(3, 5), 'limbs': uniform(4, 6),
        'limb_length': funiform(4.0, 6.5), 'cluster_radius': funiform(3.0, 4.0), 'liana': liana, 'epiphyte': epiphyte, 'vine': vine,
        'decoration_chance': 0.3})
    reg.cf(W + '/brazil_nut', 'emergent_tree', {
        'trunk': simple(jungle_log), 'branch': simple(state('jungle_wood', axis='y')), 'leaves': simple(es('rainforest_leaves')),
        'height': uniform(38, 50), 'trunk_radius': funiform(0.9, 1.3), 'buttresses': uniform(0, 2), 'limbs': uniform(4, 6),
        'limb_length': funiform(4.5, 7.0), 'cluster_radius': funiform(3.5, 4.6), 'liana': liana, 'epiphyte': epiphyte, 'vine': vine,
        'decoration_chance': 0.3})
    broadleaf = {'trunk': simple(jungle_log), 'vine': vine, 'liana': liana, 'epiphyte': epiphyte}
    reg.cf(W + '/canopy_large', 'broadleaf_tree', dict(broadleaf, leaves=mixed_leaves, height=uniform(20, 30), trunk_width=2,
                                                      crown_radius=funiform(3.6, 5.0), branches=uniform(3, 6), crown_start=0.55,
                                                      buttresses=True, decoration_chance=0.3))
    reg.cf(W + '/canopy_medium', 'broadleaf_tree', dict(broadleaf, leaves=weighted((es('rainforest_leaves'), 60), (state('jungle_leaves'), 25),
                                                                                   (es('kapok_leaves'), 15)),
                                                       height=uniform(12, 20), crown_radius=funiform(2.8, 4.0), branches=uniform(2, 4),
                                                       crown_start=0.6, decoration_chance=0.25))
    reg.cf(W + '/canopy_flooded', 'broadleaf_tree', dict(broadleaf, leaves=mixed_leaves, height=uniform(12, 22), crown_radius=funiform(2.8, 4.2),
                                                        branches=uniform(2, 5), crown_start=0.55, decoration_chance=0.3, flood_depth=3))
    reg.cf(W + '/understory', 'broadleaf_tree', dict(broadleaf, leaves=weighted((es('rainforest_leaves'), 70), (state('jungle_leaves'), 30)),
                                                    height=uniform(5, 9), crown_radius=funiform(1.8, 2.6), branches=uniform(1, 3),
                                                    crown_start=0.5, decoration_chance=0.15))
    reg.cf(W + '/jungle_shrub', 'shrub', {'stem': simple(jungle_log), 'leaves': weighted((state('jungle_leaves'), 60), (es('rainforest_leaves'), 40)),
                                          'radius': funiform(1.2, 2.2), 'flatness': funiform(0.7, 1.0), 'lobes': uniform(1, 2), 'density': 0.8})
    acai = {'trunk': simple(es('acai_palm_log', axis='y')), 'fronds': simple(es('acai_palm_leaves')), 'style': 'feather'}
    reg.cf(W + '/acai_palm', 'palm', dict(acai, height=uniform(10, 17), curve=funiform(0.0, 0.25), frond_count=uniform(8, 11),
                                         frond_length=funiform(3.5, 5.2), droop=0.22, flood_depth=2))
    # small feather palms of the understorey (Geonoma, Astrocaryum and young palms) lining the forest paths
    reg.cf(W + '/understory_palm', 'palm', dict(acai, height=uniform(2, 5), curve=funiform(0.0, 0.3), frond_count=uniform(6, 9),
                                               frond_length=funiform(2.2, 3.4), droop=0.3))
    reg.cf(W + '/acai_clump', 'minecraft:random_patch', {'tries': 5, 'xz_spread': 2, 'y_spread': 1, 'feature': {
        'feature': rl(W + '/acai_palm'), 'placement': []}})
    reg.cf(W + '/buriti_palm', 'palm', {'trunk': simple(es('acai_palm_log', axis='y')), 'fronds': simple(es('buriti_palm_leaves')),
                                        'height': uniform(13, 21), 'curve': funiform(0.0, 0.15), 'frond_count': uniform(10, 14),
                                        'frond_length': funiform(3.6, 5.0), 'droop': 0.12, 'style': 'fan', 'flood_depth': 3})
    reg.cf(W + '/cecropia', 'cecropia', {'trunk': simple(es('cecropia_log', axis='y')), 'leaves': simple(es('cecropia_leaves')),
                                         'height': uniform(9, 17), 'branches': uniform(3, 5)})
    reg.cf(W + '/victoria_lilies', 'victoria_lilies', {'count': uniform(2, 5), 'spread': 7})
    reg.cf(W + '/fallen_kapok', 'minecraft:fallen_tree', {
        'log_decorators': [{'type': 'minecraft:attached_to_logs', 'block_provider': weighted((state('moss_carpet'), 3), (state('red_mushroom'), 1),
                                                                                             (state('brown_mushroom'), 1)),
                            'directions': ['up'], 'probability': 0.35}],
        'log_length': uniform(5, 11), 'stump_decorators': [{'type': 'minecraft:trunk_vine'}],
        'trunk_provider': simple(es('kapok_log', axis='y'))})

    def cover(name, entries, density, biomes, scale=12.0, influence=0.5, salt=0, patches=()):
        reg.cf(W + '/cover_' + name, 'ground_cover', cover_config(entries, density, biomes, scale, influence, salt, patches))
        return reg.pf(W + '/cover_' + name, W + '/cover_' + name, [])

    litter4 = state('leaf_litter', facing='north', segment_amount=4)
    litter3 = state('leaf_litter', facing='east', segment_amount=3)
    floor_plants = [(state('fern'), 26), (state('large_fern', half='lower'), 12), (litter4, 12), (litter3, 6),
                    (es('heliconia', half='lower'), 6), (es('giant_taro', half='lower'), 7), (es('bromeliad'), 5), (state('bush'), 10),
                    (state('short_grass'), 6), (state('moss_carpet'), 5)]
    cover_forest = cover('forest', floor_plants, 0.62, [FOREST, EMERGENT, HILLS], salt=21)
    cover_flooded = cover('flooded', [(state('fern'), 20), (es('giant_taro', half='lower'), 16), (es('heliconia', half='lower'), 10),
                                      (state('short_grass'), 20), (state('bush'), 10), (litter4, 8)], 0.55, [VARZEA, IGAPO], salt=22)
    cover_swamp = cover('swamp', [(state('fern'), 30), (state('short_grass'), 30), (state('tall_grass', half='lower'), 20),
                                  (es('giant_taro', half='lower'), 20)], 0.45, [SWAMP], salt=23)
    cover_bank = cover('banks', [(state('short_grass'), 50), (state('tall_grass', half='lower'), 25), (state('fern'), 15),
                                 (es('giant_taro', half='lower'), 10)], 0.4, [RIVER, BLACKWATER], salt=24)

    def tree_pf(name, feature, cnt, water=0):
        return reg.pf(W + '/' + name, feature, [cnt, in_square(), water_depth(water), heightmap('OCEAN_FLOOR'), biome_filter()])

    def rare_pf(name, feature, chance, water=0):
        return reg.pf(W + '/' + name, feature, [rarity(chance), in_square(), water_depth(water), heightmap('OCEAN_FLOOR'), biome_filter()])

    kapok_dense = tree_pf('kapok_dense', 'tree/kapok', count(weighted_int((0, 2), (1, 3), (2, 1))))
    kapok_rare = rare_pf('kapok_rare', 'tree/kapok', 3)
    kapok_varzea = rare_pf('kapok_varzea', 'tree/kapok', 6, water=2)
    kapok_small = rare_pf('kapok_small', W + '/kapok_small', 2)
    brazil_nut = rare_pf('brazil_nut', W + '/brazil_nut', 4)
    brazil_nut_dense = tree_pf('brazil_nut_dense', W + '/brazil_nut', count(uniform(0, 1)))
    canopy_large = tree_pf('canopy_large', W + '/canopy_large', count(uniform(2, 3)))
    canopy_medium = tree_pf('canopy_medium', W + '/canopy_medium', count(uniform(3, 5)))
    canopy_flooded = tree_pf('canopy_flooded', W + '/canopy_flooded', count(uniform(3, 6)), water=3)
    understory = tree_pf('understory', W + '/understory', count(uniform(3, 6)))
    shrubs = tree_pf('jungle_shrubs', W + '/jungle_shrub', count(uniform(2, 4)))
    understory_palms = tree_pf('understory_palms', W + '/understory_palm', count(uniform(1, 3)))
    acai_varzea = tree_pf('acai_varzea', W + '/acai_clump', count(uniform(1, 3)), water=2)
    acai_rare = rare_pf('acai_rare', W + '/acai_clump', 2)
    buriti_swamp = tree_pf('buriti_swamp', W + '/buriti_palm', count(uniform(4, 7)), water=3)
    buriti_rare = rare_pf('buriti_rare', W + '/buriti_palm', 3, water=3)
    cecropia_banks = tree_pf('cecropia_banks', W + '/cecropia', count(uniform(1, 2)), water=1)
    cecropia_rare = rare_pf('cecropia_rare', W + '/cecropia', 4)
    lilies = reg.pf(W + '/victoria_lilies', W + '/victoria_lilies', [count(uniform(1, 3)), in_square(), heightmap('WORLD_SURFACE_WG'),
                                                                      biome_filter()])
    fallen = rare_pf('fallen_kapok', W + '/fallen_kapok', 3)

    # ------------------------------------------------------------------ biomes
    sky, fog = '#8CB8E6', '#BFD2C4'
    # macaws and toucans in the canopy; jaguars, tapirs, ocelots and armadillos below
    creatures = [spawn('parrot', 30, 1, 2), spawn('earthscapes:toucan', 25, 1, 2), spawn('earthscapes:tapir', 4, 1, 2),
                 spawn('earthscapes:jaguar', 2, 1, 1), spawn('ocelot', 2, 1, 1), spawn('armadillo', 3, 1, 2), spawn('earthscapes:capybara', 2, 2, 4)]
    wetland = [spawn('earthscapes:capybara', 8, 3, 6), spawn('earthscapes:black_caiman', 3, 1, 2), spawn('earthscapes:tapir', 3, 1, 2),
               spawn('earthscapes:jaguar', 2, 1, 1), spawn('earthscapes:toucan', 8, 1, 2), spawn('parrot', 10, 1, 2)]
    banks = [spawn('earthscapes:capybara', 5, 2, 4), spawn('earthscapes:black_caiman', 4, 1, 2), spawn('frog', 4, 2, 3)]
    dolphins = [spawn('earthscapes:river_dolphin', 4, 1, 3)]

    def make(name, grass='#4E8A2C', foliage='#3B7A22', local=(), veg=(), water='#5E7048', water_fog='#33402A', fog_start=14.0, fog_end=210.0,
             creatures_list=None, water_creature=None, water_ambient=None):
        f = base_features()
        f[LOCAL_MODIFICATIONS] += list(local)
        f[VEGETAL_DECORATION] += list(veg)
        f[TOP_LAYER_MODIFICATION] = ['minecraft:freeze_top_layer']
        a = attrs(sky, fog, water_fog=water_fog, fog_start=fog_start, fog_end=fog_end, music_sound='minecraft:music.overworld.jungle',
                  extra={'minecraft:gameplay/increased_fire_burnout': True})
        reg.biome(name, biome(0.95, 0.95, True, effects(water, grass, foliage, '#6B5A2A'), a, f,
                              creatures_list if creatures_list is not None else creatures, monsters=MONSTERS,
                              water_creature=water_creature, water_ambient=water_ambient,
                              carvers=None if name == HILLS else FLAT_CARVERS))

    fish = [spawn('tropical_fish', 25, 8, 8)]
    make(FOREST, veg=[kapok_rare, kapok_small, brazil_nut, canopy_large, canopy_medium, understory, understory_palms, acai_rare, cecropia_rare, shrubs, fallen,
                      cover_forest, 'minecraft:vines'])
    make(EMERGENT, veg=[kapok_dense, brazil_nut_dense, canopy_large, canopy_medium, understory, understory_palms, shrubs, fallen, cover_forest, 'minecraft:vines'])
    make(HILLS, grass='#55902E', foliage='#418024', veg=[kapok_small, brazil_nut, canopy_large, canopy_medium, understory, understory_palms, shrubs,
                                                         cover_forest, 'minecraft:bamboo_light', 'minecraft:vines'], fog_end=260.0)
    make(VARZEA, grass='#5A9234', foliage='#468428', water='#8C6A3C', water_fog='#5A4224',
         veg=[kapok_varzea, canopy_flooded, acai_varzea, cecropia_banks, buriti_rare, lilies, cover_flooded, 'minecraft:patch_waterlily',
              'minecraft:vines'],
         creatures_list=wetland + [spawn('frog', 8, 2, 4)], water_ambient=fish)
    make(IGAPO, grass='#4C8430', foliage='#3A7424', water='#3A2416', water_fog='#22140A',
         veg=[canopy_flooded, acai_varzea, buriti_rare, lilies, cover_flooded, 'minecraft:patch_waterlily', 'minecraft:vines'],
         creatures_list=wetland + [spawn('frog', 8, 2, 4)], water_ambient=fish)
    make(SWAMP, grass='#5E9636', foliage='#4A882C', water='#4E4A2A', water_fog='#2E2C18',
         veg=[buriti_swamp, canopy_flooded, cover_swamp, 'minecraft:patch_waterlily'],
         creatures_list=wetland + [spawn('frog', 10, 2, 5)], water_ambient=fish)
    make(RIVER, grass='#5A9234', foliage='#468428', water='#8C6A3C', water_fog='#5A4224', fog_start=48.0, fog_end=480.0,
         veg=[cecropia_banks, cover_bank], creatures_list=banks,
         water_creature=dolphins, water_ambient=fish)
    make(BLACKWATER, grass='#4C8430', foliage='#3A7424', water='#3A2416', water_fog='#22140A', fog_start=48.0, fog_end=480.0,
         veg=[cecropia_banks, cover_bank], creatures_list=banks,
         water_creature=dolphins, water_ambient=fish)

    for b in ALL:
        reg.tag_biome('minecraft:is_overworld', b)
        reg.tag_biome('minecraft:has_structure/mineshaft', b)
        reg.tag_biome('minecraft:has_structure/trial_chambers', b)
        reg.tag_biome('minecraft:spawns_warm_variant_farm_animals', b)
        reg.tag_biome('minecraft:stronghold_biased_to', b)
    for b in (FOREST, EMERGENT, HILLS, VARZEA, IGAPO, SWAMP):
        reg.tag_biome('minecraft:is_jungle', b)
        reg.tag_biome('minecraft:has_structure/ruined_portal_jungle', b)
    for b in (FOREST, EMERGENT, HILLS):
        reg.tag_biome('minecraft:has_structure/jungle_temple', b)
        reg.tag_biome('minecraft:has_structure/trail_ruins', b)
    for b in (RIVER, BLACKWATER):
        reg.tag_biome('minecraft:is_river', b)
    reg.tag_biome('minecraft:is_hill', HILLS)
    for b in (VARZEA, IGAPO, SWAMP):
        reg.tag_biome('minecraft:spawns_warm_variant_frogs', b)
        reg.tag_biome('minecraft:allows_surface_slime_spawns', b)

    # ------------------------------------------------------------------ surface
    s = 'minecraft:surface'
    underwater = c_not(c_water(0, 0))
    grass = sr_block(state('grass_block', snowy=False))
    mud = sr_block(state('mud'))
    floor = sr_seq(
        sr_if(underwater, sr_seq(
            sr_if(c_biome(RIVER), sr_seq(sr_if(c_noise(s, 0.25), sr_block(state('clay'))), sr_if(c_noise(s, -10.0, -0.45), mud),
                                         sr_block(state('sand')))),
            sr_if(c_biome(BLACKWATER, IGAPO), sr_seq(sr_if(c_noise(s, 0.35), mud), sr_block(state('sand')))),
            sr_seq(sr_if(c_noise(s, 0.1), sr_block(state('clay'))), mud))),
        sr_if(c_biome(RIVER), sr_seq(sr_if(c_not(c_y_above(65)), sr_seq(sr_if(c_noise(s, 0.0), mud), sr_block(state('sand')))), grass)),
        sr_if(c_biome(BLACKWATER), sr_seq(sr_if(c_not(c_y_above(65)), sr_block(state('sand'))), grass)),
        sr_if(c_biome(VARZEA, IGAPO, SWAMP), sr_seq(sr_if(c_not(c_y_above(64)), sr_seq(sr_if(c_noise(s, 0.2), mud), grass)),
                                                    sr_if(c_noise(s, 0.35), sr_block(state('podzol', snowy=False))), grass)),
        sr_if(c_biome(FOREST, EMERGENT, HILLS), sr_seq(
            sr_if(c_steep(), sr_seq(sr_if(c_noise(s, 0.0), sr_block(state('coarse_dirt'))), sr_block(es('laterite')))),
            sr_if(c_noise(s, 0.28), sr_block(state('podzol', snowy=False))),
            sr_if(c_noise(s, -10.0, -0.55), sr_block(state('coarse_dirt'))),
            sr_if(c_noise('minecraft:surface_secondary', 0.55), sr_block(state('moss_block'))),
            sr_if(c_noise('minecraft:surface_secondary', -10.0, -0.6), sr_block(state('rooted_dirt'))),
            grass)),
        grass)
    under = sr_seq(
        sr_if(underwater, sr_seq(sr_if(c_biome(RIVER, BLACKWATER), sr_block(state('sand'))), mud)),
        sr_if(c_biome(FOREST, EMERGENT, HILLS), sr_block(es('laterite'))),
        sr_if(c_biome(VARZEA, IGAPO, SWAMP), sr_seq(sr_if(c_not(c_y_above(63)), mud), sr_block(state('dirt')))),
        sr_if(c_biome(RIVER, BLACKWATER), sr_seq(sr_if(c_not(c_y_above(65)), sr_block(state('sand'))), sr_block(state('dirt')))),
        sr_block(state('dirt')))
    rules = surface_shell(sr_seq(sr_if(ON_FLOOR, floor), sr_if(UNDER_FLOOR, under)))

    # ------------------------------------------------------------------ biome source
    entries = []

    def surface_entry(b, **kw):
        entries.append({'biome': rl(b), 'parameters': param(d=0.0, **kw)})
        entries.append({'biome': rl(b), 'parameters': param(d=1.0, **kw)})

    surface_entry(BLACKWATER, w=(-2, 0.0125), t=(-2, -0.22))
    surface_entry(RIVER, w=(-2, 0.0125), t=(-0.22, 2))
    surface_entry(IGAPO, w=(0.0125, 0.042), t=(-2, -0.22))
    surface_entry(VARZEA, w=(0.0125, 0.042), t=(-0.22, 2))
    surface_entry(HILLS, w=(0.042, 2), c=(0.45, 2))
    surface_entry(SWAMP, w=(0.042, 2), c=(-2, 0.45), e=(0.38, 2))
    surface_entry(EMERGENT, w=(0.042, 2), c=(-2, 0.45), e=(-2, 0.38), h=(0.28, 2))
    surface_entry(FOREST, w=(0.042, 2), c=(-2, 0.45), e=(-2, 0.38), h=(-2, 0.28))
    entries.append({'biome': 'minecraft:lush_caves', 'parameters': param(e=(-0.1, 2), d=(0.2, 0.9))})
    entries.append({'biome': 'minecraft:deep_dark', 'parameters': param(t=(-2, 0.1), d=(1.15, 2.0))})

    spawn_target = [param(w=(0.06, 2), c=(-2, 0.45), e=(-2, 0.38), d=0.0)]
    ns = noise_settings(router(height, sloped, water_type, canopy, hills, wet, river, depth), rules, spawn_target)
    reg.put('worldgen/noise_settings', 'amazon_rainforest', ns)
    preset = world_preset('amazon_rainforest')
    preset['dimensions']['minecraft:overworld']['generator']['biome_source']['biomes'] = entries
    reg.put('worldgen/world_preset', 'amazon_rainforest', preset)
    return 'amazon_rainforest'
