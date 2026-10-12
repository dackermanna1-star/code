#!/usr/bin/env python3
"""
Generates the boilerplate JSON (item model definitions, simple item models, particle definitions) for
Chaos Unleashed. Hand-written JSON (block models, blockstates, recipes, lang...) lives directly in
src/main/resources and is not touched by this script.
"""
import json
import os

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'src', 'main', 'resources')
ASSETS = os.path.join(ROOT, 'assets', 'chaosunleashed')
NS = 'chaosunleashed'


def write(path, data):
    full = os.path.join(ASSETS, path)
    os.makedirs(os.path.dirname(full), exist_ok=True)
    with open(full, 'w') as fh:
        json.dump(data, fh, indent=2)
        fh.write('\n')


GENERATED_ITEMS = [
    'alien_alloy', 'kaiju_scale', 'kaiju_heart', 'stabilizer_core', 'rift_shard', 'plasma_bolt',
    'anti_gravity_boots', 'kaiju_scale_helmet', 'kaiju_scale_chestplate', 'kaiju_scale_leggings', 'kaiju_scale_boots',
    'alien_soldier_spawn_egg', 'bison_spawn_egg', 'shade_stalker_spawn_egg',
]
HANDHELD_ITEMS = ['plasma_pistol']

PARTICLES = {
    'ember': 4, 'blood_mist': 4, 'rift_spark': 4, 'void_swirl': 4, 'plasma': 4,
    'shadow_wisp': 4, 'gravity_mote': 4, 'beam_spark': 4, 'dust_cloud': 4,
}

for name in GENERATED_ITEMS + HANDHELD_ITEMS:
    write('items/%s.json' % name, {'model': {'type': 'minecraft:model', 'model': '%s:item/%s' % (NS, name)}})
    write('models/item/%s.json' % name, {
        'parent': 'minecraft:item/handheld' if name in HANDHELD_ITEMS else 'minecraft:item/generated',
        'textures': {'layer0': '%s:item/%s' % (NS, name)},
    })

# Block item
write('items/chaos_control_panel.json', {'model': {'type': 'minecraft:model', 'model': '%s:block/chaos_control_panel_idle' % NS}})

for name, frames in PARTICLES.items():
    write('particles/%s.json' % name, {'textures': ['%s:%s_%d' % (NS, name, i) for i in range(frames)]})

print('JSON assets written')
