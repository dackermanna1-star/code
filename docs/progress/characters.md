# Characters module — progress log

Owner: Characters agent (Wave 1). Dirs: `src/characters/`, `sandbox/characters*.html`, `src/sandbox/characters*.ts`,
`tests/characters*.test.ts`, `tools/characters*`. Dev port 5202 — run with
`npx vite --config tools/characters-vite.config.ts --port 5202 --strictPort` (HMR off: other agents' edits would
otherwise full-reload pages during Playwright runs; public/assets watched so new assets are served).

## File layout
```
src/characters/
  index.ts                 installCharacters(ctx): registry, systems, camera rig, player controller, debug helpers
  constants.ts             tuning numbers (DESIGN §3/§1)
  CharacterRegistry.ts     ICharacters (spawn/remove/all/byId/queryRadius, 16 m spatial hash)
  Character.ts             Character (ICharacter): sim state + per-tick pipeline
  damage.ts                fall/drown/bail-out damage via combat.applyDamage (+ TEMP stub fallback)
  debug.ts                 window.__game helpers
  movement/  speed.ts (pure speed model, fall dmg), CharacterBody.ts (parentless capsule + shared KCC),
             GroundMotor.ts (stances, accel, jump, lean, prone body, landing, footsteps), probes.ts (vault/climb
             analysis, lean clearance, ground rays), Traversal.ts, SwimMotor.ts, SkydiveMotor.ts, SeatMotor.ts,
             footsteps.ts
  anim/      Rig.ts (bone map: Mixamo / mixamorig: / UE names; rest data), CharacterLibrary.ts (manifests →
             models/LOD1/clips, progressive variant streaming, Soldier fallback), Clips.ts (classification +
             foot-plant speed analysis), ClipSet.ts (role map), Locomotion.ts (speed-synced 8-way blend, specials),
             ProceduralAnimator.ts (stance synthesis, hip twist, aim, lean, foot IK, landing, hit flinch, knocked),
             SpecialPoses.ts (air/swim/freefall/parachute/seated/vault/climb + clip fits), WeaponPose.ts (weapon
             placement + arm IK + hand orientation + finger curl + gestures + recoil), WeaponModels.ts,
             Equipment.ts (gear + slung weapons), Ragdoll.ts, Parachute.ts, FirstPersonClip.ts,
             CharacterVisual.ts (orchestration, LOD, pose capture), PlaceholderVisual.ts
  hitbox/    Hitboxes.ts (19 capsules from pose points, sim transform), templates.ts, HitboxDebug.ts
  camera/    CameraRig.ts (ICameraRig), CameraCollider.ts, Shake.ts
  player/    PlayerController.ts
```

## Ownership decisions (for other modules)
- Character handles: movement, stances, lean, vault/climb, swim, skydive, vehicle seat follow/exit placement,
  `intent.interact` (best interactable, hold-to-interact with `action.kind='interact'`, vehicle exit, chute deploy),
  `intent.useItem` (items.canUse → action useItem (items.useDuration) → items.applyUse at completion; cancelled by
  jump/fire/vault/swim), aim/ADS flags, fall/drown/bail-out damage (via combat.applyDamage).
- Combat (`updateWeaponHandling`) handles: fire, reload, switchSlot/cycleWeapon/holster (calls `c.equipSlot`), fire mode,
  recoil. Character blanks weapon intents while `weaponsBlocked` (swim, skydive, knocked, driver seat, plane,
  traversal, transition into prone). `equipSlot` emits `'weapon:switch'`.
- Knock bleed-out (knockHealth drain) is NOT done here (combat/match).
- Vehicles: vehicle module calls `c.setVehicle(v, seat)` / `c.setVehicle(null, -1)`; Character places the exiting
  character (side → other side → back → front → roof) and applies bail-out damage above 8.3 m/s.
- Match: `setMoveState('plane')` hides + disables collider (position via `teleport()` each tick, interpolated);
  `setMoveState('freefall')` starts skydiving ('jump' event), auto chute at 120 m AGL, F deploys.
- Player spawn: `characters.spawn({isPlayer:true})` sets `ctx.player` and switches the camera to 'player'.

## Status (2026-10-15, end of wave)
Done + tested:
- Movement: speeds within 0.2 % of DESIGN for 10 cases (tools/characters-movement.mjs), vault 0.5/0.8/1.1 m, climb
  1.6/2.0 m, 2.5 m refused; fall damage 5/10/15/20 m (20 m lethal); swim 2.8/4.2 m/s, dive, breath 15 s, surface,
  exit via beach; freefall 45 m/s, dive 65 m/s, auto-deploy ~120 m AGL, chute 5.5/7 m/s, landing.
- State rules (tools/characters-states.mjs, 12/12 pass): tunnel crouch/prone clearance, prone slope limit (20° ok,
  40° refused), ramps 20–45° climbed / 55° refused, stairs 0.18 m and 0.25 m risers at full run speed (≤ 0.9 s to the
  top), lean blocked by walls (head stays out of the wall), jump apex 0.55 m, drowning (100 HP at 14 s, ~67 at 18 s),
  knocked crawl 0.9 m/s, vehicle seat/exit/bail-out, plane hide + exit to skydive, hold-to-interact (hold, cancel,
  instant), healing (walk cap 1.9 m/s, items.applyUse at completion).
- Step-up: Rapier's autostep only engages on vertical contact normals, so a capsule meeting a 0.15–0.37 m step edge
  with its bottom hemisphere stopped dead. CharacterBody.move(..., { stepUp }) adds a manual step-up when the KCC
  result is blocked (tread probe ahead ≤ 0.45 m, walkable normal, headroom check, horizontal remainder from the raised
  position, short grounded hold while the capsule passes the edge). tests/characters.body.test.ts covers 0.18/0.25/
  0.35/0.44 m stairs, a 0.6 m ledge (no step), a step without headroom, and walking down stairs with snap.
- Camera: TPP, aim-hold, ADS click (hybrid), FPP (clip-sphere head hiding), FPP hip pose, free look, collision,
  crouch/prone, lean, vehicle (driver/passenger), freefall/dive, parachute, swim, deathcam, spectate
  (tools/characters-camera.mjs). Iron-sight ADS: when a weapon's rear sight is modelled solid on the sight line, the
  eye is lifted (raycast once per sight node, ≤ 24 mm) so the view passes over the rear sight to the front post.
- Visuals with the delivered survivor/soldier variants and the 148-clip library (re-delivered 15:10): 8-way rifle
  locomotion incl. sprint fl/fr, crouch/prone groups, aim idles, swim, freefall, parachute (hang clip + procedural
  canopy), drive/passenger sit (+ steering IK), knocked idle/crawl, procedural vault/climb hand plants, weapon IK
  (rifle/pistol/melee/throwable), gear + slung weapons, ragdoll. A crouch idle much lower than its crouch walk (the new
  deep-squat clip) is replaced by the procedural crouch over the stand idle. Upper-body overlays play each clip's
  active window (5–95 % of its rotation) and long actions (bandage, drink, revive) ping-pong at natural speed.
- Hitboxes: 19 capsules, 91–94 % mesh-vertex coverage (`__game.hitboxCoverage(id)`), correct in all stances.
- Unit/integration tests: tests/characters.test.ts (20) + tests/characters.body.test.ts (7) pass.
- Full game (`/?quick=1`, real terrain): player spawns grounded and runs at 4.7 m/s; no console errors.

Evidence tools (all write PNGs to `$TMPDIR/characters-shots` unless an out dir is given):
`tools/characters-movement.mjs`, `tools/characters-states.mjs`, `tools/characters-camera.mjs [base] [out] [filter]`,
`tools/characters-poses.mjs [base] [out] [regex] [{"hitboxes":true}]`, `tools/characters-clips.mjs [base] [out] [regex]`.
QA additions: `tools/characters-qa.mjs` (adversarial scenarios), `tools/characters-game.mjs` (full-game smoke test).

## Known issues / notes
- Rapier KCC sinks into / sticks on very large cuboids and trimeshes: GroundMotor moves with zero vertical
  delta while grounded (snap-to-ground follows slopes); the sandbox ground is tiled ≤ 256 m. The World heightfield
  is robust.
- three.js PropertyMixer skips unchanged writes → Rig.savePostMixer/restorePostMixer around procedural edits.
- The delivered `use_item` clip is "searching pockets"; bandages, first-aid kits, med kits and adrenaline therefore use
  a procedural gesture (SpecialPoses.healGesture: forearm across the belly, the other hand wraps/works on it, head
  down); drinks and painkillers keep the `drink` clip. `parachute_idle` is a standing idle in the new set, so
  `parachute_hang` is preferred.
- Perf (headless SwiftShader on a shared 4-core box under load from Blender jobs): 87 characters ≈ 2.7 ms/tick sim,
  ≈ 13 ms/frame animation; earlier unloaded runs measured 1.8–2.1 ms/tick sim, 733 draw calls.
- Vite dev server only serves public/assets files known at startup when public/assets is ignored by the watcher
  (main vite.config): restart the dev server after asset deliveries.

## Independent QA pass (2026-10-15, QA + fix engineer)

Method: full code read of `src/characters/**`, all evidence tools re-run against a fresh dev server (port 5302,
`tools/characters-vite.config.ts`), a new adversarial scenario suite, new Rapier-in-process integration tests, the
full game (`/?quick=1`) on the real map, and visual review of every pose/camera screenshot.

New tools / tests (all pass):
- `tools/characters-qa.mjs [base] [regex] [--file snippet.js] [--query "?count=80"]` — 24 adversarial scenarios:
  steep slope, high dive into water, stance-key spam, teleport under low ceilings, prone view clamp, prone turn into
  a wall, overlapping spawns, body blocking, coyote jump, Space under a ceiling, 90 s random input soak (no NaN, never
  below the floor, max speed 6.3), extreme mouse deltas, seat/hitbox sync in a moving vehicle, removing a spectated
  character, death in every state (ground/prone/skydive/swim/knocked/vault), knocked in deep water, prone uphill,
  vault at 45° from a sprint and from standstill, stance change mid-transition, fall damage applied once, hitbox
  heights per stance for a culled far bot, footstep/noise radii per gait (sprint 35 / run 22 / walk 8 / crouch 6 m),
  jump/land/stance events, pose capture while sprinting, ragdoll of a mid-air kill (deathcam/culling follow it). `--file` evaluates an ad-hoc snippet in the harness.
- `tools/characters-game.mjs` — full game smoke test on the real map (low graphics for software WebGL): spawn
  grounded (0.02 m above terrain), run 4.70 m/s, crouch/prone/stand, jump, TPP/FPP screenshots, no console errors.
- `tests/characters.motor.test.ts` (7, real Character + motors + Rapier, stubbed services): 60° slope slide, 40°
  ramp still climbable, prone view clamp, teleport under 0.85/1.4 m ceilings, revive under a low table, seat/hitbox
  sync at 108 km/h, player view turns with the vehicle (bots keep absolute aim). Verified to fail with the fixes
  disabled.
- `tests/characters.loco.test.ts` (3): allocation-free locomotion blend helpers equal the reference helpers.
- Re-run evidence: movement 10/10 speeds within 0.2 % of DESIGN, vault/climb/fall/swim/skydive all pass;
  states 12/12 (jump apex now 0.55 m); poses (57) + camera (24) galleries re-rendered (incl. new crouch, gear,
  parachute, heal and vehicle-driving shots). Whole project `npx tsc --noEmit` clean; `npx vitest run` 73/73.

Defects found and fixed:
1. Steep ground was standable: the KCC reports "grounded" on 55°+ slopes (snap/resting contact), so characters
   could stand on cliff faces, steep roofs and the 55° test ramp. Ground steeper than 52° (STEEP_SLOPE_DEG) is now
   treated as airborne; when the KCC blocks part of a fall the displacement it allowed becomes the velocity, so the
   slide accelerates with g·sinθ and landing damage reflects the real vertical speed (GroundMotor).
2. Stale root matrix in the animation pass: `container.updateMatrixWorld` used last frame's root matrix while the
   procedural layers used this frame's root, so seat hips, weapon placement, IK targets and the captured pose (→
   hitboxes) were offset by one frame of travel — measured 0.20 m for a sprinting character at headless frame
   rates, 0.4 m for a seated driver. Root matrix refreshed first (CharacterVisual.animate); now 0.04 m (hip sway).
3. Seated characters lagged their vehicle by one tick (characters tick before vehicles): seat, eye and hitboxes
   were 0.135 m behind at 29 km/h (≈0.5 m at 110 km/h). Seats are re-synced right after the vehicles system and
   post-physics (`characterSeats*` systems, Character.syncSeat), and the seated body is drawn from the vehicle's
   rendered root + the seat pose relative to the vehicle (no lag/jitter against an interpolated vehicle).
   FPP-in-vehicle camera uses the drawn head instead of the sim seat eye.
4. Vehicle camera ignored the vehicle's rotation: the view stayed fixed in world space while the car turned (FPP
   driving ended up looking out of the back). The player's view now turns with the vehicle (PUBG behaviour; render
   rate smoothing from the drawn vehicle), and getting in faces the vehicle's forward.
5. Prone view was unbounded: the body turns at 100°/s and can be blocked by walls, but the view (= shot direction)
   could point anywhere, e.g. shooting backwards while the animated rifle (spine aim clamp ±80°) pointed forward.
   The view may now lead the prone body by at most 70° (Character + PlayerController at render rate).
6. Crouched head far above the crouch collider/eye: unarmed crouch idle (procedural crouch) had the head at
   1.30 m and the pistol crouch-walk clip at 1.41 m (stand is 1.66) — the head hitbox poked over cover the player
   believed they were hidden behind. A crouch height governor (ProceduralAnimator) lowers hips/leans the spine so
   every crouch variant has the head at 1.10–1.13 m (rifle kneel 1.02), hitbox top ≈ 1.31 m.
7. Delivered gear GLBs appeared far away in the map: the proxy-fit used the attached proxy's *world* box inside the
   bone frame. Gear now follows the gear README (bone + offset, identity rotation, rig-height scale ≈0.94 for the
   female variants), streams `<id>_lod1.glb` beyond 25 m, hides hair / the soldier's own helmet under a helmet,
   and gets the FPP head clip when it streams in.
8. Parachute: the canopy followed the jumper during its collapse (and stayed visible after a mid-air death, since
   the ragdoll path skipped it); deployed canopies of far/culled jumpers updated at the animation-LOD rate (4–8 Hz
   stutter); per-frame allocations. Now placed every frame, released where it was on landing/death, allocation-free,
   and the authored `gear/parachute.glb` (canopy/lines/risers) replaces the procedural wing when present.
9. Teleport into a spot lower than the current stance (spawn/revive under low ceilings) made the KCC pop the capsule
   on top of the obstacle; revive under a table did the same. Both now duck (crouch, else prone).
10. Removing a spectated character left the camera following a disposed character → falls back to the player.
11. Perf: locomotion blend allocated arrays/closures per animated character per frame (now cached direction
    index + scratch weights), probe predicate closure per raycast (now one per physics), Euler per seated tick.
12. Visual: healing with bandages/kits read as searching pockets → procedural wrap/kit gesture (see Known issues).
13. Jump apex was 0.523 m (DESIGN 0.55): the take-off speed used the continuous √(2gh), which the fixed-tick
    integrator undershoots; `jumpVelocityFor()` solves for the discrete apex (unit test simulates the integrator).
14. Ragdolls were culled around the root where the character died (the visual culls by its own sphere since the
    skinned meshes have frustumCulled = false), so a body that fell/slid away vanished when the death point left
    the view, and the deathcam orbited the death point. Culling sphere and deathcam pivot now follow the hips.

Measured after fixes (headless SwiftShader, shared 4-core box): 87 characters → sim 1.21 ms/tick, animation
10.4 ms/frame with every in-view character animated each frame (≈0.29 ms each: mixer 0.19, procedural 0.05, weapon
0.05) — at 60 fps the distance LOD intervals cut that to the near ones; 174 draw calls, 0.63 M triangles.

Remaining / not fixed (documented):
- Hitbox debug draws the sim (current-tick) capsules while bodies are drawn interpolated, so moving characters'
  capsules lead the mesh by ≤ 1 tick of travel (≤ 0.1 m sprinting) — expected for fixed-tick hit detection.
- Iron-sight ADS on some weapon GLBs looks over a solid rear-sight block (asset side; camera lifts ≤ 24 mm).
- Space while crouched/prone stands up instead of jumping/vaulting (kept from the original design; PUBG-like).
- Knock bleed-out / revive flow belong to combat/match (unchanged).
- The sandbox arena lighting has no fill from below (freefall bodies/parachutes seen from below look black) — the
  real map uses the world lighting.
- Vehicles/combat/match/items are still stubs: seat sync, bail-out and vehicle camera are verified with the sandbox
  MockVehicle and the Rapier integration test; re-check once the vehicles module lands (the seat is re-read right
  after the vehicles system and post-physics, so either publishing order works).
- Visual polish left: grenade cook pose (arm straight up from the clip window), climb hand plants are approximate.
- Perf numbers are from software rendering on a loaded box; no GPU measurement possible here.
