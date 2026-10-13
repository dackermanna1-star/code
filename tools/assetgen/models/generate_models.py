#!/usr/bin/env python3
"""
Generate every CaliberCraft weapon/attachment/item model, item model definition and the
first-person render metadata.  Run from the repository root:

    python3 tools/assetgen/models/generate_models.py [--preview]

Outputs to src/main/resources/assets/calibercraft/{models,items,weapon_render,blockstates}.
"""
from __future__ import annotations

import argparse
import importlib
import json
import math
import os
import shutil
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import numpy as np  # noqa: E402

import attachments as att_lib  # noqa: E402
from ccmodel import Box, Part, Writer, part_has_glow, part_model_json  # noqa: E402
from skins import EMISSIVE_SKINS, NS, SKINS, skin_textures, tex  # noqa: E402

ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
ASSETS = os.path.join(ROOT, "src", "main", "resources", "assets", NS)

WEAPON_IDS = ["m9", "revolver", "vector9", "mp5", "ar15", "ak", "bullpup",
              "pump_shotgun", "auto_shotgun", "sniper", "dmr", "lmg"]

# Custom model data string index per attachment slot (index 0 is the skin).
SLOT_INDEX = {"optic": 1, "muzzle": 2, "barrel": 3, "grip": 4, "stock": 5,
              "magazine": 6, "tactical": 7, "charm": 8}
ATTACHMENT_SLOTS = ("optic", "muzzle", "grip", "tactical", "charm")  # geometry from attachments.py
VARIANT_SLOTS = ("barrel", "stock", "magazine")  # geometry from the weapon itself

AMMO_ITEMS = ["ammo_9mm", "ammo_9mm_hp", "ammo_44", "ammo_44_hp", "ammo_556", "ammo_556_ap",
              "ammo_762", "ammo_762_ap", "ammo_308", "ammo_308_ap", "ammo_338", "ammo_338_ap",
              "shell_buckshot", "shell_slug", "shell_incendiary"]
MISC_ITEMS = ["gun_parts", "precision_parts", "prismatic_finish_kit"]

LO, HI = -16.0, 32.0


# --------------------------------------------------------------------------------------------
# Transform maths
# --------------------------------------------------------------------------------------------

def rot_xyz(deg):
    """JOML Quaternionf.rotationXYZ(x, y, z) as a matrix: Rx * Ry * Rz."""
    x, y, z = (math.radians(d) for d in deg)
    rx = np.array([[1, 0, 0], [0, math.cos(x), -math.sin(x)], [0, math.sin(x), math.cos(x)]])
    ry = np.array([[math.cos(y), 0, math.sin(y)], [0, 1, 0], [-math.sin(y), 0, math.cos(y)]])
    rz = np.array([[math.cos(z), -math.sin(z), 0], [math.sin(z), math.cos(z), 0], [0, 0, 1]])
    return rx @ ry @ rz


def transform(rotation, translation, scale):
    return {"rotation": [round(v, 4) for v in rotation],
            "translation": [round(v, 4) for v in translation],
            "scale": [round(v, 4) for v in scale]}


def centred(rotation, scale, centre_px, extra=(0, 0, 0)):
    """Transform that places model point `centre_px` at the context origin (+extra px)."""
    r = rot_xyz(rotation)
    c = np.array(centre_px, dtype=float) - 8.0
    t = -(r @ (scale * c)) + np.array(extra, dtype=float)
    return transform(rotation, t, [scale] * 3)


def compensate(display, delta):
    """Adjust display transforms for geometry shifted by `delta` px (delta.x must be 0)."""
    if not any(delta):
        return display
    out = {}
    d = np.array(delta, dtype=float)
    for ctx, tr in display.items():
        r = rot_xyz(tr["rotation"])
        s = np.array(tr["scale"], dtype=float)
        t = np.array(tr["translation"], dtype=float) - r @ (s * d)
        if np.any(np.abs(t) > 80):
            raise ValueError(f"display translation out of range after compensation: {ctx} {t}")
        out[ctx] = transform(tr["rotation"], t, tr["scale"])
    return out


def shift_for(bounds):
    """Shift (x always 0) that brings `bounds` inside the legal model range."""
    lo, hi = bounds
    delta = [0.0, 0.0, 0.0]
    for i in (1, 2):
        if hi[i] - lo[i] > HI - LO:
            raise ValueError(f"model extent {hi[i] - lo[i]} on axis {i} exceeds 48 units")
        if lo[i] < LO:
            delta[i] = LO - lo[i] + 0.0
        elif hi[i] > HI:
            delta[i] = HI - hi[i]
    if lo[0] < LO or hi[0] > HI:
        raise ValueError("model exceeds x bounds")
    return delta


def shifted(part: Part, delta):
    p = Part(part.name, part.animated, part.in_world)
    p.boxes = [b.translated(delta) for b in part.boxes]
    return p


# --------------------------------------------------------------------------------------------
# Display transforms per weapon category
# --------------------------------------------------------------------------------------------

THIRD_PERSON_SCALE = {"pistol": 0.55, "revolver": 0.55, "smg": 0.46, "rifle": 0.40,
                      "shotgun": 0.40, "sniper": 0.38, "lmg": 0.38}


def weapon_display(weapon, bounds):
    lo, hi = (np.array(v) for v in bounds)
    size = hi - lo
    centre = (lo + hi) / 2
    length = max(size[2], size[1] * 1.6)
    gui_scale = min(1.6, 15.0 / length)
    grip = weapon.points.get("grip", tuple(centre))
    tp_scale = THIRD_PERSON_SCALE.get(weapon.category, 0.4)
    return {
        # Item -Z already points out of the fist along the arm (see docs/ARCHITECTURE.md), so the
        # third person transform only moves the grip into the hand.
        "thirdperson_righthand": centred((0, 0, 0), tp_scale, grip, extra=(0, -0.6, 0.6)),
        "firstperson_righthand": transform((0, 0, 0), (0, 0, 0), (1, 1, 1)),
        "gui": centred((0, -90, 0), gui_scale, centre),
        "fixed": centred((0, -90, 0), gui_scale * 1.7, centre),
        "on_shelf": centred((0, -90, 0), gui_scale * 1.4, centre),
        "ground": centred((0, 0, 0), tp_scale * 0.8, centre, extra=(0, 2, 0)),
        "head": centred((0, 180, 0), tp_scale, centre, extra=(0, 10, 0)),
    }


def attachment_display(bounds):
    lo, hi = (np.array(v) for v in bounds)
    size = hi - lo
    centre = (lo + hi) / 2
    gui_scale = min(2.0, 12.0 / max(size))
    return {
        "thirdperson_righthand": centred((60, 0, 0), 0.4, centre, extra=(0, 2, 1)),
        "firstperson_righthand": centred((0, -100, 10), 0.6, centre, extra=(1, 3, 1)),
        "gui": centred((25, -135, 0), gui_scale, centre),
        "fixed": centred((0, -90, 0), gui_scale * 1.4, centre),
        "on_shelf": centred((0, -90, 0), gui_scale * 1.2, centre),
        "ground": centred((0, 0, 0), 0.5, centre, extra=(0, 2, 0)),
    }


# --------------------------------------------------------------------------------------------
# Generation
# --------------------------------------------------------------------------------------------

def model_id(path):
    return f"{NS}:{path}"


def model_ref(path):
    return {"type": "minecraft:model", "model": model_id(path)}


EMPTY = {"type": "minecraft:empty"}


def select(index, cases, fallback):
    if not cases:
        return fallback
    return {"type": "minecraft:select", "property": "minecraft:custom_model_data", "index": index,
            "cases": [{"when": w, "model": m} for w, m in cases], "fallback": fallback}


class WeaponGen:
    def __init__(self, writer: Writer, weapon, atts):
        self.w = writer
        self.weapon = weapon
        self.atts = atts
        self.base = f"item/weapon/{weapon.id}"

    # ---- geometry helpers
    def positioned_attachment(self, att, slot, barrel="default"):
        if slot == "muzzle":
            mount = self.weapon.muzzle_by_barrel.get(barrel) or self.weapon.muzzle_by_barrel["default"]
        else:
            mount = self.weapon.mounts[slot]
        return shifted(att.part, mount)

    def weapon_bounds(self):
        boxes = []
        for p in self.weapon.parts.values():
            if p.in_world:
                boxes.extend(p.boxes)
        for vs in self.weapon.variants.values():
            for p in vs.values():
                boxes.extend(p.boxes)
        lo = [min(b.frm[i] for b in boxes) for i in range(3)]
        hi = [max(b.to[i] for b in boxes) for i in range(3)]
        return lo, hi

    # ---- writers
    def write_part(self, part: Part, path_name: str, display):
        """Write base (+glow) model and skin children; return select-on-skin item model."""
        b = part.bounds()
        delta = shift_for(b)
        p = shifted(part, delta)
        disp = compensate(display, delta)
        self.w.json(f"models/{self.base}/{path_name}.json", part_model_json(p, False, display=disp))
        has_glow = part_has_glow(part)
        if has_glow:
            self.w.json(f"models/{self.base}/{path_name}_glow.json", part_model_json(p, True, display=disp))
        cases = []
        fallback = None
        for skin in SKINS:
            parent = f"{self.base}/{path_name}_glow" if (has_glow and skin in EMISSIVE_SKINS) else f"{self.base}/{path_name}"
            child = {"parent": model_id(parent), "textures": skin_textures(skin, self.weapon)}
            rel = f"{self.base}/skin/{skin}/{path_name}"
            self.w.json(f"models/{rel}.json", child)
            if skin == "standard":
                fallback = model_ref(rel)
            else:
                cases.append((f"{NS}:{skin}", model_ref(rel)))
        return select(0, cases, fallback)

    def write_attachment_model(self, att, slot, display, barrel=None):
        part = self.positioned_attachment(att, slot, barrel or "default")
        delta = shift_for(part.bounds())
        p = shifted(part, delta)
        name = att.id.split(":")[1] + (f"_{barrel.split(':')[-1]}" if barrel else "")
        rel = f"{self.base}/att/{name}"
        m = part_model_json(p, False, textures={"particle": tex("black_anodized")}, display=compensate(display, delta))
        self.w.json(f"models/{rel}.json", m)
        return model_ref(rel)

    def generate(self):
        weapon = self.weapon
        bounds = self.weapon_bounds()
        display = weapon_display(weapon, bounds)

        # Static and animated parts
        static_models, animated_models, world_models = [], {}, []
        for name, part in weapon.parts.items():
            m = self.write_part(part, name, display)
            if part.animated:
                animated_models[name] = m
            else:
                static_models.append(m)
            if part.in_world:
                world_models.append(m)

        # Variant slots (barrel / stock / magazine)
        variant_models = {}
        for slot, variants in weapon.variants.items():
            cases, fallback = [], None
            for vid, part in variants.items():
                m = self.write_part(part, f"{slot}_{vid.split(':')[-1]}", display)
                if vid == "default":
                    fallback = m
                else:
                    cases.append((vid, m))
            if fallback is None:
                fallback = EMPTY
            variant_models[slot] = select(SLOT_INDEX[slot], cases, fallback)

        # Attachment slots
        att_models = {}
        for slot in ATTACHMENT_SLOTS:
            allowed = weapon.slots.get(slot, [])
            cases = []
            for aid in allowed:
                att = self.atts[aid]
                if slot == "muzzle" and len(weapon.muzzle_by_barrel) > 1:
                    inner = []
                    for barrel in weapon.muzzle_by_barrel:
                        if barrel == "default":
                            continue
                        inner.append((barrel, self.write_attachment_model(att, slot, display, barrel)))
                    fb = self.write_attachment_model(att, slot, display)
                    cases.append((aid, select(SLOT_INDEX["barrel"], inner, fb)))
                else:
                    cases.append((aid, self.write_attachment_model(att, slot, display)))
            if cases:
                att_models[slot] = select(SLOT_INDEX[slot], cases, EMPTY)

        # Item model definitions -----------------------------------------------------------
        mag_is_animated = "magazine" in weapon.variants and "magazine" not in weapon.static_variant_slots
        full = list(world_models)
        static = list(static_models)
        for slot, m in variant_models.items():
            full.append(m)
            if slot == "magazine" and mag_is_animated:
                animated_models["magazine"] = m
            else:
                static.append(m)
        for slot, m in att_models.items():
            full.append(m)
            static.append(m)

        self.w.json(f"items/{weapon.id}.json", {
            "hand_animation_on_swap": False,
            "model": {"type": "minecraft:composite", "models": full}})
        self.w.json(f"items/fp/{weapon.id}/static.json", {
            "hand_animation_on_swap": False,
            "model": {"type": "minecraft:composite", "models": static}})
        for name, m in animated_models.items():
            self.w.json(f"items/fp/{weapon.id}/{name}.json", {"hand_animation_on_swap": False, "model": m})

        self.write_render_meta(bounds, list(animated_models))

    def write_render_meta(self, bounds, animated):
        weapon = self.weapon
        sights = {}
        if weapon.iron_sight_y is not None:
            sights["iron"] = {"y": weapon.iron_sight_y, "z": weapon.iron_sight_z}
        for aid in weapon.slots.get("optic", []):
            att = self.atts[aid]
            mount = weapon.mounts["optic"]
            sights[aid] = {"y": round(mount[1] + att.sight_height, 3), "z": round(mount[2], 3)}
        muzzle = {k: list(v) for k, v in weapon.muzzle_by_barrel.items()}
        lengths = {aid: self.atts[aid].length for aid in weapon.slots.get("muzzle", [])}
        meta = {
            "category": weapon.category,
            "bounds": {"min": [round(v, 3) for v in bounds[0]], "max": [round(v, 3) for v in bounds[1]]},
            "animated_parts": animated,
            "parts": weapon.anim,
            "points": {k: list(v) for k, v in weapon.points.items()},
            "sights": sights,
            "muzzle": muzzle,
            "muzzle_length": lengths,
        }
        self.w.json(f"weapon_render/{weapon.id}.json", meta)


def generate_attachment_items(writer: Writer, atts):
    for aid, att in atts.items():
        name = aid.split(":")[1]
        part = shifted(att.part, att.standalone_offset)
        delta = shift_for(part.bounds())
        p = shifted(part, delta)
        disp = compensate(attachment_display(part.bounds()), delta)
        m = part_model_json(p, False, textures={"particle": tex("black_anodized")}, display=disp)
        m["gui_light"] = "side"
        writer.json(f"models/item/attachment/{name}.json", m)
        writer.json(f"items/{name}.json", {"model": model_ref(f"item/attachment/{name}")})


def generate_sprite_items(writer: Writer):
    for name in AMMO_ITEMS:
        writer.json(f"models/item/ammo/{name}.json",
                    {"parent": "minecraft:item/generated", "textures": {"layer0": f"{NS}:item/ammo/{name}"}})
        writer.json(f"items/{name}.json", {"model": model_ref(f"item/ammo/{name}")})
    for name in MISC_ITEMS:
        writer.json(f"models/item/{name}.json",
                    {"parent": "minecraft:item/generated", "textures": {"layer0": f"{NS}:item/{name}"}})
        writer.json(f"items/{name}.json", {"model": model_ref(f"item/{name}")})


def generate_gunsmith_bench(writer: Writer):
    t = {k: f"{NS}:block/gunsmith_bench_{k}" for k in ("top", "side", "front", "bottom")}
    writer.json("models/block/gunsmith_bench.json", {
        "parent": "minecraft:block/cube",
        "textures": {"particle": t["side"], "up": t["top"], "down": t["bottom"], "north": t["front"],
                     "south": t["side"], "east": t["side"], "west": t["side"]}})
    writer.json("blockstates/gunsmith_bench.json", {"variants": {
        "facing=north": {"model": f"{NS}:block/gunsmith_bench"},
        "facing=east": {"model": f"{NS}:block/gunsmith_bench", "y": 90},
        "facing=south": {"model": f"{NS}:block/gunsmith_bench", "y": 180},
        "facing=west": {"model": f"{NS}:block/gunsmith_bench", "y": 270}}})
    writer.json("items/gunsmith_bench.json", {"model": model_ref("block/gunsmith_bench")})


def load_weapon(wid):
    mod = importlib.import_module(f"weapons.{wid}")
    return mod.build()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", nargs="*", help="weapon ids to generate (default: all available)")
    ap.add_argument("--preview", action="store_true", help="render preview PNGs to the scratch dir")
    ap.add_argument("--preview-dir", default=os.environ.get("CC_PREVIEW_DIR", os.path.join(ROOT, "build", "model_preview")))
    ap.add_argument("--no-clean", action="store_true")
    args = ap.parse_args()

    atts = att_lib.build_all()
    ids = args.only or [w for w in WEAPON_IDS if os.path.exists(os.path.join(HERE, "weapons", f"{w}.py"))]

    if not args.no_clean and not args.only:
        for d in ("models/item/weapon", "models/item/attachment", "items", "weapon_render"):
            shutil.rmtree(os.path.join(ASSETS, d), ignore_errors=True)

    writer = Writer(ASSETS)
    weapons = []
    for wid in ids:
        weapon = load_weapon(wid)
        for slot in ATTACHMENT_SLOTS:
            for aid in weapon.slots.get(slot, []):
                if aid not in atts:
                    raise SystemExit(f"{wid}: unknown attachment {aid}")
                if atts[aid].slot != slot:
                    raise SystemExit(f"{wid}: attachment {aid} is not a {slot}")
        WeaponGen(writer, weapon, atts).generate()
        weapons.append(weapon)
    if not args.only:
        generate_attachment_items(writer, atts)
        generate_sprite_items(writer)
        generate_gunsmith_bench(writer)

    print(f"wrote {len(writer.files)} files for weapons: {', '.join(ids)}")
    if args.preview:
        import preview
        os.makedirs(args.preview_dir, exist_ok=True)
        for weapon in weapons:
            out = preview.render_weapon(weapon, atts, args.preview_dir)
            print("preview:", out)
        print("preview:", preview.render_attachments(atts, args.preview_dir))


if __name__ == "__main__":
    main()
