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
