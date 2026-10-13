# 06 — Sound Design & Score

The animatic's temp track (`tools/animatic/audio.py`) spots every cue in this
document at its exact frame. It is a placeholder for timing, not the final
sound. The frame-accurate spotting list is `06b-cue-sheet.md`, generated from
the shot list.

## Principles

1. **Silence is an instrument.** The film has four deliberate silences:
   - before Thragg's launch (Seq 1)
   - under the Purple charge (Seq 5)
   - the domain transition (Seq 6)
   - the instant of the final impact (Seq 7)

   Every big moment is preceded by a drop, never by more noise.
2. **Every impact has three layers** that land on the contact frame:
   - a low-frequency body (sub sweep)
   - a sharp transient (crack or smack)
   - an environmental tail (reverb or debris)

   The SFX `at` frame in the shot list is the contact frame, never "near"
   it.
3. **Different powers sound different.**

   | Source | Signature |
   |---|---|
   | Thragg | physical air and matter: pressure, booms, crunching stone, metal |
   | Gojo | the *absence* of impact (Infinity's stalled swell and glassy ring), plus tonal, almost musical sounds for Blue, Red and Purple |
   | The domain | ticking, crystalline "information" |
4. **Dialogue is never masked.** The score ducks about 8 dB under every line.
   Lines sit in pre-cleared pockets in the cue sheet.

## Score: one evolving piece, never a loop

| Seq | Window | Musical state | Instrumentation | Key moments |
|---|---|---|---|---|
| 1 The Encounter | 00:00–00:25 | Dark, wide, still | Low string drone on D, distant restrained choir, wind, solitary taiko on the landing | Drops to near silence for the exchange; **full silence** for the last beat before the launch |
| 2 The First Impact | 00:25–00:55 | Pulse enters | 96 BPM low percussion, electronic pulse, low brass stabs placed *between* blows | Music thins to let each `infinity_stop` ring read; brass motif for Thragg (descending minor 3rd) |
| 3 The Sorcerer Takes Control | 00:55–01:30 | Gojo's motif appears | 112 BPM, rising-fifth brass motif for Gojo, glassy synth arpeggio | Hit on the Red release; a held beat under "Now we're fighting" |
| 4 Viltrumite Fury | 01:30–02:10 | Full aggression | 140 BPM, rapid taiko and toms, driving ostinato, both motifs in counterpoint | The tower crash is the peak; music drops for the "smile fades" close-up |
| 5 Hollow Purple | 02:10–02:45 | Falls away, then the biggest swell | Low rumble only during the charge, choir and brass entering in layers, full orchestra at the release | Total drop as Gojo raises his hands; the swell crests on the release frame; the aftermath is sustained strings |
| 6 The Domain | 02:45–03:20 | Leaves music behind | Silence at the hand sign, then high crystalline clusters, a sub drone and granular ticks; heartbeat under Thragg's close-ups | No rhythm at all inside the domain; it "breaks" with a reversed shatter |
| 7 The Final Exchange | 03:20–03:50 | Rebuilds, then the fastest material in the film | Isolated piano-like tones over the dust, then a 150 BPM ostinato with both motifs colliding | The slow motion stretches a single chord; **hard cut to silence on the impact frame**; the silence holds through the wide silhouette |
| 8 The Verdict | 03:50–04:00 | Restrained final statement | Solo low brass plus strings, Gojo's rising fifth resolved, no percussion | The last note ends on the cut to black at 04:00:00 |

## Signature SFX design

| Cue (temp name) | Design for the final mix |
|---|---|
| `land_heavy` | Thragg's landing: sub thump at 25–40 Hz, asphalt crunch, a glass rain tail layered from 3 directions |
| `accel_burst` | Viltrumite take-off: compressed-air "chuff" plus ground tear, rising whoosh |
| `sonic_boom` | Double N-wave crack, then a low boom rolling off the buildings (slapback from the street canyon) |
| `flyby` | Doppler roar, band-limited, panned with the flight path |
| `punch_heavy` / `punch_light` | Bone-and-muscle body, air-burst transient. These are only used when something is actually hit: Gojo's strikes, Thragg hitting the environment |
| `infinity_stop` | **The key sound of the film.** The swell of a blow that never lands: a pressure "whumm" that stalls mid-attack, a muffled thud that never completes, then a thin glassy ring that hangs and decays. It must never sound like a hit |
| `blue` | Rising suck with a low throb; a granular rush of small debris arriving first and heavy metal groans after |
| `red_charge` → `red_release` | Crackling high-frequency tension, then a hard transient, crunch and sub drop with a long tail |
| `purple_charge` → `purple_release` | Two tones beating against each other and converging in pitch while crackle builds, then a world-sized sub drop and tearing air, with the destruction heard *after* the release, as erasure followed by the rumble of what collapses at the channel's edges |
| `domain_open` / `domain_bed` / `domain_close` | A finger-snap-like click, then total silence, then a crystalline chord swelling; a bed of drone, ticking information grains and high clusters; it ends with a reversed glass shatter |
| `building_collapse` | 6–8 s: metal groan, staggered slab failures, sub rumble, debris rain |
| `rct_heal` | Soft airy chord, almost inaudible. Healing must not sound triumphant |
| `final_impact` | The largest sub of the film, then the mix cuts to **silence** (the music event `silence` on the same frame), with only a faint high ring returning under the wide shot |

## Dialogue

There are four original lines (plus one optional closing beat), all short
enough to sit in silence pockets:

- **Thragg:** "You stand in my way."
- **Gojo:** "You should've picked an easier planet."
- **Gojo:** "That's close. For you."
- **Thragg:** "Now we're fighting."

Delivery:
- **Thragg** (comics-informed; the animated performance is described as calm
  and quiet): low, unhurried, never shouting.
- **Gojo:** light and amused until Seq 3, quieter and flatter after.
