#!/usr/bin/env python3
"""Generates the House Juukulius sword item models and item definition.

    python3 tools/gen_models.py

The first- and third-person display transforms are read from BladeGeometry.java, and the blade root/tip constants
there are checked against the generated geometry, so the client's trail and Al Clarista effects always line up with
the drawn blade. The GUI and item-frame transforms are fitted to the model's bounds.
"""
from __future__ import annotations

import json
import math
import re
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / "src" / "main" / "resources" / "assets" / "julius_juukulius"
BLADE_GEOMETRY = ROOT / "src" / "client" / "java" / "dev" / "juukulius" / "client" / "fx" / "BladeGeometry.java"
NAMESPACE = "julius_juukulius"

# UV regions (in 0..16 texture units) of textures/item/house_juukulius_sword.png (see tools/gen_textures.py tex_sword).
STEEL = [0, 0, 4, 16]
FULLER = [1.5, 0, 2, 16]
EDGE = [4, 0, 5, 16]
GOLD = [5, 0, 8, 4]
GOLD_ENGRAVED = [5, 4, 8, 8]
GRIP = [8, 0, 10, 8]
GEM = [10, 0, 12, 2]
GEM_BLUE = [10, 2, 12, 4]
RICASSO = [12, 2, 14, 6]
FULL = [0, 0, 16, 16]

BLADE_BOTTOM = 9.0
BLADE_TOP = 28.0
TIP = 30.0


def faces(uv_sides, uv_ends=None, texture="#sword", only=None):
    """Six faces: north/south/east/west use uv_sides (tuple for front/back and edges), up/down use uv_ends."""
    if isinstance(uv_sides, tuple):
        front, edge = uv_sides
    else:
        front = edge = uv_sides
    ends = uv_ends if uv_ends is not None else edge
    result = {
        "north": {"uv": front, "texture": texture},
        "south": {"uv": front, "texture": texture},
        "east": {"uv": edge, "texture": texture},
        "west": {"uv": edge, "texture": texture},
        "up": {"uv": ends, "texture": texture},
        "down": {"uv": ends, "texture": texture},
    }
    if only is not None:
        result = {key: value for key, value in result.items() if key in only}
    return result


def box(name, start, end, face_map, light=0):
    element = {"name": name, "from": [round(c, 4) for c in start], "to": [round(c, 4) for c in end], "faces": face_map}
    if light:
        element["light_emission"] = light
    return element


def bar(name, a, b, thickness, depth, face_map):
    """A bar from point a to point b in the blade plane (x/y), rotated about z around its middle."""
    (ax, ay), (bx, by) = a, b
    length = math.hypot(bx - ax, by - ay)
    angle = math.degrees(math.atan2(by - ay, bx - ax))
    if angle > 90:
        angle -= 180
    elif angle < -90:
        angle += 180
    cx, cy = (ax + bx) / 2, (ay + by) / 2
    element = box(name, (cx - length / 2, cy - thickness / 2, 8 - depth / 2), (cx + length / 2, cy + thickness / 2, 8 + depth / 2), face_map)
    element["rotation"] = {"origin": [round(cx, 4), round(cy, 4), 8], "axis": "z", "angle": round(angle, 3)}
    return element


def sword_elements(clad: bool):
    glow = 10 if clad else 0
    elements = [
        box("pommel", (7.1, 0.0, 7.1), (8.9, 1.6, 8.9), faces(GOLD)),
        box("pommel_gem", (7.55, 0.35, 6.95), (8.45, 1.25, 9.05), faces(GEM_BLUE)),
        box("grip", (7.45, 1.6, 7.45), (8.55, 6.4, 8.55), faces(GRIP, GOLD)),
        box("grip_ring_low", (7.3, 1.5, 7.3), (8.7, 2.0, 8.7), faces(GOLD_ENGRAVED)),
        box("grip_ring_high", (7.3, 6.0, 7.3), (8.7, 6.5, 8.7), faces(GOLD)),
        box("crossguard", (4.6, 6.5, 7.35), (11.4, 7.4, 8.65), faces((GOLD_ENGRAVED, GOLD))),
        bar("quillon_left", (5.0, 6.95), (3.85, 7.6), 0.7, 1.1, faces(GOLD)),
        bar("quillon_right", (11.0, 6.95), (12.15, 7.6), 0.7, 1.1, faces(GOLD)),
        bar("knuckle_bow_upper", (11.0, 6.6), (10.55, 3.0), 0.5, 0.5, faces(GOLD)),
        bar("knuckle_bow_lower", (10.55, 3.2), (8.9, 1.0), 0.5, 0.5, faces(GOLD)),
        box("guard_center", (7.05, 6.2, 7.2), (8.95, 7.9, 8.8), faces(GOLD)),
        box("guard_gem", (7.6, 6.65, 7.05), (8.4, 7.45, 8.95), faces(GEM)),
        box("ricasso", (7.35, 7.9, 7.78), (8.65, 9.2, 8.22), faces((RICASSO, EDGE))),
        box("blade", (7.4, BLADE_BOTTOM, 7.82), (8.6, BLADE_TOP, 8.18), faces((STEEL, EDGE)), glow),
        box("fuller", (7.88, 9.6, 7.79), (8.12, 25.0, 8.21), faces(FULLER, only=("north", "south")), glow),
        box("tip_1", (7.5, BLADE_TOP, 7.84), (8.5, 28.6, 8.16), faces((STEEL, EDGE)), glow),
        box("tip_2", (7.65, 28.6, 7.86), (8.35, 29.2, 8.14), faces((STEEL, EDGE)), glow),
        box("tip_3", (7.8, 29.2, 7.88), (8.2, 29.7, 8.12), faces(EDGE), glow),
        box("tip_4", (7.92, 29.7, 7.9), (8.08, TIP, 8.1), faces(EDGE), glow),
    ]
    if clad:
        energy = faces(FULL, FULL, texture="#energy", only=("north", "south", "east", "west", "up"))
        elements.append(box("al_clarista", (7.0, 8.5, 7.55), (9.0, 29.6, 8.45), energy, 15))
    return elements


# ------------------------------------------------------------------------------------------------ transforms


def rotation_xyz(degrees):
    rx, ry, rz = (math.radians(a) for a in degrees)
    cx, sx, cy, sy, cz, sz = math.cos(rx), math.sin(rx), math.cos(ry), math.sin(ry), math.cos(rz), math.sin(rz)
    mx = np.array([[1, 0, 0], [0, cx, -sx], [0, sx, cx]])
    my = np.array([[cy, 0, sy], [0, 1, 0], [-sy, 0, cy]])
    mz = np.array([[cz, -sz, 0], [sz, cz, 0], [0, 0, 1]])
    return mx @ my @ mz


def fitted(rotation, fill_pixels, points):
    """Scale and translation (pixels) that centre the rotated model points and fit them into fill_pixels."""
    matrix = rotation_xyz(rotation)
    centred = np.array(points) - 8.0
    rotated = centred @ matrix.T
    extent = (rotated.max(axis=0) - rotated.min(axis=0))[:2].max()
    scale = round(fill_pixels / extent, 3)
    middle = (rotated.max(axis=0) + rotated.min(axis=0)) / 2 * scale
    return scale, [round(-middle[0], 3), round(-middle[1], 3), 0.0]


def read_java_transforms():
    source = BLADE_GEOMETRY.read_text()

    def array(name):
        match = re.search(name + r" = \{([^}]*)\}", source)
        return [float(v.strip().rstrip("F")) for v in match.group(1).split(",")]

    def scalar(name):
        return float(re.search(name + r" = ([-\d.]+)F;", source).group(1))

    def vector(name):
        match = re.search(name + r" = new Vector3f\(([^)]*)\)", source)
        return [float(v.strip().rstrip("F")) for v in match.group(1).split(",")]

    return {
        "fp_rotation": array("FP_ROTATION"), "fp_translation": array("FP_TRANSLATION"), "fp_scale": scalar("FP_SCALE"),
        "tp_rotation": array("TP_ROTATION"), "tp_translation": array("TP_TRANSLATION"), "tp_scale": scalar("TP_SCALE"),
        "base": vector("BASE_PX"), "tip": vector("TIP_PX"),
    }


def display():
    java = read_java_transforms()
    if java["tip"] != [8.0, TIP, 8.0] or not BLADE_BOTTOM - 0.5 <= java["base"][1] <= BLADE_BOTTOM:
        raise SystemExit(f"BladeGeometry blade constants {java['base']} -> {java['tip']} do not match the model blade")

    outline = [(8, 0, 8), (8, TIP, 8), (3.85, 7.6, 8), (12.15, 7.6, 8), (11.0, 3.0, 8)]
    gui_rotation = [0, 0, -45]
    gui_scale, gui_translation = fitted(gui_rotation, 15.5, outline)
    fixed_rotation = [0, 180, 45]
    fixed_scale, fixed_translation = fitted(fixed_rotation, 13.0, outline)
    ground_scale = 0.4
    return {
        "thirdperson_righthand": {
            "rotation": java["tp_rotation"], "translation": java["tp_translation"], "scale": [java["tp_scale"]] * 3,
        },
        "firstperson_righthand": {
            "rotation": java["fp_rotation"], "translation": java["fp_translation"], "scale": [java["fp_scale"]] * 3,
        },
        "gui": {"rotation": gui_rotation, "translation": gui_translation, "scale": [gui_scale] * 3},
        "fixed": {"rotation": fixed_rotation, "translation": fixed_translation, "scale": [fixed_scale] * 3},
        "ground": {"rotation": [0, 0, 0], "translation": [0, round(-(TIP / 2 - 8) * ground_scale + 2.0, 3), 0], "scale": [ground_scale] * 3},
        "head": {"rotation": [0, 0, 0], "translation": [0, 6, 0], "scale": [0.6] * 3},
    }


def write(path: Path, data) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2) + "\n")
    print("wrote", path.relative_to(ROOT))


def main() -> None:
    transforms = display()
    textures = {
        "particle": f"{NAMESPACE}:item/house_juukulius_sword",
        "sword": f"{NAMESPACE}:item/house_juukulius_sword",
    }
    plain = {"gui_light": "front", "textures": textures, "elements": sword_elements(False), "display": transforms}
    clad_textures = dict(textures, energy=f"{NAMESPACE}:item/house_juukulius_sword_energy")
    clad = {"gui_light": "front", "textures": clad_textures, "elements": sword_elements(True), "display": transforms}
    write(ASSETS / "models" / "item" / "house_juukulius_sword.json", plain)
    write(ASSETS / "models" / "item" / "house_juukulius_sword_clad.json", clad)
    write(ASSETS / "items" / "house_juukulius_sword.json", {
        "model": {
            "type": "minecraft:condition",
            "property": f"{NAMESPACE}:clad",
            "on_true": {"type": "minecraft:model", "model": f"{NAMESPACE}:item/house_juukulius_sword_clad"},
            "on_false": {"type": "minecraft:model", "model": f"{NAMESPACE}:item/house_juukulius_sword"},
        }
    })


if __name__ == "__main__":
    main()
