# Brief: VFX (`src/vfx/**`)

Owner paths: `src/vfx/**`, `tests/probes/vfx-*.probe.ts`. Read first: `docs/api-notes/vfx-audio.md`,
`docs/api-notes/rendering-materials-geometry.md`, `src/core/context.ts` (VfxSystem, VfxKind),
`src/core/events.ts`, `src/destruction/model/materials.ts` (DustKind, MicroKind), `src/render/surfaces.ts`.

Implement `VfxSystem` as `class Vfx` in `src/vfx/vfx.ts` with
`export function createVfx(opts: { scene: Scene; events: EventBus<GameEvents>; settings: Settings;
groundProbe: (x: number, y: number, z: number) => number | null; worldMaterial?: Material }): Vfx`
(`groundProbe` returns the height of the first surface below a point, provided by the integrator
via physics raycasts; `worldMaterial` = the shared texture-array material from render-core, see
its vertex layout documented at the top of `src/render/batch.ts`).

1. Particle effects (pooled CPU ParticleSystems, one or a few per kind, procedural textures —
   soft puffs, streaks, glints, droplets, feathers): dust (generic puff), drywallDust (big, slow,
   white-grey billowing cloud that hangs and settles), concreteDust (grey, heavier), woodChips,
   splinters (thin elongated), sparks (bright additive streaks with gravity, short), glassGlitter
   (tiny sparkly bits with flicker), water (continuous spray with droplets + mist), waterDrip,
   smoke (electrical, dark, rising), feathers (slow tumbling fall), foam (yellow crumbs),
   paper (scraps fluttering), soil (dark crumbs), ceramicChips, plasticBits, insulationFluff,
   liquid (splash, tinted), extinguisher (white cone cloud). `burst(kind, pos, normal, intensity,
   {tint, dir})` must support many bursts per frame at different positions (pooled burst queue as
   verified in the notes); counts scaled by intensity and `settings.quality.particles`; global
   particle budget with graceful degradation. Particles should be tinted by the local light level
   roughly (sample scene brightness or just keep them muted) so dust doesn't glow in the dark.
   `emitter(kind, pos, dir, rate)` continuous handles (water spray from broken pipes follows a
   moving island: setPosition each frame).
2. Event reactions (subscribe in createVfx): `fracture` (dust by material dust kind sized by
   brokenVolume/energy; glass glitter for glass; splinters for wood; sparks for pcb/lcd),
   energetic `impact` (small dust puff of the softer material; sparks for metal-on-metal/concrete
   at high speed), `chip`, `bondBreak` (splinters/dust/sparks by kind), `toolHit` (small burst),
   `feature` (sparks, waterStart/stop handled via emitters by destruction; lightBroken = glass +
   sparks), `land` on soft floors (tiny dust).
3. Micro-debris (`micro(kind, pos, vel, size, surf, tint)`): no physics bodies; thin instances
   (or SPS per notes — pick the faster) of a handful of generic low-poly chunk meshes per kind
   (shard: thin irregular plate; chip; splinter: elongated; crumb; cube for tempered glass)
   scaled by size, rendered with the world material using per-instance `surf` + `color` (same
   attribute names as the world vertex layout) so they look like the parent material; ballistic
   motion with gravity, air drag, tumbling rotation, bounce with restitution/friction against the
   ground height from `groundProbe` (probe at spawn and on landing; cache per particle), settle
   and freeze (persistent debris on the floor); hard cap `settings.quality.microDebrisMax`
   (recycle the oldest settled first); total update ≤ 1 ms for 5000 particles (only moving ones
   are updated; settled ones untouched; buffer updates only for changed ranges if possible).
4. Decals (`decal(kind, pos, normal, size)`): impact marks, scorch, puddles (water spreading
   slowly when a water feature runs: grow over time), crack decals; cheap quads offset along the
   normal with polygon offset, capped count (recycle oldest).
5. `fixedUpdate(dt)` (micro-debris sim), `update(dt)` (particle bookkeeping), `particleCount`,
   `microCount`.
6. Probes + screenshots: each burst kind in a row, 3000 micro-debris pieces falling onto a floor
   and settling (timing), water emitter, decals. Look at screenshots critically.

## Addendum (vfx-audio notes landed)
- Particle time: set `ps.updateSpeed = gameDt / scene.getAnimationRatio()` each frame for SI units.
- Never use disposeOnStop on systems sharing a texture (it disposes the texture); dispose(false).
- New systems need one event-loop turn + a particleTexture before running; pre-fill pools at load.
- Micro-debris: thin instances with dynamic buffers, doNotSyncBoundingInfo, alwaysSelectAsActiveMesh.
- CreateDecal needs normals and is costly on big meshes; decal maps unusable with our UVs.
