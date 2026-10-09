#!/usr/bin/env python3
"""Packs the 3D models used by "Vice City" into one JS module.

The models are CC0 kits by Kenney (https://kenney.nl): the Car Kit, the
Watercraft Kit and a few palms from the Nature Kit. Each model's colours are
baked from its palette texture (or material colour) into vertex colours, the
wheels are kept as separate parts with their pivots, everything else is merged
into one body. Positions are quantized to 16 bits, normals to 8, and the lot
is zlib-compressed and written as base64 to
public/js/places/vice/assets/modeldata.js (decoded by assets/models.js).

Usage: python3 tools/pack-vice-models.py CARKIT_GLB_DIR BOATS_GLB_DIR NATURE_GLB_DIR
"""
import base64
import json
import math
import os
import struct
import sys
import zlib

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'public', 'js', 'places', 'vice', 'assets', 'modeldata.js')

CARS = ['sedan', 'sedan-sports', 'hatchback-sports', 'suv', 'suv-luxury', 'taxi', 'police', 'ambulance',
        'firetruck', 'garbage-truck', 'delivery', 'delivery-flat', 'van', 'truck', 'truck-flat', 'race',
        'race-future', 'tractor', 'cone', 'box', 'debris-bumper', 'debris-door', 'debris-door-window',
        'debris-tire', 'debris-plate-a', 'debris-plate-b', 'debris-spoiler-a', 'debris-drivetrain']
BOATS = ['boat-speed-a', 'boat-speed-c', 'boat-speed-e', 'boat-speed-g', 'boat-speed-i', 'boat-speed-j',
         'boat-fishing-small', 'boat-tug-a', 'boat-sail-a', 'boat-sail-b', 'boat-row-small', 'boat-house-a',
         'buoy', 'buoy-flag', 'cargo-container-a', 'cargo-container-b', 'cargo-container-c',
         'ship-cargo-a', 'ship-cargo-b', 'ship-ocean-liner']
PALMS = ['tree_palmDetailedTall', 'tree_palmTall', 'tree_palmBend', 'tree_palmShort', 'tree_palmDetailedShort']

CTYPES = {5120: ('b', 1), 5121: ('B', 1), 5122: ('h', 2), 5123: ('H', 2), 5125: ('I', 4), 5126: ('f', 4)}
NCOMP = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}


def read_glb(path):
    b = open(path, 'rb').read()
    jlen = struct.unpack_from('<I', b, 12)[0]
    j = json.loads(b[20:20 + jlen])
    off = 20 + jlen
    blen = struct.unpack_from('<I', b, off)[0]
    return j, b[off + 8: off + 8 + blen]


def accessor(j, bin_, i):
    a = j['accessors'][i]
    bv = j['bufferViews'][a['bufferView']]
    fmt, size = CTYPES[a['componentType']]
    n = NCOMP[a['type']]
    stride = bv.get('byteStride', size * n)
    base = bv.get('byteOffset', 0) + a.get('byteOffset', 0)
    out = []
    for k in range(a['count']):
        vals = struct.unpack_from('<' + fmt * n, bin_, base + k * stride)
        out.append(vals if n > 1 else vals[0])
    return out


def qmul(a, b):
    ax, ay, az, aw = a; bx, by, bz, bw = b
    return (aw * bx + ax * bw + ay * bz - az * by, aw * by - ax * bz + ay * bw + az * bx,
            aw * bz + ax * by - ay * bx + az * bw, aw * bw - ax * bx - ay * by - az * bz)


def qrot(q, v):
    x, y, z, w = q
    vx, vy, vz = v
    tx = 2 * (y * vz - z * vy); ty = 2 * (z * vx - x * vz); tz = 2 * (x * vy - y * vx)
    return (vx + w * tx + (y * tz - z * ty), vy + w * ty + (z * tx - x * tz), vz + w * tz + (x * ty - y * tx))


def srgb_tex(j, path):
    imgs = j.get('images') or []
    if not imgs:
        return None
    p = os.path.join(os.path.dirname(path), imgs[0]['uri'])
    return Image.open(p).convert('RGB')


def mat_color(j, prim):
    m = j['materials'][prim['material']] if 'material' in prim else {}
    f = m.get('pbrMetallicRoughness', {}).get('baseColorFactor', [1, 1, 1, 1])
    # (factors are linear; store as sRGB bytes like the textures)
    def to_srgb(c):
        return 12.92 * c if c <= 0.0031308 else 1.055 * c ** (1 / 2.4) - 0.055
    return tuple(int(round(max(0, min(1, to_srgb(c))) * 255)) for c in f[:3])


def load_model(path):
    j, bin_ = read_glb(path)
    tex = srgb_tex(j, path)
    parts = {}  # name -> dict(pivot, pos, nor, col, idx)

    def add(name, pivot, pos, nor, col, idx):
        p = parts.setdefault(name, {'pivot': pivot, 'pos': [], 'nor': [], 'col': [], 'idx': []})
        base = len(p['pos'])
        p['pos'] += pos; p['nor'] += nor; p['col'] += col
        p['idx'] += [base + i for i in idx]

    def walk(ni, t, q, s, wheel=None):
        n = j['nodes'][ni]
        lt = n.get('translation', [0, 0, 0]); lq = n.get('rotation', [0, 0, 0, 1]); ls = n.get('scale', [1, 1, 1])
        if 'matrix' in n:
            raise SystemExit('matrix nodes not supported: ' + path)
        st = qrot(q, (lt[0] * s[0], lt[1] * s[1], lt[2] * s[2]))
        wt = (t[0] + st[0], t[1] + st[1], t[2] + st[2])
        wq = qmul(q, lq)
        ws = (s[0] * ls[0], s[1] * ls[1], s[2] * ls[2])
        name = n.get('name', '')
        if wheel is None and name.startswith('wheel'):
            wheel = (name, wt)
        if 'mesh' in n:
            for prim in j['meshes'][n['mesh']]['primitives']:
                A = prim['attributes']
                pos = accessor(j, bin_, A['POSITION'])
                nor = accessor(j, bin_, A['NORMAL']) if 'NORMAL' in A else [(0, 1, 0)] * len(pos)
                uv = accessor(j, bin_, A['TEXCOORD_0']) if ('TEXCOORD_0' in A and tex) else None
                idx = accessor(j, bin_, prim['indices']) if 'indices' in prim else list(range(len(pos)))
                mc = mat_color(j, prim)
                P, N, C = [], [], []
                for k, v in enumerate(pos):
                    w = qrot(wq, (v[0] * ws[0], v[1] * ws[1], v[2] * ws[2]))
                    w = (w[0] + wt[0], w[1] + wt[1], w[2] + wt[2])
                    if wheel:
                        w = (w[0] - wheel[1][0], w[1] - wheel[1][1], w[2] - wheel[1][2])
                    P.append(w)
                    nn = qrot(wq, nor[k]); l = math.sqrt(sum(c * c for c in nn)) or 1
                    N.append(tuple(c / l for c in nn))
                    if uv:
                        u, vv = uv[k]
                        px = tex.getpixel((min(tex.width - 1, max(0, int(u % 1.0001 * tex.width))), min(tex.height - 1, max(0, int(vv % 1.0001 * tex.height)))))
                        C.append(tuple(int(px[c] * mc[c] / 255) for c in range(3)))
                    else:
                        C.append(mc)
                add(wheel[0] if wheel else 'body', wheel[1] if wheel else (0, 0, 0), P, N, C, idx)
        for c in n.get('children', []):
            walk(c, wt, wq, ws, wheel)

    for r in j['scenes'][j.get('scene', 0)]['nodes']:
        walk(r, (0, 0, 0), (0, 0, 0, 1), (1, 1, 1))
    return parts


def pack(name, parts, blob):
    allp = [v for p in parts.values() for v in p['pos']]
    mn = [min(v[i] for v in allp) for i in range(3)]
    mx = [max(v[i] for v in allp) for i in range(3)]
    # quantize over a box centred on 0 that holds every part (wheels are relative to their pivots)
    ext = max(max(abs(c) for c in mn), max(abs(c) for c in mx)) or 1
    q = 32767 / ext
    out = {'min': [round(c, 4) for c in mn], 'max': [round(c, 4) for c in mx], 'scale': ext / 32767, 'parts': []}
    for pname, p in parts.items():
        n = len(p['pos']); m = len(p['idx'])
        big = n > 65535
        rec = {'name': pname, 'pivot': [round(c, 4) for c in p['pivot']], 'n': n, 'm': m, 'off': len(blob), 'i32': big}
        for v in p['pos']:
            blob += struct.pack('<hhh', *[max(-32767, min(32767, int(round(c * q)))) for c in v])
        for v in p['nor']:
            blob += struct.pack('<bbb', *[max(-127, min(127, int(round(c * 127)))) for c in v])
        for c in p['col']:
            blob += struct.pack('<BBB', *c)
        if len(blob) % 4:
            blob += b'\0' * (4 - len(blob) % 4)
        blob += struct.pack('<' + ('I' if big else 'H') * m, *p['idx'])
        if len(blob) % 4:
            blob += b'\0' * (4 - len(blob) % 4)
        out['parts'].append(rec)
    return out, blob


def main():
    if len(sys.argv) < 4:
        print(__doc__); sys.exit(1)
    cars, boats, nature = sys.argv[1:4]
    manifest, blob = {}, bytearray()
    for d, names in ((cars, CARS), (boats, BOATS), (nature, PALMS)):
        for nm in names:
            parts = load_model(os.path.join(d, nm + '.glb'))
            manifest[nm], blob = pack(nm, parts, blob)
            nv = sum(p['n'] for p in manifest[nm]['parts'])
            print(f'{nm:24s} parts {len(parts):2d} verts {nv:6d}')
    raw = bytes(blob)
    z = zlib.compress(raw, 9)
    with open(OUT, 'w') as f:
        f.write('// generated by tools/pack-vice-models.py - do not edit.\n')
        f.write('// Models: CC0 kits by Kenney (kenney.nl) - Car Kit, Watercraft Kit, Nature Kit (palms).\n')
        f.write('// Model space: +Y up, front towards +Z, Kenney units. Wheels are parts with pivots.\n')
        f.write('export const MODELS = ' + json.dumps(manifest, separators=(',', ':')) + ';\n')
        f.write(f'export const RAW_BYTES = {len(raw)};\n')
        f.write("export const BLOB = '" + base64.b64encode(z).decode() + "';\n")
    print(f'raw {len(raw)/1024:.0f} KB, deflated {len(z)/1024:.0f} KB -> {os.path.relpath(OUT, ROOT)} ({os.path.getsize(OUT)/1024:.0f} KB)')


if __name__ == '__main__':
    main()
