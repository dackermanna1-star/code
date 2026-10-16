# Catalog: `life` — rare people, a stray dog, small traces of other lives

Package `src/content/life/` (order 70). Ordinary and plausible only: no anomalies.

- **Pedestrians** run by themselves from `ctx.navPaths` (the layout packages' walkways) plus the
  residential entrance stubs. No setup needed; just push good nav paths (see notes below).
- **A stray dog** wanders the courtyards now and then. This also needs no setup.
- **Storytelling props**: layout packages call `placeStory()` / `placeStoryAtEntrance()` during `build()`.

```js
import { placeStory, placeStoryAtEntrance, placePerson, STORY_KINDS, PERSON_TYPES } from '../life/api.js'
```

## Scale and conventions (read first)

- People, dogs and props use **fine voxels**, as the nature package's crows do: 6.25 cm (`F4`), 3.125 cm (`F8`) or 1.56 cm (`F16`).
  - A model is registered with `lods: [f]`.
  - The engine still computes the bounding box with 0.25 m voxels, so the stock `--viewer` frames these models 4–16× too far away.
  - To look at them, use the life studio instead (see Testing).
  - In the game the box is rescaled (`fixFine`), which matters only for culling.
- **Front is local +Z.** The `angle` you pass makes the front face **(sin a, cos a)**. This is the same convention as `signs.add` and the street package: 0 is south, π/2 is east, π is north, −π/2 is west.
- The **pivot** is the bottom centre unless noted. Wall-mounted props are the exception: their pivot is the bottom centre of the **back plane**.
- No life model collides with anything (`collide: false`), and none casts a terrain contact shadow.
- Everything is deterministic.
  - Placement variants come from `seed`, as an integer, a string or a 0..1 float.
  - The runtime uses its own seeded RNG.

## Story props — `placeStory(ctx, kind, opts)`

```js
placeStory(ctx, 'snowman', { x: 233.5, z: 402, angle: Math.PI, seed: 7 })           // by a playground
placeStory(ctx, 'mittens', { bench: benchRecord })                                   // on a street bench seat
placeStory(ctx, 'bread', { x, z, y: seatTop + 0.25, angle })                         // explicit height
placeStory(ctx, 'glove', { x, z, y: postTopY })                                      // on someone's fence post
placeStory(ctx, 'glove', { x, z })                                                   // on its own lone post
placeStory(ctx, 'sled', { x, z, angle: doorAngle, lean: true })                      // leaning on a wall
placeStory(ctx, 'cat', { x, z, angle: facadeAngle, y: groundY + 0.3, note: true })   // in the plinth
placeStoryAtEntrance(ctx, ctx.registry.entrances[3], 'butts', { side: -1 })          // beside a подъезд
```

### Options

`opts` takes the following keys:

| key | meaning |
|---|---|
| `x`, `z`, `angle` | position; `angle` defaults to 0 |
| `y` | defaults to the terrain height (the cat: terrain + 0.25) |
| `seed` | picks the variant, the caption and the tint |
| `bench` | a street bench record from `registry.benches` or `placeBench()`. The prop goes on the seat, 0.45 m off-centre (`along` overrides this), at `seat.y + benchSnow` (default 0.25, the bench's snow). |
| `inspect` | default true. Adds a «Осмотреть / Look» interaction (reach 2.6 m) that shows a quiet caption with `ui.say` for 6 s. The ticket also opens a ticket note. |
| `text` | `{ru, en}`: your own caption |
| `tint` | overrides the paint colour |
| `lean` | sled only |
| `post` | glove only |
| `bowl` | cat only, default true |
| `note` | cat only: a handwritten «Не закрывайте продухи — там живут кошки!» sign above the vent |
| `variant` | snowman `0`/`1` |

The call returns `{ kind, placement, placements, interaction, text, x, y, z, angle }`, or `null`.

Inspecting a prop emits `events.emit('story', { kind, x, z })`.

### Kinds

| kind | model(s) | size (m) | pivot / facing | notes and captions (2 per kind, chosen by seed) |
|---|---|---|---|---|
| `mittens` | `life_mittens` (F8) | 0.53 × 0.09 × 0.34 | bottom centre | Red knitted children's mittens on an elastic cord. Put them on a bench seat, a ledge or a fence top. «Детские варежки. Кто-то положил их повыше, чтобы нашли.» (Children's mittens. Someone put them up high so they'd be found.) |
| `glove` | `life_glove` (F16), `life_glove_post` (F16) | 0.22 × 0.23 × 0.11; with post 0.22 × 1.25 × 0.11 | bottom centre of the glove (post: of the post) | A dark knit glove pulled onto a post top. **Without `y`** it comes with its own lone 1 m rusty-green post. **With `y`** you get just the glove, sitting at that height (the top of your post). |
| `sled` | `life_sled`, `life_sled_lean` (F4, `paint` tint: red/blue/green/yellow/purple by seed) | lying: 0.5 × 0.5 × 1.13; leaning: 0.5 × 1.19 × 0.69 | Lying: centre, curled front +Z. Leaning: **pivot at the wall plane**, seat faces +Z (out). | A children's sled with slats and a rope. «Санки у подъезда. Значит, кто-то уже дома.» (A sled by the entrance. So someone is already home.) |
| `snowman` | `life_snowman_a`, `life_snowman_b` (F4) | 1.13 × 1.63 × 1.13 (figure about 1.4 m) | bottom centre, carrot faces +Z | Three lumpy balls, slightly slumped (half-melted), coal eyes and buttons, a drooping carrot, twig arms (one broken), a zinc bucket for a hat. Put it by a playground or a courtyard hill. |
| `ticket` | `life_ticket` (F8) | 0.09 × 0.03 × 0.06 | bottom centre | A used bus ticket on the snow: white with a blue stripe. Inspecting it shows a «ГОРТРАНС · ЕДИНЫЙ БИЛЕТ» ticket note with a seeded number and date. Put it at bus stops. |
| `bread` | `life_bread` (F4) | 0.5 × 0.31 × 0.5 | bottom centre | A white «маечка» carrier bag with a батон sticking out. «Батон в пакете. Кто-то тоже шёл за хлебом.» (A loaf in a carrier bag. Someone else went out for bread, too.) |
| `frozen_bag` | `life_frozen_bag` (F4) | 0.5 × 0.19 × 0.44 | bottom centre | A crumpled blue bag frozen flat into ice on a bench, handles stiff. |
| `key` | `life_key` (F8) | 0.28 × 0.06 × 0.19 | bottom centre | Two keys on a ring with a blue «таблетка» intercom fob. «…Кто-то сегодня будет звонить соседям.» (Someone will be ringing the neighbours tonight.) |
| `butts` | `life_butts` (F16) | 0.47 × 0.16 × 0.41 | bottom centre | A pea tin used as an ashtray, ends sticking out of it, more scattered in the snow. Put it by a подъезд, a bench or a garage. |
| `cat` | `life_cat` (F8), plus `life_cat_bowl` | 0.5 × 0.41 × 0.22 | **pivot at the back plane** (against the plinth), faces +Z | A продух vent frame with a tabby cat peeking out. Its eyes catch the light (`EMIT_STREET`: only while the street lights are on). A lid of soggy bread sits on the ground 0.42 m in front. |
| `bicycle` | `life_bicycle` (F4, frame `paint` tint by seed) | 0.63 × 1.25 × 1.25 | bottom centre; front wheel toward +Z, the post on local +X | A bicycle chained to a pipe post since autumn, wheels sunk in a drift. Put it by a fence, a garage or a подъезд. |
| `yolka` | `life_yolka` (F4) | 1.25 × 0.81 × 2.13 | bottom centre; trunk butt at −Z, top toward +Z | A thrown-out New Year spruce with tinsel (дождик) and one forgotten red bauble, lightly snowed on. Put it by the garbage containers (it is mid-January). |

`STORY` (the table of kinds) and `STORY_KINDS` are exported.

### Placing props beside an entrance

`placeStoryAtEntrance(ctx, entrance, kind, opts)` places a prop beside a residential entrance (a `registry.entrances` record):
- It sits next to the porch: `along` defaults to 2.6 m from the door centre, and `side` (±1) picks which side.
- It uses a sensible distance from the wall per kind: sled 0.04 m (leaning), cat 0.02 m (in the plinth), butts 0.55 m, glove 0.3 m, key 1.2 m.
- It assumes the plinth is flush with the door plane. Pass `out` if your facade differs.

## People

### The system (no setup)

**Population**
- At most 3 walkers are alive and at most 2 are seen at once.
- The expected count follows the clock, with heavy snow cutting it by about 35 %:

| hour | 00 | 01–05 | 06 | 07–09 | 10–16 | 17–19 | 20 | 22 | 23 |
|---|---|---|---|---|---|---|---|---|---|
| expected count | 0.3 | 0.03–0.05 | 0.35 | 1.0–1.3 | 0.75–1.1 | 1.75–1.85 | 1.1 | 0.75 | 0.45 |

**Spawning**
- People spawn only **35–120 m** from the player, at a point the player cannot see: outside the view cone, behind something solid, or lost in fog.
- About 28 % of them **come out of a подъезд**: the door swings open and they step out.
  - This may happen in view, but only more than 30 m away and only at a door that really swings (see Doors).
  - Otherwise the spot in front of the door must be out of sight.
- About 30 % head **home**, routed along the graph to an entrance up to about 230 m away.

**Walking**
- They follow the nav graph and keep to the right of the path line: 0.55 m on sidewalks, 0.8 m on driveways, about 0.25 m on paths.
- They step aside if the player stands in their way, but never react to the player otherwise.
- The walk cycle is 4 frame-swapped placements plus a standing frame.
- They leave **footprints** (`ctx.footprints.add`) in snow: depth 0.9 on soft snow, 0.45 on packed snow. Prints are added only within 95 m of the player.
- Footsteps are audible within 14 m.

**Leaving**
- A walker disappears when it is unseen and more than 125 m away (fog), or unseen for more than 22 s at more than 45 m away ("around a corner"), or at an unseen dead end.
- A walker who reaches a door goes in:
  - They stamp the snow off (`stamp_snow`).
  - The fob beeps (`intercom_beep` `ok`).
  - The door opens (`door_metal_open`); they step through and are gone.
  - The door slams (`door_metal_slam` + `door_magnet_lock`).
- When the player comes within about 30 m, a figure sometimes (40 %) turns off toward the nearest entrance within 26 m of path and goes in just as you arrive.

**Doors**
- Only doors that the residential runtime does not animate swing visibly: non-enterable, static ones, moved with `world.relocate` and restored exactly.
- Enterable doors get the sounds only.

**Fallback**
- If `navPaths` holds no walkable path, the system walks straight routes along the streets of PLAN.md (`FALLBACK_ROUTES` in `nav.js`).

### Person models

Each type has 4 walk frames `life_<type>_0..3` and a standing frame `life_<type>_stand`.
- All are F4, dynamic, no collision, `maxDistance` 175.
- The main garment is `paint_matte`, so the placement **tint** colours it.
- The pivot is the walker's ground centre; front +Z.

| type | what | model box (m) | pivot offset | speed (m/s) / step (m) | hours |
|---|---|---|---|---|---|
| `man_coat` | man in a long dark coat, fur collar, ушанка, grey scarf, «дипломат» briefcase | 1.0 × 2.0 × 1.0 (figure about 1.75 m) | centre | 1.35 / 0.74 | all |
| `man_puffer` | young man in a quilted пуховик, knit cap, jeans, hands in pockets, hunched | 1.0 × 2.0 × 1.0 (about 1.8 m) | centre | 1.45 / 0.80 | all |
| `man_jacket` | man in a short leather jacket and кепка, scarf, cigarette ember glowing in his hand | 1.0 × 2.0 × 1.0 | centre | 1.3 / 0.74 | all |
| `woman_coat` | woman in a long fitted flared coat, fur collar, round fur hat, shoulder bag | 1.0 × 2.0 × 1.0 (about 1.68 m) | centre | 1.25 / 0.66 | all |
| `woman_puffer` | woman in a long puffer, red knit hat with pompom, long scarf, carrier bag with a loaf | 1.0 × 2.0 × 1.0 | centre | 1.2 / 0.64 | all |
| `babushka_cart` | бабушка, stooped, long coat, платок, felt boots, pulling a tartan shopping trolley | 1.0 × 2.0 × 1.75 | person at local z 18 (the trolley trails about 0.6 m behind) | 0.75 / 0.42 | 7–20 |
| `man_dog` | man in a short jacket and knit cap with a dark dog on a leash | 1.5 × 2.0 × 2.5 | person at (8, 0, 12) (the dog trots about 1.2 m ahead, 0.45 m to his left) | 1.15 / 0.66 | 6–24 |
| `parent_sled` | parent in a long coat and fur hat pulling a child (snowsuit, pompom hat) on a sled | 1.0 × 2.0 × 2.75 | person at local z 36 (the sled is 1.0–1.8 m behind) | 1.05 / 0.60 | 9–20 |

`PEOPLE[type]` = `{ frames, stand, speed, stride, tints, weight, hours, label }`.

### Static figures — `placePerson(ctx, type, opts)`

For a static figure, use `placePerson(ctx, type, { x, z, y?, angle, frame: 0..3 | 'stand', tint, visible })`. It returns a dynamic placement, which you can move with `p.set(x, y, z, angle)`.

```js
placePerson(ctx, 'man_jacket', { x: 251, z: 512.2, angle: Math.PI, frame: 'stand' })   // someone waiting at the stop
```

Use it sparingly. Static people are noticeable, so prefer far-away spots: the end of a platform, a balcony-level vantage point.

### Runtime helpers

- `spawnWalker(ctx, { type, rMin = 8, rMax = 60, visible = false, door = false })` spawns a walker now (scripted moments, debug).
- `setPeopleDensity(k)` multiplies the time-of-day density (0 = nobody).
- `lifeStats()` is a debug snapshot. It is also available as `window.__life.stats()`.
- `peopleTarget(minutes, snow)` gives the expected count.

## The stray dog (дворняга)

### Models

The dog is ginger-brown with pale socks and muzzle and a curled tail.
- Models: `life_dog_trot_0..3` (diagonal trot), `life_dog_stand`, `life_dog_sniff` (nose to the snow), `life_dog_bark` (head up, jaw open).
- F4, 0.5 × 0.81 × 1.25 m; the dog is about 0.45 m at the shoulder. Pivot at ground centre; nose at +Z.
- The names are exported as `DOG_MODELS`.

### Behaviour (automatic)

**Appearing**
- It turns up every 3–10 min, at 06–10 h and from 15 h to 02 h.
- It appears unseen, 32–85 m away, preferring `courtyard` / `path` / `park` / `trodden` edges.

**Roaming**
- It roams for 2–5 min: trotting at 1.35 m/s, sniffing, standing.
- It keeps its distance:
  - Within 16 m of the player it trots away at 2.7 m/s.
  - Once it is past 34 m it stops, turns, and often barks at you.

**Barking**
- It also barks at nothing now and then while far away (> 30 m), with `dog_bark` (voice `dog: 2`) at its position.

**Leaving**
- When its time is up it trots off and disappears out of sight.

## Sounds called

All of these are guarded: they play only when `audio.ready` and the sound is registered.

- `dog_bark` (`{dog: 2}` for the stray, `{dog: 4}` for a leashed dog that grumbles at a passer-by)
- `step_snow`, `step_snow_packed`, `step_ice`, `step_slush`, `step_asphalt`, `step_concrete`, … (`step_<surface>` of the terrain under an NPC's foot, within 14 m)
- `stamp_snow`
- `intercom_beep` (`kind: 'ok'`)
- `door_metal_open`, `door_metal_slam`, `door_magnet_lock`

## Registry, tags and events

**Sets**
- `registry.life` = `{ placeStory, placePerson, spawnWalker, setPeopleDensity, stats }`, already bound to ctx
- `registry.story[]` = `{ kind, x, y, z, angle, placement, interaction }` for every story prop
- Placement tags: `'person'`, `'dog'`, `'story'` (with `userData.story = kind`)
- Interaction tag: `'story'`
- Event `'story'` `{ kind, x, z }` when a prop is inspected

**Reads**
- `ctx.navPaths` (in `init`)
- `registry.entrances` (residential: `x, y, z, angle, doorPlacement, enterable`)
- `ctx.footprints`, `ctx.camera`, `ctx.player`, `ctx.atmos` (`minutes`, `cur.snow`), `game.uniforms.uFogDensity`

## Notes for the layout agents

### Nav paths

- **Push nav paths for every walkway**: `navPaths.push({ points: [[x, z], …], kind })`.
  - Kinds used: `sidewalk`, `path`, `courtyard`, `park`, `crossing`, `driveway` (people walk 0.8 m right of its line), `trodden`.
  - Kinds ignored: `indoor`, `metro`, `platform`, `underpass`, `stairwell`, `interior`, `road`, `vehicle`, `rail`, `tunnel`, `lift`, and paths with `y` outside [−1, 4].
- **Connect them**: shared end points, or crossings (split automatically), or loose ends within 2.6 m of another path (snapped).
  - Islands shorter than 25 m are ignored.
- **Keep paths clear**: walkers do not collide. Path lines need about 0.6 m clearance on their right from cars, benches, lamp posts and fences.
- **Entrances**: residential pushes a short `entrance` stub per подъезд. If its outer end touches no path, life joins it to the nearest path within 32 m with a straight trodden link.
  - Links are tested with knee- and chest-height rays and never pass through buildings, fences or cars.
  - An entrance with no clear link is not used.
  - It is better to run a courtyard path to each entrance's outer point, about 6.5 m in front of the door.
- Walkers stand on terrain height and rise onto the porch (entrance `y`) within about 3 m of a door.

### Story props

- Use them sparingly; each one should feel found, not placed.
- Suggested numbers for the whole map:
  - 1–2 mittens (or street's `mittens: true` bench option; not both on one bench)
  - 2 gloves
  - 3–4 sleds (entrances, a courtyard hill)
  - 2 snowmen (playgrounds of D/F and B)
  - 2–3 tickets (stops)
  - 1 bread (a bench near the shop in E)
  - 1–2 frozen bags
  - 1–2 keys
  - 4–6 butts (entrances, garages)
  - 3–4 cats (plinths; one with `note: true`)
  - 2 bicycles
  - 3–4 yolkas (by garbage containers)
- Bench props: pass the bench record (`bench:`), or `y = seat top + 0.25` on a snowy seat (+0 on `snow:false` / brushed seats).

## Testing

- **Test scene** (never in the game):
  `node tools/shot.mjs --query "shot=1&only=base,life&lifetest=1&x=330&z=425.8&yaw=0&pitch=-0.22&t=17:30&weather=light&timescale=0&frames=6"`
  - It shows a wall with a door, a cat vent, a leaning sled and butts; two benches with mittens, bread and a frozen bag; a key, a ticket, a glove post, a snowman, a bicycle, a yolka and a second sled; a line-up of all people types at z 437.5 (look south from z 431); the stray standing about; and a loop of nav paths.
  - Two dev URL switches work in any scene, not only the test one: `&lifewalk=1` puts two walkers in view at once (one comes out of a door within 40 m if there is one), and `&lifedog=1` calls the stray at once.
  - Example with real buildings: `--query "shot=1&only=base,residential,life&resdemo=1&lifewalk=1&x=284&z=364&yaw=0.05&t=17:20&weather=light&timescale=0&frames=12"`.
- **Studio for fine models** (the stock viewer cannot frame them):
  `--query "shot=1&only=base,life&lifetest=1&studio=life_man_coat_0,life_man_coat_1&sview=0..4&sdist=0.5&sface=1.5708&stint=2a3040&slamp=1&t=21:00&weather=still&timescale=0&frames=6"`
  - `sview`: 0 front-left, 1 front-right, 2 back, 3 front, 4 side.
  - `sface` turns the models (π/2 gives side views of walkers from `sview=3`).
