# LAST STANCE

A cinematic, free-flow martial-arts combat simulator for the browser. One fighter (two to choose
from) against escalating waves of thugs, armed enforcers, brutes, elite martial artists and bosses, in five
arenas — a moonlit warehouse, a rain-lashed neon rooftop, a graffiti-covered back alley, a
penthouse where everything breaks, and a containment lab with its own guards and monsters —
Arkham-style flow, Assassin's Creed counters, Spider-Man finishers and Sifu-style technique,
with **bodies and blood that never disappear**.

Built with **three.js** (rendering) + **Rapier** (props, debris, weapons) and the **Ragdoll Lab
"euphoria" active-ragdoll engine** (bodies), TypeScript and Vite.
Everything visual is procedural (characters, textures, animation); audio is CC0.

## Run it

```bash
npm install
```

```bash
npm run dev
```

Open http://localhost:5173 and click **FIGHT**. For a production build:

```bash
npm run build
```

```bash
npm run preview
```

Recommended browsers: Chrome/Edge or Safari 17+ (WebGL2). On a MacBook Air M1 the default
**HIGH** preset targets 60 fps; drop to **MEDIUM** if you run many other apps, or leave
*dynamic resolution* on (default) and it will adapt automatically.

URL options: `?quality=low|medium|high|ultra`, `?wave=10` (start at a wave), `?debug=1`
(stats overlay), `?bot=1&god=1` (attract mode — a scripted bot plays), `?fighter=jin|scarlet`.

## Controls

| Input | Action |
|---|---|
| WASD / left stick | Move (camera relative) |
| Mouse / right stick | Camera (click the game to lock the pointer) |
| LMB / X (Square) | Strike. Direction + strike picks a target; strikes chain between enemies |
| RMB tap / Y (Triangle) | Counter when ⚡ appears over an enemy. Last-moment = **perfect counter** |
| RMB hold / LT | Block (drains guard; red attacks break through) |
| Space / A (Cross) | Dodge. Toward a nearby enemy = vault over them (dazes them) |
| Q / B (Circle) | Stun strike — opens up brutes and guards for a beatdown |
| E / RB | Grab (then LMB = knee, E = throw in your move direction) · pick up weapons |
| F / LB | Finisher (spends a charge) · ground takedown on downed enemies (no charge) |
| R / RT | Special — Scarlet's pistol (loads with knockouts) |
| G / Back | Throw your held weapon |
| Esc / P / Start | Pause & settings |

**After a run:** *SPECTATE* on the results screen hands you a free camera to fly round the room
and take in the aftermath while the fight plays on without you — WASD / left stick fly where you
look, mouse / right stick look, E / Q or Space up and down, Shift fast, Esc back to the results.

**Telegraphs:** ⚡ (gold ring shrinking to the hit) = counterable. Red **!** = unblockable — dodge it.
Finisher charges are earned inside one unbroken combo (10 hits for the first, 14 more for the
second, at most two stored); a broken combo loses the half-built one. After a finisher the next
execution waits 7 s (4.5 s after a ground takedown) — the pips dim and read RECOVERING.
Taking a hit breaks your combo; finishers and perfect counters restore a little health.

## What's in the box

**Two fighters** — pick on the title screen (*FIGHTER*), or `?fighter=jin|scarlet`.

* **Jin — Muay Thai.** Elbows, knees, hooks and heavy hands; the move list below.
* **Scarlet — kickboxing.** A redhead in a black leather biker jacket, a tight black mini
  skirt, sheer black tights and high-heeled knee boots. Lighter, faster hands (a whipping
  backfist, a palm heel under the chin) that set up kicks: a snapping lead-leg kick, the
  roundhouse and side kick, an **axe kick** swung up past her own head and dropped on the
  target's, a **spinning hook kick**, a **flying side kick** to cross the floor, and two finishers
  of her own — an axe kick through a dazed guard and a jumping spinning heel kick. Her
  **special**: every 6 knockouts load her suppressed pistol (two loads at most, shown under the
  finisher pips); **R / RT** and she draws from the hip, takes it in both hands at arm's length
  — the arms aimed live at the mark, the camera over her shoulder, time slowing — and
  double-taps: body, then head, each a soft *thup* through the can and the slide clacking
  back (synthesized: a swept puff of noise, a low knock, two metallic clicks; then the casing). A thug drops; a boss loses a tenth of his health a shot. The room hesitates
  for a beat while she does it, and she's untouchable until she's fired. She runs
  faster, her strikes come out quicker, her punches hit lighter and her kicks harder; she has
  her own voice (CC0 recordings) and her own walk (narrower steps and a hip sway, shorter
  strides in heels).
* **How she's built.** The same procedural pipeline as everyone else, extended: an hourglass
  torso with a bust and real hips, a separate open jacket shell with lapels, a rolled collar
  and edges that have thickness, a skirt skinned to the thighs so it rides with each kick,
  long wavy hair (a cap with a side part, a clumped curtain with V-cut tips, side-swept bangs, a
  lock over one shoulder) that trails her movement in the vertex shader, heeled boots on a
  skeleton whose foot is pitched onto the ball (the IK, the gait and the clips all keep working
  in heels), and a face painted at twice the detail of the body (both fighters get one).
* **Finish, not just colour.** The character atlas's alpha now says what a surface is made of:
  glossy leather and patent heels, wet eyes and lips, metal zips and earrings, and sheer tights
  that let the skin show where they face you and go dark at the edges.

**Combat** — free-flow targeting with motion warping (strikes close the gap and land on the
actual head/gut of the target; further than a lunge away, a few running steps come first),
14 contextual unarmed strikes (jabs, crosses, hooks,
uppercuts, elbows, clinch knees, front/side/roundhouse/spinning back kicks, flying knee, back
elbow/back kick for enemies behind you), combo meter with variety multiplier, counters
(catch-and-elbow, parry-palm, arm break, hip toss, weapon disarm) with perfect-timing bonuses
and Arkham-style chaining of multiple attackers, dodges with perfect-dodge slow motion, vaults,
block/guard break, stun + beatdown, grabs with knees and directional throws that bowl over
other enemies and slam into walls, weapons (knife, bat, machete) you can disarm, pick up, use,
wear out and throw, 7 cinematic finishers (spinning roundhouse, arm-break knee, double-palm
launch, sweep + axe kick, flying knee, bat smash, blade impale) with camera shots and slow
motion, environmental head slams into walls/pillars/crates, ground stomps.

**Enemies** — thugs, knife/bat/blade wielders, agile runners that evade, brutes that absorb
blows until stunned, guards that block and riposte, elite fighters with combos and feints,
and bosses: the Butcher, Viper and Grandmaster Kael (the lab has its own: the Warden and
Subject Zero). The Butcher is a brute writ large. The others fight like bosses rather than thugs
with more health: scripted combos that mix counterable (gold) and
dodge-only (red) strikes, hyper armour through their own attacks, poise that makes them break
away from a flurry, and only a *perfect* counter lands on them (an early one is read and
punished; a perfect one stuns them for a punish window). Finishers only work on a stunned boss
and take a slice, not the bar. **Viper** slips half your strikes and slashes back out of the
dodge, throws poisoned knives from range (dodge them; a missed knife clatters down as a weapon
you can pick up), backflips out of reach and, from phase two, vanishes in smoke to strike from
behind. **Kael** guards most strikes and reverses early counters, picks up a sword and a flying
knee from across the floor in phase two, and in phase three unleashes five-strike fury strings
and a chi shockwave that blasts everyone near him; only then does he run out of breath.
**The Warden** (the lab's head of security) fights in tight shock-baton strings — a hit jolts
you, a block costs most of your guard — aims a taser at you with a red laser for a long moment
before he fires (dodge it), and in phase two calls a lockdown and his men through every door.
**Subject Zero** bursts out of his containment tank: a giant that shrugs off blows and stun
strikes; sidestep his unblockable charge with something solid behind you and he ploughs into it
and stands there stunned — that's your window; from phase two his two-fisted slam throws
everything near him. A stun strike dazes a boss for under a second, and not again for eight.
Each boss walks in on its own camera shot, and every phase change stops the fight for a beat. An AI
director hands out attack tokens (at most three attackers at once),
coordinates pincer attacks, punishes openings, and adapts: counter-heavy players see more
unblockables and feints. Every attack telegraphs: its load-up always shows for at least half a
second before contact (a little less for a combo follow-up), and two attacks you can't counter
together never land at the same moment. Enemies sizing you up keep out of the camera's view of
you, the camera rises over a crowd, and anyone who still steps in front of it thins out. Injured
enemies hunch, limp, clutch their side and hang back; broken arms dangle and change their
moveset. 15 authored waves introduce mechanics gradually, then endless mode scales forever.
Settings → Gameplay → *Difficulty*: STORY (longer warnings, softer hits, fewer attackers),
FIGHTER (default) or BRUTAL.

**Motion capture** — every fighter moves on real motion capture from the CMU Graphics Lab
database: a boxer's guard idle, walk, jog, run and sprint cycles, a backward walk and a
step-together side shuffle. `tools/mocap/convert.py` extracts phase-aligned cycles whose loops are
seamless in position *and* velocity (the end cross-fades into the stride before it), retargets them
to leg- and arm-length-normalised effector tracks, and gives them one fighter's build: pelvis
tucked, lower back upright, no subject's sideways tilt, feet slightly turned out, the stiff-legged
walkers on soft knees, the side shuffle shortened and the boxer's bounce calmed. At runtime the
tracks are sampled on splines and blended by speed and direction on one gait clock (direction
weights glide, so reversing a side-step never swaps clips between two frames), cadence and stride
are warped to the real speed about each foot's own place, the legs turn into the travel direction,
planted feet are locked in the world (a foot left behind takes a quick step to catch up; a leg at
full stretch lowers the hips a little, on a spring, or lets the heel go early), the knees track
over the toes, and a guard, block or weapon grip is laid over the arms — all solved through the
same IK as everything else, so the motion fits the character and blends into the procedural combat
moves. Settings → *Motion-captured movement* switches back to the procedural gait.

**Captured strikes** — the punches, kicks and evasions are real martial-arts captures from ACCAD's
Open Motion Project (CC BY 3.0, see CREDITS): jab, cross, lead and rear hooks, body hooks, body
jab and cross, uppercut, backfist, a folded-arm elbow, front, push, side, axe, crescent and
roundhouse kicks (head, body, lead leg), a spinning back kick and a reverse spinning hook kick,
the street's wind-up punches and kicks, a Muay Thai clinch knee (CMU), getting up off the floor
from the back and from face down (CMU; the end eased into a guard - the takes finish hunched
over), and the player's side-step and retreat. Jin and Scarlet
draw different strikes from the same library; enemies borrow some, started earlier and slower so
their wind-ups read. `tools/mocap/strikes.py` (`python3 -I tools/mocap/strikes.py <accad dir>
<cmu dir> src/anim/mocap/strikes.json`) finds each strike's moment of contact, cuts the take
around it, and retargets it like the locomotion: trunk and head as calibrated segment rotations,
wrists from the shoulder in arm lengths (any build reaches the way the capture did), knees and
elbows as bend directions, feet with their full 3D rotation. The feet are cleaned up for contact:
each take's floor comes from its flat-footed ankles, a key holds the foot as if flat (the runtime
turns it about the ball or the heel), a planted foot that turns, turns about the single point of
its sole that best explains the capture, and a foot the capture slides along the floor takes a
small step instead. At runtime a strike closes distance only as far as its feet can carry it (a
punch steps in, the front foot first; a kick leans over its standing foot), the rest is covered on
foot first; feet move only while they are in the air — the root's travel and any difference
between the fighter's stance and the capture's are carried by the capture's own steps, or by a
quick step added where needed; the stance decides which hand leads (a strike or its mirror,
whichever starts from the feet the fighter stands on); foot turns are interpolated as rotations;
and the striking fist or foot is steered onto the target only in the last moments before contact.

**Animation** — an IK pose solver drives every limb: the captured strikes, evasions and get-ups
above, and authored motions for everything else (hit reactions, the flying knee, weapon attacks,
paired counters/finishers/takedowns authored as two synchronized tracks);
procedural locomotion with planted feet (no foot sliding) driven by a human gait model — walk
and run cadence / duty factor from biomechanics data, heel strike and toe-off rolling over the
ball of the foot (the foot pivots on its real contact point), a running flight phase with heel
recovery and knee drive, pelvis twist and list, arms that counter-swing the legs, hips that turn
towards the travel direction when circling (the chest stays on the opponent, legs never cross),
early re-stepping when a foot is left behind, turn-on-the-spot stepping and a living guard idle
(weight shifts, light bounce). Each swing runs on its own clock, so speeding up, slowing down or
snapping round to a new target never throws a planted foot into mid-air;
**inertialized transitions** (velocity-matched offset decay) on every clip/locomotion/ragdoll
switch, with a **leg lock** that keeps planted feet exactly where the new pose puts them while
the body blends (no skating between moves); strike timing curves that explode out of a settled
wind-up and stay fast into contact instead of jumping in a single frame; an IK solver with memory
(bend planes, hand roll and wrist twist stay continuous through singular poses, limb roll comes
from the hinge axis so a fist pulled to the chin or a knee driven to the chest never flips);
spring-based secondary motion for hit reactions; active (euphoria-style) ragdolls for staggers,
knockdowns, throws and deaths — see below. An automated probe (`probe=1`) measures one-frame
pops, hip jumps and foot skating over a bot playthrough.

**Active ragdolls (euphoria engine)** — knocked-about bodies are simulated by the Ragdoll Lab
engine (`src/world/euphoria/`): an XPBD rigid-body solver with a 17-segment, 75 kg muscle-driven
human whose controller balances, takes catch-steps, windmills its arms, braces for falls with
outstretched hands, writhes and clutches its wounds on the floor, gets back up by itself (roll
over → push up → kneel → lunge → stand) and, when killed on its feet, has its muscle tone drain
away in a dying stagger, with death twitches. The bridge (`bridge.ts`) hands a character over
from animation with its exact pose and per-limb momentum and writes the simulated pose back onto
the 22-bone skeleton every frame (render-interpolated, clavicles shrug with raised arms).
In play:
* **Heavy blows** can trigger a *physical stagger*: the body tries to step out of it — it
  recovers and blends back into the fight, or it goes down (more likely when hurt, and when a
  wall, prop or pile of bodies is in the way).
* **Knockdowns / throws** fall with protective arms; healthy enemies then use the animated
  get-up from wherever they lie, hurt ones struggle up physically (slow and vulnerable).
* **Deaths:** beaten to death on the feet → dying collapse; finishers / big hits → instantly
  limp. Blows push the struck part and travel into the torso, so heads snap and bodies spin.
* **Slow deaths:** a killing blow that isn't to the head (and doesn't launch the body) often
  leaves the enemy writhing on the floor for a few seconds: the legs give, knees draw up, the
  trunk curls round the wound and rocks on its side, hands clutch the wounds, groans weaken and
  blood wells out underneath — until the strength drains away and the body goes limp.
* **World coupling:** arena walls, pillars and crate stacks are static colliders; every settled
  corpse becomes one too (bodies pile up and trip over the dead); oil drums and crates are
  two-way proxies of the Rapier props (falling bodies topple drums, smash crates and drape over
  them); standing fighters are kinematic capsules — a body crashing into an enemy makes them
  stumble or go down. Impacts drive body-fall / limb-slap sounds, dust, and blood where a head
  hits the floor or a wall.
* **Budget:** substeps and the number of simultaneous active bodies scale with the quality
  preset (7–14 substeps, 4–12 bodies); substeps also adapt to a per-step time budget, and extra
  bodies beyond the cap fall back to passive Rapier ragdolls. Settings → *Active ragdolls*
  switches the whole system back to classic Rapier ragdolls.

**Arenas** — pick one on the title screen (*ARENA*), or `?map=warehouse|rooftop|alley|apartment|lab`.
All five share the same footprint (so the AI, the camera and the blood atlas keep their
bearings) and are built from a shared kit (`mapKit.ts`): paintable floors and walls with doors
(and gates nobody sees that keep fighters in), a non-tiling *overlay* painted between a
surface's own texture and the blood (graffiti, signage, rugs, stains — it takes on the surface's
light and shade), a point-light budget per quality preset, and a reflection probe of the finished
room for glossy floors and glass.
* **The Warehouse** — moonlit concrete: pallet racking with stock, lockers, a workbench, an
  overhead crane rail with chains, bulkhead wall lamps washing light down the walls, rain running
  down grimy factory windows with faint moon beams, a flickering lamp that sparks, a red beacon
  over the loading door, exit signs, hazard-striped thresholds, oil drums and crates you can knock
  over or smash.
* **The Rooftop** — a wet roof high over a neon city in a storm. Standing water collects at the
  drains and mirrors the skyline, the signs and the moon (a reflection probe of the scene); the
  NEON DRAGON billboard hums and stutters and washes the roof magenta, the HOTEL sign cyan; rain
  falls in streaks and rings the puddles; lightning forks over the skyline and lifts the fog,
  the sky and every reflection for a moment, and thunder rolls in after it. The city's near
  blocks are below you, a street grid glows far below, sirens drift past. Fighters are soaked
  (glossier skin and cloth catch the neon), bodies hitting the roof throw up spray, and
  footsteps splash. Enemies come out of the stair huts or climb up the fire escapes. The edge is
  only a knee-high parapet: **a heavy blow, a throw or a finisher near it sends an enemy over**
  — they fall flailing into the street (OVER THE EDGE, double score) with a look over the lip
  as they drop. Bodies, weapons, drums and blood that go over are gone for good.
* **The Alley** — a back lot behind tenements where three alleys meet, every wall layered with
  procedural street art (`graffiti.ts`): full-colour pieces with clouds, 3D blocks, outlines,
  fades and stripes, shines, drips and overspray, cartoon characters beside them, two-tone
  throw-ups, hand-style tags with crowns and swooshes, cursive scribbles, stencils that keep their
  bridges, wheat-pasted posters torn back to the ones beneath, grey buffs over old tags, and the
  street's grime over all of it (`?viewer=graffiti&seed=N` paints a wall of it on its own). Brick
  and painted block with normal maps, lit windows and a fire escape, dumpsters, a burnt-out car,
  power lines sagging overhead (sneakers over the line), a fire in an oil drum, steam from the
  sewer, floodlights and a dying fluorescent tube, a chain-link fence onto the alley beyond, the
  street at the mouth with a streetlight and a liquor store's neon; cracked asphalt with oil,
  a storm drain, litter, a chalk outline and puddles that reflect the lot; bins, bags, boxes,
  tyres, pallets, cones and bottles to knock about.
* **The Penthouse** — a loft forty floors up behind a wall of glass in the rain (blood sticks to
  the glass), exposed brick with a fireplace, oak floors and rugs, a kitchen island, a dining
  table, a grand piano (a body thrown onto it crashes a chord), art on the walls — and about fifty
  physical props: chairs, stools, armchairs, a glass coffee table that shatters and leaves its
  frame, lamps, plants, vases, bottles on every surface, the TV, a monitor, speakers, boxes.
* **The Lab** — Argent Biosystems' containment level four: white panels and signage, glossy epoxy
  with a hazard ring, server racks blinking, specimen tanks with things floating in them, benches
  of glassware, a live monitor wall, a blast door, and in the middle a tank with something huge
  asleep in it. Staffed by its own people (uniformed guards, techs in lab coats with scalpels,
  black-ops, riot guards, escaped test subjects, mutants in chains) and its own bosses in place of
  the Butcher and Viper; a lockdown sets the beacons sweeping, the room pulsing red and a klaxon
  whooping.

**Props** — every arena's loose objects come from one library (`propLib.ts`, 26 kinds): one
instanced draw call per kind and layer, Rapier bodies mirrored into the active-ragdoll world
(bodies land on them and shove them), impacts detected from sudden changes of velocity — they
clatter, and glass, china, wood, screens and bags shatter into lasting debris with synthesized
breakage sounds. Fighters on foot shove the small things and walk round the big ones.

**Interface** — a cinematic title over the live arena, keyboard-navigable menus with UI sounds,
a HUD with a damage-trail health bar, guard and finisher meters, tiered combo meter, kill feed,
counter / unblockable markers with off-screen arrows, damage-direction arcs, boss bar with phase
marks, a pause screen with run stats, tabbed settings and a ranked results screen.

**Wounds and blood** — fighters carry their damage: lacerations (a dark open slit in a smear
of blood), bright glossy fresh blood that runs down the face and beads at the end, then dries
darker and matte; bruises that come up hot red and swollen and deepen into a mottled purple core
over the next seconds; spatter from other people's blood. On the floor, pools spread with lobed,
fingered edges and lean downhill — the concrete falls gently towards the drains — then send thin
veins of blood creeping away that branch, thin out and bead where they stop; bleeding bodies
that slide or roll smear their blood behind them.

**Score** — a procedural adaptive soundtrack (no samples): a dark D-minor progression over a
breathing pad and sub drone in a generated warehouse reverb, building with the fight from a
pulsing kick and gated bass to a full synthesized kit, a plucked arpeggio and metal accents,
with a distorted bass, a low choir and a ticking clock for bosses, and stingers for a wave
starting, a wave cleared and a boss walking in. Badly hurt, a heartbeat sits under the mix; the
last enemy of a wave goes down in slow motion with an orbiting shot.

**Look** — PS2-style low-poly skinned characters generated in code (29 outfit variants: hair,
facial hair, headwear, jackets, armour, tattoos, scars) with hand-painted-style canvas
textures, warm sodium lamps vs. cold moonlight, HDR bloom, ACES grade, grain and vignette.

## Permanent bodies and blood (how it stays fast)

Nothing is ever despawned, faded or capped. Instead the expensive representation is converted
into a cheap one:

* **Bodies:** a dying enemy is an active ragdoll until it settles (calm for 0.5 s).
  Its final skinned pose is then baked on the CPU into static geometry and appended to a
  spatially chunked batch (4×4 arena cells, growable buffers, compact attributes: half-float
  bind positions, int8 normals, uint16 UVs). Each corpse keeps its outfit (texture-array layer),
  every wound/bruise/blood splatter (per-corpse wound row in a float data texture, evaluated in
  the same shader as live characters) and gets simplified static colliders so later ragdolls
  pile onto it instead of through it (in both physics worlds). Corpses receive but don't cast shadows; a contact-shadow
  AO blob is painted under each one instead. A coarse height field of all bodies lets live
  fighters plant their feet on top of bodies instead of clipping through. Draw calls grow by
  one per ~30 bodies; physics cost of a settled body is a sleeping static collider.
* **Blood:** every static surface (floor, walls, pillars, crates) samples one persistent
  *blood atlas* render target via a unique second UV set. Droplets are simulated particles;
  where they land they paint drops, splashes, wall drips, smears, growing pools, rivulets and
  bloody footprints directly into the atlas (additive / max blending, never cleared). Rendering
  cost is constant regardless of how much blood exists; growing pools and creeping rivulets are
  redrawn only when they change a texel, on tight quads. Every splat is also recorded in a
  compact log so the atlas is rebuilt exactly after a WebGL context loss.
* **Weapons and debris** that come to rest become instances of shared instanced meshes.

Measured in the headless software-GL test environment (no GPU): 300 permanent bodies
(581k corpse vertices in 33 batches) + 22,600 blood splats → 92 draw calls, ~6 ms median CPU
frame time. A 12-minute bot session (wave 9 → 27, every enemy type and boss) left 173 bodies
and 41,000 splats with no errors.

## Performance & settings

Presets (Settings → Quality) change render scale, MSAA, shadow-map size, bloom, blood-atlas
resolution and particle budgets — never whether blood or bodies exist. Dynamic resolution
lowers the internal resolution when frame time exceeds ~19.5 ms (p75) and restores it when
there is headroom. Static arena geometry is merged per material (~37 draw calls for the whole
arena), characters share one program, shaders are pre-compiled at load, the physics world only
simulates active ragdolls/props, and the scene renders to an HDR target with a single fused
grade/composite pass.

## Testing

Headless scenarios (start `npm run dev` first; uses the preinstalled Playwright Chromium):

```bash
node tests/run.mjs "test=waves&frames=10800&god=1" tests/out/waves.png
```

```bash
node tests/run.mjs "test=stress&corpses=300" tests/out/stress.png 900
```

```bash
node tests/film.mjs "test=film&enemy=club&n=2&warm=40&framing=-2.8" tests/out/film 12 5
```

`node tests/ui.mjs tests/out/ui` screenshots every interface state, `node tests/arena.mjs
tests/out/arena` renders fixed-camera views of the arena, and the locomotion viewer films gaits
frame by frame: `node tests/film.mjs "viewer=loco&film=1&path=line&speed=1.6&style=relaxed&warm=60"
tests/out/walk 16 4` (paths: line, strafe, back, diag, circle, turn, stopgo).

`test=waves` runs the real wave game with a scripted bot (counters, dodges, finishers; add
`probe=1` for the animation quality report: pops, hip jumps, foot slide by gait phase;
`fair=1` reports how much warning enemy attacks gave, per archetype; `boss=1` reports how a boss
fight went; `difficulty=story|brutal`; `bosshp=0.3` starts a boss already in its later phases;
`map=rooftop` plays it on the roof),
`test=ledge&map=rooftop&mode=knock|death|stagger` drives an enemy into the parapet and logs the
fall, `test=view&map=rooftop&px=0&pz=4&camyaw=0&campitch=0.25` renders a still of an arena from
any spot (`bolt=1` brings a lightning strike straight away),
`test=clips` replays every player strike against a still target and reports limb flips (bone
swing / roll spikes), the fastest twist and where it is, planted-foot slide and IK reach misses
(`list=roundhouse&dump=roundhouse@0.1-0.2` prints the IK effectors; `fighter=scarlet` checks her
moveset; `anyside=1` lets the stance pick the mirror),
`test=eatk&enemy=elite&atk=elite_jab&wave=14` films one enemy attack on a passive player,
`test=stress` bakes N ragdoll corpses plus blood and measures frame cost (then drops fresh
active ragdolls onto the pile), `test=euph&mode=knock|stagger|death|agony|pile|prop` films one
scripted active-ragdoll reaction from a fixed witness camera (`pgu=1` forces the physical
get-up, `ragdolls=classic` switches engines), `test=film` captures
consecutive gameplay frames into a contact sheet (`wave=12` films a real wave), `test=duel&enemy=elite` isolates one
archetype, `test=pools&h=2.3&tilt=3.2` grows pools and rivulets on an empty floor, and
`test=wounds` renders a beaten face up close (`wait=600` to see bruises mature), `test=moves`
drives the player through a scripted idle / run / turn / blocked strafe / walk sequence for
reviewing locomotion (`run=1&probe=1` measures it), and `?viewer=loco&mocap=1` strobes the
motion-captured gait (`path=ai` circles like an enemy; `stats=1` measures hip pops, posture and
planted-foot slide instead of drawing). Debug viewers: `?viewer=sheet&clip=roundhouse` (strike contact sheet),
`?viewer=sheet&pair=fin_roundhouse` (paired clips), `?viewer=loco&path=circle&speed=4`
(locomotion strobe), `?viewer=pose&all=1` (all character variants; `variant=scarlet&cam=face`
for a close-up), `?viewer=atlas&variant=scarlet` (a variant's painted texture layers and finish
masks), `?viewer=graffiti&seed=N` (a wall of procedural street art).

## Project layout

```
src/anim/        skeleton, IK solver, clip system, locomotion, animator, clip library
src/character/   procedural mesh (meshKit, body, femMesh), outfits, canvas textures, wound-aware material
src/combat/      fighter base, player controller, fighter styles, combat resolver, moves, weapons, deaths
src/ai/          enemy brain, archetypes, director, waves, bosses
src/world/       arenas (warehouse + dressing, rooftop, alley, apartment, lab), mapKit, city, graffiti,
                 prop library and props, blood atlas, corpse baking, Rapier physics, ragdolls, textures
src/world/euphoria/  Ragdoll Lab active-ragdoll engine (engine.js) and its game bridge
src/fx/          particles (blood, sparks, dust, debris), camera rig
src/audio/       sample engine with synth layers, procedural adaptive music
src/ui/          HUD, menus, settings
tools/audio/     reproducible CC0 sound library build
tests/           headless runners (results, screenshots, film strips)
```

## Credits

See [CREDITS.md](CREDITS.md). All sound effects are CC0 (OpenGameArt); three.js (MIT) and
Rapier (Apache-2.0) are used as libraries; the active-ragdoll engine comes from the Ragdoll Lab.
Everything else was made for this project.
