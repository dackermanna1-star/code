"""Quick offline preview renderer for hatkit models (dev tool, not needed to build the assets).

Renders the generated model JSON + texture on a Steve-like head with a tiny painter's-algorithm rasterizer so hat
shapes can be iterated on without launching Minecraft.

    python3 -B tools/art/fashion/preview.py top_hat cowboy_hat ... -o /tmp/out.png
"""
import argparse
import json
import math
import os
import sys

from PIL import Image, ImageDraw

sys.path.insert(0, os.path.dirname(__file__))
from lib import ASSETS, apply_rot  # noqa: E402

SHADE = {"up": 1.0, "down": 0.5, "north": 0.8, "south": 0.8, "east": 0.6, "west": 0.6}


def face_quad(frm, to, face):
    """Corners (in uv order: u0v0, u1v0, u1v1, u0v1) of a face in model space."""
    x0, y0, z0 = frm
    x1, y1, z1 = to
    if face == "north":
        return [(x1, y1, z0), (x0, y1, z0), (x0, y0, z0), (x1, y0, z0)]
    if face == "south":
        return [(x0, y1, z1), (x1, y1, z1), (x1, y0, z1), (x0, y0, z1)]
    if face == "west":
        return [(x0, y1, z0), (x0, y1, z1), (x0, y0, z1), (x0, y0, z0)]
    if face == "east":
        return [(x1, y1, z1), (x1, y1, z0), (x1, y0, z0), (x1, y0, z1)]
    if face == "up":
        return [(x0, y1, z0), (x1, y1, z0), (x1, y1, z1), (x0, y1, z1)]
    return [(x0, y0, z1), (x1, y0, z1), (x1, y0, z0), (x0, y0, z0)]


def lerp3(a, b, t):
    return tuple(a[i] + (b[i] - a[i]) * t for i in range(3))


def load_model(item_id):
    with open(os.path.join(ASSETS, "models", "item", "clothing", item_id + ".json")) as f:
        model = json.load(f)
    texs = {}
    for key, ref in model["textures"].items():
        path = ref.split(":", 1)[1]
        img = Image.open(os.path.join(ASSETS, "textures", path + ".png")).convert("RGBA")
        if img.height > img.width:
            img = img.crop((0, 0, img.width, img.width))
        texs["#" + key] = img
    return model, texs


def head_quads():
    """Steve-ish head + hair, in head pixel space."""
    skin = (196, 140, 106, 255)
    hair = (66, 44, 24, 255)
    eye_w = (240, 240, 240, 255)
    eye_b = (70, 60, 160, 255)
    mouth = (120, 70, 50, 255)
    quads = []

    def colour(face, i, j):
        if face == "up":
            return hair
        if j < 2:
            return hair
        if face == "north":
            if j == 4 and i in (1, 6):
                return eye_w
            if j == 4 and i in (2, 5):
                return eye_b
            if j == 6 and 2 <= i <= 5:
                return mouth
        if face in ("east", "west", "south") and j < 3:
            return hair
        return skin

    for face in ("north", "south", "east", "west", "up"):
        q = face_quad((-4, 0, -4), (4, 8, 4), face)
        for j in range(8):
            for i in range(8):
                a = lerp3(lerp3(q[0], q[1], i / 8), lerp3(q[3], q[2], i / 8), j / 8)
                b = lerp3(lerp3(q[0], q[1], (i + 1) / 8), lerp3(q[3], q[2], (i + 1) / 8), j / 8)
                c = lerp3(lerp3(q[0], q[1], (i + 1) / 8), lerp3(q[3], q[2], (i + 1) / 8), (j + 1) / 8)
                d = lerp3(lerp3(q[0], q[1], i / 8), lerp3(q[3], q[2], i / 8), (j + 1) / 8)
                quads.append(([a, b, c, d], colour(face, i, j), face))
    return quads


def model_quads(model, texs, head_space=True):
    disp = model["display"]["head"]
    t = disp["translation"]
    s = disp["scale"][0]
    quads = []
    for el in model["elements"]:
        rot = None
        if "rotation" in el:
            rot = dict(el["rotation"])
        for face, fd in el["faces"].items():
            tex = texs[fd["texture"]]
            u0, v0, u1, v1 = fd["uv"]
            tw, th = tex.size
            iu0, iv0 = int(round(u0 / 16 * tw)), int(round(v0 / 16 * th))
            iu1, iv1 = int(round(u1 / 16 * tw)), int(round(v1 / 16 * th))
            w, h = max(1, iu1 - iu0), max(1, iv1 - iv0)
            q = face_quad(el["from"], el["to"], face)
            px = tex.load()
            for j in range(h):
                for i in range(w):
                    col = px[min(tw - 1, iu0 + i), min(th - 1, iv0 + j)]
                    if col[3] < 26:
                        continue
                    pts = []
                    for (ii, jj) in ((i, j), (i + 1, j), (i + 1, j + 1), (i, j + 1)):
                        p = lerp3(lerp3(q[0], q[1], ii / w), lerp3(q[3], q[2], ii / w), jj / h)
                        p = apply_rot(p, rot) if rot else p
                        if head_space:
                            # model -> head-centre-relative pixels, then to head space (y + 4)
                            p = tuple(0.625 * (t[k] + s * (p[k] - 8)) + (4 if k == 1 else 0) for k in range(3))
                        pts.append(p)
                    quads.append((pts, col, face))
    return quads


def render(quads, yaw, pitch, scale=14, size=(260, 300), centre=(0, 9, 0)):
    img = Image.new("RGBA", size, (150, 190, 230, 255))
    draw = ImageDraw.Draw(img, "RGBA")
    cy, sy = math.cos(math.radians(yaw)), math.sin(math.radians(yaw))
    cp, sp = math.cos(math.radians(pitch)), math.sin(math.radians(pitch))

    def project(p):
        x, y, z = p[0] - centre[0], p[1] - centre[1], p[2] - centre[2]
        # camera looks from -z (front) by default; yaw rotates around y
        x, z = x * cy - z * sy, x * sy + z * cy
        y, z = y * cp + z * sp, z * cp - y * sp
        # screen: viewer's right = wearer's left (-x)
        return (size[0] / 2 - x * scale, size[1] / 2 - y * scale, z)

    prepared = []
    for pts, col, face in quads:
        pp = [project(p) for p in pts]
        depth = sum(p[2] for p in pp) / 4
        # backface cull: signed area (screen space)
        area = 0
        for k in range(4):
            x1, y1 = pp[k][0], pp[k][1]
            x2, y2 = pp[(k + 1) % 4][0], pp[(k + 1) % 4][1]
            area += x1 * y2 - x2 * y1
        if area < 0:
            continue
        f = SHADE[face]
        c = (int(col[0] * f), int(col[1] * f), int(col[2] * f), col[3])
        prepared.append((depth, [(p[0], p[1]) for p in pp], c))
    prepared.sort(key=lambda e: -e[0])
    for _, poly, c in prepared:
        draw.polygon(poly, fill=c)
    return img


# ----------------------------------------------------------------------------------------------- player preview
SKIN = "/home/user/mcref/vanilla/assets/minecraft/textures/entity/player/wide/steve.png"
FACE_REGIONS = {  # face name in this renderer -> box-UV face (see garments.Canvas)
    "up": "top", "down": "bottom", "east": "right", "north": "front", "west": "left", "south": "back",
}


def box_uv(u, v, w, h, d):
    return {
        "top": (u + d, v, w, d), "bottom": (u + d + w, v, w, d), "right": (u, v + d, d, h),
        "front": (u + d, v + d, w, h), "left": (u + d + w, v + d, d, h), "back": (u + 2 * d + w, v + d, w, h),
    }


def textured_box(quads, tex, frm, to, uv, inflate=0.0, mirror=False):
    frm = tuple(frm[i] - inflate for i in range(3))
    to = tuple(to[i] + inflate for i in range(3))
    regions = box_uv(*uv)
    if mirror:
        regions["right"], regions["left"] = regions["left"], regions["right"]
    px = tex.load()
    for face, region in FACE_REGIONS.items():
        rx, ry, rw, rh = regions[region]
        q = face_quad(frm, to, face)
        for j in range(rh):
            for i in range(rw):
                si = rw - 1 - i if mirror else i
                col = px[rx + si, ry + j]
                if col[3] < 26:
                    continue
                pts = []
                for (ii, jj) in ((i, j), (i + 1, j), (i + 1, j + 1), (i, j + 1)):
                    pts.append(lerp3(lerp3(q[0], q[1], ii / rw), lerp3(q[3], q[2], ii / rw), jj / rh))
                quads.append((pts, col, face))


def player_quads(chest=None, legs=None, feet=None, hat=None):
    """Steve + garments. Coordinates: y up from the feet, -z = front, +x = wearer's right."""
    skin = Image.open(SKIN).convert("RGBA")
    quads = []
    parts = {
        "head": ((-4, 24, -4), (4, 32, 4), (0, 0, 8, 8, 8)),
        "body": ((-4, 12, -2), (4, 24, 2), (16, 16, 8, 12, 4)),
        "rarm": ((4, 12, -2), (8, 24, 2), (40, 16, 4, 12, 4)),
        "larm": ((-8, 12, -2), (-4, 24, 2), (32, 48, 4, 12, 4)),
        "rleg": ((0, 0, -2), (4, 12, 2), (0, 16, 4, 12, 4)),
        "lleg": ((-4, 0, -2), (0, 12, 2), (16, 48, 4, 12, 4)),
    }
    for name, (frm, to, uv) in parts.items():
        textured_box(quads, skin, frm, to, uv)

    def eq(tex_path):
        return Image.open(tex_path).convert("RGBA")

    base = os.path.join(ASSETS, "textures", "entity", "equipment")
    if chest:
        for tex_name in chest:
            t = eq(os.path.join(base, "humanoid", tex_name + ".png"))
            textured_box(quads, t, *parts["body"][:2], (16, 16, 8, 12, 4), inflate=1.0)
            textured_box(quads, t, *parts["rarm"][:2], (40, 16, 4, 12, 4), inflate=1.0)
            textured_box(quads, t, *parts["larm"][:2], (40, 16, 4, 12, 4), inflate=1.0, mirror=True)
    if legs:
        t = eq(os.path.join(base, "humanoid_leggings", legs + ".png"))
        textured_box(quads, t, *parts["body"][:2], (16, 16, 8, 12, 4), inflate=0.5)
        textured_box(quads, t, *parts["rleg"][:2], (0, 16, 4, 12, 4), inflate=0.4)
        textured_box(quads, t, *parts["lleg"][:2], (0, 16, 4, 12, 4), inflate=0.4, mirror=True)
    if feet:
        t = eq(os.path.join(base, "humanoid", feet + ".png"))
        textured_box(quads, t, *parts["rleg"][:2], (0, 16, 4, 12, 4), inflate=0.9)
        textured_box(quads, t, *parts["lleg"][:2], (0, 16, 4, 12, 4), inflate=0.9, mirror=True)
    if hat:
        model, texs = load_model(hat)
        for pts, col, face in model_quads(model, texs):
            quads.append(([(p[0], p[1] + 24, p[2]) for p in pts], col, face))
    return quads


def outfit_sheet(outfits, out, views=((0, 8), (35, 15), (160, 10))):
    tiles = []
    for o in outfits:
        quads = player_quads(**o)
        tiles.append([render(quads, yaw, pitch, scale=7, size=(230, 300), centre=(0, 18, 0)) for yaw, pitch in views])
    w, h = tiles[0][0].size
    sheet = Image.new("RGBA", (w * len(views), h * len(tiles)), (0, 0, 0, 255))
    for r, row in enumerate(tiles):
        for c, im in enumerate(row):
            sheet.paste(im, (c * w, r * h))
    sheet.save(out)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("ids", nargs="+")
    ap.add_argument("-o", "--out", required=True)
    args = ap.parse_args()
    views = [(0, 10), (35, 20), (90, 5), (160, 15)]
    tiles = []
    for item_id in args.ids:
        model, texs = load_model(item_id)
        quads = head_quads() + model_quads(model, texs)
        row = [render(quads, yaw, pitch) for yaw, pitch in views]
        tiles.append(row)
    w, h = tiles[0][0].size
    sheet = Image.new("RGBA", (w * len(views), h * len(tiles)), (0, 0, 0, 255))
    for r, row in enumerate(tiles):
        for c, im in enumerate(row):
            sheet.paste(im, (c * w, r * h))
    sheet.save(args.out)


if __name__ == "__main__":
    main()
