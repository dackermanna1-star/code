"""Generates the 3D held-item models, their material textures, inventory icon models and the item model
definitions (assets/godforge/items/*.json) for every Godforge item.

Run from the repository root:  python3 tools/gen_models.py
Models are built standing upright (+Y = blade/muzzle direction) and turned into the hand by the display
transforms, which lets them use the full -16..32 element range for truly colossal weapons.
"""
import json
import math
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(__file__))
from pixelart import hexc, noise2, save, save_anim  # noqa: E402

ASSETS = os.path.join(os.path.dirname(__file__), '..', 'src', 'main', 'resources', 'assets', 'godforge')
MAT_DIR = os.path.join(ASSETS, 'textures', 'item', 'model')


# ============================================================== material textures (16x16)

def _rgb(h):
    c = hexc(h)
    return np.array(c[:3], dtype=float) / 255.0


def _write(img_float, name):
    arr = np.clip(img_float * 255.0, 0, 255).astype(np.uint8)
    save(arr, os.path.join(MAT_DIR, name + '.png'))


def mat_metal(name, base, seed, edge=0.7, brushed=True, panel=False):
    n = noise2(seed, 16, 16, octaves=3, base=4)
    col = _rgb(base)
    img = np.zeros((16, 16, 4))
    shade = 0.88 + 0.2 * n
    if brushed:
        stripes = noise2(seed + 1, 16, 16, octaves=1, base=16)[:, :1].repeat(16, axis=1)
        shade += (stripes - 0.5) * 0.08
    img[:, :, :3] = col[None, None, :] * shade[:, :, None]
    img[0, :, :3] *= 1.18
    img[:, 0, :3] *= 1.12
    img[15, :, :3] *= edge
    img[:, 15, :3] *= edge
    if panel:
        img[7, :, :3] *= 0.72
        img[:, 7, :3] *= 0.8
        for (y, x) in ((2, 2), (2, 12), (12, 2), (12, 12)):
            img[y, x, :3] = np.minimum(1.0, col * 1.45)
    img[:, :, 3] = 1.0
    _write(np.clip(img, 0, 1), name)


def mat_gem(name, base, highlight='#ffffff'):
    col = _rgb(base)
    hl = _rgb(highlight)
    y, x = np.mgrid[0:16, 0:16]
    facet = ((x < 8) == (y < 8)).astype(float)
    t = (x + y) / 30.0
    img = np.zeros((16, 16, 4))
    for ch in range(3):
        img[:, :, ch] = col[ch] * (0.65 + 0.35 * facet) * (1.1 - t * 0.4)
    img[2:5, 2:5, :3] = hl
    img[:, :, 3] = 1.0
    _write(np.clip(img, 0, 1), name)


def mat_wrap(name, c1, c2):
    y, x = np.mgrid[0:16, 0:16]
    band = (((x + y) // 3) % 2).astype(float)
    a = _rgb(c1)
    b = _rgb(c2)
    img = np.zeros((16, 16, 4))
    for ch in range(3):
        img[:, :, ch] = a[ch] * band + b[ch] * (1 - band)
    img[:, :, :3] *= (0.9 + 0.1 * noise2(9, 16, 16, 2, 4))[:, :, None]
    img[:, :, 3] = 1.0
    _write(np.clip(img, 0, 1), name)


def mat_crystal(name, base, seed):
    col = _rgb(base)
    n = noise2(seed, 16, 16, octaves=3, base=4)
    y, x = np.mgrid[0:16, 0:16]
    facets = (np.sin(x * 0.9 + y * 0.4) > 0).astype(float) * 0.15
    img = np.zeros((16, 16, 4))
    img[:, :, :3] = col[None, None, :] * (0.7 + 0.35 * n + facets)[:, :, None]
    img[0, :, :3] = np.minimum(1, col * 1.6)
    img[:, 0, :3] = np.minimum(1, col * 1.4)
    img[:, :, 3] = 1.0
    _write(np.clip(img, 0, 1), name)


def mat_energy(name, c_core, c_edge, seed, frames=8, speed=2, rainbow=False):
    out = []
    n = noise2(seed, 16, 32, octaves=3, base=4)
    for f in range(frames):
        shift = (f * speed) % 32
        v = np.roll(n, shift, axis=0)[:16, :]
        img = np.zeros((16, 16, 4))
        if rainbow:
            y, x = np.mgrid[0:16, 0:16]
            hue = (x + y) / 32.0 + f / frames
            for ch, off in enumerate((0.0, 0.33, 0.66)):
                img[:, :, ch] = 0.55 + 0.45 * np.cos((hue + off) * 2 * math.pi)
            img[:, :, :3] = img[:, :, :3] * 0.7 + 0.3 * v[:, :, None]
        else:
            a = _rgb(c_core)
            b = _rgb(c_edge)
            t = np.clip(v * 1.3 - 0.15, 0, 1)
            for ch in range(3):
                img[:, :, ch] = b[ch] + (a[ch] - b[ch]) * t
        img[:, :, 3] = 1.0
        out.append(np.clip(img * 255, 0, 255).astype(np.uint8))
    save_anim(out, os.path.join(MAT_DIR, name + '.png'), frametime=2, interpolate=True)


def mat_flat(name, color):
    img = np.zeros((16, 16, 4))
    img[:, :, :3] = _rgb(color)
    img[:, :, 3] = 1.0
    _write(img, name)


def mat_stripes(name, c1, c2):
    y, x = np.mgrid[0:16, 0:16]
    band = ((((x + y) // 4) % 2) == 0).astype(float)
    a = _rgb(c1)
    b = _rgb(c2)
    img = np.zeros((16, 16, 4))
    for ch in range(3):
        img[:, :, ch] = a[ch] * band + b[ch] * (1 - band)
    img[:, :, 3] = 1.0
    _write(img, name)


def materials():
    os.makedirs(MAT_DIR, exist_ok=True)
    # shared
    mat_metal('gold', '#e8b830', 1, panel=False)
    mat_metal('gold_dark', '#a87914', 2)
    mat_metal('steel', '#8a95a3', 3, panel=True)
    mat_metal('steel_dark', '#3a414b', 4, panel=True)
    mat_metal('obsidian', '#2a1d3a', 5)
    mat_metal('white_metal', '#e8ecf2', 6, panel=True)
    mat_metal('gunmetal', '#4a4f58', 7, panel=True)
    mat_flat('void_black', '#020104')
    mat_flat('lens_white', '#f4f4f4')
    # worldcutter
    mat_metal('worldcutter_blade', '#3b2a63', 10, edge=0.8)
    mat_metal('worldcutter_edge', '#e9e2ff', 11, brushed=False)
    mat_wrap('worldcutter_grip', '#3b2350', '#e8c25a')
    mat_gem('worldcutter_gem', '#ff3df5')
    mat_gem('violet_gem', '#9b4dff')
    mat_energy('worldcutter_rift', '#ffffff', '#7ff6ff', 12)
    # laser
    mat_energy('laser_energy', '#ffd0d0', '#ff2a2a', 20, speed=4)
    # orb eraser
    mat_metal('pearl', '#fff1d6', 21, brushed=False)
    mat_energy('rainbow_energy', '#ffffff', '#ffffff', 22, rainbow=True)
    # asteroid gun
    mat_stripes('hazard', '#ff9a1f', '#1b1d21')
    mat_energy('magma_energy', '#ffe08a', '#ff6a00', 30)
    mat_crystal('asteroid_rock', '#6b4a33', 31)
    # black hole
    mat_energy('accretion', '#fff2c0', '#ff6a14', 40, speed=4)
    mat_energy('void_runes', '#d6b8ff', '#5a1aff', 41)
    # reality breaker
    mat_crystal('reality_crystal', '#8a35d0', 50)
    mat_energy('reality_crack', '#ffffff', '#ff4df0', 51, speed=3)
    mat_energy('cyan_runes', '#e0feff', '#2fd6ff', 52)
    # starfall bow
    mat_metal('midnight', '#22357f', 60)
    mat_energy('starlight', '#ffffff', '#9fd4ff', 61, speed=1)
    mat_gem('star_gem', '#ffe680', '#ffffff')
    # godfist
    mat_metal('gauntlet_gold', '#e0a92a', 70, panel=True)
    mat_metal('gauntlet_trim', '#fff3c4', 71, brushed=False)
    mat_energy('kinetic_energy', '#e0fbff', '#2fd6ff', 72, speed=3)
    # sunforge
    mat_energy('solar_energy', '#fffbe0', '#ff8a12', 80, speed=2)
    mat_energy('corona_energy', '#ffb02e', '#c4200a', 81, speed=3)
    mat_gem('sun_gem', '#ff5a1a')
    # planet cracker
    mat_energy('cracker_energy', '#d2ffe0', '#1fbf55', 90, speed=3)
    mat_gem('warning_light', '#ff2a2a')


# ============================================================== model builder

FACES = ('north', 'south', 'east', 'west', 'up', 'down')


class Model:
    def __init__(self, name):
        self.name = name
        self.textures = {}
        self.elements = []

    def tex(self, key, material):
        self.textures[key] = 'godforge:item/model/' + material
        return '#' + key

    def box(self, frm, to, tex, rot=None, light=0, tint=None, faces=FACES, shade=True):
        for v in list(frm) + list(to):
            if not -16.0 <= v <= 32.0:
                raise ValueError('%s: element %s -> %s leaves the -16..32 model bounds' % (self.name, frm, to))
        el = {'from': [round(v, 3) for v in frm], 'to': [round(v, 3) for v in to]}
        if rot:
            r = {'origin': [round(v, 3) for v in rot.get('origin', [8, 8, 8])]}
            if 'axis' in rot:
                r['axis'] = rot['axis']
                r['angle'] = rot['angle']
            else:
                r['x'] = rot.get('x', 0)
                r['y'] = rot.get('y', 0)
                r['z'] = rot.get('z', 0)
            el['rotation'] = r
        if light:
            el['light_emission'] = light
        if not shade:
            el['shade'] = False
        dx = abs(to[0] - frm[0])
        dy = abs(to[1] - frm[1])
        dz = abs(to[2] - frm[2])
        dims = {
            'north': (dx, dy), 'south': (dx, dy),
            'east': (dz, dy), 'west': (dz, dy),
            'up': (dx, dz), 'down': (dx, dz),
        }
        el['faces'] = {}
        for face in faces:
            w, h = dims[face]
            w = max(0.5, min(16.0, w))
            h = max(0.5, min(16.0, h))
            f = {'uv': [0, 0, round(w, 3), round(h, 3)], 'texture': tex}
            if tint is not None:
                f['tintindex'] = tint
            el['faces'][face] = f
        self.elements.append(el)
        return self

    def json(self, display):
        tex = dict(self.textures)
        tex['particle'] = next(iter(self.textures.values()))
        return {'credit': 'Godforge Arsenal (generated by tools/gen_models.py)', 'textures': tex, 'gui_light': 'front', 'elements': self.elements, 'display': display}


def write_json(rel, data):
    p = os.path.join(ASSETS, rel)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    with open(p, 'w') as f:
        json.dump(data, f, indent=1)


# ============================================================== display presets

def handheld_display(tp_scale=0.85, fp_scale=0.7, tp_translate=(0, 4.5, 1.0), fp_translate=(1.13, 4.2, 1.13)):
    """Sword-like pose for models standing along +Y (an extra -45 deg Z twist turns them into the sprite diagonal)."""
    return {
        'thirdperson_righthand': {'rotation': [0, -90, 10], 'translation': list(tp_translate), 'scale': [tp_scale] * 3},
        'thirdperson_lefthand': {'rotation': [0, 90, -10], 'translation': list(tp_translate), 'scale': [tp_scale] * 3},
        'firstperson_righthand': {'rotation': [0, -90, -20], 'translation': list(fp_translate), 'scale': [fp_scale] * 3},
        'firstperson_lefthand': {'rotation': [0, 90, 20], 'translation': list(fp_translate), 'scale': [fp_scale] * 3},
        'head': {'rotation': [0, 180, -45], 'translation': [0, 13, 7], 'scale': [0.8] * 3},
        'gui': {'rotation': [30, 225, -45], 'translation': [0, 0, 0], 'scale': [0.35] * 3},
        'ground': {'rotation': [0, 0, 0], 'translation': [0, 2, 0], 'scale': [0.35] * 3},
        'fixed': {'rotation': [0, 180, -45], 'translation': [0, 0, 0], 'scale': [0.45] * 3},
    }


def gun_display(tp_scale=0.8, fp_scale=0.75, fp_translate=(2.0, -1.0, -3.0), tp_translate=(0, 3.0, 2.0)):
    """Pose for guns built standing along +Y: the muzzle (+Y) points where the player looks."""
    return {
        'thirdperson_righthand': {'rotation': [-90, 0, 0], 'translation': list(tp_translate), 'scale': [tp_scale] * 3},
        'thirdperson_lefthand': {'rotation': [-90, 0, 0], 'translation': list(tp_translate), 'scale': [tp_scale] * 3},
        'firstperson_righthand': {'rotation': [-90, 0, 0], 'translation': list(fp_translate), 'scale': [fp_scale] * 3},
        'firstperson_lefthand': {'rotation': [-90, 0, 0], 'translation': [-fp_translate[0], fp_translate[1], fp_translate[2]], 'scale': [fp_scale] * 3},
        'head': {'rotation': [0, 0, 0], 'translation': [0, 14, 0], 'scale': [0.6] * 3},
        'gui': {'rotation': [30, 225, -45], 'scale': [0.4] * 3},
        'ground': {'translation': [0, 2, 0], 'scale': [0.35] * 3},
        'fixed': {'rotation': [0, 180, -45], 'scale': [0.45] * 3},
    }


# ============================================================== weapons

def worldcutter():
    m = Model('worldcutter')
    blade = m.tex('blade', 'worldcutter_blade')
    edge = m.tex('edge', 'worldcutter_edge')
    grip = m.tex('grip', 'worldcutter_grip')
    gold = m.tex('gold', 'gold')
    gem = m.tex('gem', 'worldcutter_gem')
    vgem = m.tex('vgem', 'violet_gem')
    rift = m.tex('rift', 'worldcutter_rift')
    # pommel
    m.box([6.75, -7.5, 6.75], [9.25, -5.0, 9.25], gold)
    m.box([7.0, -7.0, 7.0], [9.0, -5.5, 9.0], gem, rot={'origin': [8, -6.25, 8], 'y': 45}, light=12)
    # grip with gold bands
    m.box([7.2, -5.0, 7.2], [8.8, 4.0, 8.8], grip)
    for y in (-3.0, 0.0, 2.6):
        m.box([6.9, y, 6.9], [9.1, y + 0.6, 9.1], gold)
    # crossguard with swept wings
    m.box([3.0, 4.0, 6.6], [13.0, 6.0, 9.4], gold)
    m.box([0.0, 4.6, 7.0], [4.0, 6.2, 9.0], gold, rot={'origin': [3.5, 5.2, 8], 'z': -24})
    m.box([12.0, 4.6, 7.0], [16.0, 6.2, 9.0], gold, rot={'origin': [12.5, 5.2, 8], 'z': 24})
    m.box([6.6, 3.6, 6.2], [9.4, 6.4, 9.8], vgem, rot={'origin': [8, 5, 8], 'z': 45}, light=13)
    # colossal blade
    m.box([5.0, 6.0, 7.45], [11.0, 27.0, 8.55], blade)
    m.box([5.6, 24.5, 7.45], [10.4, 29.3, 8.55], blade, rot={'origin': [8, 27, 8], 'z': 45})
    m.box([4.55, 6.5, 7.6], [5.05, 26.5, 8.4], edge, light=5)
    m.box([10.95, 6.5, 7.6], [11.45, 26.5, 8.4], edge, light=5)
    # the rift line splitting the blade (emissive on both faces)
    m.box([7.55, 6.5, 7.3], [8.45, 29.6, 8.7], rift, light=15, shade=False)
    # fractured shards of space drifting off the blade
    m.box([12.4, 19.0, 7.7], [13.2, 21.0, 8.3], rift, rot={'origin': [12.8, 20, 8], 'z': 30}, light=15, shade=False)
    m.box([2.8, 15.0, 7.7], [3.5, 16.6, 8.3], rift, rot={'origin': [3.1, 15.8, 8], 'z': -25}, light=15, shade=False)
    m.box([12.0, 25.0, 7.8], [12.6, 26.2, 8.2], rift, rot={'origin': [12.3, 25.6, 8], 'z': 50}, light=15, shade=False)
    return m, handheld_display(tp_scale=0.95, fp_scale=0.78)


def laser_beam():
    m = Model('laser_beam')
    body = m.tex('body', 'white_metal')
    dark = m.tex('dark', 'steel_dark')
    energy = m.tex('energy', 'laser_energy')
    lens = m.tex('lens', 'lens_white')
    # barrel
    m.box([5.5, 0.0, 5.5], [10.5, 17.0, 10.5], body)
    # glowing power conduits along both sides
    m.box([5.2, 1.5, 7.3], [5.6, 15.5, 8.7], energy, light=15)
    m.box([10.4, 1.5, 7.3], [10.8, 15.5, 8.7], energy, light=15)
    m.box([7.3, 1.5, 10.4], [8.7, 15.5, 10.8], energy, light=15)
    # cooling fins
    for y in (3.0, 5.5, 8.0, 10.5, 13.0):
        m.box([4.5, y, 6.0], [11.5, y + 0.7, 10.0], dark)
    # emitter head and lens (lens tinted with the selected beam colour)
    m.box([4.5, 17.0, 4.5], [11.5, 21.0, 11.5], dark)
    m.box([4.0, 20.0, 4.0], [12.0, 21.5, 12.0], body)
    m.box([5.5, 21.5, 5.5], [10.5, 22.5, 10.5], lens, light=15, tint=0, shade=False)
    # rear power cell
    m.box([6.0, -4.0, 6.0], [10.0, 0.0, 10.0], dark)
    m.box([6.6, -4.6, 6.6], [9.4, -4.0, 9.4], energy, light=15)
    # grip + trigger guard
    m.box([7.0, 1.5, 0.5], [9.0, 6.5, 5.5], dark, rot={'origin': [8, 4, 5.5], 'x': -20})
    m.box([7.3, 7.0, 3.0], [8.7, 7.6, 5.5], dark)
    return m, gun_display()


def orb_eraser():
    m = Model('orb_eraser')
    pearl = m.tex('pearl', 'pearl')
    gold = m.tex('gold', 'gold')
    rainbow = m.tex('rainbow', 'rainbow_energy')
    m.box([7.25, -10.0, 7.25], [8.75, 19.0, 8.75], pearl)
    m.box([6.8, -11.0, 6.8], [9.2, -9.5, 9.2], gold)
    m.box([7.2, -12.2, 7.2], [8.8, -11.0, 8.8], rainbow, light=12)
    for y in (-4.0, 4.0, 12.0):
        m.box([6.9, y, 6.9], [9.1, y + 1.0, 9.1], gold)
    m.box([6.3, 18.0, 6.3], [9.7, 20.0, 9.7], gold)
    # four prongs cradling the orb
    m.box([4.6, 19.0, 7.4], [5.6, 27.0, 8.6], gold, rot={'origin': [5.1, 19, 8], 'z': 14})
    m.box([10.4, 19.0, 7.4], [11.4, 27.0, 8.6], gold, rot={'origin': [10.9, 19, 8], 'z': -14})
    m.box([7.4, 19.0, 4.6], [8.6, 27.0, 5.6], gold, rot={'origin': [8, 19, 5.1], 'x': -14})
    m.box([7.4, 19.0, 10.4], [8.6, 27.0, 11.4], gold, rot={'origin': [8, 19, 10.9], 'x': 14})
    # the rainbow singularity: overlapping rotated cubes read as a sphere
    m.box([4.5, 21.0, 4.5], [11.5, 28.0, 11.5], rainbow, light=15, shade=False)
    m.box([4.5, 21.0, 4.5], [11.5, 28.0, 11.5], rainbow, rot={'origin': [8, 24.5, 8], 'y': 45}, light=15, shade=False)
    m.box([4.9, 21.4, 4.9], [11.1, 27.6, 11.1], rainbow, rot={'origin': [8, 24.5, 8], 'x': 45}, light=15, shade=False)
    m.box([4.9, 21.4, 4.9], [11.1, 27.6, 11.1], rainbow, rot={'origin': [8, 24.5, 8], 'z': 45}, light=15, shade=False)
    # orbiting motes
    for i, (x, y, z) in enumerate([(2.0, 26.0, 8.0), (14.0, 23.0, 8.0), (8.0, 29.5, 2.5), (8.0, 20.5, 13.5)]):
        m.box([x - 0.5, y - 0.5, z - 0.5], [x + 0.5, y + 0.5, z + 0.5], rainbow, rot={'origin': [x, y, z], 'y': 45, 'x': 30}, light=15, shade=False)
    return m, handheld_display(tp_scale=0.9, fp_scale=0.75)


def asteroid_gun():
    m = Model('asteroid_gun')
    gun = m.tex('gun', 'gunmetal')
    dark = m.tex('dark', 'steel_dark')
    hazard = m.tex('hazard', 'hazard')
    magma = m.tex('magma', 'magma_energy')
    rock = m.tex('rock', 'asteroid_rock')
    light = m.tex('light', 'warning_light')
    m.box([5.0, -2.0, 5.0], [11.0, 22.0, 11.0], gun)
    m.box([4.7, 6.0, 4.7], [11.3, 10.0, 11.3], hazard)
    # chamber window with a glowing captive asteroid
    m.box([4.6, 12.0, 6.0], [5.2, 18.0, 10.0], dark)
    m.box([4.3, 12.8, 6.6], [5.0, 17.2, 9.4], magma, light=15)
    m.box([6.2, 13.2, 6.2], [9.8, 16.8, 9.8], rock, rot={'origin': [8, 15, 8], 'y': 30, 'x': 20})
    # muzzle with a molten bore
    m.box([3.8, 22.0, 3.8], [12.2, 26.0, 12.2], dark)
    m.box([5.4, 25.6, 5.4], [10.6, 26.3, 10.6], magma, light=15, shade=False)
    # targeting scope
    m.box([7.0, 8.0, 11.0], [9.0, 19.0, 13.0], dark)
    m.box([7.3, 19.0, 11.3], [8.7, 19.6, 12.7], light, light=15)
    # stock and grip
    m.box([5.8, -8.0, 5.8], [10.2, -2.0, 10.2], dark)
    m.box([6.3, -8.5, 6.3], [9.7, -8.0, 9.7], hazard)
    m.box([7.0, 0.5, 0.5], [9.0, 5.5, 5.0], dark, rot={'origin': [8, 3, 5], 'x': -20})
    return m, gun_display(tp_scale=0.85, fp_scale=0.8)


def black_hole():
    m = Model('black_hole')
    obs = m.tex('obsidian', 'obsidian')
    runes = m.tex('runes', 'void_runes')
    void = m.tex('void', 'void_black')
    disk = m.tex('disk', 'accretion')
    m.box([7.25, -10.0, 7.25], [8.75, 18.0, 8.75], obs)
    for y in (-6.0, 1.0, 8.0, 14.0):
        m.box([7.05, y, 7.05], [8.95, y + 1.5, 8.95], runes, light=13)
    m.box([6.5, 17.0, 6.5], [9.5, 19.0, 9.5], obs)
    # claws reaching around the singularity
    m.box([4.0, 18.0, 7.3], [5.0, 26.0, 8.7], obs, rot={'origin': [4.5, 18, 8], 'z': 18})
    m.box([11.0, 18.0, 7.3], [12.0, 26.0, 8.7], obs, rot={'origin': [11.5, 18, 8], 'z': -18})
    m.box([7.3, 18.0, 11.0], [8.7, 25.0, 12.0], obs, rot={'origin': [8, 18, 11.5], 'x': 18})
    # event horizon (lightless) with a blazing tilted accretion disk
    m.box([5.5, 20.5, 5.5], [10.5, 25.5, 10.5], void)
    m.box([5.5, 20.5, 5.5], [10.5, 25.5, 10.5], void, rot={'origin': [8, 23, 8], 'y': 45})
    m.box([5.8, 20.8, 5.8], [10.2, 25.2, 10.2], void, rot={'origin': [8, 23, 8], 'x': 45})
    m.box([1.0, 22.75, 1.0], [15.0, 23.25, 15.0], disk, rot={'origin': [8, 23, 8], 'x': 22, 'z': 12}, light=15, shade=False)
    m.box([3.0, 22.7, 3.0], [13.0, 23.3, 13.0], disk, rot={'origin': [8, 23, 8], 'x': 22, 'y': 45, 'z': 12}, light=15, shade=False)
    m.box([7.0, 26.8, 7.0], [9.0, 28.0, 9.0], runes, rot={'origin': [8, 27.4, 8], 'y': 45}, light=15)
    return m, handheld_display(tp_scale=0.9, fp_scale=0.75)


def reality_breaker():
    m = Model('reality_breaker')
    slate = m.tex('slate', 'steel_dark')
    crystal = m.tex('crystal', 'reality_crystal')
    crack = m.tex('crack', 'reality_crack')
    runes = m.tex('runes', 'cyan_runes')
    m.box([7.2, -12.0, 7.2], [8.8, 20.0, 8.8], slate)
    m.box([7.4, -14.0, 7.4], [8.6, -12.0, 8.6], crystal, rot={'origin': [8, -13, 8], 'y': 45})
    for y in (-8.0, -2.0, 4.0, 10.0, 16.0):
        m.box([7.0, y, 7.0], [9.0, y + 1.0, 9.0], runes, light=13)
    # massive fractured crystal head
    m.box([1.0, 19.0, 5.0], [15.0, 27.0, 11.0], crystal)
    m.box([-2.0, 20.0, 5.6], [2.5, 26.0, 10.4], crystal, rot={'origin': [1.5, 23, 8], 'z': 12})
    m.box([13.5, 20.0, 5.6], [18.0, 26.0, 10.4], crystal, rot={'origin': [14.5, 23, 8], 'z': -12})
    m.box([7.0, 26.5, 7.0], [9.0, 31.0, 9.0], crystal, rot={'origin': [8, 27, 8], 'y': 45})
    # glowing fractures splitting the head
    m.box([1.2, 22.7, 4.85], [14.8, 23.3, 11.15], crack, light=15, shade=False)
    m.box([4.0, 19.5, 4.85], [4.6, 26.5, 11.15], crack, rot={'origin': [4.3, 23, 8], 'z': 25}, light=15, shade=False)
    m.box([11.0, 19.5, 4.85], [11.6, 26.5, 11.15], crack, rot={'origin': [11.3, 23, 8], 'z': -30}, light=15, shade=False)
    # orbiting shards of broken space
    for (x, y, z, r) in [(-1.5, 29.0, 8.0, 30), (17.0, 17.0, 8.0, -20), (8.0, 30.6, 12.5, 45), (3.0, 16.0, 3.5, 60)]:
        m.box([x - 0.7, y - 1.0, z - 0.4], [x + 0.7, y + 1.0, z + 0.4], crack, rot={'origin': [x, y, z], 'z': r, 'y': 20}, light=15, shade=False)
    return m, handheld_display(tp_scale=0.9, fp_scale=0.75)


def godfist():
    m = Model('godfist')
    gold = m.tex('gold', 'gauntlet_gold')
    trim = m.tex('trim', 'gauntlet_trim')
    energy = m.tex('energy', 'kinetic_energy')
    gdark = m.tex('gdark', 'gold_dark')
    # main fist mass (knuckles point +Y)
    m.box([2.5, 3.0, 3.0], [13.5, 12.5, 12.0], gold)
    for i in range(4):
        x0 = 2.6 + i * 2.75
        m.box([x0, 12.5, 3.4], [x0 + 2.55, 15.5, 11.2], trim if i % 2 == 0 else gold)
    for i in range(3):
        x = 2.6 + (i + 1) * 2.75
        m.box([x - 0.25, 12.4, 3.2], [x + 0.25, 15.7, 11.4], energy, light=15)
    # thumb across the front
    m.box([3.0, 5.0, 11.8], [11.0, 8.0, 13.6], trim)
    # glowing kinetic core on the back of the hand
    m.box([6.0, 6.0, 2.4], [10.0, 10.0, 3.1], energy, light=15)
    m.box([5.0, 9.6, 2.6], [11.0, 10.2, 3.1], energy, light=12)
    # armoured cuff
    m.box([3.5, -4.0, 3.5], [12.5, 3.0, 11.5], gdark)
    m.box([3.2, 2.0, 3.2], [12.8, 3.2, 11.8], trim)
    m.box([3.2, -4.5, 3.2], [12.8, -3.3, 11.8], trim)
    m.box([6.8, -2.0, 2.9], [9.2, 0.6, 3.5], energy, light=15)
    return m, {
        'thirdperson_righthand': {'rotation': [-90, 0, 0], 'translation': [0, 1.0, -1.5], 'scale': [0.9] * 3},
        'thirdperson_lefthand': {'rotation': [-90, 0, 0], 'translation': [0, 1.0, -1.5], 'scale': [0.9] * 3},
        'firstperson_righthand': {'rotation': [-80, 10, 0], 'translation': [3.0, 1.0, -2.0], 'scale': [0.95] * 3},
        'firstperson_lefthand': {'rotation': [-80, -10, 0], 'translation': [-3.0, 1.0, -2.0], 'scale': [0.95] * 3},
        'head': {'translation': [0, 12, 0], 'scale': [0.8] * 3},
        'gui': {'rotation': [20, 200, 0], 'translation': [0, -1, 0], 'scale': [0.62] * 3},
        'ground': {'translation': [0, 3, 0], 'scale': [0.4] * 3},
        'fixed': {'rotation': [0, 180, 0], 'scale': [0.6] * 3},
    }


def sunforge():
    m = Model('sunforge')
    gold = m.tex('gold', 'gold')
    gem = m.tex('gem', 'sun_gem')
    solar = m.tex('solar', 'solar_energy')
    corona = m.tex('corona', 'corona_energy')
    m.box([7.25, -10.0, 7.25], [8.75, 18.0, 8.75], gold)
    m.box([6.8, -11.0, 6.8], [9.2, -9.5, 9.2], gem, light=12)
    for y in (-3.0, 5.0, 12.0):
        m.box([6.9, y, 6.9], [9.1, y + 1.0, 9.1], gem, light=10)
    m.box([6.0, 17.0, 6.0], [10.0, 19.0, 10.0], gold)
    # golden cage around the star
    for (frm, to, rot) in [
        ([3.6, 18.0, 7.4], [4.6, 30.0, 8.6], {'origin': [4.1, 18, 8], 'z': 8}),
        ([11.4, 18.0, 7.4], [12.4, 30.0, 8.6], {'origin': [11.9, 18, 8], 'z': -8}),
        ([7.4, 18.0, 3.6], [8.6, 30.0, 4.6], {'origin': [8, 18, 4.1], 'x': -8}),
        ([7.4, 18.0, 11.4], [8.6, 30.0, 12.4], {'origin': [8, 18, 11.9], 'x': 8}),
    ]:
        m.box(frm, to, gold, rot=rot)
    m.box([6.5, 30.0, 6.5], [9.5, 31.0, 9.5], gold)
    # the portable star
    m.box([4.5, 20.5, 4.5], [11.5, 27.5, 11.5], solar, light=15, shade=False)
    m.box([4.5, 20.5, 4.5], [11.5, 27.5, 11.5], solar, rot={'origin': [8, 24, 8], 'y': 45}, light=15, shade=False)
    m.box([4.9, 20.9, 4.9], [11.1, 27.1, 11.1], solar, rot={'origin': [8, 24, 8], 'x': 45}, light=15, shade=False)
    # corona flares
    for ang in (0, 60, 120, 180, 240, 300):
        rad = math.radians(ang)
        x = 8 + math.cos(rad) * 4.6
        z = 8 + math.sin(rad) * 4.6
        m.box([x - 0.4, 22.5, z - 0.4], [x + 0.4, 25.5, z + 0.4], corona, rot={'origin': [x, 24, z], 'y': -ang, 'z': 35}, light=15, shade=False)
    return m, handheld_display(tp_scale=0.9, fp_scale=0.75)


def planet_cracker():
    m = Model('planet_cracker')
    steel = m.tex('steel', 'steel_dark')
    plate = m.tex('plate', 'steel')
    energy = m.tex('energy', 'cracker_energy')
    warn = m.tex('warn', 'warning_light')
    # heavy barrel
    m.box([4.5, -4.0, 4.5], [11.5, 26.0, 11.5], steel)
    m.box([4.2, -4.0, 6.5], [4.6, 24.0, 9.5], plate)
    m.box([11.4, -4.0, 6.5], [11.8, 24.0, 9.5], plate)
    for y in (2.0, 8.0, 14.0, 20.0):
        m.box([3.8, y, 3.8], [12.2, y + 1.6, 12.2], energy, light=15)
    m.box([7.2, -2.0, 4.2], [8.8, 24.0, 4.6], energy, light=15)
    # muzzle and its glowing aperture
    m.box([3.2, 26.0, 3.2], [12.8, 30.0, 12.8], steel)
    m.box([5.2, 29.6, 5.2], [10.8, 30.4, 10.8], energy, light=15, shade=False)
    # power pack, warning lights and handles
    m.box([3.8, -12.0, 3.8], [12.2, -4.0, 12.2], plate)
    m.box([4.4, -9.0, 3.4], [6.0, -7.4, 3.9], warn, light=15)
    m.box([10.0, -9.0, 3.4], [11.6, -7.4, 3.9], warn, light=15)
    m.box([6.0, -12.6, 6.0], [10.0, -12.0, 10.0], energy, light=15)
    m.box([7.0, 4.0, 11.5], [9.0, 12.0, 14.0], steel)
    m.box([7.0, -2.0, 0.5], [9.0, 3.0, 4.6], steel, rot={'origin': [8, 0.5, 4.6], 'x': -18})
    return m, gun_display(tp_scale=0.9, fp_scale=0.85, fp_translate=(2.5, -2.0, -2.0))


def starfall_bow(pull):
    """pull: -1 = idle, 0..2 = drawing stages."""
    m = Model('starfall_bow' if pull < 0 else 'starfall_bow_pulling_%d' % pull)
    limb = m.tex('limb', 'midnight')
    gold = m.tex('gold', 'gold')
    star = m.tex('star', 'starlight')
    gem = m.tex('gem', 'star_gem')
    # bow arc in the XY plane (sprite orientation): tips at top-left and bottom-right
    t1 = (2.5, 14.5)
    t2 = (14.5, 2.5)
    apex = (12.0, 12.0)
    ax, ay = t1
    bx, by = apex
    cx, cy = t2
    d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by))
    ux = ((ax * ax + ay * ay) * (by - cy) + (bx * bx + by * by) * (cy - ay) + (cx * cx + cy * cy) * (ay - by)) / d
    uy = ((ax * ax + ay * ay) * (cx - bx) + (bx * bx + by * by) * (ax - cx) + (cx * cx + cy * cy) * (bx - ax)) / d
    rad = math.hypot(ax - ux, ay - uy)
    a1 = math.atan2(ay - uy, ax - ux)
    a2 = math.atan2(cy - uy, cx - ux)
    if a2 < a1:
        a1, a2 = a2, a1
    if a2 - a1 > math.pi:
        a1, a2 = a2, a1 + 2 * math.pi
    segs = 9
    for i in range(segs):
        s0 = a1 + (a2 - a1) * i / segs
        s1 = a1 + (a2 - a1) * (i + 1) / segs
        mx = ux + math.cos((s0 + s1) / 2) * rad
        my = uy + math.sin((s0 + s1) / 2) * rad
        length = 2 * rad * math.sin((s1 - s0) / 2) + 0.25
        thick = 1.0 + 0.9 * math.sin(math.pi * (i + 0.5) / segs)
        ang = math.degrees((s0 + s1) / 2) + 90
        m.box([mx - length / 2, my - thick / 2, 7.2], [mx + length / 2, my + thick / 2, 8.8], limb, rot={'origin': [mx, my, 8], 'z': round(ang, 2)})
        # gold trim on the outer edge
        ox = ux + math.cos((s0 + s1) / 2) * (rad + thick / 2)
        oy = uy + math.sin((s0 + s1) / 2) * (rad + thick / 2)
        m.box([ox - length / 2, oy - 0.2, 7.5], [ox + length / 2, oy + 0.25, 8.5], gold, rot={'origin': [ox, oy, 8], 'z': round(ang, 2)})
    # star gems at the tips and the grip
    for (x, y, s) in [(t1[0], t1[1], 0.9), (t2[0], t2[1], 0.9), (apex[0], apex[1], 1.4)]:
        m.box([x - s, y - s, 8 - s], [x + s, y + s, 8 + s], gem, rot={'origin': [x, y, 8], 'z': 45, 'y': 45}, light=15)
    # string (bent toward the archer while drawing)
    pulls = [0.0, 1.6, 2.8, 3.8]
    p = pulls[pull + 1]
    mx, my = (t1[0] + t2[0]) / 2, (t1[1] + t2[1]) / 2
    px, py = mx - p * 0.7071, my - p * 0.7071
    for (sx, sy, ex, ey) in [(t1[0], t1[1], px, py), (px, py, t2[0], t2[1])]:
        length = math.hypot(ex - sx, ey - sy)
        ang = math.degrees(math.atan2(ey - sy, ex - sx))
        cxm, cym = (sx + ex) / 2, (sy + ey) / 2
        m.box([cxm - length / 2, cym - 0.15, 7.85], [cxm + length / 2, cym + 0.15, 8.15], star, rot={'origin': [cxm, cym, 8], 'z': round(ang, 2)}, light=15, shade=False)
    if pull >= 0:
        # a nocked miniature star, ready to fly
        hx, hy = px + 9.0 * 0.7071, py + 9.0 * 0.7071
        length = 9.0
        cxm, cym = (px + hx) / 2, (py + hy) / 2
        m.box([cxm - length / 2, cym - 0.25, 7.75], [cxm + length / 2, cym + 0.25, 8.25], star, rot={'origin': [cxm, cym, 8], 'z': 45}, light=15, shade=False)
        s = 0.9 + pull * 0.35
        m.box([hx - s, hy - s, 8 - s], [hx + s, hy + s, 8 + s], gem, rot={'origin': [hx, hy, 8], 'z': 45, 'x': 45}, light=15, shade=False)
    display = {
        'thirdperson_righthand': {'rotation': [-80, 260, -40], 'translation': [-1, -2, 2.5], 'scale': [1.1] * 3},
        'thirdperson_lefthand': {'rotation': [-80, -280, 40], 'translation': [-1, -2, 2.5], 'scale': [1.1] * 3},
        'firstperson_righthand': {'rotation': [0, -90, 25], 'translation': [1.13, 3.2, 1.13], 'scale': [0.9] * 3},
        'firstperson_lefthand': {'rotation': [0, 90, -25], 'translation': [1.13, 3.2, 1.13], 'scale': [0.9] * 3},
        'gui': {'rotation': [0, 0, 0], 'scale': [1.0] * 3},
        'ground': {'translation': [0, 2, 0], 'scale': [0.5] * 3},
        'fixed': {'rotation': [0, 180, 0], 'scale': [1.0] * 3},
    }
    return m, display


# ============================================================== item definitions

def icon_model(name, texture):
    write_json('models/item/%s_icon.json' % name, {'parent': 'minecraft:item/generated', 'textures': {'layer0': 'godforge:item/' + texture}})


def item_def(name, hand_model, tints=None, using_model=None):
    hand = {'type': 'minecraft:model', 'model': 'godforge:item/' + hand_model}
    if tints:
        hand['tints'] = tints
    if using_model:
        hand = using_model
    data = {
        'model': {
            'type': 'minecraft:select',
            'property': 'minecraft:display_context',
            'cases': [
                {'when': ['gui', 'ground', 'fixed', 'on_shelf'], 'model': {'type': 'minecraft:model', 'model': 'godforge:item/%s_icon' % name}}
            ],
            'fallback': hand,
        },
        'hand_animation_on_swap': True,
    }
    write_json('items/%s.json' % name, data)


def main():
    materials()
    builders = {
        'worldcutter': worldcutter,
        'laser_beam': laser_beam,
        'orb_eraser': orb_eraser,
        'asteroid_gun': asteroid_gun,
        'black_hole': black_hole,
        'reality_breaker': reality_breaker,
        'godfist': godfist,
        'sunforge': sunforge,
        'planet_cracker': planet_cracker,
    }
    for name, fn in builders.items():
        model, display = fn()
        write_json('models/item/%s.json' % name, model.json(display))
        icon_model(name, name)
        tints = [{'type': 'minecraft:custom_model_data', 'index': 0, 'default': -1}] if name == 'laser_beam' else None
        item_def(name, name, tints=tints)
    # starfall bow: idle + three draw stages, chosen by use duration like the vanilla bow
    for pull in range(-1, 3):
        model, display = starfall_bow(pull)
        write_json('models/item/%s.json' % model.name, model.json(display))
    icon_model('starfall_bow', 'starfall_bow')
    bow_hand = {
        'type': 'minecraft:condition',
        'property': 'minecraft:using_item',
        'on_false': {'type': 'minecraft:model', 'model': 'godforge:item/starfall_bow'},
        'on_true': {
            'type': 'minecraft:range_dispatch',
            'property': 'minecraft:use_duration',
            'scale': 0.05,
            'entries': [
                {'threshold': 0.65, 'model': {'type': 'minecraft:model', 'model': 'godforge:item/starfall_bow_pulling_1'}},
                {'threshold': 0.9, 'model': {'type': 'minecraft:model', 'model': 'godforge:item/starfall_bow_pulling_2'}},
            ],
            'fallback': {'type': 'minecraft:model', 'model': 'godforge:item/starfall_bow_pulling_0'},
        },
    }
    item_def('starfall_bow', 'starfall_bow', using_model=bow_hand)
    # divine core: a plain generated item
    write_json('models/item/divine_core.json', {'parent': 'minecraft:item/generated', 'textures': {'layer0': 'godforge:item/divine_core'}})
    write_json('items/divine_core.json', {'model': {'type': 'minecraft:model', 'model': 'godforge:item/divine_core'}})
    print('models written')


if __name__ == '__main__':
    main()
