# Brief: render environment (`src/render/{lighting,postfx,exterior,atmosphere,sky}.ts`)

Owner paths: `src/render/lighting.ts`, `src/render/postfx.ts`, `src/render/exterior.ts`,
`src/render/atmosphere.ts`, `src/render/sky.ts` (+ helpers under `src/render/env/`),
`tests/probes/render-env-*.probe.ts`. Read first: `docs/api-notes/rendering-lighting-post.md`,
`docs/api-notes/rendering-materials-geometry.md`, `src/render/contracts.ts`, `src/world/plan.ts`,
`src/core/settings.ts`. The render-core agent (concurrent) owns `renderSystem.ts`/materials/
batching and will construct your classes exactly as described in `contracts.ts`.

Implement:
1. `class Lighting implements ILighting` (`new Lighting(scene, settings)`): golden-hour sun —
   DirectionalLight from the west-south-west (azimuth so light enters the south and east windows
   at a low angle; elevation ≈ 12–15°), warm colour (≈ #ffb36b at the window, intensity tuned for
   the chosen world material — PBR/Standard), cascaded shadows (CSM when supported; stable,
   PCF/PCSS soft, bias tuned for thin geometry) covering the apartment bounds (x 0..12.8,
   z −1.6..8.8, y 0..2.7; furniture up to ~2 m) with quality-driven map size/cascades; skylight
   hemispheric fill (cool zenith/warm ground bounce), and interior lights management: add/remove
   lights, per-material light-count limit handled by room-based assignment (each registered
   receiver mesh gets the lights of its room + adjacent rooms via `src/world/plan.ts` `roomAt`,
   reassigned periodically for moving meshes) or Babylon's clustered lighting if the notes show it
   works with our material; `flicker(light, s)`; `setPower(on)` (mains lights off, expose
   `powered`); point-light shadows for up to `quality.pointShadows` lights nearest the player.
   `registerReceiver/unregisterReceiver` (receiveShadows + light assignment).
2. `class PostFX implements IPostFX` (`new PostFX(scene, camera, settings)`):
   DefaultRenderingPipeline (ACES tone mapping, exposure/contrast tuned for golden hour, bloom on
   HDR emissive, FXAA, subtle grain + vignette, very slight chromatic aberration), SSAO2 (quality
   gated, tuned for interiors at metre scale), PS2 mode (low internal resolution ≈ 640×448 with
   NEAREST upsampling, 4×4 Bayer ordered dithering, 15-bit colour quantisation, optional subtle
   interlace) toggled at runtime, camera shake (trauma → trauma² scaled smooth noise offsets for
   position/rotation; decays), screen flash (overlay colour fading out). Resolution scale from
   quality (`engine.setHardwareScalingLevel`).
3. `class Exterior implements IExterior` (`new Exterior(scene, lighting)`): golden-hour sky dome
   (gradient: deep blue zenith → peach/orange horizon, brighter around the sun), sun disc + glow
   billboard aligned with the sun light, a few soft cloud billboards, a low-poly CITY: hundreds of
   buildings in a ring 60–900 m away (merged/instanced boxes with stepped tops, varied heights,
   `city_windows`-style emissive window textures — generate your own texture/material here; the
   world material isn't required), OUR TOWER around the apartment (concrete slab edges and
   balconies of the floors above/below visible from the windows, neighbouring units' windows on
   the same facade), a street grid ≈ 93 m below (31 floors × 3 m) with roads, tiny cars and
   streetlights (static), distance haze (fog or vertex colour fade). Few draw calls (merge),
   no shadow casting except the tower facade near the apartment. Must look good through the
   windows and from the balcony at golden hour.
4. `class Atmosphere implements IAtmosphere` (`new Atmosphere(scene, lighting)`): PS2-style fake
   volumetric light shafts: for each exterior opening (`WALLS` openings of kind window/slidingDoor
   in plan.ts) build an additive translucent prism extruded from the opening along the sun
   direction into the room, with gradient falloff (alpha fades with distance and at the edges),
   subtle animated dust noise; floating dust mote particles in the sunlit volumes; `setEnabled`
   per quality; cheap.
5. Probes + screenshots: a stand-in room (boxes) with a window opening on the south wall to tune
   sun angle/shadows/shafts, the exterior view through the window, PS2 mode on/off, SSAO on/off.
   Look at the screenshots critically and iterate until it reads as a warm, cinematic golden-hour
   interior (not overexposed, readable shadows, visible shafts).
