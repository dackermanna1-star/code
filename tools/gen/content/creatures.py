"""Creature pipeline (module C): dsl.Creature -> geometry JSON, textures, spawn egg, loot table, lang, CreatureSpec.

    build_creatures(dim, res_dir, lang) -> list[CreatureSpec dict]     (called by gen.content.build per dimension)
    spawn_category(creature) -> "monster" | "creature" | "ambient" | "water_creature" | "water_ambient"
    make_model(creature) -> (root Part, texture, glow overlay or None, meta)   (also used by creature_preview.py)

Outputs per creature <id> (namespace portalgun):
    assets/portalgun/geometry/<id>.json                    part tree + auto-packed box UVs + animation hints
    assets/portalgun/textures/entity/creature/<id>.png     painted texture
    assets/portalgun/textures/entity/creature/<id>_glow.png   emissive overlay (eyes / glow bits), when any
    assets/portalgun/textures/item/<id>_spawn_egg.png + models/item/<id>_spawn_egg.json + items/<id>_spawn_egg.json
    data/portalgun/loot_table/entities/<id>.json
    lang: entity.portalgun.<id>, item.portalgun.<id>_spawn_egg
    data/minecraft/tags/entity_type/{arthropod,aquatic,...}.json   (vanilla behaviour tags for our creatures)

=====================================================================================================================
BODY KNOBS (Creature.body).  Every knob is optional; sizes are in model pixels (1/16 block) for size=1.0.
=====================================================================================================================
Shared head knobs (any archetype that has a head):
    eyes 0-8 (2)            eye_size 1-4           eye_style round|cute|slit|glow|compound|angry|sleepy|none
    mouth none|smile|frown|fangs|grin|open|maw|tusks      brows bool   blush bool
    snout px                beak px | True         hooked bool (hooked beak)       jaw bool (hinged, animated jaw)
    ears none|pointy|round|floppy|long|bunny|fin
    horns none|small|long|twin|curved|ram|unicorn|spiral|antlers
    tusks bool   mandibles bool   antennae px (0=none)   glow_tips bool   crest bool   whiskers bool
    head "cap"/"mushroom_cap" or cap bool (mushroom cap on the head)   eyestalks n   head_size multiplier
Shared body knobs:   spikes n (dorsal row)   plates bool (spikes become plates)   tail n segments   tail_len px
    tail_kind thin|bushy|ringed|curl|club|fluke|fan|feather|stinger|rattle|flame|spade|puff
    belly bool (countershaded underside, default on)   translucent bool (gummy / jelly bodies)
    crystals n (glowing shards on the back)   fur bool   undead bool (smite tags)

quadruped  legs 2-8 (4)  leg_len (7)  leg_w  body_w (10)  body_h (8)  body_len (14)  neck px (0; long necks >10)
           neck_angle deg  stance normal|low (sprawled, croc/lizard)  hooves  claws  hump  mane  shell  fur
biped      thin  bulky  stance upright|hunched|raptor  arms 0-6 (2)  arm_len  leg_len  torso_w/h/d  neck
           head box|cap|mushroom_cap|long|tiny|pumpkin|none  claws  core (glowing chest)  wings + wing_kind
           raptor stance: body_w/h/len, leg_len, leg_w, neck, neck_angle, arms 0-2 (tiny), tail (2)
flyer      kind bird|bat|insect|moth|dragon|crane  wings pairs (1, insect 2)  wing_span  wing_w  wing_kind
           feather|membrane|insect|moth|paper   body_len/w/h  legs  neck  beak  stinger  fluffy  tail/tail_kind
floater    kind jelly|ghost|whale|lantern|balloon|cloud|orb|wisp  tentacles n  tentacle_len  bell_w/h (jelly)
           body_w/h/d (ghost, lantern, balloon, cloud, orb)  arms (ghost)  body_len (whale)  fin_top  spikes
           garden (whale back plants)  motes (orb/wisp)
blob       shape cube|round|drop|stack|box (box = treasure mimic with snapping lid)  blob_size px (12)  core
           feet  spikes  horns/cap/antennae/eyestalks (crown on top)  + face knobs
crawler    kind spider|ant|crab|scorpion|beetle|mite|centipede|rat  legs per side  leg_len  body_w/h/len  claws
           stinger (abdomen)  stinger_tail  shell  segments (centipede)  eyestalks (crab)  head_size
serpent    segments (6)  seg_w (6)  seg_len (6)  taper 0.1-1  head snake|worm|eel|dragon  head_w  head_len  fins
           ridge/spikes  ringed  rattle | tail_kind rattle|fluke  hood (cobra)  eyes (worm default 0)
swimmer    kind fish|ray|eel|shark|whale|shrimp|koi|angler  body_len/w/h  fins (default on)  wing_span (ray)
           lure  antennae  whiskers  mouth maw (snapping jaw)
golem      leg_len  leg_w  torso_w/h/d  arm_len  arm_w  core (default on)  shoulders  crystals n  chimney  gears
           spikes  nose (default on)  head_size + head knobs
eye        eye_px (12)  lids (default on)  stalks n (beholder eyestalks)  tentacles n  tentacle_len  wings
           wing_kind  spikes
hopper     kind frog|rabbit|kangaroo|flea  body_w/h/len  leg_len  throat_sac  ears  tail/tail_kind
tripod     legs 3-6 (3)  leg_len (22)  dome_w  dome_h  dome dome|pod  eyes (1)  eye_size  tentacles  lights n
plantoid   head mushroom_cap|flower|bulb|leafy|cactus  legs 0-6 (2; >2 = root legs)  leg_len  stem_w  stem_h
           arms (leaf arms)  cap_w  cap_h  petals
snail      foot_len  foot_w  foot_h  shell_size  shell_kind spiral|cone|dome  neck_h  crystals

Creature fields used here beyond the DSL basics: movement (ground|flying|floating|swimming|amphibious|hopping;
default from archetype/placement), group (max spawn cluster), tracking (client tracking range, chunks).
Ranged dict keys: color damage effect(Effect) cooldown(ticks) speed explode(power) count spread particle
knockback fire(seconds) homing(0..1) size(visual radius) gravity(bool).
"""
from __future__ import annotations

import math
import os

import numpy as np

from .common import NS, full_id, stable_hash, warn, write_json
from .creature_anatomy import BUILDERS, Knobs
from .creature_geo import all_cubes, bounds, geometry_json, ground, pack_uv, part_matrix, unique_names
from .creature_paint import fallback_egg, orb_textures, paint, rgb

ARCHETYPES = tuple(BUILDERS)
MOVEMENTS = ("ground", "flying", "floating", "swimming", "amphibious", "hopping")
DEFAULT_MOVEMENT = {"flyer": "flying", "floater": "floating", "swimmer": "swimming", "eye": "floating",
                    "hopper": "hopping"}
ABILITIES = ("teleport", "leap", "regen", "thorns", "glow_aura", "split", "charge", "burrow", "shield", "swarm",
             "ink", "climb", "fire_trail", "blink")

# entity type tag accumulators (rewritten after every dimension; the run starts from a clean tree)
_TAGS: dict[str, list[str]] = {}

# vanilla sound family -> suffix overrides (anything missing falls back to the generic list)
_SOUND_KEYS = {
    "ambient": ("ambient", "idle", "ambient_land", "idle_air", "idle_ground", "ambient_without_item", "squish", "chirp"),
    "hurt": ("hurt", "hurt_land"),
    "death": ("death", "death_land"),
    "step": ("step", "squish", "flop"),
}
_SOUND_ALIAS = {"bear": "polar_bear", "golem": "iron_golem", "snail": "slime", "pufferfish": "puffer_fish",
                "fish": "tropical_fish", "ender_man": "enderman", "magma": "magma_cube", "jelly": "squid",
                "crab": "armadillo", "bird": "parrot", "owl": "parrot", "raptor": "ravager", "ghost": "vex",
                "wisp": "allay", "insect": "bee", "moth": "bee"}
_VANILLA_SOUNDS = None
_VANILLA_ITEMS = None


def _vanilla_list(name):
    p = os.path.join(os.path.dirname(__file__), "data", name)
    try:
        with open(p, encoding="utf-8") as f:
            return {ln.strip() for ln in f if ln.strip()}
    except OSError:
        return None


def _sound_ids(family, pitch, volume=1.0):
    global _VANILLA_SOUNDS
    if _VANILLA_SOUNDS is None:
        _VANILLA_SOUNDS = _vanilla_list("vanilla_sounds.txt") or set()
    out = {"pitch": float(pitch), "volume": float(volume)}
    if not family:
        return out
    if ":" in family and not family.startswith("minecraft:"):
        # a mod sound event prefix like "portalgun:creature.blob" -> <prefix>.ambient/.hurt/...
        for k in _SOUND_KEYS:
            out[k] = f"{family}.{k}"
        return out
    fam = family.split(":")[-1]
    fam = _SOUND_ALIAS.get(fam, fam)
    for k, suffixes in _SOUND_KEYS.items():
        for s in suffixes:
            ev = f"entity.{fam}.{s}"
            if not _VANILLA_SOUNDS or ev in _VANILLA_SOUNDS:
                out[k] = "minecraft:" + ev
                break
    if fam == "bee":
        out["ambient"] = "minecraft:entity.bee.loop"
    if "hurt" not in out:
        warn(f"creature sound family {family!r} has no vanilla sounds - using generic sounds")
        out.update({"hurt": "minecraft:entity.generic.hurt", "death": "minecraft:entity.generic.death"})
    return out


def _attr(c, name, default=None):
    return getattr(c, name, default) if getattr(c, name, None) is not None else default


def movement_of(c):
    m = _attr(c, "movement")
    if m in MOVEMENTS:
        return m
    if c.archetype in ("serpent", "quadruped", "crawler", "blob") and (c.placement == "water"):
        return "swimming" if c.archetype in ("serpent",) else "amphibious"
    if c.archetype == "serpent" and c.body.get("head") == "eel":
        return "swimming"
    return DEFAULT_MOVEMENT.get(c.archetype, "ground")


def placement_of(c):
    if c.placement in ("ground", "water", "air"):
        return c.placement
    mv = movement_of(c)
    return "water" if mv == "swimming" else "ground"


def spawn_category(c) -> str:
    if c.category:
        return c.category
    if c.behavior == "hostile":
        return "monster"
    mv = movement_of(c)
    if mv == "swimming":
        return "water_ambient" if c.size < 0.6 and c.behavior in ("passive", "skittish") else "water_creature"
    return "creature"


# --------------------------------------------------------------------------------------------- model
def make_model(c):
    """Build the anatomy for one creature -> (root, texture, glow, meta)."""
    if c.archetype not in BUILDERS:
        raise ValueError(f"unknown archetype {c.archetype!r} (expected one of {', '.join(ARCHETYPES)})")
    seed = stable_hash(c.id) % 100000
    K = Knobs(c.body, seed)
    K.d.setdefault("_behavior", c.behavior)
    root, info = BUILDERS[c.archetype](c, K)
    unique_names(root)
    ground(root)
    tw, th = pack_uv(root)
    tex, glow = paint(root, tw, th, c, K, seed)
    lo, hi = bounds(root, include_nohit=False)
    alo, ahi = bounds(root, include_nohit=True)
    size = float(c.size)
    width = max(hi[0] - lo[0], hi[2] - lo[2]) / 16.0
    xw = (hi[0] - lo[0]) / 16.0
    zl = (hi[2] - lo[2]) / 16.0
    # long creatures (serpents, crocs) get a hitbox between their width and length
    if zl > xw * 1.6:
        width = max(xw, min(zl * 0.55, xw * 2.2))
    width = max(0.3, width * size * 0.92)
    height = max(0.25, (24.0 - lo[1]) / 16.0 * size)
    if movement_of(c) in ("flying", "floating"):
        height = max(0.3, (ahi[1] - lo[1]) / 16.0 * size * 0.95)
    head = info.get("head")
    eye_h = height * 0.85
    if head is not None:
        M = part_matrix(head)
        hc = M @ np.array([0, 0, 0, 1.0])
        best = None
        for cb in head.cubes:
            if cb.tag == "head" or best is None:
                best = cb
        if best is not None:
            ox, oy, oz = best.origin
            w, h, d = best.size
            hc = M @ np.array([ox + w / 2, oy + h * 0.4, oz + d / 2, 1.0])
        eye_h = (24.0 - hc[1]) / 16.0 * size
    eye_h = float(min(max(0.1, eye_h), height * 0.98))
    meta = {"width": round(float(min(width, 6.0)), 3), "height": round(float(min(height, 10.0)), 3),
            "eyeHeight": round(eye_h, 3), "texture": [tw, th],
            "translucent": bool(K.flag("translucent"))}
    return root, tex, glow, meta


# --------------------------------------------------------------------------------------------- loot
def _count(lo, hi):
    if lo == hi:
        return float(lo)
    return {"type": "minecraft:uniform", "min": float(lo), "max": float(hi)}


def _item_entry(item, d, cooked_cond=None):
    fns = [{"function": "minecraft:set_count", "count": _count(d.min, d.max), "add": False}]
    if d.max > 0:
        fns.append({"function": "minecraft:enchanted_count_increase", "enchantment": "minecraft:looting",
                    "count": {"type": "minecraft:uniform", "min": 0.0, "max": 1.0}})
    e = {"type": "minecraft:item", "name": item, "functions": fns}
    if cooked_cond:
        e["conditions"] = [cooked_cond]
    return e


ON_FIRE = {"condition": "minecraft:any_of", "terms": [
    {"condition": "minecraft:entity_properties", "entity": "this", "predicate": {"flags": {"is_on_fire": True}}},
    {"condition": "minecraft:entity_properties", "entity": "direct_attacker", "predicate": {"equipment": {"mainhand": {
        "predicates": {"minecraft:enchantments": [{"enchantments": "#minecraft:smelts_loot"}]}}}}}]}


def loot_table(c):
    pools = []
    for d in c.drops:
        item = full_id(d.item)
        if d.cooked:
            entry = {"type": "minecraft:alternatives", "children": [
                _item_entry(full_id(d.cooked), d, ON_FIRE), _item_entry(item, d)]}
        else:
            entry = _item_entry(item, d)
        pool = {"rolls": 1.0, "bonus_rolls": 0.0, "entries": [entry]}
        if d.chance < 1.0:
            pool["conditions"] = [{"condition": "minecraft:random_chance_with_enchanted_bonus",
                                   "enchantment": "minecraft:looting",
                                   "unenchanted_chance": float(d.chance),
                                   "enchanted_chance": {"type": "minecraft:linear", "base": min(1.0, d.chance + 0.02),
                                                        "per_level_above_first": 0.02}}]
        pools.append(pool)
    return {"type": "minecraft:entity", "pools": pools, "random_sequence": f"{NS}:entities/{c.id}"}


# --------------------------------------------------------------------------------------------- spec
def _effect(e):
    if e is None:
        return None
    if isinstance(e, dict):
        return {"id": e.get("id"), "duration": int(round(float(e.get("seconds", 5)) * 20)),
                "amplifier": int(e.get("amplifier", 0)), "chance": float(e.get("chance", 1.0))}
    return {"id": e.id, "duration": int(round(e.seconds * 20)), "amplifier": int(e.amplifier), "chance": float(e.chance)}


def _ranged(c):
    r = dict(c.ranged or {})
    out = {"color": r.get("color", c.colors[2] if len(c.colors) > 2 else "#7cff4a"),
           "damage": float(r.get("damage", max(1.0, c.damage))), "speed": float(r.get("speed", 1.1)),
           "cooldown": int(r.get("cooldown", 40)), "explode": float(r.get("explode", 0)),
           "count": int(r.get("count", 1)), "spread": float(r.get("spread", 6 if int(r.get("count", 1)) > 1 else 0)),
           "knockback": float(r.get("knockback", 0)), "fire": float(r.get("fire", 0)),
           "homing": float(r.get("homing", 0)), "size": float(r.get("size", 0.35)),
           "gravity": bool(r.get("gravity", False))}
    if r.get("particle"):
        out["particle"] = r["particle"]
    if r.get("effect") is not None:
        out["effect"] = _effect(r["effect"])
    return out


def creature_spec(c, dim_id, meta):
    mv = movement_of(c)
    attack = c.attack if c.attack in ("melee", "ranged", "explode", "none") else "melee"
    if c.behavior in ("passive", "skittish") and attack != "none" and not c.ranged:
        attack = "none"
    size = float(c.size)
    spec = {
        "id": c.id, "name": c.name, "dimension": dim_id, "archetype": c.archetype, "movement": mv,
        "category": spawn_category(c), "width": meta["width"], "height": meta["height"],
        "eyeHeight": meta["eyeHeight"], "scale": size,
        "shadow": round(min(3.0, max(0.2, meta["width"] * 0.6)), 3),
        "health": float(c.health), "damage": float(c.damage), "speed": float(c.speed),
        "flySpeed": float((c.body or {}).get("fly_speed", _fly_speed(c, mv))),
        "armor": float(c.armor), "follow": 32.0 if c.behavior == "hostile" else 20.0,
        "knockbackResist": float(min(1.0, max(0.0, (size - 1.0) * 0.4 + (0.3 if c.archetype == "golem" else 0)))),
        "behavior": c.behavior, "attack": attack, "abilities": [a for a in c.abilities],
        "fireImmune": bool(c.fire_immune), "glowEyes": bool(c.glow_eyes), "emissive": bool(c.emissive),
        "translucent": meta["translucent"], "placement": placement_of(c),
        "spawnLight": c.spawn_light if c.spawn_light in ("any", "dark", "light") else "any",
        "sounds": _sound_ids(c.sounds or _default_sound(c), c.pitch), "xp": int(c.xp),
        "group": int(_attr(c, "group", 4) or 4),
        "trackingRange": int(_attr(c, "tracking", 0) or (16 if meta["width"] > 2.5 else 10)),
        "hasGlow": bool(meta.get("glow")),
    }
    if c.on_hit is not None:
        spec["onHit"] = _effect(c.on_hit)
    if attack == "ranged" or c.ranged:
        spec["ranged"] = _ranged(c)
    if c.tempt:
        spec["tempt"] = full_id(c.tempt)
    extra = {}
    for k, v in (c.body or {}).items():
        if k.startswith("ai_") and isinstance(v, (int, float)) and not isinstance(v, bool):
            extra[k[3:]] = float(v)
    if mv == "floating":
        extra.setdefault("hover", float((c.body or {}).get("hover", 3.0)))
    spec["extra"] = extra
    for a in c.abilities:
        if a not in ABILITIES:
            warn(f"creature {c.id}: unknown ability {a!r} (known: {', '.join(ABILITIES)})")
    return spec


def _fly_speed(c, mv):
    """FLYING_SPEED attribute: travelFlying impulse ~ speed^2, terminal velocity ~ 11 x impulse."""
    if mv == "floating":
        return round(min(0.15, max(0.05, c.speed * 0.5)), 3)
    return round(min(0.28, max(0.08, c.speed * 0.6)), 3)


def _default_sound(c):
    return {"quadruped": "cow", "biped": "zombie", "flyer": "parrot", "floater": "squid", "blob": "slime",
            "crawler": "spider", "serpent": "silverfish", "swimmer": "tropical_fish", "golem": "iron_golem",
            "eye": "guardian", "hopper": "frog", "tripod": "iron_golem", "plantoid": "frog", "snail": "slime"}.get(c.archetype, "cow")


# --------------------------------------------------------------------------------------------- tags
def _tag(name, entity):
    _TAGS.setdefault(name, [])
    if entity not in _TAGS[name]:
        _TAGS[name].append(entity)


def _write_tags(res_dir):
    for name, vals in _TAGS.items():
        write_json(os.path.join(res_dir, "data", "minecraft", "tags", "entity_type", name + ".json"),
                   {"replace": False, "values": sorted(vals)})


# --------------------------------------------------------------------------------------------- egg
def _egg_image(c):
    base = c.colors[0]
    spot = c.colors[2] if len(c.colors) > 2 else c.colors[-1]
    if np.abs(rgb(base) - rgb(spot)).sum() < 90 and len(c.colors) > 1:
        spot = c.colors[1]
    try:
        from .common import tex_fn
        fn = tex_fn("spawn_egg")
        if fn is not None:
            return fn(base, spot, c.id)
    except Exception as e:  # texture team module mid-edit
        warn(f"spawn_egg generator failed for {c.id} ({e!r}); using fallback")
    return fallback_egg(base, spot, stable_hash(c.id))


# --------------------------------------------------------------------------------------------- entry points
def build_creatures(dim, res_dir, lang):
    out = []
    tex_dir = os.path.join(res_dir, "assets", NS, "textures", "entity", "creature")
    os.makedirs(tex_dir, exist_ok=True)
    g, k = orb_textures()
    g.save(os.path.join(tex_dir, "orb_glow.png"))
    k.save(os.path.join(tex_dir, "orb_core.png"))
    for c in dim.creatures:
        try:
            root, tex, glow, meta = make_model(c)
        except Exception as e:
            warn(f"creature {c.id}: model generation failed ({e!r}) - skipped")
            import traceback
            traceback.print_exc()
            continue
        tex.save(os.path.join(tex_dir, c.id + ".png"))
        gp = os.path.join(tex_dir, c.id + "_glow.png")
        meta["glow"] = glow is not None
        if glow is not None:
            glow.save(gp)
        geo = geometry_json(root, meta["texture"][0], meta["texture"][1], scale=float(c.size), archetype=c.archetype,
                            translucent=meta["translucent"], glow=meta["glow"])
        write_json(os.path.join(res_dir, "assets", NS, "geometry", c.id + ".json"), geo, compact=True)
        # spawn egg (1.21.11: every egg has its own item texture + model + item definition)
        egg = c.id + "_spawn_egg"
        _egg_image(c).save(os.path.join(res_dir, "assets", NS, "textures", "item", egg + ".png"))
        write_json(os.path.join(res_dir, "assets", NS, "models", "item", egg + ".json"),
                   {"parent": "minecraft:item/generated", "textures": {"layer0": f"{NS}:item/{egg}"}})
        write_json(os.path.join(res_dir, "assets", NS, "items", egg + ".json"),
                   {"model": {"type": "minecraft:model", "model": f"{NS}:item/{egg}"}})
        write_json(os.path.join(res_dir, "data", NS, "loot_table", "entities", c.id + ".json"), loot_table(c))
        lang[f"entity.{NS}.{c.id}"] = c.name
        lang[f"item.{NS}.{egg}"] = f"{c.name} Spawn Egg"
        if c.description:
            lang[f"entity.{NS}.{c.id}.description"] = c.description
        spec = creature_spec(c, dim.id, meta)
        out.append(spec)
        eid = f"{NS}:{c.id}"
        mv = spec["movement"]
        if c.archetype == "crawler" and c.body.get("kind") != "rat":
            _tag("arthropod", eid)
            _tag("sensitive_to_bane_of_arthropods", eid)
        if mv in ("swimming", "amphibious"):
            _tag("aquatic", eid)
            _tag("sensitive_to_impaling", eid)
            _tag("can_breathe_under_water", eid)
        if mv in ("flying", "floating"):
            _tag("fall_damage_immune", eid)
        if c.body.get("undead"):
            _tag("undead", eid)
            _tag("sensitive_to_smite", eid)
            _tag("inverted_healing_and_harm", eid)
            _tag("ignores_poison_and_regen", eid)
        if c.fire_immune:
            _tag("freeze_immune_entity_types", eid) if c.body.get("frost") else None
    _write_tags(res_dir)
    return out
