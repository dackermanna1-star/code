"""Find individual leaves in ambientCG atlases (via opacity connected components) -> UV boxes json."""
import json, glob, os, numpy as np
from PIL import Image
from scipy import ndimage
R = '/home/user/code/amazon_short/assets/acg/'
out = {}
for sid in ['LeafSet004', 'LeafSet005', 'LeafSet013', 'LeafSet018', 'LeafSet008', 'LeafSet011', 'LeafSet012', 'LeafSet022', 'LeafSet024', 'LeafSet009', 'LeafSet026']:
    op = np.array(Image.open(f'{R}{sid}/{sid}_2K-PNG_Opacity.png').convert('L')) > 128
    lab, n = ndimage.label(op)
    H, W = op.shape; boxes = []
    for sl in ndimage.find_objects(lab):
        y0, y1, x0, x1 = sl[0].start, sl[0].stop, sl[1].start, sl[1].stop
        if (y1 - y0) * (x1 - x0) < 0.004 * H * W: continue
        # uv: x/W, 1 - y/H ; also leaf orientation (long axis) and petiole end guess (narrow end)
        sub = op[y0:y1, x0:x1]
        boxes.append(dict(u0=x0 / W, u1=x1 / W, v0=1 - y1 / H, v1=1 - y0 / H, w=(x1 - x0) / W, h=(y1 - y0) / H))
    out[sid] = boxes; print(sid, len(boxes), [(round(b['w'], 2), round(b['h'], 2)) for b in boxes])
json.dump(out, open(R + 'leaf_boxes.json', 'w'), indent=1)
