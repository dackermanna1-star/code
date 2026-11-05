# nemuri II — the lucid hour

The sequel to **nemuri**. You still fall asleep and drift through dreams, but now you can
*notice* that you are dreaming — and the dream has noticed you back.

**Play:** open `dist/nemuri-ii.html` in a desktop browser (it loads three.js r128 from cdnjs).

## What's new
- **A new look** — faceted moonlight shading, gradient skies with stars and aurora, bloom, soft ink
  outlines and per-dream painterly palettes, still low-res, dithered and vertex-snapped.
  Lenses (L / settings): `lucid` (default), `tape`, `ink`, `dusk`, and `first sleep` (the original nemuri look).
- **Lucidity & reality checks** — press **R** to look at your hands; in a dream they are wrong.
  Lucidity unlocks powers: glide (hold space), blink (Q), dream flight (G), stillness (T), steer, recall.
- **The other sleeper** — 49 letters hidden as glowing shards across your dreams. Seven chapters,
  seven lanterns to light in **the Threshold** (a new door appears in your bedroom), and an ending.
- **Nightmares** — the Pursuer, a tall thing made of hanging coats, may hunt you. Find the glowing door.
  Carry a paper **lantern (F)** to hold back the fog.
- **Dream journal (J)** — polaroids of every dream you've visited (917 to find), letters, photographs,
  powers, nightly summaries, and "dream of this again". **Dream camera (C)**.
- **26 new hand-built worlds** — a cathedral of stairs into cloud, a sea of clocks at dawn, a night train over
  a drowned city, a lighthouse of other people's windows, a snow-globe town, a 4 a.m. laundromat,
  a motel where every door has your name, a drained night pool, a coat theatre, and more.
- New title, menu, prologue, pause, controls help (F1 / ?), animated waking graph, settings (O),
  touch controls, gamepad, reverb.
- All ~890 dreams of the original are still here.

## Controls
wasd move · mouse look · space jump/glide · shift run · e touch · v stay/drift · r reality check ·
q blink · g flight · t stillness · f lantern · j journal · c camera · o settings · l lens · h hud ·
m mute · p/esc pause · f1 help

## Building
The game is the original (`src/original-nemuri.html`, untouched) plus sequel modules (`modules/*.js`)
that plug into a small hook bus — see `SPEC.md`.

```bash
node tools/make-base.js   # original -> src/base.html (adds hook points)
node tools/build.js       # base + modules -> dist/nemuri-ii.html (+ .test.html with three.js inlined)
node tools/smoke.js --worlds=new --walk=10   # headless Chromium smoke test (needs playwright)
```
