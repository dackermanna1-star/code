# LAST FERRY — design bible (vertical slice, chapters 1–3)

> *No one boards dead.*

A dark-comedy arcade shooter in the spirit of The Seal Hunter (2005): one small fixed
stage seen from an angled camera, a hunter who fires along his lane, a horde that walks
left to right, and a single rule — **if one of them reaches the gangway, it's over**. Kills
pay instantly; bigger, sillier guns are one key away; the stage keeps every body and every
drop of blood until it tells the story of your night.

What's new: **the dead don't stay down**, **the dead are terrain**, and **the pier fights
back**.

---

## 1. Setting & tone

Dusk on a rotting seaside pier. The town behind it is burning. The **last ferry** is moored
at the right end of the pier; survivors are boarding up the gangway one by one — the level
bar *is* the boarding queue. Our hero is **the Bosun**: a stocky ferry bosun in a bright
yellow oilskin coat and sou'wester hat, rubber boots, pipe. Gallows humour, never
grimdark: zombies in Hawaiian shirts, joggers with race bibs, a waiter still carrying a
tray, seagulls that flee every gunshot.

Three chapters = three times of night. Chapter 1 *Last Light* (sunset, warm orange),
Chapter 2 *Blue Hour* (cold dusk), Chapter 3 *Lights Out* (night: fog, flickering lamps,
the lighthouse beam sweeping across the planks). When chapter 3 ends the ferry sounds its
horn and pulls away — "TO BE CONTINUED".

## 2. Camera & stage (see `src/config/view.ts`, `src/config/world.ts`)

- Fixed camera, pitch 36°, vertical FOV 24°, 16:9 frame (design 1280×720), ~47 m of deck
  visible across the frame centre. Never moves (except screen shake / punches).
- Pier deck: x −30 … 23.5, z −6 … 6, deck top y = 0, sea at y = −2.6. Weathered planks
  running across x, pilings, a broken railing on the far edge (−z) and a low railing with
  gaps on the near edge (+z), lamp posts every ~8 m, fish crates, rope coils, a bait shop
  shack (far side, x≈−14), the **cargo crane** (far side, x≈−6) with a pallet of fish crates
  hanging over the deck, life rings.
- Left: the pier meets the promenade; the burning town (silhouettes, fire glow, smoke
  columns) is the backdrop. Zombies appear from the left edge of the frame.
- Right: the ferry's hull runs along the right end (x ≥ 23.5); the gangway at z≈0 rises
  onto the deck; survivors queue on the gangway and climb aboard as the level progresses.
  `ESCAPE_X = 21.6`: a zombie past this x is "at the gangway" → game over.
- Far background: sea to the horizon, the lighthouse on a rock (far left-back), the sun
  setting (ch. 1), gulls.

## 3. Controls (Seal Hunter's, plus three verbs)

| Action | Keys |
|---|---|
| Move | W A S D / arrows (the hunter always faces and fires left, −x) |
| Fire (hold) | Space / Ctrl / left mouse |
| Reload | R |
| Buy best affordable / select or buy | B or Enter / 1–6 or click |
| Cycle weapons | Q / Tab |
| **Stomp** (jump + land on whatever is under you) | E / Shift |
| **Ferry horn** (once per chapter) | H |
| **Cannon strike** (when Captain's Favour is full) | F |
| Pause | P / Esc |

Walking into a crawler kicks it (like Seal Hunter's wounded seals). Stomping a downed body
or a crawler finishes it for good ("tidy": +$5).

## 4. The three new systems

### 4.1 "Not dead till the head's gone" — reanimation
- A zombie killed by an ordinary hit (`DeathKind 'down'`) leaves a **downed body** (a
  `Corpse` with `risesAt` set). After the rise delay it **twitches** for 2 s (event
  `corpseTwitch`) and then **rises as a crawler** (event `corpseRise` → a new Zombie with
  `risen = true`, same `kind` and `look` seed, state `rise` → `crawl`).
- Rise delay by chapter: ch.1 9–15 s, ch.2 7–13 s, ch.3 5–9 s (random per body).
- A body stays dead for good (`risesAt = null`) if: killed by a **headshot**, **burned**,
  **gibbed** (explosion/cannon/crates), **popped** (bloater), **harpooned**, **stomped**,
  **drowned**, or later: burned while down, stomped while down, hit by an explosion while
  down, or **nailed** (3+ nail-gun nails in a downed body pin it to the planks).
- A risen crawler (any kind except bloater/bigdave/riot) has 35% of the kind's base life
  (min 20), crawls at 0.55–0.75 m/s, height ~0.55 m (low profile: the gun line at 1.0 m
  passes over it unless the view-consistent band catches it — kick or stomp it), bounty $15,
  and when killed it stays dead.

### 4.2 Corpses are terrain — the meat barricade
- Every corpse (downed or permanent) occupies the deck where it fell (logic position =
  death position pushed by the killing blow, ≤ 1.2 m; the ragdoll is aimed to land there).
- A zombie walking into corpses is slowed: speed × 1 / (1 + 0.45·n), n = corpses within
  0.75 m ahead of it in its lane (capped at 4). Joggers have a 35% chance per new corpse to
  **trip** (state `trip`, 0.9 s on the ground, then up again).
- Explosions shove corpses (logic moves them, ≤ 2 m) and gib permanents near the centre.
  Burning corpses turn to ash after 6 s and stop counting.
- Piles can't exceed 3 corpses per 0.75 m cell — extra bodies spill to a neighbour cell.

### 4.3 The pier fights back
- **Ferry horn** (H, once per chapter): a shockwave from the ferry — every zombie on screen
  staggers 2.0 s (state `stagger`), crawlers are pushed back 1 m, gulls scatter, the
  survivors cheer. Recharges at each chapter start.
- **Cargo crane** (once per chapter): the pallet of crates hangs at (x −6, z −1.5, y 2.2).
  Shooting its **hook block** (a hit box at x −6, z −1.5, y 0.9–1.5 on the gun line, i.e.
  stand in that lane and fire) cuts the rope: the pallet drops 0.6 s later onto
  (x −6 ± 2.5, z −1.5 ± 2.5): zombies inside are **gibbed** (bounty paid), and a **crate
  barricade** remains for 20 s that slows zombies like 4 corpses. Rehung each chapter.
- **Captain's Favour** meter (0–100): +2 per kill, +3 per headshot, +15 per nice shot,
  +5 per tidy stomp. Full → press F: the ferry's deck gun fires **3 shells** 0.35 s apart at
  the densest cluster of zombies left of the hunter within ±2 m of his lane. Each shell:
  radius 3 m, 400 damage, gibs, shoves corpses.

## 5. Fire & gas
- **Burning** (flare hit, fire spread, gas explosion): a zombie burns for 4 s, 12 dps, moves
  ×1.4 faster in panic (state `burn`, arms flailing) — dangerous! Fire spreads to zombies
  within 0.9 m (25% chance per second) and through corpse piles (to corpses within 0.75 m,
  40%/s). Burning corpses never rise and turn to ash after 6 s.
- **Gas** (bloater pop / Big Dave belch): a green cloud, radius 2.5 m, 4 s. The hunter loses
  15 hp/s inside. Fire touching gas → **gas explosion**: radius 3.5 m, 150 damage, ignites.

## 6. Hunter & economy

Extra rules found in tuning (all in `src/config/rules.ts`): burning bodies ignite zombies
walking over them; standing in deck fire or held by a burning zombie burns the hunter
(10 dps); he takes 25% of blast damage (max 40); crawlers bite (8 dps) if not kicked; kicks
deal 60 and knock back 1.5 m; blasts near the edge can knock zombies into the sea; the
harpoon cable pins downed bodies it passes over; nails pin only bodies already down.

- Life 100, regen 12/s after 3 s without damage. Zombies that reach the hunter **grab**
  (`grab` state, 18 dps) until shot, kicked off (walk away / stomp) or killed.
- Bounties are paid on kill (killer = the player who dealt the fatal blow). Headshot kill
  bonus +$15. **Nice shot**: 3+ kills by one trigger pull → +$25 × (n−2) × chapter, a
  "NICE SHOT" / "MASSACRE" (6+) callout, Favour +15, and a **slow-motion** beat.
- Start: $0, the revolver. Expected earnings: ch.1 ≈ $4.5–5k, ch.2 ≈ $8k, ch.3 ≈ $11–12k.
- Balance (bot sims, skill 0.9): clears ch.1 94%, ch.2 63%, wins 22%.

## 7. Weapons (lane hitscan unless noted; dmg per bullet/pellet; times in s)

| Id | Name | Price | Dmg | Clip | Fire | Reload | Spread° | Pierce | Notes |
|---|---|---|---|---|---|---|---|---|---|
| revolver | "Old Faithful" revolver | 0 | 34 | 6 | 0.30 | 1.6 | 0.6 | 0 | head ×3; hammer flick |
| nailgun | Pneumatic nail gun | 600 | 15 | 40 | 0.075 auto | 2.0 | 3.5 | 0 | nails stick in bodies; 3 nails pin a downed body (never rises) |
| shotgun | Pump shotgun | 1500 | 8×16 | 6 | 0.75 (pump) | 0.45/shell | 9 | 0 | pushes zombies back 0.6 m; close range head-off |
| flare | Flare pistol | 2200 | 30 | 1 | — | 1.3 | 0 | 0 | **projectile** (fast, slight arc, 28 m/s): ignites what it hits (or the deck: burns 8 s, ignites what walks through), lights the area (essential at night) |
| harpoon | Harpoon gun | 3500 | 220 | 1 | — | 2.2 | 0 | all (≤5) | skewers a kebab of up to 5 zombies, reels them 2 m toward the hunter, harpooned = permanently dead; pierces riot shields |
| outboard | "Outboard" boat-engine minigun | 12000 | 22 | 300 | 0.045 after 0.6 s pull-start spin-up | 3.5 | 4 | 0 | engine idles between bursts; overheats after ≈6 s of fire (stalls, restarts with a pull-start below 45% heat); head-off at close range |

Damage +10% per chapter after the first. Recoil pushes the hunter right a little (shotgun,
harpoon, outboard).

## 8. The horde (life; speed m/s; bounty $)

| Kind | Life | Speed | Bounty | Head ×| Notes |
|---|---|---|---|---|---|
| shambler | 70 (+15/ch) | 1.1–1.6 | 30 | 3 | random "looks": fisherman, tourist (Hawaiian shirt), waiter (tray), granny (handbag), office worker, lifeguard |
| jogger | 50 (+10/ch) | 4.5–5.5 | 60 | 3 | race bib + headband; zig-zags lanes; trips over corpses |
| bloater | 160 (+30/ch) | 0.55–0.7 | 120 | 2 | swollen belly; **pops** on death: gas cloud + 2 crawlers spill out; never rises |
| medic ×2 + patient | 60 each / 70 | 1.3 | 70 / 40 | 3 | two medics carry a stretcher with a patient; kill a medic → stretcher drops, the patient gets up after 1.5 s as a shambler, the other medic walks on as a shambler. Hitting the stretcher (part 'stretcher') does nothing |
| riot (ch.3) | 400 | 0.8 | 300 | 3 | riot gear: **helmet** (120 hp; head immune until gone), **shield** (300 hp; blocks body hits from the front until gone), **chest plate** (150 hp; halves body damage). Harpoon ignores plates; shotgun deals ×2 to plates. Plates fly off as debris |
| crawler | see 4.1 | 0.55–0.75 | 15 | 3 | risen corpse; low profile |

**Bosses** (the boss bar replaces the boarding bar when they arrive):
- Ch.1 **Big Dave** — a 3 m bloater in a stained chef's apron. Life 3400. Walks 0.55 m/s,
  escorted by shamblers every ~4.5 s. Every 5 s he **belches** a gas cloud 4 m ahead in his
  lane. At 50% life he tears off the apron and walks 0.9 m/s. Death: huge pop — gas cloud radius 4, 6 crawlers, gore rain,
  1.2 s slow-motion. Bounty $1000.
- Ch.2 **The Marathon** — 40 joggers (boss = true, "marathon pace" 3.7–4.5 m/s, $30 each) in
  waves of 8 every 4 s, all lanes; the 40th wears a gold medal (bounty $500). Boss alone (the
  field must be clear first, or 25 s pass).
- Ch.3 **The Riot Squad** — 3 riot brutes in formation (z −3, 0, +3), shields up (life 3200,
  plates ×3, 1.15 m/s), escorted by a shambler every 1.7 s, a jogger every 2.3 s and a bloater
  every 15 s. Bounty $800 each.

## 9. Chapters

| Ch | Name | Clock | Spawn phase | Spawns | Boss | Passengers |
|---|---|---|---|---|---|---|
| 1 | Last Light | 18:40 | 75 s | 48 shamblers, 4 bloaters, 2 paramedic teams | Big Dave | 48 |
| 2 | Blue Hour | 19:25 | 90 s | 40 shamblers, 14 joggers, 4 bloaters, 3 paramedic teams | The Marathon (alone) | 60 |
| 3 | Lights Out | 21:10 | 100 s | 58 shamblers, 28 joggers, 6 bloaters, 3 paramedic teams, 3 riot | The Riot Squad | 72 |

Surges: a shambler spawn has a 40% chance to bring a pack of 2–4, a jogger spawn 30% for 2–3
(totals unchanged). Spawn scheduling as Seal Hunter: each kind's count is spread over the spawn phase with
random gaps (between ½ and 1× the average gap). A chapter ends 3 s after its bosses die;
then a 2.5 s chapter splash. Corpses and blood carry over between chapters (the pier keeps
its history); crane and horn are restored; downed bodies keep their timers.

Time of day: `timeOfDay` runs 0 → 1 over the whole game (ch.1 0.00–0.30, ch.2 0.33–0.62,
ch.3 0.66–1.00), advancing with spawn-phase progress.

## 10. Feel ("juice")
- **Hit-stop**: 45 ms freeze on a headshot kill, 70 ms on a harpoon kebab ≥3.
- **Slow-motion**: nice shot → 0.35× for 0.6 s (eased); boss death 0.25× for 1.2 s.
- **Shake**: shotgun 0.15, harpoon 0.2, outboard 0.05/shot, explosions by distance, horn 0.3.
- Persistent blood painted into the planks (darker, soaks along plank grain), wet sheen,
  bodies pile up and stay (batched), nails/harpoons stay in bodies, ash piles where bodies
  burned, scorch marks.
- Muzzle flashes light the scene (point lights), flares cast moving light, fire glows.
- Gulls on the railings flap away from gunfire and return later.

## 11. UI & audio direction
- Modern minimal HUD (like the new Seal Hunter UI) with a nautical accent (brass/amber +
  signal red on dark glass): top-centre boarding bar "PASSENGERS 23 / 48" with a tiny ferry
  icon (boss bar in boss phases), money + kills top-right, weapon bar bottom-centre (6
  tiles), ammo + weapon name bottom-right, Captain's Favour as a ship's-wheel ring with "F"
  when full, horn "H" chip, crane indicator, health only when hurt, callouts (NICE SHOT,
  MASSACRE, HEADSHOT ×3 streak, TIDY), chapter splash "CHAPTER 1 · LAST LIGHT · 18:40".
- Title: "LAST FERRY" — *No one boards dead.* Live attract mode behind it.
- Audio: everything synthesised with Web Audio (no files), so the game is one HTML file:
  revolver crack, nail-gun pneumatic thunk, shotgun boom + pump, flare whoosh + crackle,
  harpoon thunk + cable whine, outboard pull-start + engine rattle, reloads, zombie groans
  (formant synthesis, pitch/vowel per look), wet hits, bone crunches, bloater pop, fire
  crackle loop, waves + wind + distant sirens ambience, gulls, the ferry horn (big low
  chord), deck-gun cannon boom, crate crash, a low adaptive music bed (drone + heartbeat
  percussion rising with the boarding bar; a brass sting on boss arrival).

## 12. Tech
Engine reused from Seal Hunter 3D (three.js, cannon-es ragdolls, GPU blood decals, batched
corpses, instanced particles), all in this folder. Logic in `src/core` (pure, 50 Hz,
deterministic with a seeded RNG, unit-tested, bot-simulated); presentation in
`src/render`; UI in `src/ui`; audio in `src/audio`; app in `src/game`. Single-file build:
`npm run ferry:single` → `release/LastFerry.html`.
