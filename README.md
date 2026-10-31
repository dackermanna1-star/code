# LAST STANCE

A cinematic, free-flow martial-arts combat simulator for the browser. One fighter against
escalating waves of thugs, armed enforcers, brutes, elite martial artists, minibosses and a
three-phase boss in a moonlit warehouse — Arkham-style flow, Assassin's Creed counters,
Spider-Man finishers and Sifu-style technique, with **bodies and blood that never disappear**.

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
(stats overlay), `?bot=1&god=1` (attract mode — a scripted bot plays).

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
| F / LB / RT | Finisher (spends a charge) · ground takedown on downed enemies (free) |
| G / Back | Throw your held weapon |
| Esc / P / Start | Pause & settings |

**Telegraphs:** ⚡ (gold ring shrinking to the hit) = counterable. Red **!** = unblockable — dodge it.
Finisher charges fill from your combo (6 hits for the first, 8 for each more, max 3).
Taking a hit breaks your combo; finishers and perfect counters restore a little health.

## What's in the box

**Combat** — free-flow targeting with motion warping (strikes close the gap and land on the
actual head/gut of the target), 14 contextual unarmed strikes (jabs, crosses, hooks,
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
plus The Butcher, Viper and Grandmaster Kael (three phases, minions, a sword, exhaustion
windows). An AI director hands out attack tokens, coordinates pincer attacks, punishes
openings, and adapts: counter-heavy players see more unblockables and feints. Injured enemies
hunch, limp, clutch their side and hang back; broken arms dangle and change their moveset.
15 authored waves introduce mechanics gradually, then endless mode scales forever.

**Animation** — fully procedural: an IK pose solver drives every limb; 72 authored motions (117 clips with mirrors and paired tracks:
strikes, reactions, get-ups, paired counters/finishers authored as two synchronized tracks);
procedural locomotion with planted feet (no foot sliding), toe-off and stance-aware stepping;
**inertialized transitions** (velocity-matched offset decay) on every clip/locomotion/ragdoll
switch so nothing ever pops; spring-based secondary motion for hit reactions; active
(euphoria-style) ragdolls for staggers, knockdowns, throws and deaths — see below.

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
  where they land they paint drops, splashes, wall drips, smears, growing pools and bloody
  footprints directly into the atlas (additive / max blending, never cleared). Rendering cost
  is constant regardless of how much blood exists. Every splat is also recorded in a compact
  log so the atlas is rebuilt exactly after a WebGL context loss.
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

`test=waves` runs the real wave game with a scripted bot (counters, dodges, finishers),
`test=stress` bakes N ragdoll corpses plus blood and measures frame cost (then drops fresh
active ragdolls onto the pile), `test=euph&mode=knock|stagger|death|pile|prop` films one
scripted active-ragdoll reaction from a fixed witness camera (`pgu=1` forces the physical
get-up, `ragdolls=classic` switches engines), `test=film` captures
consecutive gameplay frames into a contact sheet, `test=duel&enemy=elite` isolates one
archetype. Debug viewers: `?viewer=sheet&clip=roundhouse` (strike contact sheet),
`?viewer=sheet&pair=fin_roundhouse` (paired clips), `?viewer=loco&path=circle&speed=4`
(locomotion strobe), `?viewer=pose&all=1` (all character variants).

## Project layout

```
src/anim/        skeleton, IK solver, clip system, locomotion, animator, clip library
src/character/   procedural mesh, outfits, canvas textures, wound-aware material
src/combat/      fighter base, player controller, combat resolver, moves, weapons, deaths
src/ai/          enemy brain, archetypes, director, waves, bosses
src/world/       arena, blood atlas, corpse baking, Rapier physics, ragdolls, props, textures
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
