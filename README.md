# GODLINE — Endless Duels of the Divine

A cinematic, endlessly replayable 2D combat simulation. Two godlike stick-figure warriors, each run by
its own tactical AI, fight a fully simulated duel that the game then films like a hand-animated
viral fight video. Hit-stop, impact frames, shockwaves, smears, slow motion, blade locks, beam
struggles, speed-blitzes, transformations, last stands and context-chosen finishers all come out
of the simulated fight. Nothing is scripted ahead of time, and every battle ends with exactly one winner.

```bash
npm install
npm run dev          # http://localhost:5173
```

```bash
npm run build        # production build → dist/
npm run build:single # one self-contained HTML file → dist-single/index.html
npm test             # determinism, exactly-one-winner, termination and fairness tests
npm run balance      # Monte Carlo balance report (e.g. `npm run balance -- 2000`)
npm run fight        # one headless battle with a play-by-play (`npm run fight -- 7F3A91C2 -v`)
```

Click **BEGIN** (browsers need that click before they will play audio) and watch. With auto-continue
on (the default), a new battle starts after the results screen, so it plays indefinitely.

| Key | Action | Key | Action |
|---|---|---|---|
| Space | Pause / resume | H | Toggle HUD |
| N | Next battle | L | Toggle narration feed |
| R | Replay this battle (identical) | F | Fullscreen |
| 1 / 2 / 3 | Speed ½× / 1× / 2× | M | Mute |

Every battle has a seed (shown in the HUD and control bar). A battle replays exactly when you open it
with `#seed=XXXX-XXXX` in the URL or type the seed into the control bar. **Rematch** keeps both gods
and rolls a new arena and a new random stream.

---

## What makes each fight different

**Fighters** are generated procedurally:
- **Name and title**
- **Divine Aspect.** 7 options, each with its own colour, passive, VFX and SFX timbre: Inferno burns, Radiance mends, Verdant
  heals on hit, Frost chills, Tempest is fast, Void teleports cheaply, and Chrono has precognition.
- **Weapon.** 7 options with real frame data: katana, greatsword, spear, twin daggers, scythe, gauntlets, war staff.
- **Personality.** 6 options that shape the AI: Berserker, Duelist, Trickster, Tactician, Sentinel, Zealot.
- **Five abilities,** one per slot, drawn from a pool of 31:
  - **Mobility:** Phantom Step, Flash Cut, Void Gate, Gale Ascent, Mirage.
  - **Ranged:** Barrage, Crescent Wave, Seeker Wisps, Starfall, Thunder Judgment, Spike Eruption, Gravity Orb.
  - **Special:** Annihilation Beam, Binding Chains, Dimension Rend, Titan Slam, Blade Storm, Chrono Stop.
  - **Defense:** Aegis Dome, Mirror Ward, Iai Counter, Phase Shift, Chrono Rewind, Second Wind.
  - **Ultimate:** Ascension, Thousand Cuts, Supernova, Heaven's Lance, Event Horizon, Colossus Reaver, Cataclysm.
- **Visual identity:** accessory (scarf, cape, ponytail, long hair, headband, halo or horns) and stance.

**Arenas.** There are 7 themes: Shattered Sanctum, Stormcrown Peak, Hollow Nexus, Caldera of Ash, Frostveil Citadel,
Celestial Steps and Moonlit Bamboo Vale.
- Each has destructible props in mirror-symmetric layouts, its own weather and its own environmental hazards.
- The floor keeps craters, cracks and scorch marks for the rest of the battle.
- Fights escalate through phases: **Opening → Escalation → Climax → Divine Collapse → Judgment**. Damage, wrath gain
  and hazards ramp up in the late phases.
- If time runs out, a **Final Clash** decides the fight.

**Interconnected systems:**
- Light chains, overheads and lows, launchers, juggles, wall and ground bounces, and throws.
- Feints, charged and delayed attacks, blocks, timed parries (perfect parries), dodges, rolls and teleports.
- Combo bursts, super armor, counter-hits, whiff punishes, and guard (posture) breaks.
- Projectiles can clash with each other or be cut by blades. Beams meet and struggle; mirrors reflect; shields absorb.
- Black holes pull fighters and projectiles in.
- Elemental flourishes, plus Wrath (ultimates) and a once-per-fight **Last Stand**.

**Emergent cinematic sequences.** These come out of fight events and are resolved by the simulation, with AI inputs
and seeded randomness deciding the outcome:
- **Blade lock:** push, hold or slip; a slip can punish a shove.
- **Beam struggle:** overwhelm, mutual detonation, or a risky vanish-escape.
- **Clash-of-gods speed blitz:** teleport exchanges across the sky that end in a decisive blow.
- **Grabs,** with throw breaks.
- **Iai counters.**
- **Thousand Cuts.**
- **Transformation.**
- **Last Stand.**
- **Final Clash.**
- **18 finishers.** Each is picked from context: how the lethal blow landed, the victor's weapon, aspect and abilities,
  and whether the fight was near a wall or prop. Each has internal variations, and there are 7 death-dissolve styles
  and per-personality victory poses.

## Tactical AI (`src/ai`)

Each god has its own brain with its own random stream:

1. **Perception with reaction delay.** A brain reasons from snapshots of the past, and attacks faster than its
   reflexes must be *anticipated*, not reacted to. That is what makes reads, feints and mix-ups meaningful.
2. **Threat analysis.**
   - It recognises incoming melee by height, throws, projectiles (by first-contact ETA, homing included), beams, beam
     charges, time-stop wind-ups and telegraphed zones.
   - It answers with a scored choice: block (correct height), timed parry, roll or dodge, backdash, interrupt with a
     faster move, meet the strike for a clash, jump, vanish, run out of a zone, cut a projectile in half, counter-fire,
     or answer a beam with its own beam.
3. **Opportunity.** It finds whiff punishes, stagger and guard-break punishes, okizeme (meaty attacks timed to a
   wake-up) and set-ups on a knocked-down foe.
4. **Opponent model.** Decayed habit statistics, so recent behaviour weighs more. It tracks:
   - how the foe defends (block, parry, dodge, jump, mash, vanish)
   - block height
   - where they reappear after a teleport (enabling **teleport reads**)
   - wake-up options, openers, throw tendencies, feint rate and blade-lock pushing
   - a bigram predictor of their next action
5. **Plans.** Probe, rushdown, zone, bait, fortress, gather power, ambush, regroup, hunt for the ultimate, corner.
   - Each plan is scored by utility: personality traits, the situation, the opponent model, and **learned rewards**
     from how well each plan has worked so far this fight.
   - The choice is made by softmax: unpredictable, but coherent.
   - Plans commit for a while (hysteresis) and announce their reasoning in the narration ("adapts to the parries",
     "done eating projectiles", ...).
6. **Execution.**
   - Spacing with footsie "dances" and tempo between exchanges.
   - Attacks are chosen by expected value: hit chance from the model, reactability, risk of punishment, and mix-up
     value against a blocking foe.
   - Feints against reactive defenders, delayed strikes against early parries.
   - Hit-confirmed combo routing that predicts knockback, with an occasional dropped link depending on precision.
   - Per-ability tactical knowledge (`abilityAI.ts`).

## Presentation (`src/present`, `src/render`, `src/audio`, `src/ui`)

- **Director:** turns the event stream into presentation:
  - camera framing and dramatic focus with dutch tilts
  - hit-stop and slow-motion ramps
  - anime **impact frames**, screen-space **shockwaves**, chromatic aberration and colour grading
  - letterboxing for cinematic moments
  - procedural SFX and an **adaptive soundtrack** that follows the battle's tension
  - callouts, ultimate cut-ins, struggle meters, finisher title cards
  - a generated **narration feed**, plus a results screen with a win-probability chart and the key moments
- **Animation:** phase-aligned keyframe clips (strikes land exactly on the simulation's active frames). They are
  blended with procedural locomotion, hit-reaction springs, tumbling, breathing, foot planting, two-handed grip IK, and
  verlet scarves, capes and hair. The renderer adds smear arcs, afterimages, rim glow and glowing eyes with motion trails.
- **Rendering:** Canvas2D scene, then a **WebGL2 post-process** (bloom, shockwaves, radial and motion blur, impact
  frames, grading, vignette, grain, letterbox), with a Canvas2D fallback. Internal resolution adapts to keep the frame
  rate up.
- **Audio:** everything is synthesized live with WebAudio, so there are no sample files. That covers 74 SFX, 10 loops,
  and a seeded, layered procedural score with stingers.

## Fairness: exactly 50/50 before the fight

- **Exchangeable generation.** Both fighters are drawn independently from the *same* distribution. Any pair
  constraint (distinct colours and names) is applied by symmetric rejection of the whole pair, and which side each god
  starts on is an independent coin flip. The two fighters are therefore exchangeable, so
  **P(A wins) = P(B wins) = ½ exactly**, before the fight begins, for any simulation details.
- **Symmetric simulation.**
  - Both AIs decide from the same snapshot, and every contact in a tick is gathered first and then resolved.
  - Processing order is randomised every tick.
  - Arenas are mirror-symmetric, and hazards target a fighter chosen by coin flip.
  - Simultaneous knockouts go to a Final Clash, never a draw.
- **Balance.** `npm run balance` plays thousands of headless battles and reports win rates by starting side, fighter
  index, weapon, aspect, personality and every ability, flagging anything more than 6% from even. From a 2,400-battle
  sample:
  - side and index win rates are within the ±2% noise band
  - nearly every weapon, aspect, personality and ability sits within about ±6% of 50%
  - median fight length is about 53 s, and roughly a quarter of fights are comebacks (the winner dropped below 25% win
    probability)
- **Tests.** `npm test` checks:
  - determinism (same seed, same battle)
  - every battle ending with exactly one living winner
  - forced simultaneous KOs being resolved by a Final Clash
  - the time limit forcing an ending
  - no side or index bias (statistical, fixed seeds)
  - generation being exchangeable across slots
- **Live win probability.** The broadcast bar uses an antisymmetric logistic model fitted on headless battles: features
  are (A − B) with no bias term, so it reads exactly 50/50 at the start.

## Project layout

```
src/core      RNG (seeded sfc32), math, shared ids/palettes
src/sim       deterministic 60 Hz simulation: fighters, weapons, abilities, combat, entities,
              sequences, finishers, arena, generation, win probability
src/ai        perception, opponent model, ability tactics, brain
src/present   director (camera/time/FX/audio orchestration), narrator
src/render    camera, fighter animation + renderer, VFX/particles, arena renderer, WebGL post-FX
src/audio     procedural SFX, loops and adaptive music
src/ui        HUD, title/versus/results screens, controls
src/game      game shell (lifecycle, loop, render pipeline) and headless battle runner
tools         balance harness, single-fight runner
tests         simulation guarantees
```

The simulation never reads presentation state. A battle can be run headlessly in about 20 ms, which is how the
balance and fairness numbers above were produced.
