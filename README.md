# Ragdoll Lab

A browser sandbox for physically simulated human reactions, in the spirit of NaturalMotion's
Euphoria. A sculpted, anatomically proportioned dummy stands on a flat test arena, keeps its
balance with its own muscles, walks wherever you send it (over kerbs, logs and boards and up onto
platforms), and reacts to whatever you do to it: shoves, thrown objects, gunshots. All of its
movement comes from simulated muscles and physics, with no canned animations.
Injuries persist and have physiological consequences: bleeding, fractures, paralysis, loss of
consciousness, death.

It also has a first-person **survival mode** (the red *▶ Survival* button, or P). You hold the
platform of a subway station while trains bring in the dead, wave after wave, with a brute in
riot gear every fifth wave. The zombies are the same simulated people as the sandbox's dummies:
the same ragdoll, muscles, balance and gait, with an undead injury model and a brain that hunts
you. They stagger when they are shot, fall when their legs are shot out, and get back up.

```bash
npm install
npm run dev
```

Then open the printed URL (default <http://127.0.0.1:5173>). Sound starts after the first click.

```bash
npm test
```

```bash
npm run build
```

To produce a single self-contained `ragdoll-lab.html` that runs straight from disk:

```bash
npm run build:single
```

## Controls

| Input | Action |
| --- | --- |
| Left click | Use the selected tool (shoot, throw, grab, shove) |
| Shift + left click | Drop the selected prop from above the pointed spot |
| Right drag | Orbit the camera |
| Shift + right drag, or middle drag | Pan the camera |
| Mouse wheel | Zoom |
| W A S D | Move the camera |
| 1 – 6 | Pistol, revolver, shotgun, SMG, assault rifle, sniper rifle |
| G / F | Grab / shove |
| Q / E | Previous / next throwable |
| Space | Pause |
| `.` | Step one frame while paused |
| T | Slow motion (0.25×) |
| R / N / C | Reset / spawn another dummy / clear props |
| M | Walk tool: click a dummy to select it, click a spot to send it there, shift+click adds a waypoint |
| X | Stop the selected dummy walking |
| O / shift+O | Obstacle tool: next / previous obstacle (Z rotates the placement, shift+click removes one) |
| B | Follow camera |
| V | Physics view: colliders, centre of mass, capture point, support polygon |
| H | Hide the interface |

The settings panel adjusts balance assist, throw power, shove impulse, bullet momentum (real
values by default, up to 6× for exaggerated effects), bleeding rate and sound volume.

### Survival mode

Click into the view to start (the mouse is captured; Esc pauses and shows the settings).

| Input | Action |
| --- | --- |
| Mouse / touchpad | Look |
| Left click | Fire |
| E | Aim down the sights (toggles; *Hold E to aim* in the pause menu makes it hold-to-aim; right click works too) |
| W A S D | Move |
| Shift | Sprint (stamina) |
| C / Ctrl | Crouch |
| Space | Jump; climb a ledge (the platform edge from the tracks, a bench) |
| R | Reload |
| 1 – 4, Q, wheel | Pistol, assault rifle, shotgun, SMG; last weapon; next / previous |
| F | Shove the zombie in front of you |
| Esc | Pause: sensitivity, field of view, horde size, volume, restart, back to the sandbox |

## What is simulated

### Physics engine (`src/physics`)

A custom rigid-body engine built on **XPBD** (Müller et al. 2020, *Detailed Rigid Body Simulation
with Extended Position Based Dynamics*). It runs 20 substeps per 60 Hz frame with one constraint
iteration per substep.

- **Shapes:** rounded spheres, capsules and boxes. Box contacts use SAT with face clipping.
- **Contacts:** non-penetration, Coulomb friction with static and dynamic phases, torsional patch
  friction, and restitution with a velocity threshold.
- **Floor friction:** persistent friction anchors on the floor, so planted feet don't creep.
- **Fixed obstacles:** contacts with static props are solved like floor contacts (anchors included),
  so a foot on a step is as planted as one on the floor; `World.surfaceAt` gives the height of the
  surface under any point for the controllers.
- **Joints:** ball-and-socket joints with anatomical swing/twist limits (elliptical swing cones).
- **Muscle drives:** implicit spring-damper drives with torque caps. They can target a pose
  relative to the parent, a world orientation, or hold the parent's orientation (for stance legs).
- **Impact records:** per body pair, every frame, with the full collision impulse and approach
  speed. Blunt trauma and sounds use these records.

### The body (`src/human/anatomy.js`, `ragdoll.js`)

- 17 segments with de Leva (1996) mass fractions: 74.5 kg, 1.78 m.
- Joint ranges come from clinical range-of-motion tables: spine (lumbar/thoracic), neck,
  shoulders, elbows, wrists, hips, knees, ankles.
- Inertia tensors are computed from the collider shapes.
- Parent/child segment pairs never collide; all other segment pairs self-collide unless they
  already overlap in the rest pose.

### Motor control (`src/human/controller.js`)

There is no animation data. Every frame the controller senses the body: centre of mass, capture
point, foot contacts and loads, support polygon. It then chooses behaviours, turns them into
joint targets (with analytic inverse kinematics), and drives the joints through the muscle model.
Muscle strength scales with consciousness, pain and injuries.

- **Standing balance**
  - Quiet standing with physiological postural sway (a few millimetres, slow) and occasional
    weight shifts between the feet; no solver jitter.
  - Gravity-compensating joint torques.
  - The legs share the load by the lever rule.
  - Ankle torque is limited to what the foot's centre of pressure can deliver.
  - A centre-of-mass servo provides ankle and hip strategies.
- **Reactive stepping**
  - Capture-point (inverted pendulum) step placement.
  - Cost-based choice of stepping foot, including crossover steps.
  - Swing-foot muscle springs, plant-on-arrival and landing absorption.
  - Settle steps tidy up an awkward stance afterwards.
  - Staggering: successive steps with the trunk leaning along the push until the body is caught;
    when the trunk is toppling the arms windmill to rotate it back.
- **Walking** (`src/human/locomotion.js`): a goal-directed gait built from balance steps, with no
  gait cycle played back.
  - Each walking step lands where the capture point says, offset so the body keeps travelling:
    the foot goes behind the predicted capture point by `b = v·T / (e^(ωT) − 1)` (the next step
    is again one stride ahead) and to the outside by enough to sway from foot to foot. A push or
    a hit simply moves the next footholds; a hard one turns the step into a catch step and the
    walk resumes once the balance is back.
  - The capture point is planned from the body the stance leg carries, without the swinging leg,
    whose own momentum would make the landing spot surge and fall back within a swing.
  - The stance leg is a strut the body vaults over: its ankle does not hold the body back, and the
    trailing foot rolls onto its ball (heel-off and push-off), which keeps the leg long instead of
    dropping the pelvis into a crouch.
  - Gait initiation with a weight shift, turning with the steps (the inside foot first, up to
    about 0.6 rad per step on the spot), arm swing with the opposite leg, pelvic rotation, a
    walking lean, slowing down to arrive, and a limp over a hurt leg. The speed (about 1.1 m/s)
    drops with leg wounds, pain and blood loss; too weak, it stops.
  - Routes come from an A* planner over a height grid of the arena: steps and logs are crossed,
    crates are walked around. People walking past each other give way.
  - Footholds are checked against the terrain: flat under the sole, not on an edge or the top of
    a log, and not right in front of something that has to be stepped over. The swing foot
    clears what is under its path (it goes up first, then over) and walkers slow down for
    obstacles. Stairs are not handled yet.
  - Above about 1.3 m/s the same gait becomes a run (no flight phase: a fast, lurching jog at up
    to about 1.9 m/s). The swing takes a larger share of the stride. The foot's path is spread
    over the whole swing and its landing spot is committed early, because a target that still
    moves late in a fast swing flings the foot 20–30 cm past it. Late swing is braked harder. A
    pelvis yaw stabiliser stands in for the counter-rotating trunk and arms (a leg flung forward
    at 8 m/s otherwise twists the pelvis by up to 60° each stride). The trailing foot is let go
    rather than crouched after. Steering stays near the direction of travel, so turns are made
    over several strides with a slow-down. A stride that falls short slows the runner down
    instead of breaking off into a stumble.
- **Balance assist:** Euphoria-style helper torques that fade out as soon as balance is lost. The
  settings slider scales them; set it to 0 for unassisted balance. While walking, the same helper
  adds a small force toward the walking speed, and a sideways nudge while a planned foothold is
  out of a natural stride's reach.
- **Falling:** protective bracing. The arms reach toward the predicted landing point, then the
  planted hands act as yielding struts. When falling backwards the chin tucks.
- **Falling to the knees:** when the legs give way (a leg or gut wound, a broken leg, blood loss)
  the knees fold and the body drops onto them with the trunk upright, as in Euphoria. It kneels
  for a moment, clutching the wound, then leans forward onto its hands; if it can, it gets up from
  there, otherwise the arms let the chest down to the floor with the face turned aside. If the
  trunk topples instead (no balance assist, a hard hit), it switches to the protective fall.
- **Reflexes**
  - Startle at gunshots.
  - Hit reactions: the struck segment recoils and the trunk snaps along the bullet's path, then
    the balance controller recovers (a stagger step if needed); doubling over a gut wound, a leg
    buckling when hit, an arm dropping.
  - Light thrown objects are absorbed standing; heavy ones (a bowling ball, a dumbbell) can still
    knock it down.
  - Protective blocking: the forearms come up into the path of incoming objects, after a
    perception delay of about 150 ms. The trunk dodges and the head turns away.
- **Wound behaviour:** the dummy clutches its most painful wound with one or both hands. Hand
  pressure reduces the bleeding.
- **On the ground:** calm when it hardly hurts. Curling and writhing grow with pain. Unable to get
  up and in bad pain, it turns onto its side away from the injury and curls up.
- **Getting up:** when a fallen dummy is able (strong enough legs and arms, pain not too high) it
  gets back up after a short rest. It rolls onto its front, pushes up to hands and knees, kneels
  up and brings one foot forward into a half kneel. It then rises over the front foot and steps
  the back foot up beside it. With a broken arm it gets up on the other arm. If an attempt
  topples over, the protective fall reflexes take over. Each phase is driven by the muscles: IK
  targets, plus joint torques that carry the weight over whatever hands, knees and feet touch
  the floor. The helper forces are small and scale with the balance assist. A broken leg, too
  much pain, heavy blood loss or paralysis keeps it down. After a knockout it is dazed and slower.
- **Breathing:** the trunk breathes. The rate and depth rise with pain, blood loss and low
  oxygen, and breathing stops with a high spinal cord injury or death.
- **Loss of control:** unconsciousness and death release muscle tone over about 0.3 s, into a
  full ragdoll.

### Injuries and physiology (`src/human/injury.js`, `organs.js`)

**Internal anatomy.** These structures are placed in the bind pose:

- brain and brain stem;
- spinal cord at four levels (C1–3, C4–7, thoracic, lumbar), plus the vertebrae;
- heart, aorta and vena cava;
- carotid, subclavian, brachial, radial/ulnar, iliac, femoral, popliteal and tibial arteries;
- lungs, liver, spleen, kidneys and bowel;
- the long bones, pelvis, clavicles and scapulae.

**Ballistics** (`src/game/weapons.js`)

- Rounds use real masses and velocities: 9 mm, .357 Magnum JHP, 00 buckshot, 5.56 mm, .308.
- Each segment is hit-tested against the visible sculpted skin, not the colliders, so entry and
  exit points sit on the surface you see.
- The wound channel is traced through every segment and prop along the line of fire. Projectiles
  lose penetration in tissue and bone and can pass through an arm into the chest.
- Energy deposit sets a temporary-cavity radius. High-velocity rounds damage structures near the
  channel, not only the ones they touch.
- The bullet transfers its lost momentum to the body. By default this is the real value, which is
  small; the dramatic reactions come from the body's own muscles.

**What each structure does when hit**

- **Major vessels** bleed at rates set by vessel size, split between external and internal
  bleeding.
- **The heart** loses pump function, so pressure collapses and consciousness goes within seconds.
- **The lungs** reduce oxygenation.
- **The trachea** compromises the airway.
- **The spinal cord** causes paralysis by level. A high cervical injury also stops breathing.
- **Long bones physically break:** the segment splits into two bodies joined by a loose joint,
  and the skin re-skins around the break.
- **Other bones** (skull, ribs, pelvis, vertebrae, hands, feet) fracture without splitting.
  Fractures weaken the limb and add pain.

**Blunt trauma.**

- The engine's impact impulses become peak forces through contact times that depend on both
  surfaces: concrete, brick, metal, wood, rubber, and padded or bony body parts.
- A flat floor spreads the load over broad body parts.
- These forces are compared with tissue tolerances to produce bruises, fractures (including long
  bones), organ rupture, concussion, knock-out and fatal head trauma.

**Physiology** runs continuously:

- **Circulation.** 5 L of blood, of which only the stressed volume drives venous return. Reflex
  vasoconstriction holds blood pressure (with a racing pulse) up to about 30 % blood loss;
  beyond about 40 % venous return and pressure collapse.
- **Bleeding.** Every bleed is a leak in parallel with the circulation: the arterial leaks can
  never exceed the cardiac output, the leaks of a limb share its feeding artery, and a hole in
  the aorta drops the arterial pressure at once. Low-pressure oozing continues, so bleeding never
  stalls. Clotting depends on the vessel (large arteries barely seal); severe trauma and shock
  impair it. Hand pressure on a wound slows it.
- **Shock spiral.** Low pressure and low oxygen starve the heart muscle and weaken the pump.
- **Respiration.** Pneumothorax (closed, open, tension), haemothorax, airway injury, aspirated
  blood and an expanding neck haematoma; a high spinal cord injury stops breathing and the
  oxygen stores run out over about two minutes.
- **Arrest and death.** No pulse, ventricular fibrillation from a heart wound, or severe hypoxia
  stop the circulation; clinical death follows after a short agonal phase with gasps.
- **Trauma burden.** Every injury is graded; ISS and NISS are shown in the monitor and feed into
  shock, heart weakening and clotting failure.
- Pain is masked by adrenaline and decays over time.
- These states feed back into muscle strength, balance skill, breathing and behaviour.

Typical outcomes (measured by `tools/bench/lethality.mjs`): a magazine or a shotgun blast to the
torso kills within about 10-20 s; a severed femoral or carotid artery within about 2 minutes;
many limb wounds over a few minutes; a single wound to an arm or the side of a thigh, a jaw or
a scalp graze is survivable.

### Rendering (`src/render`)

- **The dummy's skin.** About 120 anatomical primitives define a signed-distance-field sculpt.
  A web worker polygonises it with surface nets, at 7 mm for the body and finer for the head and
  hands, with invisible overlapping seams. The mesh is skinned to the rigid bodies with soft
  weights.
- **Skin shader**
  - Entry wounds, exit wounds, lacerations and developing bruises (up to 256 per dummy).
  - Pallor from blood loss and cyanosis from hypoxia.
  - Blood on the skin is a per-vertex film. It runs downhill over the mesh in its current pose,
    drips from low points, and spurts from arterial wounds in time with the heartbeat.
- **Blood droplets** fly ballistically with air drag. Where they land they leave stains
  elongated by the impact angle, as in real spatter.
- **Floor stains.** The floor samples a stain texture written with max blending. Pools grow from
  the volume that reaches the floor; a 2.5 mm film gives realistic pool sizes.
- **Props and weapons:** procedural meshes for the props, first-person weapon models with recoil
  and muzzle flash, ejected casings, and tracers.
- **Sound:** all procedural, synthesised with Web Audio in `src/game/audio.js`, including a
  room reverb for the concrete arena.

### Survival mode (`src/game/survival.js`, `subway.js`, `src/fps`, `src/human/zombie.js`)

- **The station:** an island platform between two tracks, with columns, benches, a stairwell and
  tunnel mouths. Every solid is a box, and the same list serves the ragdoll physics (as static
  bodies that behave like the floor), the player's collision, and the zombies' flow field. The
  platform floor is the world's floor plane clipped to a rectangle (`World.setGroundRect`), so
  anything that goes over the edge drops 1.15 m onto the track bed.
- **Trains** brake in from the tunnel at about 15 m/s and stop with their doors facing the
  platform. While stopped, their floors and walls become part of the physics and of the zombies'
  walkable area. They wait until everyone aboard has got off, then close and leave. A moving
  train throws whatever is on the rails in front of it (zombies shot into the pit, or the player)
  and kills it.
- **Waves:** about 5 + 2.6n zombies arrive a car-load per train. Runners appear from wave 2 and
  make up a growing share. A brute boss comes every fifth wave (two from wave 10) and announces
  itself. At most `maxAlive` (10 by default, set in the pause menu) are up at a time; the rest
  wait for later trains. Clearing a wave restocks ammunition, and health returns after five
  seconds without being hit. Score counts kills (headshots ×1.5, trains count), plus wave
  bonuses; the best score is kept.
- **Zombies** (`ZombieBrain`):
  - Pursuit: they follow a flow field toward the player (a bucketed Dijkstra re-run four times a
    second, with routes reduced to a few line-of-sight waypoints). They lead a moving target,
    spread out round it instead of queueing, and ease off for turns they cannot make at speed.
  - Attacks: they swing one arm then the other at it, with hit checks against the player's
    capsule. Against a dummy the blow is a real collision.
  - Gait: walkers shamble at about 0.85 m/s and runners run at 1.7–1.9 m/s with their own running
    gait (see Walking). Brutes are slow, strong (muscle strength ×1.35) and hard to knock about
    (bullet impulse ×0.35).
  - Balance help: their Euphoria-style balance helpers are a little stronger than a living
    person's, so they rarely stumble over their own feet. The helpers still fade out the moment a
    zombie is really knocked off balance. In `tools/bench/zombies.mjs` (runners circling after a
    player, a mixed group after a player darting about, walkers after a retreating one, a horde
    of six), they fell unprovoked 3 times in 45 zombie-minutes, never in the horde. That costs
    about 1 ms of simulation per zombie per frame.
- **Undead injuries:** no circulation, pain, shock or knock-outs. A zombie has hit points worn down
  by the energy each round deposits (sub-linear, so a rifle round is worth about two pistol
  rounds), plus a bonus for vital structures hit, scaled by location. That works out to about
  three pistol rounds or two rifle rounds to the torso, or one close shotgun blast. A round
  through the brain, brain stem or cervical cord drops it at once. Fractures, torn muscle and
  severed nerves still cripple it; a zombie with its legs shot out goes down. The brute's
  helmet stops rounds until it is shot off, and its vest takes 70% of a torso round's energy.
- **The player** (`src/fps/player.js`): a capsule that walks, sprints on stamina, crouches,
  jumps, and climbs ledges up to chest height. It is not a ragdoll, but walking into a zombie
  shoulders it aside through a force on its pelvis, and F shoves one hard enough to stagger it.
- **Guns** (`src/fps/arsenal.js`): pistol, assault rifle, pump shotgun (loaded shell by shell) and
  SMG, firing the sandbox's ballistics. Each has a magazine and reserve, reloads, fire rate,
  spread by stance and motion (aimed, hip, moving, airborne, crouched), and recoil that is half
  a permanent kick and half a punch that springs back.
- **Hands view model** (`src/render/fpsView.js`): gloved hands on the grip and on the handguard or
  pump, with sleeves. Poses for hip, aimed (the weapon's sight line on the eye), sprint, reload
  (the support hand goes to the magazine), and weapon switch. Sway, bob, a landing dip, breathing
  and spring recoil sit on top.
- **Looks:** zombies use a lighter body mesh (about 43k triangles instead of 153k) and a skin
  shader that dresses them by region of the sculpt pose. Torn, filthy clothes, rot blotches,
  veins, dried blood and clouded eyes are varied per zombie. Corpses that have stopped moving
  are taken out of the physics but keep lying where they fell (the oldest are cleared away).

## Benchmarks

Headless benchmarks measure the behaviour objectively (`bash tools/bench/all.sh` runs them all):

| Script | Measures |
| --- | --- |
| `idle.mjs` | quiet standing: postural sway, foot slip, joint jitter |
| `push.mjs` | push recovery from shoves of 30-80 N·s in six directions |
| `throws.mjs` | thrown objects: light ones should be absorbed standing |
| `getup.mjs`, `lying.mjs` | knock-downs and lying starts: getting up, first-attempt rate, time |
| `kneelfall.mjs` | collapses after leg and gut wounds: knock-outs and head strikes |
| `lethality.mjs` | gunshot lethality against physiological expectations |
| `volley.mjs` | time to death after volleys of N rounds to the torso and thighs |
| `walk.mjs` | walking to targets in eight directions, over single obstacles and the test course |
| `zombies.mjs` | zombies chasing a moving player for 30 s: unprovoked falls per zombie-minute, hits |

## Project layout

```
src/physics   XPBD engine: math, bodies, shapes, collision, joints, world
src/human     anatomy, ragdoll, IK, motor controller, body sculpt + mesher, organs, injury model
src/game      sandbox (simulation orchestration), weapons, throwables, obstacles, route
              planner, audio; survival mode: subway station and trains, flow field, waves
src/fps       first-person player, guns, input
src/modes     the survival mode's runtime (hosted by main.js)
src/render    arena, skinned body, blood, floor decals, effects, view model, prop and obstacle
              meshes, walking markers; subway station, first-person hands, zombie gear
src/ui        interface and styles; survival HUD
test          physics, ragdoll, injury, walking, zombie and survival tests (node --test)
tools         headless helpers (simulation runner, screenshot and filmstrip scripts)
```

## Notes

- Everything is generated procedurally at runtime: meshes, textures, sounds. There are no
  external assets.
- The sandbox and injury model take an injectable random source; the tests use a seeded one so
  their outcomes are reproducible.
