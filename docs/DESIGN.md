# Gravelmouth design notes

How the game is put together and why it works the way it does.

## Architecture

The game is split into two layers:

- **Simulation** (`src/sim.js` and everything it imports from `world/`, `gameplay/`, `ai/` and
  `characters/character.js`). It doesn't depend on Babylon.js or the DOM, so it runs headless
  in Node for unit tests and benchmarks.
- **Presentation** (`src/game.js`, `render/`, `ui/`, `audio/`). It reads the simulation each
  frame and draws it. It owns the camera, HUD, menus, sound and the player's input.

The loop runs the simulation at a fixed 60 Hz, with at most 5 substeps per rendered frame, and
then draws once. Tests use `?manual` and `game.debugStep()`, which step the same loop by hand.
This makes them deterministic and independent of the frame rate.

Systems talk through an event bus: `hit`, `knockdown`, `ko`, `crime`, `paid`, `newDay`,
`parole` and so on. Audio, particles, toasts, the social model and the rules all subscribe to
the same events, so a punch that lands gets its sound, particles, witness memories and a guard
report without the combat code knowing about any of them.

## World

The layout (`world/layout.js`) is data: rooms, cells, openings, fences, furniture placements,
guard posts, patrol routes and spawns. From that data, `worldData.js` derives:

- wall edges on a 0.25 m lattice, merged into runs with a paint style on each side,
- colliders, plus a raycast the camera uses,
- a 0.5 m navigation grid with costs for being close to walls,
- doors whose access depends on who is passing and what time it is,
- furniture "spots": seats, beds, machines and workstations, each with a pose, an activity, an
  approach point and an optional job or staff-only flag.

## Characters

**Body.** Each character is one skinned mesh with 17 bones and at most 2 influences per vertex.
It's built from lofted parametric surfaces (torso, limbs, hands, shoes, head, hair). The
proportions come from `body.js`, driven by height, build and gender. Normals come from finite
differences. A 512×256 texture per character holds the painted face, the inmate number printed
on the back, and a white region for flat colours. Expressions, blinking and mouth shapes repaint
the face region.

**Animation.** The animator stacks these layers each frame:

1. A motion-capture locomotion blend (idle, walk, jog, run, sprint, backpedal, strafe left and
   right), weighted by speed and direction relative to facing. It is converted from the source
   right-handed space to Babylon's left-handed space by mirroring x.
2. Two-bone IK puts the feet on the ground and drops the hips when a foot can't reach. Hand
   targets handle guard stance and carrying.
3. FK layers (carry, then posture, then action) are blended per bone with slerp. There are 60
   hand-keyed clips, with events for `hit`, `release`, `rep` and `grab` that gameplay listens to.
4. An additive flinch spring for hit reactions, plus a lean into turns.
5. Exponential smoothing. The final local quaternions go to the rig.

Whole-body postures (sitting, lying, bench press) also rotate the pelvis, so the hips bone always
takes part in them. Seats put the pelvis at seat height.

## Combat

The combat started from *Last Stance*, which is a power fantasy. Its strikes did 12–24 damage,
it had instant finishers (999 damage, broken bones, launches), and its attacks could warp the
attacker up to 4 m onto a target picked from 6 m away. A prison fight should be scrappy, short
and risky, so the port keeps the feel and cuts the power:

| | Last Stance | Gravelmouth |
| --- | --- | --- |
| Damage per strike | 12–24, finishers 999 | 5–13 against about 100 HP (more with weapons) |
| Motion warp | up to 4 m | at most 0.75 m, so you have to close the distance |
| Finishers, bone breaks, launches | yes | none. Hard hits knock people down, and KOs end in the infirmary |
| Crowds | many enemies at once | at most 2 NPCs attack the player at the same time (attack tokens) |
| Consequences | none | guards, write-ups, lost conduct, solitary, grudges and witnesses |

What it keeps from Last Stance: picking the attack from the range band, combo chains (jab, cross,
hook, uppercut), short hitstop on impact, poise that builds toward a stagger or knockdown, a 120°
block arc that soaks 82% of damage until a heavy blow breaks the guard, dodges with invulnerable
frames, and a counter window flagged with ⚡ when a blow is about to land. Grabs beat blocks and
strikes beat grabs. In a grapple you can knee, headbutt, throw in the direction you steer, or
shove away. Mashing gets you out of a pin or up off the floor sooner. Held items swing with their
own reach, damage and breakage.

## Controls

The goal was controls that stay out of the way:

- **Movement** accelerates at 16 m/s² and decelerates at 22 m/s². Turning is fast (16 rad/s, and
  26 rad/s for a pivot when reversing), so a reversal doesn't orbit. The e2e tests reach
  4.15 m/s in 0.2 s and stop in 0.16 s.
- **Buffering.** A press counts if it arrives up to 0.28 s before the current action can take it,
  so combos and dodges chain without exact timing. Once a strike has landed, its recovery can be
  cancelled (into a dodge, for example). Slow actions like eating or reading can be cancelled at
  any time.
- **Targeting.** Interaction candidates are scored by distance and by angle from where you're
  heading or facing. The current pick only changes when a better one wins by a margin, so it
  doesn't flicker. Tab cycles through candidates. Talk prompts are hidden mid-fight so E never
  starts a chat during a brawl. If a target is a little out of reach, you walk up to it (up to
  3.2 m) before acting. Combat targeting is separate from interaction targeting and supports
  lock-on.
- **Dialogue** opens a side panel and frames the camera on both speakers. Replies take a number
  key, a click or a tap. Walking away for 0.35 s ends the conversation.
- **Camera.** A third-person orbit that collides with walls and stays under ceilings. With an
  analog stick pushed mostly forward, it drifts in behind you. Keys never turn it, because
  movement is camera-relative and a swinging camera would bend the path you're steering. It
  frames lock-on targets and conversations, and fades your character out when walls push it
  right up behind you.
- **Facing.** Talking, picking things up and fighting can override which way a character faces.
  An override that isn't refreshed every tick is dropped as soon as the character walks off on
  its own, so nobody stays turned one way while running another.
- **Devices.** Keyboard and mouse, gamepad (standard mapping) and touch all feed the same
  actions. When pointer lock is refused, dragging with the right mouse button turns the camera,
  and heavy attacks move to K.

## AI

Each NPC has a `Brain`. Its planner chooses goals from the schedule, needs, job, crew and
grudges. Goals include using a spot (a seat, bed, machine or workstation), hanging around a
room, chatting, hassling someone, mopping a round, patrolling and manning a post. The brain
itself handles following, fighting and answering a guard dispatch. Pathing is
A* on the 0.5 m grid with a binary heap and an octile heuristic. It checks doors per agent and
smooths paths by line of sight. The simulation caps the number of path searches per step and
backs off from targets that recently failed. Local avoidance, separation and a stuck check keep
crowds moving. The crowd e2e scenario counts NPCs that have a goal but haven't moved, and
expects about none.

The simulation sometimes moves someone instantly: rescuing a stuck NPC, sweeping stragglers
into cells at lock-up, finishing an escort, or releasing someone from solitary. Each of these
first asks the presentation layer whether the player could see either end of the jump. That
check uses the camera's view cone and line of sight from the camera and the player. If either
end might be on screen, the move waits. A stuck NPC only ever hops one waypoint. When the player
is moved (arrest, waking in the infirmary), the screen cuts to black and fades back in.

Guards see in a vision cone and hear fights within about 10 m when there's line of sight. When a
guard catches a crime, they warn first. Anyone still attacking 0.6 s after the warning gets
subdued. A crime adds heat, a fine, extra days or solitary. When the player is arrested, a
dialogue offers four options: go quietly, slip the guard some ramen (if you have enough), talk
your way out (a smarts check), or resist. Arrested NPCs are cuffed and walked to their cell or
the Hole, with the guard a pace behind. They are placed there once they arrive or once the
player can no longer see them.

## Prison day

| Time | Period | Where |
| --- | --- | --- |
| 06:00 | Wake-up | cells open |
| 06:30 | Breakfast | mess hall |
| 07:30 | Work detail | assigned job |
| 11:30 | Lunch | mess hall |
| 12:30 | Yard time | yard gate open |
| 16:00 | Free time | showers, gym, library |
| 17:30 | Dinner | mess hall |
| 18:30 | Evening rec | rec room, gym, library |
| 21:00 | Lock-up | back to your cell, doors lock at 21:30 |
| 22:00 | Lights out | sleep |

By default one real second is 1.5 game minutes. Options offer 1 or 3 instead. Sleeping runs time
30× faster. Hunger and energy drain over the day, and meals and sleep refill them.

## Rendering and audio

- The world mesh is batched by material into 32 m regions, so frustum culling still works.
- Lighting is a hemisphere light plus a key light with PCF shadows (2048 on high, 1024 on
  medium), sky and fog, glow, and a light post-processing pipeline. Low quality turns off
  shadows and post-processing, and is the default on touch devices. Indoor light follows the
  time of day, with a dim blue at lights-out.
- Particles: hit sparks, sweat, block flashes, dust and debris from broken items, plus KO stars.
- Audio uses WebAudio with distance attenuation and stereo panning. Impacts, whooshes, grunts and
  footsteps are samples (footsteps are timed from the gait phase). Bells, doors, whistles,
  voice blips and a generative music bed are synthesized.

## Testing

- `npm test` runs unit tests on the world data:
  - the layout compiles
  - every spot's approach point is walkable
  - inmates can reach public areas from their cells
  - the yard gate stops inmates but not staff when it's closed
  - staff areas are off-limits to inmates
  - a locked cell door keeps its inmate in
  - room lookup works
  - cutting the fence opens a route out
- `npm run e2e` runs 17 Playwright scenarios against the real game. Latest results:
  - movement reaches 4.15 m/s in 0.2 s and stops in 0.16 s
  - a reversal turns around within 0.25 s
  - walls stop the player without tunnelling
  - the right item is picked from a cluster, and Tab cycles targets
  - E talks to the person in front, not the one beside them
  - after a conversation, the character faces the way it moves
  - holding a direction key runs straight, and the camera doesn't swing
  - every character whose body is in view is drawn
  - an arrested inmate walks off cuffed and is never teleported on screen
  - in a fight, a combo lands, a guard steps in and the arrest adds a day
  - a meal raises hunger from 30 to 47
  - sleeping wakes the player at 06:04 the next day
  - a KO wakes the player in the infirmary
  - save and load restore the game
  - the crowd scenario finds no stuck NPCs
  - a simulation step takes about 1.6 ms with 41 characters
- `npm run e2e:dist` boots the bundled build on a desktop and on emulated phones in both
  orientations. It checks for console errors and horizontal overflow, real mouse clicks, the
  drag-to-look fallback when mouse capture is refused, the touch stick, the action buttons and
  the touch dialogue flow.
- `node tests/bench_sim.mjs` runs headless and does two things. It times the simulation, then
  plays through most of a day at triple speed. For each period it reports which rooms the
  inmates are in, and at the end it counts events and crimes. This shows whether the routine
  holds together.

## Known limitations

- Rendering speed was only measured in a headless browser that rasterizes on the CPU. Real GPUs
  should be far faster, but no frame-rate numbers from real devices are recorded yet.
- NPC chat lines are templated, and voices are synthesized blips, not recorded lines.
- There is one escape route: cut the fence with bolt cutters and run.
- Saves are stored in the browser's localStorage, so they stay on that device and in that browser.
