# Rendering: lighting, shadows, post-processing, environment, instrumentation
Babylon.js **9.30.0** (`@babylonjs/core`), WebGL2. Every import comes from the package root: `import { X } from "@babylonjs/core";`.

**TL;DR**
1. **Sun:** use **one `ShadowGenerator`** (2048, or 4096 on Ultra) with PCF medium, `bias 0.0005`, **`normalBias 0.02`** and tight light-space Z: `sun.autoCalcShadowZBounds = true`, or a fixed frustum. The low sun gives grazing-angle acne without `normalBias`. `CascadedShadowGenerator` works, but it costs casters × cascades draw calls, and its `autoCalcDepthBounds` killed every shadow in our run.
2. **Lights:** Standard and PBR both default to `maxSimultaneousLights = 4`; extra lights are silently dropped. Raising it to cover 15 lights **fails to link** (each light is one vertex UBO; `GL_MAX_VERTEX_UNIFORM_BUFFERS` is 14 here, and the WebGL2 minimum is 12), and then `whenReadyAsync()` never resolves.
3. **`ClusteredLightContainer` exists and works** on WebGL2 with Standard and PBR. All 15 lights were lit, it takes **one** light slot, and it costs **+1 draw call**. Point and spot lights only, and no shadows. For PBR set `useGLTFLightFalloff = true`, or you get hard tile seams. `light.setEnabled(false)` does **not** turn a clustered light off; use `intensity = 0`.
4. **SSAO2 works** on WebGL2 through the prepass renderer (no extra geometry pass, +5 post passes). Create it **before** the `DefaultRenderingPipeline`. Pass `Constants.TEXTURETYPE_HALF_FLOAT`: the default 8-bit type clamps HDR and weakens bloom. With SSAO2 present, MSAA comes from `ssao.textureSamples`, and `drp.samples` is ignored.
5. **Any `DefaultRenderingPipeline` rebuild** (toggling any `*Enabled`, or `samples`) re-appends its post-processes at the end of the camera chain. Custom post-processes such as PS2 must be moved back with an `onBuildObservable` hook. `drp.imageProcessing` is recreated on every rebuild, so configure `scene.imageProcessingConfiguration` instead.
6. **PS2 mode:** one `PostProcess` with a fixed input size `{width:640,height:448}`, NEAREST sampling, 4×4 Bayer dither and 5-bit quantisation (§4). Output and order are verified. A cheaper alternative is `engine.setHardwareScalingLevel(h/448)` plus CSS `image-rendering: pixelated`.
7. **Glow:** prefer **bloom from HDR emissive** (>1, `bloomThreshold = 1`): it is free and occlusion-correct. `GlowLayer` and `HighlightLayer` re-render every active mesh, and `GlowLayer` with `includedOnly` glows **through walls**. For grab highlights use `renderOutline` (+2 draws) or `renderOverlay` (+1).
8. **Light shafts:** VLS works but needs the sun disc on screen, re-renders the scene and washes the image out. Use fake additive shaft prisms instead (§6). **Environment:** a `ReflectionProbe` of the sky dome rendered once and assigned to `scene.environmentTexture` works offline, with irradiance computed automatically. `createDefaultEnvironment()` loads from a CDN, so don't use it.
9. **Instrumentation:** `SceneInstrumentation.drawCallsCounter` resets per frame only while an instance exists. `capturePhysicsTime` only works if set **after** `enablePhysics`. `engine.getFps()` only updates under `runRenderLoop`. GPU timers read 0 under SwiftShader.

Markers: **[RT]** = verified at runtime by a probe here; **[SRC]** = read in the installed sources only.
Probes: `tests/probes/render-lighting-*.probe.ts`. Shared code: `render-lighting-util.ts`, `render-lighting-room.ts` (test room) and `render-lighting-scene.ts` (full showcase: PS2 post-process, sky dome, light shaft).
Test box: headless Chromium, SwiftShader WebGL2, 1280×720. Treat millisecond timings as meaningless; draw calls are the reliable cost metric.
Caps [RT]: maxTextureSize 8192, MSAA 4, float and half-float render plus linear filtering, `colorBufferFloat`/`blendFloat` true, `shaderFloatPrecision` 23, vertex UBO limit 14. `caps.maxUniformBuffersPerShaderStage` is **undefined on WebGL**, so Babylon does not auto-clamp light counts.

---
## 1. Shadows

### 1.1 Signatures [SRC]
```ts
new ShadowGenerator(mapSize: number, light: IShadowLight, usefullFloatFirst?: boolean, camera?: Camera|null, useRedTextureType?: boolean, forceGLSL?: boolean)
new CascadedShadowGenerator(mapSize: number, light: DirectionalLight, usefulFloatFirst?: boolean, camera?: Camera|null, useRedTextureType = true)
sg.addShadowCaster(mesh, includeDescendants = true) / sg.removeShadowCaster(mesh, includeDescendants = true)
sg.getShadowMap(): RenderTargetTexture | null      // .renderList (the casters), .refreshRate, .resetRefreshCounter()
sg.bias; sg.normalBias; sg.darkness (0 = black shadow, 1 = no shadow); sg.filter; sg.filteringQuality (ShadowGenerator.QUALITY_HIGH=0 | MEDIUM=1 | LOW=2)
sg.usePercentageCloserFiltering (filter 6) | usePoissonSampling (2) | useContactHardeningShadow (PCSS, 7) | useBlurExponentialShadowMap ...
sg.contactHardeningLightSizeUVRatio; sg.transparencyShadow; sg.enableSoftTransparentShadow; sg.forceBackFacesOnly; sg.frustumEdgeFalloff
mesh.receiveShadows = true            // per receiving mesh, default false
light.shadowEnabled / scene.shadowsEnabled  // false = shadow map not rendered at all [SRC]
// DirectionalLight shadow framing
sun.position (view origin of the shadow camera!)  sun.autoUpdateExtends (true)  sun.autoCalcShadowZBounds (false)
sun.shadowFrustumSize (0 = auto-fit; >0 = fixed square ortho centred on sun.position)  sun.shadowOrthoScale (0.1 padding)
sun.shadowMinZ / sun.shadowMaxZ (undefined => camera.minZ / camera.maxZ)  sun.orthoLeft/Right/Top/Bottom (used when autoUpdateExtends=false)
// CSM
csm.numCascades (2..4, default 4)  csm.lambda (0.5)  csm.stabilizeCascades (false)  csm.shadowMaxZ (default camera.maxZ)
csm.cascadeBlendPercentage (0.1)  csm.depthClamp (true)  csm.autoCalcDepthBounds (false)  csm.penumbraDarkness (1)  csm.debug
csm.setMinMaxDistance(min, max)  csm.freezeShadowCastersBoundingInfo  csm.splitFrustum()
```
**Defaults [RT]:**
- `ShadowGenerator`: bias 5e-5, normalBias 0, darkness 0, filter NONE, quality HIGH, half-float map, refreshRate 1 (every frame).
- `CascadedShadowGenerator`: filter **PCF** (only NONE, PCF and PCSS are accepted; anything else logs an error and uses NONE), 4 cascades, lambda 0.5, red texture.
- `DirectionalLight`: `position = -direction` (1 m from the origin), auto-fit ortho, Z range = camera range.

**Bias is in normalised light depth.** Effective world bias = `bias × (shadowMaxZ − shadowMinZ)` [SRC, ortho]. With the default camera range (maxZ 10000), 5e-5 is 0.5 m and causes peter-panning. With tight bounds (about 10 m) it is 0.5 mm and causes acne.

### 1.2 Sun through a window: measured comparison [RT] (`render-lighting-shadows.probe.ts`)
Setup: 5×4×3 m room, window 1.5×1.3 m, sun at azimuth 225° and elevation 20°. A top-down render is scored against ray-cast ground truth. There were 29 fully lit and 742 fully shadowed floor samples (penumbra excluded). The **30** "shadow rendered bright" samples are identical in every shadowed variant, including hard-shadow defaults and CSM, so they are an artefact of the metric, not of any technique. They are not occluded from the camera (checked); most likely they are 3×3-pixel samples bordering the sunlit east wall.

| variant (2048 unless noted) | lit median | shadow median | lit→dark | shadow→bright | draw calls |
|---|---|---|---|---|---|
| no shadows | 101 | 102 | 29 | 414 | 13 |
| defaults (no filter, Z = camera 0.05..200) | 101 | 65 | 0 | 30 | 27 |
| PCF med + `autoCalcShadowZBounds`, bias 5e-5 | **85 (acne)** | 65 | 0 | 61 | 27 |
| … bias 5e-4 | 88 (acne) | 65 | 0 | 39 | 27 |
| … bias 5e-4 + **normalBias 0.02** | **101** | 65 | 0 | 30 | 27 |
| PCF high, or 1024 map, same biases | 101 | 65 | 0 | 30 | 27 |
| PCSS (`contactHardeningLightSizeUVRatio` 0.02) | 101 | **79 (lighter)** | 0 | 99 | 27 |
| fixed frustum 14 m, Z 5..40, bias 5e-4, nb 0.02 | 101 | 65 | 0 | 30 | 27 |
| CSM ×3, lambda 0.9, shadowMaxZ 20, bias 2e-3/5e-4, nb 0.02 | 101 | 65 | 0 | 30 | **55** |
| CSM ×3 + `autoCalcDepthBounds` | 101 | 102 | **all shadows gone** | 377 | **79** |

Recommended sun shadow (it renders clean in the screenshots):
```ts
const sun = new DirectionalLight("sun", dir, scene);         // dir = from the sun towards the scene
sun.position = apartmentCentre.subtract(dir.scale(20));      // shadow camera origin: upstream of the casters
sun.autoCalcShadowZBounds = true;                            // tight Z, OR fixed: sun.shadowFrustumSize = 18; sun.shadowMinZ = 5; sun.shadowMaxZ = 40;
const sg = new ShadowGenerator(2048, sun);                   // 4096 on Ultra; 2048 over 18 m is about 9 mm per texel
for (const m of casters) sg.addShadowCaster(m, false);
sg.usePercentageCloserFiltering = true;
sg.filteringQuality = ShadowGenerator.QUALITY_MEDIUM;
sg.bias = 0.0005;
sg.normalBias = 0.02;
for (const m of receivers) m.receiveShadows = true;
```
- With `autoUpdateExtends` (the default), the ortho box is refitted **every frame** to the bounding boxes of **all** casters: an O(n) CPU cost, and it grows if one caster falls off the balcony. For thousands of debris pieces prefer a fixed frustum (`shadowFrustumSize > 0`), or set `orthoLeft/Right/Top/Bottom` with `autoUpdateExtends = false` [SRC].
- **CSM:** use it only if distant exterior shadows matter. `shadowMaxZ` must be about 20–30 m for interiors; the default is camera.maxZ. The setter **silently ignores** values outside `[camera.minZ, camera.maxZ]`: setting 500 with maxZ 200 left it at 20 [RT]. It needs a camera at construction or when the setter runs [SRC]. `autoCalcDepthBounds` adds a full depth pre-pass (+24 draws) and broke shadows here [RT]: avoid it.

### 1.3 Point and spot shadows [RT] (`render-lighting-costs.probe.ts`, room with 14 casters, baseline 15 draws)
| | draw calls |
|---|---|
| + sun `ShadowGenerator` | +14 (one pass) |
| + `PointLight` `ShadowGenerator(512)` (cube) | **+84 = 6 faces × 14** |
| same with `getShadowMap().refreshRate = 0` | +0 after the first frame |
| + `SpotLight` `ShadowGenerator(1024)`, PCF | +14 |

- On a point light, `usePercentageCloserFiltering = true` (or PCSS) **silently becomes Poisson** (`filter` reads 2), and blur-ESM falls back to plain ESM [RT/SRC].
- Shadow-casting lights cannot join a `ClusteredLightContainer` (§2).

### 1.4 Casters, refresh and disposal
- **On-demand static shadows [RT]** (`render-lighting-refresh.probe.ts`): with `sg.getShadowMap()!.refreshRate = RenderTargetTexture.REFRESHRATE_RENDER_ONCE` (0), draw calls went 27 → 13 from frame 2. Moving the table left a stale shadow. `getShadowMap()!.resetRefreshCounter()` re-rendered it on the next frame (one 26-draw frame, then back to 12) and the shadow updated. Use this for "sun static, nothing awake near windows".
- `mesh.dispose()` removes the mesh from every shadow `renderList` of lights in `scene.lights` [SRC].
- **Alpha-blended meshes in the render list are skipped** unless `sg.transparencyShadow = true`, so window glass does not block the sun [SRC].
- `sg.customAllowRendering = (subMesh) => boolean` filters casters per submesh [SRC].

---
## 2. Light count limits and clustered lighting

### 2.1 `maxSimultaneousLights` [RT] (`render-lighting-clustered.probe.ts`: 15 point lights, range 3, over a floor)
- Default is **4** for `StandardMaterial` and `PBRMaterial`. Only the first 4 of `mesh.lightSources` (in `scene.lights` order) shade; the rest are silently dropped. StdMaterial lit 4 of 15 pools.
- `mat.maxSimultaneousLights = 8 / 11 / 12` compiled and lit 8, 11 and 12 pools. **16 with 15 lights failed**: `VERTEX shader uniform block count exceeds GL_MAX_VERTEX_UNIFORM_BUFFERS (14)`, then 14 "Trying next fallback" attempts, and `scene.whenReadyAsync()` **never resolved**.
- Every light is one vertex UBO, on top of the scene, mesh and material UBOs. The WebGL2 minimum guarantee is 12, so **keep `maxSimultaneousLights` ≤ 8** for portability.
- **PBR range:** with physical falloff (the PBR default), `range` does **not** limit the light. A 4-light PBR floor was lit well beyond `range`.

### 2.2 `includedOnlyMeshes` / `excludedMeshes` [RT]
`light.includedOnlyMeshes.push(meshA)` makes `meshA.lightSources = [p]` and `meshB = []`. Assigning `light.includedOnlyMeshes = []` re-includes everything. `excludedMeshes.push(b)` removes the light from `b` only. There is no distance culling: every mesh gets every enabled light unless filtered (`canAffectMesh`) [SRC]. `includeOnlyWithLayerMask` and `excludeWithLayerMask` also exist [SRC].

### 2.3 `ClusteredLightContainer` (forward+): the way to run about 15 interior lights
```ts
new ClusteredLightContainer(name: string, lights?: Light[], scene?: Scene)   // extends Light
container.addLight(light) / container.removeLight(light): number   // removeLight puts the light BACK into scene.lights as a normal light
container.lights; container.isSupported; ClusteredLightContainer.IsLightSupported(light)
container.horizontalTiles = 64; container.verticalTiles = 64; container.depthSlices = 16; container.maxRange = 16383   // defaults [RT]
```
**Verified [RT]:**
- Supported on this WebGL2 (batch size 23 = `shaderFloatPrecision`; 8 on mobile; 0 = unsupported) [SRC].
- 15 lights in one container, materials at the **default maxSimultaneousLights = 4**: Standard lit **15/15 pools** (uniform 64), PBR lit 15/15.
- `scene.lights` became `[hemi, cluster]`, so the container uses **one slot** and the sun and hemi stay ordinary lights.
- Cost: +1 draw call per frame (the tile-mask pass).
- Works together with the sun `ShadowGenerator`, SSAO2 prepass, the DRP and the PS2 post-process (showcase).
- Lights parented to a moving `TransformNode` follow it: the pool moved with the node.
- Light data is re-uploaded every frame, so intensity changes (flicker) apply immediately.

**Gotchas [RT]:**
- `light.setEnabled(false)` on a clustered light: **still lit** (64 → 64). `light.intensity = 0` turns it off. `container.removeLight(l)` turns it back into a normal scene light (still lit), so follow it with `l.dispose()` or `l.setEnabled(false)`.
- **PBR + physical falloff → hard seams.** Tile culling is by screen-space light bounds, but physical inverse-square light never reaches 0. With range 2, light was 55 at d = 2.79 and **0** at d = 2.97, along a straight vertical cut (screenshot). Fix: `pbr.useGLTFLightFalloff = true`, which windows smoothly to 0 at `range` (identical clustered and unclustered). Or use StandardMaterial, whose linear falloff `1 − d/range` reaches 0 at range.
- `PointLight.range` defaults to `Number.MAX_VALUE`, so **always set `range`**: it bounds the clusters, and with GLTF/Standard falloff it is the visible radius.
- Refused (warning; the light stays normal): any light with a shadow generator, `falloffType ≠ FALLOFF_DEFAULT` (so use the **material** flag `useGLTFLightFalloff`, not `light.falloffType`), and spot lights with projection or IES textures [RT/SRC]. `includedOnlyMeshes`/`excludedMeshes` are ignored for clustered lights [SRC].
- Clustered and unclustered shading are identical for StandardMaterial and for PBR with GLTF falloff: the radial profiles matched pixel for pixel (`render-lighting-falloff.probe.ts`). The 64 vs 54 above is just the 0.05 hemi fill (10) added in the clustered run.

**Recommendation:** world material = PBR with `useGLTFLightFalloff = true` and `maxSimultaneousLights = 6`. Lights = sun (shadows) + hemi + **one** `ClusteredLightContainer` for every non-shadowed interior light (`range` 4–6 m), plus at most 1–2 shadowed point lights on High/Ultra.

---
## 3. Post-processing

### 3.1 `DefaultRenderingPipeline` [RT unless marked]
```ts
new DefaultRenderingPipeline(name = "", hdr = true, scene?, cameras?: Camera[], automaticBuild = true)
// defaults [RT]: samples 1, fxaaEnabled false, bloomEnabled false, bloomThreshold 0.9, bloomWeight 0.15, bloomKernel 64, bloomScale 0.5,
// imageProcessingEnabled true, sharpenEnabled false (sharpen.edgeAmount 0.3, colorAmount 1), grainEnabled false (grain.intensity 30, animated false),
// chromaticAberrationEnabled false (aberrationAmount 30, radialIntensity, direction, centerPosition), depthOfFieldEnabled false, glowLayerEnabled false.
// hdr=true => half-float textures (type 2) when supported.
drp.onBuildObservable  drp.prepare()  drp.dispose()  drp.addCamera(cam)/removeCamera(cam)
```
- **Chain order** [RT]: `[DoF] → bloom (highlights, h blur, v blur, bloomMerge) → imageProcessing → [sharpen] → grain → [chromaticAberration] → fxaa`. Bloom runs on **linear HDR**, before tone mapping; the threshold is applied after `exposure` [SRC].
- **Every setter that toggles an effect, and `samples`, rebuilds the pipeline.** A rebuild detaches all its post-processes (leaving `null` holes in `camera._postProcesses`) and **re-appends them at the end** [RT].
- `drp.imageProcessing` is **a new object after every rebuild** (`ip1 !== ip2`) [RT]. Its getters and setters proxy `scene.imageProcessingConfiguration`, so **configure that** instead (values persisted across rebuilds).
- `samples = 4` gives MSAA on the pipeline's first post-process (edge test: 0 → 278 intermediate pixels). **Ignored when SSAO2/prepass is active** (stayed 0); use `ssao.textureSamples` (§3.3). FXAA: 313 intermediate pixels.
- `grain.intensity` adds ±intensity/255 in the mid-tones [SRC], so the default of 30 is heavy; 5–8 is subtle.
- DoF enables a scene depth renderer, an extra geometry pass [SRC].
- `glowLayerEnabled` creates a GlowLayer (see §5 for cost) [SRC].

### 3.2 `scene.imageProcessingConfiguration` (`ImageProcessingConfiguration`) [RT defaults]
`toneMappingEnabled` false; `toneMappingType` (`ImageProcessingConfiguration.TONEMAPPING_STANDARD=0 | TONEMAPPING_ACES=1 | TONEMAPPING_KHR_PBR_NEUTRAL=2`); `exposure` 1; `contrast` 1; `vignetteEnabled` false; `vignetteWeight` 1.5; `vignetteStretch` 0; `vignetteColor` Color4(0,0,0,0); `vignetteCameraFov` 0.5; `vignetteBlendMode` (`VIGNETTEMODE_MULTIPLY`/`OPAQUE`); `ditheringEnabled` false (`ditheringIntensity` 1/255); `colorCurvesEnabled`/`colorCurves`; `colorGradingEnabled`/`colorGradingTexture`; **new in 9:** `whiteBalanceEnabled` false, `temperature` 6500, `tint` 0; `isEnabled` true; `applyByPostProcess` (set by the pipelines).
Without a post-process pipeline, materials apply image processing in-shader [SRC].

### 3.3 `SSAO2RenderingPipeline` [RT unless marked]
```ts
new SSAO2RenderingPipeline(name: string, scene: Scene, ratio: number | { ssaoRatio: number; blurRatio: number }, cameras?: Camera[],
                           forceGeometryBuffer = false, textureType = 0 /* UNSIGNED_BYTE: pass Constants.TEXTURETYPE_HALF_FLOAT! */)
// defaults [SRC]: samples 8, totalStrength 1, radius 2, base 0, maxZ 100, minZAspect 0.2, epsilon 0.02, expensiveBlur true, bypassBlur false,
// bilateralSamples 16, bilateralSoften 0, bilateralTolerance 0, textureSamples 1. SSAO2RenderingPipeline.IsSupported === true here.
```
- **Works on WebGL2.** By default it calls `scene.enablePrePassRenderer()`: the scene renders once into an MRT (`prePassRenderer.enabled === true`) with **no extra geometry pass**. Cost: **+5 draw calls** (original colour, SSAO, blur H, blur V, combine).
- `forceGeometryBuffer = true` uses `GeometryBufferRenderer` instead, which is an extra geometry pass [SRC].
- Effect [RT]: floor/wall corner luminance 186 → 175 with totalStrength 1.2 and radius 0.6; open floor unchanged (65).
- A ShaderMaterial sky dome and an additive transparent mesh caused no artefacts with prepass on (screenshots).
- **HDR:** with the default `textureType` 0, the SSAO colour copy is 8-bit and **clamps HDR before bloom**: TV 241 → 202, bloom halo 128 → 101. With `Constants.TEXTURETYPE_HALF_FLOAT` the result is identical to no SSAO (128/241).
- **Order:** create SSAO2 **before** the DRP so its passes run on the HDR scene colour. Chain verified: `SSAOOriginalSceneColor, ssao, BlurH, BlurV, ssaoCombine, highlights…bloomMerge, imageProcessing, Grain, fxaa`.
- **MSAA:** `ssao.textureSamples = 4` sets `prePassRenderer.samples = 4` (edges 0 → 278). `drp.samples` does nothing here.
- **Runtime toggle:**
  - `scene.postProcessRenderPipelineManager.detachCamerasFromRenderPipeline("ssao", cam)` removes it and **disables the prepass automatically**.
  - `attachCamerasToRenderPipeline("ssao", cam)` re-appends it **after** the DRP and PS2 (wrong order). Follow it with `drp.prepare()`, which rebuilds and re-appends the DRP after SSAO; the `onBuildObservable` hook (§3.4) then moves PS2 last.
  - Quality presets can also just dispose and recreate it.
- **Newer AO in Babylon 9:** none (no GTAO/HBAO). Only legacy `SSAORenderingPipeline` and SSAO2. `IBLShadowsRenderPipeline` (voxel-traced environment shadows) and `GIRSMManager` (reflective-shadow-map GI) exist but were not evaluated [SRC].

### 3.4 Keeping custom post-processes in place [RT]
```ts
export function keepLast(camera: Camera, pp: PostProcess): void {
  const i = camera._postProcesses.indexOf(pp);
  if (i !== -1 && i !== camera._postProcesses.length - 1) { camera.detachPostProcess(pp); camera.attachPostProcess(pp); }
}
drp.onBuildObservable.add(() => keepLast(camera, ps2));
```
Without the hook, `drp.fxaaEnabled = false` produced `… ssaoCombine, ps2, highlights, …, Grain`: PS2 ran *before* bloom and tone mapping.
`PostProcess` has **no `enabled` flag**. Toggle with `camera.detachPostProcess(pp)` and `camera.attachPostProcess(pp)`; `attach` appends at the end (verified).
`camera.attachPostProcess(pp, insertAt?)` [SRC].

---
## 4. Custom full-screen PostProcess: PS2 mode [RT] (`render-lighting-scene.ts`, probe `render-lighting-scene-ps2.probe.ts`)
```ts
// Shader store keys: "<name>FragmentShader" or "<name>PixelShader" (and "<name>VertexShader"). Effect.ShadersStore === ShaderStore.ShadersStore.
// Unregistered names make Babylon try to fetch "<name>.fragment.fx" over the network [SRC].
Effect.ShadersStore["ps2FragmentShader"] = `
precision highp float;
varying vec2 vUV;                     // provided by the default "postprocess" vertex shader
uniform sampler2D textureSampler;     // previous stage
uniform vec2 lowRes; uniform float levels; uniform float ditherAmount;
float bayer4(vec2 p) {                // 4x4 ordered Bayer in [0,1): M2(x,y)=2*(x^y)+y ; M4=4*M2(lo)+M2(hi)
  vec2 q = mod(floor(p), 4.0); vec2 lo = mod(q, 2.0); vec2 hi = floor(q * 0.5);
  float a = 2.0 * abs(lo.x - lo.y) + lo.y; float b = 2.0 * abs(hi.x - hi.y) + hi.y;
  return (4.0 * a + b + 0.5) / 16.0;
}
void main(void) {
  vec2 px = floor(vUV * lowRes);
  vec3 c = texture2D(textureSampler, (px + 0.5) / lowRes).rgb;
  float t = mix(0.5, bayer4(px), ditherAmount);
  c = floor(clamp(c, 0.0, 1.0) * levels + t) / levels;      // levels 31 => 5 bits/channel (15-bit colour)
  gl_FragColor = vec4(c, 1.0);
}`;
// Positional ctor: (name, fragmentName, uniforms, samplers, size|ratio, camera, samplingMode, engine, reusable, defines?, textureType?, vertexUrl?...)
// size {width,height} is THIS post-process's INPUT texture size: the previous stage renders at 640x448, and NEAREST sampling gives the blocky upscale.
// (Options-object form: new PostProcess(name, frag, { uniforms, samplers, size: {width,height}, camera, samplingMode, engine }); it reads `size`, not width/height [SRC].)
const ps2 = new PostProcess("ps2", "ps2", ["lowRes", "levels", "ditherAmount"], null, { width: 640, height: 448 }, camera,
  Texture.NEAREST_SAMPLINGMODE, engine, false);
ps2.onApplyObservable.add((e) => { e.setFloat2("lowRes", 640, 448); e.setFloat("levels", 31); e.setFloat("ditherAmount", 1); });
drp.onBuildObservable.add(() => keepLast(camera, ps2));      // create AFTER the DRP; keep it last
// toggle: camera.detachPostProcess(ps2) / camera.attachPostProcess(ps2)
```
**Verified:**
- The final image's red channel took only the values 33, 41, 49, 58, 66, 74, 82… (multiples of 255/31).
- A 4× crop shows 2-px-wide blocks, the Bayer cross-hatch and stair-stepped edges, against smooth FXAA edges without PS2.
- Cost: +1 draw call.
- `ps2.width`/`height` read −1 until the first activation.
- If the PS2 post-process is the *only* one on the camera, the scene itself renders into the 640×448 input [SRC].

**Cheaper alternative [RT numbers]:** `engine.setHardwareScalingLevel(canvas.clientHeight / 448)` gave a render size of **796×448** (canvas client 1280×720). Then `canvas.style.imageRendering = "pixelated"` makes the browser upscale with NEAREST. Every pass, including SSAO and bloom, runs at low resolution. Run the dither post-process at ratio 1, with `lowRes` = the render size. In PS2 mode consider disabling FXAA, grain and SSAO.

---
## 5. Glow, bloom, highlight and outline costs [RT] (`render-lighting-costs.probe.ts`, `render-lighting-glowocclusion.probe.ts`, `render-lighting-misc.probe.ts`)
```ts
new GlowLayer(name, scene?, options?: Partial<IGlowLayerOptions>)  // options: mainTextureRatio 0.5, mainTextureFixedSize, blurKernelSize 32, camera,
  // mainTextureSamples, renderingGroupId -1, ldrMerge false, alphaBlendingMode, excludeByDefault false, generateStencilBuffer
glow.intensity (1)  glow.blurKernelSize (32)  glow.addIncludedOnlyMesh(m) / addExcludedMesh(m) / setExcludedByDefault(b)
glow.customEmissiveColorSelector = (mesh, subMesh, material, result: Color4) => {...}
new HighlightLayer(name, scene?, options?)  hl.addMesh(mesh, color: Color3, glowEmissiveOnly?)  hl.innerGlow / outerGlow / blurHorizontalSize
mesh.renderOutline = true; mesh.outlineColor; mesh.outlineWidth      mesh.renderOverlay = true; mesh.overlayColor; mesh.overlayAlpha
new SelectionOutlineLayer(name, scene?, options?)  sol.addSelection(meshOrMeshes); sol.clearSelection(); outlineColor/outlineThickness/occlusionStrength
```
| feature (15-mesh room, baseline 29 with sun shadows) | extra draw calls | notes |
|---|---|---|
| bloom from HDR emissive (`emissiveColor` > 1, or PBR `emissiveIntensity` 4) | 0 extra (part of the DRP's 4 bloom passes) | occlusion-correct; halo visible around the TV |
| `GlowLayer` (all meshes) | **+20** | re-renders **every** active mesh (black if not emissive) + blur passes |
| `GlowLayer` + `addIncludedOnlyMesh(screen)` | +6 | **glow shows through walls**: wall in front of a hidden bulb went 115 → 255 lum; all-meshes mode stayed 115 |
| `HighlightLayer`, 1 mesh | **+20** | renders all active meshes as occluders [SRC `_shouldRenderMesh`] |
| `SelectionOutlineLayer`, 1 mesh | +16/+17 | `useDepthOcclusion` defaults to true and calls `scene.enableDepthRenderer()`, a full geometry pass. **`dispose()` leaves that depth renderer running** (+14 draws until `scene.disableDepthRenderer()`). With `{ useDepthOcclusion: false }` it costs only **+2** (`render-lighting-soldispose.probe.ts`) |
| `renderOutline` on 1 mesh | **+2** | inflated back-face pass; uses the stencil only for alpha-blended meshes, so create the engine with `{ stencil: true }` if those get outlines [SRC] |
| `renderOverlay` on 1 mesh | **+1** | |

GlowLayer works with SSAO2 prepass active (glow luminance above the quad went 0 → 163) [RT].
**Recommendation:** use bloom (`bloomThreshold 1.0`, `bloomWeight 0.3–0.4`) with HDR emissive values for screens and bulbs. For the grab highlight use `renderOverlay` (subtle tint), `renderOutline`, or `SelectionOutlineLayer` with `{ useDepthOcclusion: false }` (+2 draws measured; its look was not checked visually).

---
## 6. Light shafts [RT] (`render-lighting-vls.probe.ts`, `render-lighting-shafts.probe.ts`)
```ts
new VolumetricLightScatteringPostProcess(name, ratio: number | { postProcessRatio, passRatio }, camera, mesh?: Mesh, samples = 100,
  samplingMode = Texture.BILINEAR_SAMPLINGMODE, engine?, reusable?, scene?)
vls.exposure (0.3) vls.decay (0.96815) vls.weight (0.58767) vls.density (0.926) vls.excludedMeshes / includedMeshes
vls.useCustomMeshPosition / setCustomMeshPosition(v)  vls.getPass(): RenderTargetTexture (renderList null => all meshes)
```
- VLS works on WebGL2 here. Created after SSAO and before the DRP, it sits between them in the chain.
- Its pass re-renders the active meshes (black occluders plus the light mesh): **+13 draws** in the showcase.
- It produces rays **only when the sun mesh is on screen**. Looking at the sun through the window gave visible radial rays and dark streaks behind the table leg, but also an overall veil and streaky walls (exposure 0.6). Off-screen sun gives nothing.
- **Recommendation: fake shafts (PS2 trick)**: an additive, unlit prism extruded from the window rectangle along the sun direction, depth-tested with no depth write and vertex alpha fading with distance. Cost: one transparent draw. Walls hide the parts that pass through them. Verified render:
```ts
// corners: window rectangle (4 x Vector3, in order); sunDir = sun.direction
const far = corners.map((c) => c.add(sunDir.normalize().scale(6)));
// 4 side quads: near verts colour (1,0.75,0.45, alpha 0.18), far verts alpha 0  -> VertexData { positions, colors, indices }.applyToMesh(mesh)
mesh.hasVertexAlpha = true;
const mat = new StandardMaterial("shaft", scene);
mat.disableLighting = true; mat.emissiveColor = Color3.White(); mat.diffuseColor = Color3.Black();
mat.backFaceCulling = false; mat.disableDepthWrite = true; mat.alphaMode = Constants.ALPHA_ADD; mat.alpha = 0.999; mat.fogEnabled = false;
```
The full helper is `createLightShaft()` in `render-lighting-scene.ts`. For production, soften the long edges (fade alpha towards the sides, or use a 1D gradient texture) and use a lower `nearAlpha` (0.08–0.12); the verified prism has crisp silhouette edges.

---
## 7. Environment, sky and fog

### 7.1 IBL without external files: `ReflectionProbe` of the sky dome [RT] (`render-lighting-env.probe.ts`)
```ts
new ReflectionProbe(name, size, scene, generateMipMaps = true, useFloat = false, linearSpace = false)
const probe = new ReflectionProbe("skyProbe", 128, scene, true, true, true);
probe.renderList!.push(skyDome);                                   // only the sky: 6 renders, once
probe.refreshRate = RenderTargetTexture.REFRESHRATE_RENDER_ONCE;
probe.position.set(0, 1, 0);
scene.environmentTexture = probe.cubeTexture;                       // PBR reflections + irradiance
scene.environmentIntensity = 0.3;                                   // global; per material: pbr.environmentIntensity
```
- With no lights, the rough PBR sphere's top showed sky (132,134,156); the chrome sphere reflected the zenith (116,146,195) and the SW sun glow on its west side.
- **Irradiance (`sphericalPolynomial`) is computed automatically** by an async GPU readback a few frames after the cube becomes ready.
- `scene.environmentIntensity = 0.5` dimmed it as expected.
- When the time of day changes, call `probe.cubeTexture.resetRefreshCounter()` and `probe.cubeTexture.forceSphericalPolynomialsRecompute()` [SRC].
- For interiors keep `environmentIntensity` low (0.2–0.4): IBL ignores walls.
- `scene.createDefaultEnvironment()` loads `https://assets.babylonjs.com/core/environments/*.env/.dds/.png`, so it is **unusable offline** [SRC].

### 7.2 CPU-generated `RawCubeTexture` [RT] (`render-lighting-cubeorient.probe.ts`)
```ts
new RawCubeTexture(scene, data: ArrayBufferView[] /* 6 faces */, size, format = Constants.TEXTUREFORMAT_RGBA, type = Constants.TEXTURETYPE_UNSIGNED_BYTE,
                   generateMipMaps = false, invertY = false, samplingMode = Texture.TRILINEAR_SAMPLINGMODE, compression = null)
// face order = [+X, -X, +Y, -Y, +Z, -Z] in Babylon WORLD axes (LH, +X east, +Z north). Texel direction (s,t in [-1,1], row 0 = first row in memory):
// +X:(1,-t,-s)  -X:(-1,-t,s)  +Y:(s,1,t)  -Y:(s,-1,-t)  +Z:(s,-t,1)  -Z:(-s,-t,-1)   with s = 2*(col+0.5)/size-1, t = 2*(row+0.5)/size-1
```
Every texel encoded its own direction. Viewed through a SKYBOX_MODE box, the worst dot product against the true camera ray was **0.999** over 30 rays in 6 directions. PBR reflections show the same face mapping (marker colours). Set `raw.gammaSpace = false` for linear data.

### 7.3 Gradient sky dome (`@babylonjs/materials` SkyMaterial is not installed) [RT]
`createSkyDome()` in `render-lighting-scene.ts` is a `ShaderMaterial` with `{ attributes: ["position"], uniforms: ["worldViewProjection", "sunDir", "zenith", "horizon", "ground", "sunColor"] }`, on `MeshBuilder.CreateSphere(..., { diameter: 400, sideOrientation: 1 })`. Settings: `infiniteDistance = true`, `backFaceCulling = false`, `disableDepthWrite = true`, `applyFog = false`. The fragment shader mixes horizon, zenith and ground by `dir.y` and adds `pow(dot(dir, sunDir), 8)` glow plus a `pow(…, 900) * 30` HDR disc that blooms. It renders fine with SSAO2 prepass. A ShaderMaterial receives **no fog** unless you implement it [SRC].

### 7.4 Fog [RT] (PBR far box, 60 m)
`scene.fogMode = Scene.FOGMODE_EXP2` (NONE 0, EXP 1, EXP2 2, LINEAR 3); `fogDensity` (default 0.1); `fogStart`/`fogEnd` (0/1000, LINEAR); `fogColor`.
EXP2 0.02 and LINEAR 10..80 both turned blue (121,121,227) into fog orange (226,152,111).
`material.fogEnabled = false` opts one material out, and `mesh.applyFog = false` opts one mesh out [SRC]. Use it for exterior haze only.

---
## 8. Instrumentation [RT] (`render-lighting-caps.probe.ts`, `render-lighting-misc.probe.ts`)
```ts
const si = new SceneInstrumentation(scene);
si.captureFrameTime = true;        si.frameTimeCounter            // whole scene.render()
si.captureRenderTime = true;       si.renderTimeCounter           // draw phase
si.captureCameraRenderTime = true; si.cameraRenderTimeCounter
si.captureActiveMeshesEvaluationTime = true; si.activeMeshesEvaluationTimeCounter
si.captureRenderTargetsRenderTime = true;    si.renderTargetsRenderTimeCounter  // shadow maps, probes, glow RTTs
si.captureParticlesRenderTime / captureSpritesRenderTime / captureAnimationsTime / captureInterFrameTime
si.capturePhysicsTime = true;      si.physicsTimeCounter          // ONLY after scene.enablePhysics()
si.drawCallsCounter                                               // = engine._drawCalls (PerfCounter)
const ei = new EngineInstrumentation(engine);
ei.captureGPUFrameTime = true;     ei.gpuFrameTimeCounter         // needs EXT_disjoint_timer_query: reads 0 under SwiftShader
ei.captureShaderCompilationTime = true; ei.shaderCompilationTimeCounter   // .total / .count worked (5 effects, 43 ms)
// PerfCounter: .current .average .lastSecAverage .min .max .total .count     PerfCounter.Enabled (static)
engine.getFps(); engine.getDeltaTime()     // updated by runRenderLoop only: 60 / 0 with manual scene.render() loops, about 63 / 16.4 under runRenderLoop
scene.getActiveMeshes().length; scene.getActiveIndices(); scene.getTotalVertices(); scene.getActiveParticles(); scene.getRenderId()
engine.getRenderWidth()/getRenderHeight(); engine.getHardwareScalingLevel()
```
- `drawCallsCounter.current` = draw calls of the **previous** frame, including shadow maps and post passes. The per-frame reset (`fetchNewFrame`) happens in SceneInstrumentation's `onBeforeAnimations` observer, so **it only advances while a `SceneInstrumentation` exists** [SRC+RT].
- `capturePhysicsTime = true` **before** `enablePhysics` reads back `false` (silently refused). After `enablePhysics` with `FixedStepper`-style `scene._advancePhysicsEngineStep(1000/60)`, it counted 30 steps (avg 1.7 ms here). It measures only steps that go through the scene (they fire `onBefore/AfterPhysicsObservable`); calling `physicsEngine._step` directly bypasses it [SRC].

---
## 9. Verified showcase setup (`render-lighting-scene.ts` → `buildShowcase()`)
Screenshots looked at: the normal frame and the PS2 frame (4× crops confirmed). Contents: sun patch on the floor and east wall with the table shadow, warm clustered pools, TV bloom, SSAO contact darkening, ACES, grain and vignette. Draw calls: 43 full; 38 without SSAO; 31 without SSAO and DRP; 44 with PS2.
```ts
const engine = new Engine(canvas, true, { stencil: true, preserveDrawingBuffer: true });
const camera = new FreeCamera("cam", pos, scene); camera.minZ = 0.05; camera.maxZ = 300;
// world materials: PBRMaterial { metallic 0, roughness 0.7-0.9, useGLTFLightFalloff: true, maxSimultaneousLights: 6 }; every mesh receiveShadows = true
const sun = new DirectionalLight("sun", sunDirection(225, 20), scene);       // warm (1,0.72,0.45), intensity 5 (PBR + ACES)
sun.position = roomCentre.subtract(sun.direction.scale(20)); sun.autoCalcShadowZBounds = true;
const sg = new ShadowGenerator(2048, sun); casters.forEach((m) => sg.addShadowCaster(m, false));
sg.usePercentageCloserFiltering = true; sg.filteringQuality = ShadowGenerator.QUALITY_MEDIUM; sg.bias = 0.0005; sg.normalBias = 0.02;
const hemi = new HemisphericLight("hemi", new Vector3(0, 1, 0), scene);       // intensity 0.35, diffuse (0.6,0.7,0.95), groundColor (0.35,0.25,0.18), specular black
const lamps = positions.map((p, i) => { const l = new PointLight("lamp" + i, p, scene); l.diffuse = new Color3(1, 0.68, 0.38); l.intensity = 4; l.range = 6; return l; });
new ClusteredLightContainer("interiorLights", lamps, scene);
// HDR emissive: PBR tv { albedo black, emissiveColor (0.35,0.65,1), emissiveIntensity 4 } ; StandardMaterial bulb { disableLighting, emissiveColor (6,4.4,2.8) }
createSkyDome(scene, sun);
const ssao = new SSAO2RenderingPipeline("ssao", scene, { ssaoRatio: 0.5, blurRatio: 1 }, [camera], false, Constants.TEXTURETYPE_HALF_FLOAT);
ssao.radius = 0.6; ssao.totalStrength = 1.2; ssao.base = 0.1; ssao.samples = 16; ssao.maxZ = 60; ssao.minZAspect = 0.5; ssao.expensiveBlur = true;
const drp = new DefaultRenderingPipeline("drp", true, scene, [camera]);       // AFTER ssao
drp.fxaaEnabled = true; drp.bloomEnabled = true; drp.bloomThreshold = 1.0; drp.bloomWeight = 0.35; drp.bloomKernel = 64; drp.bloomScale = 0.5;
drp.grainEnabled = true; drp.grain.intensity = 6; drp.grain.animated = true;
const ip = scene.imageProcessingConfiguration;
ip.toneMappingEnabled = true; ip.toneMappingType = ImageProcessingConfiguration.TONEMAPPING_ACES; ip.exposure = 1.1; ip.contrast = 1.15;
ip.vignetteEnabled = true; ip.vignetteWeight = 1.2; ip.vignetteColor = new Color4(0, 0, 0, 0); ip.vignetteStretch = 0.2;
const ps2 = createPs2PostProcess(camera, engine); drp.onBuildObservable.add(() => keepLast(camera, ps2));   // optional
```

---
## 10. Pitfalls
1. **Exceeding the vertex UBO limit** (more than about 11–12 lights actually bound to one material, i.e. min(lights, `maxSimultaneousLights`)) → link error, fallback storm, and `whenReadyAsync()` hangs forever. Use the cluster instead.
2. **Clustered lights:** `setEnabled(false)` is ignored (use `intensity = 0`); `removeLight` re-adds the light as a normal light; PBR needs `useGLTFLightFalloff = true` or you get hard rectangular cut-offs; always set `range` (default `MAX_VALUE`); a light with a ShadowGenerator or a non-default `falloffType` is refused.
3. **DirectionalLight shadow framing:** `position` defaults to `-direction` (1 m from the origin) and Z defaults to the camera range. Bias scales with the Z range: set `autoCalcShadowZBounds` or `shadowMinZ`/`shadowMaxZ`, and put the light upstream.
4. **Low-sun acne** needs `normalBias` (about 0.02); raising `bias` alone did not fix it.
5. **CSM:** `shadowMaxZ` silently ignores out-of-range values; `autoCalcDepthBounds` broke shadows and adds a depth pass; the cost is casters × cascades.
6. **Point-light shadows** are 6× caster draws, and PCF silently becomes Poisson. Use them only for 1–2 key lights, or refresh-once.
7. **The DRP re-appends its post-processes on every rebuild**, which reorders custom post-processes (hook `onBuildObservable`). `drp.imageProcessing` is recreated, so use `scene.imageProcessingConfiguration`.
8. **SSAO2:** the default `textureType` clamps HDR (pass HALF_FLOAT); `drp.samples` is ignored with prepass (use `ssao.textureSamples`); re-attaching appends after the DRP (`drp.prepare()`).
9. **GlowLayer `includedOnly`** leaks glow through walls; GlowLayer, HighlightLayer, SelectionOutlineLayer (default options) and VLS all re-render the scene. Disposing a `SelectionOutlineLayer` leaves `scene.enableDepthRenderer()` active (+1 geometry pass): call `scene.disableDepthRenderer()`, or create it with `{ useDepthOcclusion: false }` (+2 draws).
10. **VLS** does nothing when the sun is off-screen.
11. `createDefaultEnvironment()` needs the CDN. A `ReflectionProbe`'s irradiance appears a few frames late (async readback).
12. **`PostProcess` creation:** register the shader in `Effect.ShadersStore` **before** constructing, or Babylon fetches `<name>.fragment.fx`. In the options-object form, use `size`, not `width`/`height`.
13. **Instrumentation:** no `SceneInstrumentation` means no per-frame draw-call reset; `capturePhysicsTime` must be set after `enablePhysics`; `getFps()` and `getDeltaTime()` are only live under `runRenderLoop`.
14. **Probes:** pick against meshes **after** a first `scene.render()`; before it, world matrices are identity (my first shadow score was garbage). Use `preserveDrawingBuffer: true` to `readPixels` after rAF.
15. **Harness under load:** Playwright `--screenshot` timed out (30 s) while other agents saturated the CPUs. Capturing the canvas in-page with `toDataURL("image/jpeg")` (`captureCanvas()` in `render-lighting-util.ts`) works, but keep it under about 60 KB: the harness stdout is truncated near 64 KB because `process.exit` cuts the pipe.
