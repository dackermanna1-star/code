#!/usr/bin/env python3
"""Generates the mod's data-driven JSON (damage types, tags, block/item models, sounds.json, particles).
Run from the repo root: python3 tools/gen_data.py"""
import json, os

NS = "jjkshowdown"
RES = "src/main/resources"
A = f"{RES}/assets/{NS}"
D = f"{RES}/data/{NS}"


def write(path, obj):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(obj, f, indent=2, ensure_ascii=False)
        f.write("\n")


# ---------------------------------------------------------------- damage types
damage = ["technique", "blue", "red", "hollow_purple", "dismantle", "cleave", "fuga", "world_slash",
          "domain_sure_hit", "black_flash", "slam", "backlash", "finisher"]
for d in damage:
    write(f"{D}/damage_type/{d}.json", {"message_id": f"{NS}.{d}", "scaling": "never", "exhaustion": 0.1})

def tag(path, values):
    write(path, {"replace": False, "values": values})

ns = lambda xs: [f"{NS}:{x}" for x in xs]
tag(f"{RES}/data/minecraft/tags/damage_type/bypasses_armor.json", ns(["hollow_purple", "world_slash", "domain_sure_hit", "backlash", "finisher"]))
tag(f"{RES}/data/minecraft/tags/damage_type/no_knockback.json", ns(["domain_sure_hit", "blue", "backlash"]))
tag(f"{RES}/data/minecraft/tags/damage_type/bypasses_shield.json", ns(["hollow_purple", "world_slash", "domain_sure_hit", "cleave", "backlash", "finisher"]))
tag(f"{D}/tags/damage_type/bypasses_infinity.json", ns(["world_slash", "domain_sure_hit", "backlash", "hollow_purple", "finisher"]))
tag(f"{D}/tags/damage_type/unblockable.json", ns(["hollow_purple", "world_slash", "domain_sure_hit", "backlash", "finisher"]))
tag(f"{D}/tags/damage_type/is_technique.json", ns(["technique", "blue", "red", "hollow_purple", "dismantle", "cleave", "fuga",
                                                      "world_slash", "domain_sure_hit", "black_flash", "slam"]))

# ---------------------------------------------------------------- blocks
blocks = {
    "unlimited_void_barrier": "cube_all",
    "void_floor": "cube_all",
    "shrine_pillar": "pillar",
    "shrine_roof": "cube_all",
    "shrine_bone": "cube_all",
    "cursed_blood": "cube_all",
}
for b, kind in blocks.items():
    write(f"{A}/blockstates/{b}.json", {"variants": {"": {"model": f"{NS}:block/{b}"}}})
    if kind == "pillar":
        model = {"parent": "minecraft:block/cube_column", "textures": {"end": f"{NS}:block/{b}_top", "side": f"{NS}:block/{b}"}}
    else:
        model = {"parent": "minecraft:block/cube_all", "textures": {"all": f"{NS}:block/{b}"}}
    write(f"{A}/models/block/{b}.json", model)
    write(f"{A}/models/item/{b}.json", {"parent": f"{NS}:block/{b}"})
    write(f"{A}/items/{b}.json", {"model": {"type": "minecraft:model", "model": f"{NS}:item/{b}"}})

# ---------------------------------------------------------------- items
for it in ["sukuna_finger", "gojo_blindfold", "gojo_spawn_egg", "sukuna_spawn_egg"]:
    write(f"{A}/models/item/{it}.json", {"parent": "minecraft:item/generated", "textures": {"layer0": f"{NS}:item/{it}"}})
    write(f"{A}/items/{it}.json", {"model": {"type": "minecraft:model", "model": f"{NS}:item/{it}"}})

# equipment asset for the wearable blindfold
write(f"{A}/equipment/gojo_blindfold.json", {"layers": {"humanoid": [{"texture": f"{NS}:gojo_blindfold"}]}})

# ---------------------------------------------------------------- particles
frames4 = ["blue_spark", "red_spark", "purple_spark", "ce_wisp_blue", "ce_wisp_red", "slash", "slash_red", "black_flash",
           "void_star", "impact_flash", "rct_glow", "fuga_flame", "domain_ember"]
for p in frames4:
    write(f"{A}/particles/{p}.json", {"textures": [f"{NS}:{p}_{i}" for i in range(4)]})
write(f"{A}/particles/shockwave.json", {"textures": [f"{NS}:shockwave"]})
write(f"{A}/particles/blood.json", {"textures": [f"{NS}:blood_0", f"{NS}:blood_1"]})

# ---------------------------------------------------------------- sounds
sfx = {
    "gojo": ["infinity_on", "infinity_off", "infinity_block", "blue_cast", "blue_loop", "red_charge", "red_fire", "red_impact",
             "purple_charge", "purple_fire", "blink", "void_activate", "void_ambient"],
    "sukuna": ["dismantle", "dismantle_barrage", "cleave", "fuga_charge", "fuga_fire", "fuga_explode", "world_slash_charge",
               "world_slash", "shrine_activate", "shrine_ambient", "shrine_slash", "amplification_on"],
    "combat": ["punch_light", "punch_heavy", "combo_finisher", "black_flash", "dodge", "block", "parry", "counter", "double_jump",
               "slam", "finisher", "rct"],
    "domain": ["clash", "shatter", "barrier_form", "clash_win"],
    "ui": ["qte_prompt", "qte_success", "qte_fail", "select", "level_up", "cinematic_hit"],
}
sounds = {}
for group, names in sfx.items():
    for n in names:
        entry = {"sounds": [{"name": f"{NS}:{group}/{n}"}], "subtitle": f"subtitles.{NS}.{group}.{n}"}
        if group in ("gojo", "sukuna", "domain") and n in ("red_impact", "purple_fire", "void_activate", "fuga_explode", "world_slash",
                                                             "shrine_activate", "shatter", "clash"):
            entry["sounds"][0]["attenuation_distance"] = 64
        sounds[f"{group}.{n}"] = entry
for m in ["battle_gojo", "battle_sukuna", "unlimited_void", "malevolent_shrine"]:
    sounds[f"music.{m}"] = {"sounds": [{"name": f"{NS}:music/{m}", "stream": True}]}
voices = {
    "gojo": ["domain", "honored_one", "blue", "red", "purple", "purple_incantation", "nah_id_win", "strongest", "intro", "taunt",
             "victory", "defeat", "select", "infinity", "clash"],
    "sukuna": ["domain", "dismantle", "cleave", "fuga", "incantation", "world_slash", "know_your_place", "stand_proud", "intro",
               "taunt", "victory", "defeat", "select", "clash"],
}
for ch, lines in voices.items():
    for l in lines:
        sounds[f"voice.{ch}.{l}"] = {"sounds": [{"name": f"{NS}:voice/{ch}/{l}", "attenuation_distance": 40}]}
write(f"{A}/sounds.json", sounds)

# ---------------------------------------------------------------- recipes
write(f"{D}/recipe/gojo_blindfold.json", {
    "type": "minecraft:crafting_shaped",
    "category": "equipment",
    "pattern": ["WWW", "SES", "WWW"],
    "key": {"W": "minecraft:black_wool", "S": "minecraft:string", "E": "minecraft:ender_eye"},
    "result": {"id": f"{NS}:gojo_blindfold", "count": 1}})
write(f"{D}/recipe/sukuna_finger.json", {
    "type": "minecraft:crafting_shaped",
    "category": "misc",
    "pattern": [" N ", "BRB", " W "],
    "key": {"N": "minecraft:nether_wart", "B": "minecraft:bone", "R": "minecraft:rotten_flesh", "W": "minecraft:wither_rose"},
    "result": {"id": f"{NS}:sukuna_finger", "count": 1}})
print("data generated")
