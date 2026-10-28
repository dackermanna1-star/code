# Brief: apartment structure (`src/world/structure*.ts` and `src/world/structure/**`)

Owner paths: `src/world/structure.ts`, `src/world/structure/**`, `tests/unit/structure-*.test.ts`,
`tests/probes/structure-*.probe.ts`. You may refine data in `src/world/plan.ts` (keep exports).
PURE TypeScript for the builders (no Babylon). Uses the builder DSL (`src/objects/lib/builder.ts`,
kit in `src/objects/lib/kit.ts` — both being written concurrently by the builder agent; geometry
is also concurrent: code against contracts, poll before testing).

Export `buildStructure(): Array<{ def: AssemblyDef; xf: Xform }>` producing every structural
assembly of the apartment from `plan.ts`, in world coordinates (identity `xf` with parts placed
in world space is fine, or local parts + xf). Also export metadata other systems need:
`OPENINGS` (doors/windows with world rectangles, for audio occlusion/light shafts) and
`WALL_SEGMENTS` (for sound occlusion), if not trivially derivable from plan.ts.

Construction (real building practice, everything destructible):
- Concrete shell: exterior + party walls (0.2 m) as grids of large concrete cells (~0.6–1.0 m)
  bonded `fused` to each other and `world` (cast-in-place), so sledgehammers chip craters and
  enough work bores holes; window/door openings cut out (cells around openings). Interior face
  finished with paint (room tint) — model as a thin skim/drywall-on-furring layer (gypsum
  sheets glued/screwed to the concrete cells) so punches dent the finish but not the concrete.
  Floor slab top (finish sits on it) and ceiling slab: concrete cells, world-anchored; the floor
  slab need only be chippable (keep cells large).
- Partitions (drywall + studs): pine studs 38×89 mm @ 400 mm with bottom/top plates (plates
  world-anchored to slab/ceiling with nails/powder-actuated fasteners), king/jack studs and a
  header over each door opening, 12.5 mm gypsum sheets (≤1.2 m wide, full height in 1–2 pieces)
  on both faces screwed to every stud they cross (bond per sheet–stud pair, strength from screw
  count ≈ height/0.3), `supported: true`; batt insulation (soft) between studs in insulated walls;
  electrical: boxes + outlets at 0.3 m and switches at 1.1 m next to door openings (plastic plates
  tagged `switch:<roomId>` / `outlet`, `sparks` feature) with copper cables running up the studs;
  plumbing in `plumbing` walls (copper supply pipes + PVC drain, `water` features with mains
  pressure, positioned where fixtures are: bathroom vanity on p_bath_utility, washer/water heater
  on the utility side, kitchen sink supply on p_utility_kitchen near the north end).
- Floors: oak laminate planks (1.2 × 0.19 × 0.012 m, staggered, `friction`/weak `glue` click
  bonds + world bond to slab — pry-able with a crowbar), porcelain tiles 0.3 × 0.3 × 0.01 on
  `mortar` with a grout bed part below the gaps, carpet in bed2 (large soft slabs over underlay),
  baseboards (MDF 0.09 × 0.012, nailed to studs/walls), thresholds between tile and laminate.
- Ceilings: 12.5 mm gypsum sheets screwed to furring channels (steelSheet strips) hung from the
  ceiling slab (world); light fixture junction boxes at plan light positions (the fixtures
  themselves are furniture). Keep part counts sane (sheets ~1.2 × 2.4 m).
- Wet rooms: glazed wall tiles (0.15 m) on mortar up to `wallTiles` height in the bathroom
  (full height around the tub area: x 0..1.7, z 8.05..8.8) and a kitchen backsplash band
  (0.9–1.5 m height along the north wall x 4.0–8.4).
- Openings: door frames (pine jambs + MDF casings) for every `door`, interior doors =
  hollow-core (HDF skins, stiles/rails, honeycomb strips, lever handle + latch) on 3 hinges with
  a latch (use kit.hingedDoorPanel when available), swinging into `into` with hinge side `hinge`;
  front door: solid core (hardwood/mdf, ~35 kg), deadbolt (strong latch ~400 J), peephole
  (glass), 3 heavy hinges; `opening` = cased archway; windows: aluminium frames, double glazing
  (two annealed 4 mm panes with a spacer, weakly bonded to the frame), marble sill inside, one
  openable casement sash (hinge) per window where sensible; balcony sliding door: aluminium frame,
  fixed tempered panel + sliding tempered panel on a `slider` joint with a latch.
- Balcony: concrete slab (world), tempered glass railing panels clipped into aluminium posts and
  a handrail at 1.05 m, drain.
- Material/colour: paint tint per room (`paint`), ceilings white, concrete exterior faces raw.

Part budget: aim for roughly 2,500–5,000 parts for the whole structure (tiles and planks are many
but simple boxes). Group assemblies sensibly (one per wall segment, per floor finish per room,
per ceiling per room, per opening (frame+door), per window, balcony) so damage stays local.

Tests: buildStructure() runs, every def validates, total part count and mass reported, no NaN,
openings free of studs/sheets (a ray through each door opening hits no structural part),
every room enclosed (sample points near walls are covered), floor finishes cover each room's
footprint (sample grid), and a probe (once render + destruction runtime exist) that spawns the
structure and screenshots several rooms.

## Addendum (orchestrator) — reference levels other agents rely on
- The FINISHED floor surface is exactly y = 0 everywhere indoors: floor finishes occupy
  y ∈ [−t, 0] (laminate t = 0.012, tile + mortar ≈ 0.02, carpet ≈ 0.012), the concrete slab is
  below them. The balcony slab top is y = −0.02 (a small step down). Furniture is placed with its
  base at y = 0.
- The finished ceiling surface is exactly y = CEILING_H (2.7): ceiling sheets occupy
  y ∈ [2.7, 2.7125], furring above, slab above that.
- Wall faces: partition finished faces at centre line ± PARTITION_T/2 (±0.0575). Concrete walls'
  finished interior faces stay ON the plan boundary (e.g. z = 8.8 for the north wall): put the
  gypsum finish layer INSIDE the concrete thickness envelope (e.g. concrete cells from z = 8.8125
  to 9.0 and a 12.5 mm finish sheet z ∈ [8.8, 8.8125]), so rooms keep their plan dimensions.
- Export these as constants from `src/world/structure/levels.ts` (FLOOR_Y, CEILING_Y,
  WALL_FINISH_T, …) for the furnishing agents.
