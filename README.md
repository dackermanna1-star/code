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

Press **Tab** (or *First person* in the top bar) to walk the sandbox yourself, shooter style,
with every gun, a knife, a baseball bat, your fists, kicks and stamps. A sniper round that is
going to hit someone can turn into a **bullet cam**: time stops, the camera rides the round to
its target, and the impact plays out in extreme slow motion with an X-ray of the skull, ribs and
organs it breaks. Melee blows are physical too. A wound-up bat swing to the chest breaks ribs,
and the X-ray shows them break in slow motion. A haymaker to the chin can knock a dummy out cold
(sometimes into the *fencing response*, arms locked toward the sky), and a stamp on a downed
head can crack the skull. With *RDR reactions* (settings panel) the dummies react to being shot
more theatrically, in the manner of Red Dead Redemption: a head-shot body staggers a step or two
on dying legs before it drops.

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
| 7 – 0 | Knife (shift+click slashes), baseball bat, fists, boot (kicks a standing dummy, stamps on one lying down). Hold the button to wind up the blow |
| Tab | First-person mode |
| K | X-ray view of every dummy on / off (skeleton and organs through glass skin) |
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
values by default, up to 6× for exaggerated effects), bleeding rate and sound volume. It also
has the *RDR reactions* switch and the *Kill cam* switch for sniper shots. Any key skips a
running kill cam.

### First-person sandbox

Tab from the sandbox; click into the view to start. Esc pauses.

| Input | Action |
| --- | --- |
| Mouse / touchpad | Look |
| Left click | Fire. Melee: a tap is a quick swing or a jab; hold to wind up a full bat swing or a haymaker, release to strike |
| E (or right click) | Aim down the sights; with the knife, stab (left click slashes) |
| W A S D, Shift, C / Ctrl, Space | Move, sprint, crouch, jump or climb |
| 1 – 9, Q, wheel | Pistol, revolver, shotgun, SMG, rifle, sniper rifle (4.5× scope), knife, bat, fists; last weapon; next / previous |
| F | Kick, or a stamp when someone is lying in front of you |
| R | Reload |
| N | A new dummy in front of you |
| K | X-ray view on / off |
| Tab | Back to the orbit view |
| Esc | Pause: sensitivity, field of view, volume, hold-to-aim, RDR reactions, kill cam (sniper shots, every sniper hit, any head shot, off) |

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
  full ragdoll. The passive viscosity of the joints grows with the muscle mass around them as the
  tone goes, so a limp body comes to rest like a heavy sack rather than swinging on like a
  puppet.
- **Reaction styles.** *Realistic* (the default): a round through the brain drops the body at
  once, and a hit is a flinch and a stumble. *RDR*: a fatal hit leaves the body on its feet for
  0.6-1.3 s. Tone fades, the legs give way gradually and the balance assist lets go, so the body
  staggers a step or two with the blow before it collapses. Flinches are bigger, a shoulder or a
  flank hit twists the trunk round, and the shot carries an extra, artistic impulse.
- **Reflexes without a brain.** These drive muscles directly, bypassing the lost tone:
  - *Fencing response:* a concussive knockout can lock the arms for a few seconds, as in
    knocked-out fighters. The arm on the side the face turns to stretches out toward the sky and
    the other is flexed at the chest.
  - *Post-mortem spasms:* after brain death the spinal cord fires a few spasms once the body is
    down: the flexor withdrawal of a leg, a few beats of ankle clonus, an arm or a hand flexing,
    a shudder through the back. They are internal muscle torques of plausible size and fade over
    a few seconds.

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

### Melee (`src/game/melee.js`)

A blow is swept, not scripted. Every physics step the game hands the striker the world-space
striking geometry where it is now: the bat's barrel, the knife's blade, the knuckles, the boot's
sole. The striker sweeps it from where it was, finds the first contact with each body part, and
resolves the collision as an impulse between two effective masses:

- **the weapon's** at the point that hits: a bat pivoting in the hands, a fist with the arm and
  the trunk's rotation behind it, a stamp with the leg and the body's weight;
- **the struck part's** at the point it is hit, plus the share of the body that moves with it
  during a contact of a few milliseconds.

A part lying on the floor cannot get out of the way and is crushed against it. The injury model
gets the closing speed, the masses and the stiffness of the striker, and works out from them the
peak force of the blow, its duration, and what breaks:

- **Ribs:** each rib is counted, and can be displaced, segmental or a flail segment. Breaks lead
  on to lung contusion and pneumothorax.
- **Skull:** fractures can be depressed or basal.
- **Face and neck:** nose, cheekbone, jaw, larynx, cervical spine.
- **Collarbone, sternum, hands, pelvis**, and long bones, which break physically in the ragdoll.
- **Head:** concussion, knockout, brain bleeds.
- **Soft tissue:** bruises, incised wounds and stab tracks with their own length and depth that
  open the vessels and organs they reach.

The weapon loses the momentum it gives away: a bat stops dead on a head but carries on through a
parrying forearm, and the first-person swing goes on at the speed it has left. Some calibration
points (several seeds each, see `test/melee.test.js`):

| Strike | Result |
| --- | --- |
| A jab (7 m/s) | no knockouts, no fractures |
| A full haymaker (11 m/s) | knocks out 7 in 8 to the chin; breaks the nose |
| A fist to the liver | drops a dummy to its knees |
| A bat to the ribs at 14 / 22 / 30 m/s | 1 / 2 / 3 ribs broken. At 30 m/s also displaced ribs, lung contusion, sometimes a pneumothorax; the dummy goes down |
| A bat to the temple at 30 m/s | fatal |
| A bat to the temple at 14 m/s | a knockout and, mostly, a brain bleed that kills within minutes |
| A full stamp on a lying head | the first breaks the nose and the back of the skull, the second kills |
| A slash across the throat | both carotids and the trachea open, about 40 mL/s |
| A stab to the chest | through the sternum into the heart and a lung |

Hanging arms shield the side of the chest, as they do in life: a swing from the side often
breaks the arm instead.

### Kill cam (`src/modes/killCam.js`)

When a sniper round is about to hit someone at least 1.5 m away, the shot goes to the kill cam:
always for the head and trunk, now and then for a limb. The *Kill cam* setting can make it
every hit, or any gun's head shots. The sequence:

1. The world stops, and a modelled 7.62 mm round flies the real line of fire with the camera
   riding just behind it, rolling slowly round its line.
2. As it closes in, the victim's flesh turns to glass and the skeleton and organs show.
3. The real round is fired through the physics at the moment of arrival, so the wound, the
   fractures and the reaction are the simulation's own.
4. The camera holds a beat, then orbits the wound at 3-8 % speed while the X-ray shows what the
   round did (a skull bursting, a rib snapping, an organ torn).
5. Time ramps back up.

A bone-breaking melee blow gets a shorter *impact moment*: a second of slow motion with the
X-ray, seen from where the player stands.

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
- **Hands view model** (`src/render/fpsView.js`, `meleeModels.js`):
  - **The hands** are anatomical tactical gloves: palm pads, knuckles, three-joint fingers and a
    thumb, a moulded knuckle guard, cuffs and sleeves. They are a signed-distance sculpt meshed
    once and skinned to 17 bones. A contact solver closes every finger round the grip it holds
    and puts the index finger on the trigger.
  - **Aiming:** the sight line of every gun was measured, so at full ADS the rear and front
    sights (or the red dot) sit exactly on the screen centre. The sniper rifle's eye goes into
    its 4.5× scope.
  - **Reloads** show the magazine coming out, falling and a new one going in. The shotgun loads
    shell by shell, the sniper's bolt cycles after each shot, and an empty pistol's slide locks
    back and is released.
  - **Melee:** the knife, the bat and bare fists have their own wind-up, charge, strike and
    recovery animations, with a hit-stop when a blow lands. Kicks and stamps show the boot
    whatever is in the hands.
  - Sway, bob, a landing dip, breathing and spring recoil sit on top of every pose.
- **Looks:** zombies use a lighter body mesh (about 43k triangles instead of 153k) and a skin
  shader that dresses them by region of the sculpt pose. Torn, filthy clothes, rot blotches,
  veins, dried blood and clouded eyes are varied per zombie. Corpses that have stopped moving
  are taken out of the physics but keep lying where they fell (the oldest are cleared away).

## Last Lookout (`tower.html`, `src/tower`)

A second game built on the same engine: a tower-defence sniper game with stylised late-90s
graphics and the full physics underneath. You sit in a fire-lookout cabin 22 m up a steel tower in
a dead farm valley and never move. You look round, scope in and shoot. The dead walk in from the
valley's edges toward the fenced compound at the tower's foot and batter its gates, and climbers
go up the tower legs. There are waves, bosses every fifth wave (the Brute, the Juggernaut), cash
for every kill and a shop between waves.

```bash
npm run dev:tower
```

Then open <http://127.0.0.1:5174/tower.html>.

```bash
npm run build:tower
```

This writes `last-lookout.html`, one self-contained file.

| Input | Action |
| --- | --- |
| Mouse | Look (the pointer is captured; Esc pauses) |
| Right mouse (hold) / E (toggle) | Scope in |
| Left click | Fire. Unscoped, the round goes roughly where the rifle points |
| Shift (scoped) | Hold your breath: the sway almost stops, until you run out of air |
| R | Reload |
| T | Next ammunition type (FMJ, hollow point, armour-piercing, explosive) |
| F | Focus: a few seconds of bullet time (the meter fills with kills, faster with head shots) |
| V | Thermal sight (an upgrade) |
| 1 – 4 | The rifles you own |
| Space | Skip a kill cam |
| Placing a defence | Click the ground under the crosshair; R turns barbed wire; Esc stops |

- **Animated until hit, a ragdoll after.** An unhurt zombie is animated. Motion-capture clips
  (CC0, Quaternius' *Universal Animation Library*) are retargeted offline onto the ragdoll's own
  17-segment skeleton and pose its bodies kinematically every step, out of the physics world.
  Bullets still hit the exact anatomy, because the ballistics ray-cast the posed segments.
  - **When it switches:** the moment a zombie is shot, blasted or trips on barbed wire, its bodies
    join the physics world with the clip's velocities, and the Euphoria-style controller and the
    injury model take over.
  - **If it recovers:** a zombie that regains its feet blends back into its clip. It limps on a
    bad leg and crawls on two. One lying on its back plays a get-up clip. The dead settle and are
    frozen out of the physics.
  - **Cost:** about 7 µs per animated zombie per frame, with at most about 10 physical ragdolls
    at a time.
- **Climbers** climb the fence and tip over it as real ragdolls, get up inside the compound and
  go up a tower leg. Shot off, they fall 15 m.
- **Specials:** screamers send the crowd running, and bloaters burst. Armoured zombies need
  armour-piercing rounds or a shot to the legs.
- **Ballistics:** a round is flown for real, with drag, gravity, wind and about a third of a
  second to 250 m, so you hold over and lead. When it reaches a person, everyone on its line wakes
  up as a ragdoll and the engine's ballistics resolve the penetration, so one .50 round can go
  through three of them.
- **Navigation:** one distance field over the 500 m valley toward the gates is computed at load,
  and every zombie walks downhill on it.
- **Defences:**
  - barbed wire that physically trips the walkers;
  - landmines;
  - fuel barrels to shoot, with chain reactions;
  - floodlights for the night waves;
  - a sentry gun at the gate.
- **Bullet cam:** long head shots, bosses, the last of a wave and rounds lined up through a crowd
  get the kill cam with the X-ray, as in the sandbox.
- **Look and sound:**
  - a low-resolution render with ordered dithering and quantised colour;
  - pixel textures and a pixel-font HUD;
  - a scope with a mil-dot reticle and a rangefinder;
  - all sound synthesised: rifles with valley echoes, impacts arriving after the speed-of-sound
    delay, the horde's murmur, an air-raid siren between waves, generative music.

Headless checks: `test/towerGame.test.js` (the game core), `test/towerAnim.test.js` (clips and
player), `test/towerUi.test.js` (HUD and shop logic) and `tools/bench/towerBalance.mjs` (a
simulated sniper plays the waves).

### HOLDOUT (`src/tower/holdout`)

Last Lookout's second mode, chosen from the title menu. You are on foot in the same valley:
endless, ever harder rounds of the dead, with points for every hit and kill. Points buy your way
through barricades into more of the valley, guns, a gamble on a supply crate, a gunsmith's
rebuild and field kits. You start under the tower with a pistol and 500 points.

| Input | Action |
| --- | --- |
| Mouse | Look (Esc pauses) |
| W A S D, Shift | Move, sprint |
| Space, C | Jump (and climb onto low things), crouch |
| Left mouse | Fire |
| Right mouse / E | Aim down the sights (the M24 has a scope) |
| R | Reload |
| 1 – 3, Q, wheel | Switch guns |
| F | Use or buy whatever the prompt shows |
| V | Kick (a stomp on someone lying in front) |
| G | Throw a grenade (two more each round, up to four) |

- **Rounds:** each round has more of the dead, tougher (16% more hit points a round, up to six times) and faster.
  Walkers soon jog and later sprint. Runners come from round 3, crawlers from round 5, bloaters
  from round 6, screamers from round 8 and armoured zombies from round 9. A Brute comes every
  seventh round, and a Juggernaut with it from round 21.
- **The dead:** they claw their way out of the ground near you and chase you down. Their
  attack clip's blow lands on its hit frame: about 30 damage at first, 60 later. Your health comes
  back after a few seconds out of reach.
  - **How they find you:** one distance field toward the player covers all the open ground. It
    is rebuilt a slice at a time as you move, so a few hundred zombies cost nothing extra to route.
    Within a few metres with a clear line, they come straight at you.
  - **Hits and kicks:** a hit wakes a zombie into a full ragdoll. The engine's ballistics and
    injury model decide the rest: head shots kill, and limbs break so a zombie limps or crawls.
    A kick knocks the dead over, as in the sandbox.
- **Points:** 10 a hit, 50 a kill, 50 more for a head shot, 100 for a kick or stomp kill.
- **Areas:** seven areas, opened through ten barricades (1000 – 2500 points each):
  - the Lookout, where you start;
  - the Farm, the Highway, the Corn, the Orchard and the River;
  - Hollow Creek, the burnt village.

  A barricade between two areas you have already opened comes down by itself. Each area adds
  new places where the dead rise.
- **Guns:** M9 pistol, .357 revolver, MP-5K SMG, M870 shotgun, AR-15 rifle and M24 sniper.
  - **Boards:** guns hang on boards around the valley. Buying a gun you already have refills it
    at half price.
  - **The supply crate** (950) gives a random gun. After a few rolls it moves somewhere else.
  - **The gunsmith's bench** in Hollow Creek (5000) rebuilds the gun in your hand. A rebuilt gun
    does 2.2× the damage, goes deeper through a crowd, fires faster and has a bigger magazine.
- **Field kits:**
  - **Kevlar:** 200 health.
  - **Quick Hands:** half-time reloads.
  - **Third Arm:** a third gun.
  - **Adrenaline:** longer sprints, faster healing.
- **Pickups** (dropped now and then by the dead):
  - **Ammo cache:** refills every gun and your grenades.
  - **Fury:** one-hit kills for 20 s.
  - **Bounty:** double points for 20 s.
  - **Shockwave:** a ring that drops every one of the dead on the map.

Headless checks: `test/holdout.test.js` (the chase, rounds, points, barricades, guns, the crate,
the bench, field kits, pickups, grenades, the player's bounds, cost per step).

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
| `corpse.mjs` | ragdoll quality after several kinds of deaths: joint-limit overshoot, floor and self interpenetration, time to rest, residual jitter |

## Project layout

```
src/physics   XPBD engine: math, bodies, shapes, collision, joints, world
src/human     anatomy, ragdoll, IK, motor controller, body sculpt + mesher, organs, injury model
src/game      sandbox (simulation orchestration), weapons, melee, throwables, obstacles, route
              planner, audio; survival mode: subway station and trains, flow field, waves
src/fps       first-person player, guns and melee moves, input
src/modes     runtimes hosted by main.js: survival mode, first-person sandbox, kill cam
src/tower     Last Lookout: game core (game/), animation (anim/), HUD and audio (ui/, audio/),
              effects (fx/), level (level/), renderer and looks (render/), the HOLDOUT mode
              (holdout/: areas, game core, chase field, props, HUD, front end), entry main.js
src/render    arena, skinned body, blood, floor decals, effects, view model, prop and obstacle
              meshes, walking markers; subway station, first-person hands, zombie gear
src/ui        interface and styles; survival HUD
test          physics, ragdoll, injury, walking, zombie, survival, melee and reaction tests
              (node --test)
tools         headless helpers (simulation runner, screenshot and filmstrip scripts)
```

## Notes

- Everything is generated procedurally at runtime: meshes, textures, sounds. There are no
  external assets.
- The sandbox and injury model take an injectable random source; the tests use a seeded one so
  their outcomes are reproducible.
