# Characters module — progress log

Owner: Characters agent (Wave 1). Dirs: `src/characters/`, `sandbox/characters*.html`, `src/sandbox/characters*.ts`,
`tests/characters*.test.ts`, `tools/characters*`. Dev port 5202.

## Plan / file layout
```
src/characters/
  index.ts                 installCharacters(ctx): registry, systems, camera rig, player controller, debug helpers
  constants.ts             tuning numbers (DESIGN §3/§1) in one place
  CharacterRegistry.ts     ICharacters (spawn/remove/all/byId/queryRadius spatial hash)
  Character.ts             Character (ICharacter): sim state + per-tick pipeline orchestration
  movement/                pure speed model, fall damage, KCC body, stances, traversal (vault/climb),
                           swim, skydive (freefall/parachute), vehicle seat, lean, probes
  anim/                    bone map, asset library (manifest + fallback), visual, locomotion, procedural rig,
                           IK, foot IK, ragdoll, equipment/weapon attachments, parachute mesh
  hitbox/                  per-zone capsules from posed skeleton (cached pose for far chars), debug overlay
  camera/                  CameraRig (ICameraRig): TPP/FPP/aim/ADS, collision, free look, shake, modes
  player/                  PlayerController: input → CharacterIntent, hold/toggle semantics, interactions
```

## Ownership decisions (for other modules)
- Character handles: movement, stances, lean, vault/climb, swim, skydive, vehicle seat follow/exit placement,
  `intent.interact` (best interactable, hold-to-interact with `action.kind='interact'`), `intent.useItem`
  (items.canUse → action useItem → items.applyUse at completion), aim/ADS flags, fall damage.
- Combat (`updateWeaponHandling`) handles: fire, reload, switchSlot/cycleWeapon/holster (calls `c.equipSlot`),
  fire mode, recoil. Character blanks weapon intents while weapons are blocked (swim, skydive, knocked, driver seat).

## Status
(see sections below, updated as work lands)
