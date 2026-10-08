"""Hand-designed core assets: the portal gun 3D model, portal fluid, recipes, advancements, core lang."""
import json
import os

from . import portal_art


def _w(path, obj):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(obj, f, indent=2)
        f.write("\n")


def _face(tex, uv=None, cull=None, rotation=None, tint=None):
    f = {"texture": tex}
    if uv:
        f["uv"] = uv
    if rotation:
        f["rotation"] = rotation
    return f


def _box(frm, to, tex, faces=None, rotation=None, name=None, uv_all=None):
    """Element with the same texture on every face (uv auto from the box unless given)."""
    fx, fy, fz = frm
    tx, ty, tz = to
    auto = {
        "north": [16 - tx, 16 - ty, 16 - fx, 16 - fy],
        "south": [fx, 16 - ty, tx, 16 - fy],
        "east": [16 - tz, 16 - ty, 16 - fz, 16 - fy],
        "west": [fz, 16 - ty, tz, 16 - fy],
        "up": [fx, fz, tx, tz],
        "down": [fx, 16 - tz, tx, 16 - fz],
    }
    out_faces = {}
    for side in ("north", "south", "east", "west", "up", "down"):
        t = (faces or {}).get(side, tex)
        if t is None:
            continue
        uv = uv_all or [max(0, min(16, v)) for v in auto[side]]
        out_faces[side] = {"texture": t, "uv": uv}
    e = {"from": list(frm), "to": list(to), "faces": out_faces}
    if rotation:
        e["rotation"] = rotation
    if name:
        e["name"] = name
    return e


def portal_gun_model():
    body, dark, screen, button, can = "#body", "#dark", "#screen", "#button", "#canister"
    full = [0, 0, 16, 16]
    els = [
        # main body (front of the gun points north / -Z)
        _box((5, 4, 2), (11, 7.5, 13), body, name="body"),
        # bevel strip around the body
        _box((4.75, 5.5, 2.5), (11.25, 6, 12.5), dark, name="trim"),
        # front emitter collar
        _box((6, 4.5, 1.25), (10, 7, 2), dark, name="emitter"),
        # three green lights on the front face
        _box((6.1, 5.0, 0.9), (7.1, 6.0, 1.25), button, uv_all=full, name="light1"),
        _box((7.5, 5.0, 0.9), (8.5, 6.0, 1.25), button, uv_all=full, name="light2"),
        _box((8.9, 5.0, 0.9), (9.9, 6.0, 1.25), button, uv_all=full, name="light3"),
        # canister base ring
        _box((6, 7.5, 2.75), (10, 8.25, 6.75), dark, name="canister_base"),
        # glowing canister: two boxes, one turned 45 degrees -> octagonal glass tube
        _box((6.75, 8.25, 3.5), (9.25, 11.5, 6), can, uv_all=full, name="canister_a"),
        _box((6.75, 8.25, 3.5), (9.25, 11.5, 6), can, uv_all=full, name="canister_b",
             rotation={"angle": 45, "axis": "y", "origin": [8, 9, 4.75]}),
        _box((7.25, 11.5, 4), (8.75, 12, 5.5), dark, name="canister_cap"),
        # display housing + screen on top at the back
        _box((6.25, 7.5, 8), (9.75, 8.5, 12), dark, faces={"up": screen}, name="display"),
        # handle at the back, angled down
        _box((6.75, 1.0, 10.5), (9.25, 4.5, 13), dark, name="handle",
             rotation={"angle": -22.5, "axis": "x", "origin": [8, 4, 12]}),
        _box((6.5, 0.25, 10.25), (9.5, 1.25, 12.75), body, name="handle_cap",
             rotation={"angle": -22.5, "axis": "x", "origin": [8, 4, 12]}),
    ]
    return {
        "credit": "Portal Gun Multiverse",
        "texture_size": [16, 16],
        "textures": {
            "particle": "portalgun:item/gun_body",
            "body": "portalgun:item/gun_body",
            "dark": "portalgun:item/gun_dark",
            "screen": "portalgun:item/gun_screen",
            "button": "portalgun:item/gun_button",
            "canister": "portalgun:item/gun_canister",
        },
        "elements": els,
        "display": {
            "thirdperson_righthand": {"rotation": [0, 0, 0], "translation": [0, 2.5, -2.5], "scale": [0.8, 0.8, 0.8]},
            "thirdperson_lefthand": {"rotation": [0, 0, 0], "translation": [0, 2.5, -2.5], "scale": [0.8, 0.8, 0.8]},
            "firstperson_righthand": {"rotation": [0, 5, 0], "translation": [1.5, 3.5, -1], "scale": [0.85, 0.85, 0.85]},
            "firstperson_lefthand": {"rotation": [0, -5, 0], "translation": [1.5, 3.5, -1], "scale": [0.85, 0.85, 0.85]},
            "ground": {"rotation": [0, 0, 0], "translation": [0, 2, 0], "scale": [0.6, 0.6, 0.6]},
            "gui": {"rotation": [25, -140, 0], "translation": [0, 0.5, 0], "scale": [0.85, 0.85, 0.85]},
            "head": {"rotation": [0, 180, 0], "translation": [0, 13, 7], "scale": [1, 1, 1]},
            "fixed": {"rotation": [0, 90, 0], "translation": [0, 0, 0], "scale": [1, 1, 1]},
        },
    }


LANG = {
    "item.portalgun.portal_gun": "Portal Gun",
    "item.portalgun.portal_fluid": "Portal Fluid",
    "entity.portalgun.portal": "Portal",
    "entity.portalgun.portal_shot": "Portal Shot",
    "itemGroup.portalgun.main": "Portal Gun Multiverse",
    "itemGroup.portalgun.blocks": "Multiverse Blocks",
    "itemGroup.portalgun.creatures": "Multiverse Creatures",
    "message.portalgun.unknown_dimension": "Dimension %s is not reachable",
    "message.portalgun.same_dimension": "You're already in %s!",
    "message.portalgun.empty": "Out of portal fluid! Carry a bottle of Portal Fluid to reload.",
    "message.portalgun.reloaded": "*glug glug* Portal fluid topped up (%s charges)",
    "message.portalgun.dialed": "Dialed %s %s",
    "tooltip.portalgun.destination": "Destination: %s %s",
    "tooltip.portalgun.charges": "Portal fluid: %s / %s",
    "tooltip.portalgun.controls": "Use: shoot a portal  |  Sneak + Use: open the dial",
    "tooltip.portalgun.portal_fluid": "Reloads %s portal gun charges automatically when the gun runs dry",
    "screen.portalgun.dial": "INTERDIMENSIONAL DIAL",
    "screen.portalgun.search": "Search dimensions...",
    "screen.portalgun.random": "Random",
    "particle.portalgun.portal_spark": "Portal Spark",
}


def recipes(data_dir):
    _w(os.path.join(data_dir, "recipe", "portal_gun.json"), {
        "type": "minecraft:crafting_shaped",
        "category": "equipment",
        "key": {"F": "portalgun:portal_fluid", "I": "minecraft:iron_ingot", "E": "minecraft:ender_eye",
                "R": "minecraft:redstone", "Q": "minecraft:quartz", "G": "minecraft:lime_stained_glass"},
        "pattern": [" G ", "QFR", "IEI"],
        "result": {"count": 1, "id": "portalgun:portal_gun"},
    })
    _w(os.path.join(data_dir, "recipe", "portal_fluid.json"), {
        "type": "minecraft:crafting_shapeless",
        "category": "misc",
        "ingredients": ["minecraft:glass_bottle", "minecraft:ender_pearl", "minecraft:slime_ball",
                        "minecraft:glowstone_dust", "minecraft:lime_dye"],
        "result": {"count": 2, "id": "portalgun:portal_fluid"},
    })


def advancements(data_dir, lang, dims):
    adv = os.path.join(data_dir, "advancement")
    root = {
        "criteria": {"has_gun": {"trigger": "minecraft:inventory_changed",
                                 "conditions": {"items": [{"items": "portalgun:portal_gun"}]}}},
        "display": {
            "icon": {"id": "portalgun:portal_gun"},
            "title": {"translate": "advancements.portalgun.root.title"},
            "description": {"translate": "advancements.portalgun.root.description"},
            "background": "minecraft:gui/advancements/backgrounds/end",
            "show_toast": True, "announce_to_chat": False,
        },
        "requirements": [["has_gun"]],
    }
    _w(os.path.join(adv, "root.json"), root)
    lang["advancements.portalgun.root.title"] = "Wubba Lubba Dub Dub"
    lang["advancements.portalgun.root.description"] = "Get your hands on a Portal Gun"
    tiers = [(1, "first_jump", "Interdimensional Tourist", "Step through a portal into another dimension", "task"),
             (10, "ten", "Frequent Flyer", "Visit 10 portal gun dimensions", "task"),
             (25, "twenty_five", "Multiverse Explorer", "Visit 25 portal gun dimensions", "goal"),
             (len(dims), "all", "Infinite Realities", f"Visit all {len(dims)} portal gun dimensions", "challenge")]
    parent = "portalgun:root"
    for count, name, title, desc, frame in tiers:
        _w(os.path.join(adv, f"{name}.json"), {
            "parent": parent,
            "criteria": {"visited": {"trigger": "portalgun:visited_dimension", "conditions": {"count": count}}},
            "display": {
                "icon": {"id": "portalgun:portal_fluid"},
                "title": {"translate": f"advancements.portalgun.{name}.title"},
                "description": {"translate": f"advancements.portalgun.{name}.description"},
                "frame": frame,
            },
            "requirements": [["visited"]],
        })
        lang[f"advancements.portalgun.{name}.title"] = title
        lang[f"advancements.portalgun.{name}.description"] = desc
        parent = f"portalgun:{name}"
    # one hidden advancement per dimension
    for d in dims:
        did = d["id"]
        _w(os.path.join(adv, "dimension", f"{did}.json"), {
            "parent": "portalgun:first_jump",
            "criteria": {"visited": {"trigger": "portalgun:visited_dimension", "conditions": {"dimension": f"portalgun:{did}"}}},
            "display": {
                "icon": {"id": d.get("icon", "portalgun:portal_fluid")},
                "title": {"translate": f"advancements.portalgun.dim.{did}.title"},
                "description": {"translate": f"advancements.portalgun.dim.{did}.description"},
                "frame": "task", "show_toast": True, "announce_to_chat": True, "hidden": True,
            },
            "requirements": [["visited"]],
        })
        lang[f"advancements.portalgun.dim.{did}.title"] = d["name"]
        lang[f"advancements.portalgun.dim.{did}.description"] = f"Visit dimension {d['code']}: {d['tagline']}"


def write(res_dir, lang, tex=None):
    """Writes models, item definitions, textures and data for the gun + fluid. `tex` is gen.textures if available."""
    assets = os.path.join(res_dir, "assets", "portalgun")
    data = os.path.join(res_dir, "data", "portalgun")
    lang.update(LANG)
    portal_art.write_all(os.path.join(assets, "textures"))
    portal_art.portal_core(256).resize((128, 128)).save(os.path.join(assets, "icon.png"))
    _w(os.path.join(assets, "particles", "portal_spark.json"), {"textures": ["portalgun:portal_spark"]})
    _w(os.path.join(assets, "models", "item", "portal_gun.json"), portal_gun_model())
    _w(os.path.join(assets, "items", "portal_gun.json"), {"model": {"type": "minecraft:model", "model": "portalgun:item/portal_gun"}})
    _w(os.path.join(assets, "models", "item", "portal_fluid.json"),
       {"parent": "minecraft:item/generated", "textures": {"layer0": "portalgun:item/portal_fluid"}})
    _w(os.path.join(assets, "items", "portal_fluid.json"), {"model": {"type": "minecraft:model", "model": "portalgun:item/portal_fluid"}})
    item_tex = os.path.join(assets, "textures", "item")
    os.makedirs(item_tex, exist_ok=True)
    needed = ("gun_body", "gun_dark", "gun_screen", "gun_button", "gun_canister_frames", "portal_fluid_frames", "animated", "save")
    if tex is not None and all(hasattr(tex, n) for n in needed):
        tex.save(tex.gun_body("gun-body"), os.path.join(item_tex, "gun_body.png"))
        tex.save(tex.gun_dark("gun-dark"), os.path.join(item_tex, "gun_dark.png"))
        tex.save(tex.gun_screen("gun-screen"), os.path.join(item_tex, "gun_screen.png"))
        tex.save(tex.gun_button("gun-button"), os.path.join(item_tex, "gun_button.png"))
        strip, meta = tex.animated(tex.gun_canister_frames("gun-canister"))
        tex.save(strip, os.path.join(item_tex, "gun_canister.png"))
        _w(os.path.join(item_tex, "gun_canister.png.mcmeta"), meta)
        strip, meta = tex.animated(tex.portal_fluid_frames("portal-fluid"))
        tex.save(strip, os.path.join(item_tex, "portal_fluid.png"))
        _w(os.path.join(item_tex, "portal_fluid.png.mcmeta"), meta)
    else:
        _placeholder_gun_textures(item_tex)
    recipes(data)


def _placeholder_gun_textures(item_tex):
    from PIL import Image
    cols = {"gun_body": (217, 221, 224), "gun_dark": (110, 116, 122), "gun_screen": (255, 106, 42),
            "gun_button": (124, 232, 74), "gun_canister": (124, 214, 90), "portal_fluid": (124, 214, 90)}
    for name, c in cols.items():
        Image.new("RGBA", (16, 16), c + (255,)).save(os.path.join(item_tex, name + ".png"))
