"""Helpers that build Minecraft 1.21.11 worldgen JSON structures in Python."""

NS = 'earthscapes'


def rl(name):
    return name if ':' in name else '%s:%s' % (NS, name)


# ---------------------------------------------------------------------------- density functions

def ref(name):
    return rl(name)


def add(a, b):
    return {'type': 'minecraft:add', 'argument1': a, 'argument2': b}


def mul(a, b):
    return {'type': 'minecraft:mul', 'argument1': a, 'argument2': b}


def sub(a, b):
    return add(a, mul(-1.0, b))


def adds(*terms):
    out = terms[0]
    for t in terms[1:]:
        out = add(out, t)
    return out


def dmin(a, b):
    return {'type': 'minecraft:min', 'argument1': a, 'argument2': b}


def dmax(a, b):
    return {'type': 'minecraft:max', 'argument1': a, 'argument2': b}


def clamp(x, lo, hi):
    return {'type': 'minecraft:clamp', 'input': x, 'min': lo, 'max': hi}


def mapped(kind, x):
    return {'type': 'minecraft:' + kind, 'argument': x}


def dabs(x):
    return mapped('abs', x)


def square(x):
    return mapped('square', x)


def cube(x):
    return mapped('cube', x)


def flat_cache(x):
    return mapped('flat_cache', x)


def cache_2d(x):
    return mapped('cache_2d', x)


def cache_once(x):
    return mapped('cache_once', x)


def interpolated(x):
    return mapped('interpolated', x)


def noise(name, xz=1.0, y=0.0):
    return {'type': 'minecraft:noise', 'noise': rl(name), 'xz_scale': xz, 'y_scale': y}


def shifted(name, xz=1.0):
    return {'type': 'minecraft:shifted_noise', 'noise': rl(name), 'xz_scale': xz, 'y_scale': 0.0,
            'shift_x': 'minecraft:shift_x', 'shift_y': 0.0, 'shift_z': 'minecraft:shift_z'}


def ygrad(from_y, to_y, from_v, to_v):
    return {'type': 'minecraft:y_clamped_gradient', 'from_y': from_y, 'to_y': to_y, 'from_value': from_v, 'to_value': to_v}


def range_choice(x, lo, hi, inside, outside):
    return {'type': 'minecraft:range_choice', 'input': x, 'min_inclusive': lo, 'max_exclusive': hi,
            'when_in_range': inside, 'when_out_of_range': outside}


def spline(coord, points):
    """points: list of (location, value, derivative) where value may itself be a spline dict."""
    return {'type': 'minecraft:spline', 'spline': spline_body(coord, points)}


def spline_body(coord, points):
    out = []
    for p in points:
        loc, val = p[0], p[1]
        der = p[2] if len(p) > 2 else 0.0
        if isinstance(val, dict) and 'coordinate' in val:
            out.append({'location': loc, 'value': val, 'derivative': der})
        else:
            out.append({'location': loc, 'value': float(val), 'derivative': der})
    return {'coordinate': coord, 'points': out}


def smooth_ramp(coord, x0, x1, v0=0.0, v1=1.0):
    """Cubic-spline smoothstep from v0 at x0 to v1 at x1 (clamped outside)."""
    return spline(coord, [(x0, v0, 0.0), (x1, v1, 0.0)])


def lerp(t, a, b):
    """a + t*(b-a)"""
    return add(a, mul(t, sub(b, a)))


# custom Earthscapes density functions
def dune_ridges(angle, wavelength, asymmetry=0.7, sharpness=1.0, flatness=0.0, offset=None):
    d = {'type': rl('dune_ridges'), 'angle': angle, 'wavelength': wavelength, 'asymmetry': asymmetry,
         'sharpness': sharpness, 'flatness': flatness}
    if offset is not None:
        d['offset'] = offset
    return d


def eroded(noise_name, xz_scale, octaves=6, lacunarity=2.0, gain=0.5, erosion=1.0, ridged=False):
    return {'type': rl('eroded_noise'), 'noise': rl(noise_name), 'xz_scale': xz_scale, 'octaves': octaves,
            'lacunarity': lacunarity, 'gain': gain, 'erosion': erosion, 'ridged': ridged}


def terrace(x, step, riser=0.25, offset=0.0):
    return {'type': rl('terrace'), 'input': x, 'step': step, 'riser': riser, 'offset': offset}


def cell_bumps(noise_name, cell_size, chance, r_min, r_max, h_min=1.0, h_max=1.0, edge=2.0, profile=1.0, jitter=0.8,
               elongation=1.0):
    return {'type': rl('cell_bumps'), 'noise': rl(noise_name), 'cell_size': cell_size, 'chance': chance,
            'radius_min': r_min, 'radius_max': r_max, 'height_min': h_min, 'height_max': h_max,
            'edge_power': edge, 'profile_power': profile, 'jitter': jitter, 'elongation': elongation}


def noise_params(first_octave, amplitudes):
    return {'firstOctave': first_octave, 'amplitudes': amplitudes}


# ---------------------------------------------------------------------------- block states

def state(name, **props):
    s = {'Name': name if ':' in name else 'minecraft:' + name}
    if props:
        s['Properties'] = {k: str(v).lower() if isinstance(v, bool) else str(v) for k, v in props.items()}
    return s


def es(name, **props):
    s = {'Name': rl(name)}
    if props:
        s['Properties'] = {k: str(v).lower() if isinstance(v, bool) else str(v) for k, v in props.items()}
    return s


def simple(st):
    return {'type': 'minecraft:simple_state_provider', 'state': st}


def weighted(*entries):
    """entries: (state, weight)"""
    return {'type': 'minecraft:weighted_state_provider', 'entries': [{'data': s, 'weight': w} for s, w in entries]}


def uniform(lo, hi):
    return {'type': 'minecraft:uniform', 'min_inclusive': lo, 'max_inclusive': hi}


def funiform(lo, hi):
    return {'type': 'minecraft:uniform', 'min_inclusive': float(lo), 'max_exclusive': float(hi)}


def weighted_int(*pairs):
    return {'type': 'minecraft:weighted_list', 'distribution': [{'data': d, 'weight': w} for d, w in pairs]}


# ---------------------------------------------------------------------------- placement modifiers

def count(n):
    return {'type': 'minecraft:count', 'count': n}


def rarity(chance):
    return {'type': 'minecraft:rarity_filter', 'chance': chance}


def in_square():
    return {'type': 'minecraft:in_square'}


def heightmap(kind='OCEAN_FLOOR'):
    return {'type': 'minecraft:heightmap', 'heightmap': kind}


def biome_filter():
    return {'type': 'minecraft:biome'}


def water_depth(max_depth=0):
    return {'type': 'minecraft:surface_water_depth_filter', 'max_water_depth': max_depth}


def slope(min_slope=0.0, max_slope=64.0, facing=None, threshold=0.3, radius=3):
    d = {'type': rl('slope'), 'min_slope': min_slope, 'max_slope': max_slope, 'radius': radius}
    if facing:
        d['facing'] = facing
        d['facing_threshold'] = threshold
    return d


def local_peak(radius=12, prominence=4):
    return {'type': rl('local_peak'), 'radius': radius, 'prominence': prominence}


def noise_count(noise_level, above, below):
    return {'type': 'minecraft:noise_threshold_count', 'noise_level': noise_level, 'above_noise': above, 'below_noise': below}


def block_filter(predicate):
    return {'type': 'minecraft:block_predicate_filter', 'predicate': predicate}


def would_survive(st):
    return {'type': 'minecraft:would_survive', 'state': st}


def matching_blocks(blocks, offset=None):
    d = {'type': 'minecraft:matching_blocks', 'blocks': blocks}
    if offset:
        d['offset'] = offset
    return d


def matching_tag(tag_name, offset=None):
    d = {'type': 'minecraft:matching_block_tag', 'tag': tag_name}
    if offset:
        d['offset'] = offset
    return d


def all_of(*preds):
    return {'type': 'minecraft:all_of', 'predicates': list(preds)}


def any_of(*preds):
    return {'type': 'minecraft:any_of', 'predicates': list(preds)}


def not_(pred):
    return {'type': 'minecraft:not', 'predicate': pred}


def matching_fluids(fluids, offset):
    return {'type': 'minecraft:matching_fluids', 'fluids': fluids, 'offset': offset}


def near_water():
    w = ['minecraft:water', 'minecraft:flowing_water']
    return any_of(matching_fluids(w, [1, -1, 0]), matching_fluids(w, [-1, -1, 0]), matching_fluids(w, [0, -1, 1]),
                  matching_fluids(w, [0, -1, -1]))


# ---------------------------------------------------------------------------- surface rules

def sr_block(st):
    return {'type': 'minecraft:block', 'result_state': st}


def sr_seq(*rules):
    return {'type': 'minecraft:sequence', 'sequence': list(rules)}


def sr_if(cond, then):
    return {'type': 'minecraft:condition', 'if_true': cond, 'then_run': then}


def c_biome(*biomes):
    return {'type': 'minecraft:biome', 'biome_is': [rl(b) for b in biomes]}


def c_noise(noise_name, lo, hi=1.7976931348623157e308):
    return {'type': 'minecraft:noise_threshold', 'noise': noise_name if ':' in noise_name else rl(noise_name),
            'min_threshold': lo, 'max_threshold': hi}


def c_stone_depth(offset=0, add_surface_depth=False, secondary=0, surface_type='floor'):
    return {'type': 'minecraft:stone_depth', 'offset': offset, 'add_surface_depth': add_surface_depth,
            'secondary_depth_range': secondary, 'surface_type': surface_type}


def c_water(offset=0, multiplier=0, add_stone_depth=False):
    return {'type': 'minecraft:water', 'offset': offset, 'surface_depth_multiplier': multiplier, 'add_stone_depth': add_stone_depth}


def c_y_above(y, multiplier=0, add_stone_depth=False):
    return {'type': 'minecraft:y_above', 'anchor': {'absolute': y}, 'surface_depth_multiplier': multiplier,
            'add_stone_depth': add_stone_depth}


def c_not(cond):
    return {'type': 'minecraft:not', 'invert': cond}


def c_steep():
    return {'type': 'minecraft:steep'}


def c_hole():
    return {'type': 'minecraft:hole'}


def c_above_preliminary():
    return {'type': 'minecraft:above_preliminary_surface'}


def c_vgradient(name, true_at_and_below, false_at_and_above):
    return {'type': 'minecraft:vertical_gradient', 'random_name': name, 'true_at_and_below': true_at_and_below,
            'false_at_and_above': false_at_and_above}


ON_FLOOR = c_stone_depth(0, False, 0, 'floor')
UNDER_FLOOR = c_stone_depth(0, True, 0, 'floor')
ON_CEILING = c_stone_depth(0, False, 0, 'ceiling')


def deep_floor(secondary):
    return c_stone_depth(0, True, secondary, 'floor')


def above_water():
    return c_water(-1, 0)


def not_underwater():
    return c_water(0, 0)
