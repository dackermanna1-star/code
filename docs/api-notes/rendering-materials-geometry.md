# Rendering: procedural geometry, material plugins, texture arrays, instancing, many-mesh performance

Babylon.js **9.30.0** (`@babylonjs/core`), WebGL2, left-handed scene. Checked against the installed
`node_modules/@babylonjs/core` sources and runtime probes in headless Chromium (SwiftShader).
Tags: **[RT]** = verified at runtime by a probe, **[SRC]** = read from the source only.
All snippets import from the package root (`import { X } from "@babylonjs/core"`).

## TL;DR

1. **Winding [RT].** With the default LH scene, default `sideOrientation` and `backFaceCulling = true`, a raw triangle `(a,b,c)` is visible from the side where it appears **counter-clockwise on screen**. Put another way, its outward normal `n` must satisfy **`dot(cross(b−a, c−a), n) < 0`**. That is clockwise around `n` by the right-hand rule, so CCW-from-outside hull output must be **reversed**. `VertexData.ComputeNormals` returns that outward (visible-side) normal. Mirrored (negative-determinant) transforms are compensated automatically.
2. **Custom attributes [RT].** Call `mesh.setVerticesData("surf", data, updatable, 4)` only **after** positions exist; before that it is silently dropped. `Mesh.MergeMeshes`, `VertexData.merge`, `VertexData.ExtractFromMesh` and `Geometry`-less paths **drop custom kinds**, so concatenate the typed arrays yourself.
3. **`updateVerticesData` [RT]** is a **silent no-op** unless the buffer was created `updatable`, and the data must keep the same length. When the vertex count changes, call `applyToMesh`/`setVerticesData` again. A 500-vertex rebuild costs about 0.03–0.2 ms CPU.
4. **World material [RT].** Use `PBRMaterial` with `metallic = 0` and `roughness = 1`. Non-null values switch on `METALLICWORKFLOW`, which the roughness/metal injection needs. Add **`WorldMaterialPlugin`** (§4, complete code). It handles per-vertex `surf` (albedo layer, normal layer, roughness, HDR emissive), tint = vertex colour rgb and metallic = `color.a`, plus `sampler2DArray` albedo and normal maps. Verified with shadows, fog, bloom, thin instances and InstancedMesh. Plugin `getCustomCode()` runs **inside the base constructor**, before subclass fields exist.
5. **`RawTexture2DArray` [RT].** `invertY` **must be `false`** with ArrayBufferView data. `true` raises GL `INVALID_OPERATION` and gives a black texture, so flip rows on the CPU. **ImageBitmap uploads ignore `invertY`**, and that includes `CreateTexture2DArrayFromImageUrlsAsync({invertY:true})`; use `imageBitmapOptions: {imageOrientation: "flipY"}` instead. **`updateMipLevel()` is broken on WebGL.**
6. **Shadows [RT].** Set `sun.autoCalcShadowZBounds = true` (see `rendering-lighting-post.md` §1). The default depth range is the camera's minZ..maxZ, so `bias = 0.002` ≈ 20 m and **no shadow is visible**.
7. **Thin instances [RT].** `thinInstanceSetBuffer(kind, buf, stride)` defaults to a **static** buffer, and later `thinInstanceBufferUpdated` calls are ignored, so pass `staticBuffer = false`. Call `thinInstanceRefreshBoundingInfo()` after moving instances out of the old bounds, or they are culled.
8. **Performance [RT].** One draw call costs about 4–6 µs CPU here (2000 unique meshes ≈ 12 ms/frame). All the flags together give at most about 2× (≈ 6 ms). **Fewer draw calls is what matters**: one mesh per island, merged sleeping debris, thin instances (2000 = 0.5 ms). Setting `scene.performancePriority` to Intermediate/Aggressive makes **new meshes unpickable and unculled** and sets `autoClear = false`.
9. **Glass [RT].** Use PBR with `alpha ≈ 0.18`, `roughness ≈ 0.04`, **`disableDepthWrite = true`**, `backFaceCulling = true`, and reflections from a render-once `ReflectionProbe` whose renderList holds **only non-PBR meshes such as the sky dome**; otherwise you get a GL feedback loop. Batch the shards of an island into one mesh: 300 separate transparent meshes cost about +3–5 ms/frame.

**Probe files** (all in `tests/probes/`, prefix `render-materials-`): `winding`, `geometry`, `worldmat.ts` (plugin +
helpers, imported by probes), `proctex.ts` (test textures + face emitters), `plugin-pbr`, `plugin-std`,
`plugin-pbr-env`, `roughness`, `shadowcheck`, `texarray`, `dyntex`, `instancing`, `thinworld`, `merge`, `perf`, `glass`.
**Timing caveat:** this 4-CPU box ran a load average of 20–45 from parallel agents during the probes. CPU timings are
indicative only (min-of-N is reported where noted). GPU timings are meaningless (SwiftShader). `performance.now()` is
quantised to 0.1 ms in this page.

---

## 1. Raw mesh creation and updates

### 1.1 Signatures (from `Meshes/mesh.vertexData.d.ts`, `Meshes/mesh.pure.d.ts`)
```ts
class VertexData {
  positions, normals, tangents, uvs, uvs2..uvs6, colors, matricesIndices, matricesWeights, ...: Nullable<FloatArray>;
  indices: Nullable<IndicesArray>;
  static readonly FRONTSIDE = 0; BACKSIDE = 1; DOUBLESIDE = 2; DEFAULTSIDE = 0;   // BUILDER option only (see 1.4)
  set(data: FloatArray, kind: string): void;            // standard kinds only; unknown kinds are ignored [SRC]
  applyToMesh(mesh: Mesh, updatable?: boolean): VertexData;
  updateMesh(mesh: Mesh): VertexData;                   // = updateVerticesData per kind + setIndices
  transform(matrix: Matrix): VertexData;                // flips indices when det < 0 [SRC]
  merge(others: VertexData | VertexData[], use32BitsIndices?: boolean, forceCloneIndices?: boolean,
        mergeMaterialIds?: boolean, enableCompletion?: boolean): VertexData;
  static ExtractFromMesh(mesh: Mesh, copyWhenShared?: boolean, forceCopy?: boolean): VertexData;
  static ExtractFromGeometry(geometry: Geometry, copyWhenShared?: boolean, forceCopy?: boolean): VertexData;
  static ComputeNormals(positions: any, indices: any, normals: any, options?: {...; useRightHandedSystem?: boolean}): void;
}
// Mesh
setVerticesData(kind: string, data: FloatArray, updatable?: boolean, stride?: number): AbstractMesh;
updateVerticesData(kind: string, data: FloatArray, updateExtends?: boolean, makeItUnique?: boolean): AbstractMesh;
setIndices(indices: IndicesArray, totalVertices?: Nullable<number>, updatable?: boolean, dontForceSubMeshRecreation?: boolean): AbstractMesh;
updateIndices(indices: IndicesArray, offset?: number, gpuMemoryOnly?: boolean): AbstractMesh;
refreshBoundingInfo(applySkeletonOrOptions?: boolean | IMeshDataOptions, applyMorph?: boolean): Mesh;
removeVerticesData(kind: string): void;  markVerticesDataAsUpdatable(kind: string, updatable?: boolean): void;
makeGeometryUnique(): Mesh;  getVerticesData(kind, copyWhenShared?, forceCopy?, bypassInstanceData?): Nullable<FloatArray>;
get sideOrientation(): number; set sideOrientation(v: number);   // 1 (= Material.CounterClockWiseSideOrientation) in LH scenes
```

### 1.2 Minimal raw mesh with a custom attribute [RT] (`render-materials-geometry.probe.ts`)
```ts
import { Mesh, VertexData } from "@babylonjs/core";
const mesh = new Mesh("island", scene);
const vd = new VertexData();
vd.positions = positions;          // Float32Array | number[]  (xyz)
vd.normals = normals;              // xyz (or VertexData.ComputeNormals(positions, indices, normals))
vd.uvs = uvs;                      // uv
vd.colors = colors;                // rgba (4 floats/vertex). If colors.length === positions.length it is treated as RGB (stride 3) [SRC]
vd.indices = indices;              // Uint32Array OK; >65535 vertices are handled (32-bit index buffer chosen automatically)
vd.applyToMesh(mesh, /*updatable*/ true);
mesh.setVerticesData("surf", surf, /*updatable*/ true, /*stride*/ 4);   // AFTER applyToMesh
mesh.material = worldMaterial;
```
- Setting a custom kind before any geometry exists is **silently dropped**: `isVerticesDataPresent("surf")` is false [RT]. In that case `Mesh.setVerticesData` builds a VertexData via `set()`, which only knows the standard kinds [SRC]. After geometry exists it works, and `getVertexBuffer("surf").getSize() === 4` [RT].
- `clone()` shares the geometry, including custom buffers. `makeGeometryUnique()` (`Geometry.copy`) copies every vertex buffer, custom ones included [SRC].
- `mesh.hasVertexAlpha` stays false unless `vd.hasVertexAlpha` or you set it. While it is false Babylon ignores `color.a` (no `VERTEXALPHA`) [RT], so the world material can use `color.a` as metallic.

### 1.3 Update paths and costs (500 vertices, 750 indices, pos+normal+uv+color+surf) [RT]
| operation | CPU ms (two runs, contended) |
|---|---|
| new Mesh + `applyToMesh` + `setVerticesData("surf")` | 0.29–0.48 (0.76 cold) |
| `dispose()` per mesh | 0.04–0.05 |
| same count, `applyToMesh` again (recreates GPU buffers) | 0.14–0.19, **+render 0.35–0.73** (render alone 0.16–0.27) |
| same count, `updateVerticesData` ×5 kinds + `updateIndices` (bufferSubData) | 0.03–0.11, +render 0.19–0.55 |
| `updateVerticesData` pos/normal/surf + `refreshBoundingInfo()` | 0.03–0.08 |
| vertex count 500↔520 via `applyToMesh` | 0.03–0.12 |
| `VertexData.ComputeNormals` (500 v) | 0.02–0.05 |
| `refreshBoundingInfo()` (500 v) | 0.007–0.025 |
| replace with a brand-new mesh each change | 0.13–0.25 |

Rules:
- `updateVerticesData(kind, data)` on a buffer created with `updatable = false` does nothing, and the CPU copy is unchanged too [RT]. The underlying `Buffer.update` only writes updatable buffers [SRC]. Either create buffers with `applyToMesh(mesh, true)` / `setVerticesData(kind, d, true, n)`, or re-set them.
- `updateVerticesData` uses `bufferSubData`, so the length **must not grow** [SRC]. When the count changes, call `applyToMesh` (it re-creates all buffers and sub-meshes) [RT].
- `updateIndices`: for an updatable index buffer it uses `bufferData`, so the size may change and the global submesh is re-created. For a non-updatable buffer it falls back to `setIndices` [SRC]. `applyToMesh(m, true)` makes the index buffer updatable too.
- After `updateVerticesData("position", data, /*updateExtends*/ false)`, call `refreshBoundingInfo()` (or pass `updateExtends = true`). Otherwise culling and picking use stale bounds.
- **Recommendation for the batcher:** island meshes change rarely and their vertex counts change (fracture), so **re-apply** (`applyToMesh(mesh, true)` + `setVerticesData("surf", ..., true, 4)`) on change. It is simple and ≈0.2 ms. Use `updateVerticesData` only for same-topology edits such as dents and soft squash.

### 1.4 Winding / front faces (critical) [RT] (`render-materials-winding.probe.ts`, screenshot checked)
Camera at z = −10 looking at +Z (camera right = +X, up = +Y), triangles in the z = 0 plane, emissive colours, read back by `engine.readPixels`:

| triangle | result |
|---|---|
| A: indices (0,1,2) = bottom-left, bottom-right, top (**CCW on screen**) | **visible** |
| B: (0,2,1) (CW on screen) | culled |
| C: B with `scaling.x = -1` (mirrored) | culled (Babylon flips `frontFace` when det < 0, so the semantics are preserved) |
| F: A with `scaling.x = -1` | visible |
| D: B with `material.sideOrientation = Material.ClockWiseSideOrientation` | visible |
| E: `backFaceCulling = false` | visible |
| `MeshBuilder.CreatePlane` (normal (0,0,−1), indices BL,BR,TR) | visible |

- `VertexData.ComputeNormals` gave **(0,0,−1)** for A, pointing towards the camera (the visible side). Its formula is `n = (p1−p2)×(p3−p2) = −(p2−p1)×(p3−p1)` [SRC]. On the builder box, ComputeNormals agrees with the builder's outward normals 24/24, and the right-hand cross of the first triangle · outward normal = **−1** [RT].
- Mechanism [SRC]: `new Mesh()` sets `sideOrientation = 1` in LH scenes (0 in RH), and `material.sideOrientation` defaults to `null`. `_preBind` maps that to `reverse = (orientation === ClockWise)`, which gives `gl.frontFace(CCW)` and `cullFace(BACK)`.
- `VertexData.FRONTSIDE/BACKSIDE/DOUBLESIDE` (0/1/2) are **builder** options: they duplicate or flip indices inside `MeshBuilder`. They are unrelated to `Material.ClockWiseSideOrientation (0)` / `CounterClockWiseSideOrientation (1)`. For raw VertexData only the order you write matters.
- **Pure-geometry rule** (math-convention `Vec3`, no Babylon): for each face with outward unit normal `N` and an in-plane up vector `V`, let `U = cross(N, V)`. Emit `p0 = c−U−V, p1 = c+U−V, p2 = c+U+V, p3 = c−U+V` and indices `(0,1,2),(0,2,3)`. Then `cross(p1−p0, p2−p0) = −|…|·N`. For an arbitrary convex polygon, fan-triangulate and **reverse** the order if `dot(cross(p1−p0, p2−p0), N) > 0`. Planar UVs `u = p·U, v = p·V` then show textures upright and unmirrored from the front [RT, "F" panel in `plugin-pbr`].
```ts
// verified helper (render-materials-proctex.ts, GeomBuilder.polyFace)
const flip = dot(cross(sub(pts[1], pts[0]), sub(pts[2], pts[0])), n) > 0;   // RH-CCW around n -> reverse for Babylon
for (let i = 1; i < pts.length - 1; i++) flip ? idx.push(b, b + i + 1, b + i) : idx.push(b, b + i, b + i + 1);
```
- Never set `scene.useRightHandedSystem` because it flips all of the above.

---

## 2. Material plugins (`MaterialPluginBase`) [SRC + RT]

### 2.1 Constructor and overridable methods (`Materials/materialPluginBase.pure.d.ts`)
```ts
constructor(material: Material, name: string, priority: number,
            defines?: { [key: string]: any },   // define names -> default values (bool/number/string)
            addToPluginList?: boolean /*true*/, enable?: boolean /*false*/, resolveIncludes?: boolean /*false*/);
name: string; priority: number /*lower runs first, default 500*/; resolveIncludes: boolean;
registerForExtraEvents: boolean;   // needed for hasRenderTargetTextures / fillRenderTargetTextures / hardBindForSubMesh
doNotSerialize: boolean;
protected _material: Material; protected _pluginManager: MaterialPluginManager;
readonly markAllDefinesAsDirty: () => void;          // = material._dirtyCallbacks[AllDirtyFlag]
protected _enable(enable: boolean): void;            // activates the plugin (callbacks only run for active plugins)
isCompatible(shaderLanguage: ShaderLanguage): boolean;   // default: GLSL only
getClassName(): string;
isReadyForSubMesh(defines, scene, engine, subMesh): boolean;
prepareDefinesBeforeAttributes(defines, scene, mesh): void;   // before PrepareDefinesForAttributes (UV1/VERTEXCOLOR/...)
prepareDefines(defines, scene, mesh): void;                   // after attributes
getAttributes(attributes: string[], scene, mesh): void;
getSamplers(samplers: string[]): void;
getUniformBuffersNames(ubos: string[]): void;
getUniforms(shaderLanguage?): { ubo?: {name; size?; type?; arraySize?}[]; vertex?: string; fragment?: string; externalUniforms?: string[] };
bindForSubMesh(uniformBuffer: UniformBuffer, scene, engine, subMesh): void;   // only called when the material must rebind
hardBindForSubMesh(uniformBuffer, scene, engine, subMesh): void;              // every draw (needs registerForExtraEvents)
getCustomCode(shaderType: "vertex" | "fragment", shaderLanguage?): Nullable<{ [pointName: string]: string }>;
hasTexture(t): boolean; getActiveTextures(list): void; getAnimatables(list): void; dispose(forceDisposeTextures?): void;
addFallbacks(defines, fallbacks, rank): number; hasRenderTargetTextures(): boolean; fillRenderTargetTextures(rts): void;
collectDefines(...); copyTo(plugin); serialize(); parse(source, scene, rootUrl);
```
Behaviour verified in the source and in the working plugin:
- The base constructor calls `pluginManager._addPlugin(this)`, which calls `getClassName()`, `collectDefines()` and **`getCustomCode("vertex"/"fragment")`**. That happens **before subclass field initialisers run**, so `getCustomCode` may only depend on `this._material`, which is already set. The **set of point names** is captured at that moment. The code strings are re-read at every compile, so content may vary later (call `markAllDefinesAsDirty()`).
- Pass `enable = true` (6th argument) or call `this._enable(true)`. Inactive plugins get no `prepareDefines`/`bind` calls.
- Plugin defines must be declared in the constructor's `defines` object to exist in `MaterialDefines`. `MaterialDefines` has a `[id: string]: any` index signature, so `defines["MY_DEFINE"] = x` type-checks.
- `getUniforms().ubo` entries are appended to the material UBO and declared at `#define ADDITIONAL_UBO_DECLARATION` (the WebGL2 path). `vertex`/`fragment` strings replace `#define ADDITIONAL_VERTEX/FRAGMENT_DECLARATION`, which only exist in the non-UBO declaration includes. Provide both, as Babylon's own plugins do. Update values with `uniformBuffer.updateFloat4(...)` and bind samplers with `uniformBuffer.setTexture(name, tex)` [RT].
- `bindForSubMesh` runs inside `if (mustRebind)`, the same as built-in textures. For frozen materials, guard uniform updates with `if (!ubo.useUbo || !this._material.isFrozen || !ubo.isSync)` (DetailMap pattern).

### 2.2 Injection mechanics (`materialPluginManager.pure.js` `_injectCustomCode`) [SRC, RT]
- **Plain key** `"CUSTOM_FRAGMENT_DEFINITIONS"`: the code is inserted **just before** the line `#define CUSTOM_FRAGMENT_DEFINITIONS`. It is a string `replace`, so **only the first occurrence** is used. That matters for markers inside includes that repeat per light (e.g. `CUSTOM_LIGHT`).
- **Regex key**: starts with `!`. `"!pattern"` uses flags `g`; `"!!pattern"` uses no flags (g is still forced); `"!gi!pattern"` uses explicit flags. Every match is **replaced** by the code. `$0` (whole match) and `$1..` are substituted. Escape regex metacharacters in the key (`"!float glossiness=vSpecularColor\\.a;"`). Verified: the original statement disappears from the compiled shader [RT].
- Injection runs as `processCodeAfterIncludes`, **after includes are expanded** (markers inside includes are valid) but **before** `#if` evaluation and before the WebGL2 conversion (`attribute/varying/texture2D/gl_FragColor` → `in/out/texture/...`) [SRC]. You may therefore write GLSL-ES-1 style (`attribute`, `varying`) **or** use `texture()` directly, and wrap code in `#ifdef`s on your own defines [RT].
- Fragment shaders need **`uniform highp sampler2DArray x;`**. GLSL ES 3.0 has no default precision for `sampler2DArray`, and Babylon does not add one for material shaders [SRC; with `highp` it compiles, RT].

### 2.3 All `#define CUSTOM_*` points (grep of `Shaders/*.js`) [SRC]
- `default.vertex` and `pbr.vertex` (same list): `CUSTOM_VERTEX_EXTENSION, CUSTOM_VERTEX_BEGIN, CUSTOM_VERTEX_DEFINITIONS, CUSTOM_VERTEX_MAIN_BEGIN, CUSTOM_VERTEX_UPDATE_POSITION, CUSTOM_VERTEX_UPDATE_NORMAL, CUSTOM_VERTEX_UPDATE_WORLDPOS, CUSTOM_VERTEX_MAIN_END`
- `default.fragment` (StandardMaterial): `CUSTOM_FRAGMENT_EXTENSION, CUSTOM_FRAGMENT_BEGIN, CUSTOM_FRAGMENT_DEFINITIONS, CUSTOM_FRAGMENT_MAIN_BEGIN, CUSTOM_FRAGMENT_UPDATE_ALPHA (inside #ifdef DIFFUSE only!), CUSTOM_FRAGMENT_UPDATE_DIFFUSE, CUSTOM_FRAGMENT_BEFORE_LIGHTS, CUSTOM_FRAGMENT_BEFORE_FOG, CUSTOM_FRAGMENT_BEFORE_FRAGCOLOR, CUSTOM_FRAGMENT_MAIN_END`
- `pbr.fragment`: `CUSTOM_FRAGMENT_EXTENSION, CUSTOM_FRAGMENT_BEGIN, CUSTOM_FRAGMENT_DEFINITIONS, CUSTOM_FRAGMENT_MAIN_BEGIN, CUSTOM_FRAGMENT_UPDATE_ALPHA, CUSTOM_FRAGMENT_BEFORE_LIGHTS, CUSTOM_REFLECTION (only with USE_CUSTOM_REFLECTION), CUSTOM_FRAGMENT_BEFORE_FINALCOLORCOMPOSITION, CUSTOM_FRAGMENT_BEFORE_FRAGCOLOR, CUSTOM_FRAGMENT_MAIN_END`
- In includes (valid because injection happens after include expansion): `pbrBlockAlbedoOpacity`: **`CUSTOM_FRAGMENT_UPDATE_ALBEDO`** (inside `albedoOpacityBlock()`; locals `surfaceAlbedo`, `alpha`; vColor already multiplied). `pbrBlockReflectivity`: **`CUSTOM_FRAGMENT_UPDATE_METALLICROUGHNESS`** (inside `reflectivityBlock()`, METALLICWORKFLOW only; local `vec2 metallicRoughness` = (metallic, roughness)) and `CUSTOM_FRAGMENT_UPDATE_MICROSURFACE` (specular workflow). `pbrBlockFinalColorComposition`: `CUSTOM_FRAGMENT_BEFORE_FOG` (PBR). `bumpFragment`: `CUSTOM_FRAGMENT_BUMP_FRAGMENT` (only under `BUMP && OBJECTSPACE_NORMALMAP`). `lightFragment`: `CUSTOM_LIGHT`. `imageProcessingFunctions`: `CUSTOM_IMAGEPROCESSINGFUNCTIONS_DEFINITIONS / _UPDATERESULT_ATSTART / _UPDATERESULT_ATEND`. (OpenPBR includes: `CUSTOM_FRAGMENT_BEFORE_IBLLAYERCOMPOSITION`.)
- Useful locals. PBR main: `normalW` (set before `CUSTOM_FRAGMENT_BEFORE_LIGHTS`, first used by lighting/IBL after it), `surfaceAlbedo`, `alpha`, `finalEmissive` (declared just before `BEFORE_FINALCOLORCOMPOSITION`), `finalColor` (at `BEFORE_FOG`), `vPositionW`, `viewDirectionW`. Standard main: `baseColor` (×vColor before `UPDATE_DIFFUSE`), `normalW`, `color` (at `BEFORE_FOG`). Vertex: `positionUpdated`, `normalUpdated`, `uvUpdated` (always declared by `MAIN_END`), `color` (attribute, under `VERTEXCOLOR`), `finalWorld`, `worldPos`.
- Gotchas [SRC/RT]:
  - Babylon declares the `uv` attribute (`UV1`) **only if a built-in texture needs UVs**. Set `defines._needUVs = true` in `prepareDefinesBeforeAttributes` [RT].
  - `vColor.a` is **not** passed unless `VERTEXALPHA` (`vColor.rgb *= color.rgb` only). Forward `color.a` through your own varying [RT].
  - StandardMaterial computes `clamp(diffuse + emissive + ambient, 0, 1) * baseColor`, so HDR emissive must be added at `CUSTOM_FRAGMENT_BEFORE_FOG` [RT].
  - Use no `dFdx`/`texture()` inside non-uniform branches (per-face values differ across triangle edges); use layer 0 = flat normal instead of `if`.

---

## 3. Texture arrays (`RawTexture2DArray`)

### 3.1 Signatures (`Materials/Textures/rawTexture2DArray*.d.ts`)
```ts
new RawTexture2DArray(data: Nullable<ArrayBufferView>, width: number, height: number, depth: number,
                      format: number /*Constants.TEXTUREFORMAT_RGBA = 5*/, scene: Scene,
                      generateMipMaps?: boolean /*true*/, invertY?: boolean /*false*/,
                      samplingMode?: number /*TRILINEAR*/, textureType?: number /*UNSIGNED_BYTE*/,
                      creationFlags?: number, mipLevelCount?: number);
tex.depth; tex.update(data: ArrayBufferView): void;       // re-uploads ALL layers (texImage3D) + regenerates mips
tex.updateMipLevel(data, mipLevel): void;                 // BROKEN on WebGL: ignores mipLevel -> INVALID_OPERATION [RT]
RawTexture2DArray.CreateRGBATexture(data, w, h, depth, scene, generateMipMaps?, invertY?, samplingMode?, type?);
// rawTexture2DArray.functions (exported from the root):
UploadImageToTexture2DArrayLayer(texture: RawTexture2DArray, source: ImageSource, layer: number,
                                 options?: { invertY?: boolean; premultiplyAlpha?: boolean }): void;   // texSubImage3D, regenerates mips if enabled
LoadImageToTexture2DArrayLayerAsync(texture, url: string, layer: number, options?): Promise<void>;
CreateTexture2DArrayFromImageUrlsAsync(scene, urls: readonly [string, ...string[]],
     options?: { invertY?; premultiplyAlpha?; generateMipMaps?; samplingMode?; textureType?; imageBitmapOptions?: ImageBitmapOptions }): Promise<RawTexture2DArray>;
CreateTexture2DArrayFromKTX2Async(scene, data: string | ArrayBufferView, options?): Promise<RawTexture2DArray>;   // transcodes to RGBA8
```
Sampling in GLSL: `texture(sampler2DArray, vec3(uv, layer))`. The layer is **rounded to the nearest integer and clamped**: 2.98 gives layer 3, and 7 on a 4-layer array gives layer 3 [RT].

### 3.2 Orientation of every upload path [RT] (`render-materials-texarray.probe.ts`)
Source image: TL red, TR green, BL blue, BR white. The quad has v going up and u going right, so "upright" means the image looks like the source.

| path | result |
|---|---|
| `getImageData` → `RawTexture2DArray(..., invertY=false)` | **upside-down** (data row 0 = v 0) |
| `getImageData` + CPU row flip → `invertY=false` | **upright** |
| `RawTexture2DArray(data, ..., invertY=true)` | **GL INVALID_OPERATION, black** ("FLIP_Y or PREMULTIPLY_ALPHA isn't allowed for uploading 3D textures") |
| `UploadImageToTexture2DArrayLayer(tex, canvas, l, {invertY:true})` | **upright** (DOM canvas honours flipY) |
| `UploadImageToTexture2DArrayLayer(tex, imageBitmap, l, {invertY:true})` | upside-down (**ImageBitmap ignores flipY**) |
| `CreateTexture2DArrayFromImageUrlsAsync(scene, [jpg])` | upside-down |
| … `{ invertY: true }` | **still upside-down** (it uses ImageBitmaps) |
| … `{ imageBitmapOptions: { imageOrientation: "flipY" } }` | **upright** |
| `decodeImageToLayer()` (fetch → createImageBitmap → OffscreenCanvas → getImageData → flip), §4 helper | upright; JPEG red decoded as (254,0,0) |

Convention adopted by the world material: **image top = v 1** (OpenGL style), so flip rows on the CPU. The normal maps are then OpenGL-style ("green up", +y = +v). DirectX-style maps need `g = 255 − g`.

### 3.3 Filtering, mips, wrap, anisotropy [RT]
- The wrap mode comes from `texture.wrapU/wrapV` at bind time, default `WRAP_ADDRESSMODE` (REPEAT). Verified: GL `TEXTURE_WRAP_S/T = REPEAT`, and UVs −1..2 tile 3×3 correctly. `wrapR` is not applied to arrays (layers never wrap).
- Sampling mode is applied at creation. `TRILINEAR` with mips gives MIN `LINEAR_MIPMAP_LINEAR`, MAG `LINEAR`. `updateSamplingMode(mode)` works on arrays (BILINEAR switched to NEAREST verified), but a texture created without mips cannot gain them that way.
- `anisotropicFilteringLevel` (default 4) is applied at bind **only** for sampling modes 3 (TRILINEAR), 2 (BILINEAR) and 11 (LINEAR_LINEAR_MIPNEAREST); otherwise it is forced to 1. GL reported 4 for trilinear and 1 for nearest [RT].
- A minified 1-texel checker gave luminance std-dev **0 with mips vs 61.8 without** (aliasing). A magnified 8-px checker gave NEAREST 2–3 distinct values and BILINEAR 13.
- Caps (SwiftShader): `MAX_ARRAY_TEXTURE_LAYERS 2048`, `MAX_TEXTURE_SIZE 8192`, `maxAnisotropy 16`. WebGL2 guarantees ≥ 256 layers and ≥ 2048 size.
- Costs (SwiftShader, inflated): creating 16 × 256² RGBA with mips took 8.5 ms; `update()` of all of it 8.3 ms; **one layer via `UploadImageToTexture2DArrayLayer` from a canvas 34 ms (mip regeneration of all layers) vs 9 ms with mip regeneration suppressed**; `getImageData` 256² 0.42 ms; CPU row flip 256² 0.1 ms.
- For batch layer uploads, follow Babylon's own helper. Set `tex.getInternalTexture()!.generateMipMaps = false` for every upload except the last, then set it back to `true` right before the last upload, which regenerates once.
- Memory: 256² RGBA8 ≈ 256 KB per layer, plus 1/3 for mips. 100 layers ≈ 35 MB per array.
- Canvas alpha pitfall: canvases store premultiplied colour, so to pack roughness into the albedo alpha, draw opaque, `getImageData`, then **overwrite the alpha bytes** in the Uint8Array (as `render-materials-proctex.ts` does).

---

## 4. World material: PBR + `WorldMaterialPlugin` (complete, verified)

**Verified [RT]** (`plugin-pbr`, `plugin-std`, `plugin-pbr-env`, `roughness`, `shadowcheck`, `thinworld`, `texarray`):
- Compiles on PBR and Standard with no errors.
- Defines: `UV1` / `VERTEXCOLOR` / `WORLDMAT_NORMALMAP` / `METALLICWORKFLOW` / `FOG` / `SHADOW1` + `SHADOWPCF1` all true.
- Albedo layers selected per vertex and tiling with REPEAT. The "F" glyph reads upright and unmirrored.
- Brick and dome normal maps lit correctly: bumps appear raised.
- Vertex tint is multiplied in.
- Received shadows: lit tile (65,106,161) vs. in shadow (0,38,76).
- Linear fog: far crate blended towards the fog colour.
- HDR emissive `surf.w = 6` blooms with `bloomThreshold = 1.0`; nothing else blooms.
- Per-vertex roughness: mirror-configuration peak 255 / 170 / 150 for roughness 0.05 / 0.5 / 1.0.
- Per-vertex metallic: metal 50 vs. dielectric 128 under off-specular light, and with an environment the metal reflects the sky.
- Meshes without `surf` render normally (not glowing).
- Works with thin instances (instance colours) and InstancedMesh.
- The Standard variant's regex injection replaced `glossiness` [RT].

**Recommendation: PBRMaterial.** Per-vertex roughness and metallic inject cleanly, energy is consistent, and you get IBL plus HDR emissive. CPU cost per draw is the same order as Standard. Metals need an environment texture or they render nearly black. Use a render-once `ReflectionProbe` of the sky dome as `scene.environmentTexture`; that works offline (see `rendering-lighting-post.md` §7.1). Put **only non-PBR meshes such as the dome** in the probe's renderList. Including meshes whose material samples `scene.environmentTexture` gives `GL_INVALID_OPERATION: Feedback loop` [RT].

Vertex layout used by the batcher:
| kind | content |
|---|---|
| `position`, `normal` | standard |
| `uv` | metres / `surface.worldSize`, i.e. repeats (REPEAT wrap) |
| `color` (rgba floats) | rgb = tint, **converted to linear for PBR** (`Color3.toLinearSpace`, gamma 2.2; Standard uses gamma); a = metallic 0..1 (keep `mesh.hasVertexAlpha = false`) |
| `surf` (vec4, custom, stride 4) | x = albedo layer, y = normal layer (0 = flat), z = roughness 0..1 (× albedo alpha), w = emissive strength (HDR multiplier of albedo×tint; 0 = none) |

Textures: albedo array RGBA8, rgb = sRGB albedo, a = roughness multiplier (255 = 1). Normal array RGBA8, OpenGL-style, layer 0 = flat (128,128,255). Both are built with rows flipped (image top = v 1).

Full plugin code (`tests/probes/render-materials-worldmat.ts`, verbatim):
```ts
import {
  MaterialPluginBase,
  PBRBaseMaterial,
  RawTexture2DArray,
  Texture,
  Constants,
  type Material,
  type MaterialDefines,
  type Scene,
  type AbstractMesh,
  type SubMesh,
  type UniformBuffer,
  type AbstractEngine,
  type BaseTexture,
  type Nullable,
} from "@babylonjs/core";

const VERTEX_DEFS = /* glsl */ `
#ifdef WORLDMAT_SURF
attribute vec4 surf;
#endif
varying vec4 vWmSurf;
varying vec2 vWmUV;
varying float vWmMetal;
`;

const VERTEX_MAIN_END = /* glsl */ `
#ifdef WORLDMAT_SURF
vWmSurf = surf;
#else
vWmSurf = vec4(0.0, 0.0, 1.0, 0.0); // mesh without "surf": layer 0, flat normal, rough 1, not emissive
#endif
vWmUV = uvUpdated;
#ifdef VERTEXCOLOR
vWmMetal = color.a;
#else
vWmMetal = 0.0;
#endif
`;

// Shared fragment declarations. Globals are written in main() (MAIN_BEGIN) and read inside Babylon's
// block functions (albedoOpacityBlock / reflectivityBlock), which are defined AFTER this point.
const FRAGMENT_DEFS = /* glsl */ `
uniform highp sampler2DArray wmAlbedoSampler;
#ifdef WORLDMAT_NORMALMAP
uniform highp sampler2DArray wmNormalSampler;
#endif
varying vec4 vWmSurf;
varying vec2 vWmUV;
varying float vWmMetal;
vec4 wmAlbedoTex;
vec3 wmBaseColor;
// Same maths as Babylon's cotangent_frame (bumpFragmentMainFunctions), renamed to avoid clashes.
mat3 wmCotangentFrame(vec3 normal, vec3 p, vec2 uv) {
  vec3 dp1 = dFdx(p);
  vec3 dp2 = dFdy(p);
  vec2 duv1 = dFdx(uv);
  vec2 duv2 = dFdy(uv);
  vec3 dp2perp = cross(dp2, normal);
  vec3 dp1perp = cross(normal, dp1);
  vec3 tangent = dp2perp * duv1.x + dp1perp * duv2.x;
  vec3 bitangent = dp2perp * duv1.y + dp1perp * duv2.y;
  float det = max(dot(tangent, tangent), dot(bitangent, bitangent));
  float invmax = det == 0.0 ? 0.0 : inversesqrt(det);
  return mat3(tangent * invmax, bitangent * invmax, normal);
}
`;

const FRAGMENT_MAIN_BEGIN = /* glsl */ `
wmAlbedoTex = texture(wmAlbedoSampler, vec3(vWmUV, vWmSurf.x));
`;

// Perturb normalW before any lighting uses it. No branches around texture()/dFdx (derivatives must be
// computed in uniform control flow); layer 0 of the normal array is flat.
const FRAGMENT_NORMAL = /* glsl */ `
#ifdef WORLDMAT_NORMALMAP
{
  vec3 wmN = texture(wmNormalSampler, vec3(vWmUV, vWmSurf.y)).xyz * 2.0 - 1.0;
  wmN.xy *= wmParams.x;
  normalW = normalize(wmCotangentFrame(normalW, vPositionW, vWmUV) * wmN);
}
#endif
`;

function pbrFragment(): Record<string, string> {
  return {
    CUSTOM_FRAGMENT_DEFINITIONS: FRAGMENT_DEFS,
    CUSTOM_FRAGMENT_MAIN_BEGIN: FRAGMENT_MAIN_BEGIN,
    // inside albedoOpacityBlock(): vertex colour already multiplied in; texture is sRGB -> linear
    CUSTOM_FRAGMENT_UPDATE_ALBEDO: `surfaceAlbedo *= toLinearSpace(wmAlbedoTex.rgb);\nwmBaseColor = surfaceAlbedo;`,
    CUSTOM_FRAGMENT_BEFORE_LIGHTS: FRAGMENT_NORMAL,
    // inside reflectivityBlock() (needs METALLICWORKFLOW: set material.metallic/roughness non-null)
    CUSTOM_FRAGMENT_UPDATE_METALLICROUGHNESS: `metallicRoughness.r = vWmMetal;\nmetallicRoughness.g = clamp(vWmSurf.z * wmAlbedoTex.a, 0.03, 1.0);`,
    // HDR emissive, added after lighting; fog is applied afterwards (emissive fades in fog)
    CUSTOM_FRAGMENT_BEFORE_FINALCOLORCOMPOSITION: `finalEmissive += wmBaseColor * vWmSurf.w * wmParams.y;`,
  };
}

function standardFragment(): Record<string, string> {
  return {
    CUSTOM_FRAGMENT_DEFINITIONS: FRAGMENT_DEFS,
    CUSTOM_FRAGMENT_MAIN_BEGIN: FRAGMENT_MAIN_BEGIN,
    // baseColor already includes the vertex colour here
    CUSTOM_FRAGMENT_UPDATE_DIFFUSE: `baseColor.rgb *= wmAlbedoTex.rgb;\nwmBaseColor = baseColor.rgb;`,
    CUSTOM_FRAGMENT_BEFORE_LIGHTS: FRAGMENT_NORMAL,
    // Regex injection (key starts with "!"): rewrite glossiness/specular from per-vertex roughness.
    // $0 would re-insert the matched text; here the match is replaced entirely.
    "!float glossiness=vSpecularColor\\.a;": `float glossiness=max(2.0, exp2(10.0*(1.0-clamp(vWmSurf.z*wmAlbedoTex.a,0.0,1.0))));`,
    "!vec3 specularColor=vSpecularColor\\.rgb;": `vec3 specularColor=vSpecularColor.rgb*(1.0-clamp(vWmSurf.z*wmAlbedoTex.a,0.0,1.0));`,
    // StandardMaterial clamps diffuse+emissive to [0,1]; add HDR emissive after that, before fog
    CUSTOM_FRAGMENT_BEFORE_FOG: `color.rgb += wmBaseColor * vWmSurf.w * wmParams.y;`,
  };
}

export class WorldMaterialPlugin extends MaterialPluginBase {
  /** RGBA8 texture array: rgb = albedo (sRGB), a = roughness multiplier. Required (material not ready without it). */
  albedoArray: Nullable<BaseTexture> = null;
  /** RGBA8 texture array of tangent-space normals (OpenGL style, layer 0 = flat). Optional. */
  normalArray: Nullable<BaseTexture> = null;
  /** Multiplies the normal map xy (0 = flat). */
  normalStrength = 1;
  /** Global multiplier for per-vertex emissive (surf.w). */
  emissiveScale = 1;

  constructor(material: Material) {
    // name, priority, defines (+default values), addToPluginList, enable
    super(material, "WorldMaterial", 200, { WORLDMAT_NORMALMAP: false, WORLDMAT_SURF: false }, true, true);
  }

  /** Assign textures; marks defines dirty (needed when the normal map is added/removed). */
  setTextures(albedo: Nullable<BaseTexture>, normal: Nullable<BaseTexture>): void {
    this.albedoArray = albedo;
    this.normalArray = normal;
    this.markAllDefinesAsDirty();
  }

  override getClassName(): string {
    return "WorldMaterialPlugin";
  }

  override isReadyForSubMesh(_defines: MaterialDefines, _scene: Scene, _engine: AbstractEngine, _subMesh: SubMesh): boolean {
    if (!this.albedoArray || !this.albedoArray.isReady()) return false;
    return !this.normalArray || this.normalArray.isReady();
  }

  override prepareDefinesBeforeAttributes(defines: MaterialDefines, _scene: Scene, _mesh: AbstractMesh): void {
    // Babylon only declares the `uv` attribute (UV1 define) when a built-in texture needs it.
    defines._needUVs = true;
  }

  override prepareDefines(defines: MaterialDefines, _scene: Scene, mesh: AbstractMesh): void {
    defines["WORLDMAT_NORMALMAP"] = !!this.normalArray;
    // without the attribute, WebGL feeds the default (0,0,0,1) => surf.w = 1 => everything would glow
    defines["WORLDMAT_SURF"] = mesh.isVerticesDataPresent("surf");
  }

  override getAttributes(attributes: string[], _scene: Scene, _mesh: AbstractMesh): void {
    attributes.push("surf");
  }

  override getSamplers(samplers: string[]): void {
    samplers.push("wmAlbedoSampler", "wmNormalSampler");
  }

  override getUniforms() {
    return {
      ubo: [{ name: "wmParams", size: 4, type: "vec4" }],
      fragment: "uniform vec4 wmParams;", // used only when uniform buffers are unsupported
    };
  }

  override bindForSubMesh(uniformBuffer: UniformBuffer, _scene: Scene, _engine: AbstractEngine, _subMesh: SubMesh): void {
    if (!uniformBuffer.useUbo || !this._material.isFrozen || !uniformBuffer.isSync) {
      uniformBuffer.updateFloat4("wmParams", this.normalStrength, this.emissiveScale, 0, 0);
    }
    uniformBuffer.setTexture("wmAlbedoSampler", this.albedoArray);
    if (this.normalArray) uniformBuffer.setTexture("wmNormalSampler", this.normalArray);
  }

  override hasTexture(texture: BaseTexture): boolean {
    return texture === this.albedoArray || texture === this.normalArray;
  }

  override getActiveTextures(activeTextures: BaseTexture[]): void {
    if (this.albedoArray) activeTextures.push(this.albedoArray);
    if (this.normalArray) activeTextures.push(this.normalArray);
  }

  override dispose(forceDisposeTextures?: boolean): void {
    if (forceDisposeTextures) {
      this.albedoArray?.dispose();
      this.normalArray?.dispose();
    }
  }

  // Called from the base constructor (before subclass fields exist): depend only on this._material.
  override getCustomCode(shaderType: string): Nullable<Record<string, string>> {
    if (shaderType === "vertex") {
      return { CUSTOM_VERTEX_DEFINITIONS: VERTEX_DEFS, CUSTOM_VERTEX_MAIN_END: VERTEX_MAIN_END };
    }
    return this._material instanceof PBRBaseMaterial ? pbrFragment() : standardFragment();
  }
}

// ---- texture-array helpers (same file)
export function flipRowsRGBA(data: Uint8Array | Uint8ClampedArray, width: number, height: number): void {
  const stride = width * 4;
  const tmp = new Uint8Array(stride);
  for (let y = 0; y < height >> 1; y++) {
    const a = y * stride;
    const b = (height - 1 - y) * stride;
    tmp.set(data.subarray(a, a + stride));
    data.copyWithin(a, b, b + stride);
    data.set(tmp, b);
  }
}

/** RGBA bytes of a canvas, rows flipped so the canvas top is at v = 1. */
export function canvasToLayer(canvas: HTMLCanvasElement | OffscreenCanvas, flipY = true): Uint8Array {
  const ctx = canvas.getContext("2d") as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const out = new Uint8Array(img.data.buffer.slice(0));
  if (flipY) flipRowsRGBA(out, canvas.width, canvas.height);
  return out;
}

/** Decode a JPG/PNG (url or blob URL) into RGBA bytes (rows flipped so image top is v = 1). */
export async function decodeImageToLayer(url: string, size: number, flipY = true): Promise<Uint8Array> {
  const blob = await (await fetch(url)).blob();
  const bmp = await createImageBitmap(blob, { colorSpaceConversion: "none", premultiplyAlpha: "none" });
  const c = new OffscreenCanvas(size, size);
  const ctx = c.getContext("2d")!;
  ctx.drawImage(bmp, 0, 0, size, size); // resamples if the image is not size x size
  bmp.close();
  return canvasToLayer(c, flipY);
}

/** Build an RGBA8 2D array texture from equally sized layers (row 0 of each layer = v 0). */
export function createTextureArray(
  scene: Scene,
  layers: Uint8Array[],
  size: number,
  opts: { mipmaps?: boolean; samplingMode?: number; anisotropy?: number } = {},
): RawTexture2DArray {
  const layerBytes = size * size * 4;
  const data = new Uint8Array(layerBytes * layers.length);
  layers.forEach((l, i) => {
    if (l.length !== layerBytes) throw new Error(`layer ${i}: expected ${layerBytes} bytes, got ${l.length}`);
    data.set(l, i * layerBytes);
  });
  const mipmaps = opts.mipmaps ?? true;
  const tex = new RawTexture2DArray(
    data,
    size,
    size,
    layers.length,
    Constants.TEXTUREFORMAT_RGBA,
    scene,
    mipmaps,
    false, // invertY: MUST be false for ArrayBufferView uploads to 3D/array textures (flip rows on the CPU instead)
    opts.samplingMode ?? (mipmaps ? Texture.TRILINEAR_SAMPLINGMODE : Texture.BILINEAR_SAMPLINGMODE),
    Constants.TEXTURETYPE_UNSIGNED_BYTE,
  );
  tex.wrapU = Texture.WRAP_ADDRESSMODE; // default already, explicit for clarity
  tex.wrapV = Texture.WRAP_ADDRESSMODE;
  tex.anisotropicFilteringLevel = opts.anisotropy ?? 4; // only applied with TRILINEAR / BILINEAR / LINEAR_LINEAR_MIPNEAREST
  return tex;
}
```
Usage (as run in `render-materials-plugin-pbr.probe.ts`):
```ts
const albedo = createTextureArray(scene, albedoLayers /* Uint8Array[] of 256*256*4 */, 256, { mipmaps: true });
const normal = createTextureArray(scene, normalLayers, 256, { mipmaps: true });
const mat = new PBRMaterial("world", scene);
mat.metallic = 0; mat.roughness = 1;           // non-null => METALLICWORKFLOW (required by the roughness/metal injection)
const plugin = new WorldMaterialPlugin(mat);
plugin.setTextures(albedo, normal);
islandMesh.material = mat; islandMesh.receiveShadows = true; shadowGenerator.addShadowCaster(islandMesh);
// environment for PBR (reflections/IBL): render-once probe of the sky dome only
const probe = new ReflectionProbe("env", 128, scene, true);
probe.renderList!.push(skyDome);                // NOT meshes using `mat` (feedback loop)
probe.refreshRate = RenderTargetTexture.REFRESHRATE_RENDER_ONCE;
scene.environmentTexture = probe.cubeTexture;
```
Notes:
- The material is **not ready** until `albedoArray` is set. That is deliberate: an unbound `sampler2DArray` would read garbage.
- After changing `normalStrength`/`emissiveScale` on a frozen material, `unfreeze()` it, change the value, then `freeze()`.
- Every mesh should carry `surf`. Without it, the `WORLDMAT_SURF` define gives layer 0, flat normal, roughness 1 and no emissive [RT].
- From source (not run): SSAO2's prepass reads `normalW` after the injection, so normal maps also reach the SSAO normals.
- The test scene with shadows and the bloom pipeline cost about 1.5–2.4 ms CPU per frame (contended box).

---

## 5. DynamicTexture / canvas → texture; crisp vs filtered [RT] (`render-materials-dyntex.probe.ts`, screenshot checked)
```ts
new DynamicTexture(name, canvasOrSize: ICanvas | {width, height} | number, scene?, generateMipMaps = false,
                   samplingMode = 3 /*TRILINEAR*/, format = RGBA, invertY?)   // USE THIS positional form
new DynamicTexture(name, size, options: IDynamicTextureOptions)             // ignores samplingMode & mipmaps [RT]!
dt.getContext(): ICanvasRenderingContext   // cast to CanvasRenderingContext2D
dt.update(invertY = true, premulAlpha = false, allowGPUOptimization = false): void   // uploads the canvas (+mips if created with mips)
dt.drawText(text, x, y, font, color, fillColor | null, invertY = true, update = true)
dt.clear(clearColor?); dt.scaleTo(w, h); dt.getContext().canvas
```
- Defaults [RT]: `wrapU/V = CLAMP` (the constructor forces it, so set `WRAP_ADDRESSMODE` for tiling), `noMipmap = true` (generateMipMaps defaults to false), `hasAlpha = false`. With the options object `{ samplingMode: NEAREST, noMipmap: false }` the internal texture still ended up TRILINEAR without mips.
- `update()` with the default `invertY = true` shows the canvas upright on standard builder UVs (canvas top = v 1) [RT].
- Cost: redrawing a 256² canvas plus `update()` with mips ≈ 0.2 ms CPU; `update()` alone ≈ 0.01 ms (CPU side) [RT].
- To feed array layers from a canvas or DynamicTexture, use `UploadImageToTexture2DArrayLayer(arr, dt.getContext().canvas, layer, { invertY: true })` (DOM canvas honours flipY), or `canvasToLayer()` + `createTextureArray()`.
- **PS2 look** (same 64-px brick texture on a receding floor, screenshot compared):
  - `NEAREST` (1): crisp texels, strong moiré at distance.
  - `BILINEAR` without mips (2): shimmering at distance; avoid for world textures.
  - **`LINEAR_LINEAR_MIPNEAREST` (11)**: bilinear with a visible mip band like PS2 hardware, anisotropy allowed. Recommended for the "PS2 mode" quality preset.
  - `TRILINEAR` (3) with aniso 1: blurry far away.
  - **`TRILINEAR` + `anisotropicFilteringLevel = 8`**: sharpest at grazing angles. Recommended default for the world arrays (architecture: "256 px photo textures, bilinear").
  - Pixel-art labels and screens: `NEAREST` or BILINEAR without mips on small, close objects.

---

## 6. InstancedMesh vs thin instances [RT] (`render-materials-instancing.probe.ts`, `render-materials-thinworld.probe.ts`)
```ts
mesh.createInstance(name: string): InstancedMesh;            // full AbstractMesh: own transform, culling, picking, can own a physics body
mesh.registerInstancedBuffer(kind: string, stride: number);  // e.g. (VertexBuffer.ColorKind, 4); also set mesh.instancedBuffers.color
instance.instancedBuffers.color = new Color4(r, g, b, a);    instance.sourceMesh
mesh.thinInstanceSetBuffer(kind: string, buffer: Nullable<Float32Array>, stride?: number, staticBuffer?: boolean /*TRUE*/);
mesh.thinInstanceAdd(matrix | matrix[], refresh = true): number;  thinInstanceSetMatrixAt(i, m, refresh?);
mesh.thinInstanceRegisterAttribute(kind, stride);  thinInstanceSetAttributeAt(kind, i, value[], refresh?);
mesh.thinInstanceBufferUpdated(kind);  mesh.thinInstancePartialBufferUpdate(kind, dataOrLength, offset);
mesh.thinInstanceCount (get/set, <= buffer capacity);  mesh.thinInstanceRefreshBoundingInfo(forceRefreshParentInfo?, ...);
mesh.thinInstanceEnablePicking = true;  mesh.thinInstanceAllowAutomaticStaticBufferRecreation = false (default)
```
- Per-instance colour works for both [RT]. A thin-instance `"color"` buffer is stored as `instanceColor` (`INSTANCESCOLOR` define), and the world material multiplies it into the albedo [RT].
- Picking [RT]: `scene.pick` returns the **InstancedMesh itself** (`pickedMesh instanceof InstancedMesh`). For thin instances you get `pickedMesh` = the host plus `pickInfo.thinInstanceIndex`, only with `thinInstanceEnablePicking = true`.
- **Static thin buffers ignore updates** [RT]: changing the Float32Array and calling `thinInstanceBufferUpdated("matrix")` had no effect until `thinInstanceAllowAutomaticStaticBufferRecreation = true`. That flag re-creates the buffer on every update, so pass `staticBuffer = false` for anything that moves.
- **Bounds** [RT]: a thin instance moved outside the host's old bounding box was culled until `thinInstanceRefreshBoundingInfo(false)`. For micro-debris that roams, either refresh the bounds periodically or set `alwaysSelectAsActiveMesh = true` on the host.
- CPU per frame for 2000 copies (30-vert prism, full resolution, mean, contended):

| | create | static frame | all 2000 moving |
|---|---|---|---|
| InstancedMesh | 74 ms | 7.9 ms (7.1 with `freezeWorldMatrix`) | 14.1 ms |
| thin instances (1 draw) | 11 ms | **0.5 ms** | **0.58 ms** (rewrite + full `thinInstanceBufferUpdated`); 10 via `thinInstancePartialBufferUpdate`: 0.18 ms |
| 2000 unique meshes | 297 ms | ~12 ms (min, §8) / 44 ms (mean here) | |

- **Promote one instance to a unique mesh** [RT, verified position/colour/geometry independence]:
```ts
function promote(inst: InstancedMesh, scene: Scene): Mesh {
  const source = inst.sourceMesh;
  const m = new Mesh(inst.name + "_unique", scene);
  // NOT VertexData.ExtractFromMesh(source): it THROWS on meshes with registerInstancedBuffer("color") [RT]
  VertexData.ExtractFromGeometry(source.geometry!, true, true).applyToMesh(m, true);
  for (const kind of source.geometry!.getVerticesDataKinds()) {          // custom kinds ("surf") are not in VertexData
    if (!m.isVerticesDataPresent(kind)) m.setVerticesData(kind, source.getVerticesData(kind, true, true)!, true, source.getVertexBuffer(kind)!.getSize());
  }
  const c = inst.instancedBuffers.color as Color4 | undefined;          // bake the per-instance colour into vertex colours
  if (c) { const n = m.getTotalVertices(), col = new Float32Array(n * 4); for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b, c.a], i * 4); m.setVerticesData(VertexBuffer.ColorKind, col, true); }
  inst.computeWorldMatrix(true).decompose(m.scaling, (m.rotationQuaternion = new Quaternion()), m.position);
  m.material = source.material; m.parent = inst.parent;
  inst.dispose();
  return m;
}
```
  For a thin instance, read `matrices.subarray(i*16, i*16+16)` with `Matrix.FromArray(...).decompose(...)` and build the mesh the same way. Then remove the instance: copy the last matrix and colour into slot `i`, decrement `thinInstanceCount`, and call `thinInstanceBufferUpdated` (dynamic buffers). `source.clone()` also works but shares the geometry until `makeGeometryUnique()`. The clone did **not** inherit `instancedBuffers.color` [RT].

---

## 7. Merging [RT] (`render-materials-merge.probe.ts`, 48-vertex sources with transforms)
```ts
static MergeMeshes(meshes: Mesh[], disposeSource?: boolean /*true*/, allow32BitsIndices?: boolean, meshSubclass?: Mesh,
                   subdivideWithSubMeshes?: boolean, multiMultiMaterials?: boolean): Nullable<Mesh>;
static MergeMeshesAsync(...same): Promise<any>;
```
- `MergeMeshes` bakes each source's world matrix into the vertices; the result has an **identity** world matrix [RT]. It copies standard kinds via `ExtractFromMesh`, so the custom **`surf` is dropped** [RT]. It returns null with a warning above 65535 vertices unless `allow32BitsIndices = true`, and also refuses differing `sideOrientation` and InstancedMeshes [SRC]. It throws on sources with `registerInstancedBuffer("color")` [RT, via ExtractFromMesh].
- `VertexData.merge(others, use32BitsIndices, ...)`: standard kinds only and **no transforms** (call `vd.transform(matrix)` first). It **throws** "Cannot merge vertex data that do not have the same set of attributes" unless `enableCompletion = true` (5th argument) [RT].
- Cost (CPU ms, contended):

| sources (vertices) | `MergeMeshes` | transform + `VertexData.merge` + apply | manual typed-array concat + apply + `surf` |
|---|---|---|---|
| 200 (9 600) | 51 | 23 | 31 (first call, JIT cold) |
| 2000 (96 000) | 256 (211–1188 in other runs) | 389 | **130** |
- **Recommendation:** the island batcher and the sleeping-debris consolidation should **concatenate typed arrays themselves** (transform positions with `Vector3.TransformCoordinatesToRef` and normals with `TransformNormalToRef`, offset indices, copy uv, colour and surf). Then `applyToMesh` + `setVerticesData("surf")`. That is the only path that keeps `surf`. Do large merges in time-sliced chunks: 96 k vertices took about 130 ms here.

---

## 8. Many-mesh performance [RT] (`render-materials-perf.probe.ts`)
Setup: 2000 unique meshes (48 vertices, 2 boxes) sharing the PBR world material (plugin, 2 arrays), all in view, hemi + directional light, no shadows. `engine.setHardwareScalingLevel(10)` keeps rasterisation negligible, `gl.finish()` runs before each timed batch, the 14 configurations are interleaved over 6 rounds, and 30 samples are taken per config. Values are **per-frame CPU ms, min (p25)** from two runs:

| configuration | min | p25 | active-mesh eval (min) |
|---|---|---|---|
| baseline (defaults) | 12.3–13.2 | 20.7–21.3 | 1.9–2.3 |
| `freezeWorldMatrix()` on all | 10.6 | 13.5–18.8 | 1.9–2.0 |
| `material.freeze()` | **7.6–9.5** | 10.8–15.6 | 2.1–2.3 |
| `isPickable = false` | 10.1–13.3 | 17.5–18.9 | 2.0–2.2 |
| `doNotSyncBoundingInfo = true` | 9.9–10.2 | 15.3–20.4 | 1.8–2.1 |
| `alwaysSelectAsActiveMesh = true` | 8.8–11.2 | 13.1–19.8 | 1.3–1.8 |
| `scene.skipFrustumClipping = true` | 9.4–11.5 | 12.0–13.0 | 1.3–1.8 |
| `scene.blockMaterialDirtyMechanism = true` | 10.6–12.1 | 16.4–18.4 | 2.1–2.2 |
| `performancePriority = Aggressive` + its creation-time mesh flags | 7.5–7.9 | 9.2–13.7 | 1.2–1.4 |
| `scene.freezeActiveMeshes()` | 8.0–8.2 | 10.4–10.6 | **0** |
| COMBINED (freezeWorldMatrix + material.freeze + isPickable=false + doNotSyncBoundingInfo + blockMaterialDirty) | 8.7–9.5 | 10.7–16.0 | 1.9–2.1 |
| COMBINED + `freezeActiveMeshes()` | **6.0–6.3** | 8.9–9.5 | 0 |
| baseline, 200 meshes moving each frame | 11.0 | 12.2–16.3 | 2.2–2.3 |
| COMBINED, 200 moving (movers unfrozen, bounds synced) | 7.5–7.9 | 10.1–11.2 | 2.0–2.1 |
| same 2000 merged into 1 mesh | ≈0.05 | | |

Reading:
- The cost is **per draw call**, about 4–6 µs each here. Culling/evaluation is only about 1 µs per mesh. No flag combination beats roughly 2×.
- Setting `isPickable = false` gains nothing per frame; it only matters for `scene.pick`. Pointer-move picking is lazy in Babylon 9: it runs only with action managers, `constantlyUpdateMeshUnderPointer`, `scene.onPointerMove`, or pointer observers reading `pickInfo` [SRC]. **Pointer-down** picks every pickable mesh when `onPointerObservable` has observers [SRC].
- A mesh created while `performancePriority` is Intermediate/Aggressive gets `isPickable = false` and `alwaysSelectAsActiveMesh = true` (no culling). Aggressive also sets `doNotSyncBoundingInfo = true`. The scene also gets `autoClear = false` (Aggressive adds `skipFrustumClipping`) [RT + SRC]. Changing the priority later does **not** retro-fit existing meshes [SRC].
- `freezeActiveMeshes()` is asynchronous (wait for `onSuccess`). It freezes the active list: **meshes created afterwards are not rendered** and culling stops (unless `keepFrustumCulling`). With `freezeMeshes = true` it also freezes per-mesh instance data and skips side-orientation updates [SRC].
- `material.freeze()` skips define re-evaluation for submeshes that were already ready [SRC]. New meshes still compile. **Light or shadow changes** (bulbs breaking, power off) need `unfreeze()` → render → `freeze()`.

**Recommended settings for ~300–3000 meshes, mostly static or sleeping, some moving:**
1. Minimise draw calls first. Use one mesh per island with the world material, one glass mesh per island, and consolidate sleeping debris per cell with manual concat. Micro-debris goes in one thin-instance host per material (dynamic buffers). Remember that every shadow caster draws again per shadow map or cascade.
2. Static and sleeping islands: `mesh.freezeWorldMatrix()` + `mesh.doNotSyncBoundingInfo = true`. On wake (Havok body active again) or when moved: `unfreezeWorldMatrix()` + `doNotSyncBoundingInfo = false`. A frozen world matrix ignores the position and rotation Havok writes.
3. `worldMaterial.freeze()` once warmed up; unfreeze, change, refreeze around light, shadow or plugin changes.
4. `isPickable = false` on all render meshes if gameplay picking uses Havok raycasts. Set `scene.skipPointerMovePicking = skipPointerDownPicking = skipPointerUpPicking = true` and handle input via DOM events.
5. Keep frustum culling (the default): the FPS camera sees maybe half the meshes, and culling costs about 1 µs per mesh against a 4–6 µs draw. Do **not** set `performancePriority` and do **not** `freezeActiveMeshes` during gameplay. Use the latter only for a paused or photo mode.
6. Set `scene.blockMaterialDirtyMechanism = true` only around bulk creation or teardown (it blocks `markAllMaterialsAsDirty`). It gave no steady-state gain.
7. Use `autoClear = false` only if a sky dome covers every pixel.

---

## 9. Transparent glass [RT] (`render-materials-glass.probe.ts`, 5 zoomed comparison viewports checked)
- Transparent submeshes (`alpha < 1`, alpha blend) are rendered after opaque ones and sorted **per submesh, back-to-front by bounding-sphere centre distance**, with `mesh.alphaIndex` taking priority [SRC `RenderingGroup.defaultTransparentSortCompare`]. Triangle order **inside** one mesh is not sorted.
- `disableDepthWrite` is false by default, so transparent meshes **write depth**. Inside a merged shard mesh, a near shard drawn first hides farther shards drawn later (holes). **`disableDepthWrite = true`** makes all layers blend. That is fine for uniformly tinted glass, since alpha blending of identical colours is order-independent.
- `needDepthPrePass = true`: an extra depth-only pass per mesh, so only the nearest surface of that mesh shows (farther shards of the same mesh vanish). It is useful for complex single objects, not for shard batches.
- `backFaceCulling = false` + `separateCullingPass = true`: two draws (back faces, then front faces), which gives correct intra-object order for closed convex 2-sided objects such as bottles and vases. It renders each thin shard twice, so it is brighter and costs more.
- PBR defaults `useRadianceOverAlpha = useSpecularOverAlpha = true` keep reflections and sun glints bright on low-alpha glass. Fresnel is built in (F0 0.04).
- CPU [RT]: 300 **separate** transparent shard meshes added about **+3–5.5 ms/frame** (min 5.2–8.0 vs 2.0–2.5 baseline) because of sorting plus draws. The same 300 shards in **one** mesh added about 0.
- **Recommended glass material** (low cost, glassy):
```ts
const glass = new PBRMaterial("glass", scene);
glass.albedoColor = new Color3(0.85, 0.95, 0.92);   // slight green tint
glass.alpha = 0.18;                                  // frosted: alpha ~0.5, roughness 0.35-0.5
glass.metallic = 0;
glass.roughness = 0.04;
glass.reflectionTexture = envProbe.cubeTexture;      // or rely on scene.environmentTexture (render-once sky probe)
glass.disableDepthWrite = true;                      // shards in one island mesh all blend, no holes
// backFaceCulling stays true: closed shards show only their front faces (one layer each, cheap)
```
  Make shard **side faces** (the cut edges) opaque `glass_edge` in the world material and only the large caps transparent. That reads as thick glass. Cheaper Standard alternative [RT, looked equivalent]: `StandardMaterial` with `alpha 0.2`, `specularPower 256`, `reflectionTexture = probe.cubeTexture`, `reflectionFresnelParameters = new FresnelParameters({ bias: 0.15, power: 2, leftColor: Color3.White(), rightColor: Color3.Black() })`, `disableDepthWrite = true`.

---

## 10. Pitfalls
1. A raw triangle is front-facing when **CCW on screen**, i.e. `dot(cross(b−a, c−a), outwardNormal) < 0`. CCW-around-normal (right-hand rule) output from math code must be reversed. `VertexData.FRONTSIDE/BACKSIDE` are builder options, not winding.
2. Calling `setVerticesData(customKind, ...)` before positions exist silently drops the data. Babylon's merges and extracts (`MergeMeshes`, `VertexData.merge/ExtractFromMesh/set`) drop custom kinds.
3. `updateVerticesData` on a non-updatable buffer is a silent no-op, and it can't grow a buffer.
4. `VertexData.ExtractFromMesh` (and therefore `MergeMeshes`) **throws** on a mesh with `registerInstancedBuffer("color")`. Use `ExtractFromGeometry(mesh.geometry)`.
5. Plugin `getCustomCode()` runs in the base constructor, so subclass fields are still undefined. Point names are fixed at that moment.
6. Without a built-in texture, `UV1`/`uv` is not declared; set `defines._needUVs = true` in `prepareDefinesBeforeAttributes`. Without `VERTEXALPHA`, `vColor.a` is 1.
7. Declare `uniform highp sampler2DArray`; there is no default precision.
8. The PBR roughness/metal injection point exists only with `METALLICWORKFLOW`: set `metallic` and `roughness` to non-null values.
9. StandardMaterial clamps diffuse+emissive to 1, so add HDR emissive at `CUSTOM_FRAGMENT_BEFORE_FOG`.
10. A missing vertex attribute reads as (0,0,0,1). A mesh without `surf` would get `surf.w = 1` (glow) unless guarded with a define, as the plugin does.
11. `RawTexture2DArray(..., invertY = true)` with data gives GL INVALID_OPERATION and a black texture. ImageBitmap uploads ignore `invertY`, including `CreateTexture2DArrayFromImageUrlsAsync`; use `imageBitmapOptions.imageOrientation = "flipY"`. `updateMipLevel()` errors on WebGL.
12. Each `UploadImageToTexture2DArrayLayer` call regenerates mips for **all** layers; suppress that during batch uploads.
13. `anisotropicFilteringLevel` is forced to 1 unless the sampling mode is TRILINEAR, BILINEAR or LINEAR_LINEAR_MIPNEAREST.
14. The DynamicTexture options-object constructor ignores `samplingMode` and mipmaps. DynamicTexture defaults to CLAMP wrap.
15. Directional shadows: without `autoCalcShadowZBounds` (or `shadowMinZ/MaxZ`) the depth range is the camera's 0.1..10000 and bias values erase the shadows.
16. A `ReflectionProbe` whose renderList contains meshes sampling `scene.environmentTexture` (the probe itself) causes a GL feedback loop.
17. Thin-instance buffers are static by default (updates ignored). Moved thin instances get culled by stale bounds.
18. `performancePriority` Intermediate/Aggressive makes new meshes unpickable and unculled, and turns off `autoClear`. `freezeActiveMeshes()` hides meshes created afterwards.
19. `material.freeze()` keeps stale shaders when lights or shadows change.
20. Transparent meshes write depth by default (holes inside merged shard meshes). Sorting is per mesh only.
21. PBR computes the view vector from the eye position even for orthographic cameras.
22. Mirrored transforms are handled automatically (`frontFace` flips when det < 0). Don't also flip indices.
