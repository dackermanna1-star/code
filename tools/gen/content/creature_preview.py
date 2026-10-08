"""Offline creature preview (module C dev tool): software-rasterises generated creature geometry + texture.

    cd tools && python3 -m gen.content.creature_preview [dim_id ...] [--out /path/sheet.png] [--pose walk]

Renders every creature of the given dimensions (default: all) from a 3/4 front view into a contact sheet, using
the exact geometry/UV/texture the game uses, so anatomy and painting can be iterated without launching Minecraft.
"""
from __future__ import annotations

import argparse
import math
import os
import sys

import numpy as np
from PIL import Image, ImageDraw

from .creature_geo import FACES, all_cubes, part_matrix

FACE_BASIS = {
    # face: (origin(x0,y0,z0,w,h,d) -> corner, du, dv)
    "top": (lambda x0, y0, z0, w, h, d: (x0, y0, z0 + d), (1, 0, 0), (0, 0, -1)),
    "bottom": (lambda x0, y0, z0, w, h, d: (x0, y0 + h, z0 + d), (1, 0, 0), (0, 0, -1)),
    "west": (lambda x0, y0, z0, w, h, d: (x0, y0, z0 + d), (0, 0, -1), (0, 1, 0)),
    "east": (lambda x0, y0, z0, w, h, d: (x0 + w, y0, z0), (0, 0, 1), (0, 1, 0)),
    "north": (lambda x0, y0, z0, w, h, d: (x0, y0, z0), (1, 0, 0), (0, 1, 0)),
    "south": (lambda x0, y0, z0, w, h, d: (x0 + w, y0, z0 + d), (-1, 0, 0), (0, 1, 0)),
}
NORMALS = {"top": (0, -1, 0), "bottom": (0, 1, 0), "west": (-1, 0, 0), "east": (1, 0, 0), "north": (0, 0, -1), "south": (0, 0, 1)}


def _pose(root, pose, t):
    """Apply a crude version of the client animation hints (for previews of walk/flap poses)."""
    import copy
    if pose == "rest":
        return
    for p in root.walk():
        rx, ry, rz = p.rot
        px, py, pz = p.pivot
        for a in p.anims:
            k, ax, amp, ph = a["kind"], a["axis"], a["amp"], a["phase"]
            val = 0.0
            if k in ("leg", "arm"):
                val = math.cos(t * 0.6662 + ph) * amp * 0.8
            elif k in ("wing",):
                val = math.sin(t * 3 + ph) * amp
            elif k in ("tail", "segment", "tentacle", "sway", "swim"):
                val = math.sin(t + ph) * amp
            if ax == "x":
                rx += val
            elif ax == "y":
                ry += val
            else:
                rz += val
        p.rot = (rx, ry, rz)


def render(root, tex, size_px=360, yaw=-35.0, pitch=22.0, bg=(40, 44, 52)):
    texa = np.asarray(tex.convert("RGBA"))
    cy, sy = math.cos(math.radians(yaw)), math.sin(math.radians(yaw))
    cp, sp = math.cos(math.radians(pitch)), math.sin(math.radians(pitch))
    # world = (x, -y, -z) for a creature facing +z world (toward the camera at yaw 0)
    def to_cam(P):
        X, Y, Z = P[..., 0], -P[..., 1], -P[..., 2]
        # rotate around world Y by yaw, then tilt by pitch
        x1 = X * cy + Z * sy
        z1 = -X * sy + Z * cy
        y2 = Y * cp - z1 * sp * -1 * 0 + 0
        y2 = Y * cp + z1 * sp
        z2 = -Y * sp + z1 * cp
        return np.stack([x1, y2, z2], -1)
    quads = []
    allpts = []
    light = np.array([0.35, 0.9, 0.55])
    light /= np.linalg.norm(light)
    for p, c in all_cubes(root):
        if c.uv is None:
            continue
        M = part_matrix(p)
        x0, y0, z0 = c.origin
        w, h, d = c.size
        u0, v0 = c.uv
        rects = {
            "top": (u0 + d, v0, w, d), "bottom": (u0 + d + w, v0, w, d), "west": (u0, v0 + d, d, h),
            "north": (u0 + d, v0 + d, w, h), "east": (u0 + d + w, v0 + d, d, h), "south": (u0 + 2 * d + w, v0 + d, w, h)}
        for face in FACES:
            fu, fv, fw, fh = rects[face]
            if fw <= 0 or fh <= 0:
                continue
            org_fn, du, dv = FACE_BASIS[face]
            org = np.array(org_fn(x0, y0, z0, w, h, d), float)
            du = np.array(du, float)
            dv = np.array(dv, float)
            n_local = np.array(NORMALS[face], float)
            n_world = M[:3, :3] @ n_local
            nw = np.array([n_world[0], -n_world[1], -n_world[2]])
            b = 0.55 + 0.45 * max(0.0, float(nw @ light))
            if face == "bottom":
                b *= 0.85
            I, J = np.meshgrid(np.arange(fw), np.arange(fh))
            corners = []
            for (oi, oj) in ((0, 0), (1, 0), (1, 1), (0, 1)):
                L = org[None, None, :] + (I + oi)[..., None] * du + (J + oj)[..., None] * dv
                Lh = np.concatenate([L, np.ones(L.shape[:-1] + (1,))], -1)
                corners.append((Lh @ M.T)[..., :3])
            C = to_cam(np.stack(corners, 2))  # fh, fw, 4, 3
            for j in range(fh):
                for i in range(fw):
                    col = texa[fv + j, fu + i]
                    if col[3] < 26:
                        continue
                    q = C[j, i]
                    quads.append((q[:, 2].mean(), q[:, :2], (col[:3] * b).astype(int), col[3]))
                    allpts.append(q[:, :2])
    img = Image.new("RGB", (size_px, size_px), bg)
    if not quads:
        return img
    pts = np.concatenate(allpts)
    lo, hi = pts.min(0), pts.max(0)
    span = max(hi - lo) + 1e-6
    sc = (size_px * 0.86) / span
    off = np.array([size_px / 2, size_px / 2]) - (lo + hi) / 2 * np.array([sc, -sc])
    dr = ImageDraw.Draw(img, "RGBA")
    quads.sort(key=lambda q: q[0])
    for _, q, col, a in quads:
        xy = [(float(px * sc + off[0]), float(-py * sc + off[1])) for px, py in q]
        dr.polygon(xy, fill=(int(col[0]), int(col[1]), int(col[2]), int(a)))
    return img


def sheet(items, cols=4, cell=300):
    rows = (len(items) + cols - 1) // cols
    out = Image.new("RGB", (cols * cell, rows * (cell + 18)), (25, 27, 32))
    dr = ImageDraw.Draw(out)
    for k, (label, img) in enumerate(items):
        x, y = (k % cols) * cell, (k // cols) * (cell + 18)
        out.paste(img.resize((cell, cell)), (x, y + 18))
        dr.text((x + 4, y + 3), label, fill=(230, 230, 230))
    return out


def main():
    here = os.path.dirname(os.path.abspath(__file__))
    sys.path.insert(0, os.path.dirname(os.path.dirname(here)))
    ap = argparse.ArgumentParser()
    ap.add_argument("dims", nargs="*")
    ap.add_argument("--out", default="/tmp/creature_sheet.png")
    ap.add_argument("--pose", default="rest")
    ap.add_argument("--yaw", type=float, default=-35)
    ap.add_argument("--pitch", type=float, default=22)
    ap.add_argument("--cols", type=int, default=4)
    ap.add_argument("--only", default="")
    args = ap.parse_args()
    from gen.content import load_dimensions
    from gen.content import creatures as C
    dims, _ = load_dimensions()
    items = []
    only = set(s for s in args.only.split(",") if s)
    for d in dims:
        if args.dims and d.id not in args.dims:
            continue
        for c in d.creatures:
            if only and c.id not in only:
                continue
            root, tex, glow, meta = C.make_model(c)
            _pose(root, args.pose, 1.3)
            img = render(root, tex, yaw=args.yaw, pitch=args.pitch)
            items.append((f"{c.id} [{c.archetype}] {meta['width']:.2f}x{meta['height']:.2f}", img))
    sheet(items, cols=args.cols).save(args.out)
    print(f"wrote {args.out} ({len(items)} creatures)")


if __name__ == "__main__":
    main()
