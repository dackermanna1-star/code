# THE STRONGEST SORCERER VS. THE KING OF VILTRUMITES
### Satoru Gojo vs. Grand Regent Thragg — complete production package for a 240-second anime battle

A non-commercial fan production plan. Jujutsu Kaisen © Gege Akutami / Shueisha / MAPPA;
Invincible © Robert Kirkman, Cory Walker & Ryan Ottley / Image Comics / Skybound / Amazon MGM Studios.
All dialogue is original.

> **What this is, and what it isn't.** This package does **not** contain final 4K
> anime footage. No video-generation model was available in the environment it was
> made in. It contains everything needed to produce the film either way, through a
> shot-based video generator or a traditional animation pipeline:
>
> - canon research
> - binding crossover rules
> - a frame-exact 240-second shot list
> - a continuity ledger
> - per-shot generator prompts composed from locked references
> - sound and VFX bibles
> - an assembly tool that conforms clips into an exactly-240.000-second master
> - a fully timed **240-second animatic with temp sound**, the editorial reference
>
> **Verified:** 110 shots · 5,760 frames · 24 fps · **240.000 s** video and audio
> (ffprobe-counted, 0 render errors). See `docs/08-qc-report.md`.

## Contents

| Path | What |
|---|---|
| `docs/00-overview.md` | One-page summary of the fight, its logic and the outcome |
| `docs/01-research-dossier.md` | Phase 1 research: canon claims with chapter / episode / issue citations, adversarially fact-checked |
| `docs/02-crossover-rules.md` | How Limitless, Six Eyes, Unlimited Void and burnout interact with a Viltrumite. Every ruling labelled CANON / INFERENCE / CREATIVE |
| `docs/03-character-bible.md` | Model sheets, behaviour, expression sheets |
| `docs/04-storyboard.md` | **Generated.** Shot-by-shot boards with exact timecodes |
| `docs/05-continuity-sheet.md` | **Generated.** Both fighters + city state at every cut |
| `docs/06-sound-design.md` · `06b-cue-sheet.md` | Score and SFX design · **generated** frame-accurate cue sheet |
| `docs/07-generation-guide.md` | How to generate, review and assemble the film |
| `docs/08-qc-report.md` | Phase 9 quality-control pass |
| `docs/09-vfx-bible.md` | Visual grammar of Infinity, Blue, Red, Hollow Purple, Unlimited Void, impacts |
| `docs/brief.md` | The original brief |
| `data/shotlist.json` | **Single source of truth**: every shot, frame-exact |
| `data/beats.json` | Approved beat sheet + boundary states per sequence |
| `data/bible.json` | Locked prompt blocks (style, lighting, characters, locations, injuries, negative prompt) |
| `prompts/shot_prompts.md` · `prompts/shots.jsonl` | **Generated.** One complete generator prompt per shot |
| `animatic/gojo_vs_thragg_animatic.mp4` | The timed 240-second animatic (1920×1080, 24 fps) with temp score and SFX |
| `tools/validate.py` | Fails on any timing, contiguity, cue or continuity error |
| `tools/build_docs.py` | Regenerates the storyboard, continuity sheet, cue sheet and prompts |
| `tools/assemble.py` | Conforms generated clips into the exact 240.000 s master + EDL |
| `tools/animatic/` | The animatic renderer (rig, environments, effects, temp audio) |

## Quick start

```bash
python3 tools/validate.py            # timeline + continuity checks (must print OK)
python3 tools/build_docs.py          # regenerate storyboard / continuity / cue sheet / prompts
cd tools/animatic && python3 render.py   # re-render the animatic (needs ffmpeg, numpy, Pillow)
python3 tools/assemble.py --clips clips/ --audio mix.wav   # build the master from generated shots
```
