#!/usr/bin/env python3
"""Generates assets/abyssal_descent/lang/en_us.json. Run from the repository root."""
import json
import os

NS = "abyssal_descent"
L = {}


def put(key, value):
    if key in L:
        raise SystemExit(f"duplicate key {key}")
    L[key] = value


# ------------------------------------------------------------------ meta
put(f"itemGroup.{NS}", "Abyssal Descent")
put(f"modmenu.descriptionTranslation.{NS}", "A thirty-floor roguelike dungeon beneath the world.")

# ------------------------------------------------------------------ zones
ZONES = {
    "forgotten_halls": ("The Forgotten Halls", "Where the first delvers were laid to rest, and did not stay there."),
    "ashen_forge": ("The Ashen Forge", "The anvils still ring for a king no one remembers."),
    "crystal_depths": ("The Crystal Depths", "Every facet hums. Something listens back."),
    "drowned_kingdom": ("The Drowned Kingdom", "The tide came in, and the court never left."),
    "blood_citadel": ("The Blood Citadel", "Its walls are mortared with oaths, and oaths demand payment."),
    "abyssal_throne": ("The Abyssal Throne", "At the bottom of everything, a seat. And on it, a hunger."),
}
for zid, (name, tag) in ZONES.items():
    put(f"zone.{NS}.{zid}", name)
    put(f"zone.{NS}.{zid}.tagline", tag)
    put(f"biome.{NS}.{zid}", name)
put(f"biome.{NS}.void", "The Void Between")

# ------------------------------------------------------------------ rarity & kinds
for rid, name in [("common", "Common"), ("uncommon", "Uncommon"), ("rare", "Rare"), ("epic", "Epic"), ("legendary", "Legendary")]:
    put(f"rarity.{NS}.{rid}", name)
for kid, name in [("sword", "Sword"), ("axe", "Axe"), ("dagger", "Dagger"), ("greatsword", "Greatsword"), ("bow", "Bow"),
                  ("crossbow", "Crossbow"), ("relic", "Relic"), ("armor_helmet", "Helmet"), ("armor_chestplate", "Chestplate"),
                  ("armor_leggings", "Leggings"), ("armor_boots", "Boots"), ("armor", "Armor")]:
    put(f"kind.{NS}.{kid}", name)

# ------------------------------------------------------------------ tooltips
put(f"tooltip.{NS}.rarity_kind", "%s %s")
put(f"tooltip.{NS}.exclusive", "✦ Boss exclusive")
put(f"tooltip.{NS}.relic_hint", "Active in your hotbar or off-hand")
put(f"tooltip.{NS}.unsecured", "⚠ Unsecured")
put(f"tooltip.{NS}.unsecured.hint", "Lost if you fall. Extract at a waystone to keep it.")

# ------------------------------------------------------------------ weapon effects
EFFECTS = {
    "undead_bane": ("Undead Bane", "+%s%% damage against the undead."),
    "sunder": ("Sunder", "+%s damage per point of the target's armor, up to +%s."),
    "bleed": ("Rend", "Critical hits make the target bleed for %s seconds."),
    "soul_flare": ("Soul Flare", "Fully charged hits have a %s%% chance to erupt in soul fire, dealing %s damage to nearby foes."),
    "chain_lightning": ("Stormcall", "Fully charged hits have a %s%% chance to arc lightning through up to %s more foes for %s damage."),
    "grave_slam": ("Grave Slam", "Falling critical hits send out a shockwave dealing %s damage within %s blocks."),
    "soulreaver": ("Soulreaver", "Fully charged critical hits loose a wave of soul fire, dealing %s damage along a %s-block line."),
    "reap_souls": ("Reap Souls", "Kills draw the victim's soul into you, restoring %s health."),
    "soul_pierce": ("Soul Pierce", "Arrows pass through %s extra foes and strike harder."),
    "bone_shrapnel": ("Bone Shrapnel", "Bolts burst on impact, dealing %s damage to foes within %s blocks."),
}
for eid, (name, desc) in EFFECTS.items():
    put(f"effect_desc.{NS}.{eid}.name", name)
    put(f"effect_desc.{NS}.{eid}", desc)

# ------------------------------------------------------------------ relics
RELICS = {
    "gravedust_locket": ("Last Breath", "+1 maximum heart."),
    "vigil_candle": ("Vigil", "Reveals false walls and traps around you. Immunity to Blindness and Darkness."),
    "cracked_phylactery": ("Borrowed Life", "Kills have a 20% chance to restore 1.5 hearts. +15% damage while below 30% health."),
    "blood_sigil": ("Blood Pact", "Bleeding you inflict lasts 50% longer. +10% damage against bleeding foes."),
    "hollow_crown": ("Dominion of Bone", "Undead near you are slowed and deal 15% less damage to you."),
}
for rid, (name, desc) in RELICS.items():
    put(f"relic.{NS}.{rid}.name", name)
    put(f"relic.{NS}.{rid}", desc)

# ------------------------------------------------------------------ armor sets
put(f"set.{NS}.gravewarden", "Gravewarden Set")
put(f"set.{NS}.gravewarden.two", "(2) +2 maximum hearts.")
put(f"set.{NS}.gravewarden.four", "(4) Deathward: once every 90 seconds, survive a lethal blow and blast nearby foes away.")
put(f"set.{NS}.mourner", "Mourner Set")
put(f"set.{NS}.mourner.two", "(2) +8% movement speed.")
put(f"set.{NS}.mourner.four", "(4) Veil: after 3 seconds unharmed, your next hit deals +40% damage.")

# ------------------------------------------------------------------ items
ITEMS = {
    "ancient_coin": ("Ancient Coin", None),
    "soul_dust": ("Soul Dust", None),
    "ancient_bone": ("Ancient Bone", None),
    "ghoul_fang": ("Ghoul Fang", None),
    "waystone_shard": ("Waystone Shard", None),
    "crypt_shortsword": ("Crypt Shortsword", "Standard issue for the crypt guard. The guard did not survive the issue."),
    "gravediggers_hatchet": ("Gravedigger's Hatchet", "Made for roots and coffin lids. Works on shields too."),
    "bone_shiv": ("Bone Shiv", "Whittled from a femur by someone who needed it more than its owner did."),
    "ossuary_blade": ("Ossuary Blade", "Etched with the names of the dead it was meant to keep down."),
    "mourners_kris": ("Mourner's Kris", "A wavy blade for wounds that will not close."),
    "wightbane": ("Wightbane", "The fuller burns cold blue whenever the dead draw near."),
    "cryptwarden_longbow": ("Cryptwarden Longbow", "Strung with braided grave-silk. Its arrows remember the way home."),
    "bonecaster": ("Bonecaster", "Loads splintered bone. Delivers it more splintered."),
    "tombsplitter": ("Tombsplitter", "Built to break seals that were never meant to be broken."),
    "stormvigil": ("Stormvigil", "Forged during a storm by a smith who swore never to stop watching."),
    "gravebrand": ("Gravebrand", "The Hollow Warden's blade. It still hungers for the souls it was sworn to guard."),
    "gravewarden_helm": ("Gravewarden Helm", "The visor is welded shut. The wearer was not consulted."),
    "gravewarden_cuirass": ("Gravewarden Cuirass", "Dented from the inside."),
    "gravewarden_greaves": ("Gravewarden Greaves", "Heavy enough to stand a post for three hundred years."),
    "gravewarden_sabatons": ("Gravewarden Sabatons", "They never once retreated. That was rather the problem."),
    "mourner_hood": ("Mourner's Hood", "Woven for the ones who keep vigil, and are never seen."),
    "mourner_shroud": ("Mourner's Shroud", "Grief is quiet. So is the one wearing this."),
    "mourner_wraps": ("Mourner's Wraps", "Bound tight against the cold of the crypts."),
    "mourner_treads": ("Mourner's Treads", "Soft soles for walking among sleepers."),
    "gravedust_locket": ("Gravedust Locket", "Holds a pinch of someone. They seem to approve of you."),
    "vigil_candle": ("Vigil Candle", "Its flame leans toward what is hidden."),
    "blood_sigil": ("Blood Sigil", "A pact signed in a hand that was not entirely willing."),
    "cracked_phylactery": ("Cracked Phylactery", "The soul inside is leaking. It doesn't mind sharing."),
    "hollow_crown": ("Hollow Crown", "Taken from the Warden's brow. The dead still kneel to it."),
}
for iid, (name, flavor) in ITEMS.items():
    put(f"item.{NS}.{iid}", name)
    if flavor:
        put(f"item.{NS}.{iid}.flavor", flavor)
put(f"item.{NS}.waystone_shard.desc", "Use in the depths to channel an extraction. Keeps all unsecured loot; taking damage interrupts it.")

ENTITIES = {
    "risen": "Risen",
    "bone_archer": "Bone Archer",
    "bone_shieldbearer": "Bone Shieldbearer",
    "crypt_ghoul": "Crypt Ghoul",
    "wailing_skull": "Wailing Skull",
    "barrow_knight": "Barrow Knight",
    "hollow_warden": "The Hollow Warden",
    "delver_merchant": "Delver Merchant",
    "soul_bolt": "Soul Bolt",
    "telegraph": "Telegraph",
}
for eid, name in ENTITIES.items():
    put(f"entity.{NS}.{eid}", name)
    if eid not in ("soul_bolt", "telegraph", "hollow_warden"):
        put(f"item.{NS}.{eid}_spawn_egg", f"{name} Spawn Egg")

BLOCKS = {
    "abyssal_gate": "Abyssal Gate",
    "descent_rift": "Descent Rift",
    "waystone": "Waystone",
    "runic_seal": "Runic Seal",
    "spike_trap": "Spike Trap",
    "dart_trap": "Dart Trap",
    "crumbling_stone_bricks": "Crumbling Stone Bricks",
    "reliquary": "Reliquary",
    "burial_urn": "Burial Urn",
    "altar_of_trials": "Altar of Trials",
    "cursed_idol": "Cursed Idol",
    "soul_brazier": "Soul Brazier",
    "rune_stone": "Rune Stone",
}
for bid, name in BLOCKS.items():
    put(f"block.{NS}.{bid}", name)

# ------------------------------------------------------------------ status effects & potions
MOB_EFFECTS = {
    "bleeding": "Bleeding",
    "mending": "Mending",
    "warding": "Warding",
    "bloodrage": "Bloodrage",
    "soulward": "Soulward",
    "deathward_spent": "Deathward Spent",
    "curse_frailty": "Curse of Frailty",
    "curse_fragility": "Curse of Fragility",
    "curse_lethargy": "Curse of Lethargy",
}
for mid, name in MOB_EFFECTS.items():
    put(f"effect.{NS}.{mid}", name)
POTIONS = {
    "mending": "Mending",
    "strong_mending": "Mending",
    "warding": "Warding",
    "bloodrage": "Bloodrage",
    "soulward": "Soulward",
}
for pid, name in POTIONS.items():
    put(f"item.minecraft.potion.effect.{NS}.{pid}", f"Potion of {name}")
    put(f"item.minecraft.splash_potion.effect.{NS}.{pid}", f"Splash Potion of {name}")
    put(f"item.minecraft.lingering_potion.effect.{NS}.{pid}", f"Lingering Potion of {name}")
    put(f"item.minecraft.tipped_arrow.effect.{NS}.{pid}", f"Arrow of {name}")

# ------------------------------------------------------------------ elite affixes
for aid, name in [("bulwark", "Bulwark"), ("frenzied", "Frenzied"), ("vampiric", "Vampiric"), ("soulbound", "Soulbound"), ("warded", "Warded")]:
    put(f"affix.{NS}.{aid}", name)
put(f"affix.{NS}.title", "%s %s")

# ------------------------------------------------------------------ death messages
DEATHS = {
    "spikes": ("%1$s was impaled on a spike trap", "%1$s was impaled on a spike trap whilst fighting %2$s"),
    "soul_magic": ("%1$s was consumed by soul fire", "%1$s was consumed by soul fire whilst fighting %2$s"),
    "soul_eruption": ("%1$s was engulfed by an eruption of souls", "%1$s was engulfed by an eruption of souls whilst fighting %2$s"),
    "shockwave": ("%1$s was crushed by a shockwave", "%1$s was crushed by a shockwave whilst fighting %2$s"),
    "bleed": ("%1$s bled out", "%1$s bled out whilst fighting %2$s"),
    "chain_lightning": ("%1$s was struck by arcing lightning", "%1$s was struck by arcing lightning whilst fighting %2$s"),
}
ENTITY_DEATHS = {
    "spikes": "%1$s was skewered by %2$s",
    "soul_magic": "%1$s was consumed by %2$s's soul fire",
    "soul_eruption": "%1$s was engulfed by souls called up by %2$s",
    "shockwave": "%1$s was crushed by %2$s's shockwave",
    "bleed": "%1$s was bled dry by %2$s",
    "chain_lightning": "%1$s was struck down by %2$s's lightning",
}
for did, (plain, player) in DEATHS.items():
    # With an attacker, vanilla uses the base key with the attacker as %2$s; without one, ".player" names the kill credit.
    put(f"death.attack.{NS}.{did}", plain)
    put(f"death.attack.{NS}.{did}.player", player)
    put(f"death.attack.{NS}.{did}.item", ENTITY_DEATHS[did] + " using %3$s")

# ------------------------------------------------------------------ HUD
put(f"hud.{NS}.floor", "Floor %s")
put(f"hud.{NS}.rooms", "Chambers %s/%s")
put(f"hud.{NS}.countdown", "Descending in %s")
for oid, text in [("explore", "Explore the floor"), ("clear_room", "Survive the encounter"), ("find_exit", "Find the descent rift"),
                  ("descend", "Descend through the rift"), ("boss", "Defeat the guardian"), ("extract", "Reach a waystone to extract")]:
    put(f"hud.{NS}.objective.{oid}", text)

# ------------------------------------------------------------------ boss
put(f"boss.{NS}.hollow_warden.subtitle", "Keeper of the Forgotten Halls")
put(f"boss.{NS}.hollow_warden.phase2", "The Warden's armor splits, and soul fire pours from the cracks.")
put(f"boss.{NS}.hollow_warden.phase3", "\"I will not let you pass.\" The Warden burns with everything it has left.")
put(f"boss.{NS}.hollow_warden.raise", "The Warden calls its fallen guard back from the dust.")
put(f"boss.{NS}.hollow_warden.stunned", "The Warden staggers! Strike now!")

# ------------------------------------------------------------------ messages
M = {
    "floor": "Floor %s",
    "floor_title": "Floor %s",
    "reliquary.claimed": "You have already claimed this reliquary.",
    "sealed_below": "The way to %s is sealed for now. Deeper zones open in a future update.",
    "shard.no_run": "The shard is cold. It only answers within an expedition.",
    "shard.sealed": "The seals smother the shard's light. Finish the fight first.",
    "shard.interrupted": "The channel breaks!",
    "deathward": "Deathward! The grave refuses you.",
    "encounter.elite": "An elite stirs! The chamber is sealed.",
    "encounter.trial": "The trial begins! The chamber is sealed.",
    "encounter.sealed": "The chamber is sealed!",
    "encounter.wave": "Wave %s of %s",
    "encounter.cleared": "Chamber cleared. The seals fade.",
    "encounter.pulled": "The seals drag you back into the fight.",
    "gate.inert": "The gate is silent here. It only opens from the surface.",
    "gate.already_in_run": "You are already on an expedition.",
    "gate.missing_dimension": "The depths could not be found. Is the mod installed on the server?",
    "gate.attuning_already": "The gate is already attuning.",
    "gate.attuning": "%s is attuning the gate. Stand close within %s seconds to join the descent to %s.",
    "gate.start_floor": "Starting floor: %s (%s)",
    "gate.no_checkpoints": "Defeat a zone guardian to unlock a deeper starting floor.",
    "gate.countdown": "Descending in %s...",
    "gate.checkpoint_missing": "%s hasn't unlocked floor %s yet. The party starts from floor 1.",
    "exit_found": "You sense the descent rift nearby.",
    "descent_interrupted": "The descent falters. The whole party must stand within the rift.",
    "descending": "Descending in %s...",
    "checkpoint_unlocked": "Checkpoint unlocked: you may now begin expeditions on floor %s (%s).",
    "boss_reward": "The guardian falls. A rift opens toward %s, and a waystone offers a way home.",
    "boss_reward_sealed": "The guardian falls. A waystone offers a way home. %s still lies sealed below.",
    "boss_defeated": "Guardian Defeated",
    "waystone.idle": "The waystone hums quietly. It answers only to delvers.",
    "waystone.confirm": "Use the waystone again to extract and secure %s unsecured items.",
    "extracted": "Extracted",
    "extracted.sub": "%s items secured",
    "party_extracted": "%s has extracted.",
    "defeated": "Defeated",
    "defeated.sub": "Fell on floor %s. %s unsecured items lost.",
    "defeated.cause": "Cause: %s",
    "party_fallen": "%s has fallen on floor %s.",
    "shrine.inert": "The shrine is dormant outside an expedition.",
    "shrine.busy": "The shrine cannot be roused while the chamber is in combat.",
    "trial.begin": "%s has invoked the Altar of Trials!",
    "idol.offer": "The idol whispers of treasure, for a price that lasts until you leave the depths. Use it again to accept.",
    "idol.accepted": "You accept the idol's bargain and are marked with %s.",
    "run_lost": "Your expedition ended while you were away. You have been returned to the surface.",
    "abandoned": "You left the depths without a waystone. Your expedition is over and your unsecured loot is lost.",
    "protected": "The dungeon's stones resist you.",
}
for key, text in M.items():
    put(f"message.{NS}.{key}", text)

# ------------------------------------------------------------------ commands
put(f"command.{NS}.stats.header", "Abyssal Descent: Your Record")
put(f"command.{NS}.stats.line", "Expeditions: %s  Deepest floor: %s  Guardians slain: %s  Extractions: %s  Defeats: %s")
put(f"command.{NS}.stats.checkpoints", "Starting floors: %s")
RULES = [
    "Loot found in the depths is Unsecured until you extract at a waystone or with a Waystone Shard.",
    "Falling in the depths returns you to the surface. Unsecured loot is lost and your gear takes a durability toll.",
    "Everything you brought with you, and everything already secured, is kept.",
    "Defeating a zone guardian unlocks the next zone as a permanent starting floor.",
    "Leaving the depths any other way abandons the expedition and forfeits unsecured loot.",
]
for i, text in enumerate(RULES, 1):
    put(f"command.{NS}.rules.{i}", text)

# ------------------------------------------------------------------ sound subtitles
SUBTITLES = {
    "block.trap.click": "Pressure plate clicks",
    "block.spike_trap.extend": "Spikes thrust up",
    "block.dart_trap.fire": "Dart trap fires",
    "block.crumbling_wall.crumble": "Wall crumbles",
    "block.reliquary.open": "Reliquary opens",
    "block.runic_seal.close": "Runic seal forms",
    "block.runic_seal.open": "Runic seal fades",
    "block.abyssal_gate.attune": "Gate attunes",
    "block.abyssal_gate.travel": "Rift roars",
    "event.descend": "Delvers descend",
    "event.extract": "Waystone flares",
    "event.defeat": "Delver falls",
    "event.floor_enter": "The depths rumble",
    "event.room_clear": "Chamber cleared",
    "event.encounter_start": "Seals slam shut",
    "event.enemy_summon": "Dead rise",
    "event.curse_accept": "Curse takes hold",
    "event.trial_begin": "Trial begins",
    "loot.uncommon": "Uncommon loot drops",
    "loot.rare": "Rare loot drops",
    "loot.epic": "Epic loot drops",
    "loot.legendary": "Legendary loot drops",
    "weapon.chain_lightning": "Lightning arcs",
    "weapon.soul_flare": "Soul fire erupts",
    "weapon.shockwave": "Shockwave booms",
    "weapon.bleed": "Flesh tears",
    "weapon.bone_shrapnel": "Bone shatters",
    "armor.deathward": "Deathward bursts",
    "entity.hollow_warden.awaken": "Hollow Warden awakens",
    "entity.hollow_warden.roar": "Hollow Warden roars",
    "entity.hollow_warden.cleave": "Hollow Warden cleaves",
    "entity.hollow_warden.slam": "Hollow Warden slams",
    "entity.hollow_warden.charge": "Hollow Warden charges",
    "entity.hollow_warden.volley": "Hollow Warden looses souls",
    "entity.hollow_warden.hurt": "Hollow Warden hurts",
    "entity.hollow_warden.death": "Hollow Warden crumbles",
    "entity.hollow_warden.step": "Heavy footsteps",
    "entity.telegraph": "Danger hums",
    "entity.wailing_skull.wail": "Wailing Skull wails",
    "entity.wailing_skull.shoot": "Wailing Skull spits soul fire",
    "entity.crypt_ghoul.screech": "Crypt Ghoul screeches",
    "entity.crypt_ghoul.leap": "Crypt Ghoul leaps",
    "entity.barrow_knight.swing": "Barrow Knight swings",
    "entity.soul_bolt.hit": "Soul bolt bursts",
    "music.boss_sting": "Ominous sting",
}
for sid, text in SUBTITLES.items():
    put(f"subtitles.{NS}.{sid}", text)

out = os.path.join("src", "main", "resources", "assets", NS, "lang", "en_us.json")
os.makedirs(os.path.dirname(out), exist_ok=True)
with open(out, "w", encoding="utf-8") as f:
    json.dump(L, f, indent=2, ensure_ascii=False)
    f.write("\n")
print(f"wrote {len(L)} keys to {out}")
