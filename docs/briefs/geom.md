# Brief: geometry module (`src/geom/**`, tests `tests/unit/geom-*.test.ts`)

Owner paths: `src/geom/` (except `vec.ts`, which is done — you may add helpers to it but do not
change existing exports), `tests/unit/geom-*.test.ts`, `tests/probes/geom-*.probe.ts`.

Implement every stub in `src/geom/poly.ts`, `src/geom/fracture.ts`, `src/geom/meshgen.ts`,
`src/geom/primitives.ts`, keeping exported signatures and documented semantics exactly. Put
internals in new files (e.g. `hull.ts` quickhull, `clip.ts`, `tess.ts`). PURE TypeScript (no
Babylon imports) — everything must run under `node --test`.

This module is on the critical path: the builder DSL, structure, damage model and destruction
runtime all depend on it. Implement in this order and keep the tree compiling:
1. `poly.ts` basics: `autoUV`, `faceAttr`, `polyBox`, `polyBeveledBox`, `polyCylinder`,
   `polyPrism`, `polyFromHull` (quickhull, coplanar face merging), `polyTransform` (carry UV
   maps: u'/v' rotated, u0'/v0' adjusted so uv stays attached to material points), `polyClip`,
   volume/centroid/bounds/width/extents (principal axes via covariance or inertia tensor
   eigenvectors — small 3x3 Jacobi), signed distance, closest point (point-to-convex: check
   inside; else closest over faces' polygons), `polyPoints`, `polyFaceAreaOnPlane`, `polyClone`.
2. `primitives.ts`: `latheTiles` (each tile = convex hull of its 8 corner points: outer/inner
   surface × 2 angles × 2 profile stations; outer/inner faces carry analytic per-vertex
   normals `vn` for smooth shading; optional bottom cap tiles; partial angular range),
   `torusTiles`, `arcPanelTiles`, `polyEllipsoid`, `polyPillow` (rounded box: hull of
   superellipsoid samples, smooth group), `frameBars` (mitred bars), `slabGrid`.
3. `meshgen.ts`: `polyToRenderGeom` (fan triangulation; flat normals per face unless smoothing
   group / vn; optional tessellation with `tessCell` that is WATERTIGHT across face edges —
   subdivide every polyhedron edge into the same segments for both adjacent faces and
   triangulate each face from its boundary points + interior grid points, e.g. 2D Delaunay
   (Bowyer–Watson) or a robust constrained scheme; dents applied as a continuous displacement
   field so no cracks open; tint darkened near dents by `dentDarken`; crack polylines rendered
   as thin quads offset 0.5 mm along the face normal using `crackSurf`), `mergeRenderGeoms`,
   `applyDents`, `growCracks` (branching random-walk polylines confined to the hit face; radial
   star + concentric ring segments when `radial`).
4. `fracture.ts`: `voronoiFracture` (cell per seed by successive bisector half-space clipping;
   seeds processed by increasing distance with early-out once a seed is farther than twice the
   current cell radius; anisotropic metric M = I − (1 − 1/f²)·a·aᵀ gives bisector normal
   n = M·(s_j − s_i); record which neighbour produced each cut face → neighbours + shared areas;
   interior faces get `interiorAttr` with auto planar UV (u along `grain` when given); drop cells
   below `minVolume`; volumes must sum to the input), `generateSeeds` for every `SeedPattern`
   exactly as documented (radial glass web: 6–12 rays in the pane plane, geometric radii with
   jitter, a few far seeds; dice: jittered grid of `cell`; chunks; splinter: ellipsoid stretched
   along grain; crumble: many small near + medium; crack: few across the part). All seeds
   must lie inside the poly (reject/resample or clamp to slightly inside).

Triangle winding: `RenderGeom` triangles must be front-facing for Babylon with default
`backFaceCulling` — the render notes (`docs/api-notes/rendering-materials-geometry.md`, being
written concurrently) document which winding Babylon expects; also verify yourself with a
probe that renders a meshgen cube (VertexData from your RenderGeom) and a screenshot. Document
the convention at the top of `meshgen.ts`.

Robustness requirements: scale-aware epsilons (parts range from 2 mm buttons to 5 m slabs),
weld near-duplicate vertices after clipping, remove degenerate faces/edges, keep faces convex
and CCW-from-outside with unit normals and consistent plane offsets, never return NaN. Clipping
exactly through vertices/edges and seeds on faces must work.

Performance targets (measure in tests and report): `voronoiFracture` of a box with 30 seeds
< 5 ms; 300-seed dice < 60 ms; `polyToRenderGeom` of a 0.4 m panel with tessCell 0.04 < 1 ms;
`latheTiles` 24×8 < 3 ms.

Unit tests (`tests/unit/geom-*.test.ts`): volumes of boxes/cylinders/prisms vs analytic;
clip + complementary clip conserve volume; Voronoi volume sum = input, neighbour symmetry,
areas symmetric; all seeds inside; hull contains all input points and is convex; transform
preserves volume and keeps uv attached (uv of a transformed point = uv of the original point);
meshgen watertight (after position welding every edge shared by exactly 2 triangles) with and
without tessellation and dents; outward normals; latheTiles tiles convex and fused grid
touching; growCracks points lie on the face; determinism with a fixed Rng seed.
