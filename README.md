# Ragdoll Lab

A browser sandbox for physically simulated human reactions, in the spirit of NaturalMotion's
Euphoria. A sculpted, anatomically proportioned dummy stands on a flat test arena, keeps its
balance with its own muscles, and reacts to whatever you do to it: shoves, thrown objects,
gunshots. All of its movement comes from simulated muscles and physics, with no canned animations.
Injuries persist and have physiological consequences: bleeding, fractures, paralysis, loss of
consciousness, death.

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
| B | Follow camera |
| V | Physics view: colliders, centre of mass, capture point, support polygon |
| H | Hide the interface |

The settings panel adjusts balance assist, throw power, shove impulse, bullet momentum (real
values by default, up to 6× for exaggerated effects), bleeding rate and sound volume.

## What is simulated

### Physics engine (`src/physics`)

A custom rigid-body engine built on **XPBD** (Müller et al. 2020, *Detailed Rigid Body Simulation
with Extended Position Based Dynamics*). It runs 20 substeps per 60 Hz frame with one constraint
iteration per substep.

- **Shapes:** rounded spheres, capsules and boxes. Box contacts use SAT with face clipping.
- **Contacts:** non-penetration, Coulomb friction with static and dynamic phases, torsional patch
  friction, and restitution with a velocity threshold.
- **Floor friction:** persistent friction anchors on the floor, so planted feet don't creep.
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
- **Balance assist:** Euphoria-style helper torques that fade out as soon as balance is lost. The
  settings slider scales them; set it to 0 for unassisted balance.
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

## Project layout

```
src/physics   XPBD engine: math, bodies, shapes, collision, joints, world
src/human     anatomy, ragdoll, IK, motor controller, body sculpt + mesher, organs, injury model
src/game      sandbox (simulation orchestration), weapons, throwables, audio
src/render    arena, skinned body, blood, floor decals, effects, view model, prop meshes
src/ui        interface and styles
test          physics, ragdoll and injury tests (node --test)
tools         headless helpers (simulation runner, screenshot and filmstrip scripts)
```

## Notes

- Everything is generated procedurally at runtime: meshes, textures, sounds. There are no
  external assets.
- The sandbox and injury model take an injectable random source; the tests use a seeded one so
  their outcomes are reproducible.
