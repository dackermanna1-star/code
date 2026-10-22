"""3D item models built from cuboids, textured from one shared procedurally generated material palette.

Model space: 16 units = 1 block. Weapons point along -Z (into the screen in first person); projectile models also
point along -Z and their ``fixed`` display flips them so the projectile renderer flies them nose-first.
"""
import numpy as np

from .common import hex_rgb, save_rgba, write_json

SWATCH = 8          # pixels per material swatch
COLUMNS = 8         # swatches per row (64 px texture)
PALETTE_SIZE = SWATCH * COLUMNS
UV_PER_SWATCH = 16.0 / COLUMNS

# name: (base colour, finish)
MATERIALS = {
    "olive": ("#4d5a32", "paint"),
    "olive_dark": ("#353f22", "paint"),
    "olive_light": ("#6b7a45", "paint"),
    "gunmetal": ("#3e4247", "metal"),
    "gunmetal_dark": ("#26292d", "metal"),
    "steel": ("#7d838a", "metal"),
    "steel_light": ("#a9b0b6", "metal"),
    "black": ("#18191b", "paint"),
    "wood": ("#7b4a26", "wood"),
    "wood_dark": ("#523019", "wood"),
    "brass": ("#b8913d", "metal"),
    "copper": ("#a2603a", "metal"),
    "red": ("#9e2a22", "paint"),
    "red_dark": ("#64170f", "paint"),
    "warhead": ("#56622f", "paint"),
    "warhead_light": ("#737f45", "paint"),
    "white": ("#d9dad6", "paint"),
    "grey": ("#8d8f8c", "paint"),
    "rubber": ("#202021", "rubber"),
    "lens": ("#4f7aa8", "glass"),
    "orange": ("#d0702a", "paint"),
    "yellow": ("#c9a531", "paint"),
    "tan": ("#c2ad82", "putty"),
    "smoke_green": ("#6f7a63", "paint"),
    "maroon": ("#5e2426", "paint"),
    "thermobaric": ("#2b2a26", "paint"),
    "led_red": ("#ff3a2a", "emissive"),
    "khaki": ("#8a7b55", "fabric"),
    "aluminium": ("#c4c8cc", "metal"),
    "carbon": ("#2f3134", "rubber"),
    "ceramic": ("#e7e8e4", "paint"),
    "hazard": ("#c9a531", "stripes"),
    "fuel_red": ("#a3271c", "paint"),
    "pilot_blue": ("#4c8fe0", "emissive"),
    "bronze": ("#8a6a34", "metal"),
}
INDEX = {name: i for i, name in enumerate(MATERIALS)}


def _swatch(base, finish, rng):
    r, g, b = hex_rgb(base)
    img = np.ones((SWATCH, SWATCH, 4))
    lum = np.ones((SWATCH, SWATCH))
    if finish == "metal":
        rows = 1.0 + rng.normal(0, 0.05, (SWATCH, 1))
        lum = rows * (1.0 + rng.normal(0, 0.025, (SWATCH, SWATCH)))
        lum[0, :] *= 1.12
        lum[rng.integers(0, SWATCH, 3), rng.integers(0, SWATCH, 3)] *= 1.18
    elif finish == "wood":
        y = np.arange(SWATCH)[:, None]
        grain = 1.0 + 0.09 * np.sin(y * 1.9 + rng.normal(0, 0.4, (SWATCH, SWATCH)).cumsum(axis=1) * 0.3)
        lum = grain * (1.0 + rng.normal(0, 0.03, (SWATCH, SWATCH)))
        lum[rng.integers(0, SWATCH), :] *= 0.86
    elif finish == "rubber":
        lum = 1.0 + rng.normal(0, 0.06, (SWATCH, SWATCH))
    elif finish == "glass":
        xx, yy = np.meshgrid(np.arange(SWATCH), np.arange(SWATCH))
        lum = 1.25 - (xx + yy) / (2 * SWATCH) * 0.6
        lum[1, 1:3] = 1.8
    elif finish == "emissive":
        lum = 1.0 + rng.normal(0, 0.03, (SWATCH, SWATCH))
    elif finish == "fabric":
        xx, yy = np.meshgrid(np.arange(SWATCH), np.arange(SWATCH))
        lum = 1.0 + 0.06 * ((xx + yy) % 2) + rng.normal(0, 0.03, (SWATCH, SWATCH))
    elif finish == "putty":
        lum = 1.0 + rng.normal(0, 0.035, (SWATCH, SWATCH))
    elif finish == "stripes":
        xx, yy = np.meshgrid(np.arange(SWATCH), np.arange(SWATCH))
        stripe = ((xx + yy) // 2) % 2 == 0
        img[..., 0] = np.where(stripe, r, 0.09)
        img[..., 1] = np.where(stripe, g, 0.09)
        img[..., 2] = np.where(stripe, b, 0.08)
        return img
    else:  # paint
        lum = 1.0 + rng.normal(0, 0.035, (SWATCH, SWATCH))
        scratch = rng.integers(0, SWATCH, 2)
        lum[scratch[0], scratch[1]] *= 1.25
    img[..., 0] = np.clip(r * lum, 0, 1)
    img[..., 1] = np.clip(g * lum, 0, 1)
    img[..., 2] = np.clip(b * lum, 0, 1)
    return img


def generate_palette():
    rng = np.random.default_rng(2024)
    rows = (len(MATERIALS) + COLUMNS - 1) // COLUMNS
    tex = np.zeros((PALETTE_SIZE, PALETTE_SIZE, 4))
    for name, i in INDEX.items():
        base, finish = MATERIALS[name]
        x = (i % COLUMNS) * SWATCH
        y = (i // COLUMNS) * SWATCH
        tex[y:y + SWATCH, x:x + SWATCH] = _swatch(base, finish, rng)
    assert rows <= COLUMNS
    save_rgba("textures/item/palette.png", tex)


class Model:
    def __init__(self, name, ambient=True):
        self.name = name
        self.elements = []
        self.display = {}
        self.ambient = ambient

    def box(self, material, frm, to, rotation=None, shade=True, light=0):
        u0 = (INDEX[material] % COLUMNS) * UV_PER_SWATCH
        v0 = (INDEX[material] // COLUMNS) * UV_PER_SWATCH
        dx, dy, dz = (abs(to[i] - frm[i]) for i in range(3))
        inset = 0.12

        def uv(w, h):
            w = min(max(w, 0.25), UV_PER_SWATCH - 2 * inset)
            h = min(max(h, 0.25), UV_PER_SWATCH - 2 * inset)
            return [round(u0 + inset, 4), round(v0 + inset, 4), round(u0 + inset + w, 4), round(v0 + inset + h, 4)]

        faces = {
            "north": uv(dx, dy), "south": uv(dx, dy),
            "east": uv(dz, dy), "west": uv(dz, dy),
            "up": uv(dx, dz), "down": uv(dx, dz),
        }
        element = {
            "from": [round(v, 4) for v in frm],
            "to": [round(v, 4) for v in to],
            "faces": {face: {"uv": coords, "texture": "#palette"} for face, coords in faces.items()},
        }
        if not shade:
            element["shade"] = False
        if light:
            element["light_emission"] = light
        if rotation:
            angle, axis, origin = rotation
            element["rotation"] = {"angle": angle, "axis": axis, "origin": list(origin)}
        self.elements.append(element)
        return self

    def tube(self, material, cx, cy, r, z0, z1, rim=None):
        """Square tube with bevelled corners (a cross of two boxes) along Z."""
        self.box(material, (cx - r, cy - r * 0.72, z0), (cx + r, cy + r * 0.72, z1))
        self.box(rim or material, (cx - r * 0.72, cy - r, z0), (cx + r * 0.72, cy + r, z1))
        return self

    def cylinder_y(self, material, cx, cz, r, y0, y1):
        """Rounded upright cylinder (two crossed boxes) along Y."""
        self.box(material, (cx - r, y0, cz - r * 0.72), (cx + r, y1, cz + r * 0.72))
        self.box(material, (cx - r * 0.72, y0, cz - r), (cx + r * 0.72, y1, cz + r))
        return self

    def write(self):
        obj = {"textures": {"palette": "ordnance:item/palette", "particle": "ordnance:item/palette"}, "elements": self.elements}
        if not self.ambient:
            obj["ambientocclusion"] = False
        obj["gui_light"] = "side"
        obj["display"] = self.display
        write_json(f"models/item/{self.name}.json", obj)


def tf(rotation=(0, 0, 0), translation=(0, 0, 0), scale=1.0):
    s = scale if isinstance(scale, (list, tuple)) else (scale, scale, scale)
    return {"rotation": list(rotation), "translation": list(translation), "scale": list(s)}


def long_gun_display(scale_hand=1.0, gui_scale=0.55, ground=0.5):
    return {
        "firstperson_righthand": tf((0, 0, 0), (-3.0, -1.5, -2.0), scale_hand),
        "firstperson_lefthand": tf((0, 0, 0), (3.0, -1.5, -2.0), scale_hand),
        "thirdperson_righthand": tf((0, 0, 0), (0, 2.0, -1.0), scale_hand * 0.85),
        "thirdperson_lefthand": tf((0, 0, 0), (0, 2.0, -1.0), scale_hand * 0.85),
        "gui": tf((30, 135, 0), (0, 0, 0), gui_scale),
        "ground": tf((0, 0, 0), (0, 3, 0), ground),
        "fixed": tf((0, 90, 0), (0, 0, 0), gui_scale * 1.1),
        "head": tf((0, 0, 0), (0, 10, 0), 0.8),
    }


def small_item_display(gui_scale=1.0, hand=0.7, fixed_flip=True):
    return {
        "firstperson_righthand": tf((0, 0, 0), (0, 1.5, -1.0), hand),
        "firstperson_lefthand": tf((0, 0, 0), (0, 1.5, -1.0), hand),
        "thirdperson_righthand": tf((0, 0, 0), (0, 2.5, 0.5), hand * 0.8),
        "thirdperson_lefthand": tf((0, 0, 0), (0, 2.5, 0.5), hand * 0.8),
        "gui": tf((30, 135, 0), (0, 0, 0), gui_scale),
        "ground": tf((0, 0, 0), (0, 3, 0), 0.6),
        "fixed": tf((0, 180, 0) if fixed_flip else (0, 0, 0), (0, 0, 0), 1.0),
        "head": tf((0, 0, 0), (0, 12, 0), 0.8),
    }


# ---------------------------------------------------------------------------- weapon models


def rpg7(loaded):
    m = Model("rpg7_loaded" if loaded else "rpg7")
    # Launch tube and muzzle.
    m.tube("gunmetal_dark", 8, 8, 1.15, -6, 22)
    m.box("steel", (6.7, 6.7, -6.2), (9.3, 9.3, -5.2))
    # Rear venturi bell.
    m.box("gunmetal", (6.4, 6.4, 22), (9.6, 9.6, 24))
    m.box("gunmetal", (5.8, 5.8, 24), (10.2, 10.2, 26.5))
    m.box("black", (6.6, 6.6, 26.5), (9.4, 9.4, 26.7))
    # Wooden heat shields.
    m.tube("wood", 8, 8, 1.45, 3.5, 9.5, rim="wood_dark")
    m.tube("wood", 8, 8, 1.45, 13.0, 17.5, rim="wood_dark")
    # Pistol grip, trigger guard and trigger.
    m.box("wood_dark", (7.2, 2.5, 10.4), (8.8, 7.0, 12.2), rotation=(-22.5, "x", (8, 7, 11)))
    m.box("steel", (7.6, 5.2, 9.0), (8.4, 5.7, 11.2))
    m.box("black", (7.75, 5.6, 9.8), (8.25, 6.9, 10.3))
    # Sights and PGO-7 optic on the left.
    m.box("black", (7.7, 9.0, -2.5), (8.3, 10.4, -2.0))
    m.box("black", (7.5, 9.0, 9.6), (8.5, 10.0, 10.1))
    m.box("gunmetal", (5.0, 8.0, 10.5), (6.6, 10.6, 16.0))
    m.box("lens", (5.2, 8.3, 10.3), (6.4, 10.3, 10.5))
    m.box("rubber", (5.1, 8.2, 16.0), (6.5, 10.4, 17.2))
    m.box("steel", (6.6, 8.6, 12.5), (6.85, 9.6, 14.0))
    if loaded:
        # PG-7V protruding from the muzzle: motor section, warhead body, ogive and piezo tip.
        m.box("olive_dark", (7.0, 7.0, -9.0), (9.0, 9.0, -6.0))
        m.tube("warhead", 8, 8, 1.85, -12.0, -9.0, rim="warhead_light")
        m.tube("warhead", 8, 8, 1.35, -14.0, -12.0)
        m.box("warhead_light", (7.2, 7.2, -15.4), (8.8, 8.8, -14.0))
        m.box("steel_light", (7.65, 7.65, -16.0), (8.35, 8.35, -15.4))
    m.display = long_gun_display(1.0, 0.5)
    m.write()


def rocket(name, thermobaric):
    m = Model(name)
    # Sustainer motor body and folded fins.
    m.box("olive_dark", (7.0, 7.0, 0.0), (9.0, 9.0, 10.0))
    m.box("steel", (7.4, 7.4, 10.0), (8.6, 8.6, 12.0))
    for (x0, y0, x1, y1) in ((5.6, 7.7, 7.0, 8.3), (9.0, 7.7, 10.4, 8.3), (7.7, 5.6, 8.3, 7.0), (7.7, 9.0, 8.3, 10.4)):
        m.box("steel", (x0, y0, 7.5), (x1, y1, 11.0))
    if thermobaric:
        m.tube("thermobaric", 8, 8, 1.9, -9.0, 0.0)
        m.box("hazard", (6.0, 6.0, -3.0), (10.0, 10.0, -2.2))
        m.tube("thermobaric", 8, 8, 1.4, -11.0, -9.0)
        m.box("black", (7.3, 7.3, -12.0), (8.7, 8.7, -11.0))
    else:
        m.tube("warhead", 8, 8, 1.85, -3.0, 0.0, rim="warhead_light")
        m.tube("warhead", 8, 8, 1.35, -5.0, -3.0)
        m.box("warhead_light", (7.2, 7.2, -6.4), (8.8, 8.8, -5.0))
        m.box("steel_light", (7.65, 7.65, -7.0), (8.35, 8.35, -6.4))
    m.display = small_item_display(0.75, 0.6)
    m.display["gui"] = tf((0, 90, -45), (0, 0, 0), 0.7)
    m.write()


def grenade_launcher():
    m = Model("grenade_launcher")
    # Barrel with ribbed handguard.
    m.tube("gunmetal_dark", 8, 9.5, 1.35, -8.0, 4.0)
    m.box("black", (6.4, 8.3, -6.0), (9.6, 10.8, -1.0))
    m.box("steel", (6.9, 8.4, -8.3), (9.1, 10.6, -7.8))
    # Revolving cylinder: six chambers around a hub.
    m.tube("gunmetal", 8, 8.2, 2.9, 4.0, 10.0)
    for i in range(6):
        a = i * np.pi / 3.0
        cx, cy = 8 + np.cos(a) * 1.9, 8.2 + np.sin(a) * 1.9
        m.box("black", (cx - 0.55, cy - 0.55, 3.9), (cx + 0.55, cy + 0.55, 4.0))
    m.box("steel", (7.4, 7.6, 3.6), (8.6, 8.8, 10.4))
    # Frame, pistol grip, trigger, folding stock.
    m.box("gunmetal_dark", (7.0, 6.0, 10.0), (9.0, 10.5, 13.0))
    m.box("rubber", (7.1, 1.5, 12.0), (8.9, 6.0, 13.8), rotation=(-22.5, "x", (8, 6, 12.8)))
    m.box("steel", (7.6, 5.0, 9.8), (8.4, 5.4, 12.0))
    m.box("black", (7.75, 5.4, 10.6), (8.25, 6.4, 11.0))
    m.box("gunmetal_dark", (7.3, 7.2, 13.0), (8.7, 8.6, 20.0))
    m.box("rubber", (6.9, 4.4, 20.0), (9.1, 9.4, 21.5))
    m.box("gunmetal_dark", (7.4, 4.8, 15.5), (8.6, 7.2, 16.5))
    # Forward grip and reflex sight.
    m.box("rubber", (7.2, 4.5, -4.5), (8.8, 8.3, -2.8))
    m.box("black", (7.0, 11.0, 0.5), (9.0, 12.6, 3.5))
    m.box("lens", (7.3, 11.3, 0.3), (8.7, 12.3, 0.5))
    m.display = long_gun_display(1.0, 0.55)
    m.write()


def round_40mm(name, head, band):
    m = Model(name)
    m.cylinder_y("brass", 8, 8, 1.6, 0.0, 3.0)
    m.cylinder_y("bronze", 8, 8, 1.75, 0.0, 0.4)
    m.cylinder_y(head, 8, 8, 1.65, 3.0, 5.0)
    m.cylinder_y(band, 8, 8, 1.7, 3.6, 4.0)
    m.cylinder_y(head, 8, 8, 1.2, 5.0, 5.8)
    m.cylinder_y(head, 8, 8, 0.7, 5.8, 6.3)
    m.display = small_item_display(1.3, 0.75, fixed_flip=False)
    # Launched rounds fly nose (+Y) first: tip the model forward.
    m.display["fixed"] = tf((-90, 0, 0), (0, 0, 0), 1.2)
    m.write()


def frag_grenade():
    m = Model("frag_grenade")
    m.box("olive", (5.0, 2.5, 5.5), (11.0, 8.5, 10.5))
    m.box("olive", (5.5, 2.0, 5.0), (10.5, 9.0, 11.0))
    m.box("olive_light", (6.0, 1.5, 6.0), (10.0, 9.5, 10.0))
    m.box("olive_dark", (6.2, 1.4, 6.2), (9.8, 1.6, 9.8))
    # Fuze, spoon and pin ring.
    m.box("steel", (6.8, 9.5, 6.8), (9.2, 11.0, 9.2))
    m.box("steel_light", (9.2, 7.0, 7.4), (10.0, 11.0, 8.6))
    m.box("steel_light", (7.0, 10.6, 7.4), (9.2, 11.2, 8.6))
    m.box("steel_light", (5.4, 10.2, 7.7), (6.8, 10.6, 8.3))
    m.box("steel_light", (4.0, 9.0, 7.8), (4.4, 11.6, 8.2))
    m.box("steel_light", (4.0, 11.4, 7.8), (5.6, 11.8, 8.2))
    m.box("steel_light", (4.0, 8.8, 7.8), (5.6, 9.2, 8.2))
    m.display = small_item_display(1.25, 0.8, fixed_flip=False)
    m.write()


def canister_grenade(name, body, band, top):
    m = Model(name)
    m.cylinder_y(body, 8, 8, 2.4, 1.0, 9.0)
    m.cylinder_y(band, 8, 8, 2.5, 6.5, 7.6)
    m.cylinder_y(top, 8, 8, 2.45, 9.0, 9.6)
    m.box("steel", (6.8, 9.6, 6.8), (9.2, 11.0, 9.2))
    m.box("steel_light", (9.2, 5.0, 7.4), (10.0, 11.0, 8.6))
    m.box("steel_light", (7.0, 10.6, 7.4), (9.2, 11.2, 8.6))
    m.box("steel_light", (4.6, 10.0, 7.8), (5.0, 12.0, 8.2))
    m.box("steel_light", (4.6, 11.8, 7.8), (6.4, 12.2, 8.2))
    m.box("steel_light", (4.6, 9.8, 7.8), (6.4, 10.2, 8.2))
    m.display = small_item_display(1.25, 0.8, fixed_flip=False)
    m.write()


def flamethrower():
    m = Model("flamethrower")
    # Wand: barrel, heat shield, nozzle with pilot light.
    m.tube("gunmetal_dark", 8, 9.5, 0.9, -10.0, 8.0)
    m.tube("steel", 8, 9.5, 1.35, -7.0, -1.5)
    m.box("black", (6.7, 8.2, -11.4), (9.3, 10.8, -10.0))
    m.box("steel_light", (8.6, 10.4, -10.6), (9.4, 11.2, -9.4))
    m.box("pilot_blue", (8.75, 11.2, -10.45), (9.25, 11.5, -9.95), shade=False, light=15)
    # Fuel tank slung under the barrel, pressure bottle beside it.
    m.tube("fuel_red", 8, 5.5, 2.1, -3.0, 9.0)
    m.box("steel", (6.4, 4.0, 9.0), (9.6, 7.0, 9.8))
    m.box("steel", (6.4, 4.0, -3.8), (9.6, 7.0, -3.0))
    m.tube("aluminium", 10.6, 6.2, 0.9, -1.0, 6.0)
    m.box("black", (9.9, 6.0, 6.0), (11.3, 6.6, 7.0))
    m.box("rubber", (9.4, 6.8, 6.5), (10.2, 9.0, 7.3))
    # Grips, trigger and shoulder stock.
    m.box("rubber", (7.2, 3.0, 9.5), (8.8, 8.6, 11.3), rotation=(-22.5, "x", (8, 8.6, 10.4)))
    m.box("rubber", (7.3, 6.2, -6.0), (8.7, 8.6, -4.5))
    m.box("black", (7.75, 7.6, 8.3), (8.25, 8.6, 8.8))
    m.box("gunmetal_dark", (7.3, 8.6, 8.0), (8.7, 10.2, 16.0))
    m.box("rubber", (7.0, 7.0, 16.0), (9.0, 10.6, 17.4))
    m.box("hazard", (6.2, 5.0, 2.0), (6.4, 6.0, 5.0))
    m.display = long_gun_display(1.0, 0.6)
    m.write()


def fuel_canister():
    m = Model("fuel_canister")
    m.box("fuel_red", (4.5, 0.0, 6.0), (11.5, 10.0, 10.0))
    m.box("red_dark", (4.4, 4.0, 5.9), (11.6, 4.6, 10.1))
    m.box("red_dark", (5.0, 10.0, 6.5), (11.0, 10.8, 9.5))
    m.box("fuel_red", (6.0, 10.8, 7.4), (9.5, 12.0, 8.6))
    m.box("steel", (9.8, 10.8, 7.2), (11.0, 12.4, 8.8))
    m.box("hazard", (4.4, 6.0, 9.9), (8.0, 8.5, 10.15))
    m.display = small_item_display(1.0, 0.75, fixed_flip=False)
    m.write()


def strike_designator():
    m = Model("strike_designator")
    # Body, twin objective lenses, laser emitter, eyepieces, antenna and grip.
    m.box("olive_dark", (4.5, 6.0, -1.0), (11.5, 10.5, 8.0))
    m.box("rubber", (4.2, 6.4, 0.5), (11.8, 10.1, 6.0))
    m.tube("gunmetal_dark", 6.0, 8.2, 1.4, -2.5, -1.0)
    m.tube("gunmetal_dark", 10.0, 8.2, 1.4, -2.5, -1.0)
    m.box("lens", (4.9, 7.1, -2.7), (7.1, 9.3, -2.5))
    m.box("lens", (8.9, 7.1, -2.7), (11.1, 9.3, -2.5))
    m.box("black", (7.4, 10.5, -2.0), (8.6, 11.7, 3.0))
    m.box("led_red", (7.6, 10.7, -2.2), (8.4, 11.5, -2.0), shade=False, light=15)
    m.box("rubber", (5.0, 7.3, 8.0), (7.0, 9.5, 9.5))
    m.box("rubber", (9.0, 7.3, 8.0), (11.0, 9.5, 9.5))
    m.box("black", (10.6, 10.5, 5.0), (11.0, 15.5, 5.4))
    m.box("rubber", (7.2, 2.0, 3.0), (8.8, 6.0, 4.8))
    m.box("led_red", (5.0, 10.5, 6.5), (5.6, 10.7, 7.1), shade=False, light=15)
    m.display = small_item_display(1.0, 0.75, fixed_flip=False)
    m.display["firstperson_righthand"] = tf((0, 0, 0), (-1.0, 0.5, -2.0), 0.8)
    m.display["firstperson_lefthand"] = tf((0, 0, 0), (1.0, 0.5, -2.0), 0.8)
    m.write()


def hypersonic_missile():
    m = Model("hypersonic_missile")
    # Waverider-style body: ceramic airframe, carbon nose, strakes, fins and scramjet nozzle.
    m.tube("ceramic", 8, 8, 1.6, -10.0, 16.0)
    m.tube("carbon", 8, 8, 1.2, -14.0, -10.0)
    m.box("carbon", (7.3, 7.3, -16.0), (8.7, 8.7, -14.0))
    m.box("black", (6.2, 6.0, 16.0), (9.8, 9.0, 18.0))
    m.box("gunmetal_dark", (6.8, 6.6, 18.0), (9.2, 8.6, 19.0))
    m.box("ceramic", (4.0, 7.7, 2.0), (12.0, 8.3, 10.0))
    m.box("white", (5.0, 7.75, 10.0), (11.0, 8.25, 14.0))
    for (x0, y0, x1, y1) in ((3.8, 7.6, 6.6, 8.4), (9.4, 7.6, 12.2, 8.4), (7.6, 9.4, 8.4, 12.0), (7.6, 4.0, 8.4, 6.6)):
        m.box("grey", (x0, y0, 12.5), (x1, y1, 16.0))
    m.box("hazard", (6.3, 6.3, -9.0), (9.7, 9.7, -8.4))
    m.box("black", (6.3, 9.55, -2.0), (9.7, 9.7, 1.0))
    m.display = small_item_display(0.45, 0.45)
    m.display["gui"] = tf((0, 90, -45), (0, 0, 0), 0.42)
    m.write()


def explosive_charge():
    m = Model("explosive_charge")
    m.box("tan", (3.5, 0.0, 5.0), (12.5, 3.5, 11.0))
    m.box("khaki", (3.4, 0.6, 7.4), (12.6, 2.9, 8.6))
    m.box("black", (9.0, 3.5, 6.0), (11.0, 5.0, 8.0))
    m.box("led_red", (9.6, 5.0, 6.6), (10.4, 5.3, 7.4), shade=False, light=15)
    m.box("red", (6.0, 3.5, 8.6), (9.0, 3.9, 9.0))
    m.box("yellow", (5.0, 3.5, 6.2), (9.0, 3.9, 6.6))
    m.display = small_item_display(1.1, 0.75, fixed_flip=False)
    m.write()


def generate():
    generate_palette()
    rpg7(False)
    rpg7(True)
    rocket("pg7v_rocket", False)
    rocket("tbg7v_rocket", True)
    grenade_launcher()
    round_40mm("grenade_40mm_he", "yellow", "olive_dark")
    round_40mm("grenade_40mm_incendiary", "red", "black")
    round_40mm("grenade_40mm_smoke", "smoke_green", "white")
    frag_grenade()
    canister_grenade("incendiary_grenade", "maroon", "yellow", "red")
    canister_grenade("smoke_grenade", "smoke_green", "white", "white")
    flamethrower()
    fuel_canister()
    strike_designator()
    hypersonic_missile()
    explosive_charge()
