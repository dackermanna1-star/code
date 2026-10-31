#!/usr/bin/env python3
"""Generates assets/jjkshowdown/lang/en_us.json and verifies every translation key used in the sources exists.
Run from the repo root: python3 tools/gen_lang.py"""
import json, os, re, sys

NS = "jjkshowdown"
L = {}

def put(k, v):
    L[k] = v

# ------------------------------------------------------------------ general
put(f"itemGroup.{NS}", "Jujutsu Showdown")
put(f"key.category.{NS}.controls", "Jujutsu Showdown")
put(f"key.{NS}.primary", "Technique 1 (Blue / Dismantle)")
put(f"key.{NS}.secondary", "Technique 2 (Red / Cleave)")
put(f"key.{NS}.tertiary", "Technique 3 (Blink / Fuga)")
put(f"key.{NS}.ultimate", "Ultimate (Hollow Purple / World Slash)")
put(f"key.{NS}.toggle", "Toggle (Infinity / Domain Amplification)")
put(f"key.{NS}.domain", "Domain Expansion")
put(f"key.{NS}.heal", "Reverse Cursed Technique (hold)")
put(f"key.{NS}.dodge", "Dodge / Air Dash / Slam")
put(f"key.{NS}.block", "Guard / Parry (hold)")
put(f"key.{NS}.character_menu", "Character Selection")
put(f"key.{NS}.config_menu", "Jujutsu Showdown Settings")

# ------------------------------------------------------------------ characters
put(f"character.{NS}.none", "No Character")
put(f"character.{NS}.none.title", "An ordinary person")
put(f"character.{NS}.gojo", "Satoru Gojo")
put(f"character.{NS}.gojo.title", "The Strongest Jujutsu Sorcerer")
put(f"character.{NS}.sukuna", "Ryomen Sukuna")
put(f"character.{NS}.sukuna.title", "The King of Curses")
put(f"boss.{NS}.gojo", "Satoru Gojo — The Strongest")
put(f"boss.{NS}.sukuna", "Ryomen Sukuna — King of Curses")
put(f"entity.{NS}.gojo", "Satoru Gojo")
put(f"entity.{NS}.sukuna", "Ryomen Sukuna")
for e, n in [("blue", "Lapse: Blue"), ("red", "Reversal: Red"), ("hollow_purple", "Hollow Purple"), ("dismantle", "Dismantle"),
             ("fuga", "Fuga"), ("world_slash", "World-Cutting Slash"), ("debris", "Debris"), ("domain", "Domain Expansion")]:
    put(f"entity.{NS}.{e}", n)
put(f"phase.{NS}.gojo.name", "The Honored One")
put(f"phase.{NS}.gojo.title", "Throughout Heaven and Earth, I Alone Am the Honored One")
put(f"phase.{NS}.sukuna.name", "Heian-Era Sukuna")
put(f"phase.{NS}.sukuna.title", "The King of Curses in His True Form")

# ------------------------------------------------------------------ abilities
ab = {
    "infinity": ("Infinity", "Limitless: an infinite series between you and the world. Projectiles stop mid-air and blows never land. Drains a little cursed energy while active. Neutralised by Domain Amplification, domain sure-hits and the World-Cutting Slash."),
    "blue": ("Lapse: Blue", "Tap to create a point of attraction at the crosshair; hold to charge maximum output. Pulls enemies, projectiles and loose terrain into a crushing singularity. Sneak while casting for Blue Movement: the point yanks you across the battlefield."),
    "red": ("Reversal: Red", "Fire a repulsive orb that detonates into a massive blast, launching everything away and cratering terrain. Hold to charge. Point-blank it detonates instantly."),
    "blink": ("Blink", "Instant movement by contracting space. Aim at an enemy to appear directly behind them."),
    "hollow_purple": ("Hollow Technique: Purple", "Hold to converge Blue and Red into imaginary mass, then erase everything in a line: terrain, barriers, enemies. At mastery 9, keep holding through the full incantation for 200% output."),
    "unlimited_void": ("Domain Expansion: Unlimited Void", "Encloses the area in a barrier of infinite space. Everyone inside is flooded with infinite information and cannot move or act. Your strikes against the paralysed deal +50% damage. Burns out your technique afterwards."),
    "dismantle": ("Dismantle", "A razor slash of cursed energy that cuts through enemies and soft terrain. Tap for a single slash; hold (mastery 3) for a barrage."),
    "cleave": ("Cleave", "A close-range technique that adjusts to the target's toughness: the sturdier the target, the deeper the cut. Tap for a single-target flurry; hold to cleave everything in front of you."),
    "fuga": ("Divine Flame: Fuga", "Draw a flaming arrow (hold at least one second) and release it into an inferno. Empowered for ten seconds after Malevolent Shrine: bigger blast, half cost and cooldown."),
    "world_slash": ("World-Cutting Slash", "Chant the incantation — Scale of the Dragon, Recoil, Twin Meteors — and cut the world itself. A single plane that ignores Infinity, armour and toughness."),
    "domain_amplification": ("Domain Amplification", "Fill your body with a domain that neutralises techniques on contact: your blows pass through Infinity and domain sure-hits are blunted. Your innate technique is unusable while active."),
    "malevolent_shrine": ("Domain Expansion: Malevolent Shrine", "An open domain without a barrier. Everything within its enormous radius is ceaselessly Dismantled and Cleaved; terrain is shredded. Burns out your technique afterwards."),
    "reverse_cursed_technique": ("Reverse Cursed Technique", "Hold to multiply negative energy into positive energy and heal. Also repairs your brain after a domain, recovering from burnout three times faster."),
}
for k, (n, d) in ab.items():
    put(f"ability.{NS}.{k}", n)
    put(f"ability.{NS}.{k}.desc", d)
put(f"ability.{NS}.hollow_purple.short", "PURPLE")
put(f"ability.{NS}.hollow_purple.200", "PURPLE — 200%")
put(f"ability.{NS}.hollow_purple.jp", "虚式「茈」")
put(f"ability.{NS}.world_slash.jp", "世界を断つ斬撃")

# ------------------------------------------------------------------ domains & cinematics
put(f"domain.{NS}.unlimited_void", "UNLIMITED VOID")
put(f"domain.{NS}.unlimited_void.jp", "領域展開「無量空処」")
put(f"domain.{NS}.malevolent_shrine", "MALEVOLENT SHRINE")
put(f"domain.{NS}.malevolent_shrine.jp", "領域展開「伏魔御廚子」")
put(f"cinematic.{NS}.domain_expansion", "Domain Expansion")
put(f"cinematic.{NS}.hollow_technique", "Hollow Technique")
put(f"cinematic.{NS}.domain_clash", "DOMAIN CLASH")
put(f"cinematic.{NS}.domain_clash.jp", "領域の押し合い")
put(f"cinematic.{NS}.finish", "FINISH")
put(f"cinematic.{NS}.rival", "Rival Sorcerer")
put(f"cinematic.{NS}.phase_two", "Awakening")
put(f"incantation.{NS}.purple.1", "Nine ropes.")
put(f"incantation.{NS}.purple.2", "Polarized light.")
put(f"incantation.{NS}.purple.3", "Crow and declaration.")
put(f"incantation.{NS}.purple.4", "Between front and back.")

# ------------------------------------------------------------------ HUD
hud = {
    "mastery": "Mastery %s", "fingers": "Fingers %s/20", "ce": "CE", "hits": "HITS", "burnout": "TECHNIQUE BURNOUT %ss",
    "overloaded": "INFINITE INFORMATION — cannot act", "staggered": "STAGGERED", "zone": "IN THE ZONE", "counter_ready": "COUNTER READY",
    "skip": "[%s] Skip", "clash": "DOMAIN CLASH", "barrier": "Barrier integrity %s%%", "mash": "MASH [%s]!",
    "qte_success": "PERFECT!", "qte_partial": "GOOD", "qte_fail": "MISSED",
}
for k, v in hud.items():
    put(f"hud.{NS}.{k}", v)
for k, v in {"evade_purple": "EVADE THE HOLLOW PURPLE!", "evade_slash": "DODGE THE WORLD-CUTTING SLASH!", "finisher": "FINISH THEM — strike on the ring!",
             "push_back": "PUSH BACK!", "practice": "PRACTICE — press the key in time!"}.items():
    put(f"qte.{NS}.{k}", v)

# ------------------------------------------------------------------ messages
msg = {
    "level_up": "Mastery increased to %s!", "unlocked": "Technique unlocked: %s", "locked": "Requires mastery %s",
    "overloaded": "You are paralysed by infinite information!", "staggered": "You are staggered!", "burnout": "Technique burnout: %ss",
    "cooldown": "%s is recovering (%ss)", "no_energy": "Not enough cursed energy", "charge_more": "Hold longer to charge %s",
    "toggle_dropped": "%s faded", "disabled": "That technique is disabled on this server", "no_space": "Nowhere to go",
    "domain_active": "Your domain is already expanded", "full_health": "You are already at full health",
    "perfect_dodge": "PERFECT DODGE", "parry": "PARRY!", "parried": "Parried!", "guard_break": "GUARD BREAK", "counter": "COUNTER!",
    "black_flash": "BLACK FLASH", "finisher": "FINISHER!", "clash_won": "DOMAIN CLASH WON", "clash_lost": "YOUR DOMAIN SHATTERED",
    "evaded": "EVADED!", "grazed": "GRAZED", "rival_defeated": "%s DEFEATED", "became": "You are %s",
    "character_cleared": "You are no longer a sorcerer", "switch_denied": "Changing character is disabled on this server",
    "vessel": "YOU HAVE BECOME SUKUNA'S VESSEL", "six_eyes": "THE SIX EYES AWAKEN", "finger": "Finger consumed: %s/%s",
    "all_fingers": "You have already consumed all twenty fingers", "config_saved": "Gameplay settings saved",
    "config_denied": "Only operators can change gameplay settings",
}
for k, v in msg.items():
    put(f"message.{NS}.{k}", v)
cmd = {
    "character": "Set %s player(s) to %s", "mastery_set": "Set mastery of %s player(s) to %s", "xp_added": "Added %s mastery XP to %s player(s)",
    "mastery_get": "%s — mastery %s (%s / %s XP)", "fingers": "Set fingers of %s player(s) to %s", "energy_filled": "Filled cursed energy of %s player(s)",
    "cooldowns_reset": "Reset cooldowns of %s player(s)", "duel": "%s has appeared!", "restored": "Restored %s block(s)",
    "domains_ended": "Collapsed %s domain(s)", "config_reloaded": "Jujutsu Showdown config reloaded", "difficulty": "Difficulty set to %s",
    "qte_result": "Quick-time event result: %s",
}
for k, v in cmd.items():
    put(f"command.{NS}.{k}", v)

# ------------------------------------------------------------------ screens & options
scr = {
    "select": "Choose Your Sorcerer", "choose_gojo": "Become Satoru Gojo", "choose_sukuna": "Become Ryomen Sukuna", "chosen": "Current Character",
    "later": "Decide Later", "settings": "Settings", "config": "Jujutsu Showdown Settings", "tab_client": "Client", "tab_gameplay": "Gameplay",
    "defaults": "Reset", "readonly": "Gameplay settings can only be changed by the host or an operator",
    "unlock_at": "Unlocks at mastery %s",
}
for k, v in scr.items():
    put(f"screen.{NS}.{k}", v)
opt = {
    "particles": "Particles", "shake": "Screen Shake", "flashes": "Screen Flashes", "cinematics": "Cinematics", "auto_skip": "Auto-skip Cinematics",
    "letterbox": "Letterbox Bars", "qte": "Quick-Time Events", "voice": "Voice Lines", "subtitles": "Subtitles", "music": "Battle Music",
    "skins": "Character Skins", "six_eyes": "Six Eyes Outlines", "atmosphere": "Domain Atmosphere", "callouts": "Combat Callouts",
    "hud_scale": "HUD Scale", "hud_layout": "HUD Layout", "double_tap": "Double-tap Dodge",
    "difficulty": "Difficulty", "progression": "Mastery Progression", "xp": "Mastery XP", "damage": "Technique Damage", "cooldowns": "Cooldowns",
    "regen": "Energy Regen", "cost": "Energy Costs", "max_energy": "Max Energy", "domain_strength": "Domain Strength",
    "domain_duration": "Domain Duration", "burnout": "Burnout", "void_radius": "Unlimited Void Radius", "shrine_radius": "Shrine Radius",
    "sure_hit": "Sure-hit Damage", "transform": "Domain Arenas", "clashes": "Domain Clashes", "destruction": "Terrain Destruction",
    "restore": "Restore Terrain", "restore_delay": "Restore Delay", "debris": "Flying Debris", "aggression": "Rival Aggression",
    "reaction": "Rival Reactions", "boss_health": "Rival Health", "boss_damage": "Rival Damage", "boss_domains": "Rival Domains",
    "boss_ultimates": "Rival Ultimates", "phase_two": "Rival Phase Two", "server_qte": "QTEs (server)", "qte_timing": "QTE Timing",
    "server_cinematics": "Cinematics (server)", "allow_skip": "Allow Skipping", "freeze": "Freeze During Cinematics",
    "parry_window": "Parry Window (ticks)", "black_flash": "Black Flash Chance", "finishers": "Finishers", "double_jump": "Double Jump",
}
for k, v in opt.items():
    put(f"option.{NS}.{k}", v)
for q in ["low", "medium", "high", "ultra"]:
    put(f"option.{NS}.quality.{q}", q.capitalize())
for d in ["easy", "normal", "hard", "nightmare"]:
    put(f"option.{NS}.difficulty.{d}", d.capitalize())
for l, n in [("center", "Centre"), ("left", "Bottom Left"), ("right", "Bottom Right")]:
    put(f"option.{NS}.hud_layout.{l}", n)

# ------------------------------------------------------------------ items, blocks, effects
put(f"item.{NS}.sukuna_finger", "Sukuna's Finger")
put(f"item.{NS}.sukuna_finger.desc", "One of the twenty fingers of the King of Curses.")
put(f"item.{NS}.sukuna_finger.desc2", "Sorcerer: consume to grow stronger. Gojo: call Sukuna to battle. Anyone else: become his vessel.")
put(f"item.{NS}.gojo_blindfold", "Gojo's Blindfold")
put(f"item.{NS}.gojo_blindfold.desc", "It dampens the overwhelming input of the Six Eyes.")
put(f"item.{NS}.gojo_blindfold.desc2", "Wear it. Sukuna: call Gojo to battle. Anyone else: awaken the Six Eyes.")
put(f"item.{NS}.gojo_spawn_egg", "Satoru Gojo Spawn Egg")
put(f"item.{NS}.sukuna_spawn_egg", "Ryomen Sukuna Spawn Egg")
for b, n in [("unlimited_void_barrier", "Unlimited Void Barrier"), ("void_floor", "Void Floor"), ("shrine_pillar", "Shrine Pillar"),
             ("shrine_roof", "Shrine Roof Tile"), ("shrine_bone", "Shrine Bone"), ("cursed_blood", "Cursed Blood")]:
    put(f"block.{NS}.{b}", n)
put(f"effect.{NS}.information_overload", "Infinite Information")

# ------------------------------------------------------------------ death messages
deaths = {
    "technique": ("%1$s was exorcised", "%1$s was exorcised by %2$s"),
    "blue": ("%1$s was crushed into a singularity", "%1$s was crushed by %2$s's Blue"),
    "red": ("%1$s was blown away", "%1$s was blown to pieces by %2$s's Red"),
    "hollow_purple": ("%1$s was erased from existence", "%1$s was erased by %2$s's Hollow Purple"),
    "dismantle": ("%1$s was dismantled", "%1$s was dismantled by %2$s"),
    "cleave": ("%1$s was cleaved apart", "%1$s was cleaved apart by %2$s"),
    "fuga": ("%1$s was incinerated", "%1$s was incinerated by %2$s's Fuga"),
    "world_slash": ("%1$s was severed along with the world", "%1$s was cut in two along with the world by %2$s"),
    "domain_sure_hit": ("%1$s could not escape the sure-hit", "%1$s could not escape %2$s's domain"),
    "black_flash": ("%1$s was struck by a Black Flash", "%1$s was struck by %2$s's Black Flash"),
    "slam": ("%1$s was flattened", "%1$s was flattened by %2$s"),
    "backlash": ("%1$s was destroyed by their own collapsing domain", "%1$s was destroyed by their own collapsing domain"),
    "finisher": ("%1$s was finished", "%1$s was finished off by %2$s"),
}
for k, (a, b) in deaths.items():
    put(f"death.attack.{NS}.{k}", a)
    put(f"death.attack.{NS}.{k}.player", b)

# ------------------------------------------------------------------ voice lines (subtitles)
voice = {
    "gojo": {"domain": "Domain Expansion... Unlimited Void.", "honored_one": "Throughout heaven and earth... I alone am the honored one.",
             "blue": "Cursed technique lapse... Blue.", "red": "Cursed technique reversal... Red.", "purple": "Hollow technique... Purple.",
             "purple_incantation": "Nine ropes. Polarized light. Crow and declaration. Between front and back.", "nah_id_win": "Nah... I'd win.",
             "strongest": "Don't worry. I'm the strongest.", "intro": "So you're the King of Curses. Let's see what you've got.",
             "taunt": "Is that all? You're boring me.", "victory": "That's what it means to be the strongest.",
             "defeat": "Heh... you really are strong.", "select": "Alright. Let's have some fun.", "infinity": "You can't touch me.",
             "clash": "Let's see whose domain is more refined."},
    "sukuna": {"domain": "Domain Expansion... Malevolent Shrine.", "dismantle": "Dismantle.", "cleave": "Cleave.", "fuga": "Fuga.",
               "incantation": "Scale of the dragon. Recoil. Twin meteors.", "world_slash": "World... cutting slash.",
               "know_your_place": "Know your place... fool.", "stand_proud": "Stand proud. You are strong.",
               "intro": "So you are the strongest of this era. Entertain me.", "taunt": "How boring.",
               "victory": "I will remember you... for as long as I live.", "defeat": "Impossible... for me to fall here...",
               "select": "Hah. This body will do.", "clash": "Your barrier means nothing against my shrine."},
}
for ch, lines in voice.items():
    for k, v in lines.items():
        put(f"voice.{NS}.{ch}.{k}", v)

# ------------------------------------------------------------------ sound subtitles
sub = {
    "gojo": {"infinity_on": "Infinity hums", "infinity_off": "Infinity fades", "infinity_block": "Something stops mid-air",
             "blue_cast": "Space contracts", "blue_loop": "Singularity swirls", "red_charge": "Repulsion builds", "red_fire": "Red fires",
             "red_impact": "Red detonates", "purple_charge": "Blue and Red converge", "purple_fire": "Hollow Purple erases",
             "blink": "Gojo blinks", "void_activate": "Unlimited Void expands", "void_ambient": "The void resonates"},
    "sukuna": {"dismantle": "Dismantle slices", "dismantle_barrage": "Slashes rain", "cleave": "Cleave cuts", "fuga_charge": "Flames gather",
               "fuga_fire": "Fuga looses", "fuga_explode": "Inferno erupts", "world_slash_charge": "Space trembles",
               "world_slash": "The world is cut", "shrine_activate": "Malevolent Shrine rises", "shrine_ambient": "Endless slashing",
               "shrine_slash": "Slash", "amplification_on": "Domain Amplification"},
    "combat": {"punch_light": "Strike", "punch_heavy": "Heavy strike", "combo_finisher": "Combo finisher", "black_flash": "Black Flash",
               "dodge": "Dodge", "block": "Guard", "parry": "Parry", "counter": "Counter", "double_jump": "Air jump", "slam": "Ground slam",
               "finisher": "Finisher", "rct": "Reverse cursed technique"},
    "domain": {"clash": "Domains clash", "shatter": "Domain shatters", "barrier_form": "Barrier forms", "clash_win": "Domain prevails"},
    "ui": {"qte_prompt": "Quick-time event", "qte_success": "Success", "qte_fail": "Failure", "select": "Character chosen",
           "level_up": "Mastery up", "cinematic_hit": "Title card"},
}
for g, d in sub.items():
    for k, v in d.items():
        put(f"subtitles.{NS}.{g}.{k}", v)

os.makedirs(f"src/main/resources/assets/{NS}/lang", exist_ok=True)
with open(f"src/main/resources/assets/{NS}/lang/en_us.json", "w", encoding="utf-8") as f:
    json.dump(dict(sorted(L.items())), f, indent=2, ensure_ascii=False)
    f.write("\n")

# ------------------------------------------------------------------ verify
missing = set()
for root, _, files in os.walk("src"):
    for fn in files:
        if not fn.endswith(".java"):
            continue
        text = open(os.path.join(root, fn), encoding="utf-8").read()
        for m in re.finditer(r'translatable\("([a-zA-Z0-9_.]+)"', text):
            k = m.group(1)
            if k.endswith(".") or k.startswith("gui."):
                continue
            if k not in L:
                missing.add(k)
        for m in re.finditer(r'"((?:cinematic|domain|ability|incantation|qte|hud|screen|message|command)\.' + NS + r'\.[a-z0-9_.]+)"', text):
            if m.group(1) not in L:
                missing.add(m.group(1))
if missing:
    print("MISSING KEYS:", sorted(missing))
    sys.exit(1)
print(f"lang ok: {len(L)} keys")
