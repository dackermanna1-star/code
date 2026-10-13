# 03 — Character Bible

These are the model-sheet specifications, behaviour notes and the locked
prompt text for both fighters. The prompt blocks live in `data/bible.json`
and are pasted into every shot prompt by `tools/build_docs.py`, so an edit
there propagates everywhere. Canon claim ids (G1-…, T1-…) refer to
`01-research-dossier.md`.

---

## Satoru Gojo (Jujutsu Kaisen)

**Continuity:** JJK manga (complete, ch 1–271) as primary, with the anime
(through S3) for visual reference. Shinjuku-arc mechanics (ch 221–236) are
manga-only and are labelled as such wherever we use them.

### Model sheet
| Element | Spec | Basis |
|---|---|---|
| Height / build | Over 190 cm, lean, long-limbed, athletic, narrow waist; head small relative to body; long white eyelashes | G2-36 |
| Hair | Snow white. **With the blindfold on**, it is pushed up into the tall spiky silhouette. **With the blindfold off**, it falls loose over his forehead | G2-37 |
| Eyes | The Six Eyes: vivid, bright, crystalline blue; uncovering them is a dramatic beat | G2-37 |
| Eye covering | A black cloth blindfold (main-story look). It is pulled down to hang around his neck once he gets serious (Seq 3) and pulled back up at the very end (Seq 8). Sunglasses are not used, which keeps one look | G2-38 |
| Uniform | Black (near-navy) jujutsu-high jacket with a broad, high standing collar zipped to the chin; slim dark trousers; black shoes | G2-39 |
| Palette | `#16181F` uniform, `#EEF2FA` hair, `#F0D6C4` skin, `#46C8FF` eyes | — |

### Behaviour and acting
- **Default:** relaxed, hands in his pockets, weight on one leg, a small
  smirk, head tilted. He is playfully arrogant and talks to his opponent
  mid-fight (G2-40).
- **When it gets real:** the clowning drops. He goes quiet, his eyes
  uncovered and narrowed, and his movements become more economical, not
  bigger (G2-41).
- **Fighting style:**
  - an elite hand-to-hand fighter: footwork, palm strikes, elbows, knees,
    precise body shots (G1-45)
  - techniques woven into strikes (point-blank Red, Blue-assisted lunges)
  - he never "blocks" what Infinity handles anyway, but he does slip and
    dodge when it is efficient or stylish
- **Hands:** precise and deliberate. Two-finger gestures for technique cues;
  the domain hand sign has the middle finger crossed over the index (G1-30).
- **Limits shown in this film:**
  - the brain load of permanent Infinity + RCT, which shows as a nosebleed
    (G1-09, G1-38)
  - domain burnout: no Limitless, no Infinity, no teleport (G1-37..39)
  - the cost of the RCT brain-repair workaround (G1-38)

---

## Grand Regent Thragg (Invincible)

**Continuity:** the **Invincible comics** (complete, #1–144) are the basis
for his powers, feats and limits. The animated series (Prime Video S4, 2026)
has shown exactly one Thragg fight and never shows him hurt (T2-20, T2-27), so
it cannot define his durability, healing or limits. It informs the costume
palette and his calm vocal delivery. No animated-only feat (e.g. the S4E7
"pull" punch, T2-14) is used.

### Model sheet
| Element | Spec | Basis |
|---|---|---|
| Height / build | About 198 cm, enormously muscular, broader than Omni-Man; a thick neck; a square, severe, angular face with a pronounced jaw | T1-09, T1-10 |
| Hair | **Close-cropped, jet-black** | T1-09, T1-10, T2-31 |
| Mustache | Thick, well-groomed **black** Viltrumite mustache | T1-09 |
| Eyes | Dark brown, cold, no warmth | T1-10 |
| Uniform | Grand Regent bodysuit in **white with crimson** sections; circular Viltrum chest emblem split by three vertical lines; crimson belt; short Grecian-style skirt; crimson gloves and boots | T1-11, T2-30, T2-33 |
| Cape | A crimson cape for his entrance (Seq 1–3). **Red tears it away in Seq 3**, and he fights the rest of the film without it | design choice (T2-30 animated cape; T1-12 comics hide-cape) |
| Palette | `#D6D2CE` suit, `#B01C22` crimson, `#16141A` hair, `#E6D0C0` skin | — |

> **Note on the brief.** The brief describes Thragg with "thick, swept-back
> white hair". Both continuities give him close-cropped black hair and a black
> mustache (T1-09, T1-10, T2-31). The brief's own first rule is canon
> accuracy, so the production uses the canon look. To follow the brief's
> description instead, change one line in `data/bible.json` →
> `characters.thragg.block` and the rig colour in `tools/animatic/rig.py`.

### Behaviour and acting
- **Stillness is power.** At rest he barely moves: controlled breathing,
  unblinking eye contact, chin level. He takes a long, contemptuous survey of
  his surroundings.
- **Voice:** calm, formal, commanding. He rarely raises it (T1-42, T2-29).
  He is never a screaming brute.
- **Fighting style:**
  - Explosive acceleration: one compressed anticipation frame, then gone.
  - Compact guard, heavy hip rotation, short hooks and straights, knees.
  - Efficient grappling and throws.
  - Feints and level changes; he attacks from new angles.
  - **Signature finisher:** a penetrating spear-hand into the torso or at
    the heart (T1-35).
- **Mind:**
  - **Pragmatic and adaptive.** When something doesn't work he stops,
    studies, and changes the problem.
  - **Manipulates the battlefield.** He uses the environment, deception and
    psychological pressure (T1-19, T1-21, T1-37).
  - **Fights through damage that should stop him.** He fought on
    disembowelled for days (T1-26–28) and kept fighting while burning in the
    Sun (T1-39).
- **Healing:** fast by human standards but **not instant**, and lost parts
  do not regrow (T1-46, T1-47). Every injury he takes stays visible for the
  rest of the film.

---

## Expression sheets (required references)

| Gojo | Thragg |
|---|---|
| smirk (blindfold) | cold contempt |
| amused, one eye uncovered (lifted blindfold) | analytical (eyes narrowing, studying) |
| focused (blindfold at neck, hair loose) | faint smile, blood at the mouth |
| serious / cold | controlled fury |
| strain (nosebleed) | overloaded (pupils flooded with light, frozen) |
| exhausted, blood from one eye | resolve through injury (bleeding eyes, steady jaw) |
| tired smirk, blindfold back on | defeated |
