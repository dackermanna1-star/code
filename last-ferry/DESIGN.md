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
at the right end of the pier; survivors (in life vests over their coats) are boarding up the
gangway one by one — the level bar *is* the boarding queue. Our hero is **the Bosun**: a stocky ferry bosun in a bright
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
  gaps on the near edge (+z), tall lamp posts every ~8 m along the far edge and low bollard
  lanterns along the near edge (their pools of light stay, and nothing tall stands between
  the camera and the Bosun's lanes), fish crates, rope coils, a bait shop
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
| Fire (hold) | Space / J / K / left mouse |
| Reload | R |
| Buy best affordable / select or buy | B or Enter / 1–6 or click |
| Cycle weapons | Q / Tab / mouse wheel; Shift+Q / Shift+Tab cycle back |
| **Stomp** (jump + land on whatever is under you) | E / right mouse (on press); Shift (on release, so Shift+Q / Shift+Tab never stomps) |
| **Ferry horn** (once per chapter) | H |
| **Cannon strike** (when Captain's Favour is full) | F |
| Pause | P / Esc |

Ctrl is deliberately **not** a fire key (Seal Hunter's was): with W A S D under the other
hand, Ctrl+W closes the browser tab and Ctrl+S / D / A open dialogs. Pressing Ctrl in game
shows a one-time hint; every game key and every Ctrl / ⌘ combination has its browser default
suppressed while playing (pages can't stop Ctrl+W itself).

Held input follows the hands: a key or mouse button held through the pause menu still counts
after Resume; after the window loses focus everything is dropped (the keyups are lost) and a
key still held comes back with its auto-repeat. Releasing the mouse anywhere — over a weapon
tile, a menu, or outside the window — stops firing, and a key already held when a menu opens
never drives the menu with its auto-repeat.

Walking into a crawler kicks it (like Seal Hunter's wounded seals). Stomping a downed body
or a crawler finishes it for good ("tidy": +$15 and +5 Favour). The stomp reaches ±1.15 m
along the lane and ±0.8 m across it.

## 4. The three new systems

### 4.1 "Not dead till the head's gone" — reanimation
- A zombie killed by an ordinary hit (`DeathKind 'down'`) leaves a **downed body** (a
  `Corpse` with `risesAt` set). After the rise delay it **twitches** for 2 s (event
  `corpseTwitch`) and then **rises as a crawler** (event `corpseRise` → a new Zombie with
  `risen = true`, same `kind` and `look` seed, state `rise` → `crawl`).
- Rise delay by chapter: ch.1 9–15 s, ch.2 7–13 s, ch.3 5–9 s (random per body). The
  timers hold during the break between chapters (and the next chapter's title).
- Tells: from the moment it falls, a body that will rise has pale green eyes and a sickly
  green glow with a little mist that swells as the rise nears; 4 s before the twitch a quiet
  grey ring fills over it ("not dead yet"), then the red '!' countdown of the twitch. A body
  that is dead for good goes dark (no glow, no eyes). Risen crawlers are tinted green with
  glowing eyes, and their glow draws over gas.
- A body stays dead for good (`risesAt = null`) if: killed by a **headshot**, **burned**,
  **gibbed** (explosion/cannon/crates), **popped** (bloater), **harpooned**, **stomped**,
  **drowned**, or later: burned while down, stomped while down, hit by an explosion while
  down, or **nailed** (3+ nail-gun nails in a downed body pin it to the planks).
- A risen crawler (any kind except bloater/bigdave/riot) has 35% of the kind's base life
  (min 20), crawls at 0.55–0.75 m/s, height ~0.55 m (low profile: the gun line at 1.0 m
  passes over it unless the view-consistent band catches it — kick or stomp it), bounty $8,
  and when killed it stays dead. The low bounty is on purpose: stomping the body before it
  gets up (tidy, $15) pays more than kicking the crawler it becomes.
- Crawlers that spill out of a bloater or Big Dave are flagged (`spilled`); the game-over
  line tells them apart from bodies the Bosun left lying.

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
- **Cargo crane** (once per chapter): the pallet of crates hangs at (x −6, z −1.5, y 2.2)
  with its **hook block** (x −6, z −1.5, y 0.85–1.55). Cutting the rope is a **deliberate
  play**: only a shot fired while the Bosun's gun line is **lined up with the hook** — its
  lane (where the line visually crosses the block's centre, y 1.2: z ≈ −1.79 at muzzle height
  1.0) ± 0.22 m — reaches it (any weapon; a flare fired lined up flies to it). Stray rounds,
  spread pellets and nails from other lanes never cut it. A lined-up shot goes over the crowd
  standing in the drop square (they can't shield the hook); a zombie in front of the square
  still takes the round. The rope cut, the pallet drops 0.6 s later onto (x −6 ± 2.5, z −1.5
  ± 2.5): zombies inside are **gibbed** (bounty paid; 3+ is a nice shot, "CRUSHED"), and a
  **crate barricade** remains for 20 s that slows zombies like 4 corpses. Rehung each chapter.
  Affordance: the drop square is painted on the deck (worn yellow) and pulses, with a glint
  on the hook, when 3+ zombies stand in it
  (the HUD crane chip glows too and a one-time hint says so); brackets mark the hook with the
  count under it; near its lane with a crowd under it an arrow by the crosshair points the
  way, and lined up the hook reads DROP and the crosshair ON THE HOOK.
- **Captain's Favour** meter (0–100): +1 per kill, +2 more per headshot, +8 per nice shot,
  +5 per tidy stomp. The deck gun's own kills and its nice shot add nothing (it can't refill
  itself). Full → press F: the ferry's deck gun fires **3 shells** 0.35 s apart at the
  densest cluster of zombies left of the hunter within ±2 m of his lane. Each shell: radius
  3 m, 400 damage, gibs, shoves corpses. (Bot runs: about two strikes per chapter.)

## 5. Fire & gas
- **Burning** (flare hit, fire spread, gas explosion): a zombie burns for 5 s at 20 dps ×
  the chapter's damage scale (like the guns: 20 / 22 / 24), flailing and lurching across
  lanes only ×1.1 faster (state `burn`). Fire spreads to zombies within 1.3 m (70% chance per
  second) and through corpse piles (to corpses within 0.75 m, 40%/s). Burning corpses never
  rise and turn to ash after 6 s.
- **The flare** (§7) is the crowd-killer: a direct hit does 50 and sprays fire on everything
  within 1.3 m; on the deck it leaves a fire patch (radius 1.5 m, 10 s). One flare burns a
  lone shambler to death in every chapter before it covers 6 m, and a pack with it.
- **Gas** (bloater pop / Big Dave belch): a green cloud, radius 2.5 m, 4 s. The hunter loses
  15 hp/s inside. Fire touching gas → **gas explosion**: radius 3.5 m, 150 damage, ignites.
  Whoever lit it is paid, and 3+ kills is a nice shot ("GAS!").

## 6. Hunter & economy

Extra rules found in tuning (all in `src/config/rules.ts`): burning bodies ignite zombies
walking over them; standing in deck fire or held by a burning zombie burns the hunter
(10 dps); he takes 25% of blast damage (max 40); crawlers bite (8 dps) if not kicked; kicks
deal 60 and knock back 1.5 m; blasts near the edge can knock zombies into the sea; the
harpoon cable pins downed bodies it passes over; nails pin only bodies already down.

- Life 100, regen 12/s after 3 s without damage. Zombies that reach the hunter **grab**
  (`grab` state, 18 dps) until shot, kicked off (walk away / stomp) or killed.
- Bounties are paid on kill (killer = the player who dealt the fatal blow) and grow with
  the chapter ("danger money": ch.2 ×1.25, ch.3 ×1.5; bosses and crawlers excepted).
  Headshot kill bonus +$10. **Nice shot**: 3+ kills by one trigger pull, crane drop, cannon
  strike or gas explosion → +$25 × (n−2) × chapter and a callout ("NICE SHOT", "MASSACRE"
  for 6+, "CRUSHED", "DECK GUN", "GAS!"), Favour +8 (not for the deck gun).
- Start: $0, the revolver. Earnings (bot sims, skill 0.9): ch.1 ≈ $5.5–6k, ch.2 ≈ $8k,
  ch.3 ≈ $11–15k.
- **Retry chapter**: after a game over in a chapter the Bosun began with money or guns, the
  results offer "Retry chapter N" (the chapter from its start, with the money and guns he
  had then; a fresh pier) and "Restart night" (chapter 1). Retries skip the Best Nights table.
  The results count each chapter's passengers once (a game lost in the break after PIER HELD
  does not count that chapter twice). Best Nights records are validated field by field when
  loaded (a record from an older build or a partial write is dropped, never shown as NaN).
- Balance (bot sims, `npm run ferry:sim -- 40 <skill>`; skill 1 = flawless, 0.9 = a good
  player, 0.8 = a casual one — see §12; seeds 1000–1079): skill 0.9 clears ch.1 ≈ 86%,
  ch.2 ≈ 66%, wins ≈ 21% (80 runs); skill 0.8 ≈ 35% / 10% / 3%; skill 1.0 ≈ 98% / 95% / 60%
  (40 runs each; round 2's busier chapter-3 boss fight, below, took wins from 34% and 75%). Losses spread over the chapters — runners in the late crescendos most,
  then the Marathon and the Riot Squad — rather than one boss spike. A run averages about
  2 deck-gun strikes and 3–5 slow-motion beats per chapter.
- **Chapter 3 and the outboard** (round 2; `tools/humansim.ts`, a human-like player: aims at
  the visual lane with noise, reacts in 0.35 s, holds fire, buys the best gun it can afford
  but never the flare — so it saves for the outboard — and calls the deck gun on 4+; seeded
  per run, so two tuning variants are paired). In full games it won about half its runs and
  converted chapter 3 at ≈87% (19/22, 20/23 over two seed sets) — higher than chapter 2
  (64–81%): rushing the outboard looked like it made the finale easy. But from a chapter-3
  start (nail gun, shotgun, harpoon, $8,400; 60 runs) it wins 44/60 and **0/60 without the
  outboard**: the $12,000 outboard is the chapter-3 weapon by design, not a cheese, and nerfing
  it changes nothing (price $13,500: 44/60; overheat after ≈5.3 s instead of 6: 40/60). What
  helped the finale was its carry-over (corpse barricade, a full Favour, the horn), so the lever
  is the finale itself: the Riot Squad's escorts come **×1.25 as often** (shambler 1.7 → 1.35 s,
  jogger 2.3 → 1.85 s, bloater 15 → 12 s). Chapter 3 for the human-like player: 44 → 34/60 from
  a chapter-3 start, 19 → 16/22 and 20 → 19/23 in full games — the same direction every time,
  so chapter 3 is no longer easier than chapter 2. The bot loses chapter 3 mostly to the
  joggers of the spawn phase, but a busier boss fight costs it too: skill 0.9 over 80 runs
  (seeds 1000–1079) wins 27 → 17 (34% → 21%, the round-1 target was ≈20%), skill 1.0 30 → 24
  of 40, skill 0.8 unchanged (1/40); chapters 1 and 2 are untouched.

## 7. Weapons (lane hitscan unless noted; dmg per bullet/pellet; times in s)

| Id | Name | Price | Dmg | Clip | Fire | Reload | Spread° | Pierce | Notes |
|---|---|---|---|---|---|---|---|---|---|
| revolver | "Old Faithful" revolver | 0 | 34 | 6 | 0.30 | 1.6 | 0.6 | 0 | head ×3; hammer flick |
| nailgun | Pneumatic nail gun | 600 | 15 | 40 | 0.075 auto | 2.0 | 3.5 | 0 | nails stick in bodies; 3 nails pin a downed body (never rises) |
| shotgun | Pump shotgun | 1500 | 8×16 | 6 | 0.75 (pump) | 0.45/shell | 9 | 0 | pushes zombies back 0.6 m; close range head-off |
| flare | Flare pistol | 2200 | 50 | 1 | — | 1.2 | 0 | 0 | **projectile** (fast, slight arc, 28 m/s): ignites what it hits and sprays fire 1.3 m around it (or the deck: burns 10 s, r 1.5, ignites what walks through), lights the area (essential at night); **reloads itself while holstered** (switch, fire, switch back) |
| harpoon | Harpoon gun | 3500 | 220 | 1 | — | 2.2 | 0 | all (≤5) | skewers a kebab of up to 5 zombies, reels them 2 m toward the hunter, harpooned = permanently dead; pierces riot shields |
| outboard | "Outboard" boat-engine minigun | 12000 | 22 | 300 | 0.045 after 0.6 s pull-start spin-up | 3.5 | 4 | 0 | engine idles between bursts; overheats after ≈6 s of fire (stalls, restarts with a pull-start below 45% heat); head-off at close range |

Damage +10% per chapter after the first. Recoil pushes the hunter right a little (shotgun,
harpoon, outboard).

## 8. The horde (life; speed m/s; bounty $)

| Kind | Life | Speed | Bounty | Head ×| Notes |
|---|---|---|---|---|---|
| shambler | 70 (+15/ch) | 1.1–1.6 | 20 | 3 | random "looks": fisherman, tourist (Hawaiian shirt), waiter (tray), granny (handbag), office worker, lifeguard |
| jogger | 50 (+10/ch) | 4.5–5.5 | 40 | 3 | race bib + headband; zig-zags lanes; trips over corpses |
| bloater | 160 (+30/ch) | 0.55–0.7 | 90 | 2 | big, with a swollen, sickly yellow-green gut; **pops** on death: gas cloud + 2 crawlers spill out; never rises |
| medic ×2 + patient | 60 each / 70 | 1.3 | 50 / 30 | 3 | two medics carry a stretcher with a patient; kill a medic → stretcher drops, the patient gets up after 1.5 s as a shambler, the other medic walks on as a shambler. Hitting the stretcher (part 'stretcher') does nothing |
| riot (ch.3) | 400 | 0.8 | 200 | 3 | police-blue riot gear with reflective hi-vis tape (readable at night) and a hi-vis shield trim: **helmet** (120 hp; head immune until gone), **shield** (300 hp; blocks body hits from the front until gone), **chest plate** (150 hp; halves body damage). Harpoon ignores plates; shotgun deals ×2 to plates. Plates fly off as debris |
| crawler | see 4.1 | 0.55–0.75 | 8 | 3 | risen corpse; low profile |

Bounties above are chapter 1's; ordinary bounties are ×1.25 in chapter 2 and ×1.5 in chapter 3.

**Bosses** (the boss bar replaces the boarding bar when they arrive):
- Ch.1 **Big Dave** — a 3 m bloater in a stained chef's apron. Life 2500. Walks 0.55 m/s,
  escorted by a shambler every ~3.2 s and a jogger every ~6 s. Every 5 s he **belches** a gas
  cloud 4 m ahead in his lane. At 50% life he tears off the apron and walks 0.9 m/s. Death:
  huge pop — gas cloud radius 4, 6 crawlers that spill out 2.2 m **behind** him (away from
  the gangway) and drag themselves along at 0.4–0.55 m/s, gore rain, 1.2 s slow-motion.
  Bounty $1000.
- Ch.2 **The Marathon** — 40 joggers (boss = true, "marathon pace" 3.5–4.3 m/s, $30 each) in
  **pace groups**: 4–5 runners bunched within ±0.75 m of one lane, alternating between the
  near and the far half of the deck, a group every 3.5 s — line them up for harpoon kebabs
  and shotgun knock-back. The 40th wears a gold medal (bounty $500). Boss alone (the field
  must be clear first, or 25 s pass).
- Ch.3 **The Riot Squad** — 3 riot brutes in formation (z −3, 0, +3), shields up (life 2000,
  plates ×2, 1.15 m/s), escorted by a shambler every 1.35 s, a jogger every 1.85 s and a
  bloater every 12 s (the busiest boss fight; ×1.25 in round 2, see §6). Bounty $800 each.
- **Mop-up**: when the bosses are down, the escorts stop and the boss bar becomes **MOP UP ·
  N LEFT** (brass) while any zombie that could still reach the gangway is alive; each one gets
  a chevron over its head (through gas too). Crawlers further back than x = 2 don't count:
  they can't reach the gangway during the break and carry over like the bodies. The pier is
  **held** (PIER HELD, the chapter is complete) only once it is clear — never with something
  still able to board.

## 9. Chapters

| Ch | Name | Clock | Spawn phase | Spawns | Boss | Passengers |
|---|---|---|---|---|---|---|
| 1 | Last Light | 18:40 | 75 s | 64 shamblers, 11 joggers (from half-way), 5 bloaters, 2 paramedic teams | Big Dave | 48 |
| 2 | Blue Hour | 19:25 | 90 s | 52 shamblers, 32 joggers, 5 bloaters, 3 paramedic teams | The Marathon (alone) | 60 |
| 3 | Lights Out | 21:10 | 100 s | 64 shamblers, 40 joggers, 6 bloaters, 3 paramedic teams, 6 riot | The Riot Squad | 72 |

**A crescendo.** Each chapter's schedule is built when it starts: spawn times are drawn from
a density that rises through the spawn phase, ∝ 0.3 + 1.6·u (u = 0 … 1 of the phase), each
spawn jittered within its slot. Chapter 1 opens with a few lone shamblers; the last third is
the busiest (≈2× the first) and the boss lands on the peak. Kinds start part-way through:
joggers from 8% (chapter 1: from 50%), medics 15%, bloaters 20%, riot brutes 35%. **Surges**
come later: from 30% (joggers 25%) of the phase a spawn may pull the next few of its kind
into a pack (shamblers 2–4, joggers 2–4; centred on their mean time, totals unchanged), the
chance growing from 20% → 65% (joggers 30% → 80%) toward the end.

The chapter ends with the mop-up (§8), then a 3 s break and a 2.5 s chapter splash. During
the break and the splash the dead rest (rise timers hold) and nothing can hurt the Bosun.
Corpses and blood carry over between chapters (the pier keeps its history); crane and horn
are restored; downed bodies keep their timers.

Time of day: `timeOfDay` runs 0 → 1 over the whole game (ch.1 0.00–0.30, ch.2 0.33–0.62,
ch.3 0.66–1.00), advancing with spawn-phase progress. The palette (`render/env/tod.ts`,
unit-tested in `tests/tod.test.ts`): chapter 1 opens on a sunset (warm key light, sun glow),
chapter 2 on blue hour (a key at 0.33: cool key light, the sun gone, a dim horizon),
chapter 3 is deep night (lamps fully on, stars out by the end).

## 10. Feel ("juice")
- **Hit-stop**: 45 ms freeze on a headshot kill, 70 ms on a harpoon kebab ≥3.
- **Slow-motion**: a MASSACRE (6+ with one pull) or a set piece (crane drop, cannon strike,
  gas explosion) → 0.35× for 0.6 s (eased), at most once every 4 game seconds; boss death
  0.25× for 1.2 s (always). Ordinary nice shots (3–5) keep their money and callout only.
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
- World overlay: the crane's hook marker and line-up hint (§4.3), MOP UP chevrons (§8), a red
  ring under any zombie within 4 m of the gangway, the culprit marked at a game over, the
  grey "not dead yet" ring and the red twitch '!' over downed bodies.
- Lessons at the moment they help: the horn (the first time one of them nears the gangway
  while it's ready: "· H blows the ferry horn" and the H chip flashes), the crane (the first
  crowd under the pallet), the stomp (a body twitching within reach), the fire keys (Ctrl).
- Title: "LAST FERRY" — *No one boards dead.* Live attract mode behind it. The attract game
  stays a backdrop under the menu: its sounds play at 40% with a gunshot at most every
  0.45 s, and nothing meant for a player plays (no coins, stings, purchases, Favour bell or
  crowd cheers), nor does it cue or duck the title music.
- The chapter splash lasts exactly as long as the logic's splash phase (it ends on
  `chapterStart`), and the splash, callouts and info lines run on UI time: frozen while
  paused (their CSS animations too), real time otherwise (× `?speed`). A one-time lesson shown
  just before a pause is still there after Resume.
- Money pop-ups (`game/MoneyPops.ts`): payments to one body merge, many bodies in one frame
  become a cluster, small ones fold into the next pop-up while the screen is busy — and when
  no next one comes, the folded money pops up on its own where it was earned once the screen
  calms down (every dollar paid is shown).
- Options apply live, Graphics quality included: Low / Medium / High switch the wet-deck
  reflection, the shadow map, which lamps are real lights, effect lights and particle
  density, the ragdoll budget, the shadow casters, post-processing and resolution without a
  reload (the lit shaders recompile once when the light count changes). The blood decal map
  keeps the resolution it was created with.
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

**Boot** (`src/main.ts`): the loading screen stays up only for the essentials — the pier's
first frame, the shader / pipeline warm-up (one of everything the view can draw, compiled
and drawn once out of sight) and the menu / title sounds. Sound baking runs in a Worker
from the first moment (`audio/bakeWorker.ts`: the same recipes, the samples handed back as
transferable buffers; main-thread idle slices where Workers are unavailable), most urgent
first; the rest of it, and the ~210 zombie looks, finish behind the title (a few ms per
frame). Until a sound is baked, a title / ambience / music-bed play of it is skipped and the
sound jumps the queue; a game sound is baked on the spot. Boot milestones are User Timing
marks (`lf:env`, `lf:game`, `lf:first-frame`, `lf:shaders`, `lf:sounds`, `lf:title`).

**Frames** (`Game.shouldRender`, installed by `main.ts` as a gate on `Stage.frame`): the
pause menu holds the last picture under its blurred scrim and draws nothing (a resize, an
option change or the tab coming back redraws it once); behind the game-over results the
scene redraws at 12 fps and behind the victory results (the ferry pulling away) at 30 fps;
everything else draws every frame. A hidden tab suspends the AudioContext (the browser would
otherwise throttle the timers that schedule music and ambience into fragments) and resumes
it when the tab comes back.

**Graphics quality** (Options, live; `Environment.setQuality` + `GameView.setQuality` +
the stage's post chain and pixel ratio):

| | Low | Medium | High |
|---|---|---|---|
| Wet-deck reflection | off | 0.35 scale, every other frame | 0.5 scale |
| Shadow map | 1024, every other frame | 2048 | 2048 |
| Shadow casters | the Bosun and the pier's set pieces (zombies and bodies get blob shadows) | + zombies and bodies | + corpses on the deck |
| Real lamp lights / effect lights | every other far lamp / 3 | far row / 6 | all / 8 |
| MSAA / pixel ratio cap | none / 1 | 4× / 1.5 | 4× / 2 |
| Particles / ragdolls at once | 0.55 / 10 | 0.85 / 14 | 1 / 18 |

**Bodies** (`render/view/Bodies.ts`): at most 10 / 14 / 18 ragdolls simulate at once and
4 / 5 / 6 new ones start per frame (a blast that kills dozens staggers them over a few
frames). Room is made by retiring the oldest ragdoll that already lies still on the deck;
a body in the air is never frozen or baked (one found frozen in the air is woken to fall
first). A death over the budget gets a scripted collapse to its corpse spot, and limbs torn
off over the budget fly as single-body pieces (40 / 70 / 100 at once, gore beyond that).
Bodies stay one skinned mesh while they fly, lie, twitch and burn; a body that is dead for
good is baked into the corpse batches (which persist across games and grow on demand).

**Stage**: dynamic resolution — when the GPU is the bottleneck (frames slower than ~45 fps
for over a second while the JS leaves most of the frame idle) the render scale steps down
by 0.1 to at least 0.6, and climbs back by 0.05 after 4 s well above 55 fps (with a 20 s
lock against see-sawing). Resizes are debounced (120 ms) and a device-pixel-ratio change
counts as one. If the WebGL context is lost, rendering stops and a "Graphics reset…" note
shows (with a Reload button after 5 s); on restore the stage resizes and the environment
map is rebuilt (the blood on the deck is gone).

**Events** (`core/events.ts`): the logic emits synchronously inside `World.step`, and every
subscriber is presentation. Each handler runs isolated: a throwing view / audio / UI
handler is logged once per event name (counted in `events.errors`) and the tick carries on,
so a presentation bug can never leave the logic half-updated (a zombie dead but not
removed, a bounty unpaid). Handler lists are copy-on-write, so subscribing or unsubscribing
during an emit is safe. `projectileEnd` says what ended (`kind` flare / shell) and on what
(`reason` target / deck / gas / hook / gone): the flare-burn sound plays only for a flare
burning into a zombie or the hook.

**The bot** (`src/core/Bot.ts`; attract mode and `npm run ferry:sim`) plays with the real
rules: it lines up with the most urgent zombie through the exact inverse of the
view-consistent hit rule, buys from a list (nail gun, shotgun, flare, harpoon, outboard),
switches to the flare for a crowd or a gas cloud with company, kicks crawlers, stomps bodies
about to rise, blows the horn, calls the deck gun and drops the crane only on a crowd (it
keeps out of the hook's lane otherwise). Its `skill` (0..1) is a real difficulty knob:
reaction to a new target 0.1 + 5·(1−skill) s, lane-judgement error ±12·(1−skill) m (wandering
±6·(1−skill)), head aim on (skill − 0.6)/0.4 of its targets, a buy delay of 40·(1−skill) s
once the next gun is affordable, trigger discipline only at ≥ 0.95, and the horn, crane and
deck gun used later and less cleverly as skill drops.
