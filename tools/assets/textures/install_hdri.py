#!/usr/bin/env python3
"""Copy the fetched Poly Haven .hdr files to public/assets/hdri/<name>_<res>.hdr and make the 4k LDR sky background.
usage: python3 -I tools/assets/textures/install_hdri.py <raw_hdri_dir> <out_dir>"""
import os, shutil, sys
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from sets import HDRIS, SKY_BACKGROUNDS  # noqa: E402

Image.MAX_IMAGE_PIXELS = None
RAW, OUT = sys.argv[1], sys.argv[2]
os.makedirs(OUT, exist_ok=True)
for name, h in HDRIS.items():
    for r in h['res']:
        shutil.copyfile(os.path.join(RAW, f"{h['src']}_{r}.hdr"), os.path.join(OUT, f'{name}_{r}.hdr'))
for name, h in SKY_BACKGROUNDS.items():
    im = Image.open(os.path.join(RAW, f"{h['src']}_tonemapped.jpg")).convert('RGB')
    im.resize((h['size'], h['size'] // 2), Image.LANCZOS).save(os.path.join(OUT, f'{name}_4k.jpg'), quality=88,
                                                                optimize=True, progressive=True)
print('hdri installed:', sorted(os.listdir(OUT)))
