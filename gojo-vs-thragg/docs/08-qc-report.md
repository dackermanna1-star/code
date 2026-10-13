# 08 — Phase 9 Quality-Control Report

This report checks the package against the brief's Phase 9. It covers what
can be verified at this stage: research, rules, shot list, continuity
ledger, prompts, the timed animatic and temp audio. Items that can only be
judged on final rendered footage are listed separately under **Deferred to
final footage**.

## How it was checked

| Check | Method | Result |
|---|---|---|
| Canon research | 5 research lanes (255 claims), then an independent adversarial fact-checker per lane | 158 confirmed · 67 corrected · 0 refuted · 2 unverifiable; corrections applied (`01-research-dossier.md`) |
| Crossover logic | 3 competing designs scored by JJK-mechanics, Invincible-canon and director/brief judges | Contrarian design adopted with fixes (`02-crossover-rules.md`) |
| Shot list | 8 storyboard authors, then 3 critics (canon, continuity/space, brief/craft), then fixers | 34 issues found (3 blockers, 14 majors, 17 minors); all fixed |
| Timeline maths | `tools/validate.py` | 110 shots, contiguous, **5,760 frames = 240.000 s**, every sequence on its brief window, no vanished injuries: **OK** |
| Animatic staging | 8 animators, each with ≥2 contact-sheet QA passes; then a depth/scale audit of all 37 close two-shots | 3 scale errors found and fixed (S2-03, S6-11, S6-12) |
| Runtime of the rendered animatic | ffprobe frame count and duration | see §Runtime verification |

## Phase 9 checklist

### Character accuracy — PASS (with one logged deviation)
- **Gojo:**
  - Over 190 cm, white hair spiked up by the blindfold and loose once it
    comes down.
  - Blue Six Eyes and the black high-collar uniform.
  - Playful arrogance that turns serious (Seq 3), and the smile fading
    (Seq 4).
- **Thragg:**
  - About 198 cm and massive.
  - **Close-cropped black hair and black mustache (canon).** This is a
    logged deviation from the brief's "white hair"; sign-off needed.
  - White-and-crimson Grand Regent uniform; the cape is lost in Seq 3.
  - Calm, formal and economical; never a screaming brute.

### Ability accuracy — PASS
- **Infinity:**
  - Always deceleration with hanging shards.
  - Never a shield, a bounce or a contact flash.
  - Never breached by force.
- **Blue:** directional attraction; light debris moves first.
- **Red:** a directional cone that never moves its caster. A critic caught
  and fixed this in S4-16.
- **Purple:**
  - Charges in visible time (canon ch 233).
  - Its core never touches Thragg; it erases a clean channel.
- **Unlimited Void:**
  - One-hand sign, a canonical 2.0 s preset, information flood.
  - Touch exemption pauses the flood but doesn't erase it (fixed in S6-10).
- **Burnout:**
  - Begins exactly at the domain's end (fixed in S6-14).
  - No hover, teleport or Infinity during burnout.
- **RCT:**
  - Heals Gojo's collarbone and seals his stump.
  - Cannot heal his body while repairing the technique (canon ch 226).

### Power-system consistency — PASS
- **Two doors only.** Thragg gets past Infinity only through Gojo dropping
  it as bait (Seq 4) and burnout (Seq 7).
- **Labels.** Every creative call is labelled CREATIVE in
  `02-crossover-rules.md` and never asserted as canon on screen.
- **Thragg's limits.** No regeneration and no regrowth. His post-domain
  function is shown as degraded will, not recovery.

### Animation quality (animatic level) — PASS for staging and timing
- **Strikes.** Every strike has anticipation, contact and follow-through,
  keyed to the shot list's contact frames.
- **Scale.** Fighter scale is consistent within arm's-reach shots after the
  depth audit.
- **Screen direction.** Gojo is screen-left and Thragg screen-right
  throughout, except for the visibly motivated flips (S2-12/13, S2-15).

### Combat choreography — PASS
- **The tactical chain.** Every combat shot carries intent → read →
  outcome → learned (see the storyboard).
- **Thragg's investigation:**
  - angle, target, feint, mass, speed, attention, speed-keying;
  - blinding the eyes, then shockwave transmission;
  - bait, the "choice" line, the hostage leverage;
  - finally reading the burnout tell.
- **Gojo's adaptation:**
  - blindfold down;
  - Blue to clear the dust;
  - dropping Infinity as bait;
  - relocating to protect the city;
  - choosing the domain;
  - the "Shibuya" gamble;
  - the last-second repair.

### Effects quality (spec level) — PASS
- **Visual grammar.** Each technique has one grammar (`09-vfx-bible.md`),
  implemented once in `fx.py` and reused.
- **Impact tiers.** Light, heavy, massive and blocked hits each have their
  own look and sound.

### Audio — PASS (temp)
- **Music.** It evolves across the eight sequences, never as one loop.
- **Silences.** There are silences before the launch, under the Purple
  charge, at the domain sign, and on the final impact frame.
- **Sound timing.** SFX sit on contact frames.
- **Dialogue.** Six lines plus the technique call, all original. The score
  ducks under them.

### Editing — PASS
- **Runtime.** Exactly 5,760 frames.
- **Slow motion.** Used exactly once (Seq 7).
- **Time-scale handling.** Declared explicitly:
  - the domain is shown in perception time;
  - Seq 7's real-time map is set out in `02-crossover-rules.md` §7.

### Ending — PASS
- **Decisive.** Thragg dies of heart destruction, which defeats Viltrumite
  healing (#141).
- **Earned.** It is reached through the planted wound chain.
- **Counterfactual documented.**
- **Final image:** Gojo, one-armed, re-blindfolded in front of the untouched
  lit city; "Told you."
- **Cut.** To black at 04:00:00.

## Deferred to final footage (cannot be judged on an animatic)
- Final art quality and model consistency across generated clips. Use the
  review checklist in `07-generation-guide.md` §3.
- Anatomy and hands, lip-sync, and effects compositing fidelity.
- The final mix's loudness and dialogue intelligibility with the real VO.

## Logged deviations needing sign-off
1. Thragg's hair is canon black, not the brief's white.
2. The domain sign is one hand (canon), not "hands together".
3. A lit populated city has been added across the river. No people are
   shown.
4. Seq 7's final strike is a fist to the head. That matches the brief; his
   signature heart strike is used, and fails, in Seq 4.

## Runtime verification
_(filled in from the rendered animatic below)_
