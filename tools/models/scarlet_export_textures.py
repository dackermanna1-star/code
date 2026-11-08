"""Scarlet's textures for tools/models/export_scarlet.mjs (a glTF of her for use elsewhere).

The colour and normal maps go as they are (JPEG). The game's finish maps (R: the finish code, see
src/character/material.ts - 1 matte .. 0.5 gloss, 0.5..0.25 sheer, below 0.25 metal) become glTF
metallic-roughness maps (G roughness, B metalness; R left white, unused) with the same numbers the
game's shader uses. The hair cards' WebP becomes a PNG (glTF has no WebP without an extension). The
body's finish map is also dumped raw (RGB bytes), for the exporter to read the tights and the jacket
off it per vertex, as the game does.

Usage: python3 -I tools/models/scarlet_export_textures.py <out dir>
"""
import os
import shutil
import sys

import numpy as np
from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
SRC = os.path.join(ROOT, 'src', 'character', 'models', 'scarlet')

# the game's characters' base roughness (CharacterLibrary.surface) and its shader's finish mapping
BASE_ROUGH = 0.82


def orm(finish_png):
    f = np.asarray(Image.open(finish_png).convert('RGB')).astype(np.float32) / 255.0
    ma = f[..., 0]
    gloss = np.where(ma >= 0.5, (1.0 - ma) * 2.0, 0.0)
    sheer = np.where((ma >= 0.25) & (ma < 0.5), (0.5 - ma) * 4.0, 0.0)
    metal = np.where(ma < 0.25, 1.0 - ma * 4.0, 0.0)
    r = np.full(ma.shape, BASE_ROUGH, np.float32)
    r = r + (0.2 - r) * gloss
    r = r + (0.4 - r) * sheer
    r = r + (0.3 - r) * metal
    out = np.stack([np.ones_like(r), r, metal], -1)
    return Image.fromarray((np.clip(out, 0, 1) * 255 + 0.5).astype(np.uint8), 'RGB')


def main():
    out = sys.argv[1]
    os.makedirs(out, exist_ok=True)
    for n in ('body.jpg', 'body_n.jpg', 'head.jpg', 'head_n.jpg'):
        shutil.copyfile(os.path.join(SRC, n), os.path.join(out, n))
    orm(os.path.join(SRC, 'body_f.png')).save(os.path.join(out, 'body_orm.png'), optimize=True)
    orm(os.path.join(SRC, 'head_f.png')).save(os.path.join(out, 'head_orm.png'), optimize=True)
    Image.open(os.path.join(SRC, 'hair.webp')).convert('RGBA').save(os.path.join(out, 'hair.png'), optimize=True)
    f = Image.open(os.path.join(SRC, 'body_f.png')).convert('RGB')
    with open(os.path.join(out, 'body_f.rgb'), 'wb') as fh:
        fh.write(f'{f.width} {f.height}\n'.encode())
        fh.write(f.tobytes())
    print('textures ->', out)


if __name__ == '__main__':
    main()
