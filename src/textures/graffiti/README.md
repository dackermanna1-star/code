# Procedural graffiti / paint layers

Generates the paint layer of alley walls and props as wall-space canvases: tags,
throw-ups, pieces, roller/extinguisher letters, buffs, stickers, wheat-paste posters,
marker scribbles and an optional ghost sign, accumulated over several "eras" of
painting, weathering and buffing. Canvas 2D only, no network assets, deterministic
from the seed (internal seeded PRNG; `Math.random` is never used), and resolution
independent: the same seed gives the same layout at any `pxPerMeter`.

## API (`src/textures/graffiti/index.js`)

```js
import {
  generateWallPaint, generateWallPaintAsync,
  generatePropPaint, generatePropPaintAsync,
  generatePaintBatch, generatePaintBatchParallel,
  yieldToMain, setCanvasFactory, clearScratchPool, getWriterNames,
} from './textures/graffiti/index.js';

const { color, props, colorImage, propsImage, stats } = generateWallPaint({
  seed: 'alley-left-3',
  widthM: 32, heightM: 12, pxPerMeter: 48,   // -> 1536 x 576 px
  wallTone: [160, 134, 98],                  // average brick sRGB; buffs are tinted from it
  density: 0.85,                             // 0..1 overall
  bands: [{ y0: 0, y1: 3.6, density: 1 }, { y0: 3.6, y1: 8, density: 0.22 }],
  hotspots: [{ x: 6, y: 1.2, r: 1.5, density: 1 }],          // doors, fire-escape landings, roofline spots
  holes: [{ x: 5, y: 0, w: 1, h: 2.15, kind: 'door' },        // 'window'|'glass'|'vent'|'meter' stay unpainted,
          { x: 11, y: 4.2, w: 1.1, h: 1.7, kind: 'window' }], // 'door'|'shutter' get tagged heavily
  occluders: [{ x: 13, w: 1.9, h: 1.25 }],   // optional: dumpsters/bins against the wall (little paint
                                             // behind them, extra paint just above where writers stand)
  groundLine: 0,
  ageYears: 16,                              // fading strength and number of eras (2..5)
  style: { pieces: 1, throwups: 1, tags: 1, buffs: 1, posters: 0.6, stickers: 1, rollers: 0.6, scribbles: 1, ghostSign: true },
  poolSeed: 'alley',                         // optional: writer population shared by all surfaces
  canvases: true,                            // optional: false skips the two output canvases (ImageData only)
});

const dumpster = generatePropPaint({
  seed: 7, kind: 'dumpster',                 // 'dumpster'|'door'|'box'|'pole'|'fence'|'shutter'
  widthM: 1.85, heightM: 1.25, pxPerMeter: 64, density: 0.7,
  baseTone: [58, 66, 60],                    // optional: surface color (tints paint-outs)
  ageYears: 6,                               // optional
});
```

Coordinates: x = meters from the wall's left edge (facing the wall); all spec y
values (bands, hotspots, holes) are meters from the segment's bottom edge, which
equals "meters above ground" when `groundLine` is 0. `groundLine` is the ground's y
in the same coordinates (e.g. `-4` for a segment whose bottom edge is 4 m above the
street); reach-dependent behavior (tag heights, buffs, heaven spots, splash-zone
weathering) uses the height above that ground. `occluders` give x/width in segment
coordinates and `h` as the object's height above the ground. Canvas x = x *
pxPerMeter, canvas y = (heightM - y) * pxPerMeter (row 0 = top of the segment).
For `kind: 'pole'` the surface is the unrolled pole (width = circumference) and all
content wraps seamlessly across the left/right edges.

### Outputs

| field | content |
|---|---|
| `color` | canvas (OffscreenCanvas when available). RGB = paint color (sRGB), A = paint coverage (0 = bare wall). |
| `props` | canvas. R = metallic (chrome/silver ~200-230, else 0), G = gloss (fresh spray ~150, marker ~120, roller/brush paint 55-95, old chalky paint ~40, paper ~10), B = paper/sticker mask (255 on posters/stickers), A = 255 wherever paint exists. |
| `colorImage`, `propsImage` | the same data as `ImageData` (straight alpha). In `colorImage` the RGB of transparent and nearly transparent texels is filled by a pull-push pass with nearby paint colors, so linear filtering and mipmaps produce no dark fringes. A canvas cannot keep that (it stores premultiplied pixels and loses RGB where A = 0). |
| `stats` | `{ ms, width, height, eras, counts, coverage, writers, timings }` |

Uploading (three.js):

* **Recommended, straight alpha:**
  `new THREE.DataTexture(new Uint8Array(colorImage.data.buffer), w, h)` with
  `colorSpace = SRGBColorSpace`, `generateMipmaps = true`,
  `minFilter = LinearMipmapLinearFilter`, `magFilter = LinearFilter`,
  `needsUpdate = true`. Row 0 of the data is the TOP of the wall and DataTextures
  are not flipped by default, so either set `texture.flipY = true` (2D textures) or
  use `v' = 1 - v` in the shader. The shader formula from the brief applies
  unchanged: `albedo = mix(brick, paint.rgb, paint.a * coverageNoise)`. Same for
  `propsImage` (linear color space).
* **CanvasTexture:** use `texture.premultiplyAlpha = true` (the browser then
  uploads the canvas's premultiplied pixels without loss) and blend premultiplied:
  `albedo = brick * (1.0 - paint.a * n) + paint.rgb * n`.
* Props: sample with the same UVs (linear). Paper (`props.b`) bridges mortar
  joints, so the shader should not thin paper in the grooves and may skip the
  per-voxel coverage noise there.

### Time slicing and workers

`generateWallPaint` / `generatePropPaint` are synchronous. The `*Async` variants
run the same work as a generator that yields to the event loop (fresh macrotask via
`MessageChannel`) whenever ~12 ms have passed; generation is sliced per element,
so the longest main-thread block is roughly one raster flush / aging pass
(~50-100 ms on a slow CPU). `generatePaintBatch([{ type: 'wall' | 'prop', spec }],
{ onProgress })` does a list of surfaces and yields between them.

`generatePaintBatchParallel(jobs, { workers, canvases, onProgress })` runs the
surfaces in module Web Workers (`new Worker(new URL('./worker.js', import.meta.url),
{ type: 'module' })`, which Vite bundles) and transfers the pixels back; canvases
are created on the main thread. If workers or OffscreenCanvas are unavailable, or a
worker cannot start (e.g. a single-file build that drops the worker chunk), it falls
back to `generatePaintBatch`. All paths give bit-identical results for the same
spec (verified by the test page).

`setCanvasFactory((w, h) => canvas)` overrides canvas creation (e.g. to force DOM
canvases). `clearScratchPool()` frees cached scratch canvases.

## Design

* **Stroke font** (`font/glyphs.js`): hand-authored skeletons for A-Z, 0-9 and
  punctuation in a unit box, written in pen order, with 2-4 handstyle variants per
  letter (pointed/flat-top/"4" A, epsilon E, lightning S, kicked K/R, rounded M...)
  and symbols (arrows, stars, crowns, halos, hearts, sparks, bolts). Variant 0 is
  the construction skeleton used for bubble letters, block pieces, rollers and the
  ghost sign; it also carries `cut` (notch) and `hole` (counter slit) lines used
  when letters are rendered fat.
* **Writers** (`world/writers.js`): a shared, seeded population (~55 invented names
  plus crews, blocklisted against real famous writers, brands and offensive
  strings). Each writer has a consistent handstyle (family caps/flow/wild/round/
  scrawl, slant, proportions, per-letter variants, connections, exaggerated
  first/last letters, swooshes, crowns/halos/arrows, crew and number suffixes), a
  preferred tool (spray, marker, mop, fat cap) and colors, and optionally a throw-up
  and piece style. The same names recur across segments and props.
* **Spray rendering** (`paint/spray.js`): strokes become variable-width polygons
  (pressure: wider and denser where the hand slows down, tapered flicks), with
  overspray halo, edge fuzz, start/end blobs, speckle (only where it resolves) and
  downward drips ending in a bulb. Markers are crisp; mops drip a lot.
* **Fat letters** (`elements/fatletter.js`): one scratch canvas per letter so each
  letter's outline cuts over the previous letter's fill. Throw-ups: fill overspray,
  optional second outline/drop shadow, outline ring, interior cleared, streaky
  quick-fill pattern composited behind, shines, notches and counter slits. Pieces:
  gradient fades plus textures (bubbles, stripes, cracks, dots), 3D extrusion with
  outline, outer outline, clouds/bubbles/panel backgrounds, highlight ticks and
  sparkles.
* **Other elements**: roller letters (ragged bands, streaks, lots of runs) and
  extinguisher tags; buffs (roller passes with ragged tops and lap marks, brushed
  paint-out rectangles, spray scribble buffs; colors derived from the wall tone:
  brick-red, greys, beige, tan, brown, off-white, with several shades per
  campaign); stickers (name labels with marker tags, printed and shipping-label
  styles, peeled corners, torn residue); wheat-paste posters (grids of repeats,
  several layers, torn remnants with white paper rims, fake text bars only) and
  stapled flyers; marker scrawl, doodles, tally marks, dates, scratches; the ghost
  sign (invented business name in sign-painter lettering, decades old).
* **Placement** (`world/compose.js`): weight maps on a 20 cm grid from per-type
  height profiles (reach band, ladder height, roofline "heaven" spots), the
  caller's bands and hotspots, door/shutter attraction, forbidden holes and
  slowly varying busy/quiet stretches. Tags attract tags (heat map), fresh buffs
  attract new paint, pieces get some respect in their own era, spot buffs only
  where a buffer can reach.
* **Eras** (2-5 from `ageYears`): each era is painted on a transparent layer (buffs
  first, then a time-sorted mix of everything else), read back, aged and
  composited over the older eras in float accumulators. Aging: chroma loss and
  slight lifting of blacks, wall tint, grime near the ground and along water
  runs, thinning, and erosion (paint chips off where a weathering field - noise +
  ground splash zone + water streaks below sills and the roofline + chip grain -
  exceeds an age-dependent threshold; paper erodes much faster). Gloss and
  metalness decay with age. Old paint shows through semi-opaque buffs.
* **Output**: forbidden holes cleared, pull-push color bleed for transparent
  texels, props assembled (explicit materials where drawn, default spray paint
  elsewhere).

## Performance notes

All canvases are CPU-backed (`willReadFrequently`) because every era is read
back. Chrome records 2D commands and rasterizes lazily, so raster cost shows up at
`getImageData`; the generator flushes periodically to keep time slices short.
Scratch canvases are pooled in tight size classes (Chrome's `drawImage` copies the
whole source canvas), fat letters use one scratch each, soft halos use bevel
joins, old-era tags use a cheaper LOD, the props layer is drawn at half resolution
and only for non-default materials, only the bands an era touched are read back,
per-pixel aging works on reused float buffers, and the color bleed is a half-res
pull-push.

Measured with `tools/graffiti-test.html?mode=suite` in headless Chromium on the
development VM (4 shared vCPUs, load average 4-5 from other jobs; a plain JS
`for` loop of 2e8 float adds takes ~1.7 s there, several times slower than a
desktop CPU):

| | time |
|---|---|
| 32 x 12 m wall at 48 px/m (1536 x 576), warm | ~290-530 ms (~420-445 ms at load ~2) |
| 24 x 9 m wall (1152 x 432), warm | ~200-380 ms |
| prop surfaces at 64 px/m | 2-60 ms each |
| 12 walls + 10 props, sync / async / 4 workers | ~5.0-5.6 s / ~4.5-5.0 s / ~3.8 s |

The first surface also pays one-time JIT warm-up and cache fills (~0.4-0.5 s).
On a typical desktop CPU expect roughly a third of these numbers. Lower
`pxPerMeter`, `density` or `ageYears` (fewer eras) to trade detail for time.

## Test page

`npx vite --port 5174` then open `/tools/graffiti-test.html` with `?mode=`:
`suite` (12 walls + 10 props: sync/async/worker timings, determinism check,
composites), `wall&seg=A|B|S`, `crop&seg=A&cx=..&cy=..&cw=..&ch=..&dppm=..`,
`props`, `pole` (unrolled pole tiled twice to check the wrap), `alley`
(perspective view of two walls), `det` (determinism), `edge` (edge cases),
`glyphs`, `tags`, `throws`, `pieces`. Add `&grade=1` for a blue-hour photo grade,
`&ppm=` to change resolution, `&seed=` for other seeds, `&layers=1` (wall mode) to
show the raw color and props layers, `&style={...}` to override style weights.
The composite mimics the game shader: bricks 19 x 5.4 cm with 1.35 cm mortar,
`mix(brick, paint.rgb, paint.a * voxelNoise)` with paint thinned in mortar joints
except on paper.
