# Game Design Spec — "BATTLEGROUNDS" (PUBG-faithful single-player)

The target is PUBG: BATTLEGROUNDS' feel: grounded, deliberate, tactical, and lethal at range. The numbers below are
the shared source of truth. They're calibrated to PUBG and may be tuned, but record changes here.

## 1. Match flow
1. **Main menu** → choose mode (Solo / Duo / Squad), player count (30–100, default 80), bot difficulty,
   perspective (TPP/FPP), time of day & weather (or random), then **Play**.
2. **Starting area (lobby)**: 30 s countdown on a small pre-match spawn island where you can run around and shoot
   for fun (no damage) — optional. If skipped, go straight to the plane.
3. **Plane**: a C-130-style transport flies a random straight line across the map at **600 m** altitude,
   **60 m/s**. The player presses F to jump. Bots choose landing spots weighted by loot/flight path proximity.
   Everyone is forced out at the end of the path.
4. **Freefall**: ~**45 m/s** fall and ~**25 m/s** forward when gliding; diving (W, looking down) up to
   **65 m/s** vertical (234 km/h). The chute deploys manually (F) or automatically at **120 m AGL**.
   **Parachute**: descent **5–7 m/s** (W pitches forward: faster horizontal 14 m/s, faster descent), brake (S).
   Landing → ground state, then the chute is discarded.
5. **Looting / combat / rotation** under the shrinking zone, with a **red zone** bombardment (optional) and **airdrops**
   (2–4 per match, flare smoke on landing, crate weapons: AWM, Groza, Mk14 and level-3 gear).
6. **End**: last player or team alive wins ("WINNER WINNER CHICKEN DINNER!"). Death → "Better luck next time",
   with spectating of the killer or teammates. A results screen shows placement, kills, damage, survival time and distance.

## 2. Map: "Erangel-inspired island", 3 km × 3 km (world.size = 3072)
Main island plus a **southern military island** separated by a channel and joined by **two bridges**.
A **river** cuts through the main island with 2–3 bridges. Coastline, beaches and cliffs. Rolling hills, two
mountain ridges with radio towers, dense pine/birch forests, open fields/farmland, and wheat/crop fields.

Named locations (8–12), each with a distinct tactical identity:
- **Central town** (Pochinki-like): dense 1–2 storey houses, church, tight streets; high loot, early hot drop.
- **School + apartments** (School-like): the big school building plus 3–4 apartment blocks nearby.
- **Port town** (Georgopol-like): shipping container yard, warehouses, cranes, apartment towers.
- **Military base** (south island): barracks, hangars, watchtowers, fences; top loot; reached by bridges or boat.
- **Power plant / industrial** (Mylta Power-like): factory halls, cooling tower, tanks.
- **Prison/compound** or **Mansion**: walled compound with a central building (good loot, one entry).
- **Villages** (3–4): farms with barns, scattered houses, low-medium loot.
- **Quarry**: open-pit mine, steep walls; **Ruins**: broken stone walls on a hill.
- **Radio tower hilltop** (sniper position), **shelter** bunker (optional).
Roads (asphalt main roads + dirt tracks) link the towns. Vehicles spawn along roads and in towns, and boats on the coast.

## 3. Movement (character)
| Mode | Speed (m/s) |
|---|---|
| Walk (Ctrl) | 1.9 |
| Run (default) | 4.7 |
| Sprint (Shift, forward only) | 6.3 |
| Crouch walk / run | 1.6 / 3.0 (crouch-sprint 4.5) |
| Prone crawl | 1.2 |
| Swim / fast swim | 2.8 / 4.2 |
- Backward ×0.65 and strafe ×0.85. While aiming the speed is ×0.65 (ADS walk); while firing it is ×0.85.
- Weapon held: speed ×0.97 (LMG ×0.92, holstered ×1.0). Boost ≥ 60: +2.5 %, ≥ 90: +6.2 %.
- **Acceleration ~ 10 m/s²** (≈0.4 s to reach sprint) and deceleration ~ 14 m/s². Stance transitions take crouch 0.3 s
  and prone 0.9 s (no shooting while transitioning to prone). Lean ±0.35 m with Q/E (also while ADS).
- Jump: 0.55 m apex. **Vault** (Space near an obstacle) over obstacles 0.5–1.1 m tall and ≤ 1 m thick; **climb**
  onto ledges up to 2.1 m (1.2 s).
- Fall damage starts at impact speed > 9 m/s: `dmg = (v-9) * 10` (10 m ≈ 50 hp, ≥ 20 m lethal).
- Stamina is not used (PUBG has none). Sprinting is blocked while ADS, reloading (except PUBG allows reload while running), or healing.
- Swimming: you cannot use weapons. Breath lasts 15 s underwater, then 10 hp/s drowning.
- Collider capsule radius 0.35 m. Heights: stand 1.8, crouch 1.25, prone 0.6 (prone body length ~1.8 m along facing).

## 4. Health, armor, healing, knockdowns
- Health is 100. Knocked (DBNO, duo/squad only when a teammate is alive): crawl at 0.9 m/s, 100 knock-hp bleeding
  ~1.1/s at first and faster on repeated knocks (×1.5 each time). Revive takes 10 s by a teammate and gives 10 hp.
- **Helmets**: L1 −30 % head damage (80 durability), L2 −40 % (150), L3 −55 % (230).
- **Vests** (chest/stomach/pelvis): L1 −30 % (200), L2 −40 % (220), L3 −55 % (250). Durability drops by the pre-reduction damage.
- **Backpacks** add capacity: L1 +150, L2 +200, L3 +250. Base pockets are 20, and a vest adds +50.
- Consumables (use time, effect): Bandage 4 s +10 hp (cap 75); First Aid 6 s → 75 hp; Med Kit 8 s → 100 hp;
  Energy Drink 4 s +40 boost; Painkiller 6 s +60 boost; Adrenaline 8 s +100 boost. Moving while healing is
  allowed at walk speed (bandage/drinks) or not at all (med kit, first aid: slow walk 1.0 m/s).
- Boost (0–100) decays 1 point per 2.6 s. It heals 1 hp/8 s (0–20), 2 hp/8 s (20–60), 3 hp/8 s (60–90) and 4 hp/8 s (90–100).
- Weights: 5.56 0.5, 7.62 0.7, 9mm 0.375, .45 0.4, 12g 1.25, .300 1.0, bandage 2, first aid 10, medkit 20,
  drink 4, painkiller 10, adrenaline 20, frag 18, smoke 14, stun 12, molotov 16, attachments 10–15, fuel 20.

## 5. Weapons (PUBG-like values)
| id | class | ammo | dmg | rpm | modes | mag (ext) | m/s | reload s | notes |
|---|---|---|---|---|---|---|---|---|---|
| ar_m416 | AR | 5.56 | 40 | 700 | single/auto | 30 (40) | 880 | 2.1 | all attachments, very controllable |
| ar_akm | AR | 7.62 | 47 | 600 | single/auto | 30 (40) | 715 | 2.9 | strong vertical recoil |
| ar_scarl | AR | 5.56 | 41 | 625 | single/auto | 30 (40) | 870 | 2.2 | |
| ar_m16a4 | AR | 5.56 | 41 | 800 | single/burst3 | 30 (40) | 900 | 2.1 | no stock slot |
| ar_beryl | AR | 7.62 | 44 | 700 | single/burst/auto | 30 (40) | 715 | 2.9 | hard recoil, high DPS |
| ar_aug | AR | 5.56 | 41 | 700 | single/auto | 30 (40) | 940 | 3.0 | |
| ar_groza | AR | 7.62 | 47 | 750 | single/auto | 30 (40) | 715 | 3.0 | crate |
| smg_ump45 | SMG | .45 | 41 | 670 | single/burst/auto | 25 (35) | 300 | 3.1 | |
| smg_vector | SMG | 9mm | 31 | 1100 | single/burst/auto | 19 (33) | 300 | 2.2 | |
| smg_uzi | SMG | 9mm | 26 | 1400 | single/auto | 25 (35) | 350 | 3.1 | |
| smg_tommy | SMG | .45 | 40 | 700 | single/auto | 30 (50) | 280 | 4.0 | |
| smg_mp5k | SMG | 9mm | 33 | 900 | single/burst/auto | 30 (40) | 330 | 2.8 | |
| dmr_sks | DMR | 7.62 | 53 | semi | single | 10 (20) | 800 | 2.9 | |
| dmr_mini14 | DMR | 5.56 | 46 | semi | single | 20 (30) | 990 | 3.6 | flat trajectory |
| dmr_slr | DMR | 7.62 | 58 | semi | single | 10 (20) | 840 | 3.0 | |
| dmr_mk14 | DMR | 7.62 | 61 | semi/auto | single/auto | 10 (20) | 853 | 3.6 | crate |
| sr_kar98k | SR | 7.62 | 79 | bolt (1.9 s) | single | 5 | 760 | 0.45/round | one-shots L2 helmet |
| sr_m24 | SR | 7.62 | 75 | bolt (1.8 s) | single | 5 (7) | 790 | 4.2 | |
| sr_awm | SR | .300 | 105 | bolt (1.85 s) | single | 5 (7) | 945 | 4.6 | crate, one-shots L3 helmet |
| sr_win94 | SR | .45 | 66 | lever (0.6 s) | single | 8 | 760 | 0.5/round | 2.7x scope built in |
| sg_s1897 | SG | 12g | 26×9 | pump (0.75 s) | single | 5 | 360 | 0.52/shell | |
| sg_s686 | SG | 12g | 26×9 | 0.2 s | single | 2 | 370 | 2.1 | double-barrel |
| sg_s12k | SG | 12g | 24×9 | semi | single | 5 (8) | 350 | 3.0 | |
| lmg_m249 | LMG | 5.56 | 40 | 750 | auto | 75 | 915 | 8.2 | |
| lmg_dp28 | LMG | 7.62 | 51 | 550 | auto | 47 | 715 | 6.5 | bipod-like stability prone |
| pistol_p92 | Pistol | 9mm | 35 | semi | single | 15 (20) | 380 | 2.0 | |
| pistol_p1911 | Pistol | .45 | 41 | semi | single | 7 (12) | 250 | 2.1 | |
| pistol_r1895 | Pistol | 7.62 | 62 | 0.4 s | single | 7 | 330 | 0.6/round | revolver |
| pistol_p18c | Pistol | 9mm | 23 | 1200 | single/auto | 17 (25) | 375 | 2.0 | |
| pistol_sawedoff | Pistol | 12g | 22×8 | 0.25 s | single | 2 | 330 | 2.6 | |
Melee: pan (80, blocks bullets when holstered on the hip/back), machete 60, crowbar 60, sickle 60.
Throwables: Frag (fuse 5 s, cookable; ≤ 140 dmg core, 3.5 m lethal, 8 m radius), Smoke (40 s cloud), Stun (blind
& deafen ≤ 5 s by distance/angle), Molotov (spreading fire 10 s; 10 hp/s + burn).

**Hit-zone multipliers** (head/neck · chest/stomach/pelvis · arms/legs · hands/feet):
AR & LMG 2.35 · 1.0 · 0.9 · 0.9; SMG 2.1 · 1.05 · 1.3 · 1.3; DMR 2.35 · 1.05 · 0.95 · 0.95;
SR 2.5 · 1.3 · 0.95 · 0.95; SG 1.5 · 0.9 · 1.05 · 1.05; Pistol 2.1 · 1.0 · 1.0 · 1.0. Melee head ×1.5.
**Damage falloff**: full damage until `range` (AR 100 m, SMG 50 m, DMR 300 m, SR 400 m, SG 20 m, pistol 40 m), then a linear drop
to 65 % (SG: to 0 by 80 m) at 4× range.
**Ballistics**: real projectiles with gravity 9.81 m/s², air drag (velocity loss ~10–25 % over 300 m depending on class),
and travel time. The default zero is 100 m (DMR/SR adjustable 100–1000 m with PageUp/PageDown). Bullets penetrate only thin
wood/glass and lose 50 % damage. Max lifetime 3 s.
**Recoil**: a per-weapon vertical kick plus random horizontal drift within a pattern, with recovery after firing stops.
Muzzle climb is visible and controllable by pulling down. Prone/crouch reduce recoil (×0.6/×0.8), as do grips/stocks/compensators.
**Spread (hip-fire)**: a per-weapon base cone, increased by movement, jumping and continuous fire. ADS is near-perfect
for the first shot (tiny cone), and spread grows with sustained auto fire. Weapon sway is applied when scoped (strongest
standing, reduced crouched/prone and while holding breath with Shift: 5 s).
**Attachments**: sights (red dot, holo, 2×, 3×, 4×, 6×, 8×); muzzles (compensator −recoil, flash hider, suppressor
— quieter, hidden muzzle flash and minimap reveal); grips (vertical: −vertical recoil, angled: −horizontal recoil + faster ADS,
half, thumb, lightweight); mags (extended, quickdraw = faster reload, ext-QD); stocks (tactical: −sway/−recoil,
cheek pad for snipers). Compatibility follows the PUBG categories (AR/SMG/SR variants of muzzles & mags).

## 6. Vehicles
| id | seats | top km/h | HP | notes |
|---|---|---|---|---|
| vehicle_uaz | 4 | 115 | 1800 | 4WD, heavy, stable off-road |
| vehicle_dacia | 4 | 140 | 1500 | fast on road, poor off-road |
| vehicle_buggy | 2 | 100 | 1300 | light, nimble, flips easily |
| vehicle_motorcycle | 2 | 150 | 1000 | fastest, fragile, wheelies/air control |
| vehicle_pickup | 4 | 120 | 1700 | optional |
| vehicle_boat | 4 | 90 | 1500 | water only |
Fuel 100, a full tank ≈ 3.5 km at cruising speed; a fuel can adds +45. Damage comes from bullets (0.5× weapon damage),
collisions (above ~25 km/h, by the impulse), and fire at < 10 % HP before the explosion (≤ 100 dmg within 6 m).
Tires can be shot out (optional). Exiting at speed causes fall-style damage. Passengers can shoot (not the driver).

## 7. Zone (scaled to a 3 km map; about 22 min total)
| Phase | Wait (s) | Shrink (s) | New radius (m) | DPS (hp/s outside) |
|---|---|---|---|---|
| 1 | 150 after the plane leaves | 180 | 900 | 0.4 |
| 2 | 120 | 120 | 520 | 0.6 |
| 3 | 100 | 90 | 300 | 1.0 |
| 4 | 90 | 70 | 170 | 3 |
| 5 | 70 | 60 | 90 | 5 |
| 6 | 60 | 45 | 45 | 8 |
| 7 | 45 | 40 | 20 | 10 |
| 8 | 30 | 40 | 0 | 15 |
The initial circle covers the whole island (radius ~1600). Each new white circle lies fully inside the current one and is chosen
randomly but biased toward land (never fully in water). The blue wall is a visible animated cylinder, and the HUD shows the timer
and the distance to the safe zone. Warning messages: "Restricting the play area in 1:00", "Restricting the play area".

## 8. AI (bots) — fair, imperfect, human-like
Bots use the same Character + weapon rules as the player. Their behaviour:
- Pick a landing spot (hot/medium/quiet) and loot buildings room by room, judging needs (weapon tier,
  ammo for their guns, armor, heals, scopes). They rotate to the zone early or late depending on personality
  and use vehicles when far away.
- **Perception**: vision cone (~110° horizontal for detection, peripheral ~170° needs motion) with a detection
  meter that fills faster with closer, moving, standing, sprinting, shooting or silhouetted targets, and slower in
  foliage/grass/prone/darkness/fog. Physics line-of-sight is required (no wallhacks). Reaction time 0.25–0.8 s by
  difficulty. Bots remember the last known position, which decays, so they can lose track.
- **Hearing**: gunshots (≈ 600 m, suppressed ≈ 120 m), footsteps (sprint 35 m, run 22 m, walk 8 m, crouch 6 m),
  vehicles (≈ 250 m), explosions (400 m), doors (25 m). The estimated position gets error proportional to distance.
- **Aim**: an error cone that shrinks while tracking a visible target (convergence time 0.6–2 s), grows with
  target speed, own movement, distance and suppression (bullets landing nearby). Recoil control is imperfect
  (0.4–0.85 compensation). There's a first-shot delay, burst discipline at range, and they miss.
- **Tactics**: cover selection (walls, trees, rocks, vehicles), peeking, flanking with teammates, retreating to heal,
  suppressing, pushing knocked enemies, reviving teammates when safe, avoiding open fields when possible,
  and moving with the zone.
- **Difficulty** scales perception, reaction, aim convergence/stability, recoil control and decision quality — never
  information access.

## 9. UI/UX (PUBG-like)
HUD: compass (top), team health (bottom-left), player health bar + boost bar (bottom-center), equipped weapon/ammo/
fire mode (bottom-right), quick-slot items, minimap with zone/plane path/teammates (bottom-right corner),
zone timer, alive/kill counters (top-right), kill feed, interaction prompt, crosshair (dynamic), hit markers,
damage direction indicator, healing/reload progress circle. Inventory (Tab): vicinity list | backpack list |
equipment & weapon slots with attachment slots; drag & drop plus right-click quick actions. Full-screen map (M):
zoom/pan, markers, named locations, zone circles, plane path. Settings: graphics presets + individual options, audio
sliders, controls (sensitivity per scope, invert, key rebinding), gameplay (FPP/TPP, crosshair, colorblind modes,
sound visualizer).
