# Brief: render core (`src/render/` core files)

Owner paths: `src/render/renderSystem.ts`, `src/render/textures.ts`, `src/render/proctex/**`,
`src/render/worldMaterial.ts`, `src/render/batch.ts`, `src/render/glass.ts`,
`src/render/screens.ts`, `src/render/surfaces.ts` (append surfaces / tune numbers only),
`tests/probes/render-core-*.probe.ts`. NOT yours (render-env agent, concurrent):
`lighting.ts`, `postfx.ts`, `exterior.ts`, `atmosphere.ts`, `sky.ts`.
Read first: `docs/api-notes/rendering-materials-geometry.md` (the verified texture-array material
plugin — reuse its code), `docs/api-notes/rendering-lighting-post.md`, `src/render/contracts.ts`,
`src/render/surfaces.ts`, `src/geom/meshgen.ts` (RenderGeom), `src/core/context.ts`.

Implement `RenderSystem` as `class Render` in `src/render/renderSystem.ts` with
`export async function createRender(opts: { engine: Engine; scene: Scene; settings: Settings;
onProgress?: (p: number, label: string) => void }): Promise<Render>`:
1. Camera: create the `UniversalCamera` (no attachControl, minZ 0.03, maxZ 3000, fov from
   settings (vertical degrees), inertia 0) and make it `scene.activeCamera`.
2. Textures (`textures.ts`): load `public/assets/textures/manifest.json` (CC0 photo textures
   being downloaded by another agent; fetch relative to `import.meta.env.BASE_URL` so the build
   works from any path; tolerate a missing manifest or missing files by falling back to
   procedural generation), decode JPGs (createImageBitmap → canvas → getImageData) and build
   texture arrays at 256×256: albedo RGBA (rgb = albedo in sRGB, a = roughness) and normal RGBA
   (OpenGL convention), with mipmaps, trilinear filtering, anisotropy 4–8, REPEAT wrap. Map every
   surface in `SURFACES` to (albedoLayer, normalLayer) — several surfaces may share a texture.
3. Procedural textures (`proctex/`): implement every `proc:*` generator referenced in
   `surfaces.ts` as 256×256 canvas art in a convincing late-PS2 style: glass (faint streaks),
   glass_frosted, glass_edge (green-tinted edge), mirror (soft bright gradient), lcd (black
   glossy with faint pixel grid), pcb (green board, copper traces, pads, silkscreen), ic_chip,
   white, display_digits ("12:00" seven-segment), panel_microwave (dark display + labelled
   button grid), panel_appliance (knob markings/labels), keycaps (key grid with legends), grille
   (perforated/mesh), book_cover_0..3 (varied colours/titles/spines), book_pages (paper edge
   lines), painting_0/1 (procedural landscape + abstract), poster_0, photo_0, rug_pattern
   (persian-like), clock_face, label_food (cereal/can labels), label_bottle, city_windows (grid of
   windows, some warmly lit — emissive), scorch, paper_printed (text lines). Also generate
   procedural fallbacks for every photo texture name (wood grain, tiles, concrete, fabric, …) so
   the game looks decent even without downloaded assets. Normal maps: derive from luminance
   height where sensible, else flat.
4. World material (`worldMaterial.ts`): ONE shared material (PBR preferred if the notes say
   per-vertex roughness/metallic injection works; else Standard) with a MaterialPluginBase plugin
   sampling the texture arrays via per-vertex attributes. Vertex layout (document it at the top of
   `batch.ts`; the VFX agent will reuse it for micro-debris thin instances with per-instance
   attributes of the same names): `position`, `normal`, `uv` (texture repeats), `color` (vec4
   linear tint), `surf` (vec4: x = albedo layer, y = normal layer, z = roughness 0..1,
   w = metallic + 2·emissive? — choose a clean packing; emissive must reach HDR > 1 so bloom
   catches screens/bulbs/LEDs, and must be switchable off by power loss → expose
   `setPowered(on)` uniform that scales emissive of surfaces flagged mains-powered, or rebuild).
   Must receive cascaded sun shadows, interior point lights, fog, SSAO, environment reflections.
   Also support the same attributes as thin-instance (per-instance) buffers.
5. Batching (`batch.ts`): `buildIsland(node, geoms, prev, name)`: concatenate RenderGeoms (island
   frame = node-local) into an opaque mesh (world material) + a glass mesh (surfaces with
   `transparent`) parented to node; convert uv metres → repeats by `worldSize`, surface → layers/
   params, tint × surface tint (sRGB → linear) → color; reuse/update GPU buffers when `prev` has
   enough capacity, else recreate; refreshBoundingInfo; register with Lighting as receiver and
   shadow caster (large if bbox diagonal > 1.5 m); `isPickable = false`; dispose cleanly.
   Target ≤ 0.25 ms per 1000 vertices. `disposeIsland`.
6. Glass (`glass.ts`): transparent glass material (tinted, fresnel reflections from the
   environment, specular highlights, slight thickness edge tint) that looks good for windows,
   picture frames, screens' cover glass and shards; sorting acceptable with many shards.
7. Screens (`screens.ts`): `createScreen(scene, mesh | part placement, kind)` returning a handle
   with `setState("on" | "off" | "cracked" | "dead")`: a DynamicTexture-based emissive material
   with animated content per kind (tv: procedural "nature documentary" scenes / colour bars /
   static; monitor: desktop UI with windows; laptop: code editor; microwave: clock digits);
   cracked = spiderweb overlay + glitch bands + colour bleed; dead = black. Updates throttled
   (e.g. 15 fps), cheap. The destruction runtime places screen meshes for `screen` features
   using the feature part's face (document the expected API clearly).
8. Integration: construct Lighting/PostFX/Exterior/Atmosphere (render-env agent) per
   `src/render/contracts.ts` (import from `./lighting.ts` etc.); delegate the RenderSystem methods
   (`setShadowCaster`, `addLight`, `removeLight`, `setPower`, `shake`, `getShake`, `flash`,
   `setPS2Mode`, `applyQuality`, `update`). `captureEnvironment()`: build a reflection environment
   (ReflectionProbe render of the apartment interior once, or a generated cube texture) and assign
   `scene.environmentTexture` / material reflection; cheap at runtime. Until render-env files
   exist, keep your probes self-contained.
9. Probes + screenshots (look at them critically): every surface on a grid of cubes (texture
   array, tiling, normals, roughness, metallic), glass, emissive bloom, shadows from a sun, a
   batched island built from synthetic RenderGeoms, a screen in each state, and perf numbers
   (buildIsland timing).
