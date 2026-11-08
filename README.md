# Walk & Wardrobe — a realistic walking and fashion simulator

A browser-based 3D simulator focused on one thing: **lifelike human walking**,
plus an extensive wardrobe to dress the character in. The world is a seamless
white studio: a white floor, a white background and soft light, with nothing
else to distract from the movement.

The character is an adult woman with natural ginger hair, green eyes and
freckles. She is built from CC0 MakeHuman assets by a reproducible pipeline,
and every motion is synthesized procedurally from gait biomechanics.

## Run it

```bash
npm install
```

```bash
npm run dev
```

Then open the printed URL (default `http://localhost:5173`). For a static build,
run `npm run build` and serve the `dist/` folder with any static file server.

### Controls

| Input | Action |
| --- | --- |
| **W A S D** / arrow keys | walk (camera-relative) |
| **Shift** | brisk walk |
| **C** | stroll |
| Mouse drag | orbit the camera |
| Mouse wheel | zoom |
| **1 – 5** | camera presets (full body, close, face, feet, wide) |
| **G** | toggle a faint floor grid, useful for checking that the feet stay planted |
| **Tab** | open or close the wardrobe |

The pill at the bottom left sets the default pace (stroll, walk or brisk).

## What's inside

### Walking (`src/anim/`)

The gait is procedural. There are no canned clips, so it adapts continuously
to speed, turning, stopping and footwear.

- **Momentum.** The center of mass accelerates and decelerates at human rates
  (about 1.2 m/s² starting, 2.3 m/s² stopping) and turns at a limited angular
  rate. She walks where she faces and slows down for sharp turns.
- **Gait cycle.** Cadence and duty factor follow measured speed relationships
  (roughly 105–125 steps/min at normal speeds, with longer double support at
  slow speeds). Steps alternate from a continuous phase.
- **Footstep planning.** Each swing foot keeps re-planning its landing spot
  from the *predicted* body position at heel strike. That is why starting,
  stopping (she plants two settling steps), turning and changing speed all
  produce sensible steps, including small corrective steps when she turns on
  the spot.
- **Zero foot sliding.** Stance feet are locked to the floor. Each foot rolls
  heel → flat → ball → toe (heel, ankle and forefoot rockers): the toes stay
  on the ground while the heel lifts, then the foot pivots on the toe tip.
  Swing feet follow smooth Hermite trajectories with toe clearance.
- **Pelvis.** Pelvis height comes from the supporting legs (an
  inverted-pendulum arc with loading-response knee flexion). It shifts
  laterally over the loaded foot and rotates, tilts and drops on the swing
  side following clinical gait curves.
- **Upper body.** The trunk counter-rotates against the pelvis, leans with
  acceleration and into turns, and breathes. The arms swing contralaterally
  as damped pendulums, with elbow flexion and lagging wrists. The hands rest
  in a relaxed, graded finger curl.
- **Head and eyes.** The head is stabilized in space, nods slightly with each
  step and leads into turns. The eyes saccade and blink (more often with gaze
  shifts).
- **Idle.** She shifts her weight between legs (contrapposto, with the free
  knee relaxed and its heel lifting), sways slightly, glances around and
  occasionally looks at the camera.
- **Two-bone leg IK** with soft limits. As a final guarantee, the pelvis is
  lowered rather than letting a planted foot lift off or a knee lock straight.

### Footwear changes the walk

Each shoe defines its heel height and sole thickness, which change the foot
geometry used for planting and IK, and its own gait parameters:

| Shoes | Effect on gait |
| --- | --- |
| Barefoot / sneakers / flats | full heel strike, long toe roll |
| Mid-heel pumps | shallower heel strike, shorter steps, more pelvic rotation and drop |
| Stilettos (10 cm) | near-flat foot contact, short quick steps placed almost in line, pronounced hip sway, upright chest, little bounce |
| Ankle / knee boots | stiffer forefoot, slightly shortened stride |

Garments can affect the walk too: a pencil skirt shortens the stride and
quickens the cadence.

### Clothing (`src/wardrobe/`)

The catalog covers:

- **Tops:** T-shirt, Breton, fitted top, camisole, blouse, button-up shirt
  (with collar, placket and buttons), cropped tee.
- **Knits and jackets:** chunky cable sweater, cardigan, blazer, leather biker
  jacket, denim jacket.
- **Bottoms:** skinny jeans, straight jeans, wide-leg trousers, leggings,
  denim shorts, A-line mini, pencil skirt, pleated midi, maxi.
- **Dresses:** slip dress, tea dress, ribbed bodycon, evening gown with a slit.
- **Coats:** trench coat and wool coat.
- **Legwear:** opaque tights, sheer pantyhose, lace-top stockings, fishnets,
  ankle, crew and over-the-knee socks.
- **Shoes:** sneakers, ballet flats, loafers, strappy sandals, mid-heel pumps,
  stilettos, ankle boots, knee-high boots.
- **Hair:** long straight, loose waves, ponytail, blunt bob, low bun, French
  braid, in five ginger and red shades.

Lingerie is the base layer and can be restyled but not removed.

Each item can be recolored (palette or color picker). Most items also offer
alternative fabrics (cotton, jersey, linen, denim, wool knit, cashmere, silk
satin, chiffon, leather, suede, patent, tweed and more) and patterns (Breton
stripes, pinstripe, gingham, tartan, polka dots, houndstooth, floral, leopard,
rib, cable knit). Hosiery has an adjustable denier.

How the clothing works:

- **Fitted garments** are cut out of the body surface along smooth iso-lines,
  so the hems are clean curves. They are then offset by fabric thickness and
  ease and relaxed so the fabric bridges concavities: it drapes from the bust
  and shoulder blades rather than clinging. They inherit skin weights, so they
  deform exactly with the body. Skin that is fully covered by opaque cloth is
  hidden. Tops are tucked into waistbands automatically, and covered inner
  layers are not drawn.
- **Skirts, dress skirts and coat tails** are simulated cloth
  (position-based dynamics with tethers). The waistband follows the body
  exactly. The cloth collides with the legs, hips and hands, and a radial "leg
  hull" stops fabric from ever slipping behind a striding thigh. Hems swing,
  lag and settle with her momentum.
- **Shoes** are lofted "lasts" fitted to the footprint and instep, with a
  per-pixel topline (vamp) cut. Soles and heels (stiletto, slim or block) are
  modelled in the heeled pose and mapped back to the bind pose, so the
  forefoot sits flat and the heel stands vertical.
- **Fabrics** are procedural. Weaves, knits, denim twill, slubs, patterns,
  rib bands, lace tops, fishnet and construction details (jeans topstitching
  and pockets, shirt placket and buttons, zips) are computed in rest space
  with a tri-planar projection. They are seamless, stick to the cloth and fade
  smoothly at distance to avoid aliasing. Sheer hosiery uses a
  view-dependent density model.

### Character, physics and rendering

- **Hair physics.** Hanging hair is analyzed into strand chains (back mass,
  left and right locks, ponytail or braid). These are simulated as Verlet
  ropes with shape memory and collide with the head, neck, shoulders and back.
- **Skin.** Per-channel wrap lighting approximates subsurface scattering, with
  sheen and micro pore normals.
- **Eyes.** A separate glossy cornea layer gives the eyes a wet look.
- **Studio.** The white studio uses soft key and rim lights, environment
  reflections and blurred contact shadows that ground the feet.

## Project layout

```
index.html, src/main.js     app, input, test hooks
src/anim/                   Locomotion (gait engine), BodyLayer (upper body / idle), Rig (IK), Animator
src/wardrobe/               BodyAtlas, GarmentBuilder, Skirt, Shoes, fabric shader, catalog
src/physics/                Cloth (PBD), HairPhysics
src/character/              Character loading, skin & hair materials
src/world/                  Studio (lighting, floor), ContactShadows, FollowCamera
src/ui/                     Wardrobe panel
tools/build_character.py    asset pipeline (MakeHuman CC0 data → public/assets)
tools/frames.mjs, sheet.py  automated frame capture and contact sheets used for visual QA
tools/ui_test.mjs           end-to-end UI check (Playwright)
public/assets/              generated character, hair and metadata (committed)
```

## Rebuilding the character assets

The generated assets are committed, so this is only needed to change the body
or add hairstyles.

1. Clone MPFB2 (`https://github.com/makehumancommunity/mpfb2`). It supplies
   the base mesh, targets and the game-engine rig and weights.
2. Download the CC0 asset packs from the MakeHuman community asset-packs page
   (`makehuman_system_assets`, `skins01`, `hair01`) and extract each into one
   folder.
3. Run the pipeline:

```bash
python3 tools/build_character.py --mpfb <mpfb2>/src/mpfb/data --assets <packs-folder>
```

The script applies the shape targets (young adult woman, ideal proportions),
softens the always-covered bust contour, adds blink and smile morph targets,
subdivides the body once (Catmull–Clark, with weights and morphs subdivided
too), builds a skeleton with identity rest orientations (so joint angles are
anatomical), fits the eye, brow, lash and hair proxies, and writes the GLB
files and `character.json` (skeleton and foot landmarks).

## Credits and licences

- The body base mesh, targets, rig and weights come from MakeHuman / MPFB2
  data (CC0).
- The skin is *toigo light skin female ginger 2*. The eyes, eyebrows,
  eyelashes, long and ponytail hair come from the MakeHuman system assets.
  The waves, bob, bun and braid hairstyles come from the community *hair01*
  pack. All of these are CC0.
- [three.js](https://threejs.org) (MIT) and Vite (MIT) power the app.
- All garments, shoes, fabrics and motion are generated procedurally by this
  project.
