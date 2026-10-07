"""A tiny "box modeller" for wearable 3D item models.

Hats are described in HEAD PIXEL coordinates: the wearer's head is the cube x,z in [-4, 4], y in [0, 8]
(y = 0 at the neck, 8 = top of the head). -z is the face (north), +x is the wearer's right.
One unit = one skin pixel, so hats match the texel density of player skins.

Each box gets a *painter* (a function of the 3D point being painted) instead of a hand-made texture. The builder
unwraps every face into its own texture rect (1 texel per pixel by default), packs the rects into a square texture
and writes both the PNG and the item model JSON (elements + UVs + display transforms).

Head display transform maths (verified against CustomHeadLayer / ItemTransform in 1.21.11): a model point m (0..16
space) ends up at head-centre-relative pixel p = 0.625 * (T + s * (m - 8)). With s = 1.6, one model unit = one head
pixel and T = 1.6 * (8 - off - c) maps head point h to model point m = h + off (c = head centre (0, 4, 0)).
"""
import math

from PIL import Image

from lib import NS, apply_rot, r4, write_json, write_png

HEAD_SCALE = 1.6
FACES = ("north", "south", "east", "west", "up", "down")


class Texel:
    """Context handed to painters: which face/texel is painted and where it sits in head space."""
    __slots__ = ("box", "face", "i", "j", "w", "h", "x", "y", "z", "fu", "fv")

    def edge(self, n=1):
        """True if the texel is within n texels of the face border."""
        return self.i < n or self.j < n or self.i >= self.w - n or self.j >= self.h - n

    @property
    def side(self):
        return self.face in ("north", "south", "east", "west")


class Box:
    def __init__(self, frm, to, paint, faces=FACES, rot=None, density=1.0, shade=True, name=""):
        self.frm = tuple(float(v) for v in frm)
        self.to = tuple(float(v) for v in to)
        for a, b in zip(self.frm, self.to):
            if b < a:
                raise ValueError("box %s has from > to" % name)
        self.paint = paint
        self.faces = faces
        self.rot = rot
        self.density = density
        self.shade = shade
        self.name = name

    def face_size(self, face):
        dx, dy, dz = (self.to[i] - self.frm[i] for i in range(3))
        if face in ("north", "south"):
            return dx, dy
        if face in ("east", "west"):
            return dz, dy
        return dx, dz

    def texels(self, face):
        fw, fh = self.face_size(face)
        return max(1, int(round(fw * self.density))), max(1, int(round(fh * self.density)))

    def point(self, face, fu, fv):
        """Head-space point (pre-rotation) for face-relative fractions fu (along u) and fv (along v)."""
        (x0, y0, z0), (x1, y1, z1) = self.frm, self.to
        y_side = y1 - fv * (y1 - y0)
        if face == "north":
            return x1 - fu * (x1 - x0), y_side, z0
        if face == "south":
            return x0 + fu * (x1 - x0), y_side, z1
        if face == "west":
            return x0, y_side, z0 + fu * (z1 - z0)
        if face == "east":
            return x1, y_side, z1 - fu * (z1 - z0)
        if face == "up":
            return x0 + fu * (x1 - x0), y1, z0 + fv * (z1 - z0)
        return x0 + fu * (x1 - x0), y0, z1 - fv * (z1 - z0)

    def corners(self):
        out = []
        for x in (self.frm[0], self.to[0]):
            for y in (self.frm[1], self.to[1]):
                for z in (self.frm[2], self.to[2]):
                    out.append(apply_rot((x, y, z), self.rot))
        return out


def mirror_x(box, paint=None, name=None):
    """Mirror a box across x = 0 (rotations about y/z flip sign)."""
    frm = (-box.to[0], box.frm[1], box.frm[2])
    to = (-box.frm[0], box.to[1], box.to[2])
    rot = None
    if box.rot:
        rot = dict(box.rot)
        o = rot["origin"]
        rot["origin"] = (-o[0], o[1], o[2])
        if "axis" in rot:
            if rot["axis"] in ("y", "z"):
                rot["angle"] = -rot["angle"]
        else:
            rot["y"] = -rot.get("y", 0)
            rot["z"] = -rot.get("z", 0)
    return Box(frm, to, paint or box.paint, faces=box.faces, rot=rot, density=box.density, shade=box.shade,
               name=name or (box.name + "_mirror"))


def _pack(rects, size):
    """Shelf-pack (w, h) rects into size x size. Returns positions or None if they do not fit."""
    order = sorted(range(len(rects)), key=lambda k: (-rects[k][1], -rects[k][0]))
    pos = [None] * len(rects)
    x = y = shelf = 0
    for k in order:
        w, h = rects[k]
        if w > size:
            return None
        if x + w > size:
            x, y, shelf = 0, y + shelf, 0
        if y + h > size:
            return None
        pos[k] = (x, y)
        x += w
        shelf = max(shelf, h)
    return pos


class Hat:
    def __init__(self, item_id, boxes, extra_textures=None, gui_rot=(30, 200, 0), frames=1, frametime=None):
        """
        extra_textures: {key: (PIL image, mcmeta or None)} for boxes whose painter is the string "#key"
        (those faces are mapped with full 0..16 UVs onto that separate texture, e.g. an animated propeller).
        frames: >1 renders the painted skin this many times (painters see Texel.frame) for an animated skin.
        """
        self.id = item_id
        self.boxes = boxes
        self.extra = extra_textures or {}
        self.gui_rot = gui_rot
        self.frames = frames
        self.frametime = frametime

    # ------------------------------------------------------------------ bounds & transforms
    def bounds(self):
        pts = [p for b in self.boxes for p in b.corners()]
        lo = tuple(min(p[i] for p in pts) for i in range(3))
        hi = tuple(max(p[i] for p in pts) for i in range(3))
        return lo, hi

    def offset(self):
        lo, hi = self.bounds()
        return tuple(8 - (lo[i] + hi[i]) / 2 for i in range(3))

    def display(self):
        lo, hi = self.bounds()
        off = self.offset()
        ext = max(hi[i] - lo[i] for i in range(3))
        centre = (0.0, 4.0, 0.0)
        head_t = [r4(HEAD_SCALE * (8 - off[i] - centre[i])) for i in range(3)]
        for v in head_t:
            if abs(v) > 80:
                raise ValueError("%s: head translation out of range %s" % (self.id, head_t))

        def s(k):
            return r4(min(4.0, k / ext))

        return {
            "head": {"rotation": [0, 0, 0], "translation": head_t, "scale": [HEAD_SCALE] * 3},
            "gui": {"rotation": list(self.gui_rot), "translation": [0, 0, 0], "scale": [s(10.5)] * 3},
            "ground": {"rotation": [0, 0, 0], "translation": [0, 2, 0], "scale": [s(6.5)] * 3},
            "fixed": {"rotation": [0, 180, 0], "translation": [0, 0, 0], "scale": [s(13.0)] * 3},
            "on_shelf": {"rotation": [0, 180, 0], "translation": [0, 0, 0], "scale": [s(15.0)] * 3},
            "thirdperson_righthand": {"rotation": [75, 45, 0], "translation": [0, 2.5, 0], "scale": [s(6.5)] * 3},
            "thirdperson_lefthand": {"rotation": [75, 45, 0], "translation": [0, 2.5, 0], "scale": [s(6.5)] * 3},
            "firstperson_righthand": {"rotation": [0, 45, 0], "translation": [1, 2, 0], "scale": [s(5.6)] * 3},
            "firstperson_lefthand": {"rotation": [0, 225, 0], "translation": [1, 2, 0], "scale": [s(5.6)] * 3},
        }

    # ------------------------------------------------------------------ build
    def build(self):
        off = self.offset()
        # 1) collect face rects
        rects, owners = [], []
        for bi, b in enumerate(self.boxes):
            if isinstance(b.paint, str):
                continue
            for face in b.faces:
                rects.append(b.texels(face))
                owners.append((bi, face))
        size = 16
        pos = _pack(rects, size)
        while pos is None:
            size *= 2
            if size > 256:
                raise ValueError("%s: texture too large" % self.id)
            pos = _pack(rects, size)

        # 2) paint
        img = Image.new("RGBA", (size, size * self.frames), (0, 0, 0, 0))
        px = img.load()
        for frame in range(self.frames):
            for (bi, face), (w, h), (ox, oy) in zip(owners, rects, pos):
                b = self.boxes[bi]
                for j in range(h):
                    for i in range(w):
                        t = Texel()
                        t.box, t.face, t.i, t.j, t.w, t.h = b, face, i, j, w, h
                        t.fu, t.fv = (i + 0.5) / w, (j + 0.5) / h
                        t.x, t.y, t.z = b.point(face, t.fu, t.fv)
                        Texel.frame = frame
                        c = b.paint(t)
                        if c is not None:
                            px[ox + i, oy + j + frame * size] = c if len(c) == 4 else (*c, 255)
        tex_path = "item/clothing/hat/" + self.id
        write_png(img, "textures", "item", "clothing", "hat", self.id + ".png")
        if self.frames > 1:
            write_json({"animation": {"frametime": self.frametime or 4, "interpolate": False}},
                       "textures", "item", "clothing", "hat", self.id + ".png.mcmeta")
        textures = {"skin": NS + ":" + tex_path, "particle": NS + ":" + tex_path}
        for key, (eimg, meta) in self.extra.items():
            epath = "item/clothing/hat/%s_%s" % (self.id, key)
            write_png(eimg, "textures", "item", "clothing", "hat", "%s_%s.png" % (self.id, key))
            if meta:
                write_json(meta, "textures", "item", "clothing", "hat", "%s_%s.png.mcmeta" % (self.id, key))
            textures[key] = NS + ":" + epath

        # 3) elements
        elements = []
        rect_of = {owner: (p, r) for owner, p, r in zip(owners, pos, rects)}
        k = 16.0 / size
        for bi, b in enumerate(self.boxes):
            frm = [r4(b.frm[i] + off[i]) for i in range(3)]
            to = [r4(b.to[i] + off[i]) for i in range(3)]
            for v in frm + to:
                if v < -16 or v > 32:
                    raise ValueError("%s/%s: element outside [-16, 32]: %s %s" % (self.id, b.name, frm, to))
            faces = {}
            for face in b.faces:
                if isinstance(b.paint, str):
                    faces[face] = {"uv": [0, 0, 16, 16], "texture": b.paint}
                else:
                    (ox, oy), (w, h) = rect_of[(bi, face)]
                    faces[face] = {"uv": [r4(ox * k), r4(oy * k), r4((ox + w) * k), r4((oy + h) * k)], "texture": "#skin"}
            el = {"from": frm, "to": to}
            if b.name:
                el["name"] = b.name
            if b.rot:
                rot = {kk: vv for kk, vv in b.rot.items() if kk != "origin"}
                rot = {kk: r4(vv) if isinstance(vv, (int, float)) else vv for kk, vv in rot.items()}
                rot["origin"] = [r4(b.rot["origin"][i] + off[i]) for i in range(3)]
                el["rotation"] = rot
            if not b.shade:
                el["shade"] = False
            el["faces"] = faces
            elements.append(el)

        model = {"textures": textures, "elements": elements, "display": self.display()}
        write_json(model, "models", "item", "clothing", self.id + ".json")
        return img
