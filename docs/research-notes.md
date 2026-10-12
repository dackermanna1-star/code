# Noita (Nolla Games): mechanics reference for a 3D voxel reinterpretation

Compiled 2026-10-12 from the raw wikitext and Cargo tables of the official community wiki (noita.wiki.gg, read through its MediaWiki API) and from a public GitHub mirror of the game's data files (`data/scripts/gun/gun.lua`, `data/entities/player.xml`). The mirror is the **2019 Early Access** data at github.com/defektu/noita-early-access-data, so values taken from it are marked "EA data". Its core logic matches what the wiki describes for the current version.

Tags: **[confirmed: URL]** means the value was read directly from that source. **[uncertain]** means it comes from memory, inference, or sources that conflict.

## 0. Units and conventions (read first)

- **Frames:** the game runs at 60 frames/s. The wiki shows cast delay, recharge time and timers in seconds (frames ÷ 60). Spell lifetimes and timers are in frames. [confirmed: https://noita.wiki.gg/wiki/Wands]
- **HP:** displayed HP equals internal HP × 25. In `player.xml` the player has `hp="4"`, which displays as 100 HP. Every damage number below is in **displayed** units. [confirmed: EA data player.xml; https://noita.wiki.gg/wiki/Min%C3%A4]
- **Explosion damage to the player:** the player has an explosion damage multiplier of **0.35×** and a holy damage multiplier of 1.5×. All other types are 1.0×. Enemy explosion numbers below are raw, so a "50 explosion" fireball hits the player for about 17.5. [confirmed: https://noita.wiki.gg/wiki/Min%C3%A4]
- **Speeds** are in pixels/s. Almost all projectiles are capped at 1000 px/s terminal velocity. Lightning Bolt is the exception. [confirmed: https://noita.wiki.gg/wiki/Lightning_Bolt]
- **Critical hits:** the base critical multiplier is 5× damage. Crit chance above 100% raises the multiplier further. [confirmed: https://noita.wiki.gg/wiki/Critical_Plus]

---

## 1. Wand casting logic (gun.lua)

Sources: [confirmed: https://noita.wiki.gg/wiki/Expert_Guide:_Draw], [confirmed: https://noita.wiki.gg/wiki/Wands], [confirmed: https://noita.wiki.gg/wiki/Trigger], and the code in [confirmed: EA data https://github.com/defektu/noita-early-access-data/blob/HEAD/data/scripts/gun/gun.lua].

### 1.1 Piles and the cast loop
- A wand keeps three lists: **deck**, **hand** and **discarded**. At the first shot, the deck holds every spell in slot order (`order_deck()` sorts by `deck_index`), or in random order on a shuffle wand.
- **Cast start** (`_start_shot`): a new *root shot state* is created, seeded with the wand's stats (cast delay, spread, speed). Its draw count is `actions_per_round` (the "Spells/cast" stat). The wand's current mana is copied in.
- **draw_action():**
  1. If the deck is empty, what happens depends on who is drawing:
     - The **wand's own root draws** (`instant_reload_if_empty=false`) do not wrap. They set `reloading=true` and stop.
     - **Draws made by spells** (modifiers, multicasts, triggers; `instant_reload_if_empty=true`) **wrap**: the discard pile moves back into the deck, it is re-ordered (or reshuffled), and `start_reload=true` is set so the wand reloads at the end of this cast.
  2. The top card is popped from the deck.
  3. **Not enough mana** (`action.mana > mana`): the card goes straight to the discard pile, `OnNotEnoughManaForAction()` fires (a sound plays), and the draw fails.
  4. **No charges left** (`uses_remaining == 0`): the card goes to the discard pile and the draw fails.
  5. Otherwise its mana is subtracted immediately, it is added to the hand, and `action.action()` runs. A projectile action adds a projectile to the current shot state. A modifier changes the shot state and calls `draw_actions(1, true)`. A multicast calls `draw_actions(n, true)`.
- **draw_actions(n):** after a failed draw (no mana or no charges), the code **keeps drawing the next cards until one succeeds** or the deck runs out. In practice a spell you can't pay for is **skipped and the next spell is drawn in its place**. The wiki adds one exception: if the failed spell is the last card in the deck, it uses up that draw and is still discarded. Spells with 0 charges and spells you can't afford **never cause a wrap**.
- **Worked example from the Wands page:** with the sequence Homing (70 mana) → Spark Bolt (5 mana):
  - mana ≥ 75: both are cast.
  - 70–74: only Homing is cast.
  - 5–69: only the Spark Bolt is cast.
  - below 5: nothing is cast.
- **End of cast** (`_handle_reload`):
  - `move_hand_to_discarded()`: each hand card loses one charge if `uses_remaining > 0` **and** the cast produced at least one projectile (or the card is of type Other or Utility). A card that reaches 0 charges is **not** returned to the discard pile, so it drops out of the cycle until it is refreshed.
  - A **reload starts** if the deck is now empty or a wrap happened during the cast. `StartReload(current_reload_time)` runs and `current_reload_time` resets to the wand's base `reload_time`.
- **Cast with no projectiles:** cast delay is not applied. [confirmed: Wands page]
- **Mana regeneration:** mana charge speed is regenerated at 1/60 per frame, even while the wand is not held. Mana is capped at the wand's maximum at the start of each cast, but can exceed it during the cast (Add Mana). [confirmed: Wands, Expert Guide: Draw]

### 1.2 Spells/cast, wrapping, and the reload trigger
- The wand's built-in Spells/cast acts like a Tuple spell at the root, but **it can't wrap**. Example: a wand with 2 spells/cast and 3 Spark Bolts alternates between firing 2 and firing 1. [confirmed: Wands]
- **Wrap and reload rules:**

  | Situation | Wrap? | Reload? |
  |---|---|---|
  | A spell's draw hits an empty deck | yes | yes |
  | Wand Refresh is cast | yes | no |
  | Final draw spent on the last deck card | no | yes |

  [confirmed: Expert Guide: Draw]
- Once a wrap has happened, any root draws still remaining can keep drawing from the rebuilt deck. In the guide's example (3 Chainsaw, Spark Bolt, Light; 3 spells/cast), the second cast fires Spark Bolt plus 2 Chainsaws, all with Light applied. [confirmed: Expert Guide: Draw]

### 1.3 Cast delay and recharge time
- **Cast delay** = the wand's base `fire_rate_wait` plus the cast-delay modifiers of every spell evaluated in the **root shot state** of that cast. Spells inside trigger, timer or expiration payloads are **ignored** for cast delay. [confirmed: Wands, Trigger, Timer, Expiration_Trigger]
- **Recharge time** is a single global value, not tied to a shot state. Any spell changes it, including spells inside payloads (Chainsaw −0.17 s, Reduce Recharge −0.33 s, and so on). It resets to the wand's base after a reload. [confirmed: Expert Guide: Draw §Global values; Trigger]
- At the end of the deck, cast delay and recharge time **tick down at the same time**, so the wait is **max(castDelay, rechargeTime)**. They do not add. Example: 0.5 s + 0.5 s means waiting 0.5 s. [confirmed: Wands; Expert Guide: Draw]
- **Negative values:** a negative total cast delay becomes 1 frame. A negative total recharge time becomes 0. A wand's own negative base stat cancels positive spell additions up to that amount. [confirmed: Wands]
- Recoil is reset to 0 at the start of each cast. [confirmed: Expert Guide: Draw]

### 1.4 Shuffle
- On a shuffle wand, the deck is randomised:
  - before the first cast and when you switch to the wand,
  - on every wrap,
  - on every reload,
  - on the first Wand Refresh each cast.
- It does **not** pick a random spell on each draw. A shuffled deck is then read in order. The editing UI always shows your placement order. Multicasts, modifiers and triggers are shuffled too, so they can end up after the spells they were meant to modify. [confirmed: Wands]
- The perk "No More Shuffle" turns shuffle wands into non-shuffle wands while keeping their stats. [confirmed: Wands]

### 1.5 Always Cast (AC)
- An AC is a spell outside the normal queue. It is added to the **front of every cast** of the wand, costs **0 mana** (Add Mana and Blood Magic are exceptions), and has **unlimited uses**. It does **not** apply inside trigger payload shot states. [confirmed: Wands §Always Casts]
- **Code special rule:** a permanently attached card that calls `draw_actions(1)` draws nothing extra when the wand casts 1. So an AC modifier modifies the wand's normal draw instead of consuming an extra card. [confirmed: EA data gun.lua]
- Trigger and timer variants used as AC never fire their payload. The exceptions are Double Trigger and Delayed Spellcast. [confirmed: Wands]
- About 5% of wands are "Rare" (glowing) and about 4% have an AC without being Rare. The Always Cast perk adds a random AC, up to 4 per wand. [confirmed: Wands]

### 1.6 Shot states, modifiers and multicasts
- Spells never modify other spells. They modify the **current shot state**, which holds a list of projectiles plus damage, speed, spread, cast delay and so on. When the cast finishes, every projectile in that shot state is spawned with every modification applied. That is why one Damage Plus in front of a Double Spell affects both projectiles. [confirmed: Expert Guide: Draw]
- **Modifiers before a multicast**, or mixed in before the last spell of the set, affect every spell in the set at no extra mana cost. [confirmed: Tuple_Spell]

### 1.7 Trigger, timer and expiration payloads
- A trigger spell spawns its projectile and immediately builds a **new, separate shot state** by calling `draw_shot(create_shot(N), true)`, where N is the trigger's draw count: 1 for normal triggers, 2 for Double Trigger, 3 for Delayed Spellcast. The payload is made of **the next cards in the deck**, drawn by the usual rules: modifiers inside it extend it, and it can wrap. The payload is fired when the condition is met:
  - Trigger: when it hits terrain or an entity.
  - Timer: after N frames, or on collision, whichever comes first.
  - Expiration: when the projectile dies.

  [confirmed: EA data gun.lua `add_projectile_trigger_hit_world/timer/death`; Trigger page]
- **Isolation:** modifiers drawn **before** the trigger, in the root state, apply to the trigger projectile and to other root projectiles. They do **not** apply to the payload. Modifiers inside the payload apply only to payload projectiles and not to the carrier. In the guide's example `Double Spell, Spark Bolt w/ Trigger, Damage Plus, Digging Bolt, Speed Up`, Damage Plus affects only the Digging Bolt, and Speed Up (drawn after the payload closed) affects the Spark Bolt. [confirmed: Expert Guide: Draw; Trigger]
- Payload spells' **cast delay is ignored**. Their **recharge-time changes do count**. Spread inside a payload changes the payload's release angle. [confirmed: Trigger; Wands §Cast Delay/Spread]
- **Payload mana** is paid at cast time, as if the payload will fire once, even if the trigger never fires. With Piercing Shot the payload can fire repeatedly at no extra mana. [confirmed: Wands §Mana Max; Piercing Shot]
- **Timer durations:** Spark Bolt w/ Timer 10 f; Spitter w/ Timer 40 f; Energy Orb w/ Timer 100 f; Luminous Drill w/ Timer 4 f. [confirmed: spell infoboxes]
- If the timer is longer than the projectile's lifetime, the payload fires when the projectile dies. [confirmed: Timer]
- **Expiration triggers** fire once, on death (lifetime ends, or the projectile is destroyed). If the projectile was stationary or died on terrain, the payload direction is random. [confirmed: Expiration_Trigger]

### 1.8 Limited-use spells
- Each card has `uses_remaining`, where −1 means unlimited. A charge is used only on casts that produced a projectile. A card at 0 charges is skipped when drawn and stays out of the deck cycle. [confirmed: EA data gun.lua]
- **Spell Refreshers** (one in every Holy Mountain, and some in chests) restore all charges. Spells used as Always Cast are unlimited. The Unlimited Spells perk makes most spells unlimited, but not Healing Bolt and a few others. [confirmed: https://noita.wiki.gg/wiki/Pickups; Wands; Healing_Bolt]

### 1.9 Wand stats and the two starting wands
- Stats:
  - Shuffle (yes/no)
  - Spells/cast: 1–26
  - Cast delay (s)
  - Recharge time (s)
  - Mana max
  - Mana charge speed (per s)
  - Capacity: 1–26 soft cap
  - Spread (degrees; negative cancels positive)
  - Hidden **speed multiplier**: 0.8–1.2, rarely 0.5 or 2.0

  [confirmed: Wands]
- **Starting wand** ("Starter Wand", handgun sprite) [confirmed: Wands, Minä]
  - Stats: non-shuffle, 1 spell/cast, cast delay 0.15–0.25 s, recharge 0.33–0.47 s, mana max 80–130, mana charge 25–40/s, capacity 2–3, spread 0, speed 1.0.
  - Spell: 50% Spark Bolt, 16.7% each Bouncing Burst, Energy Orb ("Energy Sphere") or Spitter Bolt.
  - **1–3 copies** of the chosen spell, depending on capacity.
- **Second starting wand** ("Starter Bomb Wand") [confirmed: Wands, Minä]
  - Stats: **shuffle = yes** (irrelevant with one slot), 1 spell/cast, cast delay 0.05–0.13 s, recharge 0.02–0.17 s, mana max 80–110, mana charge 5–20/s, capacity 1, spread 0.
  - Always holds exactly one spell: 60% Bomb, 10% each TNT (Dynamite), Magic Missile, Unstable Crystal or Firebolt. On the very first run it is always Bomb.
- The player also starts with one **potion** of a random starter material. [confirmed: Minä] The exact starter pool was not captured. Water and the Polymorphine variants are mentioned as possible. [uncertain]
- **Early (Mines) wands:** 88% of Mines wand spawns use one of 17 fixed templates (`wand_001`–`wand_017`). Their ranges: [confirmed: Wands §Pre-made wands]

  | Stat | Range | Typical |
  |---|---|---|
  | Spells/cast | always 1 | — |
  | Cast delay | 0.03–0.43 s | 0.03, 0.05, 0.1, 0.17, 0.22, 0.33, 0.38, 0.43 |
  | Recharge | 0.07–1.50 s | 0.2–0.9 |
  | Mana max | 160–250 | one outlier: 750 mana with 10 charge |
  | Mana charge | 45–55/s | — |
  | Capacity | 2–11 | 3–7 |
  | Spread | −3° to +8° | — |
  | Shuffle | about half the templates | — |

- **Tiers:** wands are tier 1–6 (rarely 10). Wands spawn with spells one tier below their own. The Mines use tier-1 wands with tier-0 spells. There is a 10% chance, rolled repeatedly, for a projectile from a higher tier. [confirmed: https://noita.wiki.gg/wiki/Wand_and_Spell_Tiers]
- **Wand appearance hints:** non-shuffle wands have a rhombic gem; longer wands tend to have more capacity; wider wands tend to have higher cast delay; a wand with 2 tips always has 2 spells/cast. [confirmed: Wands]

---

## 2. Spell data (from wiki infoboxes)

Columns:
- **Mana:** mana drain.
- **Dmg:** displayed damage. P = projectile, X = explosion, F = fire, E = electric, I = ice, S = slice, D = drill.
- **CD:** cast delay modifier (s).
- **RT:** recharge modifier (s).
- **Spr:** spread modifier (degrees).
- **Spd:** speed (px/s).
- **Life:** lifetime (frames).
- **Uses:** charges (∞ = unlimited).
- **R:** explosion radius (px).
- **Dur:** maximum material durability the spell can destroy.

Every row is **[confirmed: https://noita.wiki.gg/wiki/<Spell_Name>]** unless it says otherwise.

### 2.1 Projectiles
| Spell (id) | Mana | Dmg | CD | RT | Spr | Spd | Life | Uses | R | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| Spark Bolt (LIGHT_BULLET) | 5 | P3 | +0.05 | – | −1 | 750–850 | 40±7 | ∞ | 2 | +5% crit; Dur 8 |
| Spark Bolt w/ Trigger (LIGHT_BULLET_TRIGGER) | 10 | P3 | +0.05 | – | – | 750–850 | 40 | ∞ | 2 | payload draws 1 on hit; Dur 8 |
| Spark Bolt w/ Double Trigger | 15 | P3.75 X2.5 | +0.07 | – | – | 750 | 40 | ∞ | 12 | payload draws 2; Dur 9 |
| Spark Bolt w/ Timer (LIGHT_BULLET_TIMER) | 10 | P3 | +0.05 | – | – | 750–850 | 40 | ∞ | 2 | timer 10 f |
| Bouncing Burst (RUBBER_BALL) | 5 | P3 | −0.03 | – | −1 | 750 | 750 | ∞ | 1 | 10 bounces, bounce energy 0.9; no terrain damage |
| Energy Orb (SLOW_BULLET) | 30 | P11.25 X4.5 | +0.10 | – | +3.6 (base 1.7) | slow | 50±7 | ∞ | 15 | digs, Dur 10; gravity 0 |
| Energy Orb w/ Trigger | 50 | P11.25 X4.5 | +0.42 | – | +10 | – | 50 | ∞ | 15 | — |
| Energy Orb w/ Timer | 50 | same | +0.10 | – | +3.6 | – | 50 | ∞ | 15 | timer 100 f |
| Spitter Bolt (SPITTER) | 5 | P7.5 | −0.02 | – | +6 | 600 | 25 | ∞ | 2 | 10 bounces; no terrain damage. Timer variant: 10 mana, timer 40 f. Large: 25 mana, P12.5, 800 px/s, life 30. Giant: 40 mana, P15, 1000 px/s, life 35 |
| Bubble Spark (BUBBLESHOT) | 5 | P5 | −0.08 | – | base 22.9 | 200–300 | 100 | ∞ | 4 | 20 bounces, gravity 0, Dur 10 |
| Magic Missile (ROCKET) | 70 | P75 X105 | +1.00 | – | – | 100 | 360 | 10 | 15 | recoil 120. Large: 90 mana, P100 X117.5, R32, CD +1.5, 8 uses. Giant: 120 mana, P125 X130, R42, CD +2.0, 6 uses |
| Bomb (BOMB) | 25 | X125 | +1.67 | – | – | 60 | 180 (3 s fuse) | **3** | **60** | drops near you; erodes adjacent terrain to powder; does not break Steel, Extremely Dense Rock or Cursed Rock |
| TNT / Dynamite (DYNAMITE) | 50 | X62.5 | +0.83 | – | +6 | 800 | 50 | 16 | 28 | spinning stick; Dur 11 |
| Fireball (FIREBALL) | 70 | F6.25 X50 | +0.83 | – | +4 | 170 | 60 | 15 | 15 | slightly affected by gravity; ignites flammables and gases near it; Stendari use a weaker copy |
| Firebolt (GRENADE) | 50 | P32.5 X47.5 F12.5 | +0.50 | – | base 2.9 | 280 | 500 | 25 | 7 | bounces up to 4× at shallow angles. Large: 90 mana, R25, 20 uses. Giant: R40 |
| Chainsaw (CHAINSAW) | 1 | S12.75 every frame | **sets CD to 0** | −0.17 | +6 | 400 | 1 | ∞ | 3 | Dur 10; hits make the victim spill its blood material |
| Luminous Drill (LUMINOUS_DRILL) | 10 | P10 every frame | −0.58 | −0.17 | – | 1400 | 2 | ∞ | – | **Dur 14** (digs brickwork); destroys gold. Timer variant: 30 mana, timer 4 f |
| Digging Bolt (DIGGER) | 0 | D7.5 | +0.02 | −0.17 | – | 0 (static) | 2 | ∞ | 6 | Dur 10: digs dense rock (10), not extremely dense rock (12) |
| Black Hole (BLACK_HOLE) | 180 | none | +1.33 | – | – | 40 | 120 | 3 | 1 | eats **all solid terrain** in its path, not liquids or gases; pulls objects; gravity 0. Death-trigger variant: 200 mana, CD +1.5 |
| Lightning Bolt (LIGHTNING) | 70 | E25 X125 | +0.83 | – | – | 5400 (no terminal cap) | 2 | ∞ | 35 | recoil 180; electrifies and stuns via conductive materials |
| Death Cross (DEATH_CROSS) | 80 | X75 every 15 f | +0.67 | – | – | – | 68 | ∞ | 25 | piercing, friendly fire, 20 bounces. Giga: 150 mana, X100, R35, 8 uses |
| Arrow (ARROW) | 15 | S5 (+speed-based P) | +0.17 | – | −20 | 650 | 750 | ∞ | 1 | 1 bounce; friendly fire |
| Flamethrower (FLAMETHROWER) | 20 | F11.25 X12.5 | – | – | +4 | 160–170 | 80 | 60 | 8 | — |
| Freezing Gaze (FREEZING_GAZE) | 45 | I10 ×12 projectiles | +0.33 | – | 30° fan | 220 | 25 | 20 | – | freezes liquids and enemies (frozen 50 f = 0.83 s); 10 bounces |
| Healing Bolt (HEAL_BULLET) | 15 | heals 8.75 | +0.07 | – | +2 | 650 | 60 | 20 | 2 | must hit you (friendly fire); Unlimited Spells does not apply |
| Teleport Bolt (TELEPORT_PROJECTILE) | 40 | 0 | +0.05 | – | −2 | 850 | 40 | ∞ | 2 | teleports caster to where it ends. Small variant: 20 mana, 1350 px/s, life 8 |
| Acid Ball (ACIDSHOT) | 20 | P6 | +0.17 | – | – | – | 330 | 20 | 9 | releases acid; digs; friendly fire |
| Concentrated Light (LASER) | 30 | P9.75 X5.5 | −0.37 | – | – | – | 30 | ∞ | 3 | 10 bounces |
| Circle of Water / Oil / Fire | 20 | – | +0.33 | – | – | – | 260 | 15 | – | expanding ring that creates the material |
| Circle of Acid | 40 | – | +0.33 | – | – | – | 260 | 4 | – | very dangerous outside a trigger |
| Sea of Water / Oil / Acid / Alcohol / Flammable Gas / Lava | 140 | – | +0.25 | – | – | – | 300 | 3 | – | fills a large rectangle of open air some distance below the caster |

### 2.2 Projectile modifiers
Each modifier draws one more spell.

| Modifier (id) | Mana | Effect | CD | RT | Other |
|---|---|---|---|---|---|
| Damage Plus (DAMAGE) | 5 | +10 projectile damage (flat, even on 0-damage projectiles) | +0.08 | – | recoil +10 |
| Speed Up (SPEED) | 3 | speed ×2.5 | – | – | — |
| Heavy Shot (HEAVY_SHOT) | 7 | +43.75 projectile damage, speed ×0.3 | +0.17 | – | recoil +50 |
| Add Mana (MANA_REDUCE) | **−30** | refunds 30 mana | +0.17 | – | — |
| Reduce Recharge Time (RECHARGE) | 12 | — | −0.17 | **−0.33** | its CD reduction does nothing inside a trigger payload |
| Homing (HOMING) | 70 | constant force toward enemies | – | – | — |
| Piercing Shot (PIERCING_SHOT) | 140 | passes through entities and terrain; enables friendly fire | – | – | −15 projectile damage; triggers fire repeatedly |
| Explosive Projectile (EXPLOSIVE_PROJECTILE) | 30 | +5 explosion damage, +15 explosion radius | +0.67 | – | speed ×0.75, recoil +30 |
| Fire Trail (FIRE_TRAIL) | 10 | drops falling fire along the path | – | – | — |
| Oil Trail (OIL_TRAIL) | 10 | drops oil; enemies hit get Oiled for 720 f (12 s) | – | – | — |
| Water Trail (WATER_TRAIL) | 10 | drops water | – | – | — |
| Bounce (BOUNCE) | 0 | +10 bounces; impact-exploding spells bounce instead | – | – | — |
| Increase Lifetime (LIFETIME) | 40 | +75 frames lifetime | +0.22 | – | — |
| Reduce Lifetime (LIFETIME_DOWN) | 10 | −42 frames lifetime | −0.25 | – | — |
| Reduce Spread (SPREAD_REDUCE) | 1 | −60° spread | – | – | — |
| Critical Plus (CRITICAL_HIT) | 5 | +15% crit chance | – | – | — |
| Electric Charge (ELECTRIC_CHARGE) | 8 | +2.5 electric damage; electrifies liquids and stuns | – | – | — |
| Freeze Charge (FREEZE) | 10 | +5 ice damage; freezes liquids along the path and enemies hit; drops snow | – | – | — |
| Light (LIGHT) | 1 | light circle ~267 px in diameter; stacks add brightness | – | – | — |

### 2.3 Multicasts
Each multicast draws N spells into the same shot state.

| Spell | Mana | Draw | Spread / pattern |
|---|---|---|---|
| Double Spell (BURST_2) | 0 | 2 | – |
| Triple Spell (BURST_3) | 2 | 3 | – |
| Quadruple Spell (BURST_4) | 5 | 4 | – |
| Double Scatter (SCATTER_2) | 0 | 2 | +10° random spread |
| Triple Scatter (SCATTER_3) | 1 | 3 | +20° |
| Quadruple Scatter (SCATTER_4) | 2 | 4 | +40° |
| Formation – Behind Your Back (I_SHAPE) | 0 | 2 | arc 180°, −5° spread |
| Formation – Above and Below (T_SHAPE) | 3 | 3 | arc 90°, −8° |
| Formation – Pentagon | 5 | 5 | 180°, −12° |
| Formation – Hexagon | 6 | 6 | 180°, −15° |
| Formation – Bifurcated (Y_SHAPE) | 2 | 2 | 45°, −8° |
| Formation – Trifurcated (W_SHAPE) | 3 | 3 | 20°, −5° |

Formation spells spread projectiles evenly and deterministically over their arc. Scatter spells add random spread instead. [confirmed: https://noita.wiki.gg/wiki/Formation, https://noita.wiki.gg/wiki/Tuple_Scatter_Spell, https://noita.wiki.gg/wiki/Tuple_Spell]

---

## 3. Early-biome enemies

Sources:
- HP: [confirmed: per-creature wiki pages and the wiki Cargo table `Enemies`]
- Attacks: [confirmed: wiki Cargo table `Attacks`, https://noita.wiki.gg/wiki/Special:CargoTables/Attacks]
- Damage multipliers (dmgMult): from the `Enemies` Cargo table. 0 = immune, a negative value = heals from that type.
- Gold:
  - **Rule:** gold dropped = **max HP ÷ 2.5**. The first 50 gold drops as 10-gold nuggets. **Trick or accidental kills drop double:** physics objects, explosive props, materials, fire, acid and so on. [confirmed: https://noita.wiki.gg/wiki/Gold]
  - **Check:** Stevari (600 HP) drops 240 gold. [confirmed: Stevari page]
  - The gold figures below are computed with this rule.

**Naming note:** "Zombie" on the wiki redirects to the Factions page. The **Hurtta** (Hound) has entity id `zombie`, and Heikkohurtta has `zombie_weak`. "Heikko zombi / Zombi" in older material therefore means **Hurtta / Heikkohurtta**. The shotgunner is **Haulikkohiisi** (id `shotgunner`). [confirmed: https://noita.wiki.gg/wiki/Hurtta, Haulikkohiisi]

**Weak variants:** the Mines contain weak versions ("Heikko …") with a **brown tint**, less HP and slower reactions. Normal versions are tinted green. [confirmed: https://noita.wiki.gg/wiki/Mines]

| Finnish (English), id | HP | Attacks (displayed damage) | Behaviour | Resist / immune | Bleeds | Gold |
|---|---|---|---|---|---|---|
| Hämis (Spidey), longleg | 2.75 | lunge 6; melee 5–10 | groups of up to 8; eats corpses; Nest has 125 HP | drill ×0.7 | Blood | ~1 nugget |
| Heikkohurtta (Weak Hound), zombie_weak | 5 | lunge 6.25; melee 5–10 | Mines; wanders, slow reactions; glowing red eyes | drill ×0.7 | Blood | 2 |
| Hurtta (Hound), zombie | 12.5 | lunge 6.25; melee 5–10 | Collapsed Mines, Fungal Caverns | drill ×0.7 | Blood | 5 |
| Heikko haulikkohiisi (Weak Shotgun Hiisi) | 9 | 3–4 pellets × 6.75 P; melee 10–17.5 | Mines; slower | extra damage from headshots | Blood | ~4 |
| Haulikkohiisi (Shotgun Hiisi), shotgunner | 22.5 | 3–4 pellets × 6.75 P; shotgun-butt melee 10–17.5 | shoots on sight; Hiisi faction does not attack other Hiisi | headshot multiplier | Blood | 9 |
| Tappurahiisiläinen (Weak Hiisi Miner) | 11 | throws TNT (X50); melee 10–17.5 | Mines; TNT digs terrain and starts fires | explosion ×0.2 | Blood | ~4 |
| Tappurahiisi (Miner Hiisi), miner | 25 | TNT X50; melee | — | explosion ×0.2 | Blood | 10 |
| Kranuhiisi (Hiisi Grenadier), scavenger_grenade | 25 (50 in Jungle) | firebolt-like grenade, P32.5 (page text says 30); melee 10–17.5 | jetpack flyer; aims at your position; blind spot directly above and below | — | Blood | 10 |
| Rynkkyhiisi (Hiisi Gunner), scavenger_smg | 25 (50 in Jungle) | rifle bursts P3.75 + X10 (page text says "4 dmg"); hits briefly disable your levitation | jetpack; accurate from off-screen; can't shoot straight up or down | — | Blood | 10 |
| Snipuhiisi (Hiisi Sniper), sniper | 45 | rifle P25 + X10, massive knockback, red laser sight; melee 10–17.5 | Snowy Depths and Hiisi Base | — | Blood | 18 |
| **Stendari** (Fire Mage), firemage_weak | 80 | weak Fireball X50 + F6.25 (≈25 to the player after the 0.35× explosion multiplier); melee 10–17.5 | walks and jumps high; ignites flammables near it; biggest threat in the Mines | **fire immune** (×0); explosion ×0.4 | **Lava** | 32 |
| Liekkiö (Fire Spirit), fireskull | 35 | lunge 6.25; melee 5–10 | flying flaming skull; when hurt it scatters **gunpowder**, which blows up into many small explosions | — | Gunpowder | 14 |
| Heikko limanuljaska (Weak Toxic Slime) | 7.5 | slimeball P6.25 + X7.5 | flying | toxic immune (radioactive ×0) | Toxic Sludge | 3 |
| Limanuljaska (Toxic Slime), slimeshooter | 18.75 | slimeball P6.25 + X7.5, leaves a toxic sludge trail | flying, long range, chases you | toxic immune | Toxic Sludge | 7.5 |
| Heikko happonuljaska / Happonuljaska (Acid Slime), acidshooter | 10 / 25 | acid bubble P6 that bursts into acid; melee 5–10 | flying; bubbles can be shot down | toxic immune; drill ×0.5 | **Acid** (dissolves terrain) | 4 / 10 |
| Heikko äitinuljaska / Äitinuljaska (Mother Slime) | 50 / 125 | bite 5–10; **explodes into acid on death (X75)** | slow flyer; spawns 3 Limanuljaska when low on HP | — | Acid | 20 / 50 |
| **Ukko** (Thunder Mage), thundermage | 125 (375 in the Vault) | Thunder Charge E37.5 + X45 (telegraphed); melee | hovers or walks; crackling sound; passive if you hold an Ukkoskivi | **fire immune**; **heals from electricity** (×−1); explosion ×0.5 | Diamond | 50 |
| Märkiäinen (Swampling) | 125 | 2× Cursed Sphere P15, which also summon a rain or thunder cloud | rare; slow | fire immune | Swamp | 50 |
| Lepakko (Bat) | 12.5 | lunge 6.25 | Coal Pits; flying swarms | — | **Slime** (slows you) | 5 |
| Suurlepakko (Large Bat) | 87.5 | lunge 12.5; throws Lepakko at you | Coal Pits | — | Slime | 35 |
| Pikkutulikärpänen (Lesser Firefly) | 5 | attacks not captured [uncertain] | Coal Pits; flying | fire immune | **Lava** | 2 |
| Suurtulikärpänen (Greater Firefly) | 25 | attacks not captured [uncertain] | — | fire immune | Lava | 10 |
| Firefly Hive (Nest) | 125 | — | spawns fireflies; hive spawns drop no gold | — | Lava | – |
| Rotta (Rat) | 5 | melee 5–10 | draws aggro from other enemies | — | Blood | 2 |
| Konna / Jättikonna (Toad / Big Toad) | 7.5 / 50 | lunge 10 / tongue 10 | sits still, then lunges | Big Toad: slice ×0.2, fire ×0.5 | Blood | 3 / 20 |
| Tulihiisi (Fire Hiisi) | 50 | throws cocktails, X62.5 + liquid fire | — | fire immune; explosion ×0.4 | Blood | 20 |
| Sähikäismenninkäinen (Firecracker Goblin) | 25 | glitter bombs X25 | Coal Pits; jumps around | — | Blood | 10 |
| Miinankylväjä (Hiisi Mine Thrower) | 75 | sticky proximity mines X100; pellets P6.75 | flying | melee ×0.3, projectile ×0.6, explosion ×0.6, electric and fire ×1.5 | Blood | 30 |
| Jäätiö (Ice Spirit), iceskull | 37.5 | iceball X25 + I7.5 (freezes you); dash; retaliates with 12 projectiles | constantly emits freezing vapour | ice immune | Freezing Liquid | 15 |
| Sähkiö (Thunder Spirit) | 90 | ball lightning E15 + X5.25; electric aura | flying skull | electricity and fire immune | Freezing Liquid | 36 |
| Pakkasukko (Old Man Winter), icemage | 125 | iceball X50 + I8.75, leaves freezing liquid | freezes liquids around itself | **heals from ice**; fire ×1.5; explosion ×0.3 | Snow | 50 |
| Hiidenkivi (Rock Giant) | 150 | throws homing rock spirits that explode into freezing vapour; melee | slow | explosion ×0.2; fire ×0; heals from ice | Freezing Liquid | 60 |
| KK-Tankki (Tank) | 112.5 | minigun P3.75 + X10; grenade P32.5 at close range; **explodes on death X75** | Snowy Depths and Hiisi Base; electrifies water | fire and freeze immune; slice ×0.1; projectile ×0.5; **electric ×2** | Oil | 45 |
| Torjuntalaite (Turret) | 75 | 2× laser P25 + X6.25; explodes on death (X50) | stationary; fires horizontally only | fire and freeze immune | Oil | 30 |
| Toimari (Hiisi Leader) | 100 | 2× grenade P12.5 + X12.5 | — | fire ×0.1; melee ×0.3 | Blood | 40 |
| **Stevari** (Holy Mountain guard) | 600 | 2× accelerating orb P20 + X25; short-range sparks P20 | spawns when you anger the gods; shield deflects projectiles | fire immune; explosion ×0.2; electric ×0.5 | Bone Dust | 240 |

**Biome spawn lists** [confirmed: biome pages]

| Biome | Common | Uncommon | Rare |
|---|---|---|---|
| Mines | Hämis, Weak Hound, Weak Miner Hiisi, Weak Shotgun Hiisi, Weak Toxic Slime | Stendari, Liekkiö, Weak Mother Slime, Weak Acid Slime | Swampling, Alchemist, Ukko, Ghost, Worm |
| Collapsed Mines | Toxic Slime, Frog, Big Toad, Hound, Miner Hiisi, Shotgun Hiisi, Fire Hiisi | Stendari, Liekkiö, Mother Slime, Acid Slime, Swampling | Worm, Ghost |

- **Coal Pits:** Bat, Miner Hiisi, Shotgun Hiisi, Lesser Firefly, Rat, Firecracker Goblin, Toxic Slime, Greater Firefly, Large Bat, Fire Spirit, Firefly Hive, Hiisi Alchemist, Fire Hiisi, Mine Thrower.
- **Snowy Depths:** Rat, Toxic Slime, Ice Spirit, Shotgun Hiisi, Sniper, Grenadier, Gunner, Tank, Large Fish, Ukko, Rock Giant, Thunder Spirit, Mine Thrower, Hiisi Leader, Rocket and Laser Tanks, Old Man Winter, Worms.
- **Hiisi Base:** Shotgun, Sniper, Grenadier, Gunner and Miner Hiisi, laser drone, Hiisi Healer, Mine Thrower, Leader, Tank, Turret, Hiisi Bomber, Hiisi Chef.
- **Underground Jungle:** HP of most enemies doubles; giant spiders (Lukki) dig through terrain.

**Weak-to-strong scaling:** many Hiisi have more HP in the Jungle and the Vault (for example Kranuhiisi 25 → 50).

**Rules of thumb** [confirmed: Status Effects; Creatures pages]
- Enemies that are **on fire panic and do not attack**. Robots don't burn.
- A **Frozen** creature hit by any melee attack (a kick, say) loses 50% of its current HP, or **dies outright** if it is at 25% HP or less. For non-player creatures a melee hit simply kills.

---

## 4. Materials and alchemy

Sources: [confirmed: https://noita.wiki.gg/wiki/Materials, wiki Cargo `Materials` table, https://noita.wiki.gg/wiki/Table_of_Alchemical_Reactions (Cargo `Reactions`), https://noita.wiki.gg/wiki/Status_Effects]

- **Density** decides layering: denser liquids sink.
- **Durability** is the maximum "dig level" a spell or explosion needs to destroy the material.
- **Hardness** is per-pixel HP, which explosion rays use up.

### 4.1 Material properties

| Material (id) | Type | Density | Hardness / Durability | Burns? | Freezes / melts to | Stain (contact) | Drink effect |
|---|---|---|---|---|---|---|---|
| Water (water) | liquid | 4.0 | – | no | freezes to ice_static; boils to steam | **Wet** | – |
| Chilly Water (water_ice) | liquid | 3.5 | – | no | freezes to ice | Wet | Chilly (2 s) |
| Oil (oil) | liquid | **1.0** (floats on everything) | – | **yes** | – | **Oiled** | Poisoned 5 s + Food Poisoning 20 s |
| Blood (blood) | liquid | 4.1 | – | no | freezes to blood ice | **Bloody** | – (Vampirism: heals) |
| Toxic Sludge (radioactive_liquid) | liquid | 3.0 | – | no | freezes to toxic ice | **Toxic** | Poisoned 10 s |
| Acid (acid) | liquid | 2.9 | – | no | freezes to frozen acid | 7.5 HP/s per pixel touched | Poisoned 30 s |
| Lava (lava) | liquid | 6.0 | – | no (but ignites things) | cools to lava rock | **On Fire**; 4.5 HP/s per pixel | Internal Fire 10 s |
| Whiskey (alcohol) | liquid | 3.5 | – | listed burnable=0, but its fumes burn (see reactions) | – | **Alcoholic** | **Drunk** (30 s) |
| Slime (slime) | liquid | 5.0 | – | no | freezes | **Slimy** (−15–40% speed) | Food Poisoning 20 s |
| Healthium (magic_liquid_hp_regeneration) | liquid | 5.53 | – | no | – | Regeneration | Regeneration 7.5 s |
| Concentrated Mana (…mana_regeneration) | liquid | 4.92 | – | no | – | Mana Regeneration (4× wand recharge) | Mana Regeneration 20 s |
| Teleportatium (…teleportation) | liquid | 4.21 | – | yes | – | Teleportitis | Teleportitis 5 s |
| Polymorphine (…polymorph) | liquid | 4.14 | – | no | – | Polymorph (sheep) | Polymorph 20 s |
| Berserkium (…berserk) | liquid | 2.41 | – | no | – | Berserk (2× damage and blast radius) | Berserk 15 s |
| Smoke (smoke) | gas | 1 | – | no | lifetime 350 f | – | – |
| Steam (steam) | gas | 1 | – | no | lifetime 1000 f; condenses on solids into water | – | – |
| Flammable Gas (acid_gas) | gas | 2 | – | **yes** | lifetime 450 f | – | – |
| Toxic Gas (radioactive_gas) | gas | 2 | – | no | lifetime 450 f | 1.5 HP/s per pixel | – |
| Fire (fire) | fire | 1 | – | – | – | On Fire | – |
| Sand (sand) | powder | 6 | 800 / Dur 4 | no | – | – | – |
| Snow (snow) | powder | 8 | 1000 / – | no | melts to water | – | Chilly 5 s |
| Gunpowder (gunpowder, gunpowder_explosive) | powder | 7 | 1000 | **yes** (explosive variant blows up) | – | – | Poisoned + Food Poisoning |
| Coal (coal) | powder | 6 | 1000 / **Dur 8** | yes | – | – | – |
| Soil (soil) | powder | 6 | 2000 / Dur 10 | no | – | – | – |
| Wood (wood / wood_static) | solid | 6 / 11 | 2000–3000 / Dur 9–10 | **yes** | – | – | – |
| Ice (ice_static / ice powder) | solid / powder | 10 / 6 | 30000 / 5000 | no | melts to water; shatters | – | – |
| Ground (sand_static) | solid | 10 | 19000 / Dur 10 | no | – | – | – |
| Rock (rock_static) | solid | 10 | 100000 / **Dur 10** | no | – | – | – |
| Dense Rock (rock_hard) | solid | 10 | 200000 / **Dur 10** | no | – | – | – |
| Extremely Dense Rock (rock_hard_border) | solid | 10 | 200000 / **Dur 12** | no | – | – | – |
| Brickwork (templebrick_static) | solid | 10 | **1,000,000 / Dur 14** | no | – | – | – |
| Brick Wall (brick) | solid | 50 | 4000 | yes | – | – | – |
| Steel (steel_static) | solid | 10 | 130000 / **Dur 12** | no | melts to molten metal; conductive | – | – |
| Metal (metal) | solid | 8 | 5000 | no | melts; conductive | – | – |
| Glass (glass_static) | solid | 10 | 30000 | no | breaks into brittle glass; loose glass melts | – | – |
| Gold powder (gold) | powder | 9 | 8000 / Dur 12 | no | melts to molten gold; conductive | collected 1 gold per pixel on touch | – |
| Gold Vein (gold_static) | solid | 11 | 2000 / Dur 10 | no | – | – | – |
| Gold nugget (gold_box2d) | rigid body | 8 | 30000 / Dur 14 | no | – | picked up whole | – |
| Concrete (concrete_static) | solid | 10 | 30000 | no | – | – | – |

Notes:
- Conductive materials carry electric shocks and stuns: water, blood, toxic sludge, acid, lava, slime, the magic liquids, steel, metal, gold.
- Acid dissolves powdered gold but not nuggets. Concentrated Mana vaporises every metal, including gold nuggets, into steam. Luminous Drill and Black Hole destroy gold. [confirmed: https://noita.wiki.gg/wiki/Gold]

### 4.2 Key reactions
Reactions are written as `reagents → products (rate)`. Square brackets mean a material tag. [confirmed: Cargo Reactions]

**Water, steam, lava**
- `[lava] + water → rock + steam (80)`. Lava + chilly water gives the same. This is how water cools lava into rock.
- `[fire] + water → steam (20)`: fire evaporates water.
- `steam + [static] → water (3)`: steam condenses on solids.

**Fire and melting**
- `[lava] + [burnable] → fire (8)`. `[lava] + gunpowder → fire (8)`. Lava ignites burnable materials and gunpowder.
- `[fire] + [burnable_fast] → fire (40)`. `coal + fire → fire + air (20)`. Burning consumes the material.
- `[fire] / [lava] + [meltable] → [meltable]_molten (+ smoke)`. `[molten_metal] + water → metal sand + steam (50)`.
- `[fire] + snow → steam (20)` or `→ water (80)`. `[fire] + ice → water (40)`. Snow and ice melt.
- `ice + air → water (1)`: very slow melting in air.

**Freezing**
- `freezing liquid + [freezable] → ice (90)`.
- `water + ice → chilly water (1)`, then `chilly water + ice → ice (10–35)`. Freezing spreads through water.
- Freeze Charge and Freezing Gaze freeze liquids directly.

**Toxic sludge**
- `water + toxic sludge → water (13)`: **water purifies toxic sludge.** `snow + toxic sludge → water`.
- `[lava] + [radioactive] → toxic rock + toxic gas (70)`.

**Acid**
- `[acid] + [corrodible] → acid + flammable gas (50)`: acid eats most terrain and gives off flammable gas.
- `acid + air → flammable gas (10)`: acid slowly fumes.

**Whiskey**
- `whiskey + air → whiskey fumes (4)`.
- `whiskey + [fire] → fire + whiskey fumes (60)`. `[fire] + whiskey fumes → whiskey fumes (20)`. The fumes burn.
- `whiskey + frog meat → Berserkium (10)`.

**Slime, blood, poison**
- `[fire] + [slime] → slime mist (70)`. `water + [slime] → slime mist (10)`: water effectively removes slime.
- `blood + poison → slime + smoke (10)`.
- `[lava] + poison → poisonous rock + poison gas`.

**Magic liquids**
- `Concentrated Mana + water → Concentrated Mana (25)`: converts water. `Concentrated Mana + [meltable_metal] → steam (25)`.
- `Teleportatium + whiskey → Unstable Teleportatium (21)`.
- `Polymorphine + toxic sludge → Chaotic Polymorphine (15)`.

**Soil**
- `water + soil → mud (5)`. `[lava] + mud → ground + steam`.

**Evaporation**
- `[evaporable] + air → air (15)` and `[evaporable_fast] + air → air (45)`. Tagged liquids evaporate.
- **Gunpowder:** burnable. Ignition comes from fire, lava or explosions, and `gunpowder_explosive` detonates. Liekkiö bleed unstable gunpowder. [confirmed: Materials cargo; Liekkiö page]

### 4.3 Stains and status effects on the player
- All status effects are at full strength as long as at least 1 s or 1% of the stain remains. Water is the ideal wash. The Repelling Cape perk sheds stains faster while you move. [confirmed: https://noita.wiki.gg/wiki/Status_Effects]

**Stains** [confirmed: Status Effects]

| Status | Effect |
|---|---|
| **Wet** | Prevents ignition; used up by contact with fire. You take more electric damage (no invulnerability frames from electric stun). |
| **Bloody** | Prevents ignition; increases your crit chance. |
| **Oiled** | No traction (you slide down slopes); you stay On Fire much longer. Wet or Bloody plus Oiled: you ignite in fire but go out as soon as you leave it. |
| **Slimy** | Prevents ignition; −15% to −40% movement speed, depending on stain amount. |
| **Alcoholic** (whiskey stain) | More spread on your spells; you ignite more easily. |
| **Toxic** (sludge) | Prevents ignition; drains 2% of max HP per tick, **but cannot kill on its own** (HP floors at some percentage). |
| **Jarated** (urine) | Wet-like; affected enemies take +20% crit chance. |

**Other status effects** [confirmed: Status Effects]

| Status | Effect |
|---|---|
| **On Fire!** | Lose **2% of max HP per second**. Burning creatures move 15% faster and enemies don't attack. Caused by fire, lava or molten materials. Entering nearly any liquid, even oil, puts you out. |
| **Drunk** (drinking whiskey) | More spread. |
| **Poisoned** | 2% of max HP per tick, non-lethal in a normal game (lethal and tripling with each NG+). |
| **Frozen** | Can't move. |
| **Stunned** (electric) | Can't move. |
| **Regeneration** (Healthium) | Heals 10% of max HP per second. |
| **Mana Regeneration** | Wand mana recharges 4× faster. |
| **Polymorph** | You become a sheep. |
| **Teleportitis** | Random teleports toward the cursor. |
| **Berserk** | 2× damage and 2× blast radius. |

### 4.4 Contact damage from materials (to the player)
- Damage is per frame, **per pixel of contact**. Full submersion is 85 pixels. [confirmed: https://noita.wiki.gg/wiki/Materials §Player damage; Minä]

| Material | per frame per pixel | HP/s per pixel | HP/s fully submerged |
|---|---|---|---|
| Acid | 0.125 | 7.5 | 637.5 |
| Lava | 0.075 | 4.5 | 382.5 (plus On Fire) |
| Poison / Toxic Gas / Toxic Rock / Toxic Ice | 0.025 | 1.5 | 127.5 |
| Freezing Liquid | 0.0225 | 1.35 | 114.75 |
| Freezing Vapour | 0.015 | 0.9 | 76.5 |
| Healium (healing gas) | −0.125 | heals | heals |

- Toxic Sludge has no direct contact damage in this table. It hurts through the Toxic stain (and Poisoned if you drink it). Fire hurts through On Fire. [confirmed: same table]
- The player can drown. An oxygen meter is implied by the Breathless perk, but its duration was not captured. [uncertain]

---

## 5. Player (Minä)

**Health and damage taken**
- **HP 100** (internal 4). Crit resistance 1 (the player can't be critically hit). Melee is the player's only natural attack. Blood is "fading" blood. [confirmed: https://noita.wiki.gg/wiki/Min%C3%A4]
- **Damage multipliers:** 1.0× for everything except **explosion 0.35×** and holy 1.5×. [confirmed: Minä]
- **Fall damage: none.** Fall damage is disabled for the player and most creatures. Only fish take it. Very fast travel ("meteoring") instead causes explosions on impact. [confirmed: https://noita.wiki.gg/wiki/Damage_Types §Fall; Minä]
- **Healing:**
  - There is **no natural regeneration**.
  - **Holy Mountain heart:** full heal plus **+10 max HP**.
  - **Extra Max HP** pickup (found in biomes and chests): **+25 max HP** with **no heal**. The large version gives +50.
  - Healing Bolt: +8.75 per hit.
  - Healthium: 10% of max HP per second.
  - Vampirism perk: drinking blood heals 4 HP per 10% of a flask.
  - Blood-money nuggets (from certain perks).
  - **Extra Health perk:** +50% max HP.

  [confirmed: https://noita.wiki.gg/wiki/Healing; Perks Cargo]

**Movement and levitation**

Raw component values from EA data `player.xml`. The field names are from the engine. Treat the exact meaning of each field as [uncertain].

| Field | Value | Meaning |
|---|---|---|
| `run_velocity` | 154 | — |
| `velocity_min_x` / `velocity_max_x` | −52 / +52 | horizontal speed clamp (px/s) |
| `accel_x` | 0.15 | — |
| `jump_velocity_y` | −95 | — |
| `jump_velocity_x` | 56 | — |
| `pixel_gravity` | 350 | — |
| `velocity_max_y` | 350 | max fall speed |
| `velocity_min_y` | −200 | — |
| `fly_velocity_x` | 52 | — |
| `fly_speed_max_up` | 95 | — |
| `fly_speed_max_down` | 85 | — |
| `fly_speed_mult` | 20 | — |
| `fly_speed_change_spd` | 0.25 | — |
| **`fly_time_max`** | **3.0** | **≈3 s of levitation** |
| `fly_recharge_spd` | 0.4 | slow refill while airborne and not flying |
| `fly_recharge_spd_ground` | 6 | fast refill on the ground (≈0.5 s from empty) |

[confirmed: EA data https://github.com/defektu/noita-early-access-data/blob/HEAD/data/entities/player.xml]

- Levitate is bound to W/Space and Kick to F. Rynkkyhiisi hits temporarily disable levitation. [confirmed: https://noita.wiki.gg/wiki/Guide:_How_to_Play; Rynkkyhiisi]
- Perk changes to movement [confirmed: Perks Cargo; Strong_Levitation]:
  - **Faster Levitation:** +75% levitation speed and +40% fall speed per stack.
  - **Strong Levitation:** doubles the levitation meter and doubles the time needed on the ground to refill it.
  - **Faster Movement:** about +40% horizontal speed.

**Kick**
- Deals **1 melee damage**. Pushes props with force 12. `PLAYER_KICK_FORCE` = 50 in the magic numbers. [confirmed: https://noita.wiki.gg/wiki/Never_Skip_Leg_Day; Modding: Magic Numbers]
- **Never Skip Leg Day perk:** +60 damage, force ×1.7, +250 knockback, and kicks can crack ice. [confirmed: Never_Skip_Leg_Day]
- **Parry:** a well-timed kick reflects melee attacks.
- Kicking **Frozen** enemies kills them.
- Kicking a barrel or crate into an enemy counts as a **trick kill** and gives 2× gold. [confirmed: Damage_Types; Guide: How to Play]

**Gold**
- Gold powder is collected at 1 gold per pixel on touch. Nuggets are worth 10, 50, 200 or 1000 (plus idols and statues).
- **Nuggets despawn** after a while if uncollected. They **blink white, faster and faster**, before vanishing. The Gold is Forever perk stops this. [confirmed: https://noita.wiki.gg/wiki/Gold]
- The `LifetimeComponent` of a gold nugget is **900 frames (15 s)**. [confirmed: EA data goldnugget.xml] The current value may differ. [uncertain]

**Potions (flasks)** [confirmed: https://noita.wiki.gg/wiki/Potions]
- **Capacity: 1000 material units.** Enemy-thrown special flasks hold 500, start full at 200%, and can't be refilled above 100%.
- **Fill:** touch the flask's neck to a liquid.
- **Spray (left mouse):** pours toward the cursor, faster when the flask is above 100%. A mixed flask sprays its materials in equal shares.
- **Throw (right mouse):** the flask flies like a grenade and usually shatters. A red ❌ on the arc marks a guaranteed break. Gentle drops or throws into liquid may survive.
- **Shatter:** releases 20% of the remaining contents. Flasks can also be punctured and leak.
- **Drink:** right-click in the toolbar. Each sip consumes **10% of every material** in the flask and applies that material's ingestion effect. Drinking also fills the stomach.
- Mixed contents react inside the flask. For example, water plus toxic sludge eventually becomes all water.
- **Eating:** stand on edible material and press S. [confirmed: How to Play]

---

## 6. Biomes and the Holy Mountain

### 6.1 Main path, surface to Laboratory
Depths are **derived** by decoding the EA data `data/biome_impl/biome_map.png` at the map's centre column. Each map pixel is a 512 × 512 world chunk, with y=0 taken as the top of the Mines. Expect about ±512 px of error, and modern builds may differ slightly. [uncertain, derived]

The order of biomes is [confirmed: https://noita.wiki.gg/wiki/Biomes]. The world is **35,840 px wide** (70 chunks). [confirmed: Biomes]

| # | Biome | Approx. y (px) | Feel / palette | Source |
|---|---|---|---|---|
| – | Surface: Forest; spawn on a mountain with a hall into the Mines | −512 to 0 | green forest, blue sky; Desert east, Snowy Wasteland and Lake west | — |
| 1 | **Mines** (coalmine) | 0 to ~1,000 | brown soil and rock; wooden beams and shafts; coal piles; oil barrels; explosive boxes and lamps; small pools of water, oil and **toxic sludge**; gold flecks; fire is a frequent hazard | [confirmed: Mines] |
| HM1 | Holy Mountain | ~1,000–1,500 | — | — |
| 2 | **Coal Pits** (excavationsite) | ~1,500–2,550 | open, winding caves of coal veins and grey rock; wooden beams; many gold deposits; water and toxic pools; gunpowder vats; sea mines | [confirmed: Coal Pits] |
| HM2 | Holy Mountain | ~2,550–3,050 | — | — |
| 3 | **Snowy Depths** (snowcave) | ~3,050–4,600 | big open caverns of snow and frozen rock linked by fragile ice; water bodies; metal machinery and pipes leaking flammable gas; purple **propane tanks**; very open, so ranged enemies shoot from off-screen; small 4-spell shop | [confirmed: Snowy Depths] |
| HM3 | Holy Mountain | ~4,600–5,100 | — | — |
| 4 | **Hiisi Base** (snowcastle) | ~5,100–6,150 | steel corridors cut through ice and rock; snow and ice piles hiding explosives; basins of unstable polymorphine or toxic sludge; gunpowder crates; shield generators; fluorescent lamps that shock; lava in glass basins; side spell shop | [confirmed: Hiisi Base] |
| HM4 | Holy Mountain | ~6,150–6,650 | — | — |
| 5 | **Underground Jungle** (rainforest) | ~6,650–8,200 | green, soil-heavy; trees that become rigid bodies; barren soil that bursts into flame; poison plant buds; drop shafts; tanky enemies | [confirmed: Underground Jungle] |
| HM5 | Holy Mountain | ~8,200–8,700 | — | — |
| 6 | **The Vault** | ~8,700–10,250 | industrial lab with steel, pipes and robots | [uncertain] |
| HM6 | Holy Mountain | ~10,250–10,750 | — | — |
| 7 | **Temple of the Art** (crypt) | ~10,750–12,800 | dark brick temple; gate to the Wizards' Den | [uncertain detail] |
| HM7 | final Holy Mountain (entered via a red portal) | ~12,800–13,300 | — | — |
| 8 | **The Laboratory** (with the Volcanic Lake) | ~13,300+ | lava; final boss area | [uncertain detail] |

Side areas: Collapsed Mines (west of the Mines; more steel; tighter), Lava Lake (east of the Mines), Fungal Caverns (west of the Coal Pits), Dark Cave, and the Snowy Chasm. [confirmed: Biomes; Collapsed_Mines]

### 6.2 Holy Mountain rules [confirmed: https://noita.wiki.gg/wiki/Holy_Mountain]
- **Location and structure:** there is one between each pair of main-path biomes, 7 in the main world. It is built from **Brickwork** (Dur 14), which resists explosions. [confirmed: Holy Mountain; Perks]
- **Entry:** portals that only the player can enter. They are powered by **Teleportatium** in an eye-shaped basin below them; drain it and the portal turns off. 10% of basins are flooded with blood, water, sludge, oil or lava.
- **Contents:**
  - 1 Full Health Regeneration (full heal plus +10 max HP)
  - 1 Spell Refresher
  - 2 water pools (one with fish)
  - a **shop** selling spells or wands
  - a worm-repelling crystal room
  - a **perk altar** (several perks, take 1, the rest vanish)
  - a perk **reroll machine** (200 gold, doubling each use)
  - 2 training-dummy statues that show damage numbers
- **Shop layout:** the exact count and layout (for example 2 rows of spells or one row of wands) was not captured. [uncertain]
- **Perks offered:** 3 is the default; the Extra Perk perk adds one more. [confirmed: Perks; perk Cargo]
- **Wand editing** works only inside an active Holy Mountain, or anywhere with the **Tinker with Wands Everywhere** perk or while holding Sauvan Ydin. [confirmed: Wands; https://noita.wiki.gg/wiki/Tinker_with_Wands_Everywhere]
- **Collapse:** passing the slanted exit tunnel collapses the ceiling over the perk altar and blocks the way back. The area becomes cursed for 1240 frames (~21 s) at **2 curse damage per second** (41 total). A collapsed Holy Mountain **no longer allows wand editing**. Teleporting or polymorphing past the trigger avoids the collapse.
- **Angering the gods:** damaging the protected brickwork around the interior shows "You have angered the gods" and spawns a hostile **Stevari** (600 HP) above the altar. Once angered, a Stevari spawns in **every later Holy Mountain**. After killing 3 Stevari ("The gods are enraged"), **Skoude** spawn instead. The **Peace with Gods** perk stops this and makes them friendly. Damage done after the collapse is safe.
- **Pacifist chest:** clearing a biome without kills spawns a "Pacifist Chest" above the altar.

### 6.3 Common perks [confirmed: wiki Cargo `Perks` / https://noita.wiki.gg/wiki/Perks]

| Perk | Effect |
|---|---|
| Critical Hit + | +10% crit chance for all spells |
| Extra Health | +50% max HP, and current HP by the same amount |
| Extra Life | on death, revive at 100 HP once per stack (30 f invulnerability) |
| Saving Grace | a lethal hit leaves you at 1 HP, if you had more than 1 |
| Stainless Armour | −50% damage taken while you have no stain |
| Fire / Explosion / Toxic / Electricity / Melee Immunity | no damage of that type. Toxic Immunity also blocks the Toxic stain. Melee Immunity makes many enemies harmless |
| Freeze Field | nearby liquids freeze; fire immunity |
| Oil Blood | you bleed oil; fire immunity |
| Electricity | electric immunity, but metal and liquids around you are constantly electrified |
| Exploding Corpses | enemies explode on death; you become explosion-immune |
| Faster Levitation / Strong Levitation / Faster Movement | see §5 |
| Breathless | can't drown; +20% speed in liquids |
| Repelling Cape | stains drop off quickly while you move |
| Gold is Forever | nuggets never despawn |
| Attract Gold | nuggets fly to you |
| Trick Blood Money | trick kills drop healing blood-money nuggets |
| Vampirism | −25% max HP; drinking blood heals |
| Glass Cannon | 5× spell damage and 5× explosion size; max HP capped at 50 |
| Concentrated Spells | lower spread, more damage, more cast delay |
| Homing Shots | weak homing on all projectiles |
| Unlimited Spells | most limited spells become unlimited |
| Always Cast | adds a random AC to the wand in hand (max 4) |
| No More Shuffle | removes shuffle from wands |
| Tinker with Wands Everywhere | wand editing anywhere |
| Extra Perk | +1 perk in each future Holy Mountain |
| Extra Item in Holy Mountain | +1 shop item |
| Peace with Gods | see §6.2 |
| More Love | enemies are friendlier to each other and to you |
| Invisibility | invisible; stains, casting, kicking and damage reveal you briefly |
| Revenge Explosion / Tentacle / Bullets | retaliate when damaged (+20–25% resistances) |
| Projectile Repulsion Field | repels most projectiles |
| Lukki Mutation | spider legs that stick to any surface, but no free levitation |
| Never Skip Leg Day | see §5 |

Perk stacking: unstackable perks leave the pool once picked. Most stackable perks cap at 128. [confirmed: Perks]

---

## 7. Explosions, terrain and digging

- **Durability gate:** each projectile or explosion has a **maximum durability it can destroy** (`max_durability_to_destroy`). Materials above that value are untouched. [confirmed: https://noita.wiki.gg/wiki/Materials §Durability]

| Durability | Example materials | Spells that destroy up to this level |
|---|---|---|
| none (cannot destroy) | — | Bouncing Burst, Spitter Bolts |
| 4 | Sand | — |
| 8 | Coal, Concrete | Spark Bolt (and Timer), Bouncy Orb, Bullet |
| 9 | static Meat; Wood (9–10) | Spark Bolt w/ Double Trigger |
| 10 | Rock, **Dense Rock**, Soil, Ground, Gold Vein | Bubble Spark, Buckshot, **Energy Orb**, **Chainsaw**, **Digging Bolt**, Digging Blast, Propane Tank, Mine, Pipe Bomb, Fireball, Firebolt (and Giant), Magic Missile (and Giant), Firebomb, Meteor, Slimeball, Death Cross |
| 11 | Rusted Steel | **TNT/Dynamite**, Giga Death Cross, Glowing Lance |
| 12 | **Extremely Dense Rock**, **Steel**, gold powder | Nuke, Holy Bomb |
| 13 | Dense Steel | — |
| 14 | **Brickwork**, Cursed Rock | **Luminous Drill**, Giga Nuke, Giga Holy Bomb, Lance, Plasma Cutter |

- **Bomb** (R60, X125) clears most terrain in a large radius and turns terrain next to and above the blast into a **powder version** of the same material. It does **not** destroy Steel, Extremely Dense Rock or Cursed Rock. [confirmed: https://noita.wiki.gg/wiki/Bomb]
- **Hardness and ray energy:** an explosion casts rays out to its radius. Each ray has a "ray energy" budget that is spent on the per-pixel HP (hardness) of the material it passes through. Soft coal (HP 25,000) erodes much further than rock (HP 100,000). For example, TNT has 30× the ray energy of Unstable Crystal: TNT clears rock to its full 28 px radius, while Crystal removes only 2–3 px. [confirmed: Materials §Hardness]
- **Spark Bolt `rayEnergy`:** 400,000. [confirmed: Spark Bolt infobox]
- **Digging tools** [confirmed: individual spell pages; https://noita.wiki.gg/wiki/Digging]:
  - **Chainsaw:** Dur 10, radius 3 at the wand tip, 1 mana, −0.17 s recharge, sets cast delay to 0. The standard fast early digger.
  - **Digging Bolt:** Dur 10, radius 6, free, −0.17 s recharge, static 2-frame sphere at the wand tip; also deals 7.5 drill damage. Digging Blast has twice the terrain damage but does not hurt creatures.
  - **Luminous Drill:** Dur 14 (digs brickwork, so beware the Holy Mountain), 1400 px/s beam with a 2-frame life, −0.58 s cast delay, −0.17 s recharge. **Destroys gold.**
  - **Black Hole:** deletes every solid in its path regardless of durability. Liquids and gases are left. 3 uses.
  - **Energy Orb:** Dur 10 explosion (R15). A common early digger.
- **Rigid bodies:** props such as crates, barrels and lamps, plus trees and nuggets, are physics objects. Damaging terrain can turn chunks into falling debris. Debris and kicked props that kill enemies count as **trick kills** (2× gold). [confirmed: Gold; Underground_Jungle; How to Play]
- **Brickwork** (Holy Mountain walls) resists explosives. It can be damaged by acid, worms, Luminous Drill, Black Hole and similar, and doing so angers the gods. [confirmed: Holy Mountain]

---

### Key source URLs
- Draw, deck, wrap and reload: https://noita.wiki.gg/wiki/Expert_Guide:_Draw
- Wand stats and starting wands: https://noita.wiki.gg/wiki/Wands
- Triggers: https://noita.wiki.gg/wiki/Trigger · https://noita.wiki.gg/wiki/Timer · https://noita.wiki.gg/wiki/Expiration_Trigger
- gun.lua (EA): https://github.com/defektu/noita-early-access-data/blob/HEAD/data/scripts/gun/gun.lua
- player.xml (EA): https://github.com/defektu/noita-early-access-data/blob/HEAD/data/entities/player.xml
- Spells: https://noita.wiki.gg/wiki/Spells (individual pages as named)
- Creatures and attacks: https://noita.wiki.gg/wiki/Creatures · https://noita.wiki.gg/wiki/Special:CargoTables/Attacks
- Materials, reactions and status effects: https://noita.wiki.gg/wiki/Materials · https://noita.wiki.gg/wiki/Table_of_Alchemical_Reactions · https://noita.wiki.gg/wiki/Status_Effects
- Player, potions, healing and gold: https://noita.wiki.gg/wiki/Min%C3%A4 · https://noita.wiki.gg/wiki/Potions · https://noita.wiki.gg/wiki/Healing · https://noita.wiki.gg/wiki/Gold
- Holy Mountain, perks and Stevari: https://noita.wiki.gg/wiki/Holy_Mountain · https://noita.wiki.gg/wiki/Perks · https://noita.wiki.gg/wiki/Stevari
- Biomes: https://noita.wiki.gg/wiki/Biomes (plus individual biome pages)
