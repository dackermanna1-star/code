# Extreme Sports Overhaul

A Fabric mod for **Minecraft 1.21.11** that adds rideable skateboards, BMX bikes, kick scooters and inline skates,
with momentum-based physics, procedural rider animation, tricks and combos, skatepark blocks, a customization
workshop, challenges, stats and unlockables.

| | |
|---|---|
| Minecraft | 1.21.11 |
| Loader | Fabric Loader 0.19.5+ |
| Requires | Fabric API 0.141.6+1.21.11 |
| Java | 21+ |
| Side | Client and server (both need the mod) |

## Equipment

| Item | Handling |
|---|---|
| **Street Skateboard** | Quick pop and fast flips; the trick board. |
| **Cruiser** | Bigger soft wheels, rolls further over rough ground, slower flips. |
| **Longboard** | Highest top speed and stability, wide carves, heavy for tricks. |
| **BMX Bike** | Pedal-powered with the best rough-ground handling; bunny hops, flips, whips, pegs. |
| **Kick Scooter** | Fast acceleration from kicks, tight steering, tailwhips and barspins. |
| **Inline Skates** | Worn on the feet; stride to accelerate, skate backwards, soul/frontside grinds. |

Use the item to drop it and step on. **Shift** gets off (the equipment goes back into your inventory unless you
turned that off). Punching the equipment also picks it up. **B** calls your last equipment back after a bail.

## Controls

All keys can be rebound under *Options → Controls → Extreme Sports*.

| Key | Action |
|---|---|
| W | Push / pedal / kick / stride. Hold on a ramp's transition to **pump** for speed. |
| S | Brake. **S + A/D** at speed: powerslide. Ride backwards (fakie/switch) where the sport allows it. |
| A / D | Carve. In the air: spin. |
| Space | Hold to crouch (charges the pop), release to ollie / bunny hop. Tap just before landing for a **Perfect**. |
| R | Flip trick (kickflip, heelflip, backflip…). Add a direction for variants, press again for a double. Pressing it together with the pop also works. |
| Z | Shove-it / tailwhip / barspin / spin trick, with a direction for variants. |
| G | Hold for a grab; the held direction picks the grab. |
| V | In the air near a rail, ledge, coping or box: grind (direction picks the grind). On the ground: manual. |
| J | Extreme Sports menu (challenges, stats, unlocks, settings, controls guide, workshop). |
| H | Return to your practice spot (Practice mode). |

Steering can be switched to **mouse steering** (look to turn) in the settings.

## Physics

- Momentum, rolling resistance and air drag per equipment type; speed is kept between ticks and carried through
  ramps, so you can pump a half-pipe and convert speed into height.
- Surfaces matter: park concrete and smooth stone are fastest, wood ramps are close behind, grass, gravel and sand
  slow you down (the BMX copes best), ice is slippery.
- Ramps use analytic curved profiles (quarter pipes, bowls, launch ramps, dirt lips), not stair-stepped
  collision, so transitions feel smooth. Vanilla stairs, slabs and full blocks are rideable too.
- Collisions: hitting a wall slowly just stops you; slamming into it at speed is a bail.
- Three presets (Settings tab or `/xs preset`):
  - **Arcade** – big pops, wide landing window, rails grab you automatically.
  - **Balanced** – the default.
  - **Realistic** – heavier momentum, stricter landings and balance; scores ×1.25.
- The simulation runs at the fixed 20 TPS game tick with sub-stepping, so it does not depend on frame rate.

## Tricks and scoring

Over 100 tricks across the four sports, including:

- **Skateboard:** ollie, nollie, kickflip, heelflip, hardflip, varial flips, 360 flip, inward heelflip, shove-its,
  impossible, indy/melon/mute/method/stalefish/crail grabs, 50-50, 5-0, nosegrind, boardslide, lipslide,
  crooked, smith, feeble, manuals, powerslides, frontside/backside spins.
- **BMX:** bunny hop, backflip, frontflip, flair, cork 540, tailwhip, barspin, bar-to-whip, no-hander,
  superman, can-can, table top, X-up, turndown, peg grinds, manuals and wheelies.
- **Scooter:** tailwhips, barspins, heelwhip, bri flip, flips, superman, can-can, grinds, manuals.
- **Inline skates:** misty, rodeo and flat spins, grabs (mute, japan, rocket, christ air…), soul, frontside,
  backside, makio, royale, topsoul, mizou, unity, acid, heel/toe rolls.

Landings are graded **Perfect / Clean / Sketchy / Bail** from the board angle, the trick's completion and the
landing impact. Tricks chain into combos through manuals and grinds; the multiplier grows with *different*
tricks, and repeating the same trick decays its value, so farming one trick doesn't pay. The client predicts the
combo for instant feedback and the server re-scores it, checking measured air time, grind time and riding state
before accepting it.

## Skatepark blocks

Quarter pipe, **vert ramp** (a two-block-tall transition built from three pieces: the toe, the back piece and
one on top of the back piece), bowl wall (corners join automatically), steep ramp, 2-block ramp, 4-block slope, launch ramp,
dirt lip and dirt landing ramp, flat and inclined grind rails, grind box, ledge, manual pad, park concrete, ramp
deck, packed dirt, start / checkpoint / finish gates for courses, and the Skate Workshop. All are craftable;
right-clicking a multi-part ramp cycles which part it is. Rails, ledges and box edges are grindable, and so are
vanilla edges such as stairs and slabs.

In creative, the **Park Builder** item (or `/xs park <prefab>`) builds prefabs: `half_pipe` (two-block vert), `mini_ramp`,
`bowl`, `street`, `dirt_jumps`, `downhill` and `full_park`.

## Workshop and customization

Right-click a **Skate Workshop** to customize any equipment in your inventory. J → Workshop opens the same screen
anywhere for previewing; in survival, applying changes needs a Skate Workshop within reach (creative can apply
anywhere).

- Parts that change stats (wheels, trucks, bearings, frames, bars, tyres, decks…) with a live stat comparison.
- Colour slots per equipment, deck graphics, stickers and trail effects.
- A rotating 3D preview (drag to turn it).
- Named presets saved to `config/extremesports.json` that can be loaded or deleted later.

Some cosmetics and bearings are unlocked through stats and challenge medals; locked options can be previewed but
not applied. The server re-checks unlocks and that you are at a workshop.

## Challenges, stats and unlocks

From the menu (J): **Score Attack**, **Best Trick**, **Grind Challenge**, **BMX Stunt Challenge** and
**Practice Mode** (set a spot and return to it with H). **Time Trials** and **Downhill Races** run through courses
built from start, checkpoint and finish gates (right-click a gate to change its course and order). Medals are
bronze, silver and gold.

Stats (distance, air time, best combo, longest grind, biggest spin, tricks landed, perfect landings, bails,
medals, course records) are saved per player and shown in the menu or with `/xs stats`. There are 21 unlockables
and 20 advancements. Creative players have access to everything.

## Feedback and settings

Rolling sounds that change with the surface, push / pop / flip / land / grind / bail sounds, sparks and dust
particles, camera shake on landings, speed-based FOV, an optional automatic third-person camera, a
speed / combo / balance HUD and coaching tips. Every motion effect has an intensity slider, and **Reduced
Motion** turns them all off. HUD scale and speed units are configurable.

## Commands

`/extremesports` (alias `/xs`):

- `stats` – your stats.
- `challenge start <id>` / `challenge stop`.
- `preset <arcade|balanced|realistic>`.
- `park <prefab>` – build a prefab in front of you (operators).
- `unlockall`, `resetstats` (operators).

## Building

```sh
./gradlew build          # mod jar in build/libs
./gradlew runClient      # development client
```

## Tests

- `./gradlew runGameTest` runs the server game tests in `src/gametest`. They drive the real ride simulation in a
  test world: pushing and coasting, surface friction, BMX on dirt, ollies, kickflips within ollie air time,
  bailing a flat-ground BMX backflip while landing one popped off a dirt jump, wall slams versus gentle bumps,
  rail grinding, manuals, quarter-pipe and vert-ramp launch and re-entry, vert surface continuity, kickers,
  slopes, combo anti-farming, server rejection of impossible combos, and bowl corner joining.
- `./gradlew runClientGameTest` starts the real client (it needs a display; use `xvfb-run` on a headless machine),
  rides every sport with real key presses, rides the half-pipe and a rail in the demo park, opens the workshop
  and menu, checks that a tapped flip or whip key performs the trick and that a flat-ground BMX backflip bails,
  and saves screenshots to `build/run/clientGameTest/screenshots`.

## Known limitations

- Bowl walls are one block tall; only the vert ramp comes in a two-block version.
- Equipment models are built from boxes in code; there is no resource-pack model format for them yet.
- Multiplayer sync and server-side validation are implemented, but the automated tests use a single player;
  they have not been exercised with several clients connected at once.
