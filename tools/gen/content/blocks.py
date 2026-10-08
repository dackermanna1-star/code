"""Block assets + data: textures, blockstates, models, item models, loot tables, tags, lang and BlockSpec entries.

Block properties assumed per kind (W2's Java block classes mirror vanilla):
  log -> axis (RotatedPillarBlock); tall_plant -> half (DoublePlantBlock); crystal_cluster -> facing (AmethystCluster);
  vine -> north/east/south/west/up/down booleans (MultifaceBlock). Every other kind uses a single "" variant.
"""
from __future__ import annotations

from .common import (NS, full_id, render_tex, save_frames, tint_image, warn, write_json)
from .dsl import BLOCK_KINDS

DEFAULT_TOOL = {
    "solid": "pickaxe", "stone": "pickaxe", "soil": "shovel", "sand": "shovel", "grass": "shovel",
    "log": "axe", "planks": "axe", "leaves": "hoe", "glass": "pickaxe", "ice": "pickaxe", "glow": "pickaxe",
    "crystal_block": "pickaxe", "ore": "pickaxe", "slime": None, "hazard": "pickaxe", "sticky": "shovel",
    "vent": "pickaxe", "mushroom_cap": "axe", "plant": None, "tall_plant": None, "hanging_plant": None,
    "crystal_cluster": "pickaxe", "lily": None, "vine": None, "carpet": None,
}

LAYER = {
    "leaves": "cutout", "plant": "cutout", "tall_plant": "cutout", "hanging_plant": "cutout",
    "crystal_cluster": "cutout", "lily": "cutout", "vine": "cutout", "carpet": "cutout",
    "glass": "translucent", "ice": "translucent", "slime": "translucent",
}

SPRITE_KINDS = {"plant", "tall_plant", "hanging_plant", "crystal_cluster", "lily", "vine"}
CUBE_KINDS = {k for k in BLOCK_KINDS if k not in SPRITE_KINDS and k != "carpet"}

FACES = ("down", "up", "north", "south", "west", "east")


def _avg_color(img):
    """Representative colour of a texture (opaque pixels), '#rrggbb'."""
    import numpy as np
    a = np.asarray(img.convert("RGBA"), dtype=float)
    m = a[..., 3] > 128
    if not m.any():
        return "#808080"
    c = a[m][:, :3].mean(0)
    return "#" + "".join("%02x" % int(round(v)) for v in c)


# --------------------------------------------------------------------------------------------- models
def _tex_id(bid, role, single):
    return f"{NS}:block/{bid}" if single else f"{NS}:block/{bid}_{role}"


def _cube_elements(face_tex: dict, emissive: bool, up_rotation=0):
    faces = {}
    for f in FACES:
        d = {"uv": [0, 0, 16, 16], "texture": face_tex[f], "cullface": f}
        if f == "up" and up_rotation:
            d["rotation"] = up_rotation
        faces[f] = d
    e = {"from": [0, 0, 0], "to": [16, 16, 16], "faces": faces}
    if emissive:
        e["light_emission"] = 15
        e["shade"] = False
    return [e]


def _cube_model(textures: dict, emissive: bool, horizontal=False):
    """textures: dict with keys down/up/north/south/west/east/particle (resolved ids)."""
    if not emissive:
        return None
    return {
        "parent": "minecraft:block/block",
        "textures": {"particle": textures["particle"], **{f: textures[f] for f in FACES}},
        "elements": _cube_elements({f: "#" + f for f in FACES}, True, 180 if horizontal else 0),
    }


def _cross_elements(tex_ref="#cross", emissive=False):
    els = []
    for frm, to, faces in (([0.8, 0, 8], [15.2, 16, 8], ("north", "south")), ([8, 0, 0.8], [8, 16, 15.2], ("west", "east"))):
        e = {"from": frm, "to": to,
             "rotation": {"origin": [8, 8, 8], "axis": "y", "angle": 45, "rescale": True},
             "shade": False,
             "faces": {f: {"uv": [0, 0, 16, 16], "texture": tex_ref} for f in faces}}
        if emissive:
            e["light_emission"] = 15
        els.append(e)
    return els


def _cross_model(tex, emissive):
    if not emissive:
        return {"parent": "minecraft:block/cross", "textures": {"cross": tex}}
    return {"ambientocclusion": False, "textures": {"particle": tex, "cross": tex}, "elements": _cross_elements("#cross", True)}


def _lily_model(tex, emissive):
    e = {"from": [0, 0.25, 0], "to": [16, 0.25, 16],
         "faces": {"down": {"uv": [0, 16, 16, 0], "texture": "#texture"}, "up": {"uv": [0, 0, 16, 16], "texture": "#texture"}}}
    if emissive:
        e["light_emission"] = 15
    return {"ambientocclusion": False, "textures": {"particle": tex, "texture": tex}, "elements": [e]}


def _vine_model(tex, emissive):
    e = {"from": [0, 0, 0.1], "to": [16, 16, 0.1],
         "faces": {"north": {"uv": [16, 0, 0, 16], "texture": "#face"}, "south": {"uv": [0, 0, 16, 16], "texture": "#face"}}}
    if emissive:
        e["light_emission"] = 15
    return {"ambientocclusion": False, "textures": {"particle": tex, "face": tex}, "elements": [e]}


def _carpet_model(tex, emissive):
    if not emissive:
        return {"parent": "minecraft:block/carpet", "textures": {"wool": tex, "particle": tex}}
    faces = {
        "down": {"uv": [0, 0, 16, 16], "texture": "#wool", "cullface": "down"},
        "up": {"uv": [0, 0, 16, 16], "texture": "#wool"},
        "north": {"uv": [0, 15, 16, 16], "texture": "#wool", "cullface": "north"},
        "south": {"uv": [0, 15, 16, 16], "texture": "#wool", "cullface": "south"},
        "west": {"uv": [0, 15, 16, 16], "texture": "#wool", "cullface": "west"},
        "east": {"uv": [0, 15, 16, 16], "texture": "#wool", "cullface": "east"},
    }
    return {"parent": "minecraft:block/thin_block", "textures": {"particle": tex, "wool": tex},
            "elements": [{"from": [0, 0, 0], "to": [16, 1, 16], "faces": faces, "light_emission": 15}]}


def _vine_blockstate(model):
    rot = {"north": {}, "east": {"y": 90}, "south": {"y": 180}, "west": {"y": 270},
           "up": {"x": 270}, "down": {"x": 90}}
    parts = []
    none = {d: "false" for d in ("down", "east", "north", "south", "up", "west")}
    for d, r in rot.items():
        apply = {"model": model, **r}
        if r:
            apply["uvlock"] = True
        parts.append({"when": {d: "true"}, "apply": apply})
        parts.append({"when": dict(none), "apply": apply})
    return {"multipart": parts}


# --------------------------------------------------------------------------------------------- loot
def _silk():
    return {"condition": "minecraft:match_tool",
            "predicate": {"predicates": {"minecraft:enchantments": [{"enchantments": "minecraft:silk_touch", "levels": {"min": 1}}]}}}


def _shears():
    return {"condition": "minecraft:match_tool", "predicate": {"items": "minecraft:shears"}}


def _count_fn(lo, hi):
    if lo == hi:
        return {"function": "minecraft:set_count", "count": float(lo), "add": False}
    return {"function": "minecraft:set_count", "count": {"type": "minecraft:uniform", "min": float(lo), "max": float(hi)}, "add": False}


def _loot(b):
    bid = f"{NS}:{b.id}"
    seq = f"{NS}:blocks/{b.id}"
    k = b.kind
    pools = []
    drop = full_id(b.drop) if b.drop else None
    lo, hi = b.drop_count

    def simple_self():
        return {"rolls": 1.0, "bonus_rolls": 0.0, "conditions": [{"condition": "minecraft:survives_explosion"}],
                "entries": [{"type": "minecraft:item", "name": bid}]}

    if k == "ore" and drop:
        pools.append({"rolls": 1.0, "bonus_rolls": 0.0, "entries": [{"type": "minecraft:alternatives", "children": [
            {"type": "minecraft:item", "name": bid, "conditions": [_silk()]},
            {"type": "minecraft:item", "name": drop, "functions": [
                _count_fn(lo, hi),
                {"function": "minecraft:apply_bonus", "enchantment": "minecraft:fortune", "formula": "minecraft:ore_drops"},
                {"function": "minecraft:explosion_decay"}]}]}]})
    elif k == "leaves":
        keep = {"condition": "minecraft:any_of", "terms": [_shears(), _silk()]}
        pools.append({"rolls": 1.0, "bonus_rolls": 0.0, "entries": [{"type": "minecraft:item", "name": bid, "conditions": [keep]}]})
        extra = [{"type": "minecraft:item", "name": "minecraft:stick",
                  "conditions": [{"condition": "minecraft:table_bonus", "enchantment": "minecraft:fortune",
                                  "chances": [0.02, 0.022222223, 0.025, 0.033333335, 0.1]}],
                  "functions": [_count_fn(1, 2), {"function": "minecraft:explosion_decay"}]}]
        if drop:
            extra.insert(0, {"type": "minecraft:item", "name": drop,
                             "conditions": [{"condition": "minecraft:table_bonus", "enchantment": "minecraft:fortune",
                                             "chances": [0.05, 0.0625, 0.083333336, 0.1]}],
                             "functions": [_count_fn(lo, hi), {"function": "minecraft:explosion_decay"}]})
        pools.append({"rolls": 1.0, "bonus_rolls": 0.0,
                      "conditions": [{"condition": "minecraft:inverted", "term": keep}],
                      "entries": [{"type": "minecraft:alternatives", "children": extra}]})
    elif k in ("plant", "tall_plant", "hanging_plant", "vine", "lily", "crystal_cluster"):
        cond = []
        if k == "tall_plant":
            cond = [{"condition": "minecraft:block_state_property", "block": bid, "properties": {"half": "lower"}}]
        fruit = full_id(b.fruit) if b.fruit else drop
        if fruit:
            pools.append({"rolls": 1.0, "bonus_rolls": 0.0, "conditions": list(cond), "entries": [{"type": "minecraft:alternatives", "children": [
                {"type": "minecraft:item", "name": bid, "conditions": [{"condition": "minecraft:any_of", "terms": [_shears(), _silk()]}]},
                {"type": "minecraft:item", "name": fruit, "functions": [
                    _count_fn(lo, hi),
                    {"function": "minecraft:apply_bonus", "enchantment": "minecraft:fortune", "formula": "minecraft:uniform_bonus_count",
                     "parameters": {"bonusMultiplier": 1}},
                    {"function": "minecraft:explosion_decay"}]}]}]})
        elif k == "vine":
            pools.append({"rolls": 1.0, "bonus_rolls": 0.0,
                          "entries": [{"type": "minecraft:item", "name": bid, "conditions": [{"condition": "minecraft:any_of", "terms": [_shears(), _silk()]}]}]})
        else:
            p = simple_self()
            p["conditions"] = cond + p["conditions"]
            pools.append(p)
    elif drop:
        pools.append({"rolls": 1.0, "bonus_rolls": 0.0, "entries": [{"type": "minecraft:alternatives", "children": [
            {"type": "minecraft:item", "name": bid, "conditions": [_silk()]},
            {"type": "minecraft:item", "name": drop, "functions": [_count_fn(lo, hi), {"function": "minecraft:explosion_decay"}]}]}]})
    else:
        pools.append(simple_self())
    return {"type": "minecraft:block", "pools": pools, "random_sequence": seq}


# --------------------------------------------------------------------------------------------- tags
def _tags(ctx, b):
    bid = f"{NS}:{b.id}"
    t = ctx.tags
    k = b.kind
    tool = b.tool if b.tool else DEFAULT_TOOL.get(k)
    if tool in ("pickaxe", "axe", "shovel", "hoe"):
        t.add("block", f"minecraft:mineable/{tool}", bid)
    if k == "ore":
        need = "iron" if (b.hardness >= 4.5 or b.xp[1] >= 6) else "stone"
        t.add("block", f"minecraft:needs_{need}_tool", bid)
    if k == "log":
        for tag in ("minecraft:logs", "minecraft:logs_that_burn", "minecraft:completes_find_tree_tutorial"):
            t.add("block", tag, bid)
        t.add("item", "minecraft:logs", bid)
        t.add("item", "minecraft:logs_that_burn", bid)
        t.add("block", "minecraft:overworld_natural_logs", bid)
    if k == "leaves":
        t.add("block", "minecraft:leaves", bid)
        t.add("item", "minecraft:leaves", bid)
        t.add("block", "minecraft:sword_efficient", bid)
        t.add("block", "minecraft:replaceable_by_trees", bid)
    if k == "planks":
        t.add("block", "minecraft:planks", bid)
        t.add("item", "minecraft:planks", bid)
    if k in ("grass", "soil"):
        t.add("block", "minecraft:dirt", bid)
        t.add("item", "minecraft:dirt", bid)
        t.add("block", "minecraft:enderman_holdable", bid)
    if k == "grass":
        t.add("block", "minecraft:animals_spawnable_on", bid)
        t.add("block", "minecraft:valid_spawn", bid)
    if k == "sand":
        t.add("block", "minecraft:sand", bid)
        t.add("item", "minecraft:sand", bid)
        t.add("block", "minecraft:enderman_holdable", bid)
    if k == "ice":
        t.add("block", "minecraft:ice", bid)
    if k in ("glass", "ice", "slime"):
        t.add("block", "minecraft:impermeable", bid)
    if k in ("plant", "tall_plant"):
        for tag in ("minecraft:replaceable_by_trees", "minecraft:replaceable_by_mushrooms", "minecraft:sword_efficient",
                    "minecraft:enchantment_power_transmitter", "minecraft:replaceable"):
            t.add("block", tag, bid)
    if k in ("hanging_plant", "vine"):
        t.add("block", "minecraft:climbable", bid)
        t.add("block", "minecraft:sword_efficient", bid)
        t.add("block", "minecraft:replaceable_by_trees", bid)
    if k == "vine":
        t.add("block", "minecraft:replaceable", bid)
    if k == "carpet":
        t.add("block", "minecraft:combination_step_sound_blocks", bid)
    if k == "hazard" or b.damage > 0:
        t.add("block", f"{NS}:hazards", bid)
    if k in ("crystal_block", "crystal_cluster"):
        t.add("block", "minecraft:crystal_sound_blocks", bid)


# --------------------------------------------------------------------------------------------- main
def emit_block(ctx, b):
    """Write everything for one dsl.Block; returns the BlockSpec dict for content.json."""
    k = b.kind
    roles = BLOCK_KINDS[k]
    single = len(roles) == 1
    tex_ids = {}
    avg_color = None
    for role in roles:
        tspec = b.textures.get(role)
        if tspec is None:
            # validation reports this; use any other role so the block still renders
            tspec = next(iter(b.textures.values()))
        try:
            frames = render_tex(tspec)
        except Exception as e:
            warn(f"block {b.id}: texture {role} failed ({e}); using fallback")
            from .textures_extra import noise_block
            frames = [noise_block(["#555555", "#777777", "#999999"], b.id)]
        if b.tint:
            frames = [tint_image(f, b.tint) for f in frames]
        if avg_color is None or role in ("top", "all", "cross"):
            avg_color = _avg_color(frames[0])
        tid = _tex_id(b.id, role, single)
        path = ctx.assets("textures", "block", tid.split("/", 1)[1] + ".png")
        save_frames(frames, path, getattr(tspec, "frametime", 2), interpolate=False)
        tex_ids[role] = tid

    model_id = f"{NS}:block/{b.id}"
    mdir = lambda name: ctx.assets("models", "block", name + ".json")  # noqa: E731
    em = bool(b.emissive)
    blockstate = {"variants": {"": {"model": model_id}}}
    item_model = model_id

    if k == "grass":
        top, side, bottom = tex_ids["top"], tex_ids["side"], tex_ids["bottom"]
        faces = {"particle": bottom, "down": bottom, "up": top, "north": side, "south": side, "west": side, "east": side}
        m = _cube_model(faces, em) or {"parent": "minecraft:block/cube_bottom_top",
                                       "textures": {"top": top, "side": side, "bottom": bottom}}
        write_json(mdir(b.id), m)
        blockstate = {"variants": {"": [{"model": model_id}, {"model": model_id, "y": 90},
                                        {"model": model_id, "y": 180}, {"model": model_id, "y": 270}]}}
    elif k == "vent":
        top, side = tex_ids["top"], tex_ids["side"]
        faces = {"particle": side, "down": side, "up": top, "north": side, "south": side, "west": side, "east": side}
        m = _cube_model(faces, em) or {"parent": "minecraft:block/cube_bottom_top",
                                       "textures": {"top": top, "side": side, "bottom": side}}
        write_json(mdir(b.id), m)
    elif k == "log":
        side, end = tex_ids["side"], tex_ids["end"]
        faces = {"particle": side, "down": end, "up": end, "north": side, "south": side, "west": side, "east": side}
        m = _cube_model(faces, em) or {"parent": "minecraft:block/cube_column", "textures": {"end": end, "side": side}}
        write_json(mdir(b.id), m)
        hm = _cube_model(faces, em, horizontal=True) or {"parent": "minecraft:block/cube_column_horizontal",
                                                         "textures": {"end": end, "side": side}}
        write_json(mdir(b.id + "_horizontal"), hm)
        hid = model_id + "_horizontal"
        blockstate = {"variants": {"axis=x": {"model": hid, "x": 90, "y": 90}, "axis=y": {"model": model_id},
                                   "axis=z": {"model": hid, "x": 90}}}
    elif k in ("plant", "hanging_plant"):
        write_json(mdir(b.id), _cross_model(tex_ids["cross"], em))
        item_model = None
    elif k == "crystal_cluster":
        write_json(mdir(b.id), _cross_model(tex_ids["cross"], em))
        blockstate = {"variants": {
            "facing=down": {"model": model_id, "x": 180}, "facing=up": {"model": model_id},
            "facing=north": {"model": model_id, "x": 90}, "facing=south": {"model": model_id, "x": 90, "y": 180},
            "facing=east": {"model": model_id, "x": 90, "y": 90}, "facing=west": {"model": model_id, "x": 90, "y": 270}}}
        item_model = None
    elif k == "tall_plant":
        write_json(mdir(b.id + "_bottom"), _cross_model(tex_ids["bottom"], em))
        write_json(mdir(b.id + "_top"), _cross_model(tex_ids["top"], em))
        blockstate = {"variants": {"half=lower": {"model": model_id + "_bottom"}, "half=upper": {"model": model_id + "_top"}}}
        item_model = None
    elif k == "lily":
        write_json(mdir(b.id), _lily_model(tex_ids["top"], em))
        blockstate = {"variants": {"": [{"model": model_id}, {"model": model_id, "y": 90},
                                        {"model": model_id, "y": 180}, {"model": model_id, "y": 270}]}}
        item_model = None
    elif k == "vine":
        write_json(mdir(b.id), _vine_model(tex_ids["face"], em))
        blockstate = _vine_blockstate(model_id)
        item_model = None
    elif k == "carpet":
        write_json(mdir(b.id), _carpet_model(tex_ids["all"], em))
    else:  # cube_all kinds
        a = tex_ids["all"]
        faces = {"particle": a, **{f: a for f in FACES}}
        m = _cube_model(faces, em) or {"parent": "minecraft:block/cube_all", "textures": {"all": a}}
        write_json(mdir(b.id), m)

    write_json(ctx.assets("blockstates", b.id + ".json"), blockstate)

    # item model
    if item_model is None:
        sprite = {"plant": "cross", "hanging_plant": "cross", "crystal_cluster": "cross", "tall_plant": "top",
                  "lily": "top", "vine": "face"}[k]
        write_json(ctx.assets("models", "item", b.id + ".json"),
                   {"parent": "minecraft:item/generated", "textures": {"layer0": tex_ids[sprite]}})
        item_model = f"{NS}:item/{b.id}"
    write_json(ctx.assets("items", b.id + ".json"), {"model": {"type": "minecraft:model", "model": item_model}})

    write_json(ctx.data("loot_table", "blocks", b.id + ".json"), _loot(b))
    _tags(ctx, b)
    ctx.lang[f"block.{NS}.{b.id}"] = b.name

    tool = b.tool if b.tool else DEFAULT_TOOL.get(k)
    spec = {
        "id": b.id, "name": b.name, "kind": k, "dimension": ctx.dim.id if ctx.dim else None,
        "hardness": float(b.hardness), "resistance": float(b.resistance), "sound": b.sound, "light": int(b.light),
        "map": b.map_color, "friction": float(b.friction), "jump": float(b.jump), "speed": float(b.speed),
        "bounce": float(b.bounce), "damage": float(b.damage), "flammable": bool(b.flammable),
        "layer": LAYER.get(k, "solid"), "emissive": em, "creative": bool(b.creative),
    }
    if tool:
        spec["tool"] = tool
    if b.particle:
        spec["particle"] = b.particle
    if b.effect:
        spec["effect"] = b.effect
        spec["effectSeconds"] = int(round(b.effect_seconds))
        spec["effectAmplifier"] = int(b.effect_amplifier)
    if b.damage_type:
        spec["damageType"] = b.damage_type
    if b.fruit:
        spec["fruit"] = full_id(b.fruit)
    if b.drop:
        spec["drop"] = full_id(b.drop)
        spec["dropCount"] = list(b.drop_count)
    spec["xp"] = [int(b.xp[0]), int(b.xp[1])]
    spec["color"] = avg_color
    return spec


def emit_recipes(ctx, dim):
    """Tiny quality-of-life recipes: logs -> planks of the same dimension."""
    planks = [b for b in dim.blocks if b.kind == "planks"]
    if not planks:
        return
    for b in dim.blocks:
        if b.kind == "log":
            write_json(ctx.data("recipe", f"{planks[0].id}_from_{b.id}.json"), {
                "type": "minecraft:crafting_shapeless", "category": "building", "group": "planks",
                "ingredients": [f"{NS}:{b.id}"], "result": {"count": 4, "id": f"{NS}:{planks[0].id}"}})
