"""Collects worldgen registry entries and writes them as a data pack inside the mod."""
import json
import os

from wg.dsl import NS, rl


class Registry:
    def __init__(self):
        self.entries = {}  # (registry folder, id) -> obj
        self.biome_tags = {}
        self.world_presets = []
        self.order = {}  # placed feature id -> registration index

    def put(self, folder, name, obj):
        key = (folder, rl(name))
        if key in self.entries and self.entries[key] != obj:
            raise ValueError('conflicting definition for %s %s' % key)
        self.entries[key] = obj
        return rl(name)

    def noise(self, name, first_octave, amplitudes):
        return self.put('worldgen/noise', name, {'firstOctave': first_octave, 'amplitudes': amplitudes})

    def df(self, name, obj):
        return self.put('worldgen/density_function', name, obj)

    def cf(self, name, ftype, config):
        return self.put('worldgen/configured_feature', name, {'type': ftype if ':' in ftype else rl(ftype), 'config': config})

    def pf(self, name, feature, placement):
        # ground cover runs after trees and rocks, like vanilla grass patches
        self.order.setdefault(rl(name), len(self.order) + (100000 if '/cover_' in name else 0))
        return self.put('worldgen/placed_feature', name, {'feature': rl(feature) if isinstance(feature, str) else feature,
                                                          'placement': placement})

    def biome(self, name, obj):
        # keep our own features in one global order (registration order) so that no two biomes
        # disagree about their relative order; vanilla features keep their slots
        for i, step in enumerate(obj['features']):
            mine = sorted((f for f in step if f in self.order), key=lambda f: self.order[f])
            it = iter(mine)
            obj['features'][i] = [next(it) if f in self.order else f for f in step]
        return self.put('worldgen/biome', name, obj)

    def tag_biome(self, tag, *biomes):
        lst = self.biome_tags.setdefault(tag, [])
        for b in biomes:
            if rl(b) not in lst:
                lst.append(rl(b))

    def write(self, resources):
        written = []
        for (folder, ident), obj in sorted(self.entries.items()):
            ns, path = ident.split(':')
            p = os.path.join(resources, 'data', ns, folder, path + '.json')
            os.makedirs(os.path.dirname(p), exist_ok=True)
            with open(p, 'w') as f:
                json.dump(obj, f, indent=1)
                f.write('\n')
            written.append(p)
        for tag, values in sorted(self.biome_tags.items()):
            ns, path = tag.split(':')
            p = os.path.join(resources, 'data', ns, 'tags/worldgen/biome', path + '.json')
            os.makedirs(os.path.dirname(p), exist_ok=True)
            with open(p, 'w') as f:
                json.dump({'replace': False, 'values': values}, f, indent=1)
                f.write('\n')
            written.append(p)
        return written
