#!/usr/bin/env python3
"""Generates assets/calibercraft/lang/en_us.json (merging the sound generator's subtitle strings)."""
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
OUT = os.path.join(ROOT, "src", "main", "resources", "assets", "calibercraft", "lang", "en_us.json")
SUBTITLES = os.path.join(ROOT, "tools", "assetgen", "sounds", "subtitles_en_us.json")

L = {}

WEAPONS = {
    "m9": "M9 Tactical", "revolver": "Heavy Revolver", "vector9": "Vector-9", "mp5": "MP5 Tactical", "ar15": "AR-15 Carbine",
    "ak": "AK-Style Rifle", "bullpup": "Bullpup Rifle", "pump_shotgun": "Pump-Action Shotgun", "auto_shotgun": "Semi-Automatic Shotgun",
    "sniper": "Bolt-Action Sniper Rifle", "dmr": "DMR", "lmg": "LMG",
}
ATTACHMENTS = {
    "red_dot": "Red Dot Sight", "holo_sight": "Holographic Sight", "acog_scope": "3x Combat Scope", "sniper_scope": "8x Sniper Scope",
    "suppressor": "Suppressor", "compensator": "Compensator", "muzzle_brake": "Muzzle Brake", "flash_hider": "Flash Hider",
    "shotgun_choke": "Shotgun Choke", "short_barrel": "Short Barrel", "precision_barrel": "Precision Barrel", "heavy_barrel": "Heavy Barrel",
    "vertical_grip": "Vertical Grip", "angled_grip": "Angled Grip", "ergonomic_grip": "Ergonomic Grip", "bipod": "Bipod",
    "lightweight_stock": "Lightweight Stock", "precision_stock": "Precision Stock", "extended_mag": "Extended Magazine",
    "quick_mag": "Quick-Reload Magazine", "laser_sight": "Laser Sight", "charm_creeper": "Creeper Charm", "charm_diamond": "Diamond Charm",
    "charm_dogtag": "Dog Tag Charm",
}
AMMO_ITEMS = {
    "ammo_9mm": "9mm Rounds", "ammo_9mm_hp": "9mm Hollow-Point Rounds", "ammo_44": ".44 Magnum Rounds",
    "ammo_44_hp": ".44 Magnum Hollow-Point Rounds", "ammo_556": "5.56mm Rounds", "ammo_556_ap": "5.56mm Armor-Piercing Rounds",
    "ammo_762": "7.62x39mm Rounds", "ammo_762_ap": "7.62x39mm Armor-Piercing Rounds", "ammo_308": ".308 Rounds",
    "ammo_308_ap": ".308 Armor-Piercing Rounds", "ammo_338": ".338 Rounds", "ammo_338_ap": ".338 Armor-Piercing Rounds",
    "shell_buckshot": "12 Gauge Buckshot", "shell_slug": "12 Gauge Slugs", "shell_incendiary": "12 Gauge Dragon's Breath",
}
AMMO_SHORT = {
    "9mm": "9mm FMJ", "9mm_hp": "9mm HP", "44": ".44 FMJ", "44_hp": ".44 HP", "556": "5.56 FMJ", "556_ap": "5.56 AP",
    "762": "7.62 FMJ", "762_ap": "7.62 AP", "308": ".308 FMJ", "308_ap": ".308 AP", "338": ".338 FMJ", "338_ap": ".338 AP",
    "12g_buckshot": "Buckshot", "12g_slug": "Slug", "12g_incendiary": "Dragon's Breath",
}
CALIBERS = {"9mm": "9x19mm", "44_magnum": ".44 Magnum", "556": "5.56x45mm", "762x39": "7.62x39mm", "308": ".308 Winchester",
            "338": ".338 Lapua", "12_gauge": "12 Gauge"}
SKINS = {"standard": "Standard Issue", "matte_black": "Matte Black", "desert_tan": "Desert Tan", "woodland": "Woodland Camo",
         "arctic": "Arctic Camo", "digital": "Digital Camo", "industrial": "Industrial Steel", "worn": "Battle Worn",
         "neon": "Neon Circuit", "energy": "Voidlight Energy"}
SLOTS = {"optic": "Optic", "muzzle": "Muzzle", "barrel": "Barrel", "grip": "Underbarrel", "stock": "Stock", "magazine": "Magazine",
         "tactical": "Tactical", "charm": "Charm"}
STAT_NAMES = {
    "damage": "damage", "pellets": "pellets", "rpm": "fire rate", "magazine": "magazine size", "effective_range": "effective range",
    "max_range": "maximum range", "min_damage_mult": "long-range damage", "velocity": "bullet velocity", "gravity": "bullet drop",
    "penetration": "penetration", "armor_penetration": "armor penetration", "headshot_mult": "headshot damage",
    "recoil_vertical": "vertical recoil", "recoil_horizontal": "horizontal recoil", "recoil_recovery": "recoil recovery",
    "spread_hip": "hip-fire spread", "spread_ads": "aimed spread", "spread_move": "moving spread", "spread_bloom": "spread per shot",
    "spread_bloom_max": "maximum bloom", "ads_time": "aim-down-sights time", "equip_time": "draw time", "move_speed": "movement speed",
    "ads_move_speed": "aimed movement speed", "reload_speed": "reload speed", "zoom": "zoom", "loudness": "noise",
    "flash": "muzzle flash", "sway": "aim sway", "heat_per_shot": "heat per shot", "heat_cooling": "cooling", "knockback": "knockback",
    "melee_damage": "melee damage",
}
ROWS = {"damage": "Damage", "rpm": "Fire rate", "range": "Range", "accuracy": "Accuracy", "hip": "Hip-fire", "recoil": "Recoil",
        "handling": "Aim time", "mobility": "Mobility", "reload": "Reload", "magazine": "Magazine", "velocity": "Velocity",
        "noise": "Noise", "zoom": "Zoom"}

for k, v in WEAPONS.items():
    L[f"item.calibercraft.{k}"] = v
for k, v in ATTACHMENTS.items():
    L[f"item.calibercraft.{k}"] = v
for k, v in AMMO_ITEMS.items():
    L[f"item.calibercraft.{k}"] = v
L["item.calibercraft.gun_parts"] = "Gun Parts"
L["item.calibercraft.precision_parts"] = "Precision Parts"
L["item.calibercraft.prismatic_finish_kit"] = "Prismatic Finish Kit"
L["block.calibercraft.gunsmith_bench"] = "Gunsmith Bench"
for k, v in AMMO_SHORT.items():
    L[f"calibercraft.ammo.{k}"] = v
for k, v in CALIBERS.items():
    L[f"calibercraft.caliber.{k}"] = v
for k, v in SKINS.items():
    L[f"calibercraft.skin.{k}"] = v
for k, v in SLOTS.items():
    L[f"calibercraft.slot.{k}"] = v
for k, v in STAT_NAMES.items():
    L[f"calibercraft.stat_name.{k}"] = v
for k, v in ROWS.items():
    L[f"calibercraft.stat.{k}"] = v
L.update({
    "calibercraft.rarity.common": "Common", "calibercraft.rarity.rare": "Rare", "calibercraft.rarity.legendary": "Legendary",
    "calibercraft.category.pistol": "Pistol", "calibercraft.category.revolver": "Revolver", "calibercraft.category.smg": "Submachine Gun",
    "calibercraft.category.rifle": "Rifle", "calibercraft.category.shotgun": "Shotgun", "calibercraft.category.sniper": "Sniper Rifle",
    "calibercraft.category.lmg": "Light Machine Gun",
    "calibercraft.fire_mode.semi": "Semi-auto", "calibercraft.fire_mode.burst": "Burst", "calibercraft.fire_mode.auto": "Automatic",
    "calibercraft.fire_mode.bolt": "Bolt-action", "calibercraft.fire_mode.pump": "Pump-action",
    "calibercraft.hud.reloading": "RELOADING", "calibercraft.hud.cycling": "CYCLING", "calibercraft.hud.overheated": "OVERHEATED",
    "calibercraft.hud.reload_hint": "EMPTY - press R to reload", "calibercraft.hud.no_ammo": "NO AMMUNITION",
    "key.category.calibercraft.weapons": "CaliberCraft Weapons",
    "key.calibercraft.reload": "Reload (sneak: unload)", "key.calibercraft.fire_mode": "Switch Fire Mode",
    "key.calibercraft.ammo_type": "Switch Ammunition Type", "key.calibercraft.melee": "Melee Bash", "key.calibercraft.inspect": "Inspect Weapon",
    "key.calibercraft.customize": "Field Customization", "key.calibercraft.settings": "CaliberCraft Settings",
    "death.attack.calibercraft.bullet": "%1$s was shot by %2$s",
    "death.attack.calibercraft.bullet.item": "%1$s was shot by %2$s using %3$s",
    "death.attack.calibercraft.bullet.player": "%1$s was shot while fighting %2$s",
    "calibercraft.tooltip.no_definition": "No weapon definition loaded (check the data pack)",
    "calibercraft.tooltip.modes": "Modes: %s", "calibercraft.tooltip.damage": "Damage: %s", "calibercraft.tooltip.rpm": "Fire rate: %s rpm",
    "calibercraft.tooltip.ammo": "Loaded: %s / %s", "calibercraft.tooltip.range": "Range: %s (max %s) blocks",
    "calibercraft.tooltip.recoil": "Recoil: %s° vertical, %s° horizontal", "calibercraft.tooltip.spread": "Spread: %s° hip, %s° aimed",
    "calibercraft.tooltip.velocity": "Muzzle velocity: %s blocks/s", "calibercraft.tooltip.handling": "Aim time: %ss, mobility %s%%",
    "calibercraft.tooltip.shift": "Hold SHIFT for full statistics", "calibercraft.tooltip.skin": "Finish: %s",
    "calibercraft.tooltip.fits": "Fits: %s", "calibercraft.tooltip.incendiary": "Sets targets on fire for %ss",
    "calibercraft.tooltip.used_by": "Used by: %s",
    "calibercraft.gunsmith.title": "Gunsmith", "calibercraft.gunsmith.field_mode": "Field customization",
    "calibercraft.gunsmith.hold_weapon": "Hold a weapon in your main hand", "calibercraft.gunsmith.needs_bench": "Requires a Gunsmith Bench",
    "calibercraft.gunsmith.reset": "Reset to Default",
    "calibercraft.gunsmith.reset.tooltip": "Returns non-default attachments to your inventory, re-installs factory parts you own and restores the standard finish",
    "calibercraft.gunsmith.stats": "Statistics", "calibercraft.gunsmith.skins": "Finish", "calibercraft.gunsmith.empty": "Standard / none",
    "calibercraft.gunsmith.remove": "Remove", "calibercraft.gunsmith.remove.tooltip": "Return the installed attachment to your inventory",
    "calibercraft.gunsmith.incompatible": "Not compatible with %s", "calibercraft.gunsmith.cosmetic": "Cosmetic only",
    "calibercraft.gunsmith.owned": "In inventory: %s", "calibercraft.gunsmith.requires_kit": "Consumes a Prismatic Finish Kit (you have %s)",
    "calibercraft.gunsmith.skin_cosmetic": "Finishes never change statistics",
    "calibercraft.gunsmith.result.ok": "Done", "calibercraft.gunsmith.result.missing_item": "You don't have that attachment",
    "calibercraft.gunsmith.result.incompatible": "That doesn't fit this weapon",
    "calibercraft.gunsmith.result.needs_bench": "That change requires a Gunsmith Bench",
    "calibercraft.gunsmith.result.needs_kit": "Requires a Prismatic Finish Kit",
    "calibercraft.gunsmith.result.hold_weapon": "Hold a weapon in your main hand",
    "calibercraft.gunsmith.result.busy": "Finish reloading first", "calibercraft.gunsmith.result.error": "Request failed",
    "calibercraft.settings.title": "CaliberCraft Settings", "calibercraft.settings.short": "Settings",
    "calibercraft.settings.tab.hud": "HUD", "calibercraft.settings.tab.effects": "Effects", "calibercraft.settings.tab.controls": "Controls",
    "calibercraft.settings.tab.audio": "Audio",
})
SETTINGS = {
    "hud_enabled": ("Weapon HUD", "Show the ammunition panel"),
    "hud_corner": ("HUD Position", "Screen corner of the ammunition panel"),
    "hud_scale": ("HUD Scale", "Size of the ammunition panel"),
    "simplified_hud": ("Simplified HUD", "High-contrast, text-only indicators"),
    "hit_markers": ("Hit Markers", "Show hit confirmation markers and ticks"),
    "damage_numbers": ("Damage Numbers", "Show damage dealt next to the crosshair"),
    "crosshair": ("Crosshair", "Crosshair style while holding a weapon"),
    "particles": ("Particle Quality", "Amount of impact, smoke and spark particles"),
    "casings": ("Shell Casings", "Ejected casings (cosmetic)"),
    "tracers": ("Tracers", "Bullet streaks"),
    "muzzle_flash": ("Muzzle Flash", "Show muzzle flashes"),
    "muzzle_light": ("Muzzle Light", "Briefly light up your weapon when firing"),
    "bullet_holes": ("Bullet Holes", "Temporary impact decals on blocks"),
    "screen_shake": ("Screen Shake", "Camera shake when firing"),
    "camera_recoil": ("Camera Recoil", "How strongly recoil moves your view"),
    "reduced_motion": ("Reduced Motion", "Disable weapon sway, bobbing, inspect flourishes and shake"),
    "toggle_aim": ("Toggle Aim", "Press once to aim instead of holding"),
    "aim_sensitivity": ("Aim Sensitivity", "Mouse sensitivity while aiming with iron sights or red dots"),
    "scope_sensitivity": ("Scope Sensitivity", "Mouse sensitivity while looking through magnified scopes"),
    "gun_volume": ("Weapon Volume", "Extra volume control for weapon sounds (also follows the Players slider)"),
    "reduce_repeated": ("Soften Automatic Fire", "Slightly lowers volume during long automatic bursts"),
    "travel_delay": ("Sound Travel Delay", "Distant gunshots arrive after the flash"),
    "occlusion": ("Sound Occlusion", "Gunshots behind walls are muffled"),
}
for k, (name, tip) in SETTINGS.items():
    L[f"calibercraft.settings.{k}"] = name
    L[f"calibercraft.settings.{k}.tooltip"] = tip
for i, v in enumerate(["Bottom right", "Bottom left", "Top right", "Top left"]):
    L[f"calibercraft.settings.hud_corner.{i}"] = v
for i, v in enumerate(["Dynamic", "Dot", "Hidden"]):
    L[f"calibercraft.settings.crosshair.{i}"] = v
for i, v in enumerate(["Low", "Medium", "High"]):
    L[f"calibercraft.settings.particles.{i}"] = v

if os.path.exists(SUBTITLES):
    L.update(json.load(open(SUBTITLES, encoding="utf-8")))

os.makedirs(os.path.dirname(OUT), exist_ok=True)
with open(OUT, "w", encoding="utf-8") as f:
    json.dump(dict(sorted(L.items())), f, indent=2, ensure_ascii=False)
    f.write("\n")
print(f"wrote {len(L)} keys to {OUT}")
