# Alley

A cinematic walking game set in a narrow, wet, graffiti-covered service alley
at blue hour, played over her shoulder or through her eyes. No HUD, no UI, no
crosshair, no combat. You walk.

Everything is procedural and built at load time from code: the voxel
architecture, brick relief, graffiti, props, lighting, and all of the sound.
There are no texture, model, or audio files.

## Play

```bash
npm install
npm run dev          # http://localhost:5173
```

Click once to enter (the browser needs a gesture to start audio and pointer
lock). Then:

| Input | Action |
| --- | --- |
| Mouse | Look / swing the camera round her (drag to look if pointer lock is unavailable) |
| W A S D / arrow keys | Walk |
| Shift | Brisk walk |
| V | Switch between the over-the-shoulder camera and her eyes |
| F | Fullscreen |
| Esc | Pause |
| Gamepad | Left stick walks, right stick looks, L1/LB is a brisk walk, R3 switches the camera |
| Touch | Left half of the screen walks, right half looks, a double tap switches the camera |

The camera starts behind her right shoulder. She walks wherever you steer and
turns to face it, and the camera trails her with a little lag. Walls and
props push it in, and it eases back out. While she has the can out or is
winding up a throw, she faces where you look and side-steps instead, and the
camera closes in while she sprays. Swing the camera round in front of her and
she meets your eye.

In first person, look down to see your boots and the hem of your skirt. The
steps follow where you are going:
- Planted feet stay put and roll from the stiletto onto the ball.
- Strafing gives side-steps that close in rather than cross.
- Walking backwards lands toe first.

Headphones help: the
heel clicks echo between the walls, and the slap-back from the far end shortens
as you approach it.

### Spray paint

| Input | Action |
| --- | --- |
| E | Take the can out / put it away |
| Left mouse or Space | Spray (hold). A gamepad's right trigger is pressure-sensitive |
| Right mouse | Shake the can |
| Mouse wheel / Shift + wheel | Spray width / paint flow |
| 1 2 3 4 | Skinny, standard, fat or calligraphy cap |
| Tab | Paint menu: colour wheel, presets, caps, width, flow, finish, drips |
| Z | Undo the last stroke |

Distance matters as it does with a real can. Up close you get a thin, hard,
heavy line that runs if you linger. Further back the line is wide and soft,
with overspray. A fast pass is translucent. Slow down or go over it again to
make it solid. Your paint is saved in the browser and comes back on reload.

### Litter

| Input | Action |
| --- | --- |
| Q | Crouch and pick up the can, bottle or cup you are looking at; Q again sets it down |
| Left mouse or Space, while holding something | Hold to wind up, let go to throw |
| Gamepad | X picks up and sets down, the right trigger throws |
| Touch | The pick and throw buttons |

Cans, bottles and cups are rigid bodies. Walk into them and your boots kick
them along; they roll, bounce off the walls and props, and settle. A bottle
that hits something hard enough breaks into pieces of its own glass, which
crunch underfoot afterwards.

Three people are asleep in the alley's sheltered corners. Walk quietly.

### Build

```bash
npm run build        # dist/index.html + dist/assets, and dist/alley.html
```

`dist/alley.html` is a single self-contained file (about 1.2 MB) that runs from
any static host.

### URL parameters

| Parameter | Effect |
| --- | --- |
| `q=low\|medium\|high` | Quality preset: fog steps, reflection resolution, brick relief. By default it is picked from the GPU class |
| `dpr=1` | Cap the device pixel ratio (default 1.5) |
| `fixedRes` | Disable dynamic resolution scaling |
| `exp=10` | Exposure override |
| `fp` | Start in first person |

Resolution scales between 50% and 100% to hold the frame rate. Graffiti is
generated in a pool of Web Workers while the rest of the world is built.

## How it is made

**Voxel world.** Every surface is built on voxel grids and meshed with a
greedy mesher that bakes per-vertex ambient occlusion (`src/voxel/`). The
mesher also merges faces whose occlusion varies along only one axis. That
merge is exact and removes about a third of the prop triangles. Architecture
snaps to one brick course (6.77 cm). Props use 1.35 cm and 2.7 cm voxels.

**The walker.** She is modelled as signed distance fields in her bind pose
(`src/player/character/`). The parts are:
- Skin and face: eyes, lids, winged lashes, brows, nose, lips and gold hoops.
- Hair: sleek dark hair in a high ponytail, with face-framing strands.
- Clothes: a cropped leather biker jacket over a wine satin top, a mini skirt,
  sheer black tights and knee-high stiletto boots.

A worker meshes each part while the alley loads:
- Surface nets at 2.2 to 5 mm put one vertex per crossed cell, projected onto
  the surface.
- A quadric-error simplifier then cuts the result to about 68,000 triangles.
  It never collapses across a material boundary, so the iris, lips and zips
  keep their edges.
- Normals and occlusion come from the field.
- Every vertex gets weights for a 50-bone skeleton (fingers, eyes, lids and a
  ponytail chain) from anatomical rules.
- Each part is culled against a sphere that follows the pose.

The animation is procedural (`animate.js`):
- Feet land on the step planner's footholds. The planner steers each swing
  so the foot comes down where the hips will be.
- The pelvis rises gently over each stance (about 2 cm), drops smoothly to
  keep both feet in reach, sways over the stance foot, and leans into
  starts, stops and turns.
- The spine counter-rotates and breathes. The arms swing, and the head stays
  level and looks where the camera looks.
- The ponytail is a verlet chain that collides with her head, neck and back.
- Idle, she shifts her weight, glances around, sometimes puts a hand on her
  hip or tucks her hair behind her ear, and blinks.
- Spraying, picking up, winding up and throwing are IK poses blended on top.

A faint rim of the light behind her keeps the black clothes readable against
the dark.

**Props.** There are 73 prop generators (`src/props/`), covering dumpsters,
carts, bags, fire escapes, utility poles, porches, fences, doors, windows,
meters, lamps, rooftop units and litter. Each is seeded and takes options:
- Painted props (dumpsters, poles, fences) report their faces and get graffiti
  and flyers sized to those faces.
- The overhead conductors are strung to the poles' actual insulators.
- The woven chain-link is an alpha-tested texture resolved stochastically
  under TAA, so it fades with distance instead of shimmering.

**Brick relief.** Facade faces are flat in geometry. In the fragment shader,
each face is treated as a heightfield on a 1.35 cm grid: bricks, recessed
mortar, chipped corners, and spalled faces are voxel columns, and a short 2D
DDA walks the view ray through them. Joints and chips therefore read as real
stepped geometry at grazing angles (`src/render/facadeMaterial.js`).

**Wet ground.** The floor is a stepped heightfield built from a drainage
V-profile, wandering tire ruts, potholes (with old brick pavers showing
through), patches, aprons, and drains. A priority-flood fill finds the
basins, and each basin is capped to a rain depth to make the puddles. Wet
asphalt samples a planar reflection with roughness blur and vertical streaks.
Puddles reflect sharply and ripple under drips and heels
(`src/world/ground.js`).

**Light.** The scene is lit in blue-hour sky light with warm lamps:
- A baked irradiance volume stores per-direction sky visibility from a horizon
  scan, a wall-to-wall bounce term, and lamp and window bounce.
- Spot lamps use static shadow maps, and the walker gets a soft capsule shadow.
- A PMREM capture of the alley provides image-based specular.
- Windows show interior-mapped rooms with curtains, blinds, TV flicker, and the
  occasional silhouette.

**Post.** The post pipeline runs in this order:
1. Half-resolution ray-marched volumetric fog. Spot lights are sampled through
   their real shadow maps, and steam plumes are density sources.
2. Depth-aware upsample.
3. Temporal AA with static-world reprojection.
4. Bloom.
5. AgX tone mapping with a restrained grade, vignette, grain, slight chromatic
   aberration, and dither.

**Life.** The alley moves even when you stand still:
- Lamps flicker in bursts that the buzz follows.
- Windows switch on and off, TVs flicker, and someone occasionally walks past a curtain.
- Steam rolls out of vents and through the fog light.
- Drips fall from fire escapes and ripple the puddles.
- Wind gusts lift plastic bags and litter. A bag snagged on the fence keeps flapping.
- Cans and bottles skitter when you kick them.
- Cars pass on the street behind you, sweeping their headlights through the mist.
- Now and then a stranger crosses the far end under the streetlight. The figure's shadow
  re-renders that light's shadow map only while it walks through the cone.

**Spray paint** (`src/spray/`). Paint lands on *canvases*, which are
2 x 2 m projectors laid on a grid over whatever you hit: a wall, the ground, the
side of a dumpster.
- **Storage.** Each canvas owns a 512 x 512 tile of an array render target, so
  paint is about 4 mm per texel. The tile stores premultiplied colour and
  coverage, plus a half-resolution layer for metalness, gloss and wetness.
  Facade, prop and ground shaders find nearby canvases through a 1 m lookup
  grid and composite the paint over the surface. The paint follows the brick
  relief and is slightly thinner in the mortar joints.
- **Deposit.** Each frame of spraying becomes a chain of stamps. A stamp is an
  elliptical Gaussian stretched by the angle of the can, with a grainy core
  and sparse overspray droplets. The stamps are spaced finely enough that fast
  strokes stay continuous.
  - Coverage follows film thickness, so a quick pass is translucent and
    lingering goes solid.
  - The cap and the distance set the width: skinny, standard, fat, or a flat
    calligraphy fan.
- **Drips.** A coarse CPU copy of the wet film feeds the drips. Where too much
  paint sits, a run breaks loose, slides down under gravity, picks up wet
  paint on the way, slows as it skins over and ends in a bead.
- **Wetness.** Fresh paint stays glossy for about half a minute.
- **Undo and saving.** Every change goes through an event log stored as
  float32 values, so replaying it rebuilds the walls exactly, drips included.
  Undo truncates the log and replays it, and the log is what is saved in
  IndexedDB.
- **Mist.** A spray of lit particles leaves the nozzle and hangs at the wall
  as overspray. It scatters the light of the nearest lamps.

**Litter physics.** Loose cans, bottles and cups are rigid bodies
(`src/world/litter.js`). Each has a hull that comes from its own mesh:
- Rings along the axis give round things, so a can rolls smoothly and a cup
  rolls in a circle. Crushed cans, flasks and shards are boxes.
- Contacts come from the ground heightfield, from the facade voxels
  themselves (so door recesses, sills and the loading dock count), and from
  the oriented boxes of solid props.
- A sequential-impulse solver handles friction cones, restitution and rolling
  resistance. Each body takes as many sub-steps as its speed needs and sleeps
  when at rest.
- The walker's boots are moving spheres, so a swinging foot kicks harder than
  a planted one.
- A bottle that breaks is cut into a base, a neck and curved wall shards from
  its own voxels. They are simulated as boxes and skinned into one mesh.
  Impacts, rolls, splashes and the break itself are synthesized sounds.

**Carrying.** Picking something up crouches the walker (the leg IK folds the
knees, the spine bends, the hand reaches for it) and hands the rigid body to
her hand. In the hand it is a
high-resolution twin, rebuilt at about 2 mm from the generator's dimensions
and the world model's colours, in the body's own frame. A throw therefore
hands it back to the world without a jump, with the hand's velocity and spin
(`src/player/Carry.js`, `src/spray/heldItems.js`).

**Sleepers.** The three figures are signed distance fields (bodies, puffer
parka, mummy bag, blankets draped as heightfields over the body, cardboard,
bags, boots) voxelized at 6 to 14 mm with smoothed normals
(`src/world/sleepers.js`). Each figure is one mesh whose chest swells with a
slow vertex displacement. Close by you hear each breath, synthesized with a
soft palate flutter on some of them.

**Graffiti.** A stroke font is turned into handstyles, throw-ups, pieces, and
rollers. These are layered over years of eras with buffs, posters, stickers,
drips, and fading, then sampled by the facade shader. Paint thins in mortar
joints (`src/textures/graffiti/`).

**Sound.** All sound is synthesized with the Web Audio API:
- Heel and toe impacts per surface, matched to the gait phase. Surfaces are
  wet asphalt, concrete, metal grates, puddles, and debris.
- An alley impulse response with flutter echo between the walls, plus dynamic
  slap-back from the end walls.
- HRTF emitters: condenser hum, kitchen exhaust, transformer hum, lamp buzz
  locked to the flicker, drains, and trickles.
- Muffled TV, voices, and radio behind lit windows.
- Distant traffic, sirens, an elevated train, wind gusts shared with the
  visuals, drips synced to falling droplets, and kicked cans
  (`src/audio/`).

## Layout

```
src/core      engine, frame loop, soundscape bridge, RNG/noise
src/voxel     voxel grid, greedy mesher, static batching
src/world     layout, facades, ground, irradiance, windows, wires, props
              placement, collision, ambient life, traffic, debris, litter
              physics, sleepers
src/render    materials (facade relief, voxel props), sky, post pipeline
src/player    walker (input, gait, both cameras), carrying, and character/:
              the SDF model, its build worker, the procedural animation
src/props     voxel prop generators (dumpsters, fire escapes, poles, ...)
src/textures  graffiti generator, weathering maps, paint atlas
src/audio     procedural audio engine
tools/        dev pages (prop preview, graffiti test, audio test)
scripts/      headless screenshot / play-test / build helpers
```
