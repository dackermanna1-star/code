"""Generates data-pack and asset JSON for Godforge: damage types, tags, recipes, recipe advancements,
particle definitions and the fissure block model.

Run from the repository root:  python3 tools/gen_data.py
"""
import json
import os

RES = os.path.join(os.path.dirname(__file__), '..', 'src', 'main', 'resources')
DATA = os.path.join(RES, 'data')
ASSETS = os.path.join(RES, 'assets', 'godforge')

WEAPONS = ['worldcutter', 'laser_beam', 'orb_eraser', 'asteroid_gun', 'black_hole', 'reality_breaker', 'starfall_bow', 'godfist', 'sunforge', 'planet_cracker']


def write(path, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w') as f:
        json.dump(data, f, indent=2)


def damage_types():
    for w in WEAPONS:
        write(os.path.join(DATA, 'godforge', 'damage_type', w + '.json'), {
            'message_id': 'godforge.' + w,
            'exhaustion': 0.1,
            'scaling': 'when_caused_by_living_non_player',
        })
    tags = {
        'bypasses_armor': ['orb_eraser', 'black_hole', 'reality_breaker'],
        'is_explosion': ['asteroid_gun', 'planet_cracker', 'starfall_bow'],
        'is_fire': ['sunforge', 'laser_beam'],
        'always_hurts_ender_dragons': WEAPONS,
    }
    for tag, members in tags.items():
        write(os.path.join(DATA, 'minecraft', 'tags', 'damage_type', tag + '.json'),
              {'replace': False, 'values': ['godforge:' + m for m in members]})


def tags():
    write(os.path.join(DATA, 'godforge', 'tags', 'block', 'indestructible.json'), {
        'replace': False,
        'values': ['#minecraft:wither_immune', 'minecraft:end_portal_frame', 'minecraft:spawner', 'minecraft:trial_spawner', 'minecraft:vault'],
    })
    write(os.path.join(DATA, 'minecraft', 'tags', 'item', 'swords.json'), {'replace': False, 'values': ['godforge:worldcutter']})


RECIPES = {
    'divine_core': (['EDE', 'NSN', 'EDE'], {'E': 'minecraft:echo_shard', 'D': 'minecraft:diamond_block', 'N': 'minecraft:netherite_ingot', 'S': 'minecraft:nether_star'}, 'misc'),
    'worldcutter': ([' E ', 'XSX', ' C '], {'E': 'minecraft:echo_shard', 'X': 'minecraft:end_crystal', 'S': 'minecraft:netherite_sword', 'C': 'godforge:divine_core'}, 'equipment'),
    'laser_beam': (['RTR', 'LCL', ' N '], {'R': 'minecraft:redstone_block', 'T': 'minecraft:tinted_glass', 'L': 'minecraft:lightning_rod', 'C': 'godforge:divine_core', 'N': 'minecraft:netherite_ingot'}, 'equipment'),
    'orb_eraser': (['PAP', 'ACA', ' B '], {'P': 'minecraft:prismarine_crystals', 'A': 'minecraft:amethyst_block', 'C': 'godforge:divine_core', 'B': 'minecraft:end_rod'}, 'equipment'),
    'asteroid_gun': (['MOM', 'FCF', ' N '], {'M': 'minecraft:magma_block', 'O': 'minecraft:obsidian', 'F': 'minecraft:fire_charge', 'C': 'godforge:divine_core', 'N': 'minecraft:netherite_ingot'}, 'equipment'),
    'black_hole': (['YEY', 'ECE', ' H '], {'Y': 'minecraft:crying_obsidian', 'E': 'minecraft:ender_eye', 'C': 'godforge:divine_core', 'H': 'minecraft:heavy_core'}, 'equipment'),
    'reality_breaker': (['SAS', 'ECE', ' M '], {'S': 'minecraft:echo_shard', 'A': 'minecraft:amethyst_block', 'E': 'minecraft:ender_pearl', 'C': 'godforge:divine_core', 'M': 'minecraft:mace'}, 'equipment'),
    'starfall_bow': (['FGF', 'GCG', 'FBF'], {'F': 'minecraft:firework_star', 'G': 'minecraft:glowstone', 'C': 'godforge:divine_core', 'B': 'minecraft:bow'}, 'equipment'),
    'godfist': (['GNG', 'NCN', 'GPG'], {'G': 'minecraft:gold_block', 'N': 'minecraft:netherite_ingot', 'C': 'godforge:divine_core', 'P': 'minecraft:piston'}, 'equipment'),
    'sunforge': (['GBG', 'LCL', ' R '], {'G': 'minecraft:gold_block', 'B': 'minecraft:beacon', 'L': 'minecraft:magma_cream', 'C': 'godforge:divine_core', 'R': 'minecraft:blaze_rod'}, 'equipment'),
    'planet_cracker': (['ITI', 'OCO', 'NDN'], {'I': 'minecraft:iron_block', 'T': 'minecraft:tnt', 'O': 'minecraft:obsidian', 'C': 'godforge:divine_core', 'N': 'minecraft:netherite_ingot', 'D': 'minecraft:dispenser'}, 'equipment'),
}


def recipes():
    for name, (pattern, key, category) in RECIPES.items():
        write(os.path.join(DATA, 'godforge', 'recipe', name + '.json'), {
            'type': 'minecraft:crafting_shaped',
            'category': category,
            'key': key,
            'pattern': pattern,
            'result': {'count': 1, 'id': 'godforge:' + name},
        })
        unlock_item = 'minecraft:nether_star' if name == 'divine_core' else 'godforge:divine_core'
        write(os.path.join(DATA, 'godforge', 'advancement', 'recipes', 'combat', name + '.json'), {
            'parent': 'minecraft:recipes/root',
            'criteria': {
                'has_ingredient': {'conditions': {'items': [{'items': unlock_item}]}, 'trigger': 'minecraft:inventory_changed'},
                'has_the_recipe': {'conditions': {'recipe': 'godforge:' + name}, 'trigger': 'minecraft:recipe_unlocked'},
            },
            'requirements': [['has_the_recipe', 'has_ingredient']],
            'rewards': {'recipes': ['godforge:' + name]},
        })


def particles():
    defs = {
        'glow': ['glow'],
        'star': ['star_0', 'star_1'],
        'ring': ['ring'],
        'shard': ['shard_%d' % i for i in range(4)],
        'spark': ['spark'],
        'smoke': ['smoke_%d' % i for i in range(8)],
        'plasma': ['plasma_%d' % i for i in range(4)],
    }
    for name, textures in defs.items():
        write(os.path.join(ASSETS, 'particles', name + '.json'), {'textures': ['godforge:' + t for t in textures]})


def blocks():
    write(os.path.join(ASSETS, 'blockstates', 'kinetic_fracture.json'), {'variants': {'': {'model': 'godforge:block/kinetic_fracture'}}})
    write(os.path.join(ASSETS, 'models', 'block', 'kinetic_fracture.json'), {'parent': 'minecraft:block/cube_all', 'textures': {'all': 'godforge:block/kinetic_fracture'}})


def main():
    damage_types()
    tags()
    recipes()
    particles()
    blocks()
    print('data written')


if __name__ == '__main__':
    main()
