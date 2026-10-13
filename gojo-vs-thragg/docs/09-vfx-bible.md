# 09 — VFX Bible

Every signature effect has one visual grammar, used identically in every shot.
The animatic implements each one (`tools/animatic/fx.py`) so the timing and
read of every effect can be judged before any final animation is made.

The rule behind all of them is that **an effect must show a mechanism, not
just a colour.** The audience should be able to tell what each technique
does to space, matter and momentum with the sound off.

---

## 1. Infinity (Limitless, neutral state)

**What it is:** the distance between Gojo and anything approaching is divided
without end, so the object keeps slowing and never arrives (JJK ch 14; 69;
75). It is **not a wall, a bubble or a force field**, and it does not absorb
energy or "block" anything.

| Do | Never |
|---|---|
| Show the approach **decelerating**: a fist covers 80% of the gap in 2 frames, then 15% more in 6, then visibly crawls, then hangs | A fist hitting an invisible surface and bouncing off |
| Fine dust, grit and glass **suspended** in the last few centimetres, jittering microscopically (time is not stopped — they just never get closer) | A glowing sphere, hexagon panels, a "shield hit" flash |
| Faint **refraction**: the background seen through the gap bends a little, like heat over glass, and only while something is approaching | Constant visible aura when nothing is near him |
| The attacker's arm **compresses** a little (shoulder bunches, elbow bends) because their body keeps moving while the fist cannot | Impact shockwave **at Gojo's skin** |
| Shockwaves and debris that miss him **flow around** the region and wreck the environment behind him | Gojo's clothes or hair reacting to the impact |

**Dust as a continuity tool.** Throughout the film, drifting dust never lands
on Gojo: it parts and hangs around him. Seq 7 depends on this. When his
technique is burnt out after the domain, dust settles on his shoulders and
hair for the first time. That is how Thragg (and the audience) can see that
Infinity is gone. Keep this rule exact in every shot from Seq 1 on.

**Sound:** a pressure swell that stalls instead of landing, then a thin,
glassy high ring that hangs (`infinity_stop`). There is never a "thud".

---

## 2. Blue (Lapse: Blue, attraction)

**What it is:** space converges on a point and matter around it is pulled in
(ch 69, 71). At maximum output the pull is black-hole-like and can wreck
buildings. Gojo also uses it to pull himself across short distances (ch 84).

- **A clear focal point:** a small white-blue core, a ring of darkened space
  (lensing), and a thin bright ring on its edge. The background pinches
  toward it.
- **Directional pull:** streaks flow inward and accelerate as they near the
  core. **Light objects move first**: dust, then glass, then concrete chunks,
  then cars, each later and slower (`fx.pull(mass=…)`). Objects travel along
  straight lines toward the point, not in a random swirl.
- **Deformation:** lamp posts bend toward it, cars slide and tip, asphalt
  peels in the pull direction.
- **When it collapses:** the debris that has gathered compacts into a dense
  ball, then drops or is thrown.
- **Sound:** a rising suck plus a low throb (`blue`).

## 3. Red (Reversal: Red, repulsion)

**What it is:** Gojo feeds Limitless positive energy from Reverse Cursed
Technique, so space diverges violently. It has at least twice Blue's output
(ch 74, 84).

- **Origin:** a tight crimson point at Gojo's fingertip that **jitters** for
  2–6 frames.
- **Release:** a hard **directional** cone of crimson-white light. A pressure
  ring travels with the front, and debris is blown along the axis. It is not
  an omnidirectional fireball.
- **Consequence:** whatever it hits is thrown along the axis, punching through
  facades in a straight line, and leaves a clean wide shot of the path.
- **Sound:** a sharp transient, then crunch, then sub drop, then a long tail
  (`red_charge`, then `red_release`).

## 4. Hollow Purple (Imaginary Technique: Purple)

**What it is:** Blue and Red collide to make "imaginary mass" that surges
forward and wipes out what it hits (ch 52, 75, 223). It can be survived:
Hanami at Kyoto, and Sukuna twice, with reinforced arms. It erased a large part of
Toji's torso.

- **Preparation is two distinct techniques first.** A blue orb sits on one
  hand and a red orb on the other, each with its own behaviour (pull vs
  jitter). Tension arcs crackle between them. The sky darkens around the
  focal point, loose debris vibrates, and light bends.
- **Fusion:** the orbs converge, and for 2 frames there is a white-out at the
  meeting point. Then a large sphere: violet corona, bright shell, a darker
  *hollow* interior with slow swirls, and a hot rim.
- **Trajectory:** a clean, readable line. The camera shows origin, path and
  impact in that order.
- **Effect on matter:** buildings in the path are **erased** in a
  clean-edged channel, not exploded. Rubble at the edges is pulled into the
  wake, and a violet afterglow lines the cut edges for a few seconds.
- **The graze (Seq 5):** Thragg is not in the path's centre. The edge of the
  sphere takes a scooped, cauterised gouge out of his left shoulder and upper
  arm and burns away that side of his uniform. No claim is made about what a
  direct hit would do until Seq 7 shows it.
- **Never:** a beam or laser, or a generic purple explosion.
- **Sound:** two tones beating and converging, with crackle that builds
  (`purple_charge`), then a sub drop and tearing (`purple_release`).

## 5. Unlimited Void (Domain Expansion)

**What it is:** a barrier domain. Its sure-hit puts the target "inside the
Limitless" and floods perception with endless information until they cannot
think or move (ch 15). It does not affect Gojo or anyone in physical contact
with him. When it ends, Gojo's technique **burns out** (ch 226).

- **Hand sign:** right hand raised, middle finger crossed over the index
  finger (ch 15).
- **Transition:** sound cuts out entirely for 6–8 frames, then a black sphere
  swallows the frame from the sign outward. The rim of the sphere carries a
  thin line of blue light.
- **Interior:** a boundless starfield with impossible depth. There are rings
  receding to a vanishing point, a slow galactic spiral, and **streams of
  luminous "information" rushing outward far too fast to read**. It should
  feel beautiful, alien and unsettling. It must not look like a glowing arena
  or a grid floor.
- **On Thragg:** pupils flood with light streaks. His micro-expressions
  freeze half-formed and he holds the rigid stillness of total overload.
  Shoot it in tight close-ups.
- **Exterior (cutaways):** a perfectly black dome sitting silently in the
  intersection while wind and dust move around it.
- **Sound:** a snap, then total silence, then a crystalline shimmer swelling,
  with an information "tick" bed underneath (`domain_open`, `domain_bed`). It
  ends with a reversed shatter (`domain_close`).

## 6. Viltrumite physical power (Thragg)

The impact scale is **tiered** so the largest moments keep their weight.

| Tier | Example | Visual signature | Sound |
|---|---|---|---|
| light | a probing jab | small white star, 6 streaks, no camera shake | `punch_light` |
| heavy | full punch into a wall | star + 2 rings + debris spray, 4–6 frames of shake | `punch_heavy` |
| massive | building-cracking blow, tower collapse | huge ring, dust ring hugging the ground, flash, structural failure | `impact_massive` / `building_collapse` |
| blocked | any blow that meets Infinity | **no contact flash**; compressed-air ripple ahead of the fist; streaks stall | `infinity_stop` |

**Acceleration:**
- Anticipation is one compressed frame (knees, shoulders).
- Then a vapour cone and boom ring at launch (`sonic_boom`), where the speed
  justifies it.
- The pavement deforms behind him, and windows along the flight path burst
  outward in sequence.

**Flight:**
- Clouds tear open along the path, and debris is displaced in the wake.
- Changes of direction show a hard "plant" on the air: the body rotates
  first, then the trajectory follows.

## 7. Domain burnout (Seq 7)

Gojo is in burnout, so there is no Limitless: no Infinity, no Blue or Red, and
no teleport.

- **Signature:** the absence of every Infinity cue. Dust lands on him, his
  hair and coat move in the wind for the first time, and his footsteps puff
  dust.
- **Restoring the technique:** Gojo repairs the burnt-out part of his brain
  with Reverse Cursed Technique (ch 226). We see the cost: blood running from
  his nose and the corner of one eye. Then the first suspended particle stops
  in mid-air. That is the cue that Infinity is back.

## 8. Reverse Cursed Technique

RCT is shown as a soft, warm-white shimmer at the site of the injury. The
tissue knits from the inside out over 12–20 frames. There is no green glow
and no sparkles.

## 9. Environment and continuity of destruction

Damage is cumulative and never resets. The flags below match
`tools/animatic/env.py`.

| From | Damage |
|---|---|
| Seq 1 | landing crater + radial cracks at the intersection centre; shattered glass on the surrounding facades |
| Seq 2 | traffic-light mast arm bent by shockwaves flowing around Infinity; ring of cracked asphalt behind Gojo |
| Seq 3 | dragged cars and gouges toward Blue's point; a straight line of punched-through facades in the west block (Red) |
| Seq 4 | wrecked rooftops; the unfinished tower snapped at mid-height and collapsed; smoke columns begin |
| Seq 5 | Hollow Purple's clean channel through the west skyline (mid layers), violet afterglow fading over 3 s |
| Seq 7–8 | the final crater at the intersection |
