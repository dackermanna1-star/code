"""UV-space part labels for a converted Rocketbox avatar (see rocketbox.mjs): each texel learns which
body part's triangles cover it and how high on the body (m) that part sits.

Usage (as a module): labels(labels_json, size) -> {'body': (part, height, depth), 'head': ..., 'hair': ...}
(height: the covering triangle's mean y; depth: its mean z, + forward)
"""
import json
import numpy as np
from PIL import Image, ImageDraw

PARTS = ['none', 'torso', 'arm', 'hand', 'thigh', 'calf', 'foot', 'head', 'eye', 'mouth', 'hair', 'lash', 'finger']
P = {n: i for i, n in enumerate(PARTS)}


def part_of(bone):
    if bone in ('Bip01', 'Bip01_Pelvis', 'Bip01_Spine', 'Bip01_Spine1', 'Bip01_Spine2', 'Bip01_Neck'):
        return 'torso'
    # (the thumb's first bone sits in the palm: gloved with the hand)
    if 'Finger' in bone:
        return 'hand' if bone.endswith('Finger0') else 'finger'
    for k, v in (('Clavicle', 'arm'), ('UpperArm', 'arm'), ('Forearm', 'arm'), ('Hand', 'hand'),
                 ('Thigh', 'thigh'), ('Calf', 'calf'), ('Foot', 'foot'), ('Toe', 'foot')):
        if k in bone:
            return v
    if 'Eye' in bone and 'Blink' not in bone:
        return 'eye'
    if 'Blink' in bone:
        return 'lash'
    if 'Jaw' in bone or 'Tongue' in bone or 'Bottom' in bone:
        return 'mouth'
    return 'head'


def labels(path, size, sizes=None):
    """size: square rasters; sizes: {'body': (w, h), ...} to override per material (a wide body)."""
    d = json.load(open(path))
    bones = d['bones']
    rb = np.array(d['rb'])
    mat = np.array(d['mat'])
    uv = np.array(d['uv'], dtype=np.float64).reshape(-1, 2)
    pos = np.array(d['pos'], dtype=np.float64).reshape(-1, 3)
    idx = np.array(d['index']).reshape(-1, 3)
    vpart = np.array([P[part_of(bones[b])] for b in rb])
    out = {}
    for m, name in enumerate(['body', 'head', 'hair']):
        W, Hh = (sizes or {}).get(name, (size, size))
        lab = Image.new('L', (W, Hh), 0)
        hgt = Image.new('F', (W, Hh), -1.0)
        dep = Image.new('F', (W, Hh), -1.0)
        dl, dh, dz = ImageDraw.Draw(lab), ImageDraw.Draw(hgt), ImageDraw.Draw(dep)
        for t in idx:
            if mat[t[0]] != m:
                continue
            parts = vpart[t]
            # majority part (the first vertex breaks a three-way tie)
            vals, cnt = np.unique(parts, return_counts=True)
            p = int(vals[np.argmax(cnt)]) if cnt.max() > 1 else int(parts[0])
            if name == 'hair':
                p = P['lash'] if (parts == P['lash']).any() else P['hair']
            pts = [(float(uv[i, 0] * W), float((1 - uv[i, 1]) * Hh)) for i in t]
            dl.polygon(pts, fill=p)
            dh.polygon(pts, fill=float(pos[t, 1].mean()))
            dz.polygon(pts, fill=float(pos[t, 2].mean()))
        L = np.array(lab)
        H = np.array(hgt)
        Z = np.array(dep)
        # grow the islands into their gutters (mip-mapping and filtering read past the edges)
        for _ in range(6):
            empty = L == 0
            for dy, dx in ((0, 1), (0, -1), (1, 0), (-1, 0)):
                sl = np.roll(L, (dy, dx), (0, 1))
                sh = np.roll(H, (dy, dx), (0, 1))
                sz = np.roll(Z, (dy, dx), (0, 1))
                fill = empty & (sl > 0)
                L[fill] = sl[fill]
                H[fill] = sh[fill]
                Z[fill] = sz[fill]
                empty = L == 0
        out[name] = (L, H, Z)
    return out
