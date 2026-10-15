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

## Status (2026-10-15)
Done + tested:
- Movement: speeds within 0.2 % of DESIGN (tools/characters-movement.mjs speed), vault 0.5/0.8/1.1 m, climb 1.6/2.0 m,
  2.5 m refused; fall damage 5/10/15/20 m (20 m lethal); swim 2.8/4.2 m/s, dive, breath 15 s, surface, exit via beach;
  freefall 45 m/s, dive 65 m/s, auto-deploy ~120 m AGL, chute 5.5/7 m/s, landing.
- Camera: TPP, aim-hold, ADS click (hybrid), FPP (clip-sphere head hiding), FPP hip pose, free look, collision,
  crouch/prone, lean, vehicle (driver/passenger), freefall/dive, parachute, swim, deathcam, spectate (tools/characters-camera.mjs).
- Visuals with delivered Rocketbox characters + 125 clips: 8-way rifle locomotion, crouch/prone groups, aim idles,
  swim, freefall, parachute (+ procedural canopy), drive/passenger sit (+ steering IK), knocked idle/crawl,
  procedural vault/climb hand plants, weapon IK (rifle/pistol/melee/throwable), gear + slung weapons, ragdoll.
- Hitboxes: 19 capsules, 91–94 % mesh-vertex coverage (`__game.hitboxCoverage(id)`), correct in all stances.

## Known issues / notes
- Rapier KCC sinks into / sticks on very large cuboids and trimeshes: GroundMotor moves with zero vertical
  delta while grounded (snap-to-ground follows slopes); the sandbox ground is tiled ≤ 256 m. The stub world's single
  3 km cuboid would still sink (World agent replaces it with a heightfield, which is robust).
- three.js PropertyMixer skips unchanged writes → Rig.savePostMixer/restorePostMixer around procedural edits.
- Vite dev server only serves public/assets files known at startup when public/assets is ignored by the watcher
  (main vite.config): restart the dev server after asset deliveries.
