#!/usr/bin/env python3
"""Generates the animals: entity textures (painted in 3D on the models), spawn egg textures, the
Java model layer definitions, and a preview sheet (build/mob_sheet.png).

    python3 tools/gen_mobs.py
"""
import json
import os
import sys

import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from mobs import shapes, species  # noqa: E402
from mobs.paint import paint, save  # noqa: E402
from mobs.preview import render, sheet  # noqa: E402
from mobs.eggs import egg  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TEX = os.path.join(ROOT, 'src/main/resources/assets/earthscapes/textures/entity')
EGG = os.path.join(ROOT, 'src/main/resources/assets/earthscapes/textures/item')
JAVA = os.path.join(ROOT, 'src/client/java/net/earthscapes/client/model/EsMobLayers.java')

# model -> list of (texture name, shader factory)
TEXTURES = {
    'elephant': [('elephant', species.elephant)],
    'giraffe': [('giraffe', species.giraffe)],
    'zebra': [('zebra', species.zebra)],
    'wildebeest': [('wildebeest', species.wildebeest)],
    'gazelle': [(v, lambda ctx, v=v: species.gazelle(ctx, v)) for v in species.GAZELLES],
    'hippo': [('hippo', species.hippo)],
    'lion': [('lion', species.lion)],
    'ostrich': [('ostrich', species.ostrich), ('ostrich_female', lambda ctx: species.ostrich(ctx, True))],
    'nile_crocodile': [('nile_crocodile', lambda ctx: species.crocodilian(ctx, '#58583A', '#34341F', '#8E8C58', '#D8D0A8', '#B8B040'))],
    'fennec': [('fennec', species.fennec)],
    'addax': [('addax', species.addax)],
    'jaguar': [('jaguar', species.jaguar)],
    'capybara': [('capybara', species.capybara)],
    'tapir': [('tapir', species.tapir), ('tapir_baby', lambda ctx: species.tapir(ctx, True))],
    'toucan': [('toucan', species.toucan)],
    'river_dolphin': [('river_dolphin', species.river_dolphin)],
    'black_caiman': [('black_caiman', lambda ctx: species.crocodilian(ctx, '#1E1E1C', '#3C3C34', '#2A2A26', '#C8C0A0', '#8A6A3A'))],
    'yak': [('yak', species.yak)],
    'saiga': [('saiga', species.saiga)],
    'snow_leopard': [('snow_leopard', species.snow_leopard)],
    'marmot': [('marmot', species.marmot)],
    'przewalski_horse': [('przewalski_horse', species.przewalski_horse)],
    'bactrian_camel': [('bactrian_camel', species.bactrian_camel)],
}

# spawn eggs: entity id -> (texture used for colours, pattern)
EGGS = {
    'elephant': ('#7C716B', '#5E5550', 'wrinkles'), 'giraffe': ('#E9DAB4', '#9A5424', 'patches'), 'zebra': ('#EEEAE0', '#1A1716', 'stripes'),
    'wildebeest': ('#5D6470', '#25282C', 'bands'), 'thomsons_gazelle': ('#B4783E', '#2A1E18', 'band'), 'hippo': ('#6A5A60', '#C48A82', 'belly'),
    'lion': ('#C6965A', '#4A2E18', 'mane'), 'ostrich': ('#1E1C1C', '#F2F0EA', 'tips'), 'nile_crocodile': ('#58583A', '#D8D0A8', 'scutes'),
    'fennec': ('#E2C896', '#2A221C', 'tip'), 'addax': ('#ECE4D2', '#4A3424', 'cap'), 'jaguar': ('#D29A3C', '#1C1610', 'rosettes'),
    'capybara': ('#8C5E3C', '#5E3C26', 'plain'), 'tapir': ('#4A403A', '#E6E0D6', 'tip'), 'toucan': ('#141414', '#F49A24', 'bill'),
    'river_dolphin': ('#E8A0A8', '#8E8288', 'back'), 'black_caiman': ('#1E1E1C', '#C8C0A0', 'scutes'), 'yak': ('#2A221C', '#B8B0A8', 'muzzle'),
    'saiga': ('#C49A62', '#EEE6D8', 'belly'), 'snow_leopard': ('#C8C2B4', '#4A4844', 'rosettes'), 'marmot': ('#A88858', '#54402C', 'cap'),
    'przewalski_horse': ('#B8925E', '#2A2018', 'stripe'), 'bactrian_camel': ('#8C6A44', '#4E3826', 'humps'),
    'dorcas_gazelle': ('#C9A26C', '#9A7444', 'band'), 'mongolian_gazelle': ('#C2AE86', '#EEE8DC', 'belly'),
}

NAMES = {
    'elephant': 'African Elephant', 'giraffe': 'Giraffe', 'zebra': 'Plains Zebra', 'wildebeest': 'Blue Wildebeest',
    'thomsons_gazelle': "Thomson's Gazelle", 'hippo': 'Hippopotamus', 'lion': 'Lion', 'ostrich': 'Ostrich', 'nile_crocodile': 'Nile Crocodile',
    'fennec': 'Fennec Fox', 'addax': 'Addax', 'dorcas_gazelle': 'Dorcas Gazelle',
    'jaguar': 'Jaguar', 'capybara': 'Capybara', 'tapir': 'South American Tapir', 'toucan': 'Toco Toucan', 'river_dolphin': 'Amazon River Dolphin',
    'black_caiman': 'Black Caiman',
    'yak': 'Wild Yak', 'saiga': 'Saiga', 'mongolian_gazelle': 'Mongolian Gazelle', 'snow_leopard': 'Snow Leopard', 'marmot': 'Tarbagan Marmot',
    'przewalski_horse': "Przewalski's Horse", 'bactrian_camel': 'Bactrian Camel',
}


def drop(item, lo, hi, smelt=None, looting=True):
    funcs = [{'function': 'minecraft:set_count', 'count': {'type': 'minecraft:uniform', 'min': float(lo), 'max': float(hi)}, 'add': False}]
    if smelt:
        funcs.append({'function': 'minecraft:furnace_smelt', 'conditions': [{'condition': 'minecraft:entity_properties', 'entity': 'this',
                                                                             'predicate': {'flags': {'is_on_fire': True}}}]})
    if looting:
        funcs.append({'function': 'minecraft:enchanted_count_increase', 'enchantment': 'minecraft:looting', 'count': {
            'type': 'minecraft:uniform', 'min': 0.0, 'max': 1.0}})
    return {'rolls': 1.0, 'bonus_rolls': 0.0, 'entries': [{'type': 'minecraft:item', 'name': item, 'functions': funcs}]}


LOOT = {
    'elephant': [drop('minecraft:leather', 2, 5)],
    'giraffe': [drop('minecraft:leather', 1, 3)],
    'zebra': [drop('minecraft:leather', 0, 2)],
    'wildebeest': [drop('minecraft:leather', 0, 2), drop('minecraft:beef', 1, 3, smelt=True)],
    'thomsons_gazelle': [drop('minecraft:leather', 0, 1), drop('minecraft:mutton', 1, 2, smelt=True)],
    'dorcas_gazelle': [drop('minecraft:leather', 0, 1), drop('minecraft:mutton', 1, 2, smelt=True)],
    'mongolian_gazelle': [drop('minecraft:leather', 0, 1), drop('minecraft:mutton', 1, 2, smelt=True)],
    'hippo': [drop('minecraft:leather', 2, 4), drop('minecraft:beef', 2, 4, smelt=True)],
    'ostrich': [drop('minecraft:feather', 2, 5), drop('minecraft:chicken', 1, 2, smelt=True)],
    'nile_crocodile': [drop('minecraft:leather', 1, 3)],
    'black_caiman': [drop('minecraft:leather', 1, 3)],
    'addax': [drop('minecraft:leather', 0, 2), drop('minecraft:mutton', 1, 2, smelt=True)],
    'capybara': [drop('minecraft:leather', 0, 2), drop('minecraft:porkchop', 1, 2, smelt=True)],
    'tapir': [drop('minecraft:leather', 0, 2), drop('minecraft:porkchop', 1, 3, smelt=True)],
    'toucan': [drop('minecraft:feather', 1, 2)],
    'yak': [drop('minecraft:leather', 0, 2), drop('minecraft:beef', 1, 3, smelt=True), drop('minecraft:brown_wool', 0, 2)],
    'saiga': [drop('minecraft:leather', 0, 1), drop('minecraft:mutton', 1, 2, smelt=True)],
    'marmot': [drop('minecraft:rabbit_hide', 0, 1), drop('minecraft:rabbit', 0, 1, smelt=True)],
    'przewalski_horse': [drop('minecraft:leather', 0, 2)],
    # predators, the fennec, dolphins and camels drop nothing
    'lion': [], 'jaguar': [], 'snow_leopard': [], 'fennec': [], 'river_dolphin': [], 'bactrian_camel': [],
}

ITEM_TAGS = {
    'grazer_food': ['minecraft:wheat'],
    'browser_food': ['minecraft:apple', 'minecraft:acacia_leaves', 'earthscapes:umbrella_thorn_leaves', 'earthscapes:fever_tree_leaves'],
    'elephant_food': ['minecraft:wheat', 'minecraft:apple', 'minecraft:melon_slice', 'minecraft:sugar_cane', 'minecraft:hay_block',
                      'earthscapes:umbrella_thorn_leaves', 'earthscapes:date'],
    'meat': ['minecraft:beef', 'minecraft:mutton', 'minecraft:porkchop', 'minecraft:chicken', 'minecraft:rabbit'],
    'crocodile_food': ['minecraft:cod', 'minecraft:salmon', 'minecraft:beef', 'minecraft:chicken'],
    'capybara_food': ['minecraft:sugar_cane', 'minecraft:melon_slice', 'minecraft:wheat'],
    'fruit': ['minecraft:apple', 'minecraft:melon_slice', 'minecraft:sweet_berries', 'minecraft:glow_berries', 'earthscapes:date'],
    'marmot_food': ['minecraft:carrot', 'minecraft:wheat', 'minecraft:dandelion'],
    'seeds': ['minecraft:wheat_seeds', 'minecraft:melon_seeds', 'minecraft:pumpkin_seeds', 'minecraft:beetroot_seeds'],
}

ENTITY_TAGS = {
    'predators': ['earthscapes:lion', 'earthscapes:jaguar', 'earthscapes:snow_leopard', 'earthscapes:nile_crocodile', 'earthscapes:black_caiman',
                  'minecraft:wolf'],
    'lion_prey': ['earthscapes:zebra', 'earthscapes:wildebeest', 'earthscapes:thomsons_gazelle', 'earthscapes:ostrich'],
    'jaguar_prey': ['earthscapes:capybara', 'earthscapes:tapir', 'earthscapes:black_caiman'],
    'snow_leopard_prey': ['earthscapes:marmot', 'earthscapes:saiga', 'earthscapes:mongolian_gazelle', 'minecraft:goat'],
    'crocodile_prey': ['earthscapes:zebra', 'earthscapes:wildebeest', 'earthscapes:thomsons_gazelle', 'earthscapes:capybara'],
}

BLOCK_TAGS = {
    ('earthscapes', 'animals_spawnable_on'): ['#minecraft:animals_spawnable_on', '#minecraft:sand', 'minecraft:gravel', 'minecraft:coarse_dirt',
                                              'minecraft:rooted_dirt', 'minecraft:podzol', 'minecraft:mud', 'minecraft:snow_block', 'minecraft:snow',
                                              'minecraft:stone', 'minecraft:andesite', 'minecraft:granite', 'minecraft:moss_block',
                                              'earthscapes:sahara_sand_layer', 'earthscapes:desert_pavement', 'earthscapes:laterite',
                                              'earthscapes:hamada_stone', 'earthscapes:sahara_sandstone', 'earthscapes:kopje_granite'],
    # wild dromedaries and desert hares on the drifts of the Sahara
    ('minecraft', 'camels_spawnable_on'): ['earthscapes:sahara_sand', 'earthscapes:sahara_sand_layer', 'earthscapes:desert_pavement'],
    ('minecraft', 'rabbits_spawnable_on'): ['earthscapes:sahara_sand_layer'],
}


# baby layers of the vanilla-derived models, as the vanilla code builds them
BABY_LAYERS = {
    'zebra': 'new BabyModelTransform(true, 16.2F, 1.36F, 2.7272F, 2.0F, 20.0F, Set.of("head_parts"))',
    'przewalski_horse': 'new BabyModelTransform(true, 16.2F, 1.36F, 2.7272F, 2.0F, 20.0F, Set.of("head_parts"))',
    'fennec': 'FoxModel.BABY_TRANSFORMER',
    'bactrian_camel': 'CamelModel.BABY_TRANSFORMER',
    'river_dolphin': 'DolphinModel.BABY_TRANSFORMER',
}


def build(name):
    m = shapes.SHAPES[name]()
    m.pack()
    return m, m.quads()


def main():
    os.makedirs(TEX, exist_ok=True)
    os.makedirs(EGG, exist_ok=True)
    previews = []
    layers = []
    for name in shapes.SHAPES:
        m, quads = build(name)
        ctx = species.Ctx(m, quads)
        for tex_name, factory in TEXTURES[name]:
            img = paint(quads, m.tex_w, m.tex_h, factory(ctx))
            save(img, os.path.join(TEX, tex_name + '.png'))
            previews.append(render(quads, img, m.tex_w, m.tex_h, size=300, label=tex_name))
            if tex_name == TEXTURES[name][0][0]:
                previews.append(render(quads, img, m.tex_w, m.tex_h, size=300, yaw=-60, pitch=10, label=tex_name + ' (other side)'))
        layers.append((name, m))
    for eid, (base, accent, pattern) in EGGS.items():
        egg(base, accent, pattern, eid).save(os.path.join(EGG, eid + '_spawn_egg.png'))
    sheet(previews, cols=6).save(os.path.join(ROOT, 'build/mob_sheet.png'))
    write_java(layers)
    write_data()
    print('generated %d models, %d textures, %d spawn eggs' % (len(layers), sum(len(v) for v in TEXTURES.values()), len(EGGS)))


def write_json(path, obj):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w') as f:
        json.dump(obj, f, indent=2, ensure_ascii=False)
        f.write('\n')


def write_data():
    res = os.path.join(ROOT, 'src/main/resources')
    assets = os.path.join(res, 'assets/earthscapes')
    data = os.path.join(res, 'data')
    lang_path = os.path.join(assets, 'lang/en_us.json')
    with open(lang_path) as f:
        lang = json.load(f)
    for eid, name in NAMES.items():
        egg_id = eid + '_spawn_egg'
        write_json(os.path.join(assets, 'items', egg_id + '.json'),
                   {'model': {'type': 'minecraft:model', 'model': 'earthscapes:item/' + egg_id}})
        write_json(os.path.join(assets, 'models/item', egg_id + '.json'),
                   {'parent': 'minecraft:item/generated', 'textures': {'layer0': 'earthscapes:item/' + egg_id}})
        lang['entity.earthscapes.' + eid] = name
        lang['item.earthscapes.' + egg_id] = name + ' Spawn Egg'
        write_json(os.path.join(data, 'earthscapes/loot_table/entities', eid + '.json'),
                   {'type': 'minecraft:entity', 'pools': LOOT[eid], 'random_sequence': 'earthscapes:entities/' + eid})
    with open(lang_path, 'w') as f:
        json.dump(dict(sorted(lang.items())), f, indent=2, ensure_ascii=False)
        f.write('\n')
    for name, values in ITEM_TAGS.items():
        write_json(os.path.join(data, 'earthscapes/tags/item', name + '.json'), {'replace': False, 'values': values})
    for name, values in ENTITY_TAGS.items():
        write_json(os.path.join(data, 'earthscapes/tags/entity_type', name + '.json'), {'replace': False, 'values': values})
    for (ns, name), values in BLOCK_TAGS.items():
        path = os.path.join(data, ns, 'tags/block', name + '.json')
        merged = list(values)
        if os.path.exists(path):
            with open(path) as f:
                merged = list(dict.fromkeys(json.load(f).get('values', []) + values))
        write_json(path, {'replace': False, 'values': merged})


def write_java(layers):
    out = ['package net.earthscapes.client.model;', '',
           'import java.util.Set;',
           'import net.earthscapes.Earthscapes;',
           'import net.fabricmc.fabric.api.client.rendering.v1.EntityModelLayerRegistry;',
           'import net.minecraft.client.model.BabyModelTransform;',
           'import net.minecraft.client.model.animal.camel.CamelModel;',
           'import net.minecraft.client.model.animal.dolphin.DolphinModel;',
           'import net.minecraft.client.model.animal.fox.FoxModel;',
           'import net.minecraft.client.model.geom.ModelLayerLocation;',
           'import net.minecraft.client.model.geom.PartPose;',
           'import net.minecraft.client.model.geom.builders.CubeDeformation;',
           'import net.minecraft.client.model.geom.builders.CubeListBuilder;',
           'import net.minecraft.client.model.geom.builders.LayerDefinition;',
           'import net.minecraft.client.model.geom.builders.MeshDefinition;',
           'import net.minecraft.client.model.geom.builders.PartDefinition;', '',
           '/** Model layers of the animals. Generated by tools/gen_mobs.py - do not edit. */',
           '@SuppressWarnings("unused")',
           'public final class EsMobLayers {']
    for name, _ in layers:
        out.append('\tpublic static final ModelLayerLocation %s = new ModelLayerLocation(Earthscapes.id("%s"), "main");' % (name.upper(), name))
        if name in BABY_LAYERS:
            out.append('\tpublic static final ModelLayerLocation %s_BABY = new ModelLayerLocation(Earthscapes.id("%s_baby"), "main");' % (name.upper(), name))
    out += ['', '\tprivate EsMobLayers() {', '\t}', '',
            '\tpublic static void register() {']
    for name, _ in layers:
        out.append('\t\tEntityModelLayerRegistry.registerModelLayer(%s, EsMobLayers::%s);' % (name.upper(), camel(name)))
        if name in BABY_LAYERS:
            out.append('\t\tEntityModelLayerRegistry.registerModelLayer(%s_BABY, () -> %s().apply(%s));' % (name.upper(), camel(name), BABY_LAYERS[name]))
    out += ['\t}', '']
    for name, m in layers:
        out.append(m.java(camel(name)))
        out.append('')
    out[-1] = '}'
    os.makedirs(os.path.dirname(JAVA), exist_ok=True)
    with open(JAVA, 'w') as f:
        f.write('\n'.join(out) + '\n')


def camel(name):
    parts = name.split('_')
    return parts[0] + ''.join(p.title() for p in parts[1:])


if __name__ == '__main__':
    main()
