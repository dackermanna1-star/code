#!/usr/bin/env python3
"""Generates the Earthscapes world presets and all their worldgen data.

Usage (from the repository root):
    python3 tools/gen_worldgen.py <path to extracted vanilla data/minecraft>

Writes data/earthscapes/worldgen/**, biome tags and the world preset tag into src/main/resources,
adds biome names to the language file, and checks that every referenced placed feature exists and
that feature ordering is consistent across each world's biomes (Minecraft refuses to load
otherwise).
"""
import json
import os
import shutil
import sys

sys.path.insert(0, os.path.dirname(__file__))
from wg import amazon, sahara, savanna, steppe  # noqa: E402
from wg.registry import Registry  # noqa: E402

ROOT = os.path.join(os.path.dirname(__file__), '..')
RES = os.path.join(ROOT, 'src/main/resources')
WORLDS = [savanna, sahara, amazon, steppe]


def title(name):
    return ' '.join(w.capitalize() for w in name.split('_'))


def check_feature_order(world, biome_lists):
    """biome_lists: {biome id: [[step features]]}. Raises if any step has an ordering cycle."""
    for step in range(11):
        edges = {}
        nodes = set()
        for b, lists in biome_lists.items():
            seq = lists[step] if step < len(lists) else []
            nodes.update(seq)
            for a, c in zip(seq, seq[1:]):
                edges.setdefault(a, set()).add(c)
        # Kahn's algorithm
        indeg = {n: 0 for n in nodes}
        for a, cs in edges.items():
            for c in cs:
                indeg[c] += 1
        queue = [n for n, d in indeg.items() if d == 0]
        seen = 0
        while queue:
            n = queue.pop()
            seen += 1
            for c in edges.get(n, ()):
                indeg[c] -= 1
                if indeg[c] == 0:
                    queue.append(c)
        if seen != len(nodes):
            raise SystemExit('feature order cycle in %s step %d' % (world, step))


def main():
    vanilla = sys.argv[1] if len(sys.argv) > 1 else None
    if not vanilla or not os.path.isdir(os.path.join(vanilla, 'worldgen')):
        raise SystemExit('usage: gen_worldgen.py <extracted vanilla data/minecraft directory>')

    shutil.rmtree(os.path.join(RES, 'data/earthscapes/worldgen'), ignore_errors=True)
    shutil.rmtree(os.path.join(RES, 'data/minecraft/tags/worldgen'), ignore_errors=True)

    reg = Registry()
    presets = []
    world_biomes = {}
    for w in WORLDS:
        before = {k for k in reg.entries if k[0] == 'worldgen/biome'}
        presets.append(w.build(reg))
        world_biomes[w.W] = sorted({k[1] for k in reg.entries if k[0] == 'worldgen/biome'} - {k[1] for k in before})

    # validate references and ordering
    placed = {ident for (folder, ident) in reg.entries if folder == 'worldgen/placed_feature'}
    configured = {ident for (folder, ident) in reg.entries if folder == 'worldgen/configured_feature'}
    vanilla_placed = {'minecraft:' + f[:-5] for f in os.listdir(os.path.join(vanilla, 'worldgen/placed_feature'))}
    vanilla_configured = {'minecraft:' + f[:-5] for f in os.listdir(os.path.join(vanilla, 'worldgen/configured_feature'))}
    own_types = {'earthscapes:' + t for t in ('umbrella_tree', 'baobab', 'candelabra', 'emergent_tree', 'broadleaf_tree', 'palm', 'cecropia',
                                              'larch', 'shrub', 'termite_mound', 'boulders', 'hoodoo', 'victoria_lilies',
                                              'surface_smoothing', 'ground_cover', 'ovoo', 'ger')}
    for (folder, ident), obj in reg.entries.items():
        if folder == 'worldgen/configured_feature' and obj['type'] not in own_types and not obj['type'].startswith('minecraft:'):
            raise SystemExit('%s has unknown feature type %s' % (ident, obj['type']))
        if folder == 'worldgen/biome':
            for step in obj['features']:
                for f in step:
                    if f not in placed and f not in vanilla_placed:
                        raise SystemExit('%s references missing placed feature %s' % (ident, f))
        if folder == 'worldgen/placed_feature' and isinstance(obj['feature'], str):
            if obj['feature'] not in configured and obj['feature'] not in vanilla_configured:
                raise SystemExit('%s references missing configured feature %s' % (ident, obj['feature']))

    for (folder, ident), obj in list(reg.entries.items()):
        if folder != 'worldgen/world_preset':
            continue
        lists = {}
        for entry in obj['dimensions']['minecraft:overworld']['generator']['biome_source']['biomes']:
            b = entry['biome']
            if b in lists:
                continue
            if b.startswith('minecraft:'):
                with open(os.path.join(vanilla, 'worldgen/biome', b.split(':')[1] + '.json')) as f:
                    lists[b] = json.load(f)['features']
            else:
                lists[b] = reg.entries[('worldgen/biome', b)]['features']
        check_feature_order(ident, lists)

    written = reg.write(RES)
    tag_path = os.path.join(RES, 'data/minecraft/tags/worldgen/world_preset/normal.json')
    os.makedirs(os.path.dirname(tag_path), exist_ok=True)
    with open(tag_path, 'w') as f:
        json.dump({'replace': False, 'values': ['earthscapes:' + p for p in presets]}, f, indent=1)
        f.write('\n')

    lang_path = os.path.join(RES, 'assets/earthscapes/lang/en_us.json')
    lang = {}
    if os.path.exists(lang_path):
        with open(lang_path) as f:
            lang = json.load(f)
    pretty = {'tsavo_red_earth': 'Tsavo Red Earth', 'rift_highlands': 'Rift Highlands', 'fever_tree_riverine': 'Fever Tree Riverine Woodland',
              'varzea_flooded_forest': 'Várzea Flooded Forest', 'igapo_flooded_forest': 'Igapó Blackwater Forest',
              'buriti_palm_swamp': 'Buriti Palm Swamp', 'gobi_dry_steppe': 'Gobi Dry Steppe', 'altai_mountains': 'Altai Mountains',
              'chott_salt_flat': 'Chott Salt Flat', 'tassili_stone_forest': "Tassili n'Ajjer Stone Forest", 'reg_plain': 'Reg Gravel Plain'}
    for w, ids in world_biomes.items():
        for ident in ids:
            name = ident.split(':')[1]
            lang['biome.earthscapes.' + name] = pretty.get(name, title(name))
    with open(lang_path, 'w') as f:
        json.dump(dict(sorted(lang.items())), f, indent=2, ensure_ascii=False)
        f.write('\n')
    print('wrote %d worldgen files for %s' % (len(written), ', '.join(presets)))


if __name__ == '__main__':
    main()
