"""Data pack files (damage types, tags, recipes, loot, advancements) and the English language file."""
from .common import DATA, write_json

NS = "ordnance"


def d(rel, obj, namespace=NS):
    write_json(f"{namespace}/{rel}", obj, base=DATA)


def damage_types():
    for name, scaling, extra in (
        ("blast", "always", {}),
        ("missile_strike", "always", {}),
        ("backblast", "always", {}),
        ("shrapnel", "when_caused_by_living_non_player", {}),
        ("incinerated", "when_caused_by_living_non_player", {"effects": "burning"}),
    ):
        d(f"damage_type/{name}.json", {"exhaustion": 0.1, "message_id": f"ordnance.{name}", "scaling": scaling, **extra})

    def vanilla_tag(tag, values):
        d(f"tags/damage_type/{tag}.json", {"replace": False, "values": [f"ordnance:{v}" for v in values]}, namespace="minecraft")

    vanilla_tag("is_explosion", ["blast", "missile_strike", "backblast"])
    vanilla_tag("is_fire", ["incinerated"])
    vanilla_tag("is_projectile", ["shrapnel"])
    vanilla_tag("no_knockback", ["blast", "missile_strike", "backblast", "shrapnel", "incinerated"])
    vanilla_tag("burns_armor_stands", ["incinerated"])
    vanilla_tag("panic_causes", ["blast", "missile_strike", "incinerated", "shrapnel"])
    vanilla_tag("always_hurts_ender_dragons", ["blast", "missile_strike"])


def block_tags():
    d("tags/block/explosion_proof.json", {"values": []})
    d("tags/block/shatterable.json", {"values": [
        "#minecraft:impermeable", "#c:glass_blocks", "#c:glass_panes", "minecraft:glass_pane", "minecraft:ice",
        "minecraft:glowstone", "minecraft:sea_lantern", "minecraft:redstone_lamp",
    ]})
    d("tags/block/scorchable.json", {"values": [
        "minecraft:grass_block", "minecraft:dirt", "minecraft:coarse_dirt", "minecraft:podzol", "minecraft:mycelium",
        "minecraft:dirt_path", "minecraft:farmland", "minecraft:rooted_dirt", "minecraft:moss_block", "minecraft:pale_moss_block",
    ]})
    d("tags/block/burns_away.json", {"values": [
        "minecraft:short_grass", "minecraft:tall_grass", "minecraft:fern", "minecraft:large_fern", "#minecraft:flowers",
        "minecraft:dead_bush", "#minecraft:saplings", "minecraft:sweet_berry_bush", "#minecraft:crops", "minecraft:vine",
        "minecraft:bush", "minecraft:short_dry_grass", "minecraft:tall_dry_grass", "minecraft:leaf_litter",
        "minecraft:firefly_bush", "minecraft:moss_carpet", "minecraft:pale_moss_carpet", "minecraft:glow_lichen",
        "minecraft:hanging_roots",
    ]})
    d("tags/block/mineable/shovel.json", {"replace": False, "values": ["ordnance:scorched_earth", "ordnance:ash_layer"]}, namespace="minecraft")
    d("tags/block/mineable/axe.json", {"replace": False, "values": ["ordnance:charred_log"]}, namespace="minecraft")


def survives(item):
    return {"type": "minecraft:block", "pools": [{"rolls": 1.0, "bonus_rolls": 0.0, "entries": [{"type": "minecraft:item", "name": item}],
                                                  "conditions": [{"condition": "minecraft:survives_explosion"}]}]}


def loot_tables():
    d("loot_table/blocks/scorched_earth.json", {**survives("ordnance:scorched_earth"), "random_sequence": "ordnance:blocks/scorched_earth"})
    d("loot_table/blocks/charred_log.json", {
        "type": "minecraft:block",
        "random_sequence": "ordnance:blocks/charred_log",
        "pools": [{
            "rolls": 1.0, "bonus_rolls": 0.0,
            "entries": [{
                "type": "minecraft:alternatives",
                "children": [
                    {"type": "minecraft:item", "name": "ordnance:charred_log", "conditions": [{
                        "condition": "minecraft:match_tool",
                        "predicate": {"predicates": {"minecraft:enchantments": [{"enchantments": "minecraft:silk_touch", "levels": {"min": 1}}]}},
                    }]},
                    {"type": "minecraft:item", "name": "minecraft:charcoal", "functions": [
                        {"function": "minecraft:set_count", "count": {"type": "minecraft:uniform", "min": 1.0, "max": 2.0}},
                        {"function": "minecraft:explosion_decay"},
                    ]},
                ],
            }],
        }],
    })
    d("loot_table/blocks/ash_layer.json", {"type": "minecraft:block", "pools": [], "random_sequence": "ordnance:blocks/ash_layer"})


RECIPES = {}


def shaped(name, pattern, key, result, count=1, category="equipment"):
    RECIPES[name] = {"type": "minecraft:crafting_shaped", "category": category, "pattern": pattern, "key": key,
                     "result": {"id": f"ordnance:{result}", "count": count}}


def shapeless(name, ingredients, result, count=1, category="misc"):
    RECIPES[name] = {"type": "minecraft:crafting_shapeless", "category": category, "ingredients": ingredients,
                     "result": {"id": f"ordnance:{result}", "count": count}}


def recipes():
    coal = ["minecraft:coal", "minecraft:charcoal"]
    shapeless("explosive_charge", ["minecraft:tnt", "minecraft:gunpowder", "minecraft:gunpowder", "minecraft:clay_ball", "minecraft:iron_nugget"], "explosive_charge", 2)
    shaped("frag_grenade", [" N ", "ICI", " I "], {"N": "minecraft:iron_nugget", "I": "minecraft:iron_ingot", "C": "ordnance:explosive_charge"}, "frag_grenade", 3)
    shaped("incendiary_grenade", [" N ", "BCB", " I "], {"N": "minecraft:iron_nugget", "B": "minecraft:blaze_powder", "C": "ordnance:explosive_charge", "I": "minecraft:iron_ingot"}, "incendiary_grenade", 2)
    shaped("smoke_grenade", [" N ", "WGW", " I "], {"N": "minecraft:iron_nugget", "W": "minecraft:white_dye", "G": "minecraft:gunpowder", "I": "minecraft:iron_ingot"}, "smoke_grenade", 3)
    shaped("rpg7", ["  S", "III", "PTP"], {"S": "minecraft:spyglass", "I": "minecraft:iron_ingot", "P": "#minecraft:planks", "T": "minecraft:tripwire_hook"}, "rpg7")
    shaped("pg7v_rocket", [" C ", "NIN", " G "], {"C": "ordnance:explosive_charge", "N": "minecraft:iron_nugget", "I": "minecraft:iron_ingot", "G": "minecraft:gunpowder"}, "pg7v_rocket", 2)
    shaped("tbg7v_rocket", [" F ", "NCN", "IGI"], {"F": "minecraft:fire_charge", "N": "minecraft:iron_nugget", "C": "ordnance:explosive_charge", "I": "minecraft:iron_ingot", "G": "minecraft:gunpowder"}, "tbg7v_rocket", 2)
    shaped("grenade_launcher", ["III", "TDI", "S  "], {"I": "minecraft:iron_ingot", "T": "minecraft:tripwire_hook", "D": "minecraft:dispenser", "S": "minecraft:stick"}, "grenade_launcher")
    shaped("grenade_40mm_he", ["C", "G", "B"], {"C": "ordnance:explosive_charge", "G": "minecraft:gunpowder", "B": "minecraft:copper_ingot"}, "grenade_40mm_he", 4)
    shaped("grenade_40mm_incendiary", ["P", "G", "B"], {"P": "minecraft:blaze_powder", "G": "minecraft:gunpowder", "B": "minecraft:copper_ingot"}, "grenade_40mm_incendiary", 4)
    shaped("grenade_40mm_smoke", ["W", "G", "B"], {"W": "minecraft:white_dye", "G": "minecraft:gunpowder", "B": "minecraft:copper_ingot"}, "grenade_40mm_smoke", 4)
    shaped("flamethrower", ["  F", "IIR", "BT "], {"F": "minecraft:flint_and_steel", "I": "minecraft:iron_ingot", "R": "minecraft:blaze_rod", "B": "minecraft:bucket", "T": "minecraft:tripwire_hook"}, "flamethrower")
    shapeless("fuel_canister", ["minecraft:iron_ingot", coal, coal, "minecraft:blaze_powder", "minecraft:slime_ball"], "fuel_canister", 2)
    shaped("strike_designator", [" S ", "RDR", "ICI"], {"S": "minecraft:spyglass", "R": "minecraft:redstone", "D": "minecraft:diamond", "I": "minecraft:iron_ingot", "C": "minecraft:compass"}, "strike_designator")
    shaped("hypersonic_missile", [" D ", "ETE", "IBI"], {"D": "minecraft:diamond", "E": "ordnance:explosive_charge", "T": "minecraft:tnt", "I": "minecraft:iron_block", "B": "minecraft:blaze_rod"}, "hypersonic_missile")
    for name, recipe in RECIPES.items():
        d(f"recipe/{name}.json", recipe)
    d("advancement/recipes/arsenal.json", {
        "parent": "minecraft:recipes/root",
        "criteria": {
            "has_gunpowder": {"trigger": "minecraft:inventory_changed", "conditions": {"items": [{"items": "minecraft:gunpowder"}]}},
            "has_iron_ingot": {"trigger": "minecraft:inventory_changed", "conditions": {"items": [{"items": "minecraft:iron_ingot"}]}},
        },
        "requirements": [["has_gunpowder", "has_iron_ingot"]],
        "rewards": {"recipes": [f"ordnance:{name}" for name in RECIPES]},
    })


LANG = {
    "itemGroup.ordnance.arsenal": "Ordnance",
    "item.ordnance.explosive_charge": "Explosive Charge",
    "item.ordnance.frag_grenade": "Frag Grenade",
    "item.ordnance.frag_grenade.desc": "Fragmentation hand grenade.",
    "item.ordnance.incendiary_grenade": "Incendiary Grenade",
    "item.ordnance.incendiary_grenade.desc": "Sprays burning fuel that clings to any surface.",
    "item.ordnance.smoke_grenade": "Smoke Grenade",
    "item.ordnance.smoke_grenade.desc": "Vents a thick white smoke screen for 20 seconds.",
    "item.ordnance.rpg7": "RPG-7",
    "item.ordnance.pg7v_rocket": "PG-7V HEAT Rocket",
    "item.ordnance.pg7v_rocket.desc": "Shaped-charge warhead: punches through walls.",
    "item.ordnance.tbg7v_rocket": "TBG-7V Thermobaric Rocket",
    "item.ordnance.tbg7v_rocket.desc": "Fuel-air warhead: huge fireball and blast wave.",
    "item.ordnance.grenade_launcher": "Grenade Launcher",
    "item.ordnance.grenade_40mm_he": "40mm HE Grenade",
    "item.ordnance.grenade_40mm_he.desc": "High-explosive fragmentation round.",
    "item.ordnance.grenade_40mm_incendiary": "40mm Incendiary Grenade",
    "item.ordnance.grenade_40mm_incendiary.desc": "Scatters burning fuel on impact.",
    "item.ordnance.grenade_40mm_smoke": "40mm Smoke Grenade",
    "item.ordnance.grenade_40mm_smoke.desc": "Deploys a smoke screen at range.",
    "item.ordnance.flamethrower": "Flamethrower",
    "item.ordnance.fuel_canister": "Fuel Canister",
    "item.ordnance.strike_designator": "Strike Designator",
    "item.ordnance.strike_designator.desc": "Laser-designates targets for hypersonic missile strikes.",
    "item.ordnance.hypersonic_missile": "Hypersonic Missile",
    "item.ordnance.hypersonic_missile.desc": "Expended when a strike is called in with a Strike Designator.",
    "block.ordnance.scorched_earth": "Scorched Earth",
    "block.ordnance.charred_log": "Charred Log",
    "block.ordnance.ash_layer": "Ash",
    "block.ordnance.burning_fuel": "Burning Fuel",
    "entity.ordnance.grenade": "Grenade",
    "entity.ordnance.launcher_grenade": "40mm Grenade",
    "entity.ordnance.rocket": "Rocket",
    "entity.ordnance.hypersonic_missile": "Hypersonic Missile",
    "entity.ordnance.debris": "Debris",
    "key.category.ordnance.arsenal": "Ordnance",
    "key.ordnance.fire_mode": "Cycle Fire Mode",
    "fire_mode.ordnance.impact": "Impact",
    "fire_mode.ordnance.timed": "Timed",
    "tooltip.ordnance.loaded": "Loaded: %s/%s",
    "tooltip.ordnance.reload_hint": "Hold Use while empty, or Sneak + Use, to reload",
    "tooltip.ordnance.fire_mode": "Fire mode: %s",
    "tooltip.ordnance.fire_mode_hint": "Press Cycle Fire Mode (default V) to switch",
    "tooltip.ordnance.fuse": "Fuse: %s s",
    "tooltip.ordnance.cook_hint": "Hold Use to cook the fuse, release to throw",
    "tooltip.ordnance.fuel": "Fuel: %s/%s",
    "tooltip.ordnance.refuel_hint": "Sneak + hold Use to refuel from Fuel Canisters",
    "tooltip.ordnance.designator_hint": "Hold Use on a target until it locks, then release",
    "hud.ordnance.fuel": "FUEL",
    "hud.ordnance.empty": "EMPTY",
    "hud.ordnance.reload": "Hold Use to reload",
    "hud.ordnance.missiles": "Missiles: %s",
    "hud.ordnance.no_target": "NO TARGET",
    "hud.ordnance.locked": "TARGET LOCKED - RELEASE TO FIRE",
    "hud.ordnance.locking": "LOCKING %s%%",
    "hud.ordnance.range": "Range %s m",
    "hud.ordnance.fuse": "FUSE %s s",
    "hud.ordnance.incoming": "⚠ INCOMING MISSILE STRIKE  T-%s s",
    "hud.ordnance.distance": "%s m from impact point",
    "message.ordnance.fire_mode": "Fire mode: %s",
    "message.ordnance.no_missile": "No Hypersonic Missile in inventory",
    "message.ordnance.strike_confirmed": "Strike confirmed - missile inbound, release in %s s",
    "commands.ordnance.unknown_warhead": "Unknown warhead '%s'",
    "commands.ordnance.reload.success": "Reloaded Ordnance config from %s",
    "commands.ordnance.reload.failed": "Could not parse %s; using defaults",
    "commands.ordnance.explode.success": "Detonated %s",
    "commands.ordnance.strike.success": "Missile strike scheduled",
    "death.attack.ordnance.blast": "%1$s was blown up",
    "death.attack.ordnance.blast.player": "%1$s was blown up by %2$s",
    "death.attack.ordnance.blast.item": "%1$s was blown up by %2$s using %3$s",
    "death.attack.ordnance.missile_strike": "%1$s was vaporized by a missile strike",
    "death.attack.ordnance.missile_strike.player": "%1$s was vaporized by %2$s's missile strike",
    "death.attack.ordnance.missile_strike.item": "%1$s was vaporized by %2$s's missile strike",
    "death.attack.ordnance.backblast": "%1$s stood behind a rocket launcher",
    "death.attack.ordnance.backblast.player": "%1$s was caught in %2$s's backblast",
    "death.attack.ordnance.backblast.item": "%1$s was caught in %2$s's backblast",
    "death.attack.ordnance.shrapnel": "%1$s was shredded by shrapnel",
    "death.attack.ordnance.shrapnel.player": "%1$s was shredded by %2$s's shrapnel",
    "death.attack.ordnance.shrapnel.item": "%1$s was shredded by %2$s's shrapnel",
    "death.attack.ordnance.incinerated": "%1$s was incinerated",
    "death.attack.ordnance.incinerated.player": "%1$s was incinerated by %2$s",
    "death.attack.ordnance.incinerated.item": "%1$s was incinerated by %2$s using %3$s",
    "subtitles.ordnance.explosion": "Explosion",
    "subtitles.ordnance.explosion_huge": "Massive explosion",
    "subtitles.ordnance.explosion_distant": "Distant explosion",
    "subtitles.ordnance.explosion_underwater": "Underwater explosion",
    "subtitles.ordnance.explosion_incendiary": "Incendiary burst",
    "subtitles.ordnance.debris": "Debris rains down",
    "subtitles.ordnance.debris_land": "Debris lands",
    "subtitles.ordnance.smoke_pop": "Smoke grenade pops",
    "subtitles.ordnance.smoke_hiss": "Smoke hisses",
    "subtitles.ordnance.grenade_pin": "Grenade pin pulled",
    "subtitles.ordnance.grenade_throw": "Grenade thrown",
    "subtitles.ordnance.grenade_bounce": "Grenade bounces",
    "subtitles.ordnance.rpg_fire": "RPG fires",
    "subtitles.ordnance.rpg_reload": "Rocket loaded",
    "subtitles.ordnance.reload_done": "Weapon ready",
    "subtitles.ordnance.rocket_motor": "Rocket motor roars",
    "subtitles.ordnance.gl_fire": "Grenade launcher fires",
    "subtitles.ordnance.gl_reload": "Round loaded",
    "subtitles.ordnance.gl_mode": "Fire mode switched",
    "subtitles.ordnance.flamethrower_ignite": "Flamethrower ignites",
    "subtitles.ordnance.flamethrower": "Flamethrower roars",
    "subtitles.ordnance.flamethrower_stop": "Flamethrower sputters",
    "subtitles.ordnance.flamethrower_refuel": "Flamethrower refuels",
    "subtitles.ordnance.designator_beep": "Designator beeps",
    "subtitles.ordnance.designator_lock": "Target locked",
    "subtitles.ordnance.designator_confirm": "Strike confirmed",
    "subtitles.ordnance.missile_alarm": "Missile warning",
    "subtitles.ordnance.missile_incoming": "Missile screams overhead",
    "subtitles.ordnance.sonic_boom": "Sonic boom",
    "subtitles.ordnance.dry_fire": "Click",
}


def lang():
    write_json("lang/en_us.json", LANG)


def generate():
    damage_types()
    block_tags()
    loot_tables()
    recipes()
    lang()
