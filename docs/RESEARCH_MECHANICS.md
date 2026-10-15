# Left 4 Dead 2: Gameplay Mechanics Reference (PC, Campaign/Co-op)

Research notes for a private PS1-style fan recreation. Everything is paraphrased.

## 0. Conventions and sources

- **Units.** 1 Hammer unit (u) is about 1 inch = 0.0254 m, which is what was requested. The fandom wiki instead uses 1 u ≈ 1.905 cm ("220 u/s = 4.19 m/s"). A 72 u survivor is 1.83 m tall at 1 in/u, so 1 in/u is the more sensible scale for characters. Conversions in this file use 0.0254 m.
- **Cvar values** come from a full L4D2 dedicated-server cvar dump dated 2022-04-26 (post-"Last Stand" update, so current PC values). It is on GitHub at ambaca/Bacardi-Dumpster-of-SM-Plugins. Older pre-2020 values are noted where they differ.
- **Weapon numbers** come from the game's own `scripts/weapon_*.txt` and `scripts/melee/*.txt` files. Copies are in the GitHub repo orinuse/L4D2_Unpacked-Scripts, in the folders `left4dead2/` (2009 base) and `update/` (current).
- **Director map scripts** (Dead Center crescendos and finale) come from decompiled vscripts in Stabbath/L4D2-Decompiled. The DirectorOptions defaults come from a copy of the Valve Developer Community (VDC) "L4D2 Director Scripts" table.
- **Behaviour, damage tables and tactics** come from the Left 4 Dead fandom wiki, cross-checked against cvars. Pacing comes from Michael Booth's GDC 2009 talk "The AI Systems of Left 4 Dead".
- **(?)** marks a number or claim I could not confirm, or where sources disagree.
- **Difficulty names:** Easy, Normal, Advanced (internally "hard"), Expert (internally "impossible").

---

## 1. SURVIVOR MECHANICS

### 1.1 Body and movement

| Property | Value (u, u/s) | Metric | Source / notes |
|---|---|---|---|
| Max health | 100 | – | Permanent health is capped at 100. |
| Run speed (healthy, ≥40 total HP) | **220** | 5.59 m/s | Wiki. The cvar `survivor_speed` reads 210, but the real run speed is 220. Weapon scripts contain `MaxPlayerSpeed` (210–250), a Counter-Strike leftover; L4D2 run speed does **not** depend on weapon (?). |
| Walk (walk key held) | ~85 | 2.16 m/s | (?) Same value as `z_walk_speed` and `survivor_limp_walk_speed` = 85. |
| Crouch-walk | **75** | 1.91 m/s | `survivor_crouch_speed`. Health does not affect it, and neither does adrenaline. |
| Limp (total HP < 40, i.e. ≤39) | **150** | 3.81 m/s | `survivor_limp_health` = 40. |
| Critical (exactly 1 HP, temp health drained) | **85** | 2.16 m/s | Wiki. The bar sits at 1 HP and the survivor walks at 85. |
| Adrenaline | **260** for 15 s | 6.60 m/s | `adrenaline_run_speed` 260, `adrenaline_duration` 15. Applies at any HP. |
| Knee-deep water | 115 (limping or healthy) | | Wiki. |
| Swimmable water | 92 healthy or limping; 68 at 1 HP; 60 crouched; 208 on adrenaline | | Wiki. |
| Slowdown when hit by infected | `survivor_damage_speed_factor` = 0.25 | | Hits from commons briefly slow you (a "flinch"). The exact formula is unknown (?). Adrenaline makes you immune. |
| Max ladder/step height | `sv_stepsize` = **18** | 0.46 m | |
| Standing hull | 72 tall, about 32–33 wide | 1.83 m | VDC "Dimensions" page (it carries an "applies to L4D at least partly" caveat). |
| Crouched hull | 56 tall (?) | 1.42 m | VDC L4D page. The general Source value is 36, so this is unconfirmed. |
| Eye height (standing) | 62 (?) | 1.57 m | VDC. |
| Eye height (incapacitated) | 24 | 0.61 m | `survivor_incapacitated_eye_height`. |
| Eye height (hanging from a ledge) | 85 | | `survivor_hanging_eye_height`. |
| Eye height (pounced victim) | 12 | | `survivor_pounce_victim_eye_height`. |
| Jump height | ~56 (?) | 1.42 m | VDC: L4D2 has no separate crouch-jump; the default jump already reaches crouch-jump height. |
| Gravity | `sv_gravity` 800 u/s² | | Also `sv_friction` 4, `sv_accelerate` 5, `sv_airaccelerate` 10, `sv_stopspeed` 75. |
| Fall damage | Safe below 560 u/s impact speed (`fall_speed_safe`); "fatal" at 720 u/s (`fall_speed_fatal`) | Safe drop ≈196 u (≈5.0 m). Fatal speed ≈324 u drop (≈8.2 m). | A "fatal" fall normally incapacitates a survivor. Only falling damage **> 200** (`survivor_incap_max_fall_damage`) kills outright. Source scales damage linearly between the two speeds (~0.625 HP per u/s above 560). |

### 1.2 Health types

- **Permanent health** (shown in colour) and **temporary health** (a buffer that drains) add up to the displayed total. Damage removes permanent health first. Once permanent health is at 1, temporary health is consumed.
- **Temporary health decay:** `pain_pills_decay_rate` = **0.27 HP/s**, about 1 HP every 3.7 s. The wiki rounds this to "1 per 3 s"; a full 50 from pills lasts about 185 s.
- **Pain pills:** +**50** temporary health (`pain_pills_health_value`). You cannot take them when total HP ≥ 99 (`pain_pills_health_threshold` 99). Using them is instant.
- **Adrenaline:** +**25** temporary health (`adrenaline_health_buffer`). It also gives 15 s of 260 u/s speed and immunity to slowdown from common hits. Medkit, revive and other item-use durations are halved (`adrenaline_backpack_speedup` 0.5, `adrenaline_revive_speedup` 0.5); reload and weapon-switch speed up too (per the wiki). Side effects are tunnel vision and mono sound. It is usable at any HP, and a second shot resets the timer.
- **First aid kit:** removes **all** temporary health, then heals **80% of missing health**, rounded down (`first_aid_heal_percent` 0.8, `first_aid_kit_max_heal` 100). Example: 30 HP gives +56 = 86. A survivor who has ever been hurt can only reach 99 by kits alone. Use time is **5 s** (`first_aid_kit_use_duration`), or 2.5 s on adrenaline (the wiki says 3 s). It works on yourself (secondary fire) or a teammate (primary fire while aiming at them). A kit resets the incap count and clears black-and-white.
- **Defibrillator:** revives a dead teammate's body. Use time is **3 s** (`defibrillator_use_duration`, `defibrillator_return_to_life_time` 3.0). The target returns with **50 permanent HP** (`z_survivor_respawn_health` 50) and only their secondary weapon; the other items lie where they died. It shares the medkit slot. Bots never pick up or use defibs. The Director may convert a pill spawn into a defib when someone is near death (`director_convert_pills_to_defib_health` 25).
- **Revive (picking up an incapacitated teammate):** hold USE within 96 u (`player_incap_use_radius`) for **5 s** (`survivor_revive_duration`; 2.5 s on adrenaline). You must keep holding (`survivor_revive_continuous_fire` 1). The revived survivor gets **30 temporary HP** (`survivor_revive_health`); the wiki describes this as 1 permanent + 29 temporary. They then drain to 1 HP and walk at 85 u/s. About 2 s of invulnerability follows a revive or a release from a special infected (wiki).

### 1.3 Incapacitation, black-and-white, death

- **Going down:** at 0 HP the survivor becomes incapacitated with **300** "incap health" (`survivor_incap_health`), plus any leftover temporary health (?).
- **Bleed-out:** 300 HP falls at **3 HP/s** (`survivor_incap_decay_rate`), so about 100 s with no other damage. The rate rises to **12 HP/s** if every survivor is down (`survivor_incap_hopeless_decay_rate`) or while a Smoker tongue holds an incapacitated survivor (`survivor_incap_tongued_decay_rate`).
- **What a downed survivor can do:**
  - Fire the secondary weapon only. A melee weapon is temporarily swapped for a single P220 pistol.
  - The pistol fires with a forced cycle of **0.3 s** (`survivor_incapacitated_cycle_time`) and an accuracy penalty of 0.4 (`survivor_incapacitated_accuracy_penalty`). Reload time is ×**1.25**.
  - Aim drifts randomly, changing direction every 2.5 s with severity 2 (`survivor_incapacitated_dizzy_*`). The camera rolls 20°.
  - The **Magnum** keeps its normal fire rate and accuracy while incapacitated.
  - A downed survivor cannot shove, use items or heal. Friendly fire from them is disabled in L4D2.
- **Damage to downed survivors:**
  - Commons: `z_attack_incapacitated_damage` 10 per hit, ×`z_hit_incap_factor` (Easy 0.1, all others 1.0).
  - Tank pound: 75 (Easy/Normal), 100 (Advanced), 150 (Expert).
  - Hunter on a downed victim: more damage than normal (wiki: about 3–4×).
  - Witch: repeated shredding (see section 4).
  - Spitter acid and Witch hits are reduced against downed survivors (wiki).
  - Smoker, Charger and Jockey cannot start their grabs on a downed survivor. A Hunter can pounce one.
- **Black-and-white:** `survivor_max_incapacitated_count` = **2**. After the 2nd revive without a medkit, the screen goes grayscale with a heartbeat sound and blurred edges; items glow red for that player. The next incap kills. Only a first aid kit resets the count; pills and adrenaline do not.
- **Death:**
  - The survivor plays a death animation and leaves a body that can be defibbed. A body that ragdolls (after falling from a ledge) cannot be defibbed.
  - All items drop except the secondary weapon.
  - The team wipes when every survivor is dead or incapacitated. Hanging counts as incapacitated, so 3 hanging plus 1 downed ends the game.
- **Last survivor standing** cannot ledge-hang; they simply fall.

### 1.4 Ledge hanging

- **Trigger:** a fall that would cause enough damage triggers a ledge grab instead, unless you are the last survivor standing or `survivor_no_pounce_or_hang` is set.
- **Ledge health:** **300** (`survivor_ledge_grab_health`). The bleed-out bar shows it draining, at the 3/s incap rate (?), so about 100 s. As it drops the hanging animation becomes more precarious (two visual stages). At 0 the survivor falls to their death, and the body ragdolls (no defib).
- **While hanging:** completely helpless (no shooting). Jumping off is possible but usually lethal.
- **Pull-up:** works like a revive (hold USE, 5 s). `survivor_ledge_scales_health` = 1 means your health after rescue scales with how much ledge health was left: a full-HP survivor rescued at 50/300 ledge HP loses most of their health. Hanging does **not** add to the black-and-white count (?). A survivor at exactly 1 HP who is pulled up gets 30 temporary HP (wiki).

### 1.5 Rescue closets (Campaign only; not in Realism, not during finales)

- **When a dead survivor becomes rescuable:** they must be dead ≥ **60 s** (`rescue_min_dead_time`). The game checks every 2.5 s (`rescue_interval`). An `info_survivor_rescue` closet qualifies if it is within 2000 u of the lead survivor (`rescue_spawn_range`) and ≤ 400 flow units ahead (`rescue_spawn_flow`). The trapped survivor appears with a yellow outline once the living team comes within 1000 u (`rescue_range`). They bang and yell every 6 s (`rescue_yell_interval`). The survivor stops calling if the team gets 2000 u past (`rescue_ignore_distance`).
- **Closet door:** indestructible until opened. Opening it frees the survivor.
- **Rescued state:** **50 permanent HP** and a P220 pistol. With `survivor_respawn_with_guns` 1 they also get a *downgrade* of their last primary (a T2 becomes a T1). In L4D2, someone who died with a T1 gets no primary (wiki).
- **Bots** open closets on their own initiative.

### 1.6 Friendly fire and fire damage to survivors

| Difficulty | Bullet FF multiplier (`survivor_friendly_fire_factor_*`) | Survivor burn multiplier (`survivor_burn_factor_*`) × 40 dps fire |
|---|---|---|
| Easy | **0** (still logged) | 0.2 → 8 HP/s |
| Normal | **0.1** | 0.2 → 8 HP/s |
| Advanced | **0.3** | 0.4 → 16 HP/s |
| Expert | **0.5**; a full shotgun blast incapacitates | 1.0 → 40 HP/s |

- The wiki's Difficulty page claims 3.5% (Normal) and 10.5% (Advanced) for bullets. That contradicts the cvars and the wiki's own Tactics page (10/30/50%); trust the cvars.
- Melee weapons (not the chainsaw) carry a built-in ×0.1 against teammates, then the difficulty factor: about 3 damage per swing on Normal (wiki).
- Grenade launcher splash on teammates and yourself: ×0.12 (`grenadelauncher_ff_scale`).
- Bots deal **no** FF (`sb_friendlyfire` 0), but they still take it.
- FF does not drop off with range. Bullets that first pass through an infected do not count as FF. Being hit by FF shakes the screen, slows you and shows a damage indicator.
- `z_friendly_fire_forgiveness` 1 ignores FF that looks accidental (?).
- `inferno_friendly_fire_duration` 6: for 6 s, fire damage is credited to whoever threw it.

### 1.7 Damage from Common Infected (per hit)

| Difficulty | Front hit | From behind (`z_hit_from_behind_factor` 0.5) | Hit grace window (wiki) | Body damage multiplier *to* commons and the Witch (`z_non_head_damage_factor_*`) |
|---|---|---|---|---|
| Easy | 1 | 0.5 | 0.5 s | ×2.0 |
| Normal | 2 | 1 | 0.33 s | ×1.0 |
| Advanced | 5 | 2.5 | 0.5 s | ×0.75 |
| Expert | 20 | 10 | 1.0 s | ×0.5 |

- During the grace window after a common's hit, further common hits deal no damage, unless the hit would down you anyway.
- A survivor running a **chainsaw** takes ×0.5 from common hits (`z_hit_chainsawer_factor`).
- Commons attack about once per second (`z_attack_interval` 1). Melee range is ~10–20 u (`z_attack_min_range` 10, `z_attack_max_range` 20) and ~35 u when attacking on the run (`z_attack_on_the_run_range`).
- Commons can swarm a survivor from all sides. Hits interrupt reloads, heals and revives and shake your aim.

### 1.8 Shove (melee bash, "+attack2")

- **Basic numbers:** range **75 u** (`z_gun_range`). Swing active window 0.2 s (`z_gun_swing_duration`). Base re-shove interval **0.7 s** (`z_gun_swing_interval`).
- **Fatigue in co-op:**
  - A penalty counter climbs with each rapid shove. Min 5, max 8 (`z_gun_swing_coop_min_penalty`, `_max_penalty`).
  - The wiki puts noticeable fatigue at about the 5th–7th consecutive shove in campaign. A HUD meter then shows the shove cooling down (up to ~1–3 s lockout (?)).
  - Versus is harsher: min 3 / max 6, 1.0 s cooldown, recovers over 4 s.
  - Adrenaline makes you immune to fatigue.
- **Effect on commons:** pushes them back and staggers them for about 1.25 s (`z_gun_stun_duration`); they may fall over. A shove from behind on an unaware common kills it instantly ("SPINAL TAP" achievement). Killing a common by shoves alone takes several (wiki: 1–7). Riot-type uncommons are immune from the front (none of those appear in Dead Center).
- **Effect on specials:**
  - Staggers them for ~1 s (max PZ stagger 6 s, `z_max_stagger_duration`).
  - **Frees** a pinned teammate from a Hunter, Smoker or Jockey; shoving either the attacker or the victim works on a Hunter.
  - Breaks a Smoker's tongue and staggers him about 1 s. That Smoker's tongue then waits the hit cooldown (see 4.3).
  - "Dead-stops" a mid-air Hunter or Jockey; with a Hunter you have ~1 s before he pins.
  - Can cancel a Boomer's vomit or a Spitter's spit if you shove right as it starts.
  - A Hunter shoved off may back-roll and pounce again about 1 s later (more often on higher difficulties).
- **Immune:** Charger (`z_charger_allow_shove` 0), Tank, and the Witch (except while she is stumbled by an explosion).
- Shoving teammates just nudges them (`z_shove_friend_speed` 130).

### 1.9 Inventory slots

1. **Primary:** Tier 1/Tier 2 gun, grenade launcher, or M60.
2. **Secondary:** single pistol, dual pistols, Magnum, **or** a melee weapon or chainsaw. Taking a melee weapon drops your pistol. Pistols have infinite reserve (`ammo_pistol_max` -2).
3. **Throwable:** pipe bomb, Molotov, or bile jar (one).
4. **Kit slot:** first aid kit, defibrillator, or incendiary/explosive ammo upgrade pack (one).
5. **Temp-health slot:** pain pills or adrenaline (one).

- **Hand-carried props** need no slot: gas can, propane tank, oxygen tank, fireworks crate, plus quest items (cola in c1m2). While carrying one you cannot shoot, only shove. USE or fire throws or drops it.
- **Giving items:** with pills or adrenaline out, aim at a teammate and press secondary attack to hand it over. The recipient must have that slot empty. The give attempt times out after 12 s (`survivor_give_attract_timeout`).
- Medkits and defibs cannot be given, only used on others.
- **Use/pick-up radius:** 96 u (`player_use_radius`).

### 1.10 Accuracy and crouching

- **Spread values** come from each weapon script, in degrees (section 2). Each weapon defines `MinStandingSpread`, `MinDuckingSpread` (lower), `MinInAirSpread` (highest) and `MaxMovementSpread`. Each shot adds `SpreadPerShot`, capped at `MaxSpread`, and spread recovers by `SpreadDecay` per second.
- **Crouching** therefore tightens accuracy noticeably. For the M16: 0.4° standing vs 0.05° crouched.
- **Being pulled by a Smoker** adds an accuracy penalty of 0.133 (`tongue_victim_accuracy_penalty`).
- **Laser sight** multiplies spread by **0.4** (`upgrade_laser_sight_spread_factor`). On snipers and the grenade launcher it effectively only helps accuracy while moving.

### 1.11 Flashlight

- **Mechanics:** toggled per player and mounted on the weapon, so it shifts during shoves and reloads; melee weapons and items use a chest light.
- **Effect on commons:** they are aggravated by a beam on them (`z_infected_flashlight` 1). Flicking it on and off agitates them faster (wiki).
- **Effect on the sitting Witch:** a beam within **400 u** (`z_witch_flashlight_range`) builds her rage, versus 100 u for simple proximity. The Wandering Witch ignores flashlights.
- **Bots** keep flashlights off (`sb_flashlight` 0). A lit flashlight also makes a survivor count as "not calm" (`survivor_calm_no_flashlight`).

---

## 2. WEAPONS

### 2.1 How bullet damage works (Source / L4D2 scripts)

- **Range falloff:** `damage × RangeModifier^(distance / 500)`. A pistol (0.75) loses 25% per 500 u; a rifle (0.97) loses 3%; snipers (1.0) lose nothing. `Range` is the maximum trace distance.
- `GainRange` (rifles 1500, silenced SMG 900) is described in-file as "range at which to use a gain curve to fall off to zero" (exact shape unconfirmed (?)).
- **Penetration:** `PenetrationNumLayers` 2 for all guns. `PenetrationPower` is 30 for pistols, SMGs and shotguns, 50 for rifles, snipers and the Magnum. Bullets pass through commons and thin surfaces; snipers and the Magnum punch through crowds; shotgun pellets penetrate up to 500 u (`PenetrationMaxDistance`). Special ammo (incendiary/explosive) does **not** penetrate.
- **Hit locations:**
  - Commons die from any headshot regardless of weapon (wiki).
  - Specials take about ×4 to the head (community data; about ×1.25 for shotgun pellets (?)). The Tank takes no head bonus.
  - The Witch takes full (unscaled) damage to the head, which is why a point-blank shotgun "crown" works.
  - Body shots on commons and the Witch are scaled by the difficulty factor in 1.7.
- **Tank damage modifiers:** Auto shotgun and SPAS deal ×0.85 to the Tank (`z_tank_autoshotgun_dmg_scale`). The grenade launcher deals ×3 to the Tank (`z_tank_grenade_launcher_dmg_scale`).
- **Gunfire slows the Tank** when he is hit from within 200–400 u (`z_tank_damage_slow_*_range`).

### 2.2 Firearm table

Values are from the current PC (`update/`) scripts, with the 2009 base noted where it differs. Reserve ammo is from cvars (current). Damage is per bullet or per pellet. Script `CycleTime` is the minimum time between shots; the effective rate in practice is in the notes.

| Weapon (script name) | Tier | Damage | Pellets | CycleTime (s) | Clip | Reserve | Reload | RangeMod / Range | Penetration power | Spread standing / crouched / max (°) | Notes |
|---|---|---|---|---|---|---|---|---|---|---|---|
| P220 pistol (`pistol`) | sidearm | 36 | 1 | 0.15 (semi; effective ~0.175) | 15 | ∞ | ~1.75 s (?) | 0.75 / 2500 | 30 | 1.5 / 0.5 / 30 | |
| Dual pistols | sidearm | 36 | 1 | effective ~0.0875 (alternating) | 30 | ∞ | ~2.3 s (?) | same | 30 | worse than single | Picking up a 2nd pistol makes duals. A Glock appears as the 2nd gun. |
| Magnum (`pistol_magnum`) | sidearm | 80 | 1 | 0.15 (effective ~0.3) | 8 | ∞ | ~2.0 s (1.67 with a round still chambered) | 0.75 / 3500 | 50 | 1.25 / 0.5 / 30 | Body shots kill commons on all difficulties. Full fire rate and accuracy while incapacitated. |
| SMG / Uzi (`smg`) | 1 | 20 | 1 | 0.0625 (960 rpm) | 50 | 650 | ~2.27 s | 0.84 / 2500 | 30 | 1.0 / 0.7 / 30 | |
| Silenced SMG (`smg_silenced`) | 1 | 25 | 1 | 0.0625 | 50 | 650 | ~2.27 s | 0.84 / 2200 (gain range 900) | 30 | 1.2 / 0.85 / 30 | Spawns as a fixed item at the c1m1 elevator crescendo. |
| MP5 (`smg_mp5`), CS weapon | 1 | **26** (24 in the 2009 German-only script) | 1 | 0.075 (800 rpm) | 50 | 650 | ~3.05 s | 0.84 / 2500 | 30 | 1.1 / 0.75 / 30 | Counter-Strike weapon, originally only in the German release. Since the 2020 "Last Stand" update it spawns everywhere via `director_cs_weapon_spawn_chance` 0.25. |
| Pump shotgun (`pumpshotgun`) | 1 | 25 | **10** (250 per shell) | 0.5 (effective ~0.9 with pump) | 8 | **72** (56 before 2020) | **0.473 s per shell**, plus start/end animation | 0.7 / 3000 | 30 | pellet scatter 5.0 pitch × 7.5 yaw | Shell-by-shell reload you can interrupt. |
| Chrome shotgun (`shotgun_chrome`) | 1 | 31 | **8** (248) | 0.5 (effective ~0.9) | 8 | 72 (56 before 2020) | 0.473 per shell | 0.7 / 3000 | 30 | scatter 3.0 × 5.0 (tightest) | |
| Auto shotgun (`autoshotgun`, Benelli M4) | 2 | 23 | **11** (253) | 0.15 (effective ~0.265 clicking, ~0.467 holding) | 10 | 90 | 0.396 per shell | 0.7 / 3000 | 30 | scatter 4.0 × 8.5 | ×0.85 damage to the Tank. |
| SPAS-12 / combat shotgun (`shotgun_spas`) | 2 | 28 | **9** (252) | 0.15 (similar effective rate) | 10 | 90 | 0.396 per shell | 0.7 / 3000 | 30 | scatter 3.5 × 8.0 | ×0.85 damage to the Tank. |
| M16 assault rifle (`rifle`) | 2 | 33 | 1 | 0.0875 (686 rpm) | 50 | 360 | ~2.2 s (fastest primary) | 0.97 / 3000 (gain 1500) | 50 | 0.4 / 0.05 / 30 (+0.75 per shot) | |
| AK-47 (`rifle_ak47`) | 2 | 58 | 1 | 0.13 (~461 rpm) | 40 | 360 | ~2.36 s | 0.97 / 3000 | 50 | 1.0 / 0.5 / 35 (+1.6 per shot) | Highest DPS rifle, least accurate. |
| SCAR / combat rifle (`rifle_desert`) | 2 | 44 | 1 | 0.07 within a burst | 60 | 360 | ~3.32 s | 0.97 / 3000 | 50 | 0.35 / 0.05 / 25 | **3-round burst** per trigger pull. Wiki: ~0.21 s from one burst start to the next (0.07 + 0.14 delay). |
| SG552 (`rifle_sg552`), CS weapon | 2 | 33 | 1 | 0.0825 | 50 | 360 | ~3.4 s (?) | 0.97 | 50 | 0.4 / 0.05 / 30 | Scoped zoom. CS weapon. |
| Hunting rifle (`hunting_rifle`) | 2 | 90 | 1 | 0.25 (semi) | 15 | 150 | ~3.1 s (?) | **1.0** / 8192 | 50 | 0.1 / 0 / 15 | Scope. Kills commons in one hit; shoots through lines of them. |
| Military sniper (`sniper_military`) | 2 | 90 | 1 | 0.25 (semi) | 30 | 180 | ~3.33 s | 1.0 / 8192 | 50 | 0.5 / 0.05 / 15 | Scope. |
| Scout (`sniper_scout`), CS weapon | 2 | **105** (90 in the base script) | 1 | 0.9 (bolt) | 15 | 180 | (?) | 1.0 / 8192 | 50 | 0.1 / 0 / 15 | |
| AWP (`sniper_awp`), CS weapon | 2 | 115 | 1 | 1.05 (bolt) | 20 | 180 | (?) | 1.0 / 8192 | 50 | 0.1 / 0 / 15 | |
| Grenade launcher (`grenade_launcher`) | special | **400** explosion (`grenadelauncher_damage`); 33 listed in the script for the projectile | 1 | ~3.3 s cycle including reload (?) | 1 | 30 | break-open reload ~3.3 s (?) | – | – | – | Kill radius 180 u (4.6 m), stumble radius 250 u (6.4 m), velocity 1200 u/s plus 100 upward. ×3 damage to the Tank, but it never stumbles him. FF ×0.12. Refilled only by ammo upgrade packs. |
| M60 (`rifle_m60`), 2010 "The Passing" DLC | special | 50 | 1 | 0.11 (~545 rpm) | **150** | **0** (no reserve, no reload) | – | 0.97 / 3000 | 50 | 1.0 / 0.5 / 35 | Kills commons in one hit. Discarded when empty. Bots refuse it. |
| Chainsaw (`chainsaw`; secondary slot) | melee | **100 per hit** (`chainsaw_damage`) | – | hits every **0.1 s** (`chainsaw_hit_interval`) → ~1000 DPS | fuel 30 (script clip) | – | none | reach 50 u, 30° cone | – | – | Running it attracts commons within 500 u (`chainsaw_attract_distance`). Discarded at 0 fuel. FF applies at full chainsaw damage. Bots refuse it. |

Other notes:
- **Ammo upgrades** add one magazine of special rounds on top of the current load (section 2.5).
- **Ammo piles** refill reserve for every gun except the GL, M60, chainsaw and pistols. Upgrade packs are the only way to refill the GL.
- **Bots' weapon taste:** they prefer T2 over T1 and each survivor has a preference (Coach: shotguns; Ellis: snipers; Nick and Rochelle: rifles). Bots never pick up throwables, defibs, M60, GL or chainsaw. With `sb_max_team_melee_weapons` 0 in the 2022 dump, bots never take melee weapons.

### 2.3 Melee weapons

**General mechanics:**
- Melee weapons occupy the secondary slot.
- Range is about **70 u** (`melee_range`). Each swing can also shove up to 16 commons as collateral (`melee_collateral_shove_count`). Swing animations alternate as a combo that resets 1.2 s after a swing (`melee_combo_reset_time`).
- Melee swings do **not** cause shove fatigue; only the shove does.
- Melee damage is percentage-based, not the script value:

| Target | Hits to kill | Notes |
|---|---|---|
| Common / uncommon | 1 | Damage equals target health, any difficulty. |
| Jockey, Spitter | 1 | |
| Hunter, Smoker, Boomer | 1 | A leg hit only does 75% of current HP, so ~5 leg hits. |
| Charger | 1 to the head; 2 elsewhere | 390 per body hit, 487 on the big arm. More hits needed while an AI Charger is charging. |
| Witch | 4 | 250 per hit. Only safe on a stumbled sitting Witch or during a Wandering Witch's 1 s scream. |
| Tank | 20 | 5% of max HP per hit. |

- **Swing timing:** script `refire_delay` is 0.75–1.0 s. The wiki's measured Tank-kill times range from 15 s (katana, golf club, knife) to 18 s (axe, crowbar).
- **Damage types:** `DMG_SLASH` (4) weapons sever limbs and decapitate, and **can cut a Smoker's tongue**. `DMG_CLUB` (128) weapons knock bodies back and cave in heads.

**Melee in Dead Center.** The mission file (`missions/campaign1.txt`, current) lists
`"meleeweapons" "fireaxe;crowbar;cricket_bat;katana;baseball_bat;golfclub;knife"`

| Melee (Dead Center set) | refire_delay (s) | Script damage | Type | Notes |
|---|---|---|---|---|
| Fire axe | 1.0 | 70 | slash | Wide arc, slow. A fire axe is always in Whitaker's gun shop (c1m2). |
| Crowbar | 0.8 | 50 | slash | Short reach. Fastest re-shove after a swing. |
| Cricket bat | 0.8 | 50 | club | Good arc. |
| Katana | 0.8 | 70 | slash | Best reach and speed. |
| Baseball bat | 0.75 | 70 | club | |
| Golf club | 0.75 | 70 | club | Shares the katana's hitbox and animations (Golf club: added with The Passing DLC). |
| Knife | 0.8 | 50 | slash | CS-origin weapon; 1 swing animation. Since 2020 it is in all versions. |

The other melee weapons are frying pan (0.75), machete (0.8), electric guitar (1.0), tonfa/nightstick (0.75), pitchfork (0.88) and shovel (1.0). The mission note also says `"no_female_boomers" "1"`: there are no female Boomers in Dead Center.

### 2.4 Throwables

| Item | Mechanics |
|---|---|
| **Pipe bomb** | **Fuse:** 6 s (`pipe_bomb_timer_duration`). Beeps start 0.5 s apart and speed up by 0.025 s each beep to a minimum of 0.1 s. A red LED blinks with the beeps. Screen shake reaches 750 u.<br>**Lure:** draws commons and most uncommons. It does **not** draw specials, the Tank, the Witch, or Jimmy Gibbs Jr.<br>**Blast:** kill radius is small; the wiki says "a little over 3–4 m" on Normal (?), roughly 130–160 u. It stumbles survivors, the Witch and the Tank inside the radius. Self-damage is about 5–30 depending on distance (Easy-mode note). The same explosion code is used for propane and oxygen tanks.<br>Pulling the pin can be cancelled by switching weapons. |
| **Molotov** | **Fire:** shatters on contact with the floor into an "inferno" that burns ~15 s. `inferno_flame_lifetime` is 15 s average per flame; the wiki says the area burns 15–17 s. Up to 32 flames (`inferno_max_flames`), spaced ≥50 u apart, spreading up to **500 u** from the origin (`inferno_max_range`). Fire damage is **40 dps** (`inferno_damage`) × the survivor burn factor (1.6).<br>**Effects:** commons that touch it ignite and die quickly. Specials burn; special-infected burn damage scale is 3 (`z_special_burn_dmg_scale`). A burning Tank dies in **75 s** (Easy/Normal), **80 s** (Advanced) or **85 s** (Expert) of fire alone (`tank_burn_duration*`), and in L4D2 co-op he moves slower while burning. A burning Witch dies in **15 s** (`z_witch_burn_time`), but fire immediately draws her rage onto the thrower.<br>**Notes:** CEDA hazmat commons and Jimmy Gibbs are fireproof. Water does not douse L4D2 Molotov fire, but it does extinguish burning infected. |
| **Bile jar (vomit jar)** | **Lure:** shatters and splashes in a **110 u** radius (`vomitjar_radius`). Calls a horde to the impact point. Commons attack whatever is coated: other commons, specials, the Tank or the Witch. The effect lasts **20 s** on AI infected (`vomitjar_duration_infected_bot`); a coated survivor gets 5 s (`vomitjar_duration_survivor`).<br>**Interactions:** a pipe bomb out-draws bile. Worker uncommons ignore it unless it hits something. Coating an *unaware* AI Tank does not anger him. Bile does no damage itself.<br>**Source:** CEDA hazmat commons sometimes drop one; it shows as a jar strapped to their side. |

### 2.5 Upgrades and deployables (kit slot)

| Item | Details |
|---|---|
| Incendiary ammo pack | Deploy it on the ground: `upgrade_pack_use_duration` 1.9 s, though the wiki calls it "several seconds" (?). Each survivor can take one share, equal to **one magazine** of special rounds (shotguns get their tube size).<br>Incendiary rounds ignite targets and kill commons in one hit. Specials burn **5 s** per hit. They do not ignite CEDA hazmat commons or Jimmy Gibbs. One hit sets the Witch on her 15 s death timer and draws her onto the shooter. GL rounds set unkilled targets on fire. |
| Explosive ammo pack | Rounds explode on impact. They kill commons outright and stumble specials and the Witch; on Expert the Witch is stumbled only by headshots or shotguns. They never stumble the Tank.<br>Splash damage hurts you and teammates up close; it is scaled by FF. Blast size grows with per-shot damage, so shotgun slugs are the biggest. Shotguns fire single accurate explosive slugs. Explosion force: bullets 2, slugs 4. Rounds can set off nearby gas cans and propane. |
| Laser sight | A pile you interact with, not an inventory item. It permanently attaches to the current primary until you drop the gun. Spread ×0.4. A laser sight is **always** in Whitaker's shop (c1m2). |
| Ammo pile | Infinite-use refill of primary reserve. |

### 2.6 Explosive and flammable props (hand-carried)

| Prop | Behaviour |
|---|---|
| Gas can (red; yellow scavenge cans in the c1m4 finale) | Shoot or ignite it for a Molotov-like fire. Thrown about as far as a grenade. Cannot be damaged while carried. A burning can that is picked up explodes in your hands after a while. Spit ignites a gas can after **2.9 s** (`gascan_spit_time`). Yellow finale cans burn the same way but are mission items. |
| Propane tank (white) | Explodes instantly when shot, pipe-bomb style. Stumbles the Tank and Witch. Wiki: up to ~21 damage to survivors on Expert. |
| Oxygen tank (green) | When shot it **hisses and vents for a few seconds** before exploding (≈2–3 s (?)). Since the 2020 update the hiss lures commons. Picking up a hissing tank resets it. |
| Fireworks crate | Dark Carnival finale only, not in Dead Center. Wide crackling fire area. |
| Explosive barrel | Not portable. Blast plus fire plus flying burning debris. |

---

## 3. COMMON INFECTED

### 3.1 Core stats

| Stat | Value | Metric |
|---|---|---|
| Health | **50** (`z_health`) | – |
| Run / chase speed | **250 u/s** (`z_speed`) | 6.35 m/s, faster than a healthy survivor's 220 |
| Wander / walk speed | 85 u/s (`z_walk_speed`) | 2.16 m/s |
| Crouch speed | 75 | |
| Attack | ~1 hit/s, 10–20 u reach. Damage per difficulty in table 1.7; half damage from behind. | |
| Max alive (Director) | **30** (`z_common_limit`) | Background (unreachable) wanderers are capped at 20 (`z_background_limit`). |
| Door damage | 60 per pound (`z_door_pound_damage`) | Commons break wooden doors; only the Tank breaks saferoom doors. |

### 3.2 Behaviour states

1. **Wanderers / idle:**
   - They sit, lie down, lean on walls, stand, shuffle, vomit, hold their heads, or fight each other (`z_brawl_chance` 2).
   - They are placed per nav area by density (`z_wandering_density` 0.03) when an area enters the "active area set" around the survivors.
   - They are deleted when the area leaves that set, or recycled to fill a pending mob (Booth talk).
   - Wanderer counts are zeroed for areas a survivor has already seen and during Relax (section 5).
2. **Alerted / acquiring:**
   - **Sight:** at 200 u they notice a survivor within 0.5 s (`z_acquire_near_*`); at 2500 u it takes up to 5 s (`z_acquire_far_*`). The alert cone is `z_alert_dot` 0.3 with an alert range of 1000 u. On daytime maps commons see much farther (wiki: ~5× sight).
   - **Sound:** gunfire within 200 u (`z_hear_gunfire_range`; louder events reach farther), running survivors at 500–750 u (`z_hear_runner_near/far_range`). A loud sound forces attack within 750 u (`z_force_attack_from_sound_range`).
   - **Other triggers:** flashlight beams, being touched, being shot, car alarms, crescendo noise.
   - A lightly wounded idle common at range may writhe and clutch the wound before turning to attack.
3. **Rushing / chasing:**
   - They sprint at 250 u/s, **climb** obstacles of nearly any height with dozens of motion-captured climb animations chosen by ledge height, use ladders, drop off ledges, and route around.
   - They try to flank and hit survivors from the sides and back.
   - They pick a target ("IT") and can retarget anyone within 100 u who blocks them (`z_attack_change_target_range`). They dodge or duck melee swings at times.
4. **Mob (horde):** commons spawned as a mob immediately know where the survivors are and charge. Section 5 has spawn timing.
5. **Biled or lured:** they chase a bile-coated survivor or a bile impact (20 s), a pipe bomb (until it explodes), a chainsaw within 500 u, or a hissing oxygen tank.
6. **Unreachable target:** if they cannot path to it, they stand in place flailing their arms. They are despawned beyond 2500 u (`z_discard_range`).

### 3.3 Damage, headshots and dismemberment (L4D2 gore)

- **Headshots:** a headshot kills a common with any weapon. Body damage is scaled by the difficulty factor (×2 / ×1 / ×0.75 / ×0.5).
- **Gore:** L4D2 uses a **wound cutout** system (`z_infected_damage_cutouts` 1) that shows holes, bones and organs.
  - Shotguns blow chunks out of torsos.
  - Gunfire can sever arms, legs and heads; heads can be destroyed.
  - Slashing melee (axe, katana, machete, crowbar, knife) **decapitates** and cuts off limbs, and an axe or katana can cut a body in half.
  - Blunt weapons send bodies flying and cave in heads.
  - Explosives tear bodies apart.
- **Wounded commons:** a common that loses an arm keeps attacking. One that loses its head dies (rare glitches aside).
- **Flinch / stumble:** shoves, explosions, shotgun blasts and the Tank barging through all knock commons down or stagger them. Explosion and gib force is scaled by `z_gib_force_factor` 10 and `z_gib_explosion_force_factor` 0.1.
- **Stomp:** jumping on or standing on a common's head kills it. Landing on one gives a "double jump" boost.
- **Burning:** a burning common keeps charging while flailing and dies quickly. Burning commons do **not** ignite survivors, and their fire does not hurt you. The "crisp" timer `z_burning_lifetime` is 30 s, but fire damage usually kills them within a few seconds. Bots treat burning commons as already dead.

### 3.4 Uncommon infected in Dead Center

- **CEDA hazmat worker** (yellow or green suit; appears in c1m1 The Hotel and c1m2 The Streets):
  - Health **150** (50 on Easy).
  - **Immune to fire.** Molotovs, gas cans and incendiary rounds do not ignite them; they only die after standing in heat a long time.
  - Otherwise they behave like normal commons (attacks, speed, lures).
  - Sometimes they carry a **bile jar** (visible on the hip) that drops on death. Their limbs can be severed, but they cannot be cut in half.
  - Shooting the visor makes blood splash on the glass with a hiss of escaping air.
  - Tactic: in the burning hotel, commons die in the fire and only the CEDA workers come through.
- **Jimmy Gibbs Jr.** (c1m4 Atrium, Campaign only; extremely rare, appears on a ~15-day calendar cycle per the community):
  - Health **3000** (50 on Easy). Fireproof. Gets no headshot bonus.
  - His hits **blind you with motor oil**, like the Mud Men in Hard Rain.
  - Not drawn to pipe bombs or bile unless the bile hits him.
  - Killed instantly by melee, a Magnum or sniper body shot, the GL, explosive ammo or explosions.

---

## 4. SPECIAL INFECTED

### 4.0 Summary table (cvar defaults)

| Class | HP | Speed (u/s) | Key ability numbers | Ability cooldown |
|---|---|---|---|---|
| Boomer | **50** | 175 | Vomit range 300 (max reach 350), 1.5 s stream | **30 s** |
| Hunter | **250** | 300 | Pounce at ≤750 u (AI); crouches at 500 u; launch speed 700 | ~0.1 s re-lunge after a miss; after a shove he rolls and can re-pounce in ~1 s |
| Smoker | **250** | 210 | Tongue range **750 u**, travels 1000 u/s, drags at up to 175 u/s | **20 s** after a hit, **15 s** after a miss |
| Charger | **600** | ~250 (?) normal; charge 250→**500** | Charge 2.5 s, impact radius 120 | **12 s** |
| Jockey | **325** | 250 | Leaps when within 200 u, leap power 400 | 5 s after being knocked off (wiki: ~7 s); 6 s after a ride; 30 s after incapping his victim |
| Spitter | **100** | 210 | Spit range 900 (AI aims ≤850), projectile 900 u/s | **20 s** |
| Tank | 3000 / **4000** / 8000 / 8000 | **210** (100 walking) | Punch range 56, swing interval 1.5 s, rock throw | Rock: min 5–8 s between throws |
| Witch | **1000** | **300** (200 when burning or stumbled) | Startle range 100 (proximity) or 400 (flashlight) | – |

**Simultaneous limits in co-op:**
- Each class is capped at **1** alive (`z_*_limit` = 1).
- Total director-spawned specials: `MaxSpecials` default **2** per the VDC DirectorOptions table. Community testing says a third usually appears only after one dies (?).
- Dominator classes (Hunter, Smoker, Jockey, Charger): `DominatorLimit` 2.

**Claw (scratch) attacks** for Boomer, Smoker, Jockey and Spitter: 1 (Easy), 2 (Normal), 5 (Advanced), 20 (Expert). The Hunter's claw does 10 / 10 / 20 / 40, and the Charger's punch 5 / 10 / 15 / 20. Claws hit about once per 1 s (0.5 s after a miss); claw range is 52 u (70 u looking straight down). AI Smokers basically never claw.

**Spawning:** specials appear at valid nav areas inside the active area, never closer than **250 u** (`z_safe_spawn_range`) and never in line of sight.
- Smokers prefer spots **above** the survivors.
- Boomers spawn **ahead**, since they are slow.
- Chargers have a 10% chance to spawn behind the team and otherwise come from ahead.
- Every other class prefers the front.
- AI specials too far away are removed: commons beyond 2500 u are deleted and AI specials suicide (`ZombieDiscardRange` 2500).

### 4.1 Boomer

- **Body:** HP 50, speed 175 (4.4 m/s). It gurgles and burps constantly, which is its audio tell.
- **Vomit:**
  - AI vomits within **300 u** (`z_vomit_range`); the stream reaches about 350 u (`z_vomit_maxdamagedist`) and further if aimed up.
  - Stream lasts 1.5 s (`z_vomit_duration`). Cooldown is **30 s** (`z_vomit_interval`), counted from the end of the stream.
  - Reaction delay before an AI Boomer vomits: about **3 s** on Easy, **1 s** on Normal (`boomer_vomit_delay` 1), about instant on Advanced and Expert. Moving or losing sight for 5 s resets it.
  - Vomit fatigue (`z_vomit_fatigue` 3000) slows or pins the victim briefly.
- **Bile effect on a survivor:**
  - The screen is smeared green-black and teammate outlines are hidden. The overlay starts fading at about 5 s and fades over 5 s (`z_vomit_fade_start`/`_duration`; the wiki says ~15 s total (?)). Bots are blinded 5 s.
  - The coated survivor glows orange-yellow to teammates (purple to infected players) and becomes the horde's target ("IT") for **20 s** (`survivor_it_duration`).
  - A horde (mob) is **forced to spawn** near the victim, about 20 commons; the mob timer resets.
  - Several survivors biled at once share one horde. A new horde only comes after the effect expires and the Boomer vomits again.
- **Death explosion:**
  - Inner radius **130 u** and outer **200 u** (`z_exploding_inner/outer_radius`).
  - It **splashes bile** on survivors in range (which also calls a horde if one isn't already coming) and **knocks back and stumbles** everyone nearby, survivors and infected alike, including the Tank and a Charger mid-pummel. Survivors stagger for ~3 s in L4D2 (wiki); on a ledge they can end up hanging.
  - A Boomer that falls far splats instead and still bile-splashes within 200 u.
  - **Shove a Boomer** to stagger it and back away before shooting. Its HP is tiny.
- **Audio / music:** "Boomer Bacteria" stinger when it spawns nearby, with heavy gurgling and burping. A "Pukricide" cue plays when you are vomited on (or "Pukricide Hit" when a teammate is).

### 4.2 Hunter

- **Body:** HP 250, run speed 300 (fast).
- **Prowl and pounce:**
  - The AI crouches and growls ("ready") when the target is within 500 u (`hunter_pounce_ready_range`). It lunges from up to **750 u** (`z_hunter_lunge_distance`) at 700 u/s (`hunter_pounce_air_speed`; lunge power 600, plus 200 upward), with an added loft of 0.035° per unit of distance, max 45°.
  - It can wall-jump, but not while burning.
  - Hunters are silent unless crouched. They scream on spotting a survivor, and the growl rises in pitch as they near.
- **Pinned damage ("shred"):** **5 per 0.5 s** on Easy/Normal (`z_pounce_damage` 5, interval 0.5), 10 per 0.5 s on Advanced, 15 per 0.5 s on Expert. On Expert a full-HP survivor is incapacitated in about 9 s.
  - Victims pinned **while incapacitated** take several times more (the wiki says ~4×).
  - The victim can do nothing; a teammate must shoot, shove or melee the Hunter off.
- **Pounce impact bonus:** only **player-controlled** Hunters (Versus) deal it. It is 1 + up to 24 extra damage (`z_hunter_max_pounce_bonus_damage` 24), scaling with horizontal distance between roughly 300 and 1000 u (`z_pounce_damage_range_min/max`, which are hidden cvars (?)). AI Hunters in co-op don't get this bonus. In Versus and Survival the landing also stumbles nearby survivors; in co-op `z_pounce_stumble_radius` is 0.
- **Interrupting a pounce:** 50 damage interrupts a pounce attempt (`z_pounce_damage_interrupt`).
  - **Skeet:** killing a Hunter in mid-air with one shotgun blast or a few quick shots (250 HP).
  - **Dead-stop:** shoving the Hunter mid-air or in the ~1 s before he latches.
- **After being shoved off:** sometimes a back-roll, then a re-pounce about 1 s later. When hit enough at range, an AI Hunter leaps away and circles back.
- **Claw:** 10 / 10 / 20 / 40 per hit (Easy / Normal / Advanced / Expert), about 1 per second.
- **Audio:** "Hunter Bacteria" stinger; spawn-and-crouch growl; a shriek on spotting or leaping. "Exenteration" music while you are pounced.

### 4.3 Smoker

- **Body:** HP 250, speed 210. He coughs and wheezes constantly (audio tell); his death cloud makes survivors cough.
- **Tongue grab:**
  - Range **750 u** (`tongue_range`; 19 m). The tongue flies at 1000 u/s and needs a clear line, though it may lose sight for up to 1 s and still hit. It can bend around one corner, 5 u off the obstacle.
  - AI reaction before shooting: Easy ~3 s, Normal **1.5 s** (`smoker_tongue_delay`), Advanced and Expert instant. Moving or losing sight >5 s resets it.
  - On contact there is a 0.1 s delay before pulling (`tongue_start_pull_delay`). The victim then has about 1 s to fire before their arms are bound.
  - The victim is dragged at up to **175 u/s** (`tongue_victim_max_speed`, acceleration 30), with an accuracy penalty while being dragged.
  - Drag damage is 3 per tick (`tongue_drag_damage_amount`; it mainly applies in Versus).
- **Choke:** **10 dmg/s** on Easy/Normal (`tongue_choke_damage_amount` 10 every 1 s), 20 on Advanced, 30 on Expert (Versus: 5).
  - Choking starts when the victim reaches the Smoker, is lifted ≥40 u off the ground for 0.5 s (hanging), or makes less than 25 u progress for 0.5 s (snagged on an obstacle, "ground choke").
  - The Smoker claws a victim pulled right up to him.
- **Breaking the hold:**
  - Kill the Smoker.
  - Shove or melee the Smoker or the victim. Shoving the victim only works once they are immobilised.
  - Shoot or slash the tongue itself; slashing melee can cut it, even just before it connects.
  - An explosion, or closing a door across the tongue.
  - `tongue_break_from_damage_amount` 50 is described as "damage to the Smoker that makes him let go" (?).
  - It also breaks if the victim makes no progress for 10 s (`tongue_no_progress_break_interval`).
  - The victim cannot free themselves in co-op.
  - On release the victim gets a fatigue slowdown (`tongue_release_fatigue_penalty` 2500) and may stagger up to 200 u for 1.5 s.
- **Cooldown:** **20 s** after a successful grab ends (`tongue_hit_delay`) and **15 s** after a miss (`tongue_miss_delay`). A miss or wall hit hangs there for 2 s before retracting (`tongue_dropping_to_ground_time`). A tongue passing within 100 u of a Witch's head gets snapped (`z_witch_tongue_range`).
- **Death:** he bursts into a dark green **smoke cloud** of radius **175 u** (`z_cough_cloud_radius`) that blocks vision and makes survivors cough, which interrupts their callouts. The cloud stops causing coughs after 14 s.
- **Escape behaviour:** an AI Smoker retreats out of range after a grab breaks (`Smoker_escape_range` 750) rather than fighting.
- **Audio:** "Smoker Bacteria" stinger; constant coughing. "Tongue Tied" music while dragged and "Asphyxiation" while choked.

### 4.4 Charger

- **Body:** HP **600**. He cannot be shoved (`z_charger_allow_shove` 0); only explosions (not the GL) stagger him. Normal speed is ~250 (?).
- **Charge:**
  - Wind-up 0.5 s (`z_charge_warmup`), then a sprint that starts at 250 u/s and ramps to **500 u/s** (12.7 m/s). It lasts **2.5 s** (`z_charge_duration`), about 80–90 ft (wiki).
  - He runs in a straight line and can't steer. Cooldown **12 s** (`z_charge_interval`).
  - The wiki says AI Chargers take about 66% less damage while charging (?).
- **On impact:**
  - **Grab:** he grabs the first survivor he hits and carries them.
  - **Bystanders:** survivors within ~120 u of the path (`z_charge_impact_radius`, angle 0.7) are **flung** with force 550–800 and take the same impact damage.
  - **Hitting a wall:** carrying a victim, the victim takes **10** (Easy/Normal) / **15** (Advanced; also Versus) / **20** (Expert) (`z_charge_max_damage` 10). Hitting a wall *without* a victim stumbles him and does 2 to nearby survivors; he also stumbles a Tank or Boomer he hits. Physics props get 20 damage and force up to 3000.
- **Pummel:** he then slams the victim into the ground repeatedly for **15 per slam** on all difficulties (`z_charger_pound_dmg`), about one slam every ~1.5–2 s (?), until the victim dies or he is killed. Knocking a carried survivor off a ledge is usually lethal.
- **Punch:** 5 / 10 / 15 / 20 (Easy / Normal / Advanced / Expert). He is the hardest-hitting non-boss melee attacker.
- **Melee kill:** 1 hit to the head or 2 to the body.
- **Audio:** "Charger Bacteria" stinger. Constant guttural grunting and muttering; he is one of only two infected that retain some speech-like sounds. A roar at the start of a charge.

### 4.5 Jockey

- **Body:** HP 325, speed 250. A small, hunched, hopping figure.
- **Leap:** an AI Jockey leaps when the victim is within **200 u** (`z_jockey_leap_range`). Leap power is 400 and he attaches within 60 u. He can also just drop onto someone from above.
- **Ride:**
  - He sits on the victim's head and **steers** them toward hazards, away from the team, off ledges (when the drop is ≥200 u), into spit or fire, or toward the Witch.
  - He scans 500–800 u for hazards every 3 s.
  - The victim fights back by pressing the opposite direction; control strength is 0.8 ± 0.7 random (`z_jockey_control_*`). Mounted speed is ≥0.6× normal.
  - The victim can't shoot.
- **Damage while riding:** **4 per 1.0 s** on Easy/Normal (`z_jockey_ride_damage` 4, with a 1 s delay before the first tick), 8 per second on Advanced, 12 on Expert. Versus: 2 every 0.5 s.
- **Ending the ride:** shove the Jockey (not the victim), shoot him, or let the victim go down; once the victim is incapacitated he hops off.
- **Re-leap timers:** 30 s after incapacitating someone (`z_leap_interval_post_incap`), 6 s after a ride (`z_leap_interval_post_ride`), about 5 s after being knocked off (`z_jockey_leap_again_timer`; wiki ~7 s), almost instant after a miss.
- **Claw:** 1 / 2 / 5 / 20.
- **Audio:** "Jockey Bacteria" stinger. A high, cackling, giggling chatter that is very recognisable, and a shriek when leaping.

### 4.6 Spitter

- **Body:** HP 100. Speed 210, briefly slowed after spitting. Her body glows green in the dark; on death the glow fades and she leaves a small acid puddle.
- **Spit:**
  - A lobbed acid glob; AI uses it within 850 u (`z_spitter_range`), max range 900 u, projectile 900 u/s with a 0.3 s spit latency.
  - It drips down to the nearest walkable floor and spreads into a pool after about 0.2 s. Cooldown **20 s** (`z_spit_interval`).
  - She can spit while jumping or on a ladder. She is the only special that destroys items: spit ignites gas cans after 2.9 s.
- **Acid pool:**
  - Lasts roughly 6–8 s (?). Damage ticks every 0.2–0.3 s (?). Per-tick damage **ramps up then tapers**: community data says it scales from ~0 at the start, to ~6 per tick mid-life, to ~4 near the end.
  - Standing in it the whole time deals roughly **81–82** on Normal, Advanced and Expert, and up to ~45 on Easy (wiki). Jumping over it still hurts.
  - Bots and incapacitated survivors take reduced acid damage (bots take the Easy amount).
  - `spit_scaling_min_scale` 0.35 reduces acid damage when commons are already dealing near-max DPS.
- **Claw:** 1 / 2 / 5 / 20.
- **Audio:** "Spitter Bacteria" stinger (high-pitched notes when she spawns). Gurgling and hacking, a screech on spotting a survivor, a spitting "hock" sound. Survivors call out incoming spit ("goo", "spit").

### 4.7 Tank (boss)

- **Health:**
  - Easy 3000, **Normal 4000** (`z_tank_health`), Advanced and Expert **8000**, Versus 6000.
  - Hidden multipliers: ×0.75 Easy, ×2 Advanced and Expert, ×1.5 Versus.
  - Changing difficulty mid-fight does not change his HP, only his damage.
- **Speed:**
  - **210 u/s** (5.3 m/s): slightly slower than a healthy survivor (220), much faster than a limping one (150).
  - Walk 100. Very slow while crouched (vents). Slowed when shot from within 200–400 u, and dramatically by mounted guns.
  - **In L4D2 co-op a burning Tank moves slower**; in L4D1 campaign he moved faster. Water extinguishes him.
- **Punch:**
  - Damage **24** on Easy/Normal, **33** Advanced, **100** Expert (instant incap).
  - Triggered within 50 u (`tank_attack_range`). The swing reaches **56 u** across a 180° arc with a 15 u fist radius (`tank_swing_range`, `tank_swing_arc`). Wind-up 0.5 s (`tank_windup_time`), swing lasts 0.2 s.
  - Re-swing every **1.5 s** after a hit, 1.0 s after a miss, and 0.6 s when clearing zombies from his path.
  - Since 2010 his punches hit everyone in the arc.
  - It **launches** the survivor (farther if they were jumping) and briefly stuns them; being punched into a wall shortens the stun. Off a high ledge it means death.
  - Punched cars, dumpsters and similar props (outlined red) instantly incapacitate on hit regardless of difficulty (except the cars on The Bridge), and repeated contact can kill a downed survivor.
- **Pounding a downed survivor:** 75 (Easy/Normal), 100 (Advanced), 150 (Expert). He raises both arms and slams. In Versus this does only 24.
- **Rock throw:**
  - Same damage as a punch.
  - Used when the target is ≥250 u away and he can see them but not reach them (`tank_throw_allow_range`). At least 5 s between throws (`z_tank_throw_interval`); the AI waits at least 8 s (`tank_throw_min_interval`).
  - He is stationary while ripping up the chunk; captions read "[Tank Picks Up Rubble]". He leads moving targets by 0.5.
  - Throw force 800, rock radius 100. The rock has **50 HP** (`z_tank_throw_health`) and can be shot apart; a sniper does it in one shot.
  - On Expert he is very accurate. After throwing he retargets the closest survivor.
- **Taunt:** in co-op, after a successful hit he taunts (beats his chest, slams the ground, sways). The taunt lasts longer on easier difficulties, giving the team space; it is disabled in Versus.
- **Targeting (L4D2 AI):**
  - He tries to down the whole team rather than kill one survivor at a time.
  - He switches target when he incaps his current one, when someone with a chainsaw comes close, when his target is pinned, when someone uses a mounted gun, when someone is biled (highest priority), or when his target flees and someone else attacks.
  - A non-finale Tank is passive until he sees survivors or is shot. He also activates once the team gets far enough ahead in flow distance.
- **Frustration / anti-stall:**
  - Player Tanks: the frustration meter drains over **20 s** without line of sight (`z_frustration_lifetime`) and refills on any hit.
  - AI Tanks: they suicide if stuck about 10 s (`tank_stuck_time_suicide`), if they lack sight of survivors for about 60 s (`tank_visibility_tolerance_suicide`), or if in stasis 30 s (?).
- **Explosions:** they **stumble** him (pipe bomb, propane, oxygen, Boomer death, a Charger's missed charge). The **grenade launcher does not**, but deals ×3 damage.
- **Shotgun and melee damage:** T2 shotguns deal ×0.85 to him. Melee does 5% of max HP per hit.
- **Director behaviour around the Tank:**
  - Outside finales, the Director **stops spawning commons and specials** while the Tank is engaged (`ShouldAllowMobsWithTank` / `ShouldAllowSpecialsWithTank` false). Bile still calls a horde.
  - If survivors run past the Tank, roughly 1500 flow units (`director_tank_bypass_max_flow_travel`), spawning resumes to slow them down.
- **Footsteps:** screen shake within **750 u** (`z_tank_footstep_shake_radius`).
- **Audio:**
  - Unaware: deep growls and huffs.
  - Aware: roars, and the ground shakes.
  - A dedicated **Tank theme** plays (heavy, drum-driven orchestral); finales use the faster "Taaank" variant.
  - He laughs when a rock hits and gives a dying moan of "Noooo".

### 4.8 Witch (boss)

- **Body:** HP **1000** (`z_witch_health`). Body damage is scaled by difficulty like commons (×2 / ×1 / ×0.75 / ×0.5). The head takes full damage.
- **Sitting Witch (anger meter):**
  - She **sits crying**. Anger builds while a survivor is within the personal-space radius of **100 u** (`z_witch_personal_space`; 2.5 m) or shines a **flashlight** on her within **400 u** (`z_witch_flashlight_range`). Noise and gunfire nearby also count. Proximity threat ranges are 300 u (normal) and 600 u (hostile).
  - Rage rises at 0.2/s (`z_witch_anger_rate`) and decays at 0.05/s (`z_witch_relax_rate`). `witch_rage_ramp_duration` is 5 s.
  - Startle time while kept in range: about 8 s (Easy), **5 s** (Normal), 5 s (Advanced), 4 s (Expert) (wiki).
  - Visual and audio stages: she stares and groans softly, **stands up** and groans, raises her arms and growls louder, then **screams** and charges.
  - **Shooting her startles her instantly.** She targets whoever startled her (random among several).
  - A Witch hit by an attack while unaware of anyone gasps, then may settle back down.
- **Attack:**
  - Charges at **300 u/s**, faster than any non-adrenaline survivor, zig-zagging at range. Attack range 60 u.
  - One hit deals **100** (instant incap) on Easy, Normal and Advanced. On **Expert** it **kills** (Realism: kills on all difficulties except Easy).
  - Against a **downed** victim she shreds every ~0.5 s for about 12–15 (Easy), **30** (Normal; `z_witch_damage_per_kill_hit` 30), ~60–68 (Advanced), lethal (Expert). Sources vary (?).
  - Against other infected she deals 250 per hit.
- **After her target dies or escapes:** she runs away, despawning when unseen for 2 s, retreating 750–2000 u (`z_witch_min/max_retreat_range`). She also flees if her target enters a saferoom or she can't reach them.
- **Switching targets:** igniting or biling her switches her target to whoever did it. She snaps Smoker tongues within 100 u of her head.
- **Fire:** she burns to death in **15 s** (`z_witch_burn_time`) and runs at 200 u/s while burning.
- **Stumbles:** explosions, explosive ammo, and headshots from a Hunting rifle, Sniper, AK or Magnum stumble her. Explosions also slow her.
- **Crowning:** a point-blank shotgun blast to the head of a sitting or unaware Witch kills her instantly (head damage is unscaled). It does not work in Realism.
- **Wandering Witch (L4D2, daylight maps):**
  - She walks aimlessly with hands over her eyes, sobbing (a different cry and theme). Flashlights don't affect her.
  - Proximity of **240 u** (`z_witch_wander_personal_space`) startles her after about **10 s** (`z_witch_wander_personal_time`). **Touching her** startles her instantly.
  - On startle she screams for about 1 s before charging, which gives a window to kill her.
  - Bot stray bullets make her yelp but don't startle her.
  - **Dead Center map time-of-day keys:** c1m2 Streets `timeofday` 4 (dusk) and c1m3 Mall 2 (morning). Whether Dead Center Witches sit or wander is **unconfirmed (?)**. Plan for the sitting Witch as the default.
- **Spawn rules in Dead Center (Campaign):**
  - **No Witch in c1m1 The Hotel** and none in the c1m4 finale; Witches never appear in finales except The Concert.
  - She can appear in c1m2 (even near the cola store, where the alarm doesn't startle her) and in c1m3, including during the alarm crescendo.
- **Audio:**
  - The **crying** is audible from a distance and is the main tell. The "Witch Encroacher" music plays as you approach, with distance-based intensity (`music_dynamic_witch_near_min/max` 360–1800).
  - Rising groans and growls as she angers. "Psycho Witch" chase music, and "Witch Roast" when she burns.
  - Wandering Witch themes: "Little Lost Witch" and "Loud Angry Little Witch".
  - A survivor who startles her swears ("Oh shit!", "Shoot the Witch!"), and an on-screen notice reads "<Name> startled the Witch".

### 4.9 Special Infected audio and music summary

- **Spawn stingers:** each special has a short "bacteria" stinger (two variants each) that plays for a survivor when that special is nearby or spawning. Each is a distinct short instrumental motif, so experienced players identify the class by ear.
- **Pinned-victim music:** Hunter "Exenteration", Smoker "Tongue Tied" and "Asphyxiation", Boomer "Pukricide". Jockey and Charger have their own ride and pummel cues. Teammates hear a "...Hit" variant.
- **Vocal tells:**
  - Boomer: gurgling, burping. Hunter: growl, shriek. Smoker: hacking cough. Charger: grunting mutter.
  - Jockey: giggling cackle. Spitter: gurgling hiss and screech. Tank: roar and footsteps. Witch: crying.
- **Horde music:**
  - Spotting a mob of ≥2 commons can start the mob music (`z_mob_music_size` 2). A spawned mob of ≥25 triggers horde music (`director_music_dynamic_mob_size` 25), which stops once fewer than ~3 are visible.
  - A **"Mega mob" warning** (a distant mass scream plus percussion) precedes panic events.
  - Calm ambient tracks run per campaign; "Moment of Silence" plays at most every 600 s.

---

## 5. AI DIRECTOR

### 5.1 Concepts

- **Navigation mesh and flow distance.** Every nav area stores its travel distance from the starting saferoom along the "escape route" (shortest path start→exit). Following increasing flow always leads to the exit. Flow is used to decide whether a spot is "ahead" of or "behind" the team, to place bosses, and to measure progress. Implementation idea: precompute shortest-path distance from the start across the walkable graph.
- **Active Area Set (AAS):** the nav areas within roughly 1500–3000 u of the team.
  - The Director creates population when areas enter the set and destroys it when they leave.
  - Commons spawn ≤ **1500 u** from the survivors (`z_spawn_range` / `ZombieSpawnRange`) and never closer than **550 u** (`z_spawn_safety_range`).
  - Infected are removed beyond **2500 u** (`z_discard_range`).
- **Potentially visible areas:** nothing spawns in an area any survivor can see. Fog exceptions exist (`ZombieSpawnInFog`).

### 5.2 Survivor emotional intensity (per survivor, value 0..1)

From Booth's talk plus the cvars:
- **Increases when:**
  - The survivor is injured by infected, proportional to damage (`intensity_factor` 0.25, "how quickly intensity increases").
  - The survivor is **incapacitated**, which sets it to maximum.
  - The survivor is pulled or pushed off a ledge by infected.
  - A **nearby infected dies**, inversely proportional to distance: strong within 150 u (`intensity_enemy_death_near_range`), fading out by 500 u (`intensity_enemy_death_far_range`).
  - Friendly fire and long-range sniping kills do **not** raise it (wiki).
- **Decay:** toward 0 at a rate that empties a full meter in **30 s** (`intensity_decay_time`). There is **no decay while infected are actively engaging** that survivor: decay pauses for enemies within 750 u (`survivor_intensity_decay_threat_range`) or seen within the last 5 s (`survivor_intensity_recent_enemy_duration`).
- **Smoothed value:** a time-averaged intensity follows the raw value with a 20 s lag (`intensity_averaged_following_decay`).
- **Team value:** the Director tracks the **max** over all four survivors.

### 5.3 Pacing phases (tempo)

1. **BUILD_UP:**
   - Full threat population: wanderers, mobs on timer, and specials.
   - Lasts at least **15 s** (`director_build_up_min_interval`) and continues until max intensity crosses the peak threshold (≈0.9–1.0; `director_intensity_threshold` 0.9).
   - Mobs only spawn in this phase.
2. **SUSTAIN_PEAK:** keep full population for **3–5 s** after the peak (`director_sustain_peak_min/max_time`).
3. **PEAK_FADE:** switch to minimal population and wait until intensity drops out of peak range. All survivors must fall below **0.9** (`IntensityRelaxThreshold`) and there must be a natural lull in combat before Relax begins.
4. **RELAX:**
   - Minimal population: **no mobs, no new specials** (existing ones may still attack), and no wanderers until the team is "calm".
   - Wanderers are allowed back when every survivor's intensity is below **0.3** (Easy/Normal), **0.5** (Advanced) or **0.8** (Expert) (`director_intensity_relax_allow_wanderers_threshold*`). On harder difficulties they return sooner.
   - Lasts **30–45 s** (`director_relax_min/max_interval`), or ends early once the survivors advance **3000 flow units** (`director_relax_max_flow_travel`).
   - Then back to BUILD_UP.
- **Bosses (Tank/Witch) are not affected by pacing.**
- **Finales lock tempo in BUILD_UP** (`LockTempo`).
- **"Calm" survivor:** `survivor_calm_*` means not hurt in 5 s, not firing in 5 s, no enemy seen in 5 s, not switched weapons in 2 s, intensity < 0.25, flashlight off.

### 5.4 Mobs (hordes)

- **Interval:** set to a random value between min and max after each mob. The timer counts down even while spawning is paused, so a mob can fire instantly when the pause ends.

| Difficulty | Min interval | Max interval |
|---|---|---|
| Easy | 120 s | 240 s |
| Normal | **90 s** | **180 s** |
| Advanced | 90 s | 180 s |
| Expert | 90 s | 180 s |

  (Cvars `z_mob_spawn_min/max_interval_*`. The wiki claims Expert hordes come more often; the cvars show the same timer, and the extra pressure comes from other factors.)
- **Size:** **10–30** commons (`z_mob_spawn_min/max_size`). Size grows from minimum just after a spawn toward maximum the longer it has been (`z_mob_recharge_rate` 0.0025 per tick (?)), which balances frequent mobs. If no valid spawn spot exists, the mob is queued and arrives larger when the team moves (`MobMaxPending`).
- **Direction:** **75%** spawn **behind** the team (`z_spawn_mobs_behind_chance` 75), since wanderers, specials and bosses are usually met ahead. Otherwise they come from ahead or anywhere valid.
- **Boomer vomit or a bile hit** forces a mob near the victim and resets the timer.
- **Panic / crescendo "mega mob":** 50 commons in total (`z_mega_mob_size`) delivered in waves. Finale mob size is 20 (`z_mob_spawn_finale_size`). Panic waves pause 5–7 s between them (`director_panic_wave_pause_min/max`).
- **"Hurry" mini-hordes:** small mobs during quiet periods when no infected are being killed (wiki).
- **Car alarms:** shooting or jumping on an alarmed car (blinking lights) triggers a panic event. Bots never trigger them.

### 5.5 Wanderers

- **Placement:** each nav area gets a count at map start, based on escape-route length and density (`z_wandering_density` 0.03; `WanderingZombieDensityModifier` 0.03). They are created when the area enters the AAS and recycled into mobs. Up to 20 sit on unreachable "background" areas.
- **Cleared areas:** areas a survivor has seen and cleared are not repopulated (`ClearedWandererRespawnChance` 0 in co-op).
- **Idle poses:** they idle, sit or lie down by default. `z_must_wander` 0 mixes these poses.

### 5.6 Special infected timers (co-op)

- **First spawn:** none for **30–60 s** after leaving the saferoom (`director_special_initial_spawn_delay_min/max`).
- **Respawn:** each special slot respawns **45 s** after its occupant dies (`director_special_respawn_interval`; `SpecialRespawnInterval` 45 in campaign, 10 in campaign finales).
- **Limits:** **MaxSpecials 2** at once (?), each class ≤1, dominators ≤2 (see 4.0). No specials during Relax.
- **Placement:** not visible, ≥250 u away, preference by class (see 4.0).

### 5.7 Bosses (Tank and Witch)

- **Placement:**
  - At map start, boss "slots" are placed every N units along the escape route ± a random amount, often at designer-marked threat areas (the Booth talk).
  - Tank, Witch and Nothing are shuffled and dealt into the slots, with no back-to-back repeats (no Tank followed by Tank).
  - Usually there is at least one Tank and about one Witch per map. Two Witches are more common than two Tanks.
  - If a map gets no Tank, later maps are more likely to.
- **Versus flow windows** (for reference): bosses spawn between **25% and 90% of map flow** (intro map 50–75%, finale map 25–60%), Tank and Witch 10–30% of flow apart (`versus_boss_*`). Co-op uses designer threat areas instead and can stack a Tank and Witch together.
- **Tank vs checkpoints:** no Tank in the first 15 s after leaving a checkpoint (`director_tank_checkpoint_interval`).
- **Dead Center specifics (Campaign):**
  - **c1m1 The Hotel:** no Tank and no Witch in co-op (Versus can have them).
  - **c1m2 The Streets and c1m3 The Mall:** Tank and/or Witch possible. The Mall's alarm crescendo can even drop one in mid-event.
  - **c1m4 The Atrium:** scripted finale Tanks (5.9). `ProhibitBosses` is true, so no random bosses.

### 5.8 Items (randomization)

- **Item positions:** designers place many possible item spots and weapon caches. The Director picks which exist, at a density of about **6.48 items per 100 square yards** for each scavenge class: pills, adrenaline, molotov, pipe bomb, bile, defib, upgrade packs, ammo, melee, gas can, propane, oxygen, "super weapons".
- **Pistols and Magnum:** pistols 4 per 100 yd²; Magnum spawns are all kept (`director_magnum_spawn_density` -1).
- **Clustering:** items within 50 u count as one cluster (`director_item_cluster_range`). Weapons within 100 u are rolled to the same tier with no duplicates (`director_weapon_cluster_range`).
- **Tier choice:** T1 vs T2 at a weapon spot is random per map. Each map has a 25% chance of a laser-sight/upgrade bonus (`director_per_map_weapon_upgrade_chance`). CS weapons have a 25% chance (`director_cs_weapon_spawn_chance`).
- **Pill conversion:** first-aid cabinets hold up to 4 pills. When the team is hurt, pills **ahead** of the furthest survivor's flow may be converted to **medkits** (team health below ~50, `director_convert_pills_critical_health`) or **defibs** (someone near death, below 25).
- **Fixed items** the Director cannot change:
  - c1m1: silenced SMG at the elevator event; the security room always has a medkit and 3 chrome shotguns.
  - c1m2: Whitaker's shop always has T2 guns, a laser sight and a fire axe.
  - Saferooms hold kits, ammo and T1 or T2 weapons.

### 5.9 Crescendo events and finale (Dead Center, from decompiled map scripts)

- **c1m1 The Hotel:** prying open the stalled elevator triggers a horde, defended among fires. A silenced SMG respawns on the floor; burning hallways help.
- **c1m2 The Streets: cola gauntlet** (`c1_gunshop_onslaught.nut`):
  - The cola is in an alarmed Save 4 Less store. The alarm runs a continuous gauntlet until the cola is handed to Whitaker; it eventually stops on its own after about 10–20 min (wiki).
  - Mobs every **1–2 s** of **10–20** commons, max pending 10, spawning **behind** the survivors.
  - Sustain peak 1–3 s, relax 5–10 s, relax ends after 200 flow units. No bosses.
  - Whitaker then blows up the tanker with a "grenade launcher" (the explosion kills anything near the truck) and the alarm stops.
  - After this an alarmed car may appear in the mall parking lot.
- **c1m3 The Mall: alarm crescendo.**
  - The Director picks a route: toy store window (2nd floor) or emergency door (1st floor).
  - **Initial burst** (`c1_mall_crescendo.nut`): a mob of **120** commons, spawn interval 1 s, max pending 90, spawning **above** the survivors. Sustain peak 15–18 s. Up to 2 Smokers and **3 Chargers**. Specials respawn every **3 s**.
  - **Waves until the alarm is shut off** on the 3rd floor (`c1_mall_crescendo_wave.nut`): every **20 s** a mob of **10–30** from ahead, no Boomers, specials every 10 s.
  - **Ambient mall** before the event (`c1_mall_ambient.nut`): mobs every 60–90 s of 10–20, 10 reserved wanderers always allowed, specials every 45 s.
- **c1m4 The Atrium finale** (`c1m4_atrium_finale.nut`): a scavenge finale.
  - Collect and pour **13 gas cans** into Jimmy Gibbs's stock car (8 in single-player / solo with bots). The cans are distributed across 3 floor zones. Red gas cans carried in also count.
  - **Stage sequence:** ONSLAUGHT → PANIC → ONSLAUGHT(delay) → PANIC → ONSLAUGHT(delay) → **TANK** (stage 6) → … → **TANK** (stage 14) → … → **TANK** (stage 22) → … through stage 31, alternating PANIC and delay stages.
  - **Delay stages** last **10–20 s** but abort early once 1 can is poured or 2 are touched or poured. Pouring progress therefore drives the pace, and fast teams can escape **before the first Tank** (the "POLE POSITION" achievement).
  - **Initial onslaught:** mobs of 2–6 every 4–8 s, common limit 5, relax 2–4 s, sustain peak 25–30 s. It ends when 4 cans have been touched or poured.
  - **PANIC stages:** mega-mob of **20–40** (random), common limit 15, specials every 40 s.
  - **TANK stages:** **mobs and specials are allowed alongside the Tank** (unusual). Mobs of 3–5 every 10–20 s, common limit 7, specials every 60 s.
  - **Shared settings:** mobs and specials spawn in "large volume" areas, spawn range 3000, no random bosses. Bile mob size is 15 and the escape common limit 15.
  - **Escape:** when all 13 are poured, the car is ready; get in to escape.
- **Generic finales (other campaigns):** hold out against 2 panic waves, then a Tank (`director_finale_panic_waves` 2), repeat, then the rescue vehicle arrives with a Tank. Stalling causes endless Tanks. Finale special respawn is 10 s and finale mob size 20.
- **Gauntlet template** (`director_gauntlet.nut`, used by e.g. The Parish bridge): endless panic. Mob size grows with progress (5→20) and with team speed (up to +15). The common limit is 1.5× the mob size, capped at 30. Standing still earns bonus break time between mobs.

### 5.10 Saferooms and checkpoints

- **Mid-campaign saferooms:** the start door is barricaded until opened. Specials can spawn inside the *ending* saferoom before it is reached. Closing the end door with all living survivors inside completes the chapter.
- **Saferoom supplies:** health kits on arrival, ammo, weapons.
- **Respawn on next map:** dead survivors respawn at the next map with 50 HP. HP carries over between maps, with temp health converted (?).
- **Wipe:** a team wipe restarts the chapter from that saferoom state.

---

## 6. SURVIVOR BOTS (in-game behaviour)

- **Following and positioning:**
  - Bots stay near the human players and never lead (`sb_allow_leading` 0). They wait behind the lead human.
  - Desired spacing is 200 u (`sb_separation_range`); a teammate 200–600 u away is "straying" or in "danger" and is gathered back.
  - Bots won't detour more than 750 u from the group for items (`sb_max_scavenge_separation`).
  - A bot far out of place is **teleported** near the team when no human is looking.
  - They hold battle positions near humans who stand still (`sb_battlestation_*`).
- **Shooting:**
  - Very accurate, often going for headshots, even when biled (blinded only 5 s per `sb_vomit_blind_time`).
  - They point weapons at idle infected, which reveals hiding spots.
  - They never fire near alarmed cars, and their stray shots can't trigger alarms.
  - They deal **no friendly fire** and can shoot through teammates (`sb_allow_shoot_through_survivors`).
  - They switch to pistols when infected close in on a sniper-armed bot. They do shove commons.
  - **Reaction time to a pinned teammate:** **2.0 s** (Normal), 1.0 s (Advanced), 0.5 s (Expert) (`sb_friend_immobilized_reaction_time_*`).
  - **Ranges they consider:** threat close 150, medium 300, far 600, very far 1500. Hearing 500 near, 1500 far.
- **Rescuing:**
  - They prioritise humans over bots.
  - They rush to revive a downed teammate within `sb_revive_friend_distance` 125 (?), even when it's unwise (with a Tank nearby).
  - They shoot or shove the attacker off a pinned teammate. They are bad at Jockeys (they chase), Smokers (they hesitate between shoving and shooting) and Chargers (they don't dodge).
  - They open rescue closets.
- **Healing thresholds** (hardcoded, wiki):
  - **Heal a teammate** with a kit when that teammate is below **40** HP. They are persistent, but stop if you pull out your own medical item.
  - **Heal self** below **30** (40 on Xbox 360). In a saferoom, below 75 (40 on Expert).
  - **Pills and adrenaline:** use at ≤**50** HP. They also **give** pills or adrenaline to a teammate who is at ≤50 and has none.
  - When deciding whom to heal, temp health counts at 0.5× (`sb_temp_health_consider_factor`), with a 15 HP "toughness buffer" in their own favour.
  - They won't heal with many infected nearby.
  - They don't understand black-and-white status.
- **Item pickup priorities:**
  - T2 over T1, following character weapon preferences.
  - Ammo piles, laser sights, upgrade packs (they will waste both if two are deployed), medkits, pills and adrenaline.
  - **Never:** throwables, defibrillators, M60, grenade launcher, chainsaw. Melee only under special settings.
  - They don't help carry or pour gas cans in scavenge finales.
- **Witch:**
  - Bots don't fire at a sitting Witch on their own and give her space.
  - Once she is startled she takes **top priority**: they won't save a pinned teammate until she is dead or gone.
  - They may still try to revive someone she is attacking.
  - They can't startle a Wandering Witch with gunfire, only by touching her. They can accidentally startle a sitting Witch by firing at infected near her or in narrow passages.
- **Tank:** bots don't dodge rocks, keep firing during his death animation, and get punched easily because they barely move away.

---

## 7. HUD / UI

Exact colours and wording are partly from memory and need visual verification against screenshots. They are marked (?) where unconfirmed.

### 7.1 Team health panel (bottom-left)

- **Layout:**
  - The local player's panel sits at the bottom-left: character portrait, name, a long horizontal health bar and the numeric health.
  - Each teammate has a smaller row stacked above it: portrait, name, bar and number.
  - A downed or dead teammate's portrait and bar change state: the bar shows the bleed-out draining, and a dead teammate's row is greyed or crossed (?).
- **Bar colour by total health (?):**
  - **Green ≥ 40**
  - **Yellow / orange 25–39** (limping range)
  - **Red 1–24**
  - Colour thresholds follow the 40 HP limp threshold (?).
- **Temporary health** is drawn as a **lighter, white or grey segment** continuing after the coloured permanent segment, and the number shows the combined total (?).
- **Incapacitated:** the bar turns red and shows the 300 incap health counting down. A ledge-hanging survivor is shown the same way (?).
- **Black-and-white:** for the affected player, the whole screen goes grayscale with a heartbeat. Teammates are warned by voice lines ("I can't take much more…"). There may be no explicit HUD icon in vanilla (?).
- **Health-based glow (for infected players):** Infected players see survivors outlined by health: high (0.04, 0.69, 0.20) green, medium (0.59, 0.40, 0.03) amber, low (0.63, 0.10, 0.10) red. These are a plugin's copy of the defaults (?).

### 7.2 Weapon / inventory panel (bottom-right)

- **Slot icons:** primary, secondary, throwable, kit slot and pills slot, as white silhouette icons. The selected slot is highlighted.
- **Ammo counter:** next to the primary, shown as a **clip / reserve** number pair, e.g. "50 | 360". Pistols show only the clip; reserve is infinite.
- **Low ammo:** the counter turns red or flashes (?). Survivors call out "Reloading!", and announce when they're nearly out ("I'm almost out of ammo").
- **Special ammo:** loaded incendiary or explosive rounds show as a separate icon and count beside the ammo (?).
- **Laser sight:** shown as an icon on the weapon (?).
- **Shove fatigue:** an indicator appears when shove is cooling down (from the 2009 update notes).
- **Progress bars:** a centre-screen progress bar appears for heal (5 s), revive (5 s), defib (3 s), deploying an upgrade, and pouring gas, with text like "Healing <Name>" or "Being healed by <Name>". The Atrium also shows a **can counter** ("X/13").

### 7.3 Crosshair

- Four short lines around a gap (Counter-Strike style, `CrosshairMinDistance` and `CrosshairDeltaDistance` in each weapon script). The gap widens with current spread from movement, jumping and sustained fire, and tightens when crouched.
- Shotguns show a wide crosshair; snipers zoom to a scope overlay.
- **Melee and items** show a small or minimal crosshair (?).
- **Incapacitated:** the crosshair wobbles with the dizzy drift.

### 7.4 Outlines / glows (`cl_glow_*` defaults)

| Thing | Default RGB (0–1) | Appearance |
|---|---|---|
| Teammates seen through walls (normal) | 0.3, 0.4, 1.0 | **Blue** silhouette, always on (except in Realism) |
| Teammate who is incapacitated, pinned or hanging ("hurt") | 1.0, 0.4, 0.0 | **Orange-red**, so you can see they need help |
| Biled ("vomit") teammate | 1.0, 0.4, 0.0 (?) | Orange-yellow. The wiki calls it yellow to survivors and purple to infected (0.79, 0.07, 0.72). |
| Items in pickup range or under the crosshair | 0.7, 0.7, 1.0 | Bright **white-blue** outline |
| Items at a distance | 0.3, 0.4, 1.0 | Dimmer **blue** outline, shown within a limited range |
| Items while you are black-and-white ("third strike") | 1.0, 0.0, 0.0 | **Red**, more intense |
| Rescue-closet survivor | – | Yellow outline (wiki) |
| Dropped scavenge gas can (Atrium) | – | Orange outline (Realism) / yellow-orange glow |
| Witch (infected-team view) | idle yellow / angry red | Uses the `cl_witch_glow_*` cvars |

### 7.5 Damage feedback

- **Directional indicator:** red arcs or splashes at the screen edge point toward the source of damage. Friendly fire also shows the indicator plus a screen shake.
- **Being hit:** the view punches and flinches, and movement briefly slows.
- **Low health:** a heavier red tint or blood at the screen edges (?). The heartbeat only plays in black-and-white.
- **Other screen effects:** bile vomit smears the screen green-black. The adrenaline effect gives tunnel vision. Explosive rounds fired too close cause deafening ringing (since 2020).

### 7.6 In-game messages and hints

- **Text feed** (upper left / chat area). Exact wording is unverified (?):
  - "<Player> attacked <Teammate>" (friendly fire)
  - "<Player> incapacitated <Teammate>" (friendly-fire incap)
  - "<Player> revived <Teammate>" / "helped up"
  - "<Player> healed <Teammate>"
  - "<Player> protected <Teammate>"
  - "<Player> startled the Witch"
  - "<Player> brought <Teammate> back to life" (defib; confirmed in spirit by the wiki)
  - "<Player> rescued <Teammate>" (closet)
  - "<Player> died" / "has been killed"
  - "<Player> is now idle" / "is no longer idle"
  - Death-state text: "You will be rescued soon" (Campaign); "Waiting to be rescued…" (?)
- **Game Instructor hints** (L4D2 floating icon + text):
  - Over a downed teammate: "Help <Name> up" / "Revive" with a key prompt. Over a pinned teammate: a "Save <Name>" style prompt with the attacker's icon.
  - Item prompts: "Pick up", "Throw", "Heal", "Give pills".
  - Objective prompts: "Get the cola to Whitaker", "Gas cans: 0/13" (?).
- **Voice callouts** (automatic barks): spotting each special, "Reloading!", "Incoming!" for hordes, "Witch!", "Tank!", "I'm down!", "Help!", "I need healing", item spots ("Pills here!", "Ammo here!").

### 7.7 End-of-chapter stats screen

- When the saferoom door closes, a short transition shows the chapter name and a **team stats summary** per survivor (?):
  - Common infected killed
  - Special infected killed
  - Headshots
  - Damage taken
  - Friendly fire dealt
  - Incaps or deaths
  - Revives, heals and protects
- L4D1 showed **awards** such as "Most Special Infected killed", "Most Common Infected killed", "Most friendly fire", "Least damage taken" and "Most accurate". L4D2's co-op screen is similar.
- The campaign finale shows a longer credits-style outro with per-player campaign stats (time, kills, etc.).
- Exact layout needs screenshots (?).

---

### Appendix A: Quick cvar sheet (most useful for a re-implementation)

```
# Survivor
run 220 (wiki; cvar survivor_speed 210), crouch 75, limp(<40hp) 150, crit(1hp) 85, adrenaline 260/15s
survivor_limp_health 40 | survivor_incap_health 300 | survivor_incap_decay_rate 3/s (12/s hopeless)
survivor_revive_duration 5 | survivor_revive_health 30 (temp) | survivor_max_incapacitated_count 2
survivor_ledge_grab_health 300 | first_aid_heal_percent 0.8 | first_aid_kit_use_duration 5
pain_pills_health_value 50 | adrenaline_health_buffer 25 | pain_pills_decay_rate 0.27/s
defibrillator_use_duration 3 -> 50 HP | rescue_min_dead_time 60 | z_survivor_respawn_health 50
friendly fire x: easy 0 / normal 0.1 / adv 0.3 / expert 0.5
z_gun_range 75 (shove) | z_gun_swing_interval 0.7 | coop fatigue penalty 5..8
fall_speed_safe 560 | fall_speed_fatal 720 | survivor_incap_max_fall_damage 200

# Commons
z_health 50 | z_speed 250 | z_walk_speed 85 | z_common_limit 30
hit dmg front: 1/2/5/20 (back x0.5) | body dmg factor to CI: 2/1/0.75/0.5

# Specials
Boomer 50hp 175 | vomit 300u, 30s cd | explode r130/200
Hunter 250hp 300 | pounce 750u, ready 500u | 5 dmg/0.5s (x2 adv, x3 exp)
Smoker 250hp 210 | tongue 750u @1000u/s, drag 175u/s | choke 10/s | cd 20s hit / 15s miss
Charger 600hp | charge 250->500 u/s, 2.5s, cd 12s | impact 10/15/20 | pound 15
Jockey 325hp 250 | leap 200u | ride 4/s (8 adv, 12 exp)
Spitter 100hp 210 | spit 900u, cd 20s | pool ~81 total (Normal+)
Tank 4000 (x0.75 easy, x2 adv/exp) 210 u/s | punch 24/24/33/100 | swing 1.5s | rock >=250u
Witch 1000hp 300 u/s | personal space 100u, flashlight 400u | 100 dmg (kill on Expert) | burns 15s

# Director
mob interval 90-180s (easy 120-240) | mob size 10-30 | 75% behind | mega mob 50
specials: first 30-60s, respawn 45s (finale 10s), MaxSpecials 2 (?) , 1 per class
relax 30-45s or 3000 flow | sustain peak 3-5s | build-up min 15s | intensity decay 30s
spawn range 1500u, min 550u (commons) / 250u (specials), discard 2500u
```

### Appendix B: Where the raw data came from (for re-checking)

- **Cvar dump (2022):** `raw.githubusercontent.com/ambaca/Bacardi-Dumpster-of-SM-Plugins/master/Dump All Cmds Cvars/output/List_ConVars_left4dead2_Engine_Left4Dead2_SRCDS_2022-04-26.txt`
- **Weapon and melee scripts:** `github.com/orinuse/L4D2_Unpacked-Scripts` (folders `left4dead2/scripts`, `update/scripts`, `update/scripts/melee`, `update/missions/campaign1.txt`)
- **Map scripts:** `github.com/Stabbath/L4D2-Decompiled` → `Decompiled VScripts/c1m4_atrium_finale.nut`, `c1_mall_crescendo*.nut`, `c1_gunshop_onslaught.nut`, `c1_mall_ambient.nut`, `director_gauntlet.nut`. Stripper dumps give the maps' `timeofday` values.
- **DirectorOptions defaults:** a VDC mirror at `github.com/apples1949/sourcepawn-l4d2/references/game-data/DirectorOptions.txt`
- **Booth GDC 2009 talk:** "The AI Systems of Left 4 Dead" (Valve PDF; source of the pacing phases, AAS, flow, the 75%-behind rule and intensity triggers)
- **Fandom wiki:** left4dead.fandom.com pages for the Tank, Witch, Hunter, Smoker, Boomer, Charger, Jockey, Spitter, Common Infected, Uncommon Infected, Health, Healing items, Difficulty, Melee, Weapons, the individual weapon pages, Pipe Bomb, Molotov, Bile Bomb, Ammo, Laser Sight, the props, The Director, Rescue Closets, Crescendo Event, the Dead Center chapters and Tactics (bots and friendly fire)
- **Glow defaults:** the "default" branch of the old SourceMod plugin `mlglow` (cl_glow_* values), plus L4D2 cvar names from community configs
