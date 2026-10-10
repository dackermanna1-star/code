#!/usr/bin/env python3
"""Generates block/item assets and block data for Earthscapes.

Writes blockstates, block and item models, item model definitions, the English language file,
loot tables, recipes and tags. Run from the repository root:  python3 tools/gen_assets.py
The block list here mirrors net.earthscapes.registry.EsBlocks.
"""
import json
import os
import shutil

ROOT = os.path.join(os.path.dirname(__file__), '..')
RES = os.path.join(ROOT, 'src/main/resources')
NS = 'earthscapes'
ASSETS = os.path.join(RES, 'assets', NS)
DATA = os.path.join(RES, 'data', NS)
MC_DATA = os.path.join(RES, 'data', 'minecraft')

LANG = {}
TAGS = {}  # (registry, namespace, path) -> set of values
written = set()


def write(path, obj):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w') as f:
        json.dump(obj, f, indent=2)
        f.write('\n')
    written.add(os.path.normpath(path))


def tag(registry, name, *values):
    ns, path = name.split(':') if ':' in name else (NS, name)
    TAGS.setdefault((registry, ns, path), [])
    for v in values:
        if v not in TAGS[(registry, ns, path)]:
            TAGS[(registry, ns, path)].append(v)


def rl(name):
    return name if ':' in name else '%s:%s' % (NS, name)


def b(name):
    return '%s:block/%s' % (NS, name)


def title(name):
    return ' '.join(w.capitalize() for w in name.split('_'))


# ---------------------------------------------------------------------------- model helpers

def model(name, parent, textures=None, extra=None):
    obj = {'parent': parent}
    if textures:
        obj['textures'] = textures
    if extra:
        obj.update(extra)
    write(os.path.join(ASSETS, 'models/block', name + '.json'), obj)


def blockstate(name, variants=None, multipart=None):
    obj = {'variants': variants} if variants is not None else {'multipart': multipart}
    write(os.path.join(ASSETS, 'blockstates', name + '.json'), obj)


def item_def(name, model_ref, tints=None):
    m = {'type': 'minecraft:model', 'model': model_ref}
    if tints:
        m['tints'] = tints
    write(os.path.join(ASSETS, 'items', name + '.json'), {'model': m})


def item_generated(name, texture):
    write(os.path.join(ASSETS, 'models/item', name + '.json'), {'parent': 'minecraft:item/generated', 'textures': {'layer0': texture}})
    item_def(name, '%s:item/%s' % (NS, name))


def lang_block(name, display=None):
    LANG['block.%s.%s' % (NS, name)] = display or title(name)


def lang_item(name, display=None):
    LANG['item.%s.%s' % (NS, name)] = display or title(name)


# ---------------------------------------------------------------------------- loot helpers

def loot(name, pools):
    write(os.path.join(DATA, 'loot_table/blocks', name + '.json'),
          {'type': 'minecraft:block', 'pools': pools, 'random_sequence': '%s:blocks/%s' % (NS, name)})


def loot_self(name, drop=None):
    loot(name, [{'bonus_rolls': 0.0, 'conditions': [{'condition': 'minecraft:survives_explosion'}],
                 'entries': [{'type': 'minecraft:item', 'name': rl(drop or name)}], 'rolls': 1.0}])


SHEARS_OR_SILK = {'condition': 'minecraft:any_of', 'terms': [
    {'condition': 'minecraft:match_tool', 'predicate': {'items': 'minecraft:shears'}},
    {'condition': 'minecraft:match_tool', 'predicate': {'predicates': {'minecraft:enchantments': [
        {'enchantments': 'minecraft:silk_touch', 'levels': {'min': 1}}]}}}]}


def loot_leaves(name, sapling=None):
    children = [{'type': 'minecraft:item', 'conditions': [SHEARS_OR_SILK], 'name': rl(name)}]
    if sapling:
        children.append({'type': 'minecraft:item', 'conditions': [
            {'condition': 'minecraft:survives_explosion'},
            {'chances': [0.05, 0.0625, 0.083333336, 0.1], 'condition': 'minecraft:table_bonus', 'enchantment': 'minecraft:fortune'}],
            'name': rl(sapling)})
    pools = [{'bonus_rolls': 0.0, 'entries': [{'type': 'minecraft:alternatives', 'children': children}], 'rolls': 1.0},
             {'bonus_rolls': 0.0, 'conditions': [{'condition': 'minecraft:inverted', 'term': SHEARS_OR_SILK}],
              'entries': [{'type': 'minecraft:item', 'conditions': [
                  {'chances': [0.02, 0.022222223, 0.025, 0.033333335, 0.1], 'condition': 'minecraft:table_bonus', 'enchantment': 'minecraft:fortune'}],
                  'functions': [{'add': False, 'count': {'type': 'minecraft:uniform', 'max': 2.0, 'min': 1.0}, 'function': 'minecraft:set_count'},
                                {'function': 'minecraft:explosion_decay'}], 'name': 'minecraft:stick'}], 'rolls': 1.0}]
    loot(name, pools)


def loot_grass(name, seeds=True):
    children = [{'type': 'minecraft:item', 'conditions': [{'condition': 'minecraft:match_tool', 'predicate': {'items': 'minecraft:shears'}}],
                 'name': rl(name)}]
    if seeds:
        children.append({'type': 'minecraft:item', 'conditions': [{'chance': 0.125, 'condition': 'minecraft:random_chance'}],
                         'functions': [{'enchantment': 'minecraft:fortune', 'formula': 'minecraft:uniform_bonus_count', 'function': 'minecraft:apply_bonus',
                                        'parameters': {'bonusMultiplier': 2}}, {'function': 'minecraft:explosion_decay'}],
                         'name': 'minecraft:wheat_seeds'})
    loot(name, [{'bonus_rolls': 0.0, 'entries': [{'type': 'minecraft:alternatives', 'children': children}], 'rolls': 1.0}])


def loot_tall(name, shears_only=True):
    pools = []
    for half, other, offset in (('lower', 'upper', 1), ('upper', 'lower', -1)):
        entry = {'type': 'minecraft:item', 'name': rl(name)}
        if shears_only:
            entry['conditions'] = [{'condition': 'minecraft:match_tool', 'predicate': {'items': 'minecraft:shears'}}]
        else:
            entry['conditions'] = [{'condition': 'minecraft:survives_explosion'}]
        pools.append({'bonus_rolls': 0.0, 'conditions': [
            {'block': rl(name), 'condition': 'minecraft:block_state_property', 'properties': {'half': half}},
            {'condition': 'minecraft:location_check', 'offsetY': offset, 'predicate': {'block': {'blocks': rl(name), 'state': {'half': other}}}}],
            'entries': [entry], 'rolls': 1.0})
    loot(name, pools)


def loot_slab(name):
    loot(name, [{'bonus_rolls': 0.0, 'entries': [{'type': 'minecraft:item', 'functions': [
        {'add': False, 'conditions': [{'block': rl(name), 'condition': 'minecraft:block_state_property', 'properties': {'type': 'double'}}],
         'count': 2.0, 'function': 'minecraft:set_count'}, {'function': 'minecraft:explosion_decay'}], 'name': rl(name)}], 'rolls': 1.0}])


# ---------------------------------------------------------------------------- recipe helpers

def recipe(name, obj):
    write(os.path.join(DATA, 'recipe', name + '.json'), obj)


def shaped(name, pattern, key, result, count=1, category='building', group=None):
    obj = {'type': 'minecraft:crafting_shaped', 'category': category, 'key': key, 'pattern': pattern,
           'result': {'count': count, 'id': rl(result)}}
    if group:
        obj['group'] = group
    recipe(name, obj)


def shapeless(name, ingredients, result, count=1, category='building', group=None):
    obj = {'type': 'minecraft:crafting_shapeless', 'category': category, 'ingredients': ingredients,
           'result': {'count': count, 'id': rl(result)}}
    if group:
        obj['group'] = group
    recipe(name, obj)


def smelting(name, ingredient, result, xp=0.1, time=200):
    recipe(name, {'type': 'minecraft:smelting', 'category': 'blocks', 'cookingtime': time, 'experience': xp,
                  'ingredient': ingredient, 'result': {'id': result}})


# ---------------------------------------------------------------------------- block kinds

ITEM_TAGS_FROM_BLOCK = {'minecraft:logs_that_burn', 'minecraft:planks', 'minecraft:wooden_stairs', 'minecraft:wooden_slabs',
                        'minecraft:wooden_fences', 'minecraft:fence_gates', 'minecraft:leaves', 'minecraft:saplings', 'minecraft:small_flowers',
                        'minecraft:sand', 'minecraft:smelts_to_glass'}


def btag(block_name, *tags):
    for t in tags:
        tag('block', t, rl(block_name))
        if t in ITEM_TAGS_FROM_BLOCK:
            tag('item', t, rl(block_name))


def cube(name, texture=None, display=None, tags=(), drop=True):
    model(name, 'minecraft:block/cube_all', {'all': b(texture or name)})
    blockstate(name, {'': {'model': b(name)}})
    item_def(name, b(name))
    lang_block(name, display)
    if drop:
        loot_self(name)
    btag(name, *tags)


def cube_bottom_top(name, top, side, bottom, display=None, tags=()):
    model(name, 'minecraft:block/cube_bottom_top', {'top': b(top), 'side': b(side), 'bottom': b(bottom)})
    blockstate(name, {'': {'model': b(name)}})
    item_def(name, b(name))
    lang_block(name, display)
    loot_self(name)
    btag(name, *tags)


def pillar(name, side, end, display=None, tags=()):
    model(name, 'minecraft:block/cube_column', {'side': b(side), 'end': b(end)})
    model(name + '_horizontal', 'minecraft:block/cube_column_horizontal', {'side': b(side), 'end': b(end)})
    blockstate(name, {'axis=x': {'model': b(name + '_horizontal'), 'x': 90, 'y': 90},
                      'axis=y': {'model': b(name)},
                      'axis=z': {'model': b(name + '_horizontal'), 'x': 90}})
    item_def(name, b(name))
    lang_block(name, display)
    loot_self(name)
    btag(name, *tags)


def leaves(name, sapling=None, display=None):
    model(name, 'minecraft:block/cube_all', {'all': b(name)})
    blockstate(name, {'': {'model': b(name)}})
    item_def(name, b(name))
    lang_block(name, display)
    loot_leaves(name, sapling)
    btag(name, 'minecraft:leaves', 'minecraft:mineable/hoe')


def cross(name, texture=None, display=None, item_texture=None, loot_kind='self', tags=()):
    model(name, 'minecraft:block/cross', {'cross': b(texture or name)})
    blockstate(name, {'': {'model': b(name)}})
    item_generated(name, b(item_texture or texture or name))
    lang_block(name, display)
    if loot_kind == 'self':
        loot_self(name)
    elif loot_kind == 'grass':
        loot_grass(name)
    elif loot_kind == 'shears':
        loot_grass(name, seeds=False)
    btag(name, *tags)


def tall(name, display=None, shears_only=True, tags=()):
    model(name + '_bottom', 'minecraft:block/cross', {'cross': b(name + '_bottom')})
    model(name + '_top', 'minecraft:block/cross', {'cross': b(name + '_top')})
    blockstate(name, {'half=lower': {'model': b(name + '_bottom')}, 'half=upper': {'model': b(name + '_top')}})
    item_generated(name, b(name + '_top'))
    lang_block(name, display)
    loot_tall(name, shears_only)
    btag(name, *tags)


VANILLA_ASSETS = None


def copy_vanilla_blockstate(src_name, dst_name, replace):
    path = os.path.join(VANILLA_ASSETS, 'blockstates', src_name + '.json')
    with open(path) as f:
        text = f.read()
    for a, c in replace:
        text = text.replace(a, c)
    write(os.path.join(ASSETS, 'blockstates', dst_name + '.json'), json.loads(text))


def wood_set(name, display, sapling_display=None, leaves_display=None, log_word='Log', wood_word='Wood'):
    log, wood, slog, swood = name + '_log', name + '_wood', 'stripped_' + name + '_log', 'stripped_' + name + '_wood'
    planks_n = name + '_planks'
    pillar(log, log, log + '_top', display + ' ' + log_word, tags=('minecraft:logs_that_burn', 'minecraft:mineable/axe', NS + ':' + name + '_logs'))
    pillar(wood, log, log, display + ' ' + wood_word, tags=('minecraft:logs_that_burn', 'minecraft:mineable/axe', NS + ':' + name + '_logs'))
    pillar(slog, slog, slog + '_top', 'Stripped ' + display + ' ' + log_word,
           tags=('minecraft:logs_that_burn', 'minecraft:mineable/axe', NS + ':' + name + '_logs'))
    pillar(swood, slog, slog, 'Stripped ' + display + ' ' + wood_word,
           tags=('minecraft:logs_that_burn', 'minecraft:mineable/axe', NS + ':' + name + '_logs'))
    for n in (log, wood, slog, swood):
        tag('item', NS + ':' + name + '_logs', rl(n))
        tag('item', 'minecraft:logs_that_burn', rl(n))
    cube(planks_n, display=display + ' Planks', tags=('minecraft:planks', 'minecraft:mineable/axe'))
    rep = [('minecraft:block/acacia_planks', b(planks_n)), ('minecraft:block/acacia_', b(name + '_'))]
    # stairs
    for suffix, parent in (('', 'stairs'), ('_inner', 'inner_stairs'), ('_outer', 'outer_stairs')):
        model(name + '_stairs' + suffix, 'minecraft:block/' + parent, {'bottom': b(planks_n), 'side': b(planks_n), 'top': b(planks_n)})
    copy_vanilla_blockstate('acacia_stairs', name + '_stairs', rep)
    item_def(name + '_stairs', b(name + '_stairs'))
    lang_block(name + '_stairs', display + ' Stairs')
    loot_self(name + '_stairs')
    btag(name + '_stairs', 'minecraft:wooden_stairs')
    # slab
    model(name + '_slab', 'minecraft:block/slab', {'bottom': b(planks_n), 'side': b(planks_n), 'top': b(planks_n)})
    model(name + '_slab_top', 'minecraft:block/slab_top', {'bottom': b(planks_n), 'side': b(planks_n), 'top': b(planks_n)})
    copy_vanilla_blockstate('acacia_slab', name + '_slab', rep)
    item_def(name + '_slab', b(name + '_slab'))
    lang_block(name + '_slab', display + ' Slab')
    loot_slab(name + '_slab')
    btag(name + '_slab', 'minecraft:wooden_slabs')
    # fence
    model(name + '_fence_post', 'minecraft:block/fence_post', {'texture': b(planks_n)})
    model(name + '_fence_side', 'minecraft:block/fence_side', {'texture': b(planks_n)})
    model(name + '_fence_inventory', 'minecraft:block/fence_inventory', {'texture': b(planks_n)})
    copy_vanilla_blockstate('acacia_fence', name + '_fence', rep)
    item_def(name + '_fence', b(name + '_fence_inventory'))
    lang_block(name + '_fence', display + ' Fence')
    loot_self(name + '_fence')
    btag(name + '_fence', 'minecraft:wooden_fences')
    # fence gate
    for suffix, parent in (('', 'template_fence_gate'), ('_open', 'template_fence_gate_open'), ('_wall', 'template_fence_gate_wall'),
                           ('_wall_open', 'template_fence_gate_wall_open')):
        model(name + '_fence_gate' + suffix, 'minecraft:block/' + parent, {'texture': b(planks_n)})
    copy_vanilla_blockstate('acacia_fence_gate', name + '_fence_gate', rep)
    item_def(name + '_fence_gate', b(name + '_fence_gate'))
    lang_block(name + '_fence_gate', display + ' Fence Gate')
    loot_self(name + '_fence_gate')
    btag(name + '_fence_gate', 'minecraft:fence_gates')
    # leaves & sapling
    leaves(name + '_leaves', name + '_sapling', leaves_display or display + ' Leaves')
    cross(name + '_sapling', display=sapling_display or display + ' Sapling', tags=('minecraft:saplings',))
    # recipes
    shapeless(planks_n, ['#%s:%s_logs' % (NS, name)], planks_n, 4, group='planks')
    shaped(wood, ['##', '##'], {'#': rl(log)}, wood, 3, group='bark')
    shaped(swood, ['##', '##'], {'#': rl(slog)}, swood, 3, group='bark')
    shaped(name + '_stairs', ['#  ', '## ', '###'], {'#': rl(planks_n)}, name + '_stairs', 4, group='wooden_stairs')
    shaped(name + '_slab', ['###'], {'#': rl(planks_n)}, name + '_slab', 6, group='wooden_slab')
    shaped(name + '_fence', ['W#W', 'W#W'], {'#': 'minecraft:stick', 'W': rl(planks_n)}, name + '_fence', 3, category='misc', group='wooden_fence')
    shaped(name + '_fence_gate', ['#W#', '#W#'], {'#': 'minecraft:stick', 'W': rl(planks_n)}, name + '_fence_gate', 1, category='redstone',
           group='wooden_fence_gate')


def main():
    global VANILLA_ASSETS
    import sys
    VANILLA_ASSETS = sys.argv[1] if len(sys.argv) > 1 else os.environ.get('VANILLA_ASSETS')
    if not VANILLA_ASSETS:
        raise SystemExit('usage: gen_assets.py <path to extracted vanilla assets/minecraft>')

    # clean generated directories
    for d in ('blockstates', 'models', 'items'):
        shutil.rmtree(os.path.join(ASSETS, d), ignore_errors=True)
    for d in ('loot_table/blocks', 'recipe'):
        shutil.rmtree(os.path.join(DATA, d), ignore_errors=True)

    # ---------------- savanna
    cross('golden_grass', display='Golden Grass', loot_kind='grass', tags=('minecraft:replaceable_by_trees', 'minecraft:replaceable'))
    tall('tall_golden_grass', 'Tall Golden Grass', tags=('minecraft:replaceable_by_trees', 'minecraft:replaceable'))
    tall('red_oat_grass', 'Red Oat Grass', tags=('minecraft:replaceable_by_trees', 'minecraft:replaceable'))
    leaves('umbrella_thorn_leaves', 'umbrella_thorn_sapling', 'Umbrella Thorn Leaves')
    cross('umbrella_thorn_sapling', display='Umbrella Thorn Sapling', tags=('minecraft:saplings',))
    leaves('thornbush_leaves', None, 'Thornbush Leaves')
    wood_set('baobab', 'Baobab')
    pillar('fever_tree_log', 'fever_tree_log', 'fever_tree_log_top', 'Fever Tree Log', tags=('minecraft:logs_that_burn', 'minecraft:mineable/axe'))
    pillar('fever_tree_wood', 'fever_tree_log', 'fever_tree_log', 'Fever Tree Wood', tags=('minecraft:logs_that_burn', 'minecraft:mineable/axe'))
    leaves('fever_tree_leaves', 'fever_tree_sapling', 'Fever Tree Leaves')
    cross('fever_tree_sapling', display='Fever Tree Sapling', tags=('minecraft:saplings',))
    pillar('euphorbia', 'euphorbia', 'euphorbia_top', 'Candelabra Euphorbia', tags=('minecraft:mineable/axe',))
    cube('laterite', display='Laterite', tags=('minecraft:dirt', 'minecraft:mineable/shovel', 'minecraft:animals_spawnable_on',
                                                'minecraft:overworld_carver_replaceables'))
    cube('termite_mound', display='Termite Mound', tags=('minecraft:mineable/pickaxe', 'minecraft:overworld_carver_replaceables'))
    cube('kopje_granite', display='Kopje Granite', tags=('minecraft:mineable/pickaxe', 'minecraft:base_stone_overworld',
                                                          'minecraft:overworld_carver_replaceables', 'minecraft:goats_spawnable_on'))

    # ---------------- sahara
    cube_bottom_top('sahara_sand', 'sahara_sand', 'sahara_sand_side', 'sahara_sand_side', 'Sahara Sand',
                    tags=('minecraft:sand', 'minecraft:mineable/shovel', 'minecraft:smelts_to_glass', 'minecraft:rabbits_spawnable_on',
                          'minecraft:overworld_carver_replaceables'))
    # sand layers
    layer_variants = {}
    for layers in range(1, 8):
        h = layers * 2
        mname = 'sahara_sand_layer_height%d' % h
        write(os.path.join(ASSETS, 'models/block', mname + '.json'), {
            'parent': 'minecraft:block/thin_block',
            'textures': {'particle': b('sahara_sand_side'), 'top': b('sahara_sand'), 'side': b('sahara_sand_side')},
            'elements': [{'from': [0, 0, 0], 'to': [16, h, 16], 'faces': {
                'down': {'uv': [0, 0, 16, 16], 'texture': '#side', 'cullface': 'down'},
                'up': {'uv': [0, 0, 16, 16], 'texture': '#top'},
                'north': {'uv': [0, 16 - h, 16, 16], 'texture': '#side', 'cullface': 'north'},
                'south': {'uv': [0, 16 - h, 16, 16], 'texture': '#side', 'cullface': 'south'},
                'west': {'uv': [0, 16 - h, 16, 16], 'texture': '#side', 'cullface': 'west'},
                'east': {'uv': [0, 16 - h, 16, 16], 'texture': '#side', 'cullface': 'east'}}}]})
        layer_variants['layers=%d' % layers] = {'model': b(mname)}
    layer_variants['layers=8'] = {'model': b('sahara_sand')}
    blockstate('sahara_sand_layer', layer_variants)
    item_def('sahara_sand_layer', b('sahara_sand_layer_height2'))
    lang_block('sahara_sand_layer', 'Sahara Sand Layer')
    children = []
    for layers in range(1, 9):
        children.append({'type': 'minecraft:item', 'conditions': [
            {'block': rl('sahara_sand_layer'), 'condition': 'minecraft:block_state_property', 'properties': {'layers': str(layers)}}],
            'functions': [{'add': False, 'count': float(layers), 'function': 'minecraft:set_count'}], 'name': rl('sahara_sand_layer')})
    loot('sahara_sand_layer', [{'bonus_rolls': 0.0, 'conditions': [{'condition': 'minecraft:survives_explosion'}],
                                'entries': [{'type': 'minecraft:alternatives', 'children': children}], 'rolls': 1.0}])
    btag('sahara_sand_layer', 'minecraft:mineable/shovel')
    cube_bottom_top('sahara_sandstone', 'sahara_sandstone_top', 'sahara_sandstone', 'sahara_sandstone_bottom', 'Sahara Sandstone',
                    tags=('minecraft:mineable/pickaxe', 'minecraft:base_stone_overworld', 'minecraft:overworld_carver_replaceables'))
    cube('hamada_stone', display='Hamada Stone', tags=('minecraft:mineable/pickaxe', 'minecraft:base_stone_overworld',
                                                        'minecraft:overworld_carver_replaceables'))
    cube('desert_pavement', display='Desert Pavement', drop=False, tags=('minecraft:mineable/shovel', 'minecraft:overworld_carver_replaceables'))
    loot('desert_pavement', [{'bonus_rolls': 0.0, 'entries': [{'type': 'minecraft:alternatives', 'children': [
        {'type': 'minecraft:item', 'conditions': [{'condition': 'minecraft:match_tool', 'predicate': {'predicates': {'minecraft:enchantments': [
            {'enchantments': 'minecraft:silk_touch', 'levels': {'min': 1}}]}}}], 'name': rl('desert_pavement')},
        {'type': 'minecraft:alternatives', 'children': [
            {'type': 'minecraft:item', 'conditions': [{'chances': [0.1, 0.14285715, 0.25, 1.0], 'condition': 'minecraft:table_bonus',
                                                        'enchantment': 'minecraft:fortune'}], 'name': 'minecraft:flint'},
            {'type': 'minecraft:item', 'name': rl('desert_pavement')}], 'conditions': [{'condition': 'minecraft:survives_explosion'}]}]}],
        'rolls': 1.0}])
    cube('salt_crust', display='Salt Crust', tags=('minecraft:mineable/pickaxe', 'minecraft:mineable/shovel', 'minecraft:overworld_carver_replaceables'))
    wood_set('date_palm', 'Date Palm', leaves_display='Date Palm Fronds')
    for age in range(3):
        model('dates_stage%d' % age, 'minecraft:block/cross', {'cross': b('dates_stage%d' % age)})
    blockstate('dates', {'age=%d' % a: {'model': b('dates_stage%d' % a)} for a in range(3)})
    lang_block('dates', 'Date Bunch')
    loot('dates', [{'bonus_rolls': 0.0, 'conditions': [
        {'block': rl('dates'), 'condition': 'minecraft:block_state_property', 'properties': {'age': '2'}}],
        'entries': [{'type': 'minecraft:item', 'functions': [{'add': False, 'count': {'type': 'minecraft:uniform', 'min': 1.0, 'max': 3.0},
                                                               'function': 'minecraft:set_count'}], 'name': rl('date')}], 'rolls': 1.0}])
    cross('drinn_grass', display='Drinn Grass', loot_kind='shears', tags=('minecraft:replaceable_by_trees', 'minecraft:replaceable'))
    item_generated('date', '%s:item/date' % NS)
    lang_item('date', 'Date')

    # ---------------- amazon
    wood_set('kapok', 'Kapok')
    leaves('rainforest_leaves', 'minecraft:jungle_sapling', 'Rainforest Leaves')
    pillar('cecropia_log', 'cecropia_log', 'cecropia_log_top', 'Cecropia Log', tags=('minecraft:logs_that_burn', 'minecraft:mineable/axe'))
    leaves('cecropia_leaves', None, 'Cecropia Leaves')
    pillar('acai_palm_log', 'acai_palm_log', 'acai_palm_log_top', 'Acai Palm Log', tags=('minecraft:logs_that_burn', 'minecraft:mineable/axe'))
    leaves('acai_palm_leaves', None, 'Acai Palm Fronds')
    leaves('buriti_palm_leaves', None, 'Buriti Palm Fronds')
    tall('heliconia', 'Heliconia', shears_only=False, tags=('minecraft:replaceable_by_trees',))
    tall('giant_taro', 'Giant Taro', shears_only=False, tags=('minecraft:replaceable_by_trees',))
    cross('bromeliad', display='Bromeliad', tags=('minecraft:replaceable_by_trees',))
    model('liana', 'minecraft:block/cross', {'cross': b('liana')})
    model('liana_tip', 'minecraft:block/cross', {'cross': b('liana_tip')})
    blockstate('liana', {'tip=false': {'model': b('liana')}, 'tip=true': {'model': b('liana_tip')}})
    item_generated('liana', b('liana_tip'))
    lang_block('liana', 'Liana')
    loot_grass('liana', seeds=False)
    btag('liana', 'minecraft:climbable', 'minecraft:replaceable_by_trees', 'minecraft:mineable/axe')
    pad_variants = {}
    for part in range(9):
        mname = 'victoria_lily_pad_%d' % part
        write(os.path.join(ASSETS, 'models/block', mname + '.json'), {
            'ambientocclusion': False,
            'textures': {'particle': b('victoria_lily_pad_4'), 'pad': b(mname)},
            'elements': [{'from': [0, 0.25, 0], 'to': [16, 0.25, 16],
                          'faces': {'up': {'uv': [0, 0, 16, 16], 'texture': '#pad'}, 'down': {'uv': [0, 16, 16, 0], 'texture': '#pad'}}}]})
        pad_variants['part=%d' % part] = {'model': b(mname)}
    blockstate('victoria_lily_pad', pad_variants)
    write(os.path.join(ASSETS, 'models/item', 'victoria_lily_pad.json'),
          {'parent': 'minecraft:item/generated', 'textures': {'layer0': '%s:item/victoria_lily_pad' % NS}})
    item_def('victoria_lily_pad', '%s:item/victoria_lily_pad' % NS)
    lang_block('victoria_lily_pad', 'Giant Water Lily Pad')
    loot('victoria_lily_pad', [{'bonus_rolls': 0.0, 'conditions': [
        {'block': rl('victoria_lily_pad'), 'condition': 'minecraft:block_state_property', 'properties': {'part': '4'}}],
        'entries': [{'type': 'minecraft:item', 'name': rl('victoria_lily_pad')}], 'rolls': 1.0}])

    # ---------------- steppe
    tall('feather_grass', 'Feather Grass', tags=('minecraft:replaceable_by_trees', 'minecraft:replaceable'))
    tall('tall_steppe_grass', 'Tall Steppe Grass', tags=('minecraft:replaceable_by_trees', 'minecraft:replaceable'))
    cross('steppe_grass', display='Steppe Grass', loot_kind='grass', tags=('minecraft:replaceable_by_trees', 'minecraft:replaceable'))
    cross('edelweiss', display='Edelweiss', tags=('minecraft:small_flowers', 'minecraft:flowers'))
    cross('pasque_flower', display='Pasque Flower', tags=('minecraft:small_flowers', 'minecraft:flowers'))
    wood_set('larch', 'Larch')

    # ---------------- other recipes
    shaped('sahara_sandstone', ['##', '##'], {'#': rl('sahara_sand')}, 'sahara_sandstone', 1)
    shaped('sahara_sand_layer', ['###'], {'#': rl('sahara_sand')}, 'sahara_sand_layer', 6)
    shapeless('sahara_sand_from_layers', [rl('sahara_sand_layer')] * 4, 'sahara_sand', 1)
    shapeless('acacia_planks_from_fever_tree', [rl('fever_tree_log')], 'minecraft:acacia_planks', 4, group='planks')
    shapeless('acacia_planks_from_fever_tree_wood', [rl('fever_tree_wood')], 'minecraft:acacia_planks', 4, group='planks')
    shaped('fever_tree_wood', ['##', '##'], {'#': rl('fever_tree_log')}, 'fever_tree_wood', 3, group='bark')
    shapeless('birch_planks_from_cecropia', [rl('cecropia_log')], 'minecraft:birch_planks', 4, group='planks')
    shapeless('jungle_planks_from_acai', [rl('acai_palm_log')], 'minecraft:jungle_planks', 4, group='planks')
    smelting('brick_from_laterite', rl('laterite'), 'minecraft:brick', 0.3)
    smelting('terracotta_from_termite_mound', rl('termite_mound'), 'minecraft:terracotta', 0.35)
    smelting('glass_from_sahara_sand', rl('sahara_sand'), 'minecraft:glass', 0.1)
    recipe('polished_granite_from_kopje_granite_stonecutting', {'type': 'minecraft:stonecutting', 'ingredient': rl('kopje_granite'),
                                                                'result': {'count': 1, 'id': 'minecraft:polished_granite'}})
    shapeless('green_dye_from_euphorbia', [rl('euphorbia')], 'minecraft:green_dye', 1, category='misc')
    shapeless('white_dye_from_edelweiss', [rl('edelweiss')], 'minecraft:white_dye', 1, category='misc')
    shapeless('purple_dye_from_pasque_flower', [rl('pasque_flower')], 'minecraft:purple_dye', 1, category='misc')
    shapeless('red_dye_from_heliconia', [rl('heliconia')], 'minecraft:red_dye', 2, category='misc')
    shapeless('red_dye_from_bromeliad', [rl('bromeliad')], 'minecraft:red_dye', 1, category='misc')

    # ---------------- custom tags
    tag('block', NS + ':grass_soil', '#minecraft:dirt')
    tag('block', NS + ':desert_soil', '#minecraft:sand', '#minecraft:dirt', '#minecraft:terracotta', rl('desert_pavement'), 'minecraft:gravel')
    tag('block', NS + ':epiphyte_support', '#minecraft:logs', '#minecraft:leaves', '#minecraft:dirt', '#minecraft:base_stone_overworld')
    tag('block', NS + ':tree_soil', rl('desert_pavement'), rl('kopje_granite'), 'minecraft:gravel', 'minecraft:clay', 'minecraft:stone',
        'minecraft:granite', 'minecraft:andesite', rl('salt_crust'))
    tag('block', 'minecraft:replaceable_by_trees', rl('liana'))

    # victoria pad item sprite: centre of the pad
    from PIL import Image
    tex = os.path.join(ASSETS, 'textures')
    full = Image.new('RGBA', (48, 48))
    for part in range(9):
        im = Image.open(os.path.join(tex, 'block', 'victoria_lily_pad_%d.png' % part))
        full.paste(im, ((part % 3) * 16, (part // 3) * 16))
    full.resize((16, 16), Image.LANCZOS).save(os.path.join(tex, 'item', 'victoria_lily_pad.png'))

    write_tags()
    write_lang()
    print('generated %d files' % len(written))


def write_tags():
    for (registry, ns, path), values in TAGS.items():
        folder = {'block': 'tags/block', 'item': 'tags/item'}[registry]
        base = os.path.join(RES, 'data', ns, folder, path + '.json')
        write(base, {'replace': False, 'values': values})


def write_lang():
    LANG.update({
        'itemGroup.earthscapes': 'Earthscapes',
        'generator.earthscapes.african_savanna': 'African Savanna',
        'generator.earthscapes.sahara_desert': 'Sahara Desert',
        'generator.earthscapes.amazon_rainforest': 'Amazon Rainforest',
        'generator.earthscapes.mongolian_steppe': 'Mongolian Steppe',
    })
    extra = os.path.join(os.path.dirname(__file__), 'lang_extra.json')
    if os.path.exists(extra):
        with open(extra) as f:
            LANG.update(json.load(f))
    write(os.path.join(ASSETS, 'lang', 'en_us.json'), dict(sorted(LANG.items())))


if __name__ == '__main__':
    main()
