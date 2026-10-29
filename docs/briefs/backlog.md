# Orchestrator backlog (cross-module follow-ups)

- Cross-assembly support: bonds to a named part in another assembly, or world bonds that break
  when a named part of another assembly is destroyed (floor finishes resting on slab cells, front
  door frame depending on its concrete). Requested by world-structure.
- Builder: allow several same-kind bonds per pair with different anchors; "through a hole in the
  finish" flag for fastener bonds (39 remaining structure warnings).
- ToolSystem.update should slow with hit-stop (player request).
- Contract: IToolSystem `charge`/`extinguisherLevel`/`pryStress`; InputSystem `setEnabled`/
  `onLockChange`/test hooks; RenderSystem `flicker`; feature event for hum/loop sounds.
- `liquid`/`water` features on tiled vessels should fire when any shell tile breaks.
- Audio id `extinguisher.spray`.
- VFX: MicroKind for tempered cubes; decal() attached to nodes; horizontal raycast hook.
- Builder: use `printedFaceUV(points, n, worldSize)` (src/render/printed.ts) for printed-surface faces in
  finishPart instead of random uv offsets (survives fracture; batcher fallback then unnecessary).
- render-env: keep maxSimultaneousLights ≤ 8 on receivers; check setPower(false) visibly darkens rooms.
- render-core: capture() never resolves if a listed mesh never becomes ready (add timeout).
- Light features: opt-out flag so a room switch skips appliance lamps (oven/fridge interior lights).
- Destruction: stacked loads — impact energy uses only the struck body's mass.
- Physics: nested compound bodies settle ~1 mm per level lower than shapes allow.
- Sun azimuth: decided to keep the west-south-west evening sun (south openings get sun patches/shafts;
  east windows get sky light only).
- addLight(light, room, mains, opts?: { castShadows }) so FeatureDef.light.castShadows is honoured.
- render-core: set useGLTFLightFalloff at material creation; env-capture feedback-loop warning seen in
  render-env integration probe (re-check after render-core's double-buffer fix).
- Paintings/mirrors: nail bonds to the wall should be linked to the wall part behind them (fall when the
  wall is hit hard / destroyed). Part of the cross-assembly item above.
- Physics: 16-point hull decimation makes rounded soft parts (pillows, cushions) sink/tip; allow more hull
  points or exact handling for soft/rounded parts.
- Integration: assert unique type ids when merging area registries.
