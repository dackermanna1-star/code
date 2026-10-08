"""worldgen/biome/<id>.json emitter (1.21.11 format: environment `attributes` + `effects` colours)."""
from __future__ import annotations

from .common import NS, hex_rgb, rgb_int, scale_hex, warn, write_json
from .worldgen import AMBIENT_ADDITIONS, ambient_entry, music_entry

SPAWN_CATEGORIES = ("monster", "creature", "ambient", "axolotls", "underground_water_creature", "water_creature",
                    "water_ambient", "misc")

# vanilla entity -> spawn category (anything else defaults to monster/creature by name)
VANILLA_CATEGORY = {
    "minecraft:bat": "ambient", "minecraft:squid": "water_creature", "minecraft:glow_squid": "underground_water_creature",
    "minecraft:dolphin": "water_creature", "minecraft:turtle": "creature", "minecraft:cod": "water_ambient",
    "minecraft:salmon": "water_ambient", "minecraft:tropical_fish": "water_ambient", "minecraft:pufferfish": "water_ambient",
    "minecraft:axolotl": "axolotls", "minecraft:nautilus": "water_creature",
}
VANILLA_MONSTERS = {"zombie", "skeleton", "spider", "creeper", "enderman", "witch", "slime", "drowned", "husk", "stray",
                    "phantom", "blaze", "ghast", "magma_cube", "piglin", "hoglin", "zoglin", "wither_skeleton",
                    "cave_spider", "silverfish", "endermite", "guardian", "vex", "bogged", "breeze", "creaking",
                    "zombified_piglin", "pillager", "vindicator", "evoker", "ravager", "shulker", "parched", "camel_husk"}


def particle(spec: str):
    """'minecraft:warped_spore' | 'dust:#rrggbb:scale' -> ParticleOptions JSON."""
    if spec.startswith("dust:"):
        parts = spec.split(":")
        col = parts[1]
        sc = float(parts[2]) if len(parts) > 2 else 1.0
        return {"type": "minecraft:dust", "color": rgb_int(col), "scale": max(0.01, min(4.0, sc))}
    pid = spec if ":" in spec else "minecraft:" + spec
    return {"type": pid}


def vanilla_climate(dim, b):
    hot = "heat" in dim.effects or dim.terrain.fluid == "minecraft:lava"
    if b.snowy:
        temp = -0.3
    elif hot:
        temp = 2.0
    else:
        temp = max(0.2, min(1.6, 0.8 + 0.5 * b.temperature))
    downfall = max(0.0, min(1.0, 0.5 + 0.4 * b.humidity))
    return temp, downfall, bool(b.precipitation or b.snowy)


def spawn_entry(entity, w, lo, hi):
    lo, hi = max(1, int(lo)), max(1, int(hi))
    return {"type": entity, "weight": max(1, int(w)), "minCount": min(lo, hi), "maxCount": max(lo, hi)}


def build_spawners(ctx, dim, b, creature_cat, creatures_ok):
    out = {c: [] for c in SPAWN_CATEGORIES}
    for s in b.spawns:
        if ":" in s.creature and not s.creature.startswith(NS + ":"):
            ent = s.creature
            cat = VANILLA_CATEGORY.get(ent) or ("monster" if ent.split(":", 1)[1] in VANILLA_MONSTERS else "creature")
        else:
            cid = s.creature.split(":", 1)[-1]
            if not creatures_ok or cid not in creature_cat:
                continue
            ent = f"{NS}:{cid}"
            cat = creature_cat[cid]
        if cat not in out:
            cat = "creature"
        out[cat].append(spawn_entry(ent, s.weight, s.group[0], s.group[1]))
    return out


def emit_biome(ctx, dim, b, steps, carvers, spawners):
    sky = dim.sky
    attrs = {}
    if b.sky_color:
        attrs["minecraft:visual/sky_color"] = hex_rgb(b.sky_color)
    if b.fog_color:
        attrs["minecraft:visual/fog_color"] = hex_rgb(b.fog_color)
    if b.fog_end is not None:
        attrs["minecraft:visual/fog_end_distance"] = float(b.fog_end)
        start = sky.fog_start if sky.fog_start is not None else 0.0
        attrs["minecraft:visual/fog_start_distance"] = float(min(start, b.fog_end * 0.4))
        if b.fog_end < 400:
            attrs["minecraft:visual/sky_fog_end_distance"] = float(max(32.0, b.fog_end * 1.5))
    wfog = b.water_fog_color or sky.water_fog_color or scale_hex(b.water_color, 0.25)
    attrs["minecraft:visual/water_fog_color"] = hex_rgb(wfog)
    if b.particles:
        attrs["minecraft:visual/ambient_particles"] = [
            {"particle": particle(p), "probability": float(max(0.0, min(1.0, pr)))} for p, pr in b.particles]
    if b.music:
        attrs["minecraft:audio/background_music"] = {"default": music_entry(b.music), "creative": music_entry(b.music)}
    if b.ambient:
        attrs["minecraft:audio/ambient_sounds"] = ambient_entry(ctx, b.ambient, AMBIENT_ADDITIONS.get(b.ambient))
    effects = {"water_color": hex_rgb(b.water_color)}
    if b.grass_color:
        effects["grass_color"] = hex_rgb(b.grass_color)
    if b.foliage_color:
        effects["foliage_color"] = hex_rgb(b.foliage_color)
        effects["dry_foliage_color"] = hex_rgb(b.foliage_color)
    temp, downfall, precip = vanilla_climate(dim, b)
    biome = {
        "attributes": dict(sorted(attrs.items())),
        "carvers": list(carvers),
        "downfall": float(downfall),
        "effects": effects,
        "features": steps,
        "has_precipitation": precip,
        "spawn_costs": {},
        "spawners": spawners,
        "temperature": float(temp),
    }
    write_json(ctx.data("worldgen", "biome", b.id + ".json"), biome)
    ctx.lang[f"biome.{NS}.{b.id}"] = b.name
