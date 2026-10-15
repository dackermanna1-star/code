#!/usr/bin/env python3
"""Convert a Rocketbox avatar's TGA texture set into game textures.

usage: python3 prep_textures.py <TexturesDir> <outDir> [--size 1024] [--orm-size 512] [--tint r,g,b]
For every <prefix>_<part>_color.tga (+ _normal / _specular) writes
  <part>_color.jpg  (sRGB albedo)
  <part>_normal.jpg (OpenGL convention, as authored)
  <part>_orm.jpg    (R=AO=1, G=roughness derived from the specular map, B=metal=0)
The alpha-tested hair-card sheet (<prefix>_opacity_color.tga) becomes hair_color.webp (RGBA).
"""
import sys, os, glob, re
import numpy as np
from PIL import Image

src, out = sys.argv[1], sys.argv[2]
def opt(n, d):
    return sys.argv[sys.argv.index(n) + 1] if n in sys.argv else d
SIZE = int(opt('--size', 1024)); ORM = int(opt('--orm-size', 512))
os.makedirs(out, exist_ok=True)

def rough_from_spec(spec):
    # Rocketbox specular maps are grey-scale intensities in ~[0, 0.25].
    r = 0.9 - spec * 2.2
    return np.clip(r, 0.42, 0.92)

parts = {}
for f in glob.glob(os.path.join(src, '*.tga')):
    b = os.path.basename(f)[:-4]
    m = re.match(r'^[a-z]*\d+_(.+?)_(color|normal|specular)(?:_.*)?$', b)
    if not m:
        print('skip', b); continue
    part, kind = m.group(1), m.group(2)
    parts.setdefault(part, {})[kind] = f

for part, k in parts.items():
    name = 'hair' if part == 'opacity' else part
    if 'color' in k:
        im = Image.open(k['color'])
        if name == 'hair':
            im = im.convert('RGBA').resize((SIZE, SIZE), Image.LANCZOS)
            a = np.asarray(im).copy()
            # bleed colour into transparent texels so mip-mapping does not halo
            rgb = a[..., :3].astype(np.float32); al = a[..., 3]
            mask = al > 8
            if mask.any():
                mean = rgb[mask].mean(axis=0)
                rgb[~mask] = mean
            a[..., :3] = rgb.astype(np.uint8)
            Image.fromarray(a, 'RGBA').save(os.path.join(out, 'hair_color.webp'), quality=90, method=6)
        else:
            im.convert('RGB').resize((SIZE, SIZE), Image.LANCZOS).save(os.path.join(out, f'{name}_color.jpg'), quality=88, optimize=True, progressive=False)
    if 'normal' in k and name != 'hair':
        Image.open(k['normal']).convert('RGB').resize((SIZE, SIZE), Image.LANCZOS).save(os.path.join(out, f'{name}_normal.jpg'), quality=92, optimize=True)
    if 'specular' in k and name != 'hair':
        s = np.asarray(Image.open(k['specular']).convert('L').resize((ORM, ORM), Image.LANCZOS)).astype(np.float32) / 255
        r = rough_from_spec(s)
        orm = np.stack([np.ones_like(r), r, np.zeros_like(r)], -1)
        Image.fromarray((orm * 255 + 0.5).astype(np.uint8), 'RGB').save(os.path.join(out, f'{name}_orm.jpg'), quality=90, optimize=True)
    print('part', name, sorted(k))
