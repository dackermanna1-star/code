# Brief: tools (`src/player/tools/**`)

Owner paths: `src/player/tools/**`, `tests/probes/tools-*.probe.ts`. Read first:
`src/player/contracts.ts` (IToolSystem, ToolDef, ToolContext — implement exactly),
`src/core/context.ts` (StrikeInput/StrikeResult, ToolId, PhysicsSystem.sphereSweep, Layer),
`docs/api-notes/input-loop-camera.md` (viewmodel rendering group), `docs/api-notes/physics-events-queries.md`
(shape casts), `docs/ARCHITECTURE.md` §9.

Implement `class ToolSystem implements IToolSystem` in `src/player/tools/toolSystem.ts`
(`new ToolSystem(ctx)`; uses ctx.input, ctx.physics, ctx.destruction, ctx.events, ctx.render
(camera, shake), ctx.time (hitStop), ctx.settings, ctx.scene, ctx.vfx):
1. Tool definitions (`defs.ts`) with physically motivated parameters (effective head mass, head
   speed, charge multiplier/time, swing timings, reach, head radius, contact radius, sharpness,
   striker material): hands (alternating punches, ~1.5 kg effective, 8–9 m/s), claw hammer
   (0.9 kg eff, 11 m/s, small contact 1.5 cm), sledgehammer (6 kg eff, 6.5 m/s, slow windup,
   huge hits, contact 3 cm), crowbar (1.2 kg, 9 m/s, alt = pry), baseball bat (0.8 kg eff, 17 m/s,
   wide arc, contact 3 cm), axe (1.8 kg eff, 11 m/s, sharpness 2.2 on wood), fire extinguisher
   (blunt 4 kg, slow; alt = spray).
2. Swing state machine: idle → windup (hold fire to charge up to chargeTime; release or max
   charge → strike) → strike window → recover; quick tap = normal swing. Swing paths are
   procedural arcs in camera space (overhead for sledge/axe, diagonal for hammer/crowbar,
   horizontal for bat, straight jab for fists) — the motion is animation, but HITS ARE PHYSICAL:
   each fixed step during the strike window, sweep the head sphere from its previous to current
   world position with `physics.sphereSweep` (ignore the player; all layers except PLAYER/HELD);
   on first hit compute the head's world velocity (path derivative × charge + player velocity),
   project onto the surface normal for impact speed, call `destruction.strike({...})`, then
   resolve feel: hardness-based recoil (hard targets bounce the tool back and end the swing early;
   soft targets let it follow through; breaking through (result.broke on drywall/glass) continues
   the swing), camera shake ∝ energy, brief hit-stop for heavy hits (if settings.hitStop), emit
   `toolHit`. Emit `toolSwing` at strike start (whoosh). Punching hard materials (concrete, steel)
   → pain flash (render.flash red, small) and a weak hit.
3. Kick (F): a leg sweep forward at 0.3–0.9 m height within ~1.1 m (sphere sweep), effective
   mass ~6 kg at ~7.5 m/s; stomp (G): downward strike at the point under the crosshair within
   1.2 m reach or directly below the player's feet (~20 kg eff at 4 m/s). Both via destruction.strike.
4. Crowbar alt (pry): while alt is held and the crosshair hits a part within 1.3 m, call
   `destruction.pry(body, point, dir, 3000 N, dt)` each fixed step; viewmodel shows a levering pose
   with jitter proportional to the returned stress; stop when the bond pops. Extinguisher alt:
   spray emitter (vfx 'extinguisher') along the view, pushes light dynamic bodies in a cone with
   small impulses, loop sound handled via events (emit a 'strain'-free custom? — just call
   ctx.audio.play/loop directly for the spray), limited contents.
5. Viewmodel (`viewmodel.ts`): low-poly first-person arms/hands (sleeves + skin) and a model per
   tool built procedurally (MeshBuilder boxes/cylinders merged per tool; simple materials or the
   world material via vertex attributes — your choice; keep it PS2-styled but clean), rendered in
   a separate rendering group that never clips into walls (per the notes), with idle bob, sway
   from mouse movement, walk bob, charge pose (wind back + slight tremble at full charge), swing
   animation synced with the strike logic, recoil animation on hard hits, tool switch animation
   (lower/raise), lowered when the player holds an object.
6. Probes: swing at a static box and a light dynamic box with a stub destruction that records
   strike() calls (verify hit timing, point near the surface, velocity magnitude ≈ def speed),
   charged vs normal swing energies, kick/stomp sweeps, pry calls, viewmodel screenshots for each
   tool (and one with the tool pushed into a wall to prove no clipping).
