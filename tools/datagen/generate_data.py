#!/usr/bin/env python3
"""
Generates CaliberCraft's data pack content (weapon/attachment/ammo/skin definitions, damage type, tags,
recipes, loot tables). Single source of truth for balance values; attachment compatibility is read from
the weapon model designs (tools/assetgen/models/weapons) so data and visuals always agree.

    python3 tools/datagen/generate_data.py
"""
import json
import os
import shutil
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
sys.path.insert(0, os.path.join(ROOT, "tools", "assetgen", "models"))
DATA = os.path.join(ROOT, "src", "main", "resources", "data")
NS = "calibercraft"


def cc(path):
    return f"{NS}:{path}"


def write(rel, obj):
    path = os.path.join(DATA, rel)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(obj, f, indent=2)
        f.write("\n")


def tl(length, cues=(), commit=None, chamber=None):
    t = {"length": length}
    if commit is not None:
        t["commit"] = commit
    if chamber is not None:
        t["chamber"] = chamber
    if cues:
        t["cues"] = [{"t": c[0], "cue": c[1]} for c in cues]
    return t


def mag_reload(tac_len, empty_len, mag_out, mag_in, commit, charge_cue, charge_t, chamber, extra_empty=()):
    return {
        "type": "magazine",
        "tactical": tl(tac_len, [(mag_out, "mag_out"), (mag_in, "mag_in")], commit=commit),
        "empty": tl(empty_len, [(mag_out, "mag_out"), (mag_in, "mag_in"), *extra_empty, (charge_t, charge_cue)], commit=commit,
                    chamber=chamber),
    }


# ------------------------------------------------------------------------------------------------ weapons
# Stats: see dev.calibercraft.core.Stat for units. Damage is in half-hearts per projectile.
WEAPONS = {
    "m9": dict(
        category="pistol", caliber="9mm", fire_modes=["semi"], action="self_loading",
        stats=dict(damage=5.0, rpm=400, magazine=15, effective_range=20, max_range=80, min_damage_mult=0.55, velocity=18,
                   gravity=0.0245, penetration=0.4, armor_penetration=0.05, headshot_mult=1.6, recoil_vertical=2.4,
                   recoil_horizontal=0.9, recoil_recovery=0.85, spread_hip=1.8, spread_ads=0.45, spread_move=1.4, spread_bloom=0.35,
                   spread_bloom_max=2.0, ads_time=4, equip_time=6, move_speed=1.0, ads_move_speed=0.85, zoom=1.1, loudness=0.8,
                   flash=0.8, sway=0.4, melee_damage=3.0),
        reload=mag_reload(28, 36, 4, 17, 18, "slide_release", 29, 30),
        cycle=tl(10, [(2, "slide_back"), (6, "slide_release")], chamber=6)),
    "revolver": dict(
        category="revolver", caliber="44_magnum", fire_modes=["semi"], action="double_action",
        stats=dict(damage=13.0, rpm=160, magazine=6, effective_range=28, max_range=100, min_damage_mult=0.6, velocity=22,
                   gravity=0.0245, penetration=0.9, armor_penetration=0.2, headshot_mult=1.75, recoil_vertical=7.5,
                   recoil_horizontal=1.6, recoil_recovery=0.8, spread_hip=2.2, spread_ads=0.35, spread_move=1.5, spread_bloom=1.2,
                   spread_bloom_max=3.5, ads_time=5, equip_time=8, move_speed=1.0, ads_move_speed=0.85, zoom=1.15, loudness=1.4,
                   flash=1.5, sway=0.6, knockback=0.3, melee_damage=3.0),
        reload={"type": "cylinder",
                "tactical": tl(52, [(3, "cylinder_open"), (10, "eject"), (30, "speedloader"), (44, "cylinder_close")], commit=34)}),
    "vector9": dict(
        category="smg", caliber="9mm", fire_modes=["auto", "burst", "semi"], burst_count=2, action="self_loading",
        stats=dict(damage=3.6, rpm=1100, magazine=30, effective_range=14, max_range=64, min_damage_mult=0.5, velocity=18,
                   gravity=0.0245, penetration=0.3, armor_penetration=0.05, headshot_mult=1.5, recoil_vertical=0.95,
                   recoil_horizontal=0.75, recoil_recovery=0.6, spread_hip=3.0, spread_ads=1.0, spread_move=1.25, spread_bloom=0.12,
                   spread_bloom_max=2.5, ads_time=4, equip_time=6, move_speed=1.0, ads_move_speed=0.85, zoom=1.1, loudness=0.9,
                   flash=0.7, sway=0.5, melee_damage=3.0),
        reload=mag_reload(34, 44, 4, 21, 22, "charge", 36, 38),
        cycle=tl(12, [(3, "charge")], chamber=8)),
    "mp5": dict(
        category="smg", caliber="9mm", fire_modes=["auto", "burst", "semi"], burst_count=3, action="self_loading",
        stats=dict(damage=4.2, rpm=800, magazine=30, effective_range=18, max_range=80, min_damage_mult=0.55, velocity=20,
                   gravity=0.0245, penetration=0.35, armor_penetration=0.05, headshot_mult=1.5, recoil_vertical=0.9,
                   recoil_horizontal=0.45, recoil_recovery=0.75, spread_hip=2.6, spread_ads=0.6, spread_move=1.25, spread_bloom=0.08,
                   spread_bloom_max=1.6, ads_time=5, equip_time=7, move_speed=1.0, ads_move_speed=0.85, zoom=1.15, loudness=0.9,
                   flash=0.8, sway=0.4, melee_damage=3.0),
        reload={"type": "magazine",
                "tactical": tl(38, [(5, "mag_out"), (23, "mag_in")], commit=24),
                "empty": tl(54, [(3, "charge_back"), (10, "mag_out"), (27, "mag_in"), (45, "charge_slap")], commit=28, chamber=46)},
        cycle=tl(12, [(2, "charge_back"), (8, "charge_slap")], chamber=9)),
    "ar15": dict(
        category="rifle", caliber="556", fire_modes=["semi", "burst", "auto"], burst_count=3, action="self_loading",
        stats=dict(damage=6.0, rpm=750, magazine=30, effective_range=48, max_range=192, min_damage_mult=0.6, velocity=45,
                   gravity=0.0245, penetration=1.2, armor_penetration=0.25, headshot_mult=1.6, recoil_vertical=1.35,
                   recoil_horizontal=0.55, recoil_recovery=0.75, spread_hip=2.8, spread_ads=0.25, spread_move=1.5, spread_bloom=0.12,
                   spread_bloom_max=2.0, ads_time=6, equip_time=9, move_speed=0.97, ads_move_speed=0.8, zoom=1.2, loudness=1.0,
                   flash=1.0, sway=0.5, melee_damage=4.0),
        reload=mag_reload(40, 50, 6, 25, 26, "bolt_release", 39, 40),
        cycle=tl(12, [(3, "charge")], chamber=9)),
    "ak": dict(
        category="rifle", caliber="762x39", fire_modes=["auto", "semi"], action="self_loading",
        stats=dict(damage=7.4, rpm=600, magazine=30, effective_range=40, max_range=160, min_damage_mult=0.6, velocity=36,
                   gravity=0.0245, penetration=1.4, armor_penetration=0.3, headshot_mult=1.6, recoil_vertical=2.0,
                   recoil_horizontal=1.2, recoil_recovery=0.65, spread_hip=3.2, spread_ads=0.45, spread_move=1.5, spread_bloom=0.2,
                   spread_bloom_max=2.8, ads_time=7, equip_time=10, move_speed=0.96, ads_move_speed=0.78, zoom=1.15, loudness=1.15,
                   flash=1.2, sway=0.6, melee_damage=4.5),
        reload=mag_reload(44, 58, 6, 27, 28, "charge", 48, 50),
        cycle=tl(14, [(3, "charge")], chamber=10)),
    "bullpup": dict(
        category="rifle", caliber="556", fire_modes=["semi", "burst", "auto"], burst_count=3, action="self_loading",
        stats=dict(damage=5.6, rpm=820, magazine=30, effective_range=44, max_range=176, min_damage_mult=0.6, velocity=44,
                   gravity=0.0245, penetration=1.1, armor_penetration=0.25, headshot_mult=1.6, recoil_vertical=1.15,
                   recoil_horizontal=0.85, recoil_recovery=0.8, spread_hip=2.5, spread_ads=0.22, spread_move=1.4, spread_bloom=0.1,
                   spread_bloom_max=1.8, ads_time=5, equip_time=8, move_speed=1.0, ads_move_speed=0.85, zoom=1.25, loudness=1.0,
                   flash=0.9, sway=0.45, melee_damage=4.0),
        reload=mag_reload(46, 58, 8, 29, 30, "charge", 48, 50),
        cycle=tl(14, [(3, "charge")], chamber=10)),
    "pump_shotgun": dict(
        category="shotgun", caliber="12_gauge", fire_modes=["semi"], action="pump",
        stats=dict(damage=2.8, pellets=9, rpm=90, magazine=6, effective_range=9, max_range=40, min_damage_mult=0.25, velocity=20,
                   gravity=0.03, penetration=0.2, armor_penetration=0.0, headshot_mult=1.25, recoil_vertical=6.0,
                   recoil_horizontal=1.5, recoil_recovery=0.85, spread_hip=4.5, spread_ads=3.5, spread_move=1.1, spread_bloom=0,
                   spread_bloom_max=0, ads_time=6, equip_time=9, move_speed=0.96, ads_move_speed=0.8, zoom=1.1, loudness=1.3,
                   flash=1.4, sway=0.5, knockback=0.4, melee_damage=5.0),
        reload={"type": "single", "single": {
            "start": tl(6), "per_round": 10, "round_commit": 6, "round_cue": "shell_insert",
            "end": tl(6), "end_empty": tl(14, [(3, "pump_back"), (9, "pump_forward")], chamber=10)}},
        cycle=tl(13, [(2, "pump_back"), (8, "pump_forward")], chamber=9)),
    "auto_shotgun": dict(
        category="shotgun", caliber="12_gauge", fire_modes=["semi"], action="self_loading",
        stats=dict(damage=2.4, pellets=8, rpm=260, magazine=8, effective_range=8, max_range=36, min_damage_mult=0.25, velocity=20,
                   gravity=0.03, penetration=0.2, armor_penetration=0.0, headshot_mult=1.25, recoil_vertical=4.2,
                   recoil_horizontal=1.4, recoil_recovery=0.8, spread_hip=5.5, spread_ads=4.2, spread_move=1.1, spread_bloom=0.4,
                   spread_bloom_max=2.0, ads_time=6, equip_time=10, move_speed=0.95, ads_move_speed=0.8, zoom=1.1, loudness=1.25,
                   flash=1.3, sway=0.55, knockback=0.3, melee_damage=5.0),
        reload=mag_reload(44, 56, 6, 27, 28, "charge", 46, 48),
        cycle=tl(14, [(3, "charge")], chamber=10)),
    "sniper": dict(
        category="sniper", caliber="338", fire_modes=["semi"], action="bolt",
        stats=dict(damage=26.0, rpm=60, magazine=5, effective_range=160, max_range=400, min_damage_mult=0.75, velocity=50,
                   gravity=0.0245, penetration=3.0, armor_penetration=0.55, headshot_mult=2.0, recoil_vertical=7.0,
                   recoil_horizontal=1.2, recoil_recovery=0.7, spread_hip=9.0, spread_ads=0.03, spread_move=1.6, spread_bloom=0,
                   spread_bloom_max=0, ads_time=10, equip_time=14, move_speed=0.92, ads_move_speed=0.65, zoom=1.3, loudness=1.6,
                   flash=1.4, sway=1.2, knockback=0.6, melee_damage=5.0),
        reload={"type": "magazine",
                "tactical": tl(46, [(6, "mag_out"), (27, "mag_in")], commit=28),
                "empty": tl(64, [(6, "mag_out"), (27, "mag_in"), (42, "bolt_up"), (45, "bolt_back"), (51, "bolt_forward"),
                                 (55, "bolt_down")], commit=28, chamber=54)},
        cycle=tl(18, [(2, "bolt_up"), (5, "bolt_back"), (11, "bolt_forward"), (15, "bolt_down")], chamber=13),
        default_attachments={"optic": cc("sniper_scope")}),
    "dmr": dict(
        category="rifle", caliber="308", fire_modes=["semi"], action="self_loading",
        stats=dict(damage=11.0, rpm=300, magazine=20, effective_range=96, max_range=300, min_damage_mult=0.7, velocity=48,
                   gravity=0.0245, penetration=2.0, armor_penetration=0.4, headshot_mult=1.75, recoil_vertical=3.0,
                   recoil_horizontal=0.8, recoil_recovery=0.75, spread_hip=4.0, spread_ads=0.1, spread_move=1.5, spread_bloom=0.4,
                   spread_bloom_max=2.4, ads_time=8, equip_time=11, move_speed=0.95, ads_move_speed=0.75, zoom=1.25, loudness=1.3,
                   flash=1.1, sway=0.7, melee_damage=4.5),
        reload=mag_reload(42, 54, 6, 26, 27, "charge", 44, 46),
        cycle=tl(13, [(3, "charge")], chamber=9),
        default_attachments={"optic": cc("acog_scope")}),
    "lmg": dict(
        category="lmg", caliber="556", fire_modes=["auto"], action="self_loading",
        stats=dict(damage=5.4, rpm=720, magazine=100, effective_range=48, max_range=192, min_damage_mult=0.6, velocity=44,
                   gravity=0.0245, penetration=1.3, armor_penetration=0.25, headshot_mult=1.5, recoil_vertical=1.1,
                   recoil_horizontal=0.95, recoil_recovery=0.6, spread_hip=4.0, spread_ads=0.6, spread_move=1.6, spread_bloom=0.08,
                   spread_bloom_max=3.5, ads_time=12, equip_time=18, move_speed=0.86, ads_move_speed=0.7, zoom=1.15, loudness=1.2,
                   flash=1.2, sway=0.9, heat_per_shot=0.011, heat_cooling=0.012, melee_damage=5.0),
        reload={"type": "magazine",
                "tactical": tl(92, [(4, "cover_open"), (18, "box_out"), (42, "box_in"), (56, "belt"), (72, "cover_close")], commit=60),
                "empty": tl(104, [(4, "cover_open"), (18, "box_out"), (42, "box_in"), (56, "belt"), (72, "cover_close"),
                                  (92, "charge")], commit=60, chamber=96)},
        cycle=tl(14, [(3, "charge")], chamber=10)),
}

# ------------------------------------------------------------------------------------------------ attachments


def m(stat, op, value):
    return {"stat": stat, "op": op, "value": value}


ATTACHMENTS = {
    "red_dot": ("optic", [m("zoom", "multiply", 1.25), m("spread_ads", "multiply", 0.9), m("ads_time", "add", 0.5)],
                [], {"reticle": "red_dot"}),
    "holo_sight": ("optic", [m("zoom", "multiply", 1.3), m("spread_ads", "multiply", 0.88), m("ads_time", "add", 1)],
                   [], {"reticle": "holo"}),
    "acog_scope": ("optic", [m("zoom", "multiply", 2.6), m("spread_ads", "multiply", 0.7), m("ads_time", "add", 2),
                             m("ads_move_speed", "multiply", 0.92), m("sway", "multiply", 1.15)], [], {"reticle": "acog", "overlay": True}),
    "sniper_scope": ("optic", [m("zoom", "multiply", 6.0), m("spread_ads", "multiply", 0.5), m("ads_time", "add", 4),
                               m("ads_move_speed", "multiply", 0.85), m("sway", "multiply", 1.4)], [], {"reticle": "scope", "overlay": True}),
    "suppressor": ("muzzle", [m("loudness", "multiply", 0.3), m("flash", "multiply", 0.1), m("velocity", "multiply", 0.93),
                              m("effective_range", "multiply", 0.92), m("recoil_vertical", "multiply", 0.92), m("ads_time", "add", 1)],
                   ["suppressed"], None),
    "compensator": ("muzzle", [m("recoil_vertical", "multiply", 0.8), m("recoil_horizontal", "multiply", 0.9),
                               m("flash", "multiply", 1.15), m("loudness", "multiply", 1.05)], [], None),
    "muzzle_brake": ("muzzle", [m("recoil_vertical", "multiply", 0.88), m("recoil_horizontal", "multiply", 0.75),
                                m("loudness", "multiply", 1.15), m("flash", "multiply", 1.25)], [], None),
    "flash_hider": ("muzzle", [m("flash", "multiply", 0.4), m("recoil_vertical", "multiply", 0.95)], [], None),
    "shotgun_choke": ("muzzle", [m("spread_hip", "multiply", 0.7), m("spread_ads", "multiply", 0.65),
                                 m("effective_range", "multiply", 1.2), m("recoil_vertical", "multiply", 1.05)], [], None),
    "short_barrel": ("barrel", [m("ads_time", "add", -1), m("move_speed", "multiply", 1.02), m("effective_range", "multiply", 0.75),
                                m("velocity", "multiply", 0.85), m("spread_hip", "multiply", 0.9), m("recoil_vertical", "multiply", 1.12),
                                m("flash", "multiply", 1.2)], [], None),
    "precision_barrel": ("barrel", [m("effective_range", "multiply", 1.3), m("velocity", "multiply", 1.12),
                                    m("spread_ads", "multiply", 0.8), m("ads_time", "add", 1), m("move_speed", "multiply", 0.98)], [], None),
    "heavy_barrel": ("barrel", [m("recoil_vertical", "multiply", 0.88), m("effective_range", "multiply", 1.15),
                                m("heat_cooling", "multiply", 1.3), m("ads_time", "add", 2), m("move_speed", "multiply", 0.96),
                                m("sway", "multiply", 0.85)], [], None),
    "vertical_grip": ("grip", [m("recoil_vertical", "multiply", 0.85), m("ads_time", "add", 0.5), m("sway", "multiply", 0.9)], [], None),
    "angled_grip": ("grip", [m("ads_time", "add", -1), m("recoil_horizontal", "multiply", 0.9), m("recoil_vertical", "multiply", 0.95)],
                    [], None),
    "ergonomic_grip": ("grip", [m("spread_hip", "multiply", 0.85), m("spread_move", "multiply", 0.9), m("equip_time", "multiply", 0.85)],
                       [], None),
    "bipod": ("grip", [m("recoil_vertical", "multiply", 0.97)], ["bipod"], None),
    "lightweight_stock": ("stock", [m("ads_time", "add", -1.5), m("move_speed", "multiply", 1.03), m("ads_move_speed", "multiply", 1.08),
                                    m("recoil_vertical", "multiply", 1.12), m("sway", "multiply", 1.15)], [], None),
    "precision_stock": ("stock", [m("recoil_vertical", "multiply", 0.88), m("recoil_recovery", "add", 0.1), m("sway", "multiply", 0.8),
                                  m("ads_time", "add", 1), m("move_speed", "multiply", 0.98)], [], None),
    "extended_mag": ("magazine", [m("magazine", "multiply", 1.5), m("reload_speed", "multiply", 0.88), m("ads_time", "add", 0.5),
                                  m("move_speed", "multiply", 0.99)], [], None),
    "quick_mag": ("magazine", [m("reload_speed", "multiply", 1.3), m("ads_time", "add", 0.5), m("move_speed", "multiply", 0.99)], [], None),
    "laser_sight": ("tactical", [m("spread_hip", "multiply", 0.75), m("spread_move", "multiply", 0.92)], ["laser"], None),
    "charm_creeper": ("charm", [], [], None),
    "charm_diamond": ("charm", [], [], None),
    "charm_dogtag": ("charm", [], [], None),
}

# ------------------------------------------------------------------------------------------------ ammunition
HP = [m("damage", "multiply", 1.2), m("armor_penetration", "multiply", 0.3), m("penetration", "multiply", 0.3)]
AP = [m("damage", "multiply", 0.9), m("armor_penetration", "add", 0.35), m("penetration", "add", 1.0)]
AMMO = {
    "9mm": ("9mm", "ammo_9mm", [], 0, "#FFD27F", 0),
    "9mm_hp": ("9mm", "ammo_9mm_hp", HP, 0, "#FFB070", 1),
    "44": ("44_magnum", "ammo_44", [], 0, "#FFD27F", 0),
    "44_hp": ("44_magnum", "ammo_44_hp", HP, 0, "#FFB070", 1),
    "556": ("556", "ammo_556", [], 0, "#FFD27F", 0),
    "556_ap": ("556", "ammo_556_ap", AP, 0, "#B0D0FF", 1),
    "762": ("762x39", "ammo_762", [], 0, "#FFD27F", 0),
    "762_ap": ("762x39", "ammo_762_ap", AP, 0, "#B0D0FF", 1),
    "308": ("308", "ammo_308", [], 0, "#FFD27F", 0),
    "308_ap": ("308", "ammo_308_ap", AP, 0, "#B0D0FF", 1),
    "338": ("338", "ammo_338", [], 0, "#FFD27F", 0),
    "338_ap": ("338", "ammo_338_ap", AP, 0, "#B0D0FF", 1),
    "12g_buckshot": ("12_gauge", "shell_buckshot", [], 0, "#FFE0A0", 0),
    "12g_slug": ("12_gauge", "shell_slug", [m("pellets", "multiply", 0), m("damage", "multiply", 6.5), m("spread_hip", "multiply", 0.35),
                                            m("spread_ads", "multiply", 0.15), m("effective_range", "multiply", 3.5),
                                            m("max_range", "multiply", 3.5), m("penetration", "add", 1.0), m("velocity", "multiply", 1.1),
                                            m("recoil_vertical", "multiply", 1.2)], 0, "#FFE0A0", 1),
    "12g_incendiary": ("12_gauge", "shell_incendiary", [m("damage", "multiply", 0.75), m("effective_range", "multiply", 0.7),
                                                        m("max_range", "multiply", 0.7)], 4, "#FF7020", 2),
}

SKINS = [
    ("standard", "common", False, "#3A3D42"), ("matte_black", "common", False, "#1C1C1E"), ("desert_tan", "common", False, "#B79A6A"),
    ("woodland", "common", False, "#4E5A33"), ("arctic", "common", False, "#D8DEE4"), ("digital", "common", False, "#6C7A88"),
    ("industrial", "common", False, "#8C8E90"), ("worn", "common", False, "#4A4644"), ("neon", "rare", True, "#20E0FF"),
    ("energy", "legendary", True, "#9040FF"),
]


def weapon_slots(wid):
    """Allowed attachments per slot, read from the model design so visuals and data always match."""
    import importlib
    w = importlib.import_module(f"weapons.{wid}").build()
    slots = {s: list(ids) for s, ids in w.slots.items() if ids}
    for slot, variants in w.variants.items():
        ids = [v for v in variants if v != "default"]
        if ids:
            slots[slot] = ids
    return slots


def gen_definitions():
    for wid, d in WEAPONS.items():
        obj = {"category": d["category"], "caliber": cc(d["caliber"]), "fire_modes": d["fire_modes"], "action": d["action"]}
        if "burst_count" in d:
            obj["burst_count"] = d["burst_count"]
        obj["stats"] = d["stats"]
        obj["reload"] = d["reload"]
        if "cycle" in d:
            obj["cycle"] = d["cycle"]
        obj["attachments"] = weapon_slots(wid)
        if "default_attachments" in d:
            obj["default_attachments"] = d["default_attachments"]
        write(f"{NS}/{NS}/weapon/{wid}.json", obj)
    for aid, (slot, mods, flags, optic) in ATTACHMENTS.items():
        obj = {"slot": slot, "item": cc(aid)}
        if mods:
            obj["modifiers"] = mods
        if flags:
            obj["flags"] = flags
        if optic:
            obj["optic"] = optic
        write(f"{NS}/{NS}/attachment/{aid}.json", obj)
    for aid, (caliber, item, mods, fire, tracer, order) in AMMO.items():
        obj = {"caliber": cc(caliber), "item": cc(item), "order": order, "tracer_color": tracer}
        if mods:
            obj["modifiers"] = mods
        if fire:
            obj["fire_seconds"] = fire
        write(f"{NS}/{NS}/ammo/{aid}.json", obj)
    for i, (sid, rarity, kit, swatch) in enumerate(SKINS):
        write(f"{NS}/{NS}/skin/{sid}.json", {"rarity": rarity, "requires_kit": kit, "swatch": swatch, "order": i})


def gen_damage_and_tags():
    write(f"{NS}/damage_type/bullet.json", {"message_id": "calibercraft.bullet", "exhaustion": 0.1, "scaling": "never"})
    for tag in ("is_projectile", "bypasses_cooldown", "no_knockback", "bypasses_armor"):
        write(f"minecraft/tags/damage_type/{tag}.json", {"replace": False, "values": [cc("bullet")]})

    def opt(t):
        return {"id": t, "required": False}

    write(f"{NS}/tags/block/gun_interactable.json", {"values": [
        cc("gunsmith_bench"), "#minecraft:doors", "#minecraft:trapdoors", "#minecraft:fence_gates", "#minecraft:buttons",
        "minecraft:lever", "minecraft:chest", "minecraft:trapped_chest", "minecraft:ender_chest", "minecraft:barrel",
        "#minecraft:shulker_boxes", "#minecraft:copper_chests", "minecraft:crafting_table", "minecraft:furnace", "minecraft:blast_furnace",
        "minecraft:smoker", "#minecraft:anvil", "minecraft:smithing_table", "minecraft:grindstone", "minecraft:stonecutter",
        "minecraft:loom", "minecraft:cartography_table", "minecraft:enchanting_table", "minecraft:brewing_stand", "#minecraft:beds",
        "minecraft:lectern", "minecraft:hopper", "minecraft:dispenser", "minecraft:dropper", "minecraft:crafter", "minecraft:repeater",
        "minecraft:comparator", "minecraft:note_block", "minecraft:jukebox", "minecraft:bell", "minecraft:respawn_anchor",
        "minecraft:beacon"]})
    write(f"{NS}/tags/block/shatterable.json", {"values": [
        "minecraft:glass", "minecraft:glass_pane", "minecraft:tinted_glass",
        opt("#c:glass_blocks"), opt("#c:glass_panes"),
        *[f"minecraft:{c}_stained_glass" for c in COLORS], *[f"minecraft:{c}_stained_glass_pane" for c in COLORS]]})
    write(f"{NS}/tags/block/bullet_passable.json", {"values": [
        "#minecraft:leaves", "#minecraft:wool_carpets", "minecraft:moss_carpet", "minecraft:pale_moss_carpet", "minecraft:scaffolding",
        "minecraft:snow", "minecraft:iron_chain", "minecraft:vine", "minecraft:glow_lichen", "minecraft:cobweb"]})
    write(f"{NS}/tags/block/ricochet_surfaces.json", {"values": [
        "minecraft:obsidian", "minecraft:crying_obsidian", "minecraft:bedrock", "minecraft:iron_block", "minecraft:iron_door",
        "minecraft:iron_trapdoor", "minecraft:iron_bars", "#minecraft:anvil"]})
    write(f"{NS}/tags/entity_type/no_headshot.json", {"values": [
        "minecraft:slime", "minecraft:magma_cube", "minecraft:shulker", "minecraft:ghast", "minecraft:ender_dragon",
        "minecraft:guardian", "minecraft:elder_guardian", "minecraft:armor_stand"]})


COLORS = ["white", "orange", "magenta", "light_blue", "yellow", "lime", "pink", "gray", "light_gray", "cyan", "purple", "blue",
          "brown", "green", "red", "black"]


# ------------------------------------------------------------------------------------------------ recipes
def shaped(name, pattern, key, result, count=1, category="equipment"):
    write(f"{NS}/recipe/{name}.json", {"type": "minecraft:crafting_shaped", "category": category, "key": key, "pattern": pattern,
                                       "result": {"count": count, "id": result}})


def shapeless(name, ingredients, result, count=1, category="misc"):
    write(f"{NS}/recipe/{name}.json", {"type": "minecraft:crafting_shapeless", "category": category, "ingredients": ingredients,
                                       "result": {"count": count, "id": result}})


def gen_recipes():
    I, N, G, X, P = "minecraft:iron_ingot", "minecraft:iron_nugget", cc("gun_parts"), cc("precision_parts"), "#minecraft:planks"
    C, GP, R = "minecraft:copper_ingot", "minecraft:gunpowder", "minecraft:redstone"
    shaped("gun_parts", [" I ", "CRC", " I "], {"I": I, "C": C, "R": R}, G, 2, "misc")
    shapeless("precision_parts", ["minecraft:diamond", G, G, "minecraft:gold_ingot", R], X, 2)
    shapeless("prismatic_finish_kit", ["minecraft:amethyst_shard", "minecraft:amethyst_shard", "minecraft:glowstone_dust",
                                       "minecraft:prismarine_crystals", N], cc("prismatic_finish_kit"))
    shaped("gunsmith_bench", ["III", "GTG", "P P"], {"I": I, "G": G, "T": "minecraft:crafting_table", "P": P}, cc("gunsmith_bench"),
           1, "misc")
    weapon_patterns = {
        "m9": (["III", " GP"], {}),
        "revolver": (["IIG", " GP"], {}),
        "vector9": (["IIG", "GGI", " I "], {}),
        "mp5": (["IIG", "GGI", "I  "], {}),
        "ar15": (["IIG", "XGI", "I  "], {}),
        "ak": (["IIG", "PGI", "P  "], {}),
        "bullpup": (["IGI", "XGI", " I "], {}),
        "pump_shotgun": (["III", "PGP", "  P"], {}),
        "auto_shotgun": (["III", "XGG", "  I"], {}),
        "sniper": (["XII", "GXI", "P  "], {}),
        "dmr": (["XII", "GGI", "I  "], {}),
        "lmg": (["III", "XGG", "IXI"], {}),
    }
    base_key = {"I": I, "G": G, "X": X, "P": P}
    for wid, (pattern, extra) in weapon_patterns.items():
        used = set("".join(pattern)) - {" "}
        shaped(wid, pattern, {k: v for k, v in {**base_key, **extra}.items() if k in used}, cc(wid))
    ammo = {
        "ammo_9mm": ([C, GP, N], 16), "ammo_44": ([C, GP, GP, N, N], 8), "ammo_556": ([C, C, GP, GP, N], 20),
        "ammo_762": ([C, C, GP, GP, N, N], 20), "ammo_308": ([C, C, C, GP, GP, N, N], 16), "ammo_338": ([C, C, C, GP, GP, GP, I], 10),
        "shell_buckshot": (["minecraft:paper", GP, N, "minecraft:red_dye"], 8),
        "shell_slug": (["minecraft:paper", GP, I, "minecraft:green_dye"], 6),
        "shell_incendiary": (["minecraft:paper", GP, "minecraft:blaze_powder", "minecraft:orange_dye"], 6),
    }
    for name, (ing, count) in ammo.items():
        shapeless(name, ing, cc(name), count)
    for base in ("9mm", "44"):
        shapeless(f"ammo_{base}_hp", [cc(f"ammo_{base}")] * 4 + ["minecraft:flint"], cc(f"ammo_{base}_hp"), 4)
    for base in ("556", "762", "308", "338"):
        shapeless(f"ammo_{base}_ap", [cc(f"ammo_{base}")] * 4 + [I, "minecraft:flint"], cc(f"ammo_{base}_ap"), 4)
    glass = "minecraft:glass_pane"
    att = {
        "red_dot": [G, glass, R, I], "holo_sight": [G, glass, R, "minecraft:glowstone_dust"],
        "acog_scope": [X, glass, glass, I], "sniper_scope": [X, glass, glass, "minecraft:spyglass", I],
        "suppressor": [G, I, I, "minecraft:white_wool"], "compensator": [G, I, N, N], "muzzle_brake": [G, I, I, N],
        "flash_hider": [G, N, N, N], "shotgun_choke": [G, I, C], "short_barrel": [G, I], "precision_barrel": [X, I, I],
        "heavy_barrel": [G, "minecraft:iron_block"], "vertical_grip": [G, "minecraft:stick", "minecraft:leather"],
        "angled_grip": [G, "minecraft:stick", "minecraft:stick", "minecraft:leather"], "ergonomic_grip": [G, "minecraft:leather", "minecraft:leather"],
        "bipod": [G, "minecraft:stick", "minecraft:stick", I], "lightweight_stock": [G, "minecraft:stick", "minecraft:stick", "minecraft:stick"],
        "precision_stock": [X, P, P, "minecraft:leather"], "extended_mag": [G, I, I, I], "quick_mag": [G, I, "minecraft:slime_ball"],
        "laser_sight": [G, R, R, glass], "charm_creeper": ["minecraft:string", GP, "minecraft:lime_dye"],
        "charm_diamond": ["minecraft:string", "minecraft:diamond"], "charm_dogtag": ["minecraft:string", N, N],
    }
    for name, ing in att.items():
        shapeless(name, ing, cc(name), 1)


# ------------------------------------------------------------------------------------------------ loot
def entry(item, weight, lo=1, hi=1):
    e = {"type": "minecraft:item", "name": item, "weight": weight}
    if hi > 1:
        e["functions"] = [{"function": "minecraft:set_count", "count": {"type": "minecraft:uniform", "min": lo, "max": hi}}]
    return e


def gen_loot():
    def table(name, rolls, entries):
        write(f"{NS}/loot_table/inject/{name}.json", {"type": "minecraft:chest", "pools": [{"rolls": rolls, "entries": entries}]})

    empty = lambda w: {"type": "minecraft:empty", "weight": w}  # noqa: E731
    table("common", 1, [empty(40), entry(cc("ammo_9mm"), 10, 4, 12), entry(cc("shell_buckshot"), 6, 2, 6), entry(cc("ammo_556"), 6, 4, 10),
                        entry(cc("gun_parts"), 6, 1, 2), entry(cc("m9"), 2), entry(cc("compensator"), 2), entry(cc("flash_hider"), 2),
                        entry(cc("red_dot"), 2), entry(cc("charm_dogtag"), 2)])
    table("military", {"type": "minecraft:uniform", "min": 1, "max": 2}, [
        empty(20), entry(cc("ammo_556"), 10, 6, 16), entry(cc("ammo_762"), 8, 6, 16), entry(cc("ammo_9mm"), 8, 8, 20),
        entry(cc("gun_parts"), 8, 1, 3), entry(cc("precision_parts"), 3), entry(cc("m9"), 3), entry(cc("mp5"), 3), entry(cc("vector9"), 2),
        entry(cc("ar15"), 2), entry(cc("ak"), 2), entry(cc("pump_shotgun"), 2), entry(cc("red_dot"), 3), entry(cc("holo_sight"), 2),
        entry(cc("vertical_grip"), 3), entry(cc("suppressor"), 2), entry(cc("extended_mag"), 2), entry(cc("acog_scope"), 1), entry(cc("dmr"), 1)])
    table("rare", {"type": "minecraft:uniform", "min": 1, "max": 2}, [
        empty(10), entry(cc("ammo_308"), 8, 6, 14), entry(cc("ammo_338"), 5, 3, 8), entry(cc("precision_parts"), 6, 1, 2),
        entry(cc("prismatic_finish_kit"), 4), entry(cc("sniper"), 2), entry(cc("lmg"), 2), entry(cc("dmr"), 2), entry(cc("bullpup"), 2),
        entry(cc("auto_shotgun"), 2), entry(cc("revolver"), 2), entry(cc("sniper_scope"), 2), entry(cc("acog_scope"), 3),
        entry(cc("suppressor"), 3), entry(cc("precision_barrel"), 2), entry(cc("heavy_barrel"), 2), entry(cc("ammo_556_ap"), 3, 4, 10)])
    write(f"{NS}/loot_table/blocks/gunsmith_bench.json", {"type": "minecraft:block", "pools": [{
        "rolls": 1, "entries": [{"type": "minecraft:item", "name": cc("gunsmith_bench")}],
        "conditions": [{"condition": "minecraft:survives_explosion"}]}]})
    write("minecraft/tags/block/mineable/axe.json", {"replace": False, "values": [cc("gunsmith_bench")]})


def main():
    for d in (f"{NS}/{NS}", f"{NS}/recipe", f"{NS}/loot_table"):
        shutil.rmtree(os.path.join(DATA, d), ignore_errors=True)
    gen_definitions()
    gen_damage_and_tags()
    gen_recipes()
    gen_loot()
    print("data generated in", DATA)


if __name__ == "__main__":
    main()
