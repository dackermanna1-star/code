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

## Known issues / notes
- Rapier KCC sinks into / sticks on very large cuboids and trimeshes: GroundMotor moves with zero vertical
  delta while grounded (snap-to-ground follows slopes); the sandbox ground is tiled ≤ 256 m. The World heightfield
  is robust.
- three.js PropertyMixer skips unchanged writes → Rig.savePostMixer/restorePostMixer around procedural edits.
- The delivered `use_item` clip is "searching pockets" (the earlier bandage clip was replaced in the 15:10 asset
  drop); healing therefore reads as a pocket/hand gesture. `parachute_idle` is a standing idle in the new set, so
  `parachute_hang` is preferred.
- Perf (headless SwiftShader on a shared 4-core box under load from Blender jobs): 87 characters ≈ 2.7 ms/tick sim,
  ≈ 13 ms/frame animation; earlier unloaded runs measured 1.8–2.1 ms/tick sim, 733 draw calls.
- Vite dev server only serves public/assets files known at startup when public/assets is ignored by the watcher
  (main vite.config): restart the dev server after asset deliveries.
