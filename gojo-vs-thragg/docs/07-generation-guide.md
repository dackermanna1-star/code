# 07 — Generation & Assembly Guide

How to turn this package into the finished 240-second film using any
shot-based video model or a traditional animation pipeline. No current
generator can render a coherent four-minute fight in one pass, so the brief's
Phase 7 fallback applies. Generate **sequential, timestamped shots** from
locked references, then conform them into one continuous edit. Everything
here is set up for that.

## 0. What you have

| File | Role |
|---|---|
| `data/shotlist.json` | **Single source of truth.** Every shot with exact frame count, camera, action, tactics, VFX, SFX, music, dialogue and end-state continuity |
| `data/bible.json` | Locked prompt blocks: style, lighting, characters, locations, injuries, negative prompt |
| `prompts/shot_prompts.md` · `prompts/shots.jsonl` | A complete composed prompt per shot (built from the two files above) |
| `docs/04-storyboard.md` | Human-readable boards with timecodes |
| `docs/05-continuity-sheet.md` | State of both fighters and the city at every cut |
| `docs/06b-cue-sheet.md` | Frame-accurate SFX / music / dialogue cues |
| `animatic/gojo_vs_thragg_animatic.mp4` | Timed 240 s animatic with temp sound: the editorial reference |
| `tools/assemble.py` | Conforms generated clips to exact frame counts and builds the master |
| `tools/validate.py` | Fails if timing, contiguity, cue names or injury continuity break |

## 1. Lock references before generating anything

1. **Character turnarounds.** Make a front / ¾ / side / back sheet for each
   fighter from the text in `docs/03-character-bible.md`, plus expression
   sheets:
   - Gojo: smirk, amused, focused, serious, strain; blindfold on, lifted,
     and around the neck.
   - Thragg: contempt, analytical, faint smile, fury, dazed, resolve.

   Approve these once. **Every shot uses the same images** as identity
   references (image-to-video or reference conditioning).
2. **Injury state sheets.** Make one sheet per state in the continuity ledger:
   - Thragg after Seq 3
   - Thragg after Seq 5 (Purple graze)
   - Thragg after Seq 6
   - Gojo after Seq 5
   - Gojo in Seq 7
3. **Environment plates.** These are wide paintings, reused as backgrounds
   and as first-frame conditioning:
   - the intersection at each damage state (see the table in 09-vfx-bible)
   - the west block
   - rooftops
   - the tower, intact and collapsed
   - the sky above the skyline, before and after the Purple scar
   - the domain interior
4. **Effect reference loops.** Make one approved loop each of Infinity,
   Blue, Red, Purple and the domain, matching `docs/09-vfx-bible.md`. Reuse
   them as references so the effects never drift.

## 2. Generate shot by shot

- Use `prompts/shots.jsonl`. Each line has `id`, `frames`, `seconds`,
  `prompt` and `negative_prompt`. Generate at 24 fps for **at least** the
  stated duration; a few extra frames of handle at each end is ideal.
- **Chain continuity.** Use the approved last frame of shot *N* as the
  first-frame conditioning for shot *N+1* whenever they share a setup. The
  `END FRAME:` line in each prompt states where the characters must finish.
- **Prefer image-to-video** from a storyboard frame (from the animatic or a
  painted key) over pure text-to-video for every action shot. The animatic
  frame fixes composition, screen direction and spacing.
- **Long or complex shots:** generate in overlapping halves and cut on
  motion.
- **Dialogue shots:** generate a clean plate, then lip-sync to the recorded
  line (record the VO first, at the timecodes in the cue sheet).
- **Name outputs by shot id:** `clips/S3-04.mp4`.

## 3. Review every clip against the checklist (repair, don't accept)

Reject and regenerate a clip if any of the following is true:

- **Character model:** hair, uniform, mustache, height ratio or eye covering
  differs from the approved sheets.
- **Injury state:** an injury is missing, added, or on the wrong side
  (check `docs/05-continuity-sheet.md`).
- **Screen direction:** violated. Thragg begins west (screen-left) of Gojo;
  the sun rim light is always from screen-left.
- **Infinity reads wrong:** it shows as a wall, a bubble or a flash. It must
  read as deceleration with suspended particles.
- **Anatomy:** broken hands or extra fingers. Inpaint or regenerate.
- **Motion:** characters slide, float without cause, or pop position.
- **Timing:** the impact frame doesn't land on the SFX frame in the cue
  sheet. Retime it in the edit only if the action allows it.

## 4. Assemble the master

```bash
# temp mix (or the final stems mix) must be exactly 240 s
python3 tools/assemble.py --clips clips/ --audio final_mix.wav \
    --fallback animatic/gojo_vs_thragg_animatic.mp4 --res 3840x2160 \
    --out master/gojo_vs_thragg_master.mp4
```

`assemble.py` does the following:

1. **Resamples and fills the frame.** Each clip goes to 24 fps, then is
   scaled and centre-cropped to fill 3840×2160 (never stretched or
   letterboxed).
2. **Cuts to exact length.** Each clip is cut to **exactly** its frame
   count. If a clip is short, it holds the last frame and flags the shot in
   the conform report, so you can regenerate it.
3. **Fills gaps.** Any missing shot is filled from the animatic at the same
   timecode, so the timeline never drifts.
4. **Verifies.** It concatenates everything, muxes the audio trimmed or
   padded to 240 s, and checks the master: **5760 frames, 240.000 s**.
5. **Writes outputs.** A CMX3600 EDL (`master.edl`) for finishing in an NLE,
   and a conform report.

## 5. Sound

1. **Record dialogue first.** It is four lines of original dialogue (plus the
   optional final one), sitting at the cue-sheet timecodes.
2. **Score.** Spot the score to `docs/06-sound-design.md`. The temp score in
   the animatic marks every intensity change, drop-out and hit.
3. **SFX.** Replace each temp SFX one-for-one. The cue names in
   `docs/06b-cue-sheet.md` are a spotting list.
4. **Mix.**
   - Dialogue stays above everything.
   - The final impact drops the score to silence (the cue sheet marks the
     frame).
   - Print the mix at exactly 240.000 s.

## 6. Final QC

Run `python3 tools/validate.py`, then the Phase 9 checklist in
`docs/08-qc-report.md`, against the assembled master.

## Using a traditional (non-AI) pipeline

The same files work as a normal production package:

| File | Use |
|---|---|
| `docs/04-storyboard.md` + the animatic | Layout and timing |
| `docs/03-character-bible.md` | Model sheets |
| `docs/09-vfx-bible.md` | Effects animation |
| `docs/05-continuity-sheet.md` | Scene checking |
| `master.edl` | The online conform |
