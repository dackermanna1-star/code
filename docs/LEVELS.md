# Writing levels

The game is a chain of **levels**: separate, endless worlds. Level 0 is the main building.
Every level has **level doors** scattered through it; each one leads to a random other level.
The player finds them with the **phone** (up arrow), which points at the nearest door and beeps
from its direction. Arriving on a level fades in on its **arrival point**, standing just in
front of the door you came through (it locks behind you), under a title card:
`LEVEL 7 / THALASSOPHOBIA`.

The reference implementation is `src/world/levels/l007_thalassophobia.js` (with its sounds in
`src/audio/levels/l007.js`). Read it first, then this guide. The pockets in
`src/world/pocket/` (auditorium, hollowframes, culdesac, suburb, pools) are larger examples of
coordinate-based, endless spaces; `src/world/gen/*.js` are indoor generators.

## What a level must be

* **Its own world.** Each level must differ from every other one in atmosphere, feel and
  world: palette, light, fog colour and distance, architecture or landscape, scale, sound,
  how it is to walk through. Two hotels must not feel like reskins of each other.
* **Awe on arrival.** The first view through the door is the most important frame of the
  level. Choose the arrival point and direction so the player immediately sees what this place
  is: a long vista, a huge space, a strange horizon, a light in the distance. Test it with a
  screenshot of exactly that view.
* **Endless.** The world continues in every direction it can be walked (repetition with
  variation, coordinate based). No dead stops at a zone edge, no visible seams.
* **Doors everywhere.** Doors must be findable: one within roughly 40-100 m of anywhere
  walkable. Place some by hand at meaningful spots (end of a hall, on a platform, in the middle
  of a field) and let the automatic placement fill the rest (`doorDensity`).
* **The rules of the game** (from the original brief, non-negotiable):
  * **No monsters, creatures, people, ghosts or entities.** Nothing watches, follows, breathes
    or speaks. No voices, crowds, applause, footsteps other than the player's, animal sounds,
    blood, gore or weapons. If a level description implies a presence ("something watches",
    "a voice calls", "the crowd appears"), express it through the environment only: a light
    that was off is now on, a door that stands open, a seat that is folded down, a radio
    playing static, a sound with a mechanical cause. Never show or imply a being.
  * No combat, health, timers or survival mechanics. Exploration only. The level may be
    strange; it must never be lethal. Falling off the world takes you to another level.
  * Late-90s console look: low polygons, chunky 64x64 textures with few colours, vertex
    lighting, fog. No modern effects. Everything is generated in code.

## Files and ownership

* A level lives in `src/world/levels/lNNN_<slug>.js` (e.g. `l021_numbered_hotel.js`).
* Each group of levels has an index `src/world/levels/gNN.js` that imports its level files
  (groups are loaded defensively by `src/world/levels/index.js`).
* Sounds go in `src/audio/levels/sNN.js` (and files it imports); they must not import world
  code (the sound bank runs in a worker of its own).
* Names you define (textures, materials, props, zone types, sounds) start with `lvN_` for one
  level (`lv21_carpet`) or `gNN_` for things shared within a group.
* Never edit engine files or other groups' files. If the engine blocks you, work around it and
  report it.

## Registering a level

```js
import { defineZone } from '../zonetypes.js';
import { LEVEL_ZONE, defineLevel, env, M } from './kit.js';

defineZone('lv21_hotel', {
  ...LEVEL_ZONE,                       // open borders, no stairs/portals from the building, weight 0
  params: (zone, rng) => ({
    ambient: [0.16, 0.14, 0.12],       // baked ambient light (0..2 scale, 1 = neutral)
    env: env({ fog: [0.2, 0.15, 0.1], fogNear: 3, fogFar: 26, hum: 0.2, hvac: 0.4, reverb: 'corridor', tone: 'hotel' }),
  }),
  gen(zb) { /* fill the zone: see below */ },
});

defineLevel(21, {
  name: 'NUMBERED HOTEL',             // title card + phone; upper case, the font has A-Z 0-9 and . , ' - ! ? : /
  zoneType: 'lv21_hotel',             // or (ctx) => type, ctx = { story, x0, z0, x1, z1, rand }
  zoneSize: 64,                       // zone grid: 16, 32, 64, 128 or 256 m
  bands: [0],                         // stories with content (story k spans y = 6k .. 6k+6), or 'all'
  entry: { x: 32.5, y: 0, z: 40.5, yaw: 0, pitch: 0 },   // arrival point; yaw 0 looks toward -z
  doorDensity: 0.6,                   // chance per zone of an automatic door (if none placed by hand)
  viewRadius: 3,                      // chunks streamed around the player (3 = 48 m; open levels 4-5)
  sky: null,                          // see "Sky"
  weather: null,                      // see "Weather"
  grade: null,                        // { sat: 0..1.5, tint: [r, g, b] } colour grade
  light: { phoneRadius: 3.6, phoneIntensity: 0.22 },    // how much the phone lights in this level
  fallTo: undefined,                  // 'entry' to put people back at the entry when they fall off
  script(ctx, dt) {},                 // optional, every frame on the game thread (see "Scripts")
  onUse(ctx, item) {},                // optional, for props with use: 'level'
});
```

The zone env (`params.env`) may also carry `sky`, `weather`, `grade` and `viewRadius`, which
override the level's for that zone (e.g. indoor zones of an outdoor level: `sky: null`).

### env fields

`fog` [r,g,b] (0..1; also the colour far things fade into, match the sky horizon outdoors),
`fogNear`, `fogFar` (metres; 10-80), `hum` (fluorescent hum 0..1), `hvac` (air handling 0..1),
`reverb` (`tiny room office corridor hall warehouse stairwell tunnel tile auditorium outdoor`),
`tone` (room tone: `yellow office industrial dark water outdoor school hotel void ocean` or
your own `defineBed('tone_<name>', ...)`).

## Building zones

A zone generator fills `[zb.x0, zb.x1) x [zb.z0, zb.z1)` (absolute metres, 1 m cells, y relative
to the story's base). Levels are endless, so think in absolute coordinates: a structure that
spans several zones is drawn by each zone for its own part, with decisions made by coordinate
hashes (`hr(a, b, salt)` 0..1) so neighbours agree. `cbox()` clips a brush to the zone;
`owns(zb, x, z)` says whether an entity's anchor is in this zone (place each entity once).

Cells (`src/world/zonebuilder.js`): `zb.floor[i]`, `zb.ceil[i]` (NaN = none: open sky / void),
`zb.fmat/cmat/wmat[i]` materials, `zb.solid[i]` (material id = solid block), walls on cell
edges `zb.setWall(x, z, 'W'|'N', W.WALL|W.DOOR|W.WINDOW|W.HALF|W.ARCH|W.LOW|..., matMinus,
matPlus)`, `zb.hLine/vLine/roomWalls`, flags `zb.flags[i]` (`CF.VOID` nothing at all,
`CF.WET`, `CF.SMOOTH` terrain). Index with `zb.i(x, z)`; `zb.fill(x0, z0, x1, z1, (x, z, i) => {})`.

Entities: `zb.box(x0, y0, z0, x1, y1, z1, mat, { alpha, tint, collide, render, skip, sub })`
(brushes: any box geometry), `zb.prop(type, x, y, z, rot, opts)`, `zb.light(x, y, z, { color,
rad, int, ch })`, `zb.fixture(x, z, kind, on, opts)` (ceiling lights: see `ceilingLight` in
`gen/common.js`), `zb.decal(x, y, z, face, w, h, texture)`, `zb.emitter(x, y, z, sound, { vol,
rad })`, `zb.dynamic(type, x, y, z, rot, opts, anim)` (slowly rotating / swinging props).

Kit (`src/world/levels/kit.js`): `LEVEL_ZONE`, `openGround(zb, mat, h)`,
`terrain(zb, (x, z) => height, mat)` (smooth rolling ground; keep neighbouring cells within
~0.35 m), `noise(x, z, scale, seed)` / `fbm(...)` 0..1, `water(zb, x0, z0, x1, z1, y, mat,
alpha)` (a surface you wade through: floor 0.2-1.2 m below it), `poleLamp(zb, x, z, h, opts)`,
`levelDoor(zb, x, z, rot, { y, propOpts })`, `findDoorSpot(zb)`, `cbox`, `owns`, `hr`,
`kRange`, `voidAll`, `stairs(zb, x0, z0, x1, z1, dir, h0, h1, mat)`, `ceilingLight`,
`lightLattice`, `findWallSpots`, `propOnWall`, `facing`, `env`, `M`, `CF`, `W`.

Light: everything is lit by baked vertex light: `params.ambient` plus `zb.light`s (and lights
props bring). Self-lit surfaces use a material with the `VF.FULLBRIGHT` flag (`M.glow_panel`,
`M.glow_bulb`, `M.glow_window`, or your own `defineMaterial(name, tex, { flags: VF.FULLBRIGHT,
glow: 1.0, chan })`). Flicker channels (`ch`/`chan`): 0 steady, 1-4 occasional flicker, 5-8
dying, 9-10 pulse, 11-12 flash, 13 event, 14 blink, 15 heartbeat.

Doors: `levelDoor(zb, x, z, rot, { y })` puts a door standing in its frame on the floor at
(x, z) facing `rot` (front faces `(sin rot, -cos rot)`); keep ~1 m clear on both sides.
`propOpts: { target: 12 }` makes a door always lead to level 12, `propOpts: { message: 'It has
no handle.' }` makes one that never opens. The arrival door is placed for you behind `entry`;
keep that spot (1 m behind the arrival point) clear.

Stories: content lives in a 6 m band per story; brushes may rise higher in open levels (the
suburb pocket stacks to 40 m). For multi-storey levels use `bands: [0, 1, 2]` or `'all'` and
connect stories with `stairs()` (or ramps); the phone shows `UP n` / `DN n` for doors on other
stories.

## Sky

```js
sky: {
  top: [r, g, b], horizon: [r, g, b], ground: [r, g, b], curve: 0.5,     // gradient
  sun: { dir: [x, y, z], color: [r, g, b], size: 0.04, halo: 0.3 },     // sun or moon (optional)
  stars: 0.8,                                                          // density (optional)
  clouds: { layer: 'lvN_clouds', color: [r, g, b], amount: 0.6, speed: 0.004, scale: 0.35 },
  band: { layer: 'lvN_skyline', color: [r, g, b], repeat: 8, top: 0.12, bottom: -0.02, fog: 0.4 },
}
```

The sky shows where nothing else is drawn: give outdoor zones no ceiling. `band` is a ring of
distant silhouettes around the horizon (mountains, a skyline, a far wall of shelves): a texture
whose transparent pixels (alpha) show the sky; `top`/`bottom` are heights as tangents of the
elevation angle. It is drawn behind everything, so it reads as very far away: use it for scale.
Clouds sample the red channel of a texture as density and green as shading.

## Weather

`weather: { kind: 'rain' | 'snow' | 'dust' | 'ash', amount: 0..1, color: [r, g, b, a], fall,
wind: [x, z], size, len, indoor: false }`. Particles stop under a roof unless `indoor: true`.

## Sound

`src/audio/registry.js`: `defineBed('tone_<name>', { L, sr, norm, gen(S, L) })` (seamless room
tone loop, used by `env.tone = '<name>'`), `defineLoop(name, ...)` (positional loop for
`zb.emitter`), `defineShot(name, { n, dur, sr, peak, gen(S, k) })` (one-shot, n variants),
`defineUi`. `S` is the drawing canvas of `src/audio/sounds.js`: `S.noise(t, gain, att, dec,
filters, dur)`, `S.tone(t, gain, { f0, f1, glide, att, dec, dur, shape: 'sin'|'tri'|'sq'|'saw', vib,
vibF })`, `S.thump`, `S.ring(t, [[freq, decay, gain], ...])`, `S.click`, `S.bubble`, `S.grit`,
`S.filter([['lp'|'hp'|'bp', freq, q], ...])`, plus everything in `src/audio/dsp.js` on `S.out`.
Read `src/audio/levels/l007.js` and the tables in `sounds.js` for examples. Loops and beds must
loop seamlessly (use `cyc(f, L)` for frequencies, circular filters). Keep each sound's synthesis
under ~50 ms. Existing loops for emitters: `vending cooler fridge server static tick transformer
drip washer vent heartbeat machine water pipes fan escalator wind drone hum_strip music_box
door_hum lapping`. Shots for scripts: `door_slam door_close door_latch click relay pipe_knock
vending_start light_on light_off elevator_ding phone_ring clatter thud creak buzz_change
water_rush tile_fall typewriter flick_on flick_off drip deep_groan`.

Sounds follow the rules too: mechanical, electrical, water, wind, structure. No voices,
breathing, crowds, footsteps or animals.

## Scripts and interactive things

`script(ctx, dt)` runs every frame while the player is on the level. `ctx = { game, player,
level, state, time }`; `state` is a per-level object you can keep things in. Useful:

* `ctx.game.audioCall('play', name, x, y, z, { distant, vol, rate })` (omit x/y/z for a sound
  at the listener), `ctx.game.ui.say(text, seconds)`.
* `ctx.game.look = { fog, fogNear, fogFar, grade, sky, weather }` overrides the look (merged
  over the zone env, reset on every level change): e.g. desaturate as you walk.
* `ctx.player.x/y/z/yaw`, `ctx.game.nav.nearest` (`{ x, z, dist }` of the nearest door).
* `ctx.game.flicker` channels, `ctx.game.spawnAt(dim, x, y, z, yaw)` to move the player.

Props with `opts.use = 'level'` (and `opts.label = 'ANSWER'` for the prompt) call the level's
`onUse(ctx, item)`; `item.prop.opts` carries whatever you put there. Notes: `zb.prop('note', x,
y, z, rot, { text: 'A string to show' })`.

## Textures, materials, props

`defineTexture(name, (p, rng) => { ... }, colors)` paints a 64x64 texture with the `Painter` in
`src/gfx/texgen.js` (`fill`, `rect`, `frame`, `bevel`, `line`, `disc`, `ring`, `noise`, `grain`,
`speckle`, `stain`, `drip`, `text`, `map((x, y, c) => [r, g, b])`, `alpha`...); `colors` is the
palette size (4-16). Textures are generated on demand, so many are fine.
`defineMaterial(name, texture, { s, surf, flags, glow, chan, tint, stain })`: `s` metres per
texture repeat, `surf` the footstep sound (`carpet concrete tile wood metal lino water gel grass
drywall plastic wetcarpet wet asphalt`), `flags` `VF.WOBBLE | VF.SCROLL` for water,
`VF.FULLBRIGHT` for self-lit. `defineProp(name, { build(mb, p, r), boxes, use, light, emitter })`
in `src/world/props.js` style; existing props: `grep -n "^P('" src/world/props.js`.

## Performance

Zone generation under ~25 ms on average, a chunk under ~60 ms to build, the arrival chunk under
~8000 triangles, and under ~60k triangles in view. Prefer brushes to many props; reuse props.

## Testing

* `node tools/check.mjs` after every edit (imports every module).
* `node tools/levels.mjs 21 22 23` checks your levels: arrival point on floor with headroom, the
  arrival door, doors within 128 m, generation and chunk times.
* Screenshots: run a static server on your own port and use `tools/shots.mjs` with
  `"dim": 1000 + n` (or open `index.html?lv=21` in the browser to start on level 21's arrival
  point with its title card):
  `PORT=8781 node tools/shots.mjs '[{"name":"a","dim":1021,"x":32.5,"y":0,"z":40.5,"yaw":0,"wait":4000}]' "" <outdir>`
  `spawnAt` drops you on the nearest free floor. Always check the arrival view first.
