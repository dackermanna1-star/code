# Verification

How the recreation was checked against the reference screenshots and the
original game's behaviour. All images below come from an automated full
playthrough (`tools/fullrun.mjs`): the bot plays every level in god mode
(escapes don't end the run) so each stage of the game can be captured.
Captures were rendered with software WebGL (SwiftShader) at 1280×960.

## Reference frames, side by side (left: original, right: this game)

| Reference | Stage | Comparison |
|---|---|---|
| 1 | Level 1 start | ![](verification/compare_ref1.jpg) |
| 2 | End of level 2 | ![](verification/compare_ref2.jpg) |
| 3 | Middle of level 4 | ![](verification/compare_ref3.jpg) |
| 4 | Level 5 | ![](verification/compare_ref4.jpg) |
| 5 | Walrus boss | ![](verification/compare_ref5.jpg) |

What matches:

* 4:3 framing, fixed near-orthographic view, black level/boss strip, steel-blue
  weapon bar with captions, black money/kills box.
* Iceberg silhouette and placement, back-edge outline with the notch, misty
  reflective ice with the iceberg's reflection, front cliff faces.
* Hunter size, colours and position; crosshair with ammo / reload %, money
  above the hunter.
* Accumulating corpses of every creature type, lane-shaped blood fields,
  casings fanning out to the right of the hunter.
* Pacing: the bot's kills over time track the reference player's
  (e.g. 56 kills at 2:09 vs 57 at 2:16; 237 at 6:03 vs 248 at 6:13 in earlier runs).

Remaining differences:

* The original's blood is denser and is drawn *over* the corpses, so late
  frames are almost solid red. Here blood paints the ice and tints corpses as it
  lands on them; coverage is lower and corpses stay more readable.
* The reference player fires the minigun in frames 4–5, giving a much larger
  fan of gold casings; the bot in these captures uses the M4.

## Bosses and ending

| | |
|---|---|
| Fat seal (level 1) ![](verification/boss1_fatseal.jpg) | Penguin wave (level 2) ![](verification/boss2_penguins.jpg) |
| Polar bear (level 3) ![](verification/boss3_bear.jpg) | Turtle (level 4) ![](verification/boss4_turtle.jpg) |
| Last seal on the planet ![](verification/level6_last_seal.jpg) | Final frame at victory ![](verification/end.jpg) |

## Automated checks

* `npm test` — 26 unit tests: weapon cadence (pistol 13-tick shots / 100-tick
  reload, minigun spin-up to 3 ticks), buy rules, recoil, view-consistent hit
  band and headshots, pierce, turtle ricochet, escapes → game over, activist cub
  shot out / dropped, bear enrage, fat-seal regeneration, level-1 spawn table
  and boss timing, every level's bosses, walrus lane lock and bite, explosion
  damage and bounty, audio mapping vs. the sound files, a 70 s bot game.
* `tools/sim.ts` — headless balance runs with the bot (reaches levels 3–4 with
  the default buy list at skill 1.0; the original's economy and enemy numbers
  are unchanged).
* `tools/fullrun.mjs` — complete game to the victory screen with no page errors
  (7:10 game time, 210 kills, 248 corpses on the ice at the end).
* `tools/weapons.mjs` — every weapon fired at a line of targets (muzzle flash,
  tracers, pellets, explosions, gibs).
* `tools/e2e.mjs` — production build (`npm run build && npm run preview`) loads
  all assets (193 sounds, fonts) and plays without errors.

## Performance

* CPU time per frame for logic + physics + particles + animation, measured in the
  browser during an autoplayed game: 0.07–2.1 ms (levels 1–4, up to 157 corpses).
* Draw calls: ~100–600 depending on the number of live creatures; settled
  corpses are baked into one `BatchedMesh` per material, so hundreds of bodies
  cost a handful of draw calls.
* GPU frame time could not be measured here (software rendering only).
  `?quality=low` drops the planar character reflection and shadows and caps
  the pixel ratio.
