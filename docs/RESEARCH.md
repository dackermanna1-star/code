# Seal Hunter 3D — Research & Reference Analysis

This document records what the original game is, how it plays, the numbers it
uses, what each reference screenshot shows, and how every important element maps
to the 3D implementation. Details that could not be confirmed are listed
separately under **Uncertainties** rather than invented.

## 1. Sources

| Source | What it gave us | Reliability |
|---|---|---|
| The 5 attached video frames (0:06, 2:16, 4:13, 6:13, boss) | Camera framing, HUD layout, colours, scale, blood/corpse accumulation, shell casings, crosshair text | Primary visual benchmark |
| `zevlg/py-sealhunter` (pygame port of the 2005 original, WTFPL, ships the original sprites + sounds) | Exact weapon table, enemy table, level/spawn table, per-tick physics constants, AI behaviour, HUD geometry, hit rules | High — numbers are copied from the original data; the author marks the few guesses (e.g. walrus life) |
| sealhunter.com (official site, changelog v1.0e–v1.2) | Patch-level tuning (Magnum reload 2.2 s, Minigun 150 rounds, sniper clip 5, Dual Mac price 3500, kicking crawling seals) | High |
| shpro.de.tl (fan guide for the 2010 remake) | Cross-check of weapon/enemy numbers (they match the port), "enemy crosses the right border = Game Over", level enemy rosters | Medium (remake, but numbers agree) |
| Lutris / Kotaku / IGDB listings | 2005 Windows freeware by Cute 'n Fluffy, 1–4 local players, seals, penguins, baby seals, turtles, polar bears | Context only |

## 2. Core gameplay loop

1. A lone hunter in a blue parka stands on an ice floe near the **right** side of the screen.
2. Animals (and "activists") enter from the **left** edge and move right across the floe.
3. The hunter can move in two axes (left/right and up/down = depth) but **always faces and fires left, horizontally** — there is no free aiming. You line up with an enemy's lane and shoot.
4. Every kill pays a bounty; headshots pay a bonus; 3+ kills from a single shot ("nice shot") pay extra and make the hunter laugh.
5. Money buys better weapons from the top HUD bar. A weapon is bought once; magazines are unlimited (only the per-magazine count matters).
6. **If any enemy reaches the right border, the game is over.** (Exception: an activist that has lost his seal cub just runs away.)
7. Each level lasts ~60 s of spawning, then a boss appears (some levels wait for the field to be cleared first). Killing the boss starts the next level.
8. Five levels + an epilogue ("Last seal on the planet": a single baby seal). Corpses and blood **never disappear**, so the floe turns red over a 5–7 minute match — the signature look in screenshots 2–5.

## 3. Controls (original + this recreation)

Original (2005): keyboard only — four directions, fire, reload, buy (buys the most expensive weapon you can afford), switch weapon; later versions added number keys for weapon select and kicking crawling seals.

This recreation:

| Action | Keys |
|---|---|
| Move | `W A S D` or arrow keys |
| Fire (hold for automatic) | `Space`, `Ctrl`, or left mouse button |
| Reload | `R` |
| Buy best affordable weapon | `B` or `Enter` |
| Select / buy weapon by slot | `1`–`9`, `0`, or click the HUD slot |
| Cycle owned weapons | `Q` / `Tab` |
| Jump (stomp crawling seals) | `E` / `Shift` |
| Pause | `P` / `Esc` |

## 4. Original world units → 3D units

The original is a 640×480 screen at 50 ticks/s. The floe's playable band is screen-y 181–428; enemies spawn in y 200–400.

* 3D field width: **40 m** across the visible frame ⇒ 1 original pixel ≈ 0.0625 m horizontally.
* Camera pitch **32°**, vertical FOV ≈ **11°** (near-orthographic, like the sprite art), 4:3 viewport (pillar-boxed on wide screens) so the composition matches the frames exactly.
* Depth: the 247-px lane band maps to ≈ 30 m of floe depth (247 px / sin 32°).
* Sprite heights map through cos 32°: player 20 px ⇒ ~1.5 m, brown seal 15 px ⇒ ~1.1 m (head raised), polar bear 36 px ⇒ ~2.2 m long, ~1.6 m tall.
* Speeds: px/tick × 50 × 0.0625. Player max ≈ 6.25 m/s across, ≈ 6 m/s in depth (the original's 2.0 vs 1.3 px/tick ratio is exactly the foreshortening of a ~40° view, confirming the 3D reading).
* Timing: ticks ÷ 50 = seconds.

### Hit rule
In the original a bullet is a horizontal line *on screen*; it hits whatever sprite pixels it crosses. That makes the hit tolerance in depth equal to the target's on-screen height. We reproduce this in 3D with a **view-consistent hit test**: a shot fired at height *h* from depth *z₀* is evaluated against each creature's side silhouette at the effective height `h + (z − z₀)·tan(pitch)` — exactly where the tracer appears to cross that creature on screen. Because the camera never moves, what the player sees is what registers.

## 5. Weapons (original data, py-sealhunter `constants.py` + changelog)

Fire/reload in seconds (ticks/50). Spread = ± degrees. Pierce = fraction of energy kept after each body the bullet passes through.

| Slot | Weapon | Price | Damage | Mag | Fire interval | Reload | Spread | Pierce | Recoil (x / hop) | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| – | USP pistol | free | 18 | 12 | 0.26 s | 2.0 s | 0 | 0 | – | always owned |
| 1 | Magnum (.357 revolver) | $500 | 60 (+5/level) | 6 | 0.40 s | 2.2 s | 0 | 0.7 | 1.0 / – | drops 6 cases on reload |
| 2 | MP5 | $1000 | 23 (+2/level) | 30 | 0.10 s | 1.6 s | 0 | 0 | 0.3 | |
| 3 | Grenades | $1500 | 250 splash | 1 | 0.16 s | 1.0 s | – | – | – | thrown, bounce, fuse 1 s, radius 75 px |
| 4 | Pump shotgun | $2500 | 8 × 40 | 8 | 0.80 s | 2.5 s | 7.5 | 0 | 1.65 / 1.9 | shells loaded one by one |
| 5 | Dual MAC-10 | $3500 | 37 | 60 | 0.06 s | 2.6 s | 4.0 | 0 | 0.2 | two muzzles |
| 6 | "Flunk" M79/MGL launcher | $5000 | 400 splash | 5 | 0.40 s | 3.0 s | – | – | – | flat lob, bursts on contact, radius 85 px |
| 7 | Colt M4/M16 | $6000 | 60 | 30 | 0.10 s | 1.6 s | 0 | 0.8 | 0.35 | |
| 8 | AWP | $7500 | 855 | 5 | 1.32 s | 2.2 s | 0 | 0.9 | 3.2 / 3.0 | red laser sight; hunter laughs on purchase |
| 9 | "Farfar" punt gun (1876 vintage) | $10000 | 15 × 125 | 2 (both barrels) | 1.0 s (0.7 s cock) | 1.0 s | 5.25 | 0.33 | 3.0 / 3.5 | |
| 10 | Minigun | $12500 | 65 | 150 | 0.26 → 0.06 s (spins up with heat) | 2.4 s | 1.0 | 0.5 | 0.25 | wind-down sound |

## 6. Enemies (original data)

Life uses `base + perLevel × levelNumber`. Speeds in px/tick (×3.125 ⇒ m/s).

| Enemy | Life | Speed | Bounty / head bonus | Behaviour |
|---|---|---|---|---|
| Brown seal ("Bruns") | 26 + 21·L | 0.5–1.1 | $50 / +$10, head ×2 | Galumphs right, zig-zags in depth (straight in L1). At ≤10 HP from a body shot it collapses and **crawls** leaving a blood trail; can be kicked/stomped. Overkill (< −100) gibs. |
| Fat seal ("Knubbs", white) | 250·L (boss 1250) | 0.7 | $200 (+$200 as boss), head ×1.5 | Constant plod; when damaged, every 5.6 s it stops 3 s and regenerates 50 HP/s. Bowls the hunter over. |
| Activist (green parka, orange hair) | 30 + 35·L | 1.1–2.0 | $100 / +$15, head ×2 | Runs zig-zag carrying a white seal cub. Shoot the cub out of his arms → he panics and flees (allowed to escape). Kill him → cub drops and keeps walking. Head-off death. |
| Seal cub ("Vits") | 10 + 5·L | 0.44–0.74 | $25 | Slow; stops to sniff ("nosa"); knocks the hunter over. |
| Penguin ("Pingvin") | 25·L | 0.64–1.1 | $100 / +$10, head ×2 | Waddles zig-zag, after 4–6 s belly-glides at 1.74–3.14, bouncing off the floe edges. Killed while gliding → rolls/slides. |
| Polar bear | 1700 (boss 2000) | 0.8 → 7.4 | $500, head ×2 | Enrages as it loses life: speed = min + (max−min)·(1 − life%)². Rams and launches the hunter. Death slide with blood trail. |
| Turtle | 2500 | 0.6 | $500 | Shell ricochets bullets; only head/legs are vulnerable. After 300 dmg it hides 2 s (longer while aimed at); explosions damage fully. While it lives, cheap enemies keep spawning (1/10 bounty). |
| Walrus ("Valross", final boss) | not recorded (port value 1500 is marked invalid) | 0.25 walk, 12 rush | – | Walks in, stops, scrapes its tusks (sparks) for 1.2 s, then rushes across the floe and **devours** anyone in its path; turns at the edge and repeats from the other side. |

## 7. Levels (1 player)

| Level | Spawned over ~60 s | Boss | Wait for clear before boss |
|---|---|---|---|
| 1 | 29 brown seals (straight lines) | Fat seal (1250 HP) | no |
| 2 | 16 seals, 9 activists | 9 penguins | yes |
| 3 | 20 seals, 13 activists, 12 penguins | Polar bear (2000 HP) | yes |
| 4 | 25 seals, 15 activists, 13 penguins, 3 fat seals | Turtle (2500 HP); cheap enemies keep spawning | no |
| 5 | 30 seals, 16 activists, 15 penguins, 4 fat seals, 2 bears | Walrus | yes |
| 6 | Epilogue "Last seal on the planet" | 1 baby seal | – |

Spawn scheduling (original): for each enemy type, the next spawn time is `now + rand(bpt/2, bpt)` with `bpt = remainingTime / remainingCount`.

## 8. Reference screenshot analysis

Frame = 4:3. Positions below are fractions of frame width/height (u, v).

**Common to all frames**
* Black strip v 0–0.033: italic white "Level N:" (or "Boss:") followed by a white progress bar with black outline across the rest of the width.
* HUD bar v 0.04–0.135: steel-blue panel, ten rounded grey slots with weapon renders and grey `$price` captions, black rounded box at the far right with "$" and "Kills:" in bold white Trebuchet.
* Backdrop: overcast lavender-grey sky; a large blue-white iceberg centred slightly right (u 0.07–0.9), peak hidden behind the HUD at u ≈ 0.55.
* Floe back edge: black jagged outline at v ≈ 0.28–0.37 with a small triangular notch at u ≈ 0.49–0.53.
* Floe surface: pale grey-blue, misty, with a soft reflection of the iceberg fading downward and a bright haze in the centre.
* Front edge: black jagged outline at v ≈ 0.90–0.97, vertical cliff faces below it (corners at u ≈ 0.10, 0.36, 0.47, 0.63), showing reflective water tones.
* Sprites have faint mirror reflections on the ice, no drop shadows.

**Frame 1 (0:06, Level 1, $0, 0 kills)** — clean ice. Hunter (blue parka, white fur hood trim, dark face) at (0.28, 0.67) holding the pistol, with a faint reflection below. "$0" in dark grey above his head. Blue crosshair at (0.19, 0.67) with "12" (pistol magazine) above it. A brown seal entering at the lower-left (0.04, 0.76). Level bar barely started. All slots show prices (nothing owned).

**Frame 2 (2:16, Level 2 almost complete, $4160, 57 kills)** — Magnum slot highlighted with white frame, caption "x0" (empty magazine). Crosshair shows red "90%" = reload progress. Ice covered in horizontal red streak bands following enemy lanes (blood sprays leftward, away from the gun). Corpses: brown seals, activists (green/blue), and the white Level-1 boss fat seal with a blood pool. A live activist with orange hair near the hunter. Brass casings scattered to the right of the hunter.

**Frame 3 (4:13, Level 4, $7725, 148 kills)** — Magnum "x4", Flunk launcher selected "x1". Blood covers the left two-thirds; penguin corpses (black/white) and fat-seal corpses visible; hunter in the middle of the floe.

**Frame 4 (6:13, Level 5, $5580, 248 kills)** — Minigun selected, "x0", reload "80%". A polar bear and an activist alive at upper-left; dense gold minigun casings fanning out right of the hunter; ice almost entirely red.

**Frame 5 (Boss, $8665, 273 kills)** — "Boss:" label, bar ≈ 25% = walrus life remaining. Walrus (brown, tusks) on the left; hunter far right firing the minigun ("x32"). Casings everywhere.

## 9. 3D staging decision

The original is a 2.5D composition: the floe is viewed from ~35–40° above while the backdrop photo has its horizon at the floe's back edge. No single physical camera can produce both. We therefore render in two layers:

1. **Backdrop layer** — a separate near-horizontal camera renders a 3D sky dome, a procedurally sculpted iceberg and the far sea into a texture (re-rendered occasionally for cloud drift). This is drawn as the frame's background and is also sampled, mirrored, by the ice shader to produce the iceberg reflection seen in the frames.
2. **Gameplay layer** — the 32° near-orthographic camera renders the floe, characters, physics and effects on top, with planar character reflections on the ice.

## 10. Reference checklist → implementation

| Element | Implementation |
|---|---|
| 4:3 framing, fixed camera, near-ortho view | `src/render/Stage.ts` (viewport fitting, cameras) |
| Sky, iceberg, far sea | `src/render/Backdrop.ts` |
| Floe outline (back edge + notch, front cliffs), black outline | `src/render/IceFloe.ts`, shape data in `src/config/field.ts` |
| Misty ice surface, iceberg reflection, character reflections | `src/render/IceMaterial.ts` |
| Permanent blood accumulation (lane streaks) | `src/render/BloodSystem.ts` (droplets → painted blood map) |
| Permanent corpses | `src/render/Corpses.ts` (ragdolls freeze & bake) |
| Brass casings, dropped magazines | `src/render/Debris.ts` |
| Hunter model (blue parka, fur hood) + 11 weapons | `src/render/models/*` |
| Seal, fat seal, cub, activist, penguin, bear, turtle, walrus | `src/render/models/*`, animation in `src/render/CreatureView.ts` |
| Level/Boss bar, weapon slots, `$`/Kills box, slot captions `$price` / `xN` | `src/ui/Hud.ts` |
| Crosshair + ammo/reload %, money above hunter, money popups | `src/ui/WorldOverlay.ts` |
| Weapon stats, enemy stats, level table | `src/config/*.ts` |
| Movement, recoil slide on ice, knock-downs, jump/stomp/kick | `src/core/Player.ts` |
| Hit rule, pierce, headshots, explosions, ricochet | `src/core/Combat.ts` |
| Enemy AI (zig-zag, crawl, glide, enrage, hide, charge) | `src/core/enemies/*.ts` |
| Game over on escape, boss flow, epilogue | `src/core/World.ts`, `src/core/Level.ts` |
| Original sound effects | `public/audio/*`, `src/audio/AudioSystem.ts` |

## 11. Uncertainties (not invented — documented choices)

* **Walrus life.** The port's value (1500) is flagged by its author as invalid. We use 6000 so the final boss survives several minigun magazines; documented in `src/config/enemies.ts`.
* **Walrus devouring.** Sources agree it eats the nearest player. We implement: rush along the hunter's lane; contact during the rush kills the hunter (game over).
* **Explosion damage to the hunter** (team-kill option in the port) — enabled at full strength like the port; the hunter has 1000 HP. Because the original HUD has no health bar, we add slow regeneration (20 HP/s after 3 s without damage) and show damage only as a red vignette.
* **Money text colour** above the hunter: the frames show dark grey; the port uses the player colour. We follow the frames.
* **Exact crosshair offset** per weapon: from the port (`cross_xoffset` 40/60/80 px ⇒ 2.5/3.75/5 m).
* **Music:** the original shipped none (user folder only); we add only wind/sea ambience.
* **Jump key:** present in the remake and the port's console; kept as an optional move for stomping crawling seals.
